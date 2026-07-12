"""Evidence collectors: container logs + Prometheus metrics + flow source.

Locally logs come from the Docker socket; on EKS set LOG_SOURCE=k8s and the
kubernetes client reads pod logs via the API (RBAC: pods/log get).
"""

import os

import requests

PROMETHEUS_URL = os.environ.get("PROMETHEUS_URL", "http://prometheus:9090")
TARGET_CONTAINER = os.environ.get("TARGET_CONTAINER", "ace-sim")
FLOW_SOURCE_PATH = os.environ.get("FLOW_SOURCE_PATH", "/flows/TRANSFORM_ORDER_buggy.esql")


def get_logs(tail: int = 200) -> str:
    if os.environ.get("LOG_SOURCE") == "k8s":
        from kubernetes import client, config

        config.load_incluster_config()
        pods = client.CoreV1Api().list_namespaced_pod(
            os.environ.get("K8S_NAMESPACE", "ace"), label_selector="app=ace"
        )
        return client.CoreV1Api().read_namespaced_pod_log(
            pods.items[0].metadata.name, os.environ.get("K8S_NAMESPACE", "ace"), tail_lines=tail
        )
    import docker

    return docker.from_env().containers.get(TARGET_CONTAINER).logs(tail=tail).decode(errors="replace")


def get_cpu_series(minutes: int = 15) -> list:
    r = requests.get(
        f"{PROMETHEUS_URL}/api/v1/query",
        params={"query": f"rate(process_cpu_seconds_total{{job='ace-sim'}}[1m])[{minutes}m:30s]"},
        timeout=10,
    )
    result = r.json()["data"]["result"]
    return result[0]["values"] if result else []


def get_flow_source() -> str:
    with open(FLOW_SOURCE_PATH) as f:
        return f.read()
