"""
Reelix Studio — Speech Dataset Preparation

Loads speech_manifest.csv (audio_path, transcript columns),
validates that audio files exist, resamples to 16kHz via librosa,
splits into 90% train / 10% eval, and saves as a HuggingFace
DatasetDict to training/data/processed/speech/.

Usage:
    conda activate reelix-nlp
    python training/prepare_speech_dataset.py

Optional args:
    --input   Path to input CSV (default: training/data/speech_manifest.csv)
    --output  Output directory  (default: training/data/processed/speech)
    --seed    Random seed for reproducible splits (default: 42)
    --sr      Target sample rate in Hz (default: 16000)
"""

import argparse
import csv
import os
import sys

import librosa
import numpy as np
import soundfile as sf
from datasets import Audio, Dataset, DatasetDict


TARGET_SR = 16000  # Whisper expects 16kHz


def load_speech_manifest(csv_path: str, data_dir: str) -> list[dict]:
    """
    Load the speech manifest CSV, skipping comment lines.
    Resolves audio_path relative to the data_dir.
    Returns list of dicts with keys: audio_path (absolute), transcript.
    """
    if not os.path.exists(csv_path):
        print(f"❌ Manifest CSV not found: {csv_path}")
        print("   Create it first — see training/data/README.md for the format.")
        sys.exit(1)

    rows = []
    skipped = 0

    with open(csv_path, "r", encoding="utf-8") as f:
        lines = [line for line in f if not line.strip().startswith("#")]

    if not lines:
        print(f"❌ Manifest CSV is empty: {csv_path}")
        sys.exit(1)

    reader = csv.DictReader(lines)

    if not reader.fieldnames or "audio_path" not in reader.fieldnames or "transcript" not in reader.fieldnames:
        print(f"❌ CSV must have columns: audio_path, transcript")
        print(f"   Found columns: {reader.fieldnames}")
        sys.exit(1)

    for i, row in enumerate(reader):
        audio_rel = row.get("audio_path", "").strip()
        transcript = row.get("transcript", "").strip()

        if not audio_rel or not transcript:
            print(f"⚠️  Skipping row {i + 2} (empty audio_path or transcript)")
            skipped += 1
            continue

        # Resolve path relative to the data directory
        audio_abs = os.path.abspath(os.path.join(data_dir, audio_rel))

        if not os.path.exists(audio_abs):
            print(f"⚠️  Skipping row {i + 2}: audio file not found: {audio_abs}")
            skipped += 1
            continue

        rows.append({
            "audio_path": audio_abs,
            "transcript": transcript,
        })

    if skipped:
        print(f"⚠️  Skipped {skipped} rows due to missing files or empty fields")

    return rows


def validate_and_resample_audio(audio_path: str, target_sr: int) -> tuple[np.ndarray, int]:
    """
    Load audio file via librosa, resample to target_sr if needed.
    Returns (audio_array, sample_rate).
    """
    try:
        audio, sr = librosa.load(audio_path, sr=target_sr, mono=True)
        return audio, sr
    except Exception as e:
        print(f"❌ Failed to load audio {audio_path}: {e}")
        return None, None


def main():
    parser = argparse.ArgumentParser(
        description="Prepare speech dataset for Reelix Whisper fine-tuning"
    )
    parser.add_argument(
        "--input",
        type=str,
        default=os.path.join("training", "data", "speech_manifest.csv"),
        help="Path to input manifest CSV (default: training/data/speech_manifest.csv)",
    )
    parser.add_argument(
        "--output",
        type=str,
        default=os.path.join("training", "data", "processed", "speech"),
        help="Output directory for HuggingFace dataset (default: training/data/processed/speech)",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=42,
        help="Random seed for train/eval split (default: 42)",
    )
    parser.add_argument(
        "--sr",
        type=int,
        default=TARGET_SR,
        help=f"Target sample rate in Hz (default: {TARGET_SR})",
    )
    args = parser.parse_args()

    data_dir = os.path.dirname(os.path.abspath(args.input))

    print(f"📂 Loading speech manifest from: {args.input}")
    rows = load_speech_manifest(args.input, data_dir)

    if len(rows) < 2:
        print(f"❌ Need at least 2 audio samples, found {len(rows)}")
        print("   Add more rows to your CSV — see training/data/README.md")
        sys.exit(1)

    print(f"✅ Found {len(rows)} valid audio entries")

    # Validate all audio files can be loaded
    print(f"🔊 Validating and resampling audio to {args.sr}Hz...")
    valid_rows = []
    for i, row in enumerate(rows):
        audio, sr = validate_and_resample_audio(row["audio_path"], args.sr)
        if audio is not None:
            valid_rows.append({
                "audio": row["audio_path"],  # HuggingFace Audio feature will load this
                "transcript": row["transcript"],
            })
            if (i + 1) % 50 == 0:
                print(f"   Validated {i + 1}/{len(rows)} clips...")

    if len(valid_rows) < 2:
        print(f"❌ Only {len(valid_rows)} valid audio clips after validation. Need at least 2.")
        sys.exit(1)

    print(f"✅ {len(valid_rows)} audio clips validated successfully")

    # Create HuggingFace Dataset with Audio feature
    full_dataset = Dataset.from_list(valid_rows)
    full_dataset = full_dataset.cast_column("audio", Audio(sampling_rate=args.sr))

    # Split 90/10
    split = full_dataset.train_test_split(test_size=0.1, seed=args.seed)

    dataset_dict = DatasetDict({
        "train": split["train"],
        "eval": split["test"],
    })

    print(f"📊 Split: {len(dataset_dict['train'])} train / {len(dataset_dict['eval'])} eval")

    # Show a sample
    if len(dataset_dict["train"]) > 0:
        sample = dataset_dict["train"][0]
        print(f"\n📝 Sample training entry:")
        print(f"   Transcript: {sample['transcript']}")
        audio_info = sample["audio"]
        print(f"   Audio: {audio_info['path']}, {audio_info['sampling_rate']}Hz, "
              f"{len(audio_info['array']) / audio_info['sampling_rate']:.1f}s duration")

    # Save to disk
    os.makedirs(args.output, exist_ok=True)
    dataset_dict.save_to_disk(args.output)

    print(f"\n💾 Dataset saved to: {args.output}")
    print(f"   Ready for fine-tuning with: python training/finetune_whisper.py")


if __name__ == "__main__":
    main()
