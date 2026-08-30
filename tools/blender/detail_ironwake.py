"""Ironwake-only high-frequency hull details. Loaded by build_boats.py."""


def add_details(cfg, mats, parent, api):
    """Ironwake greebles. Parent is the boat root empty at origin."""
    add_cube = api["add_cube"]
    add_cylinder = api["add_cylinder"]
    add_uvsphere = api["add_uvsphere"]
    add_subdiv = api["add_subdiv"]
    shade_smooth = api["shade_smooth"]
    d2b = api["design_to_blender"]
    lerp = api["lerp"]
    math = api["math"]
    paint = mats["paint"]
    accent = mats["accent"]
    cabin = mats["cabin"]
    chrome = mats["chrome"]
    gunmetal = mats["gunmetal"]
    rubber = mats["rubber"]
    heat = mats["heat"]
    rx = math.radians(90.0)
    ry = math.radians(90.0)

    def cube(name, size, xfz, mat, rot=(0.0, 0.0, 0.0), smooth=False, ang=42.0):
        obj = add_cube(name, size, d2b(*xfz), parent=parent, mat=mat, rot=rot)
        if smooth:
            shade_smooth(obj, ang)
        return obj

    def cyl(name, radius, depth, xfz, mat, rot=(0.0, 0.0, 0.0), segs=12, radius2=None, smooth=True, ang=40.0):
        obj = add_cylinder(
            name,
            radius,
            depth,
            d2b(*xfz),
            parent=parent,
            mat=mat,
            rot=rot,
            segs=segs,
            radius2=radius2,
        )
        if smooth:
            shade_smooth(obj, ang)
        return obj

    def strut(name, radius, a, b, mat, segs=8):
        pa = d2b(*a)
        pb = d2b(*b)
        delta = pb - pa
        length = delta.length
        if length < 1.0e-5:
            length = 1.0e-5
        obj = add_cylinder(
            name,
            radius,
            length,
            (pa + pb) * 0.5,
            parent=parent,
            mat=mat,
            segs=segs,
        )
        obj.rotation_euler = delta.to_track_quat("Z", "Y").to_euler()
        shade_smooth(obj, 50)
        return obj

    sx, sy, sz = cfg.canopy_s

    # --- Roots blower sunk into the engine hump ---
    blower_f = cfg.cowling_f0 + 0.48
    mount_z = cfg.deck_z + cfg.cowling_h * 0.85
    mount_h = 0.090
    cube("IronBlowerMount", (0.28, 0.22, mount_h), (0.0, blower_f, mount_z), gunmetal, smooth=True, ang=50)
    case = cube(
        "IronBlowerCase",
        (0.30, 0.24, 0.14),
        (0.0, blower_f, mount_z + 0.04),
        gunmetal,
        smooth=True,
        ang=32,
    )
    add_subdiv(case, 1, 2)
    lobe_z = mount_z + 0.02
    for tag, lx in (("L", -0.068), ("R", 0.068)):
        lobe = cyl(
            f"IronBlowerLobe_{tag}",
            0.070,
            0.22,
            (lx, blower_f, lobe_z),
            chrome,
            rot=(rx, 0.0, 0.0),
            segs=16,
            ang=28,
        )
        add_subdiv(lobe, 1, 2)
        cyl(
            f"IronBlowerTrumpet_{tag}",
            0.028,
            0.048,
            (lx, blower_f + 0.01, lobe_z + 0.078),
            chrome,
            segs=12,
            radius2=0.042,
            ang=30,
        )
    cyl(
        "IronBlowerPulley",
        0.055,
        0.024,
        (0.10, blower_f + 0.10, mount_z + 0.02),
        chrome,
        rot=(rx, 0.0, 0.0),
        segs=16,
    )
    cube("IronBlowerBelt", (0.014, 0.14, 0.090), (0.10, blower_f + 0.04, mount_z), rubber)

    # --- Heat stacks rooted on the aft cowl ---
    stack_f = cfg.cowling_f0 + 0.10
    stack_z0 = cfg.deck_z + cfg.cowling_h * 0.7
    stack_h = 0.24
    for tag, hx in (("L", -0.22), ("R", 0.22)):
        cube(f"IronHeatBase_{tag}", (0.08, 0.08, 0.036), (hx, stack_f, stack_z0), gunmetal, smooth=True, ang=60)
        cyl(f"IronHeatStack_{tag}", 0.034, stack_h, (hx, stack_f, stack_z0 + stack_h * 0.5), heat, segs=14, ang=26)

    # --- Oil cooler: inner face on the cowl flank ---
    oil_w = 0.055
    oil_inner = cfg.cowling_w * 0.48
    oil_x = oil_inner + oil_w * 0.5
    oil_f = cfg.cowling_f0 + 0.38
    oil_z = cfg.deck_z + cfg.cowling_h * 0.46
    cube("IronOilCooler", (oil_w, 0.32, 0.18), (oil_x, oil_f, oil_z), gunmetal, smooth=True, ang=50)
    for tag, df in (("F", 0.12), ("A", -0.12)):
        cyl(
            f"IronOilFitting_{tag}",
            0.011,
            0.050,
            (oil_inner, oil_f + df, oil_z + 0.04),
            chrome,
            rot=(0.0, ry, 0.0),
            segs=8,
        )

    # --- Fuel cell on the afterdeck (transom to cowl, clear of the jet) ---
    fuel_x = -cfg.after_hw * 0.38
    fuel_f = lerp(cfg.after_f0, cfg.cowling_f0, 0.80)
    fuel_z = cfg.deck_z + 0.02
    cell = add_uvsphere(
        "IronFuelCell",
        0.10,
        d2b(fuel_x, fuel_f, fuel_z),
        parent=parent,
        mat=paint,
        segs=12,
        rings=8,
        scale=(0.90, 1.35, 0.40),
    )
    shade_smooth(cell, 28)
    cube("IronFuelStrap", (0.20, 0.024, 0.07), (fuel_x, fuel_f, fuel_z), chrome)
    cyl("IronFuelCap", 0.022, 0.016, (fuel_x, fuel_f + 0.10, fuel_z + 0.028), chrome, segs=10, ang=45)

    # --- Cockpit tub: dash inside, roll bar posts from the deck ---
    roll_f = cfg.canopy_f - sy * 0.55
    post_h = 0.46
    post_z = cfg.deck_z + post_h * 0.5
    hoop_z = cfg.deck_z + post_h
    for tag, side in (("L", -1.0), ("R", 1.0)):
        post = cyl(
            f"IronRollPost_{tag}",
            0.016,
            post_h,
            (side * 0.18, roll_f, post_z),
            chrome,
            segs=12,
            ang=36,
        )
        add_subdiv(post, 1, 2)
    hoop = cyl(
        "IronRollHoop",
        0.016,
        0.36,
        (0.0, roll_f, hoop_z),
        chrome,
        rot=(0.0, ry, 0.0),
        segs=12,
        ang=32,
    )
    add_subdiv(hoop, 1, 2)

    dash_f = cfg.canopy_f + sy * 0.20
    dash_z = cfg.deck_z + 0.12
    cube("IronDash", (0.32, 0.06, 0.045), (0.0, dash_f, dash_z), cabin, smooth=True, ang=50)
    for i, bx in enumerate((-0.10, 0.0, 0.10)):
        cyl(
            f"IronBezel_{i}",
            0.024,
            0.010,
            (bx, dash_f - 0.028, dash_z + 0.006),
            chrome,
            rot=(rx, 0.0, 0.0),
            segs=12,
            ang=30,
        )

    mir_f = cfg.canopy_f + sy * 0.06
    mir_z = cfg.deck_z + 0.02 + sz * 0.62
    stalk_d = 0.042
    for tag, side in (("L", -1.0), ("R", 1.0)):
        root_x = side * sx * 0.90
        cyl(
            f"IronMirrorArm_{tag}",
            0.006,
            stalk_d,
            (root_x + side * stalk_d * 0.5, mir_f, mir_z),
            chrome,
            rot=(0.0, ry, 0.0),
            segs=8,
            ang=50,
        )
        cube(
            f"IronMirror_{tag}",
            (0.010, 0.032, 0.022),
            (root_x + side * (stalk_d + 0.004), mir_f, mir_z),
            chrome,
            smooth=True,
            ang=50,
        )

    # --- Sponson deck hardware ---
    rivet_f0 = lerp(cfg.sponson_f0, cfg.sponson_f1, 0.28)
    for tag, side in (("L", -1.0), ("R", 1.0)):
        riv_x = side * (cfg.sponson_cx - cfg.sponson_hw * 0.12)
        cube(
            f"IronRivetStrip_{tag}",
            (0.016, 0.26, 0.008),
            (riv_x, rivet_f0, cfg.deck_z),
            gunmetal,
        )
        for k in range(3):
            cyl(
                f"IronRamRivet_{tag}_{k}",
                0.008,
                0.012,
                (riv_x, rivet_f0 - 0.09 + k * 0.09, cfg.deck_z),
                chrome,
                segs=8,
                ang=55,
            )
        rail_len = (cfg.sponson_f1 - cfg.sponson_f0) * 0.70
        rail_f = lerp(cfg.sponson_f0, cfg.sponson_f1, 0.42)
        rail_x = side * (cfg.sponson_cx + cfg.sponson_hw * 0.98)
        cube(
            f"IronChineRail_{tag}",
            (0.016, rail_len, 0.022),
            (rail_x, rail_f, cfg.sponson_h * 0.20),
            gunmetal,
            smooth=True,
            ang=70,
        )
        for k, u in enumerate((0.32, 0.68)):
            cyl(
                f"IronInspect_{tag}_{k}",
                0.045,
                0.010,
                (side * (cfg.sponson_cx - 0.08), lerp(cfg.sponson_f0, cfg.sponson_f1, u), cfg.deck_z),
                cabin,
                segs=12,
                ang=40,
            )
        cube(
            f"IronCleat_{tag}",
            (0.040, 0.07, 0.016),
            (side * cfg.sponson_cx, lerp(cfg.sponson_f0, cfg.sponson_f1, 0.74), cfg.deck_z),
            chrome,
            smooth=True,
            ang=55,
        )

    # Fence sits on SkidFin (x=-sponson_cx, f=lerp 0.18) and the port sponson.
    fin_f = lerp(cfg.sponson_f0, cfg.sponson_f1, 0.18)
    cube(
        "IronSkidFence",
        (0.016, 0.42, 0.24),
        (-cfg.sponson_cx + 0.006, fin_f, 0.10),
        cabin,
        smooth=True,
        ang=55,
    )

    grab_z = cfg.after_h * 0.55
    for tag, side in (("L", -1.0), ("R", 1.0)):
        gx = side * cfg.after_hw * 0.36
        cyl(
            f"IronGrabBar_{tag}",
            0.011,
            0.16,
            (gx, cfg.after_f0 - 0.028, grab_z),
            chrome,
            rot=(0.0, ry, 0.0),
            segs=10,
            ang=45,
        )
    cube("IronIdPlaque", (0.18, 0.010, 0.070), (0.38, cfg.after_f0 - 0.028, cfg.after_h * 0.48), accent)

    # --- Wing: gurney lips on the TE, stays pad-to-pad ---
    gurney_f = cfg.wing_f - cfg.wing_chord
    gurney_span = cfg.wing_span * 0.40
    for tag, side in (("L", -1.0), ("R", 1.0)):
        cube(
            f"IronGurney_{tag}",
            (gurney_span, 0.012, 0.020),
            (side * cfg.wing_span * 0.22, gurney_f, cfg.wing_z),
            accent,
        )
        wing_pt = (side * 0.62, cfg.wing_f - cfg.wing_chord * 0.28, cfg.wing_z)
        cowl_pt = (
            side * cfg.cowling_w * 0.22,
            lerp(cfg.cowling_f0, cfg.cowling_f1, 0.38),
            cfg.deck_z + cfg.cowling_h * 0.88,
        )
        cube(f"IronStayAnchorWing_{tag}", (0.045, 0.055, 0.018), wing_pt, chrome, smooth=True, ang=60)
        cube(f"IronStayAnchorCowl_{tag}", (0.045, 0.045, 0.022), cowl_pt, chrome, smooth=True, ang=60)
        strut(f"IronStayWire_{tag}", 0.006, wing_pt, cowl_pt, chrome, segs=8)
