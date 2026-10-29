import * as THREE from 'three';
import { makeDecor, makeFish, part } from '../entities/models.js';
import { ITEMS } from '../maps/items.js';

// つりば共通: さんばしを見てピカチュウに「つって」→ ウキが沈んだら「ひいて！」と声をかける
// 各つりばの釣れるポケモンは map.fishTable で定義（重み付き抽選）
const BITE_WINDOW = 3.0; // 声の認識に時間がかかるので長め

export default function fishing(w, map) {
  const [px, pz] = map.points.pier;
  const [bx, bz] = map.points.bobber;
  const len = Math.abs(pz - bz) + 1.5;
  const pier = w.add(makeDecor('pier', { len }), px, (pz + bz) / 2 + 0.5);
  pier.position.y = 0.01;

  const bobber = new THREE.Group();
  bobber.add(part(new THREE.SphereGeometry(0.15, 10, 8), '#e8432f', 0, 0.1, 0), part(new THREE.SphereGeometry(0.15, 10, 8), '#ffffff', 0, -0.02, 0));
  bobber.visible = false;
  w.add(bobber, bx, bz);
  const line = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: '#ffffff' }));
  line.visible = false;
  w.root.add(line);

  let mode = null; // waiting | bite
  let timer = 0;
  let done = null; // 釣りが終わったら resolve

  const pick = () => {
    const total = map.fishTable.reduce((s, [, n]) => s + n, 0);
    let r = Math.random() * total;
    for (const [id, n] of map.fishTable) if ((r -= n) < 0) return id;
    return map.fishTable[0][0];
  };

  function stop() {
    mode = null;
    bobber.visible = line.visible = false;
    w.pika.activity = null;
    done?.();
    done = null;
  }

  async function reel() {
    const pika = w.pika;
    if (mode === 'waiting') {
      w.audio.sfx('ng');
      pika.confused();
      w.ui.toast('はやすぎた！ さかなが にげちゃった');
      return stop();
    }
    if (mode !== 'bite') return;
    mode = 'reel';
    const id = pick();
    const size = Math.round((20 + Math.random() * 60) * 10) / 10;
    const fish = w.add(makeFish(ITEMS[id].color), pika.pos.x, pika.pos.z);
    fish.position.y = 1.1;
    w.audio.sfx('fanfare');
    pika.jump(0.7);
    pika.emote('！', '#ff8c1a');
    const best = w.save.data.fishing.best;
    const key = `${w.mapId}:${id}`;
    const record = !best[key] || size > best[key];
    if (record) best[key] = size;
    w.save.setFlag('fished');
    bobber.visible = line.visible = false;
    await w.ui.say(`ピカチュウが ${ITEMS[id].name}を つりあげた！ ${size}cm${record ? '（じこベスト！）' : ''}`);
    await w.getItem(id, ITEMS[id].name);
    w.friendship(1);
    w.root.remove(fish);
    stop();
  }

  w.addInteractable({
    pos: new THREE.Vector3(px, 0, pz), name: 'さんばし', reach: 0.05,
    tasks: [
      {
        verbs: ['fish'],
        run: (pika) =>
          new Promise((resolve) => {
            done = resolve;
            pika.faceAt = bobber.position;
            w.audio.sfx('splash');
            bobber.visible = line.visible = true;
            bobber.position.set(bx + (Math.random() - 0.5) * 2, 0, bz + (Math.random() - 0.5) * 1.5);
            mode = 'waiting';
            timer = 3 + Math.random() * 5;
            pika.activity = { title: 'つりちゅう', verbs: ['pull'], onCommand: () => reel() };
            w.ui.toast('ウキが しずんだら ピカチュウに「ひいて！」');
          }),
      },
    ],
  });

  return {
    update(dt) {
      if (!mode) return;
      const p = w.pika.pos;
      line.geometry.setFromPoints([new THREE.Vector3(p.x, 0.85, p.z), bobber.position]);
      if (mode === 'reel') return;
      timer -= dt;
      if (mode === 'waiting') {
        bobber.position.y = Math.sin(w.t * 3) * 0.04;
        if (timer <= 0) {
          mode = 'bite';
          timer = BITE_WINDOW;
          w.audio.sfx('bite');
          w.audio.pika('hint');
          w.fx('！', bobber.position.x, 0.8, bobber.position.z, '#e8432f');
        }
      } else if (mode === 'bite') {
        bobber.position.y = -0.15 + Math.sin(w.t * 30) * 0.06;
        if (timer <= 0) {
          w.ui.toast('にげられた……');
          w.pika.confused();
          stop();
        }
      }
    },
    dispose: stop,
    get state() {
      return mode;
    },
  };
}
