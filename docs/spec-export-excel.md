# Spec — Export lịch sử chi tiêu ra Excel (.xlsx) / CSV (Google Sheets)

> Task: thêm nút "Export" trên màn Lịch sử chi tiêu. Click → chọn định dạng → server tạo file
> và trả thẳng trong response HTTP (`Content-Disposition: attachment`), trình duyệt tự lưu file.
> CSV mở lên Google Sheets được 1 chạm (File → Import → Upload).

## 1. Yêu cầu

- Xuất đúng dữ liệu theo filter đang bật trên màn hình (tháng + danh mục + thành viên), giống list.
- 2 định dạng: **.xlsx** (Excel) và **.csv** (Google Sheets / Excel).
- Quyền: mọi thành viên family đều export được (giống list).
- An toàn: cap số dòng để tránh response khổng lồ (Vercel: limit response ~4.5 MB + maxDuration 300s).
- Chạy được cả Vercel serverless lẫn self-host Docker (không phụ thuộc disk).

## 2. API

### `GET /api/families/:id/expenses/export.xlsx` và `/export.csv`

- Auth: `Authorization: Bearer <access>` (`requireAuth`) + `requireFamilyMember`.
- Query params (giống list, **không** phân trang): `month` (YYYY-MM), `date` (YYYY-MM-DD, ưu tiên hơn month), `categoryId`, `userId`.
- Thành công (200): file binary, **không** JSON envelope:
  - xlsx: `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
  - csv: `Content-Type: text/csv; charset=utf-8`, file có **UTF-8 BOM** đầu
  - `Content-Disposition: attachment; filename="chi-tieu-<scope>-<ts>.<ext>"`
    - `scope`: `YYYY-MM-DD` | `YYYY-MM` | `toan-bo` (theo filter áp dụng, date > month)
    - `ts`: `YYYYMMDDHHmmss` (UTC)
    - filename do server sinh toàn bộ (không dính user input) → không lo injection header
  - `Content-Length`
- Lỗi (JSON envelope, qua `errorHandler`):
  - `400 VALIDATION_ERROR` — month/date/userId sai định dạng (kể cả dạng array)
  - `401 UNAUTHORIZED` — thiếu/sai token
  - `403 NOT_FAMILY_MEMBER` — không phải thành viên family
  - `404 CATEGORY_NOT_FOUND` / `USER_NOT_IN_FAMILY` — filter trỏ ngoài family
  - `409 EXPORT_LIMIT_EXCEEDED` — vượt cap số dòng
- Cap: env `EXPORT_MAX_ROWS` (integer ≥ 1, mặc định **5000**).

### Nội dung file

- Column (2 format giống hệt): `Ngày · Số tiền (VNĐ) · Danh mục · Ghi chú · Người tạo · Ngày tạo (UTC)`
- Sắp xếp: `date DESC, createdAt DESC` (giống list).
- Column `Ngày` là text ISO `YYYY-MM-DD` — schema `date` là local date (String, không qua
  timezone): không mơ hồ, đúng mọi timezone, sort được, Google Sheets tự nhận là date.
- `Số tiền` luôn là **số** (csv: integer thuần, không phân nghìn) → spreadsheet tổng/sum được.
- `Ngày tạo (UTC)`: text `YYYY-MM-DD HH:mm` (UTC).
- **Chống CSV formula injection** (csv): field (danh mục/ghi chú/người tạo) bắt đầu bằng
  `= + - @` hoặc tab được thêm tiền tố `'` để Excel/Google Sheets coi là text.
  (xlsx không cần — exceljs ghi cell dạng text, không thành formula.)
- xlsx: header bold + nền xám nhạt; column Số tiền format `#,##0`.
- 0 dòng → vẫn trả file hợp lệ chỉ có hàng header.

## 3. Frontend

- Nút **Export** trên hàng tiêu đề (icon download, variant secondary, size sm).
- Click → Modal chọn định dạng:
  - "Excel (.xlsx)" (primary)
  - "CSV — mở bằng Google Sheets" (secondary)
  - Dòng mô tả filter đang áp dụng (tháng + danh mục + thành viên).
- Thành công: tự download bằng filename từ `Content-Disposition` → đóng modal.
- Thất bại: hiện message lỗi trong modal (`role=alert`), **không** đóng modal.
- Export gọi `apiFetchBinary` (chia sẻ 401-refresh + retry 1 lần với `apiFetch`) —
  **không** qua read cache PWA (luôn cần server).
- `core/dataApi.ts`: `exportExpenses(familyId, format, params) → { blob, filename }`.

## 4. Test case

### API (supertest + Postgres test DB thật, `EXPORT_MAX_ROWS=3`)

Data fixture: 3 khoản tháng 9 (09-20 owner "Cà phê", 09-21 member note
`đi chợ, mua "cá tươi"`, 09-22 owner) + 1 khoản tháng 8 (08-15 owner) — cùng danh mục "Ăn uống".

| #   | Case                                                      | Kỳ vọng                                                                                                                                         |
| --- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | xlsx `month=2026-09` (3 dòng)                             | 200, Content-Type xlsx, filename `chi-tieu-2026-09-<ts>.xlsx`, byte PK (xlsx hợp lệ), sheet 4 hàng (header + 3), giá trị đúng, dòng đầu = 09-22 |
| 2   | xlsx filter `userId` / `date`                             | đúng số dòng + giá trị tương ứng                                                                                                                |
| 3   | xlsx `date` không có data                                 | 200, sheet chỉ có header                                                                                                                        |
| 4   | csv `month=2026-09`                                       | 200, BOM, header đúng, field chứa `,` và `"` được quote (dấu `"` bên trong nhân đôi), amount không phân nghìn, `Ngày tạo (UTC)` đúng format     |
| 5   | không token                                               | 401 `UNAUTHORIZED` (cả 2 route)                                                                                                                 |
| 6   | người ngoài family                                        | 403 `NOT_FAMILY_MEMBER`                                                                                                                         |
| 7   | month sai (`2026-13`) / date không tồn tại (`2026-02-30`) | 400 `VALIDATION_ERROR`                                                                                                                          |
| 8   | `categoryId` ngoài family                                 | 404 `CATEGORY_NOT_FOUND`                                                                                                                        |
| 9   | 4 dòng > cap 3 (không filter)                             | 409 `EXPORT_LIMIT_EXCEEDED` envelope JSON (cả 2 route)                                                                                          |

### FE (Vitest + Testing Library)

| #   | Case                                                          | Kỳ vọng                                              |
| --- | ------------------------------------------------------------- | ---------------------------------------------------- |
| 10  | `exportExpenses` gộp query string (xlsx/csv, có/không filter) | đúng path                                            |
| 11  | `exportExpenses` nhận 409 envelope                            | ném `ApiError` code + message đúng                   |
| 12  | `exportExpenses` server lỗi 5xx không JSON                    | ném `ApiError` message mặc định kèm status           |
| 13  | HistoryPage: bấm Export → modal 2 lựa chọn; chọn Excel        | `exportExpenses` gọi với filter hiện tại, modal đóng |
| 14  | HistoryPage: export fail                                      | hiện lỗi trong modal, modal không đóng               |

## 5. Không nằm trong phạm vi

- Google Sheets API (service account / OAuth) — CSV là phương án thay thế đã chốt.
- Export định kỳ, link export gửi cho người khác.
- Export thống kê (Stats) — chỉ lịch sử chi tiêu.

## 6. File ảnh hưởng

- Mới: `apps/api/src/lib/expenseExport.ts`, `apps/api/src/__tests__/expense.export.test.ts`
- Đổi: `apps/api/src/routes/expense.routes.ts` (tách `resolveExpenseFilter` + 2 route export),
  `apps/api/src/env.ts`, `apps/api/.env.example`, `apps/api/package.json` (`exceljs`)
- Đổi: `apps/web/src/core/api.ts` (`apiFetchBinary`), `apps/web/src/core/dataApi.ts`
  (`exportExpenses`), `apps/web/src/features/history/HistoryPage.tsx` (nút Export + modal)
- Test FE: `apps/web/src/__tests__/dataApi.test.ts`, `apps/web/src/__tests__/HistoryPage.test.tsx`
