"""
SUBLYX — Audio & Video Processing Service
Handles audio extraction and video metadata inspection using FFmpeg / FFprobe.
"""

import json
import os
import shutil
import subprocess
import tempfile


def get_ffmpeg_bin() -> str:
    """Finds the available ffmpeg binary."""
    # 1. System PATH
    found = shutil.which("ffmpeg")
    if found:
        return found
    # 2. Virtualenv or local paths
    venv_ffmpeg = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "venv", "bin", "ffmpeg"))
    if os.path.exists(venv_ffmpeg):
        return venv_ffmpeg
    node_ffmpeg = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "node_modules", "@ffmpeg-installer", "darwin-arm64", "ffmpeg"))
    if os.path.exists(node_ffmpeg):
        return node_ffmpeg
    return "ffmpeg"


def get_ffprobe_bin() -> str:
    """Finds the available ffprobe binary."""
    # 1. System PATH
    found = shutil.which("ffprobe")
    if found:
        return found
    # 2. Virtualenv or local paths
    venv_ffprobe = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "venv", "bin", "ffprobe"))
    if os.path.exists(venv_ffprobe):
        return venv_ffprobe
    node_ffprobe = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "node_modules", "@ffprobe-installer", "darwin-arm64", "ffprobe"))
    if os.path.exists(node_ffprobe):
        return node_ffprobe
    return "ffprobe"


def extract_audio(video_path: str, output_wav_path: str = None) -> str:
    """
    Extracts 16kHz mono PCM WAV audio from input video file for Whisper processing.
    """
    if not output_wav_path:
        base = os.path.splitext(video_path)[0]
        output_wav_path = f"{base}_audio.wav"

    cmd = [
        get_ffmpeg_bin(),
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
        get_ffprobe_bin(),
        "-v", "quiet",
        "-print_format", "json",
        "-show_format",
        "-show_streams",
        video_path,
    ]

    result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if result.returncode != 0:
        # Fallback default info if ffprobe fails
        return {"duration": 0.0, "width": 1920, "height": 1080, "fps": 30.0}

    data = json.loads(result.stdout.decode("utf-8", errors="ignore"))
    format_info = data.get("format", {})
    duration = float(format_info.get("duration", 0.0))

    width = 1920
    height = 1080
    fps = 30.0
    for stream in data.get("streams", []):
        if stream.get("codec_type") == "video":
            width = int(stream.get("width", 1920))
            height = int(stream.get("height", 1080))
            num, _, den = (stream.get("r_frame_rate") or "30/1").partition("/")
            try:
                if float(den or 1) > 0:
                    fps = float(num) / float(den or 1)
            except ValueError:
                fps = 30.0
            break

    return {"duration": duration, "width": width, "height": height, "fps": fps or 30.0}
