import * as THREE from 'three';
import { makeMon, makeItemMesh } from '../entities/models.js';
import { ITEMS } from '../maps/items.js';

// アカネのもり: 食材集め & コイルにおつかい
// コイルの話はプレイヤーが聞き、食材を「とって」「わたして」はピカチュウにたのむ。
const ORDER = { kinoko: 2, ringo: 1, ninjin: 1 };

export default function cooking(w, map) {
  const P = map.points;
  const coil = w.add(makeMon('coil'), ...P.coil);
  w.addCollider(...P.coil, 0.6);
  const basket = { kinoko: 0, ringo: 0, ninjin: 0 };
  let accepted = false;

  // ピカチュウが持っている食材（頭の上に見える）
  const carry = new THREE.Group();
  w.root.add(carry);
  const redrawCarry = () => {
    carry.clear();
    let n = 0;
    for (const [k, c] of Object.entries(basket)) {
      for (let i = 0; i < c; i++) {
        const m = makeItemMesh(ITEMS[k].color);
        m.scale.setScalar(0.6);
        m.position.set((n % 3) * 0.16 - 0.16, Math.floor(n / 3) * 0.2, 0);
        carry.add(m);
        n++;
      }
    }
  };

  // 食材を ランダムな 地点に 置く（毎回ちがう）
  const spots = Object.keys(P).filter((k) => /^i\d/.test(k)).sort(() => Math.random() - 0.5);
  const kinds = ['kinoko', 'kinoko', 'kinoko', 'ringo', 'ringo', 'ninjin', 'ninjin'];
  spots.forEach((key, i) => {
    const kind = kinds[i % kinds.length];
    const m = w.add(makeItemMesh(ITEMS[kind].color), ...P[key]);
    m.scale.setScalar(1.8);
    const it = w.addInteractable({
      obj: m, name: ITEMS[kind].name, reach: 0.5,
      tasks: [
        {
          verbs: ['take', 'harvest'],
          run: async (pika) => {
            await pika.busy({ sfx: null, mark: '♪', color: '#3a8a3a', n: 1 });
            basket[kind]++;
            redrawCarry();
            w.audio.sfx('get');
            w.ui.toast(`ピカチュウが ${ITEMS[kind].name}を ひろった！（${summary()}）`);
            w.root.remove(m);
            w.removeInteractable(it);
          },
        },
      ],
    });
  });

  const summary = () => Object.entries(ORDER).map(([k, n]) => `${ITEMS[k].name} ${Math.min(basket[k], n)}/${n}`).join('・');
  const ready = () => Object.entries(ORDER).every(([k, n]) => basket[k] >= n);
  const holding = () => Object.values(basket).some((n) => n > 0);

  // コイルと話す（プレイヤー）・食材をわたす（ピカチュウ）
  w.addInteractable({
    obj: coil, radius: 2.4, label: 'コイルと はなす', name: 'コイル', reach: 1.0,
    onInteract: async () => {
      if (!accepted) {
        await w.ui.say(['ビビビ……オナカ ペコペコ。', 'シチューヲ ツクリタイ。ザイリョウヲ アツメテ キテ。', `ほしいもの: ${summary()}`], 'コイル');
        await w.ui.say('しょくざいを みて ピカチュウに「とって」、あつまったら コイルを みて「わたして」と たのもう。');
        accepted = true;
        return;
      }
      await w.ui.say(ready() ? 'ビビ……ピカチュウカラ ウケトリタイ。' : `ビビ……マダ タリナイ。（${summary()}）`, 'コイル');
    },
    tasks: [
      {
        verbs: ['give'],
        enabled: () => accepted && holding(),
        run: async (pika) => {
          if (!ready()) {
            pika.confused();
            return w.ui.say(`ビビ……マダ タリナイ。（${summary()}）`, 'コイル');
          }
          await pika.busy({ sfx: 'get', mark: '♪', color: '#3a8a3a', n: 1 });
          for (const k in ORDER) basket[k] -= ORDER[k];
          redrawCarry();
          w.audio.sfx('fanfare');
          await w.ui.say(['ビビビ！ アリガトウ！', 'コトコト……おいしい シチューが できた！ ピカチュウも まんぞくそう。', 'おれいに ネジを もらった。'], 'コイル');
          pika.spin();
          await w.getItem('coilBolt', 'コイルのネジ');
          w.friendship(3);
          w.save.setFlag('cookingDone');
          accepted = false;
        },
      },
    ],
  });

  return {
    update() {
      coil.userData.rig.position.y = Math.sin(w.t * 2) * 0.15;
      coil.rotation.y = Math.sin(w.t * 0.7) * 0.6;
      const p = w.pika.pos;
      carry.position.set(p.x, 1.0 + w.pika.obj.userData.rig.position.y, p.z);
    },
  };
}
