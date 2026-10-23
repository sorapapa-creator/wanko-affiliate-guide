// 旅行プラン画面(route-planner/)をブラウザで動かすテスト・計測の共通部品。
// - リポジトリを静的に配る小さな HTTP サーバー(依存なし)
// - 経路 API(Cloudflare Worker の /routes)をモックし、呼び出しを数える(無料枠を使わない・回数の増減を確かめる)
// - 外部ドメイン(広告・解析・地図・OpenPOI)は遮断して、結果を毎回同じにする
// Playwright は require("playwright") で読めるときだけ使う(読めなければテスト側でスキップ)。
"use strict";
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..", "..");
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
  ".svg": "image/svg+xml", ".ico": "image/x-icon", ".txt": "text/plain; charset=utf-8", ".xml": "application/xml" };

function startServer(root = ROOT) {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (p.endsWith("/")) p += "index.html";
    const file = path.join(root, p);
    if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
    fs.readFile(file, (err, buf) => {
      if (err) { res.writeHead(404); return res.end("not found"); }
      res.writeHead(200, { "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-store" });
      res.end(buf);
    });
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => {
    const { port } = server.address();
    resolve({ url: `http://127.0.0.1:${port}`, close: () => new Promise((r) => server.close(r)) });
  }));
}

// Google のエンコード済みポリライン(経路の線)
function encodePolyline(points) {
  let out = "", pLat = 0, pLon = 0;
  const enc = (v) => { v = v < 0 ? ~(v << 1) : v << 1; let s = ""; while (v >= 0x20) { s += String.fromCharCode((0x20 | (v & 0x1f)) + 63); v >>= 5; } return s + String.fromCharCode(v + 63); };
  for (const [la, lo] of points) {
    const a = Math.round(la * 1e5), b = Math.round(lo * 1e5);
    out += enc(a - pLat) + enc(b - pLon); pLat = a; pLon = b;
  }
  return out;
}
const kmBetween = (a, b) => {
  const R = 6371, r = Math.PI / 180, dLa = (b.lat - a.lat) * r, dLo = (b.lon - a.lon) * r;
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
// 直線を 40 分割した経路と、距離から作った所要時間(出発時刻ごとに少しずつ変える)
function mockRoutes(body) {
  const { origin, destination, departures } = body;
  const pts = Array.from({ length: 41 }, (_, i) => [origin.lat + (destination.lat - origin.lat) * i / 40, origin.lon + (destination.lon - origin.lon) * i / 40]);
  const base = Math.round(kmBetween(origin, destination) * 1.3 / 60 * 3600) + 600;
  return { mock: false, results: departures.map((d, i) => ({ departure: d, durationSec: Math.round(base * (1 + 0.06 * ((i * 7) % 5))), staticDurationSec: base, distanceMeters: Math.round(kmBetween(origin, destination) * 1300), polyline: encodePolyline(pts) })) };
}

// page に経路 API のモックと外部遮断を付ける。opts.routes: "ok" | "500" | "429" | "network"、opts.routeDelayMs
// opts.vacancy(fileName, json) → 書き換えた json(または null で 404)。空室データの状態(期限切れなど)を作るため
async function preparePage(page, base, opts = {}) {
  const calls = [];
  await page.route("**/*", async (route) => {
    const req = route.request(); const url = new URL(req.url());
    if (/\/routes$/.test(url.pathname) && req.method() === "POST") {
      const body = JSON.parse(req.postData() || "{}");
      calls.push({ at: Date.now(), departures: (body.departures || []).length });
      if (opts.routeDelayMs) await new Promise((r) => setTimeout(r, opts.routeDelayMs));
      const mode = typeof opts.routes === "function" ? opts.routes(calls.length) : (opts.routes || "ok");
      if (mode === "network") return route.abort("failed");
      if (mode === "500" || mode === "429") return route.fulfill({ status: Number(mode), contentType: "application/json", body: '{"error":"x"}' });
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockRoutes(body)) });
    }
    if (url.origin !== base) return route.abort("blockedbyclient");
    const m = /\/route-planner\/data\/vacancy\/([^/]+\.json)$/.exec(url.pathname);
    if (m && opts.vacancy) {
      if (opts.vacancy === "network") return route.abort("failed");
      const file = path.join(ROOT, "route-planner", "data", "vacancy", m[1]);
      let json = null; try { json = JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) { json = null; }
      const out = opts.vacancy(m[1], json);
      if (out == null) return route.fulfill({ status: 404, body: "not found" });
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(out) });
    }
    return route.continue();
  });
  return { calls };
}

// 日本時間の YYYY-MM-DDTHH:MM(空室データの scanned_at と同じ形)
const jstStamp = (ms) => new Date(ms + 9 * 3600 * 1000).toISOString().slice(0, 16);

function loadPlaywright() {
  try { return require("playwright"); } catch (e) {
    try { return require("/opt/node-tools/node_modules/playwright"); } catch (e2) { return null; }
  }
}

const MOBILE = { viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "ja-JP", timezoneId: "Asia/Tokyo",
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1" };

module.exports = { ROOT, startServer, preparePage, mockRoutes, encodePolyline, jstStamp, loadPlaywright, MOBILE };
