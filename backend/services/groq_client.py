import os
import httpx
from dotenv import load_dotenv
from groq import Groq


def get_groq_api_key() -> str:
    """
    Retrieves and sanitizes the GROQ_API_KEY.
    Strips leading/trailing whitespace, newlines (\\r, \\n), and any surrounding quotes.
    """
    for env_path in [
        os.path.join(os.path.dirname(__file__), "..", "..", ".env"),
        os.path.join(os.path.dirname(__file__), "..", ".env"),
        os.path.abspath(".env"),
    ]:
        if os.path.exists(env_path):
            load_dotenv(env_path, override=True)
            break

    raw = os.getenv("GROQ_API_KEY", "")
    if not raw:
        return ""
    return raw.strip().strip("'\"").strip()


def get_groq_client(timeout: float = 120.0) -> Groq:
    """
    Creates a robust Groq client with explicit connect, read, and write timeouts.
    """
    key = get_groq_api_key()
    if not key:
        raise ValueError("GROQ_API_KEY is missing from environment or .env file.")

    http_client = httpx.Client(
        timeout=httpx.Timeout(timeout, connect=30.0, read=timeout, write=60.0),
        follow_redirects=True,
    )
    return Groq(api_key=key, http_client=http_client)
