"""Showcase website: code browser + live demo runner.

Run:  pip install fastapi uvicorn requests
      python server.py            ->  http://localhost:8080
"""

import json
import pathlib
import shutil
import subprocess
import time

import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, PlainTextResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

import demo as demo_mod
import pipeline as pipeline_mod

ROOT = pathlib.Path(__file__).resolve().parent.parent
STATIC = pathlib.Path(__file__).resolve().parent / "static"
EXCLUDE = {".git", "__pycache__", ".terraform", "incidents", "node_modules"}

app = FastAPI(title="aiops-ace-remediation showcase")
app.mount("/static", StaticFiles(directory=STATIC), name="static")


@app.get("/")
def index():
    return FileResponse(STATIC / "index.html")


@app.get("/api/tree")
def tree():
    def walk(d: pathlib.Path):
        out = []
        for p in sorted(d.iterdir(), key=lambda p: (p.is_file(), p.name.lower())):
            if p.name in EXCLUDE or p.name.startswith(".terraform"):
                continue
            if p.is_dir():
                out.append({"name": p.name, "type": "dir", "children": walk(p)})
            elif p.suffix not in {".pyc", ".docx", ".pdf"}:
                out.append({"name": p.name, "type": "file", "path": str(p.relative_to(ROOT)).replace("\\", "/")})
        return out

    return walk(ROOT)


@app.get("/api/file", response_class=PlainTextResponse)
def file(path: str):
    p = (ROOT / path).resolve()
    if not p.is_relative_to(ROOT) or any(part in EXCLUDE for part in p.parts):
        raise HTTPException(403)
    if not p.is_file():
        raise HTTPException(404)
    return p.read_text(encoding="utf-8", errors="replace")


@app.post("/api/demo/start")
def demo_start():
    return {"started": demo_mod.start(), "running": demo_mod.demo.running}


@app.post("/api/demo/stop")
def demo_stop():
    import threading

    threading.Thread(target=demo_mod.demo.stop, daemon=True).start()
    return {"stopping": True}


@app.get("/api/demo/state")
def demo_state():
    """Snapshot of all events so far — robust polling fallback."""
    return {"running": demo_mod.demo.running, "events": demo_mod.demo.events}


@app.get("/api/demo/events")
def demo_events():
    """SSE: replay all events so far, then stream new ones."""
    return _sse(demo_mod.demo)


def _sse(source) -> StreamingResponse:
    def gen():
        i = 0
        while True:
            events = source.events
            if i < len(events):
                for e in events[i:]:
                    yield f"data: {json.dumps(e)}\n\n"
                i = len(events)
            else:
                yield ": keepalive\n\n"  # always write -> dead clients detected
            time.sleep(1)

    return StreamingResponse(gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.post("/api/pipeline/start")
def pipeline_start(runner: str = "jenkins"):
    if runner not in ("jenkins", "gitops"):
        raise HTTPException(400, "runner must be jenkins or gitops")
    return {"started": pipeline_mod.start(runner), "running": pipeline_mod.pipeline.running}


@app.get("/api/pipeline/state")
def pipeline_state():
    return {"running": pipeline_mod.pipeline.running, "events": pipeline_mod.pipeline.events}


@app.get("/api/pipeline/events")
def pipeline_events():
    return _sse(pipeline_mod.pipeline)


@app.get("/api/cloud/status")
def cloud_status():
    """Honest readiness probe: is there real AWS infra to demo against?"""
    checks = []

    aws = shutil.which("aws")
    checks.append({"check": "AWS CLI installed", "ok": bool(aws),
                   "detail": aws or "aws not found on PATH — install AWS CLI v2"})

    ident_ok, ident = False, "skipped (no CLI)"
    if aws:
        try:
            r = subprocess.run([aws, "sts", "get-caller-identity", "--output", "text",
                                "--query", "Account"], capture_output=True, text=True, timeout=15)
            ident_ok = r.returncode == 0
            ident = f"account {r.stdout.strip()}" if ident_ok else (r.stderr.strip()[:200] or "no credentials configured")
        except Exception as e:
            ident = str(e)
    checks.append({"check": "AWS credentials valid", "ok": ident_ok, "detail": ident})

    eks_ok, eks = False, "no EKS context in kubeconfig"
    try:
        r = subprocess.run(["kubectl", "config", "get-contexts", "-o", "name"],
                           capture_output=True, text=True, timeout=10)
        eks_ctx = [c for c in r.stdout.split() if "eks" in c.lower() or "arn:aws" in c]
        if eks_ctx:
            eks_ok, eks = True, f"context: {eks_ctx[0]}"
    except Exception as e:
        eks = str(e)
    checks.append({"check": "EKS cluster context", "ok": eks_ok, "detail": eks})

    return {"ready": all(c["ok"] for c in checks), "checks": checks}


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8080)
