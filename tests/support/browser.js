// ページを開く共通処理。外部への通信(広告・SNS 埋め込み・地図タイルなど)は止めて、毎回同じ状態で開く。
"use strict";
const { FIXED_NOW } = require("./pages");

// 1×1 の灰色 PNG
const GRAY_PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGO4CwAA3wDeKXlwtgAAAABJRU5ErkJggg==", "base64");

async function openPage(page, def, { freezeClock = true } = {}) {
  await page.route("**/*", (route) => {
    const { protocol, hostname } = new URL(route.request().url());
    if (hostname === "127.0.0.1" || hostname === "localhost" || protocol === "data:" || protocol === "blob:") return route.continue();
    // 外部の画像(楽天トラベルの施設写真など)は灰色の代替画像にして、毎回同じ見た目にする
    if (route.request().resourceType() === "image") return route.fulfill({ status: 200, contentType: "image/png", body: GRAY_PNG });
    return route.abort();
  });
  if (freezeClock) await page.clock.setFixedTime(new Date(FIXED_NOW));
  await page.goto(def.path, { waitUntil: "load", timeout: 90_000 });
  await page.evaluate(() => document.fonts && document.fonts.ready);
  // 読み込み後に JS がカードやリストを組み立てるページがあるので、少し待ってから計測する
  await page.waitForTimeout(400);
}

module.exports = { openPage };
