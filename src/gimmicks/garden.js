import * as THREE from 'three';
import { makeDecor, part, mat } from '../entities/models.js';
import { ITEMS } from '../maps/items.js';

// うちのにわ: はたけ（種まき→成長→収穫）/ かだん（水やり）/ いけ
const CROPS = {
  ninjin: { name: 'にんじん', grow: 40 },
  kabocha: { name: 'かぼちゃ', grow: 90 },
  ichigo: { name: 'いちご', grow: 60 },
  daikon: { name: 'だいこん', grow: 50 },
};
const today = () => new Date().toDateString();

export default function garden(w, map) {
  const P = map.points;
  const G = w.save.data.garden;

  // はたけ 2×2
  const plots = [];
  for (let i = 0; i < 4; i++) {
    const x = P.field[0] + (i % 2) * 2.6 - 1.3;
    const z = P.field[1] + Math.floor(i / 2) * 2.6 - 1.3;
    const soil = w.add(part(new THREE.BoxGeometry(2.1, 0.15, 2.1), '#7a4b25', 0, 0.07, 0), x, z);
    const crop = w.add(new THREE.Group(), x, z);
    const plot = { i, x, z, soil, crop };
    plots.push(plot);
    w.addInteractable({
      obj: soil, radius: 1.6,
      get label() {
        const s = G.plots[i];
        if (!s) return 'たねを まく';
        return progress(s) >= 1 ? 'しゅうかくする' : 'ようすを みる';
      },
      onInteract: () => usePlot(plot),
    });
  }

  function progress(s) {
    return Math.min(1, (Date.now() - s.at) / 1000 / CROPS[s.crop].grow);
  }

  function drawCrop(plot) {
    const s = G.plots[plot.i];
    plot.crop.clear();
    if (!s) return;
    const p = progress(s);
    const leaf = part(new THREE.ConeGeometry(0.25, 0.6, 5), '#4fa346', 0, 0.3 + p * 0.3, 0);
    leaf.scale.setScalar(0.4 + p * 0.8);
    plot.crop.add(leaf);
    if (p >= 1) plot.crop.add(part(new THREE.SphereGeometry(0.3, 10, 8), ITEMS[s.crop].color, 0, 0.35, 0.35));
    plot.lastP = p;
  }
  plots.forEach(drawCrop);

  async function usePlot(plot) {
    const s = G.plots[plot.i];
    if (!s) {
      const pick = await w.ui.choose('なんの たねを まく？', Object.entries(CROPS).map(([id, c]) => ({ label: c.name, value: id, note: `${c.grow}びょう` })));
      if (!pick) return;
      G.plots[plot.i] = { crop: pick, at: Date.now() };
      w.save.write();
      w.audio.sfx('dig');
      drawCrop(plot);
      w.pika.goTo(plot.x + 1, plot.z + 1).then(() => w.pika.emote('♪', '#3a8a3a'));
      return;
    }
    const p = progress(s);
    if (p < 1) return w.ui.say(`${CROPS[s.crop].name}が そだっている……（${Math.floor(p * 100)}%）`);
    G.plots[plot.i] = null;
    w.save.write();
    drawCrop(plot);
    w.pika.jump();
    await w.getItem(s.crop, CROPS[s.crop].name);
  }

  // かだん
  const flowers = [];
  for (let i = 0; i < 6; i++) {
    const f = makeDecor('flower', { r: i / 6 });
    flowers.push(w.add(f, P.flowers[0] - 2.5 + i, P.flowers[1]));
  }
  w.add(part(new THREE.BoxGeometry(6.6, 0.12, 1.2), '#8a5a2b', 0, 0.05, 0), P.flowers[0], P.flowers[1]);
  const setBloom = () => flowers.forEach((f) => f.scale.setScalar(G.wateredDay === today() ? 2.2 : 1.2));
  setBloom();
  w.addInteractable({
    pos: new THREE.Vector3(P.flowers[0], 0, P.flowers[1]), radius: 3, label: 'みずを やる',
    onInteract: async () => {
      if (G.wateredDay === today()) return w.ui.say('おはなは きょう もう げんきいっぱいだ。');
      G.wateredDay = today();
      w.save.write();
      w.audio.sfx('splash');
      setBloom();
      w.pika.emote('♥');
      w.friendship(1);
      if (Math.random() < 0.5) await w.getItem('hana', 'おはな');
      else await w.ui.say('おはなが いきいきと さいた！');
    },
  });

  // いけ
  w.addInteractable({
    pos: new THREE.Vector3(P.pond[0], 0, P.pond[1]), radius: 2.2, label: 'いけを のぞく',
    onInteract: async () => {
      w.pika.goTo(P.pond[0] + 0.5, P.pond[1] - 1).then(() => w.pika.emote('？', '#4a7bd0'));
      const r = Math.random();
      if (r < 0.3) {
        w.audio.sfx('splash');
        await w.ui.say('バシャッ！ コイキングが はねた！ ピカチュウが びっくりしている。');
      } else if (r < 0.5) {
        await w.getItem('kireinaishi', 'きれいないし');
      } else await w.ui.say('すいめんに ピカチュウの かおが うつっている。');
    },
  });

  let tick = 0;
  return {
    update(dt) {
      tick += dt;
      if (tick > 1) {
        tick = 0;
        plots.forEach((p) => {
          const s = G.plots[p.i];
          if (s && progress(s) !== p.lastP) drawCrop(p);
        });
      }
    },
  };
}
