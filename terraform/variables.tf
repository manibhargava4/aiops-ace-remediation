variable "region" {
  type    = string
  default = "us-east-1"
}

variable "project" {
  type    = string
  default = "aiops-ace"
}

variable "cluster_version" {
  type    = string
  default = "1.31"
}

variable "github_repo" {
  description = "GitHub repo allowed to assume the CI role, e.g. youruser/aiops-ace-remediation"
  type        = string
}

variable "create_github_oidc_provider" {
  description = "true if the account doesn't already have the GitHub OIDC provider"
  type        = bool
  default     = true
}

variable "anthropic_api_key" {
  description = "Optional: stored in Secrets Manager for LLM_BACKEND=anthropic"
  type        = string
  default     = ""
  sensitive   = true
}
