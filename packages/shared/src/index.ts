// Kiểu dữ liệu dùng chung giữa frontend và backend.

export { formatVnd } from "./formatVnd.js";
export { formatVndCompact } from "./formatVndCompact.js";
export * from "./rental.js";

// ---------------------------------------------------------------------------
// Envelope API — mọi response REST đều có cấu trúc này
// ---------------------------------------------------------------------------

export interface ApiError {
  code: string;
  message: string;
}

export interface ApiMeta {
  page: number;
  pageSize: number;
  total: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  error: ApiError | null;
  meta?: ApiMeta;
}

// ---------------------------------------------------------------------------
// Domain
// ---------------------------------------------------------------------------

export type UserRole = "OWNER" | "MEMBER";

export interface User {
  id: string;
  name: string;
  username: string;
}

export interface Family {
  id: string;
  name: string;
  inviteCode: string;
  ownerName: string;
  memberCount: number;
  myRole: UserRole; // role của user đang xem trong family này
}

export interface FamilyMemberDto {
  userId: string;
  name: string;
  role: UserRole;
  joinedAt: string;
}

export interface FamilyMember {
  id: string;
  userId: string;
  name: string;
  role: UserRole;
  joinedAt: string;
}

export interface Category {
  id: string;
  name: string;
  icon: string;
  /** Chỉ ghi nhận nguồn gốc (danh mục khởi tạo khi lập family) — không có hành vi riêng. */
  isPreset: boolean;
  order: number;
  /**
   * Gợi ý ghi chú nhanh (≤8 mục, mỗi mục 1–30 ký tự) — null = không có.
   * Optional vì payload nested `Expense.category` (toExpenseDto) không có field
   * này; `fetchCategories` luôn normalize về `string[] | null` cho consumer.
   */
  noteSuggestions?: string[] | null;
}

export interface Expense {
  id: string;
  amount: number;
  date: string; // YYYY-MM-DD
  note: string | null;
  category: Category;
  createdByName: string;
  createdAt: string; // ISO 8601
}

export interface MonthlyStats {
  month: string; // YYYY-MM
  total: number;
  previousMonthTotal: number;
  byCategory: Array<{ category: Category; total: number; percent: number }>;
  byDay: Array<{ date: string; total: number }>;
  byMember: Array<{ name: string; total: number; percent: number }>;
}

// ---------------------------------------------------------------------------
// Danh mục mặc định — tự động tạo khi lập gia đình (chốt 22/09/2026;
// + "Nhà trọ" 30/09/2026 — spec-rental.md; family cũ được backfill trong
// migration add_rental)
// ---------------------------------------------------------------------------

export const PRESET_CATEGORIES = [
  { name: "Ăn uống", icon: "🍜" },
  { name: "Đi lại", icon: "🚗" },
  { name: "Gia đình", icon: "⚡" },
  { name: "Nhà trọ", icon: "🏠" },
  { name: "Sức khỏe", icon: "💊" },
  { name: "Vui chơi", icon: "🎬" },
  { name: "Mua sắm", icon: "🛒" },
  { name: "Khác", icon: "📦" },
] as const;
