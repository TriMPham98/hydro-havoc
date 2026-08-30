"""Vesper unique booster deploy hardware. Loaded by build_boats.py."""


def add_boost_mech(cfg, mats, parent, api):
    """Needle hinge-turbo extras. Moving parts parent to each JetSled (local +Y stern)."""
    add_cube = api["add_cube"]
    add_cylinder = api["add_cylinder"]
    add_subdiv = api["add_subdiv"]
    shade_smooth = api["shade_smooth"]
    dtb = api["design_to_blender"]
    math = api["math"]

    cabin = mats["cabin"]
    chrome = mats["chrome"]
    gunmetal = mats["gunmetal"]
    accent = mats["accent"]

    rad90 = (math.radians(90.0), 0.0, 0.0)
    r = 0.052
    can_len = 0.42
    y_can = can_len * 0.38
    house_r = r * 1.08

    def sm(obj, ang=42.0):
        shade_smooth(obj, ang)
        return obj

    sleds = [c for c in parent.children if c.name.startswith("JetSled") and "Out" not in c.name]
    sleds.sort(key=lambda o: o.name)

    for sled in sleds:
        suf = sled.name[len("JetSled") :]

        yoke = add_cube(
            f"VespBoostYoke{suf}",
            (house_r * 1.55, 0.036, house_r * 0.70),
            (0.0, 0.02, 0.0),
            parent=sled,
            mat=gunmetal,
        )
        sm(yoke, 50)
        for k, side in enumerate((-1, 1)):
            plate = add_cube(
                f"VespBoostPlate{suf}_{k}",
                (0.008, y_can + 0.04, house_r * 0.55),
                (side * house_r * 0.96, y_can * 0.42, 0.0),
                parent=sled,
                mat=cabin,
            )
            sm(plate, 48)

        collar = add_cylinder(
            f"VespBoostCollar{suf}",
            house_r * 1.08,
            0.022,
            (0.0, y_can, 0.0),
            parent=sled,
            mat=chrome,
            rot=rad90,
            segs=14,
        )
        sm(collar, 32)

        jx = sled.location.x
        jz = sled.location.z
        bay = add_cylinder(
            f"VespBoostBay{suf}",
            r * 1.30,
            0.08,
            dtb(jx, cfg.after_f0 + 0.04, jz),
            parent=parent,
            mat=cabin,
            rot=rad90,
            segs=14,
            radius2=r * 1.16,
        )
        sm(bay, 32)
        add_subdiv(bay, 1, 1)

    prop = next((c for c in parent.children if c.name == "propeller"), None)
    if prop is None:
        return

    span = 0.30
    rake = 0.13
    rx = span * 0.72
    ry = rake * 0.70
    for k in range(3):
        ang = k * (2.0 * math.pi / 3.0)
        cup = add_cube(
            f"VespPropCup_{k}",
            (0.012, 0.028, 0.0045),
            (rx * math.cos(ang), ry, -rx * math.sin(ang)),
            parent=prop,
            mat=accent,
        )
        cup.rotation_euler = (math.radians(20.0), ang, 0.0)
        sm(cup, 55)
