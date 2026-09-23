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

> ⚠️ Mục này là **hướng dẫn tham khảo, chưa được chạy thử** trong project — kiểm chứng từng bước trước khi áp dụng chính thức.

### 1. Database — Supabase

1. Tạo project trên [supabase.com](https://supabase.com) → **Database → Connection string** → lấy **Session pooling** (port `6543`) — serverless nên phải dùng pooling, không dùng direct connection (port `5432`).
2. Giá trị `DATABASE_URL`:
   ```
   postgresql://postgres.<ref-project>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres
   ```

### 2. Schema sang PostgreSQL

Như mục "Nâng cấp PostgreSQL" ở Tuỳ chọn A (đổi `provider` trong `schema.prisma` + migration PG).

### 3. Deploy monorepo lên Vercel

**Nguyên tắc quan trọng**: frontend và API **phải cùng domain** (refresh cookie `httpOnly` không chia sẻ giữa 2 domain) → deploy **cả repo làm 1 Vercel project** với `vercel.json` kiểu monorepo (API là serverless function + web là static):

```jsonc
// vercel.json (đặt ở ROOT repo)
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "builds": [
    { "src": "apps/api/src/index.ts", "use": "@vercel/node" },
    { "src": "apps/web/index.html", "use": "@vercel/static" }
  ],
  "routes": [
    { "src": "/api/(.*)", "dest": "apps/api/src/index.ts" },
    { "src": "/(.*)", "dest": "apps/web/index.html" }
  ]
}
```

Cài đặt: Vercel → **Add New Project → Import** repo này (root = root repo, KHÔNG chọn `apps/web` riêng).

Các bước kèm theo:

1. **Prisma Client** — function build cần `prisma generate` trước khi bundle. Thêm vào `apps/api/package.json`:
   ```json
   "postinstall": "prisma generate"
   ```
2. **Migrations** — Vercel không tự chạy migration; chạy 1 lần thủ công bằng `prisma migrate deploy` (trên máy local trỏ `DATABASE_URL` sang Supabase) hoặc thêm CI step.
3. **Environment variables** (Vercel project settings):
   - `DATABASE_URL` — connection string Supabase (pooling)
   - `JWT_SECRET` — chuỗi ngẫu nhiên (khác secret dev)
4. **Build web** — Vite auto-detect trong `apps/web` (build command `pnpm --filter @expense-tracker/web build` hoặc cấu hình theo hướng dẫn của Vercel cho monorepo).

### 4. Lưu ý đặc thù serverless

- API **stateless** (không giữ state giữa các request — token JWT + cookie) → phù hợp serverless.
- Không có cron/worker phía server (sync 30s + queue nằm trong browser) → không bị ảnh hưởng.
- Prisma trên Supabase: ưu tiên connection **pooling**; nếu gặp lỗi connection khi traffic cao → cân nhắc Prisma Accelerate (proxy connection pooling) — cần trả phí từ mức cao.
- PWA (service worker + IndexedDB) chạy nguyên vẹn ở chế độ static — không thay đổi.

### 5. Khi nào chọn B thay vì A

- Không muốn quản lý server (VPS, backup, HTTPS).
- Muốn CI/CD tự động theo Git push.
- Nhiều người dùng ngoài gia đình, cần DB managed (Postgres) từ đầu.

Ngược lại, gia đình 2–5 người dùng → **Tuỳ chọn A rẻ và ít rủi ro hơn** (0 cost, dữ liệu tự nắm trong tay).
