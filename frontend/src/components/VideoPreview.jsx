/**
 * SUBLYX — Video Preview Component
 * Center panel with video player, live styled caption overlay with kinetic word highlight, and transport controls
 */

import { useRef, useEffect, useState } from 'react';
import {
  buildShadowFilter,
  buildWordStyle,
  applyTextTransform,
  groupWordsIntoLines,
  fitFontSize,
  nearestFontWeight,
} from '../lib/captionStyle';
import NegativeTextCanvas from './NegativeTextCanvas';
import { refScale } from '../lib/negativeText';

// Entry transitions — the same numbers the exporter uses (TRANSITIONS in rendering.py).
const TRANSITIONS = {
  'Fade In + Slide Up': { fade: true, slide: true, scaleFrom: 1, seconds: 0.18 },
  'Slide Up': { fade: false, slide: true, scaleFrom: 1, seconds: 0.18 },
  'Fade In': { fade: true, slide: false, scaleFrom: 1, seconds: 0.18 },
  'Pop Up': { fade: true, slide: false, scaleFrom: 0.7, seconds: 0.18 },
  'Zoom Kinetic': { fade: true, slide: false, scaleFrom: 0.6, seconds: 0.22 },
  None: { fade: false, slide: false, scaleFrom: 1, seconds: 0 },
};
const SLIDE_UP_PIXELS = 22;

// Snap targets (percent of the frame) while dragging the caption: centre,
// rule-of-thirds and the Reels / Shorts caption positions.
const X_GUIDES = [50, 33.3, 66.7];
const Y_GUIDES = [50, 33.3, 66.7, 15, 72, 82];
const SNAP_PCT = 1.5;
// Shorts / Reels UI overlays: the top bar, the right-hand action rail and the
// bottom caption / audio strip. Text inside this box stays readable on-platform.
const SAFE_AREA = { left: 4, right: 86, top: 8, bottom: 80 };
const FONT_MIN = 12;
const FONT_MAX = 96;
const TIP_KEY = 'reelix_tip_caption_dismissed';

export default function VideoPreview({
  videoUrl,
  currentTime,
  duration,
  isPlaying,
  playbackRate = 1,
  volume,
  isMuted,
  styleConfig,
  currentCaption,
  captions = [],
  fps = 30,
  onTimeUpdate,
  onLoadedMetadata,
  onTogglePlay,
  onSeek,
  onVolumeChange,
  onToggleMute,
  onPlaybackRateChange,
  onSplitCaption,
  onTrimStart,
  onTrimEnd,
  onOpenShortcuts,
  onUpdateStyle,
  onUpdateStyleBatch,
}) {
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const [videoDimensions, setVideoDimensions] = useState({ width: 0, height: 0, aspect: '' });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [isSelected, setIsSelected] = useState(false);
  const [showGrid, setShowGrid] = useState(false);
  const [snapGuides, setSnapGuides] = useState({ x: null, y: null });
  const [displaySize, setDisplaySize] = useState({ width: 0, height: 0 });
  const [showTip, setShowTip] = useState(() => {
    try { return localStorage.getItem(TIP_KEY) !== '1'; } catch { return true; }
  });
  const dragRef = useRef(null);
  const resizeRef = useRef(null);
  const captionRef = useRef(null);

  const dismissTip = () => {
    setShowTip(false);
    try { localStorage.setItem(TIP_KEY, '1'); } catch { /* private mode */ }
  };
  const clampSize = (v) => Math.max(FONT_MIN, Math.min(FONT_MAX, Math.round(v)));
  // The exporter sizes text as fontSize × (videoH / 520) (portrait) or
  // (videoW / 640) (landscape). Scaling the overlay by the same rule for the
  // *displayed* video size keeps the preview identical to the burned-in MP4 at
  // any window size.
  const previewScale = displaySize.width && displaySize.height ? refScale(displaySize.width, displaySize.height) : 1;

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r && r.width && r.height) setDisplaySize({ width: r.width, height: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [videoDimensions.aspect]);
  // The Negative Text template composites in a canvas over the video; the DOM
  // caption below stays as an invisible drag / resize handle.
  const isNegative = styleConfig.renderer === 'negative';
  const [negativeFallback, setNegativeFallback] = useState(false);
  const effectiveNegative = isNegative && !negativeFallback;

  useEffect(() => {
    setNegativeFallback(false);
  }, [styleConfig.renderer, videoUrl]);

  // Sync Video playback with react state
  useEffect(() => {
    if (!videoRef.current) return;
    if (isPlaying && videoRef.current.paused) {
      videoRef.current.play().catch(() => {});
    } else if (!isPlaying && !videoRef.current.paused) {
      videoRef.current.pause();
    }
  }, [isPlaying]);

  // Seeks made through state (timeline clicks, ±3s, caption selection) move the
  // <video> too, so the frame under the caption is the one the editor shows.
  // While playing only large jumps count — timeupdate lag must never seek back.
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !Number.isFinite(currentTime)) return;
    const diff = Math.abs(v.currentTime - currentTime);
    if ((!isPlaying && diff > 0.05) || diff > 1.5) {
      v.currentTime = currentTime;
    }
  }, [currentTime, isPlaying]);

  // Sync Playback Rate
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackRate || 1;
    }
  }, [playbackRate]);

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      const w = videoRef.current.videoWidth;
      const h = videoRef.current.videoHeight;
      if (w && h) {
        setVideoDimensions({ width: w, height: h, aspect: `${w} / ${h}` });
      }
      onLoadedMetadata(videoRef.current.duration || 0);
    }
  };

  const handleSeekChange = (e) => {
    const newTime = parseFloat(e.target.value);
    if (videoRef.current) {
      videoRef.current.currentTime = newTime;
    }
    onSeek(newTime);
  };

  const handleToggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  // Active X & Y percent coordinates (0% to 100%)
  const xPercent = styleConfig.xPercent ?? 50;
  const yPercent = styleConfig.yPercent ?? (
    styleConfig.position === 'top' ? 15 : styleConfig.position === 'center' ? 50 : 82
  );

  // Drag position handlers
  const handleMouseDownDrag = (e) => {
    e.stopPropagation();
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    setIsDragging(true);
    setIsSelected(true);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      containerWidth: rect.width,
      containerHeight: rect.height,
      initialX: xPercent,
      initialY: yPercent,
    };
  };

  // Resize corner handle handler. The text scales with the distance between the
  // pointer and the caption's centre, so pulling any corner outwards grows it
  // and pushing inwards shrinks it — like a zoom handle in a real editor.
  const handleMouseDownResize = (e) => {
    e.stopPropagation();
    e.preventDefault();
    const box = captionRef.current?.getBoundingClientRect();
    const cx = box ? box.left + box.width / 2 : e.clientX;
    const cy = box ? box.top + box.height / 2 : e.clientY - 40;
    setIsResizing(true);
    setIsSelected(true);
    resizeRef.current = {
      cx,
      cy,
      startDist: Math.max(8, Math.hypot(e.clientX - cx, e.clientY - cy)),
      initialSize: styleConfig.fontSize || 28,
    };
  };

  // Ctrl / ⌘ + scroll over the caption zooms the text (native listener: React's
  // wheel handler is passive, so the browser would also zoom the page).
  useEffect(() => {
    const el = captionRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const step = (e.deltaY < 0 ? 1 : -1) * (e.shiftKey ? 4 : 1);
      onUpdateStyle?.('fontSize', clampSize((styleConfig.fontSize || 28) + step));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [currentCaption, styleConfig.fontSize, onUpdateStyle]);

  // Window mouse move listener for smooth drag & resize
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (isDragging && dragRef.current) {
        const deltaX = e.clientX - dragRef.current.startX;
        const deltaY = e.clientY - dragRef.current.startY;
        const deltaXPct = (deltaX / dragRef.current.containerWidth) * 100;
        const deltaYPct = (deltaY / dragRef.current.containerHeight) * 100;
        const rawX = Math.max(5, Math.min(95, dragRef.current.initialX + deltaXPct));
        const rawY = Math.max(8, Math.min(92, dragRef.current.initialY + deltaYPct));
        // Snap to the guides unless Shift is held; snapped values keep the
        // guide's exact position (33.3 / 66.7) instead of rounding to integers.
        let newX = Math.round(rawX);
        let newY = Math.round(rawY);
        let gx = null;
        let gy = null;
        if (!e.shiftKey) {
          gx = X_GUIDES.find((g) => Math.abs(rawX - g) <= SNAP_PCT) ?? null;
          gy = Y_GUIDES.find((g) => Math.abs(rawY - g) <= SNAP_PCT) ?? null;
          if (gx != null) newX = gx;
          if (gy != null) newY = gy;
        }
        setSnapGuides({ x: gx, y: gy });
        if (onUpdateStyleBatch) {
          onUpdateStyleBatch({ xPercent: newX, yPercent: newY, position: 'custom' });
        } else if (onUpdateStyle) {
          onUpdateStyle('xPercent', newX);
          onUpdateStyle('yPercent', newY);
        }
      } else if (isResizing && resizeRef.current) {
        const { cx, cy, startDist, initialSize } = resizeRef.current;
        const dist = Math.hypot(e.clientX - cx, e.clientY - cy);
        const newSize = clampSize(initialSize * (dist / startDist));
        if (newSize !== (styleConfig.fontSize || 28) && onUpdateStyle) {
          onUpdateStyle('fontSize', newSize);
        }
      }
    };

    const handleMouseUp = () => {
      if (isDragging) {
        setIsDragging(false);
        setSnapGuides({ x: null, y: null });
      }
      if (isResizing) setIsResizing(false);
    };

    if (isDragging || isResizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, isResizing, onUpdateStyle, onUpdateStyleBatch, styleConfig.fontSize]);

  // Extract active word list for the current caption.
  // IMPORTANT: When the user edits translated_text in the CaptionsPanel, the
  // words[] array (Whisper word-level timestamps) becomes stale. We detect
  // this mismatch by comparing word counts and always fall back to splitting
  // translated_text so the preview reflects edits immediately.
  const wordsList = (() => {
    const text = currentCaption?.translated_text || '';
    const textWords = text.split(/\s+/).filter(Boolean);
    const hasValidWords =
      Array.isArray(currentCaption?.words) &&
      currentCaption.words.length > 0 &&
      currentCaption.words.length === textWords.length;

    if (hasValidWords) {
      // Words array is in sync with current text — use it for per-word highlight
      return currentCaption.words;
    }
    // Text was edited or no word timestamps — split translated_text directly
    return textWords.map((w) => ({
      word: w,
      start: currentCaption?.start || 0,
      end: currentCaption?.end || 0,
    }));
  })();

  return (
    <main className="flex-1 bg-slate-950 flex flex-col justify-between items-center relative overflow-hidden select-none">
      {/* First-run tip */}
      {showTip && currentCaption && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 bg-slate-900/95 border border-emerald-500/40 text-slate-200 text-[11px] font-semibold px-3 py-1.5 rounded-full shadow-xl">
          <span>💡 Click the caption to select it — drag to move, pull a corner to resize, <b>⊞ Grid</b> for guides. Everything you set here is exactly what gets exported.</span>
          <button onClick={dismissTip} className="text-slate-400 hover:text-slate-100 font-bold cursor-pointer" title="Dismiss">✕</button>
        </div>
      )}

      {/* Video Container Area with True Video Aspect Ratio */}
      <div className="flex-1 w-full flex items-center justify-center p-3 sm:p-5 relative overflow-hidden min-h-0">
        <div
          ref={containerRef}
          onClick={() => setIsSelected(false)}
          className="relative max-h-full max-w-full flex items-center justify-center rounded-2xl overflow-hidden shadow-2xl border border-slate-800/90 bg-black group transition-all duration-150"
          style={{
            aspectRatio: videoDimensions.aspect || 'auto',
            maxHeight: '100%',
          }}
        >
          {/* HTML5 Video Element */}
          <video
            ref={videoRef}
            src={videoUrl}
            crossOrigin="anonymous"
            onTimeUpdate={() => onTimeUpdate(videoRef.current?.currentTime || 0)}
            onLoadedMetadata={handleLoadedMetadata}
            onClick={onTogglePlay}
            volume={isMuted ? 0 : volume}
            playsInline
            className="w-full h-full object-contain cursor-pointer block"
          />

          {effectiveNegative && (
            <NegativeTextCanvas
              videoRef={videoRef}
              captions={captions}
              styleConfig={styleConfig}
              fps={fps}
              currentTime={currentTime}
              isPlaying={isPlaying}
              videoDimensions={videoDimensions}
              displaySize={displaySize}
              onFallback={() => setNegativeFallback(true)}
            />
          )}

          {/* Real-time Interactive & Draggable Reels Subtitle Overlay */}
          {currentCaption && (() => {
            const elapsed = Math.max(0, currentTime - currentCaption.start);
            const plan = TRANSITIONS[styleConfig.transition] || TRANSITIONS['Fade In + Slide Up'];
            const progress = plan.seconds > 0 ? Math.min(1, elapsed / plan.seconds) : 1;
            const opacity = plan.fade ? progress : 1;
            const slideY = plan.slide ? (1 - progress) * SLIDE_UP_PIXELS : 0;
            const scale = plan.scaleFrom + (1 - plan.scaleFrom) * progress;
            const k = previewScale;
            // Fit the widest line to the 85% caption box (measured in unscaled
            // CSS px, since the box is scaled by k afterwards).
            const fittedSize = displaySize.width
              ? fitFontSize(wordsList, styleConfig, (0.85 * displaySize.width) / k)
              : styleConfig.fontSize || 28;
            // A fitted caption scales as a whole — letter spacing shrinks with the size.
            const fitScale = fittedSize / (styleConfig.fontSize || 28);
            const fitStyle = fitScale < 1
              ? { ...styleConfig, letterSpacing: (Number(styleConfig.letterSpacing) || 0) * fitScale }
              : styleConfig;

            return (
              <div
                ref={captionRef}
                onMouseDown={handleMouseDownDrag}
                onClick={(e) => {
                  e.stopPropagation();
                  setIsSelected(true);
                }}
                className={`absolute text-center transition-shadow duration-100 z-30 group/caption cursor-grab active:cursor-grabbing select-none ${
                  isSelected || isDragging || isResizing
                    ? 'ring-2 ring-emerald-400 ring-offset-2 ring-offset-black/80 shadow-[0_0_20px_rgba(16,185,129,0.4)]'
                    : 'hover:ring-1 hover:ring-emerald-400/50'
                }`}
                style={{
                  left: `${xPercent}%`,
                  top: `${yPercent}%`,
                  transform: `translate(-50%, calc(-50% + ${slideY * k}px)) scale(${scale * k}) ${styleConfig.flipH ? 'scaleX(-1)' : ''}`,
                  opacity: opacity,
                  maxWidth: 'none',
                  fontFamily: styleConfig.fontFamily || 'Montserrat',
                  fontWeight: nearestFontWeight(styleConfig.fontFamily, styleConfig.fontWeight),
                  fontSize: `${fittedSize}px`,
                  // Never let the browser fake a weight the family does not ship —
                  // the export renders the real file, so the preview must too.
                  fontSynthesisWeight: 'none',
                  fontKerning: 'normal',
                  fontFeatureSettings: '"kern" 1, "liga" 1',
                  textRendering: 'geometricPrecision',
                  color: styleConfig.color || '#ffffff',
                  backgroundColor: effectiveNegative ? 'transparent' : (styleConfig.backgroundColor || 'transparent'),
                  padding: `${styleConfig.bgPadding ?? 6}px ${(styleConfig.bgPadding ?? 6) * 1.6}px`,
                  borderRadius: `${styleConfig.bgRadius ?? 12}px`,
                  mixBlendMode: effectiveNegative ? 'normal' : (isNegative ? 'difference' : (styleConfig.mixBlendMode || 'normal')),
                  willChange: 'transform, opacity',
                }}
                title="Click and drag to move subtitle anywhere on video!"
              >
              {/* Floating Quick Action Bar (Visible when selected or dragging) */}
              <div
                onClick={(e) => e.stopPropagation()}
                className={`absolute -top-10 left-1/2 -translate-x-1/2 bg-slate-900/95 border border-slate-700/80 rounded-xl px-2 py-1 flex items-center gap-1.5 shadow-2xl text-[11px] font-sans font-bold z-40 transition-opacity whitespace-nowrap pointer-events-auto ${
                  isSelected || isDragging || isResizing ? 'opacity-100' : 'opacity-0 group-hover/caption:opacity-100'
                }`}
                style={{ transform: `scale(${1 / k})`, transformOrigin: 'bottom center' }}
              >
                <span className="text-emerald-400 font-mono text-[10px] pr-1 border-r border-slate-700">
                  {xPercent}% , {yPercent}% &middot; {styleConfig.fontSize || 28}px
                </span>

                {/* Grid / guides toggle */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowGrid((v) => !v);
                  }}
                  title="Show alignment grid & safe area (auto while dragging; hold Shift to drag without snapping)"
                  className={`px-1.5 py-0.5 rounded text-[10px] cursor-pointer border ${
                    showGrid ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/60' : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-transparent'
                  }`}
                >
                  ⊞ Grid
                </button>

                {/* Size - / + */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onUpdateStyle?.('fontSize', clampSize((styleConfig.fontSize || 28) - 2));
                  }}
                  title="Decrease text size (A-)"
                  className="w-5 h-5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded flex items-center justify-center cursor-pointer"
                >
                  A-
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onUpdateStyle?.('fontSize', clampSize((styleConfig.fontSize || 28) + 2));
                  }}
                  title="Increase text size (A+)"
                  className="w-5 h-5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded flex items-center justify-center cursor-pointer"
                >
                  A+
                </button>

                {/* Quick Presets */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onUpdateStyleBatch?.({ xPercent: 50, yPercent: 15, position: 'top' });
                  }}
                  title="Move to Top (15%)"
                  className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[10px] cursor-pointer"
                >
                  ⬆ Top
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onUpdateStyleBatch?.({ xPercent: 50, yPercent: 50, position: 'center' });
                  }}
                  title="Move to Center (50%)"
                  className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[10px] cursor-pointer"
                >
                  🎯 Center
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onUpdateStyleBatch?.({ xPercent: 50, yPercent: 82, position: 'bottom' });
                  }}
                  title="Move to Reels Safe Zone (82%)"
                  className="px-1.5 py-0.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 rounded text-[10px] cursor-pointer font-bold"
                >
                  ⬇ Safe Zone
                </button>
              </div>

              {/* Interaction hint — counter-scaled like the action bar */}
              {(isSelected || isResizing) && !isDragging && (
                <div
                  className="absolute -bottom-7 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-bold text-slate-300 bg-slate-950/80 border border-slate-700/60 px-2 py-0.5 rounded-md pointer-events-none"
                  style={{ transform: `scale(${1 / k})`, transformOrigin: 'top center' }}
                >
                  Drag to move · pull a corner or Ctrl+scroll to resize · Shift = no snap
                </div>
              )}

              {/* 4 Corner Resize Anchor Handles */}
              {(isSelected || isDragging || isResizing) && (
                <>
                  <div
                    onMouseDown={handleMouseDownResize}
                    className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-emerald-400 border border-slate-950 rounded-full cursor-nwse-resize shadow-md"
                    title="Drag to resize text size"
                  />
                  <div
                    onMouseDown={handleMouseDownResize}
                    className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-emerald-400 border border-slate-950 rounded-full cursor-nesw-resize shadow-md"
                    title="Drag to resize text size"
                  />
                  <div
                    onMouseDown={handleMouseDownResize}
                    className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-emerald-400 border border-slate-950 rounded-full cursor-nesw-resize shadow-md"
                    title="Drag to resize text size"
                  />
                  <div
                    onMouseDown={handleMouseDownResize}
                    className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-emerald-400 border border-slate-950 rounded-full cursor-nwse-resize shadow-md"
                    title="Drag to resize text size"
                  />
                </>
              )}

              {/* Subtitle Words Content */}
              {(() => {
                const perLine = Math.max(1, styleConfig.maxWordsPerLine ?? 3);
                const lines = groupWordsIntoLines(wordsList, perLine);

                return (
                  <div
                    className="pointer-events-none"
                    style={{
                      filter: effectiveNegative ? 'none' : buildShadowFilter(styleConfig),
                      lineHeight: styleConfig.lineHeight ?? 1.05,
                      visibility: effectiveNegative ? 'hidden' : 'visible',
                    }}
                  >
                    {lines.map((line, lineIdx) => (
                      <div
                        key={lineIdx}
                        className="flex flex-nowrap justify-center items-center gap-x-[0.26em] gap-y-[0.08em] whitespace-nowrap"
                      >
                        {line.map((wObj, i) => {
                          const rawWord = (typeof wObj === 'string' ? wObj : wObj?.word) || '';
                          if (!rawWord) return null;
                          const cleanWord = rawWord.replace(/[^\w]/g, '');

                          const isActive =
                            wObj?.start != null &&
                            wObj?.end != null &&
                            currentTime >= wObj.start &&
                            currentTime <= wObj.end;

                          const isKeyword =
                            Array.isArray(currentCaption?.keywords) &&
                            cleanWord.length > 0 &&
                            currentCaption.keywords.some(
                              (kw) => typeof kw === 'string' && kw.toLowerCase() === cleanWord.toLowerCase()
                            );

                          return (
                            <span
                              key={lineIdx * perLine + i}
                              style={buildWordStyle(fitStyle, { isActive, isKeyword })}
                            >
                              {applyTextTransform(rawWord, styleConfig.textTransform)}
                            </span>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          );
        })()}

          <AlignmentGuides
            visible={isDragging || showGrid}
            dragging={isDragging}
            x={xPercent}
            y={yPercent}
            snap={snapGuides}
          />
        </div>
      </div>

      {/* Rich Transport Controls Bar */}
      <div className="w-full bg-slate-900 border-t border-slate-800 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 shrink-0">
        {/* Left: Playback & Step Controls */}
        <div className="flex items-center gap-2">
          {/* Start from beginning */}
          <button
            onClick={() => onSeek(0)}
            title="Start from beginning (Home)"
            className="w-9 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center justify-center transition-all cursor-pointer"
          >
            <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
              <path d="M6 6h2v12H6zm3.5 6 8.5 6V6z" />
            </svg>
          </button>

          {/* Jump -3s */}
          <button
            onClick={() => onSeek(Math.max(0, currentTime - 3))}
            title="Jump back 3s (J or Left Arrow)"
            className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center text-xs font-bold transition-all cursor-pointer"
          >
            -3s
          </button>

          {/* Play/Pause Button */}
          <button
            onClick={onTogglePlay}
            title="Play / Pause (Tab or Space)"
            className="w-9 h-9 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 flex items-center justify-center font-bold transition-all shadow-md cursor-pointer"
          >
            {isPlaying ? (
              <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
              </svg>
            ) : (
              <svg className="w-5 h-5 fill-current ml-0.5" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>

          {/* Jump +3s */}
          <button
            onClick={() => onSeek(Math.min(duration, currentTime + 3))}
            title="Jump forward 3s (L or Right Arrow)"
            className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center text-xs font-bold transition-all cursor-pointer"
          >
            +3s
          </button>

          {/* Cut / Split at Playhead */}
          <button
            onClick={onSplitCaption}
            title="Cut/Split Caption at Playhead (C or S key)"
            className="px-2.5 h-8 rounded-lg bg-slate-800 hover:bg-emerald-500/20 text-slate-300 hover:text-emerald-400 border border-slate-700 hover:border-emerald-500/50 flex items-center gap-1.5 text-xs font-bold transition-all cursor-pointer"
          >
            <span>✂️</span> Cut
          </button>

          {/* Trim Start */}
          <button
            onClick={onTrimStart}
            title="Trim Start to Playhead ([ key)"
            className="px-2 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-bold transition-all cursor-pointer"
          >
            [ Trim In
          </button>

          {/* Trim End */}
          <button
            onClick={onTrimEnd}
            title="Trim End to Playhead (] key)"
            className="px-2 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-bold transition-all cursor-pointer"
          >
            Trim Out ]
          </button>
        </div>

        {/* Center: Scrubber & Timecode */}
        <div className="flex-1 max-w-md flex items-center gap-3">
          <div className="text-xs font-mono font-semibold text-slate-300 min-w-[90px]">
            {formatTimecode(currentTime)} / {formatTimecode(duration)}
          </div>
          <input
            type="range"
            min="0"
            max={duration || 100}
            step="0.02"
            value={currentTime}
            onChange={handleSeekChange}
            className="flex-1 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-400"
          />
        </div>

        {/* Right: Speed, Volume, Shortcuts, Fullscreen */}
        <div className="flex items-center gap-2">
          {/* Speed Selector */}
          <select
            value={playbackRate}
            onChange={(e) => onPlaybackRateChange(parseFloat(e.target.value))}
            className="bg-slate-800 border border-slate-700 text-slate-300 text-xs font-bold rounded-lg px-2 py-1 focus:outline-none cursor-pointer"
            title="Playback Speed"
          >
            <option value="0.5">0.5x</option>
            <option value="0.75">0.75x</option>
            <option value="1">1.0x</option>
            <option value="1.25">1.25x</option>
            <option value="1.5">1.5x</option>
            <option value="2">2.0x</option>
          </select>

          {/* Volume & Mute */}
          <button
            onClick={onToggleMute}
            title="Toggle Mute (M key)"
            className="text-slate-400 hover:text-slate-200 p-1 cursor-pointer"
          >
            {isMuted || volume === 0 ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
              </svg>
            )}
          </button>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={isMuted ? 0 : volume}
            onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
            className="w-14 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-400 hidden sm:block"
          />

          {/* Shortcuts Modal Button */}
          <button
            onClick={onOpenShortcuts}
            title="Keyboard Shortcuts (? key)"
            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-bold transition-all cursor-pointer"
          >
            ⌨️
          </button>

          {/* Fullscreen Button */}
          <button
            onClick={handleToggleFullscreen}
            title="Toggle Fullscreen (F key)"
            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-bold transition-all cursor-pointer"
          >
            ⛶
          </button>
        </div>
      </div>
    </main>
  );
}

function formatTimecode(sec) {
  if (!sec || isNaN(sec)) return '00:00.0';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.floor((sec - Math.floor(sec)) * 10);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms}`;
}


/**
 * Alignment overlay: rule-of-thirds + centre grid, the Shorts / Reels safe
 * area, and a crosshair through the caption's anchor. A guide the caption has
 * snapped to lights up so the alignment is unambiguous while dragging.
 */
function AlignmentGuides({ visible, dragging, x, y, snap }) {
  if (!visible) return null;
  const line = (pos, axis, tone) => {
    const base = axis === 'x'
      ? { left: `${pos}%`, top: 0, bottom: 0, width: 0 }
      : { top: `${pos}%`, left: 0, right: 0, height: 0 };
    const border = axis === 'x' ? 'borderLeft' : 'borderTop';
    const styles = {
      grid: { [border]: '1px dashed rgba(255,255,255,0.28)' },
      snap: { [border]: '1px solid rgba(52,211,153,0.95)', boxShadow: '0 0 6px rgba(52,211,153,0.8)' },
      cross: { [border]: '1px dashed rgba(34,211,238,0.85)' },
    };
    return <div key={`${axis}${pos}${tone}`} className="absolute" style={{ ...base, ...styles[tone] }} />;
  };
  return (
    <div className="absolute inset-0 pointer-events-none z-40 select-none">
      {X_GUIDES.map((g) => line(g, 'x', snap.x === g ? 'snap' : 'grid'))}
      {Y_GUIDES.map((g) => line(g, 'y', snap.y === g ? 'snap' : 'grid'))}
      {/* Safe area */}
      <div
        className="absolute rounded-md"
        style={{
          left: `${SAFE_AREA.left}%`,
          top: `${SAFE_AREA.top}%`,
          width: `${SAFE_AREA.right - SAFE_AREA.left}%`,
          height: `${SAFE_AREA.bottom - SAFE_AREA.top}%`,
          border: '1px dashed rgba(250,204,21,0.55)',
        }}
      >
        <span className="absolute -top-4 left-0 text-[9px] font-bold uppercase tracking-wider text-amber-300/90 bg-slate-950/70 px-1 rounded">
          Shorts / Reels safe area
        </span>
      </div>
      {/* Crosshair through the caption anchor while dragging */}
      {dragging && snap.x == null && line(x, 'x', 'cross')}
      {dragging && snap.y == null && line(y, 'y', 'cross')}
      {dragging && (
        <span
          className="absolute text-[10px] font-mono font-bold text-cyan-200 bg-slate-950/80 px-1.5 py-0.5 rounded"
          style={{ left: `${x}%`, top: `${y}%`, transform: 'translate(12px, 12px)' }}
        >
          {x}% , {y}%{snap.x != null || snap.y != null ? ' · snapped' : ''}
        </span>
      )}
    </div>
  );
}
