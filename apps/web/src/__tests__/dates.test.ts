import { describe, expect, it } from "vitest";
import { monthOf, formatTimeShort } from "../core/dates";

describe("core/dates — bổ trợ cache", () => {
  it("monthOf: rút tháng (YYYY-MM) từ date", () => {
    // Act + Assert
    expect(monthOf("2026-09-22")).toBe("2026-09");
    expect(monthOf("2026-12-01")).toBe("2026-12");
  });

  it("formatTimeShort: ISO → HH:mm (24h, không phụ thuộc múi giờ máy test)", () => {
    // Arrange
    const iso = "2026-09-22T14:05:00.000Z";

    // Act
    const result = formatTimeShort(iso);

    // Assert — format "HH:mm" 24h (không phải "hh:mm AM/PM" hay "HH.mm")
    expect(result).toMatch(/^\d{2}:\d{2}$/);
    expect(result.length).toBe(5);
  });
});
