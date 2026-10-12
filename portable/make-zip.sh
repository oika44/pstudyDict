#!/bin/sh
# 本番ビルドして、別マシンに持っていける zip (release/pstudy-dict.zip) を作る
set -e
cd "$(dirname "$0")/.."

npx ng build

rm -rf release
mkdir -p release/pstudy-dict
cp portable/server.mjs portable/start.bat portable/start.sh portable/README.txt release/pstudy-dict/
cp -r dist/pstudy-dict/browser release/pstudy-dict/app

(cd release && zip -qr pstudy-dict.zip pstudy-dict)
echo "作成しました: $(pwd)/release/pstudy-dict.zip"
