// package.json と package-lock.json の version のマイナー番号を 1 上げる
// 例: 0.6.0-beta.1 → 0.7.0-beta.1（パッチは 0 に戻し、-beta.N などはそのまま残す）
// npm run build の前 (prebuild) に自動で実行される
import { readFileSync, writeFileSync } from 'node:fs';

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const writeJson = (path, data) => writeFileSync(path, JSON.stringify(data, null, 2) + '\n');

const pkg = readJson('package.json');
const m = /^(\d+)\.(\d+)\.(\d+)(-.+)?$/.exec(pkg.version);
if (!m) {
  console.error(`version の形式が想定外です: ${pkg.version}`);
  process.exit(1);
}
const next = `${m[1]}.${Number(m[2]) + 1}.0${m[4] ?? ''}`;

pkg.version = next;
writeJson('package.json', pkg);

const lock = readJson('package-lock.json');
lock.version = next;
lock.packages[''].version = next;
writeJson('package-lock.json', lock);

console.log(`バージョンを上げました: ${m[0]} → ${next}`);
