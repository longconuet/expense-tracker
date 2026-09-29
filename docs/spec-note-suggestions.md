# Spec — Gợi ý nhanh cho Ghi chú theo danh mục chi tiêu

> Task: mỗi danh mục chi tiêu có **danh sách gợi ý ghi chú nhanh** riêng (thiết lập ở màn
> Danh mục). Trên màn Tạo/Sửa khoản chi: khi chọn danh mục có gợi ý → hiện chips dưới ô
> Ghi chú; chạm chip → **thay thế** nội dung Ghi chú bằng gợi ý đó.

## 1. Yêu cầu (đã chốt với user 29/09/2026)

- Mỗi category tự có list gợi ý (per-family — category vốn đã per-family).
- Thiết lập gợi ý nằm **trong modal thêm/sửa danh mục** (`/categories`) — không có trang/endpoint riêng.
- Màn dùng gợi ý: **Tạo khoản chi (`/add`) + Sửa khoản chi (`/expenses/:id/edit`)** — 2 màn cùng layout, dùng chung 1 component.
- Chạm chip → **thay thế** nội dung Ghi chú hiện tại (kể cả khi đã gõ dở); user tự sửa tiếp được.
- **7 preset để trống** — không seed sẵn gợi ý mặc định, mỗi family tự set.
- Giới hạn: **≤ 8 gợi ý/danh mục**, mỗi gợi ý **1–30 ký tự** (sau trim).
- Offline: không đổi hành vi — categories có read cache (TTL 7d), mutation category đã là
  "online-only" (không queue) từ trước; `createExpense` offline queue vốn đã hỗ trợ `note`.

## 2. Dữ liệu

### Schema — 1 cột JSON trên `Category` (không tách bảng: list ngắn, luôn đọc/ghi cùng category)

```prisma
model Category {
  // ... hiện có
  noteSuggestions String? // JSON array string: ["Đổ xăng","Đặt xe"] | null = không có gợi ý
}
```

- Migration `add_category_note_suggestions`: **additive, nullable** — không đụng data cũ.
- Giá trị `null` (không phải `[]`): "chưa thiết lập" và "đã xoá hết" cùng nghĩa là không gợi ý.

### Kiểu shared (`packages/shared`)

```ts
export interface Category {
  // ... hiện có
  /** Gợi ý ghi chú nhanh (≤8 mục, mỗi mục 1–30 ký tự) — null = không có. */
  noteSuggestions?: string[] | null;
}
```

Field **optional** (không required): payload nested `Expense.category` (whitelist
`toExpenseDto` ở expense.routes) cố tình không chứa field này; nơi cần dùng
(`fetchCategories`) luôn normalize về `string[] | null` (mục 3.1) — precedent
`byMember` ở `fetchStats`.

## 3. API

Không có endpoint mới — mở rộng 2 route có sẵn của `categoryRouter`:

### `POST /api/families/:id/categories`

Body thêm field tuỳ chọn:

```jsonc
{ "name": "Đi lại", "icon": "🚗", "noteSuggestions": ["Đổ xăng", "Đặt xe", "Tiền gửi xe"] }
```

- Zod: `noteSuggestions: z.array(z.string().trim().min(1).max(30)).max(8).optional()`
- Không gửi → lưu `null`. Gửi `[]` → lưu `null` (bình thường hoá ở API, FE không gửi `[]`).
- Lỗi 400 `VALIDATION_ERROR`: > 8 mục · mục rỗng/sau-trim-rỗng · mục > 30 ký tự · không phải array string.

### `PUT /api/families/:id/categories/:categoryId`

- Zod thêm: `noteSuggestions: z.array(z.string().trim().min(1).max(30)).max(8).nullable().optional()`
- 3 trạng thái phân biệt rõ:
  - **không có key** → không động vào gợi ý hiện tại;
  - **`null`** → xoá hết gợi ý;
  - **array** → thay thế list (mỗi item đã trim).
- `[]` → bình thường hoá về `null` (cùng nghĩa).
- Refine "Không có trường nào cần cập nhật" giữ nguyên (tính số key — `null` vẫn là 1 key).

### `GET /api/families/:id/categories`

Map qua `toCategoryDto` (mới trong category.routes): spread row Prisma + parse
`noteSuggestions` từ JSON string về `string[] | null`. POST/PUT response cũng dùng
cùng `toCategoryDto`. Stats `byCategory` (stats.routes) cũng parse field này —
1 helper `parseNoteSuggestions` (lib) dùng chung, fallback null khi data dị thường
(không 500).

**Bình thường hoá ở 1 chỗ**: `dataApi.fetchCategories` map `noteSuggestions` — payload read cache
cũ (TTL 7d, ghi trước khi có field) không có key → `null`. Precedent: `fetchStats` normalize
`byMember`. Consumer (AddPage/EditPage) tin type, không check rải rác.

Không validate trùng ở API (chỉ trim) — dedupe làm ở FE trước khi gửi (mục 4.1).

## 4. Frontend

### 4.1 `CategoriesPage` — section "Gợi ý ghi chú nhanh" trong modal thêm/sửa

- Vị trí: dưới block Biểu tượng, trên lỗi form + nút Lưu.
- UI:
  - Label "Gợi ý ghi chú nhanh (không bắt buộc)" + hint "Tối đa 8 gợi ý, mỗi gợi ý tối đa 30 ký tự".
  - **Chips hiện có**: chip tròn (reuse visual chip gợi ý số tiền) + nút × bên phải để xoá (aria-label `Xoá gợi ý "<text>"`).
  - **Input thêm**: placeholder "VD: Đổ xăng" (maxLength 30) + nút ➕ (PlusIcon) bên cạnh; thêm bằng Enter hoặc nút.
- Hành vi thêm 1 gợi ý:
  - trim; rỗng → bỏ qua (không add);
  - > 30 ký tự → không thể (maxLength của input);
  - đã có (case-insensitive, so chuỗi đã trim) → không add lại (dedupe) — không hiện lỗi, hành vi "im lặng" như paste trùng;
  - đã có 8 mục → không add (nút ➕ + Enter đều chặn; có thể để input vẫn gõ được — không làm phức tạp thêm).
- Save:
  - list rỗng → payload `noteSuggestions: null` (kể cả mode create: không gửi hoặc gửi null — FE chọn **gửi `null`** để API bình thường hoá 1 đầu);
  - list ≠ rỗng → payload array (đã trim, đã dedupe ở khâu thêm).
- Edit: mở modal pre-fill chips từ `category.noteSuggestions` (null → rỗng).
- Không có "chế độ đang nhập" riêng: chip mới thêm hiện ngay, xoá chip cũng ngay (state local của form, save mới gửi API — nhất quán với name/icon).
- Modal đã có `max-h-full overflow-y-auto` → 8 chips + input không vỡ.

### 4.2 `features/expenses/NoteSuggestions.tsx` (component mới — presentational)

```tsx
interface NoteSuggestionsProps {
  suggestions: string[];
  onSelect: (text: string) => void;
  disabled?: boolean; // khi đang submit
}
```

- `suggestions.length === 0` → render `null` (không chiếm chỗ, không reserved height).
- Hàng chip **cuộn ngang** (`overflow-x-auto`), visual = chip gợi ý số tiền của AddPage
  (`rounded-full border border-border bg-card px-2 py-1.5 text-sm font-medium …`), `aria-label` từng chip = text gợi ý, `role="group"` aria-label="Gợi ý ghi chú".
- Chạm → `haptic(8)` + `onSelect(text)`. Không tự focus input (không mở bàn phím).
- Nằm trong `features/expenses/` (chỉ dùng trong 1 feature) — không đẩy lên `shared/ui`.

### 4.3 `AddPage`

- Dưới `Input` Ghi chú, cùng `Card`: `<NoteSuggestions suggestions={selectedCategory?.noteSuggestions ?? []} onSelect={setNote} disabled={submitting} />`.
- `setNote` = thay thế thẳng (kỳ vọng 1).
- Đổi danh mục → `selectedCategory` đổi → chips tự đổi/ẩn (derived từ state, không effect).
- Không reserved height cố định (khác chip số tiền): chips chỉ xuất hiện khi chọn danh mục
  có gợi ý — 1 lần shift layout khi chọn danh mục là chấp nhận (không nhấp nháy khi gõ).

### 4.4 `EditPage`

- Nối `NoteSuggestions` giống AddPage, `onSelect={setNote}`.
- Pre-fill note hiện có giữ nguyên; chạm chip → thay thế.

## 5. Test case

### 5.1 API — `category.test.ts` (supertest + Postgres test DB thật)

| # | Case | Kỳ vọng |
|---|------|---------|
| 1 | POST `{name, icon, noteSuggestions: ["A","B"]}` | 201, `category.noteSuggestions === ["A","B"]`, `isPreset:false` |
| 2 | POST không gửi `noteSuggestions` | 201, `noteSuggestions === null` |
| 3 | GET categories sau POST (test 1) | category đó trả `noteSuggestions` đúng, các category khác = `null` |
| 4 | PUT `{noteSuggestions: ["C"]}` | 200, list = `["C"]`, name/icon giữ nguyên |
| 5 | PUT `{noteSuggestions: null}` | 200, `noteSuggestions === null` |
| 6 | PUT `{name: "X"}` (không có key noteSuggestions) | 200, gợi ý cũ **giữ nguyên** |
| 7 | PUT `{noteSuggestions: []}` | 200, lưu `null` (bình thường hoá) |
| 8 | POST/PUT 9 mục | 400 `VALIDATION_ERROR` |
| 9 | POST/PUT mục rỗng `""` / chỉ khoảng trắng | 400 `VALIDATION_ERROR` |
| 10 | POST/PUT mục 31 ký tự | 400 `VALIDATION_ERROR` |
| 11 | PUT `noteSuggestions: "text"` (không phải array) | 400 `VALIDATION_ERROR` |
| 12 | Item có khoảng trắng đầu/cuối `["  X  "]` | 200, lưu `["X"]` (trim) |

### 5.2 FE — `dataApi.test.ts`

| # | Case | Kỳ vọng |
|---|------|---------|
| 13 | `fetchCategories` với payload có `noteSuggestions` | trả đúng array |
| 14 | `fetchCategories` với payload cache cũ (không có key) | trả `noteSuggestions === null` (không crash, không `undefined` trôi xuống UI) |
| 15 | `createCategory`/`updateCategory` gửi `noteSuggestions` | body PUT/POST đúng shape (mock apiFetch) |

### 5.3 FE — `CategoriesPage.test.tsx`

| # | Case | Kỳ vọng |
|---|------|---------|
| 16 | Modal create: gõ gợi ý + Enter | chip mới hiện ngay |
| 17 | Gõ gợi ý trùng case-insensitive (đã có "Đổ xăng" → gõ "đổ xăng") | không thêm chip thứ 2 |
| 18 | Gõ 8 gợi ý hợp lệ rồi thêm mục 9 | không thêm (vẫn 8 chips) |
| 19 | Xoá chip bằng nút × | chip biến mất |
| 20 | Lưu với 2 gợi ý | `createCategory`/`updateCategory` nhận `noteSuggestions: ["a","b"]` (trim) |
| 21 | Lưu khi không có gợi ý | payload `noteSuggestions: null` |
| 22 | Edit: mở modal category có `noteSuggestions` | pre-fill đúng chips |
| 23 | Edit: xoá hết chips rồi lưu | payload `noteSuggestions: null` |

### 5.4 FE — `NoteSuggestions.test.tsx` (component)

| # | Case | Kỳ vọng |
|---|------|---------|
| 24 | `suggestions: []` | render rỗng (không có group) |
| 25 | `suggestions: ["A","B"]` | hiện 2 chip đúng text, group aria-label đúng |
| 26 | Chạm chip | `onSelect` nhận đúng text 1 lần |
| 27 | `disabled` (đang submit) | chip disabled, không fire onSelect |

### 5.5 FE — `AddPage.test.tsx` / `EditPage.test.tsx`

| # | Case | Kỳ vọng |
|---|------|---------|
| 28 | Chọn category có `noteSuggestions` | hiện chips đúng list |
| 29 | Chưa chọn category / category không gợi ý | không có group "Gợi ý ghi chú" |
| 30 | Chạm chip | ô Ghi chú = text chip (thay thế) |
| 31 | Đã gõ note "abc", chạm chip "X" | ô Ghi chú = "X" (thay thế, không "abcX") |
| 32 | Đổi category A (có gợi ý) → B (không gợi ý) | chips ẩn; đổi sang C (gợi ý khác) → chips đổi |
| 33 | Submit với note từ chip | `createExpense`/`updateExpense` nhận `note` = text chip |

### 5.6 E2E (Playwright) — thêm vào `expense-flow.spec.ts` (hoặc spec riêng)

| # | Case | Kỳ vọng |
|---|------|---------|
| 34 | Vào /categories → mở modal "Đi lại" → thêm "Đổ xăng" + "Đặt xe" → lưu → /add → chọn Đi lại → chạm chip "Đổ xăng" → nhập số tiền + danh mục → Lưu → Lịch sử | note khoản mới = "Đổ xăng" (thấy ở nhóm "Hôm nay"); reload /categories → modal "Đi lại" vẫn có 2 chips |

## 6. Vạch ngoài (không làm trong task này)

- Gợi ý cho các trường khác (số tiền đã có sẵn; ngày/danh mục không làm).
- Sắp xếp thứ tự gợi ý trong list (giữ thứ tự user thêm — chưa có nhu cầu reorder).
- Backfill gợi ý cho family/category hiện có (chỉ family mới set tự).
- Đồng bộ gợi ý offline (category mutation vốn online-only — nhất quán hiện trạng).

## 7. Rủi ro / lưu ý deploy

- Migration additive (nullable TEXT) — nhưng **code mới SELECT cột này**: preview Vercel
  (deploy từ develop) sẽ 500 ở các endpoint categories cho tới khi `prisma migrate deploy`
  vào Supabase — đúng bẫy incident cột `username` (25/09). Production an toàn (option B:
  release qua PR `develop → main`, Actions migrate trước deploy). Sau khi push develop,
  user tự chạy migrate (lẽ trình bày lúc đó, không tự đụng production).
