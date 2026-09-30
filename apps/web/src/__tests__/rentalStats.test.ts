import { describe, expect, it } from "vitest";
import type { RentalMonth } from "@expense-tracker/shared";
import {
  buildTrendData,
  formatTrieu,
  formatTooltipValue,
  monthShortLabel,
  selectStatsMonths,
  statsYears,
  summarizeTrend,
} from "../features/rental/rentalStats";

/** Data thật tháng 7 (280 kWh × 4.000 + 6 m³ × 35.000 → tổng 4.930.000). */
function makeMonth(overrides: Partial<RentalMonth> = {}): RentalMonth {
  return {
    id: `m-${overrides.month ?? "2026-07"}`,
    month: "2026-07",
    rent: 3_200_000,
    internet: 100_000,
    elevator: 200_000,
    parking: 100_000,
    oldElec: 0,
    newElec: 0,
    electricityRate: 4_000,
    oldWater: 0,
    newWater: 0,
    waterRate: 35_000,
    status: "CONFIRMED",
    expenseId: "e1",
    confirmedAt: "2026-07-31T00:00:00.000Z",
    elecConsumption: 280,
    waterConsumption: 6,
    electricityCost: 1_120_000,
    waterCost: 210_000,
    total: 4_930_000,
    ...overrides,
  };
}

const DRAFT: Partial<RentalMonth> = { status: "DRAFT", expenseId: null, confirmedAt: null };

describe("selectStatsMonths (spec §4.1 case 1–4)", () => {
  it("case 1: chỉ trả CONFIRMED, sort asc (DRAFT bị loại)", () => {
    const months = [
      makeMonth({ month: "2026-08" }),
      makeMonth({ month: "2026-07", ...DRAFT }),
      makeMonth({ month: "2026-06" }),
    ];
    expect(selectStatsMonths(months, "all").map((m) => m.month)).toEqual(["2026-06", "2026-08"]);
  });

  it("case 2: range 12m với 15 tháng CONFIRMED → đúng 12 tháng gần nhất, asc", () => {
    const months: RentalMonth[] = [];
    let y = 2025;
    let m = 2; // 2025-02 → 2026-04 (15 tháng)
    for (let i = 0; i < 15; i++) {
      months.push(makeMonth({ month: `${y}-${String(m).padStart(2, "0")}` }));
      m += 1;
      if (m > 12) {
        m = 1;
        y += 1;
      }
    }
    // Truyền desc vào để verify hàm tự sort asc
    const sel = selectStatsMonths([...months].reverse(), "12m");
    expect(sel).toHaveLength(12);
    expect(sel[0].month).toBe("2025-05");
    expect(sel[sel.length - 1].month).toBe("2026-04");
  });

  it("case 3: range 12m với 5 tháng → trả đủ 5", () => {
    const months = Array.from({ length: 5 }, (_, i) =>
      makeMonth({ month: `2026-0${i + 1}` }),
    );
    expect(selectStatsMonths(months, "12m")).toHaveLength(5);
  });

  it("case 4: range năm chỉ trả tháng năm đó; 'all' = hết", () => {
    const months = [
      makeMonth({ month: "2026-07" }),
      makeMonth({ month: "2026-01" }),
      makeMonth({ month: "2025-11" }),
      makeMonth({ month: "2025-03" }),
      makeMonth({ month: "2026-05", ...DRAFT }), // không tính
    ];
    expect(selectStatsMonths(months, "2026").map((m) => m.month)).toEqual(["2026-01", "2026-07"]);
    expect(selectStatsMonths(months, "all")).toHaveLength(4);
  });
});

describe("statsYears (spec §4.1 case 5)", () => {
  it("case 5: chỉ năm có tháng CONFIRMED, desc (năm chỉ có DRAFT không hiện)", () => {
    const months = [
      makeMonth({ month: "2026-07" }),
      makeMonth({ month: "2026-01" }),
      makeMonth({ month: "2025-11" }),
      makeMonth({ month: "2024-03", ...DRAFT }),
    ];
    expect(statsYears(months)).toEqual(["2026", "2025"]);
  });
});

describe("buildTrendData (spec §4.1 case 6)", () => {
  it("case 6: map asc + label MM/YY + đúng field elec/water", () => {
    const a = makeMonth({ month: "2026-07" });
    const b = makeMonth({
      month: "2026-06",
      elecConsumption: 150,
      electricityCost: 600_000,
      waterConsumption: 4,
      waterCost: 140_000,
    });
    // Truyền desc vào — hàm tự sort asc
    expect(buildTrendData([a, b], "elec")).toEqual([
      { month: "2026-06", label: "06/26", qty: 150, cost: 600_000 },
      { month: "2026-07", label: "07/26", qty: 280, cost: 1_120_000 },
    ]);
    expect(buildTrendData([a, b], "water")).toEqual([
      { month: "2026-06", label: "06/26", qty: 4, cost: 140_000 },
      { month: "2026-07", label: "07/26", qty: 6, cost: 210_000 },
    ]);
  });
});

describe("summarizeTrend (spec §4.1 case 7–9)", () => {
  it("case 7: avg làm tròn + peak/low theo qty (data thật 280 + 331 kWh)", () => {
    const a = makeMonth({ month: "2026-06", elecConsumption: 280, electricityCost: 1_120_000 });
    const b = makeMonth({ month: "2026-07", elecConsumption: 331, electricityCost: 1_324_000 });
    expect(summarizeTrend([b, a], "elec")).toEqual({
      avgQty: 306, // round(611/2)
      avgCost: 1_222_000,
      peakMonth: "2026-07",
      peakQty: 331,
      lowMonth: "2026-06",
      lowQty: 280,
    });
  });

  it("case 8: 1 tháng → peak = low = tháng đó", () => {
    const s = summarizeTrend([makeMonth()], "water");
    expect(s).toMatchObject({
      avgQty: 6,
      avgCost: 210_000,
      peakMonth: "2026-07",
      peakQty: 6,
      lowMonth: "2026-07",
      lowQty: 6,
    });
  });

  it("case 9: tập rỗng → null", () => {
    expect(summarizeTrend([], "elec")).toBeNull();
  });
});

describe("formatTrieu + monthShortLabel (helper trục chart)", () => {
  it("formatTrieu: triệu đ, dấu phẩy thập phân vi-VN", () => {
    expect(formatTrieu(1_120_000)).toBe("1,12");
    expect(formatTrieu(210_000)).toBe("0,21");
    expect(formatTrieu(999_999)).toBe("1,00"); // làm tròn vượt triệu
    expect(formatTrieu(2_000_000)).toBe("2,00");
    expect(formatTrieu(4_930_000)).toBe("4,93");
    expect(formatTrieu(0)).toBe("0,00");
    expect(formatTrieu(12_345_678)).toBe("12,35");
  });

  it("monthShortLabel: YYYY-MM → MM/YY", () => {
    expect(monthShortLabel("2026-07")).toBe("07/26");
    expect(monthShortLabel("2025-01")).toBe("01/25");
  });
});

describe("formatTooltipValue (fix HIGH review: định dạng đúng series theo dataKey)", () => {
  it("dataKey 'cost' → formatVnd + nhãn 'Tiền'; 'qty' → formatMeter + unit + 'Tiêu thụ'", () => {
    expect(formatTooltipValue("cost", 1_120_000, "kWh")).toEqual(["1.120.000 ₫", "Tiền"]);
    expect(formatTooltipValue("cost", 210_000, "m³")).toEqual(["210.000 ₫", "Tiền"]);
    expect(formatTooltipValue("qty", 280, "kWh")).toEqual(["280 kWh", "Tiêu thụ"]);
    expect(formatTooltipValue("qty", 6, "m³")).toEqual(["6 m³", "Tiêu thụ"]);
  });
});
