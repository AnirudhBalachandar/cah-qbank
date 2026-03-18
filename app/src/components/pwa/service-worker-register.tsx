"use client";

import { useEffect } from "react";

const shouldRegisterServiceWorker =
  process.env.NODE_ENV === "production" || process.env.NEXT_PUBLIC_ENABLE_PWA === "1";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!shouldRegisterServiceWorker || !("serviceWorker" in navigator)) {
      return;
    }

    navigator.serviceWorker.register("/sw.js").catch((error) => {
      console.warn("[pwa] service worker registration failed", error);
    });
  }, []);

  return null;
}
