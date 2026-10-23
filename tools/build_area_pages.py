#!/usr/bin/env python3
"""地域別の「犬と泊まれる宿・犬とおでかけ」ページ(areas/*.html)を作る。

使い方(リポジトリの一番上で):
    python3 tools/build_area_pages.py           # areas/ と sitemap.xml を作り直す
    python3 tools/build_area_pages.py --check   # 書き換えずに、今のファイルとの差だけを報告する

- 標準ライブラリだけで動く。何度実行しても、入力が同じなら同じ結果になる(日時や乱数を使わない)。
- 入力: route-planner/data/places.json(名前・地域・犬の条件・公式リンク)と、
  dog-lodging-guide.html / east-japan-dog-trips.html(カードの有無・広告ボタン・確認日)。
  元ページは読むだけで、書き換えない。
- 出力: areas/<slug>.html、areas/index.html、sitemap.xml の areas/ の行。
- 事実はデータにあるものだけを使う。口コミ・評価・ランキング・価格は新しく作らない。
"""

import argparse
import html
import json
import math
import re
import sys
from collections import Counter, OrderedDict, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE = "https://sorapapa-creator.github.io/wanko-affiliate-guide/"
PLACES = ROOT / "route-planner" / "data" / "places.json"
LODGING_HTML = ROOT / "dog-lodging-guide.html"
TRIPS_HTML = ROOT / "east-japan-dog-trips.html"
OUT_DIR = ROOT / "areas"
SITEMAP = ROOT / "sitemap.xml"
CSS_HREF = "../assets/area-pages.css?v=20261019a"

MIN_ITEMS = 8          # これ以上の掲載がある県・市町村・観光地だけページを作る
NEAR_SPOT_KM = 5.0     # 宿カードに「近くのおでかけ先」を出す距離(直線)
NEIGHBORS = 6          # 「近くの地域」に並べるページ数

# ---------------------------------------------------------------- 地域の決まり

# 県の並び(一覧ページの順)と slug
PREFS = OrderedDict([
    ("宮城県", "miyagi"), ("山形県", "yamagata"), ("福島県", "fukushima"),
    ("茨城県", "ibaraki"), ("栃木県", "tochigi"), ("群馬県", "gunma"),
    ("埼玉県", "saitama"), ("千葉県", "chiba"), ("東京都", "tokyo"),
    ("神奈川県", "kanagawa"), ("新潟県", "niigata"), ("山梨県", "yamanashi"),
    ("長野県", "nagano"), ("静岡県", "shizuoka"),
])

# 市区町村 → (slug, 見出しに使う呼び名)。掲載が MIN_ITEMS 以上になった市区町村は、
# ここに無いとページを作れない(実行時に「slug を足してください」と表示する)。
MUNIS = {
    ("静岡県", "伊東市"): ("ito", "伊東・伊豆高原"),
    ("栃木県", "那須町"): ("nasu", "那須"),
    ("神奈川県", "箱根町"): ("hakone", "箱根"),
    ("長野県", "軽井沢町"): ("karuizawa", "軽井沢"),
    ("山梨県", "富士河口湖町"): ("kawaguchiko", "河口湖"),
    ("栃木県", "日光市"): ("nikko", "日光"),
    ("山梨県", "北杜市"): ("hokuto", "北杜"),
    ("山梨県", "山中湖村"): ("yamanakako", "山中湖"),
    ("千葉県", "千葉市"): ("chiba-city", "千葉市"),
    ("千葉県", "南房総市"): ("minamiboso", "南房総"),
    ("千葉県", "富津市"): ("futtsu", "富津"),
    ("茨城県", "つくば市"): ("tsukuba", "つくば"),
    ("千葉県", "館山市"): ("tateyama", "館山"),
    ("千葉県", "木更津市"): ("kisarazu", "木更津"),
    ("長野県", "白馬村"): ("hakuba", "白馬"),
    ("神奈川県", "横浜市"): ("yokohama", "横浜"),
    ("千葉県", "いすみ市"): ("isumi", "いすみ"),
    ("神奈川県", "横須賀市"): ("yokosuka", "横須賀"),
    ("新潟県", "新潟市"): ("niigata-city", "新潟市"),
    ("栃木県", "那須塩原市"): ("nasushiobara", "那須塩原"),
    ("群馬県", "嬬恋村"): ("tsumagoi", "嬬恋"),
    ("静岡県", "浜松市"): ("hamamatsu", "浜松"),
    ("群馬県", "前橋市"): ("maebashi", "前橋"),
    ("静岡県", "下田市"): ("shimoda", "下田"),
    ("群馬県", "みなかみ町"): ("minakami", "みなかみ"),
    ("長野県", "茅野市"): ("chino", "茅野"),
    ("千葉県", "九十九里町"): ("kujukuri", "九十九里町"),
    ("宮城県", "蔵王町"): ("zao-miyagi", "蔵王町"),
    ("福島県", "福島市"): ("fukushima-city", "福島市"),
    ("長野県", "長野市"): ("nagano-city", "長野市"),
    ("東京都", "江東区"): ("koto", "江東区"),
    ("長野県", "安曇野市"): ("azumino", "安曇野"),
    ("山形県", "山形市"): ("yamagata-city", "山形市"),
    ("静岡県", "熱海市"): ("atami", "熱海"),
    ("千葉県", "柏市"): ("kashiwa", "柏"),
    ("宮城県", "仙台市"): ("sendai", "仙台"),
    ("福島県", "北塩原村"): ("kitashiobara", "北塩原・裏磐梯"),
    ("新潟県", "南魚沼市"): ("minamiuonuma", "南魚沼"),
    ("福島県", "いわき市"): ("iwaki", "いわき"),
    ("千葉県", "鴨川市"): ("kamogawa", "鴨川"),
    ("群馬県", "草津町"): ("kusatsu", "草津"),
    ("埼玉県", "秩父市"): ("chichibu", "秩父"),
    ("静岡県", "伊豆市"): ("izu-city", "伊豆市"),
    ("千葉県", "一宮町"): ("ichinomiya", "一宮町"),
    ("新潟県", "妙高市"): ("myoko", "妙高"),
    ("神奈川県", "鎌倉市"): ("kamakura", "鎌倉"),
    ("長野県", "松本市"): ("matsumoto", "松本"),
    ("静岡県", "静岡市"): ("shizuoka-city", "静岡市"),
    ("新潟県", "湯沢町"): ("yuzawa", "湯沢町"),
    ("山梨県", "南アルプス市"): ("minami-alps", "南アルプス市"),
    ("静岡県", "伊豆の国市"): ("izunokuni", "伊豆の国"),
    ("神奈川県", "相模原市"): ("sagamihara", "相模原"),
    ("埼玉県", "飯能市"): ("hanno", "飯能"),
    ("長野県", "山ノ内町"): ("yamanouchi", "山ノ内町"),
    ("埼玉県", "さいたま市"): ("saitama-city", "さいたま市"),
    # 今は MIN_ITEMS 未満。掲載が増えたら自動でページになる
    ("千葉県", "勝浦市"): ("katsuura", "勝浦"),
    ("山形県", "米沢市"): ("yonezawa", "米沢"),
    ("山形県", "酒田市"): ("sakata", "酒田"),
    ("茨城県", "水戸市"): ("mito", "水戸"),
    ("新潟県", "上越市"): ("joetsu", "上越"),
    ("千葉県", "袖ケ浦市"): ("sodegaura", "袖ケ浦"),
    ("東京都", "町田市"): ("machida", "町田"),
    ("神奈川県", "三浦市"): ("miura", "三浦"),
    ("千葉県", "山武市"): ("sammu", "山武"),
    ("群馬県", "渋川市"): ("shibukawa", "渋川"),
    ("群馬県", "長野原町"): ("naganohara", "長野原町"),
    ("茨城県", "大洗町"): ("oarai", "大洗"),
    ("埼玉県", "長瀞町"): ("nagatoro", "長瀞"),
    ("宮城県", "松島町"): ("matsushima", "松島"),
    ("東京都", "港区"): ("minato", "港区"),
    ("福島県", "郡山市"): ("koriyama", "郡山"),
    ("千葉県", "市原市"): ("ichihara", "市原"),
    ("長野県", "信濃町"): ("shinano", "信濃町"),
    ("群馬県", "片品村"): ("katashina", "片品"),
    ("神奈川県", "茅ヶ崎市"): ("chigasaki", "茅ヶ崎"),
    ("長野県", "原村"): ("hara", "原村"),
    ("東京都", "世田谷区"): ("setagaya", "世田谷区"),
    ("千葉県", "君津市"): ("kimitsu", "君津"),
    ("東京都", "八王子市"): ("hachioji", "八王子"),
    ("東京都", "練馬区"): ("nerima", "練馬区"),
    ("長野県", "上田市"): ("ueda", "上田"),
    ("埼玉県", "川越市"): ("kawagoe", "川越"),
    ("千葉県", "成田市"): ("narita", "成田"),
    ("長野県", "小諸市"): ("komoro", "小諸"),
    ("静岡県", "東伊豆町"): ("higashiizu", "東伊豆"),
    ("静岡県", "河津町"): ("kawazu", "河津"),
    ("神奈川県", "湯河原町"): ("yugawara", "湯河原"),
    ("静岡県", "南伊豆町"): ("minamiizu", "南伊豆"),
    ("山梨県", "富士吉田市"): ("fujiyoshida", "富士吉田"),
    ("長野県", "大町市"): ("omachi", "大町"),
    ("千葉県", "鋸南町"): ("kyonan", "鋸南"),
    ("福島県", "猪苗代町"): ("inawashiro", "猪苗代"),
    ("千葉県", "大多喜町"): ("otaki", "大多喜"),
    ("長野県", "須坂市"): ("suzaka", "須坂"),
    ("静岡県", "富士宮市"): ("fujinomiya", "富士宮"),
    ("千葉県", "松戸市"): ("matsudo", "松戸"),
    ("神奈川県", "川崎市"): ("kawasaki", "川崎"),
    ("山梨県", "笛吹市"): ("fuefuki", "笛吹"),
    ("東京都", "青梅市"): ("ome", "青梅"),
    ("東京都", "大田区"): ("ota", "大田区"),
    ("栃木県", "宇都宮市"): ("utsunomiya", "宇都宮"),
    ("宮城県", "亘理町"): ("watari", "亘理"),
    ("埼玉県", "川口市"): ("kawaguchi", "川口"),
}

# 複数の市町村にまたがる観光地。メンバーの市町村を決めておき、掲載は機械的に集める
GROUPS = [
    {"slug": "izu", "name": "伊豆", "pref": "静岡県",
     "members": [("静岡県", m) for m in ("熱海市", "伊東市", "伊豆市", "伊豆の国市", "函南町", "東伊豆町",
                                           "河津町", "下田市", "南伊豆町", "松崎町", "西伊豆町")]},
    {"slug": "fujigoko", "name": "富士五湖", "pref": "山梨県",
     "members": [("山梨県", m) for m in ("富士河口湖町", "山中湖村", "忍野村", "鳴沢村", "富士吉田市", "西桂町")]},
    {"slug": "south-boso", "name": "房総半島の南部", "pref": "千葉県",
     "members": [("千葉県", m) for m in ("館山市", "南房総市", "鴨川市", "鋸南町")]},
    {"slug": "kujukuri-coast", "name": "九十九里浜の沿岸", "pref": "千葉県",
     "members": [("千葉県", m) for m in ("旭市", "匝瑳市", "横芝光町", "山武市", "東金市", "九十九里町",
                                           "大網白里市", "白子町", "長生村", "一宮町")]},
    {"slug": "yatsugatake", "name": "八ヶ岳", "pref": None,
     "members": [("山梨県", "北杜市"), ("長野県", "茅野市"), ("長野県", "原村"), ("長野県", "富士見町"),
                 ("長野県", "南牧村")]},
]

# area の文字列に市区町村名が書かれていないときの読み替え(先頭一致)
ALIASES = {
    ("千葉県", "南房総"): "南房総市", ("千葉県", "柏"): "柏市", ("山形県", "山形"): "山形市",
    ("山梨県", "南アルプス"): "南アルプス市", ("山梨県", "山中湖"): "山中湖村",
    ("山梨県", "河口湖"): "富士河口湖町", ("山梨県", "石和温泉"): "笛吹市", ("山梨県", "笛吹"): "笛吹市",
    ("新潟県", "三条"): "三条市", ("東京都", "大田"): "大田区", ("東京都", "府中"): "府中市",
    ("栃木県", "川治温泉"): "日光市", ("栃木県", "那珂川"): "那珂川町", ("栃木県", "那須温泉"): "那須町",
    ("神奈川県", "元箱根"): "箱根町", ("神奈川県", "箱根"): "箱根町", ("神奈川県", "湯河原"): "湯河原町",
    ("福島県", "高湯温泉"): "福島市", ("群馬県", "伊香保"): "渋川市",
    ("長野県", "湯田中温泉"): "山ノ内町", ("長野県", "白馬"): "白馬村", ("長野県", "軽井沢"): "軽井沢町",
    ("静岡県", "下田"): "下田市", ("静岡県", "伊東"): "伊東市", ("静岡県", "伊豆高原"): "伊東市",
    ("静岡県", "伊豆急行伊豆高原駅"): "伊東市", ("静岡県", "浮山温泉"): "伊東市",
    ("静岡県", "伊豆長岡温泉"): "伊豆の国市", ("静岡県", "弓ヶ浜"): "南伊豆町",
}

# 市区町村名の途中に 町・村 を含むもの(機械的な切り出しで誤るもの)
KNOWN_NAMES = sorted({m for (_, m) in MUNIS} | set(ALIASES.values()) | {
    m for g in GROUPS for (_, m) in g["members"]} | {"東村山市", "武蔵村山市", "大町市"}, key=len, reverse=True)

KIND_LABELS = OrderedDict([
    ("run", "ドッグラン"), ("cafe", "カフェ・飲食"), ("park", "公園・散歩"), ("travel", "観光・体験"),
    ("animal", "動物とのふれあい"), ("rest-stop", "休憩所・道の駅"), ("shopping", "買い物"),
])
LODGING_FACTS = [("対象犬・頭数",), ("夜はどこで寝る？", "添い寝の条件"), ("ケージ・持参判断", "ケージはある？"),
                 ("食事同伴", "食事・一緒に過ごせる範囲")]
SPOT_FACTS = [("犬の条件・同伴範囲",), ("料金の目安/犬料金", "料金の目安", "料金・設備"), ("雨の日", "雨天・暑さ寒さ")]
FACT_LABELS = {"料金の目安/犬料金": "料金の目安"}

PREF_RE = re.compile(r"(東京都|北海道|京都府|大阪府|[^都道府県]{2,3}県)")


def split_area(text):
    """'長野県北佐久郡軽井沢町・南軽井沢' → ('長野県', '軽井沢町')。決められないところは ''。"""
    text = (text or "").strip()
    m = PREF_RE.match(text)
    if m:
        pref, rest = m.group(1), text[m.end():]
    elif text.startswith("千葉市"):
        pref, rest = "千葉県", text
    else:
        return "", ""
    head = re.split(r"[・ 　(（→]", rest, maxsplit=1)[0]
    head = re.sub(r"^[^郡]{1,4}郡", "", head)
    for name in KNOWN_NAMES:
        if head.startswith(name):
            return pref, name
    for (p, token), muni in ALIASES.items():
        if p == pref and head.startswith(token):
            return pref, muni
    m = re.match(r".+?[市町村区]", head)
    if not m:
        return pref, ""
    muni = m.group(0)
    if head[len(muni):len(muni) + 1] in ("市", "町", "村"):
        muni = head[:len(muni) + 1]
    return pref, muni


def locate(place):
    pref, muni = split_area(place["area"])
    if not muni:
        # area に市町村が無いときは、公式ページの住所(geocode.matched)を同じ県に限って使う
        geo = place.get("geocode") or {}
        if geo.get("precision") in ("facility", "town", "district"):
            gp, gm = split_area(geo.get("matched") or "")
            if gp == pref and gm:
                muni = gm
    return pref, muni


def usable_point(geo):
    if not geo or geo.get("precision") not in ("facility", "town", "district", "municipality"):
        return None
    lat, lon = geo.get("lat"), geo.get("lon")
    if lat is None or lon is None or not (34.0 <= lat <= 39.5 and 137.0 <= lon <= 142.0):
        return None
    return (lat, lon)


def km(a, b):
    lat1, lon1, lat2, lon2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 6371.0 * 2 * math.asin(math.sqrt(h))


# ---------------------------------------------------------------- 元ページから読むもの

def read_cards(path, pattern):
    text = path.read_text(encoding="utf-8")
    cards = {}
    for m in re.finditer(pattern, text, re.S):
        cards[m.group(1)] = m.group(0)
    return cards


def card_ad(card):
    """カードの中の広告ボタン(既存の URL と文言)を、そのまま取り出す。無ければ None。"""
    for m in re.finditer(r"<a\b([^>]*)>([^<]*)</a>", card):
        attrs, label = m.group(1), m.group(2)
        cls = re.search(r'class="([^"]*)"', attrs)
        rel = re.search(r'rel="([^"]*)"', attrs)
        href = re.search(r'href="([^"]*)"', attrs)
        if not (cls and rel and href) or "buy-ad" not in cls.group(1).split() or "sponsored" not in rel.group(1):
            continue
        label = html.unescape(label).strip()
        label = re.sub(r"^広告[｜|]\s*", "", label)
        label = re.sub(r"\s*[（(]広告[)）]$", "", label)
        return {"href": href.group(1), "label": label}
    return None


def card_checked(card, kind):
    if kind == "lodging":
        m = re.search(r"公式情報確認日：(\d{4}-\d{2}-\d{2})", card) or re.search(r'data-verified="(\d{4}-\d{2}-\d{2})"', card)
        return m.group(1) if m else ""
    m = re.search(r"公式情報確認：(\d{4})年(\d{1,2})月(\d{1,2})日", card)
    return "%s-%02d-%02d" % (m.group(1), int(m.group(2)), int(m.group(3))) if m else ""


# ---------------------------------------------------------------- データを組み立てる

def load():
    data = json.loads(PLACES.read_text(encoding="utf-8"))
    stays = read_cards(LODGING_HTML, r'<article class="stay-card[^"]*"[^>]*\bid="([^"]+)".*?</article>')
    trips = read_cards(TRIPS_HTML, r'<article class="trip[^"]*"[^>]*\bid="([^"]+)".*?</article>')
    items, skipped = [], []
    for order, p in enumerate(data["places"]):
        kind = p.get("type")
        card = (stays if kind == "lodging" else trips).get(p["id"])
        if kind not in ("lodging", "spot") or card is None:
            skipped.append(p["id"])
            continue
        pref, muni = locate(p)
        if pref not in PREFS:
            skipped.append(p["id"])
            continue
        official = next((l["url"] for l in p.get("links", []) if not l.get("affiliate") and l.get("url", "").startswith("http")), "")
        facts = []
        for keys in (LODGING_FACTS if kind == "lodging" else SPOT_FACTS):
            for k in keys:
                v = (p.get("facts") or {}).get(k)
                if v:
                    facts.append((FACT_LABELS.get(k, k), v))
                    break
        items.append({
            "id": p["id"], "kind": kind, "name": p["name"], "area": p["area"], "pref": pref, "muni": muni,
            "order": order, "facts": facts, "official": official,
            "co_sleep": p.get("co_sleep") or "", "theme": p.get("theme") or "",
            "kinds": [k for k in KIND_LABELS if k in (p.get("kinds") or [])],
            "checked": card_checked(card, kind) or (p.get("checked_at") or ""),
            "ad": card_ad(card) if kind == "lodging" else None,
            "plan": ("route-planner/?dest=%s" % p["id"]) in card,
            "point": usable_point(p.get("geocode")),
            "exact": (p.get("geocode") or {}).get("precision") == "facility" and usable_point(p.get("geocode")) is not None,
        })
    return items, skipped


def nearest_spots(items):
    spots = [i for i in items if i["kind"] == "spot" and i["exact"]]
    near = {}
    for s in items:
        if s["kind"] != "lodging" or not s["exact"]:
            continue
        best = None
        for t in spots:
            d = km(s["point"], t["point"])
            if d <= NEAR_SPOT_KM and (best is None or (d, t["order"]) < (best[0], best[1]["order"])):
                best = (d, t)
        if best:
            near[s["id"]] = best
    return near


def build_pages(items):
    by_pref, by_muni = defaultdict(list), defaultdict(list)
    for it in items:
        by_pref[it["pref"]].append(it)
        if it["muni"]:
            by_muni[(it["pref"], it["muni"])].append(it)
    pages, missing = OrderedDict(), []
    for pref, slug in PREFS.items():
        if len(by_pref[pref]) >= MIN_ITEMS:
            pages[slug] = {"slug": slug, "level": "pref", "pref": pref, "name": pref, "label": pref,
                           "items": by_pref[pref]}
    for key in sorted(by_muni, key=lambda k: (list(PREFS).index(k[0]), -len(by_muni[k]), k[1])):
        if len(by_muni[key]) < MIN_ITEMS:
            continue
        if key not in MUNIS:
            missing.append("%s%s(%d件)" % (key[0], key[1], len(by_muni[key])))
            continue
        slug, short = MUNIS[key]
        label = short if short == key[1] else "%s(%s%s)" % (short, key[0], key[1])
        pages[slug] = {"slug": slug, "level": "muni", "pref": key[0], "muni": key[1], "name": short,
                       "label": label, "items": by_muni[key]}
    for g in GROUPS:
        members = [m for m in g["members"] if by_muni.get(m)]
        its = [it for m in g["members"] for it in by_muni.get(m, [])]
        if len(its) < MIN_ITEMS or len(members) < 2:
            continue
        names = "・".join(m[1] for m in members)
        pages[g["slug"]] = {"slug": g["slug"], "level": "group", "pref": g["pref"], "name": g["name"],
                            "label": "%s(%s)" % (g["name"], names), "members": members, "items": its}
    for page in pages.values():
        page["items"] = sorted(page["items"], key=lambda i: (i["kind"] != "lodging", i["order"]))
        pts = [i["point"] for i in page["items"] if i["point"]]
        page["center"] = (sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts)) if pts else None
        page["lodging"] = [i for i in page["items"] if i["kind"] == "lodging"]
        page["spots"] = [i for i in page["items"] if i["kind"] == "spot"]
    return pages, missing, by_muni


# ---------------------------------------------------------------- HTML の部品

E = lambda s: html.escape(str(s), quote=True)

NAV = ('<a class="skip" href="#content">本文へ</a><nav class="site-nav" aria-label="メインナビゲーション">'
       '<a class="brand" href="../index.html"><img class="ui-icon" src="../assets/icons/paw-print.svg" alt="" width="22" height="22">'
       '<span>わんことのじかん</span></a><div class="nav-links">'
       '<a href="../route-planner/">旅行プラン</a><a href="../dog-lodging-guide.html">泊まる</a>'
       '<a href="../east-japan-dog-trips.html">お出かけ</a><a href="../travel-gear.html">旅行用品</a>'
       '<a href="../goods.html">犬用品</a><a href="../wear.html">犬服</a><a href="../food.html">主食</a></div></nav>'
       '<p class="pr-notice" role="note"><b>本ページはプロモーション(広告)を含みます。</b>'
       '紹介している宿のリンクから予約があると、運営者に紹介料が入ることがあります。</p>')

FOOTER = ('<footer><div><strong>わんことのじかん</strong>'
          '<p>犬の条件は各施設の公式情報をもとにまとめ、カードに確認日を載せています。料金・空室・犬の条件は変わることがあるため、'
          '予約や出発の前に公式の案内と予約画面で確かめてください。</p>'
          '<p><a href="../index.html">トップ</a> ・ <a href="./">地域から探す</a> ・ <a href="../dog-lodging-guide.html">泊まる</a> ・ '
          '<a href="../east-japan-dog-trips.html">お出かけ</a> ・ <a href="../route-planner/">旅行プラン</a> ・ '
          '<a href="../dog-trip-checklist.html">持ち物チェックリスト</a> ・ <a href="../contact.html">お問い合わせ</a></p>'
          '<p class="analytics-note">このサイトは、ページの閲覧数やどのページが見られたかを知るため Cloudflare Web Analytics を使っています。'
          'Cookie は使わず、個人を特定する情報は集めません。</p></div>'
          '<p class="policy-link"><a href="../contact.html#policy">運営と掲載の方針</a> ・ '
          '<a href="../contact.html">お問い合わせ・訂正のご連絡</a> ・ <a href="../for-facilities.html">施設・メーカーの皆さまへ(無料掲載)</a></p></footer>')

SCRIPTS = ("<!-- Cloudflare Web Analytics --><script type='module' src='https://static.cloudflareinsights.com/beacon.min.js' "
           "data-cf-beacon='{\"token\": \"2847001768a143df87fa4e78edba9c7e\"}'></script><!-- End Cloudflare Web Analytics -->\n"
           "<!-- valuecommerce-linkswitch --><script>var vc_pid = \"892714339\";</script>"
           "<script src=\"//aml.valuecommerce.com/vcdal.js\" async></script>\n")

AD_NOTE = ('<p class="ar-disclosure"><b>広告</b>「広告」と書いたボタンは予約サイトへのアフィリエイトリンクです。'
           '利用すると運営者に紹介料が入る場合があります(バリューコマースの LinkSwitch により、提携先へのリンクが広告リンクとして扱われることがあります)。'
           'カードの並びは掲載データの順で、報酬の有無では変えていません。</p>')

FAVICON = ("data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A//www.w3.org/2000/svg%27%20viewBox%3D%270%200%2064%2064%27%3E"
           "%3Crect%20width%3D%2764%27%20height%3D%2764%27%20rx%3D%2716%27%20fill%3D%27%230d5c4f%27/%3E%3Ccircle%20cx%3D%2722%27"
           "%20cy%3D%2722%27%20r%3D%277%27%20fill%3D%27%23fff%27/%3E%3Ccircle%20cx%3D%2742%27%20cy%3D%2722%27%20r%3D%277%27%20fill"
           "%3D%27%23fff%27/%3E%3Cellipse%20cx%3D%2732%27%20cy%3D%2739%27%20rx%3D%2717%27%20ry%3D%2713%27%20fill%3D%27%23fff%27/"
           "%3E%3C/svg%3E")


def canonical(path):
    """一覧ページ(areas/index.html)は sitemap・パンくずと同じ areas/ を正規の URL にする。"""
    return SITE + (path[:-len("index.html")] if path.endswith("/index.html") else path)


def head(title, desc, path, jsonld):
    url = canonical(path)
    ld = "".join('<script type="application/ld+json">%s</script>' % json.dumps(d, ensure_ascii=False, separators=(",", ":"))
                 .replace("</", "<\\/") for d in jsonld)
    return ('<!doctype html>\n<html lang="ja">\n<head>\n<meta charset="utf-8">\n'
            '<meta name="viewport" content="width=device-width,initial-scale=1">\n'
            '<link rel="icon" type="image/svg+xml" href="%s">\n<title>%s</title>\n'
            '<meta name="description" content="%s">\n<link rel="canonical" href="%s">\n'
            '<meta name="robots" content="index,follow">\n<meta property="og:site_name" content="わんことのじかん">\n'
            '<meta property="og:title" content="%s">\n<meta property="og:description" content="%s">\n'
            '<meta property="og:url" content="%s">\n<meta property="og:type" content="website">\n'
            '<meta property="og:locale" content="ja_JP">\n'
            '<meta property="og:image" content="%sassets/og/og-stay.jpg">\n<meta property="og:image:width" content="1200">\n'
            '<meta property="og:image:height" content="630">\n<meta property="og:image:alt" content="芝生で遊ぶダックスフンド">\n'
            '<meta name="twitter:card" content="summary_large_image">\n'
            '<link rel="stylesheet" href="../assets/editorial.css?v=20261019-perf">\n<link rel="stylesheet" href="%s">\n'
            '<link rel="stylesheet" href="../assets/design-fixes.css?v=20261019">\n%s\n</head>\n'
            % (FAVICON, E(title), E(desc), E(url), E(title), E(desc), E(url), SITE, CSS_HREF, ld))


def breadcrumb(trail):
    """trail: [(name, path or None)]。最後は今のページ。"""
    lis = []
    for i, (name, path) in enumerate(trail):
        if i == len(trail) - 1:
            lis.append('<li aria-current="page">%s</li>' % E(name))
        else:
            lis.append('<li><a href="%s">%s</a></li>' % (E(path), E(name)))
    return '<nav class="ar-crumbs" aria-label="パンくずリスト"><ol>%s</ol></nav>' % "".join(lis)


def breadcrumb_ld(trail, self_path):
    elems = []
    for i, (name, path) in enumerate(trail):
        full = canonical(self_path) if i == len(trail) - 1 else SITE + _abs(path, self_path)
        elems.append({"@type": "ListItem", "position": i + 1, "name": name, "item": full})
    return {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": elems}


def _abs(rel, self_path):
    base = self_path.rsplit("/", 1)[0] + "/" if "/" in self_path else ""
    if rel.startswith("../"):
        return rel[3:] if rel != "../" else ""
    if rel == "./":
        return base
    return base + rel


def card_url(it):
    return ("dog-lodging-guide.html#" if it["kind"] == "lodging" else "east-japan-dog-trips.html#") + it["id"]


def render_card(it, near, hl, local_ids=()):
    out = ['<article class="ar-card" id="%s">' % E(it["id"])]
    out.append('<p class="ar-card-area">%s</p><h%d class="ar-card-name">%s</h%d>' % (E(it["area"]), hl, E(it["name"]), hl))
    tags = []
    if it["kind"] == "lodging" and it["co_sleep"]:
        tags.append(it["co_sleep"])
    tags += [KIND_LABELS[k] for k in it["kinds"]]
    if tags:
        out.append('<ul class="ar-tags">%s</ul>' % "".join("<li>%s</li>" % E(t) for t in tags))
    if it["theme"]:
        out.append('<p class="ar-theme">%s</p>' % E(it["theme"]))
    if it["facts"]:
        out.append('<dl class="ar-facts">%s</dl>' % "".join("<div><dt>%s</dt><dd>%s</dd></div>" % (E(k), E(v)) for k, v in it["facts"]))
    if it["id"] in near:
        d, s = near[it["id"]]
        href = "#" + s["id"] if s["id"] in local_ids else "../" + card_url(s)
        out.append('<p class="ar-near">近くの犬とおでかけ: <a href="%s">%s</a>(直線で約 %.1f km)</p>' % (E(href), E(s["name"]), d))
    if it["checked"]:
        out.append('<p class="ar-checked">公式情報の確認日: %s。料金・条件は予約や出発の前に確かめてください。</p>' % E(it["checked"]))
    acts = []
    if it["ad"]:
        acts.append('<p class="ar-ad"><span class="ar-ad-tag">広告</span><a class="ar-btn" href="%s" target="_blank" '
                    'rel="sponsored nofollow noopener">%s ↗</a></p>' % (E(html.unescape(it["ad"]["href"])), E(it["ad"]["label"])))
        # 元カードの href は HTML の属性値のまま(& が生のこともある)なので、一度戻してから付け直す(URL は同じ)
    links = []
    if it["official"]:
        links.append('<a class="ar-btn ar-btn-line" href="%s" target="_blank" rel="noopener">公式の条件を確認 ↗</a>' % E(it["official"]))
    what = "この宿" if it["kind"] == "lodging" else "この場所"
    page = "宿の比較ページ" if it["kind"] == "lodging" else "おでかけページ"
    links.append('<a class="ar-btn ar-btn-line" href="../%s">%sで、%sの条件をすべて見る</a>' % (E(card_url(it)), page, what))
    acts.append('<p class="ar-links">%s</p>' % "".join(links))
    if it["plan"]:
        acts.append('<p class="ar-plan"><a href="../route-planner/?dest=%s">ここへの旅行プラン(出発地からの時間と休憩先)を作る</a></p>' % E(it["id"]))
    out.append('<div class="ar-actions">%s</div></article>' % "".join(acts))
    return "".join(out)


def count_text(page):
    parts = []
    if page["lodging"]:
        parts.append("宿 %d 軒" % len(page["lodging"]))
    if page["spots"]:
        parts.append("おでかけ %d か所" % len(page["spots"]))
    return "・".join(parts)


def subject_text(page):
    if page["lodging"] and page["spots"]:
        return "犬と泊まれる宿・犬とおでかけ"
    return "犬と泊まれる宿" if page["lodging"] else "犬とおでかけ"


def intro(page, near, child_pages):
    L, S = page["lodging"], page["spots"]
    where = page["label"]
    ps = []
    first = "%sで、" % where
    if L and S:
        first += "犬と泊まれる宿 %d 軒と、犬とおでかけできる場所 %d か所を載せています。" % (len(L), len(S))
    elif L:
        first += "犬と泊まれる宿 %d 軒を載せています(おでかけ先はまだ掲載がありません)。" % len(L)
    else:
        first += "犬とおでかけできる場所 %d か所を載せています(犬と泊まれる宿はまだ掲載がありません)。" % len(S)
    first += "犬の条件は各施設の公式情報をもとにまとめ、カードごとに確認日を載せています。"
    ps.append(first)
    if L:
        c = Counter(i["co_sleep"].replace("添い寝 ", "") for i in L if i["co_sleep"])
        bits = ["「%s」%d 軒" % (k, c[k]) for k in ("可", "条件付き可", "不可") if c.get(k)]
        rest = len(L) - sum(c.get(k, 0) for k in ("可", "条件付き可", "不可"))
        line = "宿の添い寝(人のベッドや布団で一緒に寝ること)は、" + ("・".join(bits) + "で、" if bits else "")
        line += ("残りの %d 軒は公式情報からは決められないため、予約前に確認が必要です。" % rest) if rest else "すべて公式情報で確かめられました。"
        ps.append(line)
    if S:
        c = Counter(k for i in S for k in i["kinds"])
        bits = ["%s %d か所" % (KIND_LABELS[k], c[k]) for k in KIND_LABELS if c.get(k)]
        if bits:
            ps.append("おでかけ先の内訳は、%sです(1 か所が複数に当てはまることがあります)。" % "・".join(bits))
    if L and S:
        n = sum(1 for i in L if i["id"] in near)
        if n:
            ps.append("宿から直線 %d km 以内に、このサイトに載っているおでかけ先がある宿は %d 軒です。"
                      "宿のカードに、いちばん近いおでかけ先を載せているので、泊まる場所と立ち寄り先を組み合わせて選べます。" % (NEAR_SPOT_KM, n))
    if child_pages:
        ps.append("市町村や観光地ごとのページもあります: %s。" % "・".join(
            '<a href="%s.html">%s</a>' % (E(c["slug"]), E(c["name"])) for c in child_pages))
        return "".join("<p>%s</p>" % (E(p) if i < len(ps) - 1 else p) for i, p in enumerate(ps))
    return "".join("<p>%s</p>" % E(p) for p in ps)


def neighbors(page, pages):
    if not page["center"]:
        return []
    if page["level"] == "pref":
        pool = [p for p in pages.values() if p["level"] == "pref" and p is not page]
    else:
        own = set(page.get("members") or [(page["pref"], page.get("muni"))])
        pool = []
        for p in pages.values():
            if p is page or p["level"] == "pref":
                continue
            other = set(p.get("members") or [(p["pref"], p.get("muni"))])
            if own & other:
                continue
            pool.append(p)
    pool = [p for p in pool if p["center"]]
    pool.sort(key=lambda p: (round(km(page["center"], p["center"]), 3), p["slug"]))
    return pool[:NEIGHBORS]


def related(page, pages):
    """県ページ → その県の市町村・観光地ページ。市町村 → それを含む観光地。観光地 → メンバーの市町村ページ。"""
    if page["level"] == "pref":
        return [p for p in pages.values() if p["level"] != "pref" and p["pref"] == page["pref"]]
    if page["level"] == "muni":
        key = (page["pref"], page["muni"])
        return [p for p in pages.values() if p["level"] == "group" and key in p["members"]]
    return [p for p in pages.values() if p["level"] == "muni" and (p["pref"], p["muni"]) in page["members"]]


def render_rows(items, page):
    """県ページで、自分のページがある市町村の掲載は 1 行ずつにする(カードはそのページで見られる)。"""
    rows = "".join('<li><a href="%s.html#%s">%s</a><span>%s</span></li>' % (E(page["slug"]), E(i["id"]), E(i["name"]), E(i["area"]))
                   for i in items)
    return ('<ul class="ar-rows">%s</ul><p class="ar-rows-more"><a class="ar-btn ar-btn-line" href="%s.html">'
            '%sのページで、犬の条件と予約先を見る</a></p>' % (rows, E(page["slug"]), E(page["name"])))


def section(title, sid, items, near, grouped, cta, muni_pages=None, local_ids=()):
    out = ['<section class="ar-section" id="%s" aria-labelledby="%s-h"><h2 id="%s-h">%s <span>%d %s</span></h2>'
           % (sid, sid, sid, E(title), len(items), "軒" if sid == "stays" else "か所")]
    if grouped:
        groups = OrderedDict()
        for it in sorted(items, key=lambda i: i["order"]):
            groups.setdefault(it["muni"] or "市町村の記載がない掲載", []).append(it)
        order = sorted(groups, key=lambda k: (-len(groups[k]), k))
        out.append('<p class="ar-jump">%s</p>' % " ".join(
            '<a href="#%s-%d">%s %d</a>' % (sid, n, E(k), len(groups[k])) for n, k in enumerate(order)))
        for n, k in enumerate(order):
            own = (muni_pages or {}).get(k)
            inner = render_rows(groups[k], own) if own else '<div class="ar-grid">%s</div>' % "".join(
                render_card(i, near, 4, local_ids) for i in groups[k])
            out.append('<h3 class="ar-muni" id="%s-%d">%s <span>%d</span></h3>%s' % (sid, n, E(k), len(groups[k]), inner))
    else:
        out.append('<div class="ar-grid">%s</div>' % "".join(render_card(i, near, 3, local_ids) for i in items))
    out.append('<p class="ar-more"><a class="ar-btn ar-btn-line" href="%s">%s</a></p></section>' % cta)
    return "".join(out)


def render_page(page, pages, near):
    path = "areas/%s.html" % page["slug"]
    subj = subject_text(page)
    title_name = "%s(%s)" % (page["name"], page["pref"]) if page["level"] == "muni" else page["name"]
    title = "%sの%s(%s)｜わんことのじかん" % (title_name, subj, count_text(page))
    loc = page["label"]
    desc = ("%sの%sを、%sまとめました。" % (loc, subj, count_text(page).replace("・", "と"))
            + ("添い寝・ケージ・頭数・食事同伴など" if page["lodging"] else "同伴範囲・料金の目安・雨の日など")
            + "犬の条件を公式情報から整理し、確認日を載せています。")
    trail = [("トップ", "../index.html"), ("地域から探す", "./")]
    if page["level"] != "pref" and page["pref"] and PREFS.get(page["pref"]) in pages:
        trail.append((page["pref"], "%s.html" % PREFS[page["pref"]]))
    trail.append((page["name"], None))
    elements = [{"@type": "ListItem", "position": n + 1, "name": it["name"], "url": SITE + card_url(it)}
                for n, it in enumerate(page["items"])]
    item_ld = {"@context": "https://schema.org", "@type": "ItemList", "name": "%sの%s" % (page["name"], subj),
               "numberOfItems": len(elements), "itemListElement": elements}
    rel = related(page, pages)
    near_pages = neighbors(page, pages)
    grouped = page["level"] != "muni" and len({i["muni"] for i in page["items"]}) > 1
    muni_pages = {p["muni"]: p for p in rel if p["level"] == "muni"} if page["level"] == "pref" else None
    # 同じページにカードとして出ているものだけ、ページ内リンクにする(県ページで 1 行表示のものは除く)
    local_ids = {i["id"] for i in page["items"] if not (muni_pages and i["muni"] in muni_pages)}
    body = [head(title, desc, path, [breadcrumb_ld(trail, path), item_ld]),
            '<body class="wanko-editorial-v1 guide-page area-page">', NAV,
            '<header class="ar-hero">', breadcrumb(trail),
            '<h1>%sの%s</h1>' % (E(page["label"] if page["level"] == "muni" else page["name"]), subj),
            '<div class="ar-lead">%s</div>' % intro(page, near, rel if page["level"] != "muni" else []),
            '<p class="ar-summary">']
    if page["lodging"]:
        body.append('<a href="#stays">犬と泊まれる宿 %d 軒を見る ↓</a>' % len(page["lodging"]))
    if page["spots"]:
        body.append('<a href="#outings">犬とおでかけ %d か所を見る ↓</a>' % len(page["spots"]))
    body.append('<a href="#nearby">近くの地域を見る ↓</a></p></header><main id="content" class="ar-main">')
    body.append(AD_NOTE if any(i["ad"] for i in page["lodging"]) else "")
    if page["lodging"]:
        body.append(section("%sの犬と泊まれる宿" % page["name"], "stays", page["lodging"], near, grouped,
                            ("../dog-lodging-guide.html#stay-query", "宿の比較ページで、ほかの地域の宿と条件をしぼって探す"), muni_pages, local_ids))
    if page["spots"]:
        body.append(section("%sの犬とおでかけ" % page["name"], "outings", page["spots"], near, grouped,
                            ("../east-japan-dog-trips.html", "おでかけページで、ほかの地域のおでかけ先を探す"), muni_pages, local_ids))
    body.append('<section class="ar-section ar-nearby" id="nearby" aria-labelledby="nearby-h"><h2 id="nearby-h">近くの地域</h2>')
    if rel and page["level"] == "muni":
        body.append('<p>この地域を含むページ: %s</p>' % "・".join(
            '<a href="%s.html">%s(%s)</a>' % (E(p["slug"]), E(p["name"]), count_text(p)) for p in rel))
    if near_pages:
        body.append('<p class="ar-note">掲載している施設の位置から、中心が近い順に並べています。</p><ul class="ar-area-list">%s</ul>' % "".join(
            '<li><a href="%s.html"><b>%s</b><span>%s</span></a></li>' % (E(p["slug"]), E(p["name"]), count_text(p)) for p in near_pages))
    body.append('<p><a class="ar-btn ar-btn-line" href="./">地域の一覧から探す</a></p></section>')
    body.append('<p class="ar-note ar-data-note">このページは掲載データ(宿 %d 軒・おでかけ %d か所)から自動で作っています。'
                '施設の情報の誤りや変更は<a href="../contact.html">お問い合わせ</a>からお知らせください。</p>'
                % (len(page["lodging"]), len(page["spots"])))
    body.append("</main>" + FOOTER + SCRIPTS + "</body>\n</html>\n")
    return "".join(body)


def render_index(pages, items, by_muni):
    path = "areas/index.html"
    nL = sum(1 for i in items if i["kind"] == "lodging")
    nS = sum(1 for i in items if i["kind"] == "spot")
    local = [p for p in pages.values() if p["level"] != "pref"]
    title = "地域から探す 犬と泊まれる宿・犬とおでかけ(%d 地域)｜わんことのじかん" % len(pages)
    desc = ("軽井沢・那須・伊豆・箱根・河口湖など、東日本 %d 地域の犬と泊まれる宿と犬とおでかけ先を、地域ごとのページで探せます。"
            "宿 %d 軒・おでかけ %d か所の犬の条件を公式情報から整理しています。" % (len(pages), nL, nS))
    trail = [("トップ", "../index.html"), ("地域から探す", None)]
    elements = [{"@type": "ListItem", "position": n + 1, "name": "%sの%s" % (p["name"], subject_text(p)),
                 "url": SITE + "areas/%s.html" % p["slug"]} for n, p in enumerate(pages.values())]
    item_ld = {"@context": "https://schema.org", "@type": "ItemList", "name": "地域別の犬と泊まれる宿・犬とおでかけ",
               "numberOfItems": len(elements), "itemListElement": elements}
    out = [head(title, desc, path, [breadcrumb_ld(trail, path), item_ld]),
           '<body class="wanko-editorial-v1 guide-page area-page">', NAV, '<header class="ar-hero">', breadcrumb(trail),
           '<h1>地域から、犬と泊まれる宿とおでかけ先を探す</h1><div class="ar-lead">',
           '<p>このサイトに載っている犬と泊まれる宿 %d 軒と、犬とおでかけできる場所 %d か所を、県・市町村・観光地ごとのページにまとめました。'
           '掲載が %d 件以上ある地域にページがあります(全 %d ページ)。</p>' % (nL, nS, MIN_ITEMS, len(pages)),
           '<p>どのページも、宿とおでかけ先を同じ地域でまとめて見られます。宿のカードには、近くにあるおでかけ先も載せています。</p></div>',
           '<p class="ar-summary"><a href="#prefs">県から探す ↓</a><a href="#spots">観光地のまとまりから探す ↓</a></p></header>',
           '<main id="content" class="ar-main">']
    out.append('<section class="ar-section" id="prefs" aria-labelledby="prefs-h"><h2 id="prefs-h">県から探す</h2><div class="ar-pref-grid">')
    for pref, slug in PREFS.items():
        if slug not in pages:
            continue
        p = pages[slug]
        kids = [c for c in local if c["level"] == "muni" and c["pref"] == pref]
        others = sorted(((m, len(v)) for (pp, m), v in by_muni.items() if pp == pref and (pp, m) not in
                         {(c["pref"], c["muni"]) for c in kids}), key=lambda x: (-x[1], x[0]))
        out.append('<section class="ar-pref" aria-labelledby="pref-%s"><h3 id="pref-%s"><a href="%s.html">%s</a> <span>%s</span></h3>'
                   % (slug, slug, slug, E(pref), count_text(p)))
        if kids:
            out.append('<ul class="ar-chips">%s</ul>' % "".join(
                '<li><a href="%s.html">%s <span>%d</span></a></li>' % (E(c["slug"]), E(c["name"]), len(c["items"])) for c in kids))
        if others:
            shown = others[:8]
            out.append('<p class="ar-note">ほかの市町村: %s%s(%sのページで見られます)</p>' % (
                "・".join("%s %d" % (E(m), n) for m, n in shown), " ほか" if len(others) > len(shown) else "", E(pref)))
        out.append('<p><a class="ar-btn ar-btn-line" href="%s.html">%sの宿とおでかけを見る</a></p></section>' % (slug, E(pref)))
    out.append('</div></section>')
    groups = [p for p in local if p["level"] == "group"]
    if groups:
        out.append('<section class="ar-section" id="spots" aria-labelledby="spots-h"><h2 id="spots-h">観光地のまとまりから探す</h2>'
                   '<p class="ar-note">いくつかの市町村にまたがる観光地です。含まれる市町村をかっこ内に書いています。</p><ul class="ar-area-list">')
        out.append("".join('<li><a href="%s.html"><b>%s</b><span>%s</span><small>%s</small></a></li>'
                           % (E(g["slug"]), E(g["name"]), count_text(g), E("・".join(m[1] for m in g["members"]))) for g in groups))
        out.append('</ul></section>')
    out.append('<p class="ar-note ar-data-note">地域の分け方は、各施設の所在地(市区町村)をもとに機械的に決めています。'
               '県をまたぐ観光地(八ヶ岳など)は、含まれる市町村をページの中に書いています。</p>')
    out.append("</main>" + FOOTER + SCRIPTS + "</body>\n</html>\n")
    return "".join(out)


def update_sitemap(text, slugs):
    lines = [l for l in text.splitlines() if "/areas/" not in l]
    end = max(i for i, l in enumerate(lines) if "</urlset>" in l)
    add = ["  <url><loc>%sareas/%s</loc></url>" % (SITE, s) for s in ["" ] + ["%s.html" % s for s in slugs]]
    return "\n".join(lines[:end] + add + lines[end:]) + "\n"


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--check", action="store_true", help="ファイルを書き換えず、変わるファイルだけを表示する")
    args = ap.parse_args()

    items, skipped = load()
    near = nearest_spots(items)
    pages, missing, by_muni = build_pages(items)

    outputs = OrderedDict()
    outputs[OUT_DIR / "index.html"] = render_index(pages, items, by_muni)
    for page in pages.values():
        outputs[OUT_DIR / ("%s.html" % page["slug"])] = render_page(page, pages, near)
    outputs[SITEMAP] = update_sitemap(SITEMAP.read_text(encoding="utf-8"), sorted(pages))

    stale = sorted(p for p in OUT_DIR.glob("*.html") if p not in outputs) if OUT_DIR.exists() else []
    changed = [p for p, t in outputs.items() if not p.exists() or p.read_text(encoding="utf-8") != t]
    if args.check:
        for p in changed + stale:
            print("変わる: %s" % p.relative_to(ROOT))
        print("変わるファイル %d 件" % (len(changed) + len(stale)))
        return 1 if changed or stale else 0
    OUT_DIR.mkdir(exist_ok=True)
    for p in changed:
        p.write_text(outputs[p], encoding="utf-8")
    for p in stale:
        p.unlink()

    levels = Counter(p["level"] for p in pages.values())
    print("地域ページ %d(県 %d・市区町村 %d・観光地 %d)+ 一覧 1。書き換え %d、削除 %d"
          % (len(pages), levels["pref"], levels["muni"], levels["group"], len(changed), len(stale)))
    print("掲載: 宿 %d・おでかけ %d(元ページにカードが無いため外したもの %d)"
          % (sum(i["kind"] == "lodging" for i in items), sum(i["kind"] == "spot" for i in items), len(skipped)))
    if skipped:
        print("  外した id: %s" % ", ".join(skipped))
    if missing:
        print("slug が無いためページを作れなかった市区町村(MUNIS に足してください): %s" % "、".join(missing), file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
