# -*- coding: utf-8 -*-
import os, sys, json
import requests
from pathlib import Path
sys.stdout.reconfigure(encoding='utf-8')
BASE = "https://api.ai-media.vip/v1"
RAW = Path("assets_raw")
s = requests.Session(); s.trust_env = False
H = {"Authorization": "Bearer " + os.environ["AI_MEDIA_API_KEY"], "Content-Type": "application/json"}

COMMON = "纯俯视角（正上方鸟瞰）看一个小人，简洁几何游戏风格，角色居中占画面约70%，边缘清晰锐利，头顶朝向画面上方。背景为纯亮品红色纯色背景（用于后期抠图），无阴影，无投影，无其他任何元素。"
JOBS = {
    "enemy_sniper": "纯俯视角（正上方鸟瞰）看一个深红色细长晶体狙击手，体型修长，头部有一只圆形独眼镜头，双手握持一柄长管狙击步枪指向上方。" + COMMON,
    "enemy_heavy": "纯俯视角（正上方鸟瞰）看一个暗红色重型装甲水晶巨人，体格粗壮宽厚，覆盖厚重多面体护甲板，双手各持一个短管重炮指向上方。" + COMMON,
    "enemy_echo": "纯俯视角（正上方鸟瞰）看一个半透明蓝白色幽灵质感小人，人形轮廓但边缘如烟雾般飘散模糊，微微发光。" + COMMON,
    "enemy_miner": "纯俯视角（正上方鸟瞰）看一个橙红色工程晶体小人，背后挂载两个圆形地雷舱，双手持布设装置朝向前方。" + COMMON,
}
tasks = {}
for name, prompt in JOBS.items():
    r = s.post(BASE + "/images/generations", headers=H | {"Idempotency-Key": "tf4-" + name + "-001"},
               json={"model": "gpt-image-2.5", "prompt": prompt, "size": "1024x1024", "quality": "medium", "n": 1, "async": True}, timeout=120)
    d = r.json()
    tasks[name] = {"poll": d.get("poll_url") or d.get("result_url"), "id": d.get("id")}
    print(f"{name}: {d.get('id')}")
(RAW / "_tasks4.json").write_text(json.dumps(tasks, ensure_ascii=False), encoding="utf-8")
print("全部提交")
