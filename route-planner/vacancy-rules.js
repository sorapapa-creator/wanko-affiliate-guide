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

  // 客室・プラン段階の集計(宿単位)。pet / unknown / no の件数と、表示対象(no 以外)の配列
  const planCounts = (plans) => {
    const c = { pet: 0, unknown: 0, no: 0, shown: [], petPlans: [], unknownPlans: [] };
    for (const p of plans || []) {
      const k = petClass(p); c[k]++;
      if (k === "no") continue;
      c.shown.push(p); (k === "pet" ? c.petPlans : c.unknownPlans).push(p);
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
      ? `犬対応プラン ${c.pet} 件 / 一般客室 ${c.unknown} 件(犬同伴の可否は未確認)${c.no ? `・ペット不可の記載 ${c.no} 件は非表示` : ""}`
      : "空室なし(ペット不可の記載のみ)";
    return [
      { label: "施設", text: "犬同伴可(掲載条件を確認済み)", warn: false },
      { label: "客室・プラン", text: room, warn: c.onlyUnknown },
      { label: "空室", text: `楽天トラベル取得 ${fmtWhen(scannedAt)}(24 時間以内)`, warn: false },
    ];
  };
  const ONLY_UNKNOWN_WARN = "この条件で空いているのは犬同伴の可否が未確認の客室だけです。予約前に宿へ確認してください";

  return { VALID_MS, PET_NEG, petClass, planCounts, validate, fmtWhen, statusLines, ONLY_UNKNOWN_WARN };
});
