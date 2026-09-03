// A página recebe opções de provedores de catálogos distintos; a tipagem
// estrutural do payload é mantida nos clients e nos modais específicos.
// @ts-nocheck
'use client';

import Link from '@/components/TenantLink';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { HubHeader } from '@/workspace/components/shared/HubHeader';
import { activateErpIntegration, deactivateErpIntegration, testErpIntegrationConnection } from '@/workspace/lib/erpIntegrationClient';
import { activatePaymentIntegration, deactivatePaymentIntegration, testPaymentIntegrationConnection } from '@/workspace/lib/paymentIntegrationClient';
import { CircleCheck, CircleX, CreditCard, ExternalLink, Landmark, MessageCircle, PackageCheck, PlugZap, Settings2 } from 'lucide-react';
import { useState } from 'react';
import ErpProviderCredentialsModal from './ErpProviderCredentialsModal';
import PaymentProviderCredentialsModal from './PaymentProviderCredentialsModal';

function IntegrationStatus({ active, configured, state }) {
  if (state?.status === 'testing') return <Badge className="bg-brand-background text-muted-foreground">Testando</Badge>;
  if (state?.status === 'error') return <Badge className="bg-red-50 text-red-700">Atenção</Badge>;
  if (active) return <Badge className="bg-emerald-50 text-emerald-700">Ativa</Badge>;
  if (configured) return <Badge className="bg-amber-50 text-amber-800">Pronta para ativar</Badge>;
  return <Badge className="bg-brand-background text-muted-foreground">Não configurada</Badge>;
}

function Feedback({ feedback }) {
  if (!feedback) return null;
  const Icon = feedback.type === 'error' ? CircleX : CircleCheck;
  return <div className={`flex items-start gap-2 rounded-control border px-3 py-2.5 text-sm ${feedback.type === 'error' ? 'border-red-200 bg-red-50 text-red-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`} role="status"><Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{feedback.text}</div>;
}

function ServiceIcon({ option, fallback: Fallback }) {
  if (option.logoPath) return <img src={option.logoPath} alt="" width={40} height={40} className="size-10 rounded-control object-contain" onError={(event) => { event.currentTarget.hidden = true; }} />;
  return <span className="flex size-10 shrink-0 items-center justify-center rounded-control bg-brand-background text-brand-primary"><Fallback className="size-5" aria-hidden="true" /></span>;
}

export default function IntegracoesApp({ initialOptions, initialPaymentOptions }) {
  const [options, setOptions] = useState(initialOptions || []);
  const [editingProvider, setEditingProvider] = useState(null);
  const [testState, setTestState] = useState({});
  const [pendingProvider, setPendingProvider] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [providerToDeactivate, setProviderToDeactivate] = useState(null);
  const [paymentOptions, setPaymentOptions] = useState(initialPaymentOptions || []);
  const [editingPaymentProvider, setEditingPaymentProvider] = useState(null);
  const [paymentTestState, setPaymentTestState] = useState({});
  const [pendingPaymentProvider, setPendingPaymentProvider] = useState(null);
  const [paymentFeedback, setPaymentFeedback] = useState(null);
  const [paymentProviderToDeactivate, setPaymentProviderToDeactivate] = useState(null);
  const editing = options.find((option) => option.provider === editingProvider) || null;
  const editingPayment = paymentOptions.find((option) => option.provider === editingPaymentProvider) || null;

  async function testErp(provider) {
    setTestState((previous) => ({ ...previous, [provider]: { status: 'testing' } })); setFeedback(null);
    try { const result = await testErpIntegrationConnection(provider); setTestState((previous) => ({ ...previous, [provider]: { status: result.ok ? 'ok' : 'error', message: result.ok ? 'Conexão confirmada.' : result.message || 'Não foi possível confirmar a conexão.' } })); }
    catch (error) { setTestState((previous) => ({ ...previous, [provider]: { status: 'error', message: error.message } })); }
  }
  async function activateErp(provider) {
    setPendingProvider(provider); setFeedback(null);
    try { const updated = await activateErpIntegration(provider); setOptions((previous) => previous.map((option) => option.provider === updated.provider ? updated : { ...option, active: false })); setFeedback({ type: 'success', text: `${updated.label} está ativo como ERP desta loja.` }); }
    catch (error) { setFeedback({ type: 'error', text: error.message }); } finally { setPendingProvider(null); }
  }
  async function deactivateErp(option) {
    setPendingProvider(option.provider); setFeedback(null);
    try { await deactivateErpIntegration(); setOptions((previous) => previous.map((item) => ({ ...item, active: false }))); setFeedback({ type: 'success', text: 'Integração de ERP desativada.' }); }
    catch (error) { setFeedback({ type: 'error', text: error.message }); } finally { setPendingProvider(null); }
  }
  function saveErp(updated) {
    setOptions((previous) => previous.map((option) => option.provider === updated.provider ? updated : option)); setTestState((previous) => ({ ...previous, [updated.provider]: { status: 'idle' } })); setEditingProvider(null); setFeedback({ type: 'success', text: `Credenciais de ${updated.label} salvas.` });
  }
  async function testPayment(provider) {
    setPaymentTestState((previous) => ({ ...previous, [provider]: { status: 'testing' } })); setPaymentFeedback(null);
    try { const result = await testPaymentIntegrationConnection(provider); setPaymentTestState((previous) => ({ ...previous, [provider]: { status: result.ok ? 'ok' : 'error', message: result.ok ? 'Conexão confirmada.' : result.message || 'Não foi possível confirmar a conexão.' } })); }
    catch (error) { setPaymentTestState((previous) => ({ ...previous, [provider]: { status: 'error', message: error.message } })); }
  }
  async function activatePayment(provider) {
    setPendingPaymentProvider(provider); setPaymentFeedback(null);
    try { const updated = await activatePaymentIntegration(provider); setPaymentOptions((previous) => previous.map((option) => option.provider === updated.provider ? updated : { ...option, active: false })); setPaymentFeedback({ type: 'success', text: `${updated.label} está ativo como gateway de pagamento.` }); }
    catch (error) { setPaymentFeedback({ type: 'error', text: error.message }); } finally { setPendingPaymentProvider(null); }
  }
  async function deactivatePayment(option) {
    setPendingPaymentProvider(option.provider); setPaymentFeedback(null);
    try { await deactivatePaymentIntegration(); setPaymentOptions((previous) => previous.map((item) => ({ ...item, active: false }))); setPaymentFeedback({ type: 'success', text: 'Gateway de pagamento desativado.' }); }
    catch (error) { setPaymentFeedback({ type: 'error', text: error.message }); } finally { setPendingPaymentProvider(null); }
  }
  function savePayment(updated) {
    setPaymentOptions((previous) => previous.map((option) => option.provider === updated.provider ? updated : option)); setPaymentTestState((previous) => ({ ...previous, [updated.provider]: { status: 'idle' } })); setEditingPaymentProvider(null); setPaymentFeedback({ type: 'success', text: `Credenciais de ${updated.label} salvas.` });
  }

  return <div className="min-h-screen bg-brand-background">
    <HubHeader title="Integrações" description="Conecte os serviços que mantêm catálogo, pagamentos e separação de pedidos sincronizados." />
    <main className="mx-auto flex max-w-6xl flex-col gap-8 p-4 sm:p-6">
      <section aria-labelledby="erp-heading">
        <SectionHeader id="erp-heading" icon={Landmark} title="Sistema ERP" description="Sincronize produtos, pedidos, clientes e empresas da sua loja." />
        <Feedback feedback={feedback} />
        <div className="mt-4 grid gap-4 md:grid-cols-2">{options.map((option) => {
          const state = testState[option.provider] || { status: 'idle' }; const pending = pendingProvider === option.provider;
          return <Card key={option.provider} className="flex flex-col p-5"><ProviderHeader option={option} state={state} icon={PlugZap} /><p className="mt-4 text-sm leading-6 text-muted-foreground">{option.description}</p><ConnectionCopy option={option} state={state} activeCopy="Este é o ERP selecionado para a loja." configuredCopy="Credenciais salvas. Teste a conexão para ativar." emptyCopy="Configure as credenciais para começar." /><div className="mt-5 flex flex-wrap gap-2">{option.provider === 'totvsmoda' ? <Button asChild variant="outline" size="sm"><Link href="/workspace/integracoes/totvsmoda"><Settings2 className="size-4" />Configurar</Link></Button> : <Button type="button" variant="outline" size="sm" onClick={() => setEditingProvider(option.provider)}><Settings2 className="size-4" />{option.configured ? 'Editar' : 'Configurar'}</Button>}{option.configured && <Button type="button" variant="outline" size="sm" loading={state.status === 'testing'} onClick={() => void testErp(option.provider)}>Testar conexão</Button>}{option.configured && !option.active && <Button type="button" size="sm" disabled={state.status !== 'ok' || pending} loading={pending} onClick={() => void activateErp(option.provider)}>Ativar</Button>}{option.active && <Button type="button" variant="destructive" size="sm" disabled={pending} loading={pending} onClick={() => setProviderToDeactivate(option)}>Desativar</Button>}</div></Card>;
        })}</div>
        {options.length === 0 && <Card className="mt-4 p-5 text-sm text-muted-foreground">Nenhum provedor de ERP está disponível.</Card>}
      </section>

      <section aria-labelledby="payment-heading">
        <SectionHeader id="payment-heading" icon={CreditCard} title="Pagamentos" description="Receba via Pix, boleto e cartão diretamente na conta do provedor escolhido." />
        <Feedback feedback={paymentFeedback} />
        <div className="mt-4 grid gap-4 md:grid-cols-2">{paymentOptions.map((option) => {
          const state = paymentTestState[option.provider] || { status: 'idle' }; const pending = pendingPaymentProvider === option.provider; const redirect = option.onboardingType === 'redirect';
          return <Card key={option.provider} className="flex flex-col p-5"><ProviderHeader option={option} state={state} icon={CreditCard} /><p className="mt-4 text-sm leading-6 text-muted-foreground">{option.description}</p><ConnectionCopy option={option} state={state} activeCopy="Este é o gateway ativo da loja." configuredCopy="Configuração salva. Teste a conexão para ativar." emptyCopy="Configure o provedor para receber pagamentos." /><div className="mt-5 flex flex-wrap gap-2">{redirect ? <Button asChild size="sm"><Link href={`/workspace/integracoes/${option.provider}`}><Settings2 className="size-4" />Configurar {option.label}</Link></Button> : <><Button type="button" variant="outline" size="sm" onClick={() => setEditingPaymentProvider(option.provider)}><Settings2 className="size-4" />{option.configured ? 'Editar' : 'Configurar'}</Button>{option.configured && <Button type="button" variant="outline" size="sm" loading={state.status === 'testing'} onClick={() => void testPayment(option.provider)}>Testar conexão</Button>}{option.configured && !option.active && <Button type="button" size="sm" disabled={state.status !== 'ok' || pending} loading={pending} onClick={() => void activatePayment(option.provider)}>Ativar</Button>}{option.active && <Button type="button" variant="destructive" size="sm" disabled={pending} loading={pending} onClick={() => setPaymentProviderToDeactivate(option)}>Desativar</Button>}</>}</div></Card>;
        })}</div>
        {paymentOptions.length === 0 && <Card className="mt-4 p-5 text-sm text-muted-foreground">Nenhum provedor de pagamento está disponível.</Card>}
      </section>

      <section aria-labelledby="messaging-heading">
        <SectionHeader id="messaging-heading" icon={MessageCircle} title="Mensageria" description="Conecte um número de WhatsApp Business para notificar pedidos e links de pagamento." />
        <Card className="mt-4 overflow-hidden"><div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-3"><span className="flex size-11 shrink-0 items-center justify-center rounded-control bg-emerald-500/10 text-emerald-600"><MessageCircle className="size-5" aria-hidden="true" /></span><div><h3 className="font-bold text-foreground">bippa-messaging (WhatsApp)</h3><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Conecte um número de WhatsApp Business através do bippa-messaging para enviar confirmação de pedido e link de pagamento diretamente para a cliente.</p></div></div><Button asChild className="shrink-0"><Link href="/workspace/integracoes/whatsapp"><Settings2 className="size-4" />Configurar WhatsApp</Link></Button></div></Card>
      </section>

      <section aria-labelledby="fulfillment-heading">
        <SectionHeader id="fulfillment-heading" icon={PackageCheck} title="Separação de pedidos" description="Conecte o serviço que confirma a separação física dos itens do pedido." />
        <Card className="mt-4 overflow-hidden"><div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-3"><span className="flex size-11 shrink-0 items-center justify-center rounded-control bg-brand-primary text-lg font-black text-white">b</span><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-bold text-foreground">Bippa Separação</h3><Badge className="bg-brand-background text-muted-foreground">Em preparação</Badge></div><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">O Bippa será o integrador responsável por devolver a confirmação de separação dos pedidos. Quando a conexão estiver disponível, essas confirmações atualizarão automaticamente o andamento dos itens na ippa.</p></div></div><Button asChild variant="outline" className="shrink-0"><a href="https://bippa.com.br/" target="_blank" rel="noreferrer">Conhecer Bippa <ExternalLink className="size-4" aria-hidden="true" /></a></Button></div><div className="border-t border-border bg-brand-background px-5 py-3 text-xs leading-5 text-muted-foreground">Enquanto a conexão não é liberada, a confirmação de separação continua sendo feita no pedido dentro da ippa.</div></Card>
      </section>
    </main>
    {editing && <ErpProviderCredentialsModal option={editing} onClose={() => setEditingProvider(null)} onSaved={saveErp} />}
    <ConfirmDialog open={!!providerToDeactivate} onOpenChange={(open) => !open && setProviderToDeactivate(null)} title="Desativar integração?" description={`A sincronização com ${providerToDeactivate?.label || 'o ERP'} ficará pausada até que um provedor seja ativado novamente.`} confirmLabel="Desativar" destructive onConfirm={() => providerToDeactivate ? deactivateErp(providerToDeactivate) : undefined} />
    {editingPayment && <PaymentProviderCredentialsModal option={editingPayment} onClose={() => setEditingPaymentProvider(null)} onSaved={savePayment} />}
    <ConfirmDialog open={!!paymentProviderToDeactivate} onOpenChange={(open) => !open && setPaymentProviderToDeactivate(null)} title="Desativar gateway de pagamento?" description={`A cobrança via ${paymentProviderToDeactivate?.label || 'o provedor'} ficará indisponível até que um gateway seja ativado novamente.`} confirmLabel="Desativar" destructive onConfirm={() => paymentProviderToDeactivate ? deactivatePayment(paymentProviderToDeactivate) : undefined} />
  </div>;
}

function SectionHeader({ id, icon: Icon, title, description }) { return <div className="flex items-start gap-3"><span className="flex size-10 shrink-0 items-center justify-center rounded-control bg-brand-primary/10 text-brand-primary"><Icon className="size-5" aria-hidden="true" /></span><div><h2 id={id} className="font-bold text-foreground">{title}</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p></div></div>; }
function ProviderHeader({ option, state, icon }) { return <div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><ServiceIcon option={option} fallback={icon} /><h3 className="font-bold text-foreground">{option.label}</h3></div><IntegrationStatus active={option.active} configured={option.configured} state={state} /></div>; }
function ConnectionCopy({ option, state, activeCopy, configuredCopy, emptyCopy }) { const copy = state.status !== 'idle' ? state.status === 'testing' ? 'Testando conexão…' : state.message : option.configured ? option.active ? activeCopy : configuredCopy : emptyCopy; return <p className="mt-3 text-xs text-muted-foreground">{copy}</p>; }
