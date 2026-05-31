"use client";

import { ReactNode, useEffect, useRef, useState } from "react";
import { formatMoney } from "@/lib/format";

// Числовое поле с локальным буфером ввода: позволяет очищать/вводить
// промежуточные значения, не схлопывая значение в 0, и фиксирует
// только корректные числа.
export function NumberInput({
  value,
  onCommit,
  className = "",
}: {
  value: number;
  onCommit: (n: number) => void;
  className?: string;
}) {
  const [text, setText] = useState<string>(() => String(value));
  // последнее значение, которое мы сами зафиксировали — чтобы отличать
  // внешние изменения (сброс, операции) от собственных
  const lastValue = useRef<number>(value);

  useEffect(() => {
    if (value !== lastValue.current) {
      lastValue.current = value;
      setText(String(value));
    }
  }, [value]);

  return (
    <input
      type="number"
      inputMode="numeric"
      value={text}
      onChange={(e) => {
        const t = e.target.value;
        setText(t);
        if (t === "" || t === "-") return;
        const n = Number(t);
        if (!Number.isNaN(n)) {
          lastValue.current = n;
          onCommit(n);
        }
      }}
      onBlur={() => {
        if (text === "" || Number.isNaN(Number(text))) {
          setText(String(value));
        }
      }}
      className={className}
    />
  );
}

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-slate-100 bg-white p-4 ${className}`}
    >
      {children}
    </div>
  );
}

// Денежная сумма: отрицательные — красным
export function Money({
  value,
  className = "",
  colorNegative = true,
  showPlus = false,
}: {
  value: number;
  className?: string;
  colorNegative?: boolean;
  showPlus?: boolean;
}) {
  const negative = value < 0;
  const text =
    showPlus && value > 0 ? `+${formatMoney(value)}` : formatMoney(value);
  return (
    <span
      className={`${
        colorNegative && negative ? "text-red-600" : ""
      } ${className}`}
    >
      {text}
    </span>
  );
}

export function ProgressBar({ percent }: { percent: number }) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div className="h-3 w-full overflow-hidden rounded-full bg-slate-200">
      <div
        className="h-full rounded-full bg-brand transition-all"
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
