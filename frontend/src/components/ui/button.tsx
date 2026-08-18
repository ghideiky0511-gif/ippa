import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { LoaderCircle } from 'lucide-react';
import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

const buttonVariants = cva(
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-control px-4 text-sm font-bold transition-[background,color,border,box-shadow,transform] duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary disabled:pointer-events-none disabled:opacity-50 active:scale-[.98]',
  {
    variants: {
      variant: {
        primary: 'bg-brand-primary text-white shadow-sm hover:bg-brand-primary-dark',
        secondary: 'bg-brand-background text-brand-primary hover:bg-[#f1e8ec]',
        outline: 'border border-border bg-surface text-foreground hover:border-brand-primary hover:text-brand-primary',
        ghost: 'text-muted-foreground hover:bg-brand-background hover:text-brand-primary',
        destructive: 'bg-danger text-white hover:bg-[#941b31]',
      },
      size: {
        sm: 'min-h-9 px-3 text-xs',
        md: 'min-h-11 px-4',
        lg: 'min-h-12 px-5 text-base',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  }
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export function Button({ className, variant, size, asChild = false, loading = false, disabled, children, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : 'button';
  return (
    <Comp className={cn(buttonVariants({ variant, size }), className)} disabled={disabled || loading} {...props}>
      {asChild ? children : (
        <>
          {loading && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}
          {children}
        </>
      )}
    </Comp>
  );
}

export { buttonVariants };
