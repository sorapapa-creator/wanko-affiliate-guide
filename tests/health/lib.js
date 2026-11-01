// 健全性テストの Node 側の部品: 基準値(baseline.json)の読み書き、結果の記録、リンク先の確認。
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const ROOT = path.resolve(__dirname, "..", "..");
const BASELINE_FILE = path.join(__dirname, "baseline.json");
const FRAGMENT_DIR = path.join(__dirname, "..", "test-results", "health-fragments");
const FINDINGS_DIR = path.join(__dirname, "..", "test-results", "health-findings");
const UPDATE = process.env.UPDATE_HEALTH_BASELINE === "1";

function loadBaseline() {
  try { return JSON.parse(fs.readFileSync(BASELINE_FILE, "utf8")); } catch { return { pages: {} }; }
}
const baseline = loadBaseline();

// 基準値: pages[pageId][field]。なければ undefined
function base(pageId, field) {
  const p = baseline.pages[pageId];
  return p ? p[field] : undefined;
}

// 基準値の更新モード(npm run test:update)のとき、今回の値を記録しておく。最後に global-teardown がまとめて baseline.json に書く
function record(pageId, field, value) {
  if (!UPDATE) return;
  fs.mkdirSync(FRAGMENT_DIR, { recursive: true });
  fs.writeFileSync(path.join(FRAGMENT_DIR, crypto.randomUUID() + ".json"), JSON.stringify({ pageId, field, value }));
}

// 見つかった問題を記録する(既知・新規の両方)。tests/report/health-summary.html と docs の一覧はこれから作る
function finding(check, pageId, item) {
  fs.mkdirSync(FINDINGS_DIR, { recursive: true });
  fs.writeFileSync(path.join(FINDINGS_DIR, crypto.randomUUID() + ".json"), JSON.stringify({ check, pageId, ...item }));
}

// 既知の問題(baseline の known.<check>)に入っていないものだけを返す
function newOnes(pageId, check, keys) {
  const known = new Set(((base(pageId, "known") || {})[check]) || []);
  return keys.filter((k) => !known.has(k));
}

// URL のパス部分 → リポジトリ内のファイル。見つからなければ null
function fileFor(pathname) {
  let rel;
  try { rel = decodeURIComponent(pathname); } catch { rel = pathname; }
  let file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT)) return null;
  if (rel.endsWith("/")) file = path.join(file, "index.html");
  try {
    const st = fs.statSync(file);
    if (st.isDirectory()) file = path.join(file, "index.html");
    return fs.statSync(file).isFile() ? file : null;
  } catch { return null; }
}

// HTML ファイルに書かれている id / name の一覧(JS で後から作られる id は含まれない)
const staticIdCache = new Map();
function staticIds(file) {
  if (!staticIdCache.has(file)) {
    const html = fs.readFileSync(file, "utf8");
    const ids = new Set();
    for (const m of html.matchAll(/\s(?:id|name)\s*=\s*["']([^"']+)["']/g)) ids.add(m[1]);
    staticIdCache.set(file, ids);
  }
  return staticIdCache.get(file);
}

// index.html は ?pick= や #hash で別ページに転送する(assets/card-pages.json)。転送先を返す
let cardPages = null;
function redirectTarget(pathname, hash) {
  if (!/\/(index\.html)?$/.test(pathname) || pathname.split("/").length > 2) return null;
  if (!cardPages) { try { cardPages = JSON.parse(fs.readFileSync(path.join(ROOT, "assets", "card-pages.json"), "utf8")); } catch { cardPages = {}; } }
  return (cardPages.hashes || {})[hash] || null;
}

// 広告リンクの判定。LinkSwitch(vcdal.js)のあるページでは、Yahoo! などへの普通のリンクもクリック時に広告リンクに変わる
const AD_HOSTS = [/(^|\.)valuecommerce\.(com|ne\.jp)$/, /^hb\.afl\.rakuten\.co\.jp$/, /^a\.r10\.to$/, /(^|\.)a8\.net$/, /^af\.moshimo\.com$/,
  /^amzn\.to$/, /(^|\.)linksynergy\.com$/, /(^|\.)accesstrade\.net$/, /^t\.felmat\.net$/, /(^|\.)afi-b\.com$/, /^ad\.presco\.ne\.jp$/];
const LINKSWITCH_HOSTS = [/(^|\.)shopping\.yahoo\.co\.jp$/, /^travel\.yahoo\.co\.jp$/, /^lohaco\.yahoo\.co\.jp$/, /(^|\.)jalan\.net$/, /(^|\.)ikyu\.com$/];
function adKind(href, hasVcLinkSwitch) {
  let u;
  try { u = new URL(href); } catch { return null; }
  if (AD_HOSTS.some((re) => re.test(u.hostname))) return "アフィリエイト";
  if (/(^|\.)amazon\.co\.jp$/.test(u.hostname) && u.searchParams.has("tag")) return "Amazon(tag=)";
  if (hasVcLinkSwitch && LINKSWITCH_HOSTS.some((re) => re.test(u.hostname))) return "LinkSwitch 対象";
  return null;
}

module.exports = { ROOT, BASELINE_FILE, FRAGMENT_DIR, FINDINGS_DIR, UPDATE, baseline, loadBaselineFresh: loadBaseline, base, record, finding, newOnes, fileFor, staticIds, redirectTarget, adKind };
