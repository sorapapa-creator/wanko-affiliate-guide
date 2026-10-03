// 泊まれる日から宿を探す(空室逆算プラン): 夜間に楽天トラベル VacantHotelSearch で取った掲載宿の空室(data/vacancy/<日付>.json)を、
// 犬の条件と出発地からの所要時間(drive_times.json、渋滞なしの目安)で並べて見せ、日付入りの楽天予約リンクと「この宿で旅行プランを作る」へつなぐ。
// 空室・料金は取得時点のもの。楽天の利用条件に従い、取得時刻と免責、クレジットを表示する。planner.js が window.PlannerData を用意してから動く。
(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const CFG = window.PLANNER_CONFIG || {};
  const BASE = `${CFG.dataBase || "./data/"}vacancy/`;
  const yen = (n) => (n == null ? "—" : `${Number(n).toLocaleString("ja-JP")}円`);
  const fmtDur = (min) => (min >= 60 ? `${Math.floor(min / 60)}時間${String(min % 60).padStart(2, "0")}分` : `${min}分`);
  const jstMd = (ymd) => { const [y, m, d] = ymd.split("-").map(Number); const wd = "日月火水木金土"[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]; return `${m}/${d}(${wd})`; };
  let index = null;
  const cache = new Map();

  async function loadIndex() {
    if (index) return index;
    const r = await fetch(`${BASE}index.json`, { cache: "no-cache" });
    if (!r.ok) throw new Error("index");
    index = await r.json();
    return index;
  }
  // 人数は 2 名(基本)と 4 名(家族)。4 名は <日付>-a4.json
  const adultsSel = () => Number($("vc-adults")?.value) || 2;
  // 犬可否は 3 段階(施設 / 客室・プラン / 空室)で別々に扱う。判定の純粋関数は vacancy-rules.js(planner.js・tests と共用)
  const RULES = window.VacancyRules;
  if (!RULES) { console.error("vacancy-rules.js が読み込まれていません"); return; }
  const { petClass, validate, planCounts, statusLines, fmtWhen } = RULES;
  async function loadDate(ci, adults) {
    const key = `${ci}${adults === 2 ? "" : `-a${adults}`}`;
    if (cache.has(key)) { const c = cache.get(key); if (!validate(c, null)) return c; cache.delete(key); }
    const r = await fetch(`${BASE}${key}.json`, { cache: "no-cache" });
    if (!r.ok) throw new Error(adults === 2 ? "この日の空室データを読み込めませんでした。" : `${adults}名のデータはこの日はまだありません(2名で検索してください)。`);
    const d = await r.json(); cache.set(key, d); return d;
  }
  function fillDates() {
    if (!index) return;
    const adults = adultsSel(); const sel = $("vc-date"); const cur = sel.value;
    const dates = Object.keys(index.dates || {}).sort();
    const isSat = (ci) => /\(土\)/.test(jstMd(ci));
    sel.replaceChildren(...dates.map((ci) => {
      const e = index.dates[ci]; const s = adults === 2 ? e : e[`a${adults}`];
      const counts = s ? `空室 ${s.available}宿・犬対応プラン ${s.pet}宿` : `${adults}名のデータなし`;
      return new Option(`${jstMd(ci)} 〜 ${jstMd(e.checkout)}${isSat(ci) ? "" : "・祝前日"}(${counts})`, ci);
    }));
    if (cur && dates.includes(cur)) sel.value = cur;
  }

  // 犬の条件の判定(掲載情報の抽出結果 dog_hints と facts、カードの data-sleep / data-cage を使う。未記載は「要確認」で減点しない)
  function dogCheck(place, size, dogs, wantSleep) {
    const h = place.dog_hints || {}; const notes = []; let ng = false;
    const kg = Math.min(...(h.weight_limit_kg_mentions || [Infinity]));
    if (size !== "small" && (h.small_dog_only_mention || kg <= 10)) { notes.push("小型犬向け・体重制限の記載あり"); ng = true; }
    else if (size === "large" && kg <= 25) { notes.push(`体重${kg}kg までの記載あり`); ng = true; }
    if (dogs > 1 && /1頭|１頭|一頭/.test(JSON.stringify(place.facts || {})) && !/2頭|２頭|3頭|３頭|複数/.test(JSON.stringify(place.facts || {}))) { notes.push("1頭までの記載あり"); ng = true; }
    if (wantSleep) {
      const s = place.sleep || place.co_sleep || "";
      if (/不可|NG|禁止/.test(s)) { notes.push("添い寝は不可"); ng = true; }
      else if (!/可/.test(s)) notes.push("添い寝は予約前確認");
    }
    if (h.cert_required) notes.push("証明書の提示が条件");
    return { ng, notes };
  }

  function factLine(place, keyRe) {
    const k = Object.keys(place.facts || {}).find((x) => keyRe.test(x));
    return k ? place.facts[k] : "";
  }

  function render(list, meta, origin) {
    const box = $("vc-results");
    if (!list.length) { box.innerHTML = `<p class="note">この条件に合う空室のある宿が見つかりませんでした。条件(犬の大きさ・添い寝・予算)を緩めるか、別の日を選んでください。</p>`; return; }
    const card = ({ place, h, drive, check }, i) => {
      const pc = planCounts(h.plans);  // 客室・プラン段階の集計(施設の犬同伴可とは別)
      const status3 = `<ul class="vc-status3">${statusLines(pc, meta.scanned_at).map((l) => `<li${l.warn ? ' class="warn"' : ""}><b>${esc(l.label)}:</b> ${esc(l.text)}</li>`).join("")}</ul>`;
      const plans = pc.shown.map((p) => `<li class="vc-plan${petClass(p) === "pet" ? " vc-pet" : ""}">${petClass(p) === "pet" ? '<span class="badge b-run">犬対応プラン</span>' : '<span class="badge">一般客室(犬同伴の可否は未確認)</span>'} <b>${yen(p.total)}</b><span class="note">(${meta.adults || 2}名1泊・楽天表示・${esc(fmtWhen(meta.scanned_at))} 取得)</span><br>
        <span class="note">${esc(p.plan || "")}${p.room ? ` ／ ${esc(p.room)}` : ""}${p.dinner ? "・夕食付" : ""}${p.breakfast ? "・朝食付" : ""}</span><br>
        ${p.url ? `<a class="vc-book" href="${esc(p.url)}" target="_blank" rel="noopener sponsored">楽天トラベルでこのプランを見る(${esc(jstMd(meta.checkin))}・${meta.adults || 2}名)<span class="ad">広告</span></a>` : ""}</li>`).join("");
      return `<article class="card vc-card${check.ng ? " vc-ng" : ""}">
        ${place.photo ? `<img class="vc-photo" src="${esc(place.photo)}" alt="${esc(place.name)}の写真(楽天トラベル提供)" loading="lazy">` : ""}
        <h3>${i + 1}. ${esc(place.name)} <span class="badge">${esc(place.area || "")}</span>${pc.pet ? ' <span class="badge b-rec">犬対応プランに空室</span>' : ' <span class="badge">一般客室の空室のみ</span>'}</h3>
        ${status3}
        <p class="note">${drive ? `${esc(origin.name)}から車で約${fmtDur(drive[0])}(${drive[1]}km・${drive[2] === "est" ? "直線距離からの目安" : "渋滞なしの目安"})` : "出発地からの所要時間は未計算"} ・ 添い寝: ${esc(place.sleep || place.co_sleep || "予約前確認")}${place.cage ? ` ・ ケージ: ${esc(place.cage.slice(0, 40))}${place.cage.length > 40 ? "…" : ""}` : ""}</p>
        ${check.notes.length ? `<div class="${check.ng ? "warnbox" : "note"}">${esc(check.notes.join("・"))}</div>` : ""}
        ${factLine(place, /対象犬|頭数|大きさ|サイズ/) ? `<p class="note"><b>対象犬・頭数:</b> ${esc(factLine(place, /対象犬|頭数|大きさ|サイズ/))}</p>` : ""}
        ${factLine(place, /料金/) ? `<p class="note"><b>犬の宿泊料金:</b> ${esc(factLine(place, /料金/))}</p>` : ""}
        ${pc.onlyUnknown ? `<div class="warnbox">${esc(RULES.ONLY_UNKNOWN_WARN)}</div>` : ""}
        <ul class="vc-plans">${plans}</ul>
        <div class="actions vc-actions"><button type="button" class="primary vc-make" data-id="${esc(place.id)}" data-ci="${esc(meta.checkin)}">この宿で旅行プランを作る →</button>
          ${place.page_url ? `<a href="${esc(place.page_url)}" target="_blank" rel="noopener">掲載情報(犬の条件)を見る</a>` : ""}
          ${h.info ? `<a href="${esc(h.info)}" target="_blank" rel="noopener sponsored">楽天トラベルの施設ページ<span class="ad">広告</span></a>` : ""}</div>
      </article>`;
    };
    // 地方ごとにまとめる(近い宿がある地方から。各地方は近い順、12 件を超える分は「もっと見る」)
    const PREF_REGION = [[/^(東京都|神奈川県|千葉県|埼玉県|茨城県|栃木県|群馬県)/, "関東"], [/^静岡県/, "伊豆・静岡"], [/^(山梨県|長野県|新潟県)/, "甲信越"], [/^(福島県|宮城県|山形県)/, "東北"]];
    const prefOf = (p) => ((p.area || "").match(/^(東京都|北海道|(?:京都|大阪)府|[^\s・（(]{2,3}県)/) || [])[1] || "";
    const regionOf = (p) => { const a = p.area || ""; for (const [re, name] of PREF_REGION) if (re.test(a)) return name; return "その他"; };
    const groups = new Map();
    list.forEach((row) => { const r = regionOf(row.place); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(row); });
    const SHOW = 12;
    box.innerHTML = [...groups.entries()].map(([region, rows], gi) => {
      const prefs = new Map(); rows.forEach((r) => { const pf = prefOf(r.place).replace(/[都府県]$/, ""); if (pf) prefs.set(pf, (prefs.get(pf) || 0) + 1); });
      const sub = [...prefs.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join("・");
      const cards = rows.map((row, i) => card(row, i).replace('<article class="card vc-card', `<article class="card vc-card${i >= SHOW ? " vc-hidden hidden" : ""}`)).join("");
      const more = rows.length > SHOW ? `<button type="button" class="sub vc-more" data-g="${gi}">この地方の残り ${rows.length - SHOW} 件も見る</button>` : "";
      return `<section class="vc-group" data-g="${gi}"><h3 class="vc-group-head">${esc(region)} <span class="note">${rows.length}件${sub ? `(${esc(sub)})` : ""}</span></h3>${cards}${more}</section>`;
    }).join("");
    box.querySelectorAll(".vc-more").forEach((b) => b.addEventListener("click", () => { const g = b.closest(".vc-group"); g.querySelectorAll(".vc-hidden").forEach((c) => c.classList.remove("hidden", "vc-hidden")); b.remove(); }));
    box.querySelectorAll(".vc-make").forEach((b) => b.addEventListener("click", () => {
      const dest = $("dest-q"); dest.value = b.dataset.id; dest.dispatchEvent(new Event("change", { bubbles: true }));
      $("date").value = b.dataset.ci; $("date").dispatchEvent(new Event("change", { bubbles: true }));
      if (window.PlannerData?.originForHub) window.PlannerData.originForHub($("vc-origin").value);
      // 検索したときの条件(人数・犬の頭数・大きさ・チェックアウト日)を行程側にも引き継ぐ(Codex 指摘 2026-10-03)
      const snap = lastSnap || {}; const co = meta.checkout || "";
      const setVal = (id, v) => { const el = $(id); if (!el || v === undefined || v === null || v === "") return; el.value = String(v); el.dispatchEvent(new Event("change", { bubbles: true })); };
      setVal("adults", meta.adults || 2); setVal("dogs", snap.dogs); setVal("size", snap.size); if (co) setVal("checkout", co);
      const sizeLabel = { small: "小型", medium: "中型", large: "大型" }[snap.size] || "";
      $("vc-status").textContent = `宿「${$("dest-q").selectedOptions[0]?.textContent || ""}」・${jstMd(b.dataset.ci)}${co ? `〜${jstMd(co)}` : ""}・大人${meta.adults || 2}名・犬${snap.dogs || 1}頭${sizeLabel ? `(${sizeLabel})` : ""}で行程を作ります。客室・宿泊プランの確定は予約先で行います(条件は下のフォームで変えられます)`;
      $("form").requestSubmit();
    }));
  }

  let searchSeq = 0; let lastSnap = null;  // 直近の検索条件(「この宿で旅行プランを作る」で行程側へ引き継ぐ)
  async function search() {
    const status = $("vc-status"); const btn = $("vc-go"); const seq = ++searchSeq;
    btn.disabled = true; status.textContent = "空室データを読み込んでいます…"; $("vc-results").innerHTML = "";
    try {
      const ci = $("vc-date").value; if (!ci) throw new Error("日付を選んでください。");
      const adults = adultsSel();
      const snap = { size: $("vc-size").value, dogs: Number($("vc-dogs").value) || 1, wantSleep: $("vc-sleep").checked, petOnly: $("vc-petonly").checked, budget: Number($("vc-budget").value) || 0, hub: $("vc-origin").value, originName: $("vc-origin").selectedOptions[0]?.textContent || "出発地", strict: $("vc-strict").checked };
      const data = await loadDate(ci, adults);
      if (seq !== searchSeq) return;
      lastSnap = snap;
      const bad = validate(data, { checkin: ci, adults }); if (bad) throw new Error(bad + "。別の日を選ぶか、しばらくしてからお試しください。");
      const PD = window.PlannerData; if (!PD) throw new Error("宿データの読み込み待ちです。少し待ってからもう一度押してください。");
      const { size, dogs, wantSleep, petOnly, budget, hub } = snap; const drive = PD.drive(); const origin = { name: snap.originName };
      const stOrigin = parseStationValue(hub);
      const rows = [];
      let hiddenPet = 0, hiddenBudget = 0, hiddenNg = 0;
      for (const [id, h] of Object.entries(data.hotels)) {
        const place = PD.byId(id); if (!place) continue;
        if (petOnly && !h.pet) { hiddenPet++; continue; }
        const pc = planCounts(h.plans); const shown = pc.shown; h.pet = pc.pet; if (!shown.length || (petOnly && !h.pet)) { hiddenPet++; continue; }  // h.pet は否定語を除いた犬対応プラン数(客室・プラン段階)
        const minPet = pc.petPlans.map((p) => p.total).filter(Boolean); const minAny = shown.map((p) => p.total).filter(Boolean);
        const price = petOnly ? (minPet.length ? Math.min(...minPet) : null) : (minAny.length ? Math.min(...minAny) : null);
        if (budget && price && price > budget) { hiddenBudget++; continue; }
        const check = dogCheck(place, size, dogs, wantSleep);
        if (check.ng && snap.strict) { hiddenNg++; continue; }
        let dr = drive && drive.places[id] && drive.places[id].from && drive.places[id].from[hub];
        if (!dr && stOrigin) {  // 駅名で探した出発地: 直線距離からの目安(主要駅の実測から 1 直線 km ≒ 1.16 分・道路 1.32 倍)
          const g = place.geocode || {}; const la = Number(g.lat), lo = Number(g.lon);
          if (isFinite(la) && isFinite(lo)) { const s = kmBetween(stOrigin.lat, stOrigin.lon, la, lo); dr = [Math.round(s * 1.16), Math.round(s * 1.32 * 10) / 10, "est"]; }
        }
        rows.push({ place, h, drive: dr || null, check, price });
      }
      rows.sort((a, b) => (b.h.pet ? 1 : 0) - (a.h.pet ? 1 : 0) || (a.check.ng ? 1 : 0) - (b.check.ng ? 1 : 0) || ((a.drive ? a.drive[0] : 9e9) - (b.drive ? b.drive[0] : 9e9)) || ((a.price || 9e9) - (b.price || 9e9)));
      render(rows, data, origin);
      const parts = [`${jstMd(ci)} チェックイン(1泊・${adults}名)で空室のある掲載宿 ${Object.keys(data.hotels).length}件のうち、条件に合う ${rows.length}件(地方ごと・出発地から近い順。各地方 12 件を超える分は「残りも見る」で表示)。`];
      if (hiddenPet) parts.push(`犬対応プランの空室が確認できない ${hiddenPet}件は非表示(チェックを外すと一般客室の空室も出ます)。`);
      if (hiddenBudget) parts.push(`予算超過 ${hiddenBudget}件を除外。`);
      if (hiddenNg) parts.push(`犬の条件に合わない記載のある ${hiddenNg}件を除外。`);
      parts.push(`空室・料金は楽天トラベルから ${fmtWhen(data.scanned_at)} に取得した情報で、現在は変わっている場合があります。`);
      status.textContent = parts.join("");
      $("vc-credit").classList.remove("hidden");
    } catch (e) {
      if (seq === searchSeq) { status.textContent = e.message || "空室データを読み込めませんでした。"; $("vc-results").innerHTML = ""; }
    } finally { if (seq === searchSeq) btn.disabled = false; }
  }

  // 行程表の「予約する」(planner.js)と共有する空室データの読み込み
  window.VacancyData = { loadIndex, loadDate, validate, petClass, planCounts, statusLines };

  async function init() {
    const card = $("vacancy-card"); if (!card) return;
    let dates = [];
    try {
      const idx = await loadIndex();
      dates = Object.keys(idx.dates || {}).sort();
      fillDates();
      $("vc-adults")?.addEventListener("change", fillDates);
      if (!dates.length) { $("vc-status").textContent = "空室データの準備中です(毎晩更新)。"; $("vc-go").disabled = true; return; }
      $("vc-status").textContent = `空室データ: ${dates.length}日分(次の週末と祝前日。毎晩更新、取得時刻は結果に表示)。`;
    } catch (e) {
      $("vc-status").textContent = "空室データの準備中です(毎晩更新)。"; $("vc-go").disabled = true;
    }
    // 出発地(主要駅)は drive_times.json の hub を使う。planner.js の読み込み後に埋める
    const fill = () => { const PD = window.PlannerData; const d = PD && PD.drive(); if (!d) return false; const sel = $("vc-origin"); sel.replaceChildren(...d.hubs.map((h) => new Option(h.name, h.id))); return true; };
    $("vc-go").addEventListener("click", search);
    wireStationSearch();
    // トップの検索(?checkin=&from=&size=&dogs=)から来たら、出発地の選択肢がそろってから条件を入れて探す(design-20261004)
    if (fill()) applyQuery(dates); else document.addEventListener("planner:data", () => { fill(); applyQuery(dates); }, { once: true });
  }

  // ?checkin=YYYY-MM-DD(いちばん近い掲載日に合わせる)・from=駅名(主要駅)・size=small|medium|large・dogs=1〜3
  function applyQuery(dates) {
    const q = new URLSearchParams(location.search);
    const ci = (q.get("checkin") || "").trim(), from = (q.get("from") || "").trim(), size = (q.get("size") || "").trim(), dogs = (q.get("dogs") || "").trim();
    if (!ci && !from && !size && !dogs) return;
    const notes = [];
    if (/^\d{4}-\d{2}-\d{2}$/.test(ci) && dates.length) {
      const t = Date.parse(ci);
      const best = dates.reduce((a, d) => { const da = Math.abs(Date.parse(a) - t), dd = Math.abs(Date.parse(d) - t); return dd < da || (dd === da && d > a) ? d : a; }, dates[0]);
      $("vc-date").value = best;
      if (best !== ci) notes.push(`${jstMd(ci)} は空室データがないため、近い ${jstMd(best)} で探しました`);
    }
    const SIZE = { small: "small", medium: "medium", large: "large", "小型": "small", "中型": "medium", "大型": "large" };
    if (SIZE[size]) $("vc-size").value = SIZE[size];
    const n = parseInt(dogs, 10); if (n >= 1) $("vc-dogs").value = String(Math.min(n, 3));
    if (from) {
      const sel = $("vc-origin"); const name = from.replace(/駅$/, "");
      const opt = [...sel.options].find((o) => o.value === from || o.textContent.trim().replace(/駅$/, "") === name);
      if (opt) sel.value = opt.value; else notes.push(`出発地「${from}」は主要駅にないため、駅名で探してください`);
    }
    const card = $("vacancy-card");
    if (card) card.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    const note = () => { if (notes.length) $("vc-status").textContent = `${notes.join("。")}。${$("vc-status").textContent}`; };
    if (ci && $("vc-date").value) search().then(note); else note();
  }

  // 出発地「駅名で探す」(planner.js の駅一覧を借りる)。選ぶと #vc-origin に "st:lat,lon|駅名(県)" の選択肢を足して選ぶ
  function parseStationValue(v) {
    const m = /^st:([\d.\-]+),([\d.\-]+)\|(.*)$/.exec(v || ""); return m ? { lat: Number(m[1]), lon: Number(m[2]), name: m[3] } : null;
  }
  function kmBetween(a1, o1, a2, o2) {
    const R = 6371, d2r = Math.PI / 180, dLat = (a2 - a1) * d2r, dLon = (o2 - o1) * d2r;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a1 * d2r) * Math.cos(a2 * d2r) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  function wireStationSearch() {
    const q = $("vc-origin-q"), box = $("vc-origin-sug"); if (!q || !box) return;
    let timer = null, list = [], idx = -1;
    const hide = () => { box.classList.add("hidden"); box.innerHTML = ""; q.setAttribute("aria-expanded", "false"); idx = -1; };
    const pick = (s) => {
      const sel = $("vc-origin"); const label = `${s.name}駅(${s.pref})`; const val = `st:${s.lat},${s.lon}|${label}`;
      let opt = [...sel.options].find((o) => o.value === val);
      if (!opt) { opt = new Option(label, val); sel.insertBefore(opt, sel.firstChild); }
      sel.value = val; q.value = `${s.name}駅`; hide();
      $("vc-status").textContent = `出発地を ${label} にしました(所要時間は直線距離からの目安になります)`;
    };
    const show = (l) => {
      list = l; idx = -1;
      box.innerHTML = l.length ? l.map((s) => `<button type="button" role="option"><b>${esc(s.name)}駅</b> <span class="note">${esc(s.pref)}</span><span class="sub">${esc((s.lines || []).slice(0, 3).join("・"))}</span></button>`).join("")
        : `<button type="button" disabled>見つかりません(掲載範囲の駅だけ検索できます)</button>`;
      [...box.querySelectorAll("button:not([disabled])")].forEach((b, i) => b.addEventListener("mousedown", (e) => { e.preventDefault(); pick(l[i]); }));
      box.classList.remove("hidden"); q.setAttribute("aria-expanded", "true");
    };
    const st = () => window.PlannerData && window.PlannerData.stations;
    q.addEventListener("focus", () => st() && st().load());
    q.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(() => { const s = st(); if (!s) return; s.load().then(() => { if (q.value.trim()) show(s.search(q.value)); else hide(); }); }, 120); });
    q.addEventListener("keydown", (e) => {
      const btns = [...box.querySelectorAll("button:not([disabled])")];
      if (e.key === "ArrowDown" || e.key === "ArrowUp") { if (!btns.length) return; e.preventDefault(); idx = (idx + (e.key === "ArrowDown" ? 1 : -1) + btns.length) % btns.length; btns.forEach((b, i) => b.classList.toggle("active", i === idx)); }
      else if (e.key === "Enter") { if (btns.length) { e.preventDefault(); pick(list[idx >= 0 ? idx : 0]); } }
      else if (e.key === "Escape") hide();
    });
    q.addEventListener("blur", () => setTimeout(hide, 150));
  }
  init();
})();
