"""RCA reporting: always writes incidents/<id>/ locally; also creates a
GitHub issue when GITHUB_TOKEN + GITHUB_REPO are set."""

import json
import os
import pathlib

import requests

INCIDENTS_DIR = pathlib.Path(os.environ.get("INCIDENTS_DIR", "/incidents"))


def save_incident(incident_id: str, alert: dict, logs: str, cpu_series: list, rca_md: str) -> pathlib.Path:
    d = INCIDENTS_DIR / incident_id
    d.mkdir(parents=True, exist_ok=True)
    (d / "alert.json").write_text(json.dumps(alert, indent=2))
    (d / "logs.txt").write_text(logs)
    (d / "cpu_series.json").write_text(json.dumps(cpu_series))
    (d / "rca.md").write_text(rca_md, encoding="utf-8")
    return d


def create_github_issue(title: str, body: str) -> str | None:
    token, repo = os.environ.get("GITHUB_TOKEN"), os.environ.get("GITHUB_REPO")
    if not token or not repo:
        return None
    r = requests.post(
        f"https://api.github.com/repos/{repo}/issues",
        headers={"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"},
        json={"title": title, "body": body, "labels": ["incident", "ai-rca"]},
        timeout=30,
    )
    r.raise_for_status()
    return r.json()["html_url"]
