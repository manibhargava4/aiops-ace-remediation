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

## Direction (v3 — cinematic editorial)

Genre reference (client-selected): **stabondar.com**, **nivora**, **designisfunny** —
oversized-typography, motion-led, awwwards-tier portfolio sites. The v2 "restrained tool"
look was correct-but-quiet; this is the same rigor turned up to a statement.

- **Theme — dark canvas, vivid accent.** `#0A0A0A` near-black, warm off-white ink
  (`#F4F3EF`), and **one vivid accent** — an **electric lime** (`#C7F94E`) that reads as
  "signal / self-healing / alive." Danger-red reserved for the incident state. (Both
  stabondar `#111` and nivora `#000` + lime `#83CA16` land here.)
- **Type is the design — enormous.** Display runs up to **~180px** (`13vw`), breaking the
  restrained ≤96px ceiling on purpose: in this genre the words *are* the composition.
  Three families: **Clash Display** (huge display, the awwwards grotesk), **Instrument
  Serif italic** (the editorial counterpoint — accent words set in italic serif, the
  stabondar/nivora signature), and **IBM Plex Mono** (machinery: labels, data, code).
- **Motion — cinematic, Lenis smooth scroll.** Buttery inertial scroll (Lenis) + GSAP:
  hero words **rise out of overflow masks** on load (`expo.out`, staggered), sections
  reveal on scroll, a **marquee ticker** (detect · *diagnose* · remediate · *verify*),
  blend-difference cursor + nav, magnetic buttons, a full-screen wipe on mode change.
- **Layout — editorial, spacious.** Big index numerals (`01`–`06`) on full-bleed
  pipeline rows (not cards), generous negative space, asymmetric baseline-aligned heads,
  an oversized `Built to heal itself.` footer statement.
- **The hero stays technical.** The live **WebGPU / Three.js TSL** GPU-compute particle
  "metric stream" persists as the immersive layer *behind* the type, recoloured to the
  accent and wired to the real incident state. Degrades on no-WebGPU / reduced-motion.
- **Accessibility holds under the drama.** WCAG AA throughout, full
  `prefers-reduced-motion` path (no Lenis, no marquee, no 3D, no mask animation — content
  visible in base CSS), keyboard-reachable, 44px targets.

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
