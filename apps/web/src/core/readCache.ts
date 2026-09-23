import { isServerUnavailable } from "./syncQueue";
import { idbGet, idbPut } from "./db";

/**
 * Cache đọc ngắn cho response API GET (store "cache" của IndexedDB):
 * - Mỗi lần GET thành công → lưu kết quả (key = "GET " + path đầy đủ kèm query)
 * - Server không đạt được (lỗi mạng/5xx) → trả về bản lưu trước (stale-while-error)
 * Không dùng TTL — bản lưu luôn được ghi đè khi server đạt được;
 * 4xx không bao giờ fallback (lỗi nghiệp vụ phải hiện cho user).
 */

interface CacheEntry {
  key: string;
  savedAt: string;
  value: unknown;
}

export async function cacheSet(key: string, value: unknown): Promise<void> {
  const entry: CacheEntry = { key, savedAt: new Date().toISOString(), value };
  try {
    await idbPut("cache", entry);
  } catch {
    // IndexedDB không khả dụng — bỏ qua cache (không ảnh hưởng app)
  }
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const entry = await idbGet<CacheEntry>("cache", key);
    return entry ? (entry.value as T) : null;
  } catch {
    return null;
  }
}

/**
 * GET có cache: thành công → lưu cache; server không đạt → trả bản lưu trước
 * (nếu có). Không có bản lưu → ném lỗi như thường.
 */
export async function withReadCache<T>(key: string, fetchFn: () => Promise<T>): Promise<T> {
  try {
    const data = await fetchFn();
    void cacheSet(key, data);
    return data;
  } catch (err) {
    if (isServerUnavailable(err)) {
      const cached = await cacheGet<T>(key);
      if (cached !== null) return cached;
    }
    throw err;
  }
}
