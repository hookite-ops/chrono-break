// 맵 만들기 도구 · 충돌 · 광선 · 격자 길찾기
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const STEP = 0.5, G = 20;
export const boxes = [];            // {min, max, dyn?, off?}
export const W = { group: null, scene: null, signs: [], bounds: { x0: -32, x1: 32, z0: -46, z1: 46 } };
export const rand = (a, b) => a + Math.random() * (b - a);
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const matCache = {};
// 맵 재질: 세계 좌표로 얼룩·패널 이음새·바닥 쪽 때를 그려 넣음(텍스처 파일 없이)
const GRIME_V = `varying vec3 vWP; varying vec3 vWN;`;
const GRIME_F = `varying vec3 vWP; varying vec3 vWN;
float h3(vec3 p){ p = fract(p * 0.3183099 + .1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vn(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3. - 2. * f);
  return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z); }`;
function grime(mat) {
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = GRIME_V + '\n' + sh.vertexShader.replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
      vWP = (modelMatrix * vec4(transformed, 1.0)).xyz; vWN = normalize(mat3(modelMatrix) * objectNormal);`);
    sh.fragmentShader = GRIME_F + '\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      { vec3 an = abs(vWN);
        float n = vn(vWP * 0.45) * 0.6 + vn(vWP * 1.7) * 0.3 + vn(vWP * 6.0) * 0.1;
        vec2 uv = an.y > 0.6 ? vWP.xz : (an.x > an.z ? vWP.zy : vWP.xy);
        vec2 cell = an.y > 0.6 ? vec2(2.0, 2.0) : vec2(2.4, 1.6);
        vec2 g = abs(fract(uv / cell) - 0.5) * cell;
        float seam = 1.0 - smoothstep(0.015, 0.045, min(cell.x * 0.5 - g.x, cell.y * 0.5 - g.y));
        float base = an.y > 0.6 ? 1.0 : mix(0.68, 1.0, smoothstep(0.0, 1.4, vWP.y));
        diffuseColor.rgb *= (0.78 + 0.38 * n) * (1.0 - 0.28 * seam) * base; }`);
  };
  mat.customProgramCacheKey = () => 'grime';
  return mat;
}
export function M(col, opt = {}) {
  const key = col + JSON.stringify(opt);
  if (!matCache[key]) {
    const m = new THREE.MeshStandardMaterial({ color: col, roughness: opt.r ?? 0.8, metalness: opt.m ?? 0, emissive: opt.e ?? 0x000000, emissiveIntensity: opt.ei ?? 1, transparent: !!opt.t, opacity: opt.t ?? 1 });
    matCache[key] = opt.e || opt.t ? m : grime(m);
  }
  return matCache[key];
}
const staticGeo = new Map();
function addGeo(geo, mat, matrix, cast = true) {
  geo = geo.clone(); geo.applyMatrix4(matrix);
  if (geo.index) geo = geo.toNonIndexed();
  for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') geo.deleteAttribute(k);
  if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
  const key = mat.uuid + (cast ? 'c' : 'n');
  if (!staticGeo.has(key)) staticGeo.set(key, { mat, cast, list: [] });
  staticGeo.get(key).list.push(geo);
}
const BOXG = new THREE.BoxGeometry(1, 1, 1);
const tM = new THREE.Matrix4(), tQ = new THREE.Quaternion(), tS = new THREE.Vector3(), tP = new THREE.Vector3(), tE = new THREE.Euler();
// 바닥 중앙 기준 (x, y=바닥, z), 크기 (w, h, d)
export function block(x, y, z, w, h, d, col, o = {}) {
  const mat = typeof col === 'object' ? col : M(col, o);
  tE.set(o.rx || 0, o.ry || 0, o.rz || 0); tQ.setFromEuler(tE);
  tM.compose(tP.set(x, y + h / 2, z), tQ, tS.set(w, h, d));
  addGeo(BOXG, mat, tM, o.cast !== false);
  if (o.solid !== false) boxes.push({ min: new THREE.Vector3(x - w / 2, y, z - d / 2), max: new THREE.Vector3(x + w / 2, y + h, z + d / 2) });
}

// ------------------------------------------------------------ 텍스처 재질 + 면마다 미터 단위 UV
const TL = new THREE.TextureLoader(), texCache = {};
export function tex(file, srgb = true) {
  if (!texCache[file]) {
    const t = TL.load('assets/tex/' + file); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace; texCache[file] = t;
  }
  return texCache[file];
}
const tmCache = {};
// name: assets/tex/name.jpg (+_n, +_e), tw/th: 텍스처 한 장이 덮는 미터
export function T(name, o = {}) {
  const key = name + JSON.stringify(o);
  if (tmCache[key]) return tmCache[key];
  const m = new THREE.MeshStandardMaterial({
    map: tex(name + '.jpg'), normalMap: o.n === false ? null : tex(name + '_n.jpg', false),
    roughness: o.r ?? 0.85, metalness: o.m ?? 0, color: o.c ?? 0xffffff,
    emissiveMap: o.e ? tex(name + '_e.jpg') : null, emissive: o.e ? (o.ec ?? 0xffffff) : 0x000000, emissiveIntensity: o.ei ?? 1,
    side: o.side ?? THREE.FrontSide,
  });
  if (m.normalMap) m.normalScale.set(o.ns ?? 1, o.ns ?? 1);
  m.userData.tile = [o.tw ?? 2, o.th ?? o.tw ?? 2];
  m.userData.local = !!o.local;
  return (tmCache[key] = m);
}
const _p = new THREE.Vector3(), _n = new THREE.Vector3();
// 상자: 바닥 중앙 (x, y, z), 크기 (w, h, d). 재질이 local이면 면마다 왼쪽 아래 모서리부터, 아니면 세계 좌표로 UV
export function tblock(x, y, z, w, h, d, mat, o = {}) {
  const g = new THREE.BoxGeometry(w, h, d);
  tE.set(o.rx || 0, o.ry || 0, o.rz || 0); tQ.setFromEuler(tE);
  tM.compose(tP.set(x, y + h / 2, z), tQ, tS.set(1, 1, 1));
  uvBox(g, mat, tM, w, h, d, o.v0 || 0, o.u0 || 0);
  addGeo(g, mat, tM, o.cast !== false);
  if (o.solid !== false) boxes.push({ min: new THREE.Vector3(x - w / 2, y, z - d / 2), max: new THREE.Vector3(x + w / 2, y + h, z + d / 2) });
}
export function uvBox(g, mat, matrix, w, h, d, v0 = 0, u0 = 0) {
  const [tw, th] = mat.userData.tile || [1, 1], local = mat.userData.local;
  const pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    _p.fromBufferAttribute(pos, i); _n.fromBufferAttribute(nor, i);
    let u, v;
    if (local) {
      if (_n.x > 0.5) u = d / 2 - _p.z; else if (_n.x < -0.5) u = _p.z + d / 2;
      else if (_n.z > 0.5) u = _p.x + w / 2; else if (_n.z < -0.5) u = w / 2 - _p.x;
      else u = _p.x + w / 2;
      v = Math.abs(_n.y) > 0.5 ? (_n.y > 0 ? d / 2 - _p.z : _p.z + d / 2) : _p.y + h / 2;
    } else {
      _p.applyMatrix4(matrix); _n.transformDirection(matrix);
      const ax = Math.abs(_n.x), ay = Math.abs(_n.y), az = Math.abs(_n.z);
      if (ay >= ax && ay >= az) { u = _p.x; v = -_p.z; }
      else if (ax >= az) { u = _n.x > 0 ? -_p.z : _p.z; v = _p.y; }
      else { u = _n.z > 0 ? _p.x : -_p.x; v = _p.y; }
    }
    uv.setXY(i, (u + u0) / tw, (v + v0) / th);
  }
}
// 아무 모양(이미 세계 좌표가 아니어도 됨)을 정적 합치기에 넣음, 재질이 텍스처면 세계 UV 자동
export function addMesh(geo, mat, matrix, cast = true) {
  if (mat.userData && mat.userData.tile && !mat.userData.keepUV) {
    geo = geo.index ? geo.toNonIndexed() : geo.clone();
    const [tw, th] = mat.userData.tile; const pos = geo.attributes.position, nor = geo.attributes.normal;
    const uv = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      _p.fromBufferAttribute(pos, i).applyMatrix4(matrix); _n.fromBufferAttribute(nor, i).transformDirection(matrix);
      const ax = Math.abs(_n.x), ay = Math.abs(_n.y), az = Math.abs(_n.z); let u, v;
      if (ay >= ax && ay >= az) { u = _p.x; v = -_p.z; } else if (ax >= az) { u = _n.x > 0 ? -_p.z : _p.z; v = _p.y; } else { u = _n.z > 0 ? _p.x : -_p.x; v = _p.y; }
      uv[i * 2] = u / tw; uv[i * 2 + 1] = v / th;
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  }
  addGeo(geo, mat, matrix, cast);
}
export function solid(x0, y0, z0, x1, y1, z1) { boxes.push({ min: new THREE.Vector3(x0, y0, z0), max: new THREE.Vector3(x1, y1, z1) }); }
export function cylinder(x, y, z, r, h, col, o = {}) {
  const mat = typeof col === 'object' ? col : M(col, o);
  const g = new THREE.CylinderGeometry(o.rt ?? r, r, h, o.seg || 14);
  tE.set(o.rx || 0, o.ry || 0, o.rz || 0); tQ.setFromEuler(tE);
  tM.compose(tP.set(x, y + h / 2, z), tQ, tS.set(1, 1, 1));
  addGeo(g, mat, tM, o.cast !== false);
  if (o.solid) { const s = r * 0.85; boxes.push({ min: new THREE.Vector3(x - s, y, z - s), max: new THREE.Vector3(x + s, y + h, z + s) }); }
}
export function add(obj) { W.group.add(obj); return obj; }
export function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
export function sign(x, y, z, w, h, ry, text, col, bg = '#120c18', flicker = 0) {
  const tex = canvasTex(256 * (w / h) | 0, 256, (g, Wd, Ht) => {
    g.fillStyle = bg; g.fillRect(0, 0, Wd, Ht);
    g.strokeStyle = col; g.lineWidth = 10; g.strokeRect(10, 10, Wd - 20, Ht - 20);
    g.fillStyle = col; g.shadowColor = col; g.shadowBlur = 18;
    g.font = `900 ${Ht * 0.5}px "Noto Sans KR", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, Wd / 2, Ht / 2 + 6);
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  m.position.set(x, y, z); m.rotation.y = ry; add(m);
  if (flicker) W.signs.push({ m, f: flicker });
}
export function clockFace(x, y, z, r, ry, broken = false) {
  const tex = canvasTex(256, 256, (g) => {
    g.fillStyle = broken ? '#cfc8bb' : '#f3efe6'; g.beginPath(); g.arc(128, 128, 124, 0, 7); g.fill();
    g.strokeStyle = '#2a2622'; g.lineWidth = 8; g.stroke();
    g.fillStyle = '#2a2622';
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; g.fillRect(124 + Math.sin(a) * 100 - 2, 124 - Math.cos(a) * 100 - 8, 8, 18); }
    const hand = (a, l, wd) => { g.save(); g.translate(128, 128); g.rotate(a); g.fillRect(-wd / 2, -l, wd, l + 12); g.restore(); };
    hand((3 + 17 / 60) / 12 * Math.PI * 2, 62, 10); hand(17 / 60 * Math.PI * 2, 96, 6);
    g.fillStyle = '#ff8a2a'; hand(42 / 60 * Math.PI * 2, 100, 3);
    if (broken) { g.strokeStyle = '#3a332c'; g.lineWidth = 3; g.beginPath(); g.moveTo(40, 60); g.lineTo(130, 120); g.lineTo(150, 230); g.moveTo(130, 120); g.lineTo(220, 90); g.stroke(); }
  });
  const m = new THREE.Mesh(new THREE.CircleGeometry(r, 40), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }));
  m.position.set(x, y, z); m.rotation.y = ry; add(m);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(r, r * 0.07, 8, 40), M('#3b3530', { m: 0.6, r: 0.4 }));
  rim.position.copy(m.position); rim.rotation.y = ry; add(rim);
}
export function startMap(scene) {
  if (W.group) {
    scene.remove(W.group);
    W.group.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material && o.material.map) o.material.map.dispose(); });
  }
  W.group = new THREE.Group(); W.scene = scene; scene.add(W.group);
  boxes.length = 0; W.signs.length = 0; staticGeo.clear();
}
export function finishMap() {
  for (const { mat, cast, list } of staticGeo.values()) {
    const g = mergeGeometries(list);
    const mesh = new THREE.Mesh(g, mat); mesh.castShadow = cast; mesh.receiveShadow = true; add(mesh);
  }
  staticGeo.clear();
  buildNav();
}

// ------------------------------------------------------------ 충돌
function overlapsXZ(b, x, z, r) { return x + r > b.min.x && x - r < b.max.x && z + r > b.min.z && z - r < b.max.z; }
export function moveUnit(u, dt) {
  const r = u.radius, h = u.height, wasGround = u.onGround;
  for (const ax of ['x', 'z']) {
    u.pos[ax] += u.vel[ax] * dt;
    for (const b of boxes) {
      if (b.off) continue;
      if (b.max.y <= u.pos.y + STEP || b.min.y >= u.pos.y + h) continue;
      if (!overlapsXZ(b, u.pos.x, u.pos.z, r)) continue;
      const c = (b.min[ax] + b.max[ax]) / 2;
      u.pos[ax] = u.pos[ax] < c ? b.min[ax] - r - 0.001 : b.max[ax] + r + 0.001;
      u.hitWall = true;
    }
  }
  u.vel.y -= G * dt * (u.gravScale ?? 1);
  const prevY = u.pos.y;
  u.pos.y += u.vel.y * dt;
  if (u.vel.y > 0) for (const b of boxes) {
    if (b.off) continue;
    if (b.min.y >= prevY + h - 0.01 && b.min.y < u.pos.y + h && overlapsXZ(b, u.pos.x, u.pos.z, r * 0.9)) { u.pos.y = b.min.y - h; u.vel.y = 0; }
  }
  let ground = -50;
  for (const b of boxes) {
    if (b.off) continue;
    if (b.max.y <= Math.max(prevY, u.pos.y) + STEP && b.max.y > ground && overlapsXZ(b, u.pos.x, u.pos.z, r * 0.85)) ground = b.max.y;
  }
  if (u.pos.y <= ground + (wasGround && u.vel.y <= 0 ? 0.08 : 0)) {
    if (u.vel.y <= 0) { u.pos.y = ground; u.vel.y = 0; u.onGround = true; if (!wasGround) u.landed = true; }
  } else u.onGround = false;
  const B = W.bounds;
  u.pos.x = clamp(u.pos.x, B.x0 + 0.5, B.x1 - 0.5); u.pos.z = clamp(u.pos.z, B.z0 + 0.5, B.z1 - 0.5);
  if (u.pos.y < -10) { u.pos.y = 2; u.vel.y = 0; }
}
export function rayBoxes(o, d, maxT) {
  let best = maxT;
  for (const b of boxes) {
    if (b.off) continue;
    let t0 = 0, t1 = best, ok = true;
    for (const ax of ['x', 'y', 'z']) {
      const inv = 1 / d[ax];
      let ta = (b.min[ax] - o[ax]) * inv, tb = (b.max[ax] - o[ax]) * inv;
      if (ta > tb) { const s = ta; ta = tb; tb = s; }
      if (ta > t0) t0 = ta; if (tb < t1) t1 = tb;
      if (t0 > t1) { ok = false; break; }
    }
    if (ok && t0 < best) best = t0;
  }
  return best;
}
const _a = new THREE.Vector3();
export function los(a, b) { _a.subVectors(b, a); const L = _a.length(); if (L < 1e-4) return true; _a.divideScalar(L); return rayBoxes(a, _a, L) >= L - 0.05; }
export function pointInSolid(p) {
  for (const b of boxes) if (!b.off && p.x > b.min.x && p.x < b.max.x && p.y > b.min.y && p.y < b.max.y && p.z > b.min.z && p.z < b.max.z) return true;
  return false;
}
export function groundAt(x, z, below) {
  let g = 0; for (const b of boxes) if (!b.off && b.max.y <= below && b.max.y > g && x > b.min.x && x < b.max.x && z > b.min.z && z < b.max.z) g = b.max.y;
  return g;
}

// ------------------------------------------------------------ 격자 길찾기 (높이 인식 2.5D)
// 칸마다 "서 있을 수 있는 가장 높은 면"을 구하고, 오르막은 0.55 m까지·내리막은 얼마든지 이어진다.
const CELL = 0.75, CLEAR = 1.9, MAXH = 6.5;
const NAV = { nx: 0, nz: 0, free: null, h: null, x0: 0, z0: 0 };
export function buildNav() {
  const B = W.bounds;
  NAV.x0 = B.x0; NAV.z0 = B.z0; NAV.nx = Math.ceil((B.x1 - B.x0) / CELL); NAV.nz = Math.ceil((B.z1 - B.z0) / CELL);
  const N = NAV.nx * NAV.nz;
  NAV.free = new Uint8Array(N); NAV.h = new Float32Array(N);
  const hs = 0.45, stat = boxes.filter(b => !b.dyn);
  for (let i = 0; i < NAV.nx; i++) for (let k = 0; k < NAV.nz; k++) {
    const x = NAV.x0 + (i + 0.5) * CELL, z = NAV.z0 + (k + 0.5) * CELL, c = i + k * NAV.nx;
    if (x < B.x0 + 0.8 || x > B.x1 - 0.8 || z < B.z0 + 0.8 || z > B.z1 - 0.8) continue;
    const near = stat.filter(b => x + hs > b.min.x && x - hs < b.max.x && z + hs > b.min.z && z - hs < b.max.z);
    // 후보 면: 바닥(0)과 가운데를 덮는 상자 윗면들
    const cands = [0];
    for (const b of near) if (b.max.y <= MAXH && x > b.min.x && x < b.max.x && z > b.min.z && z < b.max.z) cands.push(b.max.y);
    cands.sort((a, b) => b - a);
    for (const g of cands) {
      let ok = true;
      for (const b of near) if (b.max.y > g + STEP && b.min.y < g + CLEAR) { ok = false; break; }
      if (ok) { NAV.free[c] = 1; NAV.h[c] = g; break; }
    }
  }
}
function cellOf(x, z) { return [clamp(Math.floor((x - NAV.x0) / CELL), 0, NAV.nx - 1), clamp(Math.floor((z - NAV.z0) / CELL), 0, NAV.nz - 1)]; }
function nearestFree(i, k, y) {
  let best = null, bd = 1e9;
  for (let r = 0; r < 14 && !best; r++) for (let di = -r; di <= r; di++) for (let dk = -r; dk <= r; dk++) {
    const a = i + di, b = k + dk; if (a < 0 || b < 0 || a >= NAV.nx || b >= NAV.nz) continue;
    const c = a + b * NAV.nx; if (!NAV.free[c]) continue;
    const d = di * di + dk * dk + (y === undefined ? 0 : Math.abs(NAV.h[c] - y) * 4);
    if (d < bd) { bd = d; best = [a, b]; }
  }
  return best || [i, k];
}
export function navHeight(x, z) { const [i, k] = cellOf(x, z); return NAV.h ? NAV.h[i + k * NAV.nx] : 0; }
export function randomFreeNear(x, z, r, maxY = 99, minY = -1) {
  for (let t = 0; t < 40; t++) {
    const px = x + rand(-r, r), pz = z + rand(-r, r); const [i, k] = cellOf(px, pz), c = i + k * NAV.nx;
    if (NAV.free[c] && NAV.h[c] <= maxY && NAV.h[c] >= minY) return new THREE.Vector3(px, NAV.h[c], pz);
  }
  return new THREE.Vector3(x, 0, z);
}
const canStep = (a, b) => NAV.h[b] <= NAV.h[a] + 0.55;
export function findPath(from, to) {
  const [si, sk] = nearestFree(...cellOf(from.x, from.z), from.y);
  const [gi, gk] = nearestFree(...cellOf(to.x, to.z), to.y);
  const N = NAV.nx * NAV.nz, start = si + sk * NAV.nx, goal = gi + gk * NAV.nx;
  const gS = new Float32Array(N).fill(1e9), prev = new Int32Array(N).fill(-1), closed = new Uint8Array(N), f = new Float32Array(N).fill(1e9);
  const hx = (c) => { const dx = Math.abs(c % NAV.nx - gi), dz = Math.abs((c / NAV.nx | 0) - gk); return Math.max(dx, dz) + 0.414 * Math.min(dx, dz); };
  // 이진 힙
  const heap = [];
  const push = (c) => { heap.push(c); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (f[heap[p]] <= f[heap[i]]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && f[heap[l]] < f[heap[m]]) m = l; if (r < heap.length && f[heap[r]] < f[heap[m]]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  gS[start] = 0; f[start] = hx(start); push(start);
  let found = false;
  while (heap.length) {
    const c = pop(); if (closed[c]) continue; closed[c] = 1;
    if (c === goal) { found = true; break; }
    const ci = c % NAV.nx, ck = c / NAV.nx | 0;
    for (let di = -1; di <= 1; di++) for (let dk = -1; dk <= 1; dk++) {
      if (!di && !dk) continue;
      const a = ci + di, b = ck + dk; if (a < 0 || b < 0 || a >= NAV.nx || b >= NAV.nz) continue;
      const n = a + b * NAV.nx; if (!NAV.free[n] || closed[n] || !canStep(c, n)) continue;
      if (di && dk) { const s1 = ci + di + ck * NAV.nx, s2 = ci + (ck + dk) * NAV.nx; if (!NAV.free[s1] || !NAV.free[s2] || Math.abs(NAV.h[s1] - NAV.h[c]) > 0.55 || Math.abs(NAV.h[s2] - NAV.h[c]) > 0.55) continue; }
      const ng = gS[c] + (di && dk ? 1.414 : 1) + (NAV.h[n] < NAV.h[c] - 0.6 ? 0.5 : 0);
      if (ng < gS[n]) { gS[n] = ng; prev[n] = c; f[n] = ng + hx(n); push(n); }
    }
  }
  if (!found) return [to.clone()];
  const cells = []; for (let c = goal; c !== -1; c = prev[c]) cells.push(c);
  cells.reverse();
  const P = (c) => new THREE.Vector3(NAV.x0 + (c % NAV.nx + 0.5) * CELL, NAV.h[c], NAV.z0 + ((c / NAV.nx | 0) + 0.5) * CELL);
  // 줄 당기기: 같은 높이로 곧게 이어지는 칸끼리만 건너뜀(계단·턱은 지나가게)
  const flatLine = (a, b) => {
    const pa = P(a), pb = P(b), L = Math.hypot(pb.x - pa.x, pb.z - pa.z), n = Math.ceil(L / 0.6);
    for (let t = 1; t < n; t++) {
      const [i, k] = cellOf(pa.x + (pb.x - pa.x) * t / n, pa.z + (pb.z - pa.z) * t / n), c = i + k * NAV.nx;
      if (!NAV.free[c] || Math.abs(NAV.h[c] - NAV.h[a]) > 0.05) return false;
    }
    return Math.abs(NAV.h[b] - NAV.h[a]) <= 0.05;
  };
  const out = []; let i = 0;
  while (i < cells.length - 1) {
    let j = Math.min(cells.length - 1, i + 28);
    for (; j > i + 1; j--) if (flatLine(cells[i], cells[j])) break;
    out.push(P(cells[j])); i = j;
  }
  out.push(to.clone());
  return out;
}
export function navReady() { return !!NAV.free; }
