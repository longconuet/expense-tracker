import { formatMeter, formatVnd, type RentalMonth } from "@expense-tracker/shared";

/**
 * Pure functions cho màn thống kê "Sử dụng điện & nước" (route /rental/stats).
 * Nguồn dữ liệu: payload `GET /rental` (fetchRental) — tháng đã có
 * elecConsumption/electricityCost/waterConsumption/waterCost do API tính.
 *
 * Quy tắc: chỉ tính tháng CONFIRMED — DRAFT có thể chưa đọc số công tơ
 * (new = 0) sẽ làm méo biểu đồ (spec `docs/spec-rental-stats.md`).
 */

export type StatsKind = "elec" | "water";
/** "12m" (12 tháng đã chốt gần nhất) | "all" | "YYYY". */
export type StatsRange = "12m" | "all" | string;

export interface TrendPoint {
  month: string; // "YYYY-MM"
  label: string; // "07/26" (MM/YY — trục biểu đồ)
  qty: number; // kWh / m³
  cost: number; // đ
}

export interface TrendSummary {
  avgQty: number; // làm tròn int
  avgCost: number; // làm tròn int
  peakMonth: string;
  peakQty: number;
  lowMonth: string;
  lowQty: number;
}

const KIND_KEYS: Record<
  StatsKind,
  { qty: "elecConsumption" | "waterConsumption"; cost: "electricityCost" | "waterCost" }
> = {
  elec: { qty: "elecConsumption", cost: "electricityCost" },
  water: { qty: "waterConsumption", cost: "waterCost" },
};

/** Chỉ CONFIRMED, sort ASC theo tháng ("YYYY-MM" so lexicographic = thời gian). */
function confirmedAsc(months: RentalMonth[]): RentalMonth[] {
  return months
    .filter((m) => m.status === "CONFIRMED")
    .sort((a, b) => a.month.localeCompare(b.month));
}

/** "2026-07" → "07/26" (MM/YY — trục chart + dòng summary). */
export function monthShortLabel(month: string): string {
  return `${month.slice(5)}/${month.slice(2, 4)}`;
}

/** Năm có ≥ 1 tháng CONFIRMED, sort desc (cho selector chip). */
export function statsYears(months: RentalMonth[]): string[] {
  const years = new Set(confirmedAsc(months).map((m) => m.month.slice(0, 4)));
  return [...years].sort((a, b) => b.localeCompare(a));
}

/**
 * Chọn tháng theo range:
 * - "12m": 12 tháng CONFIRMED gần nhất (ít hơn thì hết — cửa sổ theo tháng
 *   đã chốt, KHÔNG phải cửa sổ lịch).
 * - "all": mọi tháng CONFIRMED.
 * - "YYYY": tháng CONFIRMED của năm đó.
 * Trả về sort ASC (chuẩn cho trend chart: trái = cũ, phải = mới).
 */
export function selectStatsMonths(months: RentalMonth[], range: StatsRange): RentalMonth[] {
  const confirmed = confirmedAsc(months);
  if (range === "all") return confirmed;
  if (range === "12m") return confirmed.slice(-12);
  return confirmed.filter((m) => m.month.startsWith(`${range}-`));
}

/** Map sang data chart (luôn ASC): { month, label: "07/26", qty, cost }. */
export function buildTrendData(selected: RentalMonth[], kind: StatsKind): TrendPoint[] {
  const { qty, cost } = KIND_KEYS[kind];
  return [...selected]
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((m) => ({
      month: m.month,
      label: monthShortLabel(m.month),
      qty: m[qty],
      cost: m[cost],
    }));
}

/**
 * Summary 1 metric (peak/low theo QTY); `null` khi tập rỗng.
 * Contract: input sort ASC theo tháng — khi 2 tháng bằng nhau (tie),
 * peak/low giữ tháng SỚM HƠN; caller hiện tại luôn ASC (selectStatsMonths).
 */
export function summarizeTrend(selected: RentalMonth[], kind: StatsKind): TrendSummary | null {
  if (selected.length === 0) return null;
  const { qty, cost } = KIND_KEYS[kind];
  const avgQty = Math.round(selected.reduce((s, m) => s + m[qty], 0) / selected.length);
  const avgCost = Math.round(selected.reduce((s, m) => s + m[cost], 0) / selected.length);
  let peak = selected[0];
  let low = selected[0];
  for (const m of selected) {
    if (m[qty] > peak[qty]) peak = m;
    if (m[qty] < low[qty]) low = m;
  }
  return {
    avgQty,
    avgCost,
    peakMonth: peak.month,
    peakQty: peak[qty],
    lowMonth: low.month,
    lowQty: low[qty],
  };
}

/**
 * Cost compact cho trục phải biểu đồ — theo TRIỆU đ, dấu phẩy thập phân
 * kiểu vi-VN: 1.120.000 → "1,12"; 210.000 → "0,21"; 999.999 → "1,00".
 */
export function formatTrieu(v: number): string {
  const hundredths = Math.round(Math.abs(v) / 10_000); // đơn vị 1/100 triệu
  const int = Math.floor(hundredths / 100);
  const frac = String(hundredths % 100).padStart(2, "0");
  return `${String(int).replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${frac}`;
}

/**
 * Định dạng 1 dòng tooltip chart (pure — jsdom không render được tooltip
 * recharts nên test qua hàm này). `dataKey === "cost"` → tiền (formatVnd);
 * còn lại → lượng (formatMeter + unit).
 */
export function formatTooltipValue(dataKey: string, value: number, unit: string): [string, string] {
  return dataKey === "cost"
    ? [formatVnd(value), "Tiền"]
    : [`${formatMeter(value)} ${unit}`, "Tiêu thụ"];
}
