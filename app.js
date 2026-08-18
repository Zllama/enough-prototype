const STORAGE_KEY = "enough-board-v1";

const state = {
  screen: "welcome",
  feeling: "",
  freeText: "",
  color: COLORS[0],
  intensity: 0.5,
  witness: "",
  deepenAnswer: "",
  selectedReframe: null,
  reframeText: "",
  driftSpeed: 1,
  pendingRaindrop: null, // { x, y, color }
};

/* ── Persistence ── */

function loadBoard() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function saveBoard(fragments) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(fragments));
}

/* ── DOM helper ── */

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, val] of Object.entries(attrs)) {
    if (key === "className") node.className = val;
    else if (key === "text") node.textContent = val;
    else if (key.startsWith("on")) node.addEventListener(key.slice(2).toLowerCase(), val);
    else node.setAttribute(key, val);
  }
  for (const child of children) {
    node.append(child);
  }
  return node;
}

/* ── Touch helpers ── */

function canvasCoords(e, canvas) {
  const rect = canvas.getBoundingClientRect();
  if (e.changedTouches && e.changedTouches[0]) {
    return { x: e.changedTouches[0].clientX - rect.left, y: e.changedTouches[0].clientY - rect.top };
  }
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

/* ── Sound System (Web Audio) ── */

let audioCtx = null;
let masterGain = null;
let activeNodes = []; // { osc, gain, lfo, lfoGain, hex }

function ensureAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = audioCtx.createGain();
    masterGain.gain.setValueAtTime(0.15, audioCtx.currentTime);
    masterGain.connect(audioCtx.destination);
  }
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

const SOUND_MAP = {
  ember:  { freq: 110, type: "sine" },
  gold:   { freq: 130, type: "sine" },
  clay:   { freq: 100, type: "triangle" },
  ochre:  { freq: 120, type: "sine" },
  rose:   { freq: 145, type: "sine" },
  wine:   { freq: 98,  type: "triangle" },
  mist:   { freq: 220, type: "sine" },
  slate:  { freq: 185, type: "sine" },
  ocean:  { freq: 196, type: "sine" },
  storm:  { freq: 175, type: "triangle" },
  sage:   { freq: 260, type: "sine" },
  moss:   { freq: 240, type: "sine" },
  dusk:   { freq: 294, type: "sine" },
  plum:   { freq: 277, type: "sine" },
  deep:   { freq: 165, type: "triangle" },
};

function hexDistance(a, b) {
  const ar = parseInt(a.slice(1, 3), 16), ag = parseInt(a.slice(3, 5), 16), ab = parseInt(a.slice(5, 7), 16);
  const br = parseInt(b.slice(1, 3), 16), bg = parseInt(b.slice(3, 5), 16), bb = parseInt(b.slice(5, 7), 16);
  return Math.sqrt((ar - br) ** 2 + (ag - bg) ** 2 + (ab - bb) ** 2);
}

function getSoundForColor(hex) {
  let best = SOUND_MAP.mist;
  let bestDist = Infinity;
  for (const [id, sound] of Object.entries(SOUND_MAP)) {
    const c = COLORS.find((c) => c.id === id);
    if (!c) continue;
    const dist = hexDistance(hex, c.hex);
    if (dist < bestDist) { bestDist = dist; best = sound; }
  }
  return best;
}

function playCloudSound(hex) {
  const ctx = ensureAudio();

  // Don't duplicate — if this hex is already playing, skip
  if (activeNodes.some((n) => n.hex === hex)) return;

  const s = getSoundForColor(hex);
  const now = ctx.currentTime;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();

  osc.type = s.type;
  osc.frequency.setValueAtTime(s.freq, now);
  osc.detune.setValueAtTime((Math.random() - 0.5) * 10, now);

  const lfoRate = 0.2 + Math.random() * 0.12;
  lfo.type = "sine";
  lfo.frequency.setValueAtTime(lfoRate, now);
  lfoGain.gain.setValueAtTime(0.08, now);

  lfo.connect(lfoGain);
  lfoGain.connect(gain.gain);

  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.25, now + 1.5);

  osc.connect(gain);
  gain.connect(masterGain);

  osc.start(now);
  lfo.start(now);

  activeNodes.push({ osc, gain, lfo, lfoGain, hex });
}

function stopCloudNode(hex) {
  const idx = activeNodes.findIndex((n) => n.hex === hex);
  if (idx === -1) return;
  const node = activeNodes[idx];
  const ctx = ensureAudio();
  const now = ctx.currentTime;
  node.gain.gain.linearRampToValueAtTime(0, now + 0.5);
  node.osc.stop(now + 0.6);
  node.lfo.stop(now + 0.6);
  node.osc.disconnect();
  node.gain.disconnect();
  node.lfo.disconnect();
  node.lfoGain.disconnect();
  activeNodes.splice(idx, 1);
}

function stopAllSounds() {
  const ctx = ensureAudio();
  const now = ctx.currentTime;
  for (const o of activeNodes) {
    o.gain.gain.linearRampToValueAtTime(0, now + 0.5);
    o.osc.stop(now + 0.6);
    o.lfo.stop(now + 0.6);
    o.osc.disconnect();
    o.gain.disconnect();
    o.lfo.disconnect();
    o.lfoGain.disconnect();
  }
  activeNodes = [];
}

function toggleCloudSound(hex) {
  if (activeNodes.some((n) => n.hex === hex)) {
    stopCloudNode(hex);
  } else {
    playCloudSound(hex);
  }
}

function isCloudSoundPlaying(hex) {
  if (hex) return activeNodes.some((n) => n.hex === hex);
  return activeNodes.length > 0;
}

/* ── Fog Canvas ── */

class FogCanvas {
  constructor(canvasEl) {
    this.canvas = canvasEl;
    this.ctx = canvasEl.getContext("2d");
    this.clouds = [];
    this.animId = null;
    this.lastDrawTime = 0;
    this.raindrops = [];
    // Drag state
    this.dragIdx = -1;
    this.dragOffsetX = 0;
    this.dragOffsetY = 0;
    this.dragStartY = 0;
    this.dragMoved = false;
    this.squish = 0; // 0-1, current squish amount, decays over time
    this.resize();
    window.addEventListener("resize", () => {
      this.resize();
      this.recalculatePositions();
    });
    this._initDrag();
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = window.innerWidth * dpr;
    this.canvas.height = window.innerHeight * dpr;
    this.canvas.style.width = window.innerWidth + "px";
    this.canvas.style.height = window.innerHeight + "px";
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  recalculatePositions() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    for (const c of this.clouds) {
      if (c.pctX != null) {
        c.x = c.pctX * w;
        c.y = c.pctY * h;
      }
    }
  }

  _initDrag() {
    const c = this.canvas;

    const getPos = (e) => {
      const rect = c.getBoundingClientRect();
      if (e.touches && e.touches[0]) {
        return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
      }
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const onStart = (e) => {
      const pos = getPos(e);
      const idx = this.hitTest(pos.x, pos.y);
      if (idx >= 0 && idx < this.clouds.length) {
        this.dragIdx = idx;
        this.dragOffsetX = this.clouds[idx].x - pos.x;
        this.dragOffsetY = this.clouds[idx].y - pos.y;
        this.dragStartY = pos.y;
        this.dragMoved = false;
        this.squish = 0.6;
        e.preventDefault();
      }
    };

    const onMove = (e) => {
      if (this.dragIdx < 0) return;
      const pos = getPos(e);
      const cloud = this.clouds[this.dragIdx];
      this.dragMoved = true;
      cloud.x = pos.x + this.dragOffsetX;
      cloud.y = pos.y + this.dragOffsetY;
      cloud.pctX = cloud.x / window.innerWidth;
      cloud.pctY = cloud.y / window.innerHeight;

      // Squish intensity based on drag speed
      const dy = Math.abs(pos.y - this.dragStartY);
      this.squish = Math.min(1, 0.3 + dy / 200);
      this.dragStartY = pos.y;

      // Detune sound based on vertical position
      if (isCloudSoundPlaying(cloud.color)) {
        const node = activeNodes.find((n) => n.hex === cloud.color);
        if (node) {
          const baseFreq = getSoundForColor(cloud.color).freq;
          const yNorm = cloud.y / window.innerHeight;
          const detune = (yNorm - 0.5) * 200;
          node.osc.detune.setValueAtTime(detune, audioCtx.currentTime);
        }
      }

      e.preventDefault();
    };

    const onEnd = () => {
      if (this.dragIdx >= 0) {
        this._savePositions();
        this.dragIdx = -1;
      }
    };

    c.addEventListener("touchstart", onStart, { passive: false });
    c.addEventListener("touchmove", onMove, { passive: false });
    c.addEventListener("touchend", onEnd);
    c.addEventListener("mousedown", onStart);
    c.addEventListener("mousemove", onMove);
    c.addEventListener("mouseup", onEnd);
    c.addEventListener("mouseleave", onEnd);

    // Fade buttons on any canvas touch
    c.addEventListener("touchstart", () => {
      document.getElementById("app").classList.add("fog-touching");
    }, { passive: true });
    c.addEventListener("touchend", () => {
      document.getElementById("app").classList.remove("fog-touching");
    }, { passive: true });
  }

  _savePositions() {
    const board = loadBoard();
    if (!board.length) return;
    for (let i = 0; i < this.clouds.length && i < board.length; i++) {
      board[i].x = Math.round(this.clouds[i].pctX * 100);
      board[i].y = Math.round(this.clouds[i].pctY * 100);
    }
    saveBoard(board);
  }

  setFragments(fragments) {
    const theme = activeTheme;
    this.clouds = fragments.map((frag, i) => this.fogCloud(frag, i, fragments.length, theme));
    if (!this.clouds.length) {
      this.clouds = this.defaultClouds(theme);
    }
  }

  fogCloud(frag, index, total, theme) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const intensity = frag.intensity || 0.5;
    const spread = Math.max(0.6, 1 - total * 0.02);
    const lobeOptions = theme.cloudLobes || [4, 5, 6, 7];
    const numLobes = lobeOptions[Math.floor(Math.random() * lobeOptions.length)];

    return {
      pctX: frag.x / 100,
      pctY: frag.y / 100,
      x: (frag.x / 100) * w,
      y: (frag.y / 100) * h,
      color: frag.color || "#8b9cb3",
      baseOpacity: theme.id === "sky"
        ? 0.08 + intensity * 0.2
        : 0.18 + intensity * 0.32,
      radius: theme.cloudMinRadius + intensity * (theme.cloudMaxRadius - theme.cloudMinRadius),
      lobes: numLobes,
      lobeOffsets: Array.from({ length: 7 }, () => ({
        dx: (Math.random() - 0.5) * 0.7,
        dy: (Math.random() - 0.5) * 0.7,
        scale: 0.35 + Math.random() * 0.65,
      })),
      driftSpeedX: (0.2 + Math.random() * 0.4) * spread * theme.driftSpeed,
      driftSpeedY: (0.15 + Math.random() * 0.3) * spread * theme.driftSpeed,
      driftPhaseX: Math.random() * Math.PI * 2,
      driftPhaseY: Math.random() * Math.PI * 2,
      driftAmpX: theme.id === "sky" ? 10 + Math.random() * 15 : 20 + Math.random() * 40,
      driftAmpY: theme.id === "sky" ? 6 + Math.random() * 10 : 15 + Math.random() * 30,
      opacityPulseSpeed: 0.0002 + Math.random() * 0.0003,
      opacityPulsePhase: Math.random() * Math.PI * 2,
      opacityPulseAmp: 0.06,
      blur: theme.cloudBlur,
    };
  }

  defaultClouds(theme) {
    return theme.baseLayers.map((layer, i) => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const positions = [
        { x: 0.3, y: 0.25 },
        { x: 0.7, y: 0.65 },
        { x: 0.15, y: 0.75 },
      ];
      const pos = positions[i] || { x: 0.5, y: 0.5 };
      const lobeOptions = theme.cloudLobes || [5, 6, 7];
      const numLobes = lobeOptions[Math.floor(Math.random() * lobeOptions.length)];

      return {
        pctX: pos.x,
        pctY: pos.y,
        x: pos.x * w,
        y: pos.y * h,
        color: layer.hex,
        baseOpacity: layer.opacity,
        radius: theme.cloudMaxRadius * 0.9,
        lobes: numLobes,
        lobeOffsets: Array.from({ length: 7 }, () => ({
          dx: (Math.random() - 0.5) * 0.6,
          dy: (Math.random() - 0.5) * 0.6,
          scale: 0.4 + Math.random() * 0.6,
        })),
        driftSpeedX: theme.id === "sky" ? 0.00005 + Math.random() * 0.00008 : 0.0001 + Math.random() * 0.00015,
        driftSpeedY: theme.id === "sky" ? 0.00004 + Math.random() * 0.00006 : 0.00008 + Math.random() * 0.00012,
        driftPhaseX: Math.random() * Math.PI * 2,
        driftPhaseY: Math.random() * Math.PI * 2,
        driftAmpX: theme.id === "sky" ? 10 + Math.random() * 10 : 30 + Math.random() * 20,
        driftAmpY: theme.id === "sky" ? 6 + Math.random() * 8 : 20 + Math.random() * 15,
        opacityPulseSpeed: 0.00015 + Math.random() * 0.0002,
        opacityPulsePhase: Math.random() * Math.PI * 2,
        opacityPulseAmp: 0.03,
        blur: theme.cloudBlur,
      };
    });
  }

  draw(time) {
    const ctx = this.ctx;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const speedMult = state.driftSpeed;
    const theme = activeTheme;

    this.lastDrawTime = time;

    // Background
    ctx.globalCompositeOperation = "source-over";
    if (theme.bgGradient) {
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      theme.bgGradient.forEach((hex, i) => grad.addColorStop(i / (theme.bgGradient.length - 1), hex));
      ctx.fillStyle = grad;
    } else {
      ctx.fillStyle = theme.bg;
    }
    ctx.fillRect(0, 0, w, h);

    const isSky = theme.id === "sky";

    // Apply blur for cloud softness
    ctx.filter = `blur(${this.clouds[0]?.blur || 70}px)`;
    ctx.globalCompositeOperation = isSky ? "source-over" : "screen";

    // Decay squish
    if (this.squish > 0.01) this.squish *= 0.95;

    for (const [ci, c] of this.clouds.entries()) {
      const cx = c.x + Math.sin(time * c.driftSpeedX * speedMult + c.driftPhaseX) * c.driftAmpX;
      const cy = c.y + Math.cos(time * c.driftSpeedY * speedMult + c.driftPhaseY) * c.driftAmpY;
      const isPlaying = isCloudSoundPlaying(c.color);
      const playBoost = isPlaying ? (isSky ? 0.12 : 0.15) : 0;
      const opacity = c.baseOpacity + Math.sin(time * c.opacityPulseSpeed * speedMult + c.opacityPulsePhase) * c.opacityPulseAmp + playBoost;

      // In sky mode, playing clouds tint toward their actual color
      const drawColor = (isSky && isPlaying) ? c.color : (isSky ? "#ffffff" : c.color);

      // Draw irregular shape: multiple overlapping radial gradients at offset positions
      for (let l = 0; l < c.lobes; l++) {
        const lobe = c.lobeOffsets[l];
        let lx = cx + lobe.dx * c.radius;
        let ly = cy + lobe.dy * c.radius;
        let lr = c.radius * lobe.scale;

        // Squish deformation when dragging
        if (ci === this.dragIdx && this.squish > 0.01) {
          const s = this.squish;
          const squashY = 1 - s * 0.3;
          const stretchX = 1 + s * 0.15;
          const randSkew = Math.sin(l * 1.7) * s * 0.12;
          lx = cx + (lx - cx) * stretchX + randSkew * c.radius;
          ly = cy + (ly - cy) * squashY;
          lr *= 1 + s * 0.1;
        }

        const grad = ctx.createRadialGradient(lx, ly, 0, lx, ly, lr);
        grad.addColorStop(0, this.withAlpha(drawColor, Math.max(0.01, opacity * 0.7)));
        grad.addColorStop(0.4, this.withAlpha(drawColor, Math.max(0.01, opacity * 0.35)));
        grad.addColorStop(1, "rgba(0,0,0,0)");

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(lx, ly, lr, 0, Math.PI * 2);
        ctx.fill();
      }

      // Glow ring for playing clouds
      if (isPlaying) {
        const pulse = 0.3 + 0.15 * Math.sin(time * 0.003);
        ctx.filter = "none";
        ctx.globalCompositeOperation = isSky ? "source-over" : "screen";
        ctx.strokeStyle = this.withAlpha(c.color, isSky ? pulse * 0.8 : pulse);
        ctx.lineWidth = isSky ? 3 : 2;
        ctx.beginPath();
        ctx.arc(cx, cy, c.radius * 0.4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.filter = `blur(${c.blur || 70}px)`;
        ctx.globalCompositeOperation = isSky ? "source-over" : "screen";
      }
    }

    ctx.filter = "none";
    ctx.globalCompositeOperation = "source-over";

    // Draw raindrop animations on top
    this.drawRaindrops(time);

    // Sky theme: occasional tree/leaves overlay
    if (activeTheme.useOverlay && activeTheme.overlaySeed < 0.3) {
      this.drawTreeOverlay(w, h);
    }
  }

  drawTreeOverlay(w, h) {
    const ctx = this.ctx;
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "rgba(60, 80, 50, 0.55)";

    // Branch from top-right
    ctx.beginPath();
    ctx.moveTo(w * 0.85, 0);
    ctx.quadraticCurveTo(w * 0.7, h * 0.15, w * 0.55, h * 0.12);
    ctx.lineWidth = 6;
    ctx.strokeStyle = "rgba(80, 60, 40, 0.6)";
    ctx.stroke();

    // Leaves cluster top-right
    for (let i = 0; i < 8; i++) {
      const lx = w * (0.55 + Math.random() * 0.35);
      const ly = h * (Math.random() * 0.18);
      const lr = 12 + Math.random() * 18;
      ctx.fillStyle = `rgba(${50 + Math.random() * 40}, ${70 + Math.random() * 40}, ${40 + Math.random() * 30}, ${0.35 + Math.random() * 0.25})`;
      ctx.beginPath();
      ctx.ellipse(lx, ly, lr, lr * 0.6, Math.random() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }

    // Branch from bottom-left
    ctx.beginPath();
    ctx.moveTo(0, h * 0.8);
    ctx.quadraticCurveTo(w * 0.15, h * 0.65, w * 0.25, h * 0.55);
    ctx.lineWidth = 5;
    ctx.strokeStyle = "rgba(80, 60, 40, 0.5)";
    ctx.stroke();

    // Leaves cluster bottom-left
    for (let i = 0; i < 6; i++) {
      const lx = w * (Math.random() * 0.28);
      const ly = h * (0.5 + Math.random() * 0.35);
      const lr = 10 + Math.random() * 16;
      ctx.fillStyle = `rgba(${50 + Math.random() * 40}, ${70 + Math.random() * 40}, ${40 + Math.random() * 30}, ${0.3 + Math.random() * 0.25})`;
      ctx.beginPath();
      ctx.ellipse(lx, ly, lr, lr * 0.55, Math.random() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  addRaindrop(targetXPct, targetYPct, color) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.raindrops.push({
      targetX: targetXPct * w,
      targetY: targetYPct * h,
      color,
      startTime: performance.now(),
      dropDuration: 800,   // ms for the drop to fall
      rippleDuration: 1800, // ms for ripples to expand and fade
      dropRadius: 4,
    });
  }

  drawRaindrops(now) {
    const ctx = this.ctx;
    const elapsed = (time) => now - time;
    const isSky = activeTheme.id === "sky";

    this.raindrops = this.raindrops.filter((r) => {
      const age = elapsed(r.startTime);
      const totalDuration = r.dropDuration + r.rippleDuration;
      if (age > totalDuration) return false; // animation done

      const tx = r.targetX;
      const ty = r.targetY;
      const rInt = parseInt(r.color.slice(1, 3), 16);
      const gInt = parseInt(r.color.slice(3, 5), 16);
      const bInt = parseInt(r.color.slice(5, 7), 16);

      // Phase 1: Falling drop
      if (age < r.dropDuration) {
        const t = age / r.dropDuration;
        const ease = t * t; // accelerate as it falls
        const dropY = -40 + (ty + 40) * ease;
        const dropOpacity = 1 - t * 0.3;

        ctx.globalCompositeOperation = isSky ? "source-over" : "screen";
        ctx.fillStyle = `rgba(${rInt},${gInt},${bInt},${isSky ? dropOpacity * 0.7 : dropOpacity})`;
        ctx.beginPath();
        ctx.arc(tx, dropY, r.dropRadius * (1 - t * 0.3), 0, Math.PI * 2);
        ctx.fill();
        ctx.globalCompositeOperation = "source-over";
      }

      // Phase 2: Ripple rings on impact
      if (age >= r.dropDuration) {
        const rippleAge = age - r.dropDuration;
        const t = rippleAge / r.rippleDuration;

        ctx.globalCompositeOperation = isSky ? "source-over" : "screen";
        for (let ring = 0; ring < 3; ring++) {
          const ringDelay = ring * 0.15;
          const ringT = Math.max(0, Math.min(1, (t - ringDelay) / (1 - ringDelay)));
          if (ringT <= 0 || ringT >= 1) continue;

          const radius = 8 + ringT * 80;
          const opacity = (1 - ringT) * (isSky ? 0.5 : 0.4);

          ctx.strokeStyle = `rgba(${rInt},${gInt},${bInt},${opacity})`;
          ctx.lineWidth = isSky ? 2.5 : (2 - ringT * 1.5);
          ctx.beginPath();
          ctx.arc(tx, ty, radius, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Central glow on impact, fades quickly
        if (t < 0.3) {
          const glowOpacity = (1 - t / 0.3) * 0.5;
          const grad = ctx.createRadialGradient(tx, ty, 0, tx, ty, 30);
          grad.addColorStop(0, `rgba(${rInt},${gInt},${bInt},${glowOpacity})`);
          grad.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(tx, ty, 30, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.globalCompositeOperation = "source-over";
      }

      return true;
    });
  }

  withAlpha(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  start() {
    if (this.animId) return;
    const loop = (time) => {
      this.draw(time);
      this.animId = requestAnimationFrame(loop);
    };
    this.animId = requestAnimationFrame(loop);
  }

  stop() {
    if (this.animId) {
      cancelAnimationFrame(this.animId);
      this.animId = null;
    }
  }

  hitTest(px, py) {
    const time = this.lastDrawTime;
    const speedMult = state.driftSpeed;
    for (let i = this.clouds.length - 1; i >= 0; i--) {
      const c = this.clouds[i];
      const cx = c.x + Math.sin(time * c.driftSpeedX * speedMult + c.driftPhaseX) * c.driftAmpX;
      const cy = c.y + Math.cos(time * c.driftSpeedY * speedMult + c.driftPhaseY) * c.driftAmpY;
      const dx = px - cx;
      const dy = py - cy;
      if (dx * dx + dy * dy < c.radius * c.radius * 0.6) {
        return i;
      }
    }
    return -1;
  }
}

// Initialise fog canvas once
const fogCanvas = new FogCanvas(document.getElementById("fog-canvas"));

function refreshFog() {
  fogCanvas.setFragments(loadBoard());
}

/* ── Navigation ── */

function go(screen) {
  state.screen = screen;
  render();
}

function topNav(showBack = false) {
  const nav = el("div", { className: "top-nav" }, [
    el("span", { className: "logo", text: "enough" }),
  ]);

  if (showBack) {
    nav.append(
      el("button", {
        className: "nav-link",
        text: "back",
        onClick: () => go("welcome"),
      })
    );
  }

  return nav;
}

/* ── Fragment management ── */

function addFragment() {
  const board = loadBoard();
  const word = state.freeText.trim() || state.feeling || "…";
  const x = 8 + Math.random() * 84;
  const y = 8 + Math.random() * 84;

  board.push({
    word: word.length > 24 ? word.slice(0, 22) + "…" : word,
    color: state.color.hex,
    intensity: state.intensity,
    x,
    y,
    date: new Date().toISOString(),
  });

  saveBoard(board);
  refreshFog();

  // Store raindrop for when home screen renders
  state.pendingRaindrop = { x, y, color: state.color.hex };
}

/* ── Screens ── */

let homeClickHandler = null;
let homeTouchHandler = null;

function renderWelcome() {
  const board = loadBoard();

  // Fire pending raindrop animation now that home screen is visible
  if (state.pendingRaindrop) {
    const r = state.pendingRaindrop;
    fogCanvas.addRaindrop(r.x, r.y, r.color);
    state.pendingRaindrop = null;
  }

  const driftSlider = el("input", {
    type: "range",
    min: "0",
    max: "300",
    value: String(state.driftSpeed * 100),
    className: "drift-slider",
  });
  driftSlider.addEventListener("input", (e) => {
    state.driftSpeed = Number(e.target.value) / 100;
  });

  // Tap fog canvas on home screen to play/stop cloud sound
  const canvas = fogCanvas.canvas;
  if (homeClickHandler) {
    canvas.removeEventListener("click", homeClickHandler);
    canvas.removeEventListener("touchend", homeTouchHandler);
  }
  homeClickHandler = (e) => {
    if (fogCanvas.dragMoved) { fogCanvas.dragMoved = false; return; }
    const { x, y } = canvasCoords(e, canvas);
    const hitIdx = fogCanvas.hitTest(x, y);
    if (hitIdx >= 0) {
      const clouds = fogCanvas.clouds;
      if (hitIdx < clouds.length) {
        toggleCloudSound(clouds[hitIdx].color);
      }
    }
  };
  homeTouchHandler = (e) => {
    e.preventDefault();
    homeClickHandler(e);
  };
  canvas.addEventListener("click", homeClickHandler);
  canvas.addEventListener("touchend", homeTouchHandler);
  canvas.style.pointerEvents = "auto";

  const actions = [
    el("button", {
      className: "btn btn-primary btn-narrow",
      text: "Notice what's inside",
      onClick: () => {
        canvas.removeEventListener("click", homeClickHandler);
        canvas.removeEventListener("touchend", homeTouchHandler);
        canvas.style.pointerEvents = "none";
        go("arrive");
      },
    }),
  ];

  if (board.length) {
    actions.push(
      el("button", {
        className: "btn btn-ghost btn-narrow",
        text: "Explore the fog",
        onClick: () => {
          canvas.removeEventListener("click", homeClickHandler);
          canvas.removeEventListener("touchend", homeTouchHandler);
          canvas.style.pointerEvents = "none";
          go("fogExplore");
        },
      })
    );
  }

  const silenceBtn = el("button", {
    className: "btn btn-ghost btn-silence",
    text: "silence",
    onClick: () => { stopAllSounds(); render(); },
  });
  if (!isCloudSoundPlaying()) silenceBtn.style.display = "none";

  const themeBtn = el("button", {
    className: "btn btn-ghost btn-theme",
    text: activeTheme.id === "fog" ? "sky" : "fog",
    onClick: () => {
      activeTheme = activeTheme.id === "fog" ? THEMES.sky : THEMES.fog;
      document.body.classList.toggle("sky-mode", activeTheme.id === "sky");
      refreshFog();
      render();
    },
  });

  return el("div", { className: "screen screen-home" }, [
    el("div", { className: "home-top" }, [
      el("span", { className: "logo", text: "enough" }),
    ]),
    el("div", { className: "home-center" }, [
      el("p", { className: "home-tagline", text: "Tap fog to Listen." }),
    ]),
    el("div", { className: "home-controls" }, [
      el("div", { className: "drift-control" }, [
        el("span", { className: "control-label", text: "pace" }),
        driftSlider,
      ]),
      silenceBtn,
      themeBtn,
    ]),
    el("div", { className: "actions" }, actions),
  ]);
}

function renderArrive() {
  const screen = el("div", { className: "screen" }, [topNav(true)]);

  screen.append(
    el("h1", { text: "What's here right now?" }),
    el("p", { className: "section-label", text: "Pick a word, or write your own" })
  );

  const chipsWrap = el("div", { className: "chips" });
  const chipBtns = [];

  Object.entries(WORD_CHIPS).forEach(([group, words]) => {
    const groupWrap = el("div", { className: "chip-group" });
    const toggle = el("button", { className: "chip-group-toggle", text: group });
    const list = el("div", { className: "chip-group-list" });

    words.forEach((word) => {
      const btn = el("button", {
        className: `chip${state.feeling === word ? " selected" : ""}`,
        text: word,
        onClick: () => {
          state.feeling = state.feeling === word ? "" : word;
          chipBtns.forEach((b) => b.classList.toggle("selected", b.textContent === state.feeling));
        },
      });
      chipBtns.push(btn);
      list.append(btn);
    });

    list.style.display = "none";
    toggle.addEventListener("click", () => {
      const open = list.style.display !== "none";
      list.style.display = open ? "none" : "flex";
      toggle.classList.toggle("open", !open);
    });

    groupWrap.append(toggle, list);
    chipsWrap.append(groupWrap);
  });

  screen.append(chipsWrap);

  const textarea = el("textarea", {
    className: "text-input",
    placeholder: "Or type anything… e.g. having trouble at work",
    rows: "2",
  });
  textarea.value = state.freeText;
  textarea.addEventListener("input", (e) => {
    state.freeText = e.target.value;
  });
  screen.append(textarea);

  // Color picker: preset swatches + custom
  screen.append(el("p", { className: "section-label", text: "A color, if one fits" }));
  const colorsWrap = el("div", { className: "colors" });
  const colorBtns = [];
  COLORS.forEach((c) => {
    const btn = el("button", {
      className: `color-btn${state.color.id === c.id ? " selected" : ""}`,
      style: `background: ${c.hex}`,
      title: c.label,
      onClick: () => {
        state.color = c;
        colorBtns.forEach((b) => b.classList.remove("selected"));
        btn.classList.add("selected");
      },
    });
    colorBtns.push(btn);
    colorsWrap.append(btn);
  });
  // Custom color picker
  const customWrap = el("div", { className: "custom-color-wrap" });
  const customInput = el("input", {
    type: "color",
    className: "custom-color-input",
    value: state.color.hex,
  });
  customInput.addEventListener("input", (e) => {
    state.color = { id: "custom", hex: e.target.value, label: "custom" };
    colorBtns.forEach((b) => b.classList.remove("selected"));
  });
  customWrap.append(
    el("span", { className: "custom-color-label", text: "or choose" }),
    customInput
  );
  colorsWrap.append(customWrap);
  screen.append(colorsWrap);

  screen.append(el("p", { className: "section-label", text: "How much is here?" }));
  const slider = el("input", { type: "range", min: "0", max: "100", value: String(state.intensity * 100) });
  slider.addEventListener("input", (e) => {
    state.intensity = Number(e.target.value) / 100;
  });
  screen.append(
    el("div", { className: "slider-wrap" }, [
      slider,
      el("div", { className: "slider-labels" }, [
        el("span", { text: "a whisper" }),
        el("span", { text: "a lot" }),
      ]),
    ])
  );

  const canContinue = true;

  async function generateWitness() {
    if (AI_CONFIG.enabled) {
      state.witness = "…";
      go("witness");
      state.witness = await getAIWitness(state.feeling, state.freeText);
      render();
    } else {
      state.witness = pickWitness(state.feeling, state.freeText);
      go("witness");
    }
  }

  screen.append(
    el("div", { className: "actions" }, [
      el("button", {
        className: "btn btn-primary",
        text: "Continue",
        onClick: () => {
          if (!canContinue) return;
          generateWitness();
        },
      }),
      el("button", {
        className: "btn btn-ghost",
        text: "That's enough for today",
        onClick: () => {
          if (canContinue) {
            state.witness = pickWitness(state.feeling, state.freeText);
            addFragment();
          }
          go("release");
        },
      }),
    ])
  );

  return screen;
}

function renderWitness() {
  return el("div", { className: "screen" }, [
    topNav(),
    el("h1", { text: "What's here" }),
    el("p", { className: "witness", text: state.witness }),
    el("p", { className: "lead", text: "Want to stay with this a moment?" }),
    el("div", { className: "actions" }, [
      el("button", {
        className: "btn btn-primary",
        text: "Stay a moment",
        onClick: () => go("deepen"),
      }),
      el("button", {
        className: "btn btn-ghost",
        text: "Skip to the fog",
        onClick: () => go("fragment"),
      }),
      el("button", {
        className: "btn btn-quiet",
        text: "That's enough for today",
        onClick: () => {
          addFragment();
          go("release");
        },
      }),
    ]),
  ]);
}

function renderDeepen() {
  const screen = el("div", { className: "screen" }, [topNav(), el("h1", { text: "Stay with it" })]);

  const questionEl = el("p", { className: "lead", text: "…" });
  screen.append(questionEl);

  // Load question (async if AI enabled, sync otherwise)
  (async () => {
    const q = AI_CONFIG.enabled
      ? await getAIDeepen(state.feeling, state.freeText)
      : pickDeepen(state.feeling, state.freeText);
    questionEl.textContent = q;
  })();

  const textarea = el("textarea", {
    className: "text-input",
    placeholder: "Only if you want to…",
    rows: "3",
  });
  textarea.value = state.deepenAnswer;
  textarea.addEventListener("input", (e) => {
    state.deepenAnswer = e.target.value;
  });
  screen.append(textarea);

  screen.append(
    el("div", { className: "actions" }, [
      el("button", {
        className: "btn btn-primary",
        text: "Continue",
        onClick: () => go("reframe"),
      }),
      el("button", {
        className: "btn btn-ghost",
        text: "Skip",
        onClick: () => go("fragment"),
      }),
      el("button", {
        className: "btn btn-quiet",
        text: "That's enough for today",
        onClick: () => {
          addFragment();
          go("release");
        },
      }),
    ])
  );

  return screen;
}

function renderReframe() {
  const options = buildReframes(state.feeling, state.freeText, state.deepenAnswer);
  const list = el("div", { className: "reframe-list" });
  const optionBtns = [];

  options.forEach((opt) => {
    const btn = el("button", {
      className: `reframe-option${opt.id === "stay" ? " stay" : ""}${state.selectedReframe === opt.id ? " selected" : ""}`,
      text: opt.label,
      onClick: () => {
        state.selectedReframe = state.selectedReframe === opt.id ? null : opt.id;
        state.reframeText = state.selectedReframe ? opt.text : "";
        optionBtns.forEach((b) => b.classList.remove("selected"));
        if (state.selectedReframe) btn.classList.add("selected");
        const contBtn = document.querySelector(".reframe-actions .btn-primary");
        if (contBtn) contBtn.textContent = state.selectedReframe ? "Continue" : "Skip to the fog";
      },
    });
    optionBtns.push(btn);
    list.append(btn);
  });

  return el("div", { className: "screen" }, [
    topNav(),
    el("h1", { text: "A second angle?" }),
    el("p", { className: "lead", text: "Some people find another lens. No pressure." }),
    list,
    el("div", { className: "actions reframe-actions" }, [
      el("button", {
        className: "btn btn-primary",
        text: state.selectedReframe ? "Continue" : "Skip to the fog",
        onClick: () => go("fragment"),
      }),
      el("button", {
        className: "btn btn-ghost",
        text: "None of these",
        onClick: () => {
          state.selectedReframe = null;
          state.reframeText = "";
          go("fragment");
        },
      }),
    ]),
  ]);
}

function renderFragment() {
  const word = state.freeText.trim() || state.feeling || "…";
  const preview = el("div", {
    className: "fragment-preview",
    style: `background: ${state.color.hex}; opacity: ${0.65 + state.intensity * 0.3}`,
    text: word.length > 20 ? word.slice(0, 18) + "…" : word,
  });

  return el("div", { className: "screen" }, [
    topNav(),
    el("h1", { text: "Leave something behind?" }),
    el("p", { className: "lead", text: "A fragment for your fog — from this moment." }),
    preview,
    ...(state.reframeText && state.selectedReframe !== "stay"
      ? [el("p", { className: "lead", text: state.reframeText })]
      : []),
    el("div", { className: "actions" }, [
      el("button", {
        className: "btn btn-primary",
        text: "Keep it",
        onClick: () => {
          addFragment();
          go("release");
        },
      }),
      el("button", {
        className: "btn btn-ghost",
        text: "Leave nothing",
        onClick: () => go("release"),
      }),
    ]),
  ]);
}

function renderRelease() {
  const iconColor = state.color.hex;
  return el("div", { className: "screen" }, [
    topNav(),
    el("div", { className: "release-icon", text: "○", style: `color: ${iconColor}` }),
    el("h1", { text: "That's sufficient." }),
    el("p", { className: "lead", text: "You can go live your day. This will be here. Nothing expires." }),
    el("div", { className: "actions" }, [
      el("button", {
        className: "btn btn-primary",
        text: "Close",
        onClick: () => {
          resetSession();
          go("welcome");
        },
      }),
      el("button", {
        className: "btn btn-ghost",
        text: "View your fog",
        onClick: () => {
          resetSession();
          go("fogExplore");
        },
      }),
    ]),
  ]);
}

function resetSession() {
  state.feeling = "";
  state.freeText = "";
  state.color = COLORS[0];
  state.intensity = 0.5;
  state.witness = "";
  state.deepenAnswer = "";
  state.selectedReframe = null;
  state.reframeText = "";
}

/* ── Fog Explore Screen ── */

let selectedFragment = null;
let exploreClickHandler = null;
let exploreTouchHandler = null;

function renderFogExplore() {
  const board = loadBoard();
  selectedFragment = null;

  const overlay = el("div", { className: "explore-overlay" });
  overlay.style.display = "none";

  const detailCard = el("div", { className: "explore-detail" });

  function showDetail(frag) {
    selectedFragment = frag;
    detailCard.innerHTML = "";

    const dateStr = frag.date
      ? new Date(frag.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })
      : "";

    detailCard.append(
      el("div", {
        className: "detail-color",
        style: `background: ${frag.color}`,
      }),
      el("p", { className: "detail-word", text: frag.word || "…" }),
      el("p", { className: "detail-date", text: dateStr }),
      el("p", {
        className: "detail-intensity",
        text: frag.intensity > 0.66 ? "a lot" : frag.intensity > 0.33 ? "some" : "a whisper",
      }),
      el("div", { className: "detail-actions" }, [
        el("button", {
          className: "btn btn-ghost",
          text: "Remove",
          onClick: () => {
            const updated = loadBoard().filter((f) => f.date !== frag.date);
            saveBoard(updated);
            refreshFog();
            overlay.style.display = "none";
            selectedFragment = null;
            // Re-render the explore screen
            go("fogExplore");
          },
        }),
        el("button", {
          className: "btn btn-ghost",
          text: "Close",
          onClick: () => {
            overlay.style.display = "none";
            selectedFragment = null;
          },
        }),
      ])
    );

    overlay.style.display = "flex";
  }

  overlay.append(detailCard);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) {
      overlay.style.display = "none";
      selectedFragment = null;
    }
  });

  // Set up canvas click detection
  const canvas = fogCanvas.canvas;
  exploreClickHandler = (e) => {
    if (fogCanvas.dragMoved) { fogCanvas.dragMoved = false; return; }
    const { x, y } = canvasCoords(e, canvas);
    const hitIdx = fogCanvas.hitTest(x, y);
    if (hitIdx >= 0 && hitIdx < fogCanvas.clouds.length) {
      playCloudSound(fogCanvas.clouds[hitIdx].color);
      if (hitIdx < board.length) {
        showDetail(board[hitIdx]);
      }
    }
  };
  exploreTouchHandler = (e) => {
    e.preventDefault();
    exploreClickHandler(e);
  };
  canvas.addEventListener("click", exploreClickHandler);
  canvas.addEventListener("touchend", exploreTouchHandler);
  canvas.style.pointerEvents = "auto";

  const screen = el("div", { className: "screen screen-explore" }, [
    el("div", { className: "explore-header" }, [
      el("span", { className: "logo", text: "enough" }),
      el("button", {
        className: "nav-link",
        text: "back",
        onClick: () => {
          canvas.removeEventListener("click", exploreClickHandler);
          canvas.removeEventListener("touchend", exploreTouchHandler);
          canvas.style.pointerEvents = "none";
          go("welcome");
        },
      }),
    ]),
    el("p", { className: "explore-hint", text: "Tap a cloud to see what's inside." }),
    overlay,
  ]);

  return screen;
}

/* ── Render ── */

function render() {
  const app = document.getElementById("app");
  app.innerHTML = "";

  const screens = {
    welcome: renderWelcome,
    arrive: renderArrive,
    witness: renderWitness,
    deepen: renderDeepen,
    reframe: renderReframe,
    fragment: renderFragment,
    release: renderRelease,
    fogExplore: renderFogExplore,
  };

  app.append(screens[state.screen]());
}

// Boot
document.body.classList.toggle("sky-mode", activeTheme.id === "sky");
refreshFog();
fogCanvas.start();
render();

// Auto-save and fade sounds when app goes to background
let soundsBeforeHide = [];

function handleHide() {
  saveBoard(loadBoard());
  soundsBeforeHide = activeNodes.map((n) => n.hex);
  stopAllSounds();
}

function handleShow() {
  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume();
  }
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden) handleHide();
  else handleShow();
});
window.addEventListener("pagehide", handleHide);
window.addEventListener("pageshow", handleShow);
