import * as React from 'react';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  function Input({ className, type, ...props }, ref) {
    return (
      <input
        ref={ref}
        type={type}
        className={[
          'flex h-9 w-full rounded-md border border-border-subtle bg-bg-surface px-3 py-1 text-sm text-text-primary shadow-sm transition-colors',
          'placeholder:text-text-secondary',
          'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent-glow focus-visible:border-accent-glow',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-text-primary',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        {...props}
      />
    );
  },
);
