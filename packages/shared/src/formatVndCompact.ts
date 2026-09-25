/**
 * Định dạng số tiền VND gọn cho ô nhỏ (VD ô ngày trên lịch) — số đầy đủ
 * không bị cắt: 250000 -> "250k", 1500000 -> "1.5m".
 *
 * Rule (chốt 25/09/2026):
 * - 0 -> "0"
 * - 0 < |amount| < 1000 -> giữ nguyên kèm ₫ ("500₫")
 * - 1000 <= |amount| < 1.000.000 -> làm tròn đến nghìn GẦN NHẤT + "k" (250500 -> "251k")
 * - |amount| >= 1.000.000 -> làm tròn 1 số thập phân + "m" (bỏ đuôi .0 khi chẵn)
 *   (999500 -> "1m" — qua ngưỡng triệu không hiển thị "1000k")
 *
 * Giống formatVnd: làm tròn số thập phân, số âm giữ dấu "-".
 */
export function formatVndCompact(amount: number): string {
  const sign = amount < 0 ? "-" : "";
  const abs = Math.abs(Math.round(amount));
  if (abs === 0) return "0";
  if (abs < 1000) return `${sign}${abs}₫`;

  const thousands = Math.round(abs / 1000);
  if (thousands < 1000) return `${sign}${thousands}k`;

  const millions = Math.round((abs / 1_000_000) * 10) / 10;
  const text = Number.isInteger(millions) ? String(millions) : millions.toFixed(1);
  return `${sign}${text}m`;
}
