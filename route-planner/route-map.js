// 旅行プランの地図(段階2・3): 出発地・立ち寄り先・休憩・行き先と、選択中の出発時刻の経路を Google マップに表示し、
// 経路沿いの中継地候補(ドッグラン・カフェ・公園・SA・PA・道の駅など)を印で出して、複数選んで立ち寄り先に入れられる。
// 経路は Google Routes API の結果(planner.js が各区間に保存した polyline)なので、規約上 Google マップに重ねる。
// 地図の操作・候補の選択では Routes API を呼ばない。再計算は「立ち寄りに入れて再計算」を押したときだけ(planner.js の onApply)。
// 印の形: 経路に入っている地点 = しずく形のピン(立ち寄りは白い丸の番号 ①②③)、候補 = 丸形、候補のまとまり = 白い丸「候補 N件」。
// 絵柄はこのファイルの自作の線画(SVG)。地図・種類のチップ・地図の見方・選んだ一覧で同じものを使う。
(() => {
  const CFG = window.PLANNER_CONFIG || {};
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const COLOR = { origin: "#2e7d4f", dest: "#b3261e", via: "#c0612b", rest: "#6f665d", go: "#c0612b", back: "#1f5fa8" };
  // 候補の種類: 色・絵柄・表示名(planner.js の candCategory と対応。種類は増やさない)
  const CAT = {
    run: { color: "#2e7d4f", icon: "run", label: "ドッグラン" },
    cafe: { color: "#a8571f", icon: "cafe", label: "カフェ・食事" },
    park: { color: "#3b7ea1", icon: "park", label: "公園・観光" },
    animal: { color: "#8a6d3b", icon: "animal", label: "動物・牧場" },
    shopping: { color: "#7b4fa3", icon: "shopping", label: "買い物" },
    rest: { color: "#6f665d", icon: "rest", label: "SA・PA・道の駅" },
    other: { color: "#857a70", icon: "info", label: "その他" },
  };
  // 自作の絵柄(24×24)。白で描き、くり抜く部分は下地の色 bg で塗る
  const W = '#fff';
  const line = (d, w = 2) => `<path d="${d}" fill="none" stroke="${W}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
  const SVG = {
    run: () => line("M3.5 21v-8l1.8-2 1.8 2v8M16.9 21v-8l1.8-2 1.8 2v8M3.5 16.2h17M3.5 20h17", 1.7)
      + `<ellipse cx="12" cy="11.4" rx="2.7" ry="2.2" fill="${W}"/><circle cx="8.9" cy="7.9" r="1.3" fill="${W}"/><circle cx="12" cy="6.2" r="1.3" fill="${W}"/><circle cx="15.1" cy="7.9" r="1.3" fill="${W}"/>`,
    cafe: () => `<path d="M4.5 9h11v4.6a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5z" fill="${W}"/>` + line("M15.5 10.6h1.7a2.5 2.5 0 0 1 0 5h-2M3.5 21.2h14M8 3.4c-.9 1 .9 2 0 3.2M11.6 3.4c-.9 1 .9 2 0 3.2", 1.7),
    park: () => `<path d="M12 2.4l5.6 7.4h-2.9l4.4 6.2H4.9l4.4-6.2H6.4z" fill="${W}"/>` + line("M12 16v5.4", 2.6),
    animal: (bg) => line("M8.6 7.6C7.7 5.7 8.1 4.3 9.4 3.6M15.4 7.6c.9-1.9.5-3.3-.8-4", 1.6)
      + `<path d="M7 8.6 2.6 7.9l1.2 3.4H7zM17 8.6l4.4-.7-1.2 3.4H17z" fill="${W}"/><path d="M7 7.4h10v7.6a5 5 0 0 1-10 0z" fill="${W}"/>`
      + `<circle cx="9.7" cy="11" r="1" fill="${bg}"/><circle cx="14.3" cy="11" r="1" fill="${bg}"/><ellipse cx="12" cy="16.3" rx="3.3" ry="2.2" fill="${bg}"/><circle cx="10.8" cy="16.3" r=".7" fill="${W}"/><circle cx="13.2" cy="16.3" r=".7" fill="${W}"/>`,
    shopping: (bg) => `<path d="M5 8.6h14l-1.2 12.6H6.2z" fill="${W}"/>` + line("M8.9 11V7.2a3.1 3.1 0 0 1 6.2 0V11", 1.8) + `<circle cx="8.9" cy="11.2" r=".9" fill="${bg}"/><circle cx="15.1" cy="11.2" r=".9" fill="${bg}"/>`,
    rest: () => `<path d="M2.2 11 12 4.2 21.8 11z" fill="${W}"/>` + line("M5.4 11v10M18.6 11v10", 2) + line("M8.2 15.4h7.6M9 15.4v4M15 15.4v4", 1.8),
    info: (bg) => `<path d="M12 2a7 7 0 0 0-7 7c0 5.3 7 13 7 13s7-7.7 7-13a7 7 0 0 0-7-7z" fill="${W}"/><circle cx="12" cy="6.3" r="1.3" fill="${bg}"/><rect x="10.9" y="8.5" width="2.2" height="5.2" rx=".8" fill="${bg}"/>`,
    bed: () => line("M3 6v14M3 15.8h18V20M21 15.8v-3.3a2.4 2.4 0 0 0-2.4-2.4H11v5.7", 2) + `<circle cx="7" cy="12.6" r="2" fill="${W}"/>`,
    car: (bg) => `<path d="M2.4 16.6v-4.2L5 7.5h10.6l4.4 4.4h1a1.5 1.5 0 0 1 1.5 1.5v3.2z" fill="${W}"/><path d="M6.3 9.2h3.8v3H5.1zM11.7 9.2h3.3l2.9 3h-6.2z" fill="${bg}"/>`
      + `<circle cx="7" cy="17" r="2.5" fill="${W}" stroke="${bg}" stroke-width="1.4"/><circle cx="17" cy="17" r="2.5" fill="${W}" stroke="${bg}" stroke-width="1.4"/>`,
    flag: () => line("M5.6 21.6V3", 2.2) + `<path d="M6.6 3.8h12.2l-3 4.2 3 4.2H6.6z" fill="${W}"/>`,
    check: () => line("M5 12.6l4.5 4.5L19 7.5", 3.2),
  };
  const svgIcon = (name, bg = "#000") => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${(SVG[name] || SVG.info)(bg)}</svg>`;
  const circled = (n) => (n >= 1 && n <= 20 ? String.fromCharCode(0x2460 + n - 1) : `(${n})`);
  const shortName = (name, n = 14) => (name.length > n ? name.slice(0, n - 1) + "…" : name);
  const APPROX_NOTE = "位置は地域の目安(市町村などの代表点)です。地図の場所と実際の施設の場所は違います。";
  const narrow = () => window.matchMedia("(max-width: 719px)").matches;
  const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let apiPromise = null;   // Maps JavaScript API の読み込み(1 回だけ)
  let map = null;          // google.maps.Map(1 ページ 1 回だけ作る = Dynamic Maps の課金は 1 回)
  let info = null;
  let layers = [];         // 今描いているマーカー・経路(描き直すときに消す)
  let candMarkers = new Map(); // 候補 id → マーカー
  let clusterer = null;        // MarkerClusterer(密集した候補をまとめる)。読み込めなければ null のまま
  let clusterLib = null;       // 読み込みの Promise
  let routeBounds = null;      // 経路全体の範囲(「ルート全体」ボタンで戻る先)
  let activeMarker = null;     // いま押している印(名前ラベルを出す・強調する)
  let detailFor = null;        // 地図の下の詳細欄に出している候補 id(スマホ)
  const CLUSTER_SRC = "https://unpkg.com/@googlemaps/markerclusterer@2.5.3/dist/index.min.js";
  function loadClusterer() {
    if (clusterLib) return clusterLib;
    clusterLib = new Promise((resolve) => {
      if (window.markerClusterer?.MarkerClusterer) return resolve(true);
      const sc = document.createElement("script"); sc.src = CLUSTER_SRC; sc.async = true;
      sc.onload = () => resolve(Boolean(window.markerClusterer?.MarkerClusterer)); sc.onerror = () => resolve(false);
      document.head.appendChild(sc);
    });
    return clusterLib;
  }
  // 候補のまとまりの印: 白い丸に「候補 N件」(番号ピンと形も文言も別)。タップでその範囲へズーム(ライブラリ既定)
  const clusterHtml = (count) => `<div class="mk-i"><small>候補</small><b>${count}件</b></div>`;
  const clusterRenderer = { render: ({ count, position }) => {
    const el = document.createElement("div"); el.className = "mk mk-dot mk-cluster";
    el.innerHTML = clusterHtml(count);
    return new google.maps.marker.AdvancedMarkerElement({ position, content: el, zIndex: 2, title: `候補のまとまり ${count}件(押すと拡大)` });
  } };
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
  const STALE_TEXT = "条件を変えたか再計算中のため、適用は新しい結果が出てから行えます。";

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
      info.addListener("closeclick", () => setActiveMarker(null));
      // 候補を見て回ったあとでも、ボタン 1 つで経路全体に戻れる
      const fit = document.createElement("button");
      fit.type = "button"; fit.className = "map-fit"; fit.textContent = "ルート全体";
      fit.setAttribute("aria-label", "ルート全体が見える縮尺に戻す");
      fit.addEventListener("click", fitRoute);
      map.controls[google.maps.ControlPosition.LEFT_TOP].push(fit);
    }
    return map;
  }
  function fitRoute() { if (map && routeBounds && !routeBounds.isEmpty()) map.fitBounds(routeBounds, narrow() ? 24 : 40); }

  function clearLayers() {
    for (const l of layers) { if (l instanceof google.maps.marker.AdvancedMarkerElement) l.map = null; else l.setMap(null); }
    layers = [];
    candMarkers = new Map();
    activeMarker = null;
  }

  // 経路に入っている地点のピン(しずく形)。中は絵柄、立ち寄りは白い丸に番号(①②③)。位置が地域の目安なら点線の縁と「目安」の札
  function pinHtml({ color, icon, num, approx }) {
    return `<svg class="mk-shape" viewBox="0 0 32 42" aria-hidden="true" focusable="false"><path d="M16 1.6C8 1.6 1.6 7.9 1.6 15.8 1.6 26.4 16 40.4 16 40.4S30.4 26.4 30.4 15.8C30.4 7.9 24 1.6 16 1.6z" fill="${color}" stroke="#fff" stroke-width="2.6"${approx ? ' stroke-dasharray="4 2.6"' : ""}/></svg>`
      + `<span class="mk-g">${num ? `<span class="mk-no" style="color:${color}">${num}</span>` : svgIcon(icon, color)}</span>`
      + (approx ? '<span class="mk-tag">目安</span>' : "");
  }
  // 候補の丸形の印(種類の絵柄)。選んだ候補(まだ経路に入っていない)は黒い縁とチェックの札
  function dotHtml({ cat, picked }) {
    return `<span class="mk-i" style="background:${cat.color}">${svgIcon(cat.icon, cat.color)}</span>` + (picked ? `<span class="mk-chk">${svgIcon("check")}</span>` : "");
  }
  function markEl(cls, html, label) {
    const wrap = document.createElement("div");
    wrap.className = "mk " + cls;
    wrap.innerHTML = html + (label ? `<span class="mk-l">${esc(label)}</span>` : "");
    return wrap;
  }

  // title は読み上げ名・ホバーの名前。押すと詳細(PC は吹き出し、スマホは地図の下の詳細欄)
  function marker(p, { title, zIndex = 1, el, noMap, onPick }) {
    const m = new google.maps.marker.AdvancedMarkerElement({ map: noMap ? null : map, position: { lat: Number(p.lat), lng: Number(p.lon) }, title, content: el, zIndex, gmpClickable: true });
    m._z = zIndex;
    if (onPick) m.addEventListener("gmp-click", () => onPick(m));
    layers.push(m);
    return m;
  }

  // 押した印を強調し、その印の名前ラベルだけを出す(スマホは常時ラベルを出さない)
  function setActiveMarker(m) {
    if (activeMarker && activeMarker !== m) { activeMarker.content?.classList.remove("is-active"); activeMarker.zIndex = activeMarker._z; }
    activeMarker = m;
    if (m) { m.content?.classList.add("is-active"); m.zIndex = 20; }
  }

  function openInfo(m, html, content, name) {
    setActiveMarker(m);
    if (narrow()) { showDetail(content || Object.assign(document.createElement("div"), { className: "gm-pop", innerHTML: html })); return; }
    info.setOptions({ ariaLabel: name || "" });
    if (content) info.setContent(content);
    else info.setContent(`<div class="gm-pop">${html}</div>`);
    info.open({ anchor: m, map });
  }

  // スマホ: 押した印の名前・種類・寄り道時間・選ぶ操作を、地図をふさがないよう地図の下に大きく出す
  function showDetail(node, candId = null) {
    const box = $("map-detail"); if (!box) return;
    detailFor = candId;
    box.replaceChildren(node);
    const close = document.createElement("button");
    close.type = "button"; close.className = "sub md-close"; close.textContent = "閉じる";
    close.addEventListener("click", hideDetail);
    box.appendChild(close);
    const fresh = box.classList.contains("hidden");
    box.classList.remove("hidden");
    if (fresh && !reduced()) box.animate([{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], { duration: 220, easing: "cubic-bezier(.2,.8,.2,1)" });
    const r = box.getBoundingClientRect();
    if (r.bottom > window.innerHeight) box.scrollIntoView({ block: "nearest", behavior: reduced() ? "auto" : "smooth" });
  }
  function hideDetail() {
    const box = $("map-detail"); if (!box) return;
    box.classList.add("hidden"); box.replaceChildren(); detailFor = null;
    setActiveMarker(null);
  }

  function polyline(points, color, dashed) {
    const path = points.map(([lat, lon]) => ({ lat, lng: lon }));
    const opts = dashed
      ? { path, strokeOpacity: 0, zIndex: 2, icons: [{ icon: { path: "M 0,-1 0,1", strokeOpacity: 1, strokeColor: color, strokeWeight: 4, scale: 3.5 }, offset: "0", repeat: "15px" }] }
      : { path, strokeColor: color, strokeOpacity: 0.8, strokeWeight: 5, zIndex: 1 };
    const pl = new google.maps.Polyline({ ...opts, map, clickable: false });
    layers.push(pl);
    return pl;
  }

  // ---- 候補(段階3)

  const restKind = (c) => (c.cat === "rest" && c.kind ? `(${c.kind})` : "");
  function candBadges(c) {
    const cat = CAT[c.cat] || CAT.other;
    return [`<span class="badge"><span class="mk-i mk-inline" style="background:${cat.color}">${svgIcon(cat.icon, cat.color)}</span>${esc(cat.label)}${esc(restKind(c))}</span>`, c.dogRun ? '<span class="badge b-run">ドッグラン</span>' : "", c.cert ? '<span class="badge">証明書</span>' : ""].join("");
  }

  // 候補の詳細(DOM で作ってボタンに処理を付ける)。PC は吹き出し、スマホは地図の下の詳細欄に出す
  function candPopup(c) {
    const picked = picks.has(c.id);
    const wrap = document.createElement("div");
    wrap.className = "gm-pop";
    wrap.innerHTML = `<b class="gm-name">${esc(c.name)}</b>${picked ? '<span class="gm-state">選択中・まだ経路に入っていません</span>' : ""}<br>${candBadges(c)}
      <p class="gm-detour">寄り道の目安 <b>+${detourMin(c.distance)}分</b>・ルートから直線${esc(distText(c.distance))}</p>
      <div class="gm-act"><label>滞在 <select class="gm-stay">${stayChoices().map((m) => `<option value="${m}"${m === (picks.get(c.id)?.stayMin || 60) ? " selected" : ""}>${fmtStay(m)}</option>`).join("")}</select></label>
      <button type="button" class="gm-btn${picked ? " gm-off" : ""}">${picked ? "候補から外す" : "この場所を選ぶ"}</button></div>
      ${picked ? '<p class="gm-note">地図の下の一覧に入っています。「立ち寄りに入れて再計算」で経路に入り、番号のピン(①②③)に変わります。</p>' : ""}
      <span class="gm-note">${esc(c.area || "")}(寄り道の時間は概算。正確な差は「立ち寄りに入れて再計算」で出ます)${c.theme ? "<br>" + esc(c.theme) : ""}${c.checkedAt ? `<br>掲載情報の確認日 ${esc(c.checkedAt)}` : ""}</span>
      ${c.url ? `<br><a href="${esc(c.url)}" target="_blank" rel="noopener">施設情報を開く</a>` : ""}`;
    wrap.querySelector(".gm-btn").addEventListener("click", () => {
      if (picks.has(c.id)) unpick(c.id); else pick(c, Number(wrap.querySelector(".gm-stay").value));
      if (narrow()) { const m = candMarkers.get(c.id); if (m) setActiveMarker(m); showDetail(candPopup(c), c.id); $("map-detail")?.querySelector(".gm-btn")?.focus(); }
      else { info.close(); setActiveMarker(null); }
    });
    wrap.querySelector(".gm-stay").addEventListener("change", (ev) => { const p = picks.get(c.id); if (p) { p.stayMin = Number(ev.target.value); renderPicks(); } });
    return wrap;
  }

  const candTitle = (c, picked) => `候補・${(CAT[c.cat] || CAT.other).label}${restKind(c)}: ${c.name}${picked ? "(選択中・まだ経路に入っていません)" : ""}`;
  function candMarker(c) {
    const cat = CAT[c.cat] || CAT.other;
    const picked = picks.has(c.id);
    const m = marker(c, { title: candTitle(c, picked), zIndex: picked ? 3 : 1, noMap: Boolean(clusterer) && !picked,
      el: markEl("mk-dot" + (picked ? " mk-picked" : ""), dotHtml({ cat, picked }), picked ? `✓ ${shortName(c.name)}` : shortName(c.name)),
      onPick: (mk) => { setActive(c.id, false); openCand(mk, c); } });
    candMarkers.set(c.id, m);
    return m;
  }
  function openCand(m, c) {
    setActiveMarker(m);
    if (narrow()) showDetail(candPopup(c), c.id);
    else openInfo(m, null, candPopup(c), c.name);
  }

  function drawCandidates() {
    for (const m of candMarkers.values()) { m.map = null; layers = layers.filter((l) => l !== m); }
    if (clusterer) clusterer.clearMarkers(true);
    candMarkers = new Map();
    const cands = pending?.candidates || [];
    const f = filters();
    let shownCount = 0;
    const counts = {};
    const clustered = [];
    for (const c of cands) {
      counts[c.cat] = (counts[c.cat] || 0) + 1;
      if (!f.has(c.cat) && !picks.has(c.id)) continue;  // 絞り込みで隠しても、選択済みは残す
      const m = candMarker(c); shownCount++;
      if (clusterer && !picks.has(c.id)) clustered.push(m);  // 選択済みはまとめず常に見える
      if (c.id === detailFor) setActiveMarker(m);
    }
    if (clusterer) { if (clustered.length) clusterer.addMarkers(clustered); else clusterer.render(); }
    const cn = $("map-cand-note");
    if (cn) {
      cn.classList.toggle("hidden", !cands.length && !pending);
      cn.textContent = cands.length
        ? `ルートから直線${pending.candidateKm || 8}km以内の候補 ${cands.length}件(${Object.entries(counts).map(([k, n]) => `${(CAT[k] || CAT.other).label} ${n}`).join("・")})。表示中 ${shownCount}件。丸い印を押して「この場所を選ぶ」。複数選べます。`
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
    document.dispatchEvent(new CustomEvent("routemap:picks"));
  }

  function setActive(id, pan) {
    activeId = id;
    document.querySelectorAll("#map-picks li").forEach((li) => li.classList.toggle("active", li.dataset.id === id));
    const m = candMarkers.get(id);
    if (pan && m && map) { map.panTo(m.position); if (map.getZoom() < 11) map.setZoom(11); openCand(m, picks.get(id)?.cand); }
  }

  // 選択済みリスト(複数)。行をタップで地図へ、滞在時間の変更、削除。立ち寄りに入れる順は経路に沿った順(planner.js が並べ替える)
  function renderPicks() {
    const wrap = $("map-picks-wrap"), list = $("map-picks");
    if (!wrap || !list) return;
    const items = [...picks.values()].sort((a, b) => a.cand.along - b.cand.along);
    wrap.classList.toggle("hidden", !items.length && !pending?.candidates?.length);
    $("map-picks-count").textContent = items.length ? `${items.length}件選択中(まだ経路に入っていません)` : "まだ選んでいません";
    $("map-apply").disabled = !items.length;
    const max = pending?.maxWaypoints || 3;
    list.innerHTML = items.map(({ cand: c, stayMin }, i) => `<li data-id="${esc(c.id)}"${c.id === activeId ? ' class="active"' : ""}>
      <span class="pk-chk" title="選択中">${svgIcon("check")}</span>
      <span class="pk-name"><b>${esc(c.name)}</b> ${candBadges(c)}<br><span class="note">${esc(c.area || "")}・ルートから${esc(distText(c.distance))}・寄り道の目安 +${detourMin(c.distance)}分${i >= max ? `・${max}か所の上限を超えるため立ち寄りには入りません` : ""}</span></span>
      <select class="pk-stay" aria-label="滞在時間">${stayChoices().map((m) => `<option value="${m}"${m === stayMin ? " selected" : ""}>滞在 ${fmtStay(m)}</option>`).join("")}</select>
      ${c.url ? `<a class="pk-link" href="${esc(c.url)}" target="_blank" rel="noopener">詳細</a>` : ""}
      <button type="button" class="sub pk-del" aria-label="${esc(c.name)} を候補から外す">外す</button></li>`).join("");
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
    document.dispatchEvent(new CustomEvent("routemap:picks"));
  }

  // data: { origin, destination, waypoints, rests, legs:[{points, back}], returnWaypoints, returnRests, candidates, onApply, maxWaypoints, stayChoices, summary }
  // destination・waypoints・returnWaypoints の approx が true なら、位置は市町村などの代表点(座標は補わず、印と詳細に注意を出す)
  function draw(data) {
    clearLayers();
    hideDetail();
    if (!data) return;
    const bounds = new google.maps.LatLngBounds();
    const extend = (p) => bounds.extend({ lat: Number(p.lat), lng: Number(p.lon) });
    for (const leg of data.legs || []) {
      if (!leg.points || leg.points.length < 2) continue;
      polyline(leg.points, leg.back ? COLOR.back : COLOR.go, Boolean(leg.back));
      for (const pt of leg.points) bounds.extend({ lat: pt[0], lng: pt[1] });
    }
    const link = (url, label) => (url ? `<br><a href="${esc(url)}" target="_blank" rel="noopener">${esc(label)}</a>` : "");
    const approxHtml = (p) => (p.approx ? `<br><span class="gm-approx">${esc(APPROX_NOTE)}</span>` : "");
    const approxTitle = (p) => (p.approx ? "(位置は地域の目安)" : "");
    // 主要地点: 種類の名前・名前・詳細を 1 か所で組み立てる
    const place = (p, { kind, color, icon, num, z, big, label, body }) => {
      const title = `${kind}: ${p.name}${approxTitle(p)}`;
      const html = `<b class="gm-name">${esc(p.name)}</b><br><span class="gm-kind">${body}</span>${approxHtml(p)}`;
      marker(p, { title, zIndex: z, el: markEl("mk-pin" + (big ? " mk-big" : ""), pinHtml({ color, icon, num, approx: p.approx }), label), onPick: (m) => openInfo(m, html, null, title) });
      extend(p);
    };
    (data.rests || []).forEach((r) => place(r, { kind: "行きの休憩", color: COLOR.rest, icon: "rest", z: 6, label: `休憩 ${shortName(r.name)}`, body: `行きの休憩・${esc(r.kind || "")}${esc(r.note || "")}` }));
    (data.returnRests || []).forEach((r) => place(r, { kind: "帰りの休憩", color: COLOR.back, icon: "rest", z: 6, label: `帰り休憩 ${shortName(r.name)}`, body: `帰りの休憩・${esc(r.kind || "")}${esc(r.note || "")}` }));
    (data.waypoints || []).forEach((w, i) => place(w, { kind: `行きの立ち寄り${circled(i + 1)}`, color: COLOR.via, num: i + 1, z: 7, label: `立ち寄り${circled(i + 1)} ${shortName(w.name)}`,
      body: `行きの立ち寄り${circled(i + 1)}${w.kind ? "・" + esc(w.kind) : ""}${w.stayMin ? `・滞在${esc(w.stayMin)}分` : ""}${link(w.url, "施設情報を開く")}` }));
    (data.returnWaypoints || []).forEach((w, i) => place(w, { kind: `帰りの立ち寄り${circled(i + 1)}`, color: COLOR.back, num: i + 1, z: 7, label: `帰り${circled(i + 1)} ${shortName(w.name)}`,
      body: `帰りの立ち寄り${circled(i + 1)}${w.kind ? "・" + esc(w.kind) : ""}${w.stayMin ? `・滞在${esc(w.stayMin)}分` : ""}${link(w.url, "施設情報を開く")}` }));
    if (data.origin) place(data.origin, { kind: "出発地", color: COLOR.origin, icon: "car", z: 5, big: true, label: `出発 ${shortName(data.origin.name)}`, body: "出発地" });
    if (data.destination) {
      const d = data.destination, inn = d.kind === "宿";
      place(d, { kind: `行き先${inn ? "(宿泊先)" : ""}`, color: COLOR.dest, icon: "flag", z: 5, big: true, label: `行き先 ${shortName(d.name)}`,
        body: `行き先${inn ? `<span class="gm-inn"><span class="mk-i mk-inline" style="background:${COLOR.dest}">${svgIcon("bed", COLOR.dest)}</span>宿泊先</span>` : d.kind ? "・" + esc(d.kind) : ""}${link(d.url, "条件を見る")}` });
    }
    routeBounds = bounds;
    fitRoute();
    drawCandidates();
  }

  // 地図の見方: 地図と同じ作り方で印を描く(ずれないように)
  function renderKey() {
    const body = $("map-key-body"); if (!body) return;
    const pin = (o) => `<span class="mk mk-pin mk-key">${pinHtml(o)}</span>`;
    const dot = (o) => `<span class="mk mk-dot mk-key${o.picked ? " mk-picked" : ""}">${dotHtml(o)}</span>`;
    const row = (icon, text) => `<li>${icon}<span>${text}</span></li>`;
    body.innerHTML = `<p class="key-h">経路に入っている地点(しずく形のピン)</p><ul>`
      + row(pin({ color: COLOR.origin, icon: "car" }), "<b>出発地</b>(車)")
      + row(pin({ color: COLOR.dest, icon: "flag" }), `<b>行き先</b>(旗)。宿は詳細に<span class="mk-i mk-inline key-bed" style="background:${COLOR.dest}">${svgIcon("bed", COLOR.dest)}</span>`)
      + row(pin({ color: COLOR.via, num: 1 }), "<b>行きの立ち寄り</b> ①②③(回る順)")
      + row(pin({ color: COLOR.rest, icon: "rest" }), "<b>行きの休憩</b>(SA・PA・道の駅)")
      + row(pin({ color: COLOR.back, num: 1 }), "<b>帰りの立ち寄り</b>(青)")
      + row(pin({ color: COLOR.back, icon: "rest" }), "<b>帰りの休憩</b>(青)")
      + `<li class="key-approx">${pin({ color: COLOR.via, num: 1, approx: true })}<span><b>位置は地域の目安</b>(点線の縁と「目安」の札)</span></li>`
      + `</ul><p class="key-h">経路の線と中継地の候補(丸形)</p><ul>`
      + row('<i class="lg-line"></i>', "<b>行きの経路</b>(実線)")
      + row('<i class="lg-line lg-back"></i>', "<b>帰りの経路</b>(青の点線)")
      + row(dot({ cat: CAT.run }), "<b>候補</b>(絵柄は種類のチップと同じ)")
      + row(dot({ cat: CAT.run, picked: true }), "<b>選んだ候補</b>(チェック付き・まだ経路の外)")
      + row(`<span class="mk mk-dot mk-cluster mk-key">${clusterHtml(19)}</span>`, "<b>候補のまとまり</b>(件数。押すと拡大)")
      + `</ul><p class="key-foot">選んだ候補は「立ち寄りに入れて再計算」で番号のピン(①②③)に変わります。帰りの線と印は、帰りの時間を計算した後に出ます。</p>`;
  }
  // 種類のチップに、地図と同じ絵柄を入れる
  function renderChipIcons() {
    document.querySelectorAll("#map-filters input").forEach((i) => {
      const cat = CAT[i.value]; const span = i.parentElement?.querySelector(".mk-i");
      if (cat && span) { span.style.background = cat.color; span.innerHTML = svgIcon(cat.icon, cat.color); }
    });
  }

  async function show() {
    if (shown || failed) return;
    shown = true;
    $("map").classList.remove("hidden");
    $("map-show")?.classList.add("hidden");
    $("map-filters")?.classList.remove("hidden");
    $("map-key")?.classList.remove("hidden");
    note("地図を読み込んでいます…");
    try {
      await ensureMap();
      if (await loadClusterer()) {
        try {
          // スマホは画面が狭いので、まとめる範囲を広げて印の重なりを減らす
          const algorithm = window.markerClusterer.SuperClusterAlgorithm ? new markerClusterer.SuperClusterAlgorithm({ radius: narrow() ? 100 : 80, maxZoom: 15 }) : undefined;
          clusterer = new markerClusterer.MarkerClusterer({ map, markers: [], renderer: clusterRenderer, ...(algorithm ? { algorithm } : {}) });
        } catch (e) { clusterer = null; }
      }
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
    hide() { pending = null; $("map-card")?.classList.add("hidden"); if (map && !failed) { clearLayers(); hideDetail(); if (clusterer) clusterer.clearMarkers(); if (info) info.close(); } },
    // 前回の結果を表示中(条件変更・再計算中)は、候補の適用ボタンを止める。新しい結果が出たら注意を消す
    setStale(on) {
      const b = $("map-apply"); if (b) b.disabled = on || !picks.size;
      const n = $("map-pick-note"); if (!n) return;
      if (on) n.textContent = STALE_TEXT; else if (n.textContent === STALE_TEXT) n.textContent = "";
    },
    // まだ立ち寄りに入れていない選択(確認カードの表示用)
    pendingPicks() { return [...picks.values()].map((p) => p.cand.name); },
  };
  renderChipIcons();
  renderKey();
  const key = $("map-key");
  if (key && window.matchMedia("(min-width: 720px)").matches) key.open = true;  // PC は開いた状態、スマホは見出しだけ
  $("map-show")?.addEventListener("click", show);
  $("map-apply")?.addEventListener("click", applyPicks);
  $("map-clear")?.addEventListener("click", () => { picks.clear(); activeId = null; refreshAfterPick(); if (detailFor) hideDetail(); });
  document.querySelectorAll("#map-filters input").forEach((i) => i.addEventListener("change", () => { if (map && shown && !failed) drawCandidates(); }));
})();
