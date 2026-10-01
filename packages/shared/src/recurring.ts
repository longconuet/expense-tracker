// Giao dịch định kỳ — lặp hàng tháng. Types + pure functions tính chuỗi kỳ.
// API (apps/api) và FE (apps/web) dùng CÙNG 1 nguồn hàm này (1 nguồn sự thật
// cho nextDate / materialize). Spec: docs/spec-recurring.md
//
// Quy ước ngày: string "YYYY-MM-DD" (ngày cục bộ, không timezone) — khớp toàn
// app. Mọi phép tính qua Date.UTC để không dính múi giờ máy.
//
// Chuỗi kỳ của rule — nghĩa "anchor day": kỳ của tháng M = ngày
// min(anchorDay, ngày cuối tháng M), với anchorDay = NGÀY của trường "Từ"
// (startDate). VD "Từ 31/01" → 31/01, 28/02, 31/03, 30/04, 31/05… (sau tháng
// ngắn TRỞ LẠI 31 — không sập thành 28). Không dùng chuỗi advance nối tiếp
// (clamp 28/02 sẽ kéo mọi tháng sau xuống 28).
//
// MVP: tần suất cố định 1 lần/tháng (user chốt 01/10/2026 — không có tuỳ chọn
// tần suất). Cột `frequency` trong DB giữ giá trị "MONTHLY" để mở rộng additive.

import type { Category } from "./index.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RecurringEndType = "FOREVER" | "UNTIL_DATE" | "COUNT";

export interface RecurringRule {
  id: string;
  familyId: string;
  categoryId: string;
  category: Category;
  amount: number;
  note: string | null;
  frequency: "MONTHLY";
  startDate: string; // "Từ" — YYYY-MM-DD, định ngày khớp trong tháng
  endType: RecurringEndType;
  endDate: string | null; // endType = UNTIL_DATE
  occurrenceCount: number | null; // endType = COUNT
  /** Kỳ kế tiếp cần sinh — null = rule hết vòng đời (hoàn tất). */
  nextDate: string | null;
  /** Số kỳ ĐÃ materialize — đếm theo kỳ, không theo hàng (xoá khoản không giảm). */
  generatedCount: number;
  completedAt: string | null; // ISO
  createdAt: string; // ISO
}

export interface CreateRecurringRuleInput {
  categoryId: string;
  amount: number;
  note?: string;
  startDate: string;
  endType: RecurringEndType;
  endDate?: string;
  occurrenceCount?: number;
}

/** Kết quả 1 lần materialize — month kèm sẵn để FE invalidate đúng cache. */
export interface RecurringMaterializeResult {
  count: number;
  created: Array<{ expenseId: string; date: string; month: string }>;
}

// ---------------------------------------------------------------------------
// Chuỗi kỳ (anchor-day)
// ---------------------------------------------------------------------------

const pad2 = (n: number): string => String(n).padStart(2, "0");

/** Ngày (1–31) của chuỗi kỳ — lấy từ ngày "Từ". */
export function anchorDayOf(date: string): number {
  return Number(date.slice(8, 10));
}

/** Số ngày cuối tháng (year, month 1–12) — tính bằng Date, đúng năm nhuận. */
function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate(); // ngày 0 của tháng kế
}

/**
 * Kỳ của tháng `month` (1–12) năm `year`, neo theo `anchorDay`:
 * ngày = min(anchorDay, ngày cuối tháng). VD anchor 31: tháng 2 → 28 (29 nhuận).
 */
export function occurrenceInMonth(anchorDay: number, year: number, month: number): string {
  const day = Math.min(anchorDay, lastDayOfMonth(year, month));
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/**
 * +1 tháng, ngày clamp về cuối tháng (31/01 → 28/02, năm nhuận → 29/02).
 * "2026-12-31" → "2027-01-31". Primitive 1 bước — KHÔNG dùng để nối chuỗi
 * (clamp sẽ kéo sập ngày các tháng sau; nối chuỗi kỳ dùng `nextOccurrence`).
 */
export function advanceMonthly(date: string): string {
  return nextOccurrence(anchorDayOf(date), date);
}

/**
 * Kỳ của tháng kế tiếp so với `date`, neo theo `anchorDay`.
 * VD (31, "2026-02-28") → "2026-03-31" — dùng nối chuỗi kỳ + API tính lại
 * nextDate khi sửa rule (spec §3.1).
 */
export function nextOccurrence(anchorDay: number, date: string): string {
  const [y, m] = date.split("-").map(Number);
  return occurrenceInMonth(anchorDay, ...(m === 12 ? [y + 1, 1] : [y, m + 1]) as [number, number]);
}

/**
 * Ngày định kỳ đầu tiên ≥ `today` (quy tắc KHÔNG sinh bù quá khứ — spec §1).
 * `startDate >= today` → trả thẳng `startDate`; khác thì trượt từng tháng
 * (neo theo anchorDay của startDate) đến ngày khớp đầu tiên ≥ today.
 */
export function firstOccurrenceFrom(startDate: string, today: string, cap = 1200): string {
  if (startDate >= today) return startDate; // so lexicographic — đúng thứ tự cho YYYY-MM-DD
  const anchor = anchorDayOf(startDate);
  let [y, m] = startDate.split("-").map(Number);
  let candidate = startDate;
  for (let i = 0; i < cap; i += 1) {
    if (m === 12) {
      y += 1;
      m = 1;
    } else {
      m += 1;
    }
    candidate = occurrenceInMonth(anchor, y, m);
    if (candidate >= today) return candidate;
  }
  return candidate; // vượt cap phòng vệ (≈100 năm) — thực tế không xảy ra
}

export interface MaterializeDatesInput {
  nextDate: string;
  /** Ngày neo của chuỗi kỳ (anchorDayOf(startDate) của rule) — spec §2.2. */
  anchorDay: number;
  endType: RecurringEndType;
  endDate: string | null;
  occurrenceCount: number | null;
  generatedCount: number;
}

export interface MaterializeDatesResult {
  /** Các kỳ cần sinh tại tick này (luôn ≤ today). */
  dates: string[];
  /** Giá trị mới ghi lên rule — null = hoàn tất. */
  nextDate: string | null;
  completed: boolean;
}

/**
 * Sinh danh sách kỳ quá hạn tại ngày `today` (spec §2.2):
 * các `d` trong chuỗi kỳ với `nextDate <= d <= today`, dừng khi:
 * - `endType = UNTIL_DATE` và `d > endDate`,
 * - `endType = COUNT` và `generatedCount >= occurrenceCount`.
 *
 * Cap `cap` (mặc định 400 kỳ ≈ 33 năm) chỉ là phòng vệ flood — chạm cap thì
 * dừng giữa chừng (KHÔNG hoàn tất), tick kế tiếp nối tiếp từ `nextDate`.
 */
export function materializeDates(
  input: MaterializeDatesInput,
  today: string,
  cap = 400,
): MaterializeDatesResult {
  const dates: string[] = [];
  let nextDate: string | null = input.nextDate;
  let generatedCount = input.generatedCount;
  let completed = false;

  if (nextDate !== null && nextDate > today) {
    return { dates: [], nextDate, completed: false };
  }

  while (nextDate !== null && nextDate <= today && dates.length < cap) {
    if (input.endType === "UNTIL_DATE" && input.endDate !== null && nextDate > input.endDate) {
      completed = true;
      nextDate = null;
      break;
    }
    if (
      input.endType === "COUNT" &&
      input.occurrenceCount !== null &&
      generatedCount >= input.occurrenceCount
    ) {
      completed = true;
      nextDate = null;
      break;
    }
    dates.push(nextDate);
    generatedCount += 1;
    nextDate = nextOccurrence(input.anchorDay, nextDate);
  }

  // Hết vòng lặp mà chưa chạm cap: kiểm tra hoàn tất cho kỳ kế tiếp
  // (VD COUNT vừa đủ sau lần sinh cuối, hoặc UNTIL_DATE kỳ kế vượt endDate).
  if (nextDate !== null && dates.length < cap) {
    if (input.endType === "UNTIL_DATE" && input.endDate !== null && nextDate > input.endDate) {
      completed = true;
      nextDate = null;
    } else if (
      input.endType === "COUNT" &&
      input.occurrenceCount !== null &&
      generatedCount >= input.occurrenceCount
    ) {
      completed = true;
      nextDate = null;
    }
  }

  return { dates, nextDate, completed };
}

// ---------------------------------------------------------------------------
// Hiển thị (FE list dùng — 1 nguồn, test được)
// ---------------------------------------------------------------------------

/** "2026-12-31" → "31/12/2026" (zero-pad, không phụ thuộc ICU). */
function formatDateVi(date: string): string {
  const [y, m, d] = date.split("-");
  return `${d}/${m}/${y}`;
}

/** "Mãi mãi" / "Đến 31/12/2026" / "5 lần". */
export function describeRecurringEnd(
  endType: RecurringEndType,
  endDate: string | null,
  occurrenceCount: number | null,
): string {
  if (endType === "UNTIL_DATE") return `Đến ${formatDateVi(endDate ?? "")}`;
  if (endType === "COUNT") return `${occurrenceCount ?? 0} lần`;
  return "Mãi mãi";
}
