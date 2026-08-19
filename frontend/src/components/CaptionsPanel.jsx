/**
 * SUBLYX — Captions Panel Component
 * Left panel displaying numbered subtitle list, word keyword chips, inline text editor, and segment controls
 */

import { useState } from 'react';

export default function CaptionsPanel({
  captions,
  selectedCaptionId,
  selectedWord,
  onSelectWord,
  onMoveWord,
  currentTime,
  onSelectCaption,
  onUpdateCaptionText,
  onUpdateCaptionTiming,
  onAddCaptionLine,
  onDeleteCaptionLine,
  onToggleKeyword,
  onSplitCaption,
  onTrimStart,
  onTrimEnd,
}) {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredCaptions = captions.filter(
    (c) =>
      c.translated_text.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (c.source_text && c.source_text.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <aside className="w-80 sm:w-96 bg-slate-900 border-r border-slate-800 flex flex-col shrink-0 overflow-hidden">
      {/* Panel Header */}
      <div className="p-3 border-b border-slate-800 flex items-center justify-between gap-2 bg-slate-950/40">
        <div className="flex items-center gap-2">
          <h2 className="text-xs font-bold text-slate-100 uppercase tracking-wider">
            Captions
          </h2>
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-800 text-emerald-400">
            {captions.length} lines
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={onSplitCaption}
            title="Split Active Line at Playhead (C or S)"
            className="text-[11px] bg-slate-800 hover:bg-emerald-500/20 text-slate-300 hover:text-emerald-300 px-2 py-1 rounded-md border border-slate-700 font-semibold flex items-center gap-1 transition-all cursor-pointer"
          >
            <span>✂️</span> Split
          </button>
          <button
            onClick={onAddCaptionLine}
            title="Add New Line (+)"
            className="text-[11px] bg-emerald-500 hover:bg-emerald-400 text-slate-950 px-2.5 py-1 rounded-md font-bold flex items-center gap-1 transition-all cursor-pointer shadow-sm"
          >
            <span>+</span> Add Line
          </button>
        </div>
      </div>

      {/* Search Input */}
      <div className="p-2.5 border-b border-slate-800/80 bg-slate-950/20">
        <div className="relative">
          <input
            type="text"
            placeholder="Search captions..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-800/70 border border-slate-700/60 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
          />
          <svg className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
      </div>

      {/* Caption List */}
      <div className="flex-1 overflow-y-auto p-2.5 space-y-2.5">
        {filteredCaptions.map((cap) => {
          const isSelected = cap.id === selectedCaptionId;
          const isCurrentlyActive = currentTime >= cap.start && currentTime <= cap.end;

          return (
            <div
              key={cap.id}
              onClick={() => onSelectCaption(cap.id, cap.start)}
              className={`p-3 rounded-xl border transition-all cursor-pointer ${
                isCurrentlyActive
                  ? 'bg-slate-800/95 border-emerald-400 ring-1 ring-emerald-400/40 shadow-lg'
                  : isSelected
                  ? 'bg-slate-800 border-emerald-500/80 shadow-md'
                  : 'bg-slate-950/60 border-slate-800/80 hover:border-slate-700 hover:bg-slate-850'
              }`}
            >
              {/* Top metadata row with precise timing nudge controls */}
              <div className="flex items-center justify-between mb-2 text-[11px] text-slate-400 font-mono">
                <div className="flex items-center gap-1.5">
                  <span
                    className={`w-5 h-5 rounded-md font-bold flex items-center justify-center text-[10px] ${
                      isCurrentlyActive
                        ? 'bg-emerald-400 text-slate-950 animate-pulse'
                        : 'bg-emerald-500/20 text-emerald-400'
                    }`}
                  >
                    {cap.id}
                  </span>

                  {/* Start time with nudge */}
                  <div className="flex items-center bg-slate-900 px-1 py-0.5 rounded border border-slate-800 gap-0.5">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onUpdateCaptionTiming(cap.id, 'start', Math.max(0, cap.start - 0.1));
                      }}
                      title="Nudge start -0.1s"
                      className="px-1 hover:text-emerald-400 font-bold"
                    >
                      -
                    </button>
                    <span className="font-semibold text-slate-300">{formatTime(cap.start)}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onUpdateCaptionTiming(cap.id, 'start', cap.start + 0.1);
                      }}
                      title="Nudge start +0.1s"
                      className="px-1 hover:text-emerald-400 font-bold"
                    >
                      +
                    </button>
                  </div>

                  <span>→</span>

                  {/* End time with nudge */}
                  <div className="flex items-center bg-slate-900 px-1 py-0.5 rounded border border-slate-800 gap-0.5">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onUpdateCaptionTiming(cap.id, 'end', Math.max(cap.start + 0.1, cap.end - 0.1));
                      }}
                      title="Nudge end -0.1s"
                      className="px-1 hover:text-emerald-400 font-bold"
                    >
                      -
                    </button>
                    <span className="font-semibold text-slate-300">{formatTime(cap.end)}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onUpdateCaptionTiming(cap.id, 'end', cap.end + 0.1);
                      }}
                      title="Nudge end +0.1s"
                      className="px-1 hover:text-emerald-400 font-bold"
                    >
                      +
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteCaptionLine(cap.id);
                    }}
                    title="Delete caption line"
                    className="p-1 hover:text-red-400 text-slate-500 rounded transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Editable Translated Text */}
              <textarea
                rows={2}
                value={cap.translated_text}
                onChange={(e) => onUpdateCaptionText(cap.id, e.target.value)}
                onClick={(e) => e.stopPropagation()}
                onSelect={(e) => {
                  const text = e.target.value;
                  const start = e.target.selectionStart;
                  const end = e.target.selectionEnd;
                  if (start < end) {
                    const selText = text.substring(start, end).trim();
                    if (selText && !selText.includes(' ')) {
                      const words = text.split(/\s+/);
                      let currIdx = 0;
                      for (let i = 0; i < words.length; i++) {
                        const w = words[i];
                        const wPos = text.indexOf(w, currIdx);
                        if (start >= wPos && end <= wPos + w.length + 1) {
                          onSelectWord({ captionId: cap.id, wordIndex: i, wordText: w });
                          break;
                        }
                        currIdx = wPos + w.length;
                      }
                    }
                  }
                }}
                className="w-full bg-slate-900/90 border border-slate-700/60 rounded-lg p-2 text-xs text-slate-100 font-medium leading-relaxed resize-none focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
              />

              {/* Original Source Text Sub-row */}
              {cap.source_text && cap.source_text !== cap.translated_text && (
                <div className="mt-1 text-[11px] text-slate-500 italic truncate">
                  Source: {cap.source_text}
                </div>
              )}

              {/* Highlighted Keyword Chips & Word Navigation Controls */}
              <div className="mt-2.5 flex flex-wrap gap-1.5 items-center">
                <span className="text-[10px] uppercase font-bold text-slate-500 mr-1">Words:</span>
                {cap.translated_text.split(/\s+/).map((word, wIdx) => {
                  const cleanWord = word.replace(/[^\w]/g, '');
                  if (!cleanWord) return null;
                  const isKeyword = cap.keywords?.includes(cleanWord);
                  const isWordSelected = selectedWord?.captionId === cap.id && selectedWord?.wordIndex === wIdx;
                  const capIndex = captions.findIndex((c) => c.id === cap.id);
                  const isFirstCaption = capIndex === 0;
                  const isLastCaption = capIndex === captions.length - 1;

                  return (
                    <div key={wIdx} className="relative inline-flex flex-col items-center">
                      {/* Contextual Floating Control Bar for Selected Word */}
                      {isWordSelected && (
                        <div className="absolute bottom-full mb-1 flex items-center gap-1 bg-slate-950 border border-emerald-500/80 rounded-lg p-1 shadow-2xl z-30 text-[10px] animate-scale-up whitespace-nowrap">
                          <button
                            disabled={isFirstCaption}
                            onClick={(e) => {
                              e.stopPropagation();
                              onMoveWord(cap.id, wIdx, 'previous');
                            }}
                            title={isFirstCaption ? 'First caption line' : 'Move word to previous caption'}
                            className="px-2 py-0.5 bg-slate-800 hover:bg-emerald-500/20 disabled:opacity-30 disabled:hover:bg-slate-800 text-emerald-400 font-bold rounded flex items-center gap-0.5 transition-all cursor-pointer disabled:cursor-not-allowed border border-slate-700/60"
                          >
                            <span>←</span> Previous
                          </button>
                          <div className="w-px h-3.5 bg-slate-800" />
                          <button
                            disabled={isLastCaption}
                            onClick={(e) => {
                              e.stopPropagation();
                              onMoveWord(cap.id, wIdx, 'forward');
                            }}
                            title={isLastCaption ? 'Last caption line' : 'Move word to next caption'}
                            className="px-2 py-0.5 bg-slate-800 hover:bg-emerald-500/20 disabled:opacity-30 disabled:hover:bg-slate-800 text-emerald-400 font-bold rounded flex items-center gap-0.5 transition-all cursor-pointer disabled:cursor-not-allowed border border-slate-700/60"
                          >
                            Forward <span>→</span>
                          </button>
                        </div>
                      )}

                      {/* Word Chip */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (isWordSelected) {
                            onToggleKeyword(cap.id, cleanWord);
                          } else {
                            onSelectWord({ captionId: cap.id, wordIndex: wIdx, wordText: word });
                          }
                        }}
                        className={`text-[10px] px-2 py-0.5 rounded font-bold transition-all cursor-pointer border ${
                          isWordSelected
                            ? 'bg-emerald-400 text-slate-950 border-emerald-300 ring-2 ring-emerald-400/50 shadow-md scale-105 z-10'
                            : isKeyword
                            ? 'bg-amber-400/20 text-amber-300 border border-amber-400/40 shadow-sm hover:border-amber-300'
                            : 'bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-700/50 hover:border-slate-600'
                        }`}
                      >
                        {word}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}

function formatTime(sec) {
  if (sec == null || isNaN(sec)) return '00:00.0';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.floor((sec - Math.floor(sec)) * 10);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms}`;
}

