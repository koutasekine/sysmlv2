// D3 の印の付いた参照について、「通り越した名前空間が暗黙に特殊化するライブラリの型のメンバーに、その名前があるか」を
// パイロット実装で数えるための問い合わせを作る(GR3 P5。オーナーの裁定 2026-10-22)。
//
// 使い方:
//   node tools/model/d3_queries.mjs [--list out/files309.txt] [--out out/model/d3_queries.tsv]
//   → tools/pilot-runner/src/PilotLibraryNames.java に渡す
//
// 1 行が 1 つの問い合わせ(タブ区切り): 参照の番号、ファイル(vendor/release-2026-03 からの相対)、名前空間の範囲の始まり・終わり、
// 名前空間の種類、探していた名前(参照の最初の区切り)。通り越した名前空間のうち、理由が inherit(暗黙の特殊化)のものだけを問う。
// 理由が import・filter だけの参照は、問い合わせを作らず、集計で別に数える。

import fs from 'node:fs';
import path from 'node:path';
import { parse, decodeUtf8 } from '../../src/parser/index.js';
import { resolveNames } from '../../src/model/index.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
process.chdir(ROOT);
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const files = fs.readFileSync(opt('--list', 'out/files309.txt'), 'utf8').split('\n').filter(Boolean);
const outPath = opt('--out', 'out/model/d3_queries.tsv');
const BASE = 'vendor/release-2026-03/';

const lines = [];
const sum = { refs: 0, inheritRefs: 0, importOrFilterOnly: 0, queries: 0 };
let id = 0;
for (const f of files) {
  const text = decodeUtf8(fs.readFileSync(f));
  const p = parse(text);
  if (!p.ok) continue;
  const rel = f.startsWith(BASE) ? f.slice(BASE.length) : f;
  const model = resolveNames(p.tree, text);
  for (const r of model.refs) {
    if (r.status !== 'resolved' || !r.shadow) continue;
    sum.refs++;
    const ns = r.shadow.filter(s => s.why === 'inherit' && !s.ns.builtin && !s.ns.virtual);
    const refId = id++;
    if (!ns.length) { sum.importOrFilterOnly++; lines.push([refId, rel, -1, -1, '-', r.segments[0]?.name ?? ''].join('\t')); continue; }
    sum.inheritRefs++;
    for (const s of ns) {
      const name = r.segments[0]?.name ?? '';
      if (/[\t\n]/.test(name) || /[\t\n]/.test(rel)) throw new Error(`タブか改行を含む: ${rel} ${name}`);
      lines.push([refId, rel, s.ns.start, s.ns.end, s.ns.kind, name].join('\t'));
      sum.queries++;
    }
  }
}
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, lines.join('\n') + '\n');
console.log(`D3 の印の付いた参照 ${sum.refs}(inherit を含む ${sum.inheritRefs}、import・filter だけ ${sum.importOrFilterOnly})、問い合わせ ${sum.queries} → ${outPath}`);
