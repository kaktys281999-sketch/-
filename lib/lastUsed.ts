import { OpType } from "./types";

// Последний использованный набор «тип/категория/счёт» — чтобы форма
// подставляла привычное. Хранится только на устройстве (не синхронизируется).
export interface LastUsed {
  type: OpType;
  category: string;
  accountId: string;
}

const KEY = "finance-last-add-v1";

export function getLastUsed(): LastUsed | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as LastUsed) : null;
  } catch {
    return null;
  }
}

export function setLastUsed(v: LastUsed): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(v));
  } catch {
    // игнорируем (например, приватный режим)
  }
}
