// design-20261004: トップの日付検索の初期値と、お出かけページの「地図で見る」一覧。JS が無くてもページは使える(段階的な強化)。
(() => {
  const pad = (n) => String(n).padStart(2, "0");
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  // トップ: チェックイン日の初期値は次の土曜日(空室データは週末・祝前日)。今日より前は選べない
  const date = document.getElementById("hs-date");
  if (date) {
    const now = new Date(); const sat = new Date(now); sat.setDate(now.getDate() + ((6 - now.getDay() + 7) % 7 || 7));
    const max = new Date(now); max.setDate(now.getDate() + 90);
    date.min = ymd(now); date.max = ymd(max);
    if (!date.value) date.value = ymd(sat);
  }

  // お出かけ: 今の絞り込み結果を、地図アプリで開ける一覧にする(API キー不要の検索 URL)
  const grid = document.getElementById("tripGrid");
  const search = document.querySelector(".outing-search");
  if (!grid || !search) return;
  const cards = [...grid.querySelectorAll(".trip")];
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const info = (card) => {
    if (card._geo) return card._geo;
    const name = ((card.querySelector("h2") || {}).textContent || "").trim();
    const area = ((card.querySelector(".region") || {}).textContent || "").trim();
    const loc = card.querySelector(".facility-location");
    let addr = "";
    if (loc) { const c = loc.cloneNode(true); c.querySelectorAll("strong,a").forEach((e) => e.remove()); addr = c.textContent.replace(/[·・\s]+$/, "").trim().replace(/^〒?\s*\d{3}-?\d{4}\s*/, ""); }
    const q = `${name} ${addr || area}`.trim();
    return (card._geo = { id: card.id, name, area, addr, url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` });
  };

  const btn = document.createElement("button");
  btn.type = "button"; btn.className = "map-toggle"; btn.setAttribute("aria-expanded", "false"); btn.setAttribute("aria-controls", "outing-map");
  btn.innerHTML = '<span aria-hidden="true">◎</span> 地図で見る';
  search.append(btn);
  const panel = document.createElement("section");
  panel.id = "outing-map"; panel.className = "map-panel"; panel.hidden = true; panel.setAttribute("aria-label", "地図で見る(絞り込み中の行き先)");
  search.after(panel);

  // design-pass-2: パネル = 見出し + 地図(Leaflet、開いたときだけ読み込む) + 地図アプリで開ける一覧
  panel.innerHTML = '<div class="map-head"><p class="map-summary"></p><button type="button" class="map-close">閉じる</button></div><div class="wmap" id="outing-leaflet" role="region" aria-label="行き先の地図"></div><div class="map-list"></div>';
  const summary = panel.querySelector(".map-summary"), list = panel.querySelector(".map-list"), host = panel.querySelector(".wmap");
  panel.querySelector(".map-close").addEventListener("click", () => toggle(false));
  let mapCtl = null;

  const STEP = 60; let limit = STEP;
  function render() {
    if (panel.hidden) return;
    const shown = cards.filter((c) => !c.hidden);
    const groups = new Map();
    shown.slice(0, limit).forEach((c) => { const g = info(c); const pref = ((g.addr + " ").match(/^(東京都|北海道|(?:京都|大阪)府|[^\s・]{2,3}?県)/) || g.area.match(/^(東京都|北海道|(?:京都|大阪)府|[^\s・]{2,3}?県)/) || [, "その他"])[1]; if (!groups.has(pref)) groups.set(pref, []); groups.get(pref).push(g); });
    summary.innerHTML = `<b>${shown.length}件</b>を地図に表示。ピンを押すと名前とカードへのリンクが出ます。下の一覧からは地図アプリで開けます。`;
    list.innerHTML = (shown.length ? [...groups].map(([pref, items]) => `<h3>${esc(pref)} <span>${items.length}</span></h3><ul>${items.map((g) => `<li><div><a class="map-card" href="#${esc(g.id)}">${esc(g.name)}</a><small>${esc(g.addr || g.area)}</small></div><a class="map-open" href="${esc(g.url)}" target="_blank" rel="noopener noreferrer">地図で開く<span class="vh">(${esc(g.name)}・新しいタブ)</span> ↗</a></li>`).join("")}</ul>`).join("") : '<p class="map-none">該当する行き先がありません。</p>')
      + (shown.length > limit ? `<button type="button" class="map-more">さらに ${Math.min(STEP, shown.length - limit)}件を表示(残り ${shown.length - limit}件)</button>` : "");
    const more = list.querySelector(".map-more"); if (more) more.addEventListener("click", () => { limit += STEP; render(); });
  }
  function toggle(open) {
    panel.hidden = !open; btn.setAttribute("aria-expanded", String(open)); btn.classList.toggle("active", open);
    btn.lastChild.textContent = open ? " 地図を閉じる" : " 地図で見る";
    if (open) {
      limit = STEP; render();
      if (!mapCtl && window.WankoPlaceMap) mapCtl = window.WankoPlaceMap.mount(host, { cards, idOf: (c) => c.id, nameOf: (c) => info(c).name, areaOf: (c) => info(c).addr || info(c).area, unit: "件" });
      else if (mapCtl) mapCtl.refresh();
      if (window.matchMedia("(max-width:700px)").matches) host.scrollIntoView({ block: "center", behavior: "instant" });
    } else btn.focus();
  }
  btn.addEventListener("click", () => toggle(panel.hidden));
  // 絞り込み(outing-filters.js が wanko:filtered を出す)のあとに一覧を作り直す
  document.addEventListener("wanko:filtered", () => { limit = STEP; render(); });
})();
