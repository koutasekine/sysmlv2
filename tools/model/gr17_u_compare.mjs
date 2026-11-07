// 意味エラー U5・U6 の件数を、始点を省いた遷移の始点を使う前と後(src/model/semantic.js の SEMANTIC17.U、checkSemantics の
// opts.implicitSources)で比べ、増えたものがパイロット実装の同じ制約の結果に含まれるかを確かめる(GR17 指示書 4 章の U)。
//
// 使い方:
//   node tools/model/gr17_u_compare.mjs [--list out/files309.txt] [--json 出力.json]
//
// 309 ファイルと例を対象にする。パイロット実装の結果は out/pilot/validate/files/<ファイル>.json(tests/semantic が使うもの)。
// 制約の名前(U5: validateStateUsageParallelSubactions、U6: validateTransitionUsageTriggerActions)が同じで、行が同じものを
// 「含まれる」とする。例はパイロット実装の結果がないので、増えたものはすべて書き出す。

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
const CODE = { U5: 'validateStateUsageParallelSubactions', U6: 'validateTransitionUsageTriggerActions' };
const sum = { files: 0, before: { U5: 0, U6: 0 }, after: { U5: 0, U6: 0 }, added: [], removed: [], pilot: { U5: 0, U6: 0 } };
const key = (e) => `${e.item}|${e.start}|${e.end}`;
for (const f of files) {
  const text = decodeUtf8(fs.readFileSync(f));
  const p = parse(text);
  if (!p.ok) continue;
  sum.files++;
  const model = resolveNames(p.tree, text);
  const pick = (opts) => checkSemantics(p.tree, model, text, opts).filter(e => e.item === 'U5' || e.item === 'U6');
  const b = pick({ implicitSources: false }), a = pick({ implicitSources: true });
  for (const e of b) sum.before[e.item]++;
  for (const e of a) sum.after[e.item]++;
  const pj = path.join('out/pilot/validate/files', (f.startsWith('vendor/release-2026-03/') ? f.slice('vendor/release-2026-03/'.length) : f) + '.json');
  const pilot = fs.existsSync(pj) ? JSON.parse(fs.readFileSync(pj, 'utf8')).issues : null;
  if (pilot) for (const x of pilot) for (const [k, c] of Object.entries(CODE)) if (x.code.includes(c)) sum.pilot[k]++;
  const B = new Set(b.map(key)), A = new Set(a.map(key));
  for (const e of a) if (!B.has(key(e))) {
    const inPilot = pilot ? pilot.some(x => x.code.includes(CODE[e.item]) && x.line === e.line) : null;
    sum.added.push({ file: f, item: e.item, line: e.line, col: e.col, message: e.message, inPilot });
  }
  for (const e of b) if (!A.has(key(e))) sum.removed.push({ file: f, item: e.item, line: e.line, col: e.col, message: e.message });
}
const j = opt('--json', null);
if (j) { fs.mkdirSync(path.dirname(j), { recursive: true }); fs.writeFileSync(j, JSON.stringify(sum, null, 1) + '\n'); }
console.log(`ファイル ${sum.files}。U5 ${sum.before.U5} → ${sum.after.U5}、U6 ${sum.before.U6} → ${sum.after.U6}。増えた ${sum.added.length}(パイロット実装の結果に含まれる ${sum.added.filter(x => x.inPilot).length}、含まれない ${sum.added.filter(x => x.inPilot === false).length}、パイロット実装の結果がない ${sum.added.filter(x => x.inPilot === null).length})、減った ${sum.removed.length}。パイロット実装の結果の U5 ${sum.pilot.U5}・U6 ${sum.pilot.U6}`);
for (const x of sum.added) console.log(`  増えた ${x.item} ${x.file}:${x.line}:${x.col} ${x.message}(パイロット実装 ${x.inPilot === null ? '結果なし' : x.inPilot ? 'あり' : 'なし'})`);
for (const x of sum.removed) console.log(`  減った ${x.item} ${x.file}:${x.line}:${x.col} ${x.message}`);
