"""
ピカチュウの3Dモデル生成スクリプト（Blender / bpy）

使い方:
  python3 tools/blender/build_pikachu.py      # public/models/pikachu.glb を出力
  （Blender 本体なら: blender -b -P tools/blender/build_pikachu.py）

- 高さ約 0.9m（耳の先まで）、足元が原点、正面は Blender の -Y（ゲームでは +Z）。
- ゲーム側でアニメーションできるよう、パーツを名前付きの別オブジェクトにしている:
    pikachu (root) ─ body ─ head ─ earL / earR / 顔パーツ
                         ├ armL / armR ─ （腕は肩が原点）
                         ├ footL / footR
                         └ tail（付け根が原点）
- 表面はなめらか（スムーズシェード）。耳の先の黒・背中のしま・しっぽの根元の茶色は面ごとのマテリアルで塗り分け。
"""
import bpy
import bmesh
import math
import os
from mathutils import Vector, Matrix, Euler

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, '..', '..', 'public', 'models'))


def lin(hexstr):
    h = hexstr.lstrip('#')
    out = []
    for i in (0, 2, 4):
        c = int(h[i:i + 2], 16) / 255
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return out + [1.0]


COLORS = {
    'yellow': '#fcd23c', 'black': '#1c1c1c', 'brown': '#8a5426', 'red': '#ec5a3c', 'white': '#ffffff',
    'mouth': '#8c2a2a', 'tongue': '#f08a8a',
}
MATS = {}


def mat(name):
    if name not in MATS:
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        bsdf = m.node_tree.nodes.get('Principled BSDF')
        bsdf.inputs['Base Color'].default_value = lin(COLORS[name])
        bsdf.inputs['Roughness'].default_value = 0.85 if name != 'black' else 0.4
        bsdf.inputs['Metallic'].default_value = 0.0
        MATS[name] = m
    return MATS[name]


def new_obj(name, bm, mats, parent=None, loc=(0, 0, 0), smooth=True):
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    for m in mats:
        mesh.materials.append(mat(m))
    for p in mesh.polygons:
        p.use_smooth = smooth
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = loc
    if parent:
        obj.parent = parent
    return obj


def ellipsoid(radii, seg=32, rings=16, matrix=None):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * radii[0], v.co.y * radii[1], v.co.z * radii[2]))
    if matrix is not None:
        bmesh.ops.transform(bm, matrix=matrix, verts=bm.verts)
    return bm


def surface(center, radii, yaw, pitch):
    """楕円体の表面の点と法線。yaw: 正面(-Y)から左右、pitch: 上下"""
    d = Vector((math.sin(yaw) * math.cos(pitch), -math.cos(yaw) * math.cos(pitch), math.sin(pitch)))
    # 楕円体上の点
    k = 1 / math.sqrt((d.x / radii[0]) ** 2 + (d.y / radii[1]) ** 2 + (d.z / radii[2]) ** 2)
    p = Vector(center) + d * k
    q = p - Vector(center)
    n = Vector((q.x / radii[0] ** 2, q.y / radii[1] ** 2, q.z / radii[2] ** 2)).normalized()
    return p, n


def face_part(name, parent, center, radii, yaw, pitch, size, color, sink=0.35, extra=None):
    """頭の表面に貼りつく平たい楕円体（目・ほっぺ・鼻・口）"""
    p, n = surface(center, radii, yaw, pitch)
    rot = n.to_track_quat('Z', 'Y').to_matrix().to_4x4()
    m = Matrix.Translation(p - n * size[2] * sink) @ rot
    if extra is not None:
        m = m @ extra
    bm = ellipsoid(size, 20, 10, m)
    return new_obj(name, bm, [color], parent)


def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    MATS.clear()

    root = bpy.data.objects.new('pikachu', None)
    bpy.context.scene.collection.objects.link(root)

    # ── からだ: 下がふくらんだ洋なし形。背中に茶色のしま2本 ──
    BODY_C = (0, 0, 0.21)
    bm = ellipsoid((0.17, 0.15, 0.2), 32, 18)
    for v in bm.verts:
        t = max(0.0, -v.co.z / 0.2)  # 下半分ほど太く
        k = 1 + 0.22 * t - 0.1 * max(0.0, v.co.z / 0.2)
        v.co.x *= k
        v.co.y *= k
    for f in bm.faces:
        c = f.calc_center_median()
        if c.y > 0.07 and (-0.02 < c.z < 0.025 or -0.1 < c.z < -0.055):
            f.material_index = 1
    body = new_obj('body', bm, ['yellow', 'brown'], root, BODY_C)

    # ── 頭: 横に少し広い丸。顔パーツと耳は頭の子 ──
    HEAD_R = (0.235, 0.205, 0.2)
    head_bm = ellipsoid(HEAD_R, 36, 18)
    for v in head_bm.verts:
        # ほっぺのあたりを少しふくらませ、あごを丸く
        if v.co.z < 0:
            v.co.x *= 1 + 0.06 * (-v.co.z / HEAD_R[2])
    head = new_obj('head', head_bm, ['yellow'], body, (0, 0, 0.35))
    O = (0, 0, 0)

    for side, s in (('L', 1), ('R', -1)):
        # 目: 黒いたまご形 + 白いハイライト
        face_part(f'eye{side}', head, O, HEAD_R, s * 0.42, 0.16, (0.036, 0.046, 0.02), 'black', 0.3,
                  Matrix.Rotation(0, 4, 'Z'))
        face_part(f'eyeHi{side}', head, O, (HEAD_R[0] + 0.016, HEAD_R[1] + 0.016, HEAD_R[2] + 0.016), s * 0.39, 0.22,
                  (0.017, 0.017, 0.01), 'white', 0.1)
        # ほっぺ
        face_part(f'cheek{side}', head, O, HEAD_R, s * 1.0, -0.18, (0.055, 0.052, 0.018), 'red', 0.45)
    face_part('nose', head, O, HEAD_R, 0, 0.04, (0.012, 0.009, 0.008), 'black', 0.3)
    # 口: 小さく開いた笑顔（濃い赤 + 舌）
    face_part('mouth', head, O, HEAD_R, 0, -0.2, (0.055, 0.04, 0.012), 'mouth', 0.55)
    face_part('tongue', head, O, (HEAD_R[0] + 0.004, HEAD_R[1] + 0.004, HEAD_R[2] + 0.004), 0, -0.28,
              (0.035, 0.016, 0.008), 'tongue', 0.6)

    # 耳: 細長い葉っぱ形。先の1/3が黒。付け根が原点
    for side, s in (('L', 1), ('R', -1)):
        L = 0.4
        bm = ellipsoid((0.085, 0.032, L / 2), 20, 14)
        for v in bm.verts:
            u = (v.co.z + L / 2) / L  # 0=付け根 1=先
            w = 1.1 * math.sin(math.pi * min(1, u * 0.92 + 0.08)) ** 0.6 * (1 - 0.25 * u)
            v.co.x *= w
            v.co.y *= w
            v.co.z += L / 2
        for f in bm.faces:
            if f.calc_center_median().z > L * 0.66:
                f.material_index = 1
        ear = new_obj(f'ear{side}', bm, ['yellow', 'black'], head, (s * 0.13, 0.02, 0.12))
        ear.rotation_euler = Euler((0.15, s * 0.6, 0), 'XYZ')  # Y軸まわりで外側へ傾ける

    # 腕: 肩が原点。前に少し出した短い腕
    for side, s in (('L', 1), ('R', -1)):
        bm = ellipsoid((0.045, 0.045, 0.085), 16, 10, Matrix.Translation((0, 0, -0.07)))
        arm = new_obj(f'arm{side}', bm, ['yellow'], body, (s * 0.13, -0.06, 0.09))
        arm.rotation_euler = Euler((0.9, 0, s * 0.35), 'XYZ')

    # 足: 平たい楕円
    for side, s in (('L', 1), ('R', -1)):
        bm = ellipsoid((0.065, 0.095, 0.04), 18, 10)
        new_obj(f'foot{side}', bm, ['yellow'], body, (s * 0.1, -0.05, -0.18))

    # しっぽ: いなずま形の板。付け根（茶色）が原点
    pts = [(0.0, 0.0), (0.09, 0.0), (0.09, 0.09), (0.2, 0.07), (0.2, 0.21), (0.33, 0.18), (0.4, 0.44),
           (0.17, 0.5), (0.16, 0.33), (0.07, 0.35), (0.07, 0.2), (0.0, 0.21)]
    bm = bmesh.new()
    T = 0.035
    front = [bm.verts.new((-T / 2, y, z)) for y, z in pts]
    back = [bm.verts.new((T / 2, y, z)) for y, z in pts]
    bm.faces.new(front)
    bm.faces.new(list(reversed(back)))
    n = len(pts)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((front[i], front[j], back[j], back[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for f in bm.faces:
        if f.calc_center_median().z < 0.1 and f.calc_center_median().y < 0.1:
            f.material_index = 1
    tail = new_obj('tail', bm, ['yellow', 'brown'], body, (0, 0.13, -0.12), smooth=False)
    tail.rotation_euler = Euler((-0.25, 0, 0), 'XYZ')

    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, 'pikachu.glb')
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', export_yup=True, export_apply=True,
                              export_materials='EXPORT', export_normals=True, export_texcoords=False,
                              export_cameras=False, export_lights=False)
    print(f'pikachu: {os.path.getsize(path) // 1024} KB')


if __name__ == '__main__':
    build()
