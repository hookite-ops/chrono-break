"""Tripo 무기 GLB -> 가벼운 게임용 GLB. 원점 = 오른손 손잡이, 총구 = Blender +Y(glTF -Z).
python3 build_gun.py -- in.glb out.glb length tris gx gz lx lz mx mz
  g = 손잡이(원본 x,z), l = 왼손 받침(펌프), m = 총구
"""
import bpy, sys, math
from mathutils import Vector, Matrix

a = sys.argv[sys.argv.index('--') + 1:]
SRC, DST = a[0], a[1]
LENGTH, TRIS = float(a[2]), int(a[3])
G = Vector((float(a[4]), 0, float(a[5])))
L = Vector((float(a[6]), 0, float(a[7])))
M = Vector((float(a[8]), 0, float(a[9])))

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
ms = [o for o in bpy.data.objects if o.type == 'MESH']
total = 0
for o in ms:
    mw = o.matrix_world.copy(); o.parent = None; o.matrix_world = mw
    total += sum(len(p.vertices) - 2 for p in o.data.polygons)
for o in list(bpy.data.objects):
    if o.type != 'MESH': bpy.data.objects.remove(o)
xs = [(o.matrix_world @ v.co).x for o in ms for i, v in enumerate(o.data.vertices) if i % 50 == 0]
k = LENGTH / (max(xs) - min(xs))
# 원본 +X(총구) -> +Y, 손잡이를 원점으로
T = Matrix.Rotation(math.pi / 2, 4, 'Z') @ Matrix.Scale(k, 4) @ Matrix.Translation(-G)
ratio = TRIS / total
for o in ms:
    o.data.transform(T @ o.matrix_world); o.matrix_world = Matrix.Identity(4)
    bpy.context.view_layer.objects.active = o
    n = sum(len(p.vertices) - 2 for p in o.data.polygons)
    r = max(ratio, 60 / max(n, 1))
    if r < 1:
        d = o.modifiers.new('dec', 'DECIMATE'); d.ratio = r
        bpy.ops.object.modifier_apply(modifier='dec')
bpy.ops.object.select_all(action='DESELECT')
for o in ms: o.select_set(True)
bpy.context.view_layer.objects.active = ms[0]
bpy.ops.object.join()
g = ms[0]; g.name = 'gun'
bpy.ops.object.shade_smooth()
print('TRIS', sum(len(p.vertices) - 2 for p in g.data.polygons))
for img in bpy.data.images:
    lim = 512 if ('basecolor' in img.name or 'part_0_' in img.name or 'part_2_' in img.name) else 256
    if img.size[0] > lim: img.scale(lim, lim)
for name, p in (('Grip_L', L), ('Muzzle', M)):
    e = bpy.data.objects.new(name, None); bpy.context.scene.collection.objects.link(e)
    e.location = (T @ p.to_4d()).to_3d()
    e.parent = g
    print('EMPTY', name, [round(x, 3) for x in e.location])
bpy.ops.export_scene.gltf(filepath=DST, export_format='GLB', export_image_format='JPEG', export_jpeg_quality=85, export_yup=True)
print('DONE')
