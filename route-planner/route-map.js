// 旅行プランの地図(段階2): 出発地・立ち寄り先・休憩・行き先と、選択中の出発時刻の経路を Google マップに表示する。
// 経路は Google Routes API の結果(planner.js が各区間に保存した polyline)なので、規約上 Google マップに重ねる。
// 地図の操作では Routes API を呼ばない(表示だけ)。地図が読めない環境でも行程表はそのまま使える。
(() => {
  const CFG = window.PLANNER_CONFIG || {};
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const COLOR = { origin: "#2e7d4f", dest: "#b3261e", via: "#c0612b", rest: "#6f665d", go: "#c0612b", back: "#1f5fa8" };

  let apiPromise = null;   // Maps JavaScript API の読み込み(1 回だけ)
  let map = null;          // google.maps.Map(1 ページ 1 回だけ作る = Dynamic Maps の課金は 1 回)
  let info = null;
  let layers = [];         // 今描いているマーカー・経路(描き直すときに消す)
  let pending = null;      // 最新の表示データ(地図がまだ無いときに取っておく)
  let shown = false;
  let failed = false;

  const enabled = () => Boolean(CFG.mapEnabled && CFG.mapsApiKey && CFG.mapId && $("map"));
  const note = (text) => { const n = $("map-note"); if (n) n.textContent = text; };

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
  }

  function marker(p, { color, glyph, scale = 1, zIndex = 1, html }) {
    const pin = new google.maps.marker.PinElement({ background: color, borderColor: "#ffffff", glyphColor: "#ffffff", glyph, scale });
    const m = new google.maps.marker.AdvancedMarkerElement({ map, position: { lat: Number(p.lat), lng: Number(p.lon) }, title: p.name || "", content: pin.element, zIndex });
    if (html) m.addListener("click", () => { info.setContent(`<div style="font:14px/1.5 system-ui,sans-serif;color:#2b2622;max-width:240px">${html}</div>`); info.open({ anchor: m, map }); });
    layers.push(m);
    return m;
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

  // data: { origin, destination, waypoints: [{lat, lon, name, kind, url, stayMin}], rests: [{lat, lon, name, kind}],
  //         legs: [{ points: [[lat,lon],...], back: bool }], returnWaypoints, returnRests }
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
    (data.rests || []).forEach((r) => { marker(r, { color: COLOR.rest, glyph: "休", scale: 0.8, zIndex: 2, html: `<b>${esc(r.name)}</b><br>${esc(r.kind || "")} 休憩${esc(r.note || "")}` }); extend(r); });
    (data.returnRests || []).forEach((r) => { marker(r, { color: COLOR.back, glyph: "休", scale: 0.8, zIndex: 2, html: `<b>${esc(r.name)}</b><br>${esc(r.kind || "")} 帰りの休憩` }); extend(r); });
    (data.waypoints || []).forEach((w, i) => { marker(w, { color: COLOR.via, glyph: String(i + 1), zIndex: 3, html: `<b>${esc(w.name)}</b><br>立ち寄り${i + 1}${w.kind ? "・" + esc(w.kind) : ""}${w.stayMin ? `・滞在${esc(w.stayMin)}分` : ""}${link(w.url, "施設情報を開く")}` }); extend(w); });
    (data.returnWaypoints || []).forEach((w, i) => { marker(w, { color: COLOR.back, glyph: String(i + 1), zIndex: 3, html: `<b>${esc(w.name)}</b><br>帰り道に経由${w.kind ? "・" + esc(w.kind) : ""}${w.stayMin ? `・滞在${esc(w.stayMin)}分` : ""}${link(w.url, "施設情報を開く")}` }); extend(w); });
    if (data.origin) { marker(data.origin, { color: COLOR.origin, glyph: "発", zIndex: 4, html: `<b>${esc(data.origin.name)}</b><br>出発地` }); extend(data.origin); }
    if (data.destination) { marker(data.destination, { color: COLOR.dest, glyph: "着", scale: 1.15, zIndex: 5, html: `<b>${esc(data.destination.name)}</b><br>行き先${link(data.destination.url, "条件を見る")}` }); extend(data.destination); }
    if (!bounds.isEmpty()) map.fitBounds(bounds, 40);
  }

  async function show() {
    if (shown || failed) return;
    shown = true;
    $("map").classList.remove("hidden");
    $("map-show")?.classList.add("hidden");
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
      $("map-card").classList.remove("hidden");
      if (shown && map && !failed) { draw(data); note(data?.summary || ""); }
      else if (!shown) {
        note(data?.summary || "");
        // 広い画面では最初から表示する。小さい画面は行程表が主なのでボタンで開く
        if (window.matchMedia("(min-width: 720px)").matches) show();
      }
    },
    hide() { pending = null; $("map-card")?.classList.add("hidden"); if (map && !failed) clearLayers(); },
  };
  $("map-show")?.addEventListener("click", show);
})();
