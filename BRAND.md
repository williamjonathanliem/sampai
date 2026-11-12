# Sampai brand

*Sampai* is Malay for "arrived". Everything points at one idea: you get there, and if you can't, you have proof.

Live brand kit: `/brand` in the web app. Logo files: `web/public/brand/`.

## Logo

A route line shaped like an S runs from a start station (ring) to a yellow terminus dot. The dot is the full stop in **Sampai.**: the trip is complete.

| File | Use |
|---|---|
| `sampai-mark.svg` | App icon, favicon, avatar (violet tile) |
| `sampai-mark-ink.svg` | On dark slides |
| `sampai-mark-light.svg` | On violet or photos with a solid panel |
| `sampai-logo.svg` | Lockup on chalk (deck title, docs) |
| `sampai-logo-violet.svg` | Lockup on violet |
| `sampai-logo-ink.svg` | Lockup on ink |

- Clear space around the mark equals the terminus dot.
- Full stop is violet on light surfaces, yellow on violet or ink.
- Don't recolour the dot, rotate the mark, flip the route, or put it on gradients.

## Colour

| Name | Role | Hex | OKLCH |
|---|---|---|---|
| Senja (dusk) | Primary: buttons, selection, focus | `#5E3EB6` | `oklch(0.47 0.18 290)` |
| Lampu (signal lamp) | Accent: the arrival dot, SIMULATED tags. Fill only, never text on light | `#FACA4B` | `oklch(0.86 0.15 88)` |
| Malam (night) | Ink, text | `#1C1B28` | `oklch(0.23 0.025 285)` |
| Kapur (chalk) | Page background | `#F5F5F9` | `oklch(0.972 0.005 285)` |
| Jalan (go) | Running, on time | `#0B7643` | `oklch(0.5 0.12 155)` |
| Henti (stop) | Stalled, late | `#C2272D` | `oklch(0.53 0.19 25)` |
| Hujan (rain) | Weather | `#0068A7` | `oklch(0.5 0.13 245)` |

Contrast: white on Senja 7.3:1, Malam on Kapur 15.6:1, white on Henti 5.7:1, Jalan on white 5.6:1.

## Type

Manrope for everything, Semibold or lighter on marketing pages. Tabular figures for times. Named text styles (Heading 1 to 6, Title, Body, Button, Caption) are Tailwind utilities in `web/src/index.css` (`heading-1`, `body-4`, ...).

## Taglines

- **Core:** Get to class, or get proof why you didn't.
- **Hero:** Your train stopped. You'll still get to class.
- **Short:** Arrive, with proof.
- **Pitch:** Riders are the sensors.
- **BM:** Tren rosak? Anda tetap sampai.
- **BM short:** Lewat? Ada bukti.

## Pitch quotes (team voice, not testimonials)

- "Malaysia publishes live GPS for every bus. Not one train. So we asked the riders."
- "The train won't tell you it stopped. The people on board already know."
- "A delay you can prove is a delay you can explain."
- "Every phone on the platform is a sensor nobody was using."

## Voice

Calm, plain, decisive. Say what happened, what to do, and whether you make class. No hype, no emoji, no exclamation marks.

- Write: "Take bus T580 from Awan Besar. You'll still make 09:00."
- Avoid: "Oops! Looks like there's a hiccup on your line"
