import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cn('min-h-11 w-full rounded-control border border-border bg-surface px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-brand-primary focus:outline-none', className)} {...props} />;
}
