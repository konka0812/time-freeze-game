# -*- coding: utf-8 -*-
import sys, colorsys
from pathlib import Path
from PIL import Image, ImageFilter
from collections import deque
sys.stdout.reconfigure(encoding="utf-8")
RAW = Path("assets_raw"); OUT = Path("assets")

def key_magenta_v2(im, tol=110):
    im = im.convert("RGB"); w, h = im.size; px = im.load()
    corners = [px[0,0], px[w-1,0], px[0,h-1], px[w-1,h-1]]
    ref = tuple(sum(c[i] for c in corners)//4 for i in range(3))
    def close(c): return abs(c[0]-ref[0]) + abs(c[1]-ref[1]) + abs(c[2]-ref[2]) < tol
    def is_mag(c):
        r,g,b = [v/255 for v in c]
        hh, ss, vv = colorsys.rgb_to_hsv(r, g, b)
        return 265 <= hh*360 <= 335 and ss > 0.40 and vv > 0.30
    mask = [[False]*w for _ in range(h)]; q = deque()
    for x in range(w):
        for y in (0, h-1):
            if close(px[x,y]) and not mask[y][x]: mask[y][x] = True; q.append((x,y))
    for y in range(h):
        for x in (0, w-1):
            if close(px[x,y]) and not mask[y][x]: mask[y][x] = True; q.append((x,y))
    while q:
        x, y = q.popleft()
        for nx, ny in ((x+1,y),(x-1,y),(x,y+1),(x,y-1)):
            if 0 <= nx < w and 0 <= ny < h and not mask[ny][nx] and close(px[nx,ny]):
                mask[ny][nx] = True; q.append((nx,ny))
    for y in range(h):
        for x in range(w):
            if not mask[y][x] and is_mag(px[x,y]): mask[y][x] = True
    out = im.convert("RGBA"); opx = out.load()
    for y in range(h):
        row = mask[y]
        for x in range(w):
            if row[x]:
                r,g,b,a = opx[x,y]; opx[x,y] = (r,g,b,0)
    alpha = out.getchannel("A").filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.8))
    out.putalpha(alpha)
    return out

for name in ("enemy_sniper", "enemy_heavy", "enemy_echo", "enemy_miner"):
    im = key_magenta_v2(Image.open(RAW / (name + ".png")))
    bbox = im.getbbox()
    if bbox: im = im.crop(bbox)
    side = max(im.size)
    sq = Image.new("RGBA", (side, side), (0,0,0,0))
    sq.paste(im, ((side-im.width)//2, (side-im.height)//2))
    sq = sq.resize((256, 256), Image.Resampling.LANCZOS)
    sq.save(OUT / (name + ".png"))
    print(name, "ok")

# 暗底检查图
bg = Image.new("RGB", (4*180+20, 220), "#1c1c22")
for i, n in enumerate(("enemy_sniper", "enemy_heavy", "enemy_echo", "enemy_miner")):
    im = Image.open(OUT / (n + ".png"))
    bg.paste(im, (20 + i * 180, 30), im)
bg.save("assets_raw/dark_check4.png")
print("check saved")
