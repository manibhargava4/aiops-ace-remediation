# PRODUCT.md

## What
A living-resume showcase site for an **AI-driven incident remediation pipeline**
(detect → diagnose with an LLM → fix → verify), running locally (Docker/minikube) and
on AWS (EKS). The site both explains the system and runs it live.

## Who
Technical hiring audience — recruiters, staff/principal engineers, hiring managers —
evaluating the author's DevOps/AIOps depth *and* design taste.

## Register
**brand** — the design is part of the product (it's a portfolio piece), drawn in a
product/tool visual language (Linear-like software-craft), not a marketing-campaign one.

## Platform
web

## Primary surfaces
- Hero (WebGPU/TSL particle "metric stream", wired to live incident state)
- Pipeline narrative (6 asymmetric stages)
- Live demo runner (SSE: timeline, CPU chart, RCA, validation verdict)
- CI/CD runner (Jenkins push vs GitHub-Actions+ArgoCD pull)
- Cloud readiness + code browser
- Local ⇄ AWS mode switch; 4 accent themes

## Non-negotiables
- WCAG AA contrast throughout; full `prefers-reduced-motion` path; keyboard-reachable.
- No capability is load-bearing for content (3D, GSAP, fonts all degrade).
- The AI is never the only gate (mirrored in the product and stated on the site).

See DESIGN.md for direction and design-system/MASTER.md for tokens.
