// tools/model/d3_queries.mjs の問い合わせと、PilotLibraryNames の答えから、参照ごとに集計する(GR3 P5)。
//
// 使い方:
//   node tools/model/d3_summary.mjs [--queries out/model/d3_queries.tsv] [--answers out/model/d3_answers.tsv] [--out out/model/d3_summary.json]
//
// 参照ごとの分類:
//   library-has-name  通り越した名前空間のどれかで、ライブラリの型のメンバーに名前がある
//   library-no-name   どの名前空間でも名前がない(すべての名前空間をパイロット実装の要素に対応づけられた)
//   partly-unknown    名前がある名前空間はなく、対応づけられない名前空間がある
//   import-filter-only 通り越した名前空間の理由が import・filter だけ(暗黙の特殊化を通り越していない)

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
process.chdir(ROOT);
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const Q = fs.readFileSync(opt('--queries', 'out/model/d3_queries.tsv'), 'utf8').split('\n').filter(Boolean).map(l => l.split('\t'));
const A = fs.readFileSync(opt('--answers', 'out/model/d3_answers.tsv'), 'utf8').split('\n').filter(Boolean).map(l => l.split('\t'));
if (Q.length !== A.length) throw new Error(`問い合わせ ${Q.length} 行と答え ${A.length} 行の数が違う`);
// 答えは、問い合わせをファイルごとにまとめた順に並ぶので、参照の番号と順で突き合わせる
const byRef = new Map();
const qByRef = new Map();
for (const q of Q) { if (!qByRef.has(q[0])) qByRef.set(q[0], []); qByRef.get(q[0]).push(q); }
for (const a of A) { if (!byRef.has(a[0])) byRef.set(a[0], []); byRef.get(a[0]).push(a); }
const sum = { refs: 0, classes: {}, noElementKinds: {}, examples: {} };
for (const [id, qs] of qByRef) {
  const as = byRef.get(id) ?? [];
  if (as.length !== qs.length) throw new Error(`参照 ${id} の答えの数が違う`);
  sum.refs++;
  let c;
  if (as.some(a => a[1] === 'skip')) c = 'import-filter-only';
  else if (as.some(a => a[1] === 'yes')) c = 'library-has-name';
  else if (as.some(a => a[1] === 'no-element')) c = 'partly-unknown';
  else c = 'library-no-name';
  sum.classes[c] = (sum.classes[c] ?? 0) + 1;
  // 答えは問い合わせとファイル内で同じ順なので、同じ添字の問い合わせの種類を数える
  as.forEach((a, i) => { if (a[1] === 'no-element') sum.noElementKinds[qs[i][4]] = (sum.noElementKinds[qs[i][4]] ?? 0) + 1; });
  sum.examples[c] ??= [];
  if (sum.examples[c].length < 5) sum.examples[c].push({ file: qs[0][1], name: qs[0][5], namespaces: qs.map((q, i) => ({ kind: q[4], start: +q[2], answer: as[i][1], libraryType: as[i][2] || null })) });
}
fs.writeFileSync(opt('--out', 'out/model/d3_summary.json'), JSON.stringify(sum, null, 1) + '\n');
console.log(`参照 ${sum.refs}: ${JSON.stringify(sum.classes)}`);
console.log(`対応づけられない名前空間の種類: ${JSON.stringify(sum.noElementKinds)}`);
for (const e of sum.examples['library-has-name'] ?? []) console.log(`  名前がある例: ${e.file} 「${e.name}」 ${JSON.stringify(e.namespaces)}`);
