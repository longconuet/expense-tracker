import type { InputHTMLAttributes } from "react";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string | null;
  hint?: string;
}

/**
 * Input form có label + lỗi + hint — UI thuần, không gọi service.
 * id tự sinh để gắn label htmlFor.
 */
export function Input({ label, error, hint, id, className = "", ...rest }: InputProps) {
  const inputId = id ?? (label ? `input-${label.replace(/\s+/g, "-").toLowerCase()}` : undefined);

  return (
    <label className="block">
      {label ? (
        <span className="mb-1.5 block text-sm font-medium text-ink">{label}</span>
      ) : null}
      <input
        id={inputId}
        className={`w-full rounded-xl border border-border bg-card px-4 py-3 text-ink outline-none transition placeholder:text-ink-muted/60 focus:border-primary focus:ring-2 focus:ring-primary/30 ${className}`}
        {...rest}
      />
      {error ? (
        <span role="alert" className="mt-1 block text-sm font-medium text-danger">
          {error}
        </span>
      ) : null}
      {!error && hint ? (
        <span className="mt-1 block text-xs text-ink-muted">{hint}</span>
      ) : null}
    </label>
  );
}
