/**
 * SUBLYX — Studio Editor Main Application
 * AI Video Captioning, Translation & Studio Editor
 */

import { useState, useEffect, useRef } from 'react';
import UploadScreen from './components/UploadScreen';
import EditorHeader from './components/EditorHeader';
import CaptionsPanel from './components/CaptionsPanel';
import VideoPreview from './components/VideoPreview';
import Timeline from './components/Timeline';
import StyleInspector from './components/StyleInspector';
import RenderingProgressModal from './components/RenderingProgressModal';
import './App.css';

const DEFAULT_STYLE = {
  fontFamily: 'Montserrat',
  fontSize: 28,
  color: '#ffffff',
  highlightColor: '#facc15', // Vibrant Viral Yellow
  backgroundColor: 'transparent',
  position: 'bottom',
  xPercent: 50,
  yPercent: 82,
  yOffset: 0,
  strokeWidth: 3.5,
  strokeColor: '#000000',
  shadowType: 'cinematic',
  shadowBlur: 14,
  shadowOpacity: 0.9,
  shadowColor: '#000000',
  shadowDistance: 4,
};

export default function App() {
  // ── Session Persistence: restore from sessionStorage on mount ──
  const [project, setProject] = useState(() => {
    try {
      const saved = sessionStorage.getItem('sublyx_project');
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  });
  const [projectName, setProjectName] = useState(() => {
    return sessionStorage.getItem('sublyx_projectName') || 'NEUBIES EDIT 2';
  });

  // Video Playback State
  const [currentTime, setCurrentTime] = useState(() => {
    const saved = sessionStorage.getItem('sublyx_currentTime');
    return saved ? parseFloat(saved) : 0;
  });
  const [duration, setDuration] = useState(() => {
    const saved = sessionStorage.getItem('sublyx_duration');
    return saved ? parseFloat(saved) : 0;
  });
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);

  // Active Subtitle Line & Styling State
  const [selectedCaptionId, setSelectedCaptionId] = useState(() => {
    const saved = sessionStorage.getItem('sublyx_selectedCaptionId');
    return saved ? parseInt(saved) : null;
  });
  const [selectedWord, setSelectedWord] = useState(null); // { captionId, wordIndex, wordText }
  const [styleConfig, setStyleConfig] = useState(() => {
    try {
      const saved = sessionStorage.getItem('sublyx_styleConfig');
      return saved ? JSON.parse(saved) : DEFAULT_STYLE;
    } catch { return DEFAULT_STYLE; }
  });

  // Upload Processing & Export States
  const [isProcessingUpload, setIsProcessingUpload] = useState(false);
  const [uploadStage, setUploadStage] = useState('');
  const [uploadError, setUploadError] = useState(null);
  const [isExportingVideo, setIsExportingVideo] = useState(false);
  const [exportedVideoUrl, setExportedVideoUrl] = useState(null);

  // Playback Rate / Speed
  const [playbackRate, setPlaybackRate] = useState(1);
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);

  // Undo / Redo History Stack
  const [history, setHistory] = useState([]);
  const [historyIdx, setHistoryIdx] = useState(-1);

  // Save & Auto-Save Project States
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(true);
  const [saveStatus, setSaveStatus] = useState('idle');
  const [lastSavedTime, setLastSavedTime] = useState(null);

  // Save Project to Supabase Cloud & Local Storage
  const handleSaveProject = async (isAuto = false) => {
    if (!project) return;
    setSaveStatus('saving');
    try {
      const payload = {
        name: projectName,
        video_filename: project.video_filename || '',
        duration: duration || project.duration || 0,
        captions: project.captions || [],
        style_config: styleConfig,
      };

      // Persist to local backup
      localStorage.setItem('sublyx_saved_project', JSON.stringify({ ...project, ...payload }));

      const res = await fetch('http://localhost:8000/api/supabase/save-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: project.id || 'project_1',
          project_data: payload,
        }),
      });
      const data = await res.json();
      setSaveStatus('saved');
      setLastSavedTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));

      if (!isAuto) {
        if (data.saved) {
          alert('☁️ Project saved successfully to Supabase Cloud!');
        } else {
          alert('💾 Project saved locally as backup!');
        }
      }
    } catch (err) {
      console.error('Save project error:', err);
      setSaveStatus('error');
    }
  };

  // Debounced Auto-Save Effect (triggers 2.5s after editing captions or styles)
  useEffect(() => {
    if (!project || !autoSaveEnabled) return;
    const timer = setTimeout(() => {
      handleSaveProject(true);
    }, 2500);
    return () => clearTimeout(timer);
  }, [project?.captions, styleConfig, projectName, autoSaveEnabled]);


  // Save State Snapshot to History
  const pushHistory = (newCaptions) => {
    const updatedHistory = history.slice(0, historyIdx + 1);
    updatedHistory.push(JSON.stringify(newCaptions));
    setHistory(updatedHistory);
    setHistoryIdx(updatedHistory.length - 1);
  };

  // Keyboard Shortcuts (Tab for play/pause, Space, C/S for split, [ ] for trim, J/L seek, Ctrl+Z/Y)
  useEffect(() => {
    const handleKeyDown = (e) => {
      const isInput = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA';

      // Tab or Space for Play/Pause
      if (e.code === 'Tab' || (e.code === 'Space' && !isInput)) {
        e.preventDefault();
        setIsPlaying((prev) => !prev);
        return;
      }

      if (isInput) return;

      if (e.code === 'KeyK') {
        e.preventDefault();
        setIsPlaying((prev) => !prev);
      } else if (e.code === 'KeyJ' || e.code === 'ArrowLeft') {
        e.preventDefault();
        const step = e.shiftKey ? 3 : 1;
        setCurrentTime((prev) => Math.max(0, prev - step));
      } else if (e.code === 'KeyL' || e.code === 'ArrowRight') {
        e.preventDefault();
        const step = e.shiftKey ? 3 : 1;
        setCurrentTime((prev) => Math.min(duration, prev + step));
      } else if (e.code === 'KeyC' || e.code === 'KeyS') {
        e.preventDefault();
        handleSplitCaption();
      } else if (e.key === '[') {
        e.preventDefault();
        handleTrimStart();
      } else if (e.key === ']') {
        e.preventDefault();
        handleTrimEnd();
      } else if (e.code === 'KeyM') {
        e.preventDefault();
        setIsMuted((prev) => !prev);
      } else if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault();
        setShowShortcutsModal((prev) => !prev);
      } else if (e.ctrlKey && e.key === 'z') {
        e.preventDefault();
        handleUndo();
      } else if (e.ctrlKey && e.key === 'y') {
        e.preventDefault();
        handleRedo();
      } else if (e.code === 'Delete' || e.code === 'Backspace') {
        if (selectedCaptionId) {
          e.preventDefault();
          handleDeleteCaptionLine(selectedCaptionId);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [historyIdx, history, currentTime, duration, selectedCaptionId, project]);

  // Handle Video File Upload to Backend API
  const handleUploadStart = async (file, spokenLang, targetLang) => {
    setIsProcessingUpload(true);
    setUploadError(null);
    setUploadStage('Extracting audio from video...');

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('spoken_language', spokenLang);
      formData.append('target_language', targetLang);

      setUploadStage('Transcribing speech with Whisper Large-V3...');
      const res = await fetch('/api/process-video', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || `Server error (${res.status})`);
      }

      setUploadStage('Translating into Instagram Reels format...');
      const data = await res.json();

      setProject(data);
      setDuration(data.duration || 0);
      setProjectName(file.name.replace(/\.[^/.]+$/, '') + ' - EDIT');
      pushHistory(data.captions);

      if (data.captions?.length > 0) {
        setSelectedCaptionId(data.captions[0].id);
      }
    } catch (err) {
      setUploadError(err.message || 'Video processing failed.');
    } finally {
      setIsProcessingUpload(false);
    }
  };

  // Update Caption Text
  const handleUpdateCaptionText = (id, newText) => {
    if (!project) return;
    const updatedCaptions = project.captions.map((c) =>
      c.id === id ? { ...c, translated_text: newText } : c
    );
    setProject({ ...project, captions: updatedCaptions });
    pushHistory(updatedCaptions);
  };

  // Update Caption Timestamps directly
  const handleUpdateCaptionTiming = (id, field, value) => {
    if (!project) return;
    const num = parseFloat(value);
    if (isNaN(num)) return;
    const updated = project.captions.map((c) => {
      if (c.id === id) {
        return { ...c, [field]: roundTwo(Math.max(0, num)) };
      }
      return c;
    });
    setProject({ ...project, captions: updated });
    pushHistory(updated);
  };

  // Split / Cut Caption at current playhead time
  const handleSplitCaption = () => {
    if (!project || !project.captions.length) return;
    const targetCap =
      project.captions.find((c) => currentTime > c.start && currentTime < c.end) ||
      project.captions.find((c) => c.id === selectedCaptionId);

    if (!targetCap || currentTime <= targetCap.start || currentTime >= targetCap.end) return;

    const splitTime = roundTwo(currentTime);
    const words = (targetCap.translated_text || '').split(/\s+/).filter(Boolean);
    const totalDuration = targetCap.end - targetCap.start;
    const ratio = totalDuration > 0 ? (splitTime - targetCap.start) / totalDuration : 0.5;
    const splitIndex = Math.max(1, Math.min(words.length - 1, Math.round(words.length * ratio)));

    const text1 = words.slice(0, splitIndex).join(' ') || targetCap.translated_text;
    const text2 = words.slice(splitIndex).join(' ') || '...';

    const cap1 = {
      ...targetCap,
      end: splitTime,
      translated_text: text1,
    };

    const cap2 = {
      id: Math.max(...project.captions.map((c) => c.id), 0) + 1,
      start: splitTime,
      end: targetCap.end,
      source_text: '',
      translated_text: text2,
      keywords: targetCap.keywords || [],
      words: [],
    };

    const newCaps = [];
    for (const c of project.captions) {
      if (c.id === targetCap.id) {
        newCaps.push(cap1, cap2);
      } else {
        newCaps.push(c);
      }
    }

    const sorted = newCaps
      .sort((a, b) => a.start - b.start)
      .map((c, i) => ({ ...c, id: i + 1 }));

    setProject({ ...project, captions: sorted });
    setSelectedCaptionId(cap2.id);
    pushHistory(sorted);
  };

  // Trim Start to current playhead
  const handleTrimStart = () => {
    if (!project) return;
    const targetId = selectedCaptionId || currentCaption?.id;
    if (!targetId) return;
    const updated = project.captions.map((c) => {
      if (c.id === targetId && currentTime < c.end) {
        return { ...c, start: roundTwo(currentTime) };
      }
      return c;
    });
    setProject({ ...project, captions: updated });
    pushHistory(updated);
  };

  // Trim End to current playhead
  const handleTrimEnd = () => {
    if (!project) return;
    const targetId = selectedCaptionId || currentCaption?.id;
    if (!targetId) return;
    const updated = project.captions.map((c) => {
      if (c.id === targetId && currentTime > c.start) {
        return { ...c, end: roundTwo(currentTime) };
      }
      return c;
    });
    setProject({ ...project, captions: updated });
    pushHistory(updated);
  };

  // Toggle Keyword Highlight on Word Click
  const handleToggleKeyword = (id, word) => {
    if (!project) return;
    const cleanWord = word.replace(/[^\w]/g, '');
    const updatedCaptions = project.captions.map((c) => {
      if (c.id !== id) return c;
      const currentKeywords = c.keywords || [];
      const hasKw = currentKeywords.includes(cleanWord);
      const newKws = hasKw
        ? currentKeywords.filter((k) => k !== cleanWord)
        : [...currentKeywords, cleanWord];
      return { ...c, keywords: newKws };
    });
    setProject({ ...project, captions: updatedCaptions });
    pushHistory(updatedCaptions);
  };

  // Move selected word and its group (before/after) to previous or next caption line
  const handleMoveWord = (captionId, wordIndex, direction) => {
    if (!project || !project.captions.length) return;

    const currIdx = project.captions.findIndex((c) => c.id === captionId);
    if (currIdx === -1) return;

    const targetIdx = direction === 'previous' ? currIdx - 1 : currIdx + 1;
    if (targetIdx < 0 || targetIdx >= project.captions.length) return;

    const currentCap = project.captions[currIdx];
    const targetCap = project.captions[targetIdx];

    const currentWords = (currentCap.translated_text || '').trim().split(/\s+/).filter(Boolean);
    if (wordIndex < 0 || wordIndex >= currentWords.length) return;

    const wordToMove = currentWords[wordIndex];
    let movedWords = [];
    let newCurrentWords = [];
    let newTargetWords = [];
    let newWordIndex = 0;

    const targetWords = (targetCap.translated_text || '').trim().split(/\s+/).filter(Boolean);

    if (direction === 'previous') {
      // Move selected word AND every word before it in current caption
      movedWords = currentWords.slice(0, wordIndex + 1);
      newCurrentWords = currentWords.slice(wordIndex + 1);
      newTargetWords = [...targetWords, ...movedWords];
      newWordIndex = targetWords.length + wordIndex;
    } else {
      // Move selected word AND every word after it in current caption
      movedWords = currentWords.slice(wordIndex);
      newCurrentWords = currentWords.slice(0, wordIndex);
      newTargetWords = [...movedWords, ...targetWords];
      newWordIndex = 0;
    }

    const newCurrentText = newCurrentWords.join(' ');
    const newTargetText = newTargetWords.join(' ');

    // Move word timing objects if available
    let newCurrentWordObjs = Array.isArray(currentCap.words) ? [...currentCap.words] : [];
    let newTargetWordObjs = Array.isArray(targetCap.words) ? [...targetCap.words] : [];

    if (newCurrentWordObjs.length > 0) {
      if (direction === 'previous') {
        const movedWordObjs = newCurrentWordObjs.slice(0, wordIndex + 1);
        newCurrentWordObjs = newCurrentWordObjs.slice(wordIndex + 1);
        newTargetWordObjs = [...newTargetWordObjs, ...movedWordObjs];
      } else {
        const movedWordObjs = newCurrentWordObjs.slice(wordIndex);
        newCurrentWordObjs = newCurrentWordObjs.slice(0, wordIndex);
        newTargetWordObjs = [...movedWordObjs, ...newTargetWordObjs];
      }
    }

    // Update captions array
    let updatedCaptions = project.captions.map((c, i) => {
      if (i === currIdx) {
        return {
          ...c,
          translated_text: newCurrentText,
          words: newCurrentWordObjs,
        };
      }
      if (i === targetIdx) {
        return {
          ...c,
          translated_text: newTargetText,
          words: newTargetWordObjs,
        };
      }
      return c;
    });

    // Remove current caption if it became empty
    if (newCurrentWords.length === 0) {
      updatedCaptions = updatedCaptions.filter((_, i) => i !== currIdx);
    }

    // Re-index caption IDs cleanly
    const reindexed = updatedCaptions.map((c, i) => ({ ...c, id: i + 1 }));

    // Find destination caption object & ID
    const destinationCap = reindexed.find((c) => c.translated_text === newTargetText) || reindexed[Math.min(targetIdx, reindexed.length - 1)];
    const destinationId = destinationCap ? destinationCap.id : targetCap.id;

    setProject({ ...project, captions: reindexed });
    setSelectedCaptionId(destinationId);
    setSelectedWord({ captionId: destinationId, wordIndex: newWordIndex, wordText: wordToMove });
    pushHistory(reindexed);
  };


  // Add Caption Line at current time or end
  const handleAddCaptionLine = () => {
    if (!project) return;
    const newId = project.captions.length + 1;
    const newStart = roundTwo(currentTime || 0);
    const newEnd = roundTwo(newStart + 1.8);

    const newCap = {
      id: newId,
      start: newStart,
      end: newEnd,
      source_text: 'New line',
      translated_text: 'New subtitle',
      keywords: ['subtitle'],
      words: [],
    };

    const updatedCaptions = [...project.captions, newCap].sort((a, b) => a.start - b.start);
    const indexed = updatedCaptions.map((c, i) => ({ ...c, id: i + 1 }));
    setProject({ ...project, captions: indexed });
    setSelectedCaptionId(newId);
    pushHistory(indexed);
  };

  // Delete Caption Line
  const handleDeleteCaptionLine = (id) => {
    if (!project) return;
    const updatedCaptions = project.captions
      .filter((c) => c.id !== id)
      .map((c, i) => ({ ...c, id: i + 1 }));
    setProject({ ...project, captions: updatedCaptions });
    pushHistory(updatedCaptions);
  };

  // AI Magic: Auto-Highlight Viral Keywords on All Captions
  const handleAutoHighlightAll = () => {
    if (!project) return;
    const updated = project.captions.map((c) => {
      const words = (c.translated_text || '').split(/\s+/).map((w) => w.replace(/[^\w]/g, '')).filter(Boolean);
      if (!words.length) return c;
      const longest = words.reduce((a, b) => (a.length >= b.length ? a : b), words[0]);
      return { ...c, keywords: [longest] };
    });
    setProject({ ...project, captions: updated });
    pushHistory(updated);
  };

  // AI Magic: Auto-Split Long Lines (> 3 words) into snappy Reels
  const handleAutoSplitLong = () => {
    if (!project) return;
    const newCaptions = [];
    for (const c of project.captions) {
      const words = (c.translated_text || '').split(/\s+/).filter(Boolean);
      if (words.length > 3) {
        const mid = Math.ceil(words.length / 2);
        const midTime = roundTwo((c.start + c.end) / 2);
        newCaptions.push({
          ...c,
          end: midTime,
          translated_text: words.slice(0, mid).join(' '),
        });
        newCaptions.push({
          id: c.id + 1000,
          start: midTime,
          end: c.end,
          source_text: '',
          translated_text: words.slice(mid).join(' '),
          keywords: c.keywords || [],
          words: [],
        });
      } else {
        newCaptions.push(c);
      }
    }
    const indexed = newCaptions
      .sort((a, b) => a.start - b.start)
      .map((c, i) => ({ ...c, id: i + 1 }));
    setProject({ ...project, captions: indexed });
    pushHistory(indexed);
  };

  // AI Magic: Make All Text UPPERCASE
  const handleUppercaseAll = () => {
    if (!project) return;
    const updated = project.captions.map((c) => ({
      ...c,
      translated_text: (c.translated_text || '').toUpperCase(),
    }));
    setProject({ ...project, captions: updated });
    pushHistory(updated);
  };

  // Undo / Redo Actions
  const handleUndo = () => {
    if (historyIdx > 0) {
      const prevCaptions = JSON.parse(history[historyIdx - 1]);
      setProject({ ...project, captions: prevCaptions });
      setHistoryIdx(historyIdx - 1);
    }
  };

  const handleRedo = () => {
    if (historyIdx < history.length - 1) {
      const nextCaptions = JSON.parse(history[historyIdx + 1]);
      setProject({ ...project, captions: nextCaptions });
      setHistoryIdx(historyIdx + 1);
    }
  };

  // Export SRT Subtitle File
  const handleExportSrt = async () => {
    if (!project) return;
    try {
      const res = await fetch('/api/export-srt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ captions: project.captions }),
      });
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${projectName}.srt`;
      a.click();
    } catch (err) {
      alert('Failed to download SRT file.');
    }
  };

  // Export Captioned Video MP4 with Resolution
  const [exportedResolution, setExportedResolution] = useState('original');
  const handleExportVideo = async (resolution = 'original') => {
    if (!project) return;
    setIsExportingVideo(true);
    setExportedVideoUrl(null);
    setExportedResolution(resolution);

    try {
      const res = await fetch('/api/export-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          video_url: project.video_url,
          captions: project.captions,
          style: styleConfig,
          resolution: resolution,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || 'Video export failed.');
      }

      const data = await res.json();
      setExportedVideoUrl(data.export_url);
    } catch (err) {
      alert(err.message || 'Video export failed.');
    } finally {
      setIsExportingVideo(false);
    }
  };

  // Find active caption matching current video playback time
  const currentCaption = project?.captions.find(
    (c) => currentTime >= c.start && currentTime <= c.end
  );

  // Render Upload Screen if no project is loaded
  if (!project) {
    return (
      <UploadScreen
        onUploadStart={handleUploadStart}
        isProcessing={isProcessingUpload}
        currentStage={uploadStage}
        error={uploadError}
      />
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-slate-950 text-slate-100 overflow-hidden font-['Satoshi']">
      {/* Top Header */}
      <EditorHeader
        projectName={projectName}
        onProjectNameChange={setProjectName}
        canUndo={historyIdx > 0}
        canRedo={historyIdx < history.length - 1}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onExportSrt={handleExportSrt}
        onExportVideo={handleExportVideo}
        isExportingVideo={isExportingVideo}
        onSaveProject={handleSaveProject}
        saveStatus={saveStatus}
        autoSaveEnabled={autoSaveEnabled}
        onToggleAutoSave={() => setAutoSaveEnabled((prev) => !prev)}
        lastSavedTime={lastSavedTime}
        onNewProject={() => {
          // Clear session persistence so the user starts fresh
          sessionStorage.removeItem('reelix_project');
          sessionStorage.removeItem('reelix_projectName');
          sessionStorage.removeItem('reelix_currentTime');
          sessionStorage.removeItem('reelix_duration');
          sessionStorage.removeItem('reelix_selectedCaptionId');
          sessionStorage.removeItem('reelix_styleConfig');
          setProject(null);
          setCurrentTime(0);
          setDuration(0);
          setSelectedCaptionId(null);
          setStyleConfig(DEFAULT_STYLE);
          setHistory([]);
          setHistoryIdx(-1);
          setProjectName('NEUBIES EDIT 2');
        }}
      />

      {/* Main Studio 3-Column Workspace */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Column: Captions List Panel */}
        <CaptionsPanel
          captions={project.captions}
          selectedCaptionId={selectedCaptionId}
          selectedWord={selectedWord}
          onSelectWord={setSelectedWord}
          onMoveWord={handleMoveWord}
          currentTime={currentTime}
          onSelectCaption={(id, start) => {
            setSelectedCaptionId(id);
            setCurrentTime(start);
          }}
          onUpdateCaptionText={handleUpdateCaptionText}
          onUpdateCaptionTiming={handleUpdateCaptionTiming}
          onAddCaptionLine={handleAddCaptionLine}
          onDeleteCaptionLine={handleDeleteCaptionLine}
          onToggleKeyword={handleToggleKeyword}
          onSplitCaption={handleSplitCaption}
          onTrimStart={handleTrimStart}
          onTrimEnd={handleTrimEnd}
        />

        {/* Center Column: Video Player & Controls */}
        <VideoPreview
          videoUrl={project.video_url}
          currentTime={currentTime}
          duration={duration}
          isPlaying={isPlaying}
          playbackRate={playbackRate}
          volume={volume}
          isMuted={isMuted}
          styleConfig={styleConfig}
          currentCaption={currentCaption}
          onTimeUpdate={setCurrentTime}
          onLoadedMetadata={(dur) => setDuration(dur || project.duration || 0)}
          onTogglePlay={() => setIsPlaying(!isPlaying)}
          onSeek={setCurrentTime}
          onVolumeChange={setVolume}
          onToggleMute={() => setIsMuted(!isMuted)}
          onPlaybackRateChange={setPlaybackRate}
          onSplitCaption={handleSplitCaption}
          onTrimStart={handleTrimStart}
          onTrimEnd={handleTrimEnd}
          onOpenShortcuts={() => setShowShortcutsModal(true)}
          onUpdateStyle={(key, val) => setStyleConfig((prev) => ({ ...prev, [key]: val }))}
          onUpdateStyleBatch={(updates) => setStyleConfig((prev) => ({ ...prev, ...updates }))}
        />

        {/* Right Column: Style & Template Inspector */}
        <StyleInspector
          styleConfig={styleConfig}
          onUpdateStyle={(key, val) => setStyleConfig({ ...styleConfig, [key]: val })}
          onApplyTemplate={(tpl) => setStyleConfig({ ...styleConfig, ...tpl })}
          onAutoHighlightAll={handleAutoHighlightAll}
          onAutoSplitLong={handleAutoSplitLong}
          onUppercaseAll={handleUppercaseAll}
        />
      </div>

      {/* Bottom Panel: Multi-Track Timeline */}
      <Timeline
        captions={project.captions}
        currentTime={currentTime}
        duration={duration}
        selectedCaptionId={selectedCaptionId}
        onSelectCaption={(id, start) => {
          setSelectedCaptionId(id);
          setCurrentTime(start);
        }}
        onSeek={setCurrentTime}
        onSplitCaption={handleSplitCaption}
        onTrimStart={handleTrimStart}
        onTrimEnd={handleTrimEnd}
      />

      {/* Keyboard Shortcuts Modal */}
      {showShortcutsModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-lg w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <span>⌨️</span> Studio Keyboard Shortcuts
              </h3>
              <button
                onClick={() => setShowShortcutsModal(false)}
                className="text-slate-400 hover:text-slate-200 text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="flex items-center justify-between p-2 rounded bg-slate-800/60 border border-slate-700/50">
                <span className="text-slate-300">Play / Pause</span>
                <span className="font-mono font-bold bg-slate-700 text-emerald-400 px-1.5 py-0.5 rounded">Tab / Space</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded bg-slate-800/60 border border-slate-700/50">
                <span className="text-slate-300">Cut / Split at Playhead</span>
                <span className="font-mono font-bold bg-slate-700 text-emerald-400 px-1.5 py-0.5 rounded">C / S</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded bg-slate-800/60 border border-slate-700/50">
                <span className="text-slate-300">Trim Start to Playhead</span>
                <span className="font-mono font-bold bg-slate-700 text-emerald-400 px-1.5 py-0.5 rounded">[</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded bg-slate-800/60 border border-slate-700/50">
                <span className="text-slate-300">Trim End to Playhead</span>
                <span className="font-mono font-bold bg-slate-700 text-emerald-400 px-1.5 py-0.5 rounded">]</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded bg-slate-800/60 border border-slate-700/50">
                <span className="text-slate-300">Seek -1s / +1s</span>
                <span className="font-mono font-bold bg-slate-700 text-emerald-400 px-1.5 py-0.5 rounded">J / L or ← / →</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded bg-slate-800/60 border border-slate-700/50">
                <span className="text-slate-300">Seek -3s / +3s</span>
                <span className="font-mono font-bold bg-slate-700 text-emerald-400 px-1.5 py-0.5 rounded">Shift + ← / →</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded bg-slate-800/60 border border-slate-700/50">
                <span className="text-slate-300">Mute Audio</span>
                <span className="font-mono font-bold bg-slate-700 text-emerald-400 px-1.5 py-0.5 rounded">M</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded bg-slate-800/60 border border-slate-700/50">
                <span className="text-slate-300">Undo / Redo</span>
                <span className="font-mono font-bold bg-slate-700 text-emerald-400 px-1.5 py-0.5 rounded">Ctrl + Z / Y</span>
              </div>
            </div>
            <button
              onClick={() => setShowShortcutsModal(false)}
              className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-lg text-xs transition-all cursor-pointer"
            >
              Got it!
            </button>
          </div>
        </div>
      )}

      {/* Futuristic Export Rendering Progress Overlay */}
      {isExportingVideo && (
        <RenderingProgressModal
          isDifferenceMode={styleConfig.mixBlendMode === 'difference'}
          resolution={exportedResolution}
        />
      )}

      {/* Export Completed Download Modal */}
      {exportedVideoUrl && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full text-center space-y-4 shadow-2xl">
            <div className="w-12 h-12 bg-emerald-500/20 text-emerald-400 rounded-full mx-auto flex items-center justify-center text-xl">
              ✓
            </div>
            <h3 className="text-xl font-bold text-slate-100">Export Complete!</h3>
            <p className="text-xs text-slate-400">
              Your video with burned-in AI captions is ready for download in{' '}
              <span className="text-emerald-400 font-bold uppercase font-mono">
                {exportedResolution === 'original' ? 'Highest Resolution (1080p/4K)' : `${exportedResolution} HD`}
              </span>.
            </p>
            <div className="flex gap-2 pt-2">
              <a
                href={exportedVideoUrl}
                download
                className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-lg text-xs tracking-wider uppercase transition-all"
              >
                Download MP4 Video
              </a>
              <button
                onClick={() => setExportedVideoUrl(null)}
                className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-lg text-xs cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function roundTwo(val) {
  return Math.round(val * 100) / 100;
}
