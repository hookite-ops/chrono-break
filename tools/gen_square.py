"""정지된 광장 v2 — 맵 데이터 생성기

경험 목표:
  폭발이 터지던 순간에 굳은 광장. 거점은 한 단 높은 분수 무대라 올라서면 잘 보이지만 노출된다.
  무대를 공중에 멈춘 잔해 발판 네 개가 둘러싸고 있어, 발판을 먼저 잡은 팀이 무대를 누른다.
  발판은 바깥쪽 계단으로 오르고, 숙련자는 상자를 밟아 안쪽에서 바로 뛰어오른다.
  광장 밖은 카페 거리(왼쪽, 2층 발코니)와 시계점 골목(오른쪽, 지붕 길)으로 갈린다.
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
    return n * step_d


def half(s):
    zf = lambda z: z * s
    dz = lambda d: d if s > 0 else {'+z': '-z', '-z': '+z'}.get(d, d)
    # 출발 구역 x -20..20, z 64..78 — 문 3개 x[-15,-9], [-3,3], [9,15]
    box(-17.5, zf(64), 5, 1.2, 6, tag='wallP'); box(17.5, zf(64), 5, 1.2, 6, tag='wallF')
    box(-6, zf(64), 6, 1.2, 6, tag='wallP'); box(6, zf(64), 6, 1.2, 6, tag='wallF')
    box(-20.6, zf(71), 1.2, 14, 8, tag='wallP'); box(20.6, zf(71), 1.2, 14, 8, tag='wallF')
    box(-34.5, zf(71), 27, 14, 10, tag='bldP'); box(34.5, zf(71), 27, 14, 10, tag='bldF')
    box(0, zf(74), 3, 3, 1.2, tag='crate')
    # 접근로 블록(길 사이 건물) — 가운데 대로 x -8..8
    box(-15, zf(46), 12, 18, 7, tag='bldP'); box(15, zf(46), 12, 18, 7.5, tag='bldF')
    # 대로: 공중에 멈춘 버스(엄폐), 가판대
    box(0, zf(45), 3, 9, 3.2, tag='bus')
    box(-5.5, zf(56), 1.2, 3, 1.2, tag='low'); box(5, zf(34), 2.4, 2.4, 1.2, tag='crate'); box(-4.5, zf(30), 3, 1.2, 1.2, tag='low')
    # 왼쪽: 카페 거리 x -46..-21 + 2층 발코니(높이 3.4, 바깥벽 따라 z 26..52)
    box(-43.5, zf(39), 5, 26, 3.4, tag='walkP')
    box(-40.8, zf(39), 0.5, 26, 1.0, y=3.4, tag='parapet')
    stairs(-43.5, zf(52 + 9 * 0.7), 5, 3.4, dz('-z'), step_h=0.38, tag='stairs')
    box(-31, zf(52), 2.4, 4, 1.2, tag='stall'); box(-27, zf(38), 4, 2.4, 1.2, tag='stall'); box(-33, zf(28), 2.4, 2.4, 1.2, tag='crate')
    # 오른쪽: 시계점 골목 x 21..46 + 지붕 길(높이 2.8, 2단 계단) — 거점 쪽으로 내려오는 잔해 비탈
    box(41, zf(36), 10, 16, 2.8, tag='roofF')
    stairs(38, zf(44 + 7 * 0.7), 4, 2.8, dz('-z'), tag='stairs')
    stairs(44, zf(28 - 7 * 0.9), 4, 2.8, dz('+z'), step_d=0.9, tag='rubble')  # 거점 쪽 끝: 잔해 비탈로 내려옴
    box(28, zf(50), 2.4, 2.4, 1.3, tag='crate'); box(31, zf(30), 1.2, 4, 1.2, tag='low')
    # 광장 바깥 고리 엄폐
    box(-24, zf(20), 4, 1.2, 1.2, tag='low'); box(24, zf(20), 4, 1.2, 1.2, tag='low')
    box(-37, zf(12), 3, 3, 1.4, tag='crate'); box(37, zf(14), 3, 5, 2.0, tag='rubbleBlk')
    # 공중 잔해 발판 두 개(팀 쪽 대각선): 높이 3.0, 바깥 계단 + 안쪽 상자 숙련 루트
    for sx in (-1, 1):
        box(sx * 14, zf(12), 8, 7, 3.0, tag='float')
        box(sx * 10.3, zf(12), 0.6, 4, 1.0, y=3.0, tag='parapet')
        stairs(sx * 16, zf(15.5 + 8 * 0.7), 3, 3.0, dz('-z'), step_h=0.38, tag='stairs')
        box(sx * 9.4, zf(9.2), 1.4, 1.4, 1.1, tag='crate'); box(sx * 9.6, zf(10.8), 1.2, 1.2, 2.2, tag='crate')
    # 시야 끊기: 무너진 벽 조각·멈춘 가로등(광장 바깥 고리)
    box(-10, zf(25), 4.5, 1.2, 4.5, tag='wallChunk'); box(11, zf(27), 1.2, 4, 4.0, tag='wallChunk')
    box(-30, zf(21), 1.2, 5, 4.0, tag='wallChunk'); box(30, zf(23), 5, 1.2, 4.2, tag='wallChunk')
    box(-23, zf(7), 1.0, 1.0, 5.0, tag='post'); box(24, zf(8), 1.0, 1.0, 5.0, tag='post')
    box(-6, zf(36), 1.0, 1.0, 5.0, tag='post'); box(7, zf(58), 1.0, 1.0, 5.0, tag='post')
    # 대로 끝 낮은 벽(무대 앞 엄폐) — 엇갈리게
    box(-3.5 * s, zf(17), 4, 1.0, 1.2, tag='low')


half(1)
half(-1)
# 거점: 분수 무대(두 단) + 가운데 분수대 + 기둥
S.append(dict(type='cyl', x=0, z=0, r=8.4, h=0.5, tag='plaza'))
S.append(dict(type='cyl', x=0, z=0, r=7.2, h=1.0, tag='stage'))
S.append(dict(type='cyl', x=0, z=0, r=1.8, h=1.0, y=1.0, tag='fountain'))
for sx in (-1, 1):
    box(sx * 5, 0, 1.4, 1.4, 3.6, y=1.0, tag='pillar')
    for sz in (-1, 1): box(sx * 3.4, sz * 4.4, 2.4, 0.8, 1.1, y=1.0, tag='low')
# 광장 옆: 좌우 잔해 발판(가운데, 높이 2.0) — 양 팀 공용
box(-17, 0, 5, 6, 2.0, tag='float'); stairs(-19.5 - 5 * 0.7 + 0.0, 0, 3, 2.0, '+x', tag='stairs')
box(17, 0, 5, 6, 2.0, tag='float'); stairs(19.5 + 5 * 0.7, 0, 3, 2.0, '-x', tag='stairs')
box(-36, 0, 2.4, 6, 1.2, tag='low'); box(36, 0, 3, 3, 1.6, tag='rubbleBlk')
box(-29, 0, 1.2, 5, 4.2, tag='wallChunk'); box(28, 0, 1.2, 4, 4.2, tag='wallChunk')

M = {
    'name': '정지된 광장', 'concept': '한 단 높은 분수 무대(거점)를 공중에 멈춘 잔해 발판들이 둘러싼다. 발판을 먼저 잡은 팀이 무대를 누른다.',
    'bounds': {'x': [-48, 48], 'z': [-78, 78]}, 'walls': {'height': 10, 'thickness': 2},
    'metrics': {'player_radius': 0.4, 'eye_height': 1.62, 'step_height': 0.5, 'jump_height': 1.2, 'jump_distance': 3.9,
                'run_speed': 5.6, 'weapon_range': 35, 'cover_height': 1.2, 'cover_reach': 3},
    'targets': {'cover_min': 0.45, 'long_sight_frac_max': 0.12},
    'style': {'floor': '#d9d4d0', 'tiers': ['#cfc6c2', '#b6aaa6', '#958a88', '#6d6466'], 'accent': '#ff8a2a'},
    'solids': S,
    'spawns': [{'x': 0, 'z': 71, 'team': 'A'}, {'x': 0, 'z': -71, 'team': 'B'}],
    'objectives': [{'x': 0, 'z': 0, 'r': 7, 'label': '분수 무대'}],
    'pickups': [{'x': x, 'z': z * s, 'label': '회복'} for s in (1, -1) for (x, z) in [(-33, 44), (33, 40), (-14, 12)]] + [{'x': -17, 'z': 0, 'label': '회복'}, {'x': 30, 'z': 0, 'label': '회복'}],
    'zones': [
        {'x': 0, 'z': 0, 'r': 8, 'label': '분수 무대(거점)', 'role': '목표 · 높고 노출됨'},
        {'x': 14, 'z': 12, 'r': 5, 'label': '잔해 발판', 'role': '무대를 누르는 고지(4개)'},
        {'x': -43, 'z': 39, 'r': 6, 'label': '카페 2층 발코니', 'role': '왼쪽 길 위층'},
        {'x': 41, 'z': 36, 'r': 6, 'label': '시계점 지붕 길', 'role': '오른쪽 길 위층 · 거점으로 내려옴'},
        {'x': 0, 'z': 45, 'r': 5, 'label': '멈춘 버스', 'role': '대로 가운데 엄폐'},
    ],
}
json.dump(M, open(sys.argv[1], 'w'), ensure_ascii=False, indent=1)
print('solids', len(S))
