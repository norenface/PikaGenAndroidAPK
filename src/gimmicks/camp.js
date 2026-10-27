import * as THREE from 'three';
import { makeMon } from '../entities/models.js';

// キャンプじょう: 1度きりのイベント。たき火・おはなし・はなび。終わると campDone が立ち再訪不可。
export default function camp(w, map) {
  const P = map.points;
  const fire = w.placeDecor('campfire', ...P.fire);
  w.placeDecor('tent', ...P.tent);
  const glow = new THREE.PointLight('#ffa040', 3, 12);
  glow.position.set(P.fire[0], 1.2, P.fire[1]);
  w.root.add(glow);
  const prof = w.add(makeMon('professor'), P.fire[0] - 2.2, P.fire[1] - 1);

  let done = false;
  let fireworks = 0;

  async function event() {
    if (done) return;
    done = true;
    w.lockMove = true;
    w.player.position.set(P.fire[0] + 1.5, 0, P.fire[1] + 2);
    w.pika.goTo(P.fire[0] - 0.5, P.fire[1] + 2.2);
    await w.ui.say(
      ['ようこそ キャンプじょうへ！ こんやは とくべつな よるじゃ。', 'たきびを かこんで、ポケモンたちの むかしばなしを しよう……'],
      'オーキドはかせ',
    );
    await w.ui.say(['……むかし むかし、でんきの もりに ちいさな ピカチュウが いた……', 'ピカチュウは うとうと しはじめた。']);
    w.pika.sleeping = true;
    await w.ui.say('そろそろ はなびの じかんじゃ！', 'オーキドはかせ');
    w.pika.sleeping = false;
    w.pika.jump();
    fireworks = 6;
    await new Promise((r) => setTimeout(r, 4000));
    await w.ui.say(['きれいな はなびだった！', 'みんなで しゃしんを とった。']);
    await w.getItem('campPhoto', 'キャンプのしゃしん');
    w.friendship(10);
    w.save.setFlag('campDone');
    w.lockMove = false;
    await w.ui.say('キャンプは これで おしまい。もんから おうちに かえろう。');
  }

  let fwT = 0;
  return {
    async enter() {
      await event();
    },
    update(dt) {
      fire.children.forEach((c, i) => {
        if (i >= 4) c.scale.y = 1 + Math.sin(w.t * 12 + i) * 0.2;
      });
      glow.intensity = 3 + Math.sin(w.t * 9) * 0.6;
      prof.rotation.y = Math.sin(w.t * 0.5) * 0.4;
      if (fireworks > 0) {
        fwT -= dt;
        if (fwT <= 0) {
          fwT = 0.55;
          fireworks -= 1;
          w.audio.sfx('boom');
          const x = (Math.random() - 0.5) * 14;
          const colors = ['#ff6b6b', '#ffd23f', '#6bd0ff', '#b48bff', '#7cff8a'];
          const c = colors[Math.floor(Math.random() * colors.length)];
          for (let i = 0; i < 8; i++) w.fx('✦', x + Math.cos(i) * 1.5, 7 + Math.sin(i) * 1.5, -8, c);
        }
      }
    },
  };
}
