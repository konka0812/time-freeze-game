# -*- coding: utf-8 -*-
import sys, time, subprocess, os
from pathlib import Path
sys.stdout.reconfigure(encoding="utf-8")
from playwright.sync_api import sync_playwright
import imageio_ffmpeg

FF = imageio_ffmpeg.get_ffmpeg_exe()
OUT = Path("素材"); RAW = OUT / "_raw"
BASE = "https://konka0812.github.io/time-freeze-game/"
SEGS = [
    ("01-标准演示", "?demo", 28),
    ("02-BOSS战", "?demo&boss", 80),
    ("03-磁轨枪", "?demo&wpn=rail", 18),
    ("04-蜂群追踪", "?demo&wpn=swarm", 18),
]

with sync_playwright() as pw:
    b = pw.chromium.launch(headless=True)
    for name, q, dur in SEGS:
        mp4 = OUT / (name + ".mp4")
        if mp4.exists():
            print(name, "已完成, 跳过"); continue
        webm = OUT / (name + ".webm")
        if webm.exists(): webm.unlink()
        ctx = b.new_context(
            viewport={"width": 1280, "height": 720},
            record_video_dir=str(RAW),
            record_video_size={"width": 1280, "height": 720},
        )
        page = ctx.new_page()
        try:
            page.goto(BASE + q + "&t=" + str(int(time.time())), wait_until="domcontentloaded", timeout=60000)
        except Exception as e2:
            print(name, "goto重试:", str(e2)[:60])
            try: page.goto(BASE + q, wait_until="domcontentloaded", timeout=60000)
            except Exception: pass
        page.wait_for_timeout(dur * 1000)
        vp = page.video
        ctx.close()
        src = Path(vp.path())
        os.replace(src, OUT / (name + ".webm"))
        print("录制完成:", name)
    b.close()

print("转码 MP4...")
for f in sorted(OUT.glob("*.webm")):
    mp4 = f.with_suffix(".mp4")
    if mp4.exists(): continue
    r = subprocess.run([FF, "-y", "-i", str(f), "-c:v", "libx264", "-preset", "fast", "-crf", "21", "-pix_fmt", "yuv420p", str(mp4)],
                       capture_output=True, text=True)
    print(("转码OK: " if r.returncode == 0 else "转码失败: ") + mp4.name)
