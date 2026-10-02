import { expect, test } from "@playwright/test";
import { newAccount, pickCategory, registerAndCreateFamily, typeKeypad } from "./helpers";

/**
 * Case 63 (spec-recurring.md §5.4) — happy path toàn trình:
 * Đăng ký family mới → Tôi → Giao dịch định kỳ → Tạo (1.500.000 qua Keypad,
 * danh mục, ghi chú "Tiền điện", Từ = hôm nay, kết thúc "số lượng lần: 3")
 * → Lưu → list hiện rule → Lịch sử: khoản 1.500.000 ₫ có mặt (materialize
 * chạy khi mở app/màn list) với icon định kỳ → rule hiển thị "1/3 lần".
 *
 * Materialize do RecurringPage tự gọi khi mount (online) TRƯỚC khi fetch list
 * (AppShell cũng trigger khi mở app/đổi family) — idempotent, nên về list
 * sau Lưu là thấy khoản đã sinh + "1/3 lần".
 *
 * Lưu ý ngày: API dùng todayStr() UTC (convention toàn app — spec §7);
 * chạy test trong cửa sổ 00:00–07:00 giờ UTC+7 (UTC còn ngày hôm qua) thì
 * kỳ đầu (hôm nay local) chưa "đến hạn" theo UTC — chấp nhận, như mọi
 * tính năng khác của app.
 */

/**
 * Label "DD/MM" (kèm "/YYYY" nếu kỳ rơi sang năm khác) của kỳ kế tiếp
 * sau hôm nay, neo theo ngày hôm nay (anchor-day, clamp cuối tháng) —
 * cùng quy tắc `nextOccurrence` trong shared.
 */
function nextOccurrenceLabel(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth(); // 0-based
  const nextY = m === 11 ? y + 1 : y;
  const nextM = (m + 1) % 12; // 0-based
  const lastDayNext = new Date(Date.UTC(nextY, nextM + 1, 0)).getUTCDate();
  const day = Math.min(now.getDate(), lastDayNext);
  const base = `${String(day).padStart(2, "0")}/${String(nextM + 1).padStart(2, "0")}`;
  return nextY !== y ? `${base}/${nextY}` : base;
}

test.describe("Giao dịch định kỳ (E2E)", () => {
  test("case 63: tạo rule hàng tháng (3 lần) → tự sinh khoản hôm nay + list '1/3 lần' + icon định kỳ ở Lịch sử", async ({
    page,
  }) => {
    // Arrange — family mới (không có rule nào)
    await registerAndCreateFamily(page, newAccount());

    // Act — Tôi → Giao dịch định kỳ → Tạo (chỉ OWNER thấy CTA)
    await page.goto("/me");
    await page.getByRole("button", { name: "Giao dịch định kỳ" }).click();
    await page.getByRole("button", { name: "Tạo giao dịch định kỳ" }).click();

    // Act — form: số tiền 1.500.000 (Keypad), danh mục "Gia đình" (⚡),
    // ghi chú "Tiền điện"; Từ = hôm nay (mặc định); Kết thúc = 3 lần
    await page.getByRole("form", { name: "Tạo giao dịch định kỳ" }).waitFor();
    await typeKeypad(page, "1500000");
    await pickCategory(page, "Gia đình");
    await page.getByLabel("Ghi chú (tùy chọn)").fill("Tiền điện");
    await page.getByRole("radio", { name: /Xảy ra một số lượng lần nhất định/ }).click();
    await page.getByLabel("Lần").fill("3");

    // Act — Lưu → về list (màn list materialize trước khi fetch)
    await page.getByRole("button", { name: "Lưu", exact: true }).click();
    await expect(page).toHaveURL(/\/recurring$/);

    // Assert — list: 1 card rule, khoản đã sinh kỳ đầu (hôm nay) → "1/3 lần"
    // + kỳ kế tiếp = cùng ngày tháng sau (anchor-day)
    const card = page.getByRole("listitem");
    await expect(card).toContainText("1.500.000 ₫");
    await expect(card).toContainText("1/3 lần");
    await expect(card).toContainText(`Kỳ tới: ${nextOccurrenceLabel()}`);

    // Assert — Lịch sử: khoản 1.500.000 ₫ (ghi chú "Tiền điện") nhóm "Hôm nay"
    // + icon định kỳ (sr-only "định kỳ" cạnh tên danh mục)
    await page.goto("/history");
    const today = page.locator('section[aria-label="Hôm nay"]');
    await expect(today).toContainText("1.500.000 ₫");
    await expect(today).toContainText("Tiền điện");
    await expect(today.getByText("định kỳ", { exact: true })).toBeVisible();
  });
});
