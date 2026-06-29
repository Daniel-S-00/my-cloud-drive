import * as React from 'react';

export const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(function Card({ className, ...props }, ref) {
  return (
    <div
      ref={ref}
      className={[
        'rounded-xl border border-zinc-200 bg-white text-zinc-950 shadow',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...props}
    />
  );
});

export const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(function CardHeader({ className, ...props }, ref) {
  return (
    <div
      ref={ref}
      className={['flex flex-col gap-1.5 p-6', className]
        .filter(Boolean)
        .join(' ')}
      {...props}
    />
  );
});

export const CardTitle = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(function CardTitle({ className, ...props }, ref) {
  return (
    <div
      ref={ref}
      className={['font-semibold leading-none tracking-tight', className]
        .filter(Boolean)
        .join(' ')}
      {...props}
    />
  );
});

export const CardDescription = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(function CardDescription({ className, ...props }, ref) {
  return (
    <div
      ref={ref}
      className={['text-sm text-zinc-500', className]
        .filter(Boolean)
        .join(' ')}
      {...props}
    />
  );
});

export const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(function CardContent({ className, ...props }, ref) {
  return (
    <div
      ref={ref}
      className={['p-6 pt-0', className].filter(Boolean).join(' ')}
      {...props}
    />
  );
});

export const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(function CardFooter({ className, ...props }, ref) {
  return (
    <div
      ref={ref}
      className={['flex items-center p-6 pt-0', className]
        .filter(Boolean)
        .join(' ')}
      {...props}
    />
  );
});
