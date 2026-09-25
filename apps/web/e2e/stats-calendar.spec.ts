import { expect, test } from "@playwright/test";
import {
  addExpense,
  anotherDayInCurrentMonth,
  newAccount,
  registerAndCreateFamily,
} from "./helpers";

test.describe("Thống kê: lịch chi tiêu theo ngày (E2E)", () => {
  test.beforeEach(async ({ page }) => {
    await registerAndCreateFamily(page, newAccount());
  });

  test("2 khoản cùng ngày → ô lịch hiện tổng gọn không cắt; click ngày → popup chi tiết", async ({
    page,
  }) => {
    // Arrange — 2 khoản (250.000 + 50.000) tại 1 ngày trong tháng hiện tại
    const day = anotherDayInCurrentMonth();
    await addExpense(page, "250000", "Ăn uống", day.date);
    await addExpense(page, "50000", "Đi lại", day.date);

    // Act
    await page.goto("/stats");

    // Assert — card "Lịch chi tiêu" hiện, ô ngày có chi hiển thị tổng gọn 300k
    await expect(page.locator('section[aria-label^="Lịch chi tiêu"]')).toBeVisible();
    const dayCell = page.getByRole("button", {
      name: `Ngày ${Number(day.date.slice(8))}, chi tiêu 300.000 ₫`,
    });
    await expect(dayCell).toBeVisible();
    await expect(dayCell).toContainText("300k");

    // Act — click ngày → popup chi tiết
    await dayCell.click();

    // Assert — popup có tổng đầy đủ + 2 khoản chi tiết
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("Chi tiêu ngày " + day.label);
    await expect(dialog).toContainText("300.000 ₫");
    await expect(dialog).toContainText("250.000 ₫");
    await expect(dialog).toContainText("50.000 ₫");

    // Act — đóng popup
    await page.getByRole("button", { name: "Đóng" }).click();

    // Assert
    await expect(dialog).not.toBeVisible();
  });
});
