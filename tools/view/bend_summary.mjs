// GR11(P1 の試しで作り、P2 の全数比較に使う): bend_measure.mjs の結果をまとめる。
//   node tools/view/bend_summary.mjs <基準の measure.json> [<比べる measure.json>]
// 1 つなら、ビューと入力の組ごとの (a)〜(h) の合計とあわせて数えるもの、一般ビューの (h) の多い候補の上位 10 件。
// 2 つなら、加えて、候補ごとの (h)・(g) の増減、(a)〜(e) が増えた候補、構造が変わった候補、大きさの変化、時間、書き足しへの強さ。
import fs from 'node:fs';
const [A, B] = process.argv.slice(2).map((f) => JSON.parse(fs.readFileSync(f, 'utf8')));
const L = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const groups = ['files', 'sample', 'symbols', 'student'];
function sums(xs) {
  const q = xs.reduce((a, x) => a.map((v, i) => v + x.q[i]), L.map(() => 0));
  const rs = xs.reduce((a, x) => a + x.ratioSum, 0), rn = xs.reduce((a, x) => a + x.ratioN, 0);
  return { n: xs.length, q, sumK: xs.reduce((a, x) => a + x.sumK, 0), edges: xs.reduce((a, x) => a + x.edges, 0), nonOrth: xs.reduce((a, x) => a + x.nonOrth, 0), straight: xs.reduce((a, x) => a + x.straight, 0), k4: xs.reduce((a, x) => a + x.k4, 0), ratioAvg: rn ? rs / rn : 0, ratioMax: Math.max(0, ...xs.map((x) => x.ratioMax)) };
}
const fmt = (s) => `候補 ${s.n}・線 ${s.edges}(直角でない ${s.nonOrth}): (a)〜(h) ${s.q.join('・')}、Σk ${s.sumK}、まっすぐ ${s.straight}、4 回以上 ${s.k4}、長さの比 平均 ${s.ratioAvg.toFixed(3)}・最大 ${s.ratioMax.toFixed(2)}`;
const key = (x) => `${x.view}|${x.group}|${x.file}|${x.candidate}`;
const out = { base: {}, cmp: null };
for (const v of A.views) for (const g of groups) {
  const xs = A.items.filter((x) => x.view === v && x.group === g);
  if (!xs.length) continue;
  const s = sums(xs);
  out.base[`${v}|${g}`] = s;
  console.log(`${v} ${g}: ${fmt(s)}`);
}
const top = A.items.filter((x) => x.view === 'general' && x.group === 'files').sort((a, b) => b.q[7] - a.q[7]).slice(0, 10);
console.log('一般ビューの (h) の上位 10 件:');
for (const x of top) console.log(`  ${x.q[7]}\t${x.file.replace(/^vendor\/release-2026-03\//, '')} [${x.candidate}] 線 ${x.edges} Σk ${x.sumK}`);
const tm = A.items.filter((x) => x.ms !== null && x.ms !== undefined);
if (tm.length) { const mx = tm.reduce((a, x) => (x.ms > a.ms ? x : a)); console.log(`時間: 合計 ${(tm.reduce((a, x) => a + x.ms, 0) / 1000).toFixed(2)} 秒、最大 ${(mx.ms / 1000).toFixed(3)} 秒(${mx.file} [${mx.candidate}])`); }
if (B) {
  const bm = new Map(B.items.map((x) => [key(x), x]));
  for (const v of A.views) for (const g of groups) {
    const xs = A.items.filter((x) => x.view === v && x.group === g);
    if (!xs.length) continue;
    const ys = xs.map((x) => bm.get(key(x))).filter(Boolean);
    const s = sums(ys);
    const pair = xs.map((x) => [x, bm.get(key(x))]).filter(([, y]) => y);
    const cnt = (i, f) => pair.filter(([x, y]) => f(y.q[i], x.q[i])).length;
    const ae = pair.filter(([x, y]) => y.q.slice(0, 5).some((v2, i) => v2 > x.q[i]));
    const st = pair.filter(([x, y]) => x.structure !== y.structure), sv = pair.filter(([x, y]) => x.svg !== y.svg), dg = pair.filter(([x, y]) => x.diag !== y.diag);
    const dw = pair.map(([x, y]) => y.w - x.w), dh = pair.map(([x, y]) => y.h - x.h);
    const dist = (ds) => { const s2 = [...ds].sort((a, b) => a - b); const q = (p) => s2[Math.min(s2.length - 1, Math.floor(p * (s2.length - 1)))]; return `最小 ${s2[0]}・中央 ${q(0.5)}・最大 ${s2[s2.length - 1]}、増えた ${ds.filter((d) => d > 0).length}・減った ${ds.filter((d) => d < 0).length}`; };
    console.log(`\n${v} ${g} 比べる側: ${fmt(s)}`);
    console.log(`  (h) 減 ${cnt(7, (b, a) => b < a)}・増 ${cnt(7, (b, a) => b > a)}・同 ${cnt(7, (b, a) => b === a)}、(g) 減 ${cnt(6, (b, a) => b < a)}・増 ${cnt(6, (b, a) => b > a)}・同 ${cnt(6, (b, a) => b === a)}`);
    console.log(`  (a)〜(e) が増えた候補 ${ae.length}${ae.length ? ': ' + ae.slice(0, 12).map(([x, y]) => `${x.file.replace(/^.*\//, '')} [${x.candidate}] ${x.q.slice(0, 5).join('・')}→${y.q.slice(0, 5).join('・')}`).join(' / ') : ''}`);
    console.log(`  構造が変わった候補 ${st.length}、SVG が変わった候補 ${sv.length}、診断が変わった候補 ${dg.length}`);
    console.log(`  幅の変化 ${dist(dw)}、高さの変化 ${dist(dh)}`);
    if (st.length) console.log(`  構造が変わった: ${st.slice(0, 5).map(([x]) => `${x.file} [${x.candidate}]`).join(' / ')}`);
  }
  const tb = B.items.filter((x) => x.ms !== null && x.ms !== undefined);
  if (tb.length) { const mx = tb.reduce((a, x) => (x.ms > a.ms ? x : a)); console.log(`比べる側の時間: 合計 ${(tb.reduce((a, x) => a + x.ms, 0) / 1000).toFixed(2)} 秒、最大 ${(mx.ms / 1000).toFixed(3)} 秒(${mx.file} [${mx.candidate}])`); }
}
for (const [name, X] of [['基準', A], ['比べる側', B]]) {
  if (!X) continue;
  const rb = X.items.filter((x) => x.robust);
  if (!rb.length) continue;
  const c = (k, f) => rb.filter((x) => !x.robust[k][f]).length;
  console.log(`${name} 書き足し(一般ビュー、候補 ${rb.length}): 線の順番が変わった 末尾 1 行 ${c('end', 'order')}・先頭 1 行 ${c('start', 'order')}・先頭 50 行 ${c('start50', 'order')}、同じ段の並びが変わった 末尾 1 行 ${c('end', 'rows')}・先頭 1 行 ${c('start', 'rows')}・先頭 50 行 ${c('start50', 'rows')}`);
}
