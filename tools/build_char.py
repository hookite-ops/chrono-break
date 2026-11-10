"""Tripo 파츠 분리 캐릭터 GLB -> 파츠별 뼈가 붙은 스킨 GLB.
python3 build_char.py -- in.glb out.glb height
"""
import bpy, sys, math, json
from mathutils import Vector, Matrix
from mathutils.kdtree import KDTree

a = sys.argv[sys.argv.index('--') + 1:]
SRC, DST, HEIGHT = a[0], a[1], float(a[2])

# 파츠 번호 -> 뼈 (R = 캐릭터 오른쪽 = 원본 -X)
PART_BONE = {
    0: 'spine', 10: 'head', 8: 'hips',
    9: 'pad_R', 11: 'upperarm_R', 4: 'forearm_R', 5: 'hand_R', 6: 'thigh_R', 15: 'shin_R',
    2: 'pad_L', 12: 'upperarm_L', 13: 'forearm_L', 14: 'forearm_L', 3: 'hand_L', 7: 'thigh_L', 1: 'shin_L',
}

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
parts = {}
for o in list(bpy.data.objects):
    if o.type == 'MESH':
        mw = o.matrix_world.copy()
        o.parent = None
        o.matrix_world = mw
        parts[int(o.name.split('_')[-1])] = o
for o in list(bpy.data.objects):
    if o.type != 'MESH':
        bpy.data.objects.remove(o)

# 높이 측정 -> 크기·180도 회전(앞이 Blender +Y = glTF -Z)
allz = [(o.matrix_world @ v.co).z for o in parts.values() for v in o.data.vertices]
k = HEIGHT / (max(allz) - min(allz))
T = Matrix.Rotation(math.pi, 4, 'Z') @ Matrix.Scale(k, 4)
for o in parts.values():
    o.data.transform(T @ o.matrix_world)
    o.matrix_world = Matrix.Identity(4)
    o.data.update()

def verts(ids):
    return [v.co.copy() for i in ids for v in parts[i].data.vertices]

def contact(A, B, d=0.03):
    vb = verts(B); kd = KDTree(len(vb))
    for i, p in enumerate(vb): kd.insert(p, i)
    kd.balance()
    hits = [p for p in verts(A) if kd.find(p)[2] < d]
    if len(hits) < 5:
        return contact(A, B, d * 1.8)
    return sum(hits, Vector()) / len(hits)

def centroid(ids):
    vs = verts(ids); return sum(vs, Vector()) / len(vs)

J = {}
J['waist'] = contact([8], [0])
J['neck'] = contact([10], [0])
J['headtop'] = max(verts([10]), key=lambda p: p.z)
J['hipc'] = centroid([8])
for s, ua, fa, ha, pad, th, sh in (('R', [11], [4], [5], [9], [6], [15]), ('L', [12], [13, 14], [3], [2], [7], [1])):
    J['shoulder_' + s] = contact(ua, pad + [0])
    J['elbow_' + s] = contact(ua, fa)
    J['wrist_' + s] = contact(fa, ha)
    hv = verts(ha); w = J['wrist_' + s]
    J['handend_' + s] = max(hv, key=lambda p: (p - w).length)
    J['hip_' + s] = contact(th, [8])
    J['knee_' + s] = contact(th, sh)
    bv = verts(sh); J['foot_' + s] = Vector((J['knee_' + s].x, J['knee_' + s].y, min(p.z for p in bv)))
    J['padc_' + s] = centroid(pad)
for n, p in J.items():
    print('JOINT', n, [round(x, 3) for x in p])

# 아마추어
arm = bpy.data.armatures.new('rig'); rig = bpy.data.objects.new('rig', arm)
bpy.context.scene.collection.objects.link(rig)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode='EDIT')
eb = arm.edit_bones
def bone(name, head, tail, parent=None):
    b = eb.new(name); b.head = head; b.tail = tail
    if (b.tail - b.head).length < 1e-3: b.tail = b.head + Vector((0, 0, 0.05))
    if parent: b.parent = eb[parent]
    return b
bone('hips', J['waist'] - Vector((0, 0, 0.12)), J['waist'])
bone('spine', J['waist'], J['neck'], 'hips')
bone('head', J['neck'], J['headtop'], 'spine')
for s in 'RL':
    bone('pad_' + s, J['shoulder_' + s], J['padc_' + s], 'spine')
    bone('upperarm_' + s, J['shoulder_' + s], J['elbow_' + s], 'spine')
    bone('forearm_' + s, J['elbow_' + s], J['wrist_' + s], 'upperarm_' + s)
    bone('hand_' + s, J['wrist_' + s], J['handend_' + s], 'forearm_' + s)
    bone('thigh_' + s, J['hip_' + s], J['knee_' + s], 'hips')
    bone('shin_' + s, J['knee_' + s], J['foot_' + s], 'thigh_' + s)
for b in eb: b.roll = 0
bpy.ops.object.mode_set(mode='OBJECT')

# 파츠마다 그 뼈 가중치 1 -> 합치기
for i, o in parts.items():
    vg = o.vertex_groups.new(name=PART_BONE[i])
    vg.add(list(range(len(o.data.vertices))), 1.0, 'REPLACE')
bpy.ops.object.select_all(action='DESELECT')
for o in parts.values(): o.select_set(True)
body = parts[0]; bpy.context.view_layer.objects.active = body
bpy.ops.object.join()
body.name = 'body'
body.parent = rig
mod = body.modifiers.new('arm', 'ARMATURE'); mod.object = rig

# 텍스처 줄이기
for img in bpy.data.images:
    lim = 512 if 'basecolor' in img.name else 256
    if img.size[0] > lim:
        img.scale(lim, lim)

json.dump({n: list(p) for n, p in J.items()}, open(DST + '.joints.json', 'w'))
bpy.ops.export_scene.gltf(filepath=DST, export_format='GLB', export_image_format='JPEG',
                          export_jpeg_quality=85, export_animations=False, export_skins=True,
                          export_yup=True)
print('DONE', DST)
