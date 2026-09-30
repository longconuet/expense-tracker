import { invalidateCache } from "./readCache";

/**
 * Invalidation cache theo phạm vi — gọi sau mutation thành công (online).
 * Key cache chỉ có hình dạng "GET /api/families/<fid>/<resource>?<qs>".
 */

export interface ParsedCacheKey {
  familyId: string;
  resource: "categories" | "expenses" | "stats" | "rental";
  params: URLSearchParams;
}

const KEY_PATTERN = /^GET \/api\/families\/([^/]+)\/(categories|expenses|stats|rental)(?:\?(.*))?$/;

/** Parse key cache; trả null cho key không khớp hình dạng chuẩn. */
export function parseCacheKey(key: string): ParsedCacheKey | null {
  const match = KEY_PATTERN.exec(key);
  if (!match) return null;
  return {
    familyId: match[1],
    resource: match[2] as ParsedCacheKey["resource"],
    params: new URLSearchParams(match[3] ?? ""),
  };
}

/**
 * Xoá cache expense/stats liên quan đến các tháng/ngày bị ảnh hưởng (theo family).
 * - Key KHÔNG có filter month/date (list không lọc) luôn bị xoá — list đó chắc
 *   chắn chứa khoản vừa thay đổi.
 * - `categories` không bị ảnh hưởng bởi mutation khoản chi.
 * Awaiting phía caller → đảm bảo cache sạch TRƯỚC KHI mutation trả về
 * (tránh race: fetch fallback chạy xen vào giữa lúc đang xoá).
 */
export async function invalidateExpenseCache(
  familyId: string,
  months: string[],
  dates: string[],
): Promise<void> {
  const monthSet = new Set(months);
  const dateSet = new Set(dates);
  await invalidateCache((key) => {
    const parsed = parseCacheKey(key);
    if (!parsed || parsed.familyId !== familyId) return false;
    if (parsed.resource === "categories") return false;
    const month = parsed.params.get("month");
    if (month !== null && !monthSet.has(month)) return false;
    const date = parsed.params.get("date");
    if (date !== null && !dateSet.has(date)) return false;
    return true;
  });
}

/**
 * Xoá TOÀN BỘ cache của family (3 resource) — dùng cho CRUD danh mục:
 * tên/icon danh mục được nhúng trong payload list expense + stats.
 */
export async function invalidateFamilyCache(familyId: string): Promise<void> {
  await invalidateCache((key) => {
    const parsed = parseCacheKey(key);
    return parsed !== null && parsed.familyId === familyId;
  });
}

/** Xoá cache tiền phòng trọ của family — gọi sau mọi mutation rental. */
export async function invalidateRentalCache(familyId: string): Promise<void> {
  await invalidateCache((key) => {
    const parsed = parseCacheKey(key);
    return parsed !== null && parsed.familyId === familyId && parsed.resource === "rental";
  });
}
