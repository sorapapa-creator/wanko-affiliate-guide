// 犬同伴の可否は 3 段階で別々に扱い、混ぜない(コードレビュー 2026-10-03)。vacancy.js・planner.js・tests/ が共用する純粋関数。
//  1) 施設: 掲載宿(data/places.json・宿ページ)はすべて犬同伴可。掲載条件を確認済み
//  2) 客室・プラン: 空室データ(data/vacancy/<日付>.json)の plans を pet(犬対応プラン) / no(ペット不可の記載) / unknown(一般客室、同伴可否は未確認)に分類
//  3) 空室: 取得時刻 scanned_at から 24 時間以内だけ表示(楽天の利用条件)
// ブラウザでは window.VacancyRules、node では module.exports(依存なし)。
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.VacancyRules = factory();
})(typeof self !== "undefined" ? self : this, function () {
  const VALID_MS = 24 * 3600 * 1000;
  // 否定語があれば API の pet フラグより優先(「ペット同伴無し」対策 2026-10-03)。「無(?!料)」で「ペット無料」は否定にしない
  const PET_NEG = /(ペット|愛犬|わんこ|ワンちゃん|わんちゃん|犬)[^。]{0,8}(不可|NG|ＮＧ|禁止|お断り|ご遠慮|なし|無し|無(?!料)|以外)|(不可|NG|ＮＧ)[^。]{0,4}(ペット|犬)/;
  const petClass = (p) => (PET_NEG.test(`${(p && p.plan) || ""} ${(p && p.room) || ""}`) ? "no" : p && p.pet ? "pet" : "unknown");

  // ---- 犬の大きさ・頭数(2026-10-04 dot・Codex の実地テストで除外漏れ: 「1部屋2頭まで」「大型犬不可」「小型〜中型の客室」)
  const Z2H = (s) => String(s || "").replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).replace(/ｋｇ/g, "kg");
  const KN = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6 };
  const SIZE_ORDER = { small: 1, medium: 2, large: 3 };
  const SIZE_LABEL = { small: "小型犬", medium: "中型犬", large: "大型犬" };
  // 頭数の上限を大きさ別に読む: 「小型犬3頭、中型・大型犬2頭まで」→ small 3 / medium 2 / large 2。大きさの書いていない上限は any。
  // 文(。まで)の中に「まで・以内・以下・最大・／室」があるときだけ上限とみなす。「1頭目」「2頭まで無料」「1頭あたり」は料金なので除く
  const countLimits = (t) => {
    const out = { small: null, medium: null, large: null, any: null };
    for (const sent of t.split("。")) {
      if (!/まで|以内|以下|最大|[／/](室|部屋|棟)|のみ/.test(sent)) continue;
      if (/頭数[^。]{0,6}制限(なし|無し|はありません)/.test(sent)) continue;
      let prev = 0;
      for (const m of sent.matchAll(/([1-9一二三四五六])\s*(?:頭|匹)(?!目|あたり|につき|以上)(?!\s*まで無料)/g)) {
        const n = KN[m[1]] || Number(m[1]); const back = sent.slice(prev, m.index); prev = m.index + m[0].length;
        // 料金の区切り(「、」まで)の中の数は上限ではない(「4匹目から1匹+2,000円」「3匹までは料金無料」。dot 指摘 2026-10-04)
        const cs = Math.max(sent.lastIndexOf("、", m.index), sent.lastIndexOf("，", m.index)) + 1; let ce = sent.slice(m.index).search(/[、，]/);  // 半角カンマは金額(2,000)にも使うので区切りにしない ce = ce < 0 ? sent.length : m.index + ce;
        if (/(料金|円|無料|追加)/.test(sent.slice(cs, ce))) continue;
        const sz = []; if (/小型|小[・〜~～]/.test(back)) sz.push("small"); if (/中型|中[・〜~～]|[〜~～]中/.test(back)) sz.push("medium"); if (/大型/.test(back) && !/超大型/.test(back.replace(/大型/, ""))) sz.push("large");
        if (/小[・〜~～][^。]{0,4}大型|小型[〜~～]超大型|合計/.test(back)) { out.any = Math.max(out.any || 0, n); continue; }
        if (!sz.length) { out.any = Math.max(out.any || 0, n); continue; }
        for (const k of sz) out[k] = Math.max(out[k] || 0, n);  // 施設段階なので、客室ごとに違うときは最も多い上限(客室は予約時に確認)
      }
    }
    return out;
  };
  // 掲載情報の「対象犬・頭数」から上限を読む。読めないものは null(要確認として扱い、除外しない)
  const dogLimits = (place) => {
    const f = (place && place.facts) || {};
    const key = Object.keys(f).find((k) => /対象犬|頭数/.test(k));
    // 姉妹施設・系列の案内の括弧書き(「(姉妹施設『わんpaina』のレフア棟などが大型犬対応)」)はこの宿の条件ではないので読まない(cx-20261013-1)
    const t = Z2H(key ? f[key] : "").replace(/[（(][^（）()]*(姉妹|系列|グループ|近隣|別施設)[^（）()]*[）)]/g, "");
    const out = { dogsBySize: null, maxSize: null, maxKg: null, kgSoft: false, largeRoomOnly: false, mediumAsk: false };
    out.dogsBySize = countLimits(t);
    // 「大型犬は対応外」も否定(cx-20261013-1 でコトマル。わんship が大型犬の検索に出た)。「超大型犬は不可」は大型犬不可ではない
    const largeNg = /(?<!超)大型犬[^。]{0,6}(不可|NG|対象外|対応外|お断り|ご遠慮|受け入れ(でき|て)(い)?ません)/.test(t);
    const largeOk = !largeNg && (/大型犬[^。]{0,4}(歓迎|可|OK|対応(?!外|不可|して(い)?ません)|まで|も)/.test(t) || /(大きさ|サイズ|犬種)[^。]{0,12}制限(なし|無し|はありません)|超大型犬?[^。]{0,4}(まで|可|OK)/.test(t));
    // 「小型犬。」「小型・中型犬。」のように、文が受け入れる大きさの列挙だけのとき(cx-20261013-1 でフォレスト(つくば)が大型犬の検索に出た)
    const listed = t.split("。").map((s) => s.replace(/[（(][^）)]*[）)]/g, "").trim()).find((s) => /^(小型|中型|大型)犬?([・、と](小型|中型|大型)犬?)*$/.test(s));
    out.largeRoomOnly = !largeNg && /大型犬は[^。]{0,24}(のみ|限定)/.test(t);
    if (largeOk || out.largeRoomOnly || (listed && /大型/.test(listed))) out.maxSize = "large";
    else if (largeNg || (listed && /中型/.test(listed)) || /中型犬?まで|小型・中型犬?(対象|のみ|まで|可)|小型犬・中型犬(対象|のみ|まで|可)|小型[〜~～]中型/.test(t)) out.maxSize = "medium";
    else if (listed || (/小型犬(のみ|限定|専用)|小型犬[^。]{0,12}[1-9一二三]\s*(頭|匹)まで/.test(t) && !/中型犬[^。]{0,8}(可|OK|まで|対象|歓迎)/.test(t))) {
      out.maxSize = "small"; out.mediumAsk = /中型犬?以上[^。]{0,10}(問い合わせ|相談|確認)/.test(t);
    }
    // 「15kg程度まで」(目安)も体重上限として読む(cx-20261013-1 で別邸 山風木が大型犬の検索に出た)。目安の書き方は kgSoft
    const kgm = [...t.matchAll(/(\d+(?:\.\d+)?)\s*(?:kg|キロ)\s*(程度|前後|くらい|ぐらい|位|目安)?\s*(?:まで|以下|未満)/g)];
    const kg = kgm.map((m) => Number(m[1]));
    if (kg.length) { out.maxKg = Math.max(...kg); out.kgSoft = kgm.some((m) => m[2] && Number(m[1]) === out.maxKg); }
    else if (!key) { const h = (place && place.dog_hints) || {}; if ((h.weight_limit_kg_mentions || []).length) out.maxKg = Math.min(...h.weight_limit_kg_mentions); }
    // 自動抽出の目印(dog_hints)は「対象犬・頭数」の記載が無いときだけ使う(「大型犬歓迎。小型犬のみは事前相談」を小型犬限定と読む誤りがあった)
    // 大きさ別の頭数が書いてあれば、その大きさは受け入れている(「大型犬は最大1頭」)
    const bySz = out.dogsBySize;
    if (bySz.large != null && !largeNg) out.maxSize = "large";
    else if (bySz.medium != null && (!out.maxSize || out.maxSize === "small")) out.maxSize = "medium";
    if (!key && !out.maxSize && place && place.dog_hints && place.dog_hints.small_dog_only_mention) out.maxSize = "small";
    return out;
  };
  // 宿(施設)段階の判定。{ ng, notes }。size は small|medium|large、dogs は頭数
  const dogFit = (place, size, dogs) => {
    const L = dogLimits(place); const notes = []; let ng = false;
    if (size && L.maxSize && SIZE_ORDER[size] > SIZE_ORDER[L.maxSize]) {
      ng = true; notes.push(L.maxSize === "small" ? `小型犬のみの記載あり${L.mediumAsk ? "(中型犬以上は宿へ問い合わせ)" : ""}` : `${SIZE_LABEL[L.maxSize]}までの記載あり`);
    }
    if (!ng && L.maxKg != null) {
      const kgLabel = `体重${L.maxKg}kg${L.kgSoft ? "程度" : ""}までの記載あり`;
      if (size === "large" && L.maxKg < 25) { ng = true; notes.push(kgLabel); }
      else if (size === "medium" && L.maxKg < 10) { ng = true; notes.push(kgLabel); }
      else if (size === "medium" && L.maxKg <= 15) notes.push(`体重${L.maxKg}kgまで(体重を予約前に確認)`);
    }
    const lim = L.dogsBySize[size] != null ? L.dogsBySize[size] : L.dogsBySize.any;
    if (dogs && lim != null && dogs > lim) { ng = true; notes.push(`${L.dogsBySize[size] != null ? SIZE_LABEL[size] + "は" : ""}${lim}頭までの記載あり`); }
    if (size === "large" && L.largeRoomOnly) notes.push("大型犬は対応客室のみ(予約時に客室を確認)");
    return { ng, notes, limits: L };
  };
  // 客室・プラン段階: プラン名・客室名に書かれた大きさ・頭数の制限が、今回の犬に合うか
  const planFits = (p, dog) => {
    if (!dog) return true;
    const t = Z2H(`${(p && p.plan) || ""} ${(p && p.room) || ""}`);
    if (dog.size === "large" && /小型[〜~～・、]?中型|小型犬?・中型犬|小型犬(のみ|専用|限定|向け)|中型犬まで|大型犬[^。]{0,4}(不可|NG|対象外|対応外|お断り)/.test(t)) return false;
    if (dog.size === "medium" && /小型犬(のみ|専用|限定)|超小型/.test(t)) return false;
    const m = t.match(/([1-9一二三])\s*(?:頭|匹)\s*(?:まで|限定)/);
    if (m && dog.dogs && dog.dogs > (KN[m[1]] || Number(m[1]))) return false;
    return true;
  };

  // ---- 犬の条件の照合(cx-20261013-1 2026-10-13): 空室検索の判定・カードの本文・バッジを、すべてこの結果から作る。
  // 根拠は data/dog_rules.json(宿カードの公式の一律の上限・根拠 URL・確認日。tools/build_dog_conditions.py が生成)。
  //  fit   = 公式の一律の条件で照合でき、今回の犬が範囲内(厳密な検索の一覧に出すのはこれだけ)
  //  check = 要確認(一律の上限が書かれていない・目安の書き方・客室/棟/料金区分で条件が分かれる・入力が足りない)
  //  ng    = 条件外の記載あり
  // 本文の読み取り(dogFit)と保留中の人手見直し値(reviewed.proposed)は、ng の判定と理由にだけ使い、fit にはしない(キーワードで適合を推測しない)
  const SIZE_KG = { small: [0, 10], medium: [10, 25], large: [25, Infinity] };  // フォームの「小型(〜10kg)・中型(〜25kg)・大型(25kg〜)」
  const VERDICT_LABEL = { fit: "公式の条件の範囲内", check: "要確認", ng: "条件外の記載あり" };
  const ruleDate = (r) => [r.checked_at, ...(((r.reviewed || {}).note || "").match(/checked_at=\d{4}-\d{2}-\d{2}/g) || []).map((s) => s.slice(11))].filter(Boolean).sort().pop() || "";
  const dogVerdict = (rule, place, dog) => {
    const d = dog || {}; const size = SIZE_KG[d.size] ? d.size : ""; const dogs = Math.max(1, Number(d.dogs) || 1); const kg = Number(d.kg) > 0 ? Number(d.kg) : 0;
    const r = rule || { mode: "unknown" }; const src = { url: r.source_url || "", date: ruleDate(r) };
    const ng = [], check = [], ok = [];
    const add = (list, s) => { if (s && !list.includes(s)) list.push(s); };
    if (r.mode !== "uniform") {
      const pr = r.reviewed && r.reviewed.proposed && r.reviewed.proposed.mode === "uniform" ? r.reviewed.proposed : null;
      if (pr) { const v = dogVerdict(pr, null, d); if (v.status === "ng") v.reasons.forEach((s) => add(ng, s)); }
      const t = place ? dogFit(place, size, dogs) : { ng: false, notes: [] };
      if (t.ng) t.notes.forEach((s) => add(ng, `掲載情報に${s.replace(/の記載あり$/, "")}の記載`));
      if (ng.length) return { status: "ng", reasons: ng, ok, src };
      add(check, r.mode === "manual" ? "公式の犬の条件が客室・棟・料金区分などで分かれるため、一律の上限として照合できません" : "公式に犬の大きさ・体重・頭数の一律の条件が見つかっていません");
      t.notes.forEach((s) => add(check, s));
      return { status: "check", reasons: check, ok, src };
    }
    const unl = r.unlimited || [];
    const over = (list, s) => add(r.soft ? check : list, r.soft ? `${s}(公式は「程度」など目安の書き方のため宿に相談)` : s);
    if (r.sizes && size) {
      if (r.sizes.includes(size)) add(ok, `${SIZE_LABEL[size]}は公式の対象`);
      else add(ng, `公式の対象は${r.sizes.map((s) => SIZE_LABEL[s]).join("・")}で、${SIZE_LABEL[size]}は対象外`);
    }
    if (r.max_kg != null) {
      const lim = `${r.max_kg}kg${r.soft ? "程度" : r.kg_inclusive ? "以下" : "未満"}`;
      const exceeds = (w) => (r.kg_inclusive || r.soft ? w > r.max_kg : w >= r.max_kg);
      if (kg) { if (exceeds(kg)) over(ng, `体重${kg}kgは公式の上限(${lim})を超えます`); else add(ok, `体重${kg}kgは公式の上限(${lim})以内`); }
      else if (size) {
        const [lo, hi] = SIZE_KG[size];
        const allOver = size === "large" ? exceeds(lo) : r.max_kg <= lo;  // 中型は 10kg 超、大型は 25kg 以上
        if (allOver) over(ng, `公式の体重の上限(${lim})を${SIZE_LABEL[size]}(${size === "large" ? "25kg〜" : `〜${hi}kg`})は超えます`);
        else if (hi !== Infinity && !exceeds(hi)) add(ok, `${SIZE_LABEL[size]}(〜${hi}kg)は公式の体重の上限(${lim})以内`);
        else add(check, `公式の体重の上限は${lim}。体重を入れると照合します`);
      }
    }
    if (!r.sizes && r.max_kg == null) {
      if (unl.includes("max_kg")) add(ok, "大きさ・体重の制限なしと公式に記載");
      else add(check, "公式に大きさ・体重の一律の条件が書かれていません");
    }
    if (r.max_dogs != null) {
      if (dogs > r.max_dogs) over(ng, `${dogs}頭は公式の上限(${r.max_dogs}頭まで)を超えます`); else add(ok, `${dogs}頭は公式の上限(${r.max_dogs}頭まで)以内`);
    } else if (dogs > 1) {
      if (unl.includes("max_dogs")) add(ok, "頭数の制限なしと公式に記載"); else add(check, `${dogs}頭で泊まれるか(頭数の上限)は公式に書かれていません`);
    }
    const status = ng.length ? "ng" : check.length ? "check" : "fit";
    return { status, reasons: status === "ng" ? ng : check, ok, src };
  };

  // 客室・プラン段階の集計(宿単位)。pet / unknown / no の件数と、表示対象(no 以外)の配列。dog を渡すと大きさ・頭数が合わないプランを misfit として除く
  const planCounts = (plans, dog) => {
    const c = { pet: 0, unknown: 0, no: 0, misfit: 0, shown: [], petPlans: [], unknownPlans: [] };
    for (const p of plans || []) {
      const k = petClass(p);
      if (k === "no") { c.no++; continue; }
      if (!planFits(p, dog)) { c.misfit++; continue; }
      c[k]++; c.shown.push(p); (k === "pet" ? c.petPlans : c.unknownPlans).push(p);
    }
    c.onlyUnknown = c.pet === 0 && c.unknown > 0;  // 空いているのが同伴可否未確認の客室だけ → 予約前に宿へ確認
    return c;
  };

  // 空室データの検証: 条件(日付・人数・1 泊)の一致と取得後 24 時間以内。問題があれば理由の文字列、なければ ""。now はテスト用
  // 空室データの状態を分けて返す(W01・cx-20261024-2)。validate の判定基準・文言はこれまでどおり(validate は message を返す)
  //  code: ok / missing_date(その日のデータなし・条件の違うデータ) / unknown_timestamp(取得時刻が不明・不正) / expired(取得から 24 時間超)
  const check = (data, cond, now) => {
    const t0 = Number.isFinite(now) ? now : Date.now();
    const r = (code, message) => ({ code, message });
    if (!data || !data.hotels) return r("missing_date", "空室データがありません");
    if (cond && cond.checkin && data.checkin !== cond.checkin) return r("missing_date", "空室データの日付が条件と一致しません");
    if (cond && cond.adults && Number(data.adults || 2) !== Number(cond.adults)) return r("missing_date", "空室データの人数が条件と一致しません");
    const nights = Math.round((Date.parse(data.checkout) - Date.parse(data.checkin)) / 86400000);
    if (nights !== 1) return r("missing_date", "空室データは 1 泊の条件のみです");
    const fresh = freshness(data.scanned_at, t0);
    if (fresh !== "ok") return r(fresh === "future" ? "unknown_timestamp" : fresh, FRESH_MESSAGE[fresh]);
    return r("ok", "");
  };
  const FRESH_MESSAGE = { unknown_timestamp: "空室データの取得時刻が不明です", future: "空室データの取得時刻が不正です", expired: "空室データが取得から 24 時間を超えたため表示しません" };
  // 取得時刻だけの判定(日付の一覧でも使う)。future(1 時間超の未来)は unknown_timestamp の一種として扱う
  const freshness = (scannedAt, now) => {
    const t0 = Number.isFinite(now) ? now : Date.now();
    const t = Date.parse(String(scannedAt) + "+09:00");
    if (!Number.isFinite(t)) return "unknown_timestamp";
    if (t0 - t > VALID_MS) return "expired";
    if (t > t0 + 3600 * 1000) return "future";
    return "ok";
  };
  const validate = (data, cond, now) => {
    const c = check(data, cond, now);
    return c.message;
  };
  // 状態ごとの見出しと本文。どれも「満室」とは言わない(空室を確認できていないだけ、と書く)
  const VACANCY_STATES = ["ok", "expired", "missing_date", "fetch_error", "no_match", "unknown_timestamp"];
  const STATE_TEXT = {
    expired: { title: "この日程の空室を、いま確認できません", body: "空室情報の更新が必要なため、古い空室・料金は表示していません。犬の同伴条件から宿を比較し、空室は予約先で確認できます。" },
    unknown_timestamp: { title: "この日程の空室を、いま確認できません", body: "空室情報をいつ取得したか確かめられないため、空室・料金は表示していません。犬の同伴条件から宿を比較し、空室は予約先で確認できます。" },
    missing_date: { title: "この日の空室データはありません", body: "空室は、次の週末と祝前日の 1 泊(大人 2 名・4 名)だけを毎晩調べています。この日・この人数は調べていないため、空室は表示できません(満室という意味ではありません)。宿は犬の同伴条件から比較し、空室は予約先で確認できます。" },
    fetch_error: { title: "空室データを読み込めませんでした", body: "通信がうまくいかず、空室を確認できていません(満室という意味ではありません)。電波の届く場所で「空室情報を再読み込み」を押してください。" },
    no_match: { title: "この条件に合う空室のある宿は 0 件でした", body: "新しい空室データで探した結果です。満室とは限りません。予算・添い寝・「犬対応プランの空室がある宿だけ」の条件をゆるめるか、別の日を選んでください。" },
  };
  const stateOf = (code) => (code === "future" ? "unknown_timestamp" : code);

  const fmtWhen = (iso) => (iso ? String(iso).replace("T", " ").slice(0, 16) : "");
  // 3 段階の状態を 1 行ずつ(体言止め)。{ label, text, warn } の配列。vacancy.js と planner.js が同じ文言で出す
  const statusLines = (counts, scannedAt) => {
    const c = counts || planCounts([]);
    const room = c.pet || c.unknown
      ? `犬対応プラン ${c.pet} 件 / 一般客室 ${c.unknown} 件(犬同伴の可否は未確認)${c.no ? `・ペット不可の記載 ${c.no} 件は非表示` : ""}${c.misfit ? `・犬の大きさ・頭数が合わない記載 ${c.misfit} 件は非表示` : ""}`
      : c.misfit ? `今回の犬の大きさ・頭数に合う空室なし(合わない記載 ${c.misfit} 件)` : "空室なし(ペット不可の記載のみ)";
    return [
      { label: "施設", text: "犬同伴可(掲載条件を確認済み)", warn: false },
      { label: "客室・プラン", text: room, warn: c.onlyUnknown },
      { label: "空室", text: `楽天トラベル取得 ${fmtWhen(scannedAt)}・取得時点の情報。現在は予約先で確認`, warn: false },
    ];
  };
  const ONLY_UNKNOWN_WARN = "取得時点では犬同伴の可否が未確認の客室のみです。現在の空室と犬同伴の可否は予約先で確認してください";

  return { VALID_MS, PET_NEG, petClass, dogLimits, dogFit, dogVerdict, VERDICT_LABEL, SIZE_KG, planFits, planCounts, validate, check, freshness, stateOf, VACANCY_STATES, STATE_TEXT, fmtWhen, statusLines, ONLY_UNKNOWN_WARN };
});
