"""
REELIX — Video Export Rendering Service

Two engines share one style contract with the browser preview:
  * LibASS burn-in for standard templates.
  * A frame-by-frame compositor for `mix-blend-mode: difference`, which FFmpeg's
    ASS renderer cannot express.
"""

import os
import re
import subprocess
import uuid

from PIL import Image, ImageDraw, ImageFont

from services.audio import get_ffmpeg_bin, get_video_info
from services.fonts import read_face, resolve_face

TRANSITION_SECONDS = 0.18
SLIDE_UP_PIXELS = 22.0
# The preview caption box is capped at 85% of the frame width; both export
# engines wrap / fit to the same limit so line breaks land where the editor showed them.
CAPTION_MAX_WIDTH = 0.85
# Families without a real italic face are sheared, like the browser's synthetic
# oblique (Skia skews by exactly 1/4).
ITALIC_SHEAR = 0.25

# Entry transitions, exactly as the preview overlay animates them (VideoPreview.jsx):
# opacity ramps when `fade`, the block rises SLIDE_UP_PIXELS when `slide`, and
# `scale_from` → 1.0 about the block centre for the kinetic pops.
TRANSITIONS = {
    "Fade In + Slide Up": {"fade": True, "slide": True, "scale_from": 1.0, "seconds": 0.18},
    "Slide Up": {"fade": False, "slide": True, "scale_from": 1.0, "seconds": 0.18},
    "Fade In": {"fade": True, "slide": False, "scale_from": 1.0, "seconds": 0.18},
    "Pop Up": {"fade": True, "slide": False, "scale_from": 0.7, "seconds": 0.18},
    "Zoom Kinetic": {"fade": True, "slide": False, "scale_from": 0.6, "seconds": 0.22},
    "None": {"fade": False, "slide": False, "scale_from": 1.0, "seconds": 0.0},
}


def transition_plan(transition):
    """Resolves a `transition` style value into what each engine must animate."""
    plan = dict(TRANSITIONS.get(transition or "Fade In + Slide Up") or TRANSITIONS["None"])
    plan["pops"] = plan["scale_from"] < 1.0
    plan["animates"] = plan["fade"] or plan["slide"] or plan["pops"]
    return plan


def entry_motion_tags(plan, pos_x, pos_y, slide_start_y, flip_tag, first_segment):
    r"""
    ASS override tags positioning a caption line and, on the caption's first
    karaoke segment, playing its entry transition: \fad for the fade, \move
    for the rise and an \fscx/\fscy \t() ramp for the kinetic pops.
    """
    # \q2: never wrap — lines are fitted to the caption box up front (fit_shrink),
    # exactly like the preview's nowrap rows.
    if not first_segment or not plan["animates"]:
        return f"\\an5\\q2\\pos({pos_x},{pos_y}){flip_tag}"
    ms = int(round(plan["seconds"] * 1000))
    tag = "\\an5\\q2"
    if plan["slide"]:
        tag += f"\\move({pos_x},{slide_start_y},{pos_x},{pos_y},0,{ms})"
    else:
        tag += f"\\pos({pos_x},{pos_y})"
    if plan["fade"]:
        tag += f"\\fad({ms},0)"
    if plan["pops"]:
        start = int(round(plan["scale_from"] * 100))
        tag += f"\\fscx{start}\\fscy{start}\\t(0,{ms},\\fscx100\\fscy100)"
    return tag + flip_tag


def scale_ramp_tags(plan, target_pct, first_segment):
    r"""
    \fscx/\fscy tags for a word run whose resting scale is `target_pct`. While
    a pop plays, the run starts at scale_from × target and ramps up with the
    block so the karaoke pop and the entry pop compose instead of fighting.
    """
    if first_segment and plan["pops"]:
        ms = int(round(plan["seconds"] * 1000))
        start = int(round(plan["scale_from"] * target_pct))
        return f"\\fscx{start}\\fscy{start}\\t(0,{ms},\\fscx{target_pct}\\fscy{target_pct})"
    if target_pct == 100:
        return "\\fscx100\\fscy100"
    return f"\\fscx{target_pct}\\fscy{target_pct}"


def _ttf_info(path: str) -> dict:
    """Face metrics for LibASS sizing (kept for callers of the old helper)."""
    return read_face(path)


def style_face(style: dict, family_key: str = "fontFamily") -> dict:
    """The font file a style renders with: family + fontWeight + italic → face."""
    return resolve_face(style.get(family_key) or "Montserrat", style.get("fontWeight"), bool(style.get("italic")))


def resolve_font_path(font_name: str, weight=None, italic=False) -> str:
    """Path of the best matching file in backend/fonts (nearest weight, real italic if any)."""
    return resolve_face(font_name, weight, italic)["path"]


def get_ass_font_name(font_name: str, weight=None, italic=False) -> str:
    """The family name LibASS matches for this face (name ID 1, e.g. 'Poppins Black')."""
    return resolve_face(font_name, weight, italic)["ass_family"]


def hex_to_ass_color(hex_str: str, alpha: str = "00") -> str:
    """Converts CSS hex color (#RRGGBB) to ASS color format &HAABBGGRR."""
    hex_clean = (hex_str or "").lstrip("#")
    if len(hex_clean) == 6:
        r, g, b = hex_clean[0:2], hex_clean[2:4], hex_clean[4:6]
    else:
        r, g, b = "FF", "FF", "FF"
    return f"&H{alpha}{b}{g}{r}"


def hex_to_rgb(hex_str: str, default=(255, 255, 255)):
    """Parses '#RRGGBB' / 'rgba(r,g,b,a)' into an (R, G, B) tuple."""
    if not isinstance(hex_str, str):
        return default
    s = hex_str.strip()
    if s.startswith("rgb"):
        nums = re.findall(r"[\d.]+", s)
        if len(nums) >= 3:
            return tuple(max(0, min(255, int(float(n)))) for n in nums[:3])
        return default
    s = s.lstrip("#")
    if len(s) == 3:
        s = "".join(ch * 2 for ch in s)
    if len(s) != 6:
        return default
    try:
        return (int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16))
    except ValueError:
        return default


# ─────────────────────────── Shared text shaping ───────────────────────────

def transform_text(text: str, mode: str) -> str:
    """Mirrors the CSS `text-transform` applied in the browser preview."""
    t = text or ""
    if mode == "lowercase":
        return t.lower()
    if mode == "capitalize":
        return t.title()
    if mode == "none":
        return t
    return t.upper()


def caption_words(caption: dict, style: dict) -> list:
    """
    Returns the caption's words as [{text, start, end}], preferring Whisper word
    timings so the export highlights the same word the preview does.
    """
    transform = style.get("textTransform", "uppercase")
    raw_words = caption.get("words")
    out = []

    if isinstance(raw_words, list) and raw_words:
        for w in raw_words:
            if isinstance(w, dict):
                text = (w.get("word") or w.get("text") or "").strip()
                start, end = w.get("start"), w.get("end")
            else:
                text, start, end = str(w).strip(), None, None
            if text:
                out.append({"text": transform_text(text, transform), "start": start, "end": end})

    if not out:
        source = (caption.get("translated_text") or caption.get("source_text") or "").strip()
        out = [{"text": transform_text(w, transform), "start": None, "end": None}
               for w in source.split() if w]
    return out


def wrap_into_lines(words: list, max_per_line) -> list:
    """Chunks words into fixed-width rows, matching groupWordsIntoLines() in the UI."""
    try:
        per = max(1, int(max_per_line))
    except (TypeError, ValueError):
        per = 3
    return [words[i:i + per] for i in range(0, len(words), per)] or [[]]


def fit_shrink(words, style, font, em_px, limit_px) -> float:
    """
    Shrink factor (≤ 1) that fits the widest caption line inside `limit_px`.
    Mirrors fitFontSize() in captionStyle.js: word widths from the font, a
    0.26em gap between words, letter-spacing after every character.
    """
    # letterSpacing is a design px value; em_px / fontSize is the design → video px scale.
    spacing = float(style.get("letterSpacing", 0) or 0) * (em_px / max(1.0, float(style.get("fontSize", 32) or 32)))
    draw = ImageDraw.Draw(Image.new("L", (1, 1)))
    widest = 0.0
    for line in wrap_into_lines(words, style.get("maxWordsPerLine", 3)):
        width = sum(draw.textlength(w["text"], font=font) + spacing * len(w["text"]) for w in line)
        width += 0.26 * em_px * max(0, len(line) - 1)
        widest = max(widest, width)
    if widest <= limit_px or widest <= 0:
        return 1.0
    return max(0.2, limit_px / widest)


def is_keyword(word_text: str, keywords) -> bool:
    """Word-boundary safe keyword match (so 'IT' never matches inside 'WITH')."""
    if not keywords:
        return False
    clean = re.sub(r"[^\w]", "", word_text).lower()
    if not clean:
        return False
    return any(isinstance(k, str) and re.sub(r"[^\w]", "", k).lower() == clean for k in keywords)


def highlight_segments(caption: dict, words: list, style: dict, fps: float) -> list:
    """
    Splits a caption into render segments — one per highlight state.

    With karaoke on and word timings present this yields a segment per spoken
    word, so the burned-in video tracks the voice exactly like the preview.
    """
    start_f = int(round(float(caption.get("start", 0.0)) * fps))
    end_f = int(round(float(caption.get("end", 0.0)) * fps))
    if end_f <= start_f:
        end_f = start_f + 1

    timed = [
        i for i, w in enumerate(words)
        if isinstance(w.get("start"), (int, float)) and isinstance(w.get("end"), (int, float))
    ]
    if not style.get("karaoke", True) or not timed:
        return [{"start_frame": start_f, "end_frame": end_f, "active": -1}]

    segments = []
    cursor = start_f
    for i in timed:
        w_start = max(start_f, int(round(float(words[i]["start"]) * fps)))
        w_end = min(end_f, int(round(float(words[i]["end"]) * fps)))
        if w_end <= w_start:
            continue
        if w_start > cursor:
            segments.append({"start_frame": cursor, "end_frame": w_start, "active": -1})
        segments.append({"start_frame": w_start, "end_frame": w_end, "active": i})
        cursor = w_end
    if cursor < end_f:
        segments.append({"start_frame": cursor, "end_frame": end_f, "active": -1})

    return segments or [{"start_frame": start_f, "end_frame": end_f, "active": -1}]


# ───────────────────── Difference-blend pixel compositor ─────────────────────

SUPERSAMPLE = 2


def _run_width(draw, text, font, spacing):
    if spacing <= 0:
        return draw.textlength(text, font=font)
    return sum(draw.textlength(ch, font=font) for ch in text) + spacing * len(text)


def _draw_run(draw, x, baseline, text, font, spacing, fill, stroke_width=0, stroke_fill=None):
    """Draws a text run on the baseline, expanding per-character when letter-spaced."""
    kw = {"font": font, "fill": fill, "anchor": "ls"}
    if stroke_width > 0:
        kw["stroke_width"] = stroke_width
        kw["stroke_fill"] = stroke_fill
    if spacing <= 0:
        draw.text((x, baseline), text, **kw)
        return
    cx = x
    for ch in text:
        draw.text((cx, baseline), ch, **kw)
        cx += draw.textlength(ch, font=font) + spacing


def _build_caption_layer(words, active_idx, keywords, style, font, scale, max_width=None):
    """
    Rasterises one caption state into a tight RGBA tile.

    Returns (rgb uint8, alpha float32, width, height) where `rgb` is the true
    (un-premultiplied) source colour of each pixel and `alpha` its coverage —
    exactly the two terms CSS needs for `difference` compositing.
    """
    from PIL import Image, ImageDraw, ImageFilter
    import numpy as np

    S = SUPERSAMPLE
    spacing = float(style.get("letterSpacing", 0) or 0) * scale * S
    line_height_mult = float(style.get("lineHeight", 1.05) or 1.05)
    stroke_w = int(round(float(style.get("strokeWidth", 0) or 0) * scale * 0.5 * S))
    highlight_mode = style.get("highlightMode", "color")
    use_karaoke = style.get("karaoke", True)

    fill_rgb = hex_to_rgb(style.get("color", "#ffffff"))
    stroke_rgb = hex_to_rgb(style.get("strokeColor", "#000000"), (0, 0, 0))
    hi_rgb = hex_to_rgb(style.get("highlightColor", "#facc15"), (250, 204, 21))
    box_rgb = hex_to_rgb(style.get("highlightBg", "#facc15"), (250, 204, 21))
    box_text_rgb = hex_to_rgb(style.get("highlightTextColor", "#0b0b0b"), (11, 11, 11))

    lines = wrap_into_lines(words, style.get("maxWordsPerLine", 3))
    per = max(1, int(style.get("maxWordsPerLine", 3) or 3))

    scratch = ImageDraw.Draw(Image.new("L", (1, 1)))
    ascent, descent = font.getmetrics()
    # CSS line box: lineHeight multiplies the em square, and the leftover leading
    # is split above and below the font's own ascent/descent.
    line_step = line_height_mult * font.size
    half_leading = (line_step - (ascent + descent)) / 2.0
    space_w = scratch.textlength(" ", font=font) + spacing

    # A font pairing gives the emphasised word a second family. CSS keeps mixed
    # families on the primary font's baseline, so only the glyphs change here —
    # never the baseline grid.
    accent_font = font
    accent_name = style.get("accentFontFamily")
    if accent_name and accent_name != style.get("fontFamily"):
        accent_font = ImageFont.truetype(resolve_font_path(accent_name, style.get("fontWeight")), font.size)

    active_scale = float(style.get("activeScale", 1.14) or 1.0) if use_karaoke else 1.0

    # Emphasis picks the colour AND the family, so resolve it before measuring.
    marks = []
    for li, line in enumerate(lines):
        row = []
        for wi, word in enumerate(line):
            is_active = use_karaoke and (li * per + wi) == active_idx
            emphasised = is_active or is_keyword(word["text"], keywords)
            row.append({
                "text": word["text"],
                "active": is_active,
                "emphasised": emphasised,
                "base_font": accent_font if emphasised else font,
            })
        marks.append(row)

    measured = []
    for row in marks:
        widths = [_run_width(scratch, m["text"], m["base_font"], spacing) for m in row]
        measured.append({"widths": widths, "total": sum(widths) + space_w * max(0, len(row) - 1)})

    block_w = max([m["total"] for m in measured] or [1])

    # Shrink-to-fit: a line wider than the caption box (85% of the frame) scales
    # the whole tile down instead of running off the edge of the video.
    if max_width and block_w > max_width:
        shrink = max_width / block_w
        smaller = font.font_variant(size=max(8, int(round(font.size * shrink))))
        if smaller.size < font.size:
            fitted = {**style, "letterSpacing": float(style.get("letterSpacing", 0) or 0) * shrink}
            return _build_caption_layer(words, active_idx, keywords, fitted, smaller, scale, None)
    block_h = line_step * len(lines)

    # Padding absorbs stroke, the highlight box and any active-word upscale.
    grow = max(active_scale, 1.0)
    pad = int(round(stroke_w * 2 + line_step * 0.35 * grow + 8 * S))
    if style.get("italic"):
        pad += int(round(ITALIC_SHEAR * block_h))
    # Keep the canvas a clean multiple of S so the downscale is an exact box average.
    canvas_w = int(round(block_w + pad * 2)) // S * S + S
    canvas_h = int(round(block_h + pad * 2)) // S * S + S

    layer = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)

    # Resolve every word's paint before drawing so stroke/fill order is global.
    placements = []
    for li, row in enumerate(marks):
        baseline = pad + li * line_step + half_leading + ascent
        centre_y = pad + (li + 0.5) * line_step
        align = style.get("textAlign", "center")
        if align == "left":
            x = pad
        elif align == "right":
            x = pad + (block_w - measured[li]["total"])
        else:
            x = pad + (block_w - measured[li]["total"]) / 2.0
        for wi, m in enumerate(row):
            width = measured[li]["widths"][wi]

            if m["emphasised"] and highlight_mode == "box":
                colour, boxed = box_text_rgb, True
            elif m["emphasised"] and highlight_mode != "none":
                colour, boxed = hi_rgb, False
            else:
                colour, boxed = fill_rgb, False

            placements.append({
                "x": x, "baseline": baseline, "centre_y": centre_y, "text": m["text"],
                "width": width, "colour": colour, "boxed": boxed,
                "base_font": m["base_font"],
                "scale": active_scale if m["active"] else 1.0,
            })
            x += width + space_w

    # CSS `transform: scale()` grows the word about its own centre without moving
    # its neighbours, so the popped word is re-measured but the layout is not.
    for p in placements:
        k = p["scale"]
        base = p["base_font"]
        if k == 1.0:
            p.update(font=base, spacing=spacing, stroke=stroke_w,
                     ascent=ascent, descent=descent, draw_x=p["x"], draw_baseline=p["baseline"])
            continue
        big = base.font_variant(size=max(1, int(round(base.size * k))))
        big_asc, big_desc = ascent * k, descent * k
        big_spacing = spacing * k
        big_w = _run_width(scratch, p["text"], big, big_spacing)
        p.update(font=big, spacing=big_spacing, stroke=int(round(stroke_w * k)),
                 ascent=big_asc, descent=big_desc,
                 draw_x=p["x"] + (p["width"] - big_w) / 2.0,
                 draw_baseline=p["centre_y"] + k * (p["baseline"] - p["centre_y"]),
                 width=big_w)

    # Pass 1 — highlight boxes sit furthest back.
    box_radius = max(0, int(round(float(style.get("bgRadius", 8) or 0) * scale * S)))
    for p in placements:
        if not p["boxed"]:
            continue
        px = line_step * 0.12 * p["scale"]
        rect = [p["draw_x"] - px, p["draw_baseline"] - p["ascent"] - px * 0.55,
                p["draw_x"] + p["width"] + px, p["draw_baseline"] + p["descent"] + px * 0.35]
        draw.rounded_rectangle(rect, radius=int(round(box_radius * p["scale"])), fill=box_rgb + (255,))

    # Pass 1.5 — glow halo if shadowType == 'glow'
    if style.get("shadowType") == "glow":
        glow_col = hex_to_rgb(style.get("shadowColor") or style.get("highlightColor") or "#ffd700")
        glow_blur_px = int(round(float(style.get("shadowBlur", 18) or 18) * scale * S * 0.45))
        if glow_blur_px > 1:
            glow_layer = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
            glow_draw = ImageDraw.Draw(glow_layer)
            for p in placements:
                _draw_run(glow_draw, p["draw_x"], p["draw_baseline"], p["text"], p["font"], p["spacing"],
                          fill=glow_col + (255,), stroke_width=max(4, p["stroke"] + 6), stroke_fill=glow_col + (255,))
            glow_layer = glow_layer.filter(ImageFilter.GaussianBlur(glow_blur_px))
            layer = Image.alpha_composite(glow_layer, layer)
            draw = ImageDraw.Draw(layer)

    # Pass 2 — stroke silhouettes, then pass 3 fills, matching `paint-order: stroke fill`.
    if stroke_w > 0:
        for p in placements:
            if p["boxed"] or p["stroke"] <= 0:
                continue
            _draw_run(draw, p["draw_x"], p["draw_baseline"], p["text"], p["font"], p["spacing"],
                      fill=stroke_rgb + (255,), stroke_width=p["stroke"], stroke_fill=stroke_rgb + (255,))
    for p in placements:
        _draw_run(draw, p["draw_x"], p["draw_baseline"], p["text"], p["font"], p["spacing"],
                  fill=p["colour"] + (255,))

    if style.get("italic"):
        # Inverse affine: sample x shifts left with height, tilting the top right.
        layer = layer.transform(
            (canvas_w, canvas_h), Image.AFFINE,
            (1, ITALIC_SHEAR, -ITALIC_SHEAR * canvas_h, 0, 1, 0),
            resample=Image.BICUBIC,
        )

    if style.get("flipH"):
        layer = layer.transpose(Image.FLIP_LEFT_RIGHT)

    # BOX over an integer supersample is an exact pixel average — unlike LANCZOS it
    # cannot overshoot, which would distort colours once alpha is divided back out.
    layer = layer.resize((canvas_w // S, canvas_h // S), Image.BOX)

    arr = np.asarray(layer).astype(np.float32)
    alpha = arr[:, :, 3] / 255.0
    # PIL composites glyphs onto transparent black, leaving colour premultiplied
    # by coverage; undo that to recover the true source colour CSS blends with.
    safe = np.maximum(alpha, 1e-6)[:, :, None]
    rgb = np.clip(arr[:, :, :3] / safe, 0, 255).astype(np.uint8)
    return rgb, alpha.astype(np.float32), layer.width, layer.height


def composite_difference(frame, rgb, alpha, x0, y0, opacity=1.0):
    """
    Applies one caption tile to a BGR frame exactly as CSS would:
        out = frame * (1 - a) + |frame - src| * a

    `frame` is modified in place; the tile is clipped to the frame bounds.
    """
    import numpy as np

    th, tw = alpha.shape
    fh, fw = frame.shape[:2]
    x0, y0 = int(x0), int(y0)

    sx, sy = max(0, -x0), max(0, -y0)
    dx, dy = max(0, x0), max(0, y0)
    w = min(tw - sx, fw - dx)
    h = min(th - sy, fh - dy)
    if w <= 0 or h <= 0 or opacity <= 0.001:
        return frame

    a = (alpha[sy:sy + h, sx:sx + w, None] * opacity).astype(np.float32)
    # cv2 frames are BGR; flip the tile's RGB to match.
    src = rgb[sy:sy + h, sx:sx + w, ::-1].astype(np.float32)
    region = frame[dy:dy + h, dx:dx + w].astype(np.float32)
    frame[dy:dy + h, dx:dx + w] = np.rint(
        region * (1.0 - a) + np.abs(region - src) * a
    ).astype(np.uint8)
    return frame


def render_difference_blend_video(
    video_path: str,
    captions: list,
    style_config: dict,
    output_dir: str,
    resolution: str = "original",
) -> str:
    """
    Renders `mix-blend-mode: difference` captions by compositing each frame as
    the browser would: out = frame*(1-a) + |frame - src|*a.
    """
    import cv2
    import numpy as np
    from PIL import ImageFont

    cap = cv2.VideoCapture(video_path)
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0

    scale = (height / 520.0) if height >= width else (width / 640.0)
    font_px = max(12, int(round(float(style_config.get("fontSize", 32)) * scale)))
    face = style_face(style_config)
    font = ImageFont.truetype(face["path"], font_px * SUPERSAMPLE)
    # A real italic face needs no shear; the tile builder shears only synthetic italics.
    style_config = {**style_config, "italic": face["synth_italic"]}

    pos_x = int(round(width * float(style_config.get("xPercent", 50)) / 100.0))
    pos_y = int(round(height * float(style_config.get("yPercent", 82)) / 100.0))

    plan = transition_plan(style_config.get("transition", "Fade In + Slide Up"))
    trans_frames = max(1, int(round(fps * plan["seconds"])))
    slide_px = SLIDE_UP_PIXELS * (height / 1920.0) if height >= width else SLIDE_UP_PIXELS

    # Build the segment timeline up front; rasterise each tile on first use.
    timeline = []
    for c_idx, c in enumerate(captions):
        words = caption_words(c, style_config)
        if not words:
            continue
        keywords = c.get("keywords") or []
        cap_start = int(round(float(c.get("start", 0.0)) * fps))
        for seg in highlight_segments(c, words, style_config, fps):
            timeline.append({**seg, "caption_start": cap_start, "words": words,
                             "keywords": keywords, "key": (c_idx, seg["active"])})

    tile_cache = {}

    def get_tile(seg):
        key = seg["key"]
        if key not in tile_cache:
            if len(tile_cache) > 6:
                tile_cache.clear()
            tile_cache[key] = _build_caption_layer(
                seg["words"], seg["active"], seg["keywords"], style_config, font, scale,
                max_width=width * CAPTION_MAX_WIDTH * SUPERSAMPLE,
            )
        return tile_cache[key]

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

        seg = next((s for s in timeline if s["start_frame"] <= frame_idx < s["end_frame"]), None)
        if seg is not None:
            rgb, alpha, tw, th = get_tile(seg)

            entry = frame_idx - seg["caption_start"]
            progress = 1.0 if not plan["animates"] else min(1.0, max(0.0, entry / float(trans_frames)))
            opacity = progress if plan["fade"] else 1.0
            offset_y = int(round((1.0 - progress) * slide_px)) if plan["slide"] else 0

            # Kinetic pops scale the whole tile about its centre, like CSS transform: scale().
            if plan["pops"] and progress < 1.0:
                k = plan["scale_from"] + (1.0 - plan["scale_from"]) * progress
                sw, sh = max(1, int(round(tw * k))), max(1, int(round(th * k)))
                rgb = cv2.resize(rgb, (sw, sh), interpolation=cv2.INTER_AREA)
                alpha = cv2.resize(alpha, (sw, sh), interpolation=cv2.INTER_AREA)
                tw, th = sw, sh

            composite_difference(frame, rgb, alpha,
                                 pos_x - tw // 2, pos_y - th // 2 + offset_y, opacity)

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


# ──────────────────────────── LibASS burn-in path ────────────────────────────

def _sec_to_ass_time(s: float) -> str:
    h = int(s // 3600)
    m = int((s % 3600) // 60)
    sec = int(s % 60)
    cs = min(99, int(round((s - int(s)) * 100)))
    return f"{h}:{m:02d}:{sec:02d}.{cs:02d}"


def render_captioned_video(
    video_path: str,
    captions: list,
    style_config: dict,
    output_dir: str,
    resolution: str = "original",
) -> str:
    """
    Renders video with burned-in captions. The Negative Text renderer and
    difference blending route to the pixel compositors; everything else burns
    in through LibASS.
    """
    if style_config.get("renderer") == "negative":
        from services.negative_text import render_negative_text_video
        return render_negative_text_video(
            video_path=video_path, captions=captions, style_config=style_config,
            output_dir=output_dir, resolution=resolution,
        )

    if style_config.get("mixBlendMode") == "difference":
        try:
            return render_difference_blend_video(
                video_path=video_path, captions=captions, style_config=style_config,
                output_dir=output_dir, resolution=resolution,
            )
        except Exception as e:
            print(f"Difference renderer fallback to ASS due to error: {e}")

    v_info = get_video_info(video_path)
    vid_w = int(v_info.get("width", 1080))
    vid_h = int(v_info.get("height", 1920))
    scale = (vid_h / 520.0) if vid_h >= vid_w else (vid_w / 640.0)

    face = style_face(style_config)
    font_path = face["path"]
    ass_font_name = face["ass_family"]
    # Bold / Italic come from the face itself: asking LibASS for Bold on a face
    # that is not flagged bold makes it embolden the outlines (+9–15% ink on
    # Anton / Bebas Neue), which the browser never does.
    ass_bold = -1 if face["bold"] else 0
    ass_italic = -1 if face["italic"] else 0
    em_px = float(style_config.get("fontSize", 32)) * scale
    ass_font_size = max(12, int(round(em_px * face["size_ratio"])))

    text_color = hex_to_ass_color(style_config.get("color", "#FFFFFF"))
    highlight_color = hex_to_ass_color(style_config.get("highlightColor", "#facc15"))
    stroke_color = hex_to_ass_color(style_config.get("strokeColor", "#000000"))
    box_color = hex_to_ass_color(style_config.get("highlightBg", "#facc15"))
    box_text_color = hex_to_ass_color(style_config.get("highlightTextColor", "#0b0b0b"))

    position = style_config.get("position", "bottom")
    x_pct = float(style_config.get("xPercent", 50))
    y_pct = float(style_config.get("yPercent", 15 if position == "top" else 50 if position == "center" else 82))
    pos_x = int(round(vid_w * x_pct / 100.0))
    pos_y = int(round(vid_h * y_pct / 100.0))

    # \an5 centres LibASS's win-metric line box; the browser centres the CSS one.
    # Both average their baselines at (ascent - descent)/2, so align on that.
    _finfo = _ttf_info(font_path)
    _pil = ImageFont.truetype(font_path, max(1, int(round(em_px))))
    _asc, _desc = _pil.getmetrics()
    _win_span = (_finfo["win_asc"] - _finfo["win_desc"]) * em_px / _finfo["upem"]
    pos_y += int(round((_asc - _desc) / 2.0 - _win_span / 2.0))

    shadow_type = style_config.get("shadowType", "cinematic")
    is_glow = shadow_type == "glow"
    # A "cinematic" shadow is a *blurred* drop shadow in the preview. LibASS's
    # \shad is always crisp, so it is drawn as two blurred text layers under the
    # crisp text instead — the same two-pass drop-shadow buildShadowFilter() uses.
    is_soft = shadow_type == "cinematic" and float(style_config.get("shadowBlur", 14) or 0) > 0 \
        and float(style_config.get("shadowOpacity", 0.9) or 0) > 0

    ass_stroke = max(0, int(round(float(style_config.get("strokeWidth", 3.5)) * scale * 0.9)))
    if is_glow or is_soft or shadow_type == "none":
        ass_shadow = 0
    else:
        ass_shadow = max(0, int(round(float(style_config.get("shadowDistance", 4)) * scale * 0.8)))
    spacing = round(float(style_config.get("letterSpacing", 0) or 0) * scale, 1)
    italic_tag = f"\\fax{ITALIC_SHEAR}" if face["synth_italic"] else ""

    use_card = style_config.get("borderStyle") == 3 and \
        style_config.get("backgroundColor") not in (None, "", "transparent")
    border_style = 3 if use_card else 1
    if use_card:
        back_colour = hex_to_ass_color(style_config.get("backgroundColor", "#000000"), alpha="10")
        outline = max(ass_stroke, int(round(float(style_config.get("bgPadding", 10) or 10) * scale * 0.5)))
    else:
        back_colour = hex_to_ass_color(style_config.get("shadowColor", "#000000"), alpha="20")
        outline = ass_stroke

    # Margins leave exactly the preview's 85% caption box for wrapping.
    margin_lr = int(round(vid_w * (1.0 - CAPTION_MAX_WIDTH) / 2.0))

    style_fmt = ("Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, "
                 "BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, "
                 "BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding")

    ass_styles = [
        f"Style: Default,{ass_font_name},{ass_font_size},{text_color},&H000000FF,{stroke_color},"
        f"{back_colour},{ass_bold},{ass_italic},0,0,100,100,{spacing},0,{border_style},{outline},{ass_shadow},5,{margin_lr},{margin_lr},40,1",
        # Opaque-box style used to paint the karaoke highlight behind a single word.
        f"Style: HiBox,{ass_font_name},{ass_font_size},{box_text_color},&H000000FF,{box_color},"
        f"{box_color},{ass_bold},{ass_italic},0,0,100,100,{spacing},0,3,{max(2, int(round(4 * scale)))},0,5,{margin_lr},{margin_lr},40,1",
    ]

    soft_passes = []
    if is_soft:
        sh_color = hex_to_ass_color(style_config.get("shadowColor") or "#000000", alpha="00")
        sh_blur = float(style_config.get("shadowBlur", 14) or 14) * scale * 0.5   # CSS blur radius → sigma
        sh_dist = float(style_config.get("shadowDistance", 4) or 0) * scale
        sh_opacity = float(style_config.get("shadowOpacity", 0.9) or 0.9)
        for dy, blur, opacity in ((sh_dist, sh_blur, sh_opacity), (sh_dist * 1.5, sh_blur * 1.6, sh_opacity * 0.6)):
            alpha_hex = f"{max(0, min(255, int(round((1.0 - min(1.0, opacity)) * 255)))):02X}"
            soft_passes.append({"dy": int(round(dy)), "blur": round(max(0.5, blur), 1), "alpha": alpha_hex})
        # Shadow glyphs carry the same outline as the text so the silhouette matches.
        ass_styles.append(
            f"Style: ShadowSoft,{ass_font_name},{ass_font_size},{sh_color},&H000000FF,{sh_color},"
            f"&H00000000,{ass_bold},{ass_italic},0,0,100,100,{spacing},0,1,{ass_stroke},0,5,{margin_lr},{margin_lr},40,1"
        )

    if is_glow:
        glow_color_hex = style_config.get("shadowColor") or style_config.get("highlightColor") or "#ffd700"
        glow_ass_color = hex_to_ass_color(glow_color_hex, alpha="00")
        shadow_blur = float(style_config.get("shadowBlur", 20) or 20)
        shadow_opacity = float(style_config.get("shadowOpacity", 0.8) or 0.8)
        scaled_blur = shadow_blur * scale
        bord_outer = max(4, int(round(scaled_blur * 0.45)))
        bord_inner = max(2, int(round(scaled_blur * 0.23)))
        blur_outer = max(6, int(round(scaled_blur * 0.90)))
        blur_inner = max(3, int(round(scaled_blur * 0.48)))
        inner_alpha_hex = f"{max(0, min(240, int(round((1.0 - min(0.95, shadow_opacity)) * 255)))):02X}"
        outer_alpha_hex = f"{max(0, min(240, int(round((1.0 - min(0.85, shadow_opacity * 0.65)) * 255)))):02X}"

        ass_styles.extend([
            f"Style: GlowOuter,{ass_font_name},{ass_font_size},{glow_ass_color},&H000000FF,{glow_ass_color},"
            f"&H00000000,{ass_bold},{ass_italic},0,0,100,100,{spacing},0,1,{bord_outer},0,5,{margin_lr},{margin_lr},40,1",
            f"Style: GlowInner,{ass_font_name},{ass_font_size},{glow_ass_color},&H000000FF,{glow_ass_color},"
            f"&H00000000,{ass_bold},{ass_italic},0,0,100,100,{spacing},0,1,{bord_inner},0,5,{margin_lr},{margin_lr},40,1",
        ])

    ass_lines = [
        "[Script Info]", "ScriptType: v4.00+",
        f"PlayResX: {vid_w}", f"PlayResY: {vid_h}",
        "ScaledBorderAndShadow: yes", "WrapStyle: 1", "",
        "[V4+ Styles]", style_fmt,
        *ass_styles,
        "", "[Events]",
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ]

    highlight_mode = style_config.get("highlightMode", "color")
    flip_tag = ("\\fry180" if style_config.get("flipH") else "") + italic_tag
    plan = transition_plan(style_config.get("transition", "Fade In + Slide Up"))
    slide_start_y = pos_y + max(10, int(round(SLIDE_UP_PIXELS * (vid_h / 1920.0))))

    active_pct = int(round(float(style_config.get("activeScale", 1.14) or 1.0) * 100))

    # Font pairing: the emphasised word switches family mid-line. Each family needs
    # its own \\fs because the CSS-pixel to ASS-Fontsize ratio is per-font.
    accent_family = style_config.get("accentFontFamily")
    accent_face = None
    if accent_family and accent_family != style_config.get("fontFamily"):
        accent_face = resolve_face(accent_family, style_config.get("fontWeight"), bool(style_config.get("italic")))
    fit_limit = vid_w * CAPTION_MAX_WIDTH

    def caption_font_tags(shrink):
        """
        Per-caption font tags: (\\fs override for a shrunk caption, accent-on, accent-off).
        A caption wider than the 85% box is scaled down as one unit, so the
        pairing font shrinks by the same factor.
        """
        size = max(12, int(round(ass_font_size * shrink)))
        # The fitted caption scales as a whole: font size AND letter spacing.
        fs_tag = f"\\fs{size}\\fsp{round(spacing * shrink, 1)}" if size != ass_font_size else ""
        if accent_face is None:
            return fs_tag, "", f"\\fs{size}" if fs_tag else ""
        accent_size = max(12, int(round(em_px * shrink * accent_face["size_ratio"])))
        # Each face carries its own bold flag; \\b switches LibASS between them without emboldening.
        on = f"\\fn{accent_face['ass_family']}\\fs{accent_size}\\b{1 if accent_face['bold'] else 0}"
        off = f"\\fn{ass_font_name}\\fs{size}\\b{1 if face['bold'] else 0}"
        return fs_tag, on, off

    def emphasis_tags(active, first_segment=False, fonts=("", "", "")):
        """Override tags for an emphasised word, and the tags restoring the base run."""
        fs_tag, accent_on, accent_off = fonts
        on, off = [], []
        if accent_on:
            on.append(accent_on)
            off.append(accent_off)
        elif fs_tag and highlight_mode == "box":
            # \r resets the font size; a shrunk caption must re-apply it.
            on.append(fs_tag)
            off.append(fs_tag)
        if active and active_pct != 100:
            on.append(scale_ramp_tags(plan, active_pct, first_segment))
            off.append(scale_ramp_tags(plan, 100, first_segment))

        if highlight_mode == "box":
            # \r swaps styles wholesale, so the pairing font is re-applied after it.
            return "{\\rHiBox" + "".join(on) + "}", "{\\rDefault" + "".join(off) + "}"
        if highlight_mode == "underline":
            on.append(f"\\c{highlight_color}\\u1")
            off.append(f"\\c{text_color}\\u0")
        elif highlight_mode != "none":
            on.append(f"\\c{highlight_color}")
            off.append(f"\\c{text_color}")

        if not on:
            return "", ""
        return "{" + "".join(on) + "}", "{" + "".join(off) + "}"

    fps_hint = float(v_info.get("fps", 30) or 30)

    for c in captions:
        words = caption_words(c, style_config)
        if not words:
            continue
        keywords = c.get("keywords") or []
        per_line = max(1, int(style_config.get("maxWordsPerLine", 3) or 3))
        segments = highlight_segments(c, words, style_config, fps_hint)
        fonts = caption_font_tags(fit_shrink(words, style_config, _pil, em_px, fit_limit))
        fs_tag, accent_on, accent_off = fonts

        for seg_idx, seg in enumerate(segments):
            t_start = _sec_to_ass_time(seg["start_frame"] / fps_hint)
            t_end = _sec_to_ass_time(seg["end_frame"] / fps_hint)

            rendered_lines = []
            glow_lines = []
            for li, line in enumerate(wrap_into_lines(words, per_line)):
                parts = []
                glow_parts = []
                for wi, word in enumerate(line):
                    text = word["text"]
                    active = style_config.get("karaoke", True) and li * per_line + wi == seg["active"]
                    if active or is_keyword(text, keywords):
                        open_tag, close_tag = emphasis_tags(active, seg_idx == 0, fonts)
                        parts.append(f"{open_tag}{text}{close_tag}")
                    else:
                        parts.append(text)

                    if is_glow or is_soft:
                        g_open, g_close = [], []
                        if accent_on:
                            g_open.append(accent_on)
                            g_close.append(accent_off)
                        if active and active_pct != 100:
                            g_open.append(scale_ramp_tags(plan, active_pct, seg_idx == 0))
                            g_close.append(scale_ramp_tags(plan, 100, seg_idx == 0))
                        if g_open:
                            glow_parts.append(f"{{{ ''.join(g_open) }}}{text}{{{ ''.join(g_close) }}}")
                        else:
                            glow_parts.append(text)

                rendered_lines.append(" ".join(parts))
                if is_glow or is_soft:
                    glow_lines.append(" ".join(glow_parts))

            body = "\\N".join(rendered_lines)
            glow_body = "\\N".join(glow_lines) if (is_glow or is_soft) else ""

            # The entry animation belongs to the caption, not each karaoke step.
            motion_tag = entry_motion_tags(plan, pos_x, pos_y, slide_start_y, flip_tag, seg_idx == 0) + fs_tag

            if is_soft:
                # Blurred shadow copies first (lower layers), offset straight down like drop-shadow(0 dist blur).
                for layer, sp in enumerate(soft_passes):
                    sh_motion = entry_motion_tags(plan, pos_x, pos_y + sp["dy"], slide_start_y + sp["dy"], flip_tag, seg_idx == 0) + fs_tag
                    ass_lines.append(
                        f"Dialogue: {layer},{t_start},{t_end},ShadowSoft,,0,0,0,,"
                        f"{{{sh_motion}\\blur{sp['blur']}\\alpha&H{sp['alpha']}&}}{glow_body}"
                    )
                ass_lines.append(f"Dialogue: 2,{t_start},{t_end},Default,,0,0,0,,{{{motion_tag}}}{body}")
            elif is_glow:
                tags_outer = f"{{{motion_tag}\\blur{blur_outer}\\alpha&H{outer_alpha_hex}&}}"
                tags_inner = f"{{{motion_tag}\\blur{blur_inner}\\alpha&H{inner_alpha_hex}&}}"
                tags_default = f"{{{motion_tag}}}"
                ass_lines.append(f"Dialogue: 0,{t_start},{t_end},GlowOuter,,0,0,0,,{tags_outer}{glow_body}")
                ass_lines.append(f"Dialogue: 1,{t_start},{t_end},GlowInner,,0,0,0,,{tags_inner}{glow_body}")
                ass_lines.append(f"Dialogue: 2,{t_start},{t_end},Default,,0,0,0,,{tags_default}{body}")
            else:
                tags = f"{{{motion_tag}}}"
                ass_lines.append(f"Dialogue: 0,{t_start},{t_end},Default,,0,0,0,,{tags}{body}")

    job_id = str(uuid.uuid4())[:8]
    res_label = resolution.lower().replace("p", "").strip()
    ass_path = os.path.join(output_dir, f"sub_{job_id}.ass")
    with open(ass_path, "w", encoding="utf-8") as f:
        f.write("\n".join(ass_lines))

    ass_filter_path = ass_path.replace("\\", "/").replace(":", "\\:")
    fonts_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "fonts")).replace("\\", "/").replace(":", "\\:")
    output_mp4_path = os.path.join(output_dir, f"reelix_export_{job_id}_{res_label}.mp4")

    scale_filter = ""
    target_dim = {"720": 720, "480": 480, "360": 360, "240": 240}.get(res_label)
    if target_dim:
        scale_filter = f",scale='if(gt(ih,iw),{target_dim},-2)':'if(gt(ih,iw),-2,{target_dim})':flags=lanczos"

    def build_cmd(vf):
        return [get_ffmpeg_bin(), "-y", "-i", video_path, "-vf", vf,
                "-c:v", "libx264", "-preset", "fast", "-crf", "18",
                "-c:a", "aac", "-b:a", "192k", output_mp4_path]

    result = subprocess.run(
        build_cmd(f"ass='{ass_filter_path}':fontsdir='{fonts_dir}'{scale_filter}"),
        stdout=subprocess.PIPE, stderr=subprocess.PIPE,
    )
    if result.returncode != 0:
        result = subprocess.run(build_cmd(f"ass={ass_path}{scale_filter}"),
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        if result.returncode != 0:
            raise RuntimeError(f"FFmpeg rendering error: {result.stderr.decode('utf-8', errors='ignore')}")

    return output_mp4_path
