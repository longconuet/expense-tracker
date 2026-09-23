import { useEffect, useRef } from "react";
import { SYNCED_EVENT } from "./syncQueue";

/**
 * Gọi lại callback khi hàng đợi offline sync thành công
 * (data trên server vừa thay đổi — màn nên refetch).
 */
export function useRefetchOnSync(refetch: () => void): void {
  const ref = useRef(refetch);
  ref.current = refetch;

  useEffect(() => {
    function handler() {
      ref.current();
    }
    window.addEventListener(SYNCED_EVENT, handler);
    return () => window.removeEventListener(SYNCED_EVENT, handler);
  }, []);
}
