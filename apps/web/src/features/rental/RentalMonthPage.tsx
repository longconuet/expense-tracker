import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  buildRentalNote,
  computeRentalTotals,
  firstDayOfMonth,
  formatMeter,
  formatVnd,
  isValidMonth,
  lastDayOfMonth,
  type RentalListResponse,
  type RentalMonth,
  type RentalMonthFields,
} from "@expense-tracker/shared";
import { ApiError } from "../../core/api";
import { useAuthStore } from "../../core/authStore";
import { confirmRentalMonth, deleteRentalMonth, fetchRental } from "../../core/dataApi";
import { monthLabel } from "../../core/dates";
import { Button } from "../../shared/ui/Button";
import { Card } from "../../shared/ui/Card";
import { ConfirmDialog } from "../../shared/ui/ConfirmDialog";
import { Input } from "../../shared/ui/Input";
import { Modal } from "../../shared/ui/Modal";
import { Spinner } from "../../shared/ui/Spinner";

/**
 * Form 1 tháng phòng trọ — route /rental/:month.
 * - DRAFT: OWNER sửa form + "Chốt khoản chi" (tạo expense); MEMBER xem.
 * - CONFIRMED: banner đã chốt; OWNER "Chỉnh sửa & chốt lại" (cập nhật CÙNG
 *   expense); xoá tháng đã chốt xoá luôn khoản chi liên kết.
 * Số tiền/công tơ giữ dạng string (input), parse int khi tính/lưu.
 */

type FormState = Record<keyof RentalMonthFields, string>;

function formFromMonth(m: RentalMonth): FormState {
  return {
    rent: String(m.rent),
    internet: String(m.internet),
    elevator: String(m.elevator),
    parking: String(m.parking),
    oldElec: String(m.oldElec),
    newElec: String(m.newElec),
    electricityRate: String(m.electricityRate),
    oldWater: String(m.oldWater),
    newWater: String(m.newWater),
    waterRate: String(m.waterRate),
  };
}

/** String input → int ≥ 0; rỗng/không phải int → null. */
function parseAmount(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  if (!Number.isInteger(n) || n < 0) return null;
  return n;
}

function fieldsFromForm(form: FormState): RentalMonthFields | null {
  const parsed: Record<keyof RentalMonthFields, number | null> = {
    rent: parseAmount(form.rent),
    internet: parseAmount(form.internet),
    elevator: parseAmount(form.elevator),
    parking: parseAmount(form.parking),
    oldElec: parseAmount(form.oldElec),
    newElec: parseAmount(form.newElec),
    electricityRate: parseAmount(form.electricityRate),
    oldWater: parseAmount(form.oldWater),
    newWater: parseAmount(form.newWater),
    waterRate: parseAmount(form.waterRate),
  };
  const values = Object.values(parsed);
  if (values.some((v) => v === null)) return null;
  return parsed as unknown as RentalMonthFields;
}

export default function RentalMonthPage() {
  const { month: monthParam } = useParams<{ month: string }>();
  const month = monthParam ?? "";
  const monthValid = isValidMonth(month);
  const navigate = useNavigate();

  const activeFamilyId = useAuthStore((s) => s.activeFamilyId);
  const myRole = useAuthStore((s) => s.families.find((f) => f.id === s.activeFamilyId)?.myRole);
  const isOwner = myRole === "OWNER";

  const [data, setData] = useState<RentalListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const reload = useCallback(() => {
    if (!activeFamilyId || !monthValid) return;
    let cancelled = false;
    fetchRental(activeFamilyId)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Không tải được dữ liệu.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeFamilyId, monthValid]);

  useEffect(() => {
    setLoading(true);
    return reload();
  }, [reload, reloadKey]);

  const monthData = data?.months.find((m) => m.month === month) ?? null;

  // --- Form -----------------------------------------------------------------

  const [form, setForm] = useState<FormState | null>(null);
  const [editingConfirmed, setEditingConfirmed] = useState(false);
  useEffect(() => {
    if (monthData) {
      setForm(formFromMonth(monthData));
      setEditingConfirmed(false);
    }
  }, [monthData]);

  const confirmed = monthData?.status === "CONFIRMED";
  const editable = isOwner && (confirmed ? editingConfirmed : true);

  const totals = useMemo(() => {
    if (!form) return null;
    const fields = fieldsFromForm(form);
    return fields ? computeRentalTotals(fields) : null;
  }, [form]);

  const meterError = useMemo(() => {
    if (!form) return null;
    const oe = parseAmount(form.oldElec);
    const ne = parseAmount(form.newElec);
    const ow = parseAmount(form.oldWater);
    const nw = parseAmount(form.newWater);
    if (oe !== null && ne !== null && ne < oe) return "Số công tơ điện mới phải ≥ số cũ";
    if (ow !== null && nw !== null && nw < ow) return "Số công tơ nước mới phải ≥ số cũ";
    return null;
  }, [form]);

  const formIncomplete = form !== null && fieldsFromForm(form) === null;

  // --- Modal chốt ------------------------------------------------------------

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmDate, setConfirmDate] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  function openConfirm() {
    setConfirmDate(firstDayOfMonth(month));
    setConfirmError(null);
    setConfirmOpen(true);
  }

  async function handleConfirm() {
    if (!activeFamilyId || !monthData || !form) return;
    const fields = fieldsFromForm(form);
    if (!fields || !confirmDate) return;
    setConfirming(true);
    setConfirmError(null);
    try {
      await confirmRentalMonth(activeFamilyId, month, { ...fields, date: confirmDate });
      setConfirmOpen(false);
      setEditingConfirmed(false);
      setReloadKey((k) => k + 1);
    } catch (err) {
      setConfirmError(err instanceof ApiError ? err.message : "Không chốt được tháng.");
    } finally {
      setConfirming(false);
    }
  }

  // --- Xoá tháng ---------------------------------------------------------------

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleDelete() {
    if (!activeFamilyId || !monthData) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteRentalMonth(activeFamilyId, month);
      navigate("/rental");
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : "Không xoá được tháng.");
      setDeleting(false);
    }
  }

  // --- Render -----------------------------------------------------------------

  if (loading && !data) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }

  if (!monthValid) {
    return (
      <div className="py-16 text-center">
        <p role="alert" className="font-medium text-danger">
          Tháng không hợp lệ.
        </p>
        <Link to="/rental" className="mt-3 inline-block text-sm text-primary-text underline">
          ← Về danh sách tháng
        </Link>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="py-16 text-center">
        <p role="alert" className="font-medium text-danger">
          {error}
        </p>
        <Link to="/rental" className="mt-3 inline-block text-sm text-primary-text underline">
          ← Về danh sách tháng
        </Link>
      </div>
    );
  }

  if (!data || !monthData) {
    return (
      <div className="py-16 text-center">
        <p className="font-medium text-ink-muted">Không tìm thấy tháng này.</p>
        <Link to="/rental" className="mt-3 inline-block text-sm text-primary-text underline">
          ← Về danh sách tháng
        </Link>
      </div>
    );
  }

  if (!form) return null;

  const set = (key: keyof FormState) => (e: ChangeEvent<HTMLInputElement>) =>
    setForm((f) => (f ? { ...f, [key]: e.target.value } : f));

  const note = totals ? buildRentalNote(month, formAsFields(form)) : null;

  return (
    <div>
      <Link to="/rental" className="text-sm text-primary-text underline">
        ← Danh sách tháng
      </Link>
      <h1 className="mt-2 text-xl font-bold text-ink">{monthLabel(month)}</h1>

      {confirmed && (
        <div className="mt-3 rounded-2xl bg-primary-soft px-4 py-3 text-sm text-primary-text">
          <p className="font-semibold">
            Đã chốt{monthData.confirmedAt ? ` ${new Date(monthData.confirmedAt).toLocaleDateString("vi-VN")}` : ""}{" "}
            — {formatVnd(monthData.total)}
          </p>
          {isOwner && !editingConfirmed && (
            <p className="mt-0.5">Sửa giá trị rồi bấm "Chỉnh sửa &amp; chốt lại" để cập nhật khoản chi.</p>
          )}
        </div>
      )}

      {!isOwner && (
        <p className="mt-3 text-sm text-ink-muted">
          Chỉ xem — chỉ chủ gia đình mới chỉnh sửa được.
        </p>
      )}

      <fieldset disabled={!editable} className="mt-4 flex flex-col gap-4 disabled:opacity-70">
        <Card>
          <h2 className="font-semibold text-ink">Khoản cố định</h2>
          <div className="mt-3 space-y-3">
            <MoneyInput label="Tiền phòng (đ)" value={form.rent} onChange={set("rent")} disabled={!editable} />
            <MoneyInput label="Tiền mạng (đ)" value={form.internet} onChange={set("internet")} disabled={!editable} />
            <MoneyInput
              label="Thang máy + vệ sinh (đ)"
              value={form.elevator}
              onChange={set("elevator")}
              disabled={!editable}
            />
            <MoneyInput label="Gửi xe (đ)" value={form.parking} onChange={set("parking")} disabled={!editable} />
          </div>
        </Card>

        <Card>
          <h2 className="font-semibold text-ink">Công tơ &amp; đơn giá</h2>
          <div className="mt-3 space-y-4">
            <MeterRow
              testId="meter-elec"
              label="Điện"
              unit="kWh"
              oldMeter={form.oldElec}
              newMeter={form.newElec}
              onOld={set("oldElec")}
              onNew={set("newElec")}
              rate={form.electricityRate}
              onRate={set("electricityRate")}
              consumption={totals?.elecConsumption}
            />
            <MeterRow
              testId="meter-water"
              label="Nước"
              unit="m³"
              oldMeter={form.oldWater}
              newMeter={form.newWater}
              onOld={set("oldWater")}
              onNew={set("newWater")}
              rate={form.waterRate}
              onRate={set("waterRate")}
              consumption={totals?.waterConsumption}
            />
          </div>
          {meterError && (
            <p role="alert" className="mt-3 text-sm font-medium text-danger">
              {meterError}
            </p>
          )}
          {formIncomplete && !meterError && (
            <p className="mt-3 text-sm text-ink-muted">
              Nhập đầy đủ các giá trị (số, không âm) để tính tiền.
            </p>
          )}
        </Card>

        <Card>
          <h2 className="font-semibold text-ink">Kết quả</h2>
          <div className="mt-3 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-ink-muted">Tiền điện</span>
              <span className="text-ink">{totals ? formatVnd(totals.electricityCost) : "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-muted">Tiền nước</span>
              <span className="text-ink">{totals ? formatVnd(totals.waterCost) : "—"}</span>
            </div>
            <div className="flex items-baseline justify-between border-t border-border pt-2">
              <span className="font-semibold text-ink">TỔNG</span>
              <span className="text-3xl font-bold text-primary-text">
                {totals ? formatVnd(totals.total) : "—"}
              </span>
            </div>
          </div>
        </Card>
      </fieldset>

      {editable && (
        <div className="mt-4 flex flex-col gap-2">
          <Button
            size="lg"
            disabled={!totals || !!meterError}
            onClick={openConfirm}
            className="w-full"
          >
            {confirmed ? "Chốt lại" : "Chốt khoản chi"}
          </Button>
          {confirmed && editingConfirmed && (
            <Button variant="secondary" onClick={() => setEditingConfirmed(false)} className="w-full">
              Huỷ chỉnh sửa
            </Button>
          )}
        </div>
      )}

      {confirmed && !editingConfirmed && isOwner && (
        <Button variant="secondary" onClick={() => setEditingConfirmed(true)} className="mt-4 w-full">
          Chỉnh sửa &amp; chốt lại
        </Button>
      )}

      {isOwner && (
        <Button
          variant="danger"
          onClick={() => setDeleteOpen(true)}
          className="mt-4 w-full"
        >
          Xoá tháng
        </Button>
      )}
      {deleteError && (
        <p role="alert" className="mt-2 text-sm font-medium text-danger">
          {deleteError}
        </p>
      )}

      {/* Modal chốt */}
      <Modal
        open={confirmOpen}
        onClose={() => !confirming && setConfirmOpen(false)}
        title={confirmed ? "Chốt lại" : "Chốt khoản chi"}
        showClose={!confirming}
        disableDismiss={confirming}
      >
        <div className="mt-4">
          <div className="rounded-xl bg-surface p-4">
            <p className="text-sm text-ink-muted">Tổng</p>
            <p className="text-2xl font-bold text-primary-text">
              {totals ? formatVnd(totals.total) : "—"}
            </p>
          </div>
          <div className="mt-4">
            <Input
              label="Ngày khoản chi"
              type="date"
              value={confirmDate}
              min={firstDayOfMonth(month)}
              max={lastDayOfMonth(month)}
              onChange={(e) => setConfirmDate(e.target.value)}
              hint="Khoản chi được ghi vào tháng này (mặc định ngày 01)."
            />
          </div>
          {note && (
            <p className="mt-3 break-words rounded-lg bg-surface p-3 text-xs text-ink-muted">
              Ghi chú: {note}
            </p>
          )}
          {confirmError && (
            <p role="alert" className="mt-3 text-sm font-medium text-danger">
              {confirmError}
            </p>
          )}
          <div className="mt-4">
            <Button size="lg" loading={confirming} onClick={handleConfirm} disabled={!confirmDate} className="w-full">
              {confirmed ? "Chốt lại" : "Chốt"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Xoá tháng */}
      <ConfirmDialog
        open={deleteOpen}
        title="Xoá tháng"
        message={
          confirmed
            ? `Xoá ${monthLabel(month)}? Khoản chi phòng trọ đã chốt của tháng này cũng sẽ bị xoá khỏi Lịch sử.`
            : `Xoá ${monthLabel(month)}?`
        }
        confirmLabel="Xoá"
        danger
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteOpen(false)}
      />
    </div>
  );
}

/** Input số tiền (int) — type number + inputMode numeric cho keyboard mobile. */
function MoneyInput({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  disabled?: boolean;
}) {
  return (
    <Input
      label={label}
      type="number"
      min={0}
      step={1}
      inputMode="numeric"
      value={value}
      onChange={onChange}
      disabled={disabled}
    />
  );
}

/** Hàng công tơ: số cũ / số mới + đơn giá + dòng tiêu thụ live. */
function MeterRow({
  testId,
  label,
  unit,
  oldMeter,
  newMeter,
  onOld,
  onNew,
  rate,
  onRate,
  consumption,
}: {
  testId: string;
  label: string;
  unit: string;
  oldMeter: string;
  newMeter: string;
  onOld: (e: ChangeEvent<HTMLInputElement>) => void;
  onNew: (e: ChangeEvent<HTMLInputElement>) => void;
  rate: string;
  onRate: (e: ChangeEvent<HTMLInputElement>) => void;
  consumption: number | null | undefined;
}) {
  return (
    <div data-testid={testId}>
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-ink">{label}</p>
        {consumption !== null && consumption !== undefined && (
          <p className="text-sm font-semibold text-primary-text">
            {formatMeter(consumption)} {unit}
          </p>
        )}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-3">
        <Input label="Số cũ" type="number" min={0} step={1} inputMode="numeric" value={oldMeter} onChange={onOld} />
        <Input label="Số mới" type="number" min={0} step={1} inputMode="numeric" value={newMeter} onChange={onNew} />
      </div>
      <div className="mt-3">
        <Input
          label={`Đơn giá (đ/${unit})`}
          type="number"
          min={0}
          step={1}
          inputMode="numeric"
          value={rate}
          onChange={onRate}
        />
      </div>
    </div>
  );
}

/** Chuyển FormState (string) → RentalMonthFields (đã parse được, cho preview note). */
function formAsFields(form: FormState): RentalMonthFields {
  return fieldsFromForm(form) as RentalMonthFields;
}
