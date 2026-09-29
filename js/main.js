/* Pixel Collapse: a modern player folds into the 275×116 classic player,
   then re-skins as the visitor scrolls. Skin sprites are the real bitmaps
   from public/skins/*.wsz (plus one demo skin built with tools/skin-kit). */
(() => {
  "use strict";

  // Palettes as defined in tools/skin-kit/build.py: panel, lcd bg, accent, edge, text.
  const SKINS = [
    { key: "graphite", name: "Graphite LCD", panel: "#26344e", bg: "#070d16", accent: "#a8ee47", edge: "#7690ae", text: "#e5edf3", tag: "Built-in" },
    { key: "silver", name: "Silver Blue", panel: "#7188a4", bg: "#0b1c30", accent: "#9cdbff", edge: "#c8d9e9", text: "#f7fbff", tag: "Built-in" },
    { key: "amber", name: "Amber Terminal", panel: "#40323b", bg: "#150e18", accent: "#ffc457", edge: "#9c8490", text: "#f3dfd3", tag: "Built-in" },
    { key: "mint", name: "Mint Cassette", panel: "#1d3b37", bg: "#04110e", accent: "#6dffc8", edge: "#6f9f96", text: "#e6f7f1", tag: "Imported .wsz" },
  ];
  const SPRITES = ["main", "titlebar", "cbuttons", "posbar", "numbers", "text", "volume"];

  // Fictional track data. Nothing here refers to a real release.
  const TRACK = { artist: "Luma Coast", title: "Night Drive Tapes", duration: 238, start: 102 };
  const QUEUE = [
    ["LUMA COAST", "NIGHT DRIVE TAPES", "3:58"],
    ["PAPER HARBOR", "STATIC SUMMER", "4:12"],
    ["THE QUIET MILES", "ROUTE 9", "3:21"],
    ["NOVA LANES", "CASSETTE WEATHER", "5:04"],
    ["ORBITAL DINER", "2AM NEON", "3:47"],
    ["MIRA VALE", "SLOW SIGNAL", "4:30"],
    ["HALF MOON RADIO", "LAST TRAIN HOME", "3:39"],
  ];

  // Scroll timeline (0..1 across the sticky hero).
  const T = {
    rise: [0, 0.12],       // headline leaves, card centres
    collapse: [0.13, 0.34],
    wipes: [
      { from: 0, to: 1, at: [0.46, 0.52] },
      { from: 1, to: 2, at: [0.62, 0.68] },
      { from: 2, to: 3, at: [0.85, 0.91] },
    ],
    drop: [0.77, 0.86],
  };

  const reducedQuery = matchMedia("(prefers-reduced-motion: reduce)");
  let reduced = reducedQuery.matches;

  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const span = (p, [a, b]) => clamp((p - a) / (b - a));
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const lerpRect = (a, b, t) => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), w: lerp(a.w, b.w, t), h: lerp(a.h, b.h, t) });
  const hexToRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const mixHex = (a, b, t) => { const x = hexToRgb(a), y = hexToRgb(b); return `rgb(${x.map((v, i) => Math.round(lerp(v, y[i], t))).join(",")})`; };
  function rng(seed) { return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }; }

  let FAM = "Space Grotesk, system-ui, sans-serif";
  const t0 = performance.now();
  const elapsed = () => (TRACK.start + (performance.now() - t0) / 1000) % TRACK.duration;
  const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  /* ---------- Sprite loading ---------- */
  function loadImage(src) {
    return new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = src; });
  }
  const loadSkins = () => Promise.all(SKINS.map(async (skin) => {
    const imgs = await Promise.all(SPRITES.map((n) => loadImage(`assets/skins/${skin.key}/${n}.png`)));
    skin.img = Object.fromEntries(SPRITES.map((n, i) => [n, imgs[i]]));
    skin.canvas = document.createElement("canvas");
    skin.canvas.width = 275; skin.canvas.height = 212;
    skin.ctx = skin.canvas.getContext("2d");
    return skin;
  }));

  /* ---------- Classic renderer (1 skin pixel = 1 canvas pixel) ---------- */
  const TEXT_ROWS = ['ABCDEFGHIJKLMNOPQRSTUVWXYZ"@   ', "0123456789 .:()-'!_+\\/[]^&%,=$#", "AOA?*"];
  const CHAR = {};
  TEXT_ROWS.forEach((row, r) => [...row].forEach((c, col) => { if (!(c in CHAR) || c === " ") CHAR[c] = [col * 5, r * 6]; }));
  CHAR[" "] = [10 * 5, 6];

  function drawText(ctx, skin, str, x, y) {
    for (const ch of str.toUpperCase()) {
      const [sx, sy] = CHAR[ch] || CHAR[" "];
      ctx.drawImage(skin.img.text, sx, sy, 5, 6, x, y, 5, 6);
      x += 5;
    }
  }

  const MARQUEE = `${TRACK.artist} - ${TRACK.title} (${fmt(TRACK.duration)})  ***  `.toUpperCase();

  function renderClassic(skin, secs, now) {
    const c = skin.ctx, I = skin.img;
    c.imageSmoothingEnabled = false;
    c.drawImage(I.main, 0, 0);
    c.drawImage(I.titlebar, 27, 0, 275, 14, 0, 0, 275, 14);

    // Time display: mm:ss with the classic 9×13 digit cells.
    const m = Math.floor(secs / 60), s = Math.floor(secs % 60);
    const digits = [Math.floor(m / 10), m % 10, Math.floor(s / 10), s % 10];
    [48, 60, 78, 90].forEach((x, i) => c.drawImage(I.numbers, digits[i] * 9, 0, 9, 13, x, 26, 9, 13));
    c.fillStyle = skin.accent;
    c.fillRect(72, 29, 2, 2); c.fillRect(72, 35, 2, 2);
    // Play indicator.
    c.beginPath(); c.moveTo(26, 28); c.lineTo(26, 37); c.lineTo(31, 32.5); c.closePath(); c.fill();

    // Scrolling song title.
    c.save(); c.beginPath(); c.rect(111, 27, 154, 6); c.clip();
    c.fillStyle = skin.bg; c.fillRect(111, 27, 154, 6);
    const w = MARQUEE.length * 5;
    const off = reduced ? 0 : Math.floor(now / 1000 * 18) % w;
    drawText(c, skin, MARQUEE + MARQUEE, 111 - off, 27);
    c.restore();
    drawText(c, skin, "128", 111, 43); drawText(c, skin, "KBPS", 128, 43);
    drawText(c, skin, "44", 156, 43); drawText(c, skin, "KHZ", 168, 43);

    // Volume, seek bar, transport.
    c.drawImage(I.volume, 0, 20 * 15, 68, 13, 107, 57, 68, 13);
    c.drawImage(I.volume, 15, 422, 14, 11, 107 + Math.round(20 / 27 * 54), 58, 14, 11);
    c.drawImage(I.posbar, 0, 0, 248, 10, 16, 72, 248, 10);
    c.drawImage(I.posbar, 248, 0, 29, 10, 16 + Math.round(secs / TRACK.duration * (248 - 29)), 72, 29, 10);
    [[0, 23, 16], [23, 23, 39], [46, 23, 62], [69, 23, 85], [92, 22, 108]].forEach(([sx, sw, dx]) =>
      c.drawImage(I.cbuttons, sx, 0, sw, 18, dx, 90, sw, 18));
    c.drawImage(I.cbuttons, 114, 0, 22, 16, 136, 91, 22, 16);

    renderPlaylist(skin, secs);
  }

  function renderPlaylist(skin, secs) {
    const c = skin.ctx, y0 = 116;
    c.fillStyle = skin.panel; c.fillRect(0, y0, 275, 96);
    c.fillStyle = skin.edge; c.fillRect(0, y0, 275, 1); c.fillRect(0, y0, 1, 96);
    c.fillStyle = skin.bg; c.fillRect(274, y0, 1, 96); c.fillRect(0, y0 + 95, 275, 1);
    c.fillStyle = mixHex(skin.panel, skin.edge, 0.5); c.fillRect(4, y0 + 7, 97, 1); c.fillRect(174, y0 + 7, 97, 1);
    c.fillStyle = skin.bg; c.fillRect(104, y0 + 3, 67, 10);
    drawText(c, skin, "PLAYLIST", 118, y0 + 5);
    // List area.
    c.fillStyle = skin.bg; c.fillRect(6, y0 + 16, 263, 66);
    QUEUE.forEach(([artist, title, len], i) => {
      const y = y0 + 18 + i * 9;
      c.globalAlpha = i === 0 ? 1 : 0.5;
      const label = `${i + 1}. ${artist} - ${title}`.slice(0, 44);
      drawText(c, skin, label, 12, y);
      drawText(c, skin, len, 264 - len.length * 5, y);
      c.globalAlpha = 1;
      if (i === 0) { c.fillStyle = skin.accent; c.fillRect(7, y, 2, 6); }
    });
    // Bottom strip: elapsed / total and the four supported mini controls.
    drawText(c, skin, `${fmt(secs)}/${fmt(TRACK.duration)}`, 10, y0 + 86);
    c.fillStyle = skin.edge;
    [0, 1, 2, 3].forEach((i) => c.fillRect(226 + i * 11, y0 + 86, 7, 6));
  }

  /* ---------- Modern (generic) player, drawn at any geometry ---------- */
  const MODERN = { bg: "#15161b", ink: "#f4f5f8", muted: "#8b8f9a", track: "#34363f" };

  function roundRect(c, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }

  function drawArt(c, r, radius, now) {
    c.save(); roundRect(c, r.x, r.y, r.w, r.h, radius); c.clip();
    const g = c.createLinearGradient(r.x, r.y, r.x + r.w, r.y + r.h);
    g.addColorStop(0, "#2b1f5c"); g.addColorStop(0.55, "#1b6f7a"); g.addColorStop(1, "#e6a15a");
    c.fillStyle = g; c.fillRect(r.x, r.y, r.w, r.h);
    // Road lines and a sun: a fictional "Night Drive Tapes" cover.
    const cx = r.x + r.w / 2, hy = r.y + r.h * 0.58;
    c.fillStyle = "rgba(255,214,150,.9)";
    c.beginPath(); c.arc(cx, hy, r.w * 0.2, Math.PI, 0); c.fill();
    c.fillStyle = "rgba(10,8,25,.55)"; c.fillRect(r.x, hy, r.w, r.h);
    c.strokeStyle = "rgba(255,255,255,.35)"; c.lineWidth = Math.max(1, r.w / 160);
    const drift = reduced ? 0 : (now / 1400) % 1;
    for (let i = 0; i < 7; i++) {
      const k = (i + drift) / 7, y = hy + (r.y + r.h - hy) * k * k;
      c.beginPath(); c.moveTo(r.x, y); c.lineTo(r.x + r.w, y); c.stroke();
    }
    c.beginPath(); c.moveTo(cx, hy); c.lineTo(r.x - r.w * 0.2, r.y + r.h); c.moveTo(cx, hy); c.lineTo(r.x + r.w * 1.2, r.y + r.h); c.stroke();
    c.restore();
  }

  function drawTitle(c, r) {
    const fs = Math.max(6, r.h * 0.42);
    c.fillStyle = MODERN.ink; c.font = `700 ${fs}px ${FAM}`;
    c.textBaseline = "top";
    c.fillText(TRACK.title, r.x, r.y, r.w);
    c.fillStyle = MODERN.muted; c.font = `400 ${fs * 0.72}px ${FAM}`;
    if (r.h > 16) c.fillText(TRACK.artist, r.x, r.y + fs * 1.25, r.w);
  }

  function drawProgress(c, r, secs, radius) {
    const bh = Math.max(2, r.h * 0.14), y = r.y + Math.min(r.h * 0.2, 6);
    c.fillStyle = MODERN.track; roundRect(c, r.x, y, r.w, bh, radius ? bh / 2 : 0); c.fill();
    const f = secs / TRACK.duration;
    c.fillStyle = MODERN.ink; roundRect(c, r.x, y, r.w * f, bh, radius ? bh / 2 : 0); c.fill();
    c.beginPath(); c.arc(r.x + r.w * f, y + bh / 2, bh * 1.8, 0, Math.PI * 2); c.fill();
    if (r.h > 20) {
      c.fillStyle = MODERN.muted; c.font = `500 ${Math.max(8, r.h * 0.36)}px ${FAM}`;
      c.textBaseline = "bottom"; c.textAlign = "left"; c.fillText(fmt(secs), r.x, r.y + r.h);
      c.textAlign = "right"; c.fillText(`-${fmt(TRACK.duration - secs)}`, r.x + r.w, r.y + r.h); c.textAlign = "left";
    }
  }

  function drawControls(c, r) {
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2, u = Math.min(r.h / 2, r.w / 8);
    c.fillStyle = MODERN.ink;
    c.beginPath(); c.arc(cx, cy, u, 0, Math.PI * 2); c.fill();
    c.fillStyle = MODERN.bg; c.fillRect(cx - u * 0.3, cy - u * 0.38, u * 0.2, u * 0.76); c.fillRect(cx + u * 0.1, cy - u * 0.38, u * 0.2, u * 0.76);
    c.fillStyle = MODERN.ink;
    const tri = (x, dir) => { c.beginPath(); c.moveTo(x, cy - u * 0.4); c.lineTo(x, cy + u * 0.4); c.lineTo(x + dir * u * 0.55, cy); c.closePath(); c.fill(); };
    tri(cx - u * 1.55, -1); tri(cx - u * 2.1, -1); tri(cx + u * 1.55, 1); tri(cx + u * 2.1, 1);
  }

  function drawList(c, r) {
    const fam = FAM;
    const rowH = r.h / 4.2, fs = Math.max(5, rowH * 0.3);
    c.fillStyle = MODERN.muted; c.font = `600 ${fs * 0.9}px ${fam}`; c.textBaseline = "top";
    c.fillText("UP NEXT", r.x, r.y);
    QUEUE.slice(1, 4).forEach(([artist, title, len], i) => {
      const y = r.y + fs * 1.8 + i * rowH, th = rowH * 0.72;
      const g = c.createLinearGradient(r.x, y, r.x + th, y + th);
      g.addColorStop(0, ["#5b3c88", "#2f6d5d", "#8a4b3a"][i]); g.addColorStop(1, ["#c07fd6", "#8fd1b0", "#e9b27a"][i]);
      c.fillStyle = g; roundRect(c, r.x, y, th, th, th * 0.18); c.fill();
      c.fillStyle = MODERN.ink; c.font = `600 ${fs}px ${fam}`;
      c.fillText(title.replace(/\b\w+/g, (w) => w[0] + w.slice(1).toLowerCase()), r.x + th * 1.35, y + th * 0.08, r.w - th * 2.6);
      c.fillStyle = MODERN.muted; c.font = `400 ${fs * 0.85}px ${fam}`;
      c.fillText(artist.replace(/\b\w+/g, (w) => w[0] + w.slice(1).toLowerCase()), r.x + th * 1.35, y + th * 0.55, r.w - th * 2.6);
      c.textAlign = "right"; c.fillText(len, r.x + r.w, y + th * 0.3); c.textAlign = "left";
    });
  }

  /* ---------- Stage ---------- */
  const canvas = document.getElementById("stage-canvas");
  const ctx = canvas.getContext("2d");
  const hero = document.getElementById("hero");
  const head = document.getElementById("hero-head");
  const caps = [...document.querySelectorAll(".cap")];
  const rail = document.querySelector(".skin-rail");
  const railDots = [...rail.children];
  let W = 0, H = 0, dpr = 1, L = null, skins = null, lastAccent = "";
  const lowres = document.createElement("canvas");
  const lctx = lowres.getContext("2d");

  function layout() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    const top = reduced ? 20 : 96, bottom = reduced ? 20 : H < 700 ? 96 : 120, syncRoom = reduced ? 0 : 46;
    const availH = H - top - bottom - syncRoom, availW = W - 32;
    let s = Math.min(availW / 275, availH / 212, 3);
    // Whole device pixels per skin pixel on wide screens; on phones size wins.
    if (W >= 600 && s >= 1) s = Math.floor(s * dpr) / dpr;
    const cw = 275 * s, ch = 212 * s;
    const cx = Math.round((W - cw) / 2), cy = Math.round(top + syncRoom + (availH - ch) / 2);
    const C = { x: cx, y: cy, w: cw, h: ch };
    const at = (x, y, w, h) => ({ x: cx + x * s, y: cy + y * s, w: w * s, h: h * s });

    // Modern card: natural size, scaled to the same available height.
    const mw0 = Math.min(availW, 380), pad = 22, art = mw0 - pad * 2;
    const mh0 = pad + art + 16 + 48 + 12 + 30 + 10 + 58 + 14 + 170 + pad;
    const k = Math.min(1, (availH + syncRoom * 0.4) / mh0);
    const mw = mw0 * k, mh = mh0 * k, mx = (W - mw) / 2, my = cy + ch / 2 - mh / 2;
    let y = my + pad * k;
    const m = (h) => { const r = { x: mx + pad * k, y, w: mw - pad * 2 * k, h: h * k }; y += h * k; return r; };
    const M = { box: { x: mx, y: my, w: mw, h: mh } };
    M.art = m(art); y += 16 * k; M.title = m(48); y += 12 * k; M.progress = m(30); y += 10 * k; M.controls = m(58); y += 14 * k; M.list = m(170);

    const K = {
      box: C, art: at(7, 20, 100, 47), title: at(109, 20, 160, 18), progress: at(16, 72, 248, 10),
      controls: at(16, 90, 142, 18), list: at(6, 132, 263, 66),
    };
    const headBottom = head.getBoundingClientRect().bottom;
    L = { s, C, M, K, rise: Math.max(0, headBottom + 64 - my) };

    // Dissolve blocks: 5×5 skin pixels each, with seeded thresholds.
    const cols = 55, rows = Math.ceil(212 / 5), r1 = rng(7), r2 = rng(19);
    L.blocks = [];
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      L.blocks.push({ i, j, dissolve: r1(), sweep: 0.55 * r2() + 0.45 * (i / cols * 0.7 + j / rows * 0.3) });
    }
  }

  function drawBlocks(src, key, k) {
    if (k <= 0) return;
    const { C, s } = L;
    for (const b of L.blocks) {
      if (b[key] >= k) continue;
      ctx.drawImage(src, b.i * 5, b.j * 5, 5, 5, C.x + b.i * 5 * s, C.y + b.j * 5 * s, 5 * s + 0.5, 5 * s + 0.5);
    }
  }

  function drawClassicWhole(skin) {
    const { C } = L;
    ctx.drawImage(skin.canvas, 0, 0, 275, 212, C.x, C.y, C.w, C.h);
  }

  function drawModernAt(c, t, secs, now) {
    // t: 0 modern → 1 classic geometry. Element boxes travel to their classic slots.
    const g = (name) => lerpRect(L.M[name], L.K[name], t);
    const box = g("box"), rad = lerp(22, 0, t);
    c.fillStyle = MODERN.bg; roundRect(c, box.x, box.y, box.w, box.h, rad); c.fill();
    drawArt(c, g("art"), lerp(14, 0, t), now);
    drawTitle(c, g("title"));
    drawProgress(c, g("progress"), secs, rad > 2);
    drawControls(c, g("controls"));
    drawList(c, g("list"));
  }

  function drawSync(accent, now, alpha, top) {
    // "YouTube Music · signed in" pill with a line that pulses into the player.
    const { C } = L, cx = C.x + C.w / 2, y0 = Math.max(76, top - 40);
    ctx.save(); ctx.globalAlpha = alpha;
    ctx.font = `500 13px ${FAM}`;
    const label = "YouTube Music · concept", tw = ctx.measureText(label).width + 30;
    ctx.fillStyle = "rgba(255,255,255,.04)"; ctx.strokeStyle = "rgba(255,255,255,.14)"; ctx.lineWidth = 1;
    roundRect(ctx, cx - tw / 2, y0 - 13, tw, 26, 13); ctx.fill(); ctx.stroke();
    ctx.fillStyle = accent; ctx.beginPath(); ctx.arc(cx - tw / 2 + 13, y0, 3.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#cfd5df"; ctx.textBaseline = "middle"; ctx.fillText(label, cx - tw / 2 + 22, y0 + 1);
    const a = y0 + 13, b = top;
    ctx.strokeStyle = "rgba(255,255,255,.16)"; ctx.beginPath(); ctx.moveTo(cx + 0.5, a); ctx.lineTo(cx + 0.5, b); ctx.stroke();
    ctx.fillStyle = accent;
    for (let i = 0; i < 3; i++) {
      const f = reduced ? (i + 0.5) / 3 : ((now / 1100) + i / 3) % 1;
      if (b - a > 4) ctx.fillRect(cx - 1, a + (b - a) * f - 2, 3, 4);
    }
    ctx.restore();
  }

  function drawWsz(k, now) {
    // A .wsz file falls onto the player and is absorbed.
    const { C, s } = L, fw = 30 * Math.max(1, s * 0.8), fh = fw * 1.25;
    const land = C.y + 58 * s - fh / 2, start = C.y - fh - 90;
    const fall = easeOut(clamp(k / 0.7));
    const x = C.x + C.w / 2 - fw / 2, y = lerp(start, land, fall);
    const fade = 1 - clamp((k - 0.75) / 0.25);
    if (fade <= 0) return;
    ctx.save(); ctx.globalAlpha = fade;
    ctx.fillStyle = "#e6f7f1"; ctx.beginPath();
    ctx.moveTo(x, y); ctx.lineTo(x + fw * 0.7, y); ctx.lineTo(x + fw, y + fw * 0.3); ctx.lineTo(x + fw, y + fh); ctx.lineTo(x, y + fh); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#6dffc8"; ctx.fillRect(x, y + fh * 0.62, fw, fh * 0.22);
    ctx.fillStyle = "#04110e"; ctx.font = `700 ${fw * 0.22}px ${FAM}`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(".WSZ", x + fw / 2, y + fh * 0.73);
    ctx.fillStyle = "#cfd5df"; ctx.font = `500 12px ${FAM}`;
    ctx.fillText("mint.wsz", x + fw / 2, y + fh + 14);
    ctx.textAlign = "left";
    ctx.restore();
  }

  function progress() {
    const r = hero.getBoundingClientRect();
    return clamp(-r.top / (r.height - innerHeight));
  }

  function activeSkin(p) {
    // Returns [fromIndex, toIndex, wipeAmount].
    let idx = 0;
    for (const w of T.wipes) {
      const k = span(p, w.at);
      if (k <= 0) break;
      if (k < 1) return [w.from, w.to, reduced ? (k < 0.5 ? 0 : 1) : ease(k)];
      idx = w.to;
    }
    return [idx, idx, 0];
  }

  function setAccent(hex) {
    if (hex === lastAccent) return;
    lastAccent = hex;
    document.documentElement.style.setProperty("--accent", hex);
  }

  let heroVisible = true;
  let framePending = false;
  function scheduleFrame() {
    if (framePending) return;
    framePending = true;
    requestAnimationFrame((now) => {
      framePending = false;
      frame(now);
    });
  }

  new IntersectionObserver(([e]) => {
    heroVisible = e.isIntersecting;
    if (heroVisible && skins) scheduleFrame();
  }).observe(hero);

  function frame(now) {
    if (!heroVisible || !skins || !L) return;
    const p = reduced ? 1 : progress(), secs = reduced ? TRACK.start : elapsed();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.imageSmoothingEnabled = false;

    const rise = easeOut(span(p, T.rise));
    if (reduced) {
      head.style.opacity = "1";
      head.style.transform = "";
    } else {
      head.style.opacity = String(1 - span(p, [0, 0.08]));
      head.style.transform = `translate(-50%, ${-rise * 40}px)`;
    }
    const collapse = span(p, T.collapse);
    const [fi, ti, wk] = activeSkin(p);
    const from = skins[fi], to = skins[ti];
    setAccent(wk > 0.5 ? to.accent : from.accent);

    if (collapse < 1) {
      // Modern phase + pixel collapse.
      const geo = reduced ? (collapse < 0.5 ? 0 : 1) : ease(clamp(collapse / 0.7));
      const pixel = reduced ? 1 : lerp(1, L.s * 3.2, ease(clamp((collapse - 0.08) / 0.62)));
      const dissolve = reduced ? (collapse < 0.5 ? 0 : 1) : ease(clamp((collapse - 0.5) / 0.5));
      const dy = (1 - rise) * L.rise;
      if (dissolve < 1) {
        if (pixel <= 1.01) {
          ctx.save(); ctx.translate(0, dy); drawModernAt(ctx, geo, secs, now); ctx.restore();
        } else {
          const lw = Math.max(1, Math.round(W / pixel)), lh = Math.max(1, Math.round(H / pixel));
          if (lowres.width !== lw || lowres.height !== lh) { lowres.width = lw; lowres.height = lh; }
          lctx.setTransform(lw / W, 0, 0, lh / H, 0, dy * lh / H);
          lctx.clearRect(0, -dy, W, H);
          lctx.imageSmoothingEnabled = true;
          drawModernAt(lctx, geo, secs, now);
          ctx.drawImage(lowres, 0, 0, lw, lh, 0, 0, W, H);
        }
      }
      if (dissolve > 0) {
        renderClassic(skins[0], secs, now);
        drawBlocks(skins[0].canvas, "dissolve", dissolve);
      }
      drawSync(collapse > 0.5 ? from.accent : "#f4f5f8", now, 1, lerp(L.M.box.y, L.C.y, geo) + dy);
    } else {
      renderClassic(from, secs, now);
      drawClassicWhole(from);
      if (wk > 0) {
        renderClassic(to, secs, now);
        drawBlocks(to.canvas, "sweep", wk);
      }
      const drop = span(p, T.drop);
      if (drop > 0 && drop < 1 && !reduced) drawWsz(drop, now);
      if (!reduced) drawSync(wk > 0.5 ? to.accent : from.accent, now, 1, L.C.y);
    }

    // Captions and skin rail.
    for (const cap of caps) {
      const active = !reduced && p >= +cap.dataset.from && p < +cap.dataset.to;
      if (cap.classList.contains("on") !== active) cap.classList.toggle("on", active);
      const hidden = String(!active);
      if (cap.getAttribute("aria-hidden") !== hidden) cap.setAttribute("aria-hidden", hidden);
    }
    rail.classList.toggle("on", collapse >= 1);
    const cur = wk > 0.5 ? ti : fi;
    railDots.forEach((d, i) => d.classList.toggle("on", i === cur));
    if (!reduced) scheduleFrame();
  }

  /* ---------- Skin kit minis ---------- */
  function buildMinis() {
    const host = document.getElementById("minis");
    for (const skin of skins) {
      const card = document.createElement("div");
      card.className = "mini reveal";
      const cv = document.createElement("canvas");
      cv.width = 275; cv.height = 116;
      cv.setAttribute("role", "img"); cv.setAttribute("aria-label", `${skin.name} skin preview`);
      renderClassic(skin, TRACK.start, 0);
      cv.getContext("2d").drawImage(skin.canvas, 0, 0, 275, 116, 0, 0, 275, 116);
      const h = document.createElement("h4");
      h.innerHTML = `${skin.name} <small>${skin.tag === "Built-in" ? "Built-in" : "Demo · skin kit"}</small>`;
      const sw = document.createElement("div"); sw.className = "swatches";
      for (const hex of [skin.panel, skin.bg, skin.accent, skin.edge, skin.text]) {
        const i = document.createElement("i"); i.style.background = hex; i.dataset.hex = hex; i.title = hex; sw.appendChild(i);
      }
      card.append(cv, h, sw); host.appendChild(card);
    }
    observeReveals();
  }

  function observeReveals() {
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { threshold: 0.15 });
    document.querySelectorAll(".reveal:not(.in)").forEach((el) => io.observe(el));
  }

  addEventListener("resize", () => { if (skins) { layout(); if (reduced) scheduleFrame(); } });
  reducedQuery.addEventListener?.("change", (e) => {
    reduced = e.matches;
    if (skins) { layout(); scheduleFrame(); }
  });
  observeReveals();
  (document.fonts?.ready || Promise.resolve()).then(() => { FAM = getComputedStyle(document.body).fontFamily; }).then(loadSkins).then((s) => {
    skins = s; layout(); buildMinis(); scheduleFrame();
  }).catch((err) => console.error("Skin sprites failed to load", err));
})();
