import os
from sqlalchemy import create_engine, text

DATABASE_URL = os.getenv("DATABASE_URL")  # None if not set

# ✅ Cloud-safe: if DATABASE_URL isn't set yet, don't create an engine
engine = create_engine(DATABASE_URL, pool_pre_ping=True) if DATABASE_URL else None


# ---------- Health Check ----------
def ping_db() -> bool:
    if engine is None:
        return False
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True
    except Exception:
        return False


# ---------- Setup Table ----------
def init_db():
    """
    Creates the code_reviews table if it doesn't exist.
    """
    if engine is None:
        return

    query = """
    CREATE TABLE IF NOT EXISTS code_reviews (
        id SERIAL PRIMARY KEY,
        summary TEXT,
        risks TEXT,
        improvements TEXT,
        model VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """
    with engine.connect() as conn:
        conn.execute(text(query))
        conn.commit()


# ---------- Save Review ----------
def save_review(summary: str, risks: list, improvements: list, model: str):
    """
    Saves a code review result into PostgreSQL.
    """
    if engine is None:
        return

    query = """
    INSERT INTO code_reviews (summary, risks, improvements, model)
    VALUES (:summary, :risks, :improvements, :model)
    """
    with engine.connect() as conn:
        conn.execute(
            text(query),
            {
                "summary": summary,
                "risks": ", ".join(risks),
                "improvements": ", ".join(improvements),
                "model": model,
            },
        )
        conn.commit()


def list_reviews(limit: int = 10):
    if engine is None:
        return []

    query = """
    SELECT id, summary, risks, improvements, model, created_at
    FROM code_reviews
    ORDER BY id DESC
    LIMIT :limit
    """
    with engine.connect() as conn:
        rows = conn.execute(text(query), {"limit": limit}).mappings().all()

    items = []
    for r in rows:
        risks_list = [x.strip() for x in (r["risks"] or "").split(",") if x.strip()]
        improvements_list = [x.strip() for x in (r["improvements"] or "").split(",") if x.strip()]

        items.append({
            "id": r["id"],
            "summary": r["summary"],
            "risks": risks_list,
            "improvements": improvements_list,
            "model": r["model"],
            "created_at": str(r["created_at"]),
        })

    return items
