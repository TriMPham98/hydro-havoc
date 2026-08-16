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

Add `?debug=1` to the URL for a live telemetry overlay.
