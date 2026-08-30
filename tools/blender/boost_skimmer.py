"""Skimmer unique booster deploy hardware. Loaded by build_boats.py."""


def add_boost_mech(cfg, mats, parent, api):
    """Dual-jet hinge extras. Moving parts parent to each JetSled (local +Y stern)."""
    add_cube = api["add_cube"]
    add_cylinder = api["add_cylinder"]
    add_subdiv = api["add_subdiv"]
    shade_smooth = api["shade_smooth"]
    d2b = api["design_to_blender"]
    math = api["math"]

    # Matches make_jet cat spec: r=0.072, length=0.48, z=0.34, x=±0.30.
    r = 0.072
    length = 0.48
    y_can = length * 0.38
    y_fan = length * 0.62
    y_exit = length * 0.78
    house_r = r * 1.08
    rx90 = (math.radians(90.0), 0.0, 0.0)
    transom_f = cfg.after_f0

    sleds = [c for c in parent.children if c.name.startswith("JetSled") and "Out" not in c.name]
    for sled in sleds:
        suf = sled.name.replace("JetSled", "", 1)

        # Ring around JetHousing (cylinder along +Y, center y_can, radius house_r).
        shroud = add_cylinder(
            f"SkimBoostShroud{suf}",
            house_r * 1.10,
            0.028,
            (0.0, y_fan, 0.0),
            parent=sled,
            mat=mats["chrome"],
            rot=rx90,
            segs=20,
            radius2=house_r * 1.06,
        )
        shade_smooth(shroud, 28)
        add_subdiv(shroud, 1, 1)

        # Scissors from bay lip (local y≈0) onto the housing wall.
        arm_len = y_can + 0.10
        for si, side in enumerate((-1, 1)):
            arm = add_cube(
                f"SkimBoostScissor{suf}_{si}",
                (0.012, arm_len, 0.012),
                (side * house_r * 0.90, arm_len * 0.48, 0.0),
                parent=sled,
                mat=mats["chrome"],
                rot=(0.0, 0.0, side * math.radians(4.0)),
            )
            shade_smooth(arm, 55)
            lug = add_cube(
                f"SkimBoostLug{suf}_{si}",
                (0.018, 0.040, 0.022),
                (side * house_r * 0.98, y_can, 0.0),
                parent=sled,
                mat=mats["gunmetal"],
            )
            shade_smooth(lug, 60)

        bucket = add_cylinder(
            f"SkimBoostBucket{suf}",
            house_r * 1.04,
            0.048,
            (0.0, y_exit, 0.0),
            parent=sled,
            mat=mats["heat"],
            rot=rx90,
            segs=16,
            radius2=house_r * 1.28,
        )
        shade_smooth(bucket, 22)
        add_subdiv(bucket, 1, 1)

        # One thick collar on the transom face, intersecting Afterplane.
        jx = sled.location.x
        jz = sled.location.z
        mouth = add_cylinder(
            f"SkimBoostMouth{suf}",
            r * 1.55,
            0.070,
            d2b(jx, transom_f, jz),
            parent=parent,
            mat=mats["cabin"],
            rot=rx90,
            segs=16,
        )
        shade_smooth(mouth, 36)
        add_subdiv(mouth, 1, 1)

    prop = next((c for c in parent.children if c.name == "propeller"), None)
    if prop is None:
        return

    # Cups sit on PropBlade_* (span 0.38, rake 0.08, mid-chord +Y).
    span = 0.38
    rake = 0.08
    rad = span * 0.72
    cup_y = rake * 0.70
    for i in range(3):
        ang = i * math.radians(120.0)
        cup = add_cube(
            f"SkimPropCup_{i}",
            (0.055, 0.016, 0.020),
            (math.cos(ang) * rad, cup_y, -math.sin(ang) * rad),
            parent=prop,
            mat=mats["chrome"],
            rot=(math.radians(22.0), ang, 0.0),
        )
        shade_smooth(cup, 50)
