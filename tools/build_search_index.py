#!/usr/bin/env python3
"""サイト横断検索の索引 assets/search-index.json を作る。

各ページのカード(article)から「種類・名前・地域・要点・タグ・リンク先」を取り出す。
広告リンク(楽天・Yahoo!・Amazon など)は索引に入れない。リンク先は元ページのカードだけ。

  python3 tools/build_search_index.py          # 索引を書き出す
  python3 tools/build_search_index.py --check  # 索引が最新か確かめる(差分があれば終了コード 1)

依存なし(標準ライブラリのみ)。同じ HTML からは常に同じバイト列になる(日時・乱数を入れない)。
"""
import argparse
import html
import json
import re
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "search-index.json"
PLACES = ROOT / "route-planner" / "data" / "places.json"

# 種類(索引の type 番号の順)。page はカードのある元ページ。
TYPES = [
    ("宿", "dog-lodging-guide.html"),
    ("おでかけ", "east-japan-dog-trips.html"),
    ("主食", "food.html"),
    ("用品", "goods.html"),
    ("服", "wear.html"),
    ("旅行用品", "travel-gear.html"),
]

POINT_MAX = 48      # 画面に出す要点の長さ(文字)。要点も検索に使う(否定の文節は search.js が除く)
SUB_MAX = 60        # 2 行目(地域・商品名)の長さ
NOTE_MAX = 56       # 説明文の長さ。ふだんは出さず、ここだけで当たったときに結果へ出す

# おでかけの data-kind の表示名(east-japan-dog-trips.html の絞り込みと同じ呼び方)
KIND_LABEL = {
    "run": "ドッグラン", "cafe": "カフェ", "park": "公園・散歩", "travel": "旅行アイデア",
    "animal": "動物ふれあい", "rest-stop": "SA・PA・道の駅", "shopping": "買い物",
}

# 地域の別名。住所に観光地名が入らない市町村(例: 伊東市 → 伊豆)と、ひらがなの読み。
# (住所・名前に当てる正規表現, 足す語)
AREA_ALIASES = [
    (r"伊東|伊豆|下田|河津|松崎町|熱海|函南", "伊豆 いず"),
    (r"伊東", "いとう"), (r"熱海", "あたみ"), (r"下田", "しもだ"),
    (r"那須", "那須 なす"),
    (r"箱根", "はこね"), (r"湯河原", "ゆがわら"),
    (r"軽井沢|御代田", "軽井沢 かるいざわ"),
    (r"河口湖|山中湖|鳴沢村|富士吉田|忍野|西湖|本栖|精進湖", "富士五湖 ふじごこ"),
    (r"河口湖", "かわぐちこ"), (r"山中湖", "やまなかこ"),
    (r"北杜|茅野|原村|富士見町|南牧村|小淵沢|清里|八ヶ岳|八ケ岳", "八ヶ岳 やつがたけ"),
    (r"清里", "きよさと"), (r"茅野|立科|蓼科", "蓼科 たてしな"),
    (r"南房総|館山|鴨川|鋸南|富津|いすみ|勝浦|御宿|大多喜|木更津|君津|袖ケ浦|袖ヶ浦|一宮町|九十九里|白子町|長生|鉄砲|山武|旭市|匝瑳|横芝", "房総 ぼうそう"),
    (r"南房総|館山|鴨川|鋸南|千倉|白浜", "南房総 みなみぼうそう"),
    (r"九十九里|山武|一宮町|白子町|長生|大網白里|旭市|匝瑳|横芝", "九十九里 くじゅうくり"),
    (r"館山", "たてやま"), (r"鴨川", "かもがわ"),
    (r"日光|鬼怒川|川治", "日光 にっこう"), (r"鬼怒川", "きぬがわ"),
    (r"白馬|小谷村", "白馬 はくば"), (r"安曇野", "あづみの"),
    (r"草津", "くさつ"), (r"みなかみ|水上", "みなかみ 水上"),
    (r"藤沢|茅ヶ崎|茅ケ崎|鎌倉|逗子|葉山|平塚|大磯", "湘南 しょうなん"),
    (r"鎌倉", "かまくら"), (r"三浦|横須賀", "三浦半島 みうら"),
    (r"秩父|長瀞|皆野|横瀬|小鹿野", "秩父 ちちぶ"), (r"長瀞", "ながとろ"),
    (r"蔵王", "ざおう"),
    (r"北塩原|猪苗代|磐梯", "磐梯 裏磐梯 ばんだい"),
    (r"奥多摩|青梅|あきる野|檜原", "奥多摩 おくたま"),
    (r"山ノ内町|湯田中|志賀高原", "志賀高原 しがこうげん"),
    (r"湯沢町", "越後湯沢 ゆざわ"), (r"妙高", "みょうこう"),
    (r"御殿場", "ごてんば"), (r"富士宮|御殿場|裾野|富士河口湖|鳴沢|富士吉田|山中湖|忍野", "富士山 ふじさん"),
    (r"松本", "まつもと"), (r"安曇野|松本|大町|白馬", "信州 しんしゅう"),
    (r"長野県", "信州"), (r"山梨県", "やまなし"), (r"静岡県", "しずおか"),
    (r"横浜", "よこはま"), (r"会津", "あいづ"), (r"仙台", "せんだい"),
]
AREA_ALIASES = [(re.compile(p), w) for p, w in AREA_ALIASES]

# 否定の語を含む文節は検索に使わない(「大型犬不可」で「大型犬」が当たらないように)。
# 同じ規則を索引の "neg" に入れて assets/search.js でも使う
NEG_PATTERN = r"不可|できません|できない|NG|ＮＧ|お断り|ご遠慮|禁止|除く|対象外|不明|未確認|記載なし|ありません|なし"
NEG = re.compile(NEG_PATTERN)


def text(fragment):
    """HTML 断片を 1 行の文字列にする。"""
    t = re.sub(r"<(script|style)\b.*?</\1>", " ", fragment, flags=re.S)
    t = re.sub(r"<[^>]+>", " ", t)
    t = html.unescape(t)
    return re.sub(r"\s+", " ", t).strip()


def clip(t, n):
    t = t.strip()
    return t if len(t) <= n else t[: n - 1].rstrip("、。・ ") + "…"


def positive(t):
    """否定・未確認を含む文節を落とした文。"""
    parts = re.split(r"(?<=[。、．，,;；!！?？])|\s*[／/]\s*", t)
    return "".join(p for p in parts if p and not NEG.search(p)).strip()


def aliases(*texts):
    src = " ".join(texts)
    out = []
    for rx, words in AREA_ALIASES:
        if rx.search(src):
            for w in words.split():
                if w not in out and w not in src:
                    out.append(w)
    return out


def attr(tag, name):
    m = re.search(r'\s' + name + r'="([^"]*)"', tag)
    return html.unescape(m.group(1)) if m else ""


def articles(page):
    src = (ROOT / page).read_text(encoding="utf-8")
    return re.findall(r"(<article\b[^>]*>)(.*?)</article>", src, re.S)


# ---- 宿: 犬の条件の判定は dog-lodging-guide の絞り込み(assets/editorial.js の CHIPS)と同じ規則
def sec_text(secs, rx):
    return " ".join(v for k, v in secs if re.search(rx, k))


UNK = re.compile(r"^[(（]?(予約前確認|未確認|不明|公式に記載なし|記載なし)")


def bare(t):
    t = t.strip()
    return not t or bool(re.match(r"^[(（]?(予約前確認|未確認|不明|(公式に)?記載なし)[)）。]?$", t))


def st_large(secs, card):
    t = sec_text(secs, r"対象犬|頭数")
    if bare(t):
        return "unk"
    if re.search(r"大型犬?[^。]{0,10}(不可|できません|NG|お断り|ご遠慮|除く)|小型犬のみ|小型犬に限|中型犬まで|中型犬以下|小型・中型犬まで", t):
        return "no"
    if re.search(r"大型|(大きさ|サイズ|犬種|体重)[^。]{0,10}(制限なし|制限はありません|問わ|不問)", t):
        return "cond" if re.search(r"大型犬?[^。]{0,15}(要相談|相談|要確認|判断|承認|事前(に)?(確認|連絡|申告)|問い?合わ?せ|一部|限定|のみ|専用|特定|指定|対応(の)?(客室|部屋|棟))|一部(の)?客室(タイプ)?を除", t) else "yes"
    if re.search(r"\d+\s*(kg|ｋｇ|キロ)\s*(以下|未満|まで)", t):
        return "no"
    return "unk"


def st_multi(secs, card):
    t = sec_text(secs, r"対象犬|頭数|料金")
    if bare(t):
        return "unk"
    if re.search(r"(^|[^0-9０-９,，.])([2-9２-９]|[1-9][0-9])\s*(頭|匹)|複数頭|多頭|頭数[^。]{0,8}(制限なし|無制限|問わ)", t):
        return "cond" if re.search(r"要相談|相談|要確認|組み合わせ|事前(に)?(連絡|申告|確認|相談)|サイズによ|(^|[^0-9０-９])[1１]\s*(頭|匹)\s*まで", t) else "yes"
    if re.search(r"(^|[^0-9０-９])[1１]\s*(頭|匹)\s*(のみ|まで|限り|限定)|1室1頭", t):
        return "no"
    return "unk"


def st_sleep(secs, card):
    s = card["sleep"].strip()
    if s == "可":
        return "yes"
    if re.search(r"^(可|条件付き)|は可|相談", s):
        return "cond"
    if s.startswith("不可"):
        return "no"
    return "unk"


def st_cage(secs, card):
    t = (card["cage"] + " " + sec_text(secs, r"ケージ")).strip()
    if not re.sub(r"[(（]?予約前確認[)）。]?", "", t).strip():
        return "unk"
    if re.search(r"(ケージ|クレート|サークル|ゲージ)[^。]{0,10}の有無|(ケージ|クレート|サークル)[^。]{0,8}(は)?未確認", t):
        return "unk"
    if re.search(r"(ケージ|クレート|サークル)[^。]{0,4}の?(案内|記載)(は)?なし", t):
        return "no"
    if re.search(r"用意なし|ご?用意(は|が)?(ございません|ありません|していません)|貸(し)?出(し)?(は)?(なし|ありません|していません)|ケージ(の)?(貸出|用意)?なし(?!で)|^なし|^持参", t):
        return "no"
    if re.search(r"(ケージ|クレート|サークル|ゲージ)[^。]{0,25}(あり|貸出|貸し出|用意|備付|備え付|常備|常設|完備|設置)|(貸出|貸し出し|用意|備え付け|常備)[^。]{0,10}(ケージ|クレート|サークル)|^あり|客室に(ケージ|クレート|サークル)|^(フロント)?(貸出|貸し出し|用意|備え?付け?|常備|常設)(あり|可)|^備え?付け?", t):
        return "cond" if re.search(r"台数限定|数に限り|限りがあ|事前(の)?(予約|申込|申し込み|連絡)|要予約|予約制|予約推奨|有料|一部|のみ|サイズ(は|を)?(確認|指定)|要問い?合わ?せ|要確認", t) else "yes"
    return "unk"


def st_run(secs, card):
    t = sec_text(secs, r"ドッグラン").strip()
    if not t:
        return "yes" if re.search(r"(ドッグラン|ラン)(あり|付|併設|完備)|専用ドッグラン|プライベートドッグラン", sec_text(secs, r".")) else "unk"
    if UNK.search(t) or "記載なし" in t or ("有無" in t and "あり" not in t):
        return "unk"
    if re.search(r"^[(（]?(なし|無し)|ではございません|ではありません|近隣|周辺の|近くの", t):
        return "no"
    return "cond" if re.search(r"有料|予約制|要予約|貸切|貸し切り|時間制|利用時間|一部の?客室|客室のみ|付き客室|条件|証明|小型犬(のみ|専用)|冬季|季節|休止|天候", t) else "yes"


def st_meal(secs, card):
    t = sec_text(secs, r"食事").strip()
    if not t or UNK.search(t):
        return "unk"
    if re.search(r"^[(（]?(不可|なし|×)", t):
        return "no"
    if re.search(r"一緒|同伴(可|OK|でき(る|ます))|同席|客室食|部屋食|個室|テラス|ダイニング[^。]{0,8}(可|一緒|同伴)|^可|^条件付き|レストラン[^。]{0,12}(同伴可|一緒|OK)|レストラン(への)?同伴(?!不可|はでき)", t):
        return "cond" if re.search(r"^条件付き|一部|のみ|限定|個室|テラス|ケージ|キャリー|カート|抱っこ|マナー|小型犬|事前|要予約|予約制|リード|不可", t) else "yes"
    return "unk"


def st_free(secs, card):
    raw = sec_text(secs, r"料金").strip()
    if bare(raw):
        return "unk"
    t = re.sub(r"含(む|まれる)か(要)?確認|(ドッグラン|ラン|駐車場|アメニティ|貸出|ケージ|足洗い)[^。、]{0,6}無料|(介護|介助|盲導|補助)犬[^。、）)]{0,8}無料|含まれず|含まれません|(ドッグ)?ラン(利用)?料金込み", "", raw)
    if re.search(r"無料|(^|[^0-9,])0円|追加料金(は)?(なし|ございません|ありません|不要)|料金に含|に含まれ|かかりません|(料金|代金|パッケージ|プラン)(に)?(含む|込み)", t) and "無料ではありません" not in t:
        return "cond" if (UNK.search(t) or re.search(r"公式(サイト|予約|HP|ホームページ)|プラン|[1１一]頭(目)?(まで|のみ)?[^。]{0,4}無料|頭目|以降|条件|限定|会員|期間|キャンペーン|小型犬[^。]{0,6}無料|連泊|経由|予約サイト", t)) else "yes"
    return "no" if re.search(r"\d[\d,]*\s*円", t) else "unk"


LODGING_CHIPS = [  # (タグ名, 判定)。可・条件付きのときだけタグを付ける(宿ページのチップと同じ数え方)
    ("大型犬OK", st_large), ("多頭OK", st_multi), ("添い寝可", st_sleep), ("ケージ貸出", st_cage),
    ("ドッグラン", st_run), ("食事同伴", st_meal), ("犬料金無料", st_free),
]


def lodging(places):
    items = []
    for head, body in articles(TYPES[0][1]):
        cid = attr(head, "id") or attr(head, "data-lodging-id")
        m = re.search(r'<div class="stay-head"><div><p>(.*?)</p><h2>(.*?)</h2>', body, re.S)
        if not cid or not m:
            continue
        region, name = text(m.group(1)), text(m.group(2))
        secs = [(text(k), text(v)) for k, v in re.findall(r"<section><b>(.*?)</b><p>(.*?)</p></section>", body, re.S)]
        card = {"sleep": attr(head, "data-sleep"), "cage": attr(head, "data-cage")}
        tags = []
        for label, fn in LODGING_CHIPS:
            st = fn(secs, card)
            if st in ("yes", "cond"):
                tags.append(label if st == "yes" else label + "(条件付き)")
        dog = sec_text(secs, r"対象犬|頭数")
        point = clip(dog, POINT_MAX) if not bare(dog) else "対象犬・頭数は予約前に確認"
        grid = body.find('<div class="answer-grid">')
        desc = text(re.findall(r"<p>(.*?)</p>", body[:grid], re.S)[-1]) if grid > 0 and re.search(r"<p>", body[:grid]) else ""
        area = (places.get(cid) or {}).get("area", "")
        alias = " ".join(aliases(region, area, name) + ([area] if area and area not in region else []))
        items.append([0, name, region, point, tags, "#" + cid, alias, clip(positive(desc), NOTE_MAX)])
    return items


def outings(places):
    items = []
    for head, body in articles(TYPES[1][1]):
        cid = attr(head, "id")
        rm = re.search(r'<span class="region">(.*?)</span>', body, re.S)
        nm = re.search(r"<h2>(.*?)</h2>", body, re.S)
        if not cid or not nm:
            continue
        region, name = text(rm.group(1)) if rm else "", text(nm.group(1))
        theme = re.search(r'<p class="theme">(.*?)</p>', body, re.S)
        theme = text(theme.group(1)) if theme else ""
        facts = [(text(k), text(v)) for k, v in re.findall(r"<dt>(.*?)</dt><dd>(.*?)</dd>", body, re.S)]
        dog = sec_text(facts, r"犬の条件")
        kinds = attr(head, "data-kind").split() or ["travel"]
        tags = [KIND_LABEL.get(k, k) for k in kinds]
        point = clip(dog if dog and not bare(dog) else theme, POINT_MAX)
        area = (places.get(cid) or {}).get("area", "")
        alias = " ".join(aliases(region, area, name) + ([area] if area and area not in region else []))
        items.append([1, name, region, point, tags, "#" + cid, alias, clip(positive(theme), NOTE_MAX)])
    return items


def products(type_no):
    items = []
    for head, body in articles(TYPES[type_no][1]):
        if 'class="card' not in head:
            continue
        nm = re.search(r"<h2>(.*?)</h2>", body, re.S)
        if not nm:
            continue
        cid = attr(head, "id")
        pick = re.search(r'data-product="([^"]+)"', body)
        # id があれば #id、無ければ ?pick=(assets/anchor-fix.js がカードへ移動する)
        link = "#" + cid if cid else ("?pick=" + html.unescape(pick.group(1)) if pick else "")
        if not link:
            continue
        name = text(nm.group(1))
        pn = re.search(r'<p class="product-name">(.*?)</p>', body, re.S)
        product_name = text(pn.group(1)) if pn else ""
        strength = re.search(r'<p class="strength">(.*?)</p>', body, re.S)
        strength = text(strength.group(1)) if strength else ""
        category = attr(head, "data-category")
        problems = [p for p in attr(head, "data-problems").split("|") if p]
        tags = []
        for t in [category] + problems:
            if t and t not in tags:
                tags.append(t)
        specs = dict((text(k), text(v)) for k, v in re.findall(r"<dt>(.*?)</dt><dd>(.*?)</dd>", body, re.S))
        target = specs.get("対象", "")
        # 主食は商品名が h2。用品・服・旅行用品は h2 が用途の説明で、商品名は別の行
        sub = clip(product_name, SUB_MAX) if product_name and product_name != name else ""
        note = "・".join(e for e in [("対象 " + target) if target and target not in name + sub else "", specs.get("形状", "")] if e)
        items.append([type_no, name, sub, clip(strength, POINT_MAX), tags, link, "", clip(note, NOTE_MAX)])
    return items


def build():
    places = {p["id"]: p for p in json.loads(PLACES.read_text(encoding="utf-8"))["places"]}
    items = lodging(places) + outings(places)
    for no in range(2, len(TYPES)):
        items += products(no)
    # 文字は NFC にそろえる(表示用。検索時の揺れ吸収は assets/search.js の norm で行う)
    items = [[unicodedata.normalize("NFC", x) if isinstance(x, str) else ([unicodedata.normalize("NFC", t) for t in x] if isinstance(x, list) else x) for x in it] for it in items]
    for it in items:
        it[4] = "|".join(it[4])
    data = {
        "v": 1,
        "types": [t for t, _ in TYPES],
        "pages": [p for _, p in TYPES],
        # alias: 地域の別名・読み(画面に出さない)。note: 説明文(ここだけで当たったときに出す)
        "fields": ["type", "name", "sub", "point", "tags", "link", "alias", "note"],
        "neg": NEG_PATTERN,
        "items": items,
    }
    return json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n"


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--check", action="store_true", help="書き出さずに、索引が最新か確かめる")
    args = ap.parse_args()
    out = build()
    counts = {}
    for it in json.loads(out)["items"]:
        counts[TYPES[it[0]][0]] = counts.get(TYPES[it[0]][0], 0) + 1
    summary = "・".join(f"{k} {v}" for k, v in counts.items())
    if args.check:
        cur = OUT.read_text(encoding="utf-8") if OUT.exists() else ""
        if cur != out:
            print(f"search-index.json が古いです。python3 tools/build_search_index.py を実行してください({summary})", file=sys.stderr)
            return 1
        print(f"search-index.json は最新です({summary}、{len(out.encode())} バイト)")
        return 0
    OUT.write_text(out, encoding="utf-8")
    print(f"assets/search-index.json を書き出しました({summary}、{len(out.encode())} バイト)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
