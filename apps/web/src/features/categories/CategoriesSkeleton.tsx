import { Card } from "../../shared/ui/Card";
import { Skeleton } from "../../shared/ui/Skeleton";

/**
 * Skeleton vùng danh sách màn Danh mục chi tiêu — 3 hàng card,
 * cùng chiều cao/khoảng cách với layout thật.
 */
export function CategoriesSkeleton() {
  return (
    <div role="status" aria-label="Đang tải" className="mt-4 space-y-2">
      {[0, 1, 2].map((row) => (
        <Card key={row} className="flex items-center gap-3 p-4">
          <Skeleton className="h-11 w-11 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1">
            <Skeleton className="h-4 w-1/3" />
          </div>
          <Skeleton className="h-4 w-24" />
        </Card>
      ))}
    </div>
  );
}
