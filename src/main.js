import * as THREE from 'three';
import './style.css';
import { Save } from './core/save.js';
import { Audio } from './core/audio.js';
import { VoiceListener } from './core/voice.js';
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

// 声: 常時聞き取り。ボタンはマイクのオン/オフ切り替え（非対応端末ではセリフ選択に切り替わる）
const PHRASES = ['ピカチュウ！', 'いいこだね', 'こっちおいで', 'おやすみ', '10まんボルト！'];
let voiceState = 'paused';
const voice = new VoiceListener({
  onPhrase: (text) => {
    ui.toast(`「${text}」`);
    world.pika.hear(text);
  },
  onState: (st) => {
    voiceState = st;
    ui.setVoiceState(st);
    if (st === 'denied') ui.toast('マイクが つかえません（せっていで きょかしてね）', 3500);
  },
});
ui.setVoiceState(voice.supported ? 'paused' : 'unsupported');
ui.el.voice.addEventListener('click', async () => {
  if (voiceState === 'listening' || voiceState === 'paused') return voice.toggle();
  if (ui.blocking) return;
  const v = await ui.choose('ピカチュウに はなしかける', PHRASES.map((p) => ({ label: p, value: p })));
  if (v) world.pika.hear(v);
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
  voice.start();
  await world.gimmick?.enter?.();
});
document.addEventListener('pointerdown', () => audio.unlock(), { once: true });

// デバッグ・自動テスト用
window.__game = { world, save, ui };
