import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

export function Select({ className, ...props }: ComponentProps<'select'>) {
  return <select className={cn('min-h-11 w-full rounded-control border border-border bg-surface px-3 text-sm text-foreground focus:border-brand-primary focus:outline-none', className)} {...props} />;
}
