"""경계 시장 v2 — 맵 데이터 생성기 (map-designer 형식)

경험 목표:
  거점(광장)은 가운데 낮은 곳이라 사방에서 내려다보인다. 왼쪽(현재) 시장 쪽에는 거점 바로 옆
  테라스가 있어 가까운 높이 싸움이, 오른쪽(미래) 폐허에는 맵 끝까지 이어진 고가도로가 있어
  멀리서 견제하고 돌아 들어가는 길이 생긴다. 가운데 길은 가장 짧지만 아치 문 두 개로 좁아진다.
  두 팀은 z축 거울 대칭(파랑 +z, 빨강 -z).
python3 gen_market.py out.json
"""
import json, sys

S = []     # solids
DECO = []  # 장식(충돌 없음): 게임 쪽에서 그림


def box(x, z, w, d, h, y=0.0, tag='block'):
    S.append(dict(type='box', x=x, z=z, w=w, d=d, h=h, y=y, tag=tag))


def stairs(x, z, width, rise, direction, y0=0.0, step_h=0.4, step_d=0.7, tag='stairs'):
    """(x, z)에서 시작해 direction 쪽으로 올라가는 계단. 칸마다 바닥부터 꽉 찬 상자(2.5D)."""
    n = max(1, round(rise / step_h))
    for i in range(n):
        top = y0 + (i + 1) * rise / n
        off = (i + 0.5) * step_d
        if direction == '+z': box(x, z + off, width, step_d, top, tag=tag)
        elif direction == '-z': box(x, z - off, width, step_d, top, tag=tag)
        elif direction == '+x': box(x + off, z, step_d, width, top, tag=tag)
        else: box(x - off, z, step_d, width, top, tag=tag)
    return n * step_d


def half(s):
    """s=+1 파랑 쪽, -1 빨강 쪽(z 뒤집기). 계단 방향도 뒤집는다."""
    zf = lambda z: z * s
    dz = lambda d: d if s > 0 else {'+z': '-z', '-z': '+z'}.get(d, d)

    # ---------------- 출발 구역: x -22..22, z 74..90, 문 3개
    box(-19, zf(74), 6, 1.2, 6, tag='wallP')
    box(19, zf(74), 6, 1.2, 6, tag='wallF')
    box(-7, zf(74), 6, 1.2, 6, tag='wallP')      # 문: x[-16,-10], [-4,4], [10,16]
    box(7, zf(74), 6, 1.2, 6, tag='wallF')
    box(-22.6, zf(82), 1.2, 16, 8, tag='wallP'); box(22.6, zf(82), 1.2, 16, 8, tag='wallF')
    box(-39.5, zf(82), 33, 16, 11, tag='bldP'); box(39.5, zf(82), 33, 16, 10, tag='bldF')
    box(-12, zf(85), 3, 3, 1.2, tag='crate'); box(12, zf(85), 3, 3, 1.2, tag='crate')

    # ---------------- 중간 건물 덩어리(길 사이 벽) — 가운데에 골목(z 49..54)
    box(-18, zf(42.5), 12, 13, 7.5, tag='bldP'); box(-18, zf(61.5), 12, 15, 8, tag='bldP')
    box(18, zf(42.5), 12, 13, 6.5, tag='bldF'); box(18, zf(61.5), 12, 15, 7, tag='bldF')

    # ---------------- 가운데 길: 아치(z 30..33) — 문 두 개 x[-9,-4], [4,9]
    box(-11.5, zf(31.5), 5, 3, 7, tag='arch'); box(0, zf(31.5), 8, 3, 7, tag='arch'); box(11.5, zf(31.5), 5, 3, 7, tag='arch')
    box(0, zf(31.5), 23, 3, 1.2, y=7, tag='archTop')
    # 아치 앞뒤 엄폐
    box(-6.5, zf(40), 3, 1.2, 1.2, tag='low'); box(6.5, zf(44), 1.2, 3, 1.2, tag='low')
    box(0, zf(52), 2.4, 2.4, 1.1, tag='crate'); box(-5, zf(62), 1.2, 4, 1.2, tag='low'); box(5, zf(64), 2.4, 2.4, 1.2, tag='crate')
    # 아치 너머 접근로: 팀 쪽 작은 고지(z 14..19) — 뒤쪽 계단
    for sx in (-1, 1):
        box(sx * 10, zf(16.5), 8, 5, 2.0, tag='ledge')
        box(sx * 13.6, zf(14.3), 0.8, 0.6, 1.0, y=2.0, tag='parapet')
        box(sx * 8, zf(14.3), 4, 0.6, 1.0, y=2.0, tag='parapet')
        stairs(sx * 10, zf(19 + 5 * 0.7), 3, 2.0, dz('-z'), tag='stairs')

    # ---------------- 왼쪽(현재) 시장 골목 x -54..-24
    for z in (70, 60, 50, 40, 30):
        box(-51.5, zf(z), 3, 5, 1.1, tag='stall')
    box(-36, zf(64), 4, 2.4, 1.2, tag='stall'); box(-40, zf(49), 2.4, 4, 1.2, tag='stall'); box(-33, zf(38), 4, 2.4, 1.2, tag='stall')
    box(-44, zf(56), 1.2, 1.2, 2.2, tag='crate')
    # 시장 2층 회랑: 바깥벽을 따라 z 36..62, 높이 3.2, 폭 4 (계단 두 개)
    box(-52, zf(49), 4, 22, 3.2, tag='walkP')
    box(-49.8, zf(49), 0.4, 22, 1.0, y=3.2, tag='parapet')
    stairs(-52, zf(60 + 8 * 0.7) , 4, 3.2, dz('-z'), tag='stairs')  # 뒤쪽(출발 쪽)에서 올라감
    # 거점 옆 테라스: x -34..-18, z 7..22, 높이 3.6
    box(-26, zf(14.5), 16, 15, 3.6, tag='terrace')
    box(-18.6, zf(10), 0.6, 5, 1.0, y=3.6, tag='parapet'); box(-18.6, zf(19.5), 0.6, 4, 1.0, y=3.6, tag='parapet')
    box(-26, zf(7.3), 4, 0.6, 1.0, y=3.6, tag='parapet')
    box(-30, zf(17), 2, 2, 1.2, y=3.6, tag='crate')
    stairs(-31, zf(22 + 9 * 0.7), 4, 3.6, dz('-z'), tag='stairs')      # 테라스 뒤 계단(시장 쪽)
    # 숙련 루트: 거점 쪽 상자 계단(점프로만)
    box(-16.6, zf(13), 1.6, 1.6, 1.1, tag='crate'); box(-17.4, zf(15), 1.4, 1.4, 2.2, tag='crate'); box(-17.6, zf(16.8), 1.2, 1.2, 3.1, tag='crate')
    # 시장 쪽 건물 정면(테라스 바깥)
    box(-46, zf(14), 12, 10, 7, tag='bldP')
    box(-40, zf(28), 2.4, 2.4, 1.2, tag='crate'); box(-27, zf(32), 4, 1.2, 1.2, tag='low')

    # ---------------- 오른쪽(미래) 폐허 x 24..54
    # 고가도로: x 30..36, 높이 4.2, z 16..54 / 가운데 무너진 구간은 잔해 계단으로 내려옴
    box(33, zf(35), 6, 38, 4.2, tag='overpass')
    box(30.2, zf(35), 0.4, 38, 1.0, y=4.2, tag='rail'); box(35.8, zf(35), 0.4, 38, 1.0, y=4.2, tag='rail')
    box(33, zf(28), 2, 2, 1.2, y=4.2, tag='crate'); box(33, zf(44), 2.4, 1.2, 1.2, y=4.2, tag='low')
    stairs(33, zf(54 + 11 * 0.7), 4, 4.2, dz('-z'), step_h=0.38, tag='stairs')   # 출발 쪽 끝 계단
    stairs(33, zf(5.6), 5, 4.2, dz('+z'), step_h=0.38, step_d=0.95, tag='rubble') # 무너진 끝: 잔해 비탈(가운데로 내려옴)
    # 고가 안쪽 길(x 14..30): 연구소 폐허 — 중간 높이 2.4 (계단식 잔해)
    box(19, zf(14), 10, 12, 2.4, tag='ruin')
    stairs(19, zf(20 + 6 * 0.7), 4, 2.4, dz('-z'), tag='rubble')
    box(14.4, zf(10), 0.6, 4, 1.0, y=2.4, tag='parapet')
    box(26, zf(26), 2.4, 2.4, 1.3, tag='crate'); box(21, zf(32), 4, 1.2, 1.2, tag='low')
    # 고가 바깥 골목(x 36..54): 잔해 더미와 쓰러진 벽
    for (x, z, w, d, h) in [(45, 66, 5, 4, 1.4), (40, 50, 3, 5, 2.0), (49, 40, 4, 6, 1.2), (42, 26, 4, 3, 1.6), (48, 12, 5, 4, 2.2), (40, 4, 3, 3, 1.2)]:
        box(x, zf(z), w, d, h, tag='rubbleBlk')
    box(52.5, zf(32), 3, 20, 2.8, tag='walkF')
    stairs(52.5, zf(42 + 7 * 0.7), 3, 2.8, dz('-z'), tag='stairs')
    box(46, zf(58), 1.2, 6, 2.8, tag='wallF')


half(1)
half(-1)

# ---------------- 가운데: 거점 광장(지름 19, 0.4 높이) + 엄폐
S.append(dict(type='cyl', x=0, z=0, r=9.5, h=0.4, tag='plaza'))
box(0, 0, 2.6, 2.6, 3.2, y=0.4, tag='core')          # 코어 받침(가운데 엄폐)
for sx in (-1, 1):
    box(sx * 6.5, 0, 1.6, 1.6, 4.0, y=0.4, tag='pillar')
    for sz in (-1, 1):
        box(sx * 4.6, sz * 5.4, 2.6, 0.9, 1.2, y=0.4, tag='low')
        box(sx * 5.9, sz * 4.2, 0.9, 1.6, 1.2, y=0.4, tag='low')
# 광장 옆 연결로(z -6..6): 왼쪽 시장 ↔ 거점, 오른쪽 폐허 ↔ 거점
box(-40, 0, 2.4, 2.4, 1.2, tag='crate'); box(-46, 0, 4, 1.2, 1.2, tag='stall')
box(42, 0, 3, 3, 1.6, tag='rubbleBlk'); box(22, 0, 1.2, 4, 1.2, tag='low')

M = {
    'name': '경계 시장', 'concept': '낮은 광장 거점을 왼쪽 테라스와 오른쪽 고가도로가 내려다본다. 가운데 길은 짧지만 아치로 좁고, 양옆은 길지만 높은 곳을 준다.',
    'bounds': {'x': [-56, 56], 'z': [-90, 90]}, 'walls': {'height': 10, 'thickness': 2},
    'metrics': {'player_radius': 0.4, 'eye_height': 1.62, 'step_height': 0.5, 'jump_height': 1.2, 'jump_distance': 3.9,
                'run_speed': 5.6, 'weapon_range': 35, 'cover_height': 1.2, 'cover_reach': 3},
    'targets': {'cover_min': 0.45, 'long_sight_frac_max': 0.12},
    'style': {'floor': '#d9d4d0', 'tiers': ['#cfc6c2', '#b6aaa6', '#958a88', '#6d6466'], 'accent': '#ff8a2a'},
    'solids': [s for s in S],
    'spawns': [{'x': 0, 'z': 82, 'team': 'A'}, {'x': 0, 'z': -82, 'team': 'B'}],
    'objectives': [{'x': 0, 'z': 0, 'r': 8, 'label': '거점 A'}],
    'pickups': [{'x': x, 'z': z * s, 'label': '회복'} for s in (1, -1) for (x, z) in [(-40, 44), (-26, 12), (45, 32), (19, 14)]] + [{'x': -46, 'z': 6, 'label': '회복'}, {'x': 46, 'z': -6, 'label': '회복'}],
    'zones': [
        {'x': 0, 'z': 0, 'r': 9, 'label': '시계탑 광장(거점)', 'role': '목표 · 낮고 노출됨'},
        {'x': -26, 'z': 14, 'r': 8, 'label': '시장 테라스', 'role': '거점을 바로 내려다보는 가까운 고지'},
        {'x': 33, 'z': 35, 'r': 6, 'label': '고가도로', 'role': '멀리서 견제 · 돌아 들어가는 길'},
        {'x': 0, 'z': 31, 'r': 5, 'label': '아치 문', 'role': '가장 짧지만 좁은 길'},
        {'x': -44, 'z': 49, 'r': 6, 'label': '시장 2층 회랑', 'role': '왼쪽 길 위층'},
        {'x': 19, 'z': 14, 'r': 6, 'label': '연구소 폐허', 'role': '중간 높이 · 엄폐'},
    ],
}
json.dump(M, open(sys.argv[1], 'w'), ensure_ascii=False, indent=1)
print('solids', len(M['solids']))
