import * as THREE from 'three';
import { part } from '../entities/models.js';

// スオウかいがん: スイカわり。めかくしをしたピカチュウを、声で みちびく。
//   スイカを見て「わって」（「たたいて」「そこ」でもOK）→ ピカチュウがめかくしをしてスタート位置へ
//   「みぎ」「ひだり」「まえ」「うしろ」（自分が向いている方向が基準）で動かし、「わって！」「たたいて！」「そこ！」でぼうをふる
// ・全3ラウンド。ぼうをふれるのは 1ラウンド 1かい だけ
// ・成功するたびに バナナのかわ が すなはまに増える。めかくし中に ふむと すべって転び、そのラウンドは失敗
// 1回でも成功すると「スオウじま」へのふねが解放される。
const STEP = 1.2;
const HIT_R = 1.0;
const ROUNDS = 3;
const PEELS_PER_SUCCESS = 3;
const PEEL_R = 0.6; // バナナのかわを ふんだと みなす きょり（見た目の大きさに合わせる）
const ROUND_WAIT = 1800;

export default function watermelon(w, map) {
  const P = map.points;
  const [sx, sz] = P.suika;

  // スイカ（ラウンドごとに置き場所が変わるので、敷物ごと動かす）
  const suika = w.add(new THREE.Group(), sx, sz);
  const whole = part(new THREE.SphereGeometry(0.5, 16, 12), '#2f8f3a', 0, 0.45, 0);
  suika.add(whole);
  const halves = new THREE.Group();
  halves.add(part(new THREE.SphereGeometry(0.5, 16, 12, 0, Math.PI), '#ff5a5a', -0.4, 0.3, 0).rotateZ(Math.PI / 2));
  halves.add(part(new THREE.SphereGeometry(0.5, 16, 12, 0, Math.PI), '#ff5a5a', 0.4, 0.3, 0).rotateZ(-Math.PI / 2));
  halves.visible = false;
  suika.add(halves);
  suika.add(part(new THREE.BoxGeometry(2, 0.05, 2), '#3f8fd8', 0, 0.02, 0));

  // パラソル
  const para = w.add(new THREE.Group(), ...P.parasol);
  para.add(part(new THREE.CylinderGeometry(0.06, 0.06, 2.6, 6), '#ffffff', 0, 1.3, 0));
  para.add(part(new THREE.ConeGeometry(1.8, 0.6, 8), '#ff6b6b', 0, 2.7, 0));
  w.addCollider(...P.parasol, 0.3);

  // ピカチュウの めかくし と ぼう（モデルの大きさに合わせて付ける）
  let gear = null;
  function wearGear(pika) {
    if (gear) return;
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

  // バナナのかわ
  const peels = [];
  function makePeel() {
    const g = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const leaf = part(new THREE.SphereGeometry(0.16, 8, 6), '#ffd400', 0, 0.04, 0, 0.55, 0.25, 1.5);
      leaf.rotation.y = (i / 3) * Math.PI * 2;
      leaf.translateZ(0.14);
      g.add(leaf);
    }
    g.add(part(new THREE.CylinderGeometry(0.04, 0.05, 0.12, 6), '#6b4a1a', 0, 0.08, 0));
    // 砂の上でも見えるよう、大きめ・濃いめの黄色に茶色のふち
    g.add(part(new THREE.CircleGeometry(0.42, 16), '#6b4a1a', 0, 0.012, 0).rotateX(-Math.PI / 2));
    g.scale.setScalar(1.9);
    g.rotation.y = Math.random() * Math.PI * 2;
    return g;
  }
  // 場所えらび: すなはまの中で、ほかの物から離れた所
  const randomSpot = (avoid, minD) => {
    for (let i = 0; i < 60; i++) {
      const x = (Math.random() * 2 - 1) * 9;
      const z = -8 + Math.random() * 15;
      if (avoid.every(([ax, az, r]) => Math.hypot(x - ax, z - az) > (r ?? minD))) return [x, z];
    }
    return null;
  };
  const avoidList = () => [
    [suika.position.x, suika.position.z, 1.6],
    [P.parasol[0], P.parasol[1], 1.5],
    ...peels.map((p) => [p.position.x, p.position.z, 1.1]),
  ];
  function addPeels(n) {
    for (let i = 0; i < n; i++) {
      const spot = randomSpot([...avoidList(), [P.start[0], P.start[1], 2.0]], 1.1);
      if (!spot) continue;
      peels.push(w.add(makePeel(), ...spot));
    }
  }
  function clearPeels() {
    peels.forEach((p) => w.root.remove(p));
    peels.length = 0;
  }

  // ゲームの状態
  let finish = null;
  let round = 0;
  let wins = 0;
  let phase = null; // null | 'walk'（スタートへ移動中）| 'guide'（めかくしで案内中）| 'result'

  // プレイヤーの向きを基準に、ピカチュウを1歩うごかす
  function step(pika, verb) {
    const f = w.forward;
    const r = w.right;
    const v = { front: [f.x, f.z], back: [-f.x, -f.z], right: [r.x, r.z], left: [-r.x, -r.z] }[verb];
    pika.goTo(pika.pos.x + v[0] * STEP, pika.pos.z + v[1] * STEP, 2.5);
    w.audio.pika('hint');
  }

  async function nextRound(pika) {
    round++;
    if (round > ROUNDS) return endGame(pika);
    phase = 'walk';
    // スイカを置く（1ラウンド目はいつもの場所、2ラウンド目からはランダム）
    const spot = round === 1 ? [sx, sz] : randomSpot([[P.parasol[0], P.parasol[1], 1.8], ...peels.map((p) => [p.position.x, p.position.z, 1.6]), [P.start[0], P.start[1], 4]], 1.6) ?? [sx, sz];
    suika.position.set(spot[0], 0, spot[1]);
    whole.visible = true;
    halves.visible = false;
    // スタート位置: スイカの 4〜8m 手前（プレイヤー側）で、バナナのかわから離れた所
    let start = [P.start[0], P.start[1]];
    for (let i = 0; i < 60; i++) {
      const x = Math.max(-9, Math.min(9, spot[0] + (Math.random() * 2 - 1) * 4));
      const z = Math.min(11, spot[1] + 4 + Math.random() * 4);
      if (peels.every((p) => Math.hypot(p.position.x - x, p.position.z - z) > 1.4)) {
        start = [x, z];
        break;
      }
    }
    removeGear();
    pika.activity = null;
    w.ui.toast(`ラウンド ${round} / ${ROUNDS}`, 1800);
    await pika.goTo(start[0], start[1], 4);
    wearGear(pika);
    pika.spin();
    pika.faceAt = null;
    phase = 'guide';
    pika.activity = {
      title: `スイカわり ${round}/${ROUNDS}`,
      verbs: ['smash', 'right', 'left', 'front', 'back'],
      onCommand: (v) => (v === 'smash' ? swing(pika) : step(pika, v)),
    };
  }

  // ぼうをふる（1ラウンド1回）
  async function swing(pika) {
    if (phase !== 'guide') return;
    phase = 'result';
    pika.activity = null;
    if (gear) {
      gear.stick.rotation.x = 1.3;
      setTimeout(() => gear && (gear.stick.rotation.x = 0), 250);
    }
    pika.jump(0.3);
    const d = Math.hypot(pika.pos.x - suika.position.x, pika.pos.z - suika.position.z);
    if (d < HIT_R) {
      wins++;
      w.audio.sfx('smash');
      whole.visible = false;
      halves.visible = true;
      w.audio.sfx('fanfare');
      pika.jump(0.7);
      w.ui.toast(`パカーン！ せいこう！（${wins}かい め）`, 2200);
      if (round < ROUNDS) {
        // 成功するたびに バナナのかわ が増える
        addPeels(PEELS_PER_SUCCESS);
        setTimeout(() => w.ui.toast('すなはまに バナナのかわが ふえた！ ふまないように みちびこう', 2600), 1200);
      }
    } else {
      w.audio.sfx('dig');
      pika.confused();
      w.ui.toast('すかっ！ はずれ……', 2000);
    }
    await wait(ROUND_WAIT);
    nextRound(pika);
  }

  // バナナのかわを ふんだ
  async function slip(pika) {
    phase = 'result';
    pika.activity = null;
    pika.order?.resolve();
    pika.order = null;
    w.audio.sfx('ng');
    w.audio.pika('sad');
    pika.fall();
    w.ui.toast('ツルッ！ バナナのかわで すべって ころんだ……', 2400);
    await wait(ROUND_WAIT + 400);
    nextRound(pika);
  }

  async function endGame(pika) {
    phase = null;
    pika.activity = null;
    removeGear();
    clearPeels();
    if (wins > 0) {
      w.audio.sfx('fanfare');
      await w.ui.say([`スイカわり おしまい！ ${ROUNDS}ラウンド ちゅう ${wins}かい せいこう！`, 'われた スイカを ピカチュウと いっしょに たべた。あまくて おいしい！']);
      await w.getItem('suikaPiece', 'スイカのかけら', wins);
      w.friendship(wins * 2);
      if (!w.save.flag('watermelonCleared')) {
        w.save.setFlag('watermelonCleared');
        await w.ui.say('ふなのりさん「いい コンビだね！ スオウじまへの ふねに のせてあげよう」');
      }
    } else {
      await w.ui.say(`スイカわり おしまい！ ${ROUNDS}ラウンド ぜんぶ しっぱい……。また ちょうせんしよう！`);
    }
    // つぎの ちょうせんに そなえて スイカを もとに もどす
    suika.position.set(sx, 0, sz);
    whole.visible = true;
    halves.visible = false;
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
        '「みぎ」「ひだり」「まえ」「うしろ」で みちびいて、スイカの まえで「わって！」「たたいて！」「そこ！」。',
        `ぜんぶで ${ROUNDS}ラウンド。ぼうを ふれるのは 1ラウンド 1かい だけ！`,
        'せいこう するたびに バナナのかわが ふえるよ。ふむと すべって ころんで しっぱい！',
      ]),
  });

  w.addInteractable({
    obj: suika, name: 'スイカ', reach: 1.0,
    tasks: [
      {
        verbs: ['smash'],
        enabled: () => !phase,
        run: (pika) =>
          new Promise((resolve) => {
            finish = resolve;
            round = 0;
            wins = 0;
            clearPeels();
            nextRound(pika);
          }),
      },
    ],
  });

  return {
    update() {
      // めかくしで歩いている間に バナナのかわを ふんだら転ぶ
      if (phase !== 'guide') return;
      const p = w.pika.pos;
      if (peels.some((pl) => Math.hypot(pl.position.x - p.x, pl.position.z - p.z) < PEEL_R)) slip(w.pika);
    },
    dispose() {
      phase = null;
      w.pika.activity = null;
      removeGear();
      finish?.();
      finish = null;
    },
    // テスト・デバッグ用
    get state() {
      return { phase, round, wins, peels: peels.map((p) => [p.position.x, p.position.z]), suika: [suika.position.x, suika.position.z] };
    },
  };
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
