/**
 * Skeleton loading — khối placeholder mô phỏng hình dạng nội dung.
 * Màu dùng token theme `ink` (bg-ink/10) → tự đúng cả light/dark.
 * Từng khối là `aria-hidden` (trang trí) — container bao của màn hình
 * chịu trách nhiệm `role="status" aria-label="Đang tải"`.
 */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse rounded-lg bg-ink/10 ${className}`} />;
}
