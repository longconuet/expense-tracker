import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Modal } from "../shared/ui/Modal";

describe("Modal", () => {
  afterEach(() => {
    cleanup();
  });

  it("render role=dialog + aria-modal + title khi open; không render gì khi open=false", () => {
    // Arrange + Act
    const { rerender } = render(
      <Modal open={false} onClose={() => {}} title="Tiêu đề">
        Nội dung
      </Modal>,
    );
    rerender(
      <Modal open onClose={() => {}} title="Tiêu đề">
        Nội dung
      </Modal>,
    );

    // Assert
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    const labelledBy = dialog.getAttribute("aria-labelledby");
    expect(labelledBy).toBeTruthy();
    expect(document.getElementById(labelledBy!)?.textContent).toBe("Tiêu đề");
    expect(screen.getByText("Nội dung")).toBeInTheDocument();
  });

  it("không render khi open=false", () => {
    // Arrange + Act
    render(
      <Modal open={false} onClose={() => {}} title="Tiêu đề">
        Nội dung
      </Modal>,
    );

    // Assert
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("bấm ra ngoài (overlay) → onClose; bấm vào trong dialog → không onClose", () => {
    // Arrange
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="Tiêu đề">
        <p>Nội dung</p>
      </Modal>,
    );

    // Act — click vào thân dialog
    fireEvent.click(screen.getByRole("dialog"));

    // Assert
    expect(onClose).not.toHaveBeenCalled();

    // Act — click ra ngoài (overlay là parentElement của dialog)
    fireEvent.click(screen.getByRole("dialog").parentElement!);

    // Assert
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("bấm Escape → onClose", () => {
    // Arrange
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="Tiêu đề">
        <p>Nội dung</p>
      </Modal>,
    );

    // Act
    fireEvent.keyDown(document, { key: "Escape" });

    // Assert
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("khoá scroll body khi mở, trả lại khi đóng xong hiệu ứng exit", async () => {
    // Arrange + Act
    const { rerender } = render(
      <Modal open onClose={() => {}} title="Tiêu đề">
        x
      </Modal>,
    );
    expect(document.body.style.overflow).toBe("hidden");

    // Act
    rerender(
      <Modal open={false} onClose={() => {}} title="Tiêu đề">
        x
      </Modal>,
    );

    // Assert — trong lúc fade-out vẫn khoá scroll, trả lại sau khi unmount
    expect(document.body.style.overflow).toBe("hidden");
    await waitFor(() => expect(document.body.style.overflow).toBe(""), { timeout: 2000 });
  });

  it("focus trap: Tab/Shift+Tab wrap trong dialog, kể cả khi focus đang ở container", () => {
    // Arrange
    render(
      <Modal open onClose={() => {}} title="T">
        <button type="button">A</button>
        <button type="button">B</button>
      </Modal>,
    );
    const a = screen.getByRole("button", { name: "A" });
    const b = screen.getByRole("button", { name: "B" });

    // Act — focus đang ở container (trạng thái ban đầu) → Tab phải vào A, không văng ra ngoài
    fireEvent.keyDown(document, { key: "Tab" });

    // Assert
    expect(document.activeElement).toBe(a);

    // Act — ở B (cuối) → Tab wrap về A
    b.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(a);

    // Act — ở A (đầu) → Shift+Tab wrap về B
    a.focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });

    // Assert
    expect(document.activeElement).toBe(b);
  });

  it("trả focus về phần tử trigger khi đóng xong hiệu ứng exit", async () => {
    // Arrange — trigger bên ngoài modal
    const { rerender } = render(
      <>
        <button type="button" id="trigger">
          Mở
        </button>
        <Modal open={false} onClose={() => {}} title="T">
          x
        </Modal>
      </>,
    );
    const trigger = document.getElementById("trigger")!;
    trigger.focus();

    // Act — mở modal
    rerender(
      <>
        <button type="button" id="trigger">
          Mở
        </button>
        <Modal open onClose={() => {}} title="T">
          x
        </Modal>
      </>,
    );
    expect(document.activeElement).toBe(screen.getByRole("dialog"));

    // Act — đóng modal
    rerender(
      <>
        <button type="button" id="trigger">
          Mở
        </button>
        <Modal open={false} onClose={() => {}} title="T">
          x
        </Modal>
      </>,
    );

    // Assert — focus trả về trigger sau khi đóng xong hiệu ứng
    await waitFor(() => expect(document.activeElement).toBe(trigger), { timeout: 2000 });
  });

  it("đóng → áp class exit, giữ mounted trong thời lượng animation rồi unmount", async () => {
    // Arrange + Act
    const { rerender } = render(
      <Modal open onClose={() => {}} title="T">
        x
      </Modal>,
    );
    expect(screen.getByRole("dialog")).toHaveClass("animate-modal-in");

    // Act
    rerender(
      <Modal open={false} onClose={() => {}} title="T">
        x
      </Modal>,
    );

    // Assert — trong pha exit: dialog vẫn mounted + class animate-*-out
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveClass("animate-modal-out");
    expect(dialog.parentElement).toHaveClass("animate-fade-out");

    // Assert — sau thời lượng animation → unmount hẳn
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument(), { timeout: 2000 });
  });

  it("trong pha đóng → Escape và click overlay không gọi onClose lại", () => {
    // Arrange — open → false nhưng component vẫn mounted (pha exit)
    const onClose = vi.fn();
    const { rerender } = render(
      <Modal open onClose={onClose} title="T">
        x
      </Modal>,
    );
    rerender(
      <Modal open={false} onClose={onClose} title="T">
        x
      </Modal>,
    );

    // Act
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(screen.getByRole("dialog").parentElement!);

    // Assert
    expect(onClose).not.toHaveBeenCalled();
  });

  it("disableDismiss → Escape + click overlay không gọi onClose", () => {
    // Arrange
    const onClose = vi.fn();
    render(
      <Modal open disableDismiss onClose={onClose} title="T">
        x
      </Modal>,
    );

    // Act
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(screen.getByRole("dialog").parentElement!);

    // Assert
    expect(onClose).not.toHaveBeenCalled();
  });
});
