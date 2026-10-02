import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Category, RecurringRule } from "@expense-tracker/shared";

vi.mock("../core/dataApi", () => ({
  fetchRecurring: vi.fn(),
  fetchCategories: vi.fn(),
  createRecurringRule: vi.fn(),
  updateRecurringRule: vi.fn(),
  deleteRecurringRule: vi.fn(),
}));

import {
  createRecurringRule,
  deleteRecurringRule,
  fetchCategories,
  fetchRecurring,
  updateRecurringRule,
} from "../core/dataApi";
import { useAuthStore } from "../core/authStore";
import { today } from "../core/dates";
import RecurringRulePage from "../features/recurring/RecurringRulePage";

const fetchRecurringMock = vi.mocked(fetchRecurring);
const fetchCategoriesMock = vi.mocked(fetchCategories);
const createRuleMock = vi.mocked(createRecurringRule);
const updateRuleMock = vi.mocked(updateRecurringRule);
const deleteRuleMock = vi.mocked(deleteRecurringRule);

const USER = { id: "u1", name: "An", username: "an2310" };
const FAMILY_OWNER = {
  id: "f1",
  name: "Nhà An",
  inviteCode: "ABC123",
  ownerName: "An",
  memberCount: 2,
  myRole: "OWNER",
} as const;
const FAMILY_MEMBER = { ...FAMILY_OWNER, myRole: "MEMBER" } as const;

const CATS: Category[] = [
  { id: "c1", name: "Tiền điện", icon: "⚡", isPreset: true, order: 1 },
  { id: "c2", name: "Ăn uống", icon: "🍜", isPreset: true, order: 2 },
];

// endDate 2099 — luôn >= kỳ đầu tiên bất kể ngày chạy test (validate không báo lỗi sẵn)
const RULE: RecurringRule = {
  id: "r1",
  familyId: "f1",
  categoryId: "c1",
  category: CATS[0],
  amount: 200_000,
  note: "Tiền điện",
  frequency: "MONTHLY",
  startDate: "2026-01-15",
  endType: "UNTIL_DATE",
  endDate: "2099-12-31",
  occurrenceCount: null,
  nextDate: "2099-01-15",
  generatedCount: 9,
  completedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
};

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/recurring" element={<div>LIST MARKER</div>} />
        <Route path="/recurring/new" element={<RecurringRulePage />} />
        <Route path="/recurring/:id" element={<RecurringRulePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

/** Gõ số tiền qua keypad (như user trên mobile). */
function typeAmount(digits: string) {
  for (const d of digits) {
    fireEvent.click(screen.getByRole("button", { name: d }));
  }
}

describe("Form giao dịch định kỳ (spec-recurring §5.3: case 54–59)", () => {
  beforeEach(() => {
    useAuthStore.setState({ user: USER, families: [FAMILY_OWNER], activeFamilyId: "f1" });
    fetchCategoriesMock.mockReset().mockResolvedValue(CATS);
    fetchRecurringMock.mockReset().mockResolvedValue({ rules: [RULE] });
    createRuleMock.mockReset().mockResolvedValue(RULE);
    updateRuleMock.mockReset().mockResolvedValue(RULE);
    deleteRuleMock.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
  });

  it("#54 (new) mặc định 'Mãi mãi' — không có dòng phụ ngày/số lần", async () => {
    // Arrange + Act
    renderAt("/recurring/new");
    const forever = await screen.findByRole("radio", { name: "Mãi mãi" });

    // Assert
    expect(forever).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByLabelText("Đến")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Lần")).not.toBeInTheDocument();
    // Hàng tần suất tĩnh — hiển thị, không phải nút
    expect(screen.getByText("Tần suất")).toBeInTheDocument();
    expect(screen.getByText("Lặp hàng tháng")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Lặp hàng tháng" })).not.toBeInTheDocument();
  });

  it("#54 (new) chọn từng loại kết thúc — dòng phụ hiện/ẩn đúng", async () => {
    // Arrange
    renderAt("/recurring/new");
    await screen.findByRole("radio", { name: "Mãi mãi" });

    // Act — 'Cho đến ngày' → hiện dòng phụ date
    fireEvent.click(screen.getByRole("radio", { name: "Cho đến ngày" }));
    expect(screen.getByLabelText("Đến")).toBeInTheDocument();
    expect(screen.queryByLabelText("Lần")).not.toBeInTheDocument();

    // Act — 'Số lần' → hiện dòng phụ số (default 1), date ẩn
    fireEvent.click(screen.getByRole("radio", { name: /Xảy ra một số lượng lần/ }));
    // input type=number — jest-dom so bằng number
    expect(screen.getByLabelText("Lần")).toHaveValue(1);
    expect(screen.queryByLabelText("Đến")).not.toBeInTheDocument();

    // Act — về 'Mãi mãi' → không còn dòng phụ nào
    fireEvent.click(screen.getByRole("radio", { name: "Mãi mãi" }));
    expect(screen.queryByLabelText("Đến")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Lần")).not.toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Mãi mãi" })).toHaveAttribute("aria-checked", "true");
  });

  it("#55 validate: số tiền 0 → Lưu disabled; 'Cho đến ngày' thiếu ngày / trước kỳ đầu tiên → lỗi + disabled", async () => {
    // Arrange
    renderAt("/recurring/new");
    const save = await screen.findByRole("button", { name: "Lưu" });
    expect(save).toBeDisabled();

    // Số tiền + danh mục đủ → 'Mãi mãi' sẵn sàng Lưu
    typeAmount("50");
    fireEvent.click(await screen.findByRole("button", { name: "Tiền điện" }));
    expect(save).toBeEnabled();

    // Act — 'Cho đến ngày' chưa nhập ngày → lỗi + disabled
    fireEvent.click(screen.getByRole("radio", { name: "Cho đến ngày" }));
    expect(save).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("Nhập ngày kết thúc.");

    // Act — 'Từ' ở tương lai (kỳ đầu tiên = chính 'Từ') + ngày kết thúc trước đó → lỗi kèm ngày
    fireEvent.change(screen.getByLabelText("Từ"), { target: { value: "2099-05-15" } });
    fireEvent.change(screen.getByLabelText("Đến"), { target: { value: "2099-05-10" } });
    expect(save).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("15/05/2099");

    // Act — ngày kết thúc >= kỳ đầu tiên → hết lỗi, Lưu bật
    fireEvent.change(screen.getByLabelText("Đến"), { target: { value: "2099-05-15" } });
    expect(save).toBeEnabled();
  });

  it("#55 validate: 'Số lần' 0 / 10.001 → lỗi + disabled; 3 → hợp lệ", async () => {
    // Arrange — đủ số tiền + danh mục
    renderAt("/recurring/new");
    await screen.findByRole("button", { name: "5" }); // chờ form render
    typeAmount("50");
    fireEvent.click(await screen.findByRole("button", { name: "Tiền điện" }));
    const save = screen.getByRole("button", { name: "Lưu" });

    // Act — chọn 'Số lần' (default 1 hợp lệ), rồi thử giá trị ngoài dải
    fireEvent.click(screen.getByRole("radio", { name: /Xảy ra một số lượng lần/ }));
    const countInput = screen.getByLabelText("Lần");
    expect(save).toBeEnabled();

    fireEvent.change(countInput, { target: { value: "0" } });
    expect(save).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("Số lần phải từ 1 đến 10.000.");

    fireEvent.change(countInput, { target: { value: "10001" } });
    expect(save).toBeDisabled();

    // Act — trong dải → hợp lệ
    fireEvent.change(countInput, { target: { value: "3" } });
    expect(save).toBeEnabled();
  });

  it("#56 lưu mới: payload map đúng lựa chọn (COUNT có occurrenceCount, không endDate) + navigate /recurring", async () => {
    // Arrange
    renderAt("/recurring/new");
    await screen.findByRole("button", { name: "1" }); // chờ form render
    typeAmount("1500000");
    fireEvent.click(screen.getByRole("button", { name: "Tiền điện" }));
    fireEvent.change(screen.getByLabelText("Ghi chú (tùy chọn)"), { target: { value: "Tiền điện" } });
    fireEvent.click(screen.getByRole("radio", { name: /Xảy ra một số lượng lần/ }));
    fireEvent.change(screen.getByLabelText("Lần"), { target: { value: "3" } });

    // Act
    fireEvent.click(screen.getByRole("button", { name: "Lưu" }));

    // Assert — payload đúng lựa chọn + về list
    await waitFor(() => expect(createRuleMock).toHaveBeenCalledTimes(1));
    const [familyId, input] = createRuleMock.mock.calls[0];
    expect(familyId).toBe("f1");
    expect(input).toEqual({
      categoryId: "c1",
      amount: 1_500_000,
      note: "Tiền điện",
      startDate: today(),
      endType: "COUNT",
      occurrenceCount: 3,
    });
    // Navigation async (microtask + re-render) — chờ bằng findBy
    expect(await screen.findByText("LIST MARKER")).toBeInTheDocument();
  });

  it("#57 (edit) prefill từ rule + đổi amount + đổi endType → updateRecurringRule payload đủ field", async () => {
    // Arrange
    renderAt("/recurring/r1");
    const back = await screen.findByRole("button", { name: "Xoá 1 chữ số" });

    // Prefill: số tiền 200.000 + 'Đến' 2099-12-31 + note
    expect(await screen.findByText("200.000")).toBeInTheDocument();
    expect(screen.getByDisplayValue("2099-12-31")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Tiền điện")).toBeInTheDocument();
    // Radio đang checked có name kèm text dòng phụ ("Cho đến ngàyĐến…") — match prefix
    expect(screen.getByRole("radio", { name: /Cho đến ngày/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("button", { name: "Lưu" })).toBeEnabled();

    // Act — đổi amount: xoá 6 số (200000) rồi gõ 7,0,0 = 700
    for (let i = 0; i < 6; i += 1) fireEvent.click(back);
    typeAmount("700");

    // Act — đổi endType → COUNT 5 (endDate không còn trong payload)
    fireEvent.click(screen.getByRole("radio", { name: /Xảy ra một số lượng lần/ }));
    fireEvent.change(screen.getByLabelText("Lần"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "Lưu" }));

    // Assert
    await waitFor(() => expect(updateRuleMock).toHaveBeenCalledTimes(1));
    const [familyId, ruleId, input] = updateRuleMock.mock.calls[0];
    expect(familyId).toBe("f1");
    expect(ruleId).toBe("r1");
    expect(input).toEqual({
      categoryId: "c1",
      amount: 700,
      note: "Tiền điện",
      startDate: "2026-01-15",
      endType: "COUNT",
      occurrenceCount: 5,
    });
    // Navigation async (microtask + re-render) — chờ bằng findBy
    expect(await screen.findByText("LIST MARKER")).toBeInTheDocument();
  });

  it("#58 (edit) 'Xoá rule' → ConfirmDialog đúng message (khoản đã sinh giữ lại) → deleteRecurringRule + về list", async () => {
    // Arrange
    renderAt("/recurring/r1");
    await screen.findByRole("button", { name: "Xoá rule" });

    // Act — mở dialog, kiểm tra message
    fireEvent.click(screen.getByRole("button", { name: "Xoá rule" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Xoá rule này?")).toBeInTheDocument();
    expect(
      within(dialog).getByText("Các khoản chi đã sinh sẽ giữ lại như khoản chi thường."),
    ).toBeInTheDocument();

    // Act — Huỷ → không gọi API
    fireEvent.click(within(dialog).getByRole("button", { name: "Huỷ" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(deleteRuleMock).not.toHaveBeenCalled();

    // Act — mở lại, xác nhận xoá
    fireEvent.click(screen.getByRole("button", { name: "Xoá rule" }));
    const reopened = await screen.findByRole("dialog");
    fireEvent.click(within(reopened).getByRole("button", { name: "Xoá" }));

    // Assert
    await waitFor(() => expect(deleteRuleMock).toHaveBeenCalledWith("f1", "r1"));
    // Navigation async (microtask + re-render) — chờ bằng findBy
    expect(await screen.findByText("LIST MARKER")).toBeInTheDocument();
  });

  it("#59 (MEMBER) → màn 'Chỉ chủ gia đình…' — không render form", async () => {
    // Arrange
    useAuthStore.setState({ user: USER, families: [FAMILY_MEMBER], activeFamilyId: "f1" });

    // Act
    renderAt("/recurring/new");

    // Assert — không có form, có nút quay lại
    expect(await screen.findByText("Chỉ chủ gia đình có thể setup giao dịch định kỳ")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Lưu" })).not.toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "Mãi mãi" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Quay lại" }));
    expect(screen.getByText("LIST MARKER")).toBeInTheDocument();
  });

  it("(edit) rule không có trong list → màn 'Không tìm thấy' + quay lại", async () => {
    // Arrange
    fetchRecurringMock.mockResolvedValue({ rules: [] });

    // Act
    renderAt("/recurring/ghost");

    // Assert
    expect(await screen.findByText("Không tìm thấy giao dịch định kỳ")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Quay lại" }));
    expect(screen.getByText("LIST MARKER")).toBeInTheDocument();
  });
});
