"""
Hydro Havoc — realistic pickle-fork hydroplane assets.

Builds Skimmer, Ironwake, and Vesper as Blender scenes with live Subdivision
modifiers, then exports game-ready GLB (Y-up, +Z bow) plus studio previews.

Run:
  /Applications/Blender.app/Contents/MacOS/Blender -b --python tools/blender/build_boats.py
"""

from __future__ import annotations

import json
import math
import struct
import sys
from dataclasses import dataclass
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector, Matrix, Color

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

ROOT = Path(__file__).resolve().parents[2]
BLEND_DIR = ROOT / "assets" / "blender"
PREVIEW_DIR = BLEND_DIR / "previews"
GLB_DIR = ROOT / "public" / "boats"

BLENDER = (5, 1, 0)


def log(*args):
    print("[hydro-boats]", *args, flush=True)


# ---------------------------------------------------------------------------
# Math
# ---------------------------------------------------------------------------

def clamp(x, a=0.0, b=1.0):
    return a if x < a else b if x > b else x


def lerp(a, b, t):
    return a + (b - a) * t


def smooth(t):
    t = clamp(t)
    return t * t * (3.0 - 2.0 * t)


def smoother(t):
    t = clamp(t)
    return t * t * t * (t * (t * 6.0 - 15.0) + 10.0)


def remap(x, a, b):
    if abs(b - a) < 1e-9:
        return 0.0
    return clamp((x - a) / (b - a))


def srgb_to_lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_lin(h):
    r = ((h >> 16) & 255) / 255.0
    g = ((h >> 8) & 255) / 255.0
    b = (h & 255) / 255.0
    return (srgb_to_lin(r), srgb_to_lin(g), srgb_to_lin(b), 1.0)


def saturate_rgba(rgba, sat=1.22, lift=1.06):
    """Push paint off the grey axis so a low chase cam still reads fleet color."""
    r, g, b, a = rgba if len(rgba) == 4 else (*rgba, 1.0)
    l = 0.2126 * r + 0.7152 * g + 0.0722 * b
    r = clamp((l + (r - l) * sat) * lift)
    g = clamp((l + (g - l) * sat) * lift)
    b = clamp((l + (b - l) * sat) * lift)
    return (r, g, b, a)


def design_to_blender(x, f, z):
    """+x starboard, +f bow, +z up  ->  Blender X right, -Y bow, Z up."""
    return Vector((x, -f, z))


# ---------------------------------------------------------------------------
# Scene helpers
# ---------------------------------------------------------------------------

def wipe_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=True)
    for coll in (
        bpy.data.meshes,
        bpy.data.curves,
        bpy.data.cameras,
        bpy.data.lights,
        bpy.data.materials,
        bpy.data.images,
        bpy.data.fonts,
    ):
        for block in list(coll):
            try:
                coll.remove(block)
            except Exception:
                pass
    # Keep the scene collection; drop extras
    scene_col = bpy.context.scene.collection
    for child in list(scene_col.children):
        scene_col.children.unlink(child)
    for extra in list(bpy.data.collections):
        if extra != scene_col:
            try:
                bpy.data.collections.remove(extra)
            except Exception:
                pass


def link(obj):
    col = bpy.context.scene.collection
    if obj.name not in col.objects:
        col.objects.link(obj)
    return obj


def new_empty(name, size=0.5):
    e = bpy.data.objects.new(name, None)
    e.empty_display_type = "ARROWS"
    e.empty_display_size = size
    return link(e)


def new_mesh_obj(name, mesh, parent=None, mat=None):
    obj = bpy.data.objects.new(name, mesh)
    link(obj)
    if parent is not None:
        obj.parent = parent
    if mat is not None:
        if obj.data.materials:
            obj.data.materials[0] = mat
        else:
            obj.data.materials.append(mat)
    return obj


def shade_smooth(obj, angle_deg=42.0):
    mesh = obj.data
    if not getattr(mesh, "polygons", None):
        return
    smooth = [True] * len(mesh.polygons)
    mesh.polygons.foreach_set("use_smooth", smooth)
    try:
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.shade_smooth_by_angle(angle=math.radians(angle_deg))
    except Exception:
        pass


def add_subdiv(obj, levels=1, render=2):
    mod = obj.modifiers.new("SubD", "SUBSURF")
    mod.subdivision_type = "CATMULL_CLARK"
    mod.levels = levels
    mod.render_levels = render
    mod.quality = 3
    try:
        mod.use_creases = True
    except Exception:
        pass
    return mod


def crease_by_angle(mesh, degrees=48.0):
    bm = bmesh.new()
    bm.from_mesh(mesh)
    cl = bm.edges.layers.float.get("crease_edge")
    if cl is None:
        cl = bm.edges.layers.float.new("crease_edge")
    th = math.radians(degrees)
    for e in bm.edges:
        if len(e.link_faces) < 2:
            e[cl] = 1.0
            continue
        n0 = e.link_faces[0].normal
        n1 = e.link_faces[1].normal
        if n0.length < 1e-8 or n1.length < 1e-8:
            continue
        ang = n0.angle(n1)
        if ang > th:
            e[cl] = clamp((ang - th) / (math.radians(80.0) - th + 1e-6))
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()


def recalc_normals(mesh, inward=False):
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if inward:
        bmesh.ops.reverse_faces(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()


def loft_closed(name, rings, cap_start=True, cap_end=True, tip_start=None, tip_end=None):
    if not rings or not rings[0]:
        raise ValueError("empty loft")
    n = len(rings[0])
    bm = bmesh.new()
    bm_rings = []
    for ring in rings:
        if len(ring) != n:
            raise ValueError("ring size mismatch")
        bm_rings.append([bm.verts.new(Vector(v)) for v in ring])

    for i in range(len(bm_rings) - 1):
        a = bm_rings[i]
        b = bm_rings[i + 1]
        for j in range(n):
            j2 = (j + 1) % n
            try:
                bm.faces.new((a[j], a[j2], b[j2], b[j]))
            except ValueError:
                pass

    if tip_start is not None:
        tv = bm.verts.new(Vector(tip_start))
        a = bm_rings[0]
        for j in range(n):
            try:
                bm.faces.new((tv, a[(j + 1) % n], a[j]))
            except ValueError:
                pass
    elif cap_start:
        try:
            bm.faces.new(list(reversed(bm_rings[0])))
        except ValueError:
            pass

    if tip_end is not None:
        tv = bm.verts.new(Vector(tip_end))
        a = bm_rings[-1]
        for j in range(n):
            try:
                bm.faces.new((tv, a[j], a[(j + 1) % n]))
            except ValueError:
                pass
    elif cap_end:
        try:
            bm.faces.new(bm_rings[-1])
        except ValueError:
            pass

    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bmesh.ops.triangulate(bm, faces=bm.faces, quad_method="BEAUTY", ngon_method="BEAUTY")
    # Keep quads for subdiv: don't triangulate hulls. Undo — loft already quads.
    # Actually triangulate hurts subdiv. Skip triangulation.

    mesh = bpy.data.meshes.new(name)
    # rebuild without triangulate for hull quality
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()
    return mesh


def loft_quads(name, rings, cap_start=True, cap_end=True, tip_start=None, tip_end=None, crease_js=None):
    """Quad loft (no triangulate) so Catmull-Clark subdiv stays clean."""
    n = len(rings[0])
    bm = bmesh.new()
    cl = bm.edges.layers.float.new("crease_edge")
    bm_rings = [[bm.verts.new(Vector(v)) for v in ring] for ring in rings]
    crease_js = set(crease_js or [])
    long_edges = []
    for i in range(len(bm_rings) - 1):
        a, b = bm_rings[i], bm_rings[i + 1]
        for j in range(n):
            j2 = (j + 1) % n
            try:
                f = bm.faces.new((a[j], a[j2], b[j2], b[j]))
            except ValueError:
                f = None
            if j in crease_js:
                e = bm.edges.get((a[j], b[j]))
                if e:
                    long_edges.append(e)
    for e in long_edges:
        e[cl] = 1.0
    if tip_start is not None:
        tv = bm.verts.new(Vector(tip_start))
        a = bm_rings[0]
        for j in range(n):
            try:
                bm.faces.new((tv, a[(j + 1) % n], a[j]))
            except ValueError:
                pass
    elif cap_start:
        try:
            bm.faces.new(list(reversed(bm_rings[0])))
        except ValueError:
            pass
        for e in bm_rings[0][0].link_edges:
            if e.verts[0] in bm_rings[0] and e.verts[1] in bm_rings[0]:
                e[cl] = 0.85
    if tip_end is not None:
        tv = bm.verts.new(Vector(tip_end))
        a = bm_rings[-1]
        for j in range(n):
            try:
                bm.faces.new((tv, a[j], a[(j + 1) % n]))
            except ValueError:
                pass
    elif cap_end:
        try:
            bm.faces.new(bm_rings[-1])
        except ValueError:
            pass
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()
    return mesh


def bm_to_obj(name, bm, parent=None, mat=None):
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=1e-5)
    try:
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    except Exception:
        pass
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()
    return new_mesh_obj(name, mesh, parent=parent, mat=mat)


def add_cube(name, size, loc, parent=None, mat=None, rot=(0, 0, 0)):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    sx, sy, sz = size
    bmesh.ops.scale(bm, verts=list(bm.verts), vec=Vector((sx, sy, sz)))
    obj = bm_to_obj(name, bm, parent=parent, mat=mat)
    obj.location = Vector(loc) if not isinstance(loc, Vector) else loc
    obj.rotation_euler = rot
    return obj


def add_cylinder(name, radius, depth, loc, parent=None, mat=None, rot=(0, 0, 0), segs=16, radius2=None):
    bm = bmesh.new()
    r2 = radius if radius2 is None else radius2
    bmesh.ops.create_cone(
        bm,
        cap_ends=True,
        cap_tris=False,
        segments=segs,
        radius1=radius,
        radius2=r2,
        depth=depth,
    )
    obj = bm_to_obj(name, bm, parent=parent, mat=mat)
    obj.location = Vector(loc) if not isinstance(loc, Vector) else loc
    obj.rotation_euler = rot
    return obj


def add_uvsphere(name, radius, loc, parent=None, mat=None, segs=16, rings=10, scale=(1, 1, 1)):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=rings, radius=radius)
    if scale != (1, 1, 1):
        bmesh.ops.scale(bm, verts=list(bm.verts), vec=Vector(scale))
    obj = bm_to_obj(name, bm, parent=parent, mat=mat)
    obj.location = Vector(loc) if not isinstance(loc, Vector) else loc
    return obj


def add_ico(name, radius, loc, parent=None, mat=None, subdiv=2, scale=(1, 1, 1)):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=radius)
    if scale != (1, 1, 1):
        bmesh.ops.scale(bm, verts=list(bm.verts), vec=Vector(scale))
    obj = bm_to_obj(name, bm, parent=parent, mat=mat)
    obj.location = Vector(loc) if not isinstance(loc, Vector) else loc
    return obj


# ---------------------------------------------------------------------------
# Materials
# ---------------------------------------------------------------------------

def set_sock(node, key, value):
    if key not in node.inputs:
        return
    sock = node.inputs[key]
    try:
        sock.default_value = value
    except Exception:
        pass


def principled(
    name,
    color=(0.5, 0.5, 0.5, 1),
    metallic=0.18,
    roughness=0.22,
    coat=0.0,
    coat_rough=0.04,
    transmission=0.0,
    ior=1.45,
    emission=(0, 0, 0, 1),
    emission_strength=0.0,
    alpha=1.0,
    specular=0.5,
):
    mat = bpy.data.materials.new(name)
    try:
        mat.use_nodes = True
    except Exception:
        pass
    nt = mat.node_tree
    pr = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    if len(color) == 3:
        color = (*color, 1.0)
    if len(emission) == 3:
        emission = (*emission, 1.0)
    set_sock(pr, "Base Color", color)
    set_sock(pr, "Metallic", metallic)
    set_sock(pr, "Roughness", roughness)
    set_sock(pr, "Coat Weight", coat)
    set_sock(pr, "Coat Roughness", coat_rough)
    set_sock(pr, "Coat IOR", 1.5)
    set_sock(pr, "Transmission Weight", transmission)
    set_sock(pr, "IOR", ior)
    set_sock(pr, "Emission Color", emission)
    set_sock(pr, "Emission Strength", emission_strength)
    set_sock(pr, "Alpha", alpha)
    set_sock(pr, "Specular IOR Level", specular)
    if transmission > 0.2 or alpha < 0.99:
        try:
            mat.blend_method = "HASHED"
        except Exception:
            pass
        try:
            mat.use_screen_refraction = True
        except Exception:
            pass
    try:
        mat.diffuse_color = color
    except Exception:
        pass
    return mat


def make_materials(cfg: "BoatCfg"):
    paint = principled(
        f"{cfg.id}_Paint",
        color=saturate_rgba(cfg.color, 1.28, 1.04),
        metallic=0.16,
        roughness=0.08,
        coat=1.0,
        coat_rough=0.018,
        specular=0.72,
    )
    accent = principled(
        f"{cfg.id}_Accent",
        color=saturate_rgba(cfg.accent, 1.18, 1.08),
        metallic=0.34,
        roughness=0.10,
        coat=1.0,
        coat_rough=0.03,
        emission=saturate_rgba(cfg.accent, 1.15, 1.0),
        emission_strength=0.32,
    )
    cabin = principled(
        f"{cfg.id}_Carbon",
        color=cfg.cabin,
        metallic=0.42,
        roughness=0.28,
        coat=0.45,
        coat_rough=0.10,
    )
    chrome = principled(
        f"{cfg.id}_Chrome",
        color=(0.90, 0.93, 0.96, 1),
        metallic=1.0,
        roughness=0.055,
        coat=0.55,
        coat_rough=0.04,
    )
    gunmetal = principled(
        f"{cfg.id}_Gunmetal",
        color=(0.038, 0.042, 0.048, 1),
        metallic=0.9,
        roughness=0.22,
        coat=0.55,
        coat_rough=0.12,
    )
    glass = principled(
        f"{cfg.id}_Glass",
        color=cfg.glass,
        metallic=0.0,
        roughness=0.03,
        coat=1.0,
        coat_rough=0.02,
        transmission=0.92,
        ior=1.45,
        alpha=0.28,
        specular=1.0,
    )
    rubber = principled(
        f"{cfg.id}_Rubber",
        color=(0.03, 0.03, 0.032, 1),
        metallic=0.0,
        roughness=0.78,
    )
    glow = principled(
        f"{cfg.id}_Glow",
        color=cfg.accent,
        metallic=0.0,
        roughness=0.3,
        emission=cfg.accent,
        emission_strength=4.5,
        alpha=0.35,
    )
    light_r = principled(
        f"{cfg.id}_NavPort",
        color=(1, 0.08, 0.06, 1),
        roughness=0.2,
        emission=(1.0, 0.05, 0.02, 1),
        emission_strength=6.0,
    )
    light_g = principled(
        f"{cfg.id}_NavStbd",
        color=(0.05, 1, 0.3, 1),
        roughness=0.2,
        emission=(0.05, 1.0, 0.25, 1),
        emission_strength=6.0,
    )
    return {
        "paint": paint,
        "accent": accent,
        "cabin": cabin,
        "chrome": chrome,
        "gunmetal": gunmetal,
        "glass": glass,
        "rubber": rubber,
        "glow": glow,
        "nav_port": light_r,
        "nav_stbd": light_g,
    }


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

@dataclass
class BoatCfg:
    id: str
    name: str
    number: str
    style: str  # cat | unlimited | needle
    length: float
    width: float
    color: tuple
    accent: tuple
    cabin: tuple
    glass: tuple
    sponson_cx: float
    sponson_hw: float
    sponson_h: float
    sponson_f0: float
    sponson_f1: float
    rake: float
    after_f0: float
    after_f1: float
    after_hw: float
    after_h: float
    deck_z: float
    cowling_h: float
    cowling_w: float
    cowling_f0: float
    cowling_f1: float
    canopy_f: float
    canopy_z: float
    canopy_s: tuple
    wing_span: float
    wing_z: float
    wing_f: float
    wing_chord: float
    pickle: float
    ram_nose: bool
    spike: bool
    dual_exhaust: bool
    armored: bool


def boats():
    return [
        BoatCfg(
            id="skimmer",
            name="SKIMMER",
            number="11",
            style="cat",
            length=5.4,
            width=2.3,
            color=hex_lin(0x12C6D8),
            accent=hex_lin(0xF4FFFF),
            cabin=hex_lin(0x05181E),
            glass=(0.18, 0.55, 0.62, 1.0),
            sponson_cx=0.80,
            sponson_hw=0.34,
            sponson_h=0.34,
            sponson_f0=-2.50,
            sponson_f1=2.68,
            rake=0.16,
            after_f0=-2.70,
            after_f1=-1.42,
            after_hw=0.98,
            after_h=0.30,
            deck_z=0.40,
            cowling_h=0.22,
            cowling_w=0.64,
            cowling_f0=-0.92,
            cowling_f1=0.88,
            canopy_f=0.38,
            canopy_z=0.66,
            canopy_s=(0.36, 0.50, 0.24),
            wing_span=2.08,
            wing_z=0.98,
            wing_f=-2.18,
            wing_chord=0.30,
            pickle=0.98,
            ram_nose=False,
            spike=False,
            dual_exhaust=True,
            armored=False,
        ),
        BoatCfg(
            id="ironwake",
            name="IRONWAKE",
            number="07",
            style="unlimited",
            length=6.2,
            width=2.6,
            color=hex_lin(0xC44610),
            accent=hex_lin(0xFFC028),
            cabin=hex_lin(0x1C0C06),
            glass=(0.48, 0.26, 0.10, 1.0),
            sponson_cx=0.84,
            sponson_hw=0.46,
            sponson_h=0.48,
            sponson_f0=-0.18,
            sponson_f1=3.12,
            rake=0.34,
            after_f0=-3.10,
            after_f1=0.78,
            after_hw=1.10,
            after_h=0.42,
            deck_z=0.48,
            cowling_h=0.46,
            cowling_w=1.00,
            cowling_f0=-1.72,
            cowling_f1=0.28,
            canopy_f=0.82,
            canopy_z=0.76,
            canopy_s=(0.40, 0.46, 0.30),
            wing_span=2.78,
            wing_z=1.46,
            wing_f=-2.42,
            wing_chord=0.50,
            pickle=0.92,
            ram_nose=True,
            spike=False,
            dual_exhaust=False,
            armored=True,
        ),
        BoatCfg(
            id="vesper",
            name="VESPER",
            number="09",
            style="needle",
            length=7.1,
            width=2.05,
            color=hex_lin(0x5620FF),
            accent=hex_lin(0xFF2E74),
            cabin=hex_lin(0x0C0616),
            glass=(0.30, 0.08, 0.42, 1.0),
            sponson_cx=0.70,
            sponson_hw=0.24,
            sponson_h=0.28,
            sponson_f0=-0.62,
            sponson_f1=3.52,
            rake=0.22,
            after_f0=-3.55,
            after_f1=0.28,
            after_hw=0.66,
            after_h=0.26,
            deck_z=0.34,
            cowling_h=0.20,
            cowling_w=0.46,
            cowling_f0=-1.88,
            cowling_f1=1.72,
            canopy_f=0.62,
            canopy_z=0.60,
            canopy_s=(0.24, 0.88, 0.18),
            wing_span=1.88,
            wing_z=1.32,
            wing_f=-2.78,
            wing_chord=0.26,
            pickle=1.32,
            ram_nose=False,
            spike=True,
            dual_exhaust=True,
            armored=False,
        ),
    ]


# ---------------------------------------------------------------------------
# Hull sections
# ---------------------------------------------------------------------------

def super_pt(ang, hw, hh, n_x, n_z):
    c, s = math.cos(ang), math.sin(ang)
    rx = hw * math.copysign(abs(c) ** (2.0 / n_x), c)
    rz = hh * math.copysign(abs(s) ** (2.0 / n_z), s)
    return rx, rz


# Hydro sponson half-breadth corners: (outboard, z_norm) CCW from pad center.
# Index 3 is the outer non-trip chine (kept sharp).
SPONSON_CORNERS_CAT = [
    (0.00, 0.00),
    (0.55, 0.00),
    (0.84, 0.03),
    (1.00, 0.16),  # chine
    (0.99, 0.62),
    (0.88, 0.97),
    (0.40, 1.04),
    (0.00, 1.06),
    (-0.52, 1.02),
    (-0.98, 0.94),
    (-1.00, 0.22),  # vertical tunnel wall
    (-0.72, 0.04),
    (-0.22, 0.00),
]
SPONSON_CORNERS_UNLIMITED = [
    (0.00, 0.00),
    (0.40, 0.00),
    (0.70, 0.07),
    (1.00, 0.28),  # chine
    (0.99, 0.58),
    (0.84, 0.94),
    (0.38, 1.05),
    (0.00, 1.08),
    (-0.40, 1.04),
    (-0.86, 0.90),
    (-0.94, 0.42),
    (-0.66, 0.10),
    (-0.22, 0.02),
]
SPONSON_CORNERS_NEEDLE = [
    (0.00, 0.00),
    (0.38, 0.00),
    (0.72, 0.03),
    (1.00, 0.14),  # chine
    (0.96, 0.52),
    (0.76, 0.94),
    (0.32, 1.02),
    (0.00, 1.03),
    (-0.46, 0.98),
    (-0.90, 0.84),
    (-0.94, 0.34),
    (-0.60, 0.06),
    (-0.20, 0.00),
]
CHINE_INDEX = 3


def sponson_corners(cfg: BoatCfg):
    if cfg.style == "cat":
        return SPONSON_CORNERS_CAT
    if cfg.style == "unlimited":
        return SPONSON_CORNERS_UNLIMITED
    return SPONSON_CORNERS_NEEDLE


def sample_profile(corners, count):
    pts = [Vector((c[0], c[1], 0.0)) for c in corners]
    pts.append(pts[0])
    segs = [(pts[i + 1] - pts[i]).length for i in range(len(pts) - 1)]
    total = sum(segs) or 1.0
    out = []
    for k in range(count):
        d = total * k / count
        acc = 0.0
        for i, L in enumerate(segs):
            if acc + L >= d - 1e-9 or i == len(segs) - 1:
                t = 0.0 if L < 1e-9 else clamp((d - acc) / L)
                p = pts[i].lerp(pts[i + 1], t)
                out.append((p.x, p.y))
                break
            acc += L
    return out


def sponson_ring(cfg: BoatCfg, u, side, segs=18):
    """u: 0 rear bulkhead → 1 bow. side: +1 starboard, -1 port."""
    f = lerp(cfg.sponson_f0, cfg.sponson_f1, u)
    tip = smoother(remap(u, 0.80, 1.0))
    fork = smoother(remap(u, 0.55, 1.0))
    if cfg.style == "cat":
        # Full-length tunnel cat: hold beam, then blade into pickle tines.
        width_mul = (0.96 + 0.06 * math.sin(math.pi * u)) * (1.0 - 0.78 * tip)
        height_mul = (0.94 + 0.06 * (1.0 - u * 0.25)) * (1.0 - 0.38 * tip)
    elif cfg.style == "unlimited":
        # Fat ram sponsons, max volume around 2/3 forward, blunt ram nose.
        width_mul = (0.78 + 0.30 * math.sin(math.pi * clamp(u * 1.05))) * (1.0 - 0.62 * tip)
        height_mul = (1.02 + 0.10 * math.sin(math.pi * u)) * (1.0 - 0.28 * tip)
    else:
        # Needle tines: skinny, late taper, sharp.
        width_mul = (0.90 + 0.10 * math.sin(math.pi * u)) * (1.0 - 0.88 * tip)
        height_mul = (0.88 + 0.10 * math.sin(math.pi * u)) * (1.0 - 0.48 * tip)

    hw = cfg.sponson_hw * width_mul
    hh = cfg.sponson_h * height_mul
    rake = cfg.rake * (u ** 1.45)
    pad = 1.0 - smoother(remap(u, 0.0, 0.32))
    z_keel = 0.018 + rake - 0.016 * pad

    # Splay the pickle: tines walk outboard so the tunnel opens at the bow.
    if cfg.style == "cat":
        cx = cfg.sponson_cx * (1.0 + 0.14 * fork)
    elif cfg.style == "unlimited":
        cx = cfg.sponson_cx * (1.0 + 0.10 * fork)
    else:
        cx = cfg.sponson_cx * (1.0 + 0.18 * fork - 0.06 * tip)

    corners = sponson_corners(cfg)
    profile = sample_profile(corners, segs) if segs != len(corners) else list(corners)
    ring = []
    for ox, zn in profile:
        # Inner wall (ox < 0) pinches at the fork so each tine reads as a blade.
        inner = max(-ox, 0.0)
        outer = max(ox, 0.0)
        outboard = ox * hw
        if ox < 0:
            outboard = ox * hw * (1.0 - 0.42 * fork)
        z = z_keel + zn * hh
        # Outer tine reaches further forward; tunnel face recedes.
        f_pt = f + cfg.pickle * 0.18 * fork * outer - cfg.pickle * 0.10 * fork * inner
        world_x = side * (cx + outboard)
        ring.append(design_to_blender(world_x, f_pt, z))
    return ring, f, z_keel


def make_sponson(cfg: BoatCfg, side, mats, parent):
    label = "R" if side > 0 else "L"
    corners = sponson_corners(cfg)
    n_stat = 26
    segs = len(corners)
    rings = []
    f_bow = cfg.sponson_f1
    z_tip = 0.05 + cfg.rake + cfg.sponson_h * 0.16
    for i in range(n_stat):
        u = i / (n_stat - 1)
        ring, f, z_keel = sponson_ring(cfg, u, side, segs=segs)
        rings.append(ring)
    splay = 1.12 if cfg.style == "needle" else 1.10 if cfg.style == "cat" else 1.06
    tip = design_to_blender(side * cfg.sponson_cx * splay, f_bow + 0.16 + cfg.pickle * 0.08, z_tip)
    mesh = loft_quads(
        f"Sponson_{label}",
        rings,
        cap_start=True,
        cap_end=False,
        tip_end=tip,
        crease_js={CHINE_INDEX, CHINE_INDEX + 1},
    )
    crease_by_angle(mesh, 36.0)
    recalc_normals(mesh)
    obj = new_mesh_obj(f"Sponson_{label}", mesh, parent=parent, mat=mats["paint"])
    shade_smooth(obj, 36)
    add_subdiv(obj, levels=2, render=2)

    rail_len = (cfg.sponson_f1 - cfg.sponson_f0) * 0.72
    rail_f = lerp(cfg.sponson_f0, cfg.sponson_f1, 0.38)
    rail_x = side * (cfg.sponson_cx + cfg.sponson_hw * 0.98)
    rail = add_cube(
        f"SprayRail_{label}",
        (0.030, rail_len, 0.038),
        design_to_blender(rail_x, rail_f, cfg.sponson_h * 0.26),
        parent=parent,
        mat=mats["chrome"],
    )
    shade_smooth(rail, 60)

    # Wet running pad — dark keel language under the colored topsides.
    pad_len = (cfg.sponson_f1 - cfg.sponson_f0) * (0.58 if cfg.style != "unlimited" else 0.70)
    pad = add_cube(
        f"KeelPad_{label}",
        (cfg.sponson_hw * (1.05 if cfg.style == "unlimited" else 0.88), pad_len, 0.016),
        design_to_blender(side * cfg.sponson_cx, lerp(cfg.sponson_f0, cfg.sponson_f1, 0.34), 0.028),
        parent=parent,
        mat=mats["gunmetal"],
    )
    shade_smooth(pad, 80)

    if cfg.ram_nose:
        ram_x = side * cfg.sponson_cx * 1.08
        ram_f = cfg.sponson_f1 + 0.08
        ram_z = 0.15 + cfg.rake * 0.42
        ram = add_cylinder(
            f"RamPlate_{label}",
            cfg.sponson_hw * 0.58,
            0.44,
            design_to_blender(ram_x, ram_f, ram_z),
            parent=parent,
            mat=mats["gunmetal"],
            rot=(math.radians(90), 0, 0),
            segs=12,
            radius2=0.04,
        )
        shade_smooth(ram, 32)
        add_subdiv(ram, 1, 1)
        lip = add_cylinder(
            f"RamLip_{label}",
            cfg.sponson_hw * 0.42,
            0.05,
            design_to_blender(ram_x, ram_f + 0.20, ram_z),
            parent=parent,
            mat=mats["chrome"],
            rot=(math.radians(90), 0, 0),
            segs=12,
            radius2=0.055,
        )
        shade_smooth(lip, 40)
    else:
        # Accent pickle-fork cap so teal / magenta tines read at a glance.
        cap_r = 0.055 if cfg.style == "cat" else 0.038
        cap = add_cylinder(
            f"ForkTip_{label}",
            cap_r,
            0.22 if cfg.style == "cat" else 0.28,
            design_to_blender(side * cfg.sponson_cx * splay, f_bow + 0.10, z_tip + 0.02),
            parent=parent,
            mat=mats["accent"],
            rot=(math.radians(90), 0, 0),
            segs=8,
            radius2=0.012,
        )
        shade_smooth(cap, 30)

    if cfg.style == "cat":
        trap = add_cube(
            f"AirTrap_{label}",
            (0.018, (cfg.sponson_f1 - cfg.sponson_f0) * 0.52, cfg.sponson_h * 0.48),
            design_to_blender(
                side * (cfg.sponson_cx - cfg.sponson_hw * 0.96),
                lerp(cfg.sponson_f0, cfg.sponson_f1, 0.42),
                cfg.sponson_h * 0.46,
            ),
            parent=parent,
            mat=mats["cabin"],
        )
        shade_smooth(trap, 70)

    if cfg.armored:
        armor = add_cube(
            f"Armor_{label}",
            (0.022, (cfg.sponson_f1 - cfg.sponson_f0) * 0.42, cfg.sponson_h * 0.42),
            design_to_blender(
                side * (cfg.sponson_cx + cfg.sponson_hw * 0.88),
                lerp(cfg.sponson_f0, cfg.sponson_f1, 0.44),
                cfg.sponson_h * 0.46,
            ),
            parent=parent,
            mat=mats["gunmetal"],
        )
        shade_smooth(armor, 55)

    chev = add_cube(
        f"Chevron_{label}",
        (cfg.sponson_hw * (0.55 if cfg.style == "unlimited" else 0.38), 0.52, 0.016),
        design_to_blender(side * cfg.sponson_cx, lerp(cfg.sponson_f0, cfg.sponson_f1, 0.48), cfg.deck_z + 0.02),
        parent=parent,
        mat=mats["accent"],
    )
    chev.rotation_euler = (0.0, 0.0, side * math.radians(18 if cfg.style != "needle" else 10))
    return obj


def afterplane_ring(cfg: BoatCfg, u, segs=16):
    f = lerp(cfg.after_f0, cfg.after_f1, u)
    if cfg.style == "cat":
        beam = lerp(1.0, 0.92, u)
    elif cfg.style == "unlimited":
        # 3-point shoe: wide transom, wedge into the pickle gap.
        beam = lerp(1.0, 0.42, smoother(u))
    else:
        beam = lerp(1.0, 0.48, smoother(u))
    hw = cfg.after_hw * beam
    hh = cfg.after_h * lerp(1.0, 0.78 if cfg.style != "unlimited" else 0.88, u)
    z_keel = 0.05 + 0.10 * smoother(u)
    if cfg.style == "unlimited":
        z_keel = 0.035 + 0.16 * (u ** 1.4)
    elif cfg.style == "needle":
        z_keel = 0.04 + 0.08 * smoother(u)
    corners = [
        (0.00, 0.00),
        (0.70, 0.00),
        (1.00, 0.16),
        (1.00, 0.86),
        (0.52, 1.02),
        (0.00, 1.04),
        (-0.52, 1.02),
        (-1.00, 0.86),
        (-1.00, 0.16),
        (-0.70, 0.00),
    ]
    profile = sample_profile(corners, segs)
    ring = []
    for ox, zn in profile:
        x = ox * hw
        z = z_keel + zn * hh
        if zn < 0.2:
            z -= 0.04 * (1.0 - abs(ox)) * (1.0 - u)
        ring.append(design_to_blender(x, f, max(z, 0.018)))
    return ring, f


def make_afterplane(cfg: BoatCfg, mats, parent):
    n_stat = 16
    rings = []
    for i in range(n_stat):
        u = i / (n_stat - 1)
        ring, _ = afterplane_ring(cfg, u)
        rings.append(ring)
    mesh = loft_quads("Afterplane", rings, cap_start=True, cap_end=True, crease_js={2, 7})
    crease_by_angle(mesh, 36)
    recalc_normals(mesh)
    obj = new_mesh_obj("Afterplane", mesh, parent=parent, mat=mats["paint"])
    shade_smooth(obj, 34)
    add_subdiv(obj, 2, 2)

    # Smaller gunmetal plate so paint wraps the transom instead of a grey box.
    plate_w = 0.95 if cfg.style == "needle" else 1.22 if cfg.style == "cat" else 1.12
    plate_h = 0.48 if cfg.style == "needle" else 0.58 if cfg.style == "cat" else 0.70
    transom = add_cube(
        "TransomPlate",
        (cfg.after_hw * plate_w, 0.045, cfg.after_h * plate_h),
        design_to_blender(0, cfg.after_f0 - 0.02, cfg.after_h * (0.38 if cfg.style != "unlimited" else 0.46)),
        parent=parent,
        mat=mats["gunmetal"],
    )
    shade_smooth(transom, 80)
    add_cube(
        "SplashPlate",
        (cfg.after_hw * (1.35 if cfg.style != "needle" else 1.15), 0.20, 0.022),
        design_to_blender(0, cfg.after_f0 - 0.07, 0.055),
        parent=parent,
        mat=mats["chrome"],
    )
    # Wet afterplane pad
    add_cube(
        "AfterPad",
        (cfg.after_hw * 1.35, max(0.55, (cfg.after_f1 - cfg.after_f0) * 0.55), 0.014),
        design_to_blender(0, lerp(cfg.after_f0, cfg.after_f1, 0.28), 0.032),
        parent=parent,
        mat=mats["gunmetal"],
    )
    return obj


def make_tunnel_deck(cfg: BoatCfg, mats, parent):
    """Thick inverted-U deck spanning the sponsons, pickle-fork cut at the bow."""
    f0 = min(cfg.sponson_f0, cfg.after_f1) - 0.05
    f1 = cfg.sponson_f1 - cfg.pickle
    if f1 <= f0 + 0.4:
        f1 = f0 + 0.8
    n_l, n_w = 14, 10
    # Unlimited: leave sponsons as separate masses. Cat: roof the full tunnel.
    inset = 0.38 if cfg.style == "unlimited" else 0.22 if cfg.style == "needle" else 0.10
    half = cfg.sponson_cx - cfg.sponson_hw * inset
    thick = 0.07 if cfg.style != "cat" else 0.08
    z_top = cfg.deck_z
    bm = bmesh.new()
    grid = []
    for i in range(n_l):
        row = []
        u = i / (n_l - 1)
        f = lerp(f0, f1, u)
        # Parabolic U crotch — deck already ends pickle meters before the tips.
        scoop_t = smoother(remap(u, 0.62, 1.0))
        scoop = scoop_t * cfg.pickle * 0.28
        taper = 1.0 - 0.10 * scoop_t
        for j in range(n_w):
            v = j / (n_w - 1)
            x = lerp(-half * taper, half * taper, v)
            if cfg.style == "cat":
                arch = 0.02 + 0.06 * (1.0 - abs(v * 2 - 1) ** 1.6)
            elif cfg.style == "unlimited":
                arch = 0.03 * (1.0 - (v * 2 - 1) ** 2)
            else:
                arch = 0.045 * (1.0 - (v * 2 - 1) ** 2)
            z = z_top + arch
            center = (1.0 - abs(v * 2 - 1)) ** 2
            row.append(bm.verts.new(design_to_blender(x, f - scoop * center, z)))
        grid.append(row)
    for i in range(n_l - 1):
        for j in range(n_w - 1):
            try:
                bm.faces.new((grid[i][j], grid[i][j + 1], grid[i + 1][j + 1], grid[i + 1][j]))
            except ValueError:
                pass
    bmesh.ops.solidify(bm, geom=list(bm.faces) + list(bm.edges) + list(bm.verts), thickness=thick)
    obj = bm_to_obj("TunnelDeck", bm, parent=parent, mat=mats["paint"])
    shade_smooth(obj, 50)
    add_subdiv(obj, 1, 1)

    stripe_len = max(0.8, f1 - f0 - 0.35)
    stripe_w = 0.14 if cfg.style == "unlimited" else 0.08 if cfg.style == "needle" else 0.11
    add_cube(
        "CenterStripe",
        (stripe_w, stripe_len, 0.018),
        design_to_blender(0, (f0 + f1) * 0.5 - 0.08, z_top + 0.035),
        parent=parent,
        mat=mats["accent"],
    )
    return obj


def make_cowling(cfg: BoatCfg, mats, parent):
    n_stat, segs = 16, 16
    rings = []
    for i in range(n_stat):
        u = i / (n_stat - 1)
        f = lerp(cfg.cowling_f0, cfg.cowling_f1, u)
        if cfg.style == "needle":
            # Long dorsal spine, max thickness slightly aft of mid.
            env = math.sin(math.pi * clamp(u * 0.94 + 0.03)) ** 0.48
            hw = cfg.cowling_w * 0.5 * (0.18 + 0.82 * env)
            hh = cfg.cowling_h * (0.38 + 0.62 * env)
            nx, nz = 3.2, 2.6
        elif cfg.style == "unlimited":
            # Allison-style engine hump: volume lives in the aft 2/3.
            env = math.sin(math.pi * clamp(u * 0.82 + 0.04)) ** 0.92
            hw = cfg.cowling_w * 0.5 * (0.42 + 0.58 * env)
            hh = cfg.cowling_h * (0.55 + 0.55 * env)
            nx, nz = 2.4, 2.1
        else:
            # Low F1 cat cowl, compact.
            env = math.sin(math.pi * clamp(u * 0.96 + 0.02)) ** 0.78
            hw = cfg.cowling_w * 0.5 * (0.30 + 0.70 * env)
            hh = cfg.cowling_h * (0.42 + 0.58 * env)
            nx, nz = 2.9, 2.5
        z0 = cfg.deck_z + 0.015
        ring = []
        for k in range(segs):
            ang = (k / segs) * math.pi * 2.0 - math.pi / 2.0
            lx, lz = super_pt(ang, hw, hh, nx, nz)
            if math.sin(ang) < 0:
                lz = max(lz, -hh * 0.12)
            ring.append(design_to_blender(lx, f, z0 + lz + hh * 0.55))
        rings.append(ring)
    mesh = loft_quads("Cowling", rings, cap_start=True, cap_end=True)
    crease_by_angle(mesh, 52)
    recalc_normals(mesh)
    obj = new_mesh_obj("Cowling", mesh, parent=parent, mat=mats["paint"])
    shade_smooth(obj, 34)
    add_subdiv(obj, 1, 2)

    for k, ff in enumerate((0.22, 0.48, 0.74)):
        f = lerp(cfg.cowling_f0, cfg.cowling_f1, ff)
        add_cube(
            f"PanelLine_{k}",
            (cfg.cowling_w * (0.62 if cfg.style != "unlimited" else 0.78), 0.012, 0.012),
            design_to_blender(0, f, cfg.deck_z + cfg.cowling_h * 0.88),
            parent=parent,
            mat=mats["cabin"],
        )

    if cfg.style == "unlimited":
        # Cooling gills on the engine hump (merged at runtime).
        for i, ff in enumerate((0.30, 0.42, 0.54)):
            f = lerp(cfg.cowling_f0, cfg.cowling_f1, ff)
            for side in (-1, 1):
                add_cube(
                    f"Gill_{i}_{'R' if side > 0 else 'L'}",
                    (0.018, 0.08, cfg.cowling_h * 0.36),
                    design_to_blender(side * cfg.cowling_w * 0.48, f, cfg.deck_z + cfg.cowling_h * 0.52),
                    parent=parent,
                    mat=mats["cabin"],
                )
        # Neck between forward cockpit bubble and aft engine.
        add_cube(
            "CockpitNeck",
            (0.34, 0.55, 0.14),
            design_to_blender(0.0, 0.48, cfg.deck_z + 0.12),
            parent=parent,
            mat=mats["paint"],
        )
    return obj


def make_canopy(cfg: BoatCfg, mats, parent):
    """Raked hydro canopy loft — not a sphere. Style sets bubble vs needle vs F1 tub."""
    sx, sy, sz = cfg.canopy_s
    n_stat, segs = 10, 12
    if cfg.style == "unlimited":
        z0 = cfg.deck_z + 0.06
    else:
        z0 = cfg.deck_z + cfg.cowling_h * 0.38
    rings = []
    for i in range(n_stat):
        u = i / (n_stat - 1)
        if cfg.style == "needle":
            env = math.sin(math.pi * clamp(u * 0.94 + 0.03)) ** 0.50
            f = cfg.canopy_f + lerp(-sy * 0.70, sy * 1.02, u)
            rake = sz * 0.38 * smoother(u)
        elif cfg.style == "unlimited":
            env = math.sin(math.pi * clamp(u * 0.90 + 0.05)) ** 0.88
            f = cfg.canopy_f + lerp(-sy * 0.52, sy * 0.68, u)
            rake = sz * 0.18 * smoother(u)
        else:
            env = math.sin(math.pi * clamp(u * 0.92 + 0.04)) ** 0.72
            f = cfg.canopy_f + lerp(-sy * 0.55, sy * 0.78, u)
            rake = sz * 0.22 * smoother(u)
        hw = sx * (0.22 + 0.78 * env)
        hh = sz * (0.32 + 0.68 * env)
        ring = []
        for k in range(segs):
            ang = (k / segs) * math.pi * 2.0 - math.pi / 2.0
            lx, lz = super_pt(ang, hw, hh, 2.5, 2.2)
            if math.sin(ang) < 0:
                lz = max(lz, -hh * 0.08)
            ring.append(design_to_blender(lx, f, z0 + lz + hh * 0.58 + rake))
        rings.append(ring)
    mesh = loft_quads("CanopyGlass", rings, cap_start=True, cap_end=True)
    crease_by_angle(mesh, 60)
    recalc_normals(mesh)
    glass = new_mesh_obj("CanopyGlass", mesh, parent=parent, mat=mats["glass"])
    shade_smooth(glass, 22)
    add_subdiv(glass, 1, 1)

    # Carbon tub under the glass
    frame = add_cube(
        "CanopyFrame",
        (sx * 1.55, sy * 1.15, sz * 0.28),
        design_to_blender(0.0, cfg.canopy_f - sy * 0.08, z0 + sz * 0.12),
        parent=parent,
        mat=mats["cabin"],
    )
    shade_smooth(frame, 45)
    add_subdiv(frame, 1, 1)

    brow_f = cfg.canopy_f + sy * (0.55 if cfg.style == "needle" else 0.42)
    brow = add_cube(
        "WindshieldBrow",
        (sx * 1.45, 0.055, 0.026),
        design_to_blender(0.0, brow_f, z0 + sz * 0.78),
        parent=parent,
        mat=mats["chrome"],
    )
    brow.rotation_euler = (math.radians(-38 if cfg.style == "needle" else -28), 0, 0)

    if cfg.style == "cat":
        # F1-style roll hoop behind the tub.
        hoop = add_cylinder(
            "RollHoop",
            0.018,
            sz * 0.95,
            design_to_blender(0.0, cfg.canopy_f - sy * 0.52, z0 + sz * 0.85),
            parent=parent,
            mat=mats["chrome"],
            segs=10,
        )
        shade_smooth(hoop, 50)

    helmet = add_ico(
        "Helmet",
        0.10,
        design_to_blender(0.01, cfg.canopy_f + 0.02, z0 + sz * 0.42),
        parent=parent,
        mat=mats["cabin"],
        subdiv=2,
        scale=(1.0, 1.12, 0.88),
    )
    add_ico(
        "Visor",
        0.07,
        design_to_blender(0.01, cfg.canopy_f - 0.07, z0 + sz * 0.48),
        parent=parent,
        mat=mats["gunmetal"],
        subdiv=2,
        scale=(1.15, 0.45, 0.65),
    )
    return glass


def naca_section(chord, thick, n=10):
    pts = []
    for i in range(n):
        x = chord * (i / (n - 1)) ** 1.35
        xn = x / chord
        yt = (
            5.0
            * thick
            * (
                0.2969 * math.sqrt(max(xn, 0.0))
                - 0.1260 * xn
                - 0.3516 * xn ** 2
                + 0.2843 * xn ** 3
                - 0.1015 * xn ** 4
            )
        )
        pts.append((x, yt))
    upper = pts
    lower = [(x, -y) for x, y in reversed(pts[1:-1])]
    return upper + lower


def make_wing(cfg: BoatCfg, mats, parent):
    thick = 0.11 if cfg.style == "needle" else 0.13 if cfg.style == "cat" else 0.15
    section = naca_section(cfg.wing_chord, cfg.wing_chord * thick, n=9)
    n_span = 8
    rings = []
    for i in range(n_span):
        v = i / (n_span - 1)
        x = lerp(-cfg.wing_span * 0.5, cfg.wing_span * 0.5, v)
        if cfg.style == "needle":
            taper = 0.58 + 0.42 * math.sin(math.pi * v)
            sweep = 0.16 * abs(v * 2 - 1)
            dihedral = 0.07 * abs(x)
        elif cfg.style == "unlimited":
            taper = 0.80 + 0.20 * math.sin(math.pi * v)
            sweep = 0.05 * abs(v * 2 - 1)
            dihedral = 0.025 * abs(x)
        else:
            taper = 0.70 + 0.30 * math.sin(math.pi * v)
            sweep = 0.06 * abs(v * 2 - 1)
            dihedral = 0.03 * abs(x)
        ring = []
        for (cx, cz) in section:
            f = cfg.wing_f - cx * taper - sweep
            z = cfg.wing_z + cz * taper + dihedral
            ring.append(design_to_blender(x, f, z))
        rings.append(ring)
    mesh = loft_quads("RearWing", rings, cap_start=True, cap_end=True)
    crease_by_angle(mesh, 50)
    obj = new_mesh_obj("RearWing", mesh, parent=parent, mat=mats["cabin"])
    shade_smooth(obj, 35)
    add_subdiv(obj, 1, 1)

    ep_h = 0.12 if cfg.style == "needle" else 0.15 if cfg.style == "cat" else 0.22
    ep_t = 0.022 if cfg.style == "needle" else 0.028 if cfg.style == "cat" else 0.038
    for side in (-1, 1):
        ep = add_cube(
            f"Endplate_{'R' if side > 0 else 'L'}",
            (ep_t, cfg.wing_chord * (1.02 if cfg.style != "unlimited" else 1.18), ep_h),
            design_to_blender(side * cfg.wing_span * 0.5, cfg.wing_f - cfg.wing_chord * 0.45, cfg.wing_z - 0.02),
            parent=parent,
            mat=mats["accent"],
        )
        shade_smooth(ep, 60)

    z0 = cfg.deck_z + 0.05
    z1 = cfg.wing_z - 0.04
    depth = abs(z1 - z0)
    if cfg.style == "needle":
        # Single central pylon — twitchy needle silhouette from astern.
        strut = add_cube(
            "WingPylon",
            (0.022, cfg.wing_chord * 0.38, depth),
            design_to_blender(0.0, cfg.wing_f + 0.04, (z0 + z1) * 0.5),
            parent=parent,
            mat=mats["chrome"],
        )
        shade_smooth(strut, 40)
        add_subdiv(strut, 1, 1)
    else:
        r = 0.022 if cfg.style == "cat" else 0.038
        for si, side in enumerate((-1, 1)):
            x = side * cfg.after_hw * (0.38 if cfg.style == "cat" else 0.48)
            strut = add_cylinder(
                f"WingStrut_{'R' if side > 0 else 'L'}",
                r,
                depth,
                design_to_blender(x, cfg.wing_f + 0.08, (z0 + z1) * 0.5),
                parent=parent,
                mat=mats["chrome"],
                segs=10,
            )
            shade_smooth(strut, 50)
        if cfg.style == "unlimited":
            stay = add_cylinder(
                "WingStay",
                0.018,
                depth * 0.92,
                design_to_blender(0.0, cfg.wing_f + 0.02, (z0 + z1) * 0.5 + 0.02),
                parent=parent,
                mat=mats["chrome"],
                segs=8,
            )
            shade_smooth(stay, 50)
    return obj


def make_intake(cfg: BoatCfg, mats, parent):
    if cfg.style == "unlimited":
        # Low ram scoop on the engine roof, not a snorkel turret.
        scoop = add_cube(
            "IntakeScoop",
            (cfg.cowling_w * 0.28, 0.38, 0.10),
            design_to_blender(0.0, cfg.cowling_f1 - 0.08, cfg.deck_z + cfg.cowling_h + 0.02),
            parent=parent,
            mat=mats["cabin"],
        )
        scoop.rotation_euler = (math.radians(-18), 0, 0)
        shade_smooth(scoop, 32)
        add_subdiv(scoop, 1, 1)
        mouth = add_cylinder(
            "IntakeMouth",
            cfg.cowling_w * 0.12,
            0.05,
            design_to_blender(0.0, cfg.cowling_f1 + 0.12, cfg.deck_z + cfg.cowling_h + 0.06),
            parent=parent,
            mat=mats["chrome"],
            rot=(math.radians(90), 0, 0),
            segs=12,
            radius2=cfg.cowling_w * 0.16,
        )
        shade_smooth(mouth, 40)
        return
    if cfg.style == "cat":
        # Dual NACA ducts on the cowl flanks.
        for side in (-1, 1):
            duct = add_cube(
                f"IntakeNACA_{'R' if side > 0 else 'L'}",
                (0.07, 0.32, 0.09),
                design_to_blender(side * cfg.cowling_w * 0.42, cfg.cowling_f0 + 0.22, cfg.deck_z + cfg.cowling_h * 0.72),
                parent=parent,
                mat=mats["cabin"],
            )
            duct.rotation_euler = (math.radians(-12), 0, side * math.radians(8))
            shade_smooth(duct, 40)
            add_subdiv(duct, 1, 1)
        return
    # Needle: slim dorsal NACA.
    scoop = add_cube(
        "IntakeScoop",
        (cfg.cowling_w * 0.22, 0.42, 0.07),
        design_to_blender(0.0, cfg.cowling_f0 + 0.18, cfg.deck_z + cfg.cowling_h + 0.03),
        parent=parent,
        mat=mats["cabin"],
    )
    scoop.rotation_euler = (math.radians(-8), 0, 0)
    shade_smooth(scoop, 40)
    add_subdiv(scoop, 1, 1)


def make_hardware(cfg: BoatCfg, mats, parent):
    transom_f = cfg.after_f0
    if cfg.style == "unlimited":
        box_s = (0.48, 0.52, 0.28)
        box_z = 0.24
    elif cfg.style == "needle":
        box_s = (0.28, 0.34, 0.16)
        box_z = 0.18
    else:
        box_s = (0.40, 0.38, 0.20)
        box_z = 0.20
    box = add_cube(
        "Gearbox",
        box_s,
        design_to_blender(0.0, transom_f - 0.18, box_z),
        parent=parent,
        mat=mats["gunmetal"],
    )
    shade_smooth(box, 50)
    add_subdiv(box, 1, 1)

    shaft_len = 0.72 if cfg.style == "needle" else 0.88 if cfg.style == "unlimited" else 0.80
    add_cylinder(
        "PropShaft",
        0.024 if cfg.style == "needle" else 0.032,
        shaft_len,
        design_to_blender(0.0, transom_f - shaft_len * 0.62, 0.11),
        parent=parent,
        mat=mats["chrome"],
        rot=(math.radians(90), 0, 0),
        segs=12,
    )

    # Shaft is along Blender Y (boat length). Blades radiate in XZ.
    prop_f = transom_f - shaft_len * 0.95
    prop_root = new_empty("propeller", 0.15)
    prop_root.parent = parent
    prop_root.location = design_to_blender(0.0, prop_f, 0.11)
    hub_r = 0.056 if cfg.style == "unlimited" else 0.040 if cfg.style == "needle" else 0.048
    hub = add_cylinder(
        "PropHub",
        hub_r,
        0.12 if cfg.style != "unlimited" else 0.16,
        (0, 0, 0),
        parent=prop_root,
        mat=mats["chrome"],
        rot=(math.radians(90), 0, 0),
        segs=14,
    )
    shade_smooth(hub, 30)
    blade_span = 0.46 if cfg.style == "unlimited" else 0.30 if cfg.style == "needle" else 0.38
    for i in range(3):
        ang = i * (2.0 * math.pi / 3.0)
        blade = add_cube(
            f"PropBlade_{i}",
            (blade_span, 0.012, 0.11 if cfg.style != "needle" else 0.08),
            (0.0, 0.0, 0.0),
            parent=prop_root,
            mat=mats["chrome"],
        )
        blade.rotation_euler = (math.radians(22), ang, 0.0)
        ca, sa = math.cos(ang), math.sin(ang)
        blade.location = Vector((sa * blade_span * 0.52, 0.0, ca * blade_span * 0.52))
        shade_smooth(blade, 35)

    rudder = add_cube(
        "Rudder",
        (0.026 if cfg.style == "needle" else 0.034, 0.16 if cfg.style == "needle" else 0.20, 0.28 if cfg.style == "needle" else 0.34),
        design_to_blender(0.0, prop_f - 0.28, 0.02),
        parent=parent,
        mat=mats["gunmetal"],
    )
    shade_smooth(rudder, 45)
    add_subdiv(rudder, 1, 1)

    tab_w = 0.16 if cfg.style == "needle" else 0.24 if cfg.style == "cat" else 0.28
    for side in (-1, 1):
        add_cube(
            f"TrimTab_{'R' if side > 0 else 'L'}",
            (tab_w, 0.10, 0.016),
            design_to_blender(side * cfg.after_hw * 0.58, transom_f - 0.08, 0.05),
            parent=parent,
            mat=mats["chrome"],
        )

    # Skid fin — big on unlimited (left sponson), modest on the others.
    fin_scale = 1.35 if cfg.style == "unlimited" else 0.72 if cfg.style == "needle" else 0.9
    fin_x = -cfg.sponson_cx
    fin_f = lerp(cfg.sponson_f0, cfg.sponson_f1, 0.18 if cfg.style == "unlimited" else 0.24)
    fin = add_cube(
        "SkidFin",
        (0.018, 0.42 * fin_scale, 0.40 * fin_scale),
        design_to_blender(fin_x, fin_f, -0.02),
        parent=parent,
        mat=mats["gunmetal"],
    )
    shade_smooth(fin, 50)

    if cfg.style == "unlimited":
        xs, r1, r2, length, z_ex = [0.0], 0.11, 0.14, 0.72, 0.44
    elif cfg.style == "needle":
        xs, r1, r2, length, z_ex = [-0.14, 0.14], 0.042, 0.055, 0.48, 0.32
    else:
        xs, r1, r2, length, z_ex = [-0.28, 0.28], 0.062, 0.078, 0.50, 0.36
    for i, x in enumerate(xs):
        pipe = add_cylinder(
            f"Exhaust_{i}",
            r1,
            length,
            design_to_blender(x, transom_f - 0.10, z_ex),
            parent=parent,
            mat=mats["chrome"],
            rot=(math.radians(90 if cfg.style != "unlimited" else 78), 0, 0),
            segs=14,
            radius2=r2,
        )
        shade_smooth(pipe, 30)
        add_cylinder(
            f"ExhaustInner_{i}",
            r1 * 0.68,
            0.10,
            design_to_blender(x, transom_f - length * 0.72, z_ex + (0.08 if cfg.style == "unlimited" else 0.0)),
            parent=parent,
            mat=mats["cabin"],
            rot=(math.radians(90 if cfg.style != "unlimited" else 78), 0, 0),
            segs=12,
        )

    make_intake(cfg, mats, parent)

    # nav lights
    light_f = lerp(cfg.sponson_f0, cfg.sponson_f1, 0.62)
    add_uvsphere(
        "NavPort",
        0.035,
        design_to_blender(-cfg.sponson_cx - cfg.sponson_hw * 0.7, light_f, cfg.deck_z + 0.02),
        parent=parent,
        mat=mats["nav_port"],
        segs=12,
        rings=8,
    )
    add_uvsphere(
        "NavStbd",
        0.035,
        design_to_blender(cfg.sponson_cx + cfg.sponson_hw * 0.7, light_f, cfg.deck_z + 0.02),
        parent=parent,
        mat=mats["nav_stbd"],
        segs=12,
        rings=8,
    )

    # gunwale chrome strip along each sponson
    for side in (-1, 1):
        g_len = (cfg.sponson_f1 - cfg.sponson_f0) * 0.8
        add_cube(
            f"Gunwale_{'R' if side > 0 else 'L'}",
            (0.025, g_len, 0.02),
            design_to_blender(side * (cfg.sponson_cx + cfg.sponson_hw * 0.55), lerp(cfg.sponson_f0, cfg.sponson_f1, 0.45), cfg.deck_z + 0.01),
            parent=parent,
            mat=mats["chrome"],
        )

    # antenna
    add_cylinder(
        "Antenna",
        0.008,
        0.48 if cfg.style != "needle" else 0.62,
        design_to_blender(0.12, cfg.canopy_f - 0.35, cfg.canopy_z + 0.35),
        parent=parent,
        mat=mats["chrome"],
        segs=8,
    )

    if cfg.style == "needle":
        dorsal = add_cube(
            "Dorsal",
            (0.022, 0.42, 0.11),
            design_to_blender(0.0, cfg.canopy_f - 0.55, cfg.deck_z + cfg.cowling_h + 0.06),
            parent=parent,
            mat=mats["cabin"],
        )
        dorsal.rotation_euler = (math.radians(-8), 0, 0)
        shade_smooth(dorsal, 50)


def make_fx_anchors(cfg: BoatCfg, mats, parent):
    transom_f = cfg.after_f0
    turbine = new_empty("turbine", 0.2)
    turbine.parent = parent
    turbine.location = design_to_blender(0.0, transom_f, 0.42)

    bm = bmesh.new()
    bmesh.ops.create_cone(
        bm, cap_ends=True, cap_tris=False, segments=10, radius1=0.16, radius2=0.02, depth=0.9
    )
    glow_mesh = bpy.data.meshes.new("turbineGlow")
    bm.to_mesh(glow_mesh)
    bm.free()
    glow = new_mesh_obj("turbineGlow", glow_mesh, parent=parent, mat=mats["glow"])
    glow.location = design_to_blender(0.0, transom_f - 0.55, 0.38)
    glow.rotation_euler = (math.radians(90), 0, 0)
    # start hidden-ish; game drives opacity
    glow.scale = Vector((0.25, 0.25, 0.25))
    try:
        glow.visible_shadow = False
    except Exception:
        pass
    return turbine, glow


def make_spike(cfg: BoatCfg, mats, parent):
    if not cfg.spike:
        return
    # Stem from the pickle crotch so the spike is part of the hull, not a floater.
    f_base = cfg.sponson_f1 - cfg.pickle + 0.06
    f_tip = cfg.sponson_f1 + 0.48
    length = f_tip - f_base
    loc = design_to_blender(0.0, (f_base + f_tip) * 0.5, cfg.deck_z * 0.52)
    spike = add_cylinder(
        "NoseSpike",
        0.042,
        length,
        loc,
        parent=parent,
        mat=mats["accent"],
        rot=(math.radians(90), 0, 0),
        segs=10,
        radius2=0.006,
    )
    shade_smooth(spike, 22)
    add_subdiv(spike, 1, 1)
    collar = add_cylinder(
        "SpikeCollar",
        0.055,
        0.08,
        design_to_blender(0.0, f_base + 0.04, cfg.deck_z * 0.52),
        parent=parent,
        mat=mats["chrome"],
        rot=(math.radians(90), 0, 0),
        segs=10,
    )
    shade_smooth(collar, 40)


def make_numbers(cfg: BoatCfg, mats, parent):
    def text_obj(name, body, loc, size=0.22, extrude=0.012, rot=(math.radians(90), 0, 0)):
        curve = bpy.data.curves.new(name, "FONT")
        curve.body = body
        curve.size = size
        curve.extrude = extrude
        curve.bevel_depth = 0.0015
        curve.align_x = "CENTER"
        curve.align_y = "CENTER"
        obj = bpy.data.objects.new(name, curve)
        link(obj)
        obj.parent = parent
        obj.location = loc
        obj.rotation_euler = rot
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        try:
            bpy.ops.object.convert(target="MESH")
        except Exception as e:
            log("text convert failed", name, e)
            return obj
        if obj.data.materials:
            obj.data.materials[0] = mats["accent"]
        else:
            obj.data.materials.append(mats["accent"])
        return obj

    # Starboard: local X (text right) = bow (-Y), local Y (up) = +Z, local Z (out) = +X
    r_stbd = Matrix(((0, 0, 1), (-1, 0, 0), (0, 1, 0))).to_euler("XYZ")
    r_port = Matrix(((0, 0, -1), (1, 0, 0), (0, 1, 0))).to_euler("XYZ")
    text_obj(
        "Number_R",
        cfg.number,
        design_to_blender(cfg.cowling_w * 0.50, (cfg.cowling_f0 + cfg.cowling_f1) * 0.32, cfg.deck_z + cfg.cowling_h * 0.58),
        size=0.26,
        rot=tuple(r_stbd),
    )
    text_obj(
        "Number_L",
        cfg.number,
        design_to_blender(-cfg.cowling_w * 0.50, (cfg.cowling_f0 + cfg.cowling_f1) * 0.32, cfg.deck_z + cfg.cowling_h * 0.58),
        size=0.26,
        rot=tuple(r_port),
    )
    text_obj(
        "NameWing",
        cfg.name,
        design_to_blender(0.0, cfg.wing_f - cfg.wing_chord * 0.38, cfg.wing_z + 0.035),
        size=0.11,
        extrude=0.006,
        rot=(0, 0, math.pi),
    )


def make_fasteners(cfg: BoatCfg, mats, parent):
    bm = bmesh.new()
    pts = []
    for side in (-1, 1):
        for k in range(6):
            u = 0.18 + k * 0.12
            f = lerp(cfg.sponson_f0, cfg.sponson_f1, u)
            x = side * cfg.sponson_cx
            z = cfg.deck_z + 0.015
            pts.append(design_to_blender(x, f, z))
    for p in pts:
        geom = bmesh.ops.create_cone(
            bm, cap_ends=True, cap_tris=False, segments=6, radius1=0.012, radius2=0.012, depth=0.016
        )
        verts = geom.get("verts", [])
        if verts:
            bmesh.ops.translate(bm, verts=verts, vec=p)
    obj = bm_to_obj("Fasteners", bm, parent=parent, mat=mats["chrome"])
    return obj


def make_markers(cfg: BoatCfg, parent):
    bow = new_empty("bowMarker", 0.25)
    bow.parent = parent
    bow.location = design_to_blender(0.0, cfg.length * 0.5, 0.25)
    stern = new_empty("sternMarker", 0.25)
    stern.parent = parent
    stern.location = design_to_blender(0.0, -cfg.length * 0.5, 0.25)
    stbd = new_empty("starboardMarker", 0.25)
    stbd.parent = parent
    stbd.location = design_to_blender(cfg.width * 0.5, 0.0, 0.25)


# ---------------------------------------------------------------------------
# Assemble
# ---------------------------------------------------------------------------

def build_boat(cfg: BoatCfg, parent_name=None):
    mats = make_materials(cfg)
    root = new_empty(parent_name or cfg.id, size=0.8)
    make_sponson(cfg, +1, mats, root)
    make_sponson(cfg, -1, mats, root)
    make_afterplane(cfg, mats, root)
    make_tunnel_deck(cfg, mats, root)
    make_cowling(cfg, mats, root)
    make_canopy(cfg, mats, root)
    make_wing(cfg, mats, root)
    make_hardware(cfg, mats, root)
    make_fx_anchors(cfg, mats, root)
    make_spike(cfg, mats, root)
    make_numbers(cfg, mats, root)
    make_fasteners(cfg, mats, root)
    make_markers(cfg, root)
    return root


# ---------------------------------------------------------------------------
# Studio / export / preview
# ---------------------------------------------------------------------------

def setup_world(scene):
    world = bpy.data.worlds.new("Studio")
    scene.world = world
    try:
        world.use_nodes = True
    except Exception:
        pass
    nt = world.node_tree
    nt.nodes.clear()
    sky = nt.nodes.new("ShaderNodeTexSky")
    try:
        sky.sky_type = "NISHITA"
        sky.sun_elevation = math.radians(42)
        sky.sun_rotation = math.radians(35)
        sky.altitude = 100
        sky.air_density = 1.0
        sky.dust_density = 0.4
    except Exception:
        pass
    bg = nt.nodes.new("ShaderNodeBackground")
    bg.inputs[1].default_value = 0.92
    out = nt.nodes.new("ShaderNodeOutputWorld")
    nt.links.new(sky.outputs[0], bg.inputs[0])
    nt.links.new(bg.outputs[0], out.inputs[0])

    sun = bpy.data.lights.new("Key", "SUN")
    sun.energy = 7.2
    sun.angle = math.radians(5)
    sun.color = (1.0, 0.96, 0.90)
    sun_obj = bpy.data.objects.new("Key", sun)
    link(sun_obj)
    sun_obj.rotation_euler = (math.radians(52), math.radians(-18), math.radians(40))

    fill = bpy.data.lights.new("Fill", "AREA")
    fill.energy = 240
    fill.size = 8
    fill.color = (0.62, 0.78, 0.95)
    fill_obj = bpy.data.objects.new("Fill", fill)
    link(fill_obj)
    fill_obj.location = (-5.5, 4.0, 3.4)
    fill_obj.rotation_euler = (math.radians(70), 0, math.radians(-40))

    rim = bpy.data.lights.new("Rim", "AREA")
    rim.energy = 380
    rim.size = 5
    rim.color = (1.0, 0.70, 0.42)
    rim_obj = bpy.data.objects.new("Rim", rim)
    link(rim_obj)
    rim_obj.location = (3.2, -5.0, 2.6)
    rim_obj.rotation_euler = (math.radians(72), 0, math.radians(155))

    card = bpy.data.lights.new("Card", "AREA")
    card.energy = 120
    card.size = 10
    card.color = (1.0, 1.0, 1.0)
    card_obj = bpy.data.objects.new("Card", card)
    link(card_obj)
    card_obj.location = (0.0, -2.0, 7.5)
    card_obj.rotation_euler = (0, 0, 0)

    # bounce floor — not parented to the boat, skipped by GLB selection
    ground = add_cube("StudioGround", (40, 40, 0.05), Vector((0, 0, -0.08)), mat=None)
    gmat = principled("StudioFloor", color=(0.02, 0.025, 0.03, 1), metallic=0.0, roughness=0.18)
    ground.data.materials.append(gmat)


def bbox_world(root):
    mins = Vector((1e9, 1e9, 1e9))
    maxs = Vector((-1e9, -1e9, -1e9))
    found = False
    for obj in bpy.data.objects:
        if obj.type != "MESH":
            continue
        p = obj
        ok = False
        while p:
            if p == root:
                ok = True
                break
            p = p.parent
        if not ok:
            continue
        for corner in obj.bound_box:
            w = obj.matrix_world @ Vector(corner)
            mins.x, mins.y, mins.z = min(mins.x, w.x), min(mins.y, w.y), min(mins.z, w.z)
            maxs.x, maxs.y, maxs.z = max(maxs.x, w.x), max(maxs.y, w.y), max(maxs.z, w.z)
            found = True
    if not found:
        return Vector((-1, -1, -1)), Vector((1, 1, 1))
    return mins, maxs


def place_camera(scene, root, view):
    mins, maxs = bbox_world(root)
    center = (mins + maxs) * 0.5
    size = maxs - mins
    span = max(size.x, size.y, size.z, 1.0)
    dist = span * 1.62
    cam_data = bpy.data.cameras.new(f"Cam_{view}")
    cam_data.lens = 55
    cam_data.clip_start = 0.05
    cam_data.clip_end = 80
    cam = bpy.data.objects.new(f"Cam_{view}", cam_data)
    link(cam)
    if view == "three_quarter":
        # Low chase-cam 3/4: from stern-starboard (+Y is stern)
        loc = center + Vector((dist * 0.68, dist * 0.98, dist * 0.26))
    elif view == "side":
        loc = center + Vector((dist * 1.42, 0.0, dist * 0.06))
    elif view == "front":
        # bow is -Y
        loc = center + Vector((0.0, -dist * 1.42, dist * 0.10))
    elif view == "rear":
        loc = center + Vector((0.12, dist * 1.38, dist * 0.14))
    elif view == "top":
        loc = center + Vector((0.0, 0.05, dist * 1.55))
        cam_data.lens = 50
    else:
        loc = center + Vector((dist, -dist, dist * 0.4))
    cam.location = loc
    direction = center - loc
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam
    return cam


def configure_eevee(scene):
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1600
    scene.render.resolution_y = 1000
    scene.render.film_transparent = False
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.compression = 15
    ee = getattr(scene, "eevee", None)
    if ee:
        for attr, val in (
            ("taa_render_samples", 32),
            ("use_gtao", True),
            ("use_bloom", True),
            ("bloom_intensity", 0.04),
            ("use_ssr", True),
            ("use_ssr_refraction", True),
            ("use_raytracing", True),
        ):
            if hasattr(ee, attr):
                try:
                    setattr(ee, attr, val)
                except Exception:
                    pass


def render_views(scene, root, cfg: BoatCfg):
    configure_eevee(scene)
    PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
    views = ("three_quarter", "side", "front", "rear", "top")
    for view in views:
        cam = place_camera(scene, root, view)
        path = PREVIEW_DIR / f"{cfg.id}_{view}.png"
        scene.render.filepath = str(path)
        log("render", path.name)
        bpy.ops.render.render(write_still=True)
        # keep cameras in the blend for the artist
    return views


def select_hierarchy(obj):
    obj.hide_set(False)
    obj.hide_render = False
    obj.select_set(True)
    for c in obj.children:
        select_hierarchy(c)


def export_glb(root, path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    select_hierarchy(root)
    bpy.context.view_layer.objects.active = root
    try:
        bpy.ops.preferences.addon_enable(module="io_scene_gltf2")
    except Exception:
        pass
    kw = dict(
        filepath=str(path),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_materials="EXPORT",
        export_cameras=False,
        export_lights=False,
        export_animations=False,
        export_extras=True,
        export_texcoords=True,
        export_normals=True,
        export_image_format="AUTO",
    )
    log("export", path)
    bpy.ops.export_scene.gltf(**kw)


def inspect_glb(path: Path):
    with path.open("rb") as f:
        magic, version, length = struct.unpack("<4sII", f.read(12))
        json_bytes = b""
        while f.tell() < length:
            clen, ctype = struct.unpack("<I4s", f.read(8))
            data = f.read(clen)
            if ctype.rstrip(b"\x00") == b"JSON":
                json_bytes = data
            pad = (4 - (clen % 4)) % 4
            if pad:
                f.read(pad)
    doc = json.loads(json_bytes)
    log("GLB generator", doc.get("asset", {}).get("generator"))
    log("GLB nodes:")
    for i, n in enumerate(doc.get("nodes", [])):
        log(
            f"  [{i}]",
            n.get("name"),
            "t",
            n.get("translation"),
            "r",
            n.get("rotation"),
            "children",
            n.get("children"),
        )
    names = [n.get("name") for n in doc.get("nodes", [])]
    for need in (
        "turbine",
        "turbineGlow",
        "bowMarker",
        "sternMarker",
        "starboardMarker",
        "Sponson_L",
        "Sponson_R",
        "Afterplane",
        "SprayRail_L",
        "SprayRail_R",
        "SplashPlate",
        "TrimTab_L",
        "TrimTab_R",
        "TransomPlate",
        "SkidFin",
        "Rudder",
    ):
        log("  has", need, need in names)
    accessors = doc.get("accessors", [])
    tris = 0
    for mesh in doc.get("meshes", []):
        for prim in mesh.get("primitives", []):
            acc = accessors[prim["indices"]]
            if prim.get("mode", 4) == 4:
                tris += acc["count"] // 3
    log("  meshes", len(doc.get("meshes", [])), "nodes", len(names), "tris", tris, "mats", len(doc.get("materials", [])))
    return doc


def save_blend(path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(path))
    log("saved", path)


def unit_setup(scene):
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0
    scene.unit_settings.length_unit = "METERS"


def build_one(cfg: BoatCfg):
    wipe_scene()
    scene = bpy.context.scene
    unit_setup(scene)
    setup_world(scene)
    root = build_boat(cfg)
    mins, maxs = bbox_world(root)
    size = maxs - mins
    log(f"{cfg.id} bbox size", tuple(round(c, 3) for c in size), "min", tuple(round(c, 3) for c in mins), "max", tuple(round(c, 3) for c in maxs))
    log(f"{cfg.id} target L={cfg.length} W={cfg.width}")
    render_views(scene, root, cfg)
    glb = GLB_DIR / f"{cfg.id}.glb"
    export_glb(root, glb)
    inspect_glb(glb)
    save_blend(BLEND_DIR / f"{cfg.id}.blend")
    return glb


def build_fleet(cfgs):
    wipe_scene()
    scene = bpy.context.scene
    unit_setup(scene)
    setup_world(scene)
    roots = []
    for i, cfg in enumerate(cfgs):
        root = build_boat(cfg)
        root.location.x = i * 7.2
        roots.append(root)
    configure_eevee(scene)
    dummy = new_empty("fleetCenter", 0.1)
    dummy.location = Vector((7.2, 0, 0.4))
    scene.render.resolution_x = 2400
    scene.render.resolution_y = 1000
    cam_data = bpy.data.cameras.new("FleetCam")
    cam_data.lens = 32
    cam = bpy.data.objects.new("FleetCam", cam_data)
    link(cam)
    cam.location = Vector((7.2, 17.5, 5.4))
    direction = Vector((7.2, 0.0, 0.35)) - cam.location
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam
    path = PREVIEW_DIR / "fleet_lineup.png"
    scene.render.filepath = str(path)
    log("render fleet", path)
    bpy.ops.render.render(write_still=True)
    save_blend(BLEND_DIR / "hydro_fleet.blend")


def parse_args():
    argv = sys.argv
    if "--" in argv:
        argv = argv[argv.index("--") + 1 :]
    else:
        argv = []
    want = None
    skip_render = False
    i = 0
    while i < len(argv):
        if argv[i] == "--boat" and i + 1 < len(argv):
            want = argv[i + 1]
            i += 2
            continue
        if argv[i] == "--skip-render":
            skip_render = True
        i += 1
    return want, skip_render


def main():
    log("Blender", bpy.app.version, "building Hydro Havoc boats")
    BLEND_DIR.mkdir(parents=True, exist_ok=True)
    PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
    GLB_DIR.mkdir(parents=True, exist_ok=True)
    want, skip_render = parse_args()
    cfgs = boats()
    if want:
        cfgs = [c for c in cfgs if c.id == want]
        if not cfgs:
            raise SystemExit(f"unknown boat {want}")
    # monkeypatch render if skipped
    if skip_render:
        global render_views
        def render_views(scene, root, cfg):  # noqa
            log("skip render", cfg.id)
            return ()

    for cfg in cfgs:
        log("====", cfg.id, cfg.name, cfg.style)
        build_one(cfg)
    if want is None:
        log("==== fleet")
        build_fleet(boats())
    log("done")


if __name__ == "__main__":
    main()
