"""AI validation gate.

Hard numeric threshold first (post-fix CPU must be < 0.3 cores) — the LLM
verdict is advisory on top. Never let the LLM be the only gate.
"""

import os

import requests

from llm import get_llm

PROMETHEUS_URL = os.environ.get("PROMETHEUS_URL", "http://prometheus:9090")
CPU_THRESHOLD = float(os.environ.get("CPU_THRESHOLD", "0.3"))


def current_cpu() -> float:
    r = requests.get(
        f"{PROMETHEUS_URL}/api/v1/query",
        params={"query": "rate(process_cpu_seconds_total{job='ace-sim'}[1m])"},
        timeout=10,
    )
    result = r.json()["data"]["result"]
    return float(result[0]["value"][1]) if result else 0.0


def validate(rca_md: str = "") -> dict:
    cpu = current_cpu()
    hard_pass = cpu < CPU_THRESHOLD

    llm_verdict = "skipped"
    if hard_pass:
        try:
            llm_verdict = get_llm().complete(
                "You are a deployment validation gate. An incident (hung-thread CPU spike in an "
                f"IBM ACE flow) was remediated and redeployed. Post-deploy CPU is {cpu:.3f} cores "
                f"(threshold {CPU_THRESHOLD}). Original RCA:\n{rca_md[:3000]}\n\n"
                "Reply with VERDICT: PASS or VERDICT: FAIL on the first line, then one short "
                "sentence of justification."
            )
        except Exception as e:
            llm_verdict = f"error: {e}"

    return {"cpu": cpu, "threshold": CPU_THRESHOLD, "hard_gate": "PASS" if hard_pass else "FAIL", "llm_verdict": llm_verdict}
