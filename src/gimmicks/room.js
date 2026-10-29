import { makeItemMesh, makeMon, part, mat } from '../entities/models.js';
import * as THREE from 'three';
import { ITEMS, itemName } from '../maps/items.js';

// じぶんのへや: 博士からの通信 / コレクション棚 / とけい（うらのあきち解放の裏技）
const HINTS = [
  ['caterpieDone', 'トキワのもりで バタフリーが こまっているそうじゃ。キャタピーたちの こもりを たのめるかの？'],
  ['cookingDone', 'アカネのもりの コイルが りょうりの ざいりょうを さがしておるぞ。'],
  ['nyoromoDone', 'アサギのみずうみで まいごの ニョロモが いるらしい。おやの ところへ つれていってあげなさい。'],
  ['nazoDone', 'モエギそうげんの くさむらには ナゾノクサが かくれておるぞ。'],
  ['watermelonCleared', 'スオウかいがんで スイカわりは どうじゃ？ ピカチュウの こえが ヒントに なるぞ。'],
  ['treasureFound', 'スオウじまには かいぞくの たからが ねむっているという うわさじゃ……。'],
  ['fished', 'チャレンジ！コースの つりばで つりを してみなさい。'],
  ['campDone', 'キャンプじょうへ いってみなさい。いちどきりの たのしい よるが まっておるぞ。'],
];

export default function room(w, map) {
  const P = map.points;
  // 家具
  w.placeDecor('box', P.bed[0], P.bed[1], { size: [2, 0.6, 3], color: '#6fa8dc' });
  w.add(part(new THREE.BoxGeometry(1.8, 0.2, 0.8), '#ffffff', 0, 0.7, -0.9), P.bed[0], P.bed[1] - 0.9);
  w.placeDecor('box', P.pc[0], P.pc[1], { size: [2, 0.9, 1], color: '#a0522d' });
  const pc = w.add(new THREE.Group(), P.pc[0], P.pc[1]);
  pc.add(part(new THREE.BoxGeometry(0.9, 0.7, 0.6), '#dddddd', 0, 1.25, 0));
  const screen = part(new THREE.BoxGeometry(0.75, 0.5, 0.02), '#2a4d7a', 0, 1.27, 0.31);
  pc.add(screen);
  w.placeDecor('box', P.tv[0], P.tv[1], { size: [1, 1, 1.4], color: '#555555' });

  // コレクション棚: 持ち帰ったアイテムを棚に並べる
  const shelf = w.add(new THREE.Group(), P.shelf[0], P.shelf[1]);
  shelf.add(part(new THREE.BoxGeometry(3, 2.4, 0.6), '#8a5a2b', 0, 1.2, -0.1));
  for (let r = 0; r < 3; r++) shelf.add(part(new THREE.BoxGeometry(2.8, 0.06, 0.6), '#c08a55', 0, 0.3 + r * 0.75, 0.1));
  w.addCollider(P.shelf[0], P.shelf[1], 1.2);
  const owned = Object.keys(ITEMS).filter((id) => w.save.data.items[id]);
  owned.slice(0, 18).forEach((id, i) => {
    const m = makeItemMesh(ITEMS[id].color);
    m.position.set(-1.15 + (i % 6) * 0.46, 0.33 + Math.floor(i / 6) * 0.75, 0.15);
    m.scale.setScalar(0.9);
    shelf.add(m);
  });

  // とけい
  const clock = w.add(new THREE.Group(), P.clock[0], P.clock[1]);
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.45, 20), mat('#ffffff'));
  face.position.set(0, 2.3, 0.05);
  clock.add(part(new THREE.CylinderGeometry(0.5, 0.5, 0.08, 20), '#c0392b', 0, 2.3, 0).rotateX(Math.PI / 2), face);
  const hand = part(new THREE.BoxGeometry(0.04, 0.35, 0.02), '#222', 0, 2.42, 0.08);
  clock.add(hand);

  let clockCount = 0;
  w.addInteractable({
    obj: pc, radius: 2.4, label: 'はかせと つうしん',
    onInteract: async () => {
      screen.material = mat('#bfe8ff');
      w.audio.sfx('sparkle');
      const next = HINTS.find(([f]) => !w.save.flag(f));
      const f = w.save.friendship;
      const mood = f >= 80 ? 'ピカチュウは きみが だいすきな ようじゃ！' : f >= 40 ? 'ピカチュウとは なかよく なってきたようじゃな。' : 'ピカチュウは まだ すこし ひとみしり しておるのう。';
      await w.ui.say(['おお、げんきに しておるか？', mood, next ? next[1] : 'ぜんぶの ばしょを まわったようじゃな！ すばらしい！'], 'オーキドはかせ');
      screen.material = mat('#2a4d7a');
    },
  });
  w.addInteractable({
    obj: shelf, radius: 2.4, label: 'コレクションを みる',
    onInteract: async () => {
      const items = Object.entries(w.save.data.items);
      if (!items.length) return w.ui.say('たなは まだ からっぽだ。おでかけして なにか もちかえろう！');
      await w.ui.choose(
        `コレクション（${items.length}しゅるい）`,
        items.map(([id, n]) => ({ label: `${itemName(id)} ×${n}`, value: id })),
        { cancel: 'とじる' },
      );
    },
  });
  w.addInteractable({
    obj: clock, radius: 2.4, label: 'とけいを しらべる',
    onInteract: async () => {
      clockCount++;
      w.audio.sfx('select');
      if (w.save.flag('akichiUnlocked')) return w.ui.say('チクタク……。うらのあきちへは ガラスどから いけるよ。');
      if (clockCount < 3) return w.ui.say('チクタク チクタク……。');
      w.save.setFlag('akichiUnlocked');
      w.audio.sfx('fanfare');
      w.pika.jump();
      await w.ui.say(['とけいの うらに ちいさな ちずが はさまっていた！', '「うらのあきち」へ いけるように なった！（みてみて！ピカチュウコース）']);
    },
  });
  w.addInteractable({
    pos: new THREE.Vector3(P.bed[0], 0, P.bed[1]), radius: 2.4, label: 'ベッドで やすむ',
    onInteract: async () => {
      w.pika.sleeping = true;
      await w.ui.say(['ふかふかの ベッドで ひとやすみ……', 'ピカチュウも となりで すやすや ねている。']);
      w.pika.sleeping = false;
      w.friendship(1);
    },
  });

  // 博士（テレビ）通信: はじめて来たとき
  const prof = makeMon('professor');
  prof.visible = false;
  w.add(prof, P.tv[0], P.tv[1]);

  return {
    update() {
      hand.rotation.z = -w.t;
      hand.position.set(Math.sin(w.t) * 0.12, 2.3 + Math.cos(w.t) * 0.12, 0.08);
    },
    async enter() {
      if (!w.save.flag('intro')) {
        w.save.setFlag('intro');
        await w.ui.say([
          'やあ！ わしは オーキドはかせ。',
          'きょうから きみは ピカチュウと いっしょに くらすことに なった。',
          'ピカチュウを タッチすると なでてあげられるぞ。',
          'おでかけさきでは、ほったり、つったり、ひろったり……しごとは ぜんぶ ピカチュウに こえで たのむんじゃ。',
          'たのみたい ものの ほうを むくと ▼の しるしが でる。そこで「ほって」「つって」などと はなしかけるんじゃよ。',
          'なかよしに なるほど、ピカチュウは いうことを きいてくれるぞ。',
          'ガラスどから にわへ でて、もんから いろいろな ばしょへ おでかけしてみなさい！',
        ], 'オーキドはかせ');
      }
    },
  };
}
