# 🎬 REELIX Studio — AI-Native Video Captioning & Kinetic Subtitle Editor

> **Build Sprint Submission** for **AI Native Mentor (Intern) — Frontier School of Technology / FACE Prep**  
> **Developer**: Sajith ([@Sajith-28](https://github.com/Sajith-28))  

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
- 🎬 **Kinetic Transitions**: **Fade In + Slide Up**, **Pop Up**, **Zoom Kinetic** and **Fade In** entry animations, played identically in the live preview and in both MP4 export engines (LibASS `\t` scale ramps, pixel compositor tile scaling).
- 📐 **Snap Grid & Safe Area**: Drag captions against centre / rule-of-thirds guides and the Shorts / Reels safe area (snap lines light up; hold Shift for free placement). The preview overlay is scaled exactly like the exporter, so text lands in the output where it sat in the editor.
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

### Negative Nano — per-pixel negative text template

**Negative Nano** (Templates → *Inverted & Experimental*) shows the true colour negative of the footage inside every glyph, every frame: `out = video·(1−a) + (1−video)·a`, where `a` is the anti-aliased glyph coverage. It is not a fixed text colour — over a bright face the letters go dark, over a dark shirt they go light, and they change as the shot moves.

It runs on its own pipeline (`renderer: 'negative'`), shared between the preview and the export:

| Side | File | Role |
|---|---|---|
| shared | `frontend/src/lib/negativeText.js` | presets, easing, frame-accurate animation state, layout, mask ops, the compositor (pure, no DOM) |
| preview | `frontend/src/lib/negativeMask.js` + `components/NegativeTextCanvas.jsx` | Canvas2D twin: measures the real font, rasterises the animated masks, composites over the `<video>` frame |
| export | `backend/services/negative_text.py` | PIL / numpy mirror of both files, piped to FFmpeg frame by frame |
| test | `backend/tests/test_negative_parity.py` | runs the JS core in Node and the Python core on identical inputs: animation state per frame for every preset, mask ops, compositor ≤ 2/255 on bright / dark / mid-gray / moving frames, layout |

Every standard control keeps working on it: **font family** (any bundled family — layout is measured from the font's own metrics), size, position/drag, letter spacing, uppercase, **stroke**, **cinematic / hard / glow shadow**, the **pill box**, and the **transition** picker (mapped onto the equivalent IN preset). Stroke and shadow render in normal blend *around* the inverted glyphs, the way a finishing editor would build it.

**Parameters** (the *Negative* tab; all also accepted per caption in `caption.negativeOverrides`):

| Param | Default | Meaning |
|---|---|---|
| `variant` | `negative-text` | `negative-text` (glyphs inverted) · `negative-box` (inverted rounded box, text knocked out) · `negative-highlight` (white captions, only the spoken word inverts — uses Whisper word timings) · `negative-sweep` (an inversion band sweeps across; letters flip as it passes) |
| `inPreset` / `outPreset` | `stagger-rise` / `mask-wipe` | `stagger-rise`, `mask-wipe`, `scale-pop`, `typewriter`, `blur-in`, `flip-invert`, `glitch`, `split-word`, `none`. OUT plays the preset time-reversed (`mask-wipe` exits L→R). Animations move the **mask** (geometry, clip, per-char/word visibility), never the inversion strength, so nothing passes through flat gray. |
| `inDuration` / `outDuration` | 0.36 s / 0.28 s | Converted to frames from the video fps; scaled down proportionally when a caption is too short for both. |
| `holdDuration` | 0 | 0 = hold until the caption ends; otherwise the layer ends after in + hold + out. |
| `stagger` | 30 ms | Delay between characters / words (auto-compressed so the last unit still lands on the phase's final frame). |
| `easing` | `auto` | `auto` uses each preset's own curve; or `easeOutCubic`, `easeInOutCubic`, `easeOutQuint`, `easeOutExpo`, `easeOutBack`, `linear`. |
| `startTime` | 0 | Offset (s) added to the caption start. |
| `lowContrastFallback` | `stroke` | Readability safeguard. Luminance under the text is sampled every `luminanceEveryN` (3) frames and EMA-smoothed; within ~0.38–0.62 the fallback ramps in continuously: `stroke` = thin dark outline + soft shadow, `contrast-boost` = contrast curve on the inverted pixels only, `none`. |
| `opacityFade` | `false` | Opt-in: additionally fade the mask (this does pass through 50% gray). |
| `typewriterCursor` | `true` | Cursor block for the Typewriter preset. |
| `maxWidthPct` | 84 | Auto-fit: the font shrinks until the widest line fits this % of the frame (Shorts / Reels safe area). |

Timing is frame-indexed on both sides (`frame = round(mediaTime × fps)` in the preview via `requestVideoFrameCallback`; the decoder's frame counter in the export), so the burned-in MP4 lands on exactly the frames the editor showed.

Sample renders over bright, dark, mid-gray and moving synthetic footage: `cd backend && python tests/render_negative_samples.py` → `backend/exports/samples/negative_*.mp4`. Parity test: `cd backend && python -m pytest tests -q` (needs Node on PATH).

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

This project was developed as part of the **Frontier School of Technology AI Native Mentor Build Sprint**.
