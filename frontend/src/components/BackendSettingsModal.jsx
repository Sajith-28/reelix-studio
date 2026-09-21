import { useState, useEffect } from 'react';
import { getApiBase, setApiBase, checkBackendHealth } from '../lib/api';

export default function BackendSettingsModal({ isOpen, onClose, onSave }) {
  const [url, setUrl] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  useEffect(() => {
    if (isOpen) {
      setUrl(getApiBase());
      setTestResult(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleTest = async (testUrl) => {
    setTesting(true);
    setTestResult(null);
    const target = typeof testUrl === 'string' ? testUrl : url;
    const res = await checkBackendHealth(target);
    setTesting(false);
    setTestResult(res);
  };

  const handleSave = () => {
    setApiBase(url);
    if (onSave) onSave(url);
    onClose();
  };

  const isVercelHost = typeof window !== 'undefined' && window.location.hostname.includes('vercel.app');

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-lg w-full shadow-2xl space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <span className="text-xl">⚙️</span>
            <h3 className="text-lg font-bold text-slate-100">Backend Server Settings</h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white text-lg font-bold transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>

        {isVercelHost && !url && (
          <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs text-amber-300 leading-relaxed">
            <strong>Notice:</strong> You are accessing Reelix Studio on Vercel. Since Vercel only hosts the frontend, your Python FastAPI + FFmpeg backend needs to be connected to process videos and generate AI captions.
          </div>
        )}

        <div className="space-y-2">
          <label className="text-xs font-semibold text-slate-300 block">
            Backend API URL (FastAPI / Whisper / FFmpeg)
          </label>
          <input
            type="text"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setTestResult(null);
            }}
            placeholder="e.g. https://purple-zebras-knock.loca.lt or http://localhost:8001"
            className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 font-mono"
          />
          <p className="text-[11px] text-slate-400">
            Leave blank if using default proxy on localhost, or enter your tunnel (ngrok / localtunnel) or cloud server URL (Render / Railway).
          </p>
        </div>

        {/* Quick presets */}
        <div className="space-y-1.5 pt-1">
          <span className="text-[11px] font-semibold text-slate-400 block">Quick Options:</span>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setUrl('https://purple-zebras-knock.loca.lt');
                handleTest('https://purple-zebras-knock.loca.lt');
              }}
              className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-lg border border-slate-700 font-mono transition-all cursor-pointer"
            >
              🌐 Active Localtunnel
            </button>
            <button
              type="button"
              onClick={() => {
                setUrl('http://localhost:8001');
                handleTest('http://localhost:8001');
              }}
              className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-lg border border-slate-700 font-mono transition-all cursor-pointer"
            >
              💻 Localhost:8001
            </button>
            <button
              type="button"
              onClick={() => {
                setUrl('');
                handleTest('');
              }}
              className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 text-xs rounded-lg border border-slate-700 font-mono transition-all cursor-pointer"
            >
              🔄 Default (Reset)
            </button>
          </div>
        </div>

        {/* Test Connection Status */}
        {testResult && (
          <div
            className={`p-3 rounded-xl border text-xs flex items-center justify-between ${
              testResult.online
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : 'bg-red-500/10 border-red-500/30 text-red-400'
            }`}
          >
            <div className="flex items-center gap-2">
              <span>{testResult.online ? '✓' : '⚠'}</span>
              <span>
                {testResult.online
                  ? `Connected! Backend is online (${testResult.data?.service || 'Ready'})`
                  : `Connection failed: ${testResult.error || `HTTP ${testResult.status}`}`}
              </span>
            </div>
            {testResult.online && (
              <span className="text-[10px] font-mono bg-emerald-500/20 px-2 py-0.5 rounded">
                Status 200
              </span>
            )}
          </div>
        )}

        <div className="flex items-center justify-between pt-3 border-t border-slate-800">
          <button
            type="button"
            onClick={() => handleTest()}
            disabled={testing}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 transition-all cursor-pointer"
          >
            {testing ? 'Testing...' : 'Test Connection'}
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold rounded-xl transition-all shadow-lg shadow-emerald-500/20 cursor-pointer"
            >
              Save & Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
