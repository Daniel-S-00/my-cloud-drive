import * as React from 'react';

type ButtonVariant = 'default' | 'outline' | 'ghost' | 'secondary' | 'destructive';
type ButtonSize = 'default' | 'sm' | 'lg' | 'icon';

const baseClasses =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-950 disabled:pointer-events-none disabled:opacity-50';

const variantClasses: Record<ButtonVariant, string> = {
  default: 'bg-zinc-900 text-zinc-50 shadow hover:bg-zinc-800',
  outline:
    'border border-zinc-200 bg-white shadow-sm hover:bg-zinc-100 hover:text-zinc-900',
  ghost: 'hover:bg-zinc-100 hover:text-zinc-900',
  secondary: 'bg-zinc-100 text-zinc-900 shadow-sm hover:bg-zinc-200',
  destructive:
    'bg-red-600 text-white shadow-sm hover:bg-red-700 focus-visible:ring-red-700',
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
