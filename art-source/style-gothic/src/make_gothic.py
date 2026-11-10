#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
哥特（第五人格风）· 5 个动态角色 SVG 生成脚本
严格使用 style.config.mjs 中定义的色板，生成符合画风库部件 ID、关节 pivot 与动画规范的 SVG。
"""

import math
import os
import random
import shutil

# 严格对齐 style.config.mjs 色板（严禁纯黑 #000）
PAL = {
    "ink": "#1C1412",
    "white": "#E6DEC8",
    "noise": "#D8CEB8",
    "shadow": "#0D111C",
    "shadowOp": 0.65,
    "fam": {
        "moss":      {"c": "#4E6851", "d": "#354939", "l": "#78967B", "deep": "#1F2D23"},
        "parchment": {"c": "#C8B894", "d": "#9A8968", "l": "#E2D6BA", "deep": "#524531"},
        "wine":      {"c": "#8C3B45", "d": "#5E242C", "l": "#B5626C", "deep": "#381318"},
        "ochre":     {"c": "#9E6238", "d": "#704122", "l": "#C48A5C", "deep": "#3D2212"},
        "amber":     {"c": "#D98E32", "d": "#A6601A", "l": "#F2C166", "deep": "#59300C"},
        "brass":     {"c": "#9A7B46", "d": "#6E542B", "l": "#C2A670", "deep": "#3B2B14"},
        "slate":     {"c": "#5A7682", "d": "#3B515C", "l": "#8CAAB5", "deep": "#1E2C33"},
        "plum":      {"c": "#3A324D", "d": "#262036", "l": "#62577D", "deep": "#161221"},
        "gray":      {"c": "#6E6A63", "d": "#4A4742", "l": "#948F86", "deep": "#2E2C28"},
    },
}

INK = PAL["ink"]
WHITE = PAL["white"]
NOISE = PAL["noise"]
SHADOW = PAL["shadow"]
F = PAL["fam"]


def fmt(v):
    return f"{v:.1f}".rstrip("0").rstrip(".")


def poly_path(pts, closed=True):
    if not pts:
        return ""
    s = f"M{fmt(pts[0][0])},{fmt(pts[0][1])}"
    for p in pts[1:]:
        s += f"L{fmt(p[0])},{fmt(p[1])}"
    if closed:
        s += "Z"
    return s


def sample_closed_curve(pts, sharp_indices=None, subdiv=8):
    """
    對控制點生成平滑閉合曲線頂點序列，支持指定 sharp_indices 保留尖銳折角（如耳尖、火尖、趾尖、星尖）。
    填充與手繪描邊共用同一套採樣點，確保 100% 嚴絲合縫絕不露角。
    """
    if sharp_indices is None:
        sharp_indices = set()
    else:
        sharp_indices = set(sharp_indices)
    n = len(pts)
    out = []
    for i in range(n):
        p0 = pts[(i - 1) % n]
        p1 = pts[i]
        p2 = pts[(i + 1) % n]
        if i in sharp_indices:
            # 尖角頂點：從前一段中點直線拉到尖點，再直線拉到後一段中點
            m0 = ((p0[0] + p1[0]) * 0.5, (p0[1] + p1[1]) * 0.5)
            m1 = ((p1[0] + p2[0]) * 0.5, (p1[1] + p2[1]) * 0.5)
            for s in range(subdiv // 2):
                t = s / (subdiv // 2)
                out.append((m0[0] + (p1[0] - m0[0]) * t, m0[1] + (p1[1] - m0[1]) * t))
            out.append(p1)
            for s in range(1, subdiv // 2):
                t = s / (subdiv // 2)
                out.append((p1[0] + (m1[0] - p1[0]) * t, p1[1] + (m1[1] - p1[1]) * t))
        else:
            m0 = ((p0[0] + p1[0]) * 0.5, (p0[1] + p1[1]) * 0.5)
            m1 = ((p1[0] + p2[0]) * 0.5, (p1[1] + p2[1]) * 0.5)
            for s in range(subdiv):
                t = s / subdiv
                u = 1.0 - t
                x = u * u * m0[0] + 2 * u * t * p1[0] + t * t * m1[0]
                y = u * u * m0[1] + 2 * u * t * p1[1] + t * t * m1[1]
                out.append((x, y))
    return out


def tapered_stroke(pts, w_max=2.6, w_min=0.35, wobble=0.22, seed=7):
    """生成順滑不封閉的手繪曲線路徑 d（配合 stroke-linecap=round 使用，絕不產生跨圖形弦線）"""
    return poly_path(pts, closed=False)


def boiling_Loop_stroke(curve_pts, w_base=2.8, wobble=0.28, seed=10, color=INK):
    """
    對閉合輪廓生成雙幀輕微沸騰的手繪描邊 (.boil-a 與 .boil-b)，
    使用 stroke-linejoin="round" 結合手繪微抖頂點與右下側加粗壓暗筆觸，既保留尖角又絕不爆刺。
    """
    def jitter_pts(s, wob):
        rng = random.Random(s)
        out = []
        n = len(curve_pts)
        for i, (x, y) in enumerate(curve_pts):
            ang = 2 * math.pi * i / n
            jx = rng.uniform(-wob, wob) + 0.18 * math.sin(ang * 5 + s)
            jy = rng.uniform(-wob, wob) + 0.18 * math.cos(ang * 4 + s)
            out.append((x + jx, y + jy))
        return out

    p_a = jitter_pts(seed, wobble)
    p_b = jitter_pts(seed + 97, wobble * 1.15)

    return (
        f'<g class="boil-a">'
        f'<path d="{poly_path(p_a, True)}" fill="none" stroke="{color}" stroke-width="{fmt(w_base)}" stroke-linejoin="round" stroke-linecap="round"/>'
        f'</g>'
        f'<g class="boil-b">'
        f'<path d="{poly_path(p_b, True)}" fill="none" stroke="{color}" stroke-width="{fmt(w_base * 0.94)}" stroke-linejoin="round" stroke-linecap="round"/>'
        f'</g>'
    )


def point_in_poly(x, y, poly):
    """射線法判斷點 (x, y) 是否在多邊形 poly 內"""
    inside = False
    n = len(poly)
    j = n - 1
    for i in range(n):
        xi, yi = poly[i]
        xj, yj = poly[j]
        if ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / ((yj - yi) or 1e-9) + xi):
            inside = not inside
        j = i
    return inside


def shrink_poly(poly, margin=2.8):
    """將多邊形向其重心內縮 margin 像素，確保排線絕不超出外輪廓"""
    cx = sum(p[0] for p in poly) / len(poly)
    cy = sum(p[1] for p in poly) / len(poly)
    out = []
    for x, y in poly:
        dx, dy = x - cx, y - cy
        ln = math.hypot(dx, dy) or 1.0
        nl = max(0.0, ln - margin)
        out.append((cx + dx / ln * nl, cy + dy / ln * nl))
    return out


def poly_hatch(poly_pts, angle_deg=55, spacing=4.0, side="br", color=INK, op=0.45, w=0.9, margin=3.0, seed=1):
    """嚴格裁剪在多邊形內部的鋼筆排線與交叉排線，100% 不越界"""
    inner = shrink_poly(poly_pts, margin=margin)
    xs = [p[0] for p in inner]
    ys = [p[1] for p in inner]
    min_x, max_x = min(xs), max(xs)
    min_y, max_y = min(ys), max(ys)
    cx = (min_x + max_x) * 0.5
    cy = (min_y + max_y) * 0.5
    rx = max(1.0, (max_x - min_x) * 0.5)
    ry = max(1.0, (max_y - min_y) * 0.5)
    max_r = math.hypot(rx, ry) + 4.0

    rng = random.Random(seed)
    rad = math.radians(angle_deg)
    ca, sa = math.cos(rad), math.sin(rad)
    nx, ny = -sa, ca

    paths = []
    k = -max_r
    while k <= max_r:
        seg = []
        s = -max_r
        while s <= max_r:
            px = cx + nx * k + ca * s
            py = cy + ny * k + sa * s
            if min_x <= px <= max_x and min_y <= py <= max_y and point_in_poly(px, py, inner):
                u = (px - cx) / rx
                v = (py - cy) / ry
                ok = True
                if side == "br" and (u * 0.65 + v * 0.75 < 0.08):
                    ok = False
                elif side == "right" and (u < 0.05):
                    ok = False
                elif side == "bottom" and (v < 0.18):
                    ok = False
                if ok:
                    seg.append((px, py))
                elif len(seg) >= 2:
                    p0, p1 = seg[0], seg[-1]
                    if math.hypot(p1[0] - p0[0], p1[1] - p0[1]) >= 3.5:
                        paths.append(f"M{fmt(p0[0])},{fmt(p0[1])}L{fmt(p1[0])},{fmt(p1[1])}")
                    seg = []
                else:
                    seg = []
            else:
                if len(seg) >= 2:
                    p0, p1 = seg[0], seg[-1]
                    if math.hypot(p1[0] - p0[0], p1[1] - p0[1]) >= 3.5:
                        paths.append(f"M{fmt(p0[0])},{fmt(p0[1])}L{fmt(p1[0])},{fmt(p1[1])}")
                seg = []
            s += 1.5
        if len(seg) >= 2:
            p0, p1 = seg[0], seg[-1]
            if math.hypot(p1[0] - p0[0], p1[1] - p0[1]) >= 3.5:
                paths.append(f"M{fmt(p0[0])},{fmt(p0[1])}L{fmt(p1[0])},{fmt(p1[1])}")
        k += spacing + rng.uniform(-0.2, 0.2)
    if not paths:
        return ""
    return f'<path d="{"".join(paths)}" stroke="{color}" stroke-width="{fmt(w)}" stroke-linecap="round" opacity="{fmt(op)}" fill="none"/>'


def stitch_marks(pts, tick_len=3.2, cross=False, color=INK, w=1.2, seed=5):
    """沿路徑點生成手工布偶縫線與針腳"""
    rng = random.Random(seed)
    d_main = f"M{fmt(pts[0][0])},{fmt(pts[0][1])}" + "".join(f"L{fmt(x)},{fmt(y)}" for x, y in pts[1:])
    ticks = []
    for i in range(len(pts) - 1):
        x0, y0 = pts[i]
        x1, y1 = pts[i + 1]
        mx, my = (x0 + x1) * 0.5, (y0 + y1) * 0.5
        dx, dy = x1 - x0, y1 - y0
        ln = math.hypot(dx, dy) or 1.0
        nx, ny = -dy / ln, dx / ln
        tx, ty = dx / ln, dy / ln
        hl = tick_len * 0.5 * rng.uniform(0.85, 1.15)
        if cross:
            ticks.append(
                f"M{fmt(mx - nx*hl - tx*hl*0.55)},{fmt(my - ny*hl - ty*hl*0.55)}"
                f"L{fmt(mx + nx*hl + tx*hl*0.55)},{fmt(my + ny*hl + ty*hl*0.55)}"
                f"M{fmt(mx - nx*hl + tx*hl*0.55)},{fmt(my - ny*hl + ty*hl*0.55)}"
                f"L{fmt(mx + nx*hl - tx*hl*0.55)},{fmt(my + ny*hl - ty*hl*0.55)}"
            )
        else:
            ticks.append(
                f"M{fmt(mx - nx*hl)},{fmt(my - ny*hl)}L{fmt(mx + nx*hl)},{fmt(my + ny*hl)}"
            )
    return (
        f'<path d="{d_main}" stroke="{color}" stroke-width="{fmt(w*0.85)}" stroke-dasharray="2.5 2.2" stroke-linecap="round" fill="none"/>'
        f'<path d="{"".join(ticks)}" stroke="{color}" stroke-width="{fmt(w)}" stroke-linecap="round" fill="none"/>'
    )


def shadow_group(cx, cy, rx, ry, pivot_x, pivot_y):
    """哥特風落地影：冷夜深色底影 + 密集斜向鋼筆排線"""
    rng = random.Random(int(cx * 10 + cy))
    lines = []
    x = cx - rx * 0.9
    while x <= cx + rx * 0.9:
        u = (x - cx) / rx
        h = ry * math.sqrt(max(0.0, 1.0 - u * u))
        if h > 1.0:
            x0 = x + rng.uniform(-1.0, 1.0) - 2.0
            y0 = cy + h * 0.82 + rng.uniform(-0.4, 0.4)
            x1 = x + rng.uniform(-1.0, 1.0) + 2.0
            y1 = cy - h * 0.82 + rng.uniform(-0.4, 0.4)
            lines.append(f"M{fmt(x0)},{fmt(y0)}L{fmt(x1)},{fmt(y1)}")
        x += 3.2
    return (
        f'<g id="shadow"><!-- pivot: {fmt(pivot_x)},{fmt(pivot_y)} -->'
        f'<ellipse cx="{fmt(cx)}" cy="{fmt(cy)}" rx="{fmt(rx)}" ry="{fmt(ry)}" fill="{SHADOW}" opacity="0.58"/>'
        f'<ellipse cx="{fmt(cx)}" cy="{fmt(cy)}" rx="{fmt(rx*0.75)}" ry="{fmt(ry*0.65)}" fill="{INK}" opacity="0.45"/>'
        f'<path d="{"".join(lines)}" stroke="{INK}" stroke-width="1.15" stroke-linecap="round" opacity="0.65" fill="none"/>'
        f'</g>'
    )


def film_scratch_patch(pivot_x, pivot_y, clusters):
    """生成舊膠片豎向劃痕、斷續刮線與閃爍噪點斑 (static_patch)"""
    rng = random.Random(int(pivot_x * 13 + pivot_y))
    elems = []
    for (cx, cy, w, h) in clusters:
        for i in range(5):
            sx = cx + (i - 2) * (w * 0.21) + rng.uniform(-1.0, 1.0)
            sy0 = cy - h * rng.uniform(0.35, 0.52)
            sy1 = cy + h * rng.uniform(0.35, 0.52)
            mx = sx + rng.uniform(-1.1, 1.1)
            my = (sy0 + sy1) * 0.5
            col = NOISE if i % 2 == 0 else INK
            sw = 1.3 if col == NOISE else 0.95
            elems.append(
                f'<path d="M{fmt(sx)},{fmt(sy0)}L{fmt(mx)},{fmt(my)}L{fmt(sx + rng.uniform(-0.7,0.7))},{fmt(sy1)}" '
                f'stroke="{col}" stroke-width="{fmt(sw)}" stroke-linecap="round" fill="none" opacity="0.92"/>'
            )
        for j in range(4):
            rx = cx + rng.uniform(-w * 0.42, w * 0.32)
            ry = cy + rng.uniform(-h * 0.4, h * 0.4)
            rw = rng.uniform(2.2, 5.2)
            rh = rng.uniform(1.0, 1.9)
            ang = rng.uniform(-7, 7)
            elems.append(
                f'<rect x="{fmt(rx)}" y="{fmt(ry)}" width="{fmt(rw)}" height="{fmt(rh)}" '
                f'transform="rotate({fmt(ang)} {fmt(rx)} {fmt(ry)})" fill="{NOISE}" opacity="0.88"/>'
            )
        for j in range(3):
            dx = cx + rng.uniform(-w * 0.45, w * 0.45)
            dy = cy + rng.uniform(-h * 0.45, h * 0.45)
            dr = rng.uniform(0.8, 1.4)
            elems.append(f'<circle cx="{fmt(dx)}" cy="{fmt(dy)}" r="{fmt(dr)}" fill="{INK}" opacity="0.85"/>')
    return f'<g id="static_patch"><!-- pivot: {fmt(pivot_x)},{fmt(pivot_y)} -->{"".join(elems)}</g>'


def common_boil_css(cls):
    return f"""
.{cls} g {{ transform-box: view-box; }}
@keyframes {cls}-boil-a {{ 0%, 100% {{ opacity: 1; }} 50% {{ opacity: 0; }} }}
@keyframes {cls}-boil-b {{ 0%, 100% {{ opacity: 0; }} 50% {{ opacity: 1; }} }}
.{cls} .boil-a {{ animation: {cls}-boil-a 0.36s steps(2, end) infinite; }}
.{cls} .boil-b {{ opacity: 0; animation: {cls}-boil-b 0.36s steps(2, end) infinite; }}
"""


def gothic_defs(prefix, w, h, extra_defs=""):
    """哥特舊紙微顆粒濾鏡與公共漸變"""
    return f"""<defs>
  <filter id="{prefix}-grunge" filterUnits="userSpaceOnUse" x="0" y="0" width="{w}" height="{h}" color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency="0.065" numOctaves="2" seed="11" result="n"/>
    <feColorMatrix in="n" type="matrix" values="0 0 0 0 0.11  0 0 0 0 0.08  0 0 0 0 0.07  0 0 0 0.09 0" result="grain"/>
    <feComposite in="grain" in2="SourceGraphic" operator="in" result="clippedGrain"/>
    <feBlend mode="multiply" in="SourceGraphic" in2="clippedGrain"/>
  </filter>
  {extra_defs}
</defs>"""


# ==============================================================================
# 1. 蛙仔 (monster_froglet) - 192x192
# ==============================================================================
def build_froglet():
    c_moss = F["moss"]
    c_parch = F["parchment"]
    c_wine = F["wine"]

    css = common_boil_css("svg-froglet") + """
.svg-froglet #root { transform-origin: 96px 192px; }
.svg-froglet #shadow { transform-origin: 96px 171.5px; }
.svg-froglet #body { transform-origin: 96px 166.4px; }
.svg-froglet #leg_back_l { transform-origin: 37.1px 148.5px; }
.svg-froglet #leg_back_r { transform-origin: 154.9px 148.5px; }
.svg-froglet #belly { transform-origin: 96px 135.7px; }
.svg-froglet #arm_l { transform-origin: 44.8px 125.4px; }
.svg-froglet #arm_r { transform-origin: 147.2px 125.4px; }
.svg-froglet #head { transform-origin: 96px 96px; }
.svg-froglet #eyes { transform-origin: 96px 62.7px; }
.svg-froglet #eye_l { transform-origin: 66.6px 64px; }
.svg-froglet #eye_r { transform-origin: 126.7px 61.4px; }
.svg-froglet #cheeks { transform-origin: 96px 97.3px; }
.svg-froglet #mouth { transform-origin: 96px 101.1px; }
.svg-froglet #face_hurt { transform-origin: 96px 101.1px; }
.svg-froglet #static_patch { transform-origin: 90.2px 117.8px; }

@keyframes froglet-idle-body {
  0%, 100% { transform: translate(0px, 0px) rotate(0deg) scale(1, 1); }
  28% { transform: translate(-0.8px, -1.8px) rotate(-1.1deg) scale(1.012, 0.99); }
  52% { transform: translate(0.4px, -2.8px) rotate(0.9deg) scale(1.018, 0.985); }
  78% { transform: translate(0.6px, -0.9px) rotate(1.2deg) scale(1.005, 0.995); }
}
@keyframes froglet-idle-belly {
  0%, 100% { transform: scale(1, 1); }
  52% { transform: scale(1.03, 1.022); }
}
@keyframes froglet-idle-arml {
  0%, 100% { transform: rotate(0deg); }
  35% { transform: rotate(-2.2deg); }
  70% { transform: rotate(0.8deg); }
}
@keyframes froglet-idle-armr {
  0%, 100% { transform: rotate(0deg); }
  35% { transform: rotate(2.2deg); }
  70% { transform: rotate(-0.8deg); }
}
@keyframes froglet-idle-eyel {
  0%, 100% { transform: rotate(0deg); }
  24% { transform: rotate(-2.5deg); }
  62% { transform: rotate(1.8deg); }
}
@keyframes froglet-idle-eyer {
  0%, 100% { transform: rotate(0deg); }
  40% { transform: rotate(2.8deg); }
  75% { transform: rotate(-1.6deg); }
}
@keyframes froglet-idle-noise {
  0%, 100% { opacity: 0.92; transform: translate(0px, 0px); }
  33% { opacity: 0.28; transform: translate(0.6px, -0.5px); }
  66% { opacity: 0.75; transform: translate(-0.5px, 0.4px); }
}
.svg-froglet:not([data-anim]) #body, .svg-froglet[data-anim="idle"] #body { animation: froglet-idle-body 1.95s steps(8, end) infinite; }
.svg-froglet:not([data-anim]) #belly, .svg-froglet[data-anim="idle"] #belly { animation: froglet-idle-belly 1.95s steps(8, end) infinite; }
.svg-froglet:not([data-anim]) #arm_l, .svg-froglet[data-anim="idle"] #arm_l { animation: froglet-idle-arml 1.95s steps(6, end) infinite; }
.svg-froglet:not([data-anim]) #arm_r, .svg-froglet[data-anim="idle"] #arm_r { animation: froglet-idle-armr 1.95s steps(6, end) infinite; }
.svg-froglet:not([data-anim]) #eye_l, .svg-froglet[data-anim="idle"] #eye_l { animation: froglet-idle-eyel 2.6s steps(5, end) infinite; }
.svg-froglet:not([data-anim]) #eye_r, .svg-froglet[data-anim="idle"] #eye_r { animation: froglet-idle-eyer 2.6s steps(5, end) infinite; }
.svg-froglet:not([data-anim]) #static_patch, .svg-froglet[data-anim="idle"] #static_patch { animation: froglet-idle-noise 0.48s steps(3, end) infinite; }

@keyframes froglet-hurt-root {
  0%, 100% { transform: translate(0px, 0px); }
  16% { transform: translate(-7px, 0px) rotate(-1.5deg); }
  36% { transform: translate(6.5px, 0px) rotate(1.5deg); }
  56% { transform: translate(-4.5px, 0px) rotate(-0.8deg); }
  76% { transform: translate(2.5px, 0px); }
}
@keyframes froglet-hurt-show { 0%, 6%, 88%, 100% { opacity: 0; } 10%, 84% { opacity: 1; } }
@keyframes froglet-hurt-hide { 0%, 6%, 88%, 100% { opacity: 1; } 10%, 84% { opacity: 0; } }
@keyframes froglet-hurt-noise {
  0%, 100% { transform: scale(1); opacity: 0.9; }
  20%, 70% { transform: scale(1.26); opacity: 1; }
}
@keyframes froglet-hurt-arml { 0%, 100% { transform: rotate(0deg); } 25% { transform: rotate(10deg); } 60% { transform: rotate(-4deg); } }
@keyframes froglet-hurt-armr { 0%, 100% { transform: rotate(0deg); } 25% { transform: rotate(-10deg); } 60% { transform: rotate(4deg); } }
.svg-froglet[data-anim="hurt"] #root { animation: froglet-hurt-root 0.62s steps(6, end) both; }
.svg-froglet[data-anim="hurt"] #face_hurt { animation: froglet-hurt-show 0.62s linear both; }
.svg-froglet[data-anim="hurt"] #mouth { animation: froglet-hurt-hide 0.62s linear both; }
.svg-froglet[data-anim="hurt"] #static_patch { animation: froglet-hurt-noise 0.62s steps(4, end) both; }
.svg-froglet[data-anim="hurt"] #arm_l { animation: froglet-hurt-arml 0.62s ease-out both; }
.svg-froglet[data-anim="hurt"] #arm_r { animation: froglet-hurt-armr 0.62s ease-out both; }

@keyframes froglet-collect-root {
  0% { transform: translate(0px, 0px) rotate(0deg) scale(1); opacity: 1; }
  26% { transform: translate(0px, -6px) rotate(-8deg) scale(1.05); opacity: 1; }
  78% { transform: translate(38px, -68px) rotate(140deg) scale(0.16); opacity: 0.9; }
  100% { transform: translate(56px, -96px) rotate(200deg) scale(0.05); opacity: 0; }
}
@keyframes froglet-collect-shadow {
  0% { transform: scale(1); opacity: 1; }
  80%, 100% { transform: scale(0.2); opacity: 0; }
}
.svg-froglet[data-anim="collect"] #root { animation: froglet-collect-root 0.75s cubic-bezier(0.36, 0, 0.66, -0.56) both; }
.svg-froglet[data-anim="collect"] #shadow { animation: froglet-collect-shadow 0.75s ease-out both; }

@keyframes froglet-scare-root {
  0% { transform: translate(0px, 0px) scale(1, 1); opacity: 1; }
  20% { transform: translate(0px, 5px) scale(1.08, 0.9); opacity: 1; }
  50% { transform: translate(24px, -42px) scale(0.94, 1.1); opacity: 1; }
  100% { transform: translate(88px, -84px) scale(0.85, 1.08); opacity: 0; }
}
.svg-froglet[data-anim="scare"] #root { animation: froglet-scare-root 0.74s ease-in both; }
.svg-froglet[data-anim="scare"] #face_hurt { animation: froglet-hurt-show 0.74s linear both; }
.svg-froglet[data-anim="scare"] #mouth { animation: froglet-hurt-hide 0.74s linear both; }
.svg-froglet[data-anim="scare"] #shadow { animation: froglet-collect-shadow 0.74s ease-out both; }

@keyframes froglet-act-belly {
  0%, 100% { transform: scale(1, 1); }
  36% { transform: scale(1.26, 1.22); }
  58% { transform: scale(1.22, 1.18); }
  80% { transform: scale(0.96, 0.96); }
}
@keyframes froglet-act-body {
  0%, 100% { transform: scale(1, 1); }
  36% { transform: scale(1.05, 1.03); }
  58% { transform: scale(1.04, 1.02); }
  80% { transform: scale(0.98, 1.01); }
}
@keyframes froglet-act-arml {
  0%, 100% { transform: rotate(0deg); }
  40% { transform: rotate(10deg); }
  65% { transform: rotate(8deg); }
}
@keyframes froglet-act-armr {
  0%, 100% { transform: rotate(0deg); }
  40% { transform: rotate(-10deg); }
  65% { transform: rotate(-8deg); }
}
.svg-froglet[data-anim="act"] #belly { animation: froglet-act-belly 0.72s steps(7, end) both; }
.svg-froglet[data-anim="act"] #body { animation: froglet-act-body 0.72s steps(7, end) both; }
.svg-froglet[data-anim="act"] #arm_l { animation: froglet-act-arml 0.72s steps(6, end) both; }
.svg-froglet[data-anim="act"] #arm_r { animation: froglet-act-armr 0.72s steps(6, end) both; }
"""

    leg_l_ctrl = [(54, 142), (34, 132), (20, 139), (17, 154), (24, 162), (14, 168), (22, 171), (31, 169), (38, 172), (58, 165)]
    leg_l_curve = sample_closed_curve(leg_l_ctrl, sharp_indices={5, 8}, subdiv=6)
    leg_r_ctrl = [(138, 142), (158, 133), (172, 140), (175, 154), (168, 162), (178, 168), (170, 171), (161, 169), (154, 172), (134, 165)]
    leg_r_curve = sample_closed_curve(leg_r_ctrl, sharp_indices={5, 8}, subdiv=6)

    leg_back_l = (
        f'<g id="leg_back_l"><!-- pivot: 37.1,148.5 -->'
        f'<path d="{poly_path(leg_l_curve)}" fill="{c_moss["d"]}"/>'
        f'<path d="M35,134Q21,140 19,153Q25,143 44,139Z" fill="{c_moss["l"]}" opacity="0.72"/>'
        f'{poly_hatch(leg_l_curve, 52, 3.8, "all", INK, 0.45, 0.9, 2.5, 12)}'
        f'{boiling_Loop_stroke(leg_l_curve, 2.8, 0.25, 13)}'
        f'</g>'
    )
    leg_back_r = (
        f'<g id="leg_back_r"><!-- pivot: 154.9,148.5 -->'
        f'<path d="{poly_path(leg_r_curve)}" fill="{c_moss["d"]}"/>'
        f'<path d="M156,135Q171,142 173,155Q166,144 148,140Z" fill="{c_moss["c"]}" opacity="0.65"/>'
        f'{poly_hatch(leg_r_curve, 58, 3.6, "all", INK, 0.52, 0.95, 2.5, 22)}'
        f'{boiling_Loop_stroke(leg_r_curve, 2.8, 0.25, 23)}'
        f'</g>'
    )

    body_ctrl = [
        (95, 62), (106, 44), (129, 39), (148, 51), (146, 75),
        (158, 102), (161, 134), (146, 163), (118, 171), (74, 171),
        (45, 162), (33, 133), (37, 100), (46, 77), (43, 55),
        (62, 43), (84, 48),
    ]
    body_curve = sample_closed_curve(body_ctrl, sharp_indices={0, 4, 13}, subdiv=6)
    body_dark_ctrl = [
        (144, 76), (157, 102), (160, 134), (145, 162), (116, 170), (74, 170), (54, 164),
        (88, 158), (124, 142), (141, 112), (138, 82)
    ]
    body_dark_curve = sample_closed_curve(body_dark_ctrl, subdiv=5)
    # 沿左上外輪廓內側提取冷色輪廓光點
    cold_rim_pts = body_curve[int(len(body_curve) * 0.60):int(len(body_curve) * 0.96)]
    dorsal_seam = [(95, 63), (96, 82), (94, 96)]

    body_shapes = (
        f'<path d="{poly_path(body_curve)}" fill="{c_moss["c"]}"/>'
        f'<path d="{poly_path(body_dark_curve)}" fill="{c_moss["d"]}" opacity="0.88"/>'
        f'<path d="M112,169Q144,164 156,135Q152,158 124,168Z" fill="{c_moss["deep"]}" opacity="0.82"/>'
        f'{poly_hatch(body_curve, 52, 3.8, "br", INK, 0.45, 0.92, 3.2, 33)}'
        f'{poly_hatch(body_curve, 126, 4.6, "br", INK, 0.34, 0.85, 3.5, 34)}'
        f'<path d="{tapered_stroke(cold_rim_pts, 2.6, 0.4, 0.15, 35)}" stroke="{c_moss["l"]}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity="0.94"/>'
        f'{stitch_marks(dorsal_seam, 3.6, True, INK, 1.15, 36)}'
        f'{boiling_Loop_stroke(body_curve, 3.1, 0.28, 37)}'
    )

    belly_ctrl = [
        (96, 108), (118, 111), (132, 125), (134, 145),
        (121, 161), (96, 165), (71, 161), (58, 145),
        (61, 124), (75, 111)
    ]
    belly_curve = sample_closed_curve(belly_ctrl, subdiv=6)
    patch_pts = [(112, 142), (127, 139), (129, 153), (114, 156)]
    belly_group = (
        f'<g id="belly"><!-- pivot: 96,135.7 -->'
        f'<path d="{poly_path(belly_curve)}" fill="{c_parch["c"]}"/>'
        f'<path d="M64,146Q74,162 98,164Q122,162 132,144Q116,156 95,156Q75,156 64,146Z" fill="{c_parch["d"]}" opacity="0.85"/>'
        f'<path d="M74,115Q63,125 63,139Q68,125 84,116Z" fill="{c_parch["l"]}" opacity="0.88"/>'
        f'{poly_hatch(belly_curve, 48, 3.8, "br", INK, 0.36, 0.85, 3.0, 42)}'
        f'<path d="{poly_path(patch_pts)}" fill="{c_parch["d"]}" stroke="{INK}" stroke-width="1.3" stroke-linejoin="round"/>'
        f'{stitch_marks(patch_pts + [patch_pts[0]], 2.8, False, INK, 1.0, 43)}'
        f'{stitch_marks(belly_ctrl + [belly_ctrl[0]], 3.4, False, c_parch["deep"], 1.1, 44)}'
        f'{boiling_Loop_stroke(belly_curve, 2.5, 0.22, 45)}'
        f'</g>'
    )

    arm_l_ctrl = [(42, 118), (38, 138), (43, 158), (37, 167), (44, 170), (49, 164), (53, 171), (59, 168), (57, 160), (61, 164), (64, 158), (55, 136), (52, 118)]
    arm_l_curve = sample_closed_curve(arm_l_ctrl, sharp_indices={3, 6, 9}, subdiv=5)
    arm_r_ctrl = [(150, 118), (154, 138), (149, 158), (155, 167), (148, 170), (143, 164), (139, 171), (133, 168), (135, 160), (131, 164), (128, 158), (137, 136), (140, 118)]
    arm_r_curve = sample_closed_curve(arm_r_ctrl, sharp_indices={3, 6, 9}, subdiv=5)

    arm_l = (
        f'<g id="arm_l"><!-- pivot: 44.8,125.4 -->'
        f'<path d="{poly_path(arm_l_curve)}" fill="{c_moss["c"]}"/>'
        f'<path d="M48,122L54,158L44,166L41,140Z" fill="{c_moss["d"]}" opacity="0.72"/>'
        f'<path d="M42,122L40,148L43,156" stroke="{c_moss["l"]}" stroke-width="1.4" stroke-linecap="round" fill="none"/>'
        f'{stitch_marks([(41, 127), (53, 129)], 3.0, False, INK, 1.0, 52)}'
        f'{boiling_Loop_stroke(arm_l_curve, 2.4, 0.2, 53)}'
        f'</g>'
    )
    arm_r = (
        f'<g id="arm_r"><!-- pivot: 147.2,125.4 -->'
        f'<path d="{poly_path(arm_r_curve)}" fill="{c_moss["c"]}"/>'
        f'<path d="M142,122L136,158L148,166L151,140Z" fill="{c_moss["d"]}" opacity="0.82"/>'
        f'{stitch_marks([(139, 129), (151, 127)], 3.0, False, INK, 1.0, 62)}'
        f'{boiling_Loop_stroke(arm_r_curve, 2.4, 0.2, 63)}'
        f'</g>'
    )

    def button_eye(gid, pivot, cx, cy, r_sock, r_btn, tilt_deg):
        holes = [(-r_btn * 0.28, -r_btn * 0.28), (r_btn * 0.28, -r_btn * 0.28),
                 (r_btn * 0.28, r_btn * 0.28), (-r_btn * 0.28, r_btn * 0.28)]
        hole_svg = "".join(
            f'<circle cx="{fmt(cx + hx)}" cy="{fmt(cy + hy)}" r="{fmt(r_btn * 0.13)}" fill="{INK}"/>'
            for hx, hy in holes
        )
        thread_svg = (
            f'<path d="M{fmt(cx + holes[0][0])},{fmt(cy + holes[0][1])}L{fmt(cx + holes[2][0])},{fmt(cy + holes[2][1])}'
            f'M{fmt(cx + holes[1][0])},{fmt(cy + holes[1][1])}L{fmt(cx + holes[3][0])},{fmt(cy + holes[3][1])}" '
            f'stroke="{c_wine["c"]}" stroke-width="2.1" stroke-linecap="round"/>'
            f'<path d="M{fmt(cx + holes[0][0])},{fmt(cy + holes[0][1])}L{fmt(cx + holes[2][0])},{fmt(cy + holes[2][1])}" '
            f'stroke="{c_wine["l"]}" stroke-width="0.9" stroke-linecap="round"/>'
        )
        lashes = []
        for a in range(0, 360, 45):
            rad = math.radians(a + tilt_deg)
            x0 = cx + math.cos(rad) * (r_btn + 1.0)
            y0 = cy + math.sin(rad) * (r_btn + 1.0)
            x1 = cx + math.cos(rad) * (r_sock + 1.6)
            y1 = cy + math.sin(rad) * (r_sock + 1.6)
            lashes.append(f"M{fmt(x0)},{fmt(y0)}L{fmt(x1)},{fmt(y1)}")
        return (
            f'<g id="{gid}"><!-- pivot: {pivot} -->'
            f'<circle cx="{fmt(cx)}" cy="{fmt(cy)}" r="{fmt(r_sock)}" fill="{c_moss["deep"]}" stroke="{INK}" stroke-width="2.3"/>'
            f'<path d="{"".join(lashes)}" stroke="{INK}" stroke-width="1.15" stroke-linecap="round"/>'
            f'<circle cx="{fmt(cx)}" cy="{fmt(cy)}" r="{fmt(r_btn)}" fill="{c_parch["c"]}" stroke="{INK}" stroke-width="2.8"/>'
            f'<circle cx="{fmt(cx)}" cy="{fmt(cy)}" r="{fmt(r_btn * 0.82)}" fill="{c_moss["deep"]}" stroke="{c_parch["d"]}" stroke-width="1.3"/>'
            f'<path d="M{fmt(cx - r_btn*0.65)},{fmt(cy - r_btn*0.25)}A{fmt(r_btn*0.72)},{fmt(r_btn*0.72)} 0 0,1 {fmt(cx + r_btn*0.35)},{fmt(cy - r_btn*0.62)}" '
            f'stroke="{c_parch["l"]}" stroke-width="1.8" stroke-linecap="round" fill="none" opacity="0.88"/>'
            f'{hole_svg}{thread_svg}'
            f'<circle cx="{fmt(cx - r_btn*0.36)}" cy="{fmt(cy - r_btn*0.38)}" r="2.2" fill="{WHITE}"/>'
            f'<circle cx="{fmt(cx + r_btn*0.34)}" cy="{fmt(cy + r_btn*0.36)}" r="1.1" fill="{WHITE}" opacity="0.85"/>'
            f'</g>'
        )

    eye_l = button_eye("eye_l", "66.6,64", 66.6, 64.0, 20.5, 16.5, -12)
    eye_r = button_eye("eye_r", "126.7,61.4", 126.7, 61.4, 22.0, 17.8, 14)
    eyes = f'<g id="eyes"><!-- pivot: 96,62.7 -->{eye_l}{eye_r}</g>'

    cheeks = (
        f'<g id="cheeks"><!-- pivot: 96,97.3 -->'
        f'<ellipse cx="56" cy="96.5" rx="9.5" ry="4.8" transform="rotate(-8 56 96.5)" fill="{c_wine["c"]}" opacity="0.84"/>'
        f'<path d="M51,98.5L54,94.2M55.5,99L58.5,94.5M60,98.5L62.5,94.8" stroke="{c_wine["deep"]}" stroke-width="1.1" stroke-linecap="round"/>'
        f'<ellipse cx="136" cy="95.5" rx="9.8" ry="4.8" transform="rotate(8 136 95.5)" fill="{c_wine["c"]}" opacity="0.84"/>'
        f'<path d="M131,97.8L133.8,93.5M135.5,98.2L138.2,93.8M140,97.8L142.5,94.2" stroke="{c_wine["deep"]}" stroke-width="1.1" stroke-linecap="round"/>'
        f'</g>'
    )

    mouth_pts = [(71, 93), (83, 101.5), (96, 103.5), (110, 100.5), (122, 90.5)]
    mouth = (
        f'<g id="mouth"><!-- pivot: 96,101.1 -->'
        f'<path d="{tapered_stroke(mouth_pts, 2.7, 0.5, 0.2, 81)}" stroke="{INK}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/>'
        f'<path d="M68.5,95.5L73.5,90.5M78,97L76,103.5M88,99.5L87,106.5M98,100L98.5,107M108,97.5L110,104.5M119.5,88L124.5,93.5" '
        f'stroke="{INK}" stroke-width="1.35" stroke-linecap="round" fill="none"/>'
        f'</g>'
    )

    face_hurt = (
        f'<g id="face_hurt" opacity="0"><!-- pivot: 96,101.1 -->'
        f'<ellipse cx="96" cy="101.5" rx="9.5" ry="7.8" fill="{c_moss["deep"]}" stroke="{INK}" stroke-width="2.4"/>'
        f'<ellipse cx="96" cy="103.2" rx="6.2" ry="4.2" fill="{c_wine["d"]}"/>'
        f'<path d="M89,95L91,99M96,93.5L96,98M103,95L101,99M90,107.5L92,104M96,109L96,105M102,107.5L100,104" '
        f'stroke="{c_parch["c"]}" stroke-width="1.2" stroke-linecap="round"/>'
        f'</g>'
    )

    head = f'<g id="head"><!-- pivot: 96,96 -->{eyes}{cheeks}{mouth}{face_hurt}</g>'

    static_patch = film_scratch_patch(90.2, 117.8, [
        (48.0, 134.0, 16.0, 20.0),
        (142.0, 96.0, 15.0, 22.0),
    ])

    shadow = shadow_group(96.0, 171.5, 62.0, 5.2, 96.0, 171.5)

    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" class="svg-froglet" viewBox="0 0 192 192" width="192" height="192">
<title>蛙仔 · 哥特</title>
<style>{css}</style>
{gothic_defs("frog", 192, 192)}
<g id="root"><!-- pivot: 96,192 -->
  {shadow}
  <g id="body" filter="url(#frog-grunge)"><!-- pivot: 96,166.4 -->
    {leg_back_l}
    {leg_back_r}
    {body_shapes}
    {belly_group}
    {arm_l}
    {arm_r}
    {head}
    {static_patch}
  </g>
</g>
</svg>
"""
    return svg


# ==============================================================================
# 2. 狐火 (monster_kitsune) - 192x192
# ==============================================================================
def build_kitsune():
    c_ochre = F["ochre"]
    c_parch = F["parchment"]
    c_amber = F["amber"]

    css = common_boil_css("svg-kitsune") + """
.svg-kitsune #root { transform-origin: 96px 192px; }
.svg-kitsune #shadow { transform-origin: 95.84px 174.8px; }
.svg-kitsune #body { transform-origin: 81.76px 172.24px; }
.svg-kitsune #tail { transform-origin: 118.88px 164.56px; }
.svg-kitsune #flame { transform-origin: 150.0px 46.8px; }
.svg-kitsune #flame_glow { transform-origin: 150.0px 36.56px; }
.svg-kitsune #ear_l { transform-origin: 57.44px 50.64px; }
.svg-kitsune #ear_r { transform-origin: 106.08px 50.64px; }
.svg-kitsune #paw_l { transform-origin: 70.24px 155.6px; }
.svg-kitsune #paw_r { transform-origin: 94.56px 155.6px; }
.svg-kitsune #head { transform-origin: 81.76px 85.2px; }
.svg-kitsune #eyes { transform-origin: 81.76px 72.4px; }
.svg-kitsune #eye_l { transform-origin: 61.28px 73.68px; }
.svg-kitsune #eye_r { transform-origin: 102.24px 73.68px; }
.svg-kitsune #cheeks { transform-origin: 81.76px 94.16px; }
.svg-kitsune #snout { transform-origin: 81.76px 92.88px; }
.svg-kitsune #mouth { transform-origin: 81.76px 98px; }
.svg-kitsune #sweat { transform-origin: 33.12px 54.48px; }
.svg-kitsune #face_hurt { transform-origin: 81.76px 100.56px; }
.svg-kitsune #static_patch { transform-origin: 108.64px 138.32px; }

@keyframes kitsune-idle-body {
  0%, 100% { transform: translate(0px, 0px) rotate(0deg) scale(1, 1); }
  30% { transform: translate(-0.6px, -1.5px) rotate(-0.9deg) scale(1.01, 0.992); }
  55% { transform: translate(0.3px, -2.3px) rotate(0.7deg) scale(1.015, 0.988); }
  80% { transform: translate(0.5px, -0.7px) rotate(1.0deg) scale(1.004, 0.996); }
}
@keyframes kitsune-idle-tail {
  0%, 100% { transform: rotate(0deg); }
  35% { transform: rotate(1.8deg); }
  65% { transform: rotate(2.8deg); }
  85% { transform: rotate(-0.8deg); }
}
@keyframes kitsune-idle-flame {
  0%, 100% { transform: scale(1, 1) rotate(0deg); }
  17% { transform: scale(1.09, 1.14) rotate(-4deg); }
  36% { transform: scale(0.93, 0.96) rotate(2deg); }
  58% { transform: scale(1.12, 1.06) rotate(-2.5deg); }
  79% { transform: scale(0.95, 1.04) rotate(3deg); }
}
@keyframes kitsune-idle-glow {
  0%, 100% { opacity: 0.88; transform: scale(1); }
  17% { opacity: 1; transform: scale(1.14); }
  36% { opacity: 0.62; transform: scale(0.88); }
  58% { opacity: 0.96; transform: scale(1.08); }
  79% { opacity: 0.7; transform: scale(0.94); }
}
@keyframes kitsune-idle-earl { 0%, 100% { transform: rotate(0deg); } 45% { transform: rotate(-2.2deg); } 80% { transform: rotate(0.8deg); } }
@keyframes kitsune-idle-earr { 0%, 100% { transform: rotate(0deg); } 45% { transform: rotate(2.2deg); } 80% { transform: rotate(-0.8deg); } }
@keyframes kitsune-idle-noise {
  0%, 100% { opacity: 0.92; }
  33% { opacity: 0.25; }
  66% { opacity: 0.78; }
}
.svg-kitsune:not([data-anim]) #body, .svg-kitsune[data-anim="idle"] #body { animation: kitsune-idle-body 1.9s steps(8, end) infinite; }
.svg-kitsune:not([data-anim]) #tail, .svg-kitsune[data-anim="idle"] #tail { animation: kitsune-idle-tail 1.9s steps(8, end) infinite; }
.svg-kitsune:not([data-anim]) #flame, .svg-kitsune[data-anim="idle"] #flame { animation: kitsune-idle-flame 0.92s steps(6, end) infinite; }
.svg-kitsune:not([data-anim]) #flame_glow, .svg-kitsune[data-anim="idle"] #flame_glow { animation: kitsune-idle-glow 0.92s linear infinite; }
.svg-kitsune:not([data-anim]) #ear_l, .svg-kitsune[data-anim="idle"] #ear_l { animation: kitsune-idle-earl 1.9s steps(6, end) infinite; }
.svg-kitsune:not([data-anim]) #ear_r, .svg-kitsune[data-anim="idle"] #ear_r { animation: kitsune-idle-earr 1.9s steps(6, end) infinite; }
.svg-kitsune:not([data-anim]) #static_patch, .svg-kitsune[data-anim="idle"] #static_patch { animation: kitsune-idle-noise 0.48s steps(3, end) infinite; }

@keyframes kitsune-hurt-root {
  0%, 100% { transform: translate(0px, 0px); }
  16% { transform: translate(-7px, 0px); }
  36% { transform: translate(5px, 0px); }
  56% { transform: translate(-4.5px, 0px); }
  76% { transform: translate(2.5px, 0px); }
}
@keyframes kitsune-hurt-show { 0%, 6%, 88%, 100% { opacity: 0; } 10%, 84% { opacity: 1; } }
@keyframes kitsune-hurt-hide { 0%, 6%, 88%, 100% { opacity: 1; } 10%, 84% { opacity: 0; } }
@keyframes kitsune-hurt-tail { 0%, 100% { transform: rotate(0deg); } 25% { transform: rotate(-6deg); } 60% { transform: rotate(3deg); } }
@keyframes kitsune-hurt-noise { 0%, 100% { transform: scale(1); opacity: 0.9; } 25%, 65% { transform: scale(1.18); opacity: 1; } }
.svg-kitsune[data-anim="hurt"] #root { animation: kitsune-hurt-root 0.65s steps(6, end) both; }
.svg-kitsune[data-anim="hurt"] #face_hurt { animation: kitsune-hurt-show 0.65s linear both; }
.svg-kitsune[data-anim="hurt"] #mouth { animation: kitsune-hurt-hide 0.65s linear both; }
.svg-kitsune[data-anim="hurt"] #tail { animation: kitsune-hurt-tail 0.65s ease-out both; }
.svg-kitsune[data-anim="hurt"] #static_patch { animation: kitsune-hurt-noise 0.65s steps(4, end) both; }

@keyframes kitsune-collect-root {
  0% { transform: translate(0px, 0px) rotate(0deg) scale(1); opacity: 1; }
  26% { transform: translate(0px, -6px) rotate(-8deg) scale(1.05); opacity: 1; }
  78% { transform: translate(38px, -68px) rotate(140deg) scale(0.16); opacity: 0.9; }
  100% { transform: translate(56px, -96px) rotate(200deg) scale(0.05); opacity: 0; }
}
@keyframes kitsune-collect-shadow { 0% { transform: scale(1); opacity: 1; } 80%, 100% { transform: scale(0.2); opacity: 0; } }
.svg-kitsune[data-anim="collect"] #root { animation: kitsune-collect-root 0.76s cubic-bezier(0.36, 0, 0.66, -0.56) both; }
.svg-kitsune[data-anim="collect"] #shadow { animation: kitsune-collect-shadow 0.76s ease-out both; }

@keyframes kitsune-scare-root {
  0% { transform: translate(0px, 0px) scale(1, 1); opacity: 1; }
  20% { transform: translate(0px, 5px) scale(1.06, 0.92); opacity: 1; }
  50% { transform: translate(-24px, -40px) scale(0.94, 1.08); opacity: 1; }
  100% { transform: translate(-88px, -78px) scale(0.85, 1.06); opacity: 0; }
}
.svg-kitsune[data-anim="scare"] #root { animation: kitsune-scare-root 0.75s ease-in both; }
.svg-kitsune[data-anim="scare"] #face_hurt { animation: kitsune-hurt-show 0.75s linear both; }
.svg-kitsune[data-anim="scare"] #mouth { animation: kitsune-hurt-hide 0.75s linear both; }
.svg-kitsune[data-anim="scare"] #shadow { animation: kitsune-collect-shadow 0.75s ease-out both; }

@keyframes kitsune-act-body {
  0%, 100% { transform: translate(0px, 0px) scale(1, 1); }
  22% { transform: translate(1.5px, 3.5px) scale(1.03, 0.92); }
  50% { transform: translate(-6.5px, -3px) scale(1.01, 1.02); }
  76% { transform: translate(1.2px, 1.8px) scale(1.02, 0.98); }
}
@keyframes kitsune-act-tail {
  0%, 100% { transform: rotate(0deg); }
  22% { transform: rotate(-5deg); }
  50% { transform: rotate(8deg); }
}
@keyframes kitsune-act-flame {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.16); }
}
.svg-kitsune[data-anim="act"] #body { animation: kitsune-act-body 0.75s steps(7, end) both; }
.svg-kitsune[data-anim="act"] #tail { animation: kitsune-act-tail 0.75s steps(7, end) both; }
.svg-kitsune[data-anim="act"] #flame { animation: kitsune-act-flame 0.75s ease-out both; }

@keyframes kitsune-dodge-body {
  0%, 100% { transform: translate(0px, 0px) scale(1, 1); }
  18% { transform: translate(0px, 4.5px) scale(1.04, 0.91); }
  52% { transform: translate(0px, -5.0px) scale(0.98, 1.02); }
  84% { transform: translate(0px, 2.8px) scale(1.02, 0.96); }
}
@keyframes kitsune-dodge-shadow {
  0%, 100% { transform: scale(1); opacity: 1; }
  52% { transform: scale(0.48); opacity: 0.35; }
}
@keyframes kitsune-dodge-tail {
  0%, 100% { transform: rotate(0deg); }
  52% { transform: rotate(-8deg); }
  84% { transform: rotate(3deg); }
}
@keyframes kitsune-dodge-earl {
  0%, 100% { transform: rotate(0deg); }
  18% { transform: rotate(4deg); }
  52% { transform: rotate(-12deg); }
  84% { transform: rotate(2deg); }
}
@keyframes kitsune-dodge-earr {
  0%, 100% { transform: rotate(0deg); }
  18% { transform: rotate(-4deg); }
  52% { transform: rotate(12deg); }
  84% { transform: rotate(-2deg); }
}
.svg-kitsune[data-anim="dodge"] #body { animation: kitsune-dodge-body 0.76s ease-in-out both; }
.svg-kitsune[data-anim="dodge"] #shadow { animation: kitsune-dodge-shadow 0.76s ease-in-out both; }
.svg-kitsune[data-anim="dodge"] #tail { animation: kitsune-dodge-tail 0.76s ease-in-out both; }
.svg-kitsune[data-anim="dodge"] #ear_l { animation: kitsune-dodge-earl 0.76s ease-in-out both; }
.svg-kitsune[data-anim="dodge"] #ear_r { animation: kitsune-dodge-earr 0.76s ease-in-out both; }
"""

    extra_defs = f"""
  <radialGradient id="kitsune-amber-glow" cx="50%" cy="50%" r="50%">
    <stop offset="0%" stop-color="{c_amber['l']}" stop-opacity="0.88"/>
    <stop offset="55%" stop-color="{c_amber['c']}" stop-opacity="0.38"/>
    <stop offset="100%" stop-color="{c_amber['d']}" stop-opacity="0"/>
  </radialGradient>
"""

    tail_ctrl = [
        (109, 152), (120, 128), (124, 98), (126, 70), (136, 51),
        (150, 41), (164, 56), (171, 86), (176, 118), (169, 148),
        (152, 168), (122, 171),
    ]
    tail_curve = sample_closed_curve(tail_ctrl, sharp_indices={5}, subdiv=6)
    tail_tip_pts = [
        (126, 72), (136, 51), (150, 41), (164, 56), (170, 82),
        (160, 74), (152, 79), (144, 71), (135, 78)
    ]

    # 尾尖三叉哥特鬼火 flame（保留尖銳火舌角點）
    flame_ctrl = [
        (150, 46), (140, 41), (138, 31), (142, 23), (145, 31),
        (150, 16), (155, 29), (159, 22), (161, 33), (158, 42)
    ]
    flame_curve = sample_closed_curve(flame_ctrl, sharp_indices={3, 5, 7}, subdiv=5)
    flame_inner = [
        (150, 44), (143, 39), (143, 30), (150, 21), (156, 31), (155, 40)
    ]

    flame_group = (
        f'<g id="flame"><!-- pivot: 150,46.8 -->'
        f'<g id="flame_glow"><!-- pivot: 150,36.6 -->'
        f'<ellipse cx="150" cy="33" rx="18" ry="18" fill="url(#kitsune-amber-glow)"/>'
        f'</g>'
        f'<path d="{poly_path(flame_curve)}" fill="{c_amber["c"]}"/>'
        f'<path d="{poly_path(flame_inner)}" fill="{c_amber["l"]}"/>'
        f'<ellipse cx="150" cy="36.5" rx="3.2" ry="5.5" fill="{WHITE}"/>'
        f'{boiling_Loop_stroke(flame_curve, 2.1, 0.18, 103)}'
        f'</g>'
    )

    tail_group = (
        f'<g id="tail"><!-- pivot: 118.9,164.6 -->'
        f'<path d="{poly_path(tail_curve)}" fill="{c_ochre["c"]}"/>'
        f'<path d="M150,43Q172,82 174,122Q168,158 134,170Q156,148 158,114Q158,78 150,43Z" fill="{c_ochre["d"]}" opacity="0.88"/>'
        f'<path d="{poly_path(tail_tip_pts)}" fill="{c_parch["c"]}"/>'
        f'<path d="M136,52L150,42L144,64Z" fill="{c_parch["l"]}" opacity="0.85"/>'
        f'{poly_hatch(tail_curve, 58, 3.8, "br", INK, 0.46, 0.92, 3.0, 112)}'
        f'{poly_hatch(tail_curve, 126, 4.5, "br", INK, 0.34, 0.85, 3.2, 113)}'
        f'{stitch_marks([(126, 72), (136, 77), (145, 71), (153, 78), (168, 79)], 3.2, True, INK, 1.1, 114)}'
        f'<path d="M142,102Q146,126 138,146M156,96Q161,122 152,148" stroke="{INK}" stroke-width="1.2" stroke-linecap="round" fill="none" opacity="0.7"/>'
        f'{boiling_Loop_stroke(tail_curve, 3.0, 0.25, 115)}'
        f'{flame_group}'
        f'</g>'
    )

    ear_l_ctrl = [(41, 56), (44, 29), (49, 13), (64, 29), (74, 49)]
    ear_l_curve = sample_closed_curve(ear_l_ctrl, sharp_indices={0, 2, 4}, subdiv=5)
    ear_l_tip = [(44.5, 29), (49, 13), (61, 26), (53, 31)]

    ear_r_ctrl = [(92, 49), (103, 28), (118, 13), (123, 30), (125, 57)]
    ear_r_curve = sample_closed_curve(ear_r_ctrl, sharp_indices={0, 2, 4}, subdiv=5)
    ear_r_tip = [(104, 27), (118, 13), (122.5, 30), (112, 31)]

    ear_l = (
        f'<g id="ear_l"><!-- pivot: 57.4,50.6 -->'
        f'<path d="{poly_path(ear_l_curve)}" fill="{c_ochre["c"]}"/>'
        f'<path d="{poly_path(ear_l_tip)}" fill="{c_ochre["deep"]}"/>'
        f'<path d="M58,47L63,29L71,46Z" fill="{c_parch["c"]}"/>'
        f'<path d="M44.5,29L49,14.5L53,24" stroke="{c_parch["l"]}" stroke-width="1.4" stroke-linecap="round" fill="none"/>'
        f'{stitch_marks([(43, 36), (52, 38)], 3.2, True, INK, 1.15, 121)}'
        f'{boiling_Loop_stroke(ear_l_curve, 2.7, 0.2, 122)}'
        f'</g>'
    )
    ear_r = (
        f'<g id="ear_r"><!-- pivot: 106.1,50.6 -->'
        f'<path d="{poly_path(ear_r_curve)}" fill="{c_ochre["c"]}"/>'
        f'<path d="{poly_path(ear_r_tip)}" fill="{c_ochre["deep"]}"/>'
        f'<path d="M95,46L102,29L108,47Z" fill="{c_parch["c"]}"/>'
        f'{poly_hatch(ear_r_curve, 55, 3.6, "all", INK, 0.42, 0.85, 2.5, 123)}'
        f'{boiling_Loop_stroke(ear_r_curve, 2.7, 0.2, 124)}'
        f'</g>'
    )

    head_body_ctrl = [
        (54, 46), (82, 42), (112, 46),
        (124, 68), (141, 88), (115, 102),
        (117, 136), (114, 164), (96, 173), (68, 173),
        (51, 162), (55, 134), (51, 102),
        (22, 88), (40, 68),
    ]
    head_body_curve = sample_closed_curve(head_body_ctrl, sharp_indices={4, 5, 12, 13}, subdiv=6)
    chest_fur_pts = [
        (23, 88), (48, 80), (68, 89), (82, 88), (96, 89), (116, 80), (140, 88),
        (114, 101), (105, 118), (96, 136), (82, 152), (69, 136), (60, 118), (51, 101)
    ]
    cold_rim_fox = head_body_curve[int(len(head_body_curve) * 0.70):] + head_body_curve[:int(len(head_body_curve) * 0.08)]

    body_main = (
        f'<path d="{poly_path(head_body_curve)}" fill="{c_ochre["c"]}"/>'
        f'<path d="M98,102L116,102L114,162L94,172L82,172Q102,152 98,102Z" fill="{c_ochre["d"]}" opacity="0.88"/>'
        f'<path d="{poly_path(chest_fur_pts)}" fill="{c_parch["c"]}"/>'
        f'<path d="M82,152L96,134L106,116L114,101L96,108L82,140Z" fill="{c_parch["d"]}" opacity="0.72"/>'
        f'{poly_hatch(head_body_curve, 52, 3.8, "br", INK, 0.45, 0.9, 3.0, 132)}'
        f'{poly_hatch(head_body_curve, 125, 4.5, "br", INK, 0.34, 0.85, 3.2, 133)}'
        f'<path d="{tapered_stroke(cold_rim_fox, 2.4, 0.4, 0.15, 134)}" stroke="{c_parch["l"]}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity="0.92"/>'
        f'{stitch_marks([(60, 118), (69, 136), (82, 150), (96, 136), (105, 118)], 3.0, False, INK, 1.05, 135)}'
        f'<path d="M76,53L76,60M82,51L82,59M88,53L88,60" stroke="{c_ochre["deep"]}" stroke-width="2.2" stroke-linecap="round"/>'
        f'{boiling_Loop_stroke(head_body_curve, 3.0, 0.25, 136)}'
    )

    paw_l_ctrl = [(63, 138), (77, 138), (78, 171), (70, 175), (62, 171)]
    paw_l_curve = sample_closed_curve(paw_l_ctrl, subdiv=5)
    paw_r_ctrl = [(87, 138), (101, 138), (102, 171), (94, 175), (86, 171)]
    paw_r_curve = sample_closed_curve(paw_r_ctrl, subdiv=5)

    paw_l = (
        f'<g id="paw_l"><!-- pivot: 70.2,155.6 -->'
        f'<path d="{poly_path(paw_l_curve)}" fill="{c_ochre["d"]}"/>'
        f'<path d="M64,140L64,168L68,172L68,142Z" fill="{c_ochre["c"]}" opacity="0.75"/>'
        f'<path d="M63,144L77,144" stroke="{INK}" stroke-width="1.1" stroke-dasharray="2 2"/>'
        f'<path d="M67.5,166L67.5,174M72.5,166L72.5,174" stroke="{INK}" stroke-width="1.4" stroke-linecap="round"/>'
        f'{boiling_Loop_stroke(paw_l_curve, 2.4, 0.2, 142)}'
        f'</g>'
    )
    paw_r = (
        f'<g id="paw_r"><!-- pivot: 94.6,155.6 -->'
        f'<path d="{poly_path(paw_r_curve)}" fill="{c_ochre["d"]}"/>'
        f'<path d="M95,140L101,140L101,170L95,173Z" fill="{c_ochre["deep"]}" opacity="0.55"/>'
        f'<path d="M87,144L101,144" stroke="{INK}" stroke-width="1.1" stroke-dasharray="2 2"/>'
        f'<path d="M91.5,166L91.5,174M96.5,166L96.5,174" stroke="{INK}" stroke-width="1.4" stroke-linecap="round"/>'
        f'{boiling_Loop_stroke(paw_r_curve, 2.4, 0.2, 144)}'
        f'</g>'
    )

    def fox_eye(gid, pivot, cx, cy, is_left):
        s = -1 if is_left else 1
        sock = [
            (cx - s * 13.5, cy + 2),
            (cx - s * 5, cy - 9.5),
            (cx + s * 12.5, cy - 6),
            (cx + s * 14, cy + 4),
            (cx + s * 3, cy + 9.5),
        ]
        sock_c = sample_closed_curve(sock, sharp_indices={0, 3}, subdiv=5)
        sclera = [
            (cx - s * 11.2, cy + 1.5),
            (cx - s * 4, cy - 7.2),
            (cx + s * 10.2, cy - 4.5),
            (cx + s * 11, cy + 3),
            (cx + s * 2, cy + 7.2),
        ]
        sclera_c = sample_closed_curve(sclera, sharp_indices={0, 3}, subdiv=5)
        return (
            f'<g id="{gid}"><!-- pivot: {pivot} -->'
            f'<path d="{poly_path(sock_c)}" fill="{c_ochre["deep"]}" stroke="{INK}" stroke-width="2.0"/>'
            f'<path d="{poly_path(sclera_c)}" fill="{WHITE}" stroke="{INK}" stroke-width="2.2"/>'
            f'<ellipse cx="{fmt(cx + s*0.5)}" cy="{fmt(cy)}" rx="6.8" ry="6.2" fill="{c_amber["c"]}" stroke="{c_amber["d"]}" stroke-width="1.2"/>'
            f'<ellipse cx="{fmt(cx + s*0.5)}" cy="{fmt(cy)}" rx="4.5" ry="5.0" fill="{c_amber["l"]}"/>'
            f'<path d="M{fmt(cx + s*0.5)},{fmt(cy - 6.2)}Q{fmt(cx + s*2.1)},{fmt(cy)} {fmt(cx + s*0.5)},{fmt(cy + 6.2)}Q{fmt(cx - s*1.1)},{fmt(cy)} {fmt(cx + s*0.5)},{fmt(cy - 6.2)}Z" fill="{INK}"/>'
            f'<circle cx="{fmt(cx - s*1.8)}" cy="{fmt(cy - 2.4)}" r="1.6" fill="{WHITE}"/>'
            f'<path d="M{fmt(cx - s*11)},{fmt(cy + 1)}L{fmt(cx - s*15)},{fmt(cy - 2)}M{fmt(cx - s*10)},{fmt(cy + 4)}L{fmt(cx - s*14)},{fmt(cy + 3)}" stroke="{INK}" stroke-width="1.3" stroke-linecap="round"/>'
            f'</g>'
        )

    eye_l = fox_eye("eye_l", "61.3,73.7", 61.3, 73.7, True)
    eye_r = fox_eye("eye_r", "102.2,73.7", 102.2, 73.7, False)
    eyes = f'<g id="eyes"><!-- pivot: 81.8,72.4 -->{eye_l}{eye_r}</g>'

    cheeks = (
        f'<g id="cheeks"><!-- pivot: 81.8,94.2 -->'
        f'<ellipse cx="48" cy="91.5" rx="7.5" ry="3.6" fill="{c_amber["d"]}" opacity="0.65"/>'
        f'<path d="M44,93L46.5,89.8M48,93.2L50.5,90M52,93L54,90.2" stroke="{INK}" stroke-width="1.0" stroke-linecap="round"/>'
        f'<ellipse cx="115.5" cy="91.5" rx="7.5" ry="3.6" fill="{c_amber["d"]}" opacity="0.65"/>'
        f'<path d="M111.5,93L114,89.8M115.5,93.2L118,90M119.5,93L121.5,90.2" stroke="{INK}" stroke-width="1.0" stroke-linecap="round"/>'
        f'</g>'
    )

    snout = (
        f'<g id="snout"><!-- pivot: 81.8,92.9 -->'
        f'<ellipse cx="81.8" cy="92.5" rx="13.5" ry="8.5" fill="{c_parch["l"]}" stroke="{INK}" stroke-width="1.5"/>'
        f'<path d="M76.5,87.5L87,87.5L81.8,93.2Z" fill="{c_ochre["deep"]}" stroke="{INK}" stroke-width="1.8" stroke-linejoin="round"/>'
        f'<circle cx="80.2" cy="88.8" r="1.2" fill="{WHITE}"/>'
        f'</g>'
    )

    mouth = (
        f'<g id="mouth"><!-- pivot: 81.8,98 -->'
        f'<path d="M71.5,94.5L78,99.5L81.8,95.5L85.8,99.5L92.5,93.5" stroke="{INK}" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" fill="none"/>'
        f'<path d="M74,96.5L75.5,100.5M89.5,96L88,100.2" stroke="{WHITE}" stroke-width="1.3" stroke-linecap="round"/>'
        f'<path d="M74,96.5L75.5,100.5M89.5,96L88,100.2" stroke="{INK}" stroke-width="0.9" stroke-linecap="round" fill="none"/>'
        f'</g>'
    )

    sweat = (
        f'<g id="sweat"><!-- pivot: 33.1,54.5 -->'
        f'<path d="M33.1,46.5L29.5,55.5A3.8,3.8 0 1,0 36.7,55.5Z" fill="{c_parch["l"]}" stroke="{INK}" stroke-width="1.8" stroke-linejoin="round"/>'
        f'<circle cx="32.2" cy="55.2" r="1.1" fill="{WHITE}"/>'
        f'</g>'
    )

    face_hurt = (
        f'<g id="face_hurt" opacity="0"><!-- pivot: 81.8,100.6 -->'
        f'<polygon points="81.8,93.5 87.5,99.5 84.5,105.5 79.0,105.5 76.0,99.5" fill="{c_ochre["deep"]}" stroke="{INK}" stroke-width="2.0" stroke-linejoin="round"/>'
        f'<path d="M78,97L85.5,97M78.5,102.5L85,102.5" stroke="{WHITE}" stroke-width="1.1" stroke-linecap="round"/>'
        f'</g>'
    )

    head = f'<g id="head"><!-- pivot: 81.8,85.2 -->{eyes}{cheeks}{snout}{mouth}{sweat}{face_hurt}</g>'

    static_patch = film_scratch_patch(108.6, 138.3, [
        (64.0, 152.0, 14.0, 16.0),
        (154.0, 124.0, 15.0, 20.0),
    ])

    shadow = shadow_group(95.8, 174.8, 60.0, 5.0, 95.8, 174.8)

    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" class="svg-kitsune" viewBox="0 0 192 192" width="192" height="192">
<title>狐火 · 哥特</title>
<style>{css}</style>
{gothic_defs("kitsune", 192, 192, extra_defs)}
<g id="root"><!-- pivot: 96,192 -->
  {shadow}
  <g id="body" filter="url(#kitsune-grunge)"><!-- pivot: 81.8,172.2 -->
    {tail_group}
    {ear_l}
    {ear_r}
    {body_main}
    {paw_l}
    {paw_r}
    {head}
    {static_patch}
  </g>
</g>
</svg>
"""
    return svg


# ==============================================================================
# 3. 鏡靈 (monster_mirrorimp) - 192x192
# ==============================================================================
def build_mirrorimp():
    c_brass = F["brass"]
    c_slate = F["slate"]
    c_wine = F["wine"]

    css = common_boil_css("svg-mirr") + """
.svg-mirr #root { transform-origin: 96px 192px; }
.svg-mirr #shadow { transform-origin: 94.1px 174.1px; }
.svg-mirr #body { transform-origin: 96px 171.5px; }
.svg-mirr #handle { transform-origin: 96px 119px; }
.svg-mirr #mirror_face { transform-origin: 96px 73px; }
.svg-mirr #head { transform-origin: 96px 73px; }
.svg-mirr #eyes { transform-origin: 93.4px 65.3px; }
.svg-mirr #eye_mono { transform-origin: 93.4px 65.3px; }
.svg-mirr #brows { transform-origin: 93.4px 43.5px; }
.svg-mirr #cheeks { transform-origin: 93.5px 90.9px; }
.svg-mirr #mouth { transform-origin: 92.2px 93.4px; }
.svg-mirr #face_hurt { transform-origin: 93.4px 94.7px; }
.svg-mirr #flash_light { transform-origin: 96px 73px; }
.svg-mirr #sheen { transform-origin: 96px 73px; }
.svg-mirr #crest { transform-origin: 96px 21.8px; }
.svg-mirr #arm_r { transform-origin: 140.8px 70.4px; }
.svg-mirr #arm_l { transform-origin: 51.2px 81.9px; }
.svg-mirr #static_patch { transform-origin: 99.4px 74px; }
.svg-mirr .mirr-flash_light0 { transform-origin: 96px 73px; }

@keyframes mirr-idle-body {
  0%, 100% { transform: translate(0px, 0px) rotate(0deg) scale(1, 1); }
  25% { transform: translate(-0.7px, -1.8px) rotate(-1.3deg) scale(1.008, 1.008); }
  52% { transform: translate(0.5px, -3.2px) rotate(1.1deg) scale(1.014, 1.014); }
  78% { transform: translate(0.4px, -1.0px) rotate(1.4deg) scale(1.004, 1.004); }
}
@keyframes mirr-idle-eye {
  0%, 100% { transform: translate(0px, 0px) scale(1); }
  30% { transform: translate(-1.2px, 0.6px) scale(0.97); }
  62% { transform: translate(1.4px, -0.8px) scale(1.03); }
  82% { transform: translate(0px, 0px) scale(1); }
}
@keyframes mirr-idle-sheen-o {
  0%, 100% { opacity: 0.92; }
  45% { opacity: 0.35; }
  75% { opacity: 0.78; }
}
@keyframes mirr-idle-crest {
  0%, 100% { transform: rotate(0deg); }
  50% { transform: rotate(2.2deg); }
}
@keyframes mirr-idle-arm_l {
  0%, 100% { transform: rotate(0deg); }
  50% { transform: rotate(-2.5deg); }
}
@keyframes mirr-idle-arm_r {
  0%, 100% { transform: rotate(0deg); }
  50% { transform: rotate(2.5deg); }
}
@keyframes mirr-idle-noise {
  0%, 100% { opacity: 0.9; }
  33% { opacity: 0.25; }
  66% { opacity: 0.75; }
}
.svg-mirr:not([data-anim]) #body, .svg-mirr[data-anim="idle"] #body { animation: mirr-idle-body 2.0s steps(8, end) infinite; }
.svg-mirr:not([data-anim]) #eye_mono, .svg-mirr[data-anim="idle"] #eye_mono { animation: mirr-idle-eye 2.5s steps(5, end) infinite; }
.svg-mirr:not([data-anim]) #sheen, .svg-mirr[data-anim="idle"] #sheen { animation: mirr-idle-sheen-o 1.8s linear infinite; }
.svg-mirr:not([data-anim]) #crest, .svg-mirr[data-anim="idle"] #crest { animation: mirr-idle-crest 2.0s steps(6, end) infinite; }
.svg-mirr:not([data-anim]) #arm_l, .svg-mirr[data-anim="idle"] #arm_l { animation: mirr-idle-arm_l 2.0s steps(6, end) infinite; }
.svg-mirr:not([data-anim]) #arm_r, .svg-mirr[data-anim="idle"] #arm_r { animation: mirr-idle-arm_r 2.0s steps(6, end) 0.25s infinite; }
.svg-mirr:not([data-anim]) #static_patch, .svg-mirr[data-anim="idle"] #static_patch { animation: mirr-idle-noise 0.48s steps(3, end) infinite; }

@keyframes mirr-hurt-root {
  0%, 100% { transform: translate(0px, 0px); }
  16% { transform: translate(-7px, 0px); }
  35% { transform: translate(6px, 0px); }
  55% { transform: translate(-4px, 0px); }
  75% { transform: translate(2px, 0px); }
}
@keyframes mirr-hurt-body {
  0%, 48%, 100% { transform: scale(1, 1); }
  14% { transform: scale(0.95, 1.04); }
}
@keyframes mirr-hurt-show { 0%, 6%, 88%, 100% { opacity: 0; } 10%, 84% { opacity: 1; } }
@keyframes mirr-hurt-hide { 0%, 6%, 88%, 100% { opacity: 1; } 10%, 84% { opacity: 0; } }
@keyframes mirr-hurt-noise {
  0%, 100% { transform: scale(1, 1); opacity: 0.9; }
  16%, 80% { transform: scale(1.26, 1.26); opacity: 1; }
}
.svg-mirr[data-anim="hurt"] #root { animation: mirr-hurt-root 0.62s steps(6, end) both; }
.svg-mirr[data-anim="hurt"] #body { animation: mirr-hurt-body 0.62s ease-out both; }
.svg-mirr[data-anim="hurt"] #face_hurt { animation: mirr-hurt-show 0.62s linear both; }
.svg-mirr[data-anim="hurt"] #mouth { animation: mirr-hurt-hide 0.62s linear both; }
.svg-mirr[data-anim="hurt"] #static_patch { animation: mirr-hurt-noise 0.62s steps(4, end) both; }

@keyframes mirr-collect-root {
  0% { transform: translate(0px, 0px) rotate(0deg) scale(1); opacity: 1; }
  26% { transform: translate(0px, 4px) rotate(-6deg) scale(1.04); opacity: 1; }
  78% { transform: translate(42px, -72px) rotate(150deg) scale(0.15); opacity: 0.88; }
  100% { transform: translate(64px, -96px) rotate(200deg) scale(0.05); opacity: 0; }
}
@keyframes mirr-collect-shadow {
  0% { transform: scale(1, 1); opacity: 1; }
  45%, 100% { transform: scale(0.3, 0.3); opacity: 0; }
}
.svg-mirr[data-anim="collect"] #root { animation: mirr-collect-root 0.76s cubic-bezier(0.36, 0, 0.66, -0.56) both; }
.svg-mirr[data-anim="collect"] #shadow { animation: mirr-collect-shadow 0.76s ease-out both; }

@keyframes mirr-scare-root {
  0% { transform: translate(0px, 0px); opacity: 1; }
  17% { transform: translate(0px, 4px); opacity: 1; }
  35% { transform: translate(34px, -26px); opacity: 1; }
  52% { transform: translate(70px, 0px); opacity: 1; }
  72% { transform: translate(118px, -24px); opacity: 0.9; }
  100% { transform: translate(168px, 0px); opacity: 0; }
}
@keyframes mirr-scare-body {
  0%, 100% { transform: scale(1, 1); }
  17% { transform: scale(1.1, 0.88); }
  35% { transform: scale(0.92, 1.08); }
  52% { transform: scale(1.06, 0.94); }
  72% { transform: scale(0.94, 1.05); }
}
.svg-mirr[data-anim="scare"] #root { animation: mirr-scare-root 0.8s linear both; }
.svg-mirr[data-anim="scare"] #body { animation: mirr-scare-body 0.8s linear both; }
.svg-mirr[data-anim="scare"] #face_hurt { animation: mirr-hurt-show 0.8s linear both; }
.svg-mirr[data-anim="scare"] #mouth { animation: mirr-hurt-hide 0.8s linear both; }
.svg-mirr[data-anim="scare"] #shadow { animation: mirr-collect-shadow 0.8s ease-out both; }

@keyframes mirr-reflect-flash-o {
  0%, 100% { opacity: 0; }
  10%, 66% { opacity: 0.95; }
  85% { opacity: 0; }
}
@keyframes mirr-reflect-flash-move {
  0% { transform: translate(-22px, 0px); }
  75%, 100% { transform: translate(22px, 0px); }
}
@keyframes mirr-reflect-sheen {
  0%, 100% { transform: scale(1, 1); }
  28% { transform: scale(1.25, 1.25); }
}
@keyframes mirr-reflect-face {
  0%, 100% { transform: scale(1, 1); }
  22% { transform: scale(1.04, 1.04); }
}
@keyframes mirr-reflect-armr {
  0%, 100% { transform: rotate(0deg); }
  22% { transform: rotate(-9deg); }
}
.svg-mirr[data-anim="reflect"] #flash_light { animation: mirr-reflect-flash-o 0.6s linear both; }
.svg-mirr[data-anim="reflect"] .mirr-flash_light0 { animation: mirr-reflect-flash-move 0.6s ease-in-out both; }
.svg-mirr[data-anim="reflect"] #sheen { animation: mirr-reflect-sheen 0.6s ease-out both; }
.svg-mirr[data-anim="reflect"] #mirror_face { animation: mirr-reflect-face 0.6s ease-out both; }
.svg-mirr[data-anim="reflect"] #arm_r { animation: mirr-reflect-armr 0.6s ease-out both; }
"""

    handle_pts = [(88, 114), (104, 114), (102, 156), (90, 156)]
    handle_collar = [(84, 118), (108, 118), (105, 126), (87, 126)]
    handle_group = (
        f'<g id="handle"><!-- pivot: 96,119 -->'
        f'<path d="{poly_path(handle_pts)}" fill="{c_brass["c"]}"/>'
        f'<path d="M96,114L104,114L102,156L96,156Z" fill="{c_brass["d"]}"/>'
        f'<path d="M90,116L90,154" stroke="{c_brass["l"]}" stroke-width="1.6" stroke-linecap="round"/>'
        f'{boiling_Loop_stroke(handle_pts, 2.5, 0.18, 201)}'
        f'<path d="{poly_path(handle_collar)}" fill="{c_brass["l"]}" stroke="{INK}" stroke-width="2.0" stroke-linejoin="round"/>'
        f'<circle cx="96" cy="122" r="2.6" fill="{c_wine["c"]}" stroke="{INK}" stroke-width="1.2"/>'
        f'<circle cx="96" cy="161" r="9.5" fill="{c_brass["c"]}" stroke="{INK}" stroke-width="2.6"/>'
        f'<path d="M96,152A9.5,9.5 0 0,1 96,170A7.5,9.5 0 0,0 96,152Z" fill="{c_brass["d"]}"/>'
        f'<circle cx="93" cy="158" r="1.8" fill="{c_brass["l"]}"/>'
        f'</g>'
    )

    frame_ctrl = [
        (96, 19), (118, 25), (135, 42), (143, 66), (141, 90), (128, 110),
        (110, 121), (96, 123), (82, 121), (64, 110), (51, 90), (49, 66),
        (57, 42), (74, 25)
    ]
    frame_curve = sample_closed_curve(frame_ctrl, sharp_indices={1, 3, 5, 9, 11, 13}, subdiv=5)
    rivets = [(74, 30), (118, 30), (56, 54), (136, 54), (56, 88), (136, 88), (74, 112), (118, 112)]
    rivet_svg = "".join(
        f'<circle cx="{rx}" cy="{ry}" r="2.1" fill="{c_brass["l"]}" stroke="{INK}" stroke-width="1.1"/>'
        for rx, ry in rivets
    )
    cold_rim_mirr = frame_curve[int(len(frame_curve) * 0.62):] + frame_curve[:int(len(frame_curve) * 0.04)]

    frame_svg = (
        f'<path d="{poly_path(frame_curve)}" fill="{c_brass["c"]}"/>'
        f'<path d="M118,25L135,42L143,66L141,90L128,110L110,121L96,123L82,121Q118,110 128,74Q132,44 118,25Z" fill="{c_brass["d"]}" opacity="0.88"/>'
        f'{poly_hatch(frame_curve, 55, 3.8, "br", INK, 0.48, 0.9, 3.2, 212)}'
        f'{poly_hatch(frame_curve, 125, 4.5, "br", INK, 0.35, 0.85, 3.5, 213)}'
        f'<path d="{tapered_stroke(cold_rim_mirr, 2.5, 0.45, 0.15, 214)}" stroke="{c_slate["l"]}" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity="0.94"/>'
        f'{rivet_svg}'
        f'{boiling_Loop_stroke(frame_curve, 3.0, 0.22, 215)}'
    )

    eye_mono = (
        f'<g id="eye_mono"><!-- pivot: 93.4,65.3 -->'
        f'<circle cx="94" cy="65.5" r="20.5" fill="{c_slate["deep"]}" stroke="{INK}" stroke-width="2.2"/>'
        f'<circle cx="94" cy="65.5" r="17.2" fill="{WHITE}" stroke="{INK}" stroke-width="2.5"/>'
        f'<circle cx="94" cy="65.5" r="14.2" fill="none" stroke="{c_slate["d"]}" stroke-width="0.9" stroke-dasharray="3 2"/>'
        f'<circle cx="94" cy="65.5" r="11.2" fill="{c_wine["d"]}" stroke="{INK}" stroke-width="1.5"/>'
        f'<circle cx="94" cy="65.5" r="8.2" fill="{INK}"/>'
        f'<circle cx="94" cy="65.5" r="5.5" fill="none" stroke="{c_wine["l"]}" stroke-width="0.9" stroke-dasharray="2 1.8"/>'
        f'<circle cx="89.5" cy="61.2" r="2.6" fill="{WHITE}"/>'
        f'<circle cx="97.2" cy="68.8" r="1.3" fill="{c_brass["l"]}"/>'
        f'<path d="M77,58L73,55M82,50L79,46M94,47L94,42M106,50L109,46M111,58L115,55" stroke="{INK}" stroke-width="1.3" stroke-linecap="round"/>'
        f'</g>'
    )
    eyes = f'<g id="eyes"><!-- pivot: 93.4,65.3 -->{eye_mono}</g>'

    brows = (
        f'<g id="brows"><!-- pivot: 93.4,43.5 -->'
        f'<path d="M79,43.5Q94,36.5 108,43.5" stroke="{INK}" stroke-width="2.8" stroke-linecap="round" fill="none"/>'
        f'<path d="M82,41L84,44.5M94,39L94,42.5M105,41L103,44.5" stroke="{INK}" stroke-width="1.1" stroke-linecap="round"/>'
        f'</g>'
    )

    cheeks = (
        f'<g id="cheeks"><!-- pivot: 93.5,90.9 -->'
        f'<ellipse cx="74.5" cy="89.5" rx="6.8" ry="3.2" fill="{c_wine["c"]}" opacity="0.8"/>'
        f'<path d="M71.5,91L73.5,88M74.5,91.2L76.5,88.2M77.5,91L79,88.5" stroke="{INK}" stroke-width="0.95" stroke-linecap="round"/>'
        f'<ellipse cx="113.5" cy="89.5" rx="6.8" ry="3.2" fill="{c_wine["c"]}" opacity="0.8"/>'
        f'<path d="M110.5,91L112.5,88M113.5,91.2L115.5,88.2M116.5,91L118,88.5" stroke="{INK}" stroke-width="0.95" stroke-linecap="round"/>'
        f'</g>'
    )

    mouth = (
        f'<g id="mouth"><!-- pivot: 92.2,93.4 -->'
        f'<path d="M81,89.5Q93.5,98.5 106,88.5" stroke="{INK}" stroke-width="2.2" stroke-linecap="round" fill="none"/>'
        f'<path d="M79,91.5L83,87.5M88,92L87,96.5M94,93L94,97.5M100,92L101,96.5M104,86.5L108,90.5" stroke="{INK}" stroke-width="1.2" stroke-linecap="round"/>'
        f'</g>'
    )

    face_hurt = (
        f'<g id="face_hurt" opacity="0"><!-- pivot: 93.4,94.7 -->'
        f'<polygon points="94,87 101,94 94,101 87,94" fill="{c_slate["deep"]}" stroke="{INK}" stroke-width="2.2" stroke-linejoin="round"/>'
        f'<path d="M89,92L99,92M89,96L99,96M94,88L94,100" stroke="{WHITE}" stroke-width="1.0"/>'
        f'</g>'
    )

    head = f'<g id="head"><!-- pivot: 96,73 -->{eyes}{brows}{cheeks}{mouth}{face_hurt}</g>'

    flash_light = (
        f'<g id="flash_light" opacity="0"><!-- pivot: 96,73 -->'
        f'<g class="mirr-flash_light0">'
        f'<polygon points="82,38 92,38 110,104 100,104" fill="{WHITE}" opacity="0.85"/>'
        f'<polygon points="95,40 99,40 115,102 111,102" fill="{c_slate["l"]}" opacity="0.75"/>'
        f'</g>'
        f'</g>'
    )

    mirror_ellipse_poly = [
        (96 + 34.5 * math.cos(2 * math.pi * i / 36), 72 + 40.5 * math.sin(2 * math.pi * i / 36))
        for i in range(36)
    ]

    mirror_face = (
        f'<g id="mirror_face"><!-- pivot: 96,73 -->'
        f'<ellipse cx="96" cy="72" rx="34.5" ry="40.5" fill="{c_slate["c"]}" stroke="{INK}" stroke-width="2.8"/>'
        f'<path d="M96,31.5A34.5,40.5 0 0,1 130.5,72A34.5,40.5 0 0,1 96,112.5Q118,98 118,72Q118,46 96,31.5Z" fill="{c_slate["d"]}" opacity="0.85"/>'
        f'{poly_hatch(mirror_ellipse_poly, 52, 3.8, "br", INK, 0.42, 0.9, 3.0, 221)}'
        f'<path d="M68,52L76,57L73,63M121,85L113,89L116,96" stroke="{c_slate["deep"]}" stroke-width="1.2" stroke-linecap="round" fill="none"/>'
        f'{head}'
        f'{flash_light}'
        f'</g>'
    )

    sheen = (
        f'<g id="sheen"><!-- pivot: 96,73 -->'
        f'<path d="M104,37Q120,44 125,60Q117,50 104,42Z" fill="{c_slate["l"]}" opacity="0.88"/>'
        f'<path d="M68,62Q65,78 72,92" stroke="{c_slate["l"]}" stroke-width="1.6" stroke-linecap="round" fill="none" opacity="0.75"/>'
        f'</g>'
    )

    crest = (
        f'<g id="crest"><!-- pivot: 96,21.8 -->'
        f'<polygon points="96,11 107,20 103,28 89,28 85,20" fill="{c_brass["c"]}" stroke="{INK}" stroke-width="2.2" stroke-linejoin="round"/>'
        f'<polygon points="96,13.5 103,20 96,26.5 89,20" fill="{c_wine["c"]}" stroke="{INK}" stroke-width="1.8" stroke-linejoin="round"/>'
        f'<polygon points="96,13.5 103,20 96,26.5" fill="{c_wine["d"]}"/>'
        f'<circle cx="94" cy="18.5" r="1.5" fill="{WHITE}"/>'
        f'</g>'
    )

    arm_r_ctrl = [(134, 65), (150, 58), (159, 43), (165, 45), (156, 65), (136, 74)]
    arm_r_curve = sample_closed_curve(arm_r_ctrl, sharp_indices={1, 4}, subdiv=5)
    arm_l_ctrl = [(58, 77), (40, 84), (34, 98), (40, 102), (46, 90), (58, 85)]
    arm_l_curve = sample_closed_curve(arm_l_ctrl, sharp_indices={1, 4}, subdiv=5)

    arm_r = (
        f'<g id="arm_r"><!-- pivot: 140.8,70.4 -->'
        f'<path d="{poly_path(arm_r_curve)}" fill="{c_brass["c"]}"/>'
        f'<path d="M136,71L155,63L164,46" stroke="{c_brass["d"]}" stroke-width="2.0" stroke-linecap="round" fill="none"/>'
        f'{boiling_Loop_stroke(arm_r_curve, 2.4, 0.18, 232)}'
        f'<circle cx="163" cy="39.5" r="6.8" fill="{c_brass["c"]}" stroke="{INK}" stroke-width="2.3"/>'
        f'<circle cx="161.5" cy="37.8" r="1.5" fill="{c_brass["l"]}"/>'
        f'</g>'
    )
    arm_l = (
        f'<g id="arm_l"><!-- pivot: 51.2,81.9 -->'
        f'<path d="{poly_path(arm_l_curve)}" fill="{c_brass["c"]}"/>'
        f'<path d="M56,78L40,85L35,97" stroke="{c_brass["l"]}" stroke-width="1.5" stroke-linecap="round" fill="none"/>'
        f'{boiling_Loop_stroke(arm_l_curve, 2.4, 0.18, 234)}'
        f'<circle cx="39" cy="105" r="6.8" fill="{c_brass["c"]}" stroke="{INK}" stroke-width="2.3"/>'
        f'<circle cx="37.5" cy="103.2" r="1.5" fill="{c_brass["l"]}"/>'
        f'</g>'
    )

    static_patch = film_scratch_patch(99.4, 74.0, [
        (68.0, 44.0, 13.0, 15.0),
        (122.0, 96.0, 14.0, 16.0),
    ])

    shadow = shadow_group(94.1, 174.1, 34.0, 4.2, 94.1, 174.1)

    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" class="svg-mirr" viewBox="0 0 192 192" width="192" height="192">
<title>镜灵 · 哥特</title>
<style>{css}</style>
{gothic_defs("mirr", 192, 192)}
<g id="root"><!-- pivot: 96,192 -->
  {shadow}
  <g id="body" filter="url(#mirr-grunge)"><!-- pivot: 96,171.5 -->
    {handle_group}
    {frame_svg}
    {mirror_face}
    {sheen}
    {crest}
    {arm_r}
    {arm_l}
    {static_patch}
  </g>
</g>
</svg>
"""
    return svg


# ==============================================================================
# 4. 蠟燭 (tool_candle) - 160x160
# ==============================================================================
def build_candle():
    c_parch = F["parchment"]
    c_brass = F["brass"]
    c_amber = F["amber"]
    c_gray = F["gray"]

    css = common_boil_css("svg-candle") + """
.svg-candle #root { transform-origin: 80px 160px; }
.svg-candle #shadow { transform-origin: 81.5px 147.8px; }
.svg-candle #body { transform-origin: 76.8px 125.4px; }
.svg-candle #flecks { transform-origin: 80.1px 53.8px; }
.svg-candle #drips { transform-origin: 76.8px 64px; }
.svg-candle #core_glow { transform-origin: 83.8px 107.5px; }
.svg-candle #core { transform-origin: 83.8px 107.5px; }
.svg-candle #crack_sparks { transform-origin: 83.8px 107.5px; }
.svg-candle #flame_glow { transform-origin: 76.8px 42.2px; }
.svg-candle #flame { transform-origin: 76.8px 60.2px; }
.svg-candle #cracks { transform-origin: 76.8px 96px; }
.svg-candle #gray_overlay { transform-origin: 76.8px 125.4px; }
.svg-candle .candle-crack_sparks0 { transform-origin: 83.8px 107.5px; }
.svg-candle .candle-crack_sparks1 { transform-origin: 83.8px 107.5px; }
.svg-candle .candle-crack_sparks2 { transform-origin: 83.8px 107.5px; }
.svg-candle .candle-crack_sparks3 { transform-origin: 83.8px 107.5px; }
.svg-candle .candle-crack_sparks4 { transform-origin: 83.8px 107.5px; }
.svg-candle .candle-crack_sparks5 { transform-origin: 83.8px 107.5px; }

@keyframes candle-idle-flame {
  0%, 100% { transform: scale(1, 1) rotate(0deg); }
  18% { transform: scale(0.91, 1.11) rotate(-3.2deg); }
  37% { transform: scale(1.06, 0.94) rotate(2.1deg); }
  59% { transform: scale(0.94, 1.08) rotate(-1.8deg); }
  81% { transform: scale(1.04, 0.97) rotate(2.6deg); }
}
@keyframes candle-idle-flame_glow {
  0%, 100% { transform: scale(1, 1); opacity: 0.92; }
  18% { transform: scale(1.08, 1.08); opacity: 1; }
  37% { transform: scale(0.9, 0.9); opacity: 0.62; }
  59% { transform: scale(1.05, 1.05); opacity: 0.95; }
  81% { transform: scale(0.94, 0.94); opacity: 0.72; }
}
@keyframes candle-idle-core_glow {
  0%, 100% { transform: scale(0.95, 0.95); opacity: 0.74; }
  29% { transform: scale(1.08, 1.08); opacity: 1; }
  64% { transform: scale(0.92, 0.92); opacity: 0.65; }
  84% { transform: scale(1.04, 1.04); opacity: 0.92; }
}
@keyframes candle-idle-core {
  0%, 100% { transform: scale(1, 1); }
  29% { transform: scale(1.05, 1.05); }
  64% { transform: scale(0.97, 0.97); }
}
.svg-candle:not([data-anim]) #flame, .svg-candle[data-anim="idle"] #flame { animation: candle-idle-flame 1.15s steps(6, end) infinite; }
.svg-candle:not([data-anim]) #flame_glow, .svg-candle[data-anim="idle"] #flame_glow { animation: candle-idle-flame_glow 1.15s linear infinite; }
.svg-candle:not([data-anim]) #core_glow, .svg-candle[data-anim="idle"] #core_glow { animation: candle-idle-core_glow 1.6s linear infinite; }
.svg-candle:not([data-anim]) #core, .svg-candle[data-anim="idle"] #core { animation: candle-idle-core 1.6s steps(5, end) infinite; }

@keyframes candle-select-body {
  0%, 100% { transform: translate(0px, 0px); }
  35%, 68% { transform: translate(0px, -14px); }
}
@keyframes candle-select-core_glow {
  0%, 100% { transform: scale(1, 1); opacity: 0.85; }
  35%, 68% { transform: scale(1.28, 1.28); opacity: 1; }
}
@keyframes candle-select-shadow {
  0%, 100% { transform: scale(1, 1); opacity: 1; }
  35%, 68% { transform: scale(0.76, 0.76); opacity: 0.48; }
}
.svg-candle[data-anim="select"] #body { animation: candle-select-body 0.8s ease-in-out both; }
.svg-candle[data-anim="select"] #core_glow { animation: candle-select-core_glow 0.8s ease-in-out both; }
.svg-candle[data-anim="select"] #shadow { animation: candle-select-shadow 0.8s ease-in-out both; }

@keyframes candle-deselect-body {
  0% { transform: translate(0px, -14px); }
  100% { transform: translate(0px, 0px); }
}
@keyframes candle-deselect-core_glow {
  0% { transform: scale(1.28, 1.28); opacity: 1; }
  100% { transform: scale(1, 1); opacity: 0.85; }
}
@keyframes candle-deselect-shadow {
  0% { transform: scale(0.76, 0.76); opacity: 0.48; }
  100% { transform: scale(1, 1); opacity: 1; }
}
.svg-candle[data-anim="deselect"] #body { animation: candle-deselect-body 0.25s ease-out both; }
.svg-candle[data-anim="deselect"] #core_glow { animation: candle-deselect-core_glow 0.25s ease-out both; }
.svg-candle[data-anim="deselect"] #shadow { animation: candle-deselect-shadow 0.25s ease-out both; }

@keyframes candle-grow-core_glow {
  0%, 100% { transform: scale(1, 1); opacity: 0.85; }
  25% { transform: scale(1.55, 1.55); opacity: 1; }
}
@keyframes candle-grow-core {
  0%, 100% { transform: scale(1, 1); }
  25% { transform: scale(1.28, 1.28); }
  50% { transform: scale(0.93, 0.93); }
  75% { transform: scale(1.04, 1.04); }
}
@keyframes candle-grow-body {
  0%, 100% { transform: scale(1, 1); }
  25% { transform: scale(1.08, 1.08); }
  50% { transform: scale(0.96, 0.96); }
  75% { transform: scale(1.02, 1.02); }
}
.svg-candle[data-anim="grow"] #core_glow { animation: candle-grow-core_glow 0.6s ease-out both; }
.svg-candle[data-anim="grow"] #core { animation: candle-grow-core 0.6s ease-out both; }
.svg-candle[data-anim="grow"] #body { animation: candle-grow-body 0.6s steps(6, end) both; }

@keyframes candle-crack-core_glow {
  0% { transform: scale(1, 1); opacity: 1; }
  12% { transform: scale(1.45, 1.45); opacity: 1; }
  100% { transform: scale(0.85, 0.85); opacity: 0.25; }
}
@keyframes candle-crack-core {
  0% { transform: scale(1, 1); opacity: 1; }
  12% { transform: scale(1.22, 1.22); opacity: 1; }
  30% { transform: scale(1, 1); opacity: 1; }
  70%, 100% { transform: scale(1, 1); opacity: 0.5; }
}
@keyframes candle-crack-body {
  0%, 62%, 100% { transform: rotate(0deg); }
  12% { transform: rotate(-4deg); }
  25% { transform: rotate(3deg); }
  40% { transform: rotate(-2deg); }
  52% { transform: rotate(1deg); }
}
@keyframes candle-crack-cracks { 0%, 12% { opacity: 0; } 25%, 100% { opacity: 1; } }
@keyframes candle-crack-gray { 0%, 30% { opacity: 0; } 70%, 100% { opacity: 0.88; } }
@keyframes candle-crack-sparks-o { 0% { opacity: 0; } 6%, 42% { opacity: 1; } 65%, 100% { opacity: 0; } }
@keyframes candle-crack-sp0 { 0% { transform: translate(0px, 0px) scale(0.3); } 16% { transform: translate(4px, -18px) scale(1.1); } 65%, 100% { transform: translate(8px, -28px) scale(0.4); } }
@keyframes candle-crack-sp1 { 0% { transform: translate(0px, 0px) scale(0.3); } 16% { transform: translate(16px, -10px) scale(1.1); } 65%, 100% { transform: translate(32px, -12px) scale(0.4); } }
@keyframes candle-crack-sp2 { 0% { transform: translate(0px, 0px) scale(0.3); } 16% { transform: translate(15px, 5px) scale(1.1); } 65%, 100% { transform: translate(30px, 18px) scale(0.4); } }
@keyframes candle-crack-sp3 { 0% { transform: translate(0px, 0px) scale(0.3); } 16% { transform: translate(7px, 14px) scale(1.1); } 65%, 100% { transform: translate(14px, 28px) scale(0.4); } }
@keyframes candle-crack-sp4 { 0% { transform: translate(0px, 0px) scale(0.3); } 16% { transform: translate(-14px, 8px) scale(1.1); } 65%, 100% { transform: translate(-26px, 22px) scale(0.4); } }
@keyframes candle-crack-sp5 { 0% { transform: translate(0px, 0px) scale(0.3); } 16% { transform: translate(-16px, -7px) scale(1.1); } 65%, 100% { transform: translate(-32px, -5px) scale(0.4); } }
@keyframes candle-crack-flame { 0%, 20% { opacity: 1; transform: scale(1); } 70%, 100% { opacity: 0.25; transform: scale(0.65); } }
.svg-candle[data-anim="crack"] #core_glow { animation: candle-crack-core_glow 0.8s ease-out both; }
.svg-candle[data-anim="crack"] #core { animation: candle-crack-core 0.8s ease-out both; }
.svg-candle[data-anim="crack"] #body { animation: candle-crack-body 0.8s steps(6, end) both; }
.svg-candle[data-anim="crack"] #cracks { animation: candle-crack-cracks 0.8s linear both; }
.svg-candle[data-anim="crack"] #gray_overlay { animation: candle-crack-gray 0.8s ease-in-out both; }
.svg-candle[data-anim="crack"] #crack_sparks { animation: candle-crack-sparks-o 0.8s linear both; }
.svg-candle[data-anim="crack"] .candle-crack_sparks0 { animation: candle-crack-sp0 0.8s ease-out both; }
.svg-candle[data-anim="crack"] .candle-crack_sparks1 { animation: candle-crack-sp1 0.8s ease-out both; }
.svg-candle[data-anim="crack"] .candle-crack_sparks2 { animation: candle-crack-sp2 0.8s ease-out both; }
.svg-candle[data-anim="crack"] .candle-crack_sparks3 { animation: candle-crack-sp3 0.8s ease-out both; }
.svg-candle[data-anim="crack"] .candle-crack_sparks4 { animation: candle-crack-sp4 0.8s ease-out both; }
.svg-candle[data-anim="crack"] .candle-crack_sparks5 { animation: candle-crack-sp5 0.8s ease-out both; }
.svg-candle[data-anim="crack"] #flame { animation: candle-crack-flame 0.8s ease-out both; }
.svg-candle[data-anim="crack"] #flame_glow { animation: candle-crack-flame 0.8s ease-out both; }
"""

    extra_defs = f"""
  <radialGradient id="candle-flame-glow" cx="50%" cy="50%" r="50%">
    <stop offset="0%" stop-color="{c_amber['l']}" stop-opacity="0.84"/>
    <stop offset="55%" stop-color="{c_amber['c']}" stop-opacity="0.35"/>
    <stop offset="100%" stop-color="{c_amber['d']}" stop-opacity="0"/>
  </radialGradient>
  <radialGradient id="candle-core-glow" cx="50%" cy="50%" r="50%">
    <stop offset="0%" stop-color="{c_amber['l']}" stop-opacity="0.88"/>
    <stop offset="60%" stop-color="{c_amber['c']}" stop-opacity="0.34"/>
    <stop offset="100%" stop-color="{c_amber['deep']}" stop-opacity="0"/>
  </radialGradient>
"""

    flecks = (
        f'<g id="flecks"><!-- pivot: 80.1,53.8 -->'
        f'<polygon points="48,46 50,43.5 52,46 50,48.5" fill="{c_amber["l"]}"/>'
        f'<polygon points="104,42 106,39.5 108,42 106,44.5" fill="{c_amber["c"]}"/>'
        f'<circle cx="56" cy="34" r="1.3" fill="{c_amber["l"]}" opacity="0.85"/>'
        f'<circle cx="98" cy="54" r="1.2" fill="{c_amber["c"]}" opacity="0.85"/>'
        f'</g>'
    )

    holder_ctrl = [
        (36, 132), (52, 126), (104, 126), (118, 132),
        (114, 141), (92, 145), (60, 145), (40, 141)
    ]
    holder_curve = sample_closed_curve(holder_ctrl, sharp_indices={0, 3}, subdiv=5)
    ring_ctrl = [(115, 133), (126, 124), (135, 129), (134, 139), (123, 142), (116, 138)]
    ring_curve = sample_closed_curve(ring_ctrl, subdiv=5)

    wax_ctrl = [
        (51, 64), (76, 61), (102, 65),
        (100, 96), (99, 131), (77, 135), (53, 131), (52, 96)
    ]
    wax_curve = sample_closed_curve(wax_ctrl, sharp_indices={0, 2, 4, 6}, subdiv=5)
    cold_rim_wax = [(52.5, 67), (53.2, 96), (54.2, 128)]

    candle_base = (
        f'<path d="{poly_path(holder_curve)}" fill="{c_brass["c"]}"/>'
        f'<path d="M40,138Q76,146 114,138L110,143Q76,148 44,143Z" fill="{c_brass["deep"]}"/>'
        f'<ellipse cx="77" cy="133" rx="34" ry="6.5" fill="{c_brass["d"]}" stroke="{INK}" stroke-width="1.8"/>'
        f'{boiling_Loop_stroke(holder_curve, 2.8, 0.2, 302)}'
        f'<path d="{poly_path(ring_curve)}" fill="none" stroke="{c_brass["c"]}" stroke-width="4.2" stroke-linecap="round"/>'
        f'<path d="{poly_path(ring_curve)}" fill="none" stroke="{INK}" stroke-width="1.8" stroke-linecap="round"/>'
        f'<path d="{poly_path(wax_curve)}" fill="{c_parch["c"]}"/>'
        f'<path d="M80,63L101,65L99,131L77,135Q84,104 80,63Z" fill="{c_parch["d"]}" opacity="0.85"/>'
        f'{poly_hatch(wax_curve, 52, 3.6, "right", INK, 0.45, 0.9, 3.0, 306)}'
        f'{poly_hatch(wax_curve, 125, 4.3, "right", INK, 0.34, 0.85, 3.2, 307)}'
        f'<path d="{tapered_stroke(cold_rim_wax, 2.4, 0.4, 0.12, 308)}" stroke="{c_parch["l"]}" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity="0.94"/>'
        f'{stitch_marks([(53, 114), (66, 117), (53, 121)], 2.8, False, INK, 1.0, 309)}'
        f'{boiling_Loop_stroke(wax_curve, 2.9, 0.22, 310)}'
    )

    drips_ctrl = [
        (50.5, 64), (64, 60.5), (89, 60.5), (102.5, 65),
        (102, 87), (97, 92), (94, 86), (93, 74),
        (86, 75), (85, 86), (81, 89), (78, 82), (77, 74),
        (73, 76), (72.5, 101), (68, 106), (64.5, 100), (65, 73),
        (60, 74), (59, 86), (55, 89), (51, 84)
    ]
    drips_curve = sample_closed_curve(drips_ctrl, sharp_indices={5, 10, 15, 20}, subdiv=5)
    drips_group = (
        f'<g id="drips"><!-- pivot: 76.8,64 -->'
        f'<path d="{poly_path(drips_curve)}" fill="{c_parch["l"]}"/>'
        f'<ellipse cx="76.8" cy="64.2" rx="23.5" ry="4.8" fill="{c_parch["c"]}" stroke="{INK}" stroke-width="1.6"/>'
        f'<ellipse cx="76.8" cy="64.8" rx="17.5" ry="3.0" fill="{c_amber["l"]}" opacity="0.68"/>'
        f'<path d="M68,74L68,101M55,70L55,85M97,70L97,88" stroke="{WHITE}" stroke-width="1.5" stroke-linecap="round"/>'
        f'{boiling_Loop_stroke(drips_curve, 2.4, 0.18, 312)}'
        f'</g>'
    )

    core_glow = (
        f'<g id="core_glow"><!-- pivot: 83.8,107.5 -->'
        f'<circle cx="83.8" cy="107.5" r="17" fill="url(#candle-core-glow)"/>'
        f'</g>'
    )
    core = (
        f'<g id="core"><!-- pivot: 83.8,107.5 -->'
        f'<polygon points="83.8,98.5 91.5,103 91.5,112 83.8,116.5 76.1,112 76.1,103" fill="{c_brass["deep"]}" stroke="{INK}" stroke-width="2.0" stroke-linejoin="round"/>'
        f'<polygon points="83.8,100.5 89.5,104 89.5,111 83.8,114.5 78.1,111 78.1,104" fill="{c_amber["c"]}" stroke="{INK}" stroke-width="1.5" stroke-linejoin="round"/>'
        f'<polygon points="83.8,100.5 89.5,104 89.5,111 83.8,114.5" fill="{c_amber["d"]}"/>'
        f'<circle cx="81.8" cy="105.2" r="1.8" fill="{WHITE}"/>'
        f'</g>'
    )

    sparks_svg = "".join(
        f'<g class="candle-crack_sparks{i}">'
        f'<polygon points="83.8,104.5 86.2,107.5 83.8,110.5 81.4,107.5" fill="{c_amber["l"]}" stroke="{INK}" stroke-width="1.0"/>'
        f'</g>'
        for i in range(6)
    )
    crack_sparks = f'<g id="crack_sparks" opacity="0"><!-- pivot: 83.8,107.5 -->{sparks_svg}</g>'

    flame_glow = (
        f'<g id="flame_glow"><!-- pivot: 76.8,42.2 -->'
        f'<ellipse cx="76.8" cy="43" rx="21" ry="21" fill="url(#candle-flame-glow)"/>'
        f'</g>'
    )
    flame_ctrl = [(76.8, 60), (68, 52), (67, 40), (72.5, 30), (76.8, 21.5), (81, 31), (86, 41), (84, 53)]
    flame_curve = sample_closed_curve(flame_ctrl, sharp_indices={0, 4}, subdiv=6)
    flame = (
        f'<g id="flame"><!-- pivot: 76.8,60.2 -->'
        f'<path d="M76.8,64.5L76.8,58" stroke="{c_parch["deep"]}" stroke-width="2.4" stroke-linecap="round"/>'
        f'<path d="{poly_path(flame_curve)}" fill="{c_amber["c"]}"/>'
        f'<path d="M76.8,57Q71,50 72,39Q75,31 76.8,26.5Q79,32 81,40Q82,50 76.8,57Z" fill="{c_amber["l"]}"/>'
        f'<ellipse cx="76.8" cy="49" rx="2.8" ry="5.2" fill="{WHITE}"/>'
        f'{boiling_Loop_stroke(flame_curve, 2.3, 0.18, 322)}'
        f'</g>'
    )

    cracks = (
        f'<g id="cracks" opacity="0"><!-- pivot: 76.8,96 -->'
        f'<path d="M83.8,107.5L74,94L78,84L68,75M83.8,107.5L95,98L92,88M83.8,107.5L76,120L80,131M83.8,107.5L94,118L90,129" '
        f'stroke="{INK}" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" fill="none"/>'
        f'<path d="M83.8,107.5L74,94M83.8,107.5L94,118" stroke="{WHITE}" stroke-width="0.9" stroke-linecap="round" fill="none"/>'
        f'</g>'
    )
    gray_overlay = (
        f'<g id="gray_overlay" opacity="0"><!-- pivot: 76.8,125.4 -->'
        f'<path d="{poly_path(wax_curve)}" fill="{c_gray["c"]}" opacity="0.72"/>'
        f'<path d="{poly_path(holder_curve)}" fill="{c_gray["d"]}" opacity="0.72"/>'
        f'<circle cx="83.8" cy="107.5" r="8" fill="{c_gray["deep"]}" opacity="0.78"/>'
        f'</g>'
    )

    shadow = shadow_group(81.5, 147.8, 43.0, 4.2, 81.5, 147.8)

    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" class="svg-candle" viewBox="0 0 160 160" width="160" height="160">
<title>蜡烛 · 哥特</title>
<style>{css}</style>
{gothic_defs("candle", 160, 160, extra_defs)}
<g id="root"><!-- pivot: 80,160 -->
  {shadow}
  <g id="body" filter="url(#candle-grunge)"><!-- pivot: 76.8,125.4 -->
    {flecks}
    {candle_base}
    {drips_group}
    {core_glow}
    {core}
    {crack_sparks}
    {flame_glow}
    {flame}
    {cracks}
    {gray_overlay}
  </g>
</g>
</svg>
"""
    return svg


# ==============================================================================
# 5. 魔術帽 (tool_magic_hat) - 160x160
# ==============================================================================
def build_magic_hat():
    c_plum = F["plum"]
    c_wine = F["wine"]
    c_amber = F["amber"]
    c_gray = F["gray"]

    css = common_boil_css("svg-magichat") + """
.svg-magichat #root { transform-origin: 80.0px 160.0px; }
.svg-magichat #shadow { transform-origin: 80.2px 145.9px; }
.svg-magichat #body { transform-origin: 71.7px 129.7px; }
.svg-magichat #star_glow { transform-origin: 84.5px 57.1px; }
.svg-magichat #stars { transform-origin: 84.1px 59.6px; }
.svg-magichat #core_glow { transform-origin: 80.2px 81.3px; }
.svg-magichat #core { transform-origin: 80.2px 81.3px; }
.svg-magichat #crack_sparks { transform-origin: 80.2px 81.3px; }
.svg-magichat #cracks { transform-origin: 75.9px 105.5px; }
.svg-magichat #gray_overlay { transform-origin: 75.9px 105.5px; }
.svg-magichat .csp0 { transform-origin: 80.2px 81.3px; }
.svg-magichat .csp1 { transform-origin: 80.2px 81.3px; }
.svg-magichat .csp2 { transform-origin: 80.2px 81.3px; }
.svg-magichat .csp3 { transform-origin: 80.2px 81.3px; }
.svg-magichat .csp4 { transform-origin: 80.2px 81.3px; }
.svg-magichat .csp5 { transform-origin: 80.2px 81.3px; }

@keyframes magichat-idle-core_glow {
  0%, 100% { opacity: 0.72; transform: scale(0.94); }
  23% { opacity: 1; transform: scale(1.09); }
  54% { opacity: 0.64; transform: scale(0.91); }
  79% { opacity: 0.95; transform: scale(1.05); }
}
@keyframes magichat-idle-core {
  0%, 100% { transform: scale(1); }
  23% { transform: scale(1.05); }
  54% { transform: scale(0.97); }
}
@keyframes magichat-idle-star_glow {
  0%, 100% { opacity: 0.95; transform: scale(1); }
  31% { opacity: 0.58; transform: scale(0.92); }
  62% { opacity: 1; transform: scale(1.06); }
  84% { opacity: 0.68; transform: scale(0.95); }
}
@keyframes magichat-idle-stars {
  0%, 100% { opacity: 1; transform: translate(0px, 0px) rotate(0deg); }
  31% { opacity: 0.68; transform: translate(-0.8px, -1.2px) rotate(-2deg); }
  62% { opacity: 1; transform: translate(0.8px, -1.8px) rotate(2.2deg); }
  84% { opacity: 0.76; transform: translate(0px, -0.6px) rotate(-1deg); }
}
.svg-magichat:not([data-anim]) #core_glow, .svg-magichat[data-anim="idle"] #core_glow { animation: magichat-idle-core_glow 1.8s linear infinite; }
.svg-magichat:not([data-anim]) #core, .svg-magichat[data-anim="idle"] #core { animation: magichat-idle-core 1.8s steps(5, end) infinite; }
.svg-magichat:not([data-anim]) #star_glow, .svg-magichat[data-anim="idle"] #star_glow { animation: magichat-idle-star_glow 1.5s linear -0.3s infinite; }
.svg-magichat:not([data-anim]) #stars, .svg-magichat[data-anim="idle"] #stars { animation: magichat-idle-stars 1.5s steps(6, end) -0.3s infinite; }

@keyframes magichat-select-body {
  0%, 100% { transform: translate(0px, 0px); }
  30%, 68% { transform: translate(0px, -12.0px); }
}
@keyframes magichat-select-core_glow {
  0%, 100% { opacity: 0.85; transform: scale(1); }
  35%, 68% { opacity: 1; transform: scale(1.32); }
}
@keyframes magichat-select-shadow {
  0%, 100% { opacity: 1; transform: scale(1); }
  35%, 68% { opacity: 0.48; transform: scale(0.76); }
}
.svg-magichat[data-anim="select"] #body { animation: magichat-select-body 0.8s ease-out both; }
.svg-magichat[data-anim="select"] #core_glow { animation: magichat-select-core_glow 0.8s ease-in-out both; }
.svg-magichat[data-anim="select"] #shadow { animation: magichat-select-shadow 0.8s ease-in-out both; }

@keyframes magichat-deselect-body {
  0% { transform: translate(0px, -12.0px); }
  100% { transform: translate(0px, 0px); }
}
@keyframes magichat-deselect-core_glow {
  0% { opacity: 1; transform: scale(1.32); }
  100% { opacity: 0.85; transform: scale(1); }
}
@keyframes magichat-deselect-shadow {
  0% { opacity: 0.48; transform: scale(0.76); }
  100% { opacity: 1; transform: scale(1); }
}
.svg-magichat[data-anim="deselect"] #body { animation: magichat-deselect-body 0.25s ease-out both; }
.svg-magichat[data-anim="deselect"] #core_glow { animation: magichat-deselect-core_glow 0.25s ease-out both; }
.svg-magichat[data-anim="deselect"] #shadow { animation: magichat-deselect-shadow 0.25s ease-out both; }

@keyframes magichat-grow-core_glow {
  0%, 100% { opacity: 0.85; transform: scale(1); }
  25% { opacity: 1; transform: scale(1.6); }
  60% { opacity: 1; transform: scale(1.1); }
}
@keyframes magichat-grow-core {
  0%, 100% { transform: scale(1); }
  25% { transform: scale(1.28); }
  50% { transform: scale(0.92); }
  75% { transform: scale(1.05); }
}
@keyframes magichat-grow-body {
  0%, 100% { transform: scale(1, 1); }
  25% { transform: scale(1.06, 1.06); }
  50% { transform: scale(0.95, 0.95); }
  75% { transform: scale(1.02, 1.02); }
}
.svg-magichat[data-anim="grow"] #core_glow { animation: magichat-grow-core_glow 0.6s ease-out both; }
.svg-magichat[data-anim="grow"] #core { animation: magichat-grow-core 0.6s ease-out both; }
.svg-magichat[data-anim="grow"] #body { animation: magichat-grow-body 0.6s steps(6, end) both; }

@keyframes magichat-crack-core_glow {
  0% { opacity: 0.85; transform: scale(1); }
  12% { opacity: 1; transform: scale(1.5); }
  45% { opacity: 0.5; transform: scale(0.9); }
  100% { opacity: 0.25; transform: scale(0.85); }
}
@keyframes magichat-crack-core {
  0% { opacity: 1; transform: scale(1); }
  12% { opacity: 1; transform: scale(1.22); }
  30% { opacity: 1; transform: scale(1); }
  70%, 100% { opacity: 0.5; transform: scale(1); }
}
@keyframes magichat-crack-body {
  0%, 62%, 100% { transform: rotate(0deg); }
  12% { transform: rotate(-4deg); }
  26% { transform: rotate(3deg); }
  40% { transform: rotate(-2deg); }
  52% { transform: rotate(1deg); }
}
@keyframes magichat-crack-cracks { 0%, 12% { opacity: 0; } 25%, 100% { opacity: 1; } }
@keyframes magichat-crack-gray_overlay { 0%, 30% { opacity: 0; } 70%, 100% { opacity: 0.88; } }
@keyframes magichat-crack-crack_sparks { 0% { opacity: 0; } 6%, 42% { opacity: 1; } 65%, 100% { opacity: 0; } }
@keyframes magichat-crack-csp0 { 0% { transform: translate(0px, 0px) scale(0.3); } 16% { transform: translate(4px, -18px) scale(1.1); } 65%, 100% { transform: translate(8px, -28px) scale(0.4); } }
@keyframes magichat-crack-csp1 { 0% { transform: translate(0px, 0px) scale(0.3); } 16% { transform: translate(16px, -10px) scale(1.1); } 65%, 100% { transform: translate(32px, -12px) scale(0.4); } }
@keyframes magichat-crack-csp2 { 0% { transform: translate(0px, 0px) scale(0.3); } 16% { transform: translate(15px, 5px) scale(1.1); } 65%, 100% { transform: translate(30px, 18px) scale(0.4); } }
@keyframes magichat-crack-csp3 { 0% { transform: translate(0px, 0px) scale(0.3); } 16% { transform: translate(8px, 16px) scale(1.1); } 65%, 100% { transform: translate(16px, 34px) scale(0.4); } }
@keyframes magichat-crack-csp4 { 0% { transform: translate(0px, 0px) scale(0.3); } 16% { transform: translate(-14px, 8px) scale(1.1); } 65%, 100% { transform: translate(-28px, 24px) scale(0.4); } }
@keyframes magichat-crack-csp5 { 0% { transform: translate(0px, 0px) scale(0.3); } 16% { transform: translate(-16px, -7px) scale(1.1); } 65%, 100% { transform: translate(-32px, -5px) scale(0.4); } }
@keyframes magichat-crack-stars { 0%, 20% { opacity: 1; } 70%, 100% { opacity: 0.25; } }
.svg-magichat[data-anim="crack"] #core_glow { animation: magichat-crack-core_glow 0.8s ease-out both; }
.svg-magichat[data-anim="crack"] #core { animation: magichat-crack-core 0.8s ease-out both; }
.svg-magichat[data-anim="crack"] #body { animation: magichat-crack-body 0.8s steps(6, end) both; }
.svg-magichat[data-anim="crack"] #cracks { animation: magichat-crack-cracks 0.8s linear both; }
.svg-magichat[data-anim="crack"] #gray_overlay { animation: magichat-crack-gray_overlay 0.8s ease-in-out both; }
.svg-magichat[data-anim="crack"] #crack_sparks { animation: magichat-crack-crack_sparks 0.8s linear both; }
.svg-magichat[data-anim="crack"] .csp0 { animation: magichat-crack-csp0 0.8s ease-out both; }
.svg-magichat[data-anim="crack"] .csp1 { animation: magichat-crack-csp1 0.8s ease-out both; }
.svg-magichat[data-anim="crack"] .csp2 { animation: magichat-crack-csp2 0.8s ease-out both; }
.svg-magichat[data-anim="crack"] .csp3 { animation: magichat-crack-csp3 0.8s ease-out both; }
.svg-magichat[data-anim="crack"] .csp4 { animation: magichat-crack-csp4 0.8s ease-out both; }
.svg-magichat[data-anim="crack"] .csp5 { animation: magichat-crack-csp5 0.8s ease-out both; }
.svg-magichat[data-anim="crack"] #star_glow { animation: magichat-crack-stars 0.8s ease-out both; }
.svg-magichat[data-anim="crack"] #stars { animation: magichat-crack-stars 0.8s ease-out both; }
"""

    extra_defs = f"""
  <radialGradient id="hat-star-glow" cx="50%" cy="50%" r="50%">
    <stop offset="0%" stop-color="{c_amber['l']}" stop-opacity="0.78"/>
    <stop offset="55%" stop-color="{c_amber['c']}" stop-opacity="0.3"/>
    <stop offset="100%" stop-color="{c_amber['d']}" stop-opacity="0"/>
  </radialGradient>
  <radialGradient id="hat-core-glow" cx="50%" cy="50%" r="50%">
    <stop offset="0%" stop-color="{c_amber['l']}" stop-opacity="0.88"/>
    <stop offset="60%" stop-color="{c_amber['c']}" stop-opacity="0.34"/>
    <stop offset="100%" stop-color="{c_amber['deep']}" stop-opacity="0"/>
  </radialGradient>
"""

    crown_ctrl = [
        (53, 74), (105, 81),
        (102, 108), (100, 136),
        (78, 139), (44, 129),
        (50, 99)
    ]
    crown_curve = sample_closed_curve(crown_ctrl, sharp_indices={0, 1, 3, 5, 6}, subdiv=5)
    ribbon_pts = [(52, 73), (106, 80), (105, 88), (51, 81)]
    brim_ctrl = [
        (36, 59), (64, 52), (100, 56), (126, 68),
        (128, 79), (104, 83), (64, 78), (37, 68)
    ]
    brim_curve = sample_closed_curve(brim_ctrl, sharp_indices={0, 4}, subdiv=5)
    patch_pts = [(47, 108), (62, 111), (60, 125), (45, 122)]
    cold_rim_brim = [(72, 53.5), (52, 55), (38, 60.5), (48, 71)]
    cold_rim_crown = [(52.5, 82), (50.8, 99), (45.8, 126)]

    hat_body_svg = (
        f'<path d="{poly_path(crown_curve)}" fill="{c_plum["c"]}"/>'
        f'<path d="M80,78L105,81L100,136L74,139Q86,112 80,78Z" fill="{c_plum["d"]}" opacity="0.9"/>'
        f'<path d="M55,96L74,99L67,104" stroke="{INK}" stroke-width="1.6" stroke-linecap="round" fill="none"/>'
        f'{poly_hatch(crown_curve, 55, 3.6, "right", INK, 0.52, 0.95, 3.0, 402)}'
        f'{poly_hatch(crown_curve, 125, 4.4, "right", INK, 0.38, 0.85, 3.2, 403)}'
        f'<path d="{tapered_stroke(cold_rim_crown, 2.4, 0.4, 0.12, 408)}" stroke="{c_plum["l"]}" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity="0.95"/>'
        f'<path d="{poly_path(patch_pts)}" fill="{c_plum["l"]}" opacity="0.65" stroke="{INK}" stroke-width="1.3" stroke-linejoin="round"/>'
        f'{stitch_marks(patch_pts + [patch_pts[0]], 2.8, True, INK, 1.05, 404)}'
        f'<path d="{poly_path(ribbon_pts)}" fill="{c_wine["c"]}" stroke="{INK}" stroke-width="2.0" stroke-linejoin="round"/>'
        f'<path d="M80,77L106,80L105,88L79,85Z" fill="{c_wine["d"]}"/>'
        f'{stitch_marks([(52, 74), (105, 81)], 2.6, False, c_wine["l"], 0.95, 405)}'
        f'{boiling_Loop_stroke(crown_curve, 3.0, 0.22, 406)}'
        f'<path d="{poly_path(brim_curve)}" fill="{c_plum["c"]}"/>'
        f'<path d="M82,55Q118,62 127,75Q116,83 82,81Z" fill="{c_plum["d"]}" opacity="0.85"/>'
        f'<ellipse cx="82" cy="67" rx="28" ry="8.5" transform="rotate(7 82 67)" fill="{c_plum["deep"]}" stroke="{INK}" stroke-width="2.2"/>'
        f'<path d="{tapered_stroke(cold_rim_brim, 2.4, 0.4, 0.12, 418)}" stroke="{c_plum["l"]}" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity="0.95"/>'
        f'{boiling_Loop_stroke(brim_curve, 3.0, 0.22, 409)}'
    )

    star_glow = (
        f'<g id="star_glow"><!-- pivot: 84.5,57.1 -->'
        f'<ellipse cx="84" cy="44" rx="28" ry="23" fill="url(#hat-star-glow)"/>'
        f'</g>'
    )

    def gothic_star(cx, cy, r_out, r_in, rot_deg, seed):
        pts = []
        for i in range(10):
            ang = math.radians(rot_deg + i * 36 - 90)
            r = r_out if i % 2 == 0 else r_in
            pts.append((cx + math.cos(ang) * r, cy + math.sin(ang) * r))
        # 直接對 10 個五角星頂點做雙幀微抖描邊，100% 保留五個鋒利星尖！
        rng_a = random.Random(seed)
        pts_a = [(x + rng_a.uniform(-0.22, 0.22), y + rng_a.uniform(-0.22, 0.22)) for x, y in pts]
        rng_b = random.Random(seed + 53)
        pts_b = [(x + rng_b.uniform(-0.25, 0.25), y + rng_b.uniform(-0.25, 0.25)) for x, y in pts]
        return (
            f'<path d="{poly_path(pts)}" fill="{c_amber["c"]}"/>'
            f'<path d="M{fmt(cx)},{fmt(cy)}L{fmt(pts[0][0])},{fmt(pts[0][1])}L{fmt(pts[1][0])},{fmt(pts[1][1])}Z" fill="{c_amber["l"]}"/>'
            f'<path d="M{fmt(cx)},{fmt(cy)}L{fmt(pts[4][0])},{fmt(pts[4][1])}L{fmt(pts[5][0])},{fmt(pts[5][1])}Z" fill="{c_amber["d"]}"/>'
            f'<circle cx="{fmt(cx)}" cy="{fmt(cy)}" r="{fmt(r_in*0.38)}" fill="{WHITE}"/>'
            f'<path class="boil-a" d="{poly_path(pts_a)}" fill="none" stroke="{INK}" stroke-width="2.1" stroke-linejoin="round"/>'
            f'<path class="boil-b" d="{poly_path(pts_b)}" fill="none" stroke="{INK}" stroke-width="2.0" stroke-linejoin="round"/>'
        )

    stars = (
        f'<g id="stars"><!-- pivot: 84.1,59.6 -->'
        f'{gothic_star(80.0, 41.0, 12.5, 5.0, -8, 411)}'
        f'{gothic_star(64.0, 26.5, 6.8, 2.7, -18, 412)}'
        f'{gothic_star(104.5, 34.0, 7.6, 3.0, 15, 413)}'
        f'<path d="M66,46L68,51L73,53L68,55L66,60L64,55L59,53L64,51Z" fill="{WHITE}" opacity="0.88"/>'
        f'<path d="M96,48L97.5,52L101.5,53.5L97.5,55L96,59L94.5,55L90.5,53.5L94.5,52Z" fill="{c_amber["l"]}" opacity="0.88"/>'
        f'</g>'
    )

    core_glow = (
        f'<g id="core_glow"><!-- pivot: 80.2,81.3 -->'
        f'<circle cx="80.2" cy="81.3" r="15.5" fill="url(#hat-core-glow)"/>'
        f'</g>'
    )
    core = (
        f'<g id="core"><!-- pivot: 80.2,81.3 -->'
        f'<polygon points="80.2,73.5 87.8,78.5 85.8,87.2 74.6,87.2 72.6,78.5" fill="{c_plum["deep"]}" stroke="{INK}" stroke-width="2.0" stroke-linejoin="round"/>'
        f'<polygon points="80.2,75.2 85.8,79.2 84.2,85.6 76.2,85.6 74.6,79.2" fill="{c_amber["c"]}" stroke="{INK}" stroke-width="1.5" stroke-linejoin="round"/>'
        f'<polygon points="80.2,75.2 85.8,79.2 84.2,85.6 80.2,85.6" fill="{c_amber["d"]}"/>'
        f'<circle cx="78.5" cy="79.5" r="1.7" fill="{WHITE}"/>'
        f'</g>'
    )

    sparks_svg = "".join(
        f'<g class="csp{i}">'
        f'<polygon points="80.2,78.3 82.6,81.3 80.2,84.3 77.8,81.3" fill="{c_amber["l"]}" stroke="{INK}" stroke-width="1.0"/>'
        f'</g>'
        for i in range(6)
    )
    crack_sparks = f'<g id="crack_sparks" opacity="0"><!-- pivot: 80.2,81.3 -->{sparks_svg}</g>'

    cracks = (
        f'<g id="cracks" opacity="0"><!-- pivot: 75.9,105.5 -->'
        f'<path d="M80.2,81.3L68,96L72,110L62,124M80.2,81.3L92,98L88,114L95,128M80.2,81.3L62,72M80.2,81.3L98,74" '
        f'stroke="{INK}" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" fill="none"/>'
        f'<path d="M80.2,81.3L68,96M80.2,81.3L92,98" stroke="{WHITE}" stroke-width="0.9" stroke-linecap="round" fill="none"/>'
        f'</g>'
    )
    gray_overlay = (
        f'<g id="gray_overlay" opacity="0"><!-- pivot: 75.9,105.5 -->'
        f'<path d="{poly_path(crown_curve)}" fill="{c_gray["c"]}" opacity="0.74"/>'
        f'<path d="{poly_path(brim_curve)}" fill="{c_gray["d"]}" opacity="0.74"/>'
        f'<circle cx="80.2" cy="81.3" r="7.5" fill="{c_gray["deep"]}" opacity="0.8"/>'
        f'</g>'
    )

    shadow = shadow_group(80.2, 145.9, 42.0, 4.0, 80.2, 145.9)

    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" class="svg-magichat" viewBox="0 0 160 160" width="160" height="160">
<title>魔术帽 · 哥特</title>
<style>{css}</style>
{gothic_defs("magichat", 160, 160, extra_defs)}
<g id="root"><!-- pivot: 80,160 -->
  {shadow}
  <g id="body" filter="url(#magichat-grunge)"><!-- pivot: 71.7,129.7 -->
    {hat_body_svg}
    {star_glow}
    {stars}
    {core_glow}
    {core}
    {crack_sparks}
    {cracks}
    {gray_overlay}
  </g>
</g>
</svg>
"""
    return svg


def main():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    out_dir = os.path.join(base_dir, "out")
    ex_dir = os.path.join(base_dir, "examples")
    os.makedirs(out_dir, exist_ok=True)
    os.makedirs(ex_dir, exist_ok=True)

    outputs = {
        "monster_froglet.svg": build_froglet(),
        "monster_kitsune.svg": build_kitsune(),
        "monster_mirrorimp.svg": build_mirrorimp(),
        "tool_candle.svg": build_candle(),
        "tool_magic_hat.svg": build_magic_hat(),
    }

    for fname, content in outputs.items():
        out_path = os.path.join(out_dir, fname)
        with open(out_path, "w", encoding="utf-8") as f:
            f.write(content)
        print(f"Wrote {out_path} ({len(content)/1024:.1f} KB)")

    shutil.copyfile(
        os.path.join(out_dir, "monster_froglet.svg"),
        os.path.join(ex_dir, "monster_froglet.svg"),
    )
    print("Copied monster_froglet.svg to examples/monster_froglet.svg")


if __name__ == "__main__":
    main()
