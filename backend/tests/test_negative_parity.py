"""
Preview ↔ export parity for the Negative Text template.

The preview composites in the browser with `frontend/src/lib/negativeText.js`;
the export composites with `backend/services/negative_text.py`. These tests run
both cores on identical inputs (via Node) and compare:

  * animation state per frame for every IN/OUT preset (timing must be exact)
  * mask utilities (shift / slice / clip / ring / union / luminance / hash)
  * the compositor on bright, dark, mid-gray and moving frames (≤ 2/255)
  * the layout algorithm given identical measurements

Glyph rasterisation itself (Skia vs FreeType) is deliberately shared: both
sides composite the *same* PIL mask, so a failure here means the math diverged,
not the font hinting.

Run:  cd backend && python -m pytest tests -q
"""

import base64
import json
import math
import os
import shutil
import subprocess
import tempfile

import numpy as np
import pytest

from services import negative_text as nt
from services.rendering import resolve_font_path

HERE = os.path.dirname(os.path.abspath(__file__))
NODE_RUNNER = os.path.join(HERE, "negative_parity_node.mjs")
NODE = shutil.which("node")

pytestmark = pytest.mark.skipif(NODE is None, reason="node is required to run the JS core")

FPS = 30.0
VIDEO_W, VIDEO_H = 540, 960

# The "Negative Nano" template as registered in captionStyle.js.
NANO_STYLE = {
    "renderer": "negative",
    "fontFamily": "Anton",
    "fontSize": 42,
    "xPercent": 50,
    "yPercent": 72,
    "letterSpacing": 0.5,
    "lineHeight": 1.02,
    "maxWordsPerLine": 3,
    "textTransform": "uppercase",
    "strokeWidth": 0,
    "strokeColor": "#000000",
    "shadowType": "none",
    "shadowBlur": 0,
    "shadowOpacity": 0,
    "shadowDistance": 0,
    "shadowColor": "#000000",
    "backgroundColor": "transparent",
    "karaoke": True,
    "activeScale": 1.08,
    "variant": "negative-text",
    "inPreset": "stagger-rise",
    "outPreset": "mask-wipe",
    "inDuration": 0.36,
    "outDuration": 0.28,
    "stagger": 30,
    "easing": "auto",
    "lowContrastFallback": "stroke",
}

CAPTION = {
    "id": 1,
    "start": 0.4,
    "end": 1.9,
    "translated_text": "make it negative now",
    "keywords": ["negative"],
    "words": [
        {"word": "make", "start": 0.4, "end": 0.7},
        {"word": "it", "start": 0.7, "end": 0.9},
        {"word": "negative", "start": 0.9, "end": 1.5},
        {"word": "now", "start": 1.5, "end": 1.9},
    ],
}


# ─────────────────────────────── helpers ───────────────────────────────

def run_node(job):
    with tempfile.TemporaryDirectory() as d:
        jp, rp = os.path.join(d, "job.json"), os.path.join(d, "result.json")
        with open(jp, "w", encoding="utf-8") as f:
            json.dump(job, f)
        res = subprocess.run([NODE, NODE_RUNNER, jp, rp], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        assert res.returncode == 0, res.stderr.decode("utf-8", errors="ignore")
        with open(rp, encoding="utf-8") as f:
            return json.load(f)


def b64(arr):
    return base64.b64encode(np.ascontiguousarray(arr, dtype=np.uint8).tobytes()).decode("ascii")


def unb64(s, shape):
    return np.frombuffer(base64.b64decode(s), dtype=np.uint8).reshape(shape)


def synthetic_frames():
    """Bright, dark, mid-gray and moving footage (RGB, uint8)."""
    h, w = VIDEO_H, VIDEO_W
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float64)
    bright = np.full((h, w, 3), 232, np.uint8)
    bright[..., 2] = (232 - 24 * (xx / w)).astype(np.uint8)
    dark = np.full((h, w, 3), 22, np.uint8)
    dark[..., 0] = (22 + 20 * (yy / h)).astype(np.uint8)
    mid = np.full((h, w, 3), 128, np.uint8)
    mid[..., 1] = (120 + 16 * np.sin(xx / 40)).astype(np.uint8)

    def moving(i):
        f = np.zeros((h, w, 3), np.uint8)
        phase = i * 9
        f[..., 0] = (127 + 120 * np.sin((xx + phase) / 60)).astype(np.uint8)
        f[..., 1] = (127 + 120 * np.cos((yy - phase) / 80)).astype(np.uint8)
        f[..., 2] = (127 + 120 * np.sin((xx + yy + 2 * phase) / 90)).astype(np.uint8)
        return f

    return {"bright": bright, "dark": dark, "mid": mid, "moving": moving}


def approx_equal(a, b, tol=1e-9):
    if isinstance(a, bool) or isinstance(b, bool):
        return a == b
    if isinstance(a, (int, float)) and isinstance(b, (int, float)):
        return math.isclose(a, b, rel_tol=0, abs_tol=tol)
    if a is None or b is None:
        return a is b
    if isinstance(a, dict):
        return set(a) == set(b) and all(approx_equal(a[k], b[k], tol) for k in a)
    if isinstance(a, (list, tuple)):
        return len(a) == len(b) and all(approx_equal(x, y, tol) for x, y in zip(a, b))
    return a == b


# ─────────────────────────────── tests ───────────────────────────────

@pytest.mark.parametrize("preset", [p for p in nt.NEGATIVE_PRESET_UNITS])
@pytest.mark.parametrize("fps", [FPS, 23.976, 60.0])
def test_anim_state_parity(preset, fps):
    """Every preset, as IN and as OUT, at three frame rates: identical per-frame state."""
    params = nt.resolve_negative_params({**NANO_STYLE, "inPreset": preset, "outPreset": preset})
    counts = {"chars": 17, "words": 4}
    case = {"caption": CAPTION, "params": params, "fps": fps, "counts": counts,
            "fontPx": 77.0, "blockW": 410.5, "scale": nt.ref_scale(VIDEO_W, VIDEO_H)}
    js = run_node({"anim": [case]})["anim"][0]

    timing = nt.layer_timing(CAPTION, params, fps)
    assert approx_equal(timing, js["timing"])
    frames = list(range(timing["startFrame"] - 1, timing["endFrame"] + 1))
    assert len(frames) == len(js["frames"])
    for f, expected in zip(frames, js["frames"]):
        got = nt.anim_state(f, timing, params, counts, 77.0, 410.5, case["scale"])
        assert approx_equal(got, expected, 1e-9), f"frame {f} preset {preset}: {got} != {expected}"

    sweeps = [nt.sweep_band(f, timing, params) for f in range(timing["startFrame"], timing["endFrame"])]
    assert approx_equal(sweeps, js["sweep"], 1e-9)


def test_short_caption_scales_in_out_windows():
    params = nt.resolve_negative_params({**NANO_STYLE, "inDuration": 0.5, "outDuration": 0.5})
    t = nt.layer_timing({"start": 1.0, "end": 1.4}, params, FPS)
    assert t["inFrames"] + t["outFrames"] == t["endFrame"] - t["startFrame"]
    assert t["inFrames"] > 0 and t["outFrames"] > 0


def test_mask_utilities_parity():
    rng = np.random.default_rng(7)
    w, h = 64, 24
    mask = rng.integers(0, 256, (h, w), dtype=np.uint8)
    other = rng.integers(0, 256, (h, w), dtype=np.uint8)
    rgb = rng.integers(0, 256, (h, w, 3), dtype=np.uint8)
    slices = [3, -5, 0, 7, -2, 4]
    job = {"masks": {"mask": b64(mask), "other": b64(other), "rgb": b64(rgb), "w": w, "h": h,
                     "dx": -6, "slices": slices, "x0": 10.4, "x1": 50.6, "fl": 3.2, "fr": 5.0, "k": 0.37, "luma": 0.47}}
    js = run_node(job)["masks"]

    assert np.array_equal(unb64(js["shift"], (h, w)), nt.shift_mask(mask, -6))
    assert np.array_equal(unb64(js["slices"], (h, w)), nt.slice_mask(mask, slices))
    assert np.array_equal(unb64(js["clip"], (h, w)), nt.clip_mask_x(mask, 10.4, 50.6))
    feathered = nt.clip_mask_x(mask, 10.4, 50.6, 3.2, 5.0)
    assert np.abs(unb64(js["clipFeather"], (h, w)).astype(int) - feathered.astype(int)).max() <= 1
    for f, expected in zip(["right", "left", "both", None], js["wipe"]):
        assert approx_equal(nt.wipe_edges([0.3, 0.8], f, 11, 40, 4.5, w), expected, 1e-9)
    assert np.array_equal(unb64(js["outside"], (h, w)), nt.mask_outside(mask, other))
    assert np.array_equal(unb64(js["union"], (h, w)), nt.union_mask(mask, other))
    assert np.array_equal(unb64(js["scaled"], (h, w)), nt.scale_mask(mask, 0.37))
    assert math.isclose(js["luma"], nt.masked_luminance(rgb, mask), abs_tol=1e-9)
    assert math.isclose(js["score"], nt.low_contrast_score(0.47), abs_tol=1e-12)
    for a, row in zip([0, 1, 2, 3, 1000, 1003], js["hash"]):
        for b, v in zip([0, 1, 5, 99], row):
            assert math.isclose(v, nt.hash01(a, b), abs_tol=1e-12)


def _renderer(style, caption=CAPTION):
    return nt.NegativeCaptionRenderer(caption, style, VIDEO_W, VIDEO_H, FPS, resolve_font_path(style["fontFamily"]))


@pytest.mark.parametrize("variant", ["negative-text", "negative-box", "negative-highlight", "negative-sweep"])
@pytest.mark.parametrize("vfx", [
    {},
    {"strokeWidth": 3, "strokeColor": "#101010", "shadowType": "cinematic", "shadowBlur": 14,
     "shadowOpacity": 0.9, "shadowDistance": 4},
    {"shadowType": "glow", "shadowColor": "#00e5ff", "shadowBlur": 18, "shadowOpacity": 0.8,
     "backgroundColor": "rgba(15, 23, 42, 0.85)", "bgPadding": 8, "bgRadius": 10,
     "lowContrastFallback": "contrast-boost"},
])
def test_composite_parity_on_footage(variant, vfx):
    """One frame of each footage type through both compositors: ≤ 2/255 per channel."""
    style = {**NANO_STYLE, **vfx, "variant": variant, "inPreset": "glitch", "outPreset": "blur-in"}
    footage = synthetic_frames()
    cases, expected = [], []
    r = _renderer(style)
    c = r.clip
    # Frames chosen to hit IN (glitch RGB split), hold (karaoke word 3) and OUT (blur).
    for name, frame_idx in [("bright", 13), ("dark", 14), ("mid", 30), ("moving", 52), ("moving", 45)]:
        frame = footage[name](frame_idx) if callable(footage[name]) else footage[name].copy()
        region = np.ascontiguousarray(frame[c["y"]:c["y"] + c["h"], c["x"]:c["x"] + c["w"]])
        layers = r.build_layers(frame_idx, region)
        assert layers is not None
        cases.append({
            "rgb": b64(region), "w": c["w"], "h": c["h"],
            "layers": {k: (b64(v) if isinstance(v, np.ndarray) else v)
                       for k, v in layers.items() if k != "fill"},
        })
        expected.append(nt.composite_layers(region.copy(), layers))
    js = run_node({"composite": cases})["composite"]
    for got_b64, exp, case in zip(js, expected, cases):
        got = unb64(got_b64, exp.shape).astype(np.int16)
        diff = np.abs(got - exp.astype(np.int16)).max()
        assert diff <= 2, f"max channel diff {diff} for {variant} {vfx}"


def test_layout_parity_with_identical_measurements():
    """Same font measurements in → same block, lines, char positions and region out."""
    style = {**NANO_STYLE, "letterSpacing": 2, "maxWordsPerLine": 2}
    r = _renderer(style)
    words = r.words
    widths, metrics = {}, {}

    def measure(text, px):
        v = r.measure(text, px)
        widths[f"{px}|{text}"] = v
        return v

    def metric(px):
        asc, desc = r.metrics(px)
        metrics[str(px)] = {"ascent": asc, "descent": desc}
        return asc, desc

    lay = nt.layout_caption(words, style, VIDEO_W, VIDEO_H, measure, metric)
    js = run_node({"layout": {"words": words, "style": style, "videoW": VIDEO_W, "videoH": VIDEO_H,
                              "widths": widths, "metrics": metrics}})["layout"]
    assert approx_equal(lay, js["layout"], 1e-6)
    pad = nt.region_padding(lay, style, lay["scale"])
    assert pad == js["pad"]
    assert nt.region_rect(lay, style, VIDEO_W, VIDEO_H, pad) == js["rect"]


def test_negative_is_exact_inverse_inside_glyphs():
    """Bright footage + no VFX: fully covered glyph pixels equal 255 − video."""
    style = {**NANO_STYLE, "inPreset": "none", "outPreset": "none", "lowContrastFallback": "none"}
    r = _renderer(style)
    frame = synthetic_frames()["bright"]
    bgr = np.ascontiguousarray(frame[..., ::-1]).copy()
    before = bgr.copy()
    r.render(bgr, 30)
    c = r.clip
    region_layers = r.build_layers(30, np.ascontiguousarray(frame[c["y"]:c["y"] + c["h"], c["x"]:c["x"] + c["w"]]))
    fill = region_layers["fill"]
    inside = fill == 255
    assert inside.sum() > 500
    out = bgr[c["y"]:c["y"] + c["h"], c["x"]:c["x"] + c["w"]]
    src = before[c["y"]:c["y"] + c["h"], c["x"]:c["x"] + c["w"]]
    assert np.array_equal(out[inside], 255 - src[inside])
    # Nothing outside the composite region may change.
    mask_outside = np.ones(bgr.shape[:2], bool)
    mask_outside[c["y"]:c["y"] + c["h"], c["x"]:c["x"] + c["w"]] = False
    assert np.array_equal(bgr[mask_outside], before[mask_outside])


def test_low_contrast_fallback_engages_only_on_mid_gray():
    footage = synthetic_frames()
    for name, expect_engaged in [("bright", False), ("dark", False), ("mid", True)]:
        r = _renderer({**NANO_STYLE, "inPreset": "none", "outPreset": "none"})
        c = r.clip
        region = np.ascontiguousarray(footage[name][c["y"]:c["y"] + c["h"], c["x"]:c["x"] + c["w"]])
        layers = r.build_layers(30, region)
        assert (r.score > 0.5) == expect_engaged, (name, r.score)
        assert (layers["ring"] is not None) == expect_engaged
