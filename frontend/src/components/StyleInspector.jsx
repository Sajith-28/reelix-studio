/**
 * SUBLYX — Style Inspector Component
 * Right panel inspector with font selectors, the template library, transitions, and AI Magic
 */

import { useState } from 'react';
import {
  TEMPLATE_PRESETS,
  TEMPLATE_CATEGORIES,
  FONT_LIBRARY,
  FONT_CATEGORIES,
  WEIGHT_LABELS,
  fontInfo,
  nearestFontWeight,
  templateToStyle,
  buildShadowFilter,
  buildWordStyle,
  applyTextTransform,
} from '../lib/captionStyle';
import {
  NEGATIVE_VARIANTS,
  NEGATIVE_PRESETS,
  NEGATIVE_FALLBACKS,
  NEGATIVE_EASINGS,
  NEGATIVE_DEFAULTS,
  transitionToPreset,
} from '../lib/negativeText';

const QUICK_COLORS = [
  { name: 'Gold', hex: '#facc15' },
  { name: 'Emerald', hex: '#10b981' },
  { name: 'Cyan', hex: '#00e5ff' },
  { name: 'Pink', hex: '#ec4899' },
  { name: 'White', hex: '#ffffff' },
  { name: 'Orange', hex: '#fb923c' },
  { name: 'Red', hex: '#ef4444' },
  { name: 'Purple', hex: '#a855f7' },
];

export default function StyleInspector({
  styleConfig,
  onUpdateStyle,
  onUpdateStyleBatch,
  onApplyTemplate,
  onAutoHighlightAll,
  onAutoSplitLong,
  onUppercaseAll,
}) {
  const [activeTab, setActiveTab] = useState('Text'); // Text, VFX & Shadow, Negative, Templates, Transitions, AI Magic
  const [templateCategory, setTemplateCategory] = useState('all');
  const [magicNotice, setMagicNotice] = useState(null);

  const isNegative = styleConfig.renderer === 'negative';
  const updateMany = (updates) => {
    if (onUpdateStyleBatch) onUpdateStyleBatch(updates);
    else Object.entries(updates).forEach(([k, v]) => onUpdateStyle(k, v));
  };
  // The legacy transition picker keeps working on Negative Nano by mapping onto
  // the equivalent mask-driven IN preset.
  const setTransition = (id) => {
    const preset = isNegative ? transitionToPreset(id) : null;
    updateMany(preset ? { transition: id, inPreset: preset } : { transition: id });
  };
  const tabs = ['Text', 'VFX & Shadow', ...(isNegative ? ['Negative'] : []), 'Templates', 'Transitions', 'AI Magic'];

  const visibleTemplates =
    templateCategory === 'all'
      ? TEMPLATE_PRESETS
      : TEMPLATE_PRESETS.filter((t) => t.category === templateCategory);
  const activeCategoryHint = TEMPLATE_CATEGORIES.find((c) => c.id === templateCategory)?.hint;

  const triggerNotice = (msg) => {
    setMagicNotice(msg);
    setTimeout(() => setMagicNotice(null), 2500);
  };

  return (
    <aside className="w-80 bg-slate-900 border-l border-slate-800 flex flex-col shrink-0 overflow-hidden select-none">
      {/* Tab Navigation Bar */}
      <div className="flex border-b border-slate-800 bg-slate-950/60 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-3 text-xs font-bold transition-all cursor-pointer border-b-2 shrink-0 whitespace-nowrap ${
              activeTab === tab
                ? 'border-emerald-400 text-emerald-400 bg-slate-900'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab Content Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {activeTab === 'Text' && (
          <>
            {/* Font picker: every family on disk, drawn in its own face, with the weights it really ships */}
            <FontPicker styleConfig={styleConfig} onUpdateStyle={onUpdateStyle} updateMany={updateMany} />

            {/* Font Size Slider */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Font Size
                </label>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => onUpdateStyle('fontSize', Math.max(12, (styleConfig.fontSize || 28) - 2))}
                    className="w-5 h-5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center text-xs font-bold"
                  >
                    -
                  </button>
                  <span className="text-xs font-mono text-emerald-400 font-bold min-w-[36px] text-center">
                    {styleConfig.fontSize || 28} px
                  </span>
                  <button
                    onClick={() => onUpdateStyle('fontSize', Math.min(96, (styleConfig.fontSize || 28) + 2))}
                    className="w-5 h-5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center text-xs font-bold"
                  >
                    +
                  </button>
                </div>
              </div>
              <input
                type="range"
                min="12"
                max="96"
                value={styleConfig.fontSize || 28}
                onChange={(e) => onUpdateStyle('fontSize', parseInt(e.target.value))}
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-400"
              />
            </div>

            {/* Position Controls & Presets */}
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Text Position (Drag on Video or Adjust)
                </label>
              </div>

              {/* Quick Presets */}
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => {
                    onUpdateStyle('position', 'top');
                    onUpdateStyle('xPercent', 50);
                    onUpdateStyle('yPercent', 15);
                  }}
                  className={`py-1.5 text-xs font-bold rounded-lg border transition-all cursor-pointer ${
                    (styleConfig.yPercent ?? 82) <= 25
                      ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500'
                      : 'bg-slate-800 text-slate-400 border-slate-700/60 hover:text-slate-200'
                  }`}
                >
                  ⬆ Top (15%)
                </button>
                <button
                  onClick={() => {
                    onUpdateStyle('position', 'center');
                    onUpdateStyle('xPercent', 50);
                    onUpdateStyle('yPercent', 50);
                  }}
                  className={`py-1.5 text-xs font-bold rounded-lg border transition-all cursor-pointer ${
                    (styleConfig.yPercent ?? 82) > 25 && (styleConfig.yPercent ?? 82) < 70
                      ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500'
                      : 'bg-slate-800 text-slate-400 border-slate-700/60 hover:text-slate-200'
                  }`}
                >
                  🎯 Center (50%)
                </button>
                <button
                  onClick={() => {
                    onUpdateStyle('position', 'bottom');
                    onUpdateStyle('xPercent', 50);
                    onUpdateStyle('yPercent', 82);
                  }}
                  className={`py-1.5 text-xs font-bold rounded-lg border transition-all cursor-pointer ${
                    (styleConfig.yPercent ?? 82) >= 70
                      ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500'
                      : 'bg-slate-800 text-slate-400 border-slate-700/60 hover:text-slate-200'
                  }`}
                >
                  ⬇ Reels Safe (82%)
                </button>
              </div>

              {/* Vertical Y-Position Slider */}
              <div>
                <div className="flex justify-between items-center mb-1 text-[11px] text-slate-400 font-mono">
                  <span>Vertical Position (Y)</span>
                  <span className="text-emerald-400 font-bold">{styleConfig.yPercent ?? 82}%</span>
                </div>
                <input
                  type="range"
                  min="8"
                  max="92"
                  value={styleConfig.yPercent ?? 82}
                  onChange={(e) => {
                    onUpdateStyle('yPercent', parseInt(e.target.value));
                    onUpdateStyle('position', 'custom');
                  }}
                  className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-400"
                />
              </div>

              {/* Horizontal X-Position Slider */}
              <div>
                <div className="flex justify-between items-center mb-1 text-[11px] text-slate-400 font-mono">
                  <span>Horizontal Position (X)</span>
                  <span className="text-emerald-400 font-bold">{styleConfig.xPercent ?? 50}%</span>
                </div>
                <input
                  type="range"
                  min="10"
                  max="90"
                  value={styleConfig.xPercent ?? 50}
                  onChange={(e) => {
                    onUpdateStyle('xPercent', parseInt(e.target.value));
                    onUpdateStyle('position', 'custom');
                  }}
                  className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-400"
                />
              </div>
            </div>

            {/* Highlight Keyword Color */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider">
                Keyword Highlight Color
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={styleConfig.highlightColor || '#facc15'}
                  onChange={(e) => onUpdateStyle('highlightColor', e.target.value)}
                  className="w-8 h-8 rounded-lg cursor-pointer bg-transparent border-0"
                />
                <div className="flex-1 flex gap-1.5 overflow-x-auto py-1">
                  {QUICK_COLORS.map((c) => (
                    <button
                      key={c.hex}
                      onClick={() => onUpdateStyle('highlightColor', c.hex)}
                      className="w-6 h-6 rounded-md border border-slate-700 hover:scale-110 transition-transform cursor-pointer shrink-0"
                      style={{ backgroundColor: c.hex }}
                      title={c.name}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Base Text Color */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider">
                Base Text Color
              </label>
              <div className="flex items-center justify-between bg-slate-800/60 p-2.5 rounded-lg border border-slate-700/50">
                <span className="text-xs text-slate-300 font-medium">Text Color</span>
                <input
                  type="color"
                  value={styleConfig.color}
                  onChange={(e) => onUpdateStyle('color', e.target.value)}
                  className="w-7 h-7 rounded cursor-pointer bg-transparent border-0"
                />
              </div>
            </div>

            {/* Background Style */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider">
                Background Box
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => onUpdateStyle('backgroundColor', 'transparent')}
                  className={`py-2 text-xs font-bold rounded-lg border transition-all cursor-pointer ${
                    styleConfig.backgroundColor === 'transparent'
                      ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500'
                      : 'bg-slate-800 text-slate-400 border-slate-700/60'
                  }`}
                >
                  Transparent
                </button>
                <button
                  onClick={() => onUpdateStyle('backgroundColor', 'rgba(15, 23, 42, 0.85)')}
                  className={`py-2 text-xs font-bold rounded-lg border transition-all cursor-pointer ${
                    styleConfig.backgroundColor !== 'transparent'
                      ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500'
                      : 'bg-slate-800 text-slate-400 border-slate-700/60'
                  }`}
                >
                  Dark Pill Box
                </button>
              </div>
            </div>
          </>
        )}

        {activeTab === 'VFX & Shadow' && (
          <div className="space-y-5">
            {/* Stroke / Outline Section */}
            <div className="space-y-3 p-3.5 bg-slate-800/60 rounded-xl border border-slate-700/60">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
                  🖋️ Vector Stroke (Outline)
                </label>
                <span className="text-xs font-mono text-emerald-300 font-bold">
                  {styleConfig.strokeWidth ?? 3.5}px
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Smooth vector stroke rendered behind glyphs with anti-aliasing (no pixelated jagged artifacts).
              </p>

              {/* Stroke Width Slider */}
              <input
                type="range"
                min="0"
                max="8"
                step="0.5"
                value={styleConfig.strokeWidth ?? 3.5}
                onChange={(e) => onUpdateStyle('strokeWidth', parseFloat(e.target.value))}
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-400"
              />

              {/* Stroke Color */}
              <div className="flex items-center justify-between pt-1">
                <span className="text-xs text-slate-300 font-medium">Stroke Color</span>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={styleConfig.strokeColor || '#000000'}
                    onChange={(e) => onUpdateStyle('strokeColor', e.target.value)}
                    className="w-7 h-7 rounded cursor-pointer bg-transparent border-0"
                  />
                  <button
                    onClick={() => onUpdateStyle('strokeColor', '#000000')}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700 text-slate-300 font-bold"
                  >
                    Black
                  </button>
                  <button
                    onClick={() => onUpdateStyle('strokeColor', '#ffffff')}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700 text-slate-300 font-bold"
                  >
                    White
                  </button>
                </div>
              </div>
            </div>

            {/* Cinematic Blur Shadow & Glow Section */}
            <div className="space-y-4 p-3.5 bg-slate-800/60 rounded-xl border border-slate-700/60">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-cyan-400 uppercase tracking-wider">
                  🌌 Blur Shadow & Glow VFX
                </label>
              </div>

              {/* Shadow Style Selector */}
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'cinematic', label: '🎬 Cinematic Blur' },
                  { id: 'glow', label: '✨ Neon Halo Glow' },
                  { id: 'hard', label: '💥 Bold Pop' },
                  { id: 'none', label: '🚫 No Shadow' },
                ].map((st) => (
                  <button
                    key={st.id}
                    onClick={() => onUpdateStyle('shadowType', st.id)}
                    className={`py-2 px-2 text-left text-xs font-bold rounded-lg border transition-all cursor-pointer ${
                      (styleConfig.shadowType || 'cinematic') === st.id
                        ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500 shadow-sm'
                        : 'bg-slate-800 text-slate-400 border-slate-700/60 hover:text-slate-200'
                    }`}
                  >
                    {st.label}
                  </button>
                ))}
              </div>

              {/* Blur Radius Slider */}
              <div>
                <div className="flex justify-between items-center mb-1 text-[11px] text-slate-400 font-mono">
                  <span>Gaussian Blur Radius</span>
                  <span className="text-cyan-400 font-bold">{styleConfig.shadowBlur ?? 14}px</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="30"
                  value={styleConfig.shadowBlur ?? 14}
                  onChange={(e) => onUpdateStyle('shadowBlur', parseInt(e.target.value))}
                  className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                />
              </div>

              {/* Shadow Distance Slider */}
              <div>
                <div className="flex justify-between items-center mb-1 text-[11px] text-slate-400 font-mono">
                  <span>Shadow Distance (Y Offset)</span>
                  <span className="text-cyan-400 font-bold">{styleConfig.shadowDistance ?? 4}px</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="20"
                  value={styleConfig.shadowDistance ?? 4}
                  onChange={(e) => onUpdateStyle('shadowDistance', parseInt(e.target.value))}
                  className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                />
              </div>

              {/* Shadow Opacity Slider */}
              <div>
                <div className="flex justify-between items-center mb-1 text-[11px] text-slate-400 font-mono">
                  <span>Shadow Opacity</span>
                  <span className="text-cyan-400 font-bold">{Math.round((styleConfig.shadowOpacity ?? 0.9) * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={styleConfig.shadowOpacity ?? 0.9}
                  onChange={(e) => onUpdateStyle('shadowOpacity', parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                />
              </div>

              {/* Shadow Color */}
              <div className="flex items-center justify-between pt-1">
                <span className="text-xs text-slate-300 font-medium">Shadow Color</span>
                <input
                  type="color"
                  value={styleConfig.shadowColor || '#000000'}
                  onChange={(e) => onUpdateStyle('shadowColor', e.target.value)}
                  className="w-7 h-7 rounded cursor-pointer bg-transparent border-0"
                />
              </div>
            </div>

            {/* Kinetic Animation & Transition Section */}
            <div className="space-y-3 p-3.5 bg-slate-800/60 rounded-xl border border-slate-700/60">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-amber-400 uppercase tracking-wider">
                  🎬 Subtitle Transition & Motion
                </label>
              </div>
              <p className="text-[11px] text-slate-400">
                Choose entry kinetic animation for seamless Reels presentation.
              </p>

              <div className="grid grid-cols-1 gap-2">
                {[
                  { id: 'Fade In + Slide Up', label: '✨ Fade In + Slide Up (Seamless)' },
                  { id: 'Pop Up', label: '💥 Pop Up Kinetic' },
                  { id: 'Zoom Kinetic', label: '⚡ Zoom Kinetic' },
                  { id: 'Fade In', label: '🌫️ Smooth Fade In' },
                  { id: 'None', label: '🚫 Instant (No Animation)' },
                ].map((tr) => (
                  <button
                    key={tr.id}
                    onClick={() => setTransition(tr.id)}
                    className={`py-2 px-3 text-left text-xs font-bold rounded-lg border transition-all cursor-pointer flex items-center justify-between ${
                      (styleConfig.transition || 'Fade In + Slide Up') === tr.id
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500 shadow-sm'
                        : 'bg-slate-800 text-slate-400 border-slate-700/60 hover:text-slate-200'
                    }`}
                  >
                    <span>{tr.label}</span>
                    {(styleConfig.transition || 'Fade In + Slide Up') === tr.id && (
                      <span className="w-2 h-2 rounded-full bg-amber-400" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'Negative' && isNegative && (
          <NegativePanel styleConfig={styleConfig} onUpdateStyle={onUpdateStyle} updateMany={updateMany} />
        )}

        {activeTab === 'Templates' && (
          <div className="space-y-3">
            {/* Category Filter Chips */}
            <div className="flex flex-wrap gap-1.5">
              {[{ id: 'all', label: 'All' }, ...TEMPLATE_CATEGORIES].map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setTemplateCategory(cat.id)}
                  className={`px-2.5 py-1 rounded-full text-[10px] font-bold border transition-all cursor-pointer ${
                    templateCategory === cat.id
                      ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                      : 'bg-slate-800 text-slate-400 border-slate-700/60 hover:text-slate-200'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            {activeCategoryHint && (
              <p className="text-[11px] text-slate-400 leading-snug">{activeCategoryHint}</p>
            )}

            {visibleTemplates.map((tpl) => {
              const isSelectedTpl = styleConfig.templateId === tpl.id;
              return (
                <div
                  key={tpl.id}
                  onClick={() => onApplyTemplate({ ...templateToStyle(tpl), templateId: tpl.id })}
                  className={`p-2.5 bg-slate-800/70 hover:bg-slate-800 border rounded-xl transition-all cursor-pointer group ${
                    isSelectedTpl
                      ? 'border-emerald-500 ring-1 ring-emerald-500/40 shadow-md'
                      : 'border-slate-700/60 hover:border-emerald-500/70'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2 gap-2">
                    <div className="text-[11px] font-bold text-slate-200 group-hover:text-emerald-400 truncate">
                      {tpl.name}
                    </div>
                    {isSelectedTpl && (
                      <span className="text-[9px] font-bold text-emerald-400 shrink-0">ACTIVE</span>
                    )}
                  </div>

                  <TemplateThumbnail tpl={tpl} />

                  <div className="flex items-center justify-between text-[9px] text-slate-500 font-mono mt-1.5 gap-2">
                    <span className="truncate">{tpl.fontFamily}</span>
                    <span className="shrink-0">
                      {tpl.renderer === 'negative'
                        ? `negative · ${tpl.variant.replace('negative-', '')}`
                        : `${tpl.karaoke ? 'karaoke' : 'static'} · ${tpl.highlightMode}`}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {activeTab === 'Transitions' && (
          <div className="space-y-2.5">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
              Caption Transitions
            </div>
            {['Pop Up', 'Zoom Kinetic', 'Fade In', 'Slide Up', 'None'].map((tr) => (
              <button
                key={tr}
                onClick={() => setTransition(tr)}
                className={`w-full p-3 rounded-xl text-left text-xs font-bold border transition-all cursor-pointer flex items-center justify-between ${
                  (styleConfig.transition || 'Pop Up') === tr
                    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500 shadow-sm'
                    : 'bg-slate-800/80 hover:bg-slate-800 border-slate-700/60 text-slate-200'
                }`}
              >
                <span>{tr}</span>
                {(styleConfig.transition || 'Pop Up') === tr && <span>✓</span>}
              </button>
            ))}
          </div>
        )}

        {activeTab === 'AI Magic' && (
          <div className="space-y-4">
            {magicNotice && (
              <div className="bg-emerald-500/20 border border-emerald-500/50 text-emerald-300 px-3 py-2 rounded-lg text-xs font-bold text-center animate-bounce">
                {magicNotice}
              </div>
            )}

            <div className="bg-emerald-500/10 border border-emerald-500/20 p-3.5 rounded-xl space-y-3">
              <div>
                <div className="text-xs font-bold text-emerald-400 uppercase tracking-wider mb-1">
                  ✨ Auto-Highlight Viral Keywords
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Scans all lines and tags high-impact emphasis words for neon kinetic highlight.
                </p>
                <button
                  onClick={() => {
                    onAutoHighlightAll();
                    triggerNotice('✨ All keywords auto-highlighted!');
                  }}
                  className="mt-2 w-full py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-lg text-xs transition-all cursor-pointer shadow-md"
                >
                  Highlight All Keywords
                </button>
              </div>
            </div>

            <div className="bg-slate-800/60 border border-slate-700/60 p-3.5 rounded-xl space-y-3">
              <div>
                <div className="text-xs font-bold text-amber-400 uppercase tracking-wider mb-1">
                  ✂️ Auto-Split Long Lines
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Splits any sentence with more than 3 words into fast 1-2 word Instagram Reels cards.
                </p>
                <button
                  onClick={() => {
                    onAutoSplitLong();
                    triggerNotice('✂️ Long lines split into Reels units!');
                  }}
                  className="mt-2 w-full py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 font-bold rounded-lg text-xs transition-all cursor-pointer"
                >
                  Auto-Split Captions
                </button>
              </div>
            </div>

            <div className="bg-slate-800/60 border border-slate-700/60 p-3.5 rounded-xl space-y-3">
              <div>
                <div className="text-xs font-bold text-cyan-400 uppercase tracking-wider mb-1">
                  🔤 Make Text UPPERCASE
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Converts all captions to bold uppercase format for viral creator style.
                </p>
                <button
                  onClick={() => {
                    onUppercaseAll();
                    triggerNotice('🔤 Converted to UPPERCASE!');
                  }}
                  className="mt-2 w-full py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 font-bold rounded-lg text-xs transition-all cursor-pointer"
                >
                  UPPERCASE All Captions
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}


/**
 * Miniature live render of a template, drawn with the same style helpers the
 * video overlay uses. The middle word is shown in its "currently spoken" state
 * so karaoke boxes and highlight colours are visible before you apply it.
 */
function TemplateThumbnail({ tpl }) {
  const words = ['MAKE', 'IT', 'VIRAL'];
  const hasCard = tpl.borderStyle === 3 && tpl.backgroundColor && tpl.backgroundColor !== 'transparent';

  return (
    <div className="relative h-[70px] rounded-lg overflow-hidden border border-slate-800 flex items-center justify-center bg-[linear-gradient(125deg,#1d2b4a_0%,#6b4b8a_45%,#c98a5b_100%)]">
      {/* Faux subject shape so difference-blend templates read correctly */}
      <div className="absolute inset-y-0 left-1/2 w-14 -translate-x-1/2 bg-slate-100/25 blur-[2px]" />

      <div
        className="relative z-10 text-center px-1"
        style={{
          fontFamily: tpl.fontFamily,
          fontWeight: nearestFontWeight(tpl.fontFamily, tpl.fontWeight),
          fontStyle: tpl.italic ? 'italic' : 'normal',
          fontSynthesisWeight: 'none',
          fontSize: '13px',
          lineHeight: tpl.lineHeight ?? 1.05,
          mixBlendMode: tpl.renderer === 'negative' ? 'difference' : (tpl.mixBlendMode || 'normal'),
          transform: tpl.flipH ? 'scaleX(-1)' : 'none',
          backgroundColor: hasCard ? tpl.backgroundColor : 'transparent',
          borderRadius: hasCard ? `${Math.round((tpl.bgRadius ?? 0) * 0.6)}px` : 0,
          padding: hasCard ? '4px 8px' : 0,
          filter: buildShadowFilter({ ...tpl, shadowBlur: (tpl.shadowBlur ?? 14) * 0.45, shadowDistance: (tpl.shadowDistance ?? 4) * 0.45 }),
        }}
      >
        <div className="flex flex-wrap justify-center items-center gap-x-1 gap-y-0.5">
          {words.map((w, i) => (
            <span
              key={w}
              style={{
                ...buildWordStyle(tpl, { isActive: i === 1 }),
                WebkitTextStroke:
                  (tpl.strokeWidth ?? 0) > 0 && !(i === 1 && tpl.highlightMode === 'box')
                    ? `${Math.max(0.5, (tpl.strokeWidth ?? 0) * 0.45)}px ${tpl.strokeColor || '#000000'}`
                    : '0',
              }}
            >
              {applyTextTransform(w, tpl.textTransform)}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}


/**
 * Controls for the Negative Nano renderer. Font, size and position live in the
 * Text tab; stroke / shadow / glow / pill in VFX & Shadow — all of them apply
 * to this template too. This panel owns the negative-specific parameters.
 */
function NegativePanel({ styleConfig, onUpdateStyle, updateMany }) {
  const v = (key) => styleConfig[key] ?? NEGATIVE_DEFAULTS[key];
  const chip = (active, tone = 'emerald') =>
    `py-2 px-2 text-left text-xs font-bold rounded-lg border transition-all cursor-pointer ${
      active ? CHIP_ACTIVE[tone] : 'bg-slate-800 text-slate-400 border-slate-700/60 hover:text-slate-200'
    }`;

  const slider = ({ label, k, min, max, step, unit, fmt }) => (
    <div key={k}>
      <div className="flex justify-between items-center mb-1 text-[11px] text-slate-400 font-mono">
        <span>{label}</span>
        <span className="text-emerald-400 font-bold">{fmt ? fmt(v(k)) : `${v(k)}${unit || ''}`}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={v(k)}
        onChange={(e) => onUpdateStyle(k, parseFloat(e.target.value))}
        className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-400"
      />
    </div>
  );

  const toggle = ({ label, k, hint }) => (
    <label key={k} className="flex items-center justify-between bg-slate-800/60 p-2.5 rounded-lg border border-slate-700/50 cursor-pointer">
      <span>
        <span className="text-xs text-slate-200 font-medium block">{label}</span>
        {hint && <span className="text-[10px] text-slate-500 block">{hint}</span>}
      </span>
      <input
        type="checkbox"
        checked={!!v(k)}
        onChange={(e) => onUpdateStyle(k, e.target.checked)}
        className="accent-emerald-400 w-4 h-4 cursor-pointer"
      />
    </label>
  );

  return (
    <div className="space-y-5">
      <div className="p-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 text-[11px] text-slate-300 leading-snug">
        Glyphs show the true per-pixel negative of the footage underneath — every frame, any font.
        Font, size and position are in <b>Text</b>; stroke, shadow, glow and the pill box in <b>VFX &amp; Shadow</b>.
      </div>

      {/* Variant */}
      <div className="space-y-2">
        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider">Variant</label>
        <div className="grid grid-cols-2 gap-2">
          {NEGATIVE_VARIANTS.map((opt) => (
            <button key={opt.id} onClick={() => onUpdateStyle('variant', opt.id)} className={chip(v('variant') === opt.id)} title={opt.hint}>
              {opt.label}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-slate-500">{NEGATIVE_VARIANTS.find((o) => o.id === v('variant'))?.hint}</p>
      </div>

      {/* In / Out presets */}
      {[
        { k: 'inPreset', label: 'In Animation', tone: 'emerald' },
        { k: 'outPreset', label: 'Out Animation', tone: 'amber' },
      ].map(({ k, label, tone }) => (
        <div key={k} className="space-y-2">
          <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider">{label}</label>
          <div className="grid grid-cols-3 gap-1.5">
            {NEGATIVE_PRESETS.map((p) => (
              <button key={p.id} onClick={() => onUpdateStyle(k, p.id)} className={chip(v(k) === p.id, tone)} title={p.hint}>
                {p.label}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-slate-500">{NEGATIVE_PRESETS.find((p) => p.id === v(k))?.hint}</p>
        </div>
      ))}
      {v('variant') === 'negative-sweep' && (
        <p className="text-[10px] text-amber-300/90 -mt-3">Sweep variant: the band sweep is the IN animation; the IN preset is ignored.</p>
      )}

      {/* Timing */}
      <div className="space-y-3 p-3.5 bg-slate-800/60 rounded-xl border border-slate-700/60">
        <label className="text-xs font-bold text-emerald-400 uppercase tracking-wider">⏱ Timing (frame-accurate)</label>
        {slider({ label: 'In duration', k: 'inDuration', min: 0, max: 1.5, step: 0.02, fmt: (x) => `${Number(x).toFixed(2)}s` })}
        {slider({ label: 'Out duration', k: 'outDuration', min: 0, max: 1.5, step: 0.02, fmt: (x) => `${Number(x).toFixed(2)}s` })}
        {slider({ label: 'Hold (0 = until caption ends)', k: 'holdDuration', min: 0, max: 5, step: 0.1, fmt: (x) => (x > 0 ? `${Number(x).toFixed(1)}s` : 'caption') })}
        {slider({ label: 'Stagger per char / word', k: 'stagger', min: 0, max: 120, step: 5, unit: 'ms' })}
        {slider({ label: 'Start offset', k: 'startTime', min: -0.5, max: 1, step: 0.02, fmt: (x) => `${Number(x) >= 0 ? '+' : ''}${Number(x).toFixed(2)}s` })}
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-slate-400 font-mono">Easing</span>
          <select
            value={v('easing')}
            onChange={(e) => onUpdateStyle('easing', e.target.value)}
            className="bg-slate-800 border border-slate-700 text-slate-200 text-xs font-bold rounded-lg px-2 py-1 focus:outline-none cursor-pointer"
          >
            {NEGATIVE_EASINGS.map((e) => (
              <option key={e} value={e}>{e === 'auto' ? 'auto (per preset)' : e}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Readability */}
      <div className="space-y-2 p-3.5 bg-slate-800/60 rounded-xl border border-slate-700/60">
        <label className="text-xs font-bold text-cyan-400 uppercase tracking-wider">👁 Mid-gray safeguard</label>
        <p className="text-[11px] text-slate-400">
          Luminance under the text is sampled every few frames and smoothed. Around 50% gray the negative
          looks like the original, so the chosen fallback ramps in.
        </p>
        <div className="grid grid-cols-3 gap-1.5">
          {NEGATIVE_FALLBACKS.map((f) => (
            <button key={f.id} onClick={() => onUpdateStyle('lowContrastFallback', f.id)} className={chip(v('lowContrastFallback') === f.id, 'cyan')} title={f.hint}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Typography */}
      <div className="space-y-3 p-3.5 bg-slate-800/60 rounded-xl border border-slate-700/60">
        <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">Aa Typography</label>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => onUpdateStyle('textTransform', 'uppercase')} className={chip((styleConfig.textTransform || 'uppercase') === 'uppercase')}>UPPERCASE</button>
          <button onClick={() => onUpdateStyle('textTransform', 'none')} className={chip(styleConfig.textTransform === 'none')}>As spoken</button>
        </div>
        {slider({ label: 'Letter spacing', k: 'letterSpacing', min: -2, max: 12, step: 0.5, unit: 'px' })}
        {slider({ label: 'Max words per line', k: 'maxWordsPerLine', min: 1, max: 6, step: 1 })}
        {slider({ label: 'Auto-fit width (safe area)', k: 'maxWidthPct', min: 50, max: 95, step: 1, unit: '%' })}
        <button
          onClick={() => updateMany({ xPercent: 50, yPercent: 72, position: 'custom', maxWidthPct: 85 })}
          className="w-full py-1.5 text-xs font-bold rounded-lg border bg-slate-800 text-slate-300 border-slate-700/60 hover:text-emerald-300 cursor-pointer"
        >
          Reset to Shorts / Reels safe area
        </button>
      </div>

      <div className="space-y-2">
        {toggle({ label: 'Typewriter cursor', k: 'typewriterCursor', hint: 'Only for the Typewriter preset' })}
        {toggle({ label: 'Opacity fade (opt-in)', k: 'opacityFade', hint: 'Also fades the mask — passes through flat gray at 50%' })}
      </div>
    </div>
  );
}

// Tailwind needs the full class strings in source to generate them.
const CHIP_ACTIVE = {
  emerald: 'bg-emerald-500/20 text-emerald-300 border-emerald-500 shadow-sm',
  amber: 'bg-amber-500/20 text-amber-300 border-amber-500 shadow-sm',
  cyan: 'bg-cyan-500/20 text-cyan-300 border-cyan-500 shadow-sm',
};


/**
 * Font picker. Families come from fontLibrary.json (generated from the font
 * files), each drawn in its own face; the weight row only offers weights the
 * family really ships, so the export always finds the identical file.
 */
function FontPicker({ styleConfig, onUpdateStyle, updateMany }) {
  const current = fontInfo(styleConfig.fontFamily);
  const [category, setCategory] = useState(current?.category || FONT_CATEGORIES[0]?.id);
  const visible = FONT_LIBRARY.filter((f) => f.category === category);
  const weight = nearestFontWeight(styleConfig.fontFamily, styleConfig.fontWeight);
  const chip = (active, tone = 'emerald') =>
    `px-2 py-1 rounded-md text-[10px] font-bold border transition-all cursor-pointer ${
      active ? CHIP_ACTIVE[tone] : 'bg-slate-800 text-slate-400 border-slate-700/60 hover:text-slate-200'
    }`;

  const pick = (f) => {
    updateMany({ fontFamily: f.family, fontWeight: nearestFontWeight(f.family, styleConfig.fontWeight || f.defaultWeight) });
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Font</label>
        <span className="text-[10px] font-mono text-emerald-400 truncate max-w-[55%]" title={styleConfig.fontFamily}>
          {styleConfig.fontFamily} · {WEIGHT_LABELS[weight] || weight}{styleConfig.italic ? ' Italic' : ''}
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {FONT_CATEGORIES.map((c) => (
          <button key={c.id} onClick={() => setCategory(c.id)} className={chip(category === c.id, 'cyan')}>
            {c.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-1.5 max-h-60 overflow-y-auto pr-1">
        {visible.map((f) => {
          const active = f.family === styleConfig.fontFamily;
          return (
            <button
              key={f.family}
              onClick={() => pick(f)}
              className={`text-left px-2.5 py-2 rounded-lg border transition-all cursor-pointer ${
                active
                  ? 'bg-emerald-500/15 border-emerald-500 text-emerald-100'
                  : 'bg-slate-800/70 border-slate-700/60 text-slate-100 hover:border-emerald-500/60'
              }`}
              title={`${f.family} — ${f.weights.map((w) => WEIGHT_LABELS[w] || w).join(', ')}${f.italics.length ? ' · italic' : ''}`}
            >
              <span
                className="block text-[15px] leading-tight truncate"
                style={{ fontFamily: `"${f.family}"`, fontWeight: f.defaultWeight, fontSynthesisWeight: 'none' }}
              >
                {f.family}
              </span>
              <span className="block text-[9px] font-semibold text-slate-500 truncate">{f.tagline || `${f.weights.length} weight${f.weights.length === 1 ? '' : 's'}`}</span>
            </button>
          );
        })}
      </div>

      {current && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] text-slate-500 font-mono mr-1">Weight</span>
          {current.weights.map((w) => (
            <button key={w} onClick={() => onUpdateStyle('fontWeight', w)} className={chip(weight === w)}>
              {WEIGHT_LABELS[w] || w}
            </button>
          ))}
          <button
            onClick={() => onUpdateStyle('italic', !styleConfig.italic)}
            className={chip(!!styleConfig.italic, 'amber')}
            title={current.italics.length ? 'True italic face' : 'This family has no italic face — an oblique is synthesised (identically in the export)'}
          >
            Italic{current.italics.length ? '' : ' ~'}
          </button>
        </div>
      )}
    </div>
  );
}
