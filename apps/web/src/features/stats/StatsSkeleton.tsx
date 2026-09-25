import { Card } from "../../shared/ui/Card";
import { Skeleton } from "../../shared/ui/Skeleton";

/**
 * Skeleton màn Thống kê — mô phỏng 3 card thật (tổng tháng, donut + chú thích,
 * bar theo ngày) với chiều cao khớp layout thật. Tiêu đề + selector tháng
 * do StatsPage giữ (hiện thật phía trên).
 */
export function StatsSkeleton() {
  return (
    <div role="status" aria-label="Đang tải">
      {/* Tổng tháng */}
      <Card className="mt-4">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="mt-3 h-9 w-40" />
        {/* Section theo thành viên */}
        <div className="mt-3 space-y-3 border-t border-border pt-3">
          <Skeleton className="h-4 w-28" />
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-4 w-full" />
          ))}
        </div>
      </Card>

      {/* Theo danh mục — donut + chú thích */}
      <Card className="mt-4">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="mt-3 h-56 w-full" />
        <div className="mt-4 space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-4 w-full" />
          ))}
        </div>
      </Card>

      {/* Theo ngày — bar */}
      <Card className="mt-4">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="mt-3 h-48 w-full" />
      </Card>
    </div>
  );
}
