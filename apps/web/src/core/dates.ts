/**
 * Helper ngày tháng phía FE — month dạng "YYYY-MM", date dạng "YYYY-MM-DD".
 * Dùng Date.UTC để không dính múi giờ máy client.
 */

export function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Cộng/trừ tháng: addMonths("2026-01", -1) -> "2025-12". */
export function addMonths(month: string, delta: number): string {
  const [year, mon] = month.split("-").map(Number);
  const d = new Date(Date.UTC(year, mon - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** "2026-09" -> "Tháng 9/2026" — tiêu đề thân thiện. */
export function monthLabel(month: string): string {
  const [year, mon] = month.split("-").map(Number);
  return `Tháng ${mon}/${year}`;
}

/** "2026-09-22" -> "22/09" (hoặc "22/09/2026" nếu khác năm hiện tại). */
export function shortDate(date: string): string {
  const [year, mon, day] = date.split("-").map(Number);
  const sameYear = year === new Date().getFullYear();
  const dd = String(day).padStart(2, "0");
  const mm = String(mon).padStart(2, "0");
  return sameYear ? `${dd}/${mm}` : `${dd}/${mm}/${year}`;
}
