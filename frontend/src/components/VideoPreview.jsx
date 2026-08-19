/**
 * SUBLYX — Video Preview Component
 * Center panel with video player, live styled caption overlay with kinetic word highlight, and transport controls
 */

import { useRef, useEffect, useState } from 'react';

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
  const dragRef = useRef(null);
  const resizeRef = useRef(null);

  // Sync Video playback with react state
  useEffect(() => {
    if (!videoRef.current) return;
    if (isPlaying && videoRef.current.paused) {
      videoRef.current.play().catch(() => {});
    } else if (!isPlaying && !videoRef.current.paused) {
      videoRef.current.pause();
    }
  }, [isPlaying]);

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

  // Resize corner handle handler
  const handleMouseDownResize = (e) => {
    e.stopPropagation();
    e.preventDefault();
    setIsResizing(true);
    resizeRef.current = {
      startY: e.clientY,
      initialSize: styleConfig.fontSize || 28,
    };
  };

  // Window mouse move listener for smooth drag & resize
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (isDragging && dragRef.current) {
        const deltaX = e.clientX - dragRef.current.startX;
        const deltaY = e.clientY - dragRef.current.startY;
        const deltaXPct = (deltaX / dragRef.current.containerWidth) * 100;
        const deltaYPct = (deltaY / dragRef.current.containerHeight) * 100;
        const newX = Math.round(Math.max(5, Math.min(95, dragRef.current.initialX + deltaXPct)));
        const newY = Math.round(Math.max(8, Math.min(92, dragRef.current.initialY + deltaYPct)));
        if (onUpdateStyleBatch) {
          onUpdateStyleBatch({ xPercent: newX, yPercent: newY, position: 'custom' });
        } else if (onUpdateStyle) {
          onUpdateStyle('xPercent', newX);
          onUpdateStyle('yPercent', newY);
        }
      } else if (isResizing && resizeRef.current) {
        const deltaY = (resizeRef.current.startY - e.clientY) * 0.4;
        const newSize = Math.max(14, Math.min(64, Math.round(resizeRef.current.initialSize + deltaY)));
        if (onUpdateStyle) {
          onUpdateStyle('fontSize', newSize);
        }
      }
    };

    const handleMouseUp = () => {
      if (isDragging) setIsDragging(false);
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
  }, [isDragging, isResizing, onUpdateStyle, onUpdateStyleBatch]);

  // Extract active word in current caption if word timestamps are present
  const wordsList =
    currentCaption?.words && currentCaption.words.length > 0
      ? currentCaption.words
      : (currentCaption?.translated_text || '').split(/\s+/).map((w) => ({
          word: w,
          start: currentCaption?.start || 0,
          end: currentCaption?.end || 0,
        }));

  return (
    <main className="flex-1 bg-slate-950 flex flex-col justify-between items-center relative overflow-hidden select-none">
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
            onTimeUpdate={() => onTimeUpdate(videoRef.current?.currentTime || 0)}
            onLoadedMetadata={handleLoadedMetadata}
            onClick={onTogglePlay}
            volume={isMuted ? 0 : volume}
            playsInline
            className="w-full h-full object-contain cursor-pointer block"
          />

          {/* Real-time Interactive & Draggable Reels Subtitle Overlay */}
          {currentCaption && (() => {
            const elapsed = Math.max(0, currentTime - currentCaption.start);
            const trType = styleConfig.transition || 'Fade In + Slide Up';

            let opacity = 1;
            let slideY = 0;
            let scale = 1;

            if (trType.includes('Fade In') && trType.includes('Slide Up')) {
              // Seamless combined Fade In + Slide Up
              const animDuration = 0.20; // 200ms ultra-smooth transition window
              const progress = Math.min(1, elapsed / animDuration);
              opacity = progress;
              slideY = (1 - progress) * 22; // Slide upward 22px
            } else if (trType === 'Fade In') {
              opacity = Math.min(1, elapsed / 0.18);
            } else if (trType === 'Pop Up') {
              const progress = Math.min(1, elapsed / 0.18);
              scale = 0.7 + progress * 0.3;
              opacity = progress;
            } else if (trType === 'Zoom Kinetic') {
              const progress = Math.min(1, elapsed / 0.22);
              scale = 0.6 + progress * 0.4;
              opacity = progress;
            }

            return (
              <div
                onMouseDown={handleMouseDownDrag}
                onClick={(e) => {
                  e.stopPropagation();
                  setIsSelected(true);
                }}
                className={`absolute text-center px-4 py-2 rounded-2xl transition-shadow duration-100 z-30 group/caption cursor-grab active:cursor-grabbing select-none ${
                  isSelected || isDragging || isResizing
                    ? 'ring-2 ring-emerald-400 ring-offset-2 ring-offset-black/80 shadow-[0_0_20px_rgba(16,185,129,0.4)]'
                    : 'hover:ring-1 hover:ring-emerald-400/50'
                }`}
                style={{
                  left: `${xPercent}%`,
                  top: `${yPercent}%`,
                  transform: `translate(-50%, calc(-50% + ${slideY}px)) scale(${scale}) ${styleConfig.flipH ? 'scaleX(-1)' : ''}`,
                  opacity: opacity,
                  maxWidth: '85%',
                  fontFamily: styleConfig.fontFamily || 'Montserrat',
                  fontSize: `${styleConfig.fontSize || 28}px`,
                  color: styleConfig.color || '#ffffff',
                  backgroundColor: styleConfig.backgroundColor || 'transparent',
                  mixBlendMode: styleConfig.mixBlendMode || 'normal',
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
              >
                <span className="text-emerald-400 font-mono text-[10px] pr-1 border-r border-slate-700">
                  {xPercent}% , {yPercent}% &middot; {styleConfig.fontSize || 28}px
                </span>

                {/* Size - / + */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onUpdateStyle?.('fontSize', Math.max(14, (styleConfig.fontSize || 28) - 2));
                  }}
                  title="Decrease text size (A-)"
                  className="w-5 h-5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded flex items-center justify-center cursor-pointer"
                >
                  A-
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onUpdateStyle?.('fontSize', Math.min(64, (styleConfig.fontSize || 28) + 2));
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
                const strokeWidth = styleConfig.strokeWidth ?? 3.5;
                const strokeColor = styleConfig.strokeColor || '#000000';
                const shadowType = styleConfig.shadowType || 'cinematic';
                const shadowBlur = styleConfig.shadowBlur ?? 14;
                const shadowDist = styleConfig.shadowDistance ?? 4;
                const shadowOpacity = styleConfig.shadowOpacity ?? 0.9;
                const shadowColor = styleConfig.shadowColor || '#000000';
                const highlightColor = styleConfig.highlightColor || '#facc15';

                // Helper to convert hex to rgba
                const hexToRgba = (hex, alpha = 1) => {
                  if (!hex || typeof hex !== 'string') return `rgba(0,0,0,${alpha})`;
                  const clean = hex.replace('#', '');
                  if (clean.length === 6) {
                    const r = parseInt(clean.substring(0, 2), 16);
                    const g = parseInt(clean.substring(2, 4), 16);
                    const b = parseInt(clean.substring(4, 6), 16);
                    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
                  }
                  return `rgba(0,0,0,${alpha})`;
                };

                let shadowFilter = 'none';
                if (shadowType === 'cinematic') {
                  const sMain = hexToRgba(shadowColor, shadowOpacity);
                  const sSoft = hexToRgba(shadowColor, shadowOpacity * 0.6);
                  shadowFilter = `drop-shadow(0px ${shadowDist}px ${shadowBlur}px ${sMain}) drop-shadow(0px ${shadowDist * 1.5}px ${shadowBlur * 1.6}px ${sSoft})`;
                } else if (shadowType === 'glow') {
                  const glowCol = highlightColor || '#facc15';
                  const gMain = hexToRgba(glowCol, shadowOpacity);
                  const gSoft = hexToRgba(glowCol, shadowOpacity * 0.7);
                  shadowFilter = `drop-shadow(0px 0px ${shadowBlur}px ${gMain}) drop-shadow(0px 0px ${shadowBlur * 1.8}px ${gSoft})`;
                } else if (shadowType === 'hard') {
                  shadowFilter = `drop-shadow(${shadowDist}px ${shadowDist}px 0px ${shadowColor})`;
                }

                return (
                  <div
                    className="leading-tight tracking-wide uppercase font-black flex flex-wrap justify-center items-center gap-x-2 gap-y-1 pointer-events-none"
                    style={{
                      filter: shadowFilter,
                    }}
                  >
                    {wordsList.map((wObj, wIdx) => {
                      const rawWord = wObj.word || '';
                      const cleanWord = rawWord.replace(/[^\w]/g, '');
                      if (!cleanWord && !rawWord) return null;

                      // Active karaoke condition
                      const isWordActive =
                        wObj.start != null &&
                        wObj.end != null &&
                        currentTime >= wObj.start &&
                        currentTime <= wObj.end;

                      const isKeyword =
                        currentCaption.keywords?.some(
                          (kw) => kw.toLowerCase() === cleanWord.toLowerCase()
                        );

                      const isHighlighted = isWordActive || isKeyword;

                      return (
                        <span
                          key={wIdx}
                          className={`inline-block transition-all duration-75 ${
                            isWordActive
                              ? 'scale-115 -translate-y-0.5 font-black'
                              : isKeyword
                              ? 'scale-105 font-extrabold'
                              : 'font-bold opacity-95'
                          }`}
                          style={{
                            color: isHighlighted
                              ? styleConfig.highlightColor || '#facc15'
                              : styleConfig.color || '#ffffff',
                            WebkitTextStroke: `${strokeWidth}px ${strokeColor}`,
                            paintOrder: 'stroke fill',
                            WebkitFontSmoothing: 'antialiased',
                            textRendering: 'optimizeLegibility',
                          }}
                        >
                          {rawWord}
                        </span>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          );
        })()}
        </div>
      </div>

      {/* Rich Transport Controls Bar */}
      <div className="w-full bg-slate-900 border-t border-slate-800 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 shrink-0">
        {/* Left: Playback & Step Controls */}
        <div className="flex items-center gap-2">
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
