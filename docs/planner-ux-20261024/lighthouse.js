// Lighthouse(モバイル・既定の設定)を旅行プラン画面に 3 回かけ、性能は中央値で記録する。
// 実行: NODE_PATH=<lighthouse と chrome-launcher を入れた node_modules> CHROME_PATH=<chrome> node docs/planner-ux-20261024/lighthouse.js before|after
// 外部(広告・解析)はこの計測環境では届かないため、前後とも同じ条件での比較として使う。
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const H = require("../../tests/helpers/planner-harness.js");

(async () => {
  const label = process.argv[2] || "before";
  const lighthouse = (await import(require.resolve("lighthouse"))).default;
  const chromeLauncher = require("chrome-launcher");
  const srv = await H.startServer();
  const url = `${srv.url}/route-planner/`;
  const runs = [];
  for (let i = 0; i < 3; i++) {
    const chrome = await chromeLauncher.launch({ chromePath: process.env.CHROME_PATH, chromeFlags: ["--headless=new", "--no-sandbox", "--disable-gpu"] });
    const r = await lighthouse(url, { port: chrome.port, output: "json", logLevel: "error", onlyCategories: ["performance", "accessibility", "best-practices", "seo"] });
    const lhr = r.lhr; const a = lhr.audits;
    runs.push({
      performance: Math.round(lhr.categories.performance.score * 100), accessibility: Math.round(lhr.categories.accessibility.score * 100),
      bestPractices: Math.round(lhr.categories["best-practices"].score * 100), seo: Math.round(lhr.categories.seo.score * 100),
      fcp: a["first-contentful-paint"].displayValue, lcp: a["largest-contentful-paint"].displayValue, tbt: a["total-blocking-time"].displayValue, cls: a["cumulative-layout-shift"].displayValue,
      a11yFailed: Object.values(a).filter((x) => lhr.categories.accessibility.auditRefs.some((ref) => ref.id === x.id && ref.weight > 0) && x.score !== null && x.score < 1).map((x) => x.id),
    });
    await chrome.kill();
  }
  await srv.close();
  const med = runs.slice().sort((x, y) => x.performance - y.performance)[1];
  const out = { label, url: "/route-planner/", formFactor: "mobile", runs, median: med };
  fs.writeFileSync(path.join(__dirname, `${label}-lighthouse.json`), JSON.stringify(out, null, 2) + "\n");
  console.log(JSON.stringify(out, null, 2));
})().catch((e) => { console.error(e); process.exit(1); });
