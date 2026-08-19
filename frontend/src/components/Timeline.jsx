/**
 * SUBLYX — Timeline Component
 * Bottom multi-track editor timeline (Captions Track, Video Track, Audio Track) with interactive playhead
 */

import { useRef, useState } from 'react';

export default function Timeline({
  captions,
  currentTime,
  duration,
  selectedCaptionId,
  onSelectCaption,
  onSeek,
  onSplitCaption,
  onTrimStart,
  onTrimEnd,
}) {
  const timelineRef = useRef(null);
  const [zoomLevel, setZoomLevel] = useState(1); // 1x to 3x horizontal zoom

  const handleTimelineClick = (e) => {
    if (!timelineRef.current || !duration) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const newTime = Math.max(0, Math.min(duration, (clickX / rect.width) * duration));
    onSeek(newTime);
  };

  const playheadPercent = duration ? (currentTime / duration) * 100 : 0;

  return (
    <div className="h-40 bg-slate-900 border-t border-slate-800 flex flex-col shrink-0 select-none">
      {/* Timeline Controls Header */}
      <div className="h-8 px-4 border-b border-slate-800 flex items-center justify-between text-xs text-slate-400 font-mono bg-slate-950/40">
        <div className="flex items-center gap-4">
          <span className="font-bold text-slate-300">TIMELINE</span>
          <div className="flex items-center gap-2 text-[11px]">
            <span className="w-2 h-2 rounded-full bg-emerald-400" /> Captions
            <span className="w-2 h-2 rounded-full bg-indigo-400" /> Video
            <span className="w-2 h-2 rounded-full bg-cyan-400" /> Audio
          </div>
        </div>

        {/* Action buttons & Zoom */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <button
              onClick={onSplitCaption}
              title="Split at playhead (C or S)"
              className="px-2 py-0.5 rounded bg-slate-800 hover:bg-emerald-500/20 text-slate-300 hover:text-emerald-300 text-[11px] font-bold border border-slate-700 cursor-pointer"
            >
              ✂️ Cut
            </button>
            <button
              onClick={onTrimStart}
              title="Trim start to playhead ([)"
              className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-bold border border-slate-700 cursor-pointer"
            >
              [ In
            </button>
            <button
              onClick={onTrimEnd}
              title="Trim end to playhead (])"
              className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-bold border border-slate-700 cursor-pointer"
            >
              Out ]
            </button>
          </div>

          <div className="flex items-center gap-1 border-l border-slate-800 pl-3">
            <button
              onClick={() => setZoomLevel((z) => Math.max(1, z - 0.5))}
              className="w-5 h-5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center font-bold text-xs cursor-pointer"
              title="Zoom Out"
            >
              -
            </button>
            <span className="text-[10px] text-slate-400 font-bold">{zoomLevel}x</span>
            <button
              onClick={() => setZoomLevel((z) => Math.min(3, z + 0.5))}
              className="w-5 h-5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center font-bold text-xs cursor-pointer"
              title="Zoom In"
            >
              +
            </button>
          </div>

          <div className="text-emerald-400 font-bold text-xs">
            {formatTime(currentTime)} / {formatTime(duration)}
          </div>
        </div>
      </div>

      {/* Track Area Container with Horizontal Scroll Support for Zoom */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden relative bg-slate-950">
        <div
          ref={timelineRef}
          onClick={handleTimelineClick}
          className="h-full relative cursor-crosshair p-2 space-y-1.5"
          style={{ width: `${zoomLevel * 100}%`, minWidth: '100%' }}
        >
          {/* Interactive Playhead Vertical Marker */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-emerald-400 z-20 pointer-events-none shadow-[0_0_12px_#10b981]"
            style={{ left: `${playheadPercent}%` }}
          >
            <div className="w-3.5 h-3.5 bg-emerald-400 -translate-x-1.5 rotate-45 rounded-sm shadow-md" />
          </div>

          {/* Track 1: Captions Track */}
          <div className="h-8 bg-slate-900/90 border border-slate-800 rounded-lg relative overflow-hidden flex items-center">
            <div className="text-[10px] font-bold text-emerald-400 px-2 z-10 sticky left-0 bg-slate-900/95 border-r border-slate-800/80">
              CAPTIONS
            </div>
            {captions.map((cap) => {
              const leftPct = duration ? (cap.start / duration) * 100 : 0;
              const widthPct = duration ? ((cap.end - cap.start) / duration) * 100 : 0;
              const isSelected = cap.id === selectedCaptionId;
              const isPlayingNow = currentTime >= cap.start && currentTime <= cap.end;

              return (
                <div
                  key={cap.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectCaption(cap.id, cap.start);
                  }}
                  className={`absolute h-6 rounded px-1.5 text-[10px] font-bold flex items-center truncate transition-all cursor-pointer ${
                    isPlayingNow
                      ? 'bg-amber-400 text-slate-950 border border-amber-200 shadow-lg z-15'
                      : isSelected
                      ? 'bg-emerald-500 text-slate-950 font-bold border border-emerald-300 shadow-md z-10'
                      : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30'
                  }`}
                  style={{
                    left: `${leftPct}%`,
                    width: `${Math.max(widthPct, 0.8)}%`,
                  }}
                  title={`${cap.translated_text} (${cap.start}s - ${cap.end}s)`}
                >
                  {cap.translated_text}
                </div>
              );
            })}
          </div>

          {/* Track 2: Video 1 Track */}
          <div className="h-8 bg-slate-900/90 border border-slate-800 rounded-lg relative overflow-hidden flex items-center px-2">
            <div className="text-[10px] font-bold text-indigo-400 mr-2 z-10 sticky left-0 bg-slate-900/95 pr-2 border-r border-slate-800/80">
              VIDEO 1
            </div>
            <div className="flex-1 h-5 bg-indigo-500/20 border border-indigo-500/40 rounded flex items-center justify-between px-2 text-[10px] text-indigo-300 font-mono">
              <span>📹 Video Track</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          {/* Track 3: Audio 1 Track (Simulated Waveform) */}
          <div className="h-8 bg-slate-900/90 border border-slate-800 rounded-lg relative overflow-hidden flex items-center px-2">
            <div className="text-[10px] font-bold text-cyan-400 mr-2 z-10 sticky left-0 bg-slate-900/95 pr-2 border-r border-slate-800/80">
              AUDIO 1
            </div>
            <div className="flex-1 h-5 bg-cyan-500/10 border border-cyan-500/30 rounded flex items-center overflow-hidden px-1">
              {/* Waveform graphic bars */}
              <div className="w-full h-full flex items-center gap-0.5 opacity-60">
                {Array.from({ length: 80 }).map((_, i) => (
                  <div
                    key={i}
                    className="flex-1 bg-cyan-400 rounded-full"
                    style={{ height: `${20 + (i % 7) * 12}%` }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatTime(sec) {
  if (sec == null || isNaN(sec)) return '00:00.0';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.floor((sec - Math.floor(sec)) * 10);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms}`;
}
