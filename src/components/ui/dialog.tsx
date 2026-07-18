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
  /** Enables enter/leave CSS transitions instead of the native dialog top layer. */
  animated?: boolean;
};

/**
 * Animated dialog using a plain `<div>` (not the native `<dialog>` element).
 * Uses a simple two-state boolean so open/close transitions are reliable.
 * GPU-friendly: only `opacity` + `transform: scale()` are animated.
 */
function AnimatedDialogContent({
  className,
  children,
  onClose,
  ...props
}: Omit<DialogContentProps, 'animated'>) {
  const { open, setOpen, titleId, descriptionId } = useDialogContext('AnimatedDialogContent');
  const innerRef = React.useRef<HTMLDivElement | null>(null);
  const [isOpen, setIsOpen] = React.useState(false);
  const [shouldRender, setShouldRender] = React.useState(false);

  // Mount phase: when the parent sets open=true, render the DOM, then
  // flip isOpen on the next frame so the CSS transition plays.
  React.useEffect(() => {
    if (open && !shouldRender) {
      requestAnimationFrame(() => setShouldRender(true));
    }
  }, [open, shouldRender]);

  React.useEffect(() => {
    if (shouldRender) {
      requestAnimationFrame(() => setIsOpen(true));
    }
  }, [shouldRender]);

  // Unmount phase: parent sets open=false → isOpen flips to false →
  // CSS close transition plays → after 150ms unmount from DOM.
  React.useEffect(() => {
    if (!open && shouldRender) {
      requestAnimationFrame(() => {
        setIsOpen(false);
        setTimeout(() => setShouldRender(false), 150);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleClose = React.useCallback(() => {
    setIsOpen(false);
    setTimeout(() => {
      setOpen(false);
      onClose?.();
    }, 150);
  }, [setOpen, onClose]);

  // Keyboard: Escape to close
  React.useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen) {
        event.preventDefault();
        handleClose();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, handleClose]);

  if (!shouldRender) return null;

  return (
    <>
      {/* Manual backdrop overlay with fade */}
      <div
        aria-hidden
        className={[
          'fixed inset-0 z-50 bg-black/60',
          'transition-opacity duration-200 ease-out',
          isOpen ? 'opacity-100' : 'opacity-0',
        ].join(' ')}
        onClick={handleClose}
      />
      {/* Modal panel with scale + opacity transition */}
      <div
        ref={innerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className={[
          'fixed inset-0 z-50 m-auto flex flex-col h-auto max-h-[85vh] max-w-[calc(100%-2rem)] sm:max-w-[90vw] rounded-xl border border-border-subtle bg-bg-surface p-0 text-text-primary shadow-lg overflow-auto',
          'transition-all duration-200 ease-out',
          isOpen ? 'opacity-100 scale-100' : 'opacity-0 scale-95',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        onClick={(event) => {
          if (event.target === innerRef.current) {
            handleClose();
          }
        }}
        {...(props as React.HTMLAttributes<HTMLDivElement>)}
      >
        {children}
      </div>
    </>
  );
}

/**
 * Native `<dialog>` rendering using `showModal()` / `close()`.
 * The browser provides backdrop, focus trapping, and Esc handling.
 */
const NativeDialogContent = React.forwardRef<HTMLDialogElement, DialogContentProps>(
  function NativeDialogContent(
    { className, children, onClose, ...props },
    _ref,
  ) {
    const { open, setOpen, titleId, descriptionId } =
      useDialogContext('NativeDialogContent');
    const innerRef = React.useRef<HTMLDialogElement | null>(null);

    // Merge external ref with local ref
    const setRef = React.useCallback(
      (node: HTMLDialogElement | null) => {
        innerRef.current = node;
        if (typeof _ref === 'function') _ref(node);
        else if (_ref) (_ref as React.MutableRefObject<HTMLDialogElement | null>).current = node;
      },
      [_ref],
    );

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

    return (
      <dialog
        ref={setRef}
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

export const DialogContent = React.forwardRef<HTMLDialogElement, DialogContentProps>(
  function DialogContent({ animated, ...rest }, ref) {
    if (animated) {
      return <AnimatedDialogContent {...rest} />;
    }
    return <NativeDialogContent ref={ref} {...rest} />;
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
