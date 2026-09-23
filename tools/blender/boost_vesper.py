"""Vesper dual ejector forks. Loaded by build_boats.py."""


def add_boost_mech(cfg, mats, parent, api):
    """F-22 yoke ejectors. Moving parts parent to each JetSled (local +Y stern)."""
    add_cube = api["add_cube"]
    add_cylinder = api["add_cylinder"]
    shade_smooth = api["shade_smooth"]
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

    sleds = [c for c in parent.children if c.name.startswith("JetSled") and "Out" not in c.name]
    sleds.sort(key=lambda o: o.name)
    for sled in sleds:
        suf = sled.name[len("JetSled") :]
        yoke = add_cube(
            f"VespBoostYoke{suf}",
            (house_r * 1.70, 0.032, house_r * 0.72),
            (0.0, 0.02, 0.0),
            parent=sled,
            mat=gunmetal,
        )
        shade_smooth(yoke, 50)
        for k, side in enumerate((-1, 1)):
            fork = add_cube(
                f"VespBoostFork{suf}_{k}",
                (0.008, y_can + 0.05, house_r * 0.50),
                (side * house_r * 0.98, y_can * 0.42, 0.0),
                parent=sled,
                mat=cabin,
            )
            shade_smooth(fork, 48)
        collar = add_cylinder(
            f"VespBoostCollar{suf}",
            house_r * 1.06,
            0.020,
            (0.0, y_can, 0.0),
            parent=sled,
            mat=chrome,
            rot=rad90,
            segs=10,
        )
        shade_smooth(collar, 36)

    prop = next((c for c in parent.children if c.name == "propeller"), None)
    if prop is None:
        return
    span = 0.30
    rake = 0.13
    rx = span * 0.70
    for k in range(3):
        ang = k * (2.0 * math.pi / 3.0)
        cup = add_cube(
            f"VespPropCup_{k}",
            (0.012, 0.026, 0.0045),
            (rx * math.cos(ang), rake * 0.70, -rx * math.sin(ang)),
            parent=prop,
            mat=accent,
        )
        cup.rotation_euler = (math.radians(20.0), ang, 0.0)
        shade_smooth(cup, 55)
