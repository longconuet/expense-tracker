// Kiểu dữ liệu dùng chung giữa frontend và backend.

export { formatVnd } from "./formatVnd";

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
  email: string;
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
  isPreset: boolean;
  order: number;
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
}

// ---------------------------------------------------------------------------
// Danh mục mặc định — tự động tạo khi lập gia đình (chốt 22/09/2026)
// ---------------------------------------------------------------------------

export const PRESET_CATEGORIES = [
  { name: "Ăn uống", icon: "🍜" },
  { name: "Đi lại", icon: "🚗" },
  { name: "Gia đình", icon: "⚡" },
  { name: "Sức khỏe", icon: "💊" },
  { name: "Vui chơi", icon: "🎬" },
  { name: "Mua sắm", icon: "🛒" },
  { name: "Khác", icon: "📦" },
] as const;
