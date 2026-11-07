// GR18: 速さの道具(指示書 2.5 節の B3・B4)。検査一式には入れない。
// 使い方:
//   node tools/view/gr18_speed.mjs chain 30,100,300      部品を鎖のようにつないだ部品 sys の相互接続ビューの時間
//   node tools/view/gr18_speed.mjs expose                例題 Vehicle Analysis Demo.sysml を、範囲(パッケージ)と view(expose ::**)で描く時間
//   --profile を付けると、描画の段ごとの時間(src/view の計時の口があれば)も出す
import fs from 'node:fs';
import { prepareView, renderInterconnection, renderGeneral } from '../../src/view/index.js';
export const chainText = (n) => {
  const L = ['port def P;', 'part def D { port a : P; port b : P; }', 'part sys {'];
  for (let i = 0; i < n; i++) L.push(`    part p${i} : D;`);
  for (let i = 0; i + 1 < n; i++) L.push(`    connect p${i}.b to p${i + 1}.a;`);
  L.push('}');
  return L.join('\n') + '\n';
};
export const EXPOSE_FILE = 'vendor/release-2026-03/sysml/src/examples/Analysis Examples/Vehicle Analysis Demo.sysml';
export const exposeText = (base) => base + "\nview 'B4' : StandardViewDefinitions::GeneralView { expose 'Vehicle Analysis Demo'::**; }\n";
const ms = (t) => `${Math.round(performance.now() - t)} ms`;
if (process.argv[1]?.endsWith('gr18_speed.mjs')) {
  const mode = process.argv[2];
  if (mode === 'chain') {
    for (const n of (process.argv[3] ?? '30,100').split(',').map(Number)) {
      const text = chainText(n);
      let t = performance.now();
      const p = prepareView(text);
      const tp = ms(t);
      t = performance.now();
      const r = renderInterconnection(p, 'part:sys');
      console.log(`chain n=${n}: 準備 ${tp}、相互接続ビューの描画 ${ms(t)}(候補 ${r.candidate?.id}、SVG ${r.svg?.length ?? 0} 字)`);
    }
  } else if (mode === 'expose') {
    const base = fs.readFileSync(EXPOSE_FILE, 'utf8');
    for (const [label, text, cand] of [['範囲(パッケージ)', base, 'package:Vehicle Analysis Demo'], ['view(expose ::**)', exposeText(base), "view:B4"]]) {
      let t = performance.now();
      const p = prepareView(text);
      const tp = ms(t);
      t = performance.now();
      const r = renderGeneral(p, cand);
      console.log(`${label}: 準備 ${tp}、一般ビューの描画 ${ms(t)}(候補 ${r.candidate?.id}、SVG ${r.svg?.length ?? 0} 字)`);
    }
  }
}
