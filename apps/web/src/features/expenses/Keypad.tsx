import { BackspaceIcon } from "../../shared/ui/icons";

/**
 * Bàn phím số to (64px+) cho màn nhập khoản chi — thay bàn phím hệ thống
 * (spec WBS 9: không dùng bàn phím hệ thống cho số tiền).
 * Presentational: không giữ state, cha truyền onKey.
 */
export type KeypadKey = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "back";

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
  disabled?: boolean;
  onClick: () => void;
}

function KeypadButton({ label, ariaLabel, icon, wide, disabled, onClick }: KeypadButtonProps) {
  return (
    <button
      type="button"
      aria-label={ariaLabel ?? label}
      disabled={disabled}
      onClick={onClick}
      className={`flex h-16 select-none items-center justify-center rounded-2xl border border-border bg-card text-2xl font-semibold text-ink transition active:scale-[0.97] active:border-primary active:bg-primary-soft active:text-primary disabled:opacity-50 ${
        wide ? "col-span-2" : ""
      }`}
    >
      {icon ? <BackspaceIcon className="h-7 w-7" /> : label}
    </button>
  );
}

interface KeypadProps {
  onKey: (key: KeypadKey) => void;
  /** Vô hiệu toàn bộ (VD đang gửi). */
  disabled?: boolean;
}

export function Keypad({ onKey, disabled = false }: KeypadProps) {
  return (
    <div role="group" aria-label="Bàn phím số" className="grid grid-cols-3 gap-2">
      {ROWS.flat().map((key) => (
        <KeypadButton key={key} label={key} disabled={disabled} onClick={() => onKey(key)} />
      ))}
      <KeypadButton
        label="⌫"
        ariaLabel="Xoá 1 chữ số"
        icon
        disabled={disabled}
        onClick={() => onKey("back")}
      />
      <KeypadButton label="0" wide disabled={disabled} onClick={() => onKey("0")} />
    </div>
  );
}
