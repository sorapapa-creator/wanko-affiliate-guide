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

  // 読み込みの失敗は code 付きで投げる(fetch_error = 通信・形式の失敗、missing_date = ファイルがない)。W01
  const codeErr = (code, msg) => Object.assign(new Error(msg || code), { code });
  async function loadIndex(force) {
    if (index && !force) return index;
    let r;
    try { r = await fetch(`${BASE}index.json`, { cache: "no-cache" }); } catch (e) { throw codeErr("fetch_error", "空室データを読み込めませんでした。"); }
    if (!r.ok) throw codeErr(r.status === 404 ? "missing_date" : "fetch_error", "空室データを読み込めませんでした。");
    try { index = await r.json(); } catch (e) { throw codeErr("fetch_error", "空室データを読み込めませんでした。"); }
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
    let r;
    try { r = await fetch(`${BASE}${key}.json`, { cache: "no-cache" }); } catch (e) { throw codeErr("fetch_error", "この日の空室データを読み込めませんでした。"); }
    if (!r.ok) throw codeErr(r.status === 404 ? "missing_date" : "fetch_error", adults === 2 ? "この日の空室データを読み込めませんでした。" : `${adults}名のデータはこの日はまだありません(2名で検索してください)。`);
    let d;
    try { d = await r.json(); } catch (e) { throw codeErr("fetch_error", "この日の空室データを読み込めませんでした。"); }
    cache.set(key, d); return d;
  }
  function fillDates() {
    if (!index) return;
    const adults = adultsSel(); const sel = $("vc-date"); const cur = sel.value;
    const dates = Object.keys(index.dates || {}).sort();
    const isSat = (ci) => /\(土\)/.test(jstMd(ci));
    sel.replaceChildren(...dates.map((ci) => {
      const e = index.dates[ci]; const s = adults === 2 ? e : e[`a${adults}`];
      // 取得から 24 時間を超えた日は、古い空室数を出さない(W01)
      const fresh = s ? RULES.stateOf(RULES.freshness(s.scanned_at || e.scanned_at)) : "missing_date";
      const counts = !s ? `${adults}名のデータなし` : fresh === "expired" ? "空室情報の更新待ち" : fresh === "unknown_timestamp" ? "取得時刻を確認できません"
        : `空室 ${s.available}宿・犬対応プラン ${s.pet}宿${s.new ? `・新しく空室 ${s.new}宿` : ""}`;
      return new Option(`${jstMd(ci)} 〜 ${jstMd(e.checkout)}${isSat(ci) ? "" : "・祝前日"}(${counts})`, ci);
    }));
    // 希望日にデータがないあいだは「選んでください」を選択したままにし、勝手に先頭(や直前)の日にしない
    if (sel.dataset.wish) { sel.prepend(new Option(`${jstMd(sel.dataset.wish)} は空室データなし — 日付を選んでください`, "")); sel.value = ""; }
    else if (cur && dates.includes(cur)) sel.value = cur;
    else if (!cur) {  // 最初の表示は、空室を確認できる(取得から 24 時間以内の)いちばん近い日を選んでおく。古い日は一覧に「更新待ち」と残す
      const fresh = dates.find((ci) => { const e = index.dates[ci]; const s = adults === 2 ? e : e[`a${adults}`]; return s && RULES.freshness(s.scanned_at || e.scanned_at) === "ok"; });
      if (fresh) sel.value = fresh;
    }
  }

  // 犬の条件の判定: 大きさ・体重・頭数は vacancy-rules.js の dogVerdict(data/dog_rules.json の公式の一律の上限)。
  // fit / check(要確認) / ng(条件外の記載あり)を、検索の振り分け・カードの本文・バッジで共用する(cx-20261013-1)
  let dogRulesP = null;
  const loadDogRules = () => (dogRulesP ||= fetch(`${CFG.dataBase || "./data/"}dog_rules.json`, { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).catch(() => null));
  function dogCheck(place, rule, dog, wantSleep, pc) {
    const v = RULES.dogVerdict(rule, place, dog); const reasons = [...v.reasons]; let status = v.status;
    if (wantSleep) {
      const s = place.sleep || place.co_sleep || "";
      if (/不可|NG|禁止/.test(s)) { if (status !== "ng") reasons.length = 0; reasons.push("添い寝は不可の記載"); status = "ng"; }
      else if (!/可/.test(s) && status !== "ng") { if (status === "fit") reasons.length = 0; reasons.push("添い寝できるかは予約前確認"); status = "check"; }
    }
    // 宿の条件に合っても、空いているのが犬同伴の可否未確認の一般客室だけなら適合とは言えない(施設全体の空室で推測しない)
    if (status === "fit" && pc && !pc.pet) { reasons.length = 0; reasons.push("空いているのは犬同伴の可否が未確認の一般客室だけ"); status = "check"; }
    const extra = (place.dog_hints || {}).cert_required ? ["証明書の提示が条件"] : [];
    return { status, ng: status === "ng", reasons, ok: v.ok, src: v.src, extra };
  }
  const VERDICT_BADGE = { fit: "b-fit", check: "b-check", ng: "b-ng" };
  const verdictBox = (check) => `<div class="vc-dogfit vc-dogfit-${check.status}"><b>犬の条件(公式の一律の上限で照合): ${esc(RULES.VERDICT_LABEL[check.status])}</b>
      ${check.reasons.length ? `<ul>${check.reasons.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>` : ""}
      ${check.ok.length ? `<p class="note">確認できた項目: ${esc(check.ok.join("・"))}</p>` : ""}
      ${check.extra.length ? `<p class="note">${esc(check.extra.join("・"))}</p>` : ""}
      <p class="note">${check.src.url ? `根拠: <a href="${esc(check.src.url)}" target="_blank" rel="noopener">公式の案内</a>` : "根拠: 公式の案内は未登録"}${check.src.date ? `(確認日 ${esc(check.src.date)})` : ""}。客室・プランごとの条件は予約先で確認してください。</p></div>`;

  function factLine(place, keyRe) {
    const k = Object.keys(place.facts || {}).find((x) => keyRe.test(x));
    return k ? place.facts[k] : "";
  }

  // list = 公式の条件の範囲内(fit)の宿。extras = 要確認・条件外の宿を、適合とは別の欄に分けて出す(厳密な一覧には混ぜない)
  function render(list, meta, origin, extras = []) {
    const box = $("vc-results");
    const card = ({ place, h, drive, check, pc }, i) => {  // 客室・プラン段階の集計(施設の犬同伴可とは別)
      const status3 = `<ul class="vc-status3">${statusLines(pc, meta.scanned_at).map((l) => `<li${l.warn ? ' class="warn"' : ""}><b>${esc(l.label)}:</b> ${esc(l.text)}</li>`).join("")}</ul>`;
      const plans = pc.shown.map((p) => `<li class="vc-plan${petClass(p) === "pet" ? " vc-pet" : ""}">${petClass(p) === "pet" ? '<span class="badge b-run">犬対応プラン</span>' : '<span class="badge">一般客室(犬同伴の可否は未確認)</span>'} <b>${yen(p.total)}</b><span class="note">(${meta.adults || 2}名1泊・楽天表示・${esc(fmtWhen(meta.scanned_at))} 取得)</span><br>
        <span class="note">${esc(p.plan || "")}${p.room ? ` ／ ${esc(p.room)}` : ""}${p.dinner ? "・夕食付" : ""}${p.breakfast ? "・朝食付" : ""}</span><br>
        ${p.url ? `<a class="vc-book" href="${esc(p.url)}" target="_blank" rel="noopener sponsored">広告｜楽天トラベルで空室・条件を確認</a><span class="note">(${esc(jstMd(meta.checkin))}・${meta.adults || 2}名)</span>` : ""}</li>`).join("");
      return `<article class="card vc-card${check.ng ? " vc-ng" : ""}" data-dogfit="${esc(check.status)}">
        ${place.photo ? `<img class="vc-photo" src="${esc(place.photo)}" alt="${esc(place.name)}の写真(楽天トラベル提供)" loading="lazy">` : ""}
        <h3>${i + 1}. ${esc(place.name)} <span class="badge">${esc(place.area || "")}</span> <span class="badge ${VERDICT_BADGE[check.status]}">犬の条件: ${esc(RULES.VERDICT_LABEL[check.status])}</span>${pc.pet ? ' <span class="badge b-rec">取得時点の犬対応プランあり</span>' : ' <span class="badge">取得時点は一般客室のみ（犬同伴可否は未確認）</span>'}${h.new ? ' <span class="badge b-new" title="前の晩の確認では空室がなかった宿です(キャンセルなどで空いた可能性)">新しく空室</span>' : ""}</h3>
        ${status3}
        <p class="note">${drive ? `${esc(origin.name)}から車で約${fmtDur(drive[0])}(${drive[1]}km・${drive[2] === "est" ? "直線距離からの目安" : "渋滞なしの目安"})` : "出発地からの所要時間は未計算"} ・ 添い寝: ${esc(place.sleep || place.co_sleep || "予約前確認")}${place.cage ? ` ・ ケージ: ${esc(place.cage.slice(0, 40))}${place.cage.length > 40 ? "…" : ""}` : ""}</p>
        ${verdictBox(check)}
        ${factLine(place, /対象犬|頭数|大きさ|サイズ/) ? `<p class="note"><b>対象犬・頭数:</b> ${esc(factLine(place, /対象犬|頭数|大きさ|サイズ/))}</p>` : ""}
        ${factLine(place, /料金/) ? `<p class="note"><b>犬の宿泊料金:</b> ${esc(factLine(place, /料金/))}</p>` : ""}
        ${pc.onlyUnknown ? `<div class="warnbox">${esc(RULES.ONLY_UNKNOWN_WARN)}</div>` : ""}
        <ul class="vc-plans">${plans}</ul>
        <div class="actions vc-actions"><button type="button" class="primary vc-make" data-id="${esc(place.id)}" data-ci="${esc(meta.checkin)}" data-drive="${drive ? drive[0] : ""}" data-name="${esc(place.name)}" data-ou="${pc.onlyUnknown ? "1" : ""}">この宿で旅行プランを作る →</button>
          ${place.page_url ? `<a href="${esc(place.page_url)}" target="_blank" rel="noopener">掲載情報(犬の条件)を見る</a>` : ""}
          ${h.info ? `<a href="${esc(h.info)}" target="_blank" rel="noopener sponsored">広告｜楽天トラベルで空室・条件を確認</a>` : ""}</div>
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
      const cards = rows.map((row, i) => card(row, i).replace('<article class="card vc-card', `<article data-pref="${esc(prefOf(row.place).replace(/[都府県]$/, ""))}" class="card vc-card${i >= SHOW ? " vc-hidden hidden" : ""}`)).join("");
      const more = rows.length > SHOW ? `<button type="button" class="sub vc-more" data-g="${gi}">この地方の残り ${rows.length - SHOW} 件も見る</button>` : "";
      const prefBtns = prefs.size > 1 ? `<div class="vc-prefs" role="group" aria-label="${esc(region)}の県で絞る"><button type="button" class="vc-chip active" data-pref="">すべて</button>${[...prefs.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `<button type="button" class="vc-chip" data-pref="${esc(k)}">${esc(k)} ${v}</button>`).join("")}</div>` : "";
      return `<section class="vc-group" data-g="${gi}" data-region="${esc(region)}"><h3 class="vc-group-head">${esc(region)} <span class="note">${rows.length}件${sub ? `(${esc(sub)})` : ""}</span></h3>${prefBtns}${cards}${more}</section>`;
    }).join("") + (list.length ? "" : statePanel("no_match", { ...ctxNow(), meta }) + `<p class="note vc-nofit">公式に書かれた一律の条件で、今回の犬(大きさ・体重・頭数${$("vc-sleep")?.checked ? "・添い寝" : ""})に合うと照合できた空室のある宿は見つかりませんでした。${extras.some((x) => x.rows.length) ? "下の「要確認」の宿は、予約前に宿へ条件を確認してください。" : "条件を緩めるか、別の日を選んでください。"}</p>`)
      + extras.filter((x) => x.rows.length).map((x) => `<section class="vc-extra vc-extra-${esc(x.kind)}" data-kind="${esc(x.kind)}"><h3 class="vc-group-head">${esc(x.title)} <span class="note">${x.rows.length}件</span></h3><p class="note">${esc(x.note)}</p>
        <button type="button" class="sub vc-extra-toggle" aria-expanded="false" data-label="${esc(`${x.button}(${x.rows.length}件)`)}">${esc(`${x.button}(${x.rows.length}件)`)}</button><div class="vc-extra-body hidden">${x.rows.map((row, i) => card(row, i)).join("")}</div></section>`).join("");
    box.querySelectorAll(".vc-extra-toggle").forEach((b) => b.addEventListener("click", () => {
      const open = !b.nextElementSibling.classList.toggle("hidden");
      b.setAttribute("aria-expanded", String(open)); b.textContent = open ? "閉じる" : b.dataset.label;
    }));
    // 地方を選ぶボタン(結果の上)と、地方の中の県ボタン(2026-10-04 オーナー「地方を選んでからそこの宿を選べるように」)
    if (groups.size > 1) {
      const nav = document.createElement("div"); nav.className = "vc-regions"; nav.setAttribute("role", "group"); nav.setAttribute("aria-label", "地方を選ぶ");
      nav.innerHTML = `<span class="vc-regions-label">地方を選ぶ</span><button type="button" class="vc-chip active" data-region="">すべて ${list.length}</button>` + [...groups.entries()].map(([r, rows]) => `<button type="button" class="vc-chip" data-region="${esc(r)}">${esc(r)} ${rows.length}</button>`).join("");
      box.prepend(nav);
      const pickRegion = (b, scroll) => {
        lastRegion = b.dataset.region || "";
        nav.querySelectorAll("button").forEach((x) => { x.classList.toggle("active", x === b); x.setAttribute("aria-pressed", String(x === b)); });
        box.querySelectorAll(".vc-group").forEach((g) => { g.hidden = !!b.dataset.region && g.dataset.region !== b.dataset.region; });
        if (b.dataset.region) { const g = box.querySelector(`.vc-group[data-region="${CSS.escape(b.dataset.region)}"]`); if (g) { g.querySelectorAll(".vc-hidden").forEach((c) => c.classList.remove("hidden", "vc-hidden")); g.querySelector(".vc-more")?.remove(); } }
        if (scroll) box.scrollIntoView({ block: "start" });
      };
      nav.addEventListener("click", (e) => { const b = e.target.closest("button[data-region]"); if (b) pickRegion(b, true); });
      // 条件を変えて探し直しても、選んでいた地方を保つ(その地方が 0 件なら「すべて」に戻す。dot 実地テスト 2026-10-04)
      const keep = lastRegion && nav.querySelector(`button[data-region="${CSS.escape(lastRegion)}"]`);
      if (keep) pickRegion(keep, false); else if (lastRegion) { $("vc-status").dataset.regionNote = `${lastRegion}はこの条件では 0 件のため、すべての地方を表示しています。`; lastRegion = ""; }
    }
    box.querySelectorAll(".vc-prefs").forEach((pn) => pn.addEventListener("click", (e) => {
      const b = e.target.closest("button[data-pref]"); if (!b) return; const g = pn.closest(".vc-group");
      pn.querySelectorAll("button").forEach((x) => { x.classList.toggle("active", x === b); x.setAttribute("aria-pressed", String(x === b)); });
      g.querySelectorAll(".vc-hidden").forEach((c) => c.classList.remove("hidden", "vc-hidden")); g.querySelector(".vc-more")?.remove();
      g.querySelectorAll(".vc-card").forEach((c) => { c.hidden = !!b.dataset.pref && c.dataset.pref !== b.dataset.pref; });
    }));
    box.querySelectorAll(".vc-more").forEach((b) => b.addEventListener("click", () => { const g = b.closest(".vc-group"); g.querySelectorAll(".vc-hidden").forEach((c) => c.classList.remove("hidden", "vc-hidden")); b.remove(); }));
    box.querySelectorAll(".vc-make").forEach((b) => b.addEventListener("click", () => {
      const dest = $("dest-q"); dest.value = b.dataset.id; dest.dispatchEvent(new Event("change", { bubbles: true }));
      $("date").value = b.dataset.ci; $("date").dispatchEvent(new Event("change", { bubbles: true }));
      if (window.PlannerData?.originForHub) window.PlannerData.originForHub($("vc-origin").value);
      // 検索したときの条件(人数・犬の頭数・大きさ・チェックアウト日)を行程側にも引き継ぐ(Codex 指摘 2026-10-03)
      const snap = lastSnap || {}; const co = meta.checkout || "";
      const setVal = (id, v) => { const el = $(id); if (!el || v === undefined || v === null || v === "") return; el.value = String(v); el.dispatchEvent(new Event("change", { bubbles: true })); };
      setVal("adults", meta.adults || 2); setVal("dogs", snap.dogs); setVal("size", snap.size); setVal("dog-kg", snap.kg || ""); if (co) setVal("checkout", co);
      // 出発時刻: チェックインの約 3 時間前に着く時刻から(近くで遊んでから宿へ)。早朝 5 時着で宿に入れない、を避ける(Codex 実地テスト 2026-10-04)
      const ht = window.PlannerData?.hotelTimes?.(window.PlannerData.byId(b.dataset.id)); const dmin = Number(b.dataset.drive);
      const ciMin = ht && /^\d{1,2}:\d{2}$/.test(ht.checkin || "") ? Number(ht.checkin.split(":")[0]) * 60 + Number(ht.checkin.split(":")[1]) : 15 * 60;
      if (dmin > 0 && $("start")) { let st = ciMin - 180 - dmin; st = Math.max(5 * 60, Math.min(11 * 60, Math.floor(st / 30) * 30)); setVal("start", `${String(Math.floor(st / 60)).padStart(2, "0")}:${String(st % 60).padStart(2, "0")}`); }
      // 結果の一覧はたたんで、選んだ宿だけを見せる(スマホでページが長くなりすぎる対策)。「ほかの宿も見る」で戻せる
      const box = $("vc-results"); box.classList.add("vc-collapsed"); box.querySelector(".vc-chosen")?.remove();
      const chosen = document.createElement("div"); chosen.className = "vc-chosen";
      chosen.innerHTML = `<span>選んだ宿: <b>${esc(b.dataset.name || "")}</b></span><button type="button" class="sub">ほかの宿も見る</button>`;
      chosen.querySelector("button").onclick = () => { box.classList.remove("vc-collapsed"); chosen.remove(); box.scrollIntoView({ block: "start" }); };
      box.prepend(chosen);
      const sizeLabel = { small: "小型", medium: "中型", large: "大型" }[snap.size] || "";
      $("vc-status").textContent = `宿「${$("dest-q").selectedOptions[0]?.textContent || ""}」・${jstMd(b.dataset.ci)}${co ? `〜${jstMd(co)}` : ""}・大人${meta.adults || 2}名・犬${snap.dogs || 1}頭${sizeLabel ? `(${sizeLabel})` : ""}で行程を作ります。客室・宿泊プランの確定は予約先で行います(条件は下のフォームで変えられます)${b.dataset.ou ? `。注意: ${RULES.ONLY_UNKNOWN_WARN}` : ""}`;
      $("vc-status").classList.toggle("warn-text", Boolean(b.dataset.ou));
      $("form").requestSubmit();
    }));
  }

  let searchSeq = 0; let lastSnap = null; let lastRegion = "";  // 直近の検索条件(「この宿で旅行プランを作る」で行程側へ引き継ぐ)
  async function search() {
    const status = $("vc-status"); const btn = $("vc-go"); const seq = ++searchSeq;
    btn.disabled = true; status.textContent = "空室データを読み込んでいます…"; $("vc-results").innerHTML = "";
    const ctx = { ...ctxNow(), focus: true };
    try {
      const ci = $("vc-date").value; if (!ci) throw new Error("日付を選んでください。");
      const adults = adultsSel();
      const kgIn = Number($("vc-kg")?.value) || 0;
      const snap = { size: $("vc-size").value, dogs: Number($("vc-dogs").value) || 1, kg: kgIn > 0 && kgIn <= 120 ? kgIn : 0, wantSleep: $("vc-sleep").checked, petOnly: $("vc-petonly").checked, budget: Number($("vc-budget").value) || 0, hub: $("vc-origin").value, originName: $("vc-origin").selectedOptions[0]?.textContent || "出発地", strict: $("vc-strict").checked };
      const [data, dogRules] = await Promise.all([loadDate(ci, adults), loadDogRules()]);
      const ruleOf = (id) => (dogRules && dogRules.rules ? dogRules.rules[id] : undefined);
      if (seq !== searchSeq) return;
      lastSnap = snap;
      const st = RULES.check(data, { checkin: ci, adults });
      if (st.code !== "ok") { showState(st.code, { ...ctx, scannedAt: data && data.scanned_at }); return; }
      const PD = window.PlannerData; if (!PD) throw new Error("宿データの読み込み待ちです。少し待ってからもう一度押してください。");
      const { size, dogs, wantSleep, petOnly, budget, hub } = snap; const drive = PD.drive(); const origin = { name: snap.originName };
      const stOrigin = parseStationValue(hub);
      const rows = [];
      let hiddenPet = 0, hiddenBudget = 0, hiddenNg = 0, hiddenMisfit = 0;
      for (const [id, h] of Object.entries(data.hotels)) {
        const place = PD.byId(id); if (!place) continue;
        if (petOnly && !h.pet) { hiddenPet++; continue; }
        const pc = planCounts(h.plans, { size, dogs }); const shown = pc.shown; h.pet = pc.pet;
        if (!shown.length && pc.misfit) { hiddenMisfit++; continue; }  // 空いている客室・プランが今回の犬の大きさ・頭数に合わない(「小型〜中型のわんちゃんと」など)
        if (!shown.length || (petOnly && !h.pet)) { hiddenPet++; continue; }  // h.pet は否定語を除いた犬対応プラン数(客室・プラン段階)
        const minPet = pc.petPlans.map((p) => p.total).filter(Boolean); const minAny = shown.map((p) => p.total).filter(Boolean);
        const price = petOnly ? (minPet.length ? Math.min(...minPet) : null) : (minAny.length ? Math.min(...minAny) : null);
        if (budget && price && price > budget) { hiddenBudget++; continue; }
        const check = dogCheck(place, ruleOf(id), { size, dogs, kg: snap.kg }, wantSleep, pc);
        if (check.ng && snap.strict) { hiddenNg++; continue; }
        let dr = drive && drive.places[id] && drive.places[id].from && drive.places[id].from[hub];
        if (!dr && stOrigin) {  // 駅名で探した出発地: 直線距離からの目安(主要駅の実測から 1 直線 km ≒ 1.16 分・道路 1.32 倍)
          const g = place.geocode || {}; const la = Number(g.lat), lo = Number(g.lon);
          if (isFinite(la) && isFinite(lo)) { const s = kmBetween(stOrigin.lat, stOrigin.lon, la, lo); dr = [Math.round(s * 1.16), Math.round(s * 1.32 * 10) / 10, "est"]; }
        }
        rows.push({ place, h, drive: dr || null, check, price, pc });
      }
      rows.sort((a, b) => (b.h.new ? 1 : 0) - (a.h.new ? 1 : 0) || (b.h.pet ? 1 : 0) - (a.h.pet ? 1 : 0) || ((a.drive ? a.drive[0] : 9e9) - (b.drive ? b.drive[0] : 9e9)) || ((a.price || 9e9) - (b.price || 9e9)));
      // 公式の条件の範囲内(fit)だけを一覧にし、要確認・条件外は別の欄へ(cx-20261013-1: 要確認を適合に混ぜない)
      const fit = rows.filter((r) => r.check.status === "fit"), unsure = rows.filter((r) => r.check.status === "check"), ngRows = rows.filter((r) => r.check.status === "ng");
      if (!dogRules) unsure.forEach((r) => r.check.reasons.unshift("犬の条件のデータを読み込めなかったため照合していません"));
      render(fit, data, origin, [
        { kind: "check", title: "要確認の宿(犬の条件を照合できなかった宿)", button: "要確認の宿を見る", rows: unsure,
          note: "公式に一律の上限が書かれていない・目安の書き方・客室や棟で条件が分かれるなどで、今回の犬が泊まれるかを照合できなかった宿です。上の一覧(公式の条件の範囲内)には含めていません。予約前に宿へ確認してください。" },
        { kind: "ng", title: "条件外の記載がある宿", button: "条件外の記載がある宿を見る", rows: ngRows,
          note: "掲載情報や公式の案内に、今回の犬の大きさ・体重・頭数・添い寝に合わない記載がある宿です。" },
      ]);
      const sizeJa = { small: "小型", medium: "中型", large: "大型" }[size] || "";
      const parts = [`${jstMd(ci)} チェックイン(1泊・${adults}名)で取得時点で空室のあった掲載宿 ${Object.keys(data.hotels).length}件のうち、犬(${sizeJa}${snap.kg ? `・${snap.kg}kg` : ""}・${dogs}頭)が公式の条件の範囲内と照合できた ${fit.length}件(地方ごと・出発地から近い順。各地方 12 件を超える分は「残りも見る」で表示)。`];
      if (unsure.length) parts.push(`犬の条件が要確認の ${unsure.length}件は、一覧の下に分けて表示(照合できた一覧には含めていません)。`);
      if (ngRows.length) parts.push(`条件外の記載がある ${ngRows.length}件も一覧の下に分けて表示。`);
      const nNew = fit.filter((r) => r.h.new).length;
      if (nNew) parts.push(`前の晩の確認では空室がなかった宿 ${nNew}件に「新しく空室」の印(キャンセルなどで空いた可能性。各地方の先頭に表示)。`);
      if (hiddenPet) parts.push(`犬対応プランの空室が確認できない ${hiddenPet}件は非表示(チェックを外すと一般客室の空室も出ます)。`);
      if (hiddenBudget) parts.push(`予算超過 ${hiddenBudget}件を除外。`);
      if (hiddenNg) parts.push(`犬の大きさ・体重・頭数・添い寝の条件に合わない記載のある ${hiddenNg}件を除外。`);
      if (hiddenMisfit) parts.push(`空いている客室が犬の大きさ・頭数に合わない ${hiddenMisfit}件を除外。`);
      parts.push(`空室・料金は楽天トラベルから ${fmtWhen(data.scanned_at)} に取得した情報で、現在の空室・料金は予約先で確認してください。`);
      if (status.dataset.regionNote) { parts.unshift(status.dataset.regionNote); delete status.dataset.regionNote; }
      status.textContent = parts.join(""); status.classList.remove("warn-text");
      $("vc-credit").classList.remove("hidden");
    } catch (e) {
      if (seq === searchSeq) {
        if (e && e.code) showState(e.code, ctx);
        else { status.textContent = e.message || "空室データを読み込めませんでした。"; $("vc-results").innerHTML = ""; }
      }
    } finally { if (seq === searchSeq) btn.disabled = false; }
  }

  // ---------------------------------------------------------------- 空室を確認できないときの案内(W01・cx-20261024-2)
  // expired / unknown_timestamp / missing_date / fetch_error / no_match を別々の文言で。どれも満室とは言わず、希望日は変えない。
  // 主ボタンの宿一覧(dog-lodging-guide.html)は犬の条件を URL で受け取れないため「絞り込み済み」とは書かない
  const SIZE_JA = { small: "小型犬", medium: "中型犬", large: "大型犬" };
  function ctxNow() {
    const sel = $("vc-date");
    return { ci: (sel && (sel.value || sel.dataset.wish)) || "", adults: adultsSel(), originName: $("vc-origin")?.selectedOptions[0]?.textContent.trim() || "出発地",
      size: $("vc-size")?.value || "", dogs: Number($("vc-dogs")?.value) || 1, kg: Number($("vc-kg")?.value) || 0 };
  }
  function statePanel(code, ctx) {
    const T = RULES.STATE_TEXT[code] || RULES.STATE_TEXT.fetch_error;
    const cond = [ctx.ci ? `希望日 ${jstMd(ctx.ci)} チェックイン(1泊)` : "希望日 未選択", `大人 ${ctx.adults}名`, `出発地 ${ctx.originName}`, `犬 ${SIZE_JA[ctx.size] || ""}・${ctx.dogs >= 3 ? "3頭以上" : `${ctx.dogs}頭`}${ctx.kg ? `・${ctx.kg}kg` : ""}`].join(" ／ ");
    const list = (main) => `<a class="${main ? "vc-state-main" : "vc-state-sub"}" href="../dog-lodging-guide.html">宿一覧を見る(空室は未確認)</a>`;
    const reload = (main) => `<button type="button" class="${main ? "primary" : "sub"} vc-reload">空室情報を再読み込み</button>`;
    const acts = code === "no_match" ? "" : code === "fetch_error" ? reload(true) + list(false) : list(true) + reload(false);
    const when = code === "no_match" && ctx.meta && ctx.meta.scanned_at ? `(楽天トラベル ${esc(fmtWhen(ctx.meta.scanned_at))} 取得)` : "";
    return `<section class="vc-state vc-state-${esc(code)}" data-state="${esc(code)}" aria-labelledby="vc-state-title">
      <h3 id="vc-state-title" tabindex="-1">${esc(T.title)}</h3>
      <p>${esc(T.body)}${when}${ctx.extraNote ? ` ${esc(ctx.extraNote)}` : ""}</p>
      <p class="vc-state-cond"><b>探した条件:</b> ${esc(cond)}</p>
      ${acts ? `<div class="actions vc-state-actions">${acts}</div>` : ""}
      ${acts && code !== "fetch_error" ? `<p class="note">宿一覧には、ここで選んだ犬の大きさ・頭数は引き継がれません。各宿の「対象犬・頭数」で確かめてください。下の「決まった宿への行程を作る」は、空室がわからなくても使えます。</p>` : ""}
    </section>`;
  }
  function showState(code, ctx) {
    const box = $("vc-results"); const status = $("vc-status");
    box.classList.remove("vc-collapsed");
    box.innerHTML = statePanel(code, ctx);
    status.textContent = "";  // 見出しと同じ文を上に重ねて出さない
    status.classList.remove("warn-text");
    $("vc-credit")?.classList.add("hidden");
    $("vc-go").disabled = !index;  // 日付の一覧が読めていないあいだは「再読み込み」だけを押せるようにする
    box.querySelector(".vc-reload")?.addEventListener("click", (e) => reloadVacancy(e.currentTarget, ctx));
    if (ctx.focus) box.querySelector("#vc-state-title")?.focus({ preventScroll: true });
  }
  async function reloadVacancy(btn, ctx) {
    btn.disabled = true; btn.textContent = "再読み込み中…";
    const sel = $("vc-date"); const want = sel.value || sel.dataset.wish || ctx.ci;
    cache.clear();
    try { await loadIndex(true); } catch (e) { showState(e.code || "fetch_error", { ...ctx, focus: true }); return; }
    const dates = Object.keys(index.dates || {}).sort();
    // 希望日を勝手に別の日にしない: 一覧から消えていたら「この日はデータなし」のまま止める
    if (want && !dates.includes(want)) { sel.dataset.wish = want; fillDates(); showState("missing_date", { ...ctx, ci: want, focus: true }); return; }
    fillDates(); if (want) sel.value = want;
    search();
  }

  // 行程表の「予約する」(planner.js)と共有する空室データの読み込み
  window.VacancyData = { loadIndex, loadDate, validate, petClass, planCounts, statusLines };

  // 犬の条件の照合表示(cx-20261013-1)の見た目と、任意の体重欄。index.html は地図の作業と重なるため、ここで差し込む
  function mountDogFitUi() {
    if (!$("vc-dogfit-style")) {
      const st = document.createElement("style"); st.id = "vc-dogfit-style";
      st.textContent = `.b-fit{background:#2e7d4f;color:#fff}.b-check{background:#fff4d6;color:#7a4b00;border:1px solid #e0b44c}.b-ng{background:#f3e3e0;color:#8a2a1c;border:1px solid #d9a29a}
.vc-dogfit{margin:8px 0;padding:8px 10px;border-radius:8px;font-size:.9rem;border-left:4px solid #2e7d4f;background:#f1f8f3}.vc-dogfit ul{margin:4px 0 4px 1.2em;padding:0}.vc-dogfit p{margin:4px 0}
.vc-dogfit-check{border-left-color:#e0b44c;background:#fffaf0}.vc-dogfit-ng{border-left-color:#c0392b;background:#fdf3f1}
.vc-extra{margin-top:18px}.vc-extra .vc-group-head{border-left-color:#e0b44c}.vc-extra-ng .vc-group-head{border-left-color:#c0392b}.vc-extra-toggle{margin:6px 0}
.vc-datenote .actions{margin:6px 0}.vc-kg{margin-top:6px}.vc-kg input{width:100%}`;
      document.head.appendChild(st);
    }
    const size = $("vc-size");
    if (size && !$("vc-kg")) {
      const w = document.createElement("div"); w.className = "vc-kg";
      w.innerHTML = `<input type="number" id="vc-kg" min="0.5" max="90" step="0.1" inputmode="decimal" placeholder="体重 kg(任意)" aria-label="いちばん重い子の体重(kg・任意)。入れると公式の体重上限と照合します">`;
      size.after(w);
    }
  }

  async function init() {
    const card = $("vacancy-card"); if (!card) return;
    mountDogFitUi();
    let dates = [];
    $("vc-adults")?.addEventListener("change", fillDates);
    try {
      const idx = await loadIndex();
      dates = Object.keys(idx.dates || {}).sort();
      fillDates();
      if (!dates.length) { $("vc-status").textContent = "空室データの準備中です(毎晩更新)。"; $("vc-go").disabled = true; return; }
      $("vc-status").textContent = `空室データ: ${dates.length}日分(次の週末と祝前日。毎晩更新、取得時刻は結果に表示)。`;
    } catch (e) {
      // 読み込めなかった(通信)のか、まだ無いのかを分けて出す。「準備中」と言い切らない(W01)
      $("vc-status").textContent = ""; showState(e.code || "fetch_error", { ...ctxNow(), ci: new URLSearchParams(location.search).get("checkin") || "" });
    }
    // 出発地(主要駅)は drive_times.json の hub を使う。planner.js の読み込み後に埋める
    const fill = () => { const PD = window.PlannerData; const d = PD && PD.drive(); if (!d) return false; const sel = $("vc-origin");
      // 旅行プランの出発地(約110駅・地域別)と同じ一覧にする。主要駅は実測の所要時間(hub id)、それ以外は直線距離からの目安(st:)(2026-10-04)
      const hubByName = new Map(d.hubs.map((h) => [h.name.replace(/駅$/, ""), h.id])); const src = $("origin"); const groups = [];
      if (src) for (const g of src.querySelectorAll("optgroup")) { const og = document.createElement("optgroup"); og.label = g.label;
        for (const o of g.querySelectorAll("option")) { const nm = o.textContent.trim(); if (!/^[\d.\-]+,[\d.\-]+$/.test(o.value)) continue; const hid = hubByName.get(nm.replace(/駅$/, "")); og.appendChild(new Option(nm, hid || `st:${o.value}|${nm}`)); }
        if (og.children.length) groups.push(og); }
      if (src) { const og = document.createElement("optgroup"); og.label = "そのほかの駅";
        for (const o of src.querySelectorAll(":scope > option")) { const nm = o.textContent.trim(); if (!/^[\d.\-]+,[\d.\-]+$/.test(o.value)) continue; const hid = hubByName.get(nm.replace(/駅$/, "")); og.appendChild(new Option(nm, hid || `st:${o.value}|${nm}`)); }
        if (og.children.length) groups.push(og); }
      if (groups.length) sel.replaceChildren(...groups); else sel.replaceChildren(...d.hubs.map((h) => new Option(h.name, h.id)));
      if ([...sel.options].some((o) => o.value === "tokyo")) sel.value = "tokyo"; return true; };
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
    let canSearch = Boolean(ci);
    if (/^\d{4}-\d{2}-\d{2}$/.test(ci) && Number.isFinite(Date.parse(ci))) {
      // 希望日は行程のフォーム(出発日)にも残す(選べる範囲のときだけ)
      const pd = $("date"); if (pd && (!pd.min || ci >= pd.min)) { pd.value = ci; pd.dispatchEvent(new Event("change", { bubbles: true })); }
      if (dates.includes(ci)) $("vc-date").value = ci;
      else { canSearch = false; if (index) showDateWish(ci, dates); }  // 一覧を読めなかったとき(fetch_error)は「準備中」と言わない  // 黙って近い日に置き換えない(cx-20261013-1)。理由と候補を示して選んでもらう
    }
    const SIZE = { small: "small", medium: "medium", large: "large", "小型": "small", "中型": "medium", "大型": "large" };
    if (SIZE[size]) $("vc-size").value = SIZE[size];
    const n = parseInt(dogs, 10); if (n >= 1) $("vc-dogs").value = String(Math.min(n, 3));
    if (from) {
      const sel = $("vc-origin"); const name = from.replace(/駅$/, "");
      const opt = [...sel.options].find((o) => o.value === from || o.textContent.trim().replace(/駅$/, "") === name);
      if (opt) sel.value = opt.value;
      else { const st = window.PlannerData && window.PlannerData.stations; if (st) st.load().then(() => { const hit = st.search(name).find((x) => x.name === name) || st.search(name)[0];
          if (hit) { const label = `${hit.name}駅(${hit.pref})`; const o = new Option(label, `st:${hit.lat},${hit.lon}|${label}`); sel.insertBefore(o, sel.firstChild); sel.value = o.value; } else notes.push(`出発地「${from}」が見つからないため、駅名で探してください`); }); }
    }
    if (!index) showState("fetch_error", { ...ctxNow(), ci });  // 一覧を読めなかったときも、入った条件で案内を出し直す
    const card = $("vacancy-card");
    if (card) card.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    const note = () => { if (notes.length) $("vc-status").textContent = `${notes.join("。")}。${$("vc-status").textContent}`; };
    if (canSearch && $("vc-date").value) search().then(note); else note();
  }

  // 希望日に空室データがないとき: 元の日付と理由を出し、前後の掲載日を利用者が選ぶ(選ぶまで検索しない)
  function showDateWish(ci, dates) {
    const sel = $("vc-date"); sel.dataset.wish = ci; fillDates();
    const today = jstYmdNow();
    const why = ci <= today ? "今日以前の日付のため、空室を探せません"
      : !dates.length ? "空室データの準備中です"
      : ci > dates[dates.length - 1] ? `空室データは ${jstMd(dates[dates.length - 1])} チェックイン分までです(毎晩、次の 8 週末と祝前日を更新)`
      : "空室は週末・祝前日の 1 泊だけを毎晩調べているため、この日のデータはありません";
    const before = [...dates].reverse().find((d) => d < ci), after = dates.find((d) => d > ci);
    let box = $("vc-datenote");
    if (!box) { box = document.createElement("div"); box.id = "vc-datenote"; box.className = "warnbox vc-datenote"; box.setAttribute("role", "status"); $("vc-status").before(box); }
    const pd = $("date"); const kept = pd && pd.value === ci;
    box.innerHTML = `<p><b>希望のチェックイン日: ${esc(jstMd(ci))}</b> — ${esc(why)}。別の日に置き換えずに止めています。</p>
      ${before || after ? `<p>空室データのある近い日で探す場合は、選んでください:</p><div class="actions">${[before, after].filter(Boolean).map((d) => `<button type="button" class="sub vc-pickdate" data-ci="${esc(d)}">${esc(jstMd(d))} で探す</button>`).join("")}</div>` : ""}
      <p class="note">${kept ? `${esc(jstMd(ci))} のまま行程を作る場合は、下の「決まった宿への行程を作る」で宿を選んでください(出発日に ${esc(jstMd(ci))} を入れてあります)。空室は予約先で確認してください。` : "行程だけを作る場合は、下の「決まった宿への行程を作る」で日付を入れてください。"}</p>`;
    box.querySelectorAll(".vc-pickdate").forEach((b) => b.addEventListener("click", () => {
      delete sel.dataset.wish; fillDates(); sel.value = b.dataset.ci;
      box.innerHTML = `<p>希望日 ${esc(jstMd(ci))} ではなく、選んだ ${esc(jstMd(b.dataset.ci))} の空室を表示しています。</p>`;
      search();
    }));
    const onPick = () => {
      if (!sel.dataset.wish) { sel.removeEventListener("change", onPick); return; }
      if (!sel.value) return;
      sel.removeEventListener("change", onPick); delete sel.dataset.wish;
      [...sel.options].filter((o) => !o.value).forEach((o) => o.remove());
      box.innerHTML = `<p>希望日 ${esc(jstMd(ci))} ではなく、選んだ ${esc(jstMd(sel.value))} で探します。「空室のある宿を探す」を押してください。</p>`;
    };
    sel.addEventListener("change", onPick);
  }
  function jstYmdNow() { return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10); }

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
