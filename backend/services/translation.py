"""
SUBLYX — Translation & Keyword Enrichment Service
Translates subtitle segments into target language and extracts high-impact keywords for kinetic emphasis.
"""

import json
import os
from dotenv import load_dotenv
from groq import Groq

# Model fallback list prioritized by capability
CANDIDATE_MODELS = [
    "openai/gpt-oss-120b",
    "openai/gpt-oss-20b",
    "qwen/qwen3.6-27b",
    "llama-3.3-70b-versatile",
    "llama-3.1-8b-instant",
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

    client = Groq(api_key=api_key)

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
    Translates list of caption segments into target language with master-level precision.
    Handles code-switched speech (e.g., Tamil + English, Hindi + English) to produce authentic, 
    grammatically perfect, natural English subtitles synchronized with video timestamps.
    """
    client, model = _get_client_and_model()

    # If full_text wasn't passed, construct it from segments
    if not full_text:
        full_text = " ".join(s.get("text", "") for s in segments)

    # Load custom Tamil dictionary dynamically filtered for the video speech
    custom_dict_context = ""
    dict_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "tamil_dict.json"))
    if os.path.exists(dict_path):
        try:
            with open(dict_path, "r", encoding="utf-8") as f:
                t_dict = json.load(f)
                
            # Filter terms that actually appear in the speech or fallback to top terms
            matched_terms = {k: v for k, v in t_dict.items() if k in full_text}
            if not matched_terms:
                matched_terms = dict(list(t_dict.items())[:60])
                
            custom_dict_context = "\n\n### MANDATORY CUSTOM TAMIL DICTIONARY & GLOSSARY:\n" + json.dumps(matched_terms, ensure_ascii=False)
        except Exception:
            pass

    # If source and target are the same, format and extract keywords directly
    if source_language.lower() == target_language.lower():
        system = (
            "You are a master Instagram Reels & TikTok subtitle editor.\n\n"
            "Given short subtitle segments (1-4 words each), identify 1 high-impact emphasis/keyword word per segment "
            "that deserves kinetic neon visual highlighting (e.g., action verbs, key nouns, numbers, impactful adjectives).\n\n"
            "Return JSON only with key 'translated_segments': array of objects with keys:\n"
            '- "id" (number)\n'
            '- "translated_text" (string — exact original text, do NOT modify)\n'
            '- "keywords" (array of strings — 1 key word present in translated_text that deserves highlight)'
        )
    else:
        system = (
            f"You are a world-class professional subtitle translator and localization expert, specializing in translating "
            f"code-mixed South Asian speech (such as Tamil + English, Tanglish, Hindi + English) into PERFECT, NATURAL, "
            f"AUTHENTIC, and IDIOMATIC {target_language}.\n\n"
            "### CORE OBJECTIVE\n"
            f"The speaker speaks in {source_language} frequently mixed with English words and colloquial expressions. "
            f"Your job is to translate their speech into flawless, fluent, high-engagement {target_language} suitable for "
            f"top-tier social media content, educational videos, and professional presentations.{custom_dict_context}\n\n"
            "### TRANSLATION RULES FOR FLAWLESS ENGLISH:\n"
            "1. **NATURAL ENGLISH SYNTAX & IDIOMS**:\n"
            "   - Tamil uses Subject-Object-Verb (SOV) structure, while English uses Subject-Verb-Object (SVO).\n"
            "   - DO NOT translate word-by-word into broken Tanglish! Convert the thought into authentic, idiomatic English.\n"
            "   - Example: 'இந்த tablet-அ daily morning சாப்பாட்டுக்கு அப்புறம் போடுங்க' -> 'Take this tablet every morning after meals' (NOT 'This tablet daily morning after food put').\n"
            "   - Example: 'Doctor-கிட்ட உடனே check பண்ணுங்க' -> 'Consult a doctor immediately'.\n"
            "   - Example: 'ரொம்ப கவனமா இருக்கணும்' -> 'You must be very careful'.\n"
            "   - Example: 'இதை மறக்காம share பண்ணுங்க' -> 'Be sure to share this'.\n\n"
            "2. **STRICT DICTIONARY CONSTRAINTS**:\n"
            "   - Refer to the CUSTOM TAMIL DICTIONARY provided above for exact words, phonetics, and medical/colloquial terms.\n\n"
            "3. **SEAMLESS CODE-MIX HANDLING**:\n"
            "   - When the speaker already used English words (e.g. 'blood pressure', 'sugar test', 'symptoms', 'normal range', 'surgery'), "
            "integrate them naturally into the English sentence without awkward redundancy.\n\n"
            "4. **PRESERVE EXACT MEANING & TONE**:\n"
            "   - Capture the speaker's exact tone (medical advice, casual tip, motivational, urgent warning).\n"
            "   - Retain all numbers, measurements, percentages, proper names, and scientific/medical terms with 100% accuracy.\n"
            "   - Never invent facts or omit important details.\n\n"
            "5. **INSTAGRAM REELS MICRO-ALIGNMENT (1 to 4 words per segment)**:\n"
            "   - Break the full translated thought across the corresponding segments so that the English subtitle cards "
            "flow smoothly in sync with the speaker's timing.\n"
            "   - Each segment's 'translated_text' should be concise (strictly 1 to 4 words) so it reads effortlessly on screen.\n\n"
            "6. **EMPHASIS KEYWORD**:\n"
            "   - Select exactly 1 high-impact word from each segment's 'translated_text' for kinetic visual pop.\n\n"
            "### REQUIRED JSON OUTPUT FORMAT:\n"
            "{\n"
            '  "translated_segments": [\n'
            '    { "id": 1, "translated_text": "Short English phrase", "keywords": ["KeyWord"] },\n'
            '    { "id": 2, "translated_text": "Next English phrase", "keywords": ["KeyWord"] }\n'
            "  ]\n"
            "}"
        )

    segment_payload = [{"id": s["id"], "text": s["text"]} for s in segments]
    user_prompt = (
        f"### FULL CONTEXT OF THE VIDEO SPEECH:\n"
        f"\"{full_text}\"\n\n"
        f"### SEGMENTS TO TRANSLATE AND ALIGN ({source_language} -> {target_language}):\n"
        f"{json.dumps(segment_payload, ensure_ascii=False)}\n\n"
        f"Remember: Output must be 100% authentic, grammatically flawless, natural {target_language} in snappy 1-4 word Reel cards!"
    )

    try:
        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user_prompt},
            ],
            response_format={"type": "json_object"},
            temperature=0.15,
            max_tokens=4096,
        )
        data = json.loads(response.choices[0].message.content)
        translated_segments = data.get("translated_segments", [])
        trans_map = {item["id"]: item for item in translated_segments}
    except Exception as e:
        print(f"Translation error with model {model}: {e}")
        trans_map = {}

    # Merge translation back into original segments with timestamps preserved
    final_captions = []
    for s in segments:
        sid = s["id"]
        t_info = trans_map.get(sid, {})
        translated_text = t_info.get("translated_text", s["text"]).strip()
        keywords = t_info.get("keywords", [])

        # Fallback keyword if none returned
        if not keywords and translated_text:
            words_in_t = translated_text.split()
            if words_in_t:
                keywords = [max(words_in_t, key=len)]  # Longest word as fallback emphasis

        # Generate proportional word timestamps for translated words
        trans_words = translated_text.split()
        seg_duration = max(0.1, s["end"] - s["start"])
        w_count = len(trans_words)

        if w_count > 0:
            word_dur = seg_duration / w_count
            words_timed = []
            for idx_w, tw in enumerate(trans_words):
                words_timed.append({
                    "word": tw,
                    "start": round(s["start"] + idx_w * word_dur, 2),
                    "end": round(s["start"] + (idx_w + 1) * word_dur, 2),
                })
        else:
            words_timed = s.get("words", [])

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


