"""CHRONO BREAK 영웅 모델 — 래칫 / 틱 / 루멘 (+ 1인칭 무기).
three.js 좌표로 생각하고 T()로 Blender 좌표로 옮긴다: three(x, y, z) → Blender(x, -z, y). 앞 = three -Z.

관절 노드(GLB): hips > spine > chest > neck > head, chest > sh0/sh1 > el0/el1 > hand0/hand1 > gunMount,
hips > hip0/hip1 > knee0/knee1 > ankle0/ankle1.  0 = 왼쪽(-X), 1 = 오른쪽(+X, 무기 든 손).
무기 GLB: 원점 = 손잡이, 총구 방향 three -Z, 총구 위치 empty "Muzzle".

실행: python3 hero.py hero <ratchet|tick|lumen> <out_dir>
      python3 hero.py weapon <shotgun|pistol|staff> <out_dir>
"""
import math
import sys

sys.path.insert(0, "/mnt/skills/plugins/blender-modeler/scripts")
from bkit import *  # noqa

MODE, NAME, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
T = lambda x, y, z: (x, -z, y)
S = lambda w, h, d: (w, d, h)
D = math.radians

reset()

# ------------------------------------------------------------------ 재질
M = {}


def m(name, color, rough=0.6, metal=0.0, emit=None, es=1.6):
    if name not in M:
        M[name] = mat(name, color, rough, metal, emit=emit, emit_strength=es)
    return M[name]


skin = lambda: m("Skin", "#d9a27e", 0.7)
glowO = lambda: m("GlowOrange", "#ff8a2a", 0.4, emit="#ff8a2a", es=1.8)


# ------------------------------------------------------------------ 무기
def weapon(kind, par=None):
    """원점 = 손잡이. 총구는 three -Z."""
    root = empty("Weapon_" + kind)
    if kind == "shotgun":
        steel = m("Gunmetal", "#3a3f47", 0.4, 0.9)
        teal = m("Teal", "#2f8f94", 0.55, 0.2)
        pink = m("Pink", "#ff3d8a", 0.45)
        orange = m("Stock", "#e8742a", 0.6)
        local(box("Receiver", S(0.09, 0.12, 0.34), loc=T(0, 0.06, -0.08), mat=teal, bevel=0.015), root)
        local(box("RecvStripe", S(0.092, 0.025, 0.2), loc=T(0, 0.09, -0.08), mat=pink, bevel=0.005), root)
        local(cyl("Barrel", r=0.03, h=0.62, seg=20, loc=T(0, 0.09, -0.52), rot=(90, 0, 0), mat=steel, bevel=0.004), root)
        local(cyl("Tube", r=0.025, h=0.5, seg=16, loc=T(0, 0.035, -0.46), rot=(90, 0, 0), mat=steel, bevel=0.004), root)
        local(cyl("Pump", r=0.04, h=0.18, seg=20, loc=T(0, 0.04, -0.4), rot=(90, 0, 0), mat=orange, bevel=0.008), root)
        local(box("Grip", S(0.06, 0.14, 0.07), loc=T(0, -0.04, 0.02), rot=(-15, 0, 0), mat=orange, bevel=0.012), root)
        local(box("Stock", S(0.07, 0.11, 0.3), loc=T(0, 0.02, 0.22), mat=orange, bevel=0.02), root)
        # 앞쪽 충각판(래칫의 상징)
        local(box("RamPlate", S(0.26, 0.24, 0.05), loc=T(0, 0.07, -0.72), mat=teal, bevel=0.02), root)
        local(box("RamEdge", S(0.27, 0.03, 0.055), loc=T(0, 0.18, -0.72), mat=pink, bevel=0.008), root)
        local(box("RamEdgeB", S(0.27, 0.03, 0.055), loc=T(0, -0.04, -0.72), mat=pink, bevel=0.008), root)
        mz = local(empty("Muzzle", loc=T(0, 0.09, -0.84)), root)
    elif kind == "pistol":
        body = m("Graphite", "#2a2d33", 0.45, 0.5)
        lite = m("Silver", "#b8bcc4", 0.35, 0.8)
        local(box("Slide", S(0.045, 0.06, 0.26), loc=T(0, 0.075, -0.07), mat=lite, bevel=0.012), root)
        local(box("Frame", S(0.042, 0.04, 0.2), loc=T(0, 0.035, -0.05), mat=body, bevel=0.01), root)
        local(box("SlideGlow", S(0.047, 0.012, 0.18), loc=T(0, 0.09, -0.07), mat=glowO(), bevel=0.003), root)
        local(cyl("Emitter", r=0.022, h=0.04, seg=16, loc=T(0, 0.075, -0.21), rot=(90, 0, 0), mat=glowO(), bevel=0.004), root)
        local(box("Grip", S(0.04, 0.12, 0.06), loc=T(0, -0.03, 0.01), rot=(-12, 0, 0), mat=body, bevel=0.012), root)
        mz = local(empty("Muzzle", loc=T(0, 0.075, -0.24)), root)
    elif kind == "rifle":  # 오비트 에너지 소총
        g1 = m("Graphite", "#2a2d33", 0.45, 0.5); w = m("PanelW", "#d6d9de", 0.45, 0.2)
        local(box("Body", S(0.08, 0.13, 0.5), loc=T(0, 0.06, -0.12), mat=g1, bevel=0.015), root)
        local(box("Panel", S(0.084, 0.06, 0.3), loc=T(0, 0.09, -0.1), mat=w, bevel=0.01), root)
        local(box("Glow", S(0.086, 0.015, 0.36), loc=T(0, 0.045, -0.12), mat=glowO(), bevel=0.003), root)
        local(cyl("Barrel", r=0.025, h=0.22, seg=14, loc=T(0, 0.08, -0.46), rot=(90, 0, 0), mat=g1, bevel=0.004), root)
        local(cyl("Tip", r=0.03, h=0.04, seg=14, loc=T(0, 0.08, -0.57), rot=(90, 0, 0), mat=glowO(), bevel=0.004), root)
        local(box("Grip", S(0.05, 0.13, 0.06), loc=T(0, -0.04, 0.02), rot=(-15, 0, 0), mat=g1, bevel=0.012), root)
        local(box("Mag", S(0.05, 0.12, 0.08), loc=T(0, -0.02, -0.2), mat=w, bevel=0.01), root)
        local(box("Stock", S(0.06, 0.1, 0.2), loc=T(0, 0.05, 0.2), mat=g1, bevel=0.015), root)
        mz = local(empty("Muzzle", loc=T(0, 0.08, -0.6)), root)
    elif kind == "hammer":  # 녹 전쟁 망치
        wood = m("Wood", "#6b4a2e", 0.8); stone = m("Stone", "#9a948a", 0.85); bronze = m("Bronze", "#b07a3a", 0.4, 0.8)
        local(cyl("Haft", r=0.035, h=1.0, seg=12, loc=T(0, 0, -0.3), rot=(90, 0, 0), mat=wood, bevel=0.005), root)
        local(box("HeadA", S(0.26, 0.24, 0.3), loc=T(-0.16, 0, -0.78), mat=stone, bevel=0.04), root)
        local(box("HeadB", S(0.26, 0.24, 0.3), loc=T(0.16, 0, -0.78), mat=stone, bevel=0.04), root)
        local(box("Core", S(0.12, 0.18, 0.2), loc=T(0, 0, -0.78), mat=bronze, bevel=0.02), root)
        local(cyl("Wrap", r=0.042, h=0.2, seg=12, loc=T(0, 0, 0.02), rot=(90, 0, 0), mat=m("Leather", "#3b2a20", 0.8), bevel=0.005), root)
        mz = local(empty("Muzzle", loc=T(0, 0, -0.78)), root)
    elif kind == "bow":  # 아리아 복합 장궁 (위아래로 긴 활, 화살은 -Z)
        horn = m("Horn", "#3a2c22", 0.6); bronze = m("Bronze", "#b07a3a", 0.4, 0.8); strg = m("String", "#e8d8b0", 0.6)
        arc = [T(0, 0.75 * math.sin(t), 0.18 * math.cos(t) - 0.14) for t in [-1.35 + 2.7 * k / 16 for k in range(17)]]
        local(tube("Limb", arc, r=0.022, mat=horn), root)
        local(box("Riser", S(0.05, 0.22, 0.06), loc=T(0, 0, 0.0), mat=bronze, bevel=0.012), root)
        local(bar("Str", T(0, 0.73, 0.05), T(0, -0.73, 0.05), r=0.004, mat=strg), root)
        local(bar("Arrow", T(0, 0.02, 0.1), T(0, 0.02, -0.55), r=0.008, mat=m("Shaft", "#c9a66b", 0.7)), root)
        local(cone("Head", r=0.02, h=0.07, seg=8, loc=T(0, 0.02, -0.58), rot=(-90, 0, 0), mat=bronze), root)
        mz = local(empty("Muzzle", loc=T(0, 0.02, -0.6)), root)
    elif kind == "launcher":  # 페이즈 유탄발사기
        teal = m("Teal", "#2f8f94", 0.55, 0.2); dark = m("Graphite", "#2a2d33", 0.45, 0.5); brass = m("Brass", "#d9a441", 0.35, 0.9)
        local(cyl("Drum", r=0.1, h=0.2, seg=18, loc=T(0, 0.05, -0.15), rot=(90, 0, 0), mat=teal, bevel=0.015), root)
        for k in range(6):
            a = k * math.pi / 3
            local(cyl(f"Shell{k}", r=0.022, h=0.21, seg=10, loc=T(0.07 * math.cos(a), 0.05 + 0.07 * math.sin(a), -0.15), rot=(90, 0, 0), mat=brass, bevel=0.003), root)
        local(cyl("Barrel", r=0.045, h=0.36, seg=16, loc=T(0, 0.06, -0.42), rot=(90, 0, 0), mat=dark, bevel=0.006), root)
        local(cyl("Mouth", r=0.055, h=0.05, seg=16, loc=T(0, 0.06, -0.6), rot=(90, 0, 0), mat=m("Pink", "#ff3d8a", 0.45), bevel=0.006), root)
        local(box("Grip", S(0.05, 0.13, 0.06), loc=T(0, -0.05, 0.03), rot=(-15, 0, 0), mat=m("Stock", "#e8742a", 0.6), bevel=0.012), root)
        local(box("Stock", S(0.06, 0.09, 0.22), loc=T(0, 0.03, 0.18), mat=dark, bevel=0.015), root)
        mz = local(empty("Muzzle", loc=T(0, 0.06, -0.64)), root)
    elif kind == "medpistol":  # 모라 개조 권총
        body = m("Gunmetal", "#3a3f47", 0.4, 0.9); teal = m("TealGlow", "#35c6c4", 0.3, emit="#35c6c4", es=1.6)
        local(box("Slide", S(0.045, 0.06, 0.24), loc=T(0, 0.075, -0.06), mat=body, bevel=0.012), root)
        local(box("Frame", S(0.042, 0.04, 0.18), loc=T(0, 0.035, -0.04), mat=body, bevel=0.01), root)
        local(cyl("Vial", r=0.022, h=0.1, seg=12, loc=T(0, 0.035, -0.12), rot=(90, 0, 0), mat=teal, bevel=0.004), root)
        local(box("Grip", S(0.04, 0.12, 0.06), loc=T(0, -0.03, 0.01), rot=(-12, 0, 0), mat=m("Graphite", "#2a2d33", 0.45, 0.5), bevel=0.012), root)
        mz = local(empty("Muzzle", loc=T(0, 0.075, -0.19)), root)
    elif kind == "nanorifle":  # 이코 나노 소총
        g1 = m("Graphite", "#2a2d33", 0.45, 0.5); w = m("PanelW", "#c9ccd2", 0.45, 0.2)
        local(box("Body", S(0.07, 0.1, 0.36), loc=T(0, 0.05, -0.08), mat=w, bevel=0.02), root)
        local(box("Top", S(0.05, 0.04, 0.24), loc=T(0, 0.11, -0.08), mat=g1, bevel=0.01), root)
        local(box("Glow", S(0.072, 0.015, 0.26), loc=T(0, 0.03, -0.08), mat=glowO(), bevel=0.003), root)
        local(cyl("Barrel", r=0.022, h=0.14, seg=12, loc=T(0, 0.06, -0.31), rot=(90, 0, 0), mat=g1, bevel=0.004), root)
        local(box("Grip", S(0.045, 0.11, 0.055), loc=T(0, -0.04, 0.02), rot=(-15, 0, 0), mat=g1, bevel=0.012), root)
        mz = local(empty("Muzzle", loc=T(0, 0.06, -0.39)), root)
    else:  # staff
        coat = m("CoatWhite", "#e6e8ec", 0.5)
        dark = m("Graphite", "#2a2d33", 0.45, 0.5)
        local(cyl("Rod", r=0.018, h=1.4, seg=14, loc=T(0, 0, -0.25), rot=(90, 0, 0), mat=coat, bevel=0.004), root)
        local(cyl("RodGlow", r=0.02, h=0.9, seg=14, loc=T(0, 0, -0.3), rot=(90, 0, 0), mat=glowO(), bevel=0.003), root)
        local(cyl("Grip", r=0.026, h=0.16, seg=14, loc=T(0, 0, 0), rot=(90, 0, 0), mat=dark, bevel=0.006), root)
        local(cyl("Head", r=0.04, h=0.12, seg=18, loc=T(0, 0, -0.98), rot=(90, 0, 0), mat=dark, bevel=0.01), root)
        for k in range(3):
            a = k * 2 * math.pi / 3
            local(box(f"Prong{k}", S(0.018, 0.018, 0.12), loc=T(0.045 * math.cos(a), 0.045 * math.sin(a), -1.08), mat=coat, bevel=0.005), root)
        local(sphere("Core", r=0.035, loc=T(0, 0, -1.08), mat=glowO()), root)
        mz = local(empty("Muzzle", loc=T(0, 0, -1.12)), root)
    if par is not None:
        local(root, par)
    return root


if MODE == "weapon":
    stage_begin(OUT, NAME, "1인칭 무기", yaw=210, pitch=15, margin=1.15)
    weapon(NAME)
    stage("완성", "")
    stage_end(NAME + ".glb", stats={"id": NAME})
    raise SystemExit

# ------------------------------------------------------------------ 영웅 정의
H = {
    "ratchet": dict(W=1.32, Hh=1.06, suit="#1f2a44", armor="#2f8f94", accent="#ff3d8a", gun="shotgun",
                    title="래칫", desc="현재 출신 돌파형 탱커. 폭동 진압복, 청록 장갑에 분홍 경고 줄무늬, 충각판 산탄총."),
    "tick": dict(W=0.94, Hh=1.0, suit="#2c2f36", armor="#5b6069", accent="#ff8a2a", gun="pistol",
                 title="틱", desc="미래 출신 침투형 딜러. 회색 스텔스 슈트와 주황 발광선, 주황 바이저, 에너지 쌍권총."),
    "lumen": dict(W=0.92, Hh=1.0, suit="#2a2d33", armor="#e6e8ec", accent="#ff8a2a", gun="staff",
                  title="루멘", desc="미래 출신 치유형 지원가. 밝은 회색 롱코트, 주황 발광선, 떠다니는 빛 구슬, 치유 지팡이."),
    "orbit": dict(W=1.24, Hh=1.04, suit="#2a2d33", armor="#9a9ea6", accent="#ff8a2a", gun="rifle", hair="#d8dbe0",
                  title="오비트", desc="미래 출신 방벽형 탱커. 회색 중장갑과 주황 발광선, 팔 방벽 장치, 에너지 소총."),
    "nok": dict(W=1.36, Hh=1.02, suit="#5a4632", armor="#a0763e", accent="#c9a66b", gun="hammer", hair="#8a8a88",
                title="녹", desc="과거 출신 방벽형 탱커. 청동 투구와 갑옷, 땋은 수염, 등에 진 석판 방패, 돌 전쟁 망치."),
    "aria": dict(W=0.9, Hh=0.98, suit="#6b4a2e", armor="#2f5d3a", accent="#b07a3a", gun="bow", hair="#2b1d16",
                 title="아리아", desc="과거 출신 정밀형 딜러. 초록 두건 망토, 가죽·청동 비늘 갑옷, 긴 땋은 머리, 복합 장궁."),
    "phase": dict(W=0.92, Hh=0.97, suit="#34373d", armor="#1f2a44", accent="#2f8f94", gun="launcher", hair="#ff3d8a",
                  title="페이즈", desc="현재 출신 제압형 딜러. 분홍 머리와 고글, 크롭 재킷, 점착 폭탄 띠, 유탄발사기."),
    "mora": dict(W=0.95, Hh=0.98, suit="#22303a", armor="#2f8f94", accent="#ff3d8a", gun="medpistol", hair="#3b2a20",
                 title="모라", desc="현재 출신 전술형 지원가. 청록 의무 조끼, 헤드셋, 큰 보급 배낭과 안테나, 개조 권총."),
    "iko": dict(W=0.86, Hh=0.9, suit="#2a2d33", armor="#9a9ea6", accent="#ff8a2a", gun="nanorifle", hair="#141418",
                title="이코", desc="미래 출신 치유형 지원가. 큰 회색 후드 점퍼, 주황 끝 트윈테일, 방패 드론, 나노 소총."),
}[NAME]
W, Hh = H["W"], H["Hh"]
suit = m("Suit", H["suit"], 0.75)
armor = m("Armor", H["armor"], 0.5, 0.25)
acc = m("Accent", H["accent"], 0.45, emit=H["accent"] if NAME != "ratchet" else None, es=1.8)
dark = m("Graphite", "#22252b", 0.5, 0.4)
boot = m("Boot", "#3a3d44", 0.65, 0.2)

stage_begin(OUT, H["title"], H["desc"], tags=["CHRONO BREAK", "영웅"], bg="#e7e9ec", yaw=200, pitch=8, fov=30, margin=1.08)

root = empty("Hero_" + NAME)
J = {}


def jnt(name, par, x, y, z):
    e = local(empty(name, loc=T(x, y, z)), par)
    J[name] = e
    return e


def tapered(name, w, h, d, loc, mt, taper=0.82, bev=0.05):
    o = box(name, S(w, h, d), loc=loc, mat=mt, bevel=bev, bevel_seg=3)
    for v in o.data.vertices:
        if v.co.z < 0:
            v.co.x *= taper
    return o


def limb(name, prof, mt, seg=20):
    return lathe(name, prof, seg=seg, mat=mt, smooth=60)


def sp(prof, k):
    return [(r * k, z) for r, z in prof]


hips = jnt("hips", root, 0, 0.92 * Hh, 0)
spine = jnt("spine", hips, 0, 0.09 * Hh, 0)
chest = jnt("chest", spine, 0, 0.19 * Hh, 0)
neck = jnt("neck", chest, 0, 0.34 * Hh, 0)
head = jnt("head", neck, 0, 0, 0)
sh, el, hand, hp, kn, an = [], [], [], [], [], []
for i, s in enumerate((-1, 1)):
    sh.append(jnt(f"sh{i}", chest, s * 0.3 * W, 0.29 * Hh, 0))
    el.append(jnt(f"el{i}", sh[i], 0, -0.28 * Hh, 0))
    hand.append(jnt(f"hand{i}", el[i], 0, -0.26 * Hh, 0))
    hp.append(jnt(f"hip{i}", hips, s * 0.11 * W, -0.04, 0))
    kn.append(jnt(f"knee{i}", hp[i], 0, -0.41 * Hh, 0))
    an.append(jnt(f"ankle{i}", kn[i], 0, -0.37 * Hh, 0))

L = W ** 0.8  # 팔다리 굵기
# ------------------------------------------------------------------ 1. 블록아웃
local(tapered("Pelvis", 0.36 * W, 0.17, 0.23 * W ** 0.5, T(0, 0.02, 0), suit, taper=0.9), hips)
local(tapered("Waist", 0.3 * W, 0.22, 0.2 * W ** 0.5, T(0, 0.09, 0), suit, taper=0.92), spine)
local(tapered("Torso", 0.46 * W, 0.36 * Hh, 0.26 * W ** 0.6, T(0, 0.17 * Hh, 0), suit, taper=0.74, bev=0.07), chest)
local(cyl("Neck", r=0.06 * L, h=0.12, seg=18, loc=T(0, 0.03, 0), mat=skin(), bevel=0.01), neck)
headr = 0.12 if NAME != "ratchet" else 0.125
local(sphere("Head", r=headr, loc=T(0, 0.17, -0.005), scale=S(0.92, 1.08, 1.0), mat=skin()), head)
for i in range(2):
    local(limb(f"UpperArm{i}", sp([(0, 0.01), (0.07, -0.01), (0.066, -0.14), (0.052, -0.27), (0, -0.29)], L), suit), sh[i])
    local(limb(f"Forearm{i}", sp([(0, 0.0), (0.055, -0.02), (0.06, -0.12), (0.046, -0.24), (0, -0.26)], L), suit), el[i])
    local(box(f"Glove{i}", S(0.09 * L, 0.12, 0.11), loc=T(0, -0.055, -0.005), mat=dark, bevel=0.03, bevel_seg=3), hand[i])
    local(limb(f"Thigh{i}", sp([(0, 0.02), (0.095, -0.02), (0.09, -0.2), (0.07, -0.39), (0, -0.42)], L), suit, seg=24), hp[i])
    local(limb(f"Shin{i}", sp([(0, 0.0), (0.068, -0.02), (0.066, -0.16), (0.054, -0.34), (0, -0.37)], L), suit), kn[i])
    local(box(f"Boot{i}", S(0.15 * L, 0.12, 0.27), loc=T(0, -0.06, -0.035), mat=boot, bevel=0.04, bevel_seg=3), an[i])
stage("블록아웃", "관절 위치에 몸통·머리·팔다리를 얹어 체형 비율 확인", clay=True)

# ------------------------------------------------------------------ 2. 영웅별 디테일
eye = m("Eye", "#1a1a1e", 0.3)
for s in (-1, 1):
    local(sphere(f"Eye{s}", r=0.014, loc=T(s * 0.042, 0.185, -0.11), mat=eye), head)
local(box("Brow", S(0.12, 0.015, 0.02), loc=T(0, 0.215, -0.108), mat=m("Hair", H.get("hair") or ("#3b2a20" if NAME == "ratchet" else ("#2b241f" if NAME == "tick" else "#eef0f4")), 0.8)), head)

if NAME == "ratchet":
    hair = M["Hair"]
    local(sphere("HairCap", r=0.126, loc=T(0, 0.225, 0.03), scale=S(0.98, 0.62, 1.02), mat=hair), head)
    local(box("Jaw", S(0.17, 0.08, 0.12), loc=T(0, 0.095, -0.04), mat=skin(), bevel=0.035), head)
    local(box("Grin", S(0.07, 0.012, 0.01), loc=T(0, 0.12, -0.105), mat=m("Teeth", "#f2efe8", 0.4)), head)
    # 흉갑·어깨 장갑
    local(tapered("ChestPlate", 0.5 * W, 0.26, 0.09, T(0, 0.2, -0.14), armor, taper=0.82, bev=0.03), chest)
    local(box("ChestStripe", S(0.4 * W, 0.035, 0.02), loc=T(0, 0.22, -0.19), mat=acc, bevel=0.006), chest)
    local(box("BackPlate", S(0.48 * W, 0.3, 0.08), loc=T(0, 0.18, 0.15), mat=armor, bevel=0.03), chest)
    local(box("Collar", S(0.36 * W, 0.08, 0.28), loc=T(0, 0.33, 0), mat=armor, bevel=0.03), chest)
    for i, s in enumerate((-1, 1)):
        local(box(f"Pauldron{i}", S(0.24, 0.13, 0.26), loc=T(s * 0.05, 0.03, 0), rot=(0, s * 12, 0), mat=armor, bevel=0.04), sh[i])
        local(box(f"PauldronStripe{i}", S(0.245, 0.03, 0.265), loc=T(s * 0.05, 0.05, 0), rot=(0, s * 12, 0), mat=acc, bevel=0.008), sh[i])
        local(limb(f"Bracer{i}", [(0, -0.06), (0.075, -0.07), (0.075, -0.2), (0, -0.21)], armor), el[i])
        local(box(f"KneePad{i}", S(0.14, 0.14, 0.06), loc=T(0, 0.0, -0.08), mat=armor, bevel=0.03), kn[i])
        local(box(f"KneeStripe{i}", S(0.145, 0.025, 0.065), loc=T(0, 0.01, -0.08), mat=acc, bevel=0.005), kn[i])
        local(box(f"ThighPad{i}", S(0.16, 0.2, 0.06), loc=T(s * 0.02, -0.16, -0.08), mat=armor, bevel=0.025), hp[i])
        local(box(f"ToeCap{i}", S(0.16, 0.07, 0.08), loc=T(0, -0.08, -0.17), mat=m("Steel", "#9aa0a8", 0.35, 0.9), bevel=0.025), an[i])
    for k in range(2):
        local(cyl(f"Shell{k}", r=0.018, h=0.06, seg=10, loc=T(0.12 + k * 0.04, 0.27, -0.2), mat=m("Shell", "#a3222c", 0.5), bevel=0.003), chest)
    local(box("Belt", S(0.38 * W, 0.04, 0.26), loc=T(0, 0.085, 0), mat=dark, bevel=0.01), hips)
elif NAME == "tick":
    hair = M["Hair"]
    local(sphere("HairCap", r=0.128, loc=T(0, 0.235, 0.03), scale=S(0.99, 0.75, 1.03), mat=hair), head)
    for k in range(5):  # 헝클어진 앞머리
        local(cone(f"Tuft{k}", r=0.03, h=0.08, seg=6, loc=T(-0.06 + k * 0.03, 0.31, -0.07 + (k % 2) * 0.03), rot=(-40, 0, (k - 2) * 15), mat=hair), head)
    local(box("Visor", S(0.2, 0.05, 0.1), loc=T(0, 0.185, -0.08), mat=m("VisorGlass", "#ff9a3c", 0.15, emit="#ff7a1a", es=1.2), bevel=0.02), head)
    for s in (-1, 1):
        local(cyl(f"EarPiece{s}", r=0.04, h=0.04, seg=16, loc=T(s * 0.115, 0.18, 0), rot=(0, 90, 0), mat=armor, bevel=0.008), head)
    local(tapered("ChestPlate", 0.4, 0.22, 0.06, T(0, 0.21, -0.12), armor, taper=0.8, bev=0.025), chest)
    local(box("ChestGlowL", S(0.012, 0.2, 0.012), loc=T(-0.08, 0.2, -0.155), mat=glowO()), chest)
    local(box("ChestGlowR", S(0.012, 0.2, 0.012), loc=T(0.08, 0.2, -0.155), mat=glowO()), chest)
    clock = local(cyl("BackClock", r=0.09, h=0.025, seg=24, loc=T(0, 0.2, 0.14), rot=(90, 0, 0), mat=armor, bevel=0.006), chest)
    local(torus("ClockRing", R=0.075, r=0.008, seg=32, rseg=6, loc=T(0, 0.2, 0.155), rot=(90, 0, 0), mat=glowO()), chest)
    for i, s in enumerate((-1, 1)):
        local(box(f"ArmGlow{i}", S(0.012, 0.22, 0.012), loc=T(s * 0.06, -0.14, 0), mat=glowO()), sh[i])
        local(box(f"LegGlow{i}", S(0.012, 0.3, 0.012), loc=T(s * 0.085, -0.2, -0.03), mat=glowO()), hp[i])
        local(box(f"ShinGlow{i}", S(0.012, 0.22, 0.012), loc=T(0, -0.17, -0.065), mat=glowO()), kn[i])
        local(sphere(f"KneeCap{i}", r=0.055, loc=T(0, 0, -0.05), scale=S(1, 1.1, 0.7), mat=armor), kn[i])
        local(box(f"Holster{i}", S(0.06, 0.16, 0.1), loc=T(s * 0.11, -0.12, 0), mat=dark, bevel=0.015), hp[i])
    local(box("Belt", S(0.32, 0.04, 0.22), loc=T(0, 0.085, 0), mat=dark, bevel=0.01), hips)
elif NAME == "orbit":
    hair = M["Hair"]
    local(sphere("HairCap", r=0.13, loc=T(0, 0.235, 0.03), scale=S(1.0, 0.72, 1.04), mat=hair), head)
    local(box("Fringe", S(0.16, 0.05, 0.05), loc=T(-0.02, 0.255, -0.09), rot=(0, 0, 10), mat=hair, bevel=0.02), head)
    w = m("PanelW", "#d6d9de", 0.45, 0.2)
    local(tapered("ChestPlate", 0.5 * W, 0.26, 0.09, T(0, 0.2, -0.14), w, taper=0.8, bev=0.03), chest)
    local(box("ChestGlow", S(0.012, 0.22, 0.012), loc=T(0, 0.2, -0.19), mat=glowO()), chest)
    local(box("ChestCore", S(0.08, 0.05, 0.02), loc=T(0, 0.26, -0.19), mat=glowO(), bevel=0.01), chest)
    local(box("BackPlate", S(0.46 * W, 0.3, 0.08), loc=T(0, 0.18, 0.15), mat=armor, bevel=0.03), chest)
    for i, s_ in enumerate((-1, 1)):
        local(box(f"Pauldron{i}", S(0.2, 0.12, 0.24), loc=T(s_ * 0.04, 0.03, 0), rot=(0, s_ * 10, 0), mat=armor, bevel=0.04), sh[i])
        local(box(f"PGlow{i}", S(0.205, 0.015, 0.06), loc=T(s_ * 0.04, 0.05, -0.1), rot=(0, s_ * 10, 0), mat=glowO()), sh[i])
        local(limb(f"Bracer{i}", [(0, -0.06), (0.075, -0.07), (0.075, -0.2), (0, -0.21)], armor), el[i])
        local(box(f"KneePad{i}", S(0.14, 0.15, 0.06), loc=T(0, 0.0, -0.08), mat=w, bevel=0.03), kn[i])
        local(box(f"ThighPad{i}", S(0.17, 0.22, 0.06), loc=T(s_ * 0.02, -0.16, -0.08), mat=armor, bevel=0.025), hp[i])
        local(box(f"ShinPad{i}", S(0.15, 0.24, 0.06), loc=T(0, -0.18, -0.07), mat=w, bevel=0.025), kn[i])
        local(box(f"LegGlow{i}", S(0.012, 0.2, 0.012), loc=T(0, -0.18, -0.105), mat=glowO()), kn[i])
    # 왼팔 방벽 장치(육각)
    gen = extrude_profile("ShieldGen", [(0.09 * math.cos(a), 0.09 * math.sin(a)) for a in [k * math.pi / 3 for k in range(6)]], depth=0.05,
                          loc=T(-0.08, -0.13, 0), rot=(0, 90, 0), mat=w, bevel=0.01)
    local(gen, el[0])
    local(torus("GenGlow", R=0.07, r=0.008, seg=6, rseg=4, loc=T(-0.11, -0.13, 0), rot=(0, 90, 0), mat=glowO()), el[0])
elif NAME == "nok":
    hair = M["Hair"]; bronze = m("Bronze", "#b07a3a", 0.4, 0.8); stone = m("Stone", "#9a948a", 0.85)
    local(sphere("Helm", r=0.135, loc=T(0, 0.23, 0.0), scale=S(1.0, 0.85, 1.05), mat=bronze), head)
    local(box("NoseGuard", S(0.025, 0.1, 0.02), loc=T(0, 0.19, -0.125), mat=bronze, bevel=0.006), head)
    local(sphere("Beard", r=0.1, loc=T(0, 0.08, -0.07), scale=S(1.0, 1.3, 0.7), mat=hair), head)
    for s_ in (-1, 1):
        local(bar(f"Braid{s_}", T(s_ * 0.04, 0.06, -0.1), T(s_ * 0.05, -0.12, -0.13), r=0.02, mat=hair), head)
    local(tapered("ChestPlate", 0.52 * W, 0.3, 0.1, T(0, 0.19, -0.14), armor, taper=0.85, bev=0.03), chest)
    local(box("Belt", S(0.42 * W, 0.07, 0.3), loc=T(0, 0.085, 0), mat=m("Leather", "#3b2a20", 0.8), bevel=0.015), hips)
    local(box("Buckle", S(0.12, 0.09, 0.03), loc=T(0, 0.085, -0.16), mat=bronze, bevel=0.01), hips)
    local(box("Tabard", S(0.24, 0.32, 0.03), loc=T(0, -0.12, -0.14), mat=m("Cloth", "#7a6248", 0.85), bevel=0.01), hips)
    for i, s_ in enumerate((-1, 1)):
        local(sphere(f"Pauldron{i}", r=0.13, loc=T(s_ * 0.04, 0.0, 0), scale=S(1.2, 0.8, 1.1), mat=armor), sh[i])
        local(limb(f"Bracer{i}", [(0, -0.06), (0.078, -0.07), (0.078, -0.21), (0, -0.22)], bronze), el[i])
        local(box(f"Greave{i}", S(0.15, 0.26, 0.07), loc=T(0, -0.18, -0.07), mat=bronze, bevel=0.025), kn[i])
    # 등에 진 석판 방패
    local(box("Tablet", S(0.62, 0.95, 0.08), loc=T(0, 0.02, 0.22), rot=(-8, 0, 0), mat=stone, bevel=0.03), chest)
    local(box("TabletStrap", S(0.64, 0.05, 0.1), loc=T(0, 0.1, 0.2), mat=m("Leather", "#3b2a20", 0.8), bevel=0.01), chest)
elif NAME == "aria":
    hair = M["Hair"]; bronze = m("Bronze", "#b07a3a", 0.4, 0.8)
    local(sphere("HairCap", r=0.128, loc=T(0, 0.23, 0.03), scale=S(0.98, 0.75, 1.03), mat=hair), head)
    hd = local(sphere("Hood", r=0.15, loc=T(0, 0.22, 0.03), scale=S(1.05, 1.0, 1.08), mat=armor), head)
    cut = box("_hcut", S(0.4, 0.4, 0.2), loc=T(0, 0.17, -0.15), bevel=0, smooth=None); local(cut, head)
    boolean(hd, cut)
    local(bar("Braid", T(0.05, 0.12, 0.08), T(0.08, -0.25, 0.12), r=0.028, mat=hair), head)
    local(tapered("Vest", 0.42, 0.3, 0.08, T(0, 0.18, -0.12), m("Scale", "#a0763e", 0.45, 0.7), taper=0.85, bev=0.025), chest)
    cape = local(box("Cape", S(0.5, 1.0, 0.04), loc=T(0, -0.25, 0.17), mat=armor, bevel=0.01), chest)
    for v in cape.data.vertices:
        if v.co.z < 0: v.co.x *= 1.25
    local(box("CapeTrim", S(0.58, 0.04, 0.045), loc=T(0, -0.73, 0.17), mat=bronze, bevel=0.01), chest)
    local(cyl("Quiver", r=0.06, h=0.5, seg=12, loc=T(0.1, 0.12, 0.2), rot=(-15, 0, 15), mat=m("Leather", "#4a3424", 0.8), bevel=0.01), chest)
    for i, s_ in enumerate((-1, 1)):
        local(limb(f"Bracer{i}", [(0, -0.07), (0.064, -0.08), (0.064, -0.2), (0, -0.21)], bronze), el[i])
        local(box(f"Greave{i}", S(0.12, 0.24, 0.05), loc=T(0, -0.18, -0.06), mat=m("Steel", "#9aa0a8", 0.35, 0.9), bevel=0.02), kn[i])
elif NAME == "phase":
    hair = M["Hair"]
    local(sphere("HairCap", r=0.122, loc=T(0.0, 0.225, 0.04), scale=S(0.9, 0.62, 1.0), mat=m("Dark", "#2b2420", 0.8)), head)
    for k in range(6):
        local(cone(f"Mohawk{k}", r=0.045, h=0.12, seg=6, loc=T(0.03, 0.31 - k * 0.012, -0.07 + k * 0.035), rot=(-30 + k * 12, 0, -15), mat=hair), head)
    local(torus("GoggleBand", R=0.128, r=0.012, seg=32, rseg=6, loc=T(0, 0.26, 0.0), scale=(1.0, 1.0, 1.0), mat=m("Graphite", "#22252b", 0.5, 0.4)), head)
    for s_ in (-1, 1):
        local(cyl(f"Goggle{s_}", r=0.035, h=0.03, seg=16, loc=T(s_ * 0.045, 0.27, -0.11), rot=(90, 0, 0), mat=m("GoggleG", "#35c6c4", 0.15, emit="#35c6c4", es=0.6)), head)
    local(tapered("Jacket", 0.48, 0.3, 0.29, T(0, 0.2, 0), armor, taper=0.78, bev=0.05), chest)
    local(box("JacketTrim", S(0.5, 0.04, 0.3), loc=T(0, 0.07, 0), mat=m("Orange", "#e8742a", 0.6)), chest)
    for k in range(4):
        local(cyl(f"Bomb{k}", r=0.03, h=0.08, seg=10, loc=T(-0.12 + k * 0.05, 0.27, -0.16), rot=(90, 0, 0), mat=acc, bevel=0.004), chest)
    for i, s_ in enumerate((-1, 1)):
        local(box(f"KneePad{i}", S(0.12, 0.12, 0.05), loc=T(0, 0, -0.07), mat=m("Graphite", "#22252b", 0.5, 0.4), bevel=0.02), kn[i])
        local(box(f"Pouch{i}", S(0.07, 0.1, 0.1), loc=T(s_ * 0.1, -0.12, 0), mat=m("Olive", "#4a5240", 0.8), bevel=0.015), hp[i])
elif NAME == "mora":
    hair = M["Hair"]
    local(sphere("HairCap", r=0.13, loc=T(0, 0.22, 0.03), scale=S(1.05, 0.85, 1.06), mat=hair), head)
    local(box("Bob", S(0.26, 0.14, 0.2), loc=T(0, 0.16, 0.04), mat=hair, bevel=0.05), head)
    local(torus("Headset", R=0.13, r=0.01, seg=28, rseg=6, loc=T(0, 0.2, 0), rot=(0, 90, 0), mat=m("Graphite", "#22252b", 0.5, 0.4)), head)
    local(bar("Mic", T(0.12, 0.17, 0), T(0.05, 0.12, -0.11), r=0.006, mat=m("Graphite", "#22252b", 0.5, 0.4)), head)
    local(tapered("Vest", 0.46, 0.3, 0.26, T(0, 0.18, 0), armor, taper=0.82, bev=0.04), chest)
    local(box("CrossH", S(0.12, 0.035, 0.02), loc=T(0, 0.22, -0.14), mat=m("CrossG", "#bff5f2", 0.4, emit="#35c6c4", es=1.2)), chest)
    local(box("CrossV", S(0.035, 0.12, 0.02), loc=T(0, 0.22, -0.14), mat=M["CrossG"]), chest)
    local(box("VestTrim", S(0.47, 0.025, 0.27), loc=T(0, 0.33, 0), mat=acc), chest)
    # 큰 보급 배낭 + 안테나 (실루엣 강조)
    local(box("Pack", S(0.4, 0.46, 0.22), loc=T(0, 0.17, 0.24), mat=m("Olive", "#4a5240", 0.8), bevel=0.05), chest)
    local(box("PackCase", S(0.3, 0.14, 0.06), loc=T(0, 0.22, 0.36), mat=armor, bevel=0.02), chest)
    local(bar("Antenna", T(0.15, 0.38, 0.28), T(0.2, 0.85, 0.3), r=0.008, mat=m("Graphite", "#22252b", 0.5, 0.4)), chest)
    local(sphere("AntTip", r=0.02, loc=T(0.2, 0.86, 0.3), mat=m("TipG", "#35c6c4", 0.3, emit="#35c6c4", es=2)), chest)
    for k in range(3):
        local(cyl(f"Flash{k}", r=0.025, h=0.09, seg=10, loc=T(-0.12 + k * 0.06, 0.04, -0.15), mat=m("Can", "#6b7a5a", 0.6, 0.4), bevel=0.004), hips)
elif NAME == "iko":
    hair = M["Hair"]; tipc = m("HairTip", "#ff8a2a", 0.6)
    local(sphere("HairCap", r=0.13, loc=T(0, 0.23, 0.03), scale=S(1.0, 0.8, 1.04), mat=hair), head)
    for s_ in (-1, 1):
        local(bar(f"Tail{s_}", T(s_ * 0.13, 0.27, 0.03), T(s_ * 0.24, 0.12, 0.06), r=0.045, mat=hair), head)
        local(sphere(f"TailTip{s_}", r=0.05, loc=T(s_ * 0.25, 0.07, 0.07), scale=S(0.9, 1.4, 0.9), mat=tipc), head)
        local(box(f"Clip{s_}", S(0.04, 0.05, 0.04), loc=T(s_ * 0.13, 0.27, 0.03), mat=glowO(), bevel=0.01), head)
    hood = local(tapered("Hoodie", 0.56, 0.4, 0.34, T(0, 0.16, 0), armor, taper=0.85, bev=0.08), chest)
    local(torus("Collar", R=0.12, r=0.05, seg=24, rseg=10, loc=T(0, 0.33, 0.01), mat=armor), chest)
    local(box("HoodLine", S(0.012, 0.3, 0.012), loc=T(0, 0.16, -0.175), mat=glowO()), chest)
    for i, s_ in enumerate((-1, 1)):
        local(limb(f"Sleeve{i}", [(0, 0.02), (0.085, 0.0), (0.08, -0.27), (0, -0.28)], armor), sh[i])
        local(torus(f"Cuff{i}", R=0.06, r=0.02, seg=20, rseg=8, loc=T(0, -0.2, 0), mat=m("Orange", "#e8742a", 0.6)), el[i])
        local(box(f"BootTop{i}", S(0.15, 0.1, 0.2), loc=T(0, -0.0, -0.02), mat=m("Orange", "#e8742a", 0.6), bevel=0.03), an[i])
    # 떠 있는 방패 드론
    d0 = local(empty("Drone", loc=T(-0.42, 0.45, 0.05)), chest)
    local(sphere("DroneCore", r=0.05, mat=m("DroneG", "#7fd6ff", 0.3, emit="#3db8ff", es=1.8)), d0)
    local(torus("DroneRing", R=0.11, r=0.02, seg=24, rseg=6, rot=(90, 0, 0), mat=m("PanelW", "#d6d9de", 0.45, 0.2)), d0)
elif NAME == "lumen":
    hair = M["Hair"]
    local(sphere("HairCap", r=0.13, loc=T(0, 0.235, 0.03), scale=S(1.0, 0.78, 1.04), mat=hair), head)
    local(box("Fringe", S(0.18, 0.06, 0.05), loc=T(0.02, 0.245, -0.09), rot=(0, 0, -12), mat=hair, bevel=0.02), head)
    coat = armor
    # 롱코트: 등판 + 양 옆판 + 앞판 2장(앞이 열린 코트)
    local(tapered("CoatTop", 0.5, 0.36, 0.3, T(0, 0.17, 0), coat, taper=0.8, bev=0.05), chest)
    local(box("Hood", S(0.34, 0.12, 0.2), loc=T(0, 0.34, 0.08), mat=coat, bevel=0.05), chest)
    skirt = [("CoatBack", S(0.4, 0.62, 0.04), T(0, -0.25, 0.13), (0, 0, 0)),
             ("CoatL", S(0.04, 0.62, 0.26), T(-0.2, -0.25, 0.0), (0, 0, 0)),
             ("CoatR", S(0.04, 0.62, 0.26), T(0.2, -0.25, 0.0), (0, 0, 0)),
             ("CoatFL", S(0.14, 0.62, 0.04), T(-0.13, -0.25, -0.13), (0, 0, 0)),
             ("CoatFR", S(0.14, 0.62, 0.04), T(0.13, -0.25, -0.13), (0, 0, 0))]
    for nm, sz, lc, rt in skirt:
        o = local(box(nm, sz, loc=lc, rot=rt, mat=coat, bevel=0.012), hips)
        for v in o.data.vertices:  # 아래로 갈수록 퍼짐
            if v.co.z < 0:
                v.co.x *= 1.18
                v.co.y *= 1.18
    local(box("CoatLineL", S(0.014, 0.6, 0.014), loc=T(-0.06, -0.24, -0.152), mat=glowO()), hips)
    local(box("CoatLineR", S(0.014, 0.6, 0.014), loc=T(0.06, -0.24, -0.152), mat=glowO()), hips)
    local(box("CoatHemB", S(0.46, 0.014, 0.02), loc=T(0, -0.53, 0.165), mat=glowO()), hips)
    for i, s in enumerate((-1, 1)):
        local(limb(f"Sleeve{i}", [(0, 0.02), (0.08, 0.0), (0.075, -0.27), (0, -0.28)], coat), sh[i])
        local(limb(f"Cuff{i}", [(0, -0.1), (0.07, -0.11), (0.07, -0.22), (0, -0.23)], coat), el[i])
        local(torus(f"CuffGlow{i}", R=0.07, r=0.007, seg=28, rseg=6, loc=T(0, -0.2, 0), mat=glowO()), el[i])
        local(box(f"ShoulderPad{i}", S(0.15, 0.06, 0.17), loc=T(s * 0.03, 0.04, 0), mat=dark, bevel=0.02), sh[i])
    for k, (x, y, z) in enumerate([(-0.3, 0.42, 0.05), (0.32, 0.38, 0.0), (0.22, 0.52, 0.1)]):
        local(sphere(f"Orb{k}", r=0.03, loc=T(x, y, z), mat=glowO()), chest)

# 무기: 오른손(1)에 장착. 무기 앞(-Z)이 팔 아래 방향(-Y)과 같게.
gm = jnt("gunMount", hand[1], 0, -0.07, 0)
gm.rotation_euler = (D(-90), 0, 0)
weapon(H["gun"], gm)
if NAME == "tick":
    gm0 = jnt("gunMount0", hand[0], 0, -0.07, 0)
    gm0.rotation_euler = (D(-90), 0, 0)
    weapon("pistol", gm0)
stage("디테일", "영웅별 장갑·발광선·머리·무기 장착", clay=True)
stage("재질", "참고 그림의 색 규칙(현재: 청록·분홍 / 미래: 회색·주황)")

# ------------------------------------------------------------------ 3. 사격 자세(사진·게임 공통)
rest = {n: (j.location.copy(), j.rotation_euler.copy()) for n, j in J.items()}


def aim(j, d):
    j.rotation_mode = 'QUATERNION'
    j.rotation_quaternion = Vector((0, 0, -1)).rotation_difference(Vector(d).normalized())


aim(sh[1], T(-0.15, -0.05, -1))   # 오른팔 앞으로
el[1].rotation_euler = (0, 0, 0)
if NAME == "tick":
    aim(sh[0], T(0.15, -0.05, -1))
else:
    aim(sh[0], T(0.45, -0.25, -0.85))
    el[0].rotation_euler = (D(25), 0, 0)
aim(hp[0], T(0, -1, -0.15))
aim(hp[1], T(0, -1, 0.12))
kn[1].rotation_euler = (D(-10), 0, 0)
stage("사격 자세", "게임에서 쓰는 조준 자세로 관절을 꺾어 확인")


def back_to_rest():
    for n, (l, r) in rest.items():
        J[n].rotation_mode = 'XYZ'
        J[n].location = l
        J[n].rotation_euler = r


stage_end(NAME + ".glb", samples=24, stats={"id": NAME}, pre_export=back_to_rest)
