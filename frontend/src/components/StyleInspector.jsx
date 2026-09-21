/**
 * SUBLYX — Style Inspector Component
 * Right panel inspector with font selectors, the template library, transitions, and AI Magic
 */

import { useState } from 'react';
import {
  TEMPLATE_PRESETS,
  TEMPLATE_CATEGORIES,
  templateToStyle,
  buildShadowFilter,
  buildWordStyle,
  applyTextTransform,
} from '../lib/captionStyle';

const CUSTOM_FONTS = [
  { name: 'Montserrat (Viral Reels)', family: 'Montserrat' },
  { name: 'Anton (Hormozi Punch)', family: 'Anton' },
  { name: 'Rubik (Smooth Bold)', family: 'Rubik' },
  { name: 'Plus Jakarta Sans (Modern)', family: 'Plus Jakarta Sans' },
  { name: 'Outfit (Sleek Geometric)', family: 'Outfit' },
  { name: 'Bebas Neue (Heavy Block)', family: 'Bebas Neue' },
  { name: 'Syne (Edgy Creator)', family: 'Syne' },
  { name: 'Oswald (Classic Title)', family: 'Oswald' },
  { name: 'Inter (Minimal Clean)', family: 'Inter' },
];

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
  onApplyTemplate,
  onAutoHighlightAll,
  onAutoSplitLong,
  onUppercaseAll,
}) {
  const [activeTab, setActiveTab] = useState('Text'); // Text, VFX & Shadow, Templates, Transitions, AI Magic
  const [templateCategory, setTemplateCategory] = useState('all');
  const [magicNotice, setMagicNotice] = useState(null);

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
        {['Text', 'VFX & Shadow', 'Templates', 'Transitions', 'AI Magic'].map((tab) => (
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
            {/* Font Family Selector */}
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                Font Family
              </label>
              <select
                value={styleConfig.fontFamily}
                onChange={(e) => onUpdateStyle('fontFamily', e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs font-bold text-slate-100 focus:outline-none focus:border-emerald-500 cursor-pointer"
              >
                {CUSTOM_FONTS.map((f) => (
                  <option key={f.family} value={f.family}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Font Size Slider */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Font Size
                </label>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => onUpdateStyle('fontSize', Math.max(14, (styleConfig.fontSize || 28) - 2))}
                    className="w-5 h-5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center text-xs font-bold"
                  >
                    -
                  </button>
                  <span className="text-xs font-mono text-emerald-400 font-bold min-w-[36px] text-center">
                    {styleConfig.fontSize || 28} px
                  </span>
                  <button
                    onClick={() => onUpdateStyle('fontSize', Math.min(64, (styleConfig.fontSize || 28) + 2))}
                    className="w-5 h-5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center text-xs font-bold"
                  >
                    +
                  </button>
                </div>
              </div>
              <input
                type="range"
                min="14"
                max="64"
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
                    onClick={() => onUpdateStyle('transition', tr.id)}
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
                      {tpl.karaoke ? 'karaoke' : 'static'} &middot; {tpl.highlightMode}
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
                onClick={() => onUpdateStyle('transition', tr)}
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
          fontSize: '13px',
          lineHeight: tpl.lineHeight ?? 1.05,
          mixBlendMode: tpl.mixBlendMode || 'normal',
          transform: tpl.flipH ? 'scaleX(-1)' : 'none',
          backgroundColor: hasCard ? tpl.backgroundColor : 'transparent',
          borderRadius: hasCard ? `${Math.round((tpl.bgRadius ?? 0) * 0.6)}px` : 0,
          padding: hasCard ? '4px 8px' : 0,
          filter: buildShadowFilter({ ...tpl, shadowBlur: (tpl.shadowBlur ?? 14) * 0.45, shadowDistance: (tpl.shadowDistance ?? 4) * 0.45 }),
        }}
      >
        <div className="flex flex-wrap justify-center items-center gap-x-1 gap-y-0.5 font-black">
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
