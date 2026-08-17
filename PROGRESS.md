# Hydro Havoc — live progress

**Timestamp:** 2026-08-16 17:15 local  
**Loop:** 01a00c964165 — **not stopped** (audio still synth vs recorded HT turbines)

## This fire

Weakest gap: **audio** (only remaining explicit fail).

- Hull grain: diesel fire + impeller blades + cavitation + 3-tap comb (wet cabinet, not beep)
- Boost mash: slap + sub + short rasp (less arcade square beep)
- Single course only: Riptide Refinery (catalog `riptide`)

## Critic (blind vs Hydro Thunder / H2O Overdrive)

HT cabinets play *recorded* marine turbines — you hear metal, water, and a real spool. Ours is denser and less oscillator-toy, but a harsh A/B still reads as synthesis.

| System        | Verdict | Notes |
|---------------|---------|--------|
| water         | **tie** | Unchanged this fire |
| handling      | **tie** | Unchanged |
| boost/jump    | **tie** | Kick SFX tighter |
| camera        | **tie** | Unchanged |
| track         | **tie** | Riptide only — no select |
| FX            | **tie** | Unchanged |
| AI/combat     | **tie** | Unchanged |
| audio         | **fail** | Recorded-feel grain, not recorded |
| juice/HUD     | **tie** | Unchanged |

## Tests

`npm test` — **26/26 pass**.

## Remaining gaps (next weakest)

1. **Audio** — still need sample-like transients / longer wet loops to survive HT A/B  
2. **FX** — turbine pop / mesh foam  
3. Do not add Frost/Cinder or course select.

Do **not** delete the loop until every row is win or indistinguishable **and** tests stay green.
