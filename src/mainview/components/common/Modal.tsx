import type React from "react";
import { useEffect, useRef } from "react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export function Modal({
  open,
  onClose,
  title,
  children,
  actions,
  className = "",
}: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<Element | null>(null);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;

    if (open && !el.open) {
      // Remember the element that had focus before the modal opened
      triggerRef.current = document.activeElement;
      el.showModal();
    } else if (!open && el.open) {
      el.close();
      // Return focus to the element that triggered the modal
      if (triggerRef.current instanceof HTMLElement) {
        triggerRef.current.focus();
      }
      triggerRef.current = null;
    }
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      className="modal modal-middle"
      onClose={onClose}
      aria-modal="true"
    >
      <div className={`modal-box ${className}`} role="document">
        {title && <h3 className="font-bold text-lg">{title}</h3>}
        <div className="py-4">{children}</div>
        {actions && <div className="modal-action">{actions}</div>}
      </div>
      <form method="dialog" className="modal-backdrop">
        <button type="button" onClick={onClose}>
          close
        </button>
      </form>
    </dialog>
  );
}
