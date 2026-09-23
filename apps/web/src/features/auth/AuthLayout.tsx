import type { ReactNode } from "react";

/**
 * Khung mobile-first (max ~430px, căn giữa) cho các màn auth.
 * Chỉ dùng design tokens trong index.css — không hardcode màu.
 */
export function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-6 py-10">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-bold text-ink">{title}</h1>
        {subtitle ? <p className="mt-1 text-ink-muted">{subtitle}</p> : null}
        <div className="mt-8">{children}</div>
      </div>
    </main>
  );
}

/** Lỗi form mức tổng thể (VD sai mật khẩu, email tồn tại) — hiện trên nút submit. */
export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="mb-4 rounded-lg bg-danger/10 px-3 py-2 text-sm font-medium text-danger">
      {message}
    </p>
  );
}
