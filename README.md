# ピカげんき（ピカチュウげんきでちゅう風 ファンメイドゲーム）

ピカチュウと一緒に、ホームベースから色々なフィールドへお出かけする 3D おさんぽゲームです。
**PC 不要**：GitHub に push するだけで GitHub Actions が Web 版と Android APK を自動ビルドします。

> 非公式のファンメイド作品です。個人で楽しむ範囲でご利用ください（配布・公開はしないでください）。
> モデルや音はすべてコード内のプリミティブ図形とシンセで作られており、公式の素材は含まれていません。

## APK の入手方法（スマホだけで OK）

1. GitHub アプリ / ブラウザでこのリポジトリの **Actions** タブを開く
2. 最新の **Build** ワークフロー実行をタップ
3. 下部 **Artifacts** の `pikagen-apk` をダウンロード（zip の中に `pikagen-XX-debug.apk`）
4. APK を開いてインストール（「提供元不明のアプリ」の許可が必要です）

`pikagen-web` には Web 版（`dist/`）が入っています。

## あそびかた

| 操作 | 内容 |
| --- | --- |
| 画面左側をドラッグ | 歩く（仮想スティック。上で前進、左右で横歩き） |
| 画面右側をドラッグ | 見回す（一人称視点） |
| 右下の黄色いボタン | しらべる / 出口に入る / ミニゲームの操作 |
| ピカチュウをタッチ | なでる（なかよし度アップ） |
| 話しかける | ボタン操作なしで**常に聞き取り中**。「ピカチュウ！」「いいこだね」「こっちおいで」「おやすみ」「10まんボルト」などに反応 |
| 音声センサー（画面上部） | 緑＝聞き取り中 / 灰＝ピカチュウが考え中・反応中（この間は聞き取らない） |
| ≡ メニュー | おうちに帰る / ワープ（テスト用・全マップ）/ データ消去 |

PC ブラウザでは W/S/↑/↓ で前後、A/D で横歩き、←/→（Q/E）で向きを変える、マウスドラッグで見回す、Space/Enter でしらべる。

視点は一人称（目の高さ 1.55m）。ピカチュウは視界に入るよう、少し前の右側をついてきます。

初回起動時にマイクの許可を求められます。アプリが裏に回るとマイクは自動で止まり、戻ると再開します。
Android 版の音声エンジンは自動で選ばれます（起動時に「こえエンジン：…」と表示）。

| エンジン | 条件 | 特徴 |
| --- | --- | --- |
| たんまつ（高精度） | Android 13 以上 + 端末に日本語の音声データあり | 端末内の大きなモデル。長時間セッションで聞き続け、再起動を最小限にする。日本語データが無い場合は自動でダウンロードを依頼し、次回起動から使う |
| Vosk | 上記が使えない端末 | 同梱のオフラインモデル。1セッションを聞き続けるので「ポン」音は鳴らない。初回はモデル展開に数秒〜十数秒 |

## マップ構成

```
じぶんのへや ──ガラスど──▶ みてみて！ピカチュウコース ─┬─ うちのにわ
                                                       └─ うらのあきち（へやの とけいを3回しらべると解放）
うちのにわ ─┬─ しょうめんもん ▶ あそぼう！コース
            │      トキワのもり / アカネのもり / アサギのみずうみ / モエギそうげん / スオウかいがん / キャンプじょう
            └─ ひだりもん ▶ チャレンジ！コース
                   アカネのつりば / アサギのつりば / スオウのつりば / スオウじま（スイカわり成功で解放）
```

フィールド同士も出口でつながっています（例: アカネのもり ⇄ アカネのつりば、スオウかいがん ⇄ スオウじま[ふね]）。

| マップ | ギミック | ファイル |
| --- | --- | --- |
| じぶんのへや | 博士からの通信（進行ヒント）、コレクション棚（持ち帰ったアイテムが並ぶ）、とけいの裏技 | `src/gimmicks/room.js` |
| うちのにわ | はたけ（種まき→実時間で成長→収穫）、かだんの水やり、いけ | `src/gimmicks/garden.js` |
| トキワのもり | キャタピーの子守り（60秒、離れすぎた子を連れ戻す。なかよしピカチュウが手伝う） | `src/gimmicks/caterpie.js` |
| アカネのもり | 食材集め → コイルにおつかい | `src/gimmicks/cooking.js` |
| アカネ / アサギ / スオウのつりば | 釣り（ウキが沈んだら「ひく！」、場所ごとに釣れるポケモンが違う、自己ベスト記録） | `src/gimmicks/fishing.js` |
| アサギのみずうみ | 迷子のニョロモ3匹をゼニガメ・ニョロゾのもとへ届ける | `src/gimmicks/nyoromo.js` |
| モエギそうげん | くさむらに隠れたナゾノクサ探し（ピカチュウがヒント） | `src/gimmicks/nazonokusa.js` |
| スオウかいがん | スイカわり（目かくし中はピカチュウの声が頼り） | `src/gimmicks/watermelon.js` |
| スオウじま | 海賊の宝箱発掘（条件解放。ピカチュウが匂いでヒント） | `src/gimmicks/treasure.js` |
| キャンプじょう | 1度きりのイベント（たき火・おはなし・花火） | `src/gimmicks/camp.js` |
| うらのあきち | ふしぎなはこ、ピカチュウとダンス | `src/gimmicks/akichi.js` |

## ファイル構成

```
.github/workflows/build.yml   自動ビルド（Web バンドル + Android APK を Artifacts に保存）
capacitor.config.json         Capacitor（Web → Android ラッパー）設定
vite.config.js                Vite ビルド設定
index.html
public/manifest.webmanifest   PWA マニフェスト
public/maps/<id>.glb          Blender で生成した各マップの3Dモデル
public/maps/<id>.json         そのマップの当たり判定（木・岩など [x, z, 半径]）
tools/blender/build_maps.py   全マップを生成する Blender スクリプト
native/android/
  PikaVoicePlugin.java        常時音声認識プラグイン（端末内モデル優先・Vosk 予備・考え中は結果を捨てる）
  MainActivity.java           プラグイン登録
scripts/
  validate-maps.mjs           マップ定義の整合性チェック（CI で実行）
  prepare-android.mjs         生成された Android プロジェクトに横画面固定・マイク権限・音声プラグイン・音声モデルを組み込む
src/
  main.js                     起動・ループ・ボタン・タイトル画面
  style.css                   UI スタイル
  core/
    world.js                  マップ読み込み・当たり判定・出口/コース遷移・タッチ判定・カメラ
    ui.js                     HUD / メッセージ / 選択メニュー / フェード
    input.js                  仮想スティック・タップ・キーボード
    audio.js                  鳴き声合成・効果音・BGM シーケンサ
    voice.js                  常時音声認識と考え中の一時停止（Android は PikaVoice プラグイン、ブラウザは Web Speech API）
    save.js                   セーブ（localStorage）
    rng.js                    シード付き乱数
  entities/
    models.js                 ローポリモデル（ピカチュウ・トレーナー・ポケモン・背景）
    pikachu.js                ピカチュウ AI（追従・なでる・こえへの反応）
  maps/
    data.js                   全マップ・コース・解放条件の定義
    items.js                  アイテムカタログ
  gimmicks/                   マップごとのギミック（上表）
```

## 自動ビルドの流れ（`.github/workflows/build.yml`）

1. Node 22 / Java 21 / Android SDK をセットアップ
2. `npm ci` → `npm run validate`（マップ定義チェック）→ `npm run build`（Vite）
3. `dist/` を `pikagen-web` として保存
4. 日本語音声モデル（vosk-model-small-ja-0.22）をダウンロード（キャッシュあり）
5. `npx cap add android` で Android プロジェクトを生成 → `scripts/prepare-android.mjs` で調整 → `npx cap sync`
6. `./gradlew assembleDebug` でデバッグ APK を作成し `pikagen-apk` として保存

`android/` フォルダは毎回 CI で生成するのでリポジトリには含めていません。

## 3Dマップ（Blender）

全13マップの地形・木々・建物・水辺などは `tools/blender/build_maps.py` で Blender から生成しています（オリジナルデザイン）。
歩ける範囲（`src/maps/data.js` の `size`）は平らで、外側は丘・山・海などで囲んでいます。キャラクターやギミックの物はゲームのコードが配置します。

作り直すとき（PC で）:

```bash
pip install bpy            # Blender の Python モジュール（または Blender 本体）
npm run maps:build         # data.js → JSON → public/maps/*.glb を全部作り直す
npm run maps:build -- tokiwa garden   # 一部だけ
```

`.glb` は Blender の「ファイル → インポート → glTF」で開いて手直しもできます（手直しした場合は glb で書き出して上書き）。
`.glb` が無いマップは、従来の簡易な図形で表示されます。

## 拡張のしかた

- **マップを追加**: `src/maps/data.js` の `MAPS` に定義を追加し、`COURSES` か他マップの `exits` からつなぐ
- **ギミックを追加**: `src/gimmicks/xxx.js` に `export default function (world, map) { return { update, enter, dispose } }` を書き、`src/gimmicks/index.js` に登録
- ギミック内では `world.addInteractable()`、`world.ui.say()`、`world.ui.choose()`、`world.pika.goTo()`、`world.getItem()` などが使えます
