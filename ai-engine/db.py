import os
from sqlalchemy import create_engine, text

DATABASE_URL = os.getenv("DATABASE_URL")
engine = create_engine(DATABASE_URL, pool_pre_ping=True) if DATABASE_URL else None

def ping_db() -> bool:
    if engine is None:
        return False
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True
    except Exception:
        return False

def init_db():
    if engine is None:
        return
    query = """
    CREATE TABLE IF NOT EXISTS code_reviews (
        id SERIAL PRIMARY KEY,
        summary TEXT,
        risks TEXT,
        improvements TEXT,
        model VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        risk_score FLOAT DEFAULT 5.0,
        repo VARCHAR(255) DEFAULT '',
        author VARCHAR(255) DEFAULT '',
        pr_number INT DEFAULT 0
    );
    ALTER TABLE code_reviews ADD COLUMN IF NOT EXISTS risk_score FLOAT DEFAULT 5.0;
    ALTER TABLE code_reviews ADD COLUMN IF NOT EXISTS repo VARCHAR(255) DEFAULT '';
    ALTER TABLE code_reviews ADD COLUMN IF NOT EXISTS author VARCHAR(255) DEFAULT '';
    ALTER TABLE code_reviews ADD COLUMN IF NOT EXISTS pr_number INT DEFAULT 0;
    """
    with engine.connect() as conn:
        conn.execute(text(query))
        conn.commit()

def save_review(summary: str, risks: list, improvements: list, model: str,
                risk_score: float = 5.0, repo: str = '', author: str = '', pr_number: int = 0):
    if engine is None:
        return
    query = """
    INSERT INTO code_reviews (summary, risks, improvements, model, risk_score, repo, author, pr_number)
    VALUES (:summary, :risks, :improvements, :model, :risk_score, :repo, :author, :pr_number)
    """
    with engine.connect() as conn:
        conn.execute(text(query), {
            "summary": summary,
            "risks": ", ".join(risks),
            "improvements": ", ".join(improvements),
            "model": model,
            "risk_score": risk_score,
            "repo": repo,
            "author": author,
            "pr_number": pr_number,
        })
        conn.commit()

def list_reviews(limit: int = 10):
    if engine is None:
        return []
    query = """
    SELECT id, summary, risks, improvements, model, created_at, risk_score, repo, author, pr_number
    FROM code_reviews ORDER BY id DESC LIMIT :limit
    """
    with engine.connect() as conn:
        rows = conn.execute(text(query), {"limit": limit}).mappings().all()
    items = []
    for r in rows:
        items.append({
            "id": r["id"],
            "summary": r["summary"],
            "risks": [x.strip() for x in (r["risks"] or "").split(",") if x.strip()],
            "improvements": [x.strip() for x in (r["improvements"] or "").split(",") if x.strip()],
            "model": r["model"],
            "created_at": str(r["created_at"]),
            "risk_score": r["risk_score"],
            "repo": r["repo"],
            "author": r["author"],
            "pr_number": r["pr_number"],
        })
    return items

def get_dashboard_stats():
    if engine is None:
        return {}
    with engine.connect() as conn:
        total = conn.execute(text("SELECT COUNT(*) FROM code_reviews")).scalar()
        avg_score = conn.execute(text("SELECT AVG(risk_score) FROM code_reviews")).scalar()
        high_risk = conn.execute(text("SELECT COUNT(*) FROM code_reviews WHERE risk_score > 7")).scalar()
        by_repo = conn.execute(text("""
            SELECT repo, COUNT(*) as count, AVG(risk_score) as avg_score
            FROM code_reviews WHERE repo != ''
            GROUP BY repo ORDER BY count DESC LIMIT 5
        """)).mappings().all()
        by_author = conn.execute(text("""
            SELECT author, COUNT(*) as count, AVG(risk_score) as avg_score
            FROM code_reviews WHERE author != ''
            GROUP BY author ORDER BY avg_score DESC LIMIT 5
        """)).mappings().all()
        trend = conn.execute(text("""
            SELECT DATE(created_at) as date, AVG(risk_score) as avg_score, COUNT(*) as count
            FROM code_reviews
            GROUP BY DATE(created_at)
            ORDER BY date DESC LIMIT 30
        """)).mappings().all()

    return {
        "total_reviews": total,
        "avg_risk_score": round(float(avg_score or 0), 1),
        "high_risk_count": high_risk,
        "by_repo": [{"repo": r["repo"], "count": r["count"], "avg_score": round(float(r["avg_score"]), 1)} for r in by_repo],
        "by_author": [{"author": r["author"], "count": r["count"], "avg_score": round(float(r["avg_score"]), 1)} for r in by_author],
        "trend": [{"date": str(r["date"]), "avg_score": round(float(r["avg_score"]), 1), "count": r["count"]} for r in trend],
    }