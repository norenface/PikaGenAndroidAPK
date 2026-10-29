import * as THREE from 'three';
import { makeDecor, makeFish, part } from '../entities/models.js';
import { ITEMS } from '../maps/items.js';

// つりば共通: ポケモンがかかったら、ピカチュウにタイミングよく声をかけて釣りあげるゲーム
//   さんばしを見て「つって」→ 最大6ラウンド（時間切れなら5ラウンドで終わることも）
//   1. ピカチュウが自動でさおをふって、ウキを投げる
//   2. 1〜10秒後にポケモンがかかる。大きいほどモデルも大きく、力も強い（つるのが むずかしい）
//   3. とおくにいるときは「がんばれ」で ひきよせる
//   4. ちかくに来たら「ひっぱれ」で つりあげる。とおいのに「ひっぱれ」と言うと にげられる
//   5. 声をかけるたびにピカチュウは つかれて、ひきよせる力も つりあげる成功率も下がっていく
//   6. まっている間に「おひる」「おべんとう」「ランチ」→ いっしょにお弁当を食べて つかれが全回復（1回だけ）
// 各つりばの釣れるポケモンは map.fishTable で定義（重み付き抽選）
const ROUNDS = 6;
const SESSION_TIME = 150; // 秒。長いやりとりが続くと6ラウンドまで行けない
const MIN_TIME_FOR_ROUND = 8;
const CATCH_D = 3.0; // これより近ければ「ひっぱれ」で つりあげられる
const MAX_D = 13; // これより遠くへ行かれると糸が切れて にげられる
const FATIGUE_PER_CALL = 0.035; // 1ラウンドで 5〜8回 声をかけると 0.2〜0.3 たまる

export default function fishing(w, map) {
  const [px, pz] = map.points.pier;
  const [bx, bz] = map.points.bobber;
  const len = Math.abs(pz - bz) + 1.5;
  const pier = w.add(makeDecor('pier', { len }), px, (pz + bz) / 2 + 0.5);
  pier.position.y = 0.01;
  // 投げる方向（さんばしの先 → 水の方）
  const dirLen = Math.hypot(bx - px, bz - pz) || 1;
  const dir = { x: (bx - px) / dirLen, z: (bz - pz) / dirLen };

  const bobber = new THREE.Group();
  bobber.add(part(new THREE.SphereGeometry(0.15, 10, 8), '#e8432f', 0, 0.1, 0), part(new THREE.SphereGeometry(0.15, 10, 8), '#ffffff', 0, -0.02, 0));
  bobber.visible = false;
  w.add(bobber, bx, bz);
  const line = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: '#ffffff' }));
  line.visible = false;
  w.root.add(line);

  // お弁当
  const bento = new THREE.Group();
  bento.add(part(new THREE.BoxGeometry(0.4, 0.12, 0.28), '#c0392b', 0, 0.06, 0), part(new THREE.BoxGeometry(0.36, 0.02, 0.24), '#fff8e0', 0, 0.13, 0));
  bento.add(part(new THREE.SphereGeometry(0.05, 8, 6), '#ffffff', -0.08, 0.15, 0), part(new THREE.SphereGeometry(0.04, 8, 6), '#f2b134', 0.08, 0.15, 0.03));
  bento.visible = false;
  w.root.add(bento);

  // ゲームの状態
  let session = null; // { round, time, fatigue, lunchUsed, catches: [], done }
  let phase = null; // cast | wait | lunch | fight | result
  let waitT = 0;
  let fish = null; // { id, size, power, d, model }

  const pick = () => {
    const total = map.fishTable.reduce((s, [, n]) => s + n, 0);
    let r = Math.random() * total;
    for (const [id, n] of map.fishTable) if ((r -= n) < 0) return id;
    return map.fishTable[0][0];
  };
  const rodTip = () => new THREE.Vector3(w.pika.pos.x + dir.x * 0.3, 0.85, w.pika.pos.z + dir.z * 0.3);
  const spotAt = (d) => ({ x: w.pika.pos.x + dir.x * d, z: w.pika.pos.z + dir.z * d });

  // 画面上部の表示: ラウンド・のこり時間・つかれ・きょり
  function showStatus() {
    if (!session) return w.ui.setTimer(null);
    const f = Math.round(session.fatigue * 5);
    const tired = '■'.repeat(f) + '□'.repeat(5 - f);
    const dist = phase === 'fight' && fish ? `　きょり ${fish.d.toFixed(1)}m${fish.d < CATCH_D ? '！' : ''}` : '';
    w.ui.setTimer(`🎣 ${Math.min(session.round, ROUNDS)}/${ROUNDS}　⏱${Math.ceil(Math.max(0, session.time))}　つかれ ${tired}${dist}`);
  }

  // つぎのラウンド（ピカチュウが自動でさおをふる）
  async function nextRound() {
    const pika = w.pika;
    session.round++;
    if (session.round > ROUNDS || session.time < MIN_TIME_FOR_ROUND) return endSession();
    phase = 'cast';
    fish = null;
    pika.jump(0.4);
    w.audio.sfx('select');
    await wait(450);
    if (!session) return;
    w.audio.sfx('splash');
    const cast = 6.5 + Math.random() * 2.5;
    const s = spotAt(cast);
    bobber.position.set(s.x, 0, s.z);
    bobber.visible = line.visible = true;
    waitT = 1 + Math.random() * 9;
    phase = 'wait';
    w.ui.toast(`ラウンド ${session.round}！ ポケモンが かかるのを まとう`, 1800);
  }

  // ポケモンがかかった
  function hook() {
    const id = pick();
    // 20〜120cm（小さいほど多い）。大きいほど力が強い
    const size = Math.round((20 + Math.pow(Math.random(), 1.6) * 100) * 10) / 10;
    const power = size / 50;
    const model = w.add(makeFish(ITEMS[id].color), bobber.position.x, bobber.position.z);
    model.scale.setScalar(0.9 + size / 40); // 20cm → 約1.4倍、120cm → 約3.9倍
    model.position.y = 0.05;
    model.rotation.y = Math.atan2(dir.x, dir.z) + Math.PI / 2;
    const d = Math.hypot(bobber.position.x - w.pika.pos.x, bobber.position.z - w.pika.pos.z);
    fish = { id, size, power, d, model, near: false };
    bobber.visible = false;
    phase = 'fight';
    w.audio.sfx('bite');
    w.audio.pika('call');
    w.pika.jump(0.35);
    w.fx('！', model.position.x, 1.2, model.position.z, '#e8432f');
    w.ui.toast(size >= 80 ? 'おおものが かかった！「がんばれ」で ひきよせよう' : 'かかった！「がんばれ」で ひきよせよう', 2400);
  }

  function addFatigue() {
    session.fatigue = Math.min(1, session.fatigue + FATIGUE_PER_CALL);
    if (session.fatigue >= 0.5 && Math.random() < 0.5) w.pika.emote('💦', '#3d9be0');
  }

  // 「がんばれ」: ひきよせる（つかれているほど、相手が大きいほど 少ししか よらない）
  function cheer() {
    if (!session) return;
    if (phase !== 'fight') {
      w.pika.confused();
      return w.ui.toast(phase === 'wait' ? 'まだ かかっていないよ' : 'いまは まってね');
    }
    addFatigue();
    const pull = (2.2 / (0.5 + 0.5 * fish.power)) * (1 - 0.55 * session.fatigue) * (0.8 + Math.random() * 0.4);
    fish.d = Math.max(1.2, fish.d - pull);
    w.pika.jump(0.25);
    w.audio.pika('call');
    w.audio.sfx('splash');
    w.fx('！', w.pika.pos.x, 1.2, w.pika.pos.z, '#ff8c1a');
  }

  // 「ひっぱれ」: 近ければ つりあげる（つかれ・大きさで 失敗することも）。遠ければ にげられる
  async function haul() {
    if (!session) return;
    if (phase !== 'fight') {
      w.pika.confused();
      return w.ui.toast(phase === 'wait' ? 'まだ かかっていないよ' : 'いまは まってね');
    }
    addFatigue();
    phase = 'result';
    const pika = w.pika;
    if (fish.d >= CATCH_D) {
      w.audio.sfx('ng');
      pika.confused();
      w.ui.toast('まだ とおかった！ にげられた……', 2200);
      return finishRound(false);
    }
    const chance = Math.max(0.2, Math.min(1, 1 - 0.45 * session.fatigue - Math.max(0, fish.power - 1) * 0.18));
    if (Math.random() > chance) {
      w.audio.sfx('ng');
      pika.fall(1.0);
      w.ui.toast('ちからまけ！ にげられた……', 2200);
      return finishRound(false);
    }
    // つりあげ成功
    const { id, size, model } = fish;
    model.position.set(pika.pos.x, 1.2, pika.pos.z);
    w.audio.sfx('fanfare');
    pika.jump(0.7);
    const best = w.save.data.fishing.best;
    const key = `${w.mapId}:${id}`;
    const record = !best[key] || size > best[key];
    if (record) best[key] = size;
    w.save.setFlag('fished');
    session.catches.push({ id, size });
    w.save.addItem(id, 1);
    w.ui.toast(`${ITEMS[id].name} ${size}cm を つりあげた！${record ? '（じこベスト！）' : ''}`, 2600);
    finishRound(true);
  }

  async function finishRound(caught) {
    phase = 'result';
    bobber.visible = line.visible = false;
    const m = fish?.model;
    if (m && !caught) w.fx('💦', m.position.x, 0.6, m.position.z, '#3d9be0');
    await wait(caught ? 2200 : 1400);
    if (m) w.root.remove(m);
    fish = null;
    if (session) nextRound();
  }

  // 「おひる」「おべんとう」「ランチ」: まっている間だけ・1回だけ。つかれが全回復
  async function lunch() {
    const pika = w.pika;
    if (!session) return;
    if (session.lunchUsed) {
      pika.confused();
      return w.ui.toast('おべんとうは もう たべちゃった');
    }
    if (phase !== 'wait') {
      pika.confused();
      return w.ui.toast('ポケモンを まっている あいだに たべよう');
    }
    session.lunchUsed = true;
    phase = 'lunch';
    const p = pika.pos;
    bento.position.set(p.x - dir.x * 0.5, 0.2, p.z - dir.z * 0.5);
    bento.visible = true;
    w.audio.sfx('get');
    for (let i = 0; i < 4; i++) {
      pika.jump(0.25);
      w.audio.pika(i % 2 ? 'happy' : 'normal');
      pika.emote(i === 3 ? '♥' : '♪', '#ff5aa5');
      await wait(700);
    }
    bento.visible = false;
    session.fatigue = 0;
    w.friendship(1);
    w.ui.toast('おべんとう おいしかった！ ピカチュウの つかれが とれた', 2400);
    if (session && phase === 'lunch') phase = 'wait';
  }

  async function endSession() {
    const s = session;
    phase = null;
    bobber.visible = line.visible = false;
    w.pika.activity = null;
    session = null;
    showStatus();
    if (!s) return;
    const list = s.catches.map((c) => `${ITEMS[c.id].name} ${c.size}cm`).join('、');
    w.audio.sfx(s.catches.length ? 'fanfare' : 'ng');
    await w.ui.say(
      s.catches.length
        ? [`つり おしまい！ ${s.round - 1}ラウンドで ${s.catches.length}ひき つれた！`, `つれた ポケモン: ${list}`]
        : [`つり おしまい……。${s.round - 1}ラウンドで 1ぴきも つれなかった。また ちょうせんしよう！`],
    );
    if (s.catches.length) w.friendship(Math.min(5, s.catches.length));
    s.done();
  }

  w.addInteractable({
    pos: new THREE.Vector3(px, 0, pz), name: 'さんばし', reach: 0.05,
    tasks: [
      {
        verbs: ['fish'],
        enabled: () => !session,
        run: (pika) =>
          new Promise((resolve) => {
            session = { round: 0, time: SESSION_TIME, fatigue: 0, lunchUsed: false, catches: [], done: resolve };
            pika.faceAt = new THREE.Vector3(px + dir.x * 5, 0, pz + dir.z * 5);
            pika.activity = {
              get title() {
                return phase === 'fight' ? 'つりの まっさいちゅう' : 'ポケモンを まっている';
              },
              get verbs() {
                if (phase === 'fight') return ['cheer', 'pull'];
                if (phase === 'wait' && !session?.lunchUsed) return ['lunch'];
                return [];
              },
              accepts: ['cheer', 'pull', 'lunch'],
              onCommand: (v) => (v === 'cheer' ? cheer() : v === 'pull' ? haul() : lunch()),
            };
            w.ui.say([
              'ピカチュウが さおを もった！',
              'ポケモンが かかったら「がんばれ」で ひきよせて、ちかくに きたら「ひっぱれ」！',
              'こえを かけるたびに ピカチュウは つかれるよ。まっている あいだに「おべんとう」で ひとやすみ（1かいだけ）。',
            ]).then(() => session && nextRound());
          }),
      },
    ],
  });

  return {
    update(dt) {
      if (!session) return;
      session.time -= dt;
      if (phase === 'wait') {
        bobber.position.y = Math.sin(w.t * 3) * 0.04;
        waitT -= dt;
        if (waitT <= 0) hook();
      } else if (phase === 'fight' && fish) {
        // ポケモンは にげようと 少しずつ はなれていく（大きいほど 力が強い）
        fish.d += (0.08 + 0.1 * fish.power) * dt * (0.6 + Math.random() * 0.8);
        const s = spotAt(fish.d);
        fish.model.position.x += (s.x - fish.model.position.x) * Math.min(1, dt * 4);
        fish.model.position.z += (s.z - fish.model.position.z) * Math.min(1, dt * 4);
        // ときどき 水面から はねる（大きいほど 高く）
        const leap = Math.max(0, Math.sin(w.t * 2.2)) ** 3;
        fish.model.position.y = 0.1 + Math.abs(Math.sin(w.t * 6)) * 0.12 + leap * (0.4 + fish.power * 0.25);
        fish.model.rotation.z = Math.sin(w.t * 9) * 0.4;
        if (Math.random() < dt * 1.5) w.fx('💦', fish.model.position.x, 0.4, fish.model.position.z, '#3d9be0');
        if (fish.d < CATCH_D && !fish.near) {
          fish.near = true;
          w.ui.toast('ちかくに きた！ いまだ「ひっぱれ」！', 1800);
        }
        if (fish.d >= CATCH_D) fish.near = false;
        if (fish.d > MAX_D) {
          phase = 'result';
          w.audio.sfx('ng');
          w.ui.toast('いとが のびきって にげられた……', 2200);
          finishRound(false);
        }
      }
      // さおの いと
      const end = phase === 'fight' && fish ? fish.model.position : bobber.position;
      line.visible = !!session && (phase === 'fight' || bobber.visible);
      if (line.visible) line.geometry.setFromPoints([rodTip(), end]);
      showStatus();
    },
    dispose() {
      if (fish?.model) w.root.remove(fish.model);
      fish = null;
      const s = session;
      session = null;
      phase = null;
      w.pika.activity = null;
      w.ui.setTimer(null);
      s?.done();
    },
    // テスト・デバッグ用
    get state() {
      return { phase, round: session?.round, time: session?.time, fatigue: session?.fatigue, d: fish?.d, size: fish?.size, scale: fish?.model.scale.x, lunchUsed: session?.lunchUsed, catches: session?.catches.length };
    },
  };
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
