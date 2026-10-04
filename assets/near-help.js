/* 宿カードに「近くの動物病院・薬局」ボタン(2026-10-04)。押したときだけ OpenPOI API(無料・キー不要)で検索して表示。
   座標は route-planner/data/map-points.json([id, lat, lon, type])。取れなければ何も出さない(無くても壊れない)。 */
(function () {
  "use strict";
  var API = "https://api.openpoiapi.com/v1/search", pts = null;
  function loadPts() { if (!pts) pts = fetch("route-planner/data/map-points.json").then(function (r) { return r.ok ? r.json() : []; }).catch(function () { return []; }); return pts; }
  function km(a1, o1, a2, o2) { var R = 6371, d = Math.PI / 180, x = Math.sin((a2 - a1) * d / 2), y = Math.sin((o2 - o1) * d / 2); return 2 * R * Math.asin(Math.sqrt(x * x + Math.cos(a1 * d) * Math.cos(a2 * d) * y * y)); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function search(q, lat, lon, r) {
    var key = "wanko_poi:" + q + ":" + lat.toFixed(3) + "," + lon.toFixed(3) + ":" + r;
    try { var c = JSON.parse(localStorage.getItem(key) || "null"); if (c && Date.now() - c.t < 864e5) return Promise.resolve(c.r); } catch (e) {}
    var ctl = new AbortController(); var tm = setTimeout(function () { ctl.abort(); }, 6000);
    return fetch(API + "?q=" + encodeURIComponent(q) + "&center=" + lon + "," + lat + "&radius=" + r + "&limit=10", { signal: ctl.signal })
      .then(function (res) { return res.ok ? res.json() : { results: [] }; }).then(function (d) { var rr = Array.isArray(d.results) ? d.results : []; try { localStorage.setItem(key, JSON.stringify({ t: Date.now(), r: rr })); } catch (e) {} return rr; })
      .catch(function () { return []; }).finally(function () { clearTimeout(tm); });
  }
  function pick(rows, re, lat, lon) {
    var seen = {}; return rows.filter(function (r) { return re.test(r.name || "") && isFinite(r.lat) && isFinite(r.lng); })
      .map(function (r) { r.km = km(lat, lon, r.lat, r.lng); return r; }).sort(function (a, b) { return a.km - b.km; })
      .filter(function (r) { if (seen[r.name]) return false; seen[r.name] = 1; return true; }).slice(0, 4);
  }
  function li(r) { return '<li><a href="https://www.google.com/maps/search/?api=1&query=' + r.lat + "," + r.lng + '" target="_blank" rel="noopener">' + esc(r.name) + '</a> <span class="note">直線 約' + (r.km < 10 ? r.km.toFixed(1) : Math.round(r.km)) + "km" + (r.city ? "・" + esc(r.city) : "") + "</span></li>"; }
  document.querySelectorAll("article.stay-card").forEach(function (card) {
    var host = card.querySelector(".links") || card.querySelector(".route-plan-cta"); if (!host) return;
    var btn = document.createElement("button"); btn.type = "button"; btn.className = "near-help-btn"; btn.textContent = "近くの動物病院・薬局";
    var out = document.createElement("div"); out.className = "near-help"; out.hidden = true;
    host.insertAdjacentElement("afterend", out); host.appendChild(btn);
    btn.addEventListener("click", function () {
      if (!out.hidden) { out.hidden = true; return; }
      out.hidden = false; out.innerHTML = '<p class="note">近くの施設を探しています…</p>';
      loadPts().then(function (list) {
        var p = (list || []).find(function (x) { return x[0] === card.id; });
        if (!p) { out.innerHTML = '<p class="note">この宿の位置が未登録のため表示できません。</p>'; return; }
        var lat = +p[1], lon = +p[2];
        return Promise.all([search("動物病院", lat, lon, 10000), search("薬局", lat, lon, 5000)]).then(function (res) {
          var v = pick(res[0], /動物|ペット|獣医|アニマル/, lat, lon), d = pick(res[1], /薬局|薬房|ドラッグ|薬店/, lat, lon);
          if (!v.length && !d.length) { out.innerHTML = '<p class="note">近くの動物病院・薬局が見つかりませんでした。</p>'; return; }
          out.innerHTML = (v.length ? '<p class="near-help-h">動物病院(10km 以内)</p><ul>' + v.map(li).join("") + "</ul>" : "") +
            (d.length ? '<p class="near-help-h">薬局・ドラッグストア(5km 以内)</p><ul>' + d.map(li).join("") + "</ul>" : "") +
            '<p class="note">診療時間・休診日・犬の受け入れは各施設にご確認ください(閉業していることもあります)。出典: <a href="https://openpoiapi.com/attribution.html" target="_blank" rel="noopener">OpenPOI API</a>(Overture Maps Foundation, overturemaps.org / Japan Food Facilities)</p>';
        });
      });
    });
  });
})();
