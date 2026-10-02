import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  firstOccurrenceFrom,
  formatVnd,
  type Category,
  type CreateRecurringRuleInput,
  type RecurringEndType,
  type RecurringRule,
} from "@expense-tracker/shared";
import { ApiError } from "../../core/api";
import { useAuthStore } from "../../core/authStore";
import {
  createRecurringRule,
  deleteRecurringRule,
  fetchCategories,
  fetchRecurring,
  updateRecurringRule,
} from "../../core/dataApi";
import { shortDate, today } from "../../core/dates";
import { haptic } from "../../core/haptic";
import { Button } from "../../shared/ui/Button";
import { Card } from "../../shared/ui/Card";
import { CategoryChips } from "../../shared/ui/CategoryChips";
import { ConfirmDialog } from "../../shared/ui/ConfirmDialog";
import { Input } from "../../shared/ui/Input";
import { Keypad, type KeypadKey } from "../../shared/ui/Keypad";
import { Spinner } from "../../shared/ui/Spinner";
import { CheckIcon } from "../../shared/ui/icons";

/**
 * Form giao dịch định kỳ — tạo (/recurring/new) + sửa (/recurring/:id).
 * Spec: docs/spec-recurring.md §4.3 (RecurringRulePage).
 *
 * Chỉ OWNER dùng form; MEMBER → màn thông báo (không render form).
 * Chế độ sửa: rule lấy từ `fetchRecurring` (list); không thấy → màn lỗi.
 *
 * Card "Tùy Chỉnh" đúng bố cục thiết kế của user: tần suất cố định
 * "Lặp hàng tháng" (MVP — hàng tĩnh không clickable), "Từ" (date input,
 * được phép chọn quá khứ — API tự đẩy nextDate sang kỳ ≥ hôm nay), nhóm
 * "Kết thúc" 3 lựa chọn radio (Mãi mãi / Cho đến ngày / Số lần) tự vẽ với
 * ✓ bên phải + dòng phụ lùi vào khi chọn.
 *
 * Validate phía FE (ghép API, live khi nhập — cùng nguồn hàm shared với
 * API): số tiền > 0; UNTIL_DATE → endDate ≥ kỳ đầu tiên; COUNT → 1–10.000.
 */

const MAX_AMOUNT_DIGITS = 9; // 999.999.999 ₫
const MAX_OCCURRENCE_COUNT = 10_000;

export default function RecurringRulePage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isNew = id === undefined;
  const activeFamilyId = useAuthStore((s) => s.activeFamilyId);
  const myRole = useAuthStore((s) => {
    const family = s.families.find((f) => f.id === s.activeFamilyId) ?? s.families[0];
    return family?.myRole ?? null;
  });

  const [categories, setCategories] = useState<Category[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Rule đang sửa (chế độ edit) — null = chưa tải xong; ruleMissing = hết rule
  const [rule, setRule] = useState<RecurringRule | null>(null);
  const [ruleMissing, setRuleMissing] = useState(false);

  // Form — số tiền state chuỗi số như AddPage (gõ bằng keypad, không bàn phím hệ thống)
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [startDate, setStartDate] = useState(today());
  const [endType, setEndType] = useState<RecurringEndType>("FOREVER");
  const [endDate, setEndDate] = useState("");
  const [count, setCount] = useState("1");

  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Danh mục (cả 2 chế độ)
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

  // Rule đang sửa — prefill form từ rule
  useEffect(() => {
    if (isNew || !activeFamilyId) return;
    let cancelled = false;
    fetchRecurring(activeFamilyId)
      .then((data) => {
        if (cancelled) return;
        const found = data.rules.find((r) => r.id === id) ?? null;
        if (!found) {
          setRuleMissing(true);
          return;
        }
        setRule(found);
        setAmount(String(found.amount));
        setCategoryId(found.categoryId);
        setNote(found.note ?? "");
        setStartDate(found.startDate);
        setEndType(found.endType);
        setEndDate(found.endDate ?? "");
        setCount(found.occurrenceCount !== null ? String(found.occurrenceCount) : "1");
      })
      .catch((err) => {
        if (!cancelled) {
          setLoadError(err instanceof ApiError ? err.message : "Không tải được rule.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isNew, activeFamilyId, id]);

  // ---------------------------------------------------------------------------
  // Validate live (cùng nguồn với API — shared firstOccurrenceFrom)
  // ---------------------------------------------------------------------------

  const parsedAmount = parseInt(amount || "0", 10);
  const baseReady = parsedAmount > 0 && categoryId !== null && startDate !== "";

  let endError: string | null = null;
  if (endType === "UNTIL_DATE") {
    const first = startDate ? firstOccurrenceFrom(startDate, today()) : null;
    if (!endDate) {
      endError = "Nhập ngày kết thúc.";
    } else if (first !== null && endDate < first) {
      endError = `Ngày kết thúc phải từ ngày kỳ đầu tiên (${shortDate(first)}) trở đi.`;
    }
  }

  let countError: string | null = null;
  if (endType === "COUNT") {
    const n = parseInt(count || "", 10);
    if (!Number.isInteger(n) || n < 1 || n > MAX_OCCURRENCE_COUNT) {
      countError = "Số lần phải từ 1 đến 10.000.";
    }
  }

  const ready = baseReady && endError === null && countError === null;

  // Hiển thị số tiền lớn — nhóm hàng nghìn từ 1 nguồn shared (formatVnd)
  const amountGrouped = amount !== "" ? formatVnd(parseInt(amount, 10)).split(" ")[0] : "0";

  // Keypad + bàn phím vật lý (desktop) — pattern AddPage
  function pressKey(key: KeypadKey) {
    if (submitting) return;
    haptic(8);
    if (key === "back") {
      setAmount((a) => a.slice(0, -1));
      return;
    }
    setAmount((a) => (a.length >= MAX_AMOUNT_DIGITS ? a : a + key));
  }

  const pressKeyRef = useRef(pressKey);
  pressKeyRef.current = pressKey;
  const formVisible =
    myRole === "OWNER" &&
    loadError === null &&
    categories !== null &&
    (isNew || (rule !== null && !ruleMissing));
  useEffect(() => {
    if (!formVisible) return;
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
  }, [formVisible]);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  async function handleSubmit() {
    if (submitting || !ready || categoryId === null) return;
    setFormError(null);
    haptic(15);
    setSubmitting(true);
    try {
      const input: CreateRecurringRuleInput = {
        categoryId,
        amount: parsedAmount,
        note: note.trim() || undefined,
        startDate,
        endType,
      };
      if (endType === "UNTIL_DATE") input.endDate = endDate;
      if (endType === "COUNT") input.occurrenceCount = parseInt(count, 10);
      if (isNew) {
        await createRecurringRule(activeFamilyId!, input);
      } else {
        await updateRecurringRule(activeFamilyId!, id!, input);
      }
      navigate("/recurring");
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Có lỗi xảy ra, vui lòng thử lại.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (deleting || isNew) return;
    setDeleting(true);
    try {
      await deleteRecurringRule(activeFamilyId!, id!);
      setConfirmDelete(false);
      navigate("/recurring");
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Không xoá được rule, vui lòng thử lại.");
      setDeleting(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Render — các nhánh chặn trước form
  // ---------------------------------------------------------------------------

  if (!activeFamilyId) {
    return <p className="text-ink-muted">Chưa có gia đình để thiết lập giao dịch định kỳ.</p>;
  }

  // case 59: MEMBER (hoặc role khác OWNER) — không render form
  if (myRole !== "OWNER") {
    return (
      <div className="mt-16 flex flex-col items-center text-center">
        <p className="font-medium text-ink">Chỉ chủ gia đình có thể setup giao dịch định kỳ</p>
        <Button variant="secondary" className="mt-4" onClick={() => navigate("/recurring")}>
          Quay lại
        </Button>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="py-16 text-center">
        <p role="alert" className="text-sm font-medium text-danger">
          {loadError}
        </p>
      </div>
    );
  }

  if (!categories) {
    return (
      <div role="status" aria-label="Đang tải" className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }

  if (!isNew && rule === null) {
    if (ruleMissing) {
      return (
        <div className="mt-16 flex flex-col items-center text-center">
          <p className="font-medium text-ink">Không tìm thấy giao dịch định kỳ</p>
          <p className="mt-1 text-sm text-ink-muted">Rule này có thể đã bị xoá.</p>
          <Button variant="secondary" className="mt-4" onClick={() => navigate("/recurring")}>
            Quay lại
          </Button>
        </div>
      );
    }
    return (
      <div role="status" aria-label="Đang tải" className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }

  return (
    <div
      role="form"
      aria-label={isNew ? "Tạo giao dịch định kỳ" : "Sửa giao dịch định kỳ"}
      className="flex flex-col"
    >
      <h1 className="text-xl font-bold text-ink">
        {isNew ? "Giao dịch định kỳ mới" : "Sửa giao dịch định kỳ"}
      </h1>

      {/* Card 1 — Khoản chi */}
      <Card className="mt-4">
        <h2 className="text-sm font-semibold text-ink">Khoản chi</h2>

        {/* Số tiền — hiển thị lớn, gõ bằng keypad bên dưới */}
        <div className="mt-3 rounded-2xl border border-border bg-surface px-4 py-5 text-center">
          <span aria-live="polite" className="text-5xl font-bold tracking-tight text-ink tabular-nums">
            {amountGrouped}
          </span>
          <span className="ml-1.5 text-2xl font-semibold text-ink-muted">₫</span>
        </div>

        <CategoryChips
          categories={categories}
          selectedId={categoryId}
          onSelect={(cid) => {
            haptic(8);
            setCategoryId(cid);
          }}
        />

        <div className="mt-2">
          <Keypad
            onKey={pressKey}
            disabled={submitting}
            size="lg"
            onClearAll={() => {
              haptic(8);
              setAmount("");
            }}
          />
        </div>

        <div className="mt-2">
          <Input
            aria-label="Ghi chú (tùy chọn)"
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Ghi chú (tùy chọn)"
            maxLength={200}
          />
        </div>
      </Card>

      {/* Card 2 — Tùy Chỉnh (đúng bố cục thiết kế user) */}
      <Card className="mt-4">
        <h2 className="text-sm font-semibold text-ink">Tùy Chỉnh</h2>

        {/* Tần suất — hàng tĩnh, MVP cố định hàng tháng (không clickable) */}
        <div className="mt-3 flex items-center justify-between">
          <span className="text-sm text-ink">Tần suất</span>
          <span className="text-sm text-ink-muted">Lặp hàng tháng</span>
        </div>

        {/* Từ — được phép chọn quá khứ (API tự đẩy nextDate sang kỳ ≥ hôm nay) */}
        <div className="mt-4 flex items-center justify-between gap-3">
          <span className="shrink-0 text-sm text-ink">Từ</span>
          <div className="flex-1">
            <Input
              aria-label="Từ"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              required
            />
          </div>
        </div>

        {/* Kết thúc — 3 lựa chọn kiểu radio (tự vẽ, ✓ phải khi chọn) */}
        <div role="radiogroup" aria-label="Kết thúc" className="mt-4">
          <p className="mb-1.5 text-sm text-ink">Kết thúc</p>
          <div className="divide-y divide-border rounded-xl border border-border">
            <EndOption
              checked={endType === "FOREVER"}
              label="Mãi mãi"
              onSelect={() => setEndType("FOREVER")}
            />
            <EndOption
              checked={endType === "UNTIL_DATE"}
              label="Cho đến ngày"
              onSelect={() => setEndType("UNTIL_DATE")}
            >
              <div className="mt-2 flex items-center justify-between gap-3">
                <span className="shrink-0 text-sm text-ink-muted">Đến</span>
                <div className="flex-1">
                  <Input
                    aria-label="Đến"
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>
              </div>
              {endError ? (
                <p role="alert" className="mt-1.5 text-sm font-medium text-danger">
                  {endError}
                </p>
              ) : null}
            </EndOption>
            <EndOption
              checked={endType === "COUNT"}
              label="Xảy ra một số lượng lần nhất định…"
              onSelect={() => setEndType("COUNT")}
            >
              <div className="mt-2 flex items-center justify-between gap-3">
                <span className="shrink-0 text-sm text-ink-muted">Lần</span>
                <div className="flex-1">
                  <Input
                    aria-label="Lần"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={MAX_OCCURRENCE_COUNT}
                    value={count}
                    onChange={(e) => setCount(e.target.value)}
                  />
                </div>
              </div>
              {countError ? (
                <p role="alert" className="mt-1.5 text-sm font-medium text-danger">
                  {countError}
                </p>
              ) : null}
            </EndOption>
          </div>
        </div>
      </Card>

      {formError ? (
        <p role="alert" className="mt-4 text-sm font-medium text-danger">
          {formError}
        </p>
      ) : null}

      <Button
        size="lg"
        className="mt-4 w-full"
        disabled={!ready || submitting}
        loading={submitting}
        onClick={handleSubmit}
      >
        Lưu
      </Button>

      {!isNew ? (
        <Button variant="danger" size="lg" className="mt-2 w-full" onClick={() => setConfirmDelete(true)}>
          Xoá rule
        </Button>
      ) : null}

      <ConfirmDialog
        open={confirmDelete}
        title="Xoá rule này?"
        message="Các khoản chi đã sinh sẽ giữ lại như khoản chi thường."
        confirmLabel="Xoá"
        danger
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}

interface EndOptionProps {
  checked: boolean;
  label: string;
  onSelect: () => void;
  /** Dòng phụ lùi vào — chỉ hiện khi đang chọn (ngày kết thúc / số lần). */
  children?: ReactNode;
}

/**
 * Hàng lựa chọn nhóm "Kết thúc" — radio tự vẽ (không có component radio
 * trong shared/ui): label trái, ✓ phải khi chọn; dòng phụ lùi vào bên dưới.
 * `role="radio"`/`aria-checked` + bàn phím Enter/Space để chọn.
 */
function EndOption({ checked, label, onSelect, children }: EndOptionProps) {
  return (
    <div
      role="radio"
      aria-checked={checked}
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className="cursor-pointer px-4 py-3 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40"
    >
      <div className="flex items-center justify-between gap-3">
        <span className={`text-sm ${checked ? "font-medium text-ink" : "text-ink-muted"}`}>
          {label}
        </span>
        {checked ? <CheckIcon className="h-4 w-4 shrink-0 text-primary" /> : null}
      </div>
      {checked ? children : null}
    </div>
  );
}
