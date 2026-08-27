'use client';

import { useEffect, useState } from 'react';
import Link from '@/components/TenantLink';
import { Button } from '@/components/ui/button';
import { HubHeader } from '@/workspace/components/shared/HubHeader';
import { activateErpIntegration, fetchErpIntegrations, fetchTotvsClassificationCatalog, saveTotvsClassificationMapping, testErpIntegrationConnection, type ErpIntegrationOption, type TotvsClassificationCatalog } from '@/workspace/lib/erpIntegrationClient';
import ErpProviderCredentialsModal from './ErpProviderCredentialsModal';

export default function TotvsModaIntegrationApp() {
  const [catalog, setCatalog] = useState<TotvsClassificationCatalog | null>(null);
  const [mapping, setMapping] = useState({ level1TypeCode: '', level2TypeCode: '', level3TypeCode: '' });
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);
  const [option, setOption] = useState<ErpIntegrationOption | null>(null);
  const [editingCredentials, setEditingCredentials] = useState(false);
  async function load() {
    setPending(true); setMessage('');
    try { const result = await fetchTotvsClassificationCatalog(); setCatalog(result); setMapping({ level1TypeCode: result.mapping?.level1TypeCode ?? '', level2TypeCode: result.mapping?.level2TypeCode ?? '', level3TypeCode: result.mapping?.level3TypeCode ?? '' }); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Falha ao carregar os tipos.'); }
    finally { setPending(false); }
  }
  useEffect(() => { void load(); void fetchErpIntegrations().then((result) => setOption(result.options.find((item) => item.provider === 'totvsmoda') ?? null)).catch(() => {}); }, []);
  async function save() {
    if (!mapping.level1TypeCode || (mapping.level3TypeCode && !mapping.level2TypeCode)) { setMessage('Selecione o nível 1 e mantenha os níveis sequenciais.'); return; }
    if (new Set(Object.values(mapping).filter(Boolean)).size !== Object.values(mapping).filter(Boolean).length) { setMessage('O mesmo tipo não pode ser usado em dois níveis.'); return; }
    setPending(true); setMessage('');
    try { const result = await saveTotvsClassificationMapping({ level1TypeCode: mapping.level1TypeCode, ...(mapping.level2TypeCode ? { level2TypeCode: mapping.level2TypeCode } : {}), ...(mapping.level3TypeCode ? { level3TypeCode: mapping.level3TypeCode } : {}) }); setCatalog(result); setMessage('Mapeamento salvo. A hierarquia foi reconstruída e a próxima sincronização será completa.'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Falha ao salvar.'); }
    finally { setPending(false); }
  }
  return <div><HubHeader title="TOTVS Moda" description="Credenciais, publicação e hierarquia de classificações por variante." secondaryActions={<Link href="/workspace/integracoes" className="text-sm text-brand-primary">Voltar às integrações</Link>} />
    <main className="mx-auto flex max-w-5xl flex-col gap-5 p-4 sm:p-6">
      <section className="rounded-brand border border-border bg-surface p-4"><div className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={!option} onClick={() => setEditingCredentials(true)}>{option?.configured ? 'Editar credenciais e publicação' : 'Configurar credenciais e publicação'}</Button><Button type="button" variant="outline" disabled={pending} onClick={() => void load()}>Atualizar tipos da TOTVS</Button><Button type="button" variant="outline" disabled={pending || !option?.configured} onClick={async () => { const result = await testErpIntegrationConnection('totvsmoda'); setMessage(result.ok ? 'Conexão confirmada.' : result.message ?? 'Falha no teste.'); }}>Testar conexão</Button><Button type="button" disabled={pending || !mapping.level1TypeCode || !option?.configured} onClick={async () => { try { await activateErpIntegration('totvsmoda'); setMessage('TOTVS Moda ativada.'); } catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível ativar.'); } }}>Ativar</Button></div>{message && <p className="mt-3 text-sm text-muted-foreground">{message}</p>}</section>
      <section className="rounded-brand border border-border bg-surface p-4"><h2 className="font-bold">Níveis da árvore pública</h2><p className="mt-1 text-sm text-muted-foreground">O nível 1 é obrigatório; níveis 2 e 3 são sequenciais.</p><div className="mt-4 grid gap-3 md:grid-cols-3">{([['level1TypeCode', 'Nível 1'], ['level2TypeCode', 'Nível 2'], ['level3TypeCode', 'Nível 3']] as const).map(([field, label]) => <label key={field} className="grid gap-1 text-sm font-medium">{label}<select value={mapping[field]} className="min-h-10 rounded-control border border-border bg-surface px-3" onChange={(event) => setMapping((current) => ({ ...current, [field]: event.target.value }))}><option value="">{field === 'level1TypeCode' ? 'Selecione' : 'Sem nível'}</option>{catalog?.types.map((type) => <option key={type.typeCode} value={type.typeCode}>{type.typeName} ({type.typeCode})</option>)}</select></label>)}</div><Button type="button" className="mt-4" disabled={pending} onClick={() => void save()}>Salvar e reconstruir</Button></section>
      <section className="rounded-brand border border-border bg-surface p-4"><h2 className="font-bold">Tipos retornados pela TOTVS</h2>{!catalog && <p className="mt-3 text-sm text-muted-foreground">Carregando…</p>}<div className="mt-3 divide-y divide-border">{catalog?.types.map((type) => <div key={type.typeCode} className="py-3 text-sm"><strong>{type.typeName}</strong> <span className="text-muted-foreground">({type.typeCode})</span>{type.categoryLevel && <span className="ml-2 text-brand-primary">Nível {type.categoryLevel}</span>}<p className="text-muted-foreground">{type.itemCount} valores sincronizados{type.sampleNames.length ? ` · ${type.sampleNames.join(', ')}` : ''}</p></div>)}</div></section>
    </main>{editingCredentials && option && <ErpProviderCredentialsModal option={option} onClose={() => setEditingCredentials(false)} onSaved={(saved: ErpIntegrationOption) => { setOption(saved); setEditingCredentials(false); setMessage('Credenciais e regra de publicação salvas.'); }} />}</div>;
}
