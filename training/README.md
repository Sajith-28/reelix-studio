# Reelix Studio — Custom Model Training Pipeline

Fine-tune your own Tamil/Tanglish → English translation model and Whisper STT model
on domain-specific slang, idioms, and speech patterns, so Reelix Studio can produce
more native, precise subtitles without relying solely on the Groq API.

> **This directory is completely isolated from the running app.**
> Nothing here is imported by `backend/` or `frontend/`.
> The Groq-based pipeline keeps working at every step — the local model
> is added as an optional, higher-priority path with automatic fallback.

---

## 1. Create the Conda Environment

```bash
# Create a dedicated Python 3.10 environment (keeps backend deps untouched)
conda create -n reelix-nlp python=3.10 -y

# Activate it
conda activate reelix-nlp

# Install training dependencies
pip install -r requirements-training.txt
```

> **Why a separate env?** The backend runs on `fastapi`, `groq`, etc. with
> lightweight deps. Training requires PyTorch + HuggingFace which are heavy
> and can conflict with the backend's package versions. Keeping them apart
> prevents accidental breakage.

---

## 2. Pipeline Overview (5 Phases)

| Phase | What it does | Key files |
|-------|-------------|-----------|
| **1** | Environment & scaffolding (this README) | `requirements-training.txt` |
| **2** | Dataset preparation scripts | `prepare_translation_dataset.py`, `prepare_speech_dataset.py` |
| **3** | LoRA fine-tuning scripts | `finetune_translation.py`, `finetune_whisper.py` |
| **4** | Evaluation scripts (BLEU, WER) | `evaluate_translation.py`, `evaluate_whisper.py` |
| **5** | Backend integration | `backend/services/local_translation.py` |

---

## 3. Directory Structure

```
training/
├── README.md                          ← you are here
├── requirements-training.txt          ← pip deps for the training env
├── data/
│   ├── README.md                      ← dataset format specs (Phase 2)
│   ├── translation_pairs.csv          ← YOUR data: Tamil/Tanglish → English
│   ├── speech_manifest.csv            ← YOUR data: audio_path, transcript
│   └── processed/                     ← auto-generated HuggingFace datasets
│       ├── translation/
│       └── speech/
├── models/
│   ├── reelix-mt-final/               ← fine-tuned translation adapter
│   └── reelix-stt-final/              ← fine-tuned Whisper model
├── prepare_translation_dataset.py     ← Phase 2
├── prepare_speech_dataset.py          ← Phase 2
├── finetune_translation.py            ← Phase 3
├── finetune_whisper.py                ← Phase 3
├── evaluate_translation.py            ← Phase 4
└── evaluate_whisper.py                ← Phase 4
```

> **Git safety:** `data/processed/`, `models/`, and raw `.csv` / `.wav` files
> are excluded via `.gitignore`. Never commit model weights or personal data.

---

## 4. Hardware Notes

- **Translation fine-tuning** (LoRA on ~1B param model): works on a single
  GPU with ≥8 GB VRAM, or CPU (slower). LoRA keeps memory footprint small.
- **Whisper fine-tuning** (`whisper-small`): ~4 GB VRAM minimum.
- If you only have CPU, training will be slow but functional — `accelerate`
  handles device placement automatically.

---

## 5. Quick Start (after Phase 3 is complete)

```bash
conda activate reelix-nlp

# 1. Prepare your datasets
python training/prepare_translation_dataset.py
python training/prepare_speech_dataset.py

# 2. Fine-tune
python training/finetune_translation.py --epochs 3 --batch-size 4 --lr 2e-4
python training/finetune_whisper.py --epochs 5 --batch-size 8 --lr 1e-5

# 3. Evaluate
python training/evaluate_translation.py
python training/evaluate_whisper.py
```

Once you're happy with the scores, Phase 5 wires the local model into the
backend with automatic Groq fallback.
