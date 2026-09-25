import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { formatVnd, formatVndCompact, type Category } from "@expense-tracker/shared";
import { ApiError } from "../../core/api";
import { useAuthStore } from "../../core/authStore";
import { createExpense, fetchCategories } from "../../core/dataApi";
import { today } from "../../core/dates";
import { Button } from "../../shared/ui/Button";
import { Card } from "../../shared/ui/Card";
import { Input } from "../../shared/ui/Input";
import { Spinner } from "../../shared/ui/Spinner";
import { haptic } from "./haptic";
import { suggestAmounts } from "./amountSuggestions";
import { Keypad, type KeypadKey } from "./Keypad";

/**
 * Màn nhập khoản chi nhanh (WBS 9): full-screen, số tiền gõ bằng
 * **keypad số** (không dùng bàn phím hệ thống), danh mục cuộn
 * ngang viên tròn (không tiêu đề), ngày mặc định hôm nay (chạm để đổi),
 * "Lưu" sáng lên khi đủ số + danh mục, haptic khi chạm phím/nút.
 * Keypad (size md 56px) đặt trên khu vực ngày + ghi chú để mobile
 * nhập số tiện — không phải cuộn xuống.
 * Khi gõ dở hiện chip gợi ý số tròn ngay dưới số tiền (VD "2" →
 * 2k · 20k · 200k · 2m) — chạm chip điền luôn giá trị; keypad có thêm
 * nút "C" xoá toàn bộ số tiền.
 */

const MAX_AMOUNT_DIGITS = 9; // 999.999.999 ₫

/** Số gợi ý → class cột grid (class đầy đủ để Tailwind quét được). */
const SUGGEST_COLS: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
};

export default function AddPage() {
  const navigate = useNavigate();
  const activeFamilyId = useAuthStore((s) => s.activeFamilyId);

  const [categories, setCategories] = useState<Category[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today());
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!activeFamilyId) return;
    let cancelled = false;
    fetchCategories(activeFamilyId)
      .then((cats) => {
        if (!cancelled) setCategories(cats);
      })
      .catch((err) => {
        if (!cancelled) {
          setLoadError(err instanceof ApiError ? err.message : "Không tải được danh mục.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [activeFamilyId]);

  const parsedAmount = parseInt(amount || "0", 10);
  const ready = parsedAmount > 0 && categoryId !== null;
  const suggestions = suggestAmounts(amount);

  function pressKey(key: KeypadKey) {
    if (submitting) return;
    haptic(8);
    if (key === "back") {
      setAmount((a) => a.slice(0, -1));
      return;
    }
    setAmount((a) => (a.length >= MAX_AMOUNT_DIGITS ? a : a + key));
  }

  // Bàn phím vật lý (desktop): phím số + Backspace gõ thẳng vào số tiền.
  // Bỏ qua khi focus ở ô nhập text (ghi chú) — người dùng đang gõ chữ.
  const pressKeyRef = useRef(pressKey);
  pressKeyRef.current = pressKey;
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      if (/^[0-9]$/.test(event.key)) {
        pressKeyRef.current(event.key as KeypadKey);
      } else if (event.key === "Backspace") {
        pressKeyRef.current("back");
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  if (!activeFamilyId) {
    return <p className="text-ink-muted">Chưa có gia đình để ghi khoản chi.</p>;
  }

  async function handleSubmit() {
    if (submitting) return;
    setFormError(null);

    if (!parsedAmount || parsedAmount < 1) {
      setFormError("Số tiền phải là số nguyên lớn hơn 0.");
      return;
    }
    if (!categoryId) {
      setFormError("Chọn một danh mục.");
      return;
    }
    if (!date) {
      setFormError("Chọn ngày chi tiêu.");
      return;
    }

    haptic(15);
    setSubmitting(true);
    try {
      const selectedCategory = categories?.find((c) => c.id === categoryId);
      if (!selectedCategory) {
        setFormError("Chọn một danh mục.");
        return;
      }
      await createExpense({
        familyId: activeFamilyId!,
        category: selectedCategory,
        amount: parsedAmount,
        date,
        note: note.trim() || undefined,
      });
      // Thành công online HOẶC đã lưu offline (banner "chờ đồng bộ" hiện ở header)
      navigate("/", { replace: true });
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Có lỗi xảy ra, vui lòng thử lại.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loadError) {
    return <p role="alert" className="text-sm font-medium text-danger">{loadError}</p>;
  }

  if (!categories) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }

  return (
    <div role="form" aria-label="Thêm khoản chi" className="flex flex-col">
      <h1 className="text-xl font-bold text-ink">Thêm khoản chi</h1>

      {/* Số tiền — hiển thị lớn, gõ bằng keypad bên dưới */}
      <div className="mt-3 rounded-2xl border border-border bg-card px-4 py-5 text-center">
        <span aria-live="polite" className="text-5xl font-bold tracking-tight text-ink tabular-nums">
          {amount ? Number(amount).toLocaleString("vi-VN") : "0"}
        </span>
        <span className="ml-1.5 text-2xl font-semibold text-ink-muted">₫</span>
      </div>

      {/* Gợi ý số tròn khi đang gõ dở — chạm chip điền luôn giá trị */}
      {suggestions.length > 0 ? (
        <div
          role="group"
          aria-label="Gợi ý số tiền"
          className={`mt-2 grid gap-2 ${SUGGEST_COLS[suggestions.length]}`}
        >
          {suggestions.map((value) => (
            <button
              key={value}
              type="button"
              disabled={submitting}
              aria-label={`Gợi ý ${formatVnd(value)}`}
              onClick={() => {
                haptic(8);
                setAmount(String(value));
              }}
              className="rounded-full border border-border bg-card px-2 py-1.5 text-sm font-medium text-ink transition active:border-primary active:bg-primary-soft active:text-primary disabled:opacity-50"
            >
              {formatVndCompact(value)}
            </button>
          ))}
        </div>
      ) : null}

      {/* Danh mục — viên tròn cuộn ngang (không tiêu đề, icon gọn để hiện nhiều hơn) */}
      <div className="-mx-4 mt-4">
        <div role="group" aria-label="Danh mục chi tiêu" className="flex gap-3 overflow-x-auto px-4 pb-1">
          {categories.map((category) => {
            const selected = category.id === categoryId;
            return (
              <button
                key={category.id}
                type="button"
                aria-pressed={selected}
                onClick={() => {
                  haptic(8);
                  setCategoryId(category.id);
                }}
                className="flex w-[66px] shrink-0 flex-col items-center gap-1.5"
              >
                <span
                  aria-hidden
                  className={`flex h-[58px] w-[58px] items-center justify-center rounded-full border-2 text-3xl transition ${
                    selected ? "border-primary bg-primary-soft" : "border-border bg-card"
                  }`}
                >
                  {category.icon}
                </span>
                <span
                  className={`w-full truncate text-center text-xs ${
                    selected ? "font-semibold text-primary" : "text-ink-muted"
                  }`}
                >
                  {category.name}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Keypad ngay dưới danh mục (trên khu vực ngày + ghi chú) —
          mobile không phải cuộn để thấy cả bàn phím, size md (56px). */}
      <div className="mt-4">
        <Keypad
          onKey={pressKey}
          disabled={submitting}
          size="md"
          onClearAll={() => {
            haptic(8);
            setAmount("");
          }}
        />
      </div>

      <Card className="mt-4">
        <Input label="Ngày" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        <div className="mt-4">
          <Input
            label="Ghi chú (không bắt buộc)"
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="VD: cơm trưa cả nhà"
            maxLength={200}
          />
        </div>
      </Card>

      {formError ? (
        <p role="alert" className="mt-4 text-sm font-medium text-danger">
          {formError}
        </p>
      ) : null}

      <Button
        size="lg"
        className={`mt-4 w-full ${ready ? "shadow-lg shadow-primary/25" : ""}`}
        disabled={!ready || submitting}
        loading={submitting}
        onClick={handleSubmit}
      >
        Lưu khoản chi
      </Button>
    </div>
  );
}
