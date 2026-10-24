// 既存の単体テスト(tests/vacancy-logic.test.js、空室逆算プランの判定)を npm test にまとめて実行する
"use strict";
const { test, expect } = require("@playwright/test");
const { spawnSync } = require("node:child_process");
const path = require("node:path");

test("空室逆算プランの判定(tests/vacancy-logic.test.js)", async () => {
  const r = spawnSync(process.execPath, [path.join(__dirname, "..", "vacancy-logic.test.js")], { encoding: "utf8" });
  await test.info().attach("出力", { body: r.stdout + r.stderr, contentType: "text/plain" });
  expect(r.status, r.stdout.split("\n").filter((l) => l.startsWith("not ok") || l.startsWith("  ")).join("\n")).toBe(0);
});
