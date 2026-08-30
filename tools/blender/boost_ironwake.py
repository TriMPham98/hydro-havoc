"""Ironwake unique booster deploy hardware. Loaded by build_boats.py."""


def add_boost_mech(cfg, mats, parent, api):
    """Unlimited ram-turbo hinge bits. Moving parts parent to JetSled (local +Y stern)."""
    add_cube = api["add_cube"]
    add_cylinder = api["add_cylinder"]
    add_subdiv = api["add_subdiv"]
    shade_smooth = api["shade_smooth"]
    d2b = api["design_to_blender"]
    math = api["math"]

    chrome = mats["chrome"]
    gunmetal = mats["gunmetal"]
    heat = mats["heat"]
    cabin = mats["cabin"]
    rx = math.radians(90.0)

    sleds = [c for c in parent.children if c.name.startswith("JetSled") and "Out" not in c.name]
    if not sleds:
        return
    sled = sleds[0]

    jet_r = 0.148
    jet_len = 0.68
    y_can = jet_len * 0.38
    r_h = jet_r * 1.08

    piston = add_cylinder(
        "IronBoostPiston",
        0.080,
        0.30,
        (0.0, y_can - 0.04, 0.0),
        parent=sled,
        mat=gunmetal,
        rot=(rx, 0.0, 0.0),
        segs=18,
    )
    shade_smooth(piston, 28)
    add_subdiv(piston, 1, 1)

    collar = add_cylinder(
        "IronBoostCollar",
        r_h * 1.04,
        0.030,
        (0.0, y_can, 0.0),
        parent=sled,
        mat=chrome,
        rot=(rx, 0.0, 0.0),
        segs=16,
    )
    shade_smooth(collar, 32)

    gland = add_cylinder(
        "IronBoostGland",
        r_h * 0.92,
        0.036,
        (0.0, y_can - 0.16, 0.0),
        parent=sled,
        mat=chrome,
        rot=(rx, 0.0, 0.0),
        segs=16,
    )
    shade_smooth(gland, 34)

    dump_d = 0.058
    for tag, sx in (("L", -1.0), ("R", 1.0)):
        wg = add_cylinder(
            f"IronBoostWastegate_{tag}",
            0.018,
            0.070,
            (sx * r_h * 0.55, y_can + 0.02, r_h * 0.70),
            parent=sled,
            mat=heat,
            rot=(rx, 0.0, 0.0),
            segs=12,
            radius2=0.014,
        )
        shade_smooth(wg, 28)
        dump = add_cylinder(
            f"IronBoostDump_{tag}",
            0.015,
            dump_d,
            (sx * (r_h + dump_d * 0.12), y_can + 0.05, r_h * 0.40),
            parent=sled,
            mat=heat,
            rot=(0.0, rx, 0.0),
            segs=10,
            radius2=0.022,
        )
        shade_smooth(dump, 26)

    # Transom hinge barrel — the ram drops around this pin, it does not slide.
    after_f0 = cfg.after_f0
    barrel = add_cylinder(
        "IronBoostHinge",
        0.042,
        jet_r * 2.2,
        d2b(0.0, after_f0, 0.50),
        parent=parent,
        mat=chrome,
        rot=(0.0, rx, 0.0),
        segs=14,
    )
    shade_smooth(barrel, 32)
    for tag, sx in (("L", -1.0), ("R", 1.0)):
        ear = add_cube(
            f"IronBoostEar_{tag}",
            (0.040, 0.10, 0.070),
            d2b(sx * (jet_r * 1.15), after_f0 + 0.02, 0.50),
            parent=parent,
            mat=gunmetal,
        )
        shade_smooth(ear, 55)
        gate = add_cube(
            f"IronBoostGate_{tag}",
            (0.08, 0.016, 0.10),
            d2b(sx * (jet_r * 1.20), after_f0 - 0.008, 0.50),
            parent=parent,
            mat=cabin,
        )
        shade_smooth(gate, 40)

    prop = None
    for child in parent.children:
        if child.name == "propeller":
            prop = child
            break
    if prop is None:
        return

    hub_r = 0.058
    for i in range(3):
        ang = math.radians(i * 120.0)
        cup = add_cube(
            f"IronPropCup_{i}",
            (0.050, 0.012, 0.018),
            (math.cos(ang) * hub_r * 1.15, 0.008, -math.sin(ang) * hub_r * 1.15),
            parent=prop,
            mat=gunmetal,
        )
        cup.rotation_euler = (math.radians(18.0), ang, 0.0)
        shade_smooth(cup, 40)

    nut = add_cylinder(
        "IronPropNut",
        0.018,
        0.022,
        (0.0, -0.140, 0.0),
        parent=prop,
        mat=chrome,
        rot=(rx, 0.0, 0.0),
        segs=6,
        radius2=0.014,
    )
    shade_smooth(nut, 50)
