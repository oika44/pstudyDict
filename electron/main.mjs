// P-Study 単語ファイル作成アプリをデスクトップの小窓 (ウィジェット) として起動する Electron のエントリ
// - ビルド済みの画面 (dist/pstudy-dict/browser) を独自スキーム app://local/ で配信する
// - app://local/weblio/<単語> を https://ejje.weblio.jp/content/<単語> に中継する (CORS 回避。server.mjs と同じ役割)
import { app, BrowserWindow, Menu, net, protocol, screen, shell } from 'electron';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, normalize, sep } from 'node:path';
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
    webPreferences: { sandbox: true },
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
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
