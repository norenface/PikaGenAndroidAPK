import { makeMon } from '../entities/models.js';

// アサギのみずうみ: 迷子のニョロモを、湖の向こうのゼニガメ・ニョロゾのもとへ届ける
// ニョロモを見てピカチュウに「つれてきて」→ ニョロモはピカチュウの後ろについてくるので、ニョロゾの所まで歩いて案内する
export default function nyoromo(w, map) {
  const P = map.points;
  const [hx, hz] = P.home;
  const zeni = w.add(makeMon('zenigame'), hx - 1.5, hz);
  const zo = w.add(makeMon('nyorozo'), hx + 1.5, hz);
  w.addCollider(hx - 1.5, hz, 0.6);
  w.addCollider(hx + 1.5, hz, 0.8);

  const kids = ['n0', 'n1', 'n2'].map((k) => {
    const obj = w.add(makeMon('nyoromo'), ...P[k]);
    const kid = { obj, state: 'lost' }; // lost → follow → home
    w.addInteractable({
      obj, name: 'ニョロモ', reach: 0.8,
      tasks: [
        {
          verbs: ['bring'],
          enabled: () => kid.state === 'lost',
          run: async (pika) => {
            w.audio.pika('call');
            await pika.busy({ sfx: 'ok', mark: '♪', color: '#4a7bd0', n: 1 });
            kid.state = 'follow';
            w.ui.toast('ニョロモが ピカチュウに ついてくる！ ニョロゾの ところへ つれていこう');
          },
        },
      ],
    });
    return kid;
  });

  let delivered = 0;
  w.addInteractable({
    obj: zo, radius: 3, label: 'ニョロゾと はなす',
    onInteract: () =>
      w.ui.say(
        delivered >= 3 ? 'ありがとう！ みんな そろったよ！' : `こどもたちが まいごなの……（あと ${3 - delivered}ひき）`,
        'ニョロゾ',
      ),
  });

  async function arrive(kid) {
    kid.state = 'home';
    delivered++;
    w.audio.sfx('sparkle');
    w.fx('♥', kid.obj.position.x, 1.2, kid.obj.position.z);
    if (delivered < 3) return w.ui.toast(`ニョロモを とどけた！（${delivered}/3）`);
    w.audio.sfx('fanfare');
    w.pika.jump();
    await w.ui.say(['ニョロゾ「みんな ぶじに かえってきた！ ほんとうに ありがとう」', 'ゼニガメ「ゼニゼニ！」 おれいに かいがらを もらった。']);
    await w.getItem('nyoromoShell', 'みずうみのかいがら');
    w.friendship(4);
    w.save.setFlag('nyoromoDone');
  }

  // ピカチュウの足あと（新しい順）。ニョロモはこれをたどるので、湖などをピカチュウと同じように回りこむ
  const trail = [];
  const GAP = 0.9;
  function pointBehind(dist) {
    let p = w.pika.pos;
    let left = dist;
    for (const q of trail) {
      const d = Math.hypot(q.x - p.x, q.z - p.z);
      if (d >= left) return { x: p.x + ((q.x - p.x) / d) * left, z: p.z + ((q.z - p.z) / d) * left };
      left -= d;
      p = q;
    }
    return p;
  }

  return {
    update(dt) {
      const pp = w.pika.pos;
      if (!trail.length || Math.hypot(trail[0].x - pp.x, trail[0].z - pp.z) > 0.25) {
        trail.unshift({ x: pp.x, z: pp.z });
        if (trail.length > 80) trail.pop();
      }
      let n = 0;
      kids.forEach((k, i) => {
        const o = k.obj;
        o.userData.rig.position.y = Math.abs(Math.sin(w.t * 5 + i)) * 0.1;
        if (k.state === 'follow') {
          // ピカチュウの後ろに一列でついてくる
          n++;
          const goal = pointBehind(GAP * n);
          const dx = goal.x - o.position.x;
          const dz = goal.z - o.position.z;
          const d = Math.hypot(dx, dz);
          if (d > 0.05) {
            const s = Math.min(d, (d > 3 ? 7 : 5) * dt);
            o.position.x += (dx / d) * s;
            o.position.z += (dz / d) * s;
            o.rotation.y = Math.atan2(dx, dz);
          }
          w.resolve(o.position, 0.3);
          if (Math.hypot(o.position.x - hx, o.position.z - hz) < 3.5) arrive(k);
        } else if (k.state === 'home') {
          o.position.x += (hx + (i - 1) * 1.2 - o.position.x) * dt * 2;
          o.position.z += (hz + 2 - o.position.z) * dt * 2;
        }
      });
      zeni.userData.rig.rotation.y = Math.sin(w.t) * 0.3;
    },
  };
}
