"""Vesper-only high-frequency hull details. Loaded by build_boats.py."""


def add_details(cfg, mats, parent, api):
    """Seated needle greebles. Parent is the boat root empty at origin."""
    add_cube = api["add_cube"]
    add_cylinder = api["add_cylinder"]
    add_uvsphere = api["add_uvsphere"]
    add_subdiv = api["add_subdiv"]
    shade_smooth = api["shade_smooth"]
    dtb = api["design_to_blender"]
    lerp = api["lerp"]
    math = api["math"]

    accent = mats["accent"]
    cabin = mats["cabin"]
    chrome = mats["chrome"]
    gunmetal = mats["gunmetal"]
    glass = mats["glass"]
    heat = mats["heat"]

    sx, sy, sz = cfg.canopy_s
    z0 = cfg.deck_z + cfg.cowling_h * 0.12
    f_spike = cfg.sponson_f1 - cfg.pickle + 0.06
    z_spike = cfg.deck_z * 0.52
    rad90 = (math.radians(90.0), 0.0, 0.0)

    def sm(obj, ang=42.0):
        shade_smooth(obj, ang)
        return obj

    def lr(side):
        return "R" if side > 0 else "L"

    # --- Spike root: fairings sit in the pickle crotch, not ahead of it ---
    fair0 = add_cylinder(
        "VespSpikeFair0",
        0.072,
        0.14,
        dtb(0.0, f_spike + 0.02, z_spike),
        parent=parent,
        mat=cabin,
        rot=rad90,
        segs=12,
        radius2=0.046,
    )
    sm(fair0, 26)
    add_subdiv(fair0, 1, 1)

    pitot = add_cylinder(
        "VespPitot",
        0.005,
        0.08,
        dtb(0.0, f_spike + 0.10, z_spike + 0.028),
        parent=parent,
        mat=chrome,
        rot=rad90,
        segs=8,
        radius2=0.003,
    )
    sm(pitot, 35)
    add_uvsphere(
        "VespCamLens",
        0.010,
        dtb(-0.016, f_spike + 0.04, z_spike + 0.022),
        parent=parent,
        mat=glass,
        segs=10,
        rings=8,
    )
    cam = add_cylinder(
        "VespCamBody",
        0.011,
        0.024,
        dtb(-0.016, f_spike + 0.026, z_spike + 0.022),
        parent=parent,
        mat=chrome,
        rot=rad90,
        segs=8,
    )
    sm(cam, 40)

    # --- Spray lips ON the fork decks, not canards in free air ---
    for side in (-1, 1):
        tag = lr(side)
        lip = add_cube(
            f"VespSprayLip_{tag}",
            (0.10, 0.16, 0.012),
            dtb(side * cfg.sponson_cx, cfg.sponson_f1 - 0.22, cfg.sponson_h * 0.72 + cfg.rake * 0.55),
            parent=parent,
            mat=cabin,
        )
        sm(lip, 50)

    # --- Canopy: short stalks into the glass, dash inside the tub ---
    for side in (-1, 1):
        tag = lr(side)
        mx = side * sx * 0.78
        mf = cfg.canopy_f + sy * 0.10
        mz = z0 + sz * 0.48
        mount = add_cube(
            f"VespMirrorMount_{tag}",
            (0.022, 0.018, 0.016),
            dtb(mx, mf, mz),
            parent=parent,
            mat=cabin,
        )
        sm(mount, 50)
        stalk_len = 0.024
        stalk = add_cylinder(
            f"VespMirrorStalk_{tag}",
            0.005,
            stalk_len,
            dtb(mx + side * (0.010 + stalk_len * 0.45), mf, mz),
            parent=parent,
            mat=chrome,
            rot=(0.0, side * math.radians(90.0), 0.0),
            segs=6,
        )
        sm(stalk, 50)
        mirror = add_cube(
            f"VespMirror_{tag}",
            (0.008, 0.028, 0.018),
            dtb(mx + side * 0.034, mf - 0.002, mz + 0.002),
            parent=parent,
            mat=chrome,
        )
        mirror.rotation_euler = (math.radians(-8.0), 0.0, side * math.radians(16.0))
        sm(mirror, 45)

    dash = add_cube(
        "VespBinnacle",
        (sx * 0.70, 0.048, 0.026),
        dtb(0.0, cfg.canopy_f + sy * 0.18, z0 + sz * 0.10),
        parent=parent,
        mat=cabin,
    )
    sm(dash, 48)
    for i, gx in enumerate((-0.024, 0.024)):
        bezel = add_cylinder(
            f"VespBezel_{i}",
            0.014,
            0.008,
            dtb(gx, cfg.canopy_f + sy * 0.20, z0 + sz * 0.14),
            parent=parent,
            mat=chrome,
            rot=rad90,
            segs=10,
        )
        sm(bezel, 35)
        add_uvsphere(
            f"VespGauge_{i}",
            0.010,
            dtb(gx, cfg.canopy_f + sy * 0.206, z0 + sz * 0.14),
            parent=parent,
            mat=glass,
            segs=8,
            rings=6,
        )

    # --- Inner strakes on the sponson wall, outer nubs on the chine ---
    strake_len = (cfg.sponson_f1 - cfg.pickle) - cfg.sponson_f0 - 0.40
    strake_f = lerp(cfg.sponson_f0 + 0.10, cfg.sponson_f1 - cfg.pickle - 0.10, 0.50)
    for side in (-1, 1):
        tag = lr(side)
        x_in = side * (cfg.sponson_cx - cfg.sponson_hw * 0.92)
        for k in range(3):
            strip = add_cube(
                f"VespStrake_{tag}_{k}",
                (0.007, strake_len, 0.009),
                dtb(x_in, strake_f, 0.050 + k * 0.042),
                parent=parent,
                mat=gunmetal,
            )
            sm(strip, 70)
        x_out = side * (cfg.sponson_cx + cfg.sponson_hw)
        for k, u in enumerate((0.28, 0.52, 0.74)):
            nub = add_cube(
                f"VespStep_{tag}_{k}",
                (0.016, 0.036, 0.014),
                dtb(x_out, lerp(cfg.sponson_f0, cfg.sponson_f1, u), cfg.sponson_h * 0.22 + cfg.rake * (u ** 1.3)),
                parent=parent,
                mat=gunmetal,
            )
            sm(nub, 70)

    # --- Hatches seated in the dorsal spine ---
    hatch_fs = (
        lerp(cfg.cowling_f0, cfg.canopy_f - sy * 0.70, 0.42),
        cfg.canopy_f - sy * 0.55,
    )
    for i, hf in enumerate(hatch_fs):
        z_h = cfg.deck_z + cfg.cowling_h * (0.92 if i == 0 else 0.70)
        hatch = add_cube(
            f"VespHatch_{i}",
            (0.09, 0.13, 0.010),
            dtb(0.0, hf, z_h),
            parent=parent,
            mat=cabin,
        )
        sm(hatch, 55)
        hinge = add_cylinder(
            f"VespHatchHinge_{i}",
            0.0045,
            0.078,
            dtb(0.0, hf + 0.058, z_h + 0.003),
            parent=parent,
            mat=chrome,
            rot=(0.0, math.radians(90.0), 0.0),
            segs=6,
        )
        sm(hinge, 50)

    telem_h = 0.16
    telem_f = cfg.canopy_f - 0.22
    telem_z = cfg.deck_z + cfg.cowling_h
    base = add_cylinder(
        "VespTelemBase",
        0.014,
        0.016,
        dtb(0.16, telem_f, telem_z + 0.008),
        parent=parent,
        mat=gunmetal,
        segs=8,
    )
    sm(base, 50)
    telem = add_cylinder(
        "VespTelemStub",
        0.005,
        telem_h,
        dtb(0.16, telem_f, telem_z + telem_h * 0.48),
        parent=parent,
        mat=chrome,
        segs=8,
    )
    sm(telem, 40)

    # --- Wing TE strip ON the airfoil, not cubes at the tips ---
    gurney = add_cube(
        "VespGurney",
        (cfg.wing_span * 0.82, 0.008, 0.016),
        dtb(0.0, cfg.wing_f - cfg.wing_chord * 0.96, cfg.wing_z + 0.012),
        parent=parent,
        mat=accent,
    )
    sm(gurney, 60)

    # --- Transom hardware seated in the afterplane ---
    grab_z = cfg.after_h * 0.55
    grab_f = cfg.after_f0
    grab = add_cylinder(
        "VespGrab",
        0.008,
        0.18,
        dtb(0.0, grab_f, grab_z),
        parent=parent,
        mat=chrome,
        rot=(0.0, math.radians(90.0), 0.0),
        segs=8,
    )
    sm(grab, 40)
    for side in (-1, 1):
        post = add_cylinder(
            f"VespGrabPost_{lr(side)}",
            0.006,
            0.036,
            dtb(side * 0.08, grab_f + 0.010, grab_z - 0.014),
            parent=parent,
            mat=chrome,
            segs=6,
        )
        sm(post, 45)
    chip = add_cube(
        "VespIdChip",
        (0.048, 0.010, 0.022),
        dtb(0.14, cfg.after_f0 + 0.008, cfg.after_h * 0.58),
        parent=parent,
        mat=accent,
    )
    sm(chip, 60)

    # --- Cowl fasteners and heat slits punched into the spine ---
    f_fast0 = cfg.cowling_f0 + 0.16
    f_fast1 = cfg.canopy_f - sy * 0.70
    for i in range(8):
        t = i / 7.0
        f = lerp(f_fast0, f_fast1, t)
        cap = add_cylinder(
            f"VespFast_{i}",
            0.0045,
            0.010,
            dtb(0.0, f, cfg.deck_z + cfg.cowling_h * 0.92),
            parent=parent,
            mat=chrome,
            segs=6,
        )
        sm(cap, 40)

    for side in (-1, 1):
        slit = add_cube(
            f"VespCowlSlit_{lr(side)}",
            (0.028, 0.012, 0.030),
            dtb(side * 0.038, cfg.cowling_f0 + 0.14, cfg.deck_z + cfg.cowling_h * 0.46),
            parent=parent,
            mat=heat,
        )
        sm(slit, 55)
