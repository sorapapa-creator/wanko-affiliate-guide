// 健全性テストで見つかった問題を一覧にする。npm test の最後に tests/report/health-summary.html を書く。
// Markdown で見たいとき: node tests/health/summary.js --md
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const L = require("./lib");

const REPORT = path.join(__dirname, "..", "report", "health-summary.html");
const ORDER = ["横スクロール", "ボタン 44px 未満", "12px 未満の文字", "リンク切れ", "rel=sponsored なし"];
// 既知かどうかの判定に使う baseline の known のキー
const KNOWN_KEY = { "横スクロール": "overflow", "ボタン 44px 未満": "tapTargets", "リンク切れ": "links", "rel=sponsored なし": "sponsored" };

function load() {
  if (!fs.existsSync(L.FINDINGS_DIR)) return [];
  const seen = new Set();
  const list = [];
  const base = L.loadBaselineFresh();
  for (const f of fs.readdirSync(L.FINDINGS_DIR)) {
    const x = JSON.parse(fs.readFileSync(path.join(L.FINDINGS_DIR, f), "utf8"));
    const id = `${x.check}|${x.pageId}|${x.key}|${x.detail}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const known = KNOWN_KEY[x.check] ? new Set((((base.pages[x.pageId] || {}).known || {})[KNOWN_KEY[x.check]]) || []) : null;
    x.status = known ? (known.has(x.key) ? "既知" : "新規") : "記録";
    list.push(x);
  }
  return list.sort((a, b) => ORDER.indexOf(a.check) - ORDER.indexOf(b.check) || a.pageId.localeCompare(b.pageId) || String(a.key).localeCompare(String(b.key)));
}

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

function write({ seconds } = {}) {
  const list = load();
  const counts = ORDER.map((c) => [c, list.filter((x) => x.check === c).length]);
  const fresh = list.filter((x) => x.status === "新規").length;
  const rows = list.map((x) => `<tr class="${x.status === "新規" ? "new" : ""}"><td>${esc(x.status)}</td><td>${esc(x.check)}</td><td>${esc(x.pageId)}</td><td><code>${esc(x.key)}</code></td><td>${esc(x.detail)}${x.items && x.items.length ? "<br><small>" + x.items.map((i) => esc(`${i.sig} ×${i.count} 右端 ${i.right}px「${i.example}」`)).join("<br>") + "</small>" : ""}</td></tr>`).join("\n");
  const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>健全性テストの結果</title>
<style>body{font-family:system-ui,sans-serif;margin:16px;color:#17352f;background:#fff}table{border-collapse:collapse;width:100%;font-size:13px}td,th{border:1px solid #d5e6df;padding:4px 6px;text-align:left;vertical-align:top}th{background:#dff7ef}tr.new{background:#ffe9e0}code{word-break:break-all}</style></head><body>
<h1>健全性テストの結果</h1>
<p>${new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}${seconds ? ` / 実行時間 ${seconds} 秒` : ""} / 全 ${list.length} 件(<b>新規 ${fresh} 件</b>)。「既知」は tests/health/baseline.json の known にある問題(テストは失敗しない)、「新規」はテストを失敗させた問題、「記録」は件数の比較だけをしている項目です。Playwright のレポートは <a href="index.html">index.html</a>。</p>
<ul>${counts.map(([c, n]) => `<li>${esc(c)}: ${n} 件</li>`).join("")}</ul>
<table><thead><tr><th>状態</th><th>確認</th><th>ページ</th><th>対象</th><th>内容</th></tr></thead><tbody>
${rows}
</tbody></table></body></html>`;
  fs.mkdirSync(path.dirname(REPORT), { recursive: true });
  fs.writeFileSync(REPORT, html);
  return list;
}

function markdown() {
  const list = load();
  const out = [];
  for (const c of ORDER) {
    const items = list.filter((x) => x.check === c);
    out.push(`### ${c}(${items.length} 件)\n`);
    if (!items.length) { out.push("なし\n"); continue; }
    out.push("| ページ | 対象 | 内容 |\n|---|---|---|");
    for (const x of items) out.push(`| ${x.pageId} | \`${String(x.key).replace(/\|/g, "\\|")}\` | ${String(x.detail).replace(/\|/g, "\\|")}${x.items && x.items.length ? "<br>" + x.items.slice(0, 3).map((i) => `${i.sig} ×${i.count}(右端 ${i.right}px)`.replace(/\|/g, "\\|")).join("<br>") : ""} |`);
    out.push("");
  }
  return out.join("\n");
}

if (require.main === module) {
  if (process.argv.includes("--md")) console.log(markdown());
  else { const list = write(); console.log(`${list.length} 件 → ${REPORT}`); }
}

module.exports = { write, markdown };
