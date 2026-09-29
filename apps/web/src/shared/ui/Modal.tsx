import { useEffect, useId, useRef } from "react";
import type { ReactNode } from "react";
import { XIcon } from "./icons";
import { MODAL_EXIT_MS, useDismissTransition } from "./useDismissTransition";

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
 * Modal card giữa màn (mọi kích thước) — nền che tối + blur (utility
 * `modal-backdrop` định nghĩa tập trung ở index.css, đúng cả light/dark),
 * card dùng token theme (bg-card, rounded-2xl) nên tự đúng light/dark.
 *
 * Hiệu ứng: mở = fade + scale (`animate-fade-in`/`animate-modal-in`),
 * đóng = fade + scale ngược — parent chỉ cần đưa `open` về false, Modal
 * tự giữ mounted trong thời lượng hiệu ứng rồi mới unmount
 * (`useDismissTransition`).
 *
 * A11y: role="dialog" + aria-modal, đóng bằng Escape / bấm ra ngoài
 * (trừ khi `disableDismiss`), focus vào dialog khi mở (trả về phần tử
 * trigger khi đóng xong hiệu ứng), focus trap (Tab không thoát), khoá
 * scroll body tới khi đóng xong hiệu ứng. Trong pha đóng, Escape và
 * click overlay bị bỏ qua (parent đã nhận onClose rồi).
 *
 * PWA iOS: overlay có padding-top safe-area (max(env, 16px) — giữ 16px cũ
 * trên desktop) để mép trên card không chạm dải frosted-glass status bar;
 * cạnh dưới giữ 16px như thiết kế cũ. Dialog `max-h-full overflow-y-auto`
 * để card dài (VD chi tiết ngày nhiều khoản) cuộn được.
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
  // `mounted` còn true trong cả pha hiệu ứng đóng → khoá scroll/trả focus
  // chỉ chạy khi đóng XONG (không giật scroll giữa lúc fade-out).
  const { mounted, closing } = useDismissTransition(open, MODAL_EXIT_MS);

  // "Đóng băng" title trong pha hiệu ứng đóng: parent hay đổi title cùng
  // render với `open` → false (VD form → null → "Sửa…" lật "Thêm…"), không
  // để title nhảy giữa lúc fade-out.
  const lastOpenTitleRef = useRef(title);
  if (open) lastOpenTitleRef.current = title;
  const displayTitle = open ? title : lastOpenTitleRef.current;

  // Focus + khoá scroll + khôi phục khi unmount (sau khi đóng xong)
  useEffect(() => {
    if (!mounted) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
      previouslyFocused?.focus?.();
    };
  }, [mounted]);

  // Escape + focus trap — chỉ khi `open` (pha đóng thì bỏ qua input)
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

  if (!mounted) return null;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center modal-backdrop px-4 pt-[max(env(safe-area-inset-top),1rem)] pb-4 ${
        closing ? "animate-fade-out" : "animate-fade-in"
      }`}
      onClick={(e) => {
        // `open` guard: pha đóng parent đã nhận onClose rồi → không gọi lại
        if (open && !disableDismiss && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={displayTitle ? titleId : undefined}
        tabIndex={-1}
        className={`relative max-h-full w-full max-w-sm overflow-y-auto overscroll-contain rounded-2xl bg-card p-5 shadow-lg outline-none ${
          closing ? "animate-modal-out" : "animate-modal-in"
        }`}
      >
        {/* Nút X biến mất trong pha đóng — tránh tái hiện giữa fade-out
            (VD export modal `showClose={!exporting}`) và chặn onClose lặp. */}
        {showClose && !closing && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="absolute top-3 right-3 rounded-lg p-1.5 text-ink-muted transition hover:bg-ink/5"
          >
            <XIcon className="h-5 w-5" />
          </button>
        )}
        {displayTitle && (
          <h2 id={titleId} className="text-base font-semibold text-ink">
            {displayTitle}
          </h2>
        )}
        {children}
      </div>
    </div>
  );
}
