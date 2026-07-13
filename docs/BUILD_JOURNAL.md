# Build Journal — How This Project Was Built, Decision by Decision

A chronological record of the build: what was made at each stage, the key code
explained, and — most importantly — **why each choice won over its alternatives**.
Read alongside [STUDY.md](../STUDY.md) (concepts + interview prep); this document is
the *narrative and rationale*.

---

## Stage 0 — Requirements and the big decisions

The brief (from `POC_AIOps_Full_Pipeline_Blueprint.md`): rebuild a real production
incident lifecycle — hung ACE flow thread → CPU spike → RCA → breakfix → verified
recovery — fully automated, with AWS artifacts for later and a local runnable demo now,
plus a website that browses the code and runs the demo live.

Four decisions were made before any code, and everything else followed from them:

| Decision | Chosen | Alternatives | Why |
|---|---|---|---|
| The buggy app | **Simulated ACE** (Python service mimicking the flow + real ESQL files as the "source" the AI reads) | Real IBM ACE developer image | Real ACE = 2–3 GB pull, BAR builds need the ACE toolkit, minutes-long startup — all hostile to a one-click demo. The *incident semantics* (poison message → uncapped WHILE → hung thread) are preserved exactly; the real-ACE Dockerfile is documented in `aws-deployment.md` for authenticity. |
| Local runtime for the demo | **Docker Compose** | kind / minikube / k3d for everything | The demo must start in seconds and never flake mid-interview. Compose gives that; Kubernetes fidelity is delivered separately (k8s/local + CI/CD pipelines deploy to minikube; EKS manifests for cloud). Right tool per job beats one tool for everything. |
| LLM strategy | **Pluggable backend, Ollama default** (`LLM_BACKEND=ollama\|anthropic\|bedrock`) | Hard-code one provider | Free/offline demo (qwen3:8b), enterprise story (Bedrock+IRSA) — same prompt, same interface. One env var, zero code change. |
| RCA destination | **Local evidence folder always; GitHub issue when a token exists** | GitHub-only | The demo must work with zero setup; the real-world integration must still be demonstrable. Both, additive. |

---

## Stage 1 — The buggy app (`app/`)

The simulator has three moving parts (all in `main.py`, ~120 lines):

1. **Traffic generator thread** — every 2s enqueues an order message; every 8th has
   `AccountId=None`. Deterministic (`seq % 8`) rather than random, so *every demo run
   reproduces identically*. (Original design said random poison; determinism won —
   a demo that sometimes doesn't break is worse than no demo.)

2. **Worker thread** with two transforms selected by `BUG_MODE`:

   ```python
   def transform_buggy(msg):
       attempts = 0
       while msg.get("AccountId") is None:   # can never become true for poison input
           attempts += 1                     # no cap, no THROW, no DLQ → spins forever
   ```
   This is a faithful Python rendering of the ESQL bug in
   `flows/TRANSFORM_ORDER_buggy.esql` — a `WHILE` re-reading a value that cannot
   change. The fixed variant checks once and routes to DLQ (`MSG_FAILED` counter),
   mirroring `TRANSFORM_ORDER_fixed.esql`'s `PROPAGATE TO TERMINAL 'out1'`.

3. **Metrics** — `prometheus_client`'s ASGI app mounted at `/metrics`. The alert keys
   off `process_cpu_seconds_total` (the *process's real CPU*, provided free by the
   client library's ProcessCollector on Linux).

| Decision | Chosen | Alternative | Why |
|---|---|---|---|
| CPU signal | `process_cpu_seconds_total` from the app itself | cAdvisor `container_cpu_usage_seconds_total` | Locally there's no kubelet/cAdvisor; the process metric needs zero extra infra. The EKS rule (`k8s/monitoring/alert-rules.yaml`) *does* use the cAdvisor metric — same alert, environment-appropriate source. |
| Log style | Real BIP codes (`BIP2232E`) in the log lines | Generic messages | The LLM reads these logs; ACE-shaped evidence makes the RCA (and the demo) authentic. Rate-limited to one line per 5M loop iterations so logging doesn't become the bottleneck. |
| Bug visibility | `cpus: 1.5` limit in compose; `limits: cpu: "1"` on k8s | Uncapped | Bounded blast radius: the spike is visible (≈1 core) but the laptop/cluster stays usable. |
| Fix delivery | Redeploy with `BUG_MODE=false` | Ship two images | One image, one env var = the "fix PR merged → pipeline redeploys" story with a 5-second local turnaround. The ESQL diff in the RCA is the *conceptual* fix; the env flip is its deployment simulation. |

---

## Stage 2 — Monitoring (`monitoring/`, `docker-compose.yml`)

Plain Prometheus + Alertmanager + Grafana containers, all config mounted read-only
from the repo.

The alert rule (local variant):
```yaml
expr: rate(process_cpu_seconds_total{job="ace-sim"}[1m]) > 0.8
for: 30s
```
- `rate(...[1m])` turns a monotonic CPU-seconds counter into "cores currently used".
- `> 0.8` — a hung thread pins ~1.0 core; 0.8 leaves margin above normal load (~0.02).
- `for: 30s` locally vs `for: 3m` in the k8s rule: demos need speed, production needs
  flap resistance. **Same alert, two timings, deliberately** — being able to explain
  that split is worth more than either number.

Alertmanager's entire job here is one receiver:
```yaml
webhook_configs:
  - url: http://ai-triage:9000/alert
    send_resolved: false     # triage acts on firing, not on recovery
```

| Decision | Chosen | Alternative | Why |
|---|---|---|---|
| Scrape/eval interval (local) | 5s | 15–60s defaults | Demo latency: spike → alert in ~1 min total. Prod values live in the k8s variant. |
| Grafana access | Anonymous viewer + `ALLOW_EMBEDDING` | Login wall | It's a local demo dashboard linked from the website; friction serves nothing. |
| Dashboards | Provisioned JSON in the repo | Click-built | Version-controlled, reproducible, reviewable — dashboards are code too. |

---

## Stage 3 — AI triage (`ai-triage/`)

Five small files, one job each — the separation *is* the design:

- **`main.py`** — the webhook. Filters to `status=firing`, dedups by alert
  fingerprint (`_handled` set), and takes a non-blocking lock (`_busy`) so exactly one
  triage runs at a time; the work happens on a daemon thread so Alertmanager's POST
  returns immediately (webhook receivers must respond fast or the sender retries).
  ponytail-style honesty: a set + a lock instead of a queue — the upgrade path is
  documented in-code, and "one incident at a time" is correct for this domain anyway.
- **`collectors.py`** — evidence. Container logs via the Docker socket locally
  (`LOG_SOURCE=k8s` switches to the Kubernetes API with an RBAC-scoped
  ServiceAccount), CPU series via Prometheus's **HTTP API** (`/api/v1/query` with a
  range-vector subquery), and the buggy ESQL read from a mounted volume.
- **`llm.py`** — the abstraction the whole "pluggable AI" story hangs on:
  ```python
  def get_llm():
      backend = os.environ.get("LLM_BACKEND", "ollama")
      return {"ollama": OllamaClient, "anthropic": AnthropicClient,
              "bedrock": BedrockClient}[backend]()
  ```
  Each client exposes `complete(prompt) -> str`. Ollama is raw HTTP (no SDK needed);
  Anthropic/Bedrock use the official `anthropic` SDK — Bedrock via the Mantle client
  with region only, because **IRSA supplies credentials ambiently** (that's the
  point). The Ollama client strips qwen3's `<think>...</think>` preamble — a
  local-model quirk handled at the edge, invisible to callers.
- **`reporter.py`** — writes `incidents/<id>/{alert.json,logs.txt,cpu_series.json,rca.md}`
  (the *evidence store*; S3 in the cloud variant) and POSTs the GitHub issue when
  `GITHUB_TOKEN`+`GITHUB_REPO` exist. REST via `requests` — the one endpoint we need
  didn't justify an SDK dependency.
- **`validate.py`** — the gate, and the project's central design statement:
  ```python
  hard_pass = cpu < CPU_THRESHOLD          # deterministic gate — decides
  if hard_pass:
      llm_verdict = get_llm().complete(...) # advisory — colors, never decides
  ```
  The LLM cannot pass a failing deploy; it can only annotate a passing one.

The prompt (`TRIAGE_PROMPT`) packs four evidence types — alert JSON, last log lines
(tail-truncated to 8k chars), the CPU series (last 30 points), the ESQL source — and
demands a fixed output shape (root cause / evidence / fix as diff / risk, "formatted
as a GitHub issue"). Structure in → structure out; small local models especially need
the output contract spelled out.

| Decision | Chosen | Alternative | Why |
|---|---|---|---|
| Service framework | FastAPI | Flask | Same as the app: tiny, async-capable, already in the stack — one framework everywhere. |
| Dedup memory | In-process set | Redis/db | State worth persisting doesn't exist here; a restart *should* re-arm triage. `/reset` exists for demos. |
| Log access (local) | Docker socket mount | Log files / sidecar | Zero app changes, exactly what an SRE does (`docker logs`). Trade-off acknowledged: socket = root-equivalent on the host; acceptable for a local demo, which is why the k8s path uses the API + RBAC instead. |
| GitHub auth | Fine-grained PAT, Issues:RW on one repo | Classic PAT / GitHub App | Least privilege: the classic `repo` scope grants code access; fine-grained grants *one permission on one repo*. |

---

## Stage 4 — AWS artifacts (`terraform/`, `k8s/`, `.github/workflows/`)

Written and validated (`terraform validate`, fmt) but intentionally **not applied** —
apply/destroy is the user's cost decision, and the runbook (`aws-deployment.md`)
leads with cost discipline.

Terraform highlights and their reasoning:

| Decision | Chosen | Alternative | Why |
|---|---|---|---|
| VPC/EKS | Registry modules (`terraform-aws-modules/*`) | Hand-rolled resources | ~40 lines vs ~400, community-hardened defaults (IRSA wiring, subnet tagging for ELBs). Trade-off: their opinions, their upgrade cadence — fine for this scale. |
| Nodes | 2× t3.medium **SPOT** | On-demand | 60–70% cheaper; interruption-tolerant workload. Cost control as a visible design habit. |
| NAT | `single_nat_gateway = true` | Per-AZ NAT | ~$32/mo saved; single egress SPOF is acceptable for an ephemeral POC — and saying *why* it wouldn't be in prod is the interview point. |
| CI auth | **GitHub OIDC → IAM role**, trust pinned to `repo:<owner>/<repo>:*` | AWS keys in GitHub secrets | Short-lived per-run tokens, nothing to leak or rotate. The `sub` condition is what stops *other* repos assuming the role — the detail interviewers probe. |
| Pod auth | **IRSA** for the triage pod (Bedrock/S3/Secrets, resource-scoped) | Node role / keys in Secret | Per-pod least privilege with zero static credentials. |
| State | S3 + DynamoDB lock | Local state | Shared, durable, versioned, and two concurrent applies can't corrupt it. |
| Teardown ergonomics | `force_delete` (ECR), `force_destroy` (S3), `recovery_window_in_days=0` | Defaults | `terraform destroy` must always succeed cleanly — ephemerality is a feature. Defaults exist to protect prod data; this is explicitly not prod. |

The workflows: `ci-cd.yaml` matrix-builds both images, Trivy-gates
(CRITICAL/HIGH, `exit-code: 1` — a real gate, not a report), pushes to ECR and
deploys with placeholder substitution (`sed` over the manifests — honest about being
the POC-grade approach; kustomize replaces it in the local GitOps path).
`ai-validate.yaml` chains via `workflow_run`, port-forwards to the triage service,
calls `/validate`, and comments the verdict table on the commit — hard gate decides
the job's exit code, LLM text rides along. `terraform.yaml` runs fmt/validate/
plan + Checkov (`soft_fail: true` while iterating — report, don't block; flip when
hardening).

---

## Stage 5 — The website (`website/`)

Three pieces:

- **`server.py`** — static SPA + three API groups: the code browser (`/api/tree` walks
  the repo, `/api/file` serves contents **after resolving the path and rejecting
  anything outside the repo root** — path traversal is the attack this blocks), demo
  control, and the SSE stream.
- **`demo.py`** — the orchestrator. A `Demo` object holds an append-only `events`
  list; every stage emits typed events (`step`, `log`, `cpu`, `rca`, `validation`,
  `error`, `finished`). The run itself: preflight (Docker up? Ollama up?) → compose up
  with `BUG_MODE=true` → poll Prometheus for CPU + alert state → watch `incidents/`
  for the new `rca.md` → recreate ace-sim with `BUG_MODE=false` → call `/validate` →
  report. The website never re-implements the pipeline — it *watches* the same
  Prometheus and filesystem the pipeline uses.
- **`static/`** — the SPA. SSE via `EventSource` renders the timeline, a canvas CPU
  sparkline (hand-drawn, ~30 lines — a charting library for one line chart is
  dependency theater), the RCA markdown, the verdict.

| Decision | Chosen | Alternative | Why |
|---|---|---|---|
| Live updates | **SSE** + snapshot endpoint | WebSockets / polling | One-directional progress feed = SSE's exact use case; `EventSource` reconnects for free; plain HTTP. Snapshot (`/api/demo/state`) covers late joiners and scripts. |
| Frontend stack | Single page, CDN libs, no build step | React/Vite app | The website must run with `python server.py` and nothing else. A build toolchain adds failure modes to a *demo*. |
| Concurrency | One demo at a time (module singleton) | Multi-run isolation | There is one Docker daemon and one port set; pretending otherwise adds code for an impossible case. |

### The thread-leak incident (a real bug, kept here on purpose)

**Symptom:** mid-demo, the site went completely silent — but the pipeline itself kept
running (the validation gate was still reachable directly on :9000).
**Diagnosis:** the SSE generator only wrote bytes when a new event existed; while
idle it wrote *nothing*. A server can only discover a closed connection by writing to
it — so closed tabs were never detected, every page view permanently occupied one
threadpool worker, and the pool (default ~40) starved.
**Fix (`git show b252f09`):** always write — a `: keepalive\n\n` comment every idle
second — so dead sockets raise on write and their generators (and threads) exit; plus
the `/api/demo/state` snapshot as a polling fallback.
**Lesson:** disconnect detection requires I/O; a silent stream is a resource leak.
This is the project's best debugging story — symptom → isolation (server hung,
pipeline fine) → root cause → fix → prevention.

---

## Stage 6 — Verification

Nothing above counted until it was watched working, twice:

1. Compose demo run #1 (driven via API): poison message hung the thread (log showed
   400M+ retry attempts, `docker stats` showed 100% CPU), `ACEHighCPU` fired,
   triage collected evidence, **qwen3:8b correctly diagnosed the uncapped WHILE loop**
   and proposed a capped-retry + DLQ diff, redeploy with the fix, gate passed
   (CPU 0.0025 vs 0.3 threshold, LLM verdict PASS).
2. Run #2 through the rebuilt UI end-to-end after the SSE fix — all six timeline
   stages green on screen, live CPU chart, RCA rendered, PASS banner.
3. `terraform init/validate` clean; workflows lint-clean.

**The point of two runs:** the first proved the pipeline; the second proved the
*product* (what a viewer actually sees). They failed differently — that's why both
exist.

---

## Stage 7 — Phase 2 (this repo's evolution)

Documented as it happens: local-first main branch (minikube + Jenkins push-based CI/CD
+ GitHub Actions→GHCR→ArgoCD pull-based GitOps), AWS as a merged feature branch, the
mode-aware cinematic website, and the learning docs you're reading. Rationale for the
headline choice:

| Decision | Chosen | Alternative | Why |
|---|---|---|---|
| Local CI | **Both Jenkins and GitHub Actions+ArgoCD** | Pick one | They demonstrate *opposite deployment models* (push vs pull). Having both, selectable in the website, turns a tooling choice into an architecture lesson — and matches JDs that name either. |
| Local registry | `registry:2` for Jenkins; **GHCR** for GitOps | One registry for both | Jenkins path must work fully offline; ArgoCD pulls manifests from GitHub anyway, so GHCR (free for public repos) makes the GitOps path *real* — actual cloud CI, local CD. |
| Local k8s | **minikube** | kind / k3d / Docker Desktop k8s | Already installed and configured on this machine. The best tool is frequently the one you already operate. |
| Manifest updates in CI | kustomize images transformer | sed | Structured, idempotent tag bumps — `sed` on YAML is how GitOps repos get corrupted. |
