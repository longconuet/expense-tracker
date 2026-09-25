/**
 * Gợi ý số tiền tròn khi đang gõ dở (hiện ngay dưới số tiền nhập):
 * tiền tố đã nhập nhân 10^3 → 10^6, tối đa 4 giá trị.
 * VD: "2" -> [2000, 20000, 200000, 2000000] (2k · 20k · 200k · 2m).
 */

/** Trần tuyệt đối của số tiền (9 chữ số — khớp MAX_AMOUNT_DIGITS của AddPage). */
const MAX_AMOUNT = 999_999_999;

const MULTIPLIERS = [1_000, 10_000, 100_000, 1_000_000];

export function suggestAmounts(digits: string): number[] {
  const prefix = parseInt(digits || "0", 10);
  if (!prefix) return [];
  return MULTIPLIERS.map((m) => prefix * m).filter((value) => value <= MAX_AMOUNT);
}
