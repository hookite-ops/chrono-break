// 크로노 브레이크 — 5대5 거점전. Tripo 모델 + 따로 만든 무기, 절차적 애니메이션, 영웅 스킬, 봇
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as skClone } from 'three/addons/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { boxes, moveUnit, findPath, randomFreeNear, groundAt, los, startMap, finishMap, W as WORLD } from './world.js';
import { MAPS, cityTick, buildSky } from './city.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { HEROES as HD, DIFF } from './data.js';

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
scene.fog = new THREE.FogExp2(0x2a2236, 0.012);
const camera = new THREE.PerspectiveCamera(78, innerWidth / innerHeight, 0.05, 700);
const hemi = new THREE.HemisphereLight(0xcfe3ff, 0x3a2f28, 1.1); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff1dc, 2.6);
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 1, far: 120 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);
const rim = new THREE.DirectionalLight(0x7fb8ff, 0.9); rim.position.set(-10, 6, 12); scene.add(rim);

// ───────── 하늘 · 환경광 · 후처리 ─────────
const SKY = buildSky(scene);
const pmrem = new THREE.PMREMGenerator(renderer);
{ const es = new THREE.Scene(); const sk = buildSky(es); scene.environment = pmrem.fromScene(es, 0.02).texture; }
let composer = null, bloomPass = null;
const GFX = () => (opts.gfx ?? 1);
function setupPost() {
  const q = GFX();
  renderer.setPixelRatio(Math.min(devicePixelRatio, q >= 2 ? 1.5 : 1) * (dynScale || 1));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = q >= 1;
  if (q === 0) { composer = null; return; }
  const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: q >= 2 ? 4 : 2 });
  composer = new EffectComposer(renderer, rt);
  composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(innerWidth, innerHeight);
  composer.addPass(new RenderPass(scene, camera));
  // 잘못된 밝기값(무한대·NaN)이 블룸에 번져 검은 네모가 생기는 것을 막음
  composer.addPass(new ShaderPass({
    uniforms: { tDiffuse: { value: null } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform sampler2D tDiffuse; varying vec2 vUv; void main(){ vec4 c = texture2D(tDiffuse, vUv); if (any(isnan(c)) || any(isinf(c))) c = vec4(0.0, 0.0, 0.0, 1.0); gl_FragColor = vec4(clamp(c.rgb, 0.0, 32.0), c.a); }',
  }));
  bloomPass = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.42, 0.4, 1.0);
  composer.addPass(bloomPass);
  vmPass = new RenderPass(scene, vmCam); vmPass.clear = false; vmPass.clearDepth = true; vmPass.enabled = false;
  composer.insertPass(vmPass, 1);
  composer.addPass(new OutputPass());
}
let dynScale = 1, vmPass = null, perfEma = 1 / 60, perfT = 0;
// 느린 컴퓨터면 화면 해상도를 자동으로 낮춤 (빠르면 다시 올림)
function autoScale(dt) {
  perfEma += (dt - perfEma) * 0.05; perfT += dt;
  if (perfT < 2) return; perfT = 0;
  let ns = dynScale;
  if (perfEma > 1 / 42 && dynScale > 0.55) ns = Math.max(0.55, dynScale - 0.15);
  else if (perfEma < 1 / 80 && dynScale < 1) ns = Math.min(1, dynScale + 0.1);
  if (ns === dynScale) return;
  dynScale = ns;
  const pr = Math.min(devicePixelRatio, GFX() >= 2 ? 1.5 : 1) * dynScale;
  renderer.setPixelRatio(pr); renderer.setSize(innerWidth, innerHeight);
  if (composer) { composer.setPixelRatio(pr); composer.setSize(innerWidth, innerHeight); }
}
function render() {
  const fp = PLAYER && PLAYER.H && PLAYER.H.fp;
  if (fp) updateFPClip();
  if (vmPass) vmPass.enabled = !!fp;
  if (composer) { composer.render(); return; }
  renderer.render(scene, camera);
  if (fp) { renderer.autoClear = false; renderer.clearDepth(); renderer.render(scene, vmCam); renderer.autoClear = true; }
}
function applyLook(def) {
  const L = def.look || {};
  scene.fog.color.setHex(L.fog ?? 0x2a2236); scene.fog.density = L.fogD ?? 0.012;
  hemi.color.setHex(L.hemiSky ?? 0x8c88d8); hemi.groundColor.setHex(L.hemiGround ?? 0x3a2a30); hemi.intensity = L.hemi ?? 0.85;
  sun.color.setHex(L.sunCol ?? 0xffa070); sun.intensity = L.sunI ?? 1.9;
  rim.color.setHex(L.rimCol ?? 0x6f9cff); rim.intensity = L.rimI ?? 0.7;
  scene.environmentIntensity = L.env ?? 0.55;
  renderer.toneMappingExposure = L.exposure ?? 1.15;
  const sd = def.sun || [-45, 26, -28]; sunOff.set(...sd).normalize().multiplyScalar(60);
  SKY.sunDir.copy(sunOff).normalize();
}
const sunOff = new THREE.Vector3(-45, 26, -28);

// ───────── 영웅 설정 ─────────
const HEROES = {
  ratchet: {
    name: '래칫', sub: '돌파형 탱커 · 충각판 산탄총', glb: 'assets/play/ratchet.glb', meta: 'assets/play/ratchet.json',
    gun: 'assets/play/shotgun.glb', gunScale: 0.95, speed: 5.2, wpn: 'shotgun',
    gunOff: [0.24, -0.22, -0.40], twist: 0.4, palmR: [-1, 0, 0], palmL: [1, 0, 0],
    stanceW: 0.24, stride: 1.25, lift: 0.16, crouch: 0.05, cam: [1.2, 0.35, 3.8], heavy: 1, fp: [0.25, -0.26, -0.46],
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
    stanceW: 0.16, stride: 1.4, lift: 0.17, crouch: 0.07, cam: [1.0, 0.3, 3.3], heavy: 0, fp: [0.21, -0.27, -0.58],
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
  aria: {
    name: '아리아', sub: '정밀형 딜러 · 장궁', glb: 'assets/play/aria.glb', meta: 'assets/play/aria.json',
    gun: null, bow: true, gunScale: 1.0, speed: 5.6, wpn: 'bow', hold: 'bow',
    gunOff: [-0.12, 0.0, -0.56], twist: 0.95, palmR: [0, -1, 0], palmL: [0, -1, 0],
    stanceW: 0.14, stride: 1.3, lift: 0.17, crouch: 0.06, cam: [0.95, 0.3, 3.1], heavy: 0, fp: [-0.1, -0.075, -0.64],
  },
};
const WPN = {
  shotgun: { mag: 6, rate: 0.85, pellets: 10, spread: 0.075, dmg: 9, falloff: [8, 28], reload: 'shell', kick: 1, auto: false },
  rifle: { mag: 32, rate: 0.09, pellets: 1, spread: 0.006, dmg: 9, falloff: [22, 45], reload: 'mag', kick: 0.28, auto: true },
  pistols: { mag: 40, rate: 0.085, pellets: 1, spread: 0.012, dmg: 7, falloff: [18, 40], reload: 'dual', kick: 0.2, auto: true },
  hammer: { mag: 0, rate: 0.9, melee: true, dmg: 75, range: 4.8, kick: 0, auto: true },
  launcher: { mag: 6, rate: 0.65, proj: 'grenade', speed: 21, g: 11, reload: 'mag', kick: 0.8, auto: false, spread: 0 },
  bow: { mag: 0, rate: 0.28, proj: 'arrow', speed: 82, g: 6, reload: 'none', kick: 0.25, auto: false, spread: 0, bow: true, draw: 0.75 },
  staff: { mag: 30, rate: 0.36, proj: 'bolt', speed: 48, g: 0, reload: 'mag', kick: 0.25, auto: true, spread: 0.004, beam: true },
  medpistol: { mag: 12, rate: 0.32, pellets: 1, spread: 0.004, dmg: 25, falloff: [25, 45], reload: 'mag', kick: 0.4, auto: false, dart: true },
  nanorifle: { mag: 36, rate: 0.11, pellets: 1, spread: 0.008, dmg: 8, falloff: [20, 40], reload: 'mag', kick: 0.22, auto: true },
};

// ───────── 소리 ─────────
let AC = null, master, VOL = 1;
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
  g0 *= VOL; if (g0 < 0.002) return;
  const g = AC.createGain(); g.gain.setValueAtTime(g0, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + len);
  s.connect(fl); fl.connect(g); g.connect(master); s.start(t0);
}
function tone(t0, f0, f1, len, g0, type = 'sine') {
  g0 *= VOL; if (g0 < 0.002) return;
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
  hit(crit) { const t = AC.currentTime; if (crit) { tone(t, 2400, 2300, 0.12, 0.2, 'triangle'); tone(t, 3600, 3500, 0.09, 0.08); burst(t, 0.03, 5000, 2, 0.2, 'bandpass'); } else { tone(t, 1250, 950, 0.05, 0.2, 'triangle'); burst(t, 0.025, 3000, 2, 0.15, 'bandpass'); } },
  kill() { const t = AC.currentTime; tone(t, 160, 60, 0.25, 0.6); tone(t, 880, 880, 0.12, 0.28, 'triangle'); tone(t + 0.09, 1320, 1320, 0.22, 0.26, 'triangle'); tone(t + 0.09, 2640, 2640, 0.16, 0.06); },
  click(f = 3000) { const t = AC.currentTime; burst(t, 0.04, f, 4, 0.35, 'bandpass'); },
  step(h) { const t = AC.currentTime; burst(t, 0.07, h ? 220 : 380, 1, h ? 0.3 : 0.16); },
  land(h) { const t = AC.currentTime; tone(t, 90, 40, 0.15, h ? 0.7 : 0.4); burst(t, 0.12, 500, 1, 0.4); },
};
const sfx = (n, ...a) => { if (AC) SFX[n](...a); };
// 배경 소리: 낮게 웅웅대는 도시 + 가운데로 갈수록 커지는 멈춘 시계 째깍 소리
let amb = null;
function startAmbience() {
  if (!AC || amb) return;
  const src = AC.createBufferSource(); src.buffer = noiseBuf(4); src.loop = true;
  const lp = AC.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 180;
  const g = AC.createGain(); g.gain.value = 0.05; src.connect(lp); lp.connect(g); g.connect(master); src.start();
  const hum = AC.createOscillator(); hum.frequency.value = 55; const hg = AC.createGain(); hg.gain.value = 0.012; hum.connect(hg); hg.connect(master); hum.start();
  amb = { g, hg, tickT: 0 };
}
function ambienceTick(dt, near) {
  if (!amb) return;
  amb.tickT -= dt;
  if (amb.tickT <= 0) { amb.tickT = 1; const t = AC.currentTime, v = 0.02 + 0.16 * near; burst(t, 0.03, 4200, 6, v, 'bandpass'); burst(t + 0.5, 0.03, 3200, 6, v * 0.8, 'bandpass'); if (Math.random() < 0.03) tone(t, 620, 600, 1.4, 0.03 + 0.05 * near, 'sine'); }
}

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

function startReload() { if (!H || H.W.melee || H.W.bow || P.reload > 0 || P.mag >= H.W.mag) return; P.reload = 1; P.reloadT = 0; P.shell = 0; }

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
function dmgNumber(p, n, crit, healc) {
  const el = document.createElement('div'); el.className = 'dmg' + (crit ? ' crit' : '') + (healc ? ' heal' : ''); el.textContent = n;
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
    if (b.off) continue;
    const hit = r.intersectBox(new THREE.Box3(b.min, b.max), tmp);
    if (hit) { const t = hit.distanceTo(o); if (t < best.t) best = { t, kind: 'box', box: b, p: hit.clone() }; }
  }
  if (d.y < 0) { const tf = -o.y / d.y; if (tf > 0 && tf < best.t) best = { t: tf, kind: 'floor', p: o.clone().addScaledVector(d, tf) }; }
  for (const dm of dummies) {
    if (dm.dead) continue;
    for (const s of dm.spheres) {
      const oc = o.clone().sub(s.c), bq = oc.dot(d), c = oc.lengthSq() - s.r * s.r, disc = bq * bq - c;
      if (disc < 0) continue;
      const t = -bq - Math.sqrt(disc);
      if (t > 0 && t < best.t) best = { t, kind: 'dummy', d: dm, crit: s.crit, p: o.clone().addScaledVector(d, t) };
    }
  }
  best = barrierBlock(o, d, best);
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
let recoilPos = new Spring3(260, 18), recoilRot = new Spring3(240, 16);
function fire() {
  const W = H.W;
  if (P.cool > 0 || CUR.dead || (SK.act && SK.act.noFire)) return;
  if (P.reload > 0) { if (W.reload === 'shell' && P.mag > 0) P.reload = 0; else return; }
  if (W.melee) { if (P.swing < 0 && !(SK.barrier && SK.barrier.on)) { P.swing = 0; P.swingHit = false; P.cool = W.rate; P.shots++; ssfx('whoosh'); } return; }
  if (P.mag <= 0) { startReload(); sfx('click', 1200); P.cool = 0.25; return; }
  P.mag--; P.cool = W.rate; P.shots++; P.trig = 1;
  sfx({ pistols: 'rifle', medpistol: 'rifle', nanorifle: 'rifle', launcher: 'launch', staff: 'zap' }[H.C.wpn] || H.C.wpn);
  if (W.reload === 'shell') setTimeout(() => sfx('pump'), 330);
  // 반동: 총은 뒤로·위로, 몸은 살짝 젖혀짐
  recoilPos.v.z += 2.6 * W.kick; recoilRot.v.x += 9 * W.kick; recoilRot.v.y += (Math.random() - 0.5) * 3 * W.kick;
  A.bodyKick.v += 6 * W.kick;
  P.camKick += 0.035 * W.kick + 0.006;
  let mz = wpos(H.muzzle);
  if (H.C.hold === 'dual') { P.alt = 1 - (P.alt || 0); mz = wpos(P.alt ? H.muzzle2 : H.muzzle); dualKick[P.alt].v.z += 2.5; dualKick[P.alt].v.x += 6; }
  muzzleFlash(mz);
  if (W.proj) { // 투사체 무기
    const dir = aimPoint.clone().sub(mz).normalize();
    if (W.g) { const dist = aimPoint.distanceTo(mz); dir.y += Math.min(0.5, W.g * dist / (2 * W.speed * W.speed)); dir.normalize(); }
    spawnProj(W.proj, mz, dir.multiplyScalar(W.speed), { g: W.g });
    return;
  }
  const eyeO = P.isPlayer ? camera.position.clone() : eyeOf(), camDir = P.isPlayer ? camera.getWorldDirection(V()) : aimPoint.clone().sub(eyeO).normalize();
  const right = V().crossVectors(camDir, camera.up).normalize(), up = V().crossVectors(right, camDir);
  const spread = W.spread + P.bloom + (Math.hypot(P.vel.x, P.vel.z) > 1 ? W.spread * 0.6 : 0) + (P.ground ? 0 : 0.02);
  if (W.auto) P.bloom = Math.min(0.03, P.bloom + (H.C.hold === 'dual' ? 0.0025 : 0.0035));
  let total = 0, anyCrit = false;
  const per = new Map(), toPDir = V();
  for (let i = 0; i < W.pellets; i++) {
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * spread;
    const dir = camDir.clone().addScaledVector(right, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r).normalize();
    const cam = castRay(eyeO, dir);
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
  if (total > 0) { P.hits++; hitMark(anyCrit); }
}

// ───────── 애니메이션 상태 ─────────
const newA = () => ({
  lowerYaw: 0, turning: false, phase: 0, gait: 0, speedS: 0, dir: new THREE.Vector2(0, 1),
  air: new Spring(90, 14), land: new Spring(160, 13), bodyKick: new Spring(180, 16), crouchJ: new Spring(200, 16),
  leanF: new Spring(60, 11), leanS: new Spring(60, 11), sway: new Spring3(90, 12), turnPhase: 0,
  lastU: { R: 0, L: 0 }, prevVel: V(), headLag: new Spring(70, 12), shift: 0, flinch: new Spring3(150, 11), draw: 0,
});
let A = newA();

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

// ───────── 손가락 ─────────
// 손가락마다 마디 3개. 구부리는 축 = (마디 방향 × 손바닥 방향), 쉬는 자세 기준으로 미리 계산
const FN = ['thumb', 'index', 'middle', 'ring', 'pinky'];
const FMAX = { thumb: [0.5, 0.7, 0.95], f: [1.4, 1.6, 1.0] };   // 다 쥐었을 때 각 마디 각도(라디안)
const HP = {   // [엄지, 검지, 중지, 약지, 새끼] 굽힘 0~1, sp = 벌림
  relax: { c: [0.22, 0.2, 0.26, 0.32, 0.38], sp: 0.25 },
  grip: { c: [0.62, 0.4, 0.86, 0.9, 0.94], sp: 0 },     // 방아쇠 손: 검지는 방아쇠에
  hold: { c: [0.66, 0.82, 0.86, 0.9, 0.94], sp: 0 },    // 방아쇠 없는 손잡이(지팡이)
  wrap: { c: [0.42, 0.5, 0.56, 0.62, 0.68], sp: 0.08 },  // 앞손잡이 받치기
  fist: { c: [0.78, 0.93, 0.96, 0.98, 1.0], sp: 0 },
  open: { c: [0.02, 0.02, 0.03, 0.05, 0.07], sp: 1 },
  claw: { c: [0.35, 0.4, 0.42, 0.46, 0.5], sp: 0.9 },
  pinch: { c: [0.6, 0.55, 0.8, 0.88, 0.92], sp: 0 },     // 탄 집기
  limp: { c: [0.3, 0.35, 0.42, 0.5, 0.55], sp: 0.35 },
  draw: { c: [0.72, 0.38, 0.44, 0.5, 0.88], sp: 0.05 },  // 활 시위: 검지·중지·약지 첫 마디로 걸고 엄지·새끼는 접음
};
const _fq = new THREE.Quaternion();
function buildFingers(Hh) {
  const B = Hh.B; Hh.fing = null;
  if (!B.index_01_R && !B.index_01_L) return;
  Hh.fing = {};
  const TF = Hh.meta.fingers || {};
  for (const s of 'RL') {
    const outer = B['pinky_01_' + s] ? 'pinky' : B['ring_01_' + s] ? 'ring' : null;   // 새끼 뼈가 없는 리그도 있음
    if (!B['index_01_' + s] || !outer) continue;
    const mcp = (f) => wpos(B[f + '_01_' + s]);
    const a = mcp(B['middle_01_' + s] ? 'middle' : 'index').sub(wpos(B['hand_' + s])).normalize();
    const lat = mcp('index').sub(mcp(outer)).normalize();
    const pn = V().crossVectors(a, lat).normalize();
    // 손바닥 쪽 정하기: 쉬는 자세에서 손가락 끝이 살짝 굽은 쪽 = 손바닥 (거의 펴져 있으면 설정값 따름)
    let vote = 0;
    for (const f of ['index', 'middle', 'ring', 'pinky']) {
      const tip = TF[`${f}3_${s}`]; if (!tip) continue;
      vote += V(...tip).sub(mcp(f)).normalize().dot(pn);
    }
    const pc = Hh.C[s === 'R' ? 'palmR' : 'palmL'];
    if (Math.abs(vote) > 0.25) { if (vote < 0) pn.negate(); }
    else if (pc && pn.dot(V(...pc)) < 0) pn.negate();
    Hh.fingVote = (Hh.fingVote || '') + s + vote.toFixed(2) + ' ';
    const ch = FN.map((f) => {
      const bs = [1, 2, 3].map((i) => B[`${f}_0${i}_${s}`]);
      if (!bs[0] || !bs[2]) return null;
      const pts = bs.map((b) => wpos(b));
      pts.push(TF[`${f}3_${s}`] ? V(...TF[`${f}3_${s}`]) : pts[2].clone().add(pts[2].clone().sub(pts[1])));
      const segs = bs.map((b, i) => {
        const d = pts[i + 1].clone().sub(pts[i]).normalize();
        let k = V().crossVectors(d, pn);
        if (k.lengthSq() < 1e-6) k = lat.clone();
        return { b, ax: k.normalize().applyQuaternion(wquat(b).invert()), rest: Hh.rest[b.name] };
      });
      let spAx = null;
      if ((f === 'index' || f === 'ring' || f === 'pinky') && B['middle_01_' + s]) {
        const lt = pts[0].clone().sub(mcp('middle')); lt.addScaledVector(a, -lt.dot(a)).normalize();
        const d = pts[1].clone().sub(pts[0]).normalize();
        spAx = V().crossVectors(d, lt).normalize().applyQuaternion(wquat(bs[0]).invert());
      }
      return { segs, spAx };
    });
    Hh.fing[s] = { ch, cur: HP.relax.c.slice(), sp: 0.2 };
  }
}
function mixHP(a, b, k) { return { c: a.c.map((v, i) => v + (b.c[i] - v) * k), sp: a.sp + (b.sp - a.sp) * k }; }
function handTarget(s, ap) {
  const C = H.C, W = H.W, rl = H.rl;
  if (window.__fingForce !== undefined) { const f = window.__fingForce; return { c: [f, f, f, f, f], sp: 0 }; }
  if (CUR && CUR.dead) return HP.limp;
  if (C.hold === 'melee') return HP.fist;
  if (C.hold === 'bow') {
    if (s === 'L') return HP.fist;
    const rel = P.release || 0;
    return rel > 0 ? mixHP(HP.draw, HP.open, Math.min(1, rel * 2.2)) : (SK.act && SK.act.type === 'grapple' ? HP.relax : HP.draw);
  }
  const trig = (P.trig || 0);
  const gripT = (k) => ({ c: [HP.grip.c[0], HP.grip.c[1] + 0.32 * k, ...HP.grip.c.slice(2)], sp: 0 });
  if (s === 'R') return W && (W.melee || W.proj === 'bolt' || W.beam) ? HP.hold : gripT(C.hold === 'dual' ? (P.alt ? 0 : trig) : trig);
  if (C.hold === 'dual') return gripT(P.alt ? trig : 0);
  let base = HP.wrap;
  if (rl && rl.shell) base = HP.pinch; else if (rl && rl.mag) base = mixHP(HP.wrap, HP.grip, 0.4);
  if (ap.handW > 0) {
    let sk = HP.open;
    if (ap.handMode === 'throw') sk = ap.handK < 0.55 ? HP.fist : HP.open;
    else if (ap.handMode === 'dome') sk = ap.handK > 0.05 ? HP.claw : HP.open;
    return mixHP(base, sk, ap.handW);
  }
  return base;
}
function poseFingers(dt, ap) {
  const F = H.fing; if (!F || window.__nofing) return;
  P.trig = Math.max(0, (P.trig || 0) - dt * 11);
  for (const s of 'RL') {
    const fs = F[s]; if (!fs) continue;
    const tg = handTarget(s, ap);
    for (let i = 0; i < 5; i++) fs.cur[i] = damp(fs.cur[i], tg.c[i], i === 1 ? 30 : 16, dt);
    fs.sp = damp(fs.sp, tg.sp, 10, dt);
    for (let i = 0; i < 5; i++) {
      const c = fs.ch[i]; if (!c) continue;
      const mx = i === 0 ? FMAX.thumb : FMAX.f;
      for (let j = 0; j < 3; j++) {
        const g = c.segs[j];
        g.b.quaternion.copy(g.rest).multiply(_fq.setFromAxisAngle(g.ax, fs.cur[i] * mx[j] * (j === 2 ? 0.9 + 0.1 * fs.cur[i] : 1)));
        if (j === 0 && c.spAx) g.b.quaternion.multiply(_fq.setFromAxisAngle(c.spAx, fs.sp * (i === 4 ? 0.22 : 0.14) - 0.03));
      }
    }
  }
}

// ───────── 활 (아리아) ─────────
// 활대를 코드로 만들어 당길수록 휘게 함. 로컬: 위 = +Y, 쏘는 방향 = -Z, 사수 쪽 = +Z. 원점 = 손잡이
const BOW = { L: 0.64, SEG: 20, RING: 7, brace: 0.17 };
const bowMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.25 });
const stringMat = new THREE.MeshStandardMaterial({ color: 0xb8aa88, roughness: 0.8 });
const arrowGeo = (() => {
  const parts = [];
  const shaft = new THREE.CylinderGeometry(0.0055, 0.0055, 0.74, 6); shaft.rotateX(Math.PI / 2); parts.push([shaft, 0x6b4a2e]);
  const head = new THREE.ConeGeometry(0.014, 0.07, 6); head.rotateX(Math.PI / 2); head.translate(0, 0, 0.4); parts.push([head, 0xc9a24a]);
  for (let i = 0; i < 3; i++) { const f = new THREE.PlaneGeometry(0.03, 0.1); f.translate(0.016, 0, -0.31); f.rotateZ(i * Math.PI * 2 / 3); parts.push([f, i ? 0xe8e2d6 : 0xd8402a]); }
  const geos = parts.map(([g, c]) => { g = g.toNonIndexed(); const col = new THREE.Color(c), n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) col.toArray(a, i * 3); g.setAttribute('color', new THREE.BufferAttribute(a, 3)); g.deleteAttribute('uv'); return g; });
  return mergeGeometries(geos);
})();
const arrowMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, side: THREE.DoubleSide });
function bowCurve(t, k, sign) {
  // t: 0(손잡이) ~ 1(끝). 쉬는 활: 뒤로 휘고 끝은 앞으로 젖혀짐(리커브). k = 당김
  const y = BOW.L * t * (1 - 0.06 * k * t * t);
  const z = 0.21 * Math.pow(t, 1.6) - 0.06 * smooth(clamp((t - 0.72) / 0.28, 0, 1)) + k * 0.13 * Math.pow(t, 1.9);
  return V(0, y * sign, z);
}
function makeBow() {
  const g = new THREE.Group();
  const S = BOW.SEG, Rn = BOW.RING, nRows = S * 2 + 1;
  const pos = new Float32Array(nRows * Rn * 3), col = new Float32Array(nRows * Rn * 3), idx = [];
  for (let r = 0; r < nRows; r++) {
    const t = Math.abs(r - S) / S;
    const c = t < 0.09 ? new THREE.Color(0x2e1d14) : (t > 0.12 && t < 0.15) || t > 0.95 ? new THREE.Color(0xc9a24a) : new THREE.Color(0x6e2a1c).lerp(new THREE.Color(0x3a1810), t * 0.6);
    for (let i = 0; i < Rn; i++) c.toArray(col, (r * Rn + i) * 3);
    if (r < nRows - 1) for (let i = 0; i < Rn; i++) { const a = r * Rn + i, b = r * Rn + (i + 1) % Rn, c2 = (r + 1) * Rn + i, d = (r + 1) * Rn + (i + 1) % Rn; idx.push(a, c2, b, b, c2, d); }
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.setIndex(idx);
  const limb = new THREE.Mesh(geo, bowMat); limb.castShadow = true; limb.frustumCulled = false; g.add(limb);
  const sGeo = new THREE.CylinderGeometry(0.0014, 0.0014, 1, 4); sGeo.translate(0, 0.5, 0);
  const s1 = new THREE.Mesh(sGeo, stringMat), s2 = new THREE.Mesh(sGeo, stringMat); s1.frustumCulled = s2.frustumCulled = false; g.add(s1, s2);
  const arrow = new THREE.Mesh(arrowGeo, arrowMat); arrow.castShadow = true; g.add(arrow);
  const mz = new THREE.Object3D(); mz.name = 'Muzzle'; mz.position.set(-0.02, 0.03, -0.05); g.add(mz);
  g.userData.bow = { limb, s1, s2, arrow, k: -1 };
  updateBowGeo(g, 0, null);
  return g;
}
const _bv = new THREE.Vector3(), _bq = new THREE.Quaternion();
function updateBowGeo(g, k, nockLocal) {
  const B0 = g.userData.bow; if (!B0) return;
  const S = BOW.SEG, Rn = BOW.RING, pos = B0.limb.geometry.attributes.position;
  if (Math.abs(B0.k - k) > 0.004) {
    B0.k = k;
    for (let r = 0; r <= S * 2; r++) {
      const sg = r < S ? -1 : 1, t = Math.abs(r - S) / S;
      const c = bowCurve(t, k, sg), c2 = bowCurve(Math.min(1, t + 0.02), k, sg);
      const tan = c2.sub(c).normalize(); if (t >= 0.999) tan.copy(bowCurve(1, k, sg).sub(bowCurve(0.98, k, sg)).normalize());
      const rad = t < 0.12 ? 0.022 - t * 0.03 : 0.0185 - 0.011 * t;
      const n1 = V(1, 0, 0), n2 = V().crossVectors(tan, n1).normalize();
      for (let i = 0; i < Rn; i++) {
        const a = i / Rn * Math.PI * 2, w = t < 0.12 ? 1.25 : 1.6;   // 림은 납작하게
        pos.setXYZ(r * Rn + i, c.x + n1.x * Math.cos(a) * rad * w + n2.x * Math.sin(a) * rad, c.y + n1.y * Math.cos(a) * rad * w + n2.y * Math.sin(a) * rad, c.z + n1.z * Math.cos(a) * rad * w + n2.z * Math.sin(a) * rad);
      }
    }
    pos.needsUpdate = true; B0.limb.geometry.computeVertexNormals();
  }
  // 시위: 위 끝 → 화살 오늬(당기는 손) → 아래 끝
  const tT = bowCurve(1, k, 1), tB = bowCurve(1, k, -1);
  const nock = nockLocal || V(0, (tT.y + tB.y) / 2, tT.z);
  const seg = (m, a, b) => { _bv.copy(b).sub(a); m.position.copy(a); m.scale.set(1, _bv.length(), 1); m.quaternion.setFromUnitVectors(UP, _bv.normalize()); };
  seg(B0.s1, tT, nock); seg(B0.s2, tB, nock);
  // 걸린 화살: 오늬에서 손잡이 옆 화살받침 쪽으로
  const rest = V(-0.018, 0.03, 0);
  B0.arrow.visible = !!B0.showArrow;
  if (B0.showArrow) { const d = rest.clone().sub(nock).normalize(); B0.arrow.position.copy(nock).addScaledVector(d, 0.37); B0.arrow.quaternion.setFromUnitVectors(V(0, 0, 1), d); }
  B0.nock = nock;
}
function poseBow(dt, c) {
  const B = H.B, bow = H.gun, C = H.C;
  const k = P.draw || 0, ke = Math.max(smooth(Math.min(1, k * 1.15)), H.fp ? 0.2 : 0);   // 1인칭에선 쉴 때도 시위를 살짝 당겨 두 손이 겹치지 않게
  P.release = Math.max(0, (P.release || 0) - dt * 3.2);
  P.nockT = Math.max(0, (P.nockT || 0) - dt);
  const act = SK.act;
  const volley = act && act.type === 'volley' ? smooth(Math.min(1, act.t / 0.25)) * (act.t > 0.55 ? Math.max(0, 1 - (act.t - 0.55) / 0.3) : 1) : 0;
  // 활 위치: 왼팔을 쭉 뻗은 앞. 화살비 때는 하늘로
  const aq = c.aimQ.clone();
  if (volley) aq.multiply(new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), 0.9 * volley));
  const go = C.gunOff;
  const grip = c.pivot.clone().add(V(go[0] + c.sw.x * 0.4, go[1] + c.sw.y * 0.4 - 0.02 * (1 - ke), go[2] * (0.88 + 0.12 * ke)).add(c.stepBob).applyQuaternion(aq));
  bow.position.copy(grip);
  const tgt = volley ? grip.clone().add(V(0, 0, -10).applyQuaternion(aq)) : aimPoint;
  bow.quaternion.setFromRotationMatrix(new THREE.Matrix4().lookAt(bow.position, tgt, UP));
  bow.rotateZ(H.fp ? 0.38 : 0.18);   // 위쪽 끝을 바깥(왼쪽)으로 살짝 기울여 쥠
  // 잡아당긴 손(오른손): 쉴 때는 시위 위, 당기면 턱 옆 앵커, 쏜 뒤엔 뒤로 튐
  bow.updateMatrixWorld(true);
  const restN = bow.localToWorld(V(0, 0.02, BOW.brace));
  const head = wpos(B.head);
  const bq = bow.quaternion, bBack = V(0, 0, 1).applyQuaternion(bq), bUp = V(0, 1, 0).applyQuaternion(bq), bFwd = bBack.clone().negate(), bRt = V(1, 0, 0).applyQuaternion(bq);
  const camF = V(0, 0, -1).applyQuaternion(c.aimQ), camU = V(0, 1, 0).applyQuaternion(c.aimQ), camR = V(1, 0, 0).applyQuaternion(c.aimQ);
  const anchor = H.fp ? H.fpEye.clone().addScaledVector(camF, 0.3).addScaledVector(camR, 0.11).addScaledVector(camU, -0.15)
    : head.clone().addScaledVector(c.aimRight, 0.07).addScaledVector(UP, -0.12).addScaledVector(c.aimFwd, 0.04);
  const drawn = restN.clone().lerp(anchor, ke);
  const rel = P.release || 0;
  const follow = drawn.clone().addScaledVector(bBack, 0.12 * Math.sin(Math.min(1, rel) * Math.PI) * (rel > 0 ? 1 : 0)).addScaledVector(c.aimRight, 0.05 * rel);
  const handN = rel > 0 ? follow : drawn;
  // 시위는 손을 따라가되, 쏜 뒤엔 바로 제자리로
  const nockW = rel > 0 ? restN : (k > 0 ? drawn : restN);
  updateBowGeo(bow, rel > 0 ? 0 : ke, bow.worldToLocal(nockW.clone()));
  bow.userData.bow.showArrow = P.nockT <= 0 && !(act && (act.type === 'grapple'));
  updateBowGeo(bow, rel > 0 ? 0 : ke, bow.worldToLocal(nockW.clone()));
  bow.userData.nockW = nockW;
  // 오른손: 손목은 시위 뒤, 손가락이 시위에 걸리게
  const wristR = handN.clone().addScaledVector(bBack, 0.075).addScaledVector(UP, -0.015).addScaledVector(c.aimRight, 0.012);
  const dirR = bFwd.clone().addScaledVector(bUp, 0.1).normalize();
  const palmR = bRt.clone().negate().addScaledVector(bFwd, 0.1).normalize();
  ik2('upperarm_R', 'forearm_R', wristR, UP.clone().multiplyScalar(0.7 * ke + 0.2).addScaledVector(c.aimFwd, -1).addScaledVector(c.aimRight, 0.7));
  aimBone('hand_R', dirR, palmR);
  // 왼손: 손잡이를 감아쥠
  // 활 쥔 손: 주먹을 세워 쥠 — 손가락 방향 = 쏘는 쪽, 손바닥 = 손잡이(오른쪽), 엄지 위. 손잡이가 주먹 안에 오게 손목을 뒤·왼쪽에
  const handL = H.len.hand_L || 0.08;
  const wristL = grip.clone().addScaledVector(bFwd, -handL * 0.62).addScaledVector(bRt, -0.03).addScaledVector(bUp, 0.005);
  const dirL = bFwd.clone().addScaledVector(bRt, 0.15).normalize();
  const palmL = bRt.clone().addScaledVector(bFwd, -0.15).normalize();
  if (act && act.type === 'grapple') { // 갈고리: 왼손으로 줄 끝 방향을 가리킴
    const sL = wpos(B.upperarm_L), dir = act.to.clone().sub(sL).normalize();
    ik2('upperarm_L', 'forearm_L', sL.clone().addScaledVector(dir, (H.len.upperarm_L + H.len.forearm_L) * 0.95), V(0, -1, 0));
    aimBone('hand_L', dir, c.aimRight);
  } else {
    ik2('upperarm_L', 'forearm_L', wristL, c.aimRight.clone().multiplyScalar(-1).addScaledVector(UP, -0.7));
    aimBone('hand_L', dirL, palmL);
  }
}
function bowStep(inp, dt) {
  const W = H.W;
  const can = !CUR.dead && !(SK.act && SK.act.noFire) && P.cool <= 0 && !(CUR.blind > 0 && !CUR.isPlayer);
  if (inp.fire && can) {
    if (!(P.draw > 0)) { P.draw = 0.001; ssfx('creak'); CUR.drawTo = CUR.bot ? rand(0.8, 1) : 1; }
    P.draw = Math.min(1, P.draw + dt / W.draw);
    if (CUR.bot && P.draw >= CUR.drawTo && CUR.bot.aligned !== false) releaseArrow();
  } else if (P.draw > 0) {
    if (P.draw > 0.12) releaseArrow(); else P.draw = 0;
  }
  SK.fovAdd = Math.min(SK.fovAdd, 0) - (P.draw || 0) * 6 * (CUR.isPlayer ? 1 : 0);  // 당기면 살짝 확대
}
function releaseArrow() {
  const W = H.W, k = P.draw; P.draw = 0; P.cool = W.rate; P.shots++; P.release = 1; P.nockT = 0.32;
  const from = H.gun.userData.nockW ? H.gun.userData.nockW.clone() : wpos(H.muzzle);
  const spd = lerp(38, W.speed, k), dmg = Math.round(lerp(30, 115, k));
  const target = aimPoint.clone();
  const dir = target.clone().sub(from).normalize();
  const g = W.g * (1.4 - 0.6 * k);
  const dist = target.distanceTo(from); dir.y += Math.min(0.3, g * dist / (2 * spd * spd)); dir.normalize();
  spawnProj('arrow', from.clone().addScaledVector(dir, 0.35), dir.multiplyScalar(spd), { g, dmg, life: 3 });
  ssfx('twang');
  recoilRot.v.x += 4 * k; P.camKick += 0.012;
}
const reveals = [];
function grappleRope() {
  if (!SK.rope) { SK.rope = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 1, 5).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ color: 0x9a8a6a, roughness: 0.9 })); SK.rope.frustumCulled = false; scene.add(SK.rope); }
  return SK.rope;
}

// ───────── 쓰러지는 동작 ─────────
// 맞고 젖혀짐 → 무릎이 꺾임 → 맞은 반대쪽으로 넘어짐 → 바닥에 닿아 살짝 튐. 무기는 손에서 떨어져 굴러감
function startDeath(U) {
  const push = U.lastPush && U.lastPush.lengthSq() > 1e-6 ? U.lastPush.clone().setY(0).normalize() : V(Math.sin(U.P.yaw), 0, Math.cos(U.P.yaw));
  const face = V(-Math.sin(U.P.yaw), 0, -Math.cos(U.P.yaw));
  const D = { t: 0, fall: push, fwd: push.dot(face) > -0.2, side: Math.random() < 0.5 ? -1 : 1, twist: (Math.random() - 0.5) * 0.8, y0: U.H.model.position.y, guns: [] };
  for (const g of [U.H.gun, U.H.gun2]) if (g) D.guns.push({ o: g, v: push.clone().multiplyScalar(1.2 + Math.random()).add(V((Math.random() - 0.5) * 1.5, 1.6 + Math.random(), (Math.random() - 0.5) * 1.5)), w: V((Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9), rest: false });
  U.death = D;
}
function poseDeath(dt) {
  const U = CUR, D = U.death, B = H.B, m = H.model; if (!D) return;
  D.t += dt; const t = D.t;
  for (const n in B) B[n].quaternion.copy(H.rest[n]);
  const k1 = smooth(clamp(t / 0.16, 0, 1)) * (1 - smooth(clamp((t - 0.16) / 0.3, 0, 1)));   // 맞고 젖혀짐
  const k2 = smooth(clamp((t - 0.1) / 0.42, 0, 1));                                           // 무릎 꺾임
  const k3 = smoother(clamp((t - 0.38) / 0.55, 0, 1));                                         // 넘어짐
  const land = t > 0.93 ? Math.sin((t - 0.93) * 16) * Math.exp(-(t - 0.93) * 7) : 0;          // 바닥에 닿아 튐
  // 몸 전체: 넘어지는 방향으로 기울임 (+ 약간 비틀림)
  const fall = D.fall, tilt = 1.42 * k3 - land * 0.05;
  const ax = V().crossVectors(UP, fall).normalize();
  const yaw = U.P.yaw + D.twist * k3;
  m.quaternion.setFromAxisAngle(ax, tilt).multiply(new THREE.Quaternion().setFromAxisAngle(UP, yaw));
  m.position.set(U.P.pos.x, U.P.pos.y, U.P.pos.z);
  m.updateMatrixWorld(true);
  const q = m.quaternion, rt = V(1, 0, 0).applyQuaternion(q), fw = V(0, 0, -1).applyQuaternion(q), up = V(0, 1, 0).applyQuaternion(q);
  const fsg = D.fwd ? 1 : -1;
  // 다리: 무릎이 앞으로 꺾이며 주저앉음
  for (const [s, sg] of [['R', 1], ['L', -1]]) {
    const knee = (D.fwd ? 1.1 * k2 * (1 - 0.45 * k3) : 0.6 * k2 * (1 - 0.9 * k3)) + (s === 'R' ? 0.18 : 0.02) * k3;
    rotAxis(B['thigh_' + s], rt, knee);
    rotAxis(B['thigh_' + s], fw, sg * 0.12 * k3);
    rotAxis(B['shin_' + s], rt, -knee * 1.7);
    if (B['foot_' + s]) rotAxis(B['foot_' + s], rt, 0.5 * k2);
  }
  // 상체: 맞을 때 뒤로 젖혀졌다가, 앞으로(또는 뒤로) 축 처짐
  const slump = fsg * (-0.55 * k2 * (1 - 0.6 * k3)) + 0.35 * k1;
  rotAxis(B.spine, rt, slump * 0.6); if (B.chest) rotAxis(B.chest, rt, slump * 0.5);
  rotAxis(B.chest || B.spine, fw, D.side * 0.25 * k3);
  rotAxis(B.head, rt, -0.45 * k2 * fsg + 0.5 * k1); rotAxis(B.head, fw, D.side * 0.6 * k3); rotAxis(B.head, up, D.side * 0.4 * k3);
  // 팔: 힘이 빠져 흔들리며 벌어짐 → 바닥에 툭
  const flail = Math.sin(t * 9) * Math.exp(-t * 3) * 0.5;
  for (const [s, sg] of [['R', 1], ['L', -1]]) {
    rotAxis(B['upperarm_' + s], fw, sg * (-0.45 * k2 + flail * 0.5 + 0.25 * k3 * (sg === D.side ? 1 : -0.3)));
    rotAxis(B['upperarm_' + s], rt, (D.fwd ? -0.6 : 0.9) * k3 + 0.3 * k1);
    rotAxis(B['forearm_' + s], rt, -0.5 * k2 - 0.25 * k3);
  }
  poseFingers(dt, { handW: 0 });
  // 바닥에 닿게: 몸의 가장 낮은 점을 땅에 맞춤
  m.updateMatrixWorld(true);
  const gy = groundAt2(U.P.pos.x, U.P.pos.z, U.P.pos.y);
  let low = Infinity;
  for (const [n, pad] of [['head', 0.13], ['chest', 0.16], ['spine', 0.15], ['hips', 0.14], ['shin_R', 0.07], ['shin_L', 0.07], ['hand_R', 0.05], ['hand_L', 0.05], ['forearm_R', 0.06], ['forearm_L', 0.06], ['foot_R', 0.04], ['foot_L', 0.04]]) {
    if (!B[n]) continue; low = Math.min(low, wpos(B[n]).y - pad);
  }
  if (low < Infinity) m.position.y += (gy - low) * smooth(clamp(k2 * 1.5, 0, 1));
  // 3초 뒤 땅속으로 가라앉음
  if (t > 3.2) m.position.y -= (t - 3.2) * 0.9;
  m.visible = t < 4.0;
  // 떨어진 무기
  for (const g of D.guns) {
    if (t < 0.12) continue;
    if (!g.rest) {
      g.v.y -= 18 * dt; g.o.position.addScaledVector(g.v, dt);
      g.o.rotateX(g.w.x * dt); g.o.rotateY(g.w.y * dt); g.o.rotateZ(g.w.z * dt);
      const gg = groundAt2(g.o.position.x, g.o.position.z, g.o.position.y + 0.5) + 0.06;
      if (g.o.position.y < gg) {
        g.o.position.y = gg;
        if (g.v.y < -1.5) { g.v.y *= -0.32; g.v.x *= 0.6; g.v.z *= 0.6; g.w.multiplyScalar(0.5); }
        else { g.v.set(0, 0, 0); g.rest = true; }
      }
    }
    g.o.visible = t < 4.0;
    if (t > 3.2) g.o.position.y -= dt * 0.5;
  }
}

function poseHero(dt) {
  const B = H.B, C = H.C, m = H.model, t = performance.now() / 1000;
  const ap = actionPose();
  const mf = C.hold === 'melee' ? meleeFrame() : null;
  if (mf) { ap.lean += mf.ln; ap.crouch += mf.cr; ap.twist -= mf.tw; }
  for (const n in B) B[n].quaternion.copy(H.rest[n]);
  H.rl = null;
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
    const gy = P.ground ? groundAt2(wp.x, wp.z, P.pos.y) : P.pos.y;
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
  // 맞았을 때 움찔: 맞은 방향으로 상체·머리가 젖혀졌다 돌아옴
  if (CUR && CUR.flinchImp) { A.flinch.v.addScaledVector(CUR.flinchImp, 7); CUR.flinchImp = null; }
  const fl = A.flinch.step(V(), dt);
  if (fl.lengthSq() > 1e-6) {
    const fa = V().crossVectors(UP, fl).normalize(), fm = Math.min(0.5, fl.length());
    rotAxis(spine, fa, fm * 0.35); if (chest) rotAxis(chest, fa, fm * 0.45); rotAxis(B.head, fa, fm * 0.6);
  }
  m.updateMatrixWorld(true);
  // ── 무기 위치
  const pivot = wpos(chest || spine).add(V(0, chest ? 0.08 : 0.25, 0));
  if (H.fp) { // 1인칭: 무기가 화면 오른쪽 아래에 보이도록 기준점을 눈 앞으로 옮김
    const fq = new THREE.Quaternion().setFromEuler(new THREE.Euler(P.pitch, P.yaw, 0, 'YXZ'));
    const fo = C.fp || FP_OFF[C.hold || 'rifle'];
    pivot.copy(H.fpEye).add(V(fo[0], fo[1], fo[2]).applyQuaternion(fq));
    if (C.hold !== 'melee') pivot.sub(V(C.gunOff[0], C.gunOff[1], C.gunOff[2]).applyQuaternion(fq));
  }
  yawRate *= Math.exp(-14 * dt); pitchRate *= Math.exp(-14 * dt);
  const sw = A.sway.step(V(clamp(-yawRate * 0.6, -0.08, 0.08), clamp(-pitchRate * 0.5, -0.06, 0.06), 0), dt);
  const rp = recoilPos.step(V(), dt), rr = recoilRot.step(V(), dt);
  const aimQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(P.pitch, P.yaw, 0, 'YXZ'));
  const go = C.gunOff;
  const stepBob = V(Math.sin(A.phase) * 0.012 * A.gait, Math.abs(Math.cos(A.phase)) * 0.018 * A.gait - airT * 0.04 + landC * 0.4, 0);
  if (C.hold === 'bow') {
    shellMesh.visible = magMesh.visible = false;
    poseBow(dt, { pivot, aimQ, aimRight, aimFwd, sw, stepBob, ap });
  } else if (C.hold === 'dual' || C.hold === 'melee') {
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
  const rl = reloadPose(dt); H.rl = rl;
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
  if (H.fp && !(ap.handW > 0) && !(rl && rl.hand)) { // 1인칭: 왼손은 총열 아래를 손바닥으로 받치고 손가락으로 감쌈. 안 닿으면 총열을 따라 뒤로
    const sL = wpos(B.upperarm_L), reach = (H.len.upperarm_L + H.len.forearm_L) * 0.97;
    const gl = wpos(H.gripL);
    const hand = H.len.hand_L || 0.08;
    const under = (k) => gl.clone().addScaledVector(gFwd, -k).addScaledVector(gUp, -0.035).addScaledVector(gRt, -hand * 0.45);
    let k = 0; wristL = under(0);
    for (let i = 0; i < 14 && wristL.distanceTo(sL) > reach; i++) { k += 0.03; wristL = under(k); }
    dirL = gRt.clone().multiplyScalar(0.8).addScaledVector(gFwd, 0.45).addScaledVector(gUp, 0.15).normalize();
    palmL = gUp.clone().addScaledVector(gRt, -0.25).normalize();
  }
  ik2('upperarm_L', 'forearm_L', wristL, aimRight.clone().multiplyScalar(-0.9).addScaledVector(UP, -1.1).addScaledVector(aimFwd, -0.2));
  aimBone('hand_L', dirL, palmL);
  // 소품을 왼손에
  const hp = wpos(B.hand_L).addScaledVector(boneDir('hand_L'), H.len.hand_L * 0.45);
  shellMesh.visible = !!rl.shell; magMesh.visible = !!rl.mag;
  if (rl.shell) { shellMesh.position.copy(hp); shellMesh.quaternion.copy(gq); }
  if (rl.mag) { magMesh.position.copy(hp).addScaledVector(gUp, 0.04); magMesh.quaternion.copy(gq); }
  }
  poseFingers(dt, ap);
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
let dualKick = [new Spring3(300, 20), new Spring3(300, 20)];
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
  fpIdle: { g: [0.3, -0.42, 0.42], d: [-0.15, 0.8, 0.35], tw: 0, ln: 0, cr: 0 },
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
  let base = H.fp ? MK.fpIdle : MK.idle;
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
  const yawQ = H.fp ? new THREE.Quaternion().setFromEuler(new THREE.Euler(P.pitch * 0.85, P.yaw, 0, 'YXZ')) : new THREE.Quaternion().setFromAxisAngle(UP, P.yaw);
  const rt = V(1, 0, 0).applyQuaternion(yawQ), fw = V(0, 0, -1).applyQuaternion(yawQ), upL = V(0, 1, 0).applyQuaternion(yawQ);
  const loc = (v) => rt.clone().multiplyScalar(v[0]).addScaledVector(upL, v[1]).addScaledVector(fw, v[2]);
  g.position.copy(pivot).add(loc(mf.g)).add(stepBob.clone().applyQuaternion(yawQ)).addScaledVector(rt, sw.x * 0.3).addScaledVector(upL, sw.y * 0.3);
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
  if (n) { hitMark(false); SK.shake = Math.max(SK.shake, 0.6); ssfx('boom'); P.hits++; }
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
  return { owner: CUR, g, ring: ringM, t: 0, fire: 0, target: null };
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
  const m = (kind === 'arrow' || kind === 'scout' || kind === 'hook') ? new THREE.Mesh(arrowGeo, arrowMat) : new THREE.Mesh(PG[kind], PM[kind]);
  if (kind === 'arrow' || kind === 'scout' || kind === 'hook') m.lookAt(pos.clone().add(vel)); m.position.copy(pos); m.castShadow = true; scene.add(m);
  if (kind === 'bolt') { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); s.scale.setScalar(0.5); m.add(s); }
  const p = Object.assign({ owner: CUR, kind, m, vel: vel.clone(), g: 0, life: 4, t: 0, stuck: null, fuse: 0 }, opt);
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
  for (let i = 0; i < 3; i++) decal(pos.clone().setY(groundAt2(pos.x, pos.z, pos.y) + 0.01).add(V((Math.random() - 0.5) * r * 0.4, 0, (Math.random() - 0.5) * r * 0.4)), UP);
  return n;
}
function updateProjs(dt) {
  for (let i = projs.length - 1; i >= 0; i--) {
    const p = projs[i]; if (p.owner !== CUR) continue; p.t += dt;
    if (p.stuckW) { if (p.t > p.life) { scene.remove(p.m); projs.splice(i, 1); } continue; }   // 벽에 박힌 화살
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
    if (p.kind === 'shell' || p.kind === 'arrow' || p.kind === 'scout') p.m.lookAt(p.m.position.clone().add(p.vel));
    if ((p.kind === 'arrow' || p.kind === 'scout') && Math.random() < 0.6) sparks(p.m.position, 1, null, p.kind === 'scout' ? 0x7fdcff : 0xffe0b0);
    if (hit || p.t > p.life) {
      const at = p.m.position.clone();
      if (p.kind === 'grenade') explode(at, 3, 80);
      else if (p.kind === 'shell') explode(at, 4, 110, 0xff7a2f, 1.6);
      else if (p.kind === 'arrow' || p.kind === 'scout') {
        if (hit && h.kind === 'dummy' && p.kind === 'arrow') {
          const dmg = Math.round(p.dmg * P.dmgMul * (h.crit ? 2 : 1));
          hurtDummy(h.d, dmg, h.crit, p.vel.clone().setY(0).normalize().multiplyScalar(0.9)); hitMark(h.crit); P.hits++;
          if (h.crit && H.id === 'aria') SK.cd.ab1 = Math.max(0, SK.cd.ab1 - 1);   // 헤드샷이면 갈고리 쿨 감소
          sparks(at, 5, null, 0xffd0a0);
        } else if (hit) {   // 벽·바닥에 박힘
          p.stuckW = true; p.t = 0; p.life = p.kind === 'scout' ? 6 : 4; p.m.position.copy(at).addScaledVector(p.vel.clone().normalize(), 0.18);
          sparks(at, 3, null, 0xc8b090); sfx('click', 700);
          if (p.kind === 'scout') { reveals.push({ at: at.clone(), t: 0, life: 6, team: CUR.team, owner: CUR }); ring(at, 0x7fdcff, 0.3, 12, 0.8); ssfx('shieldOn'); }
          continue;
        }
        if (p.kind === 'scout' && !hit) { reveals.push({ at: at.clone(), t: 0, life: 6, team: CUR.team, owner: CUR }); ring(at, 0x7fdcff, 0.3, 12, 0.8); }
      }
      else if (p.kind === 'bolt') {
        if (h.kind === 'dummy') { hurtDummy(h.d, Math.round(30 * P.dmgMul * (h.crit ? 2 : 1)), h.crit, p.vel.clone().setY(0).normalize().multiplyScalar(0.6)); hitMark(h.crit); P.hits++; }
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
  for (const d of dummies) if (!d.dead && dummyPos(d).distanceTo(at) < 5.5 && los(at, dummyPos(d).clone().setY(dummyPos(d).y + 1.5))) {
    d.blind = 2.2; hurtDummy(d, 25, false, null);
    if (d.isPlayer) { const v = at.clone().project(camera); if (v.z < 1 && Math.abs(v.x) < 1.3 && Math.abs(v.y) < 1.3) $('flashov').style.opacity = 0.95; }
  }
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
  zones.push({ owner: CUR, g, t: 0, life: 5, kind: 'heal', r: 3 });
}
function nanoCloud() {
  const g = new THREE.Group(); scene.add(g);
  const tex = radTex([[0, 'rgba(210,255,230,.8)'], [1, 'rgba(120,255,200,0)']]);
  for (let i = 0; i < 70; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.5 }));
    s.userData = { a: Math.random() * 6.28, r: 0.8 + Math.random() * 3.4, y: 0.2 + Math.random() * 2.2, sp: 0.4 + Math.random() * 0.8 };
    s.scale.setScalar(0.25 + Math.random() * 0.35); g.add(s);
  }
  zones.push({ owner: CUR, g, t: 0, life: 5, kind: 'nano', follow: true });
}
// 화살비 구역: 3초 동안 하늘에서 화살이 쏟아지고 안에 있는 적이 계속 맞음
const rainStreak = new THREE.PlaneGeometry(0.05, 1.8).rotateX(Math.PI / 2);
const rainStreakMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.2, 0.7), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
function makeRain(at) {
  const g = new THREE.Group(); g.position.copy(at);
  const ringM = new THREE.Mesh(new THREE.RingGeometry(5.6, 6, 56).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: CUR.team === 'blue' ? 0x6fc8ff : 0xff6070, transparent: true, opacity: 0.0, depthWrite: false }));
  ringM.position.y = 0.05; g.add(ringM); scene.add(g);
  return { owner: CUR, g, t: 0, life: 3.6, kind: 'rain', r: 6, falling: [], tick: 0 };
}
function updateRain(z, dt, fade) {
  z.g.children[0].material.opacity = 0.7 * fade;
  if (z.t < 0.5) return;   // 하늘로 쏜 화살이 떨어지기까지
  if (z.t < z.life - 0.3) for (let n = 0; n < 2; n++) {
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * z.r;
    const m = new THREE.Mesh(arrowGeo, arrowMat); m.scale.setScalar(1.3);
    const st = new THREE.Mesh(rainStreak, rainStreakMat); st.position.z = -1.1; m.add(st);
    const p = z.g.position.clone().add(V(Math.cos(a) * r + 2.5, 16 + Math.random() * 4, Math.sin(a) * r + 1.5));
    const tgt = z.g.position.clone().add(V(Math.cos(a) * r, 0, Math.sin(a) * r)); tgt.y = groundAt2(tgt.x, tgt.z, z.g.position.y + 2);
    m.position.copy(p); m.lookAt(tgt); scene.add(m);
    z.falling.push({ m, v: tgt.clone().sub(p).normalize().multiplyScalar(42), tgt, stuck: 0 });
  }
  for (let i = z.falling.length - 1; i >= 0; i--) {
    const f = z.falling[i];
    if (f.stuck > 0) { f.stuck += dt; if (f.m.children[0]) f.m.children[0].visible = false; if (f.stuck > 1.2) { scene.remove(f.m); z.falling.splice(i, 1); } continue; }
    f.m.position.addScaledVector(f.v, dt);
    if (f.m.position.y <= f.tgt.y + 0.25) { f.m.position.y = f.tgt.y + 0.25; f.stuck = 0.001; if (Math.random() < 0.3) dust(f.m.position, 1, 0.2, 0.5); }
  }
  z.tick -= dt;
  if (z.tick <= 0 && z.t < z.life - 0.2) { z.tick = 0.25; for (const d of dummies) if (!d.dead && dummyPos(d).distanceTo(z.g.position) < z.r && Math.abs(dummyPos(d).y - z.g.position.y) < 4) { hurtDummy(d, Math.round(19 * P.dmgMul), false, V(0, 0, 0)); if (CUR.isPlayer) hitMark(false); } if (Math.random() < 0.5) sfx('click', 500 + Math.random() * 300); }
}
function updateReveals(dt) {
  for (let i = reveals.length - 1; i >= 0; i--) {
    const r = reveals[i]; r.t += dt;
    for (const u of units) if (u.team !== r.team && !u.dead && u.P.pos.distanceTo(r.at) < 12) { u.revealT = 0.25; u.revealBy = r.team; }
    if (r.t > r.life) reveals.splice(i, 1);
  }
  for (const u of units) {
    if (u.revealT > 0) u.revealT -= dt;
    u.revealOn = u.revealT > 0 && PLAYER && u.revealBy === PLAYER.team;
  }
}
function updateZones(dt) {
  for (let i = zones.length - 1; i >= 0; i--) {
    const z = zones[i]; if (z.owner !== CUR) continue; z.t += dt;
    const fade = z.t < 0.3 ? z.t / 0.3 : z.t > z.life - 0.5 ? (z.life - z.t) / 0.5 : 1;
    if (z.kind === 'heal') {
      for (const a of allies) if (!a.dead && a.P.pos.distanceTo(z.g.position) < z.r + 0.4) heal(a, 45 * dt);
      z.g.children[1].material.opacity = 0.9 * fade; z.g.children[0].material.opacity = 0.18 * fade;
      if (Math.random() < dt * 25) { const a = Math.random() * 6.28, r = Math.random() * 2.8; const e = new THREE.Mesh(sparkGeo, new THREE.MeshBasicMaterial({ color: 0xfff0a0 })); e.position.copy(z.g.position).add(V(Math.cos(a) * r, 0.05, Math.sin(a) * r)); scene.add(e); fx.push({ o: e, t: 0, life: 1.0, kind: 'ember', v: V(0, 1.2, 0) }); }
    } else if (z.kind === 'rain') { updateRain(z, dt, fade);
    } else if (z.kind === 'crate') { updateCrate(z, dt); if (z.t > z.life - 0.5) z.g.scale.setScalar(Math.max(0.01, (z.life - z.t) / 0.5));
    } else if (z.kind === 'nano') {
      z.g.position.copy(P.pos);
      for (const a of allies) if (!a.dead && a.P.pos.distanceTo(P.pos) < 4.5) { heal(a, 55 * dt); a.protectT = 0.2; }
      for (const s of z.g.children) { const u = s.userData; u.a += dt * u.sp; s.position.set(Math.cos(u.a) * u.r, u.y + Math.sin(z.t * 2 + u.a) * 0.15, Math.sin(u.a) * u.r); s.material.opacity = 0.5 * fade; }
    }
    if (z.t > z.life) { scene.remove(z.g); if (z.falling) for (const f of z.falling) scene.remove(f.m); zones.splice(i, 1); }
  }
}
// 보급 상자 (모라 궁극기)
function supplyDrop() {
  const fw = V(-Math.sin(P.yaw), 0, -Math.cos(P.yaw));
  const at = P.pos.clone().addScaledVector(fw, 2.2); at.y = groundAt2(at.x, at.z, P.pos.y + 0.3);
  const crate = new THREE.Group();
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.6, 0.8), new THREE.MeshStandardMaterial({ color: 0x2f7d6a, roughness: 0.7 }));
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.12, 0.82), new THREE.MeshStandardMaterial({ color: 0xf2f2f2, emissive: 0x7fffd0, emissiveIntensity: 0.4 }));
  const cross = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 0.84), new THREE.MeshBasicMaterial({ color: 0xffffff })); cross.position.y = 0.31;
  const cross2 = cross.clone(); cross2.rotation.y = Math.PI / 2;
  box.castShadow = true; crate.add(box, band, cross, cross2); crate.position.copy(at).setY(at.y + 14); scene.add(crate);
  ring(at, 0x7fffd0, 0.8, 1.2, 1.2, 0.04, 0.2);
  zones.push({ owner: CUR, g: crate, t: 0, life: 7, kind: 'crate', at });
}
function updateCrate(z, dt) {
  const y = Math.max(z.at.y + 0.3, z.at.y + 14 - z.t * z.t * 18);
  z.g.position.y = y;
  if (!z.landed && y <= z.at.y + 0.31) {
    z.landed = true; ssfx('boom'); dust(z.at, 10, 1.4, 1.3); SK.shake = 0.6;
    P.mag = H.W.mag; P.reload = 0; P.dmgT = 6; P.dmgMul = 1.3;
    for (const a of allies) if (!a.dead && a.P.pos.distanceTo(z.at) < 7) { heal(a, 100); if (a !== CUR) { a.P.dmgT = 6; a.P.dmgMul = 1.3; if (a.H && a.H.W.mag) a.P.mag = a.H.W.mag; } }
    ring(z.at, 0x7fffd0, 0.3, 4, 0.5); bubble(P.pos.clone().add(V(0, 1, 0)), 0x7fffd0, 0.3, 1.4, 0.4);
    dmgNumber(P.pos.clone().add(V(0, 2.3, 0)), '보급!', false);
  }
}

// 우클릭: 루멘 치유 빛줄기 / 모라 치유 다트 (치유할 아군이 없어서 효과만)
function supportRmb(dt) {
  P.cool2 = Math.max(0, P.cool2 - dt);
  const W = H.W, want = P.input.rmb; let healBeam = SK.healBeam;
  if (W.beam) {
    if (want && !(SK.act && SK.act.noFire)) {
      if (!healBeam) { healBeam = SK.healBeam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false })); scene.add(healBeam); }
      const a = wpos(H.muzzle); let b = aimPoint.clone(); if (b.distanceTo(a) > 15) b.copy(a).add(b.sub(a).setLength(15));
      const ht = allyAt(15); if (ht) { b = ht.P.pos.clone().setY(ht.P.pos.y + 1.1); heal(ht, 60 * dt); }
      healBeam.visible = true; healBeam.position.copy(a); healBeam.lookAt(b);
      const w = 0.05 + Math.sin(performance.now() / 50) * 0.015; healBeam.scale.set(w, w, a.distanceTo(b));
      if (Math.random() < dt * 30) sparks(b, 1, null, 0xfff0a0);
    } else if (healBeam) healBeam.visible = false;
  } else if (healBeam) healBeam.visible = false;
  if (W.dart && want && P.cool2 <= 0 && P.cool <= 0) {
    P.cool2 = 0.32; P.cool = 0.15;
    const a = wpos(H.muzzle), ht = allyAt(40); const b = ht ? ht.P.pos.clone().setY(ht.P.pos.y + 1.1) : aimPoint.clone(); tracer(a, b, 'heal'); sparks(b, 4, null, 0x8aff9a); if (ht) heal(ht, 55);
    recoilPos.v.z += 1; recoilRot.v.x += 3; if (AC) { const t = AC.currentTime; tone(t, 1200, 1800, 0.08, 0.15, 'triangle'); }
  }
}
// ───────── 스킬 ─────────
const newSK = () => ({ charges: 2, chT: 0, holo: null, buff: 0, cd: { ab1: 0, ab2: 0 }, ult: 0, act: null, barrier: null, dome: null, shieldT: 0, glow: 0, fovAdd: 0, shake: 0 });
let SK = newSK();
const ABIL = {
  ratchet: { ab1: { name: '돌진', cd: 7 }, ab2: { name: '내려찍기', cd: 10 }, ult: { name: '철갑 돌격', cost: 1300 } },
  orbit: { ab1: { name: '이동형 방벽', cd: 1.2, toggle: true }, ab2: { name: '반발 펄스', cd: 8 }, ult: { name: '방벽 돔', cost: 1500 } },
  tick: { ab1: { name: '순간이동', cd: 3.5, charges: 2 }, ab2: { name: '홀로그램 분신', cd: 9 }, ult: { name: '추적 드론', cost: 1200 } },
  phase: { ab1: { name: '폭발 도약', cd: 8 }, ab2: { name: '점착 폭탄', cd: 7 }, ult: { name: '박격포 포격', cost: 1400 } },
  aria: { ab1: { name: '갈고리 화살', cd: 7 }, ab2: { name: '정찰 화살', cd: 11 }, ult: { name: '화살비', cost: 1300 } },
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
  if (n) hitMark(false);
  return n;
}
const SKSFX = {
  creak() { const t = AC.currentTime; burst(t, 0.5, 420, 3, 0.12, 'bandpass'); tone(t, 140, 190, 0.5, 0.05, 'sawtooth'); },
  twang() { const t = AC.currentTime; tone(t, 210, 120, 0.25, 0.4, 'triangle'); tone(t, 420, 300, 0.12, 0.15); burst(t, 0.08, 2600, 1.5, 0.35, 'bandpass'); burst(t + 0.02, 0.25, 900, 0.8, 0.15, 'bandpass'); },
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
  if (!H || CUR.dead) return;
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
  } else if (id === 'aria') {
    const eye = eyeOf(), dir = aimPoint.clone().sub(eye).normalize();
    if (slot === 'ab1') { // 갈고리 화살: 맞은 곳으로 끌려감
      const h = castRay(eye, dir, 30);
      if (!h.kind || h.kind === 'dummy') { if (CUR.isPlayer) centerMsg('걸 곳이 없음', '', 0.8); return; }
      SK.act = { type: 'grapple', t: 0, to: h.p.clone(), from: wpos(H.B.hand_L), lock: true, noFire: true };
      P.draw = 0; ssfx('twang'); ssfx('whoosh');
    }
    if (slot === 'ab2') { // 정찰 화살: 박힌 곳 주변 적을 6초 동안 벽 너머로 보여줌
      const from = wpos(H.muzzle);
      spawnProj('scout', from, aimPoint.clone().sub(from).normalize().multiplyScalar(60), { g: 3, life: 3 });
      P.release = 1; P.nockT = 0.4; ssfx('twang');
    }
    if (slot === 'ult') { // 화살비: 하늘로 쏘고, 조준한 곳에 3초 동안 화살이 쏟아짐
      const at = aimPoint.clone(); at.y = groundAt2(at.x, at.z, at.y + 2);
      SK.act = { type: 'volley', t: 0, at, lock: true, noFire: true, fired: false, dur: 0.9 }; ssfx('ult');
    }
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
    if (slot === 'ab1') { SK.act = { type: 'boost', t: 0, dur: 0.45, lock: true }; P.spdT = 3; P.spdMul = 1.4; SK.bubbleT = 3; SK.bubbleC = 0xffd27a; CUR.shield = 100; ssfx('shieldOn'); ring(P.pos, 0xffd27a, 0.3, 2.2, 0.4); }
    if (slot === 'ab2') { SK.act = { type: 'throw', t: 0, dur: 0.5, lock: true, zone: true }; ssfx('whoosh'); }
    if (slot === 'ult') { SK.act = { type: 'raise', t: 0, dur: 1.2, lock: true, noFire: true }; ssfx('ult'); }
  } else if (id === 'mora') {
    if (slot === 'ab1') { SK.act = { type: 'boost', t: 0, dur: 0.45, lock: true }; for (const al of allies) if (!al.dead && al.P.pos.distanceTo(P.pos) < 8) { al.P.spdT = 3; al.P.spdMul = 1.35; } ssfx('shieldOn'); ring(P.pos, 0x7fdcff, 0.3, 4, 0.5); }
    if (slot === 'ab2') throwProj('flash', 16, 12, { life: 0.9 });
    if (slot === 'ult') { SK.act = { type: 'call', t: 0, dur: 0.8, lock: true, noFire: true, supply: true }; ssfx('ult'); }
  } else if (id === 'iko') {
    if (slot === 'ab1') { SK.act = { type: 'boost', t: 0, dur: 0.45, lock: true }; const d = makeDrone(); d.g.children[2].material = new THREE.MeshBasicMaterial({ color: 0x7fffd0 }); d.guard = true; d.life = 4; d.g.position.copy(P.pos).add(V(0, 1.8, 0)); drones.push(d); SK.bubbleT = 4; SK.bubbleC = 0x7fffd0; CUR.shield = 150; ssfx('shieldOn'); }
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
  updateProjs(dt); updateZones(dt);
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
    const d = drones[i]; if (d.owner !== CUR) continue; d.t += dt; d.life -= dt; d.fire -= dt;
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
  SK.ult = Math.min(1, SK.ult + dt * 0.006);
  SK.fovAdd = damp(SK.fovAdd, 0, 5, dt); SK.shake = damp(SK.shake, 0, 7, dt);
  SK.shieldT = Math.max(0, SK.shieldT - dt);
  const a = SK.act;
  if (a) {
    a.t += dt;
    const aimFwd = V(-Math.sin(P.yaw), 0, -Math.cos(P.yaw));
    if (a.type === 'grapple') {
      const rope = grappleRope(), hp = wpos(H.B.hand_L), dv = a.to.clone().sub(P.pos.clone().add(V(0, 1, 0)));
      const shoot = Math.min(1, a.t / 0.12);   // 줄이 먼저 날아가 박히고
      const tip = hp.clone().lerp(a.to, shoot);
      _bv.copy(tip).sub(hp); rope.position.copy(hp); rope.scale.set(1, _bv.length(), 1); rope.quaternion.setFromUnitVectors(UP, _bv.normalize()); rope.visible = true;
      if (a.t > 0.12) { const d = dv.length(); const v = dv.normalize().multiplyScalar(Math.min(24, 8 + a.t * 60)); P.vel.copy(v); P.ground = false; SK.fovAdd = Math.max(SK.fovAdd, 10); if (d < 1.4 || a.t > 1.3) { P.vel.multiplyScalar(0.35); P.vel.y = 5.5; SK.act = null; rope.visible = false; SK.cd.ab1 = ABIL.aria.ab1.cd; } }
    }
    if (a.type === 'volley') {
      if (!a.fired && a.t > 0.42) { a.fired = true; P.release = 1; P.nockT = 0.4; ssfx('twang'); zones.push(makeRain(a.at)); }
      if (a.t > a.dur) SK.act = null;
    }
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
        SK.shake = Math.max(SK.shake, 0.5); hitMark(false); A.bodyKick.v -= 4; sparks(dp.clone().setY(1.2), 8, dir.clone().negate());
        ssfx('boom');
      }
      const blocked = Math.hypot(P.vel.x, P.vel.z) < spd * ease * 0.5 && a.t > 0.12;
      if (a.t > a.dur || blocked) {
        if (a.type === 'charge') { SK.shieldT = 1.5; CUR.shield = Math.max(CUR.shield, 80); P.vel.multiplyScalar(0.25); }
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
        if (a.zone) { const at = aimPoint.clone(); if (at.distanceTo(P.pos) > 14) at.copy(P.pos).add(aimPoint.clone().sub(P.pos).setLength(14)); at.y = groundAt2(at.x, at.z, at.y + 0.5); healZone(at); ring(at, 0xffe08a, 0.2, 3, 0.4); if (AC) { const t = AC.currentTime; tone(t, 600, 1200, 0.4, 0.2, 'triangle'); } }
        else releaseThrow(a);
      }
      if (a.t > a.dur) SK.act = null;
    } else if (a.type === 'rjump') { if (a.t > a.dur) SK.act = null;
    } else if (a.type === 'boost') {
      if (a.cleanse && !a.fired && a.t > 0.15) { a.fired = true; for (const al of allies) if (!al.dead && al.P.pos.distanceTo(P.pos) < 5) { heal(al, 80); al.blind = 0; al.P.slowT = 0; } ring(P.pos, 0xd8fff0, 0.3, 4, 0.45); bubble(P.pos.clone().add(V(0, 1, 0)), 0xb0ffe0, 0.3, 1.6, 0.4); for (let k = 0; k < 24; k++) { const e = new THREE.Mesh(sparkGeo, new THREE.MeshBasicMaterial({ color: k % 2 ? 0xffffff : 0x9affc8 })); const an = Math.random() * 6.28; e.position.copy(P.pos).add(V(Math.cos(an) * 0.6, 0.3 + Math.random(), Math.sin(an) * 0.6)); scene.add(e); fx.push({ o: e, t: 0, life: 0.9, kind: 'ember', v: V(Math.cos(an) * 1.5, 1.8, Math.sin(an) * 1.5) }); } if (AC) { const t = AC.currentTime; tone(t, 800, 1600, 0.4, 0.2, 'triangle'); tone(t + 0.1, 1200, 2400, 0.3, 0.12); } }
      if (a.t > a.dur) SK.act = null;
    } else if (a.type === 'call') {
      if (a.mortar && a.t > 0.35 && a.n < 3 && a.t > 0.35 + a.n * 0.45) { // 박격포: 조준점 근처로 3발
        const c = a.mortar.clone().add(V((Math.random() - 0.5) * 4, 0, (Math.random() - 0.5) * 4)); c.y = groundAt2(c.x, c.z, c.y + 0.5);
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
        for (const al of allies) if (!al.dead && al.P.pos.distanceTo(P.pos) < 10) heal(al, 180);
        const rp0 = P.pos.clone(); for (let k = 0; k < 3; k++) setTimeout(() => ring(rp0, 0xffe6a0, 0.5, 10, 0.8, 0.06 + k * 0.4, 0.12), k * 120);
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
        for (let k = 0; k < 9; k++) { const q = o.clone().addScaledVector(fw, k * 0.85).add(V((Math.random() - 0.5) * 0.6, 0, (Math.random() - 0.5) * 0.6)); q.y = groundAt2(q.x, q.z, P.pos.y + 0.3); spike(q, 0.7 + Math.random() * 0.6, k * 0.035); }
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
        for (const al of allies) if (!al.dead && al.P.pos.distanceTo(P.pos) < 9) al.drT = 6;
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
      { // 1인칭에서 자기 석판은 반투명 (앞이 보이게)
        const sm = b.m.children[0].material, want = H.fp ? 0.32 : 1;
        if (sm.opacity !== want) { sm.transparent = want < 1; sm.opacity = want; sm.depthWrite = want === 1; sm.needsUpdate = true; }
      }
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
  if (glow !== SK.lastGlow) { if (!(glow === 0 && CUR.lastFl)) H.model.traverse((o) => { if (o.isMesh && o.material.emissive) { o.material.emissive.setRGB(1, 0.42, 0.1); o.material.emissiveIntensity = glow; } }); SK.lastGlow = glow; }
  if (!P.isPlayer) return;
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
  } else if (a.type === 'grapple') {
    o.lean = -0.15; o.crouch = -0.02;
  } else if (a.type === 'volley') {
    o.lean = -0.18 * Math.min(1, t / 0.25);
  } else if (a.type === 'dome') {
    const up = t < 0.3 ? smooth(t / 0.3) : 1, down = t < 0.3 ? 0 : smooth(Math.min(1, (t - 0.3) / 0.14));
    const back = t > 0.65 ? smooth(Math.min(1, (t - 0.65) / 0.3)) : 0;
    o.handW = up * (1 - back); o.handMode = 'dome'; o.handK = down;
    o.crouch = 0.28 * down * (1 - back); o.lean = 0.3 * down * (1 - back) - 0.1 * up * (1 - down);
  }
  return o;
}


// ════════════════════════════════════════════════════════════
//  5대5 경기: 유닛·봇·거점·HUD
// ════════════════════════════════════════════════════════════
const groundAt2 = (x, z, y) => groundAt(x, z, y + 0.6);
const rand = (a, b) => a + Math.random() * (b - a);
let CUR = null, PLAYER = null, allies = [], dummies = [];
let yawRate = 0, pitchRate = 0;
const units = [];
const opts = { diff: 1, sens: 1, hero: 'ratchet', gfx: 1, fp: false };
try { Object.assign(opts, JSON.parse(localStorage.getItem('cb_opts') || '{}')); } catch (e) {}
const saveOpts = () => { try { localStorage.setItem('cb_opts', JSON.stringify(opts)); } catch (e) {} };
const newP = () => ({
  dmgMul: 1, dmgT: 0, spdMul: 1, spdT: 0, cool2: 0, swing: -1, pos: V(), vel: V(), yaw: 0, pitch: 0, ground: true, onGround: true,
  mag: 6, cool: 0, reload: 0, reloadT: 0, shots: 0, hits: 0, kills: 0, deaths: 0, bloom: 0, camKick: 0, isPlayer: false, radius: 0.45, height: 1.8,
  input: { wish: V(), jump: false, fire: false, rmb: false },
});
let P = newP();
function eyeOf(u = CUR) { return u.P.pos.clone().setY(u.P.pos.y + 1.6); }
function hitMark(crit) { if (!P.isPlayer) return; sfx('hit', crit); $('hit').className = crit ? 'crit' : ''; hitT = 0.12; }
const flashMats = {};
function muzzleFlash(mz) {
  const k = H.C.wpn, mat = flashMats[k] || (flashMats[k] = new THREE.SpriteMaterial({ map: flashTex[k] || flashTex.rifle, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  const s = new THREE.Sprite(mat); s.position.copy(mz); s.scale.setScalar(k === 'shotgun' ? 0.9 : 0.42); scene.add(s);
  fx.push({ o: s, t: 0, life: 0.045, kind: 'mflash' });
  if (P.isPlayer) { const fpm = H.fp ? 0.3 : 1; flashLight.position.copy(mz); if (H.fp) flashLight.position.add(camera.getWorldDirection(V()).multiplyScalar(0.8)); flashLight.color.set(k === 'rifle' ? 0x9fd8ff : 0xffb060); flashLight.intensity = (k === 'shotgun' ? 30 : 12) * fpm; }
}
function dummyPos(d) { return d.P.pos; }

// ── 방벽이 총알을 막음 (적 팀의 방벽·석판·돔)
const _ro = V(), _rd = V();
function barrierBlock(o, d, best) {
  for (const e of dummies) {
    const b = e.SK.barrier;
    if (b && b.on && b.k > 0.6) {
      const yaw = b.yaw, fw = V(-Math.sin(yaw), 0, -Math.cos(yaw));
      const c = b.slab ? b.m.position.clone().add(V(0, 1.15, 0)) : e.P.pos.clone().addScaledVector(fw, 2.05).add(V(0, 1.25, 0));
      const hx = b.slab ? 0.85 : 1.7, hy = b.slab ? 1.15 : 1.25, hz = b.slab ? 0.15 : 0.3;
      const q = new THREE.Quaternion().setFromAxisAngle(UP, -yaw);
      _ro.copy(o).sub(c).applyQuaternion(q); _rd.copy(d).applyQuaternion(q);
      const r = new THREE.Ray(_ro, _rd), hit = r.intersectBox(new THREE.Box3(V(-hx, -hy, -hz), V(hx, hy, hz)), V());
      if (hit) { const t = hit.distanceTo(_ro); if (t < best.t) { const p = o.clone().addScaledVector(d, t); best = { t, kind: 'barrier', p, unit: e }; } }
    }
    const dm = e.SK.dome;
    if (dm && dm.t > 0.3) {
      const c = dm.m.position, R = 5 * dm.m.scale.x;
      if (o.distanceTo(c) > R) {
        const oc = o.clone().sub(c), bq = oc.dot(d), cc = oc.lengthSq() - R * R, disc = bq * bq - cc;
        if (disc > 0) { const t = -bq - Math.sqrt(disc); if (t > 0 && t < best.t) best = { t, kind: 'barrier', p: o.clone().addScaledVector(d, t), unit: e }; }
      }
    }
  }
  if (best.kind === 'barrier') sparks(best.p, 2, null, 0x9fe0ff);
  return best;
}

// ── 피해·치유·처치
const DMG_MUL = 1.35;   // 처치 속도: 치유보다 피해가 앞서게
function hurtDummy(d, dmg, crit, push) {
  if (!d || d.dead || dmg <= 0 || d.isDecoy) return 0;
  let m = 1;
  if (d.SK.act && d.SK.act.type === 'ram') m *= 0.5;
  if (d.drT > 0) m *= 0.6;
  if (d.H && d.H.C.heavy) m *= 0.95;
  dmg = Math.max(1, Math.round(dmg * m * DMG_MUL));
  if (push && push.lengthSq() > 1e-8) { d.lastPush = push.clone(); d.flinchImp = (d.flinchImp || V()).add(push.clone().setY(0).normalize().multiplyScalar(Math.min(1.2, 0.25 + dmg / 35))); }
  let left = dmg;
  if (d.shield > 0) { const a = Math.min(d.shield, left); d.shield -= a; left -= a; }
  d.hp -= left;
  if (d.protectT > 0 && d.hp < 1) d.hp = 1;
  d.flashT = 0.1; d.lastHit = 0;
  if (push) d.P.vel.addScaledVector(push, d.role === 'tank' ? 0.35 : 0.75);
  if (P.isPlayer) dmgNumber(d.P.pos.clone().add(V(0, 2.1, 0)), dmg, crit);
  if (d.isPlayer) hurtIndicator(CUR);
  SK.ult = Math.min(1, SK.ult + dmg / ABIL[H.id].ult.cost);
  if (d.bot) d.bot.attacker = CUR;
  if (d.hp <= 0) killUnit(d, CUR);
  return dmg;
}
function heal(u, amt) {
  if (!u || u.dead || u.hp >= u.maxHp) return;
  const got = Math.min(u.maxHp - u.hp, amt);
  u.hp += got;
  if (u !== CUR) SK.ult = Math.min(1, SK.ult + got / ABIL[H.id].ult.cost * 0.9);
  if (P.isPlayer && got > 15) dmgNumber(u.P.pos.clone().add(V(0, 2.1, 0)), '+' + Math.round(got), false, true);
}
function allyAt(range) { // 조준선 위의 아군
  const o = P.isPlayer ? camera.position.clone() : eyeOf(), d = P.isPlayer ? camera.getWorldDirection(V()) : aimPoint.clone().sub(o).normalize();
  let best = null, bt = range;
  for (const a of allies) {
    if (a === CUR || a.dead) continue;
    for (const s of a.spheres) {
      const oc = o.clone().sub(s.c), bq = oc.dot(d), c = oc.lengthSq() - (s.r + 0.25) ** 2, disc = bq * bq - c;
      if (disc < 0) continue;
      const t = -bq - Math.sqrt(disc);
      if (t > 0 && t < bt && los(o, s.c)) { bt = t; best = a; }
    }
  }
  if (!best && !P.isPlayer && CUR.bot && CUR.bot.heal && CUR.bot.heal.P.pos.distanceTo(P.pos) < range) best = CUR.bot.heal;
  return best;
}
function killUnit(d, killer) {
  if (d.SK.rope) d.SK.rope.visible = false; if (d.SK.act && d.SK.act.type === 'grapple') d.SK.act = null; d.P.draw = 0;
  d.dead = true; d.hp = 0; d.respawnT = 5; d.deadT = 0; d.P.deaths++;
  if (killer) killer.P.kills++;
  const ks = killer ? killer.SK : null; if (ks && killer.H) ks.ult = Math.min(1, ks.ult + 0.04);
  feed(killer, d);
  if (killer && killer.isPlayer) { sfx('kill'); killBanner(d); $('hit').className = 'kill'; hitT = 0.35; }
  if (d.isPlayer) { $('death').classList.remove('hidden'); $('killer').textContent = killer ? `${killer.name} (${killer.H.C.name})` : ''; }
  // 진행 중이던 스킬 정리
  const s = d.SK; s.act = null; if (s.barrier) s.barrier.on = false; s.bubbleT = 0; s.buff = 0; d.shield = 0;
  d.H.gun.visible = false; if (d.H.gun2) d.H.gun2.visible = false;
  if (s.holo) { scene.remove(s.holo.g); for (const c of s.holo.g.userData.guns || []) scene.remove(c); s.holo = null; }
  if (s.healBeam) s.healBeam.visible = false;
  if (d.plate) d.plate.visible = false;
}

async function getHero(id) {
  if (CACHE[id]) return CACHE[id];
  const C = HEROES[id];
  const [g, w, meta] = await Promise.all([load(C.glb), C.gun ? load(C.gun) : Promise.resolve(null), fetch(C.meta).then((r) => r.json())]);
  return (CACHE[id] = { g, w, meta });
}
// ── 유닛 만들기
function makeUnit(id, team, isPlayer, name) {
  const U = { team, isPlayer, name, P: newP(), A: newA(), SK: newSK(), H: null, rp: new Spring3(260, 18), rr: new Spring3(240, 16), dk: [new Spring3(300, 20), new Spring3(300, 20)],
    aim: V(), yawRate: 0, pitchRate: 0, hp: 100, maxHp: 100, shield: 0, dead: false, respawnT: 0, deadT: 0, spheres: [], drT: 0, protectT: 0, blind: 0, flashT: 0, lastHit: 9, bot: null, poseT: 0 };
  U.P.isPlayer = isPlayer;
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.52, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: team === 'blue' ? 0x3aa0ff : 0xff3344, transparent: true, opacity: 0.8, depthWrite: false }));
  ring.renderOrder = 2; scene.add(ring); U.marker = ring;
  units.push(U); setHeroFor(U, id);
  return U;
}
function setHeroFor(U, id) {
  const C = HEROES[id], data = CACHE[id];
  const old = U.H;
  if (old) { scene.remove(old.model); scene.remove(old.gun); if (old.gun2) scene.remove(old.gun2); }
  const S = U.SK;
  if (S.barrier) { scene.remove(S.barrier.m); S.barrier = null; }
  if (S.dome) { scene.remove(S.dome.m); S.dome = null; }
  if (S.plate) S.plate.visible = false; if (S.shell) S.shell.visible = false; if (S.selfB) S.selfB.visible = false; if (S.healBeam) S.healBeam.visible = false;
  if (S.holo) { scene.remove(S.holo.g); for (const c of S.holo.g.userData.guns || []) scene.remove(c); S.holo = null; }
  if (S.rope) { scene.remove(S.rope); S.rope = null; }
  for (let i = drones.length - 1; i >= 0; i--) if (drones[i].owner === U) { scene.remove(drones[i].g); drones.splice(i, 1); }
  for (let i = zones.length - 1; i >= 0; i--) if (zones[i].owner === U) { scene.remove(zones[i].g); zones.splice(i, 1); }
  Object.assign(S, { act: null, cd: { ab1: 0, ab2: 0 }, charges: 2, chT: 0, buff: 0, bubbleT: 0, shieldT: 0, lastGlow: -1, ult: old ? 0 : S.ult });
  // 모델 복제 (뼈까지) + 맞으면 번쩍이도록 재질도 따로
  const src = data.g.scene;
  if (!data.rest) { data.rest = {}; src.traverse((o) => { if (o.isBone) data.rest[o.name] = o.quaternion.clone(); }); }
  const m = skClone(src); m.position.set(0, 0, 0); m.rotation.set(0, 0, 0);
  const B = {}, mats = [];
  m.traverse((o) => {
    if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; o.material = o.material.clone(); mats.push(o.material); }
    if (o.isBone) B[o.name] = o;
  });
  for (const n in B) B[n].quaternion.copy(data.rest[n]);
  scene.add(m); m.updateMatrixWorld(true);
  const Hh = { id, C, W: WPN[C.wpn], model: m, B, rest: data.rest, dirs: {}, len: {}, palms: {}, footRest: {}, meta: data.meta, mats };
  const child = { upperarm_R: 'forearm_R', forearm_R: 'hand_R', upperarm_L: 'forearm_L', forearm_L: 'hand_L', thigh_R: 'shin_R', thigh_L: 'shin_L',
    shin_R: B.foot_R ? 'foot_R' : null, shin_L: B.foot_L ? 'foot_L' : null, spine: B.chest ? 'chest' : 'head', chest: 'head' };
  const tips = data.meta.tips;
  for (const n of Object.keys(B)) {
    const t = child[n] ? wpos(B[child[n]]) : (tips[n] ? V(...tips[n]) : null);
    if (!t) continue;
    const v = t.sub(wpos(B[n]));
    Hh.len[n] = v.length();
    Hh.dirs[n] = v.normalize().applyQuaternion(wquat(B[n]).invert());
  }
  Hh.palms.hand_R = V(...C.palmR).applyQuaternion(wquat(B.hand_R).invert());
  Hh.palms.hand_L = V(...C.palmL).applyQuaternion(wquat(B.hand_L).invert());
  for (const s of 'RL') if (B['foot_' + s]) Hh.footRest[s] = wquat(B['foot_' + s]);
  buildFingers(Hh);
  const gun = C.bow ? makeBow() : data.w.scene.clone(true); gun.scale.setScalar(C.gunScale);
  gun.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  Hh.gun = gun; Hh.muzzle = gun.getObjectByName('Muzzle'); Hh.gripL = gun.getObjectByName('Grip_L'); scene.add(gun);
  if (C.hold === 'dual') { const g2 = data.w.scene.clone(true); g2.scale.setScalar(C.gunScale); Hh.gun2 = g2; Hh.muzzle2 = g2.getObjectByName('Muzzle'); scene.add(g2); }
  U.H = Hh; U.role = HD[id].role; U.maxHp = HD[id].hp; U.hp = U.maxHp; U.shield = 0;
  Object.assign(U.P, { mag: Hh.W.mag, cool: 0, reload: 0, reloadT: 0, bloom: 0, swing: -1, spdT: 0, spdMul: 1, dmgT: 0, dmgMul: 1 });
  U.A = newA(); U.A.lowerYaw = U.P.yaw;
  if (U.isPlayer && PLAYER === U) playerHud();
}

// ── 바인딩: 이 유닛의 상태를 전역 작업 변수로
const team = { blue: [], red: [] };
function bind(U) {
  CUR = U; P = U.P; A = U.A; SK = U.SK; H = U.H; recoilPos = U.rp; recoilRot = U.rr; dualKick = U.dk;
  aimPoint = U.aim; yawRate = U.yawRate; pitchRate = U.pitchRate;
  allies = team[U.team]; dummies = team[U.team === 'blue' ? 'red' : 'blue'];
  VOL = U.isPlayer ? 1 : Math.max(0, Math.min(0.85, 1.15 - (PLAYER ? U.P.pos.distanceTo(PLAYER.P.pos) : 0) / 45));
}
function unbind(U) { U.aim = aimPoint; U.yawRate = yawRate; U.pitchRate = pitchRate; }

// ── 맞는 구(몸통·머리) 갱신
function updateSpheres(U) {
  const B = U.H.B, s = U.role === 'tank' ? 1.25 : 1;
  const hips = wpos(B.hips), ch = wpos(B.chest || B.spine).add(V(0, 0.05, 0)), hd = wpos(B.head);
  const top = hd.clone().addScaledVector(hd.clone().sub(ch).normalize(), 0.14);
  U.spheres = [{ c: hips.add(V(0, 0.05, 0)), r: 0.27 * s, crit: false }, { c: ch, r: 0.3 * s, crit: false }, { c: top, r: 0.17 * (s > 1 ? 1.15 : 1), crit: true }];
}

// ── 한 유닛의 한 프레임 (이동·사격·스킬)
function stepUnit(U, dt) {
  const C = H.C, inp = P.input;
  const fwd = V(-Math.sin(P.yaw), 0, -Math.cos(P.yaw));
  const wish = inp.wish.clone().setY(0);
  const back = wish.dot(fwd) < -0.1;
  const spd = P.spdMul * C.speed * (back ? 0.85 : 1) * (P.reload > 0 ? 0.9 : 1) * (SK.barrier && SK.barrier.on ? (H.id === 'nok' ? 0.65 : 0.7) : 1) * (SK.buff > 0 ? 1.1 : 1) * (SK.act && SK.act.type === 'dome' ? 0.3 : 1);
  if (wish.lengthSq() > 0.0001) wish.normalize().multiplyScalar(spd);
  const accel = P.ground ? 12 : 2.5;
  const moveLock = SK.act && ['slam', 'charge', 'ram'].includes(SK.act.type);
  if (!moveLock) { P.vel.x += (wish.x - P.vel.x) * Math.min(1, accel * dt); P.vel.z += (wish.z - P.vel.z) * Math.min(1, accel * dt); }
  updateSkills(dt);
  supportRmb(dt);
  if (!moveLock && P.ground && inp.jump) { P.vel.y = 7.2; P.ground = P.onGround = false; A.crouchJ.v -= 1.2; }
  const wasAir = !P.ground, vy = P.vel.y;
  P.onGround = P.ground;
  moveUnit(P, dt);
  P.ground = P.onGround;
  if (wasAir && P.ground) { sfx('land', C.heavy); A.land.v += Math.min(2.2, -vy * 0.22); if (SK.act && SK.act.type === 'slam' && SK.act.phase === 'fall') {} }
  P.cool = Math.max(0, P.cool - dt);
  if (P.swing >= 0) { P.swing += dt; if (!P.swingHit && P.swing > 0.31) { P.swingHit = true; meleeHit(); } if (P.swing > 0.85) P.swing = -1; }
  P.bloom = Math.max(0, P.bloom - dt * (P.cool > 0 ? 0.01 : 0.08));
  if (H.W.bow) bowStep(inp, dt);
  else if (inp.fire && !(U.blind > 0 && !U.isPlayer) && (H.W.auto || P.cool <= 0)) fire();
  if (P.mag <= 0 && !H.W.melee && !H.W.bow && P.reload <= 0 && P.cool <= 0) startReload();
  // 상태 타이머
  U.drT = Math.max(0, U.drT - dt); U.protectT = Math.max(0, U.protectT - dt); U.blind = Math.max(0, U.blind - dt);
  U.flashT = Math.max(0, U.flashT - dt); U.lastHit += dt;
  if (SK.bubbleT <= 0 && SK.shieldT <= 0) U.shield = 0;
  // 맞으면 몸이 번쩍
  const fl = (U.flashT > 0 ? 10 : 0) + (U.revealOn ? 1 : 0);   // 맞으면 흰빛, 정찰 화살에 걸리면 붉은빛
  if (fl !== U.lastFl) { for (const mt of H.mats) { if (mt.emissive) { if (fl >= 10) { mt.emissive.setRGB(1, 1, 1); mt.emissiveIntensity = 0.21; } else if (fl) { mt.emissive.setRGB(1, 0.12, 0.18); mt.emissiveIntensity = 0.4; } else mt.emissiveIntensity = 0; } } U.lastFl = fl; SK.lastGlow = -1; }
}

// ════════════ 맵·거점 ════════════
const ctx = { gates: [], packs: [], core: null, pointR: 7.5, def: null };
const packs = [];
function loadMap(id) {
  const def = MAPS[id]; ctx.def = def; ctx.id = id;
  startMap(scene);
  ctx.gates = []; ctx.packs = []; ctx.pointR = def.pointR; ctx.shell = null;
  def.build(ctx);
  finishMap();
  applyLook(def);
  packs.length = 0;
  for (let [x, y, z] of ctx.packs) {
    if (y === null) y = groundAt(x, z, 30);
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.7, 0.15, 20), new THREE.MeshStandardMaterial({ color: 0x3a3d44, metalness: 0.4, roughness: 0.4 }));
    const cross = new THREE.Group(), cm = new THREE.MeshStandardMaterial({ color: 0x9affb0, emissive: 0x40ff80, emissiveIntensity: 1.4 });
    cross.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.15, 0.15), cm), new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.5, 0.15), cm));
    cross.position.y = 0.7; g.add(base, cross); g.position.set(x, y, z); scene.add(g);
    packs.push({ pos: V(x, y, z), g, cross, active: true, t: 0 });
  }
}
const point = { owner: null, cap: 0, capTeam: null, contested: false, overtime: false };
const score = { blue: 0, red: 0 };
let matchState = 'menu', setupT = 0, gameT = 0, paused = false;
const BOTNAMES = ['초침', '분침', '태엽', '모래시계', '자정', '여명', '진자', '톱니', '나침', '유성', '혜성', '석양'];
function spawnPoint(teamName) {
  const s = teamName === 'blue' ? 1 : -1, def = ctx.def;
  const p = randomFreeNear(rand(-def.spawnHalfW + 3, def.spawnHalfW - 3), def.spawnZ * s, 2.5);
  return p;
}
function respawn(U) {
  const p = spawnPoint(U.team);
  U.P.pos.copy(p); U.P.vel.set(0, 0, 0); U.P.yaw = U.team === 'blue' ? 0 : Math.PI; U.P.pitch = 0;
  if (U.pendingHero) { setHeroFor(U, U.pendingHero); U.pendingHero = null; }
  U.dead = false; U.hp = U.maxHp; U.shield = 0; U.respawnT = 0; U.deadT = 0; U.blind = 0; U.death = null; U.lastPush = null;
  Object.assign(U.P, { mag: U.H.W.mag, cool: 0, reload: 0, swing: -1, spdT: 0, spdMul: 1, dmgT: 0, dmgMul: 1 });
  U.SK.act = null; U.A = newA(); U.A.lowerYaw = U.P.yaw;
  U.H.model.visible = true; U.H.model.quaternion.identity(); U.H.model.rotation.set(0, U.P.yaw, 0); U.H.gun.visible = true; if (U.H.gun2) U.H.gun2.visible = true;
  if (U.bot) U.bot = newBrain(U);
  if (U.isPlayer) $('death').classList.add('hidden');
}
function inSpawn(U) { return Math.abs(U.P.pos.z) > ctx.def.gateZ - 0.5 && Math.sign(U.P.pos.z) === (U.team === 'blue' ? 1 : -1); }
function updatePoint(dt) {
  const R = ctx.pointR, n = { blue: 0, red: 0 };
  for (const u of units) if (!u.dead && Math.hypot(u.P.pos.x, u.P.pos.z) < R && u.P.pos.y < 3) n[u.team]++;
  const solo = n.blue && !n.red ? 'blue' : n.red && !n.blue ? 'red' : null;
  point.contested = !!(n.blue && n.red);
  if (solo && solo !== point.owner) {
    if (point.capTeam && point.capTeam !== solo) { point.cap -= dt * 100 / 4; if (point.cap <= 0) { point.cap = 0; point.capTeam = null; } }
    else { point.capTeam = solo; point.cap += dt * 100 / 6 * (1 + 0.25 * Math.min(2, n[solo] - 1)); }
    if (point.cap >= 100) { point.owner = solo; point.cap = 0; point.capTeam = null; centerMsg(solo === PLAYER.team ? '거점 점령!' : '적이 거점을 점령했어요', '', 1.6); sfx('kill'); }
  } else if (!point.contested && point.capTeam) { point.cap = Math.max(0, point.cap - dt * 100 / 8); if (!point.cap) point.capTeam = null; }
  if (point.owner) { // 거점을 가진 팀 점수가 오름. 적이 거점 위에 있으면 99%에서 멈춤(추가 시간)
    const o = point.owner, other = o === 'blue' ? 'red' : 'blue', enemyOn = n[other] > 0;
    score[o] = Math.min(enemyOn ? 99 : 100, score[o] + dt * 1.2);
    point.overtime = enemyOn && score[o] >= 99;
    if (score[o] >= 100) endMatch(o);
  }
  if (ctx.core) ctx.core.material.emissive.setHex(point.contested ? 0xffffff : point.owner === 'blue' ? 0x2a9fff : point.owner === 'red' ? 0xff3344 : 0xff7a1a);
  if (ctx.coreLight) ctx.coreLight.color.setHex(point.contested ? 0xffe8d0 : point.owner === 'blue' ? 0x3aa8ff : point.owner === 'red' ? 0xff4050 : 0xff8a2a);
}

// ════════════ 봇 ════════════
function newBrain(U) {
  const s = U.team === 'blue' ? 1 : -1, vs = ctx.def.vias, v = vs[Math.random() * vs.length | 0];
  const via = v.y ? V(v.x, v.y, v.z * s) : randomFreeNear(v.x, v.z * s, 3, 0.6);
  const pc = { phase: 0.35, lumen: 0.2, tick: 0.2, mora: 0.2, iko: 0.15, orbit: 0.1 }[U.H.id] || 0;
  let perch = null;
  if (ctx.def.perches && Math.random() < pc) { const q = ctx.def.perches[Math.random() * ctx.def.perches.length | 0]; perch = V(q.x, q.y, q.z * s); }
  const goal = perch ? randomFreeNear(perch.x, perch.z, 1.5, perch.y + 0.3, perch.y - 0.3) : randomFreeNear(0, 0, ctx.pointR * 0.6);
  return { path: findPath(U.P.pos, via).concat(findPath(via, goal)), perch, target: null, react: 0, think: 0, repathT: 0, attacker: null, wander: null, strafeT: 0, strafeDir: 1, aimOff: V(), aimGoal: V(), aimT: 0, settle: 0, skillT: rand(0.5, 1.5) };
}
const WANT = { ratchet: 6, orbit: 10, nok: 2.5, tick: 12, phase: 14, lumen: 12, mora: 14, iko: 13 };
const RANGE = { ratchet: 15, orbit: 35, nok: 4.3, tick: 38, phase: 26, lumen: 40, mora: 40, iko: 35, aria: 48 };
function botThink(U, dt) {
  if (!U.bot.path) U.bot = newBrain(U);
  const b = U.bot, D = DIFF[opts.diff], inp = P.input, id = H.id;
  inp.wish.set(0, 0, 0); inp.fire = false; inp.rmb = false; inp.jump = false;
  b.think -= dt; b.repathT -= dt; b.react -= dt; b.skillT -= dt;
  const e = eyeOf();
  if (b.think <= 0) {
    b.think = 0.25;
    let best = null, bd = 46;
    for (const t of dummies) {
      if (t.dead) continue;
      const tc = t.P.pos.clone().setY(t.P.pos.y + 1.2);
      let d = tc.distanceTo(e); if (t === b.attacker) d *= 0.6; d *= 0.65 + 0.35 * t.hp / t.maxHp; if (t === b.target) d *= 0.8;
      if (d < bd && los(e, tc)) { bd = d; best = t; }
    }
    // 적 분신(홀로그램)에 속기도 함
    for (const t of dummies) if (t.SK.holo && Math.random() < 0.5) { const hp = t.SK.holo.g.position.clone().setY(1.2); const d = hp.distanceTo(e) * 0.8; if (d < bd && los(e, hp)) { bd = d; best = { isDecoy: true, P: { pos: t.SK.holo.g.position.clone(), vel: V() }, dead: false, hp: 1, maxHp: 1 }; } }
    if (best && (!b.target || best.isDecoy !== b.target.isDecoy || best !== b.target)) { if (!b.target || best.P !== b.target.P) { b.react = b.target ? D.react * 0.5 : D.react; b.settle = 0; } }
    b.target = best;
    b.heal = null;
    if (U.role === 'support') {
      let low = 0.85;
      for (const t of allies) {
        if (t === U || t.dead) continue;
        const f = t.hp / t.maxHp, d = t.P.pos.distanceTo(P.pos);
        if (f < low && d < (id === 'lumen' ? 15 : 30) && los(e, t.P.pos.clone().setY(t.P.pos.y + 1.1))) { low = f; b.heal = t; }
      }
    }
    if (best && !best.isDecoy && U.hp / U.maxHp < 0.35 && !(b.retreatT > 0) && U.role !== 'tank' && Math.random() < 0.5) {
      const te = eyeOf(best); let pick = null;
      for (let k = 0; k < 10 && !pick; k++) { const q = randomFreeNear(P.pos.x, P.pos.z, 7, P.pos.y + 0.6, P.pos.y - 1.5); if (!los(te, q.clone().setY(q.y + 1.3))) pick = q; }
      if (pick) { b.retreatT = 2.2; b.retreatPt = pick; }
    }
    b.goPack = null;
    if (U.hp / U.maxHp < 0.35) { let pd = 18; for (const p of packs) if (p.active && p.pos.distanceTo(P.pos) < pd) { pd = p.pos.distanceTo(P.pos); b.goPack = p; } }
  }
  if (b.retreatT > 0) b.retreatT -= dt;
  // 이동 목표
  let goal = null;
  if (matchState === 'setup') goal = null;
  else if (b.retreatT > 0) goal = b.retreatPt;
  else if (b.goPack) goal = b.goPack.pos;
  else if (b.path.length) { goal = b.path[0]; if (Math.hypot(goal.x - P.pos.x, goal.z - P.pos.z) < 1.3) b.path.shift(); }
  else {
    const enemy = U.team === 'blue' ? 'red' : 'blue';
    if (b.perch && ((point.capTeam === enemy && point.cap > 35 && !point.contested) || (point.owner === enemy && !point.contested && Math.random() < dt * 0.05))) { b.perch = null; b.repathT = 0; }
    const Pp = b.perch;
    if (!b.wander || Math.random() < dt * 0.5) b.wander = Pp ? randomFreeNear(Pp.x, Pp.z, 2, Pp.y + 0.3, Pp.y - 0.3) : randomFreeNear(0, 0, ctx.pointR * 0.75);
    goal = b.wander;
    const far = Pp ? Math.hypot(P.pos.x - Pp.x, P.pos.z - Pp.z) > 5 || Math.abs(P.pos.y - Pp.y) > 1 : Math.hypot(P.pos.x, P.pos.z) > ctx.pointR + 8;
    if (far && b.repathT <= 0) { b.repathT = 3; b.path = findPath(P.pos, Pp ? b.wander : randomFreeNear(0, 0, ctx.pointR * 0.6)); }
  }
  // 막혔으면 길 다시
  b.stuckT = (b.stuckT || 0) + dt;
  if (b.stuckT > 1.2) { if (b.lastPos && b.lastPos.distanceTo(P.pos) < 0.5 && goal) { b.path = findPath(P.pos, b.path.length ? b.path[b.path.length - 1] : goal); inp.jump = true; } b.lastPos = P.pos.clone(); b.stuckT = 0; }
  const mv = V();
  if (goal) { mv.set(goal.x - P.pos.x, 0, goal.z - P.pos.z); if (mv.lengthSq() > 0.04) mv.normalize(); else mv.set(0, 0, 0); }
  const t = b.target, healMode = U.role === 'support' && b.heal && (id === 'lumen' || id === 'mora');
  let aimAt = healMode ? b.heal.P.pos.clone().setY(b.heal.P.pos.y + 1.1) : t ? t.P.pos.clone().setY(t.P.pos.y + (t.isDecoy ? 1.2 : 1.25)) : null;
  if (U.blind > 0) aimAt = null;
  if (aimAt && t && !healMode && H.W.proj && H.W.g) { const d = aimAt.distanceTo(e), tt = d / H.W.speed; aimAt.addScaledVector(t.P.vel, tt * 0.7); }
  if (aimAt) {
    const dist = aimAt.distanceTo(e);
    b.strafeT -= dt;
    if (b.strafeT <= 0) { b.strafeDir = Math.random() < 0.5 ? -1 : 1; b.strafeT = rand(0.25, 0.9); if (opts.diff === 2 && P.ground && Math.random() < 0.08) inp.jump = true; }
    const side = V(Math.cos(P.yaw), 0, -Math.sin(P.yaw)).multiplyScalar(b.strafeDir * D.dodge * (SK.barrier && SK.barrier.on ? 0.3 : 0.85));
    if (!healMode && t && !b.goPack && !(b.retreatT > 0) && matchState !== 'setup') {
      const to = V(aimAt.x - P.pos.x, 0, aimAt.z - P.pos.z).normalize(), want = WANT[id];
      if (dist > want + 3) mv.lerp(to, 0.6); else if (dist < want - 3) mv.lerp(to.negate(), 0.4); else mv.multiplyScalar(0.25);
    }
    if (matchState !== 'setup') mv.add(side);
    b.settle = Math.min(1, b.settle + dt * 0.9);
    const tSpeed = t ? Math.hypot(t.P.vel.x, t.P.vel.z) : 0, mySpeed = Math.hypot(P.vel.x, P.vel.z);
    const errM = healMode ? 0.05 : D.aimErr * (1.5 - 0.85 * b.settle) * (1 + tSpeed / 12 + mySpeed / 20) * (0.5 + dist / 40);
    if ((b.aimT -= dt) <= 0) { b.aimT = rand(0.15, 0.45); b.aimGoal.set(rand(-1, 1), rand(-0.8, 0.8), rand(-1, 1)).multiplyScalar(errM); }
    b.aimOff.lerp(b.aimGoal, Math.min(1, dt * 6));
    const aimP = aimAt.clone().add(b.aimOff), d = aimP.clone().sub(e);
    const tyaw = Math.atan2(-d.x, -d.z), tpitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
    const dy = wrapA(tyaw - P.yaw), dp = tpitch - P.pitch, maxTurn = D.turn * dt;
    P.yaw += clamp(dy * Math.min(1, dt * 10), -maxTurn, maxTurn); P.pitch += clamp(dp * Math.min(1, dt * 10), -maxTurn, maxTurn);
    const off = Math.hypot(wrapA(tyaw - P.yaw), tpitch - P.pitch);
    const aligned = off < D.fireCone + 0.4 / Math.max(4, dist) && b.react <= 0;
    if (healMode) { if (id === 'lumen') inp.rmb = dist < 15; else if (aligned) inp.rmb = true; }
    else if (aligned && dist < RANGE[id] && matchState !== 'setup' && !(t && t.isDecoy && Math.random() < 0.3)) inp.fire = true;
    else if (H.W.bow && P.draw > 0 && dist < RANGE[id] && matchState !== 'setup') inp.fire = true;   // 활: 당기는 중엔 계속 쥐고 있다가 겨눠지면 놓음
    b.aligned = aligned;
    if (matchState === 'play' && t && !t.isDecoy) botSkills(U, t, dist);
  } else {
    if (mv.lengthSq() > 0) { const ty = Math.atan2(-mv.x, -mv.z); P.yaw += wrapA(ty - P.yaw) * Math.min(1, dt * 5); }
    P.pitch *= 0.9;
    if (H.W.mag && P.mag < H.W.mag * 0.5) startReload();
    if (SK.barrier && SK.barrier.on) useSkill('ab1');
    if (matchState === 'play' && b.skillT <= 0 && U.role === 'support') supportIdleSkills(U);
  }
  if (matchState === 'play' && SK.ult >= 1 && b.skillT <= 0) botUlt(U, t, aimAt ? aimAt.distanceTo(e) : 99);
  inp.wish.copy(mv);
  // 봇이 보는 곳 = 실제 조준점
  const dir = V(0, 0, -1).applyEuler(new THREE.Euler(P.pitch, P.yaw, 0, 'YXZ'));
  const hit = castRay(e, dir, 80);
  aimPoint = hit.p;
}
function nearCount(list, pos, r) { let n = 0; for (const u of list) if (!u.dead && u.P.pos.distanceTo(pos) < r) n++; return n; }
function botSkills(U, t, dist) {
  const b = U.bot; if (b.skillT > 0 || SK.act) return;
  const id = H.id, hpF = U.hp / U.maxHp, r = Math.random();
  const use = (s) => { useSkill(s); b.skillT = rand(0.8, 1.8); };
  if (id === 'ratchet') { if (SK.cd.ab1 <= 0 && dist > 5 && dist < 13 && r < 0.5) use('ab1'); else if (SK.cd.ab2 <= 0 && dist < 9 && dist > 3 && P.ground && r < 0.5) use('ab2'); }
  if (id === 'orbit') { if (!SK.barrier?.on && SK.cd.ab1 <= 0 && U.lastHit < 1 && dist > 6) use('ab1'); else if (SK.barrier?.on && U.lastHit > 3) use('ab1'); else if (SK.cd.ab2 <= 0 && dist < 5) use('ab2'); }
  if (id === 'tick') { if (SK.charges > 0 && (hpF < 0.45 || (dist > 14 && r < 0.3))) use('ab1'); else if (SK.cd.ab2 <= 0 && dist < 20 && r < 0.4) use('ab2'); }
  if (id === 'nok') { if (!SK.barrier?.on && SK.cd.ab1 <= 0 && U.lastHit < 0.6 && dist > 5 && hpF < 0.8) use('ab1'); else if (SK.barrier?.on && (dist < 3.5 || U.lastHit > 2.5)) use('ab1'); else if (SK.cd.ab2 <= 0 && dist > 3 && dist < 8 && r < 0.6) use('ab2'); }
  if (id === 'phase') { if (SK.cd.ab2 <= 0 && dist > 4 && dist < 15 && r < 0.6) use('ab2'); else if (SK.cd.ab1 <= 0 && hpF < 0.4) use('ab1'); }
  if (id === 'lumen') { if (SK.cd.ab1 <= 0 && hpF < 0.5) use('ab1'); else supportIdleSkills(U); }
  if (id === 'mora') { if (SK.cd.ab2 <= 0 && dist < 12 && r < 0.6) use('ab2'); else if (SK.cd.ab1 <= 0 && nearCount(allies, P.pos, 8) >= 2 && r < 0.3) use('ab1'); }
  if (id === 'iko') { if (SK.cd.ab1 <= 0 && hpF < 0.6) use('ab1'); else supportIdleSkills(U); }
  if (id === 'aria') {
    if (SK.cd.ab2 <= 0 && t && r < 0.5) use('ab2');
    else if (SK.cd.ab1 <= 0 && (hpF < 0.4 || (dist > 22 && r < 0.3))) {
      // 높은 곳(지붕 난간·고가) 쪽으로 갈고리
      const pts = (ctx.def.perches || []).flatMap((p) => [V(p.x, p.y + 0.3, p.z), V(p.x, p.y + 0.3, -p.z)]).filter((p) => p.distanceTo(P.pos) < 24 && p.distanceTo(P.pos) > 5);
      if (pts.length) { aimPoint = pts[Math.random() * pts.length | 0]; use('ab1'); }
    }
  }
}
function supportIdleSkills(U) {
  const b = U.bot, id = H.id; if (SK.act) return;
  if (id === 'lumen' && SK.cd.ab2 <= 0) { let tgt = null; for (const a of allies) if (!a.dead && a.hp / a.maxHp < 0.7 && a.P.pos.distanceTo(P.pos) < 14) tgt = a; if (tgt) { aimPoint = tgt.P.pos.clone(); useSkill('ab2'); b.skillT = 1.5; } }
  if (id === 'iko' && SK.cd.ab2 <= 0) { let low = 0; for (const a of allies) if (!a.dead && a.hp / a.maxHp < 0.6 && a.P.pos.distanceTo(P.pos) < 5) low++; if (low) { useSkill('ab2'); b.skillT = 1.5; } }
}
function botUlt(U, t, dist) {
  const id = H.id, nearE = nearCount(dummies, P.pos, 12), nearA = nearCount(allies, P.pos, 9);
  let lowA = 0; for (const a of allies) if (!a.dead && a.hp / a.maxHp < 0.5 && a.P.pos.distanceTo(P.pos) < 10) lowA++;
  let go = false;
  if (id === 'ratchet') go = t && dist < 12 && nearE >= 1;
  if (id === 'orbit') go = nearE >= 2 && nearA >= 2;
  if (id === 'tick') go = nearE >= 1;
  if (id === 'nok') go = nearE >= 2 && nearA >= 2;
  if (id === 'phase') go = t && dist > 6 && dist < 30;
  if (id === 'lumen' || id === 'iko') go = lowA >= 2 || (lowA >= 1 && nearE >= 2);
  if (id === 'mora') go = nearA >= 2 && nearE >= 1;
  if (id === 'aria') go = t && dist > 6 && dist < 30 && nearCount(dummies, t.P.pos, 5) >= 2;
  if (go) { useSkill('ult'); U.bot.skillT = 2; }
}

// ════════════ 입력 ════════════
const keys = {};
let locked = false, mouseDown = false, rmbDown = false, thirdT = 0;
addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (!PLAYER || matchState === 'menu' || matchState === 'end' || !locked) return;
  if (e.code === 'KeyR') { bind(PLAYER); startReload(); unbind(PLAYER); }
  if (!e.repeat) {
    const slot = (e.code === 'ShiftLeft' || e.code === 'ShiftRight') ? 'ab1' : e.code === 'KeyE' ? 'ab2' : e.code === 'KeyQ' ? 'ult' : null;
    if (slot && !PLAYER.dead && matchState !== 'setup' || (slot && matchState === 'setup' && slot !== 'ult')) { bind(PLAYER); useSkill(slot); unbind(PLAYER); }
    if (e.code === 'KeyH') openSwap();
    if (e.code === 'Tab') { e.preventDefault(); $('board').classList.remove('hidden'); renderBoard(); }
  }
  if (e.code === 'Space' || e.code === 'Tab') e.preventDefault();
});
addEventListener('keyup', (e) => { keys[e.code] = false; if (e.code === 'Tab') $('board').classList.add('hidden'); });
addEventListener('mousemove', (e) => {
  if (!locked || !PLAYER) return;
  const k = 0.0022 * opts.sens, dx = e.movementX * k, dy = e.movementY * k;
  PLAYER.P.yaw -= dx; PLAYER.P.pitch = clamp(PLAYER.P.pitch - dy, -1.25, 1.3);
  PLAYER.yawRate -= dx; PLAYER.pitchRate -= dy;
});
addEventListener('mousedown', (e) => { if (!locked) return; if (e.button === 0) mouseDown = true; if (e.button === 2) rmbDown = true; });
addEventListener('mouseup', (e) => { if (e.button === 0) mouseDown = false; if (e.button === 2) rmbDown = false; });
addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === canvas;
  if (!locked) { mouseDown = rmbDown = false; if (matchState === 'play' || matchState === 'setup') { if ($('swap').classList.contains('hidden')) showPause(true); } }
  else showPause(false);
});
function lock() { try { canvas.requestPointerLock(); } catch (e) {} }
function playerInput() {
  const P0 = PLAYER.P, inp = P0.input, fw = V(-Math.sin(P0.yaw), 0, -Math.cos(P0.yaw)), rt = V(Math.cos(P0.yaw), 0, -Math.sin(P0.yaw));
  inp.wish.set(0, 0, 0);
  if (locked) { if (keys.KeyW) inp.wish.add(fw); if (keys.KeyS) inp.wish.sub(fw); if (keys.KeyD) inp.wish.add(rt); if (keys.KeyA) inp.wish.sub(rt); }
  if (window.__sim) inp.wish.add(fw.clone().multiplyScalar(window.__sim.z)).add(rt.clone().multiplyScalar(window.__sim.x));
  inp.jump = locked && keys.Space; inp.fire = (locked && mouseDown) || !!window.__fire; inp.rmb = locked && rmbDown;
}

// ════════════ 카메라 ════════════
// ───────── 1인칭 ─────────
const VM_LAYER = 2;
const FP_OFF = { bow: [-0.1, -0.075, -0.64], rifle: [0.17, -0.2, -0.42], dual: [0.2, -0.19, -0.44], melee: [0.1, 0.04, -0.16] };
const vmCam = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.01, 20); vmCam.layers.set(VM_LAYER);
const fpClip = new THREE.Plane();
for (const l of [hemi, sun, rim, flashLight]) l.layers.enable(VM_LAYER);
sun.shadow.camera.layers.enable(VM_LAYER);
shellMesh.layers.enable(VM_LAYER); magMesh.layers.enable(VM_LAYER);
// 1인칭에서 카메라에 너무 가까운 몸(어깨·목)은 그리지 않음 — 화면 깊이로 잘라냄
const FPU = { uFP: { value: 0 }, uClip: { value: 0.26 } };
function fpPatch(m, on) {
  if (!m.userData.fpPatched) {
    m.userData.fpPatched = true;
    const prev = m.onBeforeCompile;
    m.onBeforeCompile = (sh, r) => {
      if (prev) prev(sh, r);
      sh.uniforms.uFP = m.userData.uFP = { value: on ? 1 : 0 }; sh.uniforms.uClip = FPU.uClip; sh.uniforms.uHead = { value: m.userData.headIdx ?? -1 };
      // 머리 뼈에 붙은 부분(머리카락·투구)은 1인칭에서 숨김
      sh.vertexShader = 'uniform float uHead; varying float vHeadW;\n' + sh.vertexShader.replace('#include <skinning_vertex>', '#include <skinning_vertex>\n#ifdef USE_SKINNING\n vHeadW = dot(vec4(equal(skinIndex, vec4(uHead))), skinWeight);\n#else\n vHeadW = 0.0;\n#endif');
      sh.fragmentShader = 'uniform float uFP; uniform float uClip; varying float vHeadW;\n' + sh.fragmentShader.replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n if (uFP > 0.5 && (vViewPosition.z < uClip || vHeadW > 0.3)) discard;');
    };
    m.customProgramCacheKey = () => 'fpclip';
    m.needsUpdate = true;
  }
  if (m.userData.uFP) m.userData.uFP.value = on ? 1 : 0;
  else m.userData.fpOn = on;
}
function fpWanted() { return false; }   // 지금은 3인칭만
function applyFP(U, on) {
  const H0 = U.H; if (!H0) return;
  if (H0.fp === on && H0.fpApplied) return;
  H0.fp = on; H0.fpApplied = true;
  const setL = (o) => o.traverse((c) => { if (on) c.layers.set(VM_LAYER); else c.layers.set(0); });
  setL(H0.model); setL(H0.gun); if (H0.gun2) setL(H0.gun2);
  if (H0.B.head) H0.B.head.scale.setScalar(on ? 0.01 : 1);
  H0.model.traverse((o) => { if (o.isSkinnedMesh && H0.B.head) o.material.userData.headIdx = o.skeleton.bones.indexOf(H0.B.head); });
  for (const m of H0.mats) fpPatch(m, on);
  if (U.marker) U.marker.visible = !on;
  if (!H0.eyeH) H0.eyeH = (H0.meta.tips.head ? H0.meta.tips.head[1] : 1.75) * 0.92;
}
function fpEyeUpdate(U, dt) {
  const H0 = U.H, P0 = U.P, A0 = U.A;
  if (!H0.fpEye) H0.fpEye = V();
  if (!H0.eyeH) H0.eyeH = (H0.meta.tips.head ? H0.meta.tips.head[1] : 1.75) * 0.92;
  const bob = A0 ? Math.sin(A0.phase * 2) * 0.025 * A0.gait * (P0.ground ? 1 : 0) : 0;
  U.eyeY = damp(U.eyeY ?? P0.pos.y, P0.pos.y, P0.ground ? 18 : 60, dt);   // 계단 오를 때 부드럽게
  H0.fpEye.set(P0.pos.x, U.eyeY + H0.eyeH + bob, P0.pos.z);
}
function updateFPClip() {
  const f = camera.getWorldDirection(V());
  fpClip.setFromNormalAndCoplanarPoint(f, camera.position.clone().addScaledVector(f, 0.2));
  vmCam.position.copy(camera.position); vmCam.quaternion.copy(camera.quaternion);
  if (vmCam.fov !== camera.fov || vmCam.aspect !== camera.aspect) { vmCam.fov = camera.fov; vmCam.aspect = camera.aspect; vmCam.updateProjectionMatrix(); }
}
function updateCamera(dt) {
  const U = PLAYER, P0 = U.P, C = U.H.C, S0 = U.SK;
  P0.camKick = damp(P0.camKick, 0, 9, dt);
  const camQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(P0.pitch + P0.camKick, P0.yaw, 0, 'YXZ'));
  const head = P0.pos.clone().add(V(0, 1.72, 0));
  if (U.dead) { // 쓰러지면 위에서 내려다봄
    U.deadT += 0;
    const k = Math.min(1, (5 - U.respawnT) / 1.2), pos = P0.pos.clone().add(V(Math.sin(gameT * 0.3) * 5, 4 + k * 3, Math.cos(gameT * 0.3) * 5));
    camera.position.lerp(pos, 1 - Math.exp(-3 * dt)); camera.lookAt(P0.pos); camera.updateMatrixWorld(); return;
  }
  if (U.H.fp) {
    camera.position.copy(U.H.fpEye).add(V(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(S0.shake * 0.06));
    camera.quaternion.copy(camQ);
    const fovF = 72 + S0.fovAdd * 0.8; if (Math.abs(camera.fov - fovF) > 0.05) { camera.fov = fovF; camera.updateProjectionMatrix(); }
    camera.updateMatrixWorld();
    bind(U);
    const cdF = V(0, 0, -1).applyQuaternion(camQ);
    aimPoint = castRay(camera.position.clone(), cdF).p;
    if (aimPoint.distanceTo(camera.position) < 1.2) aimPoint = camera.position.clone().addScaledVector(cdF, 30);
    unbind(U);
    return;
  }
  const off = V(...C.cam).applyQuaternion(camQ);
  // 벽에 박히지 않게 카메라를 당김
  const dirC = off.clone().normalize(), L = off.length(), hitT = Math.min(L, castRayStatic(head, dirC, L + 0.3) - 0.3);
  const camPos = head.clone().addScaledVector(dirC, Math.max(0.6, hitT));
  camera.position.copy(camPos).add(V(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(S0.shake * 0.12));
  camera.quaternion.copy(camQ);
  const fov = 74 + S0.fovAdd; if (Math.abs(camera.fov - fov) > 0.05) { camera.fov = fov; camera.updateProjectionMatrix(); }
  camera.updateMatrixWorld();
  bind(U);
  const cd = V(0, 0, -1).applyQuaternion(camQ);
  aimPoint = castRay(head.clone().add(off), cd).p;
  if (aimPoint.distanceTo(P0.pos) < 2.2) aimPoint = head.clone().addScaledVector(cd, 30);
  unbind(U);
}
function castRayStatic(o, d, maxD) {
  let best = maxD; const r = new THREE.Ray(o, d), tmp = V();
  for (const b of boxes) { if (b.off) continue; const h = r.intersectBox(new THREE.Box3(b.min, b.max), tmp); if (h) { const t = h.distanceTo(o); if (t < best) best = t; } }
  return best;
}

// ════════════ HUD ════════════
let hudT = 0;
const DIRS = [];
function hurtIndicator(src) {
  if (!src) return;
  const el = document.createElement('div'); el.className = 'dmgdir'; $('hud').appendChild(el);
  DIRS.push({ el, src: src.P.pos.clone(), t: 0 });
  $('vign').style.opacity = 0.9;
}
function feed(k, d) {
  const el = document.createElement('div'); el.className = 'kf';
  const c = (u) => u.team === 'blue' ? 'b' : 'r';
  el.innerHTML = k ? `<span class="${c(k)}">${k.name}</span><i>${k.H.C.name}</i> ▸ <span class="${c(d)}">${d.name}</span><i>${d.H.C.name}</i>` : `<span class="${c(d)}">${d.name}</span> 쓰러짐`;
  if ((k && k.isPlayer) || d.isPlayer) el.classList.add('me');
  $('feed').prepend(el); setTimeout(() => el.remove(), 6000);
  while ($('feed').children.length > 6) $('feed').lastChild.remove();
}
function killBanner(d) { const el = $('killban'); el.innerHTML = `처치 <b>${d.name}</b>`; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show'); }
let centerT = 0;
function centerMsg(a, b = '', t = 2) { $('cmsg').innerHTML = `<b>${a}</b>${b ? `<span>${b}</span>` : ''}`; $('cmsg').style.opacity = 1; centerT = t; }
function playerHud() {
  const U = PLAYER, C = U.H.C, AB = ABIL[U.H.id];
  $('hname').textContent = C.name; $('hsub').textContent = C.sub;
  $('ab1').querySelector('.nm').textContent = AB.ab1.name; $('ab2').querySelector('.nm').textContent = AB.ab2.name; $('ult').querySelector('.nm').textContent = AB.ult.name;
  $('magmax').textContent = U.H.W.bow ? '' : ' / ' + U.H.W.mag; $('ammo').style.visibility = U.H.W.melee ? 'hidden' : 'visible';
  $('rmbhint').textContent = U.H.W.beam ? '우클릭 · 치유 빛줄기' : U.H.W.dart ? '우클릭 · 치유 다트' : '';
}
const plates = new Map();
function updateHud(dt) {
  const U = PLAYER, P0 = U.P;
  $('hpfill').style.width = (U.hp / U.maxHp * 100) + '%';
  $('shfill').style.width = Math.min(100, U.shield / U.maxHp * 100) + '%';
  $('hptxt').textContent = `${Math.ceil(U.hp)}${U.shield > 0 ? ' +' + Math.ceil(U.shield) : ''} / ${U.maxHp}`;
  $('mag').textContent = U.H.W.bow ? '∞' : P0.mag;
  $('reload').textContent = P0.reload > 0 ? '장전 중' : (P0.mag === 0 && !U.H.W.melee ? 'R 장전' : '');
  hitT -= dt; $('hit').style.opacity = hitT > 0 ? 1 : 0;
  const spreadPx = U.H.W.bow ? 34 - 24 * smooth(P0.draw || 0) : ((U.H.W.spread || 0.01) + P0.bloom) * innerHeight * 0.75 + 10;
  $('ring').style.borderColor = U.H.W.bow && (P0.draw || 0) >= 1 ? 'rgba(255,190,90,.95)' : '';
  $('ring').style.width = $('ring').style.height = spreadPx * 2 + 'px'; $('ring').style.left = $('ring').style.top = -spreadPx + 'px';
  $('vign').style.opacity = Math.max(+$('vign').style.opacity - dt * 1.5, U.hp / U.maxHp < 0.35 ? 0.5 : 0);
  $('flashov').style.opacity = Math.max(0, (+$('flashov').style.opacity || 0) - dt * 0.6);
  // 피격 방향
  for (let i = DIRS.length - 1; i >= 0; i--) {
    const d = DIRS[i]; d.t += dt;
    const v = d.src.clone().sub(P0.pos), a = Math.atan2(-v.x, -v.z) - P0.yaw;
    d.el.style.transform = `translate(-50%,-50%) rotate(${-a}rad) translateY(-140px)`; d.el.style.opacity = 1 - d.t / 1.2;
    if (d.t > 1.2) { d.el.remove(); DIRS.splice(i, 1); }
  }
  // 거점·점수
  $('sb').style.width = score.blue + '%'; $('sr').style.width = score.red + '%';
  $('sbt').textContent = Math.floor(score.blue) + '%'; $('srt').textContent = Math.floor(score.red) + '%';
  const st = $('pstate');
  if (matchState === 'setup') st.textContent = `준비 ${Math.ceil(setupT)}`;
  else if (point.contested) st.textContent = '경합 중!';
  else if (point.capTeam) st.textContent = `${point.capTeam === U.team ? '점령 중' : '적이 점령 중'} ${Math.floor(point.cap)}%`;
  else st.textContent = point.owner ? (point.owner === U.team ? '우리 거점' : '적 거점') + (point.overtime ? ' · 추가 시간' : '') : '거점 중립';
  $('pring').style.setProperty('--p', (point.cap * 3.6) + 'deg');
  $('pring').style.setProperty('--c', point.capTeam ? (point.capTeam === U.team ? '#3aa0ff' : '#ff3344') : '#fff');
  $('pdot').style.background = point.owner ? (point.owner === U.team ? '#3aa0ff' : '#ff3344') : '#ddd';
  centerT -= dt; if (centerT <= 0) $('cmsg').style.opacity = 0;
  if (U.dead) $('rtime').textContent = Math.ceil(U.respawnT);
  // 이름표·체력바
  hudT -= dt; const doLos = hudT <= 0; if (doLos) hudT = 0.2;
  const camPos = camera.position;
  for (const u of units) {
    if (u === U) continue;
    let el = plates.get(u);
    if (!el) { el = document.createElement('div'); el.className = 'plate ' + (u.team === U.team ? 'ally' : 'enemy'); el.innerHTML = '<span></span><div><i></i></div>'; $('plates').appendChild(el); plates.set(u, el); }
    const head = u.P.pos.clone().setY(u.P.pos.y + 2.2), dist = head.distanceTo(camPos);
    if (doLos) u.seen = !u.dead && (u.team === U.team || (u.revealT > 0 && u.revealBy === U.team) || (dist < 40 && los(camPos, head.clone().setY(head.y - 0.8))));
    const v = head.project(camera);
    if (!u.seen || v.z > 1 || dist > 55) { el.style.display = 'none'; continue; }
    el.style.display = 'block'; el.style.left = ((v.x + 1) / 2 * innerWidth) + 'px'; el.style.top = ((1 - v.y) / 2 * innerHeight) + 'px';
    el.firstChild.textContent = u.team === U.team ? u.name : '';
    el.lastChild.firstChild.style.width = (u.hp / u.maxHp * 100) + '%';
    el.style.opacity = dist > 30 ? 0.6 : 1;
  }
}
function renderBoard() {
  const row = (u) => `<tr class="${u.team}${u.isPlayer ? ' me' : ''}"><td>${u.name}</td><td>${u.H.C.name}</td><td>${u.P.kills}</td><td>${u.P.deaths}</td></tr>`;
  $('boardb').innerHTML = units.filter((u) => u.team === 'blue').map(row).join('');
  $('boardr').innerHTML = units.filter((u) => u.team === 'red').map(row).join('');
}
function showPause(v) { $('pause').classList.toggle('hidden', !v); paused = v && matchState !== 'end'; }

// ════════════ 메뉴·영웅 선택 ════════════
const ORDER = ['ratchet', 'orbit', 'nok', 'tick', 'phase', 'lumen', 'mora', 'iko', 'aria'];
const ROLEK = { tank: '탱커', dps: '딜러', support: '지원' };
function heroCards(el, onPick, sel) {
  el.innerHTML = ORDER.map((k) => {
    const ok = !!HEROES[k], h = HD[k];
    return `<div class="card ${ok ? '' : 'off'} ${k === sel ? 'sel' : ''}" data-k="${k}"><img src="assets/art/${k}.jpg" onerror="this.style.visibility='hidden'"><b>${h.name}</b><span>${ROLEK[h.role]} · ${ok ? HEROES[k].sub.split('·')[1].trim() : '준비 중'}</span></div>`;
  }).join('');
  el.querySelectorAll('.card').forEach((c) => c.addEventListener('click', () => { if (c.classList.contains('off')) return; el.querySelectorAll('.card').forEach((x) => x.classList.remove('sel')); c.classList.add('sel'); onPick(c.dataset.k); }));
}
function openSwap() {
  if (!PLAYER || !(matchState === 'setup' || matchState === 'play')) return;
  if (!PLAYER.dead && !inSpawn(PLAYER)) { centerMsg('영웅 교체는 출발 구역에서', '또는 쓰러져 있을 때', 1.8); return; }
  heroCards($('swapgrid'), (k) => chooseSwap(k), PLAYER.pendingHero || PLAYER.H.id);
  $('swap').classList.remove('hidden'); document.exitPointerLock?.();
}
function chooseSwap(k) {
  $('swap').classList.add('hidden');
  if (k !== PLAYER.H.id) {
    if (!PLAYER.dead) { const p = PLAYER.P.pos.clone(), y = PLAYER.P.yaw; setHeroFor(PLAYER, k); PLAYER.P.pos.copy(p); PLAYER.P.yaw = y; }
    else PLAYER.pendingHero = k;
  }
  lock();
}
function pickComp(exclude) {
  const pool = { tank: ['ratchet', 'orbit', 'nok'], dps: ['tick', 'phase', 'aria'], support: ['lumen', 'mora', 'iko'] };
  const need = ['tank', 'dps', 'dps', 'support', 'support'];
  if (exclude) need.splice(need.indexOf(HD[exclude].role), 1);
  const used = new Set(exclude ? [exclude] : []);
  return need.map((r) => { const c = pool[r].filter((k) => !used.has(k)); const k = (c.length ? c : pool[r])[Math.random() * (c.length ? c.length : pool[r].length) | 0]; used.add(k); return k; });
}
function clearMatch() {
  for (const u of units) { scene.remove(u.H.model); scene.remove(u.H.gun); if (u.H.gun2) scene.remove(u.H.gun2); scene.remove(u.marker); const s = u.SK; for (const k of ['barrier', 'dome']) if (s[k]) scene.remove(s[k].m); for (const k of ['plate', 'shell', 'selfB', 'healBeam']) if (s[k]) scene.remove(s[k]); if (s.holo) scene.remove(s.holo.g); }
  units.length = 0; for (const el of plates.values()) el.remove(); plates.clear();
  reveals.length = 0;
  for (const d of drones.splice(0)) scene.remove(d.g); for (const z of zones.splice(0)) { scene.remove(z.g); if (z.falling) for (const f of z.falling) scene.remove(f.m); } for (const p of projs.splice(0)) scene.remove(p.m);
}
function startMatch(hero) {
  clearMatch();
  if (ctx.id !== 'market') loadMap('market');
  Object.assign(point, { owner: null, cap: 0, capTeam: null, contested: false, overtime: false }); score.blue = score.red = 0;
  const names = [...BOTNAMES].sort(() => Math.random() - 0.5);
  PLAYER = makeUnit(hero, 'blue', true, '나');
  pickComp(hero).forEach((h, i) => { const u = makeUnit(h, 'blue', false, names[i]); u.bot = {}; });
  pickComp().forEach((h, i) => { const u = makeUnit(h, 'red', false, names[5 + i]); u.bot = {}; });
  for (const u of units) respawn(u);
  for (const g of ctx.gates) { g.box.off = false; g.mesh.visible = true; }
  for (const p of packs) { p.active = true; p.g.visible = true; }
  gameT = 0; setupT = 8; matchState = 'setup'; paused = false;
  for (const id of ['menu', 'result', 'pause', 'swap', 'death']) $(id).classList.add('hidden');
  $('hud').classList.remove('hidden');
  centerMsg(ctx.def.name, '거점을 먼저 100% 지키는 팀이 승리 · H 영웅 교체', 3.5);
  playerHud(); lock();
}
function endMatch(win) {
  if (matchState === 'end') return;
  matchState = 'end'; document.exitPointerLock?.();
  const me = PLAYER.team === win;
  $('restitle').textContent = me ? '승리' : '패배'; $('restitle').className = me ? 'win' : 'lose';
  $('resstat').innerHTML = `처치 <b>${PLAYER.P.kills}</b> · 쓰러짐 <b>${PLAYER.P.deaths}</b> · 명중률 <b>${PLAYER.P.shots ? Math.round(PLAYER.P.hits / PLAYER.P.shots * 100) : 0}%</b>`;
  setTimeout(() => $('result').classList.remove('hidden'), 1200);
}

// ════════════ 루프 ════════════
const clock = new THREE.Clock();
function updatePacks(dt) {
  for (const p of packs) {
    if (!p.active) { p.t -= dt; if (p.t <= 0) { p.active = true; p.g.visible = true; } continue; }
    p.cross.rotation.y += dt * 2; p.cross.position.y = 0.7 + Math.sin(gameT * 3) * 0.08;
    for (const u of units) if (!u.dead && u.hp < u.maxHp && Math.abs(u.P.pos.y - p.pos.y) < 1.2 && Math.hypot(u.P.pos.x - p.pos.x, u.P.pos.z - p.pos.z) < 1.1) {
      u.hp = Math.min(u.maxHp, u.hp + 90); p.active = false; p.g.visible = false; p.t = 12; if (u.isPlayer) sfx('click', 2400); break;
    }
  }
}
const NOLOOP = new URLSearchParams(location.search).has('noloop');
function frame() {
  if (NOLOOP) return;
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, clock.getDelta());
  cityTick(dt, performance.now() / 1000);
  if (matchState === 'menu' || !PLAYER) { menuCam(dt); render(); return; }
  if (!paused || window.__nopause) { tick(dt); autoScale(dt); }
  render();
}
function tick(dt) {
  gameT += dt;
  if (matchState === 'setup') { setupT -= dt; if (setupT <= 0) { matchState = 'play'; for (const g of ctx.gates) { g.box.off = true; g.mesh.visible = false; } centerMsg('전투 개시!', '', 1.3); sfx('kill'); } }
  team.blue = units.filter((u) => u.team === 'blue' && !u.dead); team.red = units.filter((u) => u.team === 'red' && !u.dead);
  playerInput();
  for (const U of units) {
    bind(U);
    if (U === PLAYER) { applyFP(U, fpWanted()); if (U.H.fp) fpEyeUpdate(U, dt); }
    if (U.dead) {
      U.deadT += dt; U.respawnT -= dt;
      if (!U.death) startDeath(U);
      if (U.H.fp) applyFP(U, false);
      poseDeath(dt);
      U.marker.visible = false;
      if (U.respawnT <= 0 && matchState !== 'end') respawn(U);
      unbind(U); continue;
    }
    if (U.bot) botThink(U, dt);
    stepUnit(U, dt);
    // 멀리 있는 봇은 자세를 덜 자주 계산
    if (U.H.fp) { // 1인칭: 어깨가 카메라 바로 아래 오도록 몸을 살짝 앞으로 (아래를 볼수록 뒤로)
      const k = 0.12 - Math.max(0, -U.P.pitch) * 0.1, sx = -Math.sin(U.P.yaw) * k, sz = -Math.cos(U.P.yaw) * k;
      U.P.pos.x += sx; U.P.pos.z += sz; poseHero(dt); U.P.pos.x -= sx; U.P.pos.z -= sz;
    } else poseHero(dt);
    updateSpheres(U);
    U.marker.visible = true; U.marker.position.set(P.pos.x, P.pos.y + 0.03, P.pos.z);
    unbind(U);
  }
  updateReveals(dt);
  updateCamera(dt);
  if (matchState === 'play') updatePoint(dt);
  updatePacks(dt);
  updateFx(dt);
  updateHud(dt);
  ambienceTick(dt, PLAYER ? Math.max(0, 1 - Math.hypot(PLAYER.P.pos.x, PLAYER.P.pos.z) / 18) : 0);
  sun.position.copy(PLAYER.P.pos).add(sunOff); sun.target.position.copy(PLAYER.P.pos);
}
function updateFx(dt) {
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
    if (f.t >= f.life) { if (f.o && f.keep) f.o.visible = false; else if (f.o) { scene.remove(f.o); if (f.kind === 'tracer' || f.kind === 'ring' || f.kind === 'bubble' || f.kind === 'pillar') f.o.geometry.dispose(); } if (f.el) f.el.remove(); fx.splice(i, 1); }
  }
}
function menuCam(dt) {
  const t = performance.now() / 1000;
  camera.position.set(Math.sin(t * 0.05) * 26, 7 + Math.sin(t * 0.13) * 1.5, Math.cos(t * 0.05) * 26); camera.lookAt(0, 5, 0);
  sun.position.set(sunOff.x, sunOff.y, sunOff.z); sun.target.position.set(0, 0, 0);
}
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); setupPost(); });

// ════════════ 시작 ════════════
async function boot() {
  loadMap('market');
  const ids = Object.keys(HEROES);
  let done = 0;
  $('loadtxt').textContent = `영웅 불러오는 중 0 / ${ids.length}`;
  await Promise.all(ids.map((id) => getHero(id).then(() => { done++; $('loadtxt').textContent = `영웅 불러오는 중 ${done} / ${ids.length}`; })));
  $('loadtxt').textContent = '';
  $('startbtn').disabled = false; $('startbtn').textContent = '경기 시작';
}
heroCards($('herogrid'), (k) => { opts.hero = k; saveOpts(); }, opts.hero);
$('diff').value = String(opts.diff); $('diff').onchange = () => { opts.diff = +$('diff').value; saveOpts(); };
$('sens').value = String(opts.sens); $('sens').oninput = () => { opts.sens = +$('sens').value; saveOpts(); };
$('gfx').value = String(opts.gfx ?? 1); $('gfx').onchange = () => { opts.gfx = +$('gfx').value; saveOpts(); setupPost(); };
$('startbtn').onclick = () => { audio(); startAmbience(); startMatch(HEROES[opts.hero] ? opts.hero : 'ratchet'); };
$('resume').onclick = () => lock();
$('toswap').onclick = () => { showPause(false); openSwap(); };
$('tomenu').onclick = () => { clearMatch(); PLAYER = null; matchState = 'menu'; $('pause').classList.add('hidden'); $('hud').classList.add('hidden'); $('menu').classList.remove('hidden'); };
$('again').onclick = () => startMatch(PLAYER.H.id);
$('resmenu').onclick = () => $('tomenu').onclick();
$('swapclose').onclick = () => { $('swap').classList.add('hidden'); lock(); };
setupPost();
boot().catch((e) => { $('loadtxt').textContent = '불러오기 실패: ' + e; console.error(e); });
frame();

window.__game = { camera, scene, renderer, hurt: (u, d, push) => hurtDummy(u, d, false, push), units, get player() { return PLAYER; }, point, score, startMatch, bind, unbind, useSkill, step(n, dt = 1 / 30) { for (let i = 0; i < n; i++) { tick(dt); cityTick(dt, gameT); } render(); }, sim(n, dt = 1 / 30) { for (let i = 0; i < n; i++) { tick(dt); cityTick(dt, gameT); } }, render, get state() { return matchState; }, set state(v) { matchState = v; }, opts };
