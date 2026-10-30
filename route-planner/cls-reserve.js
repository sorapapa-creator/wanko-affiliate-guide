// 配置ずれ(CLS)の予防(2026-10-30)。
// ボタンを押した瞬間(入力から 500ms 以内のずれは CLS に数えられない)に、結果を描く箱の高さを画面の下端まで確保し、
// あとから届く結果(空室・ルート計算・帰路・周辺施設)で、下にあるフォームや footer が動かないようにする。
// 確保した高さは次の pointerdown / keydown / touchstart で外す(スクロールでは外さない。外す瞬間も入力の直後になる)。
(() => {
  const held = new Set();
  const release = () => { for (const el of held) el.style.minHeight = ""; held.clear(); };
  for (const type of ["pointerdown", "keydown", "touchstart"]) {
    document.addEventListener(type, () => { if (held.size) release(); }, { capture: true, passive: true });
  }
  window.reserveSpace = (el, extra = 0) => {
    if (!el || typeof el.getBoundingClientRect !== "function") return;
    const top = el.getBoundingClientRect().top;
    const need = Math.ceil(window.innerHeight - top) + extra;
    if (need <= 0) return;
    const cur = parseFloat(el.style.minHeight) || 0;
    if (need > cur) el.style.minHeight = `${need}px`;
    held.add(el);
  };
})();
