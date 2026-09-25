import sys, subprocess
from pathlib import Path
sys.stdout.reconfigure(encoding="utf-8")
import imageio_ffmpeg
FF = imageio_ffmpeg.get_ffmpeg_exe()
src = Path("素材/02-BOSS战.mp4")
out = Path("素材/_检查帧.jpg")
r = subprocess.run([FF, "-y", "-ss", "60", "-i", str(src), "-frames:v", "1", str(out)], capture_output=True, encoding="utf-8", errors="replace")
print("帧提取:", r.returncode == 0)
# 视频时长
r2 = subprocess.run([FF, "-i", str(src)], capture_output=True, encoding="utf-8", errors="replace")
for line in r2.stderr.splitlines():
    if "Duration" in line: print(line.strip())
