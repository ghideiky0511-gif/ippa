"use client";

import { useEffect, useRef, useState } from "react";
import Link from "@/components/TenantLink";
import { Button } from "@/components/ui/button";
import { Dialog, DialogCloseButton, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { HubHeader } from "@/workspace/components/shared/HubHeader";
import { fetchUsers } from "@/workspace/lib/usersClient";
import type { AdminUser } from "@/domain/clients/types";
import {
    associateWhatsAppSenderProfile,
    ensureWhatsAppInstallation,
    fetchTenantWhatsAppConnectionStatuses,
    fetchStandardWhatsAppTemplates,
    fetchStandardWhatsAppTemplatesForSeller,
    fetchTenantWhatsAppPhoneHealth,
    fetchWhatsAppConnections,
    fetchWhatsAppOnboardingAttemptStatus,
    isTrustedMessagingEvent,
    onboardingOriginFromConnectUrl,
    startWhatsAppOnboardingAttempt,
    submitStandardWhatsAppTemplate,
    type StandardWhatsAppTemplate,
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

const TEMPLATE_USAGE: Record<StandardWhatsAppTemplate["key"], string> = {
    order_confirmed: "Usado automaticamente ao confirmar um pedido e na ação “Enviar pedido pelo WhatsApp” do pedido.",
    payment_link: "Usado na ação “Enviar link de pagamento pelo WhatsApp” do pedido separado.",
};

function metaTemplateStatusLabel(status: string): string {
    const labels: Record<string, string> = {
        APPROVED: "Aprovado",
        ACTIVE: "Ativo",
        PENDING: "Em análise",
        REJECTED: "Reprovado",
        PAUSED: "Pausado",
        DISABLED: "Desativado",
    };
    return labels[status] ?? status;
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
    const [templates, setTemplates] = useState<StandardWhatsAppTemplate[]>([]);
    const [templateSellerId, setTemplateSellerId] = useState("");
    const [refreshingTemplateStatus, setRefreshingTemplateStatus] = useState(false);
    const [templateToSubmit, setTemplateToSubmit] =
        useState<StandardWhatsAppTemplate | null>(null);
    // Valores de exemplo por variável (chave do parâmetro -> texto), editados
    // pela administradora antes do envio -- a Meta exige um exemplo real por
    // variável do corpo do template, então pré-preenchemos com a sugestão de
    // whatsappTemplates.ts e deixamos livre para confirmar ou digitar outro.
    const [templateExampleValues, setTemplateExampleValues] = useState<
        Record<string, string>
    >({});
    const [submittingTemplateKey, setSubmittingTemplateKey] = useState<
        StandardWhatsAppTemplate["key"] | null
    >(null);
    const [templateMessage, setTemplateMessage] = useState<{
        key: StandardWhatsAppTemplate["key"];
        text: string;
        error: boolean;
    } | null>(null);

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
            const [users, statuses, standardTemplates, phoneHealth] = await Promise.all([
                fetchUsers(),
                fetchTenantWhatsAppConnectionStatuses(),
                fetchStandardWhatsAppTemplates(),
                fetchTenantWhatsAppPhoneHealth().catch(() => []),
            ]);
            setSellers(users.filter((u) => u.role === "vendedora"));
            setConnectionsBySeller(
                Object.fromEntries(statuses.map((s) => [s.sellerId, s])),
            );
            setTemplates(standardTemplates);
            setPhones(phoneHealth);
            const firstConnectedSellerId =
                statuses.find((connection) => connection.connected)?.sellerId ??
                "";
            setTemplateSellerId((current) =>
                statuses.some(
                    (connection) =>
                        connection.connected && connection.sellerId === current,
                )
                    ? current
                    : firstConnectedSellerId,
            );
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

    async function loadTemplateCatalog(sellerId: string, sync = false) {
        if (!sellerId) return;
        setRefreshingTemplateStatus(true);
        try {
            setTemplates(await fetchStandardWhatsAppTemplatesForSeller(sellerId, sync));
        } catch (error) {
            setTemplateMessage({
                key: "order_confirmed",
                text: error instanceof Error ? error.message : "Não foi possível consultar os templates da Meta.",
                error: true,
            });
        } finally {
            setRefreshingTemplateStatus(false);
        }
    }

    useEffect(() => {
        if (!templateSellerId) return;
        const timer = window.setTimeout(
            () => void loadTemplateCatalog(templateSellerId),
            0,
        );
        return () => window.clearTimeout(timer);
        // A consulta deve reagir somente à WABA selecionada; a função também
        // é usada nos botões de ação abaixo e, por isso, não é memoizada.
    }, [templateSellerId]);

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

    function openTemplateSubmission(template: StandardWhatsAppTemplate) {
        setTemplateExampleValues(
            Object.fromEntries(
                template.parameters.map((parameter) => [
                    parameter.key,
                    parameter.example,
                ]),
            ),
        );
        setTemplateToSubmit(template);
    }

    async function submitTemplate(template: StandardWhatsAppTemplate) {
        if (!templateSellerId) return;
        const examples = template.parameters.map(
            (parameter) => (templateExampleValues[parameter.key] ?? "").trim(),
        );
        if (examples.some((example) => example.length === 0)) return;
        setSubmittingTemplateKey(template.key);
        setTemplateMessage(null);
        try {
            const result = await submitStandardWhatsAppTemplate(
                templateSellerId,
                template.key,
                examples,
            );
            const normalizedStatus = result.status.toUpperCase();
            const statusText =
                normalizedStatus === "APPROVED"
                    ? "já está aprovado"
                    : normalizedStatus === "REJECTED"
                      ? "foi recebido, mas está rejeitado na Meta"
                      : "foi enviado e está em análise pela Meta";
            setTemplateMessage({
                key: template.key,
                text: `O template ${result.name} ${statusText}.`,
                error: normalizedStatus === "REJECTED",
            });
            setTemplateToSubmit(null);
            await loadTemplateCatalog(templateSellerId, true);
        } catch (error) {
            setTemplateMessage({
                key: template.key,
                text:
                    error instanceof Error
                        ? error.message
                        : "Não foi possível enviar o template para aprovação da Meta.",
                error: true,
            });
        } finally {
            setSubmittingTemplateKey(null);
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
    const connectedSellers = sellers.filter(
        (seller) => connectionsBySeller[seller.id]?.connected,
    );

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

            <main className="mx-auto flex max-w-5xl flex-col gap-5 p-4 sm:p-6">
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
                                    <p className="text-xs font-bold uppercase tracking-wide text-brand-primary">Saúde dos números</p>
                                    <h2 className="mt-1 text-lg font-bold text-foreground">Números conectados</h2>
                                    <p className="mt-1 text-sm leading-6 text-muted-foreground">Status sincronizado com a Meta: qualidade, nome de perfil, limite e disponibilidade de envio.</p>
                                </div>
                                <Button type="button" variant="outline" size="sm" loading={refreshingPhones} onClick={() => void refreshPhoneHealth()}>
                                    Atualizar status
                                </Button>
                            </div>
                            {phones.length === 0 ? (
                                <p className="mt-4 rounded-control bg-brand-background p-3 text-sm text-muted-foreground">Nenhum número foi encontrado. Conecte um WhatsApp Business para visualizar a saúde dele aqui.</p>
                            ) : (
                                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                                    {phones.map((phone) => {
                                        const seller = phone.sellerId ? sellers.find((item) => item.id === phone.sellerId) : null;
                                        return <article key={phone.phoneId} className="rounded-control border border-border p-4">
                                            <div className="flex flex-wrap items-start justify-between gap-3">
                                                <div className="min-w-0">
                                                    <h3 className="font-bold text-foreground">{phone.verifiedName || phone.displayPhoneNumber || "Número sem nome"}</h3>
                                                    <p className="mt-1 text-sm text-muted-foreground">{phone.displayPhoneNumber || phone.phoneNumberId || phone.phoneId}</p>
                                                    <p className="mt-1 text-xs text-muted-foreground">{seller ? `Vendedora: ${seller.name}` : "Ainda não associado a uma vendedora"}</p>
                                                </div>
                                                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${phone.active && phone.connectionStatus === "connected" ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>
                                                    {phone.active && phone.connectionStatus === "connected" ? "Ativo (LIVE)" : "Requer atenção"}
                                                </span>
                                            </div>
                                            <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
                                                <div><dt className="text-muted-foreground">Limite</dt><dd className="mt-1 font-semibold text-foreground">{formatMessagingLimit(phone.messagingLimitTier)}</dd></div>
                                                <div><dt className="text-muted-foreground">Qualidade</dt><dd className="mt-1 font-semibold text-foreground">{formatQuality(phone.qualityRating)}</dd></div>
                                                <div><dt className="text-muted-foreground">Nome de perfil</dt><dd className="mt-1 font-semibold text-foreground">{formatNameStatus(phone.nameStatus)}</dd></div>
                                                <div><dt className="text-muted-foreground">Verificação</dt><dd className="mt-1 font-semibold text-foreground">{phone.codeVerificationStatus === "VERIFIED" ? "Verificado" : phone.codeVerificationStatus || "Não informado"}</dd></div>
                                            </dl>
                                            <p className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">WABA: <code>{phone.wabaId}</code> · Plataforma: {phone.platformType || "Não informada"}</p>
                                        </article>;
                                    })}
                                </div>
                            )}
                            {phoneHealthError && <p role="status" className="mt-3 text-sm text-red-700">{phoneHealthError}</p>}
                        </section>
                        {sellers.map((seller) => {
                            const connection = connectionsBySeller[seller.id];
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
                                        <dl className="mt-3 grid grid-cols-1 gap-x-4 gap-y-1 text-xs text-muted-foreground sm:grid-cols-2">
                                            {connection.displayPhoneMasked && (
                                                <div>
                                                    <dt>Telefone</dt>
                                                    <dd>
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
                                                    <dt>Nome verificado</dt>
                                                    <dd>
                                                        {
                                                            connection.verifiedName
                                                        }
                                                    </dd>
                                                </div>
                                            )}
                                        </dl>
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

                        <section className="rounded-brand border border-border bg-surface p-5 shadow-card">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                    <p className="text-xs font-bold uppercase tracking-wide text-brand-primary">
                                        Templates do catálogo
                                    </p>
                                    <h2 className="mt-1 text-lg font-bold text-foreground">
                                        Envios fixos do app
                                    </h2>
                                    <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
                                        Estes modelos são definidos pelo catálogo e não podem ser editados nesta tela.
                                        Abaixo está a correspondência entre cada uso no pedido e o template cadastrado na Meta para a conta selecionada.
                                    </p>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    <span
                                        className="group relative inline-flex"
                                        tabIndex={0}
                                    >
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            disabled
                                        >
                                            Gerenciar templates personalizados
                                        </Button>
                                        <span
                                            role="tooltip"
                                            className="pointer-events-none absolute right-0 top-full z-10 mt-2 w-56 rounded-control bg-foreground px-3 py-2 text-center text-xs font-medium text-surface opacity-0 shadow-card transition-opacity group-hover:opacity-100 group-focus:opacity-100"
                                        >
                                            Em breve: será possível criar e alterar
                                            templates personalizados.
                                        </span>
                                    </span>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        loading={refreshingTemplateStatus}
                                        disabled={!templateSellerId}
                                        onClick={() => void loadTemplateCatalog(templateSellerId, true)}
                                    >
                                        Atualizar status na Meta
                                    </Button>
                                </div>
                            </div>

                            <div className="mt-4">
                                <label
                                    htmlFor="whatsapp-template-connection"
                                    className="text-sm font-semibold text-foreground"
                                >
                                    Conta de WhatsApp
                                </label>
                                {connectedSellers.length > 0 ? (
                                    <select
                                        id="whatsapp-template-connection"
                                        value={templateSellerId}
                                        onChange={(event) =>
                                            setTemplateSellerId(
                                                event.target.value,
                                            )
                                        }
                                        className="mt-2 min-h-11 w-full rounded-control border border-border bg-surface px-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary"
                                    >
                                        {connectedSellers.map((seller) => {
                                            const connection =
                                                connectionsBySeller[seller.id];
                                            return (
                                                <option
                                                    key={seller.id}
                                                    value={seller.id}
                                                >
                                                    {seller.name} —{" "}
                                                    {connection.displayPhoneMasked ??
                                                        "telefone conectado"}
                                                </option>
                                            );
                                        })}
                                    </select>
                                ) : (
                                    <p className="mt-2 rounded-control bg-brand-background p-3 text-sm text-muted-foreground">
                                        Conecte ao menos um número acima para
                                        consultar o cadastro dos templates na Meta.
                                    </p>
                                )}
                            </div>

                            <div className="mt-5 grid gap-4">
                                {templates.map((template) => (
                                    <article
                                        key={template.key}
                                        className="rounded-control border border-border p-4"
                                    >
                                        <div className="flex flex-wrap items-start justify-between gap-3">
                                            <div>
                                                <h3 className="font-bold text-foreground">
                                                    {template.title}
                                                </h3>
                                                <p className="mt-1 text-xs text-muted-foreground">
                                                    Template do catálogo: <code>{template.name}</code>{" "}
                                                    · Utilidade · Português
                                                    (Brasil)
                                                </p>
                                            </div>
                                            {template.metaTemplate ? (
                                                <span className="rounded-full bg-brand-background px-2.5 py-1 text-xs font-semibold text-foreground">
                                                    Meta: {metaTemplateStatusLabel(template.metaTemplate.status)}
                                                </span>
                                            ) : (
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    disabled={!templateSellerId || submittingTemplateKey !== null}
                                                    loading={submittingTemplateKey === template.key}
                                                    onClick={() => openTemplateSubmission(template)}
                                                >
                                                    Cadastrar na Meta
                                                </Button>
                                            )}
                                        </div>
                                        <p className="mt-3 text-sm text-muted-foreground">
                                            {template.description}
                                        </p>
                                        <p className="mt-2 text-sm text-muted-foreground">
                                            <span className="font-semibold text-foreground">Uso no app: </span>
                                            {TEMPLATE_USAGE[template.key]}
                                        </p>
                                        <div className="mt-3 whitespace-pre-line rounded-control bg-brand-background p-3 text-sm leading-6 text-foreground">
                                            {template.body}
                                        </div>
                                        <div className="mt-3 flex flex-wrap gap-1.5">
                                            {template.parameters.map(
                                                (parameter, index) => (
                                                    <span
                                                        key={parameter.key}
                                                        className="rounded-full bg-brand-background px-2 py-1 text-xs text-muted-foreground"
                                                    >
                                                        {`{{${index + 1}}}`}{" "}
                                                        {parameter.label}
                                                    </span>
                                                ),
                                            )}
                                        </div>
                                        <div className="mt-3 rounded-control border border-border p-3 text-sm">
                                            <p className="font-semibold text-foreground">Cadastro correspondente na Meta</p>
                                            {template.metaTemplate ? (
                                                <>
                                                    <p className="mt-1 text-muted-foreground">
                                                        <code>{template.metaTemplate.name}</code> · {metaTemplateStatusLabel(template.metaTemplate.status)}
                                                        {template.metaTemplate.qualityScore ? ` · Qualidade: ${template.metaTemplate.qualityScore}` : ""}
                                                    </p>
                                                    {template.metaTemplate.rejectionReason && (
                                                        <p className="mt-2 text-red-700">Motivo da rejeição: {template.metaTemplate.rejectionReason}</p>
                                                    )}
                                                </>
                                            ) : (
                                                <p className="mt-1 text-muted-foreground">Não encontrado nesta WABA. Cadastre exatamente o modelo fixo acima antes de usar esta ação no pedido.</p>
                                            )}
                                        </div>
                                        {templateMessage?.key ===
                                            template.key && (
                                            <p
                                                className={`mt-3 text-sm ${templateMessage.error ? "text-red-700" : "text-emerald-700"}`}
                                                role="status"
                                            >
                                                {templateMessage.text}
                                            </p>
                                        )}
                                    </article>
                                ))}
                                <article className="rounded-control border border-border p-4">
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                        <div>
                                            <h3 className="font-bold text-foreground">Cobrança Pix nativa</h3>
                                            <p className="mt-1 text-xs text-muted-foreground">Ação “Enviar cobrança Pix nativa pelo WhatsApp” do pedido</p>
                                        </div>
                                        <span className="rounded-full bg-brand-background px-2.5 py-1 text-xs font-semibold text-foreground">Não usa template</span>
                                    </div>
                                    <p className="mt-3 text-sm leading-6 text-muted-foreground">Envia um cartão de pedido pagável dentro do WhatsApp pela Orders API. Ele não corresponde a nenhum template da lista da Meta.</p>
                                </article>
                            </div>
                        </section>

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
            <Dialog
                open={templateToSubmit !== null}
                onOpenChange={(open) => !open && setTemplateToSubmit(null)}
            >
                <DialogContent className="max-h-[90dvh] overflow-y-auto">
                    <DialogHeader>
                        <div>
                            <DialogTitle>
                                Enviar template para a Meta?
                            </DialogTitle>
                            <DialogDescription>
                                {`O modelo ${templateToSubmit?.name ?? ""} será cadastrado no WABA da conta selecionada. Confirme ou ajuste os exemplos abaixo -- a Meta exige um valor de amostra real por variável para aprovar o template.`}
                            </DialogDescription>
                        </div>
                        <DialogCloseButton />
                    </DialogHeader>
                    {templateToSubmit && (
                        <form
                            className="grid gap-3"
                            onSubmit={(event) => {
                                event.preventDefault();
                                void submitTemplate(templateToSubmit);
                            }}
                        >
                            <div className="whitespace-pre-line rounded-control bg-brand-background p-3 text-sm leading-6 text-foreground">
                                {templateToSubmit.body}
                            </div>
                            <div className="grid gap-3">
                                {templateToSubmit.parameters.map(
                                    (parameter, index) => (
                                        <div key={parameter.key}>
                                            <label
                                                htmlFor={`whatsapp-template-example-${parameter.key}`}
                                                className="text-sm font-semibold text-foreground"
                                            >
                                                {`{{${index + 1}}} ${parameter.label}`}
                                            </label>
                                            <Input
                                                id={`whatsapp-template-example-${parameter.key}`}
                                                className="mt-1"
                                                value={
                                                    templateExampleValues[
                                                        parameter.key
                                                    ] ?? ""
                                                }
                                                onChange={(event) =>
                                                    setTemplateExampleValues(
                                                        (current) => ({
                                                            ...current,
                                                            [parameter.key]:
                                                                event.target
                                                                    .value,
                                                        }),
                                                    )
                                                }
                                                required
                                            />
                                        </div>
                                    ),
                                )}
                            </div>
                            {templateMessage?.key === templateToSubmit.key &&
                                templateMessage.error && (
                                    <p
                                        className="text-sm text-red-700"
                                        role="status"
                                    >
                                        {templateMessage.text}
                                    </p>
                                )}
                            <div className="flex justify-end gap-2">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    onClick={() => setTemplateToSubmit(null)}
                                    disabled={
                                        submittingTemplateKey !== null
                                    }
                                >
                                    Cancelar
                                </Button>
                                <Button
                                    type="submit"
                                    loading={
                                        submittingTemplateKey ===
                                        templateToSubmit.key
                                    }
                                >
                                    Enviar para análise
                                </Button>
                            </div>
                        </form>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
