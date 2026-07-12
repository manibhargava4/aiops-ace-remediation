# GitHub setup (optional — the demo works without it)

With a token, the AI triage service files the RCA as a real GitHub issue.

## Easiest: GitHub CLI

```powershell
winget install GitHub.cli
gh auth login          # GitHub.com → HTTPS → login via browser
gh repo create aiops-ace-remediation --public --source . --push
```

## Fine-grained personal access token (for the triage service)

1. GitHub → **Settings → Developer settings → Fine-grained personal access tokens → Generate new token**
2. Repository access: **only** `aiops-ace-remediation`
3. Permissions: **Issues → Read and write** (that's all the triage service needs)
4. Put it in `.env` (gitignored):

```
GITHUB_TOKEN=github_pat_...
GITHUB_REPO=<youruser>/aiops-ace-remediation
```

Restart the stack (`docker compose up -d ai-triage`) and the next incident creates an issue.

## CI/CD workflows

The GitHub Actions workflows use the built-in `GITHUB_TOKEN` — no extra scopes.
They need three repository secrets after `terraform apply`:

| Secret | Source |
|---|---|
| `AWS_CI_ROLE_ARN` | `terraform output github_ci_role_arn` |
| `AWS_ACCOUNT_ID` | your account id |
| `TRIAGE_IRSA_ROLE_ARN` | `terraform output triage_irsa_role_arn` |
