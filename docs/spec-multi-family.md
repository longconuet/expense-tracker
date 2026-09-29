# Spec — Tạo thêm & join thêm gia đình (multi-family)

> Task: user đã có sẵn family muốn **tạo thêm gia đình mới** hoặc **join gia đình khác** bằng
> mã mời, trực tiếp trong app (không chỉ trong onboarding lần đầu).

## 1. Hiện trạng (không cần đổi)

- API `POST /api/families` + `POST /api/families/join` chỉ guard `requireAuth` — **không chặn
  user tạo/join family thứ 2**. DB M:N qua `FamilyMember`.
- `authStore`: `createFamily`/`joinFamily` đã append vào `families` + **tự set
  `activeFamilyId`** về family mới.
- Các trang dữ liệu key theo `activeFamilyId`, tự refetch khi đổi family; read cache scope
  theo familyId.
- **Điểm thiếu duy nhất**: FE không có entry nào cho user đã có family (OnboardingPage chỉ
  render khi 0 family, FamilySwitcher chỉ có chọn).

## 2. Thiết kế (đã duyệt)

1. **Entry**: 2 nút action ở đáy dialog FamilySwitcher (bottom sheet mở từ card family trên
   tab Tôi): `+ Tạo gia đình mới` / `Join bằng mã mời`.
2. **Form trong sheet**: FamilySwitcher chuyển nội dung sang view `create`/`join` (có nút
   "Quay lại" về list) — không modal chồng modal.
3. **Sau thành công**: store tự đổi `activeFamilyId` về family mới → **đóng dialog +
   navigate về `/`** (khớp hành vi onboarding). Lỗi → dialog giữ mở, hiện message trong form.
4. **Phạm vi**: chỉ tạo + join. Thoát/xoá family, đổi mã mời, đổi tên family = task sau
   (3 endpoint API đã sẵn sàng). Không giới hạn số family/user (YAGNI).

## 3. Thay đổi

### FE

| File | Thay đổi |
|---|---|
| `apps/web/src/core/familyForm.ts` **(mới)** | Validation thuần dùng chung: `INVITE_CODE_PATTERN`, `validateFamilyName(name)` (trim, 2–50 ký tự — khớp `familyNameSchema` API), `validateInviteCode(code)` |
| `apps/web/src/shared/ui/FamilySwitcher.tsx` | Props optional `onCreateFamily?: (name) => Promise<void>` + `onJoinFamily?: (code) => Promise<void>` → hiện 2 nút action; state nội bộ `view: "list" \| "create" \| "join"`; form validate local trước, gọi callback, reject → hiện lỗi trong form. **Giữ UI primitive thuần**: không `inject()`, không HTTP, không tự close/navigate — parent quyết định |
| `apps/web/src/features/me/MePage.tsx` | Nối callback: `await createFamily(name)`/`await joinFamily(code)` → đóng switcher → `navigate("/", { replace: true })`. Lỗi throw lên FamilySwitcher hiển thị |
| `apps/web/src/features/auth/OnboardingPage.tsx` | Refactor: import validation từ `core/familyForm.ts`, bỏ regex inline. **Không đổi hành vi** |
| `apps/web/src/features/auth/JoinPage.tsx` | Refactor tương tự OnboardingPage (regex inline → `validateInviteCode`) — phát hiện ở code review, tránh drift alphabet 2 chỗ. **Không đổi hành vi** |

### BE

- **Không endpoint mới.**
- `apps/api/src/__tests__/family.test.ts`: +2 test "khóa hành vi" — user thuộc 1 family
  tạo được family thứ 2 (201, `/me` = 2 family); join được family thứ 2 (201) — chống
  regress nếu ai thêm guard "1 user = 1 family".

## 4. Hành vi UI chi tiết (FamilySwitcher)

- View `list`: giữ nguyên list family; đáy sheet (chỉ khi có callback tương ứng) 2 nút
  secondary: `+ Tạo gia đình mới`, `Join bằng mã mời`.
- View `create`: Input "Tên gia đình" (placeholder "Nhà Mình", maxLength 50) + Button submit
  `Tạo gia đình` (loading khi chờ) + nút text "Quay lại".
- View `join`: Input "Mã mời" (normalize uppercase + lọc `[A-Z0-9]`, maxLength 6, giống
  OnboardingPage) + Button submit `Tham gia` + nút "Quay lại".
- Validate local sai → lỗi trên Input (`role="alert"`, qua prop `error` của Input), không gọi
  callback.
- Callback reject: `ApiError` → hiện `err.message` (message server tiếng Việt); khác →
  fallback `"Có lỗi xảy ra, vui lòng thử lại."`
- Input hợp lệ nhưng callback đang chạy: button `loading` (disable) — chống bấm dồn.
  Nút "Quay lại" cũng `disabled` trong khi submit (tránh đổi view nuốt lỗi + cửa sổ
  double-submit 2 form khi `submitting` là boolean dùng chung).
- `aria-label` dialog theo view: "Đổi gia đình" (list) / "Tạo gia đình mới" / "Join bằng
  mã mời" — screen reader đọc đúng ngữ cảnh.
- Backdrop click vẫn `onClose` như hiện tại (kể cả khi đang ở view form — user chấp nhận mất
  form, không cần confirm thêm).

## 5. Test case

### FE — `FamilySwitcher.test.tsx` (mở rộng)

1. Không truyền callback → không hiện 2 nút action (backward-compat).
2. Truyền cả 2 callback → hiện cả 2 nút ở đáy sheet.
3. Create: submit tên rỗng / < 2 ký tự → hiện lỗi, **không** gọi callback.
4. Create: tên hợp lệ → gọi `onCreateFamily` (đã trim) + button loading trong khi chờ.
5. Create: callback reject `ApiError("…")` → hiện đúng message server.
6. Create: callback reject (không phải ApiError) → hiện fallback.
7. Join: mã sai (độ dài) → lỗi validate, không gọi callback.
7b. Join: mã đủ 6 ký tự nhưng chứa ký tự cấm (0, 1, I, O) → lỗi validate, không gọi callback.
8. Join: mã 6 ký tự (gõ thường) → gọi `onJoinFamily` với mã uppercase.
9. Join: callback reject `ApiError` → hiện message.
10. Nút "Quay lại" trong view create/join → về lại list.

### FE — `MePage.test.tsx` (mở rộng)

11. Mở switcher → thấy cả 2 nút action.
12. Luồng create full: nhập tên → submit → `createFamily` được gọi, dialog đóng, về `/`.
13. Luồng join full: nhập mã → submit → `joinFamily` được gọi, dialog đóng, về `/`.
14. Store action reject → dialog vẫn mở + hiện lỗi.

### BE — `family.test.ts` (mở rộng)

15. User thuộc 1 family tạo được family thứ 2 (201; `GET /me` trả 2 family).
16. User join được family thứ 2 bằng mã khác (201; `GET /me` trả 2 family).

### Hồi quy

- OnboardingPage: test hiện có xanh (refactor không đổi hành vi).
- FamilySwitcher/MePage: 4 test hiện có + test AppShell (assert không có dialog khi không mở) xanh.

## 6. Edge cases

| Case | Xử lý |
|---|---|
| Join family đang là member | API 409 `ALREADY_MEMBER` → message server hiện trong form |
| Mã không tồn tại | API 404 `FAMILY_NOT_FOUND` → message server |
| Tên > 50 ký tự | Input maxLength 50 + validate local |
| Offline/lỗi mạng | Fallback message chung |
| Bấm submit dồn | Button loading/disable |
| User 0 family | Không chạm luồng này (onboarding xử lý) |

## 7. Out of scope (task sau)

- UI: thoát family, xoá family, regenerate mã mời (API đã sẵn sàng).
- Đổi tên family (cần thêm endpoint).
- Giới hạn số family/user.
