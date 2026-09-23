import type { UserRole } from "@expense-tracker/shared";

/** Nhãn role trong family — dùng chung (switcher, màn Tôi). */
export function RoleBadge({ role }: { role: UserRole }) {
  return (
    <span className="rounded-full bg-primary-soft px-2 py-0.5 text-xs font-medium text-primary">
      {role === "OWNER" ? "Chủ gia đình" : "Thành viên"}
    </span>
  );
}
