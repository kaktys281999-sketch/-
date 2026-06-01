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
      onWheel={(e) => e.currentTarget.blur()}
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
    <div className={`ios-card p-4 ${className}`}>{children}</div>
  );
}

// iOS-цвета акцентов (системный фиолетовый/зелёный/красный)
export function ProgressBarThin({ percent }: { percent: number }) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
      <div
        className="h-full rounded-full bg-brand transition-all"
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

// Денежная сумма: отрицательные — красным, опц. положительные — зелёным
export function Money({
  value,
  className = "",
  colorNegative = true,
  colorPositive = false,
  showPlus = false,
}: {
  value: number;
  className?: string;
  colorNegative?: boolean;
  colorPositive?: boolean;
  showPlus?: boolean;
}) {
  const negative = value < 0;
  const positive = value > 0;
  const text =
    showPlus && value > 0 ? `+${formatMoney(value)}` : formatMoney(value);
  let color = "";
  if (colorNegative && negative) color = "text-red-600 dark:text-red-400";
  else if (colorPositive && positive)
    color = "text-emerald-600 dark:text-emerald-400";
  return <span className={`${color} ${className}`}>{text}</span>;
}

export function ProgressBar({ percent }: { percent: number }) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
      <div
        className="h-full rounded-full bg-brand transition-all"
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
