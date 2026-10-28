"""
ピカげんき 全マップ生成スクリプト（Blender / bpy）

使い方:
  node scripts/export-maps-json.mjs           # src/maps/data.js → tools/blender/maps.json
  python3 tools/blender/build_maps.py [map ...] # public/maps/<id>.glb と <id>.json を出力
  （Blender 本体なら: blender -b -P tools/blender/build_maps.py -- [map ...]）

方針:
  - 歩ける範囲（data.js の size）は平ら(y=0)。外側は丘・海・崖などで自然に囲む。
  - 背景物はマテリアルごとに1メッシュへまとめる（スマホでの描画負荷を下げる）。
  - 歩ける範囲内の木や岩の当たり判定は <id>.json の colliders [[x, z, r], ...] に書き出す。
  - 座標: ゲーム (x, z) ⇔ Blender (x, -z)。glTF 書き出しで Y-up に変換される。
  - オリジナルデザイン。原作のデータやモデルは使っていない。
"""
import bpy
import bmesh
import json
import math
import os
import random
import sys
from mathutils import Matrix, Vector, Euler, noise

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, '..', '..', 'public', 'maps'))
MAPS = json.load(open(os.path.join(HERE, 'maps.json'), encoding='utf-8'))
SEA_LEVEL = -0.05


# ───────────────────────── 色・マテリアル ─────────────────────────
def lin(hexstr):
    """sRGB の #rrggbb → リニア RGB"""
    h = hexstr.lstrip('#')
    out = []
    for i in (0, 2, 4):
        c = int(h[i:i + 2], 16) / 255
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return out


def mix(a, b, t):
    return [a[i] + (b[i] - a[i]) * t for i in range(3)]


PALETTE = {
    'trunk': '#7a4b25', 'trunkDark': '#5a3b1c', 'leaf1': '#3f8f3a', 'leaf2': '#4fa346', 'leaf3': '#2f7a35',
    'autumn1': '#e8742a', 'autumn2': '#d94a2b', 'autumn3': '#f2b134', 'pine1': '#1f5a3a', 'pine2': '#24693f',
    'palmLeaf': '#3fa34a', 'palmTrunk': '#a87a45', 'rock': '#8c8c8c', 'rockDark': '#6d6d72', 'moss': '#5c8a3f',
    'bush': '#4a9a3f', 'bush2': '#5cb34d', 'grass': '#5f9e3a', 'reed': '#7b9a3a', 'lily': '#3e9a4a',
    'petalPink': '#ff9ad5', 'petalYellow': '#fff36b', 'petalWhite': '#ffffff', 'petalRed': '#ff6b6b', 'petalPurple': '#a98bff',
    'flowerCenter': '#ffd23f', 'stem': '#3f8f3a', 'mushCap': '#d94a2b', 'mushStem': '#f5ead2',
    'wood': '#a87a45', 'woodDark': '#7a5230', 'plank': '#c9955a', 'fence': '#fff4e0', 'wallCream': '#fff4e0',
    'roofRed': '#c0392b', 'roofBlue': '#3a6fb0', 'window': '#bfe8ff', 'door': '#8a5a2b', 'stone': '#b9b2a6',
    'concrete': '#b8b8b0', 'tire': '#2a2a2a', 'metal': '#9aa3ab', 'cloth': '#ff8c42', 'clothBlue': '#4a7bd0',
    'water': '#3d9be0', 'sea': '#2f8fd8', 'mountain': '#7d98b8', 'mountainSnow': '#eef3f8', 'sand': '#f2dc9b',
    'floor': '#d9b382', 'rug': '#e88a8a', 'ceiling': '#fbf6ea', 'lamp': '#fff3c4', 'shipWood': '#6b4423',
    'sail': '#f3efe3', 'lighthouse': '#ffffff', 'lighthouseRed': '#e8432f', 'lantern': '#ffcf6b', 'mill': '#e8dcc8',
}
EMISSIVE = {'window', 'lamp', 'lantern'}


class Builder:
    """マテリアルごとに bmesh を1つ持ち、プリミティブを追記していく"""

    def __init__(self):
        self.bms = {}
        self.colliders = []

    def bm(self, mat):
        if mat not in self.bms:
            self.bms[mat] = bmesh.new()
        return self.bms[mat]

    # 生成系（matrix はゲーム座標ではなく Blender 座標）
    def cone(self, mat, m, r1, r2, depth, seg=8):
        return bmesh.ops.create_cone(self.bm(mat), cap_ends=True, cap_tris=False, segments=seg,
                                     radius1=r1, radius2=r2, depth=depth, matrix=m)['verts']

    def ico(self, mat, m, r, sub=1):
        return bmesh.ops.create_icosphere(self.bm(mat), subdivisions=sub, radius=r, matrix=m)['verts']

    def cube(self, mat, m):
        return bmesh.ops.create_cube(self.bm(mat), size=1.0, matrix=m)['verts']

    def sphere(self, mat, m, r, u=10, v=6):
        return bmesh.ops.create_uvsphere(self.bm(mat), u_segments=u, v_segments=v, radius=r, matrix=m)['verts']

    def disc(self, mat, m, r, seg=24):
        return bmesh.ops.create_circle(self.bm(mat), cap_ends=True, segments=seg, radius=r, matrix=m)['verts']

    def collide(self, x, z, r):
        self.colliders.append([round(x, 2), round(z, 2), round(r, 2)])


def M(x, zg, h=0.0, s=(1, 1, 1), rz=0.0, rx=0.0, ry=0.0):
    """ゲーム座標 (x, zg) 高さ h の変換行列。rz はゲームでの Y 回転（Blender の Z 回転）"""
    if not isinstance(s, (tuple, list)):
        s = (s, s, s)
    return (Matrix.Translation((x, -zg, h)) @ Euler((rx, ry, rz), 'XYZ').to_matrix().to_4x4()
            @ Matrix.Diagonal((s[0], s[1], s[2], 1)))


def box(b, mat, x, zg, h, w, d, ht, rz=0.0):
    """底面中心 (x, zg, h)、幅 w(x) 奥行 d(z) 高さ ht の箱"""
    b.cube(mat, M(x, zg, h + ht / 2, (w, d, ht), rz))


def make_material(name):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes.get('Principled BSDF')
    bsdf.inputs['Roughness'].default_value = 1.0
    bsdf.inputs['Metallic'].default_value = 0.0
    if name == 'terrain':
        ca = nt.nodes.new('ShaderNodeVertexColor')
        ca.layer_name = 'Col'
        nt.links.new(ca.outputs['Color'], bsdf.inputs['Base Color'])
    else:
        c = lin(PALETTE[name]) + [1.0]
        bsdf.inputs['Base Color'].default_value = c
        if name in EMISSIVE:
            bsdf.inputs['Emission Color'].default_value = c
            bsdf.inputs['Emission Strength'].default_value = 0.6
    return m


def finalize(b, map_id):
    for mat, bm in b.bms.items():
        mesh = bpy.data.meshes.new(f'{map_id}_{mat}')
        bm.to_mesh(mesh)
        bm.free()
        obj = bpy.data.objects.new(f'{mat}', mesh)
        obj.data.materials.append(make_material(mat))
        bpy.context.scene.collection.objects.link(obj)


# ───────────────────────── 地形 ─────────────────────────
def rect_sdf(x, zg, sx, sz):
    """長方形の外側への距離（内側は負）"""
    dx = abs(x) - sx
    dz = abs(zg) - sz
    out = math.hypot(max(dx, 0), max(dz, 0))
    return out + min(max(dx, dz), 0)


def smoothstep(e0, e1, v):
    if e1 == e0:
        return 1.0 if v >= e1 else 0.0
    t = max(0.0, min(1.0, (v - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


class Terrain:
    def __init__(self, mp, style):
        self.mp = mp
        self.sx, self.sz = mp['size']
        self.style = style
        self.water = mp.get('water', [])
        self.sea = mp.get('sea')
        self.paths = []
        sp = mp['spawns']['default']
        for e in mp['exits']:
            self.paths.append(((0.0, 0.0), tuple(e['at'])))
        self.paths.append(((0.0, 0.0), tuple(sp)))

    def height(self, x, zg):
        st = self.style
        d = rect_sdf(x, zg, self.sx, self.sz)
        n = noise.noise(Vector((x * 0.08, zg * 0.08, 0.3)))
        if self.sea == 'all':
            # 島: 角を丸めて海へ下る
            dd = rect_sdf(x, zg, self.sx - 2, self.sz - 2) - 2 + n * 1.2
            if dd < 0.6:
                return 0.0
            return max(-3.0, -(dd - 0.6) * 0.35)
        if self.sea == 'north' and zg < -self.sz:
            return max(-3.0, -(-self.sz - zg) * 0.3 + n * 0.1)
        h = 0.0
        if d > 0.8:
            t = smoothstep(0.8, st['hillRamp'], d)
            h = t * st['hillHeight'] * (0.75 + 0.5 * (noise.noise(Vector((x * 0.05, zg * 0.05, 7.0))) + 0.5))
            h += t * n * st['hillNoise']
        for w in self.water:
            wx, wz = w['at']
            r = w['r']
            dist = math.hypot(x - wx, zg - wz)
            if dist < r + 0.4:
                k = max(0.0, 1 - (dist / (r + 0.4)) ** 2)
                h = min(h, -1.0 * k - 0.0)
        return h

    def path_dist(self, x, zg):
        best = 1e9
        for (ax, az), (bx, bz) in self.paths:
            vx, vz = bx - ax, bz - az
            l2 = vx * vx + vz * vz or 1
            t = max(0, min(1, ((x - ax) * vx + (zg - az) * vz) / l2))
            best = min(best, math.hypot(x - (ax + vx * t), zg - (az + vz * t)))
        return best

    def color(self, x, zg, h):
        st = self.style
        base = lin(self.mp['ground'])
        outer = lin(self.mp.get('outer', self.mp['ground']))
        n = noise.noise(Vector((x * 0.25, zg * 0.25, 1.7)))
        d = rect_sdf(x, zg, self.sx, self.sz)
        c = mix(base, outer, smoothstep(0.5, 6, d)) if not self.sea else base
        if h > 0.5:
            c = mix(c, lin(st.get('hillTop', self.mp.get('outer', self.mp['ground']))), smoothstep(0.5, st['hillHeight'], h) * 0.6)
        if st.get('paths') and d < 0 and self.path_dist(x, zg) < 0.9 + n * 0.3:
            c = mix(c, lin(st['paths']), 0.75)
        for w in self.water:
            dist = math.hypot(x - w['at'][0], zg - w['at'][1])
            if dist < w['r'] + 1.2:
                c = mix(c, lin('#d8c48a'), smoothstep(w['r'] + 1.2, w['r'] + 0.3, dist))
        if self.sea and h < 0.05:
            c = mix(c, lin('#e6cf8a'), smoothstep(0.05, -0.6, h))
        k = 1 + n * 0.12
        return [max(0, min(1, v * k)) for v in c]

    def build(self, ext):
        step = 1.0 if ext < 45 else 1.5
        nx = int(ext * 2 / step) + 1
        bm = bmesh.new()
        col = bm.loops.layers.color.new('Col')
        verts = []
        for j in range(nx):
            row = []
            for i in range(nx):
                x = -ext + i * step
                zg = -ext + j * step
                h = self.height(x, zg)
                row.append(bm.verts.new((x, -zg, h)))
            verts.append(row)
        for j in range(nx - 1):
            for i in range(nx - 1):
                # 上向きの面になるよう反時計回り（Blender 座標で y = -z なので行の順を逆に）
                f = bm.faces.new((verts[j][i], verts[j + 1][i], verts[j + 1][i + 1], verts[j][i + 1]))
                for loop in f.loops:
                    v = loop.vert.co
                    loop[col] = self.color(v.x, -v.y, v.z) + [1.0]
        mesh = bpy.data.meshes.new('terrain')
        bm.to_mesh(mesh)
        bm.free()
        obj = bpy.data.objects.new('terrain', mesh)
        obj.data.materials.append(make_material('terrain'))
        bpy.context.scene.collection.objects.link(obj)


# ───────────────────────── 背景オブジェクト ─────────────────────────
def tree(b, x, zg, s, rnd, h=0.0, leaves=('leaf1', 'leaf2', 'leaf3'), trunk='trunk'):
    b.cone(trunk, M(x, zg, h + 0.8 * s), 0.22 * s, 0.15 * s, 1.6 * s, 6)
    lm = leaves[int(rnd.random() * len(leaves))]
    v = b.ico(lm, M(x, zg, h + 2.3 * s, (1, 1, 0.85), rz=rnd.random() * 6), 1.15 * s, 1)
    for p in v:
        p.co += Vector(((rnd.random() - 0.5) * 0.25 * s, (rnd.random() - 0.5) * 0.25 * s, (rnd.random() - 0.5) * 0.2 * s))
    if rnd.random() < 0.6:
        b.ico(leaves[int(rnd.random() * len(leaves))], M(x + 0.35 * s, zg + 0.2 * s, h + 2.95 * s), 0.7 * s, 1)
    return 0.55 * s


def pine(b, x, zg, s, rnd, h=0.0):
    b.cone('trunkDark', M(x, zg, h + 0.5 * s), 0.18 * s, 0.13 * s, 1.0 * s, 6)
    b.cone('pine1', M(x, zg, h + 1.6 * s, rz=rnd.random()), 1.15 * s, 0.0, 1.8 * s, 7)
    b.cone('pine2', M(x, zg, h + 2.5 * s, rz=rnd.random()), 0.85 * s, 0.0, 1.5 * s, 7)
    b.cone('pine1', M(x, zg, h + 3.3 * s, rz=rnd.random()), 0.55 * s, 0.0, 1.1 * s, 7)
    return 0.5 * s


def palm(b, x, zg, s, rnd, h=0.0):
    lean = (rnd.random() - 0.5) * 0.5
    top = Vector((x + lean * 1.4 * s, zg, h + 3.1 * s))
    segs = 5
    for i in range(segs):
        t0 = i / segs
        cx = x + lean * 1.4 * s * t0 * t0
        b.cone('palmTrunk', M(cx, zg, h + (t0 + 0.5 / segs) * 3.1 * s, rx=0, ry=lean * 0.5 * t0), 0.2 * s * (1 - t0 * 0.3), 0.17 * s, 3.1 * s / segs + 0.05, 6)
    for i in range(7):
        a = i / 7 * math.tau + rnd.random() * 0.3
        b.cube('palmLeaf', M(top.x + math.cos(a) * 0.9 * s, zg + math.sin(a) * 0.9 * s, top.z - 0.25 * s,
                             (1.9 * s, 0.45 * s, 0.05), rz=-a, ry=0.35))
    b.ico('trunkDark', M(top.x, zg, top.z - 0.15 * s), 0.25 * s, 1)
    return 0.35 * s


def rock(b, x, zg, s, rnd, h=0.0, mat='rock'):
    v = b.ico(mat if rnd.random() < 0.7 else 'rockDark', M(x, zg, h + 0.25 * s, (1.2, 1.0, 0.7), rz=rnd.random() * 6), 0.65 * s, 1)
    for p in v:
        p.co += Vector(((rnd.random() - 0.5) * 0.3 * s, (rnd.random() - 0.5) * 0.3 * s, (rnd.random() - 0.5) * 0.2 * s))
    return 0.6 * s


def bush(b, x, zg, s, rnd, h=0.0):
    for i in range(3):
        a = rnd.random() * math.tau
        b.ico('bush' if i % 2 else 'bush2', M(x + math.cos(a) * 0.35 * s, zg + math.sin(a) * 0.35 * s, h + 0.35 * s, (1, 1, 0.8)), (0.55 - i * 0.08) * s, 1)
    return 0.6 * s


def flower(b, x, zg, s, rnd, h=0.0):
    petal = ['petalPink', 'petalYellow', 'petalWhite', 'petalRed', 'petalPurple'][int(rnd.random() * 5)]
    for i in range(int(2 + rnd.random() * 3)):
        fx = x + (rnd.random() - 0.5) * 0.7
        fz = zg + (rnd.random() - 0.5) * 0.7
        b.cone('stem', M(fx, fz, h + 0.17), 0.02, 0.02, 0.35, 4)
        b.cone(petal, M(fx, fz, h + 0.38), 0.13, 0.08, 0.06, 6)
        b.cone('flowerCenter', M(fx, fz, h + 0.42), 0.04, 0.03, 0.03, 5)
    return 0.0


def grass(b, x, zg, s, rnd, h=0.0, mat='grass'):
    for i in range(6):
        a = rnd.random() * math.tau
        b.cone(mat, M(x + math.cos(a) * 0.2, zg + math.sin(a) * 0.2, h + 0.3 * s, rx=(rnd.random() - 0.5) * 0.5, ry=(rnd.random() - 0.5) * 0.5), 0.07 * s, 0.0, 0.6 * s, 3)
    return 0.0


def stump(b, x, zg, s, rnd, h=0.0):
    b.cone('woodDark', M(x, zg, h + 0.25 * s), 0.5 * s, 0.45 * s, 0.5 * s, 9)
    b.cone('plank', M(x, zg, h + 0.51 * s), 0.43 * s, 0.43 * s, 0.02, 9)
    return 0.5 * s


def mushroom(b, x, zg, s, rnd, h=0.0):
    for i in range(int(1 + rnd.random() * 3)):
        fx = x + (rnd.random() - 0.5) * 0.6
        fz = zg + (rnd.random() - 0.5) * 0.6
        k = 0.6 + rnd.random() * 0.6
        b.cone('mushStem', M(fx, fz, h + 0.12 * k), 0.06 * k, 0.07 * k, 0.25 * k, 6)
        b.sphere('mushCap', M(fx, fz, h + 0.25 * k, (1, 1, 0.55)), 0.18 * k, 8, 4)
    return 0.0


def log(b, x, zg, s, rnd, h=0.0):
    a = rnd.random() * math.pi
    b.cone('woodDark', M(x, zg, h + 0.3 * s, rx=math.pi / 2, rz=a), 0.3 * s, 0.3 * s, 2.4 * s, 8)
    for k in (-0.8, 0, 0.8):
        b.collide(x + math.sin(a) * k * s, zg + math.cos(a) * k * s, 0.4 * s)
    return 0.0


SCATTER = {'tree': tree, 'pine': pine, 'palm': palm, 'rock': rock, 'bush': bush, 'flower': flower,
           'stump': stump, 'grass': grass, 'mushroom': mushroom, 'log': log}


def autumn_tree(b, x, zg, s, rnd, h=0.0):
    return tree(b, x, zg, s, rnd, h, leaves=('autumn1', 'autumn2', 'autumn3', 'leaf2'))


SCATTER['autumnTree'] = autumn_tree


def clear_zones(mp):
    z = [(e['at'][0], e['at'][1], 3.0) for e in mp['exits']]
    z += [(p[0], p[1], 2.5) for p in mp['spawns'].values()]
    z += [(p[0], p[1], 3.0) for p in (mp.get('points') or {}).values()]
    z += [(w['at'][0], w['at'][1], w['r'] + 1.5) for w in mp.get('water', [])]
    # 出口からマップ中心への道は空けておく
    for e in mp['exits']:
        ex, ez = e['at']
        for t in (0.25, 0.5, 0.75):
            z.append((ex * (1 - t), ez * (1 - t), 2.0))
    return z


def scatter_inside(b, mp, kind, n, seed, extra_clear=(), smin=0.8, smax=1.3, margin=1.0):
    rnd = random.Random(seed)
    sx, sz = mp['size']
    zones = clear_zones(mp) + list(extra_clear)
    fn = SCATTER[kind]
    placed = 0
    tries = 0
    while placed < n and tries < n * 30:
        tries += 1
        x = (rnd.random() * 2 - 1) * (sx - margin)
        zg = (rnd.random() * 2 - 1) * (sz - margin)
        if any(math.hypot(x - cx, zg - cz) < cr for cx, cz, cr in zones):
            continue
        if mp.get('sea') == 'north' and zg < -sz + 2:
            continue
        s = smin + rnd.random() * (smax - smin)
        r = fn(b, x, zg, s, rnd)
        if r:
            b.collide(x, zg, r)
        placed += 1


def scatter_ring(b, terrain, kind, n, seed, dmin=1.5, dmax=22, smin=0.9, smax=1.6, skip_sea=True):
    """歩ける範囲の外（丘の上）に背景として並べる。当たり判定なし"""
    rnd = random.Random(seed)
    sx, sz = terrain.sx, terrain.sz
    fn = SCATTER[kind]
    placed = 0
    tries = 0
    while placed < n and tries < n * 30:
        tries += 1
        x = (rnd.random() * 2 - 1) * (sx + dmax)
        zg = (rnd.random() * 2 - 1) * (sz + dmax)
        d = rect_sdf(x, zg, sx, sz)
        if d < dmin or d > dmax:
            continue
        h = terrain.height(x, zg)
        if skip_sea and h < 0.1:
            continue
        fn(b, x, zg, smin + rnd.random() * (smax - smin), rnd, h - 0.1)
        placed += 1


def far_mountains(b, seed, radius=95, n=16, snow=False, mat='mountain'):
    rnd = random.Random(seed)
    for i in range(n):
        a = i / n * math.tau + rnd.random() * 0.3
        r = radius + rnd.random() * 25
        hgt = 14 + rnd.random() * 22
        w = 14 + rnd.random() * 14
        x, zg = math.cos(a) * r, math.sin(a) * r
        b.cone(mat, M(x, zg, hgt / 2 - 2, rz=rnd.random()), w, 0.0, hgt, 7)
        if snow:
            b.cone('mountainSnow', M(x, zg, hgt - 2 - hgt * 0.12, rz=rnd.random()), w * 0.25, 0.0, hgt * 0.25, 7)


def sea_plane(b, size=500):
    b.cube('sea', M(0, 0, SEA_LEVEL - 0.05, (size, size, 0.1)))


def water_discs(b, mp):
    for w in mp.get('water', []):
        b.disc('water', M(w['at'][0], w['at'][1], SEA_LEVEL), w['r'] + 0.2, 32)


def fence_ring(b, mp, mat='fence', step=1.0, gap=2.2):
    sx, sz = mp['size']
    pts = []
    x = -sx
    while x <= sx + 1e-6:
        pts += [(x, -sz), (x, sz)]
        x += step
    z = -sz + step
    while z < sz:
        pts += [(-sx, z), (sx, z)]
        z += step
    exits = [e['at'] for e in mp['exits']]
    for px, pz in pts:
        if any(math.hypot(ex - px, ez - pz) < gap for ex, ez in exits):
            continue
        box(b, mat, px, pz, 0, 0.14, 0.14, 0.95)
    # 横板
    for side in ('n', 's', 'w', 'e'):
        if side in ('n', 's'):
            zz = -sz if side == 'n' else sz
            xs = [-sx + i * step for i in range(int(2 * sx / step) + 1)]
            for i in range(len(xs) - 1):
                mx = (xs[i] + xs[i + 1]) / 2
                if any(math.hypot(ex - mx, ez - zz) < gap for ex, ez in exits):
                    continue
                for hh in (0.35, 0.75):
                    box(b, mat, mx, zz, hh, step, 0.06, 0.1)
        else:
            xx = -sx if side == 'w' else sx
            zs = [-sz + i * step for i in range(int(2 * sz / step) + 1)]
            for i in range(len(zs) - 1):
                mz = (zs[i] + zs[i + 1]) / 2
                if any(math.hypot(ex - xx, ez - mz) < gap for ex, ez in exits):
                    continue
                for hh in (0.35, 0.75):
                    box(b, mat, xx, mz, hh, 0.06, step, 0.1)


def house(b, x, zg, w=10, d=4, ht=4, roof='roofRed', face=1):
    """face=1 なら +z（手前）向きの家"""
    box(b, 'wallCream', x, zg, 0, w, d, ht)
    # 切妻屋根（2枚の板）
    for sgn in (-1, 1):
        b.cube(roof, M(x, zg + sgn * d * 0.27, ht + 0.75, (w + 0.6, d * 0.62, 0.18), rx=sgn * 0.62))
    b.cube('wallCream', M(x, zg, ht + 0.35, (w, 0.05, 0.7)))
    fz = zg + face * (d / 2 + 0.03)
    box(b, 'door', x, fz, 0, 1.3, 0.08, 2.2)
    for wx in (-w * 0.3, w * 0.3):
        box(b, 'window', x + wx, fz, 1.4, 1.3, 0.08, 1.0)
        box(b, 'woodDark', x + wx, fz + face * 0.03, 1.32, 1.5, 0.06, 0.08)


def stone_path(b, pts, seed, width=1.0):
    rnd = random.Random(seed)
    for (ax, az), (bx, bz) in zip(pts, pts[1:]):
        L = math.hypot(bx - ax, bz - az)
        n = int(L / 0.9)
        for i in range(n):
            t = (i + 0.5) / n
            x = ax + (bx - ax) * t + (rnd.random() - 0.5) * 0.25 * width
            zg = az + (bz - az) * t + (rnd.random() - 0.5) * 0.25 * width
            b.cone('stone', M(x, zg, 0.02, rz=rnd.random() * 6), 0.38 * width, 0.36 * width, 0.05, 7)


# ───────────────────────── マップ別 ─────────────────────────
STYLE_DEFAULT = {'hillHeight': 5.0, 'hillRamp': 12.0, 'hillNoise': 1.2}


def build_room(b, mp):
    sx, sz = mp['size']
    H = 3.0
    box(b, 'floor', 0, 0, -0.1, sx * 2 + 1, sz * 2 + 1, 0.1)
    # 壁（北の壁にガラス戸、東西に窓）
    for x0, x1 in ((-sx - 0.5, -1.0), (1.0, sx + 0.5)):
        box(b, 'wallCream', (x0 + x1) / 2, -sz - 0.2, 0, x1 - x0, 0.4, H)
    box(b, 'wallCream', 0, -sz - 0.2, 2.5, 2.0, 0.4, H - 2.5)
    box(b, 'wallCream', 0, sz + 0.2, 0, sx * 2 + 1, 0.4, H)
    for sgn in (-1, 1):
        box(b, 'wallCream', sgn * (sx + 0.2), 0, 0, 0.4, sz * 2 + 0.8, H)
        box(b, 'window', sgn * (sx - 0.02), 0.5, 1.1, 0.05, 2.0, 1.2)
        box(b, 'woodDark', sgn * (sx - 0.04), 0.5, 1.0, 0.06, 2.3, 0.1)
        for cz in (-0.75, 1.75):
            box(b, 'clothBlue', sgn * (sx - 0.1), cz, 0.9, 0.06, 0.4, 1.6)
    # ガラス戸（ゲームの出口マーカーと重なる位置）
    box(b, 'woodDark', 0, -sz - 0.02, 2.4, 2.1, 0.1, 0.12)
    box(b, 'woodDark', -1.0, -sz - 0.02, 0, 0.1, 0.1, 2.5)
    box(b, 'woodDark', 1.0, -sz - 0.02, 0, 0.1, 0.1, 2.5)
    # 天井・照明・幅木
    box(b, 'ceiling', 0, 0, H, sx * 2 + 1, sz * 2 + 1, 0.1)
    b.cone('lamp', M(0, 0.5, H - 0.25), 0.5, 0.25, 0.3, 12)
    box(b, 'woodDark', 0, sz - 0.02, 0, sx * 2, 0.06, 0.12)
    box(b, 'woodDark', -sx + 0.02, 0, 0, 0.06, sz * 2, 0.12)
    box(b, 'woodDark', sx - 0.02, 0, 0, 0.06, sz * 2, 0.12)
    # ラグ・観葉植物・ポスター・机の椅子
    b.disc('rug', M(0, 0.5, 0.01), 2.2, 28)
    b.cone('woodDark', M(-5.2, 4.2, 0.25), 0.3, 0.25, 0.5, 8)
    b.ico('leaf2', M(-5.2, 4.2, 0.95), 0.55, 1)
    b.collide(-5.2, 4.2, 0.45)
    box(b, 'petalYellow', 1.8, -sz + 0.01, 1.2, 1.0, 0.04, 1.3)
    box(b, 'clothBlue', 2.0, -sz + 0.02, 1.4, 0.5, 0.04, 0.6)
    box(b, 'woodDark', -4.2, -2.8, 0, 0.6, 0.6, 0.5)
    b.collide(-4.2, -2.8, 0.4)
    # ドア（南の壁）
    box(b, 'door', 3.5, sz + 0.0, 0, 1.1, 0.08, 2.2)


def build_garden(b, mp, t):
    house(b, 0, -15.5, 12, 5, 4.2)
    fence_ring(b, mp)
    water_discs(b, mp)
    stone_path(b, [(0, -12.6), (0, -6), (0, 11.5)], 5)
    stone_path(b, [(0, 0), (-13.5, 0)], 6)
    # 池のまわりの石
    rnd = random.Random(9)
    for w in mp['water']:
        for i in range(14):
            a = i / 14 * math.tau
            rock(b, w['at'][0] + math.cos(a) * (w['r'] + 0.5), w['at'][1] + math.sin(a) * (w['r'] + 0.5), 0.5, rnd)
    # ポスト・植木
    box(b, 'roofRed', 2.2, 11.0, 0.9, 0.5, 0.35, 0.4)
    box(b, 'woodDark', 2.2, 11.0, 0, 0.1, 0.1, 0.9)
    b.collide(2.2, 11.0, 0.3)
    for x, zg in ((11, -9), (-11, 9), (11, 9), (-10.5, -9.5)):
        tree(b, x, zg, 1.1, rnd)
        b.collide(x, zg, 0.6)
    for x in (-9, -7, 7, 9):
        bush(b, x, -11.2, 0.8, rnd)
    # 外: 近所の家と丘
    for i, (x, zg, roof) in enumerate(((-22, -20, 'roofBlue'), (20, -21, 'roofRed'), (-26, 6, 'roofRed'), (25, 10, 'roofBlue'), (-8, 26, 'roofBlue'), (12, 27, 'roofRed'))):
        house(b, x, zg, 8, 5, 3.5, roof, face=1 if zg < 0 else -1)
    scatter_ring(b, t, 'tree', 70, 101, dmin=6, dmax=30)
    far_mountains(b, 102)


def build_forest(b, mp, t, autumn=False):
    kind = 'autumnTree' if autumn else 'tree'
    scatter_ring(b, t, kind, 260, 201, dmin=0.6, dmax=26)
    scatter_ring(b, t, 'bush', 50, 202, dmin=0.6, dmax=6)
    far_mountains(b, 203, snow=not autumn)


def build_tokiwa(b, mp, t):
    build_forest(b, mp, t)
    scatter_inside(b, mp, 'tree', 48, 211)
    scatter_inside(b, mp, 'bush', 18, 212)
    scatter_inside(b, mp, 'flower', 22, 213)
    scatter_inside(b, mp, 'mushroom', 14, 214)
    scatter_inside(b, mp, 'log', 4, 215)
    # キャタピーの巣: 大きなご神木と花の輪
    nx, nz = mp['points']['nest']
    rnd = random.Random(216)
    tree(b, nx, nz - 4.5, 2.2, rnd, leaves=('leaf3',))
    b.collide(nx, nz - 4.5, 1.2)
    for i in range(10):
        a = i / 10 * math.tau
        flower(b, nx + math.cos(a) * 2.6, nz + math.sin(a) * 2.6, 1, rnd)


def build_akane_forest(b, mp, t):
    build_forest(b, mp, t, autumn=True)
    scatter_inside(b, mp, 'autumnTree', 40, 221)
    scatter_inside(b, mp, 'stump', 8, 222)
    scatter_inside(b, mp, 'mushroom', 16, 223)
    scatter_inside(b, mp, 'bush', 12, 224)
    # コイルの台所: 石のかまど
    cx, cz = mp['points']['coil']
    rnd = random.Random(225)
    for i in range(8):
        a = i / 8 * math.tau
        rock(b, cx + 2.2 + math.cos(a) * 0.7, cz + math.sin(a) * 0.7, 0.35, rnd)
    b.cone('metal', M(cx + 2.2, cz, 0.45), 0.45, 0.4, 0.6, 12)
    b.collide(cx + 2.2, cz, 0.9)


def build_tsuriba(b, mp, t, autumn=False):
    leaves = 'autumnTree' if autumn else 'tree'
    scatter_ring(b, t, leaves, 140, 231, dmin=0.6, dmax=24)
    scatter_inside(b, mp, leaves, 14, 232)
    scatter_inside(b, mp, 'rock', 8, 233)
    water_discs(b, mp)
    rnd = random.Random(234)
    for w in mp['water']:
        for i in range(26):
            a = rnd.random() * math.tau
            r = w['r'] + (rnd.random() - 0.3) * 0.8
            grass(b, w['at'][0] + math.cos(a) * r, w['at'][1] + math.sin(a) * r, 1.5, rnd, mat='reed')
        for i in range(12):
            a = rnd.random() * math.tau
            r = rnd.random() * w['r'] * 0.8
            b.disc('lily', M(w['at'][0] + math.cos(a) * r, w['at'][1] + math.sin(a) * r, SEA_LEVEL + 0.02), 0.35, 8)
    far_mountains(b, 235, snow=True)


def build_lake(b, mp, t):
    scatter_ring(b, t, 'tree', 150, 241, dmin=1, dmax=24)
    scatter_inside(b, mp, 'tree', 24, 242)
    scatter_inside(b, mp, 'rock', 10, 243)
    scatter_inside(b, mp, 'flower', 20, 244)
    water_discs(b, mp)
    w = mp['water'][0]
    rnd = random.Random(245)
    rock(b, w['at'][0] + 1.5, w['at'][1] - 1, 1.6, rnd)
    for i in range(30):
        a = rnd.random() * math.tau
        grass(b, w['at'][0] + math.cos(a) * (w['r'] + 0.3), w['at'][1] + math.sin(a) * (w['r'] + 0.3), 1.4, rnd, mat='reed')
    # ニョロゾたちの家: 滝の流れる岩場
    hx, hz = mp['points']['home']
    for i in range(9):
        rock(b, hx - 5 + i * 1.25, hz - 3.5 - (i % 2) * 0.4, 1.6 + (i % 3) * 0.4, rnd)
    box(b, 'water', hx, hz - 4.2, 0, 2.2, 0.15, 3.6)
    b.disc('water', M(hx, hz - 2.6, SEA_LEVEL + 0.04), 1.6, 20)
    far_mountains(b, 246, snow=True)


def build_moegi(b, mp, t):
    st = t.style
    scatter_ring(b, t, 'tree', 50, 251, dmin=3, dmax=28)
    scatter_ring(b, t, 'flower', 120, 252, dmin=0.5, dmax=10)
    scatter_inside(b, mp, 'tree', 10, 253, smin=1.2, smax=1.6)
    scatter_inside(b, mp, 'flower', 60, 254)
    # 遠くの風車
    x, zg = -12, -34
    h0 = t.height(x, zg)
    b.cone('mill', M(x, zg, h0 + 3.5), 1.6, 1.0, 7, 8)
    b.cone('roofRed', M(x, zg, h0 + 7.6), 1.3, 0.0, 1.4, 8)
    for i in range(4):
        a = i * math.pi / 2 + 0.4
        b.cube('sail', M(x + math.cos(a) * 1.9, zg + 1.1, h0 + 6.2 + math.sin(a) * 1.9, (3.4, 0.08, 0.7), ry=-a))
    far_mountains(b, 255, snow=True)


def build_beach(b, mp, t):
    sea_plane(b)
    scatter_inside(b, mp, 'palm', 9, 261, smin=0.9, smax=1.2)
    scatter_inside(b, mp, 'rock', 6, 262)
    scatter_ring(b, t, 'palm', 40, 263, dmin=1, dmax=18)
    scatter_ring(b, t, 'tree', 50, 264, dmin=6, dmax=24)
    rnd = random.Random(265)
    # 桟橋（ふね乗り場）
    for e in mp['exits']:
        if e.get('marker') == 'boat':
            ex, ez = e['at']
            box(b, 'plank', ex, ez - 3, 0.0, 1.8, 7, 0.18)
            for k in range(4):
                for sgn in (-1, 1):
                    box(b, 'woodDark', ex + sgn * 0.85, ez - 0.5 - k * 2, -1.2, 0.18, 0.18, 1.45)
    # 沖に見えるスオウじま
    ix, iz = 30, -60
    b.cone('sand', M(ix, iz, -0.5), 16, 13, 2, 16)
    b.cone('leaf3', M(ix + 2, iz, 2.5), 9, 3, 6, 10)
    for i in range(6):
        palm(b, ix - 8 + i * 3, iz + 6 + (i % 2) * 2, 1.6, rnd, 0.5)
    b.cube('rock', M(-40, -50, 1, (6, 6, 5), rz=0.5))


def build_island(b, mp, t):
    sea_plane(b)
    scatter_inside(b, mp, 'palm', 8, 271, smin=0.9, smax=1.3)
    scatter_inside(b, mp, 'rock', 6, 272)
    rnd = random.Random(273)
    # 難破した海賊船（島の北の浅瀬）
    sx, sz = 6, -17
    b.cube('shipWood', M(sx, sz, -0.2, (3.4, 9, 2.2), rz=0.35, ry=0.25))
    b.cone('shipWood', M(sx - 1.6, sz - 4.6, -0.2, (1, 1, 1), rz=0.35, rx=math.pi / 2), 1.5, 0.2, 2.5, 6)
    b.cone('woodDark', M(sx, sz, 4, ry=0.3), 0.15, 0.12, 8, 6)
    b.cube('sail', M(sx + 0.6, sz, 4.5, (0.1, 3.5, 3), rz=0.35, ry=0.3))
    b.cube('tire', M(sx + 1.1, sz, 7.6, (0.05, 1.2, 0.7), rz=0.35, ry=0.3))
    # ドクロ岩
    rock(b, -9, -10, 2.8, rnd)
    for sgn in (-1, 1):
        b.sphere('tire', M(-9 + sgn * 0.6, -8.3, 1.5), 0.35, 8, 5)
    # まわりの小島
    for i, (x, zg) in enumerate(((-40, -30), (45, 10), (-30, 45), (20, -50))):
        b.cone('sand', M(x, zg, -0.6), 7, 5, 1.4, 12)
        palm(b, x, zg, 1.3, rnd, 0.1)
    # 桟橋
    box(b, 'plank', 0, 13.5, 0.0, 1.8, 4, 0.18)


def build_sea_tsuriba(b, mp, t):
    sea_plane(b)
    scatter_inside(b, mp, 'palm', 5, 281)
    scatter_inside(b, mp, 'rock', 10, 282)
    scatter_ring(b, t, 'palm', 30, 283, dmin=1, dmax=14)
    scatter_ring(b, t, 'rock', 30, 284, dmin=0.5, dmax=10, skip_sea=False)
    # 灯台
    x, zg = 18, -14
    b.cone('rockDark', M(x, zg, -0.5), 4, 3.5, 2.5, 10)
    for i in range(4):
        b.cone('lighthouse' if i % 2 == 0 else 'lighthouseRed', M(x, zg, 1.5 + i * 2), 1.4 - i * 0.15, 1.25 - i * 0.15, 2, 12)
    b.cone('lamp', M(x, zg, 9.9), 0.8, 0.8, 1.2, 10)
    b.cone('lighthouseRed', M(x, zg, 11.1), 1.1, 0.0, 1.3, 10)


def build_camp(b, mp, t):
    scatter_ring(b, t, 'pine', 240, 291, dmin=0.6, dmax=26)
    scatter_inside(b, mp, 'pine', 30, 292)
    scatter_inside(b, mp, 'rock', 6, 293)
    fx, fz = mp['points']['fire']
    rnd = random.Random(294)
    for i in range(10):
        a = i / 10 * math.tau
        rock(b, fx + math.cos(a) * 1.0, fz + math.sin(a) * 1.0, 0.3, rnd, mat='rockDark')
    # たき火を囲む丸太のベンチ
    for i, a in enumerate((0.3, 2.0, 3.6, 5.0)):
        x, zg = fx + math.cos(a) * 3.2, fz + math.sin(a) * 3.2
        b.cone('woodDark', M(x, zg, 0.3, rx=math.pi / 2, rz=-a + math.pi / 2), 0.3, 0.3, 2.0, 8)
        b.collide(x, zg, 0.6)
    # ランタンのポール
    for x, zg in ((-6, 4), (6, 4), (6, -6), (-8, -2)):
        b.cone('woodDark', M(x, zg, 1.0), 0.07, 0.07, 2.0, 5)
        b.cube('lantern', M(x, zg, 2.05, (0.3, 0.3, 0.4)))
        b.collide(x, zg, 0.2)
    far_mountains(b, 295, mat='rockDark')


def build_akichi(b, mp, t):
    fence_ring(b, mp, mat='woodDark', step=1.2, gap=2.0)
    # 土管（空き地の定番）
    for i, (x, zg) in enumerate(((-3.6, -4.8), (-2.2, -4.8))):
        b.cone('concrete', M(x, zg, 0.65, rx=math.pi / 2), 0.65, 0.65, 2.4, 14)
    b.cone('concrete', M(-2.9, -4.8, 1.75, rx=math.pi / 2), 0.65, 0.65, 2.4, 14)
    b.collide(-2.9, -4.4, 1.0)
    b.collide(-2.9, -5.6, 1.0)
    for x, zg in ((4.8, 3.8), (5.6, 4.6)):
        b.cone('tire', M(x, zg, 0.2), 0.5, 0.5, 0.35, 12)
    b.collide(5.2, 4.2, 0.8)
    rnd = random.Random(301)
    for i in range(24):
        grass(b, (rnd.random() * 2 - 1) * 6.3, (rnd.random() * 2 - 1) * 6.3, 1.0, rnd)
    # 外: 塀と建物
    for i in range(7):
        x = -24 + i * 8
        hgt = 6 + (i % 3) * 3
        box(b, 'concrete', x, -16, 0, 7, 5, hgt)
        for k in range(int(hgt / 2.2)):
            box(b, 'window', x, -13.47, 1 + k * 2.2, 5, 0.06, 1)
    for sgn in (-1, 1):
        house(b, sgn * 16, 2, 8, 6, 3.5, 'roofBlue', face=1)
    scatter_ring(b, t, 'tree', 30, 302, dmin=4, dmax=14)


BUILDERS = {
    'room': (None, build_room),
    'garden': ({'hillHeight': 3.5, 'hillRamp': 14, 'hillNoise': 0.8, 'paths': None}, build_garden),
    'tokiwa': ({'hillHeight': 6, 'hillRamp': 10, 'hillNoise': 1.5, 'paths': '#a08a5a', 'hillTop': '#2f5d2a'}, build_tokiwa),
    'akaneForest': ({'hillHeight': 6, 'hillRamp': 10, 'hillNoise': 1.5, 'paths': '#b09060', 'hillTop': '#6d5a2c'}, build_akane_forest),
    'akaneTsuriba': ({'hillHeight': 5, 'hillRamp': 10, 'hillNoise': 1.2, 'paths': '#b09060'}, lambda b, mp, t: build_tsuriba(b, mp, t, True)),
    'asagiLake': ({'hillHeight': 7, 'hillRamp': 12, 'hillNoise': 1.5, 'paths': '#b4a070'}, build_lake),
    'asagiTsuriba': ({'hillHeight': 6, 'hillRamp': 10, 'hillNoise': 1.2, 'paths': '#b4a070'}, build_tsuriba),
    'moegi': ({'hillHeight': 3.0, 'hillRamp': 20, 'hillNoise': 2.0, 'paths': None}, build_moegi),
    'suoBeach': ({'hillHeight': 5, 'hillRamp': 12, 'hillNoise': 1.0, 'hillTop': '#6aa84f'}, build_beach),
    'suoIsland': ({'hillHeight': 0, 'hillRamp': 10, 'hillNoise': 0.5}, build_island),
    'suoTsuriba': ({'hillHeight': 4, 'hillRamp': 8, 'hillNoise': 1.5, 'hillTop': '#8c8c8c'}, build_sea_tsuriba),
    'camp': ({'hillHeight': 6, 'hillRamp': 10, 'hillNoise': 1.5, 'paths': '#6a5a3a'}, build_camp),
    'akichi': ({'hillHeight': 0.5, 'hillRamp': 10, 'hillNoise': 0.2}, build_akichi),
}


def build(map_id):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    mp = MAPS[map_id]
    style, fn = BUILDERS[map_id]
    b = Builder()
    if mp.get('indoor'):
        fn(b, mp)
    else:
        st = dict(STYLE_DEFAULT, **(style or {}))
        t = Terrain(mp, st)
        ext = max(mp['size']) + 32
        t.build(ext)
        fn(b, mp, t)
    finalize(b, map_id)
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, f'{map_id}.glb')
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', export_apply=True, export_yup=True,
                              export_materials='EXPORT', export_vertex_color='MATERIAL', export_normals=True,
                              export_texcoords=False, export_cameras=False, export_lights=False)
    with open(os.path.join(OUT, f'{map_id}.json'), 'w', encoding='utf-8') as f:
        json.dump({'colliders': b.colliders}, f)
    print(f'{map_id}: {os.path.getsize(path) // 1024} KB, colliders {len(b.colliders)}')


if __name__ == '__main__':
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
    for mid in (argv or list(BUILDERS.keys())):
        build(mid)
