import type { InputProps } from "../../shared/ui/Input";
import { Input } from "../../shared/ui/Input";

/**
 * Input số nguyên hiển thị dấu phân cách hàng nghìn kiểu vi-VN (3.200.000).
 *
 * `type="number"` không render được dấu chấm (trình duyệt bỏ ký tự lạ),
 * nên dùng `type="text" + inputMode="numeric"`: mobile vẫn lên bàn phím số,
 * desktop gõ tự do — onChange chỉ nhận chữ số (lọc hết ký tự khác), giữ
 * tối đa 10 chữ số (≈ trần 1e9 phía API; vượt thì API trả 400).
 *
 * State ở component cha giữ dạng CHUỖI SỐ THUẦN (VD "3200000") — component
 * này chỉ lo hiển thị + lọc khi nhập. Số 0 dẫn đầu vẫn group bình thường
 * ("0007" → "0.007", "0003200" → "0.003.200"); parse ra đúng giá trị.
 */
const MAX_DIGITS = 10;

function groupDigits(raw: string): string {
  return raw.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

interface NumberInputProps extends Omit<InputProps, "value" | "onChange"> {
  /** Chuỗi số thuần (VD "3200000"); "" = rỗng. */
  value: string;
  /** Nhận lại chuỗi số thuần sau khi lọc. */
  onValueChange: (raw: string) => void;
}

export function NumberInput({ value, onValueChange, ...rest }: NumberInputProps) {
  return (
    <Input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      value={groupDigits(value)}
      onChange={(e) => {
        onValueChange(e.target.value.replace(/\D/g, "").slice(0, MAX_DIGITS));
      }}
      {...rest}
    />
  );
}
