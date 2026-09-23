/** Spinner loading — size mặc định trung bình, tuỳ chỉnh qua className. */
export function Spinner({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <div
      role="status"
      aria-label="Đang tải"
      className={`${className} animate-spin rounded-full border-4 border-primary border-t-transparent`}
    />
  );
}

/** Khung loading toàn màn (giữ nền surface). */
export function FullPageSpinner() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface">
      <Spinner />
    </main>
  );
}
