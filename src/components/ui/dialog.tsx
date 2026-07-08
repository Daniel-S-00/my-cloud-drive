'use client';

import * as React from 'react';

type DialogContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  titleId: string;
  descriptionId: string;
};

const DialogContext = React.createContext<DialogContextValue | null>(null);

function useDialogContext(component: string): DialogContextValue {
  const ctx = React.useContext(DialogContext);
  if (!ctx) {
    throw new Error(`${component} must be used within a <Dialog>`);
  }
  return ctx;
}

export type DialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
};

export function Dialog({ open, onOpenChange, children }: DialogProps) {
  const reactId = React.useId();
  const titleId = `${reactId}-title`;
  const descriptionId = `${reactId}-description`;

  const value = React.useMemo<DialogContextValue>(
    () => ({ open, setOpen: onOpenChange, titleId, descriptionId }),
    [open, onOpenChange, titleId, descriptionId],
  );

  return (
    <DialogContext.Provider value={value}>{children}</DialogContext.Provider>
  );
}

export type DialogContentProps = Omit<
  React.HTMLAttributes<HTMLDialogElement>,
  'onClick'
> & {
  children: React.ReactNode;
  onClose?: () => void;
};

export const DialogContent = React.forwardRef<HTMLDialogElement, DialogContentProps>(
  function DialogContent({ className, children, onClose, ...props }, ref) {
    const { open, setOpen, titleId, descriptionId } = useDialogContext('DialogContent');
    const innerRef = React.useRef<HTMLDialogElement | null>(null);

    React.useEffect(() => {
      const el = innerRef.current;
      if (!el) return;
      if (open && !el.open) {
        el.showModal();
      } else if (!open && el.open) {
        el.close();
      }
    }, [open]);

    React.useEffect(() => {
      const el = innerRef.current;
      if (!el) return;
      const handleClose = () => {
        setOpen(false);
        onClose?.();
      };
      el.addEventListener('close', handleClose);
      return () => el.removeEventListener('close', handleClose);
    }, [setOpen, onClose]);

    const setRefs = React.useCallback(
      (node: HTMLDialogElement | null) => {
        innerRef.current = node;
        if (typeof ref === 'function') {
          ref(node);
        } else if (ref) {
          (ref as React.MutableRefObject<HTMLDialogElement | null>).current = node;
        }
      },
      [ref],
    );

    return (
      <dialog
        ref={setRefs}
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className={[
          'fixed inset-0 z-50 m-auto max-h-[90vh] max-w-2xl w-[calc(100%-2rem)] rounded-xl border border-border-subtle bg-bg-surface p-0 text-text-primary shadow-lg backdrop:bg-black/60',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        onClick={(event) => {
          if (event.target === innerRef.current) {
            setOpen(false);
          }
        }}
        {...props}
      >
        <div className="overflow-auto">{children}</div>
      </dialog>
    );
  },
);

export type DialogHeaderProps = React.HTMLAttributes<HTMLDivElement>;
export const DialogHeader = React.forwardRef<HTMLDivElement, DialogHeaderProps>(
  function DialogHeader({ className, ...props }, ref) {
    return (
      <div
        ref={ref}
        className={['flex flex-col gap-1.5 p-6', className]
          .filter(Boolean)
          .join(' ')}
        {...props}
      />
    );
  },
);

export type DialogTitleProps = React.HTMLAttributes<HTMLHeadingElement>;
export const DialogTitle = React.forwardRef<HTMLHeadingElement, DialogTitleProps>(
  function DialogTitle({ className, ...props }, ref) {
    const { titleId } = useDialogContext('DialogTitle');
    return (
      <h2
        ref={ref}
        id={titleId}
        className={['font-semibold leading-none tracking-tight', className]
          .filter(Boolean)
          .join(' ')}
        {...props}
      />
    );
  },
);

export type DialogDescriptionProps = React.HTMLAttributes<HTMLParagraphElement>;
export const DialogDescription = React.forwardRef<
  HTMLParagraphElement,
  DialogDescriptionProps
>(function DialogDescription({ className, ...props }, ref) {
  const { descriptionId } = useDialogContext('DialogDescription');
  return (
    <p
      ref={ref}
      id={descriptionId}
      className={['text-sm text-text-secondary', className]
        .filter(Boolean)
        .join(' ')}
      {...props}
    />
  );
});

export type DialogBodyProps = React.HTMLAttributes<HTMLDivElement>;
export const DialogBody = React.forwardRef<HTMLDivElement, DialogBodyProps>(
  function DialogBody({ className, ...props }, ref) {
    return (
      <div
        ref={ref}
        className={['px-6 py-2', className].filter(Boolean).join(' ')}
        {...props}
      />
    );
  },
);

export type DialogFooterProps = React.HTMLAttributes<HTMLDivElement>;
export const DialogFooter = React.forwardRef<HTMLDivElement, DialogFooterProps>(
  function DialogFooter({ className, ...props }, ref) {
    return (
      <div
        ref={ref}
        className={[
          'flex flex-col-reverse gap-2 p-6 pt-2 sm:flex-row sm:justify-end sm:gap-2',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        {...props}
      />
    );
  },
);
