# DESIGN.md — AIOps Incident Pipeline showcase

> Reverse-engineered from the codebase, then given direction (the impeccable
> `document` → `init` flow, done by hand). Register, palette strategy, and motion
> language for the site. The full token system lives in
> [design-system/MASTER.md](design-system/MASTER.md).

## Product

A living-resume showcase for an **AI-driven incident remediation pipeline**: a hung
IBM ACE flow thread pegs a CPU, Prometheus alerts, an AI reads the evidence and writes
the RCA, the fix ships through CI/CD, and a validation gate proves recovery. The site
must read as **software-craft, not marketing** — a technical audience (recruiters,
staff engineers) judging whether the author has taste *and* rigor.

## Register

**Brand-led** (the design IS the product here — it's a portfolio piece) but drawn in a
**product/tool visual language**, not a campaign one. Reference point: **Linear** —
"software-craft documentation: dense, technical, quietly luxurious." Not a startup
landing page; a precision instrument.

## Direction

- **Theme — dark, and earned.** Physical scene: a staff engineer, late, reviewing an
  incident timeline on a second monitor. Near-black canvas is the natural habitat of
  observability tooling (Grafana, Datadog, the terminal). Not "dark because tools look
  cool" — dark because this *is* an ops surface.
- **Color strategy — Committed, single accent.** One saturated signal color carries the
  identity; everything else is near-black surface + light ink + hairline borders. The
  accent is **earned by the product story**, not decoration: the pipeline turns
  **CRITICAL → HEALED**, so the brand accent is a **signal green** (recovery, health,
  "self-healing"), and a **controlled danger red** appears *only* in the incident/alert
  context. This is the opposite of the purple-blue AI-gradient default.
- **The hero is technical, not stock.** A live **WebGPU / Three.js TSL** GPU-compute
  particle field — a "metric stream" that flows calm-green and turbulent-red, wired to
  the *actual* incident state (it spikes red when the live demo's CPU crosses the alert
  threshold, heals to green when the fix lands). The centerpiece proves the craft it
  advertises. Degrades to a static field on no-WebGPU / reduced-motion.
- **Type — grotesk display + monospace machinery.** Two families on a contrast axis:
  **Space Grotesk** (display + body, tight negative tracking) and **IBM Plex Mono**
  (all technical text — labels, data, code, nav; a deliberate nod to the IBM ACE
  subject). No Inter/Roboto/system-sans (the AI defaults).
- **Motion — intentional, expo ease-out, 150–300ms.** Scroll-reveals that enhance an
  already-visible default (never gate content on JS). Magnetic + tilt micro-interactions
  on interactive elements. A cinematic mode-transition between Local and AWS. Full
  `prefers-reduced-motion` path (crossfade/instant).

## Two surfaces, one system

**Local** and **AWS Cloud** are distinct compositions on the same tokens — Local leans
mono/terminal/scanline; Cloud leans wider rhythm and an orbital motif. Same near-black
canvas, same accent discipline; the *accent theme* can shift (signal-green default;
flux-cyan, ember-amber, iris-indigo alternates) but the canvas and the restraint never do.

## Anti-patterns explicitly avoided (impeccable catalog)

- ❌ Glassmorphism as the default panel → replaced with **hairline-bordered charcoal
  surfaces** (Linear pattern); blur used only where it materially helps (the sticky nav).
- ❌ Tracked uppercase eyebrow above every section → a **single deliberate mono index
  label** system (e.g. `01 / DETECT`), used as brand grammar, not on every heading.
- ❌ Display type shouting → hero clamp max **≤ 6rem (96px)**.
- ❌ Purple-blue AI gradient → single **solid** signal accent, never a gradient on text.
- ❌ Gray text on tint → body ink verified **≥ 4.5:1**; muted ink kept ≥ 4.5:1 too.
- ❌ Identical card grids / nested cards → asymmetric stage layout; surfaces never nest.
- ❌ Side-stripe borders → full hairline borders or leading mono numerals.
