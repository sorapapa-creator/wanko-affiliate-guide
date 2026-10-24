// npm test の入口。依存(tests/node_modules)がなければ入れてから、Playwright で全テストを実行する。
//   npm test                     … スクショ比較・健全性テスト・単体テストを全部
//   npm test -- health           … tests/health だけ(Playwright の引数をそのまま渡せる)
//   npm run test:update          … 基準画像と基準値(tests/health/baseline.json)を今の状態で作り直す
// 結果: tests/report/index.html(Playwright のレポート)と tests/report/health-summary.html(見つかった問題の一覧)
"use strict";
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const DIR = __dirname;
const args = process.argv.slice(2);
const update = args.includes("--update");
const pwArgs = args.filter((a) => a !== "--update");
if (update) pwArgs.push("--update-snapshots");

if (!fs.existsSync(path.join(DIR, "node_modules", "@playwright", "test"))) {
  console.log("tests/node_modules がないので npm ci を実行します");
  const r = spawnSync("npm", ["ci", "--no-audit", "--no-fund"], { cwd: DIR, stdio: "inherit", shell: process.platform === "win32" });
  if (r.status !== 0) process.exit(r.status || 1);
}

const env = { ...process.env };
if (update) env.UPDATE_HEALTH_BASELINE = "1";
const started = Date.now();
const r = spawnSync(process.execPath, [path.join(DIR, "node_modules", "@playwright", "test", "cli.js"), "test", "-c", "playwright.config.js", ...pwArgs], { cwd: DIR, stdio: "inherit", env });

require("./health/summary").write({ seconds: Math.round((Date.now() - started) / 1000) });
console.log(`\nレポート: tests/report/index.html / 見つかった問題の一覧: tests/report/health-summary.html(${Math.round((Date.now() - started) / 1000)} 秒)`);
process.exit(r.status === null ? 1 : r.status);
