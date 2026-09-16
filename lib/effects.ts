import { STONES, STONE_BY_ID, type EffectId } from "./stones";

/**
 * Stone effects.
 *
 * Every effect still samples real text geometry — Range.getClientRects() gives
 * the line boxes of each text node, so particles land dense on glyphs and
 * sparse across empty card, and the words genuinely come apart. What changes
 * per stone is how they come apart: Power explodes, Space implodes, Time flies
 * out and rewinds, Soul drifts, Reality ripples, Mind cracks outward, and the
 * Gauntlet does all of it at once.
 *
 * Canvas 2D throughout. No WebGL, no library.
 */

export interface Particle {
  ox: number;
  oy: number;
  vx: number;
  vy: number;
  size: number;
  /** Fraction of the effect's duration to wait before moving. */
  delay: number;
  /** Fraction of the duration this particle is alive for. */
  life: number;
  wobble: number;
  r: number;
  g: number;
  b: number;
}

export interface Field {
  bounds: DOMRect;
  cx: number;
  cy: number;
  reach: number;
}

export interface Frame {
  x: number;
  y: number;
  alpha: number;
  size: number;
}

export interface Profile {
  duration: number;
  /** How dense the glyph sampling is, per px². */
  density: number;
  /** Colour for a particle, given the sampled text colour. */
  tint(base: [number, number, number], rand: number): [number, number, number];
  /** Sets vx, vy, delay and life for a freshly placed particle. */
  seed(p: Particle, f: Field, rand: () => number): void;
  /** Position, opacity and size at progress k (0..1) through the particle's life. */
  move(p: Particle, k: number, out: Frame): void;
  /** Rings, sweeps and flashes drawn over the particles. */
  flourish?(ctx: CanvasRenderingContext2D, t: number, f: Field): void;
}

const TAU = Math.PI * 2;

function angleFromCenter(p: Particle, f: Field) {
  return Math.atan2(p.oy - f.cy, p.ox - f.cx);
}

function distFromCenter(p: Particle, f: Field) {
  return Math.hypot(p.ox - f.cx, p.oy - f.cy) / f.reach;
}

/** Pull a colour toward a stone's colour without flattening it entirely. */
function toward(
  base: [number, number, number],
  target: [number, number, number],
  amount: number,
): [number, number, number] {
  return [
    base[0] + (target[0] - base[0]) * amount,
    base[1] + (target[1] - base[1]) * amount,
    base[2] + (target[2] - base[2]) * amount,
  ];
}

function ring(
  ctx: CanvasRenderingContext2D,
  f: Field,
  radius: number,
  width: number,
  rgb: [number, number, number],
  alpha: number,
) {
  if (alpha <= 0 || radius <= 0) return;
  ctx.beginPath();
  ctx.arc(f.cx, f.cy, radius, 0, TAU);
  ctx.lineWidth = width;
  ctx.strokeStyle = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
  ctx.stroke();
}

/** Eased 0→1→0, for a flourish that swells and fades. */
function pulse(t: number, start: number, span: number) {
  const k = (t - start) / span;
  if (k <= 0 || k >= 1) return 0;
  return Math.sin(k * Math.PI);
}

const POWER = STONE_BY_ID.power.rgb;
const SPACE = STONE_BY_ID.space.rgb;
const REALITY = STONE_BY_ID.reality.rgb;
const SOUL = STONE_BY_ID.soul.rgb;
const TIME = STONE_BY_ID.time.rgb;
const MIND = STONE_BY_ID.mind.rgb;

/**
 * Exported so the motion can be tested without a browser. Canvas animation is
 * driven by requestAnimationFrame, which does not run in a hidden tab, so the
 * only way to check that Space implodes and Time rewinds is to step the maths
 * directly.
 */
export const EFFECT_PROFILES: Record<EffectId, Profile> = {
  // Detonation. Everything leaves at once, hard, outward.
  power: {
    duration: 1150,
    density: 0.05,
    tint: (base, r) => toward(base, POWER, 0.4 + r * 0.5),
    seed(p, f, rand) {
      const a = angleFromCenter(p, f) + (rand() - 0.5) * 0.5;
      const speed = 150 + rand() * 320;
      p.vx = Math.cos(a) * speed;
      p.vy = Math.sin(a) * speed - 30;
      p.delay = distFromCenter(p, f) * 0.08 + rand() * 0.05;
      p.life = 0.45 + rand() * 0.4;
    },
    move(p, k, out) {
      const travel = 1 - Math.pow(1 - k, 2.6);
      out.x = p.ox + p.vx * travel;
      out.y = p.oy + p.vy * travel + 60 * k * k;
      out.alpha = Math.pow(1 - k, 1.7);
      out.size = p.size;
    },
    flourish(ctx, t, f) {
      for (let i = 0; i < 2; i++) {
        const a = pulse(t, i * 0.08, 0.45);
        ring(ctx, f, f.reach * (0.15 + (t - i * 0.08) * 1.9), 6 - i * 2, POWER, a * 0.5);
      }
    },
  },

  // Collapse. The card is pulled into a point and gone.
  space: {
    duration: 1050,
    density: 0.05,
    tint: (base, r) => toward(base, SPACE, 0.45 + r * 0.45),
    seed(p, f, rand) {
      p.vx = (f.cx - p.ox) * 1.05;
      p.vy = (f.cy - p.oy) * 1.05;
      // Outermost pixels are taken first, so the card folds inward.
      p.delay = (1 - distFromCenter(p, f)) * 0.22 + rand() * 0.05;
      p.life = 0.5 + rand() * 0.35;
    },
    move(p, k, out) {
      const travel = Math.pow(k, 1.5);
      const swirl = k * 1.1;
      const dx = p.vx * travel;
      const dy = p.vy * travel;
      // Rotate the inbound vector slightly so it spirals rather than falls flat.
      out.x = p.ox + dx * Math.cos(swirl) - dy * Math.sin(swirl) * 0.35;
      out.y = p.oy + dy * Math.cos(swirl) + dx * Math.sin(swirl) * 0.35;
      out.alpha = 1 - Math.pow(k, 2.6);
      out.size = p.size * (1 - k * 0.55);
    },
    flourish(ctx, t, f) {
      const a = pulse(t, 0, 0.75);
      ring(ctx, f, f.reach * 0.95 * (1 - t * 0.9), 3, SPACE, a * 0.65);
      ring(ctx, f, f.reach * 0.55 * (1 - t * 0.8), 2, SPACE, a * 0.4);
    },
  },

  // A wave passes through and the card is something else behind it.
  reality: {
    duration: 1250,
    density: 0.055,
    tint: (base, r) => toward(base, REALITY, 0.35 + r * 0.5),
    seed(p, f, rand) {
      p.vx = 30 + rand() * 70;
      p.vy = (rand() - 0.5) * 60;
      // Sweeps left to right across the card.
      p.delay = ((p.ox - f.bounds.left) / Math.max(f.bounds.width, 1)) * 0.4;
      p.life = 0.5 + rand() * 0.4;
    },
    move(p, k, out) {
      const travel = 1 - Math.pow(1 - k, 2);
      out.x = p.ox + p.vx * travel + Math.sin(k * 7 + p.oy * 0.05) * 26 * k;
      out.y = p.oy + p.vy * travel + Math.cos(k * 5 + p.ox * 0.04) * 18 * k;
      out.alpha = Math.pow(1 - k, 1.5);
      out.size = p.size * (1 + k * 0.5);
    },
    flourish(ctx, t, f) {
      const x = f.bounds.left + f.bounds.width * (t * 1.5);
      const a = pulse(t, 0, 0.7) * 0.5;
      if (a <= 0) return;
      const grad = ctx.createLinearGradient(x - 60, 0, x + 60, 0);
      grad.addColorStop(0, "rgba(244, 63, 94, 0)");
      grad.addColorStop(0.5, `rgba(244, 63, 94, ${a})`);
      grad.addColorStop(1, "rgba(244, 63, 94, 0)");
      ctx.fillStyle = grad;
      ctx.fillRect(x - 60, f.bounds.top - 20, 120, f.bounds.height + 40);
    },
  },

  // No violence. Everything simply rises and is elsewhere.
  soul: {
    duration: 1700,
    density: 0.045,
    tint: (base, r) => toward(base, SOUL, 0.4 + r * 0.4),
    seed(p, f, rand) {
      p.vx = (rand() - 0.5) * 50;
      p.vy = -(40 + rand() * 90);
      p.delay = rand() * 0.35;
      p.life = 0.55 + rand() * 0.45;
    },
    move(p, k, out) {
      out.x = p.ox + p.vx * k + Math.sin(p.wobble + k * 3.5) * 12;
      out.y = p.oy + p.vy * k;
      // Wisps brighten before they go, rather than only fading.
      out.alpha = Math.sin(k * Math.PI) * 0.95;
      out.size = p.size;
    },
    flourish(ctx, t, f) {
      const a = pulse(t, 0, 1) * 0.28;
      if (a <= 0) return;
      const r = f.reach * (0.3 + t * 0.9);
      const grad = ctx.createRadialGradient(f.cx, f.cy, 0, f.cx, f.cy, r);
      grad.addColorStop(0, `rgba(249, 115, 98, ${a})`);
      grad.addColorStop(1, "rgba(249, 115, 98, 0)");
      ctx.fillStyle = grad;
      ctx.fillRect(f.cx - r, f.cy - r, r * 2, r * 2);
    },
  },

  // Out, then back. The card un-happens.
  time: {
    duration: 1400,
    density: 0.05,
    tint: (base, r) => toward(base, TIME, 0.4 + r * 0.45),
    seed(p, f, rand) {
      const a = angleFromCenter(p, f) + (rand() - 0.5) * 0.8;
      const speed = 70 + rand() * 150;
      p.vx = Math.cos(a) * speed;
      p.vy = Math.sin(a) * speed;
      p.delay = rand() * 0.12;
      p.life = 0.7 + rand() * 0.3;
    },
    move(p, k, out) {
      // Travel peaks at the midpoint and returns to zero: a rewind.
      const travel = Math.sin(k * Math.PI);
      const spin = k * 0.9;
      const dx = p.vx * travel;
      const dy = p.vy * travel;
      out.x = p.ox + dx * Math.cos(spin) - dy * Math.sin(spin);
      out.y = p.oy + dx * Math.sin(spin) + dy * Math.cos(spin);
      out.alpha = Math.sin(k * Math.PI) * 0.9;
      out.size = p.size;
    },
    flourish(ctx, t, f) {
      for (let i = 0; i < 3; i++) {
        const a = pulse(t, i * 0.12, 0.5);
        ring(ctx, f, f.reach * (0.2 + (t - i * 0.12) * 1.4), 2, TIME, a * 0.45);
      }
      // One ring running the other way, closing as the rest open.
      ring(ctx, f, f.reach * (1 - t) * 0.8, 3, TIME, pulse(t, 0.3, 0.6) * 0.5);
    },
  },

  // A flash of certainty, then splinters.
  mind: {
    duration: 1000,
    density: 0.055,
    tint: (base, r) => toward(base, MIND, 0.4 + r * 0.5),
    seed(p, f, rand) {
      const a = angleFromCenter(p, f) + (rand() - 0.5) * 1.2;
      const speed = 110 + rand() * 240;
      p.vx = Math.cos(a) * speed;
      p.vy = Math.sin(a) * speed;
      p.delay = distFromCenter(p, f) * 0.1 + rand() * 0.08;
      p.life = 0.4 + rand() * 0.35;
    },
    move(p, k, out) {
      const travel = 1 - Math.pow(1 - k, 3);
      out.x = p.ox + p.vx * travel + Math.sin(p.wobble + k * 20) * 6;
      out.y = p.oy + p.vy * travel;
      out.alpha = Math.pow(1 - k, 2);
      out.size = p.size;
    },
    flourish(ctx, t, f) {
      const a = pulse(t, 0, 0.35);
      ring(ctx, f, f.reach * (0.1 + t * 2.2), 5, MIND, a * 0.55);
    },
  },

  // All six. Kept closest to the film's dust, because this is the snap.
  gauntlet: {
    duration: 1900,
    density: 0.06,
    tint: (base, r) => {
      const stone = STONES[Math.floor(r * STONES.length) % STONES.length];
      return toward(base, stone.rgb, 0.55);
    },
    seed(p, f, rand) {
      p.vx = 20 + rand() * 60;
      p.vy = -(25 + rand() * 70);
      // Releases from the bottom-left corner first, the way the films stage it.
      const spread =
        Math.hypot(p.ox - f.bounds.left, f.bounds.bottom - p.oy) / f.reach;
      p.delay = spread * 0.4 + rand() * 0.14;
      p.life = 0.55 + rand() * 0.45;
    },
    move(p, k, out) {
      const travel = 1 - Math.pow(1 - k, 2.2);
      out.x = p.ox + p.vx * travel + Math.sin(p.wobble + k * 7) * 6;
      out.y = p.oy + p.vy * travel - 30 * k * k;
      out.alpha = Math.pow(1 - k, 2) * 0.95;
      out.size = p.size;
    },
    flourish(ctx, t, f) {
      // Six rings, one per stone, staggered.
      STONES.forEach((stone, i) => {
        const a = pulse(t, i * 0.05, 0.5);
        ring(
          ctx,
          f,
          f.reach * (0.1 + (t - i * 0.05) * 1.7),
          3,
          stone.rgb,
          a * 0.45,
        );
      });
      const flash = pulse(t, 0, 0.18);
      if (flash > 0) {
        const r = f.reach * 1.2;
        const grad = ctx.createRadialGradient(f.cx, f.cy, 0, f.cx, f.cy, r);
        grad.addColorStop(0, `rgba(255, 245, 214, ${flash * 0.45})`);
        grad.addColorStop(1, "rgba(255, 245, 214, 0)");
        ctx.fillStyle = grad;
        ctx.fillRect(f.cx - r, f.cy - r, r * 2, r * 2);
      }
    },
  },
};

// --------------------------------------------------------------- sampling --

interface Sample {
  rect: DOMRect;
  rgb: [number, number, number];
}

function parseRgb(color: string): [number, number, number] {
  const m = color.match(/-?[\d.]+/g);
  if (!m) return [232, 226, 242];
  return [Number(m[0]), Number(m[1]), Number(m[2])];
}

function textSamples(el: HTMLElement): Sample[] {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const out: Sample[] = [];
  let node: Node | null;
  while ((node = walker.nextNode())) {
    if (!node.nodeValue?.trim()) continue;
    const parent = node.parentElement;
    if (!parent) continue;
    const style = getComputedStyle(parent);
    if (style.visibility === "hidden" || style.opacity === "0") continue;
    const rgb = parseRgb(style.color);
    const range = document.createRange();
    range.selectNodeContents(node);
    for (const rect of Array.from(range.getClientRects())) {
      if (rect.width < 1 || rect.height < 1) continue;
      out.push({ rect: rect as DOMRect, rgb });
    }
  }
  return out;
}

// ------------------------------------------------------------------ field --

const MAX_PARTICLES = 4200;
const FIELD_DENSITY = 0.0016;

interface Burst {
  profile: Profile;
  particles: Particle[];
  field: Field;
  start: number;
}

/**
 * Bursts are kept separate rather than pooled into one array, because each
 * carries its own profile and duration — a Soul drift lasts almost twice as
 * long as a Mind splinter, and they must be able to overlap.
 */
export class StoneField {
  private ctx: CanvasRenderingContext2D;
  private bursts: Burst[] = [];
  private raf = 0;
  private dpr = 1;
  private scratch: Frame = { x: 0, y: 0, alpha: 0, size: 0 };
  /** Last known good viewport, in CSS pixels. */
  private w = 0;
  private h = 0;

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) throw new Error("2d context unavailable");
    this.ctx = ctx;
    this.resize();
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;

    // A viewport that reports zero — a backgrounded tab being restored, a
    // collapsed pane, a hidden iframe — would leave a 0x0 canvas that never
    // recovers, because the resize event that would fix it has already fired.
    // Keeping the last good size means the next emit still has somewhere to draw.
    if (w < 1 || h < 1) return;

    this.w = w;
    this.h = h;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.floor(w * this.dpr);
    this.canvas.height = Math.floor(h * this.dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.bursts = [];
  }

  /** Turn an element's rendered pixels into the given stone's effect. */
  emit(el: HTMLElement, effect: EffectId) {
    // The viewport can change without a resize event ever reaching us, so the
    // canvas is reconciled here rather than trusted.
    if (window.innerWidth !== this.w || window.innerHeight !== this.h) {
      this.resize();
    }
    if (this.w < 1 || this.h < 1) return;

    const bounds = el.getBoundingClientRect();
    if (bounds.width < 2 || bounds.height < 2) return;

    const profile = EFFECT_PROFILES[effect] ?? EFFECT_PROFILES.power;
    const field: Field = {
      bounds,
      cx: bounds.left + bounds.width / 2,
      cy: bounds.top + bounds.height / 2,
      reach: Math.hypot(bounds.width, bounds.height) / 2 || 1,
    };

    const particles: Particle[] = [];
    const rand = Math.random;

    const push = (
      x: number,
      y: number,
      base: [number, number, number],
      size: number,
    ) => {
      const [r, g, b] = profile.tint(base, rand());
      const p: Particle = {
        ox: x,
        oy: y,
        vx: 0,
        vy: 0,
        size,
        delay: 0,
        life: 1,
        wobble: rand() * TAU,
        r,
        g,
        b,
      };
      profile.seed(p, field, rand);
      particles.push(p);
    };

    for (const { rect, rgb } of textSamples(el)) {
      const n = Math.min(900, Math.ceil(rect.width * rect.height * profile.density));
      for (let i = 0; i < n; i++) {
        push(
          rect.left + rand() * rect.width,
          rect.top + rand() * rect.height,
          rgb,
          0.7 + rand() * 1.5,
        );
      }
    }

    const fieldCount = Math.min(
      1200,
      Math.ceil(bounds.width * bounds.height * FIELD_DENSITY),
    );
    const ambient: [number, number, number] =
      effect === "gauntlet" ? [232, 226, 242] : STONE_BY_ID[effect].rgb;
    for (let i = 0; i < fieldCount; i++) {
      push(
        bounds.left + rand() * bounds.width,
        bounds.top + rand() * bounds.height,
        ambient,
        0.6 + rand() * 1.1,
      );
    }

    this.bursts.push({
      profile,
      particles: particles.slice(0, MAX_PARTICLES),
      field,
      start: performance.now(),
    });
    // Two overlapping bursts is already generous; more is just cost.
    if (this.bursts.length > 2) this.bursts.shift();

    if (!this.raf) this.raf = requestAnimationFrame(this.tick);
  }

  private tick = (now: number) => {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.w, this.h);

    const live: Burst[] = [];

    for (const burst of this.bursts) {
      const t = (now - burst.start) / burst.profile.duration;
      if (t >= 1.35) continue;
      live.push(burst);

      ctx.globalCompositeOperation = "lighter";
      if (t < 1) burst.profile.flourish?.(ctx, t, burst.field);

      for (const p of burst.particles) {
        const k = (t - p.delay) / p.life;
        if (k <= 0 || k >= 1) continue;
        burst.profile.move(p, k, this.scratch);
        if (this.scratch.alpha <= 0.01) continue;
        ctx.fillStyle = `rgba(${p.r | 0}, ${p.g | 0}, ${p.b | 0}, ${this.scratch.alpha})`;
        ctx.fillRect(
          this.scratch.x,
          this.scratch.y,
          this.scratch.size,
          this.scratch.size,
        );
      }
      ctx.globalCompositeOperation = "source-over";
    }

    this.bursts = live;

    if (live.length > 0) {
      this.raf = requestAnimationFrame(this.tick);
    } else {
      this.raf = 0;
      ctx.clearRect(0, 0, this.w, this.h);
    }
  };
}

export function effectDuration(effect: EffectId): number {
  return (EFFECT_PROFILES[effect] ?? EFFECT_PROFILES.power).duration;
}
