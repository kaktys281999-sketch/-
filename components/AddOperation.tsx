"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { Operation, Template } from "@/lib/types";
import { OperationForm } from "./OperationForm";
import { Card } from "./ui";
import { formatMoney } from "@/lib/format";

export function AddOperation({ onAdded }: { onAdded?: () => void }) {
  const { state, addOperation, addTemplate, deleteTemplate } = useStore();
  const [savedAt, setSavedAt] = useState<number | null>(null);
  // префилл из шаблона; ключ перезапускает форму
  const [prefill, setPrefill] = useState<Partial<Omit<Operation, "id">>>();
  const [formKey, setFormKey] = useState(0);
  // текущий черновик формы — для «сохранить как шаблон»
  const [draft, setDraft] = useState<Omit<Operation, "id"> | null>(null);
  const [manageTpl, setManageTpl] = useState(false);

  const templates = state.templates ?? [];

  function useTemplate(t: Template) {
    setPrefill({
      type: t.type,
      category: t.category,
      amount: t.amount,
      accountId: t.accountId,
      note: t.note,
    });
    setFormKey((k) => k + 1); // перезапустить форму с новым префиллом
  }

  function saveAsTemplate() {
    if (!draft || draft.amount <= 0) return;
    const title =
      draft.note?.trim() ||
      `${draft.category} · ${formatMoney(draft.amount)}`;
    addTemplate({
      title,
      type: draft.type,
      category: draft.category,
      amount: draft.amount,
      accountId: draft.accountId,
      note: draft.note,
    });
  }

  return (
    <div className="space-y-4">
      {savedAt && (
        <div className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
          Операция добавлена ✓
        </div>
      )}

      {/* Шаблоны частых операций */}
      {templates.length > 0 && (
        <div>
          <div className="mb-1.5 flex items-center justify-between px-1">
            <span className="text-[13px] font-medium uppercase tracking-wide text-label-2">
              Частые операции
            </span>
            <button
              type="button"
              onClick={() => setManageTpl((v) => !v)}
              className="text-[13px] font-medium text-brand"
            >
              {manageTpl ? "Готово" : "Изменить"}
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {templates.map((t) => (
              <div key={t.id} className="relative">
                <button
                  type="button"
                  onClick={() => !manageTpl && useTemplate(t)}
                  className="rounded-full bg-black/[0.06] px-3.5 py-2 text-[14px] font-medium dark:bg-white/10"
                >
                  {t.title}
                </button>
                {manageTpl && (
                  <button
                    type="button"
                    onClick={() => deleteTemplate(t.id)}
                    aria-label="Удалить шаблон"
                    className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[11px] font-bold text-white"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <Card>
        <OperationForm
          key={formKey}
          prefill={prefill}
          submitLabel="Добавить"
          onDraftChange={setDraft}
          onSubmit={(op) => {
            addOperation(op);
            setSavedAt(Date.now());
            onAdded?.();
            setTimeout(() => setSavedAt(null), 2500);
          }}
        />
      </Card>

      {/* Сохранить текущую как шаблон */}
      <Card className="!p-0">
        <button
          type="button"
          onClick={saveAsTemplate}
          disabled={!draft || draft.amount <= 0}
          className="w-full py-3.5 text-center text-[17px] font-medium text-brand disabled:opacity-40"
        >
          Сохранить как шаблон
        </button>
      </Card>
    </div>
  );
}
