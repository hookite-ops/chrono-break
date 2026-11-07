"""AI로 뽑은 영웅 GLB(Tripo·Meshy 등)를 게임 규격으로 바꾼다.

python3 ai_import.py <입력.glb> <영웅id> <출력.glb> [--noflip] [--turn 도] [--tris 14000]

- 크기: 키 1.8*H 미터, 원점은 두 발 가운데 바닥
- 방향: 게임에서 앞 = three -Z (Blender +Y). AI GLB는 보통 glTF +Z(Blender -Y)가 앞이라 180도 돌림
- 뼈: hips > chest > head, hips > hip0 > knee0, hips > hip1 > knee1 (0 = -X 쪽 다리)
  팔·무기는 chest에 붙어 같이 움직임(그림 속 자세 그대로)
- Muzzle: 상체 앞쪽 가장 멀리 나온 점(무기 끝)에 빈 노드
- 삼각형 수를 줄이고 텍스처를 1024로 줄여 웹용으로 가볍게
"""
import sys, os, math, argparse
import bpy, bmesh
from mathutils import Vector, Matrix

HEROES = {  # 영웅별 키 배율(H) — js/data.js 와 같음
    'ratchet': 1.06, 'orbit': 1.04, 'nok': 1.02, 'tick': 1.0, 'aria': 0.98,
    'phase': 0.97, 'lumen': 1.0, 'mora': 0.98, 'iko': 0.9,
}
ap = argparse.ArgumentParser()
ap.add_argument('src'); ap.add_argument('hero'); ap.add_argument('dst')
ap.add_argument('--noflip', action='store_true'); ap.add_argument('--turn', type=float, default=0)
ap.add_argument('--tris', type=int, default=14000); ap.add_argument('--tex', type=int, default=1024)
ap.add_argument('--preview', default='')
a = ap.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:])

H = HEROES[a.hero]
HEIGHT = 1.8 * H

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=a.src)
scene = bpy.context.scene

# ---------------------------------------------------------------- 1. 메시 하나로 합치기, 기존 뼈·애니 제거
meshes = [o for o in scene.objects if o.type == 'MESH']
for o in list(scene.objects):
    if o.type == 'ARMATURE':
        for m in meshes:
            for mod in list(m.modifiers):
                if mod.type == 'ARMATURE': m.modifiers.remove(mod)
bpy.context.view_layer.update()
for m in meshes:
    mw = m.matrix_world.copy()
    m.parent = None; m.matrix_world = mw
    m.data.transform(m.matrix_world); m.matrix_world = Matrix.Identity(4)
    m.vertex_groups.clear()
    if m.data.shape_keys: m.shape_key_clear()
for o in list(scene.objects):
    if o.type != 'MESH': bpy.data.objects.remove(o, do_unlink=True)
bpy.ops.object.select_all(action='DESELECT')
for m in meshes: m.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
if len(meshes) > 1: bpy.ops.object.join()
body = bpy.context.view_layer.objects.active
body.name = 'Body'

# ---------------------------------------------------------------- 2. 방향·크기·원점
rot = Matrix.Rotation(math.radians((0 if a.noflip else 180) + a.turn), 4, 'Z')
body.data.transform(rot)
vs = [v.co.copy() for v in body.data.vertices]
zmin = min(v.z for v in vs); zmax = max(v.z for v in vs)
s = HEIGHT / (zmax - zmin)
body.data.transform(Matrix.Scale(s, 4))
vs = [v.co for v in body.data.vertices]
zmin = min(v.z for v in vs)
body.data.transform(Matrix.Translation((0, 0, -zmin)))
vs = [v.co for v in body.data.vertices]

# 다리 위치: 발목 높이 점 중 몸 가운데 가까운 것만(바닥에 닿은 무기·망토 제외) → x로 두 무리
low = [v for v in vs if v.z < 0.1 * HEIGHT]
mid = [v for v in vs if 0.35 * HEIGHT < v.z < 0.55 * HEIGHT]   # 골반 높이의 가운데를 기준으로
def med(a): a = sorted(a); return a[len(a) // 2]
cx, cy = med([v.x for v in mid]), med([v.y for v in mid])
low = [v for v in low if abs(v.x - cx) < 0.16 * HEIGHT and abs(v.y - cy) < 0.2 * HEIGHT] or low
xs = sorted(v.x for v in low)
gap, split = 0, cx
for i in range(1, len(xs)):
    m = (xs[i] + xs[i - 1]) / 2
    if xs[i] - xs[i - 1] > gap and abs(m - cx) < 0.08 * HEIGHT:
        gap = xs[i] - xs[i - 1]; split = m
L = [v for v in low if v.x < split]; R = [v for v in low if v.x >= split]
legs = []
for grp, off in ((L, -0.06), (R, 0.06)):
    if len(grp) > 5: legs.append(Vector((sum(v.x for v in grp) / len(grp), sum(v.y for v in grp) / len(grp))))
    else: legs.append(Vector((cx + off * HEIGHT, cy)))
# 두 발 가운데를 원점으로
ox, oy = (legs[0].x + legs[1].x) / 2, (legs[0].y + legs[1].y) / 2
body.data.transform(Matrix.Translation((-ox, -oy, 0)))
legs = [Vector((l.x - ox, l.y - oy)) for l in legs]; split -= ox
vs = [v.co for v in body.data.vertices]
print('legs', [tuple(round(c, 3) for c in l) for l in legs], 'split', round(split, 3))

# ---------------------------------------------------------------- 3. 삼각형 줄이기
tri = sum(len(p.vertices) - 2 for p in body.data.polygons)
if tri > a.tris:
    mod = body.modifiers.new('dec', 'DECIMATE'); mod.ratio = a.tris / tri
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.modifier_apply(modifier='dec')
print('tris', tri, '->', sum(len(p.vertices) - 2 for p in body.data.polygons))

# ---------------------------------------------------------------- 4. 뼈대
HZ = 0.51 * HEIGHT     # 엉덩이
KZ = 0.28 * HEIGHT     # 무릎
CZ = 0.62 * HEIGHT     # 가슴(상체 회전 중심)
NZ = 0.83 * HEIGHT     # 목
arm = bpy.data.armatures.new('Rig'); rig = bpy.data.objects.new('Rig', arm)
scene.collection.objects.link(rig)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode='EDIT')
eb = arm.edit_bones
def bone(name, h, t, par=None):
    b = eb.new(name); b.head = h; b.tail = t
    if par: b.parent = eb[par]
    return b
hipX = [legs[0].x * 0.85, legs[1].x * 0.85]
bone('hips', (0, 0, HZ), (0, 0, HZ + 0.06 * HEIGHT))
bone('chest', (0, 0, CZ), (0, 0, NZ), 'hips')
bone('head', (0, 0, NZ), (0, 0, HEIGHT), 'chest')
for i in range(2):
    lx, ly = legs[i].x, legs[i].y
    bone(f'hip{i}', (hipX[i], ly * 0.5, HZ - 0.02 * HEIGHT), (lx, ly, KZ), 'hips')
    bone(f'knee{i}', (lx, ly, KZ), (lx, ly, 0.02), f'hip{i}')
bpy.ops.object.mode_set(mode='OBJECT')

# ---------------------------------------------------------------- 5. 무게(직접 계산: 높이와 다리 거리로)
def sm(e0, e1, x):
    t = max(0.0, min(1.0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t)
legR = 0.11 * HEIGHT
G = {n: body.vertex_groups.new(name=n) for n in ['hips', 'chest', 'head', 'hip0', 'knee0', 'hip1', 'knee1']}
for v in body.data.vertices:
    p = v.co
    w = {}
    # 다리 쪽 정도: 엉덩이 아래이고 다리 축 가까울수록
    i = 0 if p.x < split else 1
    d = (Vector((p.x, p.y)) - Vector((legs[i].x, legs[i].y))).length
    near = 1 - sm(legR * 0.9, legR * 1.6, d)
    legw = (1 - sm(HZ - 0.1 * HEIGHT, HZ, p.z)) * near
    if legw > 0:
        k = 1 - sm(KZ - 0.04 * HEIGHT, KZ + 0.04 * HEIGHT, p.z)    # 무릎 아래 비율
        w[f'knee{i}'] = legw * k; w[f'hip{i}'] = legw * (1 - k)
    up = 1 - legw
    c = sm(HZ + 0.02 * HEIGHT, CZ, p.z)          # 엉덩이 → 가슴
    hd = sm(NZ - 0.03 * HEIGHT, NZ + 0.03 * HEIGHT, p.z) * (1 if abs(p.x) < 0.16 * HEIGHT else 0.3)
    if p.z < HZ and legw < 0.5: c = max(c, 0.85)  # 엉덩이 아래로 늘어진 무기·망토 → 상체
    w['hips'] = up * (1 - c); w['chest'] = up * c * (1 - hd); w['head'] = up * c * hd
    for n, x in w.items():
        if x > 0.002: G[n].add([v.index], x, 'REPLACE')
mod = body.modifiers.new('Armature', 'ARMATURE'); mod.object = rig
body.parent = rig

# ---------------------------------------------------------------- 6. 총구
cand = [v.co for v in body.data.vertices if v.co.z > 0.38 * HEIGHT and v.co.z < 0.85 * HEIGHT]
tip = max(cand, key=lambda c: c.y * 1.0 + 0.3 * abs(c.x)) if cand else Vector((0.2, 0.5, 1.2))
mz = bpy.data.objects.new('Muzzle', None); scene.collection.objects.link(mz)
mz.parent = rig; mz.parent_type = 'BONE'; mz.parent_bone = 'chest'
bpy.context.view_layer.update()
mz.matrix_world = Matrix.Translation(tip)
print('muzzle', tuple(round(c, 2) for c in tip))

# ---------------------------------------------------------------- 7. 텍스처 줄이기, 재질 정리
for img in bpy.data.images:
    if img.size[0] > a.tex:
        img.scale(a.tex, a.tex)
        img.pack()
for m in bpy.data.materials:
    if m.use_nodes:
        for n in m.node_tree.nodes:
            if n.type == 'BSDF_PRINCIPLED':
                n.inputs['Roughness'].default_value = max(0.5, n.inputs['Roughness'].default_value)

# ---------------------------------------------------------------- 8. 내보내기
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=a.dst, export_format='GLB', use_selection=True, export_skins=True,
                          export_animations=False, export_yup=True, export_image_format='JPEG', export_jpeg_quality=85)
print('height', round(HEIGHT, 2), 'ok', a.dst)

# ---------------------------------------------------------------- 9. 확인용 렌더(선택)
if a.preview:
    cam = bpy.data.cameras.new('cam'); co = bpy.data.objects.new('cam', cam); scene.collection.objects.link(co)
    cam.lens = 50
    for nm, yaw in (('front', 0), ('side', 90)):
        r = math.radians(yaw); dist = HEIGHT * 2.6
        co.location = (math.sin(r) * dist, math.cos(r) * dist, HEIGHT * 0.55)
        co.rotation_euler = (math.radians(90), 0, math.radians(180) + r)
        scene.camera = co
        L = bpy.data.lights.new('sun', 'SUN'); L.energy = 3; lo = bpy.data.objects.new('sun', L); scene.collection.objects.link(lo); lo.rotation_euler = (0.6, 0.2, 0.5)
        scene.world = scene.world or bpy.data.worlds.new('w'); scene.world.color = (0.6, 0.6, 0.62)
        scene.render.engine = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items] else 'BLENDER_EEVEE'
        scene.render.resolution_x = 400; scene.render.resolution_y = 600
        scene.render.filepath = os.path.abspath(f'{a.preview}_{nm}.png')
        try:
            bpy.ops.render.render(write_still=True)
        except Exception as e:
            scene.render.engine = 'CYCLES'; scene.cycles.samples = 16; bpy.ops.render.render(write_still=True)
