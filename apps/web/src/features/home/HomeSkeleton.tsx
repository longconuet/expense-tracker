import { Card } from "../../shared/ui/Card";
import { Skeleton } from "../../shared/ui/Skeleton";

/**
 * Skeleton màn Trang chủ — mô phỏng các card thật ("Tổng tháng này",
 * "Theo danh mục", "Gần đây" nhóm theo ngày) để data về không giật layout.
 * Tiêu đề + tháng là dữ liệu cục bộ (không cần fetch) → do HomePage giữ,
 * luôn hiện thật ở phía trên skeleton (node ổn định, không remount).
 */
export function HomeSkeleton() {
  return (
    <div role="status" aria-label="Đang tải">
      {/* Tổng tháng này */}
      <Card className="mt-4">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="mt-3 h-9 w-40" />
      </Card>

      {/* Theo danh mục */}
      <Card className="mt-4">
        <Skeleton className="h-5 w-32" />
        <div className="mt-4 space-y-4">
          {[0, 1, 2].map((i) => (
            <div key={i}>
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-4 w-16" />
              </div>
              <Skeleton className="mt-2 h-1.5 w-full" />
            </div>
          ))}
        </div>
      </Card>

      {/* Gần đây */}
      <Card className="mt-4">
        <Skeleton className="h-5 w-20" />
        <div className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <Skeleton className="h-3.5 w-16" />
            <Skeleton className="h-3.5 w-16" />
          </div>
          {[0, 1].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-6 w-6 rounded-full" />
              <div className="min-w-0 flex-1">
                <Skeleton className="h-4 w-3/5" />
                <Skeleton className="mt-1.5 h-3 w-1/3" />
              </div>
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
