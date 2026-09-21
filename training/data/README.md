# Dataset Formats for Reelix Studio Fine-Tuning

This directory holds **your** raw training data. You need to create two CSV files
manually — the scripts in `training/` will process them into HuggingFace datasets.

> **⚠️ Do NOT commit your data to git.**
> The `.gitignore` already excludes `training/data/*.csv` and `training/data/processed/`.

---

## 1. Translation Pairs — `translation_pairs.csv`

Used to fine-tune the Tamil/Tanglish → English translation model.

### Format

| Column | Type | Description |
|--------|------|-------------|
| `source_text` | string | Original Tamil, Tanglish, or Hindi text (as the speaker said it) |
| `target_text` | string | Natural, idiomatic English translation |

### Example

```csv
source_text,target_text
"இந்த tablet-அ daily morning சாப்பாட்டுக்கு அப்புறம் போடுங்க","Take this tablet every morning after meals"
"Doctor-கிட்ட உடனே check பண்ணுங்க","Consult a doctor immediately"
"ரொம்ப கவனமா இருக்கணும்","You must be very careful"
"bro இது semma worth da try பண்ணு","Bro this is totally worth it, give it a try"
"enna da ivlo late-a vanthe","Why did you come so late"
```

### Tips for good data

- **Include slang & idioms** — this is the whole point. Add the Tanglish/Tamil
  expressions that Groq currently mistranslates.
- **Cover your domain** — medical terms, tech terms, social media lingo, whatever
  your videos typically contain.
- **Keep pairs natural** — the target should be how a native English speaker would
  say the same thing, not a word-by-word translation.
- **Aim for 200+ pairs minimum** to see improvement. 500–1000+ is ideal.
- **Include code-switched examples** where Tamil and English words are mixed in the
  same sentence — that's where the current pipeline struggles most.

---

## 2. Speech Manifest — `speech_manifest.csv`

Used to fine-tune the Whisper STT model on your specific speakers and accent.

### Format

| Column | Type | Description |
|--------|------|-------------|
| `audio_path` | string | Relative path to a `.wav` file (relative to this `data/` directory) |
| `transcript` | string | Exact transcript of what was spoken (Tamil script + English as-spoken) |

### Example

```csv
audio_path,transcript
"clips/intro_01.wav","வணக்கம் friends இன்னைக்கு நாம பாக்க போறது ஒரு interesting topic"
"clips/medical_tip.wav","இந்த tablet-அ daily morning சாப்பாட்டுக்கு அப்புறம் போடுங்க"
"clips/tech_review.wav","இந்த phone-ல camera quality semma bro"
```

### Audio requirements

- **Format:** WAV (PCM 16-bit), mono or stereo
- **Sample rate:** 16 kHz recommended (the script will resample if different)
- **Duration:** 3–30 seconds per clip (shorter is better for training)
- **Store clips in:** `training/data/clips/` (create this folder yourself)

### Tips for good speech data

- **Record from your actual content** — clip segments from your existing videos.
- **Include background noise levels** similar to your real recordings.
- **Cover multiple speakers** if your videos have different presenters.
- **Aim for 1–5 hours** of total audio. Even 30 minutes helps.
- **Transcript must be exact** — include code-switched words exactly as spoken.

---

## 3. Processing

After filling in your CSVs and placing audio clips, run:

```bash
conda activate reelix-nlp

# Process translation pairs → HuggingFace dataset
python training/prepare_translation_dataset.py

# Process speech manifest → HuggingFace dataset
python training/prepare_speech_dataset.py
```

Processed datasets are saved to `training/data/processed/` and used by the
fine-tuning scripts in Phase 3.
