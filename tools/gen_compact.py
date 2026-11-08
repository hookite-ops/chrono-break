"""경계 시장 (컴팩트) — 작고 빠른 거점전 맵

경험 목표:
  출발에서 8초면 싸움이 시작된다. 거점(낮은 광장)을 왼쪽 테라스와 오른쪽 고가도로가 바로 옆에서
  내려다보고, 가운데 길은 아치로 좁아진다. 길은 세 갈래뿐이라 헷갈리지 않는다.
  두 팀은 z축 거울 대칭(파랑 +z, 빨강 -z).
"""
import json, sys
S = []


def box(x, z, w, d, h, y=0.0, tag='block'):
    S.append(dict(type='box', x=x, z=z, w=w, d=d, h=h, y=y, tag=tag))


def stairs(x, z, width, rise, direction, step_h=0.4, step_d=0.7, tag='stairs'):
    n = max(1, round(rise / step_h))
    for i in range(n):
        top = (i + 1) * rise / n; off = (i + 0.5) * step_d
        if direction == '+z': box(x, z + off, width, step_d, top, tag=tag)
        elif direction == '-z': box(x, z - off, width, step_d, top, tag=tag)
        elif direction == '+x': box(x + off, z, step_d, width, top, tag=tag)
        else: box(x - off, z, step_d, width, top, tag=tag)


def half(s):
    zf = lambda z: z * s
    dz = lambda d: d if s > 0 else {'+z': '-z', '-z': '+z'}.get(d, d)
    # 출발 구역 x -14..14, z 42..50 — 문 3개 x[-12,-8], [-2.5,2.5], [8,12]
    box(-13, zf(42), 2, 1, 5, tag='wallP'); box(13, zf(42), 2, 1, 5, tag='wallF')
    box(-5.25, zf(42), 5.5, 1, 5, tag='wallP'); box(5.25, zf(42), 5.5, 1, 5, tag='wallF')
    box(-14.5, zf(46), 1, 8, 7, tag='wallP'); box(14.5, zf(46), 1, 8, 7, tag='wallF')
    box(-25, zf(46), 20, 8, 9, tag='bldP'); box(25, zf(46), 20, 8, 8, tag='bldF')
    # 길 사이 건물(z 20..38) — 가운데 골목 z 28..31
    box(-13, zf(24), 8, 8, 7, tag='bldP'); box(-13, zf(34.5), 8, 7, 7.5, tag='bldP')
    box(13, zf(24), 8, 8, 6.5, tag='bldF'); box(13, zf(34.5), 8, 7, 7, tag='bldF')
    # 가운데: 아치(z 18.5..20) — 문 x[-6.5,-2.5], [2.5,6.5]
    box(-8, zf(19.25), 3, 1.5, 6.5, tag='arch'); box(0, zf(19.25), 5, 1.5, 6.5, tag='arch'); box(8, zf(19.25), 3, 1.5, 6.5, tag='arch')
    box(0, zf(19.25), 19, 1.5, 1, y=6.5, tag='archTop')
    box(-3, zf(30), 2.4, 1.2, 1.2, tag='low'); box(3.5, zf(35), 1.8, 1.8, 1.2, tag='crate')
    # 아치 안쪽 엄폐
    box(-4.5, zf(13), 2.6, 0.9, 1.2, tag='low'); box(5, zf(14), 1.6, 1.6, 1.3, tag='crate')
    # 왼쪽(현재) 시장: 노점 + 거점 옆 테라스(높이 3.2)
    box(-31.5, zf(36), 3, 4, 1.1, tag='stall'); box(-31.5, zf(27), 3, 4, 1.1, tag='stall'); box(-24, zf(31), 2.4, 2.4, 1.2, tag='stall')
    box(-25, zf(9.5), 12, 9, 3.2, tag='terrace')
    box(-18.7, zf(7), 0.6, 4, 1.0, y=3.2, tag='parapet'); box(-18.7, zf(12.5), 0.6, 2.5, 1.0, y=3.2, tag='parapet')
    box(-27, zf(11), 1.6, 1.6, 1.2, y=3.2, tag='crate')
    stairs(-28, zf(14 + 8 * 0.7), 4, 3.2, dz('-z'))
    box(-17.2, zf(6.2), 1.4, 1.4, 1.1, tag='crate'); box(-17.6, zf(8), 1.2, 1.2, 2.2, tag='crate')
    box(-24, zf(20), 3, 1, 1.2, tag='low')
    # 오른쪽(미래) 폐허: 고가도로(높이 3.6, x 22..27, z 7..30) — 뒤쪽 계단, 앞쪽 잔해 비탈
    box(24.5, zf(18.5), 5, 23, 3.6, tag='overpass')
    box(22.2, zf(18.5), 0.4, 23, 1.0, y=3.6, tag='rail')
    box(24.5, zf(22), 1.6, 1.6, 1.2, y=3.6, tag='crate')
    stairs(24.5, zf(30 + 9 * 0.7), 4, 3.6, dz('-z'))
    stairs(24.5, zf(7 - 9 * 0.7), 4, 3.6, dz('+z'), step_d=0.7, tag='rubble')
    box(31, zf(26), 3, 4, 1.6, tag='rubbleBlk'); box(30.5, zf(12), 3, 3, 1.3, tag='rubbleBlk')
    box(17, zf(12), 1.2, 3.5, 1.2, tag='low')


half(1)
half(-1)
S.append(dict(type='cyl', x=0, z=0, r=8.5, h=0.4, tag='plaza'))
box(0, 0, 2.4, 2.4, 2.8, y=0.4, tag='core')
for sx in (-1, 1):
    box(sx * 5.8, 0, 1.4, 1.4, 3.6, y=0.4, tag='pillar')
    for sz in (-1, 1): box(sx * 3.8, sz * 4.6, 2.4, 0.8, 1.2, y=0.4, tag='low')
box(-30, 0, 2.4, 3, 1.2, tag='stall'); box(31, 0, 2.6, 2.6, 1.5, tag='rubbleBlk')

M = {
    'name': '경계 시장', 'concept': '작고 빠른 거점전. 낮은 광장 거점을 왼쪽 테라스와 오른쪽 고가도로가 내려다본다.',
    'bounds': {'x': [-34, 34], 'z': [-50, 50]}, 'walls': {'height': 10, 'thickness': 2},
    'metrics': {'player_radius': 0.4, 'eye_height': 1.62, 'step_height': 0.5, 'jump_height': 1.2, 'jump_distance': 3.9,
                'run_speed': 5.6, 'weapon_range': 35, 'cover_height': 1.2, 'cover_reach': 3},
    'targets': {'cover_min': 0.45, 'long_sight_frac_max': 0.12},
    'style': {'floor': '#d9d4d0', 'tiers': ['#cfc6c2', '#b6aaa6', '#958a88', '#6d6466'], 'accent': '#ff8a2a'},
    'solids': S,
    'spawns': [{'x': 0, 'z': 46, 'team': 'A'}, {'x': 0, 'z': -46, 'team': 'B'}],
    'objectives': [{'x': 0, 'z': 0, 'r': 7.5, 'label': '거점'}],
    'pickups': [{'x': x, 'z': z * s, 'label': '회복'} for s in (1, -1) for (x, z) in [(-30, 22), (30, 19), (-25, 9)]],
}
json.dump(M, open(sys.argv[1], 'w'), ensure_ascii=False, indent=1)
print('solids', len(S))
