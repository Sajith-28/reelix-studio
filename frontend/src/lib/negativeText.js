/**
 * REELIX — Negative Text (difference-blend) shared core
 *
 * Pure module: no DOM access at import time, so the Node parity test and the
 * browser preview run the exact same code. `backend/services/negative_text.py`
 * mirrors every function here 1:1 — keep the two in sync.
 *
 * Canonical compositing formula (per pixel, per channel):
 *     out = base * (1 - a) + (1 - base) * a       a = mask coverage 0..1
 *
 * Layer order inside `compositeLayers`:
 *     1. pill (caption card background, normal blend)
 *     2. shadow / glow (normal blend, masked OUT of the glyphs)
 *     3. white (normal-blend glyphs: highlight variant, flip-invert pre-beat)
 *     4. negative (the inversion, optional contrast curve)
 *     5. stroke ring (normal blend, ring = stroke * (1 - fill))
 */

export const NEGATIVE_VARIANTS = [
  { id: 'negative-text', label: 'Negative Text', hint: 'Glyphs show the inverted video' },
  { id: 'negative-box', label: 'Negative Box', hint: 'Inverted rounded box, text knocked out to the video' },
  { id: 'negative-highlight', label: 'Negative Highlight', hint: 'White captions, only the spoken word inverts' },
  { id: 'negative-sweep', label: 'Negative Sweep', hint: 'An inversion band sweeps across, flipping letters as it passes' },
];

export const NEGATIVE_PRESETS = [
  { id: 'stagger-rise', label: 'Stagger Rise', unit: 'char', hint: 'Characters rise 40% and un-clip, 25–40ms apart' },
  { id: 'mask-wipe', label: 'Mask Wipe', unit: 'block', hint: 'Horizontal clip wipe, left → right' },
  { id: 'scale-pop', label: 'Scale Pop', unit: 'word', hint: 'Words pop 0.6 → 1.08 → 1.0' },
  { id: 'typewriter', label: 'Typewriter', unit: 'char', hint: 'Hard-cut character reveal with cursor' },
  { id: 'blur-in', label: 'Blur In', unit: 'block', hint: 'Mask blurs 12px → 0 while scaling 1.1 → 1' },
  { id: 'flip-invert', label: 'Flip Invert', unit: 'block', hint: 'Solid white, then snaps to negative on the beat' },
  { id: 'glitch', label: 'Glitch', unit: 'block', hint: '4 frames of RGB split + slice offsets, then settle' },
  { id: 'split-word', label: 'Split Word', unit: 'word', hint: 'Words slide in from alternating sides' },
  { id: 'none', label: 'None', unit: 'block', hint: 'Instant cut' },
];

export const NEGATIVE_FALLBACKS = [
  { id: 'stroke', label: 'Stroke', hint: 'Thin dark outline + soft shadow fades in over mid-gray footage' },
  { id: 'contrast-boost', label: 'Contrast Boost', hint: 'Contrast curve applied to the inverted pixels only' },
  { id: 'none', label: 'None', hint: 'No safeguard' },
];

export const NEGATIVE_EASINGS = ['auto', 'easeOutCubic', 'easeInOutCubic', 'easeOutQuint', 'easeOutExpo', 'easeOutBack', 'linear'];

/** Every param the negative renderer reads, with its default. */
export const NEGATIVE_DEFAULTS = {
  renderer: 'negative',
  variant: 'negative-text',
  inPreset: 'stagger-rise',
  outPreset: 'mask-wipe',
  inDuration: 0.36,        // seconds
  outDuration: 0.28,       // seconds
  holdDuration: 0,         // seconds, 0 = hold until the caption ends
  stagger: 30,             // ms between units (chars / words)
  easing: 'auto',          // 'auto' = each preset's own curve
  startTime: 0,            // seconds added to the caption start
  opacityFade: false,      // opt-in: also fade the mask (passes through 50% gray)
  lowContrastFallback: 'stroke',
  typewriterCursor: true,
  maxWidthPct: 85,         // auto-fit: widest line ≤ this % of frame width (same box as every template)
  luminanceEveryN: 3,      // sample readability every N frames
};

// Mid-gray band where |video − inverted| collapses: full fallback at 0.5,
// zero at 0.5 ± LOW_CONTRAST_HALFWIDTH.
export const LOW_CONTRAST_CENTRE = 0.5;
export const LOW_CONTRAST_HALFWIDTH = 0.12;
export const LUMINANCE_SMOOTHING = 0.35; // EMA weight of the newest sample
export const GLITCH_FRAMES = 4;
export const FLASH_FRAMES = 2;
export const GLITCH_SLICES = 6;
// Each character / word animates for this share of its phase; the stagger
// spreads the starts across the remainder. Longer = smoother overlap.
export const UNIT_SPAN = 0.62;
// Wipe edges are feathered over this fraction of the em so a clip travelling
// 40–60 px per frame reads as motion instead of a stepping hard edge.
export const WIPE_FEATHER_EM = 0.12;

// ─────────────────────────────── Easing ───────────────────────────────

export const easings = {
  linear: (t) => t,
  easeOutCubic: (t) => 1 - Math.pow(1 - t, 3),
  easeInOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  easeOutQuint: (t) => 1 - Math.pow(1 - t, 5),
  easeOutExpo: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  easeOutBack: (t) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  easeInOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
};

export function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function ease(name, t, fallback) {
  const fn = (name && name !== 'auto' && easings[name]) || easings[fallback] || easings.easeOutCubic;
  return fn(clamp01(t));
}

/** Deterministic 0..1 hash so glitch offsets match frame-for-frame on both sides. */
export function hash01(a, b) {
  let h = (Math.imul(a + 1, 374761393) + Math.imul(b + 1, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) | 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}

// ─────────────────────────── Geometry helpers ───────────────────────────

/** Preview-px → video-px factor used by every existing template (export parity). */
export function refScale(videoW, videoH) {
  return videoH >= videoW ? videoH / 520 : videoW / 640;
}

/** Resolves style + optional per-caption overrides into a full param set. */
export function resolveNegativeParams(style, caption) {
  const merged = { ...NEGATIVE_DEFAULTS, ...(style || {}) };
  const overrides = caption && caption.negativeOverrides;
  if (overrides && typeof overrides === 'object') Object.assign(merged, overrides);
  return merged;
}

/**
 * Frame window of one caption for the negative layer.
 * Returns { startFrame, endFrame, inFrames, outFrames, staggerFrames } with
 * in/out scaled down proportionally when the caption is too short for both.
 */
export function layerTiming(caption, params, fps) {
  const start = (Number(caption.start) || 0) + (Number(params.startTime) || 0);
  let end = Number(caption.end) || start;
  const inD = Math.max(0, Number(params.inDuration) || 0);
  const outD = Math.max(0, Number(params.outDuration) || 0);
  const hold = Math.max(0, Number(params.holdDuration) || 0);
  if (hold > 0) end = Math.min(end, start + inD + hold + outD);

  const startFrame = Math.round(start * fps);
  const endFrame = Math.max(startFrame + 1, Math.round(end * fps));
  const length = endFrame - startFrame;

  let inFrames = Math.round(inD * fps);
  let outFrames = Math.round(outD * fps);
  if (inFrames + outFrames > length) {
    const total = inFrames + outFrames;
    inFrames = Math.round((inFrames * length) / total);
    outFrames = length - inFrames;
  }
  const staggerFrames = Math.max(0, (Number(params.stagger) || 0) / 1000) * fps;
  return { startFrame, endFrame, inFrames, outFrames, staggerFrames };
}

/**
 * Progress 0..1 of unit `i` of `n`, `f` frames into a phase of `total` frames.
 * Each unit animates for 55% of the phase; the stagger is compressed when
 * needed so the last unit still lands exactly on the phase's final frame.
 */
export function unitProgress(f, total, stagger, i, n) {
  if (total <= 0) return 1;
  const per = n <= 1 ? total : Math.max(2, Math.min(total, Math.round(total * UNIT_SPAN)));
  const s = n > 1 ? Math.min(stagger, (total - per) / (n - 1)) : 0;
  return clamp01((f - i * s) / per);
}

function presetUnit(presetId) {
  const p = NEGATIVE_PRESETS.find((x) => x.id === presetId);
  return p ? p.unit : 'block';
}

/**
 * Animation state for one frame. Everything is derived from integer frame
 * indices so the preview and the export land on identical geometry.
 *
 * @param frame       absolute frame index
 * @param timing      from layerTiming()
 * @param params      from resolveNegativeParams()
 * @param counts      { chars, words }
 * @param fontPx      font size in video px (for 40% rise etc.)
 * @param blockW      caption block width in video px
 * @param scale       refScale() — converts design px to video px
 */
export function animState(frame, timing, params, counts, fontPx, blockW, scale) {
  const { startFrame, endFrame, inFrames, outFrames, staggerFrames } = timing;
  const f = frame - startFrame;
  const length = endFrame - startFrame;
  const state = {
    phase: 'hidden',
    preset: 'none',
    dir: 'in',
    unit: 'block',
    progress: 1,
    units: [],
    block: { clipX: null, clipFeather: null, blur: 0, scale: 1, mode: 'negative', flash: false, slices: null, rgbSplit: 0, cursor: -1, opacity: 1 },
  };
  if (f < 0 || f >= length) return state;

  let dir = 'hold';
  let preset = 'none';
  let phaseFrames = 0;
  let pf = 0;
  if (f < inFrames) {
    dir = 'in';
    preset = params.inPreset || 'none';
    phaseFrames = inFrames;
    pf = f;
  } else if (f >= length - outFrames) {
    dir = 'out';
    preset = params.outPreset || 'none';
    phaseFrames = outFrames;
    pf = length - 1 - f; // counts down to 0 on the last frame
  }
  state.phase = dir;
  state.dir = dir;
  state.preset = preset;
  const unit = presetUnit(preset);
  state.unit = unit;

  const n = unit === 'char' ? counts.chars : unit === 'word' ? counts.words : 1;
  const easingName = params.easing;
  const stagger = unit === 'block' ? 0 : staggerFrames;
  const blockT = dir === 'hold' ? 1 : unitProgress(pf, phaseFrames, 0, 0, 1);
  state.progress = blockT;

  const units = new Array(Math.max(1, n));
  for (let i = 0; i < units.length; i++) {
    const t = dir === 'hold' ? 1 : unitProgress(pf, phaseFrames, stagger, i, units.length);
    units[i] = { t, tx: 0, ty: 0, scale: 1, visible: true, lineClip: false };
  }
  state.units = units;
  const block = state.block;
  if (params.opacityFade && dir !== 'hold') block.opacity = ease('linear', blockT);

  // The 2-frame flash on the IN beat lives in the first two frames after IN.
  if (params.inPreset === 'flip-invert' && f >= inFrames && f < inFrames + FLASH_FRAMES && dir !== 'out') {
    block.mode = 'flash';
    block.flash = true;
    state.phase = 'in';
  }

  if (dir === 'hold' || preset === 'none') return state;

  switch (preset) {
    case 'stagger-rise':
      for (const u of units) {
        const e = ease(easingName, u.t, 'easeOutCubic');
        u.ty = (1 - e) * 0.4 * fontPx;
        u.lineClip = true;
      }
      break;
    case 'mask-wipe': {
      const e = ease(easingName, blockT, 'easeInOutCubic');
      // IN reveals L→R; OUT exits L→R (the left edge advances). Only the
      // moving edge is feathered.
      block.clipX = dir === 'in' ? [0, e] : [1 - e, 1];
      block.clipFeather = dir === 'in' ? 'right' : 'left';
      break;
    }
    case 'scale-pop':
      for (const u of units) {
        const t = u.t;
        if (t < 0.7) u.scale = 0.6 + 0.48 * easings.easeOutCubic(t / 0.7);
        else u.scale = 1.08 - 0.08 * easings.easeInOutSine((t - 0.7) / 0.3);
        if (t <= 0) u.visible = false;
      }
      break;
    case 'typewriter': {
      let last = -1;
      for (let i = 0; i < units.length; i++) {
        units[i].visible = units[i].t > 0;
        if (units[i].visible) last = i;
      }
      if (params.typewriterCursor !== false && dir === 'in') {
        // Cursor blinks at 4Hz on the frame clock; hidden once the reveal ends.
        const fpsGuess = Math.max(1, phaseFrames);
        const on = Math.floor((pf / fpsGuess) * 8) % 2 === 0;
        block.cursor = on ? last : -1;
      }
      break;
    }
    case 'blur-in': {
      const e = ease(easingName, blockT, 'easeOutCubic');
      block.blur = 12 * (1 - e) * scale * 0.5;
      block.scale = 1.1 - 0.1 * e;
      break;
    }
    case 'flip-invert':
      if (dir === 'in') {
        block.mode = 'white';
      } else {
        // OUT is the mirror: negative → 2-frame flash → white → gone.
        block.mode = pf < FLASH_FRAMES ? 'flash' : 'white';
        if (pf < FLASH_FRAMES) block.flash = true;
      }
      break;
    case 'glitch': {
      const active = pf < GLITCH_FRAMES;
      if (active) {
        const seed = dir === 'in' ? pf : 1000 + pf;
        const amp = 0.06 * blockW;
        block.slices = [];
        for (let k = 0; k < GLITCH_SLICES; k++) {
          block.slices.push(Math.round((hash01(seed, k) * 2 - 1) * amp));
        }
        block.rgbSplit = Math.round((0.6 + 0.4 * hash01(seed, 99)) * 0.02 * blockW);
      }
      break;
    }
    case 'split-word':
      for (let i = 0; i < units.length; i++) {
        const u = units[i];
        const e = ease(easingName, u.t, 'easeOutCubic');
        u.tx = (i % 2 === 0 ? -1 : 1) * (1 - e) * 0.5 * blockW;
      }
      block.clipX = [-0.08, 1.08];
      block.clipFeather = 'both';
      break;
    default:
      break;
  }
  return state;
}

/** Sweep band position for the `negative-sweep` variant, in block-width fractions. */
export function sweepBand(frame, timing, params) {
  const { startFrame, endFrame, inFrames } = timing;
  const f = frame - startFrame;
  if (f < 0 || f >= endFrame - startFrame) return null;
  const bandW = 0.16;
  if (inFrames <= 0 || f >= inFrames) return { left: 1 + bandW, right: 1 + bandW, done: true };
  const e = ease(params.easing, unitProgress(f, inFrames, 0, 0, 1), 'easeInOutCubic');
  const right = -bandW + e * (1 + 2 * bandW);
  return { left: right - bandW, right, done: false };
}

// ────────────────────────────── Layout ──────────────────────────────

/**
 * Lays out a caption in video pixels. `measure(text, fontPx)` must return the
 * advance width of `text`; `metrics(fontPx)` → { ascent, descent }. Char x
 * positions come from prefix widths so kerning is preserved on both engines.
 */
export function layoutCaption(words, style, videoW, videoH, measure, metrics) {
  const scale = refScale(videoW, videoH);
  const perLine = Math.max(1, Number(style.maxWordsPerLine) || 3);
  const lineHeightMult = Number(style.lineHeight) || 1.05;
  const spacingDesign = Number(style.letterSpacing) || 0;
  const maxW = (Number(style.maxWidthPct ?? NEGATIVE_DEFAULTS.maxWidthPct) / 100) * videoW;

  let fontPx = Math.max(12, Math.round((Number(style.fontSize) || 42) * scale));
  let result = null;

  for (let iter = 0; iter < 4; iter++) {
    const spacing = spacingDesign * scale * (fontPx / ((Number(style.fontSize) || 42) * scale));
    const { ascent, descent } = metrics(fontPx);
    const lineStep = lineHeightMult * fontPx;
    const halfLeading = (lineStep - (ascent + descent)) / 2;
    // Word gap: never narrower than 0.28em so a popped karaoke word keeps clear of its neighbours.
    const spaceW = Math.max(measure(' ', fontPx), 0.28 * fontPx) + spacing;

    const lines = [];
    let globalWord = 0;
    let globalChar = 0;
    for (let li = 0; li * perLine < words.length; li++) {
      const row = words.slice(li * perLine, li * perLine + perLine);
      const lineWords = [];
      let x = 0;
      for (const w of row) {
        const text = w.text;
        const chars = [];
        let prefix = '';
        let cx = 0;
        for (const ch of Array.from(text)) {
          const before = prefix ? measure(prefix, fontPx) : 0;
          prefix += ch;
          const after = measure(prefix, fontPx);
          const adv = after - before + spacing;
          chars.push({ ch, x: cx, width: adv, index: globalChar++ });
          cx += adv;
        }
        const width = cx;
        lineWords.push({ text, x, width, chars, index: globalWord++, start: w.start, end: w.end });
        x += width + spaceW;
      }
      const width = Math.max(0, x - spaceW);
      lines.push({ words: lineWords, width, top: li * lineStep, baseline: li * lineStep + halfLeading + ascent, height: lineStep });
    }

    const blockW = Math.max(1, ...lines.map((l) => l.width));
    const blockH = lineStep * Math.max(1, lines.length);
    // Centre each line inside the block.
    for (const l of lines) {
      const shift = (blockW - l.width) / 2;
      for (const w of l.words) w.x += shift;
    }
    result = { fontPx, scale, spacing, ascent, descent, lineStep, halfLeading, lines, blockW, blockH, chars: globalChar, wordCount: globalWord };
    if (blockW <= maxW || fontPx <= 12) break;
    fontPx = Math.max(12, Math.floor(fontPx * (maxW / blockW)));
  }
  return result;
}

// ───────────────────────── Readability safeguard ─────────────────────────

/** Mask-weighted mean luminance (0..1) of an RGB(A) region. */
export function maskedLuminance(rgb, stride, mask, count) {
  let num = 0;
  let den = 0;
  for (let i = 0; i < count; i++) {
    const a = mask[i];
    if (a === 0) continue;
    const o = i * stride;
    const y = 0.2126 * rgb[o] + 0.7152 * rgb[o + 1] + 0.0722 * rgb[o + 2];
    num += y * a;
    den += a;
  }
  return den > 0 ? num / den / 255 : 0.5;
}

/** 0 (fine) … 1 (mid-gray, negative ≈ original). */
export function lowContrastScore(luma) {
  const d = Math.abs(luma - LOW_CONTRAST_CENTRE);
  return clamp01(1 - d / LOW_CONTRAST_HALFWIDTH);
}

export function smoothLuminance(prev, sample) {
  if (prev == null || Number.isNaN(prev)) return sample;
  return prev + (sample - prev) * LUMINANCE_SMOOTHING;
}

// ─────────────────────────── Mask utilities ───────────────────────────

/** Horizontally shifted copy of an 8-bit mask (positive dx moves right). */
export function shiftMask(mask, w, h, dx) {
  if (!dx) return mask;
  const out = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    const x0 = Math.max(0, dx);
    const x1 = Math.min(w, w + dx);
    for (let x = x0; x < x1; x++) out[row + x] = mask[row + x - dx];
  }
  return out;
}

/** Applies glitch slice offsets: band k of the mask shifted by slices[k]. */
export function sliceMask(mask, w, h, slices) {
  if (!slices || !slices.length) return mask;
  const out = new Uint8ClampedArray(w * h);
  const bandH = Math.ceil(h / slices.length);
  for (let k = 0; k < slices.length; k++) {
    const dx = slices[k];
    const y0 = k * bandH;
    const y1 = Math.min(h, y0 + bandH);
    for (let y = y0; y < y1; y++) {
      const row = y * w;
      const xs = Math.max(0, dx);
      const xe = Math.min(w, w + dx);
      for (let x = xs; x < xe; x++) out[row + x] = mask[row + x - dx];
    }
  }
  return out;
}

/**
 * Clears mask columns outside [x0, x1) — the clip-path wipe. With a feather,
 * coverage ramps linearly over `featherL` px inside the left edge and
 * `featherR` px inside the right edge (pixel centres at x + 0.5).
 */
export function clipMaskX(mask, w, h, x0, x1, featherL = 0, featherR = 0) {
  const out = new Uint8ClampedArray(w * h);
  if (featherL <= 0 && featherR <= 0) {
    const a = Math.max(0, Math.round(x0));
    const b = Math.min(w, Math.round(x1));
    if (b <= a) return out;
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = a; x < b; x++) out[row + x] = mask[row + x];
    }
    return out;
  }
  const weight = new Float64Array(w);
  let xs = w;
  let xe = 0;
  for (let x = 0; x < w; x++) {
    const c = x + 0.5;
    const wl = featherL > 0 ? clamp01((c - x0) / featherL) : c >= x0 ? 1 : 0;
    const wr = featherR > 0 ? clamp01((x1 - c) / featherR) : c < x1 ? 1 : 0;
    weight[x] = wl * wr;
    if (weight[x] > 0) {
      if (x < xs) xs = x;
      xe = x + 1;
    }
  }
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = xs; x < xe; x++) {
      const k = weight[x];
      if (k === 1) out[row + x] = mask[row + x];
      else if (k > 0) out[row + x] = Math.round(mask[row + x] * k);
    }
  }
  return out;
}

/**
 * Pixel edges + feathers for a block wipe. The moving edge travels an extra
 * feather width so the ramp fully clears the block at the end of the phase.
 * Returns { x0, x1, fl, fr } in region pixels.
 */
export function wipeEdges(clipX, clipFeather, bx, bw, feather, regionW) {
  if (!clipX) return null;
  if (clipFeather === 'right') return { x0: 0, x1: bx + clipX[1] * (bw + feather), fl: 0, fr: feather };
  if (clipFeather === 'left') return { x0: bx - feather + clipX[0] * (bw + feather), x1: regionW, fl: feather, fr: 0 };
  if (clipFeather === 'both') return { x0: bx + clipX[0] * bw, x1: bx + clipX[1] * bw, fl: feather, fr: feather };
  return { x0: bx + clipX[0] * bw, x1: bx + clipX[1] * bw, fl: 0, fr: 0 };
}

/** out = a * (1 - b) per pixel — e.g. stroke ring = stroke * (1 - fill). */
export function maskOutside(a, b, count) {
  const out = new Uint8ClampedArray(count);
  for (let i = 0; i < count; i++) out[i] = Math.round(a[i] * (1 - b[i] / 255));
  return out;
}

export function scaleMask(mask, count, k) {
  if (k >= 1) return mask;
  const out = new Uint8ClampedArray(count);
  for (let i = 0; i < count; i++) out[i] = Math.round(mask[i] * k);
  return out;
}

export function maxMask(a, b, count) {
  const out = new Uint8ClampedArray(count);
  for (let i = 0; i < count; i++) out[i] = a[i] > b[i] ? a[i] : b[i];
  return out;
}

// ──────────────────────────── Compositing ────────────────────────────

/** Contrast curve for `contrast-boost`, applied to the inverted value only. */
export function contrastCurve(v, score) {
  if (score <= 0) return v;
  const k = 1 + 0.9 * score;
  const r = 127.5 + (v - 127.5) * k;
  return r < 0 ? 0 : r > 255 ? 255 : r;
}

/**
 * Composites every caption layer onto an interleaved pixel buffer in place.
 *
 * @param px      Uint8ClampedArray, `stride` bytes per pixel (RGBA = 4, RGB = 3)
 * @param count   pixel count
 * @param stride  3 or 4
 * @param L       layers, each an 8-bit mask of `count` entries or null:
 *                { pill, pillRGB, shadow, shadowRGB, white, negR, negG, negB,
 *                  ring, ringRGB, contrast }
 */
export function compositeLayers(px, count, stride, L) {
  const contrast = L.contrast || 0;
  const pillRGB = L.pillRGB || [0, 0, 0];
  const shadowRGB = L.shadowRGB || [0, 0, 0];
  const ringRGB = L.ringRGB || [0, 0, 0];
  const negR = L.negR;
  const negG = L.negG || negR;
  const negB = L.negB || negR;

  for (let i = 0; i < count; i++) {
    const o = i * stride;
    let r = px[o];
    let g = px[o + 1];
    let b = px[o + 2];

    if (L.pill) {
      const a = L.pill[i] / 255;
      if (a > 0) {
        r = r * (1 - a) + pillRGB[0] * a;
        g = g * (1 - a) + pillRGB[1] * a;
        b = b * (1 - a) + pillRGB[2] * a;
      }
    }
    if (L.shadow) {
      const a = L.shadow[i] / 255;
      if (a > 0) {
        r = r * (1 - a) + shadowRGB[0] * a;
        g = g * (1 - a) + shadowRGB[1] * a;
        b = b * (1 - a) + shadowRGB[2] * a;
      }
    }
    if (L.white) {
      const a = L.white[i] / 255;
      if (a > 0) {
        r = r * (1 - a) + 255 * a;
        g = g * (1 - a) + 255 * a;
        b = b * (1 - a) + 255 * a;
      }
    }
    if (negR) {
      const ar = negR[i] / 255;
      const ag = negG[i] / 255;
      const ab = negB[i] / 255;
      if (ar > 0) r = r * (1 - ar) + contrastCurve(255 - r, contrast) * ar;
      if (ag > 0) g = g * (1 - ag) + contrastCurve(255 - g, contrast) * ag;
      if (ab > 0) b = b * (1 - ab) + contrastCurve(255 - b, contrast) * ab;
    }
    if (L.ring) {
      const a = L.ring[i] / 255;
      if (a > 0) {
        r = r * (1 - a) + ringRGB[0] * a;
        g = g * (1 - a) + ringRGB[1] * a;
        b = b * (1 - a) + ringRGB[2] * a;
      }
    }
    px[o] = Math.round(r);
    px[o + 1] = Math.round(g);
    px[o + 2] = Math.round(b);
  }
  return px;
}

// ───────────────────────── Shadow / stroke plans ─────────────────────────

/**
 * Describes the shadow passes for the current VFX settings so both engines
 * blur the same mask by the same sigma. Mirrors buildShadowFilter() in
 * captionStyle.js: cinematic = 2 offset blurs, glow = 2 centred blurs,
 * hard = 1 crisp offset. Returns [{ dx, dy, sigma, opacity }].
 */
export function shadowPlan(style, scale, fallbackScore) {
  const type = style.shadowType || 'cinematic';
  const blur = (style.shadowBlur ?? 14) * scale * 0.5;
  const dist = (style.shadowDistance ?? 4) * scale;
  const opacity = style.shadowOpacity ?? 0.9;
  const passes = [];
  if (type === 'glow') {
    passes.push({ dx: 0, dy: 0, sigma: blur, opacity });
    passes.push({ dx: 0, dy: 0, sigma: blur * 1.9, opacity: opacity * 0.65 });
  } else if (type === 'hard') {
    passes.push({ dx: dist, dy: dist, sigma: 0, opacity });
  } else if (type === 'cinematic') {
    passes.push({ dx: 0, dy: dist, sigma: blur, opacity });
    passes.push({ dx: 0, dy: dist * 1.5, sigma: blur * 1.6, opacity: opacity * 0.6 });
  }
  // Readability fallback: a subtle soft dark shadow ramps in with the score.
  if (fallbackScore > 0 && (style.lowContrastFallback || 'stroke') === 'stroke') {
    passes.push({ dx: 0, dy: 2 * scale * 0.5, sigma: 6 * scale * 0.5, opacity: 0.55 * fallbackScore, color: [0, 0, 0] });
  }
  return passes;
}

/** Stroke width in video px, including the readability fallback outline. */
export function strokePlan(style, scale, fallbackScore) {
  const user = Math.max(0, Number(style.strokeWidth) || 0) * scale * 0.5;
  const fb = (style.lowContrastFallback || 'stroke') === 'stroke' && fallbackScore > 0
    ? 1.5 * scale * 0.5 * fallbackScore
    : 0;
  return { width: Math.max(user, fb), userWidth: user, fallbackWidth: fb };
}

export function parseRGB(hex, fallback = [0, 0, 0]) {
  if (typeof hex !== 'string') return fallback;
  const s = hex.trim();
  if (s.startsWith('rgb')) {
    const nums = s.match(/[\d.]+/g);
    if (nums && nums.length >= 3) return [0, 1, 2].map((i) => Math.max(0, Math.min(255, Math.round(parseFloat(nums[i])))));
    return fallback;
  }
  let c = s.replace('#', '');
  if (c.length === 3) c = c.split('').map((ch) => ch + ch).join('');
  if (c.length !== 6) return fallback;
  const n = parseInt(c, 16);
  if (Number.isNaN(n)) return fallback;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function parseAlpha(color) {
  if (typeof color !== 'string') return 1;
  const s = color.trim();
  if (s === 'transparent' || s === '') return 0;
  if (s.startsWith('rgba')) {
    const nums = s.match(/[\d.]+/g);
    if (nums && nums.length >= 4) return clamp01(parseFloat(nums[3]));
  }
  return 1;
}

/** Maps the legacy `transition` picker onto an IN preset for the negative renderer. */
export function transitionToPreset(transition) {
  switch (transition) {
    case 'Pop Up': return 'scale-pop';
    case 'Zoom Kinetic': return 'blur-in';
    case 'Fade In': return 'mask-wipe';
    case 'Slide Up':
    case 'Fade In + Slide Up': return 'stagger-rise';
    case 'None': return 'none';
    default: return null;
  }
}

// ─────────────────────────── Region geometry ───────────────────────────

/**
 * Padding around the caption block so stroke, shadow, glitch slices and the
 * animation overshoot never get clipped by the composite region.
 */
export function regionPadding(layout, style, scale) {
  const stroke = strokePlan(style, scale, 1).width;
  let sx = 0;
  let sy = 0;
  for (const p of shadowPlan(style, scale, 1)) {
    sx = Math.max(sx, Math.abs(p.dx) + 3 * p.sigma);
    sy = Math.max(sy, Math.abs(p.dy) + 3 * p.sigma);
  }
  const blurMax = 12 * scale * 0.5 * 3;
  const box = 0.5 * layout.fontPx;
  const pill = (Number(style.bgPadding) || 0) * scale * 1.6;
  const animX = Math.max(0.12 * layout.blockW, blurMax);
  const animY = Math.max(0.45 * layout.fontPx, blurMax);
  return {
    padX: Math.ceil(stroke * 2 + 4 + Math.max(sx, animX, box, pill)),
    padY: Math.ceil(stroke * 2 + 4 + Math.max(sy, animY, box, pill)),
  };
}

/**
 * Where the composite region sits in the frame. `blockX/blockY` is the block
 * origin inside the region; `x/y/w/h` is the region in frame coordinates
 * (may extend past the frame — crop with clipRegion()).
 */
export function regionRect(layout, style, videoW, videoH, pad) {
  const cx = (videoW * (Number(style.xPercent) || 50)) / 100;
  const cy = (videoH * (Number(style.yPercent) || 82)) / 100;
  const blockLeft = Math.round(cx - layout.blockW / 2);
  const blockTop = Math.round(cy - layout.blockH / 2);
  return {
    x: blockLeft - pad.padX,
    y: blockTop - pad.padY,
    w: Math.ceil(layout.blockW) + pad.padX * 2,
    h: Math.ceil(layout.blockH) + pad.padY * 2,
    blockX: pad.padX,
    blockY: pad.padY,
  };
}

/** Intersection of a region with the frame: { x, y, w, h, sx, sy } (sx/sy = crop offset inside the region). */
export function clipRegion(rect, videoW, videoH) {
  const x0 = Math.max(0, rect.x);
  const y0 = Math.max(0, rect.y);
  const x1 = Math.min(videoW, rect.x + rect.w);
  const y1 = Math.min(videoH, rect.y + rect.h);
  if (x1 <= x0 || y1 <= y0) return null;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0, sx: x0 - rect.x, sy: y0 - rect.y };
}

/** Crops an 8-bit mask of size (w,h) to the sub-rect (sx, sy, cw, ch). */
export function cropMask(mask, w, sx, sy, cw, ch) {
  const out = new Uint8ClampedArray(cw * ch);
  for (let y = 0; y < ch; y++) {
    const src = (y + sy) * w + sx;
    out.set(mask.subarray(src, src + cw), y * cw);
  }
  return out;
}

/** Index of the word being spoken at `frame`, or -1 (karaoke / highlight variant). */
export function activeWordAt(words, frame, fps) {
  const t = frame / fps;
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (typeof w.start === 'number' && typeof w.end === 'number' && t >= w.start && t < w.end) return i;
  }
  return -1;
}

/** Rounded-rect geometry shared by the box variant and the pill background. */
export function boxGeometry(layout, kind, style, scale) {
  if (kind === 'pill') {
    const padY = (Number(style.bgPadding) || 0) * scale;
    const padX = padY * 1.6;
    return { x: -padX, y: -padY, w: layout.blockW + padX * 2, h: layout.blockH + padY * 2, r: (Number(style.bgRadius) || 0) * scale };
  }
  const padX = 0.35 * layout.fontPx;
  const padY = 0.22 * layout.fontPx;
  const r = style.bgRadius != null ? Number(style.bgRadius) * scale : 0.18 * layout.fontPx;
  return { x: -padX, y: -padY, w: layout.blockW + padX * 2, h: layout.blockH + padY * 2, r };
}

/** Union of stacked shadow passes, like CSS drop-shadow chains: a ∪ b = a + b − ab. */
export function unionMask(a, b, count) {
  const out = new Uint8ClampedArray(count);
  for (let i = 0; i < count; i++) {
    const x = a[i] / 255;
    const y = b[i] / 255;
    out[i] = Math.round((x + y - x * y) * 255);
  }
  return out;
}
