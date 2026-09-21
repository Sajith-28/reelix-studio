/**
 * REELIX — Negative Text preview painter (Canvas2D)
 *
 * Browser twin of `NegativeCaptionRenderer` in backend/services/negative_text.py.
 * Rasterises the glyph / box / band masks with Canvas2D in the same order and
 * with the same transforms as PIL does for the export, then hands the 8-bit
 * masks to the shared pure compositor in negativeText.js.
 *
 * Works with any font: layout is measured from the live font metrics
 * (measureText), never from hard-coded glyph widths.
 */

import {
  activeWordAt,
  animState,
  boxGeometry,
  clipMaskX,
  clipRegion,
  compositeLayers,
  cropMask,
  easings,
  layerTiming,
  layoutCaption,
  lowContrastScore,
  maskOutside,
  maskedLuminance,
  maxMask,
  parseAlpha,
  parseRGB,
  refScale,
  regionPadding,
  regionRect,
  resolveNegativeParams,
  scaleMask,
  shadowPlan,
  shiftMask,
  sliceMask,
  smoothLuminance,
  strokePlan,
  sweepBand,
  unionMask,
  wipeEdges,
  WIPE_FEATHER_EM,
} from './negativeText';
import { applyTextTransform, fontInfo, nearestFontWeight } from './captionStyle';

const ITALIC_SHEAR = 0.25;

function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/**
 * CSS font string for the mask canvas: the family's nearest shipped weight and
 * a real italic face when it has one (otherwise upright — the painter shears,
 * exactly like the export).
 */
export function negativeFontString(family, px, weight = 900, italic = false) {
  const w = nearestFontWeight(family, weight);
  return `${italic ? 'italic ' : ''}${w} ${Math.max(1, Math.floor(px))}px "${family || 'Anton'}"`;
}

/** Whether `family` ships a real italic face (any weight). */
export function familyHasItalic(family) {
  const info = fontInfo(family);
  return !!(info && info.italics && info.italics.length);
}

/** Same word shaping as caption_words() in rendering.py. */
export function captionWordsJS(caption, style) {
  const transform = style.textTransform || 'uppercase';
  const raw = Array.isArray(caption?.words) && caption.words.length ? caption.words : null;
  let out = [];
  if (raw) {
    for (const w of raw) {
      const text = (typeof w === 'string' ? w : (w?.word || w?.text || '')).trim();
      if (text) out.push({ text: applyTextTransform(text, transform), start: w?.start, end: w?.end });
    }
  }
  if (!out.length) {
    const source = (caption?.translated_text || caption?.source_text || '').trim();
    out = source.split(/\s+/).filter(Boolean).map((t) => ({ text: applyTextTransform(t, transform), start: null, end: null }));
  }
  return out;
}

function roundedRectPath(ctx, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.arcTo(x + w, y, x + w, y + rr, rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr);
  ctx.lineTo(x + rr, y + h);
  ctx.arcTo(x, y + h, x, y + h - rr, rr);
  ctx.lineTo(x, y + rr);
  ctx.arcTo(x, y, x + rr, y, rr);
  ctx.closePath();
}

export class NegativeCaptionPainter {
  /**
   * @param caption   caption card ({ start, end, words, translated_text, keywords })
   * @param style     styleConfig
   * @param videoW    width of the canvas the painter renders into (video px space)
   * @param videoH    height of that canvas
   * @param fps       frames per second of the source video
   */
  constructor(caption, style, videoW, videoH, fps) {
    this.caption = caption;
    this.style = style;
    this.params = resolveNegativeParams(style, caption);
    this.variant = this.params.variant || 'negative-text';
    this.fps = fps;
    this.videoW = videoW;
    this.videoH = videoH;
    this.scale = refScale(videoW, videoH);
    this.family = style.fontFamily || 'Anton';
    this.weight = style.fontWeight || 900;
    this.realItalic = !!style.italic && familyHasItalic(this.family);
    this.synthItalic = !!style.italic && !this.realItalic;
    this.words = captionWordsJS(caption, style);
    this.timing = layerTiming(caption, this.params, fps);
    this.luma = null;
    this.score = 0;
    this._frameCache = new Map(); // frame → layers (paused re-draws)
    this._holdCache = null;       // { key, scoreQ, fill, layers } while nothing animates
    this._pool = [];              // offscreen canvases reused every frame (no GC churn)
    this._poolCursor = 0;

    this._scratch = makeCanvas(1, 1).getContext('2d');
    this.layout = layoutCaption(this.words, style, videoW, videoH, (t, px) => this.measure(t, px), (px) => this.metrics(px));
    this.counts = { chars: this.layout.chars, words: this.layout.wordCount };
    this.feather = Math.max(2, WIPE_FEATHER_EM * this.layout.fontPx);
    this.pad = regionPadding(this.layout, style, this.scale);
    this.rect = regionRect(this.layout, style, videoW, videoH, this.pad);
    this.clip = clipRegion(this.rect, videoW, videoH);
  }

  measure(text, px) {
    if (!text) return 0;
    this._scratch.font = negativeFontString(this.family, px, this.weight, this.realItalic);
    return this._scratch.measureText(text).width;
  }

  metrics(px) {
    this._scratch.font = negativeFontString(this.family, px, this.weight, this.realItalic);
    const m = this._scratch.measureText('Hg');
    const ascent = m.fontBoundingBoxAscent ?? px * 0.9;
    const descent = m.fontBoundingBoxDescent ?? px * 0.25;
    return { ascent, descent };
  }

  covers(frame) {
    return this.timing.startFrame <= frame && frame < this.timing.endFrame && !!this.clip;
  }

  // ── canvas helpers ────────────────────────────────────────────────

  /** Cleared region-sized canvas from the pool. Reset the cursor once per frame. */
  _blank() {
    let c = this._pool[this._poolCursor++];
    if (!c) {
      c = makeCanvas(this.rect.w, this.rect.h);
      this._pool.push(c);
    }
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.filter = 'none';
    ctx.clearRect(0, 0, this.rect.w, this.rect.h);
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#fff';
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    return { canvas: c, ctx };
  }

  _alpha(canvas) {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const data = ctx.getImageData(0, 0, this.rect.w, this.rect.h).data;
    const n = this.rect.w * this.rect.h;
    const out = new Uint8ClampedArray(n);
    for (let i = 0; i < n; i++) out[i] = data[i * 4 + 3];
    return out;
  }

  _maskToCanvas(mask) {
    const { canvas, ctx } = this._blank();
    const n = this.rect.w * this.rect.h;
    const img = ctx.createImageData(this.rect.w, this.rect.h);
    const d = img.data;
    for (let i = 0; i < n; i++) {
      const o = i * 4;
      d[o] = 255;
      d[o + 1] = 255;
      d[o + 2] = 255;
      d[o + 3] = mask[i];
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
  }

  _blurCanvas(src, sigma, dx = 0, dy = 0) {
    const { canvas, ctx } = this._blank();
    if (sigma > 0.05) ctx.filter = `blur(${sigma}px)`;
    ctx.drawImage(src, Math.round(dx), Math.round(dy));
    ctx.filter = 'none';
    return canvas;
  }

  // ── glyph rasterisation (mirrors _draw_glyphs) ────────────────────

  _drawGlyphs(anim, strokeW = 0, wordFilter = null, activeIdx = -1) {
    const lay = this.layout;
    const { w: rw, blockX: bx, blockY: by } = this.rect;
    const unit = anim.unit;
    const units = anim.units;
    const useKaraoke = this.style.karaoke !== false;
    const activeScale = Number(this.style.activeScale) || 1;
    const { canvas, ctx } = this._blank();

    for (const line of lay.lines) {
      const needsClip = unit === 'char' && line.words.some((w) => w.chars.some((c) => c.index < units.length && units[c.index].lineClip));
      ctx.save();
      if (needsClip) {
        const y0 = Math.floor(by + line.top + lay.halfLeading);
        const y1 = Math.ceil(y0 + lay.ascent + lay.descent);
        ctx.beginPath();
        ctx.rect(0, y0, rw, y1 - y0);
        ctx.clip();
      }
      const cy = by + line.top + line.height / 2;
      for (const word of line.words) {
        if (wordFilter && !wordFilter(word)) continue;
        const wu = unit === 'word' && word.index < units.length ? units[word.index] : null;
        if (wu && !wu.visible) continue;
        let k = wu ? wu.scale : 1;
        const tx = wu ? wu.tx : 0;
        if (useKaraoke && word.index === activeIdx) k *= activeScale;
        const cx = bx + word.x + word.width / 2;
        ctx.font = negativeFontString(this.family, lay.fontPx * k, this.weight, this.realItalic);
        const sw = strokeW > 0 ? Math.round(strokeW * k) : 0;
        ctx.lineWidth = sw * 2;
        for (const ch of word.chars) {
          const cu = unit === 'char' && ch.index < units.length ? units[ch.index] : null;
          if (cu && !cu.visible) continue;
          const ty = cu ? cu.ty : 0;
          const x = bx + word.x + ch.x;
          const baseline = by + line.baseline;
          const xp = cx + (x - cx) * k + tx;
          const bp = cy + (baseline + ty - cy) * k;
          if (sw > 0) ctx.strokeText(ch.ch, xp, bp);
          ctx.fillText(ch.ch, xp, bp);
        }
      }
      ctx.restore();
    }

    const cursor = anim.block.cursor;
    if (cursor >= 0 && unit === 'char') {
      for (const line of lay.lines) {
        for (const word of line.words) {
          for (const ch of word.chars) {
            if (ch.index !== cursor) continue;
            const x = bx + word.x + ch.x + ch.width + 0.08 * lay.fontPx;
            const y0 = by + line.baseline - lay.ascent * 0.8;
            const y1 = by + line.baseline + lay.descent * 0.2;
            ctx.fillRect(x, y0, 0.09 * lay.fontPx, y1 - y0);
          }
        }
      }
    }
    return canvas;
  }

  _blockAffine(canvas, anim) {
    const k = anim.block.scale;
    const fx = this.style.flipH ? -1 : 1;
    const sh = this.synthItalic ? ITALIC_SHEAR : 0;
    if (k === 1 && fx === 1 && sh === 0) return canvas;
    const cx = this.rect.blockX + this.layout.blockW / 2;
    const cy = this.rect.blockY + this.layout.blockH / 2;
    // Forward map p' = A(p - c) + c with A = [[k fx, -k fx sh], [0, k]]
    const a = k * fx;
    const c = -k * fx * sh;
    const d = k;
    const e = cx - (a * cx + c * cy);
    const f = cy - d * cy;
    const { canvas: out, ctx } = this._blank();
    ctx.setTransform(a, 0, c, d, e, f);
    ctx.drawImage(canvas, 0, 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    return out;
  }

  /** Everything after rasterisation: affine → blur → slices → clip wipe → opacity. Returns a mask. */
  _blockOps(canvas, anim) {
    const block = anim.block;
    let c = this._blockAffine(canvas, anim);
    if (block.blur > 0.05) c = this._blurCanvas(c, block.blur);
    let arr = this._alpha(c);
    const { w, h } = this.rect;
    if (block.slices) arr = sliceMask(arr, w, h, block.slices);
    if (block.clipX) {
      const e = wipeEdges(block.clipX, block.clipFeather, this.rect.blockX, this.layout.blockW, this.feather, w);
      arr = clipMaskX(arr, w, h, e.x0, e.x1, e.fl, e.fr);
    }
    if (block.opacity < 1) arr = scaleMask(arr, w * h, block.opacity);
    return arr;
  }

  _roundedBox(geom, blockT, anim, dir) {
    const { canvas, ctx } = this._blank();
    const x0 = this.rect.blockX + geom.x;
    const y0 = this.rect.blockY + geom.y;
    roundedRectPath(ctx, x0, y0, geom.w, geom.h, Math.max(0, Math.round(geom.r)));
    ctx.fill();
    if (anim.unit === 'block') return this._blockOps(canvas, anim);
    let arr = this._alpha(this._blockAffine(canvas, anim));
    const { w, h, blockX: bx } = this.rect;
    if (dir !== 'hold') {
      const e = easings.easeOutCubic(blockT);
      const f = this.feather;
      const span = [geom.x, geom.x + geom.w];
      if (dir === 'in') arr = clipMaskX(arr, w, h, 0, bx + span[0] + e * (span[1] - span[0] + f), 0, f);
      else arr = clipMaskX(arr, w, h, bx + span[0] - f + (1 - e) * (span[1] - span[0] + f), w, f, 0);
    }
    if (anim.block.opacity < 1) arr = scaleMask(arr, w * h, anim.block.opacity);
    return arr;
  }

  _shadow(shape, passes) {
    if (!passes.length) return null;
    const { w, h } = this.rect;
    const n = w * h;
    const shapeCanvas = this._maskToCanvas(shape);
    let total = new Uint8ClampedArray(n);
    for (const p of passes) {
      const arr = this._alpha(this._blurCanvas(shapeCanvas, p.sigma, p.dx, p.dy));
      total = unionMask(total, scaleMask(arr, n, p.opacity), n);
    }
    return maskOutside(total, shape, n);
  }

  // ── per-frame composite (mirrors build_layers) ────────────────────

  buildLayers(frame, regionPx) {
    const lay = this.layout;
    const style = this.style;
    const params = this.params;
    const anim = animState(frame, this.timing, params, this.counts, lay.fontPx, lay.blockW, this.scale);
    if (anim.phase === 'hidden') return null;
    const block = anim.block;
    const clip = this.clip;
    const { w, h } = this.rect;
    const n = w * h;
    const activeIdx = activeWordAt(this.words, frame, this.fps);
    const crop = (m) => (m ? cropMask(m, w, clip.sx, clip.sy, clip.w, clip.h) : null);
    this._poolCursor = 0;

    // While nothing moves (hold phase) the masks only depend on the spoken word
    // and the readability score, so they are rasterised once and reused.
    const sweep = this.variant === 'negative-sweep' ? sweepBand(frame, this.timing, params) : null;
    const holdKey = anim.phase === 'hold' && (!sweep || sweep.done) ? `hold|${activeIdx}|${block.mode}` : null;
    const cached = holdKey && this._holdCache && this._holdCache.key === holdKey ? this._holdCache : null;

    const fill = cached ? cached.fill : this._blockOps(this._drawGlyphs(anim, 0, null, activeIdx), anim);

    const every = Math.max(1, Number(params.luminanceEveryN) || 3);
    if ((frame - this.timing.startFrame) % every === 0 || this.luma == null) {
      this.luma = smoothLuminance(this.luma, maskedLuminance(regionPx, 4, cached ? cached.fillCropped : crop(fill), clip.w * clip.h));
    }
    const fallback = params.lowContrastFallback || 'stroke';
    this.score = fallback !== 'none' ? lowContrastScore(this.luma) : 0;
    // Stroke / shadow plans use the score in 0.05 steps so cached masks stay valid
    // across the smoothed ramp; the contrast curve keeps the exact value.
    const scoreQ = Math.round(this.score * 20) / 20;
    if (cached && cached.scoreQ === scoreQ) return cached.layers;

    const sp = strokePlan(style, this.scale, scoreQ);
    let ring = null;
    if (sp.width > 0.05) {
      const stroke = this._blockOps(this._drawGlyphs(anim, sp.width, null, activeIdx), anim);
      ring = maskOutside(stroke, fill, n);
    }

    let white = null;
    let neg = fill;
    let shape = fill;
    if (this.variant === 'negative-box') {
      const box = this._roundedBox(boxGeometry(lay, 'box', style, this.scale), anim.progress, anim, anim.dir);
      neg = maskOutside(box, fill, n);
      shape = box;
    } else if (this.variant === 'negative-highlight') {
      if (activeIdx >= 0 && style.karaoke !== false) {
        neg = this._blockOps(this._drawGlyphs(anim, 0, (wd) => wd.index === activeIdx, activeIdx), anim);
        white = this._blockOps(this._drawGlyphs(anim, 0, (wd) => wd.index !== activeIdx, activeIdx), anim);
      } else {
        white = fill;
        neg = null;
      }
    } else if (this.variant === 'negative-sweep') {
      const band = sweepBand(frame, this.timing, params);
      if (band && !band.done) {
        const bx = this.rect.blockX;
        const bw = lay.blockW;
        const leftPx = bx + band.left * bw;
        const rightPx = bx + band.right * bw;
        const { canvas, ctx } = this._blank();
        const by = this.rect.blockY;
        const top = by - 0.12 * lay.fontPx;
        ctx.fillRect(leftPx, top, rightPx - leftPx, lay.blockH + 0.24 * lay.fontPx);
        const bandArr = this._alpha(canvas);
        const flipped = clipMaskX(fill, w, h, 0, leftPx);
        const pending = clipMaskX(fill, w, h, rightPx, w);
        neg = maxMask(flipped, maskOutside(bandArr, fill, n), n);
        white = pending;
      }
    }

    if (block.mode === 'white') {
      white = white ? maxMask(white, fill, n) : fill;
      neg = null;
    } else if (block.mode === 'flash') {
      const halo = this._alpha(this._blurCanvas(this._maskToCanvas(fill), 0.25 * lay.fontPx));
      white = maxMask(fill, scaleMask(halo, n, 0.85), n);
      neg = null;
    }

    let negR = neg;
    let negG = neg;
    let negB = neg;
    if (neg && block.rgbSplit) {
      negR = shiftMask(neg, w, h, block.rgbSplit);
      negB = shiftMask(neg, w, h, -block.rgbSplit);
    }

    const shadowPasses = shadowPlan(style, this.scale, scoreQ);
    const shadowRGB = (style.shadowType || 'cinematic') !== 'none' ? parseRGB(style.shadowColor, [0, 0, 0]) : [0, 0, 0];
    const shadow = this._shadow(shape, shadowPasses);

    let pill = null;
    let pillRGB = null;
    const bg = style.backgroundColor;
    const pillAlpha = parseAlpha(bg);
    if (pillAlpha > 0) {
      pill = scaleMask(this._roundedBox(boxGeometry(lay, 'pill', style, this.scale), anim.progress, anim, anim.dir), n, pillAlpha);
      pillRGB = parseRGB(bg, [0, 0, 0]);
    }

    const layers = {
      pill: crop(pill), pillRGB,
      shadow: crop(shadow), shadowRGB,
      white: crop(white),
      negR: crop(negR), negG: crop(negG), negB: crop(negB),
      ring: crop(ring), ringRGB: parseRGB(style.strokeColor, [0, 0, 0]),
      contrast: fallback === 'contrast-boost' ? this.score : 0,
    };
    this._holdCache = holdKey ? { key: holdKey, scoreQ, fill, fillCropped: crop(fill), layers } : null;
    return layers;
  }

  /** Composites this caption onto `ctx` (which already holds the video frame). */
  render(ctx, frame) {
    if (!this.covers(frame)) return false;
    const c = this.clip;
    let img;
    try {
      img = ctx.getImageData(c.x, c.y, c.w, c.h);
    } catch (err) {
      throw err;
    }
    let layers = this._frameCache.get(frame);
    if (!layers) {
      layers = this.buildLayers(frame, img.data);
      if (!layers) return false;
      this._frameCache.clear();
      this._frameCache.set(frame, layers);
    }
    // contrast-boost follows the live (unquantised) score even on cached masks
    if (layers.contrast) layers.contrast = this.score;
    compositeLayers(img.data, c.w * c.h, 4, layers);
    try {
      ctx.putImageData(img, c.x, c.y);
    } catch (e) {
      return false;
    }
    return true;
  }
}
