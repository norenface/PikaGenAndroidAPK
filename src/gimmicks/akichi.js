import * as THREE from 'three';
import { part } from '../entities/models.js';

// うらのあきち: 裏技で来られる小さな空間。ふしぎなはこを「あけて」、ステージで「おどって」とピカチュウにたのむ。
export default function akichi(w, map) {
  const P = map.points;
  const box = w.add(new THREE.Group(), ...P.box);
  box.add(part(new THREE.BoxGeometry(1, 1, 1), '#9b5de5', 0, 0.5, 0));
  box.add(part(new THREE.BoxGeometry(1.05, 0.15, 0.2), '#ffd23f', 0, 0.5, 0.45));
  w.addCollider(...P.box, 0.7);

  const stage = w.add(part(new THREE.CylinderGeometry(1.4, 1.5, 0.2, 16), '#ffcfe0', 0, 0.1, 0), ...P.stage);

  w.addInteractable({
    obj: box, name: 'ふしぎなはこ', reach: 1.0,
    tasks: [
      {
        verbs: ['open', 'look'],
        label: 'あけて',
        run: async (pika) => {
          await pika.busy({ sfx: null, mark: '？', color: '#9b5de5', n: 2 });
          if (w.save.data.items.mysteryStone) {
            pika.confused();
            return w.ui.toast('はこは からっぽだ。でも なんだか あたたかい……');
          }
          w.audio.sfx('sparkle');
          pika.jump(0.6);
          await w.ui.say('ピカチュウが はこを あけると、なかで なにかが ひかっている……！');
          await w.getItem('mysteryStone', 'ふしぎないし');
        },
      },
    ],
  });

  let dancing = 0;
  w.addInteractable({
    obj: stage, name: 'ステージ', reach: 0.05,
    tasks: [
      {
        verbs: ['dance'],
        run: async (pika) => {
          w.audio.playBgm('secret');
          pika.faceAt = null;
          dancing = 6;
          await new Promise((r) => setTimeout(r, 6000));
          w.friendship(2);
          w.ui.toast('ピカチュウは たのしそうに おどった！');
        },
      },
    ],
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
