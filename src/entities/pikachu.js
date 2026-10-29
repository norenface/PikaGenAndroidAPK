import * as THREE from 'three';
import { makePikachu, blobShadow } from './models.js';
import { normalize, findSocial } from '../core/commands.js';

// ピカチュウのAI: ついてくる / うろうろ / 指示を聞いて作業する / ふれあいのことばに反応する
export class Pikachu {
  constructor(world) {
    this.world = world;
    this.obj = makePikachu();
    this.obj.scale.setScalar(0.48); // 一人称視点でひざ丈くらい
    this.t = 0;
    this.jumpT = 0;
    this.spinT = 0;
    this.sleeping = false;
    this.order = null; // { pos, speed, resolve }
    this.wander = null;
    this.wanderT = 2;
    this.walking = false;
    this.unit = 1;
    this.working = null; // 作業中のしごと（{ name }）
    this.activity = null; // 続けて指示を受ける作業（つり・スイカわり）: { verbs, hints, onCommand }
    this.faceAt = null; // 作業中に向く場所
  }

  // Blender で作ったモデル（public/models/pikachu.glb）に差し替える。読めなければ簡易モデルのまま
  useModel(model) {
    const g = this.obj;
    g.clear();
    const rig = new THREE.Group();
    rig.add(model);
    g.add(rig, blobShadow(0.3));
    g.scale.setScalar(1);
    this.unit = 0.48; // 簡易モデルは 0.48 倍表示だったので、ジャンプなどの移動量をそろえる
    const get = (n) => model.getObjectByName(n);
    const parts = { head: get('head'), ears: [get('earL'), get('earR')], tail: get('tail'), arms: [get('armL'), get('armR')] };
    for (const o of [parts.head, parts.tail, ...parts.ears, ...parts.arms]) o.userData.base = o.rotation.clone();
    g.userData = { rig, ...parts };
  }

  get pos() {
    return this.obj.position;
  }

  placeNear(p) {
    this.pos.set(p.x, 0, p.z);
    this.order = null;
    this.sleeping = false;
  }

  // ギミック用: 指定地点まで歩かせる（Promise）。障害物で着けないときも一定時間で打ち切る
  goTo(x, z, speed = 4) {
    this.order?.resolve();
    const limit = this.pos.distanceTo(new THREE.Vector3(x, 0, z)) / speed + 2;
    return new Promise((resolve) => (this.order = { pos: new THREE.Vector3(x, 0, z), speed, resolve, limit }));
  }

  jump(dur = 0.5) {
    this.jumpT = this.jumpDur = dur;
  }
  spin() {
    this.spinT = 1;
  }
  // すべって転ぶ（あおむけにひっくり返る）
  fall(dur = 1.6) {
    this.fallT = dur;
  }
  emote(text, color) {
    this.world.fx(text, this.pos.x, 1.15, this.pos.z, color);
  }

  // タッチでなでる
  pet() {
    const w = this.world;
    this.sleeping = false;
    w.save.addFriendship(1);
    w.ui.setFriendship(w.save.friendship);
    w.audio.pika('happy');
    this.jump(0.4);
    for (let i = 0; i < 3; i++) setTimeout(() => this.emote('♥'), i * 150);
  }

  // ことばを聞いて考える（この間は聞き取り停止）。なかよしほど早い
  async ponder(quick = false) {
    this.thinking = true;
    this.sleeping = false;
    this.emote('…', '#888888');
    const f = this.world.save.friendship;
    await wait(quick ? 250 : 1100 - f * 5 + Math.random() * 400);
    this.thinking = false;
  }

  // 言うことを聞くか（なかよし度しだい。なかよし 10 で約6割、60 以上ならほぼ確実）
  obeys() {
    return Math.random() < 0.55 + this.world.save.friendship / 140;
  }

  // 言うことを聞かない / わからない
  refuse() {
    this.world.audio.pika('sad');
    this.emote('×', '#888888');
    this.shakeT = 0.6;
  }
  confused() {
    this.world.audio.pika('normal');
    this.emote('？', '#4a7bd0');
  }

  // ねらった物のところへ行って作業する（終わるまで待つ Promise）
  async perform(it, task) {
    const w = this.world;
    this.working = task;
    this.sleeping = false;
    w.audio.pika('normal');
    this.emote('！', '#ff8c1a');
    try {
      const p = it.obj ? it.obj.position : it.pos;
      // 作業場所: 目標の手前（プレイヤー側）
      const pl = w.player.position;
      const d = Math.hypot(pl.x - p.x, pl.z - p.z) || 1;
      const reach = it.reach ?? 0.9;
      await this.goTo(p.x + ((pl.x - p.x) / d) * reach, p.z + ((pl.z - p.z) / d) * reach, 4.5);
      this.faceAt = p.clone();
      await task.run(this);
    } finally {
      this.working = null;
      this.faceAt = null;
    }
  }

  // 作業のしぐさ: ぴょこぴょこ跳ねながら、効果音と作業場所にマークを出す
  async busy({ sfx = 'dig', mark = '…', color = '#8a5a2b', n = 3, gap = 380 } = {}) {
    const at = this.faceAt ?? this.pos;
    for (let i = 0; i < n; i++) {
      this.jump(0.25);
      if (sfx) this.world.audio.sfx(sfx);
      if (mark) this.world.fx(mark, at.x, 0.5, at.z, color);
      await wait(gap);
    }
  }

  // ふれあいのことばへの反応
  hear(raw) {
    const w = this.world;
    const kind = findSocial(normalize(raw));
    const obey = this.obeys();
    if (kind === 'call') {
      if (obey) {
        w.audio.pika('call');
        this.emote('！', '#ff8c1a');
        const p = w.followPoint(1.5);
        this.goTo(p.x, p.z, 6).then(() => this.jump());
      } else this.confused();
    } else if (kind === 'praise') {
      w.friendship(obey ? 2 : 1);
      w.audio.pika('happy');
      this.spin();
      this.emote('♥');
    } else if (kind === 'come') {
      const p = w.followPoint(1.2);
      this.goTo(p.x, p.z, 5);
      w.audio.pika('normal');
    } else if (kind === 'sleep') {
      if (this.working) return this.refuse();
      this.sleeping = true;
      w.audio.pika('sleepy');
      this.emote('Z', '#4a7bd0');
    } else if (kind === 'zap') {
      w.audio.pika('call');
      w.audio.sfx('sparkle');
      this.jump(0.6);
      for (let i = 0; i < 5; i++) setTimeout(() => this.emote('⚡', '#ffd000'), i * 90);
    } else this.confused();
  }

  update(dt) {
    this.t += dt;
    const w = this.world;
    const p = w.player.position;
    let goal = null;
    let speed = 3.6;

    if (this.order) {
      goal = this.order.pos;
      speed = this.order.speed;
      this.order.limit -= dt;
      if (this.pos.distanceTo(goal) < 0.3 || this.order.limit <= 0) {
        const r = this.order.resolve;
        this.order = null;
        r();
        goal = null;
      }
    } else if (this.working) {
      // 作業中はその場にとどまる
    } else if (!this.sleeping) {
      // 一人称視点で見えるよう、プレイヤーの少し前（右寄り）についてくる
      const fp = w.followPoint();
      const d = this.pos.distanceTo(fp);
      if (d > 1.2) {
        goal = fp;
        speed = d > 5 ? 6.5 : 4.2;
        this.wander = null;
      } else {
        this.wanderT -= dt;
        if (this.wanderT <= 0) {
          this.wanderT = 2 + Math.random() * 3;
          const a = Math.random() * Math.PI * 2;
          this.wander = Math.random() < 0.5 ? null : new THREE.Vector3(fp.x + Math.cos(a) * 0.8, 0, fp.z + Math.sin(a) * 0.8);
          if (Math.random() < 0.15) w.audio.pika('normal');
        }
        if (this.wander) {
          goal = this.wander;
          speed = 1.6;
          if (this.pos.distanceTo(goal) < 0.3) this.wander = null;
        }
      }
    }

    this.walking = false;
    if (goal) {
      const dx = goal.x - this.pos.x;
      const dz = goal.z - this.pos.z;
      const len = Math.hypot(dx, dz);
      const stop = 0;
      if (len > stop + 0.05) {
        const s = Math.min(speed * dt, len - stop);
        this.pos.x += (dx / len) * s;
        this.pos.z += (dz / len) * s;
        const target = Math.atan2(dx, dz);
        this.obj.rotation.y += angleDiff(target, this.obj.rotation.y) * Math.min(1, dt * 10);
        this.walking = true;
      }
    } else if (!this.sleeping) {
      const look = this.faceAt ?? p;
      const target = Math.atan2(look.x - this.pos.x, look.z - this.pos.z);
      this.obj.rotation.y += angleDiff(target, this.obj.rotation.y) * Math.min(1, dt * 3);
    }
    w.resolve(this.pos, 0.35);

    // アニメーション
    const { rig, ears, tail, head, arms } = this.obj.userData;
    let y = this.walking ? Math.abs(Math.sin(this.t * 14)) * 0.12 : 0;
    if (this.jumpT > 0) {
      this.jumpT -= dt;
      y += Math.sin(Math.PI * (1 - Math.max(0, this.jumpT) / this.jumpDur)) * 0.9;
    }
    rig.position.y = y * this.unit;
    if (this.spinT > 0) {
      this.spinT -= dt;
      rig.rotation.y = (1 - Math.max(0, this.spinT)) * Math.PI * 2;
    } else rig.rotation.y = 0;
    if (this.fallT > 0) this.fallT -= dt;
    rig.rotation.x = this.fallT > 0 ? -1.4 : this.sleeping ? 0.2 : 0;
    rig.scale.y = this.sleeping ? 0.85 + Math.sin(this.t * 2) * 0.03 : 1;
    // パーツの基本の向き（モデルのポーズ）に揺れを足す
    const rot = (o, axis, v) => (o.rotation[axis] = (o.userData.base?.[axis] ?? 0) + v);
    // 首: 考え中はかしげる、いやなときは横にふる
    if (this.shakeT > 0) this.shakeT -= dt;
    rot(head, 'z', this.thinking ? 0.35 : Math.sin(this.t * 1.7) * 0.08);
    rot(head, 'y', this.shakeT > 0 ? Math.sin(this.t * 30) * 0.5 : 0);
    ears.forEach((e, i) => rot(e, 'x', Math.sin(this.t * 3 + i) * 0.12));
    rot(tail, arms ? 'y' : 'z', Math.sin(this.t * (this.walking ? 12 : 4)) * 0.25);
    // 腕: 歩くと前後にふり、ジャンプ・回転のときはバンザイ
    const cheer = this.jumpT > 0 || this.spinT > 0;
    arms?.forEach((a, i) => {
      rot(a, 'x', !cheer && this.walking ? Math.sin(this.t * 14 + i * Math.PI) * 0.5 : 0);
      rot(a, 'z', cheer ? (i === 0 ? 1 : -1) * ARM_UP : 0);
    });
    if (this.sleeping && Math.random() < dt * 0.6) this.emote('Z', '#4a7bd0');
  }
}

const ARM_UP = 1.3; // ジャンプ時に腕を横へ上げる角度
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
