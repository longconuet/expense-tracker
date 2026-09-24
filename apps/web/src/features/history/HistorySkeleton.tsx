import { Card } from "../../shared/ui/Card";
import { Skeleton } from "../../shared/ui/Skeleton";

/**
 * Skeleton vùng danh sách màn Lịch sử — 2 nhóm ngày (header + 2 card khoản),
 * cùng chiều cao/khoảng cách với layout thật. Tiêu đề, selector tháng, chip
 * lọc do HistoryPage giữ (hiện thật phía trên).
 */
export function HistorySkeleton() {
  return (
    <div role="status" aria-label="Đang tải" className="mt-4 space-y-4">
      {[0, 1].map((group) => (
        <div key={group}>
          <div className="flex items-center justify-between">
            <Skeleton className="h-3.5 w-16" />
            <Skeleton className="h-3.5 w-16" />
          </div>
          <div className="mt-2 space-y-2">
            {[0, 1].map((row) => (
              <Card key={row} className="flex items-center gap-3 p-4">
                <Skeleton className="h-6 w-6 rounded-full" />
                <div className="min-w-0 flex-1">
                  <Skeleton className="h-4 w-3/5" />
                  <Skeleton className="mt-1.5 h-3 w-2/5" />
                </div>
                <Skeleton className="h-4 w-16" />
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
