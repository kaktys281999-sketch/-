"use client";

import { useEffect, useState } from "react";
import { BUILD_VERSION } from "@/lib/buildVersion";

// Проверяет /version.json и предлагает обновиться, когда на сервере новая версия.
export function UpdatePrompt() {
  const [latest, setLatest] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const check = async () => {
      try {
        const res = await fetch(`/version.json?t=${Date.now()}`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = await res.json();
        if (active && typeof data?.version === "string") setLatest(data.version);
      } catch {
        // офлайн или нет файла — молчим
      }
    };
    check();
    const iv = setInterval(check, 5 * 60 * 1000);
    const onVis = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      active = false;
      clearInterval(iv);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  const updateAvailable =
    latest !== null && latest !== BUILD_VERSION && latest !== dismissed;
  if (!updateAvailable) return null;

  async function doUpdate() {
    try {
      if ("serviceWorker" in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        await reg?.update();
      }
    } catch {
      // не критично
    }
    window.location.reload();
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-40 flex justify-center px-4 md:bottom-6">
      <div className="animate-fadein pointer-events-auto flex max-w-md items-center gap-3 rounded-2xl bg-slate-900 px-4 py-3 text-sm text-white shadow-lg ring-1 ring-white/10 dark:bg-slate-800">
        <span className="flex-1">Доступна новая версия приложения</span>
        <button
          type="button"
          onClick={doUpdate}
          className="font-semibold"
          style={{ color: "#a78bfa" }}
        >
          Обновить
        </button>
        <button
          type="button"
          onClick={() => setDismissed(latest)}
          aria-label="Позже"
          className="text-slate-400 active:text-white"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
