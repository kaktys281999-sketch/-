# Runbook: автономный деплой на свой сервер

Этот документ — пошаговый сценарий для агента, у которого **есть SSH-доступ**
к серверу. Все команды идемпотентны (безопасно перезапускать). После каждого
шага есть проверка. Если шаг не прошёл — см. «Диагностику» внизу, не идти дальше.

- Сервер: `5.53.125.80` (пользователь `root`)
- Домен: `money.timur-ergashev.ru`
- Репозиторий: GitHub `kaktys281999-sketch/-`, ветка `claude/finance-tracker-app-yFyqN`
- Каталог на сервере: `/opt/money`

## 0. Что нужно от пользователя (спросить ДО старта, если не задано)
1. **Способ SSH**: ключ уже настроен? Если нет — попросить добавить твой публичный
   ключ или дать доступ. Проверка: `ssh root@5.53.125.80 'echo ok'` → `ok`.
2. **Пароль для входа в приложение** (basicauth). Если не дали — предложить
   сгенерировать и показать пользователю. Без пароля сайт публично НЕ открывать.
3. **DNS**: A-запись `money.timur-ergashev.ru → 5.53.125.80` должна существовать
   (нужно для выпуска HTTPS). Проверка ниже.
4. **Доступ к репозиторию с сервера**: публичный ли репозиторий или нужен токен?
   Если приватный без токена — использовать вариант B (rsync) в шаге 3.

## 1. Предусловия
```bash
ssh root@5.53.125.80 'echo ok'                 # → ok
getent hosts money.timur-ergashev.ru || true   # должен резолвиться в 5.53.125.80
```
Если домен не указывает на сервер — HTTPS не выпустится. Сообщить пользователю,
дождаться настройки DNS (TTL до ~30 мин), затем продолжить.

## 2. Docker (установить, если нет) и порты
```bash
ssh root@5.53.125.80 'command -v docker >/dev/null || curl -fsSL https://get.docker.com | sh'
ssh root@5.53.125.80 'docker compose version'  # плагин compose должен быть
ssh root@5.53.125.80 'command -v ufw >/dev/null && (ufw allow 80; ufw allow 443) || true'
```
Проверка: `docker --version` и `docker compose version` отвечают.

## 3. Код на сервере
**Вариант A — git (репозиторий доступен с сервера):**
```bash
ssh root@5.53.125.80 'set -e; mkdir -p /opt; cd /opt; \
  if [ -d money/.git ]; then cd money && git fetch && git checkout claude/finance-tracker-app-yFyqN && git pull --ff-only; \
  else git clone https://github.com/kaktys281999-sketch/-.git money && cd money && git checkout claude/finance-tracker-app-yFyqN; fi'
```
Если репозиторий приватный — подставить токен в URL
(`https://<TOKEN>@github.com/...`) или использовать вариант B.

**Вариант B — rsync из локального чекаута (если git недоступен с сервера):**
```bash
rsync -az --delete \
  --exclude node_modules --exclude .next --exclude .git \
  ./ root@5.53.125.80:/opt/money/
```
(локальный чекаут должен быть на нужной ветке)

Проверка: `ssh root@5.53.125.80 'ls /opt/money/deploy.sh'` существует.

## 4. Первый запуск
```bash
ssh root@5.53.125.80 'cd /opt/money && ./deploy.sh'
```
`deploy.sh` сделает: git pull (или пропустит в варианте B — тогда запусти
вручную `export APP_VERSION="$(date +%F) manual"; docker compose up -d --build`),
сборку образа и запуск `app` + `caddy`. Caddy сам получит HTTPS-сертификат.

Проверки (подожди ~1 минуту после первого старта):
```bash
ssh root@5.53.125.80 'docker compose -f /opt/money/docker-compose.yml ps'      # оба healthy/Up
ssh root@5.53.125.80 'docker compose -f /opt/money/docker-compose.yml logs --tail=30 caddy'  # «certificate obtained»
curl -sS -o /dev/null -w "%{http_code}\n" https://money.timur-ergashev.ru/      # 200 (или 401 если пароль уже включён)
curl -sS https://money.timur-ergashev.ru/version.json                           # {"version":"..."}
```

## 5. Включить пароль (ОБЯЗАТЕЛЬНО перед публичным доступом)
```bash
# 1) получить хэш (заменить ПАРОЛЬ; либо взять пароль у пользователя)
ssh root@5.53.125.80 'cd /opt/money && docker compose run --rm caddy caddy hash-password --plaintext "ПАРОЛЬ"'
# 2) положить логин+хэш в gitignored-файл (переживает git pull)
ssh root@5.53.125.80 'cat > /opt/money/caddy-conf.d/auth.caddy <<EOF
basicauth {
    timur ВСТАВИТЬ_ХЭШ
}
EOF'
# 3) перезагрузить прокси
ssh root@5.53.125.80 'cd /opt/money && docker compose restart caddy'
```
Проверка: `curl -sS -o /dev/null -w "%{http_code}\n" https://money.timur-ergashev.ru/`
→ **401**; с логином/паролем → **200**:
```bash
curl -sS -u timur:ПАРОЛЬ -o /dev/null -w "%{http_code}\n" https://money.timur-ergashev.ru/
```
Сообщить пользователю логин и пароль (пароль — не коммитить никуда).

## 6. Проверить обновление версии
```bash
# повторный деплой меняет версию (дата+sha) → у открытых вкладок появится «Обновить»
ssh root@5.53.125.80 'cd /opt/money && ./deploy.sh'
curl -sS -u timur:ПАРОЛЬ https://money.timur-ergashev.ru/version.json   # версия изменилась
```

## 7. Готово — критерии
- [ ] `https://money.timur-ergashev.ru` открывается по HTTPS (валидный сертификат).
- [ ] Доступ закрыт паролем (401 без логина).
- [ ] `/version.json` отдаётся; повторный `./deploy.sh` меняет версию.
- [ ] Пользователю переданы логин/пароль и команда обновления `./deploy.sh`.

## Диагностика
- **HTTPS не выдаётся / 526 / нет сертификата:** DNS не указывает на сервер, или
  порты 80/443 закрыты/заняты. Проверь `getent hosts`, `ufw status`,
  `ss -tlnp | grep -E ':80|:443'`, логи caddy.
- **`docker compose` не найден:** старый Docker — поставить плагин compose
  (`apt-get install docker-compose-plugin`) или переустановить через get.docker.com.
- **Сборка падает на `npm ci`:** проверь, что скопирован `package-lock.json`;
  при rsync не исключай его.
- **`git pull` ругается на локальные изменения:** на сервере не редактируй
  отслеживаемые файлы; секрет — только в `caddy-conf.d/auth.caddy` (gitignored).
- **502 от Caddy:** контейнер `app` не поднялся — `docker compose logs app`.
- **Откат:** `cd /opt/money && git checkout <предыдущий_коммит> && ./deploy.sh`.

## Не делать
- Не открывать сайт публично без пароля (шаг 5).
- Не коммитить пароль/хэш/токены в репозиторий.
- Не редактировать на сервере файлы, отслеживаемые git (сломает `git pull`).
