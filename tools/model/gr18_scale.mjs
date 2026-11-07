// GR18: 名前解決と意味エラーの検査の計算量(指示書 2.1 節の M3)を測る道具。検査一式には入れない。
// 使い方: node tools/model/gr18_scale.mjs [--parts 8000] [--states 4000]
//   parts:  1 つのパッケージに part def Di; part pi : Di; を n 組並べた入力
//   states: 状態の定義の中に state sI; accept SI then sI; を n 組並べた入力
import { parse } from '../../src/parser/index.js';
import { resolveNames } from '../../src/model/index.js';
import { checkSemantics } from '../../src/model/semantic.js';
export const partsText = (n) => { const L = ['package P {']; for (let i = 0; i < n; i++) L.push(`part def D${i}; part p${i} : D${i};`); L.push('}'); return L.join('\n') + '\n'; };
export const statesText = (n) => { const L = ['attribute def S;', 'state def M {']; for (let i = 0; i < n; i++) L.push(`    state s${i}; accept S then s${i};`); L.push('}'); return L.join('\n') + '\n'; };
const arg = (k, d) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : d);
if (process.argv[1]?.endsWith('gr18_scale.mjs')) {
  for (const [label, text] of [['parts', partsText(+arg('--parts', 8000))], ['states', statesText(+arg('--states', 4000))]]) {
    let t = performance.now();
    const p = parse(text);
    const tParse = performance.now() - t;
    t = performance.now();
    const m = resolveNames(p.tree, text);
    const tRes = performance.now() - t;
    t = performance.now();
    const s = checkSemantics(p.tree, m, text);
    const tSem = performance.now() - t;
    console.log(`${label}: ${text.length.toLocaleString()} 字、解析 ${(tParse / 1000).toFixed(1)} 秒、名前解決 ${(tRes / 1000).toFixed(1)} 秒、意味エラーの検査 ${(tSem / 1000).toFixed(1)} 秒(参照 ${m.refs.length}、意味エラー ${s.length})`);
  }
}
