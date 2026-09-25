# -*- coding: utf-8 -*-
import sys
from pathlib import Path
sys.stdout.reconfigure(encoding="utf-8")
g = Path("js/game.js"); h = Path("index.html")
s = g.read_text(encoding="utf-8")
before = s.count("v5.2")
s = s.replace("'v5.2'", "'v5.3'").replace("v5.2 · Q 切枪", "v5.3 · Q 切枪")
g.write_text(s, encoding="utf-8")
i = h.read_text(encoding="utf-8")
i = i.replace("v=5.22", "v=5.31")
h.write_text(i, encoding="utf-8")
print(f"替换 {before} 处 v5.2 标记, index -> 5.31")
