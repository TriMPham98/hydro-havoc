# Hydro Havoc — live progress

**Timestamp:** 2026-08-16 16:00 local  
**Loop:** 01a00c964165 — **not stopped** (track / AI / audio still fail vs cabinet)

## This fire

Weakest: **track**, **AI/combat**, **audio** (+ HUD callouts).

- Track: off-ribbon **crane skyline** (5 towers, no ribbon fold)
- AI: ram toward **nearest pack rival**, not only the player
- Juice: HUD **RAM +1 / HIT** callout
- Audio: highpass **combustion crackle**

## Critic (blind vs Hydro Thunder / H2O Overdrive)

| System        | Verdict | Notes |
|---------------|---------|--------|
| water         | **tie** | Unchanged |
| handling      | **tie** | Unchanged |
| boost/jump    | **tie** | Unchanged |
| camera        | **tie** | Unchanged |
| track         | **fail** | Skyline + tanker/volcano; still one canal vs HT tour |
| FX            | **tie** | Unchanged bar |
| AI/combat     | **fail** | Pack targeting + callout; not cabinet 4-wide scrum |
| audio         | **fail** | Crackle layer; still not sampled turbine |
| juice/HUD     | **tie** | Callout helps; still thin vs H2O chrome |

## Tests

`npm test` — **20/20 pass**.

## Remaining gaps (next weakest)

1. **Track** — second visual world, keep distant-t ribbons apart  
2. **Audio** — real combustion / water slap samples  
3. **AI** — more boats or staged bump set-pieces  

Do **not** delete the loop until every row is win or indistinguishable **and** tests stay green.
