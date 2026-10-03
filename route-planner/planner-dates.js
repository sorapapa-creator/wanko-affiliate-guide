// 旅行プランの日付・時刻の純粋関数。時刻は日本時間(JST)に固定し、ブラウザのタイムゾーンに依存させない
// (海外やクラウドの端末で 08:00 出発が 16:00 と表示され、復路の日付もずれていた不具合の対策)。
// planner.js と tests/planner-logic.test.js が共用。DOM・通信・アフィリエイトには触れない。
// ブラウザでは window.PlannerDates、node では module.exports(依存なし)。
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.PlannerDates = factory();
})(typeof self !== "undefined" ? self : this, function () {
  const JST_MS = 9 * 3600 * 1000;
  const DAY_MS = 86400000;
  // Date → JST の年月日・時分・曜日(0=日)
  const jst = (d) => { const t = new Date(d.getTime() + JST_MS); return { y: t.getUTCFullYear(), mo: t.getUTCMonth() + 1, d: t.getUTCDate(), h: t.getUTCHours(), mi: t.getUTCMinutes(), wd: t.getUTCDay() }; };
  // d と同じ JST の日付の 0:00(JST)を表す Date
  const jstMidnight = (d) => { const j = jst(d); return new Date(Date.UTC(j.y, j.mo - 1, j.d) - JST_MS); };
  const jstYmd = (d) => { const j = jst(d); return `${j.y}-${String(j.mo).padStart(2, "0")}-${String(j.d).padStart(2, "0")}`; };
  const jstMd = (d) => { const j = jst(d); return `${j.mo}/${j.d}(${"日月火水木金土"[j.wd]})`; };
  const fmtClock = (d) => { const j = jst(d); return `${j.h}:${String(j.mi).padStart(2, "0")}`; };
  const hhmm = (d) => { const j = jst(d); return `${String(j.h).padStart(2, "0")}:${String(j.mi).padStart(2, "0")}`; };
  const jstMinutes = (d) => { const j = jst(d); return j.h * 60 + j.mi; };
  const addSec = (d, s) => new Date(d.getTime() + s * 1000);
  const fmtDur = (sec) => {
    const m = Math.round(sec / 60);
    return m >= 60 ? `${Math.floor(m / 60)}時間${String(m % 60).padStart(2, "0")}分` : `${m}分`;
  };
  // Worker には日本時間(+09:00)の形で送る
  const isoJST = (d) => new Date(d.getTime() + JST_MS).toISOString().slice(0, 19) + "+09:00";
  // "15:00" → 900。チェックイン等の時刻文字列用。読めなければ null
  const minutesOf = (hhmmStr) => { const m = /^(\d{1,2}):(\d{2})/.exec(hhmmStr || ""); return m ? +m[1] * 60 + +m[2] : null; };
  // d と同じ日本時間の日付で hh:mm の時刻を作る
  const clockOf = (d, hhmmStr) => { const [h, m] = hhmmStr.split(":").map(Number); return new Date(jstMidnight(d).getTime() + (h * 60 + m) * 60000); };

  // 出発日を 1 日目とした日付の呼び方(1=到着日 / 2=翌日 / 3=翌々日 / 4 以降は n 日後)
  const dayLabel = (i) => (i <= 1 ? "到着日" : i === 2 ? "翌日" : i === 3 ? "翌々日" : `${i - 1}日後`);
  // 出発 dep を 1 日目として i 日目の 0:00(JST)
  const tripDayDate = (dep, i) => new Date(jstMidnight(dep).getTime() + (i - 1) * DAY_MS);
  // 出発 dep を 1 日目として、日時 d が何日目か(到着が日をまたいでも dayLabel と一致)
  const tripDayIndex = (dep, d) => Math.round((jstMidnight(d) - jstMidnight(dep)) / DAY_MS) + 1;

  // 泊数: チェックアウト日が空なら 1 泊(空室データは 1 泊固定のため)。日付文字列は YYYY-MM-DD
  const nightsOf = (checkin, checkout) => (checkout ? Math.round((Date.parse(checkout) - Date.parse(checkin)) / DAY_MS) : 1);
  // 帰る日の選択肢。チェックアウト日(泊数)に連動し、3 泊以上でも実日付で選べるように作る(Codex 指摘 2026-10-03)
  //  dep: 出発日時(Date)、nights: 泊数、isLodging: 行き先が宿か。宿なら泊数+1 日目(チェックアウト日)、宿以外なら到着日(日帰り)を初期選択
  const returnDayChoices = (dep, nights, isLodging) => {
    const nightsSel = Math.max(1, Number(nights) || 1);
    const maxDay = Math.max(4, nightsSel + 2);
    const days = Array.from({ length: maxDay }, (_, k) => k + 1).map((d) => ({ value: String(d), label: `${dayLabel(d)}${d === 1 ? "(日帰り)" : ""} ${jstMd(tripDayDate(dep, d))}` }));
    return { days, selected: isLodging ? String(nightsSel + 1) : "1", nights: nightsSel };
  };

  return { JST_MS, DAY_MS, jst, jstMidnight, jstYmd, jstMd, fmtClock, hhmm, jstMinutes, addSec, fmtDur, isoJST, minutesOf, clockOf, dayLabel, tripDayDate, tripDayIndex, nightsOf, returnDayChoices };
});
