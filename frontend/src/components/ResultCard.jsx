/**
 * MeaningGuard — Result Card Component
 * Displays translation result with semantic verification status
 */

const STATUS_CONFIG = {
  SAME_MEANING: {
    icon: '✓',
    label: 'Meaning preserved',
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/20',
  },
  MINOR_VARIATION: {
    icon: '~',
    label: 'Minor variation detected',
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/20',
  },
  MEANINGFUL_AMBIGUITY: {
    icon: '⚠',
    label: 'Meaning may be ambiguous',
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/20',
  },
  TRANSLATION_ERROR: {
    icon: '⚠',
    label: 'Potential translation issue',
    color: 'text-red-400',
    bg: 'bg-red-500/10',
    border: 'border-red-500/20',
  },
};

const RISK_LABELS = {
  CERTAINTY: '🎯 Certainty',
  NEGATION: '🚫 Negation',
  TENSE: '⏱ Tense',
  MODALITY: '💭 Modality',
  INTENT: '🎯 Intent',
  QUANTITY: '🔢 Quantity',
  ATTITUDE: '🗣 Attitude',
  SLANG: '💬 Slang',
  IDIOM: '📖 Idiom',
  CULTURAL: '🌍 Cultural',
};

export default function ResultCard({ result }) {
  const status = STATUS_CONFIG[result.meaning_status] || STATUS_CONFIG.SAME_MEANING;
  const showFork = result.meaning_status !== 'SAME_MEANING' && result.alternative_translation;

  return (
    <div className="space-y-4 animate-in">
      {/* Language Detection */}
      <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5">
        <div className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1.5">
          Detected Language
        </div>
        <div className="text-lg font-semibold text-slate-100">
          {result.source_language}
          {result.is_code_mixed && (
            <span className="ml-2 text-xs font-normal bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded-full">
              Code-mixed: {result.all_languages?.join(' + ')}
            </span>
          )}
        </div>
      </div>

      {/* English Translation */}
      <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5">
        <div className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1.5">
          English Translation
        </div>
        <div className="text-lg leading-relaxed text-slate-50">
          {result.translation}
        </div>
        {result.semantic_notes && (
          <div className="mt-3 text-xs text-slate-400 italic">
            📝 {result.semantic_notes}
          </div>
        )}
      </div>

      {/* MeaningGuard Status */}
      <div className={`${status.bg} border ${status.border} rounded-xl p-5`}>
        <div className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">
          MeaningGuard
        </div>
        <div className={`flex items-center gap-2 text-base font-semibold ${status.color}`}>
          <span className="text-lg">{status.icon}</span>
          {status.label}
        </div>

        {/* Confidence badge */}
        <div className="mt-2">
          <span className={`inline-block text-xs px-2 py-0.5 rounded-full ${
            result.confidence_level === 'HIGH' 
              ? 'bg-emerald-500/20 text-emerald-300'
              : result.confidence_level === 'MEDIUM'
              ? 'bg-amber-500/20 text-amber-300'
              : 'bg-red-500/20 text-red-300'
          }`}>
            {result.confidence_level} confidence
          </span>
        </div>

        {/* Risk Categories */}
        {result.risk_categories?.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {result.risk_categories.map((cat) => (
              <span
                key={cat}
                className="text-xs bg-slate-700/60 text-slate-300 px-2 py-0.5 rounded-full"
              >
                {RISK_LABELS[cat] || cat}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Meaning Fork — only shown when ambiguity/error detected */}
      {showFork && (
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-2 text-amber-400 font-semibold text-sm">
            <span>⑂</span>
            Meaning Fork
          </div>

          <div>
            <div className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">
              Another possible interpretation
            </div>
            <div className="text-base text-slate-200 leading-relaxed">
              {result.alternative_translation}
            </div>
          </div>

          {result.reason && (
            <div>
              <div className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">
                Why?
              </div>
              <div className="text-sm text-slate-300 leading-relaxed">
                {result.reason}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Reason without fork (for MINOR_VARIATION without alternative) */}
      {!showFork && result.reason && result.meaning_status !== 'SAME_MEANING' && (
        <div className={`${status.bg} border ${status.border} rounded-xl p-5`}>
          <div className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">
            Note
          </div>
          <div className="text-sm text-slate-300 leading-relaxed">
            {result.reason}
          </div>
        </div>
      )}
    </div>
  );
}
