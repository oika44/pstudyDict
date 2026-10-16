# ビルドと配布物の作り方

配布物は次の 4 種類。どれも最初に `ng build` で画面をビルドし、`dist/pstudy-dict/browser/` を中身として使う。

| 配布物 | できるファイル | 使う側に必要なもの |
|---|---|---|
| Windows 版（1 ファイル） | `dist/widget/pstudy-dict.exe` | なし。ダブルクリックで起動 |
| Windows 版（フォルダ形式） | `dist/widget/PStudyDict-Windows-<version>.zip` | なし。展開して中の `pstudy-dict.exe` を起動 |
| Linux 版 | `dist/widget/pstudy-dict_<version>_amd64.deb` | なし |
| zip 配布版（ブラウザで使う） | `release/pstudy-dict.zip` | Node.js 18 以上 |

`<version>` は `package.json` の `version`（例: `0.6.0-beta.1`）。

## 1. 準備

ビルドする環境に必要なもの:

- Node.js 24 / npm 11（`package.json` の `packageManager` に合わせる）
- Windows 版の `pstudy-dict.exe`（portable）やインストーラーを Linux で作る場合は Wine（`sudo apt install wine`）
- zip 配布版を作る場合は `zip` コマンド

依存パッケージを入れる:

```bash
npm ci
```

## 2. 動作確認

```bash
npm start          # 開発サーバー (http://localhost:4200/)
npm test           # 単体テスト (Vitest)
npm run widget     # Electron のデスクトップ版として起動
```

Linux で `npm run widget` が sandbox のエラーで起動しないときは、`npx electron . --no-sandbox` で起動する。

## 3. バージョンを上げる

配布ファイル名とタグに使うので、ビルドの前に上げておく。

```bash
npm version 0.6.0-beta.2 --no-git-tag-version   # package.json と package-lock.json の両方が変わる
```

## 4. ビルド

### Windows 版

```bash
npx ng build && npx electron-builder --win zip portable
```

`pstudy-dict.exe`（1 ファイル）と `PStudyDict-Windows-<version>.zip`（フォルダ形式）の両方ができる。片方だけでよい場合:

| コマンド | できるもの |
|---|---|
| `npm run dist:win` | zip のみ |
| `npm run dist:win-installer` | `pstudy-dict.exe` とインストーラー `PStudyDict-Setup-<version>.exe` |

補足:

- exe の名前は `package.json` の `build.win.executableName` と `build.portable.artifactName` で `pstudy-dict` に決めている。1 ファイル版の名前にはバージョンが付かない。
- `signAndEditExecutable: false` にしているので、コード署名と exe のアイコン・バージョン情報の書き換えはしない。アイコンは Electron の標準のまま。
- 初回は Windows 用の Electron をダウンロードするので、ネットワークが必要。

### Linux 版

```bash
npm run dist:linux
```

### zip 配布版

```bash
npm run package
```

`portable/server.mjs`・起動スクリプト・`portable/README.txt` と画面のビルドをまとめて `release/pstudy-dict.zip` を作る。

## 5. リリース

`dist/` と `release/` は Git の管理外。配布物は GitHub の Releases に添付する。

```bash
git commit -am "バージョンを 0.6.0-beta.2 にする"
git tag -a v0.6.0-beta.2 -m "ベータ 0.6 (2)"
git push origin master v0.6.0-beta.2

gh release create v0.6.0-beta.2 --prerelease --title "ベータ 0.6 (2)" --notes "変更点" \
  dist/widget/pstudy-dict.exe dist/widget/PStudyDict-Windows-0.6.0-beta.2.zip
```

`gh` を使うには、先に `sudo apt install gh` と `gh auth login` が必要。

古いバージョンの成果物は `dist/widget/` に残るので、ビルドの前に消しておくと取り違えない。
