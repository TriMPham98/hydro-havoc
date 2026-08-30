"""Ironwake angular unlimited greebles. Loaded by build_boats.py."""


def add_details(cfg, mats, parent, api):
    add_cube = api["add_cube"]
    add_cylinder = api["add_cylinder"]
    shade_smooth = api["shade_smooth"]
    d2b = api["design_to_blender"]
    lerp = api["lerp"]
    math = api["math"]

    accent = mats["accent"]
    cabin = mats["cabin"]
    chrome = mats["chrome"]
    gunmetal = mats["gunmetal"]
    heat = mats["heat"]
    rx = math.radians(90.0)
    ry = math.radians(90.0)
    sx, sy, sz = cfg.canopy_s

    blower_f = cfg.cowling_f0 + 0.48
    mount_z = cfg.deck_z + cfg.cowling_h * 0.82
    case = add_cube("IronBlowerCase", (0.32, 0.26, 0.16), d2b(0.0, blower_f, mount_z), parent=parent, mat=gunmetal)
    shade_smooth(case, 40)
    for tag, lx in (("L", -0.072), ("R", 0.072)):
        lobe = add_cube(f"IronBlowerLobe_{tag}", (0.12, 0.22, 0.12), d2b(lx, blower_f, mount_z + 0.02), parent=parent, mat=chrome)
        shade_smooth(lobe, 40)
        add_cube(f"IronBlowerTrumpet_{tag}", (0.070, 0.040, 0.050), d2b(lx, blower_f + 0.02, mount_z + 0.08), parent=parent, mat=chrome)

    stack_f = cfg.cowling_f0 + 0.10
    stack_z0 = cfg.deck_z + cfg.cowling_h * 0.72
    for tag, hx in (("L", -0.22), ("R", 0.22)):
        add_cube(f"IronHeatBase_{tag}", (0.08, 0.08, 0.030), d2b(hx, stack_f, stack_z0), parent=parent, mat=gunmetal)
        stack = add_cube(f"IronHeatStack_{tag}", (0.055, 0.055, 0.22), d2b(hx, stack_f, stack_z0 + 0.12), parent=parent, mat=heat)
        shade_smooth(stack, 45)

    oil_w = 0.050
    oil_x = cfg.cowling_w * 0.48 + oil_w * 0.5
    add_cube(
        "IronOilCooler",
        (oil_w, 0.30, 0.16),
        d2b(oil_x, cfg.cowling_f0 + 0.38, cfg.deck_z + cfg.cowling_h * 0.46),
        parent=parent,
        mat=gunmetal,
    )

    fuel_x = -cfg.after_hw * 0.36
    fuel_f = lerp(cfg.after_f0, cfg.cowling_f0, 0.78)
    fuel_h = 0.10
    cell = add_cube("IronFuelCell", (0.22, 0.32, fuel_h), d2b(fuel_x, fuel_f, cfg.deck_z + fuel_h * 0.45), parent=parent, mat=cabin)
    shade_smooth(cell, 45)
    add_cube("IronFuelStrap", (0.24, 0.022, 0.04), d2b(fuel_x, fuel_f, cfg.deck_z + fuel_h * 0.45), parent=parent, mat=chrome)

    roll_f = cfg.canopy_f - sy * 0.55
    post_h = 0.42
    for tag, side in (("L", -1.0), ("R", 1.0)):
        post = add_cylinder(f"IronRollPost_{tag}", 0.014, post_h, d2b(side * 0.18, roll_f, cfg.deck_z + post_h * 0.5), parent=parent, mat=chrome, segs=8)
        shade_smooth(post, 40)
    hoop = add_cylinder("IronRollHoop", 0.014, 0.36, d2b(0.0, roll_f, cfg.deck_z + post_h), parent=parent, mat=chrome, rot=(0.0, ry, 0.0), segs=8)
    shade_smooth(hoop, 40)

    dash_f = cfg.canopy_f + sy * 0.20
    dash_z = cfg.deck_z + 0.12
    add_cube("IronDash", (0.30, 0.055, 0.040), d2b(0.0, dash_f, dash_z), parent=parent, mat=cabin)
    for i, bx in enumerate((-0.09, 0.0, 0.09)):
        add_cube(f"IronBezel_{i}", (0.040, 0.012, 0.040), d2b(bx, dash_f - 0.024, dash_z + 0.006), parent=parent, mat=chrome)

    for tag, side in (("L", -1.0), ("R", 1.0)):
        root_x = side * sx * 0.90
        mir_f = cfg.canopy_f + sy * 0.06
        mir_z = cfg.deck_z + 0.02 + sz * 0.55
        add_cube(f"IronMirrorArm_{tag}", (0.036, 0.010, 0.010), d2b(root_x + side * 0.02, mir_f, mir_z), parent=parent, mat=chrome)
        add_cube(f"IronMirror_{tag}", (0.010, 0.028, 0.020), d2b(root_x + side * 0.042, mir_f, mir_z), parent=parent, mat=chrome)

    for tag, side in (("L", -1.0), ("R", 1.0)):
        rail_x = side * (cfg.sponson_cx + cfg.sponson_hw * 0.98)
        add_cube(
            f"IronChineRail_{tag}",
            (0.016, (cfg.sponson_f1 - cfg.sponson_f0) * 0.62, 0.020),
            d2b(rail_x, lerp(cfg.sponson_f0, cfg.sponson_f1, 0.42), cfg.sponson_h * 0.20),
            parent=parent,
            mat=gunmetal,
        )
        add_cube(
            f"IronCleat_{tag}",
            (0.038, 0.06, 0.016),
            d2b(side * cfg.sponson_cx, lerp(cfg.sponson_f0, cfg.sponson_f1, 0.74), cfg.deck_z),
            parent=parent,
            mat=chrome,
        )

    gurney_f = cfg.wing_f - cfg.wing_chord
    add_cube(
        "IronGurney",
        (cfg.wing_span * 0.72, 0.012, 0.018),
        d2b(0.0, gurney_f, cfg.wing_z),
        parent=parent,
        mat=accent,
    )
    add_cube("IronIdPlaque", (0.16, 0.010, 0.060), d2b(0.36, cfg.after_f0, cfg.after_h * 0.48), parent=parent, mat=accent)
