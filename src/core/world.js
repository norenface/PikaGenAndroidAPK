import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MAPS, COURSES, MAP_LOCKS } from '../maps/data.js';
import { makeDecor, makeExitMarker, makeTrainer, makeTextSprite, mat } from '../entities/models.js';
import { Pikachu } from '../entities/pikachu.js';
import { GIMMICKS } from '../gimmicks/index.js';
import { rng } from './rng.js';
import { VERBS, normalize, findVerb } from './commands.js';

export class World {
  constructor({ renderer, ui, audio, save, input }) {
    Object.assign(this, { renderer, ui, audio, save, input });
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.05, 500);
    this.camera.rotation.order = 'YXZ';
    this.pitch = -0.12;
    this.bob = 0;
    this.sky = new Sky();
    this.scene.add(this.sky.group);
    this.loader = new GLTFLoader();
    this.envCache = new Map();
    this.hemi = new THREE.HemisphereLight('#ffffff', '#5a7a3a', 1.6);
    this.sun = new THREE.DirectionalLight('#ffffff', 1.6);
    this.sun.position.set(6, 12, 8);
    this.scene.add(this.hemi, this.sun);

    // 一人称視点: トレーナーは位置と向きのためだけに使い、表示しない
    this.player = makeTrainer();
    this.player.visible = false;
    this.pika = new Pikachu(this);
    this.scene.add(this.player, this.pika.obj);
    // Blender で作ったピカチュウに差し替え（失敗したら簡易モデルのまま）
    this.loader
      .loadAsync('./models/pikachu.glb')
      .then((g) => this.pika.useModel(toLambert(g.scene)))
      .catch((e) => console.warn('pikachu model not found, using primitives:', e?.message));

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
    this.t = 0;

    // ピカチュウにたのむ物の目印（▼）
    this.focus = null;
    this.pinned = null;
    this.marker = makeTextSprite('▼', '#ffb000', 0.75);
    this.marker.visible = false;
    this.scene.add(this.marker);
    this.onSay = null; // 声で届いたことばを処理する入口（main.js が設定。テストからも使う）

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

  // Blender で作ったマップ（public/maps/<id>.glb + 当たり判定 <id>.json）を読む。無ければ null
  async loadEnv(mapId) {
    if (this.envCache.has(mapId)) return this.envCache.get(mapId);
    let env = null;
    try {
      const [gltf, meta] = await Promise.all([
        this.loader.loadAsync(`./maps/${mapId}.glb`),
        fetch(`./maps/${mapId}.json`).then((r) => r.json()),
      ]);
      toLambert(gltf.scene);
      env = { scene: gltf.scene, colliders: meta.colliders ?? [] };
    } catch (e) {
      console.warn('map model not found, using primitives:', mapId, e?.message);
    }
    this.envCache.set(mapId, env);
    return env;
  }

  async load(mapId, { spawn, from } = {}) {
    const map = MAPS[mapId];
    if (!map) throw new Error('unknown map ' + mapId);
    const env = await this.loadEnv(mapId);
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
    this.focus = this.pinned = null;
    this.pika.activity = null;
    this.ui.setTimer(null);
    this.ui.setBlind(false);
    this.map = map;
    this.mapId = mapId;
    const [sx, sz] = map.size;

    // 空と光
    this.scene.background = new THREE.Color(map.sky);
    this.scene.fog = map.indoor ? null : new THREE.Fog(map.fog ?? map.sky, 40, env ? 170 : 70);
    this.sky.set(map);
    this.hemi.intensity = map.night ? 0.5 : 1.6;
    this.sun.intensity = map.night ? 0.3 : 1.6;
    this.sun.color.set(map.night ? '#8fa3ff' : '#ffffff');

    if (env) {
      this.root.add(env.scene);
      for (const [x, z, r] of env.colliders) this.colliders.push({ x, z, r });
      for (const w of map.water ?? []) this.colliders.push({ x: w.at[0], z: w.at[1], r: w.r + 0.2 });
    } else {
      this.buildPrimitiveGround(map);
    }

    // 出口
    for (const ex of map.exits) {
      const m = makeExitMarker(ex.marker);
      m.position.set(ex.at[0], 0, ex.at[1]);
      // マーカーをマップ中心に向ける
      m.rotation.y = Math.atan2(-ex.at[0], -ex.at[1]);
      this.root.add(m);
      this.addInteractable({ obj: m, radius: 2.2, label: ex.label.replace(/（.*）/, ''), onInteract: () => this.useExit(ex) });
    }

    if (!env) this.buildPrimitiveDecor(map);

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
    // マップの中心を向いて立つ（中心にいるときは北向き）
    this.player.rotation.y = Math.hypot(sp[0], sp[1]) > 1 ? Math.atan2(-sp[0], -sp[1]) : Math.PI;
    this.pitch = -0.12;
    this.pika.placeNear(this.followPoint());
    this.updateCamera(0);

    this.ui.setMapName(map.name);
    this.ui.setFriendship(this.save.friendship);
    this.audio.playBgm(map.bgm);

    const setup = GIMMICKS[map.gimmick];
    if (setup) this.gimmick = setup(this, map) ?? null;
    this.save.data.lastMap = mapId;
    this.save.write();
  }

  // ───────── モデルが無いときの簡易背景 ─────────
  buildPrimitiveGround(map) {
    const [sx, sz] = map.size;
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
    }
    for (const w of map.water ?? []) {
      const m = new THREE.Mesh(new THREE.CircleGeometry(w.r, 32), mat('#4aa8e8'));
      m.rotation.x = -Math.PI / 2;
      m.position.set(w.at[0], 0.03, w.at[1]);
      this.root.add(m);
      this.colliders.push({ x: w.at[0], z: w.at[1], r: w.r + 0.2 });
    }
    if (map.indoor) this.buildRoomShell(sx, sz);
  }

  buildPrimitiveDecor(map) {
    const [sx, sz] = map.size;
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
  // 向いている方向（前・右）の単位ベクトル
  get forward() {
    const r = this.player.rotation.y;
    return { x: Math.sin(r), z: Math.cos(r) };
  }
  get right() {
    const r = this.player.rotation.y;
    return { x: -Math.cos(r), z: Math.sin(r) };
  }
  faceTo(x, z) {
    const p = this.player.position;
    this.player.rotation.y = Math.atan2(x - p.x, z - p.z);
  }
  // ピカチュウの定位置: 視界に入るよう、少し前の右寄り
  followPoint(dist = 2.2) {
    const p = this.player.position;
    const f = this.forward;
    const r = this.right;
    return new THREE.Vector3(p.x + f.x * dist + r.x * 0.6, 0, p.z + f.z * dist + r.z * 0.6);
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
  // プレイヤー自身がする行動（出口・はかせとの通信・看板など）。右下のボタンに出る
  nearest() {
    let best = null;
    let bd = Infinity;
    const p = this.player.position;
    for (const it of this.interactables) {
      if (!it.onInteract || (it.enabled && !it.enabled())) continue;
      const ip = it.obj ? it.obj.position : it.pos;
      const d = Math.hypot(ip.x - p.x, ip.z - p.z);
      if (d >= it.radius) continue;
      // 一人称なので、見ている方向にあるものを優先する（背後のものは真横に来るまで選ばない）
      const f = this.forward;
      const dot = d > 1e-3 ? ((ip.x - p.x) * f.x + (ip.z - p.z) * f.z) / d : 1;
      if (dot < -0.2 && d > 1.2) continue;
      const score = d - dot * 0.8;
      if (score < bd) {
        bd = score;
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

  // ───────── ピカチュウへの指示 ─────────
  // いま使える作業
  tasksOf(it) {
    return (it?.tasks ?? []).filter((t) => !t.enabled || t.enabled());
  }

  // ねらい: タップで選んだ物、なければ見ている方向にある一番近い物
  pickFocus() {
    if (this.pinned && (!this.interactables.includes(this.pinned) || !this.tasksOf(this.pinned).length)) this.pinned = null;
    if (this.pinned) return this.pinned;
    const p = this.player.position;
    const f = this.forward;
    let best = null;
    let bd = Infinity;
    for (const it of this.interactables) {
      if (!this.tasksOf(it).length) continue;
      const ip = it.obj ? it.obj.position : it.pos;
      const d = Math.hypot(ip.x - p.x, ip.z - p.z);
      if (d > 11) continue;
      const dot = d > 1e-3 ? ((ip.x - p.x) * f.x + (ip.z - p.z) * f.z) / d : 1;
      if (dot < 0.75 && d > 1.5) continue; // 視野のまんなか付近だけ
      const score = d * 0.25 + (1 - dot) * 6;
      if (score < bd) {
        bd = score;
        best = it;
      }
    }
    return best;
  }

  // 声で届いたことばを処理する。ピカチュウが反応し終わるまで待つ
  async command(raw) {
    const pika = this.pika;
    const text = normalize(raw);
    // 続けて指示を受ける作業（つり・スイカわり）
    const act = pika.activity;
    const actVerb = act && findVerb(text, act.verbs);
    if (actVerb) {
      await pika.ponder(true);
      act.onCommand(actVerb);
      return;
    }
    const verb = findVerb(text);
    if (!verb) {
      await pika.ponder();
      pika.hear(text);
      await wait(900);
      return;
    }
    // 話しかけた瞬間に向いている物（またはタップで選んだ物）
    const target = this.pickFocus();
    const task = this.tasksOf(target).find((t) => t.verbs.includes(verb));
    await pika.ponder();
    if (!task) {
      pika.confused();
      const words = this.tasksOf(target).map((t) => `「${t.label ?? VERBS[t.verbs[0]].label}」`);
      this.ui.toast(target ? `${target.name}には ${words.join('')} と たのもう` : 'たのみたい ものの ほうを むいてね（タップでも えらべるよ）', 3000);
      return;
    }
    if (pika.working || act) {
      pika.confused();
      this.ui.toast('ピカチュウは いま ほかの ことを しているよ');
      return;
    }
    if (!pika.obeys()) {
      pika.refuse();
      this.ui.toast('ピカチュウは いやみたい……。なかよく なると きいてくれるよ', 2600);
      return;
    }
    // 歩き出したら聞き取りは再開してよいので、作業の終わりは待たない
    pika.perform(target, task, text).catch((e) => console.error(e));
  }

  // 画面に出すヒント（言えることば）。表示だけで、指示は声でする
  updateHints() {
    let title = '';
    let words = [];
    const act = this.pika.activity;
    if (act) {
      title = act.title ?? 'ピカチュウに';
      words = act.verbs.flatMap((v) => VERBS[v].hints ?? [VERBS[v].label]);
    } else if (this.focus) {
      title = this.focus.name;
      words = this.tasksOf(this.focus).flatMap((t) => (t.label ? [t.label] : VERBS[t.verbs[0]].hints ?? [VERBS[t.verbs[0]].label]));
    } else {
      words = ['ピカチュウ！', 'こっちおいで', 'いいこだね'];
    }
    if (this.ui.blocking) words = [];
    this.ui.setHints(title, words);
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
    const withObj = this.interactables.filter((i) => i.obj && ((i.onInteract && (!i.enabled || i.enabled())) || this.tasksOf(i).length));
    const hits = this.raycaster.intersectObjects(withObj.map((i) => i.obj), true);
    if (!hits.length) return;
    let o = hits[0].object;
    let it = null;
    while (o && !it) {
      it = withObj.find((i) => i.obj === o);
      o = o.parent;
    }
    if (!it) return;
    // ピカチュウにたのめる物は「ねらい」にする。そうでなければプレイヤーが調べる
    if (this.tasksOf(it).length) {
      this.pinned = it;
      this.audio.sfx('select');
      return;
    }
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
    const look = this.input.consumeLook(dt);
    const pl = this.player;
    // 見回す（ドラッグ / 矢印キー）。会話中でも見回しはできる
    pl.rotation.y -= look.yaw;
    this.pitch = Math.max(-1.2, Math.min(1.0, this.pitch - look.pitch));
    // 歩く（スティック上 = 前進、左右 = 横歩き）
    const speed = 4.2;
    const mag = Math.hypot(a.x, a.z);
    if (mag > 0.05) {
      const f = this.forward;
      const r = this.right;
      pl.position.x += (f.x * -a.z + r.x * a.x) * speed * dt;
      pl.position.z += (f.z * -a.z + r.z * a.x) * speed * dt;
      this.bob += dt * 9 * mag;
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
    // ピカチュウにたのむ物の目印とヒント
    this.focus = this.pika.activity ? null : this.pickFocus();
    this.marker.visible = !!this.focus;
    if (this.focus) {
      const it = this.focus;
      const o = it.obj ?? null;
      if (it.markerY == null) it.markerY = o ? new THREE.Box3().setFromObject(o).max.y + 0.35 : 1.2;
      const ip = o ? o.position : it.pos;
      this.marker.position.set(ip.x, it.markerY + Math.abs(Math.sin(this.t * 4)) * 0.15, ip.z);
    }
    this.updateHints();
    this.updateCamera();
  }

  // 一人称カメラ: 目の高さ 1.55m、歩くと少し上下にゆれる
  updateCamera() {
    const p = this.player.position;
    this.camera.position.set(p.x, 1.55 + Math.sin(this.bob) * 0.04, p.z);
    this.camera.rotation.set(this.pitch, this.player.rotation.y + Math.PI, 0);
    this.sky.group.position.set(p.x, 0, p.z);
  }
}

// スマホ向けに glTF の PBR マテリアルを Lambert に置き換える（水・海は半透明）
function toLambert(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    const m = o.material;
    const water = /^(water|sea)/.test(m.name);
    o.material = new THREE.MeshLambertMaterial({
      color: m.color,
      vertexColors: !!o.geometry.attributes.color,
      emissive: m.emissive,
      transparent: water,
      opacity: water ? 0.85 : 1,
    });
  });
  return root;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// 空: グラデーションのドーム + 雲（昼）/ 星（夜）。カメラと一緒に動く
class Sky {
  constructor() {
    this.group = new THREE.Group();
    this.uniforms = { top: { value: new THREE.Color() }, bottom: { value: new THREE.Color() } };
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(400, 24, 12),
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        vertexShader: 'varying float h; void main(){ h = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying float h; void main(){ gl_FragColor = vec4(mix(bottom, top, smoothstep(-0.05, 0.5, h)), 1.0); }',
      }),
    );
    dome.renderOrder = -1;
    this.group.add(dome);

    this.clouds = new THREE.Group();
    const r = rng(7);
    const cm = new THREE.MeshBasicMaterial({ color: '#ffffff', fog: false, transparent: true, opacity: 0.92 });
    const cg = new THREE.IcosahedronGeometry(1, 1);
    for (let i = 0; i < 16; i++) {
      const c = new THREE.Group();
      for (let k = 0; k < 4; k++) {
        const m = new THREE.Mesh(cg, cm);
        m.position.set(k * 6 - 9 + r() * 3, r() * 2, r() * 3);
        m.scale.set(7 + r() * 4, 3 + r() * 2, 5 + r() * 2);
        c.add(m);
      }
      const a = r() * Math.PI * 2;
      const d = 140 + r() * 120;
      c.position.set(Math.cos(a) * d, 50 + r() * 40, Math.sin(a) * d);
      c.rotation.y = r() * Math.PI;
      this.clouds.add(c);
    }
    this.group.add(this.clouds);

    const pos = [];
    for (let i = 0; i < 600; i++) {
      const u = r() * Math.PI * 2;
      const v = 0.08 + r() * 0.9;
      pos.push(Math.cos(u) * Math.cos(v) * 350, Math.sin(v) * 350, Math.sin(u) * Math.cos(v) * 350);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: '#ffffff', size: 1.6, sizeAttenuation: false, fog: false }));
    this.group.add(this.stars);
  }

  set(map) {
    this.group.visible = !map.indoor;
    this.uniforms.bottom.value.set(map.sky);
    this.uniforms.top.value.set(map.night ? '#05081c' : '#3f8fe0');
    this.clouds.visible = !map.night;
    this.stars.visible = !!map.night;
  }
}
