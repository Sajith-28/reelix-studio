# 🎬 REELIX Studio — AI-Native Video Captioning & Kinetic Subtitle Editor

> **Build Sprint Submission** for **AI Native Mentor (Intern) — Frontier School of Technology / FACE Prep**  
> **Developer**: Sajith ([@Sajith-28](https://github.com/Sajith-28))  
> **Repository**: [https://github.com/Sajith-28/reelix-studio](https://github.com/Sajith-28/reelix-studio)

---

## 🎯 1. The Problem Statement

Content creators, educators, and founders face a massive bottleneck: **they have great ideas and time to record 60-second raw videos, but zero time to spend 2 to 3 hours manually editing, timing subtitles, and translating content for multilingual audiences.**

Existing video editing tools force creators into complex timelines, manual keyframing, and tedious word-by-word adjustment. **REELIX Studio** solves this by leveraging an AI-native pipeline that automatically transcribes, translates code-switched speech (e.g., Tamil + English / Tanglish), applies kinetic neon subtitle presets, and exports broadcast-ready video in seconds.

---

## ✨ 2. Key Features

- 🎙️ **AI Speech-to-Text**: Powered by Groq Whisper Large-V3 for sub-second accurate transcription.
- 🌐 **Code-Switching & Translation**: Contextual LLM translation (Llama) converting mixed South Asian speech (Tamil/Tanglish/Hindi + English) into natural, idiomatic English subtitle cards.
- 🔤 **Custom Phonetic Dictionary**: Integrated 300+ word dictionary (`tamil_dict.json`) enforcing exact transliterations (e.g., `வணக்கம்` -> `vanakkam`, `நான்` -> `naan`, `வேற லெவல்` -> `vera level`).
- ⚡ **Group-Based Word Movement**: Move a selected word **AND all words before/after it** cleanly to adjacent caption timestamps while maintaining word timing metadata and undo/redo stacks.
- 🎨 **True Inverted Pixel Blend (Difference Mode)**: Dynamic frame-by-frame color inversion that flips subtitle text contrast against any video background.
- 🎬 **Kinetic Transitions**: Built-in **Seamless Fade In + Slide Up** entry animations in 60fps live canvas preview and burned MP4 exports.
- ☁️ **Supabase Cloud Sync & Auto-Save**: Debounced auto-save hook persisting project state to Supabase PostgreSQL and local storage.

---

## 🏗️ 3. Tech Stack

| Layer | Technologies Used |
| :--- | :--- |
| **Frontend UI** | React 19, Vite, Vanilla CSS, HTML5 Canvas / Video API |
| **Backend API** | Python, FastAPI, Uvicorn, Pydantic, HTTPX |
| **AI Models** | Groq Whisper Large-V3 (STT), Groq Llama (Translation & Keyword Extraction) |
| **Media Processing** | OpenCV (`cv2`), Pillow (`PIL`), FFmpeg (`rawvideo` pipe & `.ass` filters) |
| **Cloud & Database** | Supabase PostgreSQL, Row Level Security (RLS), Supabase Storage |

---

## 💡 4. Key Design Decision (Architectural Trade-Off)

### *Frame-by-Frame PIL + OpenCV Pipe vs. Standard FFmpeg Subtitle Burn-In*

During development, standard FFmpeg subtitle filters (`-vf ass=...`) worked fine for static text boxes. However, when rendering our signature **"Inverted Pixel Blend" (Difference Mode)** template, standard FFmpeg subtitle filters completely failed because FFmpeg's built-in ASS renderer cannot compute dynamic CSS `mix-blend-mode: difference` pixel color inversion against background video frames.

**The Solution**:
Instead of dropping the pixel-inversion feature, I re-architected the rendering engine in `backend/services/rendering.py`:
1. Decoded video frames sequentially in OpenCV (`cv2.VideoCapture`).
2. Generated single-channel alpha masks and vector stroke outlines using Python's Pillow (`PIL.ImageDraw`).
3. Computed pixel-by-pixel color inversion `frame = frame * (1.0 - mask) + (255 - frame) * mask`.
4. Piped raw BGR24 frames directly into an FFmpeg stdin sub-process (`-f rawvideo -pix_fmt bgr24`) to encode high-quality H.264 MP4 output.

**Trade-Off**: Exporting takes slightly longer than basic subtitle burn-in, but guarantees **100% pixel-perfect visual parity** between the real-time browser preview and the exported MP4 video.

---

## 🤖 5. What the AI Got Wrong & How I Fixed It

### 🔴 Bug 1: The Groq Whisper 896-Character Prompt Limit Error
- **The Issue**: When instructed to bias Whisper speech recognition with our custom 300-word Tamil dictionary, the AI generated code that dumped the entire JSON dictionary into Whisper's `prompt` parameter. This resulted in a 1,425-character prompt string. Groq's API immediately crashed with a `400 Invalid Request Error`: *"prompt length must be 896 characters or fewer"*. The AI tried to fix it by truncating randomly, which broke the prompt formatting.
- **The Fix**: I diagnosed the API constraint, restructured `backend/services/transcription.py` to create a concise 439-character base prompt with a strict 750-character hard cap, and delegated full vocabulary dictionary matching to the LLM translation layer where token limits are much larger.

### 🔴 Bug 2: Windows `Popen` Stderr Buffer Deadlock
- **The Issue**: When spawning the OpenCV rawvideo pipeline to FFmpeg, the AI set `stderr=subprocess.PIPE`. On Windows, when streaming high-resolution 1080p frames, FFmpeg filled the OS `stderr` pipe buffer, causing `proc.stdin.write()` to block indefinitely and freeze the render process.
- **The Fix**: I analyzed thread states during execution, identified the OS pipe overflow, and updated `rendering.py` to pass `stderr=subprocess.DEVNULL`, unblocking stdin writes and allowing exports to complete instantly.

---

## 🚀 6. Installation & Local Setup

### Prerequisites
- Node.js (v18+)
- Python (v3.10+)
- FFmpeg installed and added to system `PATH`

### 1. Clone Repository & Setup Environment
```bash
git clone https://github.com/Sajith-28/reelix-studio.git
cd reelix-studio

# Copy environment template
cp .env.example .env
```
*Add your `GROQ_API_KEY` to `.env`.*

### 2. Start Backend Server
```bash
cd backend
pip install -r requirements.txt
python -m uvicorn main:app --reload --port 8000
```

### 3. Start Frontend Development Client
```bash
cd frontend
npm install
npm run dev
```
*Open [http://localhost:5173](http://localhost:5173) in your browser.*

---

## 📜 7. Database Setup (Supabase)

To enable Cloud Sync and Project Persistence:
1. Open your Supabase Dashboard and go to the **SQL Editor**.
2. Run the SQL script provided in `backend/data/supabase_schema.sql`.
3. Add your `SUPABASE_URL` and `SUPABASE_ANON_KEY` to your `.env` file.

---

## 📄 License

Distributed under the MIT License. Built for the **Frontier School of Technology Build Sprint**.
