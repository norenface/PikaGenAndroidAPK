// Web Audio によるシンセ音源（音声ファイル不要）
// - ピカチュウの鳴き声（フォルマント風の合成）
// - 効果音
// - マップごとの簡易BGMシーケンサ
// - マイク音声認識（対応ブラウザのみ。WebView では UI の「こえ」ボタンで代替）

const THEMES = {
  home:    { bpm: 96,  root: 60, scale: [0, 2, 4, 7, 9],     wave: 'triangle', pattern: [0, 2, 4, 2, 3, 4, 2, 1] },
  forest:  { bpm: 88,  root: 57, scale: [0, 2, 3, 5, 7, 10], wave: 'triangle', pattern: [0, 3, 4, 3, 5, 4, 2, 3] },
  lake:    { bpm: 76,  root: 62, scale: [0, 2, 4, 7, 9],     wave: 'sine',     pattern: [0, 4, 3, 4, 2, 4, 1, 2] },
  meadow:  { bpm: 112, root: 64, scale: [0, 2, 4, 5, 7, 9],  wave: 'square',   pattern: [0, 2, 4, 5, 4, 2, 3, 1] },
  beach:   { bpm: 120, root: 65, scale: [0, 2, 4, 7, 9],     wave: 'square',   pattern: [0, 4, 2, 4, 3, 4, 1, 4] },
  island:  { bpm: 100, root: 55, scale: [0, 3, 5, 7, 10],    wave: 'triangle', pattern: [0, 2, 1, 3, 2, 4, 3, 1] },
  fishing: { bpm: 70,  root: 60, scale: [0, 2, 4, 7, 9],     wave: 'sine',     pattern: [0, -1, 2, -1, 4, -1, 2, -1] },
  camp:    { bpm: 64,  root: 52, scale: [0, 3, 5, 7, 10],    wave: 'sine',     pattern: [0, -1, 3, -1, 2, -1, 4, 3] },
  secret:  { bpm: 132, root: 67, scale: [0, 2, 4, 6, 8, 10], wave: 'square',   pattern: [0, 1, 2, 3, 4, 5, 4, 2] },
};

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

export class Audio {
  constructor(save) {
    this.save = save;
    this.ctx = null;
    this.bgmTimer = null;
    this.theme = null;
  }
  get muted() {
    return this.save.data.muted;
  }
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.6;
      this.master.connect(this.ctx.destination);
      this.bgmBus = this.ctx.createGain();
      this.bgmBus.gain.value = 0.18;
      this.bgmBus.connect(this.master);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    if (this.theme && !this.bgmTimer) this.playBgm(this.theme);
  }
  toggleMute() {
    this.save.data.muted = !this.save.data.muted;
    this.save.write();
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.6;
    return this.muted;
  }

  tone(freq, dur, { type = 'square', vol = 0.2, slide = 0, at = 0, dest } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + at;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest ?? this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  noise(dur, { vol = 0.2, at = 0, freq = 1200 } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + at;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
  }

  // 「ピ・カ」「チュ〜」をフォルマント2本で近似した鳴き声
  pika(mood = 'normal') {
    if (!this.ctx) return;
    const V = { i: [320, 2600], a: [850, 1300], u: [350, 900] };
    const sets = {
      normal: [['i', 620, 0.09], ['a', 560, 0.16]],
      happy: [['i', 720, 0.08], ['a', 760, 0.1], ['i', 700, 0.08], ['a', 820, 0.18]],
      call: [['i', 640, 0.09], ['a', 600, 0.12], ['u', 680, 0.12], ['u', 900, 0.35]],
      sad: [['i', 480, 0.12], ['a', 380, 0.3]],
      hint: [['i', 900, 0.06]],
      sleepy: [['a', 300, 0.5]],
    };
    let at = 0;
    for (const [v, f0, dur] of sets[mood] ?? sets.normal) {
      const t = this.ctx.currentTime + at;
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(f0 * 0.92, t);
      o.frequency.linearRampToValueAtTime(f0 * 1.08, t + dur * 0.4);
      o.frequency.linearRampToValueAtTime(f0 * 0.95, t + dur);
      const env = this.ctx.createGain();
      env.gain.setValueAtTime(0.0001, t);
      env.gain.exponentialRampToValueAtTime(0.5, t + 0.015);
      env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      for (const ff of V[v]) {
        const bp = this.ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = ff;
        bp.Q.value = 6;
        o.connect(bp).connect(env);
      }
      env.connect(this.master);
      o.start(t);
      o.stop(t + dur + 0.02);
      at += dur * 0.9;
    }
  }

  sfx(name) {
    switch (name) {
      case 'select': return this.tone(880, 0.06, { vol: 0.1 });
      case 'ok': this.tone(660, 0.08, { vol: 0.12 }); return this.tone(990, 0.1, { vol: 0.12, at: 0.08 });
      case 'ng': return this.tone(200, 0.2, { vol: 0.15, type: 'sawtooth' });
      case 'door': return this.tone(330, 0.25, { vol: 0.12, type: 'triangle', slide: 200 });
      case 'splash': return this.noise(0.4, { vol: 0.4, freq: 900 });
      case 'bite': this.tone(1200, 0.05, { vol: 0.2 }); return this.tone(1200, 0.05, { vol: 0.2, at: 0.1 });
      case 'dig': return this.noise(0.18, { vol: 0.35, freq: 400 });
      case 'smash': this.noise(0.3, { vol: 0.6, freq: 300 }); return this.tone(120, 0.3, { vol: 0.3, type: 'triangle', slide: -60 });
      case 'sparkle': [0, 0.07, 0.14].forEach((a, i) => this.tone(1320 + i * 220, 0.12, { vol: 0.08, type: 'sine', at: a })); return;
      case 'get': [0, 4, 7, 12].forEach((n, i) => this.tone(mtof(72 + n), 0.12, { vol: 0.12, type: 'square', at: i * 0.08 })); return;
      case 'fanfare': [0, 4, 7, 12, 7, 12].forEach((n, i) => this.tone(mtof(67 + n), i === 5 ? 0.5 : 0.14, { vol: 0.13, at: i * 0.13 })); return;
      case 'boom': this.noise(0.8, { vol: 0.5, freq: 200 }); return this.tone(80, 0.6, { vol: 0.3, type: 'sine', slide: -40 });
      case 'step': return this.noise(0.04, { vol: 0.05, freq: 2000 });
    }
  }

  playBgm(themeName) {
    this.theme = themeName;
    clearInterval(this.bgmTimer);
    this.bgmTimer = null;
    if (!this.ctx) return;
    const th = THEMES[themeName] ?? THEMES.home;
    const step = 60 / th.bpm / 2;
    let i = 0;
    let next = this.ctx.currentTime + 0.1;
    this.bgmTimer = setInterval(() => {
      // 先読みスケジューリング
      while (next < this.ctx.currentTime + 0.3) {
        const at = next - this.ctx.currentTime;
        const p = th.pattern[i % th.pattern.length];
        const bar = Math.floor(i / th.pattern.length) % 4;
        if (p >= 0) {
          const deg = (p + [0, 2, 1, 3][bar]) % th.scale.length;
          const oct = Math.floor((p + [0, 2, 1, 3][bar]) / th.scale.length) * 12;
          this.tone(mtof(th.root + th.scale[deg] + oct), step * 0.9, { type: th.wave, vol: 0.5, at, dest: this.bgmBus });
        }
        if (i % 4 === 0) this.tone(mtof(th.root - 12 + th.scale[[0, 3, 2, 4][bar] % th.scale.length]), step * 3, { type: 'triangle', vol: 0.5, at, dest: this.bgmBus });
        i++;
        next += step;
      }
    }, 100);
  }
}

// マイク音声認識（Chrome 等で利用可。Android WebView では未対応のことが多い）
export function createVoiceRecognizer(onPhrase) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return null;
  const rec = new SR();
  rec.lang = 'ja-JP';
  rec.interimResults = false;
  rec.maxAlternatives = 3;
  rec.onresult = (e) => {
    const texts = [...e.results[0]].map((a) => a.transcript);
    onPhrase(texts.join(' '));
  };
  return { start: () => { try { rec.start(); } catch { /* 二重起動 */ } } };
}
