import { useCallback, useEffect, useState } from "react";

/**
 * Sự kiện `beforeinstallprompt` (trình duyệt Chromium) — fired khi app đạt
 * điều kiện cài đặt (manifest + SW + https/localhost). FE giữ lại event,
 * chỉ gọi `prompt()` khi user chủ động bấm "Cài ứng dụng".
 *
 * Trình duyệt khác (Safari iOS...) không có event này → nút không hiện,
 * user cài qua menu trình duyệt như bình thường.
 */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

export function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    function handleBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    }
    function handleInstalled() {
      setInstalled(true);
      setDeferredPrompt(null);
    }
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice; // đợi user chọn accepted/dismissed
    setDeferredPrompt(null);
  }, [deferredPrompt]);

  return {
    canInstall: deferredPrompt !== null && !installed,
    installed,
    promptInstall,
  };
}
