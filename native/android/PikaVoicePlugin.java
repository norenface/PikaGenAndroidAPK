package com.norenface.pikagen;

import android.Manifest;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.speech.RecognitionListener;
import android.speech.RecognitionSupport;
import android.speech.RecognitionSupportCallback;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONObject;
import org.vosk.Model;
import org.vosk.Recognizer;
import org.vosk.android.SpeechService;
import org.vosk.android.StorageService;

/**
 * 常時音声認識。2つのエンジンを自動で使い分ける。
 *
 *  1. device: 端末内の大きな音声認識モデル（Android 13 以上 + 日本語データあり）
 *     セグメントセッションで長時間ひとつの聞き取りを続け、再起動（＝ポン音の原因）を最小限にする。
 *     一時停止はできないので、考え中に届いた結果は捨てる。
 *  2. vosk: 同梱のオフラインモデル（上記が使えない端末用）。一時停止に対応。
 *
 * イベント:
 *   "result" { text }
 *   "state"  { state: loading|listening|error, engine?, message? }
 *   "info"   { message: downloading|fallback, detail? }
 */
@CapacitorPlugin(name = "PikaVoice", permissions = { @Permission(strings = { Manifest.permission.RECORD_AUDIO }, alias = "microphone") })
public class PikaVoicePlugin extends Plugin {

    private static final float SAMPLE_RATE = 16000.0f;
    private static final long SESSION_MILLIS = 10 * 60 * 1000L;

    private final Handler main = new Handler(Looper.getMainLooper());
    private String engine = null;
    private boolean started = false;
    private boolean paused = false;
    private boolean visible = true;

    // device エンジン
    private SpeechRecognizer device;
    private Intent deviceIntent;
    private long listenStartedAt = 0;
    private int quickFailures = 0;

    // vosk エンジン
    private Model model;
    private Recognizer voskRecognizer;
    private SpeechService voskService;
    private boolean voskLoading = false;

    // ───────── JS API ─────────
    @PluginMethod
    public void start(PluginCall call) {
        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            requestPermissionForAlias("microphone", call, "micPermission");
            return;
        }
        begin(call);
    }

    @PermissionCallback
    private void micPermission(PluginCall call) {
        if (getPermissionState("microphone") == PermissionState.GRANTED) {
            begin(call);
        } else {
            call.reject("denied");
        }
    }

    private void begin(PluginCall call) {
        paused = false;
        call.resolve();
        if (started) return;
        started = true;
        emitState("loading", null);
        main.post(this::tryDevice);
    }

    @PluginMethod
    public void pause(PluginCall call) {
        paused = true;
        if (voskService != null) {
            voskService.setPause(true);
            if (voskRecognizer != null) voskRecognizer.reset();
        }
        call.resolve();
    }

    @PluginMethod
    public void resume(PluginCall call) {
        paused = false;
        if (voskService != null && visible) voskService.setPause(false);
        call.resolve();
    }

    // ───────── アプリのライフサイクル ─────────
    @Override
    protected void handleOnPause() {
        visible = false;
        if (device != null) device.cancel();
        if (voskService != null) voskService.setPause(true);
    }

    @Override
    protected void handleOnResume() {
        visible = true;
        if ("device".equals(engine)) restartDevice(300);
        if (voskService != null) voskService.setPause(paused);
    }

    @Override
    protected void handleOnDestroy() {
        releaseDevice();
        if (voskService != null) {
            voskService.stop();
            voskService.shutdown();
            voskService = null;
        }
        if (model != null) {
            model.close();
            model = null;
        }
    }

    // ───────── device エンジン ─────────
    private void tryDevice() {
        if (Build.VERSION.SDK_INT < 33 || !SpeechRecognizer.isOnDeviceRecognitionAvailable(getContext())) {
            startVosk("android-version-or-no-ondevice");
            return;
        }
        try {
            device = SpeechRecognizer.createOnDeviceSpeechRecognizer(getContext());
            deviceIntent = buildIntent();
            device.checkRecognitionSupport(
                deviceIntent,
                getContext().getMainExecutor(),
                new RecognitionSupportCallback() {
                    @Override
                    public void onSupportResult(RecognitionSupport support) {
                        if (hasJapanese(support.getInstalledOnDeviceLanguages())) {
                            engine = "device";
                            device.setRecognitionListener(deviceListener);
                            listenDevice();
                            emitState("listening", null);
                            return;
                        }
                        // 日本語データが未インストールなら ダウンロードを依頼し、今回は vosk で動かす
                        if (hasJapanese(support.getSupportedOnDeviceLanguages()) && !hasJapanese(support.getPendingOnDeviceLanguages())) {
                            try {
                                device.triggerModelDownload(deviceIntent);
                                emitInfo("downloading", null);
                            } catch (Exception ignored) {}
                        } else if (hasJapanese(support.getPendingOnDeviceLanguages())) {
                            emitInfo("downloading", null);
                        }
                        releaseDevice();
                        startVosk("no-japanese-ondevice-model");
                    }

                    @Override
                    public void onError(int error) {
                        releaseDevice();
                        startVosk("support-check-error-" + error);
                    }
                }
            );
        } catch (Exception e) {
            releaseDevice();
            startVosk("ondevice-exception: " + e.getMessage());
        }
    }

    private Intent buildIntent() {
        Intent i = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "ja-JP");
        i.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3);
        i.putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true);
        i.putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, getContext().getPackageName());
        // 長いセッション: 最低 SESSION_MILLIS は聞き続け、発話ごとに onSegmentResults が届く
        i.putExtra(RecognizerIntent.EXTRA_SEGMENTED_SESSION, RecognizerIntent.EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS);
        i.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS, SESSION_MILLIS);
        return i;
    }

    private void listenDevice() {
        if (device == null || !visible) return;
        listenStartedAt = SystemClock.elapsedRealtime();
        try {
            device.startListening(deviceIntent);
        } catch (Exception e) {
            fallbackFromDevice("start-exception: " + e.getMessage());
        }
    }

    private void restartDevice(long delayMs) {
        main.postDelayed(
            () -> {
                if ("device".equals(engine) && visible) listenDevice();
            },
            delayMs
        );
    }

    private void fallbackFromDevice(String reason) {
        releaseDevice();
        emitInfo("fallback", reason);
        startVosk(reason);
    }

    private void releaseDevice() {
        if (device != null) {
            try {
                device.cancel();
                device.destroy();
            } catch (Exception ignored) {}
            device = null;
        }
        if ("device".equals(engine)) engine = null;
    }

    private void deliver(Bundle results) {
        if (results == null) return;
        ArrayList<String> matches = results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
        if (matches == null || matches.isEmpty()) return;
        quickFailures = 0;
        emitText(String.join(" ", matches));
    }

    private final RecognitionListener deviceListener = new RecognitionListener() {
        @Override
        public void onReadyForSpeech(Bundle params) {}

        @Override
        public void onBeginningOfSpeech() {}

        @Override
        public void onRmsChanged(float rmsdB) {}

        @Override
        public void onBufferReceived(byte[] buffer) {}

        @Override
        public void onEndOfSpeech() {}

        @Override
        public void onPartialResults(Bundle partialResults) {}

        @Override
        public void onEvent(int eventType, Bundle params) {}

        @Override
        public void onSegmentResults(Bundle segmentResults) {
            deliver(segmentResults);
        }

        @Override
        public void onEndOfSegmentedSession() {
            restartDevice(100);
        }

        @Override
        public void onResults(Bundle results) {
            // セグメントセッション非対応の端末ではここに来るので、すぐ聞き直す
            deliver(results);
            restartDevice(100);
        }

        @Override
        public void onError(int error) {
            if (!"device".equals(engine)) return;
            if (
                error == SpeechRecognizer.ERROR_LANGUAGE_NOT_SUPPORTED ||
                error == SpeechRecognizer.ERROR_LANGUAGE_UNAVAILABLE ||
                error == SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS
            ) {
                fallbackFromDevice("device-error-" + error);
                return;
            }
            // 起動直後のエラーが続く端末は device エンジンが実質使えないので vosk に切り替える
            if (SystemClock.elapsedRealtime() - listenStartedAt < 1500) {
                if (++quickFailures >= 5) {
                    fallbackFromDevice("device-quick-failures");
                    return;
                }
            } else {
                quickFailures = 0;
            }
            if (error == SpeechRecognizer.ERROR_RECOGNIZER_BUSY) {
                if (device != null) device.cancel();
                restartDevice(600);
            } else {
                restartDevice(200);
            }
        }
    };

    private static boolean hasJapanese(List<String> langs) {
        if (langs == null) return false;
        for (String l : langs) if (l != null && l.toLowerCase().startsWith("ja")) return true;
        return false;
    }

    // ───────── vosk エンジン ─────────
    private void startVosk(String reason) {
        engine = "vosk";
        if (voskService != null || voskLoading) return;
        voskLoading = true;
        emitState("loading", null);
        // APK の assets/model-ja を端末ストレージへ展開（初回のみ時間がかかる）
        StorageService.unpack(
            getContext(),
            "model-ja",
            "model",
            (m) -> {
                voskLoading = false;
                model = m;
                try {
                    voskRecognizer = new Recognizer(model, SAMPLE_RATE);
                    voskService = new SpeechService(voskRecognizer, SAMPLE_RATE);
                    voskService.startListening(voskListener);
                    voskService.setPause(paused || !visible);
                    emitState("listening", null);
                } catch (IOException e) {
                    emitState("error", e.getMessage());
                }
            },
            (e) -> {
                voskLoading = false;
                emitState("error", e.getMessage());
            }
        );
    }

    private final org.vosk.android.RecognitionListener voskListener = new org.vosk.android.RecognitionListener() {
        @Override
        public void onResult(String hypothesis) {
            emitVosk(hypothesis);
        }

        @Override
        public void onFinalResult(String hypothesis) {
            emitVosk(hypothesis);
        }

        @Override
        public void onPartialResult(String hypothesis) {}

        @Override
        public void onError(Exception e) {
            emitState("error", e.getMessage());
        }

        @Override
        public void onTimeout() {}
    };

    private void emitVosk(String json) {
        try {
            emitText(new JSONObject(json).optString("text", ""));
        } catch (Exception ignored) {
            // 壊れた JSON は無視
        }
    }

    // ───────── イベント ─────────
    private void emitText(String text) {
        text = text.trim();
        // 考え中（paused）に届いた結果は捨てる
        if (text.isEmpty() || paused) return;
        JSObject o = new JSObject();
        o.put("text", text);
        notifyListeners("result", o);
    }

    private void emitState(String state, String message) {
        JSObject o = new JSObject();
        o.put("state", state);
        if (engine != null) o.put("engine", engine);
        if (message != null) o.put("message", message);
        notifyListeners("state", o);
    }

    private void emitInfo(String message, String detail) {
        JSObject o = new JSObject();
        o.put("message", message);
        if (detail != null) o.put("detail", detail);
        notifyListeners("info", o);
    }
}
