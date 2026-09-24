import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "../shared/ui/ConfirmDialog";

describe("ConfirmDialog", () => {
  afterEach(() => {
    cleanup();
  });

  it("render title + message + nút Huỷ và nút confirm", () => {
    // Arrange + Act
    render(
      <ConfirmDialog
        open
        title="Xoá khoản chi"
        message='Xoá khoản "cơm trưa" (50.000 ₫)?'
        confirmLabel="Xoá"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );

    // Assert
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Xoá khoản chi")).toBeInTheDocument();
    expect(screen.getByText('Xoá khoản "cơm trưa" (50.000 ₫)?')).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Xoá" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Huỷ" })).toBeInTheDocument();
  });

  it("bấm nút confirm → onConfirm; bấm Huỷ → onCancel", () => {
    // Arrange
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        open
        title="T"
        message="m"
        confirmLabel="Xác nhận"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    // Act
    fireEvent.click(screen.getByRole("button", { name: "Xác nhận" }));
    fireEvent.click(screen.getByRole("button", { name: "Huỷ" }));

    // Assert
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("danger → nút confirm màu danger; không danger → primary", () => {
    // Arrange + Act
    const { rerender } = render(
      <ConfirmDialog open danger title="T" message="m" confirmLabel="Xoá" onConfirm={() => {}} onCancel={() => {}} />,
    );

    // Assert
    expect(screen.getByRole("button", { name: "Xoá" })).toHaveClass("bg-danger");

    // Act
    rerender(
      <ConfirmDialog open title="T" message="m" confirmLabel="Xoá" onConfirm={() => {}} onCancel={() => {}} />,
    );

    // Assert
    expect(screen.getByRole("button", { name: "Xoá" })).toHaveClass("bg-primary");
  });

  it("loading → cả 2 nút disable (confirm có spinner)", () => {
    // Arrange + Act
    render(
      <ConfirmDialog open loading title="T" message="m" confirmLabel="Xoá" onConfirm={() => {}} onCancel={() => {}} />,
    );

    // Assert
    expect(screen.getByRole("button", { name: "Xoá" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Huỷ" })).toBeDisabled();
  });
});
