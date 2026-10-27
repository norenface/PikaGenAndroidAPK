import * as THREE from 'three';
import { makePikachu } from './models.js';

// ピカチュウのAI: ついてくる / うろうろ / よばれたら走ってくる / ギミックからの移動指示
export class Pikachu {
  constructor(world) {
    this.world = world;
    this.obj = makePikachu();
    this.obj.scale.setScalar(0.75);
    this.t = 0;
    this.jumpT = 0;
    this.spinT = 0;
    this.sleeping = false;
    this.order = null; // { pos, speed, resolve }
    this.wander = null;
    this.wanderT = 2;
    this.walking = false;
  }

  get pos() {
    return this.obj.position;
  }

  placeNear(p) {
    this.pos.set(p.x + 1.2, 0, p.z + 0.8);
    this.order = null;
    this.sleeping = false;
  }

  // ギミック用: 指定地点まで歩かせる（Promise）
  goTo(x, z, speed = 4) {
    this.order?.resolve();
    return new Promise((resolve) => (this.order = { pos: new THREE.Vector3(x, 0, z), speed, resolve }));
  }

  jump(dur = 0.5) {
    this.jumpT = this.jumpDur = dur;
  }
  spin() {
    this.spinT = 1;
  }
  emote(text, color) {
    this.world.fx(text, this.pos.x, 1.6, this.pos.z, color);
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

  // こえ（ボタン or 音声認識）への反応
  hear(phrase) {
    const w = this.world;
    const f = w.save.friendship;
    const obey = Math.random() < 0.45 + f / 180;
    if (/ピカ|ぴか|pika/i.test(phrase)) {
      if (obey) {
        this.sleeping = false;
        w.audio.pika('call');
        this.emote('！', '#ff8c1a');
        const p = w.player.position;
        this.goTo(p.x + 1, p.z + 1, 6).then(() => this.jump());
      } else {
        w.audio.pika('normal');
        this.emote('？', '#4a7bd0');
      }
    } else if (/いいこ|かわい|すき|えらい/.test(phrase)) {
      w.save.addFriendship(obey ? 2 : 1);
      w.ui.setFriendship(w.save.friendship);
      w.audio.pika('happy');
      this.spin();
      this.emote('♥');
    } else if (/おいで|こっち/.test(phrase)) {
      const p = w.player.position;
      this.goTo(p.x + 0.8, p.z + 0.8, 5);
      w.audio.pika('normal');
    } else if (/おやすみ|ねんね/.test(phrase)) {
      this.sleeping = true;
      w.audio.pika('sleepy');
      this.emote('Z', '#4a7bd0');
    } else if (/でんき|10まん|10万|ボルト/.test(phrase)) {
      w.audio.pika('call');
      w.audio.sfx('sparkle');
      this.jump(0.6);
      for (let i = 0; i < 5; i++) setTimeout(() => this.emote('⚡', '#ffd000'), i * 90);
    } else {
      w.audio.pika('normal');
      this.emote('？', '#4a7bd0');
    }
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
      if (this.pos.distanceTo(goal) < 0.3) {
        const r = this.order.resolve;
        this.order = null;
        r();
        goal = null;
      }
    } else if (!this.sleeping) {
      const d = this.pos.distanceTo(p);
      if (d > 2.4) {
        goal = p;
        speed = d > 6 ? 6.5 : 3.8;
        this.wander = null;
      } else {
        this.wanderT -= dt;
        if (this.wanderT <= 0) {
          this.wanderT = 2 + Math.random() * 3;
          const a = Math.random() * Math.PI * 2;
          this.wander = Math.random() < 0.5 ? null : new THREE.Vector3(p.x + Math.cos(a) * 1.8, 0, p.z + Math.sin(a) * 1.8);
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
      const stop = this.order ? 0 : goal === p ? 1.8 : 0;
      if (len > stop + 0.05) {
        const s = Math.min(speed * dt, len - stop);
        this.pos.x += (dx / len) * s;
        this.pos.z += (dz / len) * s;
        const target = Math.atan2(dx, dz);
        this.obj.rotation.y += angleDiff(target, this.obj.rotation.y) * Math.min(1, dt * 10);
        this.walking = true;
      }
    } else if (!this.sleeping) {
      const target = Math.atan2(p.x - this.pos.x, p.z - this.pos.z);
      this.obj.rotation.y += angleDiff(target, this.obj.rotation.y) * Math.min(1, dt * 3);
    }
    w.resolve(this.pos, 0.35);

    // アニメーション
    const { rig, ears, tail, head } = this.obj.userData;
    let y = this.walking ? Math.abs(Math.sin(this.t * 14)) * 0.12 : 0;
    if (this.jumpT > 0) {
      this.jumpT -= dt;
      y += Math.sin(Math.PI * (1 - Math.max(0, this.jumpT) / this.jumpDur)) * 0.9;
    }
    rig.position.y = y;
    if (this.spinT > 0) {
      this.spinT -= dt;
      rig.rotation.y = (1 - Math.max(0, this.spinT)) * Math.PI * 2;
    } else rig.rotation.y = 0;
    rig.rotation.x = this.sleeping ? 0.2 : 0;
    rig.scale.y = this.sleeping ? 0.85 + Math.sin(this.t * 2) * 0.03 : 1;
    head.rotation.z = Math.sin(this.t * 1.7) * 0.08;
    ears.forEach((e, i) => (e.rotation.x = Math.sin(this.t * 3 + i) * 0.12));
    tail.rotation.z = Math.sin(this.t * (this.walking ? 12 : 4)) * 0.25;
    if (this.sleeping && Math.random() < dt * 0.6) this.emote('Z', '#4a7bd0');
  }
}

export function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
