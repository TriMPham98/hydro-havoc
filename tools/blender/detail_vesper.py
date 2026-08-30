"""Vesper angular needle greebles. Loaded by build_boats.py."""


def add_details(cfg, mats, parent, api):
    add_cube = api["add_cube"]
    add_cylinder = api["add_cylinder"]
    shade_smooth = api["shade_smooth"]
    dtb = api["design_to_blender"]
    lerp = api["lerp"]
    math = api["math"]

    accent = mats["accent"]
    cabin = mats["cabin"]
    chrome = mats["chrome"]
    gunmetal = mats["gunmetal"]
    heat = mats["heat"]
    sx, sy, sz = cfg.canopy_s
    z0 = cfg.deck_z + cfg.cowling_h * 0.12
    f_spike = cfg.sponson_f1 - cfg.pickle + 0.06
    z_spike = cfg.deck_z * 0.52
    rad90 = (math.radians(90.0), 0.0, 0.0)

    def lr(side):
        return "R" if side > 0 else "L"

    fair = add_cylinder(
        "VespSpikeFair0",
        0.068,
        0.13,
        dtb(0.0, f_spike + 0.02, z_spike),
        parent=parent,
        mat=cabin,
        rot=rad90,
        segs=8,
        radius2=0.044,
    )
    shade_smooth(fair, 32)
    pitot = add_cylinder(
        "VespPitot",
        0.0045,
        0.07,
        dtb(0.0, f_spike + 0.09, z_spike + 0.024),
        parent=parent,
        mat=chrome,
        rot=rad90,
        segs=6,
        radius2=0.003,
    )
    shade_smooth(pitot, 40)

    for side in (-1, 1):
        tag = lr(side)
        lip = add_cube(
            f"VespSprayLip_{tag}",
            (0.10, 0.14, 0.012),
            dtb(side * cfg.sponson_cx, cfg.sponson_f1 - 0.20, cfg.sponson_h * 0.70 + cfg.rake * 0.50),
            parent=parent,
            mat=cabin,
        )
        shade_smooth(lip, 50)
        mx = side * sx * 0.78
        mf = cfg.canopy_f + sy * 0.10
        mz = z0 + sz * 0.46
        add_cube(f"VespMirrorMount_{tag}", (0.020, 0.016, 0.014), dtb(mx, mf, mz), parent=parent, mat=cabin)
        add_cube(f"VespMirror_{tag}", (0.008, 0.026, 0.016), dtb(mx + side * 0.030, mf, mz), parent=parent, mat=chrome)

    add_cube(
        "VespBinnacle",
        (sx * 0.68, 0.044, 0.022),
        dtb(0.0, cfg.canopy_f + sy * 0.18, z0 + sz * 0.10),
        parent=parent,
        mat=cabin,
    )

    strake_len = (cfg.sponson_f1 - cfg.pickle) - cfg.sponson_f0 - 0.40
    strake_f = lerp(cfg.sponson_f0 + 0.10, cfg.sponson_f1 - cfg.pickle - 0.10, 0.50)
    for side in (-1, 1):
        tag = lr(side)
        add_cube(
            f"VespStrake_{tag}",
            (0.008, strake_len, 0.010),
            dtb(side * (cfg.sponson_cx - cfg.sponson_hw * 0.92), strake_f, 0.07),
            parent=parent,
            mat=gunmetal,
        )
        x_out = side * (cfg.sponson_cx + cfg.sponson_hw)
        for k, u in enumerate((0.30, 0.55, 0.78)):
            add_cube(
                f"VespStep_{tag}_{k}",
                (0.016, 0.034, 0.012),
                dtb(x_out, lerp(cfg.sponson_f0, cfg.sponson_f1, u), cfg.sponson_h * 0.22 + cfg.rake * (u ** 1.3)),
                parent=parent,
                mat=gunmetal,
            )

    for i, hf in enumerate((lerp(cfg.cowling_f0, cfg.canopy_f, 0.35), cfg.canopy_f - sy * 0.50)):
        z_h = cfg.deck_z + cfg.cowling_h * (0.90 if i == 0 else 0.70)
        add_cube(f"VespHatch_{i}", (0.085, 0.12, 0.010), dtb(0.0, hf, z_h), parent=parent, mat=cabin)

    add_cube(
        "VespGurney",
        (cfg.wing_span * 0.80, 0.008, 0.014),
        dtb(0.0, cfg.wing_f - cfg.wing_chord * 0.96, cfg.wing_z + 0.010),
        parent=parent,
        mat=accent,
    )
    add_cube("VespIdChip", (0.046, 0.010, 0.020), dtb(0.14, cfg.after_f0, cfg.after_h * 0.58), parent=parent, mat=accent)
    grab = add_cylinder(
        "VespGrab",
        0.007,
        0.16,
        dtb(0.0, cfg.after_f0, cfg.after_h * 0.55),
        parent=parent,
        mat=chrome,
        rot=(0.0, math.radians(90.0), 0.0),
        segs=6,
    )
    shade_smooth(grab, 40)
    for side in (-1, 1):
        add_cube(
            f"VespCowlSlit_{lr(side)}",
            (0.026, 0.012, 0.028),
            dtb(side * 0.038, cfg.cowling_f0 + 0.14, cfg.deck_z + cfg.cowling_h * 0.46),
            parent=parent,
            mat=heat,
        )
