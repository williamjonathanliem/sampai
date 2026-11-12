# Sampai design system

Tokens live in `web/src/index.css` (`@theme`). Components live in `web/src/components/ui.tsx`. Use them; don't hand-roll buttons or badges.

## Color (OKLCH, restrained)
- Neutrals tinted toward violet (hue 285, chroma ≤ 0.01): `bg` page, `surface` raised, `sunken` wells, `line` hairlines, `fg` text, `muted` secondary text.
- `brand` violet: primary actions, selection, focus ring. Never decoration.
- Semantic: `go` (running / on time), `stop` (stalled / late), `warn` (simulated, advisory), `rain` (weather). Each has a `-soft` background tint. Text on a soft tint uses the strong tone, never gray.
- Rail lines keep their operator colors on maps and charts only.

## Type
Plus Jakarta Sans for everything. Times and numbers use `tabular-nums`. Scale (rem): 0.75 / 0.8125 / 0.875 / 1 / 1.125 / 1.375 / 1.75 / 2.25. Labels are sentence case; small caps-tracking only for section eyebrows.

## Spacing and shape
4px base. Page gutter 20px on phones. Section gap 24px; related items 8–12px. Radius: 10 (controls), 16 (panels), 24 (sheets). Hairline borders, no shadows except the bottom sheet and sticky action bar.

## Components
Button (primary, secondary, ghost, danger; md 44px, sm 36px), Badge (tone), Segmented, Field, Section (eyebrow + content), SimTag. All interactive elements: hover (pointer devices only), visible focus ring, active `scale(.97)`, disabled.

## Motion
150–250ms, `--ease-out: cubic-bezier(.23,1,.32,1)`; sheet uses `--ease-drawer: cubic-bezier(.32,.72,0,1)` at 320ms. Pulsing only on a live stalled segment. Respect `prefers-reduced-motion`.

## Icons
lucide-react, 18px in rows, 16px in badges, stroke 2. No emoji.
