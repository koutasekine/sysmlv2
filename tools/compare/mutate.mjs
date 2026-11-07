// 変異ファイルを作る(GR2 指示書 6.3 節、設計書 10 章の拒否側)。
//
// 使い方:
//   node tools/compare/mutate.mjs --out <出力先> --count <件数> [--seed <種>] [--base <基準>] <ファイル または @一覧>...
//   例: node tools/compare/mutate.mjs --out out/mutation --count 3090 --seed 20261022 --base vendor/release-2026-03 @out/files309.txt
//
// 元のファイルを、このアプリの字句解析器(src/parser/lexer.js)で字句に分け、字句を 1 つ選んで次のどちらかをする。
//   delete   その字句を消す(前後の字句がつながらないよう、空白 1 つに置き換える)
//   replace  その字句を、別の字句に置き換える(前後に空白を置く)。置き換える字句は、予約語・記号(文法の表)と、
//            名前 x・数 1・文字列 "s" の中から選ぶ
// 元のファイルは一覧の順に巡回して選び(件数が元の数より多ければ 2 周目以降に入る)、字句の位置と操作と
// 置き換える字句は、種で決まる擬似乱数(mulberry32)で選ぶ。同じ引数なら同じ結果になる。
// 出力:
//   <出力先>/files/<番号>.sysml   変異ファイル(番号は 0 から、5 桁)
//   <出力先>/list.txt             変異ファイルの一覧(照合の道具に @ で渡す)
//   <出力先>/manifest.json        各変異の元のファイル・操作・位置・元の字句・置き換えた字句

import fs from 'node:fs';
import path from 'node:path';
import table from '../../src/parser/grammar_table.js';
import { makeLexer } from '../../src/parser/lexer.js';
import { decodeUtf8 } from '../../src/parser/index.js';

const args = process.argv.slice(2);
let out = null, count = 0, seed = 20261022, base = null;
const files = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--out') out = args[++i];
  else if (args[i] === '--count') count = Number(args[++i]);
  else if (args[i] === '--seed') seed = Number(args[++i]);
  else if (args[i] === '--base') base = path.resolve(args[++i]);
  else if (args[i].startsWith('@')) files.push(...fs.readFileSync(args[i].slice(1), 'utf8').split('\n').map(s => s.trim()).filter(Boolean));
  else files.push(args[i]);
}
if (!out || !count || !files.length) {
  console.error('使い方: mutate.mjs --out <出力先> --count <件数> [--seed <種>] [--base <基準>] <ファイル または @一覧>...');
  process.exit(2);
}

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(seed);
const pick = (xs) => xs[Math.floor(rand() * xs.length)];

const lex = makeLexer({ keywords: table.keywords, symbols: table.symbols });
const vocab = [...table.keywords, ...table.symbols, 'x', '1', '"s"'];
const sources = files.map(f => {
  const abs = path.resolve(f);
  const text = decodeUtf8(fs.readFileSync(abs));
  const r = lex(text);
  if (!r.ok) throw new Error(`${f}: 字句解析に失敗 ${JSON.stringify(r.error)}`);
  return { file: base && abs.startsWith(base + path.sep) ? path.relative(base, abs) : f, text, tokens: r.tokens };
});

fs.rmSync(path.join(out, 'files'), { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'files'), { recursive: true });
const manifest = [];
const list = [];
for (let n = 0; n < count; n++) {
  const src = sources[n % sources.length];
  const k = Math.floor(rand() * src.tokens.length);
  const t = src.tokens[k];
  const op = rand() < 0.5 ? 'delete' : 'replace';
  let repl = null;
  if (op === 'replace') { do repl = pick(vocab); while (repl === t.text); }
  const text = src.text.slice(0, t.start) + (op === 'delete' ? ' ' : ` ${repl} `) + src.text.slice(t.end);
  const name = `${String(n).padStart(5, '0')}.sysml`;
  const dest = path.join(out, 'files', name);
  fs.writeFileSync(dest, text);
  list.push(dest);
  manifest.push({ id: name, source: src.file, op, token: k, offset: t.start, line: t.line, col: t.col, original: t.text, replacement: repl });
}
fs.writeFileSync(path.join(out, 'list.txt'), list.join('\n') + '\n');
fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify({ seed, count, mutations: manifest }, null, 1));
console.log(`${out}: 変異ファイル ${count} 件(種 ${seed}、元のファイル ${sources.length} 件)`);
