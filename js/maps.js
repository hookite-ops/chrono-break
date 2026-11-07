// 맵: 경계 시장 · 정지된 광장 — 배치는 mapdata.js(맵 설계 데이터), 여기서는 모양·장식을 입힌다
import * as THREE from 'three';
import { block, solid, cylinder, sign, clockFace, add, M, W, rand, boxes } from './world.js';
import { MARKET, SQUARE } from './mapdata.js';

const TEAM_COL = { blue: 0x3db8ff, red: 0xff4d5e };
const glowO = () => M('#ff8a2a', { e: 0xff7a1a, ei: 2.2 });
const glowSoft = () => M('#ff9a4a', { e: 0xff7a1a, ei: 1.1 });
const lit = () => M('#ffcf8a', { e: 0xffa040, ei: 0.55 });
const unlit = () => M('#3a2f38', { r: 0.4 });
const dead = () => M('#22252a', { r: 0.3 });
const SIGNS_P = ['경계시장', '24시 국수', '시계수리', '분식', '복원단', 'TICKET', '노래방', '카페 03:17', '약국', '만두'];
const SIGNS_F = ['CHRONO LAB', '출입금지', '구역 7', 'SECTOR 0', '봉쇄', 'DANGER'];
const NEON = ['#ff3d8a', '#35c6c4', '#e9c46a', '#3db8ff', '#b388ff'];
let rng = 1;
const rr = () => (rng = (rng * 16807) % 2147483647) / 2147483647;   // 맵마다 같은 장식이 나오게

// ------------------------------------------------------------ 모양 재료
const MAT = {
  bldP: ['#5b4b5c', '#6d5a5f', '#634f5e'], bldF: ['#6b6e75', '#5d6067', '#4f5258'],
  wallP: '#5b4b5c', wallF: '#5d6067', arch: '#4f4150', archTop: '#3a3140',
  stairs: '#6a5f66', rubble: '#5a5552', terrace: '#6d5a5f', walkP: '#7a5a43', walkF: '#55585f', overpass: '#4a4d54',
  rail: '#2a2c31', parapet: '#3a3440', crate: '#7a6a55', low: '#6a5a62', stall: '#7a5a43', rubbleBlk: '#3f4248',
  ruin: '#5b5e64', ledge: '#6d5a5f', plaza: '#4c4552', stage: '#5a5260', core: '#3b3540', pillar: '#5a5560', fountain: '#7c7480',
  float: '#5a5560', bus: '#e9c46a', wallChunk: '#6a6070', post: '#2a2a2e', roofF: '#4f5258', block: '#6a6070',
};
const matFor = (tag) => { const m = MAT[tag] || MAT.block; return M(Array.isArray(m) ? m[Math.floor(rr() * m.length)] : m, tag === 'overpass' || tag === 'rail' ? { m: 0.4, r: 0.5 } : {}); };

function windows(s, future) {
  // 길 쪽을 보는 두 긴 면에 창문 줄
  const top = s.y + s.h, faces = s.w >= s.d ? ['z'] : ['x'];
  for (const ax of faces) for (const side of [-1, 1]) {
    const len = ax === 'z' ? s.w : s.d;
    for (let y = s.y + 1.8; y < top - 1.2; y += 2.3) for (let t = -len / 2 + 1.3; t < len / 2 - 1; t += 2.4) {
      const m = future ? dead() : (rr() < 0.55 ? lit() : unlit());
      if (ax === 'z') block(s.x + t, y, s.z + side * (s.d / 2 + 0.03), 1.2, 1, 0.05, m, { solid: false, cast: false });
      else block(s.x + side * (s.w / 2 + 0.03), y, s.z + t, 0.05, 1, 1.2, m, { solid: false, cast: false });
    }
  }
}
function signOn(s, future) {
  // 맵 가운데(x=0) 쪽 면에 간판 하나
  const side = s.x > 0 ? -1 : 1, list = future ? SIGNS_F : SIGNS_P;
  const text = list[Math.floor(rr() * list.length)], col = future ? '#ff8a2a' : NEON[Math.floor(rr() * NEON.length)];
  const w = Math.min(5, Math.max(2.6, text.length * 0.75));
  if (s.d > 4) sign(s.x + side * (s.w / 2 + 0.06), s.y + Math.min(s.h - 1, 4.2), s.z + (rr() - 0.5) * s.d * 0.4, w, 1.15, side > 0 ? Math.PI / 2 : -Math.PI / 2, text, col, future ? '#0e0e10' : '#120c18', future ? 1 : 0);
}
function dress(s, future) {
  const top = s.y + s.h;
  switch (s.tag) {
    case 'bldP': case 'bldF':
      block(s.x, top, s.z, s.w + 0.4, 0.4, s.d + 0.4, s.tag === 'bldP' ? '#3a3140' : '#3c3f45', { solid: false });
      windows(s, s.tag === 'bldF');
      if (rr() < 0.75) signOn(s, s.tag === 'bldF');
      if (s.tag === 'bldF') for (let k = 0; k < 3; k++) block(s.x + (rr() - 0.5) * s.w * 0.6, top + 0.4, s.z + (rr() - 0.5) * s.d * 0.6, 1 + rr() * 1.5, 0.4 + rr() * 0.8, 1 + rr(), '#3f4248', { solid: false, ry: rr() });
      break;
    case 'terrace': case 'ledge': case 'float': case 'walkP': case 'walkF': case 'roofF': case 'ruin':
      block(s.x, top - 0.06, s.z, s.w + 0.08, 0.08, s.d + 0.08, s.tag === 'walkP' ? '#5d4433' : '#3a3440', { solid: false, cast: false });
      if (s.tag === 'float') block(s.x, s.y + s.h - 0.5, s.z, s.w + 0.1, 0.06, s.d + 0.1, glowO(), { solid: false, cast: false });
      if (s.tag === 'terrace') for (let x = s.x - s.w / 2 + 1; x < s.x + s.w / 2; x += 2.5) block(x, top + 2.6, s.z + s.d / 2 - 0.5, 0.1, 0.1, 0.1, M('#ffd28a', { e: 0xffc060, ei: 2 }), { solid: false, cast: false });
      break;
    case 'parapet': case 'rail': case 'low':
      block(s.x, top, s.z, s.w + 0.04, 0.07, s.d + 0.04, glowSoft(), { solid: false, cast: false }); break;
    case 'overpass':
      for (let z = s.z - s.d / 2 + 2; z < s.z + s.d / 2; z += 6) { block(s.x - s.w / 2 - 0.25, s.y, z, 0.5, top, 0.8, '#3c3f45', { solid: false }); block(s.x + s.w / 2 + 0.25, s.y, z, 0.5, top, 0.8, '#3c3f45', { solid: false }); }
      break;
    case 'stall': {
      const c = NEON[Math.floor(rr() * NEON.length)];
      block(s.x, top + 1.3, s.z, s.w + 0.8, 0.1, s.d + 0.8, c, { solid: false });
      for (const [dx, dz] of [[-1, -1], [1, 1], [-1, 1], [1, -1]]) cylinder(s.x + dx * s.w / 2, top, s.z + dz * s.d / 2, 0.04, 1.3, '#333');
      for (let k = 0; k < 3; k++) block(s.x + (rr() - 0.5) * s.w * 0.6, top, s.z + (rr() - 0.5) * s.d * 0.6, 0.4, 0.3, 0.4, ['#e76f51', '#e9c46a', '#8ab17d'][k], { solid: false });
      break;
    }
    case 'crate':
      block(s.x, top, s.z, s.w * 0.6, Math.min(0.5, s.h * 0.4), s.d * 0.6, '#8a7a62', { solid: false, ry: 0.3 }); break;
    case 'rubbleBlk': case 'rubble':
      if (rr() < 0.5) for (let k = 0; k < 2; k++) block(s.x + (rr() - 0.5) * s.w, top, s.z + (rr() - 0.5) * s.d, 0.3 + rr() * 0.5, 0.2 + rr() * 0.3, 0.3 + rr() * 0.5, '#8a5a3a', { solid: false, rx: rr(), ry: rr() * 3 });
      break;
    case 'pillar': case 'post':
      block(s.x, top, s.z, s.w + 0.2, 0.25, s.d + 0.2, glowO(), { solid: false, cast: false }); break;
    case 'bus':
      for (let z = s.z - s.d / 2 + 1; z < s.z + s.d / 2 - 0.5; z += 1.6) for (const sd of [-1, 1]) block(s.x + sd * (s.w / 2 + 0.03), s.y + 1.6, z, 0.05, 0.9, 1.2, '#1d2a33', { solid: false, cast: false });
      block(s.x, top, s.z, s.w - 0.2, 0.15, s.d - 0.4, '#d9b45a', { solid: false });
      break;
  }
}

function buildFromData(D, ctx, theme) {
  rng = theme.seed;
  const B = D.bounds; W.bounds = { x0: B.x[0], x1: B.x[1], z0: B.z[0], z1: B.z[1] };
  const X0 = B.x[0], X1 = B.x[1], Z0 = B.z[0], Z1 = B.z[1];
  // 바닥: 왼쪽 현재(따뜻한 아스팔트) / 오른쪽 미래(차가운 콘크리트), 4 m 타일
  for (let x = X0; x < X1; x += 8) for (let z = Z0; z < Z1; z += 8) {
    const fut = theme.split(x + 4, z + 4) > 0, alt = ((x + z) / 8) & 1;
    block(x + 4, -1, z + 4, 8, 1, 8, fut ? (alt ? '#55585f' : '#4f5258') : (alt ? '#3d3540' : '#43394a'), { cast: false });
  }
  // 시간 단층선(빛나는 균열)
  for (const [x, z, ry] of theme.fault()) block(x, 0, z, 0.24, 0.03, 3.2, glowO(), { solid: false, ry, cast: false });
  // 바깥 벽: 건물 정면
  for (let z = Z0; z < Z1; z += 10) {
    const fL = theme.split(X0, z + 5) > 0, fR = theme.split(X1, z + 5) > 0;
    const hL = 10 + rr() * 4, hR = 9 + rr() * 4;
    const l = { x: X0 - 1.5, z: z + 5, w: 3, d: 10, h: hL, y: 0, tag: fL ? 'bldF' : 'bldP' }, r = { x: X1 + 1.5, z: z + 5, w: 3, d: 10, h: hR, y: 0, tag: fR ? 'bldF' : 'bldP' };
    for (const s of [l, r]) { block(s.x, 0, s.z, s.w, s.h, s.d, matFor(s.tag)); block(s.x, s.h, s.z, s.w + 0.4, 0.4, s.d + 0.4, '#3a3140', { solid: false }); }
    // 안쪽 면 창문
    for (let y = 2; y < Math.min(hL, hR) - 1; y += 2.4) for (let t = z + 1.5; t < z + 9; t += 2.5) {
      block(X0 + 0.03, y, t, 0.05, 1, 1.2, fL ? dead() : (rr() < 0.5 ? lit() : unlit()), { solid: false, cast: false });
      block(X1 - 0.03, y, t, 0.05, 1, 1.2, fR ? dead() : (rr() < 0.5 ? lit() : unlit()), { solid: false, cast: false });
    }
  }
  for (const z of [Z0 - 1.5, Z1 + 1.5]) block(0, 0, z, X1 - X0 + 6, 11, 3, '#4b4352');
  // 설계 데이터 → 충돌 상자 + 모양
  for (const s of D.solids) {
    const y = s.y || 0, future = theme.split(s.x, s.z) > 0;
    let tag = s.tag;
    if ((tag === 'stairs' || tag === 'low' || tag === 'crate') && future && rr() < 0.3) tag = tag === 'stairs' ? 'stairs' : 'rubbleBlk';
    if (s.type === 'cyl') {
      cylinder(s.x, y, s.z, s.r, s.h, matFor(tag), { seg: 40 });
      // 원기둥 충돌: 십자·정사각 상자 세 개로 근사
      const r = s.r;
      solid(s.x - r * 0.92, y, s.z - r * 0.55, s.x + r * 0.92, y + s.h, s.z + r * 0.55);
      solid(s.x - r * 0.55, y, s.z - r * 0.92, s.x + r * 0.55, y + s.h, s.z + r * 0.92);
      solid(s.x - r * 0.78, y, s.z - r * 0.78, s.x + r * 0.78, y + s.h, s.z + r * 0.78);
      if (tag === 'plaza' || tag === 'stage') { const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.06, 6, 80), new THREE.MeshBasicMaterial({ color: 0xffa050, toneMapped: false })); ring.rotation.x = Math.PI / 2; ring.position.set(s.x, y + s.h + 0.02, s.z); add(ring); }
      continue;
    }
    if (tag === 'post') { block(s.x, y, s.z, s.w * 0.35, s.h, s.d * 0.35, matFor(tag)); dress({ ...s, w: s.w * 0.35, d: s.d * 0.35 }, future); continue; }
    block(s.x, y, s.z, s.w, s.h, s.d, matFor(tag));
    dress({ ...s, y, tag: tag === 'bldP' && future ? 'bldF' : tag === 'bldF' && !future ? 'bldP' : tag }, future);
  }
  // 거점 크리스탈 + 빛
  const cy = theme.coreY;
  const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.9, 0), new THREE.MeshStandardMaterial({ color: 0xffa050, emissive: 0xff7a1a, emissiveIntensity: 2.5, roughness: 0.2 }));
  c.position.set(0, cy, 0); add(c); ctx.core = c; ctx.coreY = cy;
  const l = new THREE.PointLight(0xff8a2a, 40, 20, 1.6); l.position.set(0, cy + 0.2, 0); add(l);
  // 출발 구역 문(준비 시간 동안 막힘)
  for (const t of ['blue', 'red']) {
    const s = t === 'blue' ? 1 : -1, col = TEAM_COL[t], gz = ctx.def.gateZ * s;
    const ring = new THREE.Mesh(new THREE.RingGeometry(3.5, 4, 48), new THREE.MeshBasicMaterial({ color: col, toneMapped: false, transparent: true, opacity: 0.7 }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(0, 0.03, ctx.def.spawnZ * s); add(ring);
    const w = ctx.def.spawnHalfW * 2;
    const gm = new THREE.Mesh(new THREE.BoxGeometry(w, 6, 0.2), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.22, toneMapped: false, depthWrite: false }));
    gm.position.set(0, 3, gz - s * 0.8); add(gm);
    const gb = { min: new THREE.Vector3(-w / 2, 0, gz - s * 0.8 - 0.15), max: new THREE.Vector3(w / 2, 6, gz - s * 0.8 + 0.15), dyn: true };
    boxes.push(gb); ctx.gates.push({ mesh: gm, box: gb });
    // 출발 구역 안 시계(03:17)
    clockFace(0, 4.5, s > 0 ? Z1 - 0.06 : Z0 + 0.06, 1.3, s > 0 ? Math.PI : 0);
  }
  for (const p of D.pickups) ctx.packs.push([p.x, null, p.z]);
  theme.extra(ctx);
}

// ------------------------------------------------------------ 공중에 멈춘 것들
function frozenDebris(cx, cz, n, r0, r1, y0, y1, col = '#6f6870') {
  for (let i = 0; i < n; i++) {
    const a = rand(0, Math.PI * 2), r = rand(r0, r1), s = rand(0.12, 0.6);
    block(cx + Math.cos(a) * r, rand(y0, y1), cz + Math.sin(a) * r, s, s * rand(0.3, 1), s, i % 5 ? col : glowO(), { solid: false, rx: rand(0, 3), ry: rand(0, 3), rz: rand(0, 3) });
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
  add(g);
}

export const MAPS = {
  market: {
    name: '경계 시장', sub: '시장 테라스 · 고가도로 · 아치 문', lore: '시장 거리 한가운데로 시간 단층선이 지나간다. 왼쪽은 아직 장사 중인 현재, 오른쪽은 녹슨 미래. 거점은 시계가 멈춘 낮은 광장.',
    spawnZ: 82, gateZ: 74, spawnHalfW: 22, pointR: 8, fogNear: 60, fogFar: 210, sun: [-60, 95, 40],
    perches: [{ x: -26, y: 3.6, z: 14 }, { x: -27, y: 3.6, z: 18 }, { x: 33, y: 4.2, z: 22 }, { x: 33, y: 4.2, z: 30 }, { x: 10, y: 2.0, z: 16.5 }, { x: -10, y: 2.0, z: 16.5 }, { x: 19, y: 2.4, z: 13 }],
    vias: [{ x: -40, z: 46 }, { x: -26, z: 14, y: 3.6 }, { x: 0, z: 40 }, { x: 0, z: 36 }, { x: 33, z: 35, y: 4.2 }, { x: 44, z: 36 }],
    build(ctx) {
      buildFromData(MARKET, ctx, {
        seed: 7, coreY: 5.0, split: (x) => x,
        fault: () => { const o = []; for (let z = -88; z < 88; z += 3) o.push([Math.sin(z * 0.7) * 0.35, z + 1.5, Math.sin(z) * 0.2]); return o; },
        extra() {
          clockFace(0, 4.6, 33.05, 1.5, 0); clockFace(0, 4.6, -33.05, 1.5, Math.PI, true);
          car(1, 7.5, 2, 0.35, 0.6, -0.5); car(-6, 9.5, -4, -0.4, 2.1, 0.3, '#ff3d8a');
          frozenDebris(0, 0, 90, 3, 12, 5.5, 11);
          // 시장 위 전선과 등
          for (let z = -60; z <= 60; z += 15) { block(-40, 5.6, z, 30, 0.03, 0.03, '#222', { solid: false, cast: false }); for (let x = -54; x < -26; x += 3) block(x, 5.4, z, 0.25, 0.25, 0.25, M('#ffd28a', { e: 0xffc060, ei: 2 }), { solid: false, cast: false }); }
        },
      });
    },
  },
  square: {
    name: '정지된 광장', sub: '분수 무대 · 잔해 발판 · 멈춘 버스', lore: '크로노 코어가 폭주한 순간, 광장에서 터지던 폭발이 그대로 굳었다. 분수 무대를 공중에 멈춘 잔해 발판들이 둘러싸고 있다.',
    spawnZ: 71, gateZ: 64, spawnHalfW: 20, pointR: 7, fogNear: 55, fogFar: 190, sun: [55, 85, -50],
    perches: [{ x: -14, y: 3.0, z: 12 }, { x: 14, y: 3.0, z: 12 }, { x: -17, y: 2.0, z: 1 }, { x: 17, y: 2.0, z: 1 }, { x: 41, y: 2.8, z: 31 }, { x: -43.5, y: 3.4, z: 30 }],
    vias: [{ x: -43, z: 39, y: 3.4 }, { x: -30, z: 40 }, { x: 0, z: 36 }, { x: 0, z: 50 }, { x: 41, z: 36, y: 2.8 }, { x: 30, z: 40 }, { x: -14, z: 12, y: 3.0 }],
    build(ctx) {
      buildFromData(SQUARE, ctx, {
        seed: 11, coreY: 4.2, split: (x, z) => x - z * 0.55,
        fault: () => { const o = []; for (let t = -90; t < 90; t += 2.6) { const x = t * 0.48, z = t * 0.88; if (Math.abs(x) < 47 && Math.abs(z) < 77) o.push([x + Math.sin(t) * 0.3, z, 0.5]); } return o; },
        extra(ctx) {
          // 솟구치다 멈춘 분수 물줄기
          for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; cylinder(Math.cos(a) * 0.8, 2.0, Math.sin(a) * 0.8, 0.08, rand(1.5, 3), M('#9fe6ff', { e: 0x4fbfff, ei: 1.4, t: 0.7 }), { rt: 0.02, rx: Math.cos(a) * 0.3, rz: -Math.sin(a) * 0.3, cast: false }); }
          // 멈춘 폭발: 충격파 껍질 + 파편 + 공중의 차들
          const shell = new THREE.Mesh(new THREE.SphereGeometry(16, 40, 20), new THREE.MeshBasicMaterial({ color: 0xff9a4a, transparent: true, opacity: 0.05, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }));
          shell.position.set(0, 5, 0); add(shell); ctx.shell = shell;
          const ring = new THREE.Mesh(new THREE.TorusGeometry(16, 0.08, 6, 120), new THREE.MeshBasicMaterial({ color: 0xffa050, toneMapped: false }));
          ring.rotation.x = Math.PI / 2; ring.position.set(0, 5, 0); add(ring);
          frozenDebris(0, 0, 170, 4, 17, 6, 15);
          car(-12, 9, -3, 0.5, 1.2, 0.9, '#e9c46a', 7); car(13, 8.2, -5, -0.6, 0.3, 0.3, '#3d7bd9'); car(5, 11, 14, 1.1, -0.4, 0.2, '#ff3d8a');
          // 시계탑(03:17)
          block(-46, 0, -2, 3, 15, 3, '#5b4b5c'); clockFace(-44.45, 12, -2, 1.3, Math.PI / 2);
          block(46, 0, 2, 3, 13, 3, '#3c3f45'); clockFace(44.45, 10.5, 2, 1.3, -Math.PI / 2, true);
        },
      });
    },
  },
};
