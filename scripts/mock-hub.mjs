// Локальный хаб для проверок синхронизации. Запускает настоящий
// apps-script/Code.gs в Node, сервисы Google подменены хранилищем в памяти.
// Так проверяется ровно тот код, который потом вставляется в Apps Script.
// Живой хаб для проверок не трогаем никогда.
//
// Запуск   node scripts/mock-hub.mjs [--port 8787] [--code путь/Code.gs] [--delay 0]
// Ссылка   http://127.0.0.1:8787/exec?token=test
// --delay  пауза перед каждой записью в мс, чтобы два устройства успели
//          прочитать одну версию и столкнуться на записи.
// GET /__state отдаёт сохранённый документ и лист «Операции» для проверки.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const TEST_TOKEN = "test";

function googleStubs({ failReadable }) {
  const props = new Map([["SYNC_TOKEN", TEST_TOKEN]]);
  const files = new Map();
  const sheets = new Map();
  let nextFileId = 1;

  const makeFile = (id, content) => {
    files.set(id, content);
    return {
      getId: () => id,
      getBlob: () => ({ getDataAsString: () => files.get(id) }),
      setContent: (s) => files.set(id, String(s)),
    };
  };
  const makeSheet = (name) => {
    const sheet = {
      rows: [],
      clear() {
        sheet.rows = [];
      },
      getRange(row, col, numRows) {
        return {
          getValue: () => (sheet.rows[row - 1] || [])[col - 1] ?? "",
          setValues(values) {
            if (failReadable) throw new Error("Service Spreadsheets failed");
            for (let i = 0; i < (numRows ?? values.length); i++) sheet.rows[row - 1 + i] = values[i];
          },
          setFontWeight() {},
        };
      },
      setFrozenRows() {},
    };
    sheets.set(name, sheet);
    return sheet;
  };

  return {
    files,
    sheets,
    props,
    globals: {
      PropertiesService: {
        getScriptProperties: () => ({
          getProperty: (k) => (props.has(k) ? props.get(k) : null),
          setProperty: (k, v) => props.set(k, String(v)),
        }),
      },
      DriveApp: {
        getFileById(id) {
          if (!files.has(id)) throw new Error("No item with the given ID could be found");
          return makeFile(id, files.get(id));
        },
        createFile(_name, content) {
          return makeFile(`file-${nextFileId++}`, content);
        },
      },
      SpreadsheetApp: {
        getActiveSpreadsheet: () => ({
          getSheetByName: (name) => sheets.get(name) ?? null,
          insertSheet: (name) => makeSheet(name),
        }),
      },
      LockService: {
        // Каждый запрос исполняется целиком, без переключений, так что
        // блокировка в подмене не нужна: порядок записей задаёт очередь Node.
        getScriptLock: () => ({ waitLock() {}, releaseLock() {} }),
      },
      ContentService: {
        MimeType: { JSON: "application/json" },
        createTextOutput: (content) => ({ content, setMimeType() { return this; } }),
      },
    },
  };
}

// Хаб в памяти, без сети. Удобен в тестах и как основа HTTP-сервера ниже.
/** @param {{ codePath?: string, failReadable?: boolean }} [options] */
export function createHub({ codePath = path.join(here, "../apps-script/Code.gs"), failReadable = false } = {}) {
  const stubs = googleStubs({ failReadable });
  const context = vm.createContext({ ...stubs.globals });
  vm.runInContext(fs.readFileSync(codePath, "utf8"), context, { filename: codePath });
  const call = (fn, e) => JSON.parse(context[fn](e).content);
  return {
    get: (token = TEST_TOKEN) => call("doGet", { parameter: { token } }),
    post: (body, token = TEST_TOKEN) =>
      call("doPost", { parameter: { token }, postData: { contents: typeof body === "string" ? body : JSON.stringify(body) } }),
    // Что лежит в файле Drive и на листе «Операции»
    stored() {
      const id = stubs.props.get("STATE_FILE_ID");
      const raw = id ? stubs.files.get(id) : null;
      return { state: raw ? JSON.parse(raw) : null, readable: stubs.sheets.get("Операции")?.rows ?? [] };
    },
  };
}

// HTTP-обёртка с теми же ответами, что у Apps Script. Порт 0 значит любой свободный.
/** @param {{ port?: number, codePath?: string, postDelayMs?: number, failReadable?: boolean, log?: boolean }} [options] */
export function startHub({ port = 8787, codePath, postDelayMs = 0, failReadable = false, log = false } = {}) {
  const hub = createHub({ codePath, failReadable });
  const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type" };
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    const token = url.searchParams.get("token") ?? "";
    const send = (obj, status = 200) => {
      res.writeHead(status, { "Content-Type": "application/json", ...cors });
      res.end(JSON.stringify(obj));
    };
    if (req.method === "OPTIONS") {
      res.writeHead(204, cors);
      return res.end();
    }
    if (url.pathname === "/__state") return send(hub.stored());
    if (url.pathname !== "/exec") return send({ error: "not found" }, 404);
    if (req.method === "GET") {
      const out = hub.get(token);
      if (log) console.log(`GET  → версия ${out.hubRev ?? "?"}`);
      return send(out);
    }
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () =>
      setTimeout(() => {
        const out = hub.post(body, token);
        if (log) {
          let base = "нет";
          try {
            base = JSON.parse(body).baseRev ?? "нет";
          } catch {}
          console.log(`POST на версии ${base} → ${out.ok ? `записано, версия ${out.hubRev}` : out.error}`);
        }
        send(out);
      }, postDelayMs)
    );
  });
  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () => {
      const actual = server.address().port;
      resolve({ hub, server, url: `http://127.0.0.1:${actual}/exec?token=${TEST_TOKEN}`, close: () => server.close() });
    });
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = (name, fallback) => {
    const i = process.argv.indexOf(name);
    return i > -1 ? process.argv[i + 1] : fallback;
  };
  // Без await верхнего уровня: тесты подключают этот файл через tsx как CommonJS
  startHub({
    port: Number(arg("--port", 8787)),
    codePath: arg("--code", undefined),
    postDelayMs: Number(arg("--delay", 0)),
    log: true,
  }).then((started) => console.log(`Мок-хаб слушает ${started.url}`));
}
