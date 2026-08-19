import React, { useState, useEffect } from 'react';

const RENDERING_PHASES = [
  { min: 0, max: 12, label: 'Initializing export pipeline & hardware acceleration...' },
  { min: 12, max: 28, label: 'Extracting video layers & analyzing dimensions...' },
  { min: 28, max: 48, label: 'Generating vector ASS subtitle layers...' },
  { min: 48, max: 74, label: 'Applying high-fidelity studio typography burn-in...' },
  { min: 74, max: 88, label: 'Executing color space matrices & pixel inversion...' },
  { min: 88, max: 96, label: 'Multiplexing original AAC audio channels...' },
  { min: 96, max: 99, label: 'Finalizing MP4 container & compression pass...' },
  { min: 100, max: 100, label: 'Export complete!' }
];

export default function RenderingProgressModal({ isDifferenceMode, resolution }) {
  const [progress, setProgress] = useState(0);
  const [phaseText, setPhaseText] = useState(RENDERING_PHASES[0].label);
  const [elapsedTime, setElapsedTime] = useState(0);

  // Progressive optimistic counter
  useEffect(() => {
    let startTime = Date.now();
    
    const interval = setInterval(() => {
      setElapsedTime(Math.round((Date.now() - startTime) / 1000));
      
      setProgress((prev) => {
        if (prev >= 98) return 98; // Hold until done
        
        // Difference blend mode is heavier and takes longer, so increment slightly slower
        const stepMax = isDifferenceMode ? 1.5 : 3;
        const step = 0.5 + Math.random() * stepMax;
        const next = Math.min(98, prev + step);
        return parseFloat(next.toFixed(1));
      });
    }, 150);

    return () => clearInterval(interval);
  }, [isDifferenceMode]);

  // Update status labels based on current progress
  useEffect(() => {
    const currentPhase = RENDERING_PHASES.find(
      (phase) => progress >= phase.min && progress <= phase.max
    );
    if (currentPhase) {
      // Customize dynamic difference engine message
      if (isDifferenceMode && currentPhase.min === 74) {
        setPhaseText('Executing GPU-equivalent pixel inversion difference composites...');
      } else {
        setPhaseText(currentPhase.label);
      }
    }
  }, [progress, isDifferenceMode]);

  // Calculations for SVGs
  const radius = 64;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-xl animate-fade-in">
      {/* Insane Glowing Card Container */}
      <div className="relative w-full max-w-lg p-8 mx-4 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-[0_0_50px_rgba(16,185,129,0.15)] flex flex-col items-center overflow-hidden animate-scale-up">
        
        {/* Glow Elements */}
        <div className="absolute -top-24 -left-24 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none animate-pulse" />
        <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-emerald-400/10 rounded-full blur-3xl pointer-events-none animate-pulse" />

        {/* Top Header Badge */}
        <div className="flex items-center gap-2 px-3 py-1 mb-6 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold tracking-widest uppercase animate-pulse">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          Rendering Engine Active
        </div>

        {/* Circular Progress Section */}
        <div className="relative flex items-center justify-center w-40 h-40 mb-6">
          <svg className="w-full h-full transform -rotate-90">
            {/* Background Circle */}
            <circle
              cx="80"
              cy="80"
              r={radius}
              className="stroke-slate-800"
              strokeWidth="8"
              fill="transparent"
            />
            {/* Foreground Gradient Circle */}
            <circle
              cx="80"
              cy="80"
              r={radius}
              stroke="url(#progressGradient)"
              strokeWidth="8"
              fill="transparent"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              className="transition-all duration-300 ease-out"
            />
            {/* Gradient Definitions */}
            <defs>
              <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#10b981" />
                <stop offset="50%" stopColor="#34d399" />
                <stop offset="100%" stopColor="#059669" />
              </linearGradient>
            </defs>
          </svg>

          {/* Absolute Center Counter */}
          <div className="absolute flex flex-col items-center justify-center">
            <span className="text-4xl font-black text-slate-50 tracking-tighter">
              {Math.floor(progress)}
              <span className="text-lg text-emerald-400 font-medium">%</span>
            </span>
            <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">
              Progress
            </span>
          </div>
        </div>

        {/* Progress Bar Detail */}
        <div className="w-full bg-slate-950 rounded-full h-1.5 mb-6 overflow-hidden border border-slate-800">
          <div
            className="bg-gradient-to-r from-emerald-500 via-emerald-400 to-teal-500 h-full rounded-full transition-all duration-300 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Stage Status Text */}
        <div className="w-full text-center min-h-[48px] flex flex-col justify-center">
          <h4 className="text-slate-200 text-sm font-bold tracking-wide transition-all">
            {phaseText}
          </h4>
          <span className="text-xs text-slate-500 mt-1">
            Running resolution: <span className="text-slate-300 font-semibold font-mono uppercase">{resolution === 'original' ? 'Original/1080p' : resolution}</span>
          </span>
        </div>

        {/* Details Footer */}
        <div className="w-full border-t border-slate-800/80 mt-6 pt-4 flex justify-between text-xs text-slate-400">
          <div className="flex flex-col items-start">
            <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Elapsed Time</span>
            <span className="text-slate-200 font-mono font-medium">{elapsedTime}s</span>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Rendering Method</span>
            <span className="text-slate-200 font-medium">
              {isDifferenceMode ? 'True Pixel Inversion (GPU-piped)' : 'LibASS Vector Burn'}
            </span>
          </div>
        </div>

      </div>
    </div>
  );
}
