# Spec — Thống kê điện/nước theo tháng (màn Tiền phòng trọ)

> Bổ sung cho feature "Tiền phòng trọ" (spec chính: `docs/spec-rental.md`).
> User chốt 4 điểm thiết kế: **biểu đồ + bảng** · **chỉ tháng Đã chốt
> (CONFIRMED)** · **12 tháng gần nhất + selector năm** · ban đầu làm section
> dưới list tháng. **Đổi 01/10/2026** (request trực tiếp user): thống kê
> chuyển sang **màn riêng `/rental/stats`** (nút vào trên danh sách tháng
> /rental + nút back) + **bảng 3 cột** không scroll ngang (badge số lượng,
> icon ⚡/💧 cho label Điện/Nước). **Đổi 01/10/2026 (lượt 2)**: bảng tách
> **card riêng** + 1 tháng = **1 dòng** (badge + tiền ngang hàng) + badge đổi
> màu; Home: card Tiền phòng trọ xuống dưới card Tổng chi tiêu.

## 1. Tổng quan

**Màn riêng** `RentalStatsPage` (route `/rental/stats`, lazy load — recharts).
Điểm vào: nút "Thống kê sử dụng điện & nước" **trên** danh sách tháng ở
`/rental` (mọi member thấy); nút back "← Về danh sách tháng" về `/rental`.
So sánh theo tháng số điện (kWh) + tiền điện, số nước (m³) + tiền nước — 1
panel biểu đồ cho điện, 1 panel cho nước + bảng chi tiết. Dữ liệu **đọc từ
payload `fetchRental` hiện có** (màn tự fetch như `RentalMonthPage` — user
vào thẳng URL/refresh được) — không endpoint mới, không đổi API/schema/cache.

**Phạm vi hiển thị** (quyết định chốt):

- Chỉ tháng **CONFIRMED** — DRAFT có thể chưa đọc số công tơ (new = 0) sẽ làm
  méo biểu đồ; ghi chú nhỏ dưới tiêu đề section: "Chỉ tính các tháng đã chốt".
- Selector phạm vi (chip, pattern như chip lọc HistoryPage):
  - **"12 tháng gần"** (mặc định) = **12 tháng CONFIRMED gần nhất** theo thứ
    tự tháng (không phải cửa sổ lịch — 5 tháng đã chốt thì hiện 5; tháng
    chưa tạo/ chưa chốt không chiếm chỗ).
  - **"Tất cả"** = mọi tháng CONFIRMED.
  - **Tên năm** (2026, 2025…) — chỉ các năm **có ít nhất 1 tháng CONFIRMED**,
    sort desc.
- Thứ tự trong biểu đồ: **asc theo tháng** (trái = cũ, phải = mới — trend).
  Thứ tự bảng: **desc** (mới nhất trên — khớp pattern list màn).
- MEMBER xem được (section chỉ-đọc, không có hành động).

## 2. Dữ liệu (không đổi API)

- Nguồn: `fetchRental(familyId)` → `months: RentalMonth[]` — mỗi tháng đã có
  computed fields do API tính sẵn (`computeRentalTotals` trong `toMonthDto`):
  `month` ("YYYY-MM"), `status`, `elecConsumption` (kWh), `electricityCost` (đ),
  `waterConsumption` (m³), `waterCost` (đ).
- FE filter: `months.filter(m => m.status === "CONFIRMED")`.
- Read cache `GET /rental` (TTL 24h) + invalidation hiện có — không thay đổi.

## 3. Thiết kế FE

### 3.1 Cấu trúc file (`features/rental/` — component chỉ dùng trong feature)

| File | Vai trò |
|---|---|
| `rentalStats.ts` | Pure functions: lọc/sort/chọn phạm vi + summary + map data chart (test được trực tiếp, không phụ thuộc UI) |
| `RentalStatsPage.tsx` (mới) | Màn `/rental/stats` (default export — lazy route): header back + tiêu đề + ghi chú + **2 card** (selector chip + 2 panel `MeterTrendPanel` / bảng chi tiết 3 cột, card riêng với heading "Chi tiết theo tháng"); tự fetch `fetchRental` (pattern `RentalMonthPage`) |
| `MeterTrendPanel.tsx` | 1 panel = tiêu đề ("Điện" / "Nước") + icon (⚡ `BoltIcon` / 💧 `DropletIcon`) + dòng summary + recharts `ComposedChart` (cột lượng + đường tiền, dual axis) — dùng chung 2 lần (props: data, unit, màu, titleIcon) |
| `RentalPage.tsx` (sửa) | Nút "Thống kê sử dụng điện & nước" (Link → `/rental/stats`) **trên** khối list tháng — thay section inline cũ; mọi member thấy |
| `router.tsx` (sửa) | Route `/rental/stats` (lazy + Suspense như `StatsPage`) khai báo TRƯỚC `/rental/:month` (static segment thắng dynamic — RR v6/v7 ranking) |
| `icons.tsx` (sửa, shared/ui) | Thêm `BoltIcon` + `DropletIcon` (SVG stroke currentColor, không thêm icon library) |
| `index.css` (sửa) | Token màu nước cho màn thống kê: `--color-water` (light #2563eb / dark #60a5fa), `--color-water-soft` (nền badge), `--color-water-text` (chữ badge 11px — WCAG AA trên soft) |
| `HomePage.tsx` (sửa) | Card `RentalCard` di chuyển xuống **dưới** card "Tổng chi tiêu" (trước ở trên cùng) — chỉ render khi stats đã load |

`RentalStatsPage` tự fetch `fetchRental(activeFamilyId)` khi mount (không nhận
prop — là route độc lập, user vào thẳng/refresh được). State local: `range`
(chip đang chọn, default `"12m"`).

### 3.2 `rentalStats.ts` — pure functions

```ts
/** Các tháng tham gia thống kê: chỉ CONFIRMED. */
type StatsMonth = Pick<RentalMonth, "month" | "elecConsumption" | "electricityCost" | "waterConsumption" | "waterCost">;

export type StatsRange = "12m" | "all" | string; // string = "YYYY"

/** Năm có ≥ 1 tháng CONFIRMED, sort desc (cho selector). */
export function statsYears(months: RentalMonth[]): string[];

/**
 * Chọn tập tháng theo range:
 * - "12m": 12 tháng CONFIRMED gần nhất (ít hơn thì hết)
 * - "all": mọi tháng CONFIRMED
 * - "YYYY": tháng CONFIRMED của năm đó
 * Trả về sort ASC theo month (chuẩn cho trend chart).
 */
export function selectStatsMonths(months: RentalMonth[], range: StatsRange): StatsMonth[];

/** Map sang data chart: { month, label: "07/26", qty, cost } (asc). */
export function buildTrendData(selected: StatsMonth[], kind: "elec" | "water"):
  Array<{ month: string; label: string; qty: number; cost: number }>;

/** Summary 1 metric: { avgQty, avgCost, peakMonth, lowMonth } | null (rỗng).
 *  avg = làm tròn int; peak/low theo QTY (tháng cực đại/tiểu). */
export function summarizeTrend(selected: StatsMonth[], kind: "elec" | "water"):
  { avgQty: number; avgCost: number; peakMonth: string; lowMonth: string } | null;
```

### 3.3 Biểu đồ (recharts — pattern `StatsPage` hiện có)

Mỗi `MeterTrendPanel`:

- `ComposedChart` (ResponsiveContainer — giống StatsPage):
  - `Bar` = **lượng** (kWh / m³) — `yAxisId="qty"` (trái).
  - `Line` = **tiền** (đ) — `yAxisId="cost"` (phải).
- Trục phải (tiền): tick compact **triệu đồng** — helper `formatTrieu(v)`
  (1.120.000 → `"1,12"`, tick render `1,12 tr`; < 1.000.000 → 2 số sau dấu
  phẩy vẫn đủ đọc, VD 210.000 → `"0,21"`). Trục trái: int thường.
- Tooltip (recharts `<Tooltip>`): `Tháng 7/2026` + `280 kWh · 1.120.000 ₫`
  (formatMeter/formatVnd hiện có).
- XAxis tick = `label` "07/26" (MM/YY).
- Màu: **dùng lại token màu chart của màn Thống kê** (kiểm tra `StatsPage` khi
  implement — không phát minh màu mới; điện 1 màu, nước 1 màu, đường tiền cùng
  tone đậm hơn cột).
- 1 tháng: 1 cột + 1 điểm — render bình thường (không special-case).

### 3.4 Dòng summary (dưới tiêu đề panel)

`text-xs text-ink-muted`, 1 dòng:
`TB 280 kWh · 1.120.000 ₫/tháng · Cao nhất 07/2026 (512 kWh) · Thấp nhất 01/2026 (180 kWh)`
(chỉ 1 tháng → bỏ phần cao/thấp nhất). Rỗng → không render panel (xem 3.6).

### 3.5 Bảng chi tiết — 3 cột, card riêng, 1 tháng = 1 dòng (360px không scroll ngang)

> Đổi 01/10/2026 (request user): bảng 5 cột cũ phải scroll ngang ở điện thoại.
> Đổi 01/10/2026 (request user, lượt 2): tách bảng thành **card riêng** (trước
> chung card với biểu đồ) + 1 tháng chỉ **1 dòng** (trước badge trên/tiền dưới
> = 2 dòng) + badge đổi màu để phân biệt số lượng vs tiền.

- **Card riêng** với heading `"Chi tiết theo tháng"` (`font-semibold text-ink`,
  khớp convention h2 card khác) — tách khỏi card selector + 2 panel.
- 3 cột: (không header "Tháng") | ⚡ Điện | 💧 Nước. Sort **desc** theo tháng;
  cột 1 = `monthLabel` ("Tháng 7/2026") — header **không hiện text "Tháng"**
  (th rỗng + `aria-label="Tháng"` cho screen reader).
- Mỗi cột điện/nước **1 DÒNG**: badge số lượng + tiền nằm **ngang hàng**
  (`flex items-center justify-end`, `whitespace-nowrap`, căn phải,
  `tabular-nums`):
  - Badge điện: `bg-primary-soft text-primary-text`; badge nước:
    `bg-water-soft text-water-text` — màu khác tone tiền để phân biệt.
    (Token `--color-water-text` riêng cho chữ badge 11px vì `water` trên nền
    soft không đạt WCAG AA: light 2.8:1 → `water-text` #1e40af ≈ 6.6:1;
    dark #93c5fd ≈ 5.9:1 — review 01/10/2026).
- Header cột Điện/Nước kèm icon `BoltIcon`/`DropletIcon` (màu:
  `--color-primary` / `--color-water`); icon panel Nước cũng `text-water`.
  Token màu nước định nghĩa tập trung trong `index.css` (`--color-water`,
  `--color-water-soft`, `--color-water-text` — light + dark). Line chart nước
  dùng `var(--color-water)`; bar chart giữ hex cố định `#3b82f6` (precedent
  palette chart).
- `text-xs` + `w-full` + wrapper `overflow-x-auto` (safety net — với dữ liệu
  thực tế bảng vừa 360px, E2E assert không overflow ở cả desktop và 360px).
- Δ % so tháng trước: **vạch ngoài v1** (biểu đồ + tooltip đã đủ so sánh;
  follow-up nếu user muốn).

### 3.6 Empty states

- **0 tháng CONFIRMED** (chưa chốt lần nào): màn hiện Card 1 dòng
  "Chưa có dữ liệu — thống kê hiện sau khi bạn chốt tháng đầu tiên." — không
  render selector/chart/bảng. Chưa có config (vào thẳng URL): dòng
  "Chưa có thông tin phòng trọ — thống kê hiện sau khi chốt tháng đầu tiên."
- Range năm được chọn mà năm đó rỗng (không xảy ra do selector chỉ liệt năm
  có data — không cần handle).

## 4. Test case (viết TRƯỚC khi code)

### 4.1 Unit — `rentalStats.test.ts` (mới, pure functions)

| # | Case | Kỳ vọng |
|---|------|---------|
| 1 | `selectStatsMonths` với DRAFT + CONFIRMED lẫn lộn | chỉ trả CONFIRMED, asc |
| 2 | range "12m" với 15 tháng CONFIRMED | đúng 12 tháng gần nhất (3 tháng cũ bị cắt) |
| 3 | range "12m" với 5 tháng CONFIRMED | trả đủ 5 |
| 4 | range "2026" | chỉ tháng 2026; range "all" = hết |
| 5 | `statsYears` (tháng 2025×1, 2026×3, 1 DRAFT 2024) | `["2026","2025"]` — 2024 không có (chỉ DRAFT) |
| 6 | `buildTrendData` 2 tháng elec | asc, `label` "07/26" đúng MM/YY, qty/cost map đúng field |
| 7 | `summarizeTrend` elec (data thật: 280/1.120.000 + 331/1.324.000) | avgQty 306 (làm tròn), avgCost 1.222.000 (làm tròn), peak = tháng 331, low = tháng 280 |
| 8 | `summarizeTrend` 1 tháng | peak = low = tháng đó |
| 9 | `summarizeTrend` rỗng | `null` |

### 4.2 Unit — component (thêm vào `rentalPages.test.tsx`)

| # | Case | Kỳ vọng |
|---|------|---------|
| 10a | `RentalPage` có config | nút "Thống kê sử dụng điện & nước" (Link `/rental/stats`) trên list; MEMBER cũng thấy; click → vào màn thống kê (h1 + back) |
| 10 | `RentalStatsPage` 2 tháng CONFIRMED (data thật tháng 7 + 1 tháng khác) | ghi chú "Chỉ tính các tháng đã chốt", 2 panel (heading Điện/Nước + icon), heading "Chi tiết theo tháng" (bảng trên **card riêng**), bảng 3 cột: 3 columnheader **không** text "Tháng" (visible), badge "280 kWh" (class `bg-primary-soft text-primary-text`) + "1.120.000 ₫" · "6 m³" (class `bg-water-soft text-water-text`) + "210.000 ₫" · "140.000 ₫", chip "12 tháng gần" pressed |
| 11 | `RentalStatsPage` tháng chỉ DRAFT (chưa chốt lần nào) | dòng "Chưa có dữ liệu…", không có chart/bảng/selector |
| 11b | `RentalStatsPage` vào thẳng URL khi chưa có config | dòng "Chưa có thông tin phòng trọ…", không có bảng |
| 12 | Selector: click chip năm | bảng + chart chỉ còn tháng năm đó (assert 1 hàng trong bảng) |
| 13 | DRAFT + CONFIRMED cùng năm | tháng DRAFT KHÔNG hiện trong bảng (cũng không ở đâu trên màn) |
| 14 | MEMBER (mock role) | màn thống kê hiện như OWNER (chỉ-đọc, mọi thứ xem được) |
| 15 | Dòng summary panel điện (2 tháng) | "TB" + giá trị đúng + "Cao nhất" đúng tháng |
| 16 | Nút back "← Về danh sách tháng" | về /rental — list tháng hiện |

(Ghi chú implement: test recharts trên jsdom — assert qua DOM (svg, text bảng,
summary) + pure functions (đã phủ ở 4.1); không assert pixel/tooltip.)

### 4.3 E2E — `rental.spec.ts` (case 57)

| # | Case | Kỳ vọng |
|---|------|---------|
| 57 | (kéo dài 54: đã chốt **tháng hiện tại** — draft tự tạo khi lưu config) ở `/rental` → click nút thống kê → assert màn thống kê → back | màn: back + h1 + chip "12 tháng gần" pressed + ghi chú "Chỉ tính các tháng đã chốt"; 2 panel (heading Điện/Nước) + 2 chart svg; heading "Chi tiết theo tháng" (bảng trên **card riêng**); bảng **3 cột** (3 columnheader, không "Tháng"): 1 hàng — tháng hiện tại · badge **280 kWh** + **980.000 ₫** (tiền điện sau khi case 54 đổi giá 3.500) · badge **6 m³** + 210.000 ₫; **1 tháng = 1 dòng** (boundingBox badge & tiền cùng y ±3px) + **không overflow ngang** (scrollWidth−clientWidth ≤ 1) ở cả desktop **và 360px mobile**; summary "TB 280 kWh · 980.000 ₫/tháng" (1 tháng → không có cao/thấp nhất); hover cột → tooltip đúng series; back → /rental (list tháng) |

## 5. Vạch ngoài (v1)

- Δ % so tháng trước (bảng/tooltip) — follow-up nếu user chốt.
- So sánh cùng tháng 2 năm (year-over-year), xu hướng theo quý.
- Tách chi phí cố định / công tơ trong thống kê (yêu cầu chỉ nói phần
  điện + nước).
- Endpoint `/rental/stats` riêng — data nhỏ (1 hàng/tháng), reuse payload
  `GET /rental` là đủ (YAGNI).
- Export bảng (CSV/XLSX).

## 6. Rủi ro / lưu ý

- recharts + ResponsiveContainer là pattern **đã chạy** ở `StatsPage` — không
  rủi ro thư viện mới.
- Dual-axis (kWh 0–500 vs tiền 0–5M): trục phải compact "tr" (§3.3) — nếu
  implement thấy tick "0,21 tr" khó đọc ở giá trị nhỏ thì fallback: tick theo
  nghìn ("210k") — quyết định lúc code, giữ 1 helper `formatCostTick` duy nhất.
- 12-month = 12 tháng **đã chốt** gần nhất (không phải cửa sổ lịch) — đã ghi
  rõ §1; nếu user sau này muốn theo lịch thì chỉ đổi 1 hàm `selectStatsMonths`.
- Mobile: bảng 3 cột trên card riêng, 1 tháng = 1 dòng (badge + tiền ngang
  hàng, nowrap) vừa 360px — E2E assert không overflow (desktop + 360px);
  `overflow-x-auto` chỉ là safety net cho giá trị bất thường (VD kWh 4 chữ số
  hàng nghìn — không thực tế với hộ gia đình). 2 panel chart xếp dọc
  (không side-by-side).
- Không đụng: API, Prisma, cache. Router thêm 1 route `/rental/stats` (lazy —
  recharts **ra khỏi main bundle**, trước đó bị kéo qua section eager ở
  `RentalPage`).

## 7. WBS (1 task = 1 commit vào `develop`)

| # | Commit | Nội dung |
|---|--------|----------|
| 1 | `docs` | Spec này |
| 2 | `feat(web)` | `features/rental/rentalStats.ts` (pure functions) + `rentalStats.test.ts` (case 1–9) |
| 3 | `feat(web)` | `MeterTrendPanel` + section inline (biểu đồ recharts + bảng + selector + empty state) + tích hợp `RentalPage` + test case 10–15 |
| 4 | `test` | E2E case 57 + cập nhật `docs/handoff/progress.md` |
| 5 | `feat(web)` | **(đổi 01/10/2026)** section inline → **màn riêng `/rental/stats`** (nút vào + back) + bảng 3 cột không scroll ngang (badge + icon) — spec §1/§3.1/§3.5/§4 cập nhật + test case 10a/11b/16 + E2E case 57 flow mới |
| 6 | `feat(web)` | **(đổi 01/10/2026, lượt 2)** bảng chi tiết tách **card riêng** + 1 tháng = **1 dòng** (badge + tiền ngang hàng) + badge đổi màu (token `--color-water*` mới, chữ badge `water-text` đạt WCAG AA — fix review HIGH) + Home: card Tiền phòng trọ xuống dưới Tổng chi tiêu — spec §3.1/§3.5/§4 cập nhật + test order Home + E2E assert 1 dòng & không overflow 360px |
