# Hydro Havoc boat assets

Parametric pickle-fork hydroplanes built in Blender 5.1 for Skimmer, Ironwake, and Vesper.

## Files

| Path | What |
|---|---|
| `skimmer.blend` / `ironwake.blend` / `vesper.blend` | Artist files. Subdivision modifiers are live. |
| `hydro_fleet.blend` | All three hulls side by side. |
| `previews/` | Studio stills (3/4, side, front, rear, top). |
| `../../public/boats/*.glb` | Game-ready GLB (Y-up, **+Z bow**, +X starboard). |
| `../../tools/blender/build_boats.py` | Generator (hulls + boost pods + Hydro Thunder jets). |
| `../../tools/blender/boost_<id>.py` | Per-hull rack hardware that rides each `JetSled`. |

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
- `BoostStrip_L` / `BoostStrip_R` — emissive bands on each sponson deck (bow → stern); the runtime swaps in an animated shader
- `BoostStrip_T` — transom tail-light bar, animated from the centre out

Pickup (Hydro Thunder): collecting blue/red/super or a boost crate opens the bay doors, translates the booster out of the hull on a rack (0.5 s, same on every boat), then arms boost. While fuel remains the sled stays deployed; empty fuel retracts it.

## Hull language

Arcade powerboats in the spirit of late-90s cabinet racers — original designs, not copies. Every shell is
built **faceted** (no subdivision; hard shading at 33°): deep-V running surfaces, a hard chine with a flat
spray lip, near-vertical topsides with a creased character line, a chamfered sheer and flat decks. The
centre body is one streamlined fuselage from a pointed parabolic nose to a slim tail, carrying a flush teardrop fighter canopy in opaque smoked glass (sill rails + windscreen bow) and a dorsal spine fairing aft; jet nacelles are long pointed ogives that sink into the deck.

All three share a two-tone livery: metallic-flake paint topsides, carbon running surfaces and tunnel walls.

- **Skimmer** — wedge-nosed tunnel cat, deep metallic blue: small blown engine with twin stacks a side, canted twin tail fins
- **Ironwake** — unlimited 3-point brute, gloss red/gold: exposed supercharged V8 (blower, raked bug-catcher scoop, eight chrome zoomie stacks), twin fins carrying the wing
- **Vesper** — stretched needle, violet/magenta: fighter-style side intakes, canards, steeply canted twin fins

Extra sockets from the hero kit:

- `StackTip_*` — empties at each chrome stack mouth; the runtime hangs boost flames / lift-off barks on them (local +Y = bore)
