// DOM ベースの HUD / メッセージウィンドウ / 選択メニュー
export class UI {
  constructor(root, audio) {
    this.audio = audio;
    root.innerHTML = `
      <div class="hud">
        <div class="mapname"></div>
        <div class="heart" title="なかよし度"><span>♥</span><b class="fr">0</b></div>
        <div class="sensor busy"><i></i><span></span></div>
        <div class="timer hidden"></div>
        <div class="spacer"></div>
        <button class="hbtn mute">♪</button>
        <button class="hbtn menu">≡</button>
      </div>
      <div class="joy"><div class="knob"></div></div>
      <div class="pad">
        <button class="btn action hidden">しらべる</button>
      </div>
      <div class="hints"><div class="htitle"></div><div class="hwords"></div></div>
      <div class="blind hidden"><div class="hint"></div></div>
      <div class="msg hidden"><div class="who"></div><div class="text"></div><div class="next">▼</div></div>
      <div class="modal hidden"><div class="panel"><div class="title"></div><div class="list"></div></div></div>
      <div class="toast hidden"></div>
      <div class="fade"></div>
    `;
    const q = (s) => root.querySelector(s);
    this.el = {
      mapname: q('.mapname'), fr: q('.fr'), timer: q('.timer'), mute: q('.mute'), menu: q('.menu'),
      joy: q('.joy'), sensor: q('.sensor'), sensorText: q('.sensor span'), action: q('.action'), blind: q('.blind'), hint: q('.blind .hint'),
      msg: q('.msg'), who: q('.msg .who'), text: q('.msg .text'),
      modal: q('.modal'), mtitle: q('.modal .title'), mlist: q('.modal .list'),
      toast: q('.toast'), fade: q('.fade'), hints: q('.hints'), htitle: q('.hints .htitle'), hwords: q('.hints .hwords'),
    };
    this.busy = 0;
    this.msgResolve = null;
    this.el.msg.addEventListener('pointerup', () => this.advance());
    for (const b of [this.el.mute, this.el.menu, this.el.action]) {
      b.addEventListener('pointerdown', (e) => e.stopPropagation());
    }
    this.el.mute.addEventListener('click', () => {
      this.el.mute.classList.toggle('off', this.audio.toggleMute());
    });
    this.el.mute.classList.toggle('off', this.audio.muted);
  }

  get blocking() {
    return this.busy > 0;
  }

  setMapName(t) {
    this.el.mapname.textContent = t;
  }
  setFriendship(v) {
    this.el.fr.textContent = v;
  }
  setTimer(t) {
    this.el.timer.classList.toggle('hidden', t == null);
    if (t != null) this.el.timer.textContent = t;
  }
  setAction(label) {
    this.el.action.classList.toggle('hidden', !label);
    if (label) this.el.action.textContent = label;
  }
  // 音声センサー: listening = 緑（聞き取り中）/ busy = 灰（ピカチュウ考え中・準備中）/ off = 灰（マイク使用不可）
  setSensor(st) {
    const el = this.el.sensor;
    el.classList.toggle('listening', st === 'listening');
    el.classList.toggle('busy', st === 'busy');
    el.classList.toggle('off', st === 'off');
    this.el.sensorText.textContent = { listening: 'きいてるよ', busy: 'かんがえちゅう', off: 'マイク ✕' }[st];
  }
  // ピカチュウに言えることばのヒント（表示だけ。指示は声でする）
  setHints(title, words) {
    const key = title + '|' + words.join(',');
    if (key === this.hintKey) return;
    this.hintKey = key;
    this.el.hints.classList.toggle('hidden', !words.length);
    this.el.htitle.textContent = `🎤 ${title ? title + ' ▶ ' : ''}ピカチュウに いってみよう`;
    this.el.hwords.innerHTML = '';
    for (const w of words) {
      const b = document.createElement('span');
      b.className = 'hw';
      b.textContent = `「${w}」`;
      this.el.hwords.appendChild(b);
    }
  }

  setBlind(on, hint = '') {
    this.el.blind.classList.toggle('hidden', !on);
    this.el.hint.textContent = hint;
  }

  // メッセージを順番に表示。タップで送る。
  async say(lines, who = '') {
    if (typeof lines === 'string') lines = [lines];
    this.busy++;
    this.el.msg.classList.remove('hidden');
    this.el.who.textContent = who;
    this.el.who.classList.toggle('hidden', !who);
    for (const line of lines) {
      this.el.text.textContent = line;
      this.audio.sfx('select');
      await new Promise((r) => (this.msgResolve = r));
    }
    this.el.msg.classList.add('hidden');
    this.busy--;
  }
  advance() {
    const r = this.msgResolve;
    this.msgResolve = null;
    r?.();
  }

  // options: [{ label, value, disabled, note }]  → 選んだ value（キャンセルは null）
  choose(title, options, { cancel = 'やめる' } = {}) {
    this.busy++;
    this.el.modal.classList.remove('hidden');
    this.el.mtitle.textContent = title;
    this.el.mlist.innerHTML = '';
    return new Promise((resolve) => {
      const done = (v) => {
        this.el.modal.classList.add('hidden');
        this.busy--;
        resolve(v);
      };
      const all = cancel ? [...options, { label: cancel, value: null, cancel: true }] : options;
      for (const o of all) {
        const b = document.createElement('button');
        b.className = 'opt' + (o.disabled ? ' disabled' : '') + (o.cancel ? ' cancel' : '');
        b.innerHTML = `<span>${o.label}</span>${o.note ? `<small>${o.note}</small>` : ''}`;
        b.addEventListener('click', () => {
          if (o.disabled) {
            this.audio.sfx('ng');
            if (o.msg) this.toast(o.msg);
            return;
          }
          this.audio.sfx('ok');
          done(o.value);
        });
        this.el.mlist.appendChild(b);
      }
    });
  }

  toast(text, ms = 2200) {
    this.el.toast.textContent = text;
    this.el.toast.classList.remove('hidden');
    clearTimeout(this.toastT);
    this.toastT = setTimeout(() => this.el.toast.classList.add('hidden'), ms);
  }

  async fade(fn) {
    this.busy++;
    this.el.fade.classList.add('on');
    await new Promise((r) => setTimeout(r, 350));
    await fn();
    this.el.fade.classList.remove('on');
    await new Promise((r) => setTimeout(r, 300));
    this.busy--;
  }
}
