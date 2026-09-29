import { isServerUnavailable } from "./api";
import { useCacheStatus } from "./cacheStatus";
import { idbDelete, idbGet, idbGetAll, idbPut } from "./db";

/**
 * Cache đọc cho response API GET (store "cache" của IndexedDB):
 * - Mỗi lần GET thành công → lưu kết quả (key = "GET " + path đầy đủ kèm query)
 * - Server không đạt được (lỗi mạng/5xx) → trả bản lưu trong TTL (stale-while-error)
 * - 4xx không bao giờ fallback (lỗi nghiệp vụ phải hiện cho user)
 * - Eviction: cap số entry + tuổi tối đa — chống store tăng vô hạn
 */

interface CacheEntry {
  key: string;
  savedAt: string;
  value: unknown;
}

// ---------------------------------------------------------------------------
// TTL — giới hạn tuổi bản fallback offline (online luôn fetch tươi, ghi đè cache)
// ---------------------------------------------------------------------------

export const CACHE_TTL_MS = {
  /** Danh mục ít đổi — giữ bản lưu lâu hơn. */
  categories: 7 * 24 * 60 * 60 * 1000,
  /** Expense list + stats: quá 24h không đáng tin — coi như không có cache. */
  expenses: 24 * 60 * 60 * 1000,
  stats: 24 * 60 * 60 * 1000,
} as const;

const DEFAULT_TTL_MS = CACHE_TTL_MS.expenses;

function ttlFor(key: string): number {
  if (key.includes("/categories")) return CACHE_TTL_MS.categories;
  if (key.includes("/stats")) return CACHE_TTL_MS.stats;
  if (key.includes("/expenses")) return CACHE_TTL_MS.expenses;
  return DEFAULT_TTL_MS;
}

// ---------------------------------------------------------------------------
// Eviction — chống store tăng vô hạn theo family × tháng × filter × page
// ---------------------------------------------------------------------------

export const CACHE_MAX_ENTRIES = 300;
export const CACHE_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
/** Vượt cap → xoá entry cũ nhất xuống con số này (80% cap — chống dao động). */
const EVICT_TARGET = Math.floor(CACHE_MAX_ENTRIES * 0.8);
const EVICT_THROTTLE_MS = 60_000;

let lastEvictAt = 0;

/** Xoá timestamp throttle (dùng cho test — không gọi trong production code). */
export function __resetEvictThrottle(): void {
  lastEvictAt = 0;
}

/**
 * Quét toàn bộ store cache:
 * - xoá entry già hơn CACHE_MAX_AGE_MS
 * - nếu còn vượt CACHE_MAX_ENTRIES → xoá entry cũ nhất (theo savedAt)
 *   xuống EVICT_TARGET
 * IndexedDB lỗi → im lặng bỏ qua.
 */
export async function evictCache(): Promise<void> {
  let entries: CacheEntry[];
  try {
    entries = await idbGetAll<CacheEntry>("cache");
  } catch {
    return;
  }

  const now = Date.now();
  const doomed = new Set<string>();
  for (const entry of entries) {
    if (now - Date.parse(entry.savedAt) > CACHE_MAX_AGE_MS) {
      doomed.add(entry.key);
    }
  }

  if (entries.length - doomed.size > CACHE_MAX_ENTRIES) {
    const remaining = entries
      .filter((e) => !doomed.has(e.key))
      .sort((a, b) => a.savedAt.localeCompare(b.savedAt));
    const excess = remaining.length - EVICT_TARGET;
    for (const entry of remaining.slice(0, excess)) {
      doomed.add(entry.key);
    }
  }

  for (const key of doomed) {
    try {
      await idbDelete("cache", key);
    } catch {
      // IndexedDB không khả dụng — bỏ qua
    }
  }
}

/** Eviction có throttle (tối đa 1 lần / 60s) — gọi sau mỗi lần ghi cache. */
export function evictCacheThrottled(): void {
  const now = Date.now();
  if (now - lastEvictAt < EVICT_THROTTLE_MS) return;
  lastEvictAt = now;
  void evictCache();
}

// ---------------------------------------------------------------------------
// Invalidation — xoá theo phạm vi sau mutation thành công
// ---------------------------------------------------------------------------

/**
 * Xoá các entry khớp predicate (gọi sau mutation thành công).
 * IndexedDB lỗi → im lặng bỏ qua.
 */
export async function invalidateCache(predicate: (key: string) => boolean): Promise<void> {
  let entries: CacheEntry[];
  try {
    entries = await idbGetAll<CacheEntry>("cache");
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!predicate(entry.key)) continue;
    try {
      await idbDelete("cache", entry.key);
    } catch {
      // IndexedDB không khả dụng — bỏ qua
    }
  }
}

// ---------------------------------------------------------------------------
// Đọc / ghi
// ---------------------------------------------------------------------------

export async function cacheSet(key: string, value: unknown): Promise<void> {
  const entry: CacheEntry = { key, savedAt: new Date().toISOString(), value };
  try {
    await idbPut("cache", entry);
  } catch {
    // IndexedDB không khả dụng — bỏ qua cache (không ảnh hưởng app)
    return;
  }
  evictCacheThrottled();
}

export interface CacheHit<T> {
  value: T;
  savedAt: string;
}

export async function cacheGet<T>(key: string): Promise<CacheHit<T> | null> {
  try {
    const entry = await idbGet<CacheEntry>("cache", key);
    if (!entry) return null;
    if (Date.now() - Date.parse(entry.savedAt) > ttlFor(key)) {
      // Quá TTL — xoá luôn, coi như không có cache
      void idbDelete("cache", key).catch(() => undefined);
      return null;
    }
    return { value: entry.value as T, savedAt: entry.savedAt };
  } catch {
    return null;
  }
}

/**
 * GET có cache: thành công → lưu cache + clear trạng thái "xem dữ liệu lưu";
 * server không đạt → trả bản lưu nếu còn trong TTL (kèm markServed để UI
 * cảnh báo). Không có bản lưu / quá TTL → ném lỗi như thường.
 */
export async function withReadCache<T>(key: string, fetchFn: () => Promise<T>): Promise<T> {
  try {
    const data = await fetchFn();
    void cacheSet(key, data);
    useCacheStatus.getState().clear();
    return data;
  } catch (err) {
    if (isServerUnavailable(err)) {
      const hit = await cacheGet<T>(key);
      if (hit !== null) {
        useCacheStatus.getState().markServed(hit.savedAt);
        return hit.value;
      }
    }
    throw err;
  }
}
