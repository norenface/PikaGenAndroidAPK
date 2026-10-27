import * as THREE from 'three';

// プリミティブだけで作るローポリモデル群。外部アセットは使わない。
const mats = new Map();
export function mat(color, extra) {
  const key = color + (extra ? JSON.stringify(extra) : '');
  if (!mats.has(key)) mats.set(key, new THREE.MeshLambertMaterial({ color, ...extra }));
  return mats.get(key);
}

const geos = new Map();
function geo(key, make) {
  if (!geos.has(key)) geos.set(key, make());
  return geos.get(key);
}
const sphere = (r = 1) => geo('s' + r, () => new THREE.SphereGeometry(r, 14, 10));
const box = (w, h, d) => geo(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d));
const cyl = (rt, rb, h, n = 10) => geo(`c${rt},${rb},${h},${n}`, () => new THREE.CylinderGeometry(rt, rb, h, n));
const cone = (r, h, n = 10) => geo(`k${r},${h},${n}`, () => new THREE.ConeGeometry(r, h, n));

export function part(g, color, x = 0, y = 0, z = 0, sx = 1, sy = sx, sz = sx) {
  const m = new THREE.Mesh(g, mat(color));
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  return m;
}

export function blobShadow(r = 0.5) {
  const m = new THREE.Mesh(
    geo('shadow', () => new THREE.CircleGeometry(1, 16)),
    mat('#000000', { transparent: true, opacity: 0.22, depthWrite: false }),
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.02;
  m.scale.setScalar(r);
  return m;
}

// ───────── キャラクター ─────────
export function makePikachu() {
  const Y = '#ffd83a', K = '#222222', R = '#e8432f', BR = '#8a5a2b';
  const g = new THREE.Group();
  const rig = new THREE.Group();
  g.add(rig);
  const body = part(sphere(0.45), Y, 0, 0.5, 0, 1, 1.1, 0.95);
  rig.add(body);
  const head = new THREE.Group();
  head.position.y = 1.15;
  rig.add(head);
  head.add(part(sphere(0.42), Y, 0, 0, 0, 1.05, 0.95, 1));
  const ears = [];
  for (const s of [-1, 1]) {
    const ear = new THREE.Group();
    ear.position.set(0.2 * s, 0.32, 0);
    ear.rotation.z = -0.35 * s;
    ear.add(part(cone(0.11, 0.55), Y, 0, 0.27, 0));
    ear.add(part(cone(0.05, 0.18), K, 0, 0.46, 0));
    head.add(ear);
    ears.push(ear);
    head.add(part(sphere(0.06), K, 0.15 * s, 0.05, 0.36));
    head.add(part(sphere(0.022), '#ffffff', 0.135 * s, 0.075, 0.415));
    head.add(part(sphere(0.09), R, 0.28 * s, -0.1, 0.26, 1, 1, 0.5));
    rig.add(part(sphere(0.1), Y, 0.3 * s, 0.7, 0.3));
    rig.add(part(sphere(0.12), Y, 0.2 * s, 0.1, 0.15, 1, 0.6, 1.3));
  }
  head.add(part(sphere(0.03), K, 0, -0.04, 0.42));
  const tail = new THREE.Group();
  tail.position.set(0, 0.45, -0.42);
  tail.add(part(box(0.1, 0.25, 0.06), BR, 0, 0.1, 0));
  tail.add(part(box(0.1, 0.35, 0.06), Y, 0.12, 0.3, -0.05).rotateZ(-0.9));
  tail.add(part(box(0.32, 0.4, 0.06), Y, 0.05, 0.62, -0.1).rotateZ(0.5));
  rig.add(tail);
  g.add(blobShadow(0.55));
  g.userData = { rig, head, ears, tail, body };
  return g;
}

export function makeTrainer() {
  const g = new THREE.Group();
  const rig = new THREE.Group();
  g.add(rig);
  const legs = [];
  for (const s of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(0.16 * s, 0.7, 0);
    leg.add(part(cyl(0.11, 0.1, 0.7), '#2f4f8f', 0, -0.35, 0));
    leg.add(part(box(0.2, 0.12, 0.3), '#ffffff', 0, -0.68, 0.05));
    rig.add(leg);
    legs.push(leg);
    rig.add(part(cyl(0.08, 0.07, 0.6), '#f2c9a0', 0.38 * s, 1.15, 0).rotateZ(0.15 * s));
  }
  rig.add(part(box(0.62, 0.7, 0.36), '#e8432f', 0, 1.1, 0));
  rig.add(part(sphere(0.27), '#f2c9a0', 0, 1.7, 0));
  rig.add(part(cyl(0.29, 0.29, 0.16, 14), '#e8432f', 0, 1.9, 0));
  rig.add(part(box(0.4, 0.04, 0.25), '#ffffff', 0, 1.84, 0.25));
  rig.add(part(sphere(0.035), '#222', -0.09, 1.72, 0.25));
  rig.add(part(sphere(0.035), '#222', 0.09, 1.72, 0.25));
  g.add(blobShadow(0.55));
  g.userData = { rig, legs };
  return g;
}

// ポケモン仲間（スタンドイン）
export function makeMon(kind) {
  const g = new THREE.Group();
  const rig = new THREE.Group();
  g.add(rig);
  const eyes = (y, z, x = 0.12, c = '#222') => {
    rig.add(part(sphere(0.045), c, -x, y, z));
    rig.add(part(sphere(0.045), c, x, y, z));
  };
  switch (kind) {
    case 'caterpie': {
      for (let i = 0; i < 4; i++) rig.add(part(sphere(0.22 - i * 0.02), '#6cc04a', 0, 0.22 + (i === 0 ? 0.15 : 0), -i * 0.3));
      rig.add(part(sphere(0.1), '#f3e27a', 0, 0.3, 0.17));
      eyes(0.45, 0.17, 0.1);
      rig.add(part(cone(0.04, 0.2), '#e8432f', 0, 0.68, 0));
      break;
    }
    case 'butterfree': {
      rig.add(part(sphere(0.3), '#6d4fb3', 0, 1.2, 0, 0.8, 1, 0.8));
      eyes(1.3, 0.22, 0.12, '#e8432f');
      for (const s of [-1, 1]) {
        rig.add(part(box(0.7, 0.6, 0.03), '#f6f6ff', 0.45 * s, 1.35, -0.1).rotateY(0.4 * s));
        rig.add(part(box(0.5, 0.45, 0.03), '#f6f6ff', 0.35 * s, 0.95, -0.1).rotateY(0.4 * s));
      }
      break;
    }
    case 'coil': {
      rig.add(part(sphere(0.35), '#b9c1c9', 0, 1.0, 0));
      rig.add(part(sphere(0.14), '#ffffff', 0, 1.0, 0.27));
      rig.add(part(sphere(0.06), '#222', 0, 1.0, 0.39));
      rig.add(part(cyl(0.05, 0.05, 0.3), '#8a9199', 0, 1.45, 0));
      rig.add(part(cyl(0.12, 0.12, 0.05), '#8a9199', 0, 1.6, 0));
      for (const s of [-1, 1]) {
        const tm = new THREE.Mesh(geo('torus', () => new THREE.TorusGeometry(0.16, 0.06, 6, 12, Math.PI)), mat('#8a9199'));
        tm.position.set(0.48 * s, 1.0, 0);
        tm.rotation.z = s > 0 ? -Math.PI / 2 : Math.PI / 2;
        rig.add(tm);
      }
      break;
    }
    case 'nyoromo':
    case 'nyorozo': {
      const k = kind === 'nyorozo' ? 1.5 : 1;
      rig.add(part(sphere(0.4 * k), '#5b8cff', 0, 0.45 * k, 0));
      rig.add(part(cyl(0.25 * k, 0.25 * k, 0.04, 16), '#ffffff', 0, 0.45 * k, 0.37 * k).rotateX(Math.PI / 2));
      const sw = new THREE.Mesh(geo('swirl', () => new THREE.TorusGeometry(0.12, 0.025, 6, 16)), mat('#222'));
      sw.position.set(0, 0.45 * k, 0.4 * k);
      sw.scale.setScalar(k);
      rig.add(sw);
      eyes(0.78 * k, 0.25 * k, 0.12 * k);
      rig.add(part(sphere(0.12 * k), '#5b8cff', 0, 0.2 * k, -0.45 * k, 1, 0.6, 1.4));
      break;
    }
    case 'zenigame': {
      rig.add(part(sphere(0.38), '#7ec8e3', 0, 0.55, 0));
      rig.add(part(sphere(0.4), '#a0522d', 0, 0.55, -0.12, 1, 1, 0.8));
      rig.add(part(sphere(0.3), '#f3e2a0', 0, 0.5, 0.18, 1, 1.1, 0.6));
      rig.add(part(sphere(0.3), '#7ec8e3', 0, 1.1, 0.05));
      eyes(1.15, 0.3, 0.12, '#6b3a1f');
      rig.add(part(sphere(0.12), '#7ec8e3', 0, 0.4, -0.5));
      break;
    }
    case 'nazonokusa': {
      rig.add(part(sphere(0.3), '#3a4f9a', 0, 0.3, 0, 1, 0.9, 1));
      eyes(0.38, 0.25, 0.1, '#e8432f');
      for (let i = 0; i < 5; i++) {
        const lf = part(cone(0.1, 0.5, 6), '#3f9b4f', 0, 0.7, 0);
        lf.rotation.set(0.45 * Math.cos((i / 5) * Math.PI * 2), 0, 0.45 * Math.sin((i / 5) * Math.PI * 2));
        rig.add(lf);
      }
      rig.add(part(sphere(0.07), '#3a4f9a', -0.12, 0.02, 0.05));
      rig.add(part(sphere(0.07), '#3a4f9a', 0.12, 0.02, 0.05));
      break;
    }
    case 'professor': {
      rig.add(part(cyl(0.3, 0.35, 1.2), '#ffffff', 0, 0.8, 0));
      rig.add(part(sphere(0.26), '#f2c9a0', 0, 1.65, 0));
      rig.add(part(sphere(0.27), '#bbbbbb', 0, 1.75, -0.05, 1, 0.6, 1));
      break;
    }
    default:
      rig.add(part(sphere(0.4), '#ff00ff', 0, 0.4, 0));
  }
  g.add(blobShadow(kind === 'nyorozo' ? 0.7 : 0.45));
  g.userData = { rig, kind };
  return g;
}

export function makeFish(color) {
  const g = new THREE.Group();
  g.add(part(sphere(0.3), color, 0, 0, 0, 1.4, 0.8, 0.5));
  g.add(part(cone(0.18, 0.3, 4), color, -0.48, 0, 0).rotateZ(Math.PI / 2));
  g.add(part(sphere(0.05), '#222', 0.28, 0.07, 0.12));
  return g;
}

export function makeItemMesh(color) {
  const g = new THREE.Group();
  g.add(part(sphere(0.18), color, 0, 0.18, 0));
  g.add(part(cyl(0.02, 0.02, 0.12, 5), '#5a3b1c', 0, 0.38, 0));
  return g;
}

// ───────── 背景オブジェクト ─────────
export function makeDecor(type, opts = {}) {
  const g = new THREE.Group();
  let collide = 0;
  switch (type) {
    case 'tree':
      g.add(part(cyl(0.18, 0.25, 1.4, 7), '#7a4b25', 0, 0.7, 0));
      g.add(part(geo('ico', () => new THREE.IcosahedronGeometry(1.1, 0)), opts.color ?? '#3f8f3a', 0, 2.1, 0));
      g.add(part(geo('ico', () => new THREE.IcosahedronGeometry(1.1, 0)), '#4fa346', 0.3, 2.7, 0.2, 0.7));
      collide = 0.6;
      break;
    case 'pine':
      g.add(part(cyl(0.15, 0.2, 1, 6), '#5a3b1c', 0, 0.5, 0));
      g.add(part(cone(1.1, 1.6, 8), '#1f5a3a', 0, 1.6, 0));
      g.add(part(cone(0.8, 1.3, 8), '#24693f', 0, 2.4, 0));
      collide = 0.5;
      break;
    case 'palm':
      g.add(part(cyl(0.12, 0.2, 3, 6), '#a87a45', 0.2, 1.5, 0).rotateZ(-0.12));
      for (let i = 0; i < 6; i++) {
        const lf = part(box(1.6, 0.05, 0.4), '#3fa34a', 0.4, 3.0, 0);
        lf.rotation.set(0, (i / 6) * Math.PI * 2, -0.4);
        lf.translateX(0.6);
        g.add(lf);
      }
      collide = 0.4;
      break;
    case 'rock':
      g.add(part(geo('dodec', () => new THREE.DodecahedronGeometry(0.6, 0)), '#8c8c8c', 0, 0.35, 0, 1, 0.7, 1));
      collide = 0.55;
      break;
    case 'bush':
      g.add(part(sphere(0.6), '#4a9a3f', 0, 0.4, 0, 1.2, 0.8, 1));
      g.add(part(sphere(0.45), '#5cb34d', 0.5, 0.35, 0.2));
      collide = 0.6;
      break;
    case 'flower': {
      const c = opts.color ?? ['#ff9ad5', '#fff36b', '#ffffff', '#ff6b6b', '#a98bff'][Math.floor((opts.r ?? Math.random()) * 5)];
      g.add(part(cyl(0.02, 0.02, 0.35, 4), '#3f8f3a', 0, 0.17, 0));
      g.add(part(sphere(0.12), c, 0, 0.38, 0, 1, 0.5, 1));
      g.add(part(sphere(0.05), '#ffd23f', 0, 0.42, 0));
      break;
    }
    case 'stump':
      g.add(part(cyl(0.45, 0.5, 0.5, 10), '#7a4b25', 0, 0.25, 0));
      g.add(part(cyl(0.42, 0.42, 0.02, 10), '#d9b382', 0, 0.51, 0));
      collide = 0.5;
      break;
    case 'grass':
      for (let i = 0; i < 5; i++) {
        const b = part(cone(0.12, 0.9, 4), '#5f9e3a', Math.cos(i * 1.3) * 0.25, 0.45, Math.sin(i * 1.3) * 0.25);
        b.rotation.set(Math.sin(i) * 0.3, 0, Math.cos(i) * 0.3);
        g.add(b);
      }
      break;
    case 'house':
      g.add(part(box(10, 4, 4), '#fff4e0', 0, 2, 0));
      g.add(part(cone(7.5, 2.5, 4), '#c0392b', 0, 5.2, 0, 1, 1, 0.45).rotateY(Math.PI / 4));
      g.add(part(box(1.4, 2.2, 0.1), '#8a5a2b', 0, 1.1, 2.02));
      g.add(part(box(1.4, 1.1, 0.1), '#9fd8ff', -3, 2.3, 2.02));
      g.add(part(box(1.4, 1.1, 0.1), '#9fd8ff', 3, 2.3, 2.02));
      break;
    case 'tent':
      g.add(part(cone(1.8, 2.2, 4), '#ff8c42', 0, 1.1, 0).rotateY(Math.PI / 4));
      collide = 1.5;
      break;
    case 'box':
      g.add(part(box(...opts.size), opts.color ?? '#a0522d', 0, opts.size[1] / 2, 0));
      collide = Math.max(opts.size[0], opts.size[2]) * 0.5;
      break;
    case 'sign':
      g.add(part(cyl(0.06, 0.06, 1.2, 5), '#7a4b25', 0, 0.6, 0));
      g.add(part(box(0.9, 0.5, 0.08), '#d9b382', 0, 1.25, 0));
      collide = 0.3;
      break;
    case 'boat':
      g.add(part(box(1.4, 0.5, 3), '#8a5a2b', 0, 0.25, 0));
      g.add(part(cyl(0.05, 0.05, 2), '#5a3b1c', 0, 1.3, 0));
      g.add(part(box(0.05, 1.2, 1), '#ffffff', 0, 1.5, 0.2));
      break;
    case 'pier':
      g.add(part(box(1.6, 0.2, opts.len ?? 4), '#a87a45', 0, 0.2, 0));
      break;
    case 'campfire':
      for (let i = 0; i < 4; i++) g.add(part(cyl(0.08, 0.08, 1, 5), '#5a3b1c', 0, 0.1, 0).rotateY(i * 0.8).rotateZ(Math.PI / 2));
      g.add(part(cone(0.35, 0.8, 6), '#ff8c1a', 0, 0.5, 0));
      g.add(part(cone(0.2, 0.5, 6), '#ffe15a', 0, 0.45, 0));
      collide = 0.7;
      break;
  }
  g.userData.collide = collide * (opts.s ?? 1);
  if (opts.s) g.scale.setScalar(opts.s);
  return g;
}

// 出口マーカー（光る輪 + 看板）
export function makeExitMarker(kind) {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(
    geo('ring', () => new THREE.RingGeometry(0.9, 1.2, 24)),
    new THREE.MeshBasicMaterial({ color: '#ffe15a', transparent: true, opacity: 0.8, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.04;
  g.add(ring);
  if (kind === 'gate') {
    g.add(part(box(0.3, 2.4, 0.3), '#8a5a2b', -1.4, 1.2, 0));
    g.add(part(box(0.3, 2.4, 0.3), '#8a5a2b', 1.4, 1.2, 0));
    g.add(part(box(3.2, 0.3, 0.3), '#c0392b', 0, 2.4, 0));
  } else if (kind === 'door') {
    g.add(part(box(1.6, 2.4, 0.1), '#bfe8ff', 0, 1.2, 0));
    g.add(part(box(1.8, 0.1, 0.15), '#8a5a2b', 0, 2.45, 0));
  } else if (kind === 'boat') {
    const b = makeDecor('boat');
    b.position.z = -1.5;
    g.add(b);
  } else {
    g.add(makeDecor('sign'));
  }
  g.userData.ring = ring;
  return g;
}

// 文字スプライト（♥ ！ ？ ♪ など）
const spriteTex = new Map();
export function makeTextSprite(text, color = '#ff4d6d', size = 0.6) {
  const key = text + color;
  if (!spriteTex.has(key)) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d');
    ctx.font = 'bold 96px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 10;
    ctx.strokeStyle = '#ffffff';
    ctx.strokeText(text, 64, 70);
    ctx.fillStyle = color;
    ctx.fillText(text, 64, 70);
    spriteTex.set(key, new THREE.CanvasTexture(c));
  }
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: spriteTex.get(key), transparent: true, depthWrite: false }));
  sp.scale.setScalar(size);
  return sp;
}
