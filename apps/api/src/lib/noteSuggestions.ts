/**
 * Cột `Category.noteSuggestions` lưu JSON array string (≤8 mục, 1–30 ký tự/mục)
 * hoặc null = không có gợi ý. Parse 1 lần duy nhất khi trả ra API — mọi
 * response chứa category đều trả `string[] | null` (khớp type shared).
 * Cột chỉ được ghi bởi chính API này (JSON.stringify) — fallback null là
 * hàng rào cuối, không bao giờ để 500 vì data dị thường.
 */
export function parseNoteSuggestions(raw: string | null): string[] | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) && value.every((item) => typeof item === "string")
      ? (value as string[])
      : null;
  } catch {
    return null;
  }
}
