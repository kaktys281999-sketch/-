/**
 * Google Apps Script для финансового трекера.
 *
 * Превращает Google-таблицу в хранилище данных приложения.
 * Привяжите этот скрипт к таблице (Расширения → Apps Script),
 * вставьте код, затем Деплой → Новый деплой → тип «Веб-приложение»:
 *   - Execute as / Запуск от имени: Me (от своего имени)
 *   - Who has access / Доступ: Anyone (Все, даже анонимные)
 * Скопируйте URL вида .../exec и вставьте его в приложении
 * (Настройки → Синхронизация).
 *
 * Лист «Данные», ячейка A1 — источник правды (JSON).
 * Лист «Операции» — читаемая копия для просмотра/аналитики (перезаписывается).
 */

var DATA_SHEET = "Данные";
var OPS_SHEET = "Операции";

var TYPE_LABELS = {
  income: "Доход",
  expense_personal: "Расход — личное",
  expense_work: "Расход — рабочее",
  credit_loan: "Кредиты и займы",
};

function getDataSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(DATA_SHEET);
  if (!sh) sh = ss.insertSheet(DATA_SHEET);
  return sh;
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}

// GET — отдать сохранённые данные приложению
function doGet() {
  var sh = getDataSheet_();
  var raw = sh.getRange("A1").getValue();
  if (!raw) return jsonOut_({ empty: true });
  try {
    return jsonOut_(JSON.parse(raw));
  } catch (e) {
    return jsonOut_({ empty: true });
  }
}

// POST — сохранить данные из приложения
function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var payload = JSON.parse(e.postData.contents);
    var sh = getDataSheet_();
    sh.getRange("A1").setValue(JSON.stringify(payload));
    writeReadable_(payload);
    return jsonOut_({ ok: true });
  } catch (err) {
    return jsonOut_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

// Перезаписать читаемый лист «Операции»
function writeReadable_(payload) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(OPS_SHEET);
  if (!sh) sh = ss.insertSheet(OPS_SHEET);
  sh.clear();

  var accNames = {};
  (payload.accounts || []).forEach(function (a) {
    accNames[a.id] = a.name;
  });

  var header = ["Дата", "Тип", "Категория", "Сумма", "Счёт", "Заметка"];
  var rows = [header];

  var ops = (payload.operations || [])
    .filter(function (o) {
      return !o.deleted; // не показываем удалённые (надгробия)
    })
    .slice()
    .sort(function (a, b) {
      return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
    });
  ops.forEach(function (o) {
    rows.push([
      o.date,
      TYPE_LABELS[o.type] || o.type,
      o.category,
      o.amount,
      accNames[o.accountId] || o.accountId,
      o.note || "",
    ]);
  });

  sh.getRange(1, 1, rows.length, header.length).setValues(rows);
  sh.getRange(1, 1, 1, header.length).setFontWeight("bold");
  sh.setFrozenRows(1);
}
