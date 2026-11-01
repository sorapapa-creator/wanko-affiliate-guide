// 地域ページ(areas/*.html)をスマホ幅で開き、横スクロールが出ないか・はみ出す要素が無いかを確かめる。
// Playwright(Chromium)が必要。外部への通信はすべて止める。
// 実行: node tests/area-pages-layout.test.js     (幅は既定で 320 / 360 / 390。WIDTHS=375,414 などで変えられる)
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
let chromium;
try { ({ chromium } = require("playwright")); } catch (e) {
  console.log("1..0 # SKIP playwright がありません"); process.exit(0);
}
const ROOT = path.resolve(__dirname, "..");
const TYPE = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "application/javascript", ".svg": "image/svg+xml", ".webp": "image/webp", ".jpg": "image/jpeg", ".png": "image/png" };
const WIDTHS = (process.env.WIDTHS || "320,360,390").split(",").map(Number);

(async () => {
  const server = await new Promise(resolve => {
    const s = http.createServer((req, res) => {
      let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
      if (p.endsWith("/")) p += "index.html";
      const f = path.join(ROOT, p);
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { "Content-Type": TYPE[path.extname(f)] || "application/octet-stream" });
      fs.createReadStream(f).pipe(res);
    }).listen(0, "127.0.0.1", () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const files = fs.readdirSync(path.join(ROOT, "areas")).filter(f => f.endsWith(".html")).sort();
  let n = 0, failed = 0;
  for (const width of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width, height: 800 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, locale: "ja-JP" });
    await ctx.route(u => !u.href.startsWith(base), r => r.abort());
    const tab = await ctx.newPage();
    const bad = [];
    for (const f of files) {
      await tab.goto(`${base}/areas/${f}`, { waitUntil: "load" });
      const r = await tab.evaluate(() => {
        const vw = document.documentElement.clientWidth;
        const over = [];
        for (const el of document.querySelectorAll("body *")) {
          const b = el.getBoundingClientRect();
          if (b.width && (b.right > vw + 1 || b.left < -1) && getComputedStyle(el).position !== "fixed") {
            // はみ出しを隠している祖先(overflow:hidden/auto)の中なら、ページは横に動かない
            let p = el.parentElement, clipped = false;
            while (p && p !== document.body) { const o = getComputedStyle(p).overflowX; if (o !== "visible") { clipped = true; break; } p = p.parentElement; }
            if (!clipped) over.push(`${el.tagName.toLowerCase()}${el.className ? "." + String(el.className).split(" ")[0] : ""}(右端 ${Math.round(b.right)}px)`);
          }
        }
        return { scroll: document.documentElement.scrollWidth, vw, over: over.slice(0, 3) };
      });
      if (r.scroll > r.vw || r.over.length) bad.push(`${f}: 横幅 ${r.scroll}px / 画面 ${r.vw}px ${r.over.join(" ")}`);
    }
    n++;
    if (bad.length) { failed++; console.log(`not ok ${n} - 幅 ${width}px で横スクロールが出ない(${files.length} ページ)`); bad.slice(0, 15).forEach(b => console.log("  # " + b)); }
    else console.log(`ok ${n} - 幅 ${width}px で横スクロールが出ない(${files.length} ページ)`);
    await ctx.close();
  }
  console.log(`1..${n}`);
  await browser.close(); server.close();
  process.exitCode = failed ? 1 : 0;
})().catch(e => { console.error(e); process.exit(1); });
