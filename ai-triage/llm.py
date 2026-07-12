"""LLM backend abstraction: LLM_BACKEND=ollama | anthropic | bedrock.

Same prompt, three backends — demo free/offline with Ollama,
run Claude via the Anthropic API or Amazon Bedrock in the cloud.
"""

import os

import requests


class OllamaClient:
    def __init__(self):
        self.host = os.environ.get("OLLAMA_HOST", "http://host.docker.internal:11434")
        self.model = os.environ.get("OLLAMA_MODEL", "qwen3:8b")

    def complete(self, prompt: str) -> str:
        r = requests.post(
            f"{self.host}/api/generate",
            json={"model": self.model, "prompt": prompt, "stream": False},
            timeout=600,
        )
        r.raise_for_status()
        text = r.json()["response"]
        # qwen3 emits <think>...</think> before the answer; strip it
        if "</think>" in text:
            text = text.split("</think>", 1)[1]
        return text.strip()


class AnthropicClient:
    def __init__(self):
        import anthropic

        self.client = anthropic.Anthropic()  # reads ANTHROPIC_API_KEY
        self.model = os.environ.get("ANTHROPIC_MODEL", "claude-opus-4-8")

    def complete(self, prompt: str) -> str:
        with self.client.messages.stream(
            model=self.model,
            max_tokens=16000,
            thinking={"type": "adaptive"},
            messages=[{"role": "user", "content": prompt}],
        ) as stream:
            msg = stream.get_final_message()
        return next(b.text for b in msg.content if b.type == "text")


class BedrockClient:
    """Auth via IRSA on EKS — no keys in the pod."""

    def __init__(self):
        from anthropic import AnthropicBedrockMantle

        self.client = AnthropicBedrockMantle(aws_region=os.environ.get("AWS_REGION", "us-east-1"))
        self.model = os.environ.get("BEDROCK_MODEL", "anthropic.claude-opus-4-8")

    def complete(self, prompt: str) -> str:
        with self.client.messages.stream(
            model=self.model,
            max_tokens=16000,
            thinking={"type": "adaptive"},
            messages=[{"role": "user", "content": prompt}],
        ) as stream:
            msg = stream.get_final_message()
        return next(b.text for b in msg.content if b.type == "text")


def get_llm():
    backend = os.environ.get("LLM_BACKEND", "ollama")
    return {"ollama": OllamaClient, "anthropic": AnthropicClient, "bedrock": BedrockClient}[backend]()
