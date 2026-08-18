import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

export function Badge({ className, ...props }: ComponentProps<'span'>) {
  return <span className={cn('inline-flex items-center rounded-full bg-brand-background px-2 py-0.5 text-[10px] font-extrabold tracking-[0.08em] text-brand-primary uppercase', className)} {...props} />;
}
