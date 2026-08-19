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
    for env_path in [
        os.path.join(os.path.dirname(__file__), "..", "..", ".env"),
        os.path.join(os.path.dirname(__file__), "..", ".env"),
        os.path.abspath(".env"),
    ]:
        if os.path.exists(env_path):
            load_dotenv(env_path, override=True)
            break

    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        raise ValueError("GROQ_API_KEY is missing from environment or .env file.")

    client = Groq(api_key=api_key)

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
