# Claude Code Design Skills — Installed & How to Use

Four design skills were installed to your user-level Claude config
(`~/.claude/` = `C:\Users\MANI BHARGAVA\.claude\`), so they're available in **every**
Claude Code session on this machine.

> ⚠️ **Restart Claude Code once** after install so it registers the new skills/commands.
> (They were hot-loaded in the session that installed them, but a restart makes the
> slash-commands reliably available everywhere.)

| Skill | Source | Installed to | Invoke with |
|---|---|---|---|
| **impeccable** | [pbakaus/impeccable](https://github.com/pbakaus/impeccable) | `~/.claude/skills/impeccable/` (+ agent) | `/impeccable <command> [target]` |
| **webgpu-threejs-tsl** | [dgreenheck/webgpu-claude-skill](https://github.com/dgreenheck/webgpu-claude-skill) | `~/.claude/skills/webgpu-threejs-tsl/` | ask about "WebGPU / Three.js / TSL" |
| **ui-ux-pro-max** (+ design, design-system, brand, ui-styling, slides, banner-design) | [nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) | `~/.claude/skills/ui-ux-pro-max/` (data + scripts) | `/ui-ux-pro-max` or ask to "design/review UI" |
| **awesome-design-md** | [VoltAgent/awesome-design-md](https://github.com/VoltAgent/awesome-design-md) | `~/.claude/design-references/awesome-design-md/` (74 brand `DESIGN.md` files) | reference by path (not a skill) |

## impeccable — design fluency + anti-pattern detection

23 commands, all invoked as `/impeccable <command> [target]`. The ones this project used:

| Command | What it does |
|---|---|
| `/impeccable document` | Reverse-engineers a `DESIGN.md` from your existing code |
| `/impeccable init` | Captures product context + sets design direction (register, palette strategy) |
| `/impeccable critique` | Read-only design review against its anti-pattern catalog |
| `/impeccable audit` | Deeper audit (accessibility, contrast, responsive, anti-patterns) with fixes |
| `/impeccable polish` | Final production pass — tighten spacing, motion, states |
| `/impeccable craft` / `shape` | Build new pages/features from scratch |
| `/impeccable bolder` / `quieter` / `animate` / `colorize` / `typeset` / `layout` | Targeted transforms |

Example: `/impeccable audit website/static/index.html`

**Its core value = a curated list of AI design tells it refuses to ship**: side-stripe
borders, gradient text, glassmorphism-as-default, hero-metric templates, identical card
grids, per-section uppercase eyebrows, cream/beige "AI default" backgrounds, purple-blue
gradients, muted-gray-on-tint low contrast. It also enforces: OKLCH color, ≤96px display
type, ≥-0.04em tracking, 65–75ch line length, expo ease-out motion, and
`prefers-reduced-motion` alternatives.

## ui-ux-pro-max — searchable design database

84 UI styles · 161 palettes · 73 font pairings · motion specs · 25 chart types, as CSV
data + a Python search backend. Query it directly:

```bash
cd ~/.claude/skills/ui-ux-pro-max
python scripts/search.py "developer devops dark technical" --domain style --format markdown
python scripts/search.py "grotesk mono technical" --domain typography
python scripts/search.py "emerald signal dark" --domain color
python scripts/search.py "<product>" --design-system --persist   # generate a full system
```

Domains: `style, color, chart, landing, product, ux, typography, icons, gsap, react, web, google-fonts`.
In a session, just ask "design a UI for X" or `/ui-ux-pro-max` and it searches for you.

> The **official installer** (`npx ui-ux-pro-max-cli init --ai claude`) wires the data +
> scripts per-platform and is the cleanest way to keep it updated — run it if the search
> script ever can't find its data.

## webgpu-threejs-tsl — WebGPU/Three.js shaders

Guides + runnable examples for WebGPU renderer setup, TSL node materials, GPU compute
particles, post-processing. Just work on anything WebGPU/Three.js/TSL and it activates.
Examples live at `~/.claude/skills/webgpu-threejs-tsl/examples/`.

## awesome-design-md — 74 brand design systems as reference

Not a skill — a library of reverse-engineered `DESIGN.md` files (colors, type scale,
motion, layout) for Linear, Vercel, Stripe, Apple, Framer, Figma, Notion, and 67 more.
Blend these into your own systems (don't copy). Read one with:

```
~/.claude/design-references/awesome-design-md/linear.app/DESIGN.md
```

This project's redesign blended **Linear** (near-black canvas, single restrained accent,
hairline panels, tight display tracking) with a signal-green identity earned from the
product's own story (incident → self-heal).
