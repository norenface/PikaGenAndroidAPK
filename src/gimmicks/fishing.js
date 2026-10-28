import * as THREE from 'three';
import { makeDecor, makeFish, part } from '../entities/models.js';
import { ITEMS } from '../maps/items.js';

// つりば共通: 桟橋で「つりをする」→ ウキが沈んだ瞬間に「ひく！」
// 各つりばの釣れるポケモンは map.fishTable で定義（重み付き抽選）
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

  let mode = null; // waiting | bite | reel
  let timer = 0;
  let caught = null;

  const pick = () => {
    const total = map.fishTable.reduce((s, [, n]) => s + n, 0);
    let r = Math.random() * total;
    for (const [id, n] of map.fishTable) if ((r -= n) < 0) return id;
    return map.fishTable[0][0];
  };

  function stop() {
    mode = null;
    bobber.visible = line.visible = false;
    w.lockMove = false;
    w.actionOverride = null;
  }

  async function reel() {
    if (mode === 'waiting') {
      w.audio.sfx('ng');
      w.ui.toast('はやすぎた！ さかなが にげちゃった');
      return stop();
    }
    if (mode !== 'bite') return;
    mode = 'reel';
    const id = pick();
    const size = Math.round((20 + Math.random() * 60) * 10) / 10;
    caught = w.add(makeFish(ITEMS[id].color), px, pz - 0.5);
    caught.position.y = 1.6;
    w.audio.sfx('fanfare');
    w.pika.jump();
    w.pika.emote('！', '#ff8c1a');
    const best = w.save.data.fishing.best;
    const key = `${w.mapId}:${id}`;
    const record = !best[key] || size > best[key];
    if (record) best[key] = size;
    w.save.setFlag('fished');
    stop();
    await w.ui.say(`${ITEMS[id].name}が つれた！ ${size}cm${record ? '（じこベスト！）' : ''}`);
    await w.getItem(id, ITEMS[id].name);
    w.root.remove(caught);
    caught = null;
  }

  w.addInteractable({
    pos: new THREE.Vector3(px, 0, pz), radius: 2.2, label: 'つりをする',
    onInteract: async () => {
      w.player.position.set(px, 0, pz);
      w.faceTo(bx, bz);
      w.pitch = -0.25;
      w.lockMove = true;
      w.audio.sfx('splash');
      bobber.visible = line.visible = true;
      bobber.position.set(bx + (Math.random() - 0.5) * 2, 0, bz + (Math.random() - 0.5) * 1.5);
      mode = 'waiting';
      timer = 2 + Math.random() * 5;
      w.actionOverride = { label: 'ひく！', fn: reel };
      w.ui.toast('ウキが しずんだら「ひく！」');
      w.pika.goTo(px + 1, pz + 0.5).then(() => w.pika.emote('？', '#4a7bd0'));
    },
  });

  return {
    update(dt) {
      if (!mode) return;
      const p = w.player.position;
      line.geometry.setFromPoints([new THREE.Vector3(p.x + 0.4, 1.8, p.z - 0.3), bobber.position]);
      timer -= dt;
      if (mode === 'waiting') {
        bobber.position.y = Math.sin(w.t * 3) * 0.04;
        if (timer <= 0) {
          mode = 'bite';
          timer = 1.1;
          w.audio.sfx('bite');
          w.audio.pika('hint');
          w.fx('！', bobber.position.x, 0.8, bobber.position.z, '#e8432f');
        }
      } else if (mode === 'bite') {
        bobber.position.y = -0.15 + Math.sin(w.t * 30) * 0.06;
        if (timer <= 0) {
          w.ui.toast('にげられた……');
          stop();
        }
      }
    },
    dispose: stop,
  };
}
