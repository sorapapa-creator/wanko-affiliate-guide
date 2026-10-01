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
  const fmtWhen = (iso) => iso ? iso.replace("T", " ").slice(0, 16) : "";
  let index = null;
  const cache = new Map();

  async function loadIndex() {
    if (index) return index;
    const r = await fetch(`${BASE}index.json`, { cache: "no-cache" });
    if (!r.ok) throw new Error("index");
    index = await r.json();
    return index;
  }
  async function loadDate(ci) {
    if (cache.has(ci)) return cache.get(ci);
    const r = await fetch(`${BASE}${ci}.json`, { cache: "no-cache" });
    if (!r.ok) throw new Error("date");
    const d = await r.json(); cache.set(ci, d); return d;
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
      const plans = (h.plans || []).map((p) => `<li class="vc-plan${p.pet ? " vc-pet" : ""}">${p.pet ? '<span class="badge b-run">犬対応プラン</span>' : '<span class="badge">一般プラン(犬の受け入れは要確認)</span>'} <b>${yen(p.total)}</b><span class="note">(2名1泊・楽天表示)</span><br>
        <span class="note">${esc(p.plan || "")}${p.room ? ` ／ ${esc(p.room)}` : ""}${p.dinner ? "・夕食付" : ""}${p.breakfast ? "・朝食付" : ""}</span><br>
        ${p.url ? `<a href="${esc(p.url)}" target="_blank" rel="noopener sponsored">楽天トラベルでこのプランを見る(${esc(jstMd(meta.checkin))}・2名)<span class="ad">広告</span></a>` : ""}</li>`).join("");
      return `<article class="card vc-card${check.ng ? " vc-ng" : ""}">
        <h3>${i + 1}. ${esc(place.name)} <span class="badge">${esc(place.area || "")}</span>${h.pet ? ' <span class="badge b-rec">犬対応プランに空室</span>' : ' <span class="badge">一般客室の空室のみ</span>'}</h3>
        <p class="note">${drive ? `${esc(origin.name)}から車で約${fmtDur(drive[0])}(${drive[1]}km・渋滞なしの目安)` : "出発地からの所要時間は未計算"} ・ 添い寝: ${esc(place.sleep || place.co_sleep || "予約前確認")}${place.cage ? ` ・ ケージ: ${esc(place.cage.slice(0, 40))}${place.cage.length > 40 ? "…" : ""}` : ""}</p>
        ${check.notes.length ? `<div class="${check.ng ? "warnbox" : "note"}">${esc(check.notes.join("・"))}</div>` : ""}
        ${factLine(place, /対象犬|頭数|大きさ|サイズ/) ? `<p class="note"><b>対象犬・頭数:</b> ${esc(factLine(place, /対象犬|頭数|大きさ|サイズ/))}</p>` : ""}
        ${factLine(place, /料金/) ? `<p class="note"><b>犬の宿泊料金:</b> ${esc(factLine(place, /料金/))}</p>` : ""}
        <ul class="vc-plans">${plans}</ul>
        <div class="actions"><button type="button" class="sub vc-make" data-id="${esc(place.id)}" data-ci="${esc(meta.checkin)}">この宿で旅行プランを作る</button>
          ${place.page_url ? `<a href="${esc(place.page_url)}" target="_blank" rel="noopener">掲載情報(犬の条件)を見る</a>` : ""}
          ${h.info ? `<a href="${esc(h.info)}" target="_blank" rel="noopener sponsored">楽天トラベルの施設ページ<span class="ad">広告</span></a>` : ""}</div>
      </article>`;
    };
    box.innerHTML = list.map(card).join("");
    box.querySelectorAll(".vc-make").forEach((b) => b.addEventListener("click", () => {
      const dest = $("dest-q"); dest.value = b.dataset.id; dest.dispatchEvent(new Event("change", { bubbles: true }));
      $("date").value = b.dataset.ci; $("date").dispatchEvent(new Event("change", { bubbles: true }));
      if (window.PlannerData?.originForHub) window.PlannerData.originForHub($("vc-origin").value);
      $("form").scrollIntoView({ behavior: "smooth", block: "start" });
      $("vc-status").textContent = `行き先を「${$("dest-q").selectedOptions[0]?.textContent || ""}」、出発日を ${jstMd(b.dataset.ci)} にしました。下の条件を確認して「予想時間を出す」を押してください。`;
    }));
  }

  async function search() {
    const status = $("vc-status"); const btn = $("vc-go");
    btn.disabled = true; status.textContent = "空室データを読み込んでいます…";
    try {
      const ci = $("vc-date").value; if (!ci) throw new Error("日付を選んでください。");
      const data = await loadDate(ci);
      const PD = window.PlannerData; if (!PD) throw new Error("宿データの読み込み待ちです。少し待ってからもう一度押してください。");
      const size = $("vc-size").value, dogs = Number($("vc-dogs").value) || 1, wantSleep = $("vc-sleep").checked, petOnly = $("vc-petonly").checked, budget = Number($("vc-budget").value) || 0;
      const hub = $("vc-origin").value; const drive = PD.drive(); const origin = { name: $("vc-origin").selectedOptions[0]?.textContent || "出発地" };
      const rows = [];
      let hiddenPet = 0, hiddenBudget = 0, hiddenNg = 0;
      for (const [id, h] of Object.entries(data.hotels)) {
        const place = PD.byId(id); if (!place) continue;
        if (petOnly && !h.pet) { hiddenPet++; continue; }
        const minPet = h.plans.filter((p) => p.pet).map((p) => p.total).filter(Boolean);
        const price = petOnly ? (minPet.length ? Math.min(...minPet) : h.min) : h.min;
        if (budget && price && price > budget) { hiddenBudget++; continue; }
        const check = dogCheck(place, size, dogs, wantSleep);
        if (check.ng && $("vc-strict").checked) { hiddenNg++; continue; }
        const dr = drive && drive.places[id] && drive.places[id].from && drive.places[id].from[hub];
        rows.push({ place, h, drive: dr || null, check, price });
      }
      rows.sort((a, b) => (b.h.pet ? 1 : 0) - (a.h.pet ? 1 : 0) || (a.check.ng ? 1 : 0) - (b.check.ng ? 1 : 0) || ((a.drive ? a.drive[0] : 9e9) - (b.drive ? b.drive[0] : 9e9)) || ((a.price || 9e9) - (b.price || 9e9)));
      const limited = rows.slice(0, 40);
      render(limited, data, origin);
      const parts = [`${jstMd(ci)} チェックイン(1泊・2名)で空室のある掲載宿 ${Object.keys(data.hotels).length}件のうち、条件に合う ${rows.length}件${rows.length > 40 ? "(近い順に40件まで表示)" : ""}。`];
      if (hiddenPet) parts.push(`犬対応プランの空室が確認できない ${hiddenPet}件は非表示(チェックを外すと一般客室の空室も出ます)。`);
      if (hiddenBudget) parts.push(`予算超過 ${hiddenBudget}件を除外。`);
      if (hiddenNg) parts.push(`犬の条件に合わない記載のある ${hiddenNg}件を除外。`);
      parts.push(`空室・料金は楽天トラベルから ${fmtWhen(data.scanned_at)} に取得した情報で、現在は変わっている場合があります。`);
      status.textContent = parts.join("");
      $("vc-credit").classList.remove("hidden");
    } catch (e) {
      status.textContent = e.message || "空室データを読み込めませんでした。";
    } finally { btn.disabled = false; }
  }

  async function init() {
    const card = $("vacancy-card"); if (!card) return;
    try {
      const idx = await loadIndex();
      const dates = Object.keys(idx.dates || {}).sort();
      const sel = $("vc-date");
      sel.replaceChildren(...dates.map((ci) => new Option(`${jstMd(ci)} 〜 ${jstMd(idx.dates[ci].checkout)}(空室 ${idx.dates[ci].available}宿・犬対応プラン ${idx.dates[ci].pet}宿)`, ci)));
      if (!dates.length) { $("vc-status").textContent = "空室データの準備中です(毎晩更新)。"; $("vc-go").disabled = true; return; }
      $("vc-status").textContent = `空室データ: ${dates.length}日分(次の週末。毎晩更新、取得時刻は結果に表示)。`;
    } catch (e) {
      $("vc-status").textContent = "空室データの準備中です(毎晩更新)。"; $("vc-go").disabled = true;
    }
    // 出発地(主要駅)は drive_times.json の hub を使う。planner.js の読み込み後に埋める
    const fill = () => { const PD = window.PlannerData; const d = PD && PD.drive(); if (!d) return false; const sel = $("vc-origin"); sel.replaceChildren(...d.hubs.map((h) => new Option(h.name, h.id))); return true; };
    if (!fill()) document.addEventListener("planner:data", fill, { once: true });
    $("vc-go").addEventListener("click", search);
  }
  init();
})();
