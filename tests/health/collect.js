// ブラウザの中で動かす計測関数。page.evaluate(fn, arg) で呼ぶ(関数の外の変数は使えない)。
"use strict";

// 共通の小さな関数を window.__health に置く(installHelpers で先に読み込む)。
// sig: 要素の短い名前(例: a.buy.buy-ad)。同じ種類の要素をまとめて数えるのに使う。
//      クラスのない要素は、親の名前を前に付ける(例: nav.site-nav a)
const HELPERS_SRC = `
  window.__health = (() => {
  function sig(el) {
    const one = (e) => e.tagName.toLowerCase() + [...e.classList].filter((c) => !/^(is-|active|open|hidden|selected)/.test(c)).sort().map((c) => "." + c).join("");
    if (el.classList.length > 0) return one(el);
    const p = el.parentElement && el.parentElement.closest("[class],[id]");
    return p ? (p.id && !p.classList.length ? "#" + p.id : one(p)) + " " + one(el) : one(el);
  }
  function shown(el) {
    if (el.getClientRects().length === 0) return false;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || Number(cs.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    if (r.width <= 1 || r.height <= 1) return false;
    if (r.right + scrollX <= 0) return false; // 画面外に逃がしたスキップリンクなど
    return true;
  }
  function textOf(el) { return (el.innerText || el.textContent || el.value || el.getAttribute("aria-label") || el.getAttribute("title") || "").replace(/\\s+/g, " ").trim().slice(0, 40); }
  return { sig, shown, textOf };
  })();
`;

async function installHelpers(page) {
  await page.evaluate(HELPERS_SRC);
}

// 横スクロール: 実際に右へスクロールできるかで判定し、はみ出している要素を挙げる
function overflow() {
  const { sig, textOf } = window.__health;
  const de = document.documentElement;
  const y = scrollY;
  window.scrollTo(10_000, y);
  const scrolled = scrollX;
  window.scrollTo(0, y);
  const width = de.clientWidth;
  const result = { scrollable: scrolled > 0, by: scrolled, scrollWidth: de.scrollWidth, width, offenders: [] };
  if (!result.scrollable) return result;
  const groups = new Map();
  for (const el of document.body.querySelectorAll("*")) {
    const r = el.getBoundingClientRect();
    if (r.right <= width + 1 || r.width === 0) continue;
    // はみ出しを内側で隠している(overflow: hidden/auto)親がいれば対象外
    let clipped = false;
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const ox = getComputedStyle(p).overflowX;
      if (ox !== "visible") { if (p.getBoundingClientRect().right <= width + 1) clipped = true; break; }
    }
    if (clipped) continue;
    // 親もはみ出しているなら、親を代表にする(いちばん外側だけ数える)
    const pr = el.parentElement && el.parentElement.getBoundingClientRect();
    if (pr && pr.right > width + 1 && el.parentElement !== document.body) continue;
    const s = sig(el);
    const g = groups.get(s) || { sig: s, count: 0, right: 0, example: textOf(el) };
    g.count++; g.right = Math.max(g.right, Math.round(r.right));
    groups.set(s, g);
  }
  result.offenders = [...groups.values()].sort((a, b) => b.right - a.right).slice(0, 10);
  return result;
}

// 主要ボタン: ボタン類と、ボタンの見た目をしたリンク。44×44px 未満のものを種類ごとに数える
function tapTargets({ min }) {
  const { sig, shown, textOf } = window.__health;
  const BUTTONISH = /(^|[-_ ])(btn|button|buy|cta|primary|submit|book|chip|official-link|plan-link|contact-button|tdc-btn|hs-submit)([-_ ]|$)/;
  const isButtonLike = (el) => {
    const tag = el.tagName;
    if (tag === "BUTTON" || tag === "SELECT" || tag === "SUMMARY") return true;
    if (tag === "INPUT") return /^(submit|button|reset)$/.test(el.type);
    if (el.getAttribute("role") === "button") return true;
    if (tag !== "A") return false;
    if (BUTTONISH.test(el.className)) return true;
    const cs = getComputedStyle(el);
    if (cs.display === "inline") return false; // 文中のテキストリンクは対象外
    const bg = cs.backgroundColor;
    const hasBg = bg && bg !== "transparent" && !/rgba\(.*,\s*0\)$/.test(bg);
    const hasBorder = parseFloat(cs.borderTopWidth) > 0 && parseFloat(cs.borderBottomWidth) > 0 && parseFloat(cs.borderRadius) > 0;
    return hasBg || hasBorder;
  };
  let total = 0;
  const groups = new Map();
  for (const el of document.querySelectorAll("button, select, summary, input, [role=button], a[href]")) {
    if (!isButtonLike(el) || !shown(el)) continue;
    total++;
    const r = el.getBoundingClientRect();
    if (r.width >= min && r.height >= min) continue;
    const s = sig(el);
    const g = groups.get(s) || { sig: s, count: 0, minW: Infinity, minH: Infinity, example: textOf(el) };
    g.count++; g.minW = Math.min(g.minW, Math.round(r.width * 10) / 10); g.minH = Math.min(g.minH, Math.round(r.height * 10) / 10);
    groups.set(s, g);
  }
  return { total, small: [...groups.values()].sort((a, b) => b.count - a.count) };
}

// 12px 未満の文字: 文字を直接持つ要素のうち、表示されていて font-size < 12px のものを数える
function smallText({ min }) {
  const { sig, shown } = window.__health;
  let count = 0;
  const groups = new Map();
  const seen = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!n.nodeValue || !n.nodeValue.trim()) continue;
    const el = n.parentElement;
    if (!el || seen.has(el)) continue;
    seen.add(el);
    if (el.closest("script,style,noscript,template,option,svg")) continue;
    const size = parseFloat(getComputedStyle(el).fontSize);
    if (!(size < min)) continue;
    if (!shown(el)) continue;
    count++;
    const s = sig(el) + " " + size + "px";
    const g = groups.get(s) || { sig: s, count: 0, example: n.nodeValue.replace(/\s+/g, " ").trim().slice(0, 30) };
    g.count++;
    groups.set(s, g);
  }
  return { count, groups: [...groups.values()].sort((a, b) => b.count - a.count) };
}

// リンク・読み込むファイル・id の一覧(内部リンク切れと広告リンクの rel の確認に使う)
function links() {
  const out = [];
  const add = (el, attr, kind) => {
    const raw = el.getAttribute(attr);
    if (raw === null) return;
    const v = raw.trim();
    if (!v || /^(javascript:|mailto:|tel:|data:|blob:|sms:)/i.test(v)) return;
    let abs;
    try { abs = new URL(v, document.baseURI).href; } catch { return; }
    out.push({ kind, raw: v, href: abs, rel: (el.getAttribute("rel") || "").toLowerCase(), text: (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 30) });
  };
  document.querySelectorAll("a[href], area[href]").forEach((el) => add(el, "href", "a"));
  document.querySelectorAll("link[rel~=stylesheet][href], link[rel~=icon][href], link[rel~=preload][href]").forEach((el) => add(el, "href", "link"));
  document.querySelectorAll("script[src]").forEach((el) => add(el, "src", "script"));
  document.querySelectorAll("img[src], source[src], video[src], iframe[src]").forEach((el) => add(el, "src", "img"));
  const ids = [...document.querySelectorAll("[id]")].map((e) => e.id);
  const names = [...document.querySelectorAll("a[name]")].map((e) => e.getAttribute("name"));
  const hasVcLinkSwitch = !!document.querySelector('script[src*="valuecommerce.com/vcdal.js"]');
  return { links: out, ids: [...ids, ...names], hasVcLinkSwitch };
}

module.exports = { installHelpers, overflow, tapTargets, smallText, links };
