"""python3 fingdebug.py -- src.glb joints.json out.png"""
import bpy, sys, json, numpy as np
sys.path.insert(0, '/home/claude/rat/tools')
from fingers import find_hand
from mathutils import Vector
from mathutils.kdtree import KDTree
a = sys.argv[sys.argv.index('--') + 1:]
SRC, JS, OUT = a[0], a[1], a[2]
G = json.load(open(JS))
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
for o in list(bpy.data.objects):
    if o.type == 'MESH' and o.name.startswith('Icosphere'): bpy.data.objects.remove(o)
ms = [o for o in bpy.data.objects if o.type == 'MESH']
Vs, Fs, off = [], [], 0
for o in ms:
    mw = o.matrix_world
    v = np.array([(mw @ x.co)[:] for x in o.data.vertices])
    o.data.calc_loop_triangles()
    f = np.array([t.vertices[:] for t in o.data.loop_triangles]) + off
    Vs.append(v); Fs.append(f); off += len(v)
V = np.vstack(Vs); F = np.vstack(Fs)
H0 = V[:, 2].max() - V[:, 2].min()
kd = KDTree(len(V))
for i, p in enumerate(V): kd.insert(p, i)
kd.balance()
def refine(p, r):
    p = Vector(p)
    for _ in range(3):
        hits = kd.find_range(p, r)
        if len(hits) < 4: break
        p = sum((h[0] for h in hits), Vector()) / len(hits)
    return np.array(p[:])
import matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
fig, ax = plt.subplots(2, 2, figsize=(12, 9))
from fingers import fix_wrist as _fw
def _j(n, sg): return np.array(G[n + '_R']) * np.array([sg, 1, 1])
_r = 0.035 * H0
WR = {sd: _fw(V, refine(_j('elbow', sg), _r), _j('wrist', sg), _j('handend', sg), H0) for sd, sg in (('R', 1), ('L', -1))}
if abs(abs(WR['R'][0]) - abs(WR['L'][0])) > 0.01 * H0:
    g0 = abs(G['wrist_R'][0]); good = min('RL', key=lambda sd: abs(abs(WR[sd][0]) - g0)); m = WR[good] * np.array([-1, 1, 1])
    WR['L' if good == 'R' else 'R'] = m
for k, side in enumerate('RL'):
    sg = 1 if side == 'R' else -1
    jj = lambda n: np.array(G[n + '_R']) * np.array([sg, 1, 1])
    r = 0.035 * H0
    from fingers import fix_wrist
    e, he = refine(jj('elbow'), r), np.array(jj('handend'))
    w = WR[side]
    print('JOINTS', side, w.round(3), e.round(3), he.round(3), 'H0', round(H0,3), V.min(0).round(3), V.max(0).round(3)); res, d = find_hand(V, F, w, e, he, H0, side, debug=True)
    if res is None: print(side, d); continue
    A, N, S = d['frame']; P = d['P']
    tP, sP, nP = (P - w) @ A, (P - w) @ S, (P - w) @ N
    ax[0, k].scatter(sP, tP, s=0.05, c='#999'); ax[1, k].scatter(nP, tP, s=0.05, c='#999')
    for tr in d['cands']:
        pts = np.array([[c[0], c[1], tc] for tc, c in tr['pts']])
        ax[0, k].plot(pts[:, 0], pts[:, 2], 'b-', lw=1)
    cols = {'thumb': 'r', 'index': 'orange', 'middle': 'g', 'ring': 'c', 'pinky': 'm'}
    for nm, js in res.items():
        js = np.array(js)
        ax[0, k].plot((js - w) @ S, (js - w) @ A, 'o-', c=cols[nm], ms=4)
        ax[1, k].plot((js - w) @ N, (js - w) @ A, 'o-', c=cols[nm], ms=4)
    for x in ax[:, k]: x.set_aspect('equal')
    ax[0, k].set_title(f"{side} found={d.get('found')} filled={d['filled']} cand={d['ncand']}")
    print(side, 'found', d.get('found'), 'filled', d['filled'], 'Lh', round(d['Lh'], 4), 'eps', round(d['eps'], 5))
plt.tight_layout(); plt.savefig(OUT, dpi=80)
