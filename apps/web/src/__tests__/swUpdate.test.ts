import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * SW mock tối giản — đủ mặt `controller` + `getRegistration` (+ event
 * listener để test hook). Module `swUpdate` chụp `navigator.serviceWorker`
 * KHI MODULE NẠP → mỗi test phải set mock TRƯỚC khi `import()`.
 */
type Worker = {
  state: "installing" | "installed" | "activating" | "activated" | "redundant";
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
  _emit: (type: string) => void;
};

function makeWorker(state: Worker["state"]): Worker {
  const listeners: Record<string, Array<() => void>> = {};
  return {
    state,
    addEventListener: vi.fn((type: string, cb: () => void) => {
      (listeners[type] ??= []).push(cb);
    }),
    removeEventListener: vi.fn(),
    _emit: (type: string) => {
      listeners[type]?.forEach((cb) => cb());
    },
  };
}

/**
 * `navigator.serviceWorker` = CHÍNH `swObj` (Object.assign, không spread)
 * để test mutate `swObj.controller` sau khi module nạp vẫn thấy.
 */
function mockServiceWorker(swObj: Record<string, unknown>) {
  Object.defineProperty(navigator, "serviceWorker", {
    value: Object.assign(swObj, {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
    configurable: true,
  });
}

let savedLocation: unknown;

/** jsdom không spy được Location.prototype.reload — thay nguyên object location. */
function mockReload() {
  const reload = vi.fn();
  savedLocation = window.location;
  Object.defineProperty(window, "location", {
    value: { href: "http://localhost/", reload },
    configurable: true,
    writable: true,
  });
  return reload;
}

async function loadSwUpdate() {
  vi.resetModules();
  return import("../core/swUpdate");
}

describe("swUpdate (kiểm tra + áp dụng cập nhật PWA)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    if (savedLocation !== undefined) {
      Object.defineProperty(window, "location", {
        value: savedLocation,
        configurable: true,
        writable: true,
      });
      savedLocation = undefined;
    }
    Object.defineProperty(navigator, "serviceWorker", {
      value: undefined,
      configurable: true,
    });
  });

  describe("hasPendingUpdate", () => {
    it("trình duyệt không hỗ trợ SW → false; apply không reload", async () => {
      // Arrange — jsdom không có serviceWorker
      const reload = mockReload();
      const mod = await loadSwUpdate();

      // Act + Assert
      expect(mod.hasPendingUpdate()).toBe(false);
      await mod.requestSwUpdateCheck();
      await mod.applySwUpdate();
      expect(reload).not.toHaveBeenCalled();
    });

    it("lần ghé đầu (chưa có SW lúc khởi động) → không báo cập nhật dù SW đầu tiên claim", async () => {
      // Arrange — controller null lúc module nạp
      const swObj: Record<string, unknown> = { controller: null };
      mockServiceWorker(swObj);
      const mod = await loadSwUpdate();

      // Act — SW đầu tiên install + claim
      swObj.controller = makeWorker("activated");

      // Assert
      expect(mod.hasPendingUpdate()).toBe(false);
    });

    it("controller không đổi → false", async () => {
      // Arrange
      const swObj: Record<string, unknown> = { controller: makeWorker("activated") };
      mockServiceWorker(swObj);
      const mod = await loadSwUpdate();

      // Act + Assert
      expect(mod.hasPendingUpdate()).toBe(false);
    });

    it("SW mới nhận quyền điều khiển (khác SW lúc khởi động) → true", async () => {
      // Arrange — app khởi động do SW cũ điều khiển
      const oldSw = makeWorker("activated");
      const newSw = makeWorker("activated");
      const swObj: Record<string, unknown> = { controller: oldSw };
      mockServiceWorker(swObj);
      const mod = await loadSwUpdate();

      // Act — deploy mới: SW mới activate + clientsClaim
      swObj.controller = newSw;

      // Assert
      expect(mod.hasPendingUpdate()).toBe(true);
    });
  });

  describe("requestSwUpdateCheck", () => {
    it("có registration → gọi reg.update() đúng 1 lần", async () => {
      // Arrange
      const reg = { update: vi.fn(async () => undefined), waiting: null, installing: null };
      const swObj: Record<string, unknown> = {
        controller: makeWorker("activated"),
        getRegistration: vi.fn(async () => reg),
      };
      mockServiceWorker(swObj);
      const mod = await loadSwUpdate();

      // Act
      await mod.requestSwUpdateCheck();

      // Assert
      expect(reg.update).toHaveBeenCalledTimes(1);
    });

    it("chưa có registration → no-op, không throw", async () => {
      // Arrange
      const swObj: Record<string, unknown> = {
        controller: null,
        getRegistration: vi.fn(async () => undefined),
      };
      mockServiceWorker(swObj);
      const mod = await loadSwUpdate();

      // Act + Assert
      await expect(mod.requestSwUpdateCheck()).resolves.toBeUndefined();
    });

    it("offline (reg.update reject) → không throw", async () => {
      // Arrange
      const reg = {
        update: vi.fn(async () => {
          throw new Error("failed to fetch");
        }),
      };
      const swObj: Record<string, unknown> = {
        controller: makeWorker("activated"),
        getRegistration: vi.fn(async () => reg),
      };
      mockServiceWorker(swObj);
      const mod = await loadSwUpdate();

      // Act + Assert
      await expect(mod.requestSwUpdateCheck()).resolves.toBeUndefined();
    });
  });

  describe("applySwUpdate", () => {
    it("không có worker đang chờ → reload ngay", async () => {
      // Arrange
      const reload = mockReload();
      const reg = { update: vi.fn(), waiting: null, installing: null };
      const swObj: Record<string, unknown> = {
        controller: makeWorker("activated"),
        getRegistration: vi.fn(async () => reg),
      };
      mockServiceWorker(swObj);
      const mod = await loadSwUpdate();

      // Act
      await mod.applySwUpdate();

      // Assert
      expect(reload).toHaveBeenCalledTimes(1);
    });

    it("worker đang installing → đợi activate xong rồi mới reload", async () => {
      // Arrange
      const reload = mockReload();
      const worker = makeWorker("installing");
      const reg = { update: vi.fn(), waiting: null, installing: worker };
      const swObj: Record<string, unknown> = {
        controller: null,
        getRegistration: vi.fn(async () => reg),
      };
      mockServiceWorker(swObj);
      const mod = await loadSwUpdate();

      // Act — gọi apply (chưa resolve), lúc này chưa được reload
      const p = mod.applySwUpdate();
      await new Promise((r) => setTimeout(r, 0));
      expect(reload).not.toHaveBeenCalled();

      // Act — SW mới activate
      worker.state = "activated";
      worker._emit("statechange");
      await p;

      // Assert
      expect(reload).toHaveBeenCalledTimes(1);
    });

    it("worker đã activated (waiting) → reload ngay, không chờ thêm", async () => {
      // Arrange
      const reload = mockReload();
      const worker = makeWorker("activated");
      const reg = { update: vi.fn(), waiting: worker, installing: null };
      const swObj: Record<string, unknown> = {
        controller: null,
        getRegistration: vi.fn(async () => reg),
      };
      mockServiceWorker(swObj);
      const mod = await loadSwUpdate();

      // Act
      await mod.applySwUpdate();

      // Assert
      expect(reload).toHaveBeenCalledTimes(1);
    });
  });
});
