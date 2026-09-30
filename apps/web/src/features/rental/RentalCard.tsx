import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { formatVnd, type RentalListResponse } from "@expense-tracker/shared";
import { useAuthStore } from "../../core/authStore";
import { fetchRental } from "../../core/dataApi";
import { currentMonth, monthLabel } from "../../core/dates";
import { Card } from "../../shared/ui/Card";

/**
 * Card "🏠 Tiền phòng trọ" trên Trang chủ — điểm vào route /rental.
 * Fetch độc lập (qua read cache), KHÔNG block render phần còn lại của Home:
 * lỗi/offline → card chỉ hiện tiêu đề, không dòng 2.
 */
export function RentalCard() {
  const activeFamilyId = useAuthStore((s) => s.activeFamilyId);
  const [data, setData] = useState<RentalListResponse | null>(null);

  useEffect(() => {
    if (!activeFamilyId) return;
    let cancelled = false;
    fetchRental(activeFamilyId)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {
        // Lỗi mạng/offline: giữ card ở dạng "chưa có dữ liệu" (không crash Home).
      });
    return () => {
      cancelled = true;
    };
  }, [activeFamilyId]);

  const monthNow = currentMonth();
  const current = data?.months.find((m) => m.month === monthNow);

  let line2: { text: string; className: string } | null = null;
  if (data) {
    if (!data.config) {
      line2 = { text: "Chưa nhập thông tin — chạm để bắt đầu", className: "text-ink-muted" };
    } else if (!current) {
      line2 = { text: `Chưa có ${monthLabel(monthNow)} — chạm để tạo`, className: "text-ink-muted" };
    } else if (current.status === "CONFIRMED") {
      line2 = { text: `Đã chốt · ${formatVnd(current.total)}`, className: "text-primary-text" };
    } else {
      line2 = { text: `Chờ chốt · ${formatVnd(current.total)}`, className: "text-warning" };
    }
  }

  return (
    <Link to="/rental" className="block">
      <Card>
        <div className="flex items-center gap-3">
          <span aria-hidden className="text-2xl">
            🏠
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-medium text-ink">Tiền phòng trọ</p>
            {line2 && <p className={`truncate text-sm ${line2.className}`}>{line2.text}</p>}
          </div>
          <span aria-hidden className="text-lg text-ink-muted">
            ›
          </span>
        </div>
      </Card>
    </Link>
  );
}
