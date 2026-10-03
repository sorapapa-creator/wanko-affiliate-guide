// 営業時間の文章(data/places.json の facts・掲載ページの dl.facts)を構造化し、到着時刻が営業時間内かを判定する純粋関数。
// 「10:00〜17:00」「平日10〜16時、土日祝9〜17時」「10月〜5月 10:00〜16:00」「定休日 水曜」「最終受付16:30」「L.O.16:30」のような
// 明確な表記だけを扱う。曖昧な表記(「季節で変わる」「冬季は短縮」「不定休」だけ等)は推測せず、null か confidence: "medium" にする。
// planner.js(行き先・立ち寄り先の営業時間判定。使うのは confidence: "high" だけ)と tests/hours.test.js が共用。
// ブラウザでは window.WankoHours、node では module.exports(依存なし)。
//
// parse(text) の返り値(曖昧なら null):
//   { open, close,            // 営業時間の幅(複数の時間が並ぶときは一番早い開店〜一番遅い閉店)
//     lastEntry,              // 最終受付・L.O.(無ければ null)
//     closedDays,             // 定休日の曜日番号(0=日 … 6=土)。[] は無休、null は不明
//     seasonal,               // { season: [{from,to}](営業期間。外は休業), periods: [{from,to,open,close,lastEntry}](期間ごとの時間) } か null
//     default?, byDay?,       // default: 曜日・期間の限定がない時間。byDay: 曜日ごとの時間 [{days, holiday, open, close, lastEntry}]
//     holidayClosed?,         // 「祝」が定休日に含まれる
//     confidence, source }    // "high": 明確。"medium": 時間は取れたが「変更あり」「冬季は〜」など別の時間がある可能性
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.WankoHours = factory();
})(typeof self !== "undefined" ? self : this, function () {
  const DAY_CHARS = "日月火水木金土";
  const DAY_LABEL = DAY_CHARS.split("");  // 0=日 … 6=土(Date#getDay と同じ)
  const DASH = "[〜~\\-–−ー]";
  // 時刻 1 つ: 10:00 / 10時 / 10時30分 / 10時半。NFKC 正規化後(全角数字・コロン・「～」は半角に寄る)の文章に当てる。「2時間」の「時」は時刻ではない
  const TIME = "(\\d{1,2})(?::(\\d{2})|時(?!間)(?:(\\d{1,2})分|(半))?)";
  // 時刻の範囲。先頭は「10〜18時」のように数字だけでもよい(終わりは必ず「:」か「時」つき)。
  // 前が数字・/・. なら範囲にしない(日付・金額の一部)。「:」は「営業時間:10:00〜」の区切りなら可、「9:30〜」の途中なら不可
  const RANGE = new RegExp(`(^|(?<![\\d/.]):|[^\\d/:.])(\\d{1,2})(?::(\\d{2})|時(?!間)(?:(\\d{1,2})分|(半))?)?\\s*${DASH}\\s*${TIME}`, "g");
  // 最終受付・ラストオーダー。ランチ・フードなど一部メニューの L.O. は閉店ではないので採らない(文章からは除く)。「下り最終16:30」も採らない
  const LAST_ENTRY = new RegExp(`(ランチ|フード|ディナー|モーニング|朝食|昼食|夕食|料理)?\\s*(最終受付|最終入場|最終入園|最終入館|最終入店|最終入縁|受付終了|入場終了|[Ll]\\.?[Oo]\\.?|ラストオーダー)\\s*(?:は|時間)?\\s*:?\\s*${TIME}|受付\\s*(?:は)?\\s*${TIME}\\s*まで`, "g");
  // 範囲の直前(14 文字以内)にあると営業時間ではない語。MEAL は「ランチ 11〜15時」のような一部の時間帯(営業時間の外へはみ出すなら medium)
  const MEAL_BEFORE = /(ランチ|ディナー|モーニング|朝食|昼食|夕食|夜の部|ナイター|ナイト|BBQ|バーベキュー)[^。]*$/;
  const NOT_HOURS_BEFORE = /(登録|受付|予約|講座|イベント|料理提供|フード|ドリンク|下り|上り|立入禁止|入場不可|貸切|遊泳|時間帯|事務所|問い合わせ|問合せ|電話|窓口|チェックイン|チェックアウト|駐車)[^。]*$/;
  const PHONE = /\d{2,5}-\d{1,4}-\d{3,4}/;
  // 範囲の直後にあると営業時間ではない語
  const NOT_HOURS_AFTER = /^\s*\)?\s*(?:は|で|の|に)?\s*(?:完全)?(?:予約|受付|登録|立入禁止|入場不可|閉鎖|メンテナンス|散歩禁止|禁止|勤務)/;
  // 季節の語で時間が限定されていて、月が分からないもの(「冬季は9:30〜16:00」)。その範囲は採らず medium
  const SEASON_WORD = /(冬[季期]|夏[季期]|冬は|夏は|冬の|夏の|ナイト|GW|連休|お盆|紅葉|シーズン)/;
  // 営業時間が日によって変わることを示す語。範囲が取れても confidence は medium
  const VAGUE = new RegExp([
    "日別|カレンダー|営業日は|変更あり|変更告知|延長|短縮|早じまい|冬[季期]|夏[季期]|冬は|夏は|冬の|夏の|ナイト",
    "下旬|上旬|中旬|月末|など|不定休|時点|日没|のみ(?:通常)?営業",
    // 「(土日は20時まで)」「(4・5月は18:00まで)」「予約があれば19時まで」: 一部の日だけ時間が違う。「受付は16:00まで」は最終受付なので除く
    "(?<!受付\\s*)(?:は|あれば|なら)\\s*\\d{1,2}(?::\\d{2}|時)[^。、)]{0,4}まで",
  ].join("|"));
  // 「季節で変わる」は、期間ごとの時間が全部書いてあれば曖昧ではない
  const VAGUE_SEASON = /(季節|時期|変わる|異なる)/;
  const CLOSED_WORD = "(?:定休|休み|休業|休園|休館|休場|休縁|休(?!憩))";
  // 曜日の並び: 「月・水」「火〜金」「月曜・火曜」「月曜日火曜日」「水曜と木曜」「日祝」
  const DAY_ITEM = `(?:祝日?|[${DAY_CHARS}](?:曜日?)?(?:祝日?)?)`;
  const DAYSET = `${DAY_ITEM}(?:\\s*[・、〜~\\-–ー]\\s*${DAY_ITEM}|(?<=曜日?)\\s*(?:と|および|及び)?\\s*${DAY_ITEM})*`;
  const NO_CLOSED = /定休日\s*(?:は|:)?\s*(?:なし|無し|ありません)|年中無休|無休|休みなし|休業日なし/;

  const nfkc = (s) => String(s || "").normalize("NFKC");
  const pad = (n) => String(n).padStart(2, "0");
  const minutesOf = (hm) => { const m = /^(\d{1,2}):(\d{2})$/.exec(hm || ""); return m ? +m[1] * 60 + +m[2] : null; };
  const timeOf = (h, mm, min, half) => {
    const hour = +h, mi = mm != null ? +mm : min != null ? +min : half ? 30 : 0;
    if (!(hour >= 0 && hour <= 24) || !(mi >= 0 && mi <= 59) || (hour === 24 && mi > 0)) return null;
    return `${pad(hour)}:${pad(mi)}`;
  };
  const laterOf = (a, b) => (a == null ? b : b == null ? a : minutesOf(b) > minutesOf(a) ? b : a);
  // 「月・水」「火〜金」「日・月・祝」「月曜・火曜」「日祝」を曜日番号の配列へ。祝 は holiday: true。読めなければ null
  const parseDaySet = (s) => {
    const out = { days: [], holiday: false };
    const norm = s.replace(/\s+/g, "").replace(/曜日?|祝日/g, (m) => (m === "祝日" ? "祝" : "・")).replace(/(?:と|および|及び)/g, "・");
    for (const t of norm.split(/[・、]/).filter(Boolean)) {
      const r = new RegExp(`^([${DAY_CHARS}祝])(?:${DASH}([${DAY_CHARS}]))?(祝)?日?$`).exec(t);
      if (!r) return null;
      if (r[3]) out.holiday = true;
      if (r[1] === "祝") { out.holiday = true; continue; }
      const a = DAY_CHARS.indexOf(r[1]);
      if (!r[2]) { out.days.push(a); continue; }
      const b = DAY_CHARS.indexOf(r[2]);
      for (let i = a; ; i = (i + 1) % 7) { out.days.push(i); if (i === b) break; }
    }
    out.days = [...new Set(out.days)].sort((x, y) => x - y);
    return out;
  };
  const daysOf = (q) => {
    if (q === "平日") return { days: [1, 2, 3, 4, 5], holiday: false };
    if (/^土・?日・?祝日?$/.test(q)) return { days: [0, 6], holiday: true };
    if (q === "土日" || q === "週末") return { days: [0, 6], holiday: false };
    if (/^日・?祝日?$/.test(q)) return { days: [0], holiday: true };
    return parseDaySet(q);
  };
  // 月日は mo*100+d の数で持つ(10/5 → 1005)。月だけの期間は 1 日〜31 日
  const validMd = (mo, d) => mo >= 1 && mo <= 12 && d >= 1 && d <= 31;
  const monthPeriod = (a, b) => (a >= 1 && a <= 12 && b >= 1 && b <= 12 ? { from: a * 100 + 1, to: b * 100 + 31, monthOnly: true } : null);
  const inRange = (md, r) => (r.from <= r.to ? md >= r.from && md <= r.to : md >= r.from || md <= r.to);
  const fmtMd = (md) => `${Math.floor(md / 100)}/${md % 100}`;
  const fmtPeriod = (r) => {
    if (!r.monthOnly) return `${fmtMd(r.from)}〜${fmtMd(r.to)}`;
    const a = Math.floor(r.from / 100), b = Math.floor(r.to / 100);
    return a === b ? `${a}月` : `${a}〜${b}月`;
  };
  // 月日の範囲。「4月25日(土)〜10月25日(日)」のような曜日の括弧も許す
  const MD = "(\\d{1,2})(?:月(\\d{1,2})日|/(\\d{1,2}))(?:\\s*\\([^)]{1,3}\\))?";
  const MD_RANGE = new RegExp(`${MD}\\s*${DASH}\\s*${MD}`, "g");
  const mdRanges = (s) => {
    const out = [];
    const re = new RegExp(MD_RANGE.source, "g");  // 呼び出し側が MD_RANGE で走査中でも lastIndex を壊さない
    let m;
    while ((m = re.exec(s))) {
      const fm = +m[1], fd = +(m[2] || m[3]), tm = +m[4], td = +(m[5] || m[6]);
      if (validMd(fm, fd) && validMd(tm, td)) out.push({ from: fm * 100 + fd, to: tm * 100 + td });
    }
    return out;
  };

  // 範囲の直前(同じ節の中)にある限定語: 月日の範囲の並び / 月の範囲 / 単月 / 平日・土日祝・曜日の並び
  const QUAL_MD = new RegExp(`((?:\\d{1,2}(?:月\\d{1,2}日|/\\d{1,2})\\s*${DASH}\\s*\\d{1,2}(?:月\\d{1,2}日|/\\d{1,2})\\s*[・、]?\\s*)+)(?:は|:)\\s*$`);
  const QUAL_MONTHS = new RegExp(`(\\d{1,2})月?\\s*${DASH}\\s*(\\d{1,2})月\\s*(?:は|:|の|が)?\\s*$`);
  const QUAL_MONTH = /(\d{1,2})月\s*(?:は|:)\s*$/;
  // 「毎日」「元日」「祝日」「土日」の途中の「日」を曜日と読まない
  const QUAL_DAYS = new RegExp(`(?<![毎元本当前翌休定祝土日月火水木金])(平日|土日祝日?|土・日・祝日?|土日|週末|日祝日?|${DAYSET})\\s*(?:曜日?)?\\s*(?:のみ|は|の|:)?\\s*$`);
  const PAREN_MONTHS = new RegExp(`^\\s*(\\d{1,2})月?\\s*${DASH}\\s*(\\d{1,2})月\\s*$`);
  const PAREN_MD_ONLY = /^[\s\d月日/〜~\-–・、]+$/;
  const PAREN_DAYS = new RegExp(`^\\s*(平日|土日祝日?|土日|週末|${DAYSET})\\s*(?:のみ)?\\s*$`);

  // 1 つの文章を構造化。曖昧なら null
  function parse(text) {
    const src = String(text || "").trim();
    if (!src) return null;
    let s = nfkc(src);
    if (/24\s*時間|終日/.test(s)) return null;  // 24 時間・終日利用できるエリアを含む施設は「閉まっている」と言えない
    let vague = VAGUE.test(s);
    const vagueSeason = VAGUE_SEASON.test(s);
    // 「土不定休・日祝不定休」のように曜日つきの不定休は定休日と読み違えやすいので、定休日は読まない
    const skipClosed = new RegExp(`[${DAY_CHARS}祝](?:曜日?|日)?\\s*不定休`).test(s);
    s = s.replace(/不定休/g, "");

    const windows = [];      // { open, close, lastEntry, days?, holiday?, periods? }
    const meals = [];        // ランチ・夜の部など一部の時間帯(営業時間ではない)
    const seasons = [];      // 営業期間(外は休業)
    let globalLast = null;   // 範囲と別の節にあった最終受付(「9〜18時、最終受付17時」)
    let closedDays = null;   // null = 不明、[] = 無休
    let holidayClosed = false;

    for (const sentence of s.split(/。|※/)) {
      if (!sentence.trim()) continue;
      // 営業期間: 「営業」「開園」などを含む文の中の月日の範囲。直後に時刻が続くもの(期間ごとの時間)・「除く」「休止」のものは除く
      if (/営業|開園|開場|オープン|開催/.test(sentence)) {
        let m;
        MD_RANGE.lastIndex = 0;
        while ((m = MD_RANGE.exec(sentence))) {
          const tail = sentence.slice(m.index + m[0].length), head = sentence.slice(Math.max(0, m.index - 12), m.index);
          if (/^\s*[・、]?\s*\d{1,2}(?:月|\/)/.test(tail)) continue;  // 「3/1〜7/31・9/1〜11/30は…」の途中
          if (/^\s*(?:は|:)?\s*\(?\d{1,2}(?::|時)/.test(tail)) continue;
          if (/^[^。]{0,6}(除く|除き|除外|閉鎖|休止|休業|休園|立入)/.test(tail) || /(除く|除き|除外|休止|休業|閉鎖)/.test(head)) continue;
          seasons.push(...mdRanges(m[0]));
        }
      }
      const consumed = [];   // 文章から取り除く範囲と限定語(定休日の走査で曜日を誤って拾わないため)
      let pos = 0, contact = false, prevRejected = false;
      for (const clauseRaw of sentence.split(/、|;|(?<!\d)\/|\/(?!\d)/)) {
        const clauseStart = sentence.indexOf(clauseRaw, pos); pos = clauseStart + clauseRaw.length;
        let clauseLast = null, clauseRejected = false;
        const clause = clauseRaw.replace(LAST_ENTRY, (all, menu, _kind, h1, m1, mi1, half1, h2, m2, mi2, half2) => {
          if (!menu) clauseLast = laterOf(clauseLast, h1 != null ? timeOf(h1, m1, mi1, half1) : timeOf(h2, m2, mi2, half2));
          return " ".repeat(all.length);  // 位置を変えない
        });
        RANGE.lastIndex = 0;
        let m, found = 0;
        while ((m = RANGE.exec(clause))) {
          const start = m.index + m[1].length, end = m.index + m[0].length;
          const before = clause.slice(0, start), after = clause.slice(end);
          const open = timeOf(m[2], m[3], m[4], m[5]), close = timeOf(m[6], m[7], m[8], m[9]);
          if (!open || !close) continue;
          if (minutesOf(close) <= minutesOf(open)) { vague = true; continue; }  // 深夜またぎは扱わない
          if (MEAL_BEFORE.test(before.slice(-14))) { meals.push({ open, close }); clauseRejected = true; continue; }
          if (NOT_HOURS_BEFORE.test(before.slice(-14)) || PHONE.test(before) || NOT_HOURS_AFTER.test(after)) {
            clauseRejected = true;
            if (/予約|受付|事務所|問い合わせ|問合せ|電話|窓口/.test(before.slice(-14))) contact = true;
            continue;
          }
          // 「予約センター10:00〜13:00、14:00〜17:00」の 2 つ目のように、見出しのない範囲は前の範囲と同じ扱い
          if (prevRejected && !before.trim()) { clauseRejected = true; continue; }
          if (SEASON_WORD.test(before)) { vague = true; continue; }
          const w = { open, close, lastEntry: clauseLast };
          let q, qStart = start, qEnd = end;
          if ((q = QUAL_MD.exec(before))) { w.periods = mdRanges(q[1]); qStart = start - q[0].length; }
          else if ((q = QUAL_MONTHS.exec(before)) && monthPeriod(+q[1], +q[2])) { w.periods = [monthPeriod(+q[1], +q[2])]; qStart = start - q[0].length; }
          else if ((q = QUAL_MONTH.exec(before)) && monthPeriod(+q[1], +q[1])) { w.periods = [monthPeriod(+q[1], +q[1])]; qStart = start - q[0].length; }
          else if ((q = QUAL_DAYS.exec(before))) {
            const ds = daysOf(q[1]);
            if (ds && (ds.days.length || ds.holiday)) { w.days = ds.days; w.holiday = ds.holiday; qStart = start - q[0].length; }
          }
          // 直後の括弧の期間・曜日: 「8:45〜16:45(4〜11月)」「10:00〜19:00(3/1〜11/30)」「10:30〜16:30(月〜金)」
          const paren = /^\s*\(([^)]*)\)/.exec(after);
          if (paren && !w.periods && !w.days) {
            const pm = PAREN_MONTHS.exec(paren[1]), pd = PAREN_DAYS.exec(paren[1]);
            if (pm && monthPeriod(+pm[1], +pm[2])) { w.periods = [monthPeriod(+pm[1], +pm[2])]; qEnd += paren[0].length; }
            else if (PAREN_MD_ONLY.test(paren[1]) && mdRanges(paren[1]).length) { w.periods = mdRanges(paren[1]); qEnd += paren[0].length; }
            else if (pd) {
              const ds = daysOf(pd[1]);
              if (ds && (ds.days.length || ds.holiday)) { w.days = ds.days; w.holiday = ds.holiday; qEnd += paren[0].length; }
            }
          }
          windows.push(w);
          consumed.push(sentence.slice(clauseStart + qStart, clauseStart + qEnd));
          found++;
        }
        if (!found && !clauseRejected) globalLast = laterOf(globalLast, clauseLast);
        if (found || clauseRejected) prevRejected = clauseRejected && !found;
      }
      // 定休日: 「定休日 水曜」「定休日(水・木)」「休園日は月曜」はそのまま、「水・木定休」「月曜休」「火〜金曜は休み」は括弧を除いた文で。
      // 曜日 1 文字だけのときは「曜」が要る(「元日休業」「毎日」を日曜と読まないため)。「定休日」の「日」も日曜と読まない。
      // 予約窓口・事務所の時間と同じ文の休みは窓口の休みなので読まない
      if (skipClosed || contact) continue;
      let rest = sentence;
      for (const c of consumed) rest = rest.replace(c, " ");
      if (NO_CLOSED.test(rest) && closedDays == null) closedDays = [];
      const addClosed = (setText) => {
        const ds = parseDaySet(setText);
        if (!ds) return;
        closedDays = [...new Set([...(closedDays || []), ...ds.days])].sort((x, y) => x - y);
        if (ds.holiday) holidayClosed = true;
      };
      // 「(祝日なら翌日)」「(祝日は営業)」の「祝」は定休日ではない。「日曜ディナー」のような一部の時間帯の休みも定休日ではない
      const NOT_HOLIDAY_CLOSED = "(?![曜日]*\\s*(?:の場合|なら|は営業|を除|除|営業|も営業|ディナー|ランチ|夜|午前|午後|モーニング))";
      const pat1 = new RegExp(`(?:定休(?:日|(?!日))|休(?:園|場|館|業)(?:日|(?!日)))\\s*(?:は|:)?\\s*\\(?\\s*(?:毎週)?\\s*(${DAYSET})${NOT_HOLIDAY_CLOSED}`, "g");
      const pat2 = new RegExp(`(^|[^第\\d])(${DAYSET})\\s*(曜日?)?\\s*(?:が|は|も)?[^。、]{0,16}?${CLOSED_WORD}`, "g");
      const stripped = rest.replace(/\([^)]*\)/g, " ");
      let cm;
      while ((cm = pat1.exec(rest))) addClosed(cm[1]);
      while ((cm = pat2.exec(stripped))) {
        if (!cm[3] && !/曜|[・、〜~\-–ー]/.test(cm[2])) continue;
        if (/営業|\d{1,2}(?::\d{2}|時)/.test(cm[0])) continue;  // 間に時刻や「営業」があれば別の話
        addClosed(cm[2]);
      }
    }

    if (!windows.length && !(closedDays && closedDays.length) && !seasons.length) return null;
    if (windows.length === 1 && !windows[0].lastEntry) windows[0].lastEntry = globalLast;
    for (const w of windows) if (w.lastEntry && minutesOf(w.lastEntry) > minutesOf(w.close)) w.lastEntry = null;
    const defaults = windows.filter((w) => !w.days && !w.periods);
    if (defaults.length > 1) vague = true;  // カフェ 10〜17・ドッグラン 10〜18 のように施設の部分ごとの時間が並ぶ: 幅をとる
    const periods = windows.filter((w) => w.periods).flatMap((w) => w.periods.map((p) => ({ ...p, open: w.open, close: w.close, lastEntry: w.lastEntry })));
    const hasByDay = windows.some((w) => w.days);
    if (vagueSeason && !periods.length) vague = true;
    if (hasByDay && periods.length) vague = true;  // 「平日は7〜9月11〜17時…、土日祝は…」: 期間と曜日の組み合わせは読まない
    const union = (ws) => (ws.length ? {
      open: ws.map((w) => w.open).sort()[0],
      close: ws.map((w) => w.close).sort().slice(-1)[0],
      lastEntry: ws.every((w) => w.lastEntry) ? ws.map((w) => w.lastEntry).sort().slice(-1)[0] : null,
    } : null);
    const all = union(windows), def = union(defaults);
    // ランチ・夜の部などが営業時間の外にはみ出す(「ランチ11〜15時、カフェ15〜17時」)なら、本当の営業時間はもっと広い
    if (all && meals.some((x) => x.open < all.open || x.close > all.close)) vague = true;
    const out = {
      open: all ? all.open : null,
      close: all ? all.close : null,
      lastEntry: all ? all.lastEntry : null,
      closedDays,
      seasonal: seasons.length || periods.length ? { season: seasons, periods } : null,
      confidence: vague ? "medium" : "high",
      source: src,
    };
    if (def) out.default = def;
    const byDay = windows.filter((w) => w.days).map((w) => ({ days: w.days, holiday: Boolean(w.holiday), open: w.open, close: w.close, lastEntry: w.lastEntry }));
    if (byDay.length) out.byDay = byDay;
    if (holidayClosed) out.holidayClosed = true;
    return out;
  }

  // facts({見出し: 文章}) から営業時間を 1 つ選ぶ。営業時間らしい見出しを先に見て、confidence の高いものを返す。無ければ null。
  // 料金・犬の条件など営業時間の見出しでない項目は、文章に「営業」「開園」「利用時間」「定休」などがあるときだけ読む
  // (「貸切は10〜12時」「大型犬は水曜13〜18時限定」「駐車場は2〜6時間200円」を営業時間と読まない)
  const HOURS_KEY = /営業|時間|開場|開園|休場|休園|季節/;
  const LOOSE_KEY = /出発前|公式で確認|過ごし方|利用条件/;
  const HOURS_WORD = /営業|開園|開場|開館|利用時間|定休|休園|休場|休館|休業/;
  const keyRank = (k) => (HOURS_KEY.test(k) ? 0 : LOOSE_KEY.test(k) ? 1 : 2);
  function fromFacts(facts) {
    if (!facts || typeof facts !== "object") return null;
    const entries = Object.entries(facts)
      .filter(([k, v]) => typeof v === "string" && v && (keyRank(k) < 2 || HOURS_WORD.test(v)))
      .sort((a, b) => keyRank(a[0]) - keyRank(b[0]));
    let best = null;
    for (const [key, value] of entries) {
      const h = parse(`${key}: ${value}`);
      if (!h) continue;
      h.factKey = key;
      if (h.confidence === "high") return h;
      if (!best) best = h;
    }
    return best;
  }

  const fmtWindow = (w) => `${w.open}〜${w.close}${w.lastEntry ? `・最終受付${w.lastEntry}` : ""}`;
  const fmtDays = (days, holiday) => {
    const key = days.join(",");
    const base = key === "1,2,3,4,5" ? "平日" : key === "0,6" ? "土日" : days.map((d) => DAY_LABEL[d]).join("・");
    return holiday ? `${base}祝` : base;
  };
  const fmtClosed = (h) => {
    const key = h.closedDays.join(",");
    if (key === "1,2,3,4,5" && !h.holidayClosed) return "平日定休";
    const base = h.closedDays.map((d) => DAY_LABEL[d]).join("・");
    return h.holidayClosed ? `${base}・祝 定休` : `${base}曜定休`;
  };
  // 人が読む 1 行(体言止め)。例: 10:00〜17:00・最終受付16:30・月曜定休
  function describe(h) {
    if (!h) return "";
    const parts = [];
    if (h.default) parts.push(fmtWindow(h.default));
    for (const w of h.byDay || []) parts.push(`${fmtDays(w.days, w.holiday)} ${fmtWindow(w)}`);
    for (const p of (h.seasonal && h.seasonal.periods) || []) parts.push(`${fmtPeriod(p)} ${fmtWindow(p)}`);
    if (h.closedDays && h.closedDays.length) parts.push(fmtClosed(h));
    else if (h.closedDays) parts.push("無休");
    if (h.seasonal && h.seasonal.season.length) parts.push(`営業期間${h.seasonal.season.map(fmtPeriod).join("・")}`);
    return parts.join("・");
  }

  // おすすめから外す理由(到着が営業の外と確実に言えるもの)。開店前は着いてから待てるので外さない
  const DEMOTE_REASONS = ["閉店後", "最終受付後", "定休日", "季節外"];
  // 到着時刻の判定。j は日本時間の { mo, d, h, mi, wd }(planner.js の jst() と同じ形)。判定できなければ null
  function status(h, j) {
    if (!h || !j) return null;
    const md = j.mo * 100 + j.d;
    const seasons = (h.seasonal && h.seasonal.season) || [];
    if (seasons.length && !seasons.some((r) => inRange(md, r))) return { ok: false, reason: "季節外", text: `営業期間${seasons.map(fmtPeriod).join("・")}` };
    if (h.closedDays && h.closedDays.includes(j.wd)) return { ok: false, reason: "定休日", text: fmtClosed(h) };
    const allPeriods = (h.seasonal && h.seasonal.periods) || [];
    let windows = allPeriods.filter((p) => inRange(md, p));
    if (!windows.length) {
      if (allPeriods.length && !h.default) return null;  // 他の季節の時間は不明
      const byDay = h.byDay || [];
      windows = byDay.filter((w) => w.days.includes(j.wd));
      if (h.default) windows = windows.concat([h.default]);
      // 曜日ごとの時間しかなく、その曜日が書かれていない(「土日祝のみ」「平日は公式で確認」)なら判定しない
      if (!windows.length) return byDay.length ? null : (h.closedDays || seasons.length ? { ok: true, reason: null, text: describe(h) } : null);
      // 平日は祝日の可能性もあるので「祝」つきの時間も合わせて見る(広く判定して外しすぎない)
      if (j.wd >= 1 && j.wd <= 5) windows = windows.concat(byDay.filter((w) => w.holiday && !w.days.includes(j.wd)));
    }
    const m = j.h * 60 + j.mi;
    const text = windows.map(fmtWindow).join("・");
    const within = (w) => m >= minutesOf(w.open) && m < minutesOf(w.close) && (!w.lastEntry || m <= minutesOf(w.lastEntry));
    if (windows.some(within)) return { ok: true, reason: null, text };
    if (m < Math.min(...windows.map((w) => minutesOf(w.open)))) return { ok: false, reason: "開店前", text };
    if (windows.some((w) => w.lastEntry && m > minutesOf(w.lastEntry) && m < minutesOf(w.close))) return { ok: false, reason: "最終受付後", text };
    return { ok: false, reason: "閉店後", text };
  }

  return { parse, fromFacts, status, describe, DEMOTE_REASONS, DAY_LABEL };
});
