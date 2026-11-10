// 래칫 시험장 — 파츠별 뼈 모델 + 따로 만든 산탄총을 손에 쥐고 걷기·점프·사격
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
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -18, right: 18, top: 18, bottom: -18, near: 1, far: 70 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);
const rim = new THREE.DirectionalLight(0x7fb8ff, 0.9); rim.position.set(-10, 6, 12); scene.add(rim);

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

const boxes = []; // {min, max, mesh}
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
// 바깥 벽
for (const [x, z, w, d] of [[0, -40, 80, 1], [0, 40, 80, 1], [-40, 0, 1, 80], [40, 0, 1, 80]]) box(x, z, w, 4, d, MAT.wall);
// 엄폐물·발판
box(-6, -8, 2, 1.2, 2); box(-3.8, -8.4, 1.4, 0.8, 1.4); box(6, -10, 2.4, 1.6, 2.4); box(8, -14, 6, 0.6, 3, MAT.teal);
box(-10, -16, 4, 2.4, 1, MAT.wall); box(0, -18, 8, 1.1, 1, MAT.wall); box(12, -4, 1.2, 1.2, 1.2);
box(-12, -4, 3, 0.5, 3, MAT.teal); box(-12, -4, 2, 0.5, 2, MAT.teal, 0.5); box(-12, -4, 1, 0.5, 1, MAT.teal, 1.0);
box(0, 8, 3, 0.4, 3, MAT.teal); box(-16, 10, 2, 3, 2, MAT.wall); box(16, 10, 2, 3, 2, MAT.wall);
for (let i = 0; i < 6; i++) { const m = box(-15 + i * 6, -30, 0.3, 0.3, 0.3, MAT.glow); m.castShadow = false; }

// ───────── 과녁 로봇 ─────────
const dummies = [];
const dMat = () => new THREE.MeshStandardMaterial({ color: 0xd8dde6, roughness: 0.55, metalness: 0.1 });
function dummy(x, z, move = 0) {
  const g = new THREE.Group(); g.position.set(x, 0, z);
  const mat = dMat(), red = new THREE.MeshStandardMaterial({ color: 0xff4b4b, emissive: 0xff2020, emissiveIntensity: 0.6 });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 0.15, 20), MAT.wall); base.position.y = 0.075;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.5, 8), MAT.wall); pole.position.y = 0.4;
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.36, 0.7, 6, 16), mat); body.position.y = 1.1;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 20, 14), mat); head.position.y = 1.78;
  const eye = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 0.05), red); eye.position.set(0, 1.8, 0.2);
  const top = new THREE.Group(); top.add(body, head, eye);
  for (const m of [base, pole, body, head]) { m.castShadow = true; m.receiveShadow = true; }
  g.add(base, pole, top); scene.add(g);
  const d = { g, top, mat, hp: 360, max: 360, x, z, move, t: Math.random() * 6, dead: 0, flash: 0, fall: 0 };
  dummies.push(d); return d;
}
dummy(-4, -14); dummy(3, -12); dummy(0, -24, 4); dummy(-9, -22, 3); dummy(9, -22); dummy(12, -9, 2); dummy(-14, -10);
function dummySpheres(d) {
  const p = d.g.position;
  return [
    { c: new THREE.Vector3(p.x, 0.8, p.z), r: 0.38, crit: false },
    { c: new THREE.Vector3(p.x, 1.15, p.z), r: 0.38, crit: false },
    { c: new THREE.Vector3(p.x, 1.42, p.z), r: 0.36, crit: false },
    { c: new THREE.Vector3(p.x, 1.78, p.z), r: 0.24, crit: true },
  ];
}

// ───────── 소리 ─────────
let AC = null, master;
function audio() {
  if (AC) return AC;
  AC = new (window.AudioContext || window.webkitAudioContext)();
  master = AC.createDynamicsCompressor(); master.connect(AC.destination);
  return AC;
}
function noiseBuf(len) {
  const b = AC.createBuffer(1, AC.sampleRate * len, AC.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}
function burst(t0, len, f, q, g0, type = 'lowpass') {
  const s = AC.createBufferSource(); s.buffer = noiseBuf(len);
  const fl = AC.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
  const g = AC.createGain(); g.gain.setValueAtTime(g0, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + len);
  s.connect(fl); fl.connect(g); g.connect(master); s.start(t0);
}
function thump(t0, f0, f1, len, g0) {
  const o = AC.createOscillator(); o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(f1, t0 + len);
  const g = AC.createGain(); g.gain.setValueAtTime(g0, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + len);
  o.connect(g); g.connect(master); o.start(t0); o.stop(t0 + len);
}
const SFX = {
  shot() { if (!AC) return; const t = AC.currentTime; burst(t, 0.06, 6000, 0.7, 0.9, 'highpass'); burst(t, 0.35, 1400, 0.8, 1.2); thump(t, 120, 38, 0.3, 1.1);
    burst(t + 0.38, 0.05, 2500, 3, 0.35, 'bandpass'); burst(t + 0.5, 0.06, 1800, 3, 0.4, 'bandpass'); },
  hit(crit) { if (!AC) return; const t = AC.currentTime; thump(t, crit ? 1700 : 1150, crit ? 1500 : 900, 0.07, 0.25); },
  kill() { if (!AC) return; const t = AC.currentTime; thump(t, 600, 1200, 0.18, 0.35); thump(t + 0.08, 900, 1800, 0.2, 0.25); },
  reload(i) { if (!AC) return; const t = AC.currentTime; burst(t, 0.05, 3200 - i * 100, 4, 0.35, 'bandpass'); },
  step() { if (!AC) return; const t = AC.currentTime; burst(t, 0.07, 300, 1, 0.22); },
  land() { if (!AC) return; const t = AC.currentTime; thump(t, 90, 40, 0.15, 0.6); burst(t, 0.12, 500, 1, 0.4); },
};

// ───────── 모델 ─────────
const loader = new GLTFLoader();
const load = (u) => new Promise((res, rej) => loader.load(u, res, undefined, rej));
const HERO = { model: null, bones: {}, rest: {}, dirs: {}, len: {} };
let gun = null, gunMuzzle = null, gunGripL = null;
const GUN_SCALE = 0.95;
// 블렌더에서 잰 관절 위치(Blender 좌표) — 손끝·발끝·머리끝 방향용
const J = {
  handend_R: [0.593, 0.166, 0.546], handend_L: [-0.611, 0.152, 0.538],
  foot_R: [0.265, -0.004, 0.0], foot_L: [-0.234, 0.039, 0.001], headtop: [-0.012, 0.038, 1.9],
};
const b2t = (a) => new THREE.Vector3(a[0], a[2], -a[1]);

const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3();
const wpos = (o, out = new THREE.Vector3()) => o.getWorldPosition(out);
const wquat = (o, out = new THREE.Quaternion()) => o.getWorldQuaternion(out);
function rotWorld(bone, q) {
  const pq = wquat(bone.parent, new THREE.Quaternion());
  const wq = pq.clone().multiply(bone.quaternion);
  bone.quaternion.copy(pq.invert().multiply(q.clone().multiply(wq)));
  bone.updateMatrixWorld(true);
}
function rotAxis(bone, axisW, ang) { if (Math.abs(ang) > 1e-5) rotWorld(bone, _q2.setFromAxisAngle(axisW, ang)); }
function boneDir(name) { return HERO.dirs[name].clone().applyQuaternion(wquat(HERO.bones[name])).normalize(); }
function aimBone(name, dirW, amt = 1) {
  const q = new THREE.Quaternion().setFromUnitVectors(boneDir(name), dirW.clone().normalize());
  if (amt < 1) q.slerp(new THREE.Quaternion(), 1 - amt);
  rotWorld(HERO.bones[name], q);
  return q;
}
// 두 뼈 IK: 위팔·아래팔을 돌려 손목이 target에 닿게 (pole = 팔꿈치가 향할 쪽)
function ik2(upper, lower, target, pole) {
  const A = wpos(HERO.bones[upper]), B = wpos(HERO.bones[lower]);
  const l1 = HERO.len[upper], l2 = HERO.len[lower];
  const AT = target.clone().sub(A); let d = AT.length();
  d = Math.min(Math.max(d, Math.abs(l1 - l2) + 0.01), l1 + l2 - 0.005);
  const dir = AT.normalize();
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const pd = pole.clone().sub(dir.clone().multiplyScalar(pole.dot(dir))).normalize();
  const E = A.clone().add(dir.clone().multiplyScalar(a)).add(pd.multiplyScalar(h));
  aimBone(upper, E.clone().sub(A));
  const E2 = wpos(HERO.bones[lower]);
  aimBone(lower, A.clone().add(dir.clone().multiplyScalar(d)).sub(E2));
  return B;
}

async function loadAll() {
  const [h, g] = await Promise.all([load('assets/play/ratchet.glb'), load('assets/play/shotgun.glb')]);
  const m = h.scene;
  m.traverse((o) => {
    if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; }
    if (o.isBone) HERO.bones[o.name] = o;
  });
  scene.add(m); m.updateMatrixWorld(true);
  HERO.model = m;
  for (const [n, b] of Object.entries(HERO.bones)) HERO.rest[n] = b.quaternion.clone();
  // 각 뼈의 "자식 쪽 방향"을 뼈 로컬로 저장
  const child = { upperarm_R: 'forearm_R', forearm_R: 'hand_R', upperarm_L: 'forearm_L', forearm_L: 'hand_L', thigh_R: 'shin_R', thigh_L: 'shin_L', spine: 'head' };
  const tipW = { hand_R: b2t(J.handend_R), hand_L: b2t(J.handend_L), shin_R: b2t(J.foot_R), shin_L: b2t(J.foot_L), head: b2t(J.headtop) };
  for (const n of Object.keys(HERO.bones)) {
    const p = wpos(HERO.bones[n]);
    let t = child[n] ? wpos(HERO.bones[child[n]]) : tipW[n];
    if (!t) continue;
    const v = t.clone().sub(p);
    HERO.len[n] = v.length();
    HERO.dirs[n] = v.normalize().applyQuaternion(wquat(HERO.bones[n]).invert());
  }
  gun = g.scene; gun.scale.setScalar(GUN_SCALE);
  gun.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  gunMuzzle = gun.getObjectByName('Muzzle'); gunGripL = gun.getObjectByName('Grip_L');
  scene.add(gun);
}

// ───────── 플레이어 ─────────
const P = { pos: new THREE.Vector3(0, 0, 4), vel: new THREE.Vector3(), yaw: Math.PI, pitch: 0, ground: true,
  phase: 0, mag: 6, cool: 0, reload: 0, recoil: 0, kick: 0, step: 0, lean: 0, shots: 0, hits: 0, kills: 0, speed: 0 };
P.yaw = 0;
const keys = {};
let locked = false, showcase = 0, showT = 0, started = false;
addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'KeyR') startReload();
  if (e.code === 'KeyT') showcase = showcase ? 0 : 1;
  if (e.code === 'Space') e.preventDefault();
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
addEventListener('mousemove', (e) => {
  if (!locked) return;
  P.yaw -= e.movementX * 0.0022; P.pitch -= e.movementY * 0.0022;
  P.pitch = Math.max(-1.2, Math.min(1.25, P.pitch));
});
let mouseDown = false;
addEventListener('mousedown', (e) => { if (locked && e.button === 0) mouseDown = true; });
addEventListener('mouseup', (e) => { if (e.button === 0) mouseDown = false; });
document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === canvas;
  $('start').style.display = locked ? 'none' : 'grid';
  if (!locked) mouseDown = false;
});
$('start').addEventListener('click', () => { if (!HERO.model) return; audio(); started = true; try { canvas.requestPointerLock(); } catch (e) {} });

const R = 0.5;
function collide(p, vel) {
  P.ground = false;
  if (p.y <= 0) { p.y = 0; if (vel.y < 0) vel.y = 0; P.ground = true; }
  for (const b of boxes) {
    if (p.x + R < b.min.x || p.x - R > b.max.x || p.z + R < b.min.z || p.z - R > b.max.z) continue;
    const top = b.max.y;
    if (p.y >= top - 0.45 && vel.y <= 0.01) { // 위에 올라섬(작은 턱은 자동으로)
      if (p.y < top + 0.05) { p.y = top; vel.y = 0; P.ground = true; }
      continue;
    }
    if (p.y + 2 < b.min.y) continue;
    // 옆으로 밀어내기 (가장 얕은 축)
    const dx1 = b.max.x - (p.x - R), dx2 = (p.x + R) - b.min.x, dz1 = b.max.z - (p.z - R), dz2 = (p.z + R) - b.min.z;
    const m = Math.min(dx1, dx2, dz1, dz2);
    if (m === dx1) p.x += dx1; else if (m === dx2) p.x -= dx2; else if (m === dz1) p.z += dz1; else p.z -= dz2;
  }
}

function startReload() { if (P.reload > 0 || P.mag >= 6) return; P.reload = 0.0001; P.reloadStep = 0; }

// ───────── 효과 ─────────
const fx = [];
const flashTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,230,1)'); r.addColorStop(0.3, 'rgba(255,190,90,.9)'); r.addColorStop(1, 'rgba(255,120,30,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
})();
const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
flash.scale.setScalar(0.9); flash.visible = false; scene.add(flash);
const flashLight = new THREE.PointLight(0xffb060, 0, 9, 2); scene.add(flashLight);
const tracerMat = new THREE.LineBasicMaterial({ color: 0xffd28a, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending });
const sparkMat = new THREE.MeshBasicMaterial({ color: 0xffc070 });
const sparkGeo = new THREE.SphereGeometry(0.035, 4, 3);
const decalMat = new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.75, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
const decalGeo = new THREE.CircleGeometry(0.05, 8);
const decals = [];
function tracer(a, b) {
  const g = new THREE.BufferGeometry().setFromPoints([a, b]);
  const l = new THREE.Line(g, tracerMat.clone()); scene.add(l);
  fx.push({ o: l, t: 0, life: 0.07, kind: 'tracer' });
}
function sparks(p, n, normal) {
  for (let i = 0; i < n; i++) {
    const s = new THREE.Mesh(sparkGeo, sparkMat); s.position.copy(p); scene.add(s);
    const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).multiplyScalar(5);
    if (normal) v.addScaledVector(normal, 3);
    fx.push({ o: s, t: 0, life: 0.25 + Math.random() * 0.2, kind: 'spark', v });
  }
}
function decal(p, n) {
  const d = new THREE.Mesh(decalGeo, decalMat); d.position.copy(p).addScaledVector(n, 0.005);
  d.lookAt(p.clone().add(n)); scene.add(d); decals.push(d);
  if (decals.length > 160) scene.remove(decals.shift());
}
function dmgNumber(p, n, crit) {
  const el = document.createElement('div'); el.className = 'dmg' + (crit ? ' crit' : ''); el.textContent = n;
  document.body.appendChild(el);
  fx.push({ el, p: p.clone(), t: 0, life: 0.8, kind: 'num', dx: (Math.random() - 0.5) * 0.6 });
}
let hitT = 0;
function hitMarker(crit) { const h = $('hit'); h.className = crit ? 'crit' : ''; hitT = 0.15; }

// ───────── 사격 ─────────
const ray = new THREE.Raycaster();
function castRay(o, d, maxD = 120) {
  let best = { t: maxD, kind: null };
  const r = new THREE.Ray(o, d), tmp = new THREE.Vector3();
  for (const b of boxes) {
    const hit = r.intersectBox(new THREE.Box3(b.min, b.max), tmp);
    if (hit) { const t = hit.distanceTo(o); if (t < best.t) best = { t, kind: 'box', box: b, p: hit.clone() }; }
  }
  if (o.y + d.y * maxD < 0 || o.y > 0) {
    const tf = -o.y / d.y; if (tf > 0 && tf < best.t) best = { t: tf, kind: 'floor', p: o.clone().addScaledVector(d, tf) };
  }
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
  if (Math.abs(p.x - b.min.x) < e) return new THREE.Vector3(-1, 0, 0);
  if (Math.abs(p.x - b.max.x) < e) return new THREE.Vector3(1, 0, 0);
  if (Math.abs(p.z - b.min.z) < e) return new THREE.Vector3(0, 0, -1);
  if (Math.abs(p.z - b.max.z) < e) return new THREE.Vector3(0, 0, 1);
  if (Math.abs(p.y - b.max.y) < e) return new THREE.Vector3(0, 1, 0);
  return new THREE.Vector3(0, -1, 0);
}
let aimPoint = new THREE.Vector3();
function fire() {
  if (P.cool > 0 || P.reload > 0) return;
  if (P.mag <= 0) { startReload(); return; }
  P.mag--; P.cool = 0.85; P.kick = 1; P.shots++;
  SFX.shot();
  const mz = wpos(gunMuzzle);
  flash.position.copy(mz); flash.visible = true; flash.material.rotation = Math.random() * 6; flash.userData.t = 0.05;
  flashLight.position.copy(mz); flashLight.intensity = 30;
  const camDir = new THREE.Vector3(); camera.getWorldDirection(camDir);
  const right = new THREE.Vector3().crossVectors(camDir, camera.up).normalize(), up = new THREE.Vector3().crossVectors(right, camDir);
  let total = 0, anyCrit = false, hitDummy = null;
  const perDummy = new Map();
  for (let i = 0; i < 10; i++) {
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * 0.075;
    const dir = camDir.clone().addScaledVector(right, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r).normalize();
    const cam = castRay(camera.position, dir);          // 화면 기준으로 맞을 곳
    const toP = cam.p.clone().sub(mz); const dist = toP.length(); toP.normalize();
    const h = castRay(mz, toP, dist + 0.05);           // 총구에서 실제로 날아감
    tracer(mz.clone().addScaledVector(toP, 0.3), h.p);
    if (h.kind === 'dummy') {
      const fall = Math.max(0.3, 1 - Math.max(0, h.t - 8) / 20);
      const dmg = Math.round(9 * fall * (h.crit ? 2 : 1));
      perDummy.set(h.d, (perDummy.get(h.d) || 0) + dmg); total += dmg; anyCrit ||= h.crit; hitDummy = h;
      sparks(h.p, 2, toP.clone().negate());
    } else if (h.kind === 'box') { const n = boxNormal(h.box, h.p); decal(h.p, n); sparks(h.p, 2, n); }
    else if (h.kind === 'floor') { decal(h.p, new THREE.Vector3(0, 1, 0)); sparks(h.p, 1, new THREE.Vector3(0, 1, 0)); }
  }
  for (const [d, dmg] of perDummy) {
    d.hp -= dmg; d.flash = 0.12; d.knock = 0.25;
    dmgNumber(new THREE.Vector3(d.g.position.x, 2.2, d.g.position.z), dmg, anyCrit);
    if (d.hp <= 0 && !d.dead) { d.dead = 3; P.kills++; SFX.kill(); }
  }
  if (total > 0) { P.hits++; SFX.hit(anyCrit); hitMarker(anyCrit); }
  $('last').textContent = total;
  $('kills').textContent = P.kills;
  $('acc').textContent = Math.round((P.hits / P.shots) * 100) + '%';
  $('cross').firstElementChild.style.transform = 'scale(1.45)';
}

// ───────── 자세(애니메이션) ─────────
const UP = new THREE.Vector3(0, 1, 0);
function poseHero(dt) {
  const B = HERO.bones, m = HERO.model;
  for (const n in B) B[n].quaternion.copy(HERO.rest[n]);
  const t = performance.now() / 1000;
  // 몸 위치·방향
  const fwd = new THREE.Vector3(-Math.sin(P.yaw), 0, -Math.cos(P.yaw));
  const right = new THREE.Vector3(Math.cos(P.yaw), 0, -Math.sin(P.yaw));
  const hv = new THREE.Vector3(P.vel.x, 0, P.vel.z); const sp = hv.length();
  const amp = Math.min(1, sp / 5.2);
  P.phase += dt * sp * 1.55;
  const bob = P.ground ? (Math.abs(Math.cos(P.phase)) - 0.6) * 0.07 * amp : 0;
  m.position.set(P.pos.x, P.pos.y + bob, P.pos.z);
  m.rotation.set(0, P.yaw, 0);
  m.updateMatrixWorld(true);
  // 이동 방향(로컬) -> 다리 흔드는 축
  const dirW = sp > 0.3 ? hv.clone().normalize() : fwd.clone();
  const swingAxis = new THREE.Vector3().crossVectors(dirW, UP).normalize();
  const sw = Math.sin(P.phase);
  if (P.ground) {
    const A = 0.62 * amp;
    rotAxis(B.thigh_R, swingAxis, sw * A); rotAxis(B.thigh_L, swingAxis, -sw * A);
    rotAxis(B.shin_R, right, -Math.max(0, Math.cos(P.phase)) * A * 1.5);
    rotAxis(B.shin_L, right, -Math.max(0, -Math.cos(P.phase)) * A * 1.5);
    rotAxis(B.hips, dirW, 0); rotAxis(B.hips, fwd, sw * 0.05 * amp);
    // 발소리
    const s = Math.sign(sw); if (amp > 0.3 && s !== P.step) { P.step = s; SFX.step(); }
  } else {
    rotAxis(B.thigh_R, right, 0.55); rotAxis(B.thigh_L, right, 0.25);
    rotAxis(B.shin_R, right, -0.9); rotAxis(B.shin_L, right, -0.6);
  }
  // 상체: 오른손잡이 사격 자세(왼어깨 앞으로) + 위아래 조준 + 이동 방향으로 살짝 기울임
  const localSide = hv.dot(right) / 5.2;
  P.lean += (localSide * 0.1 - P.lean) * Math.min(1, dt * 8);
  const breathe = Math.sin(t * 2.1) * 0.012;
  rotAxis(B.spine, UP, -0.4);
  rotAxis(B.spine, right, P.pitch * 0.5 + breathe - 0.04);
  rotAxis(B.spine, fwd, -P.lean);
  // 머리는 정면을 보게
  rotAxis(B.head, UP, 0.4); rotAxis(B.head, right, P.pitch * 0.35);
  m.updateMatrixWorld(true);
  // 총: 가슴 앞, 조준점을 향함
  const pivot = wpos(B.spine).add(new THREE.Vector3(0, 0.25, 0));
  const aimQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(P.pitch, P.yaw, 0, 'YXZ'));
  const off = new THREE.Vector3(0.24, -0.22, -0.4 + P.kick * 0.12).applyQuaternion(aimQ);
  gun.position.copy(pivot).add(off);
  const look = new THREE.Matrix4().lookAt(gun.position, aimPoint, UP);
  gun.quaternion.setFromRotationMatrix(look);
  gun.rotateX(P.kick * 0.32);
  // 장전 중엔 총구를 조금 내림
  if (P.reload > 0) gun.rotateX(-0.35), gun.rotateZ(0.25);
  gun.updateMatrixWorld(true);
  const gq = gun.quaternion, gUp = new THREE.Vector3(0, 1, 0).applyQuaternion(gq), gFwd = new THREE.Vector3(0, 0, -1).applyQuaternion(gq), gRt = new THREE.Vector3(1, 0, 0).applyQuaternion(gq);
  // 오른손: 손잡이를 쥠
  const dR = gUp.clone().multiplyScalar(-0.85).addScaledVector(gFwd, 0.45).normalize();
  const gripR = gun.position.clone().addScaledVector(gUp, -0.03);
  const wristR = gripR.clone().addScaledVector(dR, -0.13).addScaledVector(gRt, 0.05);
  ik2('upperarm_R', 'forearm_R', wristR, right.clone().multiplyScalar(1).addScaledVector(UP, -0.9).addScaledVector(fwd, -0.3));
  aimBone('hand_R', dR);
  // 왼손: 펌프 아래를 받침 (장전 때는 펌프를 당기는 동작)
  let pump = 0; if (P.cool > 0.35 && P.cool < 0.65) pump = Math.sin((0.65 - P.cool) / 0.3 * Math.PI) * 0.12;
  if (P.reload > 0) pump = 0;
  const gl = wpos(gunGripL).addScaledVector(gFwd, -pump);
  const dL = gRt.clone().multiplyScalar(0.75).addScaledVector(gFwd, 0.5).addScaledVector(gUp, 0.2).normalize();
  const wristL = gl.clone().addScaledVector(gUp, -0.07).addScaledVector(dL, -0.12).addScaledVector(gRt, -0.04);
  ik2('upperarm_L', 'forearm_L', wristL, right.clone().multiplyScalar(-1).addScaledVector(UP, -1.1));
  aimBone('hand_L', dL);
  // 어깨 보호대는 팔 움직임을 조금만 따라감
  for (const s of ['R', 'L']) {
    const ua = B['upperarm_' + s], pad = B['pad_' + s];
    const restW = wquat(ua.parent).multiply(HERO.rest['upperarm_' + s]);
    const delta = wquat(ua).multiply(restW.invert());
    rotWorld(pad, new THREE.Quaternion().slerp(delta, 0.35));
  }
}

// ───────── 루프 ─────────
const clock = new THREE.Clock();
function update(dt) {
  // 이동
  const fwd = new THREE.Vector3(-Math.sin(P.yaw), 0, -Math.cos(P.yaw));
  const right = new THREE.Vector3(Math.cos(P.yaw), 0, -Math.sin(P.yaw));
  const wish = new THREE.Vector3();
  if (locked) {
    if (keys.KeyW) wish.add(fwd); if (keys.KeyS) wish.sub(fwd);
    if (keys.KeyD) wish.add(right); if (keys.KeyA) wish.sub(right);
  }
  if (window.__sim) wish.add(window.__sim);
  const spd = keys.ShiftLeft ? 2.6 : 5.2;
  if (wish.lengthSq() > 0) wish.normalize().multiplyScalar(spd * (keys.KeyS && !keys.KeyW ? 0.85 : 1));
  const accel = P.ground ? 14 : 3;
  P.vel.x += (wish.x - P.vel.x) * Math.min(1, accel * dt);
  P.vel.z += (wish.z - P.vel.z) * Math.min(1, accel * dt);
  if (P.ground && keys.Space && locked) { P.vel.y = 7.2; P.ground = false; }
  P.vel.y -= 19 * dt;
  const wasAir = !P.ground;
  P.pos.addScaledVector(P.vel, dt);
  collide(P.pos, P.vel);
  if (wasAir && P.ground) SFX.land();
  // 사격·장전
  P.cool = Math.max(0, P.cool - dt);
  P.kick = Math.max(0, P.kick - dt * 5);
  if (mouseDown) fire();
  if (P.reload > 0) {
    P.reload += dt;
    if (P.reload > 0.35 + P.reloadStep * 0.42) { P.mag++; P.reloadStep++; SFX.reload(P.reloadStep);
      if (P.mag >= 6 || (mouseDown && P.mag > 0)) P.reload = 0; }
  }
  $('mag').textContent = P.mag; $('reload').textContent = P.reload > 0 ? '장전 중' : (P.mag === 0 ? 'R 장전' : '');
  // 카메라
  const camQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(P.pitch + P.kick * 0.05, P.yaw, 0, 'YXZ'));
  const head = P.pos.clone().add(new THREE.Vector3(0, 1.75, 0));
  showT += ((showcase ? 1 : 0) - showT) * Math.min(1, dt * 4);
  const back = new THREE.Vector3(1.2, 0.35, 3.8).applyQuaternion(camQ);
  const camPos = head.clone().add(back);
  if (showT > 0.001) {
    const a = P.yaw + Math.sin(performance.now() / 2500) * 0.6 + (window.__ang || 0);
    const front = P.pos.clone().add(new THREE.Vector3(-Math.sin(a) * 3.2, 1.35, -Math.cos(a) * 3.2));
    camPos.lerp(front, showT);
  }
  camera.position.copy(camPos);
  camera.quaternion.copy(camQ);
  if (showT > 0.001) {
    const lq = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(camPos, P.pos.clone().add(new THREE.Vector3(0, 1.1, 0)), UP));
    camera.quaternion.slerp(lq, showT);
  }
  camera.updateMatrixWorld();
  // 조준점 (화면 가운데 광선)
  const cd = new THREE.Vector3(0, 0, -1).applyQuaternion(camQ);
  aimPoint = castRay(head.clone().add(new THREE.Vector3(1.2, 0.35, 3.8).applyQuaternion(camQ)), cd).p;
  if (aimPoint.distanceTo(P.pos) < 2.5) aimPoint = head.clone().addScaledVector(cd, 30);
  // 과녁
  for (const d of dummies) {
    d.t += dt;
    if (d.dead > 0) {
      d.dead -= dt; d.fall = Math.min(1, d.fall + dt * 4);
      if (d.dead <= 0) { d.dead = 0; d.hp = d.max; d.fall = 0; }
    }
    if (d.move && !d.dead) d.g.position.x = d.x + Math.sin(d.t * 0.9) * d.move;
    d.knock = Math.max(0, (d.knock || 0) - dt);
    d.top.rotation.x = -d.fall * 1.45 - d.knock * 0.6;
    d.flash = Math.max(0, d.flash - dt);
    d.mat.emissive.setRGB(d.flash > 0 ? 1 : 0, d.flash > 0 ? 0.25 : 0, d.flash > 0 ? 0.2 : 0);
    d.mat.color.setHex(d.dead ? 0x6b7080 : 0xd8dde6);
  }
  // 효과
  flash.visible = (flash.userData.t -= dt) > 0;
  flashLight.intensity *= Math.pow(0.0005, dt);
  for (let i = fx.length - 1; i >= 0; i--) {
    const f = fx[i]; f.t += dt;
    if (f.kind === 'tracer') f.o.material.opacity = 0.85 * (1 - f.t / f.life);
    if (f.kind === 'spark') { f.v.y -= 14 * dt; f.o.position.addScaledVector(f.v, dt); f.o.scale.setScalar(1 - f.t / f.life); }
    if (f.kind === 'num') {
      const p = f.p.clone().add(new THREE.Vector3(f.dx * f.t, f.t * 0.9, 0)).project(camera);
      f.el.style.left = ((p.x + 1) / 2 * innerWidth) + 'px'; f.el.style.top = ((1 - p.y) / 2 * innerHeight) + 'px';
      f.el.style.opacity = 1 - Math.max(0, f.t - 0.5) / 0.3; f.el.style.display = p.z < 1 ? 'block' : 'none';
    }
    if (f.t >= f.life) { if (f.o) { scene.remove(f.o); if (f.kind === 'tracer') f.o.geometry.dispose(); } if (f.el) f.el.remove(); fx.splice(i, 1); }
  }
  hitT -= dt; $('hit').style.opacity = hitT > 0 ? 1 : 0;
  const ring = $('cross').firstElementChild; if (P.cool < 0.6) ring.style.transform = '';
  // 그림자 카메라가 플레이어를 따라감
  sun.position.set(P.pos.x + 12, 22, P.pos.z + 8); sun.target.position.copy(P.pos);
  $('cross').style.opacity = showT > 0.5 ? 0 : 1;
}

function frame() {
  const dt = Math.min(0.05, clock.getDelta());
  if (HERO.model) { update(dt); poseHero(dt); }
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight);
});

loadAll().then(() => {
  $('go').textContent = '클릭해서 시작'; $('load').textContent = '마우스로 조준 · 좌클릭 사격';
}).catch((e) => { $('go').textContent = '불러오기 실패'; $('load').textContent = String(e); console.error(e); });
frame();

// 시험용
window.__rt = { P, HERO, dummies, fire: () => { P.cool = 0; fire(); }, set showcase(v) { showcase = v; }, setSim: (v) => { window.__sim = v; } };
