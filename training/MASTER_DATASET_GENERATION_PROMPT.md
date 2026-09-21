# MASTER PROMPT: Reelix Studio Dataset Generation Engine

> **How to use:** Copy and paste the prompt below into **Claude 3.5 Sonnet**, **GPT-4o**, or **Gemini 1.5 Pro**. You can run it in batches by asking for 100–200 pairs per domain at a time.

---

```markdown
You are an elite Tamil-English bilingual NLP dataset curator and localization engineer specializing in social media subtitles, Reel captions, and speech-to-text translation.

I am fine-tuning a custom translation model for Reelix Studio. I need a diverse, hyper-realistic, domain-specific training dataset.

### OBJECTIVE:
Generate a dataset of CSV rows containing 3 columns:
1. `source_text`: The spoken speech transcript in Tamil script (incorporating natural English code-mixing where appropriate for that speaker).
2. `english_caption`: Grammatically flawless, natural, context-aware English translation formatted for punchy Reel/TikTok subtitle cards (1 to 6 words per thought).
3. `tanglish_caption`: Highly accurate, authentic, phonetic Romanized Tamil (Tanglish) preserving English loanwords as English and Tamil words in clear, standardized phonetic Roman script.

---

### DOMAIN BREAKDOWN & REQUIREMENTS:

#### Domain 1: Medical & Healthcare (Doctors & Clinics)
- **Tone:** Authoritative, caring, clinical yet accessible to patients.
- **Content:** Disease names in Tamil/English mix (சர்க்கரை நோய் / Diabetes, ரத்த அழுத்தம் / Hypertension, கொலஸ்ட்ரால் / Cholesterol, தைராய்டு / Thyroid, ஆஞ்சியோ / Angiogram, கல்லீரல் / Liver).
- **Specifics:** Medication dosage, fasting instructions, surgical procedures, warning signs, lab test interpretations (HbA1c, ECG, MRI Scan, USG), and medical slang.

#### Domain 2: Tech & Laptop Sales (MacBook & PC Specialists)
- **Tone:** Fast-paced, persuasive, tech-savvy sales pitch.
- **Content:** MacBook specifications (M1/M2/M3 Pro/Max chips, Unified Memory, Liquid Retina XDR, SSD Read/Write speeds, Battery Cycle Count, MagSafe, Thunderbolt ports, Final Cut Pro rendering, ProRes codec, Trade-in value, EMI offers, Refurbished vs Brand New).

#### Domain 3: Social Media Influencers & Lifestyle Vloggers
- **Tone:** High energy, catchy hooks, emotional, colloquial Tanglish slang.
- **Content:** "Hey guys, welcome back to my channel", "Link in bio", " மறக்காம subscribe பண்ணுங்க", "Semma worth bro", "Vera level", "Gethu look", unboxing reactions, travel vlogs, outfit of the day (OOTD), lifestyle tips.

#### Domain 4: Food Reviewers, Hotels & Restaurants
- **Tone:** Expressive, mouth-watering, descriptive.
- **Content:** Ambience, buffet spread, price vs quantity, signature dishes (Seeraga Samba Mutton Biryani, Kari Dosa, Jigarthanda, Crispy Prawns, Filter Coffee), spice level, service quality, hidden gem recommendations.

#### Domain 5: Master Chefs & Authentic Traditional Cooking
- **Tone:** Pure, traditional, culinary Tamil with ancestral wisdom.
- **Content:** Cooking techniques (தாளிப்பு, பக்குவம், மணம், நறுக்குதல், வதக்குதல், சுண்ட காய்ச்சுதல், பதப்படுத்துதல்), traditional spices (சீரகம், மிளகு, சோம்பு, பெருங்காயம், கறிவேப்பிலை, மரச்செக்கு எண்ணெய்), authentic recipes (செட்டிநாடு மசாலா, மீன் குழம்பு, திருநெல்வேலி அல்வா).

---

### STRICT FORMATTING GUIDELINES:

1. **Output Format:** Clean CSV format with columns: `source_text,english_caption,tanglish_caption`.
2. **Double Quotes:** Enclose every field inside double quotes `"..."` to handle internal commas cleanly.
3. **Tanglish Rules:**
   - Long vowels: ஆ -> `aa`, ஈ -> `ee`, ஊ -> `oo`, ஏ -> `ae`/`e`, ஓ -> `o`/`oa`.
   - Colloquial verb endings: பண்ணுங்க -> `pannunga`, போடுங்க -> `podunga`, பாருங்க -> `paarunga`.
   - Keep technical / English words in original English spelling (e.g., `MacBook M3 Pro`, `Doctor`, `Stethoscope`, `Battery Cycle`, `Biryani`).
4. **Length Variety:** Mix short punchy phrases (2-4 words) with medium sentences (6-10 words) matching realistic video subtitle segments.

---

### OUTPUT TEMPLATE (Generate 100 rows per batch):

source_text,english_caption,tanglish_caption
"இந்த tablet-அ daily morning சாப்பாட்டுக்கு அப்புறம் போடுங்க","Take this tablet every morning after meals","Intha tablet-ah daily morning saapaatukku appuram podunga"
"MacBook M3 Pro 18GB unified memory-ல 4K video rendering semma fast-ஆ இருக்கும்","4K video rendering is super fast on MacBook M3 Pro with 18GB unified memory","MacBook M3 Pro 18GB unified memory-la 4K video rendering semma fast-ah irukkum"
"இந்த செட்டிநாடு மட்டன் சுக்காவுக்கு சின்ன வெங்காயம் தான் மெயின் சீக்ரெட்","Small onions are the main secret to this Chettinad Mutton Sukka","Intha Chettinad Mutton Sukka-vukku chinna vengaayam thaan main secret"
```
