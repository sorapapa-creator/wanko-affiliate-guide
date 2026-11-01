/* サイト内検索(search.html)。索引 assets/search-index.json は tools/build_search_index.py で作る。
   索引は検索欄に触れたとき(または ?q= つきで開いたとき)に初めて読み込む。サーバーは使わず、ブラウザ内で絞り込む。
   - 揺れの吸収: NFKC(全角半角)・小文字・カタカナ→ひらがな・ヶ/ケ・空白と「・」を無視
   - 複数語: スペースで区切った語をすべて含むもの(AND)。語ごとに同義語(SYN)のどれかに当たればよい
   - 否定の文節(「大型犬不可」など)は要点から除いて照合する(規則は索引の neg。索引生成と同じ)
   - 結果は元ページのカードへのリンクだけ(広告リンクは出さない) */
(function () {
  "use strict";
  var INDEX_URL = "assets/search-index.json";
  var PAGE = 40;
  // 言い換え。左の語で探すと、右のどれかを含むものが当たる(すべて norm 前の表記)
  var SYN = {
    // 「レイン」だけにしない(「グレイン」フリーに当たる)
    "レインコート": ["レインコート", "レインウェア", "レインウエア", "レインポンチョ", "レインジャケット", "レインスーツ", "雨具", "カッパ", "合羽"],
    "カッパ": ["カッパ", "合羽", "レインコート", "レインウェア", "レインウエア", "レインポンチョ"],
    "雨具": ["雨具", "カッパ", "合羽", "レインコート", "レインウェア", "レインポンチョ"],
    // 酔い止めの用品は載せていないので、車移動を楽にする用品(ドライブボックス・シートなど)へ
    "車酔い": ["車酔い", "乗り物酔い", "酔い止め", "車移動"],
    "添い寝": ["添い寝"],
    "ドッグラン": ["ドッグラン", "ラン付", "専用ラン"],
    "おむつ": ["おむつ", "オムツ", "マナーウェア", "マナーパンツ", "マナーベルト", "マナーパッド"],
    "マナーパンツ": ["マナーパンツ", "マナーウェア", "おむつ"],
    "キャリー": ["キャリー", "スリング", "ペットカート"],
    "ケージ": ["ケージ", "ゲージ", "クレート", "サークル"],
    "ハーネス": ["ハーネス", "胴輪"],
    "リード": ["リード"],
    "温泉": ["温泉", "露天風呂"],
    "シニア": ["シニア", "高齢", "老犬", "介護", "7歳以上", "11歳以上", "13歳以上"],
    "子犬": ["子犬", "パピー", "幼犬"],
    "大型犬": ["大型犬", "大型"],
    "多頭": ["多頭", "2頭", "3頭", "複数頭"]
  };

  var $ = function (id) { return document.getElementById(id); };
  var form = $("sx-form"), input = $("sx-q"), status = $("sx-status"), list = $("sx-results"),
      more = $("sx-more"), empty = $("sx-empty"), emptyOther = $("sx-empty-other"), examples = $("sx-examples"),
      typeField = $("sx-type-field"), typeBtns = [].slice.call(document.querySelectorAll("#sx-types button"));

  var data = null, rows = null, loading = null, types = [], pages = [];
  var activeType = "", hits = [], shown = 0, timer = 0;

  function norm(s) {
    return String(s || "").normalize("NFKC").toLowerCase()
      .replace(/[ァ-ヶ]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0x60); })
      .replace(/ゖ/g, "け").replace(/ゕ/g, "か")
      .replace(/[\s・･]+/g, "");
  }

  function load() {
    if (loading) return loading;
    status.textContent = "索引を読み込んでいます…";
    loading = fetch(INDEX_URL, { credentials: "same-origin" })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (d) {
        data = d; types = d.types; pages = d.pages;
        var neg = new RegExp("[^。、．，,;；!！?？／/]*(?:" + d.neg + ")[^。、．，,;；!！?？／/]*", "g");
        // 要点は途中で切ってある(…)。切れた最後の文節は後ろに「不可」があったかもしれないので照合に使わない
        var cut = /[^。、．，,;；!！?？／/]*…$/;
        rows = d.items.map(function (it, i) {
          // 照合用: [名前, 地域・商品名, タグ, 要点(否定の文節を除く), 地域の別名, 説明文]
          return { i: i, it: it, f: [norm(it[1]), norm(it[2]), norm(it[4]), norm(String(it[3]).replace(cut, "").replace(neg, " ")), norm(it[6]), norm(it[7])] };
        });
        return d;
      })
      .catch(function () {
        loading = null;
        document.body.classList.remove("sx-wait");
        status.textContent = "索引を読み込めませんでした。通信状態を確かめて、もう一度入力してください。";
        throw new Error("index");
      });
    return loading;
  }

  // 語ごとに { src: 入力した語, raw: 言い換えを含む表記, n: 照合用(norm 後) }
  function terms(q) {
    return String(q || "").split(/[\s\u3000]+/).filter(Boolean).map(function (w) {
      var key = Object.keys(SYN).filter(function (k) { return norm(k) === norm(w); })[0];
      var raw = (key ? SYN[key] : [w]).filter(function (x) { return norm(x); });
      return raw.length ? { src: w, raw: raw, n: raw.map(norm) } : null;
    }).filter(Boolean);
  }

  function hit1(row, w) {
    for (var f = 0; f < row.f.length; f++) if (row.f[f].indexOf(w) >= 0) return true;
    return false;
  }

  var WEIGHT = [8, 4, 4, 2, 3, 1];  // 名前・地域/商品名・タグ・要点・地域の別名・説明文
  // 点数と、画面に出ていない欄だけで当たった語(why: 別名で当たった語 / note: 説明文を出す)
  function score(row, ts, out) {
    var total = 0;
    out.why = []; out.note = false;
    for (var t = 0; t < ts.length; t++) {
      var best = 0, bestF = -1;
      for (var a = 0; a < ts[t].n.length; a++) {
        var w = ts[t].n[a];
        for (var f = 0; f < 6; f++) {
          var pos = row.f[f].indexOf(w);
          if (pos >= 0) {
            var s = WEIGHT[f] + (f === 0 && pos === 0 ? 2 : 0) - (a ? 0.5 : 0);
            if (s > best) { best = s; bestF = f; }
          }
        }
      }
      if (!best) return 0;
      if (bestF === 4) out.why.push(ts[t].src);
      if (bestF === 5) out.note = true;
      total += best;
    }
    return total;
  }

  function run() {
    if (!rows) return;
    var q = input.value.trim(), ts = terms(q);
    examples.hidden = !!q;
    document.body.classList.toggle("sx-has-q", !!q);  // 語があるときは説明文を隠して結果を上に
    document.body.classList.remove("sx-wait");
    if (!ts.length) {
      hits = []; list.innerHTML = ""; more.hidden = true; empty.hidden = true;
      status.textContent = "全 " + rows.length.toLocaleString() + " 件から探せます。";
      setCounts(null); syncUrl(""); return;
    }
    var all = [];
    for (var i = 0; i < rows.length; i++) {
      var out = {}, s = score(rows[i], ts, out);
      if (s) all.push({ row: rows[i], s: s, why: out.why, note: out.note });
    }
    all.sort(function (a, b) { return b.s - a.s || a.row.i - b.row.i; });
    var counts = types.map(function () { return 0; });
    all.forEach(function (h) { counts[h.row.it[0]]++; });
    setCounts(counts, all.length);
    hits = activeType === "" ? all : all.filter(function (h) { return String(h.row.it[0]) === activeType; });
    list.innerHTML = ""; shown = 0;
    render();
    var label = activeType === "" ? "" : types[+activeType] + "で ";
    // 入力した語そのものは無く、言い換えだけで当たったときは、そう書く
    var via = ts.filter(function (t) { return t.n.length > 1 && !all.some(function (h) { return hit1(h.row, norm(t.src)); }); })
      .map(function (t) { return "「" + t.src + "」をそのまま含むものはないため、" + t.raw.filter(function (x) { return norm(x) !== norm(t.src); }).slice(-1).map(function (x) { return "「" + x + "」"; }).join("") + "などの言い換えで探しました。"; });
    status.textContent = (hits.length ? "「" + q + "」" + label + hits.length.toLocaleString() + " 件" : "「" + q + "」" + label + "0 件") + (all.length && via.length ? " " + via.join(" ") : "");
    empty.hidden = hits.length > 0;
    if (!hits.length && all.length && activeType !== "") {
      emptyOther.hidden = false;
      emptyOther.innerHTML = "";
      var a = document.createElement("a"); a.href = "#"; a.textContent = "種類を「すべて」に戻すと " + all.length + " 件あります";
      a.addEventListener("click", function (e) { e.preventDefault(); setType(""); });
      emptyOther.append(a);
    } else emptyOther.hidden = true;
    syncUrl(q);
  }

  function setCounts(counts, total) {
    typeBtns.forEach(function (b) {
      var t = b.dataset.type, n = b.querySelector(".sx-n");
      if (!counts) { n.textContent = ""; b.disabled = false; b.removeAttribute("aria-label"); return; }
      var c = t === "" ? total : counts[+t];
      n.textContent = c.toLocaleString();
      b.setAttribute("aria-label", b.firstChild.textContent + " " + c + "件");
    });
  }

  function href(it) {
    var page = pages[it[0]], link = it[5];
    if (link.charAt(0) === "#") return page + "#" + encodeURIComponent(link.slice(1));
    var m = link.match(/^\?pick=(.*)$/);
    return m ? page + "?pick=" + encodeURIComponent(m[1]) : page;
  }

  function el(tag, cls, txt) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    return e;
  }

  function render() {
    var frag = document.createDocumentFragment(), end = Math.min(hits.length, shown + PAGE);
    for (var k = shown; k < end; k++) {
      var h = hits[k], it = h.row.it, li = el("li"), a = el("a", "sx-hit");
      a.href = href(it);
      var head = el("span", "sx-hit-head");
      head.append(el("span", "sx-kind", types[it[0]]), el("span", "sx-name", it[1]));
      a.append(head);
      if (it[2] || h.why.length) a.append(el("span", "sx-sub", [it[2]].concat(h.why.map(function (w) { return "「" + w + "」の地域"; })).filter(Boolean).join("・")));
      if (it[3]) a.append(el("span", "sx-point", it[3]));
      if (h.note && it[7]) a.append(el("span", "sx-note-line", it[7]));
      if (it[4]) {
        var tags = el("span", "sx-tags");
        it[4].split("|").forEach(function (t) {
          var cond = /\(条件付き\)$/.test(t);
          tags.append(el("span", cond ? "sx-cond" : "", cond ? t.replace(/\(条件付き\)$/, "・条件付き") : t));
        });
        a.append(tags);
      }
      li.append(a); frag.append(li);
    }
    list.append(frag);
    shown = end;
    var rest = hits.length - shown;
    more.hidden = rest <= 0;
    if (rest > 0) more.textContent = "さらに表示(残り " + rest.toLocaleString() + " 件)";
  }

  function setType(t) {
    activeType = t; typeField.value = t;
    typeBtns.forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.type === t)); });
    if (rows) run(); else load().then(run, function () {});
  }

  function syncUrl(q) {
    try {
      var p = new URLSearchParams();
      if (q) p.set("q", q);
      if (activeType !== "") p.set("type", activeType);
      var s = p.toString();
      history.replaceState(null, "", location.pathname + (s ? "?" + s : ""));
    } catch (e) {}
  }

  function schedule() {
    clearTimeout(timer);
    if (rows) { timer = setTimeout(run, 80); return; }
    load().then(run, function () {});
  }

  // 索引は検索欄に触れたときから読み込む
  ["pointerdown", "focus", "touchstart", "keydown"].forEach(function (ev) {
    input.addEventListener(ev, function () { load().then(function () { if (!input.value.trim()) run(); }, function () {}); }, { once: true, passive: true });
  });
  input.addEventListener("input", schedule);
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    input.blur();  // スマホでキーボードを閉じて結果を見せる
    clearTimeout(timer);
    load().then(run, function () {});
  });
  typeBtns.forEach(function (b) { b.addEventListener("click", function () { setType(b.dataset.type); }); });
  more.addEventListener("click", function () {
    var first = shown;
    render();
    var next = list.children[first];
    if (next) { var a = next.querySelector("a"); if (a) a.focus({ preventScroll: true }); }
  });

  // ?q= / ?type= つきで開いたとき(よく探されている言葉・戻る操作・共有リンク)
  var params = new URLSearchParams(location.search);
  var t0 = params.get("type");
  if (t0 !== null && /^[0-5]$/.test(t0)) {
    activeType = t0; typeField.value = t0;
    typeBtns.forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.type === t0)); });
  }
  if (params.get("q")) {
    input.value = params.get("q");
    load().then(run, function () {});
  }
})();
