# Контекст проекта (для новой сессии)

## Что это
Личный финансовый трекер — **PWA на Next.js 14 (App Router) + TypeScript + Tailwind**,
эстетика iOS/Apple, бренд-цвет `#6926E3`, тёмная тема. Данные хранятся в браузере
(localStorage) и синхронизируются с **Google-таблицей** через Apps Script
(ссылка зашита в `lib/sync.ts`, `DEFAULT_SYNC_URL`). **Бэкенда и базы данных нет.**

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
- `lib/calc.test.ts` — тесты (запуск `npm test`, сейчас 71 проверка).

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
- **Не удалять счета** (осиротит операции). Переименование безопасно.
- **Миграции данных** — аддитивные, с флагами против повторного применения
  (примеры в `loadState`: `seededTransportTpl`, `busDefaultApplied`, `ensureCashAccount`).
  Новые поля состояния добавлять и в `lib/sync.ts` (payload + merge).

## Важно про безопасность
У приложения **нет аутентификации**, а ссылка синхронизации зашита внутрь.
Любой, кто откроет публичный адрес, увидит финансы. При публичном хостинге
**обязательно** закрывать доступ паролем (basicauth на прокси — см. деплой).

## Развёртывание
Self-hosting через Docker + Caddy. Файлы: `Dockerfile`, `docker-compose.yml`,
`Caddyfile`, `caddy-conf.d/`, `deploy.sh`, `DEPLOY.md`. Подробный автономный
сценарий — в `docs/DEPLOY_RUNBOOK.md`.
- Сервер: `5.53.125.80` · Домен: `money.timur-ergashev.ru`.
- Обновление одной командой на сервере: `./deploy.sh`.
- В приложении встроен детектор новой версии (плашка «Обновить»).
