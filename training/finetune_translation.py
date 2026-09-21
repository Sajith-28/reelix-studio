"""
Reelix Studio — Translation Model Fine-Tuning (LoRA)

Fine-tunes a pre-trained Indic→English translation model on your custom
Tamil/Tanglish slang dataset using LoRA (Low-Rank Adaptation) for
parameter-efficient training.

Model priority:
  1. ai4bharat/indictrans2-indic-en-1B  (best for Tamil→English)
  2. facebook/nllb-200-distilled-600M    (fallback if #1 fails to load)

Usage:
    conda activate reelix-nlp
    python training/finetune_translation.py
    python training/finetune_translation.py --epochs 5 --batch-size 8 --lr 3e-4

CLI args:
    --epochs       Number of training epochs (default: 3)
    --batch-size   Per-device batch size (default: 4)
    --lr           Learning rate (default: 2e-4)
    --model        Override model name (optional)
    --dataset      Path to processed dataset (default: training/data/processed/translation)
    --output       Output directory for adapter (default: training/models/reelix-mt-final)
"""

import argparse
import os
import sys

import torch
from datasets import DatasetDict
from transformers import (
    AutoModelForSeq2SeqLM,
    AutoTokenizer,
    DataCollatorForSeq2Seq,
    Seq2SeqTrainer,
    Seq2SeqTrainingArguments,
)
from peft import LoraConfig, TaskType, get_peft_model, PeftModel


# ----- Model loading with fallback -----

PRIMARY_MODEL = "ai4bharat/indictrans2-indic-en-1B"
FALLBACK_MODEL = "facebook/nllb-200-distilled-600M"

# Source/target language codes differ by model
MODEL_LANG_CONFIG = {
    PRIMARY_MODEL: {
        "src_lang": "tam_Taml",  # IndicTrans2 language code for Tamil
        "tgt_lang": "eng_Latn",
    },
    FALLBACK_MODEL: {
        "src_lang": "tam_Taml",  # NLLB language code for Tamil
        "tgt_lang": "eng_Latn",
    },
}


def load_model_and_tokenizer(model_name: str | None = None):
    """
    Attempt to load the translation model and tokenizer.
    Tries PRIMARY_MODEL first, falls back to FALLBACK_MODEL on any error.
    Returns (model, tokenizer, model_name_used, lang_config).
    """
    candidates = [model_name] if model_name else [PRIMARY_MODEL, FALLBACK_MODEL]

    for name in candidates:
        try:
            print(f"🔄 Loading model: {name}")
            tokenizer = AutoTokenizer.from_pretrained(name, trust_remote_code=True)
            model = AutoModelForSeq2SeqLM.from_pretrained(
                name,
                trust_remote_code=True,
                torch_dtype=torch.float32,  # float32 for stable LoRA training
            )
            lang_config = MODEL_LANG_CONFIG.get(name, MODEL_LANG_CONFIG[FALLBACK_MODEL])
            print(f"✅ Loaded: {name}")
            return model, tokenizer, name, lang_config

        except Exception as e:
            print(f"⚠️  Failed to load {name}: {e}")
            if name == candidates[-1]:
                print(f"❌ All model candidates failed. Cannot proceed.")
                sys.exit(1)
            print(f"   Trying fallback...")

    # Should not reach here
    sys.exit(1)


# ----- Dataset tokenization -----

def build_tokenize_fn(tokenizer, lang_config, max_source_len=128, max_target_len=128):
    """
    Returns a function that tokenizes source→target pairs for seq2seq training.
    """
    def tokenize_fn(examples):
        # Set source language for tokenizer if supported
        if hasattr(tokenizer, "src_lang"):
            tokenizer.src_lang = lang_config["src_lang"]

        model_inputs = tokenizer(
            examples["source_text"],
            max_length=max_source_len,
            truncation=True,
            padding="max_length",
        )

        # Tokenize targets
        with tokenizer.as_target_tokenizer() if hasattr(tokenizer, "as_target_tokenizer") else _noop_ctx():
            if hasattr(tokenizer, "tgt_lang"):
                tokenizer.tgt_lang = lang_config["tgt_lang"]

            labels = tokenizer(
                examples["target_text"],
                max_length=max_target_len,
                truncation=True,
                padding="max_length",
            )

        # Replace padding token IDs in labels with -100 so they're ignored by loss
        label_ids = labels["input_ids"]
        if isinstance(label_ids[0], list):
            label_ids = [
                [(tok if tok != tokenizer.pad_token_id else -100) for tok in seq]
                for seq in label_ids
            ]
        model_inputs["labels"] = label_ids

        return model_inputs

    return tokenize_fn


class _noop_ctx:
    """No-op context manager for tokenizers without as_target_tokenizer()."""
    def __enter__(self):
        return self
    def __exit__(self, *args):
        pass


# ----- LoRA configuration -----

def apply_lora(model, rank=16, alpha=32, dropout=0.1):
    """
    Apply LoRA adapters to the model for parameter-efficient fine-tuning.
    Only trains ~0.5-2% of total parameters.
    """
    # Find target modules — common names across model architectures
    target_modules = []
    for name, _ in model.named_modules():
        # Target attention and dense projection layers
        if any(key in name.lower() for key in ["q_proj", "v_proj", "k_proj", "o_proj",
                                                  "query", "value", "key",
                                                  "wi", "wo", "dense"]):
            # Extract the module attribute name (last part)
            module_name = name.split(".")[-1]
            if module_name not in target_modules:
                target_modules.append(module_name)

    if not target_modules:
        # Absolute fallback — common module names
        target_modules = ["q_proj", "v_proj"]
        print(f"⚠️  Could not auto-detect target modules, using fallback: {target_modules}")
    else:
        # Deduplicate and limit
        target_modules = list(set(target_modules))[:8]
        print(f"🎯 LoRA target modules: {target_modules}")

    lora_config = LoraConfig(
        task_type=TaskType.SEQ_2_SEQ_LM,
        r=rank,
        lora_alpha=alpha,
        lora_dropout=dropout,
        target_modules=target_modules,
        bias="none",
    )

    model = get_peft_model(model, lora_config)
    model.print_trainable_parameters()

    return model


# ----- Main -----

def main():
    parser = argparse.ArgumentParser(
        description="Fine-tune translation model with LoRA for Reelix Studio"
    )
    parser.add_argument("--epochs", type=int, default=3, help="Number of training epochs (default: 3)")
    parser.add_argument("--batch-size", type=int, default=4, help="Per-device batch size (default: 4)")
    parser.add_argument("--lr", type=float, default=2e-4, help="Learning rate (default: 2e-4)")
    parser.add_argument("--model", type=str, default=None, help="Override model name (optional)")
    parser.add_argument(
        "--dataset",
        type=str,
        default=os.path.join("training", "data", "processed", "translation"),
        help="Path to processed HuggingFace dataset directory",
    )
    parser.add_argument(
        "--output",
        type=str,
        default=os.path.join("training", "models", "reelix-mt-final"),
        help="Output directory for fine-tuned adapter",
    )
    parser.add_argument("--lora-rank", type=int, default=16, help="LoRA rank (default: 16)")
    parser.add_argument("--lora-alpha", type=int, default=32, help="LoRA alpha (default: 32)")
    args = parser.parse_args()

    # ---- 1. Load dataset ----
    if not os.path.exists(args.dataset):
        print(f"❌ Processed dataset not found at: {args.dataset}")
        print("   Run `python training/prepare_translation_dataset.py` first.")
        sys.exit(1)

    print(f"📂 Loading processed dataset from: {args.dataset}")
    dataset = DatasetDict.load_from_disk(args.dataset)
    print(f"   Train: {len(dataset['train'])} samples")
    print(f"   Eval:  {len(dataset['eval'])} samples")

    # ---- 2. Load model & tokenizer ----
    model, tokenizer, model_name, lang_config = load_model_and_tokenizer(args.model)

    # ---- 3. Tokenize dataset ----
    print(f"🔤 Tokenizing dataset...")
    tokenize_fn = build_tokenize_fn(tokenizer, lang_config)
    tokenized = dataset.map(
        tokenize_fn,
        batched=True,
        remove_columns=dataset["train"].column_names,
        desc="Tokenizing",
    )

    # ---- 4. Apply LoRA ----
    print(f"🧬 Applying LoRA (rank={args.lora_rank}, alpha={args.lora_alpha})...")
    model = apply_lora(model, rank=args.lora_rank, alpha=args.lora_alpha)

    # ---- 5. Training setup ----
    checkpoint_dir = os.path.join(args.output, "checkpoints")
    training_args = Seq2SeqTrainingArguments(
        output_dir=checkpoint_dir,
        num_train_epochs=args.epochs,
        per_device_train_batch_size=args.batch_size,
        per_device_eval_batch_size=args.batch_size,
        learning_rate=args.lr,
        warmup_ratio=0.1,
        weight_decay=0.01,
        eval_strategy="epoch",
        save_strategy="epoch",
        save_total_limit=2,
        load_best_model_at_end=True,
        metric_for_best_model="eval_loss",
        greater_is_better=False,
        logging_steps=10,
        logging_first_step=True,
        fp16=torch.cuda.is_available(),  # Use fp16 on GPU, fp32 on CPU
        predict_with_generate=False,     # Faster training — generation done at eval time
        report_to="none",               # No wandb/tensorboard by default
        dataloader_pin_memory=True if torch.cuda.is_available() else False,
    )

    data_collator = DataCollatorForSeq2Seq(
        tokenizer=tokenizer,
        model=model,
        padding=True,
        label_pad_token_id=-100,
    )

    trainer = Seq2SeqTrainer(
        model=model,
        args=training_args,
        train_dataset=tokenized["train"],
        eval_dataset=tokenized["eval"],
        tokenizer=tokenizer,
        data_collator=data_collator,
    )

    # ---- 6. Train ----
    device = "GPU" if torch.cuda.is_available() else "CPU"
    print(f"\n🚀 Starting LoRA fine-tuning on {device}")
    print(f"   Base model: {model_name}")
    print(f"   Epochs: {args.epochs}")
    print(f"   Batch size: {args.batch_size}")
    print(f"   Learning rate: {args.lr}")
    print(f"   Output: {args.output}")
    print("=" * 60)

    trainer.train()

    # ---- 7. Save final adapter ----
    print(f"\n💾 Saving LoRA adapter to: {args.output}")
    os.makedirs(args.output, exist_ok=True)
    model.save_pretrained(args.output)
    tokenizer.save_pretrained(args.output)

    # Save metadata for later loading
    import json
    metadata = {
        "base_model": model_name,
        "lora_rank": args.lora_rank,
        "lora_alpha": args.lora_alpha,
        "epochs": args.epochs,
        "learning_rate": args.lr,
        "train_samples": len(dataset["train"]),
        "eval_samples": len(dataset["eval"]),
        "lang_config": lang_config,
    }
    with open(os.path.join(args.output, "reelix_metadata.json"), "w") as f:
        json.dump(metadata, f, indent=2)

    print(f"✅ Fine-tuning complete!")
    print(f"   Adapter saved to: {args.output}")
    print(f"   Run evaluation: python training/evaluate_translation.py")


if __name__ == "__main__":
    main()
