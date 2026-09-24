import { useEffect, useId, useRef } from "react";
import type { ReactNode } from "react";
import { XIcon } from "./icons";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  /** Hiển thị + dùng cho aria-labelledby. */
  title?: string;
  /** Hiện nút X góc phải trên. */
  showClose?: boolean;
  /** Chặn mọi đường đóng (Escape, click overlay) — dùng khi đang chờ API. */
  disableDismiss?: boolean;
  children: ReactNode;
}

/**
 * Modal card giữa màn (mọi kích thước) — nền tối `bg-ink/40`, card dùng
 * token theme (bg-card, rounded-2xl) nên tự đúng light/dark.
 *
 * A11y: role="dialog" + aria-modal, đóng bằng Escape / bấm ra ngoài
 * (trừ khi `disableDismiss`), focus vào dialog khi mở (trả về phần tử
 * trigger khi đóng), focus trap (Tab không thoát), khoá scroll body
 * trong lúc mở.
 */
export function Modal({
  open,
  onClose,
  title,
  showClose = false,
  disableDismiss = false,
  children,
}: ModalProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  // Focus + khoá scroll + khôi phục khi đóng
  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
      previouslyFocused?.focus?.();
    };
  }, [open]);

  // Escape + focus trap
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (!disableDismiss) onClose();
        return;
      }
      if (e.key === "Tab" && dialogRef.current) {
        const focusables = dialogRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement as HTMLElement;

        // Focus chưa nằm trên 1 focusable trong dialog (đang ở container ban
        // đầu, hoặc đã lọt ra ngoài) → kéo về trong dialog
        const onInsideFocusable =
          active instanceof HTMLElement &&
          Array.prototype.includes.call(focusables, active);
        if (!onInsideFocusable) {
          e.preventDefault();
          (e.shiftKey ? last : first).focus();
          return;
        }

        // Wrap ở 2 đầu
        if (e.shiftKey && active === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose, disableDismiss]);

  if (!open) return null;

  return (
    <div
      className="animate-fade-in fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      onClick={(e) => {
        if (!disableDismiss && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        className="animate-modal-in relative w-full max-w-sm rounded-2xl bg-card p-5 shadow-lg outline-none"
      >
        {showClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="absolute top-3 right-3 rounded-lg p-1.5 text-ink-muted transition hover:bg-ink/5"
          >
            <XIcon className="h-5 w-5" />
          </button>
        )}
        {title && (
          <h2 id={titleId} className="text-base font-semibold text-ink">
            {title}
          </h2>
        )}
        {children}
      </div>
    </div>
  );
}
