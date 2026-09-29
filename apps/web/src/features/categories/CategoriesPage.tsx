import { useEffect, useState } from "react";
import type { Category } from "@expense-tracker/shared";
import { ApiError } from "../../core/api";
import { useAuthStore } from "../../core/authStore";
import {
  createCategory,
  deleteCategory,
  fetchCategories,
  updateCategory,
} from "../../core/dataApi";
import { Button } from "../../shared/ui/Button";
import { Card } from "../../shared/ui/Card";
import { ConfirmDialog } from "../../shared/ui/ConfirmDialog";
import { Input } from "../../shared/ui/Input";
import { Modal } from "../../shared/ui/Modal";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
  XIcon,
} from "../../shared/ui/icons";
import { CategoriesSkeleton } from "./CategoriesSkeleton";

/**
 * Màn quản lý danh mục chi tiêu — thêm / sửa / xoá / đổi thứ tự.
 * Mọi member đều được quyền (API enforce). Mọi danh mục bình đẳng
 * (preset khởi tạo khi tạo family cũng sửa/xoá được như danh mục thường).
 * Mutation offline → hiện lỗi, không có hàng đợi (nhất quán với sửa khoản offline).
 * Mỗi danh mục có thể set "gợi ý ghi chú nhanh" (≤8, 1–30 ký tự) — dùng để
 * điền nhanh ô Ghi chú khi tạo/sửa khoản chi.
 */

/** Emoji gợi ý — 24 ô, bao gồm icon của 7 preset để dễ chọn lại. */
const EMOJI_SUGGESTIONS = [
  "🍜", "🍚", "🍔", "🥤", "💧",
  "🛒", "🧺", "⛽", "🚌", "🚗",
  "⚡", "💊", "🏥", "🏠", "👶",
  "🎬", "🎮", "📚", "✂️", "👕",
  "🎁", "🐾", "💳", "📦",
] as const;

type FormState = { mode: "create" } | { mode: "edit"; category: Category };

/** Giới hạn gợi ý ghi chú nhanh (khớp validate API). */
const MAX_NOTE_SUGGESTIONS = 8;
const NOTE_SUGGESTION_MAX_LEN = 30;

export default function CategoriesPage() {
  const activeFamilyId = useAuthStore((s) => s.activeFamilyId);

  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [form, setForm] = useState<FormState | null>(null);
  const [formName, setFormName] = useState("");
  const [formIcon, setFormIcon] = useState("");
  const [formNotes, setFormNotes] = useState<string[]>([]);
  const [noteInput, setNoteInput] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [reordering, setReordering] = useState(false);

  useEffect(() => {
    if (!activeFamilyId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchCategories(activeFamilyId)
      .then((cats) => {
        if (!cancelled) setCategories(cats);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : "Không tải được danh mục.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeFamilyId, reloadKey]);

  /**
   * Refetch ngầm sau mutation OK — đồng bộ read cache. Chỉ apply khi user
   * vẫn ở đúng family (đổi family giữa chừng → bỏ qua, tránh ghi đè list
   * family khác). Mạng yếu → read cache trả bản cũ là chấp nhận (stale-
   * while-error, tự lành ở lần GET thành công kế tiếp).
   */
  function refetchSilent() {
    const fid = activeFamilyId;
    if (!fid) return;
    fetchCategories(fid)
      .then((cats) => {
        if (useAuthStore.getState().activeFamilyId === fid) setCategories(cats);
      })
      .catch(() => {});
  }

  function openCreate() {
    setForm({ mode: "create" });
    setFormName("");
    setFormIcon("");
    setFormNotes([]);
    setNoteInput("");
    setNameError(null);
    setFormError(null);
  }

  function openEdit(category: Category) {
    setForm({ mode: "edit", category });
    setFormName(category.name);
    setFormIcon(category.icon);
    setFormNotes(category.noteSuggestions ?? []);
    setNoteInput("");
    setNameError(null);
    setFormError(null);
  }

  function closeForm() {
    if (saving) return;
    setForm(null);
  }

  /** Emoji nhập tay — chỉ hiện khi icon hiện tại không thuộc bộ gợi ý. */
  const customEmojiValue = EMOJI_SUGGESTIONS.includes(formIcon as (typeof EMOJI_SUGGESTIONS)[number])
    ? ""
    : formIcon;

  /**
   * Thêm 1 gợi ý ghi chú: trim; bỏ qua khi rỗng, đã trùng (case-insensitive)
   * hoặc đã đủ 8. Không hiện lỗi — nhập trùng là việc bình thường khi gõ tay.
   */
  function addNoteSuggestion() {
    const text = noteInput.trim();
    if (!text) return;
    if (formNotes.length >= MAX_NOTE_SUGGESTIONS) return;
    if (formNotes.some((n) => n.toLowerCase() === text.toLowerCase())) return;
    setFormNotes((prev) => [...prev, text]);
    setNoteInput("");
  }

  function removeNoteSuggestion(text: string) {
    setFormNotes((prev) => prev.filter((n) => n !== text));
  }

  async function handleSave() {
    if (!activeFamilyId || !form) return;
    const name = formName.trim();
    const icon = formIcon.trim();
    if (name.length < 2 || name.length > 30) {
      setNameError("Tên phải từ 2 đến 30 ký tự");
      return;
    }
    if (icon.length < 1 || icon.length > 8) {
      setFormError("Hãy chọn hoặc nhập biểu tượng (1–8 ký tự)");
      return;
    }

    setSaving(true);
    setNameError(null);
    setFormError(null);
    // List rỗng → null (xoá/không có gợi ý) — API bình thường hoá về 1 đầu
    const noteSuggestions = formNotes.length > 0 ? formNotes : null;
    try {
      if (form.mode === "edit") {
        const updated = await updateCategory(activeFamilyId, form.category.id, {
          name,
          icon,
          noteSuggestions,
        });
        setCategories((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      } else {
        const created = await createCategory(activeFamilyId, { name, icon, noteSuggestions });
        setCategories((prev) => [...prev, created]);
      }
      setForm(null);
      refetchSilent();
    } catch (err) {
      if (err instanceof ApiError && err.code === "CATEGORY_EXISTS") {
        setNameError(err.message);
      } else {
        setFormError(err instanceof ApiError ? err.message : "Không lưu được danh mục, vui lòng thử lại.");
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!activeFamilyId || !deleteTarget) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteCategory(activeFamilyId, deleteTarget.id);
      setCategories((prev) => prev.filter((c) => c.id !== deleteTarget.id));
      setDeleteTarget(null);
      refetchSilent();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Xoá không thành công, vui lòng thử lại.");
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  }

  /** Swap `order` của 2 hàng liền kề (2 PUT) — giữ invariant order duy nhất. */
  async function moveCategory(index: number, dir: -1 | 1) {
    if (!activeFamilyId) return;
    const target = categories[index];
    const other = categories[index + dir];
    if (!target || !other) return;
    setReordering(true);
    setError(null);
    try {
      await Promise.all([
        updateCategory(activeFamilyId, target.id, { order: other.order }),
        updateCategory(activeFamilyId, other.id, { order: target.order }),
      ]);
      setCategories((prev) => {
        const next = [...prev];
        [next[index], next[index + dir]] = [next[index + dir], next[index]];
        return next;
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Không đổi được thứ tự, vui lòng thử lại.");
    } finally {
      setReordering(false);
    }
  }

  const busy = saving || reordering || deleting;

  return (
    <div>
      <h1 className="text-xl font-bold text-ink">Danh mục chi tiêu</h1>

      <div className="mt-4">
        <Button className="w-full" onClick={openCreate} disabled={loading || busy}>
          <PlusIcon className="h-5 w-5" />
          Thêm danh mục
        </Button>
      </div>

      {loading ? (
        <CategoriesSkeleton />
      ) : error && categories.length === 0 ? (
        <Card className="mt-4 text-center">
          <p className="text-4xl" aria-hidden>
            🏷️
          </p>
          <p role="alert" className="mt-2 font-medium text-ink">
            {error}
          </p>
          <Button
            variant="secondary"
            size="sm"
            className="mt-3"
            onClick={() => setReloadKey((k) => k + 1)}
          >
            Thử lại
          </Button>
        </Card>
      ) : (
        <>
          {error && (
            <p role="alert" className="mt-3 text-sm font-medium text-danger">
              {error}
            </p>
          )}
          {categories.length === 0 ? (
            <Card className="mt-4 text-center">
              <p className="text-4xl" aria-hidden>
                🏷️
              </p>
              <p className="mt-2 font-medium text-ink">Chưa có danh mục nào</p>
            </Card>
          ) : (
            <ul className="mt-4 space-y-2">
              {categories.map((category, index) => (
                <li key={category.id}>
                  <Card className="flex items-center gap-3 p-4">
                    <span
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary-soft text-2xl"
                      aria-hidden
                    >
                      {category.icon}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-ink">{category.name}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => moveCategory(index, -1)}
                        disabled={index === 0 || busy}
                        aria-label={`Đưa ${category.name} lên trên`}
                        className="rounded-lg p-1.5 text-ink-muted transition hover:bg-ink/5 disabled:opacity-30"
                      >
                        <ArrowUpIcon className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveCategory(index, 1)}
                        disabled={index === categories.length - 1 || busy}
                        aria-label={`Đưa ${category.name} xuống dưới`}
                        className="rounded-lg p-1.5 text-ink-muted transition hover:bg-ink/5 disabled:opacity-30"
                      >
                        <ArrowDownIcon className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => openEdit(category)}
                        disabled={busy}
                        aria-label={`Sửa danh mục ${category.name}`}
                        className="rounded-lg p-1.5 text-ink-muted transition hover:bg-ink/5 disabled:opacity-30"
                      >
                        <PencilIcon className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(category)}
                        disabled={busy}
                        aria-label={`Xoá danh mục ${category.name}`}
                        className="rounded-lg p-1.5 text-ink-muted transition hover:bg-danger/10 hover:text-danger disabled:opacity-30"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <Modal
        open={form !== null}
        onClose={closeForm}
        title={form?.mode === "edit" ? "Sửa danh mục" : "Thêm danh mục"}
        disableDismiss={saving}
      >
        <div className="mt-3 space-y-4">
          <Input
            label="Tên danh mục"
            value={formName}
            onChange={(e) => {
              setFormName(e.target.value);
              if (nameError) setNameError(null);
            }}
            placeholder="VD: Tiền điện"
            hint="2–30 ký tự"
            error={nameError}
            maxLength={30}
          />

          <div>
            <span id="category-emoji-label" className="mb-1.5 block text-sm font-medium text-ink">
              Biểu tượng
            </span>
            <div role="group" aria-labelledby="category-emoji-label" className="grid grid-cols-6 gap-1.5">
              {EMOJI_SUGGESTIONS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => setFormIcon(emoji)}
                  aria-label={`Chọn biểu tượng ${emoji}`}
                  aria-pressed={formIcon === emoji}
                  className={`flex h-11 items-center justify-center rounded-xl text-2xl transition ${
                    formIcon === emoji ? "bg-primary-soft ring-2 ring-primary" : "bg-surface"
                  }`}
                >
                  <span aria-hidden>{emoji}</span>
                </button>
              ))}
            </div>
            <div className="mt-2">
              <Input
                label="Hoặc nhập emoji khác"
                value={customEmojiValue}
                onChange={(e) => setFormIcon(e.target.value)}
                placeholder="VD: 🧊"
                maxLength={8}
              />
            </div>
          </div>

          {/* Gợi ý ghi chú nhanh — chips + input thêm; dùng ở màn Tạo/Sửa khoản chi */}
          <div>
            <span id="category-notes-label" className="mb-1.5 block text-sm font-medium text-ink">
              Gợi ý ghi chú nhanh
              <span className="ml-1 font-normal text-ink-muted">(không bắt buộc)</span>
            </span>
            <p className="mb-2 text-xs text-ink-muted">
              Tối đa {MAX_NOTE_SUGGESTIONS} gợi ý, mỗi gợi ý tối đa {NOTE_SUGGESTION_MAX_LEN} ký tự —
              chạm gợi ý khi nhập khoản chi để điền nhanh.
            </p>
            {formNotes.length > 0 ? (
              <div role="group" aria-label="Gợi ý ghi chú hiện có" className="flex flex-wrap gap-1.5">
                {formNotes.map((text, index) => (
                  <span
                    key={`${index}-${text}`}
                    className="inline-flex items-center gap-1 rounded-full border border-border bg-surface py-1 pl-2.5 pr-1 text-sm text-ink"
                  >
                    {text}
                    <button
                      type="button"
                      onClick={() => removeNoteSuggestion(text)}
                      disabled={busy}
                      aria-label={`Xoá gợi ý "${text}"`}
                      className="rounded-full p-0.5 text-ink-muted transition hover:bg-ink/10 hover:text-danger disabled:opacity-30"
                    >
                      <XIcon className="h-3.5 w-3.5" />
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
            <div className="mt-2 flex gap-2">
              <div className="flex-1">
                <Input
                  aria-labelledby="category-notes-label"
                  value={noteInput}
                  onChange={(e) => setNoteInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addNoteSuggestion();
                    }
                  }}
                  placeholder="VD: Đổ xăng"
                  maxLength={NOTE_SUGGESTION_MAX_LEN}
                  disabled={busy}
                />
              </div>
              <Button
                type="button"
                variant="secondary"
                className="shrink-0"
                onClick={addNoteSuggestion}
                disabled={busy || !noteInput.trim() || formNotes.length >= MAX_NOTE_SUGGESTIONS}
                aria-label="Thêm gợi ý ghi chú"
              >
                <PlusIcon className="h-4 w-4" />
                Thêm
              </Button>
            </div>
          </div>

          {formError && (
            <p role="alert" className="text-sm font-medium text-danger">
              {formError}
            </p>
          )}

          <Button className="w-full" loading={saving} onClick={handleSave}>
            {form?.mode === "edit" ? "Lưu thay đổi" : "Thêm danh mục"}
          </Button>
        </div>
      </Modal>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Xoá danh mục"
        message={
          deleteTarget
            ? `Xoá danh mục "${deleteTarget.name}"? Chỉ xoá được khi chưa có khoản chi nào thuộc danh mục này.`
            : ""
        }
        confirmLabel="Xoá"
        danger
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
