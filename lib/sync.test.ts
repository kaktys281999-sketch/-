// Тесты хаба и одновременной записи. Запуск: npm test
// Хаб настоящий (apps-script/Code.gs) в Node, общение по HTTP теми же pull и push,
// что в приложении. Живой хаб не трогается.
import { AppState, Operation } from "./types";
import { pull, push, toPayload, fromPayload, mergeStates, HubConflictError } from "./sync";
import { startHub, createHub } from "../scripts/mock-hub.mjs";

let passed = 0;
let failed = 0;
function eq(actual: unknown, expected: unknown, name: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    passed++;
  } else {
    failed++;
    console.error(`✗ ${name}\n   ожидалось ${e}\n   получено  ${a}`);
  }
}

function op(id: string, p: Partial<Operation> = {}): Operation {
  return {
    id,
    date: "2026-10-03",
    type: "expense_personal",
    category: "Продукты / еда / вода",
    amount: 100,
    accountId: "sber",
    note: "",
    updatedAt: 1,
    ...p,
  };
}
function device(ops: Operation[]): AppState {
  return {
    accounts: [
      { id: "sber", name: "Сбербанк", baseBalance: 0 },
      { id: "cash", name: "Наличные", baseBalance: 0 },
    ],
    operations: ops,
    credits: [],
    goal: { name: "", target: 0, saved: 0 },
    debts: [],
    updatedAt: 1,
  };
}
const ids = (s: AppState | null | undefined) => (s?.operations ?? []).map((o) => o.id).sort();
async function failure(f: () => Promise<unknown>): Promise<unknown> {
  try {
    await f();
    return null;
  } catch (e) {
    return e;
  }
}

async function main() {
  // ---- Хаб в памяти: версия документа ----
  {
    const hub = createHub();
    eq(hub.get(), { empty: true, hubRev: 0 }, "пустой хаб отдаёт версию 0");
    eq(hub.get("wrong"), { ok: false, error: "unauthorized" }, "без токена отказ, как раньше");
    eq(hub.post(toPayload(device([op("a")]))), { ok: true, hubRev: 1 }, "запись без версии (старое приложение) принимается");
    eq(hub.post({ ...toPayload(device([op("b")])), baseRev: 1 }), { ok: true, hubRev: 2 }, "запись на свежей версии принимается");
    eq(hub.post({ ...toPayload(device([op("c")])), baseRev: 1 }), { ok: false, error: "conflict", hubRev: 2 },
      "запись на устаревшей версии отклоняется");
    eq(ids(hub.stored().state), ["b"], "отклонённая запись ничего не изменила");
    eq(hub.post({ ...toPayload(device([op("d")])), baseRev: 2, hubRev: 99 }), { ok: true, hubRev: 3 },
      "присланную версию хаб не берёт, ставит свою");
    const stored = hub.stored().state;
    eq([stored.hubRev, "baseRev" in stored], [3, false], "в файле своя версия и нет служебного поля отправки");
    eq(hub.get().hubRev, 3, "чтение отдаёт данные вместе с версией");
    eq(hub.post("{\"accounts\":1}").error, "bad payload", "битый документ не сохраняется");
  }

  // ---- Лист «Операции»: перевод с получателем, сбой листа не роняет запись ----
  {
    const hub = createHub();
    const transfer = op("t", { type: "transfer", category: "", amount: 3000, accountId: "cash", toAccountId: "sber" });
    hub.post(toPayload(device([transfer])));
    const [header, row] = hub.stored().readable;
    eq([header[6], row[1], row[4], row[6]], ["Счёт-получатель", "Перевод", "Наличные", "Сбербанк"],
      "в копии для глаз перевод подписан и виден получатель");
    const broken = createHub({ failReadable: true });
    const res = broken.post(toPayload(device([op("x")])));
    eq([res.ok, res.hubRev, typeof res.warning], [true, 1, "string"], "сбой листа не превращает сохранённое в отказ");
    eq(ids(broken.stored().state), ["x"], "данные при сбое листа сохранены");
  }

  // ---- Два телефона по HTTP: оба прочитали одну версию, пишут по очереди ----
  const live = await startHub({ port: 0 });
  try {
    const phoneA = device([op("a1")]);
    const phoneB = device([op("b1")]);
    const readA = await pull(live.url);
    const readB = await pull(live.url);
    eq([readA.rev, readB.rev], [0, 0], "оба прочитали версию 0");
    await push(live.url, toPayload(phoneA), readA.rev);
    const late = await failure(() => push(live.url, toPayload(phoneB), readB.rev));
    eq(late instanceof HubConflictError, true, "второй телефон получает отказ, а не затирает первый");
    eq(ids(live.hub.stored().state), ["a1"], "правка первого телефона в хабе цела");

    // Второй телефон делает то же, что раунд приложения: заново читает и сливает
    const again = await pull(live.url);
    const merged = mergeStates(phoneB, fromPayload(again.payload!));
    await push(live.url, toPayload(merged), again.rev);
    eq(ids(live.hub.stored().state), ["a1", "b1"], "после повтора в хабе обе правки");
    eq(live.hub.stored().state.hubRev, 2, "две записи, версия 2");

    // Удаление на одном телефоне и правка на другом тоже сходятся
    const r1 = await pull(live.url);
    const r2 = await pull(live.url);
    const deleted = mergeStates(fromPayload(r1.payload!), device([op("a1", { deleted: true, updatedAt: 5 })]));
    await push(live.url, toPayload(deleted), r1.rev);
    const edited = mergeStates(fromPayload(r2.payload!), device([op("c1", { updatedAt: 6 })]));
    eq((await failure(() => push(live.url, toPayload(edited), r2.rev))) instanceof HubConflictError, true,
      "вторая запись снова отклонена");
    const r3 = await pull(live.url);
    await push(live.url, toPayload(mergeStates(edited, fromPayload(r3.payload!))), r3.rev);
    const final = fromPayload(live.hub.stored().state);
    eq([ids(final), final.operations.find((o) => o.id === "a1")?.deleted], [["a1", "b1", "c1"], true],
      "удаление с первого телефона не воскресло, новая запись второго на месте");

    eq(String(await failure(() => pull(live.url.replace("token=test", "token=bad")))).includes("токен"), true,
      "неверный токен по-прежнему понятная ошибка");
  } finally {
    live.close();
  }

  console.log(`\n${passed} проверок хаба пройдено, ${failed} провалено.`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
