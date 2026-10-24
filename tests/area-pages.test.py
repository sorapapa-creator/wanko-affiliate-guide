#!/usr/bin/env python3
"""地域別ページ(areas/*.html)の点検。標準ライブラリだけで動く(html5lib があれば HTML の構文エラーも数える)。

実行(リポジトリの一番上で): python3 tests/area-pages.test.py

確かめること
- 生成器を今のデータで動かしても差分が出ない(tools/build_area_pages.py --check)
- HTML: doctype・lang・title・charset・viewport・h1 が 1 つ、タグの閉じ忘れ・入れ子の誤り、id の重複
- canonical がファイルの場所と一致し、og:url と同じ。og:title / description / image(手元に画像がある)
- JSON-LD が JSON として読め、BreadcrumbList は 1 から連番で最後が自分、ItemList の件数がカード数と一致
- 内部リンク: 相対リンクの先のファイルと #id があるか、旅行プランの ?dest= が places.json にあるか
- 広告: rel に sponsored を含むリンクは nofollow も持ち、「広告」の札の隣にある。アフィリエイトの URL は必ず広告扱い
- 中身: カードの id が places.json にあり、県のページは同じ県、市町村・観光地のページはその市町村の施設だけ
- 見出しの件数がカード数と一致し、sitemap.xml に全ページがある(古いページが残っていない)
"""

import html.parser
import json
import re
import subprocess
import sys
from pathlib import Path
from urllib.parse import urlsplit, unquote, parse_qs

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
import build_area_pages as B  # noqa: E402  (地域の決まり MUNIS / GROUPS / PREFS と SITE を使う)

AREAS = ROOT / "areas"
VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"}
# 自動で閉じてよい要素(HTML の省略規則)。生成器は閉じているので、ここに入るものは実際には出てこない想定
OPTIONAL_END = {"p", "li", "dt", "dd", "option", "tr", "td", "th"}
# 元ページで JS が作る要素の id(静的な HTML には無い)。作る側のスクリプトに id が書かれているかも確かめる
RUNTIME_IDS = {"dog-lodging-guide.html": {"stay-query": "assets/editorial.js"}}
AFFILIATE_HOSTS = ("hb.afl.rakuten.co.jp", "ck.jp.ap.valuecommerce.com", "px.a8.net", "af.moshimo.com",
                   "click.linksynergy.com", "amzn.to", "linksynergy.jrs5.com")

n = failed = 0


def test(name, problems):
    global n, failed
    n += 1
    if problems:
        failed += 1
        print("not ok %d - %s" % (n, name))
        for p in problems[:15]:
            print("  # " + p)
        if len(problems) > 15:
            print("  # ほか %d 件" % (len(problems) - 15))
    else:
        print("ok %d - %s" % (n, name))


class Page(html.parser.HTMLParser):
    """タグの入れ子・id・リンク・meta・JSON-LD・広告の札を集める。"""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack, self.errors, self.ids, self.links, self.meta, self.ld = [], [], [], [], {}, []
        self.canonical, self.title, self.h1, self.lang, self.doctype = None, "", 0, None, False
        self.charset = self.viewport = False
        self.cards, self.rows, self.counts, self.ads = [], [], [], []
        self._rows = False
        self._ld = self._title = self._h2span = None
        self._ad = None  # 開いている <p class="ar-ad"> の [札の文字, リンクの数]

    def handle_decl(self, decl):
        self.doctype = self.doctype or decl.lower() == "doctype html"

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if a.get("id"):
            self.ids.append(a["id"])
        if tag == "html":
            self.lang = a.get("lang")
        if tag == "meta":
            if "charset" in a:
                self.charset = True
            if a.get("name") == "viewport":
                self.viewport = True
            key = a.get("property") or a.get("name")
            if key:
                self.meta[key] = a.get("content", "")
        if tag == "link" and a.get("rel") == "canonical":
            self.canonical = a.get("href")
        if tag in ("a", "link", "img", "script", "source") and (a.get("href") or a.get("src")):
            classes = (a.get("class") or "").split()
            self.links.append({"tag": tag, "url": a.get("href") or a.get("src"), "rel": (a.get("rel") or "").split(),
                               "in_ad": self._ad is not None, "classes": classes})
            if tag == "a" and self._ad is not None:
                self._ad[1] += 1
        if tag == "script" and a.get("type") == "application/ld+json":
            self._ld = []
        if tag == "title":
            self._title = []
        if tag == "h1":
            self.h1 += 1
        if tag == "article" and "ar-card" in (a.get("class") or "").split():
            self.cards.append(a.get("id"))
        if tag == "ul" and "ar-rows" in (a.get("class") or "").split():
            self._rows = True
        if tag == "a" and self._rows and "#" in (a.get("href") or ""):
            self.rows.append(a["href"].split("#", 1)[1])  # 県ページで、市町村ページへ 1 行で案内する掲載
        if tag == "p" and "ar-ad" in (a.get("class") or "").split():
            self._ad = ["", 0]
        if tag == "span" and self._ad is not None and "ar-ad-tag" in (a.get("class") or "").split():
            self._ad.append("tag")
        if tag == "h2" and a.get("id") in ("stays-h", "outings-h"):
            self._h2span = [a["id"], None]
        if tag not in VOID:
            self.stack.append((tag, self.getpos()))

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in VOID and self.stack and self.stack[-1][0] == tag:
            self.stack.pop()

    def handle_endtag(self, tag):
        if tag in VOID:
            return
        if tag == "ul":
            self._rows = False
        if tag == "p" and self._ad is not None:
            self.ads.append(self._ad)
            self._ad = None
        if tag == "script" and self._ld is not None:
            self.ld.append("".join(self._ld))
            self._ld = None
        if tag == "title" and self._title is not None:
            self.title = "".join(self._title).strip()
            self._title = None
        if tag == "h2" and self._h2span:
            self.counts.append(tuple(self._h2span))
            self._h2span = None
        while self.stack and self.stack[-1][0] != tag and self.stack[-1][0] in OPTIONAL_END:
            self.stack.pop()
        if not self.stack or self.stack[-1][0] != tag:
            self.errors.append("%d 行目: </%s> が開いていない(開いているのは <%s>)" % (
                self.getpos()[0], tag, self.stack[-1][0] if self.stack else "なし"))
            return
        self.stack.pop()

    def handle_data(self, data):
        if self._ld is not None:
            self._ld.append(data)
        if self._title is not None:
            self._title.append(data)
        if self._ad is not None and len(self._ad) > 2 and self._ad[0] == "":
            self._ad[0] = data.strip()
        if self._h2span is not None:
            m = re.search(r"(\d+)\s*(軒|か所)", data)
            if m:
                self._h2span[1] = int(m.group(1))


def parse(path):
    p = Page()
    p.feed(path.read_text(encoding="utf-8"))
    p.close()
    for tag, pos in p.stack:
        if tag not in OPTIONAL_END and tag not in ("html", "body", "head"):
            p.errors.append("%d 行目の <%s> が閉じていない" % (pos[0], tag))
    return p


_ids = {}


def ids_of(path):
    if path not in _ids:
        text = path.read_text(encoding="utf-8", errors="replace")
        _ids[path] = set(re.findall(r'\bid="([^"]+)"', text))
    return _ids[path]


def local_target(base, url):
    """相対 URL → (ファイル, #id, クエリ)。外部 URL は None。"""
    sp = urlsplit(url)
    if sp.scheme or url.startswith("//"):
        if url.startswith(B.SITE):
            sp = urlsplit(url[len(B.SITE):])
            target = ROOT / unquote(sp.path)
        else:
            return None
    elif not sp.path:
        target = base
    else:
        target = (base.parent / unquote(sp.path)).resolve()
    if target.is_dir() or str(target).endswith("/"):
        target = target / "index.html"
    return target, unquote(sp.fragment), parse_qs(sp.query)


def main():
    places = json.loads((ROOT / "route-planner" / "data" / "places.json").read_text(encoding="utf-8"))["places"]
    by_id = {p["id"]: p for p in places}
    files = sorted(AREAS.glob("*.html"))
    pages = {f: parse(f) for f in files}

    r = subprocess.run([sys.executable, str(ROOT / "tools" / "build_area_pages.py"), "--check"],
                       cwd=ROOT, capture_output=True, text=True)
    test("生成器を今のデータで動かしても差分 0 件(--check)",
         [] if r.returncode == 0 else (r.stdout + r.stderr).strip().splitlines()[-5:])

    test("地域ページが 1 枚以上ある(%d 枚 + 一覧)" % (len(files) - 1), [] if len(files) > 1 else ["areas/ が空"])

    probs = []
    try:
        import html5lib  # 任意
        for f in files:
            parser = html5lib.HTMLParser(strict=False)
            parser.parse(f.read_text(encoding="utf-8"))
            for pos, code, data in parser.errors:
                probs.append("%s %s 行目: %s %s" % (f.name, pos[0], code, data or ""))
        test("html5lib で構文エラーが無い", probs)
    except ImportError:
        print("# html5lib が無いので構文エラーの数え上げは省略(pip install html5lib)")

    probs = []
    for f, p in pages.items():
        probs += ["%s %s" % (f.name, e) for e in p.errors]
        for cond, msg in ((p.doctype, "<!doctype html> が無い"), (p.lang == "ja", 'lang="ja" ではない'),
                          (p.title, "title が空"), (p.charset, "meta charset が無い"),
                          (p.viewport, "viewport が無い"), (p.h1 == 1, "h1 が %d 個" % p.h1)):
            if not cond:
                probs.append("%s %s" % (f.name, msg))
        dup = {i for i in p.ids if p.ids.count(i) > 1}
        if dup:
            probs.append("%s id の重複: %s" % (f.name, ", ".join(sorted(dup)[:5])))
    test("HTML の形(閉じタグ・必須要素・id の重複)", probs)

    probs = []
    for f, p in pages.items():
        want = B.SITE + "areas/" + ("" if f.name == "index.html" else f.name)
        if p.canonical != want:
            probs.append("%s canonical=%s(期待 %s)" % (f.name, p.canonical, want))
        if p.meta.get("og:url") != p.canonical:
            probs.append("%s og:url が canonical と違う" % f.name)
        for k in ("og:title", "og:description", "og:image", "og:type", "og:site_name", "description"):
            if not p.meta.get(k):
                probs.append("%s %s が無い" % (f.name, k))
        img = p.meta.get("og:image", "")
        if img.startswith(B.SITE) and not (ROOT / img[len(B.SITE):]).exists():
            probs.append("%s og:image のファイルが無い: %s" % (f.name, img))
        if p.meta.get("og:title") and p.meta["og:title"] != p.title:
            probs.append("%s og:title と title が違う" % f.name)
    test("canonical と OG", probs)

    probs = []
    for f, p in pages.items():
        types = {}
        for raw in p.ld:
            try:
                d = json.loads(raw)
            except ValueError as e:
                probs.append("%s JSON-LD が読めない: %s" % (f.name, e))
                continue
            if d.get("@context") != "https://schema.org":
                probs.append("%s @context が https://schema.org ではない" % f.name)
            types[d.get("@type")] = d
        bc = types.get("BreadcrumbList")
        if not bc:
            probs.append("%s BreadcrumbList が無い" % f.name)
        else:
            els = bc.get("itemListElement", [])
            if [e.get("position") for e in els] != list(range(1, len(els) + 1)):
                probs.append("%s BreadcrumbList の position が連番でない" % f.name)
            if not els or els[-1].get("item") != p.canonical:
                probs.append("%s BreadcrumbList の最後が自分のページではない" % f.name)
            for e in els:
                if not e.get("name") or e.get("@type") != "ListItem":
                    probs.append("%s BreadcrumbList に name か @type の無い項目" % f.name)
                t = local_target(f, e.get("item", ""))
                if not t or not t[0].exists():
                    probs.append("%s BreadcrumbList の行き先が無い: %s" % (f.name, e.get("item")))
        if f.name == "index.html":
            continue
        il = types.get("ItemList")
        if not il:
            probs.append("%s ItemList が無い" % f.name)
            continue
        els = il.get("itemListElement", [])
        if il.get("numberOfItems") != len(els) or len(els) != len(p.cards) + len(p.rows):
            probs.append("%s ItemList の件数 %s / 要素 %d / カード %d + 1 行の案内 %d が合わない" % (
                f.name, il.get("numberOfItems"), len(els), len(p.cards), len(p.rows)))
        if [e.get("position") for e in els] != list(range(1, len(els) + 1)):
            probs.append("%s ItemList の position が連番でない" % f.name)
        for e in els:
            t = local_target(f, e.get("url", ""))
            if not t or not t[0].exists() or (t[1] and t[1] not in ids_of(t[0])):
                probs.append("%s ItemList の url の行き先が無い: %s" % (f.name, e.get("url")))
    test("JSON-LD(BreadcrumbList / ItemList)", probs)

    probs, checked = [], 0
    for f, p in pages.items():
        for link in p.links:
            url = link["url"]
            if url.startswith(("data:", "mailto:", "tel:", "javascript:")):
                continue
            t = local_target(f, url)
            if t is None:
                continue
            target, frag, query = t
            checked += 1
            if not target.exists():
                probs.append("%s → %s(ファイルが無い)" % (f.name, url))
                continue
            runtime = RUNTIME_IDS.get(target.name, {})
            if frag in runtime:
                if 'id="%s"' % frag not in (ROOT / runtime[frag]).read_text(encoding="utf-8"):
                    probs.append("%s → %s(#%s を作るはずの %s に id が無い)" % (f.name, url, frag, runtime[frag]))
            elif frag and target.suffix == ".html" and frag not in ids_of(target):
                probs.append("%s → %s(#%s が無い)" % (f.name, url, frag))
            for dest in query.get("dest", []):
                if dest not in by_id:
                    probs.append("%s → %s(dest=%s が places.json に無い)" % (f.name, url, dest))
    test("内部リンク切れが無い(%d 本を確認)" % checked, probs)

    probs, n_ads = [], 0
    for f, p in pages.items():
        for link in p.links:
            if link["tag"] != "a":
                continue
            host = urlsplit(link["url"]).hostname or ""
            sponsored = "sponsored" in link["rel"]
            if host in AFFILIATE_HOSTS and not sponsored:
                probs.append("%s アフィリエイトの URL に rel=sponsored が無い: %s" % (f.name, link["url"][:80]))
            if sponsored:
                n_ads += 1
                if "nofollow" not in link["rel"]:
                    probs.append("%s 広告リンクに nofollow が無い" % f.name)
                if not link["in_ad"]:
                    probs.append("%s 広告リンクが「広告」の札の枠(p.ar-ad)の外にある" % f.name)
        for ad in p.ads:
            if len(ad) < 3 or ad[0] != "広告":
                probs.append("%s 広告の枠に「広告」の札が無い" % f.name)
            if ad[1] != 1:
                probs.append("%s 広告の枠にリンクが %d 本" % (f.name, ad[1]))
        if any("sponsored" in link["rel"] for link in p.links):
            text = f.read_text(encoding="utf-8")
            if "pr-notice" not in text or "プロモーション(広告)を含みます" not in text:
                probs.append("%s 広告があるのにページ冒頭の広告表示が無い" % f.name)
    test("広告ボタンの rel と「広告」表示(%d 本)" % n_ads, probs)

    muni_of = {slug: key for key, (slug, _) in B.MUNIS.items()}
    group_of = {g["slug"]: g for g in B.GROUPS}
    pref_of = {slug: pref for pref, slug in B.PREFS.items()}
    probs = []
    for f, p in pages.items():
        slug = f.stem
        if slug == "index":
            continue
        for cid in p.cards + p.rows:
            place = by_id.get(cid)
            if not place:
                probs.append("%s カード %s が places.json に無い" % (f.name, cid))
                continue
            area = place.get("area", "")
            matched = (place.get("geocode") or {}).get("matched", "") or ""
            if slug in pref_of:
                if not area.startswith(pref_of[slug]) and not (pref_of[slug] == "千葉県" and area.startswith("千葉市")):
                    probs.append("%s(%s)に別の県: %s「%s」" % (f.name, pref_of[slug], cid, area))
            elif slug in muni_of or slug in group_of:
                members = [muni_of[slug]] if slug in muni_of else group_of[slug]["members"]
                ok = False
                for pref, muni in members:
                    stem = re.sub(r"[市町村区]$", "", muni)
                    aliases = [tok for (ap, tok), m in B.ALIASES.items() if ap == pref and m == muni]
                    in_pref = area.startswith(pref) or (pref == "千葉県" and area.startswith("千葉市"))
                    if in_pref and (muni in area or stem in area or any(a in area for a in aliases)
                                    or (muni in matched and pref in matched)):
                        ok = True
                if not ok:
                    probs.append("%s に対象外の市町村: %s「%s」(住所 %s)" % (f.name, cid, area, matched[:30]))
            else:
                probs.append("%s の slug が MUNIS / GROUPS / PREFS に無い" % f.name)
        kinds = {"stays-h": [c for c in p.cards + p.rows if by_id.get(c, {}).get("type") == "lodging"],
                 "outings-h": [c for c in p.cards + p.rows if by_id.get(c, {}).get("type") == "spot"]}
        for hid, num in p.counts:
            if num != len(kinds[hid]):
                probs.append("%s 見出しの件数 %s とカード %d が違う(%s)" % (f.name, num, len(kinds[hid]), hid))
    test("カードの県・市町村が places.json と合う", probs)

    sm = (ROOT / "sitemap.xml").read_text(encoding="utf-8")
    listed = set(re.findall(re.escape(B.SITE) + r"areas/([^<]*)</loc>", sm))
    have = {("" if f.name == "index.html" else f.name) for f in files}
    test("sitemap.xml の areas/ がページと一致",
         ["sitemap に無い: %s" % x for x in sorted(have - listed)] + ["ページが無いのに sitemap にある: %s" % x for x in sorted(listed - have)])

    print("1..%d" % n)
    print("# %d/%d 合格" % (n - failed, n))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
