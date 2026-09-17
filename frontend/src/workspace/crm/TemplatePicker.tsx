'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { adminUi } from '@/workspace/lib/ui';
import {
  fetchStandardWhatsAppTemplatesForSeller,
  type StandardWhatsAppTemplate,
} from '@/workspace/lib/whatsappIntegrationClient';
import { sendCrmTemplate } from '@/workspace/lib/crmClient';

// Único caminho de envio fora da janela de 24h (ver MessageComposer.tsx).
// Os dois templates hoje cadastrados (order_confirmed, payment_link) têm
// um botão de link dinâmico -- por isso o campo extra de "destino do
// botão" quando `template.button` existe. O backend valida a presença
// desse campo contra a definição real do template, não confia num flag
// mandado daqui.
export default function TemplatePicker({
  conversationId,
  sellerId,
  onClose,
  onSent,
}: {
  conversationId: string;
  sellerId: string;
  onClose: () => void;
  onSent: () => void;
}) {
  const [templates, setTemplates] = useState<StandardWhatsAppTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<StandardWhatsAppTemplate['key'] | null>(null);
  const [params, setParams] = useState<Record<string, string>>({});
  const [buttonParam, setButtonParam] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchStandardWhatsAppTemplatesForSeller(sellerId)
      .then((list) => {
        if (cancelled) return;
        setTemplates(list);
        setLoading(false);
      })
      .catch((cause) => {
        if (cancelled) return;
        setError(cause instanceof Error ? cause.message : 'Não foi possível carregar os templates.');
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sellerId]);

  const selected = templates.find((template) => template.key === selectedKey) ?? null;
  const bodyParameters = selected?.parameters.filter((parameter) => (parameter.component ?? 'body') === 'body') ?? [];

  async function handleSend() {
    if (!selected) return;
    if (selected.button && !buttonParam.trim()) {
      setError('Informe o destino do botão de link.');
      return;
    }
    if (bodyParameters.some((parameter) => !params[parameter.key]?.trim())) {
      setError('Preencha todas as variáveis do template.');
      return;
    }
    setSending(true);
    setError(null);
    try {
      await sendCrmTemplate(conversationId, {
        templateKey: selected.key,
        params: Object.fromEntries(bodyParameters.map((parameter) => [parameter.key, params[parameter.key]!.trim()])),
        buttonParam: selected.button ? buttonParam.trim() : undefined,
      });
      onSent();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível enviar o template.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className={adminUi.modalOverlay} role="dialog" aria-modal="true" aria-label="Enviar template">
      <section className={adminUi.modalPanel}>
        <header className={adminUi.modalHeader}>
          <div>
            <h2 className="font-bold">Enviar template</h2>
            <p className="mt-1 text-sm text-brand-muted">Único caminho fora da janela de atendimento de 24h.</p>
          </div>
          <button type="button" className={adminUi.iconButton} onClick={onClose} aria-label="Fechar">
            <X className="size-4" aria-hidden="true" />
          </button>
        </header>
        <div className={`${adminUi.modalBody} flex flex-col gap-4`}>
          {loading && <p className="text-sm text-muted-foreground">Carregando templates...</p>}
          {!loading && templates.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum template aprovado disponível para esta vendedora.</p>
          )}
          {!loading &&
            templates.map((template) => (
              <label
                key={template.key}
                className={`flex cursor-pointer flex-col gap-1 rounded-lg border p-3 text-sm ${
                  selectedKey === template.key ? 'border-brand-primary bg-brand-primary/5' : 'border-border'
                }`}
              >
                <span className="flex items-center gap-2 font-semibold text-foreground">
                  <input
                    type="radio"
                    name="crm-template"
                    checked={selectedKey === template.key}
                    onChange={() => {
                      setSelectedKey(template.key);
                      setParams({});
                      setButtonParam('');
                      setError(null);
                    }}
                  />
                  {template.title}
                </span>
                <span className="text-xs text-muted-foreground">{template.description}</span>
                <span className="whitespace-pre-wrap rounded bg-brand-background p-2 text-xs text-foreground">{template.body}</span>
              </label>
            ))}

          {selected && (
            <div className="flex flex-col gap-2">
              {bodyParameters.map((parameter) => (
                <div key={parameter.key} className={adminUi.field}>
                  <label>{parameter.label}</label>
                  <input
                    value={params[parameter.key] ?? ''}
                    placeholder={parameter.example}
                    onChange={(event) => setParams((prev) => ({ ...prev, [parameter.key]: event.target.value }))}
                  />
                </div>
              ))}
              {selected.button && (
                <div className={adminUi.field}>
                  <label>Destino do botão &ldquo;{selected.button.text}&rdquo;</label>
                  <input
                    value={buttonParam}
                    placeholder="pedidos/1234"
                    onChange={(event) => setButtonParam(event.target.value)}
                  />
                  <p className={adminUi.hint}>Só o caminho, sem domínio -- ex.: o final do link do pedido ou do pagamento que a cliente precisa abrir.</p>
                </div>
              )}
            </div>
          )}

          {error && <p className="text-sm text-[#b00020]">{error}</p>}
        </div>
        <footer className={adminUi.modalFooter}>
          <button type="button" className={adminUi.button} onClick={onClose}>Cancelar</button>
          <button type="button" className={adminUi.primaryButton} onClick={() => void handleSend()} disabled={!selected || sending}>
            {sending ? 'Enviando...' : 'Enviar template'}
          </button>
        </footer>
      </section>
    </div>
  );
}
