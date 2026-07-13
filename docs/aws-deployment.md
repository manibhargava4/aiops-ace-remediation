# AWS deployment runbook

> **Cost discipline first:** EKS control plane ≈ $73/month + nodes. `terraform apply`
> when working, `terraform destroy` after each session. Set an AWS Budget alert at $10
> on day one. Doing this deliberately is itself an interview story: *ephemeral
> environments by design*.

## 0. One-time bootstrap

```bash
# State bucket + lock table (names must match terraform/backend.tf)
aws s3 mb s3://aiops-ace-remediation-tfstate --region us-east-1
aws dynamodb create-table --table-name aiops-tf-lock \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST
```

## 1. Provision

```bash
cd terraform
terraform init
terraform apply -var "github_repo=<youruser>/aiops-ace-remediation"
# If your AWS account already has the GitHub OIDC provider:
#   -var "create_github_oidc_provider=false"
```

Record the outputs: `github_ci_role_arn`, `triage_irsa_role_arn`, `ecr_repository_urls`,
`evidence_bucket`. Add the GitHub repo secrets (see docs/github-token-setup.md).

Destroy/recreate at least twice to prove idempotency.

## 2. Monitoring stack

```bash
aws eks update-kubeconfig --name aiops-ace-eks
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm install kube-prometheus-stack prometheus-community/kube-prometheus-stack \
  -n monitoring --create-namespace -f k8s/monitoring/kube-prometheus-stack-values.yaml
kubectl apply -f k8s/monitoring/alert-rules.yaml
```

## 2b. GitHub token via External Secrets (optional — for real RCA issues on EKS)

The triage pod reads `GITHUB_TOKEN` from a Kubernetes Secret named `github-token`.
Rather than create it by hand, sync it from AWS Secrets Manager:

```bash
# store the token in Secrets Manager
aws secretsmanager create-secret --name aiops-ace/github-token \
  --secret-string '{"token":"github_pat_..."}'

# install the operator + apply the SecretStore/ExternalSecret (uses IRSA — no keys)
helm repo add external-secrets https://charts.external-secrets.io
helm install external-secrets external-secrets/external-secrets \
  -n external-secrets --create-namespace
kubectl apply -f k8s/ai-triage/external-secrets.yaml
```

The operator now keeps the `github-token` Secret in sync with Secrets Manager, refreshed hourly.

## 3. Deploy apps

Push to `main` — the `ci-cd` workflow builds, Trivy-scans, pushes to ECR and deploys to
EKS via the OIDC role. (Or `kubectl apply` the k8s manifests manually after substituting
the image/role placeholders.)

## 4. Run the incident

```bash
# ace-sim deploys with BUG_MODE=true; within ~5 min ACEHighCPU fires,
# the triage pod (Bedrock via IRSA) writes the RCA and files the GitHub issue.
kubectl -n ace logs deploy/ace-sim -f
```

Fix = PR flipping `BUG_MODE` to `false` (or swapping in the fixed ESQL); merging runs
ci-cd, then `ai-validate` comments the gate result on the commit.

## 5. Tear down

```bash
helm uninstall kube-prometheus-stack -n monitoring
terraform destroy -var "github_repo=<youruser>/aiops-ace-remediation"
```

## Real IBM ACE (reference)

The demo simulates ACE for speed. To run the real thing, replace `app/` with:

```dockerfile
FROM icr.io/appc/ace:13.0.1.0-r1  # IBM ACE Developer edition
COPY OrderFlow.bar /home/aceuser/bars/
ENV LICENSE=accept
# BAR built with: ibmint package --input-path ./ace-project --output-bar-file OrderFlow.bar
```

Metrics then come from cAdvisor (`container_cpu_usage_seconds_total`) instead of the
app's own /metrics — the k8s alert rule already uses that expression.
