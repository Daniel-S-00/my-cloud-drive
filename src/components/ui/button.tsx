import * as React from 'react';

type ButtonVariant =
  | 'default'
  | 'primary'
  | 'outline'
  | 'ghost'
  | 'secondary'
  | 'destructive'
  | 'destructiveOutline';
type ButtonSize = 'default' | 'sm' | 'lg' | 'icon';

const baseClasses =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent-glow disabled:pointer-events-none disabled:opacity-50';

const variantClasses: Record<ButtonVariant, string> = {
  default:
    'border border-border-subtle bg-bg-surface text-text-primary shadow hover:bg-bg-surface-hover',
  primary:
    'bg-accent-primary text-white shadow hover:bg-accent-glow focus-visible:ring-accent-glow',
  outline:
    'border border-border-subtle bg-bg-surface text-text-primary shadow-sm hover:bg-bg-surface-hover hover:text-text-primary',
  ghost:
    'text-text-primary hover:bg-bg-surface-hover hover:text-text-primary',
  secondary:
    'bg-bg-surface-hover text-text-primary shadow-sm hover:bg-bg-surface',
  destructive:
    'bg-red-600 text-white shadow-sm hover:bg-red-700 focus-visible:ring-red-700',
  destructiveOutline:
    'border border-border-subtle bg-bg-surface text-red-400 shadow-sm hover:border-red-600 hover:bg-red-600 hover:text-white focus-visible:ring-red-700',
};

const sizeClasses: Record<ButtonSize, string> = {
  default: 'h-9 px-4 py-2',
  sm: 'h-8 rounded-md px-3 text-xs',
  lg: 'h-10 rounded-md px-8',
  icon: 'h-9 w-9',
};

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    { className, variant = 'default', size = 'default', type, ...props },
    ref,
  ) {
    const classes = [
      baseClasses,
      variantClasses[variant],
      sizeClasses[size],
      className,
    ]
      .filter(Boolean)
      .join(' ');

    return <button ref={ref} type={type ?? 'button'} className={classes} {...props} />;
  },
);
