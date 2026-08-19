"""
SUBLYX — Transcription Service
Uses Groq Whisper Large-V3 for speech recognition with word-level & segment timestamps.
"""

import os
from dotenv import load_dotenv
from groq import Groq


def transcribe_video_audio(wav_path: str, spoken_language: str = None) -> dict:
    """
    Transcribes PCM WAV audio file using Groq whisper-large-v3.
    Returns structured data with full text, detected language, segments, and word timestamps.
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

    # Load custom dictionary terms to bias Whisper transcription prompt
    dict_terms = ""
    dict_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "tamil_dict.json"))
    if os.path.exists(dict_path):
        try:
            import json
            with open(dict_path, "r", encoding="utf-8") as f:
                t_dict = json.load(f)
                dict_terms = ", " + ", ".join(list(t_dict.keys())[:30])
        except Exception:
            pass

    base_ta_prompt = (
        "Tamil speaker mixing English words. Transcribe EXACTLY — Tamil in Tamil script, English in English. "
        "Do NOT translate. Common terms: doctor, hospital, patient, health, sugar, treatment, medicine, tablet, "
        "report, video, Instagram, YouTube, subscribe, followers"
    )
    if dict_terms:
        ta_prompt = f"{base_ta_prompt}{dict_terms}."
        if len(ta_prompt) > 750:
            ta_prompt = ta_prompt[:745] + "..."
    else:
        ta_prompt = f"{base_ta_prompt}."

    # Build a transcription prompt hint for code-switched speech (e.g., Tamil + English)
    # Whisper's `prompt` parameter biases the model toward expected vocabulary and style (max 896 chars).
    CODE_SWITCH_PROMPTS = {
        "ta": ta_prompt,
        "hi": (
            "This is a Hindi speaker who frequently mixes English words. "
            "Transcribe exactly — keep Hindi in Devanagari and English words in English. "
            "Do not translate. Preserve code-switching accurately."
        ),
    }

    with open(wav_path, "rb") as file:
        kwargs = {
            "file": (os.path.basename(wav_path), file.read()),
            "model": "whisper-large-v3",
            "response_format": "verbose_json",
            "timestamp_granularities": ["word", "segment"],
            "temperature": 0.0,
        }
        if spoken_language and spoken_language.lower() != "auto detect" and spoken_language.lower() != "auto":
            lang_code_map = {
                "english": "en", "tamil": "ta", "hindi": "hi", "malayalam": "ml",
                "telugu": "te", "kannada": "kn", "bengali": "bn", "arabic": "ar",
                "french": "fr", "spanish": "es", "german": "de", "japanese": "ja",
            }
            code = lang_code_map.get(spoken_language.lower(), spoken_language[:2].lower())
            kwargs["language"] = code

            # Inject code-switching prompt hint if available
            if code in CODE_SWITCH_PROMPTS:
                kwargs["prompt"] = CODE_SWITCH_PROMPTS[code]

        response = client.audio.transcriptions.create(**kwargs)

    resp_dict = response.model_dump() if hasattr(response, "model_dump") else dict(response)

    detected_language = resp_dict.get("language", "english").capitalize()
    all_words = resp_dict.get("words", [])

    # If top-level words not present, collect from raw segments
    if not all_words:
        for seg in resp_dict.get("segments", []):
            all_words.extend(seg.get("words", []))

    # Chunk into snappy 2 to 4 word Reels subtitle units
    segments = []
    if all_words:
        current_chunk = []
        current_start = None

        for w in all_words:
            w_text = w.get("word", "").strip()
            if not w_text:
                continue

            w_start = round(float(w.get("start", 0.0)), 2)
            w_end = round(float(w.get("end", 0.0)), 2)

            if not current_chunk:
                current_start = w_start
                current_chunk.append({"word": w_text, "start": w_start, "end": w_end})
                continue

            duration = w_end - current_start
            prev_end = current_chunk[-1]["end"]
            pause_gap = w_start - prev_end
            prev_word = current_chunk[-1]["word"]

            # Split on max 3-4 words, 2.2s duration, natural pause (>0.45s), or punctuation
            should_split = (
                len(current_chunk) >= 3
                or duration >= 2.0
                or pause_gap > 0.45
                or prev_word.endswith((".", "?", "!", ","))
            )

            if should_split:
                chunk_text = " ".join(item["word"] for item in current_chunk)
                segments.append({
                    "id": len(segments) + 1,
                    "start": current_start,
                    "end": round(current_chunk[-1]["end"], 2),
                    "text": chunk_text,
                    "words": current_chunk,
                })
                current_chunk = [{"word": w_text, "start": w_start, "end": w_end}]
                current_start = w_start
            else:
                current_chunk.append({"word": w_text, "start": w_start, "end": w_end})

        if current_chunk:
            chunk_text = " ".join(item["word"] for item in current_chunk)
            segments.append({
                "id": len(segments) + 1,
                "start": current_start,
                "end": round(current_chunk[-1]["end"], 2),
                "text": chunk_text,
                "words": current_chunk,
            })
    else:
        # Fallback to standard segments
        for idx, seg in enumerate(resp_dict.get("segments", [])):
            segments.append({
                "id": idx + 1,
                "start": round(float(seg.get("start", 0.0)), 2),
                "end": round(float(seg.get("end", 0.0)), 2),
                "text": seg.get("text", "").strip(),
                "words": seg.get("words", []),
            })

    return {
        "text": resp_dict.get("text", ""),
        "detected_language": detected_language,
        "segments": segments,
    }
