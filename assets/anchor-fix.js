/* ページ内リンク(#id)・?pick= で指定したカードへ正しく移動する(2026-10-04)。
   カードに content-visibility:auto を付けて表示を速くしたため、まだ描画していないカードの高さが仮の値になり、
   ブラウザが #id へ飛んだあとに上のカードの高さが変わって行き先がずれていた。
   対策: 行き先より上のカードを一度だけ実寸で描画してから移動し、上部に固定された検索欄の高さぶんずらし、
   位置が落ち着くまで(最大 2.5 秒)確認して直す。 */
(function () {
  "use strict";
  var CARD = "article.stay-card, article.trip, article.card";
  function stickyOffset() {
    var h = 0;
    document.querySelectorAll(".site-nav, .stay-search, .filters, .outing-search, .lodging-chips, .explore-bar, [data-sticky]").forEach(function (el) {
      var cs = getComputedStyle(el);
      if ((cs.position === "sticky" || cs.position === "fixed") && el.offsetParent !== null) {
        var r = el.getBoundingClientRect();
        if (r.top <= 4 && r.bottom > 0) h = Math.max(h, r.bottom);
      }
    });
    return Math.min(h, window.innerHeight * 0.4) + 12;
  }
  function measureAbove(target) {
    var cards = document.querySelectorAll(CARD);
    for (var i = 0; i < cards.length; i++) {
      var c = cards[i];
      if (c === target || c.contains(target)) break;
      c.style.contentVisibility = "visible";
    }
    void document.body.offsetHeight;  // 行き先より上は実寸のまま残す(深いリンクで来たときだけ。戻すと仮の高さに戻ってずれる)
  }
  function settle(target) {
    if (!target) return;
    if (target.hidden) target.hidden = false;
    measureAbove(target);
    var tries = 0, last = null;
    function step() {
      var off = stickyOffset();
      var top = target.getBoundingClientRect().top;
      if (Math.abs(top - off) > 3) window.scrollTo({ top: window.scrollY + top - off, left: 0, behavior: "instant" });
      var now = Math.round(target.getBoundingClientRect().top);
      tries++;
      if (tries < 25 && (last === null || Math.abs(now - last) > 1 || Math.abs(now - off) > 3)) { last = now; setTimeout(step, 100); }
    }
    step();
  }
  function fromHash() {
    var id = decodeURIComponent((location.hash || "").slice(1));
    if (!id) return null;
    return document.getElementById(id);
  }
  function fromPick() {
    var pick = new URLSearchParams(location.search).get("pick");
    if (!pick) return null;
    var a = document.querySelector('[data-product="' + (window.CSS && CSS.escape ? CSS.escape(pick) : pick) + '"]');
    return a ? a.closest(CARD) : null;
  }
  function go() { var t = fromHash() || fromPick(); if (t) settle(t); }
  if ("scrollRestoration" in history && (location.hash || /[?&]pick=/.test(location.search))) history.scrollRestoration = "manual";
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { setTimeout(go, 0); });
  else setTimeout(go, 0);
  window.addEventListener("load", function () { setTimeout(go, 50); });
  window.addEventListener("hashchange", function () { var t = fromHash(); if (t) settle(t); });
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest('a[href^="#"]');
    if (!a) return;
    var id = decodeURIComponent(a.getAttribute("href").slice(1));
    var t = id && document.getElementById(id);
    if (!t || !t.matches(CARD)) return;
    e.preventDefault();
    if (location.hash !== "#" + id) history.pushState(null, "", "#" + id);
    settle(t);
  });
  window.wankoScrollToCard = settle;  // 地図のピンなど他のスクリプトから使う
})();
