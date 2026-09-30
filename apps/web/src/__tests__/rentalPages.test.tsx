import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type RentalConfig, type RentalMonth } from "@expense-tracker/shared";
import { ApiError } from "../core/api";
import {
  confirmRentalMonth,
  createRentalMonth,
  deleteRentalMonth,
  fetchRental,
  saveRentalConfig,
  updateRentalMonth,
} from "../core/dataApi";
import { useAuthStore } from "../core/authStore";
import { addMonths, currentMonth, monthLabel } from "../core/dates";
import RentalPage from "../features/rental/RentalPage";
import RentalMonthPage from "../features/rental/RentalMonthPage";
import { RentalCard } from "../features/rental/RentalCard";

vi.mock("../core/dataApi", () => ({
  fetchRental: vi.fn(),
  saveRentalConfig: vi.fn(),
  createRentalMonth: vi.fn(),
  updateRentalMonth: vi.fn(),
  confirmRentalMonth: vi.fn(),
  deleteRentalMonth: vi.fn(),
}));

const fetchRentalMock = vi.mocked(fetchRental);
const saveRentalConfigMock = vi.mocked(saveRentalConfig);
const createRentalMonthMock = vi.mocked(createRentalMonth);
const updateRentalMonthMock = vi.mocked(updateRentalMonth);
const confirmRentalMonthMock = vi.mocked(confirmRentalMonth);
const deleteRentalMonthMock = vi.mocked(deleteRentalMonth);

const USER = { id: "u1", name: "An", username: "an2310" };
const FAMILY = {
  id: "f1",
  name: "Nhà An",
  inviteCode: "ABC123",
  ownerName: "An",
  memberCount: 2,
  myRole: "OWNER",
} as const;

const CONFIG: RentalConfig = {
  rent: 3_200_000,
  internet: 100_000,
  elevator: 200_000,
  parking: 100_000,
  electricityRate: 4_000,
  waterRate: 35_000,
  updatedAt: "2026-09-01T00:00:00.000Z",
};

/** Tháng 7/2026 — data thật (280 kWh × 4.000 + 6 m³ × 35.000 → tổng 4.930.000). */
function makeMonth(overrides: Partial<RentalMonth> = {}): RentalMonth {
  return {
    id: "m1",
    month: "2026-07",
    rent: 3_200_000,
    internet: 100_000,
    elevator: 200_000,
    parking: 100_000,
    oldElec: 17_743,
    newElec: 18_023,
    electricityRate: 4_000,
    oldWater: 1_001,
    newWater: 1_007,
    waterRate: 35_000,
    status: "DRAFT",
    expenseId: null,
    confirmedAt: null,
    elecConsumption: 280,
    waterConsumption: 6,
    electricityCost: 1_120_000,
    waterCost: 210_000,
    total: 4_930_000,
    ...overrides,
  };
}

/** Tháng DRAFT vừa tạo (prefill: new = old = 0, tổng = 4 khoản cố định). */
function makeFreshMonth(month: string): RentalMonth {
  return makeMonth({
    month,
    oldElec: 0,
    newElec: 0,
    oldWater: 0,
    newWater: 0,
    elecConsumption: 0,
    waterConsumption: 0,
    electricityCost: 0,
    waterCost: 0,
    total: 3_600_000,
  });
}

/**
 * DRAFT tháng 7/2026 sau khi API prefill từ tháng trước (carry-over):
 * old = 17.743 / 1.001, new = old (tiêu thụ 0 — user chỉ việc nhập số mới).
 */
function makeCarryOverDraft(): RentalMonth {
  return makeMonth({
    oldElec: 17_743,
    newElec: 17_743,
    oldWater: 1_001,
    newWater: 1_001,
    elecConsumption: 0,
    waterConsumption: 0,
    electricityCost: 0,
    waterCost: 0,
    total: 3_600_000,
  });
}

function renderRentalRoutes() {
  return render(
    <MemoryRouter initialEntries={["/rental"]}>
      <Routes>
        <Route path="/rental" element={<RentalPage />} />
        <Route path="/rental/:month" element={<RentalMonthPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function renderMonthPage(month = "2026-07") {
  return render(
    <MemoryRouter initialEntries={[`/rental/${month}`]}>
      <Routes>
        <Route path="/rental" element={<div>LIST_MARKER</div>} />
        <Route path="/rental/:month" element={<RentalMonthPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("RentalPage (/rental)", () => {
  beforeEach(() => {
    useAuthStore.setState({ user: USER, families: [FAMILY], activeFamilyId: FAMILY.id });
    fetchRentalMock.mockReset();
    saveRentalConfigMock.mockReset();
    createRentalMonthMock.mockReset();
    updateRentalMonthMock.mockReset();
    confirmRentalMonthMock.mockReset();
    deleteRentalMonthMock.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("chưa có config (OWNER) → form setup 6 trường; Lưu → saveRentalConfig + tạo draft tháng hiện tại", async () => {
    // Arrange
    fetchRentalMock
      .mockResolvedValueOnce({ config: null, months: [] })
      .mockResolvedValue({ config: CONFIG, months: [] });
    saveRentalConfigMock.mockResolvedValue(CONFIG);
    createRentalMonthMock.mockResolvedValue(makeFreshMonth(currentMonth()));
    renderRentalRoutes();

    // Assert — form setup hiện đủ 6 trường
    expect(await screen.findByText("Thông tin mặc định")).toBeInTheDocument();
    for (const label of [
      "Tiền phòng (đ)",
      "Tiền mạng (đ)",
      "Thang máy + vệ sinh (đ)",
      "Gửi xe (đ)",
      "Giá điện (đ/kWh)",
      "Giá nước (đ/m³)",
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }

    // Act — nhập 6 giá trị + lưu
    fireEvent.change(screen.getByLabelText("Tiền phòng (đ)"), { target: { value: "3200000" } });
    fireEvent.change(screen.getByLabelText("Tiền mạng (đ)"), { target: { value: "100000" } });
    fireEvent.change(screen.getByLabelText("Thang máy + vệ sinh (đ)"), {
      target: { value: "200000" },
    });
    fireEvent.change(screen.getByLabelText("Gửi xe (đ)"), { target: { value: "100000" } });
    fireEvent.change(screen.getByLabelText("Giá điện (đ/kWh)"), { target: { value: "4000" } });
    fireEvent.change(screen.getByLabelText("Giá nước (đ/m³)"), { target: { value: "35000" } });
    fireEvent.click(screen.getByRole("button", { name: /Lưu & tạo tháng/ }));

    // Assert
    await waitFor(() =>
      expect(saveRentalConfigMock).toHaveBeenCalledWith("f1", {
        rent: 3_200_000,
        internet: 100_000,
        elevator: 200_000,
        parking: 100_000,
        electricityRate: 4_000,
        waterRate: 35_000,
      }),
    );
    expect(createRentalMonthMock).toHaveBeenCalledWith("f1", currentMonth());
    // Về list sau khi lưu
    expect(await screen.findByRole("button", { name: /Thêm tháng/ })).toBeInTheDocument();
  });

  it("chưa có config (MEMBER) → chỉ xem, không có form setup", async () => {
    useAuthStore.setState({
      user: USER,
      families: [{ ...FAMILY, myRole: "MEMBER" }],
      activeFamilyId: FAMILY.id,
    });
    fetchRentalMock.mockResolvedValue({ config: null, months: [] });
    renderRentalRoutes();

    expect(await screen.findByText(/Chỉ chủ gia đình mới nhập được/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Lưu & tạo tháng/ })).toBeNull();
  });

  it("có config → list nhóm theo năm desc, chip status + tổng mỗi tháng", async () => {
    fetchRentalMock.mockResolvedValue({
      config: CONFIG,
      months: [
        makeMonth({
          status: "CONFIRMED",
          expenseId: "e1",
          confirmedAt: "2026-07-01T00:00:00.000Z",
        }),
        makeMonth({ id: "m2", month: "2025-12", total: 3_800_000 }),
      ],
    });
    renderRentalRoutes();

    expect(await screen.findByText(monthLabel("2026-07"))).toBeInTheDocument();
    expect(screen.getByText(monthLabel("2025-12"))).toBeInTheDocument();
    expect(screen.getByText("Đã chốt")).toBeInTheDocument();
    expect(screen.getByText("Chờ chốt")).toBeInTheDocument();
    expect(screen.getByText("4.930.000 ₫")).toBeInTheDocument();
    // Năm 2026 đứng trước 2025
    const y2026 = screen.getByRole("heading", { name: "2026" });
    const y2025 = screen.getByRole("heading", { name: "2025" });
    expect(y2026.compareDocumentPosition(y2025) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("tháng hiện tại chưa có (OWNER) → ghost card; chạm → createRentalMonth + navigate vào form", async () => {
    const now = currentMonth();
    const prev = addMonths(now, -1);
    // Lần fetch đầu: tháng hiện tại chưa có; sau khi tạo → tháng hiện tại xuất hiện
    fetchRentalMock
      .mockResolvedValueOnce({ config: CONFIG, months: [makeFreshMonth(prev)] })
      .mockResolvedValue({
        config: CONFIG,
        months: [makeFreshMonth(now), makeFreshMonth(prev)],
      });
    createRentalMonthMock.mockResolvedValue(makeFreshMonth(now));
    renderRentalRoutes();

    const ghost = await screen.findByRole("button", { name: /Chưa có Tháng/ });
    expect(ghost).toHaveTextContent("Chạm để tạo");

    fireEvent.click(ghost);
    await waitFor(() => expect(createRentalMonthMock).toHaveBeenCalledWith("f1", now));
    // Đã navigate vào form tháng mới
    expect(await screen.findByRole("heading", { name: monthLabel(now) })).toBeInTheDocument();
  });

  it("MEMBER → xem được list, không có nút Thêm tháng / ghost card", async () => {
    useAuthStore.setState({
      user: USER,
      families: [{ ...FAMILY, myRole: "MEMBER" }],
      activeFamilyId: FAMILY.id,
    });
    const prev2 = addMonths(currentMonth(), -2);
    fetchRentalMock.mockResolvedValue({
      config: CONFIG,
      months: [makeFreshMonth(prev2)],
    });
    renderRentalRoutes();

    expect(await screen.findByText(monthLabel(prev2))).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Thêm tháng/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Chưa có Tháng/ })).toBeNull();
  });
});

describe("RentalMonthPage (/rental/:month)", () => {
  beforeEach(() => {
    useAuthStore.setState({ user: USER, families: [FAMILY], activeFamilyId: FAMILY.id });
    fetchRentalMock.mockReset();
    saveRentalConfigMock.mockReset();
    createRentalMonthMock.mockReset();
    updateRentalMonthMock.mockReset();
    confirmRentalMonthMock.mockReset();
    deleteRentalMonthMock.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("DRAFT (OWNER): nhập số công tơ mới → tiêu thụ kWh/m³ + tiền điện/nước + TỔNG tính live", async () => {
    fetchRentalMock.mockResolvedValue({ config: CONFIG, months: [makeCarryOverDraft()] });
    renderMonthPage("2026-07");
    await screen.findByRole("heading", { name: monthLabel("2026-07") });

    const elec = within(screen.getByTestId("meter-elec"));
    const water = within(screen.getByTestId("meter-water"));
    fireEvent.change(elec.getByLabelText("Số mới"), { target: { value: "18023" } });
    fireEvent.change(water.getByLabelText("Số mới"), { target: { value: "1007" } });

    expect(screen.getByText("280 kWh")).toBeInTheDocument();
    expect(screen.getByText("6 m³")).toBeInTheDocument();
    expect(screen.getByText("1.120.000 ₫")).toBeInTheDocument();
    expect(screen.getByText("210.000 ₫")).toBeInTheDocument();
    expect(screen.getByText("4.930.000 ₫")).toBeInTheDocument();
  });

  it("DRAFT: số mới < số cũ → lỗi + nút Chốt disabled", async () => {
    fetchRentalMock.mockResolvedValue({ config: CONFIG, months: [makeCarryOverDraft()] });
    renderMonthPage("2026-07");
    await screen.findByRole("heading", { name: monthLabel("2026-07") });

    const elec = within(screen.getByTestId("meter-elec"));
    fireEvent.change(elec.getByLabelText("Số mới"), { target: { value: "17000" } });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Số công tơ điện mới phải ≥ số cũ",
    );
    expect(screen.getByRole("button", { name: "Chốt khoản chi" })).toBeDisabled();
  });

  it("DRAFT: bấm Chốt → modal (date mặc định 01 tháng, min/max trong tháng, preview note) → confirmRentalMonth đủ field", async () => {
    fetchRentalMock.mockResolvedValue({ config: CONFIG, months: [makeCarryOverDraft()] });
    confirmRentalMonthMock.mockResolvedValue({
      month: makeMonth({ status: "CONFIRMED", expenseId: "e1" }),
      expenseId: "e1",
    });
    renderMonthPage("2026-07");
    await screen.findByRole("heading", { name: monthLabel("2026-07") });

    const elec = within(screen.getByTestId("meter-elec"));
    const water = within(screen.getByTestId("meter-water"));
    fireEvent.change(elec.getByLabelText("Số mới"), { target: { value: "18023" } });
    fireEvent.change(water.getByLabelText("Số mới"), { target: { value: "1007" } });
    fireEvent.click(screen.getByRole("button", { name: "Chốt khoản chi" }));

    const dialog = await screen.findByRole("dialog");
    // Label chứa cả hint → match prefix
    const dateInput = within(dialog).getByLabelText(/Ngày khoản chi/);
    expect(dateInput).toHaveValue("2026-07-01");
    expect(dateInput).toHaveAttribute("min", "2026-07-01");
    expect(dateInput).toHaveAttribute("max", "2026-07-31");
    expect(within(dialog).getByText(/Ghi chú: Phòng trọ 07\/2026: phòng 3.200.000/)).toBeInTheDocument();
    expect(within(dialog).getByText("4.930.000 ₫")).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "Chốt" }));
    await waitFor(() =>
      expect(confirmRentalMonthMock).toHaveBeenCalledWith("f1", "2026-07", {
        rent: 3_200_000,
        internet: 100_000,
        elevator: 200_000,
        parking: 100_000,
        oldElec: 17_743,
        newElec: 18_023,
        electricityRate: 4_000,
        oldWater: 1_001,
        newWater: 1_007,
        waterRate: 35_000,
        date: "2026-07-01",
      }),
    );
  });

  it("CONFIRMED → banner đã chốt + total; input khoá; bấm Chỉnh sửa & chốt lại → mở form edit", async () => {
    fetchRentalMock.mockResolvedValue({
      config: CONFIG,
      months: [makeMonth({ status: "CONFIRMED", expenseId: "e1", confirmedAt: "2026-07-01T00:00:00.000Z" })],
    });
    renderMonthPage("2026-07");

    expect(await screen.findByText(/Đã chốt/)).toBeInTheDocument();
    expect(screen.getByText("4.930.000 ₫")).toBeInTheDocument();
    expect(screen.getByLabelText("Tiền phòng (đ)")).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Chốt khoản chi" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Chỉnh sửa & chốt lại" }));
    expect(screen.getByLabelText("Tiền phòng (đ)")).toBeEnabled();
    expect(screen.getByRole("button", { name: "Chốt lại" })).toBeInTheDocument();
  });

  it("CONFIRMED: sửa đơn giá + Chốt lại → confirmRentalMonth với giá trị mới (không gọi updateRentalMonth)", async () => {
    fetchRentalMock.mockResolvedValue({
      config: CONFIG,
      months: [makeMonth({ status: "CONFIRMED", expenseId: "e1", confirmedAt: "2026-07-01T00:00:00.000Z" })],
    });
    confirmRentalMonthMock.mockResolvedValue({
      month: makeMonth({ status: "CONFIRMED", expenseId: "e1", electricityRate: 3_500 }),
      expenseId: "e1",
    });
    renderMonthPage("2026-07");

    fireEvent.click(await screen.findByRole("button", { name: "Chỉnh sửa & chốt lại" }));
    fireEvent.change(screen.getByLabelText("Đơn giá (đ/kWh)"), { target: { value: "3500" } });
    fireEvent.click(screen.getByRole("button", { name: "Chốt lại" }));

    const dialog = await screen.findByRole("dialog");
    // 3.600.000 + 280 × 3.500 (980.000) + 210.000 = 4.790.000
    expect(within(dialog).getByText("4.790.000 ₫")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Chốt lại" }));

    await waitFor(() =>
      expect(confirmRentalMonthMock).toHaveBeenCalledWith(
        "f1",
        "2026-07",
        expect.objectContaining({ electricityRate: 3_500, date: "2026-07-01" }),
      ),
    );
    expect(updateRentalMonthMock).not.toHaveBeenCalled();
  });

  it("CONFIRMED: Xoá tháng → dialog cảnh báo xoá cả khoản chi; xác nhận → deleteRentalMonth", async () => {
    fetchRentalMock.mockResolvedValue({
      config: CONFIG,
      months: [makeMonth({ status: "CONFIRMED", expenseId: "e1", confirmedAt: "2026-07-01T00:00:00.000Z" })],
    });
    deleteRentalMonthMock.mockResolvedValue(undefined);
    renderMonthPage("2026-07");
    await screen.findByRole("heading", { name: monthLabel("2026-07") });

    fireEvent.click(screen.getByRole("button", { name: "Xoá tháng" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/cũng sẽ bị xoá khỏi Lịch sử/)).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "Xoá" }));
    await waitFor(() => expect(deleteRentalMonthMock).toHaveBeenCalledWith("f1", "2026-07"));
    expect(screen.getByText("LIST_MARKER")).toBeInTheDocument();
  });

  it("MEMBER: xem được giá trị + kết quả, mọi input khoá, không có nút hành động", async () => {
    useAuthStore.setState({
      user: USER,
      families: [{ ...FAMILY, myRole: "MEMBER" }],
      activeFamilyId: FAMILY.id,
    });
    fetchRentalMock.mockResolvedValue({ config: CONFIG, months: [makeMonth()] });
    renderMonthPage("2026-07");

    await screen.findByText(/Chỉ xem — chỉ chủ gia đình mới chỉnh sửa được/);
    expect(screen.getByLabelText("Tiền phòng (đ)")).toBeDisabled();
    expect(screen.getByText("4.930.000 ₫")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Chốt khoản chi" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Xoá tháng" })).toBeNull();
  });
});

describe("RentalCard (Trang chủ)", () => {
  beforeEach(() => {
    useAuthStore.setState({ user: USER, families: [FAMILY], activeFamilyId: FAMILY.id });
    fetchRentalMock.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("tháng hiện tại DRAFT → 'Chờ chốt · tổng', link /rental", async () => {
    fetchRentalMock.mockResolvedValue({
      config: CONFIG,
      months: [makeMonth({ month: currentMonth() })],
    });
    render(
      <MemoryRouter>
        <RentalCard />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Tiền phòng trọ")).toBeInTheDocument();
    expect(screen.getByText("Chờ chốt · 4.930.000 ₫")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Tiền phòng trọ/ })).toHaveAttribute("href", "/rental");
  });

  it("tháng hiện tại CONFIRMED → 'Đã chốt · tổng'", async () => {
    fetchRentalMock.mockResolvedValue({
      config: CONFIG,
      months: [makeMonth({ month: currentMonth(), status: "CONFIRMED", expenseId: "e1" })],
    });
    render(
      <MemoryRouter>
        <RentalCard />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Đã chốt · 4.930.000 ₫")).toBeInTheDocument();
  });

  it("fetchRental lỗi (offline) → không crash, card chỉ hiện tiêu đề", async () => {
    fetchRentalMock.mockRejectedValue(new ApiError("NETWORK_ERROR", "Mất kết nối.", 0));
    render(
      <MemoryRouter>
        <RentalCard />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Tiền phòng trọ")).toBeInTheDocument();
    expect(screen.queryByText(/Chờ chốt ·/)).toBeNull();
    expect(screen.queryByText(/Đã chốt ·/)).toBeNull();
  });
});
