# Kế hoạch đã duyệt — Chi Tiêu Gia Đình

> Chốt ngày 22/09/2026, user đã duyệt qua hội thoại. Đây là chuẩn để implement.

## 1. Mục tiêu & phạm vi
- Web app PWA quản lý chi tiêu gia đình, **mobile-first**, tiếng Việt, tiền VND (số nguyên).
- Mục tiêu UX: **nhập 1 khoản chi < 5 giây**.
- Nhiều thành viên nhập chung qua **mã gia đình** (mỗi người 1 tài khoản, ghi rõ người nhập).
- MVP: nhập chi siêu nhanh · lịch sử + lọc tháng/danh mục · thống kê & biểu đồ.
- Ngoài MVP (phase 2): ngân sách, thu nhập, nhiều ví.

## 2. Tech stack
| Tầng | Công nghệ |
|---|---|
| Frontend | React 19 + TypeScript + Vite + Tailwind CSS v4 + Zustand + Recharts |
| PWA | vite-plugin-pwa + IndexedDB (offline queue, tự sync) |
| Backend | Node.js + Express + TypeScript |
| ORM | Prisma — SQLite (dev) → PostgreSQL (prod), không sửa code khi đổi DB |
| Auth | JWT: access token (in-memory) + refresh token (httpOnly cookie) |
| Monorepo | pnpm workspaces: apps/web · apps/api · packages/shared |
| Test | Vitest (unit) · supertest (integration) · Playwright (E2E) — coverage ≥ 80% |

## 3. Data model
- `User`: id, name, email (unique), passwordHash
- `Family`: id, name, inviteCode (6 ký tự, unique)
- `FamilyMember`: familyId, userId, role (OWNER/MEMBER), joinedAt
- `Category`: familyId, name, icon, isPreset, order
- `Expense`: familyId, userId (người nhập), categoryId, amount (int VND), date (YYYY-MM-DD), note, createdAt
- Index: `(familyId, date)`, `(familyId, categoryId, date)`

## 4. API (envelope `{ success, data, error, meta }`)
- **Auth**: `POST /auth/register` · `POST /auth/login` · `POST /auth/refresh` · `GET /me`
- **Family**: `POST /families` (tạo, trả về mã) · `POST /families/join` {code} · `GET /families/:id` (thành viên) · `POST /families/:id/regenerate-code` · xoá/thoát thành viên
- **Category**: CRUD theo family — mọi danh mục bình đẳng (preset chỉ là danh mục khởi tạo khi lập family, không có hành vi riêng); xoá chặn 409 khi đang có khoản chi
- **Expense**: `GET /families/:id/expenses?month=&categoryId=&page=` (phân trang `meta`) · `POST /expenses` · `PUT/DELETE /expenses/:id`
- **Stats**: `GET /families/:id/stats?month=` → tổng tháng, theo danh mục (%), theo ngày, so tháng trước

## 5. Quyền sửa/xoá khoản chi
- Người **tạo** khoản chi → sửa/xoá khoản đó.
- **Owner family** → sửa/xoá tất cả.
- Thành viên khác: chỉ xem. **Enforce phía API**, không chỉ ẩn nút phía FE.

## 6. Màn hình & UX
Bottom nav 5 ô: **Trang chủ · Thống kê · ➕ (giữa, to) · Lịch sử · Tôi**

1. **➕ Nhập chi**: full-screen; danh mục cuộn ngang (viên tròn emoji to); bàn phím số to 64px+ (không dùng bàn phím hệ thống); ngày mặc định hôm nay (chạm để đổi); note optional; nút "Lưu" sáng lên khi đủ số + danh mục → 1 chạm gửi, haptic feedback.
2. **Trang chủ**: tổng chi tháng + % so tháng trước · 5 giao dịch gần nhất nhóm theo ngày.
3. **Lịch sử**: chọn tháng vuốt ngang + lọc chip danh mục · nhóm theo ngày có tiểu kết · chạm món để sửa/xoá.
4. **Thống kê**: tổng tháng · donut theo danh mục · biểu đồ cột theo ngày (30 ngày).
5. **Tôi**: hồ sơ · nhập/đổi mã gia đình · thành viên · quản lý danh mục · cài app (PWA) · dark mode.

## 7. Design tokens (Tailwind v4 `@theme`, 1 chỗ duy nhất)
| Token | Light | Dark |
|---|---|---|
| primary | `#0D9488` | `#2DD4BF` |
| primary-soft | `#CCFBF1` | `#134E4A` |
| surface | `#F8FAFA` | `#0F172A` |
| card | `#FFFFFF` | `#1E293B` |
| ink / ink-muted | `#0F172A` / `#64748B` | `#F1F5F9` / `#94A3B8` |
| danger | `#EF4444` | `#F87171` |

Dark mode: theo class, mặc định theo hệ thống, nút toggle ở màn "Tôi", ghi nhớ lựa chọn (localStorage).

## 8. Category mặc định (preset khi tạo family)
Ăn uống 🍜 · Đi lại 🚗 · Gia đình ⚡ · Sức khỏe 💊 · Vui chơi 🎬 · Mua sắm 🛒 · Khác 📦

## 9. PWA & offline
- Manifest + icons + nút "Cài ứng dụng".
- Offline: đọc dữ liệu cache (IndexedDB); khoản chi nhập offline vào hàng đợi, **tự sync khi có lại mạng**.
- App shell cache vĩnh viễn; API data cache ngắn.

## 10. WBS (1 task = 1 commit vào `develop`)
| # | Task |
|---|---|
| 1 | Scaffold monorepo (pnpm, web + api + shared, lint/test) |
| 2 | Prisma schema + migrations + seed |
| 3 | API Auth (register/login/refresh/JWT) |
| 4 | API Family + mã mời |
| 5 | API Categories + Expenses (CRUD, lọc, phân trang) |
| 6 | API Stats |
| 7 | FE: màn auth (đăng nhập/đăng ký/nhập mã gia đình) |
| 8 | FE: shell + bottom nav + design tokens + dark mode |
| 9 | FE: màn nhập chi (keypad) |
| 10 | FE: Trang chủ + Lịch sử (lọc) |
| 11 | FE: Thống kê + biểu đồ |
| 12 | PWA: manifest + SW + offline queue |
| 13 | Test: unit + integration + E2E |
| 14 | Polish + hướng dẫn chạy local + guide deploy |

## 11. Giả định đã chốt ngầm
- 1 người có thể thuộc nhiều family (MVP tập trung dùng 1).
- Chỉ VND, số nguyên (không thập phân).
- Date lưu dạng `YYYY-MM-DD` (ngày cục bộ), thống kê tính theo ngày.
- Deploy: local trước; guide Vercel/Supabase hoặc self-host ở task 14.
