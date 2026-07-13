# Local CI/CD — two pipelines, two deployment philosophies

| | Jenkins (`ci/Jenkinsfile`) | GitHub Actions + ArgoCD (`local-cd.yaml`) |
|---|---|---|
| Model | **Push-based** — pipeline holds cluster creds, runs `kubectl apply` | **Pull-based GitOps** — CI only commits new image tags; ArgoCD *in the cluster* reconciles to git |
| Registry | local `registry:2` (fully offline) | GHCR (`ghcr.io/manibhargava4/*`) |
| Drift handling | none — manual edits go unnoticed | detected + self-healed by ArgoCD |
| Rollback | re-run older build | `git revert` |

Both deploy the same `k8s/local/` kustomization to minikube.

## One-time setup

```powershell
# 1. minikube must trust the local registry (flag applies at cluster creation)
minikube delete
minikube start --insecure-registry="host.minikube.internal:5000"

# 2. Export a kubeconfig with embedded certs for the Jenkins container (gitignored)
kubectl config view --flatten --minify > ci/kubeconfig

# 3. Registry + Jenkins up   (Jenkins UI: http://localhost:8081, admin/admin)
docker compose -f ci/docker-compose.ci.yml up -d --build

# 4. (GitOps path) Install ArgoCD + the Application
kubectl create namespace argocd
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
kubectl apply -f k8s/argocd/application.yaml
# ArgoCD UI: kubectl -n argocd port-forward svc/argocd-server 8082:443
#   user: admin, password: kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d  (use a base64 decoder on Windows)

# 5. (GitOps path) Make the GHCR packages public after the first workflow run:
#    github.com/manibhargava4?tab=packages → ace-sim / ai-triage → Package settings →
#    Change visibility → Public. (Otherwise minikube can't pull them.)

# 6. (optional, offline CI demo) act — runs the workflow locally, build+scan stages
winget install nektos.act
```

## Running

- **Jenkins**: website → CI/CD tab → Jenkins → Run. Or Jenkins UI → `aiops-local-pipeline` → Build Now.
- **GitOps**: website → CI/CD tab → GitOps → Run. Or `gh workflow run gitops-cd` (or just push a change to `app/`/`ai-triage/`). Watch ArgoCD sync: `kubectl -n argocd get app aiops-ace -w`.
- **act (offline)**: `act push -W .github/workflows/local-cd.yaml` — build+Trivy stages only.

## Triggering the incident on minikube

The k8s deployment starts with `BUG_MODE=true`, so the incident begins on deploy:

```powershell
kubectl -n monitoring port-forward svc/prometheus 9091:9090   # watch the alert at localhost:9091/alerts
kubectl -n aiops port-forward svc/ai-triage 9001:9000         # triage API
kubectl -n aiops exec deploy/ai-triage -- ls /incidents        # RCA appears here
```

The "fix" in GitOps style: edit `k8s/local/ace-sim.yaml` → `BUG_MODE: "false"` → commit
→ push → ArgoCD rolls it out. That commit *is* the deployment.

## Notes / honest trade-offs

- Jenkins runs as **root** with the docker socket mounted — fine for a local lab,
  never for shared infrastructure (that's what agents/rootless builds are for).
- `ci/kubeconfig` contains cluster-admin credentials for your minikube — it is
  gitignored; keep it that way.
- The Jenkinsfile rewrites the API server to `host.docker.internal` with
  `--insecure-skip-tls-verify` because minikube's cert doesn't carry that name —
  local-only shortcut; in real life you'd mint a cert with the right SAN.
