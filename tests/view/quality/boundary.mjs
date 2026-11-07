// 図の質の数え方の境目の最小の入力(GR10 P2 の確認の後の裁定 3)。src/view/quality.js の edgeQuality は、外接矩形どうし
// (か箱)が離れている組を比べる前に除く。除く距離と各項目の判定の距離のちょうど境目(判定の距離ちょうど・1 px 内側・1 px 外側)と、
// 除く距離の境目に線や箱を置いた図を作る。tests/view/run.mjs の検査 G0 が、除く前(opts.prune: false)と除いた後で
// すべての項目の値が一致することと、除かないときの件数が expect と同じであること(境目が本当に境目であること)を確かめる。
// 線の端は点(dot。障害物にならない)にする。expect のキー: a 横切り(縁に沿う線・ポートの記号を含む)、b 重なり、d コの字、
// e 矢じりの重なり、f 広い間隔で長く並ぶ線、g 線どうしの交差。書いていないキーは 0
function diagram(boxes, edges) {
  const objects = new Map();
  for (const o of boxes) objects.set(o.id, { parent: null, ...o });
  const es = edges.map(([id, pts, symbol = 'x']) => {
    for (const end of ['a', 'b']) objects.set(id + end, { id: id + end, type: 'dot', parent: null, x: 0, y: 0, w: 0, h: 0 });
    return { id, from: id + 'a', to: id + 'b', symbol, points: pts.map(([x, y]) => ({ x, y })) };
  });
  return { objects, edges: es };
}
const box = (id, x, y, w, h) => ({ id, type: 'box', x, y, w, h });
const B = () => box('B', 0, 0, 200, 100);

export function boundaryCases() {
  const cases = [];
  const add = (name, d, expect) => cases.push({ name, d, expect });
  // 縁に沿う線(HUG_GAP = 10。除く距離 11)
  for (const g of [9, 10, 11, 12]) add(`縁に沿う線 上 ${g} px`, diagram([B()], [['e1', [[50, -g], [150, -g]]]]), { a: g <= 10 ? 1 : 0 });
  for (const g of [9, 10, 11, 12]) add(`縁に沿う線 左 ${g} px`, diagram([B()], [['e1', [[-g, 20], [-g, 80]]]]), { a: g <= 10 ? 1 : 0 });
  for (const k of [-2, 0, 1, 11, 12]) add(`縁に沿う線 横にずらす ${k} px`, diagram([B()], [['e1', [[200 + k, -5], [300, -5]]]]), { a: k === -2 ? 1 : 0 });
  // 横切り(箱の縁から 1 px 内側)
  for (const y of [-1, 0, 1, 2]) add(`横切り 縁から ${y} px`, diagram([B()], [['e1', [[-50, y], [250, y]]]]), { a: y === 2 ? 2 : 1 });
  // ポートの記号(PORT_CLEAR = 3。記号の四角 14 px)
  for (const x of [-11, -10, -9]) add(`ポートの記号 x = ${x}`, diagram([B(), { id: 'P', type: 'port', owner: 'B', cx: 0, cy: 50, pw: 14, ph: 14 }], [['e1', [[x, 30], [x, 70]]]]), { a: x === -11 ? 0 : x === -10 ? 1 : 2 });
  // (b) 同じ直線上の重なり(1 px を超える)
  for (const k of [-2, -1, 0, 1]) add(`(b) 同じ直線上 ${k} px`, diagram([], [['e1', [[0, 0], [100, 0]]], ['e2', [[100 + k, 0], [200, 0]]]]), { b: k === -2 ? 1 : 0 });
  // (b) 6 px 以内の平行(除く距離 7)と (f) の下の境目 PAR_MIN = 6
  for (const g of [5, 6, 7, 8]) add(`(b)(f) 横の平行 ${g} px`, diagram([], [['e1', [[0, 0], [100, 0]]], ['e2', [[0, g], [100, g]]]]), g <= 6 ? { b: 1 } : { f: 1 });
  for (const g of [5, 6, 7, 8]) add(`(b)(f) 縦の平行 ${g} px`, diagram([], [['e1', [[0, 0], [0, 100]]], ['e2', [[g, 0], [g, 100]]]]), g <= 6 ? { b: 1 } : { f: 1 });
  for (const k of [-2, -1, 0, 7, 8]) add(`(b) 平行 横にずらす ${k} px`, diagram([], [['e1', [[0, 0], [100, 0]]], ['e2', [[100 + k, 6], [200, 6]]]]), { b: k === -2 ? 1 : 0 });
  // (f) PAR_MAX = 20(除く距離 21)、PAR_LEN = 80
  for (const g of [19, 20, 21, 22]) add(`(f) 平行 ${g} px`, diagram([], [['e1', [[0, 0], [200, 0]]], ['e2', [[0, g], [200, g]]]]), { f: g <= 20 ? 1 : 0 });
  for (const L of [79, 80, 81]) add(`(f) 並ぶ長さ ${L} px`, diagram([], [['e1', [[0, 0], [200, 0]]], ['e2', [[0, 20], [L, 20]]]]), { f: L >= 80 ? 1 : 0 });
  for (const k of [20, 21, 22]) add(`(f) 横にずらす ${k} px`, diagram([], [['e1', [[0, 0], [200, 0]]], ['e2', [[200 + k, 20], [400, 20]]]]), {});
  // (g) 端点から 0.5 px を超えて内側で交わる(除く距離 1)
  for (const t of [-1, -0.5, 0, 0.5, 1]) add(`(g) 縦の線の端 y = ${t}`, diagram([], [['e1', [[0, 0], [100, 0]]], ['e2', [[50, -50], [50, t]]]]), { g: t === 1 ? 1 : 0 });
  for (const k of [-1, -0.5, 0, 0.5, 1, 99, 99.5, 100, 101, 102]) add(`(g) 縦の線 x = ${k}`, diagram([], [['e1', [[0, 0], [100, 0]]], ['e2', [[k, -50], [k, 50]]]]), { g: k === 1 || k === 99 ? 1 : 0 });
  // (d) コの字(UTURN_SHORT = 30。除かない項目)
  for (const L of [29, 30, 31]) add(`(d) コの字 ${L} px`, diagram([], [['e1', [[0, 0], [L, 0], [L, 50], [0, 50]]]]), { d: L <= 30 ? 1 : 0 });
  // (e) 矢じりの重なり(外接矩形を 2 px 広げる。除かない項目)
  for (const k of [13, 14, 15]) add(`(e) 矢じりの間隔 ${k} px`, diagram([], [['e1', [[-50, 0], [0, 0]], 'definition'], ['e2', [[-50, k], [0, k]], 'definition']]), { e: k === 13 ? 1 : 0 });
  return cases;
}
