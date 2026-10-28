import * as THREE from 'three';
import { part } from '../entities/models.js';

// スオウかいがん: スイカわり。目かくし中はピカチュウの声（とヒント文字）が頼り。
// 成功すると「スオウじま」へのふねが解放される。
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

  let playing = false;
  let swings = 0;
  let hintT = 0;
  const stick = part(new THREE.CylinderGeometry(0.05, 0.05, 1.4, 6), '#a87a45', 0.45, 1.3, 0.2);
  stick.visible = false;
  w.player.userData.rig.add(stick);

  function hint() {
    const p = w.player.position;
    const dx = sx - p.x;
    const dz = sz - p.z;
    const d = Math.hypot(dx, dz);
    // 一人称なので、いま向いている方向から見た前後左右で教える
    const f = w.forward;
    const r = w.right;
    const ahead = dx * f.x + dz * f.z;
    const side = dx * r.x + dz * r.z;
    const dir = Math.abs(side) > Math.abs(ahead) ? (side > 0 ? 'みぎ →' : '← ひだり') : ahead > 0 ? '↑ まえ' : '↓ うしろ';
    const heat = d < 1.2 ? 'ピカピカ！！ ここ！' : d < 3 ? 'ピカッ！ ちかい！' : d < 6 ? 'ピカ… ' : 'ピ……　とおい';
    w.ui.setBlind(true, `${heat}　${d < 1.2 ? '' : dir}`);
    for (let i = 0; i < (d < 1.2 ? 3 : d < 3 ? 2 : 1); i++) setTimeout(() => w.audio.pika('hint'), i * 120);
  }

  async function swing() {
    if (!playing) return;
    swings++;
    stick.rotation.x = -1.2;
    setTimeout(() => (stick.rotation.x = 0), 200);
    const d = w.distTo(sx, sz);
    if (d < 1.3) {
      w.audio.sfx('smash');
      end();
      whole.visible = false;
      halves.visible = true;
      w.audio.sfx('fanfare');
      w.pika.jump();
      await w.ui.say(['パカーン！ スイカが みごとに われた！', 'ピカチュウと いっしょに スイカを たべた。あまくて おいしい！']);
      await w.getItem('suikaPiece', 'スイカのかけら');
      w.friendship(3);
      if (!w.save.flag('watermelonCleared')) {
        w.save.setFlag('watermelonCleared');
        await w.ui.say('ふなのりさん「いい うでだね！ スオウじまへの ふねに のせてあげよう」');
      }
      return;
    }
    w.audio.sfx('dig');
    if (swings >= 3) {
      end();
      w.audio.sfx('ng');
      return w.ui.say('すなを たたいてしまった……。また ちょうせんしよう！');
    }
    w.ui.toast(`はずれ！ あと ${3 - swings}かい`);
  }

  function end() {
    playing = false;
    stick.visible = false;
    w.ui.setBlind(false);
    w.actionOverride = null;
  }

  w.addInteractable({
    obj: suika, radius: 2.2, label: 'スイカわりを する',
    enabled: () => !playing,
    onInteract: async () => {
      if (halves.visible) return w.ui.say('スイカは もう われている。（また こんど ちょうせんしよう）');
      const ok = await w.ui.choose('スイカわりに ちょうせんする？（3かいまで ふれるよ）', [{ label: 'やる！', value: true }]);
      if (!ok) return;
      await w.ui.say(['めかくしを して、くるくる まわって……', 'ピカチュウの こえを たよりに スイカを さがそう！']);
      w.player.position.set(P.start[0] + (Math.random() - 0.5) * 6, 0, P.start[1]);
      playing = true;
      swings = 0;
      hintT = 0;
      stick.visible = true;
      w.actionOverride = { label: 'わる！', fn: swing };
    },
  });

  return {
    update(dt) {
      if (!playing) return;
      hintT -= dt;
      if (hintT <= 0) {
        hintT = 1.2;
        hint();
      }
      // ピカチュウはスイカの横で応援する
      if (!w.pika.order && w.pika.pos.distanceTo(new THREE.Vector3(sx + 1.5, 0, sz)) > 0.5) w.pika.goTo(sx + 1.5, sz);
    },
    dispose() {
      end();
      w.player.userData.rig.remove(stick);
    },
  };
}
