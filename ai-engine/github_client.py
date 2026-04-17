import time, os, base64
import jwt, httpx

APP_ID = os.environ["GITHUB_APP_ID"]

def _make_jwt() -> str:
    pem = base64.b64decode(os.environ["GITHUB_PRIVATE_KEY_B64"]).decode()
    now = int(time.time())
    payload = {"iat": now - 60, "exp": now + 540, "iss": APP_ID}
    return jwt.encode(payload, pem, algorithm="RS256")

class GithubClient:
    BASE = "https://api.github.com"

    def __init__(self, installation_id: int):
        self.install = installation_id
        self._token  = None

    async def _get_token(self) -> str:
        if self._token:
            return self._token
        app_jwt = _make_jwt()
        async with httpx.AsyncClient() as c:
            r = await c.post(
                f"{self.BASE}/app/installations/{self.install}/access_tokens",
                headers={"Authorization": f"Bearer {app_jwt}",
                         "Accept": "application/vnd.github+json"}
            )
        self._token = r.json()["token"]
        return self._token

    async def _headers(self) -> dict:
        return {"Authorization": f"Bearer {await self._get_token()}",
                "Accept": "application/vnd.github+json"}

    async def get_pr_files(self, repo: str, pr: int) -> list:
        async with httpx.AsyncClient() as c:
            r = await c.get(f"{self.BASE}/repos/{repo}/pulls/{pr}/files",
                            headers=await self._headers())
        return r.json()

    async def create_check(self, repo: str, sha: str) -> int:
        async with httpx.AsyncClient() as c:
            r = await c.post(f"{self.BASE}/repos/{repo}/check-runs",
                headers=await self._headers(),
                json={"name": "DevSync Review", "head_sha": sha,
                      "status": "in_progress"})
        return r.json()["id"]

    async def post_review(self, repo: str, pr: int, comments: list, score: float):
        body = f"## DevSync Review\n\nRisk score: **{score}/10**\n\n"
        body += "High risk — review carefully." if score > 7 else "Looks OK."
        async with httpx.AsyncClient() as c:
            await c.post(f"{self.BASE}/repos/{repo}/pulls/{pr}/reviews",
                headers=await self._headers(),
                json={"body": body, "event": "COMMENT", "comments": comments})

    async def complete_check(self, repo: str, check_id: int, conclusion: str, score: float):
        async with httpx.AsyncClient() as c:
            await c.patch(f"{self.BASE}/repos/{repo}/check-runs/{check_id}",
                headers=await self._headers(),
                json={"status": "completed", "conclusion": conclusion,
                      "output": {"title": f"Risk score: {score}/10",
                                 "summary": f"DevSync found risk level {conclusion}"}})