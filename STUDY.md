# Study Guide — Own This Project

This is not a script to memorize. Each section gives you: what the component does, the
**concepts** underneath it, the **interview questions** it invites, and what a strong
answer contains. If you understand the concepts, you can survive any follow-up. If you
memorize sentences, the second follow-up question ends you.

**How to use it:** for each section — (1) read the code file(s) first, (2) read the
concepts here, (3) close everything and explain the component out loud to an empty room
or a rubber duck, (4) only then check the "strong answer" notes. The 7-day plan is at
the bottom.

---

## 1. The buggy app — `app/main.py`, `app/flows/*.esql`

**What it is:** a Python stand-in for an IBM ACE integration server. A generator thread
feeds "order messages" to a worker thread. Every 8th message has `AccountId=None` (a
*poison message*). The buggy transform retries parsing in a `while` loop that can never
succeed — the thread spins forever at 100% CPU. The fixed transform validates once and
routes the poison message to a DLQ.

**Concepts to actually understand:**
- **Hung thread / busy-wait**: why a loop with no exit condition and no sleep pegs
  exactly one core (the GIL doesn't save you — the thread never yields meaningfully),
  and why the thread is *lost* — it never processes another message until restart.
  This mirrors real ESQL: a `WHILE` in a Compute node with no attempt cap.
- **Poison message + DLQ pattern**: input that can never become valid must be routed
  *out* of the flow (dead-letter queue), never retried in place. Ask yourself: why is
  "retry" the wrong tool for malformed data but the right tool for a network blip?
  (Answer shape: retries fix *transient* failures; malformed data is *permanent* —
  retrying converts one bad message into an outage.)
- **Exposing metrics**: `prometheus_client` exports `process_cpu_seconds_total` (a
  *counter* of CPU-seconds consumed) plus our custom gauge `ace_threads_hung` and
  counters for processed/DLQ'd messages. Know the difference: **counter** only goes up
  (you query its *rate*); **gauge** goes up and down (you query its value).

**Questions you will get:**
- "Walk me through the bug." → Poison message → `WHILE accountId IS NULL` → no cap,
  no THROW, no DLQ → thread spins → CPU 1.0 core → thread never returns to the queue.
- "How would you fix it and what are the trade-offs?" → Validate up front, DLQ the
  poison message. Trade-off: messages now *fail fast* — you need DLQ monitoring or
  you've just moved the problem somewhere silent.
- "Why does CPU go to exactly ~1.0 cores, not 4?" → One hung thread = one core. More
  poison messages wouldn't raise it here because the single worker is already stuck.

---

## 2. Monitoring — `monitoring/`, `docker-compose.yml`

**What it is:** Prometheus scrapes ace-sim every 5s, evaluates the `ACEHighCPU` rule,
and hands firing alerts to Alertmanager, which POSTs a webhook to the triage service.
Grafana renders the same data.

**Concepts:**
- **Pull-based scraping**: Prometheus *pulls* `/metrics` from targets (vs push systems
  like StatsD/CloudWatch). Why pull? Service discovery tells you what *should* exist —
  a target that stops answering is itself a signal (`up == 0`).
- **PromQL `rate()`**: `rate(process_cpu_seconds_total[1m])` = per-second increase of
  a counter over a 1-minute window = "cores used". Understand *why you can't alert on
  a raw counter* (it only ever grows) and what the `[1m]` window trades off
  (smoothing vs responsiveness).
- **`for:` duration**: the alert must be true continuously for 30s (3m in prod) before
  firing — this is *hysteresis*, the anti-flapping mechanism. Local uses 30s so demos
  are fast; prod uses 3m so a brief spike (GC, deploy) doesn't page anyone.
- **Prometheus vs Alertmanager split**: Prometheus *evaluates* rules; Alertmanager
  *routes* them (grouping, silencing, dedup, receivers). Two responsibilities, two
  components. `group_wait`, `repeat_interval` — know what each prevents.
- **Grafana provisioning**: dashboards/datasources as YAML+JSON files in the image,
  not click-ops — so the dashboard is version-controlled and reproducible.

**Questions:**
- "Why did you pick 0.8 as the threshold and rate over a 1m window?" → 0.8 cores ≈
  one hung thread on a 1-CPU-limited container with headroom for normal load; 1m
  window smooths scrape noise. Be ready to say what you'd tune under false positives
  (raise `for:`, not the threshold, usually).
- "Push vs pull monitoring — when is push right?" → short-lived jobs (Pushgateway),
  serverless, egress-restricted networks.
- "What happens if Prometheus itself dies?" → no alerts at all — that's why real
  setups monitor Prometheus with a second Prometheus or a dead-man's-switch alert
  (an always-firing alert whose *absence* pages).

---

## 3. AI triage — `ai-triage/`

**What it is:** FastAPI webhook. On a firing alert: collect evidence (container logs
via Docker socket locally / k8s API on the cluster, CPU series from Prometheus's HTTP
API, the ESQL source), build one prompt, ask the LLM for an RCA + fix diff, save
everything to `incidents/<id>/`, optionally file a GitHub issue.

**Concepts:**
- **Evidence-grounded prompting**: the LLM gets alert JSON + last 200 log lines + 15m
  CPU series + the actual source code. It isn't asked to imagine — it's asked to
  *correlate*. This is the difference between "AI guessing" and "AI triage". Look at
  `TRIAGE_PROMPT` in `main.py` and understand why each ingredient is there.
- **Backend abstraction** (`llm.py`): one `complete(prompt) -> str` interface, three
  implementations (Ollama HTTP, Anthropic SDK, Bedrock SDK). Swappable via env var.
  Why: demo free/offline, run enterprise in prod, no code change. Also know *how each
  authenticates*: Ollama none, Anthropic API key (from Secrets Manager on AWS),
  Bedrock **IRSA** (no key at all — see §5).
- **Webhook idempotency/dedup**: Alertmanager re-sends firing alerts every
  `repeat_interval`. The service tracks handled fingerprints (`_handled`) and holds a
  lock (`_busy`) so one incident = one triage run. Ask yourself what breaks without it
  (an RCA storm, one per repeat).
- **Never let the LLM be the only gate** (`validate.py`): the deploy gate is a hard
  numeric check (CPU < 0.3 cores) evaluated *first*; the LLM verdict is advisory
  color. Why: LLMs are non-deterministic and can hallucinate; production gates must be
  deterministic, auditable, and explainable to an auditor. This is the single most
  important design sentence in the project — understand it, don't recite it.

**Questions:**
- "How do you stop the AI from hallucinating a root cause?" → ground it in evidence
  (logs/metrics/source in the prompt), keep it out of the enforcement path, keep the
  human in the loop (RCA lands as a GitHub issue a human reviews before fixing).
- "What if the LLM is down or slow?" → triage fails gracefully (logged, lock
  released); detection and alerting still work — the AI layer is additive, not
  load-bearing.
- "Why a webhook service rather than having the pipeline poll Prometheus?" →
  event-driven beats polling for incident response latency; Alertmanager already
  solved routing/dedup/grouping.

---

## 4. CI/CD — `.github/workflows/`, `ci/` (Jenkins), ArgoCD

**What it is:** three pipelines. (a) `ci-cd.yaml`: build → Trivy scan → push to ECR →
deploy to EKS, authenticated via GitHub OIDC. (b) `ai-validate.yaml`: post-deploy gate
→ commit/PR comment. (c) `terraform.yaml`: fmt/validate/plan + Checkov, apply on main.
Locally: a Jenkins pipeline (push-based) and a GitHub Actions→GHCR→ArgoCD flow
(pull-based GitOps) both deploying to minikube.

**Concepts:**
- **OIDC federation (no long-lived keys)**: GitHub mints a short-lived signed JWT per
  workflow run; AWS IAM trusts GitHub's OIDC provider and the role's trust policy pins
  `repo:<owner>/<repo>:*` in the `sub` claim. Compare with storing AWS keys in GitHub
  secrets: those never expire, leak in logs, and can't be scoped per-run. Be able to
  narrate the handshake: workflow requests token → presents to STS
  (`AssumeRoleWithWebIdentity`) → STS validates issuer+audience+subject → temp creds.
- **Shift-left security**: Trivy scans *images* for CVEs before push; Checkov scans
  *Terraform* for misconfigurations before apply. Know one example finding each tool
  would catch (Trivy: vulnerable OpenSSL in base image; Checkov: S3 bucket without
  public-access block).
- **Push vs pull deployment (THE interview differentiator):**
  - *Push (Jenkins)*: the pipeline has cluster credentials and runs `kubectl apply`.
    Simple, imperative, but CI holds prod credentials and drift goes undetected.
  - *Pull (ArgoCD/GitOps)*: CI only builds and commits the new image tag to git.
    ArgoCD, running *inside* the cluster, continuously reconciles cluster state to
    the git state — git is the single source of truth, credentials never leave the
    cluster, drift is detected and self-healed, rollback = `git revert`.
  - Know ArgoCD's two status axes: **sync** (does cluster match git?) and **health**
    (are the resources actually working?).
- **Pipeline as code**: Jenkinsfile / workflow YAML / JCasC — the CI system itself is
  reproducible from the repo.

**Questions:**
- "Why OIDC over access keys in secrets?" (see above — tell it as the token handshake)
- "Explain GitOps to me like I've only used Jenkins." → "Instead of the pipeline
  pushing changes into the cluster, an agent in the cluster pulls the desired state
  from git and makes reality match. Deployment becomes a git commit."
- "What happens when someone kubectl-edits prod manually?" → push world: nothing
  notices until it breaks; ArgoCD world: shows OutOfSync and (with self-heal) reverts.
- "Why is the validation gate a separate workflow?" → deploy and verify are different
  lifecycle events; `workflow_run` chaining keeps deploy fast and puts the verdict
  where reviewers look (the PR/commit).

---

## 5. AWS infrastructure — `terraform/`

**What it is:** VPC (2 AZs, single NAT), EKS with spot t3.medium nodes, two ECR repos,
S3 evidence bucket, Secrets Manager, an IRSA role for the triage pod, a GitHub OIDC
role for CI. Remote state in S3 with DynamoDB locking.

**Concepts:**
- **IRSA (IAM Roles for Service Accounts)**: the pod's Kubernetes ServiceAccount is
  annotated with an IAM role ARN; EKS injects a projected service-account token; AWS
  SDKs exchange it via the cluster's OIDC provider for temp credentials. Result: the
  triage pod calls Bedrock/S3/Secrets Manager with **zero keys anywhere** — same
  federation idea as GitHub OIDC, applied to pods. Be able to contrast with (a) node
  instance role — too broad, every pod inherits it; (b) keys in a k8s Secret — static,
  rotatable only by hand.
- **Remote state + locking**: state in S3 (shared, durable, versioned), DynamoDB lock
  so two applies can't corrupt it. Know what's *in* the state file (every resource ID,
  sometimes secrets) and therefore why it's never committed.
- **Registry modules** (`terraform-aws-modules/vpc`, `/eks`): battle-tested community
  modules over hand-rolled resources — less code, more correct defaults. Trade-off:
  you inherit their opinions and upgrade cadence.
- **Cost discipline as design**: spot nodes, single NAT gateway, `force_delete`/
  `force_destroy`/`recovery_window_in_days=0` so `terraform destroy` is always clean —
  the project is *designed to be ephemeral*. That's an interview story, not an
  apology: "I destroy and recreate the environment every session; idempotency proven."
- Know the **units**: EKS control plane ≈ $73/month; spot ≈ 60–70% cheaper than
  on-demand; what a NAT gateway costs and why one (not per-AZ) is fine for a POC but
  not for prod (single point of failure for egress).

**Questions:**
- "Why Terraform over CloudFormation/CDK/clicking?" → declarative, multi-cloud,
  plan-before-apply diff, state as inventory, the largest module ecosystem. (And be
  honest: CDK is fine too — this is a preference-with-reasons question.)
- "What breaks if two people run apply at once without locking?"
- "Walk me through what happens on `terraform destroy` and what could block it."
  (Non-empty buckets/repos — that's exactly why force_delete flags are set.)

---

## 6. Kubernetes — `k8s/`

**What it is:** namespaces `ace` (workload) and `aiops` (triage), Deployments with
resource requests/limits, a ServiceMonitor + PrometheusRule for kube-prometheus-stack
(EKS), RBAC so the triage pod can read pod logs, local variants under `k8s/local/`
with kustomize, and the ArgoCD Application.

**Concepts:**
- **Requests vs limits**: requests are for *scheduling* (guaranteed), limits are for
  *enforcement* (throttle/OOM-kill). The ace-sim CPU limit of 1 is load-bearing here:
  it makes the hung thread's spike *bounded and visible* — know that CPU is throttled
  (compressible) while memory is killed (incompressible).
- **RBAC least privilege**: the triage ServiceAccount gets exactly `pods, pods/log:
  get, list` — nothing else. Be able to write that Role from memory.
- **Operator pattern**: ServiceMonitor and PrometheusRule are *custom resources*; the
  Prometheus Operator watches them and rewrites Prometheus config. You declare intent,
  the operator reconciles — same reconcile-loop philosophy as ArgoCD and Kubernetes
  itself. If you can explain "reconciliation loop" once, three components fall out.
- **kustomize images transformer**: CI bumps the image *tag* without touching
  templates — the mechanical enabler of GitOps commits.

**Questions:**
- "What happens when a pod exceeds its memory limit? CPU limit?" (OOMKilled vs throttled)
- "How does Prometheus find your app on the cluster?" (ServiceMonitor label selection
  → operator → scrape config; contrast with static_configs used locally)
- "Why namespaces?" (blast radius, RBAC scoping, quota boundaries)

---

## 7. The website — `website/`

**What it is:** FastAPI serving a static SPA; endpoints for the file tree/contents
(code browser), demo orchestration, and an SSE event stream; `demo.py` drives Docker
Compose and narrates each stage as events.

**Concepts:**
- **SSE vs WebSocket vs polling**: SSE is one-directional server→client over plain
  HTTP — perfect for progress streams (no bidirectional need, auto-reconnect built
  into `EventSource`). WebSocket = bidirectional, more moving parts. Polling = simple
  but latency/load trade-off. We use SSE + a snapshot endpoint (`/api/demo/state`) as
  fallback.
- **The thread-leak bug (your best war story — it really happened):** the SSE
  generator only wrote bytes when there was a new event; with nothing written, the
  server could never detect a closed connection, so every page view permanently
  occupied a worker thread until the threadpool starved and the site went silent.
  Fix: always emit a keepalive comment (`: keepalive`) so a dead socket raises on
  write and the generator exits. Lesson: *disconnect detection requires I/O*; silent
  streams leak. Tell this story in interviews — debugging stories beat feature lists.
- **Path traversal defense**: `/api/file` resolves the requested path and rejects
  anything outside the repo root (`is_relative_to`) — know why `../../etc/passwd`
  style requests are the attack this stops.
- **Subprocess orchestration**: the demo shells out to `docker compose` with
  env-injected `BUG_MODE`, streams stdout lines as events, and polls Prometheus's
  HTTP API for CPU/alert state — the website is a thin conductor, not a re-implementation.

**Questions:**
- "How does the live demo actually work end to end?" (Be able to trace: click → POST
  /api/demo/start → thread runs compose → events appended → SSE streams → EventSource
  renders.)
- "Why SSE and not WebSockets?" · "How do you secure an endpoint that serves files?"

---

## 8. The one-paragraph answers to the two big meta-questions

**"Tell me about this project."** (60 seconds, practice out loud)
> It recreates a production incident I lived with IBM ACE — a poison message hangs a
> flow thread and pegs CPU — and automates the entire lifecycle around it. Prometheus
> detects the spike and Alertmanager webhooks an AI triage service I built, which
> pulls the container logs, the metric history, and the actual source, and has an LLM
> write a root-cause analysis with a proposed fix as a GitHub issue. The fix goes
> through CI/CD — build, Trivy scan, registry, deploy — and an AI validation gate
> checks recovery from live metrics, with a hard numeric threshold first and the LLM
> verdict only advisory. It runs three ways: Docker Compose locally, minikube with
> both Jenkins and ArgoCD to show push vs pull deployment, and EKS via Terraform with
> IRSA and GitHub OIDC so there are no static credentials anywhere.

**"Did you use AI to build it?"**
> Yes, heavily — the same way I'd use it on the job. I made the architecture and
> trade-off decisions, used AI to accelerate the implementation, then made sure I
> understood every file well enough to debug and extend it — and I did: [the SSE
> thread-leak / the extension you built]. The project is literally *about* using AI
> responsibly in operations, and the design shows where I trust it and where I don't.

---

## 7-day plan

| Day | Do | Checkpoint (no notes allowed) |
|---|---|---|
| 1 | Read `app/` + `monitoring/` fully; run the Compose demo; break the threshold and watch | Whiteboard the 6-stage loop; explain rate() and `for:` out loud |
| 2 | Read `ai-triage/` line by line; read one incident's evidence folder | Explain the prompt's 4 evidence inputs and the dedup lock; why hard-gate-first |
| 3 | Read `terraform/` with the AWS console docs open per resource | Narrate the OIDC handshake and IRSA flow; what's in tfstate and why S3+DynamoDB |
| 4 | Read `k8s/` + `ci/`; run the Jenkins pipeline; watch pods roll | Requests vs limits; write the triage RBAC Role from memory |
| 5 | Run the GitOps path; kubectl-edit something and watch ArgoCD revert it | Push vs pull explanation in under 90 seconds |
| 6 | Read `website/` incl. the SSE fix commit (`git show b252f09`) | Tell the thread-leak story: symptom → diagnosis → fix → lesson |
| 7 | Start an extension from docs/EXTENSIONS_GUIDE.md | Both §8 answers, out loud, timed |

Then keep going: the extensions guide is where this stops being a project you studied
and becomes one you built.
