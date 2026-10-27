import { makeMon } from '../entities/models.js';

// トキワのもり: キャタピーの子守り
// バタフリーに頼まれ、制限時間のあいだキャタピーたちを巣の近くに留めておく。
// 巣から離れすぎた子は「つれもどす」。遠くに行きすぎて時間切れになると失敗。
const TIME = 60;
const SAFE_R = 6;
const LOST_R = 11;

export default function caterpie(w, map) {
  const [nx, nz] = map.points.nest;
  const mother = w.add(makeMon('butterfree'), nx, nz - 2);
  w.addCollider(nx, nz - 2, 0.6);

  const kids = [];
  for (let i = 0; i < 3; i++) {
    const obj = w.add(makeMon('caterpie'), nx - 2 + i * 2, nz + 1);
    obj.scale.setScalar(1.2);
    const kid = { obj, dir: Math.random() * Math.PI * 2, turnT: 0, farT: 0 };
    kid.it = w.addInteractable({
      obj, radius: 2, label: 'つれもどす',
      enabled: () => state === 'play' && dist(kid) > SAFE_R,
      onInteract: async () => {
        w.audio.sfx('ok');
        obj.position.set(nx + (Math.random() - 0.5) * 2, 0, nz + 1);
        kid.farT = 0;
        w.fx('♪', nx, 1, nz + 1, '#3a8a3a');
      },
    });
    kids.push(kid);
  }
  const dist = (k) => Math.hypot(k.obj.position.x - nx, k.obj.position.z - nz);

  let state = 'idle'; // idle → play → idle
  let timeLeft = 0;
  let helpT = 0;

  w.addInteractable({
    obj: mother, radius: 2.6,
    get label() {
      return state === 'play' ? 'バタフリーと はなす' : 'こもりを ひきうける';
    },
    onInteract: async () => {
      if (state === 'play') return w.ui.say('「みんな だいじょうぶ？ あと すこし おねがいね」', 'バタフリー');
      const ok = await w.ui.choose('バタフリー「すこしの あいだ、こどもたちを みていて くれない？」', [{ label: 'まかせて！', value: true }]);
      if (!ok) return;
      await w.ui.say(['キャタピーたちが はなれすぎないように みていてね。', 'すから とおくへ いったこは「つれもどす」で もどしてあげて！'], 'バタフリー');
      state = 'play';
      timeLeft = TIME;
      mother.visible = false;
    },
  });

  async function finish(success) {
    state = 'done';
    w.ui.setTimer(null);
    mother.visible = true;
    if (success) {
      w.audio.sfx('fanfare');
      w.pika.jump();
      await w.ui.say(['「ありがとう！ こどもたちも とっても たのしかったって！」', 'おれいに はっぱを もらった。'], 'バタフリー');
      await w.getItem('caterpieLeaf', 'キャタピーのはっぱ');
      w.friendship(5);
      w.save.setFlag('caterpieDone');
    } else {
      w.audio.sfx('ng');
      w.audio.pika('sad');
      await w.ui.say(['キャタピーが もりの おくへ いってしまった……', '「だいじょうぶ、わたしが さがしてくるわ。また おねがいね」'], 'バタフリー');
    }
    kids.forEach((k, i) => k.obj.position.set(nx - 2 + i * 2, 0, nz + 1));
    state = 'idle';
  }

  return {
    update(dt) {
      for (const k of kids) {
        const o = k.obj;
        o.userData.rig.position.y = Math.abs(Math.sin(w.t * 6 + k.dir)) * 0.06;
        if (state !== 'play') continue;
        k.turnT -= dt;
        if (k.turnT <= 0) {
          k.turnT = 1 + Math.random() * 2;
          k.dir += (Math.random() - 0.5) * 2.5;
        }
        const sp = 1.1;
        o.position.x += Math.sin(k.dir) * sp * dt;
        o.position.z += Math.cos(k.dir) * sp * dt;
        o.rotation.y = k.dir;
        w.resolve(o.position, 0.3);
        const d = dist(k);
        if (d > SAFE_R) {
          k.farT += dt;
          if (Math.random() < dt) w.fx('！', o.position.x, 1, o.position.z, '#e8432f');
        } else k.farT = 0;
        if (d > LOST_R && k.farT > 6) {
          finish(false);
          return;
        }
      }
      if (state !== 'play') return;
      // なかよしなピカチュウは迷子を連れ戻してくれる
      helpT -= dt;
      if (helpT <= 0 && w.save.friendship >= 40) {
        helpT = 7;
        const far = kids.filter((k) => dist(k) > SAFE_R).sort((a, b) => dist(b) - dist(a))[0];
        if (far) {
          w.pika.goTo(far.obj.position.x, far.obj.position.z, 6).then(() => {
            if (state !== 'play') return;
            w.audio.pika('call');
            far.dir = Math.atan2(nx - far.obj.position.x, nz - far.obj.position.z);
            far.turnT = 3;
          });
        }
      }
      timeLeft -= dt;
      w.ui.setTimer(`こもり のこり ${Math.ceil(timeLeft)}びょう`);
      if (timeLeft <= 0) finish(true);
    },
    dispose() {
      w.ui.setTimer(null);
    },
  };
}
