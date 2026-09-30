import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  formatVnd,
  type RentalConfigFields,
  type RentalListResponse,
} from "@expense-tracker/shared";
import { ApiError } from "../../core/api";
import { useAuthStore } from "../../core/authStore";
import { createRentalMonth, fetchRental, saveRentalConfig } from "../../core/dataApi";
import { addMonths, currentMonth, monthLabel } from "../../core/dates";
import { Button } from "../../shared/ui/Button";
import { Card } from "../../shared/ui/Card";
import { Input } from "../../shared/ui/Input";
import { Modal } from "../../shared/ui/Modal";
import { Spinner } from "../../shared/ui/Spinner";

/**
 * Tiền phòng trọ — route /rental.
 * - Chưa có config → form setup 6 giá trị mặc định (chỉ OWNER).
 * - Có config → list tháng (mọi member xem được; OWNER thêm/tạo tháng).
 */
export default function RentalPage() {
  const activeFamilyId = useAuthStore((s) => s.activeFamilyId);
  const myRole = useAuthStore((s) => s.families.find((f) => f.id === s.activeFamilyId)?.myRole);
  const isOwner = myRole === "OWNER";
  const navigate = useNavigate();
  const monthNow = currentMonth();

  const [data, setData] = useState<RentalListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const reload = useCallback(() => {
    if (!activeFamilyId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchRental(activeFamilyId)
      .then((d) => {
        if (!cancelled) {
          setData(d);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : "Không tải được dữ liệu.");
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [activeFamilyId]);

  useEffect(() => reload(), [reload, reloadKey]);

  // --- Setup config (chưa có config) ---------------------------------------

  const emptyForm: Record<keyof RentalConfigFields, string> = {
    rent: "",
    internet: "",
    elevator: "",
    parking: "",
    electricityRate: "",
    waterRate: "",
  };
  const [configForm, setConfigForm] = useState(emptyForm);
  const [savingConfig, setSavingConfig] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);

  async function handleSubmitConfig() {
    if (!activeFamilyId) return;
    // Ô RỖNG phải chặn — `Number("") = 0` sẽ trôi qua validate phía dưới và
    // lưu config toàn 0 (mà sau khi config tồn tại không còn UI sửa config).
    if (Object.values(configForm).some((v) => v.trim() === "")) {
      setConfigError("Vui lòng nhập đầy đủ số tiền (chữ số, không âm).");
      return;
    }
    const fields = Object.fromEntries(
      Object.entries(configForm).map(([k, v]) => [k, Number(v)]),
    ) as unknown as RentalConfigFields;
    if (Object.values(fields).some((v) => !Number.isInteger(v) || v < 0 || v >= 1e10)) {
      setConfigError("Vui lòng nhập đầy đủ số tiền (chữ số, không âm).");
      return;
    }
    setConfigError(null);
    setSavingConfig(true);
    try {
      await saveRentalConfig(activeFamilyId, fields);
      // Tạo draft tháng hiện tại (409 nếu đã có — bình thường)
      try {
        await createRentalMonth(activeFamilyId, monthNow);
      } catch (err) {
        if (!(err instanceof ApiError && err.code === "RENTAL_MONTH_EXISTS")) throw err;
      }
      setConfigForm(emptyForm);
      setReloadKey((k) => k + 1);
    } catch (err) {
      setConfigError(err instanceof ApiError ? err.message : "Không lưu được thông tin.");
    } finally {
      setSavingConfig(false);
    }
  }

  // --- Thêm tháng ------------------------------------------------------------

  const [addOpen, setAddOpen] = useState(false);
  const [addMonth, setAddMonth] = useState(monthNow);
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  function openAddMonth() {
    // Mặc định = tháng liên tiếp sau tháng lớn nhất đang có (list desc)
    const latest = data?.months[0]?.month;
    setAddMonth(latest ? addMonths(latest, 1) : monthNow);
    setAddError(null);
    setAddOpen(true);
  }

  // Ghost card: tạo thẳng draft tháng hiện tại (1 chạm) rồi vào form.
  const [creatingCurrent, setCreatingCurrent] = useState(false);
  async function handleCreateCurrentMonth() {
    if (!activeFamilyId || creatingCurrent) return;
    setCreatingCurrent(true);
    try {
      await createRentalMonth(activeFamilyId, monthNow);
      navigate(`/rental/${monthNow}`);
    } catch {
      // 409 (tháng vừa được tạo — race) hoặc lỗi mạng → refetch để đồng bộ lại
      setReloadKey((k) => k + 1);
    } finally {
      setCreatingCurrent(false);
    }
  }

  async function handleCreateMonth() {
    if (!activeFamilyId) return;
    setAdding(true);
    setAddError(null);
    try {
      await createRentalMonth(activeFamilyId, addMonth);
      setAddOpen(false);
      navigate(`/rental/${addMonth}`);
    } catch (err) {
      setAddError(err instanceof ApiError ? err.message : "Không tạo được tháng.");
    } finally {
      setAdding(false);
    }
  }

  // --- Render ----------------------------------------------------------------

  if (loading && !data) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }

  if (error && !data) {
    return (
      <p role="alert" className="text-sm font-medium text-danger">
        {error}
      </p>
    );
  }

  if (!data) return null;

  // Trạng thái 1: chưa setup config
  if (!data.config) {
    return (
      <div>
        <h1 className="text-xl font-bold text-ink">Tiền phòng trọ</h1>
        {!isOwner ? (
          <Card className="mt-4">
            <p className="text-sm text-ink-muted">
              Chưa có thông tin mặc định. Chỉ chủ gia đình mới nhập được — vui lòng nhờ chủ
              gia đình vào màn này để bắt đầu.
            </p>
          </Card>
        ) : (
          <Card className="mt-4">
            <h2 className="font-semibold text-ink">Thông tin mặc định</h2>
            <p className="mt-1 text-sm text-ink-muted">
              Nhập một lần — các tháng sau tự kế thừa, vẫn sửa được từng tháng trước khi chốt.
            </p>
            <div className="mt-4 space-y-3">
              <Input
                label="Tiền phòng (đ)"
                type="number"
                min={0}
                inputMode="numeric"
                placeholder="3200000"
                value={configForm.rent}
                onChange={(e) => setConfigForm((f) => ({ ...f, rent: e.target.value }))}
              />
              <Input
                label="Tiền mạng (đ)"
                type="number"
                min={0}
                inputMode="numeric"
                placeholder="100000"
                value={configForm.internet}
                onChange={(e) => setConfigForm((f) => ({ ...f, internet: e.target.value }))}
              />
              <Input
                label="Thang máy + vệ sinh (đ)"
                type="number"
                min={0}
                inputMode="numeric"
                placeholder="200000"
                value={configForm.elevator}
                onChange={(e) => setConfigForm((f) => ({ ...f, elevator: e.target.value }))}
              />
              <Input
                label="Gửi xe (đ)"
                type="number"
                min={0}
                inputMode="numeric"
                placeholder="100000"
                value={configForm.parking}
                onChange={(e) => setConfigForm((f) => ({ ...f, parking: e.target.value }))}
              />
              <Input
                label="Giá điện (đ/kWh)"
                type="number"
                min={0}
                inputMode="numeric"
                placeholder="4000"
                value={configForm.electricityRate}
                onChange={(e) => setConfigForm((f) => ({ ...f, electricityRate: e.target.value }))}
              />
              <Input
                label="Giá nước (đ/m³)"
                type="number"
                min={0}
                inputMode="numeric"
                placeholder="35000"
                value={configForm.waterRate}
                onChange={(e) => setConfigForm((f) => ({ ...f, waterRate: e.target.value }))}
              />
            </div>
            {configError && (
              <p role="alert" className="mt-3 text-sm font-medium text-danger">
                {configError}
              </p>
            )}
            <div className="mt-4">
              <Button size="lg" loading={savingConfig} onClick={handleSubmitConfig} className="w-full">
                Lưu &amp; tạo tháng {monthLabel(monthNow)}
              </Button>
            </div>
          </Card>
        )}
      </div>
    );
  }

  // Trạng thái 2: có config → list tháng
  const currentMonthData = data.months.find((m) => m.month === monthNow);
  // Nhóm theo năm (list đã desc theo tháng)
  const years: string[] = [];
  for (const m of data.months) {
    const y = m.month.slice(0, 4);
    if (!years.includes(y)) years.push(y);
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-ink">Tiền phòng trọ</h1>
        {isOwner && (
          <Button variant="secondary" size="sm" onClick={openAddMonth}>
            ＋ Thêm tháng
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-3 text-sm font-medium text-danger">
          {error}
        </p>
      )}

      {isOwner && !currentMonthData && (
        <button
          type="button"
          onClick={handleCreateCurrentMonth}
          disabled={creatingCurrent}
          className="mt-4 w-full rounded-2xl border-2 border-dashed border-border bg-card p-4 text-center transition hover:border-primary disabled:opacity-60"
        >
          <p className="font-medium text-ink">
            {creatingCurrent ? "Đang tạo..." : `Chưa có ${monthLabel(monthNow)}`}
          </p>
          <p className="mt-0.5 text-sm text-ink-muted">Chạm để tạo</p>
        </button>
      )}

      {data.months.length === 0 && !currentMonthData && (
        <Card className="mt-4">
          <p className="text-sm text-ink-muted">Chưa có tháng nào — chạm thẻ trên để bắt đầu.</p>
        </Card>
      )}

      <div className="mt-4 space-y-5">
        {years.map((year) => (
          <section key={year} aria-label={year}>
            <h2 className="text-xs font-semibold tracking-wide text-ink-muted uppercase">{year}</h2>
            <ul className="mt-2 space-y-2">
              {data.months
                .filter((m) => m.month.startsWith(`${year}-`))
                .map((m) => (
                  <li key={m.id}>
                    <MonthLink month={m.month} total={m.total} status={m.status} />
                  </li>
                ))}
            </ul>
          </section>
        ))}
      </div>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Thêm tháng" showClose>
        <div className="mt-4">
          <Input
            label="Chọn tháng"
            type="month"
            value={addMonth}
            onChange={(e) => setAddMonth(e.target.value)}
          />
          {addError && (
            <p role="alert" className="mt-2 text-sm font-medium text-danger">
              {addError}
            </p>
          )}
          <div className="mt-4">
            <Button size="lg" loading={adding} onClick={handleCreateMonth} disabled={!addMonth} className="w-full">
              Tạo
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

/** Card tháng trong list — chạm vào mở form tháng. */
function MonthLink({
  month,
  total,
  status,
}: {
  month: string;
  total: number;
  status: "DRAFT" | "CONFIRMED";
}) {
  const confirmed = status === "CONFIRMED";
  return (
    <Link to={`/rental/${month}`}>
      <Card className="w-full">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="font-medium text-ink">{monthLabel(month)}</p>
            <p className="mt-0.5 text-lg font-bold text-ink">{formatVnd(total)}</p>
          </div>
          <span
            className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
              confirmed ? "bg-primary-soft text-primary-text" : "bg-warning-soft text-warning"
            }`}
          >
            {confirmed ? "Đã chốt" : "Chờ chốt"}
          </span>
        </div>
      </Card>
    </Link>
  );
}
