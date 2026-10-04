// 空室逆算プランの犬可否 3 段階(施設 / 客室・プラン / 空室)の純粋関数テスト。依存なし。実行: node tests/vacancy-logic.test.js
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const R = require("../route-planner/vacancy-rules.js");

let n = 0, failed = 0;
const test = (name, fn) => { n++; try { fn(); console.log(`ok ${n} - ${name}`); } catch (e) { failed++; console.log(`not ok ${n} - ${name}\n  ${String(e.message || e).split("\n").join("\n  ")}`); } };

// ---- 2) 客室・プラン: 否定語は API の pet フラグより優先
test("「ペット同伴無し」は pet フラグがあっても no", () => {
  assert.equal(R.petClass({ plan: "【露天風呂付】ペット同伴無し", room: "和洋室", pet: true }), "no");
});
test("「ペット不可」(客室名)は no", () => {
  assert.equal(R.petClass({ plan: "朝食付プラン", room: "スーペリアツイン(ペット不可)", pet: true }), "no");
});
test("「犬NG」は no", () => {
  assert.equal(R.petClass({ plan: "愛犬同伴OK棟は満室のため 犬NG のお部屋のみ", room: "", pet: true }), "no");
});
test("「ペット無料」は否定ではない(pet フラグどおり pet)", () => {
  assert.equal(R.petClass({ plan: "【ペット無料】わんこと泊まるプラン", room: "ドッグラン付コテージ", pet: true }), "pet");
});
test("「ペット無料」で pet フラグなしなら unknown", () => {
  assert.equal(R.petClass({ plan: "ペット無料キャンペーン", room: "", pet: false }), "unknown");
});
test("否定語なし・pet フラグなしは unknown(一般客室)", () => {
  assert.equal(R.petClass({ plan: "素泊まり", room: "ツイン", pet: false }), "unknown");
  assert.equal(R.petClass({ plan: "素泊まり", room: "ツイン" }), "unknown");
});

// ---- 2) 宿単位の集計
const plans = [
  { plan: "わんこ歓迎プラン", room: "ペットルーム", pet: true, total: 30000 },
  { plan: "わんこ歓迎プラン", room: "ペットルーム(無し)", pet: true, total: 28000 },
  { plan: "スタンダード", room: "和室", pet: false, total: 20000 },
  { plan: "スタンダード", room: "洋室", pet: false, total: 21000 },
];
test("planCounts: pet / unknown / no の件数と表示対象", () => {
  const c = R.planCounts(plans);
  assert.equal(c.pet, 1); assert.equal(c.unknown, 2); assert.equal(c.no, 1);
  assert.equal(c.shown.length, 3); assert.equal(c.petPlans.length, 1); assert.equal(c.unknownPlans.length, 2);
  assert.equal(c.onlyUnknown, false);
});
test("planCounts: 一般客室だけなら onlyUnknown", () => {
  const c = R.planCounts(plans.slice(2));
  assert.equal(c.pet, 0); assert.equal(c.unknown, 2); assert.equal(c.onlyUnknown, true);
});
test("planCounts: ペット不可だけ・空・undefined", () => {
  assert.equal(R.planCounts([plans[1]]).onlyUnknown, false);
  assert.equal(R.planCounts([plans[1]]).shown.length, 0);
  assert.deepEqual(R.planCounts(undefined).shown, []);
  assert.equal(R.planCounts([]).onlyUnknown, false);
});

// ---- 3 段階の表示文(混ぜない)
test("statusLines: 3 行で、施設・客室・プラン・空室が別々", () => {
  const lines = R.statusLines(R.planCounts(plans), "2026-10-02T02:30");
  assert.equal(lines.length, 3);
  assert.equal(lines[0].label, "施設"); assert.equal(lines[0].text, "犬同伴可(掲載条件を確認済み)");
  assert.equal(lines[1].label, "客室・プラン"); assert.match(lines[1].text, /^犬対応プラン 1 件 \/ 一般客室 2 件\(犬同伴の可否は未確認\)/);
  assert.match(lines[1].text, /ペット不可の記載 1 件は非表示/);
  assert.equal(lines[2].label, "空室"); assert.equal(lines[2].text, "楽天トラベル取得 2026-10-02 02:30(24 時間以内)");
  assert.equal(lines[1].warn, false);
});
test("statusLines: 一般客室だけのときは客室・プラン行が警告", () => {
  const lines = R.statusLines(R.planCounts(plans.slice(2)), "2026-10-02T02:30");
  assert.equal(lines[1].warn, true);
  assert.match(lines[1].text, /犬対応プラン 0 件 \/ 一般客室 2 件/);
  assert.equal(lines[0].text, "犬同伴可(掲載条件を確認済み)");  // 施設は変わらない
});
test("ONLY_UNKNOWN_WARN の文言", () => {
  assert.equal(R.ONLY_UNKNOWN_WARN, "この条件で空いているのは犬同伴の可否が未確認の客室だけです。予約前に宿へ確認してください");
});

// ---- 3) 空室: 24 時間の境界
const scanned = "2026-10-02T02:30";  // JST
const scannedMs = Date.parse(scanned + "+09:00");
const data = { checkin: "2026-10-03", checkout: "2026-10-04", scanned_at: scanned, adults: 2, hotels: { x: { plans } } };
test("validate: 取得から 24 時間ちょうどまでは有効", () => {
  assert.equal(R.validate(data, { checkin: "2026-10-03", adults: 2 }, scannedMs + R.VALID_MS), "");
  assert.equal(R.validate(data, null, scannedMs + R.VALID_MS - 1), "");
});
test("validate: 24 時間を 1ms でも超えたら無効", () => {
  assert.equal(R.validate(data, null, scannedMs + R.VALID_MS + 1), "空室データが取得から 24 時間を超えたため表示しません");
});
test("validate: 未来の取得時刻(1 時間超)は不正", () => {
  assert.equal(R.validate(data, null, scannedMs - 3600 * 1000 - 1), "空室データの取得時刻が不正です");
  assert.equal(R.validate(data, null, scannedMs - 3600 * 1000), "");
});
test("validate: 日付・人数・泊数の不一致、取得時刻不明、データなし", () => {
  assert.equal(R.validate(data, { checkin: "2026-10-10" }, scannedMs), "空室データの日付が条件と一致しません");
  assert.equal(R.validate(data, { checkin: "2026-10-03", adults: 4 }, scannedMs), "空室データの人数が条件と一致しません");
  assert.equal(R.validate({ ...data, checkout: "2026-10-05" }, null, scannedMs), "空室データは 1 泊の条件のみです");
  assert.equal(R.validate({ ...data, scanned_at: "" }, null, scannedMs), "空室データの取得時刻が不明です");
  assert.equal(R.validate(null, null, scannedMs), "空室データがありません");
  assert.equal(R.validate({ checkin: "2026-10-03" }, null, scannedMs), "空室データがありません");
});
test("validate: now 省略時は Date.now()", () => {
  assert.equal(R.validate(data, null), "空室データが取得から 24 時間を超えたため表示しません");  // 固定日付のデータは実行時点では古い
});

// ---- ブラウザ用スクリプトの構文と配線(最小の window / document で IIFE を走らせる)
const RP = path.join(__dirname, "..", "route-planner");
const src = (f) => fs.readFileSync(path.join(RP, f), "utf8");
test("vacancy.js / planner.js は構文エラーなし", () => {
  new Function(src("vacancy.js")); new Function(src("planner.js"));
});
test("vacancy.js は window.VacancyRules の関数をそのまま VacancyData に載せる", () => {
  const win = { VacancyRules: R, PLANNER_CONFIG: {} };
  const doc = { getElementById: () => null, addEventListener() {} };
  new Function("window", "document", src("vacancy.js"))(win, doc);
  assert.equal(win.VacancyData.petClass, R.petClass);
  assert.equal(win.VacancyData.validate, R.validate);
  assert.equal(win.VacancyData.planCounts, R.planCounts);
});
test("vacancy-rules.js はブラウザでは window.VacancyRules になる", () => {
  const win = {};
  new Function("self", "module", src("vacancy-rules.js")).call(win, win, undefined);
  assert.equal(typeof win.VacancyRules.petClass, "function");
  assert.equal(win.VacancyRules.petClass({ plan: "ペット不可", pet: true }), "no");
});

// ---- 犬の大きさ・頭数(2026-10-04 dot・Codex の実地テストで見つかった除外漏れ)
const lod = (t) => ({ type: "lodging", facts: { "対象犬・頭数": t } });
test("「1部屋2頭まで」は 3 頭で NG", () => {
  assert.equal(R.dogFit(lod("体重10kg以下の小型犬のみ。1部屋2頭まで(2頭の合計体重10kgまで)。"), "small", 3).ng, true);
  assert.equal(R.dogFit(lod("体重10kg以下の小型犬のみ。1部屋2頭まで(2頭の合計体重10kgまで)。"), "small", 2).ng, false);
});
test("「小型犬(または猫)2匹まで」は 3 頭・中型で NG", () => {
  assert.equal(R.dogFit(lod("小型犬(または猫)2匹まで。中型犬以上は電話で問い合わせ。"), "small", 3).ng, true);
  assert.equal(R.dogFit(lod("小型犬(または猫)2匹まで。中型犬以上は電話で問い合わせ。"), "medium", 1).ng, true);
});
test("大きさ別の頭数: 「小型犬3頭、中型・大型犬2頭まで」", () => {
  const p = lod("小型犬3頭、中型・大型犬2頭までが公式案内の目安。");
  assert.equal(R.dogFit(p, "small", 3).ng, false);
  assert.equal(R.dogFit(p, "large", 3).ng, true);
  assert.equal(R.dogFit(p, "large", 2).ng, false);
});
test("「大型犬・対象外犬種不可」は大型で NG", () => {
  assert.equal(R.dogFit(lod("小型・中型犬対象、大型犬・対象外犬種不可。"), "large", 1).ng, true);
  assert.equal(R.dogFit(lod("小型・中型犬対象、大型犬・対象外犬種不可。"), "medium", 1).ng, false);
});
test("「大型犬歓迎。小型犬のみは事前相談」は大型で OK(自動抽出の目印より本文を優先)", () => {
  const p = { ...lod("大型犬歓迎。小型犬のみは事前相談（繁忙期は不可）。頭数：一律頭数制限なし"), dog_hints: { small_dog_only_mention: true } };
  assert.equal(R.dogFit(p, "large", 3).ng, false);
});
test("料金の「2頭まで無料」「1頭目」は頭数の上限にしない", () => {
  assert.equal(R.dogFit(lod("小型〜中型犬6頭／室、大型犬3頭／室。公式予約は2頭まで無料、3頭目以降1頭あたり2,200円。"), "small", 3).ng, false);
});
test("体重: 「中型犬(10kgまで)」は大型で NG", () => {
  assert.equal(R.dogFit(lod("小型犬(5kgまで)・中型犬(10kgまで)。1棟2頭まで。"), "large", 1).ng, true);
});
test("客室名「小型〜中型のわんちゃんと」は大型犬のとき misfit", () => {
  const c = R.planCounts([{ plan: "素泊まり", room: "小型〜中型のわんちゃんと一緒に", pet: true }, { plan: "ドッグラン付き客室", pet: true }], { size: "large", dogs: 1 });
  assert.equal(c.misfit, 1); assert.equal(c.pet, 1);
  assert.equal(R.planCounts([{ room: "小型〜中型のわんちゃんと一緒に", pet: true }], { size: "small", dogs: 1 }).misfit, 0);
});
test("dog を渡さない planCounts は従来どおり", () => {
  assert.equal(R.planCounts([{ room: "小型犬のみ", pet: true }]).pet, 1);
});

test("料金の文「4匹目から1匹+2,000円」と「超大型犬は不可」を上限にしない(おもちゃばこ)", () => {
  const p = lod("室内犬なら大型犬も可(超大型犬・外飼い犬は不可)。ペット3匹までは料金無料、4匹目から1匹+2,000円(税別)。");
  assert.equal(R.dogFit(p, "small", 3).ng, false);
  assert.equal(R.dogFit(p, "large", 1).ng, false);
});

console.log(`\n${n - failed}/${n} passed`);
if (failed) process.exit(1);
