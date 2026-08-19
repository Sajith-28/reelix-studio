"""
SUBLYX — Audio & Video Processing Service
Handles audio extraction and video metadata inspection using FFmpeg / FFprobe.
"""

import json
import os
import subprocess
import tempfile


def extract_audio(video_path: str, output_wav_path: str = None) -> str:
    """
    Extracts 16kHz mono PCM WAV audio from input video file for Whisper processing.
    """
    if not output_wav_path:
        base = os.path.splitext(video_path)[0]
        output_wav_path = f"{base}_audio.wav"

    cmd = [
        "ffmpeg",
        "-y",
        "-i", video_path,
        "-vn",
        "-acodec", "pcm_s16le",
        "-ar", "16000",
        "-ac", "1",
        output_wav_path,
    ]

    result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if result.returncode != 0:
        raise RuntimeError(f"FFmpeg audio extraction failed: {result.stderr.decode('utf-8', errors='ignore')}")

    return output_wav_path


def get_video_info(video_path: str) -> dict:
    """
    Retrieves video metadata (duration, width, height, fps) using ffprobe.
    """
    cmd = [
        "ffprobe",
        "-v", "quiet",
        "-print_format", "json",
        "-show_format",
        "-show_streams",
        video_path,
    ]

    result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if result.returncode != 0:
        # Fallback default info if ffprobe fails
        return {"duration": 0.0, "width": 1920, "height": 1080}

    data = json.loads(result.stdout.decode("utf-8", errors="ignore"))
    format_info = data.get("format", {})
    duration = float(format_info.get("duration", 0.0))

    width = 1920
    height = 1080
    for stream in data.get("streams", []):
        if stream.get("codec_type") == "video":
            width = int(stream.get("width", 1920))
            height = int(stream.get("height", 1080))
            break

    return {"duration": duration, "width": width, "height": height}
