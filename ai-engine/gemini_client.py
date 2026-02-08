import os
from google import genai

MODEL_NAME = os.getenv("GEMINI_MODEL", "gemini-3-pro-preview")

def generate_review(prompt: str) -> tuple[str, str]:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("GEMINI_API_KEY is missing")

    client = genai.Client(api_key=api_key)

    resp = client.models.generate_content(
        model=MODEL_NAME,
        contents=prompt,
    )

    text = (resp.text or "").strip()
    if not text:
        raise RuntimeError("Empty response from Gemini")

    return text, MODEL_NAME