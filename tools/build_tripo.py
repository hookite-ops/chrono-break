"""Tripo(Mixamo 방식) 리깅 GLB -> 게임용 스킨 GLB + meta json.
python3 build_tripo.py -- in.glb out.glb height [tris]
뼈 이름을 게임 이름으로 바꾸고(hips spine chest head upperarm_R ... thumb_01_R ...), 앞이 three.js -Z가 되게 돌리고, 키를 맞춤.
"""
import bpy, sys, math, json, re
from mathutils import Vector, Matrix

a = sys.argv[sys.argv.index('--') + 1:]
SRC, DST, HEIGHT = a[0], a[1], float(a[2])
TRIS = int(a[3]) if len(a) > 3 and a[3].isdigit() else 0

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
for o in list(bpy.data.objects):
    if o.type == 'MESH' and o.name.startswith('Icosphere'): bpy.data.objects.remove(o)
arm = [o for o in bpy.data.objects if o.type == 'ARMATURE'][0]
ms = [o for o in bpy.data.objects if o.type == 'MESH']
# 감싸는 빈 노드(회전이 들어 있음)를 지우기 전에 세계 변환을 그대로 옮겨 둠
for o in [arm] + ms:
    if o.parent is not None and o.parent is not arm:
        mwo = o.matrix_world.copy(); o.parent = None; o.matrix_world = mwo
bpy.context.view_layer.update()
for o in list(bpy.data.objects):
    if o.type not in ('MESH', 'ARMATURE'): bpy.data.objects.remove(o)

# ── 뼈 이름 바꾸기 (꼭짓점 그룹도 같이 바뀜)
SIDE = {'Left': 'L', 'Right': 'R'}
FMAP = {'Thumb': 'thumb', 'Index': 'index', 'Middle': 'middle', 'Ring': 'ring', 'Pinky': 'pinky'}
BASIC = {'Hips': 'hips', 'Spine': 'spine', 'Spine2': 'chest', 'Head': 'head', 'Spine1': 'x_spine1', 'Neck': 'x_neck'}
LIMB = {'Arm': 'upperarm', 'ForeArm': 'forearm', 'Hand': 'hand', 'UpLeg': 'thigh', 'Leg': 'shin', 'Foot': 'foot', 'ToeBase': 'x_toe', 'Toe_End': 'x_toeend', 'Shoulder': 'x_clav'}
def newname(n):
    n = n.split(':')[-1]
    if n in BASIC: return BASIC[n]
    m = re.match(r'(Left|Right)Hand(Thumb|Index|Middle|Ring|Pinky)(\d)$', n)
    if m: return f"{FMAP[m.group(2)]}_0{m.group(3)}_{SIDE[m.group(1)]}" if m.group(3) in '123' else f"x_{FMAP[m.group(2)]}4_{SIDE[m.group(1)]}"
    m = re.match(r'(Left|Right)(.+)$', n)
    if m and m.group(2) in LIMB: return f"{LIMB[m.group(2)]}_{SIDE[m.group(1)]}"
    return 'x_' + n
ren = {}
for b in arm.data.bones:
    nn = newname(b.name); ren[b.name] = nn
for b in list(arm.data.bones):
    b.name = ren[b.name]
for o in ms:  # 혹시 안 바뀐 그룹
    for g in o.vertex_groups:
        if g.name in ren: g.name = ren[g.name]
print('BONES', sorted(b.name for b in arm.data.bones if not b.name.startswith('x_')))

# ── 메쉬 하나로 합치기
bpy.ops.object.select_all(action='DESELECT')
for o in ms: o.select_set(True)
bpy.context.view_layer.objects.active = ms[0]
if len(ms) > 1: bpy.ops.object.join()
body = ms[0]; body.name = 'body'
ntri = sum(len(p.vertices) - 2 for p in body.data.polygons)
if TRIS and ntri > TRIS:
    bpy.context.view_layer.objects.active = body
    d = body.modifiers.new('dec', 'DECIMATE'); d.ratio = TRIS / ntri
    # 아마추어 모디파이어보다 먼저 적용되도록 맨 앞으로
    while body.modifiers[0].name != 'dec': bpy.ops.object.modifier_move_up(modifier='dec')
    bpy.ops.object.modifier_apply(modifier='dec')
    print('DECIMATED', ntri, '->', sum(len(p.vertices) - 2 for p in body.data.polygons))

# ── 크기·방향: 키를 HEIGHT로, 앞 = Blender +Y (three -Z)
dg = bpy.context.evaluated_depsgraph_get()
zs = [(body.matrix_world @ v.co).z for v in body.data.vertices]
k = HEIGHT / (max(zs) - min(zs)); z0 = min(zs)
T = Matrix.Rotation(math.pi, 4, 'Z') @ Matrix.Scale(k, 4) @ Matrix.Translation((0, 0, -z0))
for o in (arm, body):
    if o.parent is None: o.matrix_world = T @ o.matrix_world
bpy.ops.object.select_all(action='DESELECT')
arm.select_set(True); body.select_set(True); bpy.context.view_layer.objects.active = arm
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
bpy.context.view_layer.update()

# ── 가중치 정리: 뼈 없는 그룹 지우기, 4개 제한, 합 1
bones = set(b.name for b in arm.data.bones)
for g in list(body.vertex_groups):
    if g.name not in bones: body.vertex_groups.remove(g)
bpy.context.view_layer.objects.active = body
bpy.ops.object.mode_set(mode='WEIGHT_PAINT')
bpy.ops.object.vertex_group_limit_total(group_select_mode='ALL', limit=4)
bpy.ops.object.vertex_group_normalize_all(lock_active=False)
bpy.ops.object.mode_set(mode='OBJECT')

# ── 끝점들 (three.js 좌표)
gi = {g.index: g.name for g in body.vertex_groups}
mw = arm.matrix_world
def bh(n): return mw @ arm.data.bones[n].head_local
def bt(n): return mw @ arm.data.bones[n].tail_local
def tip_of(n, parent=None):
    """뼈 n에 크게 붙은 점들 중 뼈 방향으로 가장 먼 점"""
    h = bh(n); d = (bt(n) - h).normalized() if parent is None else (bh(n) - bh(parent)).normalized()
    best = None
    for v in body.data.vertices:
        w = next((g.weight for g in v.groups if gi[g.group] == n), 0)
        if w < 0.5: continue
        p = body.matrix_world @ v.co; t = (p - h).dot(d)
        if best is None or t > best[0]: best = (t, p)
    return h + d * best[0] if best else bt(n)
def t3(p): return [p.x, p.z, -p.y]
fing = {}
for s in 'RL':
    for f in ('thumb', 'index', 'middle', 'ring', 'pinky'):
        if f'{f}_03_{s}' in bones: fing[f'{f}3_{s}'] = t3(tip_of(f'{f}_03_{s}', f'{f}_02_{s}'))
headtop = max((body.matrix_world @ v.co for v in body.data.vertices), key=lambda p: p.z)
out = {
    'tips': {'hand_R': t3(tip_of('middle_03_R', 'middle_02_R') if 'middle_03_R' in bones else bt('hand_R')),
             'hand_L': t3(tip_of('middle_03_L', 'middle_02_L') if 'middle_03_L' in bones else bt('hand_L')),
             'foot_R': t3(bt('x_toe_R') if 'x_toe_R' in bones else bt('foot_R')), 'foot_L': t3(bt('x_toe_L') if 'x_toe_L' in bones else bt('foot_L')),
             'head': t3(Vector((bh('head').x, bh('head').y, headtop.z)))},
    'ankleH': (bh('foot_R').z + bh('foot_L').z) / 2,
    'fingers': fing, 'rig': 'tripo',
}
json.dump(out, open(DST.replace('.glb', '.json'), 'w'))
print('ANKLE', round(out['ankleH'], 3), 'HEIGHT', round(headtop.z, 3), 'TRIS', sum(len(p.vertices) - 2 for p in body.data.polygons))

for img in bpy.data.images:
    if img.size[0] > 1024: img.scale(1024, 1024)
bpy.ops.export_scene.gltf(filepath=DST, export_format='GLB', export_image_format='JPEG', export_jpeg_quality=85,
                          export_animations=False, export_skins=True, export_yup=True)
print('DONE')
