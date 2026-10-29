import * as THREE from 'three';
import { part } from '../entities/models.js';

// スオウかいがん: スイカわり。めかくしをしたピカチュウを、声で みちびく。
//   スイカを見て「わって」（「たたいて」「そこ」でもOK）→ ピカチュウがめかくしをしてスタート位置へ
//   「みぎ」「ひだり」「まえ」「うしろ」（自分が向いている方向が基準）で動かし、「わって！」「たたいて！」「そこ！」でぼうをふる
// 成功すると「スオウじま」へのふねが解放される。
const STEP = 1.2;
const HIT_R = 1.0;
const SWINGS = 3;

export default function watermelon(w, map) {
  const P = map.points;
  const [sx, sz] = P.suika;
  const suika = w.add(new THREE.Group(), sx, sz);
  const whole = part(new THREE.SphereGeometry(0.5, 16, 12), '#2f8f3a', 0, 0.45, 0);
  suika.add(whole);
  const halves = new THREE.Group();
  halves.add(part(new THREE.SphereGeometry(0.5, 16, 12, 0, Math.PI), '#ff5a5a', -0.4, 0.3, 0).rotateZ(Math.PI / 2));
  halves.add(part(new THREE.SphereGeometry(0.5, 16, 12, 0, Math.PI), '#ff5a5a', 0.4, 0.3, 0).rotateZ(-Math.PI / 2));
  halves.visible = false;
  suika.add(halves);
  w.add(part(new THREE.BoxGeometry(2, 0.05, 2), '#3f8fd8', 0, 0.02, 0), sx, sz);

  // パラソル
  const para = w.add(new THREE.Group(), ...P.parasol);
  para.add(part(new THREE.CylinderGeometry(0.06, 0.06, 2.6, 6), '#ffffff', 0, 1.3, 0));
  para.add(part(new THREE.ConeGeometry(1.8, 0.6, 8), '#ff6b6b', 0, 2.7, 0));
  w.addCollider(...P.parasol, 0.3);

  // ピカチュウの めかくし と ぼう（モデルの大きさに合わせて付ける）
  let gear = null;
  function wearGear(pika) {
    const { rig, head } = pika.obj.userData;
    const k = pika.unit === 1 ? 1 / 0.48 : 1; // 簡易モデルは 0.48 倍表示
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.235 * k, 0.03 * k, 6, 20), new THREE.MeshLambertMaterial({ color: '#222266' }));
    band.rotation.x = Math.PI / 2;
    band.position.y = (pika.unit === 1 ? 0.05 : 0.03) * k;
    head.add(band);
    const stick = part(new THREE.CylinderGeometry(0.03 * k, 0.03 * k, 0.8 * k, 6), '#a87a45', 0.22 * k, 0.55 * k, 0.15 * k);
    rig.add(stick);
    gear = { band, stick, head, rig };
  }
  function removeGear() {
    if (!gear) return;
    gear.head.remove(gear.band);
    gear.rig.remove(gear.stick);
    gear = null;
  }

  let finish = null;
  let swings = 0;

  // プレイヤーの向きを基準に、ピカチュウを1歩うごかす
  function step(pika, verb) {
    const f = w.forward;
    const r = w.right;
    const v = { front: [f.x, f.z], back: [-f.x, -f.z], right: [r.x, r.z], left: [-r.x, -r.z] }[verb];
    pika.goTo(pika.pos.x + v[0] * STEP, pika.pos.z + v[1] * STEP, 2.5);
    w.audio.pika('hint');
  }

  async function swing(pika) {
    swings++;
    if (gear) {
      gear.stick.rotation.x = 1.3;
      setTimeout(() => gear && (gear.stick.rotation.x = 0), 250);
    }
    pika.jump(0.3);
    const d = Math.hypot(pika.pos.x - sx, pika.pos.z - sz);
    if (d < HIT_R) {
      w.audio.sfx('smash');
      whole.visible = false;
      halves.visible = true;
      end();
      w.audio.sfx('fanfare');
      pika.jump(0.7);
      await w.ui.say(['パカーン！ ピカチュウが スイカを みごとに わった！', 'いっしょに スイカを たべた。あまくて おいしい！']);
      await w.getItem('suikaPiece', 'スイカのかけら');
      w.friendship(3);
      if (!w.save.flag('watermelonCleared')) {
        w.save.setFlag('watermelonCleared');
        await w.ui.say('ふなのりさん「いい コンビだね！ スオウじまへの ふねに のせてあげよう」');
      }
      return done();
    }
    w.audio.sfx('dig');
    if (swings >= SWINGS) {
      end();
      w.audio.sfx('ng');
      pika.confused();
      await w.ui.say('すなを たたいてしまった……。また ちょうせんしよう！');
      return done();
    }
    w.ui.toast(`はずれ！ あと ${SWINGS - swings}かい`);
  }

  function end() {
    w.pika.activity = null;
    removeGear();
  }
  function done() {
    finish?.();
    finish = null;
  }

  // はじめ方の説明（プレイヤーが読む）
  w.addInteractable({
    pos: new THREE.Vector3(P.start[0], 0, P.start[1] - 2.5), radius: 2.0, label: 'かんばんを よむ',
    onInteract: () =>
      w.ui.say([
        '「スイカわり ちょうせんしゃ ぼしゅう！」',
        'スイカを みて ピカチュウに「わって」「たたいて」「そこ」と たのむと、めかくしを して スタートするよ。',
        '「みぎ」「ひだり」「まえ」「うしろ」で みちびいて、スイカの まえで「わって！」「たたいて！」「そこ！」。チャンスは 3かい。',
      ]),
  });

  w.addInteractable({
    obj: suika, name: 'スイカ', reach: 1.0,
    tasks: [
      {
        verbs: ['smash'],
        enabled: () => !halves.visible,
        run: (pika) =>
          new Promise((resolve) => {
            finish = resolve;
            swings = 0;
            (async () => {
              await pika.goTo(P.start[0] + (Math.random() - 0.5) * 5, P.start[1], 4);
              wearGear(pika);
              pika.spin();
              pika.faceAt = null;
              w.ui.toast('みぎ・ひだり・まえ・うしろ で みちびいて「わって！」「たたいて！」「そこ！」');
              pika.activity = {
                title: 'スイカわり',
                verbs: ['smash', 'right', 'left', 'front', 'back'],
                onCommand: (v) => (v === 'smash' ? swing(pika) : step(pika, v)),
              };
            })();
          }),
      },
    ],
  });

  return {
    dispose() {
      end();
      done();
    },
  };
}
