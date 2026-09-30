import { describe, expect, it } from "vitest";
import {
  RENTAL_CATEGORY,
  RENTAL_NOTE_MAX,
  buildRentalNote,
  computeRentalTotals,
  firstDayOfMonth,
  formatMeter,
  isValidDateInMonth,
  isValidMonth,
  lastDayOfMonth,
  type RentalMonthFields,
} from "./rental";

// Data thật tháng 7 (sổ sách gia đình — số công tơ là int, dấu chấm = hàng nghìn):
// 18.023 − 17.743 = 280 kWh, 1.007 − 1.001 = 6 m³ → tổng phải khớp 4.930.000 ₫.
const JULY: RentalMonthFields = {
  rent: 3_200_000,
  internet: 100_000,
  elevator: 200_000,
  parking: 100_000,
  oldElec: 17_743,
  newElec: 18_023,
  electricityRate: 4_000,
  oldWater: 1_001,
  newWater: 1_007,
  waterRate: 35_000,
};

describe("computeRentalTotals", () => {
  it("tính đúng với data thật tháng 7 (khớp sổ sách gia đình)", () => {
    const t = computeRentalTotals(JULY);
    expect(t.elecConsumption).toBe(280);
    expect(t.waterConsumption).toBe(6);
    expect(t.electricityCost).toBe(1_120_000);
    expect(t.waterCost).toBe(210_000);
    expect(t.total).toBe(4_930_000);
  });

  it("khớp dòng 2 của sổ (giá điện 3.500): 20.788 − 20.463 = 325 kWh × 3.500 = 1.137.500", () => {
    const t = computeRentalTotals({ ...JULY, oldElec: 20_463, newElec: 20_788, electricityRate: 3_500 });
    expect(t.elecConsumption).toBe(325);
    expect(t.electricityCost).toBe(1_137_500);
  });

  it("consumption âm trả raw (không clamp) — validation chặn phía API/FE", () => {
    const t = computeRentalTotals({ ...JULY, newElec: 17_000, oldElec: 18_000 });
    expect(t.elecConsumption).toBe(-1_000);
    expect(t.electricityCost).toBe(-4_000_000);
  });

  it("mọi input int → total là int = 4 khoản cố định + 2 cost", () => {
    const t = computeRentalTotals(JULY);
    expect(Number.isInteger(t.total)).toBe(true);
    expect(t.total).toBe(JULY.rent + JULY.internet + JULY.elevator + JULY.parking + t.electricityCost + t.waterCost);
  });

  it("đơn giá 0 hoặc tiêu thụ 0 → cost 0, total = 4 khoản cố định", () => {
    const t = computeRentalTotals({ ...JULY, newElec: 17_743, electricityRate: 0, newWater: 1_001 });
    expect(t.electricityCost).toBe(0);
    expect(t.waterCost).toBe(0);
    expect(t.total).toBe(3_600_000);
  });
});

describe("formatMeter", () => {
  it("chia hàng nghìn kiểu vi-VN (số công tơ + tiêu thụ)", () => {
    expect(formatMeter(280)).toBe("280");
    expect(formatMeter(6)).toBe("6");
    expect(formatMeter(1_028)).toBe("1.028");
    expect(formatMeter(17_743)).toBe("17.743");
    expect(formatMeter(100_000)).toBe("100.000");
  });

  it("giữ dấu âm (trường hợp data trái phép — FE/API chặn trước khi hiển thị)", () => {
    expect(formatMeter(-15)).toBe("-15");
  });
});

describe("isValidMonth / firstDayOfMonth / lastDayOfMonth / isValidDateInMonth", () => {
  it("isValidMonth chỉ nhận YYYY-MM (tháng 01–12)", () => {
    expect(isValidMonth("2026-07")).toBe(true);
    expect(isValidMonth("2026-12")).toBe(true);
    expect(isValidMonth("2026-13")).toBe(false);
    expect(isValidMonth("2026-00")).toBe(false);
    expect(isValidMonth("2026-7")).toBe(false);
    expect(isValidMonth("abc")).toBe(false);
    expect(isValidMonth("")).toBe(false);
  });

  it("firstDayOfMonth trả ngày 01 của tháng", () => {
    expect(firstDayOfMonth("2026-07")).toBe("2026-07-01");
  });

  it("lastDayOfMonth đúng tháng thường, tháng 2 năm thường và năm nhuận", () => {
    expect(lastDayOfMonth("2026-04")).toBe("2026-04-30");
    expect(lastDayOfMonth("2026-02")).toBe("2026-02-28");
    expect(lastDayOfMonth("2024-02")).toBe("2024-02-29");
    expect(lastDayOfMonth("2026-12")).toBe("2026-12-31");
  });

  it("isValidDateInMonth: date hợp lệ thật + đúng tháng", () => {
    expect(isValidDateInMonth("2026-07-15", "2026-07")).toBe(true);
    expect(isValidDateInMonth("2026-02-28", "2026-02")).toBe(true);
    expect(isValidDateInMonth("2026-02-31", "2026-02")).toBe(false);
    expect(isValidDateInMonth("2026-03-01", "2026-02")).toBe(false);
    expect(isValidDateInMonth("2026-07-32", "2026-07")).toBe(false);
    expect(isValidDateInMonth("2026/07/01", "2026-07")).toBe(false);
    expect(isValidDateInMonth("2026-7-1", "2026-07")).toBe(false);
  });
});

describe("buildRentalNote", () => {
  it("đúng format mẫu cho data tháng 7, dài ≤ 200 ký tự", () => {
    const note = buildRentalNote("2026-07", JULY);
    expect(note).toBe(
      "Phòng trọ 07/2026: phòng 3.200.000 + mạng 100.000 + thang máy 200.000 + xe 100.000" +
        " + điện 280 kWh (1.120.000) + nước 6 m³ (210.000)",
    );
    expect(note.length).toBeLessThanOrEqual(RENTAL_NOTE_MAX);
  });

  it("giá trị lớn vẫn chia hàng nghìn trong note", () => {
    const note = buildRentalNote("2026-08", { ...JULY, oldWater: 1_001, newWater: 11_028 });
    expect(note).toContain("nước 10.027 m³ (350.945.000)");
  });

  it("input trong cap API (1e9 / 1e6 / 1e7) luôn ≤ 200 ký tự", () => {
    const capped: RentalMonthFields = {
      rent: 1_000_000_000,
      internet: 1_000_000_000,
      elevator: 1_000_000_000,
      parking: 1_000_000_000,
      oldElec: 0,
      newElec: 1_000_000,
      electricityRate: 10_000_000,
      oldWater: 0,
      newWater: 1_000_000,
      waterRate: 10_000_000,
    };
    expect(buildRentalNote("2026-12", capped).length).toBeLessThanOrEqual(RENTAL_NOTE_MAX);
  });

  it("input dị thường (1e15 — ngoài cap API) vẫn không vượt 200 — cắt phòng vệ", () => {
    // Note format dài nhất có thể với giá trị cực đại ~191 ký tự; 1e15 đẩy qua 200
    // để khoá nhánh phòng vệ (API chặn 1e9 trước khi tới đây).
    const extreme: RentalMonthFields = {
      ...JULY,
      rent: 1e15,
      internet: 1e15,
      elevator: 1e15,
      parking: 1e15,
      oldElec: 0,
      newElec: 1_000_000,
      electricityRate: 10_000_000,
      oldWater: 0,
      newWater: 1_000_000,
      waterRate: 10_000_000,
    };
    const note = buildRentalNote("2026-12", extreme);
    expect(note.length).toBe(RENTAL_NOTE_MAX);
    expect(note.endsWith("…")).toBe(true);
  });
});

describe("RENTAL_CATEGORY", () => {
  it("khớp preset 'Nhà trọ' 🏠 trong PRESET_CATEGORIES", async () => {
    const { PRESET_CATEGORIES } = await import("./index.js");
    expect(PRESET_CATEGORIES).toContainEqual(RENTAL_CATEGORY);
  });
});
