import os
from google import genai

MODEL_NAME = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")

def generate_review(prompt: str) -> str:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY is not set")

    client = genai.Client(api_key=api_key)

    resp = client.models.generate_content(
        model=MODEL_NAME,
        contents=prompt,
    )
    # resp.text is the simplest way to get the generated text
    return resp.text or ""
