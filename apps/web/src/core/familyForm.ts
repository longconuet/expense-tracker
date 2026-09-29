/**
 * Validation form tạo/join family — dùng chung cho OnboardingPage (user 0 family)
 * và FamilySwitcher (user tạo/join thêm family).
 * Rule khớp API: tên `trim().min(2).max(50)` (familyNameSchema), mã mời 6 ký tự
 * thuộc bảng alphabet không chứa 0, 1, I, O (khớp lib/inviteCode phía server).
 */

/** Bảng ký tự của mã mời: A-Z (trừ I, O) + 2-9 (trừ 0, 1). */
export const INVITE_CODE_PATTERN = /^[A-HJ-MN-Z2-9]{6}$/;

export const FAMILY_NAME_MIN = 2;
export const FAMILY_NAME_MAX = 50;

/** Trả về message lỗi hoặc null nếu tên hợp lệ. */
export function validateFamilyName(name: string): string | null {
  if (name.trim().length < FAMILY_NAME_MIN) {
    return `Tên gia đình phải có ít nhất ${FAMILY_NAME_MIN} ký tự.`;
  }
  if (name.trim().length > FAMILY_NAME_MAX) {
    return `Tên gia đình tối đa ${FAMILY_NAME_MAX} ký tự.`;
  }
  return null;
}

/** Trả về message lỗi hoặc null nếu mã hợp lệ. */
export function validateInviteCode(code: string): string | null {
  if (!INVITE_CODE_PATTERN.test(code)) {
    return "Mã mời phải gồm 6 ký tự chữ/số (không có số 0, 1 và chữ I, O).";
  }
  return null;
}
