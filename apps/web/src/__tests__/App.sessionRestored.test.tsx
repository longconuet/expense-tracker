import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import App from "../App";

function fakeResponse(
  body: unknown,
  status = 200,
  meta?: { page: number; pageSize: number; total: number },
) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => (meta ? { ...(body as Record<string, unknown>), meta } : body),
  } as unknown as Response;
}

const MOCK_USER = { id: "u1", name: "An", username: "an2310" };
const MOCK_FAMILY = {
  id: "f1",
  name: "Nhà An",
  inviteCode: "ABC123",
  ownerName: "An",
  memberCount: 1,
  myRole: "OWNER",
} as const;

describe("App — phiên đăng nhập (còn refresh cookie)", () => {
  it("khôi phục phiên từ refresh cookie → vào thẳng trang chủ", async () => {
    // Arrange: 1) refresh OK, 2) /me OK, 3) stats, 4) expenses (trang chủ gọi 2 API)
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        fakeResponse({ success: true, data: { user: MOCK_USER, accessToken: "access-1" }, error: null }),
      )
      .mockResolvedValueOnce(
        fakeResponse({ success: true, data: { user: MOCK_USER, families: [MOCK_FAMILY] }, error: null }),
      )
      .mockResolvedValueOnce(
        fakeResponse({
          success: true,
          data: {
            month: "2026-09",
            total: 0,
            previousMonthTotal: 0,
            byCategory: [],
            byDay: [],
            byMember: [],
          },
          error: null,
        }),
      )
      .mockResolvedValueOnce(
        fakeResponse(
          { success: true, data: { expenses: [] }, error: null },
          200,
          { page: 1, pageSize: 5, total: 0 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    // Act
    render(<App />);

    // Assert — heading để phân biệt với nav link "Trang chủ"
    expect(await screen.findByRole("heading", { name: "Trang chủ" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});
