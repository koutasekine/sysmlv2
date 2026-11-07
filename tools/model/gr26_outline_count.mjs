// モデルツリー(src/app/outline.js の buildOutline)の項目を数える道具(GR26 の P5 の T。指示書 3.6 節)。
//   - 名前が「(名前なし)」としか出ない項目の、種類ごとの数(要約を足すかを決めるため)
//   - 並べなくした要素(送信・受信・代入の行動の名前のない引数 arg、式を値に持つだけの名前のない特徴 value)の、理由と種類ごとの数
//   - 名前のない要素の要約の頭の語(「遷移」「送信」など)ごとの数
// 使い方:
//   node tools/model/gr26_outline_count.mjs <フォルダ>      フォルダの .sysml をまとめて 1 つのモデルとして数える
//   node tools/model/gr26_outline_count.mjs --examples      公式の例題(vendor の 309 ファイル)を 1 ファイルずつ数えて合計する
//   node tools/model/gr26_outline_count.mjs --samples       「例を読み込む」の 2 つの例(src/app/sample.sysml・sample_intro.sysml)を 1 つずつ数えて合計する
// 結果は JSON で標準出力に出す(ファイルは書かない)

import fs from 'node:fs';
import path from 'node:path';
import { analyzeFiles, sortPaths } from '../../src/model/files.js';
import { prepareFromAnalysis } from '../../src/app/prepare.js';
import { buildOutline } from '../../src/app/outline.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');

function listSysml(dir) {
  const out = [];
  (function walk(d) {
    for (const n of fs.readdirSync(d)) {
      if (n.startsWith('.')) continue;
      const p = path.join(d, n);
      if (fs.statSync(p).isDirectory()) walk(p); else if (n.endsWith('.sysml')) out.push(path.relative(dir, p).split(path.sep).join('/'));
    }
  })(dir);
  return sortPaths(out);
}

const add = (o, k, n = 1) => { o[k] = (o[k] ?? 0) + n; };
export function countFiles(files, t) {
  const a = analyzeFiles(files);
  t.inputs++;
  if (!a.anyOk) { t.failed++; return; }
  const dropped = {};
  const o = buildOutline(prepareFromAnalysis(a), a.single ? null : a, { dropped });
  t.items += o.items.length;
  for (const it of o.items) {
    if (it.named) continue;
    if (it.name === '(名前なし)') add(t.unnamedPlain, it.kind);
    else add(t.summaryHead, it.name.split(' ')[0]);
  }
  for (const [k, v] of Object.entries(dropped)) add(t.dropped, k, v);
}

const MAIN = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (MAIN) {
  const args = process.argv.slice(2);
  const t = { inputs: 0, failed: 0, items: 0, unnamedPlain: {}, summaryHead: {}, dropped: {} };
  if (args.includes('--examples')) {
    for (const d of ['vendor/release-2026-03/sysml/src', 'vendor/release-2026-03/sysml.library'].map((x) => path.join(ROOT, x))) {
      if (!fs.existsSync(d)) { console.error(`${d} がない(tools/fetch.sh で取得する)`); process.exit(2); }
      for (const p of listSysml(d)) countFiles([{ path: p, text: fs.readFileSync(path.join(d, p), 'utf8') }], t);
    }
  } else if (args.includes('--samples')) {
    for (const p of ['src/app/sample.sysml', 'src/app/sample_intro.sysml']) countFiles([{ path: path.basename(p), text: fs.readFileSync(path.join(ROOT, p), 'utf8') }], t);
  } else {
    const dir = args.find((x) => !x.startsWith('--'));
    if (!dir) { console.error('使い方: node tools/model/gr26_outline_count.mjs <フォルダ> | --examples | --samples'); process.exit(2); }
    countFiles(listSysml(dir).map((p) => ({ path: p, text: fs.readFileSync(path.join(dir, p), 'utf8') })), t);
  }
  const sorted = (o) => Object.fromEntries(Object.entries(o).sort((x, y) => y[1] - x[1]));
  console.log(JSON.stringify({ ...t, unnamedPlain: sorted(t.unnamedPlain), summaryHead: sorted(t.summaryHead), dropped: sorted(t.dropped) }, null, 1));
}
