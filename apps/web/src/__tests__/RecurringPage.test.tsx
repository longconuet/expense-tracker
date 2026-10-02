import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RecurringRule } from "@expense-tracker/shared";

vi.mock("../core/dataApi", () => ({
  fetchRecurring: vi.fn(),
  materializeRecurring: vi.fn(),
}));

import { fetchRecurring, materializeRecurring } from "../core/dataApi";
import { useAuthStore } from "../core/authStore";
import RecurringPage from "../features/recurring/RecurringPage";

const fetchRecurringMock = vi.mocked(fetchRecurring);
const materializeMock = vi.mocked(materializeRecurring);

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

const CATEGORY_ELEC = { id: "c1", name: "Tiền điện", icon: "⚡", isPreset: true, order: 1 };
const CATEGORY_NET = { id: "c2", name: "Internet", icon: "🌐", isPreset: false, order: 2 };

function makeRule(over: Partial<RecurringRule> = {}): RecurringRule {
  return {
    id: "r1",
    familyId: "f1",
    categoryId: "c1",
    category: CATEGORY_ELEC,
    amount: 1_500_000,
    note: null,
    frequency: "MONTHLY",
    startDate: "2026-09-05",
    endType: "FOREVER",
    endDate: null,
    occurrenceCount: null,
    nextDate: "2026-10-05",
    generatedCount: 0,
    completedAt: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    ...over,
  };
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/recurring"]}>
      <Routes>
        <Route path="/recurring" element={<RecurringPage />} />
        <Route path="/recurring/new" element={<div>NEW MARKER</div>} />
        <Route path="/recurring/:id" element={<div>EDIT MARKER</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Màn giao dịch định kỳ (spec-recurring §5.3: case 52–53)", () => {
  beforeEach(() => {
    useAuthStore.setState({ user: USER, families: [FAMILY_OWNER], activeFamilyId: FAMILY_OWNER.id });
    fetchRecurringMock.mockReset();
    materializeMock.mockReset();
    materializeMock.mockResolvedValue({ count: 0, created: [] });
    // jsdom mặc định navigator.onLine = true
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
  });

  afterEach(() => {
    cleanup();
  });

  it("#52 list: 1 active COUNT (đã sinh 1/3) + 1 completed → 2 card đúng nhãn", async () => {
    // Arrange
    const active = makeRule({
      endType: "COUNT",
      occurrenceCount: 3,
      generatedCount: 1,
      nextDate: "2026-10-05",
    });
    const completed = makeRule({
      id: "r2",
      categoryId: "c2",
      category: CATEGORY_NET,
      amount: 200_000,
      startDate: "2026-08-01",
      endType: "UNTIL_DATE",
      endDate: "2026-09-30",
      nextDate: null,
      generatedCount: 2,
      completedAt: "2026-09-30T00:00:00.000Z",
    });
    fetchRecurringMock.mockResolvedValue({ rules: [active, completed] });

    // Act
    renderPage();
    const cards = await screen.findAllByRole("listitem");

    // Assert — card 1: active COUNT hiện tiến độ + kỳ tới; card 2: đã hoàn thành
    expect(cards).toHaveLength(2);
    expect(cards[0]).toHaveTextContent("1/3 lần");
    // shortDate: "05/10" cùng năm hiện tại, "05/10/2026" nếu test chạy khác năm
    expect(cards[0]).toHaveTextContent(/Kỳ tới: 05\/10(\/2026)?/);
    expect(cards[1]).toHaveTextContent("Đã hoàn thành");
    expect(cards[1]).toHaveTextContent("200.000 ₫");
  });

  it("#52 (OWNER) chạm card rule → navigate /recurring/:id", async () => {
    // Arrange
    fetchRecurringMock.mockResolvedValue({ rules: [makeRule({ id: "r7" })] });

    // Act
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Sửa giao dịch định kỳ Tiền điện" }));

    // Assert
    expect(screen.getByText("EDIT MARKER")).toBeInTheDocument();
  });

  it("#53 rỗng (OWNER): icon + text + nút 'Tạo giao dịch định kỳ' (1 nút duy nhất) → /recurring/new", async () => {
    // Arrange
    fetchRecurringMock.mockResolvedValue({ rules: [] });

    // Act
    renderPage();

    // Assert
    expect(await screen.findByText("Chưa có giao dịch định kỳ")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Tạo giao dịch định kỳ" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Tạo giao dịch định kỳ" }));
    expect(screen.getByText("NEW MARKER")).toBeInTheDocument();
  });

  it("#53 list KHÔNG rỗng (OWNER): nút 'Tạo giao dịch định kỳ' vẫn thấy (regression) → /recurring/new", async () => {
    // Arrange — list đã có rule (bug cũ: nút chỉ nằm trong empty state)
    fetchRecurringMock.mockResolvedValue({ rules: [makeRule()] });

    // Act
    renderPage();
    await screen.findByText("Tiền điện");
    fireEvent.click(screen.getByRole("button", { name: "Tạo giao dịch định kỳ" }));

    // Assert
    expect(screen.getByText("NEW MARKER")).toBeInTheDocument();
  });

  it("#53 rỗng (MEMBER): không có CTA tạo", async () => {
    // Arrange
    useAuthStore.setState({ user: USER, families: [FAMILY_MEMBER], activeFamilyId: FAMILY_MEMBER.id });
    fetchRecurringMock.mockResolvedValue({ rules: [] });

    // Act
    renderPage();

    // Assert
    expect(await screen.findByText("Chưa có giao dịch định kỳ")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Tạo giao dịch định kỳ" })).not.toBeInTheDocument();
  });

  it("#53 list (MEMBER): card không chạm — không có nút bên trong card", async () => {
    // Arrange
    useAuthStore.setState({ user: USER, families: [FAMILY_MEMBER], activeFamilyId: FAMILY_MEMBER.id });
    fetchRecurringMock.mockResolvedValue({ rules: [makeRule()] });

    // Act
    renderPage();
    const cards = await screen.findAllByRole("listitem");

    // Assert
    expect(cards[0]).toHaveTextContent("Tiền điện");
    expect(within(cards[0]).queryAllByRole("button")).toHaveLength(0);
  });

  it("materialize trước khi fetch (online) — silent, lỗi mạng không chặn list", async () => {
    // Arrange
    fetchRecurringMock.mockResolvedValue({ rules: [makeRule()] });
    materializeMock.mockRejectedValueOnce(new Error("offline"));

    // Act
    renderPage();
    await screen.findByText("Tiền điện");

    // Assert — materialize gọi trước fetch, lỗi bị nuốt (list vẫn hiện)
    expect(materializeMock).toHaveBeenCalledWith("f1");
    expect(fetchRecurringMock).toHaveBeenCalledWith("f1");
    expect(materializeMock.mock.invocationCallOrder[0]).toBeLessThan(
      fetchRecurringMock.mock.invocationCallOrder[0],
    );
  });

  it("offline → KHÔNG gọi materialize, vẫn fetch (read cache fallback)", async () => {
    // Arrange
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    fetchRecurringMock.mockResolvedValue({ rules: [] });

    // Act
    renderPage();

    // Assert
    expect(await screen.findByText("Chưa có giao dịch định kỳ")).toBeInTheDocument();
    expect(materializeMock).not.toHaveBeenCalled();
    expect(fetchRecurringMock).toHaveBeenCalledTimes(1);
  });
});
