'use client';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { X } from 'lucide-react';
import { createContext, useContext, useEffect, useState, type ComponentProps, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

const SheetOpenContext = createContext<{ open: boolean; onExitComplete?: () => void }>({ open: false });

export function Sheet({
  open = false,
  onExitComplete,
  ...props
}: ComponentProps<typeof DialogPrimitive.Root> & {
  /** Chamado quando a animação de saída termina — só então é seguro desmontar quem controla `open`. */
  onExitComplete?: () => void;
}) {
  return (
    <SheetOpenContext.Provider value={{ open, onExitComplete }}>
      <DialogPrimitive.Root open={open} {...props} />
    </SheetOpenContext.Provider>
  );
}

export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;

const SLIDE_TRANSITION = { type: 'spring', stiffness: 340, damping: 34, mass: 0.9 } as const;

// Radix só monta o Content quando `open` já é true — não existe um frame
// "fechado" pra uma transição CSS animar a partir, por isso o painel
// abria de golpe. forceMount + AnimatePresence dão esse frame inicial e o
// motion controla a entrada/saída (mesma lib do layoutId de produto).
function useIsDesktopViewport() {
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches
  );
  useEffect(() => {
    const mql = window.matchMedia('(min-width: 768px)');
    setIsDesktop(mql.matches);
    const onChange = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);
  return isDesktop;
}

export function SheetContent({
  className,
  children,
  side = 'right',
  mobileSide,
  overlayClassName,
  dragOffsetY,
  ...props
}: ComponentProps<typeof DialogPrimitive.Content> & {
  side?: 'left' | 'right';
  mobileSide?: 'bottom';
  overlayClassName?: string;
  /** Offset ao vivo (px) de um gesto de arrastar-pra-fechar; não passa pelo spring de abertura/fechamento. */
  dragOffsetY?: number;
}) {
  const { open, onExitComplete } = useContext(SheetOpenContext);
  const shouldReduceMotion = useReducedMotion();
  const isDesktop = useIsDesktopViewport();
  const mobileBottom = mobileSide === 'bottom';
  const placement = side === 'left' ? 'left-0 border-r' : 'right-0 border-l';
  const slidesFromBottom = mobileBottom && !isDesktop;
  const offscreen = slidesFromBottom
    ? { x: 0, y: '100%' }
    : { x: side === 'left' ? '-100%' : '100%', y: 0 };
  const transition = shouldReduceMotion ? { duration: 0 } : SLIDE_TRANSITION;

  return (
    <AnimatePresence onExitComplete={onExitComplete}>
      {open && (
        <DialogPrimitive.Portal forceMount>
          <DialogPrimitive.Overlay asChild forceMount>
            <motion.div
              className={cn('fixed inset-0 z-[70] bg-black/40', overlayClassName)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: shouldReduceMotion ? 0 : 0.2 }}
            />
          </DialogPrimitive.Overlay>
          <DialogPrimitive.Content asChild forceMount {...props}>
            <motion.div
              className={cn(
                'fixed z-[71] border-border bg-surface shadow-float outline-none',
                mobileBottom
                  ? 'inset-x-0 bottom-0 h-[min(88dvh,48rem)] w-full rounded-t-[1.5rem] border-t md:inset-y-0 md:right-0 md:left-auto md:h-auto md:w-[min(100%,25rem)] md:rounded-none md:border-l'
                  : cn('inset-y-0 w-[min(100%,25rem)]', placement),
                className,
              )}
              initial={offscreen}
              animate={{ x: 0, y: 0 }}
              exit={offscreen}
              transition={transition}
            >
              <div
                className="flex h-full min-h-0 flex-col"
                style={dragOffsetY ? { transform: `translateY(${dragOffsetY}px)` } : undefined}
              >
                {children}
              </div>
            </motion.div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      )}
    </AnimatePresence>
  );
}

export function SheetHeader({ children, closeLabel = 'Fechar' }: { children: ReactNode; closeLabel?: string }) {
  return <div className="flex min-h-16 items-center justify-between border-b border-border px-5">{children}<DialogPrimitive.Close className="inline-flex size-11 items-center justify-center rounded-control text-muted-foreground hover:bg-brand-background hover:text-foreground" aria-label={closeLabel}><X className="size-5" /></DialogPrimitive.Close></div>;
}
