"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { OperationForm } from "./OperationForm";
import { Card } from "./ui";

export function AddOperation({ onAdded }: { onAdded?: () => void }) {
  const { addOperation } = useStore();
  const [savedAt, setSavedAt] = useState<number | null>(null);

  return (
    <div className="space-y-3">
      {savedAt && (
        <div className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
          Операция добавлена ✓
        </div>
      )}
      <Card>
        <OperationForm
          submitLabel="Добавить"
          onSubmit={(op) => {
            addOperation(op);
            setSavedAt(Date.now());
            onAdded?.();
            // спрятать уведомление через 2.5 c
            setTimeout(() => setSavedAt(null), 2500);
          }}
        />
      </Card>
    </div>
  );
}
