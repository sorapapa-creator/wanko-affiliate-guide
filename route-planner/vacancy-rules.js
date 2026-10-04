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
        if (/(料金|円|無料)/.test(sent.slice(m.index, m.index + 8))) continue;
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
    const t = Z2H(key ? f[key] : "");
    const out = { dogsBySize: null, maxSize: null, maxKg: null, largeRoomOnly: false, mediumAsk: false };
    out.dogsBySize = countLimits(t);
    const largeNg = /大型犬[^。]{0,6}(不可|NG|対象外|お断り|ご遠慮)/.test(t);
    const largeOk = !largeNg && (/大型犬[^。]{0,4}(歓迎|可|OK|対応|まで|も)/.test(t) || /(大きさ|サイズ|犬種)[^。]{0,12}制限(なし|無し|はありません)|超大型犬?[^。]{0,4}(まで|可|OK)/.test(t));
    out.largeRoomOnly = !largeNg && /大型犬は[^。]{0,24}(のみ|限定)/.test(t);
    if (largeOk || out.largeRoomOnly) out.maxSize = "large";
    else if (largeNg || /中型犬?まで|小型・中型犬?(対象|のみ|まで|可)|小型犬・中型犬(対象|のみ|まで|可)|小型[〜~～]中型/.test(t)) out.maxSize = "medium";
    else if (/小型犬(のみ|限定|専用)|小型犬[^。]{0,12}[1-9一二三]\s*(頭|匹)まで/.test(t) && !/中型犬[^。]{0,8}(可|OK|まで|対象|歓迎)/.test(t)) {
      out.maxSize = "small"; out.mediumAsk = /中型犬?以上[^。]{0,10}(問い合わせ|相談|確認)/.test(t);
    }
    const kg = [...t.matchAll(/(\d+(?:\.\d+)?)\s*(?:kg|キロ)\s*(?:まで|以下|未満)/g)].map((m) => Number(m[1]));
    if (kg.length) out.maxKg = Math.max(...kg);
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
      if (size === "large" && L.maxKg < 25) { ng = true; notes.push(`体重${L.maxKg}kgまでの記載あり`); }
      else if (size === "medium" && L.maxKg < 10) { ng = true; notes.push(`体重${L.maxKg}kgまでの記載あり`); }
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
    if (dog.size === "large" && /小型[〜~～・、]?中型|小型犬?・中型犬|小型犬(のみ|専用|限定|向け)|中型犬まで|大型犬[^。]{0,4}(不可|NG)/.test(t)) return false;
    if (dog.size === "medium" && /小型犬(のみ|専用|限定)|超小型/.test(t)) return false;
    const m = t.match(/([1-9一二三])\s*(?:頭|匹)\s*(?:まで|限定)/);
    if (m && dog.dogs && dog.dogs > (KN[m[1]] || Number(m[1]))) return false;
    return true;
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
  const validate = (data, cond, now) => {
    const t0 = Number.isFinite(now) ? now : Date.now();
    if (!data || !data.hotels) return "空室データがありません";
    if (cond && cond.checkin && data.checkin !== cond.checkin) return "空室データの日付が条件と一致しません";
    if (cond && cond.adults && Number(data.adults || 2) !== Number(cond.adults)) return "空室データの人数が条件と一致しません";
    const nights = Math.round((Date.parse(data.checkout) - Date.parse(data.checkin)) / 86400000);
    if (nights !== 1) return "空室データは 1 泊の条件のみです";
    const t = Date.parse(String(data.scanned_at) + "+09:00");
    if (!Number.isFinite(t)) return "空室データの取得時刻が不明です";
    if (t0 - t > VALID_MS) return "空室データが取得から 24 時間を超えたため表示しません";
    if (t > t0 + 3600 * 1000) return "空室データの取得時刻が不正です";
    return "";
  };

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
      { label: "空室", text: `楽天トラベル取得 ${fmtWhen(scannedAt)}(24 時間以内)`, warn: false },
    ];
  };
  const ONLY_UNKNOWN_WARN = "この条件で空いているのは犬同伴の可否が未確認の客室だけです。予約前に宿へ確認してください";

  return { VALID_MS, PET_NEG, petClass, dogLimits, dogFit, planFits, planCounts, validate, fmtWhen, statusLines, ONLY_UNKNOWN_WARN };
});
