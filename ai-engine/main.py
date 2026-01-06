from fastapi import FastAPI
from pydantic import BaseModel
from typing import Any, Dict, List, Optional
from db import ping_db

app = FastAPI(title="DevSync AI Engine", version="0.1.0")


@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "service": "ai-engine",
        "db_connected": ping_db()
    }
