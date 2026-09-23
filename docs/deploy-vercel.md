# Hướng dẫn deploy: Vercel + Supabase (PostgreSQL) + CI/CD GitHub Actions

Guide cho production: **API Express chạy serverless trên Vercel** + **PostgreSQL quản lý trên Supabase** + **CI/CD bằng GitHub Actions**.

> Tiền đề quan trọng: Prisma KHÔNG cho chạy 1 schema `provider = "sqlite"` trên PostgreSQL. Vì vậy trước khi deploy **bắt buộc Phase 1** (chuyển cả project sang PostgreSQL — dev local chạy Postgres qua Docker, prod chạy Supabase — dev/prod đồng nhất schema).

## Kiến trúc tổng quan

```mermaid
flowchart LR
  classDef client fill:#3B82F6,stroke:#1D4ED8,color:#fff
  classDef gateway fill:#F59E0B,stroke:#B45309,color:#fff
  classDef service fill:#8B5CF6,stroke:#6D28D9,color:#fff
  classDef db fill:#22C55E,stroke:#15803D,color:#fff
  classDef third fill:#6B7280,stroke:#374151,color:#fff

  B["Browser / PWA<br/>(khách gia đình)"]:::client
  VE["Vercel Edge<br/>(1 domain duy nhất)"]:::gateway
  WEB["Web static<br/>Vite build + PWA service worker"]:::service
  API["API Express 5<br/>serverless function"]:::service
  PG[("Supabase<br/>PostgreSQL")]:::db
  GHA["GitHub Actions<br/>(CI + CD)"]:::third

  B -->|https — same domain, refresh cookie httpOnly| VE
  VE --> WEB
  VE -->|/api/*| API
  API -->|Prisma — session pooler :6543| PG
  GHA -->|prisma migrate deploy — direct :5432| PG
  GHA -->|vercel deploy --prod| VE
```

Điểm mấu chốt:

- **FE + API cùng 1 domain Vercel** — refresh cookie `httpOnly` (không gắn `domain`) chỉ hoạt động same-origin; không cần CORS, không cần đổi code cookie.
- **2 connection string Supabase**: app runtime dùng **session pooler** (`:6543` — serverless không được mở connection dài), `prisma migrate deploy` dùng **direct** (`:5432` — migration không chạy được qua pooler). Prisma tự chọn đúng URL nhờ field `directUrl` trong schema.
- **GitHub Actions là CD duy nhất cho production**: test → migrate → deploy, đúng thứ tự. Vercel **không** auto-deploy production theo push (cấu hình ở Phase 3) → không có race giữa migration và code mới.

---

## Tổng quan các phase

| Phase | Việc | Ai làm | Thời lượng |
|---|---|---|---|
| **1** ✅ | Chuyển project sang PostgreSQL (schema, dev DB qua Docker, test, e2e, migrations mới) | **XONG** (23/09/2026 — chi tiết dưới) | ~1 task |
| **2** ✅ | Tạo project Supabase + lấy 2 connection string | **XONG** (23/09/2026 — đã verify thật) | ~5 phút |
| **3** ✅ | Tạo project Vercel + env + cấu hình không auto-deploy prod + fix deployment (shared dist, vercel.json modern, pgbouncer) | **XONG** (23/09/2026 — deployment production đã verify thật) | ~1 task |
| **4** ✅ | Thêm GitHub Secrets + bật workflows | **XONG** (23/09/2026 — 4 secrets đã thêm, CI xanh trên push + PR) | ~5 phút |
| **5** ✅ | Merge `develop → main` lần đầu → CI/CD chạy → verify | **XONG** (23/09/2026 — PR #1 + fix PR #2, CD xanh 3 job, verify production 9/9) | ~15 phút |

Các file **đã sẵn trong repo** (cập nhật trong Phase 3): `vercel.json` (root — config modern: `outputDirectory` + `functions`) · `api/index.ts` + `api/package.json` (entry serverless mỏng + ESM) · `apps/api/src/vercel.ts` (app Express) · `packages/shared/` (build sang `dist`) · `.github/workflows/ci.yml` · `.github/workflows/deploy.yml`. Phase 4 + 5 là các bước config bên ngoài repo.

---

## Phase 1 — Chuyển sang PostgreSQL ✅ (HOÀN TẤT 23/09/2026)

> Nếu đã làm xong phase này (schema `provider = "postgresql"`) thì nhảy tới Phase 2.
> Dưới đây là nội dung đã thực thi — giữ lại làm tài liệu tham chiếu.

### 1.1. Đổi provider schema

`apps/api/prisma/schema.prisma`:

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")   // runtime (dev + Vercel)
  directUrl = env("DIRECT_URL")     // prisma migrate CLI
}
```

Schema còn lại **không cần đổi gì** (không có enum/JSON — đã thiết kế portable từ đầu).

### 1.2. Dev DB: Postgres qua Docker (thay SQLite)

Tạo `docker-compose.dev.yml` ở root repo:

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: etracker
      POSTGRES_PASSWORD: etracker
      POSTGRES_DB: expense_tracker
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:
```

Chạy: `docker compose -f docker-compose.dev.yml up -d` (dừng: `... down`).

2 database cho test + e2e được tạo **tự động** bởi `dev-db.init.sql` (mount vào `/docker-entrypoint-initdb.d/`, chạy 1 lần khi volume PG khởi tạo): `expense_tracker_test` + `expense_tracker_e2e`. Volume đã tồn tại mà thiếu DB (trường hợp hiếm) thì chạy tay:

```bash
docker compose -f docker-compose.dev.yml exec postgres psql -U etracker -c "CREATE DATABASE expense_tracker_test;" -c "CREATE DATABASE expense_tracker_e2e;"
```

`apps/api/.env` (và `.env.example`):

```ini
DATABASE_URL="postgresql://etracker:etracker@localhost:5432/expense_tracker"
DIRECT_URL="postgresql://etracker:etracker@localhost:5432/expense_tracker"
JWT_SECRET="<chuỗi ngẫu nhiên>"
```

### 1.3. Tạo lại migrations cho PostgreSQL

Migrations SQLite cũ **không tương thích** PostgreSQL — đã xoá và tạo mới (migration `*_init` PG hiện có trong `apps/api/prisma/migrations/`):

```bash
# xoá migrations sqlite (data dev.db là tài khoản test — chấp nhận mất; Windows: rmdir /s /q)
pnpm --filter @expense-tracker/api exec prisma migrate dev --name init
```

### 1.4. Test + e2e chạy trên Postgres

- `apps/api/test/dbUrl.ts` (mới) — `testDatabaseUrl()`: default `postgresql://etracker:etracker@localhost:5432/expense_tracker_test`, CI override bằng env **`TEST_DATABASE_URL`** (dùng trong `vitest.config.ts` + `test/global-setup.ts` — `db push --force-reset` vẫn hoạt động trên PG).
- `apps/web/playwright.config.ts` — env API của `webServer`: `E2E_DATABASE_URL` (default `postgresql://etracker:etracker@localhost:5432/expense_tracker_e2e`) + `DIRECT_URL`.
- `.github/workflows/ci.yml` + `deploy.yml` — thêm env `TEST_DATABASE_URL` trỏ service postgres:16 trong Actions.
- **Kèm theo**: stack self-host `docker/` cũng thêm service `postgres:16` (schema 1 provider duy nhất — SQLite không còn tồn tại ở môi trường nào; xem `docs/deploy.md` §A).
- README: thêm bước `docker compose -f docker-compose.dev.yml up -d` trước `pnpm test` / `pnpm test:e2e`.

⚠️ Sau phase này, `pnpm dev` / `pnpm test` yêu cầu Postgres Docker đang chạy. (Đây là trade-off để dev = prod.)

---

## Phase 2 — Tạo Supabase (PostgreSQL managed) ✅ (XONG — verified 23/09/2026)

1. Đăng ký [supabase.com](https://supabase.com) (free) → **New project** (chọn region gần VN: `ap-southeast-1` Singapore, password cho DB).
2. Vào **Project Settings → Database → Connection string**, copy 2 URL:
   - **Direct** (port `5432`): `postgresql://postgres.<ref-project>:<pass>@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres`
   - **Session pooling** (port `6543`): cùng trên nhưng port `6543`
   - (Giao diện Supabase có thể hiển thị theo tab "URI" / "Session Pooling" — bản chất là 2 port này.)
3. Ghi lại 2 URL — dùng ở Phase 3 và 4.

> **Đã verify thật (23/09/2026, region `ap-southeast-1`):** format hoạt động đúng như trên — user **`postgres.<ref>`**, host shared **`aws-0-ap-southeast-1.pooler.supabase.com`** (direct `:5432` · session pooling `:6543`).
> ⚠️ Bẫy: URL mà UI Supabase mới hiển thị (host `db.<ref>.supabase.co`) có thể **không có record DNS** → lỗi `P1001 Can't reach`. Khi đó dùng format trên và verify: `prisma migrate deploy` với URL `:5432` + 1 query đơn giản qua Prisma Client với URL `:6543`. Migration **không** chạy qua `:6543` (schema engine + pgbouncer bị hang) — luôn dùng `:5432` cho migration.

Lưu ý free tier: DB **tự pause sau 1 tuần không hoạt động** → app bị lỗi kết nối cho tới khi vào dashboard bật lại (mục Troubleshooting).

---

## Phase 3 — Tạo project Vercel ✅ (XONG — deployment production verify thật 23/09/2026)

### 3.1. Tạo project

1. [vercel.com](https://vercel.com) → **Add New… → Project** → **Import** repo `longconuet/expense-tracker`.
   - **Framework Preset**: `Other` (có `vercel.json` ở root — Vercel tự dùng nó).
   - **Root Directory**: để trống (root repo — KHÔNG chọn `apps/web`).
   - Install command / Build command: để mặc định (vercel.json khai `buildCommand`).
2. **Environment Variables** — thêm 3 biến (scope **Production + Preview** đều tick):

   | Biến | Giá trị |
   |---|---|
   | `DATABASE_URL` | URL **transaction pooling** (`:6543` — pooler) + **`?pgbouncer=true`** ở cuối URL — bắt buộc cho Prisma, xem bẫy §3.2 |
   | `DIRECT_URL` | Connection string **session pooler** (`:5432` — pooler; hoặc direct `db.<ref>.supabase.co:5432`) — chỉ Prisma CLI (migrate) |
   | `JWT_SECRET` | Chuỗi ngẫu nhiên **mới** (khác dev): `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |

3. **Project Settings → General → Node.js Version**: chọn **22.x** (repo engines `>=20`; 22 là LTS ổn định trên Vercel).
4. ⚠️ **Quan trọng nhất** — tắt auto-deploy production:
   **Project Settings → Git → Production Branch: XÓA TRẮNG** (mặc định là `main`).
   → Kết quả: mỗi PR chỉ tạo **preview deployment**, production **chỉ** deploy qua `vercel deploy --prod` trong GitHub Actions (Phase 4) — đảm bảo migrations chạy xong trước khi code mới lên.

### 3.2. Cách Vercel build (đã có trong `vercel.json`)

```jsonc
{
  "buildCommand": "pnpm -r build",               // build shared (dist JS) + prisma generate + typecheck + Vite/PWA
  "outputDirectory": "apps/web/dist",             // static web → serve từ ROOT domain
  "functions": {
    "api/index.ts": { "maxDuration": 300 }        // API → serverless function (route /api)
  },
  "rewrites": [
    { "source": "/api/(.*)", "destination": "/api" },        // /api/* → function (PHẢI trước SPA fallback)
    { "source": "/(.*)", "destination": "/index.html" }      // SPA fallback (chỉ path không có file thật)
  ]
}
```

`api/index.ts` (root repo) là entry mỏng re-export app Express từ `apps/api/src/vercel.ts` — theo convention Vercel: file trong thư mục `api/` = serverless function tại route `/api`; rewrite `/api/(.*) → /api` đưa cả prefix `/api/*` về function (function nhận URL gốc, Express match route `/api/...`). `api/package.json` (`"type": "module"`) **bắt buộc** — không có nó, shim nằm ở root repo (không có `"type": "module"`) được compile ra CommonJS → `ERR_REQUIRE_ESM` khi require app ESM. `apps/api/src/vercel.ts` export thẳng Express app (không `.listen()`). Dev không dùng 2 file này.

> ⚠️ **Bẫy đã gặp thật (verify 23/09/2026):**
> - **Package workspace phải build ra `dist` (JS + d.ts)** — nếu `@expense-tracker/shared` export source TS (`main: src/index.ts`), function Vercel chết runtime `ERR_MODULE_NOT_FOUND ... shared/src/index.ts` (builder có copy package + transpile sang `.js`, nhưng `package.json` vẫn trỏ file `.ts` không tồn tại trong output). Fix: `packages/shared` có script `build` (tsc → `dist/`), mọi flow (dev/test/e2e/CI/Docker/Vercel) build shared **trước** — xem scripts root `package.json` + CI.
> - **KHÔNG dùng config `builds` (legacy) cho static** — Vercel mới (2026): trỏ `@vercel/static` vào file `index.html` riêng lẻ → output chỉ có đúng file đó (mất `assets/`, manifest, SW); trỏ **thư mục** → bị **skip lặng lẽ** → toàn bộ web 404. Dùng `outputDirectory` + `functions` (kiểm chứng bằng `npx vercel build` local + đọc `.vercel/output`).
> - **Prisma Client bị ghi đè bằng stub** — builder Vercel chạy `pnpm install` lần 2 ở bước build function; postinstall của `@prisma/client` không tìm thấy schema (nằm trong `apps/api/`) → **ghi đè client đã generate bằng stub** → runtime `@prisma/client did not initialize yet`. Fix: script `postinstall` ở root `package.json` (`pnpm --filter @expense-tracker/api exec prisma generate`) chạy **sau** mọi postinstall dependency → client luôn ở trạng thái generate.
> - **`?pgbouncer=true` bắt buộc trong `DATABASE_URL` (port 6543)** — `aws-<region>.pooler.supabase.com:6543` là **transaction mode** (Supavisor, không hỗ trợ prepared statements — sau 28/02/2025 port 6543 chỉ còn transaction). Prisma dùng prepared statement mặc định → lỗi **`prepared statement "s0" already exists`** (thường query đầu OK, query sau fail). Fix: thêm `?pgbouncer=true` vào cuối URL (Prisma tự chuyển simple protocol). URL `:5432` (session mode) và direct KHÔNG cần.
> - **SPA rewrite nuốt `/api/*`** — nếu `rewrites` chỉ có `/(.*) → /index.html`, mọi path `/api/...` trả về HTML của web (không vào function). Phải khai rewrite `/api/(.*) → /api` **trước** fallback.
> - **Deployment Protection (Vercel Authentication)**: nếu đang bật (Vercel có thể gợi ý bật khi tạo project), MỌI request bị chuyển hướng sang trang đăng nhập Vercel (API 401 + `vercel_auth_enabled` trong body). Tắt: **Project → Settings → Security → Deployment Protection → Off**.

### 3.3. Lấy Org ID + Project ID (cho Phase 4)

- **Org ID**: URL khi vào **Account → Settings** (hoặc Team): `vercel.com/<org>/settings` → `<org>` trong URL là slug; ID thật (dạng `org_xxx`) xem ở **Account → Settings → Team** (chọn team → "Team ID") hoặc chạy `npx vercel orgs` (có token).
- **Project ID**: **Project → Settings → General** — ID hiện trong trang (dạng `prj_xxx`), hoặc `npx vercel projects`.

### 3.4. Tạo Vercel Token

**Account (phải bạn — tôi không tạo được) → Settings → Tokens → Create Token**:
- Name: `gh-actions-deploy` · Scope: **Projects: Full** · chọn team.
- Copy token (chỉ hiện 1 lần) → dùng làm secret ở Phase 4.

---

## Phase 4 — GitHub Actions (CI/CD) ✅ (HOÀN TẤT 23/09/2026)

> Đã thêm 4 secrets (`SUPABASE_DIRECT_URL`, `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`). CI chạy xanh trên mọi push `develop` + PR. Chi tiết thực thi: Phase 5.

File workflow **đã có trong repo**: `.github/workflows/ci.yml` + `.github/workflows/deploy.yml`. Chỉ việc thêm secrets.

### 4.1. Thêm GitHub Secrets

Repo → **Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Giá trị |
|---|---|
| `SUPABASE_DIRECT_URL` | Connection string **direct** `:5432` (Phase 2) — **chỉ dùng cho migrate deploy** |
| `VERCEL_TOKEN` | Token Phase 3.4 |
| `VERCEL_ORG_ID` | Org ID (dạng `org_...`) |
| `VERCEL_PROJECT_ID` | Project ID (dạng `prj_...`) |

### 4.2. Mô hình CI/CD

```
PR (develop → main, hoặc nội bộ develop)
  ├─ CI: lint + unit/integration test (Postgres service trong Actions) + build
  └─ Vercel (qua GitHub integration): tạo PREVIEW deployment cho PR
       (preview dùng env scope Preview — trỏ cùng Supabase cũng được)

Push vào main (sau khi merge PR — theo git flow của repo)
  └─ deploy.yml: test → prisma migrate deploy (Supabase) → vercel deploy --prod
```

- Mỗi job `needs` job trước — **migrations luôn xong trước khi code mới serve traffic**.
- `concurrency: deploy-production` + `cancel-in-progress: false` — 2 deploy không chạy song song.
- CI chạy trên `pull_request` + push `develop`/`main`; CD chỉ chạy trên `main`.

### 4.3. Bật preview qua Vercel GitHub integration (tuỳ chọn nhưng nên bật)

Vercel project → **Settings → Git → Connect to Git** (nếu import lúc tạo project bằng cách này thì đã có) → mỗi PR sinh preview URL riêng (mục "Deployments" trong PR comment). Preview chỉ là bản thử — production vẫn chỉ qua Actions.

> Nếu muốn preview trỏ DB riêng (không đụng production data): tạo database thứ 2 trên Supabase (hoặc dùng schema `dev`), đặt env scope **Preview** trỏ sang nó. Với app gia đình, dùng chung DB production cho preview là chấp nhận được.

---

## Phase 5 — Chạy lần đầu + verify ✅ (HOÀN TẤT 23/09/2026)

1. Push `develop` lên GitHub → xem **CI chạy xanh** (Actions tab).
2. Mở PR `develop → main` → merge → **deploy.yml chạy**: test → migrate → deploy (xem log từng job).
3. Mở URL production `https://expense-tracker.vercel.app` (hoặc custom domain nếu có) — checklist:

   - [ ] `GET /api/health` → `{ "success": true, "data": { "status": "ok" } }`
   - [ ] **Đăng ký** tài khoản mới → tạo gia đình → 7 preset categories hiện
   - [ ] Nhập khoản chi (keypad) → hiện trang chủ, tiểu kết đúng
   - [ ] `/stats` render biểu đồ (chứng tỏ API + Prisma + Supabase nối OK)
   - [ ] F5 → phiên còn (refresh cookie hoạt động trên https)
   - [ ] **PWA**: menu trình duyệt → "Cài ứng dụng" hiện; chạy app đã cài offline → đọc được data, nhập chi vào queue, online lại → tự sync
   - [ ] Dark mode + mobile view ~390px

4. (Tuỳ chọn) **Custom domain**: Vercel project → **Settings → Domains** → thêm domain + theo dõi DNS (A/CNAME) → HTTPS tự cấp. App không cần đổi gì (dùng đường dẫn tương đối).

### Thực thi lần đầu (23/09/2026)

- **Tạo `main` + PR #1** (`develop → main`, 13 commits — release v1.0): merge commit `b6159c4`.
- **CD run 1 fail ở job `migrate`**: `P1012: Environment variable not found: DIRECT_URL` — job migrate chỉ set `DATABASE_URL` trong khi schema khai báo `directUrl = env("DIRECT_URL")` và runner không có `.env`. Fix: thêm `DIRECT_URL` vào env bước migrate (commit `123aa4a`, **PR #2**, merge `f6bae94`).
- **CD run 2 xanh 3 job** (~3,5 phút): test (lint+build+unit, PG service) → `prisma migrate deploy` vào Supabase `:5432` → `vercel deploy --prod`.
- **Production sau CD**: `https://expense-tracker-py2qaofkm-long-7bf1.vercel.app` — checklist verify qua API **9/9** (health, register, login + cookie `httpOnly+Secure+SameSite` trên https, tạo family, 7 preset, tạo khoản chi, list tháng, stats tổng/byCategory/byDay, **refresh bằng cookie không Bearer**, logout). PWA assets (sw.js/manifest/icons) + alias production verify OK.
- Kiểm tra PWA offline + dark mode + mobile 390px: xem trực tiếp trên trình duyệt (không tự động hoá được).

---

## Troubleshooting

| Triệu chứng | Nguyên nhân thường gặp | Xử lý |
|---|---|---|
| `P1001: Can't reach database server` (API trả 500) | URL sai / thiếu env / Supabase đang **paused** | Kiểm tra 3 env trong Vercel (Production scope); vào Supabase dashboard → Database → xem trạng thái, **Restore** nếu paused |
| `relation "public.users" does not exist` | Chưa chạy `prisma migrate deploy` (hoặc job migrate fail) | Xem log job `migrate` trong Actions; chạy tay `prisma migrate deploy` với `DATABASE_URL` = direct URL |
| Job `migrate` lỗi `provider sqlite` / schema mismatch | Push main **trước** khi làm Phase 1 | Hoàn tất Phase 1 (schema postgresql + migrations PG) rồi merge |
| Preview deployment không ăn env | Biến chỉ tick scope **Production** | Thêm scope **Preview** cho 3 biến trong Vercel |
| Build Vercel fail ở bước web | `pnpm` không nhận workspace (thếm when chọn root directory sai) | Project Settings → Root Directory phải là **root repo**; vercel.json ở root |
| Đăng nhập được nhưng request API 401 lặp đi lặp lại sau 15 phút | `JWT_SECRET` ở Vercel bị đổi/giữa 2 lần deploy khác nhau | Token cũ hết giá trị — user F1 (refresh cookie vẫn hợp lệ sẽ tự lấy token mới) |
| Cookie refresh không gửi (login lại liên tục) | FE và API **khác domain** | Đảm bảo deploy 1 project monorepo (same domain) theo Phase 3 |
| `P2024: No operations allowed` / `pgbouncer` errors | App runtime trỏ sang **direct** thay vì pooler | `DATABASE_URL` (Vercel) phải là URL `:6543` |
| GitHub Actions job `vercel deploy` báo 401 | Token thiếu scope / sai org | Tạo lại token scope **Projects: Full**, đúng team |
| API 500 `FUNCTION_INVOCATION_FAILED`, log `ERR_MODULE_NOT_FOUND ... @expense-tracker/shared/src/index.ts` | Package workspace export source TS (không có `dist`) | Build shared ra `dist` (bẫy §3.2 Phase 3); verify bằng `npx vercel build` local + đọc `.vercel/output` |
| Toàn bộ web 404 (kể cả `/index.html`, assets) | Config `builds` (legacy) + `@vercel/static` (file → chỉ copy file đó; thư mục → bị skip) | Dùng `outputDirectory` + `functions` (bẫy §3.2 Phase 3) |
| Mọi request bị redirect trang login Vercel (API 401, body có `vercel_auth_enabled`) | **Deployment Protection** đang bật | Project → Settings → Security → Deployment Protection → **Off** |
| API 500, log `ERR_REQUIRE_ESM ... from /var/task/api/index.js` | Shim `api/index.ts` ở root repo bị compile CommonJS (không có `"type": "module"`) | Có `api/package.json` với `"type": "module"` (bẫy §3.2 Phase 3) |
| API 500, log `@prisma/client did not initialize yet. Please run "prisma generate"` | Builder chạy `pnpm install` lần 2 → postinstall ghi đè client bằng stub | Root `package.json` có script `postinstall` chạy `prisma generate` (bẫy §3.2 Phase 3) |
| `/api/*` trả về HTML của web thay vì JSON | SPA rewrite `/(.*) → /index.html` khớp trước function | Rewrite `/api/(.*) → /api` phải đứng **trước** trong `vercel.json` (bẫy §3.2 Phase 3) |
| API 500, log `prepared statement "s0" already exists` (query đầu OK, query sau fail) | `DATABASE_URL` trỏ pooler **transaction mode** (`:6543`) mà thiếu `?pgbouncer=true` | Thêm `?pgbouncer=true` vào cuối `DATABASE_URL` trong Vercel + redeploy (bẫy §3.2 Phase 3) |
| Job `migrate` fail `P1012: Environment variable not found: DIRECT_URL` | Schema khai báo `directUrl = env("DIRECT_URL")` mà job migrate chỉ set `DATABASE_URL`; `prisma.config.ts` (dotenv) không có `.env` trên runner | Thêm `DIRECT_URL` (trùng `SUPABASE_DIRECT_URL`) vào `env:` của bước migrate trong `deploy.yml` (bẫy Phase 5) |

---

## Chi phí (tất cả có free tier)

| Dịch vụ | Free tier | Đủ cho |
|---|---|---|
| Supabase Free | 500 MB DB, 2 projects, pause sau 1 tuần idle | Dữ liệu gia đình (vài chục MB/năm) |
| Vercel Hobby | 100 GB bandwidth/tháng, dự án private/public | Lưu lượng gia đình + preview CI |
| GitHub Actions | 2.000 phút/tháng (repo private; public = không giới hạn) | ~50–100 lần CI/CD/tháng |

Chi phí thực tế dự kiến: **0 ₫** — trừ khi traffic vượt free tier hoặc muốn Supabase không pause (gói Pro ~$25/tháng).
