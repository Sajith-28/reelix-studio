# Reelix Studio — Google Colab GPU Training Guide

Train your domain-specific **Tamil ➔ Tanglish** and **Tamil ➔ English** translation model in **under 5 minutes** on Google Colab's free **T4 GPU** (15 GB VRAM).

---

## 🚀 Quick Steps

### 1. Open Google Colab
Go to [colab.research.google.com](https://colab.research.google.com) and click **"New Notebook"**.

### 2. Enable Free T4 GPU
- Click **Runtime** → **Change runtime type**
- Select **T4 GPU**
- Click **Save**

---

## 📋 Copy & Paste Code Cells into Colab

### Cell 1: Install Dependencies
```python
!pip install -q torch transformers datasets accelerate peft sacrebleu evaluate
!nvidia-smi
```

---

### Cell 2: Upload Your Master Dataset
Upload your `master_multidomain_dataset.csv` from your `training/data/` folder:

```python
import os
from google.colab import files

if not os.path.exists("master_multidomain_dataset.csv"):
    print("Please upload your master_multidomain_dataset.csv file:")
    uploaded = files.upload()
```

---

### Cell 3: Select Target Mode & Prepare Dataset
Choose whether you want to train for **Tanglish Captions** or **English Captions**:

```python
import csv
from datasets import Dataset

# CHOOSE YOUR TARGET: "tanglish_caption" or "english_caption"
TARGET_MODE = "tanglish_caption"  # Set to "english_caption" for English translation

rows = []
with open("master_multidomain_dataset.csv", "r", encoding="utf-8") as f:
    lines = [l for l in f if not l.strip().startswith("#")]

reader = csv.DictReader(lines)
for row in reader:
    s = row.get("source_text", "").strip()
    t = row.get(TARGET_MODE, "").strip()
    if s and t:
        rows.append({"source_text": s, "target_text": t})

print(f"Loaded {len(rows)} pairs for mode: {TARGET_MODE}")
dataset = Dataset.from_list(rows).train_test_split(test_size=0.1, seed=42)
print(f"Train: {len(dataset['train'])} | Eval: {len(dataset['test'])}")
print(f"Sample Source: {dataset['train'][0]['source_text']}")
print(f"Sample Target: {dataset['train'][0]['target_text']}")
```

---

### Cell 4: Train LoRA Model on T4 GPU (~3 to 5 mins)
```python
import torch
import json
from transformers import (
    AutoModelForSeq2SeqLM,
    AutoTokenizer,
    DataCollatorForSeq2Seq,
    Seq2SeqTrainer,
    Seq2SeqTrainingArguments
)
from peft import LoraConfig, TaskType, get_peft_model

MODEL_NAME = "facebook/nllb-200-distilled-600M"
OUTPUT_DIR = "reelix-mt-final"

print(f"Loading {MODEL_NAME}...")
tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
model = AutoModelForSeq2SeqLM.from_pretrained(
    MODEL_NAME,
    torch_dtype=torch.float16 if torch.cuda.is_available() else torch.float32,
    device_map="auto"
)

# Apply LoRA
lora_config = LoraConfig(
    task_type=TaskType.SEQ_2_SEQ_LM,
    r=16,
    lora_alpha=32,
    lora_dropout=0.1,
    target_modules=["q_proj", "v_proj", "k_proj", "out_proj"],
    bias="none"
)
model = get_peft_model(model, lora_config)
model.print_trainable_parameters()

# Tokenize
def preprocess(examples):
    tokenizer.src_lang = "tam_Taml"
    model_inputs = tokenizer(examples["source_text"], max_length=128, truncation=True)
    with tokenizer.as_target_tokenizer():
        tokenizer.tgt_lang = "eng_Latn"
        labels = tokenizer(examples["target_text"], max_length=128, truncation=True)
    model_inputs["labels"] = labels["input_ids"]
    return model_inputs

tokenized_dataset = dataset.map(preprocess, batched=True, remove_columns=["source_text", "target_text"])

# Trainer Setup
training_args = Seq2SeqTrainingArguments(
    output_dir="./checkpoints",
    num_train_epochs=5,
    per_device_train_batch_size=8,
    per_device_eval_batch_size=8,
    learning_rate=3e-4,
    warmup_ratio=0.1,
    weight_decay=0.01,
    evaluation_strategy="epoch",
    save_strategy="epoch",
    save_total_limit=1,
    load_best_model_at_end=True,
    fp16=True,
    logging_steps=5,
    report_to="none"
)

trainer = Seq2SeqTrainer(
    model=model,
    args=training_args,
    train_dataset=tokenized_dataset["train"],
    eval_dataset=tokenized_dataset["test"],
    tokenizer=tokenizer,
    data_collator=DataCollatorForSeq2Seq(tokenizer, model=model, padding=True)
)

print("Starting training on T4 GPU...")
trainer.train()

# Save final adapter + metadata
model.save_pretrained(OUTPUT_DIR)
tokenizer.save_pretrained(OUTPUT_DIR)

metadata = {
    "base_model": MODEL_NAME,
    "target_mode": TARGET_MODE,
    "lang_config": {"src_lang": "tam_Taml", "tgt_lang": "eng_Latn"}
}
with open(f"{OUTPUT_DIR}/reelix_metadata.json", "w") as f:
    json.dump(metadata, f, indent=2)

print("✅ Training complete! Saved to:", OUTPUT_DIR)
```

---

### Cell 5: Test Model on Doctors, MacBook, Vlogging, & Chef sentences!
```python
test_sentences = [
    "வணக்கம், உங்க sugar level ரெண்டு நாளா control-ஆ இல்லை, நாளைக்கு fasting blood sugar எடுத்துட்டு வாங்க",
    "M3 Pro chip-ல 18GB unified memory இருக்கு, Final Cut Pro-ல 4K rendering kooda smooth-ஆ போகும்",
    "இந்த outfit வேற லெவல் தாங்க, இன்னைக்கு OOTD full gethu look",
    "இந்த Kari Dosa-ஐ ஒரு வாய் சாப்பிட்டா மொத்த உலகமே மறந்துடும்",
    "தாளிப்பு சரியா வரணும், அப்பதான் குழம்புக்கு அந்த மணம் வரும்"
]

model.eval()
print(f"=== TESTING ({TARGET_MODE.upper()}) ===\n")
for sent in test_sentences:
    inputs = tokenizer(sent, return_tensors="pt").to("cuda")
    with torch.no_grad():
        out = model.generate(**inputs, max_length=128)
    res = tokenizer.decode(out[0], skip_special_tokens=True)
    print(f"Input:  {sent}")
    print(f"Output: {res}\n")
```

---

### Cell 6: Download & Use Locally
```python
import shutil
from google.colab import files

shutil.make_archive("reelix-mt-final", 'zip', OUTPUT_DIR)
files.download("reelix-mt-final.zip")
print("Downloading reelix-mt-final.zip...")
```

Unzip it into:
`c:\Users\admin\OneDrive\Desktop\SPRINT\training\models\reelix-mt-final\`
