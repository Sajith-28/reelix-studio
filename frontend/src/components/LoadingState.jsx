/**
 * MeaningGuard — Loading State Component
 * Shows pipeline stage progress during translation
 */

const STAGES = [
  { key: 'detecting', label: 'Detecting language...' },
  { key: 'translating', label: 'Generating translation...' },
  { key: 'verifying', label: 'Checking meaning...' },
  { key: 'ready', label: 'Ready' },
];

export default function LoadingState() {
  return (
    <div className="flex flex-col items-center gap-4 py-12">
      {/* Animated spinner */}
      <div className="relative w-12 h-12">
        <div className="absolute inset-0 rounded-full border-2 border-indigo-500/20"></div>
        <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-indigo-500 animate-spin"></div>
      </div>

      {/* Stage indicators */}
      <div className="flex flex-col gap-2 text-center">
        {STAGES.slice(0, 3).map((stage, i) => (
          <div
            key={stage.key}
            className="text-sm text-slate-400 animate-pulse"
            style={{ animationDelay: `${i * 1.2}s` }}
          >
            {stage.label}
          </div>
        ))}
      </div>

      <p className="text-xs text-slate-500 mt-2">
        Running independent translation passes...
      </p>
    </div>
  );
}
