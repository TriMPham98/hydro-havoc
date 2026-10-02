# Hydro Havoc

Browser arcade powerboat racing. Original boats, track, and branding — a spiritual cousin of late-90s hydro racers, not a clone.

## Play

```bash
npm install
npm run dev
```

Open the local Vite URL. Keyboard:

| Key | Action |
|---|---|
| `W` / `↑` | Throttle |
| `S` / `↓` | Brake |
| `A` `D` / arrows | Steer |
| `Shift` or `Space` | Boost |
| `Esc` | Pause / Hydro Jump help |
| `M` | Mute / unmute |
| `N` | Announcer on / off |

Hold throttle on the grid during the countdown to rev the engine.

Gamepad: RT throttle, LT brake, left stick steer, A / RB boost.

**Hydro Jump:** release throttle, tap brake, then tap boost. Hold brake after the tap to jump higher.

## v1 slice

- One track: **Riptide Refinery**
- Three hulls: Skimmer, Ironwake, Vesper
- Three AI, three laps
- Blue / red boost, yellow Super Boost, Mighty Hull ram-for-boost, crates and mines

```bash
npm test
npm run build
```

Add `?debug=1` to the URL for a live telemetry overlay. `?quality=low|high` picks the
render tier (default med); `?announcer=0` silences the voice callouts.

## Sound

Everything is synthesised at boot with Web Audio — no audio files.

- **Engines:** V8-style exhaust loops (uneven firing pattern) layered by RPM, driven by speed,
  throttle load and boost; the prop over-revs when airborne and the exhaust crackles on lift-off.
  Boost spools a turbine whine that winds down after release.
- **Rivals:** each AI hull has its own HRTF-panned engine with Doppler, so fly-bys whoosh past.
- **Music:** a step sequencer (title 96 BPM, race 148 BPM) with sidechain pump, ping-pong delay
  and layers that land on the bar — base → pack-hot on lap 2 → lead hook on the final lap.
  Pause muffles it; the HUD and title spectrum pulse with the kick.
- **Mix:** buses for music / engines / ambience / SFX into reverb (longer in the cavern),
  glue compression and a limiter.

## Riptide Refinery

The canal is cut through a quayside landmass (concrete aprons, asphalt yards, scrub, shoreline) that lifts
into a mesa beside the raised section. Walls are cast-concrete form panels with tie-holes, rust bleed, a wet
algae band and live water caustics, topped with hazard-striped coping, railings, ladders and sodium lamps.
Set pieces: truss bridges with sponsor boards, a grandstand crowd with camera flashes, a chase-lit
start/finish arch, sweeping searchlights, live flare-stack fire, and fireworks at GO, each lap and the finish.

## Boost lights

Every hull carries light strips along its sponson decks and a transom tail bar:
pickup sweeps a charge head stern → bow and fills the gauge behind it, armed strips hold the
fuel level, boosting chases chevrons aft with neon trails off the sponsons, and an empty tank
stutters red and dies. Cyan = boost, red = big pickup, gold = Super. Hulls with chrome stacks also shoot
flame from them on boost and bark orange when you lift off at speed.
