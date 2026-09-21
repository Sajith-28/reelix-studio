"""
REELIX — Negative Text (difference-blend) export renderer

Mirrors `frontend/src/lib/negativeText.js` function-for-function so the burned-in
MP4 matches the Canvas2D preview frame-for-frame. Anything that changes here
must change there too — `backend/tests/test_negative_parity.py` runs both.

Canonical compositing formula (per pixel, per channel):
    out = base * (1 - a) + (1 - base) * a        a = mask coverage 0..1

Layer order inside `composite_layers`:
    1. pill (caption card background, normal blend)
    2. shadow / glow (normal blend, masked OUT of the glyphs)
    3. white (normal-blend glyphs: highlight variant, flip-invert pre-beat)
    4. negative (the inversion, optional contrast curve)
    5. stroke ring (normal blend, ring = stroke * (1 - fill))
"""

import math
import os
import re
import subprocess
import uuid

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

from services.audio import get_ffmpeg_bin

# ───────────────────────────── Shared constants ─────────────────────────────

NEGATIVE_PRESET_UNITS = {
    "stagger-rise": "char",
    "mask-wipe": "block",
    "scale-pop": "word",
    "typewriter": "char",
    "blur-in": "block",
    "flip-invert": "block",
    "glitch": "block",
    "split-word": "word",
    "none": "block",
}

NEGATIVE_DEFAULTS = {
    "renderer": "negative",
    "variant": "negative-text",
    "inPreset": "stagger-rise",
    "outPreset": "mask-wipe",
    "inDuration": 0.36,
    "outDuration": 0.28,
    "holdDuration": 0,
    "stagger": 30,
    "easing": "auto",
    "startTime": 0,
    "opacityFade": False,
    "lowContrastFallback": "stroke",
    "typewriterCursor": True,
    "maxWidthPct": 85,
    "luminanceEveryN": 3,
}

LOW_CONTRAST_CENTRE = 0.5
LOW_CONTRAST_HALFWIDTH = 0.12
LUMINANCE_SMOOTHING = 0.35
GLITCH_FRAMES = 4
FLASH_FRAMES = 2
GLITCH_SLICES = 6
UNIT_SPAN = 0.62
WIPE_FEATHER_EM = 0.12
ITALIC_SHEAR = 0.25

# ─────────────────────────────── Easing ───────────────────────────────


def _ease_out_back(t):
    c1 = 1.70158
    c3 = c1 + 1
    return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2


EASINGS = {
    "linear": lambda t: t,
    "easeOutCubic": lambda t: 1 - (1 - t) ** 3,
    "easeInOutCubic": lambda t: 4 * t * t * t if t < 0.5 else 1 - ((-2 * t + 2) ** 3) / 2,
    "easeOutQuint": lambda t: 1 - (1 - t) ** 5,
    "easeOutExpo": lambda t: 1 if t >= 1 else 1 - 2 ** (-10 * t),
    "easeOutBack": _ease_out_back,
    "easeInOutSine": lambda t: -(math.cos(math.pi * t) - 1) / 2,
}


def clamp01(v):
    return 0.0 if v < 0 else 1.0 if v > 1 else v


def _ease(name, t, fallback):
    fn = EASINGS.get(name) if name and name != "auto" else None
    fn = fn or EASINGS.get(fallback) or EASINGS["easeOutCubic"]
    return fn(clamp01(t))


def _js_round(x):
    """JavaScript Math.round for non-negative values (half rounds up)."""
    return math.floor(x + 0.5)


def hash01(a, b):
    """Mirror of the JS 32-bit hash so glitch offsets match frame-for-frame."""
    M = 0xFFFFFFFF
    h = (((a + 1) & M) * 374761393 + ((b + 1) & M) * 668265263) & M
    h = ((h ^ (h >> 13)) * 1274126177) & M
    h = (h ^ (h >> 16)) & M
    return h / 4294967296.0


# ─────────────────────────── Geometry helpers ───────────────────────────


def ref_scale(video_w, video_h):
    return video_h / 520.0 if video_h >= video_w else video_w / 640.0


def resolve_negative_params(style, caption=None):
    merged = dict(NEGATIVE_DEFAULTS)
    merged.update(style or {})
    overrides = (caption or {}).get("negativeOverrides")
    if isinstance(overrides, dict):
        merged.update(overrides)
    return merged


def _num(v, default=0.0):
    try:
        f = float(v)
        return default if math.isnan(f) else f
    except (TypeError, ValueError):
        return default


def layer_timing(caption, params, fps):
    start = _num(caption.get("start"), 0.0) + _num(params.get("startTime"), 0.0)
    end = _num(caption.get("end"), start)
    in_d = max(0.0, _num(params.get("inDuration")))
    out_d = max(0.0, _num(params.get("outDuration")))
    hold = max(0.0, _num(params.get("holdDuration")))
    if hold > 0:
        end = min(end, start + in_d + hold + out_d)

    start_frame = _js_round(start * fps)
    end_frame = max(start_frame + 1, _js_round(end * fps))
    length = end_frame - start_frame

    in_frames = _js_round(in_d * fps)
    out_frames = _js_round(out_d * fps)
    if in_frames + out_frames > length:
        total = in_frames + out_frames
        in_frames = _js_round(in_frames * length / total)
        out_frames = length - in_frames
    stagger_frames = max(0.0, _num(params.get("stagger")) / 1000.0) * fps
    return {
        "startFrame": start_frame, "endFrame": end_frame,
        "inFrames": in_frames, "outFrames": out_frames, "staggerFrames": stagger_frames,
    }


def unit_progress(f, total, stagger, i, n):
    if total <= 0:
        return 1.0
    per = total if n <= 1 else max(2, min(total, _js_round(total * UNIT_SPAN)))
    s = min(stagger, (total - per) / (n - 1)) if n > 1 else 0.0
    return clamp01((f - i * s) / per)


def _preset_unit(preset):
    return NEGATIVE_PRESET_UNITS.get(preset, "block")


def _new_block():
    return {"clipX": None, "clipFeather": None, "blur": 0.0, "scale": 1.0, "mode": "negative", "flash": False,
            "slices": None, "rgbSplit": 0, "cursor": -1, "opacity": 1.0}


def anim_state(frame, timing, params, counts, font_px, block_w, scale):
    start_frame, end_frame = timing["startFrame"], timing["endFrame"]
    in_frames, out_frames, stagger_frames = timing["inFrames"], timing["outFrames"], timing["staggerFrames"]
    f = frame - start_frame
    length = end_frame - start_frame
    state = {"phase": "hidden", "preset": "none", "dir": "in", "unit": "block",
             "progress": 1.0, "units": [], "block": _new_block()}
    if f < 0 or f >= length:
        return state

    direction, preset, phase_frames, pf = "hold", "none", 0, 0
    if f < in_frames:
        direction, preset, phase_frames, pf = "in", params.get("inPreset") or "none", in_frames, f
    elif f >= length - out_frames:
        direction, preset, phase_frames, pf = "out", params.get("outPreset") or "none", out_frames, length - 1 - f
    state["phase"] = direction
    state["dir"] = direction
    state["preset"] = preset
    unit = _preset_unit(preset)
    state["unit"] = unit

    n = counts["chars"] if unit == "char" else counts["words"] if unit == "word" else 1
    easing_name = params.get("easing")
    stagger = 0.0 if unit == "block" else stagger_frames
    block_t = 1.0 if direction == "hold" else unit_progress(pf, phase_frames, 0, 0, 1)
    state["progress"] = block_t

    units = []
    count = max(1, n)
    for i in range(count):
        t = 1.0 if direction == "hold" else unit_progress(pf, phase_frames, stagger, i, count)
        units.append({"t": t, "tx": 0.0, "ty": 0.0, "scale": 1.0, "visible": True, "lineClip": False})
    state["units"] = units
    block = state["block"]
    if params.get("opacityFade") and direction != "hold":
        block["opacity"] = _ease("linear", block_t, "linear")

    # The 2-frame flash on the IN beat lives in the first two frames after IN.
    if params.get("inPreset") == "flip-invert" and in_frames <= f < in_frames + FLASH_FRAMES and direction != "out":
        block["mode"] = "flash"
        block["flash"] = True
        state["phase"] = "in"

    if direction == "hold" or preset == "none":
        return state

    if preset == "stagger-rise":
        for u in units:
            e = _ease(easing_name, u["t"], "easeOutCubic")
            u["ty"] = (1 - e) * 0.4 * font_px
            u["lineClip"] = True
    elif preset == "mask-wipe":
        e = _ease(easing_name, block_t, "easeInOutCubic")
        block["clipX"] = [0.0, e] if direction == "in" else [1 - e, 1.0]
        block["clipFeather"] = "right" if direction == "in" else "left"
    elif preset == "scale-pop":
        for u in units:
            t = u["t"]
            if t < 0.7:
                u["scale"] = 0.6 + 0.48 * EASINGS["easeOutCubic"](t / 0.7)
            else:
                u["scale"] = 1.08 - 0.08 * EASINGS["easeInOutSine"]((t - 0.7) / 0.3)
            if t <= 0:
                u["visible"] = False
    elif preset == "typewriter":
        last = -1
        for i, u in enumerate(units):
            u["visible"] = u["t"] > 0
            if u["visible"]:
                last = i
        if params.get("typewriterCursor", True) is not False and direction == "in":
            fps_guess = max(1, phase_frames)
            on = math.floor((pf / fps_guess) * 8) % 2 == 0
            block["cursor"] = last if on else -1
    elif preset == "blur-in":
        e = _ease(easing_name, block_t, "easeOutCubic")
        block["blur"] = 12 * (1 - e) * scale * 0.5
        block["scale"] = 1.1 - 0.1 * e
    elif preset == "flip-invert":
        if direction == "in":
            block["mode"] = "white"
        else:
            block["mode"] = "flash" if pf < FLASH_FRAMES else "white"
            if pf < FLASH_FRAMES:
                block["flash"] = True
    elif preset == "glitch":
        if pf < GLITCH_FRAMES:
            seed = pf if direction == "in" else 1000 + pf
            amp = 0.06 * block_w
            block["slices"] = [int(round_js((hash01(seed, k) * 2 - 1) * amp)) for k in range(GLITCH_SLICES)]
            block["rgbSplit"] = int(round_js((0.6 + 0.4 * hash01(seed, 99)) * 0.02 * block_w))
    elif preset == "split-word":
        for i, u in enumerate(units):
            e = _ease(easing_name, u["t"], "easeOutCubic")
            u["tx"] = (-1 if i % 2 == 0 else 1) * (1 - e) * 0.5 * block_w
        block["clipX"] = [-0.08, 1.08]
        block["clipFeather"] = "both"
    return state


def round_js(x):
    """Math.round semantics for signed values: half rounds toward +inf."""
    return math.floor(x + 0.5)


def sweep_band(frame, timing, params):
    start_frame, end_frame, in_frames = timing["startFrame"], timing["endFrame"], timing["inFrames"]
    f = frame - start_frame
    if f < 0 or f >= end_frame - start_frame:
        return None
    band_w = 0.16
    if in_frames <= 0 or f >= in_frames:
        return {"left": 1 + band_w, "right": 1 + band_w, "done": True}
    e = _ease(params.get("easing"), unit_progress(f, in_frames, 0, 0, 1), "easeInOutCubic")
    right = -band_w + e * (1 + 2 * band_w)
    return {"left": right - band_w, "right": right, "done": False}


# ────────────────────────────── Layout ──────────────────────────────


def layout_caption(words, style, video_w, video_h, measure, metrics):
    scale = ref_scale(video_w, video_h)
    per_line = max(1, int(_num(style.get("maxWordsPerLine"), 3) or 3))
    line_height_mult = _num(style.get("lineHeight"), 1.05) or 1.05
    spacing_design = _num(style.get("letterSpacing"), 0.0)
    max_w = (_num(style.get("maxWidthPct"), NEGATIVE_DEFAULTS["maxWidthPct"]) / 100.0) * video_w
    base_size = _num(style.get("fontSize"), 42) or 42

    font_px = max(12, _js_round(base_size * scale))
    result = None
    for _ in range(4):
        spacing = spacing_design * scale * (font_px / (base_size * scale))
        ascent, descent = metrics(font_px)
        line_step = line_height_mult * font_px
        half_leading = (line_step - (ascent + descent)) / 2.0
        # Word gap: never narrower than 0.28em so a popped karaoke word keeps clear of its neighbours.
        space_w = max(measure(" ", font_px), 0.28 * font_px) + spacing

        lines = []
        global_word = 0
        global_char = 0
        li = 0
        while li * per_line < len(words):
            row = words[li * per_line: li * per_line + per_line]
            line_words = []
            x = 0.0
            for w in row:
                text = w["text"]
                chars = []
                prefix = ""
                cx = 0.0
                for ch in text:
                    before = measure(prefix, font_px) if prefix else 0.0
                    prefix += ch
                    after = measure(prefix, font_px)
                    adv = after - before + spacing
                    chars.append({"ch": ch, "x": cx, "width": adv, "index": global_char})
                    global_char += 1
                    cx += adv
                line_words.append({"text": text, "x": x, "width": cx, "chars": chars, "index": global_word,
                                   "start": w.get("start"), "end": w.get("end")})
                global_word += 1
                x += cx + space_w
            width = max(0.0, x - space_w)
            lines.append({"words": line_words, "width": width, "top": li * line_step,
                          "baseline": li * line_step + half_leading + ascent, "height": line_step})
            li += 1

        block_w = max([1.0] + [l["width"] for l in lines])
        block_h = line_step * max(1, len(lines))
        for l in lines:
            shift = (block_w - l["width"]) / 2.0
            for w in l["words"]:
                w["x"] += shift
        result = {"fontPx": font_px, "scale": scale, "spacing": spacing, "ascent": ascent, "descent": descent,
                  "lineStep": line_step, "halfLeading": half_leading, "lines": lines,
                  "blockW": block_w, "blockH": block_h, "chars": global_char, "wordCount": global_word}
        if block_w <= max_w or font_px <= 12:
            break
        font_px = max(12, math.floor(font_px * (max_w / block_w)))
    return result


# ───────────────────────── Readability safeguard ─────────────────────────


def masked_luminance(rgb, mask):
    """rgb: (H, W, 3) uint8 in RGB order, mask: (H, W) uint8. Returns 0..1."""
    a = mask.astype(np.float64)
    den = a.sum()
    if den <= 0:
        return 0.5
    y = 0.2126 * rgb[..., 0] + 0.7152 * rgb[..., 1] + 0.0722 * rgb[..., 2]
    return float((y * a).sum() / den / 255.0)


def low_contrast_score(luma):
    return clamp01(1 - abs(luma - LOW_CONTRAST_CENTRE) / LOW_CONTRAST_HALFWIDTH)


def smooth_luminance(prev, sample):
    if prev is None or (isinstance(prev, float) and math.isnan(prev)):
        return sample
    return prev + (sample - prev) * LUMINANCE_SMOOTHING


# ─────────────────────────── Mask utilities ───────────────────────────


def shift_mask(mask, dx):
    if not dx:
        return mask
    h, w = mask.shape
    out = np.zeros_like(mask)
    x0, x1 = max(0, dx), min(w, w + dx)
    if x1 > x0:
        out[:, x0:x1] = mask[:, x0 - dx:x1 - dx]
    return out


def shift_mask_2d(mask, dx, dy):
    h, w = mask.shape
    out = np.zeros_like(mask)
    x0, x1 = max(0, dx), min(w, w + dx)
    y0, y1 = max(0, dy), min(h, h + dy)
    if x1 > x0 and y1 > y0:
        out[y0:y1, x0:x1] = mask[y0 - dy:y1 - dy, x0 - dx:x1 - dx]
    return out


def slice_mask(mask, slices):
    if not slices:
        return mask
    h, w = mask.shape
    out = np.zeros_like(mask)
    band_h = math.ceil(h / len(slices))
    for k, dx in enumerate(slices):
        y0, y1 = k * band_h, min(h, (k + 1) * band_h)
        if y1 <= y0:
            continue
        xs, xe = max(0, dx), min(w, w + dx)
        if xe > xs:
            out[y0:y1, xs:xe] = mask[y0:y1, xs - dx:xe - dx]
    return out


def clip_mask_x(mask, x0, x1, feather_l=0.0, feather_r=0.0):
    h, w = mask.shape
    out = np.zeros_like(mask)
    if feather_l <= 0 and feather_r <= 0:
        a = max(0, _js_round(x0))
        b = min(w, _js_round(x1))
        if b > a:
            out[:, a:b] = mask[:, a:b]
        return out
    c = np.arange(w, dtype=np.float64) + 0.5
    wl = np.clip((c - x0) / feather_l, 0, 1) if feather_l > 0 else (c >= x0).astype(np.float64)
    wr = np.clip((x1 - c) / feather_r, 0, 1) if feather_r > 0 else (c < x1).astype(np.float64)
    weight = wl * wr
    full = weight == 1
    out[:, full] = mask[:, full]
    partial = (weight > 0) & ~full
    if partial.any():
        out[:, partial] = _round_u8(mask[:, partial].astype(np.float64) * weight[partial][None, :])
    return out


def wipe_edges(clip_x, clip_feather, bx, bw, feather, region_w):
    if clip_x is None:
        return None
    if clip_feather == "right":
        return {"x0": 0, "x1": bx + clip_x[1] * (bw + feather), "fl": 0, "fr": feather}
    if clip_feather == "left":
        return {"x0": bx - feather + clip_x[0] * (bw + feather), "x1": region_w, "fl": feather, "fr": 0}
    if clip_feather == "both":
        return {"x0": bx + clip_x[0] * bw, "x1": bx + clip_x[1] * bw, "fl": feather, "fr": feather}
    return {"x0": bx + clip_x[0] * bw, "x1": bx + clip_x[1] * bw, "fl": 0, "fr": 0}


def _round_u8(x):
    return np.floor(x + 0.5).clip(0, 255).astype(np.uint8)


def mask_outside(a, b):
    """a * (1 - b): e.g. stroke ring = stroke * (1 - fill)."""
    return _round_u8(a.astype(np.float64) * (1 - b.astype(np.float64) / 255.0))


def scale_mask(mask, k):
    if k >= 1:
        return mask
    return _round_u8(mask.astype(np.float64) * k)


def max_mask(a, b):
    return np.maximum(a, b)


def union_mask(a, b):
    x = a.astype(np.float64) / 255.0
    y = b.astype(np.float64) / 255.0
    return _round_u8((x + y - x * y) * 255.0)


def crop_mask(mask, sx, sy, cw, ch):
    return mask[sy:sy + ch, sx:sx + cw]


# ──────────────────────────── Compositing ────────────────────────────


def contrast_curve(v, score):
    if score <= 0:
        return v
    k = 1 + 0.9 * score
    return np.clip(127.5 + (v - 127.5) * k, 0, 255)


def composite_layers(px, layers):
    """
    px: (H, W, 3) uint8 in RGB order — modified and returned.
    layers: dict of (H, W) uint8 masks or None:
        pill, pillRGB, shadow, shadowRGB, white, negR, negG, negB, ring, ringRGB, contrast
    """
    out = px.astype(np.float64)
    contrast = float(layers.get("contrast") or 0)

    def blend_solid(mask, rgb):
        nonlocal out
        if mask is None:
            return
        a = mask.astype(np.float64)[..., None] / 255.0
        col = np.array(rgb or [0, 0, 0], dtype=np.float64)[None, None, :]
        out = out * (1 - a) + col * a

    blend_solid(layers.get("pill"), layers.get("pillRGB"))
    blend_solid(layers.get("shadow"), layers.get("shadowRGB"))
    blend_solid(layers.get("white"), [255, 255, 255])

    neg_r = layers.get("negR")
    if neg_r is not None:
        neg_g = layers.get("negG") if layers.get("negG") is not None else neg_r
        neg_b = layers.get("negB") if layers.get("negB") is not None else neg_r
        for c, m in enumerate((neg_r, neg_g, neg_b)):
            a = m.astype(np.float64) / 255.0
            ch = out[..., c]
            out[..., c] = ch * (1 - a) + contrast_curve(255 - ch, contrast) * a

    blend_solid(layers.get("ring"), layers.get("ringRGB"))
    px[...] = _round_u8(out)
    return px


# ───────────────────────── Shadow / stroke plans ─────────────────────────


def shadow_plan(style, scale, fallback_score):
    stype = style.get("shadowType") or "cinematic"
    blur = _num(style.get("shadowBlur"), 14) * scale * 0.5
    dist = _num(style.get("shadowDistance"), 4) * scale
    opacity = _num(style.get("shadowOpacity"), 0.9)
    passes = []
    if stype == "glow":
        passes.append({"dx": 0, "dy": 0, "sigma": blur, "opacity": opacity})
        passes.append({"dx": 0, "dy": 0, "sigma": blur * 1.9, "opacity": opacity * 0.65})
    elif stype == "hard":
        passes.append({"dx": dist, "dy": dist, "sigma": 0, "opacity": opacity})
    elif stype == "cinematic":
        passes.append({"dx": 0, "dy": dist, "sigma": blur, "opacity": opacity})
        passes.append({"dx": 0, "dy": dist * 1.5, "sigma": blur * 1.6, "opacity": opacity * 0.6})
    if fallback_score > 0 and (style.get("lowContrastFallback") or "stroke") == "stroke":
        passes.append({"dx": 0, "dy": 2 * scale * 0.5, "sigma": 6 * scale * 0.5,
                       "opacity": 0.55 * fallback_score, "color": [0, 0, 0]})
    return passes


def stroke_plan(style, scale, fallback_score):
    user = max(0.0, _num(style.get("strokeWidth"))) * scale * 0.5
    fb = 1.5 * scale * 0.5 * fallback_score \
        if (style.get("lowContrastFallback") or "stroke") == "stroke" and fallback_score > 0 else 0.0
    return {"width": max(user, fb), "userWidth": user, "fallbackWidth": fb}


def parse_rgb(value, fallback=(0, 0, 0)):
    if not isinstance(value, str):
        return list(fallback)
    s = value.strip()
    if s.startswith("rgb"):
        nums = re.findall(r"[\d.]+", s)
        if len(nums) >= 3:
            return [max(0, min(255, _js_round(float(n)))) for n in nums[:3]]
        return list(fallback)
    c = s.lstrip("#")
    if len(c) == 3:
        c = "".join(ch * 2 for ch in c)
    if len(c) != 6:
        return list(fallback)
    try:
        n = int(c, 16)
    except ValueError:
        return list(fallback)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255]


def parse_alpha(value):
    if not isinstance(value, str):
        return 1.0
    s = value.strip()
    if s in ("", "transparent"):
        return 0.0
    if s.startswith("rgba"):
        nums = re.findall(r"[\d.]+", s)
        if len(nums) >= 4:
            return clamp01(float(nums[3]))
    return 1.0


# ─────────────────────────── Region geometry ───────────────────────────


def region_padding(layout, style, scale):
    stroke = stroke_plan(style, scale, 1)["width"]
    sx = sy = 0.0
    for p in shadow_plan(style, scale, 1):
        sx = max(sx, abs(p["dx"]) + 3 * p["sigma"])
        sy = max(sy, abs(p["dy"]) + 3 * p["sigma"])
    blur_max = 12 * scale * 0.5 * 3
    box = 0.5 * layout["fontPx"]
    pill = _num(style.get("bgPadding")) * scale * 1.6
    anim_x = max(0.12 * layout["blockW"], blur_max)
    anim_y = max(0.45 * layout["fontPx"], blur_max)
    return {
        "padX": math.ceil(stroke * 2 + 4 + max(sx, anim_x, box, pill)),
        "padY": math.ceil(stroke * 2 + 4 + max(sy, anim_y, box, pill)),
    }


def region_rect(layout, style, video_w, video_h, pad):
    cx = video_w * (_num(style.get("xPercent"), 50) or 50) / 100.0
    cy = video_h * (_num(style.get("yPercent"), 82) or 82) / 100.0
    block_left = _js_round(cx - layout["blockW"] / 2.0)
    block_top = _js_round(cy - layout["blockH"] / 2.0)
    return {
        "x": block_left - pad["padX"], "y": block_top - pad["padY"],
        "w": math.ceil(layout["blockW"]) + pad["padX"] * 2,
        "h": math.ceil(layout["blockH"]) + pad["padY"] * 2,
        "blockX": pad["padX"], "blockY": pad["padY"],
    }


def clip_region(rect, video_w, video_h):
    x0, y0 = max(0, rect["x"]), max(0, rect["y"])
    x1, y1 = min(video_w, rect["x"] + rect["w"]), min(video_h, rect["y"] + rect["h"])
    if x1 <= x0 or y1 <= y0:
        return None
    return {"x": x0, "y": y0, "w": x1 - x0, "h": y1 - y0, "sx": x0 - rect["x"], "sy": y0 - rect["y"]}


def active_word_at(words, frame, fps):
    t = frame / fps
    for i, w in enumerate(words):
        s, e = w.get("start"), w.get("end")
        if isinstance(s, (int, float)) and isinstance(e, (int, float)) and s <= t < e:
            return i
    return -1


def box_geometry(layout, kind, style, scale):
    if kind == "pill":
        pad_y = _num(style.get("bgPadding")) * scale
        pad_x = pad_y * 1.6
        return {"x": -pad_x, "y": -pad_y, "w": layout["blockW"] + pad_x * 2, "h": layout["blockH"] + pad_y * 2,
                "r": _num(style.get("bgRadius")) * scale}
    pad_x = 0.35 * layout["fontPx"]
    pad_y = 0.22 * layout["fontPx"]
    r = _num(style.get("bgRadius")) * scale if style.get("bgRadius") is not None else 0.18 * layout["fontPx"]
    return {"x": -pad_x, "y": -pad_y, "w": layout["blockW"] + pad_x * 2, "h": layout["blockH"] + pad_y * 2, "r": r}


# ───────────────────────────── PIL mask builder ─────────────────────────────


class NegativeCaptionRenderer:
    """
    Holds everything needed to composite one caption on any frame: the layout
    (font-metric driven, any TTF in backend/fonts), the frame window and the
    composite region. `render(frame_bgr, frame_idx)` modifies the frame in place.
    """

    def __init__(self, caption, style, video_w, video_h, fps, font_path):
        from services.rendering import caption_words  # lazy: rendering imports this module
        from services.fonts import read_face

        self.style = style
        # Shear only when italic is wanted but the file is not a real italic face.
        self.synth_italic = bool(style.get("italic")) and not read_face(font_path)["italic"]
        self.params = resolve_negative_params(style, caption)
        self.variant = self.params.get("variant") or "negative-text"
        self.fps = fps
        self.video_w, self.video_h = video_w, video_h
        self.scale = ref_scale(video_w, video_h)
        self.font_path = font_path
        self._fonts = {}
        self.words = caption_words(caption, style)
        self.keywords = caption.get("keywords") or []
        self.timing = layer_timing(caption, self.params, fps)
        self.luma = None
        self.score = 0.0

        self._scratch = ImageDraw.Draw(Image.new("L", (1, 1)))
        self.layout = layout_caption(self.words, style, video_w, video_h, self.measure, self.metrics)
        self.counts = {"chars": self.layout["chars"], "words": self.layout["wordCount"]}
        self.feather = max(2.0, WIPE_FEATHER_EM * self.layout["fontPx"])
        self.pad = region_padding(self.layout, style, self.scale)
        self.rect = region_rect(self.layout, style, video_w, video_h, self.pad)
        self.clip = clip_region(self.rect, video_w, video_h)

    def measure(self, text, px):
        """Advance width of `text` at `px`, same contract as canvas measureText().width."""
        return float(self._scratch.textlength(text, font=self.font(px))) if text else 0.0

    def metrics(self, px):
        asc, desc = self.font(px).getmetrics()
        return float(asc), float(desc)

    def font(self, px):
        px = max(1, int(px))
        f = self._fonts.get(px)
        if f is None:
            f = ImageFont.truetype(self.font_path, px)
            self._fonts[px] = f
        return f

    def covers(self, frame_idx):
        return self.timing["startFrame"] <= frame_idx < self.timing["endFrame"] and self.clip is not None

    # ── glyph rasterisation ──────────────────────────────────────────────

    def _draw_glyphs(self, anim, stroke_w=0.0, word_filter=None, active_idx=-1):
        """
        Rasterises the caption's glyphs into an (h, w) 'L' array at region size,
        applying per-word / per-char animation transforms. Mirrors drawGlyphs()
        in negativeMask.js exactly (same transform order).
        """
        lay = self.layout
        rw, rh = self.rect["w"], self.rect["h"]
        bx, by = self.rect["blockX"], self.rect["blockY"]
        unit = anim["unit"]
        units = anim["units"]
        use_karaoke = self.style.get("karaoke", True) is not False
        active_scale = _num(self.style.get("activeScale"), 1.14) or 1.0

        img = Image.new("L", (rw, rh), 0)
        for line in lay["lines"]:
            needs_clip = unit == "char" and any(
                units[c["index"]]["lineClip"] for w in line["words"] for c in w["chars"] if c["index"] < len(units)
            )
            target = Image.new("L", (rw, rh), 0) if needs_clip else img
            draw = ImageDraw.Draw(target)
            cy = by + line["top"] + line["height"] / 2.0
            for word in line["words"]:
                if word_filter is not None and not word_filter(word):
                    continue
                wu = units[word["index"]] if unit == "word" and word["index"] < len(units) else None
                if wu is not None and not wu["visible"]:
                    continue
                k = wu["scale"] if wu is not None else 1.0
                tx = wu["tx"] if wu is not None else 0.0
                if use_karaoke and word["index"] == active_idx:
                    k *= active_scale
                cx = bx + word["x"] + word["width"] / 2.0
                font = self.font(lay["fontPx"] * k)
                sw = int(round_js(stroke_w * k)) if stroke_w > 0 else 0
                for ch in word["chars"]:
                    cu = units[ch["index"]] if unit == "char" and ch["index"] < len(units) else None
                    if cu is not None and not cu["visible"]:
                        continue
                    ty = cu["ty"] if cu is not None else 0.0
                    x = bx + word["x"] + ch["x"]
                    baseline = by + line["baseline"]
                    xp = cx + (x - cx) * k + tx
                    bp = cy + (baseline + ty - cy) * k
                    kw = {"font": font, "fill": 255, "anchor": "ls"}
                    if sw > 0:
                        kw.update(stroke_width=sw, stroke_fill=255)
                    draw.text((xp, bp), ch["ch"], **kw)
            if needs_clip:
                y0 = int(math.floor(by + line["top"] + lay["halfLeading"]))
                y1 = int(math.ceil(y0 + lay["ascent"] + lay["descent"]))
                arr = np.asarray(target)
                clipped = np.zeros_like(arr)
                y0c, y1c = max(0, y0), min(rh, y1)
                if y1c > y0c:
                    clipped[y0c:y1c] = arr[y0c:y1c]
                img = Image.fromarray(np.maximum(np.asarray(img), clipped))

        # Typewriter cursor: a block after the last revealed character.
        cursor = anim["block"]["cursor"]
        if cursor >= 0 and unit == "char":
            draw = ImageDraw.Draw(img)
            for line in lay["lines"]:
                for word in line["words"]:
                    for ch in word["chars"]:
                        if ch["index"] == cursor:
                            x = bx + word["x"] + ch["x"] + ch["width"] + 0.08 * lay["fontPx"]
                            y0 = by + line["baseline"] - lay["ascent"] * 0.8
                            y1 = by + line["baseline"] + lay["descent"] * 0.2
                            draw.rectangle([x, y0, x + 0.09 * lay["fontPx"], y1], fill=255)
        return np.asarray(img)

    def _block_affine(self, arr, anim):
        """Block scale (blur-in), italic shear and flipH about the block centre."""
        k = anim["block"]["scale"]
        fx = -1.0 if self.style.get("flipH") else 1.0
        sh = ITALIC_SHEAR if self.synth_italic else 0.0
        if k == 1.0 and fx == 1.0 and sh == 0.0:
            return arr
        cx = self.rect["blockX"] + self.layout["blockW"] / 2.0
        cy = self.rect["blockY"] + self.layout["blockH"] / 2.0
        # Forward: q = p - c; q = (q.x - sh*q.y, q.y); q = (k*fx*q.x, k*q.y); p' = q + c
        A = np.array([[k * fx, -k * fx * sh], [0.0, k]])
        b = np.array([cx, cy]) - A @ np.array([cx, cy])
        Ai = np.linalg.inv(A)
        bi = -Ai @ b
        img = Image.fromarray(arr)
        return np.asarray(img.transform(img.size, Image.AFFINE,
                                        (Ai[0, 0], Ai[0, 1], bi[0], Ai[1, 0], Ai[1, 1], bi[1]),
                                        resample=Image.BILINEAR))

    def _block_ops(self, arr, anim):
        """Everything after rasterisation: affine → blur → slices → clip wipe → opacity."""
        block = anim["block"]
        arr = self._block_affine(arr, anim)
        if block["blur"] > 0.05:
            arr = np.asarray(Image.fromarray(arr).filter(ImageFilter.GaussianBlur(block["blur"])))
        if block["slices"]:
            arr = slice_mask(arr, block["slices"])
        if block["clipX"] is not None:
            e = wipe_edges(block["clipX"], block["clipFeather"], self.rect["blockX"], self.layout["blockW"],
                           self.feather, self.rect["w"])
            arr = clip_mask_x(arr, e["x0"], e["x1"], e["fl"], e["fr"])
        if block["opacity"] < 1:
            arr = scale_mask(arr, block["opacity"])
        return arr

    def _rounded_box(self, geom, block_t, anim, direction):
        """Rounded-rect mask (box variant / pill) with the block's wipe or block ops."""
        rw, rh = self.rect["w"], self.rect["h"]
        img = Image.new("L", (rw, rh), 0)
        x0 = self.rect["blockX"] + geom["x"]
        y0 = self.rect["blockY"] + geom["y"]
        ImageDraw.Draw(img).rounded_rectangle([x0, y0, x0 + geom["w"], y0 + geom["h"]],
                                              radius=max(0, int(round_js(geom["r"]))), fill=255)
        arr = np.asarray(img)
        if anim["unit"] == "block":
            return self._block_ops(arr, anim)
        # Unit presets: the box wipes in/out over the same window as the glyphs.
        arr = self._block_affine(arr, anim)
        if direction != "hold":
            e = EASINGS["easeOutCubic"](block_t)
            bx, f = self.rect["blockX"], self.feather
            span = [geom["x"], geom["x"] + geom["w"]]
            if direction == "in":
                arr = clip_mask_x(arr, 0, bx + span[0] + e * (span[1] - span[0] + f), 0, f)
            else:
                arr = clip_mask_x(arr, bx + span[0] - f + (1 - e) * (span[1] - span[0] + f), self.rect["w"], f, 0)
        if anim["block"]["opacity"] < 1:
            arr = scale_mask(arr, anim["block"]["opacity"])
        return arr

    def _shadow(self, shape, passes, ring_free):
        """Union of blurred, offset copies of `shape`, masked out of the glyphs."""
        if not passes:
            return None
        rw, rh = self.rect["w"], self.rect["h"]
        total = np.zeros((rh, rw), dtype=np.uint8)
        for p in passes:
            arr = shift_mask_2d(shape, int(round_js(p["dx"])), int(round_js(p["dy"])))
            if p["sigma"] > 0.05:
                arr = np.asarray(Image.fromarray(arr).filter(ImageFilter.GaussianBlur(p["sigma"])))
            total = union_mask(total, scale_mask(arr, p["opacity"]))
        return mask_outside(total, ring_free)

    # ── per-frame composite ───────────────────────────────────────────────

    def build_layers(self, frame_idx, region_rgb):
        """Returns the layer dict for `composite_layers` (already cropped to the frame)."""
        lay, style, params = self.layout, self.style, self.params
        anim = anim_state(frame_idx, self.timing, params, self.counts, lay["fontPx"], lay["blockW"], self.scale)
        if anim["phase"] == "hidden":
            return None
        block = anim["block"]
        clip = self.clip
        active_idx = active_word_at(self.words, frame_idx, self.fps)

        def crop(m):
            return None if m is None else crop_mask(m, clip["sx"], clip["sy"], clip["w"], clip["h"])

        # 1. Glyph coverage (the mask everything else is derived from).
        fill = self._block_ops(self._draw_glyphs(anim, active_idx=active_idx), anim)

        # 2. Readability: sample luminance under the glyphs every N frames.
        every = max(1, int(_num(params.get("luminanceEveryN"), 3) or 3))
        if (frame_idx - self.timing["startFrame"]) % every == 0 or self.luma is None:
            self.luma = smooth_luminance(self.luma, masked_luminance(region_rgb, crop(fill)))
        fallback = params.get("lowContrastFallback") or "stroke"
        self.score = low_contrast_score(self.luma) if fallback != "none" else 0.0
        # Stroke / shadow plans use the score in 0.05 steps (matches the preview's
        # hold-phase mask cache); the contrast curve keeps the exact value.
        score_q = _js_round(self.score * 20) / 20.0

        # 3. Stroke ring sits behind the fill (paint-order: stroke fill).
        sp = stroke_plan(style, self.scale, score_q)
        ring = None
        if sp["width"] > 0.05:
            stroke = self._block_ops(self._draw_glyphs(anim, stroke_w=sp["width"], active_idx=active_idx), anim)
            ring = mask_outside(stroke, fill)

        # 4. Variant-specific negative / white masks.
        white = None
        neg = fill
        shape = fill
        if self.variant == "negative-box":
            box = self._rounded_box(box_geometry(lay, "box", style, self.scale), anim["progress"], anim, anim["dir"])
            neg = mask_outside(box, fill)
            shape = box
        elif self.variant == "negative-highlight":
            if active_idx >= 0 and style.get("karaoke", True) is not False:
                neg = self._block_ops(self._draw_glyphs(anim, word_filter=lambda w: w["index"] == active_idx,
                                                        active_idx=active_idx), anim)
                white = self._block_ops(self._draw_glyphs(anim, word_filter=lambda w: w["index"] != active_idx,
                                                          active_idx=active_idx), anim)
            else:
                white, neg = fill, None
        elif self.variant == "negative-sweep":
            band = sweep_band(frame_idx, self.timing, params)
            if band is not None and not band["done"]:
                bx, bw = self.rect["blockX"], lay["blockW"]
                left_px = bx + band["left"] * bw
                right_px = bx + band["right"] * bw
                rw, rh = self.rect["w"], self.rect["h"]
                band_img = Image.new("L", (rw, rh), 0)
                by = self.rect["blockY"]
                ImageDraw.Draw(band_img).rectangle(
                    [left_px, by - 0.12 * lay["fontPx"], right_px, by + lay["blockH"] + 0.12 * lay["fontPx"]], fill=255)
                band_arr = np.asarray(band_img)
                flipped = clip_mask_x(fill, 0, left_px)
                pending = clip_mask_x(fill, right_px, rw)
                neg = max_mask(flipped, mask_outside(band_arr, fill))
                white = pending

        if block["mode"] == "white":
            white, neg = (fill if white is None else max_mask(white, fill)), None
        elif block["mode"] == "flash":
            # Two-frame beat: solid white glyphs with a hot halo.
            halo = np.asarray(Image.fromarray(fill).filter(ImageFilter.GaussianBlur(0.25 * lay["fontPx"])))
            white, neg = max_mask(fill, scale_mask(halo, 0.85)), None

        # 5. Glitch RGB split: R and B channels use shifted copies of the mask.
        neg_r = neg_g = neg_b = neg
        if neg is not None and block["rgbSplit"]:
            neg_r = shift_mask(neg, block["rgbSplit"])
            neg_b = shift_mask(neg, -block["rgbSplit"])

        # 6. Shadow / glow outside the glyph silhouette, pill card behind everything.
        shadow_passes = shadow_plan(style, self.scale, score_q)
        shadow_rgb = parse_rgb(style.get("shadowColor"), (0, 0, 0)) if (style.get("shadowType") or "cinematic") != "none" else [0, 0, 0]
        shadow = self._shadow(shape, shadow_passes, shape)

        pill = None
        pill_rgb = None
        bg = style.get("backgroundColor")
        pill_alpha = parse_alpha(bg)
        if pill_alpha > 0:
            pill = scale_mask(self._rounded_box(box_geometry(lay, "pill", style, self.scale), anim["progress"], anim, anim["dir"]),
                              pill_alpha)
            pill_rgb = parse_rgb(bg, (0, 0, 0))

        return {
            "pill": crop(pill), "pillRGB": pill_rgb,
            "shadow": crop(shadow), "shadowRGB": shadow_rgb,
            "white": crop(white),
            "negR": crop(neg_r), "negG": crop(neg_g), "negB": crop(neg_b),
            "ring": crop(ring), "ringRGB": parse_rgb(style.get("strokeColor"), (0, 0, 0)),
            "contrast": self.score if fallback == "contrast-boost" else 0.0,
            "fill": crop(fill),
        }

    def render(self, frame_bgr, frame_idx):
        if not self.covers(frame_idx):
            return frame_bgr
        c = self.clip
        region = np.ascontiguousarray(frame_bgr[c["y"]:c["y"] + c["h"], c["x"]:c["x"] + c["w"], ::-1])
        layers = self.build_layers(frame_idx, region)
        if layers is None:
            return frame_bgr
        composite_layers(region, layers)
        frame_bgr[c["y"]:c["y"] + c["h"], c["x"]:c["x"] + c["w"]] = region[..., ::-1]
        return frame_bgr


# ───────────────────────────── Export entry point ─────────────────────────────


def render_negative_text_video(video_path, captions, style_config, output_dir, resolution="original"):
    """Burns the Negative Text template into `video_path` frame-by-frame."""
    import cv2
    from services.rendering import resolve_font_path

    cap = cv2.VideoCapture(video_path)
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    font_path = resolve_font_path(style_config.get("fontFamily", "Anton"), style_config.get("fontWeight"),
                                  bool(style_config.get("italic")))

    renderers = []
    for c in captions:
        try:
            r = NegativeCaptionRenderer(c, style_config, width, height, fps, font_path)
            if r.words:
                renderers.append(r)
        except Exception as e:  # one bad caption must not kill the export
            print(f"negative_text: skipping caption {c.get('id')}: {e}")
    renderers.sort(key=lambda r: r.timing["startFrame"])

    job_id = str(uuid.uuid4())[:8]
    res_label = resolution.lower().replace("p", "").strip()
    output_mp4_path = os.path.join(output_dir, f"reelix_export_{job_id}_{res_label}.mp4")
    temp_raw_mp4 = os.path.join(output_dir, f"temp_raw_{job_id}.mp4")

    scale_filter = []
    target_dim = {"720": 720, "480": 480, "360": 360, "240": 240}.get(res_label)
    if target_dim:
        scale_filter = ["-vf", f"scale='if(gt(ih,iw),{target_dim},-2)':'if(gt(ih,iw),-2,{target_dim})':flags=lanczos"]

    proc = subprocess.Popen(
        [get_ffmpeg_bin(), "-y", "-f", "rawvideo", "-vcodec", "rawvideo",
         "-s", f"{width}x{height}", "-pix_fmt", "bgr24", "-r", str(fps), "-i", "-",
         *scale_filter, "-c:v", "libx264", "-preset", "fast", "-crf", "18",
         "-pix_fmt", "yuv420p", temp_raw_mp4],
        stdin=subprocess.PIPE, stderr=subprocess.DEVNULL,
    )

    frame_idx = 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        for r in renderers:
            if r.covers(frame_idx):
                r.render(frame, frame_idx)
        proc.stdin.write(frame.tobytes())
        frame_idx += 1

    cap.release()
    proc.stdin.close()
    proc.wait()

    subprocess.run(
        [get_ffmpeg_bin(), "-y", "-i", temp_raw_mp4, "-i", video_path,
         "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
         "-map", "0:v:0", "-map", "1:a:0?", output_mp4_path],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE,
    )
    if os.path.exists(temp_raw_mp4):
        try:
            os.remove(temp_raw_mp4)
        except OSError:
            pass
    return output_mp4_path
