# -*- coding: utf-8 -*-
import os, sys, json, time, base64
import requests
from pathlib import Path
sys.stdout.reconfigure(encoding='utf-8')
AUTH = os.environ["AI_MEDIA_API_KEY"]
RAW = Path("assets_raw")
tasks = json.loads((RAW / "_tasks4.json").read_text(encoding="utf-8"))
s = requests.Session(); s.trust_env = False
H = {"Authorization": "Bearer " + AUTH}
def purl(u): return u if u and u.startswith("http") else "https://api.ai-media.vip" + (u or "")
def download(url, dst, retries=6):
    for i in range(retries):
        try:
            r = s.get(url, timeout=(10, 120)); r.raise_for_status()
            dst.write_bytes(r.content); return True
        except requests.RequestException: time.sleep(min(2**i, 10))
    return False
pending = dict(tasks)
deadline = time.time() + 480
while pending and time.time() < deadline:
    for name, t in list(pending.items()):
        try: tj = s.get(purl(t["poll"]), headers=H, timeout=60).json()
        except Exception: continue
        if tj.get("data"):
            d0 = tj["data"][0]
            if d0.get("b64_json"):
                (RAW / (name + ".png")).write_bytes(base64.b64decode(d0["b64_json"]))
            elif d0.get("url"):
                if not download(d0["url"], RAW / (name + ".png")): continue
            print(f"{name}: 完成"); del pending[name]
        elif tj.get("error"):
            print(f"{name}: 失败 {str(tj.get('error',''))[:40]}"); del pending[name]
    if pending: time.sleep(5)
print("剩余:", list(pending) or "无")
