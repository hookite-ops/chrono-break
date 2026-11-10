// 영웅 시험장 — Tripo 모델 + 따로 만든 무기, 절차적 애니메이션(발 IK 보행·회전 스텝·점프·반동·장전·무기 흔들림)
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const $ = (id) => document.getElementById(id);
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1f2b);
scene.fog = new THREE.Fog(0x1a1f2b, 40, 95);
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 200);
scene.add(new THREE.HemisphereLight(0xcfe3ff, 0x3a2f28, 1.1));
const sun = new THREE.DirectionalLight(0xfff1dc, 2.6);
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -18, right: 18, top: 18, bottom: -18, near: 1, far: 70 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);
const rim = new THREE.DirectionalLight(0x7fb8ff, 0.9); rim.position.set(-10, 6, 12); scene.add(rim);

// ───────── 영웅 설정 ─────────
const HEROES = {
  ratchet: {
    name: '래칫', sub: '돌파형 탱커 · 충각판 산탄총', glb: 'assets/play/ratchet.glb', meta: 'assets/play/ratchet.json',
    gun: 'assets/play/shotgun.glb', gunScale: 0.95, speed: 5.2, wpn: 'shotgun',
    gunOff: [0.24, -0.22, -0.40], twist: 0.4, palmR: [-1, 0, 0], palmL: [1, 0, 0],
    stanceW: 0.24, stride: 1.25, lift: 0.16, crouch: 0.05, cam: [1.2, 0.35, 3.8], heavy: 1,
    wristR: [-0.13, 0.05, -0.03], wristL: [-0.12, -0.04, -0.07], padFollow: 0.35,
  },
  orbit: {
    name: '오비트', sub: '방벽형 탱커 · 에너지 소총', glb: 'assets/play/orbit.glb', meta: 'assets/play/orbit.json',
    gun: 'assets/play/rifle.glb', gunScale: 1.0, speed: 5.0, wpn: 'rifle',
    gunOff: [0.15, -0.1, -0.1], twist: 0.6, palmR: [0, -1, 0], palmL: [0, -1, 0],
    stanceW: 0.13, stride: 1.45, lift: 0.17, crouch: 0.07, cam: [1.0, 0.3, 3.3], heavy: 0,
    wristR: [-0.09, 0.03, -0.02], wristL: [-0.08, -0.02, -0.05],
  },
};
const WPN = {
  shotgun: { mag: 6, rate: 0.85, pellets: 10, spread: 0.075, dmg: 9, falloff: [8, 28], reload: 'shell', kick: 1, auto: false },
  rifle: { mag: 32, rate: 0.09, pellets: 1, spread: 0.006, dmg: 9, falloff: [22, 45], reload: 'mag', kick: 0.28, auto: true },
};

// ───────── 경기장 ─────────
function gridTex() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#3a404d'; g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#353a46'; g.fillRect(0, 0, 128, 128); g.fillRect(128, 128, 128, 128);
  g.strokeStyle = '#4b5263'; g.lineWidth = 3; g.strokeRect(0, 0, 256, 256);
  g.strokeStyle = '#ff7a2f55'; g.lineWidth = 2; g.beginPath(); g.moveTo(124, 128); g.lineTo(132, 128); g.moveTo(128, 124); g.lineTo(128, 132); g.stroke();
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(40, 40);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ map: gridTex(), roughness: 0.9 }));
floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
const boxes = [];
const MAT = {
  crate: new THREE.MeshStandardMaterial({ color: 0x8a5a34, roughness: 0.8 }),
  wall: new THREE.MeshStandardMaterial({ color: 0x5b6475, roughness: 0.85 }),
  teal: new THREE.MeshStandardMaterial({ color: 0x2f7d7a, roughness: 0.6 }),
  glow: new THREE.MeshStandardMaterial({ color: 0xff7a2f, emissive: 0xff7a2f, emissiveIntensity: 1.4 }),
};
function box(x, z, w, h, d, mat = MAT.crate, y = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y + h / 2, z); m.castShadow = m.receiveShadow = true; scene.add(m);
  boxes.push({ min: new THREE.Vector3(x - w / 2, y, z - d / 2), max: new THREE.Vector3(x + w / 2, y + h, z + d / 2), mesh: m });
  return m;
}
for (const [x, z, w, d] of [[0, -40, 80, 1], [0, 40, 80, 1], [-40, 0, 1, 80], [40, 0, 1, 80]]) box(x, z, w, 4, d, MAT.wall);
box(-6, -8, 2, 1.2, 2); box(-3.8, -8.4, 1.4, 0.8, 1.4); box(6, -10, 2.4, 1.6, 2.4); box(8, -14, 6, 0.6, 3, MAT.teal);
box(-10, -16, 4, 2.4, 1, MAT.wall); box(0, -18, 8, 1.1, 1, MAT.wall); box(12, -4, 1.2, 1.2, 1.2);
box(-12, -4, 3, 0.5, 3, MAT.teal); box(-12, -4, 2, 0.5, 2, MAT.teal, 0.5); box(-12, -4, 1, 0.5, 1, MAT.teal, 1.0);
box(0, 8, 3, 0.4, 3, MAT.teal); box(-16, 10, 2, 3, 2, MAT.wall); box(16, 10, 2, 3, 2, MAT.wall);
for (let i = 0; i < 6; i++) { const m = box(-15 + i * 6, -30, 0.3, 0.3, 0.3, MAT.glow); m.castShadow = false; }

// ───────── 과녁 로봇 ─────────
const dummies = [];
function dummy(x, z, move = 0) {
  const g = new THREE.Group(); g.position.set(x, 0, z);
  const mat = new THREE.MeshStandardMaterial({ color: 0xd8dde6, roughness: 0.55, metalness: 0.1 });
  const red = new THREE.MeshStandardMaterial({ color: 0xff4b4b, emissive: 0xff2020, emissiveIntensity: 0.6 });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 0.15, 20), MAT.wall); base.position.y = 0.075;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.5, 8), MAT.wall); pole.position.y = 0.4;
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.36, 0.7, 6, 16), mat); body.position.y = 1.1;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 20, 14), mat); head.position.y = 1.78;
  const eye = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 0.05), red); eye.position.set(0, 1.8, 0.2);
  const top = new THREE.Group(); top.add(body, head, eye);
  for (const m of [base, pole, body, head]) { m.castShadow = true; m.receiveShadow = true; }
  g.add(base, pole, top); scene.add(g);
  dummies.push({ g, top, mat, hp: 360, max: 360, x, z, move, t: Math.random() * 6, dead: 0, flash: 0, fall: 0, knock: 0 });
}
dummy(-4, -14); dummy(3, -12); dummy(0, -24, 4); dummy(-9, -22, 3); dummy(9, -22); dummy(12, -9, 2); dummy(-14, -10);
const dummySpheres = (d) => {
  const p = d.g.position;
  return [[0.8, 0.38, false], [1.15, 0.38, false], [1.42, 0.36, false], [1.78, 0.24, true]].map(([y, r, crit]) => ({ c: new THREE.Vector3(p.x, y, p.z), r, crit }));
};

// ───────── 소리 ─────────
let AC = null, master;
function audio() { if (AC) return; AC = new (window.AudioContext || window.webkitAudioContext)(); master = AC.createDynamicsCompressor(); master.connect(AC.destination); }
const NB = {};
function noiseBuf(len) {
  const key = len.toFixed(2); if (NB[key]) return NB[key];
  const b = AC.createBuffer(1, Math.ceil(AC.sampleRate * len), AC.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return (NB[key] = b);
}
function burst(t0, len, f, q, g0, type = 'lowpass') {
  const s = AC.createBufferSource(); s.buffer = noiseBuf(len);
  const fl = AC.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
  const g = AC.createGain(); g.gain.setValueAtTime(g0, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + len);
  s.connect(fl); fl.connect(g); g.connect(master); s.start(t0);
}
function tone(t0, f0, f1, len, g0, type = 'sine') {
  const o = AC.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(f1, t0 + len);
  const g = AC.createGain(); g.gain.setValueAtTime(g0, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + len);
  o.connect(g); g.connect(master); o.start(t0); o.stop(t0 + len);
}
const SFX = {
  shotgun() { const t = AC.currentTime; burst(t, 0.06, 6000, 0.7, 0.9, 'highpass'); burst(t, 0.35, 1400, 0.8, 1.2); tone(t, 120, 38, 0.3, 1.1); },
  pump() { const t = AC.currentTime; burst(t, 0.05, 2500, 3, 0.35, 'bandpass'); burst(t + 0.12, 0.06, 1800, 3, 0.4, 'bandpass'); },
  rifle() { const t = AC.currentTime; tone(t, 1400, 220, 0.09, 0.28, 'sawtooth'); burst(t, 0.07, 3500, 1.2, 0.5, 'bandpass'); tone(t, 90, 50, 0.08, 0.5); },
  hit(crit) { const t = AC.currentTime; tone(t, crit ? 1700 : 1150, crit ? 1500 : 900, 0.07, 0.22); },
  kill() { const t = AC.currentTime; tone(t, 600, 1200, 0.18, 0.35); tone(t + 0.08, 900, 1800, 0.2, 0.25); },
  click(f = 3000) { const t = AC.currentTime; burst(t, 0.04, f, 4, 0.35, 'bandpass'); },
  step(h) { const t = AC.currentTime; burst(t, 0.07, h ? 220 : 380, 1, h ? 0.3 : 0.16); },
  land(h) { const t = AC.currentTime; tone(t, 90, 40, 0.15, h ? 0.7 : 0.4); burst(t, 0.12, 500, 1, 0.4); },
};
const sfx = (n, ...a) => { if (AC) SFX[n](...a); };

// ───────── 수학 도우미 ─────────
const UP = new THREE.Vector3(0, 1, 0);
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const wpos = (o) => o.getWorldPosition(new THREE.Vector3());
const wquat = (o) => o.getWorldQuaternion(new THREE.Quaternion());
const smooth = (x) => x * x * (3 - 2 * x);
const smoother = (x) => x * x * x * (x * (x * 6 - 15) + 10);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const lerp = (a, b, t) => a + (b - a) * t;
const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const damp = (cur, tgt, rate, dt) => cur + (tgt - cur) * (1 - Math.exp(-rate * dt));
class Spring { constructor(k = 120, d = 14) { this.x = 0; this.v = 0; this.k = k; this.d = d; }
  step(t, dt) { this.v += ((t - this.x) * this.k - this.v * this.d) * dt; this.x += this.v * dt; return this.x; } }
class Spring3 { constructor(k = 120, d = 14) { this.x = V(); this.v = V(); this.k = k; this.d = d; }
  step(t, dt) { const a = t.clone().sub(this.x).multiplyScalar(this.k).addScaledVector(this.v, -this.d); this.v.addScaledVector(a, dt); this.x.addScaledVector(this.v, dt); return this.x; } }

// ───────── 모델·리그 ─────────
const loader = new GLTFLoader();
const load = (u) => new Promise((res, rej) => loader.load(u, res, undefined, rej));
const CACHE = {};
let H = null; // 현재 영웅 인스턴스

function rotWorld(bone, q) {
  const pq = wquat(bone.parent);
  const wq = pq.clone().multiply(bone.quaternion);
  bone.quaternion.copy(pq.invert().multiply(q.clone().multiply(wq)));
  bone.updateMatrixWorld(true);
}
function rotAxis(bone, axisW, ang) { if (bone && Math.abs(ang) > 1e-5) rotWorld(bone, new THREE.Quaternion().setFromAxisAngle(axisW, ang)); }
function setWorldQuat(bone, q) { rotWorld(bone, q.clone().multiply(wquat(bone).invert())); }
function boneDir(name) { return H.dirs[name].clone().applyQuaternion(wquat(H.B[name])).normalize(); }
function aimBone(name, dirW, palmW) {
  const b = H.B[name], d = dirW.clone().normalize();
  rotWorld(b, new THREE.Quaternion().setFromUnitVectors(boneDir(name), d));
  if (palmW && H.palms[name]) { // 손바닥 방향까지 맞춤 (뼈 축 둘레로 비틀기)
    const cur = H.palms[name].clone().applyQuaternion(wquat(b));
    const a = cur.sub(d.clone().multiplyScalar(cur.dot(d))).normalize();
    const t = palmW.clone().sub(d.clone().multiplyScalar(palmW.dot(d))).normalize();
    const ang = Math.atan2(a.clone().cross(t).dot(d), a.dot(t));
    rotAxis(b, d, ang);
  }
}
function ik2(upper, lower, target, pole) {
  const A = wpos(H.B[upper]);
  const l1 = H.len[upper], l2 = H.len[lower];
  const AT = target.clone().sub(A);
  const d = clamp(AT.length(), Math.abs(l1 - l2) + 0.01, l1 + l2 - 0.002);
  const dir = AT.normalize();
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const pd = pole.clone().sub(dir.clone().multiplyScalar(pole.dot(dir))).normalize();
  const E = A.clone().addScaledVector(dir, a).addScaledVector(pd, h);
  aimBone(upper, E.clone().sub(A));
  aimBone(lower, A.clone().addScaledVector(dir, d).sub(wpos(H.B[lower])));
}

async function getHero(id) {
  if (CACHE[id]) return CACHE[id];
  const C = HEROES[id];
  const [g, w, meta] = await Promise.all([load(C.glb), load(C.gun), fetch(C.meta).then((r) => r.json())]);
  return (CACHE[id] = { g, w, meta });
}
async function setHero(id) {
  const C = HEROES[id], data = await getHero(id);
  if (H) { scene.remove(H.model); scene.remove(H.gun); }
  const m = data.g.scene; m.position.set(0, 0, 0); m.rotation.set(0, 0, 0);
  const B = {};
  m.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } if (o.isBone) B[o.name] = o; });
  scene.add(m);
  // 처음 불러올 때의 자세를 기준(rest)으로 저장
  if (!data.rest) { data.rest = {}; for (const n in B) data.rest[n] = B[n].quaternion.clone(); }
  for (const n in B) B[n].quaternion.copy(data.rest[n]);
  m.updateMatrixWorld(true);
  H = { id, C, W: WPN[C.wpn], model: m, B, rest: data.rest, dirs: {}, len: {}, palms: {}, footRest: {}, meta: data.meta };
  const child = { upperarm_R: 'forearm_R', forearm_R: 'hand_R', upperarm_L: 'forearm_L', forearm_L: 'hand_L', thigh_R: 'shin_R', thigh_L: 'shin_L',
    shin_R: B.foot_R ? 'foot_R' : null, shin_L: B.foot_L ? 'foot_L' : null, spine: B.chest ? 'chest' : 'head', chest: 'head' };
  const tips = data.meta.tips;
  for (const n of Object.keys(B)) {
    const t = child[n] ? wpos(B[child[n]]) : (tips[n] ? V(...tips[n]) : null);
    if (!t) continue;
    const v = t.sub(wpos(B[n]));
    H.len[n] = v.length();
    H.dirs[n] = v.normalize().applyQuaternion(wquat(B[n]).invert());
  }
  H.palms.hand_R = V(...C.palmR).applyQuaternion(wquat(B.hand_R).invert());
  H.palms.hand_L = V(...C.palmL).applyQuaternion(wquat(B.hand_L).invert());
  for (const s of 'RL') if (B['foot_' + s]) H.footRest[s] = wquat(B['foot_' + s]);
  H.hipW = { R: wpos(B.thigh_R), L: wpos(B.thigh_L) };
  H.legLen = H.len.thigh_R + H.len.shin_R + (data.meta.ankleH || 0);
  H.restHipY = (H.hipW.R.y + H.hipW.L.y) / 2;
  // 무기
  const gun = data.w.scene; gun.scale.setScalar(C.gunScale);
  gun.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  H.gun = gun; H.muzzle = gun.getObjectByName('Muzzle'); H.gripL = gun.getObjectByName('Grip_L');
  scene.add(gun);
  // 상태
  Object.assign(P, { mag: H.W.mag, cool: 0, reload: 0, reloadT: 0, bloom: 0 });
  A.lowerYaw = P.yaw;
  $('hname').textContent = C.name; $('hsub').textContent = C.sub; $('magmax').textContent = ' / ' + H.W.mag;
  document.querySelectorAll('.pick').forEach((el) => el.classList.toggle('on', el.dataset.id === id));
}

// ───────── 플레이어 ─────────
const P = { pos: V(0, 0, 4), vel: V(), yaw: 0, pitch: 0, ground: true, mag: 6, cool: 0, reload: 0, reloadT: 0, shots: 0, hits: 0, kills: 0, bloom: 0 };
const keys = {};
let locked = false, showcase = 0, showT = 0, mouseDown = false, switching = false;
addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'KeyR') startReload();
  if (e.code === 'KeyT') showcase = showcase ? 0 : 1;
  if (e.code === 'Digit1') pickHero('ratchet');
  if (e.code === 'Digit2') pickHero('orbit');
  if (e.code === 'Space') e.preventDefault();
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
let yawRate = 0, pitchRate = 0;
addEventListener('mousemove', (e) => {
  if (!locked) return;
  const dx = e.movementX * 0.0022, dy = e.movementY * 0.0022;
  P.yaw -= dx; P.pitch = clamp(P.pitch - dy, -1.2, 1.25);
  yawRate -= dx; pitchRate -= dy;
});
addEventListener('mousedown', (e) => { if (locked && e.button === 0) mouseDown = true; });
addEventListener('mouseup', (e) => { if (e.button === 0) mouseDown = false; });
document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === canvas;
  $('start').style.display = locked ? 'none' : 'grid';
  if (!locked) mouseDown = false;
});
$('go').addEventListener('click', () => { if (!H) return; audio(); try { canvas.requestPointerLock(); } catch (e) {} });
document.querySelectorAll('.pick').forEach((el) => el.addEventListener('click', (e) => { e.stopPropagation(); pickHero(el.dataset.id); }));
async function pickHero(id) {
  if (switching || (H && H.id === id)) return;
  switching = true; $('go').textContent = '불러오는 중…';
  try { await setHero(id); } catch (e) { console.error(e); }
  switching = false; $('go').textContent = '시작';
}

const R = 0.45;
function collide(p, vel) {
  P.ground = false;
  if (p.y <= 0) { p.y = 0; if (vel.y < 0) vel.y = 0; P.ground = true; }
  for (const b of boxes) {
    if (p.x + R < b.min.x || p.x - R > b.max.x || p.z + R < b.min.z || p.z - R > b.max.z) continue;
    const top = b.max.y;
    if (p.y >= top - 0.45 && vel.y <= 0.01) { if (p.y < top + 0.05) { p.y = top; vel.y = 0; P.ground = true; } continue; }
    if (p.y + 2 < b.min.y) continue;
    const dx1 = b.max.x - (p.x - R), dx2 = (p.x + R) - b.min.x, dz1 = b.max.z - (p.z - R), dz2 = (p.z + R) - b.min.z;
    const m = Math.min(dx1, dx2, dz1, dz2);
    if (m === dx1) p.x += dx1; else if (m === dx2) p.x -= dx2; else if (m === dz1) p.z += dz1; else p.z -= dz2;
  }
}
function groundUnder(x, z, y) {
  let g = 0;
  for (const b of boxes) if (x > b.min.x && x < b.max.x && z > b.min.z && z < b.max.z && b.max.y <= y + 0.5) g = Math.max(g, b.max.y);
  return g;
}
function startReload() { if (!H || P.reload > 0 || P.mag >= H.W.mag) return; P.reload = 1; P.reloadT = 0; P.shell = 0; }

// ───────── 효과 ─────────
const fx = [];
const radTex = (stops) => {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); stops.forEach(([o, col]) => r.addColorStop(o, col));
  g.fillStyle = r; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
};
const flashTex = { shotgun: radTex([[0, 'rgba(255,255,230,1)'], [0.3, 'rgba(255,190,90,.9)'], [1, 'rgba(255,120,30,0)']]),
  rifle: radTex([[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,170,80,.95)'], [0.6, 'rgba(90,200,255,.5)'], [1, 'rgba(60,160,255,0)']]) };
const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex.shotgun, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
flash.visible = false; scene.add(flash);
const flashLight = new THREE.PointLight(0xffb060, 0, 9, 2); scene.add(flashLight);
const sparkMat = new THREE.MeshBasicMaterial({ color: 0xffc070 });
const sparkGeo = new THREE.SphereGeometry(0.035, 4, 3);
const decalMat = new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.75, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
const decalGeo = new THREE.CircleGeometry(0.05, 8);
const beamGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0, -0.5);
const decals = [];
function tracer(a, b, kind) {
  if (kind === 'rifle') {
    const m = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: 0xffb35c, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.position.copy(a); m.lookAt(b); m.scale.set(0.025, 0.025, a.distanceTo(b)); scene.add(m);
    const core = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: 0x7fdcff, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
    core.scale.set(2.4, 2.4, 1); m.add(core);
    fx.push({ o: m, t: 0, life: 0.09, kind: 'beam' });
  } else {
    const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), new THREE.LineBasicMaterial({ color: 0xffd28a, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending }));
    scene.add(l); fx.push({ o: l, t: 0, life: 0.07, kind: 'tracer' });
  }
}
function sparks(p, n, normal, color) {
  for (let i = 0; i < n; i++) {
    const s = new THREE.Mesh(sparkGeo, color ? new THREE.MeshBasicMaterial({ color }) : sparkMat); s.position.copy(p); scene.add(s);
    const v = V(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).multiplyScalar(5);
    if (normal) v.addScaledVector(normal, 3);
    fx.push({ o: s, t: 0, life: 0.25 + Math.random() * 0.2, kind: 'spark', v });
  }
}
function decal(p, n) {
  const d = new THREE.Mesh(decalGeo, decalMat); d.position.copy(p).addScaledVector(n, 0.005);
  d.lookAt(p.clone().add(n)); scene.add(d); decals.push(d);
  if (decals.length > 200) scene.remove(decals.shift());
}
function dmgNumber(p, n, crit) {
  const el = document.createElement('div'); el.className = 'dmg' + (crit ? ' crit' : ''); el.textContent = n;
  document.body.appendChild(el);
  fx.push({ el, p: p.clone(), t: 0, life: 0.8, kind: 'num', dx: (Math.random() - 0.5) * 0.6 });
}
let hitT = 0;
// 장전 소품: 산탄 / 탄창
const shellMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.075, 10).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xd8432f, metalness: 0.2, roughness: 0.5 }));
const magMesh = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.16, 0.07), new THREE.MeshStandardMaterial({ color: 0x23262e, metalness: 0.5, roughness: 0.4 }));
const magGlow = new THREE.Mesh(new THREE.BoxGeometry(0.037, 0.02, 0.05), new THREE.MeshStandardMaterial({ color: 0x7fdcff, emissive: 0x7fdcff, emissiveIntensity: 2 }));
magGlow.position.y = 0.05; magMesh.add(magGlow);
shellMesh.visible = magMesh.visible = false; scene.add(shellMesh, magMesh);

// ───────── 사격 ─────────
function castRay(o, d, maxD = 120) {
  let best = { t: maxD, kind: null };
  const r = new THREE.Ray(o, d), tmp = V();
  for (const b of boxes) {
    const hit = r.intersectBox(new THREE.Box3(b.min, b.max), tmp);
    if (hit) { const t = hit.distanceTo(o); if (t < best.t) best = { t, kind: 'box', box: b, p: hit.clone() }; }
  }
  if (d.y < 0) { const tf = -o.y / d.y; if (tf > 0 && tf < best.t) best = { t: tf, kind: 'floor', p: o.clone().addScaledVector(d, tf) }; }
  for (const dm of dummies) {
    if (dm.dead) continue;
    for (const s of dummySpheres(dm)) {
      const oc = o.clone().sub(s.c), bq = oc.dot(d), c = oc.lengthSq() - s.r * s.r, disc = bq * bq - c;
      if (disc < 0) continue;
      const t = -bq - Math.sqrt(disc);
      if (t > 0 && t < best.t) best = { t, kind: 'dummy', d: dm, crit: s.crit, p: o.clone().addScaledVector(d, t) };
    }
  }
  if (!best.p) best.p = o.clone().addScaledVector(d, best.t);
  return best;
}
function boxNormal(b, p) {
  const e = 0.02;
  if (Math.abs(p.x - b.min.x) < e) return V(-1, 0, 0); if (Math.abs(p.x - b.max.x) < e) return V(1, 0, 0);
  if (Math.abs(p.z - b.min.z) < e) return V(0, 0, -1); if (Math.abs(p.z - b.max.z) < e) return V(0, 0, 1);
  if (Math.abs(p.y - b.max.y) < e) return V(0, 1, 0); return V(0, -1, 0);
}
let aimPoint = V();
const recoilPos = new Spring3(260, 18), recoilRot = new Spring3(240, 16);
function fire() {
  const W = H.W;
  if (P.cool > 0 || switching) return;
  if (P.reload > 0) { if (W.reload === 'shell' && P.mag > 0) P.reload = 0; else return; }
  if (P.mag <= 0) { startReload(); sfx('click', 1200); P.cool = 0.25; return; }
  P.mag--; P.cool = W.rate; P.shots++;
  sfx(H.C.wpn);
  if (W.reload === 'shell') setTimeout(() => sfx('pump'), 330);
  // 반동: 총은 뒤로·위로, 몸은 살짝 젖혀짐
  recoilPos.v.z += 2.6 * W.kick; recoilRot.v.x += 9 * W.kick; recoilRot.v.y += (Math.random() - 0.5) * 3 * W.kick;
  A.bodyKick.v += 6 * W.kick;
  P.camKick += 0.035 * W.kick + 0.006;
  const mz = wpos(H.muzzle);
  flash.material.map = flashTex[H.C.wpn]; flash.scale.setScalar(H.C.wpn === 'rifle' ? 0.45 : 0.9);
  flash.position.copy(mz); flash.visible = true; flash.material.rotation = Math.random() * 6; flash.userData.t = H.C.wpn === 'rifle' ? 0.035 : 0.05;
  flashLight.position.copy(mz); flashLight.color.set(H.C.wpn === 'rifle' ? 0x9fd8ff : 0xffb060); flashLight.intensity = H.C.wpn === 'rifle' ? 12 : 30;
  const camDir = V(); camera.getWorldDirection(camDir);
  const right = V().crossVectors(camDir, camera.up).normalize(), up = V().crossVectors(right, camDir);
  const spread = W.spread + P.bloom + (Math.hypot(P.vel.x, P.vel.z) > 1 ? W.spread * 0.6 : 0) + (P.ground ? 0 : 0.02);
  if (W.auto) P.bloom = Math.min(0.03, P.bloom + 0.0035);
  let total = 0, anyCrit = false;
  const per = new Map();
  for (let i = 0; i < W.pellets; i++) {
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * spread;
    const dir = camDir.clone().addScaledVector(right, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r).normalize();
    const cam = castRay(camera.position, dir);
    const toP = cam.p.clone().sub(mz); const dist = toP.length(); toP.normalize();
    const h = castRay(mz, toP, dist + 0.05);
    tracer(mz.clone().addScaledVector(toP, 0.25), h.p, H.C.wpn);
    if (h.kind === 'dummy') {
      const [f0, f1] = W.falloff, fall = 1 - 0.6 * clamp((h.t - f0) / (f1 - f0), 0, 1);
      const dmg = Math.round(W.dmg * fall * (h.crit ? 2 : 1));
      per.set(h.d, (per.get(h.d) || 0) + dmg); total += dmg; anyCrit ||= h.crit;
      sparks(h.p, 2, toP.clone().negate(), H.C.wpn === 'rifle' ? 0x9fe0ff : null);
    } else if (h.kind === 'box') { const n = boxNormal(h.box, h.p); decal(h.p, n); sparks(h.p, 2, n); }
    else if (h.kind === 'floor') { decal(h.p, UP); sparks(h.p, 1, UP); }
  }
  for (const [d, dmg] of per) {
    d.hp -= dmg; d.flash = 0.1; d.knock = Math.min(0.4, d.knock + 0.04 + dmg / 300);
    dmgNumber(V(d.g.position.x, 2.2, d.g.position.z), dmg, anyCrit);
    if (d.hp <= 0 && !d.dead) { d.dead = 3; P.kills++; sfx('kill'); }
  }
  if (total > 0) { P.hits++; sfx('hit', anyCrit); $('hit').className = anyCrit ? 'crit' : ''; hitT = 0.12; }
  $('last').textContent = total; $('kills').textContent = P.kills;
  $('acc').textContent = Math.round((P.hits / P.shots) * 100) + '%';
}

// ───────── 애니메이션 상태 ─────────
const A = {
  lowerYaw: 0, turning: false, phase: 0, gait: 0, speedS: 0, dir: new THREE.Vector2(0, 1),
  air: new Spring(90, 14), land: new Spring(160, 13), bodyKick: new Spring(180, 16), crouchJ: new Spring(200, 16),
  leanF: new Spring(60, 11), leanS: new Spring(60, 11), sway: new Spring3(90, 12), turnPhase: 0,
  lastU: { R: 0, L: 0 }, prevVel: V(), headLag: new Spring(70, 12), shift: 0,
};

function footTarget(side, sgn, phaseOff) {
  const C = H.C, gait = A.gait;
  const u = ((A.phase + phaseOff) / (Math.PI * 2)) % 1;
  const stance = clamp(0.62 - 0.22 * gait, 0.38, 0.62);
  const SL = C.stride * (0.7 + 0.45 * gait);
  let along, lift = 0, toe = 0;
  const step = stance * SL * Math.min(1, gait * 1.4);
  if (u < stance) { const s = u / stance; along = (0.5 - s) * step; toe = s > 0.8 ? (s - 0.8) * 1.5 : 0; }
  else { const s = (u - stance) / (1 - stance); along = (-0.5 + smoother(s)) * step; lift = Math.sin(Math.PI * s) * C.lift * clamp(gait * 1.6, 0, 1); toe = -Math.sin(Math.PI * s) * 0.5 * gait; }
  // 제자리 회전 스텝
  let tl = 0;
  if (A.turning || A.turnPhase > 0) {
    const tu = ((A.turnPhase + phaseOff) / (Math.PI * 2)) % 1;
    if (tu > 0.5) tl = Math.sin(Math.PI * (tu - 0.5) * 2) * 0.07;
  }
  const d = A.dir, w = C.stanceW * (1 + 0.35 * Math.abs(d.x) * gait) + (A.shift * sgn);
  // 로컬: x=오른쪽, y=위, z=앞(-Z)
  return { x: sgn * w + d.x * along, y: lift + tl, z: -(d.y * along) + (sgn > 0 ? 0.02 : -0.02) * (H.C.heavy ? 1 : 0), toe, u };
}

function poseHero(dt) {
  const B = H.B, C = H.C, m = H.model, t = performance.now() / 1000;
  for (const n in B) B[n].quaternion.copy(H.rest[n]);
  // ── 하체 방향: 움직일 땐 조준 방향을 따라가고, 서 있을 땐 많이 돌아야 발을 옮김
  const hv = V(P.vel.x, 0, P.vel.z), sp = hv.length();
  const diff = wrapA(P.yaw - A.lowerYaw);
  if (sp > 0.4) { A.lowerYaw += diff * (1 - Math.exp(-10 * dt)); A.turning = false; }
  else if (Math.abs(diff) > 0.85) A.turning = true;
  if (A.turning) {
    A.lowerYaw += Math.sign(diff) * Math.min(Math.abs(diff), 5.5 * dt);
    A.turnPhase += dt * 14;
    if (Math.abs(diff) < 0.04) { A.turning = false; }
  } else if (A.turnPhase > 0) {
    const next = A.turnPhase + dt * 14; // 걸음을 끝까지 마무리
    A.turnPhase = (Math.floor(next / Math.PI) > Math.floor(A.turnPhase / Math.PI)) ? 0 : next;
  }
  const ly = A.lowerYaw;
  const fwdL = V(-Math.sin(ly), 0, -Math.cos(ly)), rtL = V(Math.cos(ly), 0, -Math.sin(ly));
  // ── 보행 값
  A.speedS = damp(A.speedS, sp, 10, dt);
  const gTarget = P.ground ? clamp(A.speedS / C.speed, 0, 1.15) : A.gait;
  A.gait = damp(A.gait, gTarget, 8, dt);
  if (sp > 0.3) { const lx = hv.dot(rtL) / sp, lz = hv.dot(fwdL) / sp; A.dir.lerp(new THREE.Vector2(lx, lz), 1 - Math.exp(-10 * dt)).normalize(); }
  const SL = C.stride * (0.7 + 0.45 * A.gait);
  if (P.ground) A.phase += dt * (A.speedS / SL) * Math.PI * 2;
  // 가속 기울기
  const acc = hv.clone().sub(A.prevVel).divideScalar(Math.max(dt, 1e-3)); A.prevVel.copy(hv);
  A.leanF.step(clamp(acc.dot(fwdL) * 0.012 + A.dir.y * A.gait * 0.07, -0.25, 0.25), dt);
  A.leanS.step(clamp(acc.dot(rtL) * 0.01 + A.dir.x * A.gait * 0.05, -0.2, 0.2), dt);
  // 공중
  const airT = A.air.step(P.ground ? 0 : 1, dt);
  const landC = A.land.step(0, dt);
  const kick = A.bodyKick.step(0, dt);
  // 서 있을 때 무게중심 옮기기
  A.shift = A.gait < 0.1 ? Math.sin(t * 0.55) * 0.02 : damp(A.shift, 0, 4, dt);
  // ── 몸 위치
  const bob = -Math.cos(A.phase * 2) * 0.035 * A.gait * (P.ground ? 1 : 0);
  const crouch = C.crouch * (0.5 + 0.6 * A.gait) + Math.max(0, landC) + A.crouchJ.step(0, dt);
  const sway = Math.sin(t * 1.7) * 0.004;
  m.position.set(P.pos.x + rtL.x * A.shift * 0.6, P.pos.y - crouch + bob + sway, P.pos.z + rtL.z * A.shift * 0.6);
  m.rotation.set(0, ly, 0);
  m.updateMatrixWorld(true);
  // ── 골반: 걸음에 맞춰 비틀고 기울임
  const pelvYaw = Math.sin(A.phase) * 0.13 * A.gait;
  const pelvRoll = Math.cos(A.phase) * 0.05 * A.gait - A.shift * 1.2;
  rotAxis(B.hips, UP, pelvYaw);
  rotAxis(B.hips, fwdL, pelvRoll + A.leanS.x * 0.5);
  rotAxis(B.hips, rtL, -A.leanF.x * 0.5 - airT * 0.08);
  // ── 다리: 발 위치를 정하고 IK
  const ankleH = H.meta.ankleH || 0;
  const air = { R: { x: H.C.stanceW, y: 0.38, z: -0.12 }, L: { x: -H.C.stanceW, y: 0.2, z: 0.12 } };
  const falling = P.vel.y < -1 ? 1 : 0;
  for (const [s, sgn, off] of [['R', 1, 0], ['L', -1, Math.PI]]) {
    const ft = footTarget(s, sgn, off);
    const a = air[s];
    const lx = lerp(ft.x, a.x, airT), lyy = lerp(ft.y, a.y * (1 - falling * 0.6), airT), lz = lerp(ft.z, a.z, airT);
    // 로컬 -> 월드 (몸 기준점은 실제 발 높이: 지면)
    const base = V(P.pos.x, P.pos.y, P.pos.z);
    const wp = base.clone().addScaledVector(rtL, lx).addScaledVector(fwdL, -lz);
    const gy = P.ground ? groundUnder(wp.x, wp.z, P.pos.y) : P.pos.y;
    wp.y = (P.ground ? gy : P.pos.y) + lyy + ankleH;
    // 발소리: 디딤 순간
    if (P.ground && A.gait > 0.25 && ft.u < A.lastU[s]) sfx('step', C.heavy);
    A.lastU[s] = ft.u;
    const pole = fwdL.clone().multiplyScalar(1).addScaledVector(rtL, sgn * 0.15).add(V(0, 0.1, 0));
    ik2('thigh_' + s, 'shin_' + s, wp, pole);
    const foot = B['foot_' + s];
    if (foot) { // 발은 몸 방향을 따라 평평하게, 걸음에 따라 발끝을 들고 내림
      const q = new THREE.Quaternion().setFromAxisAngle(UP, ly).multiply(H.footRest[s]);
      setWorldQuat(foot, q);
      rotAxis(foot, rtL, lerp(ft.toe, -0.35, airT));
    }
  }
  // ── 상체: 조준 방향으로 비틀기 + 사격 자세 + 위아래 조준
  const aimDiff = wrapA(P.yaw - ly);
  const spine = B.spine, chest = B.chest || null;
  const breathe = Math.sin(t * 2.1) * 0.015;
  const twist = -C.twist;
  rotAxis(spine, UP, -pelvYaw * 0.9 + (aimDiff + twist) * (chest ? 0.55 : 1));
  if (chest) rotAxis(chest, UP, (aimDiff + twist) * 0.45);
  const aimRight = V(Math.cos(P.yaw), 0, -Math.sin(P.yaw)), aimFwd = V(-Math.sin(P.yaw), 0, -Math.cos(P.yaw));
  const pitchPart = P.pitch * 0.55 + breathe + A.leanF.x * 0.6 - kick * 0.06;
  if (chest) { rotAxis(spine, aimRight, pitchPart * 0.5); rotAxis(chest, aimRight, pitchPart * 0.5 - kick * 0.04); }
  else rotAxis(spine, aimRight, pitchPart);
  rotAxis(chest || spine, aimFwd, -A.leanS.x * 0.6 - pelvRoll * 0.5);
  // 머리: 정면 유지 + 걸음 흔들림을 살짝 늦게 따라감
  const hl = A.headLag.step(bob * 3, dt);
  rotAxis(B.head, UP, -twist * 0.9);
  rotAxis(B.head, aimRight, P.pitch * 0.4 - hl * 0.6 + kick * 0.05);
  m.updateMatrixWorld(true);
  // ── 무기 위치
  const pivot = wpos(chest || spine).add(V(0, chest ? 0.08 : 0.25, 0));
  yawRate *= Math.exp(-14 * dt); pitchRate *= Math.exp(-14 * dt);
  const sw = A.sway.step(V(clamp(-yawRate * 0.6, -0.08, 0.08), clamp(-pitchRate * 0.5, -0.06, 0.06), 0), dt);
  const rp = recoilPos.step(V(), dt), rr = recoilRot.step(V(), dt);
  const aimQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(P.pitch, P.yaw, 0, 'YXZ'));
  const go = C.gunOff;
  const stepBob = V(Math.sin(A.phase) * 0.012 * A.gait, Math.abs(Math.cos(A.phase)) * 0.018 * A.gait - airT * 0.04 + landC * 0.4, 0);
  const off = V(go[0] + sw.x * 0.5, go[1] + sw.y * 0.5, go[2] + rp.z * 0.12).add(stepBob).applyQuaternion(aimQ);
  const gun = H.gun;
  gun.position.copy(pivot).add(off);
  gun.quaternion.setFromRotationMatrix(new THREE.Matrix4().lookAt(gun.position, aimPoint, UP));
  gun.rotateY(sw.x * 1.2 + rr.y * 0.05); gun.rotateX(sw.y * 1.0 + rr.x * 0.035); gun.rotateZ(-sw.x * 1.5 - A.leanS.x * 0.8);
  // 장전 자세
  const rl = reloadPose(dt);
  if (rl.roll) { gun.rotateZ(rl.roll); gun.rotateX(rl.pitch); gun.position.add(rl.shift); }
  gun.updateMatrixWorld(true);
  const gq = gun.quaternion, gUp = V(0, 1, 0).applyQuaternion(gq), gFwd = V(0, 0, -1).applyQuaternion(gq), gRt = V(1, 0, 0).applyQuaternion(gq);
  const S = C.gunScale;
  // ── 오른손: 손잡이
  const dR = gUp.clone().multiplyScalar(-0.85).addScaledVector(gFwd, 0.45).normalize();
  const wr = C.wristR;
  const wristR = gun.position.clone().addScaledVector(dR, wr[0] * S / 0.95).addScaledVector(gRt, wr[1]).addScaledVector(gUp, wr[2]);
  ik2('upperarm_R', 'forearm_R', wristR, aimRight.clone().addScaledVector(UP, -1.0).addScaledVector(aimFwd, -0.35));
  aimBone('hand_R', dR, gRt.clone().negate());
  // ── 왼손: 손잡이 앞쪽 (펌프·장전 동작 포함)
  let pump = 0;
  if (H.W.reload === 'shell' && P.cool > 0) { const k = 1 - P.cool / H.W.rate; if (k > 0.3 && k < 0.7) pump = Math.sin((k - 0.3) / 0.4 * Math.PI) * 0.13; }
  if (pump > 0) gun.position.addScaledVector(gFwd, pump * 0.15);
  const dL = gRt.clone().multiplyScalar(0.7).addScaledVector(gFwd, 0.55).addScaledVector(gUp, 0.25).normalize();
  const wl = C.wristL;
  let wristL = wpos(H.gripL).addScaledVector(gFwd, -pump).addScaledVector(dL, wl[0]).addScaledVector(gUp, wl[1]).addScaledVector(gRt, wl[2]);
  let palmL = gUp.clone(), dirL = dL;
  if (rl.hand) { wristL = wristL.lerp(rl.hand, rl.w); dirL = dL.clone().lerp(rl.dir, rl.w).normalize(); palmL = gUp.clone().lerp(rl.palm, rl.w).normalize(); }
  ik2('upperarm_L', 'forearm_L', wristL, aimRight.clone().multiplyScalar(-0.9).addScaledVector(UP, -1.1).addScaledVector(aimFwd, -0.2));
  aimBone('hand_L', dirL, palmL);
  // 소품을 왼손에
  const hp = wpos(B.hand_L).addScaledVector(boneDir('hand_L'), H.len.hand_L * 0.45);
  shellMesh.visible = !!rl.shell; magMesh.visible = !!rl.mag;
  if (rl.shell) { shellMesh.position.copy(hp); shellMesh.quaternion.copy(gq); }
  if (rl.mag) { magMesh.position.copy(hp).addScaledVector(gUp, 0.04); magMesh.quaternion.copy(gq); }
  // ── 어깨 보호대(래칫): 팔을 조금만 따라감
  for (const s of 'RL') {
    const pad = B['pad_' + s]; if (!pad) continue;
    const ua = B['upperarm_' + s];
    const restW = wquat(ua.parent).multiply(H.rest['upperarm_' + s]);
    rotWorld(pad, new THREE.Quaternion().slerp(wquat(ua).multiply(restW.invert()), C.padFollow));
  }
}

// 장전 동작: 왼손 목표와 총 기울기를 돌려줌
function reloadPose(dt) {
  const out = { roll: 0, pitch: 0, shift: V(), hand: null, w: 0 };
  if (P.reload <= 0) return out;
  const W = H.W, B = H.B;
  P.reloadT += dt;
  const ly = A.lowerYaw;
  const rtL = V(Math.cos(ly), 0, -Math.sin(ly)), fwdL = V(-Math.sin(ly), 0, -Math.cos(ly));
  const belt = wpos(B.hips).addScaledVector(rtL, -0.24 * (H.C.heavy ? 1.2 : 1)).addScaledVector(fwdL, 0.1).add(V(0, -0.02, 0));
  const g = H.gun, gq = g.quaternion, gUp = V(0, 1, 0).applyQuaternion(gq), gFwd = V(0, 0, -1).applyQuaternion(gq), gRt = V(1, 0, 0).applyQuaternion(gq);
  const ein = Math.min(1, P.reloadT / 0.18); // 장전 자세로 들어가기
  if (W.reload === 'shell') {
    out.roll = 0.55 * smooth(ein); out.pitch = -0.12 * smooth(ein);
    const port = g.position.clone().addScaledVector(gFwd, 0.1 * H.C.gunScale).addScaledVector(gUp, -0.09);
    const per = 0.42, k = ((P.reloadT - 0.12) % per) / per;
    if (P.reloadT < 0.12) { out.hand = port; out.w = smooth(P.reloadT / 0.12); out.dir = gFwd; out.palm = gUp; return out; }
    let h, d;
    if (k < 0.32) { h = port.clone().lerp(belt, smooth(k / 0.32)); d = UP.clone().negate(); }
    else if (k < 0.45) { h = belt.clone(); d = UP.clone().negate(); out.shell = k > 0.38; }
    else if (k < 0.85) { h = belt.clone().lerp(port, smoother((k - 0.45) / 0.4)); d = gFwd.clone().addScaledVector(gUp, 0.4); out.shell = true; }
    else { h = port.clone().addScaledVector(gFwd, 0.06 * Math.sin((k - 0.85) / 0.15 * Math.PI)); d = gFwd.clone(); out.shell = k < 0.92; }
    out.hand = h; out.w = 1; out.dir = d.normalize(); out.palm = gUp.clone();
    const n = Math.floor((P.reloadT - 0.12) / per);
    if (n > P.shell) { P.shell = n; P.mag++; sfx('click', 3200 - P.mag * 120); if (P.mag >= W.mag) { P.reload = 0; } }
  } else {
    const T = 1.7, k = P.reloadT / T;
    out.roll = -0.45 * smooth(Math.min(1, k * 5)) * (1 - smooth(clamp((k - 0.9) * 10, 0, 1)));
    out.pitch = -0.1 * smooth(Math.min(1, k * 5));
    const well = g.position.clone().addScaledVector(gFwd, 0.08).addScaledVector(gUp, -0.13);
    const ks = [[0, 'grip'], [0.14, well], [0.38, belt], [0.55, belt], [0.78, well], [0.84, well.clone().addScaledVector(gUp, 0.05)], [0.9, well], [1.0, 'grip']];
    let i = 0; while (i < ks.length - 2 && k > ks[i + 1][0]) i++;
    const [k0, p0] = ks[i], [k1, p1] = ks[i + 1];
    const s = smoother(clamp((k - k0) / (k1 - k0), 0, 1));
    const gp = wpos(H.gripL).addScaledVector(gUp, -0.07);
    const a = p0 === 'grip' ? gp : p0, b = p1 === 'grip' ? gp : p1;
    out.hand = a.clone().lerp(b, s); out.w = 1;
    out.dir = gFwd.clone().addScaledVector(UP, -0.5).normalize(); out.palm = gRt.clone().negate();
    out.mag = k > 0.14 && k < 0.84;
    if (k > 0.14 && !P.rs1) { P.rs1 = 1; sfx('click', 1800); }
    if (k > 0.84 && !P.rs2) { P.rs2 = 1; sfx('click', 2600); }
    if (k >= 1) { P.reload = 0; P.mag = W.mag; P.rs1 = P.rs2 = 0; sfx('click', 3400); }
  }
  return out;
}

// ───────── 루프 ─────────
P.camKick = 0;
const clock = new THREE.Clock();
function update(dt) {
  const C = H.C;
  const fwd = V(-Math.sin(P.yaw), 0, -Math.cos(P.yaw)), right = V(Math.cos(P.yaw), 0, -Math.sin(P.yaw));
  const wish = V();
  if (locked) { if (keys.KeyW) wish.add(fwd); if (keys.KeyS) wish.sub(fwd); if (keys.KeyD) wish.add(right); if (keys.KeyA) wish.sub(right); }
  if (window.__sim) wish.add(fwd.clone().multiplyScalar(window.__sim.z)).add(right.clone().multiplyScalar(window.__sim.x));
  const back = wish.dot(fwd) < -0.1;
  const spd = (keys.ShiftLeft ? 0.5 : 1) * C.speed * (back ? 0.85 : 1) * (P.reload > 0 ? 0.9 : 1);
  if (wish.lengthSq() > 0) wish.normalize().multiplyScalar(spd);
  const accel = P.ground ? 12 : 2.5;
  P.vel.x += (wish.x - P.vel.x) * Math.min(1, accel * dt);
  P.vel.z += (wish.z - P.vel.z) * Math.min(1, accel * dt);
  if (P.ground && (keys.Space && locked || window.__jump)) { P.vel.y = 7.2; P.ground = false; A.crouchJ.v -= 1.2; window.__jump = 0; }
  P.vel.y -= 19 * dt;
  const wasAir = !P.ground, vy = P.vel.y;
  P.pos.addScaledVector(P.vel, dt);
  collide(P.pos, P.vel);
  if (wasAir && P.ground) { sfx('land', C.heavy); A.land.v += Math.min(2.2, -vy * 0.22); }
  P.cool = Math.max(0, P.cool - dt);
  P.bloom = Math.max(0, P.bloom - dt * (P.cool > 0 ? 0.01 : 0.08));
  if (mouseDown && (H.W.auto || P.cool <= 0)) fire();
  if (!H.W.auto && !mouseDown) {} // 반자동
  $('mag').textContent = P.mag;
  $('reload').textContent = P.reload > 0 ? '장전 중' : (P.mag === 0 ? 'R 장전' : '');
  // 카메라
  P.camKick = damp(P.camKick, 0, 9, dt);
  const camQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(P.pitch + P.camKick, P.yaw, 0, 'YXZ'));
  const head = P.pos.clone().add(V(0, 1.72, 0));
  showT = damp(showT, showcase ? 1 : 0, 4, dt);
  const cam = V(...C.cam).applyQuaternion(camQ);
  const camPos = head.clone().add(cam);
  if (showT > 0.001) { // 캐릭터를 관통하지 않게 둘레를 돌아서 정면으로
    const st = smooth(clamp(showT, 0, 1)), dist = window.__dist || 3.3;
    const a = P.yaw + Math.PI * (1 - st) + (Math.sin(performance.now() / 2500) * 0.6 + (window.__ang || 0)) * st;
    const r = lerp(cam.length(), dist, st);
    const orbit = P.pos.clone().add(V(-Math.sin(a) * r, lerp(1.72 + C.cam[1], 1.3, st), -Math.cos(a) * r));
    camPos.lerp(orbit, Math.min(1, st * 4));
  }
  camera.position.copy(camPos); camera.quaternion.copy(camQ);
  if (showT > 0.001) camera.quaternion.slerp(new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(camPos, P.pos.clone().add(V(0, 1.05, 0)), UP)), showT);
  camera.updateMatrixWorld();
  const cd = V(0, 0, -1).applyQuaternion(camQ);
  aimPoint = castRay(head.clone().add(cam), cd).p;
  if (aimPoint.distanceTo(P.pos) < 2.5) aimPoint = head.clone().addScaledVector(cd, 30);
  // 과녁
  for (const d of dummies) {
    d.t += dt;
    if (d.dead > 0) { d.dead -= dt; d.fall = Math.min(1, d.fall + dt * 4); if (d.dead <= 0) { d.dead = 0; d.hp = d.max; d.fall = 0; } }
    if (d.move && !d.dead) d.g.position.x = d.x + Math.sin(d.t * 0.9) * d.move;
    d.knock = Math.max(0, d.knock - dt * 1.5);
    d.top.rotation.x = -d.fall * 1.45 - d.knock;
    d.flash = Math.max(0, d.flash - dt);
    d.mat.emissive.setRGB(d.flash > 0 ? 1 : 0, d.flash > 0 ? 0.25 : 0, d.flash > 0 ? 0.2 : 0);
    d.mat.color.setHex(d.dead ? 0x6b7080 : 0xd8dde6);
  }
  // 효과
  flash.visible = (flash.userData.t -= dt) > 0;
  flashLight.intensity *= Math.pow(0.0005, dt);
  for (let i = fx.length - 1; i >= 0; i--) {
    const f = fx[i]; f.t += dt;
    if (f.kind === 'tracer' || f.kind === 'beam') { f.o.material.opacity = 0.85 * (1 - f.t / f.life); if (f.kind === 'beam') f.o.scale.x = f.o.scale.y = 0.025 * (1 - f.t / f.life); }
    if (f.kind === 'spark') { f.v.y -= 14 * dt; f.o.position.addScaledVector(f.v, dt); f.o.scale.setScalar(1 - f.t / f.life); }
    if (f.kind === 'num') {
      const p = f.p.clone().add(V(f.dx * f.t, f.t * 0.9, 0)).project(camera);
      f.el.style.left = ((p.x + 1) / 2 * innerWidth) + 'px'; f.el.style.top = ((1 - p.y) / 2 * innerHeight) + 'px';
      f.el.style.opacity = 1 - Math.max(0, f.t - 0.5) / 0.3; f.el.style.display = p.z < 1 ? 'block' : 'none';
    }
    if (f.t >= f.life) { if (f.o) { scene.remove(f.o); if (f.kind === 'tracer') f.o.geometry.dispose(); } if (f.el) f.el.remove(); fx.splice(i, 1); }
  }
  hitT -= dt; $('hit').style.opacity = hitT > 0 ? 1 : 0;
  const spreadPx = (H.W.spread + P.bloom) * innerHeight * 0.75 + 10;
  $('ring').style.width = $('ring').style.height = spreadPx * 2 + 'px';
  $('ring').style.left = $('ring').style.top = -spreadPx + 'px';
  sun.position.set(P.pos.x + 12, 22, P.pos.z + 8); sun.target.position.copy(P.pos);
  $('cross').style.opacity = showT > 0.5 ? 0 : 1;
}

function frame() {
  const dt = Math.min(0.05, clock.getDelta());
  if (H && !switching) { update(dt); poseHero(dt); }
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

const first = new URLSearchParams(location.search).get('hero') || 'ratchet';
setHero(HEROES[first] ? first : 'ratchet').then(() => {
  $('go').textContent = '시작'; $('load').textContent = '1 · 2 키로 영웅 바꾸기';
  getHero(first === 'orbit' ? 'ratchet' : 'orbit').catch(() => {}); // 다른 영웅 미리 받기
}).catch((e) => { $('go').textContent = '불러오기 실패'; $('load').textContent = String(e); console.error(e); });
frame();

window.__rt = { P, A, get H() { return H; }, dummies, pickHero, fire: () => { P.cool = 0; fire(); }, set showcase(v) { showcase = v; }, setSim: (v) => { window.__sim = v; }, reload: startReload };
