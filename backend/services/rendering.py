"""
SUBLYX — Video Export Rendering Service
Generates Advanced SubStation Alpha (.ass) subtitle file and burns subtitles into video via FFmpeg.
"""

import os
import subprocess
import uuid


from services.audio import get_video_info


def hex_to_ass_color(hex_str: str, alpha: str = "00") -> str:
    """
    Converts CSS hex color (#RRGGBB) to ASS color format &HAAABBGGRR.
    """
    hex_clean = hex_str.lstrip("#")
    if len(hex_clean) == 6:
        r, g, b = hex_clean[0:2], hex_clean[2:4], hex_clean[4:6]
    else:
        r, g, b = "FF", "FF", "FF"
    return f"&H{alpha}{b}{g}{r}"


def render_difference_blend_video(
    video_path: str,
    captions: list,
    style_config: dict,
    output_dir: str,
    resolution: str = "original",
) -> str:
    """
    Renders video using frame-by-frame pixel inversion (mix-blend-mode: difference).
    Inverts the exact video pixels behind each letter while retaining vector clarity.
    """
    import cv2
    import numpy as np
    from PIL import Image, ImageDraw, ImageFont

    cap = cv2.VideoCapture(video_path)
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0

    font_name = style_config.get("fontFamily", "Anton")
    font_file = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "fonts", f"{font_name}.ttf"))
    if not os.path.exists(font_file):
        font_file = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "fonts", "Anton.ttf"))

    scale_factor = (height / 520.0) if height >= width else (width / 640.0)
    user_font_size = float(style_config.get("fontSize", 32))
    font_size = max(24, int(round(user_font_size * scale_factor)))
    font = ImageFont.truetype(font_file, font_size)

    x_pct = float(style_config.get("xPercent", 50))
    y_pct = float(style_config.get("yPercent", 82))
    pos_x_center = int(round(width * (x_pct / 100)))
    pos_y_center = int(round(height * (y_pct / 100)))

    # Pre-render text masks for each caption
    caption_masks = []
    for c in captions:
        start_sec = float(c.get("start", 0.0))
        end_sec = float(c.get("end", 0.0))
        raw_text = (c.get("translated_text") or c.get("source_text") or "").strip().upper()
        if not raw_text:
            continue

        words = raw_text.split()
        if len(words) == 2 and len(raw_text) > 8:
            formatted_text = f"{words[0]}\n{words[1]}"
        elif len(words) >= 3 and len(raw_text) > 14:
            mid = len(words) // 2
            formatted_text = f"{' '.join(words[:mid])}\n{' '.join(words[mid:])}"
        else:
            formatted_text = raw_text

        # Create mask
        mask_img = Image.new("L", (width, height), 0)
        draw = ImageDraw.Draw(mask_img)
        bbox = draw.multiline_textbbox((0, 0), formatted_text, font=font, align="center")
        tw = bbox[2] - bbox[0]
        th = bbox[3] - bbox[1]

        tx = int(pos_x_center - tw / 2)
        ty = int(pos_y_center - th / 2)

        draw.multiline_text((tx, ty), formatted_text, font=font, fill=255, align="center")

        # Optional stroke mask
        stroke_w = int(round(float(style_config.get("strokeWidth", 0)) * scale_factor * 0.5))
        stroke_mask = None
        if stroke_w > 0:
            stroke_img = Image.new("L", (width, height), 0)
            s_draw = ImageDraw.Draw(stroke_img)
            s_draw.multiline_text((tx, ty), formatted_text, font=font, fill=255, stroke_width=stroke_w, stroke_fill=255, align="center")
            stroke_np = np.array(stroke_img)
            inner_np = np.array(mask_img)
            stroke_diff = np.clip(stroke_np.astype(np.int16) - inner_np.astype(np.int16), 0, 255).astype(np.uint8)
            stroke_mask = np.stack([stroke_diff] * 3, axis=-1) / 255.0

        mask_np = np.array(mask_img)
        mask_3c = np.stack([mask_np, mask_np, mask_np], axis=-1) / 255.0

        caption_masks.append({
            "start_frame": int(start_sec * fps),
            "end_frame": int(end_sec * fps),
            "mask": mask_3c,
            "stroke_mask": stroke_mask,
        })

    job_id = str(uuid.uuid4())[:8]
    res_label = resolution.lower().replace("p", "").strip()
    output_mp4_path = os.path.join(output_dir, f"reelix_export_{job_id}_{res_label}.mp4")
    temp_raw_mp4 = os.path.join(output_dir, f"temp_raw_{job_id}.mp4")

    # Scaling filter if needed
    scale_filter = []
    size_map = {"720": 720, "480": 480, "360": 360, "240": 240}
    target_dim = size_map.get(res_label)
    if target_dim:
        scale_filter = ["-vf", f"scale='if(gt(ih,iw),{target_dim},-2)':'if(gt(ih,iw),-2,{target_dim})':flags=lanczos"]

    ffmpeg_cmd = [
        "ffmpeg", "-y",
        "-f", "rawvideo",
        "-vcodec", "rawvideo",
        "-s", f"{width}x{height}",
        "-pix_fmt", "bgr24",
        "-r", str(fps),
        "-i", "-",
        *scale_filter,
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "18",
        "-pix_fmt", "yuv420p",
        temp_raw_mp4
    ]
    proc = subprocess.Popen(ffmpeg_cmd, stdin=subprocess.PIPE, stderr=subprocess.DEVNULL)

    frame_idx = 0
    while True:
        ret, frame = cap.read()
        if not ret:
            break

        active_item = None
        for item in caption_masks:
            if item["start_frame"] <= frame_idx <= item["end_frame"]:
                active_item = item
                break

        if active_item is not None:
            m = active_item["mask"]
            sm = active_item["stroke_mask"]
            tr_type = style_config.get("transition", "Fade In + Slide Up")

            # Calculate transition entry progress over ~180ms
            elapsed_frames = frame_idx - active_item["start_frame"]
            trans_frames = max(1, int(round(fps * 0.18)))

            if ("Fade In" in tr_type and "Slide Up" in tr_type) or tr_type == "Fade In":
                alpha = min(1.0, max(0.0, elapsed_frames / float(trans_frames)))
                m = m * alpha
                if sm is not None:
                    sm = sm * alpha

            if "Slide Up" in tr_type and elapsed_frames < trans_frames:
                shift_y = int(round((1.0 - (elapsed_frames / float(trans_frames))) * 22))
                if shift_y > 0:
                    m = np.roll(m, shift_y, axis=0)
                    m[:shift_y, :] = 0
                    if sm is not None:
                        sm = np.roll(sm, shift_y, axis=0)
                        sm[:shift_y, :] = 0

            inv = 255 - frame
            frame = (frame * (1.0 - m) + inv * m).astype(np.uint8)
            if sm is not None:
                frame = (frame * (1.0 - sm)).astype(np.uint8)

        proc.stdin.write(frame.tobytes())
        frame_idx += 1

    cap.release()
    proc.stdin.close()
    proc.wait()

    # Mux original audio into final MP4
    mux_cmd = [
        "ffmpeg", "-y",
        "-i", temp_raw_mp4,
        "-i", video_path,
        "-c:v", "copy",
        "-c:a", "aac",
        "-b:a", "192k",
        "-map", "0:v:0",
        "-map", "1:a:0?",
        output_mp4_path
    ]
    subprocess.run(mux_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if os.path.exists(temp_raw_mp4):
        try:
            os.remove(temp_raw_mp4)
        except Exception:
            pass

    return output_mp4_path


def render_captioned_video(
    video_path: str,
    captions: list,
    style_config: dict,
    output_dir: str,
    resolution: str = "original",
) -> str:
    """
    Renders video with burned-in captions.
    Routes difference blend mode to the True Pixel Inversion engine.
    Uses LibASS engine for standard typography templates.
    """
    blend_mode = style_config.get("mixBlendMode", "normal")
    if blend_mode == "difference":
        try:
            return render_difference_blend_video(
                video_path=video_path,
                captions=captions,
                style_config=style_config,
                output_dir=output_dir,
                resolution=resolution,
            )
        except Exception as e:
            print(f"Difference renderer fallback to ASS due to error: {e}")

    # Step 1: Inspect actual source video resolution & aspect ratio
    v_info = get_video_info(video_path)
    vid_w = int(v_info.get("width", 1080))
    vid_h = int(v_info.get("height", 1920))

    # Step 2: Proportional Font Scaling (matching browser preview to true video resolution)
    scale_factor = (vid_h / 520.0) if vid_h >= vid_w else (vid_w / 640.0)

    font_name = style_config.get("fontFamily", "Anton")
    user_font_size = float(style_config.get("fontSize", 32))
    ass_font_size = max(24, int(round(user_font_size * scale_factor)))

    text_color = hex_to_ass_color(style_config.get("color", "#FFFFFF"))
    highlight_color = hex_to_ass_color(style_config.get("highlightColor", "#facc15"))
    position = style_config.get("position", "bottom")

    # Step 3: Compute Exact (X, Y) Canvas Coordinates
    x_pct = float(style_config.get("xPercent", 50))
    y_pct = float(style_config.get("yPercent", 15 if position == "top" else 50 if position == "center" else 82))
    pos_x = int(round(vid_w * (x_pct / 100)))
    pos_y = int(round(vid_h * (y_pct / 100)))

    # Align map fallback
    align_map = {"top": 8, "center": 5, "bottom": 2}
    alignment = align_map.get(position, 5)
    margin_v = int(round(180 * (vid_h / 1920))) if position == "bottom" else int(round(60 * (vid_h / 1920)))

    # Step 4: Proportional Vector Stroke & Shadow
    raw_stroke = float(style_config.get("strokeWidth", 3.5))
    ass_stroke_width = max(1, int(round(raw_stroke * scale_factor * 0.9)))
    stroke_color = hex_to_ass_color(style_config.get("strokeColor", "#000000"))

    raw_shadow_dist = float(style_config.get("shadowDistance", 4))
    ass_shadow_dist = max(1, int(round(raw_shadow_dist * scale_factor * 0.8)))

    # Check if Inverted Box (BorderStyle=3) is requested or if solid background is set
    use_inverted_box = style_config.get("borderStyle") == 3 or (
        style_config.get("backgroundColor") and style_config.get("backgroundColor") != "transparent"
    )
    border_style = 3 if use_inverted_box else 1

    if use_inverted_box:
        box_bg = style_config.get("backgroundColor", "#000000")
        if "rgba" in box_bg:
            back_colour = hex_to_ass_color("#000000", alpha="20")
        else:
            back_colour = hex_to_ass_color(box_bg, alpha="00")
    else:
        back_colour = hex_to_ass_color(style_config.get("shadowColor", "#000000"), alpha="20")

    # Step 5: Build ASS File Header matching exact video dimensions
    ass_lines = [
        "[Script Info]",
        "ScriptType: v4.00+",
        f"PlayResX: {vid_w}",
        f"PlayResY: {vid_h}",
        "ScaledBorderAndShadow: yes",
        "",
        "[V4+ Styles]",
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
        f"Style: Default,{font_name},{ass_font_size},{text_color},&H000000FF,{stroke_color},{back_colour},-1,0,0,0,100,100,0,0,{border_style},{ass_stroke_width},{ass_shadow_dist},{alignment},40,40,{margin_v},1",
        "",
        "[Events]",
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ]

    for c in captions:
        start_sec = float(c.get("start", 0.0))
        end_sec = float(c.get("end", 0.0))

        def sec_to_ass_time(s):
            h = int(s // 3600)
            m = int((s % 3600) // 60)
            sec = int(s % 60)
            cs = int(round((s - int(s)) * 100))
            if cs >= 100:
                cs = 99
            return f"{h}:{m:02d}:{sec:02d}.{cs:02d}"

        t_start = sec_to_ass_time(start_sec)
        t_end = sec_to_ass_time(end_sec)
        raw_text = (c.get("translated_text") or c.get("source_text") or "").strip().upper()
        keywords = [k.upper() for k in c.get("keywords", []) if k]

        # Smart multi-line wrap for 2+ words to create viral stacked reels look
        words = raw_text.split()
        if len(words) == 2 and len(raw_text) > 8:
            formatted_text = f"{words[0]}\\N{words[1]}"
        elif len(words) >= 3 and len(raw_text) > 14:
            mid = len(words) // 2
            formatted_text = f"{' '.join(words[:mid])}\\N{' '.join(words[mid:])}"
        else:
            formatted_text = raw_text

        # Apply keyword highlight tags in ASS format
        for kw in keywords:
            if kw and kw in formatted_text:
                formatted_text = formatted_text.replace(kw, f"{{\\c{highlight_color}\\b1}}{kw}{{\\c{text_color}\\b0}}")

        # Explicit screen positioning, transition animation, and optional horizontal flip transformation override
        flip_tag = "\\fry180" if style_config.get("flipH") else ""
        tr_type = style_config.get("transition", "Fade In + Slide Up")

        if "Fade In" in tr_type and "Slide Up" in tr_type:
            # Seamless combined Fade In + Slide Up (fad 180ms + move 25px up over 180ms)
            slide_start_y = pos_y + max(15, int(round(25 * (vid_h / 1920))))
            trans_tag = f"{{\\fad(180,0)\\move({pos_x},{slide_start_y},{pos_x},{pos_y},0,180)\\an5{flip_tag}}}"
        elif tr_type == "Fade In":
            trans_tag = f"{{\\fad(180,0)\\an5\\pos({pos_x},{pos_y}){flip_tag}}}"
        else:
            trans_tag = f"{{\\an5\\pos({pos_x},{pos_y}){flip_tag}}}"

        ass_lines.append(f"Dialogue: 0,{t_start},{t_end},Default,,0,0,0,,{trans_tag}{formatted_text}")

    # Write ASS file
    job_id = str(uuid.uuid4())[:8]
    res_label = resolution.lower().replace("p", "").strip()
    ass_path = os.path.join(output_dir, f"sub_{job_id}.ass")
    with open(ass_path, "w", encoding="utf-8") as f:
        f.write("\n".join(ass_lines))

    # Escape paths for FFmpeg ASS filter
    ass_filter_path = ass_path.replace("\\", "/").replace(":", "\\:")
    fonts_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "fonts")).replace("\\", "/").replace(":", "\\:")
    output_mp4_path = os.path.join(output_dir, f"reelix_export_{job_id}_{res_label}.mp4")

    # Build scale filter if resolution is not original
    scale_filter = ""
    size_map = {"720": 720, "480": 480, "360": 360, "240": 240}
    target_dim = size_map.get(res_label)
    if target_dim:
        scale_filter = f",scale='if(gt(ih,iw),{target_dim},-2)':'if(gt(ih,iw),-2,{target_dim})':flags=lanczos"

    vf_chain = f"ass='{ass_filter_path}':fontsdir='{fonts_dir}'{scale_filter}"
    cmd = [
        "ffmpeg",
        "-y",
        "-i", video_path,
        "-vf", vf_chain,
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "18",
        "-c:a", "aac",
        "-b:a", "192k",
        output_mp4_path,
    ]

    result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if result.returncode != 0:
        fallback_vf = f"ass={ass_path}{scale_filter}"
        fallback_cmd = [
            "ffmpeg",
            "-y",
            "-i", video_path,
            "-vf", fallback_vf,
            "-c:v", "libx264",
            "-preset", "fast",
            "-crf", "18",
            "-c:a", "aac",
            "-b:a", "192k",
            output_mp4_path,
        ]
        result2 = subprocess.run(fallback_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        if result2.returncode != 0:
            raise RuntimeError(f"FFmpeg rendering error: {result2.stderr.decode('utf-8', errors='ignore')}")

    return output_mp4_path

