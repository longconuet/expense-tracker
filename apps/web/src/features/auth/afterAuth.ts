import { ApiError } from "../../core/api";
import { useAuthStore } from "../../core/authStore";

/**
 * Sau khi login/đăng ký thành công:
 * - Nếu mang theo mã mời (?code= từ màn /join) → tự tham gia gia đình đó
 *   (bỏ qua ALREADY_MEMBER; lỗi khác để user thử lại ở /join)
 * - Trả về route đích: đã có family → "/", chưa có → "/onboarding"
 */
export async function completeAfterAuth(code: string | null): Promise<string> {
  if (code) {
    try {
      await useAuthStore.getState().joinFamily(code);
    } catch (err) {
      // Không chặn luồng chính — user vẫn có thể nhập lại mã ở /join hoặc onboarding
      if (err instanceof ApiError && err.code !== "ALREADY_MEMBER") {
        console.warn("Tự tham gia gia đình thất bại:", err.message);
      }
    }
  }

  const { families } = useAuthStore.getState();
  return families.length > 0 ? "/" : "/onboarding";
}
