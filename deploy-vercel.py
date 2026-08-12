#!/usr/bin/env python3
"""Deploy this static site to Vercel via the REST API (no Node.js required)."""

from __future__ import annotations

import base64
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
FILES = ["index.html", "styles.css", "app.js"]
PROJECT_NAME = os.environ.get("VERCEL_PROJECT", "hardiman-analytics")


def load_files() -> list[dict]:
    payload = []
    for name in FILES:
        data = (ROOT / name).read_bytes()
        payload.append(
            {
                "file": name,
                "data": base64.b64encode(data).decode("ascii"),
                "encoding": "base64",
            }
        )
    return payload


def deploy(token: str) -> dict:
    body = json.dumps({"name": PROJECT_NAME, "files": load_files()}).encode("utf-8")
    req = urllib.request.Request(
        "https://api.vercel.com/v13/deployments",
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.loads(resp.read().decode("utf-8"))


def main() -> int:
    token = os.environ.get("VERCEL_TOKEN")
    if not token:
        print(
            "Missing VERCEL_TOKEN.\n\n"
            "1. Sign in at https://vercel.com/login\n"
            "2. Create a token at https://vercel.com/account/tokens\n"
            "3. Run:\n"
            "   VERCEL_TOKEN=your_token python3 deploy-vercel.py\n",
            file=sys.stderr,
        )
        return 1

    try:
        result = deploy(token)
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        print(f"Vercel API error ({exc.code}):\n{detail}", file=sys.stderr)
        return 1

    url = result.get("url") or result.get("alias", [None])[0]
    if url and not url.startswith("http"):
        url = f"https://{url}"

    print(json.dumps(result, indent=2))
    if url:
        print(f"\nLive URL: {url}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
