"""Demo orchestrator: runs the full incident->RCA->fix->validation loop on
Docker Compose and narrates every stage as events for the website's SSE stream."""

import os
import pathlib
import subprocess
import threading
import time

import requests

ROOT = pathlib.Path(__file__).resolve().parent.parent
PROM = "http://localhost:9090"
TRIAGE = "http://localhost:9000"
OLLAMA = "http://localhost:11434"


class EventLog:
    """Append-only narrated event stream shared by the demo and pipeline runners."""

    def __init__(self):
        self.events: list[dict] = []
        self.running = False
        self._lock = threading.Lock()

    def emit(self, type_: str, **kw):
        with self._lock:
            self.events.append({"type": type_, "ts": time.time(), **kw})

    def step(self, id_: str, status: str, title: str = "", narration: str = ""):
        self.emit("step", id=id_, status=status, title=title, narration=narration)

    def log(self, text: str):
        self.emit("log", text=text)


class Demo(EventLog):
    def __init__(self):
        super().__init__()

    # ---- shell helpers -------------------------------------------------
    def compose(self, *args, bug_mode: str | None = None, stream: bool = False) -> int:
        env = {**os.environ}
        if bug_mode is not None:
            env["BUG_MODE"] = bug_mode
        p = subprocess.Popen(
            ["docker", "compose", *args], cwd=ROOT, env=env,
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding="utf-8", errors="replace",
        )
        for line in p.stdout:
            if stream and line.strip():
                self.log(line.rstrip())
        return p.wait()

    # ---- polling helpers -----------------------------------------------
    def cpu(self) -> float | None:
        try:
            r = requests.get(f"{PROM}/api/v1/query",
                             params={"query": "rate(process_cpu_seconds_total{job='ace-sim'}[1m])"}, timeout=5)
            result = r.json()["data"]["result"]
            return float(result[0]["value"][1]) if result else None
        except requests.RequestException:
            return None

    def alert_state(self) -> str:
        try:
            r = requests.get(f"{PROM}/api/v1/alerts", timeout=5)
            for a in r.json()["data"]["alerts"]:
                if a["labels"].get("alertname") == "ACEHighCPU":
                    return a["state"]  # pending | firing
        except requests.RequestException:
            pass
        return "inactive"

    def sample_cpu(self):
        v = self.cpu()
        if v is not None:
            self.emit("cpu", value=round(v, 3))

    # ---- the demo itself -----------------------------------------------
    def run(self):
        try:
            self._run()
        except Exception as e:
            self.emit("error", message=str(e))
        finally:
            self.running = False
            self.emit("finished")

    def _run(self):
        # 1. preflight
        self.step("preflight", "running", "Preflight checks",
                  "Verifying Docker and the local Ollama LLM are reachable.")
        if subprocess.run(["docker", "info"], capture_output=True).returncode != 0:
            raise RuntimeError("Docker daemon is not running — start Docker Desktop and retry.")
        backend = os.environ.get("LLM_BACKEND", "ollama")
        if backend == "ollama":
            try:
                requests.get(f"{OLLAMA}/api/tags", timeout=5)
            except requests.RequestException:
                raise RuntimeError("Ollama is not reachable on localhost:11434 — run `ollama serve` and retry.")
        self.step("preflight", "done")

        # 2. deploy the buggy release
        self.step("deploy", "running", "Deploy buggy release",
                  "Starting the ACE simulator (with the hung-thread ESQL bug), Prometheus, "
                  "Grafana, Alertmanager and the AI triage service via Docker Compose — the "
                  "same stack the Terraform/EKS files deploy in AWS.")
        if self.compose("up", "-d", "--build", bug_mode="true", stream=True) != 0:
            raise RuntimeError("docker compose up failed — see log above.")
        deadline = time.time() + 120
        while time.time() < deadline:
            try:
                if (requests.get(f"{PROM}/-/ready", timeout=3).ok
                        and requests.get(f"{TRIAGE}/health", timeout=3).ok
                        and requests.get("http://localhost:8000/health", timeout=3).ok):
                    break
            except requests.RequestException:
                pass
            time.sleep(3)
        else:
            raise RuntimeError("Services did not become healthy within 2 minutes.")
        requests.post(f"{TRIAGE}/reset", timeout=5)
        self.step("deploy", "done")

        # 3. incident develops: poison message hangs a thread, CPU spikes
        self.step("incident", "running", "Incident: hung thread pegs CPU",
                  "A poison message (AccountId=NULL) hits the flow. The buggy ESQL WHILE loop "
                  "retries forever — the flow thread hangs and CPU climbs to a full core. "
                  "Prometheus scrapes it every 5s; watch the chart.")
        deadline = time.time() + 300
        fired = False
        while time.time() < deadline:
            self.sample_cpu()
            state = self.alert_state()
            if state == "pending" and not fired:
                self.log("Prometheus alert ACEHighCPU is PENDING (CPU > 0.8 for 30s required)...")
                fired = True
            if state == "firing":
                break
            time.sleep(5)
        else:
            raise RuntimeError("Alert did not fire within 5 minutes — check ace-sim logs.")
        self.step("incident", "done")

        # 4. alert -> triage -> LLM RCA
        self.step("triage", "running", "AI triage & root cause analysis",
                  "Alertmanager fired the webhook. The triage service is collecting container "
                  "logs, the CPU series and the ESQL source, and asking the LLM "
                  f"({backend}) for a root cause and proposed fix. Local models take 1-3 minutes.")
        before = set(p.name for p in (ROOT / "incidents").glob("*"))
        deadline = time.time() + 900
        rca_path = None
        while time.time() < deadline:
            self.sample_cpu()
            new = [p for p in (ROOT / "incidents").glob("*/rca.md") if p.parent.name not in before]
            if new:
                rca_path = new[0]
                break
            time.sleep(5)
        if not rca_path:
            raise RuntimeError("No RCA produced within 15 minutes — check `docker logs ai-triage`.")
        rca = rca_path.read_text(encoding="utf-8")
        self.emit("rca", markdown=rca, incident=rca_path.parent.name)
        self.step("triage", "done",
                  narration="RCA written to incidents/ (and posted as a GitHub issue if a token is configured).")

        # 5. remediate: redeploy with the fixed flow
        self.step("fix", "running", "Remediate: deploy the fixed flow",
                  "Simulating the fix PR merging: the pipeline redeploys ace-sim with the "
                  "corrected ESQL (validate once, route poison messages to the DLQ). "
                  "On AWS this is the GitHub Actions build->Trivy->ECR->EKS path.")
        if self.compose("up", "-d", "--force-recreate", "ace-sim", bug_mode="false") != 0:
            raise RuntimeError("Redeploy failed.")
        self.step("fix", "done")

        # 6. validation gate
        self.step("validate", "running", "AI validation gate",
                  "Waiting ~90s for post-deploy metrics, then checking the hard gate "
                  "(CPU < 0.3 cores) with an advisory LLM verdict on top.")
        for _ in range(18):
            self.sample_cpu()
            time.sleep(5)
        result = requests.post(f"{TRIAGE}/validate", timeout=600).json()
        self.emit("validation", result=result)
        self.step("validate", "done" if result["hard_gate"] == "PASS" else "failed")
        self.log("Demo complete: incident detected, diagnosed by AI, remediated and verified.")

    def stop(self):
        self.step("teardown", "running", "Tearing down", "docker compose down")
        self.compose("down", stream=True)
        self.step("teardown", "done")
        self.emit("finished")


demo = Demo()  # ponytail: one demo at a time, module-level singleton


def start() -> bool:
    if demo.running:
        return False
    demo.running = True
    demo.events.clear()
    threading.Thread(target=demo.run, daemon=True).start()
    return True


if __name__ == "__main__":
    # self-check: event plumbing
    d = Demo()
    d.step("x", "running", "t")
    d.log("hello")
    assert d.events[0]["type"] == "step" and d.events[1]["text"] == "hello"
    print("self-check OK")
