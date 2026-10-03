/**
 * Финансовый трекер — Hub v2 (Apps Script).
 *
 * Отличия от v1:
 *  - Состояние JSON хранится в ФАЙЛЕ Google Drive (нет лимита 50 000 символов ячейки).
 *  - Каждый запрос (GET/POST) требует секретный ТОКЕН — иначе отклоняется.
 *  - Лист «Операции» по-прежнему ведётся как читаемая копия.
 *  - При чтении есть fallback на старую ячейку A1 (бесшовный переход без миграции).
 *  - Номер версии документа (hubRev, с 03.10.2026). Устройство присылает версию,
 *    на которой собирало отправку (baseRev). Если хаб за это время принял чужую
 *    запись, он отвечает conflict и ничего не пишет, устройство забирает свежее,
 *    сливает и отправляет снова. Так два телефона не затирают правки друг друга.
 *    Отправка без baseRev (приложение старой версии) принимается как раньше.
 *
 * Токен НЕ хранится в коде — он в Script properties (ключ SYNC_TOKEN).
 * Развёртывание — см. DEPLOY.md рядом с этим файлом.
 */

var DATA_SHEET = "Данные";            // легаси: A1 с JSON (только fallback/миграция)
var OPS_SHEET = "Операции";           // читаемая копия операций
var PROP_TOKEN = "SYNC_TOKEN";        // секрет (Project Settings → Script properties)
var PROP_FILE_ID = "STATE_FILE_ID";   // id Drive-файла с состоянием (ставится автоматически)
var STATE_FILENAME = "money-tracker-state.json";
var REV_FIELD = "hubRev";             // версия документа, её ставит только хаб
var BASE_FIELD = "baseRev";           // версия, на которой устройство собрало отправку

var TYPE_LABELS = {
  income: "Доход",
  expense_personal: "Расход — личное",
  expense_work: "Расход — рабочее",
  credit_loan: "Кредиты и займы",
  transfer: "Перевод",
};

function props_() {
  return PropertiesService.getScriptProperties();
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}

function parseJson_(raw, source) {
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(source + ": invalid JSON: " + String(err));
  }
}

// Проверка токена. Fail-closed: если токен не настроен — отклоняем всё.
function authorized_(e) {
  var want = props_().getProperty(PROP_TOKEN);
  if (!want) return false;
  var got = e && e.parameter ? e.parameter.token : "";
  return got === want;
}

// ===== Хранилище состояния в Drive =====
function stateFile_() {
  var id = props_().getProperty(PROP_FILE_ID);
  if (id) {
    try {
      return DriveApp.getFileById(id);
    } catch (err) {
      // файл удалён/недоступен — пересоздадим ниже
    }
  }
  var file = DriveApp.createFile(STATE_FILENAME, "{}", "application/json");
  props_().setProperty(PROP_FILE_ID, file.getId());
  return file;
}

function readState_() {
  // 1) пробуем Drive-файл
  var id = props_().getProperty(PROP_FILE_ID);
  if (id) {
    var content = "";
    try {
      content = DriveApp.getFileById(id)
        .getBlob()
        .getDataAsString("UTF-8");
    } catch (err) {
      throw new Error("Drive state read failed: " + String(err));
    }

    var trimmed = content ? content.trim() : "";
    if (trimmed && trimmed !== "{}") {
      return parseJson_(trimmed, "Drive state file");
    }
    // Пустой/новый Drive-файл — это ещё переходный режим, можно читать A1.
    // Ошибки чтения или битый JSON выше не маскируем fallback'ом, чтобы не
    // откатиться незаметно на устаревшие данные из legacy-ячейки.
  }

  // 2) fallback: легаси-ячейка A1 (на время перехода)
  try {
    var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(DATA_SHEET);
    var raw = sh ? sh.getRange("A1").getValue() : "";
    if (raw) return parseJson_(raw, DATA_SHEET + "!A1");
  } catch (err) {
    throw new Error("Legacy state read failed: " + String(err));
  }
  return null;
}

function writeState_(payload) {
  // setContent заменяет содержимое целиком (читатель видит старую либо новую версию).
  // Версия лежит в том же файле, что и данные, поэтому чтение всегда получает
  // пару «данные и их версия» без расхождения.
  stateFile_().setContent(JSON.stringify(payload));
}

// Версия документа. Документ, записанный хабом старого образца, считается нулевой.
function revOf_(state) {
  var rev = state ? state[REV_FIELD] : 0;
  return typeof rev === "number" && isFinite(rev) ? rev : 0;
}

// ===== HTTP =====

// GET — отдать сохранённые данные приложению вместе с их версией
function doGet(e) {
  if (!authorized_(e)) return jsonOut_({ ok: false, error: "unauthorized" });
  try {
    var state = readState_();
    if (!state) return jsonOut_({ empty: true, hubRev: 0 });
    state[REV_FIELD] = revOf_(state);
    return jsonOut_(state);
  } catch (err) {
    return jsonOut_({ ok: false, error: String(err) });
  }
}

// POST — сохранить данные приложения, если с момента его чтения никто не писал
function doPost(e) {
  if (!authorized_(e)) return jsonOut_({ ok: false, error: "unauthorized" });
  var lock = LockService.getScriptLock();
  var locked = false;
  try {
    lock.waitLock(20000);
    locked = true;

    var payload = parseJson_(e.postData.contents, "POST payload");
    // не сохраняем заведомо битый payload
    if (
      !payload ||
      !Array.isArray(payload.accounts) ||
      !Array.isArray(payload.operations)
    ) {
      return jsonOut_({ ok: false, error: "bad payload" });
    }
    var base = payload[BASE_FIELD];
    delete payload[BASE_FIELD];
    delete payload[REV_FIELD]; // версию ставит только хаб, даже если её прислали

    var current = revOf_(readState_());
    if (typeof base === "number" && base !== current) {
      // Устройство сливало свои правки со старой версией, а хаб за это время
      // принял чужую запись. Не затираем её: устройство заберёт свежее и повторит.
      return jsonOut_({ ok: false, error: "conflict", hubRev: current });
    }

    var next = current + 1;
    payload[REV_FIELD] = next;
    writeState_(payload);
    // Лист «Операции» только копия для глаз. Его сбой не должен превращать
    // уже сохранённые данные в отказ, иначе устройство повторяло бы запись зря.
    var warning = "";
    try {
      writeReadable_(payload);
    } catch (err) {
      warning = "readable copy: " + String(err);
    }
    return jsonOut_(warning ? { ok: true, hubRev: next, warning: warning } : { ok: true, hubRev: next });
  } catch (err) {
    return jsonOut_({ ok: false, error: String(err) });
  } finally {
    if (locked) lock.releaseLock();
  }
}

// ===== Разовая миграция (по желанию): A1 → Drive =====
// Запустить вручную из редактора (Run → migrateA1ToDrive) один раз.
// Если не запускать — hub при первом чтении возьмёт данные из A1 (fallback),
// а при первом сохранении из приложения запишет их уже в Drive-файл.
function migrateA1ToDrive() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(DATA_SHEET);
  var raw = sh ? sh.getRange("A1").getValue() : "";
  if (!raw) throw new Error("Ячейка A1 пустая — переносить нечего");
  var payload = parseJson_(raw, DATA_SHEET + "!A1"); // проверка валидности
  writeState_(payload);
  return "OK: перенесено " + JSON.stringify(payload).length + " символов в Drive";
}

// ===== Читаемая копия «Операции» =====
function writeReadable_(payload) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(OPS_SHEET);
  if (!sh) sh = ss.insertSheet(OPS_SHEET);
  sh.clear();

  var accNames = {};
  (payload.accounts || []).forEach(function (a) {
    accNames[a.id] = a.name;
  });

  var header = ["Дата", "Тип", "Категория", "Сумма", "Счёт", "Заметка", "Счёт-получатель"];
  var rows = [header];

  (payload.operations || [])
    .filter(function (o) {
      return !o.deleted;
    })
    .slice()
    .sort(function (a, b) {
      return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
    })
    .forEach(function (o) {
      rows.push([
        o.date,
        TYPE_LABELS[o.type] || o.type,
        o.category,
        o.amount,
        accNames[o.accountId] || o.accountId,
        o.note || "",
        o.type === "transfer" && o.toAccountId
          ? accNames[o.toAccountId] || o.toAccountId
          : "",
      ]);
    });

  sh.getRange(1, 1, rows.length, header.length).setValues(rows);
  sh.getRange(1, 1, 1, header.length).setFontWeight("bold");
  sh.setFrozenRows(1);
}
