"""
MeaningGuard — Translator Service
Uses Groq Llama 3.3 70B for multilingual translation with independent dual-pass architecture.
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


def _call_llm(system_prompt: str, user_prompt: str) -> dict:
    """Call LLM via Groq with JSON mode. Returns parsed dict."""
    client, model = _get_client_and_model()
    response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        response_format={"type": "json_object"},
        temperature=0.3,
        max_tokens=1024,
    )
    raw = response.choices[0].message.content
    return json.loads(raw)


def detect_language(text: str) -> dict:
    """Detect the source language(s) of the input text."""
    system = (
        "You are a language detection engine. "
        "Identify the primary language of the input text. "
        "If the text is code-mixed (e.g., Tamil + English), list all languages present. "
        "Return JSON only with keys: "
        '"primary_language" (string), "all_languages" (array of strings), '
        '"is_code_mixed" (boolean). '
        "Use full language names like 'Tamil', 'Hindi', 'English', etc."
    )
    return _call_llm(system, f"Detect the language(s) of this text:\n\n{text}")


def translate_pass_a(text: str, source_language: str) -> dict:
    """
    Pass A — Primary faithful translation.
    Produces the most accurate natural English translation preserving all semantic nuance.
    """
    system = (
        "You are a multilingual translation engine.\n\n"
        "Translate the source into natural English while preserving the original semantic meaning.\n\n"
        "Do not invent facts.\n\n"
        "Preserve:\n"
        "- uncertainty and certainty\n"
        "- negation\n"
        "- tense\n"
        "- modality (should, could, might, etc.)\n"
        "- intent\n"
        "- quantities and names\n"
        "- relationships\n"
        "- idioms and slang (convey the intended meaning, not word-by-word)\n"
        "- speaker attitude and politeness level\n\n"
        "If the source itself is ambiguous, do not silently remove the ambiguity.\n\n"
        "Return JSON only with keys:\n"
        '"translation" (string — the English translation),\n'
        '"semantic_notes" (string — brief note on any nuance, uncertainty, or ambiguity in the source),\n'
        '"confidence" (string — "HIGH", "MEDIUM", or "LOW").'
    )
    user = f"Source language: {source_language}\n\nText to translate:\n\n{text}"
    return _call_llm(system, user)


def interpret_pass_b(text: str, source_language: str) -> dict:
    """
    Pass B — Independent interpretation.
    CRITICAL: This pass never sees Pass A's output.
    Independently determines what the speaker could reasonably mean.
    """
    system = (
        "You are an independent multilingual semantic interpreter.\n\n"
        "Interpret the original source text into English without seeing another translation.\n\n"
        "Focus on what the speaker could reasonably mean.\n\n"
        "Pay special attention to:\n"
        "- uncertainty vs certainty\n"
        "- negation\n"
        "- intent and modality\n"
        "- tense\n"
        "- slang and idioms (convey intended meaning)\n"
        "- cultural meaning\n"
        "- speaker attitude and politeness\n\n"
        "Do not manufacture certainty. If the source is ambiguous, say so.\n\n"
        "Return JSON only with keys:\n"
        '"interpretation" (string — your English interpretation),\n'
        '"ambiguity_detected" (boolean — true if the source has genuine ambiguity),\n'
        '"ambiguity_reason" (string or null — brief explanation if ambiguity exists),\n'
        '"confidence" (string — "HIGH", "MEDIUM", or "LOW").'
    )
    user = f"Source language: {source_language}\n\nText to interpret:\n\n{text}"
    return _call_llm(system, user)
