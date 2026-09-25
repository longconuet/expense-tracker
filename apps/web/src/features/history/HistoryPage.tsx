import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { ApiMeta, Category, Expense } from "@expense-tracker/shared";
import { formatVnd } from "@expense-tracker/shared";
import { ApiError } from "../../core/api";
import { useAuthStore } from "../../core/authStore";
import { deleteExpense, fetchCategories, fetchExpenses } from "../../core/dataApi";
import { addMonths, currentMonth, monthLabel } from "../../core/dates";
import { groupByDay } from "../../core/expenseGroups";
import { useRefetchOnSync } from "../../core/useRefetchOnSync";
import { Button } from "../../shared/ui/Button";
import { Card } from "../../shared/ui/Card";
import { ConfirmDialog } from "../../shared/ui/ConfirmDialog";
import { ChevronLeftIcon, ChevronRightIcon, TrashIcon } from "../../shared/ui/icons";
import { HistorySkeleton } from "./HistorySkeleton";

const PAGE_SIZE = 20;

/**
 * Lịch sử chi tiêu: lọc theo tháng (tiến/lùi) + danh mục, phân trang
 * "tải thêm", xoá khoản (chủ gia đình hoặc người tạo).
 */
export default function HistoryPage() {
  const activeFamilyId = useAuthStore((s) => s.activeFamilyId);
  const user = useAuthStore((s) => s.user);
  const families = useAuthStore((s) => s.families);
  const activeFamily = families.find((f) => f.id === activeFamilyId);
  const isOwner = activeFamily?.myRole === "OWNER";

  const [month, setMonth] = useState(currentMonth());
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [meta, setMeta] = useState<ApiMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Expense | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const lastQuery = useRef("");
  const lastOk = useRef(false);
  // Giá trị `meta` mới nhất cho effect đọc (tránh thêm vào deps — page đổi
  // khi load-more không được trigger refetch).
  const metaRef = useRef<ApiMeta | null>(null);
  metaRef.current = meta;

  // Khoản offline vừa sync về server → refetch
  useRefetchOnSync(() => setReloadKey((k) => k + 1));

  const atCurrentMonth = month === currentMonth();

  useEffect(() => {
    if (!activeFamilyId) return;
    let cancelled = false;
    fetchCategories(activeFamilyId)
      .then((cats) => {
        if (!cancelled) setCategories(cats);
      })
      .catch(() => {
        // Không tải được danh mục thì vẫn xem lịch sử (không có chip lọc)
      });
    return () => {
      cancelled = true;
    };
  }, [activeFamilyId]);

  useEffect(() => {
    if (!activeFamilyId) return;
    let cancelled = false;
    // Refetch lặng lẽ (query không đổi + lần fetch trước OK + đang ở page 1)
    // → GIỮ list cũ, không hiện skeleton. Đổi tháng/chip = query mới.
    // Đã "Tải thêm" (page > 1) thì refetch sẽ co list về 20 dòng đầu →
    // thay đổi lớn, xứng đáng có skeleton làm tín hiệu.
    const query = `${activeFamilyId}|${month}|${categoryId ?? ""}`;
    const isSilent =
      lastQuery.current === query && lastOk.current && (metaRef.current?.page ?? 1) === 1;
    lastQuery.current = query;
    if (!isSilent) {
      lastOk.current = false;
      setLoading(true);
    }
    setError(null);

    fetchExpenses(activeFamilyId, {
      month,
      categoryId: categoryId ?? undefined,
      page: 1,
      pageSize: PAGE_SIZE,
    })
      .then((result) => {
        if (!cancelled) {
          lastOk.current = true;
          setExpenses(result.expenses);
          setMeta(result.meta);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : "Không tải được lịch sử.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeFamilyId, month, categoryId, reloadKey]);

  function changeMonth(delta: number) {
    const next = addMonths(month, delta);
    if (next <= currentMonth()) {
      setMonth(next);
    }
  }

  async function loadMore() {
    if (!activeFamilyId || !meta) return;
    const nextPage = meta.page + 1;
    setLoadingMore(true);
    setError(null);
    try {
      const result = await fetchExpenses(activeFamilyId, {
        month,
        categoryId: categoryId ?? undefined,
        page: nextPage,
        pageSize: PAGE_SIZE,
      });
      setExpenses((prev) => [...prev, ...result.expenses]);
      setMeta(result.meta);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Tải thêm thất bại, vui lòng thử lại.");
    } finally {
      setLoadingMore(false);
    }
  }

  /** Quyền sửa/xoá (API enforce): owner family hoặc người tạo khoản. */
  function canModify(expense: Expense): boolean {
    return isOwner || expense.createdByName === user?.name;
  }

  function renderRowContent(expense: Expense) {
    return (
      <>
        <span className="text-2xl" aria-hidden>
          {expense.category.icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-ink">{expense.note || expense.category.name}</p>
          <p className="text-xs text-ink-muted">
            {expense.category.name} · {expense.createdByName}
          </p>
        </div>
        <span className="font-semibold text-ink">{formatVnd(expense.amount)}</span>
      </>
    );
  }

  async function handleDelete(expense: Expense) {
    setDeletingId(expense.id);
    setError(null);
    try {
      await deleteExpense(expense.id);
      setExpenses((prev) => prev.filter((e) => e.id !== expense.id));
      setMeta((m) => (m ? { ...m, total: Math.max(0, m.total - 1) } : m));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Xoá không thành công, vui lòng thử lại.");
    } finally {
      // Guard theo id — tránh xoá state thuộc về lần mở dialog khác
      // (VD mở dialog xoá B khi request xoá A vẫn đang chạy)
      setDeletingId((d) => (d === expense.id ? null : d));
      setDeleteTarget((t) => (t?.id === expense.id ? null : t));
    }
  }

  return (
    <div>
      <h1 className="text-xl font-bold text-ink">Lịch sử chi tiêu</h1>

      {/* Chọn tháng */}
      <div className="mt-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() => changeMonth(-1)}
          aria-label="Tháng trước"
          className="rounded-lg p-2 text-ink-muted transition hover:bg-ink/5"
        >
          <ChevronLeftIcon className="h-5 w-5" />
        </button>
        <span className="font-semibold text-ink">{monthLabel(month)}</span>
        <button
          type="button"
          onClick={() => changeMonth(1)}
          disabled={atCurrentMonth}
          aria-label="Tháng sau"
          className="rounded-lg p-2 text-ink-muted transition hover:bg-ink/5 disabled:opacity-30"
        >
          <ChevronRightIcon className="h-5 w-5" />
        </button>
      </div>

      {/* Lọc danh mục */}
      {categories.length > 0 && (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setCategoryId(null)}
            aria-pressed={categoryId === null}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium transition ${
              categoryId === null
                ? "border-primary bg-primary-soft text-primary"
                : "border-border bg-card text-ink-muted"
            }`}
          >
            Tất cả
          </button>
          {categories.map((category) => {
            const selected = category.id === categoryId;
            return (
              <button
                key={category.id}
                type="button"
                onClick={() => setCategoryId(selected ? null : category.id)}
                aria-pressed={selected}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                  selected
                    ? "border-primary bg-primary-soft text-primary"
                    : "border-border bg-card text-ink-muted"
                }`}
              >
                <span aria-hidden>{category.icon}</span> {category.name}
              </button>
            );
          })}
        </div>
      )}

      {error && (
        <p role="alert" className="mt-3 text-sm font-medium text-danger">
          {error}
        </p>
      )}

      {loading ? (
        <HistorySkeleton />
      ) : expenses.length === 0 ? (
        <Card className="mt-4 text-center">
          <p className="text-4xl" aria-hidden>
            🧾
          </p>
          <p className="mt-2 font-medium text-ink">
            {categoryId ? "Không có khoản chi trong danh mục này" : "Chưa có khoản chi tháng này"}
          </p>
        </Card>
      ) : (
        <>
          <div className="mt-4 space-y-4">
            {groupByDay(expenses).map((group) => (
              <section key={group.date} aria-label={group.label}>
                <div className="flex items-center justify-between">
                  <h2 className="text-xs font-semibold tracking-wide text-ink-muted uppercase">
                    {group.label}
                  </h2>
                  <span className="text-xs font-semibold text-ink-muted">
                    {formatVnd(group.total)}
                  </span>
                </div>
                <ul className="mt-2 space-y-2">
                  {group.expenses.map((expense) => {
                    const modifiable = canModify(expense);
                    return (
                      <li key={expense.id}>
                        <Card className="flex items-center gap-3 p-4">
                          {modifiable ? (
                            <Link
                              to={`/expenses/${expense.id}/edit`}
                              className="flex min-w-0 flex-1 items-center gap-3"
                            >
                              {renderRowContent(expense)}
                            </Link>
                          ) : (
                            <div className="flex min-w-0 flex-1 items-center gap-3">
                              {renderRowContent(expense)}
                            </div>
                          )}
                          {modifiable && (
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(expense)}
                              disabled={deletingId === expense.id}
                              aria-label={`Xoá khoản ${expense.note || expense.category.name}`}
                              className="rounded-lg p-1.5 text-ink-muted transition hover:bg-danger/10 hover:text-danger disabled:opacity-40"
                            >
                              <TrashIcon className="h-4 w-4" />
                            </button>
                          )}
                        </Card>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>

          {meta && expenses.length < meta.total && (
            <div className="mt-4">
              <Button
                variant="secondary"
                className="w-full"
                loading={loadingMore}
                onClick={loadMore}
              >
                Tải thêm ({expenses.length}/{meta.total})
              </Button>
            </div>
          )}
        </>
      )}

      {deleteTarget && (
        <ConfirmDialog
          open
          title="Xoá khoản chi"
          message={`Xoá khoản "${deleteTarget.note || deleteTarget.category.name}" (${formatVnd(deleteTarget.amount)})?`}
          confirmLabel="Xoá"
          danger
          loading={deletingId === deleteTarget.id}
          onConfirm={() => handleDelete(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
