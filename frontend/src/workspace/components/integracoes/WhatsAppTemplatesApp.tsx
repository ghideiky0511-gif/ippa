"use client";

import { useEffect, useState } from "react";
import Link from "@/components/TenantLink";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogCloseButton,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { HubHeader } from "@/workspace/components/shared/HubHeader";
import { fetchUsers } from "@/workspace/lib/usersClient";
import {
    fetchStandardWhatsAppTemplatesForSeller,
    fetchTenantWhatsAppConnectionStatuses,
    submitStandardWhatsAppTemplate,
    type StandardWhatsAppTemplate,
    type TenantWhatsAppConnectionStatus,
} from "@/workspace/lib/whatsappIntegrationClient";
import type { AdminUser } from "@/domain/clients/types";

const TEMPLATE_USAGE: Record<StandardWhatsAppTemplate["key"], string> = {
    order_confirmed:
        "Enviado automaticamente ao confirmar um pedido e na ação “Enviar pedido pelo WhatsApp”.",
    payment_link:
        "Enviado na ação “Enviar link de pagamento pelo WhatsApp” do pedido.",
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

function hasRejectionReason(reason: string | null): reason is string {
    if (!reason?.trim()) return false;
    return reason.trim().toUpperCase() !== "NONE";
}

export default function WhatsAppTemplatesApp() {
    const [sellers, setSellers] = useState<AdminUser[]>([]);
    const [connections, setConnections] = useState<
        Record<string, TenantWhatsAppConnectionStatus>
    >({});
    const [selectedSellerId, setSelectedSellerId] = useState("");
    const [templates, setTemplates] = useState<StandardWhatsAppTemplate[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [submittingKey, setSubmittingKey] = useState<
        StandardWhatsAppTemplate["key"] | null
    >(null);
    const [templateToSubmit, setTemplateToSubmit] =
        useState<StandardWhatsAppTemplate | null>(null);
    const [exampleValues, setExampleValues] = useState<Record<string, string>>(
        {},
    );
    const [message, setMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const connectedSellers = sellers.filter(
        (seller) => connections[seller.id]?.connected,
    );

    async function loadTemplates(sellerId: string, sync = false) {
        if (!sellerId) return;
        setRefreshing(true);
        setError(null);
        try {
            setTemplates(
                await fetchStandardWhatsAppTemplatesForSeller(sellerId, sync),
            );
        } catch (loadError) {
            setError(
                loadError instanceof Error
                    ? loadError.message
                    : "Não foi possível consultar os templates na Meta.",
            );
        } finally {
            setRefreshing(false);
        }
    }

    useEffect(() => {
        const timer = window.setTimeout(() => {
            void (async () => {
                try {
                    const [users, statuses] = await Promise.all([
                        fetchUsers(),
                        fetchTenantWhatsAppConnectionStatuses(),
                    ]);
                    const sellerUsers = users.filter(
                        (user) => user.role === "vendedora",
                    );
                    const bySeller = Object.fromEntries(
                        statuses.map((status) => [status.sellerId, status]),
                    );
                    setSellers(sellerUsers);
                    setConnections(bySeller);
                    setSelectedSellerId(
                        sellerUsers.find(
                            (seller) => bySeller[seller.id]?.connected,
                        )?.id ?? "",
                    );
                } catch (loadError) {
                    setError(
                        loadError instanceof Error
                            ? loadError.message
                            : "Não foi possível carregar os templates.",
                    );
                } finally {
                    setLoading(false);
                }
            })();
        }, 0);
        return () => window.clearTimeout(timer);
    }, []);

    useEffect(() => {
        if (!selectedSellerId) return;
        const timer = window.setTimeout(
            () => void loadTemplates(selectedSellerId),
            0,
        );
        return () => window.clearTimeout(timer);
    }, [selectedSellerId]);

    function openTemplateSubmission(template: StandardWhatsAppTemplate) {
        setExampleValues(
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
        if (!selectedSellerId) return;
        const examples = template.parameters.map((parameter) =>
            (exampleValues[parameter.key] ?? "").trim(),
        );
        if (examples.some((example) => !example)) return;
        setSubmittingKey(template.key);
        setMessage(null);
        setError(null);
        try {
            const result = await submitStandardWhatsAppTemplate(
                selectedSellerId,
                template.key,
                examples,
            );
            setMessage(
                result.status.toUpperCase() === "APPROVED"
                    ? `${result.name} já está aprovado na Meta.`
                    : `${result.name} foi enviado para análise da Meta.`,
            );
            setTemplateToSubmit(null);
            await loadTemplates(selectedSellerId, true);
        } catch (submitError) {
            setError(
                submitError instanceof Error
                    ? submitError.message
                    : "Não foi possível cadastrar o template na Meta.",
            );
        } finally {
            setSubmittingKey(null);
        }
    }

    return (
        <div className="min-h-full bg-brand-background">
            <HubHeader
                title="Templates do WhatsApp"
                description="Modelos padrão que o app usa nos pedidos e o respectivo cadastro na Meta."
                secondaryActions={
                    <Link
                        href="/workspace/integracoes/whatsapp"
                        className="text-sm font-semibold text-brand-primary hover:underline"
                    >
                        Voltar para WhatsApp
                    </Link>
                }
            />
            <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
                <section className="rounded-brand border border-border bg-surface p-5 shadow-card">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                            <p className="text-xs font-bold uppercase tracking-wide text-brand-primary">
                                Modelos fixos do catálogo
                            </p>
                            <h2 className="mt-1 text-lg font-bold text-foreground">
                                O que é enviado nos pedidos
                            </h2>
                            <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
                                Estes modelos não podem ser alterados. Confira
                                se o mesmo template está aprovado na Meta antes
                                de usar as ações do pedido.
                            </p>
                        </div>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            loading={refreshing}
                            disabled={!selectedSellerId}
                            onClick={() =>
                                void loadTemplates(selectedSellerId, true)
                            }
                        >
                            Atualizar status na Meta
                        </Button>
                    </div>
                    {loading ? (
                        <p className="mt-5 text-sm text-muted-foreground">
                            Carregando contas conectadas…
                        </p>
                    ) : connectedSellers.length === 0 ? (
                        <p className="mt-5 rounded-control bg-brand-background p-3 text-sm text-muted-foreground">
                            Conecte um número para uma vendedora na página do
                            WhatsApp antes de consultar ou cadastrar os
                            templates.
                        </p>
                    ) : (
                        <div className="mt-5">
                            <label
                                htmlFor="whatsapp-template-connection"
                                className="text-sm font-semibold text-foreground"
                            >
                                Conta de WhatsApp
                            </label>
                            <select
                                id="whatsapp-template-connection"
                                value={selectedSellerId}
                                onChange={(event) =>
                                    setSelectedSellerId(event.target.value)
                                }
                                className="mt-2 min-h-11 w-full rounded-control border border-border bg-surface px-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary"
                            >
                                {connectedSellers.map((seller) => (
                                    <option key={seller.id} value={seller.id}>
                                        {seller.name} —{" "}
                                        {connections[seller.id]
                                            .displayPhoneMasked ??
                                            "telefone conectado"}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}
                    {error && (
                        <p role="alert" className="mt-3 text-sm text-red-700">
                            {error}
                        </p>
                    )}
                    {message && (
                        <p
                            role="status"
                            className="mt-3 text-sm text-emerald-700"
                        >
                            {message}
                        </p>
                    )}
                </section>
                {selectedSellerId && (
                    <section className="grid gap-4">
                        {templates.map((template) => (
                            <article
                                key={template.key}
                                className="rounded-brand border border-border bg-surface p-5 shadow-card"
                            >
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                        <h2 className="font-bold text-foreground">
                                            {template.title}
                                        </h2>
                                        <p className="mt-1 text-xs text-muted-foreground">
                                            Template do catálogo:{" "}
                                            <code>{template.name}</code> ·
                                            Utilidade · Português (Brasil)
                                        </p>
                                    </div>
                                    {template.metaTemplate ? (
                                        <span className="rounded-full bg-brand-background px-2.5 py-1 text-xs font-semibold text-foreground">
                                            Meta:{" "}
                                            {metaTemplateStatusLabel(
                                                template.metaTemplate.status,
                                            )}
                                        </span>
                                    ) : (
                                        <Button
                                            type="button"
                                            size="sm"
                                            loading={
                                                submittingKey === template.key
                                            }
                                            disabled={submittingKey !== null}
                                            onClick={() =>
                                                openTemplateSubmission(template)
                                            }
                                        >
                                            Cadastrar na Meta
                                        </Button>
                                    )}
                                </div>
                                <p className="mt-3 text-sm text-muted-foreground">
                                    {template.description}
                                </p>
                                <p className="mt-2 text-sm text-muted-foreground">
                                    <span className="font-semibold text-foreground">
                                        Uso no app:{" "}
                                    </span>
                                    {TEMPLATE_USAGE[template.key]}
                                </p>
                                <div className="mt-3 whitespace-pre-line rounded-control bg-brand-background p-3 text-sm leading-6 text-foreground">
                                    {template.body}
                                </div>
                                <div className="mt-3 rounded-control border border-border p-3 text-sm">
                                    <p className="font-semibold text-foreground">
                                        Cadastro correspondente na Meta
                                    </p>
                                    {template.metaTemplate ? (
                                        <>
                                            <p className="mt-1 text-muted-foreground">
                                                <code>
                                                    {template.metaTemplate.name}
                                                </code>{" "}
                                                ·{" "}
                                                {metaTemplateStatusLabel(
                                                    template.metaTemplate
                                                        .status,
                                                )}
                                                {template.metaTemplate
                                                    .qualityScore
                                                    ? ` · Qualidade: ${template.metaTemplate.qualityScore}`
                                                    : ""}
                                            </p>
                                            {hasRejectionReason(
                                                template.metaTemplate
                                                    .rejectionReason,
                                            ) && (
                                                <p className="mt-2 text-red-700">
                                                    Motivo da rejeição:{" "}
                                                    {
                                                        template.metaTemplate
                                                            .rejectionReason
                                                    }
                                                </p>
                                            )}
                                        </>
                                    ) : (
                                        <p className="mt-1 text-muted-foreground">
                                            Ainda não encontrado nesta conta.
                                            Cadastre exatamente este modelo fixo
                                            antes de usar esta ação no pedido.
                                        </p>
                                    )}
                                </div>
                            </article>
                        ))}
                        <article className="rounded-brand border border-border bg-surface p-5 shadow-card">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                    <h2 className="font-bold text-foreground">
                                        Cobrança Pix nativa
                                    </h2>
                                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                                        A ação “Enviar cobrança Pix nativa pelo
                                        WhatsApp” usa um cartão de pedido
                                        pagável da Orders API. Não há template
                                        correspondente na Meta.
                                    </p>
                                </div>
                                <span className="rounded-full bg-brand-background px-2.5 py-1 text-xs font-semibold text-foreground">
                                    Não usa template
                                </span>
                            </div>
                        </article>
                    </section>
                )}
                <section className="rounded-brand border border-border bg-surface p-5 shadow-card">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                            <p className="text-xs font-bold uppercase tracking-wide text-brand-primary">
                                Templates personalizados
                            </p>
                            <h2 className="mt-1 text-lg font-bold text-foreground">
                                Em breve
                            </h2>
                            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
                                Quando este recurso for liberado, você poderá
                                criar e administrar modelos adicionais aqui. Por
                                enquanto, somente os templates padrão acima são
                                usados pelo app.
                            </p>
                        </div>
                        <span
                            className="group relative inline-flex"
                            tabIndex={0}
                        >
                            <Button type="button" disabled>
                                Criar template
                            </Button>
                            <span
                                role="tooltip"
                                className="pointer-events-none absolute right-0 top-full z-10 mt-2 w-44 rounded-control bg-foreground px-3 py-2 text-center text-xs font-medium text-surface opacity-0 shadow-card transition-opacity group-hover:opacity-100 group-focus:opacity-100"
                            >
                                Em breve
                            </span>
                        </span>
                    </div>
                </section>
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
                                Confirme os exemplos abaixo. A Meta exige um
                                valor de amostra real para cada variável do
                                template.
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
                                            >{`{{${index + 1}}} ${parameter.label}`}</label>
                                            <Input
                                                id={`whatsapp-template-example-${parameter.key}`}
                                                className="mt-1"
                                                value={
                                                    exampleValues[
                                                        parameter.key
                                                    ] ?? ""
                                                }
                                                onChange={(event) =>
                                                    setExampleValues(
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
                            <div className="flex justify-end gap-2">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    onClick={() => setTemplateToSubmit(null)}
                                    disabled={submittingKey !== null}
                                >
                                    Cancelar
                                </Button>
                                <Button
                                    type="submit"
                                    loading={
                                        submittingKey === templateToSubmit.key
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
