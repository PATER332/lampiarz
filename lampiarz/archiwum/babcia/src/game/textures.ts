import * as THREE from "three";

const cache = new Map<string, THREE.Texture>();

type Draw = (ctx: CanvasRenderingContext2D, s: number) => void;

function canvas(size: number, draw: Draw) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  draw(ctx, size);
  return c;
}

function toTex(c: HTMLCanvasElement, srgb = true, repeat: [number, number] = [1, 1]) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function make(key: string, size: number, draw: Draw, srgb = true): THREE.Texture {
  const hit = cache.get(key);
  if (hit) return hit;
  const t = toTex(canvas(size, draw), srgb);
  cache.set(key, t);
  return t;
}

/** Builds a tangent-space normal map from a grayscale height canvas (Sobel). */
function normalFromHeight(key: string, size: number, draw: Draw, strength = 2.5): THREE.Texture {
  const hit = cache.get(key);
  if (hit) return hit;
  const hc = canvas(size, draw);
  const hctx = hc.getContext("2d")!;
  const src = hctx.getImageData(0, 0, size, size).data;
  const out = document.createElement("canvas");
  out.width = out.height = size;
  const octx = out.getContext("2d")!;
  const img = octx.createImageData(size, size);
  const d = img.data;
  const h = (x: number, y: number) => {
    x = (x + size) % size;
    y = (y + size) % size;
    return src[(y * size + x) * 4] / 255;
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const tl = h(x - 1, y - 1), t = h(x, y - 1), tr = h(x + 1, y - 1);
      const l = h(x - 1, y), r = h(x + 1, y);
      const bl = h(x - 1, y + 1), b = h(x, y + 1), br = h(x + 1, y + 1);
      const dx = (tr + 2 * r + br - (tl + 2 * l + bl)) * strength;
      const dy = (bl + 2 * b + br - (tl + 2 * t + tr)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      d[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      d[i + 1] = ((-dy / len) * 0.5 + 0.5) * 255;
      d[i + 2] = (1 / len) * 0.5 * 255 + 127;
      d[i + 3] = 255;
    }
  }
  octx.putImageData(img, 0, 0);
  const tex = toTex(out, false);
  cache.set(key, tex);
  return tex;
}

// ---------------------------------------------------------------- helpers
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function noise(ctx: CanvasRenderingContext2D, s: number, amount: number) {
  const img = ctx.getImageData(0, 0, s, s);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * amount;
    d[i] = Math.max(0, Math.min(255, d[i] + n));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n));
  }
  ctx.putImageData(img, 0, 0);
}

function blotches(ctx: CanvasRenderingContext2D, s: number, n: number, color: string, max = 90, rnd = Math.random) {
  for (let i = 0; i < n; i++) {
    const x = rnd() * s;
    const y = rnd() * s;
    const r = 10 + rnd() * max;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function cracks(ctx: CanvasRenderingContext2D, s: number, n: number, color: string, rnd: () => number, width = 1.2) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  for (let i = 0; i < n; i++) {
    let x = rnd() * s;
    let y = rnd() * s;
    ctx.beginPath();
    ctx.moveTo(x, y);
    const segs = 8 + Math.floor(rnd() * 18);
    let ang = rnd() * Math.PI * 2;
    for (let k = 0; k < segs; k++) {
      ang += (rnd() - 0.5) * 1.3;
      x += Math.cos(ang) * (4 + rnd() * 10);
      y += Math.sin(ang) * (4 + rnd() * 10);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

// ---------------------------------------------------------------- FLOOR
const PLANKS = 8;
function plankLayout(s: number, rnd: () => number) {
  const plank = s / PLANKS;
  const rows: { y: number; seams: number[]; shade: number }[] = [];
  for (let i = 0; i < PLANKS; i++) {
    const seams: number[] = [];
    let x = rnd() * s * 0.5;
    while (x < s) {
      seams.push(x);
      x += s * (0.35 + rnd() * 0.45);
    }
    rows.push({ y: i * plank, seams, shade: rnd() });
  }
  return { plank, rows };
}

export function floorTex(): THREE.Texture {
  return make("floor", 1024, (ctx, s) => {
    const rnd = seeded(7);
    const { plank, rows } = plankLayout(s, rnd);
    ctx.fillStyle = "#2a1c12";
    ctx.fillRect(0, 0, s, s);
    rows.forEach(({ y, seams, shade }) => {
      const base = 44 + shade * 34;
      ctx.fillStyle = `rgb(${base + 26},${base * 0.72 + 8},${base * 0.46})`;
      ctx.fillRect(0, y + 2, s, plank - 4);
      // long grain
      for (let g = 0; g < 70; g++) {
        ctx.strokeStyle = `rgba(${rnd() < 0.5 ? 0 : 255},${rnd() < 0.5 ? 0 : 200},0,${0.02 + rnd() * 0.06})`;
        ctx.lineWidth = 0.6 + rnd() * 1.4;
        ctx.beginPath();
        const gy = y + 3 + rnd() * (plank - 6);
        ctx.moveTo(0, gy);
        for (let x = 0; x <= s; x += s / 6) ctx.lineTo(x, gy + (rnd() - 0.5) * 7);
        ctx.stroke();
      }
      // knots
      if (rnd() < 0.7) {
        const kx = rnd() * s;
        const ky = y + plank * (0.3 + rnd() * 0.4);
        for (let r = 14; r > 2; r -= 3) {
          ctx.strokeStyle = `rgba(20,10,4,${0.25 + (14 - r) * 0.03})`;
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.ellipse(kx, ky, r * 1.6, r, 0.3, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      // seams + nails
      ctx.fillStyle = "rgba(0,0,0,0.75)";
      ctx.fillRect(0, y, s, 3);
      seams.forEach((sx) => {
        ctx.fillRect(sx, y, 3, plank);
        ctx.fillStyle = "rgba(0,0,0,0.6)";
        ctx.beginPath();
        ctx.arc(sx + 12, y + 10, 2.2, 0, Math.PI * 2);
        ctx.arc(sx + 12, y + plank - 10, 2.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(0,0,0,0.75)";
      });
    });
    blotches(ctx, s, 26, "rgba(14,8,3,0.5)", 160, rnd);
    blotches(ctx, s, 10, "rgba(70,18,8,0.2)", 90, rnd);
    blotches(ctx, s, 14, "rgba(255,230,180,0.05)", 200, rnd);
    noise(ctx, s, 22);
  });
}

export function floorNormal(): THREE.Texture {
  return normalFromHeight(
    "floorN",
    512,
    (ctx, s) => {
      const rnd = seeded(7);
      const { plank, rows } = plankLayout(s, rnd);
      ctx.fillStyle = "#808080";
      ctx.fillRect(0, 0, s, s);
      rows.forEach(({ y, seams, shade }) => {
        ctx.fillStyle = `rgb(${120 + shade * 30},${120 + shade * 30},${120 + shade * 30})`;
        ctx.fillRect(0, y + 1, s, plank - 2);
        for (let g = 0; g < 40; g++) {
          ctx.strokeStyle = `rgba(${rnd() < 0.5 ? 0 : 255},${rnd() < 0.5 ? 0 : 255},${rnd() < 0.5 ? 0 : 255},0.08)`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          const gy = y + 2 + rnd() * (plank - 4);
          ctx.moveTo(0, gy);
          for (let x = 0; x <= s; x += s / 6) ctx.lineTo(x, gy + (rnd() - 0.5) * 4);
          ctx.stroke();
        }
        ctx.fillStyle = "#101010";
        ctx.fillRect(0, y, s, 2);
        seams.forEach((sx) => ctx.fillRect(sx, y, 2, plank));
      });
    },
    3.2,
  );
}

// ---------------------------------------------------------------- WALL
function damask(ctx: CanvasRenderingContext2D, s: number, color: string) {
  ctx.fillStyle = color;
  const step = 96;
  for (let y = 0; y < s + step; y += step) {
    for (let x = 0; x < s + step; x += step) {
      const ox = ((y / step) % 2) * step * 0.5;
      const cx = x + ox;
      const cy = y;
      ctx.beginPath();
      ctx.ellipse(cx, cy, 9, 20, 0, 0, Math.PI * 2);
      ctx.ellipse(cx - 16, cy + 10, 7, 14, 0.8, 0, Math.PI * 2);
      ctx.ellipse(cx + 16, cy + 10, 7, 14, -0.8, 0, Math.PI * 2);
      ctx.ellipse(cx, cy + 30, 5, 9, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx, cy - 30, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

export function wallTex(): THREE.Texture {
  return make("wall", 1024, (ctx, s) => {
    const rnd = seeded(31);
    ctx.fillStyle = "#5f5747";
    ctx.fillRect(0, 0, s, s);
    // vertical stripes
    for (let x = 0; x < s; x += 64) {
      ctx.fillStyle = "rgba(110,100,82,0.28)";
      ctx.fillRect(x, 0, 28, s);
      ctx.fillStyle = "rgba(40,34,26,0.18)";
      ctx.fillRect(x + 44, 0, 4, s);
    }
    damask(ctx, s, "rgba(86,74,56,0.5)");
    damask(ctx, s, "rgba(120,106,80,0.12)");
    // peeled wallpaper patches exposing plaster
    for (let i = 0; i < 5; i++) {
      const x = rnd() * s, y = rnd() * s * 0.7;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(x, y);
      const pts = 8;
      for (let k = 0; k < pts; k++) {
        const a = (k / pts) * Math.PI * 2;
        const r = 40 + rnd() * 90;
        ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r * 1.4);
      }
      ctx.closePath();
      ctx.clip();
      ctx.fillStyle = "#8b8578";
      ctx.fillRect(0, 0, s, s);
      blotches(ctx, s, 10, "rgba(60,55,48,0.5)", 60, rnd);
      ctx.restore();
      ctx.strokeStyle = "rgba(20,16,10,0.6)";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    // skirting board
    const sk = s * 0.11;
    ctx.fillStyle = "#231b13";
    ctx.fillRect(0, s - sk, s, sk);
    ctx.fillStyle = "rgba(255,240,220,0.08)";
    ctx.fillRect(0, s - sk, s, 4);
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(0, s - sk + 12, s, 3);
    // cornice
    ctx.fillStyle = "#2b2419";
    ctx.fillRect(0, 0, s, 28);
    ctx.fillStyle = "rgba(255,240,220,0.06)";
    ctx.fillRect(0, 22, s, 3);
    // stains, mold, cracks
    blotches(ctx, s, 30, "rgba(24,18,10,0.55)", 110, rnd);
    blotches(ctx, s, 8, "rgba(30,60,22,0.2)", 140, rnd);
    blotches(ctx, s, 6, "rgba(90,30,14,0.18)", 70, rnd);
    cracks(ctx, s, 7, "rgba(10,8,5,0.55)", rnd, 1.4);
    // drip streaks from the top
    for (let i = 0; i < 14; i++) {
      const x = rnd() * s;
      const grd = ctx.createLinearGradient(0, 0, 0, s * (0.3 + rnd() * 0.5));
      grd.addColorStop(0, "rgba(15,12,8,0.5)");
      grd.addColorStop(1, "rgba(15,12,8,0)");
      ctx.fillStyle = grd;
      ctx.fillRect(x, 0, 3 + rnd() * 10, s);
    }
    noise(ctx, s, 20);
  });
}

export function wallNormal(): THREE.Texture {
  return normalFromHeight(
    "wallN",
    512,
    (ctx, s) => {
      const rnd = seeded(31);
      ctx.fillStyle = "#808080";
      ctx.fillRect(0, 0, s, s);
      for (let x = 0; x < s; x += 32) {
        ctx.fillStyle = "#8a8a8a";
        ctx.fillRect(x, 0, 14, s);
      }
      // raised damask
      ctx.save();
      ctx.scale(0.5, 0.5);
      damask(ctx, s * 2, "rgba(150,150,150,1)");
      ctx.restore();
      // plaster bumps
      for (let i = 0; i < 2500; i++) {
        ctx.fillStyle = `rgba(${rnd() < 0.5 ? 60 : 200},${rnd() < 0.5 ? 60 : 200},${rnd() < 0.5 ? 60 : 200},0.12)`;
        ctx.fillRect(rnd() * s, rnd() * s, 2, 2);
      }
      cracks(ctx, s, 7, "rgba(0,0,0,0.9)", rnd, 1.6);
      const sk = s * 0.11;
      ctx.fillStyle = "#b0b0b0";
      ctx.fillRect(0, s - sk, s, sk);
      ctx.fillStyle = "#d0d0d0";
      ctx.fillRect(0, s - sk, s, 3);
      ctx.fillStyle = "#a0a0a0";
      ctx.fillRect(0, 0, s, 14);
    },
    2.4,
  );
}

// ---------------------------------------------------------------- CEILING
export function ceilingTex(): THREE.Texture {
  return make("ceil", 512, (ctx, s) => {
    const rnd = seeded(99);
    ctx.fillStyle = "#3a3630";
    ctx.fillRect(0, 0, s, s);
    blotches(ctx, s, 16, "rgba(12,10,8,0.6)", 140, rnd);
    // water stain rings
    for (let i = 0; i < 4; i++) {
      const x = rnd() * s, y = rnd() * s;
      for (let r = 90; r > 10; r -= 12) {
        ctx.strokeStyle = `rgba(70,50,30,${0.08 + rnd() * 0.08})`;
        ctx.lineWidth = 2 + rnd() * 3;
        ctx.beginPath();
        ctx.ellipse(x, y, r * (1 + rnd() * 0.2), r * 0.8, rnd(), 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    cracks(ctx, s, 5, "rgba(10,8,6,0.5)", rnd, 1.1);
    noise(ctx, s, 14);
  });
}

// ---------------------------------------------------------------- TILES
export function tileTex(): THREE.Texture {
  return make("tile", 512, (ctx, s) => {
    const rnd = seeded(5);
    ctx.fillStyle = "#2e2a26";
    ctx.fillRect(0, 0, s, s);
    const n = 4;
    const t = s / n;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const dark = (x + y) % 2 === 0;
        const v = dark ? 46 + rnd() * 14 : 150 + rnd() * 30;
        ctx.fillStyle = `rgb(${v},${v - 4},${v - 10})`;
        ctx.fillRect(x * t + 4, y * t + 4, t - 8, t - 8);
        // glaze highlight
        const g = ctx.createLinearGradient(x * t, y * t, x * t + t, y * t + t);
        g.addColorStop(0, "rgba(255,255,255,0.12)");
        g.addColorStop(0.5, "rgba(255,255,255,0)");
        g.addColorStop(1, "rgba(0,0,0,0.12)");
        ctx.fillStyle = g;
        ctx.fillRect(x * t + 4, y * t + 4, t - 8, t - 8);
        if (rnd() < 0.25) {
          cracks(ctx, t, 1, "rgba(0,0,0,0.5)", () => rnd(), 1);
        }
      }
    }
    blotches(ctx, s, 14, "rgba(20,14,8,0.45)", 90, rnd);
    blotches(ctx, s, 4, "rgba(90,20,10,0.25)", 60, rnd);
    noise(ctx, s, 12);
  });
}

export function tileNormal(): THREE.Texture {
  return normalFromHeight(
    "tileN",
    256,
    (ctx, s) => {
      ctx.fillStyle = "#404040";
      ctx.fillRect(0, 0, s, s);
      const t = s / 4;
      ctx.fillStyle = "#909090";
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) ctx.fillRect(x * t + 2, y * t + 2, t - 4, t - 4);
    },
    2.2,
  );
}

// ---------------------------------------------------------------- RUG
export function rugTex(): THREE.Texture {
  return make("rug", 512, (ctx, s) => {
    const rnd = seeded(17);
    ctx.fillStyle = "#4a1e1c";
    ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = "#8a6a3a";
    ctx.lineWidth = 10;
    ctx.strokeRect(18, 18, s - 36, s - 36);
    ctx.lineWidth = 3;
    ctx.strokeRect(40, 40, s - 80, s - 80);
    ctx.fillStyle = "rgba(150,110,60,0.5)";
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const x = s / 2 + Math.cos(a) * s * 0.28;
      const y = s / 2 + Math.sin(a) * s * 0.28;
      ctx.beginPath();
      ctx.ellipse(x, y, 20, 8, a, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(s / 2, s / 2, 46, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#4a1e1c";
    ctx.beginPath();
    ctx.arc(s / 2, s / 2, 30, 0, Math.PI * 2);
    ctx.fill();
    // thread texture
    for (let i = 0; i < 9000; i++) {
      ctx.fillStyle = `rgba(0,0,0,${rnd() * 0.18})`;
      ctx.fillRect(rnd() * s, rnd() * s, 1, 3);
    }
    blotches(ctx, s, 10, "rgba(10,5,3,0.5)", 100, rnd);
    noise(ctx, s, 16);
  });
}

// ---------------------------------------------------------------- DOORS
export function doorTex(): THREE.Texture {
  return make("door", 512, (ctx, s) => {
    const rnd = seeded(3);
    ctx.fillStyle = "#4a3423";
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 160; i++) {
      ctx.strokeStyle = `rgba(0,0,0,${0.04 + rnd() * 0.07})`;
      ctx.lineWidth = 0.6 + rnd() * 1.5;
      ctx.beginPath();
      const x = rnd() * s;
      ctx.moveTo(x, 0);
      ctx.lineTo(x + (rnd() - 0.5) * 20, s);
      ctx.stroke();
    }
    const panel = (x: number, y: number, w: number, h: number) => {
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = "rgba(255,220,180,0.06)";
      ctx.fillRect(x + 10, y + 10, w - 20, h - 20);
      ctx.strokeStyle = "rgba(0,0,0,0.7)";
      ctx.lineWidth = 5;
      ctx.strokeRect(x, y, w, h);
      ctx.strokeStyle = "rgba(255,230,200,0.12)";
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 10, y + 10, w - 20, h - 20);
    };
    panel(48, 40, s - 96, s * 0.34);
    panel(48, s * 0.5, s - 96, s * 0.4);
    // handle + plate
    ctx.fillStyle = "#7d6a2c";
    ctx.fillRect(s - 92, s * 0.47, 22, 70);
    ctx.fillStyle = "#c9ab52";
    ctx.beginPath();
    ctx.arc(s - 81, s * 0.52, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#111";
    ctx.beginPath();
    ctx.arc(s - 81, s * 0.57, 3, 0, Math.PI * 2);
    ctx.fill();
    blotches(ctx, s, 12, "rgba(10,6,3,0.5)", 80, rnd);
    noise(ctx, s, 16);
  });
}

export function doorNormal(): THREE.Texture {
  return normalFromHeight(
    "doorN",
    256,
    (ctx, s) => {
      ctx.fillStyle = "#808080";
      ctx.fillRect(0, 0, s, s);
      ctx.fillStyle = "#505050";
      ctx.fillRect(24, 20, s - 48, s * 0.34);
      ctx.fillRect(24, s * 0.5, s - 48, s * 0.4);
      ctx.fillStyle = "#707070";
      ctx.fillRect(30, 26, s - 60, s * 0.34 - 12);
      ctx.fillRect(30, s * 0.5 + 6, s - 60, s * 0.4 - 12);
    },
    3,
  );
}

export function exitDoorTex(): THREE.Texture {
  return make("exitdoor", 512, (ctx, s) => {
    const rnd = seeded(11);
    ctx.fillStyle = "#33241a";
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = `rgba(0,0,0,${0.25 + rnd() * 0.3})`;
      ctx.fillRect(i * (s / 5), 0, 4, s);
    }
    for (let i = 0; i < 200; i++) {
      ctx.strokeStyle = `rgba(0,0,0,${0.05 + rnd() * 0.08})`;
      ctx.beginPath();
      const x = rnd() * s;
      ctx.moveTo(x, 0);
      ctx.lineTo(x + (rnd() - 0.5) * 16, s);
      ctx.stroke();
    }
    // iron bands
    ctx.fillStyle = "#1a1c1f";
    ctx.fillRect(0, s * 0.18, s, 26);
    ctx.fillRect(0, s * 0.72, s, 26);
    ctx.fillStyle = "#4b4f55";
    for (let x = 20; x < s; x += 48) {
      ctx.beginPath();
      ctx.arc(x, s * 0.18 + 13, 5, 0, Math.PI * 2);
      ctx.arc(x, s * 0.72 + 13, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    // scratched text
    ctx.font = "bold 54px Impact, sans-serif";
    ctx.fillStyle = "rgba(120,20,12,0.7)";
    ctx.fillText("NIE WYJDZIESZ", 40, s / 2 + 16);
    blotches(ctx, s, 14, "rgba(60,10,6,0.35)", 70, rnd);
    noise(ctx, s, 18);
  });
}

// ---------------------------------------------------------------- FABRIC
export function fabricTex(color: string, key: string): THREE.Texture {
  return make("fab-" + key, 256, (ctx, s) => {
    const rnd = seeded(key.length * 13);
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y += 3) {
      ctx.fillStyle = `rgba(0,0,0,${0.05 + rnd() * 0.08})`;
      ctx.fillRect(0, y, s, 1);
    }
    for (let x = 0; x < s; x += 3) {
      ctx.fillStyle = `rgba(255,255,255,${0.02 + rnd() * 0.04})`;
      ctx.fillRect(x, 0, 1, s);
    }
    blotches(ctx, s, 8, "rgba(0,0,0,0.4)", 70, rnd);
    noise(ctx, s, 12);
  });
}

// ---------------------------------------------------------------- DECALS
export function bloodTex(seed = 1): THREE.Texture {
  return make("blood" + seed, 256, (ctx, s) => {
    const rnd = seeded(seed * 77);
    ctx.clearRect(0, 0, s, s);
    const cx = s / 2, cy = s / 2;
    for (let i = 0; i < 40; i++) {
      const a = rnd() * Math.PI * 2;
      const d = rnd() * rnd() * s * 0.45;
      const r = 3 + rnd() * rnd() * 40;
      const g = ctx.createRadialGradient(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 0, cx + Math.cos(a) * d, cy + Math.sin(a) * d, r);
      g.addColorStop(0, "rgba(70,4,4,0.95)");
      g.addColorStop(0.7, "rgba(60,3,3,0.8)");
      g.addColorStop(1, "rgba(50,2,2,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, r, 0, Math.PI * 2);
      ctx.fill();
    }
    // drag streaks
    ctx.strokeStyle = "rgba(60,3,3,0.6)";
    for (let i = 0; i < 6; i++) {
      ctx.lineWidth = 2 + rnd() * 6;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + (rnd() - 0.5) * s, cy + (rnd() - 0.5) * s);
      ctx.stroke();
    }
  });
}

export function cobwebTex(): THREE.Texture {
  return make("cobweb", 256, (ctx, s) => {
    const rnd = seeded(23);
    ctx.clearRect(0, 0, s, s);
    ctx.strokeStyle = "rgba(220,220,210,0.55)";
    ctx.lineWidth = 1;
    const spokes = 14;
    for (let i = 0; i < spokes; i++) {
      const a = (i / spokes) * (Math.PI / 2);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * s, Math.sin(a) * s);
      ctx.stroke();
    }
    for (let r = 20; r < s * 1.3; r += 16 + rnd() * 10) {
      ctx.beginPath();
      for (let i = 0; i <= spokes; i++) {
        const a = (i / spokes) * (Math.PI / 2);
        const rr = r * (0.9 + rnd() * 0.15);
        const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.quadraticCurveTo(Math.cos(a - 0.05) * rr * 0.93, Math.sin(a - 0.05) * rr * 0.93, x, y);
      }
      ctx.stroke();
    }
  });
}

/** Creepy old portrait. */
export function portraitTex(seed: number): THREE.Texture {
  return make("portrait" + seed, 256, (ctx, s) => {
    const rnd = seeded(seed * 131);
    const g = ctx.createRadialGradient(s / 2, s * 0.45, 20, s / 2, s / 2, s * 0.8);
    g.addColorStop(0, "#3a3024");
    g.addColorStop(1, "#0b0907");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
    // shoulders
    ctx.fillStyle = "#15120f";
    ctx.beginPath();
    ctx.ellipse(s / 2, s * 1.05, s * 0.5, s * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();
    // face
    const fx = s / 2 + (rnd() - 0.5) * 20, fy = s * 0.42;
    ctx.fillStyle = "#b9a58d";
    ctx.beginPath();
    ctx.ellipse(fx, fy, 42, 56, 0, 0, Math.PI * 2);
    ctx.fill();
    const shade = ctx.createRadialGradient(fx - 10, fy - 15, 10, fx, fy, 70);
    shade.addColorStop(0, "rgba(0,0,0,0)");
    shade.addColorStop(1, "rgba(0,0,0,0.75)");
    ctx.fillStyle = shade;
    ctx.beginPath();
    ctx.ellipse(fx, fy, 42, 56, 0, 0, Math.PI * 2);
    ctx.fill();
    // hair
    ctx.fillStyle = seed % 2 ? "#3a2f26" : "#cfc9bd";
    ctx.beginPath();
    ctx.ellipse(fx, fy - 40, 46, 26, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    // eyes (hollow)
    ctx.fillStyle = "#0a0806";
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(fx + sx * 16, fy - 6, 8, 5 + rnd() * 3, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(fx + sx * 16 + 1, fy - 6, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
    // mouth
    ctx.strokeStyle = "#3a1c18";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(fx - 12, fy + 26);
    ctx.quadraticCurveTo(fx, fy + 22 + rnd() * 8, fx + 12, fy + 26);
    ctx.stroke();
    // canvas cracks & grime
    cracks(ctx, s, 10, "rgba(0,0,0,0.5)", rnd, 0.8);
    blotches(ctx, s, 8, "rgba(0,0,0,0.5)", 60, rnd);
    noise(ctx, s, 18);
  });
}

export function windowTex(): THREE.Texture {
  return make("window", 256, (ctx, s) => {
    const rnd = seeded(41);
    const g = ctx.createLinearGradient(0, 0, 0, s);
    g.addColorStop(0, "#1c2a4a");
    g.addColorStop(1, "#0a1020");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
    // moon glow top-left
    const m = ctx.createRadialGradient(s * 0.3, s * 0.25, 4, s * 0.3, s * 0.25, s * 0.5);
    m.addColorStop(0, "rgba(220,230,255,0.9)");
    m.addColorStop(0.15, "rgba(160,180,230,0.35)");
    m.addColorStop(1, "rgba(100,120,180,0)");
    ctx.fillStyle = m;
    ctx.fillRect(0, 0, s, s);
    // tree silhouettes
    ctx.fillStyle = "#040608";
    for (let i = 0; i < 6; i++) {
      const x = rnd() * s;
      ctx.beginPath();
      ctx.moveTo(x - 20, s);
      ctx.lineTo(x, s * (0.4 + rnd() * 0.3));
      ctx.lineTo(x + 20, s);
      ctx.fill();
    }
    // grime / rain streaks
    for (let i = 0; i < 40; i++) {
      ctx.strokeStyle = `rgba(200,210,230,${0.03 + rnd() * 0.08})`;
      ctx.beginPath();
      const x = rnd() * s;
      ctx.moveTo(x, rnd() * s * 0.5);
      ctx.lineTo(x + (rnd() - 0.5) * 6, s);
      ctx.stroke();
    }
    blotches(ctx, s, 10, "rgba(30,30,25,0.5)", 50, rnd);
    // frame cross
    ctx.fillStyle = "#1a140d";
    ctx.fillRect(s / 2 - 7, 0, 14, s);
    ctx.fillRect(0, s / 2 - 7, s, 14);
    ctx.lineWidth = 18;
    ctx.strokeStyle = "#1a140d";
    ctx.strokeRect(0, 0, s, s);
  });
}

export function dustSprite(): THREE.Texture {
  return make("dust", 32, (ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.4, "rgba(255,255,255,0.45)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  });
}
