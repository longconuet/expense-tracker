import type { MonthlyStats } from "@expense-tracker/shared";
import { formatVnd, formatVndCompact } from "@expense-tracker/shared";
import { monthLabel, today } from "../../core/dates";

interface StatsCalendarProps {
  /** "YYYY-MM" — tháng đang xem (đồng bộ với nút điều hướng tháng của màn). */
  month: string;
  /** Tổng chi tiêu từng ngày, đủ mọi ngày trong tháng (ngày trống = 0). */
  byDay: MonthlyStats["byDay"];
  /** Click 1 ngày CÓ chi tiêu — truyền date "YYYY-MM-DD". */
  onDayClick: (date: string) => void;
}

/** Tuần bắt đầu thứ Hai (quy ước Việt Nam). */
const WEEK_HEADERS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

interface Cell {
  day: number;
  inMonth: boolean;
  /** "YYYY-MM-DD" — chỉ có khi thuộc tháng đang xem. */
  date: string | null;
  total: number;
  isToday: boolean;
}

/**
 * Dựng đủ ô cho lưới 7 cột (thứ Hai đầu tuần): đầu/cuối tháng là ngày lệch
 * từ tháng trước/sau. Dùng Date.UTC để không dính múi giờ máy client.
 */
function buildMonthCells(month: string): Array<Pick<Cell, "day" | "inMonth" | "date">> {
  const [year, mon] = month.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  // getUTCDay(): 0=CN..6=T7 → quy về thứ Hai = 0
  const firstWeekdayIndex = (new Date(Date.UTC(year, mon - 1, 1)).getUTCDay() + 6) % 7;
  const prevMonthDays = new Date(Date.UTC(year, mon - 1, 0)).getUTCDate();

  const cells: Array<Pick<Cell, "day" | "inMonth" | "date">> = [];
  for (let i = firstWeekdayIndex - 1; i >= 0; i--) {
    cells.push({ day: prevMonthDays - i, inMonth: false, date: null });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({
      day: d,
      inMonth: true,
      date: `${year}-${String(mon).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
    });
  }
  for (let d = 1; cells.length % 7 !== 0; d++) {
    cells.push({ day: d, inMonth: false, date: null });
  }
  return cells;
}

/**
 * Lịch chi tiêu theo ngày: mỗi ô hiện số ngày + tổng chi (format gọn
 * `formatVndCompact` — đủ chỗ, không cắt). Ngày có chi = button (click mở
 * chi tiết), ngày trống không tương tác. Hôm nay tô nền `bg-primary`.
 */
export function StatsCalendar({ month, byDay, onDayClick }: StatsCalendarProps) {
  const todayStr = today();
  const totals = new Map(byDay.map((d) => [d.date, d.total]));

  const cells: Cell[] = buildMonthCells(month).map((c) => ({
    ...c,
    total: c.date ? totals.get(c.date) ?? 0 : 0,
    isToday: c.date === todayStr,
  }));

  return (
    <section aria-label={`Lịch chi tiêu ${monthLabel(month)}`}>
      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEK_HEADERS.map((header) => (
          <div key={header} className="pb-1 text-[11px] font-semibold text-ink-muted">
            {header}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((cell, index) => {
          if (!cell.inMonth) {
            return (
              <div
                key={`out-${index}`}
                aria-hidden
                className="flex aspect-square items-center justify-center rounded-lg text-xs text-ink-muted/50"
              >
                {cell.day}
              </div>
            );
          }

          if (cell.total <= 0) {
            return (
              <div
                key={cell.date}
                aria-current={cell.isToday ? "date" : undefined}
                className={`flex aspect-square items-center justify-center rounded-lg text-xs ${
                  cell.isToday ? "bg-primary font-semibold text-on-primary" : "text-ink-muted"
                }`}
              >
                {cell.day}
              </div>
            );
          }

          return (
            <button
              key={cell.date}
              type="button"
              onClick={() => cell.date && onDayClick(cell.date)}
              aria-label={`Ngày ${cell.day}, chi tiêu ${formatVnd(cell.total)}`}
              aria-current={cell.isToday ? "date" : undefined}
              className={`flex aspect-square flex-col items-center justify-center gap-0.5 rounded-lg transition ${
                cell.isToday ? "bg-primary" : "hover:bg-primary-soft"
              }`}
            >
              <span
                className={`text-[10px] leading-none ${cell.isToday ? "text-on-primary/70" : "text-ink-muted"}`}
              >
                {cell.day}
              </span>
              <span
                className={`whitespace-nowrap text-[11px] font-semibold leading-none ${
                  cell.isToday ? "text-on-primary" : "text-primary"
                }`}
              >
                {formatVndCompact(cell.total)}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
