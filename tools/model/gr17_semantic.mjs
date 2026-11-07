// 309 ファイルと例の意味エラーを、標準ライブラリの索引を入れたときと切ったときで比べる(GR17 指示書 4 章の L の (3))。
//
// 使い方:
//   node tools/model/gr17_semantic.mjs [--list out/files309.txt] [--json 出力.json]
//
// ファイルごとに、名前解決を索引あり(opts.libraryIndex: true)となしで行い、src/model/semantic.js の checkSemantics の結果を
// (項目・範囲・文)で比べる。増えたもの・減ったものを一覧にする(パイロット実装の結果に含まれるかは、tools/semantic/compare.mjs の
// 照合で確かめる)。

import fs from 'node:fs';
import path from 'node:path';
import { parse, decodeUtf8 } from '../../src/parser/index.js';
import { resolveNames } from '../../src/model/resolve.js';
import { checkSemantics } from '../../src/model/semantic.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
process.chdir(ROOT);
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const files = [...fs.readFileSync(opt('--list', 'out/files309.txt'), 'utf8').split('\n').filter(Boolean), 'src/app/sample.sysml'];
const sum = { files: 0, off: {}, on: {}, added: [], removed: [] };
const key = (e) => `${e.item}|${e.start}|${e.end}|${e.message}`;
for (const f of files) {
  const text = decodeUtf8(fs.readFileSync(f));
  const p = parse(text);
  if (!p.ok) continue;
  sum.files++;
  const off = checkSemantics(p.tree, resolveNames(p.tree, text, { libraryIndex: false }), text);
  const on = checkSemantics(p.tree, resolveNames(p.tree, text, { libraryIndex: true }), text);
  for (const e of off) sum.off[e.item] = (sum.off[e.item] ?? 0) + 1;
  for (const e of on) sum.on[e.item] = (sum.on[e.item] ?? 0) + 1;
  const A = new Set(off.map(key)), B = new Set(on.map(key));
  for (const e of on) if (!A.has(key(e))) sum.added.push({ file: f, item: e.item, line: e.line, col: e.col, message: e.message });
  for (const e of off) if (!B.has(key(e))) sum.removed.push({ file: f, item: e.item, line: e.line, col: e.col, message: e.message });
}
const j = opt('--json', null);
if (j) { fs.mkdirSync(path.dirname(j), { recursive: true }); fs.writeFileSync(j, JSON.stringify(sum, null, 1) + '\n'); }
console.log(`ファイル ${sum.files}。意味エラー 索引なし ${JSON.stringify(sum.off)}、索引あり ${JSON.stringify(sum.on)}。増えた ${sum.added.length}、減った ${sum.removed.length}`);
for (const e of sum.added.slice(0, 30)) console.log(`  増えた ${e.item} ${e.file}:${e.line}:${e.col} ${e.message}`);
for (const e of sum.removed.slice(0, 30)) console.log(`  減った ${e.item} ${e.file}:${e.line}:${e.col} ${e.message}`);
