// 크로노 브레이크 맵 아트 — 03:17에 멈춘 도시. 배치(충돌)는 mapdata.js, 여기서는 진짜 거리처럼 입힌다.
// 왼쪽(x<0) = 현재: 불 켜진 야시장 골목 / 오른쪽(x>0) = 미래: 녹슬고 버려진 구역 / 가운데 = 시간 단층선과 멈춘 광장
import * as THREE from 'three';
import { block, tblock, T, M, addMesh, add, canvasTex, solid, boxes, W, cylinder } from './world.js';
import { COMPACT } from './mapdata.js';

let rng = 1;
const rr = () => (rng = (rng * 16807) % 2147483647) / 2147483647;
const pick = (a) => a[Math.floor(rr() * a.length)];
const anim = [];                       // 매 프레임 움직이는 것들
export function cityTick(dt, t) { for (const a of anim) a(dt, t); }

// ------------------------------------------------------------ 재질
const MT = {};
function mats() {
  if (MT.ok) return MT;
  Object.assign(MT, {
    ok: true,
    asphalt: T('asphalt', { tw: 5, ns: 0.7, r: 0.75, c: 0xc8c4d0 }),
    paving: T('paving', { tw: 2, r: 0.85 }),
    plaza: T('plaza', { tw: 2.4, r: 0.7 }),
    brick: T('brick', { tw: 2 }), brickDk: T('brick', { tw: 2, c: 0x9a8a86 }),
    plaster: T('plaster', { tw: 3 }),
    concrete: T('concrete', { tw: 3 }), concreteDk: T('concrete', { tw: 3, c: 0x8a8c90 }),
    metal: T('metal', { tw: 2, m: 0.55, r: 0.5 }), metalDk: T('metal', { tw: 2, m: 0.6, r: 0.45, c: 0x777c84 }),
    wood: T('wood', { tw: 1.2, r: 0.8 }),
    facP1: T('facP1', { tw: 10, th: 9.6, local: true, e: true, ei: 1.25 }),
    facP2: T('facP2', { tw: 10, th: 9.6, local: true, e: true, ei: 1.25 }),
    facF1: T('facF1', { tw: 10, th: 9.6, local: true, e: true, ei: 1.4 }),
    farP: T('facP1', { tw: 10, th: 9.6, local: true, e: true, ei: 1.1, n: false, c: 0x6a6070 }),
    farP2: T('facP2', { tw: 10, th: 9.6, local: true, e: true, ei: 1.1, n: false, c: 0x5f6474 }),
    farF: T('facF1', { tw: 10, th: 9.6, local: true, e: true, ei: 1.2, n: false, c: 0x5a6070 }),
    shopP: T('shopP', { tw: 20, th: 4.5, local: true, e: true, ei: 1.35, n: false, r: 0.5 }),
    shopF: T('shopF', { tw: 20, th: 4.5, local: true, e: true, ei: 1.2, n: false, r: 0.6 }),
    awning: T('awning', { tw: 2.5, n: false, side: THREE.DoubleSide, r: 0.9 }),
    paint: M('#d9d2bd', { r: 0.7 }), paintY: M('#e0b23a', { r: 0.7 }),
    curb: M('#8a8580', { r: 0.8 }), trimDk: M('#2c2a30', { r: 0.6 }), steel: M('#3a3d44', { m: 0.7, r: 0.35 }),
    brass: M('#b8904e', { m: 0.85, r: 0.3 }), glass: M('#1a2433', { m: 0.2, r: 0.08 }), rubber: M('#151518', { r: 0.9 }),
    glowO: M('#ff8a2a', { e: 0xff7a1a, ei: 3.0 }), glowC: M('#4fe3ff', { e: 0x3fd8ff, ei: 3.0 }), glowW: M('#ffd9a0', { e: 0xffc070, ei: 3.2 }),
    glowR: M('#ff4050', { e: 0xff2a3a, ei: 3.0 }), bulb: M('#ffe0a8', { e: 0xffc36a, ei: 4.0 }),
    puddle: new THREE.MeshStandardMaterial({ color: 0x10141c, roughness: 0.04, metalness: 0.0 }),
  });
  return MT;
}

// ------------------------------------------------------------ 작은 도구
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _v = new THREE.Vector3();
function put(geo, mat, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, cast = true) {
  _e.set(rx, ry, rz); _q.setFromEuler(_e); _m.compose(_v.set(x, y, z), _q, _s.set(sx, sy, sz));
  addMesh(geo, mat, _m, cast);
}
const G = {
  box: new THREE.BoxGeometry(1, 1, 1), cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 16), cyl8: new THREE.CylinderGeometry(0.5, 0.5, 1, 8),
  sph: new THREE.SphereGeometry(0.5, 10, 8), cone: new THREE.ConeGeometry(0.5, 1, 16, 1, true),
};
const boxAt = (x, y, z, w, h, d, mat, o = {}) => put(G.box, mat, x, y + h / 2, z, o.rx || 0, o.ry || 0, o.rz || 0, w, h, d, o.cast !== false);
const lightPools = [];
function pool(x, z, r, col, a = 0.55, y = 0.025) { lightPools.push({ x, z, r, col: new THREE.Color(col), a, y }); }
let poolTex;
function flushPools() {
  if (!poolTex) poolTex = canvasTex(128, 128, (g) => { const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); });
  const geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: true, vertexColors: false });
  const inst = new THREE.InstancedMesh(geo, mat, lightPools.length);
  lightPools.forEach((p, i) => { _m.compose(_v.set(p.x, p.y, p.z), _q.identity(), _s.set(p.r * 2, 1, p.r * 2)); inst.setMatrixAt(i, _m); inst.setColorAt(i, p.col.clone().multiplyScalar(p.a)); });
  inst.renderOrder = 2; add(inst); lightPools.length = 0;
}
// 빛 원뿔(가로등 아래 희미한 빛 기둥)
const cones = [];
function lightCone(x, y, z, r, h, col, a = 0.08) { cones.push({ x, y, z, r, h, col: new THREE.Color(col), a }); }
function flushCones() {
  if (!cones.length) return;
  const geo = new THREE.CylinderGeometry(0.06, 1, 1, 24, 1, true); geo.translate(0, -0.5, 0);
  for (const c of cones) {
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
      uniforms: { col: { value: c.col.clone().multiplyScalar(c.a * 14) } },
      vertexShader: `varying float vH; varying vec3 vN; varying vec3 vV; varying float vDist; void main(){ vH = -position.y; vec4 wp = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-wp.xyz); vDist = -wp.z; gl_Position = projectionMatrix * wp; }`,
      fragmentShader: `uniform vec3 col; varying float vH; varying vec3 vN; varying vec3 vV; varying float vDist; void main(){ float f = pow(abs(dot(normalize(vN), normalize(vV))), 2.0); float a = pow(1.0 - vH, 1.6) * f * 0.22 * smoothstep(1.5, 5.0, vDist); gl_FragColor = vec4(col * a, 1.0); }`,
    });
    const mesh = new THREE.Mesh(geo, mat); mesh.position.set(c.x, c.y, c.z); mesh.scale.set(c.r, c.h, c.r); mesh.renderOrder = 3; add(mesh);
  }
  cones.length = 0;
}
// 세로 간판 / 가로 간판 (네온) — 캔버스 글씨
const FONT = '"Noto Sans KR", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif';
function neonSign(text, col, vertical, bg = '#140c1c') {
  const L = [...text];
  const W_ = vertical ? 128 : Math.max(256, L.length * 120), H_ = vertical ? Math.max(256, L.length * 118 + 40) : 160;
  return canvasTex(W_, H_, (g) => {
    g.fillStyle = bg; g.fillRect(0, 0, W_, H_);
    g.strokeStyle = col; g.lineWidth = 6; g.shadowColor = col; g.shadowBlur = 14; g.strokeRect(9, 9, W_ - 18, H_ - 18);
    g.fillStyle = '#ffffff'; g.shadowBlur = 22; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `900 ${vertical ? 92 : 104}px ${FONT}`;
    if (vertical) L.forEach((ch, i) => { g.fillStyle = col; g.fillText(ch, W_ / 2, 78 + i * 118); g.fillStyle = 'rgba(255,255,255,0.75)'; g.fillText(ch, W_ / 2, 78 + i * 118); });
    else { g.fillStyle = col; g.fillText(text, W_ / 2, H_ / 2 + 6); g.fillStyle = 'rgba(255,255,255,0.7)'; g.fillText(text, W_ / 2, H_ / 2 + 6); }
  });
}
const signMats = [];
function signPlane(tex, w, h, x, y, z, ry, intensity = 2.2, flicker = 0) {
  const m = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, color: new THREE.Color(1, 1, 1).multiplyScalar(intensity), side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m); mesh.position.set(x, y, z); mesh.rotation.y = ry; add(mesh);
  if (flicker) { const base = intensity, seed = rr() * 100; anim.push((dt, t) => { const f = Math.sin(t * 23 + seed) > 0.93 || Math.sin(t * 3.1 + seed) > 0.985 ? 0.15 : 1; m.color.setScalar(base * f); }); }
  return mesh;
}
const SIGN_P = ['국수', '분식', '노래방', '약국', '만두', '여관', '시계방', '치킨', '호프', '당구장', '사진관', '24시'];
const SIGN_F = ['봉쇄구역', '출입금지', '위험', '구역칠', '복원단'];
const NEON = ['#ff3d8a', '#35e6e0', '#ffd23d', '#3db8ff', '#c48bff', '#ff6a3d', '#5dff9a'];

// ------------------------------------------------------------ 건물
// face: 'x+','x-','z+','z-' 중 길 쪽 면들. h: 보이는 높이
function building(x, z, w, d, h, side, o = {}) {
  const m = mats(), fut = side === 'F';
  const fac = fut ? m.facF1 : (o.fac || (rr() < 0.5 ? m.facP1 : m.facP2));
  const shopH = fut ? 4.0 : 4.5;
  tblock(x, 0, z, w, h, d, fac, { v0: -shopH, u0: rr() * 10, solid: o.solid !== false });
  const faces = o.faces || ['x+', 'x-', 'z+', 'z-'];
  for (const f of faces) {
    const along = f[0] === 'x' ? d : w, nx = f === 'x+' ? 1 : f === 'x-' ? -1 : 0, nz = f === 'z+' ? 1 : f === 'z-' ? -1 : 0;
    const cx = x + nx * (w / 2 + 0.03), cz = z + nz * (d / 2 + 0.03), ry = nx ? 0 : Math.PI / 2;
    // 1층 가게 줄
    tblock(cx, 0, cz, nx ? 0.06 : along - 0.3, shopH, nx ? along - 0.3 : 0.06, fut ? m.shopF : m.shopP, { u0: rr() * 20, solid: false, cast: false });
    // 가게 위 처마 띠
    tblock(x + nx * (w / 2 + 0.15), shopH, z + nz * (d / 2 + 0.15), nx ? 0.3 : along + 0.3, 0.32, nx ? along + 0.3 : 0.3, fut ? m.concreteDk : m.brickDk, { solid: false });
    // 차양(현재 쪽)
    if (!fut && along > 3 && rr() < 0.85) awning(cx + nx * 0.02, cz + nz * 0.02, nx, nz, along - 1, 3.25);
    // 층마다 창턱 띠
    for (let y = shopH + 3.2; y < h - 0.8; y += 3.2) tblock(x + nx * (w / 2 + 0.08), y, z + nz * (d / 2 + 0.08), nx ? 0.16 : along + 0.16, 0.14, nx ? along + 0.16 : 0.16, m.concreteDk, { solid: false, cast: false });
    // 실외기
    if (!fut) for (let y = shopH + 0.6; y < h - 1.5; y += 3.2) for (let t = -along / 2 + 1.25; t < along / 2 - 0.5; t += 2.5) if (rr() < 0.3) acUnit(x + nx * (w / 2 + 0.25) + (nz ? t : 0), y, z + nz * (d / 2 + 0.25) + (nx ? t : 0), ry + (nx > 0 || nz > 0 ? 0 : Math.PI));
    // 세로 간판
    if (rr() < (fut ? 0.35 : 0.8) && h > 8) {
      const t = (rr() - 0.5) * (along - 2), txt = fut ? pick(SIGN_F) : pick(SIGN_P), col = fut ? pick(['#ff7a1a', '#4fe3ff']) : pick(NEON);
      const tex = neonSign(txt, col, true), sh = Math.min(h - shopH - 1.2, 0.9 * [...txt].length + 0.5), sy = shopH + 0.6 + sh / 2;
      const px = x + nx * (w / 2 + 0.55) + (nz ? t : 0), pz = z + nz * (d / 2 + 0.55) + (nx ? t : 0);
      boxAt(px, sy - sh / 2 - 0.05, pz, nx ? 0.9 : 0.12, sh + 0.1, nx ? 0.12 : 0.9, m.trimDk);
      for (const sd of [-1, 1]) signPlane(tex, 0.8, sh, px + (nz ? sd * 0.065 : 0), sy, pz + (nx ? sd * 0.065 : 0), nx ? 0 : Math.PI / 2, 2.0, fut ? 1 : (rr() < 0.15 ? 1 : 0));
    }
  }
  // 옥상: 난간 + 물탱크·실외기·안테나
  const top = h, pm = fut ? m.concreteDk : m.brickDk;
  tblock(x, top, z - d / 2 + 0.15, w, 0.8, 0.3, pm, { solid: false }); tblock(x, top, z + d / 2 - 0.15, w, 0.8, 0.3, pm, { solid: false });
  tblock(x - w / 2 + 0.15, top, z, 0.3, 0.8, d - 0.6, pm, { solid: false }); tblock(x + w / 2 - 0.15, top, z, 0.3, 0.8, d - 0.6, pm, { solid: false });
  boxAt(x, top + 0.8, z - d / 2 + 0.15, w + 0.08, 0.06, 0.36, m.trimDk, { cast: false }); boxAt(x, top + 0.8, z + d / 2 - 0.15, w + 0.08, 0.06, 0.36, m.trimDk, { cast: false });
  if (w > 3 && d > 3) {
    if (rr() < 0.6) waterTank(x + (rr() - 0.5) * (w - 3), top, z + (rr() - 0.5) * (d - 3));
    for (let k = 0; k < 2; k++) if (rr() < 0.7) boxAt(x + (rr() - 0.5) * (w - 2), top, z + (rr() - 0.5) * (d - 2), 1.1, 0.9, 0.8, m.metal);
    if (rr() < 0.5) { const ax = x + (rr() - 0.5) * (w - 2), az = z + (rr() - 0.5) * (d - 2); put(G.cyl8, m.steel, ax, top + 2.5, az, 0, 0, 0, 0.06, 5, 0.06); put(G.sph, fut ? m.glowO : m.glowR, ax, top + 5.05, az, 0, 0, 0, 0.18, 0.18, 0.18, false); if (fut) beacon(ax, top + 5.05, az); }
    if (!fut && rr() < 0.35 && h > 9) {
      // 옥상 간판 틀
      const txt = pick(['경계시장', '시계탑', '03:17', '정지호텔', '멈춘다방']), col = pick(NEON), tex = neonSign(txt, col, false);
      const sw = Math.min(w - 1, [...txt].length * 1.3 + 0.6), ry = (o.roofFace === 'x' ? Math.PI / 2 : 0);
      for (const dx of [-sw / 2 + 0.3, sw / 2 - 0.3]) put(G.box, m.steel, x + (ry ? 0 : dx), top + 1.1, z + (ry ? dx : 0), 0, 0, 0, 0.08, 2.2, 0.08);
      signPlane(tex, sw, 1.4, x, top + 2.4, z, ry, 2.4);
    }
  }
}
function awning(x, z, nx, nz, len, y) {
  const m = mats(), dep = 1.3;
  const g = new THREE.PlaneGeometry(nx ? dep : len, nx ? len : dep); g.rotateX(-Math.PI / 2);
  // 바깥쪽이 아래로 기울게
  const tilt = 0.32;
  _e.set(nz ? -tilt * nz : 0, 0, nx ? tilt * nx : 0); _q.setFromEuler(_e);
  _m.compose(_v.set(x + nx * dep / 2, y, z + nz * dep / 2), _q, _s.set(1, 1, 1));
  addMesh(g, m.awning, _m, true);
  // 앞자락
  boxAt(x + nx * (dep - 0.02), y - 0.48 - 0.25, z + nz * (dep - 0.02), nx ? 0.02 : len, 0.25, nx ? len : 0.02, m.awning, { cast: false });
  // 차양 아래 전구 + 바닥 빛
  for (let t = -len / 2 + 0.8; t < len / 2; t += 1.6) {
    const bx = x + nx * 0.7 + (nz ? t : 0), bz = z + nz * 0.7 + (nx ? t : 0);
    put(G.sph, m.bulb, bx, y - 0.45, bz, 0, 0, 0, 0.12, 0.12, 0.12, false);
  }
  pool(x + nx * 1.4, z + nz * 1.4, Math.min(3.2, len / 2), '#ffb46a', 0.35);
}
function acUnit(x, y, z, ry) {
  const m = mats();
  put(G.box, m.metal, x, y, z, 0, ry, 0, 0.85, 0.6, 0.38);
  put(G.cyl, m.trimDk, x + Math.sin(ry) * 0.2, y, z + Math.cos(ry) * 0.2, Math.PI / 2, ry, 0, 0.42, 0.02, 0.42, false);
  put(G.box, m.steel, x, y - 0.33, z, 0, ry, 0, 0.9, 0.04, 0.44, false);
}
function waterTank(x, y, z) {
  const m = mats();
  for (const [dx, dz] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) put(G.box, m.steel, x + dx, y + 0.5, z + dz, 0, 0, 0, 0.1, 1, 0.1);
  put(G.cyl, M('#3d8fb5', { r: 0.5, m: 0.2 }), x, y + 1.9, z, 0, 0, 0, 1.8, 1.8, 1.8);
  put(G.cyl, m.trimDk, x, y + 2.85, z, 0, 0, 0, 1.6, 0.1, 1.6);
}
const beacons = [];
function beacon(x, y, z) { beacons.push([x, y, z]); }

// ------------------------------------------------------------ 소품
function streetLamp(x, z, ry, warm = true, broken = false) {
  const m = mats();
  put(G.cyl8, m.steel, x, 2.6, z, 0, 0, 0, 0.14, 5.2, 0.14);
  const ax = x + Math.sin(ry) * 0.9, az = z + Math.cos(ry) * 0.9;
  put(G.box, m.steel, (x + ax) / 2, 5.15, (z + az) / 2, 0, ry, 0, 0.08, 0.08, 1.9);
  put(G.box, m.trimDk, ax, 5.0, az, 0, ry, 0, 0.36, 0.16, 0.6);
  if (!broken) {
    put(G.box, warm ? m.glowW : m.glowC, ax, 4.9, az, 0, ry, 0, 0.3, 0.04, 0.5, false);
    pool(ax, az, 4.2, warm ? '#ffbf7a' : '#7fdcff', 0.55);
    lightCone(ax, 4.88, az, 2.6, 4.85, warm ? '#ffcf8a' : '#8fe6ff', 0.07);
  }
  solid(x - 0.12, 0, z - 0.12, x + 0.12, 5.2, z + 0.12);
}
function vending(x, z, ry) {
  const m = mats();
  const tx = canvasTex(128, 256, (g) => {
    g.fillStyle = '#0f1624'; g.fillRect(0, 0, 128, 256);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) { g.fillStyle = NEON[(r * 4 + c) % NEON.length]; g.fillRect(10 + c * 28, 20 + r * 44, 18, 32); g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(13 + c * 28, 24 + r * 44, 4, 24); }
    g.fillStyle = '#dfe8ff'; g.fillRect(0, 196, 128, 8); g.fillStyle = '#222'; g.fillRect(14, 214, 100, 30);
  });
  const front = new THREE.MeshBasicMaterial({ map: tx, toneMapped: false, color: new THREE.Color(1.6, 1.6, 1.6) });
  const body = M(pick(['#c8323c', '#2f6fb5', '#e8e2d6']), { r: 0.4, m: 0.3 });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1.9, 0.8), [body, body, body, body, front, body]);
  mesh.position.set(x, 0.95, z); mesh.rotation.y = ry; mesh.castShadow = true; add(mesh);
  pool(x + Math.sin(ry) * 1.0, z + Math.cos(ry) * 1.0, 1.6, '#bfe0ff', 0.35);
  const c = Math.abs(Math.sin(ry)) > 0.5; solid(x - (c ? 0.4 : 0.5), 0, z - (c ? 0.5 : 0.4), x + (c ? 0.4 : 0.5), 1.9, z + (c ? 0.5 : 0.4));
}
function trashBags(x, z) {
  const m = M('#1d1f24', { r: 0.35, m: 0.1 });
  for (let k = 0; k < 3 + (rr() * 3 | 0); k++) put(G.sph, m, x + (rr() - 0.5) * 1.1, 0.25, z + (rr() - 0.5) * 0.8, 0, rr() * 3, 0, 0.6 + rr() * 0.3, 0.5 + rr() * 0.2, 0.5 + rr() * 0.3);
}
function scooter(x, z, ry) {
  const m = mats(), c = M(pick(['#e05a3a', '#3a8ad6', '#e8c04a']), { r: 0.35, m: 0.3 });
  const f = (dx, dz) => [x + Math.cos(ry) * dx + Math.sin(ry) * dz, z - Math.sin(ry) * dx + Math.cos(ry) * dz];
  for (const dx of [-0.6, 0.6]) { const [a, b] = f(dx, 0); put(G.cyl, m.rubber, a, 0.25, b, 0, ry, Math.PI / 2, 0.5, 0.12, 0.5); }
  let [a, b] = f(0, 0); put(G.box, c, a, 0.5, b, 0, ry, 0, 1.2, 0.35, 0.38);
  [a, b] = f(-0.2, 0); put(G.box, m.trimDk, a, 0.8, b, 0, ry, 0, 0.6, 0.12, 0.34);
  [a, b] = f(0.55, 0); put(G.box, c, a, 0.85, b, 0, ry, -0.3, 0.15, 0.8, 0.3); put(G.box, m.steel, a + 0.1, 1.22, b, 0, ry, 0, 0.08, 0.06, 0.6);
}
function planter(x, z, w, d) {
  const m = mats();
  tblock(x, 0, z, w, 0.6, d, m.concrete, { solid: false });
  const leaf = M('#2f5a34', { r: 0.8 }), leaf2 = M('#3d6e3a', { r: 0.8 });
  for (let k = 0; k < Math.max(2, (w * d) | 0); k++) put(G.sph, rr() < 0.5 ? leaf : leaf2, x + (rr() - 0.5) * (w - 0.4), 0.75, z + (rr() - 0.5) * (d - 0.4), 0, rr() * 3, 0, 0.5 + rr() * 0.4, 0.45, 0.5 + rr() * 0.4);
}
function barrierJersey(x, z, len, ry, stripe = true) {
  const m = mats();
  const sh = new THREE.Shape(); sh.moveTo(-0.3, 0); sh.lineTo(0.3, 0); sh.lineTo(0.3, 0.12); sh.lineTo(0.12, 0.35); sh.lineTo(0.1, 0.8); sh.lineTo(-0.1, 0.8); sh.lineTo(-0.12, 0.35); sh.lineTo(-0.3, 0.12); sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth: len, bevelEnabled: false }); g.translate(0, 0, -len / 2);
  put(g, m.concrete, x, 0, z, 0, ry, 0);
  if (stripe) for (let t = -len / 2 + 0.3; t < len / 2 - 0.2; t += 0.6) put(G.box, t / 0.6 % 2 ? m.paintY : m.trimDk, x + Math.sin(ry) * t + Math.cos(ry) * 0.115, 0.6, z + Math.cos(ry) * t - Math.sin(ry) * 0.115, 0, ry, 0.0, 0.02, 0.14, 0.3, false);
}
function cone(x, z) { const m = M('#ff6a1a', { r: 0.6 }); put(G.cone, m, x, 0.35, z, 0, 0, 0, 0.32, 0.7, 0.32); put(G.box, m, x, 0.02, z, 0, 0, 0, 0.42, 0.04, 0.42); put(G.cyl, mats().paint, x, 0.42, z, 0, 0, 0, 0.17, 0.1, 0.17, false); }
function puddle(x, z, r) { const g = new THREE.CircleGeometry(1, 20); g.rotateX(-Math.PI / 2); const p = g.attributes.position; for (let i = 1; i < p.count; i++) { const k = 0.7 + rr() * 0.5; p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k * (0.6 + rr() * 0.2)); } put(g, mats().puddle, x, 0.012, z, 0, rr() * 3, 0, r, 1, r, false); }
function stringLights(x0, z0, x1, z1, y0, y1, sag = 0.8, col) {
  const m = mats(), n = Math.max(6, Math.hypot(x1 - x0, z1 - z0) / 0.9 | 0);
  const bm = col ? M(col, { e: new THREE.Color(col).getHex(), ei: 3.5 }) : m.bulb;
  let px = x0, py = y0, pz = z0;
  for (let i = 1; i <= n; i++) {
    const t = i / n, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t, y = y0 + (y1 - y0) * t - Math.sin(t * Math.PI) * sag;
    const L = Math.hypot(x - px, y - py, z - pz);
    _v.set(x - px, y - py, z - pz).normalize(); _q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), _v);
    _m.compose(new THREE.Vector3((x + px) / 2, (y + py) / 2, (z + pz) / 2), _q, _s.set(0.015, L, 0.015)); addMesh(G.cyl8, m.trimDk, _m, false);
    if (i < n) put(G.sph, bm, x, y - 0.1, z, 0, 0, 0, 0.11, 0.13, 0.11, false);
    px = x; py = y; pz = z;
  }
}
// 차 (옆모습 다각형을 밀어서 만듦)
function carGroup(col = '#2f8f94', kind = 'sedan') {
  const g = new THREE.Group(), m = mats();
  const L = kind === 'van' ? 4.6 : 4.3, H = kind === 'van' ? 1.9 : 1.42;
  const s = new THREE.Shape();
  if (kind === 'van') { s.moveTo(-L / 2, 0.3); s.lineTo(L / 2, 0.3); s.lineTo(L / 2, 1.0); s.lineTo(L / 2 - 0.5, 1.85); s.lineTo(-L / 2, 1.9); s.closePath(); }
  else { s.moveTo(-L / 2, 0.32); s.lineTo(L / 2, 0.32); s.lineTo(L / 2, 0.72); s.lineTo(L / 2 - 0.9, 0.82); s.lineTo(L / 2 - 1.6, 1.38); s.lineTo(-L / 2 + 1.05, 1.42); s.lineTo(-L / 2 + 0.25, 0.92); s.lineTo(-L / 2, 0.85); s.closePath(); }
  const body = new THREE.ExtrudeGeometry(s, { depth: 1.7, bevelEnabled: true, bevelSize: 0.08, bevelThickness: 0.08, bevelSegments: 2 }); body.translate(0, 0, -0.85);
  const paint = new THREE.MeshStandardMaterial({ color: col, roughness: 0.28, metalness: 0.55 });
  const bm = new THREE.Mesh(body, paint); g.add(bm);
  // 유리
  const w = new THREE.Shape();
  if (kind === 'van') { w.moveTo(L / 2 - 0.05, 1.05); w.lineTo(L / 2 - 0.55, 1.78); w.lineTo(L / 2 - 1.6, 1.8); w.lineTo(L / 2 - 1.6, 1.05); w.closePath(); }
  else { w.moveTo(L / 2 - 0.95, 0.86); w.lineTo(L / 2 - 1.62, 1.33); w.lineTo(-L / 2 + 1.1, 1.36); w.lineTo(-L / 2 + 0.35, 0.92); w.closePath(); }
  const wg = new THREE.ExtrudeGeometry(w, { depth: 1.86, bevelEnabled: false }); wg.translate(0, 0, -0.93);
  g.add(new THREE.Mesh(wg, m.glass));
  for (const [x, z] of [[L / 2 - 0.85, 0.82], [-L / 2 + 0.85, 0.82], [L / 2 - 0.85, -0.82], [-L / 2 + 0.85, -0.82]]) {
    const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.26, 16), m.rubber); wh.rotation.x = Math.PI / 2; wh.position.set(x, 0.36, z); g.add(wh);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.28, 10), m.steel); hub.rotation.x = Math.PI / 2; hub.position.set(x, 0.36, z); g.add(hub);
  }
  for (const z of [-0.6, 0.6]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.12, 0.34), m.glowW); hl.position.set(L / 2 + 0.07, 0.62, z); g.add(hl);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, 0.3), m.glowR); tl.position.set(-L / 2 - 0.07, 0.72, z); g.add(tl);
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}
function parkedCar(x, z, ry, col, kind, solidIt = true) {
  const c = carGroup(col, kind); c.position.set(x, 0, z); c.rotation.y = ry; add(c);
  if (solidIt) { const L = 2.2, Wd = 0.95, cx = Math.abs(Math.cos(ry)), sx = Math.abs(Math.sin(ry)); solid(x - (cx * L + sx * Wd), 0, z - (sx * L + cx * Wd), x + (cx * L + sx * Wd), 1.4, z + (sx * L + cx * Wd)); }
  return c;
}
// 공중에 멈춘 콘크리트 덩어리
function chunkGeo(s) {
  const g = new THREE.IcosahedronGeometry(1, 1); const p = g.attributes.position;
  const seed = rr() * 10;
  for (let i = 0; i < p.count; i++) { _v.fromBufferAttribute(p, i); const k = 0.7 + 0.45 * Math.abs(Math.sin(_v.x * 3.1 + seed) * Math.cos(_v.y * 2.7 + seed * 2) + Math.sin(_v.z * 4.3)); _v.multiplyScalar(k); p.setXYZ(i, _v.x * s, _v.y * s * 0.7, _v.z * s); }
  g.computeVertexNormals(); return g;
}

// ------------------------------------------------------------ 하늘 · 먼 도시 · 하늘 시계
let skyTex;
export function buildSky(scene) {
  const old = scene.getObjectByName('skyroot'); if (old) scene.remove(old);
  const root = new THREE.Group(); root.name = 'skyroot';
  const geo = new THREE.SphereGeometry(500, 48, 24);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { sunDir: { value: new THREE.Vector3(-0.75, 0.12, -0.45).normalize() } },
    vertexShader: `varying vec3 vD; void main(){ vD = normalize(position); vec4 p = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w; }`,
    fragmentShader: `varying vec3 vD; uniform vec3 sunDir;
      float h(vec3 p){ p = fract(p*vec3(443.897,441.423,437.195)); p += dot(p, p.yzx+19.19); return fract((p.x+p.y)*p.z); }
      void main(){
        vec3 d = normalize(vD); float y = d.y;
        vec3 top = vec3(0.035,0.045,0.13), mid = vec3(0.16,0.12,0.30), hor = vec3(0.55,0.27,0.30);
        vec3 c = mix(hor, mid, smoothstep(-0.02, 0.18, y)); c = mix(c, top, smoothstep(0.15, 0.7, y));
        float s = max(dot(d, sunDir), 0.0);
        c += vec3(1.0,0.45,0.18) * pow(s, 6.0) * 0.55 * smoothstep(-0.1, 0.25, 0.25 - y);
        c += vec3(1.0,0.6,0.3) * pow(s, 60.0) * 0.6;
        // 도시 불빛 안개(지평선)
        c += vec3(0.35,0.18,0.12) * exp(-abs(y) * 14.0) * 0.6;
        // 별
        vec3 q = floor(d * 380.0); float st = step(0.9975, h(q)) * smoothstep(0.12, 0.5, y);
        c += vec3(0.9,0.9,1.0) * st * (0.6 + 0.4 * h(q + 3.0));
        if (y < 0.0) c = mix(c, vec3(0.08,0.06,0.10), smoothstep(0.0, -0.15, y));
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(geo, mat); sky.renderOrder = -10; sky.frustumCulled = false; root.add(sky);
  // 하늘에 떠 있는 거대한 깨진 시계 (북·남 하나씩)
  for (const [z, broken] of [[-1, false], [1, true]]) {
    const R = 70, tx = canvasTex(1024, 1024, (g) => {
      g.clearRect(0, 0, 1024, 1024); g.translate(512, 512);
      g.strokeStyle = 'rgba(255,190,120,0.9)'; g.lineWidth = 14; g.beginPath(); g.arc(0, 0, 490, 0, 7); g.stroke();
      g.lineWidth = 4; g.beginPath(); g.arc(0, 0, 450, 0, 7); g.stroke();
      g.fillStyle = 'rgba(255,200,140,0.85)'; g.font = `700 70px serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      const RN = ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
      for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; g.fillText(RN[i], Math.sin(a) * 380, -Math.cos(a) * 380); }
      for (let i = 0; i < 60; i++) { const a = i / 60 * Math.PI * 2; g.fillRect(Math.sin(a) * 440 - 3, -Math.cos(a) * 440 - 3, 6, 6); }
      const hand = (a, l, w) => { g.save(); g.rotate(a); g.fillRect(-w / 2, -l, w, l + 30); g.restore(); };
      hand((3 + 17 / 60) / 12 * Math.PI * 2, 240, 22); hand(17 / 60 * Math.PI * 2, 360, 12);
      if (broken) { g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.moveTo(80, -520); g.lineTo(260, -120); g.lineTo(140, 60); g.lineTo(420, 300); g.lineTo(560, 200); g.lineTo(560, -560); g.closePath(); g.fill(); g.globalCompositeOperation = 'source-over'; }
      g.strokeStyle = 'rgba(255,170,100,0.7)'; g.lineWidth = 3; g.beginPath(); g.moveTo(-300, -200); g.lineTo(-60, 20); g.lineTo(-120, 330); g.moveTo(-60, 20); g.lineTo(230, -40); g.stroke();
    });
    const cm = new THREE.MeshBasicMaterial({ map: tx, transparent: true, depthWrite: false, fog: false, toneMapped: false, color: new THREE.Color(2.2, 1.5, 1.0), opacity: 0.9, blending: THREE.AdditiveBlending });
    const clock = new THREE.Mesh(new THREE.PlaneGeometry(R * 2, R * 2), cm);
    clock.position.set(z < 0 ? -40 : 50, 70, z * 260); clock.lookAt(0, 20, 0); clock.renderOrder = -9; root.add(clock);
    // 시계 조각이 주변에 떠 있음
    for (let i = 0; i < 14; i++) {
      const sh = new THREE.Mesh(new THREE.PlaneGeometry(6 + Math.random() * 10, 2 + Math.random() * 6), cm);
      sh.position.copy(clock.position).add(new THREE.Vector3((Math.random() - 0.5) * 220, (Math.random() - 0.4) * 120, (Math.random() - 0.5) * 40));
      sh.lookAt(0, 20, 0); sh.rotateZ(Math.random() * 6); sh.renderOrder = -9; root.add(sh);
    }
  }
  scene.add(root);
  return { root, sunDir: mat.uniforms.sunDir.value };
}

function skyline(X0, X1, Z0, Z1) {
  const m = mats();
  // 바깥 테두리 건물 뒤로 겹겹이
  const ring = (dist, hmin, hmax, step) => {
    for (let z = Z0 - dist; z < Z1 + dist; z += step) for (const sd of [-1, 1]) {
      const x = sd < 0 ? X0 - dist - rr() * 6 : X1 + dist + rr() * 6, h = hmin + rr() * (hmax - hmin), w = 8 + rr() * 8, d = step - 1;
      const fut = sd > 0; tblock(x, 0, z, w, h, d, fut ? m.farF : (rr() < 0.5 ? m.farP : m.farP2), { solid: false, cast: false, u0: rr() * 10 });
      if (rr() < 0.3) put(G.sph, fut ? m.glowO : m.glowR, x, h + 0.3, z, 0, 0, 0, 0.5, 0.5, 0.5, false);
    }
    for (let x = X0 - dist; x < X1 + dist; x += step) for (const sd of [-1, 1]) {
      const z = sd < 0 ? Z0 - dist - rr() * 6 : Z1 + dist + rr() * 6, h = hmin + rr() * (hmax - hmin);
      const fut = x > 0; tblock(x, 0, z, step - 1, h, 8 + rr() * 8, fut ? m.farF : (rr() < 0.5 ? m.farP : m.farP2), { solid: false, cast: false, u0: rr() * 10 });
    }
  };
  ring(14, 18, 34, 12); ring(34, 26, 60, 16); ring(62, 35, 85, 22);
}

// ------------------------------------------------------------ 맵 짓기
function buildCity(D, ctx, theme) {
  rng = theme.seed; anim.length = 0; beacons.length = 0;
  const m = mats();
  const B = D.bounds; W.bounds = { x0: B.x[0], x1: B.x[1], z0: B.z[0], z1: B.z[1] };
  const X0 = B.x[0], X1 = B.x[1], Z0 = B.z[0], Z1 = B.z[1];
  const fut = (x) => x > 0;

  // 바닥: 가운데 차도(아스팔트) + 양옆 보도
  tblock(0, -1, 0, X1 - X0 + 40, 1, Z1 - Z0 + 40, m.asphalt, { cast: false });
  for (const sd of [-1, 1]) {
    const xe = sd < 0 ? X0 : X1;
    tblock(xe - sd * 1.75, -0.98, 0, 3.5, 1, Z1 - Z0, m.paving, { solid: false, cast: false });
    boxAt(xe - sd * 3.55, 0, 0, 0.15, 0.06, Z1 - Z0, m.curb, { cast: false });
  }
  // 출발 구역 바닥
  for (const s of [-1, 1]) tblock(0, -0.985, s * (Z1 - 4.5), 28, 1, 9, m.paving, { solid: false, cast: false });
  // 차선·횡단보도
  for (const s of [-1, 1]) {
    for (let x = -12; x <= 12; x += 1.6) boxAt(x, 0.005, s * 16.5, 0.8, 0.012, 3.2, m.paint, { cast: false });
    for (let z = 22; z < 40; z += 4) for (const lx of [-9, 9]) boxAt(lx, 0.005, s * z, 0.18, 0.012, 2, m.paint, { cast: false });
  }
  for (const lx of [-17.5, 17.5]) boxAt(lx, 0.005, 0, 0.14, 0.012, Z1 - Z0 - 20, m.paintY, { cast: false });
  // 시간 단층선: 들쭉날쭉 빛나는 균열 + 양옆 탄 자국
  for (let z = Z0; z < Z1; z += 1.4) {
    const x = Math.sin(z * 0.7) * 0.35 + Math.sin(z * 2.3) * 0.12, ry = Math.sin(z) * 0.35;
    boxAt(x, 0.004, z + 0.7, 0.22 + rr() * 0.12, 0.03, 1.5, m.glowO, { ry, cast: false });
    if (rr() < 0.4) boxAt(x + (rr() - 0.5) * 0.8, 0.004, z + 0.7, 0.06, 0.02, 0.6 + rr(), m.glowO, { ry: ry + (rr() - 0.5) * 1.6, cast: false });
  }
  for (let z = Z0 + 4; z < Z1 - 4; z += 6) pool(0, z, 2.6, '#ff8a3a', 0.45);
  // 물웅덩이
  for (let k = 0; k < 16; k++) puddle(X0 + 5 + rr() * (X1 - X0 - 10), Z0 + 8 + rr() * (Z1 - Z0 - 16), 0.7 + rr() * 1.4);

  // 바깥 건물(맵 테두리): 10 m마다 다른 건물
  for (let z = Z0; z < Z1; z += 10) for (const sd of [-1, 1]) {
    const x = sd < 0 ? X0 - 1.5 : X1 + 1.5, f = sd > 0, h = (f ? 13 : 14) + rr() * 9;
    building(x - sd * 0, z + 5, 3, 10, h, f ? 'F' : 'P', { faces: [sd < 0 ? 'x+' : 'x-'] });
    // 건물 뒤를 막는 큰 덩어리(보이지 않는 쪽)
    tblock(x + sd * 4, 0, z + 5, 5, h - 1, 10, f ? m.concreteDk : m.brickDk, { solid: false, cast: false });
  }
  for (const sz of [-1, 1]) for (let x = X0; x < X1; x += 10) {
    const z = sz < 0 ? Z0 - 1.5 : Z1 + 1.5, f = x + 5 > 0, h = 12 + rr() * 8;
    building(x + 5, z, 10, 3, h, f ? 'F' : 'P', { faces: [sz < 0 ? 'z+' : 'z-'] });
  }

  // 설계 데이터 → 모양
  const ARCHS = [];
  for (const s of D.solids) {
    const y = s.y || 0, F = fut(s.x), tag = s.tag;
    if (s.type === 'cyl') {
      // 광장 원판
      const g = new THREE.CylinderGeometry(s.r, s.r + 0.1, s.h, 64);
      put(g, m.plaza, s.x, y + s.h / 2, s.z, 0, 0, 0, 1, 1, 1, true);
      const r = s.r;
      solid(s.x - r * 0.92, y, s.z - r * 0.55, s.x + r * 0.92, y + s.h, s.z + r * 0.55);
      solid(s.x - r * 0.55, y, s.z - r * 0.92, s.x + r * 0.55, y + s.h, s.z + r * 0.92);
      solid(s.x - r * 0.78, y, s.z - r * 0.78, s.x + r * 0.78, y + s.h, s.z + r * 0.78);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r - 0.25, 0.05, 6, 120), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.2, 0.4), toneMapped: false }));
      ring.rotation.x = Math.PI / 2; ring.position.set(s.x, y + s.h + 0.01, s.z); add(ring);
      // 광장 바닥 시계 눈금
      for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; boxAt(s.x + Math.sin(a) * (r - 1.1), y + s.h, s.z + Math.cos(a) * (r - 1.1), 0.25, 0.02, i % 3 ? 0.7 : 1.3, m.brass, { ry: a, cast: false }); }
      continue;
    }
    const b = (mat, o = {}) => tblock(s.x, y, s.z, s.w, s.h, s.d, mat, o);
    switch (tag) {
      case 'bldP': case 'bldF': {
        const extra = 3.2 * (1 + (rr() * 2 | 0));
        building(s.x, s.z, s.w, s.d, s.h + extra, tag === 'bldP' ? 'P' : 'F');
        break;
      }
      case 'wallP': case 'wallF':
        b(tag === 'wallP' ? m.brick : m.concrete);
        boxAt(s.x, y + s.h, s.z, s.w + 0.16, 0.16, s.d + 0.16, tag === 'wallP' ? m.brickDk : m.concreteDk);
        break;
      case 'arch':
        b(F ? m.concrete : m.brick); ARCHS.push(s);
        boxAt(s.x, y, s.z, s.w + 0.3, 0.5, s.d + 0.3, m.concreteDk);
        break;
      case 'archTop': {
        b(m.brickDk);
        // 시장 대문 간판 (양쪽 면)
        const tex = neonSign(theme.gateText || '경계시장', '#ffb03d', false, '#1a0f14');
        for (const sd of [-1, 1]) signPlane(tex, 8, 1.6, s.x, y + 0.5 + 0.9, s.z + sd * (s.d / 2 + 0.02), sd > 0 ? 0 : Math.PI, 2.6);
        stringLights(s.x - s.w / 2, s.z + s.d / 2 + 0.05, s.x + s.w / 2, s.z + s.d / 2 + 0.05, y + 1.1, y + 1.1, 0.5);
        stringLights(s.x - s.w / 2, s.z - s.d / 2 - 0.05, s.x + s.w / 2, s.z - s.d / 2 - 0.05, y + 1.1, y + 1.1, 0.5);
        break;
      }
      case 'low':
        if (F) { b(m.concrete); for (let t = -s.w / 2 + 0.2; t < s.w / 2; t += 0.5) boxAt(s.x + t, y + s.h - 0.25, s.z + s.d / 2 + 0.005, 0.25, 0.18, 0.01, m.paintY, { cast: false, rz: 0.6 }); }
        else { b(m.brick); boxAt(s.x, y + s.h, s.z, s.w + 0.1, 0.1, s.d + 0.1, m.concreteDk); const leaf = M('#355f38', { r: 0.8 }); for (let k = 0; k < 3; k++) put(G.sph, leaf, s.x + (rr() - 0.5) * (s.w - 0.5), y + s.h + 0.15, s.z, 0, rr() * 3, 0, 0.6, 0.4, Math.min(0.7, s.d)); }
        break;
      case 'crate':
        if (F) { b(m.metalDk); boxAt(s.x, y + s.h, s.z, s.w + 0.04, 0.05, s.d + 0.04, m.paintY, { cast: false }); }
        else {
          b(m.wood);
          for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) boxAt(s.x + dx * (s.w / 2 - 0.04), y, s.z + dz * (s.d / 2 - 0.04), 0.1, s.h, 0.1, m.wood, { cast: false });
          if (s.h < 1.5 && rr() < 0.6) boxAt(s.x + (rr() - 0.5) * 0.3, y + s.h, s.z + (rr() - 0.5) * 0.3, s.w * 0.55, s.h * 0.45, s.d * 0.55, m.wood, { ry: rr() });
        }
        break;
      case 'stall': {
        b(m.wood);
        const aw = M(pick(['#c8323c', '#2f7fb5', '#d99a2a', '#3a9a5a']), { r: 0.85 });
        for (const [dx, dz] of [[-1, -1], [1, 1], [-1, 1], [1, -1]]) put(G.cyl8, m.steel, s.x + dx * (s.w / 2 + 0.2), y + 1.25, s.z + dz * (s.d / 2 + 0.2), 0, 0, 0, 0.06, 2.5, 0.06);
        boxAt(s.x, y + 2.45, s.z, s.w + 0.8, 0.08, s.d + 0.8, aw, { rz: 0.08 });
        for (let k = 0; k < 6; k++) boxAt(s.x + (rr() - 0.5) * (s.w - 0.5), y + s.h, s.z + (rr() - 0.5) * (s.d - 0.5), 0.35 + rr() * 0.2, 0.2 + rr() * 0.25, 0.35, M(pick(['#e76f51', '#e9c46a', '#8ab17d', '#f2e3c9', '#b5838d']), { r: 0.7 }), { ry: rr() });
        for (let t = -s.d / 2; t <= s.d / 2; t += 0.8) put(G.sph, m.bulb, s.x + s.w / 2 + 0.3, y + 2.3, s.z + t, 0, 0, 0, 0.1, 0.1, 0.1, false);
        pool(s.x, s.z, Math.max(s.w, s.d) * 0.9, '#ffb060', 0.6);
        break;
      }
      case 'terrace':
        b(m.brick);
        tblock(s.x, y + s.h - 0.02, s.z, s.w + 0.1, 0.04, s.d + 0.1, m.paving, { solid: false, cast: false });
        boxAt(s.x, y + s.h - 0.25, s.z + s.d / 2 + 0.05, s.w + 0.12, 0.25, 0.12, m.concreteDk);
        stringLights(s.x - s.w / 2, s.z - s.d / 2, s.x + s.w / 2, s.z + s.d / 2, y + s.h + 3, y + s.h + 3, 0.6);
        stringLights(s.x - s.w / 2, s.z + s.d / 2, s.x + s.w / 2, s.z - s.d / 2, y + s.h + 3, y + s.h + 3, 0.6, '#ff8ac0');
        for (const [dx, dz] of [[-1, -1], [1, 1], [-1, 1], [1, -1]]) put(G.cyl8, m.steel, s.x + dx * (s.w / 2 - 0.1), y + s.h + 1.5, s.z + dz * (s.d / 2 - 0.1), 0, 0, 0, 0.06, 3, 0.06);
        pool(s.x, s.z, 4, '#ffb46a', 0.25, y + s.h + 0.03);
        break;
      case 'parapet':
        b(m.concrete); boxAt(s.x, y + s.h, s.z, s.w + 0.06, 0.06, s.d + 0.06, m.glowO, { cast: false });
        break;
      case 'stairs': case 'rubble':
        b(F || tag === 'rubble' ? m.concrete : m.brick);
        boxAt(s.x, y + s.h - 0.03, s.z - (s.z > 0 ? 1 : -1) * (s.d / 2 - 0.05), s.w, 0.03, 0.1, tag === 'rubble' ? m.concreteDk : m.paintY, { cast: false });
        if (tag === 'rubble' && rr() < 0.7) for (let k = 0; k < 2; k++) put(chunkGeo(0.25 + rr() * 0.3), m.concrete, s.x + (rr() < 0.5 ? -1 : 1) * (s.w / 2 + 0.2), y + s.h * 0.3, s.z + (rr() - 0.5) * s.d, rr(), rr() * 3, rr());
        break;
      case 'overpass': {
        b(m.concrete);
        // 옆면 철판 + 고가 밑 빛 줄
        for (const sd of [-1, 1]) {
          tblock(s.x + sd * (s.w / 2 + 0.04), y + s.h - 0.9, s.z, 0.08, 0.9, s.d, m.metal, { solid: false });
          boxAt(s.x + sd * (s.w / 2 + 0.1), y + 0.4, s.z, 0.05, 0.06, s.d - 1, m.glowC, { cast: false });
        }
        for (let z = s.z - s.d / 2 + 1.5; z < s.z + s.d / 2; z += 4) tblock(s.x + s.w / 2 + 0.3, 0, z, 0.6, s.h - 0.9, 0.6, m.concreteDk, { solid: false });
        pool(s.x + s.w / 2 + 1.2, s.z, 3, '#4fd8ff', 0.25);
        break;
      }
      case 'rail':
        // 난간: 기둥 + 위 손잡이 + 아래 철판
        for (let z = s.z - s.d / 2 + 0.2; z <= s.z + s.d / 2; z += 1.5) put(G.box, m.steel, s.x, y + 0.5, z, 0, 0, 0, 0.08, 1, 0.08);
        boxAt(s.x, y + 0.95, s.z, 0.1, 0.08, s.d, m.steel);
        tblock(s.x, y, s.z, 0.06, 0.55, s.d, m.metalDk, { solid: false });
        solid(s.x - s.w / 2, y, s.z - s.d / 2, s.x + s.w / 2, y + s.h, s.z + s.d / 2);
        break;
      case 'rubbleBlk':
        b(m.concreteDk);
        for (let k = 0; k < 4; k++) put(chunkGeo(0.3 + rr() * 0.5), m.concrete, s.x + (rr() - 0.5) * (s.w + 1), y + 0.2, s.z + (rr() - 0.5) * (s.d + 1), rr(), rr() * 3, rr());
        put(G.cyl8, m.steel, s.x + 0.4, y + s.h + 0.4, s.z, 0.3, 0, 0.4, 0.04, 1.4, 0.04); put(G.cyl8, m.steel, s.x - 0.3, y + s.h + 0.3, s.z + 0.3, -0.5, 0, 0.2, 0.04, 1.1, 0.04);
        break;
      case 'core': {
        // 멈춘 시계탑의 밑동: 돌 받침 + 네 면 깨진 시계
        b(m.brickDk);
        boxAt(s.x, y + s.h, s.z, s.w + 0.3, 0.3, s.d + 0.3, m.concreteDk);
        boxAt(s.x, y, s.z, s.w + 0.4, 0.4, s.d + 0.4, m.concreteDk);
        ctx.clockFaces = [];
        for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) clockOn(s.x + nx * (s.w / 2 + 0.02), y + s.h * 0.55, s.z + nz * (s.d / 2 + 0.02), 0.85, Math.atan2(nx, nz), nx + nz > 0);
        break;
      }
      case 'pillar':
        b(m.concrete);
        boxAt(s.x, y + s.h, s.z, s.w + 0.25, 0.3, s.d + 0.25, m.concreteDk);
        boxAt(s.x, y + s.h + 0.3, s.z, s.w * 0.6, 0.08, s.d * 0.6, m.glowO, { cast: false });
        put(chunkGeo(0.4), m.concrete, s.x + 0.2, y + s.h + 0.9, s.z - 0.1, 0.4, 1, 0.2);
        break;
      default:
        b(F ? m.concrete : m.brick);
    }
  }

  // ---------------------------------------------------- 거리 장식 (대칭: z 양쪽)
  for (const sz of [-1, 1]) {
    // 현재 쪽 골목: 줄전구가 건물 사이를 가로지름
    for (const z of [26, 31, 36]) stringLights(X0 + 0.2, sz * z, -17, sz * (z + 1.5), 6.2, 5.6, 0.9, z === 31 ? '#ff7ab8' : undefined);
    stringLights(X0 + 0.2, sz * 4, -19, sz * 6, 6.5, 4.4, 0.7);
    // 가로등
    streetLamp(X0 + 2.6, sz * 30.5, Math.PI / 2, true); streetLamp(X0 + 2.6, sz * 14, Math.PI / 2, true);
    streetLamp(X1 - 2.6, sz * 29, -Math.PI / 2, false); streetLamp(X1 - 2.6, sz * 8, -Math.PI / 2, false, true);
    streetLamp(-10.5, sz * 9.5, Math.PI / 2, true); streetLamp(10.5, sz * 9.5, -Math.PI / 2, false);
    // 자판기 · 쓰레기 · 오토바이 · 화분
    vending(X0 + 0.45, sz * 23.5, Math.PI / 2); vending(X0 + 0.45, sz * 24.6, Math.PI / 2);
    trashBags(X0 + 0.8, sz * 33.5); scooter(X0 + 1.4, sz * 40, 0.3); scooter(-16.3, sz * 29.5, 1.4);
    planter(X0 + 0.55, sz * 6, 0.9, 2.2);
    // 미래 쪽: 방호벽 · 콘 · 버려진 차
    barrierJersey(X1 - 1.4, sz * 36, 3, 0); barrierJersey(17.2, sz * 17.5, 2.6, Math.PI / 2 + 0.15);
    cone(X1 - 2.2, sz * 31.2); cone(X1 - 1.7, sz * 32.4); cone(18.4, sz * 20);
    parkedCar(X1 - 1.5, sz * 15.5, Math.PI / 2 + 0.12 * sz, '#4a4f58', 'sedan');
    trashBags(X1 - 0.8, sz * 22);
  }
  parkedCar(X0 + 1.6, 18.7, Math.PI / 2, '#b8323c', 'van'); parkedCar(X0 + 1.6, -18.7, -Math.PI / 2, '#e8e2d6', 'sedan');

  // ---------------------------------------------------- 가운데: 공중에 멈춘 잔해와 시간 결정
  const cy = theme.coreY;
  for (let i = 0; i < 46; i++) {
    const a = rr() * Math.PI * 2, r = 2.5 + rr() * 9, s = 0.15 + rr() * 0.55;
    put(chunkGeo(s), i % 6 ? m.concrete : m.brick, Math.cos(a) * r, 4.6 + rr() * 5.5, Math.sin(a) * r, rr() * 3, rr() * 3, rr() * 3, 1, 1, 1);
  }
  // 깨진 유리 조각(빛을 받아 반짝)
  const shard = new THREE.MeshStandardMaterial({ color: 0x9fd8ff, roughness: 0.05, metalness: 0.9, transparent: true, opacity: 0.55, side: THREE.DoubleSide, emissive: 0x2a5070, emissiveIntensity: 0.5 });
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute([0, 0.5, 0, -0.3, -0.4, 0, 0.35, -0.3, 0], 3)); sg.computeVertexNormals();
  const shards = new THREE.InstancedMesh(sg, shard, 60);
  for (let i = 0; i < 60; i++) { const a = rr() * Math.PI * 2, r = 2 + rr() * 8; _e.set(rr() * 6, rr() * 6, rr() * 6); _q.setFromEuler(_e); const s = 0.3 + rr() * 0.6; _m.compose(_v.set(Math.cos(a) * r, 4.2 + rr() * 6, Math.sin(a) * r), _q, _s.set(s, s, s)); shards.setMatrixAt(i, _m); }
  add(shards);
  // 떠 있는 차 두 대 (아주 천천히 흔들림 = 시간이 덜 멈춤)
  for (const [x, y, z, rx, ry, rz, col, kind] of [[1.5, 7.6, 2.5, 0.35, 0.6, -0.5, '#2f8f94', 'sedan'], [-5, 9.2, -3.5, -0.4, 2.1, 0.3, '#d6406a', 'sedan'], [6, 10.5, -6, 0.2, -0.8, 0.9, '#e8c04a', 'van']]) {
    const c = carGroup(col, kind); c.position.set(x, y, z); c.rotation.set(rx, ry, rz); add(c);
    const ph = rr() * 6; anim.push((dt, t) => { c.position.y = y + Math.sin(t * 0.6 + ph) * 0.08; c.rotation.z = rz + Math.sin(t * 0.4 + ph) * 0.01; });
  }
  // 시간 결정 + 멈춘 톱니바퀴
  const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.9, 0), new THREE.MeshStandardMaterial({ color: 0xffa050, emissive: 0xff7a1a, emissiveIntensity: 1.25, roughness: 0.15, metalness: 0.1 }));
  crystal.scale.set(0.9, 1.4, 0.9); crystal.position.set(0, cy, 0); add(crystal); ctx.core = crystal; ctx.coreY = cy;
  const inner = new THREE.Mesh(new THREE.OctahedronGeometry(1.25, 0), new THREE.MeshBasicMaterial({ color: 0xff9a40, transparent: true, opacity: 0.18, wireframe: true }));
  inner.position.copy(crystal.position); add(inner);
  const gears = [];
  for (const [r, teeth, y, tilt, spd] of [[1.9, 18, cy, 0.25, 0.12], [1.3, 12, cy + 0.9, -0.5, -0.2], [2.6, 26, cy - 0.6, 0.6, 0.06]]) {
    const gm = new THREE.Mesh(gearGeo(r, teeth), m.brass); gm.position.set(0, y, 0); gm.rotation.set(Math.PI / 2 + tilt, 0, tilt * 0.6); gm.castShadow = true; add(gm); gears.push([gm, spd]);
  }
  anim.push((dt, t) => {
    crystal.rotation.y += dt * 0.6; crystal.position.y = cy + Math.sin(t * 1.3) * 0.12; inner.rotation.y -= dt * 0.25; inner.rotation.x += dt * 0.1;
    // 톱니는 째깍째깍 갔다가 되돌아감(고장 난 시간)
    for (const [g, s] of gears) { const tk = Math.floor(t * 2) + Math.min(1, (t * 2 % 1) * 6); g.rotateZ(0); g.userData.a = (g.userData.a || 0); const target = Math.sin(tk * 0.5) * 0.4 * Math.sign(s); g.userData.a += (target - g.userData.a) * Math.min(1, dt * 10); g.rotation.y = g.userData.a; }
  });
  const coreLight = new THREE.PointLight(0xff8a2a, 38, 22, 1.7); coreLight.position.set(0, cy + 0.2, 0); add(coreLight); ctx.coreLight = coreLight;
  pool(0, 0, 8, '#ff9a4a', 0.35, 0.43);

  // 몇 개 안 되는 진짜 점광원 (나머지는 바닥 빛 웅덩이로 흉내)
  for (const sz of [-1, 1]) {
    const lp = new THREE.PointLight(0xffa860, 26, 16, 1.8); lp.position.set(-27, 4.5, sz * 30); add(lp);
    const lf = new THREE.PointLight(0x4fd8ff, 18, 14, 1.8); lf.position.set(27, 4.2, sz * 18); add(lf);
  }

  // 출발 구역: 팀 색 문 + 바닥 고리 + 시계
  const TEAM_COL = { blue: 0x3db8ff, red: 0xff4d5e };
  for (const t of ['blue', 'red']) {
    const s = t === 'blue' ? 1 : -1, col = TEAM_COL[t], gz = ctx.def.gateZ * s;
    const ring = new THREE.Mesh(new THREE.RingGeometry(3.5, 4, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(1.5), toneMapped: false, transparent: true, opacity: 0.8 }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(0, 0.03, ctx.def.spawnZ * s); add(ring);
    pool(0, ctx.def.spawnZ * s, 6, col, 0.3);
    const w = ctx.def.spawnHalfW * 2;
    const gm = new THREE.Mesh(new THREE.BoxGeometry(w, 6, 0.2), new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(1.3), transparent: true, opacity: 0.25, toneMapped: false, depthWrite: false }));
    gm.position.set(0, 3, gz - s * 0.8); add(gm);
    const gb = { min: new THREE.Vector3(-w / 2, 0, gz - s * 0.8 - 0.15), max: new THREE.Vector3(w / 2, 6, gz - s * 0.8 + 0.15), dyn: true };
    boxes.push(gb); ctx.gates.push({ mesh: gm, box: gb });
    clockOn(0, 6.5, s > 0 ? Z1 + 0.04 : Z0 - 0.04, 1.6, s > 0 ? Math.PI : 0, false);
  }
  // 아치 위 시계
  clockOn(0, 4.4, 20.05, 1.3, 0); clockOn(0, 4.4, -20.05, 1.3, Math.PI, true);

  // 미래 쪽 경고등 깜빡임
  if (beacons.length) {
    const bm = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 1.2, 0.3), toneMapped: false });
    const inst = new THREE.InstancedMesh(new THREE.SphereGeometry(0.22, 8, 6), bm, beacons.length);
    beacons.forEach((p, i) => { _m.compose(_v.set(...p), _q.identity(), _s.set(1, 1, 1)); inst.setMatrixAt(i, _m); });
    add(inst); anim.push((dt, t) => { bm.color.setRGB(3, 1.2, 0.3).multiplyScalar(Math.sin(t * 4) > 0 ? 1 : 0.1); });
  }

  skyline(X0, X1, Z0, Z1);
  flushPools(); flushCones();
  for (const p of D.pickups) ctx.packs.push([p.x, null, p.z]);
}

function clockOn(x, y, z, r, ry, broken = false) {
  const tx = canvasTex(256, 256, (g) => {
    g.fillStyle = broken ? '#d8cfbd' : '#f3ecdc'; g.beginPath(); g.arc(128, 128, 124, 0, 7); g.fill();
    g.strokeStyle = '#2a2622'; g.lineWidth = 8; g.stroke();
    g.fillStyle = '#2a2622'; g.font = '700 28px serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const RN = ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; g.fillText(RN[i], 128 + Math.sin(a) * 96, 128 - Math.cos(a) * 96); }
    const hand = (a, l, wd) => { g.save(); g.translate(128, 128); g.rotate(a); g.fillRect(-wd / 2, -l, wd, l + 12); g.restore(); };
    hand((3 + 17 / 60) / 12 * Math.PI * 2, 58, 9); hand(17 / 60 * Math.PI * 2, 86, 5);
    g.fillStyle = '#ff7a1a'; hand(42 / 60 * Math.PI * 2, 92, 3);
    if (broken) { g.strokeStyle = '#3a332c'; g.lineWidth = 3; g.beginPath(); g.moveTo(40, 60); g.lineTo(130, 120); g.lineTo(150, 230); g.moveTo(130, 120); g.lineTo(220, 90); g.stroke(); }
  });
  const face = new THREE.Mesh(new THREE.CircleGeometry(r, 40), new THREE.MeshStandardMaterial({ map: tx, roughness: 0.5, emissive: 0xffe6c0, emissiveMap: tx, emissiveIntensity: 0.55 }));
  face.position.set(x, y, z); face.rotation.y = ry; add(face);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(r, r * 0.08, 8, 40), mats().brass); rim.position.copy(face.position); rim.rotation.y = ry; add(rim);
}
function gearGeo(r, teeth) {
  const s = new THREE.Shape(), ri = r * 0.86;
  for (let i = 0; i < teeth; i++) {
    const a0 = i / teeth * Math.PI * 2, a1 = (i + 0.25) / teeth * Math.PI * 2, a2 = (i + 0.5) / teeth * Math.PI * 2, a3 = (i + 0.75) / teeth * Math.PI * 2;
    const P = (a, rad) => [Math.cos(a) * rad, Math.sin(a) * rad];
    if (i === 0) s.moveTo(...P(a0, ri)); else s.lineTo(...P(a0, ri));
    s.lineTo(...P(a1, r)); s.lineTo(...P(a2, r)); s.lineTo(...P(a3, ri));
  }
  s.closePath();
  const hole = new THREE.Path(); hole.absarc(0, 0, r * 0.55, 0, Math.PI * 2, true); s.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.12, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 1, curveSegments: 6 });
  g.translate(0, 0, -0.06);
  // 바퀴살
  const spokes = [];
  for (let k = 0; k < 4; k++) { const b = new THREE.BoxGeometry(r * 1.15, 0.1, 0.1); b.rotateZ(k * Math.PI / 4); spokes.push(b.toNonIndexed()); }
  return g;
}

export const MAPS = {
  market: {
    name: '경계 시장', sub: '작고 빠른 거점전', lore: '시장 거리 한가운데로 시간 단층선이 지나간다. 왼쪽은 아직 장사 중인 현재, 오른쪽은 녹슨 미래. 거점은 시계가 멈춘 낮은 광장.',
    spawnZ: 46, gateZ: 42, spawnHalfW: 14, pointR: 7.5, sun: [-45, 26, -28],
    look: { fog: 0x2e2640, fogD: 0.0105, hemiSky: 0x9a96e8, hemiGround: 0x4a3638, hemi: 1.15, sunCol: 0xffa878, sunI: 2.1, rimCol: 0x7fa8ff, rimI: 0.9, env: 0.7, exposure: 1.32 },
    perches: [{ x: -25, y: 3.2, z: 9 }, { x: -22, y: 3.2, z: 11 }, { x: 24.5, y: 3.6, z: 12 }, { x: 24.5, y: 3.6, z: 18 }],
    vias: [{ x: -28, z: 28 }, { x: -28, z: 16 }, { x: 0, z: 26 }, { x: 0, z: 24 }, { x: 31, z: 20 }, { x: 24.5, y: 3.6, z: 22 }],
    build(ctx) { buildCity(COMPACT, ctx, { seed: 7, coreY: 4.4, gateText: '경계시장' }); },
  },
};
