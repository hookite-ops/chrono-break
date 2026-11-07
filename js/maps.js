// 맵: 경계 시장 · 정지된 광장
import * as THREE from 'three';
import { block, solid, cylinder, sign, clockFace, add, M, W, rand, boxes } from './world.js';

const TEAM_COL = { blue: 0x3db8ff, red: 0xff4d5e };
const glowO = () => M('#ff8a2a', { e: 0xff7a1a, ei: 2.2 });

function spawnGates(gateZ, width, ctx) {
  for (const t of ['blue', 'red']) {
    const s = t === 'blue' ? 1 : -1, col = TEAM_COL[t];
    const ring = new THREE.Mesh(new THREE.RingGeometry(3.5, 4, 48), new THREE.MeshBasicMaterial({ color: col, toneMapped: false, transparent: true, opacity: 0.7 }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(0, 0.03, (gateZ + 4) * s); add(ring);
    const gm = new THREE.Mesh(new THREE.BoxGeometry(width, 6, 0.2), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.22, toneMapped: false, depthWrite: false }));
    gm.position.set(0, 3, gateZ * s); add(gm);
    const gb = { min: new THREE.Vector3(-width / 2, 0, gateZ * s - 0.15), max: new THREE.Vector3(width / 2, 6, gateZ * s + 0.15), dyn: true };
    boxes.push(gb); ctx.gates.push({ mesh: gm, box: gb });
  }
}
function frozenDebris(cx, cz, n, r0, r1, y0, y1, colA = '#6f6870') {
  for (let i = 0; i < n; i++) {
    const a = rand(0, Math.PI * 2), r = rand(r0, r1), s = rand(0.12, 0.55);
    block(cx + Math.cos(a) * r, rand(y0, y1), cz + Math.sin(a) * r, s, s * rand(0.3, 1), s, i % 5 ? colA : glowO(), { solid: false, rx: rand(0, 3), ry: rand(0, 3), rz: rand(0, 3) });
  }
}
function car(x, y, z, rx, ry, rz, col = '#2f8f94', len = 4) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(len, 1, 1.9), M(col, { r: 0.4, m: 0.3 })); body.position.y = 0.5;
  const cab = new THREE.Mesh(new THREE.BoxGeometry(len * 0.55, 0.8, 1.7), M('#1d2a33', { r: 0.2, m: 0.5 })); cab.position.set(-0.2, 1.3, 0);
  g.add(body, cab);
  for (const [wx, wz] of [[-len * 0.33, 1], [len * 0.33, 1], [-len * 0.33, -1], [len * 0.33, -1]]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 14), M('#18181b')); w.rotation.x = Math.PI / 2; w.position.set(wx, 0.1, wz); g.add(w); }
  g.position.set(x, y, z); g.rotation.set(rx, ry, rz);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  add(g); return g;
}
function core(ctx, x, y, z) {
  const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.8, 0), new THREE.MeshStandardMaterial({ color: 0xffa050, emissive: 0xff7a1a, emissiveIntensity: 2.5, roughness: 0.2 }));
  c.position.set(x, y, z); add(c); ctx.core = c; ctx.coreY = y;
  const l = new THREE.PointLight(0xff8a2a, 30, 16, 1.6); l.position.set(x, y + 0.1, z); add(l);
}
function pack(ctx, x, y, z) { ctx.packs.push([x, y, z]); }

// ================================================================ 1. 경계 시장
function buildMarket(ctx) {
  W.bounds = { x0: -32, x1: 32, z0: -46, z1: 46 };
  const PRES = { ground: '#3d3540', wall: '#5b4b5c', wall2: '#6d5a5f', wood: '#7a5a43', awning: ['#2f8f94', '#ff3d8a', '#e9c46a', '#3d7bd9'] };
  const FUT = { ground: '#55585f', wall: '#6b6e75', dark: '#3f4248', rust: '#8a5a3a' };
  block(-18, -1, 0, 36, 1, 100, PRES.ground); block(18, -1, 0, 36, 1, 100, FUT.ground);
  for (let z = -46; z < 46; z += 3) block(Math.sin(z * 0.7) * 0.35, 0, z + 1.5, 0.22, 0.03, 3.2, glowO(), { solid: false, ry: Math.sin(z) * 0.2, cast: false });
  for (let z = -46; z < 46; z += 8) {
    const hh = 9 + (Math.abs(z * 7) % 5);
    block(-33.5, 0, z + 4, 3, hh, 8, z % 16 === 0 ? PRES.wall : PRES.wall2);
    block(33.5, 0, z + 4, 3, hh - 1 + Math.sin(z) * 2, 8, z % 16 === 0 ? FUT.wall : FUT.dark);
  }
  block(0, 0, 47.5, 70, 10, 3, '#4b4352'); block(0, 0, -47.5, 70, 10, 3, '#4b4352');
  const segs = [[-37, -27], [-23, -14], [-10, 10], [14, 23], [27, 37]];
  for (const [z0, z1] of segs) {
    const cz = (z0 + z1) / 2, d = z1 - z0, tall = Math.abs(cz) < 1 ? 7.5 : 6;
    block(-11, 0, cz, 6, tall, d, PRES.wall); block(-11, tall, cz, 6.4, 0.4, d + 0.4, '#3a3140');
    block(11, 0, cz, 6, tall - 0.5, d, FUT.wall);
    for (let k = 0; k < 3; k++) block(11 + rand(-2, 2), tall - 0.5, cz + rand(-d / 3, d / 3), rand(1, 2.4), rand(0.4, 1.2), rand(1, 2), FUT.dark, { solid: false, ry: rand(0, 1) });
    const lit = M('#ffcf8a', { e: 0xffa040, ei: 0.55 }), unlit = M('#3a2f38', { r: 0.4 }), dead = M('#22252a', { r: 0.3 });
    for (let y = 1.8; y < tall - 1; y += 2.2) for (let wz = z0 + 1.2; wz < z1 - 1; wz += 2.2) {
      if (Math.abs(wz) < 2.5 && Math.abs(cz) < 1) continue;
      block(-7.98, y, wz, 0.05, 1, 1.2, Math.random() < 0.55 ? lit : unlit, { solid: false, cast: false });
      block(-14.02, y, wz, 0.05, 1, 1.2, Math.random() < 0.5 ? lit : unlit, { solid: false, cast: false });
      block(7.98, y, wz, 0.05, 1, 1.2, dead, { solid: false, cast: false });
      block(14.02, y, wz, 0.05, 1, 1.2, dead, { solid: false, cast: false });
    }
  }
  clockFace(-7.9, 4.6, 0, 1.6, Math.PI / 2); clockFace(7.9, 4.1, 0, 1.6, -Math.PI / 2, true);
  clockFace(-31.94, 6.5, 20, 1.2, Math.PI / 2); clockFace(31.94, 6, -22, 1.2, -Math.PI / 2, true);
  // 왼쪽: 현재의 시장 골목
  for (let z = -34; z <= 34; z += 7) {
    if (Math.abs(z) < 3) continue;
    const c = PRES.awning[(z / 7 + 10 | 0) % 4];
    block(-30, 0, z, 2.6, 1.1, 4.2, PRES.wood); block(-30.4, 1.1, z, 1.6, 1.4, 4.2, PRES.wall2, { solid: false });
    block(-29.2, 2.6, z, 3.6, 0.12, 4.6, c, { rz: -0.25, solid: false });
    for (let k = 0; k < 4; k++) block(-29.3 + rand(-0.6, 0.6), 1.1, z + rand(-1.6, 1.6), 0.45, 0.35, 0.45, ['#e76f51', '#e9c46a', '#8ab17d', '#f4a261'][k], { solid: false });
  }
  for (const [x, z] of [[-19.5, -31], [-20, -18], [-19.5, 6], [-19.5, -6], [-20, 18], [-19.5, 31]]) {
    block(x, 0, z, 2.2, 1.2, 3, PRES.wood); block(x, 1.2, z, 2.6, 0.1, 3.4, PRES.awning[Math.abs(z) % 4], { solid: false });
    cylinder(x - 1.1, 1.2, z - 1.5, 0.05, 1.6, '#333'); cylinder(x + 1.1, 1.2, z + 1.5, 0.05, 1.6, '#333');
  }
  sign(-31.9, 5.2, -14, 5, 1.3, Math.PI / 2, '경계시장', '#ff3d8a'); sign(-31.9, 4.6, 12, 4, 1.2, Math.PI / 2, '24시 국수', '#35c6c4');
  sign(-31.9, 5, 27, 3.2, 1.1, Math.PI / 2, '시계수리', '#e9c46a'); sign(-14.05, 3.6, -31, 3.4, 1, -Math.PI / 2, 'TICKET', '#3db8ff');
  sign(-14.05, 3.6, 31, 3.4, 1, -Math.PI / 2, '분식', '#ff3d8a');
  sign(-7.95, 2.8, -18.5, 2.6, 0.8, Math.PI / 2, '복원단', '#3db8ff', '#0b1520'); sign(-7.95, 2.8, 18.5, 2.6, 0.8, Math.PI / 2, '균열단', '#ff4d5e', '#200b0f');
  for (let z = -30; z <= 30; z += 10) {
    block(-23, 5, z, 18, 0.03, 0.03, '#222', { solid: false, cast: false });
    for (let x = -30; x < -15; x += 3) block(x, 4.8, z, 0.25, 0.25, 0.25, M('#ffd28a', { e: 0xffc060, ei: 2 }), { solid: false, cast: false });
  }
  // 가운데: 거점 광장
  cylinder(0, 0, 0, ctx.pointR + 0.3, 0.3, '#4c4552', { seg: 40 }); solid(-ctx.pointR, 0, -ctx.pointR, ctx.pointR, 0.3, ctx.pointR);
  for (const [x, z, w, d] of [[-5, 9, 4, 1], [5, -9, 4, 1], [5, 9, 1, 3], [-5, -9, 1, 3], [-3.5, 18, 3, 1], [3.5, -18, 3, 1], [3, 26, 1.2, 1.2], [-3, -26, 1.2, 1.2]]) {
    block(x, 0, z, w, 1.25, d, x < 0 ? '#6a5a62' : '#62666e'); block(x, 1.25, z, w + 0.1, 0.08, d + 0.1, glowO(), { solid: false, cast: false });
  }
  for (const [x, z, s] of [[2.6, -5.2, 1.2], [-2.6, 5.2, 1.2], [-6.5, -20, 1.3], [6.5, 20, 1.3], [0, 31, 1], [0, -31, 1]]) {
    block(x, 0, z, s, s, s, '#7a6a55'); block(x + 0.1, s, z + 0.1, s * 0.7, s * 0.7, s * 0.7, '#8a7a62', { ry: 0.3 });
  }
  for (const [x, y, z, w, h, d, rz] of [[3.6, 2.1, -3.2, 3.2, 0.35, 2.4, 0.06], [-3.6, 2.1, 3.2, 3.2, 0.35, 2.4, -0.07]]) {
    block(x, y, z, w, h, d, '#5a5560', { rz }); block(x, y - 0.06, z, w + 0.06, 0.06, d + 0.06, glowO(), { solid: false, rz, cast: false });
  }
  car(0.5, 5.2, 1.5, 0.35, 0.6, -0.5);
  frozenDebris(0, 0, 70, 2, 9, 2.6, 8);
  core(ctx, 0, 3.1, 0);
  // 오른쪽: 미래의 폐허와 높은 통로
  block(25, 3.2, 0, 6, 0.4, 30, FUT.dark);
  for (let s = 0; s < 8; s++) {
    const y = s * 0.4;
    block(25, 0, 15 + 0.9 * (8 - s) - 0.45, 3, y + 0.4, 0.9, FUT.wall); block(25, 0, -15 - 0.9 * (8 - s) + 0.45, 3, y + 0.4, 0.9, FUT.wall);
  }
  for (let z = -12; z <= 12; z += 8) { cylinder(22.4, 0, z, 0.35, 3.2, FUT.dark, { solid: true }); cylinder(27.6, 0, z, 0.35, 3.2, FUT.dark, { solid: true }); }
  for (let z = -14.5; z <= 14.5; z += 1) { if (Math.abs(z) < 3) continue; block(22.1, 3.6, z, 0.12, 0.9, 1, FUT.rust, { solid: false }); }
  block(22.1, 3.6, 0, 0.15, 1.0, 30, M('#ff8a2a', { e: 0xff7a1a, ei: 1.2 }), { solid: false, cast: false });
  solid(21.95, 3.6, -15, 22.25, 4.5, -3); solid(21.95, 3.6, 3, 22.25, 4.5, 15);
  for (const [x, z, w, h, d] of [[30, -30, 3, 2.2, 4], [30, -8, 2.4, 1.4, 3], [30.5, 8, 3, 2.4, 3.5], [30, 30, 3, 1.6, 4], [17, -30, 2, 1.3, 2], [17.5, 31, 2.2, 1.5, 2], [16.5, -5, 1.2, 1.2, 2.4], [16.5, 5, 1.2, 1.2, 2.4]]) {
    block(x, 0, z, w, h, d, FUT.dark, { ry: rand(-0.2, 0.2) });
    for (let k = 0; k < 4; k++) block(x + rand(-w, w) * 0.6, h * rand(0.2, 0.9), z + rand(-d, d) * 0.6, rand(0.3, 0.8), rand(0.2, 0.5), rand(0.3, 0.8), FUT.rust, { solid: false, rx: rand(0, 1), ry: rand(0, 3) });
  }
  for (let z = -36; z <= 36; z += 12) block(32, 0, z, 1.6, rand(3, 6), 0.5, FUT.wall, { rz: rand(-0.15, 0.15) });
  sign(31.9, 5.5, -2, 4.4, 1.2, -Math.PI / 2, 'CHRONO LAB', '#ff8a2a', '#0e0e10', 1);
  sign(14.05, 3.4, 31, 3, 1, Math.PI / 2, '출입금지', '#ff8a2a', '#0e0e10', 1);
  sign(14.05, 3.4, -31, 3, 1, Math.PI / 2, '구역 7', '#ff8a2a', '#0e0e10', 1);
  spawnGates(37.5, 64, ctx);
  for (const s of [1, -1]) { block(-20, 0, 44 * s, 6, 2.4, 2, '#3a3440'); block(20, 0, 44 * s, 6, 2.4, 2, '#3a3440'); }
  for (const p of [[-24, 0, 0], [18, 0, 0], [0, 0, 23], [0, 0, -23], [25, 3.6, 0]]) pack(ctx, ...p);
}

// ================================================================ 2. 정지된 광장
// 폭발이 터지는 순간에 그대로 멈춘 광장. 위쪽(+z, 파랑 출발)은 현재, 아래쪽(-z)은 미래가 대각선으로 갈림.
function buildSquare(ctx) {
  W.bounds = { x0: -30, x1: 30, z0: -44, z1: 44 };
  const P = { a: '#45394a', b: '#4f4253', wall: '#6a5560', trim: '#3a2f3a' }, F = { a: '#575b62', b: '#4c5057', wall: '#70737a', dark: '#3c3f45', rust: '#8a5a3a' };
  // 바닥: 4m 타일, 대각선(x - z)으로 시대가 갈림
  for (let x = -30; x < 30; x += 4) for (let z = -44; z < 44; z += 4) {
    const fut = (x + 2) - (z + 2) * 0.6 > 0;
    block(x + 2, -1, z + 2, 4, 1, 4, ((x + z) / 4) % 2 ? (fut ? F.a : P.a) : (fut ? F.b : P.b), { cast: false });
  }
  // 단층선(대각선 빛)
  for (let t = -48; t < 48; t += 2.5) {
    const x = t * 0.52, z = t * 0.86;
    if (Math.abs(x) < 30 && Math.abs(z) < 44) block(x + Math.sin(t) * 0.3, 0, z, 0.25, 0.03, 2.8, glowO(), { solid: false, ry: 0.54, cast: false });
  }
  // 외벽
  for (let z = -44; z < 44; z += 8) {
    const fut = z < 0;
    block(-31.5, 0, z + 4, 3, 8 + (Math.abs(z) % 3), 8, fut ? F.wall : P.wall);
    block(31.5, 0, z + 4, 3, 8 + (Math.abs(z * 3) % 4), 8, fut ? F.dark : P.wall);
  }
  block(0, 0, 45.5, 66, 10, 3, P.trim); block(0, 0, -45.5, 66, 10, 3, F.dark);
  // 광장을 둘러싼 네 덩이 건물(ㄱ자) — 길: 가운데 대로, 양옆 골목, 대각 통로
  const bld = (x, z, w, d, h, fut) => {
    block(x, 0, z, w, h, d, fut ? F.wall : P.wall);
    block(x, h, z, w + 0.4, 0.4, d + 0.4, fut ? F.dark : P.trim);
    const lit = M('#ffcf8a', { e: 0xffa040, ei: 0.5 }), dead = M('#22252a', { r: 0.3 });
    for (let y = 1.8; y < h - 1; y += 2.3) for (let k = -w / 2 + 1.2; k < w / 2 - 1; k += 2.4) {
      block(x + k, y, z + d / 2 + 0.03, 1.2, 1, 0.05, fut ? dead : (Math.random() < 0.6 ? lit : M('#3a2f38')), { solid: false, cast: false });
      block(x + k, y, z - d / 2 - 0.03, 1.2, 1, 0.05, fut ? dead : (Math.random() < 0.6 ? lit : M('#3a2f38')), { solid: false, cast: false });
    }
  };
  for (const s of [1, -1]) {
    const fut = s < 0;
    bld(-17, 22 * s, 12, 8, 7, fut); bld(17, 22 * s, 12, 8, 7.5, fut);
    bld(-22, 9 * s, 6, 8, 6, fut); bld(22, 9 * s, 6, 8, 6, fut);
    bld(-10, 31 * s, 6, 5, 5, fut); bld(10, 31 * s, 6, 5, 5, fut);
  }
  // 대로 위 육교(위로 지나감 — 아래는 통행)
  for (const s of [1, -1]) {
    block(0, 4.2, 22 * s, 22, 0.5, 3, s > 0 ? '#5d4c58' : F.dark);
    for (let x = -10; x <= 10; x += 2) block(x, 4.7, 22 * s + 1.4, 0.1, 0.9, 0.1, '#2a2a2e', { solid: false });
    sign(0, 5.6, 22 * s - 1.55 * s, 6, 1.3, s > 0 ? 0 : Math.PI, s > 0 ? '정지된 광장' : 'SECTOR 0', s > 0 ? '#ff3d8a' : '#ff8a2a', '#100c14', s < 0 ? 1 : 0);
  }
  // 거점: 부서진 분수 + 둘러싼 낮은 벽
  cylinder(0, 0, 0, ctx.pointR + 0.4, 0.3, '#4c4552', { seg: 48 }); solid(-ctx.pointR, 0, -ctx.pointR, ctx.pointR, 0.3, ctx.pointR);
  cylinder(0, 0.3, 0, 1.9, 0.9, '#7c7480', { seg: 24, solid: true });
  cylinder(0, 1.2, 0, 1.6, 0.1, M('#59c3d9', { r: 0.1, m: 0.2, e: 0x1b5f80, ei: 0.4 }), { seg: 24 });
  // 물줄기가 솟구치다 멈춤(빛나는 물기둥)
  for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; cylinder(Math.cos(a) * 0.7, 1.2, Math.sin(a) * 0.7, 0.08, rand(1.5, 3), M('#9fe6ff', { e: 0x4fbfff, ei: 1.4, t: 0.7 }), { rt: 0.02, rx: Math.cos(a) * 0.3, rz: -Math.sin(a) * 0.3, cast: false }); }
  for (const a of [0.4, 1.95, 3.5, 5.05]) {
    const x = Math.cos(a) * 8.5, z = Math.sin(a) * 8.5;
    block(x, 0, z, 3.4, 1.2, 1, '#6a6070', { ry: -a + Math.PI / 2 });
    block(x, 1.2, z, 3.5, 0.08, 1.1, glowO(), { solid: false, ry: -a + Math.PI / 2, cast: false });
  }
  // 상자 → 공중 발판(높이 싸움)
  for (const [x, z] of [[-8, -3], [8, 3], [-3, 12], [3, -12]]) { block(x, 0, z, 1.2, 1.2, 1.2, '#7a6a55'); block(x + 0.1, 1.2, z, 0.8, 0.6, 0.8, '#8a7a62', { ry: 0.4 }); }
  for (const [x, y, z, w, d] of [[-9.5, 2.3, -5.5, 3.5, 3], [9.5, 2.3, 5.5, 3.5, 3], [-5, 2.4, 13.5, 3, 3], [5, 2.4, -13.5, 3, 3]]) {
    block(x, y, z, w, 0.35, d, '#5a5560', { rz: rand(-0.06, 0.06) }); block(x, y - 0.06, z, w + 0.06, 0.06, d + 0.06, glowO(), { solid: false, cast: false });
  }
  // 멈춘 폭발: 중심에서 뻗어나가는 파편 구름 + 충격파 껍질 + 공중의 버스
  frozenDebris(0, 0, 160, 3, 14, 3, 12);
  const shell = new THREE.Mesh(new THREE.SphereGeometry(13, 40, 20), new THREE.MeshBasicMaterial({ color: 0xff9a4a, transparent: true, opacity: 0.06, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }));
  shell.position.set(0, 4, 0); add(shell); ctx.shell = shell;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(13, 0.08, 6, 96), new THREE.MeshBasicMaterial({ color: 0xffa050, toneMapped: false }));
  ring.rotation.x = Math.PI / 2; ring.position.set(0, 4, 0); add(ring);
  car(-12, 6.5, -1, 0.5, 1.2, 0.9, '#e9c46a', 7);
  car(13, 5.2, -3, -0.6, 0.3, 0.3, '#3d7bd9');
  car(4, 8.5, 14, 1.1, -0.4, 0.2, '#ff3d8a');
  core(ctx, 0, 4.2, 0);
  // 시계탑(광장 옆, 03:17)
  block(-26.5, 0, -1, 3, 14, 3, P.wall); clockFace(-24.95, 11, -1, 1.3, Math.PI / 2);
  block(26.5, 0, 1, 3, 12, 3, F.dark); clockFace(24.95, 9.5, 1, 1.3, -Math.PI / 2, true);
  // 골목 소품
  for (let z = -30; z <= 30; z += 10) {
    if (Math.abs(z) < 5) continue;
    block(-27.5, 0, z, 2, 1, 3, z > 0 ? '#7a5a43' : F.dark);
    block(27.5, 0, z + 3, 2, 1.3, 2, z > 0 ? '#7a5a43' : F.rust);
  }
  sign(-29.95, 4.5, 30, 3.6, 1.1, Math.PI / 2, '분수 카페', '#35c6c4'); sign(29.95, 4.5, 30, 3.4, 1.1, -Math.PI / 2, '시계점', '#e9c46a');
  sign(-29.95, 4.5, -30, 3.6, 1.1, Math.PI / 2, '봉쇄 구역', '#ff8a2a', '#0e0e10', 1);
  spawnGates(35.5, 60, ctx);
  for (const p of [[-20, 0, 0], [20, 0, 0], [0, 0, 28], [0, 0, -28], [-9.5, 2.65, -5.5]]) pack(ctx, ...p);
}

export const MAPS = {
  market: {
    name: '경계 시장', sub: '시장 골목 · 거점 광장 · 폐허 통로', lore: '시장 거리 한가운데로 시간 단층선이 지나간다. 왼쪽은 아직 장사 중인 현재, 오른쪽은 녹슨 미래.',
    spawnZ: 41, gateZ: 37.5, pointR: 6, fogNear: 40, fogFar: 140, build: buildMarket, sun: [-30, 45, 20],
  },
  square: {
    name: '정지된 광장', sub: '멈춘 폭발 · 공중 발판 · 높이 싸움', lore: '크로노 코어가 폭주한 순간, 광장에서 터지던 폭발이 그대로 굳었다. 파편과 버스가 아직 공중에 떠 있다.',
    spawnZ: 39.5, gateZ: 35.5, pointR: 6.5, fogNear: 36, fogFar: 130, build: buildSquare, sun: [25, 40, -25],
  },
};
