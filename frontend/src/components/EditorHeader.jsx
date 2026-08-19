import { useState, useRef, useEffect } from 'react';

const RESOLUTION_OPTIONS = [
  { id: 'original', label: '🏆 Highest Resolution (Original / 1080p / 4K)', badge: 'Best Quality' },
  { id: '720p', label: '🌟 720p HD (Fast & High Quality)', badge: 'Recommended' },
  { id: '480p', label: '⚡ 480p SD (Standard Quality)', badge: 'Balanced' },
  { id: '360p', label: '📱 360p Mobile (Fast Share)', badge: 'Compact' },
  { id: '240p', label: '💾 240p Ultra Compact', badge: 'Smallest File' },
];

export default function EditorHeader({
  projectName,
  onProjectNameChange,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onExportSrt,
  onExportVideo,
  isExportingVideo,
  onNewProject,
  onSaveProject,
  saveStatus,
  autoSaveEnabled,
  onToggleAutoSave,
  lastSavedTime,
}) {
  const [selectedRes, setSelectedRes] = useState('original');
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="h-14 bg-slate-900 border-b border-slate-800 px-4 flex items-center justify-between shrink-0 select-none z-20">
      {/* Back Button & Brand & Project Title */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => {
            if (window.confirm('Go back to upload? Your current edits will be saved.')) {
              onSaveProject?.();
              onNewProject();
            }
          }}
          title="Back to Upload"
          className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-slate-100 flex items-center justify-center transition-all cursor-pointer border border-slate-700/60"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        <button
          onClick={onNewProject}
          className="flex items-center gap-2 text-emerald-400 font-extrabold text-lg tracking-tight hover:opacity-90 transition-opacity cursor-pointer"
        >
          <div className="w-7 h-7 rounded-lg bg-emerald-500 text-slate-950 flex items-center justify-center font-black text-xs shadow-md">
            RX
          </div>
          <span>REELIX</span>
        </button>

        <div className="h-4 w-px bg-slate-800" />

        <input
          type="text"
          value={projectName}
          onChange={(e) => onProjectNameChange(e.target.value)}
          className="bg-transparent text-sm font-semibold text-slate-200 focus:bg-slate-800/60 hover:bg-slate-800/40 px-2 py-1 rounded border border-transparent focus:border-slate-700 outline-none w-48 transition-all"
        />
      </div>

      {/* Center Controls: Undo / Redo & Save / Auto-Save */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1 bg-slate-950/60 border border-slate-800 rounded-lg p-1">
          <button
            onClick={onUndo}
            disabled={!canUndo}
            title="Undo (Ctrl+Z)"
            className="p-1.5 text-slate-400 hover:text-slate-200 disabled:text-slate-700 hover:bg-slate-800 rounded transition-all cursor-pointer disabled:cursor-not-allowed"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
            </svg>
          </button>
          <button
            onClick={onRedo}
            disabled={!canRedo}
            title="Redo (Ctrl+Y)"
            className="p-1.5 text-slate-400 hover:text-slate-200 disabled:text-slate-700 hover:bg-slate-800 rounded transition-all cursor-pointer disabled:cursor-not-allowed"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 10H11a8 8 0 00-8 8v2m18-10l-6 6m6-6l-6-6" />
            </svg>
          </button>
        </div>

        {/* Manual Save Project Button */}
        <button
          onClick={() => onSaveProject?.(false)}
          title="Save Project to Supabase Cloud & Local Backup"
          className="px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-xs font-bold rounded-lg border border-emerald-500/30 transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
        >
          {saveStatus === 'saving' ? (
            <>
              <div className="w-3 h-3 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
              <span>Saving...</span>
            </>
          ) : (
            <>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
              </svg>
              <span>Save Project</span>
            </>
          )}
        </button>

        {/* Auto Save Toggle Switch */}
        <button
          onClick={onToggleAutoSave}
          title={autoSaveEnabled ? 'Auto-Save is ON (Changes save automatically)' : 'Auto-Save is OFF'}
          className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-all flex items-center gap-1.5 cursor-pointer ${
            autoSaveEnabled
              ? 'bg-slate-800 text-emerald-300 border-emerald-500/40'
              : 'bg-slate-900 text-slate-500 border-slate-800'
          }`}
        >
          <span className={`w-2 h-2 rounded-full ${autoSaveEnabled ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
          <span>Auto Save</span>
          <span className={`text-[10px] px-1.5 py-0.2 rounded font-mono font-black ${
            autoSaveEnabled ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-600'
          }`}>
            {autoSaveEnabled ? 'ON' : 'OFF'}
          </span>
        </button>

        {/* Saved Status Indicator */}
        {lastSavedTime && (
          <span className="text-[10px] font-mono text-slate-400 hidden lg:inline-block">
            Synced {lastSavedTime}
          </span>
        )}
      </div>

      {/* Right Controls: Downloads & Multi-Resolution Export */}
      <div className="flex items-center gap-2.5">
        <button
          onClick={async () => {
            try {
              const res = await fetch('http://localhost:8000/api/supabase/status');
              const data = await res.json();
              if (data.configured) {
                alert(`⚡ Supabase Connection Status:\n\n${data.status}`);
              } else {
                alert(`⚡ Supabase Connection Setup:\n\n1. Open your .env file\n2. Add your SUPABASE_URL and SUPABASE_ANON_KEY\n3. Run the backend SQL script from backend/data/supabase_schema.sql`);
              }
            } catch (err) {
              alert('Could not connect to backend Supabase status API.');
            }
          }}
          title="Supabase Cloud Sync Status"
          className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg border border-slate-700/60 transition-all flex items-center gap-1.5 cursor-pointer"
        >
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>Supabase</span>
        </button>

        <button
          onClick={onExportSrt}
          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700/60 transition-all flex items-center gap-1.5 cursor-pointer"
        >
          <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Download SRT
        </button>

        {/* Multi-Resolution Export Button & Dropdown */}
        <div className="relative" ref={dropdownRef}>
          <div className="flex items-center rounded-lg shadow-md shadow-emerald-500/20 bg-emerald-500 overflow-hidden">
            {/* Primary Action Button */}
            <button
              onClick={() => onExportVideo(selectedRes)}
              disabled={isExportingVideo}
              className="px-3.5 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-extrabold transition-all flex items-center gap-1.5 cursor-pointer uppercase tracking-wider disabled:opacity-50"
            >
              {isExportingVideo ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                  Rendering ({selectedRes.toUpperCase()})...
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  Export ({selectedRes.toUpperCase()})
                </>
              )}
            </button>

            {/* Resolution Selector Dropdown Trigger */}
            <button
              onClick={() => setShowDropdown(!showDropdown)}
              disabled={isExportingVideo}
              title="Select Resolution (1080p, 720p, 480p, 360p, 240p)"
              className="px-2 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-slate-950 border-l border-emerald-700/40 cursor-pointer transition-all disabled:opacity-50"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>

          {/* Resolution Options Popover Menu */}
          {showDropdown && (
            <div className="absolute right-0 top-full mt-2 w-72 bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl p-2 z-50 space-y-1 backdrop-blur-md">
              <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-800">
                Choose Export Resolution
              </div>
              {RESOLUTION_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => {
                    setSelectedRes(opt.id);
                    setShowDropdown(false);
                    onExportVideo(opt.id);
                  }}
                  className={`w-full text-left px-2.5 py-2 rounded-lg text-xs font-semibold flex items-center justify-between transition-all cursor-pointer ${
                    selectedRes === opt.id
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-slate-100'
                  }`}
                >
                  <span className="truncate">{opt.label}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-bold shrink-0 ${
                    selectedRes === opt.id ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-slate-400'
                  }`}>
                    {opt.badge}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

