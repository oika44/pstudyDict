// P-Study 単語ファイル作成アプリをデスクトップの小窓 (ウィジェット) として起動する Electron のエントリ
// - ビルド済みの画面 (dist/pstudy-dict/browser) を独自スキーム app://local/ で配信する
// - app://local/weblio/<単語> を https://ejje.weblio.jp/content/<単語> に中継する (CORS 回避。server.mjs と同じ役割)
// - 画面から指定された絶対パスに CSV を保存する (preload.cjs 経由)
// - Weblio の単語の発音 (MP3) を CSV と同じ場所の「<CSV名>_voice」フォルダに保存する
import { app, BrowserWindow, dialog, ipcMain, Menu, net, protocol, screen, shell } from 'electron';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, isAbsolute, join, normalize, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = join(import.meta.dirname, '..', 'dist', 'pstudy-dict', 'browser');
const STATE_FILE = join(app.getPath('userData'), 'window-state.json');
const DEFAULT_STATE = { width: 480, height: 720, alwaysOnTop: true };

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

function handleRequest(req) {
  const { pathname } = new URL(req.url);
  if (pathname.startsWith('/weblio/')) {
    return net.fetch(`https://ejje.weblio.jp/content/${pathname.slice('/weblio/'.length)}`);
  }

  // ROOT の外を読ませない
  const file = normalize(join(ROOT, decodeURIComponent(pathname)));
  if (!file.startsWith(ROOT + sep)) return new Response(null, { status: 403 });
  // 不明なパスは画面本体を返す (Angular のルーティング用)
  const target = existsSync(file) && !file.endsWith(sep) ? file : join(ROOT, 'index.html');
  return net.fetch(pathToFileURL(target).toString());
}

/** 自アプリの画面以外からの呼び出しを拒否する */
function fromApp(event) {
  return event.senderFrame?.url.startsWith('app://local/') ?? false;
}

/** 画面から渡された CSV の保存先を検証し、.csv で終わる絶対パスにする。不正なら null */
function csvTarget(path) {
  if (typeof path !== 'string') return null;
  const file = path.trim();
  if (!isAbsolute(file)) return null;
  // 画面から任意のファイルを書き換えられないよう、書き出しは .csv に限る
  return extname(file).toLowerCase() === '.csv' ? file : file + '.csv';
}

/** 音声の保存先: C:\words\list.csv → C:\words\list_voice */
function audioDir(csvFile) {
  return join(dirname(csvFile), basename(csvFile, extname(csvFile)) + '_voice');
}

/** "give up" → "give_up.mp3"。ファイル名に使えない文字は _ にする */
function audioFileName(word) {
  return word.trim().replace(/[^\w.'-]+/g, '_') + '.mp3';
}

function isWeblioAudio(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && u.hostname === 'cdn.weblio.jp' && u.pathname.endsWith('.mp3');
  } catch {
    return false;
  }
}

function registerCsvHandlers() {
  ipcMain.handle('csv:default-path', () => join(app.getPath('documents'), 'pstudy_words.csv'));

  ipcMain.handle('csv:choose-path', async (event, current) => {
    if (!fromApp(event)) return null;
    const win = BrowserWindow.fromWebContents(event.sender);
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: 'CSV の保存先',
      defaultPath: typeof current === 'string' && current ? current : undefined,
      filters: [{ name: 'CSV', extensions: ['csv'] }],
    });
    return canceled ? null : filePath;
  });

  // 戻り値: { ok: true, path } | { ok: false, reason: 'invalid' | 'exists' | 'error', message }
  ipcMain.handle('csv:save', async (event, path, data, overwrite) => {
    if (!fromApp(event) || typeof path !== 'string' || !(data instanceof Uint8Array)) {
      return { ok: false, reason: 'invalid', message: '不正な呼び出しです' };
    }
    const file = csvTarget(path);
    if (!file) {
      return { ok: false, reason: 'invalid', message: '保存先は絶対パスで指定してください' };
    }
    try {
      await writeFile(file, data, { flag: overwrite ? 'w' : 'wx' });
      return { ok: true, path: file };
    } catch (err) {
      if (err.code === 'EEXIST') return { ok: false, reason: 'exists', message: file };
      if (err.code === 'ENOENT') return { ok: false, reason: 'error', message: `フォルダが存在しません: ${file}` };
      return { ok: false, reason: 'error', message: `保存に失敗しました (${err.code ?? err.message})` };
    }
  });

  // items: [{ word, url }]。Weblio に負荷をかけないよう 1 件ずつ取得し、保存済みのファイルは取り直さない
  // 戻り値: { ok: true, paths: { 単語: 絶対パス }, failed: [単語] } | { ok: false, message }
  ipcMain.handle('audio:save', async (event, csvPath, items) => {
    if (!fromApp(event) || !Array.isArray(items)) return { ok: false, message: '不正な呼び出しです' };
    const csvFile = csvTarget(csvPath);
    if (!csvFile) return { ok: false, message: '保存先は絶対パスで指定してください' };
    if (!existsSync(dirname(csvFile))) return { ok: false, message: `フォルダが存在しません: ${csvFile}` };
    const dir = audioDir(csvFile);
    try {
      await mkdir(dir, { recursive: true });
    } catch (err) {
      return { ok: false, message: `音声の保存フォルダを作れません (${err.code ?? err.message})` };
    }

    const paths = {};
    const failed = [];
    for (const { word, url } of items) {
      if (typeof word !== 'string' || !word.trim() || !isWeblioAudio(url)) {
        failed.push(String(word));
        continue;
      }
      const file = join(dir, audioFileName(word));
      try {
        if (!existsSync(file)) {
          const res = await net.fetch(url);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          await writeFile(file, Buffer.from(await res.arrayBuffer()));
        }
        paths[word] = file;
      } catch {
        failed.push(word);
      }
    }
    return { ok: true, paths, failed };
  });
}

function loadState() {
  try {
    const state = { ...DEFAULT_STATE, ...JSON.parse(readFileSync(STATE_FILE, 'utf8')) };
    // 前回の位置が今の画面外 (モニタを外した等) なら位置を捨てて中央に出す
    const visible = screen.getAllDisplays().some(({ workArea: a }) =>
      state.x >= a.x && state.y >= a.y && state.x < a.x + a.width && state.y < a.y + a.height);
    if (!visible) {
      delete state.x;
      delete state.y;
    }
    return state;
  } catch {
    return DEFAULT_STATE;
  }
}

function saveState(win) {
  const state = { ...win.getNormalBounds(), alwaysOnTop: win.isAlwaysOnTop() };
  // 終了直前に呼ばれるので同期で書く
  try {
    writeFileSync(STATE_FILE, JSON.stringify(state));
  } catch {
    // 保存できなくても次回は既定のサイズで開くだけなので無視する
  }
}

function buildMenu(win) {
  const template = [
    {
      label: '表示',
      submenu: [
        {
          label: '常に手前に表示',
          type: 'checkbox',
          checked: win.isAlwaysOnTop(),
          accelerator: 'CmdOrCtrl+T',
          click: (item) => win.setAlwaysOnTop(item.checked),
        },
        { type: 'separator' },
        { role: 'zoomIn', label: '拡大' },
        { role: 'zoomOut', label: '縮小' },
        { role: 'resetZoom', label: '元のサイズ' },
        { type: 'separator' },
        { role: 'reload', label: '再読み込み' },
        { role: 'toggleDevTools', label: '開発者ツール' },
      ],
    },
    { role: 'quit', label: '終了' },
  ];
  if (process.platform === 'darwin') template.unshift({ role: 'appMenu' });
  return Menu.buildFromTemplate(template);
}

function createWindow() {
  const state = loadState();
  const win = new BrowserWindow({
    ...state,
    minWidth: 360,
    minHeight: 400,
    title: 'P-Study 単語ファイル作成',
    autoHideMenuBar: true, // Alt キーでメニューを表示
    webPreferences: { sandbox: true, preload: join(import.meta.dirname, 'preload.cjs') },
  });
  win.setMenu(buildMenu(win));
  if (process.platform === 'darwin') Menu.setApplicationMenu(buildMenu(win));

  // 画面内のリンクはアプリ内で開かず既定のブラウザで開く
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  win.on('close', () => saveState(win));
  win.loadURL('app://local/');
}

app.whenReady().then(() => {
  if (!existsSync(join(ROOT, 'index.html'))) {
    console.error(`画面のビルドが見つかりません: ${ROOT}\n先に npx ng build を実行してください。`);
    app.exit(1);
    return;
  }
  protocol.handle('app', handleRequest);
  registerCsvHandlers();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
