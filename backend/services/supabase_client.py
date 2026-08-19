import os
import json
import httpx
from dotenv import load_dotenv

def _get_creds():
    for env_path in [
        os.path.join(os.path.dirname(__file__), "..", "..", ".env"),
        os.path.join(os.path.dirname(__file__), "..", ".env"),
        os.path.abspath(".env"),
    ]:
        if os.path.exists(env_path):
            load_dotenv(env_path, override=True)
            break
    url = os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL") or ""
    key = os.getenv("SUPABASE_ANON_KEY") or os.getenv("VITE_SUPABASE_ANON_KEY") or os.getenv("SUPABASE_SERVICE_ROLE_KEY") or ""
    return url, key

def is_supabase_configured() -> bool:
    url, key = _get_creds()
    return bool(url and key and "your-project" not in url)

def _get_headers():
    url, key = _get_creds()
    return {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "return=representation"
    }

def get_supabase_health():
    if not is_supabase_configured():
        return {"configured": False, "status": "Supabase credentials missing in .env"}
    
    url, key = _get_creds()
    try:
        req_url = f"{url.rstrip('/')}/rest/v1/projects?select=count"
        headers = _get_headers()
        response = httpx.get(req_url, headers=headers, timeout=5.0)
        if response.status_code < 400:
            return {"configured": True, "status": "Connected to Supabase! Table 'projects' is active and ready."}
        elif response.status_code == 404:
            return {"configured": True, "status": "Connected to Supabase API successfully!\n\nFinal Step: Open Supabase SQL Editor and run backend/data/supabase_schema.sql to create your 'projects' table."}
        return {"configured": True, "status": f"Connected to Supabase (HTTP {response.status_code})"}
    except Exception as e:
        return {"configured": True, "status": f"Supabase connection error: {str(e)}"}

def save_project_to_supabase(project_id: str, data: dict):
    if not is_supabase_configured():
        return None

    url, key = _get_creds()
    req_url = f"{url.rstrip('/')}/rest/v1/projects"
    payload = {
        "id": project_id,
        "name": data.get("name", "Untitled Video Project"),
        "captions": data.get("captions", []),
        "style_config": data.get("style_config", {}),
        "video_filename": data.get("video_filename", ""),
        "duration": data.get("duration", 0),
    }
    
    headers = _get_headers()
    headers["Prefer"] = "return=representation,resolution=merge-duplicates"
    
    res = httpx.post(req_url, json=payload, headers=headers, timeout=10.0)
    if res.status_code < 300:
        try:
            return res.json()
        except Exception:
            return {"status": "saved"}
    print("Supabase save error:", res.status_code, res.text)
    return None

def get_project_from_supabase(project_id: str):
    if not is_supabase_configured():
        return None

    url, key = _get_creds()
    req_url = f"{url.rstrip('/')}/rest/v1/projects?id=eq.{project_id}&select=*"
    res = httpx.get(req_url, headers=_get_headers(), timeout=10.0)
    if res.status_code == 200 and res.json():
        return res.json()[0]
    return None
