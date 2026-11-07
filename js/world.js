// 맵 만들기 도구 · 충돌 · 광선 · 격자 길찾기
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const STEP = 0.5, G = 20;
export const boxes = [];            // {min, max, dyn?, off?}
export const W = { group: null, scene: null, signs: [], bounds: { x0: -32, x1: 32, z0: -46, z1: 46 } };
export const rand = (a, b) => a + Math.random() * (b - a);
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const matCache = {};
export function M(col, opt = {}) {
  const key = col + JSON.stringify(opt);
  if (!matCache[key]) matCache[key] = new THREE.MeshStandardMaterial({ color: col, roughness: opt.r ?? 0.8, metalness: opt.m ?? 0, emissive: opt.e ?? 0x000000, emissiveIntensity: opt.ei ?? 1, transparent: !!opt.t, opacity: opt.t ?? 1 });
  return matCache[key];
}
const staticGeo = new Map();
function addGeo(geo, mat, matrix, cast = true) {
  geo = geo.clone(); geo.applyMatrix4(matrix);
  if (geo.index) geo = geo.toNonIndexed();
  for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal') geo.deleteAttribute(k);
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

// ------------------------------------------------------------ 격자 길찾기 (지면 높이 1m 이하만)
const CELL = 1.5;
const NAV = { nx: 0, nz: 0, free: null, x0: 0, z0: 0 };
export function buildNav() {
  const B = W.bounds;
  NAV.x0 = B.x0; NAV.z0 = B.z0; NAV.nx = Math.ceil((B.x1 - B.x0) / CELL); NAV.nz = Math.ceil((B.z1 - B.z0) / CELL);
  NAV.free = new Uint8Array(NAV.nx * NAV.nz);
  const hs = 0.5;
  for (let i = 0; i < NAV.nx; i++) for (let k = 0; k < NAV.nz; k++) {
    const x = NAV.x0 + (i + 0.5) * CELL, z = NAV.z0 + (k + 0.5) * CELL;
    let g = 0;
    for (const b of boxes) if (!b.dyn && b.max.y <= 1.0 && b.max.y > g && x > b.min.x && x < b.max.x && z > b.min.z && z < b.max.z) g = b.max.y;
    let ok = x > B.x0 + 0.8 && x < B.x1 - 0.8 && z > B.z0 + 0.8 && z < B.z1 - 0.8;
    if (ok) for (const b of boxes) {
      if (b.dyn) continue;
      if (b.max.y <= g + STEP || b.min.y >= g + 1.9) continue;
      if (x + hs > b.min.x && x - hs < b.max.x && z + hs > b.min.z && z - hs < b.max.z) { ok = false; break; }
    }
    NAV.free[i + k * NAV.nx] = ok ? 1 : 0;
  }
}
function cellOf(x, z) { return [clamp(Math.floor((x - NAV.x0) / CELL), 0, NAV.nx - 1), clamp(Math.floor((z - NAV.z0) / CELL), 0, NAV.nz - 1)]; }
function nearestFree(i, k) {
  if (NAV.free[i + k * NAV.nx]) return [i, k];
  for (let r = 1; r < 8; r++) for (let di = -r; di <= r; di++) for (let dk = -r; dk <= r; dk++) {
    const a = i + di, b = k + dk; if (a < 0 || b < 0 || a >= NAV.nx || b >= NAV.nz) continue;
    if (NAV.free[a + b * NAV.nx]) return [a, b];
  }
  return [i, k];
}
export function randomFreeNear(x, z, r) {
  for (let t = 0; t < 30; t++) {
    const px = x + rand(-r, r), pz = z + rand(-r, r); const [i, k] = cellOf(px, pz);
    if (NAV.free[i + k * NAV.nx]) return new THREE.Vector3(px, 0, pz);
  }
  return new THREE.Vector3(x, 0, z);
}
export function findPath(from, to) {
  const [si, sk] = nearestFree(...cellOf(from.x, from.z));
  const [gi, gk] = nearestFree(...cellOf(to.x, to.z));
  const N = NAV.nx * NAV.nz, start = si + sk * NAV.nx, goal = gi + gk * NAV.nx;
  const gS = new Float32Array(N).fill(1e9), prev = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
  const open = [start]; gS[start] = 0;
  const hx = (c) => { const dx = Math.abs(c % NAV.nx - gi), dz = Math.abs((c / NAV.nx | 0) - gk); return Math.max(dx, dz) + 0.414 * Math.min(dx, dz); };
  const f = new Float32Array(N).fill(1e9); f[start] = hx(start);
  let iter = 0;
  while (open.length && iter++ < 6000) {
    let bi = 0; for (let j = 1; j < open.length; j++) if (f[open[j]] < f[open[bi]]) bi = j;
    const c = open[bi]; open[bi] = open[open.length - 1]; open.pop();
    if (c === goal) break;
    if (closed[c]) continue; closed[c] = 1;
    const ci = c % NAV.nx, ck = c / NAV.nx | 0;
    for (let di = -1; di <= 1; di++) for (let dk = -1; dk <= 1; dk++) {
      if (!di && !dk) continue;
      const a = ci + di, b = ck + dk; if (a < 0 || b < 0 || a >= NAV.nx || b >= NAV.nz) continue;
      const n = a + b * NAV.nx; if (!NAV.free[n] || closed[n]) continue;
      if (di && dk && (!NAV.free[ci + di + ck * NAV.nx] || !NAV.free[ci + (ck + dk) * NAV.nx])) continue;
      const ng = gS[c] + (di && dk ? 1.414 : 1);
      if (ng < gS[n]) { gS[n] = ng; prev[n] = c; f[n] = ng + hx(n); open.push(n); }
    }
  }
  const cells = [];
  for (let c = goal; c !== -1; c = prev[c]) { cells.push(c); if (c === start) break; }
  if (cells[cells.length - 1] !== start) return [to.clone()];
  cells.reverse();
  const pts = cells.map(c => new THREE.Vector3(NAV.x0 + (c % NAV.nx + 0.5) * CELL, 0, NAV.z0 + ((c / NAV.nx | 0) + 0.5) * CELL));
  pts.push(to.clone());
  // 줄 당기기: 보이는 가장 먼 점으로 건너뛰기
  const out = []; let cur = from.clone().setY(0.7), i = 0;
  const o2 = new THREE.Vector3(), t2 = new THREE.Vector3();
  while (i < pts.length - 1) {
    let j = Math.min(pts.length - 1, i + 14);
    for (; j > i + 1; j--) {
      o2.copy(cur); t2.copy(pts[j]).setY(0.7);
      if (los(o2, t2)) break;
    }
    out.push(pts[j]); cur = pts[j].clone().setY(0.7); i = j;
  }
  return out.length ? out : [to.clone()];
}
export function navReady() { return !!NAV.free; }
