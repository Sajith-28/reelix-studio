import { useState, useEffect } from 'react';
import { getApiBase, setApiBase, checkBackendHealth, cleanUrl } from '../lib/api';

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
    const rawTarget = typeof testUrl === 'string' ? testUrl : url;
    const target = cleanUrl(rawTarget);
    setUrl(target); // clean what's visible in the input box!
    const res = await checkBackendHealth(target);
    setTesting(false);
    setTestResult(res);
  };

  const handleSave = () => {
    const cleaned = cleanUrl(url);
    setApiBase(cleaned);
    if (onSave) onSave(cleaned);
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
            placeholder="e.g. https://unlocking-tropics-rearview.ngrok-free.dev or your-render-app.onrender.com"
            className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 font-mono"
          />
          <p className="text-[11px] text-slate-400">
            For other devices or phones: enter a public HTTPS tunnel URL or your permanent cloud server URL (Render).
          </p>
        </div>

        {/* Quick presets */}
        <div className="space-y-2 pt-1">
          <span className="text-[11px] font-semibold text-slate-400 block">Quick Presets (Click to Test & Connect):</span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                setUrl('https://reelix-studio-api.onrender.com');
                handleTest('https://reelix-studio-api.onrender.com');
              }}
              className="p-2.5 bg-slate-800/90 hover:bg-slate-700/90 text-left text-slate-200 text-xs rounded-xl border border-violet-500/40 font-mono transition-all cursor-pointer hover:border-violet-400 shadow-lg shadow-violet-500/5"
            >
              <div className="flex items-center gap-1.5 font-bold text-violet-400 mb-0.5">
                <span className="w-2 h-2 rounded-full bg-violet-400 animate-pulse" />
                ☁️ Render Cloud (24/7, No PC needed)
              </div>
              <div className="text-[10px] text-slate-400 truncate">reelix-studio-api.onrender.com</div>
            </button>

            <button
              type="button"
              onClick={() => {
                setUrl('https://three-leonard-semester-api.trycloudflare.com');
                handleTest('https://three-leonard-semester-api.trycloudflare.com');
              }}
              className="p-2.5 bg-slate-800/90 hover:bg-slate-700/90 text-left text-slate-200 text-xs rounded-xl border border-amber-500/40 font-mono transition-all cursor-pointer hover:border-amber-400 shadow-lg shadow-amber-500/5"
            >
              <div className="flex items-center gap-1.5 font-bold text-amber-400 mb-0.5">
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                ⚡ Cloudflare Tunnel (PC must be on)
              </div>
              <div className="text-[10px] text-slate-400 truncate">three-leonard-semester-api.trycloudflare.com</div>
            </button>

            <button
              type="button"
              onClick={() => {
                setUrl('http://localhost:8001');
                handleTest('http://localhost:8001');
              }}
              className="p-2 bg-slate-800/60 hover:bg-slate-700/80 text-left text-slate-300 text-xs rounded-xl border border-slate-800 font-mono transition-all cursor-pointer"
            >
              <div className="font-semibold text-slate-300">💻 Localhost:8001</div>
              <div className="text-[10px] text-slate-500">Only on Host Computer</div>
            </button>

            <button
              type="button"
              onClick={() => {
                setUrl('');
                handleTest('');
              }}
              className="p-2 bg-slate-800/60 hover:bg-slate-700/80 text-left text-slate-400 text-xs rounded-xl border border-slate-800 font-mono transition-all cursor-pointer"
            >
              <div className="font-semibold text-slate-400">🔄 Default (Reset)</div>
              <div className="text-[10px] text-slate-500">Clear custom URL</div>
            </button>
          </div>
        </div>

        {/* Any Device Guidance Alert */}
        <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl text-[11px] text-slate-300 space-y-1.5">
          <div className="font-semibold text-slate-200 flex items-center gap-1.5">
            <span>📱</span> How to use on another computer / phone:
          </div>
          <ol className="list-decimal list-inside space-y-1 text-slate-400 pl-1 leading-relaxed">
            <li>On the other device, open this <strong>Settings (⚙️)</strong> button.</li>
            <li>Click <strong>🚀 Ngrok Public Tunnel</strong> or enter your tunnel / cloud URL.</li>
            <li>Click <strong>Test Connection</strong> and then <strong>Save & Apply</strong>.</li>
            <li><em>For permanent 24/7 access without keeping your PC on:</em> Deploy to Render using the Dockerfile in this repo.</li>
          </ol>
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
