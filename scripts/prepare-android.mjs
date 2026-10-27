// `npx cap add android` で生成された Android プロジェクトを ゲーム向けに調整する
// - 横画面固定
// - versionCode を CI の実行番号に合わせる（上書きインストールしやすくするため）
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const manifest = 'android/app/src/main/AndroidManifest.xml';
const gradle = 'android/app/build.gradle';
if (!existsSync(manifest)) {
  console.error('android/ がありません。先に `npx cap add android` を実行してください');
  process.exit(1);
}

let xml = readFileSync(manifest, 'utf8');
if (!xml.includes('android:screenOrientation')) {
  xml = xml.replace(/<activity\b/, '<activity\n            android:screenOrientation="sensorLandscape"');
}
writeFileSync(manifest, xml);

const run = Number(process.env.GITHUB_RUN_NUMBER || 1);
let g = readFileSync(gradle, 'utf8');
g = g.replace(/versionCode \d+/, `versionCode ${run}`).replace(/versionName "[^"]*"/, `versionName "0.1.${run}"`);
writeFileSync(gradle, g);

console.log(`Android プロジェクトを調整しました (versionCode ${run})`);
