"""GLB 폴리곤 줄이기 (스킨 메쉬는 뼈 가중치 유지). python3 decimate_glb.py in.glb out.glb 목표삼각형수"""
import bpy, sys
SRC, DST, TARGET = sys.argv[1], sys.argv[2], int(sys.argv[3])
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
ms = [o for o in bpy.data.objects if o.type == 'MESH']
tri = lambda o: sum(len(p.vertices) - 2 for p in o.data.polygons)
total = sum(tri(o) for o in ms)
skinned = any(o.find_armature() for o in ms)
r = min(1.0, TARGET / max(1, total))
if r < 0.98:
    for o in ms:
        bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active = o
        d = o.modifiers.new('dec', 'DECIMATE'); d.ratio = r; d.use_collapse_triangulate = True
        while o.modifiers[0].name != 'dec': bpy.ops.object.modifier_move_up(modifier='dec')
        bpy.ops.object.modifier_apply(modifier='dec')
        if skinned and o.vertex_groups:
            bpy.ops.object.mode_set(mode='WEIGHT_PAINT')
            bpy.ops.object.vertex_group_limit_total(group_select_mode='ALL', limit=4)
            bpy.ops.object.vertex_group_normalize_all(lock_active=False)
            bpy.ops.object.mode_set(mode='OBJECT')
for img in bpy.data.images:
    if img.size[0] > 1024: img.scale(1024, 1024)
bpy.ops.export_scene.gltf(filepath=DST, export_format='GLB', export_image_format='JPEG', export_jpeg_quality=85,
                          export_animations=False, export_skins=skinned, export_yup=True)
print('DONE', SRC.split('/')[-1], total, '->', sum(tri(o) for o in bpy.data.objects if o.type == 'MESH'), 'skinned' if skinned else '')
