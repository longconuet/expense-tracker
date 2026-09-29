import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../core/api";
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
        open
        families={[FAMILY_A, FAMILY_B]}
        activeFamilyId={FAMILY_A.id}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    // Assert
    expect(screen.getByRole("dialog", { name: "Đổi gia đình" })).toBeInTheDocument();
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
        open
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
        open
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
        open
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

  it("open=false → không render gì", () => {
    // Arrange + Act
    render(
      <FamilySwitcher
        open={false}
        families={[FAMILY_A]}
        activeFamilyId={FAMILY_A.id}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    // Assert
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("đóng (open → false) → sheet trượt xuống rồi unmount sau hiệu ứng", async () => {
    // Arrange + Act
    const { rerender } = render(
      <FamilySwitcher
        open
        families={[FAMILY_A]}
        activeFamilyId={FAMILY_A.id}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByRole("dialog", { name: "Đổi gia đình" })).toHaveClass("animate-sheet-in");

    // Act
    rerender(
      <FamilySwitcher
        open={false}
        families={[FAMILY_A]}
        activeFamilyId={FAMILY_A.id}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    // Assert — trong pha exit: sheet class animate-sheet-out, vẫn mounted
    expect(screen.getByRole("dialog", { name: "Đổi gia đình" })).toHaveClass("animate-sheet-out");

    // Assert — sau thời lượng animation → unmount hẳn
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument(), { timeout: 2000 });
  });

  it("trong pha đóng → click backdrop + nút X không gọi onClose lại", () => {
    // Arrange
    const onClose = vi.fn();
    const { rerender } = render(
      <FamilySwitcher
        open
        families={[FAMILY_A]}
        activeFamilyId={FAMILY_A.id}
        onSelect={vi.fn()}
        onClose={onClose}
      />,
    );
    rerender(
      <FamilySwitcher
        open={false}
        families={[FAMILY_A]}
        activeFamilyId={FAMILY_A.id}
        onSelect={vi.fn()}
        onClose={onClose}
      />,
    );

    // Act
    fireEvent.click(screen.getByRole("dialog", { name: "Đổi gia đình" }).parentElement!);
    fireEvent.click(screen.getByLabelText("Đóng"));

    // Assert
    expect(onClose).not.toHaveBeenCalled();
  });

  it("mở lại sau khi đóng → reset về view list, không sót form cũ", async () => {
    // Arrange — mở, vào view create, điền tên
    const { rerender } = render(
      <FamilySwitcher
        open
        families={[FAMILY_A]}
        activeFamilyId={FAMILY_A.id}
        onSelect={vi.fn()}
        onClose={vi.fn()}
        onCreateFamily={vi.fn(async () => undefined)}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Tạo gia đình mới/ }));
    fireEvent.change(screen.getByLabelText("Tên gia đình"), { target: { value: "Nhà Cũ" } });
    expect(screen.getByLabelText("Tên gia đình")).toHaveValue("Nhà Cũ");

    // Act — đóng (chờ exit xong), rồi mở lại
    rerender(
      <FamilySwitcher
        open={false}
        families={[FAMILY_A]}
        activeFamilyId={FAMILY_A.id}
        onSelect={vi.fn()}
        onClose={vi.fn()}
        onCreateFamily={vi.fn(async () => undefined)}
      />,
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument(), { timeout: 2000 });
    rerender(
      <FamilySwitcher
        open
        families={[FAMILY_A]}
        activeFamilyId={FAMILY_A.id}
        onSelect={vi.fn()}
        onClose={vi.fn()}
        onCreateFamily={vi.fn(async () => undefined)}
      />,
    );

    // Assert — về view list, form cũ không còn (kể cả input đã điền)
    expect(screen.getByRole("dialog", { name: "Đổi gia đình" })).toBeInTheDocument();
    expect(screen.getByText("Nhà An")).toBeInTheDocument();
    expect(screen.queryByLabelText("Tên gia đình")).not.toBeInTheDocument();
  });

  describe("tạo/join family thêm (callback optional)", () => {
    it("không truyền callback → không hiện 2 nút action", () => {
      // Arrange + Act
      render(
        <FamilySwitcher
          open
          families={[FAMILY_A]}
          activeFamilyId={FAMILY_A.id}
          onSelect={vi.fn()}
          onClose={vi.fn()}
        />,
      );

      // Assert
      expect(screen.queryByRole("button", { name: /Tạo gia đình mới/ })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Join bằng mã mời/ })).not.toBeInTheDocument();
    });

    it("truyền cả 2 callback → hiện 2 nút action ở đáy sheet", () => {
      // Arrange + Act
      render(
        <FamilySwitcher
          open
          families={[FAMILY_A]}
          activeFamilyId={FAMILY_A.id}
          onSelect={vi.fn()}
          onClose={vi.fn()}
          onCreateFamily={vi.fn(async () => undefined)}
          onJoinFamily={vi.fn(async () => undefined)}
        />,
      );

      // Assert
      expect(screen.getByRole("button", { name: /Tạo gia đình mới/ })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Join bằng mã mời/ })).toBeInTheDocument();
    });

    it("create: tên rỗng / chỉ dấu cách → hiện lỗi, không gọi callback", async () => {
      // Arrange
      const onCreateFamily = vi.fn(async () => undefined);
      render(
        <FamilySwitcher
          open
          families={[FAMILY_A]}
          activeFamilyId={FAMILY_A.id}
          onSelect={vi.fn()}
          onClose={vi.fn()}
          onCreateFamily={onCreateFamily}
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: /Tạo gia đình mới/ }));

      // Act — submit khi input rỗng
      fireEvent.click(screen.getByRole("button", { name: "Tạo gia đình" }));

      // Assert
      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Tên gia đình phải có ít nhất 2 ký tự.",
      );
      expect(onCreateFamily).not.toHaveBeenCalled();

      // Act — chỉ dấu cách cũng sai
      // (regex vì lỗi validate nằm trong <label> → accessible name của input có tiền tố tên label)
      fireEvent.change(screen.getByLabelText(/^Tên gia đình/), { target: { value: "   " } });
      fireEvent.click(screen.getByRole("button", { name: "Tạo gia đình" }));

      // Assert
      expect(screen.getByRole("alert")).toHaveTextContent("ít nhất 2 ký tự");
      expect(onCreateFamily).not.toHaveBeenCalled();
    });

    it("create: tên hợp lệ → gọi onCreateFamily (đã trim) + button loading trong khi chờ", async () => {
      // Arrange — giữ promise chưa resolve để kiểm tra trạng thái loading
      let resolveCreate: () => void = () => undefined;
      const onCreateFamily = vi.fn(
        () =>
          new Promise<void>((resolve) => {
            resolveCreate = resolve;
          }),
      );
      render(
        <FamilySwitcher
          open
          families={[FAMILY_A]}
          activeFamilyId={FAMILY_A.id}
          onSelect={vi.fn()}
          onClose={vi.fn()}
          onCreateFamily={onCreateFamily}
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: /Tạo gia đình mới/ }));
      fireEvent.change(screen.getByLabelText("Tên gia đình"), { target: { value: "  Nhà Mới  " } });

      // Act
      fireEvent.click(screen.getByRole("button", { name: "Tạo gia đình" }));

      // Assert — gọi với tên đã trim + button disable (loading)
      expect(onCreateFamily).toHaveBeenCalledTimes(1);
      expect(onCreateFamily).toHaveBeenCalledWith("Nhà Mới");
      expect(screen.getByRole("button", { name: /Tạo gia đình/ })).toBeDisabled();

      // Act — resolve → hết loading
      resolveCreate();
      await waitFor(() =>
        expect(screen.getByRole("button", { name: /Tạo gia đình/ })).not.toBeDisabled(),
      );
    });

    it("create: callback reject ApiError → hiện message server trong form", async () => {
      // Arrange
      const onCreateFamily = vi.fn(async () => {
        throw new ApiError("INTERNAL", "Không thể tạo gia đình, thử lại sau.", 500);
      });
      render(
        <FamilySwitcher
          open
          families={[FAMILY_A]}
          activeFamilyId={FAMILY_A.id}
          onSelect={vi.fn()}
          onClose={vi.fn()}
          onCreateFamily={onCreateFamily}
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: /Tạo gia đình mới/ }));
      fireEvent.change(screen.getByLabelText("Tên gia đình"), { target: { value: "Nhà Mới" } });

      // Act
      fireEvent.click(screen.getByRole("button", { name: "Tạo gia đình" }));

      // Assert
      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Không thể tạo gia đình, thử lại sau.",
      );
    });

    it("create: callback reject (không phải ApiError) → hiện fallback", async () => {
      // Arrange
      const onCreateFamily = vi.fn(async () => {
        throw new Error("boom");
      });
      render(
        <FamilySwitcher
          open
          families={[FAMILY_A]}
          activeFamilyId={FAMILY_A.id}
          onSelect={vi.fn()}
          onClose={vi.fn()}
          onCreateFamily={onCreateFamily}
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: /Tạo gia đình mới/ }));
      fireEvent.change(screen.getByLabelText("Tên gia đình"), { target: { value: "Nhà Mới" } });

      // Act
      fireEvent.click(screen.getByRole("button", { name: "Tạo gia đình" }));

      // Assert
      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Có lỗi xảy ra, vui lòng thử lại.",
      );
    });

    it("join: mã sai độ dài → lỗi validate, không gọi callback", async () => {
      // Arrange
      const onJoinFamily = vi.fn(async () => undefined);
      render(
        <FamilySwitcher
          open
          families={[FAMILY_A]}
          activeFamilyId={FAMILY_A.id}
          onSelect={vi.fn()}
          onClose={vi.fn()}
          onJoinFamily={onJoinFamily}
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: /Join bằng mã mời/ }));

      // Act — input chỉ nhận A-Z0-9, maxLength 6 → "abc" → "ABC" (3 ký tự, sai)
      fireEvent.change(screen.getByLabelText("Mã mời"), { target: { value: "abc" } });
      fireEvent.click(screen.getByRole("button", { name: "Tham gia" }));

      // Assert
      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Mã mời phải gồm 6 ký tự chữ/số",
      );
      expect(onJoinFamily).not.toHaveBeenCalled();
    });

    it("join: mã đủ 6 ký tự nhưng chứa ký tự cấm (0, 1, I, O) → lỗi validate, không gọi callback", async () => {
      // Arrange
      const onJoinFamily = vi.fn(async () => undefined);
      render(
        <FamilySwitcher
          open
          families={[FAMILY_A]}
          activeFamilyId={FAMILY_A.id}
          onSelect={vi.fn()}
          onClose={vi.fn()}
          onJoinFamily={onJoinFamily}
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: /Join bằng mã mời/ }));

      // Act — "AB01CD" đủ 6 ký tự nhưng 0 và 1 không thuộc alphabet mã mời
      fireEvent.change(screen.getByLabelText("Mã mời"), { target: { value: "AB01CD" } });
      fireEvent.click(screen.getByRole("button", { name: "Tham gia" }));

      // Assert
      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Mã mời phải gồm 6 ký tự chữ/số",
      );
      expect(onJoinFamily).not.toHaveBeenCalled();
    });

    it("join: mã 6 ký tự gõ thường → gọi onJoinFamily với mã uppercase", async () => {
      // Arrange
      const onJoinFamily = vi.fn(async () => undefined);
      render(
        <FamilySwitcher
          open
          families={[FAMILY_A]}
          activeFamilyId={FAMILY_A.id}
          onSelect={vi.fn()}
          onClose={vi.fn()}
          onJoinFamily={onJoinFamily}
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: /Join bằng mã mời/ }));

      // Act — "abc234" không dính ký tự cấm (0, 1, I, O) của alphabet mã mời
      fireEvent.change(screen.getByLabelText("Mã mời"), { target: { value: "abc234" } });
      fireEvent.click(screen.getByRole("button", { name: "Tham gia" }));

      // Assert
      await waitFor(() => expect(onJoinFamily).toHaveBeenCalledTimes(1));
      expect(onJoinFamily).toHaveBeenCalledWith("ABC234");
    });

    it("join: callback reject ApiError → hiện message trong form", async () => {
      // Arrange
      const onJoinFamily = vi.fn(async () => {
        throw new ApiError("ALREADY_MEMBER", "Bạn đã là thành viên gia đình này.", 409);
      });
      render(
        <FamilySwitcher
          open
          families={[FAMILY_A]}
          activeFamilyId={FAMILY_A.id}
          onSelect={vi.fn()}
          onClose={vi.fn()}
          onJoinFamily={onJoinFamily}
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: /Join bằng mã mời/ }));
      fireEvent.change(screen.getByLabelText("Mã mời"), { target: { value: "ABC234" } });

      // Act
      fireEvent.click(screen.getByRole("button", { name: "Tham gia" }));

      // Assert
      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Bạn đã là thành viên gia đình này.",
      );
    });

    it("nút 'Quay lại' trong view create/join → về lại list", async () => {
      // Arrange
      render(
        <FamilySwitcher
          open
          families={[FAMILY_A, FAMILY_B]}
          activeFamilyId={FAMILY_A.id}
          onSelect={vi.fn()}
          onClose={vi.fn()}
          onCreateFamily={vi.fn(async () => undefined)}
          onJoinFamily={vi.fn(async () => undefined)}
        />,
      );

      // Act — vào view create rồi quay lại
      fireEvent.click(screen.getByRole("button", { name: /Tạo gia đình mới/ }));
      expect(screen.getByRole("button", { name: /Quay lại/ })).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: /Quay lại/ }));

      // Assert — về list (thấy family + nút action), form biến mất
      expect(screen.getByText("Công ty X")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Tạo gia đình mới/ })).toBeInTheDocument();
      expect(screen.queryByLabelText("Tên gia đình")).not.toBeInTheDocument();

      // Act — vào view join rồi quay lại
      fireEvent.click(screen.getByRole("button", { name: /Join bằng mã mời/ }));
      fireEvent.click(screen.getByRole("button", { name: /Quay lại/ }));

      // Assert
      expect(screen.queryByLabelText("Mã mời")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Join bằng mã mời/ })).toBeInTheDocument();
    });
  });
});
