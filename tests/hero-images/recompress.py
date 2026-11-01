"""ページ上部の写真 4 枚を、寸法と縦横比を変えずに cwebp で再圧縮する。
元画像はこのコミットより前の main のものを使う(git の履歴にある)。
使い方: python3 tests/hero-images/recompress.py 元画像のフォルダ 出力のフォルダ
  (元画像のフォルダには 05-outdoor-brothers.webp などを平たく置く)
cwebp 1.3.2(apt の webp パッケージ)で作成。SSIM は ssim.py で元の原寸と比べる。
"""
import os
import subprocess
import sys
import tempfile

from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
from ssim import compare  # noqa: E402

# 名前: (品質, 置き先)。原寸の SSIM が 0.985 以上になる最小の品質(余裕 +0.001 以上)を選んだ。
PLAN = {
    '05-outdoor-brothers': (80, 'assets/portraits-20260922/05-outdoor-brothers.webp'),
    'play-dog': (87, 'assets/play-dog.webp'),
    'moment-smile': (82, 'assets/moment-smile.webp'),
    'moment-rest': (82, 'assets/moment-rest.webp'),
}

src_dir, out_dir = sys.argv[1], sys.argv[2]
for name, (q, dest) in PLAN.items():
    src = os.path.join(src_dir, name + '.webp')
    out = os.path.join(out_dir, dest)
    with tempfile.TemporaryDirectory() as tmp:
        png = os.path.join(tmp, name + '.png')
        Image.open(src).convert('RGB').save(png)
        subprocess.run(['cwebp', '-quiet', '-m', '6', '-pass', '10', '-af', '-q', str(q), png, '-o', out], check=True)
    a, b = Image.open(src), Image.open(out)
    assert a.size == b.size, (name, a.size, b.size)
    print(f'{name}: q{q} {os.path.getsize(src)} -> {os.path.getsize(out)} bytes, {b.size[0]}x{b.size[1]}, SSIM(原寸) {compare(src, out):.4f}')
