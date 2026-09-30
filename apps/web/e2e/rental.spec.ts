import { expect, test } from "@playwright/test";
import { newAccount, registerAndCreateFamily } from "./helpers";

/**
 * Tiền phòng trọ (E2E) — spec docs/spec-rental.md §5.4:
 * - Case 53: happy path toàn trình — config 6 giá trị → form tháng (prefill)
 *   → công tơ 17.743/18.023 + 1.001/1.007 → tổng 4.930.000 ₫ → chốt →
 *   khoản "Nhà trọ" 4.930.000 ₫ trong lịch sử.
 * - Case 54 (kéo dài 53): mở tháng đã chốt → đổi giá điện 3.500 → chốt lại
 *   → 4.790.000 ₫, lịch sử vẫn 1 khoản (update, không sinh trùng).
 * - Case 57 (kéo dài 54): section "Sử dụng điện & nước" ở /rental — spec
 *   docs/spec-rental-stats.md §4.3: 2 panel + bảng (280 kWh · 980.000 ₫ giá
 *   mới · 6 m³ · 210.000 ₫) + summary + selector mặc định "12 tháng gần".
 *
 * Data khớp sổ sách thật: 280 kWh × 4.000 + 6 m³ × 35.000 + 3.600.000 cố định.
 */

/** Nhập 6 giá trị mặc định trên form setup và lưu (tự tạo draft tháng hiện tại). */
async function submitConfig(page: import("@playwright/test").Page): Promise<void> {
  await page.getByLabel("Tiền phòng (đ)").fill("3200000");
  await page.getByLabel("Tiền mạng (đ)").fill("100000");
  await page.getByLabel("Thang máy + vệ sinh (đ)").fill("200000");
  await page.getByLabel("Gửi xe (đ)").fill("100000");
  await page.getByLabel("Giá điện (đ/kWh)").fill("4000");
  await page.getByLabel("Giá nước (đ/m³)").fill("35000");
  await page.getByRole("button", { name: /Lưu & tạo tháng/ }).click();
}

/** Nhập 4 số công tơ trên form tháng (row điện/nước phân biệt bằng testid). */
async function fillMeters(
  page: import("@playwright/test").Page,
  values: { oldElec: string; newElec: string; oldWater: string; newWater: string },
): Promise<void> {
  const elec = page.getByTestId("meter-elec");
  const water = page.getByTestId("meter-water");
  await elec.getByLabel("Số cũ").fill(values.oldElec);
  await elec.getByLabel("Số mới").fill(values.newElec);
  await water.getByLabel("Số cũ").fill(values.oldWater);
  await water.getByLabel("Số mới").fill(values.newWater);
}

test.describe("Tiền phòng trọ (E2E)", () => {
  test("chốt 4.930.000 ₫ → 1 khoản 'Nhà trọ' trong lịch sử; chốt lại giá điện 3.500 → 4.790.000 ₫ vẫn 1 khoản", async ({
    page,
  }) => {
    // Arrange — family mới, card "Tiền phòng trọ" hiện trên Home
    await registerAndCreateFamily(page, newAccount());
    const card = page.getByRole("link", { name: /Tiền phòng trọ/ });
    await expect(card).toBeVisible();

    // Act — vào /rental qua card → form setup (chưa có config)
    await card.click();
    await expect(page.getByRole("heading", { name: "Thông tin mặc định" })).toBeVisible();
    await submitConfig(page);

    // Assert — về list, draft tháng hiện tại tự tạo (tổng = 4 khoản cố định)
    const monthCard = page.locator('a[href^="/rental/"]').first();
    await expect(monthCard).toContainText("Chờ chốt");
    await expect(monthCard).toContainText("3.600.000 ₫");

    // Act — vào form tháng, nhập số công tơ (old = 0 vì chưa có tháng trước)
    await monthCard.click();
    await fillMeters(page, { oldElec: "17743", newElec: "18023", oldWater: "1001", newWater: "1007" });

    // Assert — tính live: 280 kWh + 6 m³, tổng 4.930.000 ₫
    await expect(page.getByTestId("meter-elec").getByText("280 kWh")).toBeVisible();
    await expect(page.getByTestId("meter-water").getByText("6 m³")).toBeVisible();
    await expect(page.getByText("4.930.000 ₫").first()).toBeVisible();

    // Act — chốt (modal: ngày mặc định đầu tháng)
    await page.getByRole("button", { name: "Chốt khoản chi" }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Chốt", exact: true })
      .click();

    // Assert — banner đã chốt + total
    const banner = page.getByText(/Đã chốt/).first();
    await expect(banner).toHaveText(/4\.930\.000 ₫/);

    // Assert — list /rental chip "Đã chốt"
    await page.goto("/rental");
    await expect(page.getByText("Đã chốt", { exact: true })).toBeVisible();

    // Assert — lịch sử: đúng 1 hàng khoản (link /edit — không đếm chip lọc
    // danh mục "Nhà trọ"), khoản "Nhà trọ" 4.930.000 ₫
    await page.goto("/history");
    const rows = page.locator('a[href*="/edit"]');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText("Nhà trọ");
    await expect(rows.first()).toContainText("4.930.000 ₫");

    // --- Case 54: mở tháng đã chốt, sửa giá điện 3.500, chốt lại -------------

    // Act — vào lại form tháng
    await page.goto("/rental");
    await page.locator('a[href^="/rental/"]').first().click();
    await page.getByRole("button", { name: "Chỉnh sửa & chốt lại" }).click();

    // Act — đổi đơn giá điện 4.000 → 3.500
    await page.getByLabel("Đơn giá (đ/kWh)").fill("3500");

    // Assert — tổng cập nhật: 3.600.000 + 280 × 3.500 (980.000) + 210.000
    await expect(page.getByText("4.790.000 ₫").first()).toBeVisible();

    // Act — chốt lại (modal)
    await page.getByRole("button", { name: "Chốt lại" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("4.790.000 ₫").first()).toBeVisible();
    await dialog.getByRole("button", { name: "Chốt lại" }).click();

    // Assert — banner mới 4.790.000 ₫, giá trị cũ không còn
    await expect(page.getByText(/Đã chốt/).first()).toHaveText(/4\.790\.000 ₫/);
    await expect(page.getByText("4.930.000 ₫")).toHaveCount(0);

    // Assert — lịch sử: VẪN 1 hàng khoản (update, không sinh trùng), giá trị mới
    await page.goto("/history");
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText("4.790.000 ₫");
    await expect(rows.first()).not.toContainText("4.930.000 ₫");

    // --- Case 57: section "Sử dụng điện & nước" (spec-rental-stats §4.3) -------

    // Act — về /rental (tháng 7 đã chốt; tiền điện = 980.000 sau khi đổi giá 3.500)
    await page.goto("/rental");
    await expect(page.getByRole("heading", { name: "📊 Sử dụng điện & nước" })).toBeVisible();
    await expect(page.getByText("Chỉ tính các tháng đã chốt.")).toBeVisible();
    await expect(page.getByRole("button", { name: "12 tháng gần" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    // Assert — 2 panel + 2 chart svg
    await expect(page.getByRole("heading", { name: "Điện", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Nước", exact: true })).toBeVisible();
    await expect(page.locator(".h-48 svg")).toHaveCount(2);

    // Assert — bảng chi tiết 1 hàng: 280 kWh · 980.000 ₫ (giá mới) · 6 m³ · 210.000 ₫
    // Tháng đã chốt = tháng hiện tại lúc chạy E2E (draft tự tạo khi lưu config)
    const now = new Date();
    const confirmedMonthLabel = `Tháng ${now.getMonth() + 1}/${now.getFullYear()}`;
    const table = page.getByRole("table");
    await expect(table.getByText(confirmedMonthLabel)).toBeVisible();
    await expect(table.getByText("280")).toBeVisible();
    await expect(table.getByText("980.000 ₫")).toBeVisible();
    await expect(table.getByText("210.000 ₫")).toBeVisible();

    // Assert — summary panel Điện (1 tháng → không có phần cao/thấp nhất)
    await expect(page.getByText(/TB 280 kWh/)).toHaveText("TB 280 kWh · 980.000 ₫/tháng");

    // Assert — tooltip đúng series (fix HIGH review: cost ≠ kWh): hover cột điện
    await page.locator(".recharts-bar-rectangle").first().hover();
    const tooltip = page.locator(".recharts-tooltip-wrapper");
    await expect(tooltip.getByText("980.000 ₫")).toBeVisible();
    await expect(tooltip.getByText("280 kWh")).toBeVisible();
  });
});
