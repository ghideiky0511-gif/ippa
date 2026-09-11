"use client";

import { useEffect, useRef, useState } from "react";
import Link from "@/components/TenantLink";
import { Button } from "@/components/ui/button";
import { HubHeader } from "@/workspace/components/shared/HubHeader";
import { fetchUsers } from "@/workspace/lib/usersClient";
import type { AdminUser } from "@/domain/clients/types";
import {
    associateWhatsAppSenderProfile,
    enableWhatsAppPaymentsCapability,
    ensureWhatsAppInstallation,
    fetchTenantWhatsAppConnectionStatuses,
    fetchTenantWhatsAppPhoneHealth,
    fetchWhatsAppConnections,
    fetchWhatsAppOnboardingAttemptStatus,
    isTrustedMessagingEvent,
    onboardingOriginFromConnectUrl,
    startWhatsAppOnboardingAttempt,
    type TenantWhatsAppConnectionStatus,
    type TenantWhatsAppPhoneHealth,
    type WhatsAppConnectionOption,
    type WhatsAppOnboardingAttemptStatusValue,
} from "@/workspace/lib/whatsappIntegrationClient";
import { IntegrationRulesCard } from "./IntegrationRulesCard";

// Espelha MercadoPagoIntegrationApp.tsx na estrutura (HubHeader,
// IntegrationRulesCard), mas o fluxo de conexão é diferente: em vez de
// navegação completa do browser para uma URL hospedada, aqui é um popup +
// postMessage (Embedded Signup mediado pelo bippa-messaging) -- por isso a
// validação de origem/fonte é a parte mais sensível deste arquivo (ver
// isTrustedMessagingEvent).
//
// O postMessage é só um atalho de UX -- a fonte de verdade é sempre a
// reconciliação pelo backend do Catálogo via `attempt_id`
// (fetchWhatsAppOnboardingAttemptStatus), consultada em polling. Isso cobre
// o caso do evento se perder ou o popup fechar antes de avisar: o polling
// continua até um estado final ou `expires_at`, e persiste o `attempt_id`
// no backend (whatsapp_onboarding_attempts) para que um refresh de página
// retome de onde parou -- ver `resumePendingAttempt` no useEffect de
// carregamento.
//
// Cada VENDEDORA tem seu próprio número -- esta tela lista as vendedoras da
// loja e o status de conexão de cada uma; é a administradora quem conecta em
// nome de cada uma (confirmado com o usuário), não a própria vendedora. Só
// UMA vendedora por vez pode estar em onboarding (o popup é modal por
// natureza) -- por isso o estado de conexão em curso é global, não por
// vendedora.

type Status =
    | "disconnected"
    | "connecting"
    | "processing"
    | "connected"
    | "error"
    | "expired";

const POPUP_FEATURES = "popup,width=620,height=760";
// O contrato do bippa-messaging não confirma que `bippa.meta.onboarding.loaded`
// sempre é emitido -- por isso a mensagem de início também é mandada por
// este timeout, caso o popup nunca sinalize "pronto".
const READY_FALLBACK_MS = 4_000;
const POLL_INTERVAL_OPEN_MS = 2_000;
const POLL_INTERVAL_CLOSED_MS = 5_000;
const POLL_JITTER_RATIO = 0.2;
// Margem além de `expires_at` antes de desistir localmente do polling caso o
// backend nunca responda com um estado final -- rede de segurança, não o
// mecanismo normal de expiração (esse é decidido pelo backend a partir de
// `expires_at`, ver whatsappOnboardingService.reconcileWhatsAppOnboardingAttempt).
const EXPIRY_GRACE_MS = 30_000;

function jitteredDelay(baseMs: number): number {
    return baseMs + baseMs * POLL_JITTER_RATIO * Math.random();
}

function isAttemptPastGrace(expiresAtMs: number): boolean {
    return Date.now() > expiresAtMs + EXPIRY_GRACE_MS;
}

function formatMessagingLimit(limit: string | null): string {
    const labels: Record<string, string> = { TIER_250: "250/dia", TIER_1K: "1 mil/dia", TIER_10K: "10 mil/dia", TIER_100K: "100 mil/dia", TIER_UNLIMITED: "Ilimitado" };
    return limit ? (labels[limit] ?? limit.replace(/^TIER_/, "")) : "Não informado";
}

function formatQuality(quality: string | null): string {
    const labels: Record<string, string> = { GREEN: "Boa", YELLOW: "Média", RED: "Baixa", UNKNOWN: "Não informada" };
    return quality ? (labels[quality] ?? quality) : "Não informada";
}

function formatNameStatus(status: string | null): string {
    const labels: Record<string, string> = { APPROVED: "Aprovado", PENDING_REVIEW: "Em análise", DECLINED: "Reprovado", AVAILABLE_WITHOUT_REVIEW: "Sem revisão" };
    return status ? (labels[status] ?? status) : "Não informado";
}

function formatSendingHealth(status: string | null): string {
    const labels: Record<string, string> = {
        AVAILABLE: "Pronto para enviar",
        LIMITED: "Envio limitado",
        BLOCKED: "Envio bloqueado",
    };
    return status ? (labels[status] ?? status) : "Ainda não verificado";
}

function healthIssueText(phone: TenantWhatsAppPhoneHealth): string | null {
    const error = phone.healthIssues.flatMap((issue) => issue.errors)[0];
    if (!error) return null;
    return error.possibleSolution ?? error.message;
}

export default function WhatsAppIntegrationApp() {
    const [sellers, setSellers] = useState<AdminUser[]>([]);
    const [connectionsBySeller, setConnectionsBySeller] = useState<
        Record<string, TenantWhatsAppConnectionStatus>
    >({});
    const [phones, setPhones] = useState<TenantWhatsAppPhoneHealth[]>([]);
    const [refreshingPhones, setRefreshingPhones] = useState(false);
    const [phoneHealthError, setPhoneHealthError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);

    // Estado do fluxo de onboarding em curso -- só UMA vendedora por vez.
    const [activeSellerId, setActiveSellerId] = useState<string | null>(null);
    const [status, setStatus] = useState<Status>("disconnected");
    const [pending, setPending] = useState(false);
    const [phoneOptions, setPhoneOptions] = useState<
        WhatsAppConnectionOption[]
    >([]);
    const [associatingPhoneId, setAssociatingPhoneId] = useState<string | null>(
        null,
    );

    // Mensagem de status por vendedora -- cobre tanto o fluxo de onboarding
    // (activeSellerId) quanto a ação independente "Verificar conexão", que
    // pode rodar para uma vendedora diferente da que está em onboarding.
    const [messageSellerId, setMessageSellerId] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const [messageIsError, setMessageIsError] = useState(false);
    const [verifyingSellerId, setVerifyingSellerId] = useState<string | null>(
        null,
    );
    const [enablingPaymentsSellerId, setEnablingPaymentsSellerId] = useState<string | null>(null);
    const [paymentCapabilityReason, setPaymentCapabilityReason] = useState("");
    const [savingPaymentsCapability, setSavingPaymentsCapability] = useState(false);

    function showMessage(
        sellerId: string,
        text: string | null,
        isError = false,
    ) {
        setMessageSellerId(sellerId);
        setMessage(text);
        setMessageIsError(isError);
    }

    // Identidade da tentativa em curso -- tudo em ref porque é lido dentro de
    // callbacks assíncronos (listener de message, polling recursivo) que não
    // devem operar sobre um closure desatualizado.
    const attemptIdRef = useRef<string | null>(null);
    const expiresAtMsRef = useRef<number | null>(null);
    const popupRef = useRef<Window | null>(null);
    const listenerRef = useRef<((event: MessageEvent) => void) | null>(null);
    const readyFallbackTimerRef = useRef<number | null>(null);
    const pollTimerRef = useRef<number | null>(null);
    const startSentRef = useRef(false);

    async function refresh() {
        setLoading(true);
        setLoadError(null);
        try {
            const [users, statuses, phoneHealth] = await Promise.all([
                fetchUsers(),
                fetchTenantWhatsAppConnectionStatuses(),
                fetchTenantWhatsAppPhoneHealth().catch((error) => {
                    setPhoneHealthError(
                        error instanceof Error
                            ? error.message
                            : "Não foi possível carregar os dados da Meta.",
                    );
                    return [];
                }),
            ]);
            setSellers(users.filter((u) => u.role === "vendedora"));
            setConnectionsBySeller(
                Object.fromEntries(statuses.map((s) => [s.sellerId, s])),
            );
            setPhones(phoneHealth);
            resumePendingAttempt(statuses);
        } catch (error) {
            setLoadError(
                error instanceof Error
                    ? error.message
                    : "Não foi possível carregar a integração do WhatsApp.",
            );
        } finally {
            setLoading(false);
        }
    }

    async function refreshPhoneHealth() {
        setRefreshingPhones(true);
        setPhoneHealthError(null);
        try {
            setPhones(await fetchTenantWhatsAppPhoneHealth(true));
        } catch (error) {
            setPhoneHealthError(error instanceof Error ? error.message : "Não foi possível atualizar os números de WhatsApp.");
        } finally {
            setRefreshingPhones(false);
        }
    }

    // Depois de um refresh de página, o popup e o `connectUrl` da tentativa
    // anterior estão perdidos -- mas o `attempt_id` persistido no backend
    // (devolvido aqui em `pendingAttemptId`) é suficiente para retomar só o
    // polling de reconciliação, sem reabrir o popup. Só a tentativa mais
    // recente é retomada -- o desenho já assume no máximo uma vendedora em
    // onboarding por vez.
    function resumePendingAttempt(statuses: TenantWhatsAppConnectionStatus[]) {
        if (attemptIdRef.current) return; // já há uma tentativa ativa nesta sessão do componente
        const pending = statuses
            .filter((s) => s.pendingAttemptId && s.pendingExpiresAt)
            .sort(
                (a, b) =>
                    new Date(b.pendingExpiresAt!).getTime() -
                    new Date(a.pendingExpiresAt!).getTime(),
            )[0];
        if (!pending || !pending.pendingAttemptId || !pending.pendingExpiresAt)
            return;

        setActiveSellerId(pending.sellerId);
        setStatus("connecting");
        setPending(true);
        attemptIdRef.current = pending.pendingAttemptId;
        expiresAtMsRef.current = new Date(pending.pendingExpiresAt).getTime();
        // Sem popup nem connectUrl depois do refresh -- só o polling continua.
        popupRef.current = null;
        schedulePoll(pending.pendingAttemptId, pending.sellerId, 0);
    }

    function teardownOnboardingListeners() {
        if (listenerRef.current) {
            window.removeEventListener("message", listenerRef.current);
            listenerRef.current = null;
        }
        if (readyFallbackTimerRef.current !== null) {
            window.clearTimeout(readyFallbackTimerRef.current);
            readyFallbackTimerRef.current = null;
        }
        if (pollTimerRef.current !== null) {
            window.clearTimeout(pollTimerRef.current);
            pollTimerRef.current = null;
        }
    }

    useEffect(() => {
        // Dispara depois do primeiro paint -- mesmo padrão de
        // MercadoPagoIntegrationApp.tsx, evita setState síncrono dentro do
        // corpo do efeito (cascading renders).
        const timer = window.setTimeout(() => void refresh(), 0);
        return () => {
            window.clearTimeout(timer);
            teardownOnboardingListeners();
            popupRef.current?.close();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Consulta a rota de status do backend do Catálogo (reconciliação real) e
    // aplica o resultado -- chamada tanto pelo polling recursivo quanto uma
    // vez, imediatamente, quando o popup avisa `completed`/`failed` (o evento
    // só antecipa esta chamada, nunca substitui).
    async function reconcileAttempt(
        attemptId: string,
        sellerId: string,
    ): Promise<WhatsAppOnboardingAttemptStatusValue | null> {
        try {
            const result =
                await fetchWhatsAppOnboardingAttemptStatus(attemptId);
            // Resposta de uma tentativa que já foi superada (nova tentativa
            // iniciada, ou cancelada) -- descarta.
            if (attemptIdRef.current !== attemptId) return null;

            if (result.status === "completed") {
                popupRef.current?.close();
                teardownOnboardingListeners();
                setStatus("disconnected");
                try {
                    const connections =
                        await fetchWhatsAppConnections(sellerId);
                    if (attemptIdRef.current !== attemptId)
                        return result.status;
                    setPhoneOptions(connections);
                    setStatus(
                        connections.length > 0 ? "disconnected" : "error",
                    );
                    showMessage(
                        sellerId,
                        connections.length > 0
                            ? "Conexão concluída. Escolha o telefone que representa esta vendedora para finalizar."
                            : "A conexão foi concluída, mas nenhum telefone foi encontrado nesta conta.",
                        connections.length === 0,
                    );
                } catch (error) {
                    setStatus("error");
                    showMessage(
                        sellerId,
                        error instanceof Error
                            ? error.message
                            : "Não foi possível listar os telefones conectados.",
                        true,
                    );
                } finally {
                    setPending(false);
                }
                return result.status;
            }

            if (result.status === "failed") {
                popupRef.current?.close();
                teardownOnboardingListeners();
                setStatus("error");
                // Mensagem fixa e segura -- `errorMessage` vem do bippa-messaging e
                // pode conter detalhe técnico não redigido para o usuário final.
                showMessage(
                    sellerId,
                    "Não foi possível concluir a conexão com o WhatsApp. Tente novamente.",
                    true,
                );
                setPending(false);
                return result.status;
            }

            if (result.status === "expired") {
                popupRef.current?.close();
                teardownOnboardingListeners();
                setStatus("expired");
                showMessage(
                    sellerId,
                    'Esta tentativa de conexão expirou. Clique em "Conectar WhatsApp" para tentar novamente.',
                    true,
                );
                setPending(false);
                return result.status;
            }

            // pending/processing -- segue em onboarding.
            setStatus(
                result.status === "processing" ? "processing" : "connecting",
            );
            return result.status;
        } catch {
            // Falha de rede/5xx na consulta: mantém o estado anterior e deixa o
            // polling tentar de novo com backoff -- nunca assume falha definitiva
            // a partir de um erro de transporte.
            return null;
        }
    }

    function schedulePoll(
        attemptId: string,
        sellerId: string,
        delayMs: number,
    ) {
        if (pollTimerRef.current !== null) {
            window.clearTimeout(pollTimerRef.current);
        }
        pollTimerRef.current = window.setTimeout(
            () => void pollAttempt(attemptId, sellerId),
            delayMs,
        );
    }

    async function pollAttempt(attemptId: string, sellerId: string) {
        if (attemptIdRef.current !== attemptId) return; // tentativa superada, para o loop

        const expiresAtMs = expiresAtMsRef.current;
        if (expiresAtMs !== null && isAttemptPastGrace(expiresAtMs)) {
            // Rede de segurança: o backend deveria ter respondido `expired` bem
            // antes disso (ver reconcileAttempt) -- só chega aqui se as consultas
            // estiverem falhando repetidamente.
            teardownOnboardingListeners();
            setStatus("expired");
            showMessage(
                sellerId,
                "A conexão com o WhatsApp demorou demais para responder. Tente novamente.",
                true,
            );
            setPending(false);
            return;
        }

        const finalStatus = await reconcileAttempt(attemptId, sellerId);
        if (
            finalStatus &&
            ["completed", "failed", "expired"].includes(finalStatus)
        )
            return;
        if (attemptIdRef.current !== attemptId) return;

        const popupOpen = Boolean(popupRef.current && !popupRef.current.closed);
        const nextDelay = jitteredDelay(
            popupOpen ? POLL_INTERVAL_OPEN_MS : POLL_INTERVAL_CLOSED_MS,
        );
        schedulePoll(attemptId, sellerId, nextDelay);
    }

    async function startOnboarding(sellerId: string) {
        setActiveSellerId(sellerId);
        setPending(true);
        setStatus("connecting");
        showMessage(sellerId, null);
        setPhoneOptions([]);
        teardownOnboardingListeners();
        try {
            await ensureWhatsAppInstallation(sellerId);
            const attempt = await startWhatsAppOnboardingAttempt(sellerId);
            attemptIdRef.current = attempt.attemptId;
            expiresAtMsRef.current = new Date(attempt.expiresAt).getTime();
            // NUNCA aceitar connect_url informado pelo navegador -- este é
            // exatamente o valor que o backend do Catálogo devolveu para esta
            // tentativa, e a origem confiável do popup é derivada dele, nunca de
            // uma constante fixa.
            const messagingOrigin = onboardingOriginFromConnectUrl(
                attempt.connectUrl,
            );

            // `popup` é preenchido só depois de `window.open` (abaixo), mas
            // precisa existir já aqui porque o listener tem que estar registrado
            // ANTES de abrir o popup -- uma resposta rápida do popup poderia
            // chegar sem ninguém ouvindo. Mesma estrutura (`let popup` declarado
            // antes do handler) do handoff de segurança.
            let popup: Window | null = null;
            const handler = (event: MessageEvent) => {
                // Valida origin E source juntos -- só origin permitiria que outra
                // aba/iframe do mesmo host injetasse eventos.
                if (!isTrustedMessagingEvent(event, messagingOrigin, popup))
                    return;
                const data = event.data as { type?: string } | undefined;
                if (!data?.type) return;

                if (data.type === "bippa.meta.onboarding.loaded") {
                    if (popup)
                        sendStartMessage(popup, messagingOrigin, attempt.state);
                    return;
                }

                if (
                    data.type === "bippa.meta.onboarding.completed" ||
                    data.type === "bippa.meta.onboarding.failed"
                ) {
                    // O evento só antecipa a reconciliação -- a fonte de verdade é
                    // sempre a resposta desta chamada, mesmo que o popup já tenha
                    // sido fechado ou o evento tenha vindo maquiado.
                    void reconcileAttempt(attempt.attemptId, sellerId);
                }
            };
            listenerRef.current = handler;
            window.addEventListener("message", handler);

            popup = window.open(
                attempt.connectUrl,
                "bippa-onboarding",
                POPUP_FEATURES,
            );
            if (!popup) {
                teardownOnboardingListeners();
                throw new Error(
                    "Não foi possível abrir a janela de conexão. Verifique se o bloqueador de pop-ups está desativado.",
                );
            }
            popupRef.current = popup;
            startSentRef.current = false;

            // Fallback: se `loaded` não chegar em READY_FALLBACK_MS, manda o
            // início mesmo assim (o contrato do bippa-messaging não confirma que
            // o evento é sempre emitido).
            const openedPopup = popup;
            readyFallbackTimerRef.current = window.setTimeout(
                () =>
                    sendStartMessage(
                        openedPopup,
                        messagingOrigin,
                        attempt.state,
                    ),
                READY_FALLBACK_MS,
            );

            // Polling independente do evento -- cobre o popup fechar sem avisar
            // ou o evento se perder. Começa no cadenciamento "popup aberto".
            schedulePoll(
                attempt.attemptId,
                sellerId,
                jitteredDelay(POLL_INTERVAL_OPEN_MS),
            );
        } catch (error) {
            teardownOnboardingListeners();
            setStatus("error");
            showMessage(
                sellerId,
                error instanceof Error
                    ? error.message
                    : "Não foi possível iniciar a conexão com o WhatsApp.",
                true,
            );
            setPending(false);
        }
    }

    function sendStartMessage(
        popup: Window,
        messagingOrigin: string,
        state: string,
    ) {
        if (startSentRef.current) return;
        startSentRef.current = true;
        // Só `state` -- nunca API key, token Meta ou credencial de sessão. E
        // sempre para o origin exato desta tentativa, nunca '*'.
        popup.postMessage(
            { type: "bippa.meta.onboarding.start", state },
            messagingOrigin,
        );
    }

    // Encerramento manual do onboarding em curso -- a administradora pode
    // cancelar a qualquer momento em vez de esperar a expiração da tentativa.
    function cancelOnboarding(sellerId: string) {
        popupRef.current?.close();
        teardownOnboardingListeners();
        attemptIdRef.current = null;
        expiresAtMsRef.current = null;
        setStatus("disconnected");
        setPhoneOptions([]);
        setPending(false);
        showMessage(sellerId, null);
    }

    async function selectPhone(phoneId: string) {
        if (!activeSellerId) return;
        const sellerId = activeSellerId;
        setAssociatingPhoneId(phoneId);
        showMessage(sellerId, null);
        try {
            const result = await associateWhatsAppSenderProfile(
                sellerId,
                phoneId,
            );
            // Só muda para "conectado" a partir da resposta confirmada -- nunca
            // otimista.
            setConnectionsBySeller((prev) => ({ ...prev, [sellerId]: result }));
            setStatus(result.connected ? "connected" : "error");
            setPhoneOptions([]);
            attemptIdRef.current = null;
            showMessage(
                sellerId,
                result.connected
                    ? null
                    : "A vendedora aceitou o telefone, mas a conexão ainda não está confirmada.",
                !result.connected,
            );
        } catch (error) {
            setStatus("error");
            showMessage(
                sellerId,
                error instanceof Error
                    ? error.message
                    : "Não foi possível associar este telefone à vendedora.",
                true,
            );
        } finally {
            setAssociatingPhoneId(null);
            setPending(false);
        }
    }

    async function verifyConnection(sellerId: string) {
        setVerifyingSellerId(sellerId);
        showMessage(sellerId, null);
        try {
            const connection = connectionsBySeller[sellerId];
            const connections = await fetchWhatsAppConnections(sellerId);
            // `fetchWhatsAppConnections` já é escopada por sourceReference
            // (tenant+vendedora, ver whatsappIntegrationService.getWhatsAppConnections),
            // então o phoneId sozinho já identifica o vínculo desta vendedora --
            // `senderProfileKey` nunca deve ser comparado aqui: o
            // bippa-messaging não devolve esse campo nesta listagem (é sempre
            // `null`, ver bippaMessagingClient.listWhatsAppConnections), então
            // comparar por ele fazia esta verificação falhar sempre, mesmo com
            // o telefone corretamente conectado.
            const match = connections.find(
                (entry) => entry.phoneId === connection?.phoneId,
            );
            showMessage(
                sellerId,
                match
                    ? `Conexão confirmada: ${match.displayPhoneMasked ?? match.phoneId} está vinculado a esta vendedora.`
                    : "Não foi possível confirmar o vínculo deste telefone com a vendedora no bippa-messaging.",
                !match,
            );
        } catch (error) {
            showMessage(
                sellerId,
                error instanceof Error
                    ? error.message
                    : "Não foi possível verificar a conexão.",
                true,
            );
        } finally {
            setVerifyingSellerId(null);
        }
    }

    async function confirmPaymentsCapability(sellerId: string) {
        const reason = paymentCapabilityReason.trim();
        if (!reason) {
            showMessage(sellerId, "Registre como a aprovação de Orders/Payments foi confirmada com a Meta.", true);
            return;
        }
        setSavingPaymentsCapability(true);
        showMessage(sellerId, null);
        try {
            const connection = await enableWhatsAppPaymentsCapability(sellerId, reason);
            setConnectionsBySeller((previous) => ({ ...previous, [sellerId]: connection }));
            setEnablingPaymentsSellerId(null);
            setPaymentCapabilityReason("");
            showMessage(sellerId, "Aprovação da Meta registrada para esta vendedora.");
        } catch (error) {
            showMessage(
                sellerId,
                error instanceof Error ? error.message : "Não foi possível registrar a aprovação de pagamentos nativos.",
                true,
            );
        } finally {
            setSavingPaymentsCapability(false);
        }
    }

    const STATUS_LABEL: Record<Status, string> = {
        disconnected: "Não conectado",
        connecting: "Conectando…",
        processing: "Confirmando com a Meta…",
        connected: "Conectado",
        error: "Erro na conexão",
        expired: "Tentativa expirada",
    };
    const connectedSellersCount = sellers.filter(
        (seller) => connectionsBySeller[seller.id]?.connected,
    ).length;
    const disconnectedSellers = sellers.filter(
        (seller) => !connectionsBySeller[seller.id]?.connected,
    );
    const unassignedPhones = phones.filter((phone) => !phone.sellerId);

    return (
        <div className="min-h-screen bg-brand-background">
            <HubHeader
                title="WhatsApp"
                description="Conecte o número de WhatsApp Business de cada vendedora (via bippa-messaging) para notificar pedidos e links de pagamento."
                secondaryActions={
                    <Link
                        href="/workspace/integracoes"
                        className="text-sm font-medium text-brand-primary"
                    >
                        Voltar às integrações
                    </Link>
                }
            />

            <main className="mx-auto flex max-w-6xl flex-col gap-5 p-4 sm:p-6">
                {loading ? (
                    <p className="text-sm text-muted-foreground">
                        Carregando vendedoras…
                    </p>
                ) : loadError ? (
                    <p className="text-sm text-red-700">{loadError}</p>
                ) : sellers.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                        Nenhuma vendedora cadastrada ainda -- crie uma em
                        Usuários antes de conectar um número de WhatsApp.
                    </p>
                ) : (
                    <>
                        <section className="rounded-brand border border-border bg-surface p-5 shadow-card">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                    <p className="text-xs font-bold uppercase tracking-wide text-brand-primary">Visão geral</p>
                                    <h2 className="mt-1 text-lg font-bold text-foreground">Seu WhatsApp está {connectedSellersCount === sellers.length ? "pronto" : "em configuração"}</h2>
                                    <p className="mt-1 text-sm leading-6 text-muted-foreground">{connectedSellersCount} de {sellers.length} vendedora{ sellers.length === 1 ? "" : "s" } com um número pronto para enviar mensagens.</p>
                                </div>
                                <Button asChild type="button" variant="outline" size="sm"><Link href="/workspace/integracoes/whatsapp/templates">Ver templates padrão</Link></Button>
                            </div>
                            <ol className="mt-5 grid gap-3 md:grid-cols-3">
                                <li className="rounded-control border border-border p-3"><p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Concluído</p><p className="mt-1 text-sm font-semibold text-foreground">Vendedoras cadastradas</p><p className="mt-1 text-xs text-muted-foreground">{sellers.length} disponível{ sellers.length === 1 ? "" : "eis" } para configurar.</p></li>
                                <li className="rounded-control border border-border p-3"><p className={`text-xs font-bold uppercase tracking-wide ${disconnectedSellers.length === 0 ? "text-emerald-700" : "text-amber-700"}`}>{disconnectedSellers.length === 0 ? "Concluído" : "Próximo passo"}</p><p className="mt-1 text-sm font-semibold text-foreground">Números por vendedora</p><p className="mt-1 text-xs text-muted-foreground">{disconnectedSellers.length === 0 ? "Todos os números foram conectados." : `${disconnectedSellers.length} vendedora${disconnectedSellers.length === 1 ? "" : "s"} ainda sem número.`}</p></li>
                                <li className="rounded-control border border-border p-3"><p className="text-xs font-bold uppercase tracking-wide text-brand-primary">Configuração</p><p className="mt-1 text-sm font-semibold text-foreground">Templates padrão</p><p className="mt-1 text-xs text-muted-foreground">Confira o vínculo dos modelos fixos com a Meta.</p></li>
                            </ol>
                            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-control bg-brand-background p-3"><p className="text-sm text-muted-foreground">Os detalhes de saúde de cada número aparecem junto da respectiva vendedora.</p><Button type="button" variant="outline" size="sm" loading={refreshingPhones} onClick={() => void refreshPhoneHealth()}>Atualizar dados da Meta</Button></div>
                            {phoneHealthError && <p role="status" className="mt-3 text-sm text-red-700">{phoneHealthError}</p>}
                        </section>
                        <section className="rounded-brand border border-border bg-surface p-5 shadow-card">
                            <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wide text-brand-primary">Números e vendedoras</p><h2 className="mt-1 text-lg font-bold text-foreground">Configure um número por vendedora</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">Conecte, confirme o telefone e acompanhe a disponibilidade de envio no mesmo lugar.</p></div><span className="rounded-full bg-brand-background px-3 py-1 text-sm font-semibold text-foreground">{connectedSellersCount}/{sellers.length} conectadas</span></div>
                        {sellers.map((seller) => {
                            const connection = connectionsBySeller[seller.id];
                            const phone = phones.find(
                                (item) => item.sellerId === seller.id || item.phoneId === connection?.phoneId,
                            );
                            const isActive = activeSellerId === seller.id;
                            const sellerStatus: Status = isActive
                                ? status
                                : connection?.connected
                                  ? "connected"
                                  : "disconnected";
                            return (
                                <section
                                    key={seller.id}
                                    className="rounded-brand border border-border bg-surface p-5 shadow-card"
                                >
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <div>
                                            <h2 className="font-bold text-foreground">
                                                {seller.name}
                                            </h2>
                                            <p className="text-xs text-muted-foreground">
                                                {seller.email}
                                            </p>
                                        </div>
                                        <span
                                            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                                                sellerStatus === "connected"
                                                    ? "bg-emerald-50 text-emerald-900"
                                                    : sellerStatus ===
                                                            "error" ||
                                                        sellerStatus ===
                                                            "expired"
                                                      ? "bg-red-50 text-red-900"
                                                      : "bg-brand-background text-brand-text"
                                            }`}
                                        >
                                            {STATUS_LABEL[sellerStatus]}
                                        </span>
                                    </div>

                                    {connection?.connected && (
                                        <dl className="mt-4 grid grid-cols-2 gap-3 rounded-control bg-brand-background p-3 text-xs sm:grid-cols-5">
                                            {connection.displayPhoneMasked && (
                                                <div>
                                                    <dt className="text-muted-foreground">Telefone</dt>
                                                    <dd className="mt-1 font-semibold text-foreground">
                                                        <code>
                                                            {
                                                                connection.displayPhoneMasked
                                                            }
                                                        </code>
                                                    </dd>
                                                </div>
                                            )}
                                            {connection.verifiedName && (
                                                <div>
                                                    <dt className="text-muted-foreground">Nome do perfil</dt>
                                                    <dd className="mt-1 font-semibold text-foreground">
                                                        {
                                                            connection.verifiedName
                                                        }
                                                    </dd>
                                                </div>
                                            )}
                                            <div><dt className="text-muted-foreground">Limite</dt><dd className="mt-1 font-semibold text-foreground">{formatMessagingLimit(phone?.messagingLimitTier ?? null)}</dd></div>
                                            <div><dt className="text-muted-foreground">Qualidade</dt><dd className="mt-1 font-semibold text-foreground">{formatQuality(phone?.qualityRating ?? connection.qualityRating)}</dd></div>
                                            <div><dt className="text-muted-foreground">Envio pela Meta</dt><dd className="mt-1 font-semibold text-foreground">{formatSendingHealth(phone?.healthCanSendMessage ?? null)}</dd></div>
                                        </dl>
                                    )}

                                    {connection?.connected && phone && (
                                        <p className="mt-3 text-xs text-muted-foreground">Perfil {formatNameStatus(phone.nameStatus)} · {phone.active ? "Número ativo (LIVE)" : "Número requer atenção"} · Verificação {phone.codeVerificationStatus === "VERIFIED" ? "concluída" : phone.codeVerificationStatus || "não informada"}</p>
                                    )}

                                    {connection?.connected && phone?.healthCanSendMessage && phone.healthCanSendMessage !== "AVAILABLE" && (
                                        <div className="mt-3 rounded-control border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950" role="alert">
                                            <p className="font-semibold">{formatSendingHealth(phone.healthCanSendMessage)} pela Meta</p>
                                            <p className="mt-1 leading-5">{healthIssueText(phone) ?? "A Meta indicou uma pendência nesta conta. Resolva-a antes de iniciar novas conversas."}</p>
                                            {(phone.healthManageUrl || phone.healthPaymentSettingsUrl) && (
                                                <div className="mt-2 flex flex-wrap gap-3 text-sm font-semibold">
                                                    {phone.healthManageUrl && <a href={phone.healthManageUrl} target="_blank" rel="noreferrer" className="text-brand-primary underline underline-offset-2">Abrir no Gerenciador do WhatsApp</a>}
                                                    {phone.healthPaymentSettingsUrl && <a href={phone.healthPaymentSettingsUrl} target="_blank" rel="noreferrer" className="text-brand-primary underline underline-offset-2">Revisar forma de pagamento</a>}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {connection?.connected && (
                                        <div className="mt-4 rounded-control border border-border p-3">
                                            <p className="text-sm font-semibold text-foreground">Pagamentos nativos (Meta Payments)</p>
                                            {connection.capabilityPayments ? (
                                                <p className="mt-1 text-sm text-emerald-700">Aprovação da Meta registrada para este número.</p>
                                            ) : enablingPaymentsSellerId === seller.id ? (
                                                <div className="mt-3 space-y-3">
                                                    <p className="text-xs leading-5 text-muted-foreground">Registre quando a Meta/parceiro aprovou Orders/Payments para a WABA deste número. Fica como histórico de quem confirmou.</p>
                                                    <label className="block text-xs font-semibold text-foreground">
                                                        Registro da aprovação
                                                        <input
                                                            className="mt-1 w-full rounded-control border border-border bg-surface px-3 py-2 text-sm font-normal"
                                                            value={paymentCapabilityReason}
                                                            maxLength={240}
                                                            onChange={(event) => setPaymentCapabilityReason(event.target.value)}
                                                            placeholder="Ex.: Meta aprovou Orders/Payments em 10/09/2026"
                                                        />
                                                    </label>
                                                    <div className="flex flex-wrap gap-2">
                                                        <Button type="button" size="sm" loading={savingPaymentsCapability} onClick={() => void confirmPaymentsCapability(seller.id)}>Registrar aprovação</Button>
                                                        <Button type="button" size="sm" variant="outline" disabled={savingPaymentsCapability} onClick={() => { setEnablingPaymentsSellerId(null); setPaymentCapabilityReason(""); }}>Cancelar</Button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                                                    <p className="text-xs leading-5 text-muted-foreground">Nenhuma aprovação da Meta registrada ainda para este número.</p>
                                                    <Button type="button" size="sm" variant="outline" onClick={() => { setEnablingPaymentsSellerId(seller.id); setPaymentCapabilityReason(""); }}>Registrar aprovação da Meta</Button>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {isActive && phoneOptions.length > 0 && (
                                        <div className="mt-4 rounded-control border border-border p-3">
                                            <p className="text-xs text-muted-foreground">
                                                A conta conectada pode ter mais
                                                de um número. Selecione o que
                                                representa esta vendedora.
                                            </p>
                                            <ul className="mt-2 flex flex-col gap-2">
                                                {phoneOptions.map((option) => (
                                                    <li
                                                        key={option.phoneId}
                                                        className="flex items-center justify-between gap-3 rounded-control border border-border p-2"
                                                    >
                                                        <div className="min-w-0">
                                                            <p className="truncate text-sm font-medium text-foreground">
                                                                {option.displayPhoneMasked ??
                                                                    option.phoneId}
                                                            </p>
                                                            {option.verifiedName && (
                                                                <p className="truncate text-xs text-muted-foreground">
                                                                    {
                                                                        option.verifiedName
                                                                    }
                                                                </p>
                                                            )}
                                                        </div>
                                                        <Button
                                                            type="button"
                                                            size="sm"
                                                            disabled={
                                                                associatingPhoneId !==
                                                                null
                                                            }
                                                            loading={
                                                                associatingPhoneId ===
                                                                option.phoneId
                                                            }
                                                            onClick={() =>
                                                                void selectPhone(
                                                                    option.phoneId,
                                                                )
                                                            }
                                                        >
                                                            Usar este telefone
                                                        </Button>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}

                                    <div className="mt-4 flex flex-wrap gap-2">
                                        <Button
                                            type="button"
                                            disabled={pending && !isActive}
                                            loading={
                                                isActive &&
                                                (sellerStatus ===
                                                    "connecting" ||
                                                    sellerStatus ===
                                                        "processing")
                                            }
                                            onClick={() =>
                                                void startOnboarding(seller.id)
                                            }
                                        >
                                            {connection?.connected
                                                ? "Reconectar WhatsApp"
                                                : "Conectar WhatsApp"}
                                        </Button>
                                        {isActive &&
                                            (sellerStatus === "connecting" ||
                                                sellerStatus ===
                                                    "processing") && (
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    onClick={() =>
                                                        cancelOnboarding(
                                                            seller.id,
                                                        )
                                                    }
                                                >
                                                    Cancelar
                                                </Button>
                                            )}
                                        {connection?.connected && (
                                            <Button
                                                type="button"
                                                variant="outline"
                                                disabled={
                                                    verifyingSellerId !== null
                                                }
                                                loading={
                                                    verifyingSellerId ===
                                                    seller.id
                                                }
                                                onClick={() =>
                                                    void verifyConnection(
                                                        seller.id,
                                                    )
                                                }
                                            >
                                                Verificar conexão
                                            </Button>
                                        )}
                                    </div>
                                    {messageSellerId === seller.id &&
                                        message && (
                                            <p
                                                className={`mt-3 text-sm ${messageIsError ? "text-red-700" : "text-muted-foreground"}`}
                                                role="status"
                                            >
                                                {message}
                                            </p>
                                        )}
                                </section>
                            );
                        })}
                        </section>

                        {unassignedPhones.length > 0 && (
                            <section className="rounded-brand border border-amber-200 bg-surface p-5 shadow-card">
                                <p className="text-xs font-bold uppercase tracking-wide text-amber-700">Atenção necessária</p>
                                <h2 className="mt-1 text-lg font-bold text-foreground">Números ainda sem vendedora</h2>
                                <p className="mt-1 text-sm leading-6 text-muted-foreground">Escolha uma vendedora no fluxo de conexão para concluir a associação destes números.</p>
                                <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                                    {unassignedPhones.map((phone) => <li key={phone.phoneId} className="rounded-control border border-border p-3 text-sm text-foreground"><p className="font-semibold">{phone.verifiedName || "Número sem nome"}</p><p className="mt-1 text-muted-foreground">{phone.displayPhoneNumber || phone.phoneNumberId || phone.phoneId}</p></li>)}
                                </ul>
                            </section>
                        )}

                        <IntegrationRulesCard
                            description="A conexão é autorizada num popup hospedado pelo bippa-messaging e volta para esta tela ao terminar."
                            rules={[
                                {
                                    title: "Um número por vendedora",
                                    description:
                                        "Cada vendedora tem no máximo um telefone conectado -- é ele que a vendedora usa para notificar pedidos e links de pagamento dos clientes da própria carteira.",
                                },
                                {
                                    title: "Sem credenciais aqui",
                                    description:
                                        "Token, WABA ID e demais credenciais da Meta ficam só no bippa-messaging -- este painel nunca os armazena nem exibe.",
                                },
                                {
                                    title: "Cobrança pelo WhatsApp (Meta Payments)",
                                    description:
                                        "A opção de cobrar diretamente pelo WhatsApp fica desligada até a aprovação do recurso pela Meta -- não há como ativá-la por aqui ainda.",
                                },
                                {
                                    title: "Confirmação explícita",
                                    description:
                                        'O status só muda para "conectado" depois que o bippa-messaging confirma a associação do telefone -- nunca antes disso.',
                                },
                            ]}
                        />
                    </>
                )}
            </main>
        </div>
    );
}
