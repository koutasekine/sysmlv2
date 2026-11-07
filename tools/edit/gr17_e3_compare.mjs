// GR17 の E3(設計書 8 章 v17.2 の名前の変更の書き換える箇所)の前と後を、操作ごとに比べる道具。Node.js で実行する。
//
// 使い方:
//   node tools/edit/gr17_e3_compare.mjs --a <src のフォルダ> --b <src のフォルダ> [--a-e3 on|off] [--b-e3 on|off]
//        [--interval 30] [--json <出力>]
//
//   2 つの src(たとえば a55b9c3 の src の複製と、今の src)で、tests/edit/run.mjs の E2(例の、名前を宣言したすべての要素)と
//   E3(309 ファイルの、名前を宣言した要素を記述の順に --interval 個ごとに選んだもの)と同じ操作(引用符の要らない名前と要る名前の
//   2 通り)を行い、結果(変えた・拒否・戻した、理由の分類、書き換えた後のテキスト、書き換えた区切りの数)を比べる。
//   --a-e3・--b-e3 は、それぞれの src の EDIT17.E3 を変える(その src が EDIT17.E3 を持つときだけ)。
//   索引(LIBRARY_INDEX)は、それぞれの src の定数のまま(索引を入れて比べるときは、定数を変えた src の複製を渡す)。
//   出力: 結果が違う操作の件数と分類、書き換えた区切りが増えた操作の一覧

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
process.chdir(ROOT);
const arg = (k, d) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : d);
const INTERVAL = Number(arg('--interval', 30));
const load = async (dir, e3) => {
  const m = await import(pathToFileURL(path.resolve(dir, 'edit/index.js')).href);
  const p = await import(pathToFileURL(path.resolve(dir, 'parser/index.js')).href);
  if (e3 && m.EDIT17 && 'E3' in m.EDIT17) m.EDIT17.E3 = e3 === 'on';
  return { ...m, decodeUtf8: p.decodeUtf8, e3: m.EDIT17?.E3 ?? null };
};
const A = await load(arg('--a'), arg('--a-e3'));
const B = await load(arg('--b'), arg('--b-e3'));
const named = (tree) => { const out = []; (function w(e) { if ((e.name !== undefined || e.shortName !== undefined) && e.end > e.start) out.push(e); e.owned.forEach(w); e.related.forEach(w); })(tree); return out; };
const lineOf = (text, at) => text.slice(0, at).split(/\r\n|\r|\n/).length;

function run(M, file, text, every) {
  const a = M.analyze(text);
  if (!a.ok) return [];
  const els = named(a.tree).filter((_, i) => every || i % INTERVAL === 0);
  const out = [];
  els.forEach((el, i) => {
    const which = el.name !== undefined ? 'name' : 'shortName';
    for (const to of [`gr15_n${i}`, `名前 ${i}`]) {
      const r = M.renameElement({ text, analysis: a, element: el, which, newName: to });
      out.push({ file, line: lineOf(text, el.start), el: el[which], to, res: r.ok ? 'ok' : r.reverted ? 'reverted' : 'rejected', code: r.code ?? null, text: r.ok ? r.text : null, edits: r.ok ? r.edits.length : null });
    }
  });
  return out;
}

const files = [['src/app/sample.sysml', true], ...fs.readFileSync('out/files309.txt', 'utf8').split('\n').filter(Boolean).map(f => [f, false])];
const sum = { ops: 0, same: 0, diff: 0, byChange: {}, a: { ok: 0, rejected: 0, reverted: 0 }, b: { ok: 0, rejected: 0, reverted: 0 }, moreEdits: [], otherDiffs: [] };
for (const [f, every] of files) {
  const text = A.decodeUtf8(fs.readFileSync(f));
  const ra = run(A, f, text, every), rb = run(B, f, text, every);
  if (ra.length !== rb.length) { sum.otherDiffs.push({ file: f, why: `操作の数が違う ${ra.length} ${rb.length}` }); continue; }
  ra.forEach((x, i) => {
    const y = rb[i];
    sum.ops++; sum.a[x.res]++; sum.b[y.res]++;
    if (x.res === y.res && x.code === y.code && x.text === y.text) { sum.same++; return; }
    sum.diff++;
    const k = `${x.res}${x.code ? ':' + x.code : ''} → ${y.res}${y.code ? ':' + y.code : ''}`;
    sum.byChange[k] = (sum.byChange[k] ?? 0) + 1;
    const row = { file: f, line: x.line, el: x.el, to: x.to, a: `${x.res} ${x.code ?? ''}`, b: `${y.res} ${y.code ?? ''}`, editsA: x.edits, editsB: y.edits };
    if (x.res === 'ok' && y.res === 'ok' && y.edits > x.edits) sum.moreEdits.push(row); else sum.otherDiffs.push(row);
  });
}
console.log(`a: ${arg('--a')}(EDIT17.E3 = ${A.e3})、b: ${arg('--b')}(EDIT17.E3 = ${B.e3})、間隔 ${INTERVAL}`);
console.log(`操作 ${sum.ops}、同じ ${sum.same}、違う ${sum.diff} ${JSON.stringify(sum.byChange)}`);
console.log(`a: ${JSON.stringify(sum.a)}、b: ${JSON.stringify(sum.b)}`);
console.log(`書き換えた区切りが増えた操作 ${sum.moreEdits.length}、そのほかの違い ${sum.otherDiffs.length}`);
for (const x of [...sum.moreEdits, ...sum.otherDiffs].slice(0, 30)) console.log(`  ${x.file} ${x.line ?? ''} 行 ${x.el ?? ''} → ${x.to ?? ''}: ${x.a ?? ''} → ${x.b ?? ''}(書き換えた箇所 ${x.editsA ?? '-'} → ${x.editsB ?? '-'})${x.why ?? ''}`);
if (arg('--json')) { fs.mkdirSync(path.dirname(arg('--json')), { recursive: true }); fs.writeFileSync(arg('--json'), JSON.stringify(sum, null, 1) + '\n'); }
