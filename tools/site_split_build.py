#!/usr/bin/env python3
r"""大きすぎる 4 ページ(宿・主食・用品・犬服)を、全件ページ(*-all.html)から分けたページに組み立てる(2026-11-04 公開)。

元は wanko-route-planner/handoff/research/push-20261103/site-split/split_preview.py(試作)。設計は同じフォルダの 00-SUMMARY.md。

- 原本は全件ページ: dog-lodging-all.html / food-all.html / goods-all.html / wear-all.html(noindex,follow)。
  カードを足す・直す道具は、すべて全件ページを書き換える(tools/site_pages.py の PAGE_FILE)。
- このツールが作るもの(何度実行しても、入力が同じなら同じ結果):
    dog-lodging-guide.html   宿の入口(県から探す+各県 2 軒の代表カード)。県のページ areas/<県>.html は build_area_pages.py が作る
    food.html / food-<区分>.html            主食の入口と年齢・用途別のページ
    goods.html / goods-<場面・困りごと>.html  用品の入口とカテゴリ別・困りごと別のページ
    wear.html / wear-<用途>.html            犬服の入口と用途別のページ
    assets/split-map.json    旧リンク(#カード id・?pick=・?problem= など)→ 新しいページの対応表
    assets/split-entry.js / assets/split-pages.css
    sitemap.xml              areas/ 以外の行(分けたページを入口の後ろに足し、全行に lastmod)。areas/ の行は build_area_pages.py
  全件ページ自身は、head(noindex・題名の件数)とパンくずの注記だけをそろえる(カードの中身は触らない)。
- 分けたページが 1 枚でも 1.5MB を超えたら、何も書かずに止める(終了コード 2)。
- 順番: カードの道具(*-all.html)→ このツール → build_area_pages.py → build_search_index.py(site_generated_check.py が順に実行する)

使い方(リポジトリの一番上で):
    python tools/site_split_build.py                     # 組み立てる
    python tools/site_split_build.py --check             # 書き換えずに、変わるファイルだけを表示(差があれば終了コード 1)
    python tools/site_split_build.py --rewrite-site-links  # 1 回だけ: サイト全体の旧リンクを新しいページへ書き換える(公開時に実行済み)
"""
import argparse
import datetime
import html as H
import json
import re
import subprocess
import sys
from collections import OrderedDict
from pathlib import Path
from urllib.parse import parse_qsl, unquote

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_area_pages as B  # noqa: E402  (宿の県の決まり PREFS・MIN_ITEMS・load() を地域ページと共有する)

BASE = "https://sorapapa-creator.github.io/wanko-affiliate-guide/"
VER = "20261104b"
SPLIT_CSS_HREF = f"assets/split-pages.css?v={VER}"
SIZE_LIMIT = 1.5e6      # 分けたページ(全件ページを除く)がこれを超えたら止める
ALL_START, ALL_END = "<!-- split-all:start -->", "<!-- split-all:end -->"

# 入口・全件ページの題名と説明(分ける前の 4 ページのもの)
ENTRANCE = {
    "food": ("犬の主食・フードを根拠で選ぶ（主食・フードの比較）｜わんことのじかん",
             "犬の主食・フードを、公式表示の原材料・対象年齢・粒や食感・1日の費用で比べられます。食べムラ、体重管理、無添加のこだわりから絞り込み。ロイヤルカナンの選び方も。"),
    "goods": ("毎日の犬用品を困りごとから選ぶ（散歩・ケア・給餌・知育）｜わんことのじかん",
              "散歩の安全、被毛・爪・口のケア、食器や給水、知育おもちゃ、犬服。困りごとから、メーカー公式の仕様で確認した犬用品を選べます。"),
    "wear": ("犬服・ウェアを用途とサイズで選ぶ（レイン・防寒・暑さ対策・マナー）｜わんことのじかん",
             "犬服・ドッグウェアを、レインウェア・防寒・暑さ対策・マナーウェア・ライフジャケット・術後の保護・普段着の用途と、超小型〜大型のサイズ帯で絞り込み。ブランド公式ストアの仕様で確認した候補と、サイズの測り方。"),
}

# ---------------------------------------------------------------- 商品ページの分け方(試作 11/04 版と同じ)
# FOOD_GROUPS の順は「どのページに入れるか」の判定順(上から当てはめ、1 枚は 1 ページだけ)。見せる順は FOOD_ROWS。
RC_NOTE = "ロイヤルカナンの商品はロイヤルカナンのページにまとめています。"
FOOD_GROUPS = [
    ("royalcanin", "ロイヤルカナンの主食", "ロイヤルカナンの商品です(犬種・サイズ・年齢別)。療法食・ミルク・トリーツは専用の一覧で分けています。"),
    ("treats", "おやつ・トッピング・一般食", "総合栄養食の表示が確認できない商品(おやつ、トッピング、一般食、用途を確認中のもの)です。毎日の主食の代わりにはしません。"),
    ("weight", "体重管理の主食", "メーカーの表示に体重管理の設計がある主食です。年齢区分はカードの表示で確認できます。" + RC_NOTE),
    ("puppy", "子犬の主食", "対象年齢の公式表示に「子犬」があり、成犬・シニア・全年齢の表示がない主食です。月齢の範囲と給与量は商品ごとに確認してください。" + RC_NOTE),
    ("senior", "シニア犬の主食", "対象年齢の公式表示に「シニア」があり、全年齢の表示がない主食です。何歳から切り替えるかは商品ごとの表示で確認してください。" + RC_NOTE),
    ("all-ages", "全年齢の主食", "対象年齢の公式表示が「全年齢」(オールステージ)の主食です。子犬期・シニア期の給与量は商品ごとに違います。" + RC_NOTE),
    ("adult", "成犬の主食", "対象年齢の公式表示が成犬向けの主食です。" + RC_NOTE),
    ("age-check", "対象年齢を商品ごとに確かめる主食", "年齢区分の表示をまだ取り込めていない主食です。カードの公式リンクで対象年齢を確認してください。"),
]
# 11/04 オーナー決定 3: 年齢の順。ブランドは最後。
FOOD_ROWS = [("年齢から", ["puppy", "adult", "senior", "all-ages"]),
             ("用途・ブランドから", ["weight", "treats", "age-check", "royalcanin"])]
FOOD_SHORT = {"royalcanin": "ロイヤルカナン", "treats": "おやつ・トッピング", "weight": "体重管理", "puppy": "子犬",
              "senior": "シニア", "all-ages": "全年齢", "adult": "成犬", "age-check": "対象年齢を確かめる"}
GOODS_GROUPS = [
    ("walk", "散歩・お出かけの安全", {"散歩・安全", "散歩・排泄", "散歩後ケア", "散歩・衛生", "散歩・給水", "足・路面対策", "寒さ対策・防寒"},
     "リード・ハーネス・迷子札・散歩の持ち物・散歩後の足ふきなど、散歩の場面の用品です(寒さ対策の小物を含む)。"),
    ("play", "知育・留守番", {"知育・留守番"}, "知育おもちゃ・留守番・見守りの用品です。"),
    ("coat", "被毛・皮膚のケア", {"被毛・皮膚ケア", "被毛ケア", "耳・皮膚ケア"}, "ブラシ・シャンプー・皮膚と耳のお手入れ用品です。"),
    ("feeding", "食器・給水", {"給餌・水分"}, "食器・給水器・早食い対策の食器・フードの保存用品です。"),
    ("senior", "シニア・介護", {"シニア・介護"}, "足腰の負担を減らす用品・介護用品です。"),
    ("care", "爪・足・口のケア", {"爪・足ケア", "口腔ケア", "毎日のケア"}, "爪切り・肉球・歯みがきなど、毎日のお手入れ用品です。"),
    ("toilet", "トイレ・衛生", {"排泄・衛生", "排泄・臭い"}, "トイレ・消臭・衛生用品です。"),
]
# 11/04 オーナー決定 4: 用品の困りごと別ページ。(slug, 名前, まとめる困りごと)
GOODS_PROBLEM_GROUPS = [
    ("daily-care", "毎日のケア", ["毎日のケア"]),
    ("safety", "安全・迷子", ["安全・迷子"]),
    ("eating", "早食い・食べムラ・体重管理", ["早食い", "食べムラ・お腹", "体重管理"]),
    ("odor", "臭い・排泄", ["臭い・排泄"]),
    ("hydration", "水分補給・暑さ対策", ["水分補給", "暑さ対策"]),
    ("travel-prep", "旅行準備・車移動", ["旅行準備", "車移動"]),
    ("after-walk", "散歩後ケア・雨や泥の汚れ", ["散歩後ケア", "雨・泥汚れ"]),
    ("calm-stay", "宿で落ち着く", ["宿で落ち着く"]),
    ("training", "しつけ・ごほうび", ["しつけ・ごほうび"]),
    ("cold", "寒さ対策", ["寒さ対策"]),
    ("senior-burden", "シニア・負担", ["シニア・負担"]),
]
PROBLEM_MIN = 3          # これ未満の困りごとはページにしない
SAME_AS_CATEGORY = 0.9   # カテゴリのページとの重なり(共通/和集合)がこれ以上なら、ページを作らずそのカテゴリへ送る
WEAR_GROUPS = [
    ("daily", "オシャレ番長(普段着)", {"オシャレ番長"}, ["daily"], "普段着・おしゃれ着です。サイズは胴回りの実寸で確かめます。"),
    ("cold", "防寒ウェア", {"防寒ウェア"}, ["cold"], "朝晩の冷え・冬の散歩向けの防寒ウェアです。"),
    ("rain", "レインウェア", {"レインウェア"}, ["rain"], "レインコート・ポンチョなど雨の散歩向けのウェアです。"),
    ("summer", "暑さ対策・水辺のウェア", {"暑さ対策ウェア", "水辺・ライフジャケット"}, ["cool", "cooling", "water"], "クールウェアと、水辺で着るライフジャケットです。"),
    ("manner", "マナーウェア", {"マナーウェア"}, ["manner"], "宿・お店でのマナーウェア(マナーパンツ・抜け毛対策)です。"),
    ("care", "術後・介護のウェア", {"術後・保護ウェア", "ウェルネス・介護"}, ["protect", "care"], "術後の保護服と、介護・ウェルネスのウェアです。"),
]
# 宿の入口で県を並べる順(試作 11/04 版と同じ。首都圏から)
ENTRANCE_PREF_ORDER = ["東京都", "神奈川県", "千葉県", "埼玉県", "茨城県", "栃木県", "群馬県", "山梨県", "長野県", "新潟県",
                       "静岡県", "福島県", "宮城県", "山形県"]
PER_GROUP_SAMPLE = 6   # 商品の入口ページに残す代表カード(カテゴリごと)
PER_PREF_SAMPLE = 2    # 宿の入口ページに残す代表カード(県ごと)

OLD_PAGES = ("dog-lodging-guide", "food", "goods", "wear")
GENERATED_RE = re.compile(r"^(?:food|goods|wear)-(?!all\.html$)[a-z0-9-]+\.html$")


class Out:
    """書き出すファイルを貯めて、最後にまとめて書く(大きさの点検で止めるときは何も書かない)。"""

    def __init__(self):
        self.files = OrderedDict()

    def put(self, rel, text):
        self.files[rel] = text


def rd(rel):
    return (ROOT / rel).read_bytes().decode("utf-8").replace("\r\n", "\n")


def split_cards(s, start):
    """先頭カードの前 / カード一覧 / 最後のカードの後 に分ける。カードの間は空白とコメントだけ。"""
    first = s.find(start)
    last = s.rfind("</article>") + len("</article>")
    assert first > 0, "カードが見つからない: " + start
    mid = s[first:last]
    cards = re.findall(re.escape(start) + r".*?</article>", mid, flags=re.S)
    rest = re.sub(re.escape(start) + r".*?</article>", "", mid, flags=re.S)
    assert not re.sub(r"<!--.*?-->|\s", "", rest, flags=re.S), "カードの間に想定外の要素"
    return s[:first], cards, s[last:]


def strip_all_note(pre):
    """全件ページだけに入れたパンくずと注記(ALL_START〜ALL_END)を外す → 分ける前のページと同じ前半になる。"""
    return re.sub(re.escape(ALL_START) + r".*?" + re.escape(ALL_END), "", pre, count=1, flags=re.S)


def source(kind):
    """原本(全件ページ)を読む。まだ無いとき(公開の 1 回目)は分ける前のページを原本として読む。"""
    page, all_page = ("dog-lodging-guide.html", "dog-lodging-all.html") if kind == "lodging" else (f"{kind}.html", f"{kind}-all.html")
    src = all_page if (ROOT / all_page).exists() else page
    return page, all_page, rd(src)


def set_meta(pre, page, title, desc, robots="index,follow", css_href=SPLIT_CSS_HREF):
    url = BASE + page
    t, d = H.escape(title, quote=True), H.escape(desc, quote=True)
    pre = re.sub(r"<title>.*?</title>", lambda m: f"<title>{t}</title>", pre, count=1, flags=re.S)
    pre = re.sub(r'<meta name="description" content="[^"]*">', lambda m: f'<meta name="description" content="{d}">', pre, count=1)
    pre = re.sub(r'<link rel="canonical" href="[^"]*">', lambda m: f'<link rel="canonical" href="{url}">', pre, count=1)
    pre = re.sub(r'<meta name="robots" content="[^"]*">', lambda m: f'<meta name="robots" content="{robots}">', pre, count=1)
    pre = re.sub(r'<meta property="og:title" content="[^"]*">', lambda m: f'<meta property="og:title" content="{t}">', pre, count=1)
    pre = re.sub(r'<meta property="og:description" content="[^"]*">', lambda m: f'<meta property="og:description" content="{d}">', pre, count=1)
    pre = re.sub(r'<meta property="og:url" content="[^"]*">', lambda m: f'<meta property="og:url" content="{url}">', pre, count=1)
    link = f'<link rel="stylesheet" href="{css_href}">'
    # 版を上げたときは古い行を外す
    pre = re.sub(r'<link rel="stylesheet" href="(?:\.\./)?assets/split-pages\.css\?v=[^"]*">', lambda m: m.group(0) if m.group(0) == link else "", pre)
    if link not in pre:
        pre = pre.replace("</head>", link + "</head>", 1)
    return pre


def crumbs(trail, self_page):
    """trail = [(名前, ページ or None)]。見える列と BreadcrumbList の JSON-LD。"""
    parts = []
    for i, (name, href) in enumerate(trail):
        last = i == len(trail) - 1
        parts.append(f'<span aria-current="page">{H.escape(name)}</span>' if last else f'<a href="{href}">{H.escape(name)}</a>')
    items = [{"@type": "ListItem", "position": i + 1, "name": n, "item": BASE + (h if h else self_page) if h != "index.html" else BASE}
             for i, (n, h) in enumerate(trail)]
    ld = json.dumps({"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": items}, ensure_ascii=False)
    return (f'<nav class="split-crumbs" aria-label="現在地">{" ／ ".join(parts)}</nav>'
            f'<script type="application/ld+json">{ld}</script>')


def put_all_note(pre, note):
    return pre.replace('<main id="content">', '<main id="content">' + ALL_START + note + ALL_END, 1)


def link_text(t):
    """「名前　件数」の件数を折り返さない塊にする(「16 / 軒」のように割れないように)。"""
    name, sep, n = t.partition("　")
    return H.escape(name) + (f'　<span class="split-n">{H.escape(n)}</span>' if sep else "")


def band(bid, heading, lead, rows, more="", cls="entry-band", tag="section"):
    """既存の部品 .entry-band / .entry-links。rows = [(小見出し or None, [(href, 文言, 現在地か)])]"""
    cur_attr = ' aria-current="page" class="active"'
    body = ""
    for label, links in rows:
        if label:
            body += f'<p class="split-row-label">{H.escape(label)}</p>'
        body += '<div class="entry-links">' + "".join(f'<a href="{h}"{cur_attr if cur else ""}>{link_text(t)}</a>' for h, t, cur in links) + "</div>"
    m = f'<p class="entry-more">{more}</p>' if more else ""
    return (f'<{tag} class="{cls}" id="{bid}" aria-labelledby="{bid}-h"><h2 id="{bid}-h">{H.escape(heading)}</h2>'
            f'<p>{lead}</p>{body}{m}</{tag}>')


# ---------------------------------------------------------------- 宿(入口+全件。県のページは build_area_pages.py)
def lodging_prefs():
    """宿 id → 県のページ(areas/<slug>.html)。地域ページと同じ決まり(places.json の所在地・掲載 MIN_ITEMS 以上の県)。"""
    items, _ = B.load()
    pages, _, _ = B.build_pages(items)
    by_pref = {it["id"]: it["pref"] for it in items if it["kind"] == "lodging"}
    return by_pref, {p for p, slug in B.PREFS.items() if slug in pages and pages[slug]["lodging"]}


def build_lodging(smap, out):
    page, all_page, s = source("lodging")
    pre_raw, cards, post = split_cards(s, '<article class="stay-card"')
    pre = strip_all_note(pre_raw)
    total = len(cards)
    pref_of, pref_pages = lodging_prefs()
    by = OrderedDict((p, []) for p in ENTRANCE_PREF_ORDER if p in pref_pages)
    by.update((p, []) for p in B.PREFS if p in pref_pages and p not in by)
    ids = {}
    orphan = 0
    for c in cards:
        cid = re.search(r'data-lodging-id="([^"]+)"', c).group(1)
        pref = pref_of.get(cid)
        if pref in by:
            by[pref].append(c)
            f = f"areas/{B.PREFS[pref]}.html"
        else:  # places.json に無い宿は全件ページで見せる
            orphan += 1
            f = all_page
        ids[cid] = f
        m = re.search(r'<article[^>]* id="([^"]+)"', c)
        if m:
            ids[m.group(1)] = f
        for extra in re.findall(r'<span id="([^"]+)" aria-hidden="true"></span>', c):
            ids[extra] = f
    smap[page] = {"ids": ids, "route": {"stay-query": all_page}, "all": all_page, "params": []}
    files = {p: f"areas/{B.PREFS[p]}.html" for p in by}

    def pref_links():
        return [(files[p], f"{p}　{len(by[p])}軒", False) for p in by]

    hero_re = r'(<header class="guide-hero"><div><p class="eyebrow">わんことのじかん</p>)<h1>.*?</h1><p>.*?</p>'

    def score(c):
        v = 0
        v += 5 if 'class="facility-voice"' in c else 0
        v += 4 if 'class="facility-photos"' in c else 0
        v += 3 if 'class="user-voice"' in c else 0
        v += 2 if 'class="stay-photo"' in c else 0
        m = re.search(r'stay-review-count">/ 5 ・ ([\d,]+)件', c)
        v += min(int(m.group(1).replace(",", "")) / 50, 2) if m else 0
        return v
    picks = []
    for pref, cs in by.items():
        ranked = sorted(range(len(cs)), key=lambda i: (-score(cs[i]), i))[:PER_PREF_SAMPLE]
        picks += [cs[i] for i in sorted(ranked)]
    title = f"犬と泊まれる宿 {total}軒を県から探す(添い寝・ケージ・食事同伴の条件)｜わんことのじかん"
    desc = f"東日本14都県の犬と泊まれる宿 {total}軒を、県ごとのページで比較。夜の寝場所・ケージ・頭数・犬の料金・食事同伴・添い寝条件を、公式情報で確認した内容と予約前確認に分けてまとめています。"
    p1 = set_meta(pre, page, title, desc)
    p1 = re.sub(hero_re, lambda m: m.group(1) + f"<h1>東日本{total}宿｜犬が安心して寝られる宿を選ぶ</h1><p>東日本14都県の{total}宿を、県ごとのページで比べられます。夜の寝場所、ケージ、持参判断、添い寝条件、犬用アメニティを、公式情報で確認した内容と予約前確認に分けて載せています。</p>", p1, count=1, flags=re.S)
    p1 = p1.replace('<a href="#stay-query">宿・地域・条件で探す ↓</a>', f'<a href="#pref-entry">県から探す ↓</a><a href="{all_page}#stay-query">全{total}宿を条件で探す →</a>', 1)
    p1 = re.sub(r'<p class="notice"><b>掲載\d+宿</b>', lambda m: f'<p class="notice"><b>掲載{total}宿</b>', p1, count=1)
    p1 = p1.replace('<main id="content">', '<main id="content">' + crumbs([("トップ", "index.html"), ("犬と泊まれる宿", None)], page), 1)
    jm = re.search(r"<!-- seo-area-jump:start -->(.*?)<!-- seo-area-jump:end -->", p1, flags=re.S)
    assert jm, "宿ページに seo-area-jump が無い"
    jump_style = re.search(r"<style>.*?</style>", jm.group(1), flags=re.S).group(0)  # 11/04 公開の「県・地域から宿を探す」の見た目をそのまま使う
    entry = band("pref-entry", "県から宿を探す",
                 "県のページに、その県の宿をすべて載せています(添い寝・ケージ・食事同伴などの条件で絞り込めます)。同じページで、その県の犬とおでかけできる場所と市町村ごとのページも見られます。",
                 [(None, pref_links())],
                 f'<a href="areas/">市町村・観光地の一覧から探す</a>　<a href="{all_page}#stay-query">全 {total} 軒を 1 ページで絞り込む(読み込みに時間がかかります)</a>',
                 cls="entry-band area-jump", tag="nav")
    sample_note = (f'<p class="split-note">このページには、各県から {PER_PREF_SAMPLE} 軒ずつ(施設に直接確認した回答・写真・クチコミのある宿を優先)、計 {len(picks)} 軒を載せています。'
                   f'すぐ下の検索欄と条件はこの {len(picks)} 軒が対象です。すべての宿は県のページか <a href="{all_page}#stay-query">全件のページ</a> で探せます。</p>')
    p1 = p1[:jm.start()] + "<!-- seo-area-jump:start -->" + entry + jump_style + "<!-- seo-area-jump:end -->" + sample_note + p1[jm.end():]
    post1 = post.replace('<section class="lodging-affiliate-panel"',
                         band("pref-entry-2", "ほかの県の宿も見る", "県を選ぶと、その県の宿をすべて見られます。", [(None, pref_links())], cls="entry-band area-jump", tag="nav")
                         + '<section class="lodging-affiliate-panel"', 1)
    post1 = post1.replace("</body>", f'<script src="assets/split-entry.js?v={VER}" data-page="dog-lodging-guide.html" defer></script></body>', 1)
    out.put(page, p1 + "\n" + "\n".join(picks) + "\n" + post1)
    # 全件(原本。noindex・題名の件数・パンくずの注記だけそろえる)
    pa = set_meta(pre, all_page, f"犬と泊まれる宿 全{total}軒の絞り込み｜わんことのじかん", desc, "noindex,follow")
    pa = put_all_note(pa, crumbs([("トップ", "index.html"), ("犬と泊まれる宿", page), ("全件から探す", None)], all_page)
                      + f'<p class="split-note">全 {total} 軒を 1 ページに載せた絞り込み用のページです(検索エンジンには登録しません)。県ごとに見るときは <a href="{page}#pref-entry">県から探す</a>。</p>')
    out.put(all_page, pa + s[len(pre_raw):])
    return {"entrance": page, "pages": [], "all": all_page, "counts": {files[p]: len(by[p]) for p in by},
            "entrance_cards": len(picks), "total": total, "orphan": orphan}


# ---------------------------------------------------------------- 主食・用品・犬服
def head_attr(c, name):
    m = re.search(name + r'="([^"]*)"', re.match(r"<article[^>]*>", c).group(0))
    return m.group(1) if m else ""


def probs_of(c):
    return {p for p in head_attr(c, "data-problems").split("|") if p}


def food_group(c, facts):
    probs = probs_of(c)
    cat = head_attr(c, "data-category")
    pid = re.search(r'data-product="([^"]*)"', c)
    age = (facts.get(pid.group(1)) or {}).get("age", []) if pid else []
    if "ロイヤルカナン" in probs: return "royalcanin"
    if cat != "毎日の主食": return "treats"
    if "体重管理" in probs: return "weight"
    if "子犬" in age and not ({"成犬", "シニア", "全年齢"} & set(age)): return "puppy"
    if "シニア" in age and "全年齢" not in age: return "senior"
    if "全年齢" in age: return "all-ages"
    if "成犬" in age: return "adult"
    return "age-check"


def rewrite_entry_links(text, page, route_fn):
    """入口帯などの href="?..." を、分けたページへの静的リンクに置き換える(data-food-entry / data-entry の横取りも外す)。"""
    def rep(m):
        tag = m.group(0)
        href = H.unescape(m.group(2))
        if not href.startswith("?"):
            return tag
        new = route_fn(page, href)
        if new == page + href or new == href:
            return tag
        tag = tag.replace(m.group(1) + m.group(2) + m.group(1), m.group(1) + H.escape(new, quote=True) + m.group(1))
        return re.sub(r' data-(?:food-)?entry="[^"]*"', "", tag)
    return re.sub(r'<a [^>]*href=(["\'])(\?[^"\']*)\1[^>]*>', rep, text)


def prune_filters(pre, present):
    """そのページにカードが 1 枚もない絞り込みボタンを外す(「すべて」は残す)。"""
    def rep(m):
        v = H.unescape(m.group(1))
        return m.group(0) if v == "all" or v in present else ""
    return re.sub(r'<button(?: class="[^"]*")? data-problem="([^"]*)">[^<]*</button>', rep, pre)


def goods_problem_pages(cards, by, files):
    """困りごと別のページ。返り値: pages = [(slug, 名前, 説明, カード, 困りごと)], alias = {困りごと: 送り先}, notes = 判断の記録"""
    all_probs = set().union(*(probs_of(c) for c in cards))
    listed = {p for _, _, ps in GOODS_PROBLEM_GROUPS for p in ps}
    assert all_probs <= listed, f"分け方に無い困りごと: {all_probs - listed}(GOODS_PROBLEM_GROUPS に足してください)"
    cat_sets = {g: {id(c) for c in cs} for g, cs in by.items()}
    pages, alias, notes = [], {}, []
    for slug, name, ps in GOODS_PROBLEM_GROUPS:
        cs = [c for c in cards if probs_of(c) & set(ps)]
        each = {p: sum(1 for c in cards if p in probs_of(c)) for p in ps}
        mine = {id(c) for c in cs}
        if not cs:
            notes.append({"name": name, "cards": 0, "each": each, "page": False, "to": None})
            continue
        best = max(cat_sets, key=lambda g: len(mine & cat_sets[g]) / len(mine | cat_sets[g]))
        jac = len(mine & cat_sets[best]) / len(mine | cat_sets[best])
        if jac >= SAME_AS_CATEGORY or len(cs) < PROBLEM_MIN:
            for p in ps:
                alias[p] = files[best]
            notes.append({"name": name, "cards": len(cs), "each": each, "to": files[best], "overlap": round(jac, 3), "page": False})
            continue
        quoted = "・".join(f"「{p}」" for p in ps)
        desc = (f"このサイトの困りごとの分類で{quoted}に当てはまる犬用品を集めたページです。場面(カテゴリ)ごとの一覧とは別の切り口で、"
                f"1 つの商品が複数の困りごとのページに入ることがあります。")
        pages.append((slug, name, desc, cs, ps))
        notes.append({"name": name, "cards": len(cs), "each": each, "file": f"goods-{slug}.html", "overlap_max": round(jac, 3), "page": True})
    return pages, alias, notes


def build_products(kind, smap, route_fn, out):
    page, all_page, s = source(kind)
    pre_raw, cards, post = split_cards(s, '<article class="card"')
    pre = strip_all_note(pre_raw)
    total = len(cards)
    if kind == "food":
        js = (ROOT / "assets" / "food-facets.js").read_text(encoding="utf-8")
        facts, _ = json.JSONDecoder().raw_decode(js[js.find("{"):])
        groups = [(g, t, d) for g, t, d in FOOD_GROUPS]
        key = lambda c: food_group(c, facts)
    elif kind == "goods":
        groups = [(g, t, d) for g, t, cats, d in GOODS_GROUPS]
        cmap = {cat: g for g, t, cats, d in GOODS_GROUPS for cat in cats}
        key = lambda c: cmap[head_attr(c, "data-category")]
    else:
        groups = [(g, t, d) for g, t, cats, keys, d in WEAR_GROUPS]
        cmap = {cat: g for g, t, cats, keys, d in WEAR_GROUPS for cat in cats}
        key = lambda c: cmap[head_attr(c, "data-category")]
    by = OrderedDict((g, []) for g, _, _ in groups)
    for c in cards:
        k = key(c) if kind == "food" else cmap.get(head_attr(c, "data-category"))
        assert k, f"{kind}: 分け方に無いカテゴリ「{head_attr(c, 'data-category')}」(site_split_build.py の GROUPS に足してください)"
        by[k].append(c)
    by = OrderedDict((g, cs) for g, cs in by.items() if cs)  # 空のグループはページにしない
    files = {g: f"{kind}-{g}.html" for g in by}
    titles = {g: t for g, t, _ in groups}
    descs = {g: d for g, _, d in groups}
    ids = {}
    for g, cs in by.items():
        for c in cs:
            m = re.search(r'<article[^>]* id="([^"]+)"', c)
            if m: ids[m.group(1)] = files[g]
            for pid in re.findall(r'data-product="([^"]+)"', c):
                ids.setdefault("pick:" + pid, files[g])
    route = {}
    prob_pages, prob_alias, prob_notes = [], {}, []
    if kind == "food":
        for k, g in (("age=子犬", "puppy"), ("age=成犬", "adult"), ("age=シニア", "senior"), ("age=全年齢", "all-ages"),
                     ("problem=体重管理", "weight"), ("problem=ロイヤルカナン", "royalcanin"), ("problem=噛むおやつ", "treats"),
                     ("problem=しつけ・ごほうび", "treats"), ("problem=一般食・トッピング", "treats"), ("problem=用途 要確認", "treats")):
            if g in files:
                route[k] = files[g]
        params = ["age", "problem", "brand"]
    elif kind == "wear":
        for g, t, cats, keys, d in WEAR_GROUPS:
            if g not in files:
                continue
            for k in keys: route["purpose=" + k] = files[g]
            for cat in sorted(cats): route["problem=" + cat] = files[g]
        params = ["purpose", "problem", "size", "entry"]
    else:
        prob_pages, prob_alias, prob_notes = goods_problem_pages(cards, by, files)
        for slug, name, desc, cs, ps in prob_pages:
            for p in ps:
                route["problem=" + p] = f"goods-{slug}.html"
        for p, dest in prob_alias.items():
            route["problem=" + p] = dest
        params = ["problem"]
    smap[page] = {"ids": ids, "route": route, "all": all_page, "params": params}

    label = {"food": "主食", "goods": "犬用品", "wear": "犬服"}[kind]
    unit = "品"

    def rows(cur=None):
        """帯のリンク列(入口・分けたページ共通)。cur = いまのページのファイル名"""
        if kind == "food":
            return [(lab, [(files[g], f"{FOOD_SHORT[g]}　{len(by[g])}{unit}", files[g] == cur) for g in gs if g in by]) for lab, gs in FOOD_ROWS]
        cat_row = [(files[g], f"{titles[g]}　{len(by[g])}{unit}", files[g] == cur) for g in by]
        if kind == "wear":
            return [(None, cat_row)]
        items = [(f"goods-{slug}.html", name, len(cs)) for slug, name, _, cs, _ in prob_pages]
        for x in prob_notes:
            if not x["page"] and x.get("to"):
                g = next(g for g in by if files[g] == x["to"])
                items.append((x["to"], x["name"], len(by[g])))
        items.sort(key=lambda x: -x[2])  # 選べる商品の多い順(同数は上の表の順)
        return [("困りごとから", [(f, f"{name}　{k}{unit}", f == cur) for f, name, k in items]), ("場面から", cat_row)]

    band_id = {"food": "food-entry", "goods": "goods-split", "wear": "wear-split"}[kind]
    band_head = {"food": "1. 年齢・用途から選ぶ", "goods": "困りごと・場面から犬用品を選ぶ", "wear": "用途から犬服を選ぶ"}[kind]
    all_more = f'全 {total} {unit}を 1 ページで条件を重ねて絞り込むときは <a href="{all_page}#shop">全件のページ</a>(読み込みに時間がかかります)。'

    def put_band(p, b):
        """主食は今の「1. 年齢・困りごとから選ぶ」の帯と入れ替える(同じ役目の帯を 2 つ並べない)。ほかはパンくずの後。"""
        if kind == "food":
            fm = re.search(r"<!-- funnel:entry -->.*?<!-- /funnel:entry -->", p, flags=re.S)
            assert fm, "主食ページに funnel:entry が無い"
            p = p[:fm.start()] + "<!-- funnel:entry -->" + b + "<!-- /funnel:entry -->" + p[fm.end():]
            return p.replace("<!-- split-band -->", "", 1)
        return p.replace("<!-- split-band -->", b, 1)

    hero_re = r'(<header class="editorial-hero"><div class="hero-copy">)<h1>.*?</h1><p class="hero-description">.*?</p><a class="primary-link" href="[^"]*">.*?</a>'
    # (ファイル, パンくずの名前, title, h1, 説明, カード)
    subpages = [(files[g], titles[g], f"{titles[g]} {len(by[g])}{unit}を公式表示で比較｜わんことのじかん", titles[g], descs[g], by[g]) for g in by]
    for slug, name, desc, cs, ps in prob_pages:
        subpages.append((f"goods-{slug}.html", f"困りごと「{name}」", f"困りごと「{name}」の犬用品 {len(cs)}{unit}を公式表示で比較｜わんことのじかん",
                         f"困りごと「{name}」の犬用品", desc, cs))
    out_pages = []
    for f, crumb_name, title, h1, d, cs in subpages:
        n = len(cs)
        p2 = set_meta(pre, f, title, f"{h1}を{n}{unit}掲載。{d}")
        p2 = re.sub(hero_re, lambda m: m.group(1) + f'<h1>{H.escape(h1)}<br><em>{n}{unit}を比べる。</em></h1><p class="hero-description">{H.escape(d)}</p><a class="primary-link" href="#shop">条件で絞り込む <span>↗</span></a>', p2, count=1, flags=re.S)
        p2 = re.sub(r'<span data-count-main>[^<]*</span>', lambda m: f'<span>{H.escape(h1)} {n}{unit}</span>', p2)
        present = set()
        for c in cs:
            present |= probs_of(c) | {head_attr(c, "data-category")}
        p2 = prune_filters(p2, present)
        p2 = p2.replace('<main id="content">', '<main id="content">' + crumbs([("トップ", "index.html"), (label, page), (crumb_name, None)], f) + "<!-- split-band -->", 1)
        other = {"food": "年齢・用途", "goods": "困りごと・場面", "wear": "用途"}[kind]
        lead = (f'このページは{H.escape(crumb_name if crumb_name.startswith("困りごと") else "「" + crumb_name + "」")}の{n}{unit}です。ほかの{other}は下から選べます。'
                + ("犬種・体重・原材料・費用は、下の「条件を選ぶ」で足せます。" if kind == "food" else ""))
        p2 = put_band(p2, band(band_id, band_head, lead, rows(f), all_more))
        p2 = rewrite_entry_links(p2, page, route_fn)
        p2 = p2.replace("</head>", f'<script>window.WANKO_SPLIT_PAGE={json.dumps(page)};</script></head>', 1)
        out.put(f, p2 + "\n" + "\n".join(cs) + "\n" + post)
        out_pages.append(f)
    # 入口
    order = [g for _, gs in FOOD_ROWS for g in gs if g in by] if kind == "food" else list(by)
    picks = []
    for g in order:
        cs = by[g]
        withphoto = [i for i, c in enumerate(cs) if 'class="photo photo-ad"' in c]
        chosen = (withphoto + [i for i in range(len(cs)) if i not in withphoto])[:PER_GROUP_SAMPLE]
        picks += [cs[i] for i in sorted(chosen)]
    p1 = set_meta(pre, page, *ENTRANCE[kind])
    p1 = p1.replace('<main id="content">', '<main id="content">' + crumbs([("トップ", "index.html"), (label, None)], page) + "<!-- split-band -->", 1)
    lead1 = {"food": "年齢を選ぶと、その年齢の主食をすべて載せたページへ移ります。犬種・体重・原材料・費用は、移った先の「条件を選ぶ」で足せます。主食とおやつは分けて載せています。",
             "goods": f"困りごとか場面を選ぶと、当てはまる{label}をすべて載せたページへ移ります。どのページでも、今までと同じ条件で絞り込めます。",
             "wear": f"用途ごとのページに、すべての{label}を載せています。どのページでも、今までと同じ条件で絞り込めます。"}[kind]
    p1 = put_band(p1, band(band_id, band_head, lead1, rows(), all_more))
    total_main = sum(1 for c in cards if "毎日の主食" in probs_of(c))
    p1 = re.sub(r'<span data-count-main>[^<]*</span>', lambda m: f'<span>主食候補 {total_main}品(掲載カード数)</span>', p1)
    p1 = rewrite_entry_links(p1, page, route_fn)
    note = (f'<p class="split-note">このページには、各カテゴリから {PER_GROUP_SAMPLE} {unit}ずつ、計 {len(picks)} {unit}を載せています。上のボタンで用途を選ぶと、その用途のページか全件のページへ移ります。'
            f'検索欄と詳しい条件はこの {len(picks)} {unit}が対象です。すべては <a href="{all_page}#shop">全件のページ</a> で探せます。</p>')
    i = p1.rfind('<section class="grid">')
    assert i > 0
    p1 = p1[:i] + note + p1[i:]
    post1 = post.replace("</body>", f'<script src="assets/split-entry.js?v={VER}" data-page="{page}" defer></script></body>', 1)
    out.put(page, p1 + "\n" + "\n".join(picks) + "\n" + post1)
    # 全件(原本。noindex・題名の件数・パンくずの注記だけそろえる。カードとその前後はそのまま)
    pa = set_meta(pre, all_page, f"{label} 全{total}{unit}の絞り込み｜わんことのじかん", ENTRANCE[kind][1], "noindex,follow")
    pa = put_all_note(pa, crumbs([("トップ", "index.html"), (label, page), ("全件から探す", None)], all_page)
                      + f'<p class="split-note">全 {total} {unit}を 1 ページに載せた絞り込み用のページです(検索エンジンには登録しません)。分けたページで見るときは <a href="{page}#{band_id}">{H.escape(band_head.replace("1. ", ""))}</a>。</p>')
    out.put(all_page, pa + s[len(pre_raw):])
    res = {"entrance": page, "pages": out_pages, "all": all_page, "counts": {sp[0]: len(sp[5]) for sp in subpages},
           "entrance_cards": len(picks), "total": total}
    if kind == "goods":
        res["problem_pages"] = prob_notes
    return res


# ---------------------------------------------------------------- 旧リンク → 新しいページ
def make_router(smap):
    def route(page, rest):
        """page = 元のページ名、rest = '?a=b#c' や '#id'。新しい行き先(サイト直下からのパス+クエリ+#)を返す。"""
        q, _, frag = rest.partition("#")
        q = q[1:] if q.startswith("?") else q
        frag_d = unquote(frag)
        info = smap[page]
        pairs = parse_qsl(q, keep_blank_values=True)
        tail = ("?" + q if q else "") + ("#" + frag if frag else "")
        if frag_d and frag_d in info["ids"]:
            return info["ids"][frag_d] + tail
        if frag_d in info["route"]:
            return info["route"][frag_d] + tail
        for k, v in pairs:
            if k == "pick" and "pick:" + v in info["ids"]:
                return info["ids"]["pick:" + v] + tail
        for p in info["params"]:
            for k, v in pairs:
                if k == p and v and v != "all" and f"{k}={v}" in info["route"]:
                    return info["route"][f"{k}={v}"] + tail
        if any(k in info["params"] + ["pick"] and v and v != "all" for k, v in pairs):
            return info["all"] + tail
        return page + tail
    return route


LINK_RE = re.compile(r'(?<![\w.-])((?:\.\./)*|' + re.escape(BASE) + r')(dog-lodging-guide|food|goods|wear)\.html((?:\?|#)[^"\'<>\s\\]*)')


def rewrite_links(text, route):
    """文中の 旧ページ.html?… / 旧ページ.html#… を、分けたページへの直接のリンクにする。"""
    def rep(m):
        prefix, name, rest = m.group(1), m.group(2) + ".html", m.group(3)
        amp = "&amp;" in rest
        new = route(name, H.unescape(rest) if amp else rest)
        return prefix + (new.replace("&", "&amp;") if amp else new)
    return LINK_RE.sub(rep, text)


REWRITE_SKIP_DIRS = ("sns", "tests", "docs", "tools", "node_modules", ".git", ".github")
REWRITE_SKIP = {"assets/split-map.json", "assets/split-entry.js", "assets/search-index.json"}


def rewrite_site_links(route):
    """1 回だけ: サイト全体(.html・.json・.js)の旧リンクを書き換える。空室データ(route-planner/data/vacancy/)は毎晩作り直すので触らない。"""
    changed = []
    for p in sorted(ROOT.rglob("*")):
        if not p.is_file() or p.suffix not in (".html", ".json", ".js"):
            continue
        rel = p.relative_to(ROOT).as_posix()
        if rel.split("/")[0] in REWRITE_SKIP_DIRS or rel in REWRITE_SKIP or rel.startswith("route-planner/data/vacancy/"):
            continue
        try:
            raw = p.read_bytes().decode("utf-8")
        except UnicodeDecodeError:
            continue
        t2 = rewrite_links(raw, route)
        if t2 != raw:
            p.write_bytes(t2.encode("utf-8"))
            changed.append(rel)
    return changed


# ---------------------------------------------------------------- サイトマップ(areas/ 以外の行)
_TODAY = datetime.date.today().isoformat()


def git(*args):
    try:
        return subprocess.run(["git", "-C", str(ROOT), *args], capture_output=True, text=True, encoding="utf-8").stdout
    except OSError:
        return ""


def lastmod(rel, new_text=None):
    """その URL のファイルが最後に変わった日。書き換える・未コミットのときは今日、それ以外は git の最終コミット日。"""
    p = ROOT / rel
    if new_text is not None and (not p.exists() or p.read_bytes().decode("utf-8", "replace").replace("\r\n", "\n") != new_text):
        return _TODAY
    if not p.exists() or git("status", "--porcelain", "--", rel).strip():
        return _TODAY
    return git("log", "-1", "--format=%cs", "--", rel).strip() or _TODAY


def sitemap(new_pages, outputs):
    sm = rd("sitemap.xml")
    entries = re.findall(r"<url><loc>([^<]+)</loc>(?:<lastmod>[^<]*</lastmod>)?</url>", sm)
    gen = set(new_pages)
    keep = [u for u in entries if u[len(BASE):] not in gen]  # 分けたページは毎回、今の一覧で並べ直す
    kids = {}
    for np in new_pages:
        kids.setdefault(BASE + np.split("-")[0] + ".html", []).append(BASE + np)
    locs = []
    for u in keep:
        locs.append(u)
        locs += kids.get(u, [])
    rows = []
    for u in locs:
        rel = u[len(BASE):] or "index.html"
        if rel.startswith("areas/"):  # areas/ の行は build_area_pages.py のもの。今の行をそのまま残す
            m = re.search(r"<url><loc>" + re.escape(u) + r"</loc>(?:<lastmod>[^<]*</lastmod>)?</url>", sm)
            rows.append("  " + m.group(0))
            continue
        relf = rel + "index.html" if rel.endswith("/") else rel
        rows.append(f"  <url><loc>{u}</loc><lastmod>{lastmod(relf, outputs.get(relf))}</lastmod></url>")
    return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + "\n".join(rows) + "\n</urlset>\n"


SPLIT_ENTRY_JS = r"""/* split-20261104: 分けたページの入口で、旧リンク(#カード id・?pick=・?problem= など)を新しいページへ送る。対応表は assets/split-map.json(tools/site_split_build.py が作る) */
(() => {
  const me = document.currentScript, page = me && me.dataset.page;
  if (!page) return;
  const u = new URL(location.href), q = u.searchParams;
  let frag = ""; try { frag = decodeURIComponent(u.hash.slice(1)); } catch (_) {}
  const needs = frag || [...q.keys()].length;
  let mapP = null;
  const load = () => (mapP ||= fetch(new URL("split-map.json", me.src)).then((r) => (r.ok ? r.json() : {})).then((m) => m[page] || null).catch(() => null));
  const target = (info, frag, pairs) => {
    if (frag && info.ids[frag]) return info.ids[frag];
    if (frag && info.route[frag]) return info.route[frag];
    for (const [k, v] of pairs) if (k === "pick" && info.ids["pick:" + v]) return info.ids["pick:" + v];
    for (const p of info.params) for (const [k, v] of pairs) if (k === p && v && v !== "all" && info.route[k + "=" + v]) return info.route[k + "=" + v];
    if (pairs.some(([k, v]) => (info.params.includes(k) || k === "pick") && v && v !== "all")) return info.all;
    return "";
  };
  if (needs) load().then((info) => {
    if (!info) return;
    // この画面にある id(代表カードなど)は移らない。ただし #stay-query のように行き先が決まっているものは送る
    const t = target(info, document.getElementById(frag) && !info.route[frag] ? "" : frag, [...q.entries()]);
    if (t) location.replace(t + u.search + u.hash);
  });
  // 入口の用途ボタン: この画面の代表カードで絞らず、その用途のページ(なければ全件のページ)へ移る
  document.addEventListener("click", (e) => {
    const b = e.target.closest(".filters button[data-problem]");
    if (!b || b.dataset.problem === "all") return;
    e.preventDefault(); e.stopImmediatePropagation();
    load().then((info) => {
      if (!info) return;
      const v = b.dataset.problem, t = info.route["problem=" + v] || info.all;
      location.href = t + "?problem=" + encodeURIComponent(v) + "#shop";
    });
  }, true);
})();
"""

SPLIT_CSS_TEXT = """/* split-20261104: 分けたページのパンくず・注記・帯の小見出し。色・大きさ・余白は design-system.md の値だけ */
.split-crumbs{max-width:1112px;margin:8px auto 0;padding:8px 16px 0;font-size:13px;line-height:1.8;color:var(--muted)}
.split-crumbs a{color:var(--green)}
.split-crumbs [aria-current]{color:var(--ink)}
.split-note{margin:16px 0;padding:12px 16px;border:1px solid var(--line);border-left:3px solid var(--green);border-radius:8px;background:#fff;font-size:13px;line-height:1.8;color:var(--ink)}
.split-note a{color:var(--green)}
.shop-page .split-crumbs,.shop-page main>.split-note{max-width:none;padding-left:0;padding-right:0}
.entry-band .split-row-label{margin:12px 0 4px;font-size:13px;font-weight:600;line-height:1.5;color:var(--muted)}
.entry-band .entry-links a{min-height:44px}
.entry-band .entry-links .split-n{display:inline-block;white-space:nowrap;font-weight:400}
.entry-band .entry-links a[aria-current]{background:var(--green);color:#fff}
.area-page #stays .stay-card{font-size:14px}
"""

CTRL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")


def build():
    """組み立てて (出力, 結果) を返す(まだ書かない)。"""
    out, smap, res = Out(), {}, {}
    res["lodging"] = build_lodging(smap, out)
    route = make_router(smap)
    for kind in ("food", "goods", "wear"):
        res[kind] = build_products(kind, smap, route, out)
    # 分けたページの中の旧リンクも直接の行き先にする(原本の全件ページは中身を触らない)
    for rel in list(out.files):
        if not rel.endswith("-all.html"):
            out.put(rel, rewrite_links(out.files[rel], route))
    out.put("assets/split-map.json", json.dumps(smap, ensure_ascii=False, separators=(",", ":")) + "\n")
    out.put("assets/split-entry.js", SPLIT_ENTRY_JS)
    out.put("assets/split-pages.css", SPLIT_CSS_TEXT)
    new_pages = [p for k, r in res.items() for p in r["pages"]]
    out.put("sitemap.xml", sitemap(new_pages, out.files))
    return out, res, route


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--check", action="store_true", help="書き換えずに、変わるファイルだけを表示する")
    ap.add_argument("--rewrite-site-links", action="store_true", help="1 回だけ: サイト全体の旧リンクを新しいページへ書き換える")
    args = ap.parse_args()
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except AttributeError:
        pass
    out, res, route = build()
    big = {f: round(len(t.encode("utf-8")) / 1e6, 2) for f, t in out.files.items()
           if f.endswith(".html") and not f.endswith("-all.html") and len(t.encode("utf-8")) > SIZE_LIMIT}
    if big:
        print("NG 1.5MB を超えるページがあるため、何も書き換えずに止めた: " + "、".join(f"{f} {b}MB" for f, b in big.items()))
        print("  → カードの中で繰り返している書き方を減らすか、そのページをさらに分けてください(00-SUMMARY.md「公開までに残る作業」3)")
        return 2
    ctrl = [f for f, t in out.files.items() if CTRL.search(t)]
    if ctrl:
        print("NG 制御文字が混ざったため止めた: " + "、".join(ctrl))
        return 2
    stale = sorted(p.name for p in ROOT.glob("*.html") if GENERATED_RE.match(p.name) and p.name not in out.files)
    changed = [f for f, t in out.files.items() if not (ROOT / f).exists() or rd(f) != t]
    if args.check:
        for f in changed:
            print("変わる: " + f)
        for f in stale:
            print("消える: " + f)
        print(f"変わるファイル {len(changed) + len(stale)} 件")
        return 1 if changed or stale else 0
    for f in changed:
        p = ROOT / f
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(out.files[f].encode("utf-8"))
    for f in stale:
        (ROOT / f).unlink()
    rewritten = rewrite_site_links(route) if args.rewrite_site_links else []
    for k, r in res.items():
        print(f"{k}: 全 {r['total']} 枚 / 入口のカード {r['entrance_cards']} / 分けたページ {len(r['pages'])}"
              + (f" / 県のページへ送る宿 {sum(r['counts'].values())}(places.json に無く全件ページへ送る宿 {r['orphan']})" if k == "lodging" else ""))
    sizes = sorted(((len(t.encode("utf-8")), f) for f, t in out.files.items() if f.endswith(".html") and not f.endswith("-all.html")), reverse=True)
    print("最大のページ: " + "、".join(f"{f} {b / 1e6:.2f}MB" for b, f in sizes[:3]))
    print(f"書き換え {len(changed)}、削除 {len(stale)}" + (f"、サイト全体の旧リンクを書き換えたファイル {len(rewritten)}" if args.rewrite_site_links else ""))
    for f in rewritten:
        print("  リンク書き換え: " + f)
    return 0


if __name__ == "__main__":
    sys.exit(main())
