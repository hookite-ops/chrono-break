"""크로노 브레이크 맵 텍스처 생성 (반복 이어붙임 가능한 타일).
python3 gen_tex.py OUTDIR
각 재질: NAME.jpg(색) NAME_n.jpg(노멀) [NAME_e.jpg(발광)]
"""
import sys, os, math
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from scipy import ndimage

OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)
R = np.random.default_rng(317)
FONT = '/usr/share/fonts/opentype/noto/NotoSansCJK-Black.ttc'
FONTB = '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc'


def noise(n, f, rng=R):
    """주기적 값 노이즈 n×n, 격자 f칸"""
    g = rng.random((f, f))
    z = ndimage.zoom(g, n / f, order=3, mode='grid-wrap', grid_mode=True)
    return z[:n, :n]


def fbm(n, f0=4, oct=5, rng=R, gain=0.5):
    out = np.zeros((n, n)); a = 1; tot = 0; f = f0
    for _ in range(oct):
        if f > n: break
        out += a * noise(n, f, rng); tot += a; a *= gain; f *= 2
    return out / tot


def ridge(n, f0=6, oct=4):
    return 1 - np.abs(fbm(n, f0, oct) * 2 - 1)


def save(name, rgb, nrm_h=None, strength=4.0, em=None, q=86):
    rgb = np.clip(rgb, 0, 1)
    Image.fromarray((rgb * 255).astype(np.uint8)).save(f'{OUT}/{name}.jpg', quality=q)
    if nrm_h is not None:
        h = nrm_h
        dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * 0.5
        dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * 0.5
        nx, ny = -dx * strength, dy * strength
        nz = np.ones_like(h)
        l = np.sqrt(nx * nx + ny * ny + nz * nz)
        n = np.stack([nx / l, ny / l, nz / l], -1) * 0.5 + 0.5
        Image.fromarray((n * 255).astype(np.uint8)).save(f'{OUT}/{name}_n.jpg', quality=90)
    if em is not None:
        Image.fromarray((np.clip(em, 0, 1) * 255).astype(np.uint8)).save(f'{OUT}/{name}_e.jpg', quality=85)
    print('saved', name)


def col(hexs):
    hexs = hexs.lstrip('#'); return np.array([int(hexs[i:i + 2], 16) / 255 for i in (0, 2, 4)])


def lerp(a, b, t): return a + (b - a) * t


def grime(n, amt=0.35, f0=3):
    g = fbm(n, f0, 6)
    return 1 - amt * np.clip((g - 0.35) * 1.8, 0, 1)


def streaks(n, amt=0.3, f=40):
    """위에서 흘러내린 얼룩(세로 줄)"""
    s = noise(n, f)[:1, :].repeat(n, 0)
    fade = fbm(n, 4, 4)
    return 1 - amt * np.clip(s * 1.4 - 0.5, 0, 1) * fade


# ---------------------------------------------------------------- 벽돌 (현재 쪽, 2 m 타일)
def brick(n=512, base='#7a3b2e', mortar='#8f877c', name='brick'):
    rows, cols = 28, 8  # 2 m / 28 ≈ 7 cm 줄, 25 cm 벽돌
    h = np.zeros((n, n)); rgb = np.zeros((n, n, 3))
    yy, xx = np.mgrid[0:n, 0:n] / n
    r = (yy * rows).astype(int); off = (r % 2) * 0.5
    c = ((xx * cols + off) % cols).astype(int)
    fy = (yy * rows) % 1; fx = (xx * cols + off) % 1
    m = np.minimum(np.minimum(fy, 1 - fy) * 0.07 * n / rows * rows / 0.07 / n * 1.0, 1)
    edge = np.minimum(np.minimum(fy, 1 - fy) / 0.14, np.minimum(fx, 1 - fx) / 0.045)
    brickmask = np.clip(edge * 3 - 0.6, 0, 1)
    ids = (r * 131 + c * 17) % 997
    rr = np.random.default_rng(5).random(1000)
    tone = rr[ids]
    bc = col(base)[None, None] * (0.75 + 0.45 * tone[..., None])
    bc = bc * (0.85 + 0.3 * fbm(n, 32, 3)[..., None])
    dark = (rr[(ids * 7) % 997] < 0.12)[..., None]
    bc = np.where(dark, bc * 0.6, bc)
    mc = col(mortar)[None, None] * (0.8 + 0.3 * fbm(n, 64, 2)[..., None])
    rgb = lerp(mc, bc, brickmask[..., None])
    rgb *= grime(n, 0.3)[..., None] * streaks(n, 0.25)[..., None]
    h = brickmask * 0.8 + fbm(n, 48, 3) * 0.25
    save(name, rgb, h, 3.0)


# ---------------------------------------------------------------- 칠한 회벽 (현재 쪽, 3 m)
def plaster(n=512, base='#b9a48c', name='plaster'):
    f = fbm(n, 8, 6)
    rgb = col(base)[None, None] * (0.85 + 0.25 * f[..., None])
    cr = ridge(n, 5, 5)
    crack = np.clip((cr - 0.978) * 45, 0, 1)
    rgb *= (1 - 0.3 * crack)[..., None]
    rgb *= grime(n, 0.4)[..., None] * streaks(n, 0.35, 30)[..., None]
    save(name, rgb, f * 0.6 - crack * 0.5 + fbm(n, 96, 2) * 0.3, 2.0)


# ---------------------------------------------------------------- 콘크리트 패널 (미래 쪽, 3 m)
def concrete(n=512, base='#8d8f94', name='concrete', panels=2, rust=0.6):
    f = fbm(n, 6, 6)
    rgb = col(base)[None, None] * (0.8 + 0.35 * f[..., None])
    yy, xx = np.mgrid[0:n, 0:n] / n
    gx = np.abs(((xx * panels) % 1) - 0.5) * 2; gy = np.abs(((yy * panels) % 1) - 0.5) * 2
    seam = np.clip((np.maximum(gx, gy) - 0.985) * 80, 0, 1)
    # 거푸집 구멍
    hx = np.abs(((xx * panels * 3) % 1) - 0.5); hy = np.abs(((yy * panels * 2) % 1) - 0.5)
    hole = np.clip(1 - np.hypot(hx, hy) / 0.035, 0, 1)
    rgb *= (1 - 0.45 * seam - 0.5 * hole)[..., None]
    # 녹물 줄
    rs = noise(n, 24)[:1, :].repeat(n, 0) * fbm(n, 3, 3)
    rmask = np.clip(rs * 1.8 - 0.75, 0, 1) * rust
    rgb = lerp(rgb, col('#7a4a2a')[None, None] * (0.7 + 0.4 * f[..., None]), rmask[..., None])
    rgb *= grime(n, 0.35)[..., None]
    save(name, rgb, f * 0.4 - seam * 0.6 - hole * 0.5 + fbm(n, 128, 2) * 0.25, 2.5)


# ---------------------------------------------------------------- 금속 패널 (2 m)
def metal(n=512, base='#5d646c', name='metal'):
    yy, xx = np.mgrid[0:n, 0:n] / n
    f = fbm(n, 8, 5)
    corr = (np.sin(xx * 2 * math.pi * 24) * 0.5 + 0.5)
    pan = np.abs(((yy * 2) % 1) - 0.5) * 2
    seam = np.clip((pan - 0.97) * 60, 0, 1)
    rv = np.clip(1 - np.hypot((xx * 12) % 1 - 0.5, ((yy * 2) % 1) - 0.04) / 0.06, 0, 1) + \
        np.clip(1 - np.hypot((xx * 12) % 1 - 0.5, ((yy * 2) % 1) - 0.96) / 0.06, 0, 1)
    rgb = col(base)[None, None] * (0.75 + 0.2 * corr[..., None] + 0.2 * f[..., None])
    rust = np.clip(fbm(n, 5, 6) * 2.2 - 1.15, 0, 1)
    rgb = lerp(rgb, col('#8a4a24')[None, None] * (0.6 + 0.6 * fbm(n, 40, 3)[..., None]), rust[..., None])
    rgb *= (1 - 0.5 * seam)[..., None] * streaks(n, 0.3)[..., None]
    save(name, rgb, corr * 0.5 - seam * 0.7 + rv * 0.4 + rust * 0.15, 3.0)


# ---------------------------------------------------------------- 아스팔트 (4 m)
def asphalt(n=1024, name='asphalt'):
    f = fbm(n, 8, 7)
    agg = R.random((n, n)); agg = ndimage.gaussian_filter(agg, 0.7)
    rgb = col('#3a3a40')[None, None] * (0.75 + 0.35 * f[..., None] + 0.35 * (agg[..., None] - 0.5))
    cr = ridge(n, 4, 5)
    crack = np.clip((cr - 0.986) * 60, 0, 1) * 0.6
    patch = np.clip((fbm(n, 3, 3) - 0.62) * 12, 0, 1)
    rgb = lerp(rgb, rgb * 0.7, patch[..., None])
    rgb *= (1 - 0.6 * crack)[..., None]
    wet = np.clip((fbm(n, 4, 4) - 0.55) * 4, 0, 1)
    rgb *= (1 - 0.25 * wet)[..., None]
    save(name, rgb, agg * 0.6 + f * 0.3 - crack * 0.8, 2.2)


# ---------------------------------------------------------------- 보도블록 (2 m)
def paving(n=512, name='paving', base='#77736f', k=4):
    yy, xx = np.mgrid[0:n, 0:n] / n
    r = (yy * k).astype(int); c = (xx * k).astype(int)
    fy = (yy * k) % 1; fx = (xx * k) % 1
    e = np.minimum(np.minimum(fy, 1 - fy), np.minimum(fx, 1 - fx))
    tile = np.clip(e / 0.03, 0, 1)
    rr = np.random.default_rng(9).random(64)
    tone = rr[(r * 7 + c * 3) % 64]
    rgb = col(base)[None, None] * (0.8 + 0.25 * tone[..., None]) * (0.85 + 0.3 * fbm(n, 32, 4)[..., None])
    rgb = lerp(col('#2c2a2a')[None, None], rgb, tile[..., None])
    rgb *= grime(n, 0.3)[..., None]
    save(name, rgb, tile * 0.6 + fbm(n, 64, 3) * 0.2, 2.5)


# ---------------------------------------------------------------- 나무 판자 (1 m)
def wood(n=512, name='wood', base='#8a6a48'):
    yy, xx = np.mgrid[0:n, 0:n] / n
    planks = 5
    p = (yy * planks).astype(int); fy = (yy * planks) % 1
    gap = np.clip(np.minimum(fy, 1 - fy) / 0.04, 0, 1)
    rr = np.random.default_rng(3).random(16)
    grain = np.sin((xx * 30 + noise(n, 8)[..., :] * 6 + p * 3.1) * 2 * math.pi) * 0.5 + 0.5
    rgb = col(base)[None, None] * (0.7 + 0.25 * rr[p % 16][..., None] + 0.15 * grain[..., None])
    rgb *= gap[..., None] * 0.6 + 0.4
    rgb *= grime(n, 0.3)[..., None]
    save(name, rgb, gap * 0.7 + grain * 0.15, 3.0)


# ---------------------------------------------------------------- 건물 정면: 창문 격자 + 발광
def facade(name, n=1024, cols=4, floors=3, wall='brick', palette='present', seed=1):
    """한 장 = cols칸 × floors층 (가로 10 m, 세로 9.6 m 기준)"""
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:n, 0:n] / n
    if wall == 'brick':
        base = np.array(Image.open(f'{OUT}/brick.jpg').resize((n // 2, n // 2))).astype(float) / 255
        base = np.tile(base, (2, 2, 1))  # 2 m 타일 → 10 m 에 5번이지만 대충 맞춤
        base = np.array(Image.fromarray((base * 255).astype(np.uint8)).resize((n, n))) / 255
        base = np.tile(np.array(Image.fromarray((base * 255).astype(np.uint8)).resize((n // 2, n // 2))) / 255, (2, 2, 1))
    elif wall == 'plaster':
        tint = col(['#b9a48c', '#9fb0b3', '#c2a08f', '#a7a28a'][seed % 4])
        f = fbm(n, 8, 6)
        base = tint[None, None] * (0.85 + 0.25 * f[..., None])
        base *= grime(n, 0.35)[..., None] * streaks(n, 0.35, 30)[..., None]
    else:
        base = np.array(Image.open(f'{OUT}/concrete.jpg').resize((n // 2, n // 2))).astype(float) / 255
        base = np.tile(base, (2, 2, 1)) * col('#9aa0a8')[None, None] * 1.05
    rgb = base.copy(); em = np.zeros((n, n, 3)); h = fbm(n, 64, 3) * 0.15
    cw, fh = n / cols, n / floors
    for fl in range(floors):
        # 층 띠(코니스)
        y0 = int(fl * fh)
        band = slice(y0, y0 + max(3, int(fh * 0.05)))
        rgb[band] *= 0.62; h[band] += 0.5
        for c in range(cols):
            x0 = c * cw
            if palette == 'future':
                wx0, wx1 = x0 + cw * 0.06, x0 + cw * 0.94
                wy0, wy1 = y0 + fh * 0.38, y0 + fh * 0.7
            else:
                wx0, wx1 = x0 + cw * 0.2, x0 + cw * 0.8
                wy0, wy1 = y0 + fh * 0.25, y0 + fh * 0.78
            ix0, ix1, iy0, iy1 = int(wx0), int(wx1), int(wy0), int(wy1)
            fr = max(4, int(cw * 0.035))
            # 창틀
            frame = col('#d8d2c6' if palette == 'present' else '#3a3d42') * (0.9 if palette == 'present' else 1)
            rgb[iy0 - fr:iy1 + fr, ix0 - fr:ix1 + fr] = frame
            h[iy0 - fr:iy1 + fr, ix0 - fr:ix1 + fr] = 0.65
            # 유리 / 실내
            roll = rng.random()
            gy, gx = np.mgrid[iy0:iy1, ix0:ix1]
            ty = (gy - iy0) / max(1, iy1 - iy0); tx = (gx - ix0) / max(1, ix1 - ix0)
            if palette == 'present':
                lit = roll < 0.5
                warm = rng.random() < 0.75
                if lit:
                    ic = col('#ffcf8a') if warm else col('#cfe6ff')
                    if rng.random() < 0.3: ic = col('#ff9fc0') if rng.random() < 0.5 else col('#a8ffcf')
                    grad = (0.65 + 0.35 * (1 - ty))[..., None]
                    curtain = rng.random()
                    cm = np.zeros_like(tx)
                    if curtain < 0.4:  # 양쪽 커튼
                        cm = ((tx < 0.22) | (tx > 0.78)).astype(float)
                    elif curtain < 0.65:  # 블라인드
                        cm = (((ty * 14) % 1) < 0.35).astype(float) * 0.7
                    win = ic[None, None] * grad * (1 - 0.6 * cm[..., None])
                    rgb[iy0:iy1, ix0:ix1] = win * 0.9
                    em[iy0:iy1, ix0:ix1] = win * (0.85 + 0.15 * rng.random())
                else:
                    sky = lerp(col('#1c2333'), col('#3b4560'), (1 - ty) ** 2)[..., None, :] if False else lerp(col('#141a28'), col('#36405a'), ((1 - ty) ** 2)[..., None])
                    refl = np.clip(1 - np.abs(tx - ty * 0.6 - 0.2) / 0.08, 0, 1)[..., None] * 0.25
                    rgb[iy0:iy1, ix0:ix1] = sky + refl
                h[iy0:iy1, ix0:ix1] = 0.0
                # 십자 창살
                mx = (ix0 + ix1) // 2
                rgb[iy0:iy1, mx - fr // 2:mx + fr // 2] = frame; h[iy0:iy1, mx - fr // 2:mx + fr // 2] = 0.55
                em[iy0:iy1, mx - fr // 2:mx + fr // 2] = 0
                # 창턱
                rgb[iy1 + fr:iy1 + fr * 3, ix0 - fr * 2:ix1 + fr * 2] = col('#8c857a'); h[iy1 + fr:iy1 + fr * 3, ix0 - fr * 2:ix1 + fr * 2] = 0.8
            else:
                state = roll
                if state < 0.18:  # 깨진 유리 + 청록 화면 빛
                    ic = col('#4fe3ff') if rng.random() < 0.6 else col('#ff8a2a')
                    flick = (0.6 + 0.4 * fbm(64, 4, 2)[:1, :1])
                    win = ic[None, None] * (0.5 + 0.5 * (1 - ty))[..., None]
                    rgb[iy0:iy1, ix0:ix1] = win * 0.8; em[iy0:iy1, ix0:ix1] = win * 0.8
                else:
                    g = lerp(col('#0d1117'), col('#26303d'), ((1 - ty) ** 1.5)[..., None])
                    if rng.random() < 0.5:  # 깨진 유리 무늬
                        cx, cy = rng.random(), rng.random()
                        ang = np.arctan2(ty - cy, tx - cx); dist = np.hypot(tx - cx, ty - cy)
                        crk = (np.abs(np.sin(ang * 7 + 1.3)) < 0.06) | (np.abs((dist * 9) % 1 - 0.5) < 0.02)
                        g = np.where(crk[..., None], col('#8a96a3')[None, None], g)
                    rgb[iy0:iy1, ix0:ix1] = g
                h[iy0:iy1, ix0:ix1] = 0.0
                # 세로 멀리언
                for k in range(1, 4):
                    mx = int(lerp(wx0, wx1, k / 4))
                    rgb[iy0:iy1, mx - 2:mx + 2] = frame; em[iy0:iy1, mx - 2:mx + 2] = 0; h[iy0:iy1, mx - 2:mx + 2] = 0.5
                # 경고등 줄(가끔)
                if rng.random() < 0.15:
                    rgb[iy1 + fr * 2:iy1 + fr * 3, ix0:ix1] = col('#ff7a1a'); em[iy1 + fr * 2:iy1 + fr * 3, ix0:ix1] = col('#ff7a1a')
    save(name, rgb, h, 3.0, em)


# ---------------------------------------------------------------- 1층 가게 줄 (가로 20 m × 세로 4.5 m)
SHOPS_P = [('국수', '#ff3d8a'), ('분식', '#ffd23d'), ('시계수리', '#3dd8ff'), ('약국', '#3dff8a'), ('만두', '#ff6a3d'),
           ('노래방', '#c43dff'), ('편의점', '#3db8ff'), ('카페 03:17', '#ffb03d'), ('치킨', '#ff3d3d'), ('PC방', '#3dffd8')]
SHOPS_F = [('봉쇄', '#ff7a1a'), ('출입금지', '#ff3d3d'), ('구역 7', '#4fe3ff'), ('CHRONO LAB', '#4fe3ff'), ('SECTOR 0', '#ff7a1a'), ('복원단', '#ffd23d')]


def shopfront(name, palette='present', W=2048, Hh=460, nshops=5, seed=3):
    rng = np.random.default_rng(seed)
    img = Image.new('RGB', (W, Hh), (40, 36, 40)); emi = Image.new('RGB', (W, Hh), (0, 0, 0))
    d = ImageDraw.Draw(img); e = ImageDraw.Draw(emi)
    sw = W / nshops
    lst = SHOPS_P if palette == 'present' else SHOPS_F
    picks = rng.permutation(len(lst))
    for i in range(nshops):
        x0, x1 = int(i * sw), int((i + 1) * sw)
        name_, nc = lst[picks[i % len(lst)]]
        ncv = tuple(int(nc[k:k + 2], 16) for k in (1, 3, 5))
        # 기둥
        pc = (70, 62, 66) if palette == 'present' else (64, 68, 74)
        d.rectangle([x0, 0, x0 + 18, Hh], fill=pc); d.rectangle([x1 - 18, 0, x1, Hh], fill=pc)
        # 간판 띠
        sb = (20, 14, 26) if palette == 'present' else (18, 20, 24)
        d.rectangle([x0 + 18, 0, x1 - 18, 110], fill=sb)
        fs = 74 if len(name_) <= 4 else 54
        f = ImageFont.truetype(FONT, fs, index=1)  # 1 = KR
        tw = d.textlength(name_, font=f)
        tx = (x0 + x1) / 2 - tw / 2
        for img_d, colr in ((d, ncv), (e, ncv)):
            img_d.text((tx, 55 - fs * 0.62), name_, font=f, fill=colr)
        # 가게 안 / 셔터
        sy0, sy1 = 128, Hh - 14
        state = rng.random()
        if palette == 'present' and state < 0.78:
            warm = rng.random() < 0.7
            ic = (255, 214, 150) if warm else (210, 235, 255)
            for y in range(sy0, sy1):
                k = 0.55 + 0.45 * (y - sy0) / (sy1 - sy0)
                c = tuple(int(ic[j] * k) for j in range(3))
                d.line([x0 + 24, y, x1 - 24, y], fill=c); e.line([x0 + 24, y, x1 - 24, y], fill=tuple(int(v * 0.8) for v in c))
            # 진열대 실루엣
            for k in range(3):
                yy = int(sy0 + (sy1 - sy0) * (0.4 + k * 0.2))
                d.rectangle([x0 + 40, yy, x1 - 40, yy + 8], fill=(90, 70, 60)); e.rectangle([x0 + 40, yy, x1 - 40, yy + 8], fill=(0, 0, 0))
                for j in range(int((x1 - x0 - 110) / 40)):
                    if rng.random() < 0.7:
                        bx = x0 + 44 + j * 40; bh = int(rng.integers(14, 40))
                        cc = tuple(int(v) for v in rng.integers(60, 255, 3))
                        d.rectangle([bx, yy - bh, bx + 26, yy], fill=cc); e.rectangle([bx, yy - bh, bx + 26, yy], fill=tuple(v // 3 for v in cc))
            # 유리 문틀
            for k in range(1, 3):
                mx = int(x0 + (x1 - x0) * k / 3)
                d.rectangle([mx - 4, sy0, mx + 4, sy1], fill=(40, 40, 44)); e.rectangle([mx - 4, sy0, mx + 4, sy1], fill=(0, 0, 0))
            # 반쯤 내린 셔터
            if rng.random() < 0.35:
                sh = int((sy1 - sy0) * rng.uniform(0.2, 0.5))
                for y in range(sy0, sy0 + sh, 8):
                    d.rectangle([x0 + 22, y, x1 - 22, y + 6], fill=(120, 118, 115)); e.rectangle([x0 + 22, y, x1 - 22, y + 7], fill=(0, 0, 0))
        else:
            # 닫힌 셔터
            base = (110, 106, 100) if palette == 'present' else (80, 84, 88)
            for y in range(sy0, sy1, 9):
                d.rectangle([x0 + 22, y, x1 - 22, y + 7], fill=base); d.line([x0 + 22, y + 7, x1 - 22, y + 7], fill=(50, 50, 52), width=2)
            if palette == 'future':
                # 노랑-검정 경고 띠
                for k in range(0, int(x1 - x0), 40):
                    d.polygon([(x0 + k, sy1 - 40), (x0 + k + 20, sy1 - 40), (x0 + k + 40, sy1), (x0 + k + 20, sy1)], fill=(230, 180, 40))
            else:
                # 낙서
                f2 = ImageFont.truetype(FONTB, 40, index=1)
                d.text((x0 + 60, sy0 + 80), rng.choice(['03:17', '멈춘 시간', 'TIME?', '돌아와']), font=f2, fill=tuple(int(v) for v in rng.integers(120, 255, 3)))
    rgb = np.array(img).astype(float) / 255
    n = fbm(512, 8, 4)
    n = np.array(Image.fromarray((n * 255).astype(np.uint8)).resize((W, Hh))).astype(float) / 255
    rgb *= (0.85 + 0.25 * n)[..., None]
    Image.fromarray((np.clip(rgb, 0, 1) * 255).astype(np.uint8)).save(f'{OUT}/{name}.jpg', quality=86)
    emi.filter(ImageFilter.GaussianBlur(1.2)).save(f'{OUT}/{name}_e.jpg', quality=85)
    print('saved', name)


# ---------------------------------------------------------------- 천막 줄무늬
def awning(name='awning', n=256):
    img = Image.new('RGB', (n, n)); d = ImageDraw.Draw(img)
    cs = [(200, 50, 60), (235, 225, 210)]
    for i in range(8): d.rectangle([i * n // 8, 0, (i + 1) * n // 8, n], fill=cs[i % 2])
    a = np.array(img).astype(float) / 255 * (0.8 + 0.3 * fbm(n, 8, 4))[..., None]
    Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8)).save(f'{OUT}/{name}.jpg', quality=85); print('saved', name)


brick()
plaster()
concrete()
metal()
asphalt()
paving()
paving(name='plaza', base='#8a7f78', k=8)
wood()
facade('facP1', wall='brick', palette='present', seed=1)
facade('facP2', wall='plaster', palette='present', seed=2)
facade('facF1', wall='concrete', palette='future', seed=3)
shopfront('shopP', 'present', seed=4)
shopfront('shopF', 'future', seed=5)
awning()
