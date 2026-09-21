/**
 * SUBLYX — Upload Screen Component
 * Polished studio dropzone with target language selection and stage indicators
 */

import { useState } from 'react';
import InsaneProcessingAnimation from './InsaneProcessingAnimation';
import ErrorBoundary from './ErrorBoundary';

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
      {/* Background Studio Cybernetic Gradients & Mesh */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] bg-emerald-500/10 rounded-full blur-[150px] pointer-events-none animate-pulse-laser" />
      <div className="absolute bottom-10 right-10 w-[500px] h-[500px] bg-cyan-500/10 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute top-10 left-10 w-96 h-96 bg-purple-500/5 rounded-full blur-[130px] pointer-events-none" />

      {/* Brand Header */}
      <div className="text-center mb-6 relative z-10">
        <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 px-3.5 py-1.5 rounded-full text-emerald-400 text-xs font-extrabold tracking-wider uppercase mb-3 shadow-lg shadow-emerald-500/10">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
          <span>REELIX STUDIO AI PIPELINE</span>
          <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono font-bold border border-emerald-500/30">
            GROQ LPU &bull; SUPABASE
          </span>
        </div>
        <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-white font-['Satoshi'] drop-shadow-md">
          REELIX <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400">STUDIO</span>
        </h1>
        <p className="text-slate-400 text-sm sm:text-base mt-2 max-w-lg mx-auto leading-relaxed">
          Upload any video to extract speech, translate captions into 13+ languages, edit in real-time, and export broadcast-quality video or SRT subtitles.
        </p>
      </div>

      {/* Main Upload / Processing Card */}
      <div
        className={`w-full ${isProcessing ? 'max-w-2xl' : 'max-w-xl'
          } bg-slate-900/90 border border-slate-800/90 rounded-3xl p-6 sm:p-8 backdrop-blur-2xl shadow-[0_0_50px_rgba(0,0,0,0.5)] relative z-10 transition-all duration-500 ease-out`}
      >
        {/* Glow Border accents */}
        <div className="absolute -top-px left-10 right-10 h-px bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent" />
        <div className="absolute -bottom-px left-10 right-10 h-px bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent" />

        {!isProcessing ? (
          <>
            {/* Dropzone */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-2xl p-8 text-center transition-all cursor-pointer relative group ${dragActive
                ? 'border-emerald-400 bg-emerald-500/15 scale-[1.01] shadow-[0_0_25px_rgba(16,185,129,0.2)]'
                : selectedFile
                  ? 'border-emerald-500/50 bg-slate-850/80 shadow-[0_0_20px_rgba(16,185,129,0.1)]'
                  : 'border-slate-700/80 hover:border-emerald-500/50 bg-slate-950/60 hover:bg-slate-950/80'
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

              <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mb-4 shadow-lg group-hover:scale-105 transition-transform duration-200">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </div>

              {selectedFile ? (
                <div>
                  <div className="text-base font-bold text-emerald-400 truncate max-w-md mx-auto flex items-center justify-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    <span>{selectedFile.name}</span>
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB &bull; Ready to process &bull; Click to replace
                  </div>
                </div>
              ) : (
                <div>
                  <div className="text-base font-bold text-slate-100 group-hover:text-emerald-400 transition-colors">
                    Drag & drop your video here
                  </div>
                  <div className="text-xs text-slate-400 mt-1.5">
                    Supports MP4, MOV, WEBM, MKV (up to 500MB)
                  </div>
                </div>
              )}
            </div>

            {/* Language Selectors */}
            <div className="grid grid-cols-2 gap-4 mt-6">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Spoken Language
                </label>
                <select
                  value={spokenLang}
                  onChange={(e) => setSpokenLang(e.target.value)}
                  className="w-full bg-slate-950/80 border border-slate-700/80 rounded-xl px-3.5 py-3 text-sm text-slate-200 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
                >
                  <option value="Auto Detect">⚡ Auto Detect (Whisper)</option>
                  {TARGET_LANGUAGES.map((l) => (
                    <option key={l} value={l}>{l}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Target Language
                </label>
                <select
                  value={targetLang}
                  onChange={(e) => setTargetLang(e.target.value)}
                  className="w-full bg-slate-950/80 border border-slate-700/80 rounded-xl px-3.5 py-3 text-sm text-slate-200 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-medium"
                >
                  {TARGET_LANGUAGES.map((l) => (
                    <option key={l} value={l}>{l}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="mt-4 p-3.5 bg-red-500/10 border border-red-500/30 rounded-xl text-xs text-red-400 flex items-center gap-2">
                <span>⚠</span>
                <span>{error}</span>
              </div>
            )}

            {/* Submit Button */}
            <button
              onClick={handleSubmit}
              disabled={!selectedFile}
              className="w-full mt-6 py-4 bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-500 hover:from-emerald-400 hover:to-teal-300 disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-600 text-slate-950 font-black rounded-xl text-sm transition-all duration-200 cursor-pointer disabled:cursor-not-allowed shadow-[0_0_25px_rgba(16,185,129,0.3)] hover:shadow-[0_0_35px_rgba(16,185,129,0.5)] uppercase tracking-wider active:scale-[0.99]"
            >
              Generate AI Captions
            </button>
          </>
        ) : (
          /* Insane Real-Time Loading & Processing Animation with Fail-Safe Boundary */
          <ErrorBoundary
            fallback={
              <div className="flex flex-col items-center justify-center p-8 space-y-4 text-center select-none">
                <div className="w-14 h-14 rounded-full border-4 border-emerald-500/20 border-t-emerald-400 animate-spin" />
                <div className="text-emerald-400 text-sm font-mono font-bold uppercase tracking-wider">
                  {currentStage || 'Processing AI Captions...'}
                </div>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">
                  Extracting audio, transcribing with Whisper Large-V3, and formatting kinetic reels...
                </p>
              </div>
            }
          >
            <InsaneProcessingAnimation
              currentStage={currentStage}
              videoName={selectedFile?.name}
            />
          </ErrorBoundary>
        )}
      </div>
    </div>
  );
}

