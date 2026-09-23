// Helper ngày tháng — date trong app là string "YYYY-MM-DD" (ngày cục bộ, không timezone)

export const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
export const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** Kiểm tra ngày thực sự tồn tại (loại 2026-02-30, 2026-13-01...). */
export function isValidDateStr(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** "2026-01" -> "2026-02" (cho ranh giới tháng kế tiếp khi lọc). */
export function nextMonthStart(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

/** "2026-01" -> "2025-12". */
export function prevMonthStart(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

/** Tháng hiện tại "YYYY-MM". */
export function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

/** Ngày hôm nay dạng YYYY-MM-DD (giờ UTC — đủ cho mục đích mặc định). */
export function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}
