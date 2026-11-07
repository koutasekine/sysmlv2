// GR18 P0・P4: 深い入れ子と長い式(指示書 2.5 節の B1)の入力を作り、解析・名前解決・意味エラーの検査・描画のどこで
// 「Maximum call stack size exceeded」になるかを調べる道具。
// 使い方: node tools/model/gr18_deep.mjs [--sizes 150,154,137,85]、node tools/model/gr18_deep.mjs --frames、node --stack-size=400 tools/model/gr18_deep.mjs --check parse|all
//   入力の形: expr(1 + 1 + … の項 n 個)、paren(括弧 n 段)、package(package の入れ子 n 段)、part(part の入れ子 n 段)
import { parse } from '../../src/parser/index.js';
import { resolveNames } from '../../src/model/index.js';
import { checkSemantics } from '../../src/model/semantic.js';
import { prepareView, renderInterconnection, renderGeneral, renderStateTransition, renderActionFlow, renderSequence, renderTables } from '../../src/view/index.js';
export const deepInputs = {
  expr: (n) => `attribute x = ${Array(n).fill('1').join(' + ')};`,
  paren: (n) => `attribute x = ${'('.repeat(n)}1${')'.repeat(n)};`,
  package: (n) => `${Array.from({ length: n }, (_, i) => `package P${i} {`).join(' ')} part def A; ${'}'.repeat(n)}`,
  part: (n) => `${Array.from({ length: n }, (_, i) => `part p${i} {`).join(' ')} port q; ${'}'.repeat(n)}`,
};
const stage = (f) => { try { f(); return 'ok'; } catch (e) { return `${e.constructor.name}: ${e.message}`.slice(0, 80) + (e.stack ? ` @ ${(/at (\S+) /.exec(e.stack.split('\n').slice(1).join('\n')) ?? [])[1]}` : ''); } };
export function tryDeep(kind, n) {
  const text = deepInputs[kind](n);
  const out = { kind, n };
  let p, model, prepared;
  out.parse = stage(() => { p = parse(text); if (!p.ok) throw new Error('構文エラー ' + JSON.stringify(p.errors[0]).slice(0, 60)); });
  if (out.parse !== 'ok') return out;
  out.resolve = stage(() => { model = resolveNames(p.tree, text); });
  if (out.resolve !== 'ok') return out;
  out.semantic = stage(() => checkSemantics(p.tree, model, text));
  out.prepare = stage(() => { prepared = prepareView(text); });
  if (out.prepare !== 'ok') return out;
  for (const [v, f] of Object.entries({ interconnection: renderInterconnection, general: renderGeneral, state: renderStateTransition, action: renderActionFlow, sequence: renderSequence, grid: renderTables })) out[v] = stage(() => f(prepared, null));
  return out;
}
if (process.argv[1] && process.argv[1].endsWith('gr18_deep.mjs') && !process.argv.includes('--frames') && !process.argv.includes('--check')) {
  const arg = (k, d) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : d);
  const sizes = arg('--sizes', '150,154,137,85').split(',').map(Number);
  const kinds = ['expr', 'paren', 'package', 'part'];
  for (const [i, k] of kinds.entries()) console.log(JSON.stringify(tryDeep(k, sizes[i])));
}
// --frames: 例外のときの呼び出しの並び(Error.stackTraceLimit = Infinity)で、関数ごとの段の数を数え、深くなる関数を出す
export function framesOf(f) {
  const lim = Error.stackTraceLimit; Error.stackTraceLimit = Infinity;
  try { f(); return null; } catch (e) {
    const cnt = new Map();
    for (const l of String(e.stack).split('\n').slice(1)) { const m = /at (?:(\S+) )?\(?([^()]*?):(\d+):\d+\)?$/.exec(l.trim()); if (!m) continue; const k = `${m[1] ?? '(無名)'} ${m[2].replace(/.*\/src\//, 'src/')}:${m[3]}`; cnt.set(k, (cnt.get(k) ?? 0) + 1); }
    return [...cnt].sort((a, b) => b[1] - a[1]).slice(0, 8);
  } finally { Error.stackTraceLimit = lim; }
}
if (process.argv[1]?.endsWith('gr18_deep.mjs') && process.argv.includes('--frames')) {
  for (const [k, n] of Object.entries({ expr: 1000, paren: 500, package: 300, part: 200 })) {
    const text = deepInputs[k](n);
    console.log(`== ${k} ${n} 解析`, JSON.stringify(framesOf(() => parse(text))));
  }
}
// --check parse|all: 指示書 2.5 節の B1 の大きさ(項 1,000 個の式、括弧 500 段、package 300 段、part 200 段)で、parse なら解析だけ、
// all なら解析・名前解決・意味エラーの検査・6 つのビューの描画を行い、例外がなければ終了コード 0。検査(tests/parser・tests/model)は、
// ブラウザの Worker より浅い呼び出しの深さ(node --stack-size=400)で流す
if (process.argv[1]?.endsWith('gr18_deep.mjs') && process.argv.includes('--check')) {
  const mode = process.argv[process.argv.indexOf('--check') + 1];
  let bad = 0;
  for (const [k, n] of Object.entries({ expr: 1000, paren: 500, package: 300, part: 200 })) {
    const t = performance.now();
    const r = mode === 'parse' ? { kind: k, n, parse: stage(() => { const p = parse(deepInputs[k](n)); if (!p.ok) throw new Error('構文エラー'); }) } : tryDeep(k, n);
    const ng = Object.entries(r).filter(([key, v]) => !['kind', 'n'].includes(key) && v !== 'ok');
    if (ng.length) bad++;
    console.log(`${k} ${n}: ${ng.length ? ng.map(([key, v]) => `${key} ${v}`).join('、') : '例外なし'}(${Math.round(performance.now() - t)} ms)`);
  }
  process.exit(bad ? 1 : 0);
}
