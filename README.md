# AIOps ACE Remediation — AI-Driven Incident Detection, RCA & Validated Remediation

A production incident lifecycle, fully automated: a buggy IBM ACE-style message flow
pegs a CPU, Prometheus alerts, an **AI triage service performs root-cause analysis with
an LLM**, the fix is redeployed through CI/CD, and an **AI validation gate** verifies
recovery from live metrics.

```
[1] Buggy ACE app (hung-thread ESQL) ── built by CI → ECR → EKS (Terraform infra)
[2] Prometheus detects CPU spike ──► Grafana dashboard
[3] Alertmanager ──► AI Triage (FastAPI): logs + metrics + ESQL source
        └► LLM (Ollama local / Claude via Anthropic API or Bedrock) → RCA + fix diff → GitHub issue
[4-5] Fix merged → build → Trivy → ECR → EKS deploy (GitHub OIDC, no keys)
[6] AI Validation Gate: hard CPU threshold + advisory LLM verdict → PR comment
```

## Three ways to run it

| Mode | Stack | Where |
|---|---|---|
| **Local demo** | Docker Compose + Ollama | website "Start Demo" — the full incident loop in ~7 min |
| **Local Kubernetes** | minikube + **Jenkins (push)** or **GitHub Actions → GHCR → ArgoCD (pull GitOps)** | website "CI/CD" tab · [ci/README.md](ci/README.md) |
| **AWS** | EKS/ECR/IRSA/OIDC/Bedrock via Terraform | website Cloud mode + [docs/aws-deployment.md](docs/aws-deployment.md) |

The website has a **Local / AWS Cloud mode switch** — each mode is its own design with
its own architecture story, and Cloud mode honestly reports whether real AWS infra is
reachable before enabling anything.

## Learn / own this project

- [STUDY.md](STUDY.md) — concepts + interview prep per component, 7-day plan
- [docs/BUILD_JOURNAL.md](docs/BUILD_JOURNAL.md) — how it was built, every decision vs its alternatives
- [docs/EXTENSIONS_GUIDE.md](docs/EXTENSIONS_GUIDE.md) — four features to build yourself (no code given)

## Quick start (local, free, offline LLM)

Prereqs: Docker Desktop running, [Ollama](https://ollama.com) with `ollama pull qwen3:8b`, Python 3.11+.

```powershell
pip install fastapi uvicorn requests
python website/server.py
# open http://localhost:8080 → Live Demo → Start Demo
```

The website runs the whole loop live (~6–10 min): deploy buggy release → CPU spike →
alert fires → AI writes the RCA → fixed flow redeployed → validation gate passes.
It also includes a **code browser** for every file in this repo (Terraform, k8s,
workflows, Dockerfiles, Python, ESQL).

Or without the website: `docker compose up -d --build` and watch
[Grafana](http://localhost:3000/d/ace-incident) / [Prometheus alerts](http://localhost:9090/alerts);
the RCA lands in `incidents/<id>/rca.md`.

## LLM backends

`LLM_BACKEND=ollama | anthropic | bedrock` (see [.env.example](.env.example)):

| Backend | Auth | Use |
|---|---|---|
| `ollama` (default) | none | free, offline demo (qwen3:8b) |
| `anthropic` | `ANTHROPIC_API_KEY` (Secrets Manager on AWS) | Claude via the Anthropic API |
| `bedrock` | IRSA on EKS — no keys in the pod | Claude via Amazon Bedrock |

## Repo map

| Path | What |
|---|---|
| `app/` | ACE simulator — buggy vs fixed transform, ESQL sources, Prometheus metrics |
| `ai-triage/` | webhook → collectors → `llm.py` (3 backends) → RCA reporter + validation gate |
| `monitoring/` | Prometheus rules, Alertmanager webhook, Grafana dashboard (local) |
| `docker-compose.yml` | one-command local stack |
| `terraform/` | AWS: VPC, EKS (spot), ECR, S3 evidence, Secrets Manager, IRSA, GitHub OIDC role |
| `k8s/` | EKS manifests: ace, ai-triage (IRSA + RBAC), kube-prometheus-stack values, ollama |
| `.github/workflows/` | ci-cd (build→Trivy→ECR→EKS), ai-validate (gate→PR comment), terraform (+Checkov) |
| `website/` | this showcase: code browser + Start Demo live runner (SSE) |
| `docs/` | AWS runbook, GitHub token setup |

## AWS deployment

See [docs/aws-deployment.md](docs/aws-deployment.md). Cost discipline: `terraform apply`
when working, `terraform destroy` after each session — ephemeral environments by design.

## Design notes (say these in interviews)

- **The LLM is never the only gate.** The validation gate checks a hard numeric
  threshold (post-deploy CPU < 0.3 cores) first; the LLM verdict is advisory.
- **No long-lived credentials anywhere**: GitHub Actions assumes an IAM role via OIDC;
  the triage pod reaches Bedrock/S3/Secrets Manager via IRSA.
- **Same incident, same evidence, three LLM backends** behind one `complete(prompt)`
  interface — demo free with Ollama, talk enterprise with Bedrock.

## Resume bullet this earns

> Built an AIOps remediation pipeline on AWS (EKS, ECR, S3, IAM/IRSA, Secrets Manager,
> provisioned with Terraform): Prometheus alerts trigger an LLM triage service (Claude
> via Amazon Bedrock, with pluggable local Ollama backend) that generates RCA and
> proposed fixes as GitHub issues; the CI/CD pipeline redeploys the fix and an AI
> validation gate verifies recovery from live metrics.
