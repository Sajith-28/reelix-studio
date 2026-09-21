"""
SUBLYX — Translation & Kinetic Keyword Enrichment Service
Translates subtitle segments into target languages with master-level accuracy,
and extracts high-impact punchwords for kinetic visual pop.
"""

import json
import os
from dotenv import load_dotenv
from groq import Groq
from services.transcription import get_word_timings

CANDIDATE_MODELS = [
    "openai/gpt-oss-120b",
    "qwen/qwen3.6-27b",
    "qwen/qwen3.8-27b",
    "groq/compound-mini",
]


def _get_client_and_model():
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

    client = Groq(api_key=api_key, timeout=60.0)

    selected_model = "openai/gpt-oss-120b"
    try:
        remote_models = {m.id for m in client.models.list().data}
        for candidate in CANDIDATE_MODELS:
            if candidate in remote_models:
                selected_model = candidate
                break
    except Exception:
        pass

    return client, selected_model


def translate_captions(segments: list, source_language: str, target_language: str, full_text: str = "") -> list:
    """
    Translates and enriches subtitle segments.
    - When target is English: segments are already 100% accurately translated directly from acoustic speech.
      Performs viral kinetic keyword enrichment and returns broadcast-ready subtitle units.
    - When target is non-English: uses Groq's high-capacity LLM to translate from the 100% faithful
      English baseline into the target language (strictly 2-4 words per card) with sub-second word timestamps.
    """
    if not segments:
        return []

    client, model = _get_client_and_model()

    target_lang_clean = (target_language or "English").strip().lower()

    # ─────────────────────────────────────────────────────────────
    # CASE 1: TARGET IS ENGLISH (Acoustic Ground Truth Already Accurate)
    # ─────────────────────────────────────────────────────────────
    if target_lang_clean == "english":
        cards_payload = [{"id": s["id"], "text": s["text"]} for s in segments]

        prompt = (
            "You are a Reels subtitle editor. For each card below, pick 1 high-impact emphasis keyword "
            "(technical term, medical term, acronym, key noun, impactful verb, or number) for neon highlighting.\n"
            f"Cards:\n{json.dumps(cards_payload, ensure_ascii=False)}\n\n"
            'Return JSON strictly with key "keywords_map": {"1": ["word"], "2": ["word"], ...}'
        )

        kw_map = {}
        try:
            res = client.chat.completions.create(
                model=model,
                messages=[{"role": "user", "content": prompt}],
                response_format={"type": "json_object"},
                temperature=0.0,
            )
            kw_data = json.loads(res.choices[0].message.content)
            kw_map = kw_data.get("keywords_map", {})
        except Exception as e:
            print(f"Keyword extraction notice ({model}): {e}")

        final_captions = []
        for s in segments:
            sid_str = str(s["id"])
            card_text = s["text"].strip()
            words_in_text = card_text.split()

            # Pick keyword from LLM map or fallback to longest word
            keywords = kw_map.get(sid_str, [])
            if not keywords and words_in_text:
                clean_words = [w.strip('.,!?;:"') for w in words_in_text if len(w.strip('.,!?;:"')) > 2]
                fallback_kw = max(clean_words or words_in_text, key=len)
                keywords = [fallback_kw]

            final_captions.append({
                "id": s["id"],
                "start": s["start"],
                "end": s["end"],
                "source_text": card_text,
                "translated_text": card_text,
                "keywords": keywords,
                "words": s.get("words") or get_word_timings(words_in_text, s["start"], s["end"]),
            })

        return final_captions

    # ─────────────────────────────────────────────────────────────
    # CASE 2: TARGET IS A NON-ENGLISH LANGUAGE (Translate from English Baseline)
    # ─────────────────────────────────────────────────────────────
    cards_payload = [{"id": s["id"], "text": s["text"]} for s in segments]

    prompt = (
        f"You are a master professional subtitle translator. Translate each of these short video subtitle cards "
        f"into authentic, natural, and grammatically flawless {target_language} for Instagram Reels "
        f"(strictly 2 to 4 words per card, maintaining exact clause order and meaning).\n"
        f"Also pick exactly 1 emphasis keyword per translated card.\n\n"
        f"Cards to translate:\n{json.dumps(cards_payload, ensure_ascii=False)}\n\n"
        'Return JSON: {"translated_segments": [{"id": 1, "translated_text": "...", "keywords": ["..."]}, ...]}'
    )

    trans_map = {}
    try:
        res = client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
            temperature=0.1,
        )
        data = json.loads(res.choices[0].message.content)
        translated_segments = data.get("translated_segments", [])
        trans_map = {item["id"]: item for item in translated_segments}
    except Exception as e:
        print(f"Translation error ({model}): {e}")

    final_captions = []
    for s in segments:
        sid = s["id"]
        t_info = trans_map.get(sid, {})
        translated_text = t_info.get("translated_text", s["text"]).strip()
        keywords = t_info.get("keywords", [])

        trans_words = translated_text.split()
        if not keywords and trans_words:
            keywords = [max(trans_words, key=len)]

        words_timed = get_word_timings(trans_words, s["start"], s["end"])

        final_captions.append({
            "id": sid,
            "start": s["start"],
            "end": s["end"],
            "source_text": s["text"],
            "translated_text": translated_text,
            "keywords": keywords,
            "words": words_timed,
        })

    return final_captions
