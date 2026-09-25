import { describe, expect, it } from "vitest";
import { formatVndCompact } from "./formatVndCompact";

describe("formatVndCompact", () => {
  it("số 0 -> \"0\"", () => {
    expect(formatVndCompact(0)).toBe("0");
  });

  it("dưới 1000 không gượng ép thành k, giữ nguyên kèm ₫", () => {
    expect(formatVndCompact(500)).toBe("500₫");
    expect(formatVndCompact(999)).toBe("999₫");
  });

  it("1000đ = 1k, 250000 -> \"250k\"", () => {
    expect(formatVndCompact(1000)).toBe("1k");
    expect(formatVndCompact(250_000)).toBe("250k");
  });

  it("làm tròn đến nghìn gần nhất", () => {
    expect(formatVndCompact(250_500)).toBe("251k");
    expect(formatVndCompact(249_900)).toBe("250k");
    expect(formatVndCompact(1499)).toBe("1k");
    expect(formatVndCompact(1500)).toBe("2k");
  });

  it("hàng triệu -> m, 1 số thập phân nếu cần", () => {
    expect(formatVndCompact(1_000_000)).toBe("1m");
    expect(formatVndCompact(1_500_000)).toBe("1.5m");
    expect(formatVndCompact(2_500_000)).toBe("2.5m");
    expect(formatVndCompact(1_234_000)).toBe("1.2m");
  });

  it("999.500 qua ngưỡng triệu -> \"1m\" (không hiển thị 1000k)", () => {
    expect(formatVndCompact(999_500)).toBe("1m");
  });

  it("làm tròn số có phần thập phân như formatVnd", () => {
    expect(formatVndCompact(250_000.9)).toBe("250k");
  });

  it("giữ dấu âm cho số âm", () => {
    expect(formatVndCompact(-250_000)).toBe("-250k");
    expect(formatVndCompact(-500)).toBe("-500₫");
  });
});
