"""통짜(파츠 없는) T포즈 캐릭터 GLB -> 자동 가중치 스킨 GLB + 관절 json.
python3 build_skin.py -- in.glb out.glb height joints.json(원본 좌표, 원본 키=1 기준 아님: 원본 단위 그대로)
뼈: hips spine chest head / upperarm forearm hand / thigh shin foot (_R = 캐릭터 오른쪽 = 원본 -X)
"""
import bpy, sys, math, json
from mathutils import Vector, Matrix
from mathutils.kdtree import KDTree

a = sys.argv[sys.argv.index('--') + 1:]
SRC, DST, HEIGHT, JSRC = a[0], a[1], float(a[2]), a[3]
G = json.load(open(JSRC))  # {name: [x,y,z]} 원본 좌표, R쪽만 (L은 x 반전)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
for o in list(bpy.data.objects):
    if o.type == 'MESH' and o.name.startswith('Icosphere'): bpy.data.objects.remove(o)
ms = [o for o in bpy.data.objects if o.type == 'MESH']
for o in ms:
    mw = o.matrix_world.copy(); o.parent = None; o.matrix_world = mw
for o in list(bpy.data.objects):
    if o.type != 'MESH': bpy.data.objects.remove(o)
bpy.ops.object.select_all(action='DESELECT')
for o in ms: o.select_set(True)
bpy.context.view_layer.objects.active = ms[0]
if len(ms) > 1: bpy.ops.object.join()
body = ms[0]; body.name = 'body'
body.data.transform(body.matrix_world); body.matrix_world = Matrix.Identity(4)
src_vs = [v.co.copy() for v in body.data.vertices]
H0 = max(v.z for v in src_vs) - min(v.z for v in src_vs)
k = HEIGHT / H0
kd = KDTree(len(src_vs))
for i, p in enumerate(src_vs): kd.insert(p, i)
kd.balance()

def refine(p, r, full=True):
    p = Vector(p)
    for _ in range(3):
        hits = kd.find_range(p, r)
        if len(hits) < 4: break
        c = sum((h[0] for h in hits), Vector()) / len(hits)
        p = c if full else Vector((p.x, c.y, p.z))
    return p

J = {}
FULL = {'elbow', 'wrist', 'knee', 'ankle'}
for n, p in G.items():
    side = n.endswith('_R')
    base = n[:-2] if side else n
    r = 0.035 * H0
    q = refine(p, r, base in FULL)
    if side:
        J[n] = q
        J[base + '_L'] = refine(Vector((-p[0], p[1], p[2])), r, base in FULL)
    else:
        J[n] = q

# 크기·180도 회전(앞 = Blender +Y = glTF -Z)
T = Matrix.Rotation(math.pi, 4, 'Z') @ Matrix.Scale(k, 4)
body.data.transform(T); body.data.update()
for n in J: J[n] = (T @ J[n].to_4d()).to_3d()
for n, p in J.items(): print('JOINT', n, [round(x, 3) for x in p])

arm = bpy.data.armatures.new('rig'); rig = bpy.data.objects.new('rig', arm)
bpy.context.scene.collection.objects.link(rig)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode='EDIT')
eb = arm.edit_bones
def bone(name, h, t, parent=None, deform=True):
    b = eb.new(name); b.head = J[h] if isinstance(h, str) else h; b.tail = J[t] if isinstance(t, str) else t
    if parent: b.parent = eb[parent]
    b.use_deform = deform; b.roll = 0
    return b
bone('hips', 'pelvis', 'waist')
bone('spine', 'waist', 'chest', 'hips')
bone('chest', 'chest', 'neck', 'spine')
bone('head', 'neck', 'headtop', 'chest')
for s in 'RL':
    bone('upperarm_' + s, 'shoulder_' + s, 'elbow_' + s, 'chest')
    bone('forearm_' + s, 'elbow_' + s, 'wrist_' + s, 'upperarm_' + s)
    bone('hand_' + s, 'wrist_' + s, 'handend_' + s, 'forearm_' + s)
    bone('thigh_' + s, 'hip_' + s, 'knee_' + s, 'hips')
    bone('shin_' + s, 'knee_' + s, 'ankle_' + s, 'thigh_' + s)
    bone('foot_' + s, 'ankle_' + s, 'toe_' + s, 'shin_' + s)
bpy.ops.object.mode_set(mode='OBJECT')

# 자동 가중치(열 확산). 실패하면 거리 기반으로 보완
bpy.context.view_layer.objects.active = body
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.remove_doubles(threshold=0.0005); bpy.ops.object.mode_set(mode='OBJECT')
bpy.ops.object.select_all(action='DESELECT')
body.select_set(True); rig.select_set(True); bpy.context.view_layer.objects.active = rig
bpy.ops.object.parent_set(type='ARMATURE_AUTO')
vg_names = [g.name for g in body.vertex_groups]
empty = 0
segs = {}
for b in arm.bones:
    segs[b.name] = (b.head_local.copy(), b.tail_local.copy())
for v in body.data.vertices:
    tot = sum(g.weight for g in v.groups)
    if tot < 1e-3:
        empty += 1
        best, bd = None, 1e9
        for n, (h, t) in segs.items():
            ht = t - h; u = max(0, min(1, (v.co - h).dot(ht) / max(ht.length_squared, 1e-9)))
            d = (h + ht * u - v.co).length
            if d < bd: bd, best = d, n
        body.vertex_groups[best].add([v.index], 1.0, 'REPLACE')
print('GROUPS', vg_names, 'unweighted fixed', empty, 'of', len(body.data.vertices))

# 텍스처 1024
for img in bpy.data.images:
    if img.size[0] > 1024: img.scale(1024, 1024)

def t3(p): return [p.x, p.z, -p.y]  # Blender -> three
out = {
    'tips': {'hand_R': t3(J['handend_R']), 'hand_L': t3(J['handend_L']), 'foot_R': t3(J['toe_R']), 'foot_L': t3(J['toe_L']), 'head': t3(J['headtop'])},
    'ankleH': (J['ankle_R'].z + J['ankle_L'].z) / 2,
}
json.dump(out, open(DST.replace('.glb', '.json'), 'w'))
bpy.ops.export_scene.gltf(filepath=DST, export_format='GLB', export_image_format='JPEG', export_jpeg_quality=85,
                          export_animations=False, export_skins=True, export_yup=True)
print('DONE')
