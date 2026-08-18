'use client';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;

export function SheetContent({ className, children, side = 'right', ...props }: ComponentProps<typeof DialogPrimitive.Content> & { side?: 'left' | 'right' }) {
  const placement = side === 'left' ? 'left-0 border-r' : 'right-0 border-l';
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-[70] bg-black/40" />
      <DialogPrimitive.Content className={cn('fixed inset-y-0 z-[71] flex w-[min(100%,25rem)] flex-col border-border bg-surface shadow-float outline-none', placement, className)} {...props}>
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function SheetHeader({ children, closeLabel = 'Fechar' }: { children: ReactNode; closeLabel?: string }) {
  return <div className="flex min-h-16 items-center justify-between border-b border-border px-5">{children}<DialogPrimitive.Close className="inline-flex size-11 items-center justify-center rounded-control text-muted-foreground hover:bg-brand-background hover:text-foreground" aria-label={closeLabel}><X className="size-5" /></DialogPrimitive.Close></div>;
}
