# Hydro Havoc boat assets

Parametric pickle-fork hydroplanes built in Blender 5.1 for Skimmer, Ironwake, and Vesper.

## Files

| Path | What |
|---|---|
| `skimmer.blend` / `ironwake.blend` / `vesper.blend` | Artist files. Subdivision modifiers are live. |
| `hydro_fleet.blend` | All three hulls side by side. |
| `previews/` | Studio stills (3/4, side, front, rear, top). |
| `../../public/boats/*.glb` | Game-ready GLB (Y-up, **+Z bow**, +X starboard). |
| `../../tools/blender/build_boats.py` | Generator. |

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

Named empties the runtime expects:

- `turbine`
- `turbineGlow`

## Hull language

- **Skimmer** — F1-style full-length tunnel cat, teal / ice
- **Ironwake** — unlimited 3-point hydro, ram noses, rust / gold
- **Vesper** — stretched pickle-fork needle, spike, violet / magenta
