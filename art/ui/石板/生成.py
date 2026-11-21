#!/usr/bin/env python3
"""石板风格整套（卡牌、状态层、界面零件、弹窗）生成脚本。
在 风格样本/生成.py 基础上扩展，整套沿用同一套配色、描边、裂纹、手画抖动与剪影强光参数。
运行：python3 交回/生成.py  → 输出 交回/svg/*.svg、交回/vendor/p5.min.js 与 交回/预览.html
规则约束：所有 SVG 不用 filter、<image>、<text>、外链、字体文件，单个不超过 80 KB。
"""
import base64, io, json, math, os, random, shutil
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
GAME_ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
ASSETS = os.path.join(HERE, '素材底')  # 29 包用到的买的包原图（只复制用到的几张）
OUT = os.path.join(HERE, 'svg')
PNG_OUT = os.path.join(HERE, 'png')
os.makedirs(OUT, exist_ok=True)
os.makedirs(PNG_OUT, exist_ok=True)

# ---------- 颜色（与 风格样本/生成.py 完全一致，压暗过，放进夜林不跳） ----------
INK = '#14181c'
STONE = ('#6a757d', '#545e66', '#3c444a')
BASALT = ('#454d54', '#323940', '#22282d')
CRACK, CRACK_HI = '#22282d', '#8f9ba2'
IRON = ('#a9b4ba', '#5d676e', '#2b3136')
BRONZE = ('#e0b066', '#9a6b2c', '#4f3412')
PARCH = ('#b8a27b', '#9c8660', '#6e5a3c')
COLD, WARM = '#cfe0e8', '#f7c978'
PENNANT = {
    'red': ('#f0705a', '#c0392b', '#6e1a12'), 'yellow': ('#f5d06a', '#d69e22', '#7a5410'),
    'green': ('#7fd88a', '#3e9a4a', '#1d4f24'), 'cyan': ('#7fe0dc', '#2a9c98', '#11504e'),
    'blue': ('#7fa6f0', '#3561b8', '#172f63'), 'purple': ('#c79ae8', '#7d4aa8', '#3d2156'),
    'white': ('#f4f1ea', '#c9c4ba', '#7b766d'), 'none': ('#8c969c', '#5e676d', '#30363a'),
}
GEMSET = {'red': 'r', 'yellow': 'rg', 'green': 'g', 'cyan': 'gb', 'blue': 'b', 'purple': 'br', 'white': 'rgb'}
GEMC = {
    'r': ('#ff9e94', '#ee2630', '#700812', '#ff3b30'),
    'g': ('#9effba', '#18d45c', '#075824', '#26f268'),
    'b': ('#a6dcff', '#2274f5', '#0b2a7d', '#3688ff'),
}
GLOW = {
    'red': '#ff4a3a', 'yellow': '#ffcf3a', 'green': '#3df06a',
    'cyan': '#36e8e0', 'blue': '#3f86ff', 'purple': '#c35cff', 'white': '#ffffff',
}
GLOW_KEY = '#ff00ff'  # 状态层可换色占位键（运行时用具体颜色替换）
RAINBOW = ['#ff4a3a', '#ffcf3a', '#3df06a', '#36e8e0', '#3f86ff', '#c35cff']


# ---------- 宝石与异能牌原画图片处理（从 素材底-买的包/ 原图生成 PNG 与 data URI） ----------
def _fit_square(img, size=512, fill_ratio=0.80):
    img = img.convert('RGBA')
    bbox = img.getbbox()
    if bbox: img = img.crop(bbox)
    w, h = img.size
    sc = int(size * fill_ratio) / max(w, h)
    nw, nh = max(1, int(round(w * sc))), max(1, int(round(h * sc)))
    im = img.resize((nw, nh), Image.Resampling.LANCZOS)
    cv = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    cv.paste(im, ((size - nw) // 2, (size - nh) // 2), im)
    return cv

def _add_ink_outline(img, radius=9, ink=(20, 24, 28)):
    a = np.array(img.split()[3], dtype=np.float32) / 255.0
    h, w, dil, r = a.shape[0], a.shape[1], a.copy(), int(radius)
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            if dx * dx + dy * dy <= r * r:
                np.maximum(dil[max(0, dy):min(h, h + dy), max(0, dx):min(w, w + dx)],
                           a[max(0, -dy):min(h, h - dy), max(0, -dx):min(w, w - dx)],
                           out=dil[max(0, dy):min(h, h + dy), max(0, dx):min(w, w + dx)])
    m = Image.fromarray(np.clip(dil * 255, 0, 255).astype(np.uint8), 'L').filter(ImageFilter.GaussianBlur(1.1))
    m_arr = np.clip((np.array(m, dtype=np.float32) - 40.0) * 1.45, 0, 255).astype(np.uint8)
    out = Image.new('RGBA', img.size, (*ink, 255)); out.putalpha(Image.fromarray(m_arr, 'L'))
    return Image.alpha_composite(out, img)

def _add_sparkle(img, cx, cy, r_long=34, r_short=7, color=(255, 255, 255), alpha=235):
    w, h = img.size
    ov = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    gl = Image.new('RGBA', (w, h), (0, 0, 0, 0)); gr = int(r_long * 0.55)
    ImageDraw.Draw(gl).ellipse((cx - gr, cy - gr, cx + gr, cy + gr), fill=(*color, int(alpha * 0.55)))
    ov = Image.alpha_composite(ov, gl.filter(ImageFilter.GaussianBlur(r_long * 0.25)))
    ss = 2; pad = int(r_long * 1.4) + 6; sz = pad * 2
    st = Image.new('RGBA', (sz * ss, sz * ss), (0, 0, 0, 0)); sd = ImageDraw.Draw(st)
    sc, rl, rs = pad * ss, r_long * ss, r_short * ss
    sd.polygon([(sc, sc - rl), (sc + rs, sc - rs), (sc + rl, sc), (sc + rs, sc + rs),
                (sc, sc + rl), (sc - rs, sc + rs), (sc - rl, sc), (sc - rs, sc - rs)], fill=(*color, alpha))
    sd.ellipse((sc - rs, sc - rs, sc + rs, sc + rs), fill=(255, 255, 255, 255))
    st = st.resize((sz, sz), Image.Resampling.LANCZOS)
    ov.paste(st, (int(cx - pad), int(cy - pad)), st)
    return Image.alpha_composite(img, ov)

def _add_inner_core_glow(img, cx, cy, radius, color, strength=0.35):
    arr = np.array(img, dtype=np.float32)
    yy, xx = np.mgrid[0:arr.shape[0], 0:arr.shape[1]]
    g = np.clip(1.0 - np.hypot(xx - cx, yy - cy) / float(radius), 0.0, 1.0) ** 2.2 * strength * (arr[:, :, 3] / 255.0)
    for ci, cv in enumerate(color):
        b = arr[:, :, ci] / 255.0
        arr[:, :, ci] = np.clip((1.0 - (1.0 - b) * (1.0 - (cv / 255.0) * g)) * 255.0, 0, 255)
    return Image.fromarray(arr.astype(np.uint8), 'RGBA')

def _ramp_grayscale(img, stops):
    arr = np.array(img.convert('RGBA'), dtype=np.float32)
    lum = np.clip(((0.299 * arr[:, :, 0] + 0.587 * arr[:, :, 1] + 0.114 * arr[:, :, 2]) / 255.0 - 0.04) / 0.90, 0.0, 1.0)
    xp = np.array([s[0] for s in stops], dtype=np.float32); out = np.zeros_like(arr)
    for c in range(3): out[:, :, c] = np.interp(lum, xp, np.array([s[1][c] for s in stops], dtype=np.float32))
    out[:, :, 3] = arr[:, :, 3]
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), 'RGBA')

def _png_to_data_uri(img, max_size=200):
    im = img.copy()
    if max(im.size) > max_size: im.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)
    buf = io.BytesIO(); im.save(buf, format='PNG', optimize=True)
    return 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode('ascii')

def _build_gem_assets():
    uris = {}
    # 1) 红宝石：水晶/Red oval.png（圆润多面体，调正红不偏粉，补墨线与光核）
    red_im = _fit_square(Image.open(os.path.join(ASSETS, '水晶', 'Red oval.png')), 512, 0.80)
    arr = np.array(red_im, dtype=np.float32); r, g, b, a = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2], arr[:, :, 3]
    red_im = Image.fromarray(np.stack([np.clip(r * 1.12 + 8, 0, 255), np.clip(g * 0.78 + np.maximum(0, g - 170) * 0.55, 0, 255),
                                       np.clip(b * 0.72 + np.maximum(0, b - 165) * 0.50, 0, 255), a], axis=-1).astype(np.uint8), 'RGBA')
    red_im = _add_ink_outline(_add_sparkle(_add_inner_core_glow(red_im, 232, 230, 155, (255, 110, 95), 0.38), 224, 152, 32, 5.5, (255, 235, 225), 235), 10)
    red_im.save(os.path.join(PNG_OUT, '宝石-红.png'), optimize=True); uris['r'] = _png_to_data_uri(red_im, 192)
    # 2) 绿宝石：切面宝石/Green.png（经典六边切面，去黄绿偏纯翠绿，补墨线与星芒）
    grn_im = _fit_square(Image.open(os.path.join(ASSETS, '切面宝石', 'Green.png')), 512, 0.80)
    arr = np.array(grn_im, dtype=np.float32); r, g, b, a = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2], arr[:, :, 3]
    grn_im = Image.fromarray(np.stack([np.clip(r * 0.56 + np.maximum(0, r - 185) * 0.60, 0, 255), np.clip(g * 1.08 + 6, 0, 255),
                                       np.clip(b * 1.05 + g * 0.08, 0, 255), a], axis=-1).astype(np.uint8), 'RGBA')
    grn_im = _add_ink_outline(_add_sparkle(_add_inner_core_glow(grn_im, 248, 245, 155, (105, 255, 160), 0.30), 256, 108, 30, 5.5, (225, 255, 236), 230), 10)
    grn_im.save(os.path.join(PNG_OUT, '宝石-绿.png'), optimize=True); uris['g'] = _png_to_data_uri(grn_im, 192)
    # 3) 蓝宝石：水晶/Grayscale narrow poly.png（尖窄长水晶，灰度映射纯宝蓝不偏紫）
    blu_im = _fit_square(Image.open(os.path.join(ASSETS, '水晶', 'Grayscale narrow poly.png')), 512, 0.84)
    blu_im = _ramp_grayscale(blu_im, [(0.0, (6, 22, 78)), (0.28, (14, 68, 190)), (0.56, (34, 134, 255)), (0.80, (124, 212, 255)), (1.0, (236, 250, 255))])
    blu_im = _add_ink_outline(_add_sparkle(_add_inner_core_glow(blu_im, 252, 218, 150, (110, 210, 255), 0.40), 254, 152, 32, 5.5, (230, 248, 255), 240), 10)
    blu_im.save(os.path.join(PNG_OUT, '宝石-蓝.png'), optimize=True); uris['b'] = _png_to_data_uri(blu_im, 192)
    return uris

def _perspective_coeffs(src_pts, dst_pts):
    M = []
    for (x, y), (u, v) in zip(dst_pts, src_pts):
        M.append([x, y, 1, 0, 0, 0, -u * x, -u * y]); M.append([0, 0, 0, x, y, 1, -v * x, -v * y])
    return tuple(np.linalg.solve(np.array(M, dtype=np.float64), np.array([c for pt in src_pts for c in pt], dtype=np.float64)))

def _tint_alpha_mask(alpha_img, core_col, glow_col, glow_radius=12, glow_strength=0.85):
    a = np.array(alpha_img, dtype=np.float32) / 255.0
    ga = np.array(alpha_img.filter(ImageFilter.GaussianBlur(glow_radius)), dtype=np.float32) / 255.0
    gl, cl = np.zeros((*a.shape, 4), dtype=np.float32), np.zeros((*a.shape, 4), dtype=np.float32)
    for c in range(3): gl[:, :, c], cl[:, :, c] = glow_col[c], core_col[c]
    gl[:, :, 3], cl[:, :, 3] = np.clip(ga * 255 * glow_strength, 0, 255), np.clip(a * 255, 0, 255)
    return Image.alpha_composite(Image.fromarray(gl.astype(np.uint8), 'RGBA'), Image.fromarray(cl.astype(np.uint8), 'RGBA'))

def _build_ability_assets():
    uris = {}
    # 1) 增幅法阵：符印/Runic.png 双层放大 + 平放透视 + 蓝光上升能量
    runic_a = Image.open(os.path.join(ASSETS, '符印', 'Runic.png')).convert('RGBA').split()[3]
    S = 640; flat = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    osz = int(S * 0.90); oa = runic_a.resize((osz, osz), Image.Resampling.LANCZOS).rotate(22.5, resample=Image.Resampling.BICUBIC)
    of = Image.new('L', (S, S), 0); of.paste(oa, ((S - osz) // 2, (S - osz) // 2)); od = ImageDraw.Draw(of)
    od.ellipse((14, 14, S - 14, S - 14), outline=230, width=7)
    for i in range(8):
        ang = math.radians(i * 45 + 22.5)
        od.line((S / 2 + math.cos(ang) * 282, S / 2 + math.sin(ang) * 282, S / 2 + math.cos(ang) * 308, S / 2 + math.sin(ang) * 308), fill=255, width=6)
    flat = Image.alpha_composite(flat, _tint_alpha_mask(of, (115, 208, 255), (36, 128, 255), 16, 0.95))
    isz = int(S * 0.56); inf = Image.new('L', (S, S), 0); inf.paste(runic_a.resize((isz, isz), Image.Resampling.LANCZOS), ((S - isz) // 2, (S - isz) // 2))
    flat = Image.alpha_composite(flat, _tint_alpha_mask(inf, (224, 248, 255), (86, 185, 255), 14, 1.0))
    tilted = flat.transform((512, 512), Image.Transform.PERSPECTIVE, _perspective_coeffs([(0, 0), (S, 0), (S, S), (0, S)], [(98, 212), (414, 212), (492, 424), (20, 424)]), Image.Resampling.BICUBIC)
    amp = Image.new('RGBA', (512, 512), (0, 0, 0, 0)); bg = Image.new('RGBA', (512, 512), (0, 0, 0, 0)); bgd = ImageDraw.Draw(bg)
    bgd.ellipse((46, 224, 466, 426), fill=(24, 110, 255, 130)); bgd.ellipse((128, 254, 384, 388), fill=(115, 225, 255, 145))
    bgd.polygon([(170, 310), (342, 310), (398, 62), (114, 62)], fill=(48, 152, 255, 78)); bgd.polygon([(210, 315), (302, 315), (336, 92), (176, 92)], fill=(150, 232, 255, 86))
    amp = Image.alpha_composite(amp, bg.filter(ImageFilter.GaussianBlur(22)))
    amp = Image.alpha_composite(amp, _add_ink_outline(tilted, 4, (14, 22, 36)))
    ru = Image.new('RGBA', (512, 512), (0, 0, 0, 0)); rd = ImageDraw.Draw(ru)
    rd.ellipse((96, 154, 416, 258), outline=(140, 226, 255, 215), width=5); rd.ellipse((142, 110, 370, 184), outline=(195, 242, 255, 175), width=3)
    amp = Image.alpha_composite(Image.alpha_composite(amp, ru.filter(ImageFilter.GaussianBlur(7))), ru)
    for sx, sy, rl in ((256, 292, 36), (154, 198, 20), (358, 188, 22), (256, 132, 24), (192, 118, 14), (324, 126, 16)):
        amp = _add_sparkle(amp, sx, sy, rl, max(3, rl / 5.5), (210, 245, 255), 230)
    amp.save(os.path.join(PNG_OUT, '原画-增幅法阵.png'), optimize=True); uris['增幅法阵'] = _png_to_data_uri(amp, 260)
    # 2) 灵感涌现：法术书/Grayscale/* 调翠绿光 + 两张发光卡牌从绿光里飞出（仅实体书加墨线）
    book_col = _ramp_grayscale(Image.open(os.path.join(ASSETS, '法术书', 'Grayscale', 'Book.png')), [(0.0, (32, 18, 10)), (0.28, (78, 44, 22)), (0.55, (124, 74, 38)), (0.74, (176, 146, 106)), (1.0, (226, 204, 164))])
    book_inked = _add_ink_outline(book_col, 7)
    writ_col = _tint_alpha_mask(Image.open(os.path.join(ASSETS, '法术书', 'Grayscale', 'Writing.png')).convert('RGBA').split()[3], (208, 255, 222), (32, 236, 104), 10, 0.95)
    ess_col = _tint_alpha_mask(Image.open(os.path.join(ASSETS, '法术书', 'Grayscale', 'Magical essence.png')).convert('RGBA').split()[3], (164, 255, 196), (28, 225, 96), 12, 0.92)
    sb = Image.alpha_composite(Image.alpha_composite(book_inked, writ_col), ess_col).resize((336, 336), Image.Resampling.LANCZOS)
    insp = Image.new('RGBA', (512, 512), (0, 0, 0, 0)); mg = Image.new('RGBA', (512, 512), (0, 0, 0, 0)); mgd = ImageDraw.Draw(mg)
    mgd.ellipse((68, 128, 444, 438), fill=(22, 210, 92, 130)); mgd.ellipse((134, 88, 386, 336), fill=(118, 255, 168, 135))
    insp = Image.alpha_composite(insp, mg.filter(ImageFilter.GaussianBlur(28))); insp.paste(sb, (64, 174), sb)
    def _flying_card(angle, accent):
        ss = 2; cw, ch, ox, oy = 128 * ss, 176 * ss, 20 * ss, 20 * ss
        c_im, cg = Image.new('RGBA', (cw + 40 * ss, ch + 40 * ss), (0, 0, 0, 0)), Image.new('RGBA', (cw + 40 * ss, ch + 40 * ss), (0, 0, 0, 0))
        ImageDraw.Draw(cg).rounded_rectangle((ox - 12, oy - 12, ox + cw + 12, oy + ch + 12), 36, fill=(46, 245, 118, 165))
        c_im = Image.alpha_composite(c_im, cg.filter(ImageFilter.GaussianBlur(20))); cd = ImageDraw.Draw(c_im)
        cd.rounded_rectangle((ox, oy, ox + cw, oy + ch), 28, fill=(24, 48, 38, 245), outline=(20, 24, 28, 255), width=14)
        cd.rounded_rectangle((ox + 14, oy + 14, ox + cw - 14, oy + ch - 14), 20, outline=accent, width=8)
        cd.rounded_rectangle((ox + 32, oy + 32, ox + cw - 32, oy + ch - 32), 12, fill=(32, 74, 54, 230), outline=(140, 255, 180, 185), width=4)
        mx, my = ox + cw // 2, oy + ch // 2
        cd.polygon([(mx, my - 68), (mx + 48, my), (mx, my + 68), (mx - 48, my)], fill=(190, 255, 212, 235), outline=(20, 24, 28, 255))
        cd.polygon([(mx, my - 36), (mx + 24, my), (mx, my + 36), (mx - 24, my)], fill=(245, 255, 248, 255))
        rot = c_im.rotate(angle, resample=Image.Resampling.BICUBIC, expand=True)
        return rot.resize((rot.width // ss, rot.height // ss), Image.Resampling.LANCZOS)
    c1, c2 = _flying_card(18, (118, 255, 166, 255)), _flying_card(-14, (176, 255, 204, 255))
    insp.paste(c1, (108, 34), c1); insp.paste(c2, (254, 56), c2)
    for sx, sy, rl in ((232, 206, 34), (146, 98, 20), (376, 128, 22), (312, 266, 18), (110, 248, 16)):
        insp = _add_sparkle(insp, sx, sy, rl, max(3, rl / 5.5), (215, 255, 228), 235)
    insp.save(os.path.join(PNG_OUT, '原画-灵感涌现.png'), optimize=True); uris['灵感涌现'] = _png_to_data_uri(insp, 260)
    return uris

GEM_URIS = _build_gem_assets()
ABILITY_URIS = _build_ability_assets()


def f(v):
    return f'{v:.1f}'.rstrip('0').rstrip('.')


def wobble(pts, rnd, amp=1.2, closed=True):
    """手画感：每段切成小段加一点抖动"""
    out = []
    n = len(pts)
    for i in range(n if closed else n - 1):
        (x0, y0), (x1, y1) = pts[i], pts[(i + 1) % n]
        L = math.hypot(x1 - x0, y1 - y0)
        k = max(1, int(L / 14))
        for j in range(k):
            t = j / k
            out.append((x0 + (x1 - x0) * t + rnd.uniform(-amp, amp), y0 + (y1 - y0) * t + rnd.uniform(-amp, amp)))
    if not closed:
        out.append(pts[-1])
    return out


def path(pts, closed=True):
    s = 'M' + ' L'.join(f'{f(x)} {f(y)}' for x, y in pts)
    return s + (' Z' if closed else '')


def rrect_pts(x0, y0, x1, y1, r, step=8):
    pts = []
    for cx, cy, a0 in ((x1 - r, y0 + r, -90), (x1 - r, y1 - r, 0), (x0 + r, y1 - r, 90), (x0 + r, y0 + r, 180)):
        for i in range(step + 1):
            a = math.radians(a0 + 90 * i / step)
            pts.append((cx + math.cos(a) * r, cy + math.sin(a) * r))
    return pts


def arch_pts(x0, y0, x1, y1, step=24):
    """拱形窗：底边平，两边竖直，顶上一道尖拱"""
    cx, top, sh = (x0 + x1) / 2, y0, y0 + (x1 - x0) * 0.36
    pts = [(x0, y1), (x0, sh)]
    for i in range(1, step):
        t = i / step
        if t < 0.5:
            u = t * 2
            pts.append((
                (1 - u) ** 2 * x0 + 2 * (1 - u) * u * x0 + u * u * cx,
                (1 - u) ** 2 * sh + 2 * (1 - u) * u * (top + 8) + u * u * top,
            ))
        else:
            u = (t - 0.5) * 2
            pts.append((
                (1 - u) ** 2 * cx + 2 * (1 - u) * u * x1 + u * u * x1,
                (1 - u) ** 2 * top + 2 * (1 - u) * u * (top + 8) + u * u * sh,
            ))
    pts += [(x1, sh), (x1, y1)]
    return pts


def circle_pts(cx, cy, r, step=48):
    return [(cx + math.cos(i / step * math.tau) * r, cy + math.sin(i / step * math.tau) * r) for i in range(step)]


def cracks(rnd, box, n, avoid=None):
    """石头裂纹：从边上往里走，带分叉；每条一道暗线 + 下面一道亮线"""
    x0, y0, x1, y1 = box
    dark, light = [], []
    for _ in range(n):
        side = rnd.randrange(4)
        if side == 0:
            x, y, a = rnd.uniform(x0, x1), y0, math.pi / 2
        elif side == 1:
            x, y, a = x1, rnd.uniform(y0, y1), math.pi
        elif side == 2:
            x, y, a = rnd.uniform(x0, x1), y1, -math.pi / 2
        else:
            x, y, a = x0, rnd.uniform(y0, y1), 0
        pts = [(x, y)]
        for _ in range(rnd.randint(3, 6)):
            a += rnd.uniform(-0.7, 0.7)
            L = rnd.uniform(14, 34)
            x, y = x + math.cos(a) * L, y + math.sin(a) * L
            if avoid and avoid(x, y):
                break
            pts.append((x, y))
            if rnd.random() < 0.25:
                b = a + rnd.choice((-1, 1)) * rnd.uniform(0.6, 1.1)
                bx, by = x + math.cos(b) * rnd.uniform(10, 22), y + math.sin(b) * rnd.uniform(10, 22)
                if not (avoid and avoid(bx, by)):
                    dark.append(path([(x, y), (bx, by)], False))
                    light.append(path([(x + 0.8, y + 1.6), (bx + 0.8, by + 1.6)], False))
        if len(pts) > 1:
            dark.append(path(pts, False))
            light.append(path([(px + 0.8, py + 1.6) for px, py in pts], False))
    if not dark:
        return ''
    return (
        f'<path d="{" ".join(light)}" fill="none" stroke="{CRACK_HI}" stroke-width="1.1" stroke-opacity="0.45" stroke-linecap="round" stroke-linejoin="round"/>'
        f'<path d="{" ".join(dark)}" fill="none" stroke="{CRACK}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>'
    )


def pits(rnd, box, n, avoid=None):
    out = []
    x0, y0, x1, y1 = box
    for _ in range(n):
        x, y = rnd.uniform(x0, x1), rnd.uniform(y0, y1)
        if avoid and avoid(x, y):
            continue
        r = rnd.uniform(1.4, 3.6)
        out.append(
            f'<ellipse cx="{f(x)}" cy="{f(y + 0.9)}" rx="{f(r)}" ry="{f(r * 0.7)}" fill="{CRACK_HI}" fill-opacity="0.35"/>'
            f'<ellipse cx="{f(x)}" cy="{f(y)}" rx="{f(r)}" ry="{f(r * 0.7)}" fill="{CRACK}" fill-opacity="0.8"/>'
        )
    return ''.join(out)


def metal_ring(d, col, width, gid):
    """铁 / 铜框：粗描边，竖向渐变，两侧墨线，上面一道亮线"""
    hi, mid, lo = col
    return (
        f'<linearGradient id="{gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{hi}"/><stop offset="0.35" stop-color="{mid}"/><stop offset="1" stop-color="{lo}"/></linearGradient>',
        f'<path d="{d}" fill="none" stroke="{INK}" stroke-width="{f(width + 5)}" stroke-linejoin="round"/>'
        f'<path d="{d}" fill="none" stroke="url(#{gid})" stroke-width="{f(width)}" stroke-linejoin="round"/>'
        f'<path d="{d}" fill="none" stroke="{hi}" stroke-opacity="0.55" stroke-width="1.4" stroke-linejoin="round" transform="translate(0,-{width * 0.28:.1f})"/>'
    )


def plate(y0, y1, x0=66, x1=334, rnd=None, gid='pl', bevel=16, sw=3.5, rivets=True):
    """标题牌：两头斜切的铁牌"""
    m = (y0 + y1) / 2
    pts = [(x0, m), (x0 + bevel, y0), (x1 - bevel, y0), (x1, m), (x1 - bevel, y1), (x0 + bevel, y1)]
    d = path(wobble(pts, rnd, 0.6))
    riv = ''
    if rivets:
        r_off = bevel + 6
        riv = ''.join(f'<circle cx="{f(cx)}" cy="{f(m)}" r="3.2" fill="#7d878d" stroke="{INK}" stroke-width="1.2"/>' for cx in (x0 + r_off, x1 - r_off))
    return (
        f'<linearGradient id="{gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4a535a"/><stop offset="0.5" stop-color="#30373c"/><stop offset="1" stop-color="#1e2327"/></linearGradient>',
        f'<path d="{d}" fill="url(#{gid})" stroke="{INK}" stroke-width="{f(sw)}" stroke-linejoin="round"/>'
        f'<path d="M{f(x0 + bevel + 2)} {f(y0 + 3.5)} L{f(x1 - bevel - 2)} {f(y0 + 3.5)}" stroke="#8e999f" stroke-opacity="0.6" stroke-width="1.4"/>'
        f'<path d="M{f(x0 + bevel + 2)} {f(y1 - 3)} L{f(x1 - bevel - 2)} {f(y1 - 3)}" stroke="#000" stroke-opacity="0.35" stroke-width="1.4"/>'
        + riv
    )


def pennant(colkey, rnd):
    """左上角挂下来的小旗：牌的颜色"""
    hi, mid, lo = PENNANT[colkey]
    x0, x1, y0, y1, notch = 30, 86, 2, 126, 110
    pts = [(x0, y0), (x1, y0), (x1, y1), ((x0 + x1) / 2, notch), (x0, y1)]
    d = path(wobble(pts, rnd, 0.7))
    return (
        f'<linearGradient id="pn" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="{hi}"/><stop offset="0.45" stop-color="{mid}"/><stop offset="1" stop-color="{lo}"/></linearGradient>',
        f'<path d="{d}" fill="url(#pn)" stroke="{INK}" stroke-width="3.5" stroke-linejoin="round"/>'
        f'<path d="M{x0 + 7} 8 L{x0 + 7} {y1 - 8}" stroke="{hi}" stroke-opacity="0.7" stroke-width="2" stroke-linecap="round"/>'
        f'<rect x="{x0 - 6}" y="0" width="{x1 - x0 + 12}" height="9" rx="4" fill="#5d676e" stroke="{INK}" stroke-width="2.5"/>'
        f'<rect x="{x0 - 3}" y="1.6" width="{x1 - x0 + 6}" height="2" rx="1" fill="#b3bec4" fill-opacity="0.6"/>'
    )


def parchment_box(x0, y0, x1, y1, rnd, gid='pa', sw=3.0):
    """羊皮纸框：手画抖动边缘 + 内暗边"""
    pp = path(wobble([(x0, y0), (x1, y0), (x1 + 1.5, y1), (x0 - 1.5, y1)], rnd, 1.3))
    defs = (
        f'<linearGradient id="{gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{PARCH[0]}"/><stop offset="0.7" stop-color="{PARCH[1]}"/><stop offset="1" stop-color="{PARCH[2]}"/></linearGradient>'
        f'<clipPath id="{gid}c"><path d="{pp}"/></clipPath>'
    )
    body_s = (
        f'<path d="{pp}" fill="url(#{gid})" stroke="{INK}" stroke-width="{f(sw)}" stroke-linejoin="round"/>'
        f'<path d="{pp}" fill="none" stroke="#5a4630" stroke-opacity="0.5" stroke-width="6" stroke-linejoin="round" clip-path="url(#{gid}c)"/>'
        f'<path d="M{f(x0 + 8)} {f(y0 + 3.5)} L{f(x1 - 8)} {f(y0 + 3.5)}" stroke="#e3d2b0" stroke-opacity="0.45" stroke-width="1.3"/>'
    )
    return defs, body_s


def stone_panel(x0, y0, x1, y1, r, rnd, tone, hole_d='', n_cracks=9, n_pits=20, avoid=None, sw=4.5, inset=12, gid='st'):
    """通用石板底：可用于牌身、面板、槽体"""
    hi, mid, lo = tone
    out_pts = wobble(rrect_pts(x0, y0, x1, y1, r), rnd, 0.9)
    od = path(out_pts)
    inner = path(wobble(rrect_pts(x0 + inset, y0 + inset, x1 - inset, y1 - inset, max(4, r - 6)), rnd, 0.6))
    defs = (
        f'<linearGradient id="{gid}" x1="0" y1="0" x2="0.35" y2="1"><stop offset="0" stop-color="{hi}"/><stop offset="0.5" stop-color="{mid}"/><stop offset="1" stop-color="{lo}"/></linearGradient>'
        f'<radialGradient id="{gid}v" cx="0.5" cy="0.45" r="0.75"><stop offset="0.55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.45"/></radialGradient>'
        f'<linearGradient id="{gid}l" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{COLD}" stop-opacity="0.9"/><stop offset="0.12" stop-color="{COLD}" stop-opacity="0"/><stop offset="0.85" stop-color="{WARM}" stop-opacity="0"/><stop offset="1" stop-color="{WARM}" stop-opacity="0.9"/></linearGradient>'
        f'<clipPath id="{gid}c"><path d="{od}"/></clipPath>'
    )
    fill_d = f'{od} {hole_d}'.strip()
    extra = cracks(rnd, (x0 + inset, y0 + inset, x1 - inset, y1 - inset), n_cracks, avoid) + pits(rnd, (x0 + inset + 6, y0 + inset + 6, x1 - inset - 6, y1 - inset - 6), n_pits, avoid)
    s = (
        f'<path d="{fill_d}" fill-rule="evenodd" fill="url(#{gid})"/>'
        f'<g clip-path="url(#{gid}c)">'
        f'<path d="{fill_d}" fill-rule="evenodd" fill="url(#{gid}v)"/>'
        f'<path d="{inner}" fill="none" stroke="#000" stroke-opacity="0.35" stroke-width="3" transform="translate(1.5,2)"/>'
        f'<path d="{inner}" fill="none" stroke="#a7b2b8" stroke-opacity="0.35" stroke-width="1.6"/>'
        f'{extra}</g>'
        f'<path d="{od}" fill="none" stroke="{INK}" stroke-width="{f(sw)}" stroke-linejoin="round"/>'
        f'<path d="{od}" fill="none" stroke="url(#{gid}l)" stroke-width="1.6" stroke-linejoin="round"/>'
    )
    return defs, s


def gem(k, cx, cy, R, gid, glow_scale=2.6):
    """基于买的包改色的透光宝石（PNG data URI 内嵌）+ 外围径向光晕"""
    _, _, _, glow = GEMC[k]
    defs = ''
    halo = ''
    if glow_scale > 0:
        defs = (
            f'<radialGradient id="{gid}g" cx="0.5" cy="0.5" r="0.5">'
            f'<stop offset="0" stop-color="{glow}" stop-opacity="0.72"/>'
            f'<stop offset="0.42" stop-color="{glow}" stop-opacity="0.24"/>'
            f'<stop offset="1" stop-color="{glow}" stop-opacity="0"/>'
            f'</radialGradient>'
        )
        halo = f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(R * glow_scale)}" fill="url(#{gid}g)"/>'
    size = R * 2.52
    img_el = (
        f'<image x="{f(cx - size / 2)}" y="{f(cy - size / 2)}" '
        f'width="{f(size)}" height="{f(size)}" href="{GEM_URIS[k]}"/>'
    )
    return defs, halo + img_el


def _color_window_lights(key, lay, rnd, clip_d):
    """干净的色光牌窗底与光混色层：每颗宝石发本色光，交叠区直接显纯正混色，不发褐不发灰"""
    mix_col = GLOW[key]
    # 混色高光核（黄更明黄、青更亮青、紫更纯紫、白纯白）
    mix_core = {
        'red': '#ffb0a6', 'yellow': '#fff6a6', 'green': '#b2ffcc',
        'cyan': '#c8ffff', 'blue': '#b8deff', 'purple': '#f2c2ff', 'white': '#ffffff',
    }[key]
    defs = (
        '<linearGradient id="cfog" x1="0" y1="0" x2="0" y2="1">'
        '<stop offset="0" stop-color="#1d2b33"/><stop offset="0.55" stop-color="#111a20"/><stop offset="1" stop-color="#080d11"/>'
        '</linearGradient>'
        f'<radialGradient id="cmix" cx="0.5" cy="0.5" r="0.5">'
        f'<stop offset="0" stop-color="{mix_core}" stop-opacity="0.72"/>'
        f'<stop offset="0.38" stop-color="{mix_col}" stop-opacity="0.46"/>'
        f'<stop offset="0.75" stop-color="{mix_col}" stop-opacity="0.14"/>'
        f'<stop offset="1" stop-color="{mix_col}" stop-opacity="0"/>'
        f'</radialGradient>'
        f'<clipPath id="cw"><path d="{clip_d}"/></clipPath>'
    )
    trees = ''.join(
        f'<rect x="{f(x)}" y="{f(rnd.uniform(135, 235))}" width="{f(rnd.uniform(5, 10))}" height="380" fill="#0b1318" fill-opacity="{rnd.uniform(0.45, 0.75):.2f}"/>'
        for x in (rnd.uniform(62, 112), rnd.uniform(148, 184), rnd.uniform(252, 305), rnd.uniform(310, 342))
    )

    # 每颗宝石各自向自己一侧发出的纯色光束（避开直接相撞变褐）
    beams = []
    n = len(lay)
    for i, (k, (gx, gy, R)) in enumerate(zip(GEMSET[key], lay)):
        gcol = GEMC[k][3]
        defs += (
            f'<radialGradient id="cbm{i}" cx="0.5" cy="0.5" r="0.5">'
            f'<stop offset="0" stop-color="{gcol}" stop-opacity="0.62"/>'
            f'<stop offset="0.45" stop-color="{gcol}" stop-opacity="0.22"/>'
            f'<stop offset="1" stop-color="{gcol}" stop-opacity="0"/>'
            f'</radialGradient>'
        )
        # 多颗时让本色光略偏外侧，中央交叠区完全交给纯正混色光
        ox = (gx - 200) * (0.38 if n > 1 else 0.0)
        oy = (gy - 255) * (0.28 if n > 1 else 0.0)
        beams.append(f'<ellipse cx="{f(gx + ox)}" cy="{f(gy + oy)}" rx="{f(R * 2.15)}" ry="{f(R * 2.05)}" fill="url(#cbm{i})"/>')

    # 中央纯正混色交叠区（双色/三色最显眼）
    if n == 1:
        mx, my, rx, ry = 200, 250, 155, 165
    elif n == 2:
        mx, my, rx, ry = 200, 236, 148, 158
    else:
        mx, my, rx, ry = 200, 256, 162, 168
    mix_el = f'<ellipse cx="{mx}" cy="{my}" rx="{rx}" ry="{ry}" fill="url(#cmix)"/>'

    # 交叠中心一道干净的混色光斑与微光尘
    overlap_flare = ''
    if n >= 2:
        defs += (
            f'<radialGradient id="cfl" cx="0.5" cy="0.5" r="0.5">'
            f'<stop offset="0" stop-color="#ffffff" stop-opacity="0.88"/>'
            f'<stop offset="0.32" stop-color="{mix_core}" stop-opacity="0.72"/>'
            f'<stop offset="0.68" stop-color="{mix_col}" stop-opacity="0.32"/>'
            f'<stop offset="1" stop-color="{mix_col}" stop-opacity="0"/>'
            f'</radialGradient>'
        )
        fy = 232 if n == 2 else 264
        fr = 82 if n == 2 else 92
        overlap_flare = f'<circle cx="200" cy="{fy}" r="{fr}" fill="url(#cfl)"/>'

    motes = ''.join(
        f'<circle cx="{f(rnd.uniform(62, 338))}" cy="{f(rnd.uniform(74, 398))}" '
        f'r="{f(rnd.uniform(0.9, 2.3))}" fill="{mix_core if idx % 2 == 0 else "#ffffff"}" '
        f'fill-opacity="{rnd.uniform(0.32, 0.82):.2f}"/>'
        for idx in range(24)
    )
    bg_svg = f'<rect width="400" height="600" fill="url(#cfog)"/>{trees}{"".join(beams)}{mix_el}{overlap_flare}{motes}'
    return defs, bg_svg


def window_bg(glow, rnd, clip_d, cy=240):
    """窗里的底：夜雾 + 这张牌的光 + 几颗光尘"""
    motes = ''.join(
        f'<circle cx="{f(rnd.uniform(40, 360))}" cy="{f(rnd.uniform(40, 460))}" r="{f(rnd.uniform(0.8, 2.2))}" fill="{COLD}" fill-opacity="{rnd.uniform(0.25, 0.7):.2f}"/>'
        for _ in range(26)
    )
    trees = ''.join(
        f'<rect x="{f(x)}" y="{f(rnd.uniform(120, 220))}" width="{f(rnd.uniform(5, 11))}" height="400" fill="#16232a" fill-opacity="{rnd.uniform(0.35, 0.7):.2f}"/>'
        for x in (rnd.uniform(60, 120), rnd.uniform(150, 190), rnd.uniform(250, 330), rnd.uniform(300, 345))
    )
    return (
        f'<linearGradient id="fog" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4f6f78"/><stop offset="0.55" stop-color="#22343a"/><stop offset="1" stop-color="#0f171b"/></linearGradient>'
        f'<radialGradient id="wl" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="{glow}" stop-opacity="0.45"/><stop offset="1" stop-color="{glow}" stop-opacity="0"/></radialGradient>'
        f'<clipPath id="cw"><path d="{clip_d}"/></clipPath>',
        f'<g clip-path="url(#cw)"><rect width="400" height="600" fill="url(#fog)"/>{trees}<ellipse cx="200" cy="{cy}" rx="170" ry="150" fill="url(#wl)"/>{motes}</g>'
    )


def corner_brackets(x0, y0, x1, y1, L=24, w=7, col=IRON, gid='cb'):
    """面板/牌底铁包角"""
    hi, mid, lo = col
    d_list = [
        f'M{f(x0)} {f(y0 + L)} L{f(x0)} {f(y0)} L{f(x0 + L)} {f(y0)}',
        f'M{f(x1 - L)} {f(y0)} L{f(x1)} {f(y0)} L{f(x1)} {f(y0 + L)}',
        f'M{f(x1)} {f(y1 - L)} L{f(x1)} {f(y1)} L{f(x1 - L)} {f(y1)}',
        f'M{f(x0 + L)} {f(y1)} L{f(x0)} {f(y1)} L{f(x0)} {f(y1 - L)}',
    ]
    d = ' '.join(d_list)
    riv = ''.join(f'<circle cx="{f(rx)}" cy="{f(ry)}" r="2.2" fill="{hi}" stroke="{INK}" stroke-width="1"/>' for rx, ry in ((x0 + 6, y0 + 6), (x1 - 6, y0 + 6), (x1 - 6, y1 - 6), (x0 + 6, y1 - 6)))
    return (
        f'<linearGradient id="{gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{hi}"/><stop offset="0.5" stop-color="{mid}"/><stop offset="1" stop-color="{lo}"/></linearGradient>',
        f'<path d="{d}" fill="none" stroke="{INK}" stroke-width="{f(w + 4)}" stroke-linecap="round" stroke-linejoin="round"/>'
        f'<path d="{d}" fill="none" stroke="url(#{gid})" stroke-width="{f(w)}" stroke-linecap="round" stroke-linejoin="round"/>'
        f'<path d="{d}" fill="none" stroke="{hi}" stroke-opacity="0.55" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>'
        + riv
    )


def svg(defs, body_s, w=400, h=600):
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}"><defs>{defs}</defs>{body_s}</svg>'


# ---------- 徽记（三种：法术菱形紫金、封印圆环冷蓝、宝物六边暖金） ----------
def badge_parts(kind, cx, cy, R=22, gid='bg'):
    if kind == 'seal':
        defs = f'<radialGradient id="{gid}" cx="0.35" cy="0.3" r="0.75"><stop offset="0" stop-color="#e3f7ff"/><stop offset="0.5" stop-color="#9fd2e0"/><stop offset="1" stop-color="#3c6d7e"/></radialGradient>'
        s = (
            f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(R)}" fill="#2b3136" stroke="{INK}" stroke-width="3"/>'
            f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(R * 0.77)}" fill="none" stroke="#7d878d" stroke-width="3"/>'
            f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(R * 0.45)}" fill="url(#{gid})" stroke="{INK}" stroke-width="2"/>'
            f'<ellipse cx="{f(cx - R * 0.16)}" cy="{f(cy - R * 0.16)}" rx="{f(R * 0.16)}" ry="{f(R * 0.09)}" fill="#fff" fill-opacity="0.8"/>'
        )
        return defs, s
    if kind == 'spell':
        # 菱形铜紫徽记 + 四芒符星
        outer = [(cx, cy - R * 1.15), (cx + R * 0.96, cy), (cx, cy + R * 1.15), (cx - R * 0.96, cy)]
        inner = [(cx, cy - R * 0.78), (cx + R * 0.64, cy), (cx, cy + R * 0.78), (cx - R * 0.64, cy)]
        star = []
        for i in range(8):
            a = -math.pi / 2 + i * math.pi / 4
            rr = R * 0.46 if i % 2 == 0 else R * 0.18
            star.append((cx + math.cos(a) * rr, cy + math.sin(a) * rr))
        defs = (
            f'<linearGradient id="{gid}m" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c9a5e6"/><stop offset="0.5" stop-color="#764b9e"/><stop offset="1" stop-color="#351e4d"/></linearGradient>'
            f'<radialGradient id="{gid}c" cx="0.4" cy="0.35" r="0.7"><stop offset="0" stop-color="#fff4d6"/><stop offset="0.5" stop-color="#e3a8ff"/><stop offset="1" stop-color="#7d4aa8"/></radialGradient>'
        )
        s = (
            f'<path d="{path(outer)}" fill="#2a2233" stroke="{INK}" stroke-width="3" stroke-linejoin="round"/>'
            f'<path d="{path(inner)}" fill="url(#{gid}m)" stroke="{INK}" stroke-width="2" stroke-linejoin="round"/>'
            f'<path d="{path(star)}" fill="url(#{gid}c)" stroke="{INK}" stroke-width="1.6" stroke-linejoin="round"/>'
            f'<circle cx="{f(cx - R * 0.12)}" cy="{f(cy - R * 0.14)}" r="{f(R * 0.08)}" fill="#fff" fill-opacity="0.9"/>'
        )
        return defs, s
    # treasure：六边形锻铜暖金宝物徽记
    hx = [(cx + math.cos(math.radians(-30 + 60 * i)) * R * 1.04, cy + math.sin(math.radians(-30 + 60 * i)) * R * 1.04) for i in range(6)]
    hx2 = [(cx + math.cos(math.radians(-30 + 60 * i)) * R * 0.72, cy + math.sin(math.radians(-30 + 60 * i)) * R * 0.72) for i in range(6)]
    defs = (
        f'<linearGradient id="{gid}b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{BRONZE[0]}"/><stop offset="0.5" stop-color="{BRONZE[1]}"/><stop offset="1" stop-color="{BRONZE[2]}"/></linearGradient>'
        f'<radialGradient id="{gid}g" cx="0.38" cy="0.32" r="0.72"><stop offset="0" stop-color="#fff8d6"/><stop offset="0.45" stop-color="#f7c978"/><stop offset="1" stop-color="#a86d1f"/></radialGradient>'
    )
    s = (
        f'<path d="{path(hx)}" fill="url(#{gid}b)" stroke="{INK}" stroke-width="3" stroke-linejoin="round"/>'
        f'<path d="{path(hx2)}" fill="#3b2912" stroke="{INK}" stroke-width="1.8" stroke-linejoin="round"/>'
        f'<polygon points="{f(cx)},{f(cy - R * 0.44)} {f(cx + R * 0.36)},{f(cy)} {f(cx)},{f(cy + R * 0.44)} {f(cx - R * 0.36)},{f(cy)}" fill="url(#{gid}g)" stroke="{INK}" stroke-width="1.8" stroke-linejoin="round"/>'
        f'<circle cx="{f(cx - R * 0.1)}" cy="{f(cy - R * 0.15)}" r="{f(R * 0.09)}" fill="#fff" fill-opacity="0.88"/>'
    )
    return defs, s


# ---------- 1. 色光牌（修复 3.4：拉长拱窗、铁牌下移压住窗下沿、底部加铁包角不空） ----------
FLOAT_KEYS = set(GEMSET)  # 7 张都悬空（2026-11-20 用户定）


def color_card(key, seed):
    rnd = random.Random(seed)
    win = arch_pts(54, 52, 346, 466)
    wd = path(wobble(win, rnd, 0.5))
    window_bg(GLOW[key], rnd, wd, cy=275)  # 保持牌身随机序列与 27 包完全一致
    win_rnd = random.Random(seed + 9000)
    lay = {
        1: [(200, 266, 68)],
        2: [(138, 266, 52), (262, 266, 52)],
        3: [(200, 198, 45), (132, 316, 45), (268, 316, 45)],
    }[len(GEMSET[key])]
    floating = key in FLOAT_KEYS
    if floating:  # 悬空试改（Claude）：不要底座，宝石浮在窗中间，下面一团很淡的本色光
        lay = {1: [(200, 250, 74)], 2: [(140, 238, 58), (262, 266, 58)], 3: [(200, 190, 50), (130, 300, 50), (270, 300, 50)]}[len(GEMSET[key])]
    d1, bg_s = _color_window_lights(key, lay, win_rnd, wd)
    if floating:
        dpd = (f'<radialGradient id="flt" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="{GLOW[key]}" stop-opacity="0.28"/>'
               f'<stop offset="1" stop-color="{GLOW[key]}" stop-opacity="0"/></radialGradient>')
        ped_s = '<ellipse cx="200" cy="392" rx="120" ry="22" fill="url(#flt)"/>'
        ped_s += ''.join(f'<circle cx="{f(win_rnd.uniform(90, 310))}" cy="{f(win_rnd.uniform(300, 420))}" r="{f(win_rnd.uniform(0.8, 1.8))}" fill="{GLOW[key]}" fill-opacity="{win_rnd.uniform(0.3, 0.7):.2f}"/>' for _ in range(14))
    else:
        dpd, ped_s = _color_pedestal(lay, win_rnd, 'ped')
    gs, gd = '', ''
    # 宝石自身光晕按单/多颗微调，避免多颗本色光晕直接叠脏，混色由 _color_window_lights 负责
    g_scale = 2.0 if len(lay) == 1 else 1.45
    for i, (k, (gx, gy, R)) in enumerate(zip(GEMSET[key], lay)):
        a, b = gem(k, gx, gy, R, f'gm{i}', glow_scale=g_scale)
        gd += a
        gs += b
    art = svg(d1 + dpd + gd, f'<g clip-path="url(#cw)">{bg_s}{ped_s}{gs}</g>')

    avoid = lambda x, y: (50 < x < 350 and 42 < y < 480) or (58 < x < 342 and 470 < y < 538) or (x < 92 and y < 132)
    dg, mr = metal_ring(wd, IRON, 15, 'ir')
    dp, pl = plate(474, 526, rnd=rnd)
    dn, pn = pennant(key, rnd)
    db, bd = stone_panel(10, 10, 390, 590, 20, rnd, STONE, wd, 9, 20, avoid)
    # 底部两个铁扣托住标题牌 + 底部小包角，让下缘紧凑有重量
    deco = (
        f'<path d="M110 532 L290 532 L276 544 L124 544 Z" fill="#323940" stroke="{INK}" stroke-width="2.5" stroke-linejoin="round"/>'
        f'<path d="M126 535 L274 535" stroke="#8e999f" stroke-opacity="0.45" stroke-width="1.2"/>'
        + ''.join(f'<circle cx="{cx}" cy="466" r="5" fill="#7d878d" stroke="{INK}" stroke-width="1.6"/>' for cx in (78, 322))
    )
    frame = svg(db + dg + dp + dn, bd + mr + deco + pl + pn)
    return art, frame


# ---------- 2. 异能牌（拱窗 + 窗下正中宝石托 + 标题铁牌 + 羊皮纸 + 右下法术徽记） ----------
def ability_card(colkey, gemkey, instant, seed, art_key='auto'):
    # card-web 接入：art_key=None 时为没有专门原画的占位窗（保留 27 包夜雾窗底），gemkey=None 时宝石托放无色铁菱
    rnd = random.Random(seed)
    win = arch_pts(58, 52, 342, 316)
    wd = path(wobble(win, rnd, 0.5))
    ph_defs, ph_body = window_bg(GLOW.get(colkey, COLD), rnd, wd, cy=196)  # 保持牌身随机序列与 27 包完全一致
    win_rnd = random.Random(seed + 9000)
    # 暗底夜雾 + 异能原画（增幅法阵 / 灵感涌现）内嵌 PNG
    glow_c = GLOW.get(colkey, COLD)
    if art_key == 'auto':
        art_key = '灵感涌现' if instant else '增幅法阵'
    d1 = (
        '<linearGradient id="afog" x1="0" y1="0" x2="0" y2="1">'
        '<stop offset="0" stop-color="#1b2932"/><stop offset="0.58" stop-color="#10181f"/><stop offset="1" stop-color="#080d11"/>'
        '</linearGradient>'
        f'<radialGradient id="awl" cx="0.5" cy="0.52" r="0.54">'
        f'<stop offset="0" stop-color="{glow_c}" stop-opacity="0.48"/>'
        f'<stop offset="0.6" stop-color="{glow_c}" stop-opacity="0.16"/>'
        f'<stop offset="1" stop-color="{glow_c}" stop-opacity="0"/>'
        f'</radialGradient>'
        f'<clipPath id="cw"><path d="{wd}"/></clipPath>'
    )
    motes = ''.join(
        f'<circle cx="{f(win_rnd.uniform(66, 334))}" cy="{f(win_rnd.uniform(68, 290))}" '
        f'r="{f(win_rnd.uniform(0.9, 2.1))}" fill="#ffffff" fill-opacity="{win_rnd.uniform(0.28, 0.75):.2f}"/>'
        for _ in range(20)
    )
    art_img = f'<image x="64" y="54" width="272" height="272" href="{ABILITY_URIS[art_key]}"/>' if art_key else ''
    art = svg(ph_defs, ph_body) if not art_key else svg(d1, f'<g clip-path="url(#cw)"><rect width="400" height="600" fill="url(#afog)"/><ellipse cx="200" cy="192" rx="152" ry="136" fill="url(#awl)"/>{art_img}{motes}</g>')

    ring_col = BRONZE if instant else IRON
    dg, mr = metal_ring(wd, ring_col, 15, 'ir')

    # 宝石托：压在窗框底边正中 (200, 316)，参考官网 Turkey Leg
    hx, hy = 200, 316
    holder_pts = wobble(rrect_pts(hx - 28, hy - 26, hx + 28, hy + 26, 16), rnd, 0.5)
    hd = path(holder_pts)
    hi, mid, lo = ring_col
    dhol = f'<linearGradient id="hl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{hi}"/><stop offset="0.5" stop-color="{mid}"/><stop offset="1" stop-color="{lo}"/></linearGradient>'
    if gemkey:
        dgm, g_svg = gem(gemkey, hx, hy, 17, 'hgm', glow_scale=1.9)
    else:
        dgm = f'<radialGradient id="hgm" cx="0.38" cy="0.32" r="0.72"><stop offset="0" stop-color="{COLD}"/><stop offset="0.5" stop-color="#6e7c85"/><stop offset="1" stop-color="#22292f"/></radialGradient>'
        g_svg = (f'<polygon points="{hx},{hy - 13} {hx + 11},{hy} {hx},{hy + 13} {hx - 11},{hy}" fill="url(#hgm)" stroke="{INK}" stroke-width="2.2" stroke-linejoin="round"/>'
                 f'<circle cx="{hx - 3}" cy="{hy - 4}" r="2.2" fill="#fff" fill-opacity="0.75"/>')
    holder = (
        f'<path d="{hd}" fill="url(#hl)" stroke="{INK}" stroke-width="3.2" stroke-linejoin="round"/>'
        f'<circle cx="{hx}" cy="{hy}" r="20" fill="#181e24" stroke="{INK}" stroke-width="2"/>'
        + g_svg
    )

    dp, pl = plate(354, 404, rnd=rnd)
    dpar, par = parchment_box(76, 414, 324, 534, rnd)
    dbg, bdg = badge_parts('spell', 350, 550, 22, 'sp')
    dn, pn = pennant(colkey, rnd)
    avoid = lambda x, y: (52 < x < 348 and 44 < y < 342) or (60 < x < 340 and 350 < y < 544) or (x < 92 and y < 132) or (x > 316 and y > 516)
    db, bd = stone_panel(10, 10, 390, 590, 20, rnd, STONE, wd, 9, 18, avoid)
    frame = svg(db + dg + dhol + dgm + dp + dpar + dbg + dn, bd + mr + holder + pl + par + bdg + pn)
    return art, frame


# ---------- 3. 封印牌（深色石、圆窗、刻符铁环+四扣、羊皮纸、封印徽记） ----------
def seal_card(seed):
    rnd = random.Random(seed)
    cx, cy, R = 200, 206, 130
    wd = path(circle_pts(cx, cy, R, 64))
    d1, w = window_bg(COLD, rnd, wd, cy=206)
    art = svg(d1, w)
    dg, mr = metal_ring(wd, IRON, 18, 'ir')
    runes = []
    for i in range(16):
        a = i / 16 * math.tau
        x, y = cx + math.cos(a) * (R + 1), cy + math.sin(a) * (R + 1)
        t = math.degrees(a) + 90
        g = ['M0 -4 L0 4 M-3 -1 L3 -1', 'M-3 4 L0 -4 L3 4', 'M-3 -4 L3 0 L-3 4'][rnd.randrange(3)]
        runes.append(f'<path d="{g}" transform="translate({f(x)} {f(y)}) rotate({f(t)})"/>')
    rune = f'<g fill="none" stroke="{COLD}" stroke-opacity="0.85" stroke-width="1.6" stroke-linecap="round">{"".join(runes)}</g>'
    clasps = ''
    for i in range(4):
        a = math.pi / 4 + i * math.pi / 2
        x, y = cx + math.cos(a) * (R + 4), cy + math.sin(a) * (R + 4)
        clasps += (
            f'<g transform="translate({f(x)} {f(y)}) rotate({f(math.degrees(a))})">'
            f'<rect x="-9" y="-7" width="22" height="14" rx="3" fill="#59636a" stroke="{INK}" stroke-width="2.2"/>'
            f'<rect x="-6" y="-5" width="16" height="2" fill="#b3bec4" fill-opacity="0.5"/></g>'
        )
    dp, pl = plate(360, 408, rnd=rnd)
    dpar, par = parchment_box(80, 418, 320, 530, rnd)
    dbg, bdg = badge_parts('seal', 350, 550, 22, 'sl')
    dn, pn = pennant('none', rnd)
    avoid = lambda x, y: math.hypot(x - cx, y - cy) < R + 22 or (60 < x < 340 and 350 < y < 540) or (x < 92 and y < 132) or (x > 322 and y > 522)
    db, bd = stone_panel(10, 10, 390, 590, 20, rnd, BASALT, wd, 10, 18, avoid)
    frame = svg(db + dg + dp + dn + dpar + dbg, bd + mr + rune + clasps + pl + par + bdg + pn)
    return art, frame


# ---------- 4. 牌背（深色石 + 正中 A 符环与暖金光核） ----------
def card_back(seed):
    rnd = random.Random(seed)
    cx, cy = 200, 300
    avoid = lambda x, y: math.hypot(x - cx, y - cy) < 126
    db, bd = stone_panel(10, 10, 390, 590, 20, rnd, BASALT, '', 10, 22, avoid)
    dcb, cb = corner_brackets(24, 24, 376, 576, 32, 7, IRON, 'bkcb')
    # 外刻符环
    r_out = path(circle_pts(cx, cy, 104, 60))
    dm, mr = metal_ring(r_out, IRON, 10, 'bkr')
    # 细符环与八向刻线
    ticks = []
    for i in range(24):
        a = i / 24 * math.tau
        r1 = 92 if i % 3 == 0 else 96
        ticks.append(f'M{f(cx + math.cos(a) * r1)} {f(cy + math.sin(a) * r1)} L{f(cx + math.cos(a) * 101)} {f(cy + math.sin(a) * 101)}')
    arcs = []
    for i in range(6):
        a0 = math.radians(i * 60 + 10)
        a1 = math.radians(i * 60 + 50)
        x0, y0 = cx + math.cos(a0) * 76, cy + math.sin(a0) * 76
        x1, y1 = cx + math.cos(a1) * 76, cy + math.sin(a1) * 76
        arcs.append(f'M{f(x0)} {f(y0)} A76 76 0 0 1 {f(x1)} {f(y1)}')
    # 内六角刻纹
    hex_pts = [(cx + math.cos(math.radians(-90 + 60 * i)) * 62, cy + math.sin(math.radians(-90 + 60 * i)) * 62) for i in range(6)]
    d_core = (
        f'<radialGradient id="cg" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#fffbe6" stop-opacity="0.95"/><stop offset="0.35" stop-color="{WARM}" stop-opacity="0.65"/><stop offset="0.7" stop-color="{WARM}" stop-opacity="0.18"/><stop offset="1" stop-color="{WARM}" stop-opacity="0"/></radialGradient>'
        f'<radialGradient id="cn" cx="0.4" cy="0.35" r="0.7"><stop offset="0" stop-color="#fffbe6"/><stop offset="0.55" stop-color="{WARM}"/><stop offset="1" stop-color="#9a6b2c"/></radialGradient>'
    )
    seal = (
        f'<circle cx="{cx}" cy="{cy}" r="98" fill="#181e23" fill-opacity="0.75"/>'
        + mr
        + f'<path d="{" ".join(ticks)}" stroke="{COLD}" stroke-opacity="0.55" stroke-width="1.6" stroke-linecap="round"/>'
        f'<path d="{" ".join(arcs)}" fill="none" stroke="{COLD}" stroke-opacity="0.45" stroke-width="2" stroke-linecap="round"/>'
        f'<path d="{path(hex_pts)}" fill="none" stroke="#7d878d" stroke-opacity="0.55" stroke-width="1.8" stroke-linejoin="round"/>'
        f'<circle cx="{cx}" cy="{cy}" r="48" fill="none" stroke="{WARM}" stroke-opacity="0.5" stroke-width="1.6"/>'
        f'<circle cx="{cx}" cy="{cy}" r="66" fill="url(#cg)"/>'
        f'<circle cx="{cx}" cy="{cy}" r="18" fill="url(#cn)" stroke="{INK}" stroke-width="2.5"/>'
        f'<ellipse cx="{cx - 5}" cy="{cy - 6}" rx="5" ry="3" transform="rotate(-25 {cx - 5} {cy - 6})" fill="#fff" fill-opacity="0.85"/>'
    )
    return svg(db + dcb + dm + d_core, bd + cb + seal)


# ---------- 5. 牌状态层（440 × 640，牌对齐在 20..420, 20..620；无 filter） ----------
def state_layers():
    out = {}
    rnd = random.Random(301)
    card_d = path(rrect_pts(30, 30, 410, 610, 20))
    # 1) 悬停光边
    hover_s = (
        f'<path d="{card_d}" fill="none" stroke="{COLD}" stroke-opacity="0.22" stroke-width="16" stroke-linejoin="round"/>'
        f'<path d="{card_d}" fill="none" stroke="{COLD}" stroke-opacity="0.48" stroke-width="8" stroke-linejoin="round"/>'
        f'<path d="{card_d}" fill="none" stroke="#eef8fc" stroke-opacity="0.92" stroke-width="3" stroke-linejoin="round"/>'
    )
    out['状态-悬停光边.svg'] = svg('', hover_s, 440, 640)

    # 2) 可换色光边（同色 / 邻色，运行时将 #ff00ff 替换为具体牌色）
    col_s = ''.join(
        f'<path d="{card_d}" fill="none" stroke="{GLOW_KEY}" stroke-opacity="{op}" stroke-width="{w}" stroke-linejoin="round"/>'
        for w, op in ((28, 0.14), (20, 0.24), (13, 0.42), (7, 0.72), (3.2, 0.96))
    )
    out['状态-色光边.svg'] = svg('', col_s, 440, 640)

    # 3) 邻色小箭头徽标（叠在色光边上，右上角 ↗）
    arr_d = 'M368 48 L398 48 L398 78 M396 50 L368 78'
    arr_s = (
        f'<circle cx="383" cy="63" r="24" fill="#232a30" stroke="{INK}" stroke-width="3.2"/>'
        f'<circle cx="383" cy="63" r="20" fill="none" stroke="{GLOW_KEY}" stroke-opacity="0.7" stroke-width="2.4"/>'
        f'<path d="{arr_d}" fill="none" stroke="{INK}" stroke-width="7.5" stroke-linecap="round" stroke-linejoin="round"/>'
        f'<path d="{arr_d}" fill="none" stroke="#fff6e0" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/>'
    )
    out['状态-邻色箭头.svg'] = svg('', arr_s, 440, 640)

    # 4) 补色白光（最亮，同时保证白牌在夜林中一眼可见）
    comp_s = ''.join(
        f'<path d="{card_d}" fill="none" stroke="{c}" stroke-opacity="{op}" stroke-width="{w}" stroke-linejoin="round"/>'
        for c, w, op in (('#cfe0e8', 36, 0.18), ('#e8f6ff', 26, 0.30), ('#ffffff', 17, 0.52), ('#ffffff', 10, 0.80), ('#ffffff', 4.5, 1.0))
    )
    out['状态-补色白光.svg'] = svg('', comp_s, 440, 640)

    # 5) 断色压暗
    dim_s = f'<path d="{card_d}" fill="#05080b" fill-opacity="0.62"/>'
    out['状态-断色压暗.svg'] = svg('', dim_s, 440, 640)

    # 6) 出彩虹（红黄绿青蓝紫六色叠加描边，无 filter）
    d_rb = (
        '<linearGradient id="rb1" x1="0" y1="0" x2="1" y2="1">'
        + ''.join(f'<stop offset="{i / 5:.2f}" stop-color="{c}"/>' for i, c in enumerate(RAINBOW))
        + '</linearGradient>'
        '<linearGradient id="rb2" x1="1" y1="0" x2="0" y2="1">'
        + ''.join(f'<stop offset="{i / 5:.2f}" stop-color="{c}"/>' for i, c in enumerate(reversed(RAINBOW)))
        + '</linearGradient>'
    )
    rb_s = (
        f'<path d="{card_d}" fill="none" stroke="url(#rb1)" stroke-opacity="0.22" stroke-width="34" stroke-linejoin="round"/>'
        f'<path d="{card_d}" fill="none" stroke="url(#rb2)" stroke-opacity="0.38" stroke-width="22" stroke-linejoin="round"/>'
        f'<path d="{card_d}" fill="none" stroke="url(#rb1)" stroke-opacity="0.72" stroke-width="12" stroke-linejoin="round"/>'
        f'<path d="{card_d}" fill="none" stroke="url(#rb1)" stroke-opacity="1" stroke-width="5" stroke-linejoin="round"/>'
        f'<path d="{card_d}" fill="none" stroke="#ffffff" stroke-opacity="0.65" stroke-width="1.8" stroke-linejoin="round"/>'
    )
    out['状态-彩虹光边.svg'] = svg(d_rb, rb_s, 440, 640)

    # 7) 正在结算（整张发亮：暖金白外光 + 牌面柔光罩）
    d_set = f'<radialGradient id="sg" cx="0.5" cy="0.45" r="0.6"><stop offset="0" stop-color="#fffbe6" stop-opacity="0.42"/><stop offset="0.65" stop-color="{WARM}" stop-opacity="0.18"/><stop offset="1" stop-color="{WARM}" stop-opacity="0"/></radialGradient>'
    set_s = ''.join(
        f'<path d="{card_d}" fill="none" stroke="{c}" stroke-opacity="{op}" stroke-width="{w}" stroke-linejoin="round"/>'
        for c, w, op in ((WARM, 34, 0.22), (WARM, 22, 0.42), ('#fff2c2', 12, 0.78), ('#ffffff', 4.5, 1.0))
    ) + f'<path d="{card_d}" fill="url(#sg)"/>'
    out['状态-结算发亮.svg'] = svg(d_set, set_s, 440, 640)

    # 8) 提示字底（小石铁片，220 × 44）
    dp, pl = plate(5, 39, 8, 212, rnd=rnd, gid='htp', bevel=11, sw=2.6, rivets=False)
    out['状态-提示字底.svg'] = svg(dp, pl, 220, 44)
    return out


# ---------- 6. 五态按钮通用生成器 ----------
BTN_STATES = {
    '平时': (STONE, IRON, 1.0, 0.0, False),
    '悬停': (('#7a8790', '#636f78', '#475159'), ('#c3cfd6', '#727e86', '#384046'), 1.0, 0.0, 'hover'),
    '按下': (('#4b545b', '#3d454b', '#2c3238'), ('#768087', '#454d53', '#20252a'), 1.0, 2.0, 'press'),
    '选中': (('#6d7a84', '#55626c', '#3c464f'), BRONZE, 1.0, 0.0, 'select'),
    '禁用': (('#464c50', '#383d41', '#282c30'), ('#666d72', '#42474b', '#222629'), 0.62, 0.0, 'disabled'),
}


def rect_button(w, h, state_name, seed):
    rnd = random.Random(seed)
    tone, rim, op, dy, mode = BTN_STATES[state_name]
    b = min(14, h * 0.34)
    pts = [(6, h / 2 + dy), (6 + b, 5 + dy), (w - 6 - b, 5 + dy), (w - 6, h / 2 + dy), (w - 6 - b, h - 5 + dy), (6 + b, h - 5 + dy)]
    d = path(wobble(pts, rnd, 0.5))
    hi, mid, lo = tone
    rhi, rmid, rlo = rim
    defs = (
        f'<linearGradient id="bt" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{hi}"/><stop offset="0.5" stop-color="{mid}"/><stop offset="1" stop-color="{lo}"/></linearGradient>'
        f'<linearGradient id="br" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{rhi}"/><stop offset="0.5" stop-color="{rmid}"/><stop offset="1" stop-color="{rlo}"/></linearGradient>'
    )
    extra = ''
    if mode == 'hover':
        extra = f'<path d="{d}" fill="none" stroke="{COLD}" stroke-opacity="0.45" stroke-width="5.5" stroke-linejoin="round"/>'
    elif mode == 'select':
        extra = f'<path d="{d}" fill="none" stroke="{WARM}" stroke-opacity="0.55" stroke-width="5.5" stroke-linejoin="round"/>'
    s = (
        f'<g opacity="{op}">'
        + extra
        + f'<path d="{d}" fill="url(#bt)" stroke="{INK}" stroke-width="4.5" stroke-linejoin="round"/>'
        f'<path d="{d}" fill="none" stroke="url(#br)" stroke-width="2.4" stroke-linejoin="round"/>'
        f'<path d="M{f(9 + b)} {f(8.5 + dy)} L{f(w - 9 - b)} {f(8.5 + dy)}" stroke="{COLD if mode != "select" else WARM}" stroke-opacity="0.55" stroke-width="1.3"/>'
        + ''.join(f'<circle cx="{f(cx)}" cy="{f(h / 2 + dy)}" r="2.6" fill="{rhi}" stroke="{INK}" stroke-width="1.1"/>' for cx in (12 + b * 0.5, w - 12 - b * 0.5))
        + '</g>'
    )
    return svg(defs, s, w, h)


def round_button(size, state_name, seed, icon=None):
    rnd = random.Random(seed)
    tone, rim, op, dy, mode = BTN_STATES[state_name]
    cx, cy, R = size / 2, size / 2 + dy, size / 2 - 4
    d = path(wobble(circle_pts(cx, cy, R, 28), rnd, 0.4))
    hi, mid, lo = tone
    rhi, rmid, rlo = rim
    defs = (
        f'<linearGradient id="rb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{hi}"/><stop offset="0.55" stop-color="{mid}"/><stop offset="1" stop-color="{lo}"/></linearGradient>'
        f'<linearGradient id="rr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{rhi}"/><stop offset="0.5" stop-color="{rmid}"/><stop offset="1" stop-color="{rlo}"/></linearGradient>'
    )
    extra = ''
    if mode == 'hover':
        extra = f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(R + 1.5)}" fill="none" stroke="{COLD}" stroke-opacity="0.45" stroke-width="4.5"/>'
    elif mode == 'select':
        extra = f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(R + 1.5)}" fill="none" stroke="{WARM}" stroke-opacity="0.55" stroke-width="4.5"/>'
    ic = ''
    if icon == 'close':
        c = '#e6ded0' if mode != 'disabled' else '#7d858a'
        ic = (
            f'<path d="M{f(cx - 7)} {f(cy - 7)} L{f(cx + 7)} {f(cy + 7)} M{f(cx + 7)} {f(cy - 7)} L{f(cx - 7)} {f(cy + 7)}" stroke="{INK}" stroke-width="5.2" stroke-linecap="round"/>'
            f'<path d="M{f(cx - 7)} {f(cy - 7)} L{f(cx + 7)} {f(cy + 7)} M{f(cx + 7)} {f(cy - 7)} L{f(cx - 7)} {f(cy + 7)}" stroke="{c}" stroke-width="2.6" stroke-linecap="round"/>'
        )
    s = (
        f'<g opacity="{op}">{extra}'
        f'<path d="{d}" fill="url(#rb)" stroke="{INK}" stroke-width="4" stroke-linejoin="round"/>'
        f'<path d="{d}" fill="none" stroke="url(#rr)" stroke-width="2.2" stroke-linejoin="round"/>'
        f'<path d="M{f(cx - R * 0.55)} {f(cy - R * 0.6)} A{f(R * 0.8)} {f(R * 0.8)} 0 0 1 {f(cx + R * 0.55)} {f(cy - R * 0.6)}" fill="none" stroke="{COLD}" stroke-opacity="0.55" stroke-width="1.4" stroke-linecap="round"/>'
        f'{ic}</g>'
    )
    return svg(defs, s, size, size)


def cast_button(state_name, seed):
    """施法大圆石按钮（126 × 126）：外铁环 + 四扣 + 正中暖金光石"""
    rnd = random.Random(seed)
    tone, rim, op, dy, mode = BTN_STATES[state_name]
    cx, cy, R = 63, 63 + dy, 54
    od = path(wobble(circle_pts(cx, cy, R, 40), rnd, 0.7))
    id_ = path(circle_pts(cx, cy, 43, 36))
    hi, mid, lo = tone
    dg, mr = metal_ring(od, BRONZE if mode in ('hover', 'select') else rim, 8, 'cr')
    defs = (
        f'<linearGradient id="cs" x1="0" y1="0" x2="0.3" y2="1"><stop offset="0" stop-color="{hi}"/><stop offset="0.55" stop-color="{mid}"/><stop offset="1" stop-color="{lo}"/></linearGradient>'
        f'<clipPath id="cc"><path d="{od}"/></clipPath>'
        + dg
    )
    if mode == 'disabled':
        core_def = '<radialGradient id="cg" cx="0.4" cy="0.35" r="0.7"><stop offset="0" stop-color="#6b7378"/><stop offset="0.55" stop-color="#454c52"/><stop offset="1" stop-color="#22272b"/></radialGradient>'
        glow_el = ''
    else:
        core_def = f'<radialGradient id="cg" cx="0.38" cy="0.32" r="0.72"><stop offset="0" stop-color="#fffbe6"/><stop offset="0.4" stop-color="{WARM}"/><stop offset="0.8" stop-color="#c47e28"/><stop offset="1" stop-color="#633a0d"/></radialGradient>'
        core_def += f'<radialGradient id="cgh" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="{WARM}" stop-opacity="{0.65 if mode == "hover" else 0.42}"/><stop offset="1" stop-color="{WARM}" stop-opacity="0"/></radialGradient>'
        glow_el = f'<circle cx="{cx}" cy="{f(cy)}" r="46" fill="url(#cgh)"/>'
    clasps = ''
    for a in (0, 90, 180, 270):
        rad = math.radians(a)
        x, y = cx + math.cos(rad) * (R + 1), cy + math.sin(rad) * (R + 1)
        clasps += f'<rect x="-6" y="-5" width="12" height="10" rx="2.5" fill="#636e75" stroke="{INK}" stroke-width="2" transform="translate({f(x)} {f(y)}) rotate({a})"/>'
    cr = cracks(rnd, (14, 14, 112, 112), 5, lambda x, y: math.hypot(x - cx, y - cy) < 36)
    outer_glow = f'<circle cx="{cx}" cy="{f(cy)}" r="59" fill="none" stroke="{WARM}" stroke-opacity="0.42" stroke-width="5"/>' if mode in ('hover', 'select') else ''
    s = (
        f'<g opacity="{op}">{outer_glow}'
        f'<path d="{od}" fill="url(#cs)"/>'
        f'<g clip-path="url(#cc)">{cr}</g>'
        f'<path d="{id_}" fill="#1a2026" stroke="{INK}" stroke-width="2.8"/>'
        f'{glow_el}'
        f'<circle cx="{cx}" cy="{f(cy)}" r="34" fill="url(#cg)" stroke="{INK}" stroke-width="3"/>'
        f'<ellipse cx="{cx - 10}" cy="{f(cy - 12)}" rx="10" ry="5.5" transform="rotate(-28 {cx - 10} {f(cy - 12)})" fill="#fff" fill-opacity="{0.25 if mode == "disabled" else 0.72}"/>'
        f'{mr}{clasps}</g>'
    )
    return svg(defs + core_def, s, 126, 126)


# ---------- 7. 战斗界面零件（按 1440 × 810 尺寸） ----------
def hud_assets():
    out = {}
    rnd = random.Random(401)

    # 血条槽 (180 × 14)：透明内槽 + 细铁框 + 玻璃亮线（审核修复：不再用实心底盖住血量）
    hp_s = (
        f'<rect x="3" y="2.5" width="174" height="9" rx="4.5" fill="none" stroke="{INK}" stroke-width="3"/>'
        f'<rect x="3" y="2.5" width="174" height="9" rx="4.5" fill="none" stroke="#7d878d" stroke-width="1.5"/>'
        f'<line x1="8" y1="4.5" x2="172" y2="4.5" stroke="{COLD}" stroke-opacity="0.45" stroke-width="1.2" stroke-linecap="round"/>'
    )
    out['界面-血条槽.svg'] = svg('', hp_s, 180, 14)

    # 倒计时 (36 × 36)：常规铁盘 & 紧急红光盘
    for urgent, name in ((False, '界面-倒计时.svg'), (True, '界面-倒计时-紧急.svg')):
        d = path(wobble(circle_pts(18, 18, 14, 20), random.Random(402 if not urgent else 403), 0.35))
        fill = '#5e1a1a' if urgent else '#283037'
        rim = '#ff6454' if urgent else '#8c969c'
        glow = '<circle cx="18" cy="18" r="16.5" fill="none" stroke="#ff4a3a" stroke-opacity="0.45" stroke-width="3"/>' if urgent else ''
        s = (
            f'{glow}<path d="{d}" fill="{fill}" stroke="{INK}" stroke-width="3.2"/>'
            f'<path d="{d}" fill="none" stroke="{rim}" stroke-width="1.6"/>'
            f'<path d="M10 9 A11 11 0 0 1 26 9" fill="none" stroke="{COLD}" stroke-opacity="0.5" stroke-width="1.2"/>'
        )
        out[name] = svg('', s, 36, 36)

    # 状态小图标 (24 × 24)：躲光（半遮月牙）、厚皮（叠甲石片）
    s_dodge = (
        f'<circle cx="12" cy="12" r="10" fill="#222c33" stroke="{INK}" stroke-width="2.2"/>'
        f'<path d="M14 5 A7 7 0 1 0 18 17 A5.4 5.4 0 1 1 14 5 Z" fill="{COLD}" stroke="{INK}" stroke-width="1.2"/>'
    )
    s_thick = (
        f'<circle cx="12" cy="12" r="10" fill="#262c32" stroke="{INK}" stroke-width="2.2"/>'
        f'<path d="M6 7 L12 5 L18 7 L17 14 L12 19 L7 14 Z" fill="#8b969e" stroke="{INK}" stroke-width="1.6" stroke-linejoin="round"/>'
        f'<path d="M9 10 L15 10 M9.5 13.5 L14.5 13.5" stroke="{INK}" stroke-width="1.4" stroke-linecap="round"/>'
    )
    out['界面-状态标-躲光.svg'] = svg('', s_dodge, 24, 24)
    out['界面-状态标-厚皮.svg'] = svg('', s_thick, 24, 24)

    # 怪的详情框 (230 × 116)：羊皮纸
    dpar, par = parchment_box(6, 6, 224, 110, random.Random(404), 'mp', 2.8)
    pins = ''.join(f'<circle cx="{x}" cy="{y}" r="2.8" fill="#7d878d" stroke="{INK}" stroke-width="1.2"/>' for x, y in ((14, 14), (216, 14), (14, 102), (216, 102)))
    out['界面-怪详情框.svg'] = svg(dpar, par + pins, 230, 116)

    # 心：满 / 半 / 空 (38 × 38)
    heart_d = 'M19 32 C19 32 5 23 5 13.5 C5 8.5 9 5.5 13.5 5.5 C16.3 5.5 18 7.2 19 9.2 C20 7.2 21.7 5.5 24.5 5.5 C29 5.5 33 8.5 33 13.5 C33 23 19 32 19 32 Z'
    dh = (
        '<radialGradient id="hf" cx="0.35" cy="0.3" r="0.75"><stop offset="0" stop-color="#ff7a70"/><stop offset="0.45" stop-color="#cf282e"/><stop offset="1" stop-color="#610c14"/></radialGradient>'
        '<clipPath id="hlf"><rect x="0" y="0" width="19" height="38"/></clipPath>'
    )
    for st, fname in (('full', '界面-心-满.svg'), ('half', '界面-心-半.svg'), ('empty', '界面-心-空.svg')):
        fill_el = ''
        if st == 'full':
            fill_el = f'<path d="{heart_d}" fill="url(#hf)"/>'
        elif st == 'half':
            fill_el = f'<path d="{heart_d}" fill="url(#hf)" clip-path="url(#hlf)"/>'
        hi = f'<ellipse cx="12.5" cy="11.5" rx="3.2" ry="1.8" transform="rotate(-25 12.5 11.5)" fill="#fff" fill-opacity="0.7"/>' if st != 'empty' else ''
        s = (
            f'<path d="{heart_d}" fill="#1b2126" stroke="{INK}" stroke-width="4.2" stroke-linejoin="round"/>'
            f'{fill_el}{hi}'
            f'<path d="{heart_d}" fill="none" stroke="#99a4ab" stroke-width="1.8" stroke-linejoin="round"/>'
        )
        out[fname] = svg(dh, s, 38, 38)

    # 护盾：亮 / 暗 (36 × 40)
    sh_d = 'M18 4 L31 9 L29 23 C28 30 18 36 18 36 C18 36 8 30 7 23 L5 9 Z'
    for lit, fname in ((True, '界面-护盾-亮.svg'), (False, '界面-护盾-暗.svg')):
        ds = (
            '<linearGradient id="sh" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9ccaff"/><stop offset="0.5" stop-color="#3f73c7"/><stop offset="1" stop-color="#1a3466"/></linearGradient>'
            if lit else
            '<linearGradient id="sh" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4e575e"/><stop offset="1" stop-color="#252b30"/></linearGradient>'
        )
        glow = f'<path d="{sh_d}" fill="none" stroke="{COLD}" stroke-opacity="0.45" stroke-width="6" stroke-linejoin="round"/>' if lit else ''
        s = (
            f'{glow}<path d="{sh_d}" fill="url(#sh)" stroke="{INK}" stroke-width="3.6" stroke-linejoin="round"/>'
            f'<path d="{sh_d}" fill="none" stroke="{COLD if lit else "#6c757c"}" stroke-width="1.6" stroke-linejoin="round"/>'
            f'<path d="M18 9 L18 31 M10 15 L26 15" stroke="{COLD if lit else "#485057"}" stroke-opacity="0.55" stroke-width="1.6" stroke-linecap="round"/>'
        )
        out[fname] = svg(ds, s, 36, 40)

    # 本回合总伤害牌 (360 × 56) & 回合牌 (108 × 38) & 计数牌 (52 × 30)
    dp1, pl1 = plate(5, 51, 8, 352, rnd=random.Random(405), gid='tot', bevel=18, sw=3.2)
    out['界面-总伤害牌.svg'] = svg(dp1, pl1, 360, 56)
    dp2, pl2 = plate(4, 34, 6, 102, rnd=random.Random(406), gid='trn', bevel=10, sw=2.6, rivets=False)
    out['界面-回合牌.svg'] = svg(dp2, pl2, 108, 38)
    dp3, pl3 = plate(3, 27, 4, 48, rnd=random.Random(407), gid='cnt', bevel=7, sw=2.4, rivets=False)
    out['界面-计数牌.svg'] = svg(dp3, pl3, 52, 30)

    # 小按钮五态 (88 × 38) & 圆按钮五态 (40 × 40) & 施法按钮五态 (126 × 126)
    for i, st in enumerate(BTN_STATES):
        out[f'界面-小按钮-{st}.svg'] = rect_button(88, 38, st, 410 + i)
        out[f'界面-圆按钮-{st}.svg'] = round_button(40, 40 if False else st, 420 + i)
        out[f'界面-施法按钮-{st}.svg'] = cast_button(st, 430 + i)

    # 撤销两个图标 (24 × 24)
    u1 = (
        f'<path d="M9 8 L4 12 L9 16 M5 12 L15 12 C18.5 12 20 14 20 16.5 C20 18.5 18 20 15.5 20 L11 20" fill="none" stroke="{INK}" stroke-width="4.4" stroke-linecap="round" stroke-linejoin="round"/>'
        f'<path d="M9 8 L4 12 L9 16 M5 12 L15 12 C18.5 12 20 14 20 16.5 C20 18.5 18 20 15.5 20 L11 20" fill="none" stroke="#e8dfd0" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/>'
    )
    u2 = (
        f'<path d="M8 7 L3.5 12 L8 17 M13.5 7 L9 12 L13.5 17 M10 12 L17.5 12 C19.5 12 21 13.8 21 16 C21 18.2 19.5 19.5 17 19.5 L14 19.5" fill="none" stroke="{INK}" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round"/>'
        f'<path d="M8 7 L3.5 12 L8 17 M13.5 7 L9 12 L13.5 17 M10 12 L17.5 12 C19.5 12 21 13.8 21 16 C21 18.2 19.5 19.5 17 19.5 L14 19.5" fill="none" stroke="#e8dfd0" stroke-width="2.0" stroke-linecap="round" stroke-linejoin="round"/>'
    )
    out['界面-图标-撤销一步.svg'] = svg('', u1, 24, 24)
    out['界面-图标-撤销全部.svg'] = svg('', u2, 24, 24)

    # 色环盘 (180 × 180) + 灯（亮/灭）+ 当前圈
    cx, cy, R = 90, 90, 76
    wd = path(wobble(circle_pts(cx, cy, R, 48), random.Random(440), 0.7))
    dm, mr = metal_ring(wd, IRON, 9, 'wr')
    sockets = ''
    for i in range(6):
        a = math.radians(-90 + 60 * i)
        sx, sy = cx + math.cos(a) * 60, cy + math.sin(a) * 60
        sockets += f'<circle cx="{f(sx)}" cy="{f(sy)}" r="13" fill="#171d22" stroke="{INK}" stroke-width="2.6"/><circle cx="{f(sx)}" cy="{f(sy)}" r="11" fill="none" stroke="#6f7a82" stroke-width="1.4"/>'
    dw = (
        f'<linearGradient id="wst" x1="0" y1="0" x2="0.3" y2="1"><stop offset="0" stop-color="{BASALT[0]}"/><stop offset="0.55" stop-color="{BASALT[1]}"/><stop offset="1" stop-color="{BASALT[2]}"/></linearGradient>'
        f'<clipPath id="wc"><path d="{wd}"/></clipPath>' + dm
    )
    w_cr = cracks(random.Random(441), (18, 18, 162, 162), 6, lambda x, y: math.hypot(x - cx, y - cy) < 34)
    w_s = (
        f'<path d="{wd}" fill="url(#wst)"/>'
        f'<g clip-path="url(#wc)">{w_cr}</g>'
        f'<circle cx="{cx}" cy="{cy}" r="60" fill="none" stroke="#7d878d" stroke-opacity="0.4" stroke-width="2"/>'
        f'<circle cx="{cx}" cy="{cy}" r="34" fill="#181f25" stroke="{INK}" stroke-width="3"/>'
        f'<circle cx="{cx}" cy="{cy}" r="31" fill="none" stroke="#6b767d" stroke-width="1.4"/>'
        f'{mr}{sockets}'
    )
    out['界面-色环盘.svg'] = svg(dw, w_s, 180, 180)

    # 色环灯：亮 (28 × 28，可换色 #ff00ff) & 灭 (28 × 28) & 当前亮圈 (38 × 38)
    dl = (
        f'<radialGradient id="lg" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="{GLOW_KEY}" stop-opacity="0.75"/><stop offset="1" stop-color="{GLOW_KEY}" stop-opacity="0"/></radialGradient>'
        f'<radialGradient id="lc" cx="0.35" cy="0.3" r="0.75"><stop offset="0" stop-color="#ffffff"/><stop offset="0.35" stop-color="{GLOW_KEY}"/><stop offset="1" stop-color="#1a1f24"/></radialGradient>'
    )
    out['界面-色环灯-亮.svg'] = svg(
        dl,
        f'<circle cx="14" cy="14" r="14" fill="url(#lg)"/>'
        f'<circle cx="14" cy="14" r="8.5" fill="url(#lc)" stroke="{INK}" stroke-width="2"/>'
        f'<ellipse cx="11.5" cy="11" rx="2.5" ry="1.4" transform="rotate(-30 11.5 11)" fill="#fff" fill-opacity="0.88"/>',
        28, 28,
    )
    out['界面-色环灯-灭.svg'] = svg(
        '',
        f'<circle cx="14" cy="14" r="8.5" fill="#232a30" stroke="{INK}" stroke-width="2"/>'
        f'<circle cx="14" cy="14" r="5" fill="#323b42" fill-opacity="0.6"/>',
        28, 28,
    )
    out['界面-色环当前圈.svg'] = svg(
        '',
        f'<circle cx="19" cy="19" r="15.5" fill="none" stroke="#ffffff" stroke-opacity="0.28" stroke-width="6"/>'
        f'<circle cx="19" cy="19" r="15.5" fill="none" stroke="#ffffff" stroke-opacity="0.95" stroke-width="2.4"/>',
        38, 38,
    )

    # 宝石经验托 (52 × 52)
    dgt = f'<linearGradient id="gt" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{IRON[0]}"/><stop offset="0.5" stop-color="{IRON[1]}"/><stop offset="1" stop-color="{IRON[2]}"/></linearGradient>'
    out['界面-宝石经验托.svg'] = svg(
        dgt,
        f'<circle cx="26" cy="26" r="22" fill="#181f24" stroke="{INK}" stroke-width="3.2"/>'
        f'<circle cx="26" cy="26" r="20" fill="none" stroke="url(#gt)" stroke-width="3.2"/>'
        f'<circle cx="26" cy="26" r="14" fill="#101519" stroke="{INK}" stroke-width="2"/>',
        52, 52,
    )

    # 序列槽 (630 × 124)：浅浅的暗石槽，不抢戏
    sq_d = path(wobble(rrect_pts(6, 6, 624, 118, 12), random.Random(450), 0.7))
    dsq = f'<linearGradient id="sq" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#171d22" stop-opacity="0.72"/><stop offset="1" stop-color="#222a30" stop-opacity="0.58"/></linearGradient>'
    dcb, cb = corner_brackets(8, 8, 622, 116, 16, 4.5, IRON, 'sqcb')
    out['界面-序列槽.svg'] = svg(
        dsq + dcb,
        f'<path d="{sq_d}" fill="url(#sq)" stroke="{INK}" stroke-width="2.6" stroke-linejoin="round"/>'
        f'<path d="{sq_d}" fill="none" stroke="{COLD}" stroke-opacity="0.22" stroke-width="1.2" stroke-linejoin="round"/>'
        + cb,
        630, 124,
    )

    # 牌堆叠 (74 × 94)：三张错位微叠的迷你深色石牌背
    stack = ''
    for dx, dy, rot in ((8, 0, -4), (4, 4, -1.5), (0, 8, 1)):
        stack += (
            f'<g transform="translate({dx} {dy}) rotate({rot} 35 45)">'
            f'<rect x="6" y="4" width="54" height="78" rx="6" fill="#2c3339" stroke="{INK}" stroke-width="3"/>'
            f'<rect x="11" y="9" width="44" height="68" rx="3" fill="none" stroke="#5b656d" stroke-width="1.2"/>'
            f'<circle cx="33" cy="43" r="11" fill="none" stroke="{COLD}" stroke-opacity="0.45" stroke-width="1.4"/>'
            f'<circle cx="33" cy="43" r="4" fill="{WARM}" stroke="{INK}" stroke-width="1.2"/>'
            f'</g>'
        )
    out['界面-牌堆叠.svg'] = svg('', stack, 74, 94)

    # 鼠标提示框 (248 × 106)：羊皮纸
    dtip, tip = parchment_box(6, 6, 242, 100, random.Random(460), 'tp', 2.8)
    out['界面-提示框.svg'] = svg(dtip, tip, 248, 106)
    return out


# ---------- 8. 四个弹窗零件 ----------
def modal_assets():
    out = {}
    # 1) 胜利挂旗 (340 × 84)
    rnd = random.Random(501)
    pts = [(28, 14), (312, 14), (304, 62), (170, 78), (36, 62)]
    d = path(wobble(pts, rnd, 0.8))
    db = (
        f'<linearGradient id="bn" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9c7a38"/><stop offset="0.5" stop-color="#6b5222"/><stop offset="1" stop-color="#3d2e12"/></linearGradient>'
        f'<linearGradient id="rd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{IRON[0]}"/><stop offset="0.5" stop-color="{IRON[1]}"/><stop offset="1" stop-color="{IRON[2]}"/></linearGradient>'
    )
    finials = (
        f'<polygon points="10,13 24,5 30,13 24,21" fill="url(#rd)" stroke="{INK}" stroke-width="2.5" stroke-linejoin="round"/>'
        f'<polygon points="330,13 316,5 310,13 316,21" fill="url(#rd)" stroke="{INK}" stroke-width="2.5" stroke-linejoin="round"/>'
    )
    out['弹窗-胜利挂旗.svg'] = svg(
        db,
        f'<path d="{d}" fill="url(#bn)" stroke="{INK}" stroke-width="3.6" stroke-linejoin="round"/>'
        f'<path d="M40 24 L300 24" stroke="{WARM}" stroke-opacity="0.45" stroke-width="1.6"/>'
        f'<path d="M44 56 L170 70 L296 56" fill="none" stroke="{WARM}" stroke-opacity="0.5" stroke-width="1.6"/>'
        f'<rect x="20" y="8" width="300" height="10" rx="5" fill="url(#rd)" stroke="{INK}" stroke-width="2.8"/>'
        + finials,
        340, 84,
    )

    # 2) 胜利石板面板 (560 × 360)（审核修复：压暗至 BASALT，与确认面板和牌身同一档）
    rnd = random.Random(502)
    dp, sp = stone_panel(10, 10, 550, 350, 18, rnd, BASALT, '', 10, 22, lambda x, y: 50 < x < 510 and 60 < y < 270, 4.2, 12, 'vp')
    dcb, cb = corner_brackets(14, 14, 546, 346, 28, 7, IRON, 'vpcb')
    out['弹窗-石板面板.svg'] = svg(dp + dcb, sp + cb, 560, 360)

    # 3) 奖励空槽 (124 × 156)
    rnd = random.Random(503)
    sl_d = path(wobble(rrect_pts(6, 6, 118, 150, 12), rnd, 0.6))
    sl_in = path(wobble(rrect_pts(14, 14, 110, 142, 8), rnd, 0.4))
    dsl = f'<linearGradient id="rs" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1d2328"/><stop offset="1" stop-color="#2c333a"/></linearGradient>'
    out['弹窗-奖励空槽.svg'] = svg(
        dsl,
        f'<path d="{sl_d}" fill="url(#rs)" stroke="{INK}" stroke-width="3.2" stroke-linejoin="round"/>'
        f'<path d="{sl_in}" fill="none" stroke="#6c767e" stroke-opacity="0.5" stroke-width="1.6" stroke-dasharray="6 5"/>'
        + ''.join(f'<circle cx="{x}" cy="{y}" r="2.6" fill="#7d878d" stroke="{INK}" stroke-width="1.2"/>' for x, y in ((14, 14), (110, 14), (14, 142), (110, 142))),
        124, 156,
    )

    # 4) 战败暗雾 (460 × 240)：夜雾与暗光，无血无骷髅
    rnd = random.Random(504)
    blobs = []
    for cx, cy, rx, ry, col, op in (
        (230, 116, 200, 88, '#0b0e13', 0.88),
        (170, 108, 130, 68, '#172329', 0.72),
        (292, 122, 136, 70, '#172329', 0.70),
        (230, 112, 148, 58, '#263840', 0.55),
        (230, 106, 98, 36, '#435e68', 0.35),
    ):
        pts = [(cx + math.cos(i / 28 * math.tau) * rx * rnd.uniform(0.86, 1.12), cy + math.sin(i / 28 * math.tau) * ry * rnd.uniform(0.84, 1.14)) for i in range(28)]
        blobs.append(f'<path d="{path(pts)}" fill="{col}" fill-opacity="{op}"/>')
    motes = ''.join(f'<circle cx="{f(rnd.uniform(55, 405))}" cy="{f(rnd.uniform(30, 200))}" r="{f(rnd.uniform(1.2, 2.8))}" fill="{COLD}" fill-opacity="{rnd.uniform(0.25, 0.65):.2f}"/>' for _ in range(22))
    rule = (
        f'<path d="M90 156 L370 156" stroke="{INK}" stroke-width="4" stroke-linecap="round"/>'
        f'<path d="M96 156 L364 156" stroke="{COLD}" stroke-opacity="0.55" stroke-width="1.6" stroke-linecap="round"/>'
        f'<polygon points="230,149 238,156 230,163 222,156" fill="#5d676e" stroke="{INK}" stroke-width="2"/>'
    )
    out['弹窗-战败暗雾.svg'] = svg('', ''.join(blobs) + motes + rule, 460, 240)

    # 5) 逃跑确认面板 (400 × 220)
    dp2, sp2 = stone_panel(10, 10, 390, 210, 16, random.Random(505), BASALT, '', 8, 16, lambda x, y: 46 < x < 354 and 46 < y < 174, 4.0, 10, 'ep')
    dcb2, cb2 = corner_brackets(14, 14, 386, 206, 24, 6.5, IRON, 'epcb')
    out['弹窗-确认面板.svg'] = svg(dp2 + dcb2, sp2 + cb2, 400, 220)

    # 6) 看牌堆大面板 (880 × 560)
    dp3, sp3 = stone_panel(10, 10, 870, 550, 18, random.Random(506), BASALT, '', 12, 24, lambda x, y: 42 < x < 838 and 70 < y < 520, 4.4, 12, 'pp')
    dcb3, cb3 = corner_brackets(14, 14, 866, 546, 30, 7, IRON, 'ppcb')
    dh, hdr = plate(20, 68, 250, 630, rnd=random.Random(507), gid='pph', bevel=16, sw=3.2)
    out['弹窗-牌堆大面板.svg'] = svg(dp3 + dcb3 + dh, sp3 + cb3 + hdr, 880, 560)

    # 7) 弹窗按钮五态 (168 × 48) & 关闭按钮五态 (42 × 42)
    for i, st in enumerate(BTN_STATES):
        out[f'弹窗-按钮-{st}.svg'] = rect_button(168, 48, st, 520 + i)
        out[f'弹窗-关闭按钮-{st}.svg'] = round_button(42, st, 530 + i, icon='close')
    return out


# ---------- 9. 伤害数字（粗壮圆头手绘数字，同套墨线/渐变/抖动，0–9 单字 + 暴击爆裂 + 彩虹描边 + 小盾） ----------
def _sample_cubic(p0, p1, p2, p3, n=12):
    out = []
    for i in range(n + 1):
        t = i / n
        mt = 1 - t
        x = mt ** 3 * p0[0] + 3 * mt ** 2 * t * p1[0] + 3 * mt * t ** 2 * p2[0] + t ** 3 * p3[0]
        y = mt ** 3 * p0[1] + 3 * mt ** 2 * t * p1[1] + 3 * mt * t ** 2 * p2[1] + t ** 3 * p3[1]
        out.append((x, y))
    return out


def _sample_quad(p0, p1, p2, n=10):
    out = []
    for i in range(n + 1):
        t = i / n
        mt = 1 - t
        x = mt * mt * p0[0] + 2 * mt * t * p1[0] + t * t * p2[0]
        y = mt * mt * p0[1] + 2 * mt * t * p1[1] + t * t * p2[1]
        out.append((x, y))
    return out


def _oval_pts(cx, cy, rx, ry, n=28, a0=-math.pi / 2, a1=math.tau - math.pi / 2):
    return [(cx + math.cos(a0 + (a1 - a0) * i / n) * rx, cy + math.sin(a0 + (a1 - a0) * i / n) * ry) for i in range(n)]


def _digit_strokes(d):
    """返回 (list_of_strokes, spec_pos)，每条 stroke 为 (pts, closed)。画布 96×116，字心在 x=24..72, y=22..94。"""
    if d == '0':
        return [(_oval_pts(48, 58, 22, 35, 30), True)], (34, 33)
    if d == '1':
        s1 = [(30, 35), (49, 22), (49, 93)]
        s2 = [(30, 93), (67, 93)]
        return [(s1, False), (s2, False)], (45, 29)
    if d == '2':
        top = _sample_cubic((27, 36), (29, 20), (68, 19), (68, 38), 14)
        diag = _sample_quad((68, 38), (67, 56), (27, 92), 12)
        base = [(27, 92), (70, 92)]
        return [(top + diag[1:] + base[1:], False)], (42, 26)
    if d == '3':
        up = _sample_cubic((28, 31), (36, 18), (69, 21), (67, 40), 12)
        mid = _sample_quad((67, 40), (65, 53), (44, 56), 8)
        lo = _sample_cubic((44, 56), (72, 57), (72, 92), (45, 93), 14)
        tail = _sample_quad((45, 93), (32, 93), (26, 84), 6)
        return [(up + mid[1:] + lo[1:] + tail[1:], False)], (43, 25)
    if d == '4':
        s1 = [(56, 23), (26, 68), (68, 68)]
        s2 = [(56, 23), (56, 93)]
        return [(s1, False), (s2, False)], (52, 33)
    if d == '5':
        top = [(67, 23), (32, 23), (29, 53)]
        belly = _sample_cubic((29, 53), (48, 45), (72, 56), (69, 75), 12)
        bot = _sample_cubic((69, 75), (67, 94), (36, 97), (26, 84), 10)
        return [(top + belly[1:] + bot[1:], False)], (37, 26)
    if d == '6':
        neck = _sample_cubic((63, 24), (39, 20), (24, 42), (26, 68), 14)
        loop = _sample_cubic((26, 68), (27, 95), (69, 96), (69, 72), 14)
        back = _sample_cubic((69, 72), (69, 50), (32, 49), (26, 68), 12)
        return [(neck + loop[1:] + back[1:], False)], (42, 28)
    if d == '7':
        bar = [(25, 24), (71, 24)]
        leg = _sample_quad((71, 24), (52, 54), (42, 93), 12)
        return [(bar + leg[1:], False)], (37, 26)
    if d == '8':
        top = _oval_pts(48, 39, 19, 16, 22)
        bot = _oval_pts(48, 74, 22, 19, 24)
        return [(top, True), (bot, True)], (38, 29)
    # '9'
    loop = _sample_cubic((69, 46), (69, 20), (27, 20), (27, 44), 14)
    mid = _sample_cubic((27, 44), (27, 65), (64, 65), (69, 46), 12)
    tail = _sample_cubic((69, 46), (71, 74), (56, 95), (32, 92), 14)
    return [(loop + mid[1:] + tail[1:], False)], (42, 27)


DMG_STYLES = {
    '红': ('#ffb4a0', '#e64236', '#7d1515', '#ffeae2'),
    '绿': ('#b6ffc0', '#32c75a', '#105c24', '#ecffef'),
    '蓝': ('#badeff', '#3d86f2', '#143a86', '#eff7ff'),
    '白': ('#ffffff', '#dce6ee', '#7e92a0', '#ffffff'),
    '铁': ('#dce5eb', '#92a0aa', '#4a555e', '#f5f9fc'),
    '铜': ('#ffe4a6', '#d8983c', '#764612', '#fff7df'),
    '灰': ('#96a0a8', '#626c74', '#333a40', '#bcc6cc'),
}


def _wobbled_digit_paths(d):
    strokes, spec = _digit_strokes(d)
    rnd = random.Random(700 + int(d))
    ds = [path(wobble(pts, rnd, 0.52, closed=closed), closed=closed) for pts, closed in strokes]
    return ' '.join(ds), spec


def damage_number_assets():
    out = {}
    # 1) 7 种填色 × 0–9 + 彩虹外描边 0–9
    for d in '0123456789':
        dd, (sx, sy) = _wobbled_digit_paths(d)
        for nm, (hi, mid, lo, spec) in DMG_STYLES.items():
            defs = (
                f'<linearGradient id="dg" x1="0" y1="0.1" x2="0" y2="0.92">'
                f'<stop offset="0" stop-color="{hi}"/><stop offset="0.46" stop-color="{mid}"/><stop offset="1" stop-color="{lo}"/>'
                f'</linearGradient>'
                f'<linearGradient id="dhi" x1="0" y1="0.12" x2="0" y2="0.56">'
                f'<stop offset="0" stop-color="{spec}" stop-opacity="0.88"/><stop offset="1" stop-color="{spec}" stop-opacity="0"/>'
                f'</linearGradient>'
                f'<clipPath id="dup"><rect x="0" y="0" width="96" height="58"/></clipPath>'
            )
            body = (
                f'<path d="{dd}" fill="none" stroke="{INK}" stroke-width="25" stroke-linecap="round" stroke-linejoin="round"/>'
                f'<path d="{dd}" fill="none" stroke="{lo}" stroke-width="16.5" stroke-linecap="round" stroke-linejoin="round" transform="translate(0,1.4)"/>'
                f'<path d="{dd}" fill="none" stroke="url(#dg)" stroke-width="15.5" stroke-linecap="round" stroke-linejoin="round"/>'
                f'<g clip-path="url(#dup)">'
                f'<path d="{dd}" fill="none" stroke="url(#dhi)" stroke-width="9.5" stroke-linecap="round" stroke-linejoin="round" transform="translate(0,-1.8)"/>'
                f'</g>'
                f'<ellipse cx="{f(sx)}" cy="{f(sy)}" rx="4.4" ry="2.3" transform="rotate(-24 {f(sx)} {f(sy)})" fill="#fff" fill-opacity="{0.42 if nm == "灰" else 0.82}"/>'
            )
            out[f'伤害-{nm}-{d}.svg'] = svg(defs, body, 96, 116)

        # 彩虹外描边层（画在底座数字之下，任何色光/白光/无色/纯伤都能叠加）
        drb = (
            '<linearGradient id="drb" x1="0" y1="0" x2="1" y2="1">'
            + ''.join(f'<stop offset="{i / 5:.2f}" stop-color="{c}"/>' for i, c in enumerate(RAINBOW))
            + '</linearGradient>'
        )
        rb_body = (
            f'<path d="{dd}" fill="none" stroke="{INK}" stroke-width="39" stroke-linecap="round" stroke-linejoin="round"/>'
            f'<path d="{dd}" fill="none" stroke="url(#drb)" stroke-width="34" stroke-linecap="round" stroke-linejoin="round"/>'
            f'<path d="{dd}" fill="none" stroke="#ffffff" stroke-opacity="0.52" stroke-width="28" stroke-linecap="round" stroke-linejoin="round"/>'
        )
        out[f'伤害-彩虹描边-{d}.svg'] = svg(drb, rb_body, 96, 116)

    # 2) 暴击背后的手绘尖角爆裂 (240 × 180)
    rnd = random.Random(750)
    cx, cy, spikes = 120, 90, 14
    outer_pts, inner_pts = [], []
    for i in range(spikes * 2):
        a = -math.pi / 2 + i * math.pi / spikes
        is_tip = (i % 2 == 0)
        rx = (100 + rnd.uniform(-9, 10)) if is_tip else (60 + rnd.uniform(-5, 6))
        ry = (78 + rnd.uniform(-7, 8)) if is_tip else (44 + rnd.uniform(-4, 5))
        outer_pts.append((cx + math.cos(a) * rx, cy + math.sin(a) * ry))
        inner_pts.append((cx + math.cos(a) * rx * 0.70, cy + math.sin(a) * ry * 0.70))
    od = path(wobble(outer_pts, rnd, 0.8))
    id_ = path(wobble(inner_pts, rnd, 0.5))
    dcrit = (
        f'<radialGradient id="cb" cx="0.5" cy="0.46" r="0.58">'
        f'<stop offset="0" stop-color="#fffce6"/><stop offset="0.48" stop-color="{WARM}"/><stop offset="0.88" stop-color="#c97922"/><stop offset="1" stop-color="#8a4412"/>'
        f'</radialGradient>'
    )
    crit_body = (
        f'<path d="{od}" fill="url(#cb)" stroke="{INK}" stroke-width="6.5" stroke-linejoin="round"/>'
        f'<path d="{id_}" fill="#fff6d0" fill-opacity="0.62" stroke="{WARM}" stroke-opacity="0.65" stroke-width="1.8" stroke-linejoin="round"/>'
    )
    out['伤害-暴击爆裂.svg'] = svg(dcrit, crit_body, 240, 180)

    # 3) 挡掉 / 减伤旁边的手绘小盾 (56 × 64)
    rnd_s = random.Random(760)
    sh_pts = wobble([(28, 6), (48, 13), (46, 36), (38, 49), (28, 58), (18, 49), (10, 36), (8, 13)], rnd_s, 0.45)
    sh_d = path(sh_pts)
    dsh = (
        f'<linearGradient id="dsh" x1="0" y1="0" x2="0" y2="1">'
        f'<stop offset="0" stop-color="{IRON[0]}"/><stop offset="0.5" stop-color="{IRON[1]}"/><stop offset="1" stop-color="{IRON[2]}"/>'
        f'</linearGradient>'
    )
    sh_body = (
        f'<path d="{sh_d}" fill="url(#dsh)" stroke="{INK}" stroke-width="5" stroke-linejoin="round"/>'
        f'<path d="M14 17 L28 12 L42 17" fill="none" stroke="{COLD}" stroke-opacity="0.65" stroke-width="2" stroke-linecap="round"/>'
        f'<path d="M28 15 L28 49 M17 26 L39 26" fill="none" stroke="{INK}" stroke-opacity="0.72" stroke-width="3" stroke-linecap="round"/>'
        f'<path d="M28 15 L28 48 M17 25 L39 25" fill="none" stroke="{COLD}" stroke-opacity="0.4" stroke-width="1.2" stroke-linecap="round"/>'
    )
    out['伤害-小盾.svg'] = svg(dsh, sh_body, 56, 64)
    return out


# ---------- 汇总生成全部 SVG ----------
files = {}
for i, key in enumerate(['red', 'yellow', 'green', 'cyan', 'blue', 'purple', 'white']):
    a, b = color_card(key, 100 + i)
    files[f'色光-{key}-窗.svg'], files[f'色光-{key}-牌身.svg'] = a, b

# 异能牌（原两张示例 + 游戏当前异能牌各色占位铁框）
a, b = ability_card('blue', 'b', False, 150)
files['异能-增幅法阵-窗.svg'], files['异能-增幅法阵-牌身.svg'] = a, b
a, b = ability_card('green', 'g', True, 151)
files['异能-灵感涌现-窗.svg'], files['异能-灵感涌现-牌身.svg'] = a, b
a, b = ability_card('red', 'r', False, 152, art_key=None)
files['异能-铁框-red-窗.svg'], files['异能-铁框-red-牌身.svg'] = a, b
a, b = ability_card('none', None, False, 153, art_key=None)
files['异能-铁框-none-窗.svg'], files['异能-铁框-none-牌身.svg'] = a, b
a, b = ability_card('white', None, False, 154, art_key=None)
files['异能-铁框-white-窗.svg'], files['异能-铁框-white-牌身.svg'] = a, b
a, b = ability_card('none', None, True, 155, art_key=None)
files['异能-铜框-none-窗.svg'], files['异能-铜框-none-牌身.svg'] = a, b

# 封印牌 & 牌背
a, b = seal_card(200)
files['封印-窗.svg'], files['封印-牌身.svg'] = a, b
files['牌背.svg'] = card_back(210)

# 独立宝石 (120 × 120) & 独立徽记 (64 × 64)
for k, nm in (('r', '红'), ('g', '绿'), ('b', '蓝')):
    dg, sg = gem(k, 60, 60, 26, f'sg{k}', glow_scale=2.0)
    files[f'宝石-{nm}.svg'] = svg(dg, sg, 120, 120)
for k, nm in (('spell', '法术'), ('seal', '封印'), ('treasure', '宝物')):
    db, sb = badge_parts(k, 32, 32, 24, f'bd{k}')
    files[f'徽记-{nm}.svg'] = svg(db, sb, 64, 64)

files.update(state_layers())
files.update(hud_assets())
files.update(modal_assets())
files.update(damage_number_assets())

for n, s in files.items():
    assert '<filter' not in s and '<text' not in s, f'禁用标签出现在 {n}'
    has_img = '<image' in s
    if has_img:
        assert 'href="data:image/png;base64,' in s and 'href="http://' not in s and 'href="https://' not in s, f'非法的 image 引用: {n}'
        assert len(s.encode('utf-8')) <= 300_000, f'超过 300KB: {n} ({len(s.encode("utf-8"))})'
    else:
        assert len(s.encode('utf-8')) <= 80_000, f'超过 80KB: {n} ({len(s.encode("utf-8"))})'
    with open(os.path.join(OUT, n), 'w', encoding='utf-8') as fp:
        fp.write(s)

# 输出可换色 SVG 模板与文件尺寸清单供游戏运行时直接导入（兼容 file://，不依赖 fetch）
import re as _re
def _vb_size(s):
    m = _re.search(r'viewBox="0 0 (\d+) (\d+)"', s)
    return [int(m.group(1)), int(m.group(2))] if m else [400, 600]

COLOR_KEY_FILES = ['状态-色光边.svg', '状态-邻色箭头.svg', '界面-色环灯-亮.svg']
with open(os.path.join(HERE, 'manifest.js'), 'w', encoding='utf-8') as fp:
    fp.write('// 由 art/ui/石板/生成.py 自动生成，请勿手改。\n')
    fp.write('export const SVG_FILES = ' + json.dumps(sorted(files.keys()), ensure_ascii=False) + ';\n')
    fp.write('export const SVG_SIZES = ' + json.dumps({k: _vb_size(files[k]) for k in sorted(files.keys())}, ensure_ascii=False) + ';\n')
    fp.write('export const RECOLOR_TEMPLATES = ' + json.dumps({k: files[k] for k in COLOR_KEY_FILES}, ensure_ascii=False) + ';\n')

# ---------- 生成 预览.html（SVG 内嵌，两只怪各自包在 IIFE 内隔离作用域） ----------
tpl_path = os.path.join(HERE, '预览模板.html')
if os.path.exists(tpl_path):
    rd = lambda p: open(os.path.join(GAME_ROOT, p), encoding='utf-8').read()
    MODS = {
        'tiko': ('art/monster/tiko/tiko.js', 'art/monster/tiko/颜色表.json'),
        'badom': ('art/monster/badom/badom.js', 'art/monster/badom/颜色表.json'),
    }
    mods = ['<script>window.__MODS = {}; window.__PALS = {};</script>']
    for k, (js, pal) in MODS.items():
        if not os.path.exists(os.path.join(GAME_ROOT, js)):
            continue
        code = rd(js).replace('export default', f'window.__MODS[{json.dumps(k)}] =')
        mods.append(
            f'<script>(function(){{\n{code}\n}})();\n'
            f'window.__PALS[{json.dumps(k)}] = {json.dumps(json.loads(rd(pal))["普通"], ensure_ascii=False)};</script>'
        )
    tpl = open(tpl_path, encoding='utf-8').read()
    html = (
        tpl.replace('/*SVGS*/{}', json.dumps(files, ensure_ascii=False))
        .replace('<!--P5-->', '<script src="../../../vendor/p5.min.js"></script>')
        .replace('<!--MODS-->', '\n'.join(mods))
    )
    with open(os.path.join(HERE, '预览.html'), 'w', encoding='utf-8') as fp:
        fp.write(html)
    print('已生成 预览.html 与 manifest.js，共', len(files), '个 SVG，最大', max(len(s.encode('utf-8')) for s in files.values()) // 1024, 'KB')
else:
    print('已生成', len(files), '个 SVG，最大', max(len(s.encode('utf-8')) for s in files.values()) // 1024, 'KB（尚无 预览模板.html）')
