# Hướng dẫn Deployment

Kiến trúc: **API stateless** (Express + Prisma, auth bằng JWT access token in-memory + refresh cookie `httpOnly`) + **SPA web** (React PWA, build static). Không có service chạy nền phía server (tất cả logic đồng bộ offline nằm trong browser client) → triển khai đơn giản, scale ngang thoải mái.

2 tuỳ chọn:

| | **A. Self-host Docker** | **B. Vercel + Supabase** |
|---|---|---|
| Chi phí | 0 (1 VPS bất kỳ) / máy nhà | Free tier đủ dùng (Vercel Hobby + Supabase Free) |
| DB | PostgreSQL (named volume) | PostgreSQL (Supabase) |
| Bảo trì | Tự cập nhật (`compose up --build`) | Tự động theo Git push |
| Trạng thái | ✅ Đã build + chạy thử trong project này (xác minh lại với PG 23/09/2026) | 📋 Hướng dẫn — **cần kiểm chứng trước khi áp dụng** |

---

## Tuỳ chọn A — Self-host Docker (khuyến nghị)

File đã có sẵn trong repo:

| File | Vai trò |
|---|---|
| `apps/api/Dockerfile` | Image API (node:24-alpine, Prisma + tsx) |
| `apps/web/Dockerfile` | Image web (build Vite + PWA → nginx:alpine) |
| `apps/web/nginx.conf` | Serve SPA + proxy `/api` → container `api` (same domain — refresh cookie hoạt động, không cần CORS) |
| `docker/docker-compose.yml` | Orchestrate 3 container (postgres + api + web) + named volume `pgdata` |
| `docker/.env.example` | Mẫu biến môi trường |

### Chạy

Yêu cầu: Docker Desktop / Docker Engine 24+ với Compose.

```bash
cd docker
# Windows
copy .env.example .env
# macOS/Linux
cp .env.example .env
# Sửa .env: điền JWT_SECRET (chuỗi ngẫu nhiên, xem hướng dẫn trong file)

docker compose up -d --build
# App: http://localhost:8080   (đổi WEB_PORT trong .env nếu cần)
```

Container `api` tự chạy `prisma migrate deploy` khi khởi động — **không cần thao tác migration tay** khi cập nhật.

### Biến môi trường (`docker/.env`)

| Biến | Bắt buộc | Mặc định | Mô tả |
|---|---|---|---|
| `JWT_SECRET` | ✅ | — | Chuỗi ngẫu nhiên dài: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `WEB_PORT` | — | `8080` | Port expose web ra máy host |

`DATABASE_URL`/`DIRECT_URL` của API được đặt sẵn trong compose (`postgresql://etracker:etracker@postgres:5432/expense_tracker` — service postgres nội bộ, không expose port ra host).

### Dữ liệu & backup

- Toàn bộ dữ liệu nằm trong database `expense_tracker` (named volume `pgdata`).
- **Backup** (`pg_dump` — không cần dừng app):
  ```bash
  docker compose exec postgres pg_dump -U etracker expense_tracker > backup-ngay.sql
  ```
  Khôi phục: `docker compose exec -T postgres psql -U etracker -d expense_tracker < backup-ngay.sql`
- **Cập nhật app**: `git pull` → `docker compose up -d --build` (container `api` tự chạy `prisma migrate deploy` khi khởi động).

### Domain + HTTPS (nếu dùng tên miền)

Đặt reverse proxy (Caddy/Nginx/Traefik) trước container web, proxy port 80 của compose:

```
# Caddyfile — ví dụ
chi.tiengiadinh.vn {
    reverse_proxy localhost:8080
}
```

Không cần sửa gì trong app: web gọi API bằng đường dẫn tương đối (`/api/...`) và cookie không gắn domain cứng → hoạt động với mọi domain.

### PostgreSQL ở mọi môi trường (từ Phase 1 — 23/09/2026)

Schema Prisma dùng **PostgreSQL cho tất cả môi trường**: dev/test/e2e chạy Postgres qua Docker (`docker-compose.dev.yml` ở root repo), self-host chạy service `postgres` trong compose ở trên, Vercel+Supabase chạy trên Supabase. SQLite không còn dùng ở đâu — không còn bước "nâng cấp SQLite → PostgreSQL".

### Kết quả kiểm chứng trong project này

Chạy `docker compose up -d --build` trên máy dev (Docker Desktop, Windows) — **23/09/2026, sau khi chuyển PostgreSQL**:

- **Build**: 2 image thành công (`node:24-alpine` cho api, `nginx:alpine` cho web — web build chạy `tsc` + `vite` + PWA trong container) + container `postgres:16-alpine`. Container `api` chờ postgres **healthy** rồi mới start (tự chạy `prisma migrate deploy` với migration PG).
- **Smoke test qua `http://localhost:8080`** (request đi qua proxy nginx → container api, đúng đường như người dùng thật):
  - `GET /api/health` → 200 · `GET /` → 200 (SPA + manifest PWA)
  - `POST /api/auth/register` → 201 (dữ liệu ghi vào Postgres volume) · `POST /api/families` → 201 + 7 preset categories
  - `POST /api/expenses` → 201 · `GET .../expenses` → đúng 1 khoản
- Dọn dẹp sau test: `docker compose down -v` (xoá container + volume test).

---

## Tuỳ chọn B — Vercel + Supabase (PostgreSQL)

📖 **Guide chi tiết (kèm CI/CD GitHub Actions): [`docs/deploy-vercel.md`](deploy-vercel.md)** — 5 phase:

1. **Chuyển project sang PostgreSQL** (bắt buộc — Prisma không cho schema SQLite chạy trên Postgres; dev local chạy Postgres qua Docker)
2. Tạo project Supabase (lấy 2 connection string: direct `:5432` cho migration + session pooler `:6543` cho runtime)
3. Tạo project Vercel (monorepo — FE + API **cùng domain** để refresh cookie hoạt động; cấu hình không auto-deploy production)
4. GitHub Actions: PR → CI + preview · push `main` → test → `prisma migrate deploy` → `vercel deploy --prod`
5. Verify + go-live (checklist + troubleshooting)

File đã sẵn trong repo: `vercel.json` · `apps/api/src/vercel.ts` · `.github/workflows/ci.yml` + `deploy.yml`.

> Trạng thái: hướng dẫn đã viết đủ chi tiết; **chưa chạy thử** trên Vercel/Supabase thật — Phase 1 làm trong repo, Phase 2–5 làm theo guide (tổng ~30 phút click dashboard).
