// 旅行プランの地図(段階2・3): 出発地・立ち寄り先・休憩・行き先と、選択中の出発時刻の経路を Google マップに表示し、
// 経路沿いの中継地候補(ドッグラン・カフェ・公園・SA・PA・道の駅など)を印で出して、複数選んで立ち寄り先に入れられる。
// 経路は Google Routes API の結果(planner.js が各区間に保存した polyline)なので、規約上 Google マップに重ねる。
// 地図の操作・候補の選択では Routes API を呼ばない。再計算は「立ち寄りに入れて再計算」を押したときだけ(planner.js の onApply)。
(() => {
  const CFG = window.PLANNER_CONFIG || {};
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const COLOR = { origin: "#2e7d4f", dest: "#b3261e", via: "#c0612b", rest: "#6f665d", go: "#c0612b", back: "#1f5fa8", picked: "#1b1b1b" };
  // 候補の種類: 色・印の文字・表示名(planner.js の candCategory と対応)
  const CAT = {
    run: { color: "#2e7d4f", icon: "🐕", label: "ドッグラン" },
    cafe: { color: "#a8571f", icon: "☕", label: "カフェ・食事" },
    park: { color: "#3b7ea1", icon: "🌳", label: "公園・観光" },
    animal: { color: "#8a6d3b", icon: "🐄", label: "動物・牧場" },
    shopping: { color: "#7b4fa3", icon: "🛍️", label: "買い物" },
    rest: { color: "#6f665d", icon: "🅿️", label: "SA・PA・道の駅" },
    other: { color: "#9a9087", icon: "📍", label: "その他" },
  };
  const ICON = { origin: "🚗", dest: "🏁", rest: "🅿️" };
  // 候補の丸いアイコンの中身。SA・PA・道の駅は文字(SA / PA / 道の駅)で区別する
  const candIcon = (c) => (c.cat === "rest" ? (c.kind === "道の駅" ? "道の駅" : c.kind || "休") : (CAT[c.cat] || CAT.other).icon);
  const shortName = (name, n = 14) => (name.length > n ? name.slice(0, n - 1) + "…" : name);

  let apiPromise = null;   // Maps JavaScript API の読み込み(1 回だけ)
  let map = null;          // google.maps.Map(1 ページ 1 回だけ作る = Dynamic Maps の課金は 1 回)
  let info = null;
  let layers = [];         // 今描いているマーカー・経路(描き直すときに消す)
  let candMarkers = new Map(); // 候補 id → マーカー
  let pending = null;      // 最新の表示データ(地図がまだ無いときに取っておく)
  let shown = false;
  let failed = false;
  const picks = new Map(); // 選んだ候補 id → { cand, stayMin }(再描画・絞り込みでは消えない)
  let activeId = null;     // リストで注目中の候補

  const enabled = () => Boolean(CFG.mapEnabled && CFG.mapsApiKey && CFG.mapId && $("map"));
  const note = (text) => { const n = $("map-note"); if (n) n.textContent = text; };
  const filters = () => new Set([...document.querySelectorAll("#map-filters input:checked")].map((i) => i.value));
  const stayChoices = () => pending?.stayChoices || [15, 30, 45, 60, 90, 120, 180, 240];
  const fmtStay = (min) => (min < 60 ? `${min}分` : `${min / 60}時間`.replace(".5時間", "時間30分"));
  const distText = (d) => (d < 1 ? "1km未満" : `約${Math.round(d)}km`);
  // 寄り道の目安(分): 経路からの直線距離を往復し、道のりは直線の 1.3 倍・平均 40km/h とした概算。実際の差は再計算で出す
  const detourMin = (d) => Math.max(2, Math.round(d * 2 * 1.3 / 40 * 60));

  // Google 公式の動的ローダー(https://developers.google.com/maps/documentation/javascript/load-maps-js-api)
  function loadApi() {
    if (apiPromise) return apiPromise;
    apiPromise = new Promise((resolve, reject) => {
      window.gm_authFailure = () => { failed = true; reject(new Error("auth")); $("map").classList.add("hidden"); note("地図の認証に失敗しました(キーの制限か設定の問題)。行程表と候補の一覧はそのまま使えます。"); };
      ((g) => { var h, a, k, p = "The Google Maps JavaScript API", c = "google", l = "importLibrary", q = "__ib__", m = document, b = window; b = b[c] || (b[c] = {}); var d = b.maps || (b.maps = {}), r = new Set(), e = new URLSearchParams(), u = () => h || (h = new Promise(async (f, n) => { await (a = m.createElement("script")); e.set("libraries", [...r] + ""); for (k in g) e.set(k.replace(/[A-Z]/g, (t) => "_" + t[0].toLowerCase()), g[k]); e.set("callback", c + ".maps." + q); a.src = `https://maps.${c}apis.com/maps/api/js?` + e; d[q] = f; a.onerror = () => h = n(Error(p + " could not load.")); a.nonce = m.querySelector("script[nonce]")?.nonce || ""; m.head.append(a); })); d[l] ? console.warn(p + " only loads once. Ignoring:", g) : d[l] = (f, ...n) => r.add(f) && u().then(() => d[l](f, ...n)); })({ key: CFG.mapsApiKey, v: "weekly", language: "ja", region: "JP" });
      Promise.all([google.maps.importLibrary("maps"), google.maps.importLibrary("marker")]).then(resolve, reject);
    });
    return apiPromise;
  }

  async function ensureMap() {
    await loadApi();
    if (!map) {
      map = new google.maps.Map($("map"), {
        mapId: CFG.mapId, center: { lat: 36.2, lng: 138.8 }, zoom: 7,
        fullscreenControl: true, mapTypeControl: false, streetViewControl: false, clickableIcons: false,
      });
      info = new google.maps.InfoWindow();
    }
    return map;
  }

  function clearLayers() {
    for (const l of layers) { if (l instanceof google.maps.marker.AdvancedMarkerElement) l.map = null; else l.setMap(null); }
    layers = [];
    candMarkers = new Map();
  }

  // 主要地点のピン(絵文字または番号)+ 下に名前ラベル
  function pinEl({ color, glyph, scale = 1, label }) {
    const pin = new google.maps.marker.PinElement({ background: color, borderColor: "#ffffff", glyphColor: "#ffffff", glyph, scale });
    const glyphEl = pin.element.querySelector(".gm-glyph, [class*='glyph']");
    const wrap = document.createElement("div");
    wrap.className = "mk mk-pin";
    wrap.appendChild(pin.element);
    if (label) { const l = document.createElement("div"); l.className = "mk-l"; l.textContent = label; wrap.appendChild(l); }
    return wrap;
  }
  // 候補の丸いアイコン(種類の絵文字)。選択済みは黒い縁と名前ラベル
  function dotEl({ color, icon, picked, label, small }) {
    const wrap = document.createElement("div");
    wrap.className = "mk mk-dot" + (picked ? " mk-picked" : "");
    const i = document.createElement("div"); i.className = "mk-i" + (small ? " mk-s" : ""); i.style.background = color; i.textContent = icon;
    wrap.appendChild(i);
    if (label) { const l = document.createElement("div"); l.className = "mk-l"; l.textContent = label; wrap.appendChild(l); }
    return wrap;
  }

  function marker(p, { color, glyph, scale = 1, zIndex = 1, html, content, label, el }) {
    const m = new google.maps.marker.AdvancedMarkerElement({ map, position: { lat: Number(p.lat), lng: Number(p.lon) }, title: p.name || "", content: el || pinEl({ color, glyph, scale, label }), zIndex });
    if (html || content) m.addListener("click", () => openInfo(m, html, content));
    layers.push(m);
    return m;
  }

  function openInfo(m, html, content) {
    if (content) info.setContent(content);
    else info.setContent(`<div class="gm-pop">${html}</div>`);
    info.open({ anchor: m, map });
  }

  function line(points, color, dashed) {
    const path = points.map(([lat, lon]) => ({ lat, lng: lon }));
    const opts = dashed
      ? { path, strokeOpacity: 0, icons: [{ icon: { path: "M 0,-1 0,1", strokeOpacity: 0.9, strokeColor: color, scale: 3 }, offset: "0", repeat: "14px" }] }
      : { path, strokeColor: color, strokeOpacity: 0.85, strokeWeight: 5 };
    const pl = new google.maps.Polyline({ ...opts, map, clickable: false });
    layers.push(pl);
    return pl;
  }

  // ---- 候補(段階3)

  function candBadges(c) {
    const cat = CAT[c.cat] || CAT.other;
    return [`<span class="badge"><span class="mk-i mk-inline" style="background:${cat.color}">${esc(candIcon(c))}</span>${esc(cat.label)}</span>`, c.dogRun ? '<span class="badge b-run">ドッグラン</span>' : "", c.cert ? '<span class="badge">証明書</span>' : ""].join("");
  }

  // 吹き出しの中身(DOM で作ってボタンに処理を付ける)
  function candPopup(c) {
    const picked = picks.has(c.id);
    const wrap = document.createElement("div");
    wrap.className = "gm-pop";
    wrap.innerHTML = `<b>${esc(c.name)}</b><br>${candBadges(c)}<br><span class="gm-note">${esc(c.area || "")}・ルートから直線${esc(distText(c.distance))}・寄り道の目安 +${detourMin(c.distance)}分(概算。正確な差は再計算で)${c.theme ? "<br>" + esc(c.theme) : ""}${c.checkedAt ? `<br>掲載情報の確認日 ${esc(c.checkedAt)}` : ""}</span>
      ${c.url ? `<br><a href="${esc(c.url)}" target="_blank" rel="noopener">施設情報を開く</a>` : ""}
      <div class="gm-act"><label>滞在 <select class="gm-stay">${stayChoices().map((m) => `<option value="${m}"${m === (picks.get(c.id)?.stayMin || 60) ? " selected" : ""}>${fmtStay(m)}</option>`).join("")}</select></label>
      <button type="button" class="gm-btn">${picked ? "候補から外す" : "この場所を選ぶ"}</button></div>`;
    wrap.querySelector(".gm-btn").addEventListener("click", () => {
      if (picks.has(c.id)) unpick(c.id); else pick(c, Number(wrap.querySelector(".gm-stay").value));
      info.close();
    });
    wrap.querySelector(".gm-stay").addEventListener("change", (ev) => { const p = picks.get(c.id); if (p) { p.stayMin = Number(ev.target.value); renderPicks(); } });
    return wrap;
  }

  function candMarker(c) {
    const cat = CAT[c.cat] || CAT.other;
    const picked = picks.has(c.id);
    const icon = candIcon(c);
    const m = marker(c, { zIndex: picked ? 3 : 1, el: dotEl({ color: picked ? COLOR.picked : cat.color, icon: picked ? "✓" : icon, picked, label: picked ? shortName(c.name) : "", small: c.cat === "rest" && icon.length > 2 }) });
    m.addListener("click", () => { setActive(c.id, false); openInfo(m, null, candPopup(c)); });
    candMarkers.set(c.id, m);
    return m;
  }

  function drawCandidates() {
    for (const m of candMarkers.values()) { m.map = null; layers = layers.filter((l) => l !== m); }
    candMarkers = new Map();
    const cands = pending?.candidates || [];
    const f = filters();
    let shownCount = 0;
    const counts = {};
    for (const c of cands) {
      counts[c.cat] = (counts[c.cat] || 0) + 1;
      if (!f.has(c.cat) && !picks.has(c.id)) continue;  // 絞り込みで隠しても、選択済みは残す
      candMarker(c); shownCount++;
    }
    const cn = $("map-cand-note");
    if (cn) {
      cn.classList.toggle("hidden", !cands.length && !pending);
      cn.textContent = cands.length
        ? `ルートから直線${pending.candidateKm || 8}km以内の候補 ${cands.length}件(${Object.entries(counts).map(([k, n]) => `${(CAT[k] || CAT.other).label} ${n}`).join("・")})。表示中 ${shownCount}件。印をタップして「この場所を選ぶ」。複数選べます。`
        : "ルートから近い候補が見つかりませんでした(位置が施設まで分かる場所だけを出しています)。";
    }
  }

  function pick(c, stayMin) {
    picks.set(c.id, { cand: c, stayMin: stayMin || 60 });
    activeId = c.id;
    refreshAfterPick();
  }
  function unpick(id) { picks.delete(id); if (activeId === id) activeId = null; refreshAfterPick(); }
  function refreshAfterPick() {
    if (map && !failed && shown) drawCandidates();
    renderPicks();
  }

  function setActive(id, pan) {
    activeId = id;
    document.querySelectorAll("#map-picks li").forEach((li) => li.classList.toggle("active", li.dataset.id === id));
    const m = candMarkers.get(id);
    if (pan && m && map) { map.panTo(m.position); if (map.getZoom() < 11) map.setZoom(11); openInfo(m, null, candPopup(picks.get(id)?.cand)); }
  }

  // 選択済みリスト(複数)。行をタップで地図へ、滞在時間の変更、削除。立ち寄りに入れる順は経路に沿った順(planner.js が並べ替える)
  function renderPicks() {
    const wrap = $("map-picks-wrap"), list = $("map-picks");
    if (!wrap || !list) return;
    const items = [...picks.values()].sort((a, b) => a.cand.along - b.cand.along);
    wrap.classList.toggle("hidden", !items.length && !pending?.candidates?.length);
    $("map-picks-count").textContent = items.length ? `${items.length}件選択中` : "まだ選んでいません";
    $("map-apply").disabled = !items.length;
    const max = pending?.maxWaypoints || 3;
    list.innerHTML = items.map(({ cand: c, stayMin }, i) => `<li data-id="${esc(c.id)}"${c.id === activeId ? ' class="active"' : ""}>
      <span class="pk-no">${i + 1}</span>
      <span class="pk-name"><b>${esc(c.name)}</b> ${candBadges(c)}<br><span class="note">${esc(c.area || "")}・ルートから${esc(distText(c.distance))}・寄り道の目安 +${detourMin(c.distance)}分${i >= max ? `・${max}か所の上限を超えるため立ち寄りには入りません` : ""}</span></span>
      <select class="pk-stay" aria-label="滞在時間">${stayChoices().map((m) => `<option value="${m}"${m === stayMin ? " selected" : ""}>滞在 ${fmtStay(m)}</option>`).join("")}</select>
      ${c.url ? `<a class="pk-link" href="${esc(c.url)}" target="_blank" rel="noopener">詳細</a>` : ""}
      <button type="button" class="sub pk-del" aria-label="候補から外す">外す</button></li>`).join("");
    list.querySelectorAll("li").forEach((li) => {
      const id = li.dataset.id;
      li.querySelector(".pk-name").addEventListener("click", () => { if (!shown) show(); setActive(id, true); });
      li.querySelector(".pk-stay").addEventListener("change", (ev) => { picks.get(id).stayMin = Number(ev.target.value); });
      li.querySelector(".pk-del").addEventListener("click", () => unpick(id));
    });
  }

  function applyPicks() {
    if (!pending?.onApply || !picks.size) return;
    const items = [...picks.values()].map(({ cand, stayMin }) => ({ label: cand.label, name: cand.name, stayMin, along: cand.along, id: cand.id }));
    const r = pending.onApply(items) || { used: [], over: [] };
    for (const u of r.used) { const hit = items.find((x) => x.label === u.label); if (hit) picks.delete(hit.id); }
    const pn = $("map-pick-note");
    if (pn) pn.textContent = `${r.used.length}か所を立ち寄り先に入れて再計算しています。` + (r.over.length ? `${r.over.map((x) => x.name).join("・")} は立ち寄り${pending.maxWaypoints || 3}か所の上限で入れていません。到着後に回る場所は下の「近くの掲載先」で選べます。` : "");
    renderPicks();
  }

  // data: { origin, destination, waypoints, rests, legs:[{points, back}], returnWaypoints, returnRests, candidates, onApply, maxWaypoints, stayChoices, summary }
  function draw(data) {
    clearLayers();
    if (!data) return;
    const bounds = new google.maps.LatLngBounds();
    const extend = (p) => bounds.extend({ lat: Number(p.lat), lng: Number(p.lon) });
    for (const leg of data.legs || []) {
      if (!leg.points || leg.points.length < 2) continue;
      line(leg.points, leg.back ? COLOR.back : COLOR.go, Boolean(leg.back));
      for (const pt of leg.points) bounds.extend({ lat: pt[0], lng: pt[1] });
    }
    const link = (url, label) => (url ? `<br><a href="${esc(url)}" target="_blank" rel="noopener">${esc(label)}</a>` : "");
    (data.rests || []).forEach((r) => { marker(r, { color: COLOR.rest, glyph: ICON.rest, scale: 0.9, zIndex: 4, label: `休憩 ${shortName(r.name)}`, html: `<b>${esc(r.name)}</b><br>${esc(r.kind || "")} 休憩${esc(r.note || "")}` }); extend(r); });
    (data.returnRests || []).forEach((r) => { marker(r, { color: COLOR.back, glyph: ICON.rest, scale: 0.9, zIndex: 4, label: `帰り休憩 ${shortName(r.name)}`, html: `<b>${esc(r.name)}</b><br>${esc(r.kind || "")} 帰りの休憩` }); extend(r); });
    (data.waypoints || []).forEach((w, i) => { marker(w, { color: COLOR.via, glyph: String(i + 1), scale: 1.05, zIndex: 5, label: `立ち寄り${i + 1} ${shortName(w.name)}`, html: `<b>${esc(w.name)}</b><br>立ち寄り${i + 1}${w.kind ? "・" + esc(w.kind) : ""}${w.stayMin ? `・滞在${esc(w.stayMin)}分` : ""}${link(w.url, "施設情報を開く")}` }); extend(w); });
    (data.returnWaypoints || []).forEach((w, i) => { marker(w, { color: COLOR.back, glyph: String(i + 1), scale: 1.05, zIndex: 5, label: `帰りに経由${i + 1} ${shortName(w.name)}`, html: `<b>${esc(w.name)}</b><br>帰り道に経由${w.kind ? "・" + esc(w.kind) : ""}${w.stayMin ? `・滞在${esc(w.stayMin)}分` : ""}${link(w.url, "施設情報を開く")}` }); extend(w); });
    if (data.origin) { marker(data.origin, { color: COLOR.origin, glyph: ICON.origin, scale: 1.15, zIndex: 6, label: `出発 ${shortName(data.origin.name)}`, html: `<b>${esc(data.origin.name)}</b><br>出発地` }); extend(data.origin); }
    if (data.destination) { marker(data.destination, { color: COLOR.dest, glyph: ICON.dest, scale: 1.25, zIndex: 7, label: `行き先 ${shortName(data.destination.name)}`, html: `<b>${esc(data.destination.name)}</b><br>行き先${link(data.destination.url, "条件を見る")}` }); extend(data.destination); }
    if (!bounds.isEmpty()) map.fitBounds(bounds, 40);
    drawCandidates();
  }

  async function show() {
    if (shown || failed) return;
    shown = true;
    $("map").classList.remove("hidden");
    $("map-show")?.classList.add("hidden");
    $("map-filters")?.classList.remove("hidden");
    note("地図を読み込んでいます…");
    try {
      await ensureMap();
      draw(pending);
      note(pending?.summary || "");
    } catch (e) {
      failed = true;
      $("map").classList.add("hidden");
      if (!/auth/.test(String(e && e.message))) note("地図を読み込めませんでした。行程表と候補の一覧はそのまま使えます。");
    }
  }

  window.RouteMap = {
    // planner.js から、プランを描き直すたびに呼ぶ(通信なし)
    render(data) {
      pending = data;
      if (!enabled()) return;
      // 候補から消えた選択(立ち寄りに入れた・経路が変わった)は外す
      const ids = new Set((data?.candidates || []).map((c) => c.id));
      for (const id of [...picks.keys()]) if (!ids.has(id)) picks.delete(id);
      $("map-card").classList.remove("hidden");
      if (shown && map && !failed) { draw(data); note(data?.summary || ""); }
      else if (!shown) {
        note(data?.summary || "");
        // 広い画面では最初から表示する。小さい画面は行程表が主なのでボタンで開く
        if (window.matchMedia("(min-width: 720px)").matches) show();
      }
      renderPicks();
    },
    hide() { pending = null; $("map-card")?.classList.add("hidden"); if (map && !failed) clearLayers(); },
  };
  $("map-show")?.addEventListener("click", show);
  $("map-apply")?.addEventListener("click", applyPicks);
  $("map-clear")?.addEventListener("click", () => { picks.clear(); activeId = null; refreshAfterPick(); });
  document.querySelectorAll("#map-filters input").forEach((i) => i.addEventListener("change", () => { if (map && shown && !failed) drawCandidates(); }));
})();
