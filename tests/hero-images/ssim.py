"""元画像と再圧縮画像の SSIM(Wang et al. 2004、11x11 ガウス窓 σ=1.5、輝度 Y)を numpy だけで求める。
使い方: python3 tests/hero-images/ssim.py 元.webp 新.webp [比べる幅px]
"""
import sys
import numpy as np
from PIL import Image


def _gauss(size=11, sigma=1.5):
    x = np.arange(size) - size // 2
    g = np.exp(-(x ** 2) / (2 * sigma ** 2))
    return g / g.sum()


def _filt(a, g):
    # 分離可能なガウス畳み込み(valid)
    a = np.apply_along_axis(lambda r: np.convolve(r, g, mode='valid'), 1, a)
    return np.apply_along_axis(lambda c: np.convolve(c, g, mode='valid'), 0, a)


def luma(img, width=None):
    img = img.convert('RGB')
    if width and width != img.width:
        img = img.resize((width, round(img.height * width / img.width)), Image.LANCZOS)
    a = np.asarray(img, dtype=np.float64)
    return 0.299 * a[..., 0] + 0.587 * a[..., 1] + 0.114 * a[..., 2]


def ssim(a, b):
    g = _gauss()
    c1, c2 = (0.01 * 255) ** 2, (0.03 * 255) ** 2
    mu_a, mu_b = _filt(a, g), _filt(b, g)
    saa = _filt(a * a, g) - mu_a ** 2
    sbb = _filt(b * b, g) - mu_b ** 2
    sab = _filt(a * b, g) - mu_a * mu_b
    m = ((2 * mu_a * mu_b + c1) * (2 * sab + c2)) / ((mu_a ** 2 + mu_b ** 2 + c1) * (saa + sbb + c2))
    return float(m.mean())


def compare(orig_path, new_path, width=None):
    o, n = Image.open(orig_path), Image.open(new_path)
    w = width or o.width
    return ssim(luma(o, w), luma(n, w))


if __name__ == '__main__':
    print(f"{compare(sys.argv[1], sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else None):.4f}")
