from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

import os
import json

from gemini_client import generate_review
from db import ping_db, init_db, save_review, list_reviews

# Load environment variables
load_dotenv()

app = FastAPI(title="DevSync AI Engine", version="0.1.0")

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://devsync-seven.vercel.app",
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

    # Mock mode for demos
    if os.getenv("MOCK_MODE", "false").lower() == "true":
        summary = "This change adds a print statement."
        risks = [
            "Leaving debug prints in production code can clutter logs and leak information."
        ]
        improvements = [
            "Use structured logging instead of print().",
            "Add a small test to verify expected behavior.",
            "Remove debug output before merging."
        ]

        save_review(summary, risks, improvements, "mock")

        return {
            "summary": summary,
            "risks": risks,
            "improvements": improvements,
            "model": "mock",
            "type": "code-review",
        }

    prompt = f"""
You are an AI code review agent.

Return ONLY valid JSON with this schema:
{{
  "summary": "string",
  "risks": ["string"],
  "improvements": ["string"]
}}

Code diff:
{diff_text}
""".strip()

    try:
        raw_text, model_name = generate_review(prompt)
        data = json.loads(raw_text.strip())

        summary = data.get("summary", "")
        risks = data.get("risks", [])
        improvements = data.get("improvements", [])

        save_review(summary, risks, improvements, model_name)

        return {
            "summary": summary,
            "risks": risks,
            "improvements": improvements,
            "raw": raw_text,
            "model": model_name,
            "type": "code-review",
        }

    except Exception as e:
        summary = "Fallback review generated."
        risks = ["Model response could not be parsed."]
        improvements = ["Check prompt formatting and model output."]

        save_review(summary, risks, improvements, "fallback")

        return {
            "summary": summary,
            "risks": risks,
            "improvements": improvements,
            "model": "fallback",
            "error": str(e),
            "type": "code-review",
        }