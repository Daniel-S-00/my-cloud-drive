import * as React from 'react';

export type ProgressProps = React.HTMLAttributes<HTMLDivElement> & {
  value?: number;
  max?: number;
  ariaLabel?: string;
};

export const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
  function Progress(
    { value = 0, max = 100, className, ariaLabel, ...props },
    ref,
  ) {
    const clamped = Math.max(0, Math.min(max, value));
    const pct = max > 0 ? (clamped / max) * 100 : 0;

    return (
      <div
        ref={ref}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={clamped}
        aria-label={ariaLabel}
        className={[
          'relative h-2 w-full overflow-hidden rounded-full bg-zinc-200',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        {...props}
      >
        <div
          className="h-full bg-zinc-900 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    );
  },
);
