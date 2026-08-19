"""
MeaningGuard — Semantic Verification Evaluator
Compares Translation A and Interpretation B to detect meaningful semantic differences.
"""

import json
import os
from dotenv import load_dotenv
from groq import Groq

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


def evaluate(
    original_text: str,
    source_language: str,
    translation_a: str,
    semantic_notes_a: str,
    interpretation_b: str,
    ambiguity_detected_b: bool,
    ambiguity_reason_b: str | None,
) -> dict:
    """
    MeaningGuard Evaluator — compares Pass A and Pass B outputs.
    
    Returns a structured verdict on whether the translations preserve the same meaning.
    Does NOT compare strings — compares semantic intent.
    """
    system = (
        "You are a semantic verification evaluator called MeaningGuard.\n\n"
        "You receive:\n"
        "1. The original source text\n"
        "2. Translation A (primary translation)\n"
        "3. Independent Interpretation B\n\n"
        "Your job: determine whether both interpretations preserve the same meaning.\n\n"
        "CRITICAL RULES:\n"
        "- Do NOT flag stylistic or wording differences. "
        "'I am very tired' and 'I\\'m exhausted' are semantically equivalent.\n"
        "- ONLY flag differences that could materially affect understanding.\n"
        "- Pay special attention to: certainty, negation, tense, modality, intent, "
        "quantities, names, relationships, speaker attitude, slang, idioms, cultural meaning.\n"
        "- If the source itself is genuinely ambiguous, expose that ambiguity.\n"
        "- Do not pretend uncertainty is certainty.\n\n"
        "Return JSON only with these keys:\n"
        '"meaning_status" (string — one of: "SAME_MEANING", "MINOR_VARIATION", "MEANINGFUL_AMBIGUITY", "TRANSLATION_ERROR"),\n'
        '"confidence_level" (string — "HIGH", "MEDIUM", or "LOW"),\n'
        '"reason" (string or null — brief explanation if status is not SAME_MEANING),\n'
        '"risk_categories" (array of strings — zero or more of: "CERTAINTY", "NEGATION", "TENSE", "MODALITY", "INTENT", "QUANTITY", "ATTITUDE", "SLANG", "IDIOM", "CULTURAL"),\n'
        '"preferred_translation" (string — the translation you consider most faithful to the original),\n'
        '"alternative_translation" (string or null — the other interpretation if meaningfully different).'
    )

    user = (
        f"Source language: {source_language}\n\n"
        f"Original text:\n{original_text}\n\n"
        f"Translation A:\n{translation_a}\n"
        f"Semantic notes from A: {semantic_notes_a}\n\n"
        f"Independent Interpretation B:\n{interpretation_b}\n"
        f"Ambiguity detected by B: {ambiguity_detected_b}\n"
        f"Ambiguity reason from B: {ambiguity_reason_b or 'None'}"
    )

    client, model = _get_client_and_model()
    response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        response_format={"type": "json_object"},
        temperature=0.2,
        max_tokens=1024,
    )
    raw = response.choices[0].message.content
    return json.loads(raw)
