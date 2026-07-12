# Remote state: S3 + DynamoDB locking.
# Bootstrap once (bucket + table) before `terraform init`, or comment this
# block out for the first local run.
terraform {
  backend "s3" {
    bucket         = "aiops-ace-remediation-tfstate" # must be globally unique — change it
    key            = "aiops/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "aiops-tf-lock"
    encrypt        = true
  }
}
