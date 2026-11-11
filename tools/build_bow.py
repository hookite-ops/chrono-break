"""활 GLB -> 게임용 활. 시위(가장 긴 직선)를 찾아 세로로 세우고, 시위는 지움(게임에서 당겨지게 다시 그림).
원점 = 손잡이, 위 = Blender +Z, 쏘는 방향 = Blender +Y (three -Z). 빈 노드: TipT, TipB(시위 끝), Nock(시위 가운데), Muzzle(화살 받침)
python3 build_bow.py -- in.glb out.glb length tris
"""
import bpy, sys, math
import numpy as np
from mathutils import Vector, Matrix

a = sys.argv[sys.argv.index('--') + 1:]
SRC, DST, LENGTH, TRIS = a[0], a[1], float(a[2]), int(a[3])
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
ms = [o for o in bpy.data.objects if o.type == 'MESH']
for o in ms:
    mw = o.matrix_world.copy(); o.parent = None; o.matrix_world = mw
for o in list(bpy.data.objects):
    if o.type != 'MESH': bpy.data.objects.remove(o)
bpy.ops.object.select_all(action='DESELECT')
for o in ms: o.select_set(True)
bpy.context.view_layer.objects.active = ms[0]
if len(ms) > 1: bpy.ops.object.join()
bow = ms[0]; bow.data.transform(bow.matrix_world); bow.matrix_world = Matrix.Identity(4)
V = np.array([v.co[:] for v in bow.data.vertices])
ext = np.ptp(V, axis=0).max()
# ── 시위 찾기: 멀리 떨어진 두 점을 잇는 선 중 아주 가까이 붙은 점이 가장 많은 것
rng = np.random.default_rng(3)
best = (0, None)
thr = 0.006 * ext
for _ in range(4000):
    i, j = rng.integers(0, len(V), 2)
    p, q = V[i], V[j]; d = q - p; L = np.linalg.norm(d)
    if L < 0.6 * ext: continue
    d /= L
    t = (V - p) @ d
    r = np.linalg.norm(V - p - t[:, None] * d, axis=1)
    inl = (r < thr) & (t > -0.05 * L) & (t < 1.05 * L)
    # 선 위에 고르게 퍼져 있어야 함
    cov = len(np.unique(np.floor(t[inl] / L * 20)))
    sc = inl.sum() * cov
    if sc > best[0]: best = (sc, (p.copy(), d.copy(), inl))
_, (p, d, inl) = best
t = (V - p) @ d
ti = t[inl]
A = p + d * ti.max(); B = p + d * ti.min()   # 시위 양 끝
if A[2] < B[2]: A, B = B, A
M = (A + B) / 2
up = (A - B) / np.linalg.norm(A - B)
# 손잡이: 시위 가운데 높이에서 시위로부터 가장 먼 활대 부분
tt = (V - B) @ up / np.linalg.norm(A - B)
perp = V - B - np.outer((V - B) @ up, up)
dist = np.linalg.norm(perp - (M - B - up * ((M - B) @ up)), axis=1)
mid = (np.abs(tt - 0.5) < 0.07) & ~inl
G = V[mid][np.argmax(dist[mid])] if mid.sum() else M
fw = G - M; fw -= up * (fw @ up); fw /= np.linalg.norm(fw)
G = G - fw * 0.012 * ext  # 손잡이 겉면이 아니라 안쪽
print('STRING', inl.sum(), 'len', round(float(np.linalg.norm(A - B)), 3), 'brace', round(float(np.linalg.norm((G - M) - up * ((G - M) @ up))), 3))
# 시위 꼭짓점 지우기(끝부분은 남김)
bpy.context.view_layer.objects.active = bow
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='DESELECT'); bpy.ops.object.mode_set(mode='OBJECT')
r = np.linalg.norm(V - p - t[:, None] * d, axis=1)
kill = (r < thr * 1.6) & (tt > 0.035) & (tt < 0.965)
for i in np.where(kill)[0]: bow.data.vertices[int(i)].select = True
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.delete(type='VERT'); bpy.ops.object.mode_set(mode='OBJECT')
print('REMOVED', int(kill.sum()))
# ── 변환: up -> +Z, fw -> +Y, 원점 = 손잡이, 길이 맞춤
k = LENGTH / float(np.linalg.norm(A - B))
x = np.cross(fw, up)  # 오른쪽
R = Matrix(((x[0], x[1], x[2], 0), (fw[0], fw[1], fw[2], 0), (up[0], up[1], up[2], 0), (0, 0, 0, 1)))
T = Matrix.Scale(k, 4) @ R @ Matrix.Translation(Vector((-G).tolist()))
bow.data.transform(T); bow.data.update()
P = lambda v: T @ Vector(v.tolist())
ntri = sum(len(pp.vertices) - 2 for pp in bow.data.polygons)
if ntri > TRIS:
    dm = bow.modifiers.new('d', 'DECIMATE'); dm.ratio = TRIS / ntri; bpy.ops.object.modifier_apply(modifier='d')
for img in bpy.data.images:
    if img.size[0] > 1024: img.scale(1024, 1024)
for nm, pos in (('TipT', P(A)), ('TipB', P(B)), ('Nock', P(M)), ('Muzzle', Vector((0, 0.03 * k * ext, 0.035)))):
    e = bpy.data.objects.new(nm, None); e.location = pos; bpy.context.scene.collection.objects.link(e)
    print('EMPTY', nm, [round(c, 3) for c in pos])
bpy.ops.export_scene.gltf(filepath=DST, export_format='GLB', export_image_format='JPEG', export_jpeg_quality=85, export_yup=True)
print('DONE', sum(len(pp.vertices) - 2 for pp in bow.data.polygons))
