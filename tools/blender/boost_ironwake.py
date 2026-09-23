"""Ironwake bomb-bay ram. Loaded by build_boats.py."""


def add_boost_mech(cfg, mats, parent, api):
    """B-1 hydraulic ejector. Moving parts parent to JetSled (local +Y stern)."""
    add_cube = api["add_cube"]
    add_cylinder = api["add_cylinder"]
    shade_smooth = api["shade_smooth"]
    math = api["math"]

    chrome = mats["chrome"]
    gunmetal = mats["gunmetal"]
    heat = mats["heat"]
    rx = math.radians(90.0)

    sleds = [c for c in parent.children if c.name.startswith("JetSled") and "Out" not in c.name]
    if not sleds:
        return
    sled = sleds[0]

    jet_r = 0.148
    jet_len = 0.68
    y_can = jet_len * 0.38
    r_h = jet_r * 1.08

    ram = add_cube(
        "IronBoostRam",
        (0.090, 0.34, 0.090),
        (0.0, y_can - 0.04, 0.0),
        parent=sled,
        mat=gunmetal,
    )
    shade_smooth(ram, 40)
    piston = add_cylinder(
        "IronBoostPiston",
        0.032,
        0.22,
        (0.0, y_can * 0.22, 0.0),
        parent=sled,
        mat=chrome,
        rot=(rx, 0.0, 0.0),
        segs=10,
    )
    shade_smooth(piston, 36)
    collar = add_cube(
        "IronBoostCollar",
        (r_h * 2.05, 0.036, r_h * 2.05),
        (0.0, y_can, 0.0),
        parent=sled,
        mat=chrome,
    )
    shade_smooth(collar, 50)
    for tag, sx in (("L", -1.0), ("R", 1.0)):
        wg = add_cube(
            f"IronBoostWastegate_{tag}",
            (0.040, 0.070, 0.028),
            (sx * r_h * 0.85, y_can + 0.02, r_h * 0.55),
            parent=sled,
            mat=heat,
        )
        shade_smooth(wg, 50)

    prop = next((c for c in parent.children if c.name == "propeller"), None)
    if prop is None:
        return
    hub_r = 0.058
    for i in range(3):
        ang = math.radians(i * 120.0)
        cup = add_cube(
            f"IronPropCup_{i}",
            (0.048, 0.012, 0.016),
            (math.cos(ang) * hub_r * 1.15, 0.008, -math.sin(ang) * hub_r * 1.15),
            parent=prop,
            mat=gunmetal,
        )
        cup.rotation_euler = (math.radians(18.0), ang, 0.0)
        shade_smooth(cup, 40)
    nut = add_cylinder(
        "IronPropNut",
        0.016,
        0.020,
        (0.0, -0.140, 0.0),
        parent=prop,
        mat=chrome,
        rot=(rx, 0.0, 0.0),
        segs=6,
        radius2=0.012,
    )
    shade_smooth(nut, 50)
