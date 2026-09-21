"""
Reelix Studio — Whisper STT Fine-Tuning

Fine-tunes openai/whisper-small on your custom Tamil/Tanglish speech data
so Whisper better recognizes your speakers' accents, code-switching, and
domain-specific vocabulary.

Usage:
    conda activate reelix-nlp
    python training/finetune_whisper.py
    python training/finetune_whisper.py --epochs 5 --batch-size 8 --lr 1e-5

CLI args:
    --epochs       Number of training epochs (default: 5)
    --batch-size   Per-device batch size (default: 8)
    --lr           Learning rate (default: 1e-5)
    --model        Override model name (default: openai/whisper-small)
    --dataset      Path to processed dataset (default: training/data/processed/speech)
    --output       Output directory (default: training/models/reelix-stt-final)
    --language     Whisper language code (default: ta for Tamil)
"""

import argparse
import json
import os
import sys
from dataclasses import dataclass
from typing import Any

import torch
import numpy as np
from datasets import DatasetDict
from transformers import (
    WhisperForConditionalGeneration,
    WhisperProcessor,
    WhisperTokenizer,
    WhisperFeatureExtractor,
    Seq2SeqTrainer,
    Seq2SeqTrainingArguments,
)


WHISPER_MODEL = "openai/whisper-small"
SAMPLE_RATE = 16000


# ----- Data collator for speech -----

@dataclass
class DataCollatorSpeechSeq2Seq:
    """
    Custom data collator for Whisper fine-tuning.
    Pads audio features and labels to batch max length.
    """
    processor: Any
    decoder_start_token_id: int

    def __call__(self, features: list[dict]) -> dict:
        # Separate audio inputs and text labels
        input_features = [{"input_features": f["input_features"]} for f in features]
        label_features = [{"input_ids": f["labels"]} for f in features]

        # Pad audio features
        batch = self.processor.feature_extractor.pad(
            input_features,
            return_tensors="pt",
        )

        # Pad labels
        labels_batch = self.processor.tokenizer.pad(
            label_features,
            return_tensors="pt",
        )

        # Replace padding with -100 so loss ignores them
        labels = labels_batch["input_ids"].masked_fill(
            labels_batch.attention_mask.ne(1), -100
        )

        # Remove BOS token if the model prepends it automatically
        if (labels[:, 0] == self.decoder_start_token_id).all().cpu().item():
            labels = labels[:, 1:]

        batch["labels"] = labels

        return batch


# ----- Dataset preparation -----

def build_prepare_fn(processor, language="ta"):
    """
    Returns a function that processes audio samples into Whisper input features
    and tokenizes transcripts into label IDs.
    """
    def prepare_fn(examples):
        audio = examples["audio"]

        # Extract mel spectrogram features
        input_features = processor.feature_extractor(
            audio["array"],
            sampling_rate=audio["sampling_rate"],
            return_tensors="np",
        ).input_features[0]

        # Tokenize transcript
        # Set language and task for proper special tokens
        tokenizer = processor.tokenizer
        tokenizer.set_prefix_tokens(language=language, task="transcribe")

        labels = tokenizer(
            examples["transcript"],
            return_tensors="np",
        ).input_ids[0]

        examples["input_features"] = input_features
        examples["labels"] = labels.tolist()

        return examples

    return prepare_fn


# ----- Main -----

def main():
    parser = argparse.ArgumentParser(
        description="Fine-tune Whisper for Reelix Studio Tamil/Tanglish STT"
    )
    parser.add_argument("--epochs", type=int, default=5, help="Number of training epochs (default: 5)")
    parser.add_argument("--batch-size", type=int, default=8, help="Per-device batch size (default: 8)")
    parser.add_argument("--lr", type=float, default=1e-5, help="Learning rate (default: 1e-5)")
    parser.add_argument("--model", type=str, default=WHISPER_MODEL, help=f"Whisper model name (default: {WHISPER_MODEL})")
    parser.add_argument(
        "--dataset",
        type=str,
        default=os.path.join("training", "data", "processed", "speech"),
        help="Path to processed HuggingFace dataset directory",
    )
    parser.add_argument(
        "--output",
        type=str,
        default=os.path.join("training", "models", "reelix-stt-final"),
        help="Output directory for fine-tuned model",
    )
    parser.add_argument("--language", type=str, default="ta", help="Whisper language code (default: ta)")
    parser.add_argument("--gradient-accum", type=int, default=2, help="Gradient accumulation steps (default: 2)")
    args = parser.parse_args()

    # ---- 1. Load dataset ----
    if not os.path.exists(args.dataset):
        print(f"❌ Processed dataset not found at: {args.dataset}")
        print("   Run `python training/prepare_speech_dataset.py` first.")
        sys.exit(1)

    print(f"📂 Loading processed speech dataset from: {args.dataset}")
    dataset = DatasetDict.load_from_disk(args.dataset)
    print(f"   Train: {len(dataset['train'])} samples")
    print(f"   Eval:  {len(dataset['eval'])} samples")

    # ---- 2. Load Whisper model & processor ----
    print(f"🔄 Loading Whisper model: {args.model}")
    try:
        processor = WhisperProcessor.from_pretrained(args.model)
        model = WhisperForConditionalGeneration.from_pretrained(args.model)
    except Exception as e:
        print(f"❌ Failed to load Whisper model '{args.model}': {e}")
        sys.exit(1)

    print(f"✅ Loaded: {args.model}")

    # Configure model for training
    model.config.forced_decoder_ids = None
    model.config.suppress_tokens = []
    model.config.use_cache = False  # Required for gradient checkpointing

    # Enable gradient checkpointing for memory efficiency
    if torch.cuda.is_available():
        model.gradient_checkpointing_enable()

    # ---- 3. Process dataset ----
    print(f"🔊 Processing audio features and tokenizing transcripts...")
    prepare_fn = build_prepare_fn(processor, language=args.language)

    processed = dataset.map(
        prepare_fn,
        remove_columns=dataset["train"].column_names,
        desc="Processing audio",
    )

    # ---- 4. Training setup ----
    checkpoint_dir = os.path.join(args.output, "checkpoints")
    training_args = Seq2SeqTrainingArguments(
        output_dir=checkpoint_dir,
        num_train_epochs=args.epochs,
        per_device_train_batch_size=args.batch_size,
        per_device_eval_batch_size=args.batch_size,
        gradient_accumulation_steps=args.gradient_accum,
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
        fp16=torch.cuda.is_available(),
        predict_with_generate=False,
        report_to="none",
        dataloader_pin_memory=True if torch.cuda.is_available() else False,
        remove_unused_columns=False,  # Keep input_features and labels
    )

    data_collator = DataCollatorSpeechSeq2Seq(
        processor=processor,
        decoder_start_token_id=model.config.decoder_start_token_id,
    )

    trainer = Seq2SeqTrainer(
        model=model,
        args=training_args,
        train_dataset=processed["train"],
        eval_dataset=processed["eval"],
        tokenizer=processor.feature_extractor,
        data_collator=data_collator,
    )

    # ---- 5. Train ----
    device = "GPU" if torch.cuda.is_available() else "CPU"
    print(f"\n🚀 Starting Whisper fine-tuning on {device}")
    print(f"   Model: {args.model}")
    print(f"   Language: {args.language}")
    print(f"   Epochs: {args.epochs}")
    print(f"   Batch size: {args.batch_size} (x{args.gradient_accum} gradient accum)")
    print(f"   Effective batch: {args.batch_size * args.gradient_accum}")
    print(f"   Learning rate: {args.lr}")
    print(f"   Output: {args.output}")
    print("=" * 60)

    trainer.train()

    # ---- 6. Save final model ----
    print(f"\n💾 Saving fine-tuned model to: {args.output}")
    os.makedirs(args.output, exist_ok=True)
    trainer.save_model(args.output)
    processor.save_pretrained(args.output)

    # Save metadata
    metadata = {
        "base_model": args.model,
        "language": args.language,
        "epochs": args.epochs,
        "learning_rate": args.lr,
        "batch_size": args.batch_size,
        "gradient_accumulation": args.gradient_accum,
        "train_samples": len(dataset["train"]),
        "eval_samples": len(dataset["eval"]),
    }
    with open(os.path.join(args.output, "reelix_metadata.json"), "w") as f:
        json.dump(metadata, f, indent=2)

    print(f"✅ Whisper fine-tuning complete!")
    print(f"   Model saved to: {args.output}")
    print(f"   Run evaluation: python training/evaluate_whisper.py")


if __name__ == "__main__":
    main()
