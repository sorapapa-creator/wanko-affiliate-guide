(() => {
  const CFG = window.PLANNER_CONFIG;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const TYPE_LABEL = { lodging: "宿", spot: "おでかけ", trip_plan: "旅行プラン" };
  const DESTINATION_COLLATOR = new Intl.Collator("ja", { numeric: true, sensitivity: "base" });
  // Kanji names need explicit readings for true gojuon order; add readings when new kanji names are listed.
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
    ["海辺", "うみべ"], ["山梨", "やまなし"], ["成田", "なりた"]
  ].sort((a, b) => b[0].length - a[0].length);
  const destinationSortName = (name) => {
    const reading = DESTINATION_READINGS.find(([prefix]) => name.startsWith(prefix));
    const source = reading ? `${reading[1]}${name.slice(reading[0].length)}` : name;
    return Array.from(source, (char) => {
      const code = char.charCodeAt(0);
      return code >= 0x30a1 && code <= 0x30f6 ? String.fromCharCode(code - 0x60) : char;
    }).join("");
  };
  const compareDestinations = (a, b) => DESTINATION_COLLATOR.compare(destinationSortName(a.name), destinationSortName(b.name)) || DESTINATION_COLLATOR.compare(a.area || "", b.area || "") || a.id.localeCompare(b.id);
  const STOP_NEAR_KM = 0.35;      // ルートからこの距離以内のSA/PAを候補にする(OSMの位置は施設の中心なので少し広め)
  const SIDE_AMBIGUOUS_KM = 0.04; // これより近い施設は上下線どちら側か判定しない(上下一体の施設など)
  // 休憩の目標時刻より何分前までを候補にするか。広めにとって、少し早くてもドッグランのあるSAを優先できるようにする
  // (例: 東京→那須で、2時間目安だと上河内SAより手前の佐野SA(ドッグラン24時間)を選べるように)
  const WINDOW_MIN = 60;
  const MIN_GAP_MIN = 20;         // 前の休憩から最低これだけは空ける
  const EDGE_START_MIN = 15, EDGE_END_MIN = 10; // 出発直後・到着直前の休憩は提案しない

  let PLACES = [];
  let DESTINATIONS = [];
  let STOPS = [];
  const byId = new Map();
  let destinationSummary = "";
  let lastState = null;

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
            || "掲載ページで確認";
          const detailUrl = new URL(`../${spec.file}`, location.href);
          detailUrl.hash = id;
          published.push({
            ...existing,
            id,
            name: heading.textContent.replace(/\s+/g, " ").trim(),
            area: existing.area || address,
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

    // サイトの各カードから「?dest=<id>」付きで開かれたら、行き先を選んだ状態にする
    const destId = new URLSearchParams(location.search).get("dest");
    if (destId && byId.has(destId)) select.value = destId;
    updateDestinationLink();
  }

  function hasRouteCoordinates(place) {
    return Boolean(place?.geocode && place.geocode.precision !== "prefecture"
      && Number.isFinite(Number(place.geocode.lat)) && Number.isFinite(Number(place.geocode.lon)));
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

  function planRests(cands, driveSec, intervalMin) {
    const I = intervalMin * 60, W = WINDOW_MIN * 60;
    const pickBest = (arr) => arr.slice().sort((a, b) => b.score - a.score || b.tSec - a.tSec)[0];
    const plan = [];
    let last = 0;
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

  function renderCompare(state) {
    const rows = state.options.map((o, i) => {
      if (o.error) {
        return `<tr><td class="num">${fmtClock(o.dep)}</td><td colspan="3" class="note">計算できませんでした</td></tr>`;
      }
      const delayMin = Math.round((o.durationSec - o.staticDurationSec) / 60);
      const delay = delayMin >= 10 ? `+${delayMin}分` : "ほぼなし";
      const arrive = addSec(o.dep, o.durationSec + o.rests.length * CFG.restMinutes * 60);
      return `<tr data-i="${i}" class="${i === state.bestIndex ? "best" : ""}" style="cursor:pointer">
        <td class="num">${fmtClock(o.dep)}${i === state.bestIndex ? " おすすめ" : ""}</td>
        <td class="num">${fmtDur(o.durationSec)}</td>
        <td class="num">${fmtClock(arrive)}(休憩${o.rests.length}回)</td>
        <td class="num">${delay}</td></tr>`;
    }).join("");
    $("compare").innerHTML = rows;
    $("compare").querySelectorAll("tr[data-i]").forEach((tr) =>
      tr.addEventListener("click", () => renderPlan(state, Number(tr.dataset.i))));
    $("compare-note").textContent =
      `渋滞の影響 = 過去の傾向を含む予測時間と、渋滞がない場合との差。休憩は1回${CFG.restMinutes}分で計算。行をタップするとその出発時刻の休憩プランを表示します。`;
  }

  function renderPlan(state, i) {
    const o = state.options[i];
    if (!o || o.error) return;
    const { interval } = state;
    $("plan-title").textContent =
      `休憩プラン(${fmtClock(o.dep)}出発・${interval.minutes >= 60 ? interval.minutes / 60 + "時間" : interval.minutes + "分"}ごとが目安${interval.reasons.length ? ":" + interval.reasons.join("・") : ""})`;

    const warns = [];
    if (o.rests.some((r) => r.late)) warns.push("ルート上に適当な休憩場所が少なく、目安の間隔を超える区間があります。一般道の道の駅なども検討してください。");
    if (!o.rests.length && o.durationSec > interval.minutes * 60) warns.push("ルート上に休憩できるSA・PAが見つかりませんでした(一般道中心のルートの可能性)。途中の道の駅やコンビニ駐車場での休憩を計画してください。");
    $("plan-warn").innerHTML = warns.map((w) => `<div class="warnbox">${esc(w)}</div>`).join("");

    let elapsedRest = 0;
    const items = [`<li><span class="time">${fmtClock(o.dep)}</span><span>出発</span></li>`];
    for (const r of o.rests) {
      const at = addSec(o.dep, r.tSec + elapsedRest);
      elapsedRest += CFG.restMinutes * 60;
      const badges = [
        r.stop.kind === "道の駅" ? '<span class="badge">道の駅</span>' : "",
        r.dogRun ? '<span class="badge b-run">ドッグラン</span>' : "",
        r.stop.pet_facility ? '<span class="badge b-pet">ペット施設</span>' : "",
        r.closure ? `<span class="badge b-closed">${esc(r.closure)}</span>` : "",
        r.late ? '<span class="badge b-warn">目安より遅め</span>' : "",
      ].join("");
      const fac = (r.stop.facilities || [])[0];
      const notes = (r.stop.facilities || []).map((f) => f.note).filter(Boolean).join(" / ");
      items.push(`<li><span class="time">${fmtClock(at)}</span><span>
        <b>${esc(r.stop.name)}</b> ${badges}<br>
        <span class="note">出発から運転${fmtDur(r.tSec)}${fac ? ` / ${esc(fac.road)}` : ""}${notes ? ` / ${esc(notes)}` : ""}</span>
        ${fac ? `<br><a href="${esc(fac.url)}" target="_blank" rel="noopener">${esc(fac.operator)}の施設情報</a>` : ""}
      </span></li>`);
    }
    const arrive = addSec(o.dep, o.durationSec + elapsedRest);
    items.push(`<li><span class="time">${fmtClock(arrive)}</span><span>到着 <b>${esc(state.place.name)}</b></span></li>`);
    $("plan").innerHTML = items.join("");

    const wp = o.rests.map((r) => `${r.stop.lat},${r.stop.lon}`).join("|");
    const nav = new URL("https://www.google.com/maps/dir/");
    nav.searchParams.set("api", "1");
    // 現在地から出発する場合は origin を付けない(Googleマップが端末の現在地を使うので、位置をURLに残さない)
    if (!state.origin.isCurrentLocation) nav.searchParams.set("origin", `${state.origin.lat},${state.origin.lon}`);
    nav.searchParams.set("destination", `${state.place.name} ${state.place.area}`);
    nav.searchParams.set("travelmode", "driving");
    if (wp) nav.searchParams.set("waypoints", wp);
    $("plan-actions").innerHTML = `<a href="${esc(nav.toString())}" target="_blank" rel="noopener">休憩地点つきでGoogleマップを開く</a>`;
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
      .sort((a, b) => (a.p.type === place.type) - (b.p.type === place.type) || a.d - b.d)
      .slice(0, 6)
      .map(({ p, d }) => {
        try {
          const url = new URL(p.page_url, location.href);
          return ["http:", "https:"].includes(url.protocol) ? { p, d, href: url.href } : null;
        } catch { return null; }
      })
      .filter(Boolean);
    const select = $("nearby-select");
    select.replaceChildren(new Option("掲載先を選ぶと施設情報へ移動します", ""));
    for (const { p, d, href } of list) {
      select.add(new Option(`${p.name}（${p.area}・約${Math.round(d)}km）`, href));
    }
    select.onchange = () => {
      if (select.value) window.location.assign(select.value);
    };
    $("nearby-card").classList.toggle("hidden", !list.length);
    $("nearby").innerHTML = list.map(({ p, d, href }) => `
      <a href="${esc(href)}">
        <span class="badge">${esc(TYPE_LABEL[p.type])}</span> <b>${esc(p.name)}</b>
        <small>${esc(p.area)} ・ 約${Math.round(d)}km${p.theme ? " ・ " + esc(p.theme) : ""} ・ 施設情報を開く</small></a>`).join("");
  }

  // ---------------------------------------------------------------- 実行

  function getOrigin() {
    const v = $("origin").value;
    if (v !== "here") {
      const [lat, lon] = v.split(",").map(Number);
      return Promise.resolve({ lat, lon });
    }
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error("現在地を取得できません"));
      // 現在地は約100m単位に丸めてから送る(所要時間の計算には十分で、自宅などの正確な位置を外に出さない)
      const round3 = (v) => Math.round(v * 1000) / 1000;
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: round3(pos.coords.latitude), lon: round3(pos.coords.longitude), isCurrentLocation: true }),
        () => reject(new Error("現在地の利用が許可されませんでした。出発地を選んでください。")),
        { timeout: 10000 });
    });
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
    const departures = buildDepartures();
    if (!departures.length) return showError("出発時刻がすべて過去になっています。日付か時刻を変えてください。");
    const profile = { size: $("size").value, age: $("age").value, carsick: $("carsick").checked, heat: $("heat").checked };
    const date = new Date(`${$("date").value}T12:00:00+09:00`);
    const interval = restInterval(profile, date);

    $("go").disabled = true;
    $("go").textContent = "計算中…";
    try {
      const origin = await getOrigin();
      const res = await fetch(`${CFG.apiBase}/routes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          origin: { lat: origin.lat, lon: origin.lon },
          destination: { lat: place.geocode.lat, lon: place.geocode.lon },
          departures,
        }),
      });
      if (!res.ok) throw new Error(res.status === 400 ? "入力内容を確認してください。" : "所要時間を計算できませんでした。時間をおいて再度お試しください。");
      const data = await res.json();
      $("mock").style.display = data.mock ? "block" : "none";

      const options = data.results.map((r) => {
        const dep = new Date(r.departure);
        if (r.error || !r.polyline) return { dep, error: r.error || "no_route", rests: [] };
        const points = decodePolyline(r.polyline);
        const cum = cumulative(points);
        const cands = stopsAlongRoute(points, cum, r.durationSec, dep);
        return { ...r, dep, rests: planRests(cands, r.durationSec, interval.minutes) };
      });
      const valid = options.map((o, i) => [o, i]).filter(([o]) => !o.error);
      if (!valid.length) throw new Error("ルートが見つかりませんでした。");
      const bestIndex = valid.reduce((b, cur) =>
        cur[0].durationSec + cur[0].rests.length * CFG.restMinutes * 60 <
        b[0].durationSec + b[0].rests.length * CFG.restMinutes * 60 ? cur : b)[1];

      lastState = { options, bestIndex, interval, place, origin };
      renderCompare(lastState);
      renderPlan(lastState, bestIndex);
      renderDestination(place, profile);
      renderNearby(place);
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
  loadData().catch(() => showError("行き先データを読み込めませんでした。"));
})();
