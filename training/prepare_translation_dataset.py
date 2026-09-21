"""
Reelix Studio — Translation & Transliteration Dataset Preparation

Supports:
  1. Multi-column master datasets (source_text, english_caption, tanglish_caption)
  2. Standard pair datasets (source_text, target_text)

Allows training for either:
  - Tamil -> English captions (--target-column english_caption)
  - Tamil -> Tanglish captions (--target-column tanglish_caption)

Usage:
    conda activate reelix-nlp

    # For Tamil -> Tanglish:
    python training/prepare_translation_dataset.py --input training/data/master_multidomain_dataset.csv --target-column tanglish_caption

    # For Tamil -> English:
    python training/prepare_translation_dataset.py --input training/data/master_multidomain_dataset.csv --target-column english_caption
"""

import argparse
import csv
import os
import sys

from datasets import Dataset, DatasetDict


def load_dataset_rows(csv_path: str, target_col: str) -> list[dict]:
    if not os.path.exists(csv_path):
        print(f"❌ CSV file not found: {csv_path}")
        sys.exit(1)

    rows = []
    with open(csv_path, "r", encoding="utf-8") as f:
        lines = [line for line in f if not line.strip().startswith("#")]

    if not lines:
        print(f"❌ CSV file is empty: {csv_path}")
        sys.exit(1)

    reader = csv.DictReader(lines)
    fieldnames = [fn.strip() for fn in (reader.fieldnames or [])]

    # Resolve target column name
    resolved_target = None
    if target_col in fieldnames:
        resolved_target = target_col
    elif "target_text" in fieldnames:
        resolved_target = "target_text"
    elif "tanglish_caption" in fieldnames:
        resolved_target = "tanglish_caption"
    elif "english_caption" in fieldnames:
        resolved_target = "english_caption"

    if not resolved_target or "source_text" not in fieldnames:
        print(f"❌ Could not find suitable columns in CSV: {fieldnames}")
        print(f"   Required: 'source_text' and '{target_col}' (or 'target_text')")
        sys.exit(1)

    print(f"🎯 Using mapping: 'source_text' ➔ '{resolved_target}'")

    for i, row in enumerate(reader):
        source = row.get("source_text", "").strip()
        target = row.get(resolved_target, "").strip()

        if not source or not target:
            continue

        rows.append({"source_text": source, "target_text": target})

    return rows


def main():
    parser = argparse.ArgumentParser(description="Prepare dataset for Reelix Translation/Transliteration")
    parser.add_argument(
        "--input",
        type=str,
        default=os.path.join("training", "data", "master_multidomain_dataset.csv"),
        help="Path to input CSV file",
    )
    parser.add_argument(
        "--target-column",
        type=str,
        default="tanglish_caption",
        choices=["tanglish_caption", "english_caption", "target_text"],
        help="Which target column to train for: 'tanglish_caption' or 'english_caption'",
    )
    parser.add_argument(
        "--output",
        type=str,
        default=os.path.join("training", "data", "processed", "translation"),
        help="Output directory for HuggingFace dataset",
    )
    parser.add_argument("--seed", type=int, default=42, help="Random seed for train/eval split")
    args = parser.parse_args()

    print(f"📂 Loading data from: {args.input}")
    rows = load_dataset_rows(args.input, args.target_column)

    if len(rows) < 2:
        print(f"❌ Need at least 2 pairs, found {len(rows)}")
        sys.exit(1)

    print(f"✅ Loaded {len(rows)} high-quality training pairs")

    full_dataset = Dataset.from_list(rows)
    split = full_dataset.train_test_split(test_size=0.1, seed=args.seed)

    dataset_dict = DatasetDict({
        "train": split["train"],
        "eval": split["test"],
    })

    print(f"📊 Split: {len(dataset_dict['train'])} train / {len(dataset_dict['eval'])} eval")

    # Sample preview
    sample = dataset_dict["train"][0]
    print(f"\n📝 Sample pair:")
    print(f"   Source (Tamil):  {sample['source_text']}")
    print(f"   Target:          {sample['target_text']}")

    os.makedirs(args.output, exist_ok=True)
    dataset_dict.save_to_disk(args.output)
    print(f"\n💾 Saved to: {args.output}")
    print(f"🚀 Ready to train: python training/finetune_translation.py")


if __name__ == "__main__":
    main()
