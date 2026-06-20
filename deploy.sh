#!/usr/bin/env bash
# Одной командой: подтянуть свежий код, собрать и перезапустить.
# Запуск на сервере:  ./deploy.sh
set -euo pipefail
cd "$(dirname "$0")"

echo "→ Обновляю код (git pull)…"
git pull --ff-only 2>/dev/null || echo "  (git pull пропущен — origin недоступен, это нормально)"

# Читаемая версия сборки (дата + короткий git sha) — попадёт в приложение
export APP_VERSION="$(date +%F) · $(git rev-parse --short HEAD)"
echo "→ Версия: $APP_VERSION"

echo "→ Собираю и перезапускаю контейнеры…"
docker compose up -d --build

echo "→ Чищу старые образы…"
docker image prune -f >/dev/null 2>&1 || true

echo "✓ Готово. Открой https://money.timur-ergashev.ru"
echo "  (в приложении появится кнопка «Обновить» у уже открытых вкладок)"
