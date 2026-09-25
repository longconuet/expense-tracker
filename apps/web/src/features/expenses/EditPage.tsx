import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { Category, Expense } from "@expense-tracker/shared";
import { ApiError } from "../../core/api";
import { useAuthStore } from "../../core/authStore";
import { fetchCategories, fetchExpense, updateExpense } from "../../core/dataApi";
import { Button } from "../../shared/ui/Button";
import { Card } from "../../shared/ui/Card";
import { Input } from "../../shared/ui/Input";
import { Spinner } from "../../shared/ui/Spinner";
import { haptic } from "./haptic";
import { Keypad, type KeypadKey } from "./Keypad";

const MAX_AMOUNT_DIGITS = 9; // 999.999.999 ₫

/**
 * Màn sửa khoản chi (WBS 10): cùng bố cục màn nhập chi — số tiền hiển thị
 * lớn gõ bằng keypad, danh mục cuộn ngang, ngày + ghi chú — pre-fill từ
 * `GET /expenses/:id`, lưu bằng `PUT /expenses/:id`. Chỉ người tạo hoặc
 * owner sửa được (API enforce quyền).
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
    if (submitting || !ready) return;
    setFormError(null);

    const selectedCategory = categories?.find((c) => c.id === categoryId);
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
      await updateExpense(id, {
        amount: parsedAmount,
        categoryId: selectedCategory.id,
        date,
        note: note.trim() || null,
      });
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
      <h1 className="text-xl font-bold text-ink">Sửa khoản chi</h1>

      {/* Số tiền — hiển thị lớn, gõ bằng keypad bên dưới */}
      <div className="mt-3 rounded-2xl border border-border bg-card px-4 py-5 text-center">
        <span aria-live="polite" className="text-5xl font-bold tracking-tight text-ink tabular-nums">
          {amount ? Number(amount).toLocaleString("vi-VN") : "0"}
        </span>
        <span className="ml-1.5 text-2xl font-semibold text-ink-muted">₫</span>
      </div>

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

      <div className="mt-4">
        <Keypad onKey={pressKey} disabled={submitting} />
      </div>

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
