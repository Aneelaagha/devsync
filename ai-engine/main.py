from fastapi import FastAPI
from pydantic import BaseModel
from gemini_client import generate_review
from db import ping_db, init_db, save_review, list_reviews

import json
import os

app = FastAPI(title="DevSync AI Engine", version="0.1.0")


@app.on_event("startup")
def startup():
    init_db()

@app.get("/reviews")
def get_reviews(limit: int = 10):
    return {"items": list_reviews(limit)}



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
    }


@app.post("/ai/review")
def ai_review(req: ReviewRequest):

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

        # ✅ save to Postgres
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
{req.diff}
""".strip()

    try:
        raw_text = generate_review(prompt)
        data = json.loads(raw_text)

        summary = data.get("summary", "")
        risks = data.get("risks", [])
        improvements = data.get("improvements", [])
        model_used = "gemini"

        # ✅ save to Postgres
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

        # ✅ save to Postgres even on fallback
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
