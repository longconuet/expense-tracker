import { expect, test, type Page } from "@playwright/test";
import {
  addExpense,
  newAccount,
  pickCategory,
  registerAndCreateFamily,
  typeKeypad,
} from "./helpers";

/**
 * Mô phỏng server sập cho ĐỌC dữ liệu (5xx) — chỉ GET /api/families/*;
 * /me, /auth, health và mọi POST vẫn sống (đúng hành vi: API không xử lý
 * được request dữ liệu, còn phiên vẫn ổn).
 */
function apiDownForDataReads(page: Page): void {
  page.route("**/api/**", (route) => {
    const isDataGet =
      route.request().method() === "GET" &&
      route.request().url().includes("/api/families/");
    if (!isDataGet) return route.continue();
    return route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({
        success: false,
        data: null,
        error: { code: "INTERNAL_ERROR", message: "Máy chủ không xử lý được" },
      }),
    });
  });
}

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

  test("server 5xx khi đọc + đã có cache → banner dữ liệu lưu lúc HH:mm + data vẫn hiện", async ({
    page,
  }) => {
    // Arrange — đăng nhập + thêm khoản (lần fetch OK ghi cache list/stats tháng)
    await registerAndCreateFamily(page, newAccount());
    await addExpense(page, "75000", "Mua sắm");

    // Act — server 5xx cho GET dữ liệu, reload app
    apiDownForDataReads(page);
    await page.reload();
    await page.getByRole("heading", { name: "Trang chủ" }).waitFor();

    // Assert — banner "máy chủ không phản hồi … lúc HH:mm" + dữ liệu cache vẫn hiện
    await expect(
      page.getByText(/Máy chủ không phản hồi — đang xem dữ liệu lưu lúc \d{2}:\d{2}/),
    ).toBeVisible();
    await expect(page.locator('section[aria-label="Hôm nay"]')).toContainText("75.000 ₫");

    // Act — phục hồi server + reload
    await page.unroute("**/api/**");
    await page.reload();
    await page.getByRole("heading", { name: "Trang chủ" }).waitFor();

    // Assert — fetch live OK → banner mất
    await expect(page.getByText(/Máy chủ không phản hồi/)).toBeHidden();
  });

  test("thêm khoản online xoá cache → server sập ngay sau đó → KHÔNG hiện dữ liệu cũ", async ({
    page,
  }) => {
    // Arrange — trang chủ khi chưa có khoản (cache = list rỗng + stats 0)
    await registerAndCreateFamily(page, newAccount());
    await expect(page.getByText("Chưa có khoản chi nào tháng này")).toBeVisible();

    // Mở /add (lần fetch OK ghi cache danh mục), gõ sẵn số tiền + chọn danh mục
    await page.goto("/add");
    await typeKeypad(page, "75000");
    await pickCategory(page, "Mua sắm");

    // Server 5xx cho GET dữ liệu (POST vẫn sống) — đặt TRƯỚC khi lưu
    apiDownForDataReads(page);

    // Act — lưu khoản (POST thành công → invalidate cache list/stats tháng)
    await page.getByRole("button", { name: "Lưu khoản chi" }).click();

    // Assert — về trang chủ: KHÔNG hiện dữ liệu cũ (list rỗng/stats 0 đã bị xoá
    // cache) mà hiện lỗi tải dữ liệu — sạch hơn là hiện số thiếu khoản mới
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.getByText("Chưa có khoản chi nào tháng này")).toBeHidden();
  });
});
