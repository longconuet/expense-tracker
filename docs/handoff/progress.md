# Handoff — trạng thái công việc

> File checkpoint để session sau chỉ cần đọc file này (không dựa vào nhớ).
> Cập nhật mỗi khi 1 task WBS xong.

## Cập nhật: 23/09/2026 — **Phase 3 XONG**: Vercel production deployment xanh — API + web + PWA + Supabase **verify thật** (`VERCEL_SMOKE_ALL_PASS` + `PHASE3_VERIFY_ALL_PASS`) — **sẵn Phase 4 (GitHub Secrets)**

> Trước đó (cùng ngày): WBS 14 hoàn tất (Polish + hướng dẫn local + guide deploy) — toàn bộ 14 WBS xong.

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
- [x] **Polish WBS 10** (chi tiết dưới): Home/History nhóm theo ngày có tiểu kết + màn sửa khoản
- [x] **WBS 13** (chi tiết dưới): E2E Playwright 8 test (auth, khoản chi, offline)
- [x] **WBS 14** (chi tiết dưới): Polish (lazy StatsPage) + README hướng dẫn local + `docs/deploy.md` (Docker đã test thật, Vercel/Supabase guide)
- [x] **Guide deploy Vercel + Supabase + CI/CD** (post-WBS, chi tiết dưới): `docs/deploy-vercel.md` 5 phase + file deploy sẵn trong repo
- [x] **Phase 1** (post-WBS, chi tiết dưới): chuyển toàn bộ project từ SQLite → PostgreSQL (điều kiện deploy Vercel+Supabase)
- [x] **Phase 2** (post-WBS): tạo Supabase project + verify 2 connection string (chi tiết dưới)
- [x] **Phase 3 — Fix deployment Vercel** (post-WBS, chi tiết dưới): chẩn đoán + sửa 2 lỗi deployment (API 500 + web 404) — verified local đủ bộ

### Chi tiết Polish WBS 10 — nhóm theo ngày + edit khoản
- **`core/expenseGroups.ts`** (mới) — `groupByDay(expenses) → DayGroup[]` (`{ date, label, total, expenses }`, giữ thứ tự input = date desc của API) + `dayLabel(date)` = "Hôm nay" / "Hôm qua" / `shortDate` ("22/09", kèm năm nếu khác năm). Dùng chung 2 màn
- **`core/dates.ts`** — thêm `yesterday()`
- **`dataApi.ts`** — thêm `fetchExpense(id)` (GET) + `updateExpense(id, { categoryId, amount, date, note })` (PUT; `note: null` = xoá ghi chú)
- **HomePage** — khối "Gần đây" (5 khoản) nhóm theo ngày: header nhóm (label + tiểu kết tổng ngày), dòng khoản bỏ `shortDate` (đã có ở header)
- **HistoryPage** — list nhóm theo ngày có tiểu kết; **chạm khoản → điều hướng `/expenses/:id/edit`** (chỉ owner hoặc người tạo — rule khớp API); nút xoá giữ nguyên (sibling của link, không nest button trong anchor)
- **`features/expenses/EditPage.tsx`** (mới) — cùng bố cục AddPage (display 5xl + keypad + danh mục cuộn ngang + ngày + ghi chú), pre-fill từ `GET /expenses/:id`, lưu `PUT /expenses/:id` → về `/history`; 404 → thông báo + link "Quay lại lịch sử"; 403 → hiện message API; **offline: PUT fail → hiện lỗi** (chưa queue cho edit — MVP)
- **`router.tsx`** — thêm route `/expenses/:id/edit` trong AppShell
- Test mới (14): `expenseGroups`(4) · `EditPage`(5: pre-fill, payload PUT, disable khi 0, 403, 404) · `HistoryPage`(+2: nav sang edit, member không phải link) · `HomePage`(+1: 2 nhóm + tiểu kết) · `dataApi`(+2: GET/PUT)
- **Verified build thật** (preview :4173, SW unregister + xoá cache trước): tạo 2 khoản (hôm nay 32.500 Ăn uống, hôm qua 45.000 Đi lại) → home + history hiện đúng 2 nhóm "Hôm nay/Hôm qua" với tiểu kết; chạm khoản → edit pre-fill đủ; sửa 32.500 → 30.000 → Lưu → về history, nhóm "Hôm nay" = 30.000₫; xoá 2 khoản smoke → 0 khoản
- **Tổng repo: 169/169 test pass (api 60, web 105, shared 4), tsc + lint sạch, build OK**

### Chi tiết WBS 13 — E2E Playwright
- **Môi trường tách biệt** (không đụng dev server/DB): API :3101 + SQLite `prisma/e2e.db` (tạo mới bằng `db push --force-reset` mỗi lần chạy) · web vite dev :5199 (strictPort) · proxy `/api` → :3101 qua env **`VITE_API_PROXY_TARGET`** (mới — `vite.config.ts`, default vẫn :3001)
- `apps/web/playwright.config.ts` — 2 `webServer` (API: db push + `tsx watch` · web: vite :5199), chromium, `workers: 1` + `fullyParallel: false` (1 DB e2e dùng chung — chạy tuần tự), `baseURL :5199`
- `apps/web/e2e/` — **8 test / 3 spec** + `helpers.ts` (registerAndCreateFamily, typeKeypad, backspace, pickCategory, addExpense, anotherDayInCurrentMonth, newAccount):
  - `auth.spec.ts` (3): đăng ký → tạo family → home · reload → phiên khôi phục (refresh cookie) · sai mật khẩu → lỗi "Email hoặc mật khẩu không đúng"
  - `expense-flow.spec.ts` (4): nhập chi keypad → nhóm "Hôm nay" + tiểu kết · 2 khoản 2 ngày → nhóm theo ngày · chạm khoản → edit pre-fill → đổi số tiền → lưu → lịch sử cập nhật · xoá có confirm
  - `offline.spec.ts` (1): chặn POST `/api/expenses` (route.abort) → khoản vào queue + banner "chờ đồng bộ"; unblock + reload → **tự sync lúc khởi động**, banner mất, khoản hiện ở home
- **Bug app phát hiện + fix nhờ E2E**: `App.tsx` gọi `initSync()` → `flushQueue()` **trước** `bootstrap()` xong → access token in-memory trống → `doFlush` skip (guard `!getAccessToken()`) → khoản offline phải đợi tới **interval 30s** mới sync (spec: sync ngay khi khởi động). Fix: `bootstrap().then(() => flushQueue())` — listener online/interval vẫn đăng ký ngay (doFlush tự guard)
- `vitest.config.ts`: thêm `include: ["src/**/*.{test,spec}.{ts,tsx}"]` — tránh Vitest nạp luôn `e2e/*.spec.ts`
- Scripts: `pnpm --filter @expense-tracker/web e2e` · root: `pnpm test:e2e`
- `.gitignore`: + `playwright-report/`, `test-results/`
- **Kết quả: E2E 8/8 pass (~16s) · unit 169/169 · tsc + lint + build OK**
- Chromium Playwright đã cài máy (`%USERPROFILE%\AppData\Local\ms-playwright`) — chạy lại E2E không cần cài

### Chi tiết WBS 14 — Polish + hướng dẫn local + guide deploy
- **Polish — lazy load StatsPage** (`router.tsx`): `lazy(() => import(...StatsPage))` + Suspense (fallback Spinner) — recharts (~700 kB) tách khỏi main bundle: **main 735 → 365 kB**, StatsPage thành chunk riêng (370 kB), hết build warning >500 kB; verified browser thật (dev `:5173` — `/stats` render đúng, empty state tháng 9/2026)
- **`README.md`** viết lại — hướng dẫn chạy local đầy đủ: requirements (Node 20+/pnpm 12), env API (`JWT_SECRET` bắt buộc đổi), `db:migrate` + `db:seed` (tuỳ chọn), `pnpm dev`, quy trình test PWA offline (build + preview + kill API), bảng scripts (root/api/web), testing (unit/e2e/PWA), quy ước API, link deploy
- **`docs/deploy.md`** (mới) — 2 tuỳ chọn:
  - **A. Self-host Docker — đã build + smoke test thật ✅** (Docker 29.8, Windows): `apps/api/Dockerfile` (node:24-alpine + Prisma + **tsx**, không có bước biên dịch — `packages/shared` export thẳng source TS) · `apps/web/Dockerfile` (Vite build + PWA → nginx:alpine) · `apps/web/nginx.conf` (SPA fallback + proxy `/api` → `api:3001` same domain — không cần CORS) · `docker/docker-compose.yml` (SQLite trên volume `etdb`, tự `prisma migrate deploy` khi API start, `JWT_SECRET` bắt buộc từ `docker/.env`) · `docker/.env.example` · `.dockerignore` (root). Smoke test qua `:8080`: health 200 + web 200 + luồng register → login → tạo family (7 preset) → tạo khoản chi → list → refresh rotation **đạt toàn bộ** → dọn bằng `down -v`
  - **B. Vercel + Supabase (Postgres)** — hướng dẫn tham khảo, **chưa chạy thử** (đánh dấu rõ trong doc): Supabase session pooling (`:6543`), đổi schema `provider` sang `postgresql`, `vercel.json` monorepo (API function + web static — **bắt buộc cùng domain** để refresh cookie hoạt động), `postinstall: prisma generate`, lưu ý serverless (connection pooling, không worker phía server)
- **Bẫy gặp + xử lý trong task**:
  - Docker web build fail: `tsconfig.base.json` (root) không được copy vào context → `error TS5083` + cascade. Fix: `COPY tsconfig.base.json` trong cả 2 Dockerfile
  - Thử `tsc -p tsconfig.build.json` (NodeNext) emit JS cho API → fail (type-check source `packages/shared` — import không extension; test nằm trong `src/__tests__`). **Quyết định: API production chạy tsx** (đơn giản, không đổi kiến trúc shared) — bỏ `build:prod`/`start` đã thử
  - **tsc vẫn emit khi có lỗi type** → `apps/api/dist/` tồn tại → Vitest API nạp trùng `dist/__tests__/*.test.js` (test 60 biến 60+60, P2002 trùng email trên test.db chung). Fix: xoá dist + `apps/api/vitest.config.ts` thêm `include: ["src/**/*.{test,spec}.{ts,tsx}"]` (guard tương tự web)
- **Kết quả: unit 169/169 (api 60, web 105, shared 4) · tsc + lint + build OK · E2E 8/8 (16.8s) · Docker smoke PASS**
- **Toàn bộ 14 WBS trong plan.md §10 đã hoàn tất**

### Chi tiết Guide deploy Vercel + Supabase + CI/CD (post-WBS)
- **`docs/deploy-vercel.md`** (mới) — guide 5 phase: (1) chuyển project sang PostgreSQL (bắt buộc — Prisma không cho schema SQLite chạy trên PG; dev DB = Postgres qua `docker-compose.dev.yml`, migrations tạo lại, test/e2e chỉ sang PG) · (2) Supabase — 2 connection string (direct :5432 cho migration + session pooler :6543 cho runtime, schema có `directUrl`) · (3) Vercel monorepo **cùng domain** (refresh cookie same-origin; cấu hình **Production Branch để trống** → không auto-deploy prod) · (4) GitHub Actions: PR → CI + preview; push `main` → test → `migrate deploy` → `vercel deploy --prod` (thứ tự bắt buộc qua `needs`) · (5) checklist verify + bảng troubleshooting + chi phí free tier
- **File deploy đã commit sẵn** (chờ Phase 1 + secrets): `vercel.json` (root: buildCommand `pnpm -r build` + `outputDirectory` web + function `api/index.ts` + SPA fallback — đã đổi sang config modern Phase 3) · `api/index.ts` (entry serverless mỏng — re-export app Express) · `apps/api/src/vercel.ts` (app Express, không `.listen()`) · `.github/workflows/ci.yml` (lint+build+test, Postgres service) · `.github/workflows/deploy.yml` (test → migrate → deploy)
- **Code**: `app.ts` CORS đổi từ hardcode `http://localhost:5173` sang env `CORS_ORIGIN` (default giữ nguyên — prod same domain không cần CORS)
- **Chưa chạy thật** trên Vercel/Supabase (cần tài khoản user) — Phase 1 (PG) đã xong, Phase 2–5 theo guide

### Chi tiết Phase 1 — chuyển SQLite → PostgreSQL (23/09/2026)
- **Schema**: `provider = "postgresql"` + `directUrl = env("DIRECT_URL")` (`apps/api/prisma/schema.prisma`); xoá migration SQLite → `prisma migrate dev --name init` → migration PG `20260923071509_init`; `migration_lock.toml` = postgresql
- **Dev/test/e2e DB**: `docker-compose.dev.yml` (root, postgres:16-alpine, healthcheck) + `dev-db.init.sql` (tự tạo `expense_tracker_test` + `expense_tracker_e2e` khi init volume); `apps/api/.env` + `.env.example` → PG URL + `DIRECT_URL`
- **Test/e2e**: `apps/api/test/dbUrl.ts` (mới) — env `TEST_DATABASE_URL` override cho CI, default PG local; `vitest.config.ts` + `test/global-setup.ts` + `playwright.config.ts` (+ env `E2E_DATABASE_URL`) chỉ sang PG; workflows `ci.yml`/`deploy.yml` thêm `TEST_DATABASE_URL`
- **Self-host prod** (`docker/`): thêm service `postgres:16` (user etracker, volume `pgdata`, healthcheck; api `depends_on: service_healthy`), bỏ SQLite volume `etdb`
- **Verified (đủ 8 AC)**: unit **169/169** trên PG · tsc + lint + build sạch · E2E **8/8 (18.9s)** · dev smoke `SMOKE_ALL_PASS` (register → family 7 preset → khoản chi → list → xoá; tài khoản test `final@test.com`/`MatKhau123!` + family "Nhà Final" được khôi phục trên DB mới) · docker self-host rebuild + smoke `DOCKER_SMOKE_ALL_PASS` (PG + api + nginx `:8080`) rồi `down -v` sạch
- **Docs**: README (yêu cầu Docker, bước bật PG trước, renumber mục 2→6) · `docs/deploy.md` §A (3 container, backup `pg_dump`, xoá mục "nâng cấp PostgreSQL") · `docs/deploy-vercel.md` Phase 1 đánh dấu XONG + khớp implement
- **Bẫy gặp**: `prisma generate` EPERM khi dev server cũ đang giữ `query_engine-*.dll.node` (Windows) — phải kill cả chuỗi `pnpm dev` (tsx watch tự restart process con) rồi generate lại; script kill theo CommandLine khớp luôn VS Code đang mở project (để ý khi kill theo pattern)
- **Còn để ý**: `apps/api/prisma/{dev,test,e2e}.db` (file SQLite cũ, gitignored) không dùng nữa — có thể xoá tay

### Chi tiết Phase 2 — Supabase (23/09/2026)
- User tạo Supabase project `expense-tracker` (region `ap-southeast-1`, free) — DB password do user đặt (**không nằm trong repo/memory**)
- **URL hoạt động (đã verify)**: host shared `aws-0-ap-southeast-1.pooler.supabase.com` · user `postgres.fxhmbpfffvmdrhechlqo` (format `postgres.<ref>`)
  - **Direct `:5432`** — `prisma migrate deploy` ✅: migration `20260923071509_init` **đã apply vào DB Supabase** (sẵn schema cho lần deploy đầu)
  - **Session pooling `:6543`** — Prisma Client query ✅ (runtime)
- **Bẫy (đã ghi vào docs/deploy-vercel.md)**: host UI mới `db.<ref>.supabase.co` **không có DNS** (verify qua DoH CF+Google) → P1001; shared host bắt buộc user `postgres.<ref>` làm tenant identifier (user `postgres` → `ENOIDENTIFIER`); `migrate deploy` **hang** trên `:6543` (schema engine + pgbouncer) → migration luôn qua `:5432`
- **Giá trị dùng tiếp**: Vercel `DATABASE_URL` = URL `:6543` · Vercel `DIRECT_URL` + GH secret `SUPABASE_DIRECT_URL` = URL `:5432` (URL đầy đủ có password — chỉ nằm trong chat local, **không commit vào repo**)
- **Tiếp theo: Phase 3** — tạo Vercel project (import repo, 3 env vars, Production Branch để trống, Node 22) + Vercel token + Org/Project ID

### Chi tiết Phase 3 — Fix deployment Vercel (23/09/2026)
- **Context**: user đã tạo Vercel project (import GitHub `longconuet/expense-tracker`, 3 env vars Production+Preview, tắt Deployment Protection, Production Branch để trống) — deployment đầu (`dpl_33MDeQr2n5ct6hZWcWxqHzJNTVHF`): API 500 `FUNCTION_INVOCATION_FAILED` + web 404 toàn bộ (kể cả `/index.html`)
- **Chẩn đoán** (Vercel API + CLI với token user — endpoint log cũ đã deprecated, dùng `npx vercel logs <url>`):
  - API 500: log function `ERR_MODULE_NOT_FOUND ... node_modules/@expense-tracker/shared/src/index.ts` — builder copy package workspace + transpile `.ts` → `.js` vào output, nhưng `main` của shared vẫn trỏ `src/index.ts` (file `.ts` không có trong output)
  - Web 404: config `builds` (legacy) + `@vercel/static` — trỏ **file** `index.html` → output static chỉ có đúng 1 file (mất `assets/`, manifest, SW); trỏ **thư mục** → static build bị **skip lặng lẽ**
- **Fix 1 — shared build sang `dist` (JS + d.ts)**: `packages/shared/tsconfig.build.json` (tsc NodeNext → `dist/` + declaration), package.json `main`/`types`/`exports` → `dist/`, import nội bộ đổi extension `.js`; script `dev` (tsc --watch). Cập nhật theo: scripts root (`dev` = build + watch shared, `test`/`test:e2e` = build shared trước), `ci.yml`/`deploy.yml` (**build trước test**), 2 Dockerfile (`pnpm --filter @expense-tracker/shared build`)
- **Fix 2 — `vercel.json` đổi sang config modern** (kiểm chứng bằng `npx vercel build` local + đọc `.vercel/output`):
  - `"buildCommand": "pnpm -r build"` · `"outputDirectory": "apps/web/dist"` (static serve ở root domain) · `"functions": { "api/index.ts": { "maxDuration": 300 } }` · `rewrites` SPA fallback
  - `api/index.ts` (root, MỚI) — entry mỏng re-export app Express từ `apps/api/src/vercel.ts` (convention Vercel: file trong `api/` = function tại route `/api` + `/api/*`)
  - Output local đúng: static full ở root (index.html + assets + sw + manifest + icons) + function `api/index.func` runtime nodejs24.x chứa `packages/shared/dist/index.js`
- **Fix 3 — các lỗi lộ khi deploy thật** (mỗi lần deploy → đọc `npx vercel logs <url>` → fix → redeploy):
  - Cloud build fail: api `tsc` chạy khi Prisma Client chưa generate (auto-generate của Vercel chỉ ở bước function) → script build API: `prisma generate && tsc --noEmit`
  - `/api/*` trả HTML web: SPA rewrite nuốt trước function → thêm rewrite `/api/(.*) → /api` **trước** fallback trong `vercel.json`
  - `ERR_REQUIRE_ESM` từ `api/index.js`: shim ở root repo bị compile CJS (root `package.json` không có `"type": "module"`) → thêm `api/package.json` `{"type":"module"}`
  - `@prisma/client did not initialize yet`: builder chạy `pnpm install` **lần 2** ở bước function → postinstall `@prisma/client` không thấy schema (nằm trong `apps/api/`) → ghi đè client bằng stub → script `postinstall` root: `pnpm --filter @expense-tracker/api exec prisma generate` (chạy sau mọi postinstall dependency — verified local: xoá client + `pnpm install --force` → regenerate)
  - `prepared statement "s0" already exists` (query đầu OK, query sau fail): URL `:6543` = **transaction mode** (Supavisor — label "session pooling" cũ sai; sau 28/02/2025 port 6543 chỉ còn transaction) → Prisma dùng prepared statement → va chạm. Fix: `DATABASE_URL` trên Vercel thêm **`?pgbouncer=true`** (cập nhật qua Vercel API bằng token: DELETE env cũ + POST env mới, id mới `F8FSPDuvzlAH0h7F`). `directUrl` `:5432` (session) + direct không cần flag
- **Verified local**: unit **169/169** · E2E **8/8 (17.1s)** · lint sạch (thêm `.vercel/**` vào eslint ignores; `.gitignore` + `.vercel` do CLI tự thêm) · docker self-host rebuild + `DOCKER_SMOKE_ALL_PASS` (health + web + register + /me) rồi `down -v`
- **Docs**: `docs/deploy-vercel.md` §3.2 (config final + 3 bẫy thật) + 4 dòng Troubleshooting mới (shared `.ts`, static legacy, Deployment Protection, ...)
- **Vercel IDs (đã lấy bằng token)**: Org/Team `team_XlBNRntktz7iEVVFH0VXw1ud` · Project `prj_tcIH0xdkBCaB6ubaxQyXeAUza3GL` · Node version project = 24.x
- **Phase 3 XONG — verify production (23/09/2026 ~17:0x)**: deployment production `dpl_` (URL `expense-tracker-qelno8klx-long-7bf1.vercel.app`, alias `expense-tracker-seven-plum-41.vercel.app`) — `VERCEL_SMOKE_ALL_PASS` (health + register 201 ghi Supabase + web) + `PHASE3_VERIFY_ALL_PASS` (alias, sw.js/manifest/icons/assets JS, register→login→/me→family 201)
- **Tiếp theo: Phase 4** — user thêm 4 GitHub Secrets (repo → Settings → Secrets and variables → Actions): `SUPABASE_DIRECT_URL` (URL `:5432` pooler session — giá trị có password chỉ nằm trong chat) · `VERCEL_TOKEN` (token `gh-actions-deploy`) · `VERCEL_ORG_ID` = `team_XlBNRntktz7iEVVFH0VXw1ud` · `VERCEL_PROJECT_ID` = `prj_tcIH0xdkBCaB6ubaxQyXeAUza3GL` → **Phase 5** (merge `develop → main` lần đầu, CI/CD chạy)

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
- Offline: khoản chờ sync **không hiển thị** trong list (chỉ có banner đếm) — đủ cho MVP; muốn hiển thị thì merge queue vào list ở UI
- **Sửa khoản offline**: `PUT /expenses/:id` khi server không đạt → hiện lỗi (chưa có queue cho edit — queue chỉ support create)
- Khoản queue gặp 4xx vĩnh viễn (VD danh mục bị xoá) sẽ ở lại queue, retry lại mỗi 30s — MVP chấp nhận, cần UI quản lý queue thì làm sau

## Trạng thái Git (cập nhật 23/09/2026)
- 14 commits trên `develop`, **đã push** lên `origin` (https://github.com/longconuet/expense-tracker.git):
  - `998dd6e` — `feat: API Fastify + Prisma + shared types (auth, expenses, categories, stats)` (47 file: config gốc + packages/shared + apps/api)
  - `de915a7` — `feat: web app — 5 màn, dark mode, PWA offline, keypad nhập chi` (70 file: apps/web + docs)
  - `89f6c4f` — `docs: cập nhật checkpoint — 2 commit đầu đã push lên origin/develop`
  - (WBS 10) — `feat: WBS 10 — Home/History nhóm theo ngày có tiểu kết + màn sửa khoản chi` — xem `git log --oneline`
  - (WBS 13) — `feat: WBS 13 — E2E Playwright (auth, khoản chi, offline) + fix sync lúc khởi động` — xem `git log --oneline`
  - (WBS 14) — `feat: WBS 14 — Polish (lazy StatsPage) + README hướng dẫn local + deploy guide (Docker self-host đã test, Vercel/Supabase)` — xem `git log --oneline`
  - (post-WBS) — `feat: chuẩn bị deploy Vercel + Supabase — vercel.json + entry serverless + workflows CI/CD + hướng dẫn 5 phase`
  - (post-WBS) — `refactor: Phase 1 — chuyển toàn bộ project từ SQLite sang PostgreSQL (schema, dev/test/e2e DB, self-host compose) + docs`
  - (post-WBS) — `docs: Phase 2 — verify kết nối Supabase (connection string working + bẫy DNS/pgbouncer)` — xem `git log --oneline`
  - (post-WBS) — `fix: Phase 3 — Vercel deployment (shared build sang dist + vercel.json outputDirectory/functions)`
  - (post-WBS) — `fix: Phase 3 — prisma generate trước tsc trong build API (cloud build không có client sẵn)`
  - (post-WBS) — `fix: Phase 3 — deploy Vercel xanh: rewrite /api/* + api/package.json ESM + postinstall prisma generate`
  - (post-WBS) — `fix: Phase 3 — DATABASE_URL thêm ?pgbouncer=true (pooler transaction mode)`
  - (post-WBS) — `docs: Phase 3 XONG — guide đánh dấu ✅ + checkpoint verify production`
- Git identity set **riêng cho repo** (không global): `Long NT` / `nice231096@gmail.com`
- Working tree clean

## Đang làm
- (không) — **toàn bộ 14 WBS trong plan.md §10 đã hoàn tất**

## Task kế tiếp: (không có WBS nào còn lại)
Việc phát triển tiếp theo (tuỳ user chọn, không nằm trong WBS gốc):
1. Upgrade PostgreSQL thật (đổi provider schema + migration PG + chạy compose với service postgres) — doc đã có hướng dẫn trong `docs/deploy.md`
2. Chạy thử deploy Vercel + Supabase theo guide (mục B — chưa được kiểm chứng)
3. UI quản lý queue offline (hiện khoản đang chờ sync, xoá/đẩy lại) — mục "Chênh với spec"
4. Code-splitting thêm (VD recharts đã tách; nếu thêm thư viện nặng khác) hoặc tối ưu bundle

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
- Commit: Conventional Commits, thẳng `develop`, 1 task = 1 commit; remote `origin` = https://github.com/longconuet/expense-tracker.git

## Ghi chú kỹ thuật (môi trường)
- Node 24, pnpm 12.5.1, git 2.55 (nhánh `develop` tracking `origin/develop` trên GitHub)
- Pin: typescript ^5.9.3, Prisma 6.19, zod 4; React 19.3, Vite 8.3, Vitest 5, Tailwind 4.3, Express 5.2, react-router 7.18, zustand 5, recharts 3.10, vite-plugin-pwa 1.3
- Express 5: async handler throw → tự vào error handler; `req.params.*` type `string | string[]`; middleware truyền **function**
- Prisma: update relation dùng `category: { connect: { id } }`
- Test api: DB `prisma/test.db` reset bằng globalSetup
- Alphabet mã mời: `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` — regex `/^[A-HJ-MN-Z2-9]{6}$/`
- **Vitest web**: jsdom không auto-cleanup RTL — test nhiều render trong 1 file phải `afterEach(cleanup)`; module state là singleton → mỗi scenario render `<App/>` ở file test riêng
- **jsdom không có IndexedDB** — test db/syncQueue/readCache mock `core/db` (vi.hoisted Map) hoặc stub fake IDB (xem `__tests__/db.test.ts` — fake đủ dùng: open/createObjectStore/transaction/put/get/getAll/delete)
- **jsdom chặn form submit** khi có input `required` rỗng → field validate bằng JS thì không dùng `required`
- **recharts 3 + tab ẩn**: shape (sector/bar) rỗng do rAF không chạy trong tab hidden (Review pane) — **artifact môi trường, không phải bug**; shim `requestAnimationFrame = setTimeout(cb,16)` để verify; tab visible render bình thường
- **Dev server** (đang chạy background bằng `pnpm dev`, session WBS 14): api :3001 · web dev :5173 · **preview PWA :4173** (build + SW + proxy API — chỉ khi chạy `vite preview` sau build)
- **E2E (Playwright)**: `pnpm test:e2e` (root) — tự bật API :3101 + `e2e.db` (reset mỗi lần) + web :5199 (proxy qua `VITE_API_PROXY_TARGET`), không đụng dev :3001/dev.db. Chromium đã cài sẵn máy
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
