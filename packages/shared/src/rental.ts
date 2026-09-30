// Tiền phòng trọ hàng tháng — types + pure functions tính tiền.
// API (apps/api) và FE (apps/web) dùng CÙNG 1 nguồn hàm này (1 nguồn sự thật
// cho computed fields). Spec: docs/spec-rental.md

/** Danh mục preset gắn với khoản chi phòng trọ (chốt 30/09/2026). */
export const RENTAL_CATEGORY = { name: "Nhà trọ", icon: "🏠" } as const;

/** Giới hạn note của Expense (khớp `z.string().max(200)` API). */
export const RENTAL_NOTE_MAX = 200;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RentalConfigFields {
  rent: number; // Tiền phòng (đ)
  internet: number; // Tiền mạng (đ)
  elevator: number; // Thang máy + vệ sinh (đ)
  parking: number; // Gửi xe (đ)
  electricityRate: number; // Giá điện (đ/kWh)
  waterRate: number; // Giá nước (đ/m³)
}

export interface RentalConfig extends RentalConfigFields {
  updatedAt?: string;
}

/**
 * 10 trường nhập được của 1 tháng trọ. Số công tơ là **int** — số chỉ dồn tích
 * (kWh / m³), khớp sổ sách thật của gia đình (17.743 → 18.023 = 280 kWh).
 */
export interface RentalMonthFields {
  rent: number;
  internet: number;
  elevator: number;
  parking: number;
  oldElec: number; // Số công tơ điện đầu kỳ (int kWh)
  newElec: number; // Số công tơ điện cuối kỳ (int kWh)
  electricityRate: number;
  oldWater: number; // Số công tơ nước đầu kỳ (int m³)
  newWater: number; // Số công tơ nước cuối kỳ (int m³)
  waterRate: number;
}

export interface RentalMonth extends RentalMonthFields {
  id: string;
  month: string; // "YYYY-MM"
  status: "DRAFT" | "CONFIRMED";
  expenseId: string | null;
  confirmedAt: string | null; // ISO
  // Computed — API trả về; FE tính live bằng computeRentalTotals (cùng hàm).
  elecConsumption: number;
  waterConsumption: number;
  electricityCost: number;
  waterCost: number;
  total: number;
}

export interface RentalListResponse {
  config: RentalConfig | null;
  months: RentalMonth[];
}

export interface RentalTotals {
  /** Raw `new - old` (int) — KHÔNG clamp (validation chặn âm ở tầng API/FE). */
  elecConsumption: number;
  waterConsumption: number;
  /** consumption × rate (int × int — chính xác trong 2^53 với cap hiện tại). */
  electricityCost: number;
  waterCost: number;
  /** 4 khoản cố định + 2 cost — luôn int. */
  total: number;
}

// ---------------------------------------------------------------------------
// Tính tiền
// ---------------------------------------------------------------------------

export function computeRentalTotals(f: RentalMonthFields): RentalTotals {
  const elecConsumption = f.newElec - f.oldElec;
  const waterConsumption = f.newWater - f.oldWater;
  // Int × int — Math.round chỉ là phòng vệ (no-op khi input đúng int).
  const electricityCost = Math.round(elecConsumption * f.electricityRate);
  const waterCost = Math.round(waterConsumption * f.waterRate);
  const total = f.rent + f.internet + f.elevator + f.parking + electricityCost + waterCost;
  return { elecConsumption, waterConsumption, electricityCost, waterCost, total };
}

/**
 * Chia hàng nghìn kiểu vi-VN (cùng cách formatVnd — regex, không phụ thuộc ICU).
 */
function formatIntVi(value: number): string {
  const sign = value < 0 ? "-" : "";
  return sign + Math.abs(Math.round(value)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** Định dạng số công tơ/tiêu thụ (int): 280 → "280" · 1028 → "1.028" · 17743 → "17.743". */
export function formatMeter(value: number): string {
  return formatIntVi(value);
}

// ---------------------------------------------------------------------------
// Tháng / ngày
// ---------------------------------------------------------------------------

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidMonth(month: string): boolean {
  return MONTH_RE.test(month);
}

export function firstDayOfMonth(month: string): string {
  return `${month}-01`;
}

/** "2026-02" → "2026-02-28" (năm nhuận đúng — tính bằng Date, không bảng). */
export function lastDayOfMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(y, m, 0).getDate(); // day 0 của tháng kế tiếp = ngày cuối tháng hiện tại
  return `${month}-${String(last).padStart(2, "0")}`;
}

/** Date hợp lệ thật (không có 31/02) + đúng tháng `month`. */
export function isValidDateInMonth(date: string, month: string): boolean {
  const m = DATE_RE.exec(date);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12) return false;
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return false;
  return `${y}-${String(mo).padStart(2, "0")}` === month;
}

// ---------------------------------------------------------------------------
// Note của expense — server sinh (FE không tự soạn)
// ---------------------------------------------------------------------------

/**
 * "Phòng trọ 07/2026: phòng 3.200.000 + mạng 100.000 + thang máy 200.000 + xe 100.000
 *  + điện 280 kWh (1.120.000) + nước 6 m³ (210.000)"
 *
 * Guarantee ≤ RENTAL_NOTE_MAX ký tự (cap input đảm bảo case thực tế luôn ngắn hơn;
 * cắt là hàng phòng vệ cuối cho giá trị cực đoan).
 */
export function buildRentalNote(month: string, f: RentalMonthFields): string {
  const [y, m] = month.split("-");
  const t = computeRentalTotals(f);
  let note =
    `Phòng trọ ${m}/${y}: ` +
    `phòng ${formatIntVi(f.rent)} + ` +
    `mạng ${formatIntVi(f.internet)} + ` +
    `thang máy ${formatIntVi(f.elevator)} + ` +
    `xe ${formatIntVi(f.parking)} + ` +
    `điện ${formatMeter(t.elecConsumption)} kWh (${formatIntVi(t.electricityCost)}) + ` +
    `nước ${formatMeter(t.waterConsumption)} m³ (${formatIntVi(t.waterCost)})`;
  if (note.length > RENTAL_NOTE_MAX) {
    note = `${note.slice(0, RENTAL_NOTE_MAX - 1)}…`;
  }
  return note;
}
