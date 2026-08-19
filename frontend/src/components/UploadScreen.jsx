/**
 * SUBLYX — Upload Screen Component
 * Polished studio dropzone with target language selection and stage indicators
 */

import { useState } from 'react';

const TARGET_LANGUAGES = [
  'English',
  'Tamil',
  'Hindi',
  'Malayalam',
  'Telugu',
  'Kannada',
  'Bengali',
  'Arabic',
  'French',
  'Spanish',
  'German',
  'Japanese',
  'Chinese',
];

export default function UploadScreen({ onUploadStart, isProcessing, currentStage, error }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [spokenLang, setSpokenLang] = useState('Auto Detect');
  const [targetLang, setTargetLang] = useState('English');
  const [dragActive, setDragActive] = useState(false);

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setDragActive(true);
  };

  const handleDragLeave = () => {
    setDragActive(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setSelectedFile(e.dataTransfer.files[0]);
    }
  };

  const handleSubmit = () => {
    if (selectedFile) {
      onUploadStart(selectedFile, spokenLang, targetLang);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center px-4 py-8 relative overflow-hidden">
      {/* Background Studio Gradients */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-emerald-500/10 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-96 h-96 bg-indigo-500/10 rounded-full blur-[120px] pointer-events-none" />

      {/* Brand Header */}
      <div className="text-center mb-8 relative z-10">
        <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 px-3.5 py-1.5 rounded-full text-emerald-400 text-xs font-extrabold tracking-wider uppercase mb-4 shadow-sm">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>REELIX FREE TIER PLAN</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono font-bold">
            5GB Cloud &bull; Unlimited Local
          </span>
        </div>
        <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-white font-['Satoshi']">
          REELIX <span className="text-emerald-400">STUDIO</span>
        </h1>
        <p className="text-slate-400 text-sm sm:text-base mt-2 max-w-lg mx-auto">
          Upload any video to extract speech, translate captions into 13+ languages, edit in real-time, and export broadcast-quality video or SRT subtitles.
        </p>
      </div>

      {/* Main Upload Card */}
      <div className="w-full max-w-xl bg-slate-900/90 border border-slate-800 rounded-2xl p-6 sm:p-8 backdrop-blur-xl shadow-2xl relative z-10">
        {/* Dropzone */}
        {!isProcessing ? (
          <>
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer ${
                dragActive
                  ? 'border-emerald-400 bg-emerald-500/10 scale-[1.01]'
                  : selectedFile
                  ? 'border-emerald-500/50 bg-slate-850'
                  : 'border-slate-700/80 hover:border-slate-500 bg-slate-950/60'
              }`}
              onClick={() => document.getElementById('video-input').click()}
            >
              <input
                id="video-input"
                type="file"
                accept="video/mp4,video/mov,video/webm,video/mkv"
                className="hidden"
                onChange={handleFileChange}
              />

              <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mb-4 shadow-lg">
                <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </div>

              {selectedFile ? (
                <div>
                  <div className="text-base font-semibold text-emerald-400 truncate max-w-md mx-auto">
                    {selectedFile.name}
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB &middot; Click or drag to replace
                  </div>
                </div>
              ) : (
                <div>
                  <div className="text-base font-semibold text-slate-200">
                    Drag & drop your video here
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    Supports MP4, MOV, WEBM, MKV (up to 500MB)
                  </div>
                </div>
              )}
            </div>

            {/* Language Selectors */}
            <div className="grid grid-cols-2 gap-4 mt-6">
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Spoken Language
                </label>
                <select
                  value={spokenLang}
                  onChange={(e) => setSpokenLang(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
                >
                  <option value="Auto Detect">⚡ Auto Detect</option>
                  {TARGET_LANGUAGES.map((l) => (
                    <option key={l} value={l}>{l}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Caption Language
                </label>
                <select
                  value={targetLang}
                  onChange={(e) => setTargetLang(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-emerald-500 font-medium"
                >
                  {TARGET_LANGUAGES.map((l) => (
                    <option key={l} value={l}>{l}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-400">
                ⚠ {error}
              </div>
            )}

            {/* Submit Button */}
            <button
              onClick={handleSubmit}
              disabled={!selectedFile}
              className="w-full mt-6 py-3.5 bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-800 disabled:text-slate-600 text-slate-950 font-bold rounded-xl text-sm transition-all duration-150 cursor-pointer disabled:cursor-not-allowed shadow-lg shadow-emerald-500/20 uppercase tracking-wider"
            >
              Generate AI Captions
            </button>
          </>
        ) : (
          /* Processing Stage Indicator */
          <div className="py-8 text-center space-y-6">
            <div className="relative w-16 h-16 mx-auto">
              <div className="absolute inset-0 rounded-full border-4 border-emerald-500/20" />
              <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-emerald-400 animate-spin" />
            </div>

            <div>
              <div className="text-lg font-bold text-slate-100">
                {currentStage || 'Processing Video...'}
              </div>
              <div className="text-xs text-slate-400 mt-1">
                Extracting audio &middot; Groq Whisper Large-V3 &middot; Llama 3.3 Translation
              </div>
            </div>

            <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
              <div className="bg-emerald-400 h-full w-2/3 animate-pulse" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
