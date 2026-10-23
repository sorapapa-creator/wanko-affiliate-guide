// スマホで初めて使う人向けの補助(planner-ux-20261024)。planner.js・vacancy.js の後に読む。通信はしない。
// 1) 選択肢の少ないプルダウン(犬の大きさ・頭数・人数など)を、押しやすいボタン(ラジオ)にする。元の <select> は値の置き場として残す
//    (planner.js・vacancy.js・assets/search-context.js はこれまでどおり select の値を読む・書く)
// 2) 宿のカードから ?dest= 付きで来たら、行程のフォームを空室検索より上に出す(宿はもう決まっているため)
// 3) 宿が行き先のときは、比べ始める出発時刻を「チェックインの約 3 時間前に着く時刻」にする(利用者が時刻を変えたら触らない)
// 4) 駅名の検索欄: スマホでキーボードが出ても候補が隠れないよう、欄を画面の上に寄せて候補の高さを残りの画面に合わせる
// 5) 閉じた「条件を細かく決める」の中に入力の誤りがあれば開いて、ブラウザの案内が見えるようにする
(() => {
  const $ = (id) => document.getElementById(id);
  const form = $("form");
  if (!form) return;

  // ---------------------------------------------------------------- 1) ボタンの選択肢
  const SEGMENTS = { size: {}, age: {}, step: {}, count: { suffix: "通り" }, adults: { empty: "指定なし", suffix: "名" }, dogs: { empty: "指定なし", suffix: "頭" },
    "vc-size": {}, "vc-dogs": {}, "vc-adults": {}, "vc-budget": {} };
  const segs = [];
  function segment(select, opt) {
    const group = document.createElement("div");
    group.className = "seg"; group.setAttribute("role", "radiogroup"); group.dataset.segFor = select.id;
    const label = document.querySelector(`label[for="${CSS.escape(select.id)}"]`) || select.closest("div,fieldset")?.querySelector("label");
    if (label) { label.id = label.id || `${select.id}-label`; label.removeAttribute("for"); group.setAttribute("aria-labelledby", label.id); }
    else if (select.getAttribute("aria-label")) group.setAttribute("aria-label", select.getAttribute("aria-label"));
    const build = () => {
      group.replaceChildren(...[...select.options].map((o, i) => {
        const l = document.createElement("label");
        const input = document.createElement("input");
        input.type = "radio"; input.name = `seg-${select.id}`; input.value = o.value;
        input.defaultChecked = o.defaultSelected || (i === 0 && ![...select.options].some((x) => x.defaultSelected));
        input.checked = select.value === o.value;
        input.addEventListener("change", () => {
          if (!input.checked || select.value === o.value) return;
          select.value = o.value;
          select.dispatchEvent(new Event("change", { bubbles: true }));
          sync();
        });
        const text = o.value === "" && opt.empty ? opt.empty : /^\d+$/.test(o.textContent.trim()) && opt.suffix ? `${o.textContent.trim()}${opt.suffix}` : o.textContent.trim();
        l.append(input, document.createTextNode(text));
        return l;
      }));
      sync();
    };
    const sync = () => group.querySelectorAll("input").forEach((input) => {
      input.checked = input.value === select.value;
      input.parentElement.classList.toggle("on", input.checked);
    });
    select.classList.add("seg-src"); select.tabIndex = -1; select.setAttribute("aria-hidden", "true");
    select.after(group);
    select.addEventListener("change", sync);
    // vacancy.js の ?size= などは value の代入だけ(change を出さない)なので、代入にも追従する
    for (const prop of ["value", "selectedIndex"]) {
      const d = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, prop);
      Object.defineProperty(select, prop, { configurable: true, get() { return d.get.call(this); }, set(v) { d.set.call(this, v); sync(); } });
    }
    build();
    segs.push({ select, sync, build });
  }
  for (const [id, opt] of Object.entries(SEGMENTS)) { const el = $(id); if (el && el.tagName === "SELECT" && el.options.length <= 8) segment(el, opt); }
  // form.reset() や value の代入だけの変更(イベントなし)にも追従する
  form.addEventListener("reset", () => setTimeout(() => segs.forEach((s) => s.sync()), 0));
  document.addEventListener("planner:context-reset", () => segs.forEach((s) => s.sync()));
  document.addEventListener("planner:data", () => segs.forEach((s) => s.sync()));
  for (const s of segs) new MutationObserver(s.build).observe(s.select, { childList: true });

  // ---------------------------------------------------------------- 2) ?dest= 付きで来たら行程のフォームを先に
  const params = new URLSearchParams(location.search);
  function destFirst() {
    const dest = $("dest-q");
    if (!params.get("dest") || !dest.value || location.hash) return;
    const vc = $("vacancy-card");
    if (vc && form.compareDocumentPosition(vc) & Node.DOCUMENT_POSITION_PRECEDING) vc.before(form);
    const place = window.PlannerData && window.PlannerData.byId(dest.value);
    if (place) {
      $("form-title").textContent = `「${place.name}」への行程を作る`;
      $("form-lead").innerHTML = `行き先は選んであります。<span class="req">必須</span> は出発日だけです。日付を確かめて「プランを作る」を押してください。`;
    }
    form.classList.add("dest-first");
    $("guide")?.classList.add("hidden");  // 「宿はもう決まっていますか？」は聞かない(空室から探すカードはフォームの下に残る)
  }

  // ---------------------------------------------------------------- 3) 宿のときの出発時刻
  const start = $("start");
  let startTouched = false, startAuto = false;
  const markTouched = (e) => { if (e.isTrusted) startTouched = true; };
  start.addEventListener("input", markTouched); start.addEventListener("change", markTouched);
  form.addEventListener("reset", () => { startTouched = false; startAuto = false; setTimeout(suggestStart, 0); });
  const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  const kmBetween = (a1, o1, a2, o2) => {
    const R = 6371, d2r = Math.PI / 180, dLat = (a2 - a1) * d2r, dLon = (o2 - o1) * d2r;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a1 * d2r) * Math.cos(a2 * d2r) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  };
  function suggestStart() {
    const PD = window.PlannerData; const hint = $("start-hint"); const note = $("more-options-note");
    if (!PD || startTouched) return;
    const place = PD.byId($("dest-q").value);
    const setNote = () => { if (note) note.textContent = `出発時刻(${start.value.replace(/^0/, "")} から ${$("count").value} 通り比較)・立ち寄り先・年齢や体質・泊数と人数`; };
    if (!place || place.type !== "lodging" || !place.geocode) {
      if (startAuto) { start.value = "05:00"; startAuto = false; }
      if (hint) hint.textContent = ""; setNote(); return;
    }
    // 出発地から宿までの所要時間(分): 主要駅は前計算(渋滞なし)、それ以外は直線距離からの目安(vacancy.js と同じ係数)
    const d = PD.drive(); const originSel = $("origin"); const name = (originSel.selectedOptions[0]?.textContent || "").trim().replace(/\(.*\)$/, "");
    const hub = d && d.hubs.find((h) => h.name.replace(/駅$/, "") === name.replace(/駅$/, ""));
    let mins = hub && d.places[place.id] && d.places[place.id].from && d.places[place.id].from[hub.id] ? d.places[place.id].from[hub.id][0] : 0;
    if (!mins && /^[\d.\-]+,[\d.\-]+$/.test(originSel.value)) {
      const [la, lo] = originSel.value.split(",").map(Number);
      mins = Math.round(kmBetween(la, lo, Number(place.geocode.lat), Number(place.geocode.lon)) * 1.16);
    }
    if (!mins) { if (hint) hint.textContent = ""; setNote(); return; }
    const ht = PD.hotelTimes(place); const m = /^(\d{1,2}):(\d{2})/.exec((ht && ht.checkin) || "");
    const ci = m ? Number(m[1]) * 60 + Number(m[2]) : 15 * 60;
    const st = Math.max(5 * 60, Math.min(11 * 60, Math.floor((ci - 180 - mins) / 30) * 30));
    if (start.value !== hhmm(st)) { start.value = hhmm(st); start.dispatchEvent(new Event("change", { bubbles: true })); }
    startAuto = true;
    if (hint) hint.textContent = `宿のチェックイン(${m ? ht.checkin : "15:00 目安"})の約 3 時間前に着く ${hhmm(st).replace(/^0/, "")} から比べます(近くで遊んでから宿へ)。早めたいときはここで変えられます。`;
    setNote();
  }
  for (const id of ["dest-q", "origin", "count"]) $(id).addEventListener("change", () => setTimeout(suggestStart, 0));

  document.addEventListener("planner:data", () => { destFirst(); suggestStart(); }, { once: true });
  if (window.PlannerData) { destFirst(); suggestStart(); }

  // ---------------------------------------------------------------- 4) 駅名の検索欄とキーボード
  const small = () => matchMedia("(max-width: 640px)").matches;
  for (const id of ["origin-q", "vc-origin-q"]) {
    const q = $(id), box = $(id.replace(/-q$/, "-sug"));
    if (!q || !box) continue;
    const fit = () => {
      const h = window.visualViewport ? window.visualViewport.height : innerHeight;
      box.style.maxHeight = `${Math.max(132, Math.min(280, Math.floor(h - q.getBoundingClientRect().bottom - 8)))}px`;
    };
    q.addEventListener("focus", () => { if (!small()) return; setTimeout(() => { if (document.activeElement !== q) return; q.scrollIntoView({ block: "start" }); fit(); }, 300); });
    q.addEventListener("input", () => setTimeout(fit, 160));
    if (window.visualViewport) window.visualViewport.addEventListener("resize", () => { if (document.activeElement === q) fit(); });
  }

  // ---------------------------------------------------------------- 5) 閉じた欄の中の入力の誤り
  form.addEventListener("invalid", (e) => {
    for (let d = e.target.closest("details"); d; d = d.parentElement && d.parentElement.closest("details")) d.open = true;
  }, true);
})();
