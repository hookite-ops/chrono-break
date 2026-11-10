// CHRONO BREAK — 노트북 브라우저용 5대5 히어로 FPS
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clone as skClone } from 'three/addons/utils/SkeletonUtils.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { HEROES, ROSTER, ROLE_KO, DIFF, WEAPONS } from './data.js';
import { W, boxes, rand, clamp, moveUnit, rayBoxes, los, groundAt, startMap, finishMap, findPath, randomFreeNear, pointInSolid } from './world.js';
import { MAPS } from './maps.js';

const $ = (id) => document.getElementById(id);
const TEAM_COL = { blue: 0x3db8ff, red: 0xff4d5e };
const opts = { diff: 1, gfx: 1, sens: 1.2, map: 'market' };
const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

// ============================================================ 렌더러·장면
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.autoClear = false;
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x2a2233, 40, 140);
const camera = new THREE.PerspectiveCamera(72, 1, 0.05, 400);
const vmScene = new THREE.Scene();
const vmCam = new THREE.PerspectiveCamera(58, 1, 0.01, 10);
vmScene.add(new THREE.HemisphereLight(0xfff1e6, 0x40384a, 2.2));
const vmSun = new THREE.DirectionalLight(0xffffff, 1.6); vmSun.position.set(1, 2, 1); vmScene.add(vmSun);
{
  const sky = new THREE.Mesh(new THREE.SphereGeometry(300, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    vertexShader: 'varying vec3 v; void main(){ v = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: `varying vec3 v; void main(){ float h = v.y;
      vec3 top = vec3(.08,.07,.16), mid = vec3(.55,.25,.30), low = vec3(1.,.55,.25);
      vec3 c = mix(low, mid, smoothstep(-.05,.18,h)); c = mix(c, top, smoothstep(.18,.7,h));
      float crack = smoothstep(.006,.0,abs(v.x*.9 + v.z*.15 - .02*sin(v.y*40.))) * smoothstep(.0,.35,h);
      c += vec3(1.,.55,.2)*crack*1.4; gl_FragColor = vec4(c,1.); }`,
  }));
  scene.add(sky);
}
scene.add(new THREE.HemisphereLight(0xffd9c2, 0x2b2436, 1.35));
const sun = new THREE.DirectionalLight(0xffc49a, 2.4);
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -48, right: 48, top: 62, bottom: -62, near: 1, far: 220 });
sun.shadow.bias = -0.0006;
scene.add(sun); scene.add(sun.target);

// 블룸: 네온·총구 화염·발광선이 번지게 (그래픽 '높음'에서만)
const composer = new EffectComposer(renderer);
const rpWorld = new RenderPass(scene, camera), rpVM = new RenderPass(vmScene, vmCam);
rpVM.clear = false; rpVM.clearDepth = true;
const bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.45, 0.4, 0.78);
composer.addPass(rpWorld); composer.addPass(rpVM); composer.addPass(bloom); composer.addPass(new OutputPass());
function applyGfx() {
  renderer.setPixelRatio(opts.gfx ? Math.min(devicePixelRatio, 1.5) : 0.75);
  renderer.shadowMap.enabled = !!opts.gfx; sun.castShadow = !!opts.gfx;
  scene.traverse(o => { if (o.material) o.material.needsUpdate = true; });
  resize();
}
function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(innerWidth, innerHeight);
  bloom.resolution.set(innerWidth / 2, innerHeight / 2);
  camera.aspect = vmCam.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix(); vmCam.updateProjectionMatrix();
}
addEventListener('resize', resize);

// ============================================================ 소리
// 층을 쌓은 합성음: 짧은 딸깍(고음) + 몸통(대역 잡음) + 쿵(저음 스윕) + 잔향. 먼 소리는 좌우로 갈리고 먹먹해짐.
let AC = null, BUS = null, REV = null;
let SP = { pan: 0, far: 0 };               // 바로 다음 소리의 위치감(vol()이 정함)
function audio() {
  if (AC) return AC;
  AC = new (window.AudioContext || window.webkitAudioContext)();
  const comp = AC.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.002; comp.release.value = 0.15;
  const master = AC.createGain(); master.gain.value = 0.9; comp.connect(master).connect(AC.destination);
  BUS = comp;
  // 잔향: 지수 감쇠 잡음 임펄스
  const len = AC.sampleRate * 1.1 | 0, ir = AC.createBuffer(2, len, AC.sampleRate);
  for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2); }
  REV = AC.createConvolver(); REV.buffer = ir; const rg = AC.createGain(); rg.gain.value = 0.28; REV.connect(rg).connect(comp);
  return AC;
}
const NOISE = {};
function noiseBuf(dur) {
  const ac = audio(), k = Math.round(dur * 100);
  if (NOISE[k]) return NOISE[k];
  const n = ac.sampleRate * dur | 0, buf = ac.createBuffer(1, n, ac.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  return (NOISE[k] = buf);
}
// 한 소리의 출구: 위치(좌우·먹먹함) + 잔향 보내기
function out(gainNode, rev = 0.35) {
  const ac = audio(), pan = ac.createStereoPanner ? ac.createStereoPanner() : null;
  const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 18000 - SP.far * 15500;
  let n = gainNode.connect(lp);
  if (pan) { pan.pan.value = SP.pan; n = n.connect(pan); }
  n.connect(BUS);
  const send = ac.createGain(); send.gain.value = rev + SP.far * 0.5; n.connect(send).connect(REV);
}
function env(g, t0, peak, a, d) { g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(peak, t0 + a); g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d); }
function noise(dur, freq, vol, type = 'lowpass', q = 0.8, attack = 0.002, rev = 0.3) {
  if (vol < 0.01) return;
  const ac = audio(), t = ac.currentTime, s = ac.createBufferSource(); s.buffer = noiseBuf(Math.max(0.05, dur + 0.02));
  const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ac.createGain(); env(g, t, vol, attack, dur);
  s.connect(f).connect(g); out(g, rev); s.start(t); s.stop(t + dur + 0.05);
}
function tone(f0, f1, dur, vol, type = 'sine', attack = 0.003, rev = 0.2) {
  if (vol < 0.01) return;
  const ac = audio(), t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
  env(g, t, vol, attack, dur); o.connect(g); out(g, rev); o.start(t); o.stop(t + attack + dur + 0.02);
}
// 총소리 한 발: 딸깍 + 몸통 + 쿵 (+ 기계음)
function gunshot(v, { crack = 3500, body = 1200, bodyQ = 0.9, bodyDur = 0.14, thump = 140, thumpDur = 0.12, mech = 0, loud = 1 }) {
  if (v < 0.01) return;
  const k = v * loud;
  noise(0.018, crack, 0.55 * k, 'highpass', 0.7, 0.001, 0.1);
  noise(bodyDur, body, 0.75 * k, 'bandpass', bodyQ, 0.002, 0.35);
  noise(bodyDur * 1.8, body * 0.35, 0.35 * k, 'lowpass', 0.7, 0.004, 0.45);
  tone(thump, thump * 0.3, thumpDur, 0.6 * k, 'sine', 0.002, 0.1);
  if (mech) setTimeout(() => noise(0.03, mech, 0.12 * v, 'bandpass', 4, 0.001, 0.05), 70);
}
const done = (f) => (...a) => { f(...a); SP = { pan: 0, far: 0 }; };
const SFX = Object.fromEntries(Object.entries({
  shotgun: (v = 1) => gunshot(v, { crack: 2500, body: 700, bodyQ: 0.6, bodyDur: 0.3, thump: 110, thumpDur: 0.22, mech: 1800, loud: 1.25 }),
  pistol: (v = 1) => { gunshot(v, { crack: 5000, body: 2600, bodyQ: 1.4, bodyDur: 0.06, thump: 220, thumpDur: 0.06, loud: 0.55 }); tone(1800, 600, 0.05, 0.08 * v, 'square'); },
  rifle: (v = 1) => { gunshot(v, { crack: 4200, body: 1700, bodyQ: 1.1, bodyDur: 0.08, thump: 170, thumpDur: 0.08, loud: 0.6 }); tone(900, 300, 0.05, 0.07 * v, 'sawtooth'); },
  nanorifle: (v = 1) => { gunshot(v, { crack: 6000, body: 3200, bodyQ: 1.8, bodyDur: 0.05, thump: 260, thumpDur: 0.05, loud: 0.45 }); tone(2400, 900, 0.06, 0.08 * v, 'square'); },
  medpistol: (v = 1) => gunshot(v, { crack: 4500, body: 1900, bodyQ: 1.2, bodyDur: 0.1, thump: 180, thumpDur: 0.09, mech: 2600, loud: 0.75 }),
  staff: (v = 1) => { tone(700, 1800, 0.1, 0.22 * v, 'sawtooth', 0.002, 0.4); tone(1400, 3600, 0.08, 0.1 * v, 'square', 0.002, 0.4); noise(0.12, 5000, 0.2 * v, 'highpass'); },
  launcher: (v = 1) => { tone(180, 50, 0.2, 0.7 * v, 'sine', 0.002, 0.2); noise(0.18, 600, 0.45 * v, 'lowpass'); noise(0.05, 3000, 0.2 * v, 'highpass'); },
  bow: (v = 1) => { tone(260, 90, 0.14, 0.35 * v, 'triangle', 0.001, 0.1); noise(0.22, 2400, 0.22 * v, 'bandpass', 2, 0.01, 0.2); },
  hammer: (v = 1) => { noise(0.22, 400, 0.5 * v, 'bandpass', 0.6, 0.02, 0.2); },
  hit: () => { tone(2600, 2100, 0.035, 0.22, 'square', 0.001, 0.02); noise(0.02, 7000, 0.12, 'highpass', 1, 0.001, 0); },
  head: () => { tone(3400, 3300, 0.12, 0.25, 'sine', 0.001, 0.05); tone(5100, 5000, 0.08, 0.1, 'sine', 0.001, 0.05); tone(2600, 2100, 0.035, 0.18, 'square', 0.001, 0); },
  kill: () => { tone(160, 60, 0.18, 0.55, 'sine', 0.002, 0.1); tone(1320, 1300, 0.16, 0.18, 'triangle', 0.002, 0.3); setTimeout(() => tone(1980, 1960, 0.22, 0.16, 'triangle', 0.002, 0.4), 70); },
  hurt: () => { noise(0.1, 350, 0.45, 'lowpass', 0.8, 0.002, 0.05); tone(120, 70, 0.1, 0.3, 'sine', 0.002, 0); },
  dash: (v = 1) => noise(0.4, 600, 0.35 * v, 'bandpass', 0.6, 0.05),
  blink: (v = 1) => { tone(300, 2400, 0.18, 0.14 * v, 'sine', 0.005, 0.4); noise(0.15, 4000, 0.1 * v, 'highpass', 1, 0.02); },
  boom: (v = 1) => { noise(0.9, 260, 0.9 * v, 'lowpass', 0.7, 0.003, 0.6); tone(80, 28, 0.6, 0.8 * v, 'sine', 0.002, 0.2); noise(0.06, 3000, 0.3 * v, 'highpass', 0.7, 0.001, 0.2); },
  heal: (v = 1) => { tone(600, 1200, 0.25, 0.09 * v); tone(900, 1800, 0.25, 0.05 * v); },
  ult: (v = 1) => { tone(200, 800, 0.5, 0.22 * v, 'sawtooth', 0.02, 0.6); noise(0.6, 1200, 0.2 * v, 'bandpass', 1, 0.05, 0.6); },
  cap: () => { tone(523, 523, 0.15, 0.18, 'triangle'); setTimeout(() => tone(784, 784, 0.3, 0.18, 'triangle', 0.003, 0.5), 150); },
  reload: () => { noise(0.04, 2200, 0.2, 'bandpass', 3, 0.001, 0.05); setTimeout(() => noise(0.05, 1400, 0.22, 'bandpass', 3, 0.001, 0.05), 220); setTimeout(() => noise(0.03, 3000, 0.2, 'bandpass', 3, 0.001, 0.05), 420); },
  pack: () => tone(500, 1000, 0.3, 0.14, 'triangle'),
  barrier: () => tone(300, 600, 0.2, 0.14, 'sine'),
  barrierHit: (v = 1) => tone(900, 700, 0.04, 0.06 * v, 'sine'),
  flash: (v = 1) => { noise(0.3, 6000, 0.4 * v, 'highpass'); tone(3000, 2800, 0.6, 0.1 * v); },
  impact: (v = 1) => noise(0.04, 2800, 0.12 * v, 'bandpass', 1.5, 0.001, 0.15),
  empty: () => noise(0.02, 3500, 0.15, 'bandpass', 5, 0.001, 0),
}).map(([k, f]) => [k, done(f)]));
// 거리에 따른 크기 + 다음 소리의 좌우·먹먹함 설정
const _sv = new THREE.Vector3(), _sr = new THREE.Vector3();
const vol = (p) => {
  const d = camera.position.distanceTo(p);
  _sv.subVectors(p, camera.position).normalize(); _sr.set(1, 0, 0).applyQuaternion(camera.quaternion);
  SP = { pan: clamp(_sv.dot(_sr), -1, 1) * 0.85, far: clamp(d / 60, 0, 1) };
  return clamp(1.15 - d / 70, 0, 1);
};

// ============================================================ 맵 상태
const ctx = { gates: [], packs: [], core: null, pointR: 6, def: null };
const packs = [];
function loadMap(id) {
  const def = MAPS[id]; ctx.def = def; ctx.id = id;
  startMap(scene);
  ctx.gates = []; ctx.packs = []; ctx.pointR = def.pointR; ctx.shell = null;
  def.build(ctx);
  finishMap();
  scene.fog.near = def.fogNear; scene.fog.far = def.fogFar;
  sun.position.set(...def.sun); sun.target.position.set(0, 0, 0);
  packs.length = 0;
  for (let [x, y, z] of ctx.packs) {
    if (y === null) y = groundAt(x, z, 30);
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.7, 0.15, 20), new THREE.MeshStandardMaterial({ color: 0x3a3d44, metalness: 0.4, roughness: 0.4 }));
    const cross = new THREE.Group(), cm = new THREE.MeshStandardMaterial({ color: 0xffb36b, emissive: 0xff8a2a, emissiveIntensity: 1.6 });
    cross.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.16), cm), new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.5, 0.16), cm));
    cross.position.y = 0.7; g.add(base, cross); g.position.set(x, y, z); W.group.add(g);
    packs.push({ pos: V3(x, y, z), g, cross, active: true, t: 0 });
  }
}
const spawnZ = (team) => ctx.def.spawnZ * (team === 'blue' ? 1 : -1);
const inSpawn = (u) => Math.abs(u.pos.z) > ctx.def.gateZ && Math.abs(u.pos.x) < ctx.def.spawnHalfW && Math.sign(u.pos.z) === (u.team === 'blue' ? 1 : -1);

// ============================================================ 모델
const loader = new GLTFLoader();
const templates = {}, weaponsT = {};
function mergeNode(root) {
  const parents = new Set(); root.traverse(o => { if (o.isMesh) parents.add(o.parent); });
  for (const p of parents) {
    const groups = new Map();
    for (const c of [...p.children]) {
      if (!c.isMesh || c.children.length) continue;
      const key = c.material.uuid + Object.keys(c.geometry.attributes).sort().join();
      (groups.get(key) || groups.set(key, []).get(key)).push(c);
    }
    for (const list of groups.values()) {
      if (list.length < 2) continue;
      const g = mergeGeometries(list.map(c => { c.updateMatrix(); const g = c.geometry.clone().applyMatrix4(c.matrix); return g.index ? g.toNonIndexed() : g; }));
      if (!g) continue;
      const m = new THREE.Mesh(g, list[0].material); m.name = list[0].name + '_m';
      list.forEach(c => p.remove(c)); p.add(m);
    }
  }
  root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  // 외곽선 껍질: 부모(관절)마다 모든 메시를 하나로
  for (const p of parents) {
    const ms = p.children.filter(c => c.isMesh && !c.userData.outline);
    if (!ms.length) continue;
    const g = mergeGeometries(ms.map(c => { c.updateMatrix(); let q = c.geometry.clone().applyMatrix4(c.matrix); q = q.index ? q.toNonIndexed() : q; for (const k of Object.keys(q.attributes)) if (k !== 'position' && k !== 'normal') q.deleteAttribute(k); return q; }));
    if (!g) continue;
    const o = new THREE.Mesh(g, OUTLINE.dark); o.userData.outline = true; o.castShadow = false; p.add(o);
  }
  return root;
}
function outlineMat(col, w, bias = 0) {
  const m = new THREE.MeshBasicMaterial({ color: col, side: THREE.BackSide, toneMapped: false });
  if (bias) { m.polygonOffset = true; m.polygonOffsetFactor = bias; m.polygonOffsetUnits = bias * 4; }
  m.onBeforeCompile = (sh) => { sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\n transformed += normalize(normal) * ${w.toFixed(3)};`); };
  m.customProgramCacheKey = () => 'outline' + w + ':' + bias;
  return m;
}
const OUTLINE = { dark: outlineMat(0x0c0d12, 0.016), enemy: outlineMat(0xff3344, 0.022), ally: outlineMat(0x0c0d12, 0.016),
  enemyAI: outlineMat(0xff3344, 0.014, 6), allyAI: outlineMat(0x0c0d12, 0.01, 6) };
// AI로 뽑은 영웅 모델(assets/ai/<id>.glb)이 있으면 그걸 쓰고, 없으면 기본 모델
let AI_HEROES = [];
function prepAI(root) {
  root.userData.ai = true;
  const skinned = [];
  root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; if (o.isSkinnedMesh) skinned.push(o); } });
  // 외곽선: 같은 뼈대로 움직이는 뒤집힌 껍질
  for (const o of skinned) {
    const ol = new THREE.SkinnedMesh(o.geometry, OUTLINE.dark);
    ol.bind(o.skeleton, o.bindMatrix); ol.userData.outline = true; ol.castShadow = false; ol.frustumCulled = false;
    ol.position.copy(o.position); ol.quaternion.copy(o.quaternion); ol.scale.copy(o.scale);
    o.parent.add(ol);
  }
  return root;
}
async function loadAll(progress) {
  try { AI_HEROES = await (await fetch('assets/ai/manifest.json', { cache: 'no-store' })).json(); } catch (e) { AI_HEROES = []; }
  const tasks = [];
  for (const [k, h] of Object.entries(HEROES)) {
    const ai = AI_HEROES.includes(k);
    tasks.push(loader.loadAsync(ai ? `assets/ai/${k}.glb` : h.glb)
      .then(g => { templates[k] = ai ? prepAI(g.scene) : mergeNode(g.scene); progress(); })
      .catch(e => ai ? loader.loadAsync(h.glb).then(g => { console.warn('AI 모델 실패, 기본 모델 사용', k, e); templates[k] = mergeNode(g.scene); progress(); }) : Promise.reject(e)));
  }
  for (const w of WEAPONS) tasks.push(loader.loadAsync(`assets/${w}.glb`).then(g => { weaponsT[w] = g.scene; progress(); }));
  await Promise.all(tasks);
}
const TOTAL_ASSETS = Object.keys(HEROES).length + WEAPONS.length;
const cloneModel = (k) => templates[k].userData.ai ? skClone(templates[k]) : templates[k].clone(true);
// AI 모델 뼈: 쉬는 자세 회전 + 모델 기준 X·Y축을 뼈 기준으로 바꿔 둠 → 쉬는 자세 위에 덧돌림
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _qw = new THREE.Quaternion();
function makeRig(model) {
  model.updateMatrixWorld(true);
  const inv = model.getWorldQuaternion(new THREE.Quaternion()).invert(), rig = {};
  for (const n of ['hips', 'chest', 'head', 'hip0', 'knee0', 'hip1', 'knee1']) {
    const b = model.getObjectByName(n); if (!b) continue;
    _qw.copy(inv).multiply(b.getWorldQuaternion(new THREE.Quaternion())).invert();
    rig[n] = { b, rest: b.quaternion.clone(), pos: b.position.clone(), ax: V3(1, 0, 0).applyQuaternion(_qw), ay: V3(0, 1, 0).applyQuaternion(_qw), az: V3(0, 0, 1).applyQuaternion(_qw) };
  }
  return rig;
}
function pose(r, x = 0, y = 0, z = 0) {
  if (!r) return;
  r.b.quaternion.copy(r.rest);
  if (x) r.b.quaternion.multiply(_q.setFromAxisAngle(r.ax, x));
  if (y) r.b.quaternion.multiply(_q.setFromAxisAngle(r.ay, y));
  if (z) r.b.quaternion.multiply(_q.setFromAxisAngle(r.az, z));
}

// ============================================================ 유닛
const units = [];
let player = null;
const decoys = [], drones = [], zones = [], projs = [], fx = [], domes = [];
let gameT = 0;
const _eye = V3(), _ctr = V3(), _v = V3(), _w = V3();

class Unit {
  constructor(hero, team, isPlayer, name) {
    this.team = team; this.isPlayer = isPlayer; this.name = name;
    this.kills = 0; this.deaths = 0; this.dmgDone = 0; this.healDone = 0; this.ult = 0; this.ultBank = 0;
    this.pos = V3(); this.vel = V3(); this.yaw = 0; this.pitch = 0;
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.68, 32), new THREE.MeshBasicMaterial({ color: TEAM_COL[team], transparent: true, opacity: 0.85, toneMapped: false, depthWrite: false }));
    this.ring.rotation.x = -Math.PI / 2; scene.add(this.ring);
    this.barC = document.createElement('canvas'); this.barC.width = 128; this.barC.height = 20;
    this.barT = new THREE.CanvasTexture(this.barC);
    this.hpSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.barT, toneMapped: false, transparent: true }));
    this.hpSprite.scale.set(1.1, 0.17, 1); scene.add(this.hpSprite);
    this.mark = new THREE.Sprite(new THREE.SpriteMaterial({ map: markTex, depthTest: false, toneMapped: false, transparent: true }));
    this.mark.scale.set(0.5, 0.5, 1); this.mark.visible = false; this.mark.renderOrder = 10; scene.add(this.mark);
    this.setHero(hero);
  }
  setHero(hero) {
    if (this.model) scene.remove(this.model);
    if (this.wall) { scene.remove(this.wall.mesh); this.wall = null; }
    this.hero = hero; this.H = HEROES[hero];
    this.radius = this.H.radius; this.height = 1.8 * this.H.H;
    this.model = cloneModel(hero); scene.add(this.model);
    this.ai = !!templates[hero].userData.ai; this.rig = this.ai ? makeRig(this.model) : null;
    // 맞으면 번쩍이도록 이 유닛만의 재질 복사본
    this.mats = []; this.flashT = 0; this.flinch = 0;
    this.model.traverse(o => { if (o.userData.outline) o.material = this.team === 'red' ? (o.isSkinnedMesh ? OUTLINE.enemyAI : OUTLINE.enemy) : (o.isSkinnedMesh ? OUTLINE.allyAI : OUTLINE.ally); });
    this.model.traverse(o => { if (o.isMesh && !o.userData.outline) { o.material = o.material.clone(); this.mats.push({ m: o.material, e: o.material.emissive ? o.material.emissive.clone() : null, ei: o.material.emissiveIntensity }); } });
    this.j = {}; for (const n of ['hips', 'spine', 'chest', 'head', 'sh0', 'sh1', 'el0', 'el1', 'hip0', 'hip1', 'knee0', 'knee1']) this.j[n] = this.model.getObjectByName(n);
    this.drone = this.model.getObjectByName('Drone');
    this.muzzles = []; this.model.traverse(o => { if (o.name.startsWith('Muzzle')) this.muzzles.push(o); });
    this.ring.scale.setScalar(this.H.W);
    if (this.H.barrier) {
      const b = this.H.barrier;
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(b.w, b.h, 6, 4), new THREE.MeshBasicMaterial({ color: this.team === 'blue' ? 0x6fd0ff : 0xff7a88, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false, toneMapped: false, wireframe: false }));
      const edge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(b.w, b.h)), new THREE.LineBasicMaterial({ color: hero === 'nok' ? 0xd8b070 : 0xffa050, toneMapped: false }));
      mesh.add(edge); mesh.visible = false; scene.add(mesh);
      this.wall = { hp: b.hp, max: b.hp, up: false, brokenT: 0, lastHit: -9, mesh, w: b.w, h: b.h, c: V3(), n: V3(), r: V3() };
    }
    if (this.isPlayer) { this.model.visible = false; this.ring.visible = false; this.hpSprite.visible = false; }
    this.ult = 0; this.ultBank = 0;
    this.reset();
  }
  reset() {
    this.maxHp = this.H.hp; this.hp = this.maxHp; this.shield = 0; this.shieldT = 0;
    this.alive = true; this.respawnT = 0; this.ammo = this.H.mag; this.reloadT = 0; this.fireT = 0;
    this.cd1 = 0; this.cd2 = 0; this.charges = this.H.ab1.charges || 1; this.chargeT = 0;
    this.boostT = 0; this.ironT = 0; this.roarT = 0; this.dmgBuffT = 0; this.slowT = 0; this.slowMul = 1; this.blindT = 0; this.revealT = 0; this.noDieT = 0; this.zoneSpdT = 0;
    this.lastHurt = -9; this.dash = 0; this.slam = 0; this.grapT = 0; this.drawT = 0; this.swingT = 0;
    this.meleeT = 0; this.healTarget = null; this.beamOn = false; this.deathT = 0; this.model.rotation.x = 0;
    if (this.wall) { this.wall.hp = this.wall.max; this.wall.up = false; this.wall.brokenT = 0; this.wall.mesh.visible = false; }
    this.drawBar(true);
  }
  get eye() { return _eye.set(this.pos.x, this.pos.y + (this.crouch ? 1.15 : 1.62) * this.H.H, this.pos.z); }
  get center() { return _ctr.set(this.pos.x, this.pos.y + 1.0 * this.H.H, this.pos.z); }
  get fwd() { return V3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); }
  aimDir(out = V3()) { const cp = Math.cos(this.pitch); return out.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp); }
  hitSpheres() {
    const H = this.H.H, Wd = this.H.W, p = this.pos, hy = this.crouch ? 1.25 : 1.71;
    return [
      { c: V3(p.x, p.y + hy * H, p.z), r: 0.17 * Math.max(1, Wd * 0.85), head: true },
      { c: V3(p.x, p.y + 1.32 * H, p.z), r: 0.3 * Wd }, { c: V3(p.x, p.y + 0.95 * H, p.z), r: 0.27 * Wd },
      { c: V3(p.x, p.y + 0.55 * H, p.z), r: 0.24 * Wd }, { c: V3(p.x, p.y + 0.2 * H, p.z), r: 0.22 * Wd },
    ];
  }
  drawBar(force) {
    const key = (this.hp | 0) + ':' + (this.shield | 0);
    if (!force && key === this._bk) return; this._bk = key;
    const g = this.barC.getContext('2d'); g.clearRect(0, 0, 128, 20);
    g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(0, 4, 128, 12);
    const tot = this.maxHp + this.shield;
    g.fillStyle = this.team === 'blue' ? '#3db8ff' : '#ff4d5e'; g.fillRect(1, 5, 126 * this.hp / tot, 10);
    g.fillStyle = '#9fe2ff'; g.fillRect(1 + 126 * this.hp / tot, 5, 126 * this.shield / tot, 10);
    g.fillStyle = 'rgba(0,0,0,.5)'; for (let k = 25; k < tot; k += 25) g.fillRect(1 + 126 * k / tot, 5, 1, 10);
    this.barT.needsUpdate = true;
  }
  dispose() { scene.remove(this.model, this.ring, this.hpSprite, this.mark); if (this.wall) scene.remove(this.wall.mesh); }
}
const markTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  g.fillStyle = '#ff4d5e'; g.strokeStyle = '#fff'; g.lineWidth = 4;
  g.beginPath(); g.moveTo(32, 6); g.lineTo(56, 32); g.lineTo(32, 58); g.lineTo(8, 32); g.closePath(); g.fill(); g.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
})();

function respawn(u) {
  if (u.pendingHero && u.pendingHero !== u.hero) { u.setHero(u.pendingHero); if (u.isPlayer) onPlayerHero(); }
  u.pendingHero = null;
  u.reset(); u.pos.set(rand(-6, 6), 0.05, spawnZ(u.team) + rand(-2.5, 2.5)); u.vel.set(0, 0, 0);
  u.yaw = u.team === 'blue' ? 0 : Math.PI; u.pitch = 0;
  u.model.visible = !u.isPlayer; u.ring.visible = !u.isPlayer;
  if (!u.isPlayer) u.bot = newBrain(u);
}

// ============================================================ 전투 공통
const isSub = (u, s) => u && u.H.sub === s;
function addUlt(u, amt) {
  if (!u || u.ultOn) return;
  const cost = u.H.ult.cost;
  u.ult += amt;
  if (u.ult > cost) {
    if (isSub(u, '전술형')) u.ultBank = Math.min(cost * 0.3, u.ultBank + (u.ult - cost));
    u.ult = cost;
  }
}
function damage(t, amt, by, opt = {}) {
  if (!t.alive || amt <= 0) return 0;
  if (by && by.dmgBuffT > 0) amt *= 1.25;
  if (t.ironT > 0) amt *= 0.5;
  if (t.roarT > 0) amt *= 0.7;
  if (opt.head) amt *= opt.headMul ?? 2;
  amt = Math.round(amt);
  let left = amt;
  if (t.shield > 0) { const a = Math.min(t.shield, left); t.shield -= a; left -= a; }
  t.hp -= left; t.lastHurt = gameT;
  if (by) { by.dmgDone += amt; addUlt(by, amt); }
  addUlt(t, amt * 0.15);
  t.flashT = 0.09; t.flinch = Math.min(1, (t.flinch || 0) + amt / 60);
  if (t.isPlayer) { hurtFlash(); SFX.hurt(); if (by && by !== t) dmgDir(by.pos); }
  if (by && by.isPlayer) { dmgNumber(opt.at || t.eye, amt, opt.head ? 'h' : ''); hitMarker(opt.head ? 'head' : ''); (opt.head ? SFX.head : SFX.hit)(); }
  if (by && opt.head && by.hero === 'aria') by.cd1 = Math.max(0, by.cd1 - 1);
  if (by && by.hero === 'tick' && opt.dir) {
    const f = t.fwd; if (f.dot(_w.set(opt.dir.x, 0, opt.dir.z).normalize()) > 0.5) { by.cd2 = Math.max(0, by.cd2 - 0.12); by.chargeT = Math.max(0, by.chargeT - 0.12); }
  }
  if (t.bot && by) t.bot.attacker = by;
  if (t.hp <= 0) { if (t.noDieT > 0) t.hp = 1; else kill(t, by); }
  t.drawBar();
  return amt;
}
function heal(t, amt, by) {
  if (!t.alive) return 0;
  const a = Math.min(amt, t.maxHp - t.hp); if (a <= 0) return 0;
  t.hp += a;
  if (by) { by.healDone += a; addUlt(by, a); if (isSub(by, '치유형') && by !== t && by.alive) by.hp = Math.min(by.maxHp, by.hp + a * 0.25); }
  if (t.isPlayer && a > 4) healFlash();
  t.drawBar(); return a;
}
function giveShield(t, amt, dur) { t.shield = Math.max(t.shield, amt); t.shieldT = Math.max(t.shieldT, dur); t.drawBar(true); }
function slow(t, mul, dur) { if (isSub(t, '방벽형')) mul = 1 - (1 - mul) * 0.6; t.slowMul = Math.min(t.slowT > 0 ? t.slowMul : 1, mul); t.slowT = Math.max(t.slowT, dur); }
function knock(t, v) { const k = isSub(t, '방벽형') ? 0.6 : 1; t.vel.addScaledVector(v, k); if (v.y > 0) t.onGround = false; }
function kill(t, by) {
  t.alive = false; t.hp = 0; t.deaths++; t.respawnT = 4; t.deathT = 0; t.beamOn = false; t.ironT = 0;
  if (t.wall) { t.wall.up = false; t.wall.mesh.visible = false; }
  if (by && by !== t) { by.kills++; if (by.isPlayer) { hitMarker('kill'); SFX.kill(); killBanner(t); } if (by.hero === 'phase') { by.ammo = by.H.mag; by.reloadT = 0; } }
  deathBurst(t);
  feed(by, t);
  if (t.isPlayer) showCenter('처치당했습니다', '', 2.5);
}
function feed(by, t) {
  const d = document.createElement('div'), cls = (u) => u.team === 'blue' ? 'b' : 'r';
  d.innerHTML = by && by !== t ? `<span class="${cls(by)}">${by.name}</span> <i>${by.H.name}</i> ✕ <span class="${cls(t)}">${t.name}</span>` : `<span class="${cls(t)}">${t.name}</span> 쓰러짐`;
  d.style.borderLeftColor = (by || t).team === 'blue' ? '#3db8ff' : '#ff4d5e';
  $('feed').prepend(d); setTimeout(() => d.remove(), 5000);
  while ($('feed').children.length > 5) $('feed').lastChild.remove();
}

// 방벽·돔과 광선
function wallHit(wl, o, d, best) {
  const den = d.dot(wl.n); if (Math.abs(den) < 1e-4) return -1;
  if (_w.subVectors(o, wl.c).dot(wl.n) <= 0) return -1;      // 앞쪽에서 오는 공격만 막음
  const t = _w.subVectors(wl.c, o).dot(wl.n) / den; if (t < 0 || t > best) return -1;
  const p = _v.copy(o).addScaledVector(d, t).sub(wl.c);
  return Math.abs(p.dot(wl.r)) < wl.w / 2 && Math.abs(p.y) < wl.h / 2 ? t : -1;
}
function raySphereT(o, d, c, r) {
  _w.subVectors(o, c); const bq = _w.dot(d), cq = _w.lengthSq() - r * r, disc = bq * bq - cq;
  if (disc < 0) return -1; const t = -bq - Math.sqrt(disc); return t >= 0 ? t : -1;
}
function trace(shooter, o, d, maxD, allies = false) {
  let best = rayBoxes(o, d, maxD), hit = null, head = false;
  for (const u of units) {
    if (!u.alive || u === shooter || (allies ? u.team !== shooter.team : u.team === shooter.team)) continue;
    if (u.pos.distanceToSquared(o) > (best + 2) ** 2) continue;
    for (const s of u.hitSpheres()) { const t = raySphereT(o, d, s.c, s.r); if (t >= 0 && t < best) { best = t; hit = u; head = !!s.head; } }
  }
  if (allies) return { t: best, hit, head };
  for (const dc of decoys) {
    if (dc.team === shooter.team) continue;
    const t = raySphereT(o, d, _ctr.set(dc.pos.x, dc.pos.y + 1, dc.pos.z), 0.45);
    if (t >= 0 && t < best) { best = t; hit = dc; head = false; }
  }
  for (const u of units) {
    if (!u.wall || !u.wall.up || u.team === shooter.team || !u.alive) continue;
    const t = wallHit(u.wall, o, d, best); if (t >= 0) { best = t; hit = u.wall; head = false; }
  }
  for (const dm of domes) {
    if (dm.team === shooter.team || o.distanceTo(dm.pos) < dm.r) continue;
    const t = raySphereT(o, d, dm.pos, dm.r); if (t >= 0 && t < best) { best = t; hit = dm; head = false; }
  }
  return { t: best, hit, head };
}
function applyHit(u, r, amt, at, d, headMul = 2) {
  if (!r.hit) return;
  if (r.hit.isDecoy) { r.hit.t = 0; if (u.isPlayer) hitMarker(''); return; }
  if (r.hit.max !== undefined && r.hit.mesh && r.hit.up !== undefined) { hitWall(r.hit, amt, u, at); return; }
  if (r.hit.isDome) { spark(at, 0xffa050, 0.15, 0.1); return; }
  damage(r.hit, amt, u, { head: r.head, headMul, at, dir: d });
  spark(at, r.head ? 0xff5050 : 0xffffff);
}
function hitWall(wl, amt, by, at) {
  wl.hp -= amt; wl.lastHit = gameT; if (by) addUlt(by, amt * 0.5);
  if (at) spark(at, 0x9fdcff, 0.15, 0.08);
  if (by && by.isPlayer) { hitMarker(''); SFX.barrierHit(1); }
  if (wl.hp <= 0) { wl.hp = 0; wl.up = false; wl.brokenT = 5; wl.mesh.visible = false; SFX.boom(0.4); }
}
function explode(p, owner, dmg, r, o = {}) {
  SFX.boom(vol(p) * (o.vol ?? 1)); ringFx(p.clone().setY(p.y - 0.2), o.col ?? 0xff8a2a, r, 0.4); spark(p, 0xffc080, r * 0.45, 0.28);
  for (const u of units) {
    if (!u.alive || u.team === owner.team) continue;
    const c = u.center.clone(), dd = c.distanceTo(p);
    if (dd > r + 0.4) continue;
    if (!los(p, c) && !los(p, u.eye.clone())) continue;
    if (domes.some(dm => dm.team === u.team && c.distanceTo(dm.pos) < dm.r && p.distanceTo(dm.pos) > dm.r)) continue;
    damage(u, dmg * (1 - 0.5 * clamp(dd / r, 0, 1)), owner, { at: c });
    if (o.kb) knock(u, c.clone().sub(p).setY(0).normalize().multiplyScalar(o.kb).setY(3));
  }
  for (const dc of decoys) if (dc.team !== owner.team && dc.pos.distanceTo(p) < r) dc.t = 0;
  if (owner.isPlayer && camera.position.distanceTo(p) < 8) shake = 0.25;
}

// ============================================================ 무기
const _sd = V3();
const spreadDir = (d, s) => _sd.set(d.x + rand(-s, s), d.y + rand(-s, s), d.z + rand(-s, s)).normalize().clone();
const falloff = (dist, a, b) => dist <= a ? 1 : dist >= b ? 0.5 : 1 - 0.5 * (dist - a) / (b - a);
function muzzlePos(u, out = V3(), i = 0) {
  if (u.isPlayer) return vmMuzzle(out, i);
  const m = u.muzzles[i % Math.max(1, u.muzzles.length)];
  if (m) { m.getWorldPosition(out); return out; }
  return out.copy(u.eye);
}
function canFire(u) {
  if (u.blindT > 0 && !u.isPlayer) return false;
  if (u.wall && u.wall.up && !u.H.barrier.canShoot) return false;
  if (u.dash > 0 || u.grapT > 0) return false;
  return true;
}
function hitscan(u, dir, spread, dmg, near, far, maxD, col, life, headMul = 2) {
  const o = u.eye.clone(), d = spreadDir(dir, spread), r = trace(u, o, d, maxD);
  const end = o.clone().addScaledVector(d, r.t);
  if (r.hit) applyHit(u, r, dmg * falloff(r.t, near, far), end, d, headMul);
  else if (r.t < maxD - 0.01) impact(end, d, col, u.isPlayer);
  tracer(muzzlePos(u, V3(), u.alt || 0), end, col, life);
  return r;
}
function fire(u, dir, alt = false) {
  if (!canFire(u)) return false;
  if (u.H.melee) return swing(u);
  if (u.reloadT > 0 || u.fireT > 0) return false;
  if (u.H.mag && u.ammo <= 0) { startReload(u); return false; }
  const H = u.H, v = u.isPlayer ? 1 : vol(u.pos) * 0.7;
  u.fireT = H.rate; if (H.mag) u.ammo--;
  switch (u.hero) {
    case 'ratchet': {
      const mp = muzzlePos(u), o = u.eye.clone();
      for (let i = 0; i < 10; i++) {
        const d = spreadDir(dir, 0.055), r = trace(u, o, d, 60), end = o.clone().addScaledVector(d, r.t);
        if (r.hit) applyHit(u, r, 9 * falloff(r.t, 10, 24), end, d);
        else if (r.t < 59.9 && i % 2 === 0) impact(end, d, 0xffd9a0, u.isPlayer && i === 0);
        tracer(mp, end, 0xffd9a0, 0.05);
      }
      SFX.shotgun(v); if (u.isPlayer) kick(0.09, 0.06); break;
    }
    case 'tick': {
      u.alt = (u.alt || 0) ^ 1;
      hitscan(u, dir, 0.01 + (Math.hypot(u.vel.x, u.vel.z) > 1 ? 0.006 : 0), 12, 18, 35, 80, 0xff9a3c, 0.04);
      SFX.pistol(v); if (u.isPlayer) kick(0.025, 0.012); break;
    }
    case 'orbit': {
      hitscan(u, dir, 0.012 + (Math.hypot(u.vel.x, u.vel.z) > 1 ? 0.008 : 0), 9, 20, 35, 80, 0xffa050, 0.04);
      SFX.rifle(v); if (u.isPlayer) kick(0.02, 0.008); break;
    }
    case 'iko': {
      const r = hitscan(u, dir, 0.014, 10, 18, 32, 70, 0xffb36b, 0.04);
      if (r.hit && !r.hit.isDecoy && r.hit.team && r.hit.team !== u.team) {
        for (const a of units) if (a !== u && a.alive && a.team === u.team && a.pos.distanceTo(u.pos) < 10) heal(a, 6, u);
      }
      SFX.nanorifle(v); if (u.isPlayer) kick(0.02, 0.008); break;
    }
    case 'lumen': {
      hitscan(u, dir, 0.004, 26, 30, 50, 70, 0xffb36b, 0.09, 1.5);
      SFX.staff(v); if (u.isPlayer) kick(0.03, 0.015); break;
    }
    case 'mora': {
      if (alt) {
        u.fireT = 0.55;
        const o = u.eye.clone(), d = spreadDir(dir, 0.003), r = trace(u, o, d, 60, true), end = o.clone().addScaledVector(d, r.t);
        if (r.hit) { heal(r.hit, 65, u); ringFx(r.hit.pos, 0x35c6c4, 1, 0.3); if (u.isPlayer) hitMarker(''); }
        tracer(muzzlePos(u), end, 0x35c6c4, 0.1);
      } else hitscan(u, dir, 0.006, 22, 22, 40, 70, 0xff6aa8, 0.06);
      SFX.medpistol(v); if (u.isPlayer) kick(0.03, 0.02); break;
    }
    case 'phase': {
      const o = muzzlePos(u, V3());
      launch(u, 'gren', o, dir.clone().multiplyScalar(26).add(V3(0, 1.5, 0)), { grav: 10, r: 0.16, col: 0x35c6c4 });
      SFX.launcher(v); if (u.isPlayer) kick(0.08, 0.04); break;
    }
    case 'aria': {
      const ch = clamp(u.drawT / H.charge, 0.15, 1); u.drawT = 0;
      hitscan(u, dir, 0.002 + (1 - ch) * 0.01, 30 + 85 * ch, 60, 90, 120, 0xe8d8b0, 0.12 + ch * 0.1);
      SFX.bow(v); if (u.isPlayer) kick(0.05, 0.01); break;
    }
  }
  if (H.mag && u.ammo <= 0 && H.reload) startReload(u);
  return true;
}
function swing(u) {
  if (u.fireT > 0) return false;
  u.fireT = u.H.rate; u.swingT = 0.35;
  const d = u.aimDir(), e = u.eye.clone(); let hitAny = false;
  for (const t of units) {
    if (!t.alive || t.team === u.team) continue;
    _v.subVectors(t.center, e); const L = _v.length();
    if (L < 4.8 && _v.normalize().dot(d) > 0.45) { damage(t, 70, u, { at: t.center.clone(), dir: d }); knock(t, d.clone().setY(0).normalize().multiplyScalar(4)); hitAny = true; }
  }
  for (const t of units) if (t.wall && t.wall.up && t.team !== u.team && t.wall.c.distanceTo(e) < 4.5) { hitWall(t.wall, 70, u, t.wall.c.clone()); hitAny = true; }
  for (const dc of decoys) if (dc.team !== u.team && dc.pos.distanceTo(u.pos) < 4.5) dc.t = 0;
  SFX.hammer(u.isPlayer ? 1 : vol(u.pos)); if (hitAny) noise(0.15, 300, 0.4 * (u.isPlayer ? 1 : vol(u.pos)));
  if (u.isPlayer) { vmSwing = 1; shake = hitAny ? 0.15 : 0; }
  return true;
}
function startReload(u) { if (!u.H.reload || u.reloadT > 0 || u.ammo === u.H.mag) return; u.reloadT = u.H.reload; if (u.isPlayer) SFX.reload(); }
function melee(u) {
  if (u.meleeT > 0) return; u.meleeT = 0.8;
  if (u.hero === 'nok') return swing(u);
  const d = u.aimDir();
  for (const t of units) {
    if (!t.alive || t.team === u.team) continue;
    _v.subVectors(t.center, u.eye); const L = _v.length();
    if (L < 2.6 && _v.normalize().dot(d) > 0.55) { damage(t, 30, u, { at: t.center.clone(), dir: d }); knock(t, d.clone().multiplyScalar(4)); }
  }
  if (u.isPlayer) { vmPunch = 0.25; noise(0.1, 800, 0.2); }
}

// ---- 투사체
function launch(owner, kind, pos, vel, o = {}) {
  const m = new THREE.Mesh(kind === 'flash' ? new THREE.CylinderGeometry(0.07, 0.07, 0.18, 10) : new THREE.SphereGeometry(o.r || 0.15, 10, 8), new THREE.MeshBasicMaterial({ color: o.col ?? 0xff8a2a, toneMapped: false }));
  m.position.copy(pos); scene.add(m);
  projs.push({ owner, team: owner.team, kind, pos: pos.clone(), vel, grav: o.grav ?? 9, r: o.r || 0.15, t: o.life ?? 4, m, stuck: null, fuse: o.fuse ?? -1, offset: null });
}
function projTick(dt) {
  for (let i = projs.length - 1; i >= 0; i--) {
    const p = projs[i]; p.t -= dt;
    let boom = p.t <= 0, hitU = null;
    if (p.stuck) {
      if (p.stuck.unit) { if (p.stuck.unit.alive) p.pos.copy(p.stuck.unit.pos).add(p.offset); }
      p.fuse -= dt; if (p.fuse <= 0) boom = true;
    } else {
      p.vel.y -= p.grav * dt;
      const step = p.vel.length() * dt, dir = p.vel.clone().normalize();
      let tHit = rayBoxes(p.pos, dir, step + p.r);
      for (const u of units) {
        if (!u.alive || u.team === p.team) continue;
        for (const s of u.hitSpheres()) { const t = raySphereT(p.pos, dir, s.c, s.r + p.r); if (t >= 0 && t < tHit) { tHit = t; hitU = u; } }
        if (u.wall && u.wall.up) { const t = wallHit(u.wall, p.pos, dir, tHit); if (t >= 0) { tHit = t; hitU = u.wall; } }
      }
      for (const dm of domes) if (dm.team !== p.team && p.pos.distanceTo(dm.pos) > dm.r) { const t = raySphereT(p.pos, dir, dm.pos, dm.r); if (t >= 0 && t < tHit) { tHit = t; hitU = dm; } }
      if (tHit <= step + p.r) {
        p.pos.addScaledVector(dir, Math.max(0, tHit - 0.05));
        if (p.kind === 'sticky') {
          p.stuck = { unit: hitU && hitU.hp !== undefined && hitU.H ? hitU : null };
          if (p.stuck.unit) p.offset = p.pos.clone().sub(p.stuck.unit.pos);
          p.vel.set(0, 0, 0); p.fuse = 1.4; p.m.material.color.setHex(0xff3d8a);
        } else if (p.kind === 'flash') {
          if (!hitU) { p.vel.multiplyScalar(-0.25); p.vel.y = Math.abs(p.vel.y) * 0.5; } else boom = true;
          if (p.t > 0.9) p.t = 0.9;
        } else { boom = true; if (hitU && hitU.H) p.direct = hitU; if (hitU && hitU.up !== undefined) hitWall(hitU, 40, p.owner, p.pos.clone()); }
      } else p.pos.addScaledVector(dir, step);
      if (p.kind === 'flash' && p.t <= 0) boom = true;
    }
    p.m.position.copy(p.pos);
    if (!p.stuck && Math.random() < 0.6) spark(p.pos, p.kind === 'gren' ? 0x6ff0ec : 0xffb36b, 0.05, 0.15);
    if (boom) {
      if (p.kind === 'gren') { if (p.direct) damage(p.direct, 15, p.owner, { at: p.pos.clone() }); explode(p.pos, p.owner, 55, 2.6, { col: 0x35c6c4 }); }
      else if (p.kind === 'sticky') explode(p.pos, p.owner, 90, 3, { col: 0xff3d8a, kb: 5 });
      else if (p.kind === 'flash') flashBang(p.pos, p.owner);
      scene.remove(p.m); p.m.geometry.dispose(); projs.splice(i, 1);
    }
  }
}
function flashBang(p, owner) {
  SFX.flash(vol(p)); spark(p, 0xffffff, 2.5, 0.25);
  for (const u of units) {
    if (!u.alive || u.team === owner.team) continue;
    const e = u.eye.clone(); if (e.distanceTo(p) > 6.5 || !los(p, e)) continue;
    u.blindT = 1.8; damage(u, 15, owner, { at: e });
    if (u.isPlayer) $('flash').style.opacity = 1;
  }
}

// ============================================================ 스킬
function pickAlly(u, range, cosMin) {
  const d = u.aimDir(); let best = null, bd = cosMin;
  for (const t of units) {
    if (t === u || !t.alive || t.team !== u.team) continue;
    _v.subVectors(t.center, u.eye); const L = _v.length(); if (L > range) continue;
    const c = _v.normalize().dot(d);
    if (c > bd && los(u.eye.clone(), t.center.clone())) { bd = c; best = t; }
  }
  return best;
}
function aimPoint(u, maxD) {
  const d = u.aimDir(), o = u.eye.clone(), t = rayBoxes(o, d, maxD), p = o.addScaledVector(d, Math.min(t, maxD) - 0.1);
  p.y = groundAt(p.x, p.z, p.y + 0.3); return p;
}
const holoMat = new THREE.MeshBasicMaterial({ color: 0x66c8ff, transparent: true, opacity: 0.45, toneMapped: false, depthWrite: false });
function zoneMesh(r, col, op = 0.22) {
  const g = new THREE.Group();
  const disk = new THREE.Mesh(new THREE.CircleGeometry(r, 48), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: op, toneMapped: false, depthWrite: false }));
  disk.rotation.x = -Math.PI / 2;
  const ring = new THREE.Mesh(new THREE.RingGeometry(r - 0.15, r, 64), new THREE.MeshBasicMaterial({ color: col, toneMapped: false, transparent: true, opacity: 0.9, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; g.add(disk, ring); scene.add(g); return g;
}
function addZone(z) { z.mesh = z.mesh || zoneMesh(z.r, z.col, z.op); z.mesh.position.copy(z.pos).y += 0.06; zones.push(z); return z; }

function useAb1(u) {
  const H = u.H;
  if (u.wall) {
    if (u.wall.brokenT > 0) return false;
    u.wall.up = !u.wall.up; u.wall.mesh.visible = u.wall.up; SFX.barrier(); return true;
  }
  if (u.hero === 'tick') { if (u.charges <= 0) return false; } else if (u.cd1 > 0) return false;
  switch (u.hero) {
    case 'ratchet': { const d = u.fwd; u.dash = 0.38; u.dashDir = d; u.dashHit = new Set(); u.cd1 = u.ironT > 0 ? 1 : H.ab1.cd; SFX.dash(vol(u.pos)); break; }
    case 'tick': {
      const mv = (u.moveDir && u.moveDir.lengthSq() > 0.01 ? u.moveDir.clone() : u.fwd).normalize();
      const o = V3(u.pos.x, u.pos.y + 0.9, u.pos.z), dist = Math.max(0, Math.min(7, rayBoxes(o, mv, 7) - 0.6)), from = u.pos.clone();
      u.pos.addScaledVector(mv, dist); trailFx(from, u.pos.clone(), 0xff8a2a);
      u.charges--; if (u.chargeT <= 0) u.chargeT = H.ab1.cd; SFX.blink(vol(u.pos)); return true;
    }
    case 'lumen': { const t = pickAlly(u, 25, 0.93) || u; t.boostT = 3; giveShield(t, 75, 3); ringFx(t.pos, 0xffb36b, 1.4); SFX.heal(vol(u.pos)); u.cd1 = H.ab1.cd; break; }
    case 'aria': {
      const d = u.aimDir(), o = u.eye.clone(), t = rayBoxes(o, d, 24);
      if (t >= 24) return false;
      u.grapPt = o.addScaledVector(d, t - 0.5); u.grapT = 0.8; u.cd1 = H.ab1.cd;
      tracer(muzzlePos(u), u.grapPt, 0xe8d8b0, 0.6); SFX.bow(vol(u.pos)); break;
    }
    case 'phase': {
      const d = (u.moveDir && u.moveDir.lengthSq() > 0.01 ? u.moveDir.clone() : u.fwd).normalize();
      u.vel.set(d.x * 7, 11.5, d.z * 7); u.onGround = false;
      explode(u.pos.clone().setY(u.pos.y + 0.3), u, 25, 2.5, { col: 0xff3d8a, vol: 0.6 }); u.cd1 = H.ab1.cd; break;
    }
    case 'mora': {
      addZone({ kind: 'speed', pos: u.pos.clone(), r: 5, t: 5, team: u.team, owner: u, col: 0x35c6c4 }); SFX.heal(vol(u.pos)); u.cd1 = H.ab1.cd; break;
    }
    case 'iko': {
      const t = pickAlly(u, 30, 0.9) || u; giveShield(t, 150, 5);
      droneFx(t, 5); SFX.heal(vol(u.pos)); u.cd1 = H.ab1.cd; break;
    }
  }
  return true;
}
function useAb2(u) {
  if (u.cd2 > 0) return false;
  const H = u.H;
  switch (u.hero) {
    case 'ratchet': {
      if (!u.onGround) return false;
      const d = u.fwd; u.vel.set(d.x * 7, 10.5, d.z * 7); u.slam = 1; u.onGround = false; SFX.dash(vol(u.pos)); break;
    }
    case 'tick': {
      const m = cloneModel('tick'); m.traverse(o => { if (o.isMesh) { o.material = holoMat; o.castShadow = false; } }); scene.add(m);
      decoys.push({ isDecoy: true, team: u.team, owner: u, pos: u.pos.clone(), dir: u.fwd, t: 4.5, m, name: '분신', rig: templates.tick.userData.ai ? makeRig(m) : null }); SFX.blink(vol(u.pos)); break;
    }
    case 'lumen': { addZone({ kind: 'heal', pos: aimPoint(u, 16), r: 4, t: 5, team: u.team, owner: u, col: 0xffa050 }); SFX.heal(vol(u.pos)); break; }
    case 'orbit': {
      ringFx(u.pos, 0xffa050, 5.5, 0.35); SFX.boom(vol(u.pos) * 0.5);
      for (const t of units) if (t.alive && t.team !== u.team && t.pos.distanceTo(u.pos) < 5.5) {
        damage(t, 30, u, { at: t.center.clone() }); knock(t, t.pos.clone().sub(u.pos).setY(0).normalize().multiplyScalar(10).setY(4));
      }
      break;
    }
    case 'nok': {
      const f = u.fwd, r = V3(-f.z, 0, f.x);
      for (let k = 1; k <= 6; k++) setTimeout(() => ringFx(u.pos.clone().addScaledVector(f, k * 2), 0xd8b070, 1.6, 0.35), k * 40);
      SFX.boom(vol(u.pos) * 0.6);
      for (const t of units) {
        if (!t.alive || t.team === u.team) continue;
        const dv = t.pos.clone().sub(u.pos), a = dv.dot(f), l = Math.abs(dv.dot(r));
        if (a > 0 && a < 12.5 && l < 1.8 && Math.abs(dv.y) < 2) { damage(t, 50, u, { at: t.center.clone() }); slow(t, 0.6, 2); t.vel.y = 3; t.onGround = false; }
      }
      break;
    }
    case 'aria': {
      const p = aimPoint(u, 40); p.y += 0.3; tracer(muzzlePos(u), p, 0x9fdcff, 0.3); ringFx(p, 0x9fdcff, 10, 0.8);
      for (const t of units) if (t.alive && t.team !== u.team && t.pos.distanceTo(p) < 10) t.revealT = 4;
      SFX.blink(vol(u.pos)); break;
    }
    case 'phase': { launch(u, 'sticky', muzzlePos(u, V3()), u.aimDir().multiplyScalar(20).add(V3(0, 2, 0)), { grav: 10, r: 0.12, col: 0xff8ac0, life: 6 }); SFX.launcher(vol(u.pos) * 0.7); break; }
    case 'mora': { launch(u, 'flash', muzzlePos(u, V3()), u.aimDir().multiplyScalar(16).add(V3(0, 3, 0)), { grav: 14, r: 0.1, col: 0xffffff, life: 1.4 }); break; }
    case 'iko': {
      ringFx(u.pos, 0x7fd6ff, 9, 0.5); SFX.heal(vol(u.pos));
      for (const t of units) if (t.alive && t.team === u.team && t.pos.distanceTo(u.pos) < 9) { t.slowT = 0; t.blindT = 0; heal(t, 60, u); if (t.isPlayer) $('flash').style.opacity = 0; }
      break;
    }
  }
  u.cd2 = H.ab2.cd;
  return true;
}
function useUlt(u) {
  if (u.ult < u.H.ult.cost) return false;
  u.ult = u.ultBank || 0; u.ultBank = 0; SFX.ult(u.isPlayer ? 1 : vol(u.pos));
  switch (u.hero) {
    case 'ratchet': u.ironT = 6; u.cd1 = 0; ringFx(u.pos, 0x35c6c4, 2); break;
    case 'tick':
      for (let i = 0; i < 3; i++) {
        const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.18, 0), new THREE.MeshBasicMaterial({ color: 0xff8a2a, toneMapped: false }));
        const p = u.eye.clone().add(V3(rand(-0.6, 0.6), 0.6, rand(-0.6, 0.6))); m.position.copy(p); scene.add(m);
        drones.push({ pos: p, vel: u.aimDir().multiplyScalar(8).add(V3(0, 3, 0)), owner: u, team: u.team, t: 7, m, delay: i * 0.25, target: null });
      }
      break;
    case 'lumen':
      for (const t of units) if (t.alive && t.team === u.team && t.pos.distanceTo(u.pos) < 18) { heal(t, 300, u); giveShield(t, 100, 5); ringFx(t.pos, 0xffb36b, 1.2); }
      ringFx(u.pos, 0xffd28a, 18, 0.7); break;
    case 'orbit': {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(6, 32, 16), new THREE.MeshBasicMaterial({ color: u.team === 'blue' ? 0x6fd0ff : 0xff7a88, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }));
      const wire = new THREE.Mesh(new THREE.IcosahedronGeometry(6.02, 2), new THREE.MeshBasicMaterial({ color: 0xffa050, wireframe: true, transparent: true, opacity: 0.35, toneMapped: false }));
      mesh.add(wire); mesh.position.copy(u.pos); scene.add(mesh);
      domes.push({ isDome: true, pos: u.pos.clone().setY(u.pos.y + 0.5), r: 6, team: u.team, t: 6, mesh }); break;
    }
    case 'nok':
      ringFx(u.pos, 0xd8b070, 12, 0.6);
      for (const t of units) {
        if (!t.alive) continue;
        if (t.team === u.team && t.pos.distanceTo(u.pos) < 12) t.roarT = 6;
        else if (t.team !== u.team && t.pos.distanceTo(u.pos) < 10) { damage(t, 40, u, { at: t.center.clone() }); slow(t, 0.65, 3); }
      }
      break;
    case 'aria': addZone({ kind: 'rain', pos: aimPoint(u, 45), r: 6, t: 3, team: u.team, owner: u, col: 0xff4d5e, op: 0.12 }); break;
    case 'phase': {
      const c = aimPoint(u, 50);
      for (let i = 0; i < 3; i++) {
        const p = c.clone().add(V3(rand(-2, 2), 0, rand(-2, 2)));
        addZone({ kind: 'mortar', pos: p, r: 4, t: 0.7 + i * 0.6, team: u.team, owner: u, col: 0xff3d3d, op: 0.15 });
      }
      break;
    }
    case 'mora':
      for (const t of units) if (t.alive && t.team === u.team && t.pos.distanceTo(u.pos) < 15) { heal(t, 200, u); t.ammo = t.H.mag; t.reloadT = 0; t.dmgBuffT = 6; ringFx(t.pos, 0xff3d8a, 1.2); }
      ringFx(u.pos, 0x35c6c4, 15, 0.7); break;
    case 'iko': addZone({ kind: 'cloud', pos: u.pos.clone(), r: 7, t: 6, team: u.team, owner: u, col: 0x7fd6ff, op: 0.2 }); break;
  }
  if (u.isPlayer) showCenter(u.H.ult.name + '!', '', 1.2);
  return true;
}

// 매 프레임: 유닛 상태
function tickUnit(u, dt) {
  if (!u.alive) {
    u.deathT += dt; u.respawnT -= dt;
    if (u.deathT < 0.5) u.model.rotation.x = -Math.PI / 2 * (u.deathT / 0.5) * 0.98;
    if (u.deathT > 2.5) { u.model.visible = false; u.ring.visible = false; u.hpSprite.visible = false; }
    if (u.respawnT <= 0 && matchState !== 'end') respawn(u);
    return;
  }
  u.fireT -= dt; u.meleeT -= dt; u.swingT -= dt;
  if (u.reloadT > 0) { u.reloadT -= dt; if (u.reloadT <= 0) u.ammo = u.H.mag; }
  u.cd1 = Math.max(0, u.cd1 - dt); u.cd2 = Math.max(0, u.cd2 - dt);
  if (u.hero === 'tick' && u.charges < 2) { u.chargeT -= dt; if (u.chargeT <= 0) { u.charges++; u.chargeT = u.charges < 2 ? u.H.ab1.cd : 0; } }
  if (u.shieldT > 0) { u.shieldT -= dt; if (u.shieldT <= 0) { u.shield = 0; u.drawBar(true); } }
  for (const k of ['boostT', 'ironT', 'roarT', 'dmgBuffT', 'slowT', 'blindT', 'revealT', 'noDieT', 'zoneSpdT']) if (u[k] > 0) u[k] -= dt;
  if (u.wall) {
    const wl = u.wall;
    if (wl.brokenT > 0) { wl.brokenT -= dt; if (wl.brokenT <= 0) wl.hp = wl.max * 0.3; }
    else if (!wl.up && gameT - wl.lastHit > 2) wl.hp = Math.min(wl.max, wl.hp + 130 * dt);
    const f = u.fwd; wl.n.copy(f); wl.r.set(-f.z, 0, f.x);
    wl.c.set(u.pos.x, u.pos.y + wl.h / 2 + 0.05, u.pos.z).addScaledVector(f, 1.3);
    if (wl.up) { wl.mesh.position.copy(wl.c); wl.mesh.rotation.set(0, u.yaw, 0); wl.mesh.material.opacity = 0.18 + 0.25 * wl.hp / wl.max; }
  }
  if (inSpawn(u) && u.hp < u.maxHp) heal(u, 150 * dt, null);
  for (const p of packs) if (p.active && u.hp < u.maxHp && Math.abs(u.pos.y - p.pos.y) < 1.2 && Math.hypot(u.pos.x - p.pos.x, u.pos.z - p.pos.z) < 1.1) {
    heal(u, 150, null); p.active = false; p.t = 12; p.g.visible = false; if (u.isPlayer) SFX.pack();
  }
  if (u.dash > 0) {
    u.dash -= dt; u.vel.x = u.dashDir.x * 22; u.vel.z = u.dashDir.z * 22;
    for (const t of units) {
      if (!t.alive || t.team === u.team || u.dashHit.has(t)) continue;
      if (t.pos.distanceTo(u.pos) < 1.4) { u.dashHit.add(t); damage(t, 45, u, { at: t.center.clone() }); knock(t, u.dashDir.clone().multiplyScalar(9).setY(4)); noise(0.2, 300, 0.4 * vol(t.pos)); }
    }
    if (u.dash <= 0 || u.hitWall) { u.dash = 0; u.vel.x *= 0.2; u.vel.z *= 0.2; giveShield(u, 40, 2); }
  }
  if (u.grapT > 0) {
    u.grapT -= dt;
    const d = u.grapPt.clone().sub(u.eye); const L = d.length();
    if (L < 1.2 || u.grapT <= 0) { u.grapT = 0; u.vel.multiplyScalar(0.4); u.vel.y = 5; }
    else { u.vel.copy(d.normalize().multiplyScalar(19)); u.gravScale = 0; }
  } else u.gravScale = 1;
  u.hitWall = false;
  if (u.slam && u.landed && u.vel.y === 0) {
    u.slam = 0; SFX.boom(vol(u.pos)); ringFx(u.pos, 0x35c6c4, 5, 0.5);
    for (const t of units) {
      if (!t.alive || t.team === u.team) continue;
      const dd = t.pos.distanceTo(u.pos);
      if (dd < 5 && Math.abs(t.pos.y - u.pos.y) < 2.5) { damage(t, 70 * (1 - dd / 8), u, { at: t.center.clone() }); knock(t, V3(0, 6, 0)); }
    }
    if (u.isPlayer) shake = 0.35;
  }
  u.landed = false;
}
function speedOf(u) {
  let s = u.H.speed;
  if (u.boostT > 0) s *= 1.35; if (u.zoneSpdT > 0) s *= 1.3; if (u.slowT > 0) s *= u.slowMul;
  if (u.wall && u.wall.up) s *= u.H.barrier.slow; if (u.crouch) s *= 0.55;
  if (u.hero === 'aria' && u.drawT > 0) s *= 0.75;
  return s;
}

// ============================================================ 봇 AI
function newBrain(u) {
  const s = u.team === 'blue' ? 1 : -1, vs = ctx.def.vias, v = vs[Math.random() * vs.length | 0];
  const via = v.y ? V3(v.x, v.y, v.z * s) : randomFreeNear(v.x, v.z * s, 3, 0.6);
  // 일부는 높은 곳(퍼치)을 잡고 거점을 내려다봄 — 저격수일수록 자주
  const pc = { aria: 0.75, phase: 0.4, lumen: 0.3, tick: 0.25, mora: 0.25, iko: 0.2, orbit: 0.1 }[u.hero] || 0;
  let perch = null;
  if (ctx.def.perches && Math.random() < pc) { const q = ctx.def.perches[Math.random() * ctx.def.perches.length | 0]; perch = V3(q.x, q.y, q.z * s); }
  const goal = perch ? randomFreeNear(perch.x, perch.z, 1.5, perch.y + 0.3, perch.y - 0.3) : randomFreeNear(0, 0, ctx.pointR * 0.6);
  const path = findPath(u.pos, via).concat(findPath(via, goal));
  return { path, perch, target: null, react: 0, strafe: rand(0, 6), stuckT: 0, lastPos: u.pos.clone(), think: 0, attacker: null, wander: null, repathT: 0 };
}
function aimTargetPoint(u, t) {
  if (t.isDecoy) return t.pos.clone().setY(t.pos.y + 1.2);
  const p = t.center.clone().setY(t.pos.y + 1.25 * t.H.H);
  if (u.H.lob) {
    const d = p.distanceTo(u.eye), tt = d / 26;
    p.addScaledVector(t.vel, tt * 0.8); p.y += 0.5 * 10 * tt * tt - 1.5 * tt;
  }
  return p;
}
function botTick(u, dt) {
  const b = u.bot, D = DIFF[opts.diff];
  b.think -= dt; b.repathT -= dt;
  if (b.think <= 0) {
    b.think = 0.25;
    let best = null, bd = 48;
    const e = u.eye.clone();
    for (const t of [...units.filter(t => t.alive && t.team !== u.team), ...decoys.filter(d => d.team !== u.team)]) {
      const tc = t.isDecoy ? t.pos.clone().setY(t.pos.y + 1.2) : t.center.clone();
      let d = tc.distanceTo(e); if (t === b.attacker) d *= 0.6; if (t.isDecoy) d *= 0.7; if (t.revealT > 0) d *= 0.8;
      if (!t.isDecoy) d *= 0.65 + 0.35 * (t.hp + t.shield) / t.maxHp; if (t === b.target) d *= 0.8;
      if (d < bd && los(e, tc)) { bd = d; best = t; }
    }
    if (best && best !== b.target) { b.react = b.target ? D.react * 0.5 : D.react; b.settle = 0; }
    b.target = best;
    // 아프면 엄폐: 적에게서 안 보이는 가까운 곳으로 잠깐 물러남
    if (best && !best.isDecoy && u.hp / u.maxHp < 0.4 && !b.retreatT && Math.random() < 0.5 && u.H.role !== 'tank') {
      const te = best.eye.clone(); let pick = null;
      for (let k = 0; k < 10 && !pick; k++) { const q = randomFreeNear(u.pos.x, u.pos.z, 7, u.pos.y + 0.6, u.pos.y - 1.5); if (!los(te, q.clone().setY(q.y + 1.3))) pick = q; }
      if (pick) { b.retreatT = 2.2; b.retreatPt = pick; }
    }
    b.heal = null;
    if (u.H.role === 'support') {
      let low = u.hero === 'mora' ? 0.75 : 0.9;
      for (const t of units) {
        if (t === u || !t.alive || t.team !== u.team) continue;
        const f = t.hp / t.maxHp, d = t.pos.distanceTo(u.pos);
        if (f < low && d < (u.hero === 'lumen' ? 17 : 30) && los(e, t.center.clone())) { low = f; b.heal = t; }
      }
    }
    b.goPack = null;
    if (u.hp / u.maxHp < 0.35) { let pd = 18; for (const p of packs) if (p.active && p.pos.distanceTo(u.pos) < pd) { pd = p.pos.distanceTo(u.pos); b.goPack = p; } }
  }
  b.react -= dt;
  if (b.retreatT > 0) { b.retreatT -= dt; if (b.retreatT <= 0) b.retreatT = 0; }
  // 이동 목표
  let goal = null;
  if (b.retreatT > 0) goal = b.retreatPt;
  else if (b.goPack) goal = b.goPack.pos;
  else if (b.path.length) { goal = b.path[0]; if (Math.hypot(goal.x - u.pos.x, goal.z - u.pos.z) < 1.4) b.path.shift(); }
  else {
    // 퍼치를 지키다가, 적이 거점을 거의 다 먹으면 내려가서 막음
    const enemy = u.team === 'blue' ? 'red' : 'blue';
    if (b.perch && ((point.capTeam === enemy && point.cap > 35 && !point.contested) || (point.owner === enemy && !point.contested && Math.random() < dt * 0.05))) { b.perch = null; b.repathT = 0; }
    const P = b.perch;
    if (!b.wander || Math.random() < dt * 0.5) b.wander = P ? randomFreeNear(P.x, P.z, 2, P.y + 0.3, P.y - 0.3) : randomFreeNear(0, 0, ctx.pointR * 0.75);
    goal = b.wander;
    const far = P ? Math.hypot(u.pos.x - P.x, u.pos.z - P.z) > 5 || Math.abs(u.pos.y - P.y) > 1 : Math.hypot(u.pos.x, u.pos.z) > ctx.pointR + 8;
    if (far && b.repathT <= 0) { b.repathT = 3; b.path = findPath(u.pos, P ? b.wander : randomFreeNear(0, 0, ctx.pointR * 0.6)); }
  }
  const mv = V3();
  if (goal) { mv.set(goal.x - u.pos.x, 0, goal.z - u.pos.z); if (mv.lengthSq() > 0.04) mv.normalize(); else mv.set(0, 0, 0); }
  const t = b.target;
  const healMode = u.H.role === 'support' && b.heal && (u.hero === 'lumen' || u.hero === 'mora');
  let aimAt = healMode ? b.heal.center.clone() : t ? aimTargetPoint(u, t) : null;
  if (u.blindT > 0) aimAt = null;
  u.beamOn = false;
  if (aimAt) {
    const dist = aimAt.distanceTo(u.eye);
    // 좌우 무빙: 무작위 간격으로 방향을 바꾸는 AD 무빙
    b.strafeT = (b.strafeT ?? 0) - dt;
    if (b.strafeT <= 0) { b.strafeDir = Math.random() < 0.5 ? -1 : 1; b.strafeT = rand(0.25, 0.9); if (opts.diff === 2 && u.onGround && Math.random() < 0.08) u.vel.y = 7; }
    const side = V3(Math.cos(u.yaw), 0, -Math.sin(u.yaw)).multiplyScalar((b.strafeDir || 1) * D.dodge * (u.wall && u.wall.up ? 0.3 : 0.85));
    if (!healMode && t && !b.goPack && !(b.retreatT > 0)) {
      const to = V3(aimAt.x - u.pos.x, 0, aimAt.z - u.pos.z).normalize(), want = u.H.want;
      if (dist > want + 3) mv.lerp(to, 0.6); else if (dist < want - 3) mv.lerp(to.negate(), 0.4); else mv.multiplyScalar(0.25);
    }
    mv.add(side);
    // 사람 같은 조준: 오차가 천천히 흔들리며, 같은 적을 오래 볼수록 줄어듦
    b.settle = Math.min(1, (b.settle || 0) + dt * 0.9);
    const tSpeed = t && !t.isDecoy ? Math.hypot(t.vel.x, t.vel.z) : 0, mySpeed = Math.hypot(u.vel.x, u.vel.z);
    const errM = healMode ? 0.05 : D.aimErr * (1.5 - 0.85 * b.settle) * (1 + tSpeed / 12 + mySpeed / 20) * (0.5 + dist / 40);
    b.aimOff ||= V3(); b.aimGoal ||= V3();
    if (!b.aimT || (b.aimT -= dt) <= 0) { b.aimT = rand(0.15, 0.45); b.aimGoal.set(rand(-1, 1), rand(-0.8, 0.8), rand(-1, 1)).multiplyScalar(errM); }
    b.aimOff.lerp(b.aimGoal, Math.min(1, dt * 6));
    const aimP = aimAt.clone().add(b.aimOff);
    const d = aimP.sub(u.eye), tyaw = Math.atan2(-d.x, -d.z), tpitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
    const dy = Math.atan2(Math.sin(tyaw - u.yaw), Math.cos(tyaw - u.yaw)), dp = tpitch - u.pitch, maxTurn = D.turn * dt;
    u.yaw += clamp(dy * Math.min(1, dt * 10), -maxTurn, maxTurn); u.pitch += clamp(dp * Math.min(1, dt * 10), -maxTurn, maxTurn);
    const off = Math.hypot(Math.atan2(Math.sin(tyaw - u.yaw), Math.cos(tyaw - u.yaw)), tpitch - u.pitch);
    const aligned = off < D.fireCone + 0.4 / Math.max(4, dist) && b.react <= 0;
    const ad = () => u.aimDir();
    if (healMode) {
      if (u.hero === 'lumen') { u.beamOn = true; u.healTarget = b.heal; }
      else if (aligned) fire(u, u.aimDir(), true);
    } else if (aligned && dist < u.H.range) {
      if (u.hero === 'aria') { u.drawT += dt; if (u.drawT >= u.H.charge * rand(0.7, 1)) fire(u, ad()); }
      else fire(u, ad());
    } else if (u.hero === 'aria') u.drawT = 0;
    botSkills(u, t, dist, b, side);
  } else {
    if (mv.lengthSq() > 0) { const ty = Math.atan2(-mv.x, -mv.z); u.yaw += Math.atan2(Math.sin(ty - u.yaw), Math.cos(ty - u.yaw)) * Math.min(1, dt * 5); }
    u.pitch *= 0.9; u.drawT = 0;
    if (u.H.mag && u.ammo < u.H.mag * 0.5) startReload(u);
    if (u.wall && u.wall.up) useAb1(u);
  }
  b.stuckT += dt;
  if (b.stuckT > 1.2) {
    if (u.pos.distanceTo(b.lastPos) < 0.6 && mv.lengthSq() > 0.1) { if (u.onGround) u.vel.y = 7; b.strafe += 2; if (Math.random() < 0.5) b.path = findPath(u.pos, randomFreeNear(0, 0, ctx.pointR * 0.6)); }
    b.stuckT = 0; b.lastPos.copy(u.pos);
  }
  if (mv.lengthSq() > 1) mv.normalize();
  u.moveDir = mv;
  if (u.dash <= 0 && u.grapT <= 0 && !u.slam) {
    const k = u.onGround ? 12 : 2, sp = speedOf(u);
    u.vel.x += (mv.x * sp - u.vel.x) * Math.min(1, dt * k); u.vel.z += (mv.z * sp - u.vel.z) * Math.min(1, dt * k);
  }
}
function botSkills(u, t, dist, b, side) {
  const r = Math.random, dt = 1 / 60, ult = u.ult >= u.H.ult.cost;
  const allies = (rad, f = 1) => units.filter(a => a.alive && a.team === u.team && a.pos.distanceTo(u.pos) < rad && a.hp / a.maxHp < f);
  const enemiesNear = (rad) => units.filter(a => a.alive && a.team !== u.team && a.pos.distanceTo(u.pos) < rad);
  switch (u.hero) {
    case 'ratchet':
      if (t && dist > 5 && dist < 13 && u.cd1 <= 0 && r() < dt * 90) useAb1(u);
      if (t && dist < 7 && u.cd2 <= 0 && r() < dt * 50) useAb2(u);
      if (ult && t && dist < 10) useUlt(u); break;
    case 'orbit': {
      const want = !!(t && dist > 6 && u.wall.hp > u.wall.max * 0.25 && u.lastHurt > gameT - 2);
      if (want !== u.wall.up && (want || dist < 5 || u.wall.hp < u.wall.max * 0.15)) useAb1(u);
      if (u.cd2 <= 0 && enemiesNear(5).length) useAb2(u);
      if (ult && allies(10, 0.6).length >= 2) useUlt(u); break;
    }
    case 'nok': {
      const want = !!(t && dist > 5.5 && u.wall.hp > u.wall.max * 0.25);
      if (want !== u.wall.up) useAb1(u);
      if (t && dist < 11 && u.cd2 <= 0 && !u.wall.up && r() < dt * 40) useAb2(u);
      if (ult && enemiesNear(10).length >= 2) useUlt(u); break;
    }
    case 'tick':
      if (u.lastHurt > gameT - 0.3 && u.charges > 0 && r() < dt * 240) { u.moveDir = side.clone().normalize(); useAb1(u); }
      if (t && u.cd2 <= 0 && r() < dt * 18) useAb2(u);
      if (ult && t && dist < 30) useUlt(u); break;
    case 'aria':
      if (u.lastHurt > gameT - 0.4 && u.cd1 <= 0 && r() < dt * 60) { const y = u.yaw, p = u.pitch; u.pitch = 0.9; u.yaw += rand(-1, 1); useAb1(u); u.yaw = y; u.pitch = p; }
      if (t && u.cd2 <= 0 && r() < dt * 20) useAb2(u);
      if (ult && t && dist < 40) useUlt(u); break;
    case 'phase':
      if (t && u.cd2 <= 0 && dist < 14 && r() < dt * 40) useAb2(u);
      if (u.lastHurt > gameT - 0.3 && u.cd1 <= 0 && u.hp / u.maxHp < 0.5 && r() < dt * 60) useAb1(u);
      if (ult && t && dist < 45) useUlt(u); break;
    case 'lumen':
      if (b.heal && u.cd1 <= 0 && b.heal.hp / b.heal.maxHp < 0.5) useAb1(u);
      if (b.heal && u.cd2 <= 0 && b.heal.hp / b.heal.maxHp < 0.6 && r() < dt * 60) useAb2(u);
      if (ult && allies(16, 0.55).length >= 2) useUlt(u); break;
    case 'mora':
      if (t && u.cd1 <= 0 && allies(5).length >= 3) useAb1(u);
      if (t && u.cd2 <= 0 && dist < 13 && r() < dt * 30) useAb2(u);
      if (ult && allies(15, 0.6).length >= 2) useUlt(u); break;
    case 'iko':
      if (u.cd1 <= 0) { const a = allies(25, 0.5)[0]; if (a) { const y = u.yaw, p = u.pitch, d = a.center.clone().sub(u.eye); u.yaw = Math.atan2(-d.x, -d.z); u.pitch = Math.atan2(d.y, Math.hypot(d.x, d.z)); useAb1(u); u.yaw = y; u.pitch = p; } }
      if (u.cd2 <= 0 && units.some(a => a.alive && a.team === u.team && a.pos.distanceTo(u.pos) < 9 && (a.slowT > 0 || a.blindT > 0 || a.hp / a.maxHp < 0.5))) useAb2(u);
      if (ult && allies(7, 0.5).length >= 2) useUlt(u); break;
  }
}

// 치유 빔(루멘)
const beams = new Map();
function beamTick(u, dt) {
  let line = beams.get(u);
  const on = u.alive && u.hero === 'lumen' && u.beamOn && u.healTarget && u.healTarget.alive && u.healTarget.pos.distanceTo(u.pos) < 20 && los(u.eye.clone(), u.healTarget.center.clone());
  if (!on) { if (line) line.visible = false; return; }
  if (!line) { line = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1, 6, 1, true), new THREE.MeshBasicMaterial({ color: 0xffb36b, transparent: true, opacity: 0.85, toneMapped: false, depthWrite: false })); scene.add(line); beams.set(u, line); }
  const a = muzzlePos(u, V3()), c = u.healTarget.center.clone();
  line.visible = true; line.position.copy(a).add(c).multiplyScalar(0.5); line.scale.set(1, a.distanceTo(c), 1);
  line.quaternion.setFromUnitVectors(V3(0, 1, 0), c.clone().sub(a).normalize());
  heal(u.healTarget, 58 * dt, u);
}

// ============================================================ 효과
const beamGeo = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true).rotateX(Math.PI / 2);   // z축으로 누운 원통
function tracer(a, b, col, life) {
  // 빠르게 날아가는 빛줄기(앞 3 m) + 옅게 남는 궤적
  const L = a.distanceTo(b); if (L < 0.3) return;
  const dir = b.clone().sub(a).normalize();
  const mk = (r, op) => { const m = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: op, toneMapped: false, depthWrite: false, blending: THREE.AdditiveBlending })); m.quaternion.setFromUnitVectors(V3(0, 0, 1), dir); scene.add(m); return m; };
  const streak = mk(0.025, 1), trail = mk(0.01, 0.35);
  trail.position.copy(a).add(b).multiplyScalar(0.5); trail.scale.set(1, 1, L);
  trail.scale.x = trail.scale.y = 0.012;
  fx.push({ o: trail, t: life * 1.6, life: life * 1.6, kind: 'fade', op: 0.35 });
  fx.push({ o: streak, t: L / 260 + 0.02, life: L / 260 + 0.02, kind: 'streak', a: a.clone(), b: b.clone(), L });
  if (!fx.flashT || gameT - fx.flashT > 0.03) { fx.flashT = gameT; flashAt(a, col); }
}
const flashTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,240,1)'); gr.addColorStop(0.25, 'rgba(255,200,120,.9)'); gr.addColorStop(1, 'rgba(255,120,30,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  g.globalCompositeOperation = 'lighter'; g.strokeStyle = 'rgba(255,230,180,.8)'; g.lineWidth = 3;
  for (let i = 0; i < 6; i++) { const an = i / 6 * Math.PI * 2; g.beginPath(); g.moveTo(32, 32); g.lineTo(32 + Math.cos(an) * 31, 32 + Math.sin(an) * 31); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
})();
function flashAt(p, col) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, color: col, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  sp.position.copy(p); const s = rand(0.35, 0.55); sp.scale.set(s, s, 1); sp.material.rotation = rand(0, 6); scene.add(sp);
  fx.push({ o: sp, t: 0.05, life: 0.05, kind: 'fade', op: 1 });
}
// 벽 탄흔 + 튀는 불꽃 + 먼지
const decalGeo = new THREE.CircleGeometry(0.06, 8), decalMat = new THREE.MeshBasicMaterial({ color: 0x15120f, transparent: true, opacity: 0.75, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
const decals = [];
function impact(p, d, col = 0xffd9a0, loud = true) {
  const m = new THREE.Mesh(decalGeo, decalMat); m.position.copy(p).addScaledVector(d, -0.02); m.lookAt(p.clone().sub(d)); scene.add(m);
  decals.push(m); if (decals.length > 80) scene.remove(decals.shift());
  for (let i = 0; i < 4; i++) {
    const v = d.clone().multiplyScalar(-rand(2, 5)).add(V3(rand(-2.5, 2.5), rand(0.5, 3.5), rand(-2.5, 2.5)));
    shard(p, v, col, 0.03, 0.25);
  }
  const dust = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, color: 0x8a8078, transparent: true, opacity: 0.5, depthWrite: false }));
  dust.position.copy(p); dust.scale.set(0.3, 0.3, 1); scene.add(dust); fx.push({ o: dust, t: 0.35, life: 0.35, kind: 'puff', s: 0.3 });
  if (loud) SFX.impact(vol(p) * 0.8);
}
const shardGeo = new THREE.BoxGeometry(1, 1, 1);
function shard(p, v, col, s, life) {
  const m = new THREE.Mesh(shardGeo, new THREE.MeshBasicMaterial({ color: col, transparent: true, toneMapped: false }));
  m.position.copy(p); m.scale.setScalar(s); m.rotation.set(rand(0, 3), rand(0, 3), 0); scene.add(m);
  fx.push({ o: m, t: life, life, kind: 'shard', v: v.clone(), s });
}
// 쓰러질 때 팀 색 조각이 튐
function deathBurst(t) {
  const c = t.center.clone(), col = TEAM_COL[t.team];
  for (let i = 0; i < 18; i++) shard(c.clone().add(V3(rand(-0.3, 0.3), rand(-0.6, 0.6), rand(-0.3, 0.3))), V3(rand(-4, 4), rand(2, 7), rand(-4, 4)), col, rand(0.06, 0.14), rand(0.6, 1.1));
  ringFx(t.pos, col, 2.2, 0.5);
}
const sparkGeo = new THREE.SphereGeometry(1, 6, 4);
function spark(p, col, s = 0.12, life = 0.12) {
  const m = new THREE.Mesh(sparkGeo, new THREE.MeshBasicMaterial({ color: col, transparent: true, toneMapped: false }));
  m.position.copy(p); m.scale.setScalar(s); scene.add(m); fx.push({ o: m, t: life, life, kind: 'pop', s });
}
function ringFx(p, col, r, life = 0.45) {
  const m = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 48), new THREE.MeshBasicMaterial({ color: col, transparent: true, toneMapped: false, side: THREE.DoubleSide, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.copy(p).y += 0.1; scene.add(m); fx.push({ o: m, t: life, life, kind: 'ring', r });
}
function trailFx(a, b, col) { for (let i = 0; i <= 6; i++) spark(a.clone().lerp(b, i / 6).setY(a.y + 1), col, 0.18, 0.3 + i * 0.03); }
function droneFx(t, dur) {
  const m = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.035, 6, 20), new THREE.MeshBasicMaterial({ color: 0x7fd6ff, toneMapped: false }));
  scene.add(m); fx.push({ o: m, t: dur, life: dur, kind: 'follow', u: t });
}
function fxTick(dt) {
  for (let i = fx.length - 1; i >= 0; i--) {
    const f = fx[i]; f.t -= dt; const k = Math.max(0, f.t / f.life);
    if (f.kind === 'fade') f.o.material.opacity = k * (f.op ?? 0.9);
    else if (f.kind === 'streak') { const q = 1 - k, len = Math.min(3, f.L); const head = f.a.clone().lerp(f.b, Math.min(1, q + len / f.L * 0.5)); f.o.position.copy(head).addScaledVector(f.b.clone().sub(f.a).normalize(), -len / 2); f.o.scale.set(0.025, 0.025, len); }
    else if (f.kind === 'shard') { f.v.y -= 18 * dt; f.o.position.addScaledVector(f.v, dt); f.o.rotation.x += dt * 9; f.o.material.opacity = Math.min(1, k * 2); }
    else if (f.kind === 'puff') { f.o.material.opacity = 0.5 * k; const sc = f.s * (1 + (1 - k) * 2.5); f.o.scale.set(sc, sc, 1); f.o.position.y += dt * 0.4; }
    else if (f.kind === 'pop') { f.o.material.opacity = k; f.o.scale.setScalar(f.s * (2 - k)); }
    else if (f.kind === 'ring') { f.o.scale.setScalar(0.2 + f.r * (1 - k)); f.o.material.opacity = k; }
    else if (f.kind === 'follow') { const u = f.u; f.o.position.set(u.pos.x + Math.cos(gameT * 3) * 0.6, u.pos.y + 2.1 * u.H.H, u.pos.z + Math.sin(gameT * 3) * 0.6); f.o.rotation.y += dt * 5; if (!u.alive || u.shield <= 0) f.t = 0; }
    if (f.t <= 0) { scene.remove(f.o); if (f.o.geometry !== sparkGeo) f.o.geometry.dispose(); f.o.material.dispose(); fx.splice(i, 1); }
  }
}
function decoyTick(dt) {
  for (let i = decoys.length - 1; i >= 0; i--) {
    const d = decoys[i]; d.t -= dt;
    const fake = { pos: d.pos, vel: V3(d.dir.x * 5.5, d.vy || 0, d.dir.z * 5.5), radius: 0.4, height: 1.8, onGround: true };
    moveUnit(fake, dt); d.vy = fake.vel.y;
    if (fake.hitWall) d.dir.set(-d.dir.z, 0, d.dir.x);
    d.m.position.copy(d.pos); d.m.rotation.y = Math.atan2(-d.dir.x, -d.dir.z);
    if (d.rig) { pose(d.rig.hip0, Math.sin(gameT * 9) * 0.5); pose(d.rig.hip1, -Math.sin(gameT * 9) * 0.5); }
    else { const j = d.m.getObjectByName('hip0'), j1 = d.m.getObjectByName('hip1'); if (j) { j.rotation.x = Math.sin(gameT * 9) * 0.6; j1.rotation.x = -Math.sin(gameT * 9) * 0.6; } }
    holoMat.opacity = 0.35 + Math.sin(gameT * 30) * 0.1;
    if (d.t <= 0) { scene.remove(d.m); decoys.splice(i, 1); spark(d.pos.clone().setY(d.pos.y + 1), 0x66c8ff, 0.5, 0.3); }
  }
}
function droneTick(dt) {
  for (let i = drones.length - 1; i >= 0; i--) {
    const d = drones[i]; d.t -= dt; d.delay -= dt;
    if (d.delay <= 0) {
      if (!d.target || !d.target.alive) { let bd = 50; d.target = null; for (const u of units) if (u.alive && u.team !== d.team) { const dd = u.pos.distanceTo(d.pos); if (dd < bd && los(d.pos, u.center.clone())) { bd = dd; d.target = u; } } }
      if (d.target) d.vel.lerp(d.target.center.clone().sub(d.pos).normalize().multiplyScalar(19), Math.min(1, dt * 4)); else d.vel.multiplyScalar(0.98);
    }
    d.pos.addScaledVector(d.vel, dt); d.m.position.copy(d.pos); d.m.rotation.y += dt * 12;
    let boom = d.t <= 0 || rayBoxes(d.pos, _v.copy(d.vel).normalize(), 0.3) < 0.3 || (d.target && d.target.center.distanceTo(d.pos) < 0.9);
    if (Math.random() < 0.5) spark(d.pos, 0xff8a2a, 0.07, 0.2);
    if (boom) { explode(d.pos, d.owner, 85, 2.8); scene.remove(d.m); drones.splice(i, 1); }
  }
}
function zoneTick(dt) {
  for (let i = zones.length - 1; i >= 0; i--) {
    const z = zones[i]; z.t -= dt;
    const inside = (u) => Math.hypot(u.pos.x - z.pos.x, u.pos.z - z.pos.z) < z.r && Math.abs(u.pos.y - z.pos.y) < 3;
    z.mesh.children[1].rotation.z += dt; z.mesh.children[0].material.opacity = (z.op ?? 0.22) * (0.8 + Math.sin(gameT * 6) * 0.2);
    if (z.kind === 'heal') { for (const u of units) if (u.alive && u.team === z.team && inside(u)) heal(u, 45 * dt, z.owner); }
    else if (z.kind === 'speed') { for (const u of units) if (u.alive && u.team === z.team && inside(u)) u.zoneSpdT = 0.15; }
    else if (z.kind === 'cloud') { for (const u of units) if (u.alive && u.team === z.team && inside(u)) { heal(u, 45 * dt, z.owner); u.noDieT = 0.15; } if (Math.random() < 0.4) spark(z.pos.clone().add(V3(rand(-z.r, z.r) * 0.7, rand(0.3, 2.5), rand(-z.r, z.r) * 0.7)), 0x9fe6ff, 0.08, 0.5); }
    else if (z.kind === 'rain') {
      for (const u of units) if (u.alive && u.team !== z.team && inside(u)) damage(u, 55 * dt, z.owner, {});
      for (let k = 0; k < 3; k++) { const p = z.pos.clone().add(V3(rand(-z.r, z.r) * 0.7, 0, rand(-z.r, z.r) * 0.7)); tracer(p.clone().setY(p.y + 9), p, 0xe8d8b0, 0.12); }
      if (Math.random() < 0.2) noise(0.05, 3000, 0.2 * vol(z.pos), 'highpass');
    } else if (z.kind === 'mortar') {
      if (Math.random() < 0.3) { const p = z.pos.clone().setY(z.pos.y + 14 * Math.max(0, z.t)); spark(p, 0xff8a2a, 0.15, 0.1); }
      if (z.t <= 0) explode(z.pos.clone().setY(z.pos.y + 0.5), z.owner, 110, 4, { kb: 6 });
    }
    if (z.t <= 0) { scene.remove(z.mesh); zones.splice(i, 1); }
  }
  for (let i = domes.length - 1; i >= 0; i--) {
    const d = domes[i]; d.t -= dt; d.mesh.material.opacity = 0.12 + Math.sin(gameT * 4) * 0.03; d.mesh.rotation.y += dt * 0.2;
    if (d.t <= 0) { scene.remove(d.mesh); domes.splice(i, 1); }
  }
  for (const p of packs) { if (!p.active) { p.t -= dt; if (p.t <= 0) { p.active = true; p.g.visible = true; } } p.cross.rotation.y += dt * 2; p.cross.position.y = 0.7 + Math.sin(gameT * 3) * 0.08; }
}

// 캐릭터 애니메이션
function aiAnim(u, amp, s) {
  const R = u.rig, a = amp * 0.8;
  if (!u.onGround) { pose(R.hip0, 0.45); pose(R.knee0, -0.7); pose(R.hip1, -0.15); pose(R.knee1, -0.3); }
  else {
    pose(R.hip0, s * a); pose(R.hip1, -s * a);
    pose(R.knee0, -Math.max(0, -Math.sin(u.walk + 0.6)) * a * 1.3); pose(R.knee1, -Math.max(0, Math.sin(u.walk + 0.6)) * a * 1.3);
  }
  const kick = Math.max(0, u.fireT) / u.H.rate * (u.H.melee ? 0 : 0.08);
  const sw = u.H.melee ? Math.max(0, u.swingT) / 0.35 : 0;
  pose(R.chest, clamp(u.pitch, -0.9, 0.9) * 0.45 + kick + sw * 0.35 - (u.flinch || 0) * 0.3, -sw * 0.9 + (u.crouch ? 0 : 0));
  pose(R.head, clamp(u.pitch, -0.9, 0.9) * 0.3);
  if (R.hips) R.hips.b.position.copy(R.hips.pos).y += (Math.abs(Math.cos(u.walk)) * 0.03 * amp) * (1 / (u.model.scale.y || 1));
}
function animUnit(u, dt) {
  u.mark.visible = u.alive && u.revealT > 0 && u.team !== player.team;
  if (u.mark.visible) u.mark.position.set(u.pos.x, u.pos.y + 2.4 * u.H.H, u.pos.z);
  if (u.isPlayer) return;
  // 피격 번쩍임·움찔
  if (u.flashT > 0 || u._lit) {
    u.flashT -= dt; const on = u.flashT > 0;
    for (const q of u.mats) if (q.e) { if (on) { q.m.emissive.setRGB(1, 1, 1); q.m.emissiveIntensity = 0.55; } else { q.m.emissive.copy(q.e); q.m.emissiveIntensity = q.ei; } }
    u._lit = on;
  }
  u.flinch = Math.max(0, (u.flinch || 0) - dt * 5);
  u.model.position.copy(u.pos);
  if (u.alive) u.model.rotation.set(0, u.yaw, 0); else u.model.rotation.y = u.yaw;
  u.ring.position.set(u.pos.x, u.pos.y + 0.04, u.pos.z);
  u.hpSprite.position.set(u.pos.x, u.pos.y + 2.15 * u.H.H, u.pos.z);
  const sp = Math.hypot(u.vel.x, u.vel.z);
  u.walk = (u.walk || 0) + dt * sp * 1.9;
  const amp = Math.min(1, sp / 4) * 0.65, j = u.j, s = Math.sin(u.walk);
  if (u.rig) aiAnim(u, amp, s);
  else if (j.hip0) {
    j.hip0.rotation.x = s * amp; j.hip1.rotation.x = -s * amp;
    j.knee0.rotation.x = -Math.max(0, -Math.sin(u.walk + 0.6)) * amp * 1.3; j.knee1.rotation.x = -Math.max(0, Math.sin(u.walk + 0.6)) * amp * 1.3;
    if (!u.onGround) { j.hip0.rotation.x = 0.5; j.knee0.rotation.x = -0.9; j.hip1.rotation.x = -0.2; j.knee1.rotation.x = -0.4; }
    const p = u.pitch, kick = Math.max(0, u.fireT) / u.H.rate * 0.15;
    if (u.H.melee) {
      const sw = Math.max(0, u.swingT) / 0.35;
      j.sh1.rotation.set(Math.PI / 2 + 0.9 * sw + p * 0.5, 0, -0.2 - 0.6 * sw); j.el1.rotation.set(0.3, 0, 0);
      j.sh0.rotation.set(Math.PI / 2 * 0.8 + p * 0.5, 0, 0.5); j.el0.rotation.set(0.5, 0, 0);
      if (u.wall && u.wall.up) j.sh0.rotation.set(Math.PI / 2, 0, 0.2);
    } else {
      j.sh1.rotation.set(Math.PI / 2 + p + kick, 0, -0.12); j.el1.rotation.set(0, 0, 0);
      if (u.hero === 'tick') { j.sh0.rotation.set(Math.PI / 2 + p + kick, 0, 0.12); j.el0.rotation.set(0, 0, 0); }
      else { j.sh0.rotation.set(Math.PI / 2 * 0.82 + p, 0, 0.55); j.el0.rotation.set(0.35, 0, 0); }
    }
    j.hips.position.y = 0.92 * u.H.H + Math.abs(Math.cos(u.walk)) * 0.035 * amp;
    if (j.spine) j.spine.rotation.x = -u.flinch * 0.35;
  }
  if (u.drone) { u.drone.position.y = u.drone.userData.y0 ??= u.drone.position.y; u.drone.position.y = u.drone.userData.y0 + Math.sin(gameT * 3) * 0.05; }
  u.hpSprite.visible = u.alive && (u.team === player.team || u.lastHurt > gameT - 3 || u.revealT > 0 || u.pos.distanceTo(player.pos) < 28);
}

// ============================================================ 1인칭
const keys = {};
let mouseL = false, mouseR = false, locked = false;
let vmRoot = null, vmGuns = [], vmKick = 0, vmPunch = 0, vmSwing = 0, shake = 0, bob = 0, recoilP = 0;
const VM = {
  shotgun: [{ s: 0.62, p: [0.24, -0.25, -0.36], r: [0.02, 0.07, 0.04] }],
  pistol: [{ s: 0.85, p: [0.22, -0.2, -0.4], r: [0, 0.05, 0] }, { s: 0.85, p: [-0.22, -0.2, -0.4], r: [0, -0.05, 0], side: -1 }],
  staff: [{ s: 0.6, p: [0.24, -0.27, -0.3], r: [0.1, 0.1, 0.25] }],
  rifle: [{ s: 0.8, p: [0.2, -0.22, -0.36], r: [0, 0.05, 0] }],
  hammer: [{ s: 0.48, p: [0.34, -0.36, -0.55], r: [0.9, -0.2, 0.3] }],
  bow: [{ s: 0.4, p: [-0.2, -0.12, -0.5], r: [0, 0.05, 0.38], side: -1, noArm: true }],
  launcher: [{ s: 0.6, p: [0.22, -0.24, -0.38], r: [0, 0.06, 0] }],
  medpistol: [{ s: 0.95, p: [0.2, -0.2, -0.36], r: [0, 0.05, 0] }],
  nanorifle: [{ s: 0.9, p: [0.2, -0.22, -0.36], r: [0, 0.05, 0] }],
};
const SLEEVE = { ratchet: '#2f8f94', tick: '#2c2f36', lumen: '#e6e8ec', orbit: '#9a9ea6', nok: '#a0763e', aria: '#2f5d3a', phase: '#1f2a44', mora: '#2f8f94', iko: '#9a9ea6' };
function buildViewmodel(hero) {
  if (vmRoot) vmScene.remove(vmRoot);
  vmRoot = new THREE.Group(); vmScene.add(vmRoot); vmGuns = [];
  const glove = new THREE.MeshStandardMaterial({ color: 0x22252b, roughness: 0.6, metalness: 0.3 }), sleeve = new THREE.MeshStandardMaterial({ color: SLEEVE[hero], roughness: 0.6 });
  for (const c of VM[HEROES[hero].gun]) {
    const g = new THREE.Group(), gun = weaponsT[HEROES[hero].gun].clone(true); g.add(gun);
    const side = c.side || 1;
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, 0.12), glove); hand.position.set(0, -0.02, 0.02); g.add(hand);
    if (!c.noArm) { const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 0.5, 10), sleeve); arm.rotation.x = Math.PI / 2 - 0.25; arm.position.set(0.02 * side, -0.08, 0.26); g.add(arm); }
    let mz = null; gun.traverse(o => { if (o.name === 'Muzzle') mz = o; });
    g.scale.setScalar(c.s); g.position.set(...c.p); g.rotation.set(...c.r);
    let flash = null;
    if (mz) { flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, color: 0xffd0a0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })); flash.visible = false; mz.add(flash); }
    vmRoot.add(g); vmGuns.push({ g, mz, side, base: g.position.clone(), rot: g.rotation.clone(), flash });
  }
}
function vmMuzzle(out, i) {
  const vg = vmGuns[i % vmGuns.length]; if (!vg || !vg.mz) return out.copy(camera.position);
  vmRoot.updateMatrixWorld(true); vg.mz.getWorldPosition(out);
  return out.applyMatrix4(camera.matrixWorld);
}
let recoilY = 0, fovPunch = 0, vmFlash = 0, spreadUI = 0;
function kick(back, up) { vmKick = Math.min(0.25, vmKick + back); recoilP += up; recoilY += rand(-up, up) * 0.6; fovPunch = Math.min(4, fovPunch + back * 18); vmFlash = 0.05; spreadUI = Math.min(1, spreadUI + back * 4 + 0.1); shake = Math.max(shake, back * 1.2); }

addEventListener('keydown', (e) => {
  if (e.code === 'Tab') { e.preventDefault(); $('score').classList.remove('hidden'); drawScore(); }
  if (keys[e.code]) return; keys[e.code] = true;
  if (!locked || !player) return;
  const act = player.alive && canAct();
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') { if (act) useAb1(player); }
  if (e.code === 'KeyE') { if (act) useAb2(player); }
  if (e.code === 'KeyQ') { if (act) useUlt(player); }
  if (e.code === 'KeyR') { if (player.alive) startReload(player); }
  if (e.code === 'KeyV') { if (player.alive) melee(player); }
  if (e.code === 'KeyH') openSwap();
  if (e.code === 'Space') e.preventDefault();
});
addEventListener('keyup', (e) => { keys[e.code] = false; if (e.code === 'Tab') $('score').classList.add('hidden'); });
addEventListener('mousedown', (e) => { if (!locked) return; if (e.button === 0) mouseL = true; if (e.button === 2) mouseR = true; });
addEventListener('mouseup', (e) => { if (e.button === 0) mouseL = false; if (e.button === 2) mouseR = false; });
addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('mousemove', (e) => {
  if (!locked || !player) return;
  const k = 0.0022 * opts.sens;
  player.yaw -= e.movementX * k; player.pitch = clamp(player.pitch - e.movementY * k, -1.5, 1.5);
});
document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === canvas;
  if (!locked && (matchState === 'play' || matchState === 'setup') && $('swap').classList.contains('hidden')) { paused = true; $('pause').classList.remove('hidden'); }
  if (!locked) mouseL = mouseR = false;
});
const lock = () => { if (document.pointerLockElement === canvas) return; try { const r = canvas.requestPointerLock?.(); r?.catch?.(() => {}); } catch (e) { } };
const canAct = () => matchState === 'play' || matchState === 'setup';

function playerTick(dt) {
  const u = player;
  if (!u.alive) { u.beamOn = false; return; }
  const f = u.fwd, r = V3(Math.cos(u.yaw), 0, -Math.sin(u.yaw)), mv = V3();
  if (keys.KeyW) mv.add(f); if (keys.KeyS) mv.sub(f); if (keys.KeyD) mv.add(r); if (keys.KeyA) mv.sub(r);
  if (mv.lengthSq()) mv.normalize();
  u.moveDir = mv.clone(); u.crouch = !!keys.KeyC;
  const sp = speedOf(u);
  if (u.dash <= 0 && !u.slam && u.grapT <= 0) {
    const k = u.onGround ? 14 : 2.2;
    u.vel.x += (mv.x * sp - u.vel.x) * Math.min(1, dt * k); u.vel.z += (mv.z * sp - u.vel.z) * Math.min(1, dt * k);
  }
  if (keys.Space && u.onGround && u.dash <= 0) { u.vel.y = 7; u.onGround = false; }
  if (!canAct()) return;
  if (u.hero === 'lumen') {
    u.beamOn = mouseR;
    if (mouseR) { if (!u.healTarget || !u.healTarget.alive || u.healTarget.pos.distanceTo(u.pos) > 20) u.healTarget = pickAlly(u, 18, 0.96); }
    else u.healTarget = null;
    if (mouseL && !mouseR) fire(u, u.aimDir());
  } else if (u.hero === 'aria') {
    if (mouseL && u.fireT <= 0 && canFire(u)) u.drawT += dt;
    else if (!mouseL && u.drawT > 0) fire(u, u.aimDir());
  } else if (u.hero === 'mora') {
    if (mouseR) fire(u, u.aimDir(), true); else if (mouseL) fire(u, u.aimDir());
  } else if (mouseL) fire(u, u.aimDir());
}

// ============================================================ HUD
const dmgEls = [];
function dmgNumber(p, amt, cls) {
  const el = document.createElement('div'); el.className = 'dn ' + cls; el.textContent = amt; $('dmgs').appendChild(el);
  dmgEls.push({ el, p: p.clone().add(V3(rand(-0.3, 0.3), 0.3, rand(-0.3, 0.3))), t: 0.8 });
}
let hitT = 0, hurtT = 0, healT = 0, centerT = 0;
function hitMarker(cls) { const h = $('hit'); h.className = cls; h.style.opacity = 1; hitT = cls === 'kill' ? 0.4 : 0.18; }
function hurtFlash() { hurtT = 0.35; $('vign').style.opacity = 0.9; }
let kbT = 0;
function killBanner(t) {
  const el = $('killban'); el.innerHTML = `<b>처치</b> <span>${t.name} · ${t.H.name}</span>`;
  el.classList.remove('on'); void el.offsetWidth; el.classList.add('on'); kbT = 1.6;
}
const dirEls = [];
function dmgDir(from) {
  const p = player; if (!p) return;
  const dx = from.x - p.pos.x, dz = from.z - p.pos.z;
  const ang = Math.atan2(-dx, -dz) - p.yaw;          // 0 = 정면
  let el = dirEls.find(e => e.t <= 0);
  if (!el) { if (dirEls.length >= 4) el = dirEls[0]; else { const d = document.createElement('div'); d.className = 'dmgdir'; $('hud').appendChild(d); el = { d, t: 0 }; dirEls.push(el); } }
  el.t = 1.2; el.d.style.transform = `translate(-50%,-50%) rotate(${-ang}rad)`; el.d.style.opacity = 1;
}
function healFlash() { if (healT <= 0) $('healv').style.opacity = 0.6; healT = 0.25; }
function showCenter(big, sm, t) { $('cbig').textContent = big; $('csm').textContent = sm; centerT = t; $('center').style.opacity = 1; }
function tip(text) { $('tip').textContent = text; $('tip').style.opacity = text ? 1 : 0; }
const TIPS = {
  ratchet: 'SHIFT 돌진으로 적을 밀치고, E로 뛰어올라 내려찍어요', orbit: 'SHIFT로 방벽을 켜고 끄며 팀 앞에서 버텨요. E 펄스로 붙은 적을 밀어내요',
  nok: 'SHIFT 석판 방패로 막다가, 가까워지면 내리고 망치로 여럿을 쳐요', tick: 'SHIFT로 순간이동, E로 분신을 보내 적을 속여요',
  aria: '좌클릭을 눌렀다 떼서 쏴요. 끝까지 당기면 헤드샷 한 방', phase: '유탄은 포물선으로 날아가요. E 점착 폭탄은 적에게 붙어요',
  lumen: '우클릭을 누르고 있으면 조준한 아군을 치유해요', mora: '우클릭 치유탄으로 멀리 있는 아군을 맞혀 회복시켜요', iko: '적을 맞히면 근처 아군이 회복돼요. SHIFT로 아군에게 방패 드론을',
};
function hudTick(dt) {
  const u = player, H = u.H;
  $('hpv').textContent = Math.ceil(u.hp + u.shield); $('hpm').textContent = u.maxHp;
  const tot = u.maxHp + u.shield;
  hpF.style.width = (u.hp / tot * 100) + '%'; hpS.style.left = (u.hp / tot * 100) + '%'; hpS.style.width = (u.shield / tot * 100) + '%';
  $('hpbar').classList.toggle('low', u.hp / u.maxHp < 0.35);
  if (H.melee) { $('am').textContent = '∞'; $('amm').textContent = '근접'; }
  else if (u.hero === 'aria') { $('am').textContent = '활'; $('amm').textContent = Math.round(clamp(u.drawT / H.charge, 0, 1) * 100) + '%'; }
  else { $('am').textContent = u.reloadT > 0 ? '…' : u.ammo; $('amm').textContent = H.mag; }
  const ab = (el, cd, ready, ch, on) => {
    const c = $(el).querySelector('.cd'); c.classList.toggle('hidden', ready); if (!ready) c.textContent = Math.ceil(cd);
    $(el).classList.toggle('ready', ready); $(el).classList.toggle('on', !!on); $(el).querySelector('.ch').textContent = ch ?? '';
  };
  if (u.wall) ab('ab1', u.wall.brokenT, u.wall.brokenT <= 0, Math.round(u.wall.hp / u.wall.max * 100) + '%', u.wall.up);
  else if (u.hero === 'tick') ab('ab1', u.chargeT, u.charges > 0, u.charges);
  else ab('ab1', u.cd1, u.cd1 <= 0);
  ab('ab2', u.cd2, u.cd2 <= 0);
  const up = Math.floor(u.ult / H.ult.cost * 100);
  $('ultp').textContent = up >= 100 ? '준비' : up + '%';
  $('ultring').setAttribute('stroke-dashoffset', 251.3 * (1 - Math.min(1, u.ult / H.ult.cost)));
  $('ult').classList.toggle('ready', up >= 100);
  $('drawbar').style.width = u.hero === 'aria' ? clamp(u.drawT / H.charge, 0, 1) * 60 + 'px' : '0px';
  // 상태
  const st = [];
  if (u.slowT > 0) st.push('둔화'); if (u.blindT > 0) st.push('실명'); if (u.boostT > 0 || u.zoneSpdT > 0) st.push('가속'); if (u.dmgBuffT > 0) st.push('공격력↑');
  if (u.roarT > 0 || u.ironT > 0) st.push('피해 감소'); if (u.noDieT > 0) st.push('불사'); if (u.shield > 0) st.push('보호막');
  $('status').textContent = st.join(' · ');
  // 거점
  $('sb').textContent = Math.floor(score.blue) + '%'; $('sr').textContent = Math.floor(score.red) + '%';
  scB.style.width = score.blue + '%'; scR.style.width = score.red + '%';
  const pt = $('pt'); pt.className = point.owner || ''; if (point.contested) pt.classList.add('cont');
  $('ptring').setAttribute('stroke', point.capTeam ? (point.capTeam === 'blue' ? '#3db8ff' : '#ff4d5e') : '#fff');
  $('ptring').setAttribute('stroke-dashoffset', 157 * (1 - point.cap / 100));
  let msg = '';
  if (matchState === 'setup') msg = `전투 시작까지 ${Math.ceil(setupT)}초 · H 영웅 교체`;
  else if (point.overtime) msg = '연장전!';
  else if (point.contested) msg = '⚔ 거점 쟁탈 중';
  else if (point.capTeam) msg = point.capTeam === u.team ? `거점 점령 중 ${Math.floor(point.cap)}%` : `적이 거점을 점령 중 ${Math.floor(point.cap)}%`;
  else if (!point.owner) msg = '거점을 점령하세요';
  else msg = point.owner === u.team ? '거점을 지키세요' : '거점을 탈환하세요';
  $('capmsg').textContent = msg;
  $('capmsg').style.color = point.contested || point.overtime ? '#fff' : point.capTeam === 'red' || (!point.capTeam && point.owner === 'red') ? '#ff8a96' : '#9fdcff';
  const tt = Math.floor(gameT); $('timer').textContent = `${Math.floor(tt / 60)}:${String(tt % 60).padStart(2, '0')}`;
  if (hitT > 0) { hitT -= dt; if (hitT <= 0) $('hit').style.opacity = 0; }
  if (kbT > 0) { kbT -= dt; if (kbT <= 0) $('killban').classList.remove('on'); }
  for (const e of dirEls) if (e.t > 0) { e.t -= dt; e.d.style.opacity = Math.max(0, e.t / 1.2); }
  if (hurtT > 0) { hurtT -= dt; if (hurtT <= 0) $('vign').style.opacity = u.hp / u.maxHp < 0.3 ? 0.5 : 0; }
  if (healT > 0) { healT -= dt; if (healT <= 0) $('healv').style.opacity = 0; }
  if (centerT > 0) { centerT -= dt; if (centerT <= 0) $('center').style.opacity = 0; }
  $('flash').style.opacity = u.blindT > 0 ? Math.min(1, u.blindT / 0.8) : 0;
  if (!u.alive) { $('csm').textContent = `${Math.max(0, Math.ceil(u.respawnT))}초 뒤 부활 · H 영웅 교체`; $('center').style.opacity = 1; centerT = 0.1; }
  for (let i = dmgEls.length - 1; i >= 0; i--) {
    const d = dmgEls[i]; d.t -= dt; d.p.y += dt * 0.8;
    const v = d.p.clone().project(camera);
    if (d.t <= 0) { d.el.remove(); dmgEls.splice(i, 1); continue; }
    if (v.z > 1) { d.el.style.display = 'none'; continue; }
    d.el.style.display = ''; d.el.style.left = (v.x * 0.5 + 0.5) * innerWidth + 'px'; d.el.style.top = (-v.y * 0.5 + 0.5) * innerHeight + 'px'; d.el.style.opacity = Math.min(1, d.t * 3);
  }
}
let hpF, hpS, scB, scR;
function drawScore() {
  if (!player) return;
  const rows = [...units].sort((a, b) => (a.team === b.team ? 0 : a.team === player.team ? -1 : 1));
  $('scoretbl').innerHTML = '<tr><th>플레이어</th><th>영웅</th><th>처치</th><th>죽음</th><th>피해</th><th>치유</th></tr>' +
    rows.map(u => `<tr class="${u.team === 'blue' ? 'b' : 'r'} ${u.isPlayer ? 'me' : ''}"><td>${u.name}</td><td>${u.H.name} <small>${ROLE_KO[u.H.role]}</small></td><td class="num">${u.kills}</td><td class="num">${u.deaths}</td><td class="num">${Math.round(u.dmgDone)}</td><td class="num">${Math.round(u.healDone)}</td></tr>`).join('');
}

// ============================================================ 거점·경기
const point = { owner: null, cap: 0, capTeam: null, contested: false, overtime: false };
const score = { blue: 0, red: 0 };
let matchState = 'menu', setupT = 0, paused = false;
function pointTick(dt) {
  const on = { blue: 0, red: 0 };
  for (const u of units) if (u.alive && Math.hypot(u.pos.x, u.pos.z) < ctx.pointR && u.pos.y < 3.2) on[u.team]++;
  point.contested = on.blue > 0 && on.red > 0;
  const solo = !point.contested ? (on.blue ? 'blue' : on.red ? 'red' : null) : null;
  if (solo && solo !== point.owner) {
    if (point.capTeam && point.capTeam !== solo) { point.cap -= dt * 20; if (point.cap <= 0) { point.cap = 0; point.capTeam = solo; } }
    else { point.capTeam = solo; point.cap += dt * 100 / 6 * (1 + Math.min(2, on[solo] - 1) * 0.25); }
    if (point.cap >= 100) {
      point.owner = solo; point.cap = 0; point.capTeam = null; SFX.cap();
      showCenter(solo === player.team ? '거점 확보!' : '거점을 빼앗겼습니다', '', 1.8);
      ctx.core.material.emissive.setHex(solo === 'blue' ? 0x2a9fff : 0xff3344);
    }
  } else if (!solo && !point.contested && point.capTeam) { point.cap = Math.max(0, point.cap - dt * 10); if (point.cap === 0) point.capTeam = null; }
  point.overtime = false;
  if (point.owner) {
    const other = point.owner === 'blue' ? 'red' : 'blue';
    const hold = score[point.owner] >= 99 && (on[other] > 0 || point.capTeam === other);
    point.overtime = hold;
    if (!hold) score[point.owner] = Math.min(100, score[point.owner] + dt * 1.5);
    if (score[point.owner] >= 100) endMatch(point.owner);
  }
}
function endMatch(win) {
  matchState = 'end';
  const me = win === player.team;
  $('rtitle').textContent = me ? '승리' : '패배'; $('rtitle').className = me ? 'win' : 'lose';
  const best = [...units].sort((a, b) => (b.kills * 100 + b.dmgDone + b.healDone) - (a.kills * 100 + a.dmgDone + a.healDone))[0];
  $('rsub').innerHTML = `${ctx.def.name} · ${Math.floor(gameT / 60)}분 ${Math.floor(gameT % 60)}초<br>나 (${player.H.name}) · 처치 ${player.kills} · 죽음 ${player.deaths} · 피해 ${Math.round(player.dmgDone)} · 치유 ${Math.round(player.healDone)}<br><span style="color:var(--orange)">최고의 활약: ${best.name} (${best.H.name})</span>`;
  setTimeout(() => { document.exitPointerLock?.(); $('result').classList.remove('hidden'); }, 1500);
  showCenter(me ? '승리!' : '패배', '', 2);
}
const BOTNAMES = ['하루', '지오', '세라', '마루', '노아', '라온', '도윤', '유나', '시온', '리아', '단비', '이안'];
const pickComp = (fixed) => {
  const ex = fixed ? [fixed] : [], fr = fixed ? HEROES[fixed].role : null;
  const take = (role, n) => ROSTER[role].filter(h => !ex.includes(h)).sort(() => Math.random() - 0.5).slice(0, n);
  return [...take('tank', fr === 'tank' ? 0 : 1), ...take('dps', fr === 'dps' ? 1 : 2), ...take('support', fr === 'support' ? 1 : 2)];
};
function clearMatch() {
  for (const u of units) u.dispose();
  for (const [, l] of beams) scene.remove(l); beams.clear();
  for (const d of decoys) scene.remove(d.m); for (const d of drones) scene.remove(d.m); for (const z of zones) scene.remove(z.mesh); for (const p of projs) scene.remove(p.m); for (const d of domes) scene.remove(d.mesh);
  for (const f of fx) scene.remove(f.o);
  units.length = decoys.length = drones.length = zones.length = projs.length = domes.length = fx.length = 0;
}
function startMatch(hero, mapId = opts.map) {
  clearMatch();
  if (ctx.id !== mapId) loadMap(mapId);
  Object.assign(point, { owner: null, cap: 0, capTeam: null, contested: false, overtime: false }); score.blue = score.red = 0;
  ctx.core.material.emissive.setHex(0xff7a1a);
  const names = [...BOTNAMES].sort(() => Math.random() - 0.5);
  player = new Unit(hero, 'blue', true, '나'); units.push(player);
  pickComp(hero).forEach((h, i) => units.push(new Unit(h, 'blue', false, names[i])));
  pickComp().forEach((h, i) => units.push(new Unit(h, 'red', false, names[5 + i])));
  for (const u of units) respawn(u);
  for (const g of ctx.gates) { g.box.off = false; g.mesh.visible = true; }
  for (const p of packs) { p.active = true; p.g.visible = true; }
  onPlayerHero();
  gameT = 0; setupT = 6; matchState = 'setup'; paused = false;
  for (const id of ['menu', 'result', 'pause', 'swap']) $(id).classList.add('hidden');
  $('hud').classList.remove('hidden');
  showCenter(ctx.def.name, '모든 시계는 03:17에 멈춰 있다 · 거점을 점령하세요', 3.5);
  lock();
}
function onPlayerHero() {
  buildViewmodel(player.hero);
  $('meimg').src = player.H.art; $('menm').textContent = player.H.name; $('merole').textContent = `${ROLE_KO[player.H.role]} · ${player.H.sub}`;
  $('ab1').querySelector('.n').textContent = player.H.ab1.name; $('ab2').querySelector('.n').textContent = player.H.ab2.name;
  $('ultn').textContent = player.H.ult.name;
  tip(TIPS[player.hero]); clearTimeout(onPlayerHero.t); onPlayerHero.t = setTimeout(() => tip(''), 7000);
}
// 영웅 교체(H): 출발 구역에 있거나 쓰러져 있을 때
function openSwap() {
  if (!player || !(matchState === 'setup' || matchState === 'play')) return;
  if (player.alive && !inSpawn(player)) { tip('영웅 교체는 출발 구역이나 쓰러졌을 때만 할 수 있어요'); setTimeout(() => tip(''), 2500); return; }
  $('swap').classList.remove('hidden'); document.exitPointerLock?.();
  document.querySelectorAll('#swapgrid .card').forEach(c => c.classList.toggle('sel', c.dataset.k === (player.pendingHero || player.hero)));
}
function chooseSwap(k) {
  $('swap').classList.add('hidden');
  if (k !== player.hero) {
    if (player.alive) { const p = player.pos.clone(), y = player.yaw; player.setHero(k); player.pos.copy(p); player.yaw = y; onPlayerHero(); }
    else player.pendingHero = k;
  }
  paused = false; lock();
}

// ============================================================ 루프
let last = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (matchState === 'menu') { menuCam(now / 1000); render(); return; }
  if (!paused) update(dt);
  render();
}
function update(dt) {
  gameT += dt;
  if (matchState === 'setup') {
    setupT -= dt;
    if (setupT <= 0) { matchState = 'play'; for (const g of ctx.gates) { g.box.off = true; g.mesh.visible = false; } showCenter('전투 개시!', '', 1.2); SFX.cap(); }
  }
  playerTick(dt);
  for (const u of units) if (!u.isPlayer && u.alive) botTick(u, dt);
  for (const u of units) { tickUnit(u, dt); if (u.alive) moveUnit(u, dt); }
  for (const u of units) beamTick(u, dt);
  decoyTick(dt); droneTick(dt); projTick(dt); zoneTick(dt); fxTick(dt);
  if (matchState === 'play') pointTick(dt);
  for (const u of units) animUnit(u, dt);
  for (const s of W.signs) s.m.material.color.setScalar(Math.random() < 0.03 * s.f ? 0.3 : 1);
  if (ctx.core) { ctx.core.rotation.y += dt * 0.4; ctx.core.position.y = ctx.coreY + Math.sin(gameT * 1.3) * 0.08; }
  if (ctx.shell) ctx.shell.rotation.y += dt * 0.05;
  const p = player;
  bob += dt * Math.hypot(p.vel.x, p.vel.z) * 1.6 * (p.onGround ? 1 : 0);
  recoilP *= Math.pow(0.0005, dt); recoilY *= Math.pow(0.0005, dt); fovPunch *= Math.pow(0.001, dt); vmFlash -= dt; spreadUI *= Math.pow(0.02, dt); vmKick *= Math.pow(0.0004, dt);
  const fov = 72 + fovPunch * 0.6; if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
  $('cross').style.setProperty('--gap', (4 + spreadUI * 10 + Math.min(6, Math.hypot(p.vel.x, p.vel.z))) + 'px'); vmPunch = Math.max(0, vmPunch - dt); vmSwing = Math.max(0, vmSwing - dt * 3);
  camera.position.set(p.pos.x, p.pos.y + (p.crouch ? 1.15 : 1.62) * p.H.H + Math.abs(Math.sin(bob)) * 0.04, p.pos.z);
  if (!p.alive) camera.position.y = p.pos.y + 0.5;
  camera.rotation.set(p.pitch + recoilP + (shake > 0 ? rand(-shake, shake) * 0.05 : 0), p.yaw + recoilY, (shake > 0 ? rand(-shake, shake) * 0.02 : 0), 'YXZ');
  camera.updateMatrixWorld();
  shake = Math.max(0, shake - dt);
  if (vmRoot) {
    vmRoot.visible = p.alive;
    for (const vg of vmGuns) {
      const firing = p.hero === 'tick' ? (vg.side === 1 ? p.alt === 1 : p.alt === 0) : true;
      const draw = p.hero === 'aria' ? clamp(p.drawT / p.H.charge, 0, 1) * 0.06 : 0;
      vg.g.position.set(vg.base.x + Math.sin(bob) * 0.012 * vg.side, vg.base.y + Math.abs(Math.cos(bob)) * 0.01 - (p.reloadT > 0 ? 0.12 : 0) - (p.wall && p.wall.up && !p.H.barrier.canShoot ? 0.15 : 0),
        vg.base.z + (firing ? vmKick : vmKick * 0.3) + draw - (vmPunch > 0 && vg.side === 1 ? vmPunch * 0.6 : 0));
      vg.g.rotation.set(vg.rot.x - vmSwing * 1.6 + (firing ? vmKick * 1.6 : 0), vg.rot.y + vmSwing * 0.5, vg.rot.z);
      if (vg.flash) { const on = vmFlash > 0 && firing && p.hero !== 'nok' && p.hero !== 'aria'; vg.flash.visible = on; if (on) { vg.flash.material.rotation = Math.random() * 6; const sc = rand(0.18, 0.28) / vg.g.scale.x; vg.flash.scale.set(sc, sc, 1); } }
    }
  }
  hudTick(dt);
}
function render() {
  const vm = matchState !== 'menu' && !!vmRoot;
  if (opts.gfx) { rpVM.enabled = vm; composer.render(); return; }
  renderer.clear(); renderer.render(scene, camera);
  if (vm) { renderer.clearDepth(); renderer.render(vmScene, vmCam); }
}
function menuCam(t) {
  camera.position.set(Math.sin(t * 0.07) * 30, 12 + Math.sin(t * 0.13) * 2, Math.cos(t * 0.07) * 30);
  camera.lookAt(0, 3, 0);
  if (ctx.core) ctx.core.rotation.y = t * 0.4;
}

// ============================================================ 메뉴
let chosen = 'ratchet';
function heroCard(k, small) {
  const h = HEROES[k], c = document.createElement('div');
  c.className = 'card' + (small ? ' small' : ''); c.dataset.k = k;
  c.innerHTML = `<span class="badge ${h.role}">${ROLE_KO[h.role]}</span><img src="${h.art}" alt="${h.name}"><div class="info"><div class="nm">${h.name}</div><div class="role">${h.sub} · ${h.era} 출신</div></div>`;
  return c;
}
function showDetail(k) {
  const h = HEROES[k];
  $('detail').innerHTML = `<div class="dh"><span class="dn2">${h.name}</span><span class="role">${ROLE_KO[h.role]} · ${h.sub} · 체력 ${h.hp}</span></div>
    <ul>${h.desc.map(([a, b]) => `<li><b>${a}</b>${b}</li>`).join('')}<li><b>패시브</b>${h.passive}</li></ul>`;
}
function buildMenu() {
  for (const role of ['tank', 'dps', 'support']) {
    const col = document.createElement('div'); col.className = 'rolecol';
    col.innerHTML = `<div class="rl">${ROLE_KO[role]}</div>`;
    const swapCol = col.cloneNode(true);
    for (const k of ROSTER[role]) {
      const c = heroCard(k); c.onclick = () => { chosen = k; document.querySelectorAll('#cards .card').forEach(x => x.classList.toggle('sel', x.dataset.k === k)); showDetail(k); };
      if (k === chosen) c.classList.add('sel'); col.appendChild(c);
      const s = heroCard(k, true); s.onclick = () => chooseSwap(k); swapCol.appendChild(s);
    }
    $('cards').appendChild(col); $('swapgrid').appendChild(swapCol);
  }
  showDetail(chosen);
  for (const [id, m] of Object.entries(MAPS)) {
    const b = document.createElement('button'); b.className = 'mapbtn' + (id === opts.map ? ' sel' : ''); b.dataset.id = id;
    b.innerHTML = `<b>${m.name}</b><span>${m.sub}</span>`; b.title = m.lore;
    b.onclick = () => { opts.map = id; document.querySelectorAll('.mapbtn').forEach(x => x.classList.toggle('sel', x.dataset.id === id)); $('maplore').textContent = m.lore; loadMap(id); };
    $('maps').appendChild(b);
  }
  $('maplore').textContent = MAPS[opts.map].lore;
  $('diff').onchange = (e) => opts.diff = +e.target.value;
  $('gfx').onchange = (e) => { opts.gfx = +e.target.value; applyGfx(); };
  $('sens').oninput = (e) => { opts.sens = +e.target.value; $('sensv').textContent = opts.sens.toFixed(2); };
  $('start').onclick = () => { audio(); startMatch(chosen); };
  $('resume').onclick = () => { paused = false; $('pause').classList.add('hidden'); lock(); };
  $('pause').addEventListener('click', (e) => { if (e.target.id === 'pause') { paused = false; $('pause').classList.add('hidden'); lock(); } });
  $('quit').onclick = toMenu; $('toMenu').onclick = toMenu;
  $('again').onclick = () => startMatch(player.hero);
  $('swapclose').onclick = () => { $('swap').classList.add('hidden'); paused = false; lock(); };
  hpF = $('hpbar').querySelector('.f'); hpS = $('hpbar').querySelector('.s');
  scB = document.querySelector('.sc.blue .f'); scR = document.querySelector('.sc.red .f');
}
function toMenu() {
  matchState = 'menu'; paused = false;
  for (const id of ['pause', 'result', 'hud', 'swap']) $(id).classList.add('hidden');
  $('menu').classList.remove('hidden');
  clearMatch(); player = null;
}
canvas.addEventListener('click', () => { if ((matchState === 'play' || matchState === 'setup') && !locked && $('swap').classList.contains('hidden')) { paused = false; $('pause').classList.add('hidden'); lock(); } });

// ============================================================ 시작
loadMap(opts.map); buildMenu(); applyGfx();
requestAnimationFrame(loop);
let loaded = 0;
loadAll(() => { loaded++; $('loading').textContent = `모델 불러오는 중 ${loaded}/${TOTAL_ASSETS}`; }).then(() => {
  $('loading').textContent = ''; $('start').disabled = false; $('start').textContent = '전투 시작';
}).catch((e) => { console.error(e); $('loading').textContent = '모델을 불러오지 못했어요: ' + e.message; });

// 테스트용 훅
window.__game = {
  act(k) { const u = player; return ({ a1: () => useAb1(u), a2: () => useAb2(u), q: () => useUlt(u), f: () => fire(u, u.aimDir()), f2: () => fire(u, u.aimDir(), true), v: () => melee(u), r: () => startReload(u) })[k](); },
  sim(sec) { for (let t = 0; t < sec; t += 1 / 30) update(1 / 30); },
  units, point, score, startMatch, loadMap, chooseSwap, openSwap,
  get player() { return player; }, get state() { return matchState; }, boxes, zones, projs, domes,
};
