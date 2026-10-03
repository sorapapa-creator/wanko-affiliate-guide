// 旅行プラン(route-planner/planner.js)の日付・時刻の純粋関数テスト。JST の日付境界、帰る日の選択肢、泊数。依存なし。実行: node tests/planner-logic.test.js
// 対象は route-planner/planner-dates.js(planner.js が window.PlannerDates として読む)。営業時間の照合(hours.js)は別ブランチで作成中のため未収録
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const D = require("../route-planner/planner-dates.js");

let n = 0, failed = 0;
const test = (name, fn) => { n++; try { fn(); console.log(`ok ${n} - ${name}`); } catch (e) { failed++; console.log(`not ok ${n} - ${name}\n  ${String(e.message || e).split("\n").join("\n  ")}`); } };
const Z = (iso) => new Date(iso);                 // UTC の ISO 文字列 → Date
const J = (ymdhm) => new Date(`${ymdhm}:00+09:00`); // "2026-10-03T23:30" を JST として Date に

// ---- JST の日付境界(UTC 15:00 = JST 0:00)
test("jst: UTC 14:59:59 は同じ日の 23:59、UTC 15:00:00 は翌日の 0:00", () => {
  assert.deepEqual(D.jst(Z("2026-10-03T14:59:59Z")), { y: 2026, mo: 10, d: 3, h: 23, mi: 59, wd: 6 });
  assert.deepEqual(D.jst(Z("2026-10-03T15:00:00Z")), { y: 2026, mo: 10, d: 4, h: 0, mi: 0, wd: 0 });
});
test("jstYmd / jstMd: UTC 15:00 の前後で日付と曜日が変わる", () => {
  assert.equal(D.jstYmd(Z("2026-10-03T14:59:59Z")), "2026-10-03"); assert.equal(D.jstMd(Z("2026-10-03T14:59:59Z")), "10/3(土)");
  assert.equal(D.jstYmd(Z("2026-10-03T15:00:00Z")), "2026-10-04"); assert.equal(D.jstMd(Z("2026-10-03T15:00:00Z")), "10/4(日)");
});
test("jstMidnight: その日の JST 0:00 = 前日 15:00Z。0:00 ちょうどと 23:59 で同じ値、二度かけても変わらない", () => {
  const mid = Z("2026-10-02T15:00:00Z");
  assert.equal(D.jstMidnight(J("2026-10-03T00:00")).getTime(), mid.getTime());
  assert.equal(D.jstMidnight(J("2026-10-03T23:59")).getTime(), mid.getTime());
  assert.equal(D.jstMidnight(Z("2026-10-02T14:59:59Z")).getTime(), Z("2026-10-01T15:00:00Z").getTime());  // 直前の 1 秒は前日
  assert.equal(D.jstMidnight(D.jstMidnight(J("2026-10-03T12:34"))).getTime(), mid.getTime());
});
test("月末: 10/31 23:59 JST → 10-31、11/1 0:00 JST → 11-01", () => {
  assert.equal(D.jstYmd(Z("2026-10-31T14:59:59Z")), "2026-10-31");
  assert.equal(D.jstYmd(Z("2026-10-31T15:00:00Z")), "2026-11-01");
  assert.equal(D.jstYmd(D.jstMidnight(Z("2026-10-31T15:00:00Z"))), "2026-11-01");
});
test("年末: 12/31 23:59 JST → 2026-12-31、1/1 0:00 JST → 2027-01-01(金)", () => {
  assert.equal(D.jstYmd(Z("2026-12-31T14:59:59Z")), "2026-12-31");
  assert.equal(D.jstYmd(Z("2026-12-31T15:00:00Z")), "2027-01-01");
  assert.equal(D.jstMd(Z("2026-12-31T15:00:00Z")), "1/1(金)");
  assert.equal(D.jstMidnight(Z("2026-12-31T15:00:00Z")).getTime(), Z("2026-12-31T15:00:00Z").getTime());
});
test("うるう日: 2028-02-29 は存在し、2027 は 2/28 の翌日が 3/1", () => {
  assert.equal(D.jstYmd(Z("2028-02-28T15:00:00Z")), "2028-02-29");
  assert.equal(D.jstYmd(Z("2028-02-29T15:00:00Z")), "2028-03-01");
  assert.equal(D.jstYmd(Z("2027-02-28T15:00:00Z")), "2027-03-01");
  assert.equal(D.jstYmd(D.jstMidnight(J("2028-02-29T23:30"))), "2028-02-29");
  assert.equal(D.jstYmd(D.tripDayDate(J("2028-02-28T08:00"), 2)), "2028-02-29");
});
test("fmtClock / hhmm / isoJST: JST 表示(fmtClock は時を 0 埋めしない、hhmm は 0 埋め)", () => {
  const t = Z("2026-10-02T23:05:00Z");  // JST 10/3 8:05
  assert.equal(D.fmtClock(t), "8:05"); assert.equal(D.hhmm(t), "08:05");
  assert.equal(D.isoJST(t), "2026-10-03T08:05:00+09:00");
  assert.equal(D.isoJST(Z("2026-10-03T15:00:00Z")), "2026-10-04T00:00:00+09:00");
  assert.equal(D.jstMinutes(t), 8 * 60 + 5);
});
test("端末のタイムゾーンに依存しない(別の TZ で子プロセスを動かしても同じ結果)", () => {
  const script = `const D=require(${JSON.stringify(path.join(__dirname, "..", "route-planner", "planner-dates.js"))});
    const d=new Date("2026-10-03T15:00:00Z");
    console.log(JSON.stringify([D.jstYmd(d), D.fmtClock(d), D.jstMidnight(d).getTime(), D.returnDayChoices(d, 1, true).days[1].label, D.nightsOf("2026-10-03","2026-10-05")]));`;
  const run = (tz) => execFileSync(process.execPath, ["-e", script], { env: { ...process.env, TZ: tz }, encoding: "utf8" }).trim();
  const want = JSON.stringify(["2026-10-04", "0:00", Z("2026-10-03T15:00:00Z").getTime(), "翌日 10/5(月)", 2]);
  for (const tz of ["Asia/Tokyo", "America/Los_Angeles", "UTC", "Pacific/Auckland"]) assert.equal(run(tz), want, `TZ=${tz}`);
});

// ---- 泊数(チェックイン日・チェックアウト日の文字列から)
test("nightsOf: 1 泊・2 泊、チェックアウト未入力は 1 泊", () => {
  assert.equal(D.nightsOf("2026-10-03", "2026-10-04"), 1);
  assert.equal(D.nightsOf("2026-10-03", "2026-10-05"), 2);
  assert.equal(D.nightsOf("2026-10-03", ""), 1);
  assert.equal(D.nightsOf("2026-10-03", undefined), 1);
});
test("nightsOf: 月末・年末・うるう日をまたいでも暦どおり", () => {
  assert.equal(D.nightsOf("2026-10-31", "2026-11-01"), 1);
  assert.equal(D.nightsOf("2026-12-31", "2027-01-01"), 1);
  assert.equal(D.nightsOf("2028-02-28", "2028-03-01"), 2);  // うるう年
  assert.equal(D.nightsOf("2027-02-28", "2027-03-01"), 1);  // 平年
});
test("nightsOf: 同日・逆順は 0・負の値のまま返す(選択肢側で 1 泊に丸める)", () => {
  assert.equal(D.nightsOf("2026-10-03", "2026-10-03"), 0);
  assert.equal(D.nightsOf("2026-10-05", "2026-10-03"), -2);
  assert.equal(D.returnDayChoices(J("2026-10-03T08:00"), 0, true).selected, "2");
  assert.equal(D.returnDayChoices(J("2026-10-03T08:00"), -2, true).selected, "2");
});

// ---- 帰る日の選択肢(出発日を 1 日目、宿ならチェックアウト日を初期選択)
const dep = J("2026-10-03T08:00");  // 10/3(土) 8:00 出発
test("日帰り(宿以外): 到着日を初期選択、選択肢は 4 日分で実日付つき", () => {
  const c = D.returnDayChoices(dep, undefined, false);
  assert.equal(c.selected, "1"); assert.equal(c.nights, 1);
  assert.deepEqual(c.days.map((x) => x.value), ["1", "2", "3", "4"]);
  assert.deepEqual(c.days.map((x) => x.label), ["到着日(日帰り) 10/3(土)", "翌日 10/4(日)", "翌々日 10/5(月)", "3日後 10/6(火)"]);
});
test("1 泊(宿): 翌日を初期選択、選択肢は 4 日分", () => {
  const c = D.returnDayChoices(dep, 1, true);
  assert.equal(c.selected, "2"); assert.equal(c.days.length, 4);
  assert.equal(c.days[1].label, "翌日 10/4(日)");
});
test("2 泊: 翌々日を初期選択、選択肢は 4 日分のまま", () => {
  const c = D.returnDayChoices(dep, 2, true);
  assert.equal(c.selected, "3"); assert.equal(c.days.length, 4);
  assert.equal(c.days[2].label, "翌々日 10/5(月)");
});
test("3 泊以上: 泊数+2 日分まで選択肢が伸びる(3 泊=5 日分、5 泊=7 日分)", () => {
  const c3 = D.returnDayChoices(dep, 3, true);
  assert.equal(c3.selected, "4"); assert.equal(c3.days.length, 5);
  assert.equal(c3.days[3].label, "3日後 10/6(火)"); assert.equal(c3.days[4].label, "4日後 10/7(水)");
  const c5 = D.returnDayChoices(dep, 5, true);
  assert.equal(c5.selected, "6"); assert.equal(c5.days.length, 7);
  assert.equal(c5.days[6].label, "6日後 10/9(金)");
});
test("泊数が不正(0・負・NaN・文字列)なら 1 泊として扱う", () => {
  for (const bad of [0, -1, NaN, "abc", null, undefined, ""]) {
    const c = D.returnDayChoices(dep, bad, true);
    assert.equal(c.nights, 1, `nights=${String(bad)}`); assert.equal(c.selected, "2"); assert.equal(c.days.length, 4);
  }
  assert.equal(D.returnDayChoices(dep, "2", true).selected, "3");  // 文字列の数字は読む
});
test("宿以外は泊数があっても到着日(日帰り)を初期選択。選択肢の本数は泊数に従う", () => {
  const c = D.returnDayChoices(dep, 3, false);
  assert.equal(c.selected, "1"); assert.equal(c.days.length, 5);
});
test("出発が深夜 0:30 JST(前日 15:30Z)でも到着日は JST の日付", () => {
  const c = D.returnDayChoices(Z("2026-10-02T15:30:00Z"), 1, true);  // 10/3 0:30 JST
  assert.equal(c.days[0].label, "到着日(日帰り) 10/3(土)");
  assert.equal(c.days[1].label, "翌日 10/4(日)");
});
test("出発が 23:50 JST でも日付の並びは出発日基準(時刻で繰り上がらない)", () => {
  const c = D.returnDayChoices(J("2026-10-03T23:50"), 1, true);
  assert.deepEqual(c.days.map((x) => x.label), ["到着日(日帰り) 10/3(土)", "翌日 10/4(日)", "翌々日 10/5(月)", "3日後 10/6(火)"]);
});
test("出発が 0:00 JST ちょうど(UTC 15:00)は翌日側の日付", () => {
  const c = D.returnDayChoices(Z("2026-10-02T15:00:00Z"), 1, true);  // 10/3 0:00 JST
  assert.equal(c.days[0].label, "到着日(日帰り) 10/3(土)");
  const c2 = D.returnDayChoices(Z("2026-10-02T14:59:59Z"), 1, true);  // 10/2 23:59:59 JST
  assert.equal(c2.days[0].label, "到着日(日帰り) 10/2(金)");
});
test("年末出発: 翌日は 1/1(金)、翌々日は 1/2(土)", () => {
  const c = D.returnDayChoices(J("2026-12-31T10:00"), 2, true);
  assert.deepEqual(c.days.map((x) => x.label), ["到着日(日帰り) 12/31(木)", "翌日 1/1(金)", "翌々日 1/2(土)", "3日後 1/3(日)"]);
  assert.equal(c.selected, "3");
});
test("dayLabel: 1 以下は到着日、2 翌日、3 翌々日、4 以降は n 日後", () => {
  assert.equal(D.dayLabel(0), "到着日"); assert.equal(D.dayLabel(1), "到着日");
  assert.equal(D.dayLabel(2), "翌日"); assert.equal(D.dayLabel(3), "翌々日");
  assert.equal(D.dayLabel(4), "3日後"); assert.equal(D.dayLabel(7), "6日後");
});

// ---- 何日目か(到着が日をまたぐ深夜便)
test("tripDayIndex: 同日 23:59 は 1 日目、翌 0:00 以降は 2 日目、2 泊後のチェックアウトは 3 日目", () => {
  assert.equal(D.tripDayIndex(dep, J("2026-10-03T23:59")), 1);
  assert.equal(D.tripDayIndex(dep, J("2026-10-04T00:00")), 2);
  assert.equal(D.tripDayIndex(dep, J("2026-10-04T01:30")), 2);  // 深夜到着は「翌日」
  assert.equal(D.tripDayIndex(dep, J("2026-10-05T10:00")), 3);
  assert.equal(D.tripDayIndex(J("2026-10-03T23:50"), J("2026-10-04T00:10")), 2);  // 出発直後に日付が変わっても同じ
});
test("tripDayDate と tripDayIndex は互いに戻る(選択肢の値 → 日付 → 何日目)", () => {
  for (const i of [1, 2, 3, 6]) assert.equal(D.tripDayIndex(dep, D.tripDayDate(dep, i)), i);
  assert.equal(D.tripDayDate(dep, 1).getTime(), D.jstMidnight(dep).getTime());
  assert.equal(D.jstYmd(D.tripDayDate(J("2026-10-31T22:00"), 2)), "2026-11-01");
});

// ---- 時刻文字列まわり(チェックイン・チェックアウト)
test("clockOf: d と同じ JST の日付の hh:mm。深夜 0:30 の日付でも 15:00 はその日の 15:00", () => {
  assert.equal(D.isoJST(D.clockOf(J("2026-10-03T23:50"), "10:00")), "2026-10-03T10:00:00+09:00");
  assert.equal(D.isoJST(D.clockOf(Z("2026-10-02T15:30:00Z"), "15:00")), "2026-10-03T15:00:00+09:00");
  assert.equal(D.isoJST(D.clockOf(J("2026-10-03T08:00"), "24:00")), "2026-10-04T00:00:00+09:00");  // 24:00 は翌日 0:00
});
test("minutesOf: 「15:00」→ 900、「9:30」→ 570、読めない値は null", () => {
  assert.equal(D.minutesOf("15:00"), 900); assert.equal(D.minutesOf("9:30"), 570);
  assert.equal(D.minutesOf("15:00〜"), 900);  // 先頭だけ読む
  assert.equal(D.minutesOf(""), null); assert.equal(D.minutesOf(undefined), null); assert.equal(D.minutesOf("15時"), null);
});
test("fmtDur / addSec: 分に丸め、60 分以上は「n時間mm分」", () => {
  assert.equal(D.fmtDur(29), "0分"); assert.equal(D.fmtDur(90), "2分"); assert.equal(D.fmtDur(59 * 60 + 29), "59分");
  assert.equal(D.fmtDur(3600), "1時間00分"); assert.equal(D.fmtDur(2 * 3600 + 5 * 60), "2時間05分");
  assert.equal(D.addSec(dep, 2 * 3600).getTime(), J("2026-10-03T10:00").getTime());
});

// ---- ブラウザ用の配線(planner.js は window.PlannerDates から読む。index.html は planner.js より前に planner-dates.js を読む)
const RP = path.join(__dirname, "..", "route-planner");
const src = (f) => fs.readFileSync(path.join(RP, f), "utf8");
test("planner-dates.js はブラウザでは window.PlannerDates になり、node の exports と同じ関数名を持つ", () => {
  const win = {};
  new Function("self", "module", src("planner-dates.js")).call(win, win, undefined);
  assert.deepEqual(Object.keys(win.PlannerDates).sort(), Object.keys(D).sort());
  assert.equal(win.PlannerDates.jstYmd(Z("2026-10-03T15:00:00Z")), "2026-10-04");
});
test("planner.js は日付関数を自前で定義せず window.PlannerDates から取り出す。取り出す名前は全部モジュールにある", () => {
  const p = src("planner.js");
  new Function(p);  // 構文
  const m = /const \{([^}]+)\} = window\.PlannerDates;/.exec(p);
  assert.ok(m, "window.PlannerDates の分割代入がある");
  const names = m[1].split(",").map((s) => s.trim()).filter(Boolean);
  for (const nm of names) assert.equal(typeof D[nm], "function", `${nm} がモジュールにない`);
  for (const nm of [...names, "tripDayDate", "JST_MS"]) assert.doesNotMatch(p, new RegExp(`\\bconst ${nm} = `), `${nm} が planner.js 側にも定義されている`);
  assert.match(p, /window\.PlannerDates\.tripDayIndex\(/);
});
test("index.html は planner-dates.js を planner.js より前に読み込む", () => {
  const html = src("index.html");
  const a = html.indexOf('<script src="planner-dates.js'), b = html.indexOf('<script src="planner.js');
  assert.ok(a > 0 && b > a, `planner-dates=${a} planner=${b}`);
});

console.log(`\n${n - failed}/${n} passed`);
if (failed) process.exit(1);
