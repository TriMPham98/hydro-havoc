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
        color=cfg.color,
        metallic=0.12,
        roughness=0.11,
        coat=1.0,
        coat_rough=0.025,
        specular=0.6,
    )
    accent = principled(
        f"{cfg.id}_Accent",
        color=cfg.accent,
        metallic=0.28,
        roughness=0.14,
        coat=1.0,
        coat_rough=0.04,
        emission=cfg.accent,
        emission_strength=0.18,
    )
    cabin = principled(
        f"{cfg.id}_Carbon",
        color=cfg.cabin,
        metallic=0.35,
        roughness=0.32,
        coat=0.35,
        coat_rough=0.12,
    )
    chrome = principled(
        f"{cfg.id}_Chrome",
        color=(0.86, 0.89, 0.92, 1),
        metallic=1.0,
        roughness=0.08,
        coat=0.4,
        coat_rough=0.05,
    )
    gunmetal = principled(
        f"{cfg.id}_Gunmetal",
        color=(0.08, 0.09, 0.1, 1),
        metallic=0.92,
        roughness=0.28,
        coat=0.2,
        coat_rough=0.18,
    )
    glass = principled(
        f"{cfg.id}_Glass",
        color=cfg.glass,
        metallic=0.0,
        roughness=0.025,
        coat=1.0,
        coat_rough=0.02,
        transmission=1.0,
        ior=1.45,
        alpha=0.16,
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
            color=hex_lin(0x1BB8C9),
            accent=hex_lin(0xE7FBFF),
            cabin=hex_lin(0x08222A),
            glass=(0.25, 0.55, 0.65, 1.0),
            sponson_cx=0.72,
            sponson_hw=0.38,
            sponson_h=0.36,
            sponson_f0=-2.48,
            sponson_f1=2.62,
            rake=0.22,
            after_f0=-2.70,
            after_f1=-1.55,
            after_hw=0.95,
            after_h=0.32,
            deck_z=0.42,
            cowling_h=0.28,
            cowling_w=0.72,
            cowling_f0=-1.15,
            cowling_f1=1.05,
            canopy_f=0.22,
            canopy_z=0.72,
            canopy_s=(0.42, 0.62, 0.28),
            wing_span=2.15,
            wing_z=1.18,
            wing_f=-2.05,
            wing_chord=0.38,
            pickle=0.55,
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
            color=hex_lin(0xC45A1A),
            accent=hex_lin(0xFFB020),
            cabin=hex_lin(0x2A1208),
            glass=(0.45, 0.28, 0.12, 1.0),
            sponson_cx=0.86,
            sponson_hw=0.48,
            sponson_h=0.44,
            sponson_f0=-0.35,
            sponson_f1=3.05,
            rake=0.28,
            after_f0=-3.10,
            after_f1=0.55,
            after_hw=1.18,
            after_h=0.38,
            deck_z=0.46,
            cowling_h=0.36,
            cowling_w=0.92,
            cowling_f0=-1.35,
            cowling_f1=1.15,
            canopy_f=0.05,
            canopy_z=0.82,
            canopy_s=(0.48, 0.58, 0.32),
            wing_span=2.55,
            wing_z=1.32,
            wing_f=-2.35,
            wing_chord=0.44,
            pickle=0.70,
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
            color=hex_lin(0x6B3CFF),
            accent=hex_lin(0xFF3D6E),
            cabin=hex_lin(0x12081C),
            glass=(0.28, 0.12, 0.38, 1.0),
            sponson_cx=0.62,
            sponson_hw=0.30,
            sponson_h=0.32,
            sponson_f0=-0.85,
            sponson_f1=3.48,
            rake=0.26,
            after_f0=-3.55,
            after_f1=0.15,
            after_hw=0.82,
            after_h=0.30,
            deck_z=0.38,
            cowling_h=0.24,
            cowling_w=0.62,
            cowling_f0=-1.55,
            cowling_f1=1.45,
            canopy_f=0.35,
            canopy_z=0.68,
            canopy_s=(0.34, 0.70, 0.24),
            wing_span=2.05,
            wing_z=1.22,
            wing_f=-2.55,
            wing_chord=0.34,
            pickle=0.95,
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
SPONSON_CORNERS = [
    (0.00, 0.00),
    (0.48, 0.00),
    (0.78, 0.05),
    (1.00, 0.22),  # chine
    (0.97, 0.58),
    (0.86, 0.94),
    (0.42, 1.02),
    (0.00, 1.05),
    (-0.50, 1.00),
    (-0.92, 0.90),
    (-0.96, 0.42),
    (-0.72, 0.10),
    (-0.28, 0.02),
]
CHINE_INDEX = 3


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
    tip = smoother(remap(u, 0.78, 1.0))
    if cfg.style == "cat":
        width_mul = (0.94 + 0.06 * math.sin(math.pi * u)) * (1.0 - 0.92 * tip)
        height_mul = (0.92 + 0.08 * (1.0 - u * 0.3)) * (1.0 - 0.45 * tip)
    elif cfg.style == "unlimited":
        width_mul = (0.80 + 0.22 * math.sin(math.pi * clamp(u * 1.08))) * (1.0 - 0.9 * tip)
        height_mul = 1.06 * (1.0 - 0.42 * tip)
    else:
        width_mul = (0.88 + 0.12 * math.sin(math.pi * u)) * (1.0 - 0.95 * tip)
        height_mul = (0.9 + 0.1 * math.sin(math.pi * u)) * (1.0 - 0.5 * tip)

    hw = cfg.sponson_hw * width_mul
    hh = cfg.sponson_h * height_mul
    rake = cfg.rake * (u ** 1.55)
    pad = 1.0 - smoother(remap(u, 0.0, 0.38))
    z_keel = 0.02 + rake - 0.02 * pad

    cx = cfg.sponson_cx
    if cfg.style == "needle":
        cx = cfg.sponson_cx * (1.0 + 0.10 * math.sin(math.pi * u) - 0.16 * tip)
    elif cfg.style == "unlimited":
        cx = cfg.sponson_cx * (1.0 + 0.05 * (1.0 - tip))

    profile = sample_profile(SPONSON_CORNERS, segs) if segs != len(SPONSON_CORNERS) else list(SPONSON_CORNERS)
    ring = []
    for ox, zn in profile:
        outboard = ox * hw
        z = z_keel + zn * hh
        world_x = side * (cx + outboard)
        ring.append(design_to_blender(world_x, f, z))
    return ring, f, z_keel


def make_sponson(cfg: BoatCfg, side, mats, parent):
    label = "R" if side > 0 else "L"
    n_stat = 26
    segs = len(SPONSON_CORNERS)
    rings = []
    f_bow = cfg.sponson_f1
    z_tip = 0.04 + cfg.rake + cfg.sponson_h * 0.18
    for i in range(n_stat):
        u = i / (n_stat - 1)
        ring, f, z_keel = sponson_ring(cfg, u, side, segs=segs)
        rings.append(ring)
    tip = design_to_blender(side * cfg.sponson_cx * 0.88, f_bow + 0.12, z_tip)
    mesh = loft_quads(
        f"Sponson_{label}",
        rings,
        cap_start=True,
        cap_end=False,
        tip_end=tip,
        crease_js={CHINE_INDEX, CHINE_INDEX + 1},
    )
    crease_by_angle(mesh, 38.0)
    recalc_normals(mesh)
    obj = new_mesh_obj(f"Sponson_{label}", mesh, parent=parent, mat=mats["paint"])
    shade_smooth(obj, 36)
    add_subdiv(obj, levels=2, render=2)

    rail_len = (cfg.sponson_f1 - cfg.sponson_f0) * 0.68
    rail_f = lerp(cfg.sponson_f0, cfg.sponson_f1, 0.40)
    rail_x = side * (cfg.sponson_cx + cfg.sponson_hw * 0.96)
    rail = add_cube(
        f"SprayRail_{label}",
        (0.028, rail_len, 0.035),
        design_to_blender(rail_x, rail_f, cfg.sponson_h * 0.28),
        parent=parent,
        mat=mats["chrome"],
    )
    shade_smooth(rail, 60)

    if cfg.ram_nose:
        ram = add_cylinder(
            f"RamPlate_{label}",
            cfg.sponson_hw * 0.62,
            0.42,
            design_to_blender(side * cfg.sponson_cx, cfg.sponson_f1 - 0.02, 0.16 + cfg.rake * 0.45),
            parent=parent,
            mat=mats["gunmetal"],
            rot=(math.radians(90), 0, 0),
            segs=10,
            radius2=0.035,
        )
        shade_smooth(ram, 35)
        add_subdiv(ram, 1, 1)

    chev = add_cube(
        f"Chevron_{label}",
        (cfg.sponson_hw * 0.42, 0.48, 0.016),
        design_to_blender(side * cfg.sponson_cx, lerp(cfg.sponson_f0, cfg.sponson_f1, 0.52), cfg.deck_z + 0.018),
        parent=parent,
        mat=mats["accent"],
    )
    chev.rotation_euler = (0.0, 0.0, side * math.radians(16))
    return obj


def afterplane_ring(cfg: BoatCfg, u, segs=16):
    f = lerp(cfg.after_f0, cfg.after_f1, u)
    beam = lerp(1.0, 0.70, smoother(u))
    if cfg.style == "cat":
        beam = lerp(1.0, 0.88, u)
    hw = cfg.after_hw * beam
    hh = cfg.after_h * lerp(1.0, 0.82, u)
    z_keel = 0.05 + 0.10 * smoother(u)
    if cfg.style == "unlimited":
        z_keel = 0.04 + 0.14 * (u ** 1.5)
    corners = [
        (0.00, 0.00),
        (0.70, 0.00),
        (1.00, 0.18),
        (1.00, 0.88),
        (0.55, 1.02),
        (0.00, 1.04),
        (-0.55, 1.02),
        (-1.00, 0.88),
        (-1.00, 0.18),
        (-0.70, 0.00),
    ]
    profile = sample_profile(corners, segs)
    ring = []
    for ox, zn in profile:
        x = ox * hw
        z = z_keel + zn * hh
        if zn < 0.2:
            z -= 0.035 * (1.0 - (abs(ox))) * (1.0 - u)
        ring.append(design_to_blender(x, f, max(z, 0.02)))
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

    transom = add_cube(
        "TransomPlate",
        (cfg.after_hw * 1.72, 0.04, cfg.after_h * 0.95),
        design_to_blender(0, cfg.after_f0 - 0.02, cfg.after_h * 0.52),
        parent=parent,
        mat=mats["gunmetal"],
    )
    shade_smooth(transom, 80)
    add_cube(
        "SplashPlate",
        (cfg.after_hw * 1.55, 0.18, 0.022),
        design_to_blender(0, cfg.after_f0 - 0.06, 0.06),
        parent=parent,
        mat=mats["chrome"],
    )
    return obj


def make_tunnel_deck(cfg: BoatCfg, mats, parent):
    """Thick inverted-U deck spanning the sponsons, pickle-fork cut at the bow."""
    f0 = min(cfg.sponson_f0, cfg.after_f1) - 0.05
    f1 = cfg.sponson_f1 - cfg.pickle
    if f1 <= f0 + 0.4:
        f1 = f0 + 0.8
    n_l, n_w = 12, 10
    half = cfg.sponson_cx - cfg.sponson_hw * 0.15
    thick = 0.075
    z_top = cfg.deck_z
    bm = bmesh.new()
    grid = []
    for i in range(n_l):
        row = []
        u = i / (n_l - 1)
        f = lerp(f0, f1, u)
        # pickle: inner width stays, outer front corners stay with sponsons;
        # front edge scoops back at center
        scoop = smoother(remap(u, 0.72, 1.0)) * cfg.pickle * 0.35
        for j in range(n_w):
            v = j / (n_w - 1)
            x = lerp(-half, half, v)
            arch = 0.05 * (1.0 - (v * 2 - 1) ** 2)
            z = z_top + arch - scoop * 0.05
            row.append(bm.verts.new(design_to_blender(x, f - scoop * (1.0 - abs(v * 2 - 1)), z)))
        grid.append(row)
    # top faces
    for i in range(n_l - 1):
        for j in range(n_w - 1):
            try:
                bm.faces.new((grid[i][j], grid[i][j + 1], grid[i + 1][j + 1], grid[i + 1][j]))
            except ValueError:
                pass
    # solidify downward
    bmesh.ops.solidify(bm, geom=list(bm.faces) + list(bm.edges) + list(bm.verts), thickness=thick)
    obj = bm_to_obj("TunnelDeck", bm, parent=parent, mat=mats["paint"])
    shade_smooth(obj, 50)
    add_subdiv(obj, 1, 1)

    # center livery stripe
    stripe_len = max(0.8, f1 - f0 - 0.2)
    stripe = add_cube(
        "CenterStripe",
        (0.10, stripe_len, 0.018),
        design_to_blender(0, (f0 + f1) * 0.5, z_top + 0.03),
        parent=parent,
        mat=mats["accent"],
    )
    return obj


def make_cowling(cfg: BoatCfg, mats, parent):
    n_stat, segs = 14, 16
    rings = []
    for i in range(n_stat):
        u = i / (n_stat - 1)
        f = lerp(cfg.cowling_f0, cfg.cowling_f1, u)
        # teardrop planform
        env = math.sin(math.pi * clamp(u * 0.98 + 0.01)) ** 0.72
        if cfg.style == "needle":
            env = math.sin(math.pi * clamp(u * 0.96 + 0.02)) ** 0.55
        hw = cfg.cowling_w * 0.5 * (0.28 + 0.72 * env)
        hh = cfg.cowling_h * (0.45 + 0.55 * env)
        z0 = cfg.deck_z + 0.02
        ring = []
        for k in range(segs):
            ang = (k / segs) * math.pi * 2.0 - math.pi / 2.0
            # flatten bottom so it sits on deck
            lx, lz = super_pt(ang, hw, hh, 2.8, 2.4)
            if math.sin(ang) < 0:
                lz = max(lz, -hh * 0.15)
            ring.append(design_to_blender(lx, f, z0 + lz + hh * 0.55))
        rings.append(ring)
    mesh = loft_quads("Cowling", rings, cap_start=True, cap_end=True)
    crease_by_angle(mesh, 55)
    recalc_normals(mesh)
    obj = new_mesh_obj("Cowling", mesh, parent=parent, mat=mats["paint"])
    shade_smooth(obj, 35)
    add_subdiv(obj, 1, 2)

    # panel-line recesses as thin dark strips
    for k, ff in enumerate((0.25, 0.55, 0.78)):
        f = lerp(cfg.cowling_f0, cfg.cowling_f1, ff)
        add_cube(
            f"PanelLine_{k}",
            (cfg.cowling_w * 0.72, 0.012, 0.012),
            design_to_blender(0, f, cfg.deck_z + cfg.cowling_h * 0.85),
            parent=parent,
            mat=mats["cabin"],
        )
    return obj


def make_canopy(cfg: BoatCfg, mats, parent):
    sx, sy, sz = cfg.canopy_s
    loc = design_to_blender(0.0, cfg.canopy_f, cfg.deck_z + cfg.cowling_h * 0.62)
    glass = add_ico(
        "CanopyGlass",
        1.0,
        loc,
        parent=parent,
        mat=mats["glass"],
        subdiv=3,
        scale=(sx * 0.95, sy * 0.92, sz * 0.85),
    )
    shade_smooth(glass, 22)
    add_subdiv(glass, 1, 1)

    frame = add_ico(
        "CanopyFrame",
        1.0,
        loc + Vector((0, 0, -sz * 0.42)),
        parent=parent,
        mat=mats["cabin"],
        subdiv=2,
        scale=(sx * 1.02, sy * 0.95, sz * 0.32),
    )
    shade_smooth(frame, 40)

    brow = add_cube(
        "WindshieldBrow",
        (sx * 1.2, 0.06, 0.028),
        loc + Vector((0.0, -sy * 0.32, sz * 0.08)),
        parent=parent,
        mat=mats["chrome"],
    )
    brow.rotation_euler = (math.radians(-32), 0, 0)

    helmet = add_ico(
        "Helmet",
        0.11,
        loc + Vector((0.01, 0.02, -sz * 0.22)),
        parent=parent,
        mat=mats["cabin"],
        subdiv=2,
        scale=(1.0, 1.12, 0.88),
    )
    visor = add_ico(
        "Visor",
        0.075,
        loc + Vector((0.01, -0.08, -sz * 0.18)),
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
    section = naca_section(cfg.wing_chord, cfg.wing_chord * 0.12, n=9)
    # loft along span; slight sweep and thin tips
    n_span = 8
    rings = []
    for i in range(n_span):
        v = i / (n_span - 1)
        x = lerp(-cfg.wing_span * 0.5, cfg.wing_span * 0.5, v)
        taper = 0.72 + 0.28 * math.sin(math.pi * v)
        sweep = 0.08 * abs(v * 2 - 1)
        dihedral = 0.04 * abs(x)
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

    for side in (-1, 1):
        ep = add_cube(
            f"Endplate_{'R' if side > 0 else 'L'}",
            (0.028, cfg.wing_chord * 1.05, 0.16),
            design_to_blender(side * cfg.wing_span * 0.5, cfg.wing_f - cfg.wing_chord * 0.45, cfg.wing_z - 0.01),
            parent=parent,
            mat=mats["accent"],
        )
        shade_smooth(ep, 60)

    # struts from transom
    for side in (-0.42, 0.42):
        x = side * cfg.after_hw
        z0 = cfg.deck_z + 0.05
        z1 = cfg.wing_z - 0.04
        depth = abs(z1 - z0)
        strut = add_cylinder(
            f"WingStrut_{side}",
            0.025,
            depth,
            design_to_blender(x, cfg.wing_f + 0.08, (z0 + z1) * 0.5),
            parent=parent,
            mat=mats["chrome"],
            segs=10,
        )
        shade_smooth(strut, 50)
    return obj


def make_hardware(cfg: BoatCfg, mats, parent):
    transom_f = cfg.after_f0
    # gearbox
    box = add_cube(
        "Gearbox",
        (0.38, 0.42, 0.22),
        design_to_blender(0.0, transom_f - 0.18, 0.22),
        parent=parent,
        mat=mats["gunmetal"],
    )
    shade_smooth(box, 50)
    add_subdiv(box, 1, 1)

    shaft = add_cylinder(
        "PropShaft",
        0.028,
        0.85,
        design_to_blender(0.0, transom_f - 0.55, 0.12),
        parent=parent,
        mat=mats["chrome"],
        rot=(math.radians(90), 0, 0),
        segs=12,
    )

    # Shaft is along Blender Y (boat length). Blades radiate in XZ.
    prop_root = new_empty("propeller", 0.15)
    prop_root.parent = parent
    prop_root.location = design_to_blender(0.0, transom_f - 0.82, 0.11)
    hub = add_cylinder(
        "PropHub",
        0.048,
        0.12,
        (0, 0, 0),
        parent=prop_root,
        mat=mats["chrome"],
        rot=(math.radians(90), 0, 0),
        segs=14,
    )
    shade_smooth(hub, 30)
    for i in range(3):
        ang = i * (2.0 * math.pi / 3.0)
        blade = add_cube(
            f"PropBlade_{i}",
            (0.38, 0.012, 0.11),
            (0.0, 0.0, 0.0),
            parent=prop_root,
            mat=mats["chrome"],
        )
        # pitch around X, then spin around shaft Y
        blade.rotation_euler = (math.radians(22), ang, 0.0)
        ca, sa = math.cos(ang), math.sin(ang)
        blade.location = Vector((sa * 0.20, 0.0, ca * 0.20))
        shade_smooth(blade, 35)

    # rudder behind prop
    rudder = add_cube(
        "Rudder",
        (0.03, 0.18, 0.32),
        design_to_blender(0.0, transom_f - 1.18, 0.02),
        parent=parent,
        mat=mats["gunmetal"],
    )
    shade_smooth(rudder, 45)
    add_subdiv(rudder, 1, 1)

    # trim tabs
    for side in (-1, 1):
        add_cube(
            f"TrimTab_{'R' if side > 0 else 'L'}",
            (0.22, 0.10, 0.016),
            design_to_blender(side * cfg.after_hw * 0.55, transom_f - 0.08, 0.05),
            parent=parent,
            mat=mats["chrome"],
        )

    # skid fin — port sponson (realistic unlimited hydro)
    fin_x = -cfg.sponson_cx
    fin_f = lerp(cfg.sponson_f0, cfg.sponson_f1, 0.22)
    fin = add_cube(
        "SkidFin",
        (0.018, 0.38, 0.36),
        design_to_blender(fin_x, fin_f, -0.02),
        parent=parent,
        mat=mats["gunmetal"],
    )
    shade_smooth(fin, 50)

    # exhaust
    exhaust_fs = [transom_f + 0.15]
    xs = [0.0]
    if cfg.dual_exhaust:
        xs = [-0.22, 0.22]
    for i, x in enumerate(xs):
        pipe = add_cylinder(
            f"Exhaust_{i}",
            0.07,
            0.55,
            design_to_blender(x, transom_f - 0.12, 0.38),
            parent=parent,
            mat=mats["chrome"],
            rot=(math.radians(90), 0, 0),
            segs=14,
            radius2=0.085,
        )
        shade_smooth(pipe, 30)
        add_cylinder(
            f"ExhaustInner_{i}",
            0.048,
            0.12,
            design_to_blender(x, transom_f - 0.40, 0.38),
            parent=parent,
            mat=mats["cabin"],
            rot=(math.radians(90), 0, 0),
            segs=12,
        )

    # intake scoop
    scoop = add_cube(
        "IntakeScoop",
        (cfg.cowling_w * 0.35, 0.28, 0.12),
        design_to_blender(0.0, cfg.cowling_f0 + 0.25, cfg.deck_z + cfg.cowling_h + 0.02),
        parent=parent,
        mat=mats["cabin"],
    )
    shade_smooth(scoop, 40)
    add_subdiv(scoop, 1, 1)

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
        0.55,
        design_to_blender(0.12, cfg.canopy_f - 0.35, cfg.canopy_z + 0.35),
        parent=parent,
        mat=mats["chrome"],
        segs=8,
    )


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
    f_base = cfg.sponson_f1 - cfg.pickle * 0.45
    f_tip = cfg.sponson_f1 + 0.38
    length = f_tip - f_base
    loc = design_to_blender(0.0, (f_base + f_tip) * 0.5, cfg.deck_z * 0.55)
    spike = add_cylinder(
        "NoseSpike",
        0.05,
        length,
        loc,
        parent=parent,
        mat=mats["accent"],
        rot=(math.radians(90), 0, 0),
        segs=10,
        radius2=0.008,
    )
    shade_smooth(spike, 25)
    add_subdiv(spike, 1, 1)


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
    bg.inputs[1].default_value = 1.15
    out = nt.nodes.new("ShaderNodeOutputWorld")
    nt.links.new(sky.outputs[0], bg.inputs[0])
    nt.links.new(bg.outputs[0], out.inputs[0])

    sun = bpy.data.lights.new("Key", "SUN")
    sun.energy = 6.5
    sun.angle = math.radians(6)
    sun.color = (1.0, 0.97, 0.92)
    sun_obj = bpy.data.objects.new("Key", sun)
    link(sun_obj)
    sun_obj.rotation_euler = (math.radians(52), math.radians(-18), math.radians(40))

    fill = bpy.data.lights.new("Fill", "AREA")
    fill.energy = 420
    fill.size = 8
    fill.color = (0.65, 0.80, 0.95)
    fill_obj = bpy.data.objects.new("Fill", fill)
    link(fill_obj)
    fill_obj.location = (-5.5, 4.0, 3.4)
    fill_obj.rotation_euler = (math.radians(70), 0, math.radians(-40))

    rim = bpy.data.lights.new("Rim", "AREA")
    rim.energy = 320
    rim.size = 5
    rim.color = (1.0, 0.72, 0.45)
    rim_obj = bpy.data.objects.new("Rim", rim)
    link(rim_obj)
    rim_obj.location = (3.2, -5.0, 2.6)
    rim_obj.rotation_euler = (math.radians(72), 0, math.radians(155))

    card = bpy.data.lights.new("Card", "AREA")
    card.energy = 180
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
    dist = span * 1.85
    cam_data = bpy.data.cameras.new(f"Cam_{view}")
    cam_data.lens = 50
    cam_data.clip_start = 0.05
    cam_data.clip_end = 80
    cam = bpy.data.objects.new(f"Cam_{view}", cam_data)
    link(cam)
    if view == "three_quarter":
        # chase-cam 3/4: from stern-starboard (+Y is stern)
        loc = center + Vector((dist * 0.82, dist * 1.12, dist * 0.40))
    elif view == "side":
        loc = center + Vector((dist * 1.55, 0.0, dist * 0.08))
    elif view == "front":
        # bow is -Y
        loc = center + Vector((0.0, -dist * 1.55, dist * 0.12))
    elif view == "rear":
        loc = center + Vector((0.15, dist * 1.55, dist * 0.18))
    elif view == "top":
        loc = center + Vector((0.0, 0.05, dist * 1.7))
        cam_data.lens = 45
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
    for need in ("turbine", "turbineGlow", "bowMarker", "sternMarker", "starboardMarker"):
        log("  has", need, need in names)
    # accessors bbox of first mesh
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
    cam_data.lens = 38
    cam = bpy.data.objects.new("FleetCam", cam_data)
    link(cam)
    cam.location = Vector((10.5, 14.5, 4.2))
    direction = Vector((7.2, 0.0, 0.4)) - cam.location
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
