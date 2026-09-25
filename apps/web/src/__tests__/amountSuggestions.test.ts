import { describe, expect, it } from "vitest";
import { suggestAmounts } from "../features/expenses/amountSuggestions";

describe("suggestAmounts (gợi ý số tròn khi gõ dở)", () => {
  it("chưa nhập hoặc nhập 0 → không có gợi ý (kể cả prefix đầu 0)", () => {
    // Act + Assert
    expect(suggestAmounts("")).toEqual([]);
    expect(suggestAmounts("0")).toEqual([]);
    expect(suggestAmounts("00")).toEqual([]);
    expect(suggestAmounts("02")).toEqual([2000, 20000, 200000, 2000000]);
  });

  it("nhập 2 → 4 gợi ý 2k / 20k / 200k / 2m (nhân 10^3 → 10^6)", () => {
    // Act
    const result = suggestAmounts("2");

    // Assert
    expect(result).toEqual([2000, 20000, 200000, 2000000]);
  });

  it("nhập nhiều chữ số → nhân theo tiền tố đã nhập", () => {
    // Act
    const result = suggestAmounts("25");

    // Assert
    expect(result).toEqual([25000, 250000, 2500000, 25000000]);
  });

  it("loại gợi ý vượt 9 chữ số (giới hạn số tiền) — còn dưới 4", () => {
    // Act + Assert
    expect(suggestAmounts("9999")).toEqual([9999000, 99990000, 999900000]);
    expect(suggestAmounts("999999")).toEqual([999999000]);
    expect(suggestAmounts("9999999")).toEqual([]);
  });
});
