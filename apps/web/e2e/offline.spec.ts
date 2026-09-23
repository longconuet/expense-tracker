import { expect, test } from "@playwright/test";
import { newAccount, pickCategory, registerAndCreateFamily, typeKeypad } from "./helpers";

test.describe("Offline (E2E)", () => {
  test("server không đạt → khoản vào hàng đợi + banner; phục hồi + reload → tự sync", async ({
    page,
  }) => {
    // Arrange — đăng nhập + tạo gia đình bình thường (API còn sống)
    await registerAndCreateFamily(page, newAccount());

    // Mô phỏng server down cho ghi: chặn POST /api/expenses
    // (read vẫn sống — đúng hành vi dev: mạng OK nhưng API không xử lý được)
    await page.route("**/api/expenses", (route) => route.abort());

    // Act — nhập khoản khi "server down"
    await page.goto("/add");
    await typeKeypad(page, "75000");
    await pickCategory(page, "Mua sắm");
    await page.getByRole("button", { name: "Lưu khoản chi" }).click();
    await page.getByRole("heading", { name: "Trang chủ" }).waitFor();

    // Assert — banner "chờ đồng bộ" hiện (khoản đã vào hàng đợi offline)
    const banner = page.getByText(/đang chờ đồng bộ khi có mạng/);
    await expect(banner).toBeVisible();

    // Act — server phục hồi + reload app (initSync lúc khởi động → flush queue)
    await page.unroute("**/api/expenses");
    await page.reload();

    // Assert — app đã render lại: banner mất, khoản đã sync và hiện ở trang chủ
    await page.getByRole("heading", { name: "Trang chủ" }).waitFor();
    await expect(banner).toBeHidden();
    await expect(page.locator('section[aria-label="Hôm nay"]')).toContainText("75.000 ₫");
  });
});
