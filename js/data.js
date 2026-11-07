// 영웅·난이도 데이터
export const ROLE_KO = { tank: '탱커', dps: '딜러', support: '지원' };

export const HEROES = {
  ratchet: {
    name: '래칫', role: 'tank', sub: '돌파형', era: '현재', hp: 550, speed: 5.2, radius: 0.5, H: 1.06, W: 1.32,
    gun: 'shotgun', mag: 6, reload: 1.8, rate: 0.85, range: 16, want: 6,
    ab1: { name: '돌진', cd: 7 }, ab2: { name: '내려찍기', cd: 10 }, ult: { name: '철갑 돌격', cost: 1300 },
    passive: '돌진이 끝나면 잠깐 보호막',
    desc: [['좌클릭', '충각판 산탄총'], ['SHIFT', '돌진 · 부딪힌 적 밀침'], ['E', '뛰어올라 내려찍기'], ['Q', '철갑 돌격 · 받는 피해 절반']],
  },
  orbit: {
    name: '오비트', role: 'tank', sub: '방벽형', era: '미래', hp: 600, speed: 5.0, radius: 0.5, H: 1.04, W: 1.24,
    gun: 'rifle', mag: 32, reload: 1.6, rate: 0.09, range: 35, want: 10,
    ab1: { name: '이동형 방벽', cd: 0, toggle: true }, ab2: { name: '반발 펄스', cd: 8 }, ult: { name: '방벽 돔', cost: 1500 },
    passive: '넉백·둔화 40% 저항', barrier: { hp: 900, w: 3.4, h: 2.5, canShoot: true, slow: 0.7 },
    desc: [['좌클릭', '에너지 소총'], ['SHIFT', '방벽 켜기·끄기 (쏘면서 이동)'], ['E', '반발 펄스 · 주변 적 밀쳐냄'], ['Q', '방벽 돔 · 바깥 공격을 막음']],
  },
  nok: {
    name: '녹', role: 'tank', sub: '방벽형', era: '과거', hp: 650, speed: 5.0, radius: 0.55, H: 1.02, W: 1.36,
    gun: 'hammer', mag: 0, reload: 0, rate: 0.9, range: 4.8, want: 2.5, melee: true,
    ab1: { name: '석판 방패', cd: 0, toggle: true }, ab2: { name: '지면 강타', cd: 9 }, ult: { name: '전사의 함성', cost: 1400 },
    passive: '넉백·둔화 40% 저항', barrier: { hp: 1100, w: 3.0, h: 2.4, canShoot: false, slow: 0.65 },
    desc: [['좌클릭', '전쟁 망치 휘두르기 (여럿 타격)'], ['SHIFT', '석판 방패 켜기·끄기'], ['E', '지면 강타 · 앞쪽 적 둔화'], ['Q', '전사의 함성 · 아군 피해 감소']],
  },
  tick: {
    name: '틱', role: 'dps', sub: '침투형', era: '미래', hp: 225, speed: 6.2, radius: 0.4, H: 1.0, W: 0.94,
    gun: 'pistol', mag: 40, reload: 1.2, rate: 0.085, range: 38, want: 12,
    ab1: { name: '순간이동', cd: 3.5, charges: 2 }, ab2: { name: '홀로그램 분신', cd: 9 }, ult: { name: '추적 드론', cost: 1200 },
    passive: '등 뒤에서 맞히면 스킬 쿨 감소',
    desc: [['좌클릭', '에너지 쌍권총'], ['SHIFT', '순간이동 (2회)'], ['E', '홀로그램 분신'], ['Q', '추적 드론 3기']],
  },
  aria: {
    name: '아리아', role: 'dps', sub: '정밀형', era: '과거', hp: 200, speed: 5.6, radius: 0.4, H: 0.98, W: 0.9,
    gun: 'bow', mag: 0, reload: 0, rate: 0.35, range: 60, want: 22, charge: 0.7,
    ab1: { name: '갈고리 화살', cd: 7 }, ab2: { name: '정찰 화살', cd: 11 }, ult: { name: '화살비', cost: 1300 },
    passive: '헤드샷마다 갈고리 쿨 1초 감소',
    desc: [['좌클릭', '눌렀다 떼서 활 쏘기 (당길수록 강함)'], ['SHIFT', '갈고리 화살 · 높은 곳으로'], ['E', '정찰 화살 · 벽 너머 적 표시'], ['Q', '화살비 · 지정 구역 폭격']],
  },
  phase: {
    name: '페이즈', role: 'dps', sub: '제압형', era: '현재', hp: 250, speed: 5.6, radius: 0.4, H: 0.97, W: 0.92,
    gun: 'launcher', mag: 6, reload: 1.6, rate: 0.65, range: 28, want: 14, lob: true,
    ab1: { name: '폭발 도약', cd: 8 }, ab2: { name: '점착 폭탄', cd: 7 }, ult: { name: '박격포 포격', cost: 1400 },
    passive: '처치하면 탄창이 바로 참',
    desc: [['좌클릭', '유탄발사기 (포물선)'], ['SHIFT', '발밑을 터뜨려 높이 도약'], ['E', '점착 폭탄 · 붙고 잠시 뒤 폭발'], ['Q', '박격포 3발']],
  },
  lumen: {
    name: '루멘', role: 'support', sub: '치유형', era: '미래', hp: 225, speed: 5.6, radius: 0.4, H: 1.0, W: 0.92,
    gun: 'staff', mag: 30, reload: 1.4, rate: 0.36, range: 40, want: 12,
    ab1: { name: '가속 보호막', cd: 12 }, ab2: { name: '치유 장판', cd: 14 }, ult: { name: '빛의 고리', cost: 1400 },
    passive: '치유량 25%만큼 자신도 회복',
    desc: [['좌클릭', '에너지 볼트'], ['우클릭', '치유 빔 (누르고 있기)'], ['SHIFT', '아군 가속 + 보호막'], ['E', '치유 장판'], ['Q', '빛의 고리 · 광역 회복']],
  },
  mora: {
    name: '모라', role: 'support', sub: '전술형', era: '현재', hp: 225, speed: 5.6, radius: 0.4, H: 0.98, W: 0.95,
    gun: 'medpistol', mag: 12, reload: 1.5, rate: 0.32, range: 40, want: 14,
    ab1: { name: '가속 장치', cd: 12 }, ab2: { name: '섬광 수류탄', cd: 11 }, ult: { name: '전술 보급', cost: 1300 },
    passive: '넘친 궁극기 게이지를 30%까지 저장',
    desc: [['좌클릭', '공격탄'], ['우클릭', '치유탄 · 맞힌 아군 회복'], ['SHIFT', '가속 장치 · 팀 이동속도 증가'], ['E', '섬광 수류탄 · 적 시야 차단'], ['Q', '전술 보급 · 회복·장전·공격력']],
  },
  iko: {
    name: '이코', role: 'support', sub: '치유형', era: '미래', hp: 225, speed: 5.8, radius: 0.38, H: 0.9, W: 0.86,
    gun: 'nanorifle', mag: 36, reload: 1.3, rate: 0.11, range: 35, want: 13,
    ab1: { name: '방패 드론', cd: 10 }, ab2: { name: '정화', cd: 12 }, ult: { name: '나노 구름', cost: 1400 },
    passive: '치유량 25%만큼 자신도 회복',
    desc: [['좌클릭', '나노탄 · 맞히면 주변 아군 회복'], ['SHIFT', '방패 드론 · 아군 보호막'], ['E', '정화 · 상태이상 해제 + 회복'], ['Q', '나노 구름 · 회복 + 죽지 않음']],
  },
};
for (const [k, h] of Object.entries(HEROES)) { h.id = k; h.art = `assets/art/${k}.jpg`; h.glb = `assets/${k}.glb`; }

export const ROSTER = { tank: ['ratchet', 'orbit', 'nok'], dps: ['tick', 'aria', 'phase'], support: ['lumen', 'mora', 'iko'] };
export const DIFF = [{ err: 0.075, react: 0.6 }, { err: 0.045, react: 0.38 }, { err: 0.026, react: 0.22 }];
export const WEAPONS = ['shotgun', 'pistol', 'staff', 'rifle', 'hammer', 'bow', 'launcher', 'medpistol', 'nanorifle'];
