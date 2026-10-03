(() => {
  const CFG = window.PLANNER_CONFIG;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const TYPE_LABEL = { lodging: "宿", spot: "おでかけ", trip_plan: "モデルコース" };
  const DESTINATION_COLLATOR = new Intl.Collator("ja", { numeric: true, sensitivity: "base" });
  // 確認済みの読みを名前全体に適用。未知の英字表記には推測の読みを付けない。
  const DESTINATION_READINGS = [
    ["愛犬お宿", "あいけんおやど"], ["伊香保温泉", "いかほおんせん"], ["伊豆", "いず"], ["下田", "しもだ"],
    ["亀の井", "かめのい"], ["玉響", "たまゆら"], ["軽井沢", "かるいざわ"], ["小谷流", "こやる"],
    ["浄土ヶ浜", "じょうどがはま"], ["青森屋", "あおもりや"], ["草津", "くさつ"], ["蔵王", "ざおう"],
    ["大洗", "おおあらい"], ["鶴雅", "つるが"], ["定山渓", "じょうざんけい"], ["天然温泉", "てんねんおんせん"],
    ["洞爺湖", "とうやこ"], ["熱川", "あたがわ"], ["白馬", "はくば"], ["八ヶ岳", "やつがたけ"],
    ["別邸", "べってい"], ["北天", "ほくてん"], ["蓼科", "たてしな"], ["鋸山", "のこぎりやま"],
    ["駒沢", "こまざわ"], ["原村", "はらむら"], ["五色沼", "ごしきぬま"], ["高尾山", "たかおさん"],
    ["国営", "こくえい"], ["佐野", "さの"], ["犀川", "さいかわ"], ["三井", "みつい"], ["三石", "みついし"],
    ["市原", "いちはら"], ["紫雲寺", "しうんじ"], ["鹿野山", "かのうざん"], ["篠崎", "しのざき"],
    ["舎人", "とねり"], ["車山", "くるまやま"], ["修善寺", "しゅぜんじ"], ["小岩井", "こいわい"],
    ["小金井", "こがねい"], ["神代", "じんだい"], ["水元", "みずもと"], ["清水", "しみず"],
    ["青葉", "あおば"], ["千葉", "ちば"], ["泉", "いずみ"], ["代々木", "よよぎ"],
    ["笛吹川", "ふえふきがわ"], ["島見", "しまみ"], ["東京", "とうきょう"], ["那須", "なす"],
    ["苗場", "なえば"], ["富士見", "ふじみ"], ["富士", "ふじ"], ["宝登山", "ほどさん"],
    ["霧降", "きりふり"], ["木場", "きば"], ["蘆花", "ろか"], ["箱根", "はこね"],
    ["海辺", "うみべ"], ["山梨", "やまなし"], ["成田", "なりた"], ["柏の葉", "かしわのは"],
    ["&WAN", "あんどわん"], ["Bowmu", "ばうむ"], ["Dear Wan Spa Garden", "でぃあわんすぱがーでん"],
    ["CARO FORESTA", "かーろふぉれすた"], ["Cuore", "くおーれ"],
    ["Rakuten STAY VILLA", "らくてんすていゔぃら"], ["Rakuten STAY", "らくてんすてい"],
    ["VIALA", "ゔぃあら"], ["1HOTEL", "わんほてる"], ["withDOG", "うぃずどっぐ"], ["with DOG", "うぃずどっぐ"],
    ["旧軽井沢", "きゅうかるいざわ"], ["北軽井沢", "きたかるいざわ"], ["元箱根", "もとはこね"],
    ["鴨川", "かもがわ"], ["九十九里", "くじゅうくり"], ["喜連川", "きつれがわ"], ["筑波山", "つくばさん"],
    ["山中湖", "やまなかこ"], ["館山", "たてやま"], ["城ヶ島", "じょうがしま"], ["城ヶ崎", "じょうがさき"],
    ["鬼怒川", "きぬがわ"], ["日光", "にっこう"]
  ].sort((a, b) => b[0].length - a[0].length);
  const READING_PARTS = new Map(DESTINATION_READINGS);
  const READING_PATTERN = new RegExp(DESTINATION_READINGS.map(([part]) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "g");
  const destinationSortName = (name) => {
    const source = name.normalize("NFKC").replace(READING_PATTERN, (part) => READING_PARTS.get(part)).replace(/\s+/g, "");
    return Array.from(source, (char) => {
      const code = char.charCodeAt(0);
      return code >= 0x30a1 && code <= 0x30f6 ? String.fromCharCode(code - 0x60) : char;
    }).join("");
  };
  const compareDestinations = (a, b) => {
    const left = destinationSortName(a.reading || a.name), right = destinationSortName(b.reading || b.name);
    // 読み未登録の英字名は末尾の表記順。ブランド名の読みを推測しない。
    return Number(!/^[ぁ-ゖ]/.test(left)) - Number(!/^[ぁ-ゖ]/.test(right))
      || DESTINATION_COLLATOR.compare(left, right) || DESTINATION_COLLATOR.compare(a.area || "", b.area || "") || a.id.localeCompare(b.id);
  };
  const STOP_NEAR_KM = 0.35;      // ルートからこの距離以内のSA/PAを候補にする(OSMの位置は施設の中心なので少し広め)
  const SIDE_AMBIGUOUS_KM = 0.04; // これより近い施設は上下線どちら側か判定しない(上下一体の施設など)
  // 休憩の目標時刻より何分前までを候補にするか。広めにとって、少し早くてもドッグランのあるSAを優先できるようにする
  // (例: 東京→那須で、2時間目安だと上河内SAより手前の佐野SA(ドッグラン24時間)を選べるように)
  const WINDOW_MIN = 60;
  const MIN_GAP_MIN = 20;         // 前の休憩から最低これだけは空ける
  const EDGE_START_MIN = 15, EDGE_END_MIN = 10; // 出発直後・到着直前の休憩は提案しない
  const MAX_WAYPOINTS = 3;
  const WP_RADIUS_KM = 30;        // 立ち寄り先の候補は、立ち寄り前のルートから直線でこの距離以内に固定
  // 1回の計算でGoogleに問い合わせる上限(出発時刻の数 × 区間の数)。立ち寄り先が多いときは比べる出発時刻を減らす
  const MAX_ROUTE_CALLS = 16;
  const STAY_CHOICES = [15, 30, 45, 60, 90, 120, 180, 240];
  const REST_RESET_MIN = 15; // 立ち寄り先でこれ以上過ごせば、犬の休憩をとったことにする
  const REST_SLACK_MIN = 10; // 目安の間隔をこれ以下しか超えない区間は「長い区間」にしない(休憩候補を出さない)

  let PLACES = [];
  let DESTINATIONS = [];
  let STOPS = [];
  const byId = new Map();
  const wpByLabel = new Map(); // 立ち寄り先の候補(位置のある掲載先 + SA・PA・道の駅)
  let destinationSummary = "";
  let lastState = null;
  let waypointRoute = null; // 立ち寄り前の出発地→行き先。距離フィルター専用。
  let waypointRequest = 0;
  let waypointMessage = "";

  // ---------------------------------------------------------------- データ

  function textBeforeElement(root, endElement) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const parts = [];
    while (walker.nextNode()) {
      if (endElement.contains(walker.currentNode)) break;
      parts.push(walker.currentNode.nodeValue);
    }
    return parts.join(" ").replace(/\s+/g, " ").trim();
  }

  async function loadData() {
    const [p, s, dt, lt] = await Promise.all([
      fetch(`${CFG.dataBase}places.json`).then((r) => r.json()),
      fetch(`${CFG.dataBase}rest_stops.json`).then((r) => r.json()),
      fetch(`${CFG.dataBase}drive_times.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch(`${CFG.dataBase}lodging_times.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]);
    STOPS = s.stops;
    TIMES = lt && typeof lt === "object" ? lt : {};
    setDriveTimes(dt);

    // 掲載ページのarticle[id]を読み取り、施設カードの増減を選択肢へ自動反映する。
    // 既存の場所データに位置がない掲載先も情報ページへのリンク付きで表示する。
    const pageSpecs = [
      { file: "dog-lodging-guide.html", type: "lodging", selector: "article[data-lodging-id]" },
      { file: "east-japan-dog-trips.html", type: "spot", selector: "article[id]" },
    ];
    const byPlaceId = new Map(p.places.map((place) => [place.id, place]));
    const published = [];
    const pageErrors = [];
    for (const spec of pageSpecs) {
      try {
        const pageUrl = new URL(`../${spec.file}`, location.href);
        const response = await fetch(pageUrl);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const html = await response.text();
        const doc = new DOMParser().parseFromString(html, "text/html");
        for (const article of doc.querySelectorAll(spec.selector)) {
          const id = article.id.trim() || article.dataset.lodgingId?.trim();
          const heading = article.querySelector("h1, h2, h3, h4");
          if (!id || !heading) continue;
          const existing = byPlaceId.get(id) || {};
          const beforeHeading = textBeforeElement(article, heading);
          const address = article.querySelector(".stay-head p")?.textContent.trim()
            || beforeHeading.match(/(?:北海道|東京都|(?:京都|大阪)府|[\p{Script=Han}]{2,3}県)[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}0-9・ー\-]{0,18}/u)?.[0]
            || "";
          const detailUrl = new URL(`../${spec.file}`, location.href);
          detailUrl.hash = id;
          published.push({
            ...existing,
            id,
            name: heading.textContent.replace(/\s+/g, " ").trim(),
            area: address || existing.area || "掲載ページで確認",
            type: spec.type,
            page_url: detailUrl.href,
            sleep: article.dataset.sleep || existing.sleep || "",
            cage: article.dataset.cage || existing.cage || "",
            reserve: reserveLinks(article),
            photo: article.querySelector(".stay-photo img")?.getAttribute("src") || existing.photo || "",
          });
        }
      } catch (error) {
        pageErrors.push(spec.file);
      }
    }

    // モデルコース(trip_plan)は 2026-10-03 にオーナー指示で廃止(分かりにくい)。places.json にも入れない
    DESTINATIONS = published.filter((place) => place.type !== "trip_plan");
    byId.clear();
    for (const place of DESTINATIONS) byId.set(place.id, place);
    PLACES = DESTINATIONS.filter((place) =>
      place.type !== "trip_plan" && hasRouteCoordinates(place));

    const select = $("dest-q");
    const groups = [
      ["lodging", "宿泊先｜犬と泊まる場所"],
      ["spot", "おでかけ先｜日帰り・立ち寄り"],
    ];
    for (const [type, label] of groups) {
      const options = DESTINATIONS.filter((place) => place.type === type).sort(compareDestinations);
      if (!options.length) continue;
      const group = document.createElement("optgroup");
      group.label = `${label}（${options.length}件）`;
      for (const place of options) {
        const option = document.createElement("option");
        option.value = place.id;
        const hints = place.dog_hints || {};
        if (hints.cert_required) option.dataset.cert = "1";
        option.textContent = `${place.name}（${place.area || "地域未登録"}）${hints.cert_required ? "【証明書】" : ""}`;
        group.appendChild(option);
      }
      select.appendChild(group);
    }
    const withRoute = DESTINATIONS.filter(hasRouteCoordinates).length;
    const withoutRoute = DESTINATIONS.length - withRoute;
    destinationSummary = pageErrors.length
      ? `掲載ページの一部が読み込めませんでした。移動時間を計算できる場所 ${withRoute}件／施設紹介のみ確認できる場所 ${withoutRoute}件。`
      : `行き先一覧 ${DESTINATIONS.length}件を表示中（移動時間を計算できる場所 ${withRoute}件・施設紹介のみ確認できる場所 ${withoutRoute}件）。`;
    $("dest-hint").textContent = destinationSummary;
    applyCertFilter();
    $("vaccine")?.addEventListener("change", () => { applyCertFilter(); if (lastState) { renderNearby(lastState.place); if (returnState || returnBusy) invalidateReturn("証明書の条件を変えたので、帰りのプランを再計算してください。"); if (!$("itinerary-card").classList.contains("hidden")) renderItinerary(lastState); refreshChecklist(); } });

    // 立ち寄り先の候補: 位置のある掲載先(宿・おでかけ)と、SA・PA・道の駅
    wpByLabel.clear();
    const addWp = (label, v) => {
      if (wpByLabel.has(label)) return;
      wpByLabel.set(label, v);
    };
    for (const pl of PLACES.slice().sort(compareDestinations)) {
      addWp(`${pl.name}（${TYPE_LABEL[pl.type]}・${pl.area || "地域未登録"}）`, {
        name: pl.name, lat: Number(pl.geocode.lat), lon: Number(pl.geocode.lon), kind: TYPE_LABEL[pl.type], place: pl,
        approx: pl.geocode.precision !== "facility" });
    }
    for (const s of STOPS) {
      const road = (s.facilities || []).map((f) => f.road).find(Boolean);
      const run = s.dog_run ? "・ドッグランあり" : "";
      addWp(`${s.name}（${s.kind}${road ? "・" + road : ""}${run}）`, { name: s.name, lat: s.lat, lon: s.lon, kind: s.kind, stop: s });
    }

    // サイトの各カードから「?dest=<id>」付きで開かれたら、行き先を選んだ状態にする
    // 統合して外したカードの古いIDは、残したカードのIDに読み替える(外部から古いリンクで来た人のため)
    const DEST_ALIASES = { "add60-ishinoie": "izu-ishinoie", "c2-haiji-no-mura": "c-heidi-village", "c4-komagatake-ropeway": "c2-komagatake-ropeway", "c5-aiken-no-eki-izukogen": "c3-aiken-no-eki-izukogen", "c6-00002930": "c2-kizuna-kinugawa", "c5-tansen-hotel-akayu": "c3-tansen-hotel", "c5-haramura-cafe": "haramura-cafe-dogfield", "c5-shimami-ryokuchi-dogrun": "niigata-shimami-dogrun", "c4-saigawa-2-ryokuchi-dogrun": "nagano-saigawa-second-dogrun", "c5-oinusama-park-fukushima": "fukushima-oinusama-park", "c5-aoba-no-mori-dogrun": "add60-aoba", "c5-jindai-botanical-park-dogrun": "add60-jindai", "c5-rokakoshunen-dogrun": "add60-rokakoshun-en", "c5-johoku-chuo-park-dogrun": "c3-johoku-chuo-dogrun", "c5-tokyo-doitsumura-wanchan-land": "n0924-doitsumura-wanland", "c5-zao-wanwan-land": "c-zao-wanwanland", "c5-meiken-bokujo-maebashi": "c-meiken-bokujo", "c5-myoko-skycable-dogrun": "c-myoko-skycable", "c5-showa-kinen-park-dogrun": "c2-showakinen", "c2-yatsugatake-wanko-niwa": "c-yatsugatake-shizen", "c5-makiba-park-yatsugatake": "c2-makiba-park", "c5-spa-dogsrun-chichibu": "c2-spa-dogsrun-chichibu", "c6-soleil-park-jp": "c2-soleil-no-oka", "c5-chichibu-muse-park": "c-chichibu-muse-park", "c5-tokorozawa-kokukinen-dogrun": "c3-tokorozawa-kokuu-dogrun", "c5-dog-cafe-moi-moi-odawara": "c3-dogcafe-moimoi", "c5-pet-wizard-cafe-ueda": "c3-pet-wizard-cafe-ueda", "c5-rich-field-kanuma": "c3-richfield-kanuma", "c5-doglle-house-hamamatsu": "c4-doglle-house", "c5-dog-park-runrunrun": "c4-dogpark-runrunrun", "c5-dogdept-garden-gotemba": "c4-dogdept-garden-gotemba" };
    const rawDest = new URLSearchParams(location.search).get("dest");
    const destId = DEST_ALIASES[rawDest] || rawDest;
    if (destId && byId.has(destId)) select.value = destId;
    updateDestinationLink();
    refreshWaypointChoices();
    // 空室逆算(vacancy.js)などの別スクリプトへ、行き先データと所要時間データを渡す
    window.PlannerData = {
      byId: (id) => byId.get(id),
      drive: () => DRIVE,
      // 主要駅(drive_times の hub)の id から出発地プルダウンを合わせる(駅名で一致)
      originForHub: (hubId) => {
        const m = /^st:([\d.\-]+),([\d.\-]+)\|(.*)$/.exec(hubId || "");  // 空室逆算で駅名から選んだ出発地 → 行程の出発地にも同じ駅を入れる
        if (m) { pickStation({ name: m[3].replace(/駅\(.*$/, ""), pref: (m[3].match(/\((.*)\)$/) || [])[1] || "", lat: Number(m[1]), lon: Number(m[2]), lines: [] }); return; }
        const hub = DRIVE && DRIVE.hubs.find((h) => h.id === hubId); const opt = hub && [...$("origin").options].find((o) => o.textContent.trim() === hub.name); if (opt) { $("origin").value = opt.value; $("origin").dispatchEvent(new Event("change", { bubbles: true })); } },
      stations: { load: () => loadStations(), search: (q) => searchStations(q) },
    };
    document.dispatchEvent(new CustomEvent("planner:data"));
  }

  // ワクチン・狂犬病の証明書: 「持っていく」のチェックを外すと、証明書の提示・持参が条件の宿・おでかけ先は選べなくする
  const hasCert = () => !$("vaccine") || $("vaccine").checked;
  function applyCertFilter() {
    const has = hasCert();
    let n = 0;
    for (const o of $("dest-q").options) if (o.dataset.cert) { o.disabled = !has; n++; }
    const sel = $("dest-q").selectedOptions[0];
    if (sel && sel.disabled) { $("dest-q").value = ""; updateDestinationLink(); }
    const hint = $("cert-hint");
    if (hint) hint.textContent = has ? "" : `ワクチン・狂犬病の証明書の提示・持参が条件の宿・おでかけ先(${n}件、【証明書】印)は、持っていない場合は選べません。持っていくならチェックを入れてください。`;
  }

  // 掲載カードの予約サイトへのリンク(rel=sponsored)を予約先ごとに 1 本ずつ。楽天の空室データとは独立した「掲載情報」由来のリンク
  function reserveLinks(article) {
    const out = new Map();
    for (const a of article.querySelectorAll('a[rel~="sponsored"]')) {
      const href = a.getAttribute("href") || "";
      const url = href.startsWith("//") ? "https:" + href : href;
      let target = url;
      try { const u = new URL(url); const inner = u.searchParams.get("vc_url") || u.searchParams.get("pc") || u.searchParams.get("url"); if (inner) target = decodeURIComponent(inner); } catch { continue; }
      const label = /rakuten\.co\.jp/.test(target) ? "楽天トラベル" : /travel\.yahoo\.co\.jp/.test(target) ? "Yahoo!トラベル" : /ikyu\.com/.test(target) ? "一休.com" : /jalan\.net/.test(target) ? "じゃらん" : /rurubu|jtb\.co\.jp/.test(target) ? "JTB" : "";
      if (!label || out.has(label)) continue;
      out.set(label, { label, url });
    }
    return [...out.values()];
  }

  function hasRouteCoordinates(place) {
    // 公式所在地は都留市。旧データの大月市代表点は移動時間に使わない。
    if (place?.id === "santo" && place.geocode?.matched === "山梨県大月市") return false;
    return Boolean(place?.geocode && place.geocode.precision !== "prefecture"
      && place.geocode.lat != null && place.geocode.lon != null && place.geocode.lat !== "" && place.geocode.lon !== ""
      && Number.isFinite(Number(place.geocode.lat)) && Math.abs(Number(place.geocode.lat)) <= 90
      && Number.isFinite(Number(place.geocode.lon)) && Math.abs(Number(place.geocode.lon)) <= 180);
  }

  function updateDestinationLink() {
    const place = byId.get($("dest-q").value);
    const link = $("dest-details-link");
    if (!place?.page_url) {
      link.classList.add("hidden");
      link.removeAttribute("href");
      return;
    }
    link.href = place.page_url;
    link.classList.remove("hidden");
    $("dest-hint").textContent = hasRouteCoordinates(place)
      ? destinationSummary
      : "この行き先は施設紹介のみ確認できます（移動時間の計算用位置情報は未登録です）。";
  }

  // ---------------------------------------------------------------- 地理計算

  function decodePolyline(str) {
    const pts = [];
    let i = 0, lat = 0, lon = 0;
    while (i < str.length) {
      for (const which of [0, 1]) {
        let shift = 0, result = 0, b;
        do { b = str.charCodeAt(i++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
        const d = result & 1 ? ~(result >> 1) : result >> 1;
        if (which === 0) lat += d; else lon += d;
      }
      pts.push([lat / 1e5, lon / 1e5]);
    }
    return pts;
  }

  function km(a, b) {
    const R = 6371, rad = Math.PI / 180;
    const dLat = (b[0] - a[0]) * rad, dLon = (b[1] - a[1]) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  function cumulative(points) {
    const cum = [0];
    for (let i = 1; i < points.length; i++) cum.push(cum[i - 1] + km(points[i - 1], points[i]));
    return cum;
  }

  // 各頂点だけでなく線分への最短距離を測る。距離は道路上の走行距離ではない。
  function distanceToRoute(point, points) {
    let best = Infinity;
    const scale = Math.cos(point[0] * Math.PI / 180);
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i];
      const ax = (a[1] - point[1]) * scale, ay = a[0] - point[0];
      const dx = (b[1] - a[1]) * scale, dy = b[0] - a[0];
      const length = dx * dx + dy * dy;
      const t = length ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / length)) : 0;
      best = Math.min(best, km(point, [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]));
    }
    return best;
  }

  // 休憩に使えない地点(チェーン着脱場など)は立ち寄り候補に出さない
  const NOT_REST = /チェーン着脱|着脱場|ポンプ場|トラック|駐輪場|Smoking|ラウンジ|検定待合所|インターチェンジ|駅舎|図書館|健康館|百貨店|イベントスペース|ウォークインゲート|歩行者|コインパーキング|駐車場$|駐車帯/;  // OSM 由来の名前で休憩地点でないもの

  const baseName = (name) => name.replace(/\s*[（(]\s*[上下]り?\s*[)）]\s*/g, "").replace(/サービスエリア/g, "SA").replace(/パーキングエリア/g, "PA").replace(/\s+/g, "").trim();

  // 東京から放射状に延びる高速道路(東北道・関越道・常磐道・東名・中央道など)は、東京から離れる向きが「下り」。
  // OSMで上下線の施設が同じ側に登録されていて左右で判定できない場合に、進行方向から上り/下りを決める。
  // 東京との距離がほとんど変わらない区間(圏央道など環状の道路)では判定しない(null)
  const TOKYO = [35.6812, 139.7671];
  function travelDirection(points, idx) {
    const a = points[Math.max(0, idx - 8)], b = points[Math.min(points.length - 1, idx + 8)];
    const delta = km(TOKYO, b) - km(TOKYO, a);
    if (Math.abs(delta) < 0.3) return null;
    return delta > 0 ? "下" : "上";
  }

  // 日本は左側通行なので、進行方向で使えるSA/PAはルートの左側にある
  function isLeftOfRoute(points, idx, stop) {
    const a = points[Math.max(0, idx - 3)], b = points[Math.min(points.length - 1, idx + 3)];
    const cosLat = Math.cos(points[idx][0] * Math.PI / 180);
    const dx = (b[1] - a[1]) * cosLat, dy = b[0] - a[0];
    const vx = (stop.lon - points[idx][1]) * cosLat, vy = stop.lat - points[idx][0];
    return dx * vy - dy * vx > 0;
  }

  function stopsAlongRoute(points, cum, driveSec, date) {
    const total = cum[cum.length - 1];
    let minLat = 90, maxLat = -90, minLon = 180, maxLon = -180;
    for (const [la, lo] of points) {
      minLat = Math.min(minLat, la); maxLat = Math.max(maxLat, la);
      minLon = Math.min(minLon, lo); maxLon = Math.max(maxLon, lo);
    }
    const m = 0.02;
    const near = STOPS.filter((s) => s.lat > minLat - m && s.lat < maxLat + m && s.lon > minLon - m && s.lon < maxLon + m);

    const best = new Map();
    for (const s of near) {
      let d = Infinity, idx = -1;
      for (let i = 0; i < points.length; i++) {
        const di = km(points[i], [s.lat, s.lon]);
        if (di < d) { d = di; idx = i; }
      }
      if (d > STOP_NEAR_KM) continue;
      // 上下線が別施設として登録されているSA/PAだけ左右を判定する。
      // 海ほたるPAのような上下共用の施設や道の駅は、道路の中心付近にあり左右の判定が意味をなさない
      if (s.direction && d > SIDE_AMBIGUOUS_KM && !isLeftOfRoute(points, idx, s)) continue;
      if (s.direction) {
        const dir = travelDirection(points, idx);
        if (dir && dir !== s.direction) continue;
      }
      const key = baseName(s.name);
      const prev = best.get(key);
      if (!prev || d < prev.d) best.set(key, { stop: s, idx, d });
    }

    return [...best.values()]
      .map(({ stop, idx, d }) => {
        const tSec = (cum[idx] / total) * driveSec;
        const closure = dogRunClosure(stop, date);
        const dogRun = stop.dog_run && !closure;
        // 休憩はSA・PAを優先(道の駅は高速を降りることが多いので最後)
        const walk = Boolean((stop.dog_walk || {}).available), dine = Boolean((stop.dog_dining || {}).available);
        const score = dogRun ? 3 : dine ? 2.5 : stop.pet_facility ? 2 : walk ? 1.5 : stop.kind === "SA" ? 1 : stop.kind === "道の駅" ? 0.3 : 0.5;
        return { stop, tSec, d, closure, dogRun, score };
      })
      .filter((c) => c.tSec > EDGE_START_MIN * 60 && c.tSec < driveSec - EDGE_END_MIN * 60)
      .sort((a, b) => a.tSec - b.tSec);
  }

  // NEXCOの注意書きから、その日にドッグランが閉鎖されているかを判定する(閉鎖でもSA自体は休憩に使える)
  function dogRunClosure(stop, date) {
    for (const f of stop.facilities || []) {
      if (f.facility !== "dog_run") continue;
      const n = f.note || "";
      const m = n.match(/(\d{1,2})\/(\d{1,2})\s*[～〜~\-－]\s*(\d{1,2})\/(\d{1,2})[^。]*閉鎖/);
      if (m) {
        const md = jst(date).mo * 100 + jst(date).d;
        const from = +m[1] * 100 + +m[2], to = +m[3] * 100 + +m[4];
        const inRange = from <= to ? md >= from && md <= to : md >= from || md <= to;
        if (inRange) return `ドッグラン閉鎖期間(${m[1]}/${m[2]}〜${m[3]}/${m[4]})`;
      }
      if (/冬季/.test(n) && /閉鎖/.test(n)) {
        const mo = jst(date).mo;
        if (mo === 12 || mo <= 4) return "冬季はドッグラン閉鎖の可能性";
      }
    }
    return null;
  }

  // sinceRestSec: この区間の出発時点で、前の休憩から何秒運転しているか(立ち寄り先をまたいで引き継ぐ)
  function planRests(cands, driveSec, intervalMin, sinceRestSec = 0, avoid = null) {
    // avoid: 避けたい休憩(行きで選んだSA・PAの名前)。同じ時間帯に別の候補があればそちらを優先し、無ければ従来どおり選ぶ
    const I = intervalMin * 60, W = WINDOW_MIN * 60;
    const pen = (c) => (avoid && avoid.has(baseName(c.stop.name)) ? 1 : 0);
    if (avoid) cands = cands.filter((c) => !pen(c));  // 帰りは行きで選んだ休憩を自動では選ばない(候補一覧には残す。別の候補が無ければ空)
    const pickBest = (arr) => arr.slice().sort((a, b) => pen(a) - pen(b) || b.score - a.score || b.tSec - a.tSec)[0];
    const lastPreferred = (arr) => { const ok = arr.filter((c) => !pen(c)); return (ok.length ? ok : arr)[(ok.length ? ok : arr).length - 1]; };
    const plan = [];
    let last = -sinceRestSec;
    while (driveSec - last > I) {
      let pick = pickBest(cands.filter((c) => c.tSec > last + I - W && c.tSec <= last + I));
      let late = false;
      if (!pick) {
        const early = cands.filter((c) => c.tSec > last + MIN_GAP_MIN * 60 && c.tSec <= last + I - W);
        pick = lastPreferred(early);
      }
      if (!pick) {
        const after = cands.filter((c) => c.tSec > last + I);
        pick = after.find((c) => !pen(c)) || after[0];
        late = Boolean(pick);
      }
      if (!pick) break;
      plan.push({ ...pick, late });
      last = pick.tSec;
    }
    return plan;
  }

  function restInterval(profile, date) {
    let minutes = 120;
    const reasons = [];
    if (profile.age === "puppy" || profile.age === "senior") {
      minutes = Math.min(minutes, 60);
      reasons.push(profile.age === "puppy" ? "子犬" : "シニア");
    }
    if (profile.carsick) { minutes = Math.min(minutes, 60); reasons.push("車酔い"); }
    const mo = jst(date).mo;
    if (profile.heat && mo >= 6 && mo <= 9) { minutes = Math.min(minutes, 90); reasons.push(profile.brachy ? "短頭種(夏季)" : "暑さに弱い(夏季)"); }
    if (profile.toilet && profile.toilet < minutes) { minutes = profile.toilet; reasons.push("トイレの間隔"); }
    return { minutes, reasons };
  }

  // ---------------------------------------------------------------- 表示

  const fmtDur = (sec) => {
    const m = Math.round(sec / 60);
    return m >= 60 ? `${Math.floor(m / 60)}時間${String(m % 60).padStart(2, "0")}分` : `${m}分`;
  };
  // 時刻・日付は日本時間(JST)に固定する。ブラウザのタイムゾーンに依存させない
  // (海外やクラウドの端末で 08:00 出発が 16:00 と表示され、復路の日付もずれていた不具合の対策)
  const JST_MS = 9 * 3600 * 1000;
  const jst = (d) => { const t = new Date(d.getTime() + JST_MS); return { y: t.getUTCFullYear(), mo: t.getUTCMonth() + 1, d: t.getUTCDate(), h: t.getUTCHours(), mi: t.getUTCMinutes(), wd: t.getUTCDay() }; };
  const jstMidnight = (d) => { const j = jst(d); return new Date(Date.UTC(j.y, j.mo - 1, j.d) - JST_MS); };
  const jstYmd = (d) => { const j = jst(d); return `${j.y}-${String(j.mo).padStart(2, "0")}-${String(j.d).padStart(2, "0")}`; };
  const jstMd = (d) => { const j = jst(d); return `${j.mo}/${j.d}(${"日月火水木金土"[j.wd]})`; };
  const fmtClock = (d) => { const j = jst(d); return `${j.h}:${String(j.mi).padStart(2, "0")}`; };
  const addSec = (d, s) => new Date(d.getTime() + s * 1000);

  function showError(msg) {
    $("error").textContent = msg;
    $("error").classList.remove("hidden");
  }

  // 位置が施設まで分かっていない地点を含み、しかも1km以内の区間(市区町村の中心どうしなど)は、移動時間が正しく出ない
  const isApproxLeg = (l) =>
    (l.from.approx || l.to.approx) && km([l.from.lat, l.from.lon], [l.to.lat, l.to.lon]) < 1;
  const fmtStay = (min) => (min < 60 ? `${min}分` : `${min / 60}時間`.replace(".5時間", "時間30分"));
  const delayText = (sec) => {
    const m = Math.round(sec / 60);
    return m >= 10 ? `+${m}分` : "ほぼなし";
  };

  function renderCompare(state) {
    const multi = state.waypoints.length > 0;
    $("compare-title").textContent = multi
      ? `出発時刻ごとの予想時間(立ち寄り${state.waypoints.length}か所・滞在込み)`
      : "出発時刻ごとの予想時間";
    $("compare-head").innerHTML = `<th>出発</th><th>運転時間${multi ? "(合計)" : ""}</th><th>到着${multi ? "(滞在込み)" : ""}</th><th>渋滞の影響</th>`;
    const rows = state.options.map((o, i) => {
      if (o.error) {
        return `<tr><td class="num">${fmtClock(o.dep)}</td><td colspan="3" class="note">計算できませんでした</td></tr>`;
      }
      const t = o.totals;
      return `<tr data-i="${i}" class="${i === state.bestIndex ? "best" : ""}" style="cursor:pointer">
        <td class="num">${fmtClock(o.dep)}${i === state.bestIndex ? " おすすめ" : ""}</td>
        <td class="num">${fmtDur(t.driveSec)}</td>
        <td class="num">${fmtClock(o.finalArrive)}</td>
        <td class="num">${delayText(t.driveSec - t.staticSec)}</td></tr>`;
    }).join("");
    $("compare").innerHTML = rows;
    $("compare").querySelectorAll("tr[data-i]").forEach((tr) =>
      tr.addEventListener("click", () => showOption(state, Number(tr.dataset.i))));
    const notes = [
      "渋滞の影響 = 過去の傾向を含む予測時間と、渋滞がない場合との差。",
      "この表の到着は休憩なしの時刻です。下の「休憩場所を選ぶ」で選んだ休憩(1回" + CFG.restMinutes + "分)は、下のプランの時刻に足します。",
      multi ? "立ち寄り先を出る時刻の混み具合で、次の区間を計算し直しています。" : "",
      state.reduced ? `立ち寄り先が多いため、比べる出発時刻を${state.options.length}つに減らしました。` : "",
      "行をタップするとその出発時刻のプランを表示します。",
    ];
    $("compare-note").textContent = notes.filter(Boolean).join("");
  }

  const restKey = (c) => baseName(c.stop.name);

  function restBadges(r) {
    return [
      r.stop.kind === "道の駅" ? '<span class="badge">道の駅</span>' : `<span class="badge">${esc(r.stop.kind)}</span>`,
      r.dogRun ? '<span class="badge b-run">ドッグラン</span>' : "",
      r.stop.pet_facility ? '<span class="badge b-pet">ペット施設</span>' : "",
      (r.stop.dog_walk || {}).available ? '<span class="badge b-pet">散歩できる</span>' : "",
      (r.stop.dog_dining || {}).available ? '<span class="badge b-rec">犬同伴で食事</span>' : "",
      r.closure ? `<span class="badge b-closed">${esc(r.closure)}</span>` : "",
    ].join("");
  }

  function restItem(r, at) {
    const fac = (r.stop.facilities || [])[0];
    const notes = (r.stop.facilities || []).map((f) => f.note).filter(Boolean).join(" / ");
    return `<li><span class="time">${fmtClock(at)}</span><span>
      <span class="badge">休憩${CFG.restMinutes}分</span> <b>${esc(r.stop.name)}</b> ${restBadges(r)}<br>
      <span class="note">この区間の運転${fmtDur(r.tSec)}の地点${fac ? ` / ${esc(fac.road)}` : ""}${notes ? ` / ${esc(notes)}` : ""}</span>
      ${fac ? `<br><a href="${esc(fac.url)}" target="_blank" rel="noopener">${esc(fac.operator)}の施設情報</a>` : ""}
    </span></li>`;
  }

  // 選んだ休憩を入れて時刻を組み直す(休憩の分だけ後ろにずらす。ずらした後の混み具合は計算し直さない)
  function withChosenRests(state, o) {
    let cursor = o.dep;
    const legs = o.legs.map((l, k) => {
      const rests = l.cands.filter((c) => state.selected[k]?.has(restKey(c))).sort((a, b) => a.tSec - b.tSec);
      const dep = cursor;
      const arrive = addSec(dep, l.durationSec + rests.length * CFG.restMinutes * 60);
      cursor = k < state.waypoints.length ? addSec(arrive, state.waypoints[k].stayMin * 60) : arrive;
      return { ...l, dep, arrive, rests };
    });
    return legs;
  }

  function showOption(state, i) {
    const changed = state.current !== i;
    state.current = i;
    renderPlan(state, i);
    renderRestPicker(state, i);
    if (changed && (returnState || returnBusy)) invalidateReturn("往路の出発時刻を変えたので、帰りのプランを再計算してください。");
    if (!$("itinerary-card").classList.contains("hidden")) renderItinerary(state);
    refreshChecklist();
  }

  const intervalText = (m) => (m >= 60 ? `${m / 60}時間`.replace(".5時間", "時間30分") : `${m}分`);

  function renderPlan(state, i) {
    const o = state.options[i];
    if (!o || o.error) return;
    const { interval } = state;
    const multi = state.waypoints.length > 0;
    const legs = withChosenRests(state, o);
    const restCount = legs.reduce((s, l) => s + l.rests.length, 0);
    $("plan-title").textContent = `わんこ旅行プラン(${fmtClock(o.dep)}出発${restCount ? `・休憩${restCount}回込み` : ""})`;

    const warns = [];
    legs.forEach((l) => {
      if (!l.needsRest || l.rests.length) return;
      warns.push(l.cands.length
        ? `${l.from.name} → ${l.to.name} は、休憩なしだと前の休憩から約${fmtDur(l.sinceRestAtEnd)}運転します(目安は${intervalText(interval.minutes)}ごと)。下の「休憩場所を選ぶ」から選べます。`
        : `${l.from.name} → ${l.to.name} は運転が長めですが、ルート沿いに休憩できるSA・PA・道の駅が見つかりませんでした(一般道中心のルートの可能性)。途中の道の駅やコンビニ駐車場での休憩を計画してください。`);
    });
    for (const l of legs.filter(isApproxLeg)) {
      warns.push(`${l.from.name} → ${l.to.name} は、位置が地区や市区町村の中心までしか分からないため、この区間の移動時間は正しく計算できていません。実際の位置と移動時間を地図で確認してください。`);
    }
    const last = legs[legs.length - 1];
    const h = jst(last.arrive).h;
    const ht = state.place.type === "lodging" ? hotelTimes(state.place) : null;
    if (ht) {
      const am = jstMinutes(last.arrive), ci = minutesOf(ht.checkin), lc = minutesOf(ht.last_checkin);
      if (ci != null && am < ci) warns.push(`宿への到着が${fmtClock(last.arrive)}で、チェックイン開始(${ht.checkin})より${fmtDur((ci - am) * 60)}早い計算です。荷物を預けられるか宿に確認するか、立ち寄り先や近くの場所で時間を調整してください。`);
      else if (lc != null && am > lc) warns.push(`宿への到着が${fmtClock(last.arrive)}で、最終チェックイン(${ht.last_checkin})を過ぎる計算です。出発を早めるか、遅れる旨を宿に連絡してください。`);
      else if (h >= 20 || h < 5) warns.push(`宿への到着が${fmtClock(last.arrive)}になります。チェックインの受付時間を宿に確認してください。`);
    } else if (state.place.type === "lodging" && (h >= 20 || h < 5)) warns.push(`宿への到着が${fmtClock(last.arrive)}になります。チェックインの受付時間を宿に確認してください。`);
    if (restCount) warns.push("休憩を入れた分だけ後ろの時刻をずらしています。ずれた後の渋滞の変化は計算し直していません。");
    $("plan-warn").innerHTML = warns.map((w) => `<div class="warnbox">${esc(w)}</div>`).join("");

    const items = [`<li class="stop"><span class="time">${fmtClock(o.dep)}</span><span><span class="badge b-go">出発</span> <b>${esc(state.origin.name)}</b></span></li>`];
    legs.forEach((l, k) => {
      items.push(`<li class="leg"><span class="time"></span><span class="note">${multi ? `区間${k + 1}: ` : ""}${isApproxLeg(l)
        ? "近くへの移動(位置が大まかなため時間は計算できていません)"
        : `運転${fmtDur(l.durationSec)}(渋滞の影響 ${delayText(l.durationSec - l.staticDurationSec)})`}</span></li>`);
      let restAcc = 0;
      for (const r of l.rests) {
        items.push(restItem(r, addSec(l.dep, r.tSec + restAcc)));
        restAcc += CFG.restMinutes * 60;
      }
      if (k < state.waypoints.length) {
        const w = state.waypoints[k];
        const leave = addSec(l.arrive, w.stayMin * 60);
        items.push(`<li class="stop"><span class="time">${fmtClock(l.arrive)}</span><span>
          <span class="badge b-via">立ち寄り${k + 1}</span> <b>${esc(w.name)}</b> <span class="badge">${esc(w.kind || "地点")}</span><br>
          <span class="note">滞在${fmtStay(w.stayMin)} → ${fmtClock(leave)}発${w.stayMin >= REST_RESET_MIN ? "(ここで休憩した扱い)" : ""}</span>
          ${w.place?.page_url ? `<br><a href="${esc(w.place.page_url)}">施設情報を開く</a>` : ""}
        </span></li>`);
      }
    });
    items.push(`<li class="stop"><span class="time">${fmtClock(last.arrive)}</span><span><span class="badge b-go">到着</span> <b>${esc(state.place.name)}</b></span></li>`);
    $("plan").innerHTML = items.join("");

    // Googleマップ: 立ち寄り先は必ず入れ、選んだ休憩地点は入りきる分だけ(経由地は9か所まで)
    const via = [];
    const restSlots = 9 - state.waypoints.length;
    let restUsed = 0;
    legs.forEach((l, k) => {
      for (const r of l.rests) if (restUsed < restSlots) { via.push(`${r.stop.lat},${r.stop.lon}`); restUsed++; }
      if (k < state.waypoints.length) via.push(`${state.waypoints[k].lat},${state.waypoints[k].lon}`);
    });
    const nav = new URL("https://www.google.com/maps/dir/");
    nav.searchParams.set("api", "1");
    // 現在地から出発する場合は origin を付けない(Googleマップが端末の現在地を使うので、位置をURLに残さない)
    if (!state.origin.isCurrentLocation) nav.searchParams.set("origin", `${state.origin.lat},${state.origin.lon}`);
    nav.searchParams.set("destination", `${state.place.name} ${state.place.area}`);
    nav.searchParams.set("travelmode", "driving");
    if (via.length) nav.searchParams.set("waypoints", via.join("|"));
    const label = [multi ? "立ち寄り先" : "", restCount ? "休憩地点" : ""].filter(Boolean).join("・");
    $("plan-actions").innerHTML = `<a href="${esc(nav.toString())}" target="_blank" rel="noopener">${label ? label + "つきで" : ""}Googleマップを開く</a>`;
    renderMap(state);
  }

  // 地図(route-map.js)に渡す表示データ。往路は選択中の出発時刻の各区間の経路、帰りは計算済みなら点線で
  function renderMap(state) {
    if (!window.RouteMap) return;
    const o = state.options[state.current];
    if (!o || o.error) { window.RouteMap.hide(); return; }
    const legs = withChosenRests(state, o);
    const rs = returnState && returnState.place && returnState.place.id === state.place.id ? returnState : null;
    const stopPt = (r) => ({ lat: r.stop.lat, lon: r.stop.lon, name: r.stop.name, kind: r.stop.kind, note: r.dogRun ? "・ドッグランあり" : "" });
    const wpPt = (w) => ({ lat: w.lat, lon: w.lon, name: w.name, kind: w.kind, stayMin: w.stayMin, url: w.place?.page_url });
    const data = {
      origin: state.origin.isCurrentLocation ? { ...state.origin, name: "現在地(約100m単位)" } : state.origin,
      destination: { lat: state.place.geocode.lat, lon: state.place.geocode.lon, name: state.place.name, url: state.place.page_url },
      waypoints: state.waypoints.map(wpPt),
      rests: legs.flatMap((l) => l.rests.map(stopPt)),
      legs: legs.map((l) => ({ points: l.points, back: false })),
    };
    if (rs) {
      const rl = returnLegsWithRests(rs);
      data.returnWaypoints = rs.waypoints.map(wpPt);
      data.returnRests = rl.flatMap((l) => l.rests.map(stopPt));
      data.legs.push(...rl.map((l) => ({ points: l.points, back: true })));
    }
    data.summary = `${fmtClock(o.dep)}出発の経路${state.waypoints.length ? `(立ち寄り${state.waypoints.length}か所)` : ""}${rs ? "・帰りは点線" : ""}。印をタップすると名前と詳細リンクが出ます。小さな印は中継地の候補です。`;
    data.candidates = mapCandidates(state, legs);
    data.candidateKm = CAND_KM;
    data.maxWaypoints = MAX_WAYPOINTS;
    data.stayChoices = STAY_CHOICES;
    data.onApply = (picks) => applyMapPicks(state, picks);
    window.RouteMap.render(data);
  }

  // ---- 地図の中継地候補(段階3)
  // 選択中の出発時刻の経路(立ち寄りを含む全区間)から直線 CAND_KM 以内の、位置が施設まで分かるおでかけ先と、
  // 進行方向で使える SA・PA・道の駅(各区間の休憩候補と同じ判定)。宿・行き先・すでに立ち寄りに入れた場所は出さない。
  // 候補はこの経路に固定(追加後の経路から候補を取り直すと候補が際限なく広がるため)。再計算は「立ち寄りに入れて再計算」でだけ行う
  const CAND_KM = 8;
  const CAND_MAX = 200;
  const candCategory = (v) => {
    if (v.stop) return "rest";
    const ks = v.place?.kinds || [];
    for (const [k, c] of [["run", "run"], ["cafe", "cafe"], ["park", "park"], ["travel", "park"], ["animal", "animal"], ["shopping", "shopping"], ["rest-stop", "rest"]]) if (ks.includes(k)) return c;
    return "other";
  };
  // 経路上の最寄り頂点までの走行距離(km)。候補を経路に沿った順に並べるために使う
  function routeAlong(points, cum, p) {
    let best = Infinity, idx = 0;
    for (let i = 0; i < points.length; i++) { const d = km(points[i], p); if (d < best) { best = d; idx = i; } }
    return cum[idx];
  }
  function mapCandidates(state, legs) {
    const points = legs.flatMap((l) => l.points || []);
    if (points.length < 2) return [];
    const cum = cumulative(points);
    let minLat = 90, maxLat = -90, minLon = 180, maxLon = -180;
    for (const [la, lo] of points) { minLat = Math.min(minLat, la); maxLat = Math.max(maxLat, la); minLon = Math.min(minLon, lo); maxLon = Math.max(maxLon, lo); }
    const m = CAND_KM / 80;  // 緯度 1 度 ≈ 111km。前絞りの箱は少し広めに
    const used = new Set(state.waypoints.map((w) => w.input));
    const restOK = new Set(legs.flatMap((l) => l.cands.map((c) => c.stop.name)));
    const out = [];
    for (const [label, v] of wpByLabel) {
      if (used.has(label)) continue;
      if (v.place ? (v.place.id === state.place.id || v.place.type === "lodging" || v.approx) : !restOK.has(v.name)) continue;
      if (v.lat < minLat - m || v.lat > maxLat + m || v.lon < minLon - m || v.lon > maxLon + m) continue;
      const distance = distanceToRoute([v.lat, v.lon], points);
      if (!(distance <= CAND_KM)) continue;
      const hints = v.place?.dog_hints || {};
      out.push({ id: v.place ? `place:${v.place.id}` : `stop:${v.name}|${Number(v.lat).toFixed(4)},${Number(v.lon).toFixed(4)}`, label, lat: v.lat, lon: v.lon, name: v.name, cat: candCategory(v),
        area: v.place ? v.place.area || "" : v.kind, kind: v.stop ? v.kind : "", url: v.place?.page_url, distance, along: routeAlong(points, cum, [v.lat, v.lon]),
        dogRun: Boolean(v.stop?.dog_run), checkedAt: v.place?.checked_at || "", cert: Boolean(hints.cert_required), theme: v.place?.theme || "" });
    }
    return out.sort((a, b) => a.distance - b.distance).slice(0, CAND_MAX).sort((a, b) => a.along - b.along);
  }
  // 地図から再計算する前のプラン(同じ出発時刻で、運転時間の差と滞在込み到着の差を出すため)
  let planBaseline = null;
  function renderPlanDiff(state) {
    const box = $("plan-diff"); if (!box) return;
    const b = planBaseline; planBaseline = null;
    if (!b) { box.innerHTML = ""; return; }
    const idx = state.options.findIndex((o) => !o.error && o.dep.getTime() === b.depMs);
    if (idx < 0) { box.innerHTML = `<p class="note">再計算前(${esc(b.label)}出発)と同じ出発時刻の結果が無いため、時間の差は出せません。</p>`; return; }
    if (state.current !== idx) showOption(state, idx);  // 差を見比べられるよう、同じ出発時刻のプランを表示する
    const o = state.options[idx];
    const dd = Math.round((o.totals.driveSec - b.driveSec) / 60), da = Math.round((o.finalArrive.getTime() - b.arriveMs) / 60000);
    const sgn = (m) => (m > 0 ? `+${m}分` : m < 0 ? `${m}分` : "変わらず");
    box.innerHTML = `<div class="diffbox"><b>地図で選んだ場所を入れた結果</b>(${esc(b.label)}出発で比較・立ち寄り ${b.waypoints}→${state.waypoints.length}か所)<br>運転時間 <b>${sgn(dd)}</b>(寄り道の分)・到着 <b>${sgn(da)}</b>(滞在時間を含む)。休憩の時間は含みません。</div>`;
  }
  // 地図で選んだ候補を立ち寄り行に入れて再計算する。既存の立ち寄りと合わせて経路に沿った順に並べ、MAX_WAYPOINTS を超える分は入れない
  function applyMapPicks(state, picks) {
    const o = state.options[state.current];
    planBaseline = { depMs: o.dep.getTime(), driveSec: o.totals.driveSec, arriveMs: o.finalArrive.getTime(), waypoints: state.waypoints.length, label: fmtClock(o.dep) };
    const points = o.legs.flatMap((l) => l.points || []); const cum = cumulative(points);
    const existing = [...$("wps").children]
      .map((row) => ({ label: row.querySelector(".wp-q").value, stayMin: Number(row.querySelector(".wp-stay").value) }))
      .filter((w) => w.label && wpByLabel.has(w.label))
      .map((w) => ({ ...w, name: wpByLabel.get(w.label).name, along: routeAlong(points, cum, [wpByLabel.get(w.label).lat, wpByLabel.get(w.label).lon]) }));
    const fresh = picks.filter((p) => wpByLabel.has(p.label) && !existing.some((e) => e.label === p.label)).sort((a, b) => a.along - b.along);
    const room = Math.max(0, MAX_WAYPOINTS - existing.length);
    const used = [...existing, ...fresh.slice(0, room)].sort((a, b) => a.along - b.along), over = fresh.slice(room);  // 既存の立ち寄りは残し、空き枠だけ足す
    singleDeparture = isoJST(o.dep);  // 再計算は選択中の出発時刻 1 本(比較条件を固定)
    $("wps").replaceChildren();
    for (const w of used) addWaypointRow(w.label, w.stayMin);
    renumberWaypoints();
    $("form").requestSubmit();
    return { used, over };
  }

  // 二本目: 運転が長い区間(前の休憩から目安の間隔を超える区間)だけ、ルート沿いのSA・PA・道の駅から休憩場所を選ぶ
  function renderRestPicker(state, i) {
    const o = state.options[i];
    const box = $("rest-pick");
    if (!o || o.error) { box.innerHTML = ""; return; }
    const { interval } = state;
    $("rest-intro").textContent = `運転45分以上の区間ごとに、ルート沿いのSA・PA・道の駅を候補に出します(前の休憩から${intervalText(interval.minutes)}を超える区間には印)${interval.reasons.length ? `(${interval.reasons.join("・")}のため${intervalText(interval.minutes)}ごと)` : "(成犬は2時間ごとが目安)"}。選ぶと上のプランの時刻に休憩${CFG.restMinutes}分ずつを足します。「おすすめ」は目安の時間に近い場所から、ドッグラン・ペット施設・SA・PAを優先して選んだものです。`;
    const long = o.legs.map((l, k) => [l, k]).filter(([l]) => l.needsRest || l.durationSec >= 45 * 60);
    if (!long.length) {
      box.innerHTML = `<p class="note">運転45分以上の区間がないので、休憩の候補は出しません。途中で休みたいときは、上の立ち寄り先にSA・PA・道の駅を入れてください。</p>`;
      return;
    }
    box.innerHTML = long.map(([l, k]) => {
      const rec = new Set(l.recommended.map(restKey));
      const rows = l.cands.map((c) => {
        const key = restKey(c), fac = (c.stop.facilities || [])[0];
        return `<label class="rest-opt"><input type="checkbox" data-leg="${k}" value="${esc(key)}"${state.selected[k]?.has(key) ? " checked" : ""}>
          <span><b>${esc(c.stop.name)}</b> ${restBadges(c)}${rec.has(key) ? '<span class="badge b-rec">おすすめ</span>' : ""}<br>
          <span class="note">この区間の運転${fmtDur(c.tSec)}の地点${fac?.road ? ` / ${esc(fac.road)}` : ""}</span></span></label>`;
      }).join("");
      return `<div class="rest-leg"><h3>${esc(l.from.name)} → ${esc(l.to.name)}${l.needsRest ? ' <span class="badge b-rec">目安を超える区間</span>' : ' <span class="badge">任意</span>'}</h3>
        <p class="note">運転${fmtDur(l.durationSec)}${l.sinceRestAtStart > 0 ? `(前の休憩から通算 約${fmtDur(l.sinceRestAtEnd)})` : ""}</p>
        ${rows ? `${rec.size ? `<button type="button" class="sub rest-rec" data-leg="${k}">おすすめを選ぶ</button>` : ""}<div class="rest-list">${rows}</div>`
          : '<p class="note">ルート沿いに休憩できるSA・PA・道の駅が見つかりませんでした。途中の道の駅やコンビニ駐車場での休憩を計画してください。</p>'}</div>`;
    }).join("");
    const update = () => { renderPlan(state, state.current); if (returnState || returnBusy) invalidateReturn("往路の休憩を変えたので、帰りのプランを再計算してください。"); if (!$("itinerary-card").classList.contains("hidden")) renderItinerary(state); refreshChecklist(); };
    box.querySelectorAll('input[type="checkbox"]').forEach((cb) => cb.addEventListener("change", () => {
      const k = Number(cb.dataset.leg);
      const set = state.selected[k] || (state.selected[k] = new Set());
      if (cb.checked) set.add(cb.value); else set.delete(cb.value);
      update();
    }));
    box.querySelectorAll(".rest-rec").forEach((btn) => btn.addEventListener("click", () => {
      const k = Number(btn.dataset.leg);
      const l = o.legs[k];
      state.selected[k] = new Set(l.recommended.map(restKey));
      box.querySelectorAll(`input[data-leg="${k}"]`).forEach((cb) => { cb.checked = state.selected[k].has(cb.value); });
      update();
    }));
  }

  function renderDestination(place, profile) {
    const facts = Object.entries(place.facts || {}).slice(0, 3)
      .map(([k, v]) => `<p style="margin:4px 0"><b>${esc(k)}:</b> ${esc(v)}</p>`).join("");
    const warns = [];
    const h = place.dog_hints || {};
    if (profile.size !== "small" && (h.small_dog_only_mention || (h.weight_limit_kg_mentions || []).some((kg) => kg <= 10))) {
      warns.push("掲載情報に小型犬向け・体重制限の記載があります。うちの子が対象か、条件を確認してください。");
    }
    if (profile.heatCycle) warns.push("ヒート中(発情期)は受け入れない宿・ドッグランが多いです。予約前に施設へ確認してください。");
    if (h.cert_required) warns.push(profile.vaccine ? "ワクチン・狂犬病の証明書の提示・持参が条件です(公式の条件文を確認)。忘れずに持っていきましょう。" : "ワクチン・狂犬病の証明書の提示・持参が条件の行き先です。証明書がないと利用できません。");
    else if (h.vaccine_required) warns.push("ワクチン接種済みが条件です(証明書の要否は公式で確認)。");
    const official = (place.links || []).filter((l) => !l.affiliate).slice(0, 2);
    const aff = (place.links || []).filter((l) => l.affiliate).slice(0, 1);
    $("dest-card").innerHTML = `
      ${place.photo ? `<img class="dest-photo" src="${esc(place.photo)}" alt="${esc(place.name)}の写真(楽天トラベル提供)" loading="lazy">` : ""}
      <h2>${esc(place.name)} <span class="badge">${esc(TYPE_LABEL[place.type])}</span></h2>
      <p class="note">${esc(place.area)}${place.theme ? " / " + esc(place.theme) : ""}${place.co_sleep ? " / " + esc(place.co_sleep) : ""}</p>
      ${hotelTimes(place) ? `<p class="note"><b>チェックイン:</b> ${esc(hotelTimes(place).checkin || "—")}${hotelTimes(place).last_checkin ? `〜${esc(hotelTimes(place).last_checkin)}` : ""} ／ <b>チェックアウト:</b> ${esc(hotelTimes(place).checkout || "—")} <span class="note">(楽天トラベル掲載情報・${esc((hotelTimes(place).fetched_at || "").slice(0, 10))}時点。プランによって異なる場合があります)</span></p>` : ""}
      ${warns.map((w) => `<div class="warnbox">${esc(w)}</div>`).join("")}
      ${facts}
      <div class="actions">
        <a href="${esc(place.page_url)}" target="_blank" rel="noopener">わんことのじかんで条件を見る</a>
        ${official.map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label || "公式サイト")}</a>`).join("")}
        ${aff.map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noopener sponsored">${esc(l.label || "予約サイトで空室を見る")}<span class="ad">広告</span></a>`).join("")}
      </div>
      <div id="dest-booking"></div>
      ${place.checked_at ? `<p class="note photo-note">掲載情報の確認日: ${esc(place.checked_at)}${place.photo ? "・写真は楽天トラベル提供" : ""}</p>` : ""}`;
  }

  function renderNearby(place) {
    const here = [place.geocode.lat, place.geocode.lon];
    // 宿は出さない(行き先の近くで犬と行けるおでかけ先だけ)
    const certOK = hasCert();
    let certHidden = 0;
    const list = PLACES.filter((p) => p.id !== place.id && p.page_url && p.type === "spot")
      .filter((p) => { if (!certOK && (p.dog_hints || {}).cert_required) { certHidden++; return false; } return true; })
      .map((p) => ({ p, d: km(here, [p.geocode.lat, p.geocode.lon]) }))
      .filter((x) => x.d <= CFG.nearbyKm && x.d >= 0.15)  // 同じ敷地(0km)の別カードは出さない
      .sort((a, b) => compareDestinations(a.p, b.p))
      .map(({ p, d }) => {
        try {
          const url = new URL(p.page_url, location.href);
          return ["http:", "https:"].includes(url.protocol) ? { p, d, href: url.href } : null;
        } catch { return null; }
      })
      .filter(Boolean);
    const select = $("nearby-select");
    select.replaceChildren(new Option("掲載先を選ぶと施設情報へ移動します", ""));
    for (const type of ["spot"]) {
      const group = document.createElement("optgroup");
      group.label = `${TYPE_LABEL[type]}（50音順）`;
      for (const { p, d, href } of list.filter((x) => x.p.type === type)) {
        group.appendChild(new Option(`${p.name}（直線 約${Math.round(d)}km・地域の目安）`, href));
      }
      if (group.children.length) select.appendChild(group);
    }
    $("nearby-select-hint").textContent = (certHidden ? `証明書が必要な${certHidden}件は非表示(「証明書を持っていく」にチェックすると出ます)。` : "") + `行き先から直線${CFG.nearbyKm}km以内のおでかけ先を50音順で表示（宿は除く。読み未登録の英字名は末尾）。地域の代表点を含む目安です。選ぶと施設情報を開きます。`;
    select.onchange = () => {
      if (select.value) window.location.assign(select.value);
    };
    $("nearby-card").classList.toggle("hidden", !list.length);
    renderNearbyPicker(place, list);
    $("nearby").innerHTML = list.slice().sort((a, b) => a.d - b.d).slice(0, 6).map(({ p, d, href }) => `
      <a href="${esc(href)}">
        <span class="badge">${esc(TYPE_LABEL[p.type])}</span> <b>${esc(p.name)}</b>
        <small>${esc(p.area)} ・ 直線 約${Math.round(d)}km（地域の目安）${p.theme ? " ・ " + esc(p.theme) : ""} ・ 施設情報を開く</small></a>`).join("");
  }


  // ---------------------------------------------------------------- 主要駅からの走行時間(OSRM 前計算)・近くの掲載先の行程

  let DRIVE = null; // drive_times.json
  let TIMES = {};   // lodging_times.json: 宿ごとのチェックイン・最終チェックイン・チェックアウト(楽天トラベル掲載情報)
  const hotelTimes = (place) => (place && TIMES[place.id] && (TIMES[place.id].checkin || TIMES[place.id].checkout)) ? TIMES[place.id] : null;
  const minutesOf = (hhmm) => { const m = /^(\d{1,2}):(\d{2})/.exec(hhmm || ""); return m ? +m[1] * 60 + +m[2] : null; };
  const jstMinutes = (d) => { const j = jst(d); return j.h * 60 + j.mi; };
  function setDriveTimes(d) { DRIVE = d && d.places ? d : null; }
  function renderDriveFrom(place) {
    const box = $("dest-card");
    if (!DRIVE || !DRIVE.places[place.id] || !DRIVE.places[place.id].from) return;
    const from = DRIVE.places[place.id].from;
    const rows = DRIVE.hubs.map((h) => [h, from[h.id]]).filter(([, v]) => v && v[0] > 0).sort((a, b) => a[1][0] - b[1][0]).slice(0, 8)
      .map(([h, v]) => `<span class="badge">${esc(h.name)} 約${fmtDur(v[0] * 60)}・${v[1]}km</span>`).join(" ");
    if (rows) box.insertAdjacentHTML("beforeend", `<p class="note" style="margin-top:8px"><b>主要駅から車で(目安・渋滞なし):</b> ${rows}</p>`);
  }
  // 行き先→近くの掲載先の所要時間(分)。前計算があればそれ、無ければ直線距離×1.3 を 35km/h で
  function nearbyMinutes(placeId, spot, straightKm) {
    const v = DRIVE && DRIVE.places[placeId] && DRIVE.places[placeId].nearby && DRIVE.places[placeId].nearby[spot.id];
    if (v) return { min: v[0], km: v[1], exact: true };
    return { min: Math.max(5, Math.round(straightKm * 1.3 / 35 * 60)), km: Math.round(straightKm * 1.3 * 10) / 10, exact: false };
  }
  const NEARBY_STAY = [30, 60, 90, 120, 180];
  function renderNearbyPicker(place, list) {
    const box = $("nearby-pick");
    if (!list.length) { box.innerHTML = ""; $("nearby-actions").innerHTML = ""; refreshChecklist(); return; }
    const rows = list.slice().sort((a, b) => a.d - b.d).slice(0, 20).map(({ p, d }) => {
      const t = nearbyMinutes(place.id, p, d);
      return `<label class="rest-opt"><input type="checkbox" class="nb-pick" value="${esc(p.id)}"><span><b>${esc(p.name)}</b> <span class="badge">${esc((p.kinds || []).join("・") || TYPE_LABEL[p.type])}</span><br>
        <span class="note">${esc(p.area)} ・ 車で約${t.min}分(${t.km}km${t.exact ? "" : "・直線からの目安"})</span></span>
        <select class="nb-stay" data-id="${esc(p.id)}" style="margin-left:auto">${NEARBY_STAY.map((m) => `<option value="${m}"${m === 60 ? " selected" : ""}>${fmtStay(m)}</option>`).join("")}</select>
        <select class="nb-day" data-id="${esc(p.id)}"><option value="1">到着日(着いたあと)</option><option value="2">帰る日(帰り道に経由)</option></select></label>`;
    }).join("");
    box.innerHTML = `<p class="note">行程に入れる場所にチェックし、滞在時間と「到着日/帰る日」を選びます(近い順・最大20か所)。最終行程表は、ページ下部の「最終行程表を作る前に確認」から作ります。</p><div class="rest-list">${rows}</div>`;
    $("nearby-actions").innerHTML = `<a href="#check-card" class="sub-link">↓ 確認して最終行程表を作る</a>`;
    refreshChecklist();
  }
  function pickedNearby() {
    return [...document.querySelectorAll(".nb-pick:checked")].map((cb) => {
      const id = cb.value, p = byId.get(id);
      const stay = Number(document.querySelector(`.nb-stay[data-id="${CSS.escape(id)}"]`)?.value || 60);
      const day = Number(document.querySelector(`.nb-day[data-id="${CSS.escape(id)}"]`)?.value || 1);
      return p ? { p, stay, day } : null;
    }).filter(Boolean);
  }
  // d と同じ日本時間の日付で hh:mm の時刻を作る
  const clockOf = (d, hhmm) => { const [h, m] = hhmm.split(":").map(Number); return new Date(jstMidnight(d).getTime() + (h * 60 + m) * 60000); };
  // 出発日を 1 日目として i 日目の実日付(例: 10/5(日))
  const dayDate = (state, i) => jstMd(new Date(jstMidnight(state.options[state.current].dep).getTime() + (i - 1) * 86400000));
  function renderItinerary(state) {
    const o = state.options[state.current]; if (!o || o.error) return;
    const profile = state.profile || {};
    const legs = withChosenRests(state, o);
    const picks = pickedNearby();
    const dayItems = {};
    const warns = [];
    const add = (day0, time, cls, html) => { const day = time ? tripDayIndex(state, time) : day0; (dayItems[day] || (dayItems[day] = [])).push({ time, html: `<li class="${cls}"><span class="time">${time ? fmtClock(time) : ""}</span><span>${html}</span></li>` }); };
    // 到着日: 出発→休憩→立ち寄り→到着
    add(1, o.dep, "stop", `<span class="badge b-go">出発</span> <b>${esc(state.origin.name)}</b>`);
    let cursor = o.dep;
    legs.forEach((l, k) => {
      let restAcc = 0;
      for (const r of l.rests) { const t = addSec(l.dep, r.tSec + restAcc); add(1, t, "stop", `<span class="badge">休憩</span> ${esc(r.stop.name)} ${restBadges(r)}<br><span class="note">${CFG.restMinutes}分</span>`); restAcc += CFG.restMinutes * 60; }
      if (k < state.waypoints.length) { const w = state.waypoints[k]; add(1, l.arrive, "stop", `<span class="badge b-via">立ち寄り</span> <b>${esc(w.name)}</b><br><span class="note">滞在${fmtStay(w.stayMin)}</span>`); }
      cursor = l.arrive;
    });
    const last = legs[legs.length - 1];
    const htA = state.place.type === "lodging" ? hotelTimes(state.place) : null;
    const earlyNote = htA && minutesOf(htA.checkin) != null && jstMinutes(last.arrive) < minutesOf(htA.checkin) ? ` <span class="note">(チェックイン開始 ${esc(htA.checkin)} より前)</span>` : "";
    add(1, last.arrive, "stop", `<span class="badge b-go">到着</span> <b>${esc(state.place.name)}</b>${earlyNote}`);
    // 到着日の近くの掲載先(到着後に順番に回り、宿へ戻る)
    let t = last.arrive; let here = { lat: state.place.geocode.lat, lon: state.place.geocode.lon };
    const visit = (day, startTime, items, backToLodging = true) => {
      let tt = startTime; let prev = { lat: Number(state.place.geocode.lat), lon: Number(state.place.geocode.lon) };
      for (const { p, stay } of items) {
        const straight = km([prev.lat, prev.lon], [Number(p.geocode.lat), Number(p.geocode.lon)]);
        const mv = (prev === state.place.geocode || (prev.lat === Number(state.place.geocode.lat) && prev.lon === Number(state.place.geocode.lon))) ? nearbyMinutes(state.place.id, p, straight) : { min: Math.max(5, Math.round(straight * 1.3 / 35 * 60)), km: Math.round(straight * 13) / 10, exact: false };
        tt = addSec(tt, mv.min * 60);
        add(day, tt, "stop", `<span class="badge b-via">${esc(TYPE_LABEL[p.type])}</span> <b>${esc(p.name)}</b> <span class="note">(車で約${mv.min}分${mv.exact ? "" : "・目安"})</span><br><span class="note">滞在${fmtStay(stay)} → ${fmtClock(addSec(tt, stay * 60))}発${p.page_url ? ` ・ <a href="${esc(p.page_url)}">施設情報</a>` : ""}</span>`);
        tt = addSec(tt, stay * 60); prev = { lat: Number(p.geocode.lat), lon: Number(p.geocode.lon) };
      }
      if (items.length && day === 1 && backToLodging) {  // 到着日は最後に宿へ戻る(宿泊のとき)。翌日は最後の場所からそのまま帰路へ
        const back = km([prev.lat, prev.lon], [Number(state.place.geocode.lat), Number(state.place.geocode.lon)]);
        const bm = Math.max(5, Math.round(back * 1.3 / 35 * 60)); tt = addSec(tt, bm * 60);
        add(day, tt, "stop", `<span class="badge b-go">宿へ戻る</span> <span class="note">(車で約${bm}分・目安)</span>`);
      }
      return tt;
    };
    const day1 = picks.filter((x) => x.day === 1), day2 = picks.filter((x) => x.day === 2);
    const isLodging = state.place.type === "lodging";
    const rs = returnState && returnState.place && returnState.place.id === state.place.id ? returnState : null;
    let lastDay = isLodging ? 2 : 1;
    if (rs) {
      // 帰りのプランが計算済み: 帰る日(到着日/翌日/翌々日)に実ルート・休憩込みで出す(未計算の目安とは排他)
      const rl = returnLegsWithRests(rs); const d = rs.day;
      if (d >= 2 || !rs.via) {  // 到着日の近くの場所は到着後に回る(日帰りで経由 ON のときは全部を帰り道に回すので省く)
        const end1 = visit(1, t, day1, isLodging);
        if (isLodging && day1.length && jst(end1).h >= 19) warns.push(`到着日の予定は${fmtClock(end1)}に宿へ戻る計算です。宿の夕食・門限を確認してください。`);
      }
      if (!rs.via && day2.length) {  // 帰路で経由しない設定のときは、帰る日の施設を帰路の出発前に回る(宿のチェックアウト時刻から)
        const ht0 = isLodging ? hotelTimes(state.place) : null; const startAt = d >= 2 ? clockOf(new Date(jstMidnight(o.dep).getTime() + (d - 1) * 86400000), (ht0 && ht0.checkout) || "10:00") : t;
        const endV = visit(d, startAt, day2, false);
        if (endV > rs.dep) warns.push(`「帰る日」に選んだ場所を回ると ${fmtClock(endV)} になり、帰りの出発(${fmtClock(rs.dep)})に間に合いません。帰りの出発を遅らせるか、「近くの場所を経由」をオンにしてください。`);
      }
      add(d, rs.dep, "stop", `<span class="badge b-go">${isLodging && d >= 2 ? "チェックアウト・出発" : "出発(帰路)"}</span> <b>${esc(state.place.name)}</b>`);
      rl.forEach((l, k) => {
        let acc = 0; for (const r of l.rests) { add(d, addSec(l.dep, r.tSec + acc), "stop", `<span class="badge">休憩</span> ${esc(r.stop.name)} ${restBadges(r)}<br><span class="note">${CFG.restMinutes}分</span>`); acc += CFG.restMinutes * 60; }
        if (k < rs.waypoints.length) { const w = rs.waypoints[k]; add(d, l.arrive, "stop", `<span class="badge b-via">${esc(w.kind)}</span> <b>${esc(w.name)}</b><br><span class="note">滞在${fmtStay(w.stayMin)} → ${fmtClock(addSec(l.arrive, w.stayMin * 60))}発${w.place?.page_url ? ` ・ <a href="${esc(w.place.page_url)}">施設情報</a>` : ""}</span>`); }
      });
      const home = rl[rl.length - 1].arrive; const hd = tripDayIndex(state, home); const nRest = rl.reduce((s, l) => s + l.rests.length, 0);
      add(d, home, "stop", `<span class="badge b-go">帰宅</span> <b>${esc(state.origin.name)}</b> <span class="note">(${hd !== d ? dayLabel(hd) + fmtClock(home) + "・" : ""}実ルート${nRest ? `・休憩${nRest}回込み` : ""})</span>`);
      if (jst(home).h >= 21 || hd > d) warns.push(`帰宅が${dayLabel(hd)}${fmtClock(home)}になる計算です。出発を早めるか、経由する場所や滞在時間を減らしてください。`);
      if (d === 1 && day2.length && rs.via) warns.push("帰る日が到着日のため、「帰る日」に選んだ場所も到着日の帰り道に回しています。");
      lastDay = Math.max(d, hd);
    } else {
      let end1 = visit(1, t, day1, isLodging);
      if (isLodging && day1.length && (jst(end1).h >= 19)) warns.push(`到着日の予定は${fmtClock(end1)}に宿へ戻る計算です。宿の夕食・門限を確認してください。`);
      if (!isLodging) {  // 日帰り(帰りが未計算): 「帰る日」に選んだ場所も同じ日の続きとして回ってから帰路(往路と同じ運転時間の目安)
        if (day2.length) { end1 = visit(1, end1, day2, false); warns.push("行き先が宿ではないため、「帰る日」に選んだ場所は到着日の続きとして回る計算です。"); }
        const home = addSec(end1, o.totals.driveSec);
        add(1, home, "stop", `<span class="badge b-go">帰宅(目安)</span> <b>${esc(state.origin.name)}</b> <span class="note">(往路と同じ運転${fmtDur(o.totals.driveSec)}の目安。休憩は別途。「帰りのプラン」で実ルート計算できます)</span>`);
        if (jst(home).h >= 21 || jstYmd(home) !== jstYmd(o.dep)) warns.push(`帰宅が${fmtClock(home)}になる計算です。滞在を短くするか、早めの出発を検討してください。`);
      }
      if (isLodging) {  // 翌日: 宿を出て近くの掲載先→帰路(往路と同じ運転時間の目安)
        const ht2 = hotelTimes(state.place); const coTime = (ht2 && ht2.checkout) || "10:00";
        const checkout = clockOf(addSec(last.arrive, 24 * 3600), coTime);
        add(2, checkout, "stop", `<span class="badge b-go">チェックアウト(${ht2 && ht2.checkout ? esc(coTime) : "目安10:00"})</span> <b>${esc(state.place.name)}</b>`);
        const end2 = visit(2, checkout, day2);
        const driveBack = o.totals.driveSec;
        const home = addSec(day2.length ? end2 : checkout, driveBack);
        add(2, home, "stop", `<span class="badge b-go">帰宅(目安)</span> <b>${esc(state.origin.name)}</b> <span class="note">(${day2.length ? "最後の場所から" : "宿から"}往路と同じ運転${fmtDur(driveBack)}の目安。休憩は別途。「帰りのプラン」で実ルート計算できます)</span>`);
        if (jst(home).h >= 21) warns.push(`帰宅が${fmtClock(home)}になる計算です。翌日の予定を減らすか、早めの出発を検討してください。`);
      }
    }
    // ごはん・薬の時刻
    for (const [label, hhmm] of [["ごはん", profile.mealTime], ["薬", profile.medTime]]) {
      if (!hhmm) continue;
      for (let day = 1; day <= lastDay; day++) {
        const base = new Date(jstMidnight(o.dep).getTime() + (day - 1) * 86400000);
        add(day, clockOf(base, hhmm), "leg", `<span class="badge">${label}</span> <span class="note">${hhmm} ${label}の時刻(車内や休憩地点で。移動中なら直前の休憩で)</span>`);
      }
    }
    const check = [];
    if (profile.vaccine) check.push("狂犬病・混合ワクチンの接種証明書(宿・ドッグランで提示を求められることが多い)");
    if (profile.heatCycle) check.push("ヒート中は受け入れ不可の宿・ドッグランが多い。予約前に施設へ確認");
    if (profile.brachy) check.push("短頭種: 夏は日中の移動と屋外の滞在を短く。車内の温度と水分に注意");
    if (profile.dogs && Number(profile.dogs) > 1) check.push(`犬${profile.dogs}頭: 宿の1室あたりの頭数上限を確認`);
    if (profile.dogKg) check.push(`体重${profile.dogKg}kg: 宿の体重・大きさの上限を確認`);
    check.push("リード・マナーベルト・ペットシーツ・水と器・普段のフード・ケージ(持参が条件の宿)");
    const render = (day) => `<h3>${dayLabel(day)} <span class="note">${dayDate(state, day)}</span></h3><ol class="timeline">${dayItems[day].sort((a, b) => a.time - b.time).map((x) => x.html).join("")}</ol>`;
    const homeAt = rs ? returnHome(rs) : null;
    $("itinerary-title").textContent = `最終行程表(${fmtClock(o.dep)}出発・${state.origin.name} → ${state.place.name}${homeAt ? `・帰宅 ${dayLabel(tripDayIndex(state, homeAt))}${fmtClock(homeAt)}` : ""})`;
    $("itinerary-warn").innerHTML = warns.map((w) => `<div class="warnbox">${esc(w)}</div>`).join("");
    $("itinerary").innerHTML = Object.keys(dayItems).map(Number).sort((x, y) => x - y).map(render).join("") + `<div id="itin-booking"></div><div id="itin-help"></div><h3>持ち物・確認</h3><ul>${check.map((c) => `<li>${esc(c)}</li>`).join("")}</ul>`;
    renderBooking(state);
    renderNearbyHelp(state);
    $("itinerary-actions").innerHTML = `<button type="button" class="sub" id="itin-copy">行程表をコピー</button> <button type="button" class="sub" onclick="window.print()">印刷する</button>`;
    $("itin-copy").addEventListener("click", () => {
      const text = $("itinerary").innerText;
      const btn = $("itin-copy");
      (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject(new Error("clipboard"))).then(() => { if (btn.isConnected) { btn.textContent = "コピーしました"; setTimeout(() => { if (btn.isConnected) btn.textContent = "行程表をコピー"; }, 1500); } }).catch(() => { if (btn.isConnected) btn.textContent = "コピーできませんでした(選択してコピーしてください)"; });
    });
    $("itinerary-card").classList.remove("hidden");
  }


  // ---------------------------------------------------------------- 帰りのプラン(実ルート・休憩つき・帰宅時刻)

  let returnState = null;
  let returnBusy = false;  // 帰りの計算中(未計算と区別する)
  let returnStatusKind = "none";  // none / busy / done / failed / invalid(条件変更で無効)
  let returnSeq = 0;  // 通信の世代。条件が変わったら増やし、古い応答は捨てる
  const hhmm = (d) => { const j = jst(d); return `${String(j.h).padStart(2, "0")}:${String(j.mi).padStart(2, "0")}`; };
  const dayLabel = (i) => (i <= 1 ? "到着日" : i === 2 ? "翌日" : i === 3 ? "翌々日" : `${i - 1}日後`);
  function tripDayIndex(state, d) {  // 出発日を1日目として、その日付が何日目か(1=到着日/出発日)
    const o = state.options[state.current];
    return Math.round((jstMidnight(d) - jstMidnight(o.dep)) / 86400000) + 1;
  }

  function invalidateReturn(msg) {
    returnState = null; returnSeq++; returnBusy = false; returnStatusKind = msg ? "invalid" : "none";
    $("ret-plan").innerHTML = ""; $("ret-rest-pick").innerHTML = ""; $("ret-warn").innerHTML = "";
    $("ret-rest-title").classList.add("hidden"); $("ret-rest-intro").textContent = "";
    $("ret-status").textContent = msg || "";
    const btn = $("ret-go"); btn.disabled = false; btn.textContent = "帰りの時間を計算";
    if (lastState && !$("itinerary-card").classList.contains("hidden")) renderItinerary(lastState);
    if (lastState) renderMap(lastState);
    refreshChecklist();
  }

  function estimateVisitEnd(state, start, items) {  // 到着後に近くの場所を回って(宿なら)戻るまでの目安(renderItinerary の visit と同じ式)
    let tt = start; let prev = { lat: Number(state.place.geocode.lat), lon: Number(state.place.geocode.lon) }; let first = true;
    for (const { p, stay } of items) {
      const straight = km([prev.lat, prev.lon], [Number(p.geocode.lat), Number(p.geocode.lon)]);
      const mv = first ? nearbyMinutes(state.place.id, p, straight) : { min: Math.max(5, Math.round(straight * 1.3 / 35 * 60)) };
      tt = addSec(tt, (mv.min + stay) * 60); prev = { lat: Number(p.geocode.lat), lon: Number(p.geocode.lon) }; first = false;
    }
    if (items.length && state.place.type === "lodging") {
      const back = km([prev.lat, prev.lon], [Number(state.place.geocode.lat), Number(state.place.geocode.lon)]);
      tt = addSec(tt, Math.max(5, Math.round(back * 1.3 / 35 * 60)) * 60);
    }
    return tt;
  }

  function returnBaseTime(state) {
    // 帰る日と出発時刻から、帰りの出発時刻を決める。到着日は「到着(+経由 OFF なら近くの場所の訪問)」より前にはしない
    const o = state.options[state.current]; const legs = withChosenRests(state, o); const last = legs[legs.length - 1];
    const day = Number($("ret-day").value); const via = $("ret-via").checked;
    const base = new Date(jstMidnight(o.dep).getTime() + (day - 1) * 86400000);  // 出発日を 1 日目とした日付(到着が日をまたいでも dayLabel と一致)
    let dep = clockOf(base, $("ret-start").value || "10:00"); let adjusted = false;
    if (dep < last.arrive) { dep = clockOf(last.arrive, $("ret-start").value || "10:00"); if (dep < last.arrive) dep = addSec(last.arrive, 30 * 60); adjusted = true; }
    if (day === 1) {
      const floor = via ? addSec(last.arrive, 30 * 60) : estimateVisitEnd(state, last.arrive, pickedNearby().filter((x) => x.day === 1));
      if (dep < floor) { dep = floor; adjusted = true; }
    }
    return { dep, day, via, last, adjusted };
  }

  async function computeReturn(state) {
    const seq = ++returnSeq; const placeId = state.place.id; returnState = null; returnBusy = true; returnStatusKind = "busy"; refreshChecklist();
    const alive = () => seq === returnSeq && lastState && !lastState.stale && lastState.place.id === placeId;
    const btn = $("ret-go"); btn.disabled = true; btn.textContent = "計算中…"; $("ret-status").textContent = ""; $("ret-warn").innerHTML = ""; $("ret-plan").innerHTML = "";
    try {
      const { dep, day, via, adjusted } = returnBaseTime(state);
      if (adjusted) $("ret-start").value = hhmm(dep);
      // 日帰り(帰る日=到着日)で経由 ON は選んだ場所を全部、宿泊は「帰る日」に選んだ場所を帰り道に回す
      const picks = via ? pickedNearby().filter((x) => (day === 1 ? true : x.day === 2)) : [];
      const start = { lat: Number(state.place.geocode.lat), lon: Number(state.place.geocode.lon), name: state.place.name, approx: state.place.geocode.precision !== "facility" };
      const wps = picks.map(({ p, stay }) => ({ lat: Number(p.geocode.lat), lon: Number(p.geocode.lon), name: p.name, stayMin: stay, place: p, kind: TYPE_LABEL[p.type] }));
      const points = [start, ...wps, { ...state.origin, name: state.origin.name }];
      // 行きで選んだ休憩は帰りでは自動で選ばない(別の候補があれば)。上下線の別施設でも同じ場所なので名前(上り/下りを除く)で見る
      const avoid = new Set();
      for (const l of withChosenRests(state, state.options[state.current])) for (const r of l.rests) avoid.add(baseName(r.stop.name));
      const legs = []; let cursor = dep; let sinceRest = 0;
      for (let k = 0; k < points.length - 1; k++) {
        if (isApproxLeg({ from: points[k], to: points[k + 1] })) throw new Error(`${points[k].name} → ${points[k + 1].name} は位置が大まかなため計算できません。`);
        const data = await routeLeg(points[k], points[k + 1], [isoJST(cursor)]);
        if (!alive()) return;  // 行き先や条件が変わった: 古い応答は捨てる
        const r = data.results[0];
        if (!r || r.error || !r.polyline) throw new Error("帰りのルートが見つかりませんでした。");
        const pts = decodePolyline(r.polyline);
        const cands = stopsAlongRoute(pts, cumulative(pts), r.durationSec, cursor).filter((c) => !NOT_REST.test(c.stop.name));
        const sinceRestAtEnd = sinceRest + r.durationSec;
        const recommended = planRests(cands, r.durationSec, state.interval.minutes, sinceRest, avoid);
        legs.push({ from: points[k], to: points[k + 1], dep: cursor, arrive: addSec(cursor, r.durationSec), cands, recommended, sinceRestAtStart: sinceRest, sinceRestAtEnd,
          needsRest: sinceRestAtEnd > (state.interval.minutes + REST_SLACK_MIN) * 60, durationSec: r.durationSec, staticDurationSec: r.staticDurationSec, points: pts });
        cursor = addSec(cursor, r.durationSec + recommended.length * CFG.restMinutes * 60);  // 次の区間はおすすめ休憩込みの出発時刻で問い合わせる
        sinceRest = recommended.length ? 0 : sinceRestAtEnd;
        if (k < wps.length) { const stay = wps[k].stayMin; if (stay >= REST_RESET_MIN) sinceRest = 0; cursor = addSec(cursor, stay * 60); }
      }
      if (!alive()) return;
      returnState = { seq, dep, day, via, legs, waypoints: wps, selected: legs.map((l) => new Set(l.recommended.map(restKey))), interval: state.interval, origin: state.origin, place: state.place, avoid };
      returnStatusKind = "done";
      renderReturn(state);
      if (!$("itinerary-card").classList.contains("hidden")) renderItinerary(state);
    } catch (e) {
      if (alive()) { returnState = null; returnStatusKind = "failed"; $("ret-status").textContent = e.message || "帰りの計算に失敗しました。"; }
    } finally {
      if (seq === returnSeq) { btn.disabled = false; btn.textContent = "帰りの時間を計算"; returnBusy = false; refreshChecklist(); }
    }
  }

  function returnLegsWithRests(rs) {
    let cursor = rs.dep;
    return rs.legs.map((l, k) => {
      const rests = l.cands.filter((c) => rs.selected[k]?.has(restKey(c))).sort((a, b) => a.tSec - b.tSec);
      const dep = cursor; const arrive = addSec(dep, l.durationSec + rests.length * CFG.restMinutes * 60);
      cursor = k < rs.waypoints.length ? addSec(arrive, rs.waypoints[k].stayMin * 60) : arrive;
      return { ...l, dep, arrive, rests };
    });
  }

  function returnHome(rs) { const legs = returnLegsWithRests(rs); return legs[legs.length - 1].arrive; }

  function renderReturn(state) {
    const rs = returnState; if (!rs) return;
    const legs = returnLegsWithRests(rs); const home = legs[legs.length - 1].arrive; const restCount = legs.reduce((s, l) => s + l.rests.length, 0);
    const hd = tripDayIndex(state, home); const dl = dayLabel(rs.day);
    const warns = [];
    if (jst(home).h >= 21 || hd > rs.day) warns.push(`帰宅が${dayLabel(hd)}${fmtClock(home)}になる計算です。出発を早めるか、経由する場所や滞在時間を減らしてください。`);
    legs.forEach((l) => { if (l.needsRest && !l.rests.length) warns.push(`${l.from.name} → ${l.to.name} は前の休憩から約${fmtDur(l.sinceRestAtEnd)}運転します。下で休憩を選んでください。`); });
    $("ret-warn").innerHTML = warns.map((w) => `<div class="warnbox">${esc(w)}</div>`).join("");
    const items = [`<li class="stop"><span class="time">${fmtClock(rs.dep)}</span><span><span class="badge b-go">出発</span> <b>${esc(rs.place.name)}</b> <span class="note">(${dl})</span></span></li>`];
    legs.forEach((l, k) => {
      items.push(`<li class="leg"><span class="time"></span><span class="note">運転${fmtDur(l.durationSec)}(渋滞の影響 ${delayText(l.durationSec - l.staticDurationSec)})</span></li>`);
      let acc = 0; for (const r of l.rests) { items.push(restItem(r, addSec(l.dep, r.tSec + acc))); acc += CFG.restMinutes * 60; }
      if (k < rs.waypoints.length) { const w = rs.waypoints[k]; items.push(`<li class="stop"><span class="time">${fmtClock(l.arrive)}</span><span><span class="badge b-via">立ち寄り</span> <b>${esc(w.name)}</b> <span class="badge">${esc(w.kind)}</span><br><span class="note">滞在${fmtStay(w.stayMin)} → ${fmtClock(addSec(l.arrive, w.stayMin * 60))}発${w.stayMin >= REST_RESET_MIN ? "(ここで休憩した扱い)" : ""}</span>${w.place?.page_url ? `<br><a href="${esc(w.place.page_url)}">施設情報を開く</a>` : ""}</span></li>`); }
    });
    items.push(`<li class="stop"><span class="time">${fmtClock(home)}</span><span><span class="badge b-go">帰宅</span> <b>${esc(rs.origin.name)}</b>${hd !== rs.day ? ` <span class="note">(${dayLabel(hd)})</span>` : ""}${restCount ? ` <span class="note">(休憩${restCount}回込み)</span>` : ""}</span></li>`);
    $("ret-plan").innerHTML = items.join("");
    $("ret-status").innerHTML = `<b>帰宅 ${dayLabel(hd)} ${dayDate(state, hd)} ${fmtClock(home)}</b>(${dl} ${dayDate(state, rs.day)} ${fmtClock(rs.dep)}発・運転${fmtDur(legs.reduce((s, l) => s + l.durationSec, 0))}${restCount ? `・休憩${restCount}回` : ""}${rs.via ? "" : "・近くの場所は経由しない"})`;
    // 休憩の選択(45分以上の区間)
    const long = legs.map((l, k) => [l, k]).filter(([l]) => l.needsRest || l.durationSec >= 45 * 60);
    $("ret-rest-title").classList.toggle("hidden", !long.length);
    $("ret-rest-intro").textContent = long.length ? `運転45分以上の区間ごとに、ルート沿いのSA・PA・道の駅を候補に出します(おすすめは選択済み。行きで選んだ休憩には「行きで休憩」の印を付け、帰りでは自動で選びません。同じ所にしたいときはチェックしてください。前の休憩から${intervalText(rs.interval.minutes)}を超える区間には印)。休憩を変えても渋滞は再計算しません。` : "";
    $("ret-rest-pick").innerHTML = long.map(([l, k]) => {
      const rec = new Set(l.recommended.map(restKey));
      const rows = l.cands.map((c) => { const key = restKey(c), fac = (c.stop.facilities || [])[0];
        return `<label class="rest-opt"><input type="checkbox" data-leg="${k}" value="${esc(key)}"${rs.selected[k]?.has(key) ? " checked" : ""}><span><b>${esc(c.stop.name)}</b> ${restBadges(c)}${rec.has(key) ? '<span class="badge b-rec">おすすめ</span>' : ""}${rs.avoid && rs.avoid.has(key) ? '<span class="badge">行きで休憩</span>' : ""}<br><span class="note">この区間の運転${fmtDur(c.tSec)}の地点${fac?.road ? ` / ${esc(fac.road)}` : ""}</span></span></label>`; }).join("");
      return `<div class="rest-leg"><h3>${esc(l.from.name)} → ${esc(l.to.name)}${l.needsRest ? ' <span class="badge b-rec">目安を超える区間</span>' : ' <span class="badge">任意</span>'}</h3><p class="note">運転${fmtDur(l.durationSec)}</p>${rows ? `<div class="rest-list">${rows}</div>` : '<p class="note">ルート沿いに休憩できるSA・PA・道の駅が見つかりませんでした。</p>'}</div>`;
    }).join("");
    renderMap(state);
    $("ret-rest-pick").querySelectorAll('input[type="checkbox"]').forEach((cb) => cb.addEventListener("change", () => {
      if (returnState !== rs) return;
      const k = Number(cb.dataset.leg); const set = rs.selected[k] || (rs.selected[k] = new Set());
      if (cb.checked) set.add(cb.value); else set.delete(cb.value);
      renderReturn(state); if (!$("itinerary-card").classList.contains("hidden")) renderItinerary(state);
    }));
    $("return-card").classList.remove("hidden");
    refreshChecklist();
  }

  // ---------------------------------------------------------------- 最終行程表を作る前の確認(状態の表示だけ。再描画・通信はしない)
  function refreshChecklist() {
    const card = $("check-card"); const list = $("checklist"); if (!card || !list) return;
    const state = lastState;
    if (!state) { card.classList.add("hidden"); return; }
    const esc2 = esc;
    const items = [];
    const link = (href, text) => `<a href="${href}" class="fix-link">${esc2(text)}</a>`;
    // 1. 近くで犬と行ける場所
    const picks = pickedNearby(); const d1 = picks.filter((x) => x.day === 1).length, d2 = picks.filter((x) => x.day === 2).length;
    const nearbyCount = document.querySelectorAll(".nb-pick").length;
    items.push(picks.length
      ? { ok: true, text: `近くで犬と行ける場所: 到着日 ${d1}件・帰る日 ${d2}件をチェック済み`, fix: link("#nearby-card", "選び直す") }
      : nearbyCount ? { ok: false, text: `近くで犬と行ける場所: 未選択(候補 ${nearbyCount}件)。入れずに作ることもできます`, fix: link("#nearby-card", "選びに行く") }
      : { ok: true, text: "近くで犬と行ける場所: 行き先の近くに掲載先の候補はありません", fix: "" });
    // 2. 休憩
    const o = state.options[state.current]; const legs = o && !o.error ? withChosenRests(state, o) : [];
    const goRests = legs.reduce((s, l) => s + l.rests.length, 0);
    const over = legs.filter((l) => l.needsRest && !l.rests.length).length;
    const rs = returnState && returnState.place && returnState.place.id === state.place.id ? returnState : null;
    const backRests = rs ? returnLegsWithRests(rs).reduce((s, l) => s + l.rests.length, 0) : 0;
    items.push({ ok: !over, text: `休憩: 往路 ${goRests}回${rs ? `・復路 ${backRests}回` : ""}${over ? `(目安を超える区間が ${over}つ、休憩未選択)` : ""}`, fix: link("#rest-card", "休憩を選ぶ") });
    // 3. 帰りのプラン
    const retText = { none: "未計算 → 往路と同じ運転時間の目安で出します(復路の休憩は別途)", busy: "計算中…", done: rs ? `計算済み(帰宅 ${dayLabel(tripDayIndex(state, returnHome(rs)))} ${fmtClock(returnHome(rs))})` : "計算済み", failed: "計算に失敗 → 目安で出します", invalid: "条件を変えたので無効 → 再計算してください(目安で出します)" }[rs ? "done" : returnStatusKind];
    items.push({ ok: Boolean(rs), text: `帰りのプラン: ${retText}`, fix: rs ? "" : link("#return-card", "帰りを計算する") });
    // 4. 地図で選んだ中継地(未適用)
    const pend = window.RouteMap && window.RouteMap.pendingPicks ? window.RouteMap.pendingPicks() : [];
    if (pend.length) items.push({ ok: false, text: `地図で選んだ中継地 ${pend.length}件(${pend.slice(0, 3).join("・")}${pend.length > 3 ? "…" : ""})は、まだ立ち寄りに入れて再計算していません。このままだと行程に含まれません`, fix: link("#map-card", "再計算へ") });
    // 5. ごはん・薬
    const p = state.profile || {};
    items.push({ ok: true, text: `ごはん・薬の時刻: ${p.mealTime || p.medTime ? [p.mealTime ? `ごはん ${p.mealTime}` : "", p.medTime ? `薬 ${p.medTime}` : ""].filter(Boolean).join("・") : "入力なし(任意)"}`, fix: "" });
    list.innerHTML = items.map((it) => `<li class="${it.ok ? "ok" : "todo"}"><span class="mark">${it.ok ? "✓" : "！"}</span><span>${it.text}</span>${it.fix ? `<span class="fix">${it.fix}</span>` : ""}</li>`).join("");
    card.classList.remove("hidden");
    renderSteps(state, { picks, goRests, over, rs, pend });
    renderSummary(state, legs, rs);
  }

  // 進み具合バー(結果の先頭)。済 / 任意 / 未 を状態から決める。押すとその場所へ
  function renderSteps(state, x) {
    const nav = $("steps"); if (!nav) return;
    const itin = !$("itinerary-card").classList.contains("hidden");
    const steps = [
      { href: "#compare-card", label: "出発時刻", cls: "done", note: fmtClock(state.options[state.current].dep) + "発" },
      { href: "#map-card", label: "寄り道", cls: state.waypoints.length ? "done" : x.pend.length ? "todo" : "opt", note: state.waypoints.length ? `${state.waypoints.length}か所` : x.pend.length ? "未適用あり" : "任意" },
      { href: "#rest-card", label: "休憩", cls: x.over ? "todo" : x.goRests ? "done" : "opt", note: x.over ? "長い区間あり" : x.goRests ? `${x.goRests}回` : "任意" },
      { href: "#nearby-card", label: "近くの場所", cls: x.picks.length ? "done" : "opt", note: x.picks.length ? `${x.picks.length}件` : "任意" },
      { href: "#return-card", label: "帰り", cls: x.rs ? "done" : "opt", note: x.rs ? `${fmtClock(returnHome(x.rs))}帰宅` : "未計算" },
      { href: itin ? "#itinerary-card" : "#check-card", label: "行程表・予約", cls: itin ? "done" : "todo", note: itin ? "作成済み" : "最後に作る" },
    ];
    nav.innerHTML = steps.map((s, i) => `<a class="${s.cls}" href="${s.href}"><span class="n">${i + 1}</span>${esc(s.label)}<small>${esc(s.note)}</small></a>`).join("");
  }

  // 「この旅のイメージ」: 数字の表を読む前に、一日の流れを一段落で
  function renderSummary(state, legs, rs) {
    const box = $("plan-summary"); if (!box) return;
    const o = state.options[state.current]; if (!o || o.error || !legs.length) { box.innerHTML = ""; return; }
    const last = legs[legs.length - 1]; const restCount = legs.reduce((s, l) => s + l.rests.length, 0);
    const isLodging = state.place.type === "lodging";
    const ht = isLodging ? hotelTimes(state.place) : null;
    const picks = pickedNearby(); const day1 = picks.filter((p) => p.day === 1);
    const parts = [];
    parts.push(`${jstMd(o.dep)} の ${fmtClock(o.dep)} に${state.origin.name}を出発。`);
    if (state.waypoints.length) parts.push(`途中で${state.waypoints.map((w) => w.name).join("と")}に寄って、`);
    parts.push(`${restCount ? `休憩を${restCount}回はさみ、` : ""}${fmtClock(last.arrive)} ごろ${state.place.name}に着きます。`);
    if (ht && minutesOf(ht.checkin) != null) {
      const diff = minutesOf(ht.checkin) - jstMinutes(last.arrive);
      if (diff > 0) parts.push(`チェックインは ${ht.checkin} からなので、${day1.length ? `${day1.map((p) => p.p.name).join("・")}で過ごしてから宿へ。` : `近くで${fmtDur(diff * 60)}ほど遊んでから宿へ(下の「近くで犬と行ける場所」から選べます)。`}`);
      else if (minutesOf(ht.last_checkin) != null && jstMinutes(last.arrive) > minutesOf(ht.last_checkin)) parts.push(`最終チェックイン ${ht.last_checkin} を過ぎるので、出発を早めるか宿に連絡を。`);
      else parts.push(`チェックイン(${ht.checkin}〜)に間に合います。`);
    } else if (day1.length) parts.push(`着いたら${day1.map((p) => p.p.name).join("・")}へ。`);
    if (rs) { const home = returnHome(rs); parts.push(`帰りは${dayLabel(rs.day)}の ${fmtClock(rs.dep)} に出て、${fmtClock(home)} ごろ帰宅の予定です。`); }
    else if (isLodging) parts.push(`帰りは${ht && ht.checkout ? `チェックアウト(${ht.checkout})のあと` : "翌日"}、下の「帰りのプラン」で帰宅時刻まで出せます。`);
    else parts.push(`帰りは下の「帰りのプラン」で帰宅時刻まで出せます。`);
    box.innerHTML = `<div class="summary-box"><b>この旅のイメージ</b><p>${esc(parts.join(""))}</p></div>`;
  }

  // ---------------------------------------------------------------- 行程表の「予約する・準備する」
  let bookingGen = 0;
  const PET_NEG_JS = /(ペット|愛犬|わんこ|ワンちゃん|わんちゃん|犬)[^。]{0,8}(不可|NG|ＮＧ|禁止|お断り|ご遠慮|なし)|(不可|NG|ＮＧ)[^。]{0,4}(ペット|犬)/;
  const yen = (n) => (n == null ? "—" : `${Number(n).toLocaleString("ja-JP")}円`);
  // 楽天トラベルの取得時点の空室(計算済み行程の出発日 = チェックイン・1 泊・人数)。行程表と行き先カードで共用。空室情報が無ければ短い注記を返す
  async function rakutenVacancy(place, o, booking) {
    const ci = jstYmd(o.dep);
    const bk = booking || {}; const adultsRaw = bk.adultsRaw || ""; const adults = adultsRaw === "4" ? 4 : 2;
    const mismatch = adultsRaw && !["2", "4"].includes(adultsRaw);
    const nights = bk.nights || 1;
    let rak = ""; let hasPlans = false;
    try {
      if (!window.VacancyData) throw new Error("no-module");
      const data = await window.VacancyData.loadDate(ci, adults);
      {
        const h = data && data.hotels && data.hotels[place.id];
        const bad = window.VacancyData.validate(data, { checkin: ci, adults });
        const stale = Boolean(bad);
        const cond = `${jstMd(o.dep)}チェックイン・1泊・${adults}名`;
        if (nights !== 1) rak = `<p class="note">空室データは 1 泊・${adults}名の条件です。${nights}泊の予約は楽天トラベルの施設ページで日程を指定してください。</p>`;
        else if (stale) rak = `<p class="note">${esc(bad)}。予約サイトで最新の空室をご確認ください。</p>`;
        else if (!h) rak = `<p class="note">${esc(cond)}の条件では、取得時点(${esc(fmtWhen(data.scanned_at))})の楽天トラベルにこの宿の空室が見つかりませんでした(満室とは限りません)。</p>`;
        else {
          const petPlans = h.plans.filter((p) => window.VacancyData.petClass(p) === "pet");
          const unknown = h.plans.filter((p) => window.VacancyData.petClass(p) === "unknown");
          const row = (p, kind) => `<li class="vc-plan${kind === "pet" ? " vc-pet" : ""}">${kind === "pet" ? '<span class="badge b-run">犬対応プラン</span>' : '<span class="badge">一般客室(犬同伴の可否は未確認)</span>'} <b>${yen(p.total)}</b><span class="note">(${adults}名1泊・楽天表示)</span><br><span class="note">${esc(p.plan || "")}${p.room ? ` ／ ${esc(p.room)}` : ""}</span><br>${p.url ? `<a href="${esc(p.url)}" target="_blank" rel="noopener sponsored">楽天トラベルでこのプランを予約する(${esc(cond)})<span class="ad">広告</span></a>` : ""}</li>`;
          hasPlans = petPlans.length > 0 || unknown.length > 0;
          rak = `<p class="note">楽天トラベルの取得時点(${esc(fmtWhen(data.scanned_at))} 日本時間)の空室情報(${esc(cond)}${mismatch ? `。入力の人数 ${esc(adultsRaw)}名とは条件が違います` : ""})。現在は変わっている場合があります。表示している料金は取得時点の楽天表示額です。</p>
            <ul class="vc-plans">${petPlans.map((p) => row(p, "pet")).join("")}${!petPlans.length ? unknown.slice(0, 2).map((p) => row(p, "unknown")).join("") : ""}</ul>
            ${!petPlans.length && !unknown.length ? '<p class="note">取得時点の空室はペット不可の客室だけでした。</p>' : ""}`;
        }
      }
    } catch (e) {
      rak = e && e.message === "no-module" ? "" : `<p class="note">この条件(${esc(jstMd(o.dep))}・${adults}名)の空室は未確認です(満室とは限りません)。予約サイトでご確認ください。</p>`;
    }
    const credit = `<p class="rakuten-credit note"><a href="https://developers.rakuten.com/" target="_blank">Supported by Rakuten Developers</a></p>`;
    return { html: rak ? rak + credit : "", hasPlans };
  }
  // 行き先カード(行程表を作らない人向け): 同じ空室判定で日付入りの予約ボタンを出す
  let destBookingGen = 0;
  async function renderDestBooking(state) {
    const box = $("dest-booking"); if (!box || state.place.type !== "lodging") return;
    const gen = ++destBookingGen;
    box.innerHTML = `<p class="note">この日の空室(楽天トラベル・取得時点)を確認しています…</p>`;
    const r = await rakutenVacancy(state.place, state.options[state.current], state.booking);
    if (gen !== destBookingGen) return;
    box.innerHTML = r.html ? `<div class="book-src"><h4>${r.hasPlans ? "この日に予約できる客室(楽天トラベル・取得時点)" : "この日の空室(楽天トラベル・取得時点)"}</h4>${r.html}</div>` : "";
  }
  // もしものときの近くの施設(動物病院・薬局)。OpenPOI API(無料・キー不要・CORS 可。2026-10-03 公開)を補助枠として使う。
  // 犬同伴条件は分からないので「犬と行ける場所」の候補には混ぜない。取れなければ枠ごと出さない(無くても壊れない)。24 時間はブラウザに記憶。
  const POI_API = "https://api.openpoiapi.com/v1/search";
  let helpGen = 0;
  async function poiSearch(q, lat, lon, radius, limit) {
    const key = `wanko_poi:${q}:${lat.toFixed(3)},${lon.toFixed(3)}:${radius}`;
    try { const c = JSON.parse(localStorage.getItem(key) || "null"); if (c && Date.now() - c.t < 24 * 3600 * 1000) return c.r; } catch (e) {}
    const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 6000);
    try {
      const res = await fetch(`${POI_API}?q=${encodeURIComponent(q)}&center=${lon},${lat}&radius=${radius}&limit=${limit}`, { signal: ctl.signal });
      if (!res.ok) return [];
      const d = await res.json(); const r = Array.isArray(d.results) ? d.results : [];
      try { localStorage.setItem(key, JSON.stringify({ t: Date.now(), r })); } catch (e) {}
      return r;
    } catch (e) { return []; } finally { clearTimeout(timer); }
  }
  function kmBetween(a1, o1, a2, o2) {
    const R = 6371, d2r = Math.PI / 180, dLat = (a2 - a1) * d2r, dLon = (o2 - o1) * d2r;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a1 * d2r) * Math.cos(a2 * d2r) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  async function renderNearbyHelp(state) {
    const box = $("itin-help"); if (!box) return;
    const gen = ++helpGen; const place = state.place;
    const g = place.geocode || {}; const lat = Number(g.lat ?? place.lat), lon = Number(g.lon ?? place.lon);
    if (!isFinite(lat) || !isFinite(lon)) { box.innerHTML = ""; return; }
    const [vets, drugs] = await Promise.all([poiSearch("動物病院", lat, lon, 10000, 10), poiSearch("薬局", lat, lon, 5000, 10)]);
    if (gen !== helpGen) return;
    const pick = (rows, re, n) => rows.filter((r) => re.test(r.name || "") && isFinite(r.lat) && isFinite(r.lng))
      .map((r) => ({ ...r, km: kmBetween(lat, lon, r.lat, r.lng) })).sort((a, b) => a.km - b.km)
      .filter((r, i, arr) => arr.findIndex((x) => x.name === r.name) === i).slice(0, n);
    const v = pick(vets, /動物|ペット|獣医|アニマル/, 4), d = pick(drugs, /薬局|薬房|ドラッグ|薬店/, 4);
    if (!v.length && !d.length) { box.innerHTML = ""; return; }
    const li = (r) => `<li><a href="https://www.google.com/maps/search/?api=1&query=${r.lat},${r.lng}" target="_blank" rel="noopener">${esc(r.name)}</a> <span class="note">直線 約${r.km < 10 ? r.km.toFixed(1) : Math.round(r.km)}km${r.city ? `・${esc(r.city)}` : ""}</span></li>`;
    box.innerHTML = `<div class="book-src"><h4>もしものときの近くの施設(${esc(place.name)}の周辺)</h4>
      ${v.length ? `<p class="note">動物病院(10km 以内)</p><ul>${v.map(li).join("")}</ul>` : ""}
      ${d.length ? `<p class="note">薬局・ドラッグストア(5km 以内)</p><ul>${d.map(li).join("")}</ul>` : ""}
      <p class="note">診療時間・休診日・犬の受け入れは各施設にご確認ください(閉業していることもあります)。出典: <a href="https://openpoiapi.com/attribution.html" target="_blank" rel="noopener">OpenPOI API</a>(Overture Maps Foundation, overturemaps.org / Japan Food Facilities: 各自治体・厚生労働省のオープンデータを加工して作成)</p></div>`;
  }

  async function renderBooking(state) {
    const box = $("itin-booking"); if (!box) return;
    const gen = ++bookingGen; const place = state.place; const o = state.options[state.current];
    const sections = [];
    if (place.type === "lodging") {
      box.innerHTML = `<h3>予約する</h3><p class="note">楽天トラベルの取得時点の空室を確認しています…</p>`;
      const r = await rakutenVacancy(place, o, state.booking);
      if (gen !== bookingGen) return;
      sections.push(`<div class="book-src"><h4>楽天トラベルの空室情報</h4>${r.html || '<p class="note">空室データを読み込めませんでした。予約サイトでご確認ください。</p>'}</div>`);
      const others = (place.reserve || []).filter((l) => l.label !== "楽天トラベル").slice(0, 3);
      const rakutenPage = (place.reserve || []).find((l) => l.label === "楽天トラベル");
      const OTA = /rakuten\.co\.jp|travel\.yahoo\.co\.jp|ikyu\.com|jalan\.net|valuecommerce\.com|a8\.net|jtb\.co\.jp/;
      const official = [...new Map((place.links || []).filter((l) => !l.affiliate && /^https?:/.test(l.url || "") && !OTA.test(l.url)).map((l) => [l.url, l])).values()].slice(0, 2);
      sections.push(`<div class="book-src"><h4>他の予約サイト・公式で確認</h4><div class="actions">
        ${rakutenPage ? `<a href="${esc(rakutenPage.url)}" target="_blank" rel="noopener sponsored">楽天トラベルの施設ページ<span class="ad">広告</span></a>` : ""}
        ${others.map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noopener sponsored">${esc(l.label)}で宿泊プランを確認<span class="ad">広告</span></a>`).join("")}
        ${official.map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label || "公式サイト")}</a>`).join("")}
        ${place.page_url ? `<a href="${esc(place.page_url)}" target="_blank" rel="noopener">掲載情報(犬の条件)</a>` : ""}
      </div><p class="note">予約前に、頭数・体重・証明書・添い寝など犬の条件を宿に確認してください。他の予約サイトの空室はこのページでは調べていません。</p></div>`);
    } else {
      sections.push(`<div class="book-src"><h4>行き先の情報</h4><div class="actions">${place.page_url ? `<a href="${esc(place.page_url)}" target="_blank" rel="noopener">掲載情報(犬の条件)を見る</a>` : ""}${((place.links || []).filter((l) => !l.affiliate).slice(0, 2)).map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label || "公式サイト")}</a>`).join("")}</div></div>`);
    }
    sections.push(`<div class="book-src"><h4>準備する</h4><div class="actions"><a href="../travel-gear.html">旅行の犬用品を見る</a><a href="../wear.html?entry=travel#shop">旅の服(雨・冷え・宿のマナー)を見る</a></div></div>`);
    if (gen !== bookingGen) return;
    box.innerHTML = `<h3>予約する・準備する</h3>${sections.join("")}`;
  }
  const fmtWhen = (iso) => (iso ? String(iso).replace("T", " ").slice(0, 16) : "");

  function setupReturnCard(state) {
    invalidateReturn("");
    const o = state.options[state.current]; const legs = withChosenRests(state, o); const last = legs[legs.length - 1];
    const isLodging = state.place.type === "lodging";
    $("ret-day").value = isLodging ? "2" : "1";
    for (const opt of $("ret-day").options) opt.textContent = opt.textContent.replace(/\s*\d+\/\d+\(.\)$/, "") + " " + dayDate(state, Number(opt.value));
    const defaultStart = () => ($("ret-day").value === "1" ? hhmm(addSec(last.arrive, 2 * 3600)) : ((hotelTimes(state.place) || {}).checkout || "10:00"));
    $("ret-start").value = defaultStart();
    const changed = () => invalidateReturn("条件を変えたので「帰りの時間を計算」を押してください。");
    $("ret-go").onclick = () => computeReturn(state);
    $("ret-day").onchange = () => { $("ret-start").value = defaultStart(); changed(); };
    $("ret-start").onchange = changed; $("ret-via").onchange = changed;
    $("nearby-pick").onchange = () => { if (returnState || returnBusy) invalidateReturn("近くの場所の選択を変えたので、帰りのプランは再計算してください。"); else { if (!$("itinerary-card").classList.contains("hidden")) renderItinerary(state); refreshChecklist(); } };
    $("return-card").classList.remove("hidden");
    refreshChecklist();
  }

  // ---------------------------------------------------------------- 実行

  // 出発地「駅名で探す」: data/stations.json(国土数値情報 N02 の駅を掲載範囲 14 都県分に絞ったもの)を初回入力時に読み、
  // この画面の中だけで前方一致→部分一致で絞る(外部へは送らない)。選ぶと #origin に「検索した駅」の選択肢を足して選択状態にする。
  let STATIONS = null, stationsLoading = null, sugIndex = -1;
  const toHira = (s) => s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
  const normSt = (s) => toHira(String(s || "").normalize("NFKC")).replace(/\s+/g, "").replace(/(駅|えき)$/, "").toLowerCase();
  function loadStations() {
    if (STATIONS) return Promise.resolve(STATIONS);
    if (!stationsLoading) stationsLoading = fetch(`${CFG.dataBase}stations.json`).then((r) => (r.ok ? r.json() : null)).then((d) => {
      STATIONS = (d && d.stations || []).map((r) => ({ name: r[0], pref: r[1], lat: r[2], lon: r[3], lines: r[4] || [], key: normSt(r[0]), kana: normSt(r[6] || "") }));
      return STATIONS;
    }).catch(() => (STATIONS = []));
    return stationsLoading;
  }
  function searchStations(q) {  // 漢字でも読み(ひらがな・カタカナ)でも探せる。前方一致を先に、2 文字以上なら部分一致も
    const k = normSt(q); if (!k || !STATIONS) return [];
    const hit = (s, f) => f(s.key) || (s.kana && f(s.kana));
    const starts = STATIONS.filter((s) => hit(s, (x) => x.startsWith(k)));
    const inside = k.length >= 2 ? STATIONS.filter((s) => !hit(s, (x) => x.startsWith(k)) && hit(s, (x) => x.includes(k))) : [];
    return [...starts, ...inside].slice(0, 8);
  }
  function pickStation(s) {
    const sel = $("origin"); const val = `${s.lat},${s.lon}`;
    let grp = sel.querySelector('optgroup[data-searched]');
    if (!grp) { grp = document.createElement("optgroup"); grp.label = "検索した駅"; grp.dataset.searched = "1"; sel.insertBefore(grp, sel.firstElementChild); }
    let opt = [...grp.querySelectorAll("option")].find((o) => o.value === val);
    if (!opt) { opt = document.createElement("option"); opt.value = val; opt.textContent = `${s.name}駅(${s.pref})`; grp.appendChild(opt); }
    sel.value = val; sel.dispatchEvent(new Event("change", { bubbles: true }));
    $("origin-q").value = `${s.name}駅`; hideSug();
    $("origin-hint").textContent = `出発地を ${s.name}駅(${s.pref}${s.lines.length ? "・" + s.lines.slice(0, 3).join("・") : ""})にしました`;
  }
  function hideSug() { const b = $("origin-sug"); if (b) { b.classList.add("hidden"); b.innerHTML = ""; } $("origin-q")?.setAttribute("aria-expanded", "false"); sugIndex = -1; }
  function showSug(list) {
    const b = $("origin-sug"); if (!b) return;
    if (!list.length) { b.innerHTML = `<button type="button" disabled>見つかりません(掲載範囲の駅だけ検索できます)</button>`; b.classList.remove("hidden"); return; }
    b.innerHTML = list.map((s, i) => `<button type="button" role="option" data-i="${i}"><b>${esc(s.name)}駅</b> <span class="note">${esc(s.pref)}</span><span class="sub">${esc(s.lines.slice(0, 3).join("・"))}</span></button>`).join("");
    [...b.querySelectorAll("button")].forEach((btn, i) => btn.addEventListener("mousedown", (e) => { e.preventDefault(); pickStation(list[i]); }));
    b.classList.remove("hidden"); $("origin-q").setAttribute("aria-expanded", "true"); sugIndex = -1; b._list = list;
  }
  (function wireStationSearch() {
    const q = $("origin-q"); if (!q) return;
    let timer = null;
    q.addEventListener("focus", () => loadStations());
    q.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(() => loadStations().then(() => { if (q.value.trim()) showSug(searchStations(q.value)); else hideSug(); }), 120); });
    q.addEventListener("keydown", (e) => {
      const b = $("origin-sug"); const btns = b ? [...b.querySelectorAll("button:not([disabled])")] : [];
      if (e.key === "ArrowDown" || e.key === "ArrowUp") { if (!btns.length) return; e.preventDefault(); sugIndex = (sugIndex + (e.key === "ArrowDown" ? 1 : -1) + btns.length) % btns.length; btns.forEach((x, i) => x.classList.toggle("active", i === sugIndex)); }
      else if (e.key === "Enter") { if (btns.length) { e.preventDefault(); pickStation(b._list[sugIndex >= 0 ? sugIndex : 0]); } }
      else if (e.key === "Escape") hideSug();
    });
    q.addEventListener("blur", () => setTimeout(hideSug, 150));
  })();

  function getOrigin() {
    const v = $("origin").value;
    const name = $("origin").selectedOptions[0]?.textContent || "出発地";
    if (v !== "here") {
      const [lat, lon] = v.split(",").map(Number);
      return Promise.resolve({ lat, lon, name });
    }
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error("現在地を取得できません"));
      // 現在地は約100m単位に丸めてから送る(所要時間の計算には十分で、自宅などの正確な位置を外に出さない)
      const round3 = (v) => Math.round(v * 1000) / 1000;
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: round3(pos.coords.latitude), lon: round3(pos.coords.longitude), isCurrentLocation: true, name: "現在地" }),
        () => reject(new Error("現在地の利用が許可されませんでした。出発地を選んでください。")),
        { timeout: 10000 });
    });
  }

  // ---------------------------------------------------------------- 立ち寄り先

  const waypointRouteKey = () => ["origin", "dest-q", "date", "start"].map((id) => $(id).value).join("|");
  const waypointDistance = (d) => d < 1 ? "1km未満" : `約${Math.round(d)}km`;

  // 立ち寄り先の候補: 立ち寄り前のルート(出発地→行き先)から直線30km以内の、おでかけ先とSA・PA・道の駅(宿は入れない)。区分ごとに50音順
  function waypointCandidates() {
    const dest = byId.get($("dest-q").value);
    if (waypointRoute?.key !== waypointRouteKey()) return [];
    return [...wpByLabel].flatMap(([label, value]) => {
      if (value.place && value.place.id === dest?.id) return [];
      if (value.place?.type === "lodging") return [];
      if (value.stop && NOT_REST.test(value.name)) return [];
      const distance = distanceToRoute([value.lat, value.lon], waypointRoute.points);
      if (!Number.isFinite(distance) || distance > WP_RADIUS_KM) return [];
      return [{ label, value, distance }];
    }).sort((a, b) => compareDestinations(a.value.place || { name: a.value.name, id: a.label }, b.value.place || { name: b.value.name, id: b.label }));
  }

  function refreshWaypointChoices() {
    const candidates = waypointCandidates();
    const routeReady = waypointRoute?.key === waypointRouteKey();
    const count = (type) => candidates.filter((c) => (c.value.place?.type || "rest") === type).length;
    $("wp-route-status").textContent = !routeReady
      ? waypointMessage || "出発地・行き先・出発日時を選んでから「ルート沿いの候補を探す」を押してください（「＋ 立ち寄り先を追加」でも探します）。"
      : `ルートから直線${WP_RADIUS_KM}km以内の候補: おでかけ ${count("spot")}件・SA・PA・道の駅 ${count("rest")}件（区分ごとに50音順）。出発地・行き先・日時を変えたら探し直してください。`;
    const rows = [...$("wps").children];
    for (const row of rows) {
      const select = row.querySelector(".wp-q"), selected = select.value;
      const elsewhere = new Set(rows.filter((r) => r !== row).map((r) => r.querySelector(".wp-q").value).filter(Boolean));
      select.replaceChildren(new Option(!routeReady ? "先にルート沿いの候補を探してください" : candidates.length ? "立ち寄り先を選択（50音順）" : "ルートから30km以内に候補がありません", ""));
      for (const type of ["spot", "rest"]) {
        const group = document.createElement("optgroup");
        group.label = type === "rest" ? "SA・PA・道の駅" : TYPE_LABEL[type];
        for (const candidate of candidates.filter((c) => (c.value.place?.type || "rest") === type && !elsewhere.has(c.label))) {
          const { label, value, distance } = candidate;
          const info = `${value.place ? value.place.area || "地域未登録" : value.kind}・ルートから${waypointDistance(distance)}${value.approx ? "・地域の目安" : ""}`;
          group.appendChild(new Option(`${value.name}（${info}）`, label));
        }
        if (group.children.length) select.appendChild(group);
      }
      if (selected && ![...select.options].some((option) => option.value === selected)) {
        const retained = document.createElement("optgroup");
        retained.label = "選択中（現在の絞り込み対象外）";
        retained.appendChild(new Option(wpByLabel.get(selected)?.name || selected, selected));
        select.appendChild(retained);
      }
      select.value = selected;
      const summary = row.querySelector(".wp-summary");
      const selectedOption = [...select.options].find((option) => option.value === selected);
      summary.textContent = selected ? `${selectedOption?.textContent || selected}${selectedOption?.parentElement?.label === "選択中（現在の絞り込み対象外）" ? "（現在の絞り込み対象外・選択を保持しています）" : ""}` : "";
      summary.classList.toggle("hidden", !selected);
      const link = row.querySelector(".wp-details");
      const href = wpByLabel.get(selected)?.place?.page_url;
      link.classList.toggle("hidden", !href);
      if (href) link.href = href; else link.removeAttribute("href");
    }
  }

  function invalidateWaypointRoute() {
    waypointRequest++;
    waypointRoute = null;
    waypointMessage = "条件を変更しました。ルート沿いの候補をもう一度探してください。";
    $("find-wp-route").disabled = false;
    $("find-wp-route").textContent = "ルート沿いの候補を探す";
    refreshWaypointChoices();
  }

  async function findWaypointRoute() {
    const request = ++waypointRequest, key = waypointRouteKey();
    waypointRoute = null;
    waypointMessage = "ルートを確認しています…";
    $("find-wp-route").disabled = true;
    refreshWaypointChoices();
    try {
      const dest = byId.get($("dest-q").value);
      if (!hasRouteCoordinates(dest)) throw new Error("位置情報のある行き先を選んでください。");
      const departure = `${$("date").value}T${$("start").value}:00+09:00`;
      if (!(Date.parse(departure) > Date.now() + 120000)) throw new Error("これから出発する日付・時刻を選んでください。");
      const origin = await getOrigin();
      if (request !== waypointRequest || key !== waypointRouteKey()) return;
      const end = { lat: Number(dest.geocode.lat), lon: Number(dest.geocode.lon), approx: dest.geocode.precision !== "facility" };
      if (isApproxLeg({ from: origin, to: end })) throw new Error("出発地と行き先の位置が大まかで近いため、ルートを確認できません。出発地か行き先を変えてください。");
      const data = await routeLeg(origin, end, [departure]);
      if (request !== waypointRequest || key !== waypointRouteKey()) return;
      const result = data.results?.[0];
      const devHost = ["localhost", "127.0.0.1"].includes(location.hostname);  // 手元の開発サーバーでは仮データのルートでも絞り込みを試せる
      if ((data.mock && !devHost) || result?.error || !result?.polyline) throw new Error("ルートを取得できませんでした。時間をおいてもう一度お試しください。");
      const points = decodePolyline(result.polyline);
      if (points.length < 2 || points.some(([lat, lon]) => !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180)) throw new Error("ルートの位置情報を確認できませんでした。");
      waypointRoute = { key, points };
      waypointMessage = "";
    } catch (error) {
      if (request === waypointRequest) waypointMessage = error instanceof TypeError
        ? "ルートを取得できませんでした。通信環境を確認して、もう一度お試しください。"
        : error.message || "ルートを取得できませんでした。";
    } finally {
      if (request === waypointRequest) {
        $("find-wp-route").disabled = false;
        refreshWaypointChoices();
        if (waypointRoute && !$("wps").children.length) addWaypointRow();
      }
    }
  }

  function renumberWaypoints() {
    const rows = [...$("wps").children];
    rows.forEach((row, k) => {
      row.querySelector(".wp-no").textContent = k + 1;
      row.querySelector(".wp-up").disabled = k === 0;
    });
    $("add-wp").disabled = rows.length >= MAX_WAYPOINTS;
    $("add-wp").textContent = rows.length >= MAX_WAYPOINTS ? `立ち寄り先は${MAX_WAYPOINTS}か所まで` : "＋ 立ち寄り先を追加";
  }

  function addWaypointRow(value = "", stay = 60) {
    if ($("wps").children.length >= MAX_WAYPOINTS) return;
    const row = document.createElement("div");
    row.className = "wp";
    row.innerHTML = `
      <span class="wp-no"></span>
      <select class="wp-q" aria-label="立ち寄り先"><option value="">立ち寄り先を選択</option></select>
      <p class="wp-summary hidden"></p>
      <div class="wp-ctrl">
        <select class="wp-stay" aria-label="滞在時間">${STAY_CHOICES.map((m) =>
          `<option value="${m}"${m === stay ? " selected" : ""}>滞在 ${fmtStay(m)}</option>`).join("")}</select>
        <button type="button" class="wp-up" aria-label="順番を1つ前へ">↑ 前へ</button>
        <button type="button" class="wp-del" aria-label="この立ち寄り先を削除">削除</button>
      </div>
      <a class="wp-details hidden" target="_blank" rel="noopener">選んだ施設の条件・詳細を見る ↗</a>`;
    if (value) row.querySelector(".wp-q").appendChild(new Option(value, value, true, true));
    row.querySelector(".wp-q").addEventListener("change", refreshWaypointChoices);
    row.querySelector(".wp-del").addEventListener("click", () => { row.remove(); renumberWaypoints(); refreshWaypointChoices(); });
    row.querySelector(".wp-up").addEventListener("click", () => {
      if (row.previousElementSibling) row.parentNode.insertBefore(row, row.previousElementSibling);
      renumberWaypoints();
    });
    $("wps").appendChild(row);
    renumberWaypoints();
    refreshWaypointChoices();
    row.querySelector(".wp-q").focus();
  }

  async function readWaypoints() {
    const out = [];
    for (const [k, row] of [...$("wps").children].entries()) {
      const input = row.querySelector(".wp-q").value.trim();
      const stayMin = Number(row.querySelector(".wp-stay").value);
      if (!input) continue; // 空の行は無視
      const known = wpByLabel.get(input);
      if (known?.place?.id === $("dest-q").value || out.some((w) => w.input === input)) throw new Error(`立ち寄り先${k + 1}は行き先や他の立ち寄り先と重複しています。別の施設を選んでください。`);
      if (known) { out.push({ ...known, input, stayMin }); continue; }
      throw new Error(`立ち寄り先${k + 1}はプルダウンの候補から選んでください。`);
    }
    return out;
  }

  // Worker には日本時間(+09:00)の形で送る
  const isoJST = (d) => new Date(d.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 19) + "+09:00";

  async function routeLeg(from, to, departures) {
    const res = await fetch(`${CFG.apiBase}/routes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        origin: { lat: from.lat, lon: from.lon },
        destination: { lat: to.lat, lon: to.lon },
        departures,
      }),
    });
    if (!res.ok) throw new Error(res.status === 400 ? "入力内容を確認してください。" : "所要時間を計算できませんでした。時間をおいて再度お試しください。");
    return res.json();
  }

  function buildDepartures() {
    const date = $("date").value;
    const [h, m] = $("start").value.split(":").map(Number);
    const step = Number($("step").value), count = Number($("count").value);
    const out = [];
    for (let i = 0; i < count; i++) {
      const total = h * 60 + m + i * step;
      if (total >= 24 * 60) break;
      const iso = `${date}T${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}:00+09:00`;
      if (Date.parse(iso) > Date.now() + 2 * 60 * 1000) out.push(iso); // 過去の出発時刻は計算できない
    }
    return out;
  }

  let planSeq = 0;  // 往路の計算の世代。条件を変えて再計算したら増やし、古い応答は結果に使わない
  let singleDeparture = null;  // 地図からの再計算: 選択中の出発時刻だけ計算する
  // 条件変更・再計算開始で、表示中の結果を「前回の結果」にして行程作成・地図適用・帰路応答を止める(Codex 指摘 1・2)
  function invalidatePlan(msg) {
    planSeq++; bookingGen++; destBookingGen++;
    if (lastState) { lastState.stale = true; returnSeq++; returnState = null; returnBusy = false; returnStatusKind = "invalid"; }
    const n = $("plan-stale"); if (n) { n.textContent = msg || ""; n.classList.toggle("hidden", !msg); }
    $("check-card")?.classList.add("hidden"); $("itinerary-card")?.classList.add("hidden");
    if (window.RouteMap && window.RouteMap.setStale) window.RouteMap.setStale(Boolean(msg));
  }
  async function onSubmit(ev) {
    ev.preventDefault();
    invalidatePlan("再計算中…(表示中は前回の結果)");
    const seq = planSeq;
    $("error").classList.add("hidden");
    $("check-card")?.classList.add("hidden");
    const place = byId.get($("dest-q").value);
    if (!place) return showError("掲載先をプルダウンから選んでください。");
    if (!hasRouteCoordinates(place)) {
      showError("この掲載先はルート計算用の位置データが未登録です。掲載情報を確認してください。");
      if (place.page_url) {
        const link = document.createElement("a");
        link.href = place.page_url;
        link.textContent = "施設情報を開く";
        $("error").append(" ", link);
      }
      return;
    }
    let departures = singleDeparture ? [singleDeparture] : buildDepartures(); singleDeparture = null;
    if (!departures.length) return showError("出発時刻がすべて過去になっています。日付か時刻を変えてください。");
    const profile = { size: $("size").value, age: $("age").value, carsick: $("carsick").checked, heat: $("heat").checked || $("brachy").checked,
      brachy: $("brachy").checked, heatCycle: $("heat-cycle").checked, vaccine: $("vaccine").checked, toilet: Number($("toilet").value) || 0,
      mealTime: $("meal-time").value, medTime: $("med-time").value, dogs: $("dogs").value, dogKg: $("dog-kg").value };
    const date = new Date(`${$("date").value}T12:00:00+09:00`);
    const interval = restInterval(profile, date);

    $("go").disabled = true;
    $("go").textContent = "計算中…";
    try {
      const origin = await getOrigin();
      if (seq !== planSeq) return;
      const waypoints = await readWaypoints();
      const dest = { lat: Number(place.geocode.lat), lon: Number(place.geocode.lon), name: place.name,
        approx: place.geocode.precision !== "facility", page_url: place.page_url };
      const points = [origin, ...waypoints, dest];
      // 市町村中心などが重なる区間をゼロ分として合計に含めない。
      for (let k = 0; k < points.length - 1; k++) {
        if (isApproxLeg({ from: points[k], to: points[k + 1] })) {
          throw new Error(`${points[k].name} → ${points[k + 1].name} は位置が大まかなため、この区間を含む到着時刻を計算できません。立ち寄り先を変更するか、地図で実際の移動時間を確認してください。`);
        }
      }
      const legCount = points.length - 1;
      const maxOptions = Math.max(1, Math.floor(MAX_ROUTE_CALLS / legCount));
      const reduced = departures.length > maxOptions;
      if (reduced) departures = departures.slice(0, maxOptions);

      // 出発時刻ごとに、区間を順番に計算する。次の区間は「前の区間の到着+休憩+滞在」の時刻の混み具合で計算する
      const options = departures.map((iso) => ({ dep: new Date(iso), cursor: new Date(iso), sinceRest: 0, legs: [], error: null }));
      let mock = false;
      for (let k = 0; k < legCount; k++) {
        const active = options.filter((o) => !o.error);
        if (!active.length) break;
        const data = await routeLeg(points[k], points[k + 1], active.map((o) => isoJST(o.cursor)));
        if (seq !== planSeq) return;  // 新しい計算が始まっている: この応答は捨てる
        mock = mock || Boolean(data.mock);
        data.results.forEach((r, j) => {
          const o = active[j];
          if (r.error || !r.polyline) { o.error = r.error || "no_route"; return; }
          const pts = decodePolyline(r.polyline);
          // 休憩は自動では入れない。運転が長い区間だけ、あとから選べるようにルート沿いのSA・PA・道の駅を候補として持っておく
          const cands = stopsAlongRoute(pts, cumulative(pts), r.durationSec, o.cursor).filter((c) => !NOT_REST.test(c.stop.name));
          const sinceRestAtStart = o.sinceRest;
          const sinceRestAtEnd = sinceRestAtStart + r.durationSec;
          o.legs.push({
            from: points[k], to: points[k + 1], dep: o.cursor, arrive: addSec(o.cursor, r.durationSec),
            cands, recommended: planRests(cands, r.durationSec, interval.minutes, sinceRestAtStart),
            sinceRestAtStart, sinceRestAtEnd, needsRest: sinceRestAtEnd > (interval.minutes + REST_SLACK_MIN) * 60,
            durationSec: r.durationSec, staticDurationSec: r.staticDurationSec,
            points: pts,  // 地図に描く経路(段階2)。立ち寄り先を通る実際の経路を区間ごとに持つ
          });
          const arrive = o.legs[o.legs.length - 1].arrive;
          o.sinceRest = sinceRestAtEnd;
          if (k < waypoints.length) {
            const stay = waypoints[k].stayMin;
            if (stay >= REST_RESET_MIN) o.sinceRest = 0;
            o.cursor = addSec(arrive, stay * 60);
          }
        });
      }
      $("mock").style.display = mock ? "block" : "none";
      for (const o of options) {
        if (o.error || o.legs.length !== legCount) { o.error = o.error || "no_route"; continue; }
        o.finalArrive = o.legs[legCount - 1].arrive;
        o.totals = {
          driveSec: o.legs.reduce((s, l) => s + l.durationSec, 0),
          staticSec: o.legs.reduce((s, l) => s + l.staticDurationSec, 0),
        };
      }
      const valid = options.map((o, i) => [o, i]).filter(([o]) => !o.error);
      if (!valid.length) throw new Error("ルートが見つかりませんでした。");
      // おすすめ = 運転時間(合計)が一番短い出発時刻。立ち寄り先の滞在時間は同じなので比べない
      const bestIndex = valid.reduce((b, cur) => (cur[0].totals.driveSec < b[0].totals.driveSec ? cur : b))[1];

      // selected[区間番号] = 選んだ休憩場所(施設名の上下線を除いた名前)。出発時刻を切り替えても引き継ぐ
      // 予約条件は計算時点で固定(Codex 指摘 3)。空室データは 1 泊固定なので泊数も記録する
      const checkoutVal = $("checkout")?.value || ""; const nights = checkoutVal ? Math.round((Date.parse(checkoutVal) - Date.parse($("date").value)) / 86400000) : 1;
      const booking = { checkin: $("date").value, adultsRaw: $("adults") ? $("adults").value : "", nights };
      lastState = { options, bestIndex, interval, place, origin, waypoints, reduced, selected: [], current: bestIndex, booking, stale: false };
      const n0 = $("plan-stale"); if (n0) { n0.textContent = ""; n0.classList.add("hidden"); }
      if (window.RouteMap && window.RouteMap.setStale) window.RouteMap.setStale(false);
      renderCompare(lastState);
      showOption(lastState, bestIndex);
      renderDestination(place, profile);
      renderDestBooking(lastState);
      renderNearby(place);
      lastState.profile = profile;
      renderDriveFrom(place);
      setupReturnCard(lastState);
      $("itinerary-card").classList.add("hidden");
      renderPlanDiff(lastState);
      refreshChecklist();
      // 段階0(日付・人数・犬の条件の確認。trip-check.js)へ結果を渡す。任意の欄が空なら何も表示しない
      document.dispatchEvent(new CustomEvent("planner:rendered", { detail: { place, origin, date: $("date").value, places: PLACES } }));
      $("results").classList.remove("hidden");
      $("results").scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (e) {
      planBaseline = null;
      if (seq === planSeq) { showError(e.message || "エラーが発生しました。"); const n1 = $("plan-stale"); if (n1 && lastState) { n1.textContent = "最新の条件では計算できませんでした。表示中は前回の結果です(行程表の作成はできません)。"; n1.classList.remove("hidden"); } }
    } finally {
      if (seq === planSeq) { $("go").disabled = false; $("go").textContent = "予想時間を出す"; }
    }
  }

  const today = new Date();
  const tomorrow = new Date(today.getTime() + 86400000);
  $("date").min = jstYmd(today);
  $("date").value = jstYmd(tomorrow);
  $("dest-q").addEventListener("change", updateDestinationLink);
  $("form").addEventListener("submit", onSubmit);
  // ルート沿いの候補がまだなら、行を足すときに探す(候補はルートから30km以内に固定)
  $("add-wp").addEventListener("click", () => {
    addWaypointRow();
    if (waypointRoute?.key !== waypointRouteKey() && !$("find-wp-route").disabled) findWaypointRoute();
  });
  $("find-wp-route").addEventListener("click", findWaypointRoute);
  $("make-itinerary")?.addEventListener("click", () => { if (!lastState || lastState.stale) return; renderItinerary(lastState); $("itinerary-card").scrollIntoView({ behavior: "smooth", block: "start" }); $("itinerary-title")?.focus?.(); });
  document.addEventListener("routemap:picks", refreshChecklist);
  for (const id of ["origin", "dest-q", "date", "start"]) $(id).addEventListener("change", invalidateWaypointRoute);
  for (const id of ["origin", "dest-q", "date", "start", "step", "count", "adults", "checkout"]) $(id)?.addEventListener("change", () => { if (lastState && !lastState.stale) invalidatePlan("条件を変えました。もう一度「予想時間を出す」を押してください(表示中は前回の結果)。"); });
  renumberWaypoints();
  loadData().catch(() => showError("行き先データを読み込めませんでした。"));
})();
