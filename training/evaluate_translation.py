"""
Reelix Studio — Translation Evaluation

Computes BLEU and chrF scores on the eval split, comparing:
  1. Fine-tuned local model output
  2. Groq Llama API output (if GROQ_API_KEY is set)
against the ground-truth target_text from your dataset.

Prints both scores side by side so you can decide whether the local
model is ready to replace or supplement Groq.

Usage:
    conda activate reelix-nlp
    python training/evaluate_translation.py

Optional args:
    --model-dir   Path to fine-tuned adapter (default: training/models/reelix-mt-final)
    --dataset     Path to processed dataset (default: training/data/processed/translation)
    --max-samples Limit eval samples for quick testing (default: all)

Requirements:
    - sacrebleu (for BLEU and chrF)
    - groq + python-dotenv (optional, for Groq comparison)
"""

import argparse
import json
import os
import sys
import time

import sacrebleu
import torch
from datasets import DatasetDict
from transformers import AutoModelForSeq2SeqLM, AutoTokenizer

# Optional: LoRA adapter loading
try:
    from peft import PeftModel
    HAS_PEFT = True
except ImportError:
    HAS_PEFT = False

# Optional: Groq API for comparison
try:
    from groq import Groq
    HAS_GROQ = True
except ImportError:
    HAS_GROQ = False

try:
    from dotenv import load_dotenv
    # Load .env from project root
    for env_path in [
        os.path.join(os.path.dirname(__file__), "..", ".env"),
        os.path.abspath(".env"),
    ]:
        if os.path.exists(env_path):
            load_dotenv(env_path, override=True)
            break
except ImportError:
    pass


# ----- Local model inference -----

def load_local_model(model_dir: str):
    """
    Load the fine-tuned LoRA adapter on top of the base model.
    Uses reelix_metadata.json to determine the base model name.
    """
    metadata_path = os.path.join(model_dir, "reelix_metadata.json")
    if not os.path.exists(metadata_path):
        print(f"❌ Metadata not found: {metadata_path}")
        print("   Was the model trained with finetune_translation.py?")
        sys.exit(1)

    with open(metadata_path, "r") as f:
        metadata = json.load(f)

    base_model_name = metadata["base_model"]
    lang_config = metadata.get("lang_config", {"src_lang": "tam_Taml", "tgt_lang": "eng_Latn"})

    print(f"🔄 Loading base model: {base_model_name}")
    tokenizer = AutoTokenizer.from_pretrained(base_model_name, trust_remote_code=True)
    base_model = AutoModelForSeq2SeqLM.from_pretrained(
        base_model_name,
        trust_remote_code=True,
        torch_dtype=torch.float32,
    )

    if HAS_PEFT:
        print(f"🔄 Loading LoRA adapter from: {model_dir}")
        model = PeftModel.from_pretrained(base_model, model_dir)
        model = model.merge_and_unload()  # Merge for faster inference
        print(f"✅ LoRA adapter merged into base model")
    else:
        print(f"⚠️  peft not installed — using base model without adapter")
        model = base_model

    model.eval()
    device = "cuda" if torch.cuda.is_available() else "cpu"
    model = model.to(device)

    return model, tokenizer, lang_config, device


def translate_local(model, tokenizer, texts: list[str], lang_config: dict, device: str,
                    max_length: int = 128) -> list[str]:
    """
    Translate a batch of source texts using the local fine-tuned model.
    """
    if hasattr(tokenizer, "src_lang"):
        tokenizer.src_lang = lang_config["src_lang"]

    translations = []
    for text in texts:
        inputs = tokenizer(text, return_tensors="pt", max_length=max_length, truncation=True)
        inputs = {k: v.to(device) for k, v in inputs.items()}

        with torch.no_grad():
            generated = model.generate(
                **inputs,
                max_new_tokens=max_length,
                num_beams=4,
                early_stopping=True,
            )

        decoded = tokenizer.decode(generated[0], skip_special_tokens=True)
        translations.append(decoded.strip())

    return translations


# ----- Groq API inference -----

GROQ_MODELS = [
    "openai/gpt-oss-120b",
    "openai/gpt-oss-20b",
    "qwen/qwen3.6-27b",
    "llama-3.3-70b-versatile",
    "llama-3.1-8b-instant",
]


def translate_groq(texts: list[str], source_lang: str = "Tamil") -> list[str]:
    """
    Translate texts using the Groq API (same model fallback chain as the backend).
    Returns list of translated strings, or None if Groq is unavailable.
    """
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key or not HAS_GROQ:
        return None

    client = Groq(api_key=api_key)

    # Select best available model
    selected_model = GROQ_MODELS[-1]  # fallback
    try:
        remote_models = {m.id for m in client.models.list().data}
        for candidate in GROQ_MODELS:
            if candidate in remote_models:
                selected_model = candidate
                break
    except Exception:
        pass

    print(f"   Groq model: {selected_model}")

    translations = []
    for i, text in enumerate(texts):
        try:
            response = client.chat.completions.create(
                model=selected_model,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            f"You are a translation engine. Translate the following {source_lang} "
                            f"text into natural, idiomatic English. Return ONLY the English translation, "
                            f"nothing else. No quotes, no explanation."
                        ),
                    },
                    {"role": "user", "content": text},
                ],
                temperature=0.1,
                max_tokens=256,
            )
            translated = response.choices[0].message.content.strip()
            translations.append(translated)
        except Exception as e:
            print(f"   ⚠️  Groq error on sample {i}: {e}")
            translations.append("")

        # Rate limiting — small delay between requests
        if i < len(texts) - 1:
            time.sleep(0.5)

    return translations


# ----- Scoring -----

def compute_scores(predictions: list[str], references: list[str]) -> dict:
    """Compute BLEU and chrF scores using sacrebleu."""
    bleu = sacrebleu.corpus_bleu(predictions, [references])
    chrf = sacrebleu.corpus_chrf(predictions, [references])

    return {
        "BLEU": round(bleu.score, 2),
        "chrF": round(chrf.score, 2),
    }


# ----- Main -----

def main():
    parser = argparse.ArgumentParser(
        description="Evaluate fine-tuned translation model vs Groq Llama"
    )
    parser.add_argument(
        "--model-dir",
        type=str,
        default=os.path.join("training", "models", "reelix-mt-final"),
        help="Path to fine-tuned adapter directory",
    )
    parser.add_argument(
        "--dataset",
        type=str,
        default=os.path.join("training", "data", "processed", "translation"),
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

    sources = eval_data["source_text"]
    references = eval_data["target_text"]
    print(f"📊 Evaluating on {len(sources)} samples\n")

    # ---- 2. Local model predictions ----
    results = {}

    if os.path.exists(args.model_dir):
        print("━" * 60)
        print("🏠 LOCAL FINE-TUNED MODEL")
        print("━" * 60)
        model, tokenizer, lang_config, device = load_local_model(args.model_dir)

        print(f"🔄 Generating translations...")
        start = time.time()
        local_preds = translate_local(model, tokenizer, sources, lang_config, device)
        elapsed = time.time() - start

        results["Local Model"] = compute_scores(local_preds, references)
        results["Local Model"]["time_sec"] = round(elapsed, 1)

        # Show a few examples
        print(f"\n📝 Sample outputs (first 3):")
        for i in range(min(3, len(sources))):
            print(f"   Source:    {sources[i]}")
            print(f"   Local:    {local_preds[i]}")
            print(f"   Expected: {references[i]}")
            print()
    else:
        print(f"⚠️  Local model not found at {args.model_dir} — skipping")
        local_preds = None

    # ---- 3. Groq API predictions ----
    print("━" * 60)
    print("☁️  GROQ API (Llama)")
    print("━" * 60)

    if not HAS_GROQ:
        print("⚠️  `groq` package not installed — skipping Groq comparison")
        print("   Install with: pip install groq python-dotenv")
        groq_preds = None
    elif not os.getenv("GROQ_API_KEY"):
        print("⚠️  GROQ_API_KEY not set — skipping Groq comparison")
        groq_preds = None
    else:
        print(f"🔄 Querying Groq API for {len(sources)} translations...")
        start = time.time()
        groq_preds = translate_groq(sources)
        elapsed = time.time() - start

        if groq_preds:
            results["Groq Llama"] = compute_scores(groq_preds, references)
            results["Groq Llama"]["time_sec"] = round(elapsed, 1)

            # Show same samples
            print(f"\n📝 Sample outputs (first 3):")
            for i in range(min(3, len(sources))):
                print(f"   Source:    {sources[i]}")
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
    print(f"{'Model':<20} {'BLEU':>8} {'chrF':>8} {'Time (s)':>10}")
    print("-" * 50)

    for model_name, scores in results.items():
        print(f"{model_name:<20} {scores['BLEU']:>8.2f} {scores['chrF']:>8.2f} {scores['time_sec']:>10.1f}")

    print("-" * 50)

    # Verdict
    if len(results) == 2:
        local_bleu = results.get("Local Model", {}).get("BLEU", 0)
        groq_bleu = results.get("Groq Llama", {}).get("BLEU", 0)

        if local_bleu > groq_bleu:
            diff = local_bleu - groq_bleu
            print(f"\n✅ Local model wins by +{diff:.2f} BLEU points!")
            print("   → Safe to use as primary with Groq fallback.")
        elif groq_bleu > local_bleu:
            diff = groq_bleu - local_bleu
            print(f"\n☁️  Groq leads by +{diff:.2f} BLEU points.")
            print("   → Consider adding more training data or increasing epochs.")
        else:
            print(f"\n🤝 Tied! Both produce similar quality.")

    print()


if __name__ == "__main__":
    main()
