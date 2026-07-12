output "cluster_name" {
  value = module.eks.cluster_name
}

output "ecr_repository_urls" {
  value = { for k, r in aws_ecr_repository.repos : k => r.repository_url }
}

output "evidence_bucket" {
  value = aws_s3_bucket.evidence.bucket
}

output "triage_irsa_role_arn" {
  value = module.triage_irsa.iam_role_arn
}

output "github_ci_role_arn" {
  value = aws_iam_role.ci.arn
}
