"""
REELIX — FastAPI Backend
AI Video Captioning, Translation & Studio Editor API
"""

import json
import os
import shutil
import traceback
import uuid
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from services.audio import extract_audio, get_video_info
from services.rendering import render_captioned_video
from services.srt import generate_srt_content
from services.transcription import transcribe_video_audio
from services.translation import translate_captions

app = FastAPI(title="REELIX API", version="2.0.0")

# CORS setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOADS_DIR = os.path.join(BASE_DIR, "uploads")
TEMP_DIR = os.path.join(BASE_DIR, "temp")
EXPORTS_DIR = os.path.join(BASE_DIR, "exports")

for d in (UPLOADS_DIR, TEMP_DIR, EXPORTS_DIR):
    os.makedirs(d, exist_ok=True)

app.mount("/uploads", StaticFiles(directory=UPLOADS_DIR), name="uploads")
app.mount("/exports", StaticFiles(directory=EXPORTS_DIR), name="exports")


@app.get("/")
def root():
    return {
        "status": "online",
        "service": "REELIX Studio Backend API",
        "docs": "/docs",
        "frontend": "http://localhost:5173",
    }


@app.get("/health")
def health():
    return {"status": "ok", "service": "REELIX Studio API", "version": "2.0.0"}


@app.post("/api/process-video")
async def process_video(
    file: UploadFile = File(...),
    spoken_language: str = Form("Auto Detect"),
    target_language: str = Form("English"),
):
    """
    Processes video upload: extracts audio, transcribes with Whisper, translates with Llama,
    and returns structured caption timeline data.
    """
    for env_path in [
        os.path.join(os.path.dirname(__file__), "..", ".env"),
        os.path.join(os.path.dirname(__file__), ".env"),
        os.path.abspath(".env"),
    ]:
        if os.path.exists(env_path):
            load_dotenv(env_path, override=True)
            break

    if not os.getenv("GROQ_API_KEY"):
        raise HTTPException(status_code=500, detail="GROQ_API_KEY is not configured in your .env file.")

    job_id = str(uuid.uuid4())[:8]
    ext = os.path.splitext(file.filename)[1] or ".mp4"
    saved_video_path = os.path.join(UPLOADS_DIR, f"video_{job_id}{ext}")

    try:
        # Step 1: Save uploaded video
        with open(saved_video_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        # Step 2: Extract video info & audio WAV
        video_info = get_video_info(saved_video_path)
        wav_path = extract_audio(saved_video_path, os.path.join(TEMP_DIR, f"audio_{job_id}.wav"))

        # Step 3: Speech Recognition via Whisper Large-V3
        trans_res = transcribe_video_audio(wav_path, spoken_language)
        detected_lang = trans_res.get("detected_language", "English")
        raw_segments = trans_res.get("segments", [])

        if not raw_segments:
            raise HTTPException(status_code=400, detail="No speech detected in the video.")

        # Step 4: Translation & Kinetic Keyword Extraction via LLM
        source_lang = spoken_language if spoken_language != "Auto Detect" else detected_lang
        full_transcript = trans_res.get("text", "")
        captions = translate_captions(raw_segments, source_lang, target_language, full_text=full_transcript)

        video_url = f"/uploads/video_{job_id}{ext}"

        return {
            "job_id": job_id,
            "video_url": video_url,
            "filename": file.filename,
            "duration": video_info["duration"],
            "resolution": f"{video_info['width']}x{video_info['height']}",
            "source_language": source_lang,
            "target_language": target_language,
            "captions": captions,
        }

    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to process video: {str(e)}")


class ExportSrtRequest(BaseModel):
    captions: list


@app.post("/api/export-srt")
def export_srt(req: ExportSrtRequest):
    """
    Generates and returns standard .srt file download.
    """
    srt_text = generate_srt_content(req.captions)
    return Response(
        content=srt_text,
        media_type="application/x-subrip",
        headers={"Content-Disposition": 'attachment; filename="sublyx_captions.srt"'},
    )


class ExportVideoRequest(BaseModel):
    video_url: str
    captions: list
    style: dict
    resolution: str = "original"


@app.post("/api/export-video")
def export_video(req: ExportVideoRequest):
    """
    Renders video with burned-in ASS subtitles via FFmpeg.
    Supports resolution options: original, 720p, 480p, 360p, 240p.
    """
    rel_path = req.video_url.lstrip("/")
    abs_video_path = os.path.join(BASE_DIR, rel_path)

    if not os.path.exists(abs_video_path):
        raise HTTPException(status_code=404, detail="Source video file not found.")

    try:
        exported_path = render_captioned_video(
            video_path=abs_video_path,
            captions=req.captions,
            style_config=req.style,
            output_dir=EXPORTS_DIR,
            resolution=req.resolution or "original",
        )
        export_filename = os.path.basename(exported_path)
        return {
            "export_url": f"/exports/{export_filename}",
            "resolution": req.resolution or "original",
        }
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Video rendering failed: {str(e)}")


# Supabase Integration Endpoints
from services.supabase_client import (
    get_supabase_health,
    save_project_to_supabase,
    get_project_from_supabase,
    is_supabase_configured
)

@app.get("/api/supabase/status")
def supabase_status():
    return get_supabase_health()

class SupabaseSaveRequest(BaseModel):
    project_id: str
    project_data: dict

@app.post("/api/supabase/save-project")
def supabase_save(req: SupabaseSaveRequest):
    if not is_supabase_configured():
        return {"saved": False, "message": "Supabase is not configured yet. Add SUPABASE_URL and SUPABASE_ANON_KEY to .env."}
    
    res = save_project_to_supabase(req.project_id, req.project_data)
    if res:
        return {"saved": True, "data": res}
    return {"saved": False, "message": "Failed to save project to Supabase."}

@app.get("/api/supabase/get-project/{project_id}")
def supabase_get(project_id: str):
    if not is_supabase_configured():
        raise HTTPException(status_code=400, detail="Supabase is not configured.")
    data = get_project_from_supabase(project_id)
    if not data:
        raise HTTPException(status_code=404, detail="Project not found on Supabase.")
    return data
