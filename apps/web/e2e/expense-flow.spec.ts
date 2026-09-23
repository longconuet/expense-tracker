import { expect, test } from "@playwright/test";
import {
  addExpense,
  anotherDayInCurrentMonth,
  backspace,
  newAccount,
  registerAndCreateFamily,
  typeKeypad,
} from "./helpers";

test.describe("Luồng khoản chi: keypad → trang chủ → lịch sử → sửa → xoá (E2E)", () => {
  test.beforeEach(async ({ page }) => {
    await registerAndCreateFamily(page, newAccount());
  });

  test("nhập chi qua keypad → trang chủ hiện trong nhóm 'Hôm nay' có tiểu kết", async ({
    page,
  }) => {
    // Act — nhập 125000 (125.000 ₫) qua keypad
    await addExpense(page, "125000", "Ăn uống");

    // Assert
    const group = page.locator('section[aria-label="Hôm nay"]');
    await expect(group).toBeVisible();
    await expect(group).toContainText("125.000 ₫");
    await expect(group).toContainText("Ăn uống");
  });

  test("lịch sử: 2 khoản ở 2 ngày khác nhau → nhóm theo ngày có tiểu kết", async ({
    page,
  }) => {
    // Arrange — 1 khoản hôm nay + 1 khoản ở ngày khác của cùng tháng
    // (lịch sử lọc theo tháng — khoản tháng khác không bao giờ hiện)
    const other = anotherDayInCurrentMonth();
    await addExpense(page, "10000", "Ăn uống");
    await addExpense(page, "20000", "Đi lại", other.date);

    // Act
    await page.goto("/history");

    // Assert
    const today = page.locator('section[aria-label="Hôm nay"]');
    const otherGroup = page.locator(`section[aria-label="${other.label}"]`);
    await expect(today).toContainText("10.000 ₫");
    await expect(otherGroup).toContainText("20.000 ₫");
  });

  test("chạm khoản ở lịch sử → edit pre-fill → đổi số tiền → lưu → lịch sử cập nhật", async ({
    page,
  }) => {
    // Arrange
    await addExpense(page, "32500", "Ăn uống");
    await page.goto("/history");

    // Act — chạm khoản → màn sửa
    await page.locator('a[href*="/edit"]').first().click();
    await expect(page.getByRole("heading", { name: "Sửa khoản chi" })).toBeVisible();

    // Assert — pre-fill đúng giá trị cũ
    await expect(page.locator('[aria-live="polite"]')).toContainText("32.500");

    // Act — đổi 32500 → 30000 (xoá 4 chữ số cuối + gõ 4 số 0)
    await backspace(page, 4);
    await typeKeypad(page, "0000");
    await page.getByRole("button", { name: "Lưu thay đổi" }).click();

    // Assert — về lịch sử, nhóm ngày cập nhật giá trị mới
    await expect(page).toHaveURL(/\/history/);
    await expect(page.locator('section[aria-label="Hôm nay"]')).toContainText("30.000 ₫");
  });

  test("xoá khoản có xác nhận → khoản biến mất khỏi lịch sử", async ({ page }) => {
    // Arrange
    await addExpense(page, "15000", "Mua sắm");
    await page.goto("/history");
    page.on("dialog", (dialog) => dialog.accept());

    // Act
    await page.getByRole("button", { name: /Xoá khoản/ }).click();

    // Assert
    await expect(page.getByText("Chưa có khoản chi tháng này")).toBeVisible();
  });
});
