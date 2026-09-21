"""
Reelix Studio — Whisper STT Evaluation

Computes Word Error Rate (WER) on the eval split, comparing:
  1. Fine-tuned local Whisper model output
  2. Groq Whisper Large-V3 API output (if GROQ_API_KEY is set)
against the ground-truth transcripts from your dataset.

Prints both WER scores side by side so you can decide whether the local
model is ready to supplement Groq.

Usage:
    conda activate reelix-nlp
    python training/evaluate_whisper.py

Optional args:
    --model-dir   Path to fine-tuned Whisper model (default: training/models/reelix-stt-final)
    --dataset     Path to processed dataset (default: training/data/processed/speech)
    --max-samples Limit eval samples for quick testing (default: all)

Requirements:
    - jiwer (for WER)
    - groq + python-dotenv (optional, for Groq comparison)
"""

import argparse
import json
import os
import sys
import tempfile
import time

import jiwer
import numpy as np
import soundfile as sf
import torch
from datasets import DatasetDict
from transformers import WhisperForConditionalGeneration, WhisperProcessor

# Optional: Groq API for comparison
try:
    from groq import Groq
    HAS_GROQ = True
except ImportError:
    HAS_GROQ = False

try:
    from dotenv import load_dotenv
    for env_path in [
        os.path.join(os.path.dirname(__file__), "..", ".env"),
        os.path.abspath(".env"),
    ]:
        if os.path.exists(env_path):
            load_dotenv(env_path, override=True)
            break
except ImportError:
    pass


SAMPLE_RATE = 16000


# ----- Local Whisper inference -----

def load_local_whisper(model_dir: str):
    """Load the fine-tuned Whisper model and processor."""
    print(f"🔄 Loading fine-tuned Whisper from: {model_dir}")
    processor = WhisperProcessor.from_pretrained(model_dir)
    model = WhisperForConditionalGeneration.from_pretrained(model_dir)

    # Load metadata for language config
    metadata_path = os.path.join(model_dir, "reelix_metadata.json")
    language = "ta"
    if os.path.exists(metadata_path):
        with open(metadata_path, "r") as f:
            metadata = json.load(f)
            language = metadata.get("language", "ta")

    model.eval()
    device = "cuda" if torch.cuda.is_available() else "cpu"
    model = model.to(device)

    print(f"✅ Loaded fine-tuned Whisper (language={language}, device={device})")
    return model, processor, language, device


def transcribe_local(model, processor, audio_samples: list[dict], language: str,
                     device: str) -> list[str]:
    """
    Transcribe audio samples using the local fine-tuned Whisper model.
    Each audio_sample is a dict with 'array' and 'sampling_rate' keys.
    """
    transcriptions = []

    for sample in audio_samples:
        audio_array = np.array(sample["array"], dtype=np.float32)
        sr = sample["sampling_rate"]

        input_features = processor.feature_extractor(
            audio_array,
            sampling_rate=sr,
            return_tensors="pt",
        ).input_features.to(device)

        # Set language and task
        forced_decoder_ids = processor.get_decoder_prompt_ids(
            language=language,
            task="transcribe",
        )

        with torch.no_grad():
            predicted_ids = model.generate(
                input_features,
                forced_decoder_ids=forced_decoder_ids,
                max_new_tokens=256,
            )

        text = processor.batch_decode(predicted_ids, skip_special_tokens=True)[0]
        transcriptions.append(text.strip())

    return transcriptions


# ----- Groq Whisper inference -----

def transcribe_groq(audio_samples: list[dict]) -> list[str] | None:
    """
    Transcribe audio samples using the Groq Whisper API.
    Returns list of transcriptions, or None if Groq is unavailable.
    """
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key or not HAS_GROQ:
        return None

    client = Groq(api_key=api_key)
    transcriptions = []

    for i, sample in enumerate(audio_samples):
        try:
            audio_array = np.array(sample["array"], dtype=np.float32)
            sr = sample["sampling_rate"]

            # Write to a temporary WAV file for the API
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
                sf.write(tmp.name, audio_array, sr, format="WAV", subtype="PCM_16")
                tmp_path = tmp.name

            try:
                with open(tmp_path, "rb") as f:
                    response = client.audio.transcriptions.create(
                        file=(os.path.basename(tmp_path), f.read()),
                        model="whisper-large-v3",
                        response_format="text",
                        language="ta",
                        temperature=0.0,
                    )

                # response is the transcribed text string in text mode
                text = str(response).strip()
                transcriptions.append(text)

            finally:
                os.unlink(tmp_path)

        except Exception as e:
            print(f"   ⚠️  Groq error on sample {i}: {e}")
            transcriptions.append("")

        # Rate limiting
        if i < len(audio_samples) - 1:
            time.sleep(1.0)

    return transcriptions


# ----- Scoring -----

def compute_wer(predictions: list[str], references: list[str]) -> dict:
    """Compute Word Error Rate using jiwer."""
    # Filter out empty pairs
    valid_preds = []
    valid_refs = []
    for p, r in zip(predictions, references):
        if r.strip():  # Skip empty references
            valid_preds.append(p if p.strip() else "<empty>")
            valid_refs.append(r)

    if not valid_refs:
        return {"WER": 100.0, "valid_samples": 0}

    wer_score = jiwer.wer(valid_refs, valid_preds)

    # Also compute character error rate for code-switched text
    cer_score = jiwer.cer(valid_refs, valid_preds)

    return {
        "WER": round(wer_score * 100, 2),
        "CER": round(cer_score * 100, 2),
        "valid_samples": len(valid_refs),
    }


# ----- Main -----

def main():
    parser = argparse.ArgumentParser(
        description="Evaluate fine-tuned Whisper vs Groq Whisper"
    )
    parser.add_argument(
        "--model-dir",
        type=str,
        default=os.path.join("training", "models", "reelix-stt-final"),
        help="Path to fine-tuned Whisper model directory",
    )
    parser.add_argument(
        "--dataset",
        type=str,
        default=os.path.join("training", "data", "processed", "speech"),
        help="Path to processed HuggingFace dataset",
    )
    parser.add_argument(
        "--max-samples",
        type=int,
        default=None,
        help="Limit number of eval samples (default: use all)",
    )
    args = parser.parse_args()

    # ---- 1. Load eval dataset ----
    if not os.path.exists(args.dataset):
        print(f"❌ Dataset not found: {args.dataset}")
        sys.exit(1)

    dataset = DatasetDict.load_from_disk(args.dataset)
    eval_data = dataset["eval"]

    if args.max_samples and args.max_samples < len(eval_data):
        eval_data = eval_data.select(range(args.max_samples))

    references = eval_data["transcript"]
    audio_samples = eval_data["audio"]
    print(f"📊 Evaluating on {len(references)} audio samples\n")

    results = {}

    # ---- 2. Local model predictions ----
    if os.path.exists(args.model_dir):
        print("━" * 60)
        print("🏠 LOCAL FINE-TUNED WHISPER")
        print("━" * 60)

        model, processor, language, device = load_local_whisper(args.model_dir)

        print(f"🔄 Transcribing {len(audio_samples)} audio samples...")
        start = time.time()
        local_preds = transcribe_local(model, processor, audio_samples, language, device)
        elapsed = time.time() - start

        scores = compute_wer(local_preds, references)
        scores["time_sec"] = round(elapsed, 1)
        results["Local Whisper"] = scores

        # Show samples
        print(f"\n📝 Sample outputs (first 3):")
        for i in range(min(3, len(references))):
            print(f"   Local:    {local_preds[i]}")
            print(f"   Expected: {references[i]}")
            print()
    else:
        print(f"⚠️  Local model not found at {args.model_dir} — skipping")
        local_preds = None

    # ---- 3. Groq API predictions ----
    print("━" * 60)
    print("☁️  GROQ WHISPER LARGE-V3")
    print("━" * 60)

    if not HAS_GROQ:
        print("⚠️  `groq` package not installed — skipping Groq comparison")
        print("   Install with: pip install groq python-dotenv")
        groq_preds = None
    elif not os.getenv("GROQ_API_KEY"):
        print("⚠️  GROQ_API_KEY not set — skipping Groq comparison")
        groq_preds = None
    else:
        print(f"🔄 Querying Groq Whisper API for {len(audio_samples)} samples...")
        start = time.time()
        groq_preds = transcribe_groq(audio_samples)
        elapsed = time.time() - start

        if groq_preds:
            scores = compute_wer(groq_preds, references)
            scores["time_sec"] = round(elapsed, 1)
            results["Groq Whisper"] = scores

            print(f"\n📝 Sample outputs (first 3):")
            for i in range(min(3, len(references))):
                print(f"   Groq:     {groq_preds[i]}")
                print(f"   Expected: {references[i]}")
                print()

    # ---- 4. Print comparison table ----
    print("\n" + "=" * 60)
    print("📊 RESULTS COMPARISON")
    print("=" * 60)

    if not results:
        print("No results to compare — ensure at least one model is available.")
        sys.exit(1)

    # Header
    print(f"{'Model':<20} {'WER %':>8} {'CER %':>8} {'Samples':>9} {'Time (s)':>10}")
    print("-" * 58)

    for model_name, scores in results.items():
        print(
            f"{model_name:<20} "
            f"{scores['WER']:>8.2f} "
            f"{scores['CER']:>8.2f} "
            f"{scores['valid_samples']:>9} "
            f"{scores['time_sec']:>10.1f}"
        )

    print("-" * 58)

    # Verdict
    if len(results) == 2:
        local_wer = results.get("Local Whisper", {}).get("WER", 100)
        groq_wer = results.get("Groq Whisper", {}).get("WER", 100)

        if local_wer < groq_wer:
            diff = groq_wer - local_wer
            print(f"\n✅ Local Whisper wins by -{diff:.2f}% WER!")
            print("   → Safe to use as primary with Groq fallback.")
        elif groq_wer < local_wer:
            diff = local_wer - groq_wer
            print(f"\n☁️  Groq leads by -{diff:.2f}% WER.")
            print("   → Consider adding more speech data or increasing epochs.")
        else:
            print(f"\n🤝 Tied! Both produce similar accuracy.")

    # Note about CER
    print("\n💡 CER (Character Error Rate) is often more meaningful for code-switched")
    print("   Tamil/English text than WER, since word boundaries differ across scripts.\n")


if __name__ == "__main__":
    main()
