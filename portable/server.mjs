// P-Study 単語ファイル作成アプリの起動用サーバ (Node.js 18 以上、追加パッケージ不要)
// - ビルド済みの画面 (./app) を配信する
// - /weblio/<単語> を https://ejje.weblio.jp/content/<単語> に中継する (ブラウザの CORS 制限を回避するため)
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.PORT ?? 4321);
const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), 'app');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

async function proxyWeblio(req, res) {
  const word = req.url.slice('/weblio/'.length);
  try {
    const upstream = await fetch(`https://ejje.weblio.jp/content/${word}`, {
      headers: { 'User-Agent': req.headers['user-agent'] ?? 'Mozilla/5.0' },
    });
    const body = await upstream.text();
    res.writeHead(upstream.status, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(body);
  } catch (err) {
    console.error('Weblio への接続に失敗:', err.message);
    res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Bad Gateway');
  }
}

async function serveStatic(req, res) {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  // ROOT の外を読ませない
  const file = normalize(join(ROOT, pathname === '/' ? 'index.html' : pathname));
  if (!file.startsWith(ROOT)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(data);
  } catch {
    // 不明なパスは画面本体を返す (Angular のルーティング用)
    const index = await readFile(join(ROOT, 'index.html'));
    res.writeHead(200, { 'Content-Type': MIME['.html'] });
    res.end(index);
  }
}

http
  .createServer((req, res) => {
    if (req.url.startsWith('/weblio/')) return proxyWeblio(req, res);
    return serveStatic(req, res);
  })
  .listen(PORT, '127.0.0.1', () => {
    console.log(`起動しました: http://localhost:${PORT}`);
    console.log('終了するにはこのウィンドウを閉じるか Ctrl+C を押してください。');
  });
