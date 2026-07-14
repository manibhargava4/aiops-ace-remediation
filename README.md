<div align="center">

# ⚡ AIOps ACE Remediation

### AI-driven incident detection, root-cause analysis, and validated remediation

*A hung thread pegs a CPU. An LLM reads the evidence and writes the RCA. The fix ships.
A hard metric gate proves recovery — before you've opened your laptop.*

[![Python](https://img.shields.io/badge/Python-3.11+-3776AB?style=flat-square&logo=python&logoColor=white)](https://www.python.org/)
[![Terraform](https://img.shields.io/badge/Terraform-EKS%20%7C%20ECR%20%7C%20IRSA-844FBA?style=flat-square&logo=terraform&logoColor=white)](https://www.terraform.io/)
[![Kubernetes](https://img.shields.io/badge/Kubernetes-minikube%20%7C%20EKS-326CE5?style=flat-square&logo=kubernetes&logoColor=white)](https://kubernetes.io/)
[![Prometheus](https://img.shields.io/badge/Prometheus-alerting-E6522C?style=flat-square&logo=prometheus&logoColor=white)](https://prometheus.io/)
[![GitHub Actions](https://img.shields.io/badge/CI%2FCD-Jenkins%20%7C%20Actions%20%7C%20ArgoCD-2088FF?style=flat-square&logo=githubactions&logoColor=white)](https://github.com/features/actions)
[![LLM](https://img.shields.io/badge/LLM-Ollama%20%7C%20Claude%20%7C%20Bedrock-8A2BE2?style=flat-square)](#llm-backends)

</div>

---

## What this is

```
[1] Buggy ACE app (hung-thread ESQL) ── built by CI → ECR → EKS (Terraform infra)
[2] Prometheus detects CPU spike ──► Grafana dashboard
[3] Alertmanager ──► AI Triage (FastAPI): logs + metrics + ESQL source
        └► LLM (Ollama local / Claude via Anthropic API or Bedrock) → RCA + fix diff → GitHub issue
[4-5] Fix merged → build → Trivy → ECR → EKS deploy (GitHub OIDC, no keys)
[6] AI Validation Gate: hard CPU threshold + advisory LLM verdict → PR comment
```

A production incident lifecycle, fully automated and fully demoable — end to end, live,
in your browser.

## The showcase site

An immersive, cinematic front end for the whole pipeline — not a static dashboard.

- **Loader → gateway → world select** — a full-screen intro states the incident, then a
  scroll-driven transition assembles a game-style **Local | AWS Cloud** picker.
- **Two distinct worlds, one app** — Local is bright/blue, AWS Cloud is dark/amber;
  each has its own hero copy, architecture diagram, and demo surface.
- **Live, animated architecture diagrams** per mode — real SVG flow diagrams with
  animated pulses tracing the actual request/data path (no static screenshots).
- **GSAP + Three.js motion** — scroll-triggered reveals, a particle-field backdrop that
  travels with scroll, a magnetic-hover / blend-mode circle cursor, horizontal-scroll
  pipeline walkthrough.
- **Live demo runner** — streams the real incident loop over SSE: deploy → CPU spike →
  alert → AI-written RCA → redeploy → validation gate, with a live CPU chart.
- **CI/CD tab** — pick **Jenkins** (push) or **GitHub Actions → ArgoCD** (pull GitOps)
  and watch the pipeline run against a real local Kubernetes cluster.

## Three ways to run it

| Mode | Stack | Where |
|---|---|---|
| **Local demo** | Docker Compose + Ollama | website "Live Demo" — the full incident loop in ~7 min |
| **Local Kubernetes** | minikube + **Jenkins (push)** or **GitHub Actions → GHCR → ArgoCD (pull GitOps)** | website "CI/CD" tab · [ci/README.md](ci/README.md) |
| **AWS** | EKS/ECR/IRSA/OIDC/Bedrock via Terraform | website Cloud mode + [docs/aws-deployment.md](docs/aws-deployment.md) |

Cloud mode never fakes readiness — it probes for real AWS credentials and an EKS context
before enabling its demo, and says exactly what's missing when it can't.

## Learn / own this project

| Doc | What it's for |
|---|---|
| [STUDY.md](STUDY.md) | Concepts + interview prep per component, 7-day study plan |
| [docs/BUILD_JOURNAL.md](docs/BUILD_JOURNAL.md) | How it was built — every decision vs. its alternatives |
| [docs/EXTENSIONS_GUIDE.md](docs/EXTENSIONS_GUIDE.md) | Four features to build yourself — guided, no code given |

## Quick start (local, free, offline LLM)

Prereqs: Docker Desktop running, [Ollama](https://ollama.com) with `ollama pull qwen3:8b`, Python 3.11+.

```powershell
pip install fastapi uvicorn requests
python website/server.py
# open http://localhost:8080 → Local → Live Demo → Start Demo
```

The website runs the whole loop live (~6–10 min): deploy buggy release → CPU spike →
alert fires → AI writes the RCA → fixed flow redeployed → validation gate passes.

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
| `ci/` | local registry, Jenkins-as-code pipeline, `k8s/local/` deploy target |
| `terraform/` | AWS: VPC, EKS (spot), ECR, S3 evidence, Secrets Manager, IRSA, GitHub OIDC role |
| `k8s/` | EKS + local manifests: ace, ai-triage (IRSA + RBAC), kube-prometheus-stack values, ArgoCD Application |
| `.github/workflows/` | ci-cd (build→Trivy→ECR/GHCR→deploy), ai-validate (gate→PR comment), terraform (+Checkov) |
| `website/` | the showcase above — animated dual-world site + live demo/CI/CD runner (SSE) |
| `docs/` | AWS runbook, GitHub token setup |

## AWS deployment

See [docs/aws-deployment.md](docs/aws-deployment.md). Cost discipline: `terraform apply`
when working, `terraform destroy` after each session — ephemeral environments by design.
