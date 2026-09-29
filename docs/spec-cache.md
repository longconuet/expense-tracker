# Spec — Chính sách cache dữ liệu (TTL, invalidation, eviction)

> Task: nâng cấp tầng cache đọc hiện có (stale-while-error, IndexedDB store `cache`)
> thành chính sách cache hoàn chỉnh: **TTL** cho bản fallback offline, **invalidation**
> sau mutation, **eviction** chống tăng vô hạn, **cảnh báo dữ liệu lưu** cho user.
> Chốt scope 29/09/2026.

## 1. Hiện trạng (đã có)

- `core/readCache.ts`: `withReadCache(key, fetchFn)` — online → luôn lấy server + ghi đè
  cache; server không đạt (mạng/5xx) → trả bản lưu (stale-while-error); 4xx không bao
  giờ fallback. Key = `"GET " + path đầy đủ kèm query`.
- **Không có**: TTL (bản lưu có thể cũ hàng tuần), eviction (store tăng vô hạn theo
  `family × tháng × filter × page`), invalidation sau mutation, thông báo cho user khi
  xem dữ liệu lưu.
- `core/AppShell.tsx`: đã có banner toàn cục khi `!online` ("Không có mạng — đang xem
  dữ liệu lưu trước") + banner khoản chờ đồng bộ.
- API: không set bất kỳ `Cache-Control` nào.

## 2. Quyết định thiết kế (đã duyệt)

| Điểm | Quyết định |
|---|---|
| Scope | Chỉ frontend + `Cache-Control: no-store` cho API. **Không** backend cache (Redis/ETag/in-memory), **không** thêm thư viện query |
| Chiến lược online | Giữ nguyên: online → luôn lấy server (fresh). Cache chỉ là fallback khi server không đạt. Không làm stale-while-revalidate |
| TTL fallback | `expenses`/`stats`: **24h** · `categories`: **7 ngày** · key khác: 24h. Bản lưu quá TTL → coi như không có cache (hiện lỗi như hiện nay) |
| Eviction | Cap **300 entries** (vượt → xoá entry cũ nhất xuống còn 240) + xoá entry **> 14 ngày**. Chạy: khi app khởi động + throttled 60s sau mỗi lần ghi |
| Invalidation | Xoá key theo phạm vi `family + tháng + ngày` sau mutation thành công online; category CRUD → xoá **toàn bộ** cache của family |
| Cảnh báo dữ liệu lưu | Mở rộng banner toàn cục trong AppShell: thêm giờ lưu + variant "máy chủ không phản hồi" (5xx mà mạng vẫn có) |

## 3. Thay đổi

### FE — `apps/web`

| File | Thay đổi |
|---|---|
| `src/core/api.ts` | Chuyển `isServerUnavailable` từ `syncQueue.ts` về đây (thuộc về ngữ nghĩa `ApiError`). **Refactor thuần, không đổi hành vi** — phá cycle import `readCache ↔ syncQueue` |
| `src/core/cacheStatus.ts` **(mới)** | Store Zustand nhỏ `useCacheStatus: { servedFromCacheAt: string \| null, markServed(savedAt), clear() }`. `clear()` có guard 2s: chỉ xoá nếu mark cũ hơn 2000ms (tránh race 2 fetch song song: 1 fallback + 1 OK) |
| `src/core/readCache.ts` | +TTL (`CACHE_TTL`, `ttlFor(key)`), +eviction (`evictCache` + `evictCacheThrottled`, hằng `CACHE_MAX_ENTRIES=300`, `CACHE_MAX_AGE_MS=14d`, target 240), +`invalidateCache(predicate)`. `cacheGet` trả `{ value, savedAt }` (bỏ entry quá TTL + xoá luôn). `withReadCache`: fallback → `markServed(savedAt)`; thành công → `clear()`; ghi cache → gọi eviction throttled |
| `src/core/cacheInvalidate.ts` **(mới)** | `parseCacheKey` (regex key chuẩn), `invalidateExpenseCache(familyId, months, dates)`, `invalidateFamilyCache(familyId)`. Fire-and-forget |
| `src/core/dataApi.ts` | Gắn invalidation: `createExpense` (OK) → tháng + ngày của khoản; `updateExpense` → tháng/ngày **cũ + mới**; `deleteExpense` → tháng + ngày khoản; `createCategory`/`updateCategory`/`deleteCategory` → toàn bộ cache family. Đổi signature: `updateExpense(expenseId, familyId, input, previousDate)`, `deleteExpense(expenseId, familyId, date)` — `Expense` không có field `familyId`, caller (EditPage/HistoryPage) có sẵn `activeFamilyId` |
| `src/core/syncQueue.ts` | Sau flush ≥1 khoản thành công → `invalidateExpenseCache` theo tháng/ngày các khoản đã sync (mỗi family). Import `isServerUnavailable` từ `api.ts` |
| `src/core/dates.ts` | +`monthOf(date)` (YYYY-MM-DD → YYYY-MM) · +`formatTimeShort(iso)` (→ "HH:mm", vi-VN) |
| `src/core/AppShell.tsx` | Banner: giữ dòng offline cũ + nối `servedFromCacheAt` ("…lưu trước lúc HH:mm"); thêm dòng mới khi `online && servedFromCacheAt` ("Máy chủ không phản hồi — đang xem dữ liệu lưu lúc HH:mm") |
| `src/App.tsx` | Mount: `void evictCache()` (dọn entry >14 ngày + vượt cap khi mở app) |

### BE — `apps/api`

| File | Thay đổi |
|---|---|
| `src/app.ts` | Middleware `app.use("/api", ...)`: `Cache-Control: no-store` cho mọi response API (data có session — chặn proxy/CDN cache nhầm). Đặt trước các router |

## 4. Chính sách cache chi tiết

### Key

Không đổi định dạng: `"GET /api/families/<fid>/categories"`,
`"GET /api/families/<fid>/expenses?<qs>"`, `"GET /api/families/<fid>/stats?<qs>"`.
`parseCacheKey` chỉ nhận key khớp `^GET /api/families/<fid>/(categories|expenses|stats)(\?.*)?$`;
key lạ → không parse được → không bị invalidation chạm (chỉ chịu eviction/TTL).

### TTL (chỉ áp dụng cho bản fallback)

- `cacheGet` trả `null` + xoá entry nếu `now - savedAt > ttl(key)`.
- Online thành công ghi đè cache không phụ thuộc TTL (luôn tươi).

### Eviction

- `evictCache()`: đọc toàn bộ store `cache` → xoá entry > 14 ngày → nếu còn vượt 300
  → xoá entry cũ nhất (theo `savedAt`) xuống còn 240. IDB lỗi → im lặng bỏ qua.
- `evictCacheThrottled()`: tối đa 1 lần / 60s (module-level timestamp).
- Trigger: `App.tsx` mount (lần đầu, không throttle) + sau mỗi `cacheSet` (throttled).
- Không cần index/cursor: store ≤ vài trăm entry, `getAll` tuyến tính chấp nhận được.

### Invalidation

| Sự kiện (thành công) | Xoá cache (phạm vi family) |
|---|---|
| `createExpense` online | `expenses` có `month=<M>` (hoặc không có `month`) + `date=<D>` (hoặc không có `date`); `stats?month=<M>` (hoặc stats không tháng). Không chạm `categories` |
| `updateExpense` | Như createExpense, với `M/D = {cũ, mới}` (cũ = `previousDate`, mới = `expense.date` server trả về) |
| `deleteExpense` | Như createExpense, `M/D` từ khoản bị xoá |
| `createCategory` / `updateCategory` / `deleteCategory` | **Toàn bộ** key của family (3 resource) — tên/icon danh mục nhúng trong payload expense list + stats `byCategory` |
| Flush offline queue ≥1 khoản | Như createExpense, gom `M/D` của các khoản đã sync theo từng family |

- Khoản nhập khi **offline** (vào hàng đợi) KHÔNG invalidation — server chưa có gì mới.
- Predicate khớp: key cùng family + resource ∈ {expenses, stats} + (`month` khớp nếu có)
  + (`date` khớp nếu có). List không lọc tháng/ngày (không có `month`/`date` trong key)
  bị xoá bởi mọi mutation khoản của family — đúng vì list đó chắc chắn chứa khoản mới.
- **Await trong mutation** (không fire-and-forget) — đảm bảo cache sạch TRƯỚC KHI
  mutation trả về, tránh race: fetch fallback (server vừa sập) chạy xen vào
  giữa lúc đang xoá → trả dữ liệu cũ. Chi phí ~vài ms (store nhỏ).

### Trạng thái "đang xem dữ liệu lưu"

- `withReadCache` fallback thành công → `markServed(savedAt)`; fetch live OK → `clear()`.
- `clear()` guard 2s (mark mới hơn 2s → giữ) — tránh 2 fetch song song của 1 trang
  (1 OK + 1 fallback) làm banner nhấp nháy / tắt nhầm.
- Banner AppShell hiện khi `!online` **hoặc** `servedFromCacheAt !== null`:
  - `!online`: "Không có mạng — đang xem dữ liệu lưu trước" + " lúc HH:mm" nếu có mark.
  - `online && mark`: "Máy chủ không phản hồi — đang xem dữ liệu lưu lúc HH:mm".
- Mark tự hết ý nghĩa khi fetch live tiếp theo OK (sau >2s) hoặc user đổi trang.

## 5. Test cases

### Unit — `readCache` (vitest, mock `core/db` như hiện tại)

1. `cacheSet` + `cacheGet`: trả `{ value, savedAt }` đúng.
2. `cacheGet` key chưa lưu → `null`.
3. `cacheGet` entry quá TTL (viết `savedAt` cũ vào map mock) → `null` + gọi `idbDelete`.
4. TTL theo loại key: key `.../categories` chịu 7 ngày, `.../expenses` 24h (entry 25h tuổi với expenses → null; entry 25h tuổi với categories → vẫn trả).
5. `withReadCache` OK → trả data + ghi cache + `clear()` status.
6. `withReadCache` fallback (mạng/5xx) + có bản lưu trong TTL → trả bản lưu + `markServed(savedAt)`.
7. `withReadCache` fallback + bản lưu quá TTL → **ném lỗi** (không trả dữ liệu cũ).
8. `withReadCache` 4xx → ném lỗi, không fallback (giữ test cũ).
9. `invalidateCache(predicate)` → xoá đúng các key khớp, giữ key không khớp.
10. Eviction: 301 entry → `evictCache` xoá entry cũ nhất xuống 240; entry >14 ngày bị xoá bất kể số lượng.
11. `evictCacheThrottled`: 2 lần gọi liên tiếp → chỉ 1 lần thực sự quét (mock `idbGetAll`).

### Unit — `cacheStatus`

12. `markServed` → `servedFromCacheAt` = giá trị truyền.
13. `clear()` sau mark >2s → `null`; `clear()` trong 2s (fake timers) → giữ mark.

### Unit — `cacheInvalidate`

14. `parseCacheKey`: key hợp lệ (có/không có query) → đúng; key lạ → `null`.
15. `invalidateExpenseCache("f1", ["2026-09"], ["2026-09-05"])`: xoá `expenses?month=2026-09&...`, `expenses?date=2026-09-05`, `stats?month=2026-09`, list không filter; **giữ** `expenses?month=2026-08`, `date=2026-09-06`, key family khác, `categories`.
16. `invalidateFamilyCache("f1")`: xoá mọi key của f1 (3 resource), giữ family khác.

### Unit — `dataApi` (bổ sung vào `dataApi.test.ts`)

17. `createExpense` OK → cache `expenses?month=<M>` + `stats?month=<M>` của family bị xoá (viết cache trước, gọi create, kiểm tra map trống).
18. `updateExpense` đổi tháng (09→10) → xoá cả cache tháng 09 và 10.
19. `deleteExpense` → xoá cache tháng + ngày của khoản.
20. `updateCategory` → xoá toàn bộ cache family (kể cả `expenses`).
21. `createExpense` offline (queue) → **không** xoá cache.

### Unit — `syncQueue` (bổ sung)

22. Flush 2 khoản (2 tháng khác nhau) thành công → gọi invalidate theo đúng 2 tháng.

### Unit — `AppShell` (bổ sung)

23. `online && servedFromCacheAt` → banner "Máy chủ không phản hồi … lúc HH:mm".
24. `!online && servedFromCacheAt` → banner offline có "lúc HH:mm".
25. `!online && !servedFromCacheAt` → banner offline không giờ (giữ hành vi cũ).

### Integration — API (supertest)

26. Mọi endpoint (`/api/health`, `/me`, expenses list...) trả header `Cache-Control: no-store` (kể cả response lỗi 401/404).

### E2E — Playwright (`offline.spec.ts` bổ sung)

27. Server down (route abort) + data đã cache → banner "dữ liệu lưu lúc HH:mm" hiện; phục hồi + reload → banner mất.
28. Mutation online (thêm khoản) rồi server down → mở trang lại → KHÔNG thấy số liệu cũ thiếu khoản (cache đã invalidate) — banner offline hiện với dữ liệu đã bao gồm khoản mới nếu đã fetch lại lần cuối… (kiểm tra cụ thể: xoá cache → server down → fetch fallback trả dữ liệu **đã có** khoản vừa thêm chỉ nếu từng fetch lại sau mutation; test theo scenario: fetch OK (có khoản) → mutation → server down → banner hiện + dữ liệu đúng).

## 6. Vượt ngoài phạm vi (YAGNI — ghi rõ để không drift)

- **Stale-while-revalidate khi online** (hiện cache ngay rồi refresh ngầm).
- **Backend cache**: dataset per-family nhỏ, query đã có index `(familyId, date)`;
  invalidation giữa các thành viên family + Vercel serverless (in-memory không ổn định)
  không đáng.
- **TanStack Query / đổi tầng query**: va chạm kiến trúc với offline queue.
- Đồng bộ invalidation giữa các tab (BroadcastChannel) — IndexedDB đã share, không đáng.
- `fetchExpense(id)` / `fetchFamilyDetail` vẫn **không** qua read cache (giữ nguyên).
