package com.norenface.pikagen;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // アプリ内プラグイン（常時音声認識）を登録
        registerPlugin(VoskPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
