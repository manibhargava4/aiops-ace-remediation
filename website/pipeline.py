"""CI/CD pipeline runners for the website.

jenkins  — push-based: trigger the Jenkins job via its REST API, stream console.
gitops   — pull-based: trigger the GitHub Actions workflow (gh CLI), then watch
           ArgoCD reconcile the cluster to the new git state.
"""

import os
import re
import shutil
import subprocess
import threading
import time

import requests

from demo import EventLog

JENKINS = os.environ.get("JENKINS_URL", "http://localhost:8081")
JENKINS_AUTH = (os.environ.get("JENKINS_USER", "admin"), os.environ.get("JENKINS_PASSWORD", "admin"))
JOB = "aiops-local-pipeline"
GH = shutil.which("gh") or r"C:\Program Files\GitHub CLI\gh.exe"

pipeline = EventLog()  # one run at a time, same pattern as the demo


def _run(cmd: list[str], timeout=60) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, encoding="utf-8", errors="replace")


# ---------------- Jenkins (push-based) ----------------

def _jenkins_run():
    p = pipeline
    try:
        p.step("trigger", "running", "Trigger Jenkins job",
               "POSTing to the Jenkins REST API — the pipeline itself will build, scan, push and kubectl-deploy (push-based CD).")
        s = requests.Session()
        s.auth = JENKINS_AUTH
        crumb = s.get(f"{JENKINS}/crumbIssuer/api/json", timeout=10).json()
        r = s.post(f"{JENKINS}/job/{JOB}/build",
                   headers={crumb["crumbRequestField"]: crumb["crumb"]}, timeout=10)
        r.raise_for_status()
        queue_url = r.headers["Location"]
        # queue item -> build number
        build_url = None
        for _ in range(60):
            qi = s.get(f"{queue_url}api/json", timeout=10).json()
            if qi.get("executable"):
                build_url = qi["executable"]["url"]
                break
            time.sleep(2)
        if not build_url:
            raise RuntimeError("Build never left the Jenkins queue (is an executor free?)")
        p.step("trigger", "done")

        p.step("pipeline", "running", "Jenkins pipeline",
               "Streaming the live console. Stages: Build → Trivy scan → Push to local registry → Deploy to minikube.")
        offset = 0
        current_stage = None
        while True:
            r = s.get(f"{build_url}logText/progressiveText", params={"start": offset}, timeout=30)
            chunk = r.text
            if chunk:
                for line in chunk.splitlines():
                    m = re.search(r"\[Pipeline\] \{ \((.+)\)", line)
                    if m:
                        current_stage = m.group(1)
                        p.log(f"── stage: {current_stage} ──")
                    elif line.strip() and not line.startswith("[Pipeline]"):
                        p.log(line.rstrip()[:300])
            offset = int(r.headers.get("X-Text-Size", offset))
            if r.headers.get("X-More-Data") != "true":
                break
            time.sleep(2)
        result = s.get(f"{build_url}api/json", timeout=10).json().get("result")
        p.step("pipeline", "done" if result == "SUCCESS" else "failed")
        p.emit("result", runner="jenkins", result=result or "UNKNOWN",
               detail=f"Jenkins build finished: {result}. The pipeline held cluster credentials and ran kubectl itself — that's push-based CD.")
    except Exception as e:
        p.emit("error", message=str(e))
    finally:
        p.running = False
        p.emit("finished")


# ---------------- GitHub Actions + ArgoCD (pull-based GitOps) ----------------

def _argocd_status() -> tuple[str, str]:
    r = _run(["kubectl", "-n", "argocd", "get", "application", "aiops-ace",
              "-o", "jsonpath={.status.sync.status}/{.status.health.status}"])
    if r.returncode != 0:
        return "unknown", "unknown"
    parts = (r.stdout.strip() or "/").split("/")
    return parts[0] or "unknown", (parts[1] if len(parts) > 1 else "unknown")


def _gitops_run():
    p = pipeline
    try:
        p.step("trigger", "running", "Trigger GitHub Actions",
               "Dispatching the gitops-cd workflow. CI will build, Trivy-scan, push to GHCR and COMMIT the new "
               "image tags to git — it never touches the cluster. That's the point.")
        r = _run([GH, "workflow", "run", "gitops-cd", "--ref", "main"])
        if r.returncode != 0:
            raise RuntimeError(f"gh workflow run failed: {r.stderr.strip() or r.stdout.strip()}")
        time.sleep(8)  # give GitHub a moment to register the run
        r = _run([GH, "run", "list", "--workflow", "gitops-cd", "--limit", "1",
                  "--json", "databaseId,status,url"])
        import json as _json
        runs = _json.loads(r.stdout or "[]")
        if not runs:
            raise RuntimeError("Workflow run not found on GitHub.")
        run_id, run_url = str(runs[0]["databaseId"]), runs[0]["url"]
        p.log(f"GitHub Actions run: {run_url}")
        p.step("trigger", "done")

        p.step("ci", "running", "CI on GitHub (build → Trivy → GHCR → git bump)",
               "Watching the run. On success the workflow's last job commits the new image tags into "
               "k8s/local/kustomization.yaml — deployment becomes a git commit.")
        for _ in range(120):  # up to ~20 min
            r = _run([GH, "run", "view", run_id, "--json", "status,conclusion"])
            info = _json.loads(r.stdout or "{}")
            if info.get("status") == "completed":
                if info.get("conclusion") != "success":
                    raise RuntimeError(f"Workflow concluded: {info.get('conclusion')} — see {run_url}")
                break
            time.sleep(10)
        else:
            raise RuntimeError("Workflow did not complete within 20 minutes.")
        p.step("ci", "done")

        p.step("argocd", "running", "ArgoCD reconciles (pull-based)",
               "Nothing pushes to the cluster. ArgoCD noticed the git commit and is syncing minikube to match. "
               "Watching sync + health status...")
        deadline = time.time() + 600
        while time.time() < deadline:
            sync, health = _argocd_status()
            p.log(f"ArgoCD: sync={sync} health={health}")
            if sync == "Synced" and health == "Healthy":
                break
            time.sleep(10)
        else:
            raise RuntimeError("ArgoCD did not reach Synced/Healthy within 10 minutes "
                               "(is ArgoCD installed and the Application applied? see ci/README.md)")
        p.step("argocd", "done")
        p.emit("result", runner="gitops", result="SUCCESS",
               detail="Git is the single source of truth: CI committed the change, ArgoCD pulled it. "
                      "Rollback would be `git revert`.")
    except Exception as e:
        p.emit("error", message=str(e))
    finally:
        p.running = False
        p.emit("finished")


def start(runner: str) -> bool:
    if pipeline.running:
        return False
    pipeline.running = True
    pipeline.events.clear()
    target = _jenkins_run if runner == "jenkins" else _gitops_run
    threading.Thread(target=target, daemon=True).start()
    return True
