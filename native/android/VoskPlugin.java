package com.norenface.pikagen;

import android.Manifest;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.IOException;
import org.json.JSONObject;
import org.vosk.Model;
import org.vosk.Recognizer;
import org.vosk.android.RecognitionListener;
import org.vosk.android.SpeechService;
import org.vosk.android.StorageService;

/**
 * 常時音声認識（Vosk / オフライン）。
 * Android 標準の SpeechRecognizer と違い、1つのセッションでずっと聞き続けるので
 * 再起動時の「ポン」という効果音が鳴らない。pause / resume でマイク入力の受付を切り替える。
 *
 * イベント: "result" { text } / "state" { state: loading|listening|paused|error, message? }
 */
@CapacitorPlugin(name = "Vosk", permissions = { @Permission(strings = { Manifest.permission.RECORD_AUDIO }, alias = "microphone") })
public class VoskPlugin extends Plugin implements RecognitionListener {

    private static final float SAMPLE_RATE = 16000.0f;
    private Model model;
    private Recognizer recognizer;
    private SpeechService speech;
    private boolean paused = false;
    private boolean loading = false;

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
        if (speech != null) {
            speech.setPause(false);
            emitState("listening", null);
            call.resolve();
            return;
        }
        if (loading) {
            call.resolve();
            return;
        }
        loading = true;
        emitState("loading", null);
        // APK の assets/model-ja を端末ストレージへ展開（初回のみ時間がかかる）
        StorageService.unpack(
            getContext(),
            "model-ja",
            "model",
            (m) -> {
                loading = false;
                model = m;
                try {
                    recognizer = new Recognizer(model, SAMPLE_RATE);
                    speech = new SpeechService(recognizer, SAMPLE_RATE);
                    speech.startListening(this);
                    speech.setPause(paused);
                    emitState(paused ? "paused" : "listening", null);
                    call.resolve();
                } catch (IOException e) {
                    emitState("error", e.getMessage());
                    call.reject(e.getMessage());
                }
            },
            (e) -> {
                loading = false;
                emitState("error", e.getMessage());
                call.reject(e.getMessage());
            }
        );
    }

    @PluginMethod
    public void pause(PluginCall call) {
        paused = true;
        if (speech != null) {
            speech.setPause(true);
            // 途中まで聞いていた音声は捨てる
            if (recognizer != null) recognizer.reset();
        }
        emitState("paused", null);
        call.resolve();
    }

    @PluginMethod
    public void resume(PluginCall call) {
        paused = false;
        if (speech != null) speech.setPause(false);
        emitState(speech != null ? "listening" : "loading", null);
        call.resolve();
    }

    @Override
    protected void handleOnPause() {
        if (speech != null) speech.setPause(true);
    }

    @Override
    protected void handleOnResume() {
        if (speech != null && !paused) speech.setPause(false);
    }

    @Override
    protected void handleOnDestroy() {
        if (speech != null) {
            speech.stop();
            speech.shutdown();
            speech = null;
        }
        if (model != null) {
            model.close();
            model = null;
        }
    }

    private void emitState(String state, String message) {
        JSObject o = new JSObject();
        o.put("state", state);
        if (message != null) o.put("message", message);
        notifyListeners("state", o);
    }

    private void emitText(String json) {
        try {
            String text = new JSONObject(json).optString("text", "").trim();
            if (!text.isEmpty() && !paused) {
                JSObject o = new JSObject();
                o.put("text", text);
                notifyListeners("result", o);
            }
        } catch (Exception ignored) {
            // 壊れた JSON は無視
        }
    }

    @Override
    public void onResult(String hypothesis) {
        emitText(hypothesis);
    }

    @Override
    public void onFinalResult(String hypothesis) {
        emitText(hypothesis);
    }

    @Override
    public void onPartialResult(String hypothesis) {}

    @Override
    public void onError(Exception e) {
        emitState("error", e.getMessage());
    }

    @Override
    public void onTimeout() {}
}
