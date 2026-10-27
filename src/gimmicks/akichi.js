import * as THREE from 'three';
import { part } from '../entities/models.js';

// うらのあきち: 裏技で来られる小さな空間。ふしぎなはこ と ピカチュウのダンス。
export default function akichi(w, map) {
  const P = map.points;
  const box = w.add(new THREE.Group(), ...P.box);
  box.add(part(new THREE.BoxGeometry(1, 1, 1), '#9b5de5', 0, 0.5, 0));
  box.add(part(new THREE.BoxGeometry(1.05, 0.15, 0.2), '#ffd23f', 0, 0.5, 0.45));
  w.addCollider(...P.box, 0.7);

  const stage = w.add(part(new THREE.CylinderGeometry(1.4, 1.5, 0.2, 16), '#ffcfe0', 0, 0.1, 0), ...P.stage);

  w.addInteractable({
    obj: box, radius: 2, label: 'ふしぎなはこを あける',
    onInteract: async () => {
      if (w.save.data.items.mysteryStone) return w.ui.say('はこは からっぽだ。でも なんだか あたたかい……');
      w.audio.sfx('sparkle');
      await w.ui.say('はこの なかで なにかが ひかっている……！');
      await w.getItem('mysteryStone', 'ふしぎないし');
    },
  });

  let dancing = 0;
  w.addInteractable({
    obj: stage, radius: 2.2, label: 'ピカチュウと おどる',
    onInteract: async () => {
      w.audio.playBgm('secret');
      await w.pika.goTo(P.stage[0], P.stage[1], 5);
      dancing = 6;
      w.lockMove = true;
      await new Promise((r) => setTimeout(r, 6000));
      w.lockMove = false;
      w.friendship(2);
      await w.ui.say('ピカチュウは たのしそうに おどった！');
    },
  });

  let beat = 0;
  return {
    update(dt) {
      if (dancing <= 0) return;
      dancing -= dt;
      beat -= dt;
      if (beat <= 0) {
        beat = 0.5;
        Math.random() < 0.5 ? w.pika.jump(0.4) : w.pika.spin();
        w.pika.emote('♪', '#ff5aa5');
        w.audio.pika(Math.random() < 0.5 ? 'normal' : 'happy');
      }
    },
  };
}
