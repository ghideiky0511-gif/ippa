'use client';

import { AlertTriangle } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

type ConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
};

/** Diálogo acessível para confirmar ações importantes, substituindo window.confirm. */
export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel = 'Confirmar', cancelLabel = 'Cancelar', destructive = false, onConfirm }: ConfirmDialogProps) {
  const [confirming, setConfirming] = useState(false);

  async function confirm() {
    setConfirming(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } finally {
      setConfirming(false);
    }
  }

  return <Dialog open={open} onOpenChange={(nextOpen) => !confirming && onOpenChange(nextOpen)}>
    <DialogContent onPointerDownOutside={(event) => confirming && event.preventDefault()}>
      <DialogHeader>
        <div className="flex gap-3">
          <span className={destructive ? 'flex size-10 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600' : 'flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-background text-brand-primary'}><AlertTriangle className="size-5" aria-hidden="true" /></span>
          <div><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></div>
        </div>
      </DialogHeader>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={confirming}>{cancelLabel}</Button>
        <Button type="button" variant={destructive ? 'destructive' : 'primary'} loading={confirming} onClick={() => void confirm()}>{confirmLabel}</Button>
      </div>
    </DialogContent>
  </Dialog>;
}
