# Handoff — trạng thái công việc

> File checkpoint để session sau chỉ cần đọc file này (không dựa vào nhớ).
> Cập nhật mỗi khi 1 task WBS xong.

## Cập nhật: 23/09/2026 — sau **Polish WBS 9** (HOÀN TẤT): keypad số to cho `/add`

## Đã xong
- [x] **Task 1**: Scaffold monorepo (web + api + shared)
- [x] **Task 2**: Prisma schema (5 model) + migration + seed idempotent
- [x] **Task 3**: API Auth (register/login/refresh-rotation/logout + /me)
- [x] **Task 4**: API Family + mã mời
- [x] **Task 5**: API Categories + Expenses (CRUD, phân quyền người-tạo/owner, lọc, phân trang)
- [x] **Task 6**: API Stats
- [x] **Task 7**: FE màn auth (API client, auth store, guard, routes, 4 màn + onboarding)
- [x] **Task 8**: FE app shell + bottom nav + design tokens + dark mode + **5 màn thật** (`/`, `/add`, `/stats`, `/history`, `/me`) — chi tiết ở commit tương lai, tóm tắt:
  - Design tokens Tailwind v4 light/dark (`index.css`), theme store + `applyTheme` trước render
  - `shared/ui/`: Button, Input, Card, Spinner, RoleBadge, icons SVG inline (không thêm dependency)
  - AppShell: header + family switcher + bottom nav 5 ô; `/onboarding` là anh em của shell
  - Data layer `dataApi.ts` (1 nơi map path + shape) + `api.ts` (envelope, `fetchWithRetry` 401→refresh, `apiFetchWithMeta`)
- [x] **Task 12**: PWA — manifest + icons + offline queue (chi tiết dưới)
- [x] **Polish WBS 9** (chi tiết dưới): `/add` nâng cấp thành màn keypad full-screen

### Chi tiết Polish WBS 9 — keypad số to cho `/add`
- **`features/expenses/Keypad.tsx`** — bàn phím số **64px+** (11 phím: 1-9, ⌫, 0 nằm ngang 2 ô), presentational (prop `onKey`, `disabled`), feedback `active:scale` + màu primary khi chạm. Phím ⌫ có `aria-label="Xoá 1 chữ số"`
- **`features/expenses/haptic.ts`** — `haptic(pattern)`: `navigator.vibrate` (no-op trên desktop) — rung khi chạm phím số/danh mục/nút Lưu
- **`AddPage.tsx`** viết lại theo spec §6.1:
  - Số tiền: **hiển thị lớn 5xl format vi-VN** (VD `123.456 ₫`), `aria-live="polite"` — **không có input text** (bỏ bàn phím hệ thống cho số tiền); tối đa 9 chữ số (999.999.999 ₫); backspace cắt chữ cuối
  - **Bàn phím vật lý (desktop)**: phím số + Backspace gõ thẳng vào số tiền (listener `window`, bỏ qua khi focus ô ghi chú)
  - Danh mục: **cuộn ngang, viên tròn 68px** (emoji 4xl) + nhãn, `aria-pressed`, viền/màu primary khi chọn
  - Ngày mặc định hôm nay (input date — chạm để đổi, giữ như cũ) + ghi chú optional
  - Nút **"Lưu khoản chi" disable khi thiếu** số hoặc danh mục; **sáng lên** (`shadow-lg shadow-primary/25`) khi đủ → 1 chạm gửi
- **`shared/ui/icons.tsx`**: thêm `BackspaceIcon`
- Test: `Keypad`(3) + `AddPage` viết lại (7: payload qua keypad, nút disable→enable, backspace, cap 9 chữ số, phím vật lý, offline, API error)
- **Verified build thật** (preview :4173): phím cao 64px, 11 phím, 7 vòng danh mục, gõ 32500 + chọn Đi lại → Lưu → POST 201, home hiện 32.500₫; xoá khoản smoke sau khi verify
- **Tổng repo: 155/155 test pass (api 60, web 91, shared 4), tsc + lint sạch, build OK**

### Chi tiết Task 12
**12a — Manifest + icons + nút cài app**
- `apps/web/scripts/generate-icons.mjs` — sinh icon **không dependency**: PNG encoder tối giản (zlib + CRC32 tự viết) + vẽ donut trắng trên nền teal `#0D9488` (nội dung trong safe zone maskable: r 0.30 < 0.40). Output: `public/icons/icon-192.png`, `icon-512.png`, `apple-touch-icon.png` (180), `favicon.png` (64). Script: `pnpm --filter @expense-tracker/web icons` — **icon đã commit, build không cần chạy lại**
- `vite.config.ts` VitePWA: manifest đầy đủ (`lang: "vi"`, `scope`, 3 icons gồm 512 `purpose: "any"` + `purpose: "maskable"`), `workbox.navigateFallback: "/index.html"` (app shell offline), `registerType: "autoUpdate"`
- `index.html`: `<link rel="icon">` + `apple-touch-icon` + `mobile-web-app-capable`
- Nút **"Cài ứng dụng"** ở `/me` (`features/me/useInstallPrompt.ts` — giữ event `beforeinstallprompt`, chỉ `prompt()` khi user bấm; trình duyệt không có event → nút ẩn)
- Verified dist thật: manifest.webmanifest đúng shape, 4 PNG valid đúng kích thước, **SW active + manifest 3 icons khi chạy build** (browser preview :4173)

**12b — Hàng đợi ghi offline (write queue)**
- `core/db.ts` — wrapper IndexedDB tối giản, DB `etracker-offline` v1, 2 stores: `expenses` (keyPath `id`), `cache` (keyPath `key`). Không có IndexedDB (jsdom/private mode) → reject, caller phải catch
- `core/syncQueue.ts` — `enqueueExpense` (lưu snapshot `category {name, icon}` + `queuedAt`), `flushQueue` (FIFO, dedup 1 vòng duy nhất khi gọi song song):
  - Thành công → gỡ khỏi queue
  - **Lỗi mạng/5xx → dừng ngay** (giữ nguyên các khoản còn lại)
  - **4xx → giữ khoản đó, tiếp tục khoản sau**
  - Sync ≥ 1 khoản → fire event `etracker:expenses-synced`
  - `isServerUnavailable(err)`: `ApiError` với status 0 hoặc ≥ 500 (5xx cover proxy trả 500 khi API down)
  - `useSyncStore` (zustand): `pendingCount` + `bump()`
- `core/syncManager.ts` — `initSync()` (gọi 1 lần từ `App.tsx`): flush khi khởi động + event `online` + **interval 30s khi còn khoản chờ** (cover case thiết bị vẫn "online" nhưng server down — event `online` không fired)
- `dataApi.createExpense` — signature mới: nhận `category: Category` (đầy đủ), trả `{ expense, savedOffline }`. Server không đạt → enqueue + `savedOffline: true`; 4xx vẫn ném lỗi
- **Banner header** (AppShell): `N khoản chi đang chờ đồng bộ khi có mạng` (pendingCount > 0)
- **Refetch sau sync**: hook `core/useRefetchOnSync` — Home/History/Stats có `reloadKey` tăng khi event `etracker:expenses-synced` fired
- AddPage: chọn danh mục → truyền `category` object; offline cũng về `/` (banner báo trạng thái)

**12c — Read cache (API data cache ngắn)**
- `core/readCache.ts` — `withReadCache(key, fetchFn)`: GET thành công → lưu `store cache` (key = `GET ` + path kèm query); **server không đạt (0/5xx) → trả bản lưu trước** (stale-while-error, không TTL); **4xx không bao giờ fallback**; không có bản lưu → ném lỗi như thường
- `dataApi`: `fetchCategories`, `fetchExpenses` (kèm `meta` phân trang), `fetchStats` đều qua `withReadCache`
- `core/useOnline.ts` + banner AppShell: **"Không có mạng — đang xem dữ liệu lưu trước"** khi `navigator.onLine = false`
- **App shell cache vĩnh viễn**: generateSW precache 7 entries (733 kB) + `navigateFallback` — đã verify SW active trong build

**Verified browser thật (build production qua `vite preview` :4173, SW active)**
- Online: add 75k Ăn uống → home tổng 75.000₫ ✓
- **Kill API :3001** → add 150k Mua sắm → khoản vào queue, banner "1 khoản chi đang chờ đồng bộ khi có mạng" ✓, home **vẫn hiển thị data cũ (75k) không crash** (read cache) ✓
- **Khởi động lại API** → reload → auto-sync: banner mất, home = **225.000₫** (150k + 75k) ✓
- Xoá 2 khoản smoke qua API — dev DB về 0 khoản
- **Tổng repo: 149/149 test pass (api 60, web 85, shared 4), tsc + lint sạch, build OK**
- Test web mới: `syncQueue`(8) · `db`(3 — fake IndexedDB in-memory) · `readCache`(7) · `useInstallPrompt`(4) + mở rộng `dataApi`(12) · `AppShell`(5 — banner) · `AddPage`(4 — savedOffline) · `MePage`(6 — nút cài)

### Lưu ý kỹ thuật Task 12
- **Test offline trong dev**: kill API :3001 → vite proxy trả **500** (không phải network error) → chính vì vậy `isServerUnavailable` include 5xx. Script kill: `node kill-port.cjs 3001` (netstat + taskkill)
- **ESLint 9 flat config** bỏ `/* eslint-env */` comment — node globals cho script `.mjs` phải khai trong `eslint.config.mjs` (block `files: ["apps/web/scripts/**/*.mjs"]`)
- **Vitest**: db mock dùng `vi.hoisted` cho Map in-memory; flush test cần `vi.waitFor` trước khi release promise (mock apiFetch gọi sau microtask của `getPendingExpenses`)
- **`vite preview`** (:4173) có `preview.proxy /api → :3001` (thêm trong Task 12) — dev server :5173 không có SW (devOptions disabled), **test PWA thật phải qua preview build**
- Vite tự đổi port khi port đang chiếm (5173 in use → chạy trên 5174) — đừng giả định port cứng

### Chênh với spec đầy đủ plan.md §6 (còn để polish — chưa làm)
- **WBS 10 Home/History**: Home hiện 5 khoản gần nhất **flat** (plan: nhóm theo ngày); History **flat list** + xoá (plan: **nhóm theo ngày có tiểu kết**, chạm món để **sửa**). Sửa khoản (edit) chưa có UI (API `PUT /expenses/:id` đã sẵn).
- Offline: khoản chờ sync **không hiển thị** trong list (chỉ có banner đếm) — đủ cho MVP; muốn hiển thị thì merge queue vào list ở UI
- Khoản queue gặp 4xx vĩnh viễn (VD danh mục bị xoá) sẽ ở lại queue, retry lại mỗi 30s — MVP chấp nhận, cần UI quản lý queue thì làm sau

## Đang làm
- (không) — chờ user chọn bước kế

## Task kế tiếp: **Polish WBS 10** (hoặc commit khối Task 8+12+9)
1. **Commit** (user đang giữ — repo **chưa có commit nào**): khối Task 8 + màn thật + Task 12 + WBS 9 → 1 commit Conventional Commits vào `develop` (VD `feat: app shell, 5 màn chính, dark mode, PWA offline và keypad nhập chi (Task 8, 9, 12 WBS)`) — **không** Co-Authored-By/nhãn AI
2. **WBS 10**:
   - Home + History: **nhóm khoản theo ngày có tiểu kết** (tiêu đề ngày "Hôm nay / Hôm qua / 23/09" + tổng ngày)
   - **Edit khoản**: chạm món → màn sửa (keypad + danh mục + ngày + note, `PUT /expenses/:id` đã sẵn) — route `/expenses/:id/edit` trong shell

## Quyết định đã chốt
- Màu chính: teal — light `#0D9488` / dark `#2DD4BF`; dark mode theo class, toggle màn "Tôi", lưu localStorage (key `etracker-theme`)
- Access token: in-memory; chỉ persist `activeFamilyId` (key `etracker-auth`)
- Category mặc định: Ăn uống 🍜 · Đi lại 🚗 · Gia đình ⚡ · Sức khỏe 💊 · Vui chơi 🎬 · Mua sắm 🛒 · Khác 📦
- Quyền sửa/xoá khoản chi: người tạo + owner (API enforce; FE chỉ hiện nút khi `owner || createdByName === user.name`)
- Auth: JWT access (in-memory FE) + refresh cookie httpOnly, rotation, stateless
- DB: SQLite dev → PostgreSQL prod (Prisma 6.19)
- API envelope: `{ success, data, error, meta }`
- **Offline (Task 12)**: ghi offline trigger = `ApiError` status 0 (mạng) hoặc ≥ 500 (5xx); 4xx **không** bao giờ ghi offline / fallback cache. Read cache = stale-while-error, không TTL. Sync trigger = khởi động app + event `online` + interval 30s khi còn khoản chờ. IndexedDB DB `etracker-offline` (stores `expenses`, `cache`)
- **Icon PWA**: sinh bằng `scripts/generate-icons.mjs` (chạy lại nếu đổi design: donut trắng trên nền teal), file PNG commit vào repo
- Commit: Conventional Commits, thẳng `develop`, 1 task = 1 commit (**vẫn tạm dừng theo yêu cầu user — repo chưa có commit nào**)

## Ghi chú kỹ thuật (môi trường)
- Node 24, pnpm 12.5.1, git 2.55 (repo init nhánh `develop`, **chưa commit**)
- Pin: typescript ^5.9.3, Prisma 6.19, zod 4; React 19.3, Vite 8.3, Vitest 5, Tailwind 4.3, Express 5.2, react-router 7.18, zustand 5, recharts 3.10, vite-plugin-pwa 1.3
- Express 5: async handler throw → tự vào error handler; `req.params.*` type `string | string[]`; middleware truyền **function**
- Prisma: update relation dùng `category: { connect: { id } }`
- Test api: DB `prisma/test.db` reset bằng globalSetup
- Alphabet mã mời: `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` — regex `/^[A-HJ-MN-Z2-9]{6}$/`
- **Vitest web**: jsdom không auto-cleanup RTL — test nhiều render trong 1 file phải `afterEach(cleanup)`; module state là singleton → mỗi scenario render `<App/>` ở file test riêng
- **jsdom không có IndexedDB** — test db/syncQueue/readCache mock `core/db` (vi.hoisted Map) hoặc stub fake IDB (xem `__tests__/db.test.ts` — fake đủ dùng: open/createObjectStore/transaction/put/get/getAll/delete)
- **jsdom chặn form submit** khi có input `required` rỗng → field validate bằng JS thì không dùng `required`
- **recharts 3 + tab ẩn**: shape (sector/bar) rỗng do rAF không chạy trong tab hidden (Review pane) — **artifact môi trường, không phải bug**; shim `requestAnimationFrame = setTimeout(cb,16)` để verify; tab visible render bình thường
- **Dev server** (đang chạy background): api :3001 · web dev :5174 (5173 bị zombie chiếm → vite tự nhảy 5174) · **preview PWA :4173** (build + SW + proxy API)
- **Test account dev DB**: final@test.com / `MatKhau123!` (family "Nhà Final", owner, name "User Final"); còn smoke@test.com, smoke2, smoke3 (cùng mật khẩu). Nhà Final hiện **0 khoản chi**
- **Windows**: `del`/`node -e` path absolute hay lỗi quote (cmd) → viết file `.cjs` tạm rồi `node <file>`; findstr quote cũng hay hỏng → để output nguyên, grep tay
- **Browser tool**: gọi qua Code Mode (`tools.browser["tabs.open"]`...), không gọi trực tiếp; `browser.screenshot` fail "needs a visible tab" → verify bằng `browser.evaluate`; input id tiếng Việt (VD `input-số-tiền`) hay lệch normalization khi truyền qua script → chọn input bằng `inputMode`/vị trí; click `a[href="/add"]` để SPA nav (giữ state page)

## Bản đồ API hoàn chỉnh (cho FE gọi)
- `POST /api/auth/register` {name,email,password} → 201 {user, accessToken} — 409 EMAIL_EXISTS
- `POST /api/auth/login` {email,password} → {user, accessToken} — 401 INVALID_CREDENTIALS
- `POST /api/auth/refresh` (cookie tự gửi) → {user, accessToken} — 401 UNAUTHORIZED
- `POST /api/auth/logout`
- `GET /api/me` → {user, families: Family[]} — family có `myRole`
- `POST /api/families` {name} → 201 {family} (kèm members[])
- `POST /api/families/join` {code} → 201 {family} — 404 FAMILY_NOT_FOUND, 409 ALREADY_MEMBER
- `GET /api/families/:id` → {family (kèm members[])}
- `POST /api/families/:id/regenerate-code` (owner) → {inviteCode}
- `DELETE /api/families/:id/members/:userId`
- `DELETE /api/families/:id` (owner, family rỗng)
- `GET/POST /api/families/:id/categories`, `PUT/DELETE .../categories/:categoryId`
- `GET/POST /api/families/:id/expenses?month&categoryId&page&pageSize` → {expenses, meta}
- `POST /api/expenses` {familyId,categoryId,amount,date,note?} → 201 {expense}
- `GET/PUT/DELETE /api/expenses/:id`
- `GET /api/families/:id/stats?month` → MonthlyStats
