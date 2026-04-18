# webhook.py
import hashlib, hmac, os
from fastapi import APIRouter, Request, HTTPException, BackgroundTasks
from github_client import GithubClient
from config import load_config

router = APIRouter()
WEBHOOK_SECRET = os.environ["GITHUB_WEBHOOK_SECRET"]

def verify_signature(payload: bytes, sig_header: str) -> bool:
    expected = "sha256=" + hmac.new(
        WEBHOOK_SECRET.encode(), payload, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, sig_header or "")

async def handle_pr(payload: dict):
    repo    = payload["repository"]["full_name"]
    pr_num  = payload["pull_request"]["number"]
    install = payload["installation"]["id"]
    sha     = payload["pull_request"]["head"]["sha"]

    gh = GithubClient(install)
    headers = await gh._headers()

    # Load .devsync.yml from the repo root (falls back to defaults if not found)
    config = await load_config(repo, headers)

    # Create a pending check run immediately
    check_id = await gh.create_check(repo, sha)

    # Fetch PR files and filter out ignored paths
    files = await gh.get_pr_files(repo, pr_num)
    files = [
        f for f in files
        if not any(
            _matches_pattern(f["filename"], pattern)
            for pattern in config.ignore_paths
        )
    ]

    if not files:
        await gh.complete_check(repo, check_id, "success", 0.0)
        return

    diff = "\n".join(f["patch"] for f in files if "patch" in f)

    # Run AI analysis with config context
    from main import analyze_diff
    result = await analyze_diff(diff, config)

    # Post inline review comments
    comments = [
        {"path": f["filename"], "position": 1, "body": finding["message"]}
        for f, finding in zip(files, result.get("findings", []))
    ]
    await gh.post_review(repo, pr_num, comments, result["risk_score"])

    # Use block_on_score from config
    conclusion = "failure" if result["risk_score"] > config.block_on_score else \
                 "neutral"  if result["risk_score"] > config.block_on_score * 0.6 else "success"
    await gh.complete_check(repo, check_id, conclusion, result["risk_score"])

def _matches_pattern(filename: str, pattern: str) -> bool:
    import fnmatch
    return fnmatch.fnmatch(filename, pattern)

@router.post("/webhook")
async def github_webhook(request: Request, background: BackgroundTasks):
    body = await request.body()
    if not verify_signature(body, request.headers.get("X-Hub-Signature-256")):
        raise HTTPException(403, "Invalid signature")

    event   = request.headers.get("X-GitHub-Event")
    payload = await request.json()
    action  = payload.get("action")

    if event == "pull_request" and action in ("opened", "synchronize"):
        background.add_task(handle_pr, payload)

    return {"ok": True}