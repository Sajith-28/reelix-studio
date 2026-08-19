"""
SUBLYX — SRT Subtitle Service
Generates standard .srt subtitle files from structured caption data.
"""


def format_srt_timestamp(seconds: float) -> str:
    """Converts float seconds (e.g. 64.25) to SRT timestamp string (00:01:04,250)."""
    hrs = int(seconds // 3600)
    mins = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    millis = int(round((seconds - int(seconds)) * 1000))
    if millis >= 1000:
        millis = 999

    return f"{hrs:02d}:{mins:02d}:{secs:02d},{millis:03d}"


def generate_srt_content(captions: list) -> str:
    """
    Generates standard valid SRT file text from caption list.
    """
    lines = []
    for idx, c in enumerate(captions, start=1):
        start_str = format_srt_timestamp(c.get("start", 0.0))
        end_str = format_srt_timestamp(c.get("end", 0.0))
        text = c.get("translated_text") or c.get("source_text") or ""

        lines.append(f"{idx}")
        lines.append(f"{start_str} --> {end_str}")
        lines.append(f"{text}")
        lines.append("")  # Blank line separator

    return "\n".join(lines)
