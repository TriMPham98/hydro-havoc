"""Skimmer-only high-frequency hull details. Loaded by build_boats.py."""


def add_details(cfg, mats, parent, api):
    """Seated F1-cat greebles. Parent is the boat root empty at origin."""
    add_cube = api["add_cube"]
    add_cylinder = api["add_cylinder"]
    add_subdiv = api["add_subdiv"]
    shade_smooth = api["shade_smooth"]
    d2b = api["design_to_blender"]
    lerp = api["lerp"]
    math = api["math"]

    sx, sy, sz = cfg.canopy_s
    # Canopy loft origin (same as make_canopy for style=cat).
    z0 = cfg.deck_z + cfg.cowling_h * 0.12
    rx90 = (math.radians(90.0), 0.0, 0.0)
    ry90 = (0.0, math.radians(90.0), 0.0)
    cabin = mats["cabin"]
    chrome = mats["chrome"]
    gunmetal = mats["gunmetal"]
    heat = mats["heat"]
    glow = mats["glow"]
    accent = mats["accent"]

    def lr(side):
        return "R" if side > 0 else "L"

    # --- Mirrors: short stalks, mount cube overlaps CanopyGlass ---
    for side in (-1, 1):
        tag = lr(side)
        # sx*0.82 sits inside the bubble (hw peaks near sx); cube half-width overlaps glass.
        mx = side * sx * 0.82
        mf = cfg.canopy_f + sy * 0.08
        mz = z0 + sz * 0.50
        mount = add_cube(
            f"SkimMirrorMount_{tag}",
            (0.032, 0.024, 0.022),
            d2b(mx, mf, mz),
            parent=parent,
            mat=cabin,
        )
        shade_smooth(mount, 50)
        stalk_len = 0.030
        stalk = add_cylinder(
            f"SkimMirrorStalk_{tag}",
            0.006,
            stalk_len,
            d2b(mx + side * (0.014 + stalk_len * 0.45), mf, mz),
            parent=parent,
            mat=chrome,
            rot=(0.0, side * math.radians(90.0), 0.0),
            segs=8,
        )
        shade_smooth(stalk, 40)
        back = add_cube(
            f"SkimMirrorBack_{tag}",
            (0.010, 0.038, 0.028),
            d2b(mx + side * 0.042, mf, mz + 0.002),
            parent=parent,
            mat=cabin,
        )
        shade_smooth(back, 36)
        add_subdiv(back, 1, 2)
        face = add_cube(
            f"SkimMirrorFace_{tag}",
            (0.004, 0.032, 0.022),
            d2b(mx + side * 0.048, mf - 0.003, mz + 0.002),
            parent=parent,
            mat=chrome,
        )
        shade_smooth(face, 50)

    # --- Dash / bezels inside the carbon tub (below the helmet) ---
    dash_f = cfg.canopy_f + sy * 0.20
    dash_z = z0 + sz * 0.08
    dash = add_cube(
        "SkimDashCowl",
        (sx * 0.70, 0.055, 0.028),
        d2b(0.0, dash_f, dash_z),
        parent=parent,
        mat=cabin,
        rot=(math.radians(-8.0), 0.0, 0.0),
    )
    shade_smooth(dash, 42)
    for i, dx in enumerate((-0.048, 0.0, 0.048)):
        ring = add_cylinder(
            f"SkimBezelRing_{i}",
            0.012,
            0.006,
            d2b(dx, dash_f - 0.022, dash_z + 0.006),
            parent=parent,
            mat=chrome,
            rot=rx90,
            segs=10,
        )
        shade_smooth(ring, 40)
        face = add_cylinder(
            f"SkimBezelFace_{i}",
            0.009,
            0.003,
            d2b(dx, dash_f - 0.026, dash_z + 0.006),
            parent=parent,
            mat=glow if i == 1 else accent,
            rot=rx90,
            segs=10,
        )
        shade_smooth(face, 50)

    # --- Deck hatches: lid bottom at deck_z, seated in the tunnel roof ---
    hatch_f = lerp(cfg.after_f0, cfg.cowling_f0, 0.58)
    hatch_h = 0.018
    for side in (-1, 1):
        tag = lr(side)
        hx = side * 0.20
        lid = add_cube(
            f"SkimHatch_{tag}",
            (0.15, 0.20, hatch_h),
            d2b(hx, hatch_f, cfg.deck_z + hatch_h * 0.5),
            parent=parent,
            mat=cabin,
        )
        shade_smooth(lid, 60)
        for k, ox in enumerate((-0.048, 0.048)):
            pin = add_cylinder(
                f"SkimHatchHinge_{tag}{k}",
                0.005,
                0.036,
                d2b(hx + ox, hatch_f - 0.088, cfg.deck_z + hatch_h - 0.002),
                parent=parent,
                mat=chrome,
                rot=ry90,
                segs=8,
            )
            shade_smooth(pin, 40)

    # --- Filler cap on the tunnel deck ---
    fill_f = cfg.cowling_f0 - 0.08
    fill_z = cfg.deck_z + 0.01
    cap = add_cylinder(
        "SkimFillerCap",
        0.028,
        0.014,
        d2b(0.0, fill_f, fill_z),
        parent=parent,
        mat=chrome,
        segs=16,
    )
    shade_smooth(cap, 28)
    add_subdiv(cap, 1, 2)
    ring = add_cylinder(
        "SkimFillerRing",
        0.036,
        0.006,
        d2b(0.0, fill_f, fill_z - 0.004),
        parent=parent,
        mat=accent,
        segs=16,
        radius2=0.028,
    )
    shade_smooth(ring, 32)
    add_subdiv(ring, 1, 2)

    # --- Outer sponson hardware (x = cx+hw, z = sponson_h*0.3) ---
    gun_len = (cfg.sponson_f1 - cfg.sponson_f0) * 0.72
    strake_x = cfg.sponson_cx + cfg.sponson_hw
    strake_z = cfg.sponson_h * 0.3
    for side in (-1, 1):
        tag = lr(side)
        strake = add_cube(
            f"SkimRubStrake_{tag}",
            (0.014, gun_len, 0.012),
            d2b(side * strake_x, lerp(cfg.sponson_f0, cfg.sponson_f1, 0.42), strake_z),
            parent=parent,
            mat=chrome,
        )
        shade_smooth(strake, 70)
        for i in range(3):
            u = 0.20 + i * 0.22
            nub = add_cube(
                f"SkimChineNub_{tag}{i}",
                (0.026, 0.034, 0.014),
                d2b(
                    side * strake_x,
                    lerp(cfg.sponson_f0, cfg.sponson_f1, u),
                    strake_z,
                ),
                parent=parent,
                mat=gunmetal,
            )
            shade_smooth(nub, 60)

    # --- Cowl fasteners on the cowling flank ---
    fast_x = cfg.cowling_w * 0.4
    fast_z = cfg.deck_z + cfg.cowling_h * 0.5
    for side in (-1, 1):
        tag = lr(side)
        for i in range(4):
            t = lerp(0.30, 0.68, i / 3.0)
            add_cylinder(
                f"SkimCowlFast_{tag}{i}",
                0.0055,
                0.010,
                d2b(
                    side * fast_x,
                    lerp(cfg.cowling_f0, cfg.cowling_f1, t),
                    fast_z,
                ),
                parent=parent,
                mat=chrome,
                segs=6,
            )

    # --- Heat vents cut into the aft cowl ---
    for side in (-1, 1):
        tag = lr(side)
        for i in range(3):
            slit = add_cube(
                f"SkimHeatVent_{tag}{i}",
                (0.055, 0.014, 0.022),
                d2b(
                    side * cfg.cowling_w * 0.22,
                    cfg.cowling_f0 + 0.14 + i * 0.070,
                    cfg.deck_z + cfg.cowling_h * 0.52,
                ),
                parent=parent,
                mat=heat,
            )
            shade_smooth(slit, 55)
