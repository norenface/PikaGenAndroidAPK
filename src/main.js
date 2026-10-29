import * as THREE from 'three';
import './style.css';
import { Save } from './core/save.js';
import { Audio } from './core/audio.js';
import { VoiceListener } from './core/voice.js';
import { understands } from './core/commands.js';
import { UI } from './core/ui.js';
import { Input } from './core/input.js';
import { World } from './core/world.js';
import { MAPS } from './maps/data.js';

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));

const save = new Save();
const audio = new Audio(save);
const ui = new UI(document.getElementById('ui'), audio);
const input = new Input(canvas, ui.el.joy);
const world = new World({ renderer, ui, audio, save, input });

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  world.camera.aspect = w / h;
  world.camera.fov = w < h ? 80 : 65; // 一人称の視野（縦持ちは広め）
  world.camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// ───────── ボタン ─────────
ui.el.action.addEventListener('click', () => world.doAction());

// 声: 常時聞き取り（ボタン操作なし）。
// 聞き取れたらピカチュウが考える → 反応する。その間は聞き取りを止め、センサーが灰色になる。
const voice = new VoiceListener({
  onPhrase: (text) => talk(text),
  onSensor: (s) => ui.setSensor(s),
  onInfo: ({ message, detail }) => {
    if (message === 'engine') ui.toast(detail === 'device' ? 'こえエンジン：たんまつ（こうせいど）' : 'こえエンジン：Vosk', 3000);
    if (message === 'downloading') ui.toast('たんまつの にほんご おんせいデータを ダウンロードちゅう。つぎから こうせいどに なるよ', 4500);
  },
  onError: (kind) =>
    ui.toast(kind === 'denied' ? 'マイクが つかえません（アプリの せっていで マイクを きょかしてね）' : 'こえを きく じゅんびに しっぱいしました', 4000),
});
ui.setSensor(voice.supported ? 'busy' : 'off');

// ピカチュウへのことば（声・ヒントのタップ共通）。ピカチュウが考えて反応するまで聞き取りを止める
let talking = false;
async function talk(text) {
  if (talking || !understands(text)) return;
  talking = true;
  voice.hold();
  ui.toast(`「${text}」`);
  try {
    await world.command(text);
  } finally {
    talking = false;
    voice.release();
  }
}
world.onSay = talk;

ui.el.menu.addEventListener('click', async () => {
  if (ui.blocking) return;
  const v = await ui.choose('メニュー', [
    { label: 'おうちに かえる', value: 'home' },
    { label: 'ワープ（テスト用：ぜんマップ）', value: 'warp' },
    { label: 'データを けす', value: 'reset' },
  ]);
  if (v === 'home') world.goto('room');
  if (v === 'warp') {
    const id = await ui.choose('どこへ ワープする？', Object.entries(MAPS).map(([id, m]) => ({ label: m.name, value: id })));
    if (id) world.goto(id);
  }
  if (v === 'reset') {
    const ok = await ui.choose('ほんとうに けす？', [{ label: 'けす', value: true }]);
    if (ok) {
      save.reset();
      location.reload();
    }
  }
});

// ───────── タイトル ─────────
const title = document.createElement('div');
title.className = 'title-screen';
title.innerHTML = `
  <div class="logo">ピカげんき</div>
  <div class="sub">〜 ピカチュウと いっしょに おでかけ 〜</div>
  <button class="start">タッチして はじめる</button>
  <div class="note">ファンメイド作品です</div>`;
document.body.appendChild(title);

let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  world.update(dt);
  renderer.render(world.scene, world.camera);
  requestAnimationFrame(loop);
}
world.load('room').then(() => requestAnimationFrame(loop));

title.querySelector('.start').addEventListener('click', async () => {
  audio.unlock();
  audio.pika('call');
  title.remove();
  voice.start();
  await world.gimmick?.enter?.();
});
document.addEventListener('pointerdown', () => audio.unlock(), { once: true });

// デバッグ・自動テスト用
window.__game = { world, save, ui };
