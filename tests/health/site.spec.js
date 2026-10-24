// 健全性テスト: 主要ページごとに、
//   横スクロール / 主要ボタンの大きさ / 12px 未満の文字 / 内部リンクとアンカー / 広告リンクの rel /
//   カード数 / HTML の大きさ
// を確かめる。今の main ですでにある問題は tests/health/baseline.json の known に「既知」として入れてあり、
// 新しく増えたものだけで失敗する(既知の一覧は docs/health-baseline-20261024.md)。
// 基準値の更新: npm run test:update
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { test, expect } = require("@playwright/test");
const { PAGES, VIEWPORTS } = require("../support/pages");
const { openPage } = require("../support/browser");
const C = require("./collect");
const L = require("./lib");

const MIN_TAP = 44;
const MIN_FONT = 12;
const CARD_DROP_LIMIT = 0.10; // 10% 以上減ったら失敗
const HTML_GROWTH_LIMIT = 0.20; // 20% 以上増えたら失敗

const SP = VIEWPORTS.find((v) => v.id === "sp");
const PC = VIEWPORTS.find((v) => v.id === "pc");

async function collect(browser, def) {
  const data = {};
  for (const vp of [SP, PC]) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await ctx.newPage();
    await openPage(page, def);
    await C.installHelpers(page);
    data[`overflow_${vp.id}`] = await page.evaluate(C.overflow);
    if (vp === SP) {
      data.tap = await page.evaluate(C.tapTargets, { min: MIN_TAP });
      data.small = await page.evaluate(C.smallText, { min: MIN_FONT });
      data.links = await page.evaluate(C.links);
      data.cards = def.countCards === false ? null : await page.evaluate((s) => document.querySelectorAll(s).length, def.cards);
    }
    await ctx.close();
  }
  return data;
}

// 他ページの #id を確かめるとき、HTML に書かれていなければ実際に開いて JS が作る id も見る(結果はワーカーごとに覚えておく)
const renderedIdCache = new Map();
async function renderedIds(browser, def) {
  if (!renderedIdCache.has(def.id)) {
    const ctx = await browser.newContext({ viewport: { width: SP.width, height: SP.height } });
    const page = await ctx.newPage();
    await openPage(page, def);
    renderedIdCache.set(def.id, new Set(await page.evaluate(() => [...document.querySelectorAll("[id], a[name]")].map((e) => e.id || e.getAttribute("name")))));
    await ctx.close();
  }
  return renderedIdCache.get(def.id);
}

const pageForFile = (file) => PAGES.find((p) => L.fileFor("/" + p.path) === file);
const fmt = (list) => list.map((x) => "  - " + x).join("\n");

for (const def of PAGES) {
  test.describe(`健全性 ${def.id}`, () => {
    // 同じページの確認は 1 つのワーカーで順に実行し、ページを開くのは 1 回にする(失敗しても残りは続ける)
    test.describe.configure({ mode: "default" });
    let data;
    test.beforeAll(async ({ browser }) => {
      test.setTimeout(240_000);
      data = await collect(browser, def);
    });

    for (const vp of [SP, PC]) {
      test(`横スクロールが出ない ${vp.id} ${vp.width}px ${def.path}`, async () => {
        const o = data[`overflow_${vp.id}`];
        const key = `${vp.id}`;
        if (o.scrollable) L.finding("横スクロール", def.id, { key, detail: `${vp.width}px で右へ ${o.by}px スクロールできる(scrollWidth ${o.scrollWidth})`, items: o.offenders });
        L.record(def.id, `overflow_${vp.id}`, o.scrollable);
        test.info().annotations.push({ type: "計測", description: o.scrollable ? `右へ ${o.by}px スクロールできる` : "横スクロールなし" });
        if (!o.scrollable || L.UPDATE) return;
        const fresh = L.newOnes(def.id, "overflow", [key]);
        expect(fresh, `${vp.width}px で横スクロールが出ている(右へ ${o.by}px)。はみ出している要素:\n${fmt(o.offenders.map((g) => `${g.sig} ×${g.count} 右端 ${g.right}px「${g.example}」`))}`).toEqual([]);
      });
    }

    test(`主要ボタンが ${MIN_TAP}px 以上 sp ${def.path}`, async () => {
      const t = data.tap;
      const keys = t.small.map((g) => g.sig);
      for (const g of t.small) L.finding("ボタン 44px 未満", def.id, { key: g.sig, detail: `${g.count} 個(最小 ${g.minW}×${g.minH}px)「${g.example}」` });
      L.record(def.id, "tapTargets", keys);
      test.info().annotations.push({ type: "計測", description: `ボタン ${t.total} 個のうち 44px 未満 ${t.small.reduce((a, g) => a + g.count, 0)} 個(${keys.length} 種類)` });
      if (L.UPDATE) return;
      const fresh = L.newOnes(def.id, "tapTargets", keys);
      const detail = t.small.filter((g) => fresh.includes(g.sig)).map((g) => `${g.sig} ×${g.count}(最小 ${g.minW}×${g.minH}px)「${g.example}」`);
      expect(fresh, `${MIN_TAP}×${MIN_TAP}px 未満のボタンが新しく出ている:\n${fmt(detail)}`).toEqual([]);
    });

    test(`${MIN_FONT}px 未満の文字が増えていない sp ${def.path}`, async () => {
      const s = data.small;
      const before = L.base(def.id, "smallText");
      for (const g of s.groups) L.finding("12px 未満の文字", def.id, { key: g.sig, detail: `${g.count} か所「${g.example}」` });
      L.record(def.id, "smallText", s.count);
      test.info().annotations.push({ type: "計測", description: `12px 未満の文字 ${s.count} か所(基準 ${before ?? "なし"})` });
      if (L.UPDATE || before === undefined) return;
      expect(s.count, `12px 未満の文字が基準の ${before} か所から ${s.count} か所に増えた。多いもの:\n${fmt(s.groups.slice(0, 8).map((g) => `${g.sig} ×${g.count}「${g.example}」`))}`).toBeLessThanOrEqual(before);
    });

    test(`内部リンクとアンカーが切れていない ${def.path}`, async ({ browser }) => {
      const { links, ids } = data.links;
      const here = new URL(def.path, "http://127.0.0.1/").pathname;
      const ownIds = new Set(ids);
      const broken = [];
      const checked = new Set();
      for (const l of links) {
        const u = new URL(l.href);
        if (u.hostname !== "127.0.0.1" && u.hostname !== "localhost") continue;
        const k = u.pathname + u.hash;
        if (checked.has(k)) continue;
        checked.add(k);
        const label = `${l.raw}${l.kind === "a" ? "" : `(${l.kind})`}`;
        const file = L.fileFor(u.pathname);
        if (!file) { broken.push({ key: label, why: "ファイルがない" }); continue; }
        const hash = decodeURIComponent(u.hash.slice(1));
        if (!hash || hash === "top" || l.kind !== "a") continue;
        if (u.pathname === here || L.fileFor(here) === file) {
          if (!ownIds.has(hash)) broken.push({ key: label, why: `このページに id="${hash}" がない` });
          continue;
        }
        if (L.redirectTarget(u.pathname, hash)) continue; // index.html#xxx → 別ページへの転送
        if (L.staticIds(file).has(hash)) continue;
        const target = pageForFile(file);
        if (target && (await renderedIds(browser, target)).has(hash)) continue;
        broken.push({ key: label, why: `${path.relative(L.ROOT, file)} に id="${hash}" がない` });
      }
      for (const b of broken) L.finding("リンク切れ", def.id, { key: b.key, detail: b.why });
      L.record(def.id, "links", broken.map((b) => b.key));
      test.info().annotations.push({ type: "計測", description: `内部リンク・ファイル ${checked.size} 件を確認、切れ ${broken.length} 件` });
      if (L.UPDATE) return;
      const fresh = L.newOnes(def.id, "links", broken.map((b) => b.key));
      expect(fresh, `切れている内部リンク・アンカー:\n${fmt(broken.filter((b) => fresh.includes(b.key)).map((b) => `${b.key} … ${b.why}`))}`).toEqual([]);
    });

    test(`広告リンクに rel="sponsored" がある ${def.path}`, async () => {
      const { links, hasVcLinkSwitch } = data.links;
      const ads = links.filter((l) => l.kind === "a" && L.adKind(l.href, hasVcLinkSwitch));
      const bad = ads.filter((l) => !l.rel.split(/\s+/).includes("sponsored"));
      const keys = [...new Set(bad.map((l) => l.raw))];
      for (const l of bad) L.finding("rel=sponsored なし", def.id, { key: l.raw, detail: `${L.adKind(l.href, hasVcLinkSwitch)} rel="${l.rel}"「${l.text}」` });
      L.record(def.id, "sponsored", keys);
      test.info().annotations.push({ type: "計測", description: `広告リンク ${ads.length} 件、sponsored なし ${bad.length} 件` });
      if (L.UPDATE) return;
      const fresh = L.newOnes(def.id, "sponsored", keys);
      expect(fresh, `rel="sponsored" のない広告リンク:\n${fmt(bad.filter((l) => fresh.includes(l.raw)).slice(0, 20).map((l) => `${l.raw.slice(0, 90)} rel="${l.rel}"「${l.text}」`))}`).toEqual([]);
    });

    if (def.countCards !== false) {
      test(`カード数が前回から ${CARD_DROP_LIMIT * 100}% 以上減っていない ${def.path}`, async () => {
        const before = L.base(def.id, "cards");
        L.record(def.id, "cards", data.cards);
        test.info().annotations.push({ type: "計測", description: `カード ${data.cards} 枚(基準 ${before ?? "なし"})` });
        if (L.UPDATE || before === undefined) return;
        expect(data.cards, `カード(${def.cards})が基準の ${before} 枚から ${data.cards} 枚に減った(下限 ${Math.ceil(before * (1 - CARD_DROP_LIMIT))} 枚)`).toBeGreaterThan(before * (1 - CARD_DROP_LIMIT));
      });
    }

    test(`HTML の大きさが前回から ${HTML_GROWTH_LIMIT * 100}% 以上増えていない ${def.path}`, async () => {
      const file = L.fileFor(new URL(def.path, "http://127.0.0.1/").pathname);
      const bytes = fs.statSync(file).size;
      const before = L.base(def.id, "htmlBytes");
      L.record(def.id, "htmlBytes", bytes);
      test.info().annotations.push({ type: "計測", description: `${(bytes / 1024).toFixed(1)} KB(基準 ${before ? (before / 1024).toFixed(1) + " KB" : "なし"})` });
      if (L.UPDATE || before === undefined) return;
      expect(bytes, `${path.relative(L.ROOT, file)} が基準の ${before} バイトから ${bytes} バイト(+${(((bytes / before) - 1) * 100).toFixed(1)}%)に増えた`).toBeLessThan(before * (1 + HTML_GROWTH_LIMIT));
    });
  });
}

// 主要ページ以外の HTML(サイトマップのページ・SNS 入口など)は、ブラウザで開かずに HTML を読んで確かめる
// (リンク先が主要ページで、#id が HTML に書かれていないときだけ、リンク先を開いて JS が作る id も見る)
const OTHER_FILES = (() => {
  const main = new Set(PAGES.map((p) => L.fileFor(new URL(p.path, "http://127.0.0.1/").pathname)));
  const list = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith(".") || e.name === "node_modules" || e.name === "tests") continue;
      const f = path.join(dir, e.name);
      if (e.isDirectory()) walk(f);
      else if (e.name.endsWith(".html") && !main.has(f)) list.push(f);
    }
  };
  walk(L.ROOT);
  return list.sort();
})();

test.describe("健全性 その他のページ(HTML を読んで確認)", () => {
  for (const file of OTHER_FILES) {
    const rel = path.relative(L.ROOT, file).split(path.sep).join("/");
    const id = "static:" + rel;
    test(`内部リンク・アンカーと広告リンクの rel ${rel}`, async ({ browser }) => {
      const html = fs.readFileSync(file, "utf8");
      const pageUrl = new URL(rel, "http://127.0.0.1/");
      const hasVc = /valuecommerce\.com\/vcdal\.js/.test(html);
      const broken = [];
      const noSponsored = [];
      const seen = new Set();
      for (const m of html.matchAll(/<(a|link|script|img|source|iframe)\b[^>]*?\s(href|src)\s*=\s*"([^"]*)"[^>]*>/gi)) {
        const tag = m[1].toLowerCase();
        const raw = m[3].trim().replace(/&amp;/g, "&");
        if (!raw || /^(javascript:|mailto:|tel:|data:|blob:|sms:)/i.test(raw)) continue;
        if (tag === "link" && !/rel\s*=\s*"[^"]*(stylesheet|icon|preload)/i.test(m[0])) continue;
        let u;
        try { u = new URL(raw, pageUrl); } catch { continue; }
        if (tag === "a" && L.adKind(u.href, hasVc)) {
          const rel = (m[0].match(/\srel\s*=\s*"([^"]*)"/i) || [, ""])[1].toLowerCase();
          if (!rel.split(/\s+/).includes("sponsored")) noSponsored.push({ key: raw, detail: `${L.adKind(u.href, hasVc)} rel="${rel}"` });
          continue;
        }
        if (u.hostname !== "127.0.0.1" || seen.has(u.pathname + u.hash)) continue;
        seen.add(u.pathname + u.hash);
        const target = L.fileFor(u.pathname);
        if (!target) { broken.push({ key: raw, detail: "ファイルがない" }); continue; }
        const hash = decodeURIComponent(u.hash.slice(1));
        if (tag !== "a" || !hash || hash === "top" || L.redirectTarget(u.pathname, hash) || L.staticIds(target).has(hash)) continue;
        const main = pageForFile(target);
        if (main && (await renderedIds(browser, main)).has(hash)) continue;
        broken.push({ key: raw, detail: `${path.relative(L.ROOT, target)} に id="${hash}" がない` });
      }
      for (const b of broken) L.finding("リンク切れ", id, b);
      for (const b of noSponsored) L.finding("rel=sponsored なし", id, b);
      L.record(id, "links", broken.map((b) => b.key));
      L.record(id, "sponsored", [...new Set(noSponsored.map((b) => b.key))]);
      if (L.UPDATE) return;
      const freshLinks = L.newOnes(id, "links", broken.map((b) => b.key));
      const freshAds = L.newOnes(id, "sponsored", noSponsored.map((b) => b.key));
      expect.soft(freshLinks, `切れている内部リンク・アンカー:\n${fmt(broken.filter((b) => freshLinks.includes(b.key)).map((b) => `${b.key} … ${b.detail}`))}`).toEqual([]);
      expect.soft([...new Set(freshAds)], `rel="sponsored" のない広告リンク:\n${fmt([...new Set(freshAds)].slice(0, 20))}`).toEqual([]);
    });
  }
});
