import type { Page } from "@playwright/test";

/** Token duy nhất để các test không đụng nhau trên cùng 1 DB e2e. */
function uniqueToken(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export interface TestAccount {
  name: string;
  username: string;
  password: string;
  familyName: string;
}

export function newAccount(): TestAccount {
  const token = uniqueToken();
  return {
    name: `User E2E ${token}`,
    username: `e2e_${token}`,
    password: "MatKhau123!",
    familyName: `Nhà E2E ${token}`,
  };
}

/** Đăng ký → onboarding tạo gia đình → về trang chủ. */
export async function registerAndCreateFamily(page: Page, account: TestAccount): Promise<void> {
  await page.goto("/register");
  await page.getByLabel("Họ và tên").fill(account.name);
  await page.getByLabel("Tên đăng nhập").fill(account.username);
  await page.getByLabel("Mật khẩu").fill(account.password);
  await page.getByRole("button", { name: "Đăng ký" }).click();

  await page.getByLabel("Tên gia đình").fill(account.familyName);
  await page.getByRole("button", { name: "Tạo gia đình" }).click();
  await page.getByRole("heading", { name: "Trang chủ" }).waitFor();
}

/** Gõ số tiền qua keypad (bấm từng phím số như trên màn hình). */
export async function typeKeypad(page: Page, value: string): Promise<void> {
  const keypad = page.getByRole("group", { name: "Bàn phím số" });
  for (const digit of value) {
    await keypad.getByRole("button", { name: digit, exact: true }).click();
  }
}

/** Bấm phím xoá N lần. */
export async function backspace(page: Page, times: number): Promise<void> {
  const key = page
    .getByRole("group", { name: "Bàn phím số" })
    .getByRole("button", { name: "Xoá 1 chữ số" });
  for (let i = 0; i < times; i++) {
    await key.click();
  }
}

/** Chọn danh mục trên màn nhập/sửa theo tên (VD "Ăn uống"). */
export async function pickCategory(page: Page, name: string): Promise<void> {
  await page
    .getByRole("group", { name: "Danh mục chi tiêu" })
    .getByRole("button", { name, exact: true })
    .click();
}

/**
 * Một ngày trong tháng hiện tại KHÔNG phải hôm nay cũng KHÔNG phải hôm qua —
 * `dayLabel` render 2 ngày đó là "Hôm nay"/"Hôm qua" (không phải "DD/MM"),
 * test nhóm theo ngày cần ngày có label "DD/MM" trần. Chọn từ ngày 1–3
 * (nếu hôm nay là ngày 2 thì ngày 3 có thể là tương lai trong tháng —
 * lịch sử vẫn nhóm theo ngày bình thường).
 * Không phụ thuộc ngày chạy test.
 */
export function anotherDayInCurrentMonth(): { date: string; label: string } {
  const now = new Date();
  const y = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  for (let day = 1; day <= 3; day += 1) {
    const isToday = day === now.getDate();
    const isYesterday = day === yesterday.getDate() && yesterday.getMonth() === now.getMonth();
    if (isToday || isYesterday) continue;
    const dd = String(day).padStart(2, "0");
    return { date: `${y}-${mm}-${dd}`, label: `${dd}/${mm}` };
  }
  // Không chạm tới (mọi tháng ≥ 28 ngày — 3 ứng viên không thể cùng bị chặn
  // bởi hôm nay + hôm qua).
  throw new Error("anotherDayInCurrentMonth: không tìm được ngày phù hợp");
}

/**
 * Tạo khoản chi hoàn chỉnh trên /add (keypad + danh mục [+ ngày tuỳ chọn])
 * và chờ về trang chủ.
 */
export async function addExpense(
  page: Page,
  amount: string,
  categoryName: string,
  date?: string,
): Promise<void> {
  await page.goto("/add");
  await typeKeypad(page, amount);
  await pickCategory(page, categoryName);
  if (date) {
    await page.locator('input[type="date"]').fill(date);
  }
  await page.getByRole("button", { name: "Lưu khoản chi" }).click();
  await page.getByRole("heading", { name: "Trang chủ" }).waitFor();
}
