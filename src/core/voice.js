import { Capacitor } from '@capacitor/core';
import { SpeechRecognition as NativeSR } from '@capacitor-community/speech-recognition';

// 常時聞き取り。認識が終わるたびに自動で再開し、ずっとマイクを待ち受ける。
// - Android アプリ: ネイティブの SpeechRecognizer（プラグイン経由。WebView には音声認識APIがないため）
// - ブラウザ: Web Speech API（continuous モード + 終了時に再開）
// onState: 'listening' | 'paused' | 'unsupported' | 'denied'
export class VoiceListener {
  constructor({ onPhrase, onState }) {
    this.onPhrase = onPhrase;
    this.onState = onState;
    this.enabled = false;
    this.running = false;
    this.native = Capacitor.isNativePlatform();
    this.WebSR = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.supported = this.native || !!this.WebSR;

    // アプリが裏に回ったらマイクを止め、戻ったら再開する
    document.addEventListener('visibilitychange', () => {
      if (!this.enabled) return;
      if (document.hidden) this.halt();
      else this.run();
    });
  }

  async start() {
    if (!this.supported) return this.onState('unsupported');
    if (this.native) {
      try {
        const { available } = await NativeSR.available();
        if (!available) return this.onState('unsupported');
        let perm = await NativeSR.checkPermissions();
        if (perm.speechRecognition !== 'granted') perm = await NativeSR.requestPermissions();
        if (perm.speechRecognition !== 'granted') return this.onState('denied');
      } catch {
        return this.onState('unsupported');
      }
    }
    this.enabled = true;
    this.run();
  }

  pause() {
    this.enabled = false;
    this.halt();
    this.onState('paused');
  }

  toggle() {
    if (this.enabled) this.pause();
    else this.start();
  }

  run() {
    if (this.running || !this.enabled || document.hidden) return;
    this.running = true;
    this.onState('listening');
    if (this.native) this.nativeLoop();
    else this.webLoop();
  }

  halt() {
    this.running = false;
    if (this.native) NativeSR.stop().catch(() => {});
    else this.rec?.abort();
  }

  async nativeLoop() {
    while (this.running) {
      try {
        // partialResults:false なら 1回の発話が終わると matches で返ってくる
        const res = await NativeSR.start({ language: 'ja-JP', maxResults: 3, popup: false, partialResults: false });
        if (res?.matches?.length) this.onPhrase(res.matches.join(' '));
      } catch {
        // 無音タイムアウト・聞き取れなかった等。すぐに待ち受けを再開する
      }
      await new Promise((r) => setTimeout(r, 250));
    }
  }

  webLoop() {
    const rec = (this.rec = new this.WebSR());
    rec.lang = 'ja-JP';
    rec.continuous = true;
    rec.interimResults = false;
    rec.maxAlternatives = 3;
    rec.onresult = (e) => {
      const r = e.results[e.results.length - 1];
      if (r.isFinal) this.onPhrase([...r].map((a) => a.transcript).join(' '));
    };
    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        this.enabled = this.running = false;
        this.onState('denied');
      }
    };
    // ブラウザは一定時間で自動終了するので、そのたびに再開する
    rec.onend = () => {
      if (this.running) setTimeout(() => this.running && rec.start(), 250);
    };
    try {
      rec.start();
    } catch {
      /* 既に開始済み */
    }
  }
}
