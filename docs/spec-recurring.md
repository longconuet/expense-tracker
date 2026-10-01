# Spec — Giao dịch định kỳ (recurring expenses)

> Task: user **setup trước** các khoản chi tiêu lặp lại **hàng tháng** (VD tiền điện
> 1,5 triệu vào ngày 01 hàng tháng) — app tự động tạo khoản chi cho mỗi kỳ.
> Khoản đã sinh ra là khoản chi **thường** (vào thống kê/lọc/export/lịch sử),
> kèm icon nhận biết nguồn định kỳ.

## 1. Yêu cầu (đã chốt với user 01/10/2026)

- **Màn riêng "Giao dịch định kỳ"** (`/recurring`) — list các rule đã setup +
  form tạo/sửa. Entry từ màn **Tôi** (precedent `/categories`). Không đụng
  bottom nav (đã đầy 5 tab).
- **Tần suất cố định: 1 lần/tháng** — KHÔNG có tuỳ chọn tần suất (user chốt:
  MVP chỉ cần hàng tháng). Ngày khớp trong tháng = ngày của trường **"Từ"**
  (VD "Từ 01/10" → mọi kỳ vào ngày 01; "Từ 31/01" → clamp cuối tháng: 28/02,
  29/02 năm nhuận, 31/03…). Schema giữ cột `frequency` (giá trị `"MONTHLY"`)
  để mở rộng additive về sau.
- **3 điều kiện kết thúc** (đúng thiết kế màn "Tùy Chỉnh" user gửi):
  `Mãi mãi` / `Cho đến ngày <YYYY-MM-DD>` / `Xảy ra một số lượng lần nhất định… (N lần)`.
- **Tự sinh khoản — lazy, không cron** (server là Vercel serverless, không
  service chạy nền): FE gọi endpoint `materialize` khi mở app (AppShell mount),
  khi đổi family, khi chuyển về online. Idempotent — gọi lại nhiều lần / nhiều
  thiết bị không sinh trùng.
- **Không sinh bù quá khứ**: nếu "Từ" nằm trong quá khứ, kỳ đầu tiên được sinh
  = ngày khớp hàng tháng **gần nhất ≥ hôm nay**.
- **Khoản đã sinh sửa/xoá được như khoản thường** (user chốt, khác precedent
  rental — không có guard 409 khoá). Hệ quả:
  - Xoá 1 kỳ đã sinh → kỳ đó bỏ qua, **KHÔNG sinh lại** (hệ sinh chỉ tiến về
    phía trước theo `nextDate`); với rule "N lần", xoá khoản **không** bù thêm
    lần khác (đếm theo số kỳ đã materialize, không theo số hàng còn lại).
  - Sửa khoản đã sinh (tiền/danh mục/ghi chú) → chỉ đổi hàng đó, không ảnh
    hưởng chuỗi rule. Muốn đổi mọi kỳ → sửa rule (áp cho kỳ tương lai).
  - Sửa **ngày** của khoản đã sinh trùng ngày kỳ khác cùng rule → 409.
- **Xoá rule** → các khoản đã sinh giữ lại, thành khoản thường (link
  `recurringRuleId` → `SetNull`, mất icon định kỳ).
- **Sửa rule** (tiền/danh mục/ghi chú/điều kiện kết thúc/ngày "Từ") chỉ ảnh
  hưởng **kỳ tương lai**; rule đã hoàn tất sửa lại có thể **hoạt động lại**.
- **Quyền**: mọi member xem list rule + khoản sinh ra; chỉ **OWNER** tạo/sửa/
  xoá rule (precedent `RentalConfig` — middleware `requireOwner` có sẵn).
- **Offline**: list rule xem được qua read cache (TTL 24h như rental); tạo/sửa/
  xoá rule + materialize **online-only** (không đưa vào offline queue —
  precedent category/rental).
- UI mobile-first, theo bố cục thiết kế trong ảnh màn "Tùy Chỉnh" của user
  (hàng label-trái · giá trị-phải; lựa chọn kết thúc gạch chân dạng radio
  kèm dấu ✓ + dòng phụ lùi vào).

## 2. Dữ liệu

### 2.1 Schema — 1 model mới + link trên `Expense` (Prisma)

```prisma
model RecurringRule {
  id              String   @id @default(cuid())
  familyId        String
  userId          String // người tạo (luôn OWNER)
  categoryId      String
  amount          Int // số nguyên VND — cap như Expense.amount
  note            String? // ghi chú kế thừa xuống mọi khoản sinh ra
  frequency       String   @default("MONTHLY") // MVP chỉ "MONTHLY" — cột dự phòng tần suất khác
  startDate       String // "Từ" — YYYY-MM-DD, định ngày khớp trong tháng
  endType         String // "FOREVER" | "UNTIL_DATE" | "COUNT"
  endDate         String? // endType = UNTIL_DATE
  occurrenceCount Int? // endType = COUNT
  nextDate        String? // kỳ kế tiếp cần sinh — null = hết vòng đời
  generatedCount  Int      @default(0) // số kỳ ĐÃ materialize (đếm theo kỳ, không theo hàng)
  completedAt     DateTime?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  family   Family   @relation(fields: [familyId], references: [id], onDelete: Cascade)
  category Category @relation(fields: [categoryId], references: [id], onDelete: Restrict)
  expenses Expense[]

  @@index([familyId, nextDate])
}

// Family +: recurringRules RecurringRule[]
// Category +: recurringRules RecurringRule[]
// Expense +:
//   recurringRuleId String?
//   recurringRule   RecurringRule? @relation(fields: [recurringRuleId], references: [id], onDelete: SetNull)
//   @@unique([recurringRuleId, date]) // idempotency materialize (NULL không xung đột — Postgres)
```

- Migration `add_recurring`: **additive** (1 bảng mới + 2 cột nullable trên
  `Expense` + 1 unique index) — không backfill, backward-compatible, hợp quy
  ước CI auto-migrate khi push `develop`.
- `category onDelete: Restrict` + guard 409 phía route (mục 3.3) — phòng vệ
  2 tầng, không có cách xoá danh mục đang có rule.
- `recurringRuleId onDelete: SetNull` — xoá rule không đụng khoản đã sinh.

### 2.2 Chuỗi kỳ & trạng thái rule (thuật toán chuẩn — 1 nguồn cho API + FE + test)

- Chuỗi kỳ: `startDate`, `advanceMonthly(startDate)`, `advanceMonthly²(…)`, …
  (hàng tháng, clamp ngày — mục 2.3).
- `nextDate` = con trỏ kỳ kế tiếp. Rule **active** ⇔ `nextDate != null`.
- **Materialize tại ngày `today`**: với mỗi rule active mà `nextDate <= today`:
  sinh đủ các kỳ `d` với `nextDate <= d <= today` (d lần lượt là các phần tử
  chuỗi kỳ), rồi `nextDate = advanceMonthly(kỳ cuối vừa sinh)`.
  - `endType = UNTIL_DATE`: dừng khi `d > endDate` → hoàn tất.
  - `endType = COUNT`: chỉ sinh khi `generatedCount < occurrenceCount`; dừng
    khi đủ → hoàn tất.
  - `generatedCount += số kỳ vừa sinh`; hoàn tất → `nextDate = null`,
    `completedAt = now()`.
  - **Cap phòng vệ 400 kỳ/tick** (≈ 33 năm — không bao giờ chạm thực tế).
- Rule **hoàn tất** hiển thị "Đã hoàn thành"; sửa rule (VD tăng số lần) tính
  lại `nextDate` → có thể active trở lại (xoá `completedAt`).

### 2.3 Types + pure functions trong `packages/shared` (`src/recurring.ts` mới)

```ts
export type RecurringEndType = "FOREVER" | "UNTIL_DATE" | "COUNT";

export interface RecurringRule {
  id: string;
  familyId: string;
  categoryId: string;
  category: Category;
  amount: number;
  note: string | null;
  frequency: "MONTHLY";
  startDate: string; // YYYY-MM-DD
  endType: RecurringEndType;
  endDate: string | null;
  occurrenceCount: number | null;
  nextDate: string | null;
  generatedCount: number;
  completedAt: string | null; // ISO
  createdAt: string; // ISO
}

export interface CreateRecurringRuleInput {
  categoryId: string;
  amount: number;
  note?: string;
  startDate: string;
  endType: RecurringEndType;
  endDate?: string;
  occurrenceCount?: number;
}

export interface RecurringMaterializeResult {
  count: number;
  /** Các khoản vừa sinh — month kèm sẵn để FE invalidate đúng cache. */
  created: Array<{ expenseId: string; date: string; month: string }>;
}

export interface MaterializeDatesInput {
  nextDate: string;
  endType: RecurringEndType;
  endDate: string | null;
  occurrenceCount: number | null;
  generatedCount: number;
}
export interface MaterializeDatesResult {
  dates: string[]; // các kỳ cần sinh tại tick này (đã ≤ today)
  nextDate: string | null; // giá trị mới ghi lên rule (null = hoàn tất)
  completed: boolean;
}
```

Hàm (pure, export — API + FE dùng chung 1 nguồn; ngày là string `YYYY-MM-DD`,
tính bằng `Date.UTC` như `apps/api/src/lib/dates.ts` — không dính múi giờ):

- `advanceMonthly(date: string): string` — +1 tháng, clamp ngày về cuối tháng
  (`"2026-01-31" → "2026-02-28"`, năm nhuận `→ "2024-02-29"`).
- `firstOccurrenceFrom(startDate: string, today: string, cap = 1200): string`
  — `startDate >= today` → trả `startDate`; khác thì trượt từng tháng đến
  ngày khớp **đầu tiên ≥ today** (quy tắc không sinh bù — mục 1).
- `materializeDates(input: MaterializeDatesInput, today: string, cap = 400):
  MaterializeDatesResult` — triển khai đúng mục 2.2 (FOREVER/UNTIL_DATE/COUNT,
  cap, `nextDate > today` → `{ dates: [], nextDate: input.nextDate,
  completed: false }`).
- `describeRecurringEnd(endType: RecurringEndType, endDate: string | null,
  occurrenceCount: number | null): string` — `"Mãi mãi"` /
  `"Đến 31/12/2026"` / `"5 lần"` (formatter `dd/MM/yyyy` zero-pad thuần trong
  file — không phụ thuộc ICU, precedent `formatVnd`).

`index.ts` thêm `export * from "./recurring.js"`.

### 2.4 `Expense` (packages/shared) — thêm 1 field

```ts
export interface Expense {
  // ... hiện có
  /** Rule định kỳ sinh ra khoản này — null = khoản nhập tay. */
  recurringRuleId: string | null;
}
```

TS bắt cập nhật mọi mock `Expense` trong test FE + mọi `toExpenseDto` API
(fail-fast, không lỗi im lặng).

## 3. API

### 3.1 `recurring.routes.ts` mới — 2 router

**Router family-scoped** `recurringRouter` (`Router({ mergeParams: true })`,
`use(requireAuth, requireFamilyMember())`) — mount
`app.use("/api/families/:id/recurring", recurringRouter)` trong `app.ts`
(sau route `rental`).

**Router theo id** `recurringByIdRouter` (`use(requireAuth)`) — mount
`app.use("/api/recurring", recurringByIdRouter)`. Kiểm tra membership qua
`rule.familyId` trong handler (pattern `requireExpenseAccess` của expense).

Envelope `{ success, data, error }` qua `sendOk` như mọi route.

#### `GET /api/families/:id/recurring` (mọi member)

→ `{ rules: RecurringRuleDto[] }` — sort `createdAt desc`, mỗi rule kèm
`category { id, name, icon }`. 1 call duy nhất cho màn list.

#### `POST /api/families/:id/recurring` (OWNER)

Body (zod, cùng style `expense.routes.ts`):

```ts
{
  categoryId: string (min 1)
  amount: int, min 1, max 1_000_000_000_000   // cap như Expense.amount
  note?: string trim max 200
  startDate: "YYYY-MM-DD" (regex + isValidDateStr)
  endType: "FOREVER" | "UNTIL_DATE" | "COUNT"
  endDate?: "YYYY-MM-DD"
  occurrenceCount?: int, min 1, max 10_000
}
```

`superRefine` (theo `endType`):
- `UNTIL_DATE`: bắt buộc `endDate`; và `endDate >= firstOccurrenceFrom(startDate, today)`
  → 400 "Ngày kết thúc phải sau ngày định kỳ đầu tiên (<dd/MM/yyyy>)".
- `COUNT`: bắt buộc `occurrenceCount`.
- `FOREVER`: `endDate`/`occurrenceCount` phải vắng mặt → 400.

| Tình huống | Response |
|---|---|
| `categoryId` không thuộc family | 404 `CATEGORY_NOT_FOUND` |

Logic: `nextDate = firstOccurrenceFrom(startDate, todayStr())` → create →
**201** + rule dto.

#### `POST /api/families/:id/recurring/materialize` (mọi member, online)

Body rỗng. Trả về các kỳ quá hạn của **tất cả** rule active trong family.

- `today = todayStr()` (UTC — convention toàn app, `lib/dates.ts`).
- Lấy rules `familyId` + `nextDate != null` + `nextDate <= today`.
- 1 `prisma.$transaction` cho cả family; với từng rule:
  1. `SELECT "id" FROM "RecurringRule" WHERE "id" = ? FOR UPDATE` — khoá row,
     chống 2 tick song song sinh trùng (precedent `rental confirm`).
  2. **Re-read** rule trong tx (tick song song vừa commit thì `nextDate` đã
     tiến → bước tính ra 0 kỳ).
  3. `materializeDates(...)` → 0 kỳ thì bỏ qua rule này.
  4. Create các Expense: `familyId`, `userId = rule.userId` (người setup —
     KHÔNG phải người gọi), `categoryId = rule.categoryId`, `amount`,
     `note = rule.note`, `date`, `recurringRuleId = rule.id`.
  5. Update rule: `generatedCount += n`, `nextDate = result.nextDate`,
     `completedAt = result.completed ? now() : null`.
- → 200 `{ count: n, created: [{ expenseId, date, month }] }`
  (`month = date.slice(0,7)`).

#### `GET /api/recurring/:id` (member của rule.familyId)

→ rule dto (kèm category). Không có rule → 404 `RECURRING_RULE_NOT_FOUND`;
không phải member → 403 `NOT_FAMILY_MEMBER`.

#### `PUT /api/recurring/:id` (người tạo hoặc OWNER)

Body: mọi field mục POST **đều optional** (refine ≥ 1 key) — pattern
`updateExpenseSchema`. Validate trên **giá trị gộp** (body ?? hiện có trong
DB): cùng rules `superRefine` + cap. `categoryId` đổi →
`assertCategoryInFamily`.

Quyền: tìm rule (404) → `assertFamilyMember(rule.familyId)` (403) →
`role === "OWNER" || rule.userId === userId` nếu không → 403 `FORBIDDEN`
"Chỉ người tạo hoặc chủ gia đình mới sửa được rule này".

Tính lại `nextDate` sau khi update (mọi trường hợp — kể cả rule đã hoàn tất):

1. `lastGenerated = max(date)` của các expense `recurringRuleId = id`
   (findFirst orderBy date desc).
2. Có `lastGenerated` → `nextDate = advanceMonthly(lastGenerated)`;
   không có → `nextDate = firstOccurrenceFrom(startDateMới, today)`.
   (Kết quả có thể ≤ today — tick kế tiếp sẽ catch-up đúng thiết kế.)
3. Nếu `endType = UNTIL_DATE` và `nextDate > endDate` → hoàn tất ngay
   (`nextDate = null`, `completedAt = now()`).
4. Nếu `endType = COUNT` và `generatedCount >= occurrenceCount` → hoàn tất
   ngay (VD user giảm số lần xuống dưới số đã sinh).
5. Rule từng hoàn tất giờ active trở lại → `completedAt = null`.

→ 200 + rule dto cập nhật.

#### `DELETE /api/recurring/:id` (người tạo hoặc OWNER)

Quyền như PUT. Xoá rule — expense đã sinh **giữ lại** (SetNull).
→ 200 `{ ok: true }`; 404 nếu không tồn tại.

#### Ma trận quyền tổng hợp

| Endpoint | Member | Chủ family |
|---|---|---|
| GET list, GET :id, POST materialize | ✅ | ✅ |
| POST rule, PUT/DELETE :id (owner) | 403 `OWNER_ONLY` / `FORBIDDEN` | ✅ |

### 3.2 Sửa `expense.routes.ts`

- `toExpenseDto`: thêm `recurringRuleId: expense.recurringRuleId` (cột trực
  tiếp trên row — không cần include relation). GET/list/export không đổi khác.
- `PUT /api/expenses/:id`: khoản có `recurringRuleId` khi **đổi date** sang
  trùng ngày kỳ khác cùng rule → Prisma P2002 (unique
  `recurringRuleId_date`) → catch → **409 `RECURRING_DATE_CONFLICT`**
  "Ngày trùng với một kỳ khác của rule định kỳ — hãy chọn ngày khác".
  (Catch P2002 thay vì pre-check — không bị race với materialize chạy xen.)
- **Không thêm guard khoá** (quyết định 4B — khoản định kỳ sửa/xoá như thường).

### 3.3 Sửa `category.routes.ts`

`DELETE /:categoryId`: thêm check `prisma.recurringRule.count({ where: { categoryId } })`
— > 0 → **409 `CATEGORY_IN_USE`** (giữ code, message điều chỉnh: "Danh mục
đang có khoản chi hoặc rule định kỳ — không thể xoá").

## 4. Frontend

### 4.1 `core/dataApi.ts` — block "Giao dịch định kỳ" mới

- `fetchRecurring(familyId): Promise<{ rules: RecurringRule[] }>` —
  `GET /api/families/<fid>/recurring`; **qua read cache** (key
  `GET /api/families/<fid>/recurring`) → cần thêm `recurring` vào regex
  `KEY_PATTERN` + union `resource` của `parseCacheKey`
  (`core/cacheInvalidate.ts`) và bảng `CACHE_TTL_MS` + `ttlFor`
  (`core/readCache.ts`) — TTL 24h như `rental`.
- `createRecurringRule(familyId, input: CreateRecurringRuleInput): Promise<RecurringRule>`
  — `POST /api/families/<fid>/recurring` → `invalidateRecurringCache(familyId)`.
- `updateRecurringRule(familyId, ruleId, input: Partial<CreateRecurringRuleInput>):
  Promise<RecurringRule>` — `PUT /api/recurring/:id` → invalidate.
- `deleteRecurringRule(familyId, ruleId): Promise<void>` — `DELETE
  /api/recurring/:id` → invalidate.
- `materializeRecurring(familyId): Promise<RecurringMaterializeResult>` —
  `POST /api/families/<fid>/recurring/materialize`; **không** qua read cache;
  nếu `count > 0` → `Promise.all([invalidateRecurringCache(familyId),
  invalidateExpenseCache(familyId, months, dates)])` (months/dates lấy từ
  `result.created`).
- `cacheInvalidate.ts` + hàm `invalidateRecurringCache(familyId)` (xoá key
  resource `recurring`).
- `fetchExpenses`: normalize payload cache cũ (ghi trước khi có field) —
  `recurringRuleId: e.recurringRuleId ?? null` (precedent normalize
  `noteSuggestions`).

Mọi mutation **online-only** — không offline queue (precedent category/rental).

### 4.2 `shared/ui` — 2 component nâng lên / mới (rule: dùng ≥ 2 feature → shared)

- **`Keypad.tsx` chuyển** từ `features/expenses/` lên `shared/ui/` (giữ nguyên
  API: `KeypadKey`, `KeypadSize`, props) — cập nhật import ở `AddPage`,
  `EditPage`.
- **`CategoryChips.tsx` mới** — rút markup chip danh mục cuộn ngang đang nằm
  inline trong `AddPage`/`EditPage` (1 nguồn, tránh lệch layout — bài học
  30/09 với ExpenseRow). Props thuần: `{ categories: Category[]; selectedId:
  string | null; onSelect: (id: string) => void }`. `AddPage`/`EditPage`
  chuyển sang dùng.

### 4.3 `features/recurring/` (feature mới)

**`RecurringPage.tsx`** — route `/recurring`.

- `fetchRecurring` (read cache); loading → `Skeleton`.
- **Trạng thái rỗng**: icon lặp + "Chưa có giao dịch định kỳ" + (chỉ OWNER)
  Button "Tạo giao dịch định kỳ" → `/recurring/new`.
- **List rule** (Card mỗi rule):
  - Dòng 1: icon danh mục + tên danh mục + `formatVnd(amount)`.
  - Dòng 2: "Hàng tháng · từ <shortDate(startDate)>" + chip điều kiện kết
    thúc (`describeRecurringEnd`; với COUNT hiện
    "<generatedCount>/<occurrenceCount> lần").
  - Dòng 3 trạng thái: active → `text-primary` "Kỳ tới: <shortDate(nextDate)>";
    hoàn tất → `text-ink-muted` "Đã hoàn thành".
  - OWNER: chạm card → `/recurring/:id`. MEMBER: card không chạm (chỉ xem),
    không có CTA.
- Khi mount (online): gọi `materializeRecurring` trước khi hiển thị list
  (để "Kỳ tới" luôn tươi) — silent, lỗi mạng bỏ qua.

**`RecurringRulePage.tsx`** — route `/recurring/new` + `/recurring/:id`.

- **Không phải OWNER** → màn thông báo "Chỉ chủ gia đình có thể setup giao
  dịch định kỳ" + nút Quay lại (không render form).
- **Chế độ sửa** (`:id`): dữ liệu từ `fetchRecurring` (tìm rule); không thấy
  → màn lỗi + link quay lại.
- **Form** (OWNER), 2 Card:
  1. **"Khoản chi"**: `CategoryChips` (dữ liệu `fetchCategories`) + ô số tiền
     lớn (`formatVnd`, state chuỗi số như AddPage) + `Keypad` (size lg, pattern
     phím vật lý như AddPage) + `Input` ghi chú (placeholder "Ghi chú (tùy
     chọn)", max 200).
  2. **"Tùy Chỉnh"** — đúng bố cục thiết kế user (ảnh màn Tùy Chỉnh):
     - Hàng tĩnh: `Tần suất` — giá trị `Lặp hàng tháng` (text-ink-muted,
       KHÔNG clickable — MVP cố định).
     - Hàng `Từ`: `<input type="date">` (default: new = `today()`; edit =
       `rule.startDate`; được phép chọn quá khứ — API tự đẩy `nextDate` sang
       kỳ ≥ hôm nay).
     - Nhóm **"Kết thúc"** — 3 hàng lựa chọn kiểu radio (label trái, ✓ phải
       khi đang chọn — như ảnh):
       1. `Mãi mãi`
       2. `Cho đến ngày` → khi chọn, hiện dòng phụ lùi vào: `Đến` +
          `<input type="date">` (empty mặc định, bắt buộc khi chọn)
       3. `Xảy ra một số lượng lần nhất định…` → khi chọn, hiện dòng phụ:
          `Lần` + input số (1–10.000, default 1)
     - Radio tự vẽ (div + `role="radio"`/`aria-checked`) — không có component
       radio trong `shared/ui`; giữ markup tối giản, token màu sẵn có.
- **Validate phía FE** (ghép API, live khi nhập):
  - Số tiền > 0 (rỗng = 0) → disable Lưu.
  - `Cho đến ngày`: `endDate` đã nhập + `endDate >= firstOccurrenceFrom(startDate, today())`
    (dùng shared — cùng nguồn với API) → không đủ: message đỏ + disable Lưu.
  - `Số lần`: 1–10.000.
- **Nút** (cuối trang): `Lưu` (primary, lg, loading) → create/update →
  `navigate("/recurring")`. Chế độ sửa thêm `Xoá rule` (danger) →
  `ConfirmDialog` ("Xoá rule này? Các khoản chi đã sinh sẽ giữ lại như khoản
  chi thường.") → `deleteRecurringRule` → navigate về list.

### 4.4 `router.tsx`

Thêm 3 route trong nhóm protected (AppShell), không lazy (feature nhẹ):
`/recurring` → `RecurringPage`, `/recurring/new` + `/recurring/:id` →
`RecurringRulePage`.

### 4.5 `MePage.tsx` — entry

Thêm 1 Card dạng hàng (như card "Danh mục chi tiêu"): icon `RepeatIcon` +
"Giao dịch định kỳ" + chevron → `navigate("/recurring")`. Đặt ngay sau card
"Danh mục chi tiêu".

### 4.6 `AppShell.tsx` — trigger materialize

```tsx
// Sinh khoản định kỳ quá hạn — lazy, idempotent, online-only (spec §3.1)
useEffect(() => {
  if (!online || !activeFamilyId) return;
  materializeRecurring(activeFamilyId).catch(() => {
    /* lỗi mạng/server: silent — banner trạng thái đã hiện (offline/sync) */
  });
}, [online, activeFamilyId]);
```

- Chạy khi: AppShell mount (mở app), đổi family, event `online` (về lại
  mạng). Không có toast infra trong app — khoản mới tự hiện ở Lịch sử/Trang
  chủ sau khi cache bị invalidate (silent by design).

### 4.7 `ExpenseRow.tsx` — icon định kỳ

`expense.recurringRuleId != null` → hiện icon `RepeatIcon` nhỏ (12px,
`text-ink-muted`) cạnh tên danh mục + `sr-only` "định kỳ". Icon không đổi
layout hiện có (không thêm size prop); hành vi chạm hàng không đổi (vẫn mở
màn sửa khoản như thường — 4B).

### 4.8 `icons.tsx`

Thêm `RepeatIcon` (SVG mũi tên vòng lặp, style stroke khớp bộ icon hiện có).

### 4.9 Reuse UI (không tự viết mới)

`Button` (loading), `Card`, `Input`, `ConfirmDialog`, `Skeleton`, `formatVnd`,
`shortDate`/`today`/`monthOf` (`core/dates.ts`), token màu trong `index.css`
(`primary`, `ink-muted`, `border`, `surface`…). **Không** thêm UI library,
không thêm date-picker library (native `type="date"` — precedent AddPage;
iOS Safari render native picker).

## 5. Test case

### 5.1 Shared — `packages/shared/src/recurring.test.ts` (mới)

| # | Case | Kỳ vọng |
|---|------|---------|
| 1 | `advanceMonthly`: `"2026-01-31"` / `"2024-01-31"` (nhuận) / `"2026-01-15"` / `"2026-12-31"` | `"2026-02-28"` / `"2024-02-29"` / `"2026-02-15"` / `"2027-01-31"` |
| 2 | `firstOccurrenceFrom("2026-11-15", "2026-10-01")` (ngày trong tương lai) | `"2026-11-15"` (không đổi) |
| 3 | `firstOccurrenceFrom("2026-09-15", "2026-10-01")` (quá khứ) | `"2026-10-15"` |
| 4 | `firstOccurrenceFrom("2026-01-31", "2026-10-01")` — clamp chỉ tháng 2, các tháng khác về 31 | `"2026-10-31"` |
| 5 | `firstOccurrenceFrom("2026-01-31", "2026-02-15")` | `"2026-02-28"` |
| 6 | `materializeDates` FOREVER: `nextDate "2026-08-01"`, today `"2026-10-01"` | dates `["2026-08-01","2026-09-01","2026-10-01"]`, nextDate `"2026-11-01"`, completed `false` |
| 7 | `materializeDates` COUNT: `occurrenceCount 3, generatedCount 2, nextDate "2026-08-01"`, today `"2026-10-01"` | chỉ sinh **1** kỳ `["2026-08-01"]`, nextDate `null`, completed `true` |
| 8 | `materializeDates` UNTIL_DATE: `endDate "2026-09-01", nextDate "2026-08-01"`, today `"2026-10-01"` | dates `["2026-08-01","2026-09-01"]`, nextDate `null`, completed `true` |
| 9 | `materializeDates` `nextDate` trong tương lai (today `"2026-10-01"`, nextDate `"2026-11-01"`) | dates `[]`, nextDate giữ nguyên, completed `false` |
| 10 | `materializeDates` cap: FOREVER, nextDate `"2025-01-01"`, today `"2026-10-01"`, `cap=3` | 3 dates đầu, nextDate `"2025-04-01"`, completed `false` (tick sau nối tiếp) |
| 11 | `describeRecurringEnd`: FOREVER / UNTIL_DATE `"2026-12-31"` / COUNT 5 | `"Mãi mãi"` / `"Đến 31/12/2026"` / `"5 lần"` |

### 5.2 API — `apps/api/src/__tests__/recurring.test.ts` (mới, Postgres thật)

Setup: 1 OWNER + 1 MEMBER cùng family (pattern test có sẵn); helper tạo rule
qua API; `today` lấy `todayStr()` khi chạy test.

| # | Case | Kỳ vọng |
|---|------|---------|
| 12 | GET list family mới (chưa có rule) | 200, `rules: []` |
| 13 | POST rule (OWNER): FOREVER, `startDate = today`, amount 1500000, category preset | 201; DB: `nextDate = today`, `frequency "MONTHLY"`, `generatedCount 0` |
| 14 | POST rule (MEMBER) | 403 `OWNER_ONLY` |
| 15 | POST/GET rule family người lạ (user không phải member) | 403 `NOT_FAMILY_MEMBER` |
| 16 | POST rule sai validate (từng field): amount 0 / float / > 1e12 · note 201 ký tự · startDate `"2026-13-01"` · UNTIL_DATE thiếu endDate · COUNT thiếu count · FOREVER kèm endDate | 400 `VALIDATION_ERROR` (message chỉ đúng field sai) |
| 17 | POST rule UNTIL_DATE `endDate < firstOccurrenceFrom(startDate, today)` | 400 `VALIDATION_ERROR` |
| 18 | POST rule `categoryId` thuộc family khác | 404 `CATEGORY_NOT_FOUND` |
| 19 | POST rule `startDate` quá khứ (hôm nay − 40 ngày, ngày khớp) | 201; `nextDate` = ngày khớp ≥ hôm nay (không phải startDate) |
| 20 | POST materialize (MEMBER gọi) — rule `nextDate = today` | 200 `count 1`; Expense: amount/category/note = rule, `userId = rule.userId` (OWNER), `recurringRuleId` đúng; rule: `nextDate = +1 tháng`, `generatedCount 1` |
| 21 | POST materialize lần 2 (ngay sau #20) | 200 `count 0` — không sinh trùng |
| 22 | 2 POST materialize **song song** (`Promise.all`, rule chưa sinh kỳ hôm nay) | tổng `count` cả 2 = 1 (row lock + re-read) |
| 23 | materialize rule `nextDate` trong tương lai | 200 `count 0`, `nextDate` không đổi |
| 24 | Rule quá hạn 2 tháng (update `nextDate = today − 2 tháng` trực tiếp qua prisma) rồi materialize | 200 `count 3` (2 tháng trước + tháng trước + hôm nay); `nextDate` = tháng tới; 3 expense đúng ngày |
| 25 | Rule COUNT = 1, `nextDate = today`: materialize | 200 `count 1`; rule `completedAt` có giá trị, `nextDate null`; materialize lần 2 → `count 0` |
| 26 | Rule UNTIL_DATE `endDate = today`: materialize | 200 `count 1`, hoàn tất |
| 27 | GET `/api/recurring/:id` (MEMBER) | 200 + category nested |
| 28 | GET `/api/recurring/:id` (user không phải member) | 403 |
| 29 | PUT rule đổi amount (OWNER) — rule đã có 1 khoản sinh | 200; khoản đã sinh **không đổi** amount (check DB) |
| 30 | PUT rule (MEMBER) | 403 `FORBIDDEN` |
| 31 | PUT rule (OWNER, không phải người tạo — family 2 OWNER? không được → tạo OWNER 2nd qua seed membership) | 200 (OWNER luôn được) |
| 32 | PUT `startDate` vào tương lai — rule CHƯA có khoản sinh | `nextDate = startDate mới` |
| 33 | PUT `startDate` — rule ĐÃ có khoản sinh (max date D) | `nextDate = advanceMonthly(D)` (không phụ thuộc startDate mới) |
| 34 | PUT UNTIL_DATE `endDate` < kỳ kế tiếp | rule hoàn tất ngay: `nextDate null`, `completedAt` có giá trị |
| 35 | PUT `categoryId` thuộc family khác | 404 `CATEGORY_NOT_FOUND` |
| 36 | DELETE rule (OWNER) — rule đã sinh 2 khoản | 200; 2 expense **vẫn tồn tại**, `recurringRuleId = null` |
| 37 | DELETE rule (MEMBER) | 403 `FORBIDDEN` |
| 38 | PUT/DELETE `/api/recurring/:id` không tồn tại | 404 `RECURRING_RULE_NOT_FOUND` |
| 39 | GET list expenses sau materialize | khoản sinh có mặt, dto có `recurringRuleId` |
| 40 | PUT expense (khoản đã sinh) đổi date trùng ngày kỳ khác cùng rule | 409 `RECURRING_DATE_CONFLICT` |
| 41 | PUT expense (khoản đã sinh) đổi amount/category/note | 200 (4B — cho phép) |
| 42 | DELETE expense (khoản đã sinh, rule COUNT) → materialize | xoá OK; **không** sinh lại kỳ đó; `generatedCount` không giảm |
| 43 | DELETE category đang có rule định kỳ | 409 `CATEGORY_IN_USE` |

### 5.3 FE — `apps/web/src/__tests__/` (pattern mock dataApi hiện có)

| # | Case | Kỳ vọng |
|---|------|---------|
| 44 | `fetchRecurring` mock payload | map đúng shape `{ rules }`; đi qua read cache (key đúng dạng) |
| 45 | `createRecurringRule`/`updateRecurringRule`/`deleteRecurringRule` | đúng method + path + body; gọi `invalidateRecurringCache` (spy) |
| 46 | `materializeRecurring` `count 2` (2 tháng khác nhau) | invalidate expense cache đúng 2 months + 2 dates (spy) |
| 47 | `fetchExpenses` payload cache **cũ** (không có `recurringRuleId`) | normalize về `null` — consumer không thấy `undefined` |
| 48 | `RecurringPage` list: 1 active (COUNT 3, đã sinh 1) + 1 completed | 2 card đúng: "1/3 lần", "Kỳ tới: …", "Đã hoàn thành" |
| 49 | `RecurringPage` rỗng (OWNER) / (MEMBER) | OWNER: CTA "Tạo giao dịch định kỳ"; MEMBER: không CTA, card không chạm |
| 50 | `RecurringRulePage` (new) — chọn từng loại kết thúc | UI hiện/ẩn đúng: Mãi mãi (không dòng phụ) / Cho đến ngày (date input) / Số lần (input số) — như thiết kế |
| 51 | `RecurringRulePage` validate: endDate < kỳ đầu tiên · số tiền 0 | message lỗi + nút Lưu disabled |
| 52 | `RecurringRulePage` lưu mới | payload đúng (endType/endDate/occurrenceCount map đúng theo lựa chọn) + navigate `/recurring` |
| 53 | `RecurringRulePage` (edit) prefill từ rule + đổi amount + đổi endType | gọi `updateRecurringRule` payload đủ field |
| 54 | `RecurringRulePage` xoá rule | ConfirmDialog đúng message (khoản đã sinh giữ lại) → `deleteRecurringRule` |
| 55 | `RecurringRulePage` (MEMBER) | màn "Chỉ chủ gia đình…" — không render form |
| 56 | `ExpenseRow` expense có/không `recurringRuleId` | có: hiện icon định kỳ; không: không hiện (layout không đổi) |
| 57 | `AppShell`: online + activeFamilyId | gọi `materializeRecurring(fid)` (spy); offline → không gọi |
| 58 | `MePage` | hàng "Giao dịch định kỳ" → navigate `/recurring` |

### 5.4 E2E (Playwright) — spec mới `recurring.spec.ts`

| # | Case | Kỳ vọng |
|---|------|---------|
| 59 | Đăng ký family mới → Tôi → Giao dịch định kỳ → Tạo: số tiền 1.500.000 (Keypad), chọn danh mục, ghi chú "Tiền điện", Từ = hôm nay, kết thúc "Xảy ra một số lượng lần nhất định: 3" → Lưu → list hiện rule "Đang hoạt động · Kỳ tới: hôm nay" → mở Lịch sử: khoản 1.500.000 ₫ có mặt (materialize chạy khi mở app) với icon định kỳ → rule hiển thị "1/3 lần" | happy path toàn trình (materialize do AppShell tự gọi) |

(Lùi thời gian hàng tháng không thể trong E2E — được phủ bởi API test 24/25.)

### 5.5 Test hiện có phải cập nhật

- **Mọi mock `Expense`** trong test FE (AddPage, HistoryPage, HomePage, stats…)
  + mọi assertion dto trong `expense.test.ts`: thêm `recurringRuleId: null`
  (TS bắt — fail-fast).
- `AddPage`/`EditPage`: import `Keypad`, `CategoryChips` từ `shared/ui` —
  markup/props giữ nguyên nên test hành vi không đổi (chạy lại xác nhận).
- `category.test.ts`: + case DELETE 409 khi category có rule (case 43).

## 6. Vạch ngoài (không làm trong feature này)

- Tần suất khác (hàng ngày/tuần/năm) — schema đã dự phòng cột `frequency`.
- Vercel Cron / cron ngoài để sinh khoản khi user không mở app (có thể mở
  rộng sau: ping endpoint materialize + `CRON_SECRET`).
- Nhắc/PWA notification khi đến kỳ.
- Tạm dừng rule (pause) — hiện xoá/tạo lại.
- Số tiền đổi theo từng kỳ (ladder giá).
- Thu nhập định kỳ (app chỉ có chi tiêu).
- Tách view "sẽ phát sinh tháng tới" (ước tính budget) — thống kê hiện có
  đã bao gồm khoản đã sinh.

## 7. Rủi ro / lưu ý deploy

- Migration `add_recurring` **additive** (1 bảng + 2 cột nullable + unique
  index) — CI auto-migrate Supabase an toàn, không bước tay; chạy lại không
  làm gì.
- `@@unique([recurringRuleId, date])`: Postgres coi `NULL` khác `NULL` →
  khoản nhập tay nhiều cùng ngày **không** bị chặn (verified semantics).
- `Expense` dto + field → payload cache IndexedDB cũ trên máy user thiếu
  field → `fetchExpenses` normalize (mục 4.1) — không crash.
- Materialize trong AppShell: +1 request nhỏ mỗi lần mở app/đổi family về
  online — chấp nhận; lỗi mạng silent (banner hiện hành đủ).
- Offline: khoản định kỳ chưa sinh khi offline; khi về online, effect
  `online` re-run → catch-up (có cap 400 kỳ chống flood).
- `todayStr()` UTC (convention toàn app qua `lib/dates.ts`): user ở UTC+7 xem
  app giữa 17:00–24:00 giờ VN có thể lệch "hôm nay" so với UTC ở rìa ngày —
  chấp nhận (giống mọi tính năng khác trong app).
- Race materialize song song: row lock `FOR UPDATE` + re-read + unique
  constraint — 3 tầng, test 22 khoá.
- Xoá rule giữa chừng transaction materialize: lock row giữ tới hết tx —
  không có expense mồ côi trỏ rule đã xoá.

## 8. WBS (1 task = 1 commit vào `develop`, Conventional Commits)

| # | Commit | Nội dung |
|---|--------|----------|
| 1 | `docs` | Spec này |
| 2 | `feat(shared)` | `recurring.ts` (types + `advanceMonthly`, `firstOccurrenceFrom`, `materializeDates`, `describeRecurringEnd`) + export `index.ts` + `Expense.recurringRuleId` + `recurring.test.ts` (case 1–11) + cập nhật mock `Expense` (TS bắt) |
| 3 | `feat(api)` | Prisma schema (`RecurringRule` + `Expense.recurringRuleId` + `@@unique` + relations) + migration `add_recurring` + `prisma generate` |
| 4 | `feat(api)` | `recurring.routes.ts` (6 endpoint + 2 router) + sửa `expense.routes.ts` (dto + 409 `RECURRING_DATE_CONFLICT`) + sửa `category.routes.ts` (409 khi có rule) + mount `app.ts` + `recurring.test.ts` (case 12–43) |
| 5 | `feat(web)` | Nâng `Keypad` lên `shared/ui` + `CategoryChips` mới + cập nhật AddPage/EditPage + `dataApi` 5 hàm + readCache/cacheInvalidate (`recurring`) + `RecurringPage` (list + rỗng + member/owner) + router + hàng entry MePage + test (case 44–49, 57, 58) |
| 6 | `feat(web)` | `RecurringRulePage` (form mới/sửa + khối Tùy Chỉnh + validate + xoá) + `RepeatIcon` + icon trên `ExpenseRow` + materialize trong AppShell + test (case 50–56) |
| 7 | `test` | E2E `recurring.spec.ts` (case 59) + cập nhật `docs/handoff/progress.md` |
