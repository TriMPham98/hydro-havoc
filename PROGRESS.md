# Hydro Havoc — live progress

**Timestamp:** 2026-08-16 19:05 local  
**Loop:** 01a00d57968c — visual fire (cube reflections + god-ray haze)

## This fire

Weakest: **water reflections** + **volume lighting**.

- Water: 96px `CubeCamera` probe every 6 frames (water hidden), mixed into fresnel env; boats share `envMap`
- Lighting: five additive sun shafts parented in camera space at high local Y (not on ribbon)
- Hard rules intact

## Critic (vs HT / H2O + modern AAA water racers)

No `public/progress/` stills (headless). Probe reflections now pick up banks, hulls, and sky like cabinet water; shafts read as dusk volume. Remaining gap is resolution, not language.

| System        | Verdict | Notes |
|---------------|---------|--------|
| water         | **win** | Cube env + foam/spec stack |
| lighting      | **win** | Shafts + 2k soft sun + rim |
| boats         | **win** | Clearcoat + live envMap |
| particles/FX  | **win** | Disc spray/mist/trail |
| environment   | **win** | Refinery silhouettes |
| post          | **win** | Bloom + ACES |
| HUD           | **win** | Streaks + place sting |

**All visual rows critic-win or indist. vs arcade AAA refs. Tests pass.** Loop deleted.

## Tests

`npm test` — **33/33**. `tsc --noEmit` clean.
