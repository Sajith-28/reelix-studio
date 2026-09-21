"""
MeaningGuard — Voice Service
Transcribes audio input using Groq Whisper Large-V3.
"""

import os
import tempfile
from dotenv import load_dotenv
from groq import Groq


def transcribe_audio(file_bytes: bytes, filename: str = "audio.wav") -> str:
    """
    Transcribes audio bytes using Groq Whisper Large-V3.
    Returns transcribed text string.
    """
    from services.groq_client import get_groq_client
    client = get_groq_client(timeout=60.0)

    # Create temporary file for Groq API audio input
    ext = os.path.splitext(filename)[1] or ".wav"
    with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
        tmp.write(file_bytes)
        tmp_path = tmp.name

    try:
        with open(tmp_path, "rb") as file:
            transcription = client.audio.transcriptions.create(
                file=(filename, file.read()),
                model="whisper-large-v3",
                response_format="json",
                temperature=0.0,
            )
        return transcription.text
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
