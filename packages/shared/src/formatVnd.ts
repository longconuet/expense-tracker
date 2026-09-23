/**
 * Định dạng số tiền VND: 1234567 -> "1.234.567 ₫"
 * Dùng regex thay vì Intl để đảm bảo output giống nhau trên mọi runtime.
 */
export function formatVnd(amount: number): string {
  const sign = amount < 0 ? "-" : "";
  const digits = Math.abs(Math.round(amount)).toString();
  const withSeparator = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${sign}${withSeparator} ₫`;
}
