import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { formatVnd, formatVndCompact, type Category, type Expense } from "@expense-tracker/shared";
import { ApiError } from "../../core/api";
import { useAuthStore } from "../../core/authStore";
import { fetchCategories, fetchExpense, updateExpense } from "../../core/dataApi";
import { Button } from "../../shared/ui/Button";
import { Card } from "../../shared/ui/Card";
import { CategoryChips } from "../../shared/ui/CategoryChips";
import { Input } from "../../shared/ui/Input";
import { Keypad, type KeypadKey } from "../../shared/ui/Keypad";
import { Spinner } from "../../shared/ui/Spinner";
import { haptic } from "./haptic";
import { NoteSuggestions } from "./NoteSuggestions";
import { suggestAmounts } from "./amountSuggestions";

const MAX_AMOUNT_DIGITS = 9; // 999.999.999 ₫

/** Số gợi ý → class cột grid (class đầy đủ để Tailwind quét được). */
const SUGGEST_COLS: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
};

/**
 * Màn sửa khoản chi (WBS 10) — CÙNG bố cục mới nhất với màn Tạo khoản chi
 * (AddPage): KHÔNG có heading, số tiền lớn + chip gợi ý số tròn (khung cố
 * định 34px), danh mục cuộn ngang viên tròn (không tiêu đề), keypad md +
 * phím "C" đặt TRÊN khu vực ngày + ghi chú. Khác biệt riêng: pre-fill từ
 * `GET /expenses/:id`, lưu bằng `PUT /expenses/:id`, nút "Lưu thay đổi".
 * Chỉ người tạo hoặc owner sửa được (API enforce quyền).
 */
export default function EditPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const activeFamilyId = useAuthStore((s) => s.activeFamilyId);

  const [categories, setCategories] = useState<Category[] | null>(null);
  const [expense, setExpense] = useState<Expense | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!activeFamilyId) return;
    let cancelled = false;
    Promise.all([fetchExpense(id), fetchCategories(activeFamilyId)])
      .then(([exp, cats]) => {
        if (cancelled) return;
        setExpense(exp);
        setCategories(cats);
        setAmount(String(exp.amount));
        setDate(exp.date);
        setCategoryId(exp.category.id);
        setNote(exp.note ?? "");
      })
      .catch((err) => {
        if (!cancelled) {
          setLoadError(err instanceof ApiError ? err.message : "Không tải được khoản chi.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [id, activeFamilyId]);

  const parsedAmount = parseInt(amount || "0", 10);
  const ready = parsedAmount > 0 && categoryId !== null;
  const suggestions = suggestAmounts(amount);
  const selectedCategory = categories?.find((c) => c.id === categoryId) ?? null;

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

  async function handleSubmit() {
    if (submitting || !ready || !activeFamilyId || !expense) return;
    setFormError(null);

    if (!selectedCategory) {
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
      await updateExpense(
        id,
        activeFamilyId,
        {
          amount: parsedAmount,
          categoryId: selectedCategory.id,
          date,
          note: note.trim() || null,
        },
        expense.date,
      );
      navigate("/history");
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Có lỗi xảy ra, vui lòng thử lại.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!activeFamilyId) {
    return <p className="text-ink-muted">Chưa có gia đình để sửa khoản chi.</p>;
  }

  if (loadError) {
    return (
      <div className="py-16 text-center">
        <p role="alert" className="text-sm font-medium text-danger">
          {loadError}
        </p>
        <Link
          to="/history"
          className="mt-3 inline-block text-sm font-medium text-primary hover:underline"
        >
          Quay lại lịch sử
        </Link>
      </div>
    );
  }

  if (!categories || !expense) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }

  return (
    <div role="form" aria-label="Sửa khoản chi" className="flex flex-col">
      {/* Số tiền — hiển thị lớn, gõ bằng keypad (cùng màn Tạo khoản chi) */}
      <div className="rounded-2xl border border-border bg-card px-4 py-5 text-center">
        <span aria-live="polite" className="text-5xl font-bold tracking-tight text-ink tabular-nums">
          {amount ? Number(amount).toLocaleString("vi-VN") : "0"}
        </span>
        <span className="ml-1.5 text-2xl font-semibold text-ink-muted">₫</span>
      </div>

      {/* Gợi ý số tròn khi đang gõ dở — chạm chip điền luôn giá trị.
          Khối DUY TRÌ CHIỀU CAO CỐ ĐỊNH 34px (= chiều cao chip) dù không
          có gợi ý — tránh giao diện nhảy lên/xuống khi ẩn/hiện. */}
      <div className="mt-2 h-[34px]" data-testid="suggestions-frame">
        {suggestions.length > 0 ? (
          <div
            role="group"
            aria-label="Gợi ý số tiền"
            className={`grid gap-2 ${SUGGEST_COLS[suggestions.length]}`}
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
      </div>

      {/* Danh mục — viên tròn cuộn ngang (1 nguồn markup: shared/ui/CategoryChips) */}
      <CategoryChips
        categories={categories}
        selectedId={categoryId}
        onSelect={(id) => {
          haptic(8);
          setCategoryId(id);
        }}
      />

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
        <Input
          aria-label="Ngày"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
        />
        <div className="mt-4">
          <Input
            aria-label="Ghi chú (không bắt buộc)"
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="VD: cơm trưa cả nhà"
            maxLength={200}
          />
          {/* Gợi ý ghi chú nhanh của danh mục đang chọn — chạm chip thay nội dung Ghi chú */}
          <NoteSuggestions
            suggestions={selectedCategory?.noteSuggestions ?? []}
            onSelect={setNote}
            disabled={submitting}
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
        Lưu thay đổi
      </Button>
    </div>
  );
}
