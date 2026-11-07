// 変異ファイルの受理・拒否の食い違いの分類(GR2 指示書 6.3 節)。
//
// 使い方:
//   node tools/compare/classify_mutation.mjs --mutation <変異の出力先> --compare <変異の照合の出力先>
//   例: node tools/compare/classify_mutation.mjs --mutation out/mutation --compare out/compare/mutation
//
// 受理・拒否が食い違った変異ファイルを、既知の差に分類する(分類の仕方と差の種類は variants.mjs)。
// 結果は <変異の照合の出力先>/mismatch.json に書き、要約を標準出力に書く。

import fs from 'node:fs';
import path from 'node:path';
import { makeVariants, classifyAccept } from './variants.mjs';

const args = process.argv.slice(2);
const opt = {};
for (let i = 0; i < args.length; i += 2) opt[args[i].replace(/^--/, '')] = args[i + 1];
if (!opt.mutation || !opt.compare) {
  console.error('使い方: classify_mutation.mjs --mutation <変異の出力先> --compare <変異の照合の出力先>');
  process.exit(2);
}

const VARIANTS = makeVariants();

const manifest = new Map(JSON.parse(fs.readFileSync(path.join(opt.mutation, 'manifest.json'), 'utf8')).mutations.map(m => [m.id, m]));
const summary = JSON.parse(fs.readFileSync(path.join(opt.compare, 'summary.json'), 'utf8'));

const rows = [];
const counts = {};
for (const r of summary.results) {
  if (r.acceptMatch) continue;
  const m = manifest.get(r.file);
  const text = fs.readFileSync(path.join(opt.mutation, 'files', r.file), 'utf8');
  const row = { file: r.file, source: m.source, op: m.op, original: m.original, replacement: m.replacement, line: m.line, col: m.col,
    ours: r.ours, pilot: r.pilot, ourError: r.errors[0]?.message, pilotError: r.pilotErrors?.[0]?.message, class: 'unclassified' };
  row.class = classifyAccept(VARIANTS, text, r.pilot);
  counts[row.class] = (counts[row.class] ?? 0) + 1;
  rows.push(row);
}
fs.writeFileSync(path.join(opt.compare, 'mismatch.json'), JSON.stringify({ counts, rows }, null, 1));
console.log(`食い違い ${rows.length} 件: ${JSON.stringify(counts)}`);
for (const r of rows.filter(x => x.class === 'unclassified')) console.log('  分類できない:', r.file, r.source, `${r.line}:${r.col}`, r.op, JSON.stringify(r.original), '->', JSON.stringify(r.replacement), r.ours, r.pilot);
