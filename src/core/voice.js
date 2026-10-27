import { Capacitor, registerPlugin } from '@capacitor/core';

// 常時聞き取り。ボタン操作なしでずっとマイクを待ち受ける。
// - Android アプリ: アプリ内プラグイン PikaVoice
//     端末内の大きな音声認識モデル（Android 13+・日本語データあり）を優先し、使えなければ同梱の Vosk に切り替える
// - ブラウザ: Web Speech API（continuous + 終了時に自動再開）
// ピカチュウが考えている間は hold() で聞き取りを止め、release() で再開する。
// onSensor(state): 'listening'（緑）| 'busy'（灰：考え中・準備中）| 'off'（灰：使えない）
const PikaVoice = registerPlugin('PikaVoice');

export class VoiceListener {
  constructor({ onPhrase, onSensor, onError, onInfo }) {
    this.onPhrase = onPhrase;
    this.onInfo = onInfo;
    this.onSensor = onSensor;
    this.onError = onError;
    this.native = Capacitor.isNativePlatform();
    this.WebSR = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.supported = this.native || !!this.WebSR;
    this.engine = 'idle'; // idle | loading | listening | error
    this.holding = false;

    document.addEventListener('visibilitychange', () => {
      if (this.native || this.engine !== 'listening') return;
      // ブラウザ版: 裏に回ったら止め、戻ったら再開（アプリ版はネイティブ側で処理）
      if (document.hidden) this.rec?.abort();
      else if (!this.holding) this.webStart();
    });
  }

  get sensor() {
    if (!this.supported || this.engine === 'error') return 'off';
    return this.engine === 'listening' && !this.holding ? 'listening' : 'busy';
  }
  emit() {
    this.onSensor(this.sensor);
  }

  async start() {
    if (!this.supported) return this.emit();
    if (this.native) {
      await PikaVoice.addListener('result', ({ text }) => this.heard(text));
      await PikaVoice.addListener('info', (i) => this.onInfo?.(i));
      await PikaVoice.addListener('state', ({ state, message, engine }) => {
        if (state === 'loading' || state === 'listening' || state === 'error') this.engine = state;
        if (state === 'listening' && engine && engine !== this.engineName) {
          this.engineName = engine;
          this.onInfo?.({ message: 'engine', detail: engine });
        }
        if (state === 'error') this.onError?.(message === 'denied' ? 'denied' : 'error');
        this.emit();
      });
      this.engine = 'loading';
      this.emit();
      try {
        await PikaVoice.start();
      } catch (e) {
        this.engine = 'error';
        this.onError?.(String(e?.message ?? e) === 'denied' ? 'denied' : 'error');
        this.emit();
      }
      return;
    }
    this.engine = 'listening';
    this.webStart();
    this.emit();
  }

  heard(text) {
    const t = text.replace(/\s+/g, '');
    if (!t || this.holding) return;
    this.onPhrase(t);
  }

  // ピカチュウが考え中: 聞き取り停止（センサー灰色）
  hold() {
    if (this.holding) return;
    this.holding = true;
    if (this.native) PikaVoice.pause().catch(() => {});
    else this.rec?.abort();
    this.emit();
  }
  release() {
    if (!this.holding) return;
    this.holding = false;
    if (this.native) PikaVoice.resume().catch(() => {});
    else if (this.engine === 'listening') this.webStart();
    this.emit();
  }

  webStart() {
    if (this.rec) {
      this.rec.onend = null;
      this.rec.abort();
    }
    const rec = (this.rec = new this.WebSR());
    rec.lang = 'ja-JP';
    rec.continuous = true;
    rec.interimResults = false;
    rec.maxAlternatives = 3;
    rec.onresult = (e) => {
      const r = e.results[e.results.length - 1];
      if (r.isFinal) this.heard([...r].map((a) => a.transcript).join(' '));
    };
    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        this.engine = 'error';
        this.onError?.('denied');
        this.emit();
      }
    };
    // ブラウザは一定時間で自動終了するので、聞き取り可能な間は再開し続ける
    rec.onend = () => {
      if (this.engine === 'listening' && !this.holding && !document.hidden && this.rec === rec) setTimeout(() => this.rec === rec && rec.start(), 200);
    };
    try {
      rec.start();
    } catch {
      /* 既に開始済み */
    }
  }
}
