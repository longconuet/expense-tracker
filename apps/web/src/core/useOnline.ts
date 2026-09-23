import { useEffect, useState } from "react";

/** Trạng thái mạng thiết bị (navigator.onLine + event online/offline). */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    function update() {
      setOnline(navigator.onLine);
    }
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  return online;
}
