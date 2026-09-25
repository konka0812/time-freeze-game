'use strict';
/* =========================================================
   《你不动，时间就停》 v2 — Superhot-like 2D web demake
   规则：玩家移动/开枪时世界流动；否则全世界冻结。
   ========================================================= */

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const W = 1280, H = 720;
const DEMO = new URLSearchParams(location.search).has('demo');   // ?demo 自动演示
const BOSS_START = new URLSearchParams(location.search).has('boss');  // ?boss 直达BOSS战
const TOUCH = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
const STICK_L = { x: 150, y: H - 150 };
const STICK_R = { x: W - 150, y: H - 150 };
const KIND_IMG = {
  shooter: 'enemy_shooter', rusher: 'enemy_rusher', sniper: 'enemy_sniper',
  heavy: 'enemy_heavy', echo: 'enemy_echo', miner: 'enemy_miner', boss: 'enemy_heavy',
};
const ACT_BTNS = [
  { x: W - 262, y: H - 228, r: 34, label: '冲刺', color: '#dfe8ff', action: () => doDash() },
  { x: W - 262, y: H - 100, r: 34, label: '换弹', color: '#8fb0ff', action: () => tryReload() },
];
const ARENA = { x: 40, y: 40, w: W - 80, h: H - 80 };
const DPR = Math.min(2, window.devicePixelRatio || 1);
canvas.width = W * DPR; canvas.height = H * DPR;

/* ---------- 自适应缩放 ---------- */
function fitScreen() {
  const s = Math.min(innerWidth / W, innerHeight / H);
  canvas.style.width = (W * s) + 'px';
  canvas.style.height = (H * s) + 'px';
}
addEventListener('resize', fitScreen); fitScreen();

/* ---------- 工具 ---------- */
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
const TAU = Math.PI * 2;
const FONT = '"Microsoft YaHei", "PingFang SC", sans-serif';
const EN = '600 10px "Segoe UI", Arial, sans-serif';

/* ---------- 掩体 ---------- */
function circleRectPush(px, py, r, rc) {
  const nx = clamp(px, rc.x, rc.x + rc.w), ny = clamp(py, rc.y, rc.y + rc.h);
  const dx = px - nx, dy = py - ny, d2v = dx * dx + dy * dy;
  if (d2v > r * r) return null;
  if (d2v > 0.0001) { const dd = Math.sqrt(d2v); return { px: nx + dx / dd * r, py: ny + dy / dd * r }; }
  const l = px - rc.x, rg = rc.x + rc.w - px, t = py - rc.y, b = rc.y + rc.h - py;
  const m = Math.min(l, rg, t, b);
  if (m === l) return { px: rc.x - r, py };
  if (m === rg) return { px: rc.x + rc.w + r, py };
  if (m === t) return { px, py: rc.y - r };
  return { px, py: rc.y + rc.h + r };
}
function pointInCover(x, y) {
  for (const rc of covers)
    if (x >= rc.x && x <= rc.x + rc.w && y >= rc.y && y <= rc.y + rc.h) return rc;
  return null;
}
function rayToWall(x, y, a) {
  const c = Math.cos(a), s = Math.sin(a);
  let t = Infinity;
  if (c > 0.0001) t = Math.min(t, (ARENA.x + ARENA.w - x) / c);
  if (c < -0.0001) t = Math.min(t, (ARENA.x - x) / c);
  if (s > 0.0001) t = Math.min(t, (ARENA.y + ARENA.h - y) / s);
  if (s < -0.0001) t = Math.min(t, (ARENA.y - y) / s);
  return Math.max(0, t);
}
function pointSegDist(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const l2 = dx * dx + dy * dy;
  if (l2 < 0.0001) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / l2;
  t = clamp(t, 0, 1);
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}
function rayCoverDist(x, y, a, max = 2000) {
  const cx2 = Math.cos(a), cy2 = Math.sin(a);
  for (let d2 = 6; d2 <= max; d2 += 6)
    if (pointInCover(x + cx2 * d2, y + cy2 * d2)) return d2;
  return max;
}
function makeCovers() {
  const palettes = [
    { f0: '#34343e', f1: '#1b1b21', rim: 'rgba(255,255,255,0.16)' },
    { f0: '#3c2530', f1: '#231720', rim: 'rgba(224,49,49,0.4)' },
    { f0: '#243044', f1: '#151d2a', rim: 'rgba(90,130,255,0.4)' },
  ];
  const pal = palettes[Math.random() * palettes.length | 0];
  const out = [];
  let guard = 0;
  while (out.length < 4 + (Math.random() < 0.5 ? 1 : 0) && guard++ < 60) {
    const horiz = Math.random() < 0.55;
    const w2 = horiz ? rand(90, 150) : 24;
    const h2 = horiz ? 24 : rand(90, 150);
    const x = rand(ARENA.x + 90, ARENA.x + ARENA.w - w2 - 90);
    const y = rand(ARENA.y + 80, ARENA.y + ARENA.h - h2 - 80);
    if (Math.hypot(x + w2 / 2 - W / 2, y + h2 / 2 - H / 2) < 175) continue;
    if (out.some(o => Math.abs(o.x - x) < (o.w + w2) / 2 + 55 && Math.abs(o.y - y) < (o.h + h2) / 2 + 55)) continue;
    const cracks = [];
    for (let i2 = 0; i2 < 4; i2++) {
      const sx2 = rand(x + 6, x + w2 - 6), sy2 = rand(y + 6, y + h2 - 6);
      cracks.push([sx2, sy2, sx2 + rand(-16, 16), sy2 + rand(-16, 16)]);
    }
    out.push({ x, y, w: w2, h: h2, hp: 8, pal, cracks });
  }
  return out;
}

/* ---------- UI 通用工具 ---------- */
function ls(px) { try { ctx.letterSpacing = px; } catch (e) {} }
function roundRectPath(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
const glowCache = {};
function glowFor(key, color) {
  if (!glowCache[key]) {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, color); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    glowCache[key] = c;
  }
  return glowCache[key];
}
const GLOW_PLAYER = () => glowFor('p', 'rgba(190,212,255,0.9)');
const GLOW_ENEMY  = () => glowFor('e', 'rgba(255,60,60,0.95)');
const GLOW_WARM   = () => glowFor('w', 'rgba(255,225,170,0.95)');
let uiButtons = [];
let titleBullets = null;
function drawButton(x, y, w, h, label, sub, action) {
  const hov = mouse.x >= x && mouse.x <= x + w && mouse.y >= y && mouse.y <= y + h;
  uiButtons.push({ x, y, w, h, action });
  ctx.save();
  if (hov) { ctx.fillStyle = '#e03131'; roundRectPath(x, y, w, h, 4); ctx.fill(); }
  else { ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1.5; roundRectPath(x, y, w, h, 4); ctx.stroke(); }
  ctx.textAlign = 'center';
  if (hov) { ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.font = 'bold 15px ' + FONT; ctx.fillText('▸', x + 18, y + h / 2 - (sub ? 4 : 8)); }
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 23px ' + FONT;
  ctx.fillText(label, x + w / 2, y + h / 2 - (sub ? 4 : 8));
  if (sub) {
    ls('3px');
    ctx.font = EN;
    ctx.fillStyle = hov ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.4)';
    ctx.fillText(sub, x + w / 2, y + h / 2 + 18);
    ls('0px');
  }
  ctx.restore();
}

/* 胶片颗粒 */
let grainPat = null, grainT = 0;
function drawGrain() {
  if (!grainPat) {
    const c = document.createElement('canvas'); c.width = c.height = 140;
    const g = c.getContext('2d');
    const id = g.createImageData(140, 140);
    for (let i = 0; i < id.data.length; i += 4) {
      const v = Math.random() * 255 | 0;
      id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255;
    }
    g.putImageData(id, 0, 0);
    grainPat = ctx.createPattern(c, 'repeat');
  }
  grainT = (grainT + 1) % 5;
  if (grainT) return;                       // 每5帧换一次抖动，省性能
  ctx.save();
  ctx.globalAlpha = 0.05;
  ctx.globalCompositeOperation = 'overlay';
  ctx.translate(-(Math.random() * 140 | 0), -(Math.random() * 140 | 0));
  ctx.fillStyle = grainPat;
  ctx.fillRect(0, 0, W + 140, H + 140);
  ctx.restore();
}

/* 全屏暗角 */
function drawVignette() {
  const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.38, W / 2, H / 2, W * 0.72);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(8,8,10,0.30)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

/* 自制准星（替代系统光标） */
function drawCrosshair() {
  const { x, y } = mouse;
  const r = 9 + (timePulse > 0.1 ? 4 : 0);
  ctx.save();
  ctx.lineCap = 'round';
  for (const [col, w, rr] of [['rgba(13,13,15,0.9)', 3.4, r], ['#ffffff', 1.6, r]]) {
    ctx.strokeStyle = col; ctx.lineWidth = w;
    ctx.beginPath(); ctx.arc(x, y, rr, 0, TAU); ctx.stroke();
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * (rr + 3), y + Math.sin(a) * (rr + 3));
      ctx.lineTo(x + Math.cos(a) * (rr + 9), y + Math.sin(a) * (rr + 9));
      ctx.stroke();
    }
  }
  ctx.fillStyle = '#e03131';
  ctx.beginPath(); ctx.arc(x, y, 2.2, 0, TAU); ctx.fill();
  ctx.restore();
}

/* 台词库（Superhot 式单句） */
const QUOTES = [
  '时间服从于你', '慢，就是快', '静止即无敌', '他们都在等你动',
  '别急着开枪', '世界因你而转', '你不是在躲子弹，你是在等它',
  '呼吸。再呼吸。', '动，是最后的手段', '子弹也怕耐心的人',
];
const DEATH_LINES = ['你动了。', '冲动是魔鬼。', '刚才，别动。', '世界只原谅静止的人。'];
const randQuote = () => QUOTES[Math.random() * QUOTES.length | 0];

/* ---------- 素材 ---------- */
const IMG = {};
function loadImg(name, src) {
  return new Promise(res => {
    const im = new Image();
    im.onload = () => { IMG[name] = im; res(); };
    im.onerror = () => res();
    im.src = src;
  });
}
let assetsReady = false;
Promise.all([
  loadImg('player', 'assets/player.png'),
  loadImg('enemy_shooter', 'assets/enemy_shooter.png'),
  loadImg('enemy_rusher', 'assets/enemy_rusher.png'),
  loadImg('enemy_sniper', 'assets/enemy_sniper.png'),
  loadImg('enemy_heavy', 'assets/enemy_heavy.png'),
  loadImg('enemy_echo', 'assets/enemy_echo.png'),
  loadImg('enemy_miner', 'assets/enemy_miner.png'),
  loadImg('floor', 'assets/floor.png'),
  loadImg('cover', 'assets/cover.png'),
]).then(() => {
  assetsReady = true;
  if (!DEMO) {
    if (new URLSearchParams(location.search).has('codex')) state = 'codex';
    else state = 'title';
  }
});

/* ---------- 音频（程序合成 v2） ---------- */
let AC = null, master = null, muted = false, padGain = null;
try { muted = JSON.parse(localStorage.getItem('tf_muted') || 'false'); } catch (e) {}
function initAudio() {
  if (AC) { AC.resume(); return; }
  AC = new (window.AudioContext || window.webkitAudioContext)();
  master = AC.createGain(); master.gain.value = muted ? 0 : settings.vol;
  master.connect(AC.destination);
  const len = AC.sampleRate * 2;
  const buf = AC.createBuffer(1, len, AC.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = AC.createBufferSource(); src.buffer = buf; src.loop = true;
  const lp = AC.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 200;
  padGain = AC.createGain(); padGain.gain.value = 0;
  src.connect(lp); lp.connect(padGain); padGain.connect(master);
  src.start();
  // 低音drone: 两个微失谐三角波 + 一层高八度气声
  const dlp = AC.createBiquadFilter(); dlp.type = 'lowpass'; dlp.frequency.value = 320;
  [[55, 'triangle', 0.5], [55.8, 'triangle', 0.5], [110.3, 'sine', 0.16]].forEach(([f, t, v]) => {
    const o = AC.createOscillator(); o.type = t; o.frequency.value = f;
    const g = AC.createGain(); g.gain.value = v;
    o.connect(g); g.connect(dlp); o.start();
  });
  const droneGain = AC.createGain(); droneGain.gain.value = 0.045;
  dlp.connect(droneGain); droneGain.connect(master);
}
function noiseHit(dur, type, freq, vol, sweepTo) {
  if (!AC) return;
  const n = Math.max(1, AC.sampleRate * dur | 0);
  const buf = AC.createBuffer(1, n, AC.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = AC.createBufferSource(); src.buffer = buf;
  const f = AC.createBiquadFilter(); f.type = type; f.frequency.value = freq;
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, AC.currentTime + dur);
  const g = AC.createGain();
  g.gain.setValueAtTime(vol, AC.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, AC.currentTime + dur);
  src.connect(f); f.connect(g); g.connect(master); src.start();
}
function tone(type, f0, f1, dur, vol, delay = 0) {
  if (!AC) return;
  const t = AC.currentTime + delay;
  const o = AC.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = AC.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
}
const sfx = {
  shoot()  { noiseHit(0.10, 'bandpass', 1300, 0.5); tone('square', 190, 70, 0.07, 0.25); },
  eshoot() { noiseHit(0.12, 'bandpass', 900, 0.30); tone('square', 150, 60, 0.08, 0.15); },
  shatter(){ noiseHit(0.32, 'highpass', 2600, 0.42); tone('triangle', 2100, 1400, 0.18, 0.12); },
  heavyHit(){ tone('sine', 130, 80, 0.10, 0.35); noiseHit(0.05, 'lowpass', 700, 0.25); },
  kill(combo) { tone('sine', 760 * (1 + Math.min(combo, 8) * 0.09), null, 0.14, 0.22); },
  graze()  { tone('sine', 3100, 3600, 0.06, 0.14); },
  reload0(){ tone('square', 820, null, 0.03, 0.18); tone('square', 620, null, 0.03, 0.18, 0.07); },
  reload1(){ tone('square', 700, null, 0.03, 0.2); tone('square', 1050, null, 0.04, 0.22, 0.06); },
  freeze() { noiseHit(0.28, 'lowpass', 900, 0.28, 140); },
  thaw()   { noiseHit(0.22, 'lowpass', 160, 0.22, 900); },
  death()  { tone('sine', 90, 38, 0.8, 0.8); noiseHit(0.5, 'lowpass', 500, 0.5, 90); },
  tick()   { noiseHit(0.014, 'highpass', 2600, 0.055); tone('square', 950, null, 0.012, 0.03); },
  heart()  { tone('sine', 58, 36, 0.13, 0.30); tone('sine', 50, 34, 0.10, 0.20, 0.17); },
  wave()   { tone('sine', 220, 330, 0.22, 0.16); },
  quote()  { tone('triangle', 523, 660, 0.16, 0.10); },
  empty()  { tone('square', 300, null, 0.04, 0.15); },
  laser()  { tone('sawtooth', 180, 820, 1.0, 0.05); },
  sniper() { noiseHit(0.08, 'highpass', 1800, 0.5); tone('square', 200, 55, 0.12, 0.3); },
  dash()   { noiseHit(0.18, 'lowpass', 1400, 0.3, 150); },
  shieldHit() { tone('triangle', 1250, 320, 0.2, 0.3); noiseHit(0.1, 'highpass', 2200, 0.2); },
  pickup() { tone('triangle', 660, 990, 0.13, 0.2); },
  pulse() { tone('sawtooth', 300, 50, 0.8, 0.2); noiseHit(0.6, 'lowpass', 400, 0.35, 80); },
  hurt() { tone('sawtooth', 160, 60, 0.18, 0.3); noiseHit(0.1, 'lowpass', 500, 0.3); },
  smg() { noiseHit(0.05, 'bandpass', 1800, 0.3); tone('square', 260, 90, 0.05, 0.18); },
  rail() { tone('sawtooth', 1300, 80, 0.35, 0.3); noiseHit(0.3, 'highpass', 2200, 0.22); },
  swarm() { for (let i2 = 0; i2 < 3; i2++) tone('triangle', 480 + i2 * 140, 760 + i2 * 140, 0.09, 0.1, i2 * 0.035); },
  shotgun() { noiseHit(0.18, 'lowpass', 900, 0.6, 200); tone('sine', 95, 45, 0.16, 0.4); }
};

/* ---------- 输入 ---------- */
const keys = {};
const mouse = { x: W / 2, y: H / 2 - 200, down: false };
addEventListener('keydown', e => {
  keys[e.code] = true;
  initAudio();
  if (['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)) e.preventDefault();
  if (e.code === 'Space' && state === 'playing' && !paused) doDash();
  if (e.code === 'KeyR' && state === 'dead') restart();
  if (e.code === 'KeyM') toggleMute();
  if (e.code === 'KeyV') { settings.shake = !settings.shake; saveSettings(); }
  if (e.code === 'BracketLeft' || e.code === 'BracketRight') {
    settings.vol = clamp(+(settings.vol + (e.code === 'BracketRight' ? 0.1 : -0.1)).toFixed(2), 0, 1);
    saveSettings(); if (master && !muted) master.gain.value = settings.vol;
  }
  if (e.code === 'KeyQ' && state === 'playing' && player && player.wKind && player.wAmmo > 0 && player.wTime > 0) {
    player.wpn = player.wpn === 'pistol' ? player.wKind : 'pistol';
    sfx.reload0();
  }
  if (e.code === 'KeyP' && state === 'playing') paused = !paused;
  if ((e.code === 'KeyR') && state === 'playing') tryReload();
});
addEventListener('keyup', e => keys[e.code] = false);
canvas.addEventListener('mousemove', e => {
  const r = canvas.getBoundingClientRect();
  mouse.x = (e.clientX - r.left) / r.width * W;
  mouse.y = (e.clientY - r.top) / r.height * H;
});
canvas.addEventListener('mousedown', e => {
  if (e.button !== 0) return;
  initAudio();
  for (const b of uiButtons)
    if (mouse.x >= b.x && mouse.x <= b.x + b.w && mouse.y >= b.y && mouse.y <= b.y + b.h) { b.action(); return; }
  if (state === 'codex') return;
  if (state === 'title') { startGame(); return; }
  if (state === 'dead')  { restart();     return; }
  mouse.down = true;
});
addEventListener('mouseup', () => mouse.down = false);
canvas.addEventListener('contextmenu', e => e.preventDefault());

/* ---------- 触屏双摇杆 ---------- */
const touchState = { move: null, aim: null };
function touchXY(t) {
  const r = canvas.getBoundingClientRect();
  return { x: (t.clientX - r.left) / r.width * W, y: (t.clientY - r.top) / r.height * H };
}
canvas.addEventListener('touchstart', e => {
  e.preventDefault(); initAudio();
  if (state === 'title') { startGame(); return; }
  if (state === 'dead') { restart(); return; }
  for (const t of e.changedTouches) {
    const p = touchXY(t);
    let hitUI = false;
    for (const b of uiButtons)
      if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) { b.action(); hitUI = true; break; }
    if (hitUI) continue;
    for (const b of ACT_BTNS)
      if (Math.hypot(p.x - b.x, p.y - b.y) <= b.r + 8) { b.action(); hitUI = true; break; }
    if (hitUI) continue;
    if (p.x < W / 2 && !touchState.move) touchState.move = { id: t.identifier, ox: p.x, oy: p.y, x: p.x, y: p.y };
    else if (!touchState.aim) touchState.aim = { id: t.identifier, ox: p.x, oy: p.y, x: p.x, y: p.y };
  }
}, { passive: false });
canvas.addEventListener('touchmove', e => {
  e.preventDefault();
  for (const t of e.changedTouches) {
    const p = touchXY(t);
    for (const k of ['move', 'aim'])
      if (touchState[k] && touchState[k].id === t.identifier) { touchState[k].x = p.x; touchState[k].y = p.y; }
  }
}, { passive: false });
for (const ev of ['touchend', 'touchcancel']) canvas.addEventListener(ev, e => {
  for (const t of e.changedTouches)
    for (const k of ['move', 'aim'])
      if (touchState[k] && touchState[k].id === t.identifier) { touchState[k] = null; if (k === 'aim') mouse.down = false; }
});

function iconBtn(x, y, r, action, drawFn) {
  const hov = Math.hypot(mouse.x - x, mouse.y - y) <= r + 2;
  uiButtons.push({ x: x - r - 4, y: y - r - 4, w: (r + 4) * 2, h: (r + 4) * 2, action });
  ctx.save();
  ctx.globalAlpha = hov ? 0.95 : 0.55;
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
  drawFn(x, y);
  ctx.restore();
}
function drawFsGlyph(x, y) {
  const s = 5, g = 3;
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
  [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sy]) => {
    ctx.beginPath();
    ctx.moveTo(x + sx * (s + g), y + sy * (s + g) - sy * s);
    ctx.lineTo(x + sx * (s + g), y + sy * (s + g));
    ctx.lineTo(x + sx * (s + g) - sx * s, y + sy * (s + g));
    ctx.stroke();
  });
}
function drawPauseGlyph(x, y) {
  ctx.fillStyle = '#fff';
  ctx.fillRect(x - 5, y - 6, 3.5, 12);
  ctx.fillRect(x + 2, y - 6, 3.5, 12);
}
function drawPlayGlyph(x, y) {
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.moveTo(x - 4, y - 7); ctx.lineTo(x + 7, y); ctx.lineTo(x - 4, y + 7);
  ctx.closePath(); ctx.fill();
}

/* ---------- UI 设计系统 ---------- */
function panel(x, y, w, h, opt = {}) {
  ctx.save();
  const a = opt.alpha ?? 0.05;
  const g = ctx.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, 'rgba(255,255,255,' + a + ')');
  g.addColorStop(1, 'rgba(255,255,255,' + (a / 2.5) + ')');
  ctx.fillStyle = g;
  roundRectPath(x, y, w, h, opt.r ?? 8); ctx.fill();
  ctx.strokeStyle = opt.border || 'rgba(255,255,255,0.14)'; ctx.lineWidth = 1; ctx.stroke();
  const t = 10;
  ctx.strokeStyle = opt.tick || 'rgba(224,49,49,0.85)'; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y + t); ctx.lineTo(x, y); ctx.lineTo(x + t, y);
  ctx.moveTo(x + w - t, y + h); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w, y + h - t);
  ctx.stroke();
  ctx.restore();
}
function sectionHeader(x, y, cn, en) {
  ctx.textAlign = 'left';
  ctx.fillStyle = '#e03131'; ctx.fillRect(x, y - 16, 34, 3);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 34px ' + FONT;
  ctx.fillText(cn, x, y + 24);
  ls('3px');
  ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.font = EN;
  ctx.fillText(en, x, y + 48);
  ls('0px');
}
function vib(ms) {
  try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {}
}
function toggleMute() {
  muted = !muted;
  if (master) master.gain.value = muted ? 0 : settings.vol;
  try { localStorage.setItem('tf_muted', JSON.stringify(muted)); } catch (e4) {}
}
function drawSpeakerGlyph(x, y, isMuted) {
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(x - 8, y - 3); ctx.lineTo(x - 4, y - 3); ctx.lineTo(x, y - 7); ctx.lineTo(x, y + 7); ctx.lineTo(x - 4, y + 3); ctx.lineTo(x - 8, y + 3);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
  if (isMuted) {
    ctx.beginPath();
    ctx.moveTo(x + 3, y - 5); ctx.lineTo(x + 10, y + 5);
    ctx.moveTo(x + 10, y - 5); ctx.lineTo(x + 3, y + 5);
    ctx.stroke();
  } else {
    ctx.beginPath(); ctx.arc(x + 2, y, 4, -0.9, 0.9); ctx.stroke();
    ctx.beginPath(); ctx.arc(x + 2, y, 7, -0.9, 0.9); ctx.stroke();
  }
}
function dots(x, y, n, total = 3) {
  for (let i = 0; i < total; i++) {
    ctx.fillStyle = i < n ? '#e03131' : 'rgba(255,255,255,0.15)';
    ctx.beginPath(); ctx.arc(x + i * 13, y, 3.4, 0, TAU); ctx.fill();
  }
}

/* ---------- 全局状态 ---------- */
let state = 'loading';            // loading | title | playing | dead
let paused = false;
let floorPattern = null;
let timeSmooth = 0, timePulse = 0, wasFrozen = true;
let shake = 0, zoomPulse = 0, hitStop = 0, redFlash = 0;
let wave = 0, kills = 0, playT = 0, score = 0;
let combo = 0, comboT = 0, maxCombo = 0, grazes = 0;
let ammo = 8, MAG = 8, reloadT = 0;
let waveBanner = 0, waveBannerText = '', quoteText = '', quoteT = 0;
let demoT = 0, deadLine = '', tickT = 0, hbT = 0, slowAllT = 0, slowmoT = 0, whiteFlash = 0, bgmStep = 0, bgmT = 0;
const BGM_PAT = [0, 3, 7, 10, 12, 10, 7, 3, 0, 3, 8, 7, 5, 3, 2, -2];
const WPN = {
  pistol: { name: '手枪', en: 'PISTOL' },
  shotgun: { name: '霰弹', en: 'SCATTER' },
  smg: { name: '微冲', en: 'SMG' },
  rail: { name: '磁轨', en: 'RAILGUN' },
  swarm: { name: '蜂群', en: 'SWARM' },
};
const WDATA = {
  shotgun: { ammo: 6, time: 12 },
  smg: { ammo: 30, time: 10 },
  rail: { ammo: 4, time: 12 },
  swarm: { ammo: 12, time: 10 },
};

const BSTYLE = {
  p:     { gs: 8,  trail: 14, wm: 1.0,  core: '#ffffff' },
  sg:    { gs: 10, trail: 12, wm: 1.5,  core: '#fff3d6' },
  smg:   { gs: 6,  trail: 8,  wm: 0.8,  core: '#f4ffd6' },
  hom:   { gs: 5,  trail: 20, wm: 0.6,  core: '#d6ffe9' },
  focus: { gs: 11, trail: 22, wm: 1.2,  core: '#eaffff' },
  e:     { gs: 8,  trail: 14, wm: 1.0,  core: '#ffffff' },
};
const STAGES = [
  { key: 'std', cn: '标准', en: 'STANDARD' },
  { key: 'storm', cn: '雷雨', en: 'STORM' },
  { key: 'magma', cn: '熔池', en: 'MAGMA' },
  { key: 'fog', cn: '迷雾', en: 'FOG' },
  { key: 'lowg', cn: '低重力', en: 'LOW-G' },
];
let player, bullets, enemies, shards, telegraphs, flashes, floats, rings, dusts = [], stains = [], items = [], covers = [], hist = [], deathReplay = null, replayT = 0, moments = [], mines = [], supT = 0, focusT = 0, rains = [], pools = [], fogs = [], poolGrace = 0, stageKey = 'std', stageName = '标准 STANDARD', crates = [], crateT = 6, shots = 0, hitsN = 0, hitMarkT = 0, beams = []
let best = { score: 0, wave: 0, kills: 0 };
try { best = JSON.parse(localStorage.getItem('tf_best_v2')) || best; } catch (e) {}
let top5 = [];
try { top5 = JSON.parse(localStorage.getItem('tf_top5') || '[]'); } catch (e) {}
let lastRun = null, lastDiff = null;
try { lastRun = JSON.parse(localStorage.getItem('tf_last') || 'null'); } catch (e) {}
let settings = { vol: 0.5, shake: true };
try { Object.assign(settings, JSON.parse(localStorage.getItem('tf_settings') || '{}')); } catch (e) {}
if (!(settings.vol > 0.15)) settings.vol = 0.5;
function saveSettings() { try { localStorage.setItem('tf_settings', JSON.stringify(settings)); } catch (e) {} }

/* ---------- 生成/台词 ---------- */
function spawnPoint() {
  for (let i = 0; i < 24; i++) {
    const side = Math.random() * 4 | 0;
    const p = side === 0 ? [rand(ARENA.x + 70, ARENA.x + ARENA.w - 70), ARENA.y + 50]
            : side === 1 ? [rand(ARENA.x + 70, ARENA.x + ARENA.w - 70), ARENA.y + ARENA.h - 50]
            : side === 2 ? [ARENA.x + 50, rand(ARENA.y + 70, ARENA.y + ARENA.h - 70)]
            :              [ARENA.x + ARENA.w - 50, rand(ARENA.y + 70, ARENA.y + ARENA.h - 70)];
    if (dist2(p[0], p[1], player.x, player.y) > 360 * 360) return p;
  }
  return [ARENA.x + 60, ARENA.y + 60];
}

function waveComp(n) {
  return {
    shooter: Math.min(7, 1 + Math.ceil(n * 0.45)),
    rusher:  Math.min(6, Math.floor(n * 0.55)),
    sniper:  n >= 3 ? Math.min(3, 1 + Math.floor((n - 3) / 3)) : 0,
    miner:   n >= 6 && n % 2 === 0 ? 1 : 0,
    echo:    n >= 7 ? Math.min(2, 1 + Math.floor((n - 7) / 4)) : 0,
    heavy:   n >= 4 ? Math.min(3, Math.floor((n - 1) / 3)) : 0,
  };
}

function nextWave() {
  wave++;
  if (wave > 1) { player.hp = player.hpMax; addFloat(player.x, player.y - 52, '生命回满', '#7bd88f', 16); }
  if (wave % 5 === 0) {
    const [bx0, by0] = spawnPoint();
    telegraphs.push({ x: bx0, y: by0, t: 1.8, dur: 1.8, kind: 'boss' });
    for (let i = 0; i < 2; i++) { const [bx2, by2] = spawnPoint(); telegraphs.push({ x: bx2, y: by2, t: 1.5, dur: 1.5, kind: 'shooter' }); }
    waveBanner = 2.8; waveBannerText = 'BOSS · 红晶守卫';
  } else {
    const comp = waveComp(wave);
    const list = [];
    for (const k in comp) for (let i = 0; i < comp[k]; i++) list.push(k);
    while (list.length) {
      const i = Math.random() * list.length | 0;
      const kind = list.splice(i, 1)[0];
      const [x, y] = spawnPoint();
      telegraphs.push({ x, y, t: 1.1, dur: 1.1, kind });
    }
    waveBanner = 2.4; waveBannerText = '第 ' + wave + ' 波';
  }
  if (wave >= 3 && wave % 3 === 0) {
    const kind = ['slow', 'shotgun', 'slow'][(wave / 3 - 1) % 3];
    items.push({ x: rand(ARENA.x + 150, ARENA.x + ARENA.w - 270), y: rand(ARENA.y + 150, ARENA.y + ARENA.h - 270), kind, t: 0 });
  }
  const stagePool = STAGES.filter(s2 => s2.key !== stageKey);
  const stg = stagePool[Math.random() * stagePool.length | 0];
  stageKey = stg.key; stageName = stg.cn + ' ' + stg.en;
  if (stageKey === 'magma') {
    pools = [];
    for (let i2 = 0; i2 < 2; i2++) pools.push({ x: rand(ARENA.x + 180, ARENA.x + ARENA.w - 260), y: rand(ARENA.y + 160, ARENA.y + ARENA.h - 240), r: rand(70, 95) });
  } else pools = [];
  fogs = stageKey === 'fog' ? [0, 1, 2].map(() => ({ x: rand(ARENA.x + 120, ARENA.x + ARENA.w - 120), y: rand(ARENA.y + 100, ARENA.y + ARENA.h - 100), r: rand(115, 150), vx: rand(-9, 9), vy: rand(-7, 7) })) : [];
  rains = stageKey === 'storm' ? rains : [];
  waveBannerText += ' · ' + stg.cn;
  quoteText = randQuote(); quoteT = 2.4;
  sfx.wave(); sfx.quote();
}

function addFloat(x, y, text, color, size = 22) {
  floats.push({ x, y, text, color, size, t: 0.9, vy: -46 });
}

/* ---------- 实体 ---------- */
function fireBullet(x, y, angle, speed, fromPlayer, tint, life, pierce, bkind) {
  if (fromPlayer) shots++;
  if (stageKey === 'lowg') speed *= 0.7;
  else if (stageKey === 'storm') speed *= 1.12;
  bullets.push({
    x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
    r: 5.5, fromPlayer, trail: [], tint: tint || '#e9e9ee',
    grazed: false, tw: rand(0, TAU), life: life === undefined ? Infinity : life, pierce: pierce || 0, kind: bkind || (fromPlayer ? 'p' : 'e'),
  });
}

function shatter(x, y, color, n, power = 1) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, TAU), sp = rand(60, 430 * power);
    shards.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      rot: rand(0, TAU), vr: rand(-9, 9), size: rand(4, 13) * power,
      color, life: rand(0.7, 1.7) });
  }
}

function wallSparks(x, y) {
  for (let i = 0; i < 5; i++) {
    const a = rand(0, TAU);
    shards.push({ x, y, vx: Math.cos(a) * 260, vy: Math.sin(a) * 260,
      rot: a, vr: 0, size: 2.2, color: '#8a8a92', life: 0.35 });
  }
}

function killPlayer() {
  if (state !== 'playing') return;
  state = 'dead';
  deadLine = DEATH_LINES[Math.random() * DEATH_LINES.length | 0];
  shatter(player.x, player.y, '#2a2a30', 30, 1.2);
  shake = 26; redFlash = 1; whiteFlash = Math.max(whiteFlash, 0.12);
  deathReplay = DEMO ? null : hist.slice();
  replayT = 0;
  top5.push({ s: score, w: wave, k: kills });
  top5.sort((a, b) => b.s - a.s); top5 = top5.slice(0, 5);
  try { localStorage.setItem('tf_top5', JSON.stringify(top5)); } catch (e2) {}
  lastDiff = lastRun ? score - lastRun.score : null;
  try { localStorage.setItem('tf_last', JSON.stringify({ score, wave, kills })); } catch (e2) {}
  sfx.death();
  if (score > best.score) {
    best = { score, wave, kills };
    try { localStorage.setItem('tf_best_v2', JSON.stringify(best)); } catch (e) {}
  }
  if (DEMO) setTimeout(restart, 1600);
}

function damagePlayer() {
  if (player.invulnT > 0) return;
  if (player.shield > 0) {
    player.shield--;
    player.invulnT = 0.35;
    rings.push({ x: player.x, y: player.y, r: 22, v: 700, a: 0.65, c: '#8fb0ff' });
    rings.push({ x: player.x, y: player.y, r: 30, v: 1000, a: 0.5, c: '#cfe0ff' });
    for (let i2 = bullets.length - 1; i2 >= 0; i2--) {
      const b3 = bullets[i2];
      if (!b3.fromPlayer && dist2(b3.x, b3.y, player.x, player.y) < 220 * 220) {
        shatter(b3.x, b3.y, '#8fb0ff', 3, 0.4);
        bullets.splice(i2, 1);
      }
    }
    for (const en of enemies) {
      const kx3 = en.x - player.x, ky3 = en.y - player.y;
      const k3 = Math.hypot(kx3, ky3) || 1;
      if (k3 < 170) { en.x += kx3 / k3 * (170 - k3) * 0.9; en.y += ky3 / k3 * (170 - k3) * 0.9; }
    }
    shatter(player.x, player.y, '#9fc0ff', 10, 0.8);
    addFloat(player.x, player.y - 36, '护盾 -1', '#8fb0ff', 20);
    vib(60);
    sfx.shieldHit();
    return;
  }
  player.hp--;
  player.invulnT = 1.0;
  redFlash = Math.max(redFlash, 0.45);
  shake = Math.max(shake, 10);
  vib(90);
  addFloat(player.x, player.y - 36, '-1', '#ff5252', 22);
  sfx.hurt();
  if (player.hp <= 0) killPlayer();
}

function addScore(base) {
  combo++; comboT = 3;
  maxCombo = Math.max(maxCombo, combo);
  const mult = Math.min(5, 1 + Math.floor(combo / 3));
  score += base * mult;
  sfx.kill(combo);
  if (combo > 0 && combo % 3 === 0) { quoteText = randQuote(); quoteT = 1.6; sfx.quote(); }
  if ((combo === 8 || combo === 16) && moments.length < 3) {
    try { moments.push(canvas.toDataURL('image/jpeg', 0.62)); } catch (e5) {}
  }
}

function killEnemyAt(idx) {
  const e = enemies[idx];
  kills++;
  vib(25);
  rings.push({ x: e.x, y: e.y, r: 6, v: 640, a: 0.7, c: '#ffb3b3' });
  whiteFlash = Math.max(whiteFlash, 0.07);
  shatter(e.x, e.y, '#ffb3b3', 5, 0.45);
  addScore(e.kind === 'boss' ? 2000 : e.kind === 'sniper' ? 150 : e.kind === 'echo' ? 250 : e.kind === 'miner' ? 200 : e.kind === 'rusher' ? 120 : e.kind === 'shooter' ? 100 : 300);
  if (e.kind === 'boss') {
    slowmoT = 1.2; shake = 30; whiteFlash = 0.15;
    quoteText = '守卫已破 · WARDEN DOWN'; quoteT = 2.6;
    shatter(e.x, e.y, '#e03131', 60, 1.7);
    stains.push({ x: e.x, y: e.y, r: 72, life: 6 });
    items.push({ x: e.x - 34, y: e.y, kind: 'shield', t: 0 });
    items.push({ x: e.x + 34, y: e.y, kind: 'slow', t: 0 });
    if (player.hp < player.hpMax) { player.hp = Math.min(player.hpMax, player.hp + 1); addFloat(player.x, player.y - 52, '生命 +1', '#7bd88f', 20); }
    sfx.death();
  }
  shatter(e.x, e.y, '#e03131', e.kind === 'heavy' ? 34 : 22, e.kind === 'heavy' ? 1.3 : 1);
  stains.push({ x: e.x, y: e.y, r: e.r * 1.5, life: 4 });
  if (stains.length > 24) stains.shift();
  addFloat(e.x, e.y - 30, '×' + Math.min(5, 1 + Math.floor(combo / 3)), '#ff7b7b', 20);
  shake = Math.max(shake, e.kind === 'heavy' ? 16 : 9);
  zoomPulse = 0.016;
  hitStop = 0.045;
  sfx.shatter();
  enemies.splice(idx, 1);
}

function doDash() {
  if (state !== 'playing' || paused || player.dashCd > 0) return;
  const dl = Math.hypot(player.lastIx || 0, player.lastIy || 0);
  const dxn = dl > 0.01 ? player.lastIx / dl : Math.cos(player.angle);
  const dyn = dl > 0.01 ? player.lastIy / dl : Math.sin(player.angle);
  player.vx = dxn * 950; player.vy = dyn * 950;
  player.dashT = 0.15; player.dashCd = 1.2;
  player.invulnT = Math.max(player.invulnT, 0.24);
  timePulse = Math.max(timePulse, 0.5);
  shake = Math.max(shake, 3);
  sfx.dash();
  rings.push({ x: player.x, y: player.y, r: 8, v: 820, a: 0.5, c: '#dfe8ff' });
}

function switchWeapon(w) {
  if (player.wpn === w) return;
  player.wpn = w;
  if (w === 'pistol') addFloat(player.x, player.y - 40, '切回手枪', '#c9c9d4', 16);
  sfx.reload0();
}

function tryReload() {
  if (player.wpn !== 'pistol') return;
  if (reloadT > 0 || ammo === MAG) return;
  reloadT = 1.1;
  sfx.reload0();
}

/* ---------- 开始/重开 ---------- */
function startGame() {
  state = 'playing'; paused = false;
  wave = BOSS_START ? 4 : 0; kills = 0; playT = 0; score = 0;
  combo = 0; comboT = 0; maxCombo = 0; grazes = 0;
  ammo = MAG; reloadT = 0;
  timeSmooth = 0; timePulse = 0; wasFrozen = true;
  shake = 0; zoomPulse = 0; hitStop = 0; redFlash = 0;
  demoT = 0;
  player = { x: W / 2, y: H / 2, vx: 0, vy: 0, r: 20, angle: -Math.PI / 2, fireCd: 0, trail: [], dashT: 0, dashCd: 0, invulnT: 0, shield: 0, hp: 5, hpMax: 5, weapon: 'pistol', wpn: 'pistol', wKind: '', wAmmo: 0, wTime: 0, wTimeMax: 1 };
  bullets = []; enemies = []; shards = []; telegraphs = []; flashes = []; floats = []; rings = [];
  dusts = [];
  for (let i = 0; i < 46; i++)
    dusts.push({ x: rand(ARENA.x, ARENA.x + ARENA.w), y: rand(ARENA.y, ARENA.y + ARENA.h),
      vx: rand(-9, 9), vy: rand(-7, 7), r: rand(0.8, 2.3), ph: rand(0, TAU) });
  tickT = 0; hbT = 0; slowAllT = 0; slowmoT = 0; stains = []; items = []; mines = []; supT = 0; focusT = 0; shots = 0; hitsN = 0; hitMarkT = 0; beams = []; crates = []; crateT = 5; crateBag = ['rail', 'swarm'].sort(() => Math.random() - 0.5).concat(['shotgun', 'smg']); rains = []; pools = []; fogs = []; poolGrace = 0; stageKey = 'std'; stageName = '标准 STANDARD';
  covers = makeCovers(); hist = []; deathReplay = null; replayT = 0; moments = []; bgmStep = 0; bgmT = 0;
  const wq = new URLSearchParams(location.search).get('wpn');
  if (wq && WDATA[wq]) {
    player.wKind = wq; player.wpn = wq;
    player.wAmmo = WDATA[wq].ammo;
    player.wTime = player.wTimeMax = WDATA[wq].time;
  }
  nextWave();
}
const restart = startGame;

/* ---------- 更新 ---------- */
function update(dt) {
  if (state === 'dead') { deathUpdate(dt); return; }
  if (state !== 'playing' || paused) return;
  if (hitStop > 0) { hitStop -= dt; return; }   // 击杀定帧
  playT += dt;

  /* --- 玩家移动 --- */
  let ix = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
  let iy = (keys.KeyS || keys.ArrowDown ? 1 : 0) - (keys.KeyW || keys.ArrowUp ? 1 : 0);
  if (ix && iy) { ix *= 0.7071; iy *= 0.7071; }
  if (touchState.move) {
    const mdx = touchState.move.x - touchState.move.ox, mdy = touchState.move.y - touchState.move.oy;
    const ml = Math.hypot(mdx, mdy);
    if (ml > 6) { const mg = Math.min(1, ml / 44); ix = mdx / ml * mg; iy = mdy / ml * mg; }
    else { ix = 0; iy = 0; }
  }
  if (touchState.move) {
    const mdx = touchState.move.x - touchState.move.ox, mdy = touchState.move.y - touchState.move.oy;
    const ml = Math.hypot(mdx, mdy);
    if (ml > 6) { const mg = Math.min(1, ml / 44); ix = mdx / ml * mg; iy = mdy / ml * mg; }
    else { ix = 0; iy = 0; }
  }
  if (DEMO) {
    demoT += dt;
    ix = Math.cos(demoT * 2.3) + Math.cos(demoT * 0.9) * 0.6;
    iy = Math.sin(demoT * 2.7);
    for (const rc of covers) {
      const nx2 = clamp(player.x, rc.x, rc.x + rc.w), ny2 = clamp(player.y, rc.y, rc.y + rc.h);
      const ddx = player.x - nx2, ddy = player.y - ny2, dv2 = ddx * ddx + ddy * ddy;
      if (dv2 < 4900 && dv2 > 0.01) { const dv = Math.sqrt(dv2); ix += ddx / dv * 1.6; iy += ddy / dv * 1.6; }
    }
    const m = Math.hypot(ix, iy) || 1; ix /= m; iy /= m;
    let bd = Infinity, bestE = null;
    for (const e of enemies) { const d2 = dist2(e.x, e.y, player.x, player.y); if (d2 < bd) { bd = d2; bestE = e; } }
    if (bestE) { mouse.x = bestE.x; mouse.y = bestE.y; }
    mouse.down = !!bestE;
  }
  const ACC = 2600, MAXV = stageKey === 'lowg' ? 335 : 290;
  player.dashCd = Math.max(0, player.dashCd - dt);
  player.invulnT = Math.max(0, player.invulnT - dt);
  player.lastIx = ix; player.lastIy = iy;
  if ((keys.Space || keys.ShiftLeft) && player.dashCd <= 0) doDash();
  player.vx += ix * ACC * dt;
  player.vy += iy * ACC * dt;
  if (player.dashT > 0) {
    player.dashT -= dt;
  } else {
    const damp = Math.pow(0.0001, dt);
    player.vx *= damp; player.vy *= damp;
    const sp2 = Math.hypot(player.vx, player.vy);
    if (sp2 > MAXV) { player.vx *= MAXV / sp2; player.vy *= MAXV / sp2; }
  }
  const sp = Math.hypot(player.vx, player.vy);
  const px0 = player.x, py0 = player.y;
  player.x = clamp(player.x + player.vx * dt, ARENA.x + player.r, ARENA.x + ARENA.w - player.r);
  player.y = clamp(player.y + player.vy * dt, ARENA.y + player.r, ARENA.y + ARENA.h - player.r);
  for (const rc of covers) { const pv = circleRectPush(player.x, player.y, player.r, rc); if (pv) { player.x = pv.px; player.y = pv.py; } }
  if (stageKey === 'magma') {
    poolGrace -= dt;
    for (const p2 of pools)
      if (dist2(player.x, player.y, p2.x, p2.y) < (p2.r * 0.8) ** 2) {
        if (poolGrace <= 0 && player.invulnT <= 0) { damagePlayer(); poolGrace = 0.6; }
        break;
      }
  }
  if (touchState.aim) {
    const adx = touchState.aim.x - touchState.aim.ox, ady = touchState.aim.y - touchState.aim.oy;
    const al = Math.hypot(adx, ady);
    if (al > 12) { mouse.x = player.x + adx / al * 140; mouse.y = player.y + ady / al * 140; mouse.down = true; }
    else mouse.down = false;
  }
  if (touchState.aim) {
    const adx = touchState.aim.x - touchState.aim.ox, ady = touchState.aim.y - touchState.aim.oy;
    const al = Math.hypot(adx, ady);
    if (al > 12) { mouse.x = player.x + adx / al * 140; mouse.y = player.y + ady / al * 140; mouse.down = true; }
    else mouse.down = false;
  }
  player.angle = Math.atan2(mouse.y - player.y, mouse.x - player.x);
  player.fireCd = Math.max(0, player.fireCd - dt);
  /* 移动残影 */
  if (sp > 90) {
    player.trail.push([player.x, player.y, player.angle]);
    if (player.trail.length > 9) player.trail.shift();
  } else if (player.trail.length) player.trail.shift();
  if (sp > 160 && Math.random() < dt * 14) {
    shards.push({ x: player.x - player.vx * 0.02, y: player.y - player.vy * 0.02,
      vx: -player.vx * 0.12 + rand(-20, 20), vy: -player.vy * 0.12 + rand(-20, 20),
      rot: 0, vr: 0, size: rand(1.6, 3), color: 'rgba(195,200,212,0.55)', life: 0.5, puff: true });
  }

  /* --- 射击 --- */
  if (mouse.down && reloadT <= 0 && ammo <= 0) { tryReload(); }
  if (mouse.down && reloadT <= 0 && player.fireCd <= 0) {
    const mx = player.x + Math.cos(player.angle) * 30;
    const my = player.y + Math.sin(player.angle) * 30;
    if (player.wpn === 'shotgun' || player.wpn === 'smg') {
      if (player.wAmmo <= 0) { switchWeapon('pistol'); player.fireCd = 0.3; }
      else {
        player.wAmmo--;
        if (player.wpn === 'shotgun') {
          player.fireCd = 0.55;
          timePulse = Math.max(timePulse, 0.65);
          for (let pi = 0; pi < 5; pi++)
            fireBullet(mx, my, player.angle + rand(-0.22, 0.22), rand(540, 660), true, '#ffb45c', 0.55, 0, 'sg');
          flashes.push({ x: mx, y: my, a: player.angle, t: 0.12, size: 38, col: '255,160,70' });
          shake = Math.max(shake, 8);
          sfx.shotgun();
        } else {
          player.fireCd = 0.09;
          timePulse = Math.max(timePulse, 0.16);
          fireBullet(mx, my, player.angle + rand(-0.06, 0.06), 700, true, '#d4e88f', undefined, 0, 'smg');
          flashes.push({ x: mx, y: my, a: player.angle, t: 0.045, size: 16, col: '210,255,160' });
          shake = Math.max(shake, 2);
          sfx.smg();
        }
        const side2 = Math.random() < 0.5 ? 1 : -1;
        const ca2 = player.angle + Math.PI / 2 * side2;
        shards.push({ x: player.x + Math.cos(player.angle) * 20, y: player.y + Math.sin(player.angle) * 20,
          vx: Math.cos(ca2) * rand(70, 150), vy: Math.sin(ca2) * rand(70, 150),
          rot: rand(0, TAU), vr: rand(-16, 16), size: 3, color: '#d8b45c', life: rand(0.8, 1.2), shape: 'rect' });
      }
    } else if (player.wpn === 'rail') {
      if (player.wAmmo <= 0) { switchWeapon('pistol'); player.fireCd = 0.3; }
      else {
        player.wAmmo--; shots++;
        player.fireCd = 1.1;
        timePulse = Math.max(timePulse, 0.8);
        let bd = Math.min(rayCoverDist(mx, my, player.angle), rayToWall(mx, my, player.angle));
        const ex = mx + Math.cos(player.angle) * bd, ey = my + Math.sin(player.angle) * bd;
        beams.push({ x1: mx, y1: my, x2: ex, y2: ey, t: 0.35, max: 0.35 });
        let anyHit = false;
        for (let j = enemies.length - 1; j >= 0; j--) {
          const en = enemies[j];
          if (en.birth > 0) continue;
          if (pointSegDist(en.x, en.y, mx, my, ex, ey) < en.r + 6) {
            en.hp -= 3; en.hitFlash = 0.15; anyHit = true;
            shatter(en.x, en.y, '#bff3ff', 4, 0.4);
            if (en.hp <= 0) killEnemyAt(j);
          }
        }
        if (anyHit) { hitsN++; hitMarkT = 0.15; }
        const cv = pointInCover(ex, ey);
        if (cv) {
          cv.hp -= 3;
          wallSparks(ex, ey);
          if (cv.hp <= 0) {
            shatter(cv.x + cv.w / 2, cv.y + cv.h / 2, cv.pal.f0, 16, 1.1);
            covers.splice(covers.indexOf(cv), 1);
          }
        }
        shake = Math.max(shake, 10);
        whiteFlash = Math.max(whiteFlash, 0.05);
        sfx.rail();
      }
    } else if (player.wpn === 'swarm') {
      if (player.wAmmo <= 0) { switchWeapon('pistol'); player.fireCd = 0.3; }
      else {
        player.wAmmo--;
        player.fireCd = 0.4;
        timePulse = Math.max(timePulse, 0.35);
        for (let k = 0; k < 3; k++)
          fireBullet(mx, my, player.angle + rand(-0.5, 0.5), 330, true, '#7dffc4', 3.2, 0, 'hom');
        flashes.push({ x: mx, y: my, a: player.angle, t: 0.06, size: 20, col: '140,255,200' });
        sfx.swarm();
      }
    } else if (ammo > 0) {
      ammo--;
      player.fireCd = 0.15;
      timePulse = 0.5;
      let shotPierce = 0;
      if (focusT >= 1.2) { shotPierce = 2; focusT = 0; addFloat(player.x, player.y - 40, '凝神·透', '#bff3ff', 20); tone('triangle', 880, 1320, 0.14, 0.18); }
      fireBullet(mx, my, player.angle + rand(-0.012, 0.012), 650, true, undefined, undefined, shotPierce);
      flashes.push({ x: mx, y: my, a: player.angle, t: 0.07, size: 26, col: '255,220,120' });
      shake = Math.max(shake, 4);
      sfx.shoot();
      const side = Math.random() < 0.5 ? 1 : -1;
      const caA = player.angle + Math.PI / 2 * side;
      shards.push({ x: player.x + Math.cos(player.angle) * 20, y: player.y + Math.sin(player.angle) * 20,
        vx: Math.cos(caA) * rand(70, 150), vy: Math.sin(caA) * rand(70, 150),
        rot: rand(0, TAU), vr: rand(-16, 16), size: 3, color: '#d8b45c', life: rand(0.9, 1.4), shape: 'rect' });
    } else { sfx.empty(); player.fireCd = 0.25; }
  }
  /* --- 换弹 --- */
  if (reloadT > 0) {
    reloadT -= dt;
    timePulse = Math.max(timePulse, 0.32);     // 换弹时世界缓慢流动（风险窗口）
    if (reloadT <= 0) { ammo = MAG; sfx.reload1(); }
  }

  /* --- 时间系统 --- */
  const moveT = clamp(sp / 130, 0, 1);
  timePulse = Math.max(0, timePulse - dt * 1.55);
  let target = Math.max(moveT, timePulse);
  if (supT > 0) supT -= dt;
  if (supT > 0) target = 1;
  const kk = target < timeSmooth ? 1 - Math.exp(-dt * 6.5) : 1 - Math.exp(-dt * 24);  // 冻结缓入像子弹时间
  timeSmooth += (target - timeSmooth) * kk;
  if (timeSmooth < 0.05 && !wasFrozen) { sfx.freeze(); rings.push({ x: player.x, y: player.y, r: 10, v: 900, a: 0.5, c: '#2258c7' }); }
  if (timeSmooth >= 0.5 && wasFrozen) { sfx.thaw(); rings.push({ x: player.x, y: player.y, r: 10, v: 900, a: 0.4, c: '#c92a2a' }); }
  wasFrozen = timeSmooth < 0.05;
  /* 凝神: 静止蓄力, 解放穿透弹 */
  if (timeSmooth < 0.06) focusT = Math.min(2.2, focusT + dt);
  else focusT = Math.max(0, focusT - dt * 2.5);
  let wdt = dt * timeSmooth;
  if (slowAllT > 0) { slowAllT -= dt; wdt *= 0.5; }
  if (slowmoT > 0) { slowmoT -= dt; wdt *= 0.35; }
  if (padGain) padGain.gain.value = (1 - timeSmooth) * 0.055;

  /* 氛围声: 世界流动=时钟滴答, 冻结=你的心跳 */
  if (AC) {
    if (timeSmooth > 0.35) { tickT -= dt * timeSmooth; if (tickT <= 0) { tickT = 0.5; sfx.tick(); } }
    else { hbT -= dt; if (hbT <= 0) { hbT = 1.15; sfx.heart(); } }
  }
  /* 程序化BGM: 旋律随世界时间步进——冻结时音乐也停 */
  if (AC) {
    const stepDur = 60 / Math.min(140, 96 + wave * 4) / 2;
    bgmT -= wdt;
    if (bgmT <= 0) {
      bgmT += stepDur;
      const semi = BGM_PAT[bgmStep % BGM_PAT.length];
      const f = 110 * Math.pow(2, semi / 12);
      tone('triangle', f, null, 0.16, 0.05);
      if (bgmStep % 4 === 0) tone('sine', f / 2, null, 0.32, 0.06);
      bgmStep++;
    }
  }
  /* 漂浮灰尘: 随世界时间冻结 */
  for (const d of dusts) { d.x += d.vx * wdt; d.y += d.vy * wdt; }
  /* 雨幕: 也随世界时间冻结 */
  if (stageKey === 'storm') {
    if (rains.length < 90) for (let i2 = 0; i2 < 3; i2++) rains.push({ x: rand(ARENA.x, ARENA.x + ARENA.w), y: ARENA.y - 10, v: rand(430, 560), drift: rand(-40, 40) });
    for (let i2 = rains.length - 1; i2 >= 0; i2--) {
      const r2 = rains[i2];
      r2.y += r2.v * wdt; r2.x += r2.drift * wdt;
      if (r2.y > ARENA.y + ARENA.h) rains.splice(i2, 1);
    }
  } else if (rains.length) rains.length = 0;
  if (stageKey === 'fog') for (const f2 of fogs) { f2.x += f2.vx * dt; f2.y += f2.vy * dt; }
  /* 武器时效 */
  if (player.wpn !== 'pistol' && player.wTime > 0) {
    player.wTime -= dt;
    if (player.wTime <= 0) { switchWeapon('pistol'); addFloat(player.x, player.y - 44, '武器时效已尽', '#c9c9d4', 16); }
  }
  /* 武器箱空投 */
  crateT -= dt;
  if (crateT <= 0) {
    crateT = rand(13, 20);
    const ck = ['shotgun', 'smg', 'rail', 'swarm'][Math.random() * 4 | 0];
    crates.push({ x: rand(ARENA.x + 120, ARENA.x + ARENA.w - 120), y: rand(ARENA.y + 120, ARENA.y + ARENA.h - 120), kind: ck, t: 0 });
  }
  for (let i = crates.length - 1; i >= 0; i--) {
    const c2 = crates[i];
    c2.t += dt;
    if (c2.t > 10) { crates.splice(i, 1); continue; }
    if (dist2(c2.x, c2.y, player.x, player.y) < 32 * 32) {
      player.wKind = c2.kind; player.wpn = c2.kind;
      player.wAmmo = WDATA[c2.kind].ammo;
      player.wTime = player.wTimeMax = WDATA[c2.kind].time;
      addFloat(c2.x, c2.y - 26, WPN[c2.kind].name + ' ×' + player.wAmmo, '#ffd9a0', 20);
      sfx.pickup();
      crates.splice(i, 1);
    }
  }
  /* 道具 */
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    it.t += dt;
    if (it.t > 14) { items.splice(i, 1); continue; }
    if (dist2(it.x, it.y, player.x, player.y) < 32 * 32) {
      if (it.kind === 'shield') { player.shield = Math.min(4, player.shield + 2); addFloat(it.x, it.y - 26, '护盾 +2', '#cfe0ff', 20); }
      else if (it.kind === 'shotgun') { player.wKind = 'shotgun'; player.wpn = 'shotgun'; player.wAmmo += 6; player.wTime = Math.max(player.wTime, 12); addFloat(it.x, it.y - 26, '霰弹 +6 (Q切换)', '#ffd9a0', 20); }
      else { slowAllT = 6; addFloat(it.x, it.y - 26, '时间迟缓 6s', '#8fb0ff', 20); }
      sfx.pickup();
      rings.push({ x: it.x, y: it.y, r: 10, v: 540, a: 0.55, c: it.kind === 'shield' ? '#cfe0ff' : '#8fb0ff' });
      items.splice(i, 1);
    }
  }
  /* 血渍渐隐 */
  for (let i = stains.length - 1; i >= 0; i--) { stains[i].life -= wdt; if (stains[i].life <= 0) stains.splice(i, 1); }
  /* 磐雷: 引信同样遵守时间冻结 */
  for (let i = mines.length - 1; i >= 0; i--) {
    const m2 = mines[i];
    m2.life -= wdt;
    if (m2.arm > 0) { m2.arm -= wdt; continue; }
    const near = dist2(m2.x, m2.y, player.x, player.y) < 80 * 80
      || enemies.some(en => en.birth <= 0 && dist2(m2.x, m2.y, en.x, en.y) < 70 * 70);
    if (near || m2.life <= 0) {
      mines.splice(i, 1);
      rings.push({ x: m2.x, y: m2.y, r: 8, v: 900, a: 0.7, c: '#ff8c42' });
      shatter(m2.x, m2.y, '#ff8c42', 14, 1);
      shake = Math.max(shake, 8); whiteFlash = Math.max(whiteFlash, 0.06);
      noiseHit(0.25, 'lowpass', 700, 0.5, 120);
      if (dist2(m2.x, m2.y, player.x, player.y) < 95 * 95) damagePlayer();
      for (const en of enemies)
        if (en.birth <= 0 && dist2(m2.x, m2.y, en.x, en.y) < 110 * 110) { en.hp -= 2; en.hitFlash = 0.15; }
      for (let j = enemies.length - 1; j >= 0; j--)
        if (enemies[j].hp <= 0) killEnemyAt(j);
    }
  }

  /* --- 连击衰减 --- */
  if (combo > 0) { comboT -= wdt; if (comboT <= 0) combo = 0; }

  /* --- 刷怪 --- */
  for (let i = telegraphs.length - 1; i >= 0; i--) {
    const t = telegraphs[i];
    t.t -= wdt;
    if (t.t <= 0) {
      telegraphs.splice(i, 1);
      if (t.kind === 'shooter')
        enemies.push({ kind: 'shooter', x: t.x, y: t.y, r: 20, hp: 1, angle: -Math.PI / 2, cd: rand(0.8, 1.6), strafe: Math.random() < 0.5 ? 1 : -1, birth: 0.5 });
      else if (t.kind === 'rusher')
        enemies.push({ kind: 'rusher', x: t.x, y: t.y, r: 20, hp: 2, hpMax: 2, angle: -Math.PI / 2, cd: rand(0.2, 0.6), dashT: 0, windT: 0, birth: 0.5 });
      else if (t.kind === 'sniper')
        enemies.push({ kind: 'sniper', x: t.x, y: t.y, r: 18, hp: 1, angle: -Math.PI / 2, cd: rand(1.0, 1.8), aimT: 0, locked: false, lockAngle: 0, strafe: Math.random() < 0.5 ? 1 : -1, birth: 0.5 });
      else if (t.kind === 'miner')
        enemies.push({ kind: 'miner', x: t.x, y: t.y, r: 20, hp: 2, hpMax: 2, angle: -Math.PI / 2, dir: Math.random() < 0.5 ? 1 : -1, dropT: 0.5, birth: 0.5 });
      else if (t.kind === 'echo') {
        const hs2 = hist.length ? hist[Math.max(0, hist.length - 70)] : null;
        enemies.push({ kind: 'echo', x: hs2 ? hs2.p[0] : player.x, y: hs2 ? hs2.p[1] : player.y, r: 20, hp: 2, hpMax: 2, angle: -Math.PI / 2, prog: Math.max(0, hist.length - 70), fireT: rand(1.4, 2.2), birth: 0.7 });
      }
      else if (t.kind === 'boss')
        enemies.push({ kind: 'boss', x: t.x, y: t.y, r: 46, hp: 150, hpMax: 150, angle: -Math.PI / 2, cd: 2.2, spiralA: 0, spiralT: 0, spT: 0, fanT: 0, fanN: 0, fT: 0, atkN: 0, hitFlash: 0, birth: 0.9, pulseCd: 7, pulseTele: 0 });
      else
        enemies.push({ kind: 'heavy', x: t.x, y: t.y, r: 30, hp: 3, angle: -Math.PI / 2, cd: rand(1.6, 2.4), hitFlash: 0, birth: 0.5 });
    }
  }

  /* --- 敌人 AI --- */
  for (const e of enemies) {
    const dx = player.x - e.x, dy = player.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    e.angle = Math.atan2(dy, dx);
    if (e.birth > 0) { e.birth -= wdt; continue; }
    if (e.hitFlash > 0) e.hitFlash -= dt;
    if (e.kind === 'shooter') {
      let mvx = 0, mvy = 0;
      if (d > 430) { mvx = dx / d; mvy = dy / d; }
      else if (d < 260) { mvx = -dx / d; mvy = -dy / d; }
      mvx += -dy / d * e.strafe * 0.6; mvy += dx / d * e.strafe * 0.6;
      e.x += mvx * 95 * wdt; e.y += mvy * 95 * wdt;
      if (Math.random() < wdt * 0.25) e.strafe *= -1;
      e.cd -= wdt;
      if (e.cd <= 0 && d < 660) {
        e.cd = rand(1.5, 2.3);
        fireBullet(e.x + Math.cos(e.angle) * 28, e.y + Math.sin(e.angle) * 28,
                   e.angle + rand(-0.05, 0.05), 430, false, '#ff5252');
        sfx.eshoot();
      }
    } else if (e.kind === 'rusher') {
      if (e.windT > 0) {
        e.windT -= wdt;
        if (e.windT <= 0) { e.dashT = 0.32; sfx.shatter(); }
      } else if (e.dashT > 0) {
        e.dashT -= wdt;
        e.x += Math.cos(e.angle) * 620 * wdt;
        e.y += Math.sin(e.angle) * 620 * wdt;
      } else {
        e.x += dx / d * 135 * wdt;
        e.y += dy / d * 135 * wdt;
        e.cd -= wdt;
        if (d < 230 && e.cd <= 0) { e.cd = 1.6; e.windT = 0.45; }
      }
    } else if (e.kind === 'heavy') { // heavy: 缓慢压迫 + 扇形弹幕
      e.x += dx / d * 52 * wdt;
      e.y += dy / d * 52 * wdt;
      e.stepT = (e.stepT || 0) - wdt;
      if (e.stepT <= 0) { e.stepT = 0.55; rings.push({ x: e.x, y: e.y, r: 4, v: 260, a: 0.3, c: '#ff8888' }); }
      e.cd -= wdt;
      if (e.cd <= 0 && d < 700) {
        e.cd = 2.7;
        for (let i = -2; i <= 2; i++)
          fireBullet(e.x + Math.cos(e.angle) * 34, e.y + Math.sin(e.angle) * 34,
                     e.angle + i * 0.16 + rand(-0.02, 0.02), 380, false, '#ff6b6b');
        sfx.eshoot();
      }
    } else if (e.kind === 'sniper') {
      const mv = (d > 560 ? 1 : 0) - (d < 380 ? 1 : 0);
      e.x += dx / d * mv * 74 * wdt;
      e.y += dy / d * mv * 74 * wdt;
      e.x += -dy / d * e.strafe * 55 * wdt;
      e.y += dx / d * e.strafe * 55 * wdt;
      if (Math.random() < wdt * 0.2) e.strafe *= -1;
      e.cd -= wdt;
      if (e.cd <= 0 && e.aimT <= 0 && d < 820) { e.cd = rand(2.6, 3.4); e.aimT = 1.25; e.locked = false; sfx.laser(); }
      if (e.aimT > 0) {
        e.aimT -= wdt;
        if (!e.locked && e.aimT <= 0.28) { e.locked = true; e.lockAngle = Math.atan2(dy, dx); }
        e.angle = e.locked ? e.lockAngle : Math.atan2(dy, dx);
        if (e.aimT <= 0) {
          fireBullet(e.x + Math.cos(e.angle) * 30, e.y + Math.sin(e.angle) * 30, e.angle, 950, false, '#ff3b3b');
          sfx.sniper();
        }
      }
    } else if (e.kind === 'miner') {
      e.x += e.dir * 82 * wdt;
      e.dropT -= wdt;
      if (e.dropT <= 0 && mines.length < 7) {
        e.dropT = 0.9;
        mines.push({ x: e.x, y: e.y + rand(-10, 10), arm: 0.6, life: 9, ph: rand(0, TAU) });
      }
      if (e.x < ARENA.x + 60 || e.x > ARENA.x + ARENA.w - 60) e.dir *= -1;
    } else if (e.kind === 'echo') {
      e.prog += wdt * 60;
      const hi2 = Math.floor(e.prog);
      if (hi2 < hist.length) {
        e.x = hist[hi2].p[0]; e.y = hist[hi2].p[1]; e.angle = hist[hi2].p[2];
      } else {
        const ddx = player.x - e.x, ddy = player.y - e.y;
        const ddd = Math.hypot(ddx, ddy) || 1;
        e.x += ddx / ddd * 70 * wdt; e.y += ddy / ddd * 70 * wdt;
        e.angle = Math.atan2(ddy, ddx);
      }
      e.fireT -= wdt;
      if (e.fireT <= 0) {
        e.fireT = rand(1.8, 2.6);
        fireBullet(e.x + Math.cos(e.angle) * 26, e.y + Math.sin(e.angle) * 26, e.angle + rand(-0.15, 0.15), 400, false, '#9fb6ff');
        sfx.eshoot();
      }
    } else if (e.kind === 'boss') {
      const mv = (d > 430 ? 1 : 0) - (d < 300 ? 1 : 0);
      e.x += dx / d * mv * 46 * wdt;
      e.y += dy / d * mv * 46 * wdt;
      e.x += -dy / d * 40 * Math.sin(playT * 0.7) * wdt;
      e.y += dx / d * 40 * Math.sin(playT * 0.7) * wdt;
      const phase = e.hp / e.hpMax > 0.66 ? 1 : e.hp / e.hpMax > 0.33 ? 2 : 3;
      e.pulseCd = (e.pulseCd || 7) - wdt;
      if (e.pulseTele > 0) {
        e.pulseTele -= wdt;
        if (e.pulseTele <= 0) {
          supT = 2.6;
          rings.push({ x: e.x, y: e.y, r: 20, v: 1100, a: 0.8, c: '#ff3b3b' });
          whiteFlash = Math.max(whiteFlash, 0.1);
          addFloat(W / 2, 150, '时锁冲击! SUPPRESSED', '#ff5252', 26);
          sfx.pulse();
        }
      } else if (e.pulseCd <= 0) {
        e.pulseCd = rand(8, 10);
        e.pulseTele = 0.8;
        tone('sawtooth', 320, 60, 0.7, 0.12);
      }
      e.cd -= wdt;
      if (e.spiralT > 0) {
        e.spiralT -= wdt;
        e.spT -= wdt;
        if (e.spT <= 0) {
          e.spT = phase >= 2 ? 0.075 : 0.095;
          e.spiralA += 0.42;
          fireBullet(e.x, e.y, e.spiralA, 300, false, '#ff5252');
          if (phase >= 2) fireBullet(e.x, e.y, e.spiralA + Math.PI, 300, false, '#ff5252');
        }
      } else if (e.fanT > 0) {
        e.fanT -= wdt;
        e.fT -= wdt;
        if (e.fT <= 0 && e.fanN < 3) {
          e.fT = 0.5; e.fanN++;
          const n = phase >= 3 ? 9 : 7;
          for (let i2 = 0; i2 < n; i2++)
            fireBullet(e.x, e.y, e.angle + (i2 - (n - 1) / 2) * 0.15, 360, false, '#ff6b6b');
          sfx.eshoot();
        }
      } else if (e.cd <= 0) {
        e.atkN++;
        const roll = e.atkN % 3;
        if (roll === 0 || roll === 1) { e.spiralT = phase >= 3 ? 3.0 : 2.4; e.spT = 0; }
        else if (roll === 2) { e.fanT = 2; e.fanN = 0; e.fT = 0; e.cd = Math.max(e.cd, 1.2); }
        else {
          const [sx2, sy2] = spawnPoint();
          telegraphs.push({ x: sx2, y: sy2, t: 1.0, dur: 1.0, kind: 'shooter' });
          e.cd = 2.2;
        }
      }
    }
    e.x = clamp(e.x, ARENA.x + e.r, ARENA.x + ARENA.w - e.r);
    e.y = clamp(e.y, ARENA.y + e.r, ARENA.y + ARENA.h - e.r);
    if (e.kind !== 'echo') for (const rc of covers) { const pv = circleRectPush(e.x, e.y, e.r, rc); if (pv) { e.x = pv.px; e.y = pv.py; } }
    if (stageKey === 'magma' && e.kind !== 'boss') {
      for (const p3 of pools)
        if (dist2(e.x, e.y, p3.x, p3.y) < (p3.r * 0.85) ** 2) { e.hp -= wdt * 3; e.hitFlash = Math.max(e.hitFlash || 0, 0.06); break; }
    }
  }

  for (let j = enemies.length - 1; j >= 0; j--)
    if (enemies[j].hp <= 0 && enemies[j].birth <= 0) killEnemyAt(j);

  /* --- 敌人互挤 --- */
  for (let i = 0; i < enemies.length; i++)
    for (let j = i + 1; j < enemies.length; j++) {
      const a = enemies[i], b = enemies[j];
      const dx = b.x - a.x, dy = b.y - a.y;
      const rr = a.r + b.r, d2 = dx * dx + dy * dy;
      if (d2 > 0 && d2 < rr * rr) {
        const d = Math.sqrt(d2), push = (rr - d) / d * 0.5;
        a.x -= dx * push; a.y -= dy * push;
        b.x += dx * push; b.y += dy * push;
      }
    }

  /* --- 子弹 --- */
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.trail.push([b.x, b.y]);
    if (b.trail.length > 14) b.trail.shift();
    if (b.kind === 'hom' && enemies.length) {
      let bt2 = null, bd3 = Infinity;
      for (const en of enemies) {
        if (en.birth > 0) continue;
        const d2 = dist2(b.x, b.y, en.x, en.y);
        if (d2 < bd3) { bd3 = d2; bt2 = en; }
      }
      if (bt2) {
        const ta = Math.atan2(bt2.y - b.y, bt2.x - b.x);
        let ca = Math.atan2(b.vy, b.vx);
        let da = ta - ca;
        while (da > Math.PI) da -= TAU;
        while (da < -Math.PI) da += TAU;
        ca += clamp(da, -3.2 * wdt, 3.2 * wdt);
        const sp = Math.hypot(b.vx, b.vy);
        b.vx = Math.cos(ca) * sp; b.vy = Math.sin(ca) * sp;
      }
    }
    b.x += b.vx * wdt; b.y += b.vy * wdt;
    if (b.life < Infinity) { b.life -= wdt; if (b.life <= 0) { shatter(b.x, b.y, b.tint, 3, 0.4); bullets.splice(i, 1); continue; } }
    const hitCv = pointInCover(b.x, b.y);
    if (hitCv) {
      hitCv.hp--;
      wallSparks(b.x, b.y);
      shatter(b.x, b.y, hitCv.pal.f0, 3, 0.5);
      if (hitCv.hp <= 0) {
        shatter(hitCv.x + hitCv.w / 2, hitCv.y + hitCv.h / 2, hitCv.pal.f0, 16, 1.1);
        covers.splice(covers.indexOf(hitCv), 1);
        shake = Math.max(shake, 6);
      }
      bullets.splice(i, 1); continue;
    }
    if (b.x < ARENA.x || b.x > ARENA.x + ARENA.w || b.y < ARENA.y || b.y > ARENA.y + ARENA.h) {
      wallSparks(b.x, b.y); bullets.splice(i, 1); continue;
    }
    if (b.fromPlayer) {
      for (let j = enemies.length - 1; j >= 0; j--) {
        const e = enemies[j];
        if (e.birth > 0) continue;
        if (dist2(b.x, b.y, e.x, e.y) < (b.r + e.r) * (b.r + e.r)) {
          const dmg = b.pierce ? 2 : 1;
          if (!b.hitCounted) { b.hitCounted = true; hitsN++; hitMarkT = 0.12; }
          if ((e.kind === 'heavy' || e.kind === 'boss') && e.hp > dmg) {
            e.hp -= dmg; e.hitFlash = 0.12;
            shatter(b.x, b.y, '#e03131', 5, 0.5);
            sfx.heavyHit();
          } else killEnemyAt(j);
          if (b.pierce > 0) { b.pierce--; }
          else { bullets.splice(i, 1); break; }
        }
      }
    } else {
      const dd = dist2(b.x, b.y, player.x, player.y);
      if (state === 'playing' && player.invulnT <= 0 && dd < (b.r + player.r * 0.8) ** 2) {
        damagePlayer(); bullets.splice(i, 1);
      } else if (!b.grazed && dd < 46 * 46) {       // 擦弹
        b.grazed = true; grazes++; score += 30;
        addFloat(player.x, player.y - 34, '险!', '#8fb0ff', 24);
        hitStop = Math.max(hitStop, 0.03);
        rings.push({ x: player.x, y: player.y, r: 14, v: 520, a: 0.4, c: '#8fb0ff' });
        shatter(player.x, player.y, '#8fb0ff', 3, 0.45);
        sfx.graze();
      }
    }
  }

  /* --- 近身判定 --- */
  if (state === 'playing')
    for (let j = enemies.length - 1; j >= 0; j--) {
      const e = enemies[j];
      if (e.birth > 0) continue;
      if (dist2(e.x, e.y, player.x, player.y) < (e.r + player.r * 0.8) ** 2) {
        if (e.kind === 'heavy') { killEnemyAt(j); continue; }  // heavy 同归于尽也死
        damagePlayer();
      }
    }

  /* --- 碎片/浮字/火光/核波 --- */
  for (let i = shards.length - 1; i >= 0; i--) {
    const p = shards[i];
    p.life -= wdt;
    p.x += p.vx * wdt; p.y += p.vy * wdt;
    p.vx *= Math.pow(0.2, wdt); p.vy *= Math.pow(0.2, wdt);
    p.rot += p.vr * wdt;
    if (p.life <= 0) shards.splice(i, 1);
  }
  for (let i = floats.length - 1; i >= 0; i--) {
    const f = floats[i];
    f.t -= dt; f.y += f.vy * dt;
    if (f.t <= 0) floats.splice(i, 1);
  }
  for (let i = flashes.length - 1; i >= 0; i--)
    if ((flashes[i].t -= dt) <= 0) flashes.splice(i, 1);
  for (let i = beams.length - 1; i >= 0; i--)
    if ((beams[i].t -= dt) <= 0) beams.splice(i, 1);
  for (let i = rings.length - 1; i >= 0; i--) {
    const r = rings[i];
    r.r += r.v * dt; r.a -= dt * 1.4;
    if (r.a <= 0) rings.splice(i, 1);
  }

  /* 回放历史(最近约0.8s) */
  hist.push({ p: [player.x, player.y, player.angle],
    b: bullets.map(b2 => [b2.x, b2.y, b2.fromPlayer ? 1 : 0]),
    e: enemies.map(e2 => [e2.x, e2.y, e2.kind === 'boss' ? 'rusher' : e2.kind === 'shooter' || e2.kind === 'sniper' ? 'shooter' : 'rusher', e2.angle]) });
  if (hist.length > 44) hist.shift();

  /* --- 波次推进 --- */
  const alive = enemies.length + telegraphs.length;
  if (update._prevAlive > 0 && alive === 0) { slowmoT = 0.9; zoomPulse = Math.max(zoomPulse, 0.014); }
  update._prevAlive = alive;
  if (enemies.length === 0 && telegraphs.length === 0) {
    if (!update._rest) update._rest = 1.2;
    update._rest -= wdt;
    if (update._rest <= 0) { update._rest = null; nextWave(); }
  } else update._rest = null;

  shake = Math.max(0, shake - dt * 40);
  zoomPulse = Math.max(0, zoomPulse - dt * 0.08);
  redFlash = Math.max(0, redFlash - dt * 1.6);
  whiteFlash = Math.max(0, whiteFlash - dt * 2.4);
  waveBanner = Math.max(0, waveBanner - dt);
  quoteT = Math.max(0, quoteT - dt);
}

function deathUpdate(dt) {
  replayT += dt;
  const w = dt * 0.16;                        // 死亡后世界以16%速继续
  for (const p of shards) {
    p.life -= w; p.x += p.vx * w; p.y += p.vy * w;
    p.vx *= Math.pow(0.2, w); p.vy *= Math.pow(0.2, w);
    p.rot += p.vr * w;
  }
  for (const r of rings) { r.r += r.v * dt; r.a -= dt * 1.1; }
  for (const f of floats) { f.t -= dt; f.y += f.vy * dt; }
  redFlash = Math.max(0, redFlash - dt * 0.8);
  whiteFlash = Math.max(0, whiteFlash - dt * 2.4);
  shake = Math.max(0, shake - dt * 26);
}

function drawStick(st, anchor, color) {
  const bx = st ? st.ox : anchor.x, by = st ? st.oy : anchor.y;
  ctx.save();
  ctx.globalAlpha = st ? 0.45 : 0.18;
  ctx.strokeStyle = color; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(bx, by, 62, 0, TAU); ctx.stroke();
  let kx = bx, ky = by;
  if (st) {
    const dx3 = st.x - st.ox, dy3 = st.y - st.oy;
    const l4 = Math.min(Math.hypot(dx3, dy3), 42);
    const a4 = Math.atan2(dy3, dx3);
    kx = bx + Math.cos(a4) * l4; ky = by + Math.sin(a4) * l4;
  }
  ctx.fillStyle = color; ctx.globalAlpha = st ? 0.5 : 0.16;
  ctx.beginPath(); ctx.arc(kx, ky, 20, 0, TAU); ctx.fill();
  ctx.restore();
}
function drawActBtn(b, cdFrac = 0, cdText = '') {
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.strokeStyle = b.color; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.stroke();
  ctx.fillStyle = b.color; ctx.font = 'bold 14px ' + FONT;
  ctx.textAlign = 'center';
  ctx.fillText(b.label, b.x, b.y + 5);
  if (cdFrac > 0) {
    ctx.fillStyle = 'rgba(8,8,12,0.55)';
    ctx.beginPath(); ctx.moveTo(b.x, b.y);
    ctx.arc(b.x, b.y, b.r + 1, -Math.PI / 2, -Math.PI / 2 + (1 - cdFrac) * TAU);
    ctx.closePath(); ctx.fill();
    if (cdText) { ctx.fillStyle = '#fff'; ctx.font = 'bold 13px ' + FONT; ctx.fillText(cdText, b.x, b.y + 5); }
  }
  ctx.restore();
}
function toggleFullscreen() {
  try {
    const d = document.documentElement;
    const el = document.fullscreenElement || document.webkitFullscreenElement;
    if (!el) {
      const p = d.requestFullscreen ? d.requestFullscreen() : (d.webkitRequestFullscreen ? d.webkitRequestFullscreen() : null);
      if (p && p.then) p.then(() => { try { screen.orientation.lock('landscape').catch(() => {}); } catch (e6) {} }).catch(() => {});
    } else {
      if (document.exitFullscreen) document.exitFullscreen();
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    }
  } catch (e6) {}
}

/* ---------- 渲染 ---------- */
function drawSprite(name, x, y, angle, r, fallbackColor, alpha = 1, scale = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle + Math.PI / 2);
  ctx.globalAlpha = alpha;
  const im = IMG[name];
  if (im) {
    const s = r * 2.35 * scale;
    ctx.drawImage(im, -s / 2, -s / 2, s, s);
  } else {
    ctx.fillStyle = fallbackColor;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

function shadow(x, y, r) {
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath();
  ctx.ellipse(x + 4, y + 8, r * 1.05, r * 0.62, 0, 0, TAU);
  ctx.fill();
}

function render() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  uiButtons.length = 0;
  /* 画布外底色 */
  ctx.fillStyle = '#0d0d0f';
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  const z = 1 + zoomPulse;
  if (shake > 0.3 || z !== 1) {
    ctx.translate(W / 2, H / 2);
    ctx.scale(z, z);
    ctx.translate(-W / 2, -H / 2);
    if (settings.shake && shake > 0.3) ctx.translate(rand(-shake, shake), rand(-shake, shake));
  }

  /* 地板: 黑色影棚 + 中央光池 */
  const fg = ctx.createRadialGradient(W / 2, H / 2, 60, W / 2, H / 2, W * 0.55);
  fg.addColorStop(0, '#2a2a33');
  fg.addColorStop(0.55, '#1c1c22');
  fg.addColorStop(1, '#121216');
  ctx.fillStyle = fg;
  ctx.fillRect(ARENA.x, ARENA.y, ARENA.w, ARENA.h);
  if (floorPattern) {
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = floorPattern;
    ctx.fillRect(ARENA.x, ARENA.y, ARENA.w, ARENA.h);
    ctx.globalAlpha = 1;
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 1;
  for (let x = ARENA.x + 64; x < ARENA.x + ARENA.w; x += 64) { ctx.beginPath(); ctx.moveTo(x, ARENA.y); ctx.lineTo(x, ARENA.y + ARENA.h); ctx.stroke(); }
  for (let y = ARENA.y + 64; y < ARENA.y + ARENA.h; y += 64) { ctx.beginPath(); ctx.moveTo(ARENA.x, y); ctx.lineTo(ARENA.x + ARENA.w, y); ctx.stroke(); }
  /* 漂浮灰尘(随世界冻结) */
  for (const d of dusts) {
    ctx.globalAlpha = 0.05 + 0.07 * (Math.sin(playT * 2 + d.ph) + 1) / 2;
    ctx.fillStyle = '#cfd6e4';
    ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 1;
  /* 磐雷 */
  for (const m2 of mines) {
    const armed = m2.arm <= 0;
    const blinkOn = (Math.sin(playT * (armed ? 10 : 4) + m2.ph) + 1) / 2 > 0.4;
    ctx.save();
    ctx.translate(m2.x, m2.y);
    ctx.fillStyle = '#2a1518';
    ctx.beginPath(); ctx.arc(0, 0, 11, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(224,49,49,0.5)'; ctx.lineWidth = 1.5; ctx.stroke();
    if (blinkOn) { ctx.fillStyle = armed ? '#ff5252' : '#8a3a3a'; ctx.beginPath(); ctx.arc(0, 0, 4.5, 0, TAU); ctx.fill(); }
    ctx.restore();
  }
  /* 熔池 */
  if (stageKey === 'magma') {
    for (const p3 of pools) {
      const g3 = ctx.createRadialGradient(p3.x, p3.y, p3.r * 0.2, p3.x, p3.y, p3.r);
      g3.addColorStop(0, 'rgba(255,120,50,0.55)');
      g3.addColorStop(0.8, 'rgba(255,90,40,0.25)');
      g3.addColorStop(1, 'rgba(255,90,40,0)');
      ctx.fillStyle = g3;
      ctx.beginPath(); ctx.arc(p3.x, p3.y, p3.r, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255,140,66,' + (0.35 + 0.2 * Math.sin(playT * 3)).toFixed(3) + ')';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(p3.x, p3.y, p3.r * 0.92, 0, TAU); ctx.stroke();
    }
  }
  /* 掩体 */
  for (const rc of covers) {
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(rc.x + 5, rc.y + 7, rc.w, rc.h);
    const cg = ctx.createLinearGradient(rc.x, rc.y, rc.x, rc.y + rc.h);
    cg.addColorStop(0, rc.pal.f0); cg.addColorStop(1, rc.pal.f1);
    ctx.fillStyle = cg;
    roundRectPath(rc.x, rc.y, rc.w, rc.h, 5); ctx.fill();
    if (rc.hp <= 6) {
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1;
      const n2 = 7 - rc.hp;
      for (let i2 = 0; i2 < n2 && i2 < rc.cracks.length; i2++) {
        const k2 = rc.cracks[i2];
        ctx.beginPath(); ctx.moveTo(k2[0], k2[1]); ctx.lineTo(k2[2], k2[3]); ctx.stroke();
      }
    }
    ctx.strokeStyle = rc.pal.rim; ctx.lineWidth = 1.5; ctx.stroke();
  }
  ctx.globalAlpha = 1;
  /* 击杀血渍 */
  for (const st of stains) {
    ctx.globalAlpha = clamp(st.life / 4, 0, 1) * 0.16;
    ctx.fillStyle = '#8a1616';
    ctx.beginPath(); ctx.ellipse(st.x, st.y, st.r, st.r * 0.62, 0, 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 1;
  /* 边框 */
  ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.lineWidth = 2;
  ctx.strokeRect(ARENA.x, ARENA.y, ARENA.w, ARENA.h);
  if (state === 'playing' && timeSmooth < 0.06) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(90,130,255,0.45)'; ctx.lineWidth = 3;
    ctx.strokeRect(ARENA.x, ARENA.y, ARENA.w, ARENA.h);
    ctx.restore();
  }

  if (state === 'codex') { ctx.restore(); renderCodex(); drawGrain(); drawCrosshair(); return; }
  if (state === 'title' || state === 'loading') { ctx.restore(); renderTitle(); return; }

  /* 刷怪预警 */
  for (const t of telegraphs) {
    const p = 1 - t.t / t.dur;
    const heavy = t.kind === 'heavy';
    ctx.strokeStyle = 'rgba(224,49,49,' + (0.7 * (1 - p) + 0.3) + ')';
    ctx.lineWidth = heavy ? 5 : 3;
    ctx.beginPath(); ctx.arc(t.x, t.y, (heavy ? 16 : 10) + p * (heavy ? 46 : 34), 0, TAU); ctx.stroke();
    ctx.fillStyle = 'rgba(224,49,49,0.22)';
    ctx.beginPath(); ctx.arc(t.x, t.y, heavy ? 30 : 22, 0, TAU); ctx.fill();
  }

  /* 时间核波 */
  for (const r of rings) {
    ctx.strokeStyle = r.c;
    ctx.globalAlpha = Math.max(0, r.a);
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, TAU); ctx.stroke();
  }
  ctx.globalAlpha = 1;

  /* 子弹 */
  const frozen = timeSmooth < 0.06;
  for (const b of bullets) {
    const sty = BSTYLE[b.kind] || BSTYLE.p;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 1; i < b.trail.length; i++) {
      const pr = i / b.trail.length;
      ctx.strokeStyle = b.tint;
      ctx.globalAlpha = Math.pow(pr, 1.6) * 0.6;
      ctx.lineWidth = b.r * 2.1 * sty.wm * pr;
      ctx.beginPath();
      ctx.moveTo(b.trail[i - 1][0], b.trail[i - 1][1]);
      ctx.lineTo(b.trail[i][0], b.trail[i][1]);
      ctx.stroke();
    }
    const gs = b.r * sty.gs * 1.4;
    ctx.globalAlpha = 0.9;
    ctx.drawImage(b.fromPlayer ? glowFor('g_' + b.kind, 'rgba(255,238,190,0.95)') : GLOW_ENEMY(), b.x - gs / 2, b.y - gs / 2, gs, gs);
    ctx.restore();
    ctx.fillStyle = sty.core;
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r * (b.kind === 'sg' ? 0.75 : 0.6), 0, TAU); ctx.fill();
    if (frozen) {   // 冻结时子弹闪光
      const tw = (Math.sin(performance.now() / 300 + b.tw) + 1) / 2;
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.25 + tw * 0.5) + ')';
      ctx.lineWidth = 1.5;
      const L = 10 + tw * 8;
      ctx.beginPath();
      ctx.moveTo(b.x - L, b.y - L); ctx.lineTo(b.x - L * 0.4, b.y - L * 0.4);
      ctx.moveTo(b.x + L, b.y + L); ctx.lineTo(b.x + L * 0.4, b.y + L * 0.4);
      ctx.stroke();
    }
  }

  /* 雨幕 */
  if (stageKey === 'storm' && rains.length) {
    ctx.save();
    ctx.strokeStyle = 'rgba(170,200,255,0.30)'; ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (const r2 of rains) { ctx.moveTo(r2.x, r2.y); ctx.lineTo(r2.x - r2.drift * 0.03, r2.y - 13); }
    ctx.stroke();
    ctx.restore();
  }

  /* 磁轨光束残影 */
  for (const bm of beams) {
    const ba2 = bm.t / bm.max;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(150,230,255,' + (0.8 * ba2).toFixed(3) + ')';
    ctx.lineWidth = 7 * ba2 + 1;
    ctx.beginPath(); ctx.moveTo(bm.x1, bm.y1); ctx.lineTo(bm.x2, bm.y2); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,' + (0.9 * ba2).toFixed(3) + ')';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(bm.x1, bm.y1); ctx.lineTo(bm.x2, bm.y2); ctx.stroke();
    ctx.restore();
  }

  /* 狙击手激光 */
  for (const e of enemies) {
    if (e.kind !== 'sniper' || e.aimT <= 0 || e.birth > 0) continue;
    const p = 1 - e.aimT / 1.25;
    const lk = e.locked;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = lk ? 'rgba(255,70,70,' + (0.55 + 0.35 * Math.sin(playT * 40)) + ')' : 'rgba(255,70,70,' + (0.15 + p * 0.35) + ')';
    ctx.lineWidth = lk ? 3 : 1 + p * 1.5;
    const lasD = rayCoverDist(e.x, e.y, e.angle);
    ctx.beginPath();
    ctx.moveTo(e.x, e.y);
    ctx.lineTo(e.x + Math.cos(e.angle) * lasD, e.y + Math.sin(e.angle) * lasD);
    ctx.stroke();
    const cp = 1 - e.aimT / 1.25;
    const od = Math.min(1, cp * 2) * 120;
    ctx.globalAlpha = 0.9;
    ctx.drawImage(GLOW_ENEMY(), e.x + Math.cos(e.angle) * od - 16, e.y + Math.sin(e.angle) * od - 16, 32, 32);
    ctx.restore();
  }

  /* 敌人 */
  for (const e of enemies) {
    shadow(e.x, e.y, e.r);
    if (e.kind === 'rusher' && e.windT > 0) {
      ctx.strokeStyle = 'rgba(224,49,49,' + (0.4 + 0.4 * Math.sin(playT * 30)) + ')';
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 10, 0, TAU); ctx.stroke();
    }
    if (e.kind === 'echo') {
      const flick = 0.3 + 0.22 * Math.sin(playT * 22 + (e.prog || 0));
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = flick;
      ctx.drawImage(GLOW_PLAYER(), e.x - e.r * 2.6, e.y - e.r * 2.6, e.r * 5.2, e.r * 5.2);
      ctx.restore();
      drawSprite('enemy_echo', e.x - 2.5, e.y, e.angle, e.r, '#8fb0ff', 0.4, 1);
      drawSprite('enemy_echo', e.x + 2.5, e.y, e.angle, e.r, '#ff8f8f', 0.4, 1);
      drawSprite('enemy_echo', e.x, e.y, e.angle, e.r, '#cfe0ff', 0.75, 1);
      if (e.hitFlash > 0) {
        ctx.globalAlpha = e.hitFlash * 4;
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, TAU); ctx.fill();
        ctx.globalAlpha = 1;
      }
      continue;
    }
    const dim = stageKey === 'fog' && fogs.some(f2 => dist2(e.x, e.y, f2.x, f2.y) < f2.r * f2.r) ? 0.16 : 1;
    const eg = dim < 1 ? e.r * 4.6 * dim : e.r * 4.6;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.5 * dim;
    ctx.drawImage(GLOW_ENEMY(), e.x - eg / 2, e.y - eg / 2, eg, eg);
    ctx.restore();
    const bs = e.birth > 0 ? 1 - (e.birth / 0.5) * 0.7 : 1;
    const ba = e.birth > 0 ? 0.25 + 0.75 * (1 - e.birth / 0.5) : 1;
    if (e.birth > 0) {
      const bp = 1 - e.birth / 0.5;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const colg = ctx.createLinearGradient(e.x, e.y - 90, e.x, e.y);
      colg.addColorStop(0, 'rgba(255,60,60,0)');
      colg.addColorStop(1, 'rgba(255,60,60,' + (0.35 * bp).toFixed(3) + ')');
      ctx.fillStyle = colg;
      ctx.fillRect(e.x - 14 * bp, e.y - 90, 28 * bp, 90);
      ctx.restore();
    }
    if (e.kind === 'boss') {
      ctx.save();
      ctx.translate(e.x, e.y); ctx.rotate(playT * 0.8);
      ctx.strokeStyle = 'rgba(224,49,49,0.55)'; ctx.lineWidth = 3;
      for (let i3 = 0; i3 < 3; i3++) { ctx.beginPath(); ctx.arc(0, 0, e.r + 16, i3 * TAU / 3, i3 * TAU / 3 + 1.5); ctx.stroke(); }
      ctx.restore();
    }
    drawSprite(KIND_IMG[e.kind] || 'enemy_rusher',
               e.x, e.y, e.angle, e.r, '#ff5050', ba * dim, e.kind === 'boss' ? 1.9 : bs);
    if (e.hpMax > 1 && e.hp < e.hpMax) {
      const bw2 = e.kind === 'boss' ? 0 : e.r * 2;
      if (bw2 > 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.22)';
        ctx.fillRect(e.x - e.r, e.y - e.r - 11, bw2, 3);
        ctx.fillStyle = '#ff5252';
        ctx.fillRect(e.x - e.r, e.y - e.r - 11, bw2 * (e.hp / e.hpMax), 3);
      }
    }
    if (e.hitFlash > 0) {
      ctx.globalAlpha = e.hitFlash * 5;
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  /* 玩家（含残影） */
  if (state === 'playing') {
    for (let i = 0; i < player.trail.length; i++) {
      const [tx, ty, ta] = player.trail[i];
      drawSprite('player', tx, ty, ta, player.r, '#16161a', 0.05 + 0.04 * i);
    }
    shadow(player.x, player.y, player.r);
    const pg = player.r * 4.4;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = player.invulnT > 0 ? 0.4 + 0.3 * Math.sin(playT * 40) : 0.5;
    ctx.drawImage(GLOW_PLAYER(), player.x - pg / 2, player.y - pg / 2, pg, pg);
    ctx.restore();
    drawSprite('player', player.x, player.y, player.angle, player.r, '#dfe3ea');
    if (player.shield > 0) {
      ctx.strokeStyle = 'rgba(140,175,255,0.8)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(player.x, player.y, player.r + 9 + Math.sin(playT * 4) * 1.5, 0, TAU); ctx.stroke();
    }
    if (focusT > 0.15) {
      const fp = clamp(focusT / 2.2, 0, 1);
      ctx.strokeStyle = focusT >= 1.2 ? 'rgba(191,243,255,0.9)' : 'rgba(120,160,255,0.55)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(player.x, player.y, player.r + 15, -Math.PI / 2, -Math.PI / 2 + fp * TAU);
      ctx.stroke();
      if (focusT >= 1.2) {
        ctx.fillStyle = '#bff3ff'; ctx.font = 'bold 12px ' + FONT;
        ctx.textAlign = 'center';
        ctx.fillText('凝神·透', player.x, player.y + player.r + 32);
      }
    }
    if (combo >= 5) {
      const aur = 30 + Math.sin(playT * 5) * 3;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.32;
      ctx.drawImage(glowFor('g', 'rgba(255,200,110,0.8)'), player.x - 44, player.y - 44, 88, 88);
      ctx.strokeStyle = combo >= 10 ? '#ffb45c' : '#ffd98f';
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(player.x, player.y, aur, 0, TAU); ctx.stroke();
      if (combo >= 10) { ctx.beginPath(); ctx.arc(player.x, player.y, aur + 7, 0, TAU); ctx.stroke(); }
      ctx.restore();
    }
    /* 换弹环 */
    if (reloadT > 0) {
      const p = 1 - reloadT / 1.1;
      ctx.strokeStyle = '#2258c7'; ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(player.x, player.y, player.r + 12, -Math.PI / 2, -Math.PI / 2 + p * TAU);
      ctx.stroke();
      ctx.fillStyle = '#2258c7';
      ctx.font = 'bold 13px ' + FONT;
      ctx.textAlign = 'center';
      ctx.fillText('换弹中', player.x, player.y + player.r + 28);
    }
  }

  /* 武器箱 */
  for (const c2 of crates) {
    if (c2.t > 7 && (performance.now() / 180 | 0) % 2 === 0) continue;
    const col = c2.kind === 'shotgun' ? '#ffb45c' : '#d4e88f';
    const bob2 = Math.sin(c2.t * 3) * 3;
    ctx.save();
    ctx.translate(c2.x, c2.y + bob2);
    ctx.globalAlpha = 0.5;
    ctx.drawImage(glowFor('w2' + c2.kind, c2.kind === 'shotgun' ? 'rgba(255,180,92,0.9)' : 'rgba(212,232,143,0.9)'), -30, -30, 60, 60);
    ctx.restore();
    ctx.fillStyle = '#191920';
    roundRectPath(-18, -13, 36, 26, 4); ctx.fill();
    ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = col; ctx.font = 'bold 10px ' + FONT;
    ctx.textAlign = 'center';
    ctx.fillText(c2.kind === 'shotgun' ? '霰' : c2.kind === 'smg' ? '冲' : c2.kind === 'rail' ? '轨' : '蜂', 0, 4);
  }

  /* 迷雾团 */
  if (stageKey === 'fog') {
    for (const f2 of fogs) {
      const g4 = ctx.createRadialGradient(f2.x, f2.y, f2.r * 0.2, f2.x, f2.y, f2.r);
      g4.addColorStop(0, 'rgba(210,220,235,0.14)');
      g4.addColorStop(1, 'rgba(210,220,235,0)');
      ctx.fillStyle = g4;
      ctx.beginPath(); ctx.arc(f2.x, f2.y, f2.r, 0, TAU); ctx.fill();
    }
  }

  /* 道具 */
  for (const it of items) {
    if (it.t > 11 && (performance.now() / 180 | 0) % 2 === 0) continue;
    const iy2 = it.y + Math.sin(it.t * 3) * 4;
    const gsz = 74;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.5;
    const gkey = it.kind === 'shield' ? 's' : it.kind === 'shotgun' ? 'o' : 'b';
    const gcol = it.kind === 'shield' ? 'rgba(220,235,255,0.9)' : it.kind === 'shotgun' ? 'rgba(255,180,110,0.9)' : 'rgba(90,140,255,0.9)';
    ctx.drawImage(glowFor(gkey, gcol), it.x - gsz / 2, iy2 - gsz / 2, gsz, gsz);
    ctx.restore();
    ctx.strokeStyle = it.kind === 'shield' ? '#cfe0ff' : '#8fb0ff';
    ctx.lineWidth = 2.5;
    if (it.kind === 'shield') {
      ctx.beginPath();
      for (let i2 = 0; i2 < 6; i2++) {
        const a2 = i2 / 6 * TAU - Math.PI / 2;
        const px2 = it.x + Math.cos(a2) * 14, py2 = iy2 + Math.sin(a2) * 14;
        i2 ? ctx.lineTo(px2, py2) : ctx.moveTo(px2, py2);
      }
      ctx.closePath(); ctx.stroke();
    } else if (it.kind === 'shotgun') {
      ctx.beginPath(); ctx.arc(it.x, iy2, 13, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.arc(it.x, iy2, 6, 0, TAU); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.arc(it.x, iy2, 13, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(it.x, iy2); ctx.lineTo(it.x, iy2 - 8); ctx.moveTo(it.x, iy2); ctx.lineTo(it.x + 6, iy2 + 3); ctx.stroke();
    }
  }

  /* 枪口火光 */
  for (const f of flashes) {
    ctx.save();
    ctx.translate(f.x, f.y); ctx.rotate(f.a);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 26);
    g.addColorStop(0, 'rgba(255,220,120,0.95)');
    g.addColorStop(1, 'rgba(255,220,120,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, 26, -0.5, 0.5);
    ctx.closePath(); ctx.fill();
    ctx.restore();
    const lg = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, 150);
    lg.addColorStop(0, 'rgba(255,200,120,0.20)');
    lg.addColorStop(1, 'rgba(255,200,120,0)');
    ctx.fillStyle = lg;
    ctx.beginPath(); ctx.arc(f.x, f.y, 150, 0, TAU); ctx.fill();
  }

  /* 碎片 */
  for (const p of shards) {
    ctx.save();
    ctx.translate(p.x, p.y);
    if (p.puff) {
      ctx.globalAlpha = clamp(p.life * 1.6, 0, 1) * 0.4;
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(0, 0, p.size * 2.2, 0, TAU); ctx.fill();
      ctx.restore(); continue;
    }
    ctx.rotate(p.rot);
    ctx.globalAlpha = clamp(p.life * 2, 0, 1);
    ctx.fillStyle = p.color;
    if (p.shape === 'rect') {
      ctx.fillRect(-p.size, -p.size * 0.4, p.size * 2, p.size * 0.8);
    } else {
      ctx.beginPath();
      ctx.moveTo(-p.size, -p.size * 0.6);
      ctx.lineTo(p.size, 0);
      ctx.lineTo(-p.size * 0.4, p.size);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }
  ctx.globalAlpha = 1;

  /* 浮字 */
  for (const f of floats) {
    ctx.globalAlpha = clamp(f.t * 1.6, 0, 1);
    ctx.fillStyle = f.color;
    ctx.font = 'bold ' + f.size + 'px ' + FONT;
    ctx.textAlign = 'center';
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;

  /* 冻结氛围 */
  if (frozen) {
    ctx.fillStyle = 'rgba(64,105,224,0.10)';
    ctx.fillRect(ARENA.x, ARENA.y, ARENA.w, ARENA.h);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = '#a9c2ff';
    for (const d of dusts) { ctx.globalAlpha = 0.28; ctx.fillRect(d.x - 0.8, d.y - 0.8, 1.6, 1.6); }
    ctx.restore();
    const bv = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, W * 0.7);
    bv.addColorStop(0, 'rgba(0,0,0,0)');
    bv.addColorStop(1, 'rgba(45,75,200,0.18)');
    ctx.fillStyle = bv;
    ctx.fillRect(ARENA.x, ARENA.y, ARENA.w, ARENA.h);
  }
  if (supT > 0) {
    ctx.fillStyle = 'rgba(224,49,49,0.08)';
    ctx.fillRect(ARENA.x, ARENA.y, ARENA.w, ARENA.h);
  }
  ctx.restore();   // 相机变换结束

  /* 死亡红闪 */
  if (redFlash > 0) {
    ctx.fillStyle = 'rgba(201,42,42,' + redFlash * 0.28 + ')';
    ctx.fillRect(0, 0, W, H);
  }
  if (whiteFlash > 0) {
    ctx.fillStyle = 'rgba(255,255,255,' + Math.min(0.16, whiteFlash) + ')';
    ctx.fillRect(0, 0, W, H);
  }

  drawVignette();
  renderHUD();
  if (paused) {
    ctx.fillStyle = 'rgba(13,13,15,0.55)';
    ctx.fillRect(0, 0, W, H);
    panel(W / 2 - 200, H / 2 - 88, 400, 176);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 40px ' + FONT;
    ctx.textAlign = 'center';
    ctx.fillText('已暂停', W / 2, H / 2 - 24);
    ctx.font = '16px ' + FONT;
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillText('P 继续 · M 静音 · V 震动', W / 2, H / 2 + 6);
    drawButton(W / 2 - 100, H / 2 + 34, 200, 46, '继续游戏', 'RESUME · P', () => { paused = false; });
  }
  if (window.__recUntil && performance.now() < window.__recUntil && Math.floor(performance.now() / 500) % 2 === 0) {
    ctx.fillStyle = 'rgba(255,60,60,0.85)';
    ctx.beginPath(); ctx.arc(W - 30, 34, 7, 0, TAU); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 13px ' + FONT;
    ctx.textAlign = 'left';
    ctx.fillText('REC', W - 20, 39);
  }
  if (state === 'dead') renderDead();
  if (TOUCH && state === 'playing') {
    drawStick(touchState.move, STICK_L, '#ffffff');
    drawStick(touchState.aim, STICK_R, '#ff5252');
  }
  drawGrain();
  drawCrosshair();
  const coarse = window.matchMedia && matchMedia('(pointer: coarse)').matches;
  if (TOUCH && coarse && innerHeight > innerWidth && state !== 'loading') {
    ctx.fillStyle = 'rgba(8,8,10,0.9)'; ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff'; ctx.font = 'bold 40px ' + FONT;
    ctx.fillText('请横屏游玩', W / 2, H / 2 - 20);
    ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.font = '18px ' + FONT;
    ctx.fillText('旋转手机获得最佳视野', W / 2, H / 2 + 26);
  }
}

function renderHUD() {
  /* 场地四角裁切线 */
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = 3;
  const cm = 26;
  for (const [cx, cy, sx, sy] of [[ARENA.x + 18, ARENA.y + 18, 1, 1], [ARENA.x + ARENA.w - 18, ARENA.y + 18, -1, 1], [ARENA.x + 18, ARENA.y + ARENA.h - 18, 1, -1], [ARENA.x + ARENA.w - 18, ARENA.y + ARENA.h - 18, -1, -1]]) {
    ctx.beginPath();
    ctx.moveTo(cx + sx * cm, cy); ctx.lineTo(cx, cy); ctx.lineTo(cx, cy + sy * cm);
    ctx.stroke();
  }

  /* 左上: 波次信息 */
  ctx.textAlign = 'left';
  ctx.fillStyle = '#e03131';
  ctx.fillRect(24, 24, 9, 9);
  ls('2px');
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = EN;
  ctx.fillText('WAVE ' + ('0' + wave).slice(-2), 41, 33);
  ls('0px');
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 30px ' + FONT;
  ctx.fillText('第 ' + wave + ' 波', 24, 62);
  /* 生命 & 护盾 */
  for (let i2 = 0; i2 < 5; i2++) {
    ctx.fillStyle = i2 < player.hp ? '#ff5252' : 'rgba(255,255,255,0.16)';
    roundRectPath(24 + i2 * 24, 74, 19, 12, 3); ctx.fill();
  }
  if (player.shield > 0)
    for (let i2 = 0; i2 < player.shield; i2++) {
      ctx.fillStyle = '#8fb0ff';
      roundRectPath(148 + i2 * 18, 75, 13, 10, 3); ctx.fill();
    }
  ctx.font = '13px ' + FONT;
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fillText('击杀 ' + kills + ' · 擦弹 ' + grazes, 24, 106);
  ls('1px');
  ctx.font = 'bold 14px ' + FONT;
  ctx.fillStyle = '#fff';
  ctx.fillText('SCORE ' + score.toLocaleString(), 24, 130);
  ls('0px');
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.font = '12px ' + FONT;
  ctx.fillText('场景 · ' + stageName, 24, 152);

  /* 连击徽章（带衰减条） */
  if (combo >= 2) {
    const cw = 118;
    ctx.strokeStyle = '#ff5252'; ctx.lineWidth = 1.5;
    roundRectPath(24, 170, cw, 28, 3); ctx.stroke();
    ctx.fillStyle = '#ff5252';
    ctx.font = 'bold 15px ' + FONT;
    ctx.textAlign = 'center';
    ctx.fillText('连击 ×' + combo, 24 + cw / 2, 189);
    ctx.fillStyle = 'rgba(255,82,82,0.85)';
    ctx.fillRect(25, 194, (cw - 2) * clamp(comboT / 3, 0, 1), 3);
    ctx.textAlign = 'left';
  }

  /* 中上: 时间表 */
  const frozen = timeSmooth < 0.06;
  const mw = 240, mx = W / 2 - mw / 2, my = 50;
  ctx.textAlign = 'center';
  ctx.font = 'bold 17px ' + FONT;
  ctx.fillStyle = supT > 0 ? '#ff3b3b' : frozen ? '#8fb0ff' : '#ff5252';
  ctx.fillText(supT > 0 ? '!! 时锁压制' : frozen ? '■ 时间静止' : '▶ 时间流动', W / 2, 36);
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  roundRectPath(mx, my, mw, 4, 2); ctx.fill();
  ctx.fillStyle = frozen ? '#8fb0ff' : '#ff5252';
  roundRectPath(mx, my, Math.max(6, mw * clamp(timeSmooth, 0.02, 1)), 4, 2); ctx.fill();
  if (slowAllT > 0) {
    ctx.fillStyle = '#8fb0ff';
    ctx.font = 'bold 13px ' + FONT;
    ctx.fillText('SLOW ' + slowAllT.toFixed(1) + 's', W / 2, my + 24);
  }
  const boss = enemies.find(b2 => b2.kind === 'boss');
  if (boss) {
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    roundRectPath(W / 2 - 210, my + 20, 420, 9, 4); ctx.fill();
    ctx.fillStyle = '#ff5252';
    roundRectPath(W / 2 - 210, my + 20, Math.max(8, 420 * boss.hp / boss.hpMax), 9, 4); ctx.fill();
    ls('2px');
    ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.font = EN;
    ctx.fillText('CRYSTAL WARDEN · 红晶守卫', W / 2, my + 46);
    ls('0px');
  }

  /* 波次横幅（编辑排版） */
  if (waveBanner > 0) {
    const p = 1 - waveBanner / 2.4;
    const a = p < 0.12 ? p / 0.12 : Math.min(1, waveBanner / 0.5);
    const yOff = (1 - Math.min(p * 3, 1)) * 26;
    ctx.globalAlpha = a;
    ctx.textAlign = 'center';
    ls('4px');
    ctx.fillStyle = '#c92a2a';
    ctx.font = EN;
    ctx.fillText('WAVE ' + ('0' + wave).slice(-2), W / 2, H / 2 - 158 + yOff);
    ls('0px');
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 52px ' + FONT;
    ctx.fillText('第 ' + wave + ' 波', W / 2, H / 2 - 108 + yOff);
    const lw2 = 130;
    ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(W / 2 - lw2 / 2 - 130, H / 2 - 94 + yOff); ctx.lineTo(W / 2 - lw2 / 2, H / 2 - 94 + yOff);
    ctx.moveTo(W / 2 + lw2 / 2, H / 2 - 94 + yOff); ctx.lineTo(W / 2 + lw2 / 2 + 130, H / 2 - 94 + yOff);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  /* 台词（下三分之一，两侧细线） */
  if (quoteT > 0 && waveBanner <= 0) {
    const a = clamp(quoteT, 0, 1) * 0.9;
    const y = H * 0.80;
    ctx.globalAlpha = a;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff7b7b';
    ctx.font = '20px ' + FONT;
    const q = '「' + quoteText + '」';
    ctx.fillText(q, W / 2, y);
    const wq = ctx.measureText(q).width / 2;
    ctx.strokeStyle = 'rgba(255,123,123,0.4)'; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(W / 2 - wq - 60, y - 7); ctx.lineTo(W / 2 - wq - 16, y - 7);
    ctx.moveTo(W / 2 + wq + 16, y - 7); ctx.lineTo(W / 2 + wq + 60, y - 7);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  /* 右下: 弹药（精修） */
  ctx.textAlign = 'right';
  if (player.wpn !== 'pistol') {
    const wdef = WPN[player.wpn] || WPN.pistol;
    const wcol = { shotgun: '#ffb45c', smg: '#d4e88f', rail: '#bff3ff', swarm: '#7dffc4' }[player.wpn] || '#ffb45c';
    ls('2px');
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = EN;
    ctx.fillText(wdef.en + ' · Q 切换', W - 36, H - 66);
    ls('0px');
    ctx.fillStyle = wcol; ctx.font = 'bold 30px ' + FONT;
    ctx.fillText(String(player.wAmmo), W - 40, H - 44);
    if (player.wTime > 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fillRect(W - 146, H - 32, 110, 4);
      ctx.fillStyle = wcol;
      ctx.fillRect(W - 146, H - 32, 110 * clamp(player.wTime / player.wTimeMax, 0, 1), 4);
    }
    if (player.wAmmo <= 0 || player.wTime <= 0) switchWeapon('pistol');
  } else {
    ls('2px');
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = EN;
    ctx.fillText(WPN.pistol.en + ' · R', W - 36, H - 66);
    ls('0px');
  const tw = 10, gap = 7, total = MAG * tw + (MAG - 1) * gap;
  const blink = reloadT > 0 && (performance.now() / 200 | 0) % 2 === 0;
  for (let i = 0; i < MAG; i++) {
    const x = W - 36 - total + i * (tw + gap), y = H - 56;
    if (reloadT > 0) {
      ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1.2;
      roundRectPath(x, y, tw, 20, 2); ctx.stroke();
    } else if (i < ammo) {
      ctx.fillStyle = '#f2f2f4';
      roundRectPath(x, y, tw, 20, 2); ctx.fill();
    } else {
      ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1.2;
      roundRectPath(x, y, tw, 20, 2); ctx.stroke();
    }
  }
    if (reloadT > 0 && blink) {
      ctx.fillStyle = '#3b5bdb';
      ctx.font = 'bold 13px ' + FONT;
      ctx.fillText('换弹中', W - 36, H - 72);
    }
  }

  /* 冲刺冷却 (桌面) */
  if (state === 'playing') {
    panel(24, H - 78, 176, 50, { alpha: 0.04, r: 6 });
    ls('2px');
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = EN;
    ctx.fillText('DASH · SPACE', 36, H - 60); ls('0px');
    const df = clamp(1 - player.dashCd / 1.2, 0, 1);
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(36, H - 50, 152, 5);
    ctx.fillStyle = df >= 1 ? '#dfe8ff' : 'rgba(255,255,255,0.4)';
    ctx.fillRect(36, H - 50, 152 * df, 5);
    ctx.fillStyle = df >= 1 ? '#dfe8ff' : 'rgba(255,255,255,0.45)';
    ctx.font = '11px ' + FONT;
    ctx.fillText(df >= 1 ? '就绪' : player.dashCd.toFixed(1) + 's', 178, H - 45);
  }

  /* 移动端: 动作键 */
  if (TOUCH && state === 'playing') ACT_BTNS.forEach(b => {
    let cf = 0, ct = '';
    if (b.label === '冲刺' && player.dashCd > 0) { cf = clamp(player.dashCd / 1.2, 0, 1); ct = player.dashCd.toFixed(1); }
    if (b.label === '换弹' && reloadT > 0) { cf = clamp(reloadT / 1.1, 0, 1); }
    drawActBtn(b, cf, ct);
  });
  /* 右上角: 音量 / 全屏 / 暂停 */
  iconBtn(W - 44, 38, 17, toggleFullscreen, drawFsGlyph);
  if (TOUCH) iconBtn(W - 98, 38, 17, () => { paused = !paused; }, paused ? drawPlayGlyph : drawPauseGlyph);
  iconBtn(W - 152, 38, 17, () => toggleMute(), () => drawSpeakerGlyph(W - 152, 38, muted));

  /* 新手提示 */
  if (state === 'playing' && playT < 6) {
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = 'bold 18px ' + FONT;
    ctx.fillText(TOUCH ? '左半屏拖动移动 · 右半屏拖动瞄准开火 —— 你不动，世界就不动' : 'WASD 移动 · 空格冲刺 · 左键开枪 —— 你不动，世界就不动', W / 2, 140);
  }
}

function renderDead() {
  const replaying = deathReplay && replayT < deathReplay.length / 22;
  if (replaying) {
    drawReplay();
    ctx.fillStyle = 'rgba(8,8,10,0.45)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#e03131';
    ctx.font = 'bold 92px ' + FONT;
    ctx.fillText(deadLine, W / 2, H / 2 - 78);
    ls('5px');
    ctx.fillStyle = 'rgba(255,255,255,0.38)'; ctx.font = EN;
    ctx.fillText('REPLAY', W / 2, H / 2 - 46);
    ls('0px');
    return;
  }
  ctx.fillStyle = 'rgba(8,8,10,0.8)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ls('8px');
  ctx.fillStyle = '#e03131';
  ctx.font = 'bold 92px ' + FONT;
  ctx.fillText(deadLine, W / 2, H / 2 - 78);
  ls('5px');
  ctx.fillStyle = 'rgba(255,255,255,0.38)';
  ctx.font = EN;
  ctx.fillText('YOU MOVED.', W / 2, H / 2 - 46);
  ls('0px');

  const isNew = score >= best.score && score > 0;
  if (isNew) {
    ctx.strokeStyle = '#e03131'; ctx.lineWidth = 1.5;
    roundRectPath(W / 2 - 92, H / 2 - 26, 184, 30, 3); ctx.stroke();
    ctx.fillStyle = '#e03131';
    ctx.font = 'bold 15px ' + FONT;
    ctx.fillText('★ 新纪录 NEW RECORD', W / 2, H / 2 - 6);
  }

  /* 数据面板 */
  const rows = [
    [['得分', score.toLocaleString()], ['波数', wave], ['击杀', kills], ['最高连击', '×' + maxCombo]],
    [['擦弹', grazes], ['生存', playT.toFixed(1) + 's'], ['历史最佳', best.score.toLocaleString()]],
  ];
  const cw2 = 168;
  panel(W / 2 - 348, H / 2 + 8, 696, 136);
  rows.forEach((row, ri) => {
    const startX = W / 2 - (row.length * cw2) / 2 + cw2 / 2;
    const y = H / 2 + 44 + ri * 74;
    row.forEach(([label, val], i) => {
      const x = startX + i * cw2;
      ls('2px');
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.font = EN;
      ctx.fillText(label, x, y - 18);
      ls('0px');
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 26px ' + FONT;
      ctx.fillText(String(val), x, y + 8);
      if (i < row.length - 1) {
        ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + cw2 / 2 - 14, y - 22); ctx.lineTo(x + cw2 / 2 - 14, y + 14);
        ctx.stroke();
      }
    });
  });

  if (top5.length) {
    panel(988, H / 2 - 84, 252, 246);
    ctx.textAlign = 'left';
    ls('2px');
    ctx.fillStyle = '#e03131'; ctx.font = EN;
    ctx.fillText('TOP5', 1008, H / 2 - 62);
    ls('0px');
    top5.forEach((t5, i5) => {
      const cur = i5 === 0 && t5.s === score;
      ctx.fillStyle = cur ? '#ffd98f' : 'rgba(255,255,255,0.55)';
      ctx.font = (cur ? 'bold ' : '') + '15px ' + FONT;
      ctx.fillText((i5 + 1) + '. ' + t5.s.toLocaleString() + ' · W' + t5.w + ' · K' + t5.k, 1008, H / 2 - 32 + i5 * 30);
    });
    if (lastDiff !== null) {
      ctx.fillStyle = lastDiff >= 0 ? '#7bd88f' : '#ff7b7b';
      ctx.font = 'bold 15px ' + FONT;
      ctx.fillText('较上局 ' + (lastDiff >= 0 ? '+' : '') + lastDiff, 1008, H / 2 - 32 + top5.length * 30 + 8);
    }
    ctx.textAlign = 'center';
  }
  drawButton(W / 2 - 316, H / 2 + 150, 200, 56, '再来一次', 'RETRY · R', () => restart());
  drawButton(W / 2 - 100, H / 2 + 150, 200, 56, '战绩海报', 'SHARE', () => saveShareImage());
  if (moments.length) drawButton(W / 2 + 116, H / 2 + 150, 200, 56, '高光 ×' + moments.length, 'SAVE', () => saveMoments());
}

const CODEX_CARDS = [
  { img: 'enemy_shooter', name: '枪手', en: 'GUNNER', threat: 1, desc: '保持中距横向游走，两发点射。', tip: '利用掩体拆火，优先点名。' },
  { img: 'enemy_rusher', name: '突进者', en: 'RUSHER', threat: 2, desc: '红圈蓄力 0.45 秒后直线扑刺，一发致命。', tip: '蓄力瞬间横移，让刺扑空。' },
  { img: 'enemy_sniper', name: '狙击手', en: 'SNIPER', threat: 3, desc: '红色激光锁定 1.25 秒，光珠到头即射，掩体可挡。', tip: '锁死瞬间脱离弹道，或躲进掩体。' },
  { img: 'enemy_heavy', name: '重装兵', en: 'HEAVY', threat: 3, desc: '3 发血量，五连扇形弹幕，步步紧逼。', tip: '凝神穿透弹两发带走。' },
  { img: 'enemy_echo', name: '回响者', en: 'ECHO', threat: 2, desc: '你 1.2 秒前的残影，重演你的走位并开枪。', tip: '打破习惯：别走老路，它就打不中。' },
  { img: 'enemy_miner', name: '布雷者', en: 'MINER', threat: 2, desc: '横穿战场布下磐雷，引信同样遵守时间冻结。', tip: '冻结时引信停摆，静止反能安全穿雷区。' },
];

function renderCodex() {
  ctx.fillStyle = '#0d0d0f'; ctx.fillRect(0, 0, W, H);
  sectionHeader(84, 92, '敌人图鉴', 'CODEX · KNOW YOUR ENEMY');
  drawButton(W - 284, 60, 200, 52, '返回', 'BACK', () => { state = 'title'; });
  const cw3 = 540, ch3 = 140, gx = 84, gy = 170, gapx = 22, gapy = 18;
  CODEX_CARDS.forEach((cd, i) => {
    const x = gx + (i % 2) * (cw3 + gapx), y = gy + Math.floor(i / 2) * (ch3 + gapy);
    panel(x, y, cw3, ch3);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    roundRectPath(x + 12, y + 12, 116, 116, 6); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.10)'; ctx.lineWidth = 1; ctx.stroke();
    const im = IMG[cd.img];
    if (im) ctx.drawImage(im, x + 17, y + 17, 106, 106);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#fff'; ctx.font = 'bold 18px ' + FONT;
    ctx.fillText(cd.name, x + 140, y + 30);
    ls('1px');
    ctx.fillStyle = '#ff7b7b'; ctx.font = EN;
    ctx.fillText(cd.en, x + 140, y + 47);
    ls('0px');
    dots(x + 142, y + 62, cd.threat);
    ctx.fillStyle = 'rgba(255,255,255,0.62)'; ctx.font = '12px ' + FONT;
    ctx.fillText(cd.desc, x + 140, y + 88);
    ctx.strokeStyle = 'rgba(224,49,49,0.7)'; ctx.lineWidth = 1;
    roundRectPath(x + 140, y + 102, 40, 17, 3); ctx.stroke();
    ctx.fillStyle = '#ff7b7b'; ctx.font = 'bold 11px ' + FONT;
    ctx.fillText('应对', x + 149, y + 114);
    ctx.fillStyle = 'rgba(255,255,255,0.72)'; ctx.font = '12px ' + FONT;
    ctx.fillText(cd.tip, x + 188, y + 115);
  });
  const byy = 638;
  panel(84, byy, W - 168, 54, { alpha: 0.06 });
  ctx.fillStyle = '#e03131'; ctx.fillRect(84, byy, 4, 54);
  ctx.fillStyle = '#ff7b7b'; ctx.font = 'bold 16px ' + FONT;
  ctx.fillText('BOSS · 红晶守卫', 112, byy + 23);
  ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.font = '13px ' + FONT;
  ctx.fillText('每 5 波登场 · 150 HP · 螺旋弹幕 / 扇形连发 / 召唤援军 / 时锁冲击 · 击破必掉双道具', 112, byy + 42);
  drawVignette(); drawGrain(); drawCrosshair();
}

function drawReplay() {
  const idx = Math.max(0, deathReplay.length - 1 - Math.floor(replayT * 22));
  const s = deathReplay[idx];
  if (!s) return;
  ctx.fillStyle = '#131318';
  ctx.fillRect(ARENA.x, ARENA.y, ARENA.w, ARENA.h);
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 2;
  ctx.strokeRect(ARENA.x, ARENA.y, ARENA.w, ARENA.h);
  for (const rc of covers) {
    ctx.fillStyle = '#20202a';
    ctx.fillRect(rc.x, rc.y, rc.w, rc.h);
  }
  for (const b of s.b) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.85;
    ctx.drawImage(b[2] ? GLOW_WARM() : GLOW_ENEMY(), b[0] - 16, b[1] - 16, 32, 32);
    ctx.restore();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(b[0], b[1], 3.6, 0, TAU); ctx.fill();
  }
  for (const en of s.e)
    drawSprite(KIND_IMG[en[2]] || 'enemy_rusher', en[0], en[1], en[3], 20, '#ff5050', 0.92);
  drawSprite('player', s.p[0], s.p[1], s.p[2], player.r, '#dfe3ea');
  ctx.textAlign = 'left';
  ctx.fillStyle = '#e03131';
  ctx.font = 'bold 16px ' + FONT;
  ctx.fillText('● REPLAY', ARENA.x + 18, ARENA.y + 34);
}

function saveMoments() {
  moments.forEach((m, i) => {
    const a = document.createElement('a');
    a.download = '时间静止-高光-' + (i + 1) + '.png';
    a.href = m; a.click();
  });
  addFloat(W / 2, H / 2 + 220, '高光已保存 ×' + moments.length, '#8fb0ff', 18);
}

function saveShareImage() {
  const c = document.createElement('canvas'); c.width = 720; c.height = 1280;
  const x = c.getContext('2d');
  x.fillStyle = '#0d0d0f'; x.fillRect(0, 0, 720, 1280);
  const im = IMG.cover;
  if (im) {
    const w = 720, h = w * (im.height / im.width);
    x.save(); x.globalAlpha = 0.92; x.drawImage(im, 0, 0, w, h, 0, 0, 720, 620); x.restore();
    const f = x.createLinearGradient(0, 320, 0, 700);
    f.addColorStop(0, 'rgba(13,13,15,0)'); f.addColorStop(1, '#0d0d0f');
    x.fillStyle = f; x.fillRect(0, 320, 720, 380);
  }
  x.fillStyle = '#e03131'; x.fillRect(0, 0, 720, 6);
  x.textAlign = 'center';
  x.fillStyle = '#e03131'; x.font = 'bold 62px ' + FONT;
  x.fillText(deadLine, 360, 724);
  ls2(x, '4px'); x.fillStyle = 'rgba(255,255,255,0.38)'; x.font = EN;
  x.fillText('YOU MOVED.', 360, 758); ls2(x, '0px');
  x.fillStyle = '#fff'; x.font = 'bold 112px ' + FONT;
  x.fillText(score.toLocaleString(), 360, 912);
  x.fillStyle = 'rgba(255,255,255,0.5)'; x.font = '20px ' + FONT;
  x.fillText('得分 SCORE', 360, 952);
  const row = [['第 ' + wave + ' 波', 'WAVE'], [String(kills), '击杀'], [String(grazes), '擦弹'], ['×' + maxCombo, '最高连击']];
  row.forEach(([v, l], i) => {
    const bx = 90 + i * 180;
    x.fillStyle = '#fff'; x.font = 'bold 30px ' + FONT; x.fillText(v, bx, 1030);
    x.fillStyle = 'rgba(255,255,255,0.4)'; x.font = '14px ' + FONT; x.fillText(l, bx, 1056);
  });
  x.strokeStyle = 'rgba(255,255,255,0.15)'; x.lineWidth = 1;
  x.beginPath(); x.moveTo(60, 1100); x.lineTo(660, 1100); x.stroke();
  x.fillStyle = '#fff'; x.font = 'bold 38px ' + FONT;
  x.fillText('你不动，时间就停', 360, 1152);
  ls2(x, '3px'); x.fillStyle = 'rgba(255,255,255,0.35)'; x.font = EN;
  x.fillText('TIME MOVES ONLY WHEN YOU MOVE', 360, 1182); ls2(x, '0px');
  x.fillStyle = '#e03131'; x.font = 'bold 24px ' + FONT;
  x.fillText('挑战：你能活多久？', 360, 1236);
  try {
    const a = document.createElement('a');
    a.download = '时间静止-成绩图.png';
    a.href = c.toDataURL('image/png');
    a.click();
    addFloat(W / 2, H / 2 + 210, '海报已保存', '#8fb0ff', 20);
  } catch (err) { addFloat(W / 2, H / 2 + 210, '保存失败，请截图', '#ff7b7b', 20); }
}
function ls2(cx2, px) { try { cx2.letterSpacing = px; } catch (e) {} }

function renderTitle() {
  ctx.fillStyle = '#0d0d0f';
  ctx.fillRect(0, 0, W, H);

  /* 版本角标 */
  ctx.fillStyle = '#e03131'; ctx.fillRect(84, 50, 8, 8);
  ls('2px');
  ctx.fillStyle = 'rgba(255,255,255,0.32)'; ctx.font = EN;
  ctx.fillText('TIME-FREEZE ARENA · v5.0', 100, 58);
  ls('0px');

  /* 背景: 缓慢漂浮的冻结子弹 */
  if (!titleBullets) {
    titleBullets = [];
    for (let i = 0; i < 16; i++)
      titleBullets.push({ x: rand(0, W), y: rand(0, H), a: rand(0, TAU), sp: rand(6, 16), len: rand(26, 62), red: Math.random() < 0.18 });
  }
  for (const b of titleBullets) {
    b.x += Math.cos(b.a) * b.sp / 60; b.y += Math.sin(b.a) * b.sp / 60;
    if (b.x < -80) b.x = W + 80; if (b.x > W + 80) b.x = -80;
    if (b.y < -80) b.y = H + 80; if (b.y > H + 80) b.y = -80;
    ctx.save();
    ctx.translate(b.x, b.y); ctx.rotate(b.a);
    ctx.globalAlpha = b.red ? 0.22 : 0.13;
    ctx.fillStyle = b.red ? '#c92a2a' : '#e8e8ea';
    roundRectPath(-b.len / 2, -4, b.len, 8, 4); ctx.fill();
    ctx.restore();
  }
  ctx.globalAlpha = 1;

  /* 右侧封面: 相框式 */
  const im = IMG.cover;
  if (im) {
    const h = H - 140, w = h * (im.width / im.height);
    const fl = Math.sin(performance.now() / 1600) * 5;
    const cx = W - w - 70, cy = 70 + fl;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = 30; ctx.shadowOffsetY = 10;
    ctx.drawImage(im, cx, cy, w, h);
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 1;
    ctx.strokeRect(cx - 0.5, cy - 0.5, w + 1, h + 1);
    ctx.strokeStyle = 'rgba(224,49,49,0.8)'; ctx.lineWidth = 2;
    const bt = 16, ox2 = 8;
    ctx.beginPath();
    ctx.moveTo(cx - ox2, cy - ox2 + bt); ctx.lineTo(cx - ox2, cy - ox2); ctx.lineTo(cx - ox2 + bt, cy - ox2);
    ctx.moveTo(cx + w + ox2 - bt, cy - ox2); ctx.lineTo(cx + w + ox2, cy - ox2); ctx.lineTo(cx + w + ox2, cy - ox2 + bt);
    ctx.moveTo(cx + w + ox2, cy + h + ox2 - bt); ctx.lineTo(cx + w + ox2, cy + h + ox2); ctx.lineTo(cx + w + ox2 - bt, cy + h + ox2);
    ctx.moveTo(cx - ox2 + bt, cy + h + ox2); ctx.lineTo(cx - ox2, cy + h + ox2); ctx.lineTo(cx - ox2, cy + h + ox2 - bt);
    ctx.stroke();
    ctx.textAlign = 'center';
    ls('2px');
    ctx.fillStyle = 'rgba(255,255,255,0.32)'; ctx.font = EN;
    ctx.fillText('COVER · GPT-IMAGE 2.5', cx + w / 2, cy + h + 24);
    ls('0px');
  }

  /* 左侧标题排版 */
  ctx.textAlign = 'left';
  ctx.fillStyle = '#e03131';
  ctx.fillRect(84, 148, 46, 4);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 84px ' + FONT;
  ctx.fillText('你不动，', 80, 266);
  ctx.fillText('时间就停', 80, 360);
  const pw = ctx.measureText('时间就停').width;
  ctx.fillStyle = '#e03131';
  ctx.fillText('。', 80 + pw, 360);
  ls('4px');
  ctx.fillStyle = 'rgba(255,255,255,0.42)';
  ctx.font = EN;
  ctx.fillText('TIME MOVES ONLY WHEN YOU MOVE', 84, 398);
  ls('0px');
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  ctx.fillRect(84, 432, 430, 1);
  ctx.fillStyle = 'rgba(255,255,255,0.62)';
  ctx.font = '16px ' + FONT;
  ctx.fillText('WASD 移动 · 鼠标瞄准 · 左键开枪 · R 换弹 · 空格冲刺', 84, 470);
  ctx.fillText('一发致死 · 擦弹加分 · 连击翻倍', 84, 498);

  /* 最佳战绩徽章 */
  if (best.score > 0) {
    panel(84, 524, 254, 42, { alpha: 0.05, r: 4 });
    ls('2px');
    ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.font = EN;
    ctx.fillText('BEST', 100, 543);
    ls('0px');
    ctx.fillStyle = '#fff'; ctx.font = 'bold 17px ' + FONT;
    ctx.fillText(best.score + ' 分 · 第 ' + best.wave + ' 波', 100, 558);
  }

  /* 开始按钮 */
  drawButton(84, 600, 218, 58, '开始游戏', 'START', () => { initAudio(); startGame(); });
  drawButton(318, 600, 218, 58, '敌人图鉴', 'CODEX', () => { state = 'codex'; });
  iconBtn(W - 44, 38, 17, () => toggleMute(), () => drawSpeakerGlyph(W - 44, 38, muted));

  /* 页脚 */
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.font = '12px ' + FONT;
  ctx.fillText('v5.3 · Q 切枪 · V 震动 · [ ] 音量 · M 静音 · ?demo 演示 · 素材 by gpt-image-2.5', 84, H - 26);
  if (typeof window.__bootErr !== 'undefined') {
    ctx.fillStyle = '#ff7b7b'; ctx.font = '12px ' + FONT;
    ctx.fillText('启动异常: ' + window.__bootErr, 84, H - 10);
  }

  iconBtn(W - 44, 38, 17, toggleFullscreen, drawFsGlyph);
  drawVignette();
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.font = '11px ' + FONT;
  ctx.fillText('v5.3', W - 8, H - 8);
  drawGrain();
  drawCrosshair();
}

/* ---------- 主循环 ---------- */
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;
  update(dt);
  render();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
if (DEMO) { try { startGame(); } catch (e8) { window.__bootErr = String(e8); state = 'title'; } }

/* ?rec=秒数: 自动录制canvas为webm并下载 (配合demo=完整演示素材) */
const REC_S = parseFloat(new URLSearchParams(location.search).get('rec') || '0');
if (REC_S > 0) {
  const recStart = () => {
    try {
      const stream = canvas.captureStream(30);
      const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm';
      const rec2 = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6000000 });
      const chunks2 = [];
      rec2.ondataavailable = e9 => { if (e9.data && e9.data.size) chunks2.push(e9.data); };
      rec2.onstop = () => {
        const blob = new Blob(chunks2, { type: 'video/webm' });
        const a9 = document.createElement('a');
        a9.href = URL.createObjectURL(blob);
        a9.download = '时间静止-演示-' + REC_S + 's.webm';
        document.body.appendChild(a9); a9.click(); a9.remove();
        setTimeout(() => URL.revokeObjectURL(a9.href), 8000);
      };
      rec2.start();
      window.__recUntil = performance.now() + REC_S * 1000;
    } catch (e9) {}
  };
  if (document.readyState === 'complete') recStart();
  else window.addEventListener('load', recStart);
}
