"""AI triage service: Alertmanager webhook -> collect evidence -> LLM RCA -> report."""

import logging
import threading
import time

from fastapi import FastAPI, Request

import collectors
import reporter
import validate as validation
from llm import get_llm

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] ai-triage %(message)s")
log = logging.getLogger("ai-triage")

app = FastAPI(title="ai-triage")

# ponytail: single in-flight incident lock; a queue if alert volume ever matters
_busy = threading.Lock()
_handled: set[str] = set()

TRIAGE_PROMPT = """You are an SRE performing root cause analysis on a production incident
in an IBM App Connect Enterprise (ACE) integration server.

## Alert
{alert}

## Last container log lines
{logs}

## CPU usage (cores, [timestamp, value] over last 15m)
{cpu}

## ESQL source of the message flow's Compute node
```esql
{source}
```

Produce, formatted as a GitHub issue in markdown:
1. **Root cause** — precise, referencing the log evidence and ESQL lines.
2. **Evidence** — the specific log lines and metric behavior supporting it.
3. **Proposed fix** — as an ESQL diff.
4. **Risk assessment** — of applying the fix.
Keep it under 500 words."""


def _run_triage(alert_payload: dict):
    incident_id = time.strftime("%Y%m%d-%H%M%S")
    log.info("Triage started, incident %s", incident_id)
    try:
        logs = collectors.get_logs()
        cpu = collectors.get_cpu_series()
        source = collectors.get_flow_source()
        prompt = TRIAGE_PROMPT.format(
            alert=alert_payload, logs=logs[-8000:], cpu=cpu[-30:], source=source
        )
        log.info("Evidence collected, querying LLM...")
        rca = get_llm().complete(prompt)
        path = reporter.save_incident(incident_id, alert_payload, logs, cpu, rca)
        log.info("RCA written to %s", path)
        url = reporter.create_github_issue(
            f"[P1] ACEHighCPU — hung flow thread in ORDER_FLOW ({incident_id})", rca
        )
        if url:
            log.info("GitHub issue created: %s", url)
    except Exception:
        log.exception("Triage failed for incident %s", incident_id)
    finally:
        _busy.release()


@app.post("/alert")
async def alert(request: Request):
    payload = await request.json()
    firing = [a for a in payload.get("alerts", []) if a.get("status") == "firing"]
    if not firing:
        return {"status": "ignored", "reason": "no firing alerts"}
    key = firing[0].get("fingerprint") or firing[0]["labels"].get("alertname", "unknown")
    if key in _handled:
        return {"status": "ignored", "reason": "already handled"}
    if not _busy.acquire(blocking=False):
        return {"status": "ignored", "reason": "triage in progress"}
    _handled.add(key)
    threading.Thread(target=_run_triage, args=(firing[0],), daemon=True).start()
    return {"status": "triage started"}


@app.post("/validate")
def validate_endpoint():
    rca = ""
    try:
        latest = sorted(reporter.INCIDENTS_DIR.glob("*/rca.md"))
        if latest:
            rca = latest[-1].read_text(encoding="utf-8")
    except OSError:
        pass
    return validation.validate(rca)


@app.post("/reset")
def reset():
    """Demo helper: allow the next alert to trigger a fresh triage."""
    _handled.clear()
    return {"status": "reset"}


@app.get("/health")
def health():
    return {"status": "ok"}
