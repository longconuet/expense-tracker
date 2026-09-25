import { BackspaceIcon } from "../../shared/ui/icons";

/**
 * Bàn phím số cho màn nhập/sửa khoản chi — thay bàn phím hệ thống
 * (spec WBS 9: không dùng bàn phím hệ thống cho số tiền).
 * Presentational: không giữ state, cha truyền onKey.
 *
 * Size: "lg" (64px — mặc định, màn Sửa) / "md" (56px — màn Thêm,
 * tiết kiệm chiều cao mobile để keypad nằm trên khu vực ngày + ghi chú).
 */
export type KeypadKey = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "back";
export type KeypadSize = "lg" | "md";

const ROWS: Array<Array<Exclude<KeypadKey, "back">>> = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
];

interface KeypadButtonProps {
  label: string;
  ariaLabel?: string;
  icon?: boolean;
  wide?: boolean;
  size: KeypadSize;
  disabled?: boolean;
  onClick: () => void;
}

const sizeClass: Record<KeypadSize, { button: string; icon: string; gap: string }> = {
  lg: { button: "h-16 text-2xl", icon: "h-7 w-7", gap: "gap-2" },
  md: { button: "h-14 text-xl", icon: "h-6 w-6", gap: "gap-1.5" },
};

function KeypadButton({ label, ariaLabel, icon, wide, size, disabled, onClick }: KeypadButtonProps) {
  return (
    <button
      type="button"
      aria-label={ariaLabel ?? label}
      disabled={disabled}
      onClick={onClick}
      className={`flex select-none items-center justify-center rounded-2xl border border-border bg-card font-semibold text-ink transition active:scale-[0.97] active:border-primary active:bg-primary-soft active:text-primary disabled:opacity-50 ${sizeClass[size].button} ${
        wide ? "col-span-2" : ""
      }`}
    >
      {icon ? <BackspaceIcon className={sizeClass[size].icon} /> : label}
    </button>
  );
}

interface KeypadProps {
  onKey: (key: KeypadKey) => void;
  /** Vô hiệu toàn bộ (VD đang gửi). */
  disabled?: boolean;
  /** Mặc định "lg" (64px). "md" = 56px cho màn có ít chiều cao. */
  size?: KeypadSize;
}

export function Keypad({ onKey, disabled = false, size = "lg" }: KeypadProps) {
  return (
    <div
      role="group"
      aria-label="Bàn phím số"
      className={`grid grid-cols-3 ${sizeClass[size].gap}`}
    >
      {ROWS.flat().map((key) => (
        <KeypadButton key={key} label={key} size={size} disabled={disabled} onClick={() => onKey(key)} />
      ))}
      <KeypadButton
        label="⌫"
        ariaLabel="Xoá 1 chữ số"
        icon
        size={size}
        disabled={disabled}
        onClick={() => onKey("back")}
      />
      <KeypadButton label="0" wide size={size} disabled={disabled} onClick={() => onKey("0")} />
    </div>
  );
}
