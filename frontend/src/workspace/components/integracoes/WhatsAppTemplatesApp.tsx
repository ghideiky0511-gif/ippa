"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "@/components/TenantLink";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { HubHeader } from "@/workspace/components/shared/HubHeader";
import { fetchUsers } from "@/workspace/lib/usersClient";
import {
    createWhatsAppTemplate,
    deleteWhatsAppTemplate,
    fetchTenantWhatsAppConnectionStatuses,
    fetchWhatsAppTemplateLibrary,
    inspectWhatsAppTemplate,
    type WhatsAppTemplateEntry,
} from "@/workspace/lib/whatsappIntegrationClient";
import type { AdminUser } from "@/domain/clients/types";

const STATUS_STYLE: Record<string, string> = {
    APPROVED: "bg-emerald-50 text-emerald-800",
    ACTIVE: "bg-emerald-50 text-emerald-800",
    PENDING: "bg-amber-50 text-amber-800",
    REJECTED: "bg-red-50 text-red-800",
    PAUSED: "bg-red-50 text-red-800",
    DISABLED: "bg-red-50 text-red-800",
};

function bodyOf(template: WhatsAppTemplateEntry) {
    const body = template.components.find((component) => component.type === "BODY");
    return typeof body?.text === "string" ? body.text : "Sem corpo de texto";
}

function statusLabel(status: string) {
    return status === "APPROVED" ? "Aprovado" : status === "PENDING" ? "Em análise" : status === "REJECTED" ? "Reprovado" : status;
}

export default function WhatsAppTemplatesApp() {
    const [sellers, setSellers] = useState<AdminUser[]>([]);
    const [sellerId, setSellerId] = useState("");
    const [templates, setTemplates] = useState<WhatsAppTemplateEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingTemplates, setLoadingTemplates] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [creating, setCreating] = useState(false);
    const [saving, setSaving] = useState(false);
    const [workingId, setWorkingId] = useState<string | null>(null);
    const [name, setName] = useState("");
    const [category, setCategory] = useState<"UTILITY" | "MARKETING" | "AUTHENTICATION">("UTILITY");
    const [body, setBody] = useState("");
    const [examples, setExamples] = useState<string[]>([]);

    const variableCount = useMemo(() => [...body.matchAll(/\{\{\d+\}\}/g)].length, [body]);
    useEffect(() => {
        const load = async () => {
            try {
                const [users, statuses] = await Promise.all([fetchUsers(), fetchTenantWhatsAppConnectionStatuses()]);
                const byId = new Map(users.filter((user) => user.role === "vendedora").map((user) => [user.id, user]));
                const available = statuses.filter((status) => status.connected).map((status) => byId.get(status.sellerId)).filter((seller): seller is AdminUser => Boolean(seller));
                setSellers(available);
                setSellerId(available[0]?.id ?? "");
            } catch (exc) {
                setError(exc instanceof Error ? exc.message : "Não foi possível carregar os números conectados.");
            } finally {
                setLoading(false);
            }
        };
        void load();
    }, []);

    async function loadTemplates(sync = true) {
        if (!sellerId) return;
        setLoadingTemplates(true);
        setError(null);
        try {
            setTemplates(await fetchWhatsAppTemplateLibrary(sellerId, sync));
        } catch (exc) {
            setError(exc instanceof Error ? exc.message : "Não foi possível carregar os templates.");
        } finally {
            setLoadingTemplates(false);
        }
    }

    useEffect(() => {
        const timer = window.setTimeout(() => void loadTemplates(), 0);
        return () => window.clearTimeout(timer);
        // loadTemplates é recriada a cada render; a carga deve reagir só ao número selecionado.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sellerId]);

    function changeBody(value: string) {
        setBody(value);
        const count = [...value.matchAll(/\{\{\d+\}\}/g)].length;
        setExamples((current) => Array.from({ length: count }, (_, index) => current[index] ?? ""));
    }

    async function createTemplate(event: React.FormEvent) {
        event.preventDefault();
        if (!sellerId) return;
        setSaving(true);
        setError(null);
        try {
            const created = await createWhatsAppTemplate({ sellerId, name, language: "pt_BR", category, body, examples });
            setTemplates((current) => [created, ...current]);
            setName(""); setBody(""); setExamples([]); setCreating(false);
        } catch (exc) {
            setError(exc instanceof Error ? exc.message : "Não foi possível criar o template.");
        } finally { setSaving(false); }
    }

    async function inspect(templateId: string) {
        if (!sellerId) return;
        setWorkingId(templateId); setError(null);
        try {
            const fresh = await inspectWhatsAppTemplate(sellerId, templateId);
            setTemplates((current) => current.map((template) => template.id === templateId ? fresh : template));
        } catch (exc) { setError(exc instanceof Error ? exc.message : "Não foi possível analisar o template."); }
        finally { setWorkingId(null); }
    }

    async function remove(template: WhatsAppTemplateEntry) {
        if (!sellerId || !window.confirm(`Excluir o template “${template.name}”? Esta ação também o remove da Meta.`)) return;
        setWorkingId(template.id); setError(null);
        try {
            await deleteWhatsAppTemplate(sellerId, template.id);
            setTemplates((current) => current.filter((item) => item.id !== template.id));
        } catch (exc) { setError(exc instanceof Error ? exc.message : "Não foi possível excluir o template."); }
        finally { setWorkingId(null); }
    }

    return <div className="min-h-screen bg-brand-background">
        <HubHeader title="Templates do WhatsApp" description="Crie, acompanhe e remova os templates que a Meta analisa para o número selecionado." secondaryActions={<Link href="/workspace/integracoes/whatsapp" className="text-sm font-medium text-brand-primary">Voltar ao WhatsApp</Link>} />
        <main className="mx-auto flex max-w-5xl flex-col gap-5 p-4 sm:p-6">
            {loading ? <p className="text-sm text-muted-foreground">Carregando números conectados…</p> : sellers.length === 0 ? <section className="rounded-brand border border-border bg-surface p-5 shadow-card"><p className="text-sm text-muted-foreground">Conecte e associe um número a uma vendedora antes de administrar templates.</p></section> : <>
                <section className="rounded-brand border border-border bg-surface p-5 shadow-card">
                    <div className="flex flex-wrap items-end justify-between gap-3">
                        <div className="min-w-64 flex-1"><label htmlFor="template-seller" className="text-sm font-semibold text-foreground">Número / vendedora</label><select id="template-seller" value={sellerId} onChange={(event) => setSellerId(event.target.value)} className="mt-2 min-h-11 w-full rounded-control border border-border bg-surface px-3 text-sm text-foreground">{sellers.map((seller) => <option key={seller.id} value={seller.id}>{seller.name} · {seller.email}</option>)}</select></div>
                        <div className="flex gap-2"><Button type="button" variant="outline" size="sm" loading={loadingTemplates} onClick={() => void loadTemplates(true)}>Sincronizar com a Meta</Button><Button type="button" size="sm" onClick={() => setCreating((value) => !value)}>{creating ? "Fechar criação" : "Criar template"}</Button></div>
                    </div>
                    <p className="mt-3 text-xs leading-5 text-muted-foreground">A lista é vinculada à WABA deste número. “Analisar agora” consulta diretamente a Meta e atualiza qualidade, aprovação e motivo de rejeição.</p>
                </section>
                {creating && <section className="rounded-brand border border-border bg-surface p-5 shadow-card"><h2 className="text-lg font-bold text-foreground">Novo template</h2><p className="mt-1 text-sm text-muted-foreground">Crie um template de texto em português. Para variáveis, use <code>{"{{1}}"}</code>, <code>{"{{2}}"}</code> e informe uma amostra para cada uma.</p><form className="mt-5 grid gap-4" onSubmit={(event) => void createTemplate(event)}><div className="grid gap-4 sm:grid-cols-2"><div><label htmlFor="template-name" className="text-sm font-semibold">Nome</label><Input id="template-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="aviso_de_pedido" pattern="[a-z0-9_]+" required /></div><div><label htmlFor="template-category" className="text-sm font-semibold">Categoria</label><select id="template-category" value={category} onChange={(event) => setCategory(event.target.value as typeof category)} className="mt-1 min-h-11 w-full rounded-control border border-border bg-surface px-3 text-sm"><option value="UTILITY">Utilidade</option><option value="MARKETING">Marketing</option><option value="AUTHENTICATION">Autenticação</option></select></div></div><div><label htmlFor="template-body" className="text-sm font-semibold">Texto</label><textarea id="template-body" value={body} onChange={(event) => changeBody(event.target.value)} placeholder="Olá, {{1}}. Seu pedido {{2}} foi confirmado." className="mt-1 min-h-32 w-full rounded-control border border-border bg-surface p-3 text-sm" required /></div>{examples.map((example, index) => <div key={index}><label htmlFor={`template-example-${index}`} className="text-sm font-semibold">Exemplo para {`{{${index + 1}}}`}</label><Input id={`template-example-${index}`} value={example} onChange={(event) => setExamples((current) => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} required /></div>)}<div className="flex justify-end"><Button type="submit" loading={saving} disabled={examples.length !== variableCount}>Enviar para análise</Button></div></form></section>}
                {error && <p role="status" className="rounded-control bg-red-50 p-3 text-sm text-red-800">{error}</p>}
                <section className="rounded-brand border border-border bg-surface p-5 shadow-card"><div className="flex items-center justify-between gap-3"><h2 className="text-lg font-bold text-foreground">Templates cadastrados</h2><span className="text-sm text-muted-foreground">{templates.length} {templates.length === 1 ? "template" : "templates"}</span></div>{loadingTemplates ? <p className="mt-4 text-sm text-muted-foreground">Consultando a Meta…</p> : templates.length === 0 ? <p className="mt-4 rounded-control bg-brand-background p-3 text-sm text-muted-foreground">Ainda não há templates nesta WABA.</p> : <div className="mt-4 grid gap-3">{templates.map((template) => <article key={template.id} className="rounded-control border border-border p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-bold text-foreground">{template.name}</h3><p className="mt-1 text-xs text-muted-foreground">{template.category} · {template.language} · ID Meta: {template.metaTemplateId || "ainda não informado"}</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLE[template.status] ?? "bg-brand-background text-brand-text"}`}>{statusLabel(template.status)}</span></div><p className="mt-3 whitespace-pre-line rounded-control bg-brand-background p-3 text-sm leading-6 text-foreground">{bodyOf(template)}</p><dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2"><div><dt className="text-muted-foreground">Qualidade</dt><dd className="mt-1 font-semibold text-foreground">{template.qualityScore || "Ainda não informada"}</dd></div><div><dt className="text-muted-foreground">Última sincronização</dt><dd className="mt-1 font-semibold text-foreground">{template.lastSyncedAt ? new Date(template.lastSyncedAt).toLocaleString("pt-BR") : "Ainda não sincronizado"}</dd></div></dl>{template.rejectionReason && <p className="mt-3 rounded-control bg-red-50 p-3 text-sm text-red-800"><span className="font-semibold">Motivo da rejeição: </span>{template.rejectionReason}</p>}<div className="mt-4 flex flex-wrap gap-2"><Button type="button" variant="outline" size="sm" loading={workingId === template.id} onClick={() => void inspect(template.id)}>Analisar agora</Button><Button type="button" variant="destructive" size="sm" disabled={workingId !== null} onClick={() => void remove(template)}>Excluir</Button></div></article>)}</div>}</section>
            </>}
        </main>
    </div>;
}
