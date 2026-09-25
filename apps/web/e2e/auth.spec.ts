import { expect, test } from "@playwright/test";
import { newAccount, registerAndCreateFamily } from "./helpers";

test.describe("Luồng auth (E2E)", () => {
  test("đăng ký → tạo gia đình → về trang chủ", async ({ page }) => {
    // Arrange + Act
    await registerAndCreateFamily(page, newAccount());

    // Assert
    await expect(page.getByRole("heading", { name: "Trang chủ" })).toBeVisible();
    expect(page.url()).toMatch(/\/$/);
  });

  test("reload khi còn refresh cookie → phiên được khôi phục, không đăng nhập lại", async ({
    page,
  }) => {
    // Arrange
    await registerAndCreateFamily(page, newAccount());

    // Act
    await page.reload();

    // Assert
    expect(page.url()).not.toContain("/login");
    await expect(page.getByRole("heading", { name: "Trang chủ" })).toBeVisible();
  });

  test("đăng nhập sai mật khẩu → hiện lỗi, vẫn ở trang đăng nhập", async ({
    browser,
    page,
  }) => {
    // Arrange — tạo tài khoản thật (trên trang đang đăng nhập)
    const account = newAccount();
    await registerAndCreateFamily(page, account);

    // Context mới = chưa đăng nhập
    const context = await browser.newContext();
    const fresh = await context.newPage();
    await fresh.goto("/login");
    await fresh.getByLabel("Tên đăng nhập").fill(account.username);
    await fresh.getByLabel("Mật khẩu").fill("MatKhau-sai-999");

    // Act
    await fresh.getByRole("button", { name: "Đăng nhập" }).click();

    // Assert
    await expect(fresh.getByRole("alert")).toContainText(
      "Tên đăng nhập hoặc mật khẩu không đúng",
    );
    expect(fresh.url()).toContain("/login");
    await context.close();
  });
});
