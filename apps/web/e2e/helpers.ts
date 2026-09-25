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
 * Một ngày KHÁC hôm nay trong tháng hiện tại (ngày 1 của tháng; nếu hôm nay
 * đúng là ngày 1 thì dùng ngày 2). Label = "DD/MM" (luôn cùng năm hiện tại).
 * Dùng cho test nhóm theo ngày — không phụ thuộc ngày chạy test.
 */
export function anotherDayInCurrentMonth(): { date: string; label: string } {
  const now = new Date();
  const y = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  if (now.getDate() === 1) {
    return { date: `${y}-${mm}-02`, label: `02/${mm}` };
  }
  return { date: `${y}-${mm}-01`, label: `01/${mm}` };
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
