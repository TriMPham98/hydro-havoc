"""Skimmer dual missile-bay ejector. Loaded by build_boats.py."""


def add_boost_mech(cfg, mats, parent, api):
    """F-18 scissor racks. Moving parts parent to each JetSled (local +Y stern)."""
    add_cube = api["add_cube"]
    add_cylinder = api["add_cylinder"]
    shade_smooth = api["shade_smooth"]
    math = api["math"]

    r = 0.072
    length = 0.48
    y_can = length * 0.38
    y_exit = length * 0.78
    house_r = r * 1.08
    rx90 = (math.radians(90.0), 0.0, 0.0)

    sleds = [c for c in parent.children if c.name.startswith("JetSled") and "Out" not in c.name]
    for sled in sleds:
        suf = sled.name.replace("JetSled", "", 1)

        beam = add_cube(
            f"SkimBoostRack{suf}",
            (house_r * 1.65, y_can + 0.06, 0.022),
            (0.0, y_can * 0.42, house_r * 0.92),
            parent=sled,
            mat=mats["gunmetal"],
        )
        shade_smooth(beam, 60)
        for si, side in enumerate((-1, 1)):
            arm = add_cube(
                f"SkimBoostScissor{suf}_{si}",
                (0.014, y_can + 0.08, 0.014),
                (side * house_r * 0.92, (y_can + 0.08) * 0.46, 0.0),
                parent=sled,
                mat=mats["chrome"],
            )
            shade_smooth(arm, 55)
            lug = add_cube(
                f"SkimBoostLug{suf}_{si}",
                (0.022, 0.036, 0.028),
                (side * house_r * 1.02, y_can, 0.0),
                parent=sled,
                mat=mats["gunmetal"],
            )
            shade_smooth(lug, 60)

        piston = add_cylinder(
            f"SkimBoostPiston{suf}",
            0.010,
            y_can + 0.04,
            (0.0, y_can * 0.48, house_r * 0.70),
            parent=sled,
            mat=mats["chrome"],
            rot=rx90,
            segs=8,
        )
        shade_smooth(piston, 40)

        bucket = add_cylinder(
            f"SkimBoostBucket{suf}",
            house_r * 1.02,
            0.040,
            (0.0, y_exit, 0.0),
            parent=sled,
            mat=mats["heat"],
            rot=rx90,
            segs=12,
            radius2=house_r * 1.18,
        )
        shade_smooth(bucket, 32)


    prop = next((c for c in parent.children if c.name == "propeller"), None)
    if prop is None:
        return
    span = 0.38
    rake = 0.08
    rad = span * 0.70
    for i in range(3):
        ang = i * math.radians(120.0)
        cup = add_cube(
            f"SkimPropCup_{i}",
            (0.050, 0.014, 0.018),
            (math.cos(ang) * rad, rake * 0.68, -math.sin(ang) * rad),
            parent=prop,
            mat=mats["chrome"],
            rot=(math.radians(22.0), ang, 0.0),
        )
        shade_smooth(cup, 50)
