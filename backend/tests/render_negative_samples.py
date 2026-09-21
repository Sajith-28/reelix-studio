"""
Renders sample MP4s of the Negative Nano template over synthetic footage so the
effect can be eyeballed without a real upload:

    bright   — near-white footage (negative → near-black glyphs)
    dark     — near-black footage (negative → near-white glyphs)
    midgray  — ~50% gray, where the readability safeguard kicks in
    moving   — animated colour gradients (every frame differs)

Each clip cycles through four captions that exercise different IN/OUT presets
and variants. Output: backend/exports/samples/negative_<footage>.mp4

Run:  cd backend && python tests/render_negative_samples.py [--quick]
"""

import os
import subprocess
import sys

import numpy as np

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from services.audio import get_ffmpeg_bin  # noqa: E402
from services.negative_text import render_negative_text_video  # noqa: E402

W, H, FPS = 720, 1280, 30
OUT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "exports", "samples"))

STYLE = {
    "renderer": "negative", "fontFamily": "Anton", "fontSize": 42, "xPercent": 50, "yPercent": 72,
    "letterSpacing": 0.5, "lineHeight": 1.02, "maxWordsPerLine": 3, "textTransform": "uppercase",
    "strokeWidth": 0, "strokeColor": "#000000", "shadowType": "none", "shadowBlur": 0, "shadowOpacity": 0,
    "shadowDistance": 0, "shadowColor": "#000000", "backgroundColor": "transparent",
    "karaoke": True, "activeScale": 1.06, "variant": "negative-text",
    "inPreset": "stagger-rise", "outPreset": "mask-wipe", "inDuration": 0.36, "outDuration": 0.28,
    "stagger": 30, "easing": "auto", "lowContrastFallback": "stroke",
}


def words(text, start, end):
    ws = text.split()
    step = (end - start) / len(ws)
    return [{"word": w, "start": round(start + i * step, 3), "end": round(start + (i + 1) * step, 3)} for i, w in enumerate(ws)]


def captions():
    plan = [
        ("this is negative text", 0.4, 2.2, {}),
        ("every pixel inverted", 2.5, 4.3, {"inPreset": "scale-pop", "outPreset": "blur-in"}),
        ("any font any footage", 4.6, 6.6, {"variant": "negative-box", "inPreset": "mask-wipe", "outPreset": "mask-wipe"}),
        ("watch the word flip", 6.9, 9.2, {"variant": "negative-highlight", "inPreset": "split-word", "outPreset": "typewriter"}),
        ("sweep it clean", 9.5, 11.6, {"variant": "negative-sweep", "inPreset": "none", "outPreset": "glitch", "inDuration": 0.5}),
        ("beat drop", 11.9, 13.6, {"inPreset": "flip-invert", "outPreset": "flip-invert", "inDuration": 0.5}),
    ]
    out = []
    for i, (text, s, e, overrides) in enumerate(plan):
        out.append({"id": i + 1, "start": s, "end": e, "translated_text": text, "keywords": [],
                    "words": words(text, s, e), "negativeOverrides": overrides})
    return out


def footage_frame(kind, i):
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    f = np.zeros((H, W, 3), np.uint8)
    drift = i * 0.6
    if kind == "bright":
        f[..., 0] = 236 - 18 * (xx / W)
        f[..., 1] = 234 - 10 * (yy / H)
        f[..., 2] = 228 + 12 * np.sin((xx + drift) / 120)
    elif kind == "dark":
        f[..., 0] = 18 + 22 * (yy / H)
        f[..., 1] = 20 + 12 * np.sin((xx - drift) / 90)
        f[..., 2] = 26
    elif kind == "midgray":
        f[...] = 128
        f[..., 1] = 122 + 14 * np.sin((xx + drift) / 70)
        f[..., 0] = 126 + 8 * np.cos((yy - drift) / 110)
    else:
        phase = i * 7
        f[..., 0] = 127 + 120 * np.sin((xx + phase) / 90)
        f[..., 1] = 127 + 120 * np.cos((yy - phase) / 120)
        f[..., 2] = 127 + 120 * np.sin((xx + yy + 2 * phase) / 140)
        # a bright moving disc so the caption crosses hard luminance edges
        cx, cy = W * (0.5 + 0.35 * np.sin(i / 25.0)), H * 0.72
        disc = (xx - cx) ** 2 + (yy - cy) ** 2 < (W * 0.16) ** 2
        f[disc] = 245
    return f[..., ::-1]  # BGR for the rawvideo pipe


def write_footage(kind, seconds, path):
    proc = subprocess.Popen(
        [get_ffmpeg_bin(), "-y", "-f", "rawvideo", "-vcodec", "rawvideo", "-s", f"{W}x{H}", "-pix_fmt", "bgr24",
         "-r", str(FPS), "-i", "-", "-c:v", "libx264", "-preset", "fast", "-crf", "16", "-pix_fmt", "yuv420p", path],
        stdin=subprocess.PIPE, stderr=subprocess.DEVNULL)
    for i in range(int(seconds * FPS)):
        proc.stdin.write(footage_frame(kind, i).tobytes())
    proc.stdin.close()
    proc.wait()


def main():
    quick = "--quick" in sys.argv
    os.makedirs(OUT_DIR, exist_ok=True)
    seconds = 4.6 if quick else 14.0
    caps = [c for c in captions() if c["end"] <= seconds + 0.01]
    for kind in ("bright", "dark", "midgray", "moving"):
        src = os.path.join(OUT_DIR, f"footage_{kind}.mp4")
        print(f"[{kind}] generating footage ...")
        write_footage(kind, seconds, src)
        print(f"[{kind}] rendering negative text ...")
        out = render_negative_text_video(src, caps, STYLE, OUT_DIR, "original")
        final = os.path.join(OUT_DIR, f"negative_{kind}.mp4")
        if os.path.exists(final):
            os.remove(final)
        os.rename(out, final)
        os.remove(src)
        print(f"[{kind}] -> {final}")


if __name__ == "__main__":
    main()
