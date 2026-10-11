(() => {
  "use strict";
  function init() {
    if (document.querySelector(".search-context")) return;
    const $ = s => document.querySelector(s);
    const all = s => [...document.querySelectorAll(s)];
    const val = id => $("#" + id)?.value?.trim() || "";
    const label = id => $("#" + id)?.selectedOptions?.[0]?.textContent.trim() || "";
    const number = (n, m) => `条件一致 ${n}件 / 掲載 ${m}件`;
    const setText = (el, text) => { if (el.textContent !== text) el.textContent = text; };
    function mount(before, target, reset, title) {
      if (title) {
        const h = document.createElement("h2");
        h.className = "search-context-heading"; h.textContent = title;
        before.before(h); before = h;
      }
      const box = document.createElement("div"); box.className = "search-context";
      box.setAttribute("aria-label", "選択中の検索条件");
      box.innerHTML = '<p class="sc-summary"></p><details hidden><summary>その他の条件</summary><p class="sc-extra"></p></details>' +
        '<p class="sc-status" role="status" aria-live="polite" aria-atomic="true"></p>' +
        '<div class="sc-actions"><a>条件を変える</a><button type="button">全解除</button></div>';
      before.before(box);
      const link = box.querySelector("a"); link.href = "#" + target.id;
      function go() {
        target.focus({ preventScroll: true });
        // 公開APIはカード外も対象にできる。同一hashの再クリックにも対応。
        window.wankoScrollToCard(target);
      }
      link.addEventListener("click", e => {
        if (!window.wankoScrollToCard || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
        e.preventDefault(); go(); // hashを変更せず、既存hashchangeとの二重補正を避ける
      });
      box.querySelector("button").addEventListener("click", () => {
        reset(); if (window.wankoScrollToCard) go(); else target.focus();
      });
      return (summary, status, extra = "") => {
        setText(box.querySelector(".sc-summary"), summary || "条件指定なし");
        setText(box.querySelector(".sc-status"), status);
        setText(box.querySelector(".sc-extra"), extra);
        box.querySelector("details").hidden = !extra;
      };
    }

    const stay = $("#stay-query"), outing = $("#outing-query");
    if (stay || outing) {
      const isStay = !!stay, query = stay || outing;
      const cards = all(isStay ? ".stay-card" : "#tripGrid .trip");
      const count = $(isStay ? "#stay-count" : "#outing-count");
      const reset = $(isStay ? ".stay-reset" : "#outing-reset");
      const paint = mount(isStay ? $(".stay-empty") : $("#tripGrid"), query,
        () => reset.click(), isStay ? "宿の検索結果" : "お出かけの検索結果");
      count.setAttribute("aria-live", "off"); // 読み上げはバーに集約
      let shown = cards.filter(c => !c.hidden).length;
      function update(e) {
        if (Number.isInteger(e?.detail?.shown)) shown = e.detail.shown;
        const parts = query.value.trim() ? ["キーワード：" + query.value.trim()] : [];
        if (isStay) {
          all('.stay-chip[aria-pressed="true"]').forEach(b => {
            // .chip-n の件数を条件名へ混入させない
            const copy = b.cloneNode(true); copy.querySelector(".chip-n")?.remove();
            parts.push(copy.textContent.trim());
          });
          parts.push("並び順：" + label("stay-sort"));
        } else {
          const region = $('.filters [data-filter][aria-pressed="true"]');
          if (region && region.dataset.filter !== "all") parts.push(region.textContent.trim());
          if (val("outing-kind") !== "all") parts.push(label("outing-kind"));
        }
        const text = number(shown, cards.length);
        setText(count, text);
        paint(parts.join("・"), text + (shown ? "" : "。条件を減らしてお試しください。"));
      }
      document.addEventListener("wanko:filtered", update);
      $("#stay-sort")?.addEventListener("change", () => update());
      update(); // 追加JSより前に初回filter/updateが終わっていても同期
      return;
    }

    const form = $("#form"), dest = $("#dest-q");
    if (!form || !dest || !$("#compare-title")) return;
    const paint = mount($("#compare-title"), $("#dest-q"),
      () => window.WankoPlannerContext.reset());
    const ids = ["origin", "dest-q", "date", "start", "step", "count", "size", "age",
      "carsick", "heat", "brachy", "heat-cycle", "vaccine", "toilet",
      "meal-time", "med-time", "checkout", "adults", "dogs", "dog-kg"];
    const signature = () => JSON.stringify([
      ...ids.map(id => { const x = $("#" + id); return x.type === "checkbox" ? x.checked : x.value; }),
      ...all("#wps .wp").map(row => [row.querySelector(".wp-q").value, row.querySelector(".wp-stay").value])
    ]);
    let submitted = "", rendered = "", ready = !!window.PlannerData, queued = false;
    const schedule = () => {
      if (!queued) { queued = true; queueMicrotask(() => { queued = false; update(); }); }
    };
    function update() {
      const options = [...dest.options].filter(o => o.value);
      const enabled = options.filter(o => !o.disabled && !o.parentElement.disabled).length;
      const state = window.WankoPlannerContext?.state();
      const old = state?.stale || (state?.hasResult && signature() !== rendered);
      const summary = [
        val("date") || "日付未選択",
        val("adults") ? val("adults") + "名" : "人数未選択",
        label("size") + (val("dogs") ? val("dogs") + "頭" : "・頭数未選択"),
        val("dest-q") ? label("dest-q") : "行き先未選択"
      ].join("・");
      const extra = ["出発地：" + label("origin"), "出発：" + val("start"),
        "比較：" + label("step") + "・" + val("count") + "候補", label("age"),
        $("#vaccine").checked ? "証明書あり" : "証明書なし"];
      for (const id of ["carsick", "heat", "brachy", "heat-cycle"])
        if ($("#" + id).checked) extra.push($("#" + id).closest("label").textContent.trim());
      for (const [id, name] of [["checkout", "チェックアウト"], ["toilet", "トイレ間隔"],
        ["meal-time", "ごはん"], ["med-time", "薬"], ["dog-kg", "最大体重"]])
        if (val(id)) extra.push(name + "：" + (id === "toilet" ? label(id) : val(id)) + (id === "dog-kg" ? "kg" : ""));
      all("#wps .wp").forEach((row, i) => {
        const q = row.querySelector(".wp-q");
        if (q.value) extra.push("立ち寄り" + (i + 1) + "：" + q.selectedOptions[0].textContent.trim() +
          "（" + row.querySelector(".wp-stay").selectedOptions[0].textContent.trim() + "）");
      });
      const counts = ready ? "行き先候補（証明書条件のみ）：" + number(enabled, options.length) : "行き先候補：読込待ち";
      const status = old ? "入力条件を変更しました。表示中は前回の計算結果です。必要に応じて再計算してください。" :
        state?.hasResult ? "入力条件を表示中。" : "入力条件を表示中・ルート未計算。";
      paint(summary, counts + "。日付・人数・犬サイズへの適合件数ではありません。" + status, extra.join("・"));
    }
    form.addEventListener("submit", () => { submitted = signature(); }, true);
    for (const type of ["input", "change"]) form.addEventListener(type, schedule);
    document.addEventListener("planner:data", () => { ready = true; schedule(); });
    document.addEventListener("planner:rendered", () => { rendered = submitted; schedule(); });
    document.addEventListener("planner:context-reset", () => { submitted = rendered = ""; schedule(); });
    // value代入だけの変更は監視できないため、既存側の描画イベントも併用。
    const watch = new MutationObserver(schedule);
    for (const selector of ["#dest-q", "#wps", "#compare", "#plan-stale"])
      watch.observe($(selector), { childList: true, subtree: true, attributes: true,
        characterData: true, attributeFilter: ["disabled", "class"] });
    update();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
