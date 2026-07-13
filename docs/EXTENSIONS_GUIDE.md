# Extensions Guide — Features YOU Build

Four self-build tracks, ordered easiest → hardest. **This guide contains no code on
purpose.** It tells you what to build, where, what to read first, and how to know
you've succeeded — you write every line. When you're stuck for more than ~45 minutes
on one step, ask Claude to *review your attempt* (paste what you tried), not to write
it. The moment someone hands you the code, this stops being yours.

Each track ends with the interview story it earns. Do at least one; Track 1 is the
best learning-per-hour.

---

## Track 1 — A second alert type: memory leak (≈ half a day)

**Goal:** the pipeline currently detects one failure mode (CPU). Add a second: a slow
memory leak in ace-sim that triggers its own alert, its own triage, and its own RCA.
This exercises *every layer* of the stack once, end to end.

**Files you'll touch:** `app/main.py` · `monitoring/alert_rules.yml` ·
`monitoring/grafana/dashboards/ace-cpu.json` · `ai-triage/main.py` (prompt) ·
optionally `website/demo.py` (a leak-mode demo).

**Read first:**
- Prometheus metric types (gauge vs counter): https://prometheus.io/docs/concepts/metric_types/
- The existing `ACEHighCPU` rule in `monitoring/alert_rules.yml` — your template
- `process_resident_memory_bytes` — prometheus_client exports it already (check
  `curl localhost:8000/metrics/` while the stack runs!)

**Build steps (described, not written):**
1. **Introduce the leak.** In `app/main.py`, add a module-level list; in the worker
   loop, when a new env var (e.g. `LEAK_MODE`) is true, append a chunk of bytes
   (say ~1 MB) per processed message and never release it. Think: why a *list of
   bytes objects* leaks but a local variable doesn't (references + GC).
2. **Confirm the metric moves.** Run the stack with your new env var on, watch
   `process_resident_memory_bytes` climb on `/metrics/` and in Prometheus's graph UI
   (localhost:9090 → Graph). No alert yet — evidence first.
3. **Write the rule.** New alert (e.g. `ACEMemoryLeak`) in `alert_rules.yml`. Two
   viable expressions — pick one and be able to defend it: an absolute threshold on
   the gauge, or a *trend* using `deriv()` or `predict_linear()` ("will it exceed X
   within an hour?"). The trend form is the impressive one. Choose a `for:` duration
   and justify it.
4. **Make the alert route.** Nothing to do — inspect `alertmanager.yml` and explain
   to yourself *why* it already routes (hint: the route matches all alerts). Verify
   in the Alertmanager UI (localhost:9093) when it fires.
5. **Teach triage the difference.** The webhook currently handles any alert but the
   prompt narrates a CPU incident. Make the prompt use the alert's own name/labels
   (look at what `alert_payload` contains — print it) so the LLM narrates the right
   incident. Also think: the collectors grab the *buggy ESQL* — what's the right
   "source" evidence for a memory leak? (Maybe the Python file itself.)
6. **Dashboard.** Add a memory panel next to the CPU panel in the Grafana dashboard
   JSON (copy the CPU panel object, change expr/title/thresholds — read the JSON,
   don't fear it).
7. **Prove the loop.** Full run: leak on → alert fires → RCA lands in `incidents/`
   naming the memory growth. Screenshot everything.

**Checkpoints:** metric visibly climbing (step 2) · alert `pending`→`firing` in
Prometheus UI (step 4) · an `incidents/<id>/rca.md` that talks about *memory*, not
CPU (step 7).

**Interview story earned:** "The original project detected CPU spikes; I extended it
with a second failure class — a memory leak — including a predictive PromQL rule
using `predict_linear`, and made the AI triage prompt incident-type-aware."

---

## Track 2 — A Grafana panel + alert annotations (≈ 2–3 hours)

**Goal:** make the dashboard tell the incident story visually: a DLQ/messages-failed
panel, plus vertical annotation lines marking when `ACEHighCPU` fired.

**Files:** `monitoring/grafana/dashboards/ace-cpu.json` only.

**Read first:**
- Grafana dashboard JSON model: https://grafana.com/docs/grafana/latest/dashboards/build-dashboards/view-dashboard-json-model/
- Grafana annotations (Prometheus datasource): https://grafana.com/docs/grafana/latest/dashboards/build-dashboards/annotate-visualizations/
- PromQL `rate()` on counters (you'll plot `ace_messages_failed_total`).

**Build steps:**
1. In a *running* Grafana, build the panel by hand first (Edit → add panel → query
   `rate(ace_messages_failed_total[5m])`). Iterate until it looks right.
2. Export the dashboard JSON (Share → Export), diff it against the repo file, and
   port your panel into the provisioned JSON — this teaches you the provisioning
   round-trip everyone gets wrong.
3. Add an `annotations` block querying the Prometheus `ALERTS` series
   (`ALERTS{alertname="ACEHighCPU",alertstate="firing"}`) so firing periods draw on
   every panel.
4. Restart the stack; confirm your panel and annotations survive provisioning
   (this is the real test — hand-built panels die on container recreate).

**Checkpoints:** DLQ rate panel shows a step up when the *fixed* flow handles poison
messages (why? think about which counter moves in which mode) · red annotation band
appears over the incident window after a demo run.

**Interview story:** "I extended the provisioned dashboard — not click-ops; I work
in the dashboard JSON model so panels survive redeployment — and added alert
annotations correlating firing windows with the metrics."

---

## Track 3 — SNS email fan-out (≈ half a day; touches AWS, ~$0)

**Goal:** when a P1 fires in the cloud deployment, a human also gets an email —
Alertmanager keeps webhooking triage AND notifies via Amazon SNS. (SNS
publish+email is effectively free at this volume.)

**Files:** `terraform/` (new resources) · `k8s/monitoring/kube-prometheus-stack-values.yaml`
(second receiver) · `docs/aws-deployment.md` (one line in the runbook).

**Read first:**
- Terraform `aws_sns_topic` + `aws_sns_topic_subscription` docs
- Alertmanager receivers — there's no native SNS receiver in older versions; check
  your Alertmanager version's docs: newer ones have `sns_configs` built in. Find out
  which you have. If native `sns_configs` exists: what IAM does Alertmanager's pod
  need to publish? (This should smell like the IRSA pattern you already have.)
- Alertmanager routing trees: `routes:`, `continue:` — how one alert reaches *two*
  receivers.

**Build steps:**
1. Terraform: an SNS topic + an email subscription (your address). Understand why
   the subscription is `pending` until you click the confirmation email — and why
   Terraform can't confirm it for you.
2. IAM: extend the IRSA pattern — either a new role for Alertmanager's
   ServiceAccount or (simpler, defensible for a POC) reuse a policy attached to the
   triage role and have *triage* publish to SNS in `reporter.py`-style. **Decide and
   write down why.** (Two valid architectures; choosing consciously is the exercise.)
3. Wire the receiver: either Alertmanager `sns_configs` (pure config) or a publish
   call in the triage service (code path). Match your step-2 decision.
4. Route: P1/critical alerts → both receivers (`continue: true` on the first route).
5. Test without AWS spend: `aws sns publish` from your terminal first, then the real
   path when you next apply the infra.

**Checkpoints:** subscription confirmed · test publish arrives in your inbox ·
(post-apply) a demo incident produces both a GitHub issue and an email.

**Interview story:** "I added human notification fan-out via SNS with
least-privilege IAM through IRSA, and I can explain why I chose
config-level (Alertmanager) vs code-level (service) publishing."

---

## Track 4 — Real IBM ACE image (≈ 1–2 days; the authenticity capstone)

**Goal:** replace the simulator with an actual IBM ACE container running a real
message flow with your ESQL — proving the ACE parts of your resume with running
software.

**Files:** new `ace-real/` directory (Dockerfile, ACE project, BAR build notes) ·
`docker-compose.yml` (alternate service) · `monitoring/prometheus.yml` (scrape
change).

**Read first:**
- ACE in containers: https://github.com/ot4i/ace-docker and the
  `icr.io/appc/ace` image docs (Developer edition license terms — `LICENSE=accept`)
- `ibmint package` (building a BAR from the command line — no toolkit UI needed)
- How you'll get CPU metrics for a container that doesn't export
  `process_cpu_seconds_total`: cAdvisor. Read what cAdvisor is and how to run it as
  a compose service; your alert expr changes to
  `container_cpu_usage_seconds_total` — you already have the k8s variant of this
  rule as a reference.

**Build steps:**
1. Pull and run the bare ACE image; get the integration server console (port 7600)
   open. (Expect a multi-GB pull — do it on good wifi.)
2. Create a minimal ACE project: an HTTP Input → Compute → HTTP Reply flow. Put your
   `TRANSFORM_ORDER_buggy.esql` logic in the Compute node (the repo's ESQL files are
   your starting point — they were written to be real).
3. Build the BAR with `ibmint package`, bake it into your image, deploy it at
   container start.
4. Reproduce the incident: POST a poison message (AccountId null) to the flow's HTTP
   endpoint. Watch a real ACE flow thread hang (the console shows flow thread state —
   this is the exact thing you saw in production).
5. Metrics path: add cAdvisor to compose, point Prometheus at it, adjust the alert
   expr. The rest of the pipeline — Alertmanager, triage, LLM, RCA — should work
   *unchanged*. If you understand why, you understand the architecture.
6. Update the triage collector's "source" path to your real ESQL.

**Checkpoints:** flow answers a valid message · poison message hangs a real flow
thread (console shows it; CPU climbs) · `ACEHighCPU` fires from cAdvisor data ·
RCA cites your real ESQL.

**Interview story:** the strongest one available to you: "The pipeline runs against
actual IBM ACE — I built the BAR headlessly with ibmint, reproduced the hung-thread
incident in a real integration server, and swapped the metrics source to cAdvisor
without touching the triage layer, because the architecture isolates detection from
diagnosis."

---

## Working rules (all tracks)

1. **Git like it's a team repo:** a branch per track (`feature/memory-leak-alert`),
   small commits with real messages, merge with `--no-ff`. Your git history is part
   of the artifact.
2. **Evidence or it didn't happen:** screenshot each checkpoint into
   `docs/screenshots/` — they become README material and interview props.
3. **Write 5 lines in BUILD_JOURNAL.md per track** (what/why/decision table row) —
   in your own words. That document should end up co-authored.
4. **Asking for help:** show your diff and the error, ask "why is this wrong", never
   "write it". Reviewing your working version at the end is fair game.
