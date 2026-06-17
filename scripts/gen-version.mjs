// Генерирует версию сборки в два места с одинаковым значением:
//  - public/version.json — отдаётся статикой, клиент опрашивает её;
//  - lib/buildVersion.ts — попадает в бандл, это версия текущего клиента.
// Клиент сравнивает их и предлагает обновиться при расхождении.
import { writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

let sha = "";
try {
  sha = execSync("git rev-parse --short HEAD", {
    stdio: ["ignore", "pipe", "ignore"],
  })
    .toString()
    .trim();
} catch {
  // не git-репозиторий — пропускаем
}

const date = new Date().toISOString().slice(0, 16).replace("T", " ");
const version = sha ? `${date} · ${sha}` : String(Date.now());

writeFileSync("public/version.json", JSON.stringify({ version }) + "\n");
writeFileSync(
  "lib/buildVersion.ts",
  `// Генерируется scripts/gen-version.mjs при сборке — не редактировать вручную.\nexport const BUILD_VERSION = ${JSON.stringify(
    version
  )};\n`
);

console.log("build version:", version);
