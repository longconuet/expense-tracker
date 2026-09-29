import { describe, expect, it } from "vitest";
import { parseNoteSuggestions } from "../lib/noteSuggestions.js";

describe("parseNoteSuggestions (JSON string DB → string[] | null)", () => {
  it("raw null → null", () => {
    expect(parseNoteSuggestions(null)).toBeNull();
  });

  it("JSON array string hợp lệ → trả array", () => {
    expect(parseNoteSuggestions('["Đổ xăng","Đặt xe"]')).toEqual(["Đổ xăng", "Đặt xe"]);
  });

  it("JSON hỏng (không parse được) → null, không throw", () => {
    expect(parseNoteSuggestions("{không phải json")).toBeNull();
    expect(parseNoteSuggestions("Đổ xăng")).toBeNull();
  });

  it("JSON không phải array / array không phải string → null", () => {
    expect(parseNoteSuggestions('{"a":1}')).toBeNull();
    expect(parseNoteSuggestions("[1,2]")).toBeNull();
    expect(parseNoteSuggestions('["ok",null]')).toBeNull();
  });
});
