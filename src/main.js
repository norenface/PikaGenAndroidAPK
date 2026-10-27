import * as THREE from 'three';
import './style.css';
import { Save } from './core/save.js';
import { Audio, createVoiceRecognizer } from './core/audio.js';
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
  world.camera.fov = w < h ? 70 : 50; // 縦持ちでも見やすく
  world.camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// ───────── ボタン ─────────
ui.el.action.addEventListener('click', () => world.doAction());

const PHRASES = ['ピカチュウ！', 'いいこだね', 'こっちおいで', 'おやすみ', '10まんボルト！'];
const recognizer = createVoiceRecognizer((text) => {
  ui.toast(`「${text}」`);
  world.pika.hear(text);
});
ui.el.voice.addEventListener('click', async () => {
  if (ui.blocking) return;
  const opts = PHRASES.map((p) => ({ label: p, value: p }));
  if (recognizer) opts.unshift({ label: '🎤 マイクで はなす', value: '__mic' });
  const v = await ui.choose('ピカチュウに はなしかける', opts);
  if (v === '__mic') recognizer.start();
  else if (v) world.pika.hear(v);
});

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

world.load('room');
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  world.update(dt);
  renderer.render(world.scene, world.camera);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

title.querySelector('.start').addEventListener('click', async () => {
  audio.unlock();
  audio.pika('call');
  title.remove();
  await world.gimmick?.enter?.();
});
document.addEventListener('pointerdown', () => audio.unlock(), { once: true });

// デバッグ・自動テスト用
window.__game = { world, save, ui };
