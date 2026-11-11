"""통짜(파츠 없는) T포즈 캐릭터 GLB -> 자동 가중치 스킨 GLB + 관절 json.
python3 build_skin.py -- in.glb out.glb height joints.json(원본 좌표, 원본 키=1 기준 아님: 원본 단위 그대로)
뼈: hips spine chest head / upperarm forearm hand / thigh shin foot (_R = 캐릭터 오른쪽 = 원본 -X)
"""
import bpy, sys, math, json
import numpy as np
sys.path.insert(0, "/home/claude/rat/tools")
from fingers import find_hand, fix_wrist
from mathutils import Vector, Matrix
from mathutils.kdtree import KDTree

a = sys.argv[sys.argv.index('--') + 1:]
SRC, DST, HEIGHT, JSRC = a[0], a[1], float(a[2]), a[3]
TRIS = int(a[4]) if len(a) > 4 else 0
FING = '--nofingers' not in a
HANDTRIS = 2400  # 손 하나에 남길 삼각형 수(손가락이 뭉개지지 않게)
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
ntri = sum(len(p.vertices) - 2 for p in body.data.polygons)
def hand_mask(co):
    m = np.zeros(len(co), bool)
    for sg in (1, -1):
        w = np.array(G['wrist_R']) * [sg, 1, 1]; e = np.array(G['elbow_R']) * [sg, 1, 1]; ax = (w - e) / np.linalg.norm(w - e)
        t = (co - w) @ ax; r = np.linalg.norm(co - w - t[:, None] * ax, axis=1)
        m |= (t > -0.01) & (t < 0.16) & (r < 0.09)
    return m
if TRIS and ntri > TRIS:
    bpy.context.view_layer.objects.active = body
    co = np.array([v.co[:] for v in body.data.vertices]); hm = hand_mask(co)
    htri = ntri * hm.mean()
    r1 = min(1.0, 2 * HANDTRIS / max(htri, 1))
    if r1 < 0.98 and FING:
        d = body.modifiers.new('dec', 'DECIMATE'); d.ratio = max(r1, (TRIS + 2 * HANDTRIS) / ntri); bpy.ops.object.modifier_apply(modifier='dec')
        n1 = sum(len(p.vertices) - 2 for p in body.data.polygons)
        co = np.array([v.co[:] for v in body.data.vertices]); hm = hand_mask(co)
        g = body.vertex_groups.new(name='_dec'); g.add([int(i) for i in np.where(~hm)[0]], 1.0, 'REPLACE')
        d = body.modifiers.new('dec', 'DECIMATE'); d.ratio = min(1.0, (TRIS + 2 * HANDTRIS) / n1); d.vertex_group = '_dec'; d.vertex_group_factor = 10
        bpy.ops.object.modifier_apply(modifier='dec'); body.vertex_groups.remove(body.vertex_groups['_dec'])
    else:
        d = body.modifiers.new('dec', 'DECIMATE'); d.ratio = TRIS / ntri
        bpy.ops.object.modifier_apply(modifier='dec')
    print('DECIMATED', ntri, '->', sum(len(p.vertices) - 2 for p in body.data.polygons))
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

# 손목: 팔→손에서 가장 가는 곳 (좌우 대칭으로 맞춤)
V_np = np.array([v.co[:] for v in body.data.vertices])
body.data.calc_loop_triangles(); F_np = np.array([t.vertices[:] for t in body.data.loop_triangles])
WR = {}
for sd in 'RL':
    sgn = 1 if sd == 'R' else -1
    WR[sd] = fix_wrist(V_np, np.array(J['elbow_' + sd][:]), np.array(G['wrist_R']) * [sgn, 1, 1], np.array(G['handend_R']) * [sgn, 1, 1], H0)
if abs(abs(WR['R'][0]) - abs(WR['L'][0])) > 0.01 * H0:
    g0 = abs(G['wrist_R'][0]); good = min('RL', key=lambda sd: abs(abs(WR[sd][0]) - g0)); WR['L' if good == 'R' else 'R'] = WR[good] * np.array([-1, 1, 1])
for sd in 'RL':
    print('WRIST', sd, [round(x, 3) for x in J['wrist_' + sd]], '->', [round(float(x), 3) for x in WR[sd]])
    J['wrist_' + sd] = Vector(WR[sd].tolist())
FJ = {}
if FING:
    for sd in 'RL':
        res, dg = find_hand(V_np, F_np, np.array(J['wrist_' + sd][:]), np.array(J['elbow_' + sd][:]), np.array(G['handend_R']) * [1 if sd == 'R' else -1, 1, 1], H0, sd)
        if res is None: print('FINGERS FAIL', sd, dg); continue
        print('FINGERS', sd, 'found', dg.get('found'), 'filled', dg.get('filled'))
        for fn, js in res.items():
            for i, p in enumerate(js): FJ[f'{fn}{i}_{sd}'] = Vector([float(x) for x in p])
    J.update(FJ)
    for sd in 'RL':  # 손 뼈 끝 = 가운데 손가락 뿌리
        if f'middle0_{sd}' in J: J['palm_' + sd] = J[f'middle0_{sd}'].copy()

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
    bone('hand_' + s, 'wrist_' + s, ('palm_' + s) if ('palm_' + s) in J else ('handend_' + s), 'forearm_' + s)
    for fn in ('thumb', 'index', 'middle', 'ring', 'pinky'):
        if f'{fn}0_{s}' not in J: continue
        par = 'hand_' + s
        for i in range(3):
            bn = f'{fn}_0{i + 1}_{s}'
            bone(bn, f'{fn}{i}_{s}', f'{fn}{i + 1}_{s}', par); par = bn
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
# 손가락: 각 점은 가장 가까운 손가락 하나의 뼈만 (옆 손가락이 같이 끌려가지 않게)
if FJ:
    def segd(p, a, b):
        ab = b - a; u = max(0, min(1, (p - a).dot(ab) / max(ab.length_squared, 1e-12))); return (a + ab * u - p).length
    chains = {}
    for s in 'RL':
        for fn in ('thumb', 'index', 'middle', 'ring', 'pinky'):
            if f'{fn}0_{s}' in J: chains[(fn, s)] = [J[f'{fn}{i}_{s}'] for i in range(4)]
    fb = {(fn, s): [f'{fn}_0{i + 1}_{s}' for i in range(3)] for (fn, s) in chains}
    gname = {g.index: g.name for g in body.vertex_groups}
    allf = {b: k for k, bs in fb.items() for b in bs}
    nfix = 0
    for v in body.data.vertices:
        fw = [(allf[gname[g.group]], g) for g in v.groups if gname[g.group] in allf and g.weight > 1e-4]
        if not fw: continue
        side = 'R' if v.co.x > 0 else 'L'
        best = min((k for k in chains if k[1] == side), key=lambda k: min(segd(v.co, chains[k][i], chains[k][i + 1]) for i in range(3)), default=None)
        if best is None: continue
        rm = [gname[g.group] for k, g in fw if k != best]
        for gn in rm: body.vertex_groups[gn].remove([v.index])
        if rm: nfix += 1
        if sum(g.weight for g in v.groups) < 1e-3:  # 다 지워졌으면 그 손가락의 가장 가까운 마디에
            ch = chains[best]; i = min(range(3), key=lambda i: segd(v.co, ch[i], ch[i + 1]))
            body.vertex_groups[fb[best][i]].add([v.index], 1.0, 'REPLACE')
    print('FINGERFIX', nfix)

# 다리 아래쪽은 반대편 다리 뼈 가중치를 지움 (다리가 붙어 있어도 따로 움직이게)
crotch = min(J['hip_R'].z, J['hip_L'].z) - 0.04 * HEIGHT
gi = {g.name: g.index for g in body.vertex_groups}
legs = {'R': ['thigh_R', 'shin_R', 'foot_R'], 'L': ['thigh_L', 'shin_L', 'foot_L']}
fixed = 0
for v in body.data.vertices:
    if v.co.z > crotch: continue
    other = legs['L'] if v.co.x > 0 else legs['R']
    rm = [g for g in v.groups if body.vertex_groups[g.group].name in other or body.vertex_groups[g.group].name == 'hips']
    if not rm: continue
    for g in rm: body.vertex_groups[g.group].remove([v.index])
    if not any(gg.weight > 1e-4 for gg in v.groups):
        mine = legs['R'] if v.co.x > 0 else legs['L']
        body.vertex_groups[mine[0] if v.co.z > (J['knee_R'].z + J['knee_L'].z) / 2 else mine[1]].add([v.index], 1.0, 'REPLACE')
    fixed += 1
print('LEGFIX', fixed)
# 뼈 없는 옛 가중치 그룹(원본에 딸려 온 mixamorig 등) 지우고, 모든 점 가중치 합 = 1
bones = set(b.name for b in arm.bones)
for g in list(body.vertex_groups):
    if g.name not in bones: body.vertex_groups.remove(g)
bpy.context.view_layer.objects.active = body
bpy.ops.object.mode_set(mode='WEIGHT_PAINT'); bpy.ops.object.vertex_group_limit_total(group_select_mode='ALL', limit=4); bpy.ops.object.vertex_group_normalize_all(lock_active=False); bpy.ops.object.mode_set(mode='OBJECT')
zero = 0
for v in body.data.vertices:
    if sum(g.weight for g in v.groups) >= 1e-3: continue
    best, bd = None, 1e9
    for n, (h, t) in segs.items():
        ht = t - h; u = max(0, min(1, (v.co - h).dot(ht) / max(ht.length_squared, 1e-9))); d = (h + ht * u - v.co).length
        if d < bd: bd, best = d, n
    body.vertex_groups[best].add([v.index], 1.0, 'REPLACE'); zero += 1
print('ZEROW fixed', zero)
print('GROUPS', vg_names, 'unweighted fixed', empty, 'of', len(body.data.vertices))

# 텍스처 1024
for img in bpy.data.images:
    if img.size[0] > 1024: img.scale(1024, 1024)

def t3(p): return [p.x, p.z, -p.y]  # Blender -> three
out = {
    'tips': {'hand_R': t3(J['handend_R']), 'hand_L': t3(J['handend_L']), 'foot_R': t3(J['toe_R']), 'foot_L': t3(J['toe_L']), 'head': t3(J['headtop'])},
    'ankleH': (J['ankle_R'].z + J['ankle_L'].z) / 2,
    'fingers': {k: t3(J[k]) for k in J if k[:-2].rstrip('0123') in ('thumb', 'index', 'middle', 'ring', 'pinky') and k[-3] == '3'},
}
json.dump(out, open(DST.replace('.glb', '.json'), 'w'))
bpy.ops.export_scene.gltf(filepath=DST, export_format='GLB', export_image_format='JPEG', export_jpeg_quality=85,
                          export_animations=False, export_skins=True, export_yup=True)
print('DONE')
