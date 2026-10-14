# PstudyDict

英単語を Weblio で調べて訳・例文・発音記号・発音の音声を集め、P-Study System（PssEditor の [ファイル]-[インポート]）に取り込める CSV（Shift_JIS / UTF-8）を作るアプリ。

## プログラムの構造

画面は Angular 製の 1 つだけで、それを 3 通りの起動方法で動かす。

```
                ┌──────────── Angular の画面 (src/) ────────────┐
                │  PstudyComponent（画面は1つ）                  │
                │    ├ WordLookupService   … Weblio で訳を取得  │
                │    ├ PStudyBuilderService … 一覧の保持と CSV 作成 │
                │    └ DesktopFileService  … 絶対パスへの保存(*) │
                └───────────────┬───────────────────────────────┘
                                │ /weblio/<単語> にアクセス
        ┌───────────────────────┼──────────────────────────┐
   ① 開発 (ng serve)       ② zip 配布版              ③ デスクトップ版 (Electron)
   proxy.conf.json         portable/server.mjs        electron/main.mjs
        └───────────────────────┴──────────────────────────┘
                                ▼
                  https://ejje.weblio.jp/content/<単語>
```

(*) デスクトップ版のときだけ使う。

ブラウザは別サイト（Weblio）のページを直接読めない（CORS の制限）。そこで画面は自分自身の `/weblio/...` にアクセスし、起動方法ごとの中継役が Weblio に取りに行く。中継役が違うだけなので、画面のコードは 3 つの起動方法で共通。

### Angular 側（`src/app/`）

| ファイル | 役割 |
|---|---|
| `main.ts` → `app.ts` | アプリを起動し、`<app-pstudy>` を 1 つ置くだけの入口 |
| `components/pstudy/` | 画面本体。入力欄、検索中の表示、見つからなかった単語、問題リスト、保存欄 |
| `services/word-lookup.service.ts` | `/weblio/<単語>` の HTML を受け取り、`<meta name="description">` から訳を（`parseWeblioMeaning`）、本文から発音記号（`parseWeblioPronunciation`）、先頭の例文（`parseWeblioExample`）、単語の発音の MP3 の URL（`parseWeblioAudioUrl`）を取り出す。見つからないときは `WordNotFoundError` を返す |
| `services/pstudy-builder.service.ts` | 問題リストを signal で持つ。追加・重複チェック・編集・削除と、CSV の作成（Shift_JIS / UTF-8）を担当。CSV は PssEditor が書き出すのと同じ PSS インポート可能形式（1 行目 `psscsvfile,100`、2 行目が問題集名、3 行目は空行、4 行目が列配置 `a1..a5,q1..q10,h1..h10,d1..d10,wavfile,qvoicefile,imagefile,url`）。a1 = 英単語、q1 = 訳、d1 = 例文、d2 = 発音記号、wavfile = 単語の発音の音声ファイルの絶対パス（デスクトップ版のみ）。空欄は引用符を付けない |
| `services/desktop-file.service.ts` | Electron の preload が用意する `window.pstudyDesktop` を包むサービス。ブラウザ版では `available` が `false` になる |
| `services/logger.service.ts` | ログ出力用（現在は未使用） |

**検索の流れ**（`PstudyComponent.lookup()`）

1. 入力を改行・カンマ・タブで区切り、重複を除く。
2. 登録済みの単語は「スキップ」として表示する。
3. 残りを `concatMap` で 1 語ずつ順番に問い合わせる（Weblio に負荷をかけないため）。
4. 見つかった単語は一覧に追加し、見つからない単語は「見つからなかった単語」欄に回して手入力で追加できるようにする。

**状態の持ち方**：Angular 22 の Zoneless モードで動いているため、画面に表示する状態は signal で持つ。普通のプロパティを `await` のあとで書き換えても画面に反映されない。

### 3 つの起動方法

| | 開発 | zip 配布版 | デスクトップ版 |
|---|---|---|---|
| 起動 | `npm start` | `start.bat` / `start.sh` | `npm run widget`、またはインストールしたアプリ |
| 中継役 | `proxy.conf.json` | `portable/server.mjs`（追加パッケージ不要の Node サーバー） | `electron/main.mjs` |
| CSV 保存 | ダウンロード | ダウンロード | 絶対パスを指定して保存 |
| 配布物の作成 | — | `npm run package` → `release/` | `npm run dist:win` / `dist:linux` → `dist/widget/` |

### Electron 側（`electron/`）

- **`main.mjs`**（main プロセス）
  - ビルド済みの画面を `app://local/` という独自の URL で表示する。`app://local/weblio/...` へのアクセスは Weblio に中継する。
  - 窓の大きさ・位置と「常に手前に表示」を保存し、次回に復元する。
  - CSV 保存の処理を受け持つ。絶対パスかどうか、`.csv` かどうか、上書きしてよいかを確かめてから書き込む。
  - 単語の発音の MP3 を Weblio（`cdn.weblio.jp` のみ）から 1 件ずつ取得し、CSV と同じ場所の `<CSV名>_voice/` に保存する。保存済みのファイルは取り直さない。
- **`preload.cjs`**
  - 画面とファイル書き込みをつなぐ窓口。画面からは直接ファイルを書けないので、ここで許可した 4 つの関数だけを `window.pstudyDesktop` として画面に渡す。

```
画面 (Angular) ──pstudyDesktop.saveFile()──▶ preload.cjs ──IPC──▶ main.mjs ──▶ ファイル書き込み
```

### ビルドと配布物の関係

```
ng build ─▶ dist/pstudy-dict/browser/ ─┬─▶ portable/make-zip.sh ─▶ release/pstudy-dict.zip（Node.js が必要）
                                        └─▶ electron-builder     ─▶ dist/widget/*.deb, *.zip（Node.js 不要）
```

electron-builder の設定は `package.json` の `build` にまとめてある。アプリに含めるのは画面のビルドと `electron/` だけで、`node_modules` は含めない。

- Windows のインストーラー形式（`npm run dist:win-installer`）は、Windows 上か Wine のある環境でないと作れない。
- Linux で `npm run widget` を使うには、`node_modules/electron/dist/chrome-sandbox` を root 所有・モード 4755 にするか、`npx electron . --no-sandbox` で起動する。

### 既知の課題

- `LoggerService` はどこからも使っていない。
- `app.routes.ts` のルートは空で、Router は使っていない。
- `package.json` のバージョンが `0.0.0` のままで、配布ファイル名がタグ `v0.5.0-beta` と合っていない。

---

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 22.2.2.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Vitest](https://vitest.dev/) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
