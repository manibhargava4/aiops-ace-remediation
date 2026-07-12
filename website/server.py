"""Showcase website: code browser + live demo runner.

Run:  pip install fastapi uvicorn requests
      python server.py            ->  http://localhost:8080
"""

import json
import pathlib
import time

import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, PlainTextResponse, StreamingResponse

import demo as demo_mod

ROOT = pathlib.Path(__file__).resolve().parent.parent
STATIC = pathlib.Path(__file__).resolve().parent / "static"
EXCLUDE = {".git", "__pycache__", ".terraform", "incidents", "node_modules"}

app = FastAPI(title="aiops-ace-remediation showcase")


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

    def gen():
        i = 0
        while True:
            events = demo_mod.demo.events
            if i < len(events):
                for e in events[i:]:
                    yield f"data: {json.dumps(e)}\n\n"
                i = len(events)
            else:
                # always write bytes so a disconnected client raises and
                # this generator (and its worker thread) actually exits
                yield ": keepalive\n\n"
            time.sleep(1)

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8080)
