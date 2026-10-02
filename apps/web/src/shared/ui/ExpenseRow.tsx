import type { Expense } from "@expense-tracker/shared";
import { formatVnd } from "@expense-tracker/shared";
import { RepeatIcon } from "./icons";

type Size = "md" | "sm";

/**
 * Hàng khoản chi dùng chung (icon + tiêu đề + người tạo · ghi chú + số tiền).
 * Dùng ở: danh sách Lịch sử (size md) + card "Gần đây" Trang chủ (size sm).
 * Tách 1 component để 2 màn KHÔNG BAO GIỜ lệch layout (bài học 30/09:
 * copy markup 2 nơi → Lịch sử đổi layout rồi Trang chủ quên đổi).
 *
 * Chuẩn layout (30/09): tiêu đề = TÊN DANH MỤC; ghi chú (nếu có) nằm hàng
 * dưới, SAU người tạo. Container (Link/Card/li + nút xoá) giữ phía page —
 * component này chỉ render khối nội dung.
 */
export interface ExpenseRowProps {
  expense: Expense;
  /** md = Lịch sử (icon text-2xl); sm = compact trong card (icon text-xl). */
  size?: Size;
}

const sizeClass: Record<Size, { icon: string; title: string; amount: string }> = {
  md: {
    icon: "text-2xl",
    title: "truncate font-medium text-ink",
    amount: "font-semibold text-ink",
  },
  sm: {
    icon: "text-xl",
    title: "truncate text-sm font-medium text-ink",
    amount: "text-sm font-semibold text-ink",
  },
};

export function ExpenseRow({ expense, size = "md" }: ExpenseRowProps) {
  const { icon, title, amount } = sizeClass[size];
  return (
    <>
      <span className={icon} aria-hidden>
        {expense.category.icon}
      </span>
      <div className="min-w-0 flex-1">
        {/* Icon định kỳ (spec-recurring §4.7): khoản sinh từ rule — cạnh tên
            danh mục, 12px, không đổi layout; hành vi chạm hàng giữ nguyên. */}
        <p className={title}>
          {expense.category.name}
          {expense.recurringRuleId != null ? (
            <>
              <RepeatIcon className="ml-1.5 inline h-3 w-3 text-ink-muted" />
              <span className="sr-only">định kỳ</span>
            </>
          ) : null}
        </p>
        <p className="truncate text-xs text-ink-muted">
          {expense.createdByName}
          {expense.note ? (
            <>
              {" · "}
              {/* Span trần — KHÔNG "dọn" tag: RTL getByText(note) exact-match
                  chỉ đọc text-node trực tiếp (test HistoryPage/HomePage). */}
              <span>{expense.note}</span>
            </>
          ) : null}
        </p>
      </div>
      <span className={amount}>{formatVnd(expense.amount)}</span>
    </>
  );
}
