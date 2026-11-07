// 進捗バーを確かめるための大きなテキストを作る(GR4 P3 の裁定 Q25 の 3。P5 のブラウザの確認表で使う)。
//
// 使い方:
//   node tools/view/make_big.mjs [バイト数]    # → out/view/big.sysml(既定 1,048,576 バイト以上)
//
// 309 ファイルのうち、このアプリが受理するもの(out/files309.txt の順)を、改行をはさんでつなぎ、指定のバイト数を
// 超えたところで止める。つないだテキストが構文上正しいこと(このアプリで解析できること)を確かめ、解析の時間を出す。
// 公式の例題と標準ライブラリのファイルをつなぐので、出力は作業ツリーの out/(git の管理外)にだけ置く。

import fs from 'node:fs';
import path from 'node:path';
import { parse, decodeUtf8 } from '../../src/parser/index.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
process.chdir(ROOT);
const want = Number(process.argv[2] ?? 1048576);
const files = fs.readFileSync('out/files309.txt', 'utf8').split('\n').filter(Boolean);
const parts = [];
let bytes = 0;
for (const f of files) {
  const t = decodeUtf8(fs.readFileSync(f)).replace(/^﻿/, '');
  if (!parse(t).ok) continue;
  parts.push(`// ---- ${f}\n${t}\n`);
  bytes += Buffer.byteLength(parts[parts.length - 1]);
  if (bytes >= want) break;
}
const text = parts.join('');
const t0 = performance.now();
const r = parse(text);
const ms = performance.now() - t0;
fs.mkdirSync('out/view', { recursive: true });
fs.writeFileSync('out/view/big.sysml', text);
console.log(`out/view/big.sysml: ${Buffer.byteLength(text)} バイト、${parts.length} ファイル、${text.split('\n').length} 行、構文上正しい: ${r.ok ? 'はい' : 'いいえ'}、Node.js での解析 ${Math.round(ms)} ms`);
if (!r.ok) { console.log(r.errors[0]); process.exitCode = 1; }
