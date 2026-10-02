import { haptic } from "../../core/haptic";

/**
 * Hàng chip gợi ý ghi chú nhanh của 1 danh mục — dùng chung màn Tạo khoản chi
 * (AddPage) và Sửa khoản chi (EditPage). Presentational: chỉ `input()` bằng
 * props, không gọi API, không đọc store.
 * Chạm chip → haptic + `onSelect(text)` (parent tự quyết định ghi vào form).
 * Không tự focus input — tránh mở bàn phím khi chạm chip liên tiếp.
 */
interface NoteSuggestionsProps {
  /** Gợi ý của danh mục đang chọn — rỗng = render nothing. */
  suggestions: string[];
  onSelect: (text: string) => void;
  /** Khoá chip khi form đang submit. */
  disabled?: boolean;
}

export function NoteSuggestions({ suggestions, onSelect, disabled }: NoteSuggestionsProps) {
  if (suggestions.length === 0) return null;

  return (
    <div
      role="group"
      aria-label="Gợi ý ghi chú"
      className="mt-2 flex gap-2 overflow-x-auto pb-0.5"
      data-testid="note-suggestions"
    >
      {/* key theo index: list chỉ thêm/xoá, không reorder; nếu API (gọi tay)
          trả 2 mục trùng thì vẫn không dính React duplicate-key warning */}
      {suggestions.map((text, index) => (
        <button
          key={`${index}-${text}`}
          type="button"
          disabled={disabled}
          aria-label={`Gợi ý ghi chú ${text}`}
          onClick={() => {
            haptic(8);
            onSelect(text);
          }}
          className="shrink-0 rounded-full border border-border bg-card px-2.5 py-1.5 text-sm font-medium text-ink transition active:border-primary active:bg-primary-soft active:text-primary disabled:opacity-50"
        >
          {text}
        </button>
      ))}
    </div>
  );
}
