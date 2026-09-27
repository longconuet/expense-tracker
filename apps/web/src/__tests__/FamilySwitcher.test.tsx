import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FamilySwitcher } from "../shared/ui/FamilySwitcher";

const FAMILY_A = {
  id: "fa",
  name: "Nhà An",
  inviteCode: "ABC123",
  ownerName: "An",
  memberCount: 2,
  myRole: "OWNER",
} as const;
const FAMILY_B = {
  id: "fb",
  name: "Công ty X",
  inviteCode: "XYZ789",
  ownerName: "Bình",
  memberCount: 5,
  myRole: "MEMBER",
} as const;

describe("shared/ui/FamilySwitcher", () => {
  afterEach(() => {
    cleanup();
  });

  it("hiện dialog danh sách family + role badge của từng family", () => {
    // Arrange + Act
    render(
      <FamilySwitcher
        families={[FAMILY_A, FAMILY_B]}
        activeFamilyId={FAMILY_A.id}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    // Assert
    expect(screen.getByRole("dialog", { name: "Đổi gia đình" })).toBeInTheDocument();
    // Neo safe-area bottom (PWA iOS — home indicator), max() giữ 20px trên desktop
    expect(screen.getByRole("dialog", { name: "Đổi gia đình" })).toHaveClass(
      "pb-[max(env(safe-area-inset-bottom),1.25rem)]",
    );
    expect(screen.getByText("Nhà An")).toBeInTheDocument();
    expect(screen.getByText("Công ty X")).toBeInTheDocument();
    expect(screen.getByText("2 thành viên · An")).toBeInTheDocument();
    expect(screen.getByText("Chủ gia đình")).toBeInTheDocument();
    expect(screen.getByText("Thành viên")).toBeInTheDocument();
  });

  it("bấm family khác → gọi onSelect với id family đó", () => {
    // Arrange
    const onSelect = vi.fn();
    render(
      <FamilySwitcher
        families={[FAMILY_A, FAMILY_B]}
        activeFamilyId={FAMILY_A.id}
        onSelect={onSelect}
        onClose={vi.fn()}
      />,
    );

    // Act
    fireEvent.click(screen.getByText("Công ty X").closest("button")!);

    // Assert
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(FAMILY_B.id);
  });

  it("bấm nút đóng → gọi onClose", () => {
    // Arrange
    const onClose = vi.fn();
    render(
      <FamilySwitcher
        families={[FAMILY_A, FAMILY_B]}
        activeFamilyId={FAMILY_A.id}
        onSelect={vi.fn()}
        onClose={onClose}
      />,
    );

    // Act
    fireEvent.click(screen.getByLabelText("Đóng"));

    // Assert
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("bấm nền tối (backdrop) → gọi onClose; click TRONG panel không đóng", () => {
    // Arrange
    const onClose = vi.fn();
    render(
      <FamilySwitcher
        families={[FAMILY_A, FAMILY_B]}
        activeFamilyId={FAMILY_A.id}
        onSelect={vi.fn()}
        onClose={onClose}
      />,
    );
    const dialog = screen.getByRole("dialog", { name: "Đổi gia đình" });

    // Act — click vào item family (bên trong panel, có stopPropagation)
    fireEvent.click(screen.getByText("Công ty X").closest("button")!);

    // Assert — không gọi onClose (stopPropagation chặn bubbling ra backdrop)
    expect(onClose).not.toHaveBeenCalled();

    // Act — click ra ngoài panel (backdrop = parent của dialog)
    fireEvent.click(dialog.parentElement!);

    // Assert
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
