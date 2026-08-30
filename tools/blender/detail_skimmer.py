"""Skimmer angular F1-cat greebles. Loaded by build_boats.py."""


def add_details(cfg, mats, parent, api):
    add_cube = api["add_cube"]
    add_cylinder = api["add_cylinder"]
    shade_smooth = api["shade_smooth"]
    d2b = api["design_to_blender"]
    lerp = api["lerp"]
    math = api["math"]

    sx, sy, sz = cfg.canopy_s
    z0 = cfg.deck_z + cfg.cowling_h * 0.12
    rx90 = (math.radians(90.0), 0.0, 0.0)
    cabin = mats["cabin"]
    chrome = mats["chrome"]
    gunmetal = mats["gunmetal"]
    heat = mats["heat"]
    accent = mats["accent"]

    def lr(side):
        return "R" if side > 0 else "L"

    for side in (-1, 1):
        tag = lr(side)
        mx = side * sx * 0.82
        mf = cfg.canopy_f + sy * 0.08
        mz = z0 + sz * 0.48
        mount = add_cube(f"SkimMirrorMount_{tag}", (0.030, 0.022, 0.020), d2b(mx, mf, mz), parent=parent, mat=cabin)
        shade_smooth(mount, 50)
        stalk = add_cube(
            f"SkimMirrorStalk_{tag}",
            (0.028, 0.010, 0.010),
            d2b(mx + side * 0.028, mf, mz),
            parent=parent,
            mat=chrome,
        )
        shade_smooth(stalk, 50)
        back = add_cube(
            f"SkimMirrorBack_{tag}",
            (0.010, 0.034, 0.024),
            d2b(mx + side * 0.044, mf, mz),
            parent=parent,
            mat=cabin,
        )
        shade_smooth(back, 40)

    dash = add_cube(
        "SkimDashCowl",
        (sx * 0.68, 0.050, 0.024),
        d2b(0.0, cfg.canopy_f + sy * 0.20, z0 + sz * 0.08),
        parent=parent,
        mat=cabin,
        rot=(math.radians(-8.0), 0.0, 0.0),
    )
    shade_smooth(dash, 45)
    for i, dx in enumerate((-0.046, 0.0, 0.046)):
        bezel = add_cube(
            f"SkimBezel_{i}",
            (0.022, 0.010, 0.022),
            d2b(dx, cfg.canopy_f + sy * 0.18, z0 + sz * 0.12),
            parent=parent,
            mat=chrome if i != 1 else accent,
        )
        shade_smooth(bezel, 50)

    hatch_f = lerp(cfg.after_f0, cfg.cowling_f0, 0.58)
    for side in (-1, 1):
        tag = lr(side)
        lid = add_cube(
            f"SkimHatch_{tag}",
            (0.14, 0.18, 0.016),
            d2b(side * 0.20, hatch_f, cfg.deck_z + 0.008),
            parent=parent,
            mat=cabin,
        )
        shade_smooth(lid, 55)

    strake_x = cfg.sponson_cx + cfg.sponson_hw
    gun_len = (cfg.sponson_f1 - cfg.sponson_f0) * 0.70
    for side in (-1, 1):
        tag = lr(side)
        strake = add_cube(
            f"SkimRubStrake_{tag}",
            (0.016, gun_len, 0.014),
            d2b(side * strake_x, lerp(cfg.sponson_f0, cfg.sponson_f1, 0.42), cfg.sponson_h * 0.30),
            parent=parent,
            mat=chrome,
        )
        shade_smooth(strake, 65)
        for i in range(3):
            nub = add_cube(
                f"SkimChineNub_{tag}{i}",
                (0.024, 0.032, 0.014),
                d2b(side * strake_x, lerp(cfg.sponson_f0, cfg.sponson_f1, 0.22 + i * 0.22), cfg.sponson_h * 0.30),
                parent=parent,
                mat=gunmetal,
            )
            shade_smooth(nub, 60)

    for side in (-1, 1):
        tag = lr(side)
        for i in range(3):
            slit = add_cube(
                f"SkimHeatVent_{tag}{i}",
                (0.050, 0.012, 0.020),
                d2b(side * cfg.cowling_w * 0.22, cfg.cowling_f0 + 0.14 + i * 0.070, cfg.deck_z + cfg.cowling_h * 0.52),
                parent=parent,
                mat=heat,
            )
            shade_smooth(slit, 55)
