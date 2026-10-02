import type { Category } from "@expense-tracker/shared";

interface CategoryChipsProps {
  categories: Category[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

/**
 * Danh mục chi tiêu — viên tròn cuộn ngang (không tiêu đề, icon gọn để hiện
 * nhiều hơn). 1 nguồn markup dùng chung cho màn Thêm/Sửa khoản + form giao
 * dịch định kỳ (bài học 30/09: markup lặp inline giữa 2 page → lệch layout).
 * Pure UI — haptic/submit do caller tự wrap trong `onSelect`.
 */
export function CategoryChips({ categories, selectedId, onSelect }: CategoryChipsProps) {
  return (
    <div className="-mx-4 mt-4">
      <div
        role="group"
        aria-label="Danh mục chi tiêu"
        className="flex gap-3 overflow-x-auto px-4 pb-1"
      >
        {categories.map((category) => {
          const selected = category.id === selectedId;
          return (
            <button
              key={category.id}
              type="button"
              aria-pressed={selected}
              onClick={() => onSelect(category.id)}
              className="flex w-[66px] shrink-0 flex-col items-center gap-1.5"
            >
              <span
                aria-hidden
                className={`flex h-[58px] w-[58px] items-center justify-center rounded-full border-2 text-3xl transition ${
                  selected ? "border-primary bg-primary-soft" : "border-border bg-card"
                }`}
              >
                {category.icon}
              </span>
              <span
                className={`w-full truncate text-center text-xs ${
                  selected ? "font-semibold text-primary" : "text-ink-muted"
                }`}
              >
                {category.name}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
