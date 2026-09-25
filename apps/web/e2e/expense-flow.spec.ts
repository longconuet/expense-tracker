import { expect, test } from "@playwright/test";
import {
  addExpense,
  anotherDayInCurrentMonth,
  backspace,
  newAccount,
  pickCategory,
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

  test("gợi ý số tiền: gõ 2 → bấm chip 20k → lưu → khoản 20.000 ₫", async ({ page }) => {
    // Arrange + Act — gõ 2, chip gợi ý hiện ngay dưới số tiền
    await page.goto("/add");
    await typeKeypad(page, "2");
    const chip = page.getByRole("button", { name: "Gợi ý 20.000 ₫", exact: true });
    await expect(chip).toHaveText("20k");
    await chip.click();
    await pickCategory(page, "Ăn uống");
    await page.getByRole("button", { name: "Lưu khoản chi" }).click();

    // Assert
    await expect(page.locator('section[aria-label="Hôm nay"]')).toContainText("20.000 ₫");
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

    // Act — bấm xoá → ConfirmDialog → xác nhận
    await page.getByRole("button", { name: /Xoá khoản/ }).click();
    await page.getByRole("button", { name: "Xoá", exact: true }).click();

    // Assert
    await expect(page.getByText("Chưa có khoản chi tháng này")).toBeVisible();
  });

  test("gõ số tiền → khung gợi ý cố định: vị trí danh mục không đổi (không nhảy layout)", async ({
    page,
  }) => {
    // Arrange — màn /add, số tiền trống (chưa có gợi ý)
    await page.goto("/add");
    const categoryRow = page.getByRole("group", { name: "Danh mục chi tiêu" });
    await expect(categoryRow).toBeVisible(); // chờ qua Spinner (categories tải xong)
    const yBefore = (await categoryRow.boundingBox())?.y;
    expect(yBefore).toBeDefined();

    // Act — gõ 1 chữ số → chip gợi ý hiện ra
    await page
      .getByRole("group", { name: "Bàn phím số" })
      .getByRole("button", { name: "2", exact: true })
      .click();
    await expect(page.getByRole("button", { name: "Gợi ý 2.000 ₫" })).toBeVisible();

    // Assert — chiều cao khối gợi ý cố định → vị trí danh mục không dịch chuyển
    const yAfter = (await categoryRow.boundingBox())?.y;
    expect(yAfter).toBeDefined();
    expect(Math.abs(yAfter! - yBefore!)).toBeLessThan(1);
  });
});

test.describe("Lịch sử: lọc theo thành viên (E2E)", () => {
  test("family 2 thành viên → chip lọc; chọn member → chỉ hiện khoản của người đó", async ({
    browser,
    page,
  }) => {
    // Arrange — A tạo family + 1 khoản 10.000 ₫
    const a = newAccount();
    await registerAndCreateFamily(page, a);
    await addExpense(page, "10000", "Ăn uống");

    // Đọc mã mời trên màn "Tôi"
    await page.goto("/me");
    const inviteCode = (await page.locator("p.font-mono").first().textContent())?.trim();
    expect(inviteCode).toMatch(/^[A-HJ-MN-Z2-9]{6}$/);

    // B đăng ký ở context riêng → auto-join qua ?code= → thêm 1 khoản 20.000 ₫
    const b = newAccount();
    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    await pageB.goto(`/register?code=${inviteCode}`);
    await pageB.getByLabel("Họ và tên").fill(b.name);
    await pageB.getByLabel("Tên đăng nhập").fill(b.username);
    await pageB.getByLabel("Mật khẩu").fill(b.password);
    await pageB.getByRole("button", { name: "Đăng ký" }).click();
    await pageB.getByRole("heading", { name: "Trang chủ" }).waitFor();
    await addExpense(pageB, "20000", "Ăn uống");

    // Act — A mở lịch sử, hiện chip 2 thành viên, lọc theo B
    await page.goto("/history");
    const memberGroup = page.getByRole("group", { name: "Lọc theo thành viên" });
    await expect(memberGroup.getByRole("button", { name: a.name, exact: true })).toBeVisible();
    await expect(memberGroup.getByRole("button", { name: b.name, exact: true })).toBeVisible();

    await memberGroup.getByRole("button", { name: b.name, exact: true }).click();

    // Assert — chỉ còn khoản của B (20.000 ₫), khoản 10.000 ₫ của A biến mất
    const today = page.locator('section[aria-label="Hôm nay"]');
    await expect(today).toContainText("20.000 ₫");
    await expect(today).not.toContainText("10.000 ₫");

    // Về "Tất cả" → cả 2 khoản hiện lại
    await memberGroup.getByRole("button", { name: "Tất cả" }).click();
    await expect(today).toContainText("10.000 ₫");
    await expect(today).toContainText("20.000 ₫");

    await contextB.close();
  });
});
