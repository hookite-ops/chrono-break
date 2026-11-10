// 영웅 시험장 — Tripo 모델 + 따로 만든 무기, 절차적 애니메이션(발 IK 보행·회전 스텝·점프·반동·장전·무기 흔들림)
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as skClone } from 'three/addons/utils/SkeletonUtils.js';

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
  tick: {
    name: '틱', sub: '침투형 딜러 · 에너지 쌍권총', glb: 'assets/play/tick.glb', meta: 'assets/play/tick.json',
    gun: 'assets/play/pistol.glb', gunScale: 1.0, speed: 6.2, wpn: 'pistols', hold: 'dual',
    gunOff: [0.2, -0.16, -0.42], twist: 0, palmR: [0, -1, 0], palmL: [0, -1, 0],
    stanceW: 0.12, stride: 1.55, lift: 0.19, crouch: 0.07, cam: [0.95, 0.3, 3.2], heavy: 0,
    wristR: [-0.075, 0.0, -0.01], wristL: [-0.075, 0.0, -0.01],
  },
  nok: {
    name: '녹', sub: '방벽형 탱커 · 전쟁 망치', glb: 'assets/play/nok.glb', meta: 'assets/play/nok.json',
    gun: 'assets/play/hammer.glb', gunScale: 1.0, speed: 5.0, wpn: 'hammer', hold: 'melee',
    gunOff: [0, 0, 0], twist: 0, palmR: [0, -1, 0], palmL: [0, -1, 0],
    stanceW: 0.17, stride: 1.2, lift: 0.15, crouch: 0.08, cam: [1.1, 0.4, 3.7], heavy: 1,
    wristR: [-0.09, 0, 0], wristL: [-0.09, 0, 0],
  },
  phase: {
    name: '페이즈', sub: '제압형 딜러 · 유탄발사기', glb: 'assets/play/phase.glb', meta: 'assets/play/phase.json',
    gun: 'assets/play/launcher.glb', gunScale: 1.0, speed: 5.6, wpn: 'launcher',
    gunOff: [0.17, -0.14, -0.2], twist: 0.5, palmR: [0, -1, 0], palmL: [0, -1, 0],
    stanceW: 0.16, stride: 1.4, lift: 0.17, crouch: 0.07, cam: [1.0, 0.3, 3.3], heavy: 0,
    wristR: [-0.085, 0.02, -0.02], wristL: [-0.08, -0.02, -0.05],
  },
  lumen: {
    name: '루멘', sub: '치유형 지원 · 빛의 지팡이', glb: 'assets/play/lumen.glb', meta: 'assets/play/lumen.json',
    gun: 'assets/play/staff.glb', gunScale: 1.0, speed: 5.6, wpn: 'staff',
    gunOff: [0.2, -0.22, -0.05], twist: 0.35, palmR: [0, -1, 0], palmL: [0, -1, 0],
    stanceW: 0.1, stride: 1.4, lift: 0.16, crouch: 0.06, cam: [1.0, 0.3, 3.4], heavy: 0,
    wristR: [-0.08, 0.0, -0.02], wristL: [-0.08, 0.0, -0.03],
  },
  mora: {
    name: '모라', sub: '전술형 지원 · 의료 다트총', glb: 'assets/play/mora.glb', meta: 'assets/play/mora.json',
    gun: 'assets/play/dart.glb', gunScale: 1.0, speed: 5.6, wpn: 'medpistol',
    gunOff: [0.16, -0.12, -0.2], twist: 0.5, palmR: [0, -1, 0], palmL: [0, -1, 0],
    stanceW: 0.13, stride: 1.45, lift: 0.17, crouch: 0.07, cam: [1.0, 0.3, 3.3], heavy: 0,
    wristR: [-0.085, 0.02, -0.02], wristL: [-0.08, -0.02, -0.05],
  },
  iko: {
    name: '이코', sub: '치유형 지원 · 나노 소총', glb: 'assets/play/iko.glb', meta: 'assets/play/iko.json',
    gun: 'assets/play/nanorifle.glb', gunScale: 1.0, speed: 5.8, wpn: 'nanorifle',
    gunOff: [0.15, -0.1, -0.16], twist: 0.5, palmR: [0, -1, 0], palmL: [0, -1, 0],
    stanceW: 0.12, stride: 1.3, lift: 0.17, crouch: 0.06, cam: [0.95, 0.25, 3.0], heavy: 0,
    wristR: [-0.075, 0.02, -0.02], wristL: [-0.07, -0.02, -0.04],
  },
};
const WPN = {
  shotgun: { mag: 6, rate: 0.85, pellets: 10, spread: 0.075, dmg: 9, falloff: [8, 28], reload: 'shell', kick: 1, auto: false },
  rifle: { mag: 32, rate: 0.09, pellets: 1, spread: 0.006, dmg: 9, falloff: [22, 45], reload: 'mag', kick: 0.28, auto: true },
  pistols: { mag: 40, rate: 0.085, pellets: 1, spread: 0.012, dmg: 7, falloff: [18, 40], reload: 'dual', kick: 0.2, auto: true },
  hammer: { mag: 0, rate: 0.9, melee: true, dmg: 75, range: 4.8, kick: 0, auto: true },
  launcher: { mag: 6, rate: 0.65, proj: 'grenade', speed: 21, g: 11, reload: 'mag', kick: 0.8, auto: false, spread: 0 },
  staff: { mag: 30, rate: 0.36, proj: 'bolt', speed: 48, g: 0, reload: 'mag', kick: 0.25, auto: true, spread: 0.004, beam: true },
  medpistol: { mag: 12, rate: 0.32, pellets: 1, spread: 0.004, dmg: 25, falloff: [25, 45], reload: 'mag', kick: 0.4, auto: false, dart: true },
  nanorifle: { mag: 36, rate: 0.11, pellets: 1, spread: 0.008, dmg: 8, falloff: [20, 40], reload: 'mag', kick: 0.22, auto: true },
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
  dummies.push({ g, top, mat, hp: 360, max: 360, x, z, move, t: Math.random() * 6, dead: 0, flash: 0, fall: 0, knock: 0, kv: new THREE.Vector3(), ko: new THREE.Vector3() });
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
  launch() { const t = AC.currentTime; tone(t, 160, 60, 0.25, 0.9); burst(t, 0.2, 900, 0.8, 0.7); burst(t, 0.05, 4000, 1, 0.3, 'highpass'); },
  zap() { const t = AC.currentTime; tone(t, 1800, 600, 0.15, 0.22, 'triangle'); tone(t, 900, 1400, 0.1, 0.1); },
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
  if (H) { scene.remove(H.model); scene.remove(H.gun); if (H.gun2) scene.remove(H.gun2); H.model.traverse((o) => { if (o.isMesh && o.material.emissive) o.material.emissiveIntensity = 0; }); }
  SK.act = null; SK.cd.ab1 = SK.cd.ab2 = 0; SK.lastGlow = -1; SK.shieldT = 0;
  if (SK.barrier) { scene.remove(SK.barrier.m); SK.barrier = null; }
  if (SK.dome) { scene.remove(SK.dome.m); SK.dome = null; }
  if (SK.plate) SK.plate.visible = false; if (SK.shell) SK.shell.visible = false;
  if (SK.holo) { scene.remove(SK.holo.g); for (const c of SK.holo.g.userData.guns || []) scene.remove(c); SK.holo = null; }
  while (drones.length) scene.remove(drones.pop().g);
  SK.charges = 2; SK.chT = 0; SK.buff = 0; SK.bubbleT = 0; P.spdT = 0; P.spdMul = 1; P.dmgT = 0; P.dmgMul = 1;
  for (const z of zones.splice(0)) scene.remove(z.g);
  for (const p of projs.splice(0)) scene.remove(p.m);
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
  if (C.hold === 'dual') { if (!data.gun2) { data.gun2 = gun.clone(); } H.gun2 = data.gun2; H.gun2.scale.setScalar(C.gunScale); H.muzzle2 = H.gun2.getObjectByName('Muzzle'); scene.add(H.gun2); }
  // 상태
  Object.assign(P, { mag: H.W.mag, cool: 0, reload: 0, reloadT: 0, bloom: 0, swing: -1 });
  $('mag').parentElement.style.visibility = H.W.melee ? 'hidden' : 'visible';
  A.lowerYaw = P.yaw;
  const AB = ABIL[id];
  $('ab1').querySelector('.nm').textContent = AB.ab1.name; $('ab2').querySelector('.nm').textContent = AB.ab2.name; $('ult').querySelector('.nm').textContent = AB.ult.name;
  $('keys').innerHTML = `<div><kbd>W A S D</kbd>이동 &nbsp;<kbd>Space</kbd>점프</div><div><kbd>좌클릭</kbd>${{ rifle: '에너지 소총', shotgun: '산탄총', pistols: '쌍권총', hammer: '망치 휘두르기', launcher: '유탄발사기', staff: '에너지 볼트', medpistol: '공격 다트', nanorifle: '나노탄' }[C.wpn]} ${H.W.melee ? '' : '&nbsp;<kbd>R</kbd>장전'}</div>${H.W.beam ? '<div><kbd>우클릭</kbd>치유 빛줄기</div>' : ''}${H.W.dart ? '<div><kbd>우클릭</kbd>치유 다트</div>' : ''}`
    + `<div><kbd>Shift</kbd>${AB.ab1.name} &nbsp;<kbd>E</kbd>${AB.ab2.name}</div><div><kbd>Q</kbd>${AB.ult.name} (궁극기)</div><div><kbd>T</kbd>정면에서 보기 &nbsp;<kbd>1</kbd>~<kbd>8</kbd>영웅 바꾸기</div>`;
  $('hname').textContent = C.name; $('hsub').textContent = C.sub; $('magmax').textContent = ' / ' + H.W.mag;
  document.querySelectorAll('.pick').forEach((el) => el.classList.toggle('on', el.dataset.id === id));
}

// ───────── 플레이어 ─────────
const P = { dmgMul: 1, dmgT: 0, spdMul: 1, spdT: 0, cool2: 0, swing: -1, pos: V(0, 0, 4), vel: V(), yaw: 0, pitch: 0, ground: true, mag: 6, cool: 0, reload: 0, reloadT: 0, shots: 0, hits: 0, kills: 0, bloom: 0 };
const keys = {};
let locked = false, showcase = 0, showT = 0, mouseDown = false, switching = false;
addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'KeyR') startReload();
  if ((e.code === 'ShiftLeft' || e.code === 'ShiftRight') && !e.repeat) useSkill('ab1');
  if (e.code === 'KeyE' && !e.repeat) useSkill('ab2');
  if (e.code === 'KeyQ' && !e.repeat) useSkill('ult');
  if (e.code === 'KeyT') showcase = showcase ? 0 : 1;
  if (e.code === 'Digit1') pickHero('ratchet');
  if (e.code === 'Digit2') pickHero('orbit');
  if (e.code === 'Digit3') pickHero('tick');
  if (e.code === 'Digit4') pickHero('nok');
  if (e.code === 'Digit5') pickHero('phase');
  if (e.code === 'Digit6') pickHero('lumen');
  if (e.code === 'Digit7') pickHero('mora');
  if (e.code === 'Digit8') pickHero('iko');
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
addEventListener('mousedown', (e) => { if (locked && e.button === 0) mouseDown = true; if (locked && e.button === 2) rmb = true; });
addEventListener('contextmenu', (e) => e.preventDefault());
let rmb = false;
addEventListener('mouseup', (e) => { if (e.button === 0) mouseDown = false; if (e.button === 2) rmb = false; });
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
function startReload() { if (!H || H.W.melee || P.reload > 0 || P.mag >= H.W.mag) return; P.reload = 1; P.reloadT = 0; P.shell = 0; }

// ───────── 효과 ─────────
const fx = [];
const radTex = (stops) => {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); stops.forEach(([o, col]) => r.addColorStop(o, col));
  g.fillStyle = r; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
};
const flashTex = { pistols: radTex([[0, 'rgba(255,255,255,1)'], [0.3, 'rgba(255,170,70,.95)'], [1, 'rgba(255,110,20,0)']]), shotgun: radTex([[0, 'rgba(255,255,230,1)'], [0.3, 'rgba(255,190,90,.9)'], [1, 'rgba(255,120,30,0)']]),
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
  const BC = { rifle: [0xffb35c, 0x7fdcff], pistols: [0xff8a2a, 0xffe0b0], nanorifle: [0x9affc8, 0xeafff4], medpistol: [0x4fe0c0, 0xd8fff4], heal: [0x8aff9a, 0xffffff], gold: [0xffd27a, 0xfff4d0] };
  if (BC[kind]) {
    const m = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: BC[kind][0], transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.position.copy(a); m.lookAt(b); m.scale.set(0.025, 0.025, a.distanceTo(b)); scene.add(m);
    const core = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: BC[kind][1], transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
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
  if (P.cool > 0 || switching || (SK.act && SK.act.noFire)) return;
  if (P.reload > 0) { if (W.reload === 'shell' && P.mag > 0) P.reload = 0; else return; }
  if (W.melee) { if (P.swing < 0 && !(SK.barrier && SK.barrier.on)) { P.swing = 0; P.swingHit = false; P.cool = W.rate; P.shots++; ssfx('whoosh'); } return; }
  if (P.mag <= 0) { startReload(); sfx('click', 1200); P.cool = 0.25; return; }
  P.mag--; P.cool = W.rate; P.shots++;
  sfx({ pistols: 'rifle', medpistol: 'rifle', nanorifle: 'rifle', launcher: 'launch', staff: 'zap' }[H.C.wpn] || H.C.wpn);
  if (W.reload === 'shell') setTimeout(() => sfx('pump'), 330);
  // 반동: 총은 뒤로·위로, 몸은 살짝 젖혀짐
  recoilPos.v.z += 2.6 * W.kick; recoilRot.v.x += 9 * W.kick; recoilRot.v.y += (Math.random() - 0.5) * 3 * W.kick;
  A.bodyKick.v += 6 * W.kick;
  P.camKick += 0.035 * W.kick + 0.006;
  let mz = wpos(H.muzzle);
  if (H.C.hold === 'dual') { P.alt = 1 - (P.alt || 0); mz = wpos(P.alt ? H.muzzle2 : H.muzzle); dualKick[P.alt].v.z += 2.5; dualKick[P.alt].v.x += 6; }
  flash.material.map = flashTex[H.C.wpn] || flashTex.rifle; flash.scale.setScalar(H.C.wpn === 'shotgun' ? 0.9 : 0.4);
  flash.position.copy(mz); flash.visible = true; flash.material.rotation = Math.random() * 6; flash.userData.t = H.C.wpn !== 'shotgun' ? 0.035 : 0.05;
  flashLight.position.copy(mz); flashLight.color.set(H.C.wpn === 'rifle' ? 0x9fd8ff : 0xffb060); flashLight.intensity = H.C.wpn === 'shotgun' ? 30 : 12;
  if (W.proj) { // 투사체 무기
    const dir = aimPoint.clone().sub(mz).normalize();
    if (W.g) { const dist = aimPoint.distanceTo(mz); dir.y += Math.min(0.5, W.g * dist / (2 * W.speed * W.speed)); dir.normalize(); }
    spawnProj(W.proj, mz, dir.multiplyScalar(W.speed), { g: W.g });
    return;
  }
  const camDir = V(); camera.getWorldDirection(camDir);
  const right = V().crossVectors(camDir, camera.up).normalize(), up = V().crossVectors(right, camDir);
  const spread = W.spread + P.bloom + (Math.hypot(P.vel.x, P.vel.z) > 1 ? W.spread * 0.6 : 0) + (P.ground ? 0 : 0.02);
  if (W.auto) P.bloom = Math.min(0.03, P.bloom + (H.C.hold === 'dual' ? 0.0025 : 0.0035));
  let total = 0, anyCrit = false;
  const per = new Map(), toPDir = V();
  for (let i = 0; i < W.pellets; i++) {
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * spread;
    const dir = camDir.clone().addScaledVector(right, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r).normalize();
    const cam = castRay(camera.position, dir);
    const toP = cam.p.clone().sub(mz); const dist = toP.length(); toP.normalize();
    const h = castRay(mz, toP, dist + 0.05); toPDir.copy(toP).setY(0).normalize();
    tracer(mz.clone().addScaledVector(toP, 0.25), h.p, H.C.wpn);
    if (h.kind === 'dummy') {
      const [f0, f1] = W.falloff, fall = 1 - 0.6 * clamp((h.t - f0) / (f1 - f0), 0, 1);
      const dmg = Math.round(W.dmg * fall * (h.crit ? 2 : 1) * P.dmgMul);
      per.set(h.d, (per.get(h.d) || 0) + dmg); total += dmg; anyCrit ||= h.crit;
      sparks(h.p, 2, toP.clone().negate(), { rifle: 0x9fe0ff, pistols: 0xffa050, nanorifle: 0xb0ffd8, medpistol: 0x80ffe0 }[H.C.wpn] || null);
    } else if (h.kind === 'box') { const n = boxNormal(h.box, h.p); decal(h.p, n); sparks(h.p, 2, n); }
    else if (h.kind === 'floor') { decal(h.p, UP); sparks(h.p, 1, UP); }
  }
  for (const [d, dmg] of per) hurtDummy(d, dmg, anyCrit, toPDir.clone().multiplyScalar(dmg / 40));
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
  const ap = actionPose();
  const mf = C.hold === 'melee' ? meleeFrame() : null;
  if (mf) { ap.lean += mf.ln; ap.crouch += mf.cr; ap.twist -= mf.tw; }
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
  const LF = A.leanF.x + ap.lean;
  const airT = A.air.step(P.ground ? 0 : 1, dt);
  const landC = A.land.step(0, dt);
  const kick = A.bodyKick.step(0, dt);
  // 서 있을 때 무게중심 옮기기
  A.shift = A.gait < 0.1 ? Math.sin(t * 0.55) * 0.02 : damp(A.shift, 0, 4, dt);
  // ── 몸 위치
  const bob = -Math.cos(A.phase * 2) * 0.035 * A.gait * (P.ground ? 1 : 0);
  const crouch = C.crouch * (0.5 + 0.6 * A.gait) + Math.max(0, landC) + A.crouchJ.step(0, dt) + ap.crouch;
  const sway = Math.sin(t * 1.7) * 0.004;
  m.position.set(P.pos.x + rtL.x * A.shift * 0.6, P.pos.y - crouch + bob + sway, P.pos.z + rtL.z * A.shift * 0.6);
  m.rotation.set(0, ly, 0);
  m.updateMatrixWorld(true);
  // ── 골반: 걸음에 맞춰 비틀고 기울임
  const pelvYaw = Math.sin(A.phase) * 0.13 * A.gait;
  const pelvRoll = Math.cos(A.phase) * 0.05 * A.gait - A.shift * 1.2;
  rotAxis(B.hips, UP, pelvYaw);
  rotAxis(B.hips, fwdL, pelvRoll + A.leanS.x * 0.5);
  rotAxis(B.hips, rtL, -LF * 0.5 - airT * 0.08);
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
  const twist = -C.twist - ap.twist;
  rotAxis(spine, UP, -pelvYaw * 0.9 + (aimDiff + twist) * (chest ? 0.55 : 1));
  if (chest) rotAxis(chest, UP, (aimDiff + twist) * 0.45);
  const aimRight = V(Math.cos(P.yaw), 0, -Math.sin(P.yaw)), aimFwd = V(-Math.sin(P.yaw), 0, -Math.cos(P.yaw));
  const pitchPart = P.pitch * 0.55 + breathe + LF * 0.6 - kick * 0.06;
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
  if (C.hold === 'dual' || C.hold === 'melee') {
    shellMesh.visible = magMesh.visible = false;
    if (C.hold === 'dual') poseDual(dt, { pivot, aimQ, aimRight, aimFwd, sw, stepBob, ap });
    else poseMelee(dt, { pivot, aimRight, aimFwd, sw, stepBob }, mf);
  } else {
  const off = V(go[0] + sw.x * 0.5, go[1] + sw.y * 0.5, go[2] + rp.z * 0.12).add(stepBob).applyQuaternion(aimQ);
  const gun = H.gun;
  gun.position.copy(pivot).add(off);
  gun.quaternion.setFromRotationMatrix(new THREE.Matrix4().lookAt(gun.position, aimPoint, UP));
  gun.rotateY(sw.x * 1.2 + rr.y * 0.05); gun.rotateX(sw.y * 1.0 + rr.x * 0.035); gun.rotateZ(-sw.x * 1.5 - A.leanS.x * 0.8);
  // 장전 자세
  const rl = reloadPose(dt);
  if (rl.roll) { gun.rotateZ(rl.roll); gun.rotateX(rl.pitch); gun.position.add(rl.shift); }
  if (ap.gunDown) { gun.position.addScaledVector(UP, -0.2 * ap.gunDown).addScaledVector(aimFwd, 0.1 * ap.gunDown); gun.rotateX(-0.7 * ap.gunDown); gun.rotateZ(0.3 * ap.gunDown); }
  if (ap.gunW > 0) { // 내려찍기: 머리 위로 들었다가 내리침
    const r = ap.raise || 0;
    const posO = pivot.clone().addScaledVector(UP, lerp(-0.3, 0.5, r)).addScaledVector(aimFwd, lerp(0.6, 0.1, r)).addScaledVector(aimRight, 0.05);
    gun.position.lerp(posO, ap.gunW);
    gun.quaternion.slerp(new THREE.Quaternion().setFromEuler(new THREE.Euler(ap.gunPitch, P.yaw, 0, 'YXZ')), ap.gunW);
  }
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
  if (ap.handW > 0) { // 왼손 스킬 동작 (펄스: 앞으로 밀기 / 돔: 들었다가 땅을 내리침)
    const sL = wpos(B.upperarm_L), reach = H.len.upperarm_L + H.len.forearm_L;
    let tg, dr, pm;
    if (ap.handMode === 'thrust') {
      const k = ap.handK;
      tg = sL.clone().addScaledVector(aimFwd, reach * lerp(0.45, 0.95, k)).addScaledVector(UP, lerp(-0.1, 0.05, k)).addScaledVector(aimRight, 0.08);
      dr = aimFwd.clone().multiplyScalar(0.35).addScaledVector(UP, 0.9).normalize(); pm = aimFwd.clone();
    } else if (ap.handMode === 'throw') { // 뒤로 젖혔다가 앞으로 던짐
      const k = ap.handK;
      const back = sL.clone().addScaledVector(UP, reach * 0.55).addScaledVector(aimFwd, -reach * 0.35).addScaledVector(aimRight, -0.1);
      const fwdP = sL.clone().addScaledVector(aimFwd, reach * 0.95).addScaledVector(UP, reach * 0.15);
      tg = back.lerp(fwdP, k); dr = UP.clone().lerp(aimFwd, k).normalize(); pm = aimFwd.clone().lerp(UP.clone().negate(), k).normalize();
    } else if (ap.handMode === 'call') { // 하늘로 손을 듦
      tg = sL.clone().addScaledVector(UP, reach * 0.95).addScaledVector(aimFwd, 0.1).addScaledVector(aimRight, -0.05);
      dr = UP.clone(); pm = aimFwd.clone();
    } else {
      const k = ap.handK;
      const upP = sL.clone().addScaledVector(UP, reach * 0.9).addScaledVector(aimFwd, 0.12);
      const dnP = sL.clone().addScaledVector(aimFwd, reach * 0.55).addScaledVector(UP, -reach * 0.8);
      tg = upP.lerp(dnP, k); dr = UP.clone().lerp(UP.clone().negate().addScaledVector(aimFwd, 0.3), k).normalize(); pm = aimFwd.clone().lerp(UP.clone().negate(), k).normalize();
    }
    wristL.lerp(tg, ap.handW); dirL = dirL.clone().lerp(dr, ap.handW).normalize(); palmL = palmL.clone().lerp(pm, ap.handW).normalize();
  }
  ik2('upperarm_L', 'forearm_L', wristL, aimRight.clone().multiplyScalar(-0.9).addScaledVector(UP, -1.1).addScaledVector(aimFwd, -0.2));
  aimBone('hand_L', dirL, palmL);
  // 소품을 왼손에
  const hp = wpos(B.hand_L).addScaledVector(boneDir('hand_L'), H.len.hand_L * 0.45);
  shellMesh.visible = !!rl.shell; magMesh.visible = !!rl.mag;
  if (rl.shell) { shellMesh.position.copy(hp); shellMesh.quaternion.copy(gq); }
  if (rl.mag) { magMesh.position.copy(hp).addScaledVector(gUp, 0.04); magMesh.quaternion.copy(gq); }
  }
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

// ───────── 쌍권총(틱) ─────────
const dualKick = [new Spring3(300, 20), new Spring3(300, 20)];
function poseDual(dt, c) {
  const { pivot, aimQ, aimRight, aimFwd, sw, stepBob, ap } = c;
  const C = H.C, B = H.B;
  // 장전: 두 총을 위로 젖혔다가 내림
  let rk = 0;
  if (P.reload > 0) {
    P.reloadT += dt; const k = P.reloadT / 1.1;
    rk = Math.sin(Math.min(1, k) * Math.PI);
    if (k > 0.45 && !P.rs1) { P.rs1 = 1; sfx('click', 2200); }
    if (k >= 1) { P.reload = 0; P.mag = H.W.mag; P.rs1 = 0; sfx('click', 3400); }
  }
  const guns = [H.gun, H.gun2];
  for (let i = 0; i < 2; i++) {
    const s = i === 0 ? 1 : -1, g = guns[i], kp = dualKick[i].step(V(), dt);
    const go = C.gunOff;
    const off = V(s * go[0] + sw.x * 0.5 - s * rk * 0.08, go[1] + sw.y * 0.5 + rk * 0.12, go[2] + kp.z * 0.1 + rk * 0.2).add(stepBob);
    g.position.copy(pivot).add(off.applyQuaternion(aimQ));
    g.quaternion.setFromRotationMatrix(new THREE.Matrix4().lookAt(g.position, aimPoint, UP));
    g.rotateX(kp.x * 0.06 + rk * 1.2); g.rotateZ(-s * 0.12 - sw.x * 1.2 + s * rk * 0.5);
    if (ap.gunDown) { g.position.addScaledVector(UP, -0.15 * ap.gunDown); g.rotateX(-0.8 * ap.gunDown); }
    g.updateMatrixWorld(true);
    const gq = g.quaternion, gUp = V(0, 1, 0).applyQuaternion(gq), gFwd = V(0, 0, -1).applyQuaternion(gq), gRt = V(1, 0, 0).applyQuaternion(gq);
    const side = i === 0 ? 'R' : 'L', wr = i === 0 ? C.wristR : C.wristL;
    const d = gUp.clone().multiplyScalar(-0.8).addScaledVector(gFwd, 0.55).normalize();
    const wrist = g.position.clone().addScaledVector(d, wr[0]).addScaledVector(gRt, s * wr[1]).addScaledVector(gUp, wr[2]);
    let dir = d, palm = gRt.clone().multiplyScalar(-s), tgt = wrist;
    if (i === 1 && ap.handW > 0) { // 왼손 스킬 동작이 있으면 왼총은 손에서 떨어지지 않게 같이 움직임
      const sL = wpos(B.upperarm_L), reach = H.len.upperarm_L + H.len.forearm_L;
      const t2 = sL.clone().addScaledVector(aimFwd, reach * 0.9).addScaledVector(UP, 0.1);
      tgt = wrist.clone().lerp(t2, ap.handW);
    }
    ik2('upperarm_' + side, 'forearm_' + side, tgt, aimRight.clone().multiplyScalar(s).addScaledVector(UP, -1.0).addScaledVector(aimFwd, -0.3));
    aimBone('hand_' + side, dir, palm);
  }
}

// ───────── 망치(녹) ─────────
// 열쇠 자세: 손잡이(오른손) 위치 [오른쪽, 위, 앞], 망치머리 방향 [오른쪽, 위, 앞], 상체 비틀기, 숙임, 웅크림
const MK = {
  idle: { g: [0.22, -0.42, 0.26], d: [-0.55, 0.62, 0.4], tw: 0, ln: 0, cr: 0 },
  wind: { g: [0.42, 0.08, -0.02], d: [0.55, 0.55, -0.6], tw: 0.75, ln: -0.05, cr: 0.03 },
  mid: { g: [0.12, -0.02, 0.5], d: [0.05, 0.1, 1], tw: 0, ln: 0.12, cr: 0.05 },
  end: { g: [-0.32, -0.08, 0.32], d: [-0.95, -0.05, 0.25], tw: -0.65, ln: 0.15, cr: 0.06 },
  up: { g: [0.08, 0.42, 0.05], d: [0.05, 0.7, -0.7], tw: 0, ln: -0.18, cr: 0 },
  slam: { g: [0.06, -0.5, 0.55], d: [0, -0.75, 0.65], tw: 0, ln: 0.45, cr: 0.22 },
  roar: { g: [0.38, 0.6, 0.05], d: [0.15, 1, 0.1], tw: -0.1, ln: -0.25, cr: 0.05 },
  shield: { g: [0.32, -0.55, 0.12], d: [0.15, -0.35, 1], tw: 0.15, ln: 0.05, cr: 0.04 },
};
function mixKey(a, b, k) {
  const L = (x, y) => x.map((v, i) => lerp(v, y[i], k));
  return { g: L(a.g, b.g), d: L(a.d, b.d), tw: lerp(a.tw, b.tw, k), ln: lerp(a.ln, b.ln, k), cr: lerp(a.cr, b.cr, k) };
}
function track(keys, t) { // keys: [[time, key], ...]
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 0; i < keys.length - 1; i++) {
    const [t0, a] = keys[i], [t1, b] = keys[i + 1];
    if (t <= t1) return mixKey(a, b, smooth((t - t0) / (t1 - t0)));
  }
  return keys[keys.length - 1][1];
}
function meleeFrame() {
  let base = MK.idle;
  if (SK.barrier && SK.barrier.on && H.id === 'nok') base = mixKey(MK.idle, MK.shield, SK.barrier.k);
  let f = base;
  if (P.swing >= 0) f = track([[0, base], [0.2, MK.wind], [0.31, MK.mid], [0.4, MK.end], [0.85, base]], P.swing);
  const a = SK.act;
  if (a && a.type === 'gslam') f = track([[0, base], [0.28, MK.up], [0.4, MK.slam], [0.62, MK.slam], [1.0, base]], a.t);
  if (a && a.type === 'roar') f = track([[0, base], [0.25, MK.roar], [0.85, MK.roar], [1.15, base]], a.t);
  return f;
}
function poseMelee(dt, c, mf) {
  const { pivot, aimRight, aimFwd, sw, stepBob } = c;
  const B = H.B, g = H.gun;
  const yawQ = new THREE.Quaternion().setFromAxisAngle(UP, P.yaw);
  const rt = V(1, 0, 0).applyQuaternion(yawQ), fw = V(0, 0, -1).applyQuaternion(yawQ);
  const loc = (v) => rt.clone().multiplyScalar(v[0]).addScaledVector(UP, v[1]).addScaledVector(fw, v[2]);
  g.position.copy(pivot).add(loc(mf.g)).add(stepBob.clone().applyQuaternion(yawQ)).addScaledVector(rt, sw.x * 0.3).addScaledVector(UP, sw.y * 0.3);
  const dir = loc(mf.d).normalize();
  // 망치 머리 쪽 = 무기 로컬 -Z. 망치 면(로컬 +Y)은 휘두르는 방향을 향하게
  const upHint = Math.abs(dir.dot(fw)) > 0.9 ? UP.clone() : fw.clone();
  g.quaternion.setFromRotationMatrix(new THREE.Matrix4().lookAt(g.position, g.position.clone().add(dir), upHint));
  g.updateMatrixWorld(true);
  const gq = g.quaternion, gUp = V(0, 1, 0).applyQuaternion(gq), gFwd = V(0, 0, -1).applyQuaternion(gq), gRt = V(1, 0, 0).applyQuaternion(gq);
  const C = H.C;
  // 두 손으로 자루를 감싸 쥠 (손가락은 자루를 돌아감)
  const dR = gUp.clone().multiplyScalar(-0.75).addScaledVector(gRt, -0.35).addScaledVector(gFwd, 0.2).normalize();
  const wristR = g.position.clone().addScaledVector(dR, C.wristR[0]).addScaledVector(gFwd, -0.03);
  ik2('upperarm_R', 'forearm_R', wristR, aimRight.clone().addScaledVector(UP, -1.0).addScaledVector(aimFwd, -0.3));
  aimBone('hand_R', dR, gRt.clone().negate());
  let wristL = wpos(H.gripL).addScaledVector(dR, C.wristL[0]), dirL = dR.clone(), palmL = gRt.clone();
  if (SK.barrier && SK.barrier.k > 0.01 && H.id === 'nok') { // 석판 방패 손잡이
    const slab = SK.barrier.m;
    const hold = slab.localToWorld(V(-0.25, 1.15, 0.2));
    wristL.lerp(hold, SK.barrier.k);
    dirL = dirL.lerp(UP.clone(), SK.barrier.k).normalize(); palmL = palmL.lerp(fw.clone(), SK.barrier.k).normalize();
  }
  ik2('upperarm_L', 'forearm_L', wristL, aimRight.clone().multiplyScalar(-1).addScaledVector(UP, -1.0).addScaledVector(aimFwd, -0.2));
  aimBone('hand_L', dirL, palmL);
}
function meleeHit() {
  const W = H.W, fw = V(-Math.sin(P.yaw), 0, -Math.cos(P.yaw));
  let n = 0;
  for (const d of dummies) {
    if (d.dead) continue;
    const rel = dummyPos(d).clone().sub(P.pos).setY(0), dist = rel.length();
    if (dist > W.range) continue;
    if (rel.normalize().dot(fw) < Math.cos(0.75)) continue;
    const side = V(fw.z, 0, -fw.x);
    hurtDummy(d, W.dmg, false, fw.clone().multiplyScalar(3.5).addScaledVector(side, -2));
    sparks(dummyPos(d).clone().setY(1.2), 8, fw.clone().negate()); n++;
  }
  if (n) { sfx('hit', false); $('hit').className = ''; hitT = 0.15; SK.shake = Math.max(SK.shake, 0.6); ssfx('boom'); P.hits++; }
  else if (AC) { const t = AC.currentTime; burst(t, 0.25, 600, 0.7, 0.5, 'bandpass'); }
  return n;
}

// ───────── 틱 스킬용 잔상·분신·드론 ─────────
let ghostPool = [];
function makeGhost(color) {
  const g = skClone(H.model);
  g.traverse((o) => { if (o.isMesh) { o.material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }); o.castShadow = false; } });
  scene.add(g); return g;
}
function copyPose(dst) {
  const src = H.model;
  dst.position.copy(src.position); dst.quaternion.copy(src.quaternion);
  const sb = [], db = [];
  src.traverse((o) => { if (o.isBone) sb.push(o); }); dst.traverse((o) => { if (o.isBone) db.push(o); });
  for (let i = 0; i < sb.length && i < db.length; i++) { db[i].position.copy(sb[i].position); db[i].quaternion.copy(sb[i].quaternion); db[i].scale.copy(sb[i].scale); }
}
function afterimage(color = 0xff9a3a, life = 0.45) {
  let g = ghostPool.find((x) => !x.visible && x.userData.owner === H.id);
  if (!g) { g = makeGhost(color); g.userData.owner = H.id; ghostPool.push(g); }
  copyPose(g); g.visible = true;
  fx.push({ o: g, t: 0, life, kind: 'ghost', keep: true });
}
const drones = [];
function makeDrone() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 10), new THREE.MeshStandardMaterial({ color: 0x2a2f3a, metalness: 0.6, roughness: 0.35 }));
  const ringM = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.025, 6, 24), new THREE.MeshStandardMaterial({ color: 0x9aa3b5, metalness: 0.7, roughness: 0.3 }));
  ringM.rotation.x = Math.PI / 2;
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff8a2a }));
  eye.position.z = -0.13;
  g.add(body, ringM, eye); body.castShadow = true; scene.add(g);
  return { g, ring: ringM, t: 0, fire: 0, target: null };
}

// ───────── 투사체 (유탄·점착 폭탄·에너지 볼트·섬광탄·박격포) ─────────
const projs = [];
const PG = {
  grenade: new THREE.SphereGeometry(0.07, 12, 8), bolt: new THREE.SphereGeometry(0.06, 10, 8), bomb: new THREE.SphereGeometry(0.09, 12, 8),
  flash: new THREE.CylinderGeometry(0.04, 0.04, 0.12, 10), shell: new THREE.ConeGeometry(0.09, 0.4, 10).rotateX(Math.PI),
};
const PM = {
  grenade: new THREE.MeshStandardMaterial({ color: 0x2aa0a0, emissive: 0xff7a2f, emissiveIntensity: 0.6, metalness: 0.5, roughness: 0.4 }),
  bolt: new THREE.MeshBasicMaterial({ color: 0xffe6a0 }), bomb: new THREE.MeshStandardMaterial({ color: 0x333333, emissive: 0xff2020, emissiveIntensity: 1 }),
  flash: new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.6, roughness: 0.3 }), shell: new THREE.MeshStandardMaterial({ color: 0x44505a, emissive: 0xff7a2f, emissiveIntensity: 0.5 }),
};
const glowTex = radTex([[0, 'rgba(255,255,230,1)'], [0.35, 'rgba(255,210,120,.7)'], [1, 'rgba(255,180,80,0)']]);
function spawnProj(kind, pos, vel, opt = {}) {
  const m = new THREE.Mesh(PG[kind], PM[kind]); m.position.copy(pos); m.castShadow = true; scene.add(m);
  if (kind === 'bolt') { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); s.scale.setScalar(0.5); m.add(s); }
  const p = Object.assign({ kind, m, vel: vel.clone(), g: 0, life: 4, t: 0, stuck: null, fuse: 0 }, opt);
  projs.push(p); return p;
}
function explode(pos, r, dmg, color = 0xff8a3a, big = 1) {
  ring(pos.clone().setY(Math.max(0.02, pos.y)), color, 0.3, r, 0.4);
  bubble(pos, color, 0.2, r * 0.7, 0.25);
  const l = new THREE.PointLight(color, 40 * big, r * 3, 2); l.position.copy(pos); scene.add(l);
  fx.push({ o: l, t: 0, life: 0.25, kind: 'light' });
  dust(pos, Math.round(6 * big), r * 0.5, 1.2 * big); sparks(pos, Math.round(10 * big));
  const n = aoe(pos, r, Math.round(dmg * P.dmgMul), 6);
  SK.shake = Math.max(SK.shake, 0.6 * big * Math.max(0, 1 - pos.distanceTo(P.pos) / 25));
  ssfx('boom');
  for (let i = 0; i < 3; i++) decal(pos.clone().setY(groundUnder(pos.x, pos.z, pos.y) + 0.01).add(V((Math.random() - 0.5) * r * 0.4, 0, (Math.random() - 0.5) * r * 0.4)), UP);
  return n;
}
function updateProjs(dt) {
  for (let i = projs.length - 1; i >= 0; i--) {
    const p = projs[i]; p.t += dt;
    if (p.stuck) { // 붙은 점착 폭탄
      if (p.stuck.d) p.m.position.copy(dummyPos(p.stuck.d)).add(p.stuck.off);
      p.m.material = (Math.floor(p.t * (p.t > p.fuse - 0.4 ? 16 : 6)) % 2) ? PM.bomb : PM.flash;
      if (p.t >= p.fuse) { explode(p.m.position, 3.5, 90); scene.remove(p.m); projs.splice(i, 1); }
      continue;
    }
    p.vel.y -= p.g * dt;
    const from = p.m.position.clone(), step = p.vel.clone().multiplyScalar(dt), len = step.length();
    const h = castRay(from, step.clone().normalize(), len + 0.05);
    let hit = h.kind && h.t <= len + 0.05;
    if (hit) p.m.position.copy(h.p); else p.m.position.add(step);
    if (p.kind === 'bolt' && Math.random() < 0.5) sparks(p.m.position, 1, null, 0xffe0a0);
    if (p.kind === 'shell') p.m.lookAt(p.m.position.clone().add(p.vel));
    if (hit || p.t > p.life) {
      const at = p.m.position.clone();
      if (p.kind === 'grenade') explode(at, 3, 80);
      else if (p.kind === 'shell') explode(at, 4, 110, 0xff7a2f, 1.6);
      else if (p.kind === 'bolt') {
        if (h.kind === 'dummy') { hurtDummy(h.d, Math.round(30 * P.dmgMul * (h.crit ? 2 : 1)), h.crit, p.vel.clone().setY(0).normalize().multiplyScalar(0.6)); sfx('hit', h.crit); $('hit').className = h.crit ? 'crit' : ''; hitT = 0.12; P.hits++; }
        sparks(at, 6, null, 0xffe0a0);
      } else if (p.kind === 'bomb') {
        if (!hit) { explode(at, 3.5, 90); scene.remove(p.m); projs.splice(i, 1); continue; }
        p.stuck = { d: h.kind === 'dummy' ? h.d : null, off: h.kind === 'dummy' ? at.clone().sub(dummyPos(h.d)) : V() };
        p.t = 0; p.fuse = 1.2; sfx('click', 900); continue;
      } else if (p.kind === 'flash') { flashBang(at); }
      scene.remove(p.m); projs.splice(i, 1);
    }
  }
}
function flashBang(at) {
  const l = new THREE.PointLight(0xffffff, 120, 25, 2); l.position.copy(at); scene.add(l);
  fx.push({ o: l, t: 0, life: 0.35, kind: 'light' });
  bubble(at, 0xffffff, 0.2, 3, 0.25); ring(at.clone().setY(0.03), 0xffffff, 0.2, 5, 0.35);
  for (const d of dummies) if (!d.dead && dummyPos(d).distanceTo(at) < 5.5) { d.blind = 2.5; hurtDummy(d, 25, false, null); }
  // 내 화면도 가까우면 하얗게
  const v = at.clone().project(camera), close = Math.max(0, 1 - at.distanceTo(camera.position) / 12);
  if (v.z < 1 && Math.abs(v.x) < 1.2 && Math.abs(v.y) < 1.2) $('flashov').style.opacity = 0.85 * close;
  if (AC) { const t = AC.currentTime; burst(t, 0.6, 3000, 0.5, 1.2, 'highpass'); tone(t, 3200, 2600, 1.2, 0.08); }
}

// 투척 공통: 왼손으로 던지는 동작 뒤 0.22초에 날아감
function throwProj(kind, speed, g, opt) {
  SK.act = { type: 'throw', t: 0, dur: 0.5, lock: true, kind, speed, g, opt, fired: false };
  ssfx('whoosh');
}
function releaseThrow(a) {
  const B = H.B, from = wpos(B.hand_L);
  const dir = aimPoint.clone().sub(from).normalize();
  dir.y += 0.18; dir.normalize();
  spawnProj(a.kind, from, dir.multiplyScalar(a.speed), Object.assign({ g: a.g }, a.opt || {}));
}

// 오래 남는 장판·구름
const zones = [];
function healZone(pos) {
  const g = new THREE.Group(); g.position.copy(pos);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(3, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false }));
  const edge = new THREE.Mesh(new THREE.RingGeometry(2.85, 3, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xfff0b0, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
  disc.position.y = edge.position.y = 0.03; g.add(disc, edge); scene.add(g);
  zones.push({ g, t: 0, life: 5, kind: 'heal', r: 3 });
}
function nanoCloud() {
  const g = new THREE.Group(); scene.add(g);
  const tex = radTex([[0, 'rgba(210,255,230,.8)'], [1, 'rgba(120,255,200,0)']]);
  for (let i = 0; i < 70; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.5 }));
    s.userData = { a: Math.random() * 6.28, r: 0.8 + Math.random() * 3.4, y: 0.2 + Math.random() * 2.2, sp: 0.4 + Math.random() * 0.8 };
    s.scale.setScalar(0.25 + Math.random() * 0.35); g.add(s);
  }
  zones.push({ g, t: 0, life: 5, kind: 'nano', follow: true });
}
function updateZones(dt) {
  for (let i = zones.length - 1; i >= 0; i--) {
    const z = zones[i]; z.t += dt;
    const fade = z.t < 0.3 ? z.t / 0.3 : z.t > z.life - 0.5 ? (z.life - z.t) / 0.5 : 1;
    if (z.kind === 'heal') {
      z.g.children[1].material.opacity = 0.9 * fade; z.g.children[0].material.opacity = 0.18 * fade;
      if (Math.random() < dt * 25) { const a = Math.random() * 6.28, r = Math.random() * 2.8; const e = new THREE.Mesh(sparkGeo, new THREE.MeshBasicMaterial({ color: 0xfff0a0 })); e.position.copy(z.g.position).add(V(Math.cos(a) * r, 0.05, Math.sin(a) * r)); scene.add(e); fx.push({ o: e, t: 0, life: 1.0, kind: 'ember', v: V(0, 1.2, 0) }); }
    } else if (z.kind === 'crate') { updateCrate(z, dt); if (z.t > z.life - 0.5) z.g.scale.setScalar(Math.max(0.01, (z.life - z.t) / 0.5));
    } else if (z.kind === 'nano') {
      z.g.position.copy(P.pos);
      for (const s of z.g.children) { const u = s.userData; u.a += dt * u.sp; s.position.set(Math.cos(u.a) * u.r, u.y + Math.sin(z.t * 2 + u.a) * 0.15, Math.sin(u.a) * u.r); s.material.opacity = 0.5 * fade; }
    }
    if (z.t > z.life) { scene.remove(z.g); zones.splice(i, 1); }
  }
}
// 보급 상자 (모라 궁극기)
function supplyDrop() {
  const fw = V(-Math.sin(P.yaw), 0, -Math.cos(P.yaw));
  const at = P.pos.clone().addScaledVector(fw, 2.2); at.y = groundUnder(at.x, at.z, P.pos.y + 0.3);
  const crate = new THREE.Group();
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.6, 0.8), new THREE.MeshStandardMaterial({ color: 0x2f7d6a, roughness: 0.7 }));
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.12, 0.82), new THREE.MeshStandardMaterial({ color: 0xf2f2f2, emissive: 0x7fffd0, emissiveIntensity: 0.4 }));
  const cross = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 0.84), new THREE.MeshBasicMaterial({ color: 0xffffff })); cross.position.y = 0.31;
  const cross2 = cross.clone(); cross2.rotation.y = Math.PI / 2;
  box.castShadow = true; crate.add(box, band, cross, cross2); crate.position.copy(at).setY(at.y + 14); scene.add(crate);
  ring(at, 0x7fffd0, 0.8, 1.2, 1.2, 0.04, 0.2);
  zones.push({ g: crate, t: 0, life: 7, kind: 'crate', at });
}
function updateCrate(z, dt) {
  const y = Math.max(z.at.y + 0.3, z.at.y + 14 - z.t * z.t * 18);
  z.g.position.y = y;
  if (!z.landed && y <= z.at.y + 0.31) {
    z.landed = true; ssfx('boom'); dust(z.at, 10, 1.4, 1.3); SK.shake = 0.6;
    P.mag = H.W.mag; P.reload = 0; P.dmgT = 6; P.dmgMul = 1.3;
    ring(z.at, 0x7fffd0, 0.3, 4, 0.5); bubble(P.pos.clone().add(V(0, 1, 0)), 0x7fffd0, 0.3, 1.4, 0.4);
    dmgNumber(P.pos.clone().add(V(0, 2.3, 0)), '보급!', false);
  }
}

// 우클릭: 루멘 치유 빛줄기 / 모라 치유 다트 (치유할 아군이 없어서 효과만)
let healBeam = null;
function supportRmb(dt) {
  P.cool2 = Math.max(0, P.cool2 - dt);
  const W = H.W, want = rmb || window.__rmb;
  if (W.beam) {
    if (want && !(SK.act && SK.act.noFire)) {
      if (!healBeam) { healBeam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false })); scene.add(healBeam); }
      const a = wpos(H.muzzle), b = aimPoint.clone(); if (b.distanceTo(a) > 15) b.copy(a).add(b.sub(a).setLength(15));
      healBeam.visible = true; healBeam.position.copy(a); healBeam.lookAt(b);
      const w = 0.05 + Math.sin(performance.now() / 50) * 0.015; healBeam.scale.set(w, w, a.distanceTo(b));
      if (Math.random() < dt * 30) sparks(b, 1, null, 0xfff0a0);
    } else if (healBeam) healBeam.visible = false;
  } else if (healBeam) healBeam.visible = false;
  if (W.dart && want && P.cool2 <= 0 && P.cool <= 0) {
    P.cool2 = 0.32; P.cool = 0.15;
    const a = wpos(H.muzzle); tracer(a, aimPoint.clone(), 'heal'); sparks(aimPoint, 4, null, 0x8aff9a);
    recoilPos.v.z += 1; recoilRot.v.x += 3; if (AC) { const t = AC.currentTime; tone(t, 1200, 1800, 0.08, 0.15, 'triangle'); }
  }
}
// ───────── 스킬 ─────────
const SK = { charges: 2, chT: 0, holo: null, buff: 0, cd: { ab1: 0, ab2: 0 }, ult: 0, act: null, barrier: null, dome: null, shieldT: 0, glow: 0, fovAdd: 0, shake: 0 };
const ABIL = {
  ratchet: { ab1: { name: '돌진', cd: 7 }, ab2: { name: '내려찍기', cd: 10 }, ult: { name: '철갑 돌격', cost: 1300 } },
  orbit: { ab1: { name: '이동형 방벽', cd: 1.2, toggle: true }, ab2: { name: '반발 펄스', cd: 8 }, ult: { name: '방벽 돔', cost: 1500 } },
  tick: { ab1: { name: '순간이동', cd: 3.5, charges: 2 }, ab2: { name: '홀로그램 분신', cd: 9 }, ult: { name: '추적 드론', cost: 1200 } },
  phase: { ab1: { name: '폭발 도약', cd: 8 }, ab2: { name: '점착 폭탄', cd: 7 }, ult: { name: '박격포 포격', cost: 1400 } },
  lumen: { ab1: { name: '가속 보호막', cd: 12 }, ab2: { name: '치유 장판', cd: 14 }, ult: { name: '빛의 고리', cost: 1400 } },
  mora: { ab1: { name: '가속 장치', cd: 12 }, ab2: { name: '섬광 수류탄', cd: 11 }, ult: { name: '전술 보급', cost: 1300 } },
  iko: { ab1: { name: '방패 드론', cd: 10 }, ab2: { name: '정화', cd: 12 }, ult: { name: '나노 구름', cost: 1400 } },
  nok: { ab1: { name: '석판 방패', cd: 1.0, toggle: true }, ab2: { name: '지면 강타', cd: 9 }, ult: { name: '전사의 함성', cost: 1400 } },
};
// 육각 무늬 텍스처 (방벽·돔)
const hexTex = (() => {
  const c = document.createElement('canvas'); c.width = 128; c.height = 148; const g = c.getContext('2d');
  g.fillStyle = 'rgba(80,190,255,0.10)'; g.fillRect(0, 0, 128, 148);
  g.strokeStyle = 'rgba(160,230,255,0.95)'; g.lineWidth = 3;
  const hex = (cx, cy, r) => { g.beginPath(); for (let i = 0; i < 6; i++) { const a = Math.PI / 3 * i + Math.PI / 6; g.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a)); } g.closePath(); g.stroke(); };
  for (const [x, y] of [[0, 0], [128, 0], [64, 37], [0, 74], [128, 74], [64, 111], [0, 148], [128, 148]]) hex(x, y, 40);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
})();
const shieldMat = (color, rep) => {
  const t = hexTex.clone(); t.needsUpdate = true; t.repeat.set(...rep);
  return new THREE.MeshBasicMaterial({ map: t, color, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
};
function makeBarrier() {
  const len = 1.55, g = new THREE.CylinderGeometry(2.2, 2.2, 2.5, 24, 1, true, Math.PI - len / 2, len).translate(0, 1.25, 0);
  const m = new THREE.Mesh(g, shieldMat(0x8fdcff, [6, 3.5]));
  const edge = new THREE.Mesh(new THREE.CylinderGeometry(2.21, 2.21, 0.05, 24, 1, true, Math.PI - len / 2, len).translate(0, 2.5, 0),
    new THREE.MeshBasicMaterial({ color: 0xff9a4a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  const edge2 = edge.clone(); edge2.position.y = -2.47;
  m.add(edge, edge2); m.renderOrder = 5; scene.add(m);
  return { m, k: 0, on: true, yaw: P.yaw };
}
const stoneTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  g.fillStyle = '#7d756a'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) { const v = 90 + Math.random() * 60 | 0; g.fillStyle = `rgba(${v},${v - 6},${v - 14},0.35)`; g.fillRect(Math.random() * 256, Math.random() * 256, 2 + Math.random() * 5, 2 + Math.random() * 5); }
  g.strokeStyle = 'rgba(40,36,30,0.6)'; g.lineWidth = 2;
  for (let i = 0; i < 9; i++) { g.beginPath(); let x = Math.random() * 256, y = Math.random() * 256; g.moveTo(x, y); for (let k = 0; k < 5; k++) { x += (Math.random() - 0.5) * 60; y += (Math.random() - 0.5) * 60; g.lineTo(x, y); } g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
})();
const runeTex = (() => {
  const c = document.createElement('canvas'); c.width = 128; c.height = 256; const g = c.getContext('2d');
  g.strokeStyle = '#ffb060'; g.lineWidth = 6; g.lineCap = 'round';
  for (let r = 0; r < 4; r++) { const y = 40 + r * 55; g.beginPath(); g.moveTo(34, y); g.lineTo(64, y - 18); g.lineTo(94, y); g.moveTo(64, y - 18); g.lineTo(64, y + 20); g.stroke(); }
  return new THREE.CanvasTexture(c);
})();
function makeSlab() {
  const grp = new THREE.Group();
  const slab = new THREE.Mesh(new THREE.BoxGeometry(1.7, 2.3, 0.22, 4, 6, 1), new THREE.MeshStandardMaterial({ map: stoneTex, roughness: 0.95, color: 0xc9bfae }));
  const p = slab.geometry.attributes.position; // 가장자리를 울퉁불퉁하게
  for (let i = 0; i < p.count; i++) { p.setX(i, p.getX(i) * (1 + (Math.random() - 0.5) * 0.06)); p.setY(i, p.getY(i) * (1 + (Math.random() - 0.5) * 0.04)); }
  slab.geometry.computeVertexNormals();
  slab.position.y = 1.15; slab.castShadow = slab.receiveShadow = true;
  const rune = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 1.4), new THREE.MeshBasicMaterial({ map: runeTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  rune.position.set(0, 1.2, -0.115); rune.rotation.y = Math.PI;
  grp.add(slab, rune); scene.add(grp);
  return { m: grp, k: 0, on: true, yaw: P.yaw, slab: true, rune };
}
function spike(pos, h, delay) {
  const m = new THREE.Mesh(new THREE.ConeGeometry(0.28 + Math.random() * 0.15, h, 5), new THREE.MeshStandardMaterial({ map: stoneTex, roughness: 0.95, color: 0xb0a594 }));
  m.position.copy(pos).setY(-h / 2); m.rotation.set((Math.random() - 0.5) * 0.5, Math.random() * 6, (Math.random() - 0.5) * 0.5);
  m.castShadow = true; scene.add(m);
  fx.push({ o: m, t: -delay, life: 1.4, kind: 'spike', h, y0: pos.y });
}
function ring(pos, color, r0, r1, life, y = 0.05, thick = 0.35) {
  const m = new THREE.Mesh(new THREE.RingGeometry(1 - thick, 1, 48).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  m.position.copy(pos).setY(pos.y + y); scene.add(m);
  fx.push({ o: m, t: 0, life, kind: 'ring', r0, r1 });
}
function bubble(pos, color, r0, r1, life) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), shieldMat(color, [8, 4]));
  m.position.copy(pos); scene.add(m);
  fx.push({ o: m, t: 0, life, kind: 'bubble', r0, r1 });
}
const dustTex = radTex([[0, 'rgba(200,190,175,.55)'], [1, 'rgba(200,190,175,0)']]);
function dust(pos, n = 4, spread = 0.6, size = 0.8) {
  for (let i = 0; i < n; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: dustTex, transparent: true, depthWrite: false }));
    s.position.copy(pos).add(V((Math.random() - 0.5) * spread, 0.15 + Math.random() * 0.2, (Math.random() - 0.5) * spread));
    s.scale.setScalar(size * 0.4); scene.add(s);
    fx.push({ o: s, t: 0, life: 0.6 + Math.random() * 0.4, kind: 'dust', v: V((Math.random() - 0.5) * 1.5, 0.6 + Math.random() * 0.6, (Math.random() - 0.5) * 1.5), size });
  }
}
function dummyPos(d) { return d.g.position; }
function hurtDummy(d, dmg, crit, push) {
  if (d.dead || dmg <= 0) return 0;
  d.hp -= dmg; d.flash = 0.1; d.knock = Math.min(0.7, d.knock + 0.04 + dmg / 260);
  if (push) d.kv.add(push);
  dmgNumber(V(d.g.position.x, 2.2, d.g.position.z), dmg, crit);
  SK.ult = Math.min(1, SK.ult + dmg / ABIL[H.id].ult.cost);
  if (d.hp <= 0) { d.dead = 3; P.kills++; sfx('kill'); $('kills').textContent = P.kills; }
  return dmg;
}
function aoe(center, r, dmg, push, up = 1.5) {
  let n = 0;
  for (const d of dummies) {
    if (d.dead) continue;
    const dp = dummyPos(d).clone().setY(0), c = center.clone().setY(0), dist = dp.distanceTo(c);
    if (dist > r) continue;
    const k = 1 - 0.5 * dist / r, dir = dp.sub(c).normalize();
    hurtDummy(d, Math.round(dmg * k), false, dir.multiplyScalar(push * k).add(V(0, 0, 0)));
    n++;
  }
  if (n) { sfx('hit', false); $('hit').className = ''; hitT = 0.15; }
  return n;
}
const SKSFX = {
  whoosh() { const t = AC.currentTime; burst(t, 0.5, 900, 0.7, 0.6, 'bandpass'); tone(t, 180, 90, 0.4, 0.3, 'sawtooth'); },
  boom() { const t = AC.currentTime; tone(t, 90, 28, 0.6, 1.3); burst(t, 0.7, 700, 0.6, 1.1); burst(t, 0.15, 4000, 1, 0.5, 'highpass'); },
  shieldOn() { const t = AC.currentTime; tone(t, 300, 900, 0.25, 0.25, 'triangle'); tone(t + 0.05, 600, 1500, 0.2, 0.15); },
  shieldOff() { const t = AC.currentTime; tone(t, 900, 250, 0.2, 0.2, 'triangle'); },
  pulse() { const t = AC.currentTime; tone(t, 160, 60, 0.4, 0.8); tone(t, 900, 300, 0.3, 0.25, 'triangle'); burst(t, 0.3, 1500, 1, 0.5); },
  dome() { const t = AC.currentTime; tone(t, 120, 480, 0.8, 0.4, 'triangle'); tone(t, 240, 960, 0.8, 0.2); burst(t, 0.5, 800, 0.7, 0.5); },
  ult() { const t = AC.currentTime; tone(t, 110, 220, 0.5, 0.6, 'sawtooth'); tone(t + 0.1, 220, 440, 0.5, 0.3, 'square'); },
};
const ssfx = (n) => { if (AC) SKSFX[n](); };

function blink() {
  const hv = V(P.vel.x, 0, P.vel.z);
  const dir = hv.length() > 1 ? hv.normalize() : V(-Math.sin(P.yaw), 0, -Math.cos(P.yaw));
  afterimage(0xff9a3a, 0.5);
  const start = P.pos.clone(); let d = 0;
  for (; d < 7; d += 0.25) {
    const q = start.clone().addScaledVector(dir, d + 0.25);
    if (boxes.some((b) => q.x + 0.35 > b.min.x && q.x - 0.35 < b.max.x && q.z + 0.35 > b.min.z && q.z - 0.35 < b.max.z && b.max.y > q.y + 0.5 && b.min.y < q.y + 1.8)) break;
  }
  P.pos.addScaledVector(dir, d);
  tracer(start.clone().add(V(0, 1.0, 0)), P.pos.clone().add(V(0, 1.0, 0)), 'pistols');
  SK.fovAdd = Math.max(SK.fovAdd, 12); A.leanF.v += 3;
  if (AC) { const t = AC.currentTime; tone(t, 400, 1800, 0.12, 0.25, 'sawtooth'); burst(t, 0.15, 3000, 1, 0.4, 'bandpass'); }
}
function holo() {
  if (SK.holo) { scene.remove(SK.holo.g); for (const c of SK.holo.g.userData.guns || []) scene.remove(c); }
  const g = makeGhost(0x7fd8ff); copyPose(g);
  const fw = V(-Math.sin(P.yaw), 0, -Math.cos(P.yaw));
  g.position.copy(P.pos).addScaledVector(fw, 1.6);
  for (const gun of [H.gun, H.gun2]) { // 분신도 총을 듦
    if (!gun) continue;
    const c = gun.clone(); c.traverse((o) => { if (o.isMesh) o.material = new THREE.MeshBasicMaterial({ color: 0x7fd8ff, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false }); });
    c.position.copy(gun.position).sub(H.model.position).add(g.position); c.quaternion.copy(gun.quaternion); c.position.y = gun.position.y - H.model.position.y;
    const wrap = new THREE.Group(); wrap.add(c); g.attach ? null : null; scene.add(c); g.userData.guns = (g.userData.guns || []).concat(c);
  }
  SK.holo = { g, t: 0, life: 5 };
  if (AC) { const t = AC.currentTime; tone(t, 1200, 300, 0.3, 0.2, 'square'); tone(t + 0.05, 300, 1200, 0.3, 0.12, 'square'); }
  ring(g.position, 0x7fd8ff, 0.2, 1.5, 0.4);
}
function useSkill(slot) {
  if (!H || switching) return;
  const id = H.id, ab = ABIL[id][slot];
  if (slot === 'ult') { if (SK.ult < 1 || SK.act) return; SK.ult = 0; }
  else if (!(id === 'tick' && slot === 'ab1')) { if (SK.cd[slot] > 0 || (SK.act && SK.act.lock)) return; }
  const aimFwd = V(-Math.sin(P.yaw), 0, -Math.cos(P.yaw));
  P.reload = 0;
  if (id === 'ratchet') {
    if (slot === 'ab1') { SK.act = { type: 'charge', t: 0, dur: 0.55, dir: aimFwd, hit: new Set(), lock: true, noFire: true }; ssfx('whoosh'); }
    if (slot === 'ab2') {
      if (!P.ground) return;
      const tgt = aimPoint.clone().setY(P.pos.y), d = tgt.clone().sub(P.pos).setY(0);
      const dist = Math.min(9, d.length()); d.normalize();
      P.vel.set(d.x * dist / 1.0, 9.5, d.z * dist / 1.0); P.ground = false;
      A.crouchJ.v -= 2.2;
      SK.act = { type: 'slam', t: 0, phase: 'rise', lock: true, noFire: true }; ssfx('whoosh');
    }
    if (slot === 'ult') { SK.act = { type: 'ram', t: 0, dur: 3.2, hit: new Map(), lock: true, noFire: true }; ssfx('ult'); SK.glow = 1; }
  } else if (id === 'tick') {
    if (slot === 'ab1') { if (SK.charges <= 0) return; SK.charges--; blink(); return; }
    if (slot === 'ab2') { holo(); }
    if (slot === 'ult') { ssfx('ult'); for (let i = 0; i < 3; i++) { const d = makeDrone(); d.t = i / 3 * Math.PI * 2; d.life = 8; d.g.position.copy(P.pos).add(V(0, 1.8, 0)); drones.push(d); } }
  } else if (id === 'phase') {
    if (slot === 'ab1') {
      const hv = V(P.vel.x, 0, P.vel.z); const dir = hv.length() > 1 ? hv.normalize() : aimFwd.clone();
      explode(P.pos.clone().add(V(0, 0.1, 0)), 3, 30); P.vel.set(dir.x * 7, 11.5, dir.z * 7); P.ground = false; A.crouchJ.v -= 2;
      SK.act = { type: 'rjump', t: 0, dur: 0.6 };
    }
    if (slot === 'ab2') throwProj('bomb', 17, 9);
    if (slot === 'ult') { SK.act = { type: 'call', t: 0, dur: 0.9, lock: true, noFire: true, mortar: aimPoint.clone(), n: 0 }; ssfx('ult'); }
  } else if (id === 'lumen') {
    if (slot === 'ab1') { SK.act = { type: 'boost', t: 0, dur: 0.45, lock: true }; P.spdT = 3; P.spdMul = 1.4; SK.bubbleT = 3; SK.bubbleC = 0xffd27a; ssfx('shieldOn'); ring(P.pos, 0xffd27a, 0.3, 2.2, 0.4); }
    if (slot === 'ab2') { SK.act = { type: 'throw', t: 0, dur: 0.5, lock: true, zone: true }; ssfx('whoosh'); }
    if (slot === 'ult') { SK.act = { type: 'raise', t: 0, dur: 1.2, lock: true, noFire: true }; ssfx('ult'); }
  } else if (id === 'mora') {
    if (slot === 'ab1') { SK.act = { type: 'boost', t: 0, dur: 0.45, lock: true }; P.spdT = 3; P.spdMul = 1.35; ssfx('shieldOn'); ring(P.pos, 0x7fdcff, 0.3, 4, 0.5); }
    if (slot === 'ab2') throwProj('flash', 16, 12, { life: 0.9 });
    if (slot === 'ult') { SK.act = { type: 'call', t: 0, dur: 0.8, lock: true, noFire: true, supply: true }; ssfx('ult'); }
  } else if (id === 'iko') {
    if (slot === 'ab1') { SK.act = { type: 'boost', t: 0, dur: 0.45, lock: true }; const d = makeDrone(); d.g.children[2].material = new THREE.MeshBasicMaterial({ color: 0x7fffd0 }); d.guard = true; d.life = 4; d.g.position.copy(P.pos).add(V(0, 1.8, 0)); drones.push(d); SK.bubbleT = 4; SK.bubbleC = 0x7fffd0; ssfx('shieldOn'); }
    if (slot === 'ab2') { SK.act = { type: 'boost', t: 0, dur: 0.5, lock: true, cleanse: true }; }
    if (slot === 'ult') { SK.act = { type: 'call', t: 0, dur: 0.8, lock: true, noFire: true, nano: true }; ssfx('ult'); }
  } else if (id === 'nok') {
    if (slot === 'ab1') {
      if (SK.barrier && SK.barrier.on) { SK.barrier.on = false; ssfx('shieldOff'); }
      else { if (!SK.barrier) SK.barrier = makeSlab(); SK.barrier.on = true; ssfx('boom'); dust(P.pos.clone().add(V(-Math.sin(P.yaw), 0, -Math.cos(P.yaw)).multiplyScalar(0.9)), 5, 1.2, 1); }
    }
    if (slot === 'ab2') { if (SK.barrier) SK.barrier.on = false; SK.act = { type: 'gslam', t: 0, dur: 1.0, fired: false, lock: true, noFire: true }; ssfx('whoosh'); }
    if (slot === 'ult') { SK.act = { type: 'roar', t: 0, dur: 1.15, fired: false, lock: true, noFire: true }; }
  } else {
    if (slot === 'ab1') {
      if (SK.barrier && SK.barrier.on) { SK.barrier.on = false; ssfx('shieldOff'); }
      else { if (!SK.barrier) SK.barrier = makeBarrier(); SK.barrier.on = true; ssfx('shieldOn'); }
    }
    if (slot === 'ab2') { SK.act = { type: 'pulse', t: 0, dur: 0.55, fired: false, lock: true }; }
    if (slot === 'ult') { SK.act = { type: 'dome', t: 0, dur: 0.95, fired: false, lock: true, noFire: true }; ssfx('ult'); }
  }
  if (slot !== 'ult') SK.cd[slot] = ab.cd;
}

// 매 프레임: 스킬 진행 (이동 덮어쓰기 포함)
function updateSkills(dt) {
  const id = H.id;
  SK.cd.ab1 = Math.max(0, SK.cd.ab1 - dt); SK.cd.ab2 = Math.max(0, SK.cd.ab2 - dt);
  if (id === 'tick' && SK.charges < 2) { SK.chT += dt; if (SK.chT >= ABIL.tick.ab1.cd) { SK.chT = 0; SK.charges++; } }
  if (SK.holo) {
    const h = SK.holo; h.t += dt;
    const fl = (Math.random() < 0.06 ? 0.15 : 0.45) * (h.t > h.life - 0.6 ? (h.life - h.t) / 0.6 : 1);
    h.g.traverse((o) => { if (o.isMesh) o.material.opacity = fl; });
    for (const c of h.g.userData.guns || []) c.traverse((o) => { if (o.isMesh) o.material.opacity = fl; });
    if (h.t > h.life) { scene.remove(h.g); for (const c of h.g.userData.guns || []) scene.remove(c); SK.holo = null; }
  }
  for (let i = drones.length - 1; i >= 0; i--) {
    const d = drones[i]; d.t += dt; d.life -= dt; d.fire -= dt;
    if (d.guard) { const an = d.t * 2.2; d.g.position.lerp(P.pos.clone().add(V(Math.cos(an) * 0.9, 2.0, Math.sin(an) * 0.9)), 1 - Math.exp(-6 * dt)); d.g.lookAt(P.pos.clone().add(V(0, 1, 0))); d.ring.rotation.z += dt * 8; if (d.life <= 0) { scene.remove(d.g); drones.splice(i, 1); } continue; }
    if (!d.target || d.target.dead) { let best = null, bd = 25; for (const m of dummies) { if (m.dead) continue; const k = dummyPos(m).distanceTo(P.pos); if (k < bd) { bd = k; best = m; } } d.target = best; }
    let goal;
    const ang = d.t * 1.6 + i * 2.1;
    if (d.target) { const tp = dummyPos(d.target); goal = tp.clone().add(V(Math.cos(ang) * 2.6, 2.4 + Math.sin(d.t * 3 + i) * 0.2, Math.sin(ang) * 2.6)); }
    else goal = P.pos.clone().add(V(Math.cos(ang) * 1.2, 2.1, Math.sin(ang) * 1.2));
    d.g.position.lerp(goal, 1 - Math.exp(-3 * dt));
    const look = d.target ? dummyPos(d.target).clone().setY(1.3) : P.pos.clone().add(V(-Math.sin(P.yaw) * 10, 1.5, -Math.cos(P.yaw) * 10));
    d.g.lookAt(look); d.g.rotateY(Math.PI); d.ring.rotation.z += dt * 8;
    if (d.target && d.fire <= 0 && dummyPos(d.target).distanceTo(d.g.position) < 6) {
      d.fire = 0.35; const tp = dummyPos(d.target).clone().setY(1.2 + Math.random() * 0.5);
      tracer(d.g.position.clone(), tp, 'pistols'); hurtDummy(d.target, 12, false, tp.clone().sub(d.g.position).setY(0).normalize().multiplyScalar(0.3)); sparks(tp, 2, null, 0xffa050);
      if (AC) { const t = AC.currentTime; tone(t, 2000, 700, 0.06, 0.08, 'square'); }
    }
    if (d.life <= 0) { scene.remove(d.g); sparks(d.g.position, 6, null, 0xffa050); drones.splice(i, 1); }
  }
  if (P.spdT > 0) { P.spdT -= dt; if (P.spdT <= 0) P.spdMul = 1; else if (Math.random() < dt * 20) dust(P.pos, 1, 0.3, 0.5); }
  if (P.dmgT > 0) { P.dmgT -= dt; if (P.dmgT <= 0) P.dmgMul = 1; }
  if (SK.bubbleT > 0) {
    SK.bubbleT -= dt;
    if (!SK.selfB) { SK.selfB = new THREE.Mesh(new THREE.SphereGeometry(1.1, 24, 14), shieldMat(0xffffff, [6, 3])); scene.add(SK.selfB); }
    SK.selfB.visible = true; SK.selfB.material.color.set(SK.bubbleC || 0xffffff);
    SK.selfB.position.copy(P.pos).setY(P.pos.y + 1.0); SK.selfB.material.opacity = 0.45 * Math.min(1, SK.bubbleT / 0.4);
  } else if (SK.selfB) SK.selfB.visible = false;
  if (SK.buff > 0) {
    SK.buff -= dt;
    if (Math.random() < dt * 30) { const e = new THREE.Mesh(sparkGeo, new THREE.MeshBasicMaterial({ color: Math.random() < 0.5 ? 0xffa040 : 0xffd080 })); const a = Math.random() * 6.28; e.position.copy(P.pos).add(V(Math.cos(a) * 0.5, 0.2 + Math.random() * 1.4, Math.sin(a) * 0.5)); scene.add(e); fx.push({ o: e, t: 0, life: 0.8, kind: 'ember', v: V(0, 1.4, 0) }); }
  }
  SK.ult = Math.min(1, SK.ult + dt * 0.012); // 시험장이라 저절로도 조금씩 참
  SK.fovAdd = damp(SK.fovAdd, 0, 5, dt); SK.shake = damp(SK.shake, 0, 7, dt);
  SK.shieldT = Math.max(0, SK.shieldT - dt);
  const a = SK.act;
  if (a) {
    a.t += dt;
    const aimFwd = V(-Math.sin(P.yaw), 0, -Math.cos(P.yaw));
    if (a.type === 'charge' || a.type === 'ram') {
      const dir = a.type === 'ram' ? aimFwd : a.dir, spd = a.type === 'ram' ? 11 : 17;
      const ease = a.type === 'charge' ? (a.t < 0.08 ? a.t / 0.08 : 1) : Math.min(1, a.t / 0.3);
      P.vel.x = dir.x * spd * ease; P.vel.z = dir.z * spd * ease;
      SK.fovAdd = Math.max(SK.fovAdd, a.type === 'ram' ? 10 : 14);
      if (Math.random() < dt * 20) dust(P.pos, 1, 0.5, 0.9);
      for (const d of dummies) {
        if (d.dead) continue;
        const dp = dummyPos(d), rel = dp.clone().sub(P.pos).setY(0);
        if (rel.length() > 1.35) continue;
        const now = performance.now();
        if (a.type === 'charge') { if (a.hit.has(d)) continue; a.hit.add(d); }
        else { if (now - (a.hit.get(d) || 0) < 600) continue; a.hit.set(d, now); }
        const side = rel.clone().sub(dir.clone().multiplyScalar(rel.dot(dir))).normalize();
        hurtDummy(d, a.type === 'ram' ? 90 : 50, false, dir.clone().multiplyScalar(4.5).addScaledVector(side, 2));
        SK.shake = Math.max(SK.shake, 0.5); sfx('hit', false); hitT = 0.15; A.bodyKick.v -= 4; sparks(dp.clone().setY(1.2), 8, dir.clone().negate());
        ssfx('boom');
      }
      const blocked = Math.hypot(P.vel.x, P.vel.z) < spd * ease * 0.5 && a.t > 0.12;
      if (a.t > a.dur || blocked) {
        if (a.type === 'charge') { SK.shieldT = 1.5; P.vel.multiplyScalar(0.25); }
        if (a.type === 'ram') { aoe(P.pos, 4, 60, 5); ring(P.pos, 0xff8a3a, 0.5, 5, 0.45); SK.shake = 0.8; ssfx('boom'); SK.glow = 0; dust(P.pos, 10, 2, 1.4); }
        SK.act = null;
      }
    } else if (a.type === 'slam') {
      if (a.phase === 'rise' && P.vel.y < 1.5) { a.phase = 'fall'; a.tf = a.t; P.vel.y = -24; P.vel.x *= 0.6; P.vel.z *= 0.6; }
      if (a.phase === 'fall' && P.ground) {
        a.phase = 'land'; a.tl = a.t;
        aoe(P.pos, 4.5, 70, 6); ring(P.pos, 0xff8a3a, 0.4, 5.2, 0.5); ring(P.pos, 0xffd2a0, 0.2, 3, 0.3, 0.06, 0.15);
        dust(P.pos, 14, 2.4, 1.6); SK.shake = 1.2; ssfx('boom'); A.land.v += 3.5;
        for (let i = 0; i < 4; i++) decal(P.pos.clone().add(V((Math.random() - 0.5) * 1.5, 0.01, (Math.random() - 0.5) * 1.5)), UP);
      }
      if (a.phase === 'land') { P.vel.x *= 0.5; P.vel.z *= 0.5; if (a.t - a.tl > 0.4) SK.act = null; }
      if (a.t > 3) SK.act = null;
    } else if (a.type === 'pulse') {
      if (!a.fired && a.t > 0.16) {
        a.fired = true; ssfx('pulse');
        const c = P.pos.clone().add(V(0, 1.1, 0)).addScaledVector(aimFwd, 0.6);
        bubble(c, 0x8fdcff, 0.3, 5.5, 0.4); ring(P.pos, 0x8fdcff, 0.3, 5.5, 0.4);
        aoe(P.pos, 5.5, 40, 6); SK.shake = 0.5; A.bodyKick.v -= 3;
      }
      if (a.t > a.dur) SK.act = null;
    } else if (a.type === 'throw') {
      if (!a.fired && a.t > 0.22) {
        a.fired = true;
        if (a.zone) { const at = aimPoint.clone(); if (at.distanceTo(P.pos) > 14) at.copy(P.pos).add(aimPoint.clone().sub(P.pos).setLength(14)); at.y = groundUnder(at.x, at.z, at.y + 0.5); healZone(at); ring(at, 0xffe08a, 0.2, 3, 0.4); if (AC) { const t = AC.currentTime; tone(t, 600, 1200, 0.4, 0.2, 'triangle'); } }
        else releaseThrow(a);
      }
      if (a.t > a.dur) SK.act = null;
    } else if (a.type === 'rjump') { if (a.t > a.dur) SK.act = null;
    } else if (a.type === 'boost') {
      if (a.cleanse && !a.fired && a.t > 0.15) { a.fired = true; ring(P.pos, 0xd8fff0, 0.3, 4, 0.45); bubble(P.pos.clone().add(V(0, 1, 0)), 0xb0ffe0, 0.3, 1.6, 0.4); for (let k = 0; k < 24; k++) { const e = new THREE.Mesh(sparkGeo, new THREE.MeshBasicMaterial({ color: k % 2 ? 0xffffff : 0x9affc8 })); const an = Math.random() * 6.28; e.position.copy(P.pos).add(V(Math.cos(an) * 0.6, 0.3 + Math.random(), Math.sin(an) * 0.6)); scene.add(e); fx.push({ o: e, t: 0, life: 0.9, kind: 'ember', v: V(Math.cos(an) * 1.5, 1.8, Math.sin(an) * 1.5) }); } if (AC) { const t = AC.currentTime; tone(t, 800, 1600, 0.4, 0.2, 'triangle'); tone(t + 0.1, 1200, 2400, 0.3, 0.12); } }
      if (a.t > a.dur) SK.act = null;
    } else if (a.type === 'call') {
      if (a.mortar && a.t > 0.35 && a.n < 3 && a.t > 0.35 + a.n * 0.45) { // 박격포: 조준점 근처로 3발
        const c = a.mortar.clone().add(V((Math.random() - 0.5) * 4, 0, (Math.random() - 0.5) * 4)); c.y = groundUnder(c.x, c.z, c.y + 0.5);
        ring(c, 0xff5a3a, 3.5, 4, 1.0, 0.04, 0.08);
        spawnProj('shell', c.clone().add(V(0, 26, 0)), V(0, -30, 0), { g: 4 }); a.n++;
        if (AC) { const t = AC.currentTime; tone(t, 1600, 400, 0.8, 0.12, 'sine'); }
      }
      if (a.supply && !a.fired && a.t > 0.35) { a.fired = true; supplyDrop(); }
      if (a.nano && !a.fired && a.t > 0.35) { a.fired = true; nanoCloud(); ring(P.pos, 0x9affc8, 0.3, 4.5, 0.5); if (AC) { const t = AC.currentTime; burst(t, 1.0, 2500, 0.5, 0.4, 'bandpass'); tone(t, 400, 1600, 0.8, 0.15, 'triangle'); } }
      if (a.t > a.dur + (a.mortar ? 0.6 : 0)) SK.act = null;
    } else if (a.type === 'raise') { // 루멘 궁: 지팡이를 들어 빛의 고리
      if (!a.fired && a.t > 0.45) {
        a.fired = true; SK.shake = 0.5;
        for (let k = 0; k < 3; k++) setTimeout(() => ring(P.pos, 0xffe6a0, 0.5, 10, 0.8, 0.06 + k * 0.4, 0.12), k * 120);
        const pil = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 1.2, 12, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0xffe6a0, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
        pil.position.copy(P.pos).add(V(0, 6, 0)); scene.add(pil); fx.push({ o: pil, t: 0, life: 0.9, kind: 'pillar' });
        for (let k = 0; k < 30; k++) { const e = new THREE.Mesh(sparkGeo, new THREE.MeshBasicMaterial({ color: 0xfff0b0 })); const an = Math.random() * 6.28, r = Math.random() * 6; e.position.copy(P.pos).add(V(Math.cos(an) * r, 0.1, Math.sin(an) * r)); scene.add(e); fx.push({ o: e, t: 0, life: 1.4, kind: 'ember', v: V(0, 2 + Math.random() * 2, 0) }); }
        if (AC) { const t = AC.currentTime; tone(t, 440, 880, 1.0, 0.3, 'triangle'); tone(t, 660, 1320, 1.0, 0.2, 'triangle'); tone(t, 880, 1760, 1.0, 0.12); }
      }
      if (a.t > a.dur) SK.act = null;
    } else if (a.type === 'gslam') {
      P.vel.x *= 0.8; P.vel.z *= 0.8;
      if (!a.fired && a.t > 0.4) {
        a.fired = true; ssfx('boom'); SK.shake = 1.0; A.land.v += 2.5;
        const fw = V(-Math.sin(P.yaw), 0, -Math.cos(P.yaw)), o = P.pos.clone().addScaledVector(fw, 1.1);
        ring(o, 0xffa050, 0.2, 2.2, 0.35); dust(o, 8, 1.2, 1.3);
        for (let k = 0; k < 9; k++) { const q = o.clone().addScaledVector(fw, k * 0.85).add(V((Math.random() - 0.5) * 0.6, 0, (Math.random() - 0.5) * 0.6)); q.y = groundUnder(q.x, q.z, P.pos.y + 0.3); spike(q, 0.7 + Math.random() * 0.6, k * 0.035); }
        for (const d of dummies) {
          if (d.dead) continue;
          const rel = dummyPos(d).clone().sub(P.pos).setY(0), along = rel.dot(fw), side = Math.abs(rel.dot(V(fw.z, 0, -fw.x)));
          if (along > 0 && along < 8.8 && side < 1.6) { hurtDummy(d, 60, false, fw.clone().multiplyScalar(2).add(V(0, 0, 0))); d.knock = 0.7; }
        }
      }
      if (a.t > a.dur) SK.act = null;
    } else if (a.type === 'roar') {
      P.vel.x *= 0.8; P.vel.z *= 0.8;
      if (!a.fired && a.t > 0.28) {
        a.fired = true; SK.buff = 6; SK.shake = 0.6;
        for (let k = 0; k < 3; k++) setTimeout(() => ring(P.pos, 0xffa040, 0.5, 9, 0.7, 0.08, 0.2), k * 140);
        bubble(P.pos.clone().add(V(0, 1, 0)), 0xffb060, 0.5, 4, 0.5);
        if (AC) { const t = AC.currentTime; tone(t, 140, 90, 0.9, 0.9, 'sawtooth'); tone(t, 210, 120, 0.9, 0.5, 'sawtooth'); burst(t, 0.9, 500, 0.8, 0.8); }
      }
      if (a.t > a.dur) SK.act = null;
    } else if (a.type === 'dome') {
      P.vel.x *= 0.85; P.vel.z *= 0.85;
      if (!a.fired && a.t > 0.42) {
        a.fired = true; ssfx('dome'); SK.shake = 0.7; ring(P.pos, 0x8fdcff, 0.3, 5, 0.5); dust(P.pos, 8, 1.2, 1.2);
        const m = new THREE.Mesh(new THREE.SphereGeometry(5, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), shieldMat(0x8fdcff, [14, 5]));
        m.position.copy(P.pos); m.scale.setScalar(0.01); scene.add(m);
        if (SK.dome) scene.remove(SK.dome.m);
        SK.dome = { m, t: 0, life: 6 };
      }
      if (a.t > a.dur) SK.act = null;
    }
  }
  // 방벽: 조준 방향을 부드럽게 따라감
  const b = SK.barrier;
  if (b) {
    b.k = damp(b.k, b.on ? 1 : 0, 12, dt);
    b.yaw += wrapA(P.yaw - b.yaw) * (1 - Math.exp(-14 * dt));
    if (b.slab) { // 녹: 땅에서 솟는 석판
      const fw = V(-Math.sin(b.yaw), 0, -Math.cos(b.yaw));
      b.m.position.copy(P.pos).addScaledVector(fw, 0.95); b.m.position.y = P.pos.y - 2.4 * (1 - b.k);
      b.m.rotation.y = b.yaw; b.rune.material.opacity = 0.6 + Math.sin(performance.now() / 200) * 0.3;
    } else {
      b.m.position.copy(P.pos); b.m.rotation.y = b.yaw;
      b.m.scale.set(b.k, b.k * (0.6 + 0.4 * b.k), b.k);
      b.m.material.opacity = 0.75 + Math.sin(performance.now() / 90) * 0.05;
      b.m.material.map.offset.y -= dt * 0.05;
    }
    b.m.visible = b.k > 0.01;
  }
  if (SK.dome) {
    const d = SK.dome; d.t += dt;
    const k = d.t < 0.4 ? smooth(d.t / 0.4) : 1;
    d.m.scale.setScalar(Math.max(0.01, k));
    d.m.material.opacity = 0.5 * (d.t > d.life - 0.5 ? (d.life - d.t) / 0.5 : 1) * (0.9 + Math.sin(performance.now() / 120) * 0.1);
    d.m.material.map.offset.x += dt * 0.02;
    if (d.t > d.life) { scene.remove(d.m); SK.dome = null; }
  }
  // 래칫: 궁극기 충각 방패 / 돌진 뒤 보호막
  const ramOn = SK.act && SK.act.type === 'ram';
  if (ramOn && !SK.plate) {
    const len = 2.0, g = new THREE.CylinderGeometry(0.95, 0.95, 1.9, 20, 1, true, Math.PI - len / 2, len).translate(0, 1.0, 0);
    SK.plate = new THREE.Mesh(g, shieldMat(0xff8a3a, [4, 2.5])); scene.add(SK.plate);
  }
  if (SK.plate) {
    SK.plate.visible = ramOn; if (ramOn) { SK.plate.position.copy(P.pos); SK.plate.rotation.y = P.yaw; SK.plate.material.opacity = 0.7 + Math.sin(performance.now() / 60) * 0.15; SK.plate.material.map.offset.y += dt * 0.6; }
  }
  if (SK.shieldT > 0) {
    if (!SK.shell) { SK.shell = new THREE.Mesh(new THREE.SphereGeometry(1.15, 24, 14), shieldMat(0xffa060, [6, 3])); scene.add(SK.shell); }
    SK.shell.visible = true; SK.shell.position.copy(P.pos).setY(P.pos.y + 1.0); SK.shell.material.opacity = 0.5 * Math.min(1, SK.shieldT / 0.4);
  } else if (SK.shell) SK.shell.visible = false;
  // 래칫 궁극기: 몸에서 주황빛
  const glow = SK.act && SK.act.type === 'ram' ? 0.05 + Math.sin(performance.now() / 70) * 0.025 : (SK.shieldT > 0 ? 0.04 * SK.shieldT / 1.5 : 0);
  if (glow !== SK.lastGlow) { H.model.traverse((o) => { if (o.isMesh && o.material.emissive) { o.material.emissive.setRGB(1, 0.42, 0.1); o.material.emissiveIntensity = glow; } }); SK.lastGlow = glow; }
  // UI
  const ab = ABIL[id];
  for (const s of ['ab1', 'ab2']) {
    const el = $(s), cd = SK.cd[s], on = (id === 'orbit' || id === 'nok') && s === 'ab1' && SK.barrier && SK.barrier.on;
    el.classList.toggle('cool', cd > 0 && !on); el.classList.toggle('on', !!on);
    let cdv = cd;
    if (id === 'tick' && s === 'ab1') { cdv = SK.charges > 0 ? 0 : ABIL.tick.ab1.cd - SK.chT; el.querySelector('.nm').textContent = '순간이동 ×' + SK.charges; }
    el.classList.toggle('cool', cdv > 0 && !on);
    el.querySelector('.cdn').textContent = cdv > 0 && !on ? Math.ceil(cdv) : '';
    el.querySelector('.fill').style.height = (cdv > 0 ? cdv / ab[s].cd * 100 : 0) + '%';
  }
  const u = $('ult'); u.classList.toggle('ready', SK.ult >= 1);
  u.querySelector('.pct').textContent = SK.ult >= 1 ? 'Q' : Math.floor(SK.ult * 100) + '%';
  u.style.setProperty('--p', SK.ult * 360 + 'deg');
}

// 스킬 동작이 몸에 주는 덮어쓰기 값
function actionPose() {
  const o = { lean: 0, crouch: 0, gunW: 0, gunPos: null, gunPitch: 0, handL: null, handW: 0, twist: 0, gunDown: 0 };
  const a = SK.act; if (!a) return o;
  const t = a.t;
  if (a.type === 'charge' || a.type === 'ram') {
    const w = a.type === 'charge' ? Math.min(1, t / 0.08) * (t > a.dur - 0.1 ? Math.max(0, (a.dur - t) / 0.1) : 1) : Math.min(1, t / 0.25);
    o.lean = 0.42 * w; o.crouch = 0.08 * w; o.twist = 0.35 * w; o.gunDown = w;
  } else if (a.type === 'slam') {
    if (a.phase === 'rise') { o.gunW = smooth(Math.min(1, t / 0.25)); o.gunPitch = 1.25; o.lean = -0.15 * o.gunW; o.raise = 1; }
    else if (a.phase === 'fall') { const k = smooth(Math.min(1, (t - a.tf) / 0.12)); o.gunW = 1; o.gunPitch = lerp(1.25, -0.9, k); o.raise = 1 - k; o.lean = lerp(-0.15, 0.35, k); }
    else { const k = Math.min(1, (t - a.tl) / 0.4); o.gunW = 1 - smooth(k); o.gunPitch = -0.9; o.raise = 0; o.lean = 0.35 * (1 - k); o.crouch = 0.12 * (1 - k); }
  } else if (a.type === 'pulse') {
    const w = t < 0.12 ? smooth(t / 0.12) : t < 0.32 ? 1 : Math.max(0, 1 - (t - 0.32) / 0.2);
    o.handW = w; o.handMode = 'thrust'; o.handK = t < 0.16 ? t / 0.16 : 1; o.lean = 0.08 * w;
  } else if (a.type === 'throw') {
    const w = t < 0.1 ? smooth(t / 0.1) : t < 0.32 ? 1 : Math.max(0, 1 - (t - 0.32) / 0.18);
    o.handW = w; o.handMode = 'throw'; o.handK = smooth(clamp((t - 0.1) / 0.14, 0, 1)); o.twist = 0.25 * (1 - o.handK) * w - 0.2 * o.handK * w; o.lean = 0.1 * o.handK * w;
  } else if (a.type === 'call') {
    const w = t < 0.25 ? smooth(t / 0.25) : t > a.dur - 0.25 ? Math.max(0, (a.dur - t) / 0.25) : 1;
    o.handW = w; o.handMode = 'call'; o.handK = 1; o.lean = -0.08 * w;
  } else if (a.type === 'boost') {
    const w = t < 0.12 ? smooth(t / 0.12) : Math.max(0, 1 - (t - 0.25) / 0.2);
    o.handW = w; o.handMode = a.cleanse ? 'call' : 'thrust'; o.handK = 1;
  } else if (a.type === 'raise') {
    const w = t < 0.35 ? smooth(t / 0.35) : t > 0.9 ? Math.max(0, 1 - (t - 0.9) / 0.3) : 1;
    o.gunW = w; o.raise = 1; o.gunPitch = 1.45; o.lean = -0.12 * w;
  } else if (a.type === 'dome') {
    const up = t < 0.3 ? smooth(t / 0.3) : 1, down = t < 0.3 ? 0 : smooth(Math.min(1, (t - 0.3) / 0.14));
    const back = t > 0.65 ? smooth(Math.min(1, (t - 0.65) / 0.3)) : 0;
    o.handW = up * (1 - back); o.handMode = 'dome'; o.handK = down;
    o.crouch = 0.28 * down * (1 - back); o.lean = 0.3 * down * (1 - back) - 0.1 * up * (1 - down);
  }
  return o;
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
  const spd = P.spdMul * C.speed * (back ? 0.85 : 1) * (P.reload > 0 ? 0.9 : 1) * (SK.barrier && SK.barrier.on ? (H.id === 'nok' ? 0.65 : 0.7) : 1) * (SK.buff > 0 ? 1.1 : 1) * (SK.act && SK.act.type === 'dome' ? 0.3 : 1);
  if (wish.lengthSq() > 0) wish.normalize().multiplyScalar(spd);
  const accel = P.ground ? 12 : 2.5;
  const moveLock = SK.act && ['slam', 'charge', 'ram'].includes(SK.act.type);
  if (!moveLock) {
    P.vel.x += (wish.x - P.vel.x) * Math.min(1, accel * dt);
    P.vel.z += (wish.z - P.vel.z) * Math.min(1, accel * dt);
  }
  updateSkills(dt); updateProjs(dt); updateZones(dt);
  supportRmb(dt);
  $('flashov').style.opacity = Math.max(0, (+$('flashov').style.opacity || 0) - dt * 1.2);
  if (!moveLock && P.ground && (keys.Space && locked || window.__jump)) { P.vel.y = 7.2; P.ground = false; A.crouchJ.v -= 1.2; window.__jump = 0; }
  P.vel.y -= 19 * dt;
  const wasAir = !P.ground, vy = P.vel.y;
  P.pos.addScaledVector(P.vel, dt);
  collide(P.pos, P.vel);
  if (wasAir && P.ground) { sfx('land', C.heavy); A.land.v += Math.min(2.2, -vy * 0.22); }
  P.cool = Math.max(0, P.cool - dt);
  if (P.swing >= 0) { P.swing += dt; if (!P.swingHit && P.swing > 0.31) { P.swingHit = true; meleeHit(); } if (P.swing > 0.85) P.swing = -1; }
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
  camera.position.copy(camPos).add(V(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(SK.shake * 0.12)); camera.quaternion.copy(camQ);
  if (Math.abs(camera.fov - 70 - SK.fovAdd) > 0.05) { camera.fov = 70 + SK.fovAdd; camera.updateProjectionMatrix(); }
  if (showT > 0.001) camera.quaternion.slerp(new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(camPos, P.pos.clone().add(V(0, 1.05, 0)), UP)), showT);
  camera.updateMatrixWorld();
  const cd = V(0, 0, -1).applyQuaternion(camQ);
  aimPoint = castRay(head.clone().add(cam), cd).p;
  if (aimPoint.distanceTo(P.pos) < 2.5) aimPoint = head.clone().addScaledVector(cd, 30);
  // 과녁
  for (const d of dummies) {
    d.t += dt;
    if (d.dead > 0) { d.dead -= dt; d.fall = Math.min(1, d.fall + dt * 4); if (d.dead <= 0) { d.dead = 0; d.hp = d.max; d.fall = 0; } }
    d.kv.addScaledVector(d.ko, -45 * dt); d.kv.multiplyScalar(Math.exp(-5 * dt)); d.ko.addScaledVector(d.kv, dt); d.ko.y = 0;
    if (d.ko.length() > 2.5) d.ko.setLength(2.5);
    d.g.position.set(d.x + (d.move && !d.dead ? Math.sin(d.t * 0.9) * d.move : 0) + d.ko.x, 0, d.z + d.ko.z);
    d.top.rotation.z = -d.kv.x * 0.08; 
    d.knock = Math.max(0, d.knock - dt * 1.5);
    d.top.rotation.x = -d.fall * 1.45 - d.knock;
    d.flash = Math.max(0, d.flash - dt);
    if (d.blind > 0) { d.blind -= dt; d.t -= dt; d.top.rotation.y = Math.sin(performance.now() / 60) * 0.15; } else d.top.rotation.y = 0;
    d.mat.emissive.setRGB(d.flash > 0 ? 1 : 0, d.flash > 0 ? 0.25 : 0, d.flash > 0 ? 0.2 : 0);
    d.mat.color.setHex(d.dead ? 0x6b7080 : 0xd8dde6);
  }
  // 효과
  flash.visible = (flash.userData.t -= dt) > 0;
  flashLight.intensity *= Math.pow(0.0005, dt);
  for (let i = fx.length - 1; i >= 0; i--) {
    const f = fx[i]; f.t += dt;
    if (f.kind === 'tracer' || f.kind === 'beam') { f.o.material.opacity = 0.85 * (1 - f.t / f.life); if (f.kind === 'beam') f.o.scale.x = f.o.scale.y = 0.025 * (1 - f.t / f.life); }
    if (f.kind === 'ring' || f.kind === 'bubble') { const k = 1 - Math.pow(1 - f.t / f.life, 3), r = lerp(f.r0, f.r1, k); f.o.scale.set(r, f.kind === 'ring' ? 1 : r, r); f.o.material.opacity = 0.9 * (1 - f.t / f.life); }
    if (f.kind === 'dust') { f.o.position.addScaledVector(f.v, dt); f.v.multiplyScalar(Math.exp(-3 * dt)); f.o.scale.setScalar(f.size * (0.4 + f.t * 1.4)); f.o.material.opacity = 1 - f.t / f.life; }
    if (f.kind === 'light') f.o.intensity *= Math.pow(0.002, dt);
    if (f.kind === 'pillar') { f.o.material.opacity = 0.5 * (1 - f.t / f.life); f.o.scale.set(1 + f.t, 1, 1 + f.t); }
    if (f.kind === 'ghost') f.o.traverse((o) => { if (o.isMesh) o.material.opacity = 0.5 * (1 - f.t / f.life); });
    if (f.kind === 'spike') { const k = f.t < 0 ? 0 : f.t < 0.12 ? smooth(f.t / 0.12) : f.t > f.life - 0.35 ? (f.life - f.t) / 0.35 : 1; f.o.position.y = f.y0 - f.h / 2 + f.h * 0.85 * k; }
    if (f.kind === 'ember') { f.o.position.addScaledVector(f.v, dt); f.o.scale.setScalar(1 - f.t / f.life); }
    if (f.kind === 'spark') { f.v.y -= 14 * dt; f.o.position.addScaledVector(f.v, dt); f.o.scale.setScalar(1 - f.t / f.life); }
    if (f.kind === 'num') {
      const p = f.p.clone().add(V(f.dx * f.t, f.t * 0.9, 0)).project(camera);
      f.el.style.left = ((p.x + 1) / 2 * innerWidth) + 'px'; f.el.style.top = ((1 - p.y) / 2 * innerHeight) + 'px';
      f.el.style.opacity = 1 - Math.max(0, f.t - 0.5) / 0.3; f.el.style.display = p.z < 1 ? 'block' : 'none';
    }
    if (f.t >= f.life) { if (f.o && f.keep) { f.o.visible = false; } else if (f.o) { scene.remove(f.o); if (f.kind === 'tracer' || f.kind === 'ring' || f.kind === 'bubble' || f.kind === 'pillar') f.o.geometry.dispose(); } if (f.el) f.el.remove(); fx.splice(i, 1); }
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
  if (H && !switching && !window.__pause) { update(dt); poseHero(dt); }
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

const first = new URLSearchParams(location.search).get('hero') || 'ratchet';
setHero(HEROES[first] ? first : 'ratchet').then(() => {
  $('go').textContent = '시작'; $('load').textContent = '1 ~ 8 키로 영웅 바꾸기';
  getHero(first === 'orbit' ? 'ratchet' : 'orbit').catch(() => {}); // 다른 영웅 미리 받기
}).catch((e) => { $('go').textContent = '불러오기 실패'; $('load').textContent = String(e); console.error(e); });
frame();

window.__rt = { meleeStart: () => { P.cool = 0; fire(); }, P, A, get H() { return H; }, dummies, pickHero, fire: () => { P.cool = 0; fire(); }, set showcase(v) { showcase = v; }, setSim: (v) => { window.__sim = v; }, reload: startReload, SK, useSkill,
  step(n, dt = 1 / 30) { for (let i = 0; i < n; i++) { update(dt); poseHero(dt); } renderer.render(scene, camera); }, pause(v) { window.__pause = v; } };
