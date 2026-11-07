// 最小の入力(tests/semantic/cases/)について、パイロット実装の検証の結果を、manifest.json の期待と項目ごとに比べる
// (GR5 指示書 5 章)。
//
// 使い方:
//   node tools/semantic/cases_pilot.mjs [--pilot out/pilot/validate_cases] [--json <書き出す先>]
//
// パイロット実装の結果は、PilotValidate を --base tests/semantic/cases で実行したもの。項目への振り分けは
// pilot_items.mjs による。突き合わせは、項目と範囲の始まり(行・列)で行う。
// 各入力について、両方にあるもの(both)、期待だけにあるもの(expectedOnly: パイロット実装が出さない)、
// パイロット実装だけが出したもの(pilotOnly)と、パイロット実装の構文エラーを数える。

import fs from 'node:fs';
import path from 'node:path';
import { pilotItems } from './pilot_items.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
process.chdir(ROOT);
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const pilotDir = opt('--pilot', 'out/pilot/validate_cases');
const jsonOut = opt('--json', null);
const CASES = 'tests/semantic/cases/';
const manifest = JSON.parse(fs.readFileSync(CASES + 'manifest.json', 'utf8'));

const lineCol = (text, offset) => {
  let line = 1, col = 1;
  for (let i = 0; i < offset; i++) { if (text[i] === '\n') { line++; col = 1; } else col++; }
  return { line, col };
};
const rows = [];
for (const c of manifest.cases) {
  const text = fs.readFileSync(CASES + c.file, 'utf8');
  const j = JSON.parse(fs.readFileSync(path.join(pilotDir, 'files', c.file + '.json'), 'utf8'));
  const syntax = (j.issues ?? []).filter(i => i.code === 'org.eclipse.xtext.diagnostics.Diagnostic.Syntax').map(i => i.message);
  const pilot = pilotItems(j).map(p => ({ item: p.item, ...lineCol(text, p.offset), text: text.slice(p.offset, p.offset + p.length) }));
  const key = (x) => `${x.item}@${x.line}:${x.col}`;
  const pk = new Set(pilot.map(key)), ek = new Set(c.expect.map(key));
  rows.push({
    file: c.file, kind: c.kind, pending: c.pending ?? null, exception: j.exception, syntax,
    both: c.expect.filter(e => pk.has(key(e))),
    expectedOnly: c.expect.filter(e => !pk.has(key(e))),
    pilotOnly: pilot.filter(p => !ek.has(key(p))),
  });
}
const fmt = (xs) => xs.map(x => `${x.item} ${x.line}:${x.col} ${JSON.stringify(x.text.length > 30 ? x.text.slice(0, 30) + '…' : x.text)}`).join('、') || '—';
console.log('| 入力 | 種類 | 両方 | 期待だけ(パイロット実装は出さない) | パイロット実装だけ | パイロット実装の構文エラー |');
console.log('|---|---|---|---|---|---|');
for (const r of rows) console.log(`| \`${r.file}\` | ${r.kind}${r.pending ? `(${r.pending})` : ''} | ${fmt(r.both)} | ${fmt(r.expectedOnly)} | ${fmt(r.pilotOnly)} | ${r.syntax.length ? r.syntax.length + ' 件' : '—'} |`);
if (jsonOut) { fs.mkdirSync(path.dirname(jsonOut), { recursive: true }); fs.writeFileSync(jsonOut, JSON.stringify(rows, null, 1) + '\n'); }
