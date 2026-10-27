// マップ・コース定義（純粋なデータ。three.js に依存しないので Node の検証スクリプトからも読める）
//
// 座標系: x = 右, z = 手前（画面下）。北（画面奥）は -z。
// size: [半幅x, 半奥行z]  /  at: [x, z]
// exits: 出口。to = 移動先マップ, course = コース選択メニュー, requires = 必要フラグ
// points: ギミックが使う名前付き座標（周囲は木などが自動で避ける）

const HOME = { label: 'おうちにかえる', to: 'garden', spawn: 'fromGate' };

export const COURSES = {
  asobou: {
    name: 'あそぼう！コース',
    maps: ['tokiwa', 'akaneForest', 'asagiLake', 'moegi', 'suoBeach', 'camp'],
  },
  challenge: {
    name: 'チャレンジ！コース',
    maps: ['akaneTsuriba', 'asagiTsuriba', 'suoTsuriba', 'suoIsland'],
  },
  mitemite: {
    name: 'みてみて！ピカチュウコース',
    maps: ['garden', 'akichi'],
  },
};

// マップに入るための条件（コースメニュー・出口の両方で使う）
export const MAP_LOCKS = {
  suoIsland: { requires: 'watermelonCleared', msg: 'スオウかいがんで スイカわりを せいこうさせると ふねが でるよ。' },
  akichi:    { requires: 'akichiUnlocked',    msg: 'まだ ばしょが わからない……。へやの なにかを なんども しらべてみよう。' },
  camp:      { forbids: 'campDone',           msg: 'キャンプは もう おわっちゃった。たのしかったね！' },
};

export const MAPS = {
  // ───────────── ① ホームベース ─────────────
  room: {
    name: 'じぶんのへや', area: 'home', indoor: true,
    size: [6, 5], ground: '#d9b382', sky: '#f3e3c3', bgm: 'home',
    spawns: { default: [0, 1.5] },
    exits: [
      { at: [0, -4.6], label: 'ガラスど（みてみて！ピカチュウコース）', course: 'mitemite', marker: 'door' },
    ],
    points: { pc: [-4.2, -3.8], shelf: [3.6, -4.2], clock: [-1.8, -4.8], bed: [4.2, 2.6], tv: [-4.6, 1.5] },
    gimmick: 'room',
  },
  garden: {
    name: 'うちのにわ', area: 'home',
    size: [14, 12], ground: '#7ccf5b', outer: '#5aa845', sky: '#9fd8ff', bgm: 'home',
    spawns: { default: [0, -8], fromGate: [0, 8.5], fromSide: [-10.5, 0] },
    exits: [
      { at: [0, -11.5], label: 'へやにもどる', to: 'room', marker: 'door' },
      { at: [0, 11.5], label: 'しょうめんもん（あそぼう！コース）', course: 'asobou', marker: 'gate' },
      { at: [-13.5, 0], label: 'ひだりもん（チャレンジ！コース）', course: 'challenge', marker: 'gate' },
    ],
    water: [{ at: [8, 5], r: 3 }],
    points: { field: [-6, -4], flowers: [6, -6], pond: [4.6, 5], house: [0, -14] },
    decor: [
      { type: 'house', at: [0, -15.5] },
      { type: 'fenceRing' },
      { type: 'tree', at: [11, -9], s: 1.2 }, { type: 'tree', at: [-11, 9], s: 1.1 },
      { type: 'tree', at: [11, 9], s: 1 }, { type: 'bush', at: [-11, -9] },
    ],
    gimmick: 'garden',
  },

  // ───────────── ② お出かけ先 ─────────────
  tokiwa: {
    name: 'トキワのもり', area: 'field',
    size: [18, 18], ground: '#5fae4a', outer: '#2f6d2c', sky: '#a5e0b0', fog: '#a5e0b0', bgm: 'forest',
    spawns: { default: [0, 15] },
    exits: [
      { at: [0, 17.3], ...HOME },
      { at: [0, -17.3], label: 'アカネのもりへ', to: 'akaneForest' },
    ],
    points: { nest: [0, -3] },
    scatter: [{ type: 'tree', n: 55, seed: 11 }, { type: 'bush', n: 20, seed: 12 }, { type: 'flower', n: 25, seed: 13 }],
    gimmick: 'caterpie',
  },
  akaneForest: {
    name: 'アカネのもり', area: 'field',
    size: [18, 18], ground: '#86b04a', outer: '#4f6d2c', sky: '#ffd6a5', fog: '#ffd6a5', bgm: 'forest',
    spawns: { default: [0, 15] },
    exits: [
      { at: [0, 17.3], ...HOME },
      { at: [17.3, 0], label: 'アカネのつりばへ', to: 'akaneTsuriba' },
      { at: [0, -17.3], label: 'トキワのもりへ', to: 'tokiwa' },
    ],
    points: {
      coil: [-2, -2],
      i0: [-12, -10], i1: [10, -12], i2: [12, 8], i3: [-10, 9], i4: [4, -6], i5: [-6, 3], i6: [7, 3],
    },
    scatter: [{ type: 'tree', n: 45, seed: 21 }, { type: 'stump', n: 8, seed: 22 }, { type: 'bush', n: 15, seed: 23 }],
    gimmick: 'cooking',
  },
  akaneTsuriba: {
    name: 'アカネのつりば', area: 'field',
    size: [14, 14], ground: '#86b04a', outer: '#4f6d2c', sky: '#ffd6a5', bgm: 'fishing',
    spawns: { default: [0, 10] },
    exits: [
      { at: [0, 13.3], ...HOME },
      { at: [-13.3, 6], label: 'アカネのもりへ', to: 'akaneForest' },
    ],
    water: [{ at: [0, -5], r: 7.5 }],
    points: { pier: [0, 3.2], bobber: [0, -2.5] },
    fishTable: [['koiking', 50], ['tosakinto', 25], ['hasubrero', 20], ['nuoh', 5]],
    scatter: [{ type: 'tree', n: 25, seed: 31 }, { type: 'rock', n: 8, seed: 32 }],
    gimmick: 'fishing',
  },
  asagiLake: {
    name: 'アサギのみずうみ', area: 'field',
    size: [18, 18], ground: '#70c070', outer: '#3e8a4f', sky: '#bfe8ff', fog: '#bfe8ff', bgm: 'lake',
    spawns: { default: [0, 15] },
    exits: [
      { at: [0, 17.3], ...HOME },
      { at: [-17.3, 0], label: 'アサギのつりばへ', to: 'asagiTsuriba' },
      { at: [17.3, 0], label: 'モエギそうげんへ', to: 'moegi' },
    ],
    water: [{ at: [0, -4], r: 6.5 }],
    points: { home: [0, -13], n0: [-11, 8], n1: [10, 10], n2: [12, -6] },
    scatter: [{ type: 'tree', n: 30, seed: 41 }, { type: 'rock', n: 10, seed: 42 }, { type: 'flower', n: 20, seed: 43 }],
    gimmick: 'nyoromo',
  },
  asagiTsuriba: {
    name: 'アサギのつりば', area: 'field',
    size: [14, 14], ground: '#70c070', outer: '#3e8a4f', sky: '#bfe8ff', bgm: 'fishing',
    spawns: { default: [0, 10] },
    exits: [
      { at: [0, 13.3], ...HOME },
      { at: [13.3, 6], label: 'アサギのみずうみへ', to: 'asagiLake' },
    ],
    water: [{ at: [0, -5], r: 8 }],
    points: { pier: [0, 3.7], bobber: [0, -2.5] },
    fishTable: [['koiking', 40], ['nyoromoFish', 30], ['nuoh', 20], ['tosakinto', 10]],
    scatter: [{ type: 'tree', n: 25, seed: 51 }, { type: 'rock', n: 8, seed: 52 }],
    gimmick: 'fishing',
  },
  moegi: {
    name: 'モエギそうげん', area: 'field',
    size: [20, 20], ground: '#a6d86a', outer: '#7aa84a', sky: '#d4f5ff', bgm: 'meadow',
    spawns: { default: [0, 17] },
    exits: [
      { at: [0, 19.3], ...HOME },
      { at: [-19.3, 0], label: 'アサギのみずうみへ', to: 'asagiLake' },
      { at: [19.3, 0], label: 'スオウかいがんへ', to: 'suoBeach' },
    ],
    points: {},
    scatter: [{ type: 'flower', n: 50, seed: 61 }, { type: 'tree', n: 12, seed: 62 }],
    gimmick: 'nazonokusa',
  },
  suoBeach: {
    name: 'スオウかいがん', area: 'field',
    size: [18, 12], ground: '#f2dc9b', outer: '#f2dc9b', sea: 'north', sky: '#8fd3ff', bgm: 'beach',
    spawns: { default: [0, 9] },
    exits: [
      { at: [0, 11.3], ...HOME },
      { at: [-17.3, 4], label: 'モエギそうげんへ', to: 'moegi' },
      { at: [17.3, 4], label: 'スオウのつりばへ', to: 'suoTsuriba' },
      { at: [10, -11.3], label: 'ふねでスオウじまへ', to: 'suoIsland', marker: 'boat' },
    ],
    points: { suika: [-3, -4], start: [-3, 6], parasol: [6, 2] },
    scatter: [{ type: 'palm', n: 10, seed: 71 }, { type: 'rock', n: 6, seed: 72 }],
    gimmick: 'watermelon',
  },
  suoIsland: {
    name: 'スオウじま', area: 'field',
    size: [12, 12], ground: '#f2dc9b', outer: '#2f8fd8', sea: 'all', sky: '#8fd3ff', bgm: 'island',
    spawns: { default: [0, 8.5] },
    exits: [
      { at: [0, 11.3], label: 'ふねでスオウかいがんへ', to: 'suoBeach', marker: 'boat' },
      { at: [-11.3, 8], ...HOME },
    ],
    points: { d0: [-6, -6], d1: [5, -7], d2: [7, 1], d3: [-7, 2], d4: [0, -2], d5: [-2, 5], d6: [4, 6] },
    scatter: [{ type: 'palm', n: 9, seed: 81 }, { type: 'rock', n: 6, seed: 82 }],
    gimmick: 'treasure',
  },
  suoTsuriba: {
    name: 'スオウのつりば', area: 'field',
    size: [14, 10], ground: '#f2dc9b', outer: '#f2dc9b', sea: 'north', sky: '#8fd3ff', bgm: 'fishing',
    spawns: { default: [0, 7] },
    exits: [
      { at: [0, 9.3], ...HOME },
      { at: [-13.3, 4], label: 'スオウかいがんへ', to: 'suoBeach' },
    ],
    points: { pier: [0, -9], bobber: [0, -14] },
    fishTable: [['menokurage', 35], ['harysen', 30], ['sunnygo', 25], ['koiking', 10]],
    scatter: [{ type: 'palm', n: 6, seed: 91 }, { type: 'rock', n: 8, seed: 92 }],
    gimmick: 'fishing',
  },
  camp: {
    name: 'キャンプじょう', area: 'field', night: true,
    size: [14, 14], ground: '#4f7d3a', outer: '#1f3d22', sky: '#141a3a', fog: '#141a3a', bgm: 'camp',
    spawns: { default: [0, 10] },
    exits: [{ at: [0, 13.3], ...HOME }],
    points: { fire: [0, -1], tent: [-4, -5] },
    scatter: [{ type: 'pine', n: 40, seed: 101 }],
    gimmick: 'camp',
  },
  akichi: {
    name: 'うらのあきち', area: 'secret',
    size: [7, 7], ground: '#b7a27a', outer: '#7a6a4a', sky: '#ffcfe0', bgm: 'secret',
    spawns: { default: [0, 5] },
    exits: [{ at: [0, 6.6], label: 'にわにもどる', to: 'garden', spawn: 'fromSide' }],
    points: { box: [0, -3], stage: [3, 0] },
    decor: [{ type: 'fenceRing' }, { type: 'stump', at: [-4, -4] }, { type: 'bush', at: [5, -5] }],
    gimmick: 'akichi',
  },
};
