import * as THREE from 'three';
import { part } from '../entities/models.js';

// スオウじま: かいぞくの たからばこ発掘。砂山のどれかに宝が埋まっている。
// ピカチュウ（なかよし度が高いほど正確）が においで ヒントをくれる。
export default function treasure(w, map) {
  const P = map.points;
  const keys = Object.keys(P).filter((k) => /^d\d/.test(k));
  const answer = keys[Math.floor(Math.random() * keys.length)];

  // 島の看板（かいぞくの ちず）
  const sign = w.add(new THREE.Group(), 2, 9.5);
  sign.add(part(new THREE.CylinderGeometry(0.06, 0.06, 1.2, 5), '#7a4b25', 0, 0.6, 0));
  sign.add(part(new THREE.BoxGeometry(1, 0.6, 0.08), '#f5e6c8', 0, 1.3, 0));
  w.addInteractable({
    obj: sign, radius: 2, label: 'かんばんを よむ',
    onInteract: () => w.ui.say(['「かいぞく キャプテンの たから ここに ねむる」', '「すなやまの どれか ひとつ……」', '（すなやまを みて ピカチュウに「ほって」と たのもう）']),
  });

  const mounds = keys.map((k) => {
    const [x, z] = P[k];
    const obj = w.add(part(new THREE.SphereGeometry(0.8, 12, 8), '#e2c17a', 0, 0, 0, 1, 0.45, 1), x, z);
    const md = { k, obj, dug: false };
    w.addInteractable({
      obj, name: 'すなやま', reach: 1.0,
      tasks: [{ verbs: ['dig'], enabled: () => !md.dug, run: (pika) => dig(md, pika) }],
    });
    return md;
  });

  // ピカチュウが砂山をほる
  async function dig(md, pika) {
    md.dug = true;
    await pika.busy({ sfx: 'dig', mark: '…', color: '#8a5a2b', n: 4, gap: 320 });
    md.obj.scale.y = 0.15;
    if (md.k !== answer) {
      if (Math.random() < 0.35) {
        pika.emote('♪', '#ff92b2');
        return w.getItem('kaigara', 'さくらがい');
      }
      pika.confused();
      return w.ui.toast('ここには なにも なかった');
    }
    const chest = w.add(new THREE.Group(), md.obj.position.x, md.obj.position.z);
    chest.add(part(new THREE.BoxGeometry(1, 0.6, 0.7), '#8a5a2b', 0, 0.3, 0));
    const lid = part(new THREE.BoxGeometry(1.02, 0.2, 0.72), '#a0522d', 0, 0.7, 0);
    chest.add(lid, part(new THREE.BoxGeometry(0.2, 0.2, 0.05), '#ffd700', 0, 0.5, 0.37));
    w.audio.sfx('fanfare');
    pika.jump(0.7);
    await w.ui.say('ガチッ！ なにか かたいものに あたった！');
    lid.rotation.x = -1.2;
    lid.position.set(0, 0.85, -0.3);
    w.audio.sfx('sparkle');
    for (let i = 0; i < 6; i++) setTimeout(() => w.fx('★', chest.position.x, 1, chest.position.z, '#ffb000'), i * 100);
    await w.ui.say(['かいぞくの たからばこだ！', 'なかには ピカピカの コインが はいっていた！']);
    await w.getItem('treasureCoin', 'かいぞくのコイン');
    w.friendship(5);
    w.save.setFlag('treasureFound');
  }

  let sniffT = 4;
  return {
    update(dt) {
      sniffT -= dt;
      if (sniffT > 0) return;
      sniffT = 10;
      if (w.pika.working) return;
      const target = mounds.find((m) => m.k === answer);
      if (target.dug) return;
      // なかよし度が高いほど 正しい場所を教えてくれる
      const accurate = Math.random() < 0.3 + w.save.friendship / 120;
      const left = mounds.filter((m) => !m.dug);
      const m = accurate ? target : left[Math.floor(Math.random() * left.length)];
      w.pika.goTo(m.obj.position.x + 0.9, m.obj.position.z + 0.6, 4).then(() => {
        w.audio.pika('hint');
        w.pika.emote(accurate ? '！' : '？', accurate ? '#ff8c1a' : '#4a7bd0');
      });
    },
  };
}
