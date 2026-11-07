// パイロット実装との照合(GR2 指示書 6.2 節): 受理・拒否と、種類と名前の木を比べる。
//
// 使い方:
//   node tools/compare/compare.mjs --pilot <パイロット実装の結果のフォルダ> --base <基準のフォルダ> --out <出力先> <ファイル または @一覧>...
//   例: node tools/compare/compare.mjs --pilot out/pilot/files309 --base vendor/release-2026-03 --out out/compare/files309 @out/files309.txt
//
// パイロット実装の結果は tools/pilot-runner の出力(<フォルダ>/files/<基準からの相対パス>.json)。
// 出力:
//   <出力先>/files/<相対パス>.json   このアプリの結果(受理・拒否、エラー、木、曖昧さなど)と、パイロット実装との比較
//   <出力先>/summary.json           全体の要約
// 受理・拒否は構文エラーの有無だけで判定する(設計書 10 章)。木は受理が両方のときだけ比べる。
// 木の比べ方は GR2 P2 の D5 の裁定(案 B)による: 式の部分木は種類だけを比べる(tree_format.mjs の collapseExpressions)。
// --full を付けると、式の中まで比べる(参考)。
// 食い違いの分類は classify.mjs(--classify を付けたとき、各ファイルの結果と要約に入れる)。

import fs from 'node:fs';
import path from 'node:path';
import { createParser, decodeUtf8 } from '../../src/parser/index.js';
import { toPilotFormat, firstDiff, collapseExpressions } from './tree_format.mjs';
import { classifyTree } from './classify.mjs';

const args = process.argv.slice(2);
let pilotDir = null, base = null, out = null, full = false, classify = false;
const files = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--pilot') pilotDir = args[++i];
  else if (args[i] === '--base') base = path.resolve(args[++i]);
  else if (args[i] === '--out') out = args[++i];
  else if (args[i] === '--full') full = true;
  else if (args[i] === '--classify') classify = true;
  else if (args[i].startsWith('@')) files.push(...fs.readFileSync(args[i].slice(1), 'utf8').split('\n').map(s => s.trim()).filter(Boolean));
  else files.push(args[i]);
}
if (!out || !files.length) {
  console.error('使い方: compare.mjs --pilot <フォルダ> --base <基準> --out <出力先> <ファイル または @一覧>...');
  process.exit(2);
}

const t0 = performance.now();
const parser = createParser();
const setupMs = performance.now() - t0;
const rows = [];
let parseMsTotal = 0;
for (const f of files) {
  const abs = path.resolve(f);
  const rel = base && abs.startsWith(base + path.sep) ? path.relative(base, abs) : path.basename(abs);
  const row = { file: rel };
  let r;
  const s = performance.now();
  try {
    const text = decodeUtf8(fs.readFileSync(abs));
    r = parser.parse(text);
  } catch (e) {
    r = { ok: false, tree: null, errors: [{ kind: e instanceof TypeError ? 'encoding' : 'internal', message: String(e && e.stack || e) }], ambiguities: [], resolutions: {}, droppedElements: [] };
  }
  const ms = performance.now() - s;
  parseMsTotal += ms;
  row.ms = Math.round(ms * 10) / 10;
  row.ours = r.ok ? 'accept' : 'reject';
  row.errors = r.errors;
  row.ambiguities = r.ambiguities.length;
  row.resolutions = r.resolutions;
  row.droppedElements = r.droppedElements.length;
  const tree = r.tree ? toPilotFormat(r.tree) : null;
  const cmpTree = tree && !full ? collapseExpressions(tree) : tree;
  if (pilotDir) {
    const pf = path.join(pilotDir, 'files', rel + '.json');
    if (fs.existsSync(pf)) {
      const pj = JSON.parse(fs.readFileSync(pf, 'utf8'));
      row.pilot = pj.exception ? 'exception' : pj.syntaxErrors.length === 0 ? 'accept' : 'reject';
      row.pilotErrors = pj.syntaxErrors;
      row.acceptMatch = row.ours === row.pilot;
      if (row.ours === 'accept' && row.pilot === 'accept') {
        const pt = full ? pj.tree[0] : collapseExpressions(pj.tree[0]);
        const d = firstDiff(cmpTree, pt);
        row.treeMatch = d === null;
        if (d) row.treeDiff = d;
        if (d && classify) row.diffClasses = classifyTree(cmpTree, pt, firstDiff);
      }
    } else row.pilot = 'missing';
  }
  const dest = path.join(out, 'files', rel + '.json');
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, JSON.stringify({ ...row, ambiguities: r.ambiguities, droppedElements: r.droppedElements, tree }));
  rows.push(row);
}
const count = (f) => rows.filter(f).length;
const summary = {
  files: rows.length,
  accepted: count(r => r.ours === 'accept'),
  rejected: count(r => r.ours === 'reject'),
  acceptMatch: count(r => r.acceptMatch),
  bothAccepted: count(r => r.ours === 'accept' && r.pilot === 'accept'),
  treeMatch: count(r => r.treeMatch === true),
  withAmbiguities: count(r => r.ambiguities > 0),
  classified: count(r => r.diffClasses && !r.diffClasses.unclassified),
  unclassified: count(r => r.diffClasses?.unclassified),
  diffClasses: rows.reduce((a, r) => { for (const [k, v] of Object.entries(r.diffClasses?.classes ?? {})) { a[k] ??= { count: 0, files: 0 }; a[k].count += v; a[k].files++; } return a; }, {}),
  resolutions: rows.reduce((a, r) => { for (const [k, v] of Object.entries(r.resolutions ?? {})) a[k] = (a[k] ?? 0) + v; return a; }, {}),
  withDroppedElements: count(r => r.droppedElements > 0),
  setupMs: Math.round(setupMs),
  parseMsTotal: Math.round(parseMsTotal),
  slowest: rows.reduce((a, b) => (b.ms > (a?.ms ?? -1) ? b : a), null),
  results: rows,
};
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'summary.json'), JSON.stringify(summary, null, 1));
console.log(`files=${summary.files} accepted=${summary.accepted} rejected=${summary.rejected} acceptMatch=${summary.acceptMatch} ` +
  `bothAccepted=${summary.bothAccepted} treeMatch=${summary.treeMatch} withAmbiguities=${summary.withAmbiguities} ` +
  `resolutions=${JSON.stringify(summary.resolutions)} classified=${summary.classified} unclassified=${summary.unclassified} ` +
  `setupMs=${summary.setupMs} parseMsTotal=${summary.parseMsTotal} slowest=${summary.slowest?.file}(${summary.slowest?.ms}ms)`);
