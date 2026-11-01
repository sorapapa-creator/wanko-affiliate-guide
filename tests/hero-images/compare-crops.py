"""再圧縮の前後を、毛並み・目・服の柄の部分で並べた 2 倍拡大画像(ニアレストネイバー)を作る。
使い方: python3 tests/hero-images/compare-crops.py 元画像のフォルダ 新画像のフォルダ 出力フォルダ
"""
import os
import sys

from PIL import Image, ImageDraw

# 名前: [(ラベル, 左, 上, 右, 下)](画像の幅・高さに対する割合)
CROPS = {
    '05-outdoor-brothers': [('face-eyes', 0.27, 0.35, 0.57, 0.53), ('vest-fur', 0.55, 0.38, 0.95, 0.62)],
    'play-dog': [('eye-fur', 0.30, 0.28, 0.75, 0.50), ('paw-toy', 0.33, 0.68, 0.78, 0.95)],
    'moment-smile': [('face-eyes', 0.22, 0.07, 0.68, 0.42), ('paw-jacket', 0.28, 0.48, 0.75, 0.72)],
    'moment-rest': [('face-eyes', 0.20, 0.20, 0.72, 0.52), ('clothes-fur', 0.35, 0.55, 0.85, 0.85)],
}
ZOOM = 2
src_dir, new_dir, out_dir = sys.argv[1:4]
for name, crops in CROPS.items():
    a = Image.open(os.path.join(src_dir, name + '.webp')).convert('RGB')
    b = Image.open(os.path.join(new_dir, name + '.webp')).convert('RGB')
    for label, l, t, r, btm in crops:
        box = (round(l * a.width), round(t * a.height), round(r * a.width), round(btm * a.height))
        ca, cb = [im.crop(box).resize(((box[2] - box[0]) * ZOOM, (box[3] - box[1]) * ZOOM), Image.NEAREST) for im in (a, b)]
        bar = 28
        canvas = Image.new('RGB', (ca.width * 2 + 12, ca.height + bar), 'white')
        canvas.paste(ca, (0, bar)); canvas.paste(cb, (ca.width + 12, bar))
        d = ImageDraw.Draw(canvas)
        d.text((8, 8), f'BEFORE {os.path.getsize(os.path.join(src_dir, name + ".webp")) // 1024}KB  crop {box} x{ZOOM}', fill='black')
        d.text((ca.width + 20, 8), f'AFTER {os.path.getsize(os.path.join(new_dir, name + ".webp")) // 1024}KB', fill='black')
        out = os.path.join(out_dir, f'{name}--{label}--before-after-x{ZOOM}.png')
        canvas.save(out, optimize=True)
        print(out, canvas.size)
