// 基準値の更新モード(UPDATE_HEALTH_BASELINE=1)のとき、各テストが記録した値を tests/health/baseline.json にまとめて書く。
// 一部のテストだけ実行したときは、実行したページ・項目だけが書き換わる。
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const L = require("../health/lib");

module.exports = async () => {
  if (!L.UPDATE || !fs.existsSync(L.FRAGMENT_DIR)) return;
  const data = L.loadBaselineFresh();
  const KNOWN = { overflow_sp: "overflow", overflow_pc: "overflow", tapTargets: "tapTargets", links: "links", sponsored: "sponsored" };
  for (const f of fs.readdirSync(L.FRAGMENT_DIR)) {
    const { pageId, field, value } = JSON.parse(fs.readFileSync(path.join(L.FRAGMENT_DIR, f), "utf8"));
    const page = (data.pages[pageId] ||= {});
    if (!KNOWN[field]) { page[field] = value; continue; }
    const known = (page.known ||= {});
    if (field.startsWith("overflow_")) {
      const vp = field.slice("overflow_".length);
      known.overflow = (known.overflow || []).filter((k) => k !== vp);
      if (value) known.overflow.push(vp);
      known.overflow.sort();
    } else {
      known[KNOWN[field]] = [...new Set(value)].sort();
    }
  }
  // 空の known は消して読みやすくする
  for (const p of Object.values(data.pages)) {
    if (!p.known) continue;
    for (const k of Object.keys(p.known)) if (!p.known[k].length) delete p.known[k];
    if (!Object.keys(p.known).length) delete p.known;
  }
  data.updatedAt = new Date().toISOString();
  data.note = "前回の値(カード数・HTML の大きさ・12px 未満の文字数)と、既知の問題(known)。npm run test:update で今の状態に書き換わる。";
  const sorted = { note: data.note, updatedAt: data.updatedAt, pages: Object.fromEntries(Object.keys(data.pages).sort().map((k) => [k, data.pages[k]])) };
  fs.writeFileSync(L.BASELINE_FILE, JSON.stringify(sorted, null, 2) + "\n");
  console.log(`\n基準値を書き換えました: ${path.relative(process.cwd(), L.BASELINE_FILE)}`);
};
