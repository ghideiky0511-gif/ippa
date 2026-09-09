'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { adminUi } from '@/workspace/lib/ui';
import { savePixSettings, type PaymentIntegrationOption } from '@/workspace/lib/paymentIntegrationClient';

const KEY_TYPE_OPTIONS: Array<{ value: NonNullable<PaymentIntegrationOption['pixKeyType']>; label: string }> = [
  { value: 'CPF', label: 'CPF' },
  { value: 'CNPJ', label: 'CNPJ' },
  { value: 'EMAIL', label: 'E-mail' },
  { value: 'PHONE', label: 'Telefone' },
  { value: 'EVP', label: 'Aleatória' },
];

// Usado pelo payment_order nativo do WhatsApp (envio Pix pagável DENTRO do
// WhatsApp, ver OrderDetailApp.tsx) -- a Meta exige merchant_name/key/
// key_type junto do código copia-e-cola (que já é gerado na hora do envio
// pelo PSP ativo), então esses 3 campos precisam estar salvos ANTES do
// primeiro envio nativo. Não são segredo (diferente das credenciais do
// gateway) -- por isso vêm pré-preenchidos, ao contrário de
// PaymentProviderCredentialsModal.tsx.
export function PixNativePaymentSettingsForm({
  provider,
  option,
  onSaved,
}: {
  provider: 'stripe' | 'mercadopago';
  option: PaymentIntegrationOption | null;
  onSaved: (option: PaymentIntegrationOption) => void;
}) {
  const [merchantName, setMerchantName] = useState('');
  const [key, setKey] = useState('');
  const [keyType, setKeyType] = useState<NonNullable<PaymentIntegrationOption['pixKeyType']>>('EVP');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // Ajusta o rascunho durante a renderização (em vez de um useEffect) quando
  // o valor salvo mudar -- mesmo padrão recomendado pelo React pra
  // "resetar estado quando uma prop muda" sem o round-trip extra de um
  // efeito. `loadedFor` guarda o snapshot já refletido no rascunho.
  const [loadedFor, setLoadedFor] = useState<PaymentIntegrationOption | null>(null);
  if (option && option !== loadedFor) {
    setLoadedFor(option);
    setMerchantName(option.pixMerchantName ?? '');
    setKey(option.pixKey ?? '');
    setKeyType(option.pixKeyType ?? 'EVP');
  }

  if (!option?.configured) return null;

  async function save() {
    setPending(true);
    setMessage(null);
    try {
      const updated = await savePixSettings(provider, { pixMerchantName: merchantName, pixKey: key, pixKeyType: keyType });
      onSaved(updated);
      setMessage('Chave Pix salva.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível salvar a chave Pix.');
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="rounded-brand border border-border bg-surface p-5">
      <h2 className="font-bold text-foreground">Chave Pix para pagamento nativo no WhatsApp</h2>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">
        Usada só quando o pedido é enviado como cobrança Pix nativa (pagável dentro do próprio WhatsApp, sem sair do app) — o código copia-e-cola em si continua sendo gerado por este gateway a cada envio.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className={adminUi.field}>
          <label>Nome do recebedor</label>
          <input type="text" value={merchantName} onChange={(event) => setMerchantName(event.target.value)} placeholder="Nome exibido na cliente" />
        </div>
        <div className={adminUi.field}>
          <label>Tipo de chave</label>
          <select value={keyType} onChange={(event) => setKeyType(event.target.value as NonNullable<PaymentIntegrationOption['pixKeyType']>)}>
            {KEY_TYPE_OPTIONS.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
        </div>
        <div className={`${adminUi.field} sm:col-span-2`}>
          <label>Chave Pix</label>
          <input type="text" value={key} onChange={(event) => setKey(event.target.value)} placeholder="CPF, CNPJ, e-mail, telefone ou chave aleatória" />
        </div>
      </div>
      <div className="mt-4">
        <Button type="button" disabled={pending} onClick={() => void save()}>{pending ? 'Salvando…' : 'Salvar chave Pix'}</Button>
      </div>
      {message && <p className="mt-3 text-sm text-muted-foreground" role="status">{message}</p>}
    </section>
  );
}
