import type { Expense } from "@expense-tracker/shared";
import { shortDate, today, yesterday } from "./dates";

export interface DayGroup {
  /** YYYY-MM-DD */
  date: string;
  /** "Hôm nay" | "Hôm qua" | "22/09" (kèm năm nếu khác năm hiện tại) */
  label: string;
  /** Tổng các khoản trong ngày */
  total: number;
  expenses: Expense[];
}

/**
 * Tiêu đề ngày thân thiện: "Hôm nay" / "Hôm qua", còn lại "22/09" (kèm
 * năm nếu khác năm hiện tại — dùng `shortDate`).
 */
export function dayLabel(
  date: string,
  todayStr: string = today(),
  yesterdayStr: string = yesterday(),
): string {
  if (date === todayStr) return "Hôm nay";
  if (date === yesterdayStr) return "Hôm qua";
  return shortDate(date);
}

/**
 * Nhóm khoản chi theo ngày, kèm tiểu kết tổng ngày.
 * Giữ thứ tự xuất hiện của input — API đã trả `date desc, createdAt desc`
 * nên nhóm mới nhất luôn nằm trước.
 */
export function groupByDay(expenses: Expense[]): DayGroup[] {
  const todayStr = today();
  const yesterdayStr = yesterday();
  const groups = new Map<string, DayGroup>();

  for (const expense of expenses) {
    let group = groups.get(expense.date);
    if (!group) {
      group = {
        date: expense.date,
        label: dayLabel(expense.date, todayStr, yesterdayStr),
        total: 0,
        expenses: [],
      };
      groups.set(expense.date, group);
    }
    group.total += expense.amount;
    group.expenses.push(expense);
  }

  return [...groups.values()];
}
