"use client";

import { useState } from "react";
import { monthKey } from "@/lib/format";
import { MonthSwitcher } from "@/components/MonthSwitcher";
import { Summary } from "@/components/Summary";
import { AddOperation } from "@/components/AddOperation";
import { Operations } from "@/components/Operations";
import { Settings } from "@/components/Settings";

type Tab = "summary" | "add" | "operations" | "settings";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "summary", label: "Сводка", icon: "📊" },
  { id: "add", label: "Добавить", icon: "➕" },
  { id: "operations", label: "Операции", icon: "📋" },
  { id: "settings", label: "Настройки", icon: "⚙️" },
];

export default function Home() {
  const [tab, setTab] = useState<Tab>("summary");
  const [month, setMonth] = useState<string>(() => monthKey(new Date()));

  const showMonthSwitcher = tab === "summary" || tab === "operations";

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col">
      <div className="flex-1 space-y-3 p-3 pb-24">
        {showMonthSwitcher && (
          <MonthSwitcher value={month} onChange={setMonth} />
        )}

        {tab === "summary" && <Summary month={month} />}
        {tab === "add" && (
          <AddOperation onAdded={() => setTab("operations")} />
        )}
        {tab === "operations" && <Operations month={month} />}
        {tab === "settings" && <Settings />}
      </div>

      {/* Нижняя навигация */}
      <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-md">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs ${
                tab === t.id ? "text-brand" : "text-slate-400"
              }`}
            >
              <span className="text-xl leading-none">{t.icon}</span>
              <span className="font-medium">{t.label}</span>
            </button>
          ))}
        </div>
      </nav>
    </main>
  );
}
