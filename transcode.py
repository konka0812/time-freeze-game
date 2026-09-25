# -*- coding: utf-8 -*-
import sys, subprocess
from pathlib import Path
sys.stdout.reconfigure(encoding="utf-8")
FF = str(Path("..", "..", "..").resolve())  # placeholder
import imageio_ffmpeg
FF = imageio_ffmpeg.get_ffmpeg_exe()
OUT = Path("素材")
for f in sorted(OUT.glob("*.webm")):
    mp4 = f.with_suffix(".mp4")
    if mp4.exists():
        print("已存在:", mp4.name); continue
    r = subprocess.run([FF, "-y", "-i", str(f), "-c:v", "libx264", "-preset", "fast", "-crf", "21", "-pix_fmt", "yuv420p", str(mp4)],
                       capture_output=True, encoding="utf-8", errors="replace")
    print(("OK: " if r.returncode == 0 else "FAIL: ") + mp4.name)
print("done")
