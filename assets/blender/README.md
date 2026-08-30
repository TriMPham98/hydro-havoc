# Hydro Havoc boat assets

Parametric pickle-fork hydroplanes built in Blender 5.1 for Skimmer, Ironwake, and Vesper.

## Files

| Path | What |
|---|---|
| `skimmer.blend` / `ironwake.blend` / `vesper.blend` | Artist files. Subdivision modifiers are live. |
| `hydro_fleet.blend` | All three hulls side by side. |
| `previews/` | Studio stills (3/4, side, front, rear, top). |
| `../../public/boats/*.glb` | Game-ready GLB (Y-up, **+Z bow**, +X starboard). |
| `../../tools/blender/build_boats.py` | Generator (hulls + Hydro Thunder jets). |
| `../../tools/blender/detail_skimmer.py` | Skimmer greebles. |
| `../../tools/blender/detail_ironwake.py` | Ironwake greebles. |
| `../../tools/blender/detail_vesper.py` | Vesper greebles. |

## Regenerate

```bash
/Applications/Blender.app/Contents/MacOS/Blender -b --python tools/blender/build_boats.py
```

One hull only:

```bash
/Applications/Blender.app/Contents/MacOS/Blender -b --python tools/blender/build_boats.py -- --boat skimmer
```

## Scene convention (Blender)

- **+X** starboard
- **−Y** bow (Blender front)
- **+Z** up
- Origin at midship waterline
- Scale: 1 Blender unit = 1 game unit ≈ 1 m

glTF export uses `export_yup=True`, so the GLB the game loads is **+Z bow, +Y up**.

Named sockets the runtime expects:

- `turbine` — primary transom jet origin (centroid if dual)
- `turbine_0` / `turbine_1` — per-nozzle origins on dual-jet hulls
- `turbineGlow` (+ `turbineGlow_1`) — fallback cone, opacity driven in-game
- `TurbineFan` / `TurbineFan_0` — compressor, spun on boost / pickup ignite
- `JetPetal_*` — nozzle petals, flare open when the jet lights
- `JetSled` / `JetSled_0` — missile-bay rack; rest pose is **inside** the transom well, `JetSledOut` is the locked firing pose (aft, slightly lower)
- `JetDoor_*` — bomb-bay leaves that open before the rack translates the can out
- `propeller` / `PropBlade_*` — lofted hydro blades, spin with speed

Pickup (Hydro Thunder): collecting blue/red/super or a boost crate opens the bay doors, translates the booster out of the hull on a rack (0.5 s, same on every boat), then arms boost. While fuel remains the sled stays deployed; empty fuel retracts it.

## Hull language

- **Skimmer** — F1-style full-length tunnel cat, teal / ice
- **Ironwake** — unlimited 3-point hydro, ram noses, rust / gold
- **Vesper** — stretched pickle-fork needle, spike, violet / magenta
