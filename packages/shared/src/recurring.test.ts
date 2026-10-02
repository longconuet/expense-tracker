import { describe, expect, it } from "vitest";
import {
  advanceMonthly,
  anchorDayOf,
  describeRecurringEnd,
  firstOccurrenceFrom,
  materializeDates,
  nextOccurrence,
  occurrenceInMonth,
  type MaterializeDatesInput,
} from "./recurring";

/** Input materializeDates tiện lợi: FOREVER, anchor 1 (ngày 01 hàng tháng). */
function baseInput(over: Partial<MaterializeDatesInput> = {}): MaterializeDatesInput {
  return {
    nextDate: "2026-08-01",
    anchorDay: 1,
    endType: "FOREVER",
    endDate: null,
    occurrenceCount: null,
    generatedCount: 0,
    ...over,
  };
}

describe("anchorDayOf / occurrenceInMonth — neo theo ngày \"Từ\"", () => {
  it("anchorDayOf lấy ngày từ YYYY-MM-DD", () => {
    expect(anchorDayOf("2026-01-31")).toBe(31);
    expect(anchorDayOf("2026-10-05")).toBe(5);
  });

  it("kỳ của tháng theo anchor, clamp ngày cuối tháng", () => {
    expect(occurrenceInMonth(31, 2026, 1)).toBe("2026-01-31");
    expect(occurrenceInMonth(31, 2026, 2)).toBe("2026-02-28");
    expect(occurrenceInMonth(31, 2024, 2)).toBe("2024-02-29"); // năm nhuận
    expect(occurrenceInMonth(31, 2026, 4)).toBe("2026-04-30");
    expect(occurrenceInMonth(31, 2026, 3)).toBe("2026-03-31");
    expect(occurrenceInMonth(15, 2026, 12)).toBe("2026-12-15");
  });
});

describe("advanceMonthly — primitive 1 bước (clamp ngày)", () => {
  it("clamp ngày 31 về cuối tháng 2 (2026 không nhuận → 28/02)", () => {
    expect(advanceMonthly("2026-01-31")).toBe("2026-02-28");
  });

  it("năm nhuận: 31/01/2024 → 29/02/2024", () => {
    expect(advanceMonthly("2024-01-31")).toBe("2024-02-29");
  });

  it("ngày không chạm cuối tháng → giữ nguyên ngày", () => {
    expect(advanceMonthly("2026-01-15")).toBe("2026-02-15");
  });

  it("tràn năm: 31/12/2026 → 31/01/2027", () => {
    expect(advanceMonthly("2026-12-31")).toBe("2027-01-31");
  });
});

describe("nextOccurrence — nối chuỗi kỳ neo anchor", () => {
  it("từ kỳ đã clamp 28/02, anchor 31 → TRỞ LẠI 31/03", () => {
    expect(nextOccurrence(31, "2026-02-28")).toBe("2026-03-31");
  });

  it("tháng ngắn: anchor 30, từ 30/01 → 28/02", () => {
    expect(nextOccurrence(30, "2026-01-30")).toBe("2026-02-28");
  });

  it("tràn năm: anchor 1, từ 01/12 → 01/01 năm sau", () => {
    expect(nextOccurrence(1, "2026-12-01")).toBe("2027-01-01");
  });
});

describe("firstOccurrenceFrom — không sinh bù quá khứ, neo anchor day", () => {
  it("startDate trong tương lai → giữ nguyên", () => {
    expect(firstOccurrenceFrom("2026-11-15", "2026-10-01")).toBe("2026-11-15");
  });

  it("startDate trong quá khứ → ngày khớp gần nhất ≥ today", () => {
    expect(firstOccurrenceFrom("2026-09-15", "2026-10-01")).toBe("2026-10-15");
  });

  it("anchor 31: từ 31/01 đến 01/10 → 31/10 (TRỞ LẠI 31 sau tháng 2)", () => {
    expect(firstOccurrenceFrom("2026-01-31", "2026-10-01")).toBe("2026-10-31");
  });

  it("anchor 31: từ 31/01 đến 15/02 → 28/02 (clamp tháng 2)", () => {
    expect(firstOccurrenceFrom("2026-01-31", "2026-02-15")).toBe("2026-02-28");
  });

  it("chặn sập ngày: anchor 31, today 01/04 → 30/04 (tháng 4 có 30 ngày)", () => {
    expect(firstOccurrenceFrom("2026-01-31", "2026-04-01")).toBe("2026-04-30");
  });

  it("startDate = today → sinh ngay hôm nay", () => {
    expect(firstOccurrenceFrom("2026-10-01", "2026-10-01")).toBe("2026-10-01");
  });
});

describe("materializeDates", () => {
  it("FOREVER quá hạn 2 kỳ + hôm nay → sinh 3, nextDate = tháng tới, chưa hoàn tất", () => {
    const r = materializeDates(baseInput(), "2026-10-01");
    expect(r.dates).toEqual(["2026-08-01", "2026-09-01", "2026-10-01"]);
    expect(r.nextDate).toBe("2026-11-01");
    expect(r.completed).toBe(false);
  });

  it("anchor 31: nextDate 28/02 (đã clamp) → kỳ kế tiếp TRỞ LẠI 31/03", () => {
    const r = materializeDates(baseInput({ nextDate: "2026-02-28", anchorDay: 31 }), "2026-03-31");
    expect(r.dates).toEqual(["2026-02-28", "2026-03-31"]);
    expect(r.nextDate).toBe("2026-04-30");
    expect(r.completed).toBe(false);
  });

  it("COUNT: chỉ sinh đủ số lần còn thiếu rồi hoàn tất", () => {
    const r = materializeDates(
      baseInput({ endType: "COUNT", occurrenceCount: 3, generatedCount: 2 }),
      "2026-10-01",
    );
    expect(r.dates).toEqual(["2026-08-01"]); // còn 1/3 lần
    expect(r.nextDate).toBeNull();
    expect(r.completed).toBe(true);
  });

  it("UNTIL_DATE: sinh đến hết endDate rồi hoàn tất (kể cả kỳ vượt hạn trong quá khứ)", () => {
    const r = materializeDates(
      baseInput({ endType: "UNTIL_DATE", endDate: "2026-09-01" }),
      "2026-10-01",
    );
    expect(r.dates).toEqual(["2026-08-01", "2026-09-01"]);
    expect(r.nextDate).toBeNull();
    expect(r.completed).toBe(true);
  });

  it("nextDate trong tương lai → không sinh gì, giữ nguyên", () => {
    const r = materializeDates(baseInput({ nextDate: "2026-11-01" }), "2026-10-01");
    expect(r.dates).toEqual([]);
    expect(r.nextDate).toBe("2026-11-01");
    expect(r.completed).toBe(false);
  });

  it("cap phòng vệ: dừng giữa chừng, KHÔNG hoàn tất — tick kế tiếp nối tiếp", () => {
    const r = materializeDates(baseInput({ nextDate: "2025-01-01" }), "2026-10-01", 3);
    expect(r.dates).toEqual(["2025-01-01", "2025-02-01", "2025-03-01"]);
    expect(r.nextDate).toBe("2025-04-01");
    expect(r.completed).toBe(false);
  });

  it("COUNT vừa đủ sau kỳ cuối (nextDate còn ≤ today) → hoàn tất, không sinh thêm", () => {
    const r = materializeDates(
      baseInput({ endType: "COUNT", occurrenceCount: 2 }),
      "2026-10-01",
    );
    expect(r.dates).toEqual(["2026-08-01", "2026-09-01"]);
    expect(r.nextDate).toBeNull();
    expect(r.completed).toBe(true);
  });

  it("UNTIL_DATE với endDate < nextDate (đã hết hạn) → không sinh, hoàn tất ngay", () => {
    const r = materializeDates(
      baseInput({ endType: "UNTIL_DATE", endDate: "2026-09-01", generatedCount: 5, nextDate: "2026-10-01" }),
      "2026-10-01",
    );
    expect(r.dates).toEqual([]);
    expect(r.nextDate).toBeNull();
    expect(r.completed).toBe(true);
  });
});

describe("describeRecurringEnd", () => {
  it("Mãi mãi", () => {
    expect(describeRecurringEnd("FOREVER", null, null)).toBe("Mãi mãi");
  });

  it("Đến <dd/MM/yyyy>", () => {
    expect(describeRecurringEnd("UNTIL_DATE", "2026-12-31", null)).toBe("Đến 31/12/2026");
  });

  it("<N> lần", () => {
    expect(describeRecurringEnd("COUNT", null, 5)).toBe("5 lần");
  });
});
