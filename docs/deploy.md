# Hướng dẫn Deployment

Kiến trúc: **API stateless** (Express + Prisma, auth bằng JWT access token in-memory + refresh cookie `httpOnly`) + **SPA web** (React PWA, build static). Không có service chạy nền phía server (tất cả logic đồng bộ offline nằm trong browser client) → triển khai đơn giản, scale ngang thoải mái.

2 tuỳ chọn:

| | **A. Self-host Docker** | **B. Vercel + Supabase** |
|---|---|---|
| Chi phí | 0 (1 VPS bất kỳ) / máy nhà | Free tier đủ dùng (Vercel Hobby + Supabase Free) |
| DB mặc định | SQLite (volume) — đơn giản nhất | PostgreSQL (Supabase) |
| Bảo trì | Tự cập nhật (`compose up --build`) | Tự động theo Git push |
| Trạng thái | ✅ Đã build + chạy thử trong project này | 📋 Hướng dẫn — **cần kiểm chứng trước khi áp dụng** |

---

## Tuỳ chọn A — Self-host Docker (khuyến nghị)

File đã có sẵn trong repo:

| File | Vai trò |
|---|---|
| `apps/api/Dockerfile` | Image API (node:24-alpine, Prisma + tsx) |
| `apps/web/Dockerfile` | Image web (build Vite + PWA → nginx:alpine) |
| `apps/web/nginx.conf` | Serve SPA + proxy `/api` → container `api` (same domain — refresh cookie hoạt động, không cần CORS) |
| `docker/docker-compose.yml` | Orchestrate 2 container + volume SQLite |
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

`DATABASE_URL` của API được đặt sẵn trong compose (`file:/data/et.db` — SQLite trên named volume `etdb`).

### Dữ liệu & backup

- Toàn bộ dữ liệu nằm trong file `et.db` (volume `etdb`).
- **Backup**: dừng app rồi sao chép file SQLite:
  ```bash
  docker compose down
  docker run --rm -v expense-tracker_etdb:/data -v %cd%:/backup alpine cp /data/et.db /backup/et-backup.db
  ```
  (macOS/Linux: thay `%cd%` bằng đường dẫn tuyệt đối.) Khôi phục: copy file vào volume theo hướng ngược lại.
- **Cập nhật app**: `git pull` → `docker compose up -d --build`.

### Domain + HTTPS (nếu dùng tên miền)

Đặt reverse proxy (Caddy/Nginx/Traefik) trước container web, proxy port 80 của compose:

```
# Caddyfile — ví dụ
chi.tiengiadinh.vn {
    reverse_proxy localhost:8080
}
```

Không cần sửa gì trong app: web gọi API bằng đường dẫn tương đối (`/api/...`) và cookie không gắn domain cứng → hoạt động với mọi domain.

### Nâng cấp PostgreSQL (tuỳ chọn)

SQLite đủ tốt cho dữ liệu gia đình trên 1 server. Chỉ chuyển PostgreSQL khi cần **nhiều instance API** hoặc DB ở hạ tầng riêng:

1. Đổi `provider = "sqlite"` → `provider = "postgresql"` trong `apps/api/prisma/schema.prisma`.
2. `DATABASE_URL=postgresql://user:pass@db-host:5432/expense_tracker`.
3. DB mới: `pnpm --filter @expense-tracker/api db:migrate` tạo migration PostgreSQL. DB cũ (SQLite) có dữ liệu: xuất → import thủ công (MVP chấp nhận khởi đầu mới).
4. Thêm service `postgres` vào `docker-compose.yml` và trỏ `DATABASE_URL` sang container đó.

> Lưu ý: SQLite và PostgreSQL có 2 bộ migration riêng (SQL sinh theo provider). Dev giữ SQLite, prod dùng PostgreSQL — migration file chia nhánh theo từng lần đổi provider, không dùng chung 1 thư mục `prisma/migrations` cho cả 2.

### Kết quả kiểm chứng trong project này

Chạy `docker compose up -d --build` trên máy dev (Docker Desktop, Windows):

- **Build**: 2 image thành công (`node:24-alpine` cho api, `nginx:alpine` cho web — web build chạy `tsc` + `vite` + PWA trong container).
- **Smoke test qua `http://localhost:8080`** (request đi qua proxy nginx → container api, đúng đường như người dùng thật):
  - `GET /api/health` → 200 · `GET /` → 200 (SPA + manifest PWA)
  - `POST /api/auth/register` → 201 (dữ liệu ghi vào SQLite volume) · `POST /api/auth/login` → 200 + access token
  - `POST /api/families` → 201 + 7 preset categories · `POST /api/expenses` → 201 · `GET .../expenses` → đúng 1 khoản · `POST /api/auth/refresh` → 200 (rotation)
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
