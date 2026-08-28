'use client';

import { useState } from 'react';
import { MapPin, PackageCheck, Save, Truck } from 'lucide-react';
import { toast } from 'sonner';
import type { DeliveryType } from '@/domain/orders/types';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { HubHeader } from '@/workspace/components/shared/HubHeader';
import { updateDeliveryType } from '@/workspace/lib/deliveryTypesClient';

interface Draft {
  name: string;
  active: boolean;
  sortOrder: string;
  fixedPrice: string;
  etaLabel: string;
}

function draftFromType(type: DeliveryType): Draft {
  return {
    name: type.name,
    active: type.active,
    sortOrder: String(type.sortOrder),
    fixedPrice: String(type.offering.fixedPrice ?? 0),
    etaLabel: type.offering.etaLabel ?? '',
  };
}

export default function DeliveryTypesApp({ initialTypes }: { initialTypes: DeliveryType[] }) {
  const [types, setTypes] = useState(initialTypes);
  const [drafts, setDrafts] = useState<Record<string, Draft>>(
    Object.fromEntries(initialTypes.map((type) => [type.id, draftFromType(type)])),
  );
  const [savingId, setSavingId] = useState<string | null>(null);

  function updateDraft(id: string, patch: Partial<Draft>) {
    setDrafts((current) => ({ ...current, [id]: { ...current[id], ...patch } }));
  }

  async function save(type: DeliveryType) {
    const draft = drafts[type.id];
    setSavingId(type.id);
    try {
      const updated = await updateDeliveryType(type.id, {
        name: draft.name,
        active: draft.active,
        sortOrder: Number(draft.sortOrder),
        fixedPrice: Number(draft.fixedPrice),
        etaLabel: draft.etaLabel.trim() || null,
      });
      setTypes((current) => current
        .map((entry) => entry.id === updated.id ? updated : entry)
        .sort((a, b) => a.sortOrder - b.sortOrder));
      setDrafts((current) => ({ ...current, [updated.id]: draftFromType(updated) }));
      toast.success('Tipo de entrega salvo.');
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Não foi possível salvar.');
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <HubHeader
        title="Entregas"
        description="Configure como a cliente recebe o pedido. Providers externos serão adicionados em uma próxima etapa."
      />
      <main className="grid gap-4 p-4 sm:p-6 lg:grid-cols-2">
        {types.map((type) => {
          const draft = drafts[type.id];
          const pickup = type.fulfillmentMode === 'pickup';
          const Icon = pickup ? PackageCheck : Truck;
          return (
            <Card key={type.id}>
              <div className="p-5 pb-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex gap-3">
                    <span className="flex size-10 items-center justify-center rounded-full bg-brand-background text-brand-primary">
                      <Icon className="size-5" aria-hidden="true" />
                    </span>
                    <div>
                      <h2 className="font-bold text-foreground">{pickup ? 'Retirada' : 'Entrega no endereço'}</h2>
                      <p className="mt-1 text-sm text-muted-foreground">Código do sistema: {type.code}</p>
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <input
                      type="checkbox"
                      checked={draft.active}
                      onChange={(event) => updateDraft(type.id, { active: event.target.checked })}
                    />
                    Ativo
                  </label>
                </div>
              </div>
              <div className="space-y-4 p-5">
                <label className="block space-y-1.5 text-sm font-medium">
                  <span>Nome exibido no checkout</span>
                  <Input value={draft.name} onChange={(event) => updateDraft(type.id, { name: event.target.value })} />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block space-y-1.5 text-sm font-medium">
                    <span>Preço fixo</span>
                    <Input type="number" min="0" step="0.01" value={draft.fixedPrice} onChange={(event) => updateDraft(type.id, { fixedPrice: event.target.value })} />
                  </label>
                  <label className="block space-y-1.5 text-sm font-medium">
                    <span>Ordem</span>
                    <Input type="number" min="0" step="1" value={draft.sortOrder} onChange={(event) => updateDraft(type.id, { sortOrder: event.target.value })} />
                  </label>
                </div>
                <label className="block space-y-1.5 text-sm font-medium">
                  <span>Prazo exibido</span>
                  <Input value={draft.etaLabel} onChange={(event) => updateDraft(type.id, { etaLabel: event.target.value })} placeholder={pickup ? 'Ex.: Disponível após confirmação' : 'Ex.: 5 a 8 dias úteis'} />
                </label>
                <div className="rounded-control border border-border bg-muted/30 p-3 text-sm">
                  <p className="flex items-center gap-2 font-semibold"><MapPin className="size-4" aria-hidden="true" />Provider responsável</p>
                  <p className="mt-1 text-muted-foreground">{type.offering.provider.name} · própria empresa</p>
                </div>
                <div className="flex justify-end">
                  <Button type="button" onClick={() => void save(type)} disabled={savingId !== null}>
                    <Save className="size-4" aria-hidden="true" />
                    {savingId === type.id ? 'Salvando…' : 'Salvar'}
                  </Button>
                </div>
              </div>
            </Card>
          );
        })}
      </main>
    </div>
  );
}
