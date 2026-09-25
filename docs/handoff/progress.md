# Handoff — trạng thái công việc

> File checkpoint để session sau chỉ cần đọc file này (không dựa vào nhớ).
> Cập nhật mỗi khi 1 task WBS xong.

## Cập nhật: 25/09/2026 — **Tổng chi tiêu theo thành viên trong card "Tổng chi tiêu" ở `/stats`** (commit `58eaab0` trên `develop`, chưa push — chờ xác nhận pipeline option B): API `GET /api/families/:id/stats` trả thêm `byMember` — mọi thành viên hiện tại (kể cả 0 chi trong tháng) + mọi người đã nhập khoản trong tháng (kể cả người ĐÃ BỊ XÓA khỏi family — khoản vẫn tồn tại, tên lấy từ bảng User, fallback "Thành viên đã xoá"), percent 1 số thập phân, sort total DESC → name ASC (locale vi), tổng các hàng luôn = total; FE card tổng thêm section "Theo thành viên" + skeleton 4 khối; `fetchStats` normalize `byMember = []` cho payload offline cũ (fix MEDIUM review: type required khớp runtime, bỏ guard rải rác); web 158 + api 63 + shared 4 = **225/225 pass**, lint + build sạch, review agent "DUYỆT" (0 CRITICAL/HIGH, 1 MEDIUM + 5 LOW đã xử lý 4 — 1 LOW optional bỏ qua), verified browser thật (2 member: 200k 80% + 50k 20%)

## Cập nhật: 25/09/2026 — **Đăng nhập bằng username thay cho email** (commit `3655604` + docs `452a28e` trên `develop`, đã push): username 2-20 ký tự `a-z 0-9 . _` (unique, tự lowercase) là định danh login, email nullable chỉ ghi nhận nguồn gốc — migration backfill từ phần trước `@` email cũ (trùng → hậu tố `_2`), api 61/61 + web 154/154 pass (219/219), review agent "DUYỆT" (0 CRITICAL/HIGH, 5 LOW: 2 fix luôn + 3 deferred), verified browser thật đủ 8 luồng · **INCIDENT production (đã fix sau ~10 phút)**: Vercel git-integration **auto-deploy `develop` lên prod không qua migrate** → login/register 500 (code mới, DB thiếu cột) → user duyệt + chạy `prisma migrate deploy` tay vào Supabase → OK; **pipeline gap chưa quyết định** (xem "Chi tiết Đăng nhập bằng username")

## Cập nhật: 24/09/2026 — **Bình đẳng hoá danh mục — bỏ khoá preset** (commit `1c7003d` trên `develop`, đã push): preset giờ sửa/xoá được như danh mục thường (bỏ guard PRESET_LOCKED API + nhãn "Danh mục mặc định" + ẩn nút FE), `isPreset` chỉ còn ghi nhận nguồn gốc khởi tạo, api 61/61 + web 151/151 pass, review agent "DUYỆT CÓ ĐIỀU KIỆN" (0 CRITICAL/HIGH, 4 LOW đã xử lý 3 — 1 issue có sẵn deferred: PUT không pre-check trùng tên → P2002 500)

## Cập nhật: 24/09/2026 — **Quản lý danh mục chi tiêu** (2 commit `d6880dd` + `0c33ae9` trên `develop`, đã push): trang `/categories` (thêm/sửa/xoá/đổi thứ tự, emoji picker, preset khoá), web unit 151/151 pass, review agent "DUYỆT CÓ ĐIỀU KIỆN" (đã fix MEDIUM: guard `activeFamilyId` cho refetchSilent), verified browser thật đủ 5 luồng

## Cập nhật: 24/09/2026 — **Modal xác nhận đồng nhất UI thay thế window.confirm** (commit `22f9471` trên `develop`, đã push): 15 test mới + 5 cập nhật, web unit 133/133 pass, review agent "DUYỆT CÓ ĐIỀU KIỆN" (đã fix 1 MEDIUM focus-trap + 3 LOW), verified browser thật (mở/xoá/đóng/đăng xuất modal)

## Cập nhật: 24/09/2026 — **Skeleton loading Home/History/Stats + refetch không flicker** (commit `906d576` trên `develop`, đã push): 13 test mới, web unit 118/118 pass, review agent "DUYỆT CÓ ĐIỀU KIỆN" (đã fix MEDIUM: silent refetch History chỉ khi page 1). **Keep-warm XONG**: UptimeRobot free monitor ping 5 phút đã xanh đều (user tạo + verify) → `keep-warm.yml` đã xoá (scheduler GitHub không tự fire; run tay xanh chứng tỏ job OK — không cần giữ)

## Cập nhật: 23/09/2026 — **TẤT CẢ 5 PHASE DEPLOY XONG ✅**: CI/CD GitHub Actions chạy thật (test → migrate Supabase → vercel deploy --prod) — production sau CD **verify 9/9** (`P5_FINAL_VERIFY_ALL_PASS`) — app lên production `https://expense-tracker-py2qaofkm-long-7bf1.vercel.app`

> Trước đó (cùng ngày): Phase 3 XONG (deployment Vercel xanh, verify thật) · WBS 14 hoàn tất — toàn bộ 14 WBS + guide deploy xong.

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
- [x] **Phase 4 — GitHub Secrets + CI/CD** (post-WBS): 4 secrets repo, CI xanh trên push + PR (chi tiết dưới)
- [x] **Phase 5 — Release production qua CI/CD** (post-WBS): PR #1 + PR #2 (fix P1012) → CD xanh 3 job → verify production 9/9 (chi tiết dưới)

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

### Chi tiết Phase 4 + 5 — CI/CD chạy thật + release production (23/09/2026)
- **Phase 4**: user thêm 4 secrets repo (`SUPABASE_DIRECT_URL`, `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`) — CI tự chạy xanh trên push `develop` + PR (không cần cấu hình thêm)
- **Tạo `main` + PR #1** (release v1.0): repo chưa có nhánh `main` (Web UI không cho chọn base branch chưa tồn tại) → tạo qua GitHub API (fine-grained PAT `Contents: W` + `Pull requests: W` + `Actions: R`, hạn 1 ngày): `git/refs` `refs/heads/main` @ commit gốc `998dd6e` → PR `develop → main` (13 commits, 113 files, +8148). Merge commit `b6159c4`
  - Bẫy API: `POST /repos/.../branches` cần field `branch` (không phải `ref`); fine-grained thiếu quyền trả **404** (không phải 403)
- **CD run 1 FAIL ở job `migrate`** (`P1012: Environment variable not found: DIRECT_URL`): job chỉ set `DATABASE_URL`, schema có `directUrl = env("DIRECT_URL")`, và `prisma.config.ts` (dotenv/config) không có `.env` trên runner → Prisma bỏ qua nạp env → validate schema fail. Job `test` + các step trước đó đều OK
- **Fix `123aa4a`** (PR #2, 2 files): `deploy.yml` — env bước Apply migrations thêm `DIRECT_URL: ${{ secrets.SUPABASE_DIRECT_URL }}` (trùng `DATABASE_URL` — `migrate deploy` dùng `directUrl`); `docs/deploy-vercel.md` + dòng Troubleshooting P1012. Merge commit `f6bae94`
- **CD run 2 XANH 3 job** (~3,5 phút): `test` (lint + build + unit, PG16 service) → `migrate` (`prisma migrate deploy` vào Supabase `:5432`) → `deploy` (`vercel pull` + `vercel deploy --prod`) — proof: thứ tự `needs` đảm bảo migration xong trước khi code serve traffic
- **Production sau CD** (alias ổn định: `https://expense-tracker-long-7bf1.vercel.app` — URL per-deployment `expense-tracker-<hash>-long-7bf1.vercel.app` đổi mỗi lần CD): verify API **9/9** (`P5_FINAL_VERIFY_ALL_PASS`): health · register 201 · login + cookie `etracker_refresh` flags **HttpOnly+Secure+SameSite+Path trên https** · tạo family + inviteCode · 7 preset categories · tạo khoản chi 201 · list tháng (total=1, đúng amount) · stats (total/byCategory 100%/byDay hôm nay) · **refresh bằng cookie không Bearer → accessToken mới** · logout. PWA assets (sw.js/manifest/icons) + alias production OK (PHASE3_VERIFY_ALL_PASS)
- **Verify còn thiếu (làm tay trên trình duyệt)**: PWA install + offline sync thật, dark mode, mobile ~390px — API/asset đã verify đủ, phần render do user tự xem
- **Commit**: `123aa4a` (fix deploy.yml + docs) + commit docs này — tất cả đã push; `main` = `f6bae94` (+ commit docs khi merge)
- **Script verify (temp, không commit)**: `p5-final-verify.mjs <BASE>` (checklist Phase 5) · `p3-status.cjs <VERCEL_TOKEN>` (list deployments + probe) · `p3-verify-final.mjs` / `p3-vercel-smoke.mjs` (Phase 3)
- **Tiếp theo (tuỳ chọn)**: custom domain (Vercel → Settings → Domains) · preview deployment qua Vercel GitHub integration (docs §4.3) · xoá fine-grained PAT sau khi dùng xong (hạn 1 ngày tự hết)

### Chi tiết Perf fix + keep-warm (24/09/2026)
- **Vấn đề**: user báo API đều chậm >2s. Đo thực tế từ VN (script `p5-perf-probe.mjs`): `/api/health` warm (không chạm DB) ~285ms, `register` 2.9s, `login`/`me` 1.5-1.6s. Header `x-vercel-id: hkg1::iad1` → **function chạy ở `iad1` (US East)** — Vercel tự chọn khi không khai `regions` trong `vercel.json`
- **Chẩn đoán**: mỗi request đi VN → HK edge → US East → (query DB) Singapore → về; DB Supabase ở `ap-southeast-1`. **Không phải lỗi free plan** — Supabase DB đã ở SG (region gần nhất VN)
- **Fix `cbc9526` (PR #5)**: `vercel.json` thêm `"regions": ["sin1"]` → function chạy Singapore. **Kết quả đo lại**: register 2932→367ms · login 1509→193ms · me 1607→132ms · health warm 260→~98ms
- **Keep-warm (cùng commit)**: `.github/workflows/keep-warm.yml` — cron `*/5 * * * *` ping `GET /api/health` production (repo public → miễn phí Actions minutes) để giảm cold start request đầu sau khi idle
- **Docs**: `deploy-vercel.md` §3.2 (regions trong config + bẫy region) + 2 dòng Troubleshooting mới (API chậm do region, cold start)
- **Tiếp theo (tuỳ chọn)**: custom domain → cập nhật URL ở **monitor UptimeRobot** + `docs` (keep-warm.yml đã xoá 24/09 — scheduler GitHub không tự fire, UptimeRobot thay thế) · Vercel Speed Insights nếu muốn giám sát liên tục

### Chi tiết Tổng chi tiêu theo thành viên /stats (25/09/2026)
- **Quyết định nghiệp vụ (user duyệt)**: hiển thị MỌI thành viên kể cả 0 ₫; người bị xoá khỏi family vẫn hiện theo tên nếu có khoản trong tháng (xoá member chỉ xoá membership, khoản chi nằm nguyên DB); KHÔNG làm chart theo thành viên + avatar (out of scope)
- **API** (`stats.routes.ts`): 3 query song song `Promise.all` — `groupBy userId` trong tháng + `familyMember.findMany include user` + `user.findMany in: [creators]` (không N+1). Ghép bằng `Map` key **userId** (an toàn 2 member trùng tên): init mọi member hiện tại `total: 0`, cộng thêm tổng creators; creator không còn member → orphan, tên từ bảng `User`, fallback "Thành viên đã xoá" (giữ bất biến Σ hàng = total). `percent = total > 0 ? Math.round(x*1000)/10 : 0` (cùng công thức byCategory); sort `total DESC || name.localeCompare("vi")`
- **Shape**: `byMember: Array<{ name, total, percent }>` (không có userId — FE chỉ hiển thị; FE key list bằng `name-index`)
- **FE** (`StatsPage.tsx`): section "Theo thành viên" trong card tổng (border-t cách ly), dòng `name — formatVnd(total) · percent%`, `truncate` cho tên dài + `shrink-0` cho tiền; `StatsSkeleton.tsx` +4 khối (tiêu đề + 3 dòng)
- **MEDIUM review đã fix**: `MonthlyStats.byMember` required nhưng read-cache stale-while-error không validate payload → normalize 1 nơi duy nhất trong `fetchStats` (dataApi): `byMember: Array.isArray(...) ? ... : []` → consumer tin type, bỏ defensive check trong StatsPage (test "payload cũ" chuyển từ StatsPage sang dataApi)
- **LOW review đã xử lý**: fallback tên orphan (L1) · pin locale `"vi"` cho tie-break (L2) · JSDoc route cập nhật (L3) · fixture test đồng bộ `byMember: []` ở dataApi/App.sessionRestored/HomePage×5 (L6). **Bỏ qua (optional)**: lọc `in:` chỉ userId thiếu tên (L4 — dư 1 vài row, không đáng) · key index-based (L5 — tối ưu trong shape đã chốt)
- **Test**: API fixture mới = member nhập 30k Đi lại 09-12 (tháng 9 = 250k: owner 220k 88% + member 30k 12%) + member2 nhập 20k Ăn uống 07-10 rồi bị owner xoá (orphan); assertions tháng 9/8/7/6 + invariant Σ = total; FE: section hiện, 0 ₫ hiện "0 ₫ · 0%", byMember rỗng không render section, skeleton ≥ 12 khối; dataApi: normalize payload cũ
- **Verified browser thật**: dev DB family "Nhà Final" — nạp 3 khoản (owner 200k + member mới "Bạn Đồng Hành" 50k) → card tổng hiện "250.000 ₫" + section 2 dòng đúng thứ tự/percent, các section khác không vỡ

### Chi tiết Đăng nhập bằng username thay cho email (25/09/2026)
- **Quyết định user** (spec duyệt, 4 điểm chốt): username 2-20 ký tự `a-z 0-9 . _` bắt đầu/kết thúc bằng chữ hoặc số, tự lowercase · tài khoản cũ tự sinh username từ phần trước `@` email trong migration (trùng → hậu tố `_2`, `_3`) · cột email **giữ trong DB, chuyển nullable**, bỏ khỏi UI/API (user mới email = NULL) · **không** làm tính năng đổi username sau (YAGNI)
- **Schema + migration**: `User` thêm `username String @unique`, `email String? @unique`; migration `20260925120000_add_username` (SQL custom viết tay): ADD COLUMN nullable → backfill `regexp_replace(split_part(email,'@',1), '[^a-z0-9._]','_','g')` + trim `._` đầu/cuối + fallback `user`+8 ký tự id nếu <2 ký tự → dedup `ROW_NUMBER() OVER (PARTITION BY username)` + hậu tố `_<rn>` → `SET NOT NULL` + `CREATE UNIQUE INDEX "User_username_key"` → email `DROP NOT NULL`. Đã apply dev DB + verify backfill (`final@test.com`→`final`, `sk-muf01glb@test.com`→`sk_muf01glb`)
- **API** (`auth.routes.ts`): register `{name, username, password}` → 409 `USERNAME_TAKEN` · login `{username, password}` → 401 `INVALID_CREDENTIALS` "Tên đăng nhập hoặc mật khẩu không đúng" (1 message chung cho sai pass + không tồn tại — chống enumeration) · zod `usernameField` = trim + lowercase + regex `/^[a-z0-9][a-z0-9._]{0,18}[a-z0-9]$/` · `publicUser` → `{id, name, username}` · `me.routes.ts` /me trả username
- **FE**: `authStore` login/register theo username · `LoginPage` ô "Tên đăng nhập" (`type=text`, `autocomplete=username`, placeholder `an2310`) · `RegisterPage` ô username + hint "2-20 ký tự: chữ thường, số, dấu . _" + **`usernameError` 409 hiện ngay dưới ô** (Input `error` prop, tự reset khi gõ lại) · `MePage` hàng email → username · `AppShell` tooltip username
- **Tests**: `auth.test.ts` viết lại (register 201 shape, 409 khác hoa thường/thừa khoảng trắng, 400 validate 3 field, login 200/401 sai pass/401 không tồn tại, /me username, refresh/logout) · helper + call sites `family`/`expense`/`stats`/`category` test đổi sang username (bẫy: username **không có dấu gạch** — giá trị test ban đầu `fam-owner`… sai rule, sửa về `fam_owner`…) · fixtures FE `MOCK_USER`/`USER` các page + `api.test` body + `LoginPage.test` (placeholder/payload/401) · **`RegisterPage.test.tsx` MỚI** (3 test: payload không email, 409 dưới ô, reset lỗi khi gõ lại) · E2E `helpers.ts` (`e2e_<token>`, label "Tên đăng nhập") + `auth.spec.ts` (message 401 mới) · `seed.ts` upsert theo username `test_user`
- **Verified browser thật** (dev server): form login đúng label/autocomplete · login `sk_muf01glb` (backfill) OK → home · MePage name + username (không email) · register `test_verify_9x` mới → onboarding · 409 trùng → "Tên đăng nhập đã được sử dụng" **ngay dưới ô** · sai pass → 401 · username không tồn tại (hợp lệ) → 401 **cùng message** · response user `{id, name, username}`
- **Review** (agent riêng): DUYỆT — 0 CRITICAL/HIGH · LOW đã fix: message cosmetic `api.test.ts` · thiếu test reset `usernameError` (đã thêm) · LOW deferred (xem "Issue deferred")
- **Kết quả**: full suite **219/219** (web 154, api 61, shared 4), lint + build xanh; commit `3655604` push `develop` (CD migrate prod + deploy — thiết bị đã đăng nhập giữ phiên, token JWT theo userId)
- **⚠ INCIDENT production + pipeline gap (25/09, cần user quyết định)**:
  - **Thực tế pipeline hiện tại**: Vercel project **git-integration với GitHub, Production Branch = branch mặc định (`develop`)** → **mọi push `develop` tự auto-deploy production** (không chạy test gate, không chạy migrate). Workflow `deploy.yml` (test → migrate → vercel deploy) chỉ trigger trên **`main`** — chưa bao giờ chạy kể từ release v1.0 (`main` = `f6bae94` đứng yên). Giả định checkpoint cũ "mỗi push develop → CD migrate ~3-4 phút" là **SAI** (các task trước không có migration nên không lộ)
  - **Incident**: push `3655604`+`452a28e` lúc 03:28Z → Vercel auto-deploy code mới lên prod lúc 03:30Z (`dpl_3Ni42bi...`, PROMOTED) trong khi DB prod chưa có cột `username` → login/register/**/me trả 500** ~10 phút (verify probe: 500 INTERNAL_ERROR). **Fix (user duyệt trước)**: chạy `prisma migrate deploy` tay vào Supabase `:5432` (~10:40 VN) → 401 đúng, backfill prod OK (12 tài khoản, tài khoản thật duy nhất: `nice231096` ← nice231096@gmail.com; 11 còn lại là smoke/verify/perf test 23-24/09 — **chưa xoá**, user muốn dọn thì cần lệnh duyệt riêng)
  - **Tuỳ chọn sửa pipeline (chưa làm — user chọn)**:
    - (A) **Giữ auto-deploy develop, thêm migrate vào build Vercel**: `vercel.json` buildCommand chạy `prisma migrate deploy` trước build **chỉ khi `VERCEL_ENV=production`** (preview no-op) — cần thêm env `DIRECT_URL` (`:5432`) vào Vercel project; ưu: đơn giản, luôn migrate-trước-code; nhược: migrate chạy trên infra Vercel
    - (B) **Tắt auto-deploy develop**: Vercel dashboard → Settings → Git → Production Branch = `main` (hoặc gỡ git-integration — khi đó chỉ còn đường `vercel deploy --prod` của Actions) → quay về kiến trúc gốc: release = PR `develop→main` → Actions (test → migrate → deploy), push develop chỉ chạy CI
    - (C) Bỏ `deploy.yml` + giữ auto-deploy develop, chấp nhận migrate tay mỗi lần có migration (không nên — dễ quên như vừa xảy ra)
  - **Lưu ý đi kèm**: GitHub PAT `github_pat_11AFUQQB...` **hết hạn 25/09** (API 401, push vẫn OK vì credential riêng) — nếu cần API (tạo PR, đọc Actions) phải phát token mới

### Chi tiết Skeleton loading (24/09/2026)
- **Yêu cầu**: thay spinner bằng skeleton loading hiện đại hơn trên mobile (user duyệt spec trước khi code)
- `shared/ui/Skeleton.tsx` (mới) — primitive khối pulse `animate-pulse rounded-lg bg-ink/10` (token theme → tự đúng light/dark), `aria-hidden`; container màn hình chịu `role="status" aria-label="Đang tải"`
- `features/home/HomeSkeleton.tsx` · `features/stats/StatsSkeleton.tsx` · `features/history/HistorySkeleton.tsx` — mô phỏng card thật (chiều cao khớp layout để data về không giật); phần không phụ thuộc data (tiêu đề, tháng, selector, chip lọc) do page giữ, **luôn hiện thật**
- **Chống flicker — refetch lặng lẽ** (core của task): mỗi page theo dõi `lastQuery` (key `familyId|month[|categoryId]`) + `lastOk` (useRef, set trong `.then` có guard `cancelled`); query không đổi + lần fetch trước OK (VD sau `SYNCED_EVENT` offline sync) → **GIỮ data cũ, không reset** → không skeleton giữa chừng. Đổi query → reset + skeleton
- **History thêm điều kiện page 1** (fix MEDIUM từ review agent): đã "Tải thêm" (page > 1) thì refetch sẽ co list về trang đầu → không silent, hiện skeleton làm tín hiệu. Đọc `meta` qua `metaRef` (pattern ref-giá-trị-mới-nhất, tránh thêm vào deps — page đổi khi load-more không được trigger refetch)
- **Home**: lỗi khi đã có data (refetch ngầm fail) → giữ data + banner `role="alert"`; lỗi lần tải đầu → màn lỗi như cũ
- Không đổi: Button loading, FullPageSpinner, Suspense fallback, Add/EditPage
- **Tests 13 mới** (web 105 → 118): `Skeleton`(2) · mỗi page: skeleton lần tải đầu (không spinner) · đổi query → skeleton lại · sync → refetch lặng lẽ giữ data · `Stats`+`History`+`Home`: refetch ngầm lỗi có data → giữ data + banner
- **Verified browser thật** (dev server + wrap `fetch` delay 5s API data): Home h1+tháng thật + 23 khối pulse · Stats selector thật + 9 khối · History chip thật + 20 khối · **0 spinner**; dispatch `SYNCED_EVENT` khi đang có data → data giữ nguyên, không skeleton
- **Bẫy gặp**: skeleton chứa h1 trùng content → React remount cây khi data về → node h1 mà `findByRole` đã tìm bị detached (test fail "element could not be found") → **khắc phục: h1 + tháng thuộc về page (luôn render), skeleton chỉ chứa vùng data**
- **Bẫy 2 (môi trường)**: `tsx watch` (API dev) watch luôn `node_modules/.prisma/client/*` → `prisma generate` trong `pnpm build` viết file → tsx restart API → giữ lock DLL → **EPERM rename** build fail. Fix: tắt dev server trước khi build (không cần fix config — chỉ xảy ra khi dev + build song song)
- **Bẫy 3 (format)**: repo KHÔNG có `.prettierrc`/`.gitattributes` — `pnpm format` (prettier default `endOfLine: "lf"`) đã reformat 37 file không liên quan → đã **revert**; chỉ 11 file task nằm trong commit. Nếu muốn format toàn repo → làm 1 commit `style:` riêng sau khi user duyệt
- **Review** (agent riêng): DUYỆT CÓ ĐIỀU KIỆN — 0 CRITICAL/HIGH · 1 MEDIUM (load-more reset im lặng — đã fix) · 3 LOW (class `rounded-lg`/`rounded-full` trong Skeleton phụ thuộc thứ tự Tailwind — chấp nhận; indentation — đã chạy prettier cho file task; 2 test edge thiếu — đã bổ sung 2)
- **Kết quả**: unit web **118/118** (api 60 + shared 4 không đổi), lint + build xanh; commit `906d576` (11 file) push `develop`

### Chi tiết Bình đẳng hoá danh mục — bỏ khoá preset (24/09/2026)
- **Yêu cầu user**: bỏ nhãn "Danh mục mặc định" khỏi bảng, không phân biệt preset/tự tạo ở UI — **preset sửa/xoá được bình đẳng** như danh mục thường. "Mặc định" chỉ còn nghĩa: 7 danh mục tạo tự động khi lập family mới
- **API** (`category.routes.ts`): xoá guard `PRESET_LOCKED` ở PUT (preset giờ đổi được name/icon/order) và DELETE (preset giờ xoá được) — guard duy nhất còn lại cho mọi danh mục: 409 `CATEGORY_IN_USE` khi đang có khoản chi · 404 `CATEGORY_NOT_FOUND`
- **Giữ field `isPreset`** (schema + type shared + response): chỉ còn ghi nhận nguồn gốc, không có hành vi riêng — KHÔNG cần migration (reviewer đồng ý defer việc xoá field → task riêng nếu cần)
- **FE**: `CategoriesPage` bỏ nhãn + bỏ điều kiện `!category.isPreset &&` ở nút sửa/xoá → mọi hàng đủ 4 nút (↑ ↓ ✏️ 🗑) · `CategoriesSkeleton` bỏ 1 dòng (từng mô phỏng nhãn) · comment `dataApi.updateCategory`/`deleteCategory` cập nhật · JSDoc `Category.isPreset` (shared): "chỉ ghi nhận nguồn gốc"
- **Tests**: API — 2 test viết lại (preset sửa 200, preset xoá 200) + 1 mới (preset **đang có khoản chi** → 409 CATEGORY_IN_USE, ghim guard duy nhất còn lại) · FE — test render viết lại (mọi hàng đủ 4 nút, `queryAllByText("Danh mục mặc định")` = 0) · **api 61/61, web 151/151** (full 215+1=216/216 với shared 4), lint + build xanh
- **Verified browser thật** (dev DB "Nhà Skeleton"): 7 hàng đều đủ 4 nút, không nhãn mặc định · **rename preset** "Ăn uống" → "Ăn uống & giải khát" OK (trước đây 403) · **xoá preset** "Khác" OK (trước đây 403) → sau đó khôi phục DB (đổi tên lại + thêm "Khác" 📦)
- **Review** (agent riêng): DUYỆT CÓ ĐIỀU KIỆN — 0 CRITICAL/HIGH · LOW đã xử lý: comment lỗi thời `deleteCategory` · test 409 xoá preset · plan.md "preset khoá" → "bình đẳng" · JSDoc `isPreset` · **Issue có sẵn DEFERRED (ngoài scope)**: PUT không pre-check trùng tên trong family → Prisma P2002 → 500 INTERNAL_ERROR (trước đây đã reachable với danh mục tự tạo, task này chỉ mở rộng mặt kích hoạt) — muốn fix: pre-check như POST → 409 `CATEGORY_EXISTS`, hoặc map P2002 trong errorHandler
- **Kết quả**: commit `1c7003d` push `develop`

### Chi tiết Quản lý danh mục chi tiêu (24/09/2026)
- **Quyết định user**: mọi member được quản lý (không đổi API) · có reorder (nút lên/xuống) · trang riêng `/categories` (vào từ MePage)
- **API đã sẵn từ Task 5** (không sửa): GET/POST/PUT/DELETE `/api/families/:id/categories` — model có `order` + `isPreset`; POST tên 2-30 unique trong family (409 CATEGORY_EXISTS) · PUT preset chỉ đổi được `order` (403 PRESET_LOCKED) · DELETE chặn preset + đang có khoản (409 CATEGORY_IN_USE)
- `dataApi.ts` (commit `d6880dd`): `createCategory`/`updateCategory`/`deleteCategory` — mutation không đi read cache
- `features/categories/CategoriesPage.tsx` + `CategoriesSkeleton.tsx` (commit `0c33ae9`): list hàng (icon + tên + nhãn "Danh mục mặc định") với 4 nút ↑↓ (mọi hàng) ✏️ 🗑 (không preset) · Modal thêm/sửa: tên (validate client 2-30) + lưới 24 emoji gợi ý (gồm 7 icon preset) + ô nhập emoji tự (1-8) · ConfirmDialog xoá (danger) · reorder = swap `order` 2 hàng liền kề (2 PUT song song, giữ invariant order duy nhất)
- **refetchSilent**: sau mỗi mutation OK → cập nhật list từ response + `fetchCategories` ngầm đồng bộ read cache; **guard `activeFamilyId` ở thời điểm resolve** (fix MEDIUM review — đổi family giữa chừng không ghi đè list family khác)
- MePage: card "Danh mục chi tiêu" sau card family → `/categories`; route mới trong AppShell (không bottom nav, precedent `/expenses/:id/edit`); `icons.tsx` +TagIcon/PencilIcon/ArrowUpIcon/ArrowDownIcon
- **Tests 13 mới** (web 137 → 151): `CategoriesPage`(12: render + ẩn nút preset, skeleton, fetch lỗi + retry, thêm OK/validate/409/offline, sửa pre-fill, xoá confirm/cancel/409 in-use, reorder swap + fail) · `MePage`(+1: nav)
- **Verified browser thật**: MePage → /categories (7 preset đúng thứ tự, ẩn nút preset) · thêm "Tiền điện" 💧 (validate chặn khi chưa chọn icon) · reorder lên · sửa pre-fill (name + icon) · xoá confirm danger → 7 preset
- **Review** (agent riêng, cả 2 commit): DUYỆT / DUYỆT CÓ ĐIỀU KIỆN — 0 CRITICAL/HIGH · MEDIUM (refetchSilent không guard family — đã fix) · LOW đã xử lý: assert refetch ngầm trong test + test reorder fail · a11y grid emoji (role=group + aria-labelledby) · LOW để nghiên cứu sau: partial-failure 2 PUT reorder → order trùng (cần endpoint swap hoặc `@@unique([familyId, order])` phía API — ngoài scope)
- **Kết quả**: full suite **215/215** (web 151, api 60, shared 4), lint + build xanh; commit `d6880dd` + `0c33ae9` push `develop`

### Chi tiết Modal xác nhận (24/09/2026)
- **Yêu cầu**: thay dialog mặc định (window.confirm/prompt) bằng modal đồng nhất UI app. User chốt: **centered card mọi kích thước** (không bottom sheet) + **không modal cho mã mời** (bỏ fallback prompt — mã hiển thị sẵn trong card để copy tay)
- `shared/ui/Modal.tsx` (mới) — card giữa màn mọi kích thước: overlay `fixed inset-0 z-50 bg-ink/40 p-4` + card `bg-card rounded-2xl shadow-lg max-w-sm p-5`, `role="dialog" aria-modal` + `aria-labelledby` (useId), đóng bằng Esc + click overlay (check `e.target === e.currentTarget`), focus vào dialog khi mở (trả về trigger khi đóng), focus trap (Tab wrap), khoá scroll body, `disableDismiss` chặn mọi đường đóng khi chờ API
- `shared/ui/ConfirmDialog.tsx` (mới) — title + message + hàng 2 nút flex-1 (Huỷ=secondary, confirm=primary|`danger`), `loading` → cả 2 disable + spinner, truyền `disableDismiss={loading}`
- `index.css` — `--animate-fade-in` + `--animate-modal-in` (150ms) vào block `@theme` (Tailwind v4)
- `HistoryPage` — `deleteTarget: Expense | null`; 🗑 → mở dialog; đóng trong `finally` **guard theo id** (`setDeleteTarget(t => t?.id === expense.id ? null : t)` + tương tự `deletingId`) tránh race giữa 2 lần mở
- `MePage` — đăng xuất qua dialog (danger); bỏ fallback `window.prompt` (clipboard fail → do nothing, mã mời hiển thị sẵn trong card)
- **Tests 15 mới + 5 cập nhật** (web 118 → 133): `Modal`(8: render/aria, không render khi đóng, click overlay vs thân, Esc, khoá scroll, **Tab-wrap kể cả focus ở container** (MEDIUM review), **trả focus về trigger**, disableDismiss) · `ConfirmDialog`(4: render, onConfirm/onCancel, danger/primary, loading) · `HistoryPage`(+2: API fail → dialog đóng + banner + khoản còn, Esc → không gọi API) · `MePage`(+1: clipboard fail → không prompt, không "Đã copy", mã vẫn hiện)
- **Verified browser thật** (dev server, tài khoản test): modal đăng xuất (role/aria-modal/danger/overlay/body-lock; đóng bằng Esc + Huỷ; mở lại OK) · tạo khoản 50.000 Ăn uống → History → dialog `Xoá khoản "Ăn uống" (50.000 ₫)?` → bấm Xoá → khoản xoá + dialog đóng, không lỗi
- **Review** (agent riêng): DUYỆT CÓ ĐIỀU KIỆN — 0 CRITICAL/HIGH · 1 MEDIUM (focus ban đầu ở container `tabIndex=-1` → Tab văng ra ngoài modal; bẫy: **`Node.contains()` trả true cho chính node** nên guard `!contains(activeElement)` không khớp → fix: check "active không nằm trong danh sách focusable của dialog" rồi kéo về first/last) · LOW đã fix: `disableDismiss` khi loading, race `finally` (guard id), bỏ `stopPropagation` no-op, bổ sung test Tab-wrap + focus-restore; LOW chấp nhận: drag-select từ card ra overlay (edge hiếm)
- **Kết quả**: unit web **133/133** (api 60 + shared 4 không đổi), lint + build xanh; commit `22f9471` (9 file) push `develop`

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

## Trạng thái Git + Production (cập nhật 25/09/2026)
- `develop` = commit docs sau `58eaab0` (feat stats byMember) — **chưa push** (chờ xác nhận user đã Save Production Branch = `release-disabled` trên Vercel); `main` = `32b1719` (**PR #7 `develop → main` đã merge ~20:24 25/09** → main ≡ develop, production đã chạy code mới — DB migrate trước đó nên không pending)
- **CHƯA RÕ**: production deployment của PR #7 do git-integration Vercel tạo khi push `main` (KHÔNG phải Actions CD) → tại thời điểm merge, Production Branch vẫn trỏ `main`; bước Save Production Branch = `release-disabled` (option B) cần xác nhận lại trên dashboard
- `release-disabled` = branch đóng băng vĩnh viễn cho Production Branch Vercel (option B — production chỉ deploy qua Actions `vercel deploy --prod`)
- **Production** (`https://expense-tracker-long-7bf1.vercel.app`) = code `4545b87` + DB đã migrate (`20260925120000_add_username` apply tay sau incident 25/09) — chạy ổn
- Các commit chính sau release v1.0 (xem `git log --oneline`): `cbc9526` (perf: pin region sin1, PR #5) · `408e4b4` (keep-warm cron, PR #6) · `1603146` (xoá keep-warm.yml — thay bằng UptimeRobot) · `906d576` (skeleton + no-flicker) · `22f9471` (modal + ConfirmDialog) · `d6880dd` + `0c33ae9` (quản lý danh mục) · `1c7003d` (bình đẳng hoá preset) · `3655604` (username thay email) + `452a28e` + `4545b87` (docs) · `58eaab0` (stats byMember)
- Git identity set **riêng cho repo** (không global): `Long NT` / `nice231096@gmail.com`
- Working tree clean
- Baseline test hiện tại: **web 158** · api 63 · shared 4 (tổng 225)

## Đang làm
- (không) — **toàn bộ 14 WBS trong plan.md §10 đã hoàn tất**; keep-warm đã chuyển xong sang UptimeRobot (monitor ping 5 phút xanh đều + cảnh báo down)

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
- Auth: JWT access (in-memory FE) + refresh cookie httpOnly, rotation, stateless — token theo `userId`, không phụ thuộc username/email (đổi định danh không phá phiên)
- **Đăng nhập bằng username** (25/09): username 2-20 ký tự `a-z 0-9 . _` bắt đầu/kết thúc bằng chữ hoặc số, tự lowercase, unique — định danh login duy nhất; email nullable chỉ ghi nhận nguồn gốc (backfill từ phần trước @ của email cũ); không có tính năng đổi username sau (YAGNI)
- DB: SQLite dev → PostgreSQL prod (Prisma 6.19)
- API envelope: `{ success, data, error, meta }`
- **Offline (Task 12)**: ghi offline trigger = `ApiError` status 0 (mạng) hoặc ≥ 500 (5xx); 4xx **không** bao giờ ghi offline / fallback cache. Read cache = stale-while-error, không TTL. Sync trigger = khởi động app + event `online` + interval 30s khi còn khoản chờ. IndexedDB DB `etracker-offline` (stores `expenses`, `cache`)
- **Icon PWA**: sinh bằng `scripts/generate-icons.mjs` (chạy lại nếu đổi design: donut trắng trên nền teal), file PNG commit vào repo
- Commit: Conventional Commits, thẳng `develop`, 1 task = 1 commit; remote `origin` = https://github.com/longconuet/expense-tracker.git

## Issue deferred (không chặn — làm khi cần)
- **Map Prisma P2002 trong `errorHandler`** (lấp chung 2 case): (1) PUT category đổi tên trùng trong family → 500 thay vì 409 (có sẵn từ task quản lý danh mục); (2) race register: `findUnique` + `create` không nguyên tử, 2 request trùng username song song → P2002 → 500 thay vì 409 (unique index vẫn chặn vỡ dữ liệu). Fix: map `code === "P2002"` → 409 code thích hợp, hoặc pre-check như POST category
- **Rate limit `/api/auth/*`** (brute force): chưa có; username ngắn dễ đoán hơn email — follow-up `express-rate-limit`. (Side-channel timing nhỏ khi user không tồn tại — bỏ qua)
- **Reorder 2 PUT song song** (task quản lý danh mục): partial-failure → order trùng; cần endpoint swap hoặc `@@unique([familyId, order])` phía API
- **Migration backfill edge pathological**: 2 email trùng prefix + user thứ 3 đã có sẵn username đúng bằng hậu tố (VD `a@x`, `a@y`, `a_2@z`) → unique index fail khi migrate (rollback sạch, không nửa vời) — gần như không thể xảy ra với quy mô app

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
- **Vercel (bắt buộc nhớ)**: project git-integration với GitHub, **Production Branch = mặc định (`develop`) → push `develop` = auto-deploy production** (không test gate, không migrate). `deploy.yml` (test → migrate → deploy) chỉ chạy trên `main` (= v1.0, chưa dùng lại). **Mọi migration mới phải được apply vào prod TRƯỚC hoặc KHI code lên** — chi tiết + tuỳ chọn sửa pipeline xem mục "Chi tiết Đăng nhập bằng username" (incident 25/09)
- **GitHub PAT** `github_pat_11AFUQQB...` hết hạn 25/09 (API 401; git push vẫn hoạt động qua credential riêng) — cần token mới khi phải dùng GitHub API
- **Dev server** (đang **TẮT** sau task username 25/09 — user chạy `pnpm dev` khi cần): api :3001 · web dev :5173 · **preview PWA :4173** (build + SW + proxy API — chỉ khi chạy `vite preview` sau build)
- **E2E (Playwright)**: `pnpm test:e2e` (root) — tự bật API :3101 + `e2e.db` (reset mỗi lần) + web :5199 (proxy qua `VITE_API_PROXY_TARGET`), không đụng dev :3001/dev.db. Chromium đã cài sẵn máy
- **Test account dev DB** (sau migration username 25/09 — mật khẩu chung `MatKhau123!`): `sk_muf01glb` (family "Nhà Skeleton", owner) · `final` (family "Nhà Final", owner) · `test_verify_9x` (tài khoản verify browser, không có family) — username = phần trước @ của email cũ (gạch → `_`); email cũ vẫn giữ trong DB (nullable)
- **Windows**: `del`/`node -e` path absolute hay lỗi quote (cmd) → viết file `.cjs` tạm rồi `node <file>`; findstr quote cũng hay hỏng → để output nguyên, grep tay
- **Browser tool**: gọi qua Code Mode (`tools.browser["tabs.open"]`...), không gọi trực tiếp; `browser.screenshot` fail "needs a visible tab" → verify bằng `browser.evaluate`; input id tiếng Việt (VD `input-số-tiền`) hay lệch normalization khi truyền qua script → chọn input bằng `inputMode`/vị trí; click `a[href="/add"]` để SPA nav (giữ state page)

## Bản đồ API hoàn chỉnh (cho FE gọi)
- `POST /api/auth/register` {name,username,password} → 201 {user, accessToken} — 409 USERNAME_TAKEN
- `POST /api/auth/login` {username,password} → {user, accessToken} — 401 INVALID_CREDENTIALS (1 message chung, không tiết lộ tài khoản tồn tại)
- user trong mọi response: `{id, name, username}` (không có email) · username: 2-20 ký tự, `a-z 0-9 . _`, bắt đầu/kết thúc bằng chữ hoặc số, tự lowercase
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
