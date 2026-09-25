// 段階0: 日付・人数・犬の条件で確認する(任意の入力。Codex と合意 cx-20260925-1)
// - 任意の欄が空なら何も表示しない(これまでの出力と同じ)
// - 空室は取得しない。「空室未確認」と表示し、公式サイトで確かめる導線だけを出す
// - 犬の条件は data/dog_rules.json(公式の一律の上限)だけで判定。無ければ「要確認」。dog_hints は使わない
// - 天気は取得しない。気象庁の予報ページへの導線と、カードに屋内の記載がある近くの候補だけ
// - イベントは data/events.json(公式で確認した開催回)。時刻未確認の回は日付の紹介だけ
(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const base = (window.PLANNER_CONFIG && window.PLANNER_CONFIG.dataBase) || "./data/";
  const load = (f) => fetch(base + f, { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const RULES = load("dog_rules.json");
  const EVENTS = load("events.json");

  // 気象庁の府県予報区(offices)。北海道は地域で分かれるため予報の地図ページへ
  const JMA_OFFICE = {
    "青森県": "020000", "岩手県": "030000", "宮城県": "040000", "秋田県": "050000", "山形県": "060000", "福島県": "070000",
    "茨城県": "080000", "栃木県": "090000", "群馬県": "100000", "埼玉県": "110000", "千葉県": "120000", "東京都": "130000",
    "神奈川県": "140000", "新潟県": "150000", "山梨県": "190000", "長野県": "200000", "静岡県": "220000",
  };
  const jmaUrl = (area) => {
    const pref = Object.keys(JMA_OFFICE).find((p) => (area || "").startsWith(p) || (area || "").startsWith(p.replace(/[都県]$/, "")));
    return pref
      ? { office: JMA_OFFICE[pref], url: `https://www.jma.go.jp/bosai/forecast/#area_type=offices&area_code=${JMA_OFFICE[pref]}`, label: `気象庁 ${pref}の天気予報` }
      : { office: null, url: "https://www.jma.go.jp/bosai/forecast/", label: "気象庁の天気予報(地図から地域を選ぶ)" };
  };

  // 段階1の天気(オーナー承認前は無効)。config.js の weatherEnabled が true のときだけ、
  // Worker の /jma-forecast から気象庁の府県予報を読み、その日の予報を表示する。送るのは府県の予報区コードだけ
  const CFG = window.PLANNER_CONFIG || {};
  const WEATHER_ON = CFG.weatherEnabled === true;
  const CODE_GROUP = { 1: "晴れ", 2: "くもり", 3: "雨", 4: "雪" };
  function forecastFor(data, date) {
    // data = 気象庁 bosai の予報 JSON([短期予報, 週間予報])。代表の地域(先頭)の予報を返す
    const day = (t) => String(t).slice(0, 10);
    const [short, week] = data;
    const out = { office: short.publishingOffice, reported: short.reportDatetime, area: short.timeSeries[0].areas[0].area.name };
    const i0 = short.timeSeries[0].timeDefines.findIndex((t) => day(t) === date);
    if (i0 >= 0) out.text = short.timeSeries[0].areas[0].weathers[i0].replace(/　|　/g, " ");
    if (week) {
      const iw = week.timeSeries[0].timeDefines.findIndex((t) => day(t) === date);
      if (iw >= 0) {
        const a = week.timeSeries[0].areas[0];
        if (a.pops && a.pops[iw]) out.pop = a.pops[iw];
        if (!out.text && a.weatherCodes && a.weatherCodes[iw]) out.text = `${CODE_GROUP[a.weatherCodes[iw][0]] || "不明"}系(週間予報)`;
        const tt = week.timeSeries[1] && week.timeSeries[1].areas[0];
        if (tt) { out.tmax = tt.tempsMax && tt.tempsMax[iw]; out.tmin = tt.tempsMin && tt.tempsMin[iw]; out.tarea = tt.area.name; }
      }
    }
    if (!out.pop) {
      // 今日・明日は6時間ごとの降水確率のうち、その日の最大
      const ts = short.timeSeries[1];
      const pops = ts ? ts.timeDefines.map((t, k) => (day(t) === date ? Number(ts.areas[0].pops[k]) : NaN)).filter(Number.isFinite) : [];
      if (pops.length) out.pop = String(Math.max(...pops));
    }
    return out.text || out.pop ? out : null;
  }
  async function fillWeather(el, office, date) {
    if (!el || !office) return;
    try {
      // apiBase が空なら同じサーバー(手元の開発サーバー)
      const res = await fetch(`${CFG.apiBase || ""}/jma-forecast?office=${encodeURIComponent(office)}`);
      if (!res.ok) throw new Error(String(res.status));
      const f = forecastFor(await res.json(), date);
      el.innerHTML = f
        ? `<p><span class="badge">予報</span> ${esc(date)}(${esc(f.area)}): ${esc(f.text || "")}${f.pop ? ` / 降水確率 ${esc(f.pop)}%` : ""}${f.tmax ? ` / 最高 ${esc(f.tmax)}℃` : ""}${f.tmin ? ` 最低 ${esc(f.tmin)}℃` : ""}${f.tarea ? `(気温は${esc(f.tarea)})` : ""}</p>
           <p class="note">出典: 気象庁の天気予報を加工して作成(${esc(f.office)} ${esc(String(f.reported).slice(0, 16).replace("T", " "))} 発表)。府県の代表地域の予報で、行き先そのものの予報ではありません。</p>`
        : `<p><span class="badge">予報の範囲外</span> ${esc(date)} は気象庁の週間予報(7日先まで)の範囲外です。近くなったら予報を確認してください。</p>`;
    } catch {
      el.innerHTML = `<p class="note">予報を読み込めませんでした。気象庁のページで確認してください。</p>`;
    }
  }
  const RAIN_OK = /(室内|屋内)(ドッグ)?ラン(あり|を)|屋内同伴案内あり|室内カフェ|店内で休める/;
  const RAIN_NG = /向かない|代替先にはせず|代替施設としては利用しない|未確認/;
  const km = (a, b) => {
    const R = 6371, rad = Math.PI / 180;
    const dLat = (b[0] - a[0]) * rad, dLon = (b[1] - a[1]) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  };

  function inputs() {
    const v = (id) => ($(id) ? $(id).value.trim() : "");
    return { checkin: v("date"), checkout: v("checkout"), adults: v("adults"), dogs: v("dogs"), kg: v("dog-kg"), size: v("size") };
  }
  const used = (x) => Boolean(x.checkout || x.adults || x.dogs || x.kg);

  function validateDates() {
    const co = $("checkout");
    if (!co) return;
    co.min = $("date").value || "";
    co.setCustomValidity(co.value && $("date").value && co.value <= $("date").value
      ? "チェックアウト日は出発日(チェックイン日)より後の日付にしてください。" : "");
  }

  function dogVerdict(rule, x) {
    if (!rule) return { cls: "check", label: "要確認", why: "この宿は、公式の一律の上限(頭数・体重)をまだ登録していません。宿の条件で確認してください。" };
    const reasons = [];
    const dogs = Number(x.dogs), kg = Number(x.kg);
    if (x.dogs && rule.max_dogs && dogs > rule.max_dogs) reasons.push(`頭数(${dogs}頭)が1室の上限${rule.max_dogs}頭を超えます`);
    if (x.kg && rule.max_kg && (rule.kg_inclusive ? kg > rule.max_kg : kg >= rule.max_kg)) {
      reasons.push(`体重(${kg}kg)が上限(${rule.max_kg}kg${rule.kg_inclusive ? "以下" : "未満"})を超えます`);
    }
    if (x.size && rule.sizes && !rule.sizes.includes(x.size)) {
      const J = { small: "小型犬", medium: "中型犬", large: "大型犬" };
      reasons.push(`体格(${J[x.size]})が対象(${rule.sizes.map((s) => J[s]).join("・")})に入りません`);
    }
    if (reasons.length) {
      return rule.soft
        ? { cls: "check", label: "要確認", why: `${reasons.join("。")}。ただし公式は「原則」「目安」の書き方のため、宿に相談してください。` }
        : { cls: "no", label: "条件外の可能性", why: `${reasons.join("。")}。` };
    }
    const missing = [!x.dogs && rule.max_dogs && "頭数", !x.kg && rule.max_kg && "体重"].filter(Boolean);
    if (missing.length) return { cls: "check", label: "要確認", why: `${missing.join("・")}を入れると、公式の上限と照らし合わせます。` };
    return { cls: "ok", label: "公式の上限内", why: "入力した頭数・体重・体格は、公式に書かれた一律の上限の範囲内です。客室ごと・犬種ごとの条件、証明書などは予約前に確認してください。" };
  }

  function stayBlock(place, x, rule) {
    const nights = x.checkout && x.checkin ? Math.round((new Date(x.checkout) - new Date(x.checkin)) / 86400000) : 0;
    const who = [x.adults && `大人${x.adults}名`, x.dogs && `犬${x.dogs}頭`].filter(Boolean).join("・");
    const official = [...new Map((place.links || []).filter((l) => !l.affiliate && /^https?:/.test(l.url || "")).map((l) => [l.url, l])).values()].slice(0, 2);
    const v = dogVerdict(rule, x);
    return `
      <h3>宿の空室と犬の条件</h3>
      <p><span class="badge">空室未確認</span> 空室はこのページでは調べていません。${x.checkout ? `${esc(x.checkin)} から ${nights}泊` : `${esc(x.checkin)} チェックイン`}${who ? `(${esc(who)})` : ""}で、宿の公式サイトや予約サイトで確かめてください。</p>
      <div class="actions">${official.map((l, i) => `<a href="${esc(l.url)}" target="_blank" rel="noopener">${i ? "宿の公式ページ(2) ↗" : "宿の公式ページ ↗"}</a>`).join("")}
        <a href="${esc(place.page_url)}" target="_blank" rel="noopener">わんことのじかんで条件を見る</a></div>
      <p><span class="badge dog-${v.cls}">${esc(v.label)}</span> ${esc(v.why)}</p>
      ${rule ? `<p class="note">公式の条件(カードより): ${esc(rule.text)} <a href="${esc(rule.source_url)}" target="_blank" rel="noopener">根拠 ↗</a>${rule.checked_at ? ` 確認日 ${esc(rule.checked_at)}` : ""}</p>` : ""}`;
  }

  function weatherBlock(place, places) {
    const j = jmaUrl(place.area);
    const here = place.geocode && [Number(place.geocode.lat), Number(place.geocode.lon)];
    const alt = here ? (places || [])
      .filter((p) => p.type === "spot" && p.id !== place.id && p.geocode && p.page_url)
      .map((p) => {
        const rain = Object.entries(p.facts || {}).find(([k]) => k.includes("雨"));
        return rain && RAIN_OK.test(rain[1]) && !RAIN_NG.test(rain[1]) ? { p, text: rain[1], d: km(here, [p.geocode.lat, p.geocode.lon]) } : null;
      })
      .filter((a) => a && a.d <= 40)
      .sort((a, b) => a.d - b.d).slice(0, 4) : [];
    return `
      <h3>天気</h3>
      ${WEATHER_ON && j.office ? `<div id="tc-weather"><p class="note">予報を読み込んでいます…</p></div>` : `<p><span class="badge">未取得</span> 天気予報はこのページでは取得していません。出発前に予報を確認してください。</p>`}
      <div class="actions"><a href="${esc(j.url)}" target="_blank" rel="noopener">${esc(j.label)} ↗</a></div>
      ${alt.length ? `<p class="note">雨のときの候補(カードの「雨の日」に屋内の記載がある、行き先から直線40km以内の掲載先。条件を必ず確認):</p>
        <ul>${alt.map(({ p, text, d }) => `<li><a href="${esc(p.page_url)}">${esc(p.name)}</a>(直線 約${Math.round(d)}km)— ${esc(text)}</li>`).join("")}</ul>`
        : `<p class="note">行き先の近くに、カードで屋内の記載がある掲載先は見つかりませんでした。雨の日は予定の見直しも検討してください。</p>`}`;
  }

  const EVENT_NEAR_KM = 80;  // 出発地か行き先から直線でこの距離以内のイベントだけ出す

  function eventsBlock(events, x, place, origin) {
    const today = new Date().toISOString().slice(0, 10);
    const from = x.checkin, to = x.checkout || x.checkin;
    const list = (events || []).filter((e) => e.status === "scheduled" && e.recheck_by >= today
      && e.date <= to && (e.end_date || e.date) >= from);
    const here = place.geocode && [Number(place.geocode.lat), Number(place.geocode.lon)];
    const from0 = origin && Number.isFinite(origin.lat) ? [origin.lat, origin.lon] : null;
    const near = list.filter((e) => [here, from0].some((pt) => pt && km(pt, [e.lat, e.lon]) <= EVENT_NEAR_KM));
    const far = list.length - near.length;
    const farNote = far ? `<p class="note">この日程の登録イベントはほかに${far}件ありますが、出発地・行き先から遠いため省いています。</p>` : "";
    if (!near.length) return `<h3>この日程の犬イベント</h3><p class="note">出発地・行き先の近く(直線${EVENT_NEAR_KM}km以内)に、登録している犬イベント(公式で確認した関東の開催回)はありません。</p>${farNote}`;
    return `<h3>この日程の犬イベント</h3><ul class="events">${near.map((e) => {
      const d = here ? Math.round(km(here, [e.lat, e.lon])) : null;
      const when = e.time_confirmed ? `${esc(e.date)} ${esc(e.start)}〜${esc(e.end)}` : `${esc(e.date)}${e.end_date ? "〜" + esc(e.end_date) : ""}(時刻は未公表。日付の紹介のみ)`;
      return `<li><b>${esc(e.name)}</b><br>${when} / ${esc(e.venue)}${d !== null ? `(行き先から直線 約${d}km)` : ""}<br>
        <small>犬: ${esc(e.dogs)} / 料金: ${esc(e.ticket)} / 雨: ${esc(e.rain)} / 公式確認日 ${esc(e.checked_at)}</small><br>
        <a href="${esc(e.official_url)}" target="_blank" rel="noopener">公式の開催案内 ↗</a></li>`;
    }).join("")}</ul>${farNote}<p class="note">イベントの存在と参加できるかは別です。チケット・犬の条件・中止の案内は公式で確認してください。</p>`;
  }

  async function render(detail) {
    const card = $("trip-check");
    if (!card) return;
    const x = inputs();
    if (!used(x)) { card.classList.add("hidden"); card.innerHTML = ""; return; }
    const [rules, events] = await Promise.all([RULES, EVENTS]);
    const place = detail.place;
    const rule = rules && rules.rules ? rules.rules[place.id] : null;
    card.innerHTML = `<h2>日付・人数・犬の条件の確認</h2>
      ${place.type === "lodging" ? stayBlock(place, x, rule) : ""}
      ${weatherBlock(place, detail.places)}
      ${eventsBlock(events && events.events, x, place, detail.origin)}`;
    card.classList.remove("hidden");
    if (WEATHER_ON) fillWeather($("tc-weather"), jmaUrl(place.area).office, x.checkin);
  }

  function clear() {
    const card = $("trip-check");
    if (card) { card.classList.add("hidden"); card.innerHTML = ""; }
  }

  document.addEventListener("planner:rendered", (ev) => render(ev.detail));
  const init = () => {
    for (const id of ["date", "checkout"]) $(id)?.addEventListener("input", validateDates);
    // 条件を変えたら古い確認結果は消す(次に「出発時刻を比べる」を押したときに作り直す)
    for (const id of ["date", "checkout", "adults", "dogs", "dog-kg", "size", "dest-q"]) $(id)?.addEventListener("change", clear);
    validateDates();
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
