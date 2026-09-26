(() => {
  const CFG = window.PLANNER_CONFIG;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const TYPE_LABEL = { lodging: "宿", spot: "おでかけ", trip_plan: "旅行プラン" };
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
  // 1回の計算でGoogleに問い合わせる上限(出発時刻の数 × 区間の数)。立ち寄り先が多いときは比べる出発時刻を減らす
  const MAX_ROUTE_CALLS = 16;
  const STAY_CHOICES = [15, 30, 45, 60, 90, 120, 180, 240];
  const REST_RESET_MIN = 15; // 立ち寄り先でこれ以上過ごせば、犬の休憩をとったことにする

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
    const [p, s] = await Promise.all([
      fetch(`${CFG.dataBase}places.json`).then((r) => r.json()),
      fetch(`${CFG.dataBase}rest_stops.json`).then((r) => r.json()),
    ]);
    STOPS = s.stops;

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
          });
        }
      } catch (error) {
        pageErrors.push(spec.file);
      }
    }

    const articleIds = new Set(published.map((place) => place.id));
    // 既存の市町村単位の旅行プランも残す。県単位の代表点はルートが不正確なため含めない。
    for (const place of p.places) {
      if (place.type !== "trip_plan" || articleIds.has(place.id)) continue;
      if (!place.page_url) continue;
      published.push(place);
    }
    DESTINATIONS = published;
    byId.clear();
    for (const place of DESTINATIONS) byId.set(place.id, place);
    PLACES = DESTINATIONS.filter((place) =>
      place.type !== "trip_plan" && hasRouteCoordinates(place));

    const select = $("dest-q");
    const groups = [
      ["lodging", "宿泊先｜犬と泊まる場所"],
      ["spot", "おでかけ先｜日帰り・立ち寄り"],
      ["trip_plan", "旅のプラン｜モデルコース"],
    ];
    for (const [type, label] of groups) {
      const options = DESTINATIONS.filter((place) => place.type === type).sort(compareDestinations);
      if (!options.length) continue;
      const group = document.createElement("optgroup");
      group.label = `${label}（${options.length}件）`;
      for (const place of options) {
        const option = document.createElement("option");
        option.value = place.id;
        option.textContent = `${place.name}（${place.area || "地域未登録"}）`;
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
    const DEST_ALIASES = { "add60-ishinoie": "izu-ishinoie" };
    const rawDest = new URLSearchParams(location.search).get("dest");
    const destId = DEST_ALIASES[rawDest] || rawDest;
    if (destId && byId.has(destId)) select.value = destId;
    updateDestinationLink();
    refreshWaypointChoices();
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

  // ルートの何番目の点に一番近いか(SA・PA・道の駅をルートの順=出発地に近い順に並べるため)
  function routeOrder(point, points) {
    let best = Infinity, index = 0;
    for (let i = 0; i < points.length; i++) {
      const d = (points[i][0] - point[0]) ** 2 + (points[i][1] - point[1]) ** 2;
      if (d < best) { best = d; index = i; }
    }
    return index;
  }
  // 休憩に使えない地点(チェーン着脱場など)は立ち寄り候補に出さない
  const NOT_REST = /チェーン着脱|着脱場/;

  const baseName = (name) => name.replace(/\s*[（(]\s*[上下]り?\s*[)）]\s*/g, "").trim();

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
        const score = dogRun ? 3 : stop.pet_facility ? 2 : stop.kind === "SA" ? 1 : stop.kind === "道の駅" ? 0.8 : 0.5;
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
        const md = (date.getMonth() + 1) * 100 + date.getDate();
        const from = +m[1] * 100 + +m[2], to = +m[3] * 100 + +m[4];
        const inRange = from <= to ? md >= from && md <= to : md >= from || md <= to;
        if (inRange) return `ドッグラン閉鎖期間(${m[1]}/${m[2]}〜${m[3]}/${m[4]})`;
      }
      if (/冬季/.test(n) && /閉鎖/.test(n)) {
        const mo = date.getMonth() + 1;
        if (mo === 12 || mo <= 4) return "冬季はドッグラン閉鎖の可能性";
      }
    }
    return null;
  }

  // sinceRestSec: この区間の出発時点で、前の休憩から何秒運転しているか(立ち寄り先をまたいで引き継ぐ)
  function planRests(cands, driveSec, intervalMin, sinceRestSec = 0) {
    const I = intervalMin * 60, W = WINDOW_MIN * 60;
    const pickBest = (arr) => arr.slice().sort((a, b) => b.score - a.score || b.tSec - a.tSec)[0];
    const plan = [];
    let last = -sinceRestSec;
    while (driveSec - last > I) {
      let pick = pickBest(cands.filter((c) => c.tSec > last + I - W && c.tSec <= last + I));
      let late = false;
      if (!pick) {
        const early = cands.filter((c) => c.tSec > last + MIN_GAP_MIN * 60 && c.tSec <= last + I - W);
        pick = early[early.length - 1];
      }
      if (!pick) {
        pick = cands.find((c) => c.tSec > last + I);
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
    const mo = date.getMonth() + 1;
    if (profile.heat && mo >= 6 && mo <= 9) { minutes = Math.min(minutes, 90); reasons.push("暑さに弱い(夏季)"); }
    return { minutes, reasons };
  }

  // ---------------------------------------------------------------- 表示

  const fmtDur = (sec) => {
    const m = Math.round(sec / 60);
    return m >= 60 ? `${Math.floor(m / 60)}時間${String(m % 60).padStart(2, "0")}分` : `${m}分`;
  };
  const fmtClock = (d) => `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
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
      ? `出発時刻ごとの最終到着(立ち寄り${state.waypoints.length}か所・滞在込み)`
      : "出発時刻ごとの所要時間(目安)";
    $("compare-head").innerHTML = multi
      ? "<th>出発</th><th>運転時間(合計)</th><th>最終到着</th><th>渋滞の影響</th>"
      : "<th>出発</th><th>運転時間</th><th>休憩込みの到着</th><th>渋滞の影響</th>";
    const rows = state.options.map((o, i) => {
      if (o.error) {
        return `<tr><td class="num">${fmtClock(o.dep)}</td><td colspan="3" class="note">計算できませんでした</td></tr>`;
      }
      const t = o.totals;
      return `<tr data-i="${i}" class="${i === state.bestIndex ? "best" : ""}" style="cursor:pointer">
        <td class="num">${fmtClock(o.dep)}${i === state.bestIndex ? " おすすめ" : ""}</td>
        <td class="num">${fmtDur(t.driveSec)}</td>
        <td class="num">${fmtClock(o.finalArrive)}(休憩${t.restCount}回)</td>
        <td class="num">${delayText(t.driveSec - t.staticSec)}</td></tr>`;
    }).join("");
    $("compare").innerHTML = rows;
    $("compare").querySelectorAll("tr[data-i]").forEach((tr) =>
      tr.addEventListener("click", () => renderPlan(state, Number(tr.dataset.i))));
    const notes = [
      "渋滞の影響 = 過去の傾向を含む予測時間と、渋滞がない場合との差。",
      `休憩は1回${CFG.restMinutes}分で計算。`,
      multi ? "立ち寄り先を出る時刻の混み具合で、次の区間を計算し直しています。" : "",
      state.reduced ? `立ち寄り先が多いため、比べる出発時刻を${state.options.length}つに減らしました。` : "",
      `行をタップするとその出発時刻の${multi ? "移動" : "休憩"}プランを表示します。`,
    ];
    $("compare-note").textContent = notes.filter(Boolean).join("");
  }

  function restItem(r, at, multi) {
    const badges = [
      r.stop.kind === "道の駅" ? '<span class="badge">道の駅</span>' : "",
      r.dogRun ? '<span class="badge b-run">ドッグラン</span>' : "",
      r.stop.pet_facility ? '<span class="badge b-pet">ペット施設</span>' : "",
      r.closure ? `<span class="badge b-closed">${esc(r.closure)}</span>` : "",
      r.late ? '<span class="badge b-warn">目安より遅め</span>' : "",
    ].join("");
    const fac = (r.stop.facilities || [])[0];
    const notes = (r.stop.facilities || []).map((f) => f.note).filter(Boolean).join(" / ");
    return `<li><span class="time">${fmtClock(at)}</span><span>
      ${multi ? `<span class="badge">休憩${CFG.restMinutes}分</span> ` : ""}<b>${esc(r.stop.name)}</b> ${badges}<br>
      <span class="note">${multi ? "この区間の" : "出発から"}運転${fmtDur(r.tSec)}${multi ? "の地点" : ""}${fac ? ` / ${esc(fac.road)}` : ""}${notes ? ` / ${esc(notes)}` : ""}</span>
      ${fac ? `<br><a href="${esc(fac.url)}" target="_blank" rel="noopener">${esc(fac.operator)}の施設情報</a>` : ""}
    </span></li>`;
  }

  function renderPlan(state, i) {
    const o = state.options[i];
    if (!o || o.error) return;
    const { interval } = state;
    const multi = state.waypoints.length > 0;
    $("plan-title").textContent =
      `${multi ? "移動プラン" : "休憩プラン"}(${fmtClock(o.dep)}出発・${multi ? "休憩は" : ""}${interval.minutes >= 60 ? interval.minutes / 60 + "時間" : interval.minutes + "分"}ごとが目安${interval.reasons.length ? ":" + interval.reasons.join("・") : ""})`;

    const warns = [];
    if (o.legs.some((l) => l.rests.some((r) => r.late))) warns.push("ルート上に適当な休憩場所が少なく、目安の間隔を超える区間があります。一般道の道の駅なども検討してください。");
    for (const l of o.legs) {
      if (!l.rests.length && l.sinceRestAtEnd > interval.minutes * 60 + 10 * 60) {
        warns.push(multi
          ? `${l.from.name} → ${l.to.name} の区間で、休憩できるSA・PAが見つからず目安の間隔を超えます。途中の道の駅などでの休憩を計画してください。`
          : "ルート上に休憩できるSA・PAが見つかりませんでした(一般道中心のルートの可能性)。途中の道の駅やコンビニ駐車場での休憩を計画してください。");
      }
    }
    for (const l of o.legs.filter(isApproxLeg)) {
      warns.push(`${l.from.name} → ${l.to.name} は、位置が地区や市区町村の中心までしか分からないため、この区間の移動時間は正しく計算できていません。実際の位置と移動時間を地図で確認してください。`);
    }
    const h = o.finalArrive.getHours();
    if (state.place.type === "lodging" && (h >= 20 || h < 5)) warns.push(`宿への到着が${fmtClock(o.finalArrive)}になります。チェックインの受付時間を宿に確認してください。`);
    $("plan-warn").innerHTML = warns.map((w) => `<div class="warnbox">${esc(w)}</div>`).join("");

    const items = [`<li class="${multi ? "stop" : ""}"><span class="time">${fmtClock(o.dep)}</span><span>${multi ? `<span class="badge b-go">出発</span> <b>${esc(state.origin.name)}</b>` : "出発"}</span></li>`];
    o.legs.forEach((l, k) => {
      if (multi) {
        items.push(`<li class="leg"><span class="time"></span><span class="note">区間${k + 1}: ${isApproxLeg(l)
          ? "近くへの移動(位置が大まかなため時間は計算できていません)"
          : `運転${fmtDur(l.durationSec)}(渋滞の影響 ${delayText(l.durationSec - l.staticDurationSec)})`}</span></li>`);
      }
      let restAcc = 0;
      for (const r of l.rests) {
        items.push(restItem(r, addSec(l.dep, r.tSec + restAcc), multi));
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
    const last = o.legs[o.legs.length - 1];
    items.push(`<li class="${multi ? "stop" : ""}"><span class="time">${fmtClock(last.arrive)}</span><span>${multi ? '<span class="badge b-go">到着</span>' : "到着"} <b>${esc(state.place.name)}</b></span></li>`);
    $("plan").innerHTML = items.join("");

    // Googleマップ: 立ち寄り先は必ず入れ、休憩地点は入りきる分だけ(経由地は9か所まで)
    const via = [];
    const restSlots = 9 - state.waypoints.length;
    let restUsed = 0;
    o.legs.forEach((l, k) => {
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
    $("plan-actions").innerHTML = `<a href="${esc(nav.toString())}" target="_blank" rel="noopener">${multi ? "立ち寄り先・休憩地点つき" : "休憩地点つき"}でGoogleマップを開く</a>`;
  }

  function renderDestination(place, profile) {
    const facts = Object.entries(place.facts || {}).slice(0, 3)
      .map(([k, v]) => `<p style="margin:4px 0"><b>${esc(k)}:</b> ${esc(v)}</p>`).join("");
    const warns = [];
    const h = place.dog_hints || {};
    if (profile.size !== "small" && (h.small_dog_only_mention || (h.weight_limit_kg_mentions || []).some((kg) => kg <= 10))) {
      warns.push("掲載情報に小型犬向け・体重制限の記載があります。うちの子が対象か、条件を確認してください。");
    }
    const official = (place.links || []).filter((l) => !l.affiliate).slice(0, 2);
    const aff = (place.links || []).filter((l) => l.affiliate).slice(0, 1);
    $("dest-card").innerHTML = `
      <h2>${esc(place.name)} <span class="badge">${esc(TYPE_LABEL[place.type])}</span></h2>
      <p class="note">${esc(place.area)}${place.theme ? " / " + esc(place.theme) : ""}${place.co_sleep ? " / " + esc(place.co_sleep) : ""}</p>
      ${warns.map((w) => `<div class="warnbox">${esc(w)}</div>`).join("")}
      ${facts}
      <div class="actions">
        <a href="${esc(place.page_url)}" target="_blank" rel="noopener">わんことのじかんで条件を見る</a>
        ${official.map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label || "公式サイト")}</a>`).join("")}
        ${aff.map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noopener sponsored">${esc(l.label || "予約サイトで空室を見る")}<span class="ad">広告</span></a>`).join("")}
      </div>
      ${place.checked_at ? `<p class="note">掲載情報の確認日: ${esc(place.checked_at)}</p>` : ""}`;
  }

  function renderNearby(place) {
    const here = [place.geocode.lat, place.geocode.lon];
    const list = PLACES.filter((p) => p.id !== place.id && p.page_url)
      .map((p) => ({ p, d: km(here, [p.geocode.lat, p.geocode.lon]) }))
      .filter((x) => x.d <= CFG.nearbyKm)
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
    for (const type of ["lodging", "spot"]) {
      const group = document.createElement("optgroup");
      group.label = `${TYPE_LABEL[type]}（50音順）`;
      for (const { p, d, href } of list.filter((x) => x.p.type === type)) {
        group.appendChild(new Option(`${p.name}（直線 約${Math.round(d)}km・地域の目安）`, href));
      }
      if (group.children.length) select.appendChild(group);
    }
    $("nearby-select-hint").textContent = `行き先から直線${CFG.nearbyKm}km以内を区分ごとの50音順で表示（読み未登録の英字名は末尾）。地域の代表点を含む目安です。選ぶと施設情報を開きます。`;
    select.onchange = () => {
      if (select.value) window.location.assign(select.value);
    };
    $("nearby-card").classList.toggle("hidden", !list.length);
    $("nearby").innerHTML = list.slice().sort((a, b) => a.d - b.d).slice(0, 6).map(({ p, d, href }) => `
      <a href="${esc(href)}">
        <span class="badge">${esc(TYPE_LABEL[p.type])}</span> <b>${esc(p.name)}</b>
        <small>${esc(p.area)} ・ 直線 約${Math.round(d)}km（地域の目安）${p.theme ? " ・ " + esc(p.theme) : ""} ・ 施設情報を開く</small></a>`).join("");
  }

  // ---------------------------------------------------------------- 実行

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

  function waypointCandidates() {
    const scope = $("wp-scope").value, radius = Number($("wp-radius").value);
    const dest = byId.get($("dest-q").value);
    const routeReady = waypointRoute?.key === waypointRouteKey();
    const byRouteOrder = scope === "rest" && routeReady;
    return [...wpByLabel].flatMap(([label, value]) => {
      if (value.place && value.place.id === dest?.id) return [];
      if (scope === "rest" ? !value.stop : !value.place) return [];
      if (scope === "rest" && NOT_REST.test(value.name)) return [];
      let distance = null, order = null;
      if (byRouteOrder) {
        // SA・PA・道の駅も、ルートを取得済みならルートから選んだ距離以内に絞り、ルートの順に並べる
        distance = distanceToRoute([value.lat, value.lon], waypointRoute.points);
        order = routeOrder([value.lat, value.lon], waypointRoute.points);
      } else if (scope === "route") {
        if (!waypointRoute || waypointRoute.key !== waypointRouteKey()) return [];
        distance = distanceToRoute([value.lat, value.lon], waypointRoute.points);
      } else if (scope === "destination") {
        if (!hasRouteCoordinates(dest)) return [];
        distance = km([value.lat, value.lon], [Number(dest.geocode.lat), Number(dest.geocode.lon)]);
      }
      if (distance !== null && (!Number.isFinite(distance) || distance > radius)) return [];
      return [{ label, value, distance, order }];
    }).sort((a, b) => byRouteOrder ? a.order - b.order
      : compareDestinations(a.value.place || { name: a.value.name, id: a.label }, b.value.place || { name: b.value.name, id: b.label }));
  }

  function refreshWaypointChoices() {
    const candidates = waypointCandidates();
    const scope = $("wp-scope").value;
    const routeReady = waypointRoute?.key === waypointRouteKey();
    $("wp-radius").disabled = scope === "all" || (scope === "rest" && !routeReady);
    $("find-wp-route").classList.toggle("hidden", scope !== "route" && scope !== "rest");
    const destReady = hasRouteCoordinates(byId.get($("dest-q").value));
    $("wp-route-status").textContent = scope === "route" && !routeReady
      ? waypointMessage || "出発地・行き先・出発日時を選び、ルート沿いの候補を探してください。"
      : scope === "rest" && routeReady
        ? `${candidates.length}件の候補。立ち寄り前のルートから直線${$("wp-radius").value}km以内のSA・PA・道の駅を、出発地に近い順に並べています。出発地・行き先・日時を変えたら再検索してください。`
      : scope === "rest"
        ? `${waypointMessage ? waypointMessage + " " : ""}全国のSA・PA・道の駅 ${candidates.length}件(50音順)。「ルート沿いの候補を探す」を押すと、ルート沿いに絞って出発地に近い順に並べます。`
      : scope === "destination" && !destReady ? "位置情報のある行き先を選んでください。"
      : `${candidates.length}件の候補。${scope === "route" ? "立ち寄り前のルートから" : scope === "destination" ? "行き先から" : ""}${["route", "destination"].includes(scope) ? `直線${$("wp-radius").value}km以内。` : ""}区分ごとに50音順です。${scope === "route" ? "出発地・行き先・日時を変えたら再検索してください。" : ""}`;
    const rows = [...$("wps").children];
    for (const row of rows) {
      const select = row.querySelector(".wp-q"), selected = select.value;
      const elsewhere = new Set(rows.filter((r) => r !== row).map((r) => r.querySelector(".wp-q").value).filter(Boolean));
      select.replaceChildren(new Option(candidates.length ? "立ち寄り先を選択（50音順）" : "条件に合う候補がありません", ""));
      for (const type of ["lodging", "spot", "rest"]) {
        const group = document.createElement("optgroup");
        group.label = type === "rest" ? "SA・PA・道の駅" : TYPE_LABEL[type];
        for (const candidate of candidates.filter((c) => (c.value.place?.type || "rest") === type && !elsewhere.has(c.label))) {
          const { label, value, distance } = candidate;
          const info = distance === null ? value.place?.area || value.kind : `${scope === "destination" ? "行き先から" : "ルートから"} ${waypointDistance(distance)}${value.approx ? "・地域の目安" : ""}`;
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
      if (isApproxLeg({ from: origin, to: end })) throw new Error("出発地と行き先の位置が大まかで近いため、ルートを確認できません。「行き先の近く」から探してください。");
      const data = await routeLeg(origin, end, [departure]);
      if (request !== waypointRequest || key !== waypointRouteKey()) return;
      const result = data.results?.[0];
      const devHost = ["localhost", "127.0.0.1"].includes(location.hostname);  // 手元の開発サーバーでは仮データのルートでも絞り込みを試せる
      if ((data.mock && !devHost) || result?.error || !result?.polyline) throw new Error("ルートを取得できませんでした。「行き先の近く」か「掲載先すべて」から選べます。");
      const points = decodePolyline(result.polyline);
      if (points.length < 2 || points.some(([lat, lon]) => !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180)) throw new Error("ルートの位置情報を確認できませんでした。");
      waypointRoute = { key, points };
      waypointMessage = "";
    } catch (error) {
      if (request === waypointRequest) waypointMessage = error instanceof TypeError
        ? "ルートを取得できませんでした。通信環境を確認するか、「行き先の近く」「掲載先すべて」から選んでください。"
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

  async function onSubmit(ev) {
    ev.preventDefault();
    $("error").classList.add("hidden");
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
    let departures = buildDepartures();
    if (!departures.length) return showError("出発時刻がすべて過去になっています。日付か時刻を変えてください。");
    const profile = { size: $("size").value, age: $("age").value, carsick: $("carsick").checked, heat: $("heat").checked };
    const date = new Date(`${$("date").value}T12:00:00+09:00`);
    const interval = restInterval(profile, date);

    $("go").disabled = true;
    $("go").textContent = "計算中…";
    try {
      const origin = await getOrigin();
      const waypoints = await readWaypoints();
      const dest = { lat: Number(place.geocode.lat), lon: Number(place.geocode.lon), name: place.name,
        approx: place.geocode.precision !== "facility" };
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
        mock = mock || Boolean(data.mock);
        data.results.forEach((r, j) => {
          const o = active[j];
          if (r.error || !r.polyline) { o.error = r.error || "no_route"; return; }
          const pts = decodePolyline(r.polyline);
          const cands = stopsAlongRoute(pts, cumulative(pts), r.durationSec, o.cursor);
          const rests = planRests(cands, r.durationSec, interval.minutes, o.sinceRest);
          const arrive = addSec(o.cursor, r.durationSec + rests.length * CFG.restMinutes * 60);
          const sinceRestAtEnd = rests.length ? r.durationSec - rests[rests.length - 1].tSec : o.sinceRest + r.durationSec;
          o.legs.push({
            from: points[k], to: points[k + 1], dep: o.cursor, arrive, rests, sinceRestAtEnd,
            durationSec: r.durationSec, staticDurationSec: r.staticDurationSec,
          });
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
          restCount: o.legs.reduce((s, l) => s + l.rests.length, 0),
        };
        o.totals.onRoadSec = o.totals.driveSec + o.totals.restCount * CFG.restMinutes * 60;
      }
      const valid = options.map((o, i) => [o, i]).filter(([o]) => !o.error);
      if (!valid.length) throw new Error("ルートが見つかりませんでした。");
      // おすすめ = 車に乗っている時間(運転+休憩)が一番短い出発時刻。立ち寄り先の滞在時間は同じなので比べない
      const bestIndex = valid.reduce((b, cur) => (cur[0].totals.onRoadSec < b[0].totals.onRoadSec ? cur : b))[1];

      lastState = { options, bestIndex, interval, place, origin, waypoints, reduced };
      renderCompare(lastState);
      renderPlan(lastState, bestIndex);
      renderDestination(place, profile);
      renderNearby(place);
      // 段階0(日付・人数・犬の条件の確認。trip-check.js)へ結果を渡す。任意の欄が空なら何も表示しない
      document.dispatchEvent(new CustomEvent("planner:rendered", { detail: { place, origin, date: $("date").value, places: PLACES } }));
      $("results").classList.remove("hidden");
      $("results").scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (e) {
      showError(e.message || "エラーが発生しました。");
    } finally {
      $("go").disabled = false;
      $("go").textContent = "出発時刻を比べる";
    }
  }

  const today = new Date();
  const tomorrow = new Date(today.getTime() + 86400000);
  const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  $("date").min = ymd(today);
  $("date").value = ymd(tomorrow);
  $("dest-q").addEventListener("change", updateDestinationLink);
  $("form").addEventListener("submit", onSubmit);
  $("add-wp").addEventListener("click", () => addWaypointRow());
  $("wp-scope").addEventListener("change", refreshWaypointChoices);
  $("wp-radius").addEventListener("change", refreshWaypointChoices);
  $("find-wp-route").addEventListener("click", findWaypointRoute);
  for (const id of ["origin", "dest-q", "date", "start"]) $(id).addEventListener("change", invalidateWaypointRoute);
  renumberWaypoints();
  loadData().catch(() => showError("行き先データを読み込めませんでした。"));
})();
