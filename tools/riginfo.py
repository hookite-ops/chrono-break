import bpy, sys
a = sys.argv[sys.argv.index('--') + 1:]
for f in a:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=f)
    arms = [o for o in bpy.data.objects if o.type == 'ARMATURE']
    ms = [o for o in bpy.data.objects if o.type == 'MESH']
    nb = [len(o.data.bones) for o in arms]
    fing = [b.name for o in arms for b in o.data.bones if 'Index' in b.name or 'Thumb' in b.name]
    vg = sum(len(o.vertex_groups) for o in ms)
    print('RIG', f, 'armatures', len(arms), 'bones', nb, 'finger bones', len(fing), 'vgroups', vg, 'anims', len(bpy.data.actions))
