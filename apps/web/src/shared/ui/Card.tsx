import type { HTMLAttributes } from "react";

/** Container có nền card, bo góc — dùng chung cho các khối nội dung. */
export function Card({ className = "", ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-2xl bg-card p-5 shadow-sm ${className}`}
      {...rest}
    />
  );
}
