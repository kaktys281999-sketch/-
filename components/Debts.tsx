"use client";

import { useMemo, useState } from "react";
import {
  useStore,
  debtsSummary,
  debtOutstanding,
  debtPaidTotal,
  isDebtSettled,
} from "@/lib/store";
import { Debt, DebtDirection } from "@/lib/types";
import {
  formatMoney,
  formatDateShort,
  todayISO,
  daysUntil,
  relativeDayLabel,
} from "@/lib/format";
import { Card, Money, ProgressBar } from "./ui";

const DIR_LABEL: Record<DebtDirection, string> = {
  owed_to_me: "Мне должны",
  i_owe: "Я должен",
};

export function Debts() {
  const { state } = useStore();
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const debts = useMemo(
    () => (state.debts ?? []).filter((d) => !d.deleted),
    [state.debts]
  );
  const summary = debtsSummary(state);

  const open = openId ? debts.find((d) => d.id === openId) ?? null : null;

  // Группы: активные сверху, погашенные — в архиве
  const groups = useMemo(() => {
    const active = debts.filter((d) => !isDebtSettled(d));
    const settled = debts.filter((d) => isDebtSettled(d));
    const sortByOut = (a: Debt, b: Debt) =>
      debtOutstanding(b) - debtOutstanding(a);
    return {
      owedToMe: active
        .filter((d) => d.direction === "owed_to_me")
        .sort(sortByOut),
      iOwe: active.filter((d) => d.direction === "i_owe").sort(sortByOut),
      settled: settled.sort((a, b) => (a.date < b.date ? 1 : -1)),
    };
  }, [debts]);

  if (adding) {
    return <DebtForm onClose={() => setAdding(false)} />;
  }
  if (open) {
    return <DebtDetail debt={open} onClose={() => setOpenId(null)} />;
  }

  return (
    <div className="space-y-4">
      {/* Итоги */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <div className="text-[13px] text-label-2">Мне должны</div>
          <div className="mt-0.5 text-[22px] font-bold text-emerald-600 dark:text-emerald-400">
            {formatMoney(summary.owedToMe)}
          </div>
        </Card>
        <Card>
          <div className="text-[13px] text-label-2">Я должен</div>
          <div className="mt-0.5 text-[22px] font-bold text-red-600 dark:text-red-400">
            {formatMoney(summary.iOwe)}
          </div>
        </Card>
      </div>

      {(summary.owedToMe > 0 || summary.iOwe > 0) && (
        <Card className="flex items-center justify-between">
          <span className="text-[15px] font-medium">Сальдо</span>
          <Money
            value={summary.net}
            colorPositive
            showPlus
            className="text-[17px] font-semibold"
          />
        </Card>
      )}

      <button
        type="button"
        onClick={() => setAdding(true)}
        className="w-full rounded-2xl bg-brand py-3.5 text-[17px] font-semibold text-white"
      >
        Добавить долг
      </button>

      {debts.length === 0 && (
        <Card>
          <p className="py-8 text-center text-[15px] text-label-3">
            Долгов пока нет
          </p>
        </Card>
      )}

      <div className="md:columns-2 md:gap-4">
        <DebtGroup
          title="Мне должны"
          list={groups.owedToMe}
          onOpen={setOpenId}
        />
        <DebtGroup title="Я должен" list={groups.iOwe} onOpen={setOpenId} />

        {groups.settled.length > 0 && (
          <DebtGroup
            title="Погашенные"
            list={groups.settled}
            onOpen={setOpenId}
            muted
          />
        )}
      </div>
    </div>
  );
}

function DebtGroup({
  title,
  list,
  onOpen,
  muted = false,
}: {
  title: string;
  list: Debt[];
  onOpen: (id: string) => void;
  muted?: boolean;
}) {
  const { state } = useStore();
  if (list.length === 0) return null;
  const accountName = (id: string) =>
    state.accounts.find((a) => a.id === id)?.name ?? "—";

  return (
    <div className="mb-4 break-inside-avoid">
      <div className="mb-1.5 px-1 text-[13px] font-medium uppercase tracking-wide text-label-2">
        {title}
      </div>
      <Card className="!p-0">
        {list.map((d, i) => {
          const out = debtOutstanding(d);
          const paid = debtPaidTotal(d);
          const percent = d.amount > 0 ? (paid / d.amount) * 100 : 0;
          const settled = isDebtSettled(d);
          return (
            <button
              key={d.id}
              type="button"
              onClick={() => onOpen(d.id)}
              className={`block w-full px-4 py-3 text-left active:bg-black/[0.03] dark:active:bg-white/5 ${
                i > 0 ? "border-t border-[var(--separator)]" : ""
              } ${muted ? "opacity-60" : ""}`}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="truncate text-[15px] font-medium">
                  {d.person || "Без имени"}
                </span>
                <span className="shrink-0 text-[15px] font-semibold">
                  {settled ? (
                    <span className="text-label-3">погашен</span>
                  ) : (
                    formatMoney(out)
                  )}
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between text-[13px] text-label-2">
                <span className="truncate">
                  {formatDateShort(d.date)}
                  {d.note ? ` · ${d.note}` : ` · ${accountName(d.accountId)}`}
                </span>
                {!settled && paid > 0 && (
                  <span className="shrink-0">
                    вернул {formatMoney(paid)} из {formatMoney(d.amount)}
                  </span>
                )}
              </div>
              {!settled && d.dueDate && (
                <div className="mt-1.5">
                  {(() => {
                    const days = daysUntil(d.dueDate);
                    const soon = days <= 7;
                    const urgent = days <= 0;
                    return (
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-[12px] font-medium ${
                          urgent
                            ? "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300"
                            : soon
                            ? "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300"
                            : "bg-black/[0.06] text-label-2 dark:bg-white/10"
                        }`}
                      >
                        срок {relativeDayLabel(d.dueDate)}
                      </span>
                    );
                  })()}
                </div>
              )}
              {!settled && (
                <div className="mt-2">
                  <ProgressBar percent={percent} />
                </div>
              )}
            </button>
          );
        })}
      </Card>
    </div>
  );
}

// ===== Форма добавления долга =====

function DebtForm({ onClose }: { onClose: () => void }) {
  const { state, addDebt } = useStore();
  const defaultAccount =
    (state.primaryAccountId &&
      state.accounts.some((a) => a.id === state.primaryAccountId)
      ? state.primaryAccountId
      : state.accounts[0]?.id) ?? "";
  const [direction, setDirection] = useState<DebtDirection>("owed_to_me");
  const [person, setPerson] = useState("");
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState(defaultAccount);
  const [date, setDate] = useState(todayISO());
  const [dueDate, setDueDate] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  const labelCls =
    "block text-[13px] font-medium uppercase tracking-wide text-label-2 mb-2";
  const fieldCls =
    "w-full rounded-xl bg-black/[0.04] px-3.5 py-3 outline-none focus:ring-2 focus:ring-brand/40 dark:bg-white/[0.06] dark:text-slate-100";

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const sum = Math.abs(Number(amount.replace(/\s/g, "").replace(",", ".")));
    if (!sum || Number.isNaN(sum)) {
      setError("Введите сумму больше нуля");
      return;
    }
    if (!person.trim()) {
      setError("Укажите имя");
      return;
    }
    addDebt({
      direction,
      person: person.trim(),
      amount: sum,
      accountId,
      date,
      dueDate: dueDate || undefined,
      note: note.trim(),
    });
    onClose();
  }

  return (
    <div className="space-y-3">
      <h2 className="px-1 text-xl font-bold tracking-tight">Новый долг</h2>
      <Card>
        <form onSubmit={submit} className="space-y-5">
          {/* Направление */}
          <div className="grid grid-cols-2 gap-2">
            {(["owed_to_me", "i_owe"] as DebtDirection[]).map((dir) => (
              <button
                type="button"
                key={dir}
                onClick={() => setDirection(dir)}
                className={`rounded-xl px-3 py-2.5 text-[14px] font-medium ${
                  direction === dir
                    ? "bg-brand text-white"
                    : "bg-black/[0.06] text-slate-700 dark:bg-white/10 dark:text-slate-200"
                }`}
              >
                {DIR_LABEL[dir]}
              </button>
            ))}
          </div>

          {/* Сумма */}
          <div className="flex items-center justify-center gap-1 py-1">
            <input
              type="number"
              inputMode="decimal"
              min="0"
              value={amount}
              autoFocus
              onChange={(e) => {
                if (error) setError("");
                setAmount(e.target.value);
              }}
              onWheel={(e) => e.currentTarget.blur()}
              placeholder="0"
              className="w-auto max-w-[70%] bg-transparent text-center text-[44px] font-bold leading-none tracking-tight tabular-nums outline-none placeholder:text-label-3"
              required
            />
            <span className="text-[34px] font-semibold text-label-3">₽</span>
          </div>

          <div>
            <label className={labelCls}>
              {direction === "owed_to_me" ? "Кто должен" : "Кому должен"}
            </label>
            <input
              type="text"
              value={person}
              onChange={(e) => {
                if (error) setError("");
                setPerson(e.target.value);
              }}
              placeholder="Имя"
              className={fieldCls}
            />
          </div>

          <div>
            <label className={labelCls}>
              {direction === "owed_to_me" ? "Счёт, с которого дал" : "Счёт, куда получил"}
            </label>
            <div className="flex flex-wrap gap-2">
              {state.accounts.map((a) => (
                <button
                  type="button"
                  key={a.id}
                  onClick={() => setAccountId(a.id)}
                  className={`rounded-full px-3.5 py-2 text-sm font-medium transition ${
                    accountId === a.id
                      ? "bg-brand text-white"
                      : "bg-black/[0.06] text-slate-700 dark:bg-white/10 dark:text-slate-200"
                  }`}
                >
                  {a.name}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className={labelCls}>Дата</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={fieldCls}
                required
              />
            </div>
            <div className="flex-1">
              <label className={labelCls}>Срок возврата</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className={fieldCls}
              />
            </div>
          </div>

          <div>
            <label className={labelCls}>Заметка</label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Необязательно"
              className={fieldCls}
            />
          </div>

          {error && (
            <p className="text-center text-[13px] font-medium text-red-600 dark:text-red-400">
              {error}
            </p>
          )}

          <div className="flex gap-2.5 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-2xl bg-black/[0.06] py-3.5 text-[17px] font-semibold text-slate-700 dark:bg-white/10 dark:text-slate-200"
            >
              Отмена
            </button>
            <button
              type="submit"
              className="flex-[2] rounded-2xl bg-brand py-3.5 text-[17px] font-semibold text-white"
            >
              Сохранить
            </button>
          </div>
        </form>
      </Card>
    </div>
  );
}

// ===== Детали долга + возвраты =====

function DebtDetail({ debt, onClose }: { debt: Debt; onClose: () => void }) {
  const {
    state,
    addDebtPayment,
    deleteDebtPayment,
    settleDebt,
    deleteDebt,
    updateDebt,
  } = useStore();
  const [payAmount, setPayAmount] = useState("");
  const [payAccount, setPayAccount] = useState(debt.accountId);
  const [payError, setPayError] = useState(false);

  const out = debtOutstanding(debt);
  const paid = debtPaidTotal(debt);
  const settled = isDebtSettled(debt);
  const accountName = (id: string) =>
    state.accounts.find((a) => a.id === id)?.name ?? "—";

  const fieldCls =
    "w-full rounded-xl bg-black/[0.04] px-3.5 py-2.5 outline-none focus:ring-2 focus:ring-brand/40 dark:bg-white/[0.06] dark:text-slate-100";

  function addPayment() {
    const sum = Math.abs(
      Number(payAmount.replace(/\s/g, "").replace(",", "."))
    );
    if (!sum || Number.isNaN(sum)) {
      setPayError(true);
      return;
    }
    addDebtPayment(debt.id, {
      date: todayISO(),
      amount: sum,
      accountId: payAccount,
    });
    setPayAmount("");
    setPayError(false);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <button
          type="button"
          onClick={onClose}
          className="text-[15px] font-medium text-brand"
        >
          ‹ Назад
        </button>
        <span className="text-[13px] text-label-2">{DIR_LABEL[debt.direction]}</span>
      </div>

      {/* Шапка */}
      <Card>
        <div className="text-[15px] font-semibold">{debt.person || "Без имени"}</div>
        <div className="mt-1 text-[34px] font-bold leading-none tracking-tight">
          {settled ? (
            <span className="text-emerald-600 dark:text-emerald-400">Погашен</span>
          ) : (
            <>{formatMoney(out)}</>
          )}
        </div>
        <div className="mt-2 text-[13px] text-label-2">
          {settled
            ? `Вернул всё · ${formatMoney(debt.amount)}`
            : `Осталось из ${formatMoney(debt.amount)} · ${formatDateShort(
                debt.date
              )}`}
        </div>
        {paid > 0 && !settled && (
          <div className="mt-2">
            <ProgressBar percent={(paid / debt.amount) * 100} />
          </div>
        )}
        {debt.note && (
          <div className="mt-2 text-[13px] text-label-2">{debt.note}</div>
        )}
      </Card>

      {/* Срок возврата */}
      {!settled && (
        <Card className="flex items-center justify-between gap-3">
          <span className="text-[15px]">Срок возврата</span>
          <span className="flex items-center gap-2">
            {debt.dueDate && (
              <span className="text-[13px] text-label-2">
                {relativeDayLabel(debt.dueDate)}
              </span>
            )}
            <input
              type="date"
              value={debt.dueDate ?? ""}
              onChange={(e) =>
                updateDebt(debt.id, { dueDate: e.target.value || undefined })
              }
              className="rounded-lg bg-black/[0.04] px-2.5 py-1.5 text-[14px] outline-none focus:ring-2 focus:ring-brand/40 dark:bg-white/[0.06] dark:text-slate-100"
            />
          </span>
        </Card>
      )}

      {/* Записать возврат */}
      {!settled && (
        <Card>
          <div className="mb-2 text-[13px] font-medium uppercase tracking-wide text-label-2">
            Записать возврат
          </div>
          <div className="flex gap-2">
            <input
              type="number"
              inputMode="decimal"
              min="0"
              value={payAmount}
              onChange={(e) => {
                if (payError) setPayError(false);
                setPayAmount(e.target.value);
              }}
              onWheel={(e) => e.currentTarget.blur()}
              placeholder={`до ${formatMoney(out)}`}
              className={`${fieldCls} flex-1`}
            />
            <button
              type="button"
              onClick={addPayment}
              className="shrink-0 rounded-xl bg-brand px-4 text-[15px] font-semibold text-white"
            >
              Внести
            </button>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {state.accounts.map((a) => (
              <button
                type="button"
                key={a.id}
                onClick={() => setPayAccount(a.id)}
                className={`rounded-full px-3 py-1.5 text-[13px] font-medium ${
                  payAccount === a.id
                    ? "bg-brand text-white"
                    : "bg-black/[0.06] text-slate-700 dark:bg-white/10 dark:text-slate-200"
                }`}
              >
                {a.name}
              </button>
            ))}
          </div>
          {payError && (
            <p className="mt-2 text-[13px] font-medium text-red-600 dark:text-red-400">
              Введите сумму возврата
            </p>
          )}
          <button
            type="button"
            onClick={() => settleDebt(debt.id, payAccount)}
            className="mt-3 w-full rounded-xl bg-emerald-50 py-2.5 text-[15px] font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
          >
            Погасить полностью ({formatMoney(out)})
          </button>
        </Card>
      )}

      {/* История возвратов */}
      {debt.payments.length > 0 && (
        <div>
          <div className="mb-1.5 px-1 text-[13px] font-medium uppercase tracking-wide text-label-2">
            Возвраты
          </div>
          <Card className="!p-0">
            {[...debt.payments]
              .sort((a, b) => (a.date < b.date ? 1 : -1))
              .map((p, i) => (
                <div
                  key={p.id}
                  className={`flex items-center justify-between px-4 py-3 text-[15px] ${
                    i > 0 ? "border-t border-[var(--separator)]" : ""
                  }`}
                >
                  <span className="text-label-2">
                    {formatDateShort(p.date)} · {accountName(p.accountId)}
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="font-medium text-emerald-600 dark:text-emerald-400">
                      +{formatMoney(p.amount)}
                    </span>
                    <button
                      type="button"
                      onClick={() => deleteDebtPayment(debt.id, p.id)}
                      aria-label="Удалить возврат"
                      className="text-label-3"
                    >
                      ✕
                    </button>
                  </span>
                </div>
              ))}
          </Card>
        </div>
      )}

      {/* Удалить долг */}
      <Card className="!p-0">
        <button
          type="button"
          onClick={() => {
            if (confirm("Удалить долг и его историю возвратов?")) {
              deleteDebt(debt.id);
              onClose();
            }
          }}
          className="w-full py-3.5 text-center text-[17px] font-medium text-red-600 dark:text-red-400"
        >
          Удалить долг
        </button>
      </Card>
    </div>
  );
}
