import * as THREE from 'three';
import { MAPS, COURSES, MAP_LOCKS } from '../maps/data.js';
import { makeDecor, makeExitMarker, makeTrainer, makeTextSprite, mat } from '../entities/models.js';
import { Pikachu, angleDiff } from '../entities/pikachu.js';
import { GIMMICKS } from '../gimmicks/index.js';
import { rng } from './rng.js';

export class World {
  constructor({ renderer, ui, audio, save, input }) {
    Object.assign(this, { renderer, ui, audio, save, input });
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 300);
    this.hemi = new THREE.HemisphereLight('#ffffff', '#5a7a3a', 1.6);
    this.sun = new THREE.DirectionalLight('#ffffff', 1.6);
    this.sun.position.set(6, 12, 8);
    this.scene.add(this.hemi, this.sun);

    this.player = makeTrainer();
    this.pika = new Pikachu(this);
    this.scene.add(this.player, this.pika.obj);

    this.root = null;
    this.map = null;
    this.mapId = null;
    this.colliders = [];
    this.interactables = [];
    this.particles = [];
    this.gimmick = null;
    this.running = false;
    this.lockMove = false;
    this.actionOverride = null;
    this.raycaster = new THREE.Raycaster();
    this.camTarget = new THREE.Vector3();
    this.t = 0;

    input.onTap = (x, y) => this.tap(x, y);
    input.onAction = () => this.doAction();
  }

  // ───────── マップ読み込み ─────────
  lockState(mapId) {
    const l = MAP_LOCKS[mapId];
    if (!l) return { ok: true };
    if (l.requires && !this.save.flag(l.requires)) return { ok: false, msg: l.msg };
    if (l.forbids && this.save.flag(l.forbids)) return { ok: false, msg: l.msg };
    return { ok: true };
  }

  async goto(mapId, opts = {}) {
    this.audio.sfx('door');
    await this.ui.fade(async () => this.load(mapId, opts));
    await this.gimmick?.enter?.();
  }

  load(mapId, { spawn, from } = {}) {
    const map = MAPS[mapId];
    if (!map) throw new Error('unknown map ' + mapId);
    this.gimmick?.dispose?.();
    this.gimmick = null;
    if (this.root) {
      this.scene.remove(this.root);
      this.root.traverse((o) => {
        if (o.material && o.material.map) o.material.dispose();
      });
    }
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.colliders = [];
    this.interactables = [];
    this.particles = [];
    this.actionOverride = null;
    this.lockMove = false;
    this.ui.setTimer(null);
    this.ui.setBlind(false);
    this.map = map;
    this.mapId = mapId;
    const [sx, sz] = map.size;

    // 空と光
    this.scene.background = new THREE.Color(map.sky);
    this.scene.fog = map.indoor ? null : new THREE.Fog(map.fog ?? map.sky, 25, 70);
    this.hemi.intensity = map.night ? 0.5 : 1.6;
    this.sun.intensity = map.night ? 0.3 : 1.6;
    this.sun.color.set(map.night ? '#8fa3ff' : '#ffffff');

    // 地面
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(sx * 2, sz * 2), mat(map.ground));
    ground.rotation.x = -Math.PI / 2;
    this.root.add(ground);
    if (!map.indoor) {
      const outer = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), mat(map.outer ?? map.ground));
      outer.rotation.x = -Math.PI / 2;
      outer.position.y = -0.02;
      this.root.add(outer);
    }
    if (map.sea === 'north') {
      const sea = new THREE.Mesh(new THREE.PlaneGeometry(300, 120), mat('#2f8fd8'));
      sea.rotation.x = -Math.PI / 2;
      sea.position.set(0, -0.01, -sz - 60);
      this.root.add(sea);
      this.seaMesh = sea;
    }
    for (const w of map.water ?? []) {
      const m = new THREE.Mesh(new THREE.CircleGeometry(w.r, 32), mat('#4aa8e8'));
      m.rotation.x = -Math.PI / 2;
      m.position.set(w.at[0], 0.03, w.at[1]);
      this.root.add(m);
      const rim = new THREE.Mesh(new THREE.RingGeometry(w.r, w.r + 0.4, 32), mat('#c9b27a'));
      rim.rotation.x = -Math.PI / 2;
      rim.position.set(w.at[0], 0.025, w.at[1]);
      this.root.add(rim);
      this.colliders.push({ x: w.at[0], z: w.at[1], r: w.r + 0.2 });
    }
    if (map.indoor) this.buildRoomShell(sx, sz);

    // 出口
    for (const ex of map.exits) {
      const m = makeExitMarker(ex.marker);
      m.position.set(ex.at[0], 0, ex.at[1]);
      // マーカーをマップ中心に向ける
      m.rotation.y = Math.atan2(-ex.at[0], -ex.at[1]);
      this.root.add(m);
      this.addInteractable({ obj: m, radius: 2.2, label: ex.label.replace(/（.*）/, ''), onInteract: () => this.useExit(ex) });
    }

    // 背景オブジェクト
    const clear = [
      ...map.exits.map((e) => [e.at[0], e.at[1], 3]),
      ...Object.values(map.spawns).map((p) => [p[0], p[1], 2.5]),
      ...Object.values(map.points ?? {}).map((p) => [p[0], p[1], 3]),
      ...(map.water ?? []).map((w) => [w.at[0], w.at[1], w.r + 1.5]),
    ];
    for (const d of map.decor ?? []) {
      if (d.type === 'fenceRing') this.buildFence(sx, sz, map.exits);
      else this.placeDecor(d.type, d.at[0], d.at[1], d);
    }
    for (const sc of map.scatter ?? []) {
      const r = rng(sc.seed);
      let placed = 0;
      for (let tries = 0; placed < sc.n && tries < sc.n * 20; tries++) {
        const x = (r() * 2 - 1) * (sx - 1);
        const z = (r() * 2 - 1) * (sz - 1);
        if (clear.some(([cx, cz, cr]) => Math.hypot(x - cx, z - cz) < cr)) continue;
        if (map.sea === 'north' && z < -sz + 2) continue;
        this.placeDecor(sc.type, x, z, { s: 0.8 + r() * 0.5, r: r() });
        placed++;
      }
    }

    // 配置
    let sp = map.spawns[spawn] ?? null;
    if (!sp && from) {
      const back = map.exits.find((e) => e.to === from);
      if (back) {
        const [ex, ez] = back.at;
        const len = Math.hypot(ex, ez) || 1;
        sp = [ex - (ex / len) * 3, ez - (ez / len) * 3];
      }
    }
    sp ??= map.spawns.default;
    this.player.position.set(sp[0], 0, sp[1]);
    this.player.rotation.y = Math.PI;
    this.pika.placeNear(this.player.position);
    this.camTarget.copy(this.player.position);
    this.updateCamera(1);

    this.ui.setMapName(map.name);
    this.ui.setFriendship(this.save.friendship);
    this.audio.playBgm(map.bgm);

    const setup = GIMMICKS[map.gimmick];
    if (setup) this.gimmick = setup(this, map) ?? null;
    this.save.data.lastMap = mapId;
    this.save.write();
  }

  buildRoomShell(sx, sz) {
    const wallM = mat('#fbefd5');
    const add = (w, h, d, x, y, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallM);
      m.position.set(x, y, z);
      this.root.add(m);
    };
    add(sx * 2 + 1, 3.2, 0.5, 0, 1.6, -sz - 0.25);
    add(0.5, 1.2, sz * 2, -sx - 0.25, 0.6, 0);
    add(0.5, 1.2, sz * 2, sx + 0.25, 0.6, 0);
    const rug = new THREE.Mesh(new THREE.CircleGeometry(2.2, 24), mat('#e88a8a'));
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(0, 0.02, 0.5);
    this.root.add(rug);
  }

  buildFence(sx, sz, exits) {
    const post = new THREE.BoxGeometry(0.15, 0.9, 0.15);
    const pm = mat('#fff4e0');
    const pts = [];
    for (let x = -sx; x <= sx; x += 1) pts.push([x, -sz], [x, sz]);
    for (let z = -sz + 1; z < sz; z += 1) pts.push([-sx, z], [sx, z]);
    for (const [x, z] of pts) {
      if (exits.some((e) => Math.hypot(e.at[0] - x, e.at[1] - z) < 2.2)) continue;
      const m = new THREE.Mesh(post, pm);
      m.position.set(x, 0.45, z);
      this.root.add(m);
    }
  }

  placeDecor(type, x, z, opts = {}) {
    const d = makeDecor(type, opts);
    d.position.set(x, 0, z);
    d.rotation.y = (opts.r ?? 0) * Math.PI * 2;
    this.root.add(d);
    if (d.userData.collide && !opts.noCollide) this.colliders.push({ x, z, r: d.userData.collide });
    return d;
  }

  // ───────── ギミック用 API ─────────
  add(obj, x = 0, z = 0) {
    obj.position.x = x;
    obj.position.z = z;
    this.root.add(obj);
    return obj;
  }
  addCollider(x, z, r) {
    const c = { x, z, r };
    this.colliders.push(c);
    return c;
  }
  addInteractable(it) {
    it.radius ??= 2;
    this.interactables.push(it);
    return it;
  }
  removeInteractable(it) {
    this.interactables = this.interactables.filter((i) => i !== it);
  }
  distTo(x, z) {
    return Math.hypot(this.player.position.x - x, this.player.position.z - z);
  }
  fx(text, x, y, z, color) {
    const sp = makeTextSprite(text, color);
    sp.position.set(x + (Math.random() - 0.5) * 0.4, y, z);
    this.root.add(sp);
    this.particles.push({ sp, life: 1.1 });
  }
  async getItem(id, name, n = 1) {
    this.save.addItem(id, n);
    this.audio.sfx('get');
    this.ui.toast(`${name} を てにいれた！${n > 1 ? ' ×' + n : ''}`);
  }
  friendship(n) {
    this.save.addFriendship(n);
    this.ui.setFriendship(this.save.friendship);
  }

  // ───────── 出口・コース ─────────
  async useExit(ex) {
    if (ex.course) return this.openCourse(ex.course);
    const lock = this.lockState(ex.to);
    if (!lock.ok) {
      this.audio.sfx('ng');
      return this.ui.say(lock.msg);
    }
    return this.goto(ex.to, { spawn: ex.spawn, from: this.mapId });
  }

  async openCourse(courseId) {
    const c = COURSES[courseId];
    const opts = c.maps.map((id) => {
      const l = this.lockState(id);
      return { label: MAPS[id].name, value: id, disabled: !l.ok, msg: l.msg, note: l.ok ? '' : 'まだ いけない' };
    });
    const pick = await this.ui.choose(c.name + ' ── どこへ おでかけする？', opts);
    if (pick) await this.goto(pick, { from: this.mapId });
  }

  // ───────── 入力 ─────────
  nearest() {
    let best = null;
    let bd = Infinity;
    const p = this.player.position;
    for (const it of this.interactables) {
      if (it.enabled && !it.enabled()) continue;
      const ip = it.obj ? it.obj.position : it.pos;
      const d = Math.hypot(ip.x - p.x, ip.z - p.z);
      if (d < it.radius && d < bd) {
        bd = d;
        best = it;
      }
    }
    return best;
  }

  async run(it) {
    if (this.running) return;
    this.running = true;
    try {
      await it.onInteract();
    } finally {
      this.running = false;
    }
  }

  doAction() {
    if (this.ui.msgResolve) return this.ui.advance();
    if (this.ui.blocking) return;
    if (this.actionOverride) return this.actionOverride.fn();
    const it = this.nearest();
    if (it) this.run(it);
  }

  tap(cx, cy) {
    if (this.ui.blocking || this.running) return;
    const ndc = new THREE.Vector2((cx / window.innerWidth) * 2 - 1, -(cy / window.innerHeight) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    if (this.raycaster.intersectObject(this.pika.obj, true).length) {
      if (this.pika.pos.distanceTo(this.player.position) < 6) this.pika.pet();
      else this.ui.toast('ピカチュウの そばに いこう');
      return;
    }
    const withObj = this.interactables.filter((i) => i.obj && (!i.enabled || i.enabled()));
    const hits = this.raycaster.intersectObjects(withObj.map((i) => i.obj), true);
    if (!hits.length) return;
    let o = hits[0].object;
    let it = null;
    while (o && !it) {
      it = withObj.find((i) => i.obj === o);
      o = o.parent;
    }
    if (!it) return;
    const ip = it.obj.position;
    if (this.distTo(ip.x, ip.z) < Math.max(it.radius * 2, 5)) this.run(it);
    else this.ui.toast('もっと ちかくに いこう');
  }

  // ───────── 物理 ─────────
  resolve(pos, r) {
    for (const c of this.colliders) {
      const dx = pos.x - c.x;
      const dz = pos.z - c.z;
      const d = Math.hypot(dx, dz);
      const min = c.r + r;
      if (d < min && d > 1e-4) {
        pos.x = c.x + (dx / d) * min;
        pos.z = c.z + (dz / d) * min;
      }
    }
    const [sx, sz] = this.map.size;
    pos.x = Math.max(-sx + 0.4, Math.min(sx - 0.4, pos.x));
    pos.z = Math.max(-sz + 0.4, Math.min(sz - 0.4, pos.z));
  }

  // ───────── ループ ─────────
  update(dt) {
    this.t += dt;
    const canMove = !this.ui.blocking && !this.lockMove;
    const a = canMove ? this.input.axis() : { x: 0, z: 0 };
    const speed = 5.2;
    const pl = this.player;
    const mag = Math.hypot(a.x, a.z);
    const { rig, legs } = pl.userData;
    if (mag > 0.05) {
      pl.position.x += a.x * speed * dt;
      pl.position.z += a.z * speed * dt;
      pl.rotation.y += angleDiff(Math.atan2(a.x, a.z), pl.rotation.y) * Math.min(1, dt * 12);
      const sw = Math.sin(this.t * 12) * 0.6 * mag;
      legs[0].rotation.x = sw;
      legs[1].rotation.x = -sw;
      rig.position.y = Math.abs(Math.sin(this.t * 12)) * 0.06;
    } else {
      legs[0].rotation.x = legs[1].rotation.x = 0;
      rig.position.y = 0;
    }
    this.resolve(pl.position, 0.4);
    this.pika.update(dt);
    this.gimmick?.update?.(dt);

    for (const it of this.interactables) {
      const ring = it.obj?.userData.ring;
      if (ring) ring.material.opacity = 0.5 + Math.sin(this.t * 4) * 0.3;
    }
    this.particles = this.particles.filter((p) => {
      p.life -= dt;
      p.sp.position.y += dt * 1.2;
      p.sp.material.opacity = Math.min(1, p.life * 2);
      if (p.life <= 0) {
        this.root.remove(p.sp);
        p.sp.material.dispose();
        return false;
      }
      return true;
    });

    const near = this.ui.blocking || this.running ? null : this.nearest();
    this.ui.setAction(this.actionOverride?.label ?? near?.label ?? null);
    this.updateCamera(dt);
  }

  updateCamera(dt) {
    const k = Math.min(1, dt * 5);
    this.camTarget.lerp(this.player.position, k);
    const indoor = this.map?.indoor;
    const off = indoor ? [0, 8.5, 8.5] : [0, 9, 11];
    this.camera.position.set(this.camTarget.x + off[0], off[1], this.camTarget.z + off[2]);
    this.camera.lookAt(this.camTarget.x, 0.8, this.camTarget.z);
  }
}
