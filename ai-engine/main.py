from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

import os
import json

from gemini_client import generate_review
from db import ping_db, init_db, save_review, list_reviews

# ✅ Load .env BEFORE reading any env vars
load_dotenv()

app = FastAPI(title="DevSync AI Engine", version="0.1.0")

# ✅ CORS (UI runs on localhost:5173)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------- Startup ----------
@app.on_event("startup")
def startup():
    init_db()

# ---------- Models ----------
class ReviewRequest(BaseModel):
    diff: str

# ---------- Routes ----------
@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "service": "ai-engine",
        "db_connected": ping_db(),
        "model": os.getenv("GEMINI_MODEL", "not-set"),
        "mock_mode": os.getenv("MOCK_MODE", "false"),
    }

@app.get("/reviews")
def get_reviews(limit: int = 10):
    return {"items": list_reviews(limit)}

@app.post("/ai/review")
def ai_review(req: ReviewRequest):
    diff_text = (req.diff or "").strip()

    # ✅ MOCK MODE (for demos / quota exhaustion)
    if os.getenv("MOCK_MODE", "false").lower() == "true":
        summary = "This change adds a print statement."
        risks = [
            "Leaving debug prints in production code can clutter logs and leak information.",
        ]
        improvements = [
            "Use structured logging instead of print().",
            "Add a small test to verify expected behavior.",
            "Remove debug output before merging to production.",
        ]
        model_used = "mock"

        save_review(summary, risks, improvements, model_used)

        return {
            "summary": summary,
            "risks": risks,
            "improvements": improvements,
            "raw": None,
            "model": model_used,
            "type": "code-review",
        }

    # ---------- Gemini Path ----------
    prompt = f"""
You are an AI code review agent.

Return ONLY valid JSON (no markdown, no backticks) with this exact schema:
{{
  "summary": "string",
  "risks": ["string", "..."],
  "improvements": ["string", "..."]
}}

Code diff:
{diff_text}
""".strip()

    try:
        # ✅ generate_review now should return (raw_text, model_name)
        raw_text, model_name = generate_review(prompt)

        # ✅ sometimes models add leading/trailing whitespace; strip before json parse
        data = json.loads(raw_text.strip())

        summary = data.get("summary", "")
        risks = data.get("risks", [])
        improvements = data.get("improvements", [])
        model_used = model_name  # ✅ shows gemini-3-pro-preview, etc.

        save_review(summary, risks, improvements, model_used)

        return {
            "summary": summary,
            "risks": risks,
            "improvements": improvements,
            "raw": raw_text,
            "model": model_used,
            "type": "code-review",
        }

    except Exception as e:
        # ✅ Fallback response (still demo-safe)
        summary = "This change adds a print statement."
        risks = [
            "Leaving debug prints in production code can clutter logs and leak information.",
        ]
        improvements = [
            "Use structured logging instead of print().",
            "Add a small test to verify expected behavior.",
            "Remove debug output before merging to production.",
        ]
        model_used = f"fallback:{type(e).__name__}"

        save_review(summary, risks, improvements, model_used)

        return {
            "summary": summary,
            "risks": risks,
            "improvements": improvements,
            "raw": None,
            "model": model_used,
            "error": str(e),
            "type": "code-review",
        }