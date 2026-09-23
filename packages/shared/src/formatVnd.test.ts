import { describe, expect, it } from "vitest";
import { formatVnd } from "./formatVnd";

describe("formatVnd", () => {
  it("chia hàng nghìn bằng dấu chấm và kèm ký hiệu ₫", () => {
    expect(formatVnd(1234567)).toBe("1.234.567 ₫");
  });

  it("xử lý số 0", () => {
    expect(formatVnd(0)).toBe("0 ₫");
  });

  it("làm tròn số có phần thập phân", () => {
    expect(formatVnd(1234.6)).toBe("1.235 ₫");
  });

  it("giữ dấu âm cho số âm", () => {
    expect(formatVnd(-999999)).toBe("-999.999 ₫");
  });
});
