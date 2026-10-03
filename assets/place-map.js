// design-pass-2 (2026-10-04): 「地図で見る」の点の地図。開いたときだけ Leaflet(cdnjs)と座標ファイル(route-planner/data/map-points.json、
// tools/build_map_points.py で places.json から作る)を読み込む。地図タイルは OpenStreetMap(API キー不要、クレジット表示が必要)。
// 表示するピンは、いまページの絞り込み(チップ・地域・文字検索)を通っているカードだけ。JS や地図が使えなくても一覧はそのまま使える。
(() => {
  const CDN = "https://cdnjs.cloudflare.com/ajax/libs/";
  const ASSETS = [
    ["css", CDN + "leaflet/1.9.4/leaflet.css", "sha512-Zcn6bjR/8RZbLEpLIeOwNtzREBAJnUKESxces60Mpoj+2okopSAcSUIUOseddDm0cxnGQzxIR7vJgsLZbdLE3w=="],
    ["css", CDN + "leaflet.markercluster/1.5.3/MarkerCluster.min.css", "sha512-ENrTWqddXrLJsQS2A86QmvA17PkJ0GVm1bqj5aTgpeMAfDKN2+SIOLpKG8R/6KkimnhTb+VW5qqUHB/r1zaRgg=="],
    ["js", CDN + "leaflet/1.9.4/leaflet.js", "sha512-BwHfrr4c9kmRkLw6iXFdzcdWV/PGkVgiIyIWLLlTSXzWQzxuSg4DiQUCpauz/EWjgk5TYQqX/kvn9pG1NpYfqg=="],
    ["js", CDN + "leaflet.markercluster/1.5.3/leaflet.markercluster.min.js", "sha512-TiMWaqipFi2Vqt4ugRzsF8oRoGFlFFuqIi30FFxEPNw58Ov9mOy6LgC05ysfkxwLE0xVeZtmr92wVg9siAFRWA=="],
  ];
  const POINTS_URL = "route-planner/data/map-points.json?v=20261004";
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const loadOne = ([kind, url, sri]) => new Promise((resolve, reject) => {
    const el = document.createElement(kind === "css" ? "link" : "script");
    if (kind === "css") { el.rel = "stylesheet"; el.href = url; } else { el.src = url; el.async = false; }
    el.integrity = sri; el.crossOrigin = "anonymous"; el.referrerPolicy = "no-referrer";
    el.onload = resolve; el.onerror = () => reject(new Error("load failed: " + url));
    document.head.append(el);
  });
  let libPromise = null, pointsPromise = null;
  const loadLib = () => libPromise || (libPromise = Promise.all(ASSETS.map(loadOne)));
  const loadPoints = () => pointsPromise || (pointsPromise = fetch(POINTS_URL).then((r) => { if (!r.ok) throw new Error("points " + r.status); return r.json(); })
    .then((rows) => new Map(rows.map(([id, lat, lon, type]) => [id, { lat, lon, type }]))));

  function mount(host, opts) {
    const { cards, idOf, nameOf, areaOf, unit = "件" } = opts;
    host.classList.add("wmap-loading");
    host.innerHTML = '<p class="wmap-msg">地図を読み込んでいます…</p>';
    const note = document.createElement("p"); note.className = "wmap-note"; host.after(note);
    let map = null, layer = null, points = null;
    const ctl = { count: 0, refresh() { if (map) { map.invalidateSize(); update(true); } } };

    function update(fit) {
      if (!map) return;
      const visible = cards.filter((c) => !c.hidden);
      const markers = []; let missing = 0;
      visible.forEach((card) => {
        const p = points.get(idOf(card));
        if (!p) { missing++; return; }
        const m = L.marker([p.lat, p.lon], {
          icon: L.divIcon({ className: "wmap-pin wmap-" + (p.type === "lodging" ? "lodging" : "spot"), html: "<span></span>", iconSize: [20, 20], iconAnchor: [10, 10], popupAnchor: [0, -8] }),
          title: nameOf(card), alt: nameOf(card), keyboard: true,
        });
        m.bindPopup(() => `<div class="wmap-pop"><b>${esc(nameOf(card))}</b><small>${esc(areaOf(card))}</small><a href="#${esc(idOf(card))}" data-wmap-goto>カードを見る ↓</a></div>`);
        markers.push(m);
      });
      layer.clearLayers(); layer.addLayers(markers);
      ctl.count = markers.length; host.dataset.markers = String(markers.length); host.dataset.visible = String(visible.length);
      note.textContent = `地図のピン ${markers.length}${unit}` + (missing ? `(位置が未登録の ${missing}${unit}は一覧だけに表示)` : "") + "。";
      if (fit && markers.length) {
        const b = L.latLngBounds(markers.map((m) => m.getLatLng()));
        map.fitBounds(b, { padding: [24, 24], maxZoom: 13 });
      }
    }

    Promise.all([loadLib(), loadPoints()]).then(([, pts]) => {
      points = pts; host.classList.remove("wmap-loading"); host.innerHTML = "";
      map = L.map(host, { scrollWheelZoom: false, zoomControl: true }).setView([36.2, 139.6], 7);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
      }).addTo(map);
      layer = L.markerClusterGroup({
        showCoverageOnHover: false, maxClusterRadius: 48, chunkedLoading: true,
        iconCreateFunction: (cl) => { const n = cl.getChildCount(); return L.divIcon({ className: "wmap-cluster", html: `<span>${n}</span>`, iconSize: n < 100 ? [38, 38] : [46, 46] }); },
      }).addTo(map);
      map.on("focus click", () => map.scrollWheelZoom.enable());
      map.on("blur mouseout", () => map.scrollWheelZoom.disable());
      host.addEventListener("click", (e) => {
        const a = e.target.closest && e.target.closest("a[data-wmap-goto]");
        if (!a) return;
        map.closePopup();
        const card = document.getElementById(a.getAttribute("href").slice(1));
        if (card) { e.preventDefault(); card.scrollIntoView({ block: "start", behavior: "instant" }); history.replaceState(null, "", a.getAttribute("href")); card.setAttribute("tabindex", "-1"); card.focus({ preventScroll: true }); }
      });
      update(true);
      let t; document.addEventListener("wanko:filtered", () => { clearTimeout(t); t = setTimeout(() => update(true), 60); });
    }).catch(() => {
      host.classList.remove("wmap-loading"); host.classList.add("wmap-failed");
      host.innerHTML = '<p class="wmap-msg">地図を読み込めませんでした。通信状況を確かめるか、下の一覧をご利用ください。</p>';
    });
    return ctl;
  }
  window.WankoPlaceMap = { mount };

  // 宿ページ: 検索バー(editorial.js が作る)に「地図で見る」を足す。お出かけページは explore.js のパネルから mount する
  const row = document.querySelector(".stay-search-row");
  const stays = [...document.querySelectorAll(".stay-card")];
  if (!row || !stays.length) return;
  const btn = document.createElement("button");
  btn.type = "button"; btn.className = "map-toggle stay-map-toggle"; btn.setAttribute("aria-expanded", "false"); btn.setAttribute("aria-controls", "stay-map");
  btn.innerHTML = '<span aria-hidden="true">◎</span> 地図で見る';
  row.append(btn);
  const panel = document.createElement("section");
  panel.id = "stay-map"; panel.className = "map-panel stay-map-panel"; panel.hidden = true; panel.setAttribute("aria-label", "地図で見る(絞り込み中の宿)");
  panel.innerHTML = '<div class="map-head"><p>いまの条件に合う宿を地図に表示します。ピンを押すと宿の名前とカードへのリンクが出ます。</p><button type="button" class="map-close">閉じる</button></div><div class="wmap" id="stay-leaflet" role="region" aria-label="宿の地図"></div>';
  const anchor = document.querySelector(".stay-chip-note") || row.parentElement;
  anchor.after(panel);
  let ctl = null;
  const name = (c) => ((c.querySelector(".stay-head h2") || {}).textContent || "").trim();
  const area = (c) => ((c.querySelector(".stay-head p") || {}).textContent || "").trim();
  function toggle(open) {
    panel.hidden = !open; btn.setAttribute("aria-expanded", String(open)); btn.classList.toggle("active", open);
    btn.lastChild.textContent = open ? " 地図を閉じる" : " 地図で見る";
    if (open) {
      if (!ctl) ctl = mount(panel.querySelector(".wmap"), { cards: stays, idOf: (c) => c.dataset.lodgingId || c.id, nameOf: name, areaOf: area, unit: "宿" });
      else ctl.refresh();
      if (window.matchMedia("(max-width:700px)").matches) panel.querySelector(".wmap").scrollIntoView({ block: "center", behavior: "instant" });
    } else btn.focus();
  }
  btn.addEventListener("click", () => toggle(panel.hidden));
  panel.querySelector(".map-close").addEventListener("click", () => toggle(false));
})();
