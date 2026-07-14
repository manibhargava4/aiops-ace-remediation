# design-system/MASTER.md

> **v3 — cinematic editorial.** Genre reference: stabondar.com (`#111`, Neue Machina +
> Times), nivora (`#000`, 144px type, lime `#83CA16`), designisfunny. Dark canvas,
> enormous **Clash Display** type, **Instrument Serif** italic accents, one **electric-lime**
> accent, **IBM Plex Mono** machinery, **Lenis** smooth scroll + masked word reveals.
> Contrast verified ≥ WCAG AA. The tables below are the v2 restrained system, kept for
> reference; the shipped values live in `website/static/styles.css`. v3 core tokens:
>
> ```
> --bg:#0A0A0A  --surface:#131313  --line:rgba(244,243,239,.13)
> --ink:#F4F3EF  --ink-mid:#C4C3BC  --ink-dim:#9C9B94
> --accent:#C7F94E (lime) | flux #5CE1FF | ember #FF7A3D | iris #B69CFF
> --danger:#FF5A4D  --good:#C7F94E
> --display:"Clash Display"  --serif:"Instrument Serif"(italic)  --mono:"IBM Plex Mono"
> hero display: clamp(3rem, 13vw, 12.5rem)   ease: expo.out / cubic-bezier(.16,1,.3,1)
> ```

## 1. Color — primitives

Near-black canvas, light ink, hairline borders. One accent theme active at a time;
the canvas never changes, only the accent.

```
--canvas       #06070A   /* body — near-black, not pure #000 (avoids OLED smear) */
--surface-1    #0C0E13   /* raised surface (panels) */
--surface-2    #12151C   /* higher surface (code, inputs) */
--hairline     rgba(233,238,247,0.09)   /* default border */
--hairline-2   rgba(233,238,247,0.16)   /* emphasis border / hover */

--ink          #ECEFF4   /* primary text — 16.9:1 on canvas */
--ink-muted    #9AA3B2   /* secondary text — 7.4:1 on canvas (AA body ✓) */
--ink-subtle   #7E8798   /* labels — 5.3:1 on surfaces (AA small-text ✓) */

/* semantic — reserved, never reused as a "series color" */
--danger       #FF5C5C   /* incident / alert / CPU-over-threshold ONLY */
--good         #3DDC97   /* recovery / pass */
--warn         #FFB454
```

### Accent themes (single solid accent; default = signal)

| theme | `--accent` | on-accent text | note |
|---|---|---|---|
| **signal** (default) | `#3DDC97` emerald | `#04150E` | recovery-green; earned by the product story |
| flux | `#35D6E8` cyan | `#03151A` | |
| ember | `#FFB454` amber | `#1A1204` | |
| iris | `#8B93FF` indigo | `#0A0C1E` | Linear-style solid — never a gradient |

`--accent-soft = color-mix(in oklab, var(--accent) 14%, transparent)` for wash fills.
**Rule:** the accent appears on the brand mark, focus rings, one CTA per view, active
states, and data highlights — **never as a decorative gradient, never on body text.**

## 2. Typography

Two families on a contrast axis. No Inter/Roboto/system-sans.

```
--font-display: "Space Grotesk", system-ui, sans-serif;   /* display + body */
--font-mono:    "IBM Plex Mono", ui-monospace, monospace;  /* labels, data, code, nav */
```

| token | size / line / tracking | usage |
|---|---|---|
| display-xl | `clamp(2.75rem, 7vw, 6rem)` / 0.95 / -0.03em | hero (≤96px ceiling) |
| display-lg | `clamp(2.25rem, 5vw, 3.75rem)` / 1.0 / -0.025em | section titles |
| headline | `clamp(1.5rem, 3vw, 2.25rem)` / 1.1 / -0.02em | stage / card titles |
| body-lg | `1.125rem` / 1.6 / -0.01em | hero lead |
| body | `1rem` / 1.65 / -0.005em | prose (max **68ch**) |
| mono-label | `0.72rem` / 1 / **0.16em** uppercase | the index labels (`01 / DETECT`) |
| mono-data | `0.8125rem` / 1.5 | metrics, code, log |

`text-wrap: balance` on h1–h3; `text-wrap: pretty` on prose.

## 3. Spacing & radius (4px base)

```
--s1 4 · --s2 8 · --s3 12 · --s4 16 · --s6 24 · --s8 32 · --s12 48 · --s16 64 · --s24 96 · --s32 128
--r-sm 8px · --r 12px · --r-lg 16px · --r-pill 999px
```
Vary section spacing for rhythm (not a uniform stack). Surfaces are **flat with a
hairline border** — never nested, never a decorative left-stripe.

## 4. Motion

```
--ease: cubic-bezier(0.16, 1, 0.3, 1);   /* expo-ish ease-out, no bounce */
--dur-1: 160ms · --dur-2: 220ms · --dur-3: 300ms
```
- Micro-interactions (hover/press): 160ms. Reveals/transitions: 220–300ms.
- Reveals **enhance an already-visible default** (base CSS = visible; JS only animates).
- Every animation has a `@media (prefers-reduced-motion: reduce)` path (crossfade/instant).
- Premium materials allowed when they earn it: `backdrop-filter` (nav only), glow via
  `box-shadow` on the accent, `clip-path`/`mask` wipes for the mode transition.

## 5. Z-index scale

```
--z-base 0 · --z-raised 10 · --z-nav 100 · --z-cursor 200 · --z-overlay 8000 · --z-wipe 9000 · --z-cursor-top 9999
```

## 6. WebGPU hero

GPU-compute particle field (`three/webgpu` + `three/tsl`), ~12k instances, advected
through a flow field. `incident` uniform (0→1) injects turbulence and shifts per-particle
color `--good` → `--danger`; wired to the live demo via `window.__setIncident()`.
Fallback: `navigator.gpu` absent or reduced-motion → static CSS radial field, no canvas.

## 7. Accessibility contract

- Body text ≥ 4.5:1; large/label ≥ 3:1. `--ink`/`--ink-muted` pass on all surfaces.
- Focus-visible ring: 2px `--accent` + 2px offset, on every interactive element.
- Custom cursor is decorative only — native cursor on inputs; all actions keyboard-reachable.
- Motion, color, and the 3D hero all degrade; no capability is load-bearing for content.
