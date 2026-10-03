# Контекст проекта (для новой сессии)

## Что это
Личный финансовый трекер — **PWA на Next.js 15 (App Router, React 19) + TypeScript + Tailwind**,
эстетика iOS/Apple, бренд-цвет `#6926E3`, тёмная тема. Данные хранятся в браузере
(localStorage) и синхронизируются с **хабом v2** — Google Apps Script с токеном
(`apps-script/Code.gs`). Ссылка с `?token=` вводится на каждом устройстве в
Настройках, в коде ссылки нет (`DEFAULT_SYNC_URL = ""`). **Бэкенда и базы данных нет.**

Синхронизация (`lib/store.tsx`, `runRound`): забрать хаб → `mergeStates` →
применить → отправить итог. Раунды идут по одному, плюс при возврате в
приложение, при появлении сети, повтор через 30 с после ошибки. Соседние
вкладки сливаются через событие `storage`. «Просто отправить своё» больше нет.

## Где что
- `app/` — layout, главная страница `page.tsx` (вкладки: Сводка, Добавить,
  Операции, Долги, Кредиты, Подписки, Настройки).
- `components/` — UI каждой вкладки и общие (`ui.tsx`, `Summary.tsx`, `Operations.tsx`,
  `Debts.tsx`, `Credits.tsx`, `Subscriptions.tsx`, `Settings.tsx`, …).
- `lib/calc.ts` — **вся денежная логика, чистые функции** (балансы, кредиты, долги,
  подписки, бюджеты, статистика). Реэкспортируется из `lib/store.tsx`.
- `lib/store.tsx` — React-стор (состояние, действия, миграции `loadState`).
- `lib/sync.ts` — формат синхронизации и слияние (`mergeStates`).
- `lib/types.ts` — модель данных (`AppState`, `Operation`, `Debt`, `Credit`,
  `RecurringRule`, `Account`, …).
- `lib/calc.test.ts` — тесты (запуск `npm test`, сейчас 168 проверок).
- `lib/draft.ts` — черновик формы операции и её «память» (`freshDraft`).
- `lib/accounts.ts` — цвета счетов и миграция счетов Альфа-Банка.

## Команды
- `npm run dev` — разработка · `npm run build` — прод-сборка (standalone) ·
  `npm start` — запуск · `npm test` — тесты (tsx) · `npm run lint`.
- Сборка генерирует версию: `scripts/gen-version.mjs` → `public/version.json` и
  `lib/buildVersion.ts` (оба в .gitignore).

## Рабочие правила (соблюдать)
- **Самопроверка в конце каждой задачи:** `npm run build` + `npm test` + рантайм
  (`npm start` и `curl` локально) + перечитать дифф. Денежную логику крыть тестами
  в `lib/calc.test.ts`.
- **Ветка разработки:** `claude/finance-tracker-app-yFyqN`. Коммитить и пушить туда.
- **Удаление счёта** переносит его операции и остаток на основной счёт
  (`deleteAccount`). Переименование безопасно.
- **Миграции данных** — аддитивные, с флагами против повторного применения
  (примеры в `loadState`: `seededTransportTpl`, `busDefaultApplied`, `ensureCashAccount`).
  Новые поля состояния добавлять и в `lib/sync.ts` (payload + merge).

## Важно про безопасность
У самого приложения нет аутентификации. На боевом сервере его закрывает
PIN-шлюз nginx (страница `/lock`, cookie `money_gate`), а данные хаба — токен.
Токен живёт только в localStorage устройства и в `/etc/money-backup.env` на
сервере, не в коде и не в git.

## Развёртывание
Боевой вариант: общий сервер, **внешний nginx** (не Caddy) проксирует
`money.timur-ergashev.ru` на `127.0.0.1:3000`; `docker-compose.override.yml`
на сервере (не в git) отключает Caddy и публикует app только на localhost.
Обновление: на сервере в `/opt/money` — `./deploy.sh` (git pull + пересборка).
Ночной бэкап хаба: cron `/opt/money-backups/backup.sh`.
PIN-шлюз: страница `/lock` присылает sha256(PIN|соль) на `/unlock`, nginx
сверяет его с ограничением частоты и выдаёт случайную HttpOnly-cookie. PIN из
6 цифр; сменить его владелец может сам: `ssh -t root@5.53.125.80 money-set-pin`
(PIN вводится в терминале и нигде не сохраняется).
Перед выкаткой обязательно `npx tsc --noEmit --incremental false`: тесты (tsx)
типы не проверяют, а `next build` на ошибке типов падает.
Файлы Caddy и `docs/DEPLOY_RUNBOOK.md` описывают первоначальный вариант с
basicauth и сейчас не используются.
- Сервер: `5.53.125.80` · Домен: `money.timur-ergashev.ru`.
- Обновление одной командой на сервере: `./deploy.sh`.
- В приложении встроен детектор новой версии (плашка «Обновить»).
