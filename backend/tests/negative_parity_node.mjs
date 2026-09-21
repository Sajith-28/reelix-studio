/**
 * Runs the browser-side Negative Text core (frontend/src/lib/negativeText.js)
 * on inputs produced by test_negative_parity.py, so the Python export path and
 * the JS preview path can be compared byte-for-byte.
 *
 * usage: node negative_parity_node.mjs <job.json> <result.json>
 * Binary buffers travel as base64 strings.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const core = await import(pathToFileURL(resolve(here, '../../frontend/src/lib/negativeText.js')).href);

const [, , jobPath, outPath] = process.argv;
const job = JSON.parse(readFileSync(jobPath, 'utf8'));
const b64 = (u8) => Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength).toString('base64');
const u8 = (s) => (s == null ? null : new Uint8ClampedArray(Buffer.from(s, 'base64')));

const out = {};

// 1. Animation state for every requested frame.
if (job.anim) {
  out.anim = job.anim.map((c) => {
    const timing = core.layerTiming(c.caption, c.params, c.fps);
    const frames = [];
    for (let f = timing.startFrame - 1; f <= timing.endFrame; f++) {
      frames.push(core.animState(f, timing, c.params, c.counts, c.fontPx, c.blockW, c.scale));
    }
    const sweep = [];
    for (let f = timing.startFrame; f < timing.endFrame; f++) sweep.push(core.sweepBand(f, timing, c.params));
    return { timing, frames, sweep };
  });
}

// 2. Mask utilities.
if (job.masks) {
  const m = job.masks;
  const mask = u8(m.mask);
  const other = u8(m.other);
  out.masks = {
    shift: b64(core.shiftMask(mask, m.w, m.h, m.dx)),
    slices: b64(core.sliceMask(mask, m.w, m.h, m.slices)),
    clip: b64(core.clipMaskX(mask, m.w, m.h, m.x0, m.x1)),
    clipFeather: b64(core.clipMaskX(mask, m.w, m.h, m.x0, m.x1, m.fl, m.fr)),
    wipe: ['right', 'left', 'both', null].map((f) => core.wipeEdges([0.3, 0.8], f, 11, 40, 4.5, m.w)),
    outside: b64(core.maskOutside(mask, other, m.w * m.h)),
    union: b64(core.unionMask(mask, other, m.w * m.h)),
    scaled: b64(core.scaleMask(mask, m.w * m.h, m.k)),
    luma: core.maskedLuminance(u8(m.rgb), 3, mask, m.w * m.h),
    score: core.lowContrastScore(m.luma),
    hash: [0, 1, 2, 3, 1000, 1003].map((a) => [0, 1, 5, 99].map((b) => core.hash01(a, b))),
  };
}

// 3. Compositing on real frames.
if (job.composite) {
  out.composite = job.composite.map((c) => {
    const px = u8(c.rgb);
    const L = {
      pill: u8(c.layers.pill), pillRGB: c.layers.pillRGB,
      shadow: u8(c.layers.shadow), shadowRGB: c.layers.shadowRGB,
      white: u8(c.layers.white),
      negR: u8(c.layers.negR), negG: u8(c.layers.negG), negB: u8(c.layers.negB),
      ring: u8(c.layers.ring), ringRGB: c.layers.ringRGB,
      contrast: c.layers.contrast,
    };
    core.compositeLayers(px, c.w * c.h, 3, L);
    return b64(px);
  });
}

// 4. Layout with the caller's measurements (so the algorithm, not the font engine, is compared).
if (job.layout) {
  const j = job.layout;
  const widths = new Map(Object.entries(j.widths));
  const measure = (text, px) => (text === '' ? 0 : widths.get(`${px}|${text}`) ?? 0);
  const metrics = (px) => j.metrics[String(px)] || j.metrics[Object.keys(j.metrics)[0]];
  const lay = core.layoutCaption(j.words, j.style, j.videoW, j.videoH, measure, metrics);
  const pad = core.regionPadding(lay, j.style, lay.scale);
  out.layout = { layout: lay, pad, rect: core.regionRect(lay, j.style, j.videoW, j.videoH, pad) };
}

writeFileSync(outPath, JSON.stringify(out));
