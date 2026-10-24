// Playwright の設定。ルートで npm test を実行すると tests/run.js 経由でこの設定が使われる。
"use strict";
const { defineConfig } = require("@playwright/test");

const PORT = Number(process.env.TEST_PORT || 4173);

module.exports = defineConfig({
  testDir: ".",
  testMatch: ["visual/**/*.spec.js", "health/**/*.spec.js", "unit/**/*.spec.js"],
  outputDir: "test-results",
  globalTeardown: "./support/global-teardown.js",
  // 基準画像は tests/visual/__screenshots__/ に置く(OS 名は付けない。CI も Linux で撮る前提)
  snapshotPathTemplate: "{testDir}/visual/__screenshots__/{arg}{ext}",
  timeout: 180_000,
  fullyParallel: true,
  workers: process.env.CI ? 2 : undefined,
  retries: 0,
  reporter: [
    ["list"],
    ["html", { outputFolder: "report", open: "never" }],
  ],
  expect: {
    toHaveScreenshot: {
      // しきい値は実測で決めた(docs/health-baseline-20261024.md の「しきい値の決め方」)。
      // 同じ main を繰り返し撮り直して差は 0 画素、見出し 1 文字の変更で 29〜37 画素、番号の色の変更で 113〜122 画素。
      // 画像の縦の長さで許容量が変わらないよう、割合ではなく画素数で決める。測り直すときは VT_MAX_DIFF_PIXELS=0 で実行する。
      maxDiffPixels: process.env.VT_MAX_DIFF_PIXELS !== undefined ? Number(process.env.VT_MAX_DIFF_PIXELS) : 20,
      threshold: 0.2, // 1 画素の色の差の許容(Playwright の既定値)
      animations: "disabled",
      caret: "hide",
      scale: "css",
    },
  },
  use: {
    baseURL: `http://127.0.0.1:${PORT}/`,
    browserName: "chromium",
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
    deviceScaleFactor: 1,
    trace: "off",
    screenshot: "off",
  },
  webServer: {
    command: `node support/server.js ${PORT}`,
    url: `http://127.0.0.1:${PORT}/index.html`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
