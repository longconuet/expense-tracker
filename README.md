# Chi Tiêu Gia Đình (Expense Tracker)

Web app (PWA) quản lý chi tiêu cho gia đình — mobile-first, nhập liệu nhanh, giao diện tối giản, chạy được offline.

> Kế hoạch chi tiết đã duyệt: [`docs/plan.md`](docs/plan.md) · Trạng thái công việc: [`docs/handoff/progress.md`](docs/handoff/progress.md) · Hướng dẫn deploy: [`docs/deploy.md`](docs/deploy.md) (Docker self-host) + [`docs/deploy-vercel.md`](docs/deploy-vercel.md) (Vercel + Supabase + CI/CD)

## Tính năng

- **5 màn**: Trang chủ (tổng tháng + danh sách nhóm theo ngày có tiểu kết) · Thống kê (donut theo danh mục + biểu đồ cột) · ➕ Nhập chi (keypad số lớn) · Lịch sử (lọc tháng/danh mục, chạm khoản để sửa, xoá) · Tôi
- **Gia đình**: nhiều người dùng cùng 1 family qua mã mời; quyền owner/member (chỉ người tạo + owner sửa/xoá)
- **Dark mode** · tiền VND định dạng Việt Nam (`1.234.567 ₫`)
- **PWA**: cài lên màn hình chính; offline — đọc dữ liệu từ cache, khoản nhập offline vào hàng đợi và **tự sync** khi server trở lại

## Tech stack

| Tầng | Công nghệ |
|---|---|
| Frontend | React 19 + TypeScript + Vite + Tailwind CSS v4 + Zustand + Recharts |
| PWA | vite-plugin-pwa (manifest + service worker, offline queue trong IndexedDB) |
| Backend | Node.js + Express 5 + TypeScript |
| ORM / DB | Prisma — SQLite (dev), PostgreSQL (prod) |
| Test | Vitest (unit/integration) + Playwright (E2E) |
| Monorepo | pnpm workspaces |

## Cấu trúc thư mục

```
expense-tracker/
├─ apps/
│  ├─ api/        # REST API (Express + Prisma) — src/, prisma/, test/
│  └─ web/        # PWA React (mobile-first) — src/, e2e/, scripts/
├─ packages/
│  └─ shared/     # Type + utility dùng chung (envelope API, formatVnd, preset category)
├─ docs/
│  ├─ plan.md     # Kế hoạch đã duyệt (stack, data model, API, UX, WBS)
│  ├─ deploy.md   # Hướng dẫn deploy (Docker self-host · Vercel + Supabase)
│  └─ handoff/    # Chạy tiếp trạng thái công việc giữa các session
├─ docker/        # docker-compose.yml + .env.example (self-host)
└─ tsconfig.base.json
```

## Chạy local

Yêu cầu: **Node.js 20+** (tested trên Node 24) · **pnpm 12** (repo pin `pnpm@12.5.1`).

### 1. Cài dependencies

```bash
pnpm install
```

### 2. Cấu hình API

```bash
# Windows
copy apps\api\.env.example apps\api\.env
# macOS/Linux
cp apps/api/.env.example apps/api/.env
```

Sửa `apps/api/.env`:

| Biến | Giá trị |
|---|---|
| `DATABASE_URL` | Để nguyên `file:./dev.db` (SQLite, đường dẫn tính từ `apps/api/prisma/`) |
| `JWT_SECRET` | **Bắt buộc đổi** — chuỗi ngẫu nhiên: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |

### 3. Tạo database

```bash
pnpm --filter @expense-tracker/api db:migrate
```

Lần chạy đầu tạo file `apps/api/prisma/dev.db` từ migration. Tuỳ chọn — seed family demo (mã mời `TEST12`, kèm preset categories — để thử luồng join):

```bash
pnpm --filter @expense-tracker/api db:seed
```

Tài khoản dùng để đăng nhập **tạo trực tiếp từ màn hình web** (mục Đăng ký) — không cần tạo sẵn.

### 4. Chạy dev

```bash
pnpm dev
```

- Web: <http://localhost:5173> (Vite đã proxy `/api` → `http://localhost:3001`)
- API: <http://localhost:3001/api/health>

### 5. Test PWA (offline)

Service worker + manifest **chỉ có ở build production** — dev server không chạy SW:

```bash
pnpm build
pnpm --filter @expense-tracker/web preview   # http://localhost:4173
```

Quy trình kiểm thử offline: mở app ở `:4173` → tắt API (kill process `:3001`) → nhập khoản chi → hiện banner "N khoản chi đang chờ đồng bộ" → bật lại API → reload app → khoản tự sync, banner mất.

> Nếu đổi code sau khi đã preview: build lại rồi **unregister service worker + xoá caches** trong DevTools (Application → Service Workers/Storage) trước khi reload.

## Scripts

| Lệnh (root) | Mô tả |
|---|---|
| `pnpm dev` | Chạy API + Web song song (dev) |
| `pnpm build` | Build tất cả packages (web: tsc + vite + PWA) |
| `pnpm test` | Unit/integration test tất cả packages (Vitest) |
| `pnpm test:e2e` | E2E Playwright — môi trường tự động: API `:3101` + `e2e.db` (reset mỗi lần) + web `:5199`, **không đụng** dev server/dev DB |
| `pnpm lint` | ESLint toàn repo |
| `pnpm format` | Prettier toàn repo |

Scripts phụ (chạy `pnpm --filter @expense-tracker/api <lệnh>`):

| Lệnh | Mô tả |
|---|---|
| `db:migrate` | `prisma migrate dev` — tạo/áp dụng migration |
| `db:deploy` | `prisma migrate deploy` — áp dụng migration (production) |
| `db:seed` | Seed demo (idempotent) |
| `db:studio` | Prisma Studio |

Scripts web: `e2e` (Playwright), `icons` (tái sinh icon PWA từ `apps/web/scripts/generate-icons.mjs`).

## Testing

- **Unit/integration** — Vitest, pattern AAA, coverage ≥ 80%: `pnpm test`
- **E2E** — Playwright trên Chromium thật (8 test: auth, nhập/sửa/xoá khoản, flow offline):
  ```bash
  # Lần đầu cần cài browser:
  pnpm --filter @expense-tracker/web exec playwright install chromium
  pnpm test:e2e
  ```
- **PWA/offline** — verify thủ công qua `vite preview` (mục 5 trên), dev server không có service worker.

## Quy ước API

- Mọi response trả về envelope `{ success, data, error, meta }` (`meta` cho phân trang: `page`, `pageSize`, `total`).
- Tiền: số nguyên VND, hiển thị `1.234.567 ₫` (dùng `formatVnd` từ `@expense-tracker/shared`).
- Auth: access token JWT giữ **in-memory** phía client; refresh token trong cookie `httpOnly` (BFF pattern — frontend không tự quản token).
- Danh mục chi tiêu: preset (Ăn uống, Đi lại, Mua sắm, Y tế, Giáo dục, Giải trí, Tiền điện nước, Khác) — tạo sẵn khi tạo family.

## Deployment

Xem [`docs/deploy.md`](docs/deploy.md):

- **Self-host Docker** (khuyến nghị cho gia đình): 2 container (api + web/nginx) + SQLite trên volume — có sẵn `docker/docker-compose.yml`.
- **Vercel + Supabase (Postgres)**: hướng dẫn từng bước (cần chuyển schema sang PostgreSQL).
