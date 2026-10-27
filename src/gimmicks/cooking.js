import { makeMon, makeItemMesh } from '../entities/models.js';
import { ITEMS } from '../maps/items.js';

// アカネのもり: 食材集め & コイルにおつかい
const ORDER = { kinoko: 2, ringo: 1, ninjin: 1 };

export default function cooking(w, map) {
  const P = map.points;
  const coil = w.add(makeMon('coil'), ...P.coil);
  w.addCollider(...P.coil, 0.6);
  const basket = { kinoko: 0, ringo: 0, ninjin: 0 };
  let accepted = false;

  // 食材を ランダムな 地点に 置く（毎回ちがう）
  const spots = Object.keys(P).filter((k) => /^i\d/.test(k)).sort(() => Math.random() - 0.5);
  const kinds = ['kinoko', 'kinoko', 'kinoko', 'ringo', 'ringo', 'ninjin', 'ninjin'];
  spots.forEach((key, i) => {
    const kind = kinds[i % kinds.length];
    const m = w.add(makeItemMesh(ITEMS[kind].color), ...P[key]);
    m.scale.setScalar(1.8);
    const it = w.addInteractable({
      obj: m, radius: 1.8, label: `${ITEMS[kind].name}を ひろう`,
      onInteract: async () => {
        basket[kind]++;
        w.audio.sfx('get');
        w.ui.toast(`${ITEMS[kind].name}を ひろった！（${summary()}）`);
        w.root.remove(m);
        w.removeInteractable(it);
        w.pika.emote('♪', '#3a8a3a');
      },
    });
  });

  const summary = () => Object.entries(ORDER).map(([k, n]) => `${ITEMS[k].name} ${Math.min(basket[k], n)}/${n}`).join('・');
  const ready = () => Object.entries(ORDER).every(([k, n]) => basket[k] >= n);

  w.addInteractable({
    obj: coil, radius: 2.4, label: 'コイルと はなす',
    onInteract: async () => {
      if (!accepted) {
        await w.ui.say(['ビビビ……オナカ ペコペコ。', 'シチューヲ ツクリタイ。ザイリョウヲ アツメテ キテ。', `ほしいもの: ${summary()}`], 'コイル');
        accepted = true;
        return;
      }
      if (!ready()) return w.ui.say(`ビビ……マダ タリナイ。（${summary()}）`, 'コイル');
      w.audio.sfx('fanfare');
      for (const k in ORDER) basket[k] -= ORDER[k];
      await w.ui.say(['ビビビ！ アリガトウ！', 'コトコト……おいしい シチューが できた！ ピカチュウも まんぞくそう。', 'おれいに ネジを もらった。'], 'コイル');
      w.pika.spin();
      await w.getItem('coilBolt', 'コイルのネジ');
      w.friendship(3);
      w.save.setFlag('cookingDone');
      accepted = false;
    },
  });

  return {
    update() {
      coil.userData.rig.position.y = Math.sin(w.t * 2) * 0.15;
      coil.rotation.y = Math.sin(w.t * 0.7) * 0.6;
    },
  };
}
