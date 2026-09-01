# Развёртывание на своём сервере

Сервер: `5.53.125.80` · Домен: `money.timur-ergashev.ru`
Стек: Docker + Caddy (автоматический HTTPS от Let's Encrypt).

## ⚠️ Сначала прочти про безопасность
У приложения **нет логина**, а ссылка синхронизации с Google-таблицей **зашита внутрь**.
Это значит: любой, кто откроет `money.timur-ergashev.ru`, увидит твои финансы.
**Перед тем как пользоваться публично — включи пароль** (шаг 5). Это обязательный шаг.

## 1. DNS
В панели домена создай A-запись:
```
money.timur-ergashev.ru  →  A  →  5.53.125.80
```
Дождись, пока `ping money.timur-ergashev.ru` отвечает с этого IP (5–30 мин).

## 2. Установить Docker (один раз)
```bash
ssh root@5.53.125.80
curl -fsSL https://get.docker.com | sh
```
Открой порты 80 и 443 (если есть firewall):
```bash
ufw allow 80 && ufw allow 443
```

## 3. Забрать код (один раз)
```bash
cd /opt
git clone <URL_РЕПОЗИТОРИЯ> money && cd money
git checkout claude/finance-tracker-app-yFyqN
```

## 4. Первый запуск
```bash
./deploy.sh
```
Caddy сам получит HTTPS-сертификат для домена. Через минуту открой
`https://money.timur-ergashev.ru`.

## 5. Включить пароль (обязательно)
Сгенерируй хэш пароля:
```bash
docker compose run --rm caddy caddy hash-password --plaintext 'ПРИДУМАЙ_ПАРОЛЬ'
```
Создай файл `caddy-conf.d/auth.caddy` (он **не в git** и переживёт обновления):
```bash
cat > caddy-conf.d/auth.caddy <<'EOF'
basicauth {
    timur $2a$14$....полученный_хэш....
}
EOF
docker compose restart caddy
```
Теперь сайт спросит логин/пароль (браузер запомнит). Менять пароль — заменить
файл и снова `docker compose restart caddy`.

## 6. Обновление версии — «одна кнопка»
Когда вышла новая версия кода:
```bash
./deploy.sh
```
Скрипт: `git pull` → пересборка → перезапуск. У уже открытых вкладок появится
плашка **«Доступна новая версия → Обновить»** (приложение само проверяет
`/version.json` каждые 5 минут и при возврате на вкладку).

## Полезное
- Логи: `docker compose logs -f app` · `docker compose logs -f caddy`
- Остановить: `docker compose down` · Перезапустить: `docker compose up -d`
- Данные хранятся в браузере (localStorage) и в твоей Google-таблице — на сервере
  ничего не хранится, бэкап не нужен.
- Если HTTPS не выдаётся — проверь, что DNS указывает на сервер и порты 80/443 открыты.
