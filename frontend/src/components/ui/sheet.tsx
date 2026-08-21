'use client';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;

export function SheetContent({ className, children, side = 'right', mobileSide, overlayClassName, ...props }: ComponentProps<typeof DialogPrimitive.Content> & { side?: 'left' | 'right'; mobileSide?: 'bottom'; overlayClassName?: string }) {
  const placement = side === 'left' ? 'left-0 border-r' : 'right-0 border-l';
  const mobileBottom = mobileSide === 'bottom';
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className={cn('fixed inset-0 z-[70] bg-black/40', overlayClassName)} />
      <DialogPrimitive.Content
        className={cn(
          'fixed z-[71] flex flex-col border-border bg-surface shadow-float outline-none',
          mobileBottom
            ? 'inset-x-0 bottom-0 h-[min(88dvh,48rem)] w-full translate-y-full rounded-t-[1.5rem] border-t transition-transform duration-300 ease-out data-[state=open]:translate-y-0 data-[state=closed]:translate-y-full md:inset-y-0 md:right-0 md:bottom-auto md:left-auto md:h-auto md:w-[min(100%,25rem)] md:translate-x-full md:translate-y-0 md:rounded-none md:border-l md:data-[state=open]:translate-x-0 md:data-[state=closed]:translate-x-full'
            : 'inset-y-0 w-[min(100%,25rem)]',
          !mobileBottom && placement,
          className,
        )}
        {...props}
      >
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function SheetHeader({ children, closeLabel = 'Fechar' }: { children: ReactNode; closeLabel?: string }) {
  return <div className="flex min-h-16 items-center justify-between border-b border-border px-5">{children}<DialogPrimitive.Close className="inline-flex size-11 items-center justify-center rounded-control text-muted-foreground hover:bg-brand-background hover:text-foreground" aria-label={closeLabel}><X className="size-5" /></DialogPrimitive.Close></div>;
}
