/**
 * REELIX — Negative Text preview layer
 *
 * A Canvas2D compositor laid over the <video>: every frame it draws the video,
 * then composites the active caption with the shared negative-text core, so the
 * preview is the same pixel pipeline the export runs (see negativeMask.js).
 *
 * Frame index comes from the video's media time × fps — never wall-clock — so
 * the animation lands on the same frames as the burned-in MP4.
 *
 * The frame loop is registered once per play/pause and reads everything else
 * (painters, fps) through refs, so React state ticks during playback never
 * re-arm the loop — re-arming would drop a video frame each time.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { NegativeCaptionPainter, negativeFontString } from '../lib/negativeMask';

const MAX_LONG_SIDE = 1440; // hard cap on the compositing resolution

export default function NegativeTextCanvas({
  videoRef,
  captions,
  styleConfig,
  fps = 30,
  currentTime,
  isPlaying,
  videoDimensions,
  displaySize,
  onFallback,
}) {
  const canvasRef = useRef(null);
  const paintersRef = useRef([]);
  const fpsRef = useRef(fps);
  const drawRef = useRef(null);
  const hasFailedRef = useRef(false);
  const [fontReady, setFontReady] = useState(0);
  useEffect(() => { fpsRef.current = fps; }, [fps]);

  // Composite at the size the video is actually shown (× device pixels) so the
  // text is as crisp as DOM text, but never above the source resolution. All
  // geometry is proportional to the frame, so any size matches the export.
  const dpr = typeof window !== 'undefined' ? Math.min(3, window.devicePixelRatio || 1) : 1;
  const shownH = Math.round((displaySize?.height || 0) * dpr);
  const dims = useMemo(() => {
    const vw = videoDimensions?.width || 0;
    const vh = videoDimensions?.height || 0;
    if (!vw || !vh) return null;
    const wantedLong = shownH > 0 ? shownH * (Math.max(vw, vh) / vh) : MAX_LONG_SIDE;
    const k = Math.min(1, Math.min(MAX_LONG_SIDE, wantedLong) / Math.max(vw, vh));
    return { w: Math.max(2, Math.round(vw * k)), h: Math.max(2, Math.round(vh * k)) };
  }, [videoDimensions?.width, videoDimensions?.height, shownH]);

  // Make sure the chosen family is actually loaded before measuring with it —
  // measuring against a fallback font would lay the caption out wrong.
  useEffect(() => {
    const family = styleConfig.fontFamily || 'Anton';
    const spec = negativeFontString(family, 40, styleConfig.fontWeight, !!styleConfig.italic);
    if (typeof document === 'undefined' || !document.fonts) return undefined;
    if (document.fonts.check(spec)) return undefined; // already loaded: painters measure correctly now
    let cancelled = false;
    document.fonts.load(spec).then(() => { if (!cancelled) setFontReady((n) => n + 1); }).catch(() => {});
    return () => { cancelled = true; };
  }, [styleConfig.fontFamily, styleConfig.fontWeight, styleConfig.italic]);

  // Rebuild painters whenever anything that affects layout or timing changes,
  // then repaint the current frame if we're paused.
  useEffect(() => {
    const painters = [];
    if (dims && Array.isArray(captions)) {
      for (const c of captions) {
        if (!c || typeof c.start !== 'number' || typeof c.end !== 'number') continue;
        try {
          const p = new NegativeCaptionPainter(c, styleConfig, dims.w, dims.h, fps);
          if (p.words.length && p.clip) painters.push(p);
        } catch (err) {
          console.warn('negative text: caption skipped', err);
        }
      }
      painters.sort((a, b) => a.timing.startFrame - b.timing.startFrame);
    }
    paintersRef.current = painters;
    if (!isPlaying && drawRef.current) drawRef.current();
  }, [captions, styleConfig, dims, fps, fontReady, isPlaying]);

  // The frame loop.
  useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef?.current;
    if (!canvas || !video || !dims) return undefined;
    if (canvas.width !== dims.w || canvas.height !== dims.h) {
      canvas.width = dims.w;
      canvas.height = dims.h;
    }
    const ctx = canvas.getContext('2d', { willReadFrequently: true, alpha: false });

    const draw = (mediaTime) => {
      if (hasFailedRef.current || !video || video.readyState < 2) return;
      const t = typeof mediaTime === 'number' ? mediaTime : video.currentTime;
      try {
        ctx.drawImage(video, 0, 0, dims.w, dims.h);
        const frame = Math.max(0, Math.round(t * fpsRef.current));
        for (const p of paintersRef.current) {
          if (p.covers(frame)) p.render(ctx, frame);
        }
      } catch (err) {
        if (!hasFailedRef.current) {
          hasFailedRef.current = true;
          console.warn('NegativeTextCanvas cross-origin restriction, falling back to CSS difference mode:', err);
          if (typeof onFallback === 'function') {
            onFallback();
          }
        }
      }
    };
    drawRef.current = draw;

    let alive = true;
    let handle = null;
    let raf = null;
    const useRVFC = typeof video.requestVideoFrameCallback === 'function';

    if (isPlaying) {
      const tick = (_now, meta) => {
        if (!alive) return;
        // Arm the next callback first so a slow composite can never miss a frame.
        if (useRVFC) handle = video.requestVideoFrameCallback(tick);
        else raf = requestAnimationFrame(() => tick());
        draw(meta ? meta.mediaTime : undefined);
      };
      if (useRVFC) handle = video.requestVideoFrameCallback(tick);
      else raf = requestAnimationFrame(() => tick());
      return () => {
        alive = false;
        if (handle != null && useRVFC) video.cancelVideoFrameCallback(handle);
        if (raf != null) cancelAnimationFrame(raf);
      };
    }

    // Paused: draw now, and again once the <video> has finished decoding a seek.
    draw();
    const onSeeked = () => draw();
    video.addEventListener('seeked', onSeeked);
    const t = setTimeout(() => draw(), 60);
    return () => {
      alive = false;
      clearTimeout(t);
      video.removeEventListener('seeked', onSeeked);
    };
  }, [videoRef, dims, isPlaying]);

  // Paused seeks through state (timeline, ±3s) repaint the new frame.
  useEffect(() => {
    if (!isPlaying && drawRef.current) drawRef.current();
  }, [currentTime, isPlaying]);

  if (!dims) return null;
  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none z-20"
      aria-hidden="true"
    />
  );
}
