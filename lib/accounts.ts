import { Account } from "./types";

// Цвет-метка счёта по id. Фирменные цвета банков, нейтральный для остальных.
const ACCOUNT_COLORS: Record<string, string> = {
  yandex: "#FC3F1D",
  sber: "#21A038",
  tinkoff: "#FFDD2D",
  cash: "#34C759",
  alfa: "#EF3124",
  "alfa-business": "#B5121B",
};

export function accountColor(id: string): string {
  return ACCOUNT_COLORS[id] ?? "#94a3b8";
}

// Счета Альфа-Банка: дебетовая карта и отдельный расчётный счёт. Заведены по
// просьбе владельца 01.10.2026, оба обычные (входят в «На руках»), остаток 0,
// владелец выставит его сам.
// Id постоянные, поэтому два устройства заведут ОДНИ И ТЕ ЖЕ счета, и слияние
// их не задвоит. updatedAt нет намеренно: если на другом устройстве счёт уже
// удалили, надгробие при слиянии окажется новее и победит.
// Удалённый счёт не возвращаем, уже заведённый вручную под тем же именем не
// дублируем. Запускается один раз на устройстве и только после первой удачной
// синхронизации (см. store.tsx), чтобы видеть удаления и имена из таблицы.
const ALFA_ACCOUNTS: Account[] = [
  { id: "alfa", name: "Альфа-Банк", baseBalance: 0 },
  { id: "alfa-business", name: "Альфа расчётный счёт", baseBalance: 0 },
];

export function ensureAlfaAccounts(
  accounts: Account[],
  deletedAccountIds: Record<string, number> = {}
): Account[] {
  // «Альфа-Банк», «альфа банк», «Альфа  Банк» — одно и то же имя
  const norm = (n: string) =>
    n.trim().toLowerCase().replace(/ё/g, "е").replace(/[-\s]+/g, " ");
  const missing = ALFA_ACCOUNTS.filter(
    (acc) =>
      !deletedAccountIds[acc.id] &&
      !accounts.some((a) => a.id === acc.id || norm(a.name) === norm(acc.name))
  );
  return missing.length ? [...accounts, ...missing] : accounts;
}
