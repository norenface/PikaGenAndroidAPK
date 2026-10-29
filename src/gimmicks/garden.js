import * as THREE from 'three';
import { makeDecor, part, mat } from '../entities/models.js';
import { ITEMS } from '../maps/items.js';

// うちのにわ: はたけ（種まき→成長→収穫）/ かだん（水やり）/ いけ
// 作業はすべてピカチュウに声でたのむ。「にんじんを うえて」のように たねの名前も声で伝える（言わなければピカチュウがえらぶ）
const CROPS = {
  ninjin: { name: 'にんじん', grow: 40, re: /にんじん|人参/ },
  kabocha: { name: 'かぼちゃ', grow: 90, re: /かぼちゃ|南瓜/ },
  ichigo: { name: 'いちご', grow: 60, re: /いちご|苺/ },
  daikon: { name: 'だいこん', grow: 50, re: /だいこん|大根/ },
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
    const empty = () => !G.plots[i];
    const ready = () => !!G.plots[i] && progress(G.plots[i]) >= 1;
    w.addInteractable({
      obj: soil, name: 'はたけ', reach: 1.2,
      tasks: [
        { verbs: ['plant', 'dig'], label: 'にんじん・かぼちゃ・いちご・だいこん を うえて', enabled: empty, run: (pika, text) => plant(plot, pika, text) },
        { verbs: ['harvest', 'take', 'dig'], label: 'ぬいて', enabled: ready, run: (pika) => harvest(plot, pika) },
        { verbs: ['look'], enabled: () => !empty() && !ready(), run: (pika) => check(plot, pika) },
      ],
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

  async function plant(plot, pika, text) {
    // 声で言った たね。言わなかったら ピカチュウが すきなのを えらぶ
    const ids = Object.keys(CROPS);
    let pick = ids.find((id) => CROPS[id].re.test(text));
    if (!pick) {
      pick = ids[Math.floor(Math.random() * ids.length)];
      w.ui.toast(`ピカチュウは ${CROPS[pick].name}の たねを えらんだ！`);
    }
    await pika.busy({ sfx: 'dig', mark: '…' });
    G.plots[plot.i] = { crop: pick, at: Date.now() };
    w.save.write();
    drawCrop(plot);
    pika.emote('♪', '#3a8a3a');
    w.ui.toast(`ピカチュウが ${CROPS[pick].name}の たねを うえた！`);
  }

  async function check(plot, pika) {
    const s = G.plots[plot.i];
    await pika.busy({ sfx: null, mark: '？', color: '#4a7bd0', n: 2 });
    w.ui.toast(`${CROPS[s.crop].name}が そだっている……（${Math.floor(progress(s) * 100)}%）`);
  }

  async function harvest(plot, pika) {
    const s = G.plots[plot.i];
    await pika.busy({ sfx: 'dig', mark: '！', color: '#3a8a3a', n: 3, gap: 300 });
    G.plots[plot.i] = null;
    w.save.write();
    drawCrop(plot);
    pika.jump(0.6);
    w.friendship(1);
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
    pos: new THREE.Vector3(P.flowers[0], 0, P.flowers[1]), name: 'かだん', reach: 1.1,
    tasks: [
      {
        verbs: ['water'],
        run: async (pika) => {
          if (G.wateredDay === today()) {
            pika.confused();
            return w.ui.toast('おはなは きょう もう げんきいっぱいだ');
          }
          await pika.busy({ sfx: 'splash', mark: '💧', color: '#3d9be0', n: 3 });
          G.wateredDay = today();
          w.save.write();
          setBloom();
          pika.emote('♥');
          w.friendship(1);
          if (Math.random() < 0.5) await w.getItem('hana', 'おはな');
          else w.ui.toast('おはなが いきいきと さいた！');
        },
      },
    ],
  });

  // いけ
  w.addInteractable({
    pos: new THREE.Vector3(P.pond[0], 0, P.pond[1]), name: 'いけ', reach: 0.3,
    tasks: [
      {
        verbs: ['look'],
        label: 'のぞいて',
        run: async (pika) => {
          await pika.busy({ sfx: null, mark: '？', color: '#4a7bd0', n: 2, gap: 500 });
          const r = Math.random();
          if (r < 0.3) {
            w.audio.sfx('splash');
            pika.jump(0.7);
            await w.ui.say('バシャッ！ コイキングが はねた！ ピカチュウが びっくりしている。');
          } else if (r < 0.5) {
            pika.emote('！', '#ff8c1a');
            await w.getItem('kireinaishi', 'きれいないし');
          } else w.ui.toast('すいめんに ピカチュウの かおが うつっている');
        },
      },
    ],
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
