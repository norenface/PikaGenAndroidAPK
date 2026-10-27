import { makeDecor, makeMon } from '../entities/models.js';
import { rng } from '../core/rng.js';

// モエギそうげん: くさむらに隠れたナゾノクサを探す。ピカチュウが時々ヒントをくれる。
const HIDDEN = 6;

export default function nazonokusa(w) {
  const r = rng(Date.now() & 0xffff);
  const tufts = [];
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2 + r() * 0.3;
    const d = 4 + r() * 12;
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d * 0.9;
    const obj = w.add(makeDecor('grass'), x, z);
    obj.scale.setScalar(1.4);
    const t = { obj, mon: null, found: false };
    tufts.push(t);
    w.addInteractable({
      obj, radius: 1.8,
      enabled: () => !t.found,
      label: 'くさむらを しらべる',
      onInteract: () => search(t),
    });
  }
  tufts
    .slice()
    .sort(() => r() - 0.5)
    .slice(0, HIDDEN)
    .forEach((t) => (t.mon = true));

  let found = 0;
  const friends = [];

  async function search(t) {
    w.audio.sfx('dig');
    t.obj.rotation.z = 0.3;
    setTimeout(() => (t.obj.rotation.z = 0), 200);
    if (!t.mon) {
      t.found = true;
      return w.ui.toast('……なにも いない');
    }
    t.found = true;
    found++;
    const m = w.add(makeMon('nazonokusa'), t.obj.position.x, t.obj.position.z + 0.6);
    friends.push({ m, ph: Math.random() * 6 });
    w.audio.sfx('sparkle');
    w.fx('！', m.position.x, 1.3, m.position.z, '#3f9b4f');
    w.pika.emote('♪', '#3a8a3a');
    if (found < HIDDEN) return w.ui.toast(`ナゾノクサを みつけた！（${found}/${HIDDEN}）`);
    w.audio.sfx('fanfare');
    await w.ui.say(['ナゾノクサたちが ぜんいん でてきた！', 'みんなで たのしそうに おどっている♪']);
    await w.getItem('nazoLeaf', 'ナゾノクサのは');
    w.friendship(3);
    w.save.setFlag('nazoDone');
  }

  let hintT = 6;
  return {
    update(dt) {
      for (const f of friends) {
        f.m.userData.rig.position.y = Math.abs(Math.sin(w.t * 4 + f.ph)) * 0.3;
        f.m.rotation.y += dt * (found >= HIDDEN ? 3 : 0.5);
      }
      hintT -= dt;
      if (hintT <= 0) {
        hintT = 9;
        const left = tufts.filter((t) => t.mon && !t.found);
        if (left.length && Math.random() < 0.4 + w.save.friendship / 200) {
          const t = left[Math.floor(Math.random() * left.length)];
          w.pika.goTo(t.obj.position.x + 0.8, t.obj.position.z + 0.8, 4).then(() => {
            w.audio.pika('hint');
            w.pika.emote('？', '#4a7bd0');
          });
        }
      }
    },
  };
}
