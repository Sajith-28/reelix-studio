"""
Reelix Studio — Local Fine-Tuned Translation Service

Loads the LoRA-fine-tuned Indic→English model from training/models/reelix-mt-final/
and exposes a simple translate_local(text) -> str function.

The model is loaded lazily on first call and cached as a singleton for the
lifetime of the process. If the model directory doesn't exist, or any ML
dependency is missing, translate_local() raises an exception — the caller
in translation.py catches this and falls back to the Groq API.

This module is NEVER imported at module level by the running app. It's
imported inside a try/except at call time, so missing dependencies
(torch, transformers, peft) don't break the server at startup.
"""

import json
import logging
import os

logger = logging.getLogger("reelix.local_translation")

# Singleton cache — loaded once, reused across requests
_model = None
_tokenizer = None
_lang_config = None
_device = None
_loaded = False
_load_error = None

# Path to the fine-tuned model (relative to project root)
MODEL_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "training", "models", "reelix-mt-final")
)


def _load_model():
    """
    Lazily load the fine-tuned translation model + LoRA adapter.
    Called once on first translate_local() invocation.
    Raises if model dir doesn't exist or dependencies are missing.
    """
    global _model, _tokenizer, _lang_config, _device, _loaded, _load_error

    if _loaded:
        if _load_error:
            raise _load_error
        return

    try:
        # These imports are intentionally inside the function so the backend
        # can start without torch/transformers/peft installed.
        import torch
        from transformers import AutoModelForSeq2SeqLM, AutoTokenizer

        # Check model directory exists
        if not os.path.isdir(MODEL_DIR):
            raise FileNotFoundError(
                f"Local model directory not found: {MODEL_DIR}. "
                f"Train the model first with: python training/finetune_translation.py"
            )

        # Load training metadata
        metadata_path = os.path.join(MODEL_DIR, "reelix_metadata.json")
        if not os.path.exists(metadata_path):
            raise FileNotFoundError(f"Model metadata not found: {metadata_path}")

        with open(metadata_path, "r") as f:
            metadata = json.load(f)

        base_model_name = metadata["base_model"]
        _lang_config = metadata.get("lang_config", {
            "src_lang": "tam_Taml",
            "tgt_lang": "eng_Latn",
        })

        logger.info(f"Loading base model: {base_model_name}")
        _tokenizer = AutoTokenizer.from_pretrained(base_model_name, trust_remote_code=True)
        base_model = AutoModelForSeq2SeqLM.from_pretrained(
            base_model_name,
            trust_remote_code=True,
            torch_dtype=torch.float32,
        )

        # Load and merge LoRA adapter
        try:
            from peft import PeftModel
            logger.info(f"Loading LoRA adapter from: {MODEL_DIR}")
            _model = PeftModel.from_pretrained(base_model, MODEL_DIR)
            _model = _model.merge_and_unload()
            logger.info("LoRA adapter merged successfully")
        except ImportError:
            logger.warning("peft not installed — loading base model without LoRA adapter")
            _model = base_model

        _model.eval()
        _device = "cuda" if torch.cuda.is_available() else "cpu"
        _model = _model.to(_device)

        _loaded = True
        _load_error = None
        logger.info(f"Local translation model ready (device={_device})")

    except Exception as e:
        _loaded = True
        _load_error = e
        logger.error(f"Failed to load local translation model: {e}")
        raise


def translate_local(text: str) -> str:
    """
    Translate a single text string (Tamil/Tanglish → English) using the
    locally fine-tuned model.

    Args:
        text: Source text in Tamil, Tanglish, or Hindi.

    Returns:
        Translated English string.

    Raises:
        Exception: If model can't be loaded or inference fails.
                   The caller should catch this and fall back to Groq.
    """
    import torch

    _load_model()

    if _model is None or _tokenizer is None:
        raise RuntimeError("Local translation model is not loaded")

    # Set source language
    if hasattr(_tokenizer, "src_lang") and _lang_config:
        _tokenizer.src_lang = _lang_config.get("src_lang", "tam_Taml")

    # Tokenize
    inputs = _tokenizer(text, return_tensors="pt", max_length=128, truncation=True)
    inputs = {k: v.to(_device) for k, v in inputs.items()}

    # Generate
    with torch.no_grad():
        generated = _model.generate(
            **inputs,
            max_new_tokens=128,
            num_beams=4,
            early_stopping=True,
        )

    decoded = _tokenizer.decode(generated[0], skip_special_tokens=True)
    return decoded.strip()


def is_local_model_available() -> bool:
    """
    Quick check: does the model directory exist?
    Does NOT load the model — use this for fast pre-checks.
    """
    return os.path.isdir(MODEL_DIR) and os.path.exists(
        os.path.join(MODEL_DIR, "reelix_metadata.json")
    )
