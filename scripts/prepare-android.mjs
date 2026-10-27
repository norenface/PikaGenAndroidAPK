// `npx cap add android` で生成された Android プロジェクトを ゲーム向けに調整する
// - 横画面固定 / マイク権限
// - 常時音声認識プラグイン（native/android/*.java）と Vosk ライブラリを組み込む
// - 日本語音声モデルを assets/model-ja に同梱（VOSK_MODEL_DIR、既定 .cache/vosk-model-ja）
// - versionCode を CI の実行番号に合わせる（上書きインストールしやすくするため）
import { readFileSync, writeFileSync, existsSync, cpSync, mkdirSync, rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const APP = 'android/app';
const manifest = `${APP}/src/main/AndroidManifest.xml`;
const gradle = `${APP}/build.gradle`;
const javaDir = `${APP}/src/main/java/com/norenface/pikagen`;
const modelSrc = process.env.VOSK_MODEL_DIR || '.cache/vosk-model-ja';
const modelDst = `${APP}/src/main/assets/model-ja`;

if (!existsSync(manifest)) {
  console.error('android/ がありません。先に `npx cap add android` を実行してください');
  process.exit(1);
}

// マニフェスト
let xml = readFileSync(manifest, 'utf8');
if (!xml.includes('android:screenOrientation')) {
  xml = xml.replace(/<activity\b/, '<activity\n            android:screenOrientation="sensorLandscape"');
}
if (!xml.includes('android.permission.RECORD_AUDIO')) {
  xml = xml.replace('</manifest>', '    <uses-permission android:name="android.permission.RECORD_AUDIO" />\n</manifest>');
}
writeFileSync(manifest, xml);

// ネイティブコード
mkdirSync(javaDir, { recursive: true });
for (const f of ['MainActivity.java', 'VoskPlugin.java']) cpSync(`native/android/${f}`, `${javaDir}/${f}`);

// Gradle
const run = Number(process.env.GITHUB_RUN_NUMBER || 1);
let g = readFileSync(gradle, 'utf8');
g = g.replace(/versionCode \d+/, `versionCode ${run}`).replace(/versionName "[^"]*"/, `versionName "0.1.${run}"`);
if (!g.includes('vosk-android')) {
  g = g.replace(
    /dependencies \{/,
    `dependencies {
    // 常時音声認識（オフライン）
    implementation('com.alphacephei:vosk-android:0.3.75') { exclude group: 'net.java.dev.jna' }
    implementation 'net.java.dev.jna:jna:5.18.1@aar'`,
  );
  // スマホ向けの CPU だけに絞って APK を小さくする
  g = g.replace(/defaultConfig \{/, `defaultConfig {\n        ndk { abiFilters 'arm64-v8a', 'armeabi-v7a' }`);
}
writeFileSync(gradle, g);

// 音声モデル（StorageService.unpack は uuid ファイルで展開済みかを判定する）
if (!existsSync(`${modelSrc}/am`) && !existsSync(`${modelSrc}/conf`)) {
  console.error(`音声モデルがありません: ${modelSrc}`);
  process.exit(1);
}
rmSync(modelDst, { recursive: true, force: true });
cpSync(modelSrc, modelDst, { recursive: true });
writeFileSync(`${modelDst}/uuid`, randomUUID());

console.log(`Android プロジェクトを調整しました (versionCode ${run}, model ${modelSrc})`);
