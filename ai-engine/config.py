# config.py — fetch and parse .devsync.yml from the repo root
import yaml
import httpx
from typing import Optional
from pydantic import BaseModel, Field

class DevSyncConfig(BaseModel):
    strictness: int = Field(default=3, ge=1, le=5)
    block_on_score: float = Field(default=7.0)
    ignore_paths: list[str] = Field(default_factory=list)
    secret_patterns: list[str] = Field(default_factory=list)
    context: Optional[str] = None

DEFAULT_CONFIG = DevSyncConfig()

async def load_config(repo: str, headers: dict) -> DevSyncConfig:
    url = f"https://api.github.com/repos/{repo}/contents/.devsync.yml"
    try:
        async with httpx.AsyncClient() as c:
            r = await c.get(url, headers=headers)
        if r.status_code != 200:
            return DEFAULT_CONFIG
        
        # GitHub returns file content as base64
        import base64
        content = base64.b64decode(r.json()["content"]).decode()
        data = yaml.safe_load(content)
        return DevSyncConfig(**data)
    except Exception:
        return DEFAULT_CONFIG