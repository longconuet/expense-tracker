import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCacheStatus } from "../core/cacheStatus";

const HOUR = 3600_000;
const isoAgo = (ms: number) => new Date(Date.now() - ms).toISOString();

describe("core/cacheStatus", () => {
  beforeEach(() => {
    useCacheStatus.setState({ servedFromCacheAt: null, markedAt: null });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("markServed lưu thời điểm bản cache được dùng", () => {
    // Arrange
    const savedAt = isoAgo(HOUR);

    // Act
    useCacheStatus.getState().markServed(savedAt);

    // Assert
    expect(useCacheStatus.getState().servedFromCacheAt).toBe(savedAt);
  });

  it("markServed ghi đè mark cũ", () => {
    // Arrange
    const oldMark = isoAgo(2 * HOUR);
    const newMark = isoAgo(HOUR);
    useCacheStatus.getState().markServed(oldMark);

    // Act
    useCacheStatus.getState().markServed(newMark);

    // Assert
    expect(useCacheStatus.getState().servedFromCacheAt).toBe(newMark);
  });

  it("clear() sau khi mark > 2s → xoá mark", () => {
    vi.useFakeTimers();
    const base = Date.UTC(2030, 0, 1);
    vi.setSystemTime(base);

    // Arrange
    useCacheStatus.getState().markServed(new Date(base).toISOString());
    vi.setSystemTime(base + 3000);

    // Act
    useCacheStatus.getState().clear();

    // Assert
    expect(useCacheStatus.getState().servedFromCacheAt).toBeNull();
  });

  it("clear() khi mark còn < 2s → giữ mark (guard race fetch song song)", () => {
    vi.useFakeTimers();
    const base = Date.UTC(2030, 0, 1);
    vi.setSystemTime(base);

    // Arrange
    useCacheStatus.getState().markServed(new Date(base).toISOString());
    vi.setSystemTime(base + 500);

    // Act
    useCacheStatus.getState().clear();

    // Assert
    expect(useCacheStatus.getState().servedFromCacheAt).toBe(new Date(base).toISOString());
  });

  it("savedAt cũ (1h) nhưng mark mới (< 2s) → clear() vẫn giữ mark (guard theo markedAt, không theo savedAt)", () => {
    vi.useFakeTimers();
    const base = Date.UTC(2030, 0, 1);
    vi.setSystemTime(base);

    // Arrange — entry cache đã ghi từ 1h trước (production: fallback luôn là entry cũ)
    useCacheStatus.getState().markServed(new Date(base - 3600_000).toISOString());
    vi.setSystemTime(base + 500);

    // Act
    useCacheStatus.getState().clear();

    // Assert
    expect(useCacheStatus.getState().servedFromCacheAt).toBe(
      new Date(base - 3600_000).toISOString(),
    );
  });

  it("clear(true) → xoá luôn mark mới (đổi trang)", () => {
    vi.useFakeTimers();
    const base = Date.UTC(2030, 0, 1);
    vi.setSystemTime(base);

    // Arrange
    useCacheStatus.getState().markServed(new Date(base).toISOString());

    // Act
    useCacheStatus.getState().clear(true);

    // Assert
    expect(useCacheStatus.getState().servedFromCacheAt).toBeNull();
    expect(useCacheStatus.getState().markedAt).toBeNull();
  });

  it("clear() khi chưa có mark → giữ null", () => {
    // Act
    useCacheStatus.getState().clear();

    // Assert
    expect(useCacheStatus.getState().servedFromCacheAt).toBeNull();
  });
});
