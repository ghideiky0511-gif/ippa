'use client';
import { publicUi } from '@/lib/ui';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader } from '@/components/ui/sheet';

export default function ShareCatalogSheet({ open, onOpenChange, publicPath }: { open: boolean; onOpenChange: (open: boolean) => void; publicPath: string }) {
  const [copied, setCopied] = useState<string | null>(null);
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  const links = [
    { id: 'with-price', label: 'Catálogo público com preço', url: `${origin}${publicPath}` },
    { id: 'without-price', label: 'Catálogo público sem preço', url: `${origin}${publicPath}?precos=ocultos` },
  ];
  async function copy(id: string, url: string) {
    await navigator.clipboard.writeText(url);
    setCopied(id);
    window.setTimeout(() => setCopied(null), 1800);
  }
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[min(100%,30rem)]">
        <SheetHeader>
          <div>
            <h2 className="font-bold">Link público do catálogo</h2>
            <p className="mt-1 text-xs text-muted-foreground">Escolha a versão para compartilhar com a cliente.</p>
          </div>
        </SheetHeader>
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-5">
          {links.map((link) => (
            <div key={link.id} className="rounded-brand border border-border bg-white p-4">
              <h3 className="text-sm font-semibold">{link.label}</h3>
              <p className="mt-1 text-xs text-brand-muted">{link.id === 'with-price' ? 'Mostra os valores de venda.' : 'Mostra peças, cores e grades sem valores.'}</p>
              <input readOnly value={link.url} onClick={(event) => event.currentTarget.select()} className="mt-3 w-full rounded-control border border-border bg-brand-background px-3 py-2 text-xs text-brand-muted" />
              <div className="mt-3 flex gap-2">
                <button type="button" className={`${publicUi.subtleButton} inline-flex items-center gap-2`} onClick={() => void copy(link.id, link.url)} disabled={!origin}>
                  {copied === link.id ? <Check className="size-4" /> : <Copy className="size-4" />}
                  {copied === link.id ? 'Copiado' : 'Copiar link'}
                </button>
                <a className={`${publicUi.subtleButton} inline-flex items-center gap-2`} href={link.url} target="_blank" rel="noreferrer">Abrir</a>
              </div>
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
