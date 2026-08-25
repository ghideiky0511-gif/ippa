'use client';

import Link from 'next/link';
import { use, useCallback, useEffect, useMemo, useState } from 'react';
import type { ControlAiPromptTool, ControlTenant } from '@/lib/control/types';

function formatDate(value: string | null): string {
  if (!value) return 'Nunca ativada';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

function editorValue(tool: ControlAiPromptTool): string {
  return tool.versions.find((version) => version.status === 'active')?.instructions
    ?? tool.defaultInstructions;
}

export default function ControlAiPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: tenantSlug } = use(params);
  const [tenant, setTenant] = useState<ControlTenant | null>(null);
  const [tools, setTools] = useState<ControlAiPromptTool[]>([]);
  const [selectedKey, setSelectedKey] = useState('');
  const [instructions, setInstructions] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activatingId, setActivatingId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const selectedTool = useMemo(
    () => tools.find((tool) => tool.key === selectedKey) ?? null,
    [selectedKey, tools],
  );

  const loadPrompts = useCallback(async (tenantId: string, preferredKey?: string) => {
    const response = await fetch(`/api/control-session/tenants/${tenantId}/ai/prompts`, {
      cache: 'no-store',
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Não foi possível carregar os prompts de IA.');
    const loadedTools = (payload.tools || []) as ControlAiPromptTool[];
    setTools(loadedTools);
    const selected = loadedTools.find((tool) => tool.key === preferredKey) ?? loadedTools[0] ?? null;
    setSelectedKey(selected?.key ?? '');
    setInstructions(selected ? editorValue(selected) : '');
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setError('');
      const tenantsResponse = await fetch('/api/control-session/tenants', { cache: 'no-store' });
      const tenantsPayload = await tenantsResponse.json().catch(() => ({}));
      if (!tenantsResponse.ok) throw new Error(tenantsPayload.error || 'Não foi possível carregar o tenant.');
      const found = ((tenantsPayload.tenants || []) as ControlTenant[])
        .find((item) => item.slug === tenantSlug);
      if (!found) throw new Error('Tenant não encontrado.');
      if (cancelled) return;
      setTenant(found);
      await loadPrompts(found.id);
    }
    void load()
      .catch((loadError: unknown) => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : 'Falha ao carregar o módulo de IA.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [loadPrompts, tenantSlug]);

  function selectTool(key: string) {
    const tool = tools.find((item) => item.key === key);
    setSelectedKey(key);
    setInstructions(tool ? editorValue(tool) : '');
    setError('');
    setNotice('');
  }

  async function saveVersion(activate: boolean) {
    if (!tenant || !selectedTool || saving) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`/api/control-session/tenants/${tenant.id}/ai/prompts`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ toolKey: selectedTool.key, instructions, activate }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) return setError(payload.error || 'Não foi possível salvar o prompt.');
      await loadPrompts(tenant.id, selectedTool.key);
      setNotice(activate
        ? `Versão ${payload.version.version} criada e ativada.`
        : `Versão ${payload.version.version} salva como rascunho.`);
    } finally {
      setSaving(false);
    }
  }

  async function activateVersion(versionId: string) {
    if (!tenant || !selectedTool || activatingId) return;
    setActivatingId(versionId);
    setError('');
    setNotice('');
    try {
      const response = await fetch(
        `/api/control-session/tenants/${tenant.id}/ai/prompts/${versionId}`,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'activate' }),
        },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) return setError(payload.error || 'Não foi possível ativar a versão.');
      await loadPrompts(tenant.id, selectedTool.key);
      setNotice(`Versão ${payload.version.version} ativada.`);
    } finally {
      setActivatingId('');
    }
  }

  return <main className="mx-auto max-w-6xl p-6">
    <Link href={`/control/${encodeURIComponent(tenantSlug)}/detail`} className="mb-6 inline-block text-sm underline">
      Voltar para o tenant
    </Link>

    <header className="mb-7">
      <h1 className="text-2xl font-semibold">Configuração de IA</h1>
      <p className="text-sm text-brand-muted">
        {tenant ? `${tenant.name} / ${tenant.slug}` : tenantSlug} — prompts versionados por ferramenta.
      </p>
    </header>

    {loading ? <p className="text-sm text-brand-muted">Carregando...</p> : error && tools.length === 0
      ? <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>
      : <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="h-fit rounded-brand bg-white p-4 shadow-sm">
          <h2 className="mb-3 font-semibold">Ferramentas</h2>
          <div className="space-y-2">
            {tools.map((tool) => <button
              key={tool.key}
              type="button"
              className={`w-full rounded-lg border p-3 text-left text-sm ${selectedKey === tool.key ? 'border-brand-primary bg-brand-background' : ''}`}
              onClick={() => selectTool(tool.key)}
            >
              <span className="block font-medium">{tool.label}</span>
              <span className="mt-1 block text-xs text-brand-muted">
                {tool.activeVersion ? `Versão ativa: ${tool.activeVersion}` : 'Usando padrão do código'}
              </span>
            </button>)}
          </div>
        </aside>

        {selectedTool && <div className="space-y-6">
          <section className="rounded-brand bg-white p-5 shadow-sm">
            <div className="mb-4">
              <h2 className="text-lg font-semibold">{selectedTool.label}</h2>
              <p className="mt-1 text-sm text-brand-muted">{selectedTool.description}</p>
              <code className="mt-2 inline-block rounded bg-brand-background px-2 py-1 text-xs">{selectedTool.key}</code>
            </div>

            {!selectedTool.activeVersion && <p className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
              Nenhuma versão configurada está ativa. A ferramenta usará as instruções padrão do código.
            </p>}

            <label className="block text-sm font-medium" htmlFor="ai-instructions">
              Instruções enviadas ao modelo
            </label>
            <textarea
              id="ai-instructions"
              className="mt-2 min-h-96 w-full rounded-lg border p-3 font-mono text-sm leading-6"
              value={instructions}
              onChange={(event) => setInstructions(event.target.value)}
              maxLength={20000}
              spellCheck
            />
            <div className="mt-2 flex flex-wrap items-center justify-between gap-3 text-xs text-brand-muted">
              <span>{instructions.length.toLocaleString('pt-BR')} / 20.000 caracteres</span>
              <button
                type="button"
                className="underline"
                onClick={() => setInstructions(selectedTool.defaultInstructions)}
              >
                Restaurar texto padrão no editor
              </button>
            </div>

            {error && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
            {notice && <p className="mt-4 rounded-lg bg-green-50 p-3 text-sm text-green-800">{notice}</p>}

            <div className="mt-5 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                className="rounded border px-4 py-2 text-sm disabled:opacity-60"
                disabled={saving || instructions.trim().length < 20}
                onClick={() => saveVersion(false)}
              >
                {saving ? 'Salvando...' : 'Salvar rascunho'}
              </button>
              <button
                type="button"
                className="rounded-lg bg-brand-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                disabled={saving || instructions.trim().length < 20}
                onClick={() => saveVersion(true)}
              >
                {saving ? 'Salvando...' : 'Salvar nova versão e ativar'}
              </button>
            </div>
          </section>

          <section className="rounded-brand bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold">Histórico de versões</h2>
            {selectedTool.versions.length === 0
              ? <p className="text-sm text-brand-muted">Nenhuma versão foi criada.</p>
              : <div className="space-y-3">{selectedTool.versions.map((version) => <article
                key={version.id}
                className="rounded-lg border p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">
                      Versão {version.version}
                      <span className={`ml-2 rounded-full px-2 py-0.5 text-xs ${version.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-brand-background text-brand-muted'}`}>
                        {version.status === 'active' ? 'ativa' : version.status === 'draft' ? 'rascunho' : 'arquivada'}
                      </span>
                    </p>
                    <p className="mt-1 text-xs text-brand-muted">
                      Criada em {formatDate(version.createdAt)} · {formatDate(version.activatedAt)}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="rounded border px-3 py-1.5 text-xs"
                      onClick={() => setInstructions(version.instructions)}
                    >
                      Usar como base
                    </button>
                    {version.status !== 'active' && <button
                      type="button"
                      className="rounded border px-3 py-1.5 text-xs disabled:opacity-60"
                      disabled={!!activatingId}
                      onClick={() => activateVersion(version.id)}
                    >
                      {activatingId === version.id ? 'Ativando...' : 'Ativar'}
                    </button>}
                  </div>
                </div>
                <pre className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-brand-background p-3 text-xs leading-5">
                  {version.instructions}
                </pre>
              </article>)}</div>}
          </section>
        </div>}
      </div>}
  </main>;
}
