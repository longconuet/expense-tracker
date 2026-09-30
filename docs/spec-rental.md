# Spec — Tiền phòng trọ hàng tháng (rental fee calculator)

> Task: gia đình thuê phòng trọ — hàng tháng có các khoản cố định (tiền phòng, mạng,
> thang máy + vệ sinh, gửi xe) + tiền điện/nước tính theo số công tơ × đơn giá.
> User nhập từng tháng; **khi chốt thì tạo đúng 1 khoản chi trong tháng đó**
> (danh mục "Nhà trọ" 🏠) để thống kê chung với chi tiêu gia đình.

## 1. Yêu cầu (đã chốt với user 30/09/2026)

- **Setup mặc định 1 lần** (6 giá trị: 4 khoản cố định + 2 đơn giá) cho cả family.
  Tháng mới tạo ra tự kế thừa giá trị mặc định; **mỗi tháng vẫn sửa được từng trường
  trước khi chốt** (snapshot — tăng giá điện giữa năm không ảnh hưởng tháng cũ).
- **Tự động mang số công tơ**: `số cũ` tháng sau = `số mới` tháng trước (mật độ cao
  nhất trong data thật của user: 18.023 là "mới" tháng 7 = "cũ" tháng 8).
- **Chốt** → tạo **1 khoản chi duy nhất**: amount = Tổng, category "Nhà trọ" 🏠,
  date mặc định ngày 01 của tháng đó (sửa được, bắt buộc trong tháng), note =
  breakdown (mục 2.3).
- **Tháng đã chốt mở lại được** (OWNER): sửa → "Chốt lại" → **cập nhật** expense
  đã link (cùng id — không sinh khoản trùng).
- **Xoá tháng đã chốt** → xoá luôn expense liên kết.
- **Khoản chi do chốt trọ KHÔNG sửa/xoá được từ màn khoản chi thường** (API 409)
  — con đường duy nhất là màn phòng trọ (bảo toàn nhất quán snapshot ↔ expense).
- **Quyền**: mọi thành viên xem được; chỉ **OWNER** setup config / tạo / sửa /
  chốt / xoá tháng (middleware `requireOwner` có sẵn).
- **Preset mới "Nhà trọ" 🏠**: thêm vào `PRESET_CATEGORIES` (family mới tự có) +
  backfill 1 lần cho family đã tồn tại (raw SQL idempotent trong migration).
- **Offline**: list xem được qua read cache (TTL 24h như expenses); setup/chốt/xoá
  **online-only** (không đưa rental mutations vào offline queue — YAGNI, nhất quán
  với category mutations).
- UI mobile-first: **card "🏠 Tiền phòng trọ" trên Trang chủ** làm điểm vào →
  route `/rental` (không đụng bottom nav đang đầy 5 tab).

## 2. Dữ liệu

### 2.1 Schema — 2 model mới + link ngược trên `Expense` (Prisma)

```prisma
model RentalConfig {
  id              String   @id @default(cuid())
  familyId        String   @unique
  rent            Int      @default(0) // Tiền phòng (đ)
  internet        Int      @default(0) // Tiền mạng (đ)
  elevator        Int      @default(0) // Thang máy + vệ sinh (đ)
  parking         Int      @default(0) // Gửi xe (đ)
  electricityRate Int      @default(0) // Giá điện (đ/kWh)
  waterRate       Int      @default(0) // Giá nước (đ/m³)
  updatedAt       DateTime @updatedAt

  family Family @relation(fields: [familyId], references: [id], onDelete: Cascade)
}

model RentalMonth {
  id              String   @id @default(cuid())
  familyId        String
  month           String // "YYYY-MM"
  rent            Int
  internet        Int
  elevator        Int
  parking         Int
  oldElec         Int // số công tơ điện đầu kỳ (int kWh — số chỉ dồn tích)
  newElec         Int
  electricityRate Int
  oldWater        Int // số công tơ nước đầu kỳ (int m³)
  newWater        Int
  waterRate       Int
  status          String   @default("DRAFT") // "DRAFT" | "CONFIRMED"
  expenseId       String?  @unique // link 1-1 với Expense khi chốt
  confirmedAt     DateTime?
  updatedAt       DateTime @updatedAt

  family  Family   @relation(fields: [familyId], references: [id], onDelete: Cascade)
  expense Expense? @relation(fields: [expenseId], references: [id], onDelete: SetNull)

  @@unique([familyId, month])
  @@index([familyId])
}

model Expense {
  // ... hiện có
  rentalMonth RentalMonth? // link ngược — chỉ để guard, không cột DB mới
}
```

- Migration `add_rental`: **additive** (2 bảng mới + backfill SQL ở mục 2.4) —
  backward-compatible, hợp quy ước CI tự migrate khi push `develop`.
- `expenseId onDelete: SetNull`: safety net — nếu ai đó xoá expense qua tầng thấp,
  tháng không bị cascade xoá. Guard chính là chặn xoá/sửa expense đã link (mục 2.2).

### 2.2 Guard trên `expense.routes.ts`

`PUT /api/expenses/:id` và `DELETE /api/expenses/:id`: trước khi xử lý, check
`prisma.rentalMonth.findUnique({ where: { expenseId } })` — có → **409
`RENTAL_EXPENSE_LOCKED`** "Đây là khoản chi phòng trọ — hãy chỉnh/sửa ở màn
Tiền phòng trọ." (chống lệch snapshot ↔ expense). GET/list không ảnh hưởng.

### 2.3 Note của expense — server sinh (không do FE gửi)

Format (viết bởi `buildRentalNote` trong shared — 1 nguồn cho API + test):

```
Phòng trọ 07/2026: phòng 3.200.000 + mạng 100.000 + thang máy 200.000 + xe 100.000 + điện 280 kWh (1.120.000) + nước 6 m³ (210.000)
```

- Số tiền format `Intl.NumberFormat("vi-VN")` (không ký hiệu ₫ — note thuần mô tả).
- Tiêu thụ: số nguyên thì không dấu thập phân, không nguyên thì tối đa 2 chữ số
  (trim `.0` thừa).
- **Defensive**: nếu note > 200 ký tự (giá trị cực đoan ngoài cap thực tế) → cắt
  về 199 + `…`. Cap input (mục 3) đảm bảo case thực tế luôn < 200.

### 2.4 Backfill category "Nhà trọ" cho family đã tồn tại

Raw SQL **idempotent** trong cùng migration (chạy qua CI auto-migrate — không cần
bước tay trên Supabase):

```sql
INSERT INTO "Category" ("id", "familyId", "name", "icon", "isPreset", "order")
SELECT md5('rental-' || f.id), f.id, 'Nhà trọ', '🏠', true,
       (SELECT COALESCE(MAX(c2.order), 0) FROM "Category" c2 WHERE c2."familyId" = f.id) + 1
FROM "Family" f
WHERE NOT EXISTS (
  SELECT 1 FROM "Category" c WHERE c."familyId" = f.id AND c.name = 'Nhà trọ'
);
```

- Id `md5('rental-' || familyId)` — deterministic 32 hex, opaque (không vi phạm
  gì: `Category.id` là String, app không parse định dạng).
- Family cũ: "Nhà trọ" nằm **cuối list** (order = max+1); family mới: thứ tự
  trong `PRESET_CATEGORIES` (mục 2.5) — chấp nhận lệch thứ tự hiển thị.

### 2.5 `PRESET_CATEGORIES` (packages/shared) — thêm 1 mục

```ts
export const PRESET_CATEGORIES = [
  { name: "Ăn uống", icon: "🍜" },
  { name: "Đi lại", icon: "🚗" },
  { name: "Gia đình", icon: "⚡" },
  { name: "Nhà trọ", icon: "🏠" },   // MỚI — insert trước "Sức khỏe", giữ "Khác" cuối
  { name: "Sức khỏe", icon: "💊" },
  { name: "Vui chơi", icon: "🎬" },
  { name: "Mua sắm", icon: "🛒" },
  { name: "Khác", icon: "📦" },
] as const;
```

**Test phải cập nhật** (assert số preset = 7): `family.test.ts`
("seed 7 preset categories") + `category.test.ts` ("trả 7 preset mặc định") → 8.
`CategoriesPage.tsx` comment "7 preset" → sửa theo.

### 2.6 Types + pure functions trong `packages/shared` (`src/rental.ts` mới)

```ts
export const RENTAL_CATEGORY = { name: "Nhà trọ", icon: "🏠" } as const;

export interface RentalConfigFields {
  rent: number; internet: number; elevator: number; parking: number;
  electricityRate: number; waterRate: number;
}
export interface RentalConfig extends RentalConfigFields { updatedAt?: string }

export interface RentalMonthFields {   // 10 trường nhập được của 1 tháng
  rent: number; internet: number; elevator: number; parking: number;
  oldElec: number; newElec: number; electricityRate: number;
  oldWater: number; newWater: number; waterRate: number;
}
export interface RentalMonth extends RentalMonthFields {
  id: string;
  month: string;                       // "YYYY-MM"
  status: "DRAFT" | "CONFIRMED";
  expenseId: string | null;
  confirmedAt: string | null;          // ISO
  // computed — API trả về, FE tính live bằng cùng hàm computeRentalTotals:
  elecConsumption: number; waterConsumption: number;
  electricityCost: number; waterCost: number; total: number;
}
export interface RentalListResponse { config: RentalConfig | null; months: RentalMonth[] }

export interface RentalTotals {
  elecConsumption: number;   // raw (new - old), có thể âm nếu data trái phép
  waterConsumption: number;
  electricityCost: number;   // Math.round(elecConsumption * electricityRate)
  waterCost: number;         // Math.round(waterConsumption * waterRate)
  total: number;             // 4 khoản cố định + electricityCost + waterCost
}
```

**Số công tơ là int** (đã verify với 100% 30 dòng sổ sách thật: 18.023 − 17.743
= 280 kWh, 1.007 − 1.001 = 6 m³ — dấu chấm trong bảng Excel là ngăn cách hàng
nghìn, không phải dấu thập phân). Consumption do đó luôn int, cost = int × int
chính xác, không cần round thật (giữ `Math.round` làm phòng vệ).

Hàm (pure, export — API + FE dùng chung 1 nguồn):

- `computeRentalTotals(f: RentalMonthFields): RentalTotals` — consumption =
  `new - old` (raw, KHÔNG clamp — validation chặn âm ở 2 tầng API/FE); cost =
  `Math.round(consumption * rate)`; `total` luôn int.
- `formatMeter(value: number): string` — int chia hàng nghìn kiểu vi-VN:
  `280` → `"280"`, `1028` → `"1.028"`, `17743` → `"17.743"`.
- `isValidMonth(month: string): boolean` — `^\d{4}-(0[1-9]|1[0-2])$`.
- `isValidDateInMonth(date: string, month: string): boolean` — date hợp lệ thật
  (không 31/02) + cùng `YYYY-MM`.
- `firstDayOfMonth(month: string): string` — `"2026-07" → "2026-07-01"`.
- `lastDayOfMonth(month: string): string` — `"2026-02" → "2026-02-28"` (năm nhuận
  đúng — viết bằng Date, không hardcode bảng).
- `buildRentalNote(month: string, f: RentalMonthFields): string` — format mục 2.3,
  dùng `computeRentalTotals` + `formatMeter` + chia hàng nghìn regex kiểu vi-VN
  (cùng cách `formatVnd` — không phụ thuộc ICU); guarantee ≤ 200 ký tự.
- `RENTAL_NOTE_MAX = 200` (export const — khớp `Expense.note` max API).

## 3. API — `rental.routes.ts` mới (mount `/api/families/:id/rental`)

`Router({ mergeParams: true })` + `use(requireAuth, requireFamilyMember())`.
Endpoint OWNER-only thêm `requireOwner`. Envelope `{ success, data, error }`
qua `sendOk` như mọi route.

### `GET /api/families/:id/rental` (mọi member)

→ `{ config: RentalConfigDto | null, months: RentalMonthDto[] }` — `months` sort
**desc** theo `month`, mỗi item kèm computed fields (API tính bằng
`computeRentalTotals` — FE list không phải tự tính). 1 call duy nhất cho màn list.

### `PUT /api/families/:id/rental/config` (OWNER)

Body: 6 field `RentalConfigFields` — tất cả `z.number().int().min(0)`, cap:
khoản cố định `max(1_000_000_000)`, đơn giá `max(10_000_000)`. **Upsert**
(create nếu chưa có). → trả config mới.

### `GET /api/families/:id/rental/months` (mọi member)

Query `?year=YYYY` optional (lọc theo năm). Sort desc. → `{ months: [...] }`.

### `POST /api/families/:id/rental/months` (OWNER)

Body: `{ month: "YYYY-MM" }` (validate `isValidMonth`).

| Tình huống | Response |
|---|---|
| Chưa có config | 409 `RENTAL_CONFIG_NOT_SET` "Chưa có thông tin mặc định — hãy nhập ở màn Tiền phòng trọ" |
| Tháng đã tồn tại (DRAFT hay CONFIRMED) | 409 `RENTAL_MONTH_EXISTS` |

Prefill khi tạo draft: 4 khoản cố định + 2 đơn giá **từ config**;
`oldElec` = `newElec` của tháng gần nhất **trước** `month` (desc, limit 1),
không có thì `0`; `oldWater` tương tự; `newElec`/`newWater` = giá trị old tương
ứng (tiêu thụ 0 — user chỉ cần nhập số mới). → 201 + month dto.

### `PUT /api/families/:id/rental/months/:month` (OWNER)

`:month` validate `isValidMonth`. Body: 10 field `RentalMonthFields` **tất cả
optional** (refine: phải có ≥ 1 key). Validate giá trị như POST config + refine
`newElec >= oldElec`, `newWater >= oldWater` (khi cả 2 field có mặt — so với giá
trị hiện có trong DB nếu chỉ gửi 1 field).

- Tháng **CONFIRMED** → 409 `RENTAL_MONTH_CONFIRMED`
  "Tháng đã chốt — hãy dùng "Chỉnh sửa & chốt lại"" (FE sẽ gọi endpoint confirm).
- → 200 + month dto cập nhật.

### `POST /api/families/:id/rental/months/:month/confirm` (OWNER)

Body: **đầy đủ** 10 field `RentalMonthFields` + `date: "YYYY-MM-DD"`. Validate:
giá trị như trên + `newElec > 0` + `newWater > 0` (công tơ mới phải đã đọc —
số **cũ** được phép 0 ở tháng đầu khi công tơ mới lắp; draft chưa đọc số thì
số mới = 0 là bình thường nên rule này chỉ áp ở confirm) +
`isValidDateInMonth(date, month)`. → 400 `VALIDATION_ERROR`
"Số công tơ điện/nước mới phải lớn hơn 0".

1 transaction Prisma (`$transaction`):

1. Update `RentalMonth` với 10 field mới + `status: "CONFIRMED"` + `confirmedAt: now()`.
2. Category "Nhà trọ": `findFirst({ where: { familyId, name: "Nhà trọ" } })` —
   không có thì **create** (`isPreset: true`, `order: max+1`) — self-heal nếu
   user đã xoá preset.
3. Expense:
   - `DRAFT` (chưa `expenseId`) → **create** Expense
     (`familyId`, `userId = req.auth.userId` (người OWNER chốt), `categoryId`,
     `amount = total`, `date`, `note = buildRentalNote(month, fields)`).
   - `CONFIRMED` (đã có `expenseId`) → **update** cùng expense
     (`amount`, `date`, `note`, `categoryId` — re-chốt sau khi user đổi category
     "Nhà trọ").
4. Gắn `expenseId` lên `RentalMonth` (bước 1 gộp).

→ 200 + `{ month: dto, expenseId }`. 404 `MONTH_NOT_FOUND` nếu tháng không tồn tại.
409 nếu `expenseId` trỏ sang expense không thuộc family (dị thường, defensive).

### `DELETE /api/families/:id/rental/months/:month` (OWNER)

- `DRAFT` → xoá tháng.
- `CONFIRMED` → 1 transaction: xoá Expense liên kết + xoá tháng.
→ 200 `{ ok: true }`. 404 nếu không tồn tại.

### Ma trận quyền tổng hợp

| Endpoint | Member | Owner |
|---|---|---|
| GET rental, GET months | ✅ | ✅ |
| PUT config, POST/PUT/DELETE months, POST confirm | 403 `OWNER_ONLY` | ✅ |

## 4. Frontend

### 4.1 `core/dataApi.ts` — 6 hàm mới (đặt cạnh block expenses)

- `fetchRental(): Promise<RentalListResponse>` — `GET /rental`; **qua read cache**
  (key `GET /api/families/<fid>/rental`, TTL 24h như expenses — cần thêm `rental`
  vào regex `parseCacheKey` của `core/cacheInvalidate.ts` + bảng TTL
  `core/readCache.ts`).
- `saveRentalConfig(fields): Promise<RentalConfig>` — `PUT /rental/config`.
- `createRentalMonth(month): Promise<RentalMonth>` — `POST /rental/months`.
- `updateRentalMonth(month, fields): Promise<RentalMonth>` — `PUT /rental/months/:month`.
- `confirmRentalMonth(month, fields & date): Promise<{ month, expenseId }>` —
  `POST /rental/months/:month/confirm`.
- `deleteRentalMonth(month): Promise<void>` — `DELETE /rental/months/:month`.

Mọi mutation sau khi API trả 2xx: `invalidateRentalCache(familyId)` (mới trong
`cacheInvalidate.ts` — xoá key rental của family). Riêng `confirmRentalMonth`
thêm `invalidateExpenseCache(familyId, months=[month], dates=[date])` — khoản
chi mới được tạo/cập nhật → Lịch sử + Home phải tươi ngay.

### 4.2 `features/rental/` (feature mới — component chỉ dùng trong feature)

**`RentalPage.tsx`** — route `/rental`. 2 trạng thái theo `fetchRental`:

1. **Chưa có config** → form setup: 6 `NumberInput` trong Card "Thông tin mặc
   định" (4 khoản cố định + 2 đơn giá, hint đơn vị đ / đ/kWh / đ/m³) + nút "Lưu
   & tạo tháng hiện tại" → `saveRentalConfig` rồi
   `createRentalMonth(tháng hiện tại)` (bỏ qua 409 `RENTAL_MONTH_EXISTS` — tháng
   đã có thì chỉ lưu config) → chuyển sang trạng thái 2.
2. **Có config** →
   - Header: tiêu đề "Tiền phòng trọ" + nút "＋ Thêm tháng".
   - **Ghost card tháng hiện tại** (chỉ khi tháng hiện tại chưa có tháng nào):
     card nét đứt "Chưa có tháng 09/2026 — chạm để tạo" → `createRentalMonth` →
     navigate sang form.
   - **List tháng** nhóm theo năm desc, trong năm tháng desc. Mỗi card:
     "Tháng 07 · 2026" + **Tổng** (formatVnd, `text-primary-text`) + chip status
     ("Chờ chốt" vàng / "Đã chốt" xanh lá) + chevron → navigate `/rental/:month`.
     MEMBER: không có ghost card / nút Thêm (chỉ xem).
   - Nút "＋ Thêm tháng" → Modal nhỏ: `input type="month"` (default = tháng liên
     tiếp sau tháng lớn nhất đang có; không có tháng nào = tháng hiện tại) +
     nút Tạo → `createRentalMonth` → 409 `RENTAL_MONTH_EXISTS` → message "Tháng
     này đã có"; thành công → navigate form tháng mới.

**`RentalMonthPage.tsx`** — route `/rental/:month` (param validate `isValidMonth`
→ không hợp lệ: màn lỗi + link quay lại). Dữ liệu từ `fetchRental` (tìm tháng)
+ edit local state.

- **Chế độ DRAFT (member): read-only** — hiển thị đủ giá trị + kết quả, ẩn mọi nút
  hành động (label "Chỉ xem — chủ gia đình mới chỉnh sửa được").
- **OWNER, DRAFT** — form 3 Card:
  1. "Khoản cố định": 4 input (Phòng / Mạng / Thang máy + vệ sinh / Gửi xe —
     `NumberInput`, input thuần number, đơn giản).
  2. "Công tơ & đơn giá": 4 hàng — Điện: (cũ, mới) → dòng phụ "**280 kWh**"
     (live, `formatMeter` + computeRentalTotals); Nước: (cũ, mới) → "**6 m³**";
     2 ô đơn giá (đ/kWh, đ/m³). Input công tơ: `NumberInput` (int — khớp dữ
     liệu thật).
  3. "Kết quả": 2 dòng Tiền điện / Tiền nước (formatVnd, `text-ink-muted`) +
     **TỔNG** lớn (`text-3xl text-primary-text font-bold`).
  - `newElec < oldElec` hoặc `newWater < oldWater` → message lỗi đỏ trong Card
     2 + nút Chốt disable.
  - `newElec <= 0` hoặc `newWater <= 0` (chưa đọc số công tơ mới — draft mới
    prefill 0/0) → message lỗi đỏ "Số công tơ điện/nước mới phải lớn hơn 0" +
    nút Chốt disable (khớp rule confirm phía API; số **cũ** được phép 0 ở
    tháng đầu).
  - Nút "Chốt khoản chi" (lg, primary) → **Modal chốt**: tóm tắt Tổng, ô
     `input type="date"` (default `firstDayOfMonth(month)`, min/max = đầu/cuối
     tháng — khoá expense đúng trong tháng), preview note (text-xs, từ
     `buildRentalNote`), nút "Chốt" → `confirmRentalMonth` → success: invalidate
     cache + navigate về `/rental` (toast/modal đã có? Dùng hành vi chuẩn của app
     — navigate, card Home cập nhật khi vào lại).
  - Nút "Xoá tháng" (danger, cuối trang) → `ConfirmDialog` → `deleteRentalMonth`.
- **OWNER, CONFIRMED** — hiển thị giống DRAFT + banner xanh lá "Đã chốt ngày
  <dd/MM/YYYY> — khoản chi <formatVnd total>" (đọc từ `confirmedAt` + total) +
  nút "Chỉnh sửa & chốt lại" (mở form edit như DRAFT, nút cuối đổi thành
  "Chốt lại") + nút "Xoá tháng" (message ConfirmDialog cảnh báo rõ:
  "Khoản chi liên kết cũng sẽ bị xoá khỏi Lịch sử").

**`NumberInput.tsx`** — input số nguyên có dấu phân cách hàng nghìn kiểu vi-VN
(3.200.000). `type="text" + inputMode="numeric"` (type="number" không render
được dấu chấm; mobile vẫn lên bàn phím số). `onChange` chỉ nhận chữ số (lọc
`\D`, cap 10 chữ số ≈ trần API — vượt thì API 400). State ở component cha giữ
**chuỗi số thuần** ("3200000") — component chỉ lo hiển thị (grouping regex
trên chuỗi, giữ số 0 dẫn đầu). Dùng ở cả form setup (`RentalPage`) + form tháng
(`RentalMonthPage`) — 10 ô tháng + 6 ô setup.

**Trang chủ — card "🏠 Tiền phòng trọ"** (`HomePage.tsx`):

- Card đặt **trên** card "Tổng chi tiêu" (hoặc ngay dưới header — chọn theo
  layout hiện có lúc implement, ưu tiên vị trí nổi bật nhất). Nội dung: icon
  🏠 + "Tiền phòng trọ" + dòng 2 theo trạng thái tháng **hiện tại**:
  - Chưa có config: "Chưa nhập thông tin — chạm để bắt đầu"
  - Có config, chưa có tháng hiện tại: "Chưa có tháng này — chạm để tạo"
  - DRAFT: "Chờ chốt · <formatVnd total>" (màu amber)
  - CONFIRMED: "Đã chốt · <formatVnd total>" (màu xanh lá / `primary-text`)
- Chạm → `/rental`. Dữ liệu: `fetchRental` (đọc cache đã fetch sẵn; nếu chưa có
  cache → fetch riêng, hiển thị "—" khi loading, không block render phần còn lại
  của Home — `Promise` độc lập trong component, error → ẩn dòng 2).
- MEMBER: card vẫn hiện (xem được).

### 4.3 `router.tsx`

Thêm 2 route trong nhóm protected (AppShell): `/rental` → `RentalPage`,
`/rental/:month` → `RentalMonthPage` (không lazy — feature nhẹ, không thư viện
nặng).

### 4.4 Reuse UI (không tự viết mới)

`Card`, `Input`, `Button` (loading), `Modal`, `ConfirmDialog`, `formatVnd`,
`formatVndCompact` (dòng 2 card Home nếu dài), icons có sẵn. **Không** hardcode
màu — chỉ token (`primary`, `primary-soft`, `primary-text`, `danger`,
`ink-muted`, `border`...). Chip status: vàng = Tailwind amber utility sẵn có?
Không — theo rule token: dùng `primary-soft` + `text-primary-text` cho "Đã
chốt", "Chờ chốt" = `bg-surface text-ink-muted` + viền (tránh thêm màu mới —
nếu cần màu vàng riêng, bổ sung token vào `index.css`).

## 5. Test case

### 5.1 Shared — `packages/shared/src/rental.test.ts` (mới)

| # | Case | Kỳ vọng |
|---|------|---------|
| 1 | `computeRentalTotals` data thật tháng 7 (17743→18023 ×4000; 1001→1007 ×35.000; cố định 3.200.000/100.000/200.000/100.000) | consumption 280 / 6, cost 1.120.000 / 210.000, **total 4.930.000** (khớp ảnh) |
| 2 | Dòng 2 của sổ (giá điện 3.500): 20463→20788 ×3500 | consumption 325, cost **1.137.500** (khớp ảnh) |
| 3 | Consumption âm (new < old) | hàm trả raw âm (không clamp) — validation chặn phía API/FE |
| 4 | `total` = tổng 4 khoản cố định + 2 cost, mọi input int → total int | int đúng |
| 5 | `formatMeter` 280 / 1028 / 17743 / -15 | "280" / "1.028" / "17.743" / "-15" |
| 6 | `isValidMonth` "2026-07" / "2026-13" / "2026-7" / "abc" | true / false / false / false |
| 8 | `isValidDateInMonth("2026-02-31", "2026-02")` / `("2026-02-28","2026-02")` / `("2026-03-01","2026-02")` | false / true / false |
| 9 | `lastDayOfMonth` 2026-02 / 2024-02 (nhuận) / 2026-12 | "2026-02-28" / "2024-02-29" / "2026-12-31" |
| 10 | `buildRentalNote` case 1 | đúng chuỗi mẫu mục 2.3, độ dài ≤ 200 |
| 11 | `buildRentalNote` input cực đại (1e9 ×4, meter 1e6, rate 1e7) | độ dài ≤ 200 (cắt `…` nếu cần) |

### 5.2 API — `apps/api/src/__tests__/rental.test.ts` (mới, Postgres thật)

Setup helper: register 1 OWNER + 1 MEMBER cùng family (pattern các test có sẵn).

| # | Case | Kỳ vọng |
|---|------|---------|
| 12 | GET `/rental` family mới (chưa setup) | 200, `config: null`, `months: []` |
| 13 | PUT config (OWNER) lần đầu | 200, config đúng 6 giá trị |
| 14 | PUT config (OWNER) lần 2 (thay giá điện) | 200, config cập nhật, không tạo record thứ 2 (check count DB = 1) |
| 15 | PUT config (MEMBER) | 403 `OWNER_ONLY` |
| 16 | PUT config giá trị âm / float / > 1e9 | 400 `VALIDATION_ERROR` |
| 17 | POST months chưa có config (family khác chưa PUT) | 409 `RENTAL_CONFIG_NOT_SET` |
| 18 | POST months "2026-07" (có config) | 201, prefill: cố định + giá = config, oldElec/oldWater = 0, new = old, status DRAFT |
| 19 | POST months "2026-13" / "2026-7" | 400 `VALIDATION_ERROR` |
| 20 | POST trùng "2026-07" (lần 2) | 409 `RENTAL_MONTH_EXISTS` |
| 21 | Tạo "2026-07" (newElec=18.023) rồi POST "2026-08" | 201, `oldElec` tháng 8 = **18.023** (mang số từ tháng trước) |
| 22 | PUT months chỉ gửi `{ newElec }` | 200, cập nhật 1 field, các field khác giữ nguyên |
| 23 | PUT months tháng CONFIRMED | 409 `RENTAL_MONTH_CONFIRMED` |
| 24 | PUT `newElec < oldElec` (cả 2 có mặt / so DB) | 400 `VALIDATION_ERROR` |
| 25 | PUT months (MEMBER) | 403 `OWNER_ONLY` |
| 26 | POST confirm tháng DRAFT (data thật case 1, date 2026-07-01) | 200; DB: tháng CONFIRMED + confirmedAt; Expense tạo: amount **4.930.000**, category "Nhà trọ", date đúng, note đúng mẫu, userId = OWNER |
| 27 | GET `/rental` sau confirm | month có computed fields đúng + expenseId |
| 28 | GET `/expenses?month=2026-07` sau confirm | list có khoản "Nhà trọ" (kiểm tra qua endpoint expenses có sẵn) |
| 29 | POST confirm tháng CONFIRMED (sửa newElec → total khác, date đổi) | 200; **cùng expenseId** (không sinh expense mới — count expense tháng = 1), amount/note/date cập nhật |
| 30 | POST confirm date ngoài tháng ("2026-07-15" cho month "2026-08") / "2026-02-31" | 400 `VALIDATION_ERROR` |
| 31 | POST confirm tháng không tồn tại | 404 `MONTH_NOT_FOUND` |
| 32 | Xoá category "Nhà trọ" rồi confirm | 200 — category tự tạo lại (self-heal), expense link đúng |
| 33 | PUT `/api/expenses/:id` expense đã link | 409 `RENTAL_EXPENSE_LOCKED` |
| 34 | DELETE `/api/expenses/:id` expense đã link | 409 `RENTAL_EXPENSE_LOCKED` |
| 35 | DELETE tháng DRAFT | 200; GET months → hết |
| 36 | DELETE tháng CONFIRMED | 200; expense liên kết **biến mất** (GET expenses không còn), tháng hết |
| 37 | GET months `?year=2026` (có tháng 2025 + 2026) | chỉ trả tháng 2026, desc |
| 38 | User không phải member gọi GET `/rental` | 403 `NOT_FAMILY_MEMBER` |

### 5.3 FE — `apps/web/src/__tests__/` (pattern mock dataApi hiện có)

| # | Case | Kỳ vọng |
|---|------|---------|
| 39 | `dataApi.fetchRental` mock API trả payload | map đúng shape `RentalListResponse` |
| 40 | `saveRentalConfig`/`createRentalMonth`/`updateRentalMonth`/`confirmRentalMonth`/`deleteRentalMonth` | gọi đúng method + path + body (mock apiFetch) |
| 41 | `RentalPage` chưa config | hiện form setup 6 trường; sau Lưu + tạo tháng → gọi đúng 2 API, render list |
| 42 | `RentalPage` có config + 2 tháng (1 DRAFT 1 CONFIRMED) | list đúng 2 card, tổng + chip status đúng, nhóm theo năm |
| 43 | `RentalPage` tháng hiện tại chưa có | hiện ghost card; chạm → `createRentalMonth` + navigate |
| 44 | `RentalPage` (MEMBER — mock role) | không có nút "Thêm tháng"/ghost card |
| 45 | `RentalMonthPage` DRAFT: nhập 4 trường công tơ + đơn giá | dòng kWh/m³ + Tiền điện/nước + TỔNG update live đúng (data case 1) |
| 46 | `RentalMonthPage` newElec < oldElec | hiện lỗi + nút Chốt disabled |
| 47 | `RentalMonthPage` bấm Chốt → confirm modal | date default = ngày 01 tháng, min/max trong tháng; bấm Chốt → `confirmRentalMonth` payload đủ 11 field; thành công → **ở lại màn tháng**, refetch + hiện banner "Đã chốt" (không navigate — xem lại ngay kết quả) |
| 48 | `RentalMonthPage` CONFIRMED | banner "Đã chốt" + total; không có form edit cho tới khi bấm "Chỉnh sửa & chốt lại" |
| 49 | `RentalMonthPage` CONFIRMED sửa + Chốt lại | gọi `confirmRentalMonth` (không gọi update) với giá trị mới |
| 50 | `RentalMonthPage` Xoá tháng CONFIRMED | ConfirmDialog có cảnh báo xoá cả khoản chi; xác nhận → `deleteRentalMonth` |
| 51 | `HomePage` có card "Tiền phòng trọ" | DRAFT → dòng 2 "Chờ chốt · …" amber; CONFIRMED → "Đã chốt · …"; chạm → navigate /rental |
| 52 | `HomePage` fetchRental fail/empty | card không crash (dòng 2 ẩn / "—"), phần còn lại Home render bình thường |

### 5.4 E2E (Playwright) — spec mới `rental.spec.ts`

| # | Case | Kỳ vọng |
|---|------|---------|
| 53 | Đăng ký family mới → Home thấy card "Tiền phòng trọ" → vào /rental → nhập 6 mặc định (3.200.000/100.000/200.000/100.000/4.000/35.000) → lưu → form tháng hiện tại với prefill → nhập công tơ điện 17.743/18.023 + nước 1.001/1.007 → tổng **4.930.000 ₫** → Chốt → /rental chip "Đã chốt" → /history (hoặc /) thấy khoản "Nhà trọ" 4.930.000 ₫ trong tháng | happy path toàn trình |
| 54 | (kéo dài 53) mở tháng đã chốt → Chỉnh sửa → đổi giá điện 3.500 → Chốt lại | tổng mới = 3.200.000+100.000+200.000+100.000+980.000+210.000 = **4.790.000 ₫**; Lịch sử vẫn **1 khoản** (update, không trùng) |

### 5.5 Test cập nhật (do thêm preset "Nhà trọ")

- `family.test.ts` "seed 7 preset" → **8 preset** (assert tên "Nhà trọ" có mặt).
- `category.test.ts` "trả 7 preset mặc định" → **8** (order: "Nhà trọ" trước "Sức khỏe").
- `CategoriesPage.tsx` comment "7 preset" → 8.
- E2E `auth.spec.ts` nếu có assert số danh mục → cập nhật (check lúc chạy).

### 5.6 Test bổ sung — validate công tơ mới > 0 + input dấu phân cách nghìn

(Thêm sau khi feature đã lên production — user yêu cầu chốt phải đọc số công tơ
mới, và input number hiển thị dấu phân cách hàng nghìn vi-VN.)

| # | Case | Kỳ vọng |
|---|------|---------|
| 55 | API: POST confirm tháng đầu (old/new = 0) | 400 `VALIDATION_ERROR` "Số công tơ điện mới phải lớn hơn 0"; điện đã đọc (> 0) còn nước = 0 → 400 (lỗi nước); đọc đủ cả 2 (> 0, số **cũ** = 0) → 200, total đúng |
| 56 | FE: `RentalMonthPage` DRAFT mới (prefill 0/0) | lỗi "Số công tơ điện mới phải lớn hơn 0" + nút "Chốt khoản chi" disabled; mọi input số hiển thị dấu phân cách nghìn ("3.200.000", "17.743" — component `NumberInput`, state vẫn chuỗi số thuần) |

## 6. Vạch ngoài (không làm trong feature này)

- Nhiều phòng trọ / nhiều hợp đồng cho 1 family (1 config + 1 chuỗi tháng/family).
- Tách điện/nước thành các khoản chi riêng (user chốt: 1 khoản duy nhất).
- Offline queue cho mutation rental (online-only như category).
- Nhắc định kỳ (push/notification) khi chưa chốt tháng.
- Biểu đồ xu hướng tiền điện/nước theo tháng.
- Chia sẻ chi phí giữa nhiều người thuê (mỗi người 1 app riêng nếu cần).

## 7. Rủi ro / lưu ý deploy

- Migration **additive** (2 bảng + backfill SQL idempotent) — CI auto-migrate khi
  push `develop` (quy ước 29/09) → preview + production tự lành, không bước tay.
  Chạy lại migration không làm gì (NOT EXISTS guard).
- `PRESET_CATEGORIES` +1 → **mọi test assert 7 preset phải cập nhật** (mục 5.5) —
  nếu sót, test fail rõ (fail-fast, không lỗi im lặng).
- `Expense.note` đã có `max(200)` trong `createExpenseSchema` — note do
  `buildRentalNote` sinh luôn ≤ 200 (test 11 khoá).
- Endpoint confirm chạy 1 transaction → không có trạng thái "có expense, tháng
  chưa CONFIRMED" (hoặc ngược lại) dù crash giữa chừng (rollback).
- FE: `input type="month"`/`type="date"` trên mobile (iOS Safari) render native
  picker — chấp nhận (precedent: ô `type=date` ở AddPage).
- Card Home gọi `fetchRental` song song với các fetch khác của Home — thêm 1
  request khi vào Home (nhẹ: 1 bảng config + list tháng nhỏ); sau lần đầu có
  cache 24h.

## 8. WBS (1 task = 1 commit vào `develop`)

| # | Commit | Nội dung |
|---|--------|----------|
| 1 | `docs` | Spec này |
| 2 | `feat(shared)` | `rental.ts` (types + `computeRentalTotals`, `formatMeter`, date helpers, `buildRentalNote`) + `RENTAL_CATEGORY` vào `PRESET_CATEGORIES` + unit test + cập nhật test assert preset count (api 2 file) |
| 3 | `feat(api)` | Prisma schema (2 model + link ngược) + migration `add_rental` (kèm backfill SQL) + `prisma generate` |
| 4 | `feat(api)` | `rental.routes.ts` (7 endpoint) + guard `RENTAL_EXPENSE_LOCKED` trên expense PUT/DELETE + mount vào `app.ts` + `rental.test.ts` (case 12–38) |
| 5 | `feat(web)` | `dataApi` 6 hàm + readCache/cacheInvalidate (key `rental`) + `features/rental/RentalPage` + `RentalMonthPage` (DRAFT) + router + card Home + test (case 39–44, 45–47, 51–52) |
| 6 | `feat(web)` | Flow chốt (modal) + chế độ CONFIRMED (banner, chỉnh sửa & chốt lại, xoá có cảnh báo) + test (case 48–50) |
| 7 | `test` | E2E `rental.spec.ts` (case 53–54) + cập nhật `docs/handoff/progress.md` |
