import React, { useEffect, useRef, useState } from 'react';

const PIPELINE_STAGES = [
  {
    id: 'audio',
    title: 'Audio Demux & Spectral Decomposition',
    subtitle: 'FFmpeg 16kHz PCM mono stream extraction',
    tag: 'FFmpeg 4.4',
    icon: '🎵',
    targetPercent: 25,
  },
  {
    id: 'whisper',
    title: 'Whisper Large-V3 Neural Transcription',
    subtitle: 'Groq LPU accelerated acoustic inference (word timestamps)',
    tag: 'Groq Whisper V3',
    icon: '🧠',
    targetPercent: 65,
  },
  {
    id: 'align',
    title: 'Phoneme Alignment & Sentence Slicing',
    subtitle: 'Syntactic boundary mapping & kinetic word segmentation',
    tag: 'Reelix Engine',
    icon: '⚡',
    targetPercent: 85,
  },
  {
    id: 'enrich',
    title: 'LLM Kinetic Enrichment & Reel Synthesis',
    subtitle: 'Llama 3.3 punchword extraction & studio timeline assembly',
    tag: 'Llama 3.3',
    icon: '✨',
    targetPercent: 98,
  },
];

const LOG_MESSAGES = [
  { time: '+0.12s', text: '[AUDIO.CORE] Initializing FFmpeg demuxer pipeline...' },
  { time: '+0.34s', text: '[AUDIO.CORE] Stream 0:1 mapped -> 16,000 Hz, 16-bit PCM mono' },
  { time: '+0.88s', text: '[GROQ.LPU] Dispatching acoustic stream to Whisper Large-V3...' },
  { time: '+1.45s', text: '[AI.NEURAL] 80-channel log-Mel filterbank extraction active' },
  { time: '+2.10s', text: '[AI.NEURAL] Beam search decoding with temperature fallback (t=0.0)' },
  { time: '+2.85s', text: '[TIMECODE] Aligning sub-second word timestamps & confidence scores' },
  { time: '+3.40s', text: '[LLM.AGENT] Llama 3.3 detecting viral kinetic punchwords...' },
  { time: '+4.10s', text: '[STUDIO.GEN] Compiling ASS subtitle timeline & visual keyframes...' },
  { time: '+4.75s', text: '[COMPLETION] Finalizing studio timeline buffer...' },
];

export default function InsaneProcessingAnimation({ currentStage, videoName }) {
  const canvasRef = useRef(null);
  const [progress, setProgress] = useState(3.5);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [activeStageIdx, setActiveStageIdx] = useState(0);
  const [logs, setLogs] = useState([]);
  const logsEndRef = useRef(null);

  // Progressive real-time ticker & timer
  useEffect(() => {
    const startTime = Date.now();
    let logIdx = 0;

    const timer = setInterval(() => {
      const now = Date.now();
      const elapsed = now - startTime;
      setElapsedMs(elapsed);

      // Smooth progress curve (fast at start, asymptotic approaching 98% until backend completes)
      setProgress((prev) => {
        if (prev >= 98.5) return 98.5;
        // Asymptotic velocity
        const remaining = 99 - prev;
        const delta = Math.max(0.08, remaining * 0.035 + (Math.random() * 0.15));
        return parseFloat(Math.min(98.8, prev + delta).toFixed(1));
      });
    }, 50);

    // Stream live logs
    const logInterval = setInterval(() => {
      if (logIdx < LOG_MESSAGES.length) {
        setLogs((prev) => [...prev, LOG_MESSAGES[logIdx]]);
        logIdx++;
      }
    }, 600);

    return () => {
      clearInterval(timer);
      clearInterval(logInterval);
    };
  }, []);

  // Update active stage based on progress
  useEffect(() => {
    if (progress < 28) setActiveStageIdx(0);
    else if (progress < 68) setActiveStageIdx(1);
    else if (progress < 88) setActiveStageIdx(2);
    else setActiveStageIdx(3);
  }, [progress]);

  // Scroll logs to bottom
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollTop = logsEndRef.current.scrollHeight;
    }
  }, [logs]);

  // High-FPS Realtime Neural Audio Waveform Canvas Animation
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let animationFrameId;
    let phase = 0;

    // Particle nodes
    const particles = Array.from({ length: 40 }, () => ({
      x: Math.random() * 600,
      y: Math.random() * 120,
      radius: Math.random() * 2 + 1,
      speedX: (Math.random() - 0.5) * 0.8,
      speedY: (Math.random() - 0.5) * 0.8,
      alpha: Math.random() * 0.7 + 0.3,
    }));

    const render = () => {
      try {
        const width = canvas.width || 520;
        const height = canvas.height || 64;
        if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
          animationFrameId = requestAnimationFrame(render);
          return;
        }

        ctx.clearRect(0, 0, width, height);

        // Draw subtle cyber grid lines
        ctx.strokeStyle = 'rgba(16, 185, 129, 0.06)';
        ctx.lineWidth = 1;
        for (let x = 0; x < width; x += 30) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, height);
          ctx.stroke();
        }

        // Draw floating particles
        particles.forEach((p) => {
          p.x += p.speedX;
          p.y += p.speedY;
          if (p.x < 0) p.x = width;
          if (p.x > width) p.x = 0;
          if (p.y < 0) p.y = height;
          if (p.y > height) p.y = 0;

          if (Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.radius)) {
            ctx.fillStyle = `rgba(52, 211, 153, ${p.alpha * 0.6})`;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
            ctx.fill();
          }
        });

        // Draw Multi-Layered Neon Sine Waveforms (Simulating Neural Speech Spectrum)
        const waves = [
          { amp: 28, freq: 0.025, speed: 0.07, color: 'rgba(16, 185, 129, 0.9)', width: 2.5, glow: '#10b981' },
          { amp: 18, freq: 0.045, speed: -0.05, color: 'rgba(6, 182, 212, 0.8)', width: 2.0, glow: '#06b6d4' },
          { amp: 12, freq: 0.06, speed: 0.09, color: 'rgba(168, 85, 247, 0.7)', width: 1.5, glow: '#a855f7' },
        ];

        waves.forEach((wave) => {
          ctx.save();
          ctx.strokeStyle = wave.color;
          ctx.lineWidth = wave.width;
          ctx.shadowColor = wave.glow;
          ctx.shadowBlur = 12;

          ctx.beginPath();
          let started = false;
          for (let x = 0; x < width; x += 2) {
            const envelope = Math.sin((x / width) * Math.PI);
            const y = height / 2 + Math.sin(x * wave.freq + phase * wave.speed) * wave.amp * envelope * (1 + 0.3 * Math.sin(phase * 0.05));
            if (Number.isFinite(x) && Number.isFinite(y)) {
              if (!started) {
                ctx.moveTo(x, y);
                started = true;
              } else {
                ctx.lineTo(x, y);
              }
            }
          }
          ctx.stroke();
          ctx.restore();
        });

        // Center laser equalizer vertical bars
        const barCount = 32;
        const barSpacing = width / barCount;
        for (let i = 0; i < barCount; i++) {
          const x = i * barSpacing + barSpacing / 2;
          const distFromCenter = Math.abs(i - barCount / 2) / (barCount / 2);
          const barHeight = Math.max(3, Math.abs(Math.sin(i * 0.5 + phase * 0.15)) * 26 * (1 - distFromCenter * 0.6));

          if (Number.isFinite(x) && Number.isFinite(barHeight) && barHeight > 0) {
            const topY = Math.max(0, height / 2 - barHeight);
            const botY = Math.min(height, height / 2 + barHeight);
            if (botY > topY) {
              const barGradient = ctx.createLinearGradient(x, topY, x, botY);
              barGradient.addColorStop(0, 'rgba(6, 182, 212, 0.8)');
              barGradient.addColorStop(0.5, 'rgba(16, 185, 129, 1)');
              barGradient.addColorStop(1, 'rgba(6, 182, 212, 0.8)');

              ctx.fillStyle = barGradient;
              ctx.fillRect(x - 2, topY, 4, botY - topY);
            }
          }
        }

        phase += 1;
      } catch (e) {
        console.warn('Canvas render notice:', e);
      } finally {
        animationFrameId = requestAnimationFrame(render);
      }
    };

    render();

    return () => cancelAnimationFrame(animationFrameId);
  }, []);

  const elapsedSeconds = (elapsedMs / 1000).toFixed(1);
  const radius = 58;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  return (
    <div className="w-full flex flex-col items-center gap-6 relative select-none">
      {/* Top Cybernetic Status Badge */}
      <div className="flex items-center justify-between w-full px-2">
        <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 px-3 py-1 rounded-full text-emerald-400 text-xs font-mono font-bold tracking-wider uppercase">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
          <span className="text-emerald-300">GROQ LPU NEURAL PIPELINE</span>
          <span className="text-[10px] bg-emerald-950/80 text-emerald-300 px-2 py-0.5 rounded border border-emerald-500/40">
            210x REALTIME
          </span>
        </div>

        <div className="text-xs font-mono text-slate-400 flex items-center gap-1.5 bg-slate-900/80 px-2.5 py-1 rounded-lg border border-slate-800">
          <span className="text-slate-500">TIMER</span>
          <span className="text-emerald-400 font-bold">{elapsedSeconds}s</span>
        </div>
      </div>

      {/* Main Holographic Visualizer Core */}
      <div className="relative flex items-center justify-center w-52 h-52 my-1">
        {/* Outer Laser HUD Ring (Spinning Slow) */}
        <div className="absolute inset-0 rounded-full border border-dashed border-emerald-500/30 animate-spin-slow" />
        
        {/* Counter-rotating Cyan Planetary Laser Ring */}
        <div className="absolute inset-2 rounded-full border-t-2 border-b-2 border-cyan-400/40 border-l-transparent border-r-transparent animate-spin-slow-reverse" />

        {/* Third Glowing Fast Orbit Accent */}
        <div className="absolute inset-6 rounded-full border-2 border-t-emerald-400 border-r-transparent border-b-transparent border-l-transparent animate-spin-fast-reverse drop-shadow-[0_0_12px_#10b981]" />

        {/* Ambient Glow Atmosphere */}
        <div className="absolute inset-8 rounded-full bg-gradient-to-br from-emerald-500/20 via-cyan-500/15 to-purple-500/10 blur-xl animate-pulse-laser" />

        {/* SVG Circular Progress Gauge */}
        <svg className="w-full h-full transform -rotate-90 relative z-10">
          {/* Background Track */}
          <circle
            cx="104"
            cy="104"
            r={radius}
            className="stroke-slate-800/80"
            strokeWidth="7"
            fill="transparent"
          />
          {/* Neon Active Progress Arc */}
          <circle
            cx="104"
            cy="104"
            r={radius}
            stroke="url(#insaneProgressGradient)"
            strokeWidth="7"
            fill="transparent"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            className="transition-all duration-150 ease-out"
            style={{ filter: 'drop-shadow(0 0 8px #10b981)' }}
          />
          <defs>
            <linearGradient id="insaneProgressGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#10b981" />
              <stop offset="50%" stopColor="#34d399" />
              <stop offset="100%" stopColor="#06b6d4" />
            </linearGradient>
          </defs>
        </svg>

        {/* Center Percentage & Soundwave Equalizer */}
        <div className="absolute flex flex-col items-center justify-center z-20">
          <div className="text-3xl font-black text-white font-mono tracking-tight flex items-baseline">
            <span>{Math.floor(progress)}</span>
            <span className="text-emerald-400 text-lg font-bold">.{Math.floor((progress % 1) * 10)}%</span>
          </div>

          {/* Micro Equalizer Bars */}
          <div className="flex items-center gap-1 h-3 mt-1">
            {[40, 90, 60, 100, 75, 45, 80].map((h, i) => (
              <div
                key={i}
                className="w-1 bg-emerald-400 rounded-full animate-pulse"
                style={{
                  height: `${h}%`,
                  animationDuration: `${0.4 + i * 0.1}s`,
                  animationDelay: `${i * 0.08}s`,
                }}
              />
            ))}
          </div>

          <span className="text-[9px] text-cyan-400 uppercase tracking-widest font-mono font-bold mt-1">
            PROCESSING
          </span>
        </div>
      </div>

      {/* Real-time Neural Audio Spectrum Canvas */}
      <div className="w-full relative rounded-xl bg-slate-950/90 border border-slate-800 p-2 overflow-hidden shadow-inner">
        <div className="flex items-center justify-between px-2 pb-1.5 border-b border-slate-800/80 text-[10px] font-mono text-slate-400">
          <div className="flex items-center gap-1.5 text-emerald-400 font-bold">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
            <span>SPECTRAL SPEECH WAVEFORM (16kHz PCM)</span>
          </div>
          <span className="text-slate-500 truncate max-w-[160px]">{videoName || 'source_video.mp4'}</span>
        </div>

        <canvas
          ref={canvasRef}
          width={520}
          height={64}
          className="w-full h-16 block mt-1 rounded"
        />

        {/* Shimmer laser bar indicator */}
        <div className="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden mt-2 relative">
          <div
            className="bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-400 h-full rounded-full transition-all duration-200 ease-out shadow-[0_0_10px_#10b981]"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Live Pipeline Stages Matrix */}
      <div className="w-full grid grid-cols-1 gap-2 text-left">
        {PIPELINE_STAGES.map((stage, idx) => {
          const isDone = activeStageIdx > idx;
          const isCurrent = activeStageIdx === idx;
          const isPending = activeStageIdx < idx;

          return (
            <div
              key={stage.id}
              className={`flex items-center justify-between p-2.5 rounded-xl border transition-all duration-300 ${
                isCurrent
                  ? 'bg-emerald-500/10 border-emerald-500/40 shadow-[0_0_15px_rgba(16,185,129,0.15)] scale-[1.01]'
                  : isDone
                  ? 'bg-slate-900/60 border-slate-800 text-slate-400'
                  : 'bg-slate-950/40 border-slate-900 text-slate-600 opacity-60'
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold ${
                    isDone
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                      : isCurrent
                      ? 'bg-emerald-500 text-slate-950 font-black animate-pulse'
                      : 'bg-slate-800 text-slate-500'
                  }`}
                >
                  {isDone ? '✓' : stage.icon}
                </div>

                <div>
                  <div
                    className={`text-xs font-bold ${
                      isCurrent
                        ? 'text-white flex items-center gap-1.5'
                        : isDone
                        ? 'text-slate-300'
                        : 'text-slate-500'
                    }`}
                  >
                    {stage.title}
                    {isCurrent && (
                      <span className="text-[9px] px-1.5 py-0.2 bg-emerald-400/20 text-emerald-300 rounded-full font-mono animate-pulse">
                        LIVE
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-slate-400">{stage.subtitle}</div>
                </div>
              </div>

              <span
                className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded ${
                  isCurrent
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : isDone
                    ? 'bg-slate-800/80 text-emerald-400'
                    : 'bg-slate-900 text-slate-600'
                }`}
              >
                {stage.tag}
              </span>
            </div>
          );
        })}
      </div>

      {/* Cybernetic Live Console Stream */}
      <div className="w-full bg-slate-950/90 border border-slate-800 rounded-xl p-3 text-left font-mono text-[10px]">
        <div className="flex items-center justify-between text-slate-500 border-b border-slate-900 pb-1 mb-1.5">
          <span className="text-emerald-400 font-bold flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            LIVE TELEMETRY STREAM
          </span>
          <span className="text-slate-500 text-[9px]">Groq Whisper Large-V3 &bull; FP16</span>
        </div>

        <div
          ref={logsEndRef}
          className="h-16 overflow-y-auto space-y-1 scrollbar-thin scrollbar-thumb-slate-800"
        >
          {logs.map((log, i) => (
            <div key={i} className="text-slate-400 leading-relaxed flex items-start gap-2">
              <span className="text-emerald-500/70 font-semibold">{log.time}</span>
              <span className="text-slate-300">{log.text}</span>
            </div>
          ))}
          <div className="flex items-center gap-1 text-emerald-400 animate-pulse">
            <span className="w-1.5 h-3 bg-emerald-400 inline-block" />
            <span className="text-slate-500 text-[9px]">Awaiting neural completion...</span>
          </div>
        </div>
      </div>
    </div>
  );
}
