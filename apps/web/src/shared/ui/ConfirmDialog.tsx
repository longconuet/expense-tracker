import { useRef } from "react";
import { Button } from "./Button";
import { Modal } from "./Modal";

/**
 * Parent hay xoá nội dung (VD `deleteTarget` → null) CÙNG render với
 * `open` → false; nếu để vậy thì message trống trắng ngay giữa hiệu ứng
 * đóng. Giữ giá trị non-empty cuối để exit animation mượt.
 */
function useLastNonEmpty(value: string): string {
  const lastRef = useRef(value);
  if (value.trim() !== "") lastRef.current = value;
  return lastRef.current;
}

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  /** Nút confirm dùng màu danger (hành vi huỷ hoại: xoá, đăng xuất...). */
  danger?: boolean;
  /** Nút confirm + Huỷ disable, nút confirm hiện spinner. */
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Dialog xác nhận 2 nút (Huỷ / confirm) trên Modal — thay thế
 * window.confirm của trình duyệt, đồng nhất với Button/Card của app.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel = "Huỷ",
  danger = false,
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const displayTitle = useLastNonEmpty(title);
  const displayMessage = useLastNonEmpty(message);

  return (
    <Modal open={open} onClose={onCancel} title={displayTitle} disableDismiss={loading}>
      <p className="mt-1 text-sm text-ink-muted">{displayMessage}</p>
      <div className="mt-4 flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={onCancel} disabled={loading}>
          {cancelLabel}
        </Button>
        <Button
          variant={danger ? "danger" : "primary"}
          className="flex-1"
          loading={loading}
          onClick={onConfirm}
        >
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
