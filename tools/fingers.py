"""손가락 자동 검출 (Tripo 같은 통짜 메쉬용).
손 표면에 점을 고르게 뿌리고 → 손 방향으로 얇게 잘라 → 단면마다 덩어리를 묶고 → 손끝부터 따라 내려가며
손가락마다 중심선을 얻는다. 중심선 위에 관절(MCP·PIP·DIP·끝)을 놓는다. 엄지는 따로 처리.
반환: {'thumb': [cmc, mcp, ip, tip], 'index': [mcp, pip, dip, tip], ...} (원본 좌표), 그리고 진단 정보
"""
import numpy as np
from scipy.spatial import cKDTree
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components

NAMES = ['index', 'middle', 'ring', 'pinky']


def _unit(v):
    n = np.linalg.norm(v); return v / n if n > 1e-12 else v


def sample_surface(V, F, n, rng):
    tri = V[F]
    area = 0.5 * np.linalg.norm(np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0]), axis=1)
    p = area / area.sum()
    idx = rng.choice(len(tri), n, p=p)
    r1 = np.sqrt(rng.random(n)); r2 = rng.random(n)
    P = tri[idx, 0] * (1 - r1)[:, None] + tri[idx, 1] * (r1 * (1 - r2))[:, None] + tri[idx, 2] * (r1 * r2)[:, None]
    return P, area.sum()


def clusters2d(Q, eps, minc):
    n = len(Q)
    if n < minc: return []
    pairs = cKDTree(Q).query_pairs(eps, output_type='ndarray')
    if len(pairs) == 0: return []
    A = coo_matrix((np.ones(len(pairs)), (pairs[:, 0], pairs[:, 1])), shape=(n, n))
    k, lab = connected_components(A, directed=False)
    out = []
    for c in range(k):
        m = lab == c
        if m.sum() >= minc: out.append(Q[m])
    return out


def polyline_at(pts, fr):
    """누적 길이 비율 fr 위치 점들"""
    seg = np.linalg.norm(np.diff(pts, axis=0), axis=1); cum = np.concatenate([[0], np.cumsum(seg)]); L = cum[-1]
    out = []
    for f in fr:
        d = f * L; i = min(np.searchsorted(cum, d) - 1, len(seg) - 1); i = max(i, 0)
        k = (d - cum[i]) / max(seg[i], 1e-9)
        out.append(pts[i] + (pts[i + 1] - pts[i]) * np.clip(k, 0, 1))
    return out, L


def fix_wrist(V, elbow, wrist, handend, H0):
    """팔뚝→손 사이에서 단면이 가장 가는 곳 = 손목"""
    elbow, wrist, handend = map(np.asarray, (elbow, wrist, handend))
    a = _unit(handend - elbow); Ltot = (handend - elbow) @ a
    t = (V - elbow) @ a
    r = np.linalg.norm(V - elbow - t[:, None] * a, axis=1)
    near = r < 0.06 * H0
    best, bt = None, None
    tw0 = (wrist - elbow) @ a
    for tt in np.linspace(max(0.45 * Ltot, tw0 - 0.05 * H0), min(0.97 * Ltot, tw0 + 0.04 * H0), 40):
        sl = near & (np.abs(t - tt) < 0.004 * H0)
        if sl.sum() < 12: continue
        rr = np.percentile(r[sl], 85)
        score = rr + 0.15 * abs(tt - tw0)
        if best is None or score < best: best, bt = score, tt
    if bt is None: return wrist
    bt -= 0.006 * H0  # 관절 중심은 가장 가는 주름보다 조금 팔 쪽
    sl = near & (np.abs(t - bt) < 0.004 * H0)
    c = V[sl].mean(0)
    return elbow + a * bt + (c - elbow - a * ((c - elbow) @ a))


def find_hand(V, F, wrist, elbow, handend, H0, side, seed=1, debug=False):
    """side: 'R' (원본 -X쪽) 또는 'L'. V,F: 전체 메쉬(원본 좌표)."""
    rng = np.random.default_rng(seed)
    wrist, elbow, handend = map(np.asarray, (wrist, elbow, handend))
    a0 = _unit(wrist - elbow)
    C = V[F].mean(1)
    t = (C - wrist) @ a0
    rad = np.linalg.norm(C - wrist - t[:, None] * a0, axis=1)
    L0 = max(np.linalg.norm(handend - wrist) * 1.8, 0.09 * H0)
    mt = (t > -0.005 * H0) & (t < L0 * 1.25) & (rad < 0.085 * H0)
    if mt.sum() < 50: return None, {'err': 'no hand tris'}
    P, area = sample_surface(V, F[mt], 140000, rng)
    # 손목에서 이어진 덩어리만 (다른 몸 부분 제거)
    lab_eps = min(0.004 * H0, 3.0 * np.sqrt(area / len(P)))
    pairs = cKDTree(P).query_pairs(lab_eps, output_type='ndarray')
    A = coo_matrix((np.ones(len(pairs)), (pairs[:, 0], pairs[:, 1])), shape=(len(P), len(P)))
    k, lab = connected_components(A, directed=False)
    tp = (P - wrist) @ a0
    rp = np.linalg.norm(P - wrist - tp[:, None] * a0, axis=1)
    palm = (tp > 0.2 * L0) & (tp < 0.65 * L0) & (rp < 0.05 * H0)
    if palm.sum() > 30:
        labs, cnt = np.unique(lab[palm], return_counts=True)
        keep = np.isin(lab, labs[cnt >= max(10, 0.03 * palm.sum())])
        P = P[keep]
    # 손 좌표계: a = 손가락 방향, n = 손등 쪽, s = 옆
    tp = (P - wrist) @ a0
    Pm = P[tp > 0.15 * L0]
    if len(Pm) < 50: Pm = P
    mu = Pm.mean(0)
    _, _, Vt = np.linalg.svd(Pm - mu, full_matrices=False)
    # 손가락 방향: 손목 → 가장 먼 점들의 중심 (팔뚝 방향과 섞음). 손이 짧고 넓으면 PCA는 옆으로 틀어짐
    far = P[tp > np.percentile(tp, 96)]
    a = _unit(_unit(far.mean(0) - wrist) * 0.6 + a0 * 0.4)
    out = np.array([-1.0 if side == 'R' else 1.0, 0, 0])
    nref = np.array([0, 0, 1.0]) + 0.6 * out
    n = Vt[2] - a * (Vt[2] @ a); n = _unit(n) * np.sign(_unit(n) @ nref)
    s = _unit(np.cross(n, a))
    tP = (P - wrist) @ a; sP = (P - wrist) @ s; nP = (P - wrist) @ n
    tmax = np.percentile(tP, 99.9)
    Lh = tmax
    spacing = np.sqrt(area / len(P))
    eps = max(spacing * 2.6, 0.0007 * H0)
    step = Lh / 90
    tracks = []
    tc = tmax - step * 0.5
    while tc > 0.1 * Lh:
        band = np.abs(tP - tc) < step * 0.65
        Q = np.stack([sP[band], nP[band]], 1)
        cl = clusters2d(Q, eps, 10)
        alive = [tr for tr in tracks if tr['alive']]
        claim = {}
        info = []
        for ci, c in enumerate(cl):
            cen = c.mean(0); wid = np.ptp(c[:, 0]); hgt = np.ptp(c[:, 1])
            tree = cKDTree(c)
            m = [tr for tr in alive if tree.query(tr['last'])[0] < max(eps * 3, 0.006 * H0)]
            info.append((c, cen, wid, hgt, m))
            for tr in m: claim.setdefault(id(tr), []).append(ci)
        for ci, (c, cen, wid, hgt, m) in enumerate(info):
            if not m:
                tracks.append({'pts': [(tc, cen)], 'last': cen, 'alive': True, 'start': tc, 'end': tc, 'w': [wid], 'miss': 0})
            elif len(m) == 1 and len(claim[id(m[0])]) == 1:
                tr = m[0]; medw = np.median(tr['w'])
                if len(tr['w']) > 4 and wid > medw * 2.0 + eps * 2:
                    tr['alive'] = False  # 갑자기 넓어짐 = 손바닥에 붙음
                    tracks.append({'pts': [(tc, cen)], 'last': cen, 'alive': True, 'start': tc, 'end': tc, 'w': [wid], 'miss': 0, 'palm': True})
                else:
                    tr['pts'].append((tc, cen)); tr['last'] = cen; tr['end'] = tc; tr['w'].append(wid); tr['miss'] = 0
            else:
                for tr in m: tr['alive'] = False  # 합쳐짐
                tracks.append({'pts': [(tc, cen)], 'last': cen, 'alive': True, 'start': tc, 'end': tc, 'w': [wid], 'miss': 0, 'palm': True})
        hit = set(id(tr) for (_, _, _, _, m) in info for tr in m)
        for tr in alive:
            if id(tr) not in hit:
                tr['miss'] += 1
                if tr['miss'] > 2: tr['alive'] = False
        tc -= step
    # 손가락 후보: 끝에서 시작해 충분히 길고 가는 것
    handW = np.ptp(sP[(tP > 0.3 * Lh) & (tP < 0.6 * Lh)]) if np.any((tP > 0.3 * Lh) & (tP < 0.6 * Lh)) else 0.05 * H0
    cands = []
    for tr in tracks:
        ln = tr['start'] - tr['end']
        if tr.get('palm'): continue
        if ln < 0.1 * Lh or len(tr['pts']) < 6: continue
        if np.median(tr['w']) > 0.45 * handW: continue
        cands.append(tr)
    diag = {'Lh': Lh, 'eps': eps, 'handW': handW, 'ncand': len(cands), 'tracks': len(tracks), 'frame': (a, n, s)}
    if debug: diag['cands'] = cands
    to3 = lambda tc, c: wrist + a * tc + s * c[0] + n * c[1]
    ts = 1.0 if side == 'R' else -1.0   # 손바닥이 아래일 때 엄지는 R: +s, L: -s
    res, filled = {}, []
    meanS = lambda tr: float(np.mean([c[0] for _, c in tr['pts']]))
    # ── 엄지: 추적 결과 중 엄지 쪽 끝 + 끝이 낮은 것. 아니면 엄지 쪽 바깥 점들로 직접 찾기
    thumb_tr = None
    if cands:
        side_c = max(cands, key=lambda tr: ts * meanS(tr))
        others = [c for c in cands if c is not side_c]
        if side_c['start'] < 0.78 * Lh and (not others or side_c['start'] < min(o['start'] for o in others) - 0.05 * Lh):
            thumb_tr = side_c
    fing_c = [c for c in cands if c is not thumb_tr]
    # 손가락 구역(끝쪽)의 옆 범위 → 4칸
    fz = (tP > 0.72 * Lh) & (tP < 0.95 * Lh)
    if fz.sum() < 30: fz = tP > 0.6 * Lh
    s0, s1 = np.percentile(sP[fz], 3), np.percentile(sP[fz], 97)
    lanes = [s1 - (i + 0.5) / 4 * (s1 - s0) if ts > 0 else s0 + (i + 0.5) / 4 * (s1 - s0) for i in range(4)]  # 엄지 쪽(검지)부터
    laneW = (s1 - s0) / 4
    # 찾은 손가락을 가까운 칸에 배정
    assign = {}
    for tr in sorted(fing_c, key=lambda tr: -(tr['start'] - tr['end'])):
        ms = meanS(tr); i = int(np.argmin([abs(ms - l) for l in lanes]))
        if i in assign or abs(ms - lanes[i]) > laneW * 0.75: continue
        assign[i] = tr
    tips = {}
    for i in range(4):
        sel = (np.abs(sP - lanes[i]) < laneW * 0.4) & (tP > 0.45 * Lh)
        tips[i] = np.percentile(tP[sel], 99.5) if sel.sum() > 20 else 0.92 * Lh
    Lmid = max(tips.values())
    RATIO = {'index': 0.43, 'middle': 0.46, 'ring': 0.44, 'pinky': 0.36}
    for i, nm in enumerate(NAMES):
        tr = assign.get(i)
        if tr is not None:
            pts = np.array([to3(tc, c) for tc, c in tr['pts']])[::-1]  # 물갈퀴 → 끝
            seg = np.linalg.norm(np.diff(pts, axis=0), axis=1); vis = seg.sum()
            Lf = max(RATIO[nm] * Lmid, vis * 1.33)
            d0 = _unit(_unit(pts[min(5, len(pts) - 1)] - pts[0]) * 0.5 + a * 0.5)
            if vis < Lf: full = np.vstack([pts[0] - d0 * (Lf - vis), pts])
            else:
                cum = np.concatenate([[0], np.cumsum(seg[::-1])]); kk = np.searchsorted(cum, Lf); full = pts[max(0, len(pts) - 1 - kk):]
            (j0, j1, j2, j3), _ = polyline_at(full, [0, 0.45, 0.73, 1.0])
        else:
            sel = (np.abs(sP - lanes[i]) < laneW * 0.4) & (tP > 0.45 * Lh)
            nn = float(np.median(nP[sel])) if sel.sum() > 20 else 0.0
            tip_t = tips[i]; mcp_t = min(0.52 * Lh, tip_t - RATIO[nm] * Lmid)
            # 굽은 손가락: 칸 안의 점들로 t마다 n 중심을 따라감
            ts_ = np.linspace(mcp_t, tip_t, 8); ctr = []
            for tt in ts_:
                ss = sel | ((np.abs(sP - lanes[i]) < laneW * 0.4) & (np.abs(tP - tt) < Lh * 0.03))
                ss = ss & (np.abs(tP - tt) < Lh * 0.03)
                ctr.append(wrist + a * tt + s * lanes[i] + n * (float(np.median(nP[ss])) if ss.sum() > 8 else nn))
            (j0, j1, j2, j3), _ = polyline_at(np.array(ctr), [0, 0.45, 0.73, 1.0])
            filled.append(nm)
        res[nm] = [j0, j1, j2, j3]
    # 엄지
    cmc_ref = wrist + a * (0.08 * Lh) + s * (ts * 0.22 * handW) - n * (0.15 * handW)
    if thumb_tr is not None:
        pts = np.array([to3(tc, c) for tc, c in thumb_tr['pts']])[::-1]
        vis = np.linalg.norm(np.diff(pts, axis=0), axis=1).sum()
        d0 = _unit(pts[min(4, len(pts) - 1)] - pts[0])
        mcp = pts[0] - d0 * vis * 0.12
        cmc = mcp + (cmc_ref - mcp) * 0.7
        (m0, ip, tip), _ = polyline_at(np.vstack([mcp, pts]), [0, 0.5, 1.0])
        # 보정(전문 리그와 비교해 맞춤): 엄지 관절은 표면 중심선보다 손목·손바닥 쪽에 있음
        cmc = cmc - a * 0.035 * Lh + n * 0.07 * Lh
        m0 = m0 - a * 0.08 * Lh + n * 0.04 * Lh - s * ts * 0.07 * Lh
        ip = ip - a * 0.04 * Lh + n * 0.02 * Lh - s * ts * 0.03 * Lh
        res['thumb'] = [cmc, m0, ip, tip]
    else:
        edge = np.percentile(ts * sP[fz], 97)
        tz = (ts * sP > edge + 0.04 * handW) & (tP < 0.75 * Lh)
        if tz.sum() > 200:
            Tp = P[tz]; mu = Tp.mean(0)
            _, _, vt = np.linalg.svd(Tp - mu, full_matrices=False); ax = vt[0]
            pr = (Tp - mu) @ ax
            e1, e2 = mu + ax * np.percentile(pr, 98), mu + ax * np.percentile(pr, 2)
            # 손목 쪽 끝 = 밑동, 반대 = 끝
            base, tip = (e1, e2) if np.linalg.norm(e1 - cmc_ref) < np.linalg.norm(e2 - cmc_ref) else (e2, e1)
            mcp = base + (tip - base) * 0.1
            cmc = mcp + (cmc_ref - mcp) * 0.6
            res['thumb'] = [cmc, mcp, mcp + (tip - mcp) * 0.5, tip]
            diag['thumbRegion'] = int(tz.sum())
        else:
            si = s1 if ts > 0 else s0
            mcp = wrist + a * (0.35 * Lh) + s * (si + ts * 0.05 * handW) - n * (0.2 * handW)
            tip = wrist + a * (0.62 * Lh) + s * (si + ts * 0.2 * handW) - n * (0.3 * handW)
            res['thumb'] = [cmc_ref, mcp, mcp + (tip - mcp) * 0.5, tip]
            filled.append('thumb')
    diag['found'] = len(assign) + (1 if thumb_tr is not None else 0)
    diag['filled'] = filled
    diag['P'] = P if debug else None
    return res, diag
