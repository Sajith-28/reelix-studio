/**
 * REELIX — Shared Caption Style System
 *
 * Single source of truth for template presets and the CSS each style produces.
 * The template picker thumbnails, the live video overlay and the backend
 * exporter all read from here so what you see is what gets burned in.
 */

export const TEMPLATE_CATEGORIES = [
  { id: 'karaoke', label: 'Kalakar Karaoke', hint: 'Word-by-word box highlight that follows the voice' },
  { id: 'viral', label: 'Viral Reels', hint: 'High-contrast punch styles built for IG / TikTok' },
  { id: 'aesthetic', label: 'Pinterest Aesthetic', hint: 'Editorial, serif and soft minimal typography' },
  { id: 'blend', label: 'Inverted & Experimental', hint: 'Pixel-blend and cutout treatments' },
];

const BASE = {
  fontSize: 30,
  xPercent: 50,
  yPercent: 82,
  position: 'bottom',
  color: '#ffffff',
  backgroundColor: 'transparent',
  strokeColor: '#000000',
  shadowColor: '#000000',
  mixBlendMode: 'normal',
  flipH: false,
  italic: false,
  borderStyle: 1,
  textTransform: 'uppercase',
  letterSpacing: 0,
  lineHeight: 1.05,
  maxWordsPerLine: 3,
  highlightMode: 'color',
  highlightBg: '#facc15',
  highlightTextColor: '#0b0b0b',
  karaoke: true,
  activeScale: 1.14,
  bgPadding: 0,
  bgRadius: 0,
  transition: 'Fade In + Slide Up',
};

export const TEMPLATE_PRESETS = [
  // ─────────────────────────── Kalakar Karaoke ───────────────────────────
  {
    ...BASE,
    id: 'kalakar_gold',
    category: 'karaoke',
    name: 'Kalakar Signature Gold',
    fontFamily: 'Anton',
    fontSize: 32,
    highlightColor: '#0b0b0b',
    highlightMode: 'box',
    highlightBg: '#ffd60a',
    highlightTextColor: '#0b0b0b',
    strokeWidth: 0,
    shadowType: 'cinematic',
    shadowBlur: 16,
    shadowOpacity: 0.85,
    shadowDistance: 4,
    maxWordsPerLine: 3,
    bgRadius: 8,
    transition: 'Pop Up',
  },
  {
    ...BASE,
    id: 'kalakar_lime',
    category: 'karaoke',
    name: 'Kalakar Neon Lime',
    fontFamily: 'Anton',
    fontSize: 32,
    highlightColor: '#0b0b0b',
    highlightMode: 'box',
    highlightBg: '#39ff14',
    highlightTextColor: '#0b0b0b',
    strokeWidth: 0,
    shadowType: 'cinematic',
    shadowBlur: 18,
    shadowOpacity: 0.9,
    shadowDistance: 4,
    maxWordsPerLine: 3,
    bgRadius: 8,
    transition: 'Pop Up',
  },
  {
    ...BASE,
    id: 'kalakar_blood',
    category: 'karaoke',
    name: 'Kalakar Blood Red',
    fontFamily: 'Bebas Neue',
    fontSize: 36,
    highlightColor: '#ffffff',
    highlightMode: 'box',
    highlightBg: '#e11d48',
    highlightTextColor: '#ffffff',
    strokeWidth: 0,
    shadowType: 'cinematic',
    shadowBlur: 16,
    shadowOpacity: 0.9,
    shadowDistance: 4,
    letterSpacing: 1,
    maxWordsPerLine: 3,
    bgRadius: 6,
    transition: 'Pop Up',
  },
  {
    ...BASE,
    id: 'kalakar_electric',
    category: 'karaoke',
    name: 'Kalakar Electric Violet',
    fontFamily: 'Montserrat',
    fontSize: 30,
    highlightColor: '#ffffff',
    highlightMode: 'box',
    highlightBg: '#7c3aed',
    highlightTextColor: '#ffffff',
    strokeWidth: 1.5,
    shadowType: 'glow',
    shadowBlur: 18,
    shadowOpacity: 0.7,
    shadowDistance: 0,
    maxWordsPerLine: 3,
    bgRadius: 10,
    transition: 'Pop Up',
  },
  {
    ...BASE,
    id: 'karaoke_underline',
    category: 'karaoke',
    name: 'Spoken Word Underline',
    fontFamily: 'Plus Jakarta Sans',
    fontSize: 28,
    highlightColor: '#22d3ee',
    highlightMode: 'underline',
    highlightBg: '#22d3ee',
    strokeWidth: 2,
    shadowType: 'cinematic',
    shadowBlur: 12,
    shadowOpacity: 0.85,
    shadowDistance: 3,
    maxWordsPerLine: 4,
    transition: 'Fade In + Slide Up',
  },

  // ───────────────────────────── Viral Reels ─────────────────────────────
  {
    ...BASE,
    id: 'hormozi_punch',
    category: 'viral',
    name: 'Hormozi Viral Punch',
    fontFamily: 'Anton',
    fontSize: 34,
    highlightColor: '#facc15',
    highlightMode: 'color',
    strokeWidth: 5,
    shadowType: 'cinematic',
    shadowBlur: 16,
    shadowOpacity: 0.95,
    shadowDistance: 5,
    activeScale: 1.2,
    maxWordsPerLine: 3,
    transition: 'Pop Up',
  },
  {
    ...BASE,
    id: 'beast_bold',
    category: 'viral',
    name: 'MrBeast Bold Pop',
    fontFamily: 'Rubik',
    fontSize: 32,
    highlightColor: '#00e5ff',
    highlightMode: 'color',
    strokeWidth: 4.5,
    shadowType: 'hard',
    shadowBlur: 0,
    shadowOpacity: 1,
    shadowDistance: 5,
    activeScale: 1.18,
    maxWordsPerLine: 3,
    transition: 'Zoom Kinetic',
  },
  {
    ...BASE,
    id: 'tiktok_classic',
    category: 'viral',
    name: 'TikTok Classic Pill',
    fontFamily: 'Inter',
    fontSize: 24,
    color: '#ffffff',
    highlightColor: '#ffffff',
    highlightMode: 'none',
    backgroundColor: '#000000',
    borderStyle: 3,
    strokeWidth: 0,
    shadowType: 'none',
    shadowBlur: 0,
    shadowOpacity: 0,
    shadowDistance: 0,
    textTransform: 'none',
    karaoke: false,
    activeScale: 1,
    maxWordsPerLine: 5,
    bgPadding: 10,
    bgRadius: 8,
    transition: 'Fade In',
  },
  {
    ...BASE,
    id: 'neon_cyber',
    category: 'viral',
    name: 'Neon Cyber Glow',
    fontFamily: 'Syne',
    fontSize: 30,
    color: '#e0f7ff',
    highlightColor: '#ff2bd6',
    highlightMode: 'color',
    strokeWidth: 1.5,
    strokeColor: '#0b0b2a',
    shadowType: 'glow',
    shadowBlur: 24,
    shadowOpacity: 1,
    shadowDistance: 0,
    shadowColor: '#00e5ff',
    letterSpacing: 1.5,
    maxWordsPerLine: 3,
    transition: 'Zoom Kinetic',
  },
  {
    ...BASE,
    id: 'podcast_clean',
    category: 'viral',
    name: 'Podcast Clip Clean',
    fontFamily: 'Montserrat',
    fontSize: 27,
    highlightColor: '#4ade80',
    highlightMode: 'color',
    strokeWidth: 3,
    shadowType: 'cinematic',
    shadowBlur: 14,
    shadowOpacity: 0.9,
    shadowDistance: 4,
    maxWordsPerLine: 4,
    transition: 'Fade In + Slide Up',
  },
  {
    ...BASE,
    id: 'sports_impact',
    category: 'viral',
    name: 'Sports Impact Italic',
    fontFamily: 'Oswald',
    fontSize: 34,
    highlightColor: '#f97316',
    highlightMode: 'color',
    italic: true,
    strokeWidth: 4,
    shadowType: 'hard',
    shadowBlur: 0,
    shadowOpacity: 1,
    shadowDistance: 6,
    shadowColor: '#111111',
    letterSpacing: 1,
    activeScale: 1.2,
    maxWordsPerLine: 3,
    transition: 'Pop Up',
  },
  {
    ...BASE,
    id: 'luxe_gold',
    category: 'viral',
    name: 'Luxe Gold Serif',
    fontFamily: 'Playfair Display',
    fontSize: 30,
    color: '#f7e7b4',
    highlightColor: '#ffd700',
    highlightMode: 'color',
    strokeWidth: 1,
    strokeColor: '#3b2f0b',
    shadowType: 'glow',
    shadowBlur: 20,
    shadowOpacity: 0.8,
    shadowDistance: 0,
    shadowColor: '#ffb300',
    letterSpacing: 1,
    maxWordsPerLine: 3,
    transition: 'Fade In',
  },

  // ──────────────────────── Pinterest / Aesthetic ────────────────────────
  {
    ...BASE,
    id: 'pinterest_editorial',
    category: 'aesthetic',
    name: 'Editorial Serif Quote',
    fontFamily: 'Playfair Display',
    fontSize: 26,
    color: '#fffdf7',
    highlightColor: '#fffdf7',
    highlightMode: 'none',
    italic: true,
    strokeWidth: 0,
    shadowType: 'cinematic',
    shadowBlur: 18,
    shadowOpacity: 0.55,
    shadowDistance: 3,
    textTransform: 'none',
    letterSpacing: 0.5,
    lineHeight: 1.25,
    karaoke: false,
    activeScale: 1,
    maxWordsPerLine: 4,
    yPercent: 50,
    position: 'center',
    transition: 'Fade In',
  },
  {
    ...BASE,
    id: 'pinterest_wide_caps',
    category: 'aesthetic',
    name: 'Wide Spaced Minimal',
    fontFamily: 'Inter',
    fontSize: 20,
    color: '#ffffff',
    highlightColor: '#ffffff',
    highlightMode: 'none',
    strokeWidth: 0,
    shadowType: 'cinematic',
    shadowBlur: 12,
    shadowOpacity: 0.5,
    shadowDistance: 2,
    letterSpacing: 6,
    lineHeight: 1.5,
    karaoke: false,
    activeScale: 1,
    maxWordsPerLine: 3,
    transition: 'Fade In',
  },
  {
    ...BASE,
    id: 'soft_pastel',
    category: 'aesthetic',
    name: 'Soft Pastel Lowercase',
    fontFamily: 'Outfit',
    fontSize: 26,
    color: '#fff1f5',
    highlightColor: '#f9a8d4',
    highlightMode: 'color',
    strokeWidth: 0,
    shadowType: 'cinematic',
    shadowBlur: 16,
    shadowOpacity: 0.45,
    shadowDistance: 3,
    textTransform: 'lowercase',
    letterSpacing: 0.5,
    lineHeight: 1.2,
    activeScale: 1.08,
    maxWordsPerLine: 4,
    transition: 'Fade In + Slide Up',
  },
  {
    ...BASE,
    id: 'aesthetic_frosted',
    category: 'aesthetic',
    name: 'Frosted Caption Card',
    fontFamily: 'Plus Jakarta Sans',
    fontSize: 22,
    color: '#0f172a',
    highlightColor: '#0f172a',
    highlightMode: 'none',
    backgroundColor: 'rgba(255, 255, 255, 0.88)',
    borderStyle: 3,
    strokeWidth: 0,
    shadowType: 'cinematic',
    shadowBlur: 18,
    shadowOpacity: 0.4,
    shadowDistance: 4,
    textTransform: 'none',
    karaoke: false,
    activeScale: 1,
    lineHeight: 1.3,
    maxWordsPerLine: 5,
    bgPadding: 14,
    bgRadius: 16,
    transition: 'Fade In',
  },
  {
    ...BASE,
    id: 'vintage_film',
    category: 'aesthetic',
    name: 'Vintage Film Caption',
    fontFamily: 'Syne',
    fontSize: 24,
    color: '#f5e9d0',
    highlightColor: '#e8b04b',
    highlightMode: 'color',
    strokeWidth: 1,
    strokeColor: '#2b1d0e',
    shadowType: 'cinematic',
    shadowBlur: 10,
    shadowOpacity: 0.7,
    shadowDistance: 3,
    letterSpacing: 3,
    maxWordsPerLine: 4,
    transition: 'Fade In',
  },
  {
    ...BASE,
    id: 'cinema_minimal',
    category: 'aesthetic',
    name: 'Cinema Clean Minimal',
    fontFamily: 'Outfit',
    fontSize: 24,
    color: '#f8fafc',
    highlightColor: '#facc15',
    highlightMode: 'none',
    strokeWidth: 2.5,
    shadowType: 'cinematic',
    shadowBlur: 14,
    shadowOpacity: 0.85,
    shadowDistance: 4,
    textTransform: 'none',
    karaoke: false,
    activeScale: 1,
    maxWordsPerLine: 5,
    transition: 'None',
  },

  // ──────────────────── Inverted / Experimental Blends ────────────────────
  {
    ...BASE,
    id: 'inverted_diff',
    category: 'blend',
    name: 'Inverted Pixel Blend',
    fontFamily: 'Anton',
    fontSize: 34,
    color: '#ffffff',
    highlightColor: '#ffffff',
    highlightMode: 'none',
    mixBlendMode: 'difference',
    strokeWidth: 0,
    shadowType: 'none',
    shadowBlur: 0,
    shadowOpacity: 0,
    shadowDistance: 0,
    karaoke: false,
    activeScale: 1,
    letterSpacing: 0.5,
    maxWordsPerLine: 3,
    transition: 'Fade In + Slide Up',
  },
  {
    ...BASE,
    id: 'inverted_diff_karaoke',
    category: 'blend',
    name: 'Inverted Blend Karaoke',
    fontFamily: 'Bebas Neue',
    fontSize: 38,
    color: '#ffffff',
    highlightColor: '#ffd60a',
    highlightMode: 'color',
    mixBlendMode: 'difference',
    strokeWidth: 0,
    shadowType: 'none',
    shadowBlur: 0,
    shadowOpacity: 0,
    shadowDistance: 0,
    activeScale: 1.12,
    letterSpacing: 1,
    maxWordsPerLine: 3,
    transition: 'Fade In + Slide Up',
  },
  {
    ...BASE,
    id: 'knockout_box',
    category: 'blend',
    name: 'Knockout Cutout Box',
    fontFamily: 'Anton',
    fontSize: 32,
    color: '#ffffff',
    highlightColor: '#facc15',
    highlightMode: 'color',
    backgroundColor: '#000000',
    borderStyle: 3,
    strokeWidth: 0,
    shadowType: 'none',
    shadowBlur: 0,
    shadowOpacity: 0,
    shadowDistance: 0,
    maxWordsPerLine: 3,
    bgPadding: 12,
    bgRadius: 4,
    transition: 'Pop Up',
  },
  {
    ...BASE,
    id: 'mirrored_flip',
    category: 'blend',
    name: 'Mirrored / Flipped',
    fontFamily: 'Anton',
    fontSize: 30,
    highlightColor: '#facc15',
    highlightMode: 'color',
    flipH: true,
    strokeWidth: 3.5,
    shadowType: 'cinematic',
    shadowBlur: 14,
    shadowOpacity: 0.9,
    shadowDistance: 4,
    maxWordsPerLine: 3,
    transition: 'Pop Up',
  },
];

/** Strips picker-only metadata so applying a template never pollutes styleConfig. */
export function templateToStyle(tpl) {
  const { id: _id, name: _name, category: _category, ...style } = tpl;
  return style;
}

export function hexToRgba(hex, alpha = 1) {
  if (typeof hex !== 'string') return `rgba(0,0,0,${alpha})`;
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return hex;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function applyTextTransform(text, transform) {
  const t = text || '';
  if (transform === 'lowercase') return t.toLowerCase();
  if (transform === 'capitalize') return t.replace(/\b\w/g, (ch) => ch.toUpperCase());
  if (transform === 'none') return t;
  return t.toUpperCase();
}

/** CSS `filter` implementing the shadow/glow VFX for a caption block. */
export function buildShadowFilter(style) {
  const type = style.shadowType || 'cinematic';
  const blur = style.shadowBlur ?? 14;
  const dist = style.shadowDistance ?? 4;
  const opacity = style.shadowOpacity ?? 0.9;
  const color = style.shadowColor || '#000000';

  if (type === 'none') return 'none';
  if (type === 'glow') {
    return `drop-shadow(0 0 ${blur}px ${hexToRgba(color, opacity)}) drop-shadow(0 0 ${blur * 1.9}px ${hexToRgba(color, opacity * 0.65)})`;
  }
  if (type === 'hard') {
    return `drop-shadow(${dist}px ${dist}px 0 ${hexToRgba(color, opacity)})`;
  }
  return `drop-shadow(0 ${dist}px ${blur}px ${hexToRgba(color, opacity)}) drop-shadow(0 ${dist * 1.5}px ${blur * 1.6}px ${hexToRgba(color, opacity * 0.6)})`;
}

/**
 * CSS for one word span. `isActive` is the karaoke word currently being spoken,
 * `isKeyword` is a manually pinned emphasis word.
 */
export function buildWordStyle(style, { isActive = false, isKeyword = false } = {}) {
  const mode = style.highlightMode || 'color';
  const emphasised = (isActive && style.karaoke !== false) || isKeyword;
  const strokeWidth = style.strokeWidth ?? 3.5;

  const css = {
    display: 'inline-block',
    color: style.color || '#ffffff',
    fontStyle: style.italic ? 'italic' : 'normal',
    letterSpacing: `${style.letterSpacing ?? 0}px`,
    WebkitTextStroke: strokeWidth > 0 ? `${strokeWidth}px ${style.strokeColor || '#000000'}` : '0',
    paintOrder: 'stroke fill',
    WebkitFontSmoothing: 'antialiased',
    textRendering: 'optimizeLegibility',
    transition: 'transform 90ms ease-out, color 90ms linear',
    transform: 'scale(1)',
  };

  // A font pairing swaps the family on the emphasised word. CSS keeps mixed
  // families on the shared line baseline, so only the glyphs change.
  if (emphasised && style.accentFontFamily && style.accentFontFamily !== style.fontFamily) {
    css.fontFamily = style.accentFontFamily;
  }

  if (!emphasised || mode === 'none') return css;

  if (mode === 'box') {
    css.color = style.highlightTextColor || '#0b0b0b';
    css.backgroundColor = style.highlightBg || '#facc15';
    css.borderRadius = `${style.bgRadius ?? 8}px`;
    css.padding = '0.02em 0.22em';
    css.WebkitTextStroke = '0';
  } else if (mode === 'underline') {
    css.color = style.highlightColor || '#facc15';
    css.boxShadow = `inset 0 -0.16em 0 ${style.highlightBg || style.highlightColor || '#facc15'}`;
  } else {
    css.color = style.highlightColor || '#facc15';
  }

  if (isActive && style.karaoke !== false) {
    css.transform = `scale(${style.activeScale ?? 1.14})`;
  }
  return css;
}

/** Chunks words into fixed-width rows so captions stack like Reels cards. */
export function groupWordsIntoLines(words, maxWordsPerLine) {
  const per = Math.max(1, Number(maxWordsPerLine) || 3);
  const lines = [];
  for (let i = 0; i < words.length; i += per) {
    lines.push(words.slice(i, i + per));
  }
  return lines.length ? lines : [[]];
}
