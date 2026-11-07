// 相互接続ビューの配置(GR4 指示書 5.2 節、設計書 7 章)。外部パッケージ・Node.js 固有の機能・DOM を使わない。
//
// layoutDiagram(diagram) は、diagram の図の要素に座標(x・y・w・h。ポートは辺 side と中心 cx・cy)を書き込み、
// 線に折れ線の点(points)を書き込む。同じ diagram からは常に同じ座標になる(乱数・時刻・環境に依存しない)。
//
// 決め方(GR4 P2 で作りながら決めた。報告に書く):
//   - 入れ子の箱を記述の順に格子状に並べる。1 行に並べる数は ceil(√n)(n は領域の中の要素の数)。
//     列の幅と行の高さは、その列・行の要素の最大。箱の大きさは中身(名前・領域・区画・ポートの数)に合わせる。
//   - ポートの辺: in は左、out は右。inout と向きのないものは、最初につながる相手(線の記述の順)のある側。
//     つながりがなければ上(設計書 7 章)。相手の側は、1 回目の配置で求めた相手の中心の向きで決め、2 回目の配置で確定する。
//   - 線は直角に曲げて引く。端から辺に垂直に短く出し、中ほどで曲げる(L 字か Z 字)。箱との重なりは避けない。
//   - アクションフローの図は、src/view/index.js の FLOW_LAYERS のとき、流れの段で並べる(flowPositions。GR8)。

import { textWidth } from './textwidth.js';
import { BOXLIKE, containsObj, chainOf, obstaclesFor, segHitsRect, hugsBorder, portRect, HUG_GAP, PORT_CLEAR, ARROW_END } from './quality.js';

export const FS = 13;       // 名前の字の大きさ
export const FSS = 11;      // キーワード・区画・ラベルの字の大きさ
export const LINE = 16;     // 行の高さ
const PAD = 10;
const RPAD = 24;           // 領域の左右と下の余白(ポートから内側へ出す線と、線の通り道のため)
const GAP = 40;             // 格子の間隔
const PORT = 14;            // ポートの四角の大きさ
const PSTEP = 30;           // ポートの間隔
const MINW = 120, MINH = 56;
export const ICON_W = 14;    // アクションフロービューの send・accept の箱の左上の印の幅

const SIDES = ['l', 'r', 't', 'b'];

let bandGaps = new Map(); // 帯の線引き(d.bandRoute)の、領域ごとの段と列の間隔(bandPlan)
let gapExtra = 0; // 文字を置く余地が足りないときに広げる格子の間隔(layoutDiagram の間だけ使う)

export function layoutDiagram(d) {
  gapExtra = d.gapExtra ?? 0;
  const O = d.objects;
  const get = (id) => O.get(id);
  for (const e of d.edges) if (e.markers?.length && e.box && get(e.box)) (get(e.box).markerEdges ??= []).push(e.markers.length);
  // 線の端としてつながる相手(最初の線)
  const firstPartner = new Map();
  for (const e of d.edges) {
    if (!firstPartner.has(e.from)) firstPartner.set(e.from, e.to);
    if (!firstPartner.has(e.to)) firstPartner.set(e.to, e.from);
  }
  // 1 回目: 向きのないポートを上に置く
  // アクションフローの図を流れの段で並べる(設計書 7.5 節。src/view/index.js の FLOW_LAYERS のときだけ)。
  // このとき、アクションフローの図の中の引数は、フローの相手の箱がある側の辺に置く(GR8 の裁定 Q5 の K1。flowParamSides)
  if (d.flowLayers) for (const o of O.values()) if (o.type === 'port' && o.symbol === 'param' && inFlowDiagram(o, get)) o.flowParam = true;
  for (const o of O.values()) if (o.type === 'port' || o.type === 'proxy') o.side = initialSide(o, get);
  if (d.flowLayers) { flowPositions(d, get); flowParamSides(d, get); }
  bandGaps = d.bandRoute ? bandPlan(d, get) : new Map();
  place(d);
  // 2 回目以降: 向きのないポートの辺を、つながる相手の向きで決める。n 端の黒丸の位置(端の要素の中心の重心)は
  // ポートの辺で変わり、黒丸が相手のポートの辺を決めるので、辺が変わらなくなるまで(最大 3 回)くり返す
  const dots = () => { for (const o of O.values()) if (o.type === 'dot') { const c = centroid(o.members.map((id) => centerOf(get(id), get))); o.cx = c.x; o.cy = c.y; } };
  for (let round = 0; round < 3; round++) {
    dots();
    let changed = false;
    for (const o of O.values()) {
      if (!(o.type === 'port' || o.type === 'proxy') || o.nested) continue;
      if (o.type === 'port' && (o.dir === 'in' || o.dir === 'out') && !o.flowGeom) continue;
      if (o.flowFixed) continue;
      const pid = o.flowGeom ?? firstPartner.get(o.id) ?? firstPartnerOfChildren(o, firstPartner, get);
      if (!pid) continue;
      const owner = get(o.owner);
      const partner = get(pid);
      const s = sideToward(owner, centerOf(partner, get), contains(owner, partner, get));
      if (s !== o.side) { o.side = s; changed = true; }
    }
    for (const o of O.values()) if (o.nested) o.side = get(o.owner).side;
    if (!changed) break;
    place(d);
  }
  if (d.fig14?.N && placeNotesNear(d, get)) { d.notesMoved = true; place(d); }
  if (d.fig14?.F && fitOuterBoxes(d, get)) place(d);
  dots();
  for (const o of O.values()) if (o.type === 'cline') Object.assign(o, o.line.rect);
  // 線が縁に沿って走らないようにする相手。アクションフロービューの列(passable)の縁も含める(列の入れ物などの枠なしの箱は含めない)
  d.boxLike = [...O.values()].filter((o) => BOXLIKE.has(o.type) && !(o.passable && o.plain));
  d.labelRects = portLabelRects(d, get);
  routeAll(d, get);
  return d;
}

function initialSide(o, get) {
  if (o.nested) return null;
  if (o.type === 'port') {
    if (o.dir === 'in') return 'l';
    if (o.dir === 'out') return 'r';
  }
  return 't';
}
// 引数の持ち主の箱が、アクションフローの図(flowLayout の箱。持ち主そのものか、その祖先)の中にあるか。
// 状態遷移ビューの状態の中の行動の箱(本体の図の外)は、祖先に flowLayout の箱がないので当たらない
function inFlowDiagram(p, get) {
  for (let b = get(p.owner); b; b = b.parent ? get(b.parent) : null) if (b.flowLayout) return true;
  return false;
}
function firstPartnerOfChildren(o, fp, get) {
  for (const id of o.children ?? []) { const p = fp.get(id); if (p) return p; }
  return null;
}

// GR14 の F(src/view/index.js の FIG14.F。指示書 3.4 節): アクションフロービューの外側の箱(最上位の、アクションフローの図を持つ箱)の
// 大きさを、中身(領域の要素と、そのポートのはみ出しの外接矩形)に、今の内側の余白(左と上の余白と同じ値)を足した大きさにする。
// 右と下の空白だけを詰め、中の要素の位置は変えない(要素は領域の左上から置くので、箱の幅と高さを変えても動かない)。
// 名前の区画・文字の区画・辺のポートの並びが要る幅と高さより小さくはしない(boxSize の ほかの項)。
// 左下の ... と線の上の印のラベルの分の高さは残す。
// 状態遷移ビューの中の本体の図(枠なしの箱 action-flow-view)は、持ち主の箱の幅いっぱいに広げて中の格子を中央に置くので、
// 高さ(下の空白)だけを詰める。詰める箱があれば true
function fitOuterBoxes(d, get) {
  if (!d.actionView && !d.stateView) return false;
  const targets = d.actionView ? d.top.map(get).filter((B) => B.type === 'box' && !B.plain && B.flowLayout)
    : [...d.objects.values()].filter((B) => B.type === 'box' && B.plain && B.bodyOf && B.symbol === 'action-flow-view');
  let any = false;
  for (const B of targets) {
    if (!B.region.length || B.fit) continue;
    let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
    for (const o of B.region.map(get)) {
      const m = o.type === 'box' ? portMargins(o, get) : { l: 0, r: 0, t: 0, b: 0 };
      l = Math.min(l, o.x - m.l); t = Math.min(t, o.y - m.t); r = Math.max(r, o.x + o.w + m.r); b = Math.max(b, o.y + o.h + m.b);
    }
    const padL = l - B.x, padT = t - B.regionY;
    const ellipsisH = B.ellipsis ? LINE : 0;
    const markerH = (B.markerEdges ?? []).length ? Math.max(...B.markerEdges) * LINE + 6 : 0;
    const w = B.plain ? Infinity : Math.ceil(r - B.x + padL), regionH = Math.ceil(b - B.regionY + padT + ellipsisH + markerH);
    if (w < B.w || regionH < B.regionH) { B.fit = { w, regionH }; any = true; }
  }
  return any;
}

// GR14 の N(src/view/index.js の FIG14.N。指示書 3.1 節): 注の記号を、注釈先の要素の近く(右か下の空き)に置く。
// 置き直すのは、線が注釈の線 1 本だけ(注から出るもの)の注で、注釈先(ポート・引数・proxy なら持ち主の箱、区画の行ならその箱、
// 入れ子の要素ならその祖先)が、注と同じ領域の要素(注の記号でないもの)のとき。注釈先が注を囲む箱(about のない注の持ち主)の
// ときは置き直さない(今の「内側の最も近い縁へ短く」のまま)。戻り値は 注の id → 注釈先の領域の要素の id
function noteAnchors(d, get) {
  const out = new Map();
  const touching = new Map();
  for (const e of d.edges) for (const id of [e.from, e.to]) { if (!touching.has(id)) touching.set(id, []); touching.get(id).push(e); }
  for (const n of d.objects.values()) {
    if (n.type !== 'note') continue;
    const es = touching.get(n.id) ?? [];
    if (es.length !== 1 || es[0].symbol !== 'annotation-link' || es[0].from !== n.id) continue;
    let x = get(es[0].to);
    while (x && (x.type === 'port' || x.type === 'proxy')) x = get(x.owner);
    if (x?.type === 'cline') x = get(x.parent);
    while (x && (x.parent ?? null) !== (n.parent ?? null)) x = x.parent ? get(x.parent) : null;
    if (!x || x === n || x.type === 'note' || x.type === 'dot' || x.type === 'cline') continue;
    const region = n.parent ? get(n.parent) : null;
    if (region && (region.laneGroup || region.rowLayout || region.symbol === 'swimlane')) continue;
    if (!(region ? region.region : d.top).includes(x.id)) continue;
    out.set(n.id, x.id);
  }
  return out;
}
// 置き直す注を、格子のマス(行 r・列 c)に置く。place(skip) は、置き直す注(skip)を除いた要素のマスを求めて返す(注を除いた要素を
// 記述の順に詰める)。注釈先のマスの右(r, c + 1)か下(r + 1, c)が空いていれば、そこに置く(一般ビューは下を先に、ほかは右を先に見る)。
// どちらも空いていなければ、新しい列(注釈先が右の端の列なら新しい行)を足して置く(GR14 P3 の指示の 2)。
// 注釈先のマスが求まらない注は置き直さず、今の置き方(格子の中)に戻して、残りの注をもう一度置く。置き直した注があれば true
function attachNotes(ids, anchors, belowFirst, place) {
  let S = new Set(ids.filter((id) => anchors.has(id) && ids.includes(anchors.get(id))));
  while (S.size) {
    const pos = place(S);
    const occ = new Set([...pos].filter(([id]) => !S.has(id)).map(([, k]) => `${k.r},${k.c}`));
    const failed = [];
    for (const id of S) {
      const k = pos.get(anchors.get(id));
      const cands = k ? (belowFirst ? [[k.r + 1, k.c], [k.r, k.c + 1]] : [[k.r, k.c + 1], [k.r + 1, k.c]]) : [];
      // 図の右の端の列より右のマスは、空きに数えない(GR14 P3 の指示の 2「右が図の端なら下に新しい行」)
      const maxC = Math.max(...[...pos.values()].map((q) => q.c));
      let hit = cands.find(([r, c]) => c <= maxC && !occ.has(`${r},${c}`));
      if (!hit && k) {
        // GR14 P3(N の直し 2): 空いたマスがなければ、注釈先の右に新しい列を足す。注釈先が右の端の列なら、下に新しい行を足す。
        // 足した列(行)より右(下)の要素は 1 つずつずらす
        const row = k.c >= maxC;
        for (const [x, q] of pos) if (x !== id && (row ? q.r > k.r : q.c > k.c)) pos.set(x, row ? { r: q.r + 1, c: q.c } : { r: q.r, c: q.c + 1 });
        occ.clear();
        for (const q of pos.values()) occ.add(`${q.r},${q.c}`); // pos には、注を除いた要素と、この回ですでに置いた注だけがある
        hit = row ? [k.r + 1, k.c] : [k.r, k.c + 1];
      }
      if (!hit) { failed.push(id); continue; }
      pos.set(id, { r: hit[0], c: hit[1] });
      occ.add(`${hit[0]},${hit[1]}`);
    }
    if (!failed.length) return true;
    for (const id of failed) S.delete(id);
  }
  place(S);
  return false;
}
// 記述の順の格子(1 行 ceil(√n) 個)の領域の、注を置き直したマス。置き直した注がなければ null(今の格子)。
// 列の数は、注を含めた要素の数で決める(注をどれも置き直せないときに今と同じ並びにする)
function noteCells(ids, anchors, belowFirst) {
  const cols = Math.max(1, Math.ceil(Math.sqrt(ids.length)));
  let cells = null;
  const moved = attachNotes(ids, anchors, belowFirst, (skip) => {
    cells = new Map();
    let i = 0;
    for (const id of ids) if (!skip.has(id)) { cells.set(id, { r: Math.floor(i / cols), c: i % cols }); i++; }
    return cells;
  });
  return moved ? cells : null;
}
// 注を注釈先の近くへ動かす(layoutDiagram で、向きのないポートの辺を決め終えた後に呼ぶ。注を動かして箱の大きさが変わっても、
// ポートの辺は決め直さない)。流れの段の領域(列に分けた領域を除く)は段と列のマスを、記述の順の格子の領域(列・1 行の並び・
// 列の入れ物を除く)は格子のマスを、attachNotes で直す。帯の線引き(一般ビュー)では、帯の道筋と間隔を求め直す。動かした注があれば true
function placeNotesNear(d, get) {
  const anchors = noteAnchors(d, get);
  if (!anchors.size) return false;
  let moved = false;
  // 流れの段の領域: 置き直す注は、最後の段の下の格子(flowRest。flowPositions が残したもの)から除き、残りを記述の順に詰める
  const inFlow = (pos, R) => attachNotes(R.ids, anchors, !!d.layerWrap, (skip) => {
    for (const id of R.rest) pos.delete(id);
    R.rest.filter((id) => !skip.has(id)).forEach((id, i) => pos.set(id, { r: R.next + Math.floor(i / R.cols), c: i % R.cols }));
    return pos;
  });
  for (const o of d.objects.values()) {
    if (o.type !== 'box' || !o.region.length) continue;
    if (o.flowPos && !o.rowLayout) { if (!o.flowShare && o.flowRest && inFlow(o.flowPos, o.flowRest)) moved = true; }
    else if (!o.rowLayout && !o.laneGroup && !o.helper) { o.noteCells = noteCells(o.region, anchors, false); if (o.noteCells) moved = true; }
  }
  if (d.topFlowPos) { if (d.topFlowRest && inFlow(d.topFlowPos, d.topFlowRest)) moved = true; }
  else { d.topNoteCells = noteCells(d.top, anchors, false); if (d.topNoteCells) moved = true; }
  if (!moved) return false;
  // 流れの段の行と列(d.flowItemPos)も、詰め直したマスに合わせる
  for (const [id, k] of d.flowItemPos ?? []) {
    const o = get(id);
    const pos = o.parent ? get(o.parent).flowPos : d.topFlowPos;
    if (pos?.has(id)) { k.r = pos.get(id).r; k.c = [k.c[0], pos.get(id).c]; }
  }
  if (d.bandRoute) { for (const o of d.objects.values()) delete o.bandMinW; bandGaps = bandPlan(d, get); }
  return true;
}

// GR14 の F の検査(tests/view/run.mjs が使う): 描いた図の、fitOuterBoxes の対象の箱ごとの、内側の余白(左・上)と、右と下の空白。
// 戻り値 [{ id, padL, padT, right, bottom, extraB, minW, minH, w, h, plain }]。extraB は下に残す ... と印のラベルの分。
// minW・minH は、領域によらない最小の幅と高さ(名前の区画・文字の区画・辺のポートの並び。詰めた箱だけ)
export function outerBlanks(d) {
  const get = (id) => d.objects.get(id);
  const targets = d.actionView ? d.top.map(get).filter((B) => B.type === 'box' && !B.plain && B.flowLayout)
    : d.stateView ? [...d.objects.values()].filter((B) => B.type === 'box' && B.plain && B.bodyOf && B.symbol === 'action-flow-view') : [];
  const out = [];
  for (const B of targets) {
    if (!B.region.length) continue;
    let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
    for (const o of B.region.map(get)) {
      const m = o.type === 'box' ? portMargins(o, get) : { l: 0, r: 0, t: 0, b: 0 };
      l = Math.min(l, o.x - m.l); t = Math.min(t, o.y - m.t); r = Math.max(r, o.x + o.w + m.r); b = Math.max(b, o.y + o.h + m.b);
    }
    const extraB = (B.ellipsis ? LINE : 0) + ((B.markerEdges ?? []).length ? Math.max(...B.markerEdges) * LINE + 6 : 0);
    out.push({ id: B.id, padL: l - B.x, padT: t - B.regionY, right: B.x + B.w - r, bottom: B.regionY + B.regionH - b, extraB, minW: B.fitMin?.w ?? null, minH: B.fitMin?.h ?? null, w: B.w, h: B.h, plain: !!B.plain });
  }
  return out;
}

// 箱の中の要素(領域と、区画の中の図の箱)を、内側から順に並べる(後順。明示のスタックでたどる。GR18 の B1)
function postOrder(items, get) {
  const out = [], seen = new Set();
  const kids = (o) => [...(o.region ?? []), ...[...(o.preCompartments ?? []), ...(o.compartments ?? [])].filter((c) => c.body).map((c) => c.body)].map(get).filter(Boolean);
  const stack = items.map((o) => [o, false]).reverse();
  while (stack.length) {
    const [o, done] = stack.pop();
    if (done) { out.push(o); continue; }
    if (seen.has(o)) continue;
    seen.add(o);
    stack.push([o, true]);
    const ks = kids(o);
    for (let k = ks.length - 1; k >= 0; k--) stack.push([ks[k], false]);
  }
  return out;
}

// ---- 大きさと位置
function place(d) {
  const O = d.objects;
  const get = (id) => O.get(id);
  for (const o of O.values()) if (o.nested) o.side = get(o.owner).side;
  // 列どうしでそろえる行の高さは、ポートの辺が変わると変わるので、配置のたびに求め直す
  for (const o of O.values()) if (o.flowShare) o.flowShare.rowH = null;
  const sizes = new Map();
  const size = (o) => {
    if (sizes.has(o.id)) return sizes.get(o.id);
    let s;
    if (o.type === 'box') s = boxSize(o, get, size);
    else if (o.type === 'note') s = noteSize(o);
    else if (o.type === 'dparam') s = dparamSize(o);
    else if (o.type === 'pnode') s = pnodeSize(o);
    else s = { w: 0, h: 0, m: { l: 0, r: 0, t: 0, b: 0 } };
    if (o.bandMinW > s.w) s = { ...s, w: o.bandMinW };
    sizes.set(o.id, s);
    return s;
  };
  const items = d.top.map(get);
  // 入れ子の箱の大きさを、内側から順に(後順に)先に求めて覚えておく。size → boxSize → grid → size の再帰が、覚えた値で止まり、
  // 入れ子の深さに比例して深くならない(設計書 2.6 節 v18.1。GR18 の B1)。大きさは箱ごとに決まる値なので、求める順序で変わらない
  for (const o of postOrder(items, get)) size(o);
  // 状態遷移ビューは、遷移のラベルの幅に合わせて格子の間隔を広げる(minGap。相互接続ビューにはない)
  const g = grid(items, size, Math.max(GAP, d.minGap ?? 0), null, false, d.topFlowPos ? { pos: d.topFlowPos, loopGap: d.loopGap ?? 0 } : null, d.topNoteCells);
  let ox = 20 + (d.labelPad ?? 0), oy = 20;
  const f = d.frame;
  let bottomH = 0;
  if (f) {
    // 図の枠: 左上に名前の区画、右上に expose、左下に filter、右下に注釈の情報の区画(裁定 Q1)
    f.headW = Math.max(textWidth(f.title, FS) + 2 * PAD, 80);
    f.headH = LINE + 10;
    const info = [...f.exposes, ...f.filters, ...f.notes];
    f.infoW = info.length ? Math.ceil(Math.max(...info.map((t) => textWidth(t, FSS))) + 2 * PAD) : 0;
    const trH = f.exposes.length ? f.exposes.length * LINE + 8 : 0;
    bottomH = Math.max(f.filters.length, f.notes.length) ? Math.max(f.filters.length, f.notes.length) * LINE + 8 : 0;
    ox = 30 + (d.labelPad ?? 0); oy = 10 + Math.max(f.headH, trH) + 24;
  }
  assign(items, g, ox, oy, get, size);
  if (f) {
    f.x = 10; f.y = 10;
    const both = f.filters.length && f.notes.length;
    f.w = Math.ceil(Math.max(g.w + ox + 10 + (d.labelPad ?? 0), f.headW + (f.exposes.length ? f.infoW + 20 : 0), both ? 2 * f.infoW + 20 : f.infoW, 200));
    f.h = Math.ceil(oy - 10 + g.h + 20 + bottomH);
    d.width = f.w + 20; d.height = f.h + 20;
  } else {
    d.width = Math.ceil(Math.max(g.w + ox + 20 + (d.labelPad ?? 0), 200));
    d.height = Math.ceil(g.h + oy + 20);
  }
}

// 格子: 記述の順に、1 行 ceil(√n) 個。cols を渡すとその列数にする。exact なら間隔に gapExtra を足さない
// (アクションフロービューの列は、間隔 0 で互いに接する)
// flow を渡すと、要素ごとの行と列(flow.pos。flowPositions で求めた流れの段)に置く。flow.share があれば、
// 行の高さを、同じ share を持つ箱(アクションフロービューの列と列の外)のすべての要素で決める(行をそろえる)
const GAP_BASE = GAP;
// cells を渡すと、要素ごとのマス(GR14 の N で注を置き直した、記述の順の格子。noteCells)に置く(位置の決め方は記述の順の格子と同じ)
function grid(items, size, gap = GAP, cols0 = null, exact = false, flow = null, cells = null) {
  const GAP = exact ? gap : gap + gapExtra;
  const n = items.length;
  const cols = cols0 ?? Math.max(1, Math.ceil(Math.sqrt(n)));
  const colW = [], rowH = [];
  if (flow || cols0) cells = null;
  const at = (o, i) => (flow ? flow.pos.get(o.id) : cells ? cells.get(o.id) : { c: i % cols, r: Math.floor(i / cols) });
  items.forEach((o, i) => {
    const s = size(o);
    const { c, r } = at(o, i);
    // 流れの段では、箱そのものを列の中央に置くので、左右の余白の大きいほうを両側にとる
    colW[c] = Math.max(colW[c] ?? 0, flow ? s.w + 2 * Math.max(s.m.l, s.m.r) : s.w + s.m.l + s.m.r);
    rowH[r] = Math.max(rowH[r] ?? 0, s.h + s.m.t + s.m.b);
  });
  if (flow?.share) {
    const sh = flow.share;
    if (!sh.rowH) {
      sh.rowH = [];
      for (const b of sh.boxes) for (const id of b.region) { const k = b.flowPos.get(id), s = size(sh.get(id)); sh.rowH[k.r] = Math.max(sh.rowH[k.r] ?? 0, s.h + s.m.t + s.m.b); }
      for (let r = 0; r < sh.rows; r++) sh.rowH[r] ??= 0;
    }
    rowH.splice(0, rowH.length, ...sh.rowH);
  }
  for (let c = 0; c < colW.length; c++) colW[c] ??= 0;
  for (let r = 0; r < rowH.length; r++) rowH[r] ??= 0;
  // 流れの段の行の間隔は、ラベルの幅(minGap。線の脇に置くので横の間隔に効く)によらず GAP とし、自分自身に戻る線が
  // あるときだけ、その分(loopGap)に広げる
  const RG = flow ? Math.max(GAP_BASE, flow.loopGap ?? 0) + (exact ? 0 : gapExtra) : GAP;
  const bg = flow ? bandGaps.get(flow.pos) : null;
  if (bg) {
    // 列の左端・段の上端(帯の線引き): 列の間 j は bg.col[j]、段の間 k は bg.row[k]。左の外と下の外にも帯の分をとる
    const colX = [], rowY = [];
    let x = bg.left, y = 0;
    for (let c = 0; c < colW.length; c++) { colX[c] = x; x += colW[c] + (c + 1 < colW.length ? Math.max(GAP, bg.col[c] ?? 0) : 0); }
    for (let r = 0; r < rowH.length; r++) { rowY[r] = y; y += rowH[r] + (r + 1 < rowH.length ? Math.max(RG, bg.row[r] ?? 0) : 0); }
    return { cols, colW, rowH, gap: GAP, rowGap: RG, colX, rowY, w: n ? x + bg.right : 0, h: n ? y + bg.bottom : 0, pos: flow.pos };
  }
  const w = colW.reduce((a, b) => a + b, 0) + GAP * Math.max(0, colW.length - 1);
  const h = rowH.reduce((a, b) => a + b, 0) + RG * Math.max(0, rowH.length - 1);
  return { cols, colW, rowH, gap: GAP, rowGap: RG, w: n ? w : 0, h: n ? h : 0, pos: flow ? flow.pos : null, cells };
}

// ---- 流れの段(設計書 7.5 節の「配置」。GR8)
// アクションフローの図を持つ箱(flowLayout)と、アクションフロービューの最上位(d.topFlow。view の図で公開した要素を並べるところ)
// の領域の要素に、行(段)と列を決める。
//   - 段は、開始の節点から、継承(ガード付き・else を含む)と継承フローをたどった最短の段数。開始の節点がなければ、
//     入ってくる継承がなく出ていく継承がある要素を記述の順に起点とし(GR8 P1 の裁定 Q4)、それもなければ(継承がすべて
//     輪の中にあるとき)継承を持つ要素のうち最初に書いたものを起点とする。継承を持たない要素は起点にしない。
//     線の端は、領域の要素(端がポート・引数・proxy なら持ち主の箱、入れ子の要素ならその祖先)に読み替える。
//     両端が同じ要素になる線と、領域の外に出る線はたどらない
//   - 同じ段の要素は、記述の順で左から並べる。たどり着けない要素(継承を持たない要素を含む)は、最後の段の下に、
//     記述の順の格子(1 行 ceil(√k) 個)で並べる。継承が 1 本もない領域は、すべてを格子に置く
//   - 部品ごとの列(swimlane)があるときは、列と列の外の要素をまとめて段を求め、列を縦の並びとし、各行動の段を行とする。
//     行の高さは列どうしでそろえ、列の外の要素は列の頭の分だけ下げる
const LAYER_EDGES = new Set(['aflow-succession', 'else-branch', 'succession-flow']);
// 一般ビュー(GR10)の関係の段をたどる線と向き(設計書 7.7 節、GR10 P1 の裁定 Q6 の (a))。1 は始点を上、-1 は終点を上にする。
// 型の関係の線の終点は上位・型・持ち主なので、型付け(使用を上・定義を下)だけが 1
const GENERAL_LAYER = new Map([['definition', 1], ['subclassification', -1], ['subsetting', -1], ['reference-subsetting', -1], ['redefinition', -1],
  ['composite-feature-membership', -1], ['noncomposite-feature-membership', -1], ['portion-relationship', -1]]);
// GR14 の A(src/view/index.js の FIG14.A。指示書 3.2 節): 一般ビューの、持ち主と主体・行為者・利害関係者の節点を結ぶ線も、
// 関係の段をたどる線に入れる(線の始点が持ち主なので、持ち主を上、節点を下にする)
const DPARAM_LINKS = new Set(['distinguished-parameter-link', 'concern-stakeholder-link']);
// フローの線(引数の辺を、フローの相手の側に決める線。裁定 Q5 の K1)
const FLOW_EDGES = new Set(['flow', 'succession-flow']);
// アクションフローの図の引数(flowParam)の辺: 最初のフローの線の相手の箱がある側。相手と同じ領域の要素どうしなら、
// 相手が下の段なら下の辺、上の段なら上の辺、同じ段なら相手のいる左右の辺(段と列は flowPositions のもの)。
// 相手が持ち主の箱の中にあるとき(外側の箱の引数など)と、同じ領域で比べられないときは、向きのないポートと同じく
// 相手の位置で決める(layoutDiagram の 2 回目以降の配置。中の相手なら上を除く最も近い辺)。
// フローの相手がない引数は、in を左、out を右(今の規則)
function flowParamSides(d, get) {
  const pos = d.flowItemPos ?? new Map();
  const chain = (id) => { const out = []; let x = get(id); while (x && (x.type === 'port' || x.type === 'proxy')) x = get(x.owner); for (; x; x = x.parent ? get(x.parent) : null) out.push(x.id); return out; };
  for (const o of d.objects.values()) {
    if (!o.flowParam) continue;
    const e = d.edges.find((e) => FLOW_EDGES.has(e.symbol) && (e.from === o.id || e.to === o.id));
    if (!e) continue;
    const other = e.from === o.id ? e.to : e.from;
    const A = chain(o.owner), B = chain(other);
    if (B.includes(o.owner)) { o.flowGeom = other; continue; }
    let side = null;
    for (const a of A) {
      const pa = pos.get(a);
      if (!pa) continue;
      const b = B.find((id) => pos.get(id)?.region === pa.region);
      if (!b || b === a) continue;
      const pb = pos.get(b);
      side = pb.r > pa.r ? 'b' : pb.r < pa.r ? 't' : (pb.c[0] - pa.c[0] || pb.c[1] - pa.c[1]) > 0 ? 'r' : 'l';
      break;
    }
    if (side) { o.side = side; o.flowFixed = true; } else o.flowGeom = other;
  }
}
function flowPositions(d, get) {
  const regions = [];
  for (const o of d.objects.values()) {
    if (o.type !== 'box' || !o.flowLayout || !o.region.length) continue;
    // 列に分けた箱(src/view/action.js の makeLanes): 列の外の入れ物と、列の入れ物の中の列
    const lanes = o.flowOrder ? o.region.map(get).flatMap((b) => (b.laneGroup ? b.region.map(get) : [b])) : null;
    regions.push({ boxes: lanes ?? [o], order: o.flowOrder ?? o.region, owner: o, lanes: !!lanes });
  }
  if (d.topFlow && d.top.length) regions.push({ boxes: [{ id: null, region: d.top }], order: d.top, owner: null, lanes: false, top: true });
  for (const R of regions) {
    const itemSet = new Set(R.order);
    const up = (id) => {
      let x = get(id);
      while (x && (x.type === 'port' || x.type === 'proxy')) x = get(x.owner);
      while (x && !itemSet.has(x.id)) x = x.parent ? get(x.parent) : null;
      return x ? x.id : null;
    };
    const out = new Map(R.order.map((id) => [id, []]));
    const hasIn = new Set();
    for (const e of d.edges) {
      const dir = LAYER_EDGES.has(e.symbol) ? 1 : GENERAL_LAYER.get(e.symbol) ?? (d.layerWrap && d.fig14?.A && DPARAM_LINKS.has(e.symbol) ? 1 : 0);
      if (!dir) continue;
      let a = up(e.from), b = up(e.to);
      if (dir < 0) [a, b] = [b, a];
      if (!a || !b || a === b) continue;
      out.get(a).push(b);
      hasIn.add(b);
    }
    const start = R.order.find((id) => { const o = get(id); return o.type === 'pnode' && o.symbol === 'start-node'; });
    // 起点は、開始の節点がなければ、入ってくる線がなく出ていく線がある要素(GR8 P1 の裁定 Q4)。線を持たない要素は
    // 起点にせず、たどり着けない要素と同じく最後の段の下の格子に置く
    let roots = start ? [start] : R.order.filter((id) => !hasIn.has(id) && out.get(id).length);
    // それもなければ(線がすべて輪の中にあるとき)、線を持つ要素のうち最初に書いたもの。線が 1 本もなければ起点はなく、
    // すべてを格子に置く(記述の順の格子と同じ並び)
    if (!roots.length) { const f = R.order.find((id) => out.get(id).length); roots = f ? [f] : []; }
    const layer = new Map(roots.map((id) => [id, 0]));
    const queue = [...roots];
    for (let i = 0; i < queue.length; i++) for (const b of out.get(queue[i])) if (!layer.has(b)) { layer.set(b, layer.get(queue[i]) + 1); queue.push(b); }
    const last = layer.size ? Math.max(...layer.values()) : -1;
    // 一般ビュー(d.layerWrap)の、線でつながる相手(領域の要素どうし。向きによらない)。型付けの線は、定義の側に使用を typing で持つ
    const adj = new Map(R.order.map((id) => [id, []]));
    if (d.layerWrap) for (const e of d.edges) {
      const a = up(e.from), b = up(e.to);
      if (!a || !b || a === b) continue;
      adj.get(a).push({ id: b, typing: false });
      adj.get(b).push({ id: a, typing: e.symbol === 'definition' });
    }
    for (const b of R.boxes) {
      const pos = new Map();
      const cnt = [];
      const ids = R.order.filter((id) => b.region.includes(id));
      const rest = ids.filter((id) => !layer.has(id));
      for (const id of d.layerWrap ? baryOrder(ids, layer, adj) : ids) { if (!layer.has(id)) continue; const r = layer.get(id); cnt[r] = (cnt[r] ?? 0) + 1; pos.set(id, { r, c: cnt[r] - 1 }); }
      // 一般ビュー(d.layerWrap)は、1 つの段の要素が ceil(√n)(n は領域の要素の数)を超えるとき、その段を ceil(√n) 個ずつの行に
      // 折り返す。折り返した行は同じ段の続きとして、次の段より上に置く(GR10 P1 の裁定 Q6 の (d))
      let next = last + 1;
      if (d.layerWrap) {
        const W = Math.max(1, Math.ceil(Math.sqrt(ids.length)));
        const rowOf = [];
        let base = 0;
        // GR11 案 Dx(d.bendOpts.Dx が上限の幅 px。src/view/index.js の BEND): 行の要素が ceil(√n) 個を超え、かつ箱の幅の合計
        // (間の格子の間隔 GAP を含む)が上限を超えるときだけ折り返す。行の要素を段の中の並びの順に置いていき、すでに W 個あり、
        // 次の要素を足すと上限を超えるときに次の行へ移る
        const lim = d.bendOpts?.Dx ?? 0;
        let wrapAt = null;
        if (lim) {
          const w = estWidths(d, get);
          const byRow = [];
          for (const [id, k] of pos) (byRow[k.r] ??= []).push([k.c, id]);
          wrapAt = new Map();
          for (let r = 0; r <= last; r++) {
            const l = (byRow[r] ?? []).sort((a, b) => a[0] - b[0]);
            let line = 0, col = 0, acc = 0;
            for (const [, id] of l) {
              const ww = (w.get(id) ?? 0) + GAP;
              if (col >= W && acc + ww > lim + GAP) { line++; col = 0; acc = 0; }
              wrapAt.set(id, { line, col }); acc += ww; col++;
            }
            cnt[r] = line + 1;
          }
        }
        for (let r = 0; r <= last; r++) { rowOf[r] = base; base += wrapAt ? Math.max(1, cnt[r] ?? 1) : Math.max(1, Math.ceil((cnt[r] ?? 0) / W)); }
        if (wrapAt) for (const [id, k] of pos) { const w2 = wrapAt.get(id); if (w2.line !== Math.floor(k.c / W) || w2.col !== k.c % W) d.bendWrap = (d.bendWrap ?? 0) + 1; }
        for (const [id, k] of pos) pos.set(id, wrapAt ? { r: rowOf[k.r] + wrapAt.get(id).line, c: wrapAt.get(id).col } : { r: rowOf[k.r] + Math.floor(k.c / W), c: k.c % W });
        next = base;
        alignTyped(pos, adj);
      }
      const cols = Math.max(1, Math.ceil(Math.sqrt(rest.length)));
      rest.forEach((id, i) => pos.set(id, { r: next + Math.floor(i / cols), c: i % cols }));
      // GR14 の N(placeNotesNear)が、注を除いて最後の段の下の格子を詰め直すのに使う
      const flowRest = { ids, rest, next, cols };
      if (R.top) { d.topFlowPos = pos; d.topFlowRest = flowRest; } else { b.flowPos = pos; b.flowRest = flowRest; }
      d.flowItemPos ??= new Map();
      const bi = R.boxes.indexOf(b);
      for (const [id, k] of pos) d.flowItemPos.set(id, { region: R, r: k.r, c: [bi, k.c] });
    }
    if (R.lanes) {
      const rows = Math.max(...R.boxes.map((b) => Math.max(-1, ...[...b.flowPos.values()].map((k) => k.r)))) + 1;
      const share = { boxes: R.boxes, rows, get, rowH: null };
      for (const b of R.boxes) b.flowShare = share;
    }
  }
}

// 一般ビューの段の中の並び(GR10 P2 の画像の確認の後の指示 1): 重心法。段ごとに、線でつながる相手のうち上の段(下へ掃くとき)・
// 下の段(上へ掃くとき)にあるものの、段の中の位置(0〜1 に正規化)の平均の順に並べ直す。相手のない要素は今の位置を使う。
// 下へ・上への掃きを BARY_ROUNDS 回ずつくり返す。値が同じ組は記述の順。段を持たない要素(たどり着けないもの)は動かさない
const BARY_ROUNDS = 4;
function baryOrder(ids, layer, adj) {
  const rank = new Map(ids.map((id, i) => [id, i]));
  const L = [];
  for (const id of ids) if (layer.has(id)) (L[layer.get(id)] ??= []).push(id);
  for (let r = 0; r < L.length; r++) L[r] ??= [];
  const at = new Map();
  for (const row of L) row.forEach((id, i) => at.set(id, (i + 0.5) / row.length));
  const sweep = (r, down) => {
    const key = new Map(L[r].map((id) => {
      const ns = adj.get(id).filter((n) => at.has(n.id) && (down ? layer.get(n.id) < r : layer.get(n.id) > r));
      return [id, ns.length ? ns.reduce((s, n) => s + at.get(n.id), 0) / ns.length : at.get(id)];
    }));
    L[r].sort((a, b) => key.get(a) - key.get(b) || rank.get(a) - rank.get(b));
    L[r].forEach((id, i) => at.set(id, (i + 0.5) / L[r].length));
  };
  for (let k = 0; k < BARY_ROUNDS; k++) {
    for (let r = 1; r < L.length; r++) sweep(r, true);
    for (let r = L.length - 2; r >= 0; r--) sweep(r, false);
  }
  return L.flat();
}
// 型付けの相手の定義を、使用の真下の列に寄せる(同じ指示 1)。行を上から順に、行の中の要素を「寄せたい列」の順に並べ、
// 左から列を決める。上の行にある使用から型付けされる定義の寄せたい列は、その使用の列の平均(四捨五入)。ほかの要素は今の列。
// 寄せたい列が同じなら今の列の順(重心法の並び)。左の要素より右になるよう、足りなければ右へずらす。列の間に空きができてもよい
function alignTyped(pos, adj) {
  const rows = new Map();
  for (const [id, k] of pos) { if (!rows.has(k.r)) rows.set(k.r, []); rows.get(k.r).push(id); }
  for (const r of [...rows.keys()].sort((a, b) => a - b)) {
    const want = new Map(rows.get(r).map((id) => {
      const us = adj.get(id).filter((n) => n.typing && pos.has(n.id) && pos.get(n.id).r < r);
      return [id, us.length ? Math.round(us.reduce((s, n) => s + pos.get(n.id).c, 0) / us.length) : pos.get(id).c];
    }));
    const row = rows.get(r).sort((a, b) => want.get(a) - want.get(b) || pos.get(a).c - pos.get(b).c);
    let prev = -1;
    for (const id of row) {
      const c = Math.max(prev + 1, want.get(id));
      pos.set(id, { r, c });
      prev = c;
    }
  }
}

// GR11 案 Dx: 段に並べる前の、要素の幅の見積もり(帯の線引きで広げる分 bandMinW を除く)
function estWidths(d, get) {
  const memo = new Map();
  const size = (o) => { if (memo.has(o.id)) return memo.get(o.id); const s = o.type === 'box' ? boxSize(o, get, size) : o.type === 'note' ? noteSize(o) : o.type === 'dparam' ? dparamSize(o) : o.type === 'pnode' ? pnodeSize(o) : { w: 0, h: 0, m: { l: 0, r: 0, t: 0, b: 0 } }; memo.set(o.id, s); return s; };
  const out = new Map();
  for (const o of d.objects.values()) if (o.type === 'box' || o.type === 'note' || o.type === 'dparam' || o.type === 'pnode') { const s = size(o); out.set(o.id, s.w + s.m.l + s.m.r); }
  return out;
}

function assign(items, g, ox, oy, get, size) {
  const GAP = g.gap ?? 40;
  items.forEach((o, i) => {
    const s = size(o);
    const { c, r } = g.pos ? g.pos.get(o.id) : g.cells ? g.cells.get(o.id) : { c: i % g.cols, r: Math.floor(i / g.cols) };
    let x = ox + g.colW.slice(0, c).reduce((a, b) => a + b, 0) + GAP * c + s.m.l;
    let y = oy + g.rowH.slice(0, r).reduce((a, b) => a + b, 0) + (g.rowGap ?? GAP) * r + s.m.t;
    // 流れの段では、要素(箱そのもの)をマスの中で左右の中央に置く(上下に続く線をまっすぐにするため)
    if (g.pos) x = ox + g.colW.slice(0, c).reduce((a, b) => a + b, 0) + GAP * c + Math.floor((g.colW[c] - s.w) / 2);
    if (g.colX) { x = ox + g.colX[c] + Math.floor((g.colW[c] - s.w) / 2); y = oy + g.rowY[r] + s.m.t; }
    // 状態遷移ビューの fork・join の棒は、マスの高さの中ほど(同じ行の円の中心の高さ)に置く
    if (o.type === 'pnode' && (o.symbol === 'fork-node' || o.symbol === 'join-node')) y += 6;
    setPos(o, x, y, s, get, size);
  });
}

function setPos(o, x, y, s, get, size) {
  o.x = x; o.y = y; o.w = s.w; o.h = s.h;
  if (o.type !== 'box') return;
  // 領域の中
  const items = o.region.map(get);
  if (items.length) assign(items, s.grid, x + (s.regionOx ?? RPAD + s.regionPadL), y + (s.regionOy ?? s.headH + PAD), get, size);
  // アクションフロービューの列(perform-actions-swimlanes の中): 上と下の辺をそろえる(本文 8.2.3.17 節の注)
  if (o.laneGroup && items.length) {
    const hMax = Math.max(...items.map((k) => k.h));
    for (const k of items) { const dh = hMax - k.h; k.h = hMax; k.regionH += dh; k.compY += dh; }
  }
  // 名前の区画の下の文字の区画(状態遷移ビューの entry・do、アクションフロービューの条件と本体。preCompartments)の行の位置
  if (o.preCompartments?.length) {
    let py = y + s.nameH;
    for (const c of o.preCompartments) {
      c.y = py;
      c.lines.forEach((l, i) => { l.base = py + (i + 2) * LINE; l.rect = { x: x + PAD - 3, y: py + (i + 1) * LINE + 3, w: Math.min(s.w - 2 * PAD + 6, textWidth(l.text, FSS) + 6), h: LINE }; });
      py += (c.lines.length + 1) * LINE + 8;
      if (c.body) py += placeBody(o, c, x, py, s, get, size);
    }
  }
  o.regionY = y + s.headH;
  o.regionH = s.regionH;
  o.compY = y + s.headH + s.regionH;
  // 文字の区画の行の位置(svg.js の boxSvg と同じ): 区切りの線が cy、見出しの基線が cy + LINE、i 行目の基線が cy + (i + 2) * LINE
  let cy = o.compY;
  for (const c of o.compartments) {
    c.y = cy;
    c.lines.forEach((l, i) => { l.base = cy + (i + 2) * LINE; l.rect = { x: x + PAD - 3, y: cy + (i + 1) * LINE + 3, w: Math.min(s.w - 2 * PAD + 6, textWidth(l.text, FSS) + 6), h: LINE }; });
    cy += (c.lines.length + 1) * LINE + 8;
    if (c.body) cy += placeBody(o, c, x, cy, s, get, size);
  }
  // ポート(辺ごとに記述の順に並べる)
  for (const side of SIDES) {
    const ps = o.ports.map(get).filter((p) => p.side === side);
    let at = (side === 'l' || side === 'r' ? y + s.headH : x + 8);
    for (const p of ps) {
      const ps2 = portSize(p, get);
      const step = portStep(p, side, get);
      // 上の辺はラベルを四角の左上、下の辺は右下に書くので、四角を間隔の右寄り・左寄りに置く
      const c = side === 't' && !p.children?.length ? at + step - PORT / 2 - 4 : side === 'b' && !p.children?.length ? at + PORT / 2 + 4 : at + step / 2;
      at += step;
      if (side === 'l') { p.cx = x; p.cy = c; }
      if (side === 'r') { p.cx = x + s.w; p.cy = c; }
      if (side === 't') { p.cx = c; p.cy = y; }
      if (side === 'b') { p.cx = c; p.cy = y + s.h; }
      p.pw = ps2.w; p.ph = ps2.h;
      placeNested(p, get);
    }
  }
}

// 区画の中の本体の図(アクションフロービューの action-flow-view。GR7)を、区画の文字の下に置く。戻り値は使った高さ。
// 本体の箱は持ち主の箱の幅いっぱいに広げ(左右 BODY_IN ずつあける)、中の格子を中央に置く
const BODY_IN = 4;
function placeBody(o, c, x, y, s, get, size) {
  const b = get(c.body);
  const bs = size(b);
  const w = Math.max(bs.w, s.w - 2 * BODY_IN);
  setPos(b, x + (s.w - w) / 2, y, { ...bs, w, regionOx: bs.regionOx + (w - bs.w) / 2 }, get, size);
  return bs.h + 4;
}

// 入れ子のポートを持つポートの、子のポートの位置(外側の辺に並べる)
function placeNested(p, get) {
  const kids = (p.children ?? []).map(get);
  if (!kids.length) return;
  const vertical = p.side === 'l' || p.side === 'r';
  // ラベル(と矢印)を長い四角の端に書き、子のポートはその後ろに並べる
  let at = (vertical ? p.cy - p.ph / 2 : p.cx - p.pw / 2) + holderHead(p);
  for (const k of kids) {
    const ks = portSize(k, get);
    k.pw = ks.w; k.ph = ks.h;
    const step = portStep(k, p.side, get);
    const c = p.side === 't' && !k.children?.length ? at + step - PORT / 2 - 4 : p.side === 'b' && !k.children?.length ? at + PORT / 2 + 4 : at + step / 2;
    at += step;
    if (p.side === 'l') { k.cx = p.cx - p.pw / 2; k.cy = c; }
    if (p.side === 'r') { k.cx = p.cx + p.pw / 2; k.cy = c; }
    if (p.side === 't') { k.cx = c; k.cy = p.cy - p.ph / 2; }
    if (p.side === 'b') { k.cx = c; k.cy = p.cy + p.ph / 2; }
    placeNested(k, get);
  }
}

// 入れ子のポートを持つポートの、ラベルと矢印の分の長さ
export function holderHead(p) { return textWidth(p.label, FSS) + 28; }

// 辺に沿ったポートの間隔。上と下の辺では、ラベル(四角の左上・右下に書く)が隣と重ならない幅をとる
function portStep(p, side, get) {
  const s = portSize(p, get);
  // ラベルの長さに合わせて広げる(GR4 P2 の 3 回目の裁定 3)。左右の辺では、ラベルの高さと上下の余白をとる
  if (side === 'l' || side === 'r') return Math.max(PSTEP + 4, s.h + 16);
  const lw = p.children?.length ? 0 : textWidth(p.label, FSS) + 8;
  return Math.max(PSTEP, s.w + 16, lw + PORT + 20);
}

export function portSize(p, get) {
  if (p.type === 'proxy') return { w: 10, h: 10 };
  const kids = p.children ?? [];
  if (!kids.length) return { w: PORT, h: PORT };
  const side = p.side ?? 't';
  const long = holderHead(p) + kids.reduce((a, id) => a + portStep(get(id), side, get), 0) + 8;
  // 長い四角は持ち主の縁をまたぐので、ラベルと矢印を縁より外側の半分に書けるよう太さを 36 にする
  return p.side === 'l' || p.side === 'r' ? { w: 36, h: long } : { w: long, h: 36 };
}

// ポートのラベルの幅と、ポートが箱の外へはみ出す量(格子の余白にする)
function portMargins(o, get) {
  const m = { l: 0, r: 0, t: 0, b: 0 };
  const walk = (p, depth) => {
    const ps = portSize(p, get);
    const lw = p.children?.length ? 0 : textWidth(p.label, FSS) + 6;
    const out = (p.side === 'l' || p.side === 'r' ? ps.w : ps.h) / 2 + depth * 9;
    if (p.side === 'l') m.l = Math.max(m.l, out + lw + 4);
    if (p.side === 'r') m.r = Math.max(m.r, out + lw + 4);
    if (p.side === 't') m.t = Math.max(m.t, out + LINE + 4);
    if (p.side === 'b') m.b = Math.max(m.b, out + LINE + 4);
    for (const k of p.children ?? []) walk(get(k), depth + 1);
  };
  for (const id of o.ports) walk(get(id), 0);
  return m;
}

// 枠なしの箱(plain。本体の図 action-flow-view、列の入れ物 perform-actions-swimlanes、列の外の節点の入れ物)の大きさ。
// 名前の区画を持たず、領域だけからなる。列の入れ物(laneGroup)は、列を間隔 0・余白 0 で 1 行に並べる
function plainSize(o, get, size) {
  const items = o.region.map(get);
  const lanes = !!o.laneGroup;
  const g = grid(items, size, lanes ? 0 : Math.max(GAP, o.minGap ?? 0, ...(o.markerEdges ?? []).map((k) => k * 22 + 50)), lanes || o.rowLayout ? Math.max(1, items.length) : null, lanes, flowOf(o), o.noteCells);
  // 流れの段で列と行をそろえるとき、列の外の要素(helper)は、列の頭の高さだけ下げる
  const laneHead = o.helper && o.flowShare ? Math.max(0, ...o.flowShare.boxes.filter((b) => !b.helper).map((b) => size(b).headH)) : 0;
  const padX = lanes ? 0 : RPAD, padY = (lanes ? 0 : PAD) + laneHead;
  const regionPadL = o.labelPad ?? 0;
  const ellipsisH = o.ellipsis ? LINE : 0;
  const markerH = (o.markerEdges ?? []).length ? Math.max(...o.markerEdges) * LINE + 6 : 0;
  const regionW = items.length ? g.w + 2 * padX + 2 * regionPadL : 0;
  let regionH = items.length ? g.h + padY + (lanes ? 0 : RPAD) + ellipsisH + markerH : ellipsisH ? ellipsisH + 4 : 0;
  if (o.fit) regionH = Math.min(regionH, o.fit.regionH); // GR14 の F(fitOuterBoxes。本体の図は高さだけを詰める)
  const w = Math.ceil(Math.max(lanes ? 0 : 40, regionW, o.ellipsis ? 40 : 0));
  const h = Math.ceil(Math.max(lanes ? 0 : 20, regionH));
  return { w, h, m: { l: 0, r: 0, t: 0, b: 0 }, grid: g, headH: 0, nameH: 0, regionH: h, regionPadL, regionOx: padX + regionPadL, regionOy: padY };
}

// 流れの段の行と列(flowPositions で求めたもの。求めていなければ null で、記述の順の格子になる)
const flowOf = (o) => (o.flowPos && !o.rowLayout ? { pos: o.flowPos, share: o.flowShare ?? null, loopGap: o.loopGap ?? 0 } : null);

function boxSize(o, get, size) {
  if (o.plain) return plainSize(o, get, size);
  const head = o.header;
  let headW = Math.max(textWidth(head.keyword, FSS), textWidth(head.name, FS, true)) + 2 * PAD;
  // 名前の区画の前後の行(状態遷移ビューの «exhibit-state»・«parallel»・本体の文字)
  const extra = [...(head.before ?? []), ...(head.after ?? [])];
  if (extra.length) headW = Math.max(headW, ...extra.map((t) => textWidth(t, FSS) + 2 * PAD));
  // アクションフロービューの send・accept の箱の左上の印(GR7 P1 の裁定 Q6)の分、名前の区画を広げる
  // (キーワードは中央に書くので、左右に印の幅 + 8 ずつとる)
  if (o.icon) headW += 2 * (ICON_W + 8);
  // 上の辺のポートが箱の中へはみ出す分だけ、名前の区画を下げる
  const topInset = Math.max(0, ...o.ports.map(get).filter((p) => p.side === 't').map((p) => portSize(p, get).h / 2 + 2));
  o.headInset = topInset;
  let headH = 2 * LINE + 8 + topInset;
  if (extra.length) headH += extra.length * LINE;
  // 名前の区画の下に置く文字の区画(状態遷移ビューの entry・do)は、名前の区画の一部として高さに入れる
  const nameH = headH;
  let preW = 0;
  for (const c of o.preCompartments ?? []) {
    preW = Math.max(preW, textWidth(c.title, FSS) + 2 * PAD, ...c.lines.map((l) => textWidth(l.text, FSS) + 2 * PAD));
    headH += (c.lines.length + 1) * LINE + 8;
    if (c.body) { const bs = size(get(c.body)); preW = Math.max(preW, bs.w + 2 * BODY_IN); headH += bs.h + 4; }
  }
  const items = o.region.map(get);
  // 線の上の印(フロー)を持つ線がある領域は、印が並ぶよう格子の間隔を広げる
  const g = grid(items, size, Math.max(GAP, o.minGap ?? 0, ...(o.markerEdges ?? []).map((k) => k * 22 + 50)), o.rowLayout ? Math.max(1, items.length) : null, false, flowOf(o), o.noteCells);
  // 左の辺のポートのラベルが領域の中へ入らないよう、左右に余白をとる
  // 状態遷移ビューは、端の列の線の脇に遷移のラベルを置けるよう、左右の余白を広げる(labelPad。相互接続ビューにはない)
  const regionPadL = o.labelPad ?? 0;
  let regionW = items.length ? g.w + 2 * RPAD + 2 * regionPadL : 0;
  const ellipsisH = o.ellipsis ? LINE : 0;
  // 線の上の印のラベル(線の中ほどの下に縦に並べる)の分の高さ
  const markerH = (o.markerEdges ?? []).length ? Math.max(...o.markerEdges) * LINE + 6 : 0;
  let regionH = items.length ? g.h + PAD + RPAD + ellipsisH + markerH : ellipsisH ? ellipsisH + 4 : 0;
  // GR14 の F: 中身に合わせた大きさ(fitOuterBoxes が決める)。領域の幅と高さを、それより大きくしない
  if (o.fit) { regionW = Math.min(regionW, o.fit.w); regionH = Math.min(regionH, o.fit.regionH); }
  let compW = 0, compH = 0;
  for (const c of o.compartments) {
    compW = Math.max(compW, textWidth(c.title, FSS) + 2 * PAD, ...c.lines.map((l) => textWidth(l.text, FSS) + 2 * PAD));
    compH += (c.lines.length + 1) * LINE + 8;
    if (c.body) { const bs = size(get(c.body)); compW = Math.max(compW, bs.w + 2 * BODY_IN); compH += bs.h + 4; }
  }
  const along = (side) => o.ports.map(get).filter((p) => p.side === side).reduce((a, p) => a + portStep(p, side, get), 0);
  const w = Math.ceil(Math.max(MINW, headW, regionW, compW, along('t') + 48, along('b') + 48, preW));
  const h = Math.ceil(Math.max(MINH, headH + regionH + compH + 6, headH + along('l') + 10, headH + along('r') + 10));
  // GR14 の F の検査(outerBlanks)のために、領域によらない最小の幅と高さを残す
  if (o.fit) o.fitMin = { w: Math.ceil(Math.max(MINW, headW, compW, along('t') + 48, along('b') + 48, preW)), h: Math.ceil(Math.max(MINH, headH + along('l') + 10, headH + along('r') + 10)) };
  return { w, h, m: portMargins(o, get), grid: g, headH, nameH, regionH: h - headH - compH - 6 > regionH ? h - headH - compH - 6 : regionH, regionPadL };
}

export function noteSize(o) {
  const all = [...o.heading.map((t) => textWidth(t, FSS)), ...o.lines.map((t) => textWidth(t, FSS))];
  const w = Math.ceil(Math.max(80, (all.length ? Math.max(...all) : 0) + 2 * PAD + 12));
  const h = Math.ceil(Math.max(36, (o.heading.length + o.lines.length) * LINE + 2 * PAD + (o.heading.length && o.lines.length ? 4 : 0)));
  return { w, h, m: { l: 0, r: 0, t: 0, b: 0 } };
}

// 状態遷移ビューの節点(start-node・done-node・terminate-node・fork-node・join-node・decision-node・merge-node と、
// 空の entry の黒い角の丸い四角)の大きさ。本文の図の比で決めた(GR6 P1 の裁定 Q16)。fork・join の棒は、つながる線の数で伸ばす
export function pnodeSize(o) {
  const z = { l: 0, r: 0, t: 0, b: 0 };
  switch (o.symbol) {
    case 'start-node': return { w: 18, h: 18, m: z };
    case 'done-node': return { w: 22, h: 22, m: z };
    case 'terminate-node': return { w: 20, h: 20, m: z };
    case 'fork-node': case 'join-node': return { w: Math.max(60, 26 * (o.degree ?? 0) + 20), h: 6, m: z };
    case 'decision-node': case 'merge-node': return { w: 30, h: 30, m: z };
    default: return { w: 20, h: 12, m: z }; // entry-action(空の entry の黒い角の丸い四角)
  }
}

function dparamSize(o) {
  const tw = textWidth(o.label, FSS);
  if (o.symbol === 'actor') return { w: Math.ceil(Math.max(40, tw + 8)), h: 64, m: { l: 0, r: 0, t: 0, b: 0 } };
  const kw = textWidth(`«${o.symbol}»`, FSS);
  return { w: Math.ceil(Math.max(80, tw + 2 * PAD, kw + 2 * PAD)), h: 2 * LINE + 12, m: { l: 0, r: 0, t: 0, b: 0 } };
}

// ---- 線
export function centerOf(o, get) {
  if (o.type === 'port' || o.type === 'proxy') return { x: o.cx, y: o.cy };
  if (o.type === 'dot') return { x: o.cx, y: o.cy };
  return { x: o.x + o.w / 2, y: o.y + o.h / 2 };
}
function centroid(ps) {
  const n = ps.length || 1;
  return { x: Math.round(ps.reduce((a, p) => a + p.x, 0) / n), y: Math.round(ps.reduce((a, p) => a + p.y, 0) / n) };
}
// a が b を(入れ子で)含むか
export function contains(a, b, get) {
  for (let x = b; x; ) {
    const pid = x.parent ?? x.owner ?? null;
    if (!pid) return false;
    if (pid === a.id) return true;
    x = get(pid);
  }
  return false;
}
function sideToward(box, p, inside) {
  const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
  if (inside) {
    // 中の相手: 最も近い辺
    // 上の辺は名前の区画があるので避ける
    const ds = { l: p.x - box.x, r: box.x + box.w - p.x, t: box.type === 'box' ? Infinity : p.y - box.y, b: box.y + box.h - p.y };
    return SIDES.reduce((a, s) => (ds[s] < ds[a] ? s : a), 'l');
  }
  const dx = p.x - cx, dy = p.y - cy;
  if (Math.abs(dx) * box.h >= Math.abs(dy) * box.w) return dx < 0 ? 'l' : 'r';
  return dy < 0 ? 't' : 'b';
}
const NORMAL = { l: [-1, 0], r: [1, 0], t: [0, -1], b: [0, 1] };

// 線の端の点と向き
function anchor(o, other, get) {
  const oc = centerOf(other, get);
  if (o.type === 'port' || o.type === 'proxy') {
    const owner = get(o.owner);
    const inward = contains(owner, other, get) || (owner.type === 'port' && contains(get(topOwner(o, get)), other, get));
    const [nx, ny] = NORMAL[o.side ?? 't'];
    const sgn = inward ? -1 : 1;
    const half = (o.side === 'l' || o.side === 'r' ? (o.pw ?? PORT) : (o.ph ?? PORT)) / 2;
    return { x: o.cx + nx * half * sgn, y: o.cy + ny * half * sgn, dx: nx * sgn, dy: ny * sgn };
  }
  if (o.type === 'dot') {
    const dx = oc.x - o.cx, dy = oc.y - o.cy;
    const h = Math.abs(dx) >= Math.abs(dy);
    return { x: o.cx, y: o.cy, dx: h ? Math.sign(dx) || 1 : 0, dy: h ? 0 : Math.sign(dy) || 1 };
  }
  const inside = contains(o, other, get);
  // o が other の中にあるとき(注釈とそれを持つ箱など)は、other の最も近い辺の側へ出す
  const s = contains(other, o, get) ? sideToward(other, centerOf(o, get), true) : sideToward(o, oc, inside);
  const [nx, ny] = NORMAL[s];
  const sgn = inside ? -1 : 1;
  let x, y;
  if (s === 'l' || s === 'r') { x = s === 'l' ? o.x : o.x + o.w; y = inside ? clamp(oc.y, o.y + 8, o.y + o.h - 8) : o.y + o.h / 2; }
  else { y = s === 't' ? o.y : o.y + o.h; x = inside ? clamp(oc.x, o.x + 8, o.x + o.w - 8) : o.x + o.w / 2; }
  return { x, y, dx: nx * sgn, dy: ny * sgn };
}
function topOwner(o, get) { let x = o; while (x.owner && get(x.owner).type === 'port') x = get(x.owner); return x.owner; }
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---- 線を引く(GR4 P2 の 2 回目の裁定 2)
//   線ごとに、避ける箱(src/view/quality.js の obstaclesFor)の縁から少し離した線と、端から出した点を通る線で
//   格子を作り、曲がる数と長さの少ない経路をダイクストラ法で探す。避ける箱を横切る区間と、先に引いた線と
//   重なる区間は大きく減点する(避けられないときだけ通る)。
//   1 回目: 箱の形の端は 4 辺を候補にして引き、着く辺を決める。
//   2 回目: 同じ辺に着く線の着く点を辺の上に等間隔に分け(相手の向きの順)、ポートに着く複数の線は面の上でずらして、
//          すべての線を引き直す。
const M = 12;            // 箱の縁から線までの距離
const STUB = 14;         // 端から辺に垂直に出す長さ
const BEND = 24;         // 曲がり 1 回の重み
const CROSS = 1e6;       // 避ける箱を横切る重み
const OVERLAP = 2e4;     // 先に引いた線と重なる重み
const HUG = 5e4;         // 箱の縁から 3 px 以内を縁と平行に走る重み(GR4 P2 の 3 回目の裁定 1)
const NEAR = 1e4;        // 先に引いた線と 6 px 以内で平行に並ぶ重み(同上)
const LABEL = 5e4;       // ポートのラベルの場所を通る重み
const PORTHIT = 2e5;     // ほかの線のポート・引数・proxy の記号を通る重み(GR4 の完了報告の確認の後の 2 回目の指示 2)
const UTURN = 1.5e4;     // コの字(折れた後、1 つ前の区間と逆向きに折れる)の重み(同上)
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

function routeAll(d, get) {
  for (const o of d.objects.values()) if (o.type === 'dot') moveDotOutside(o, d, get);
  if (d.fig15?.R) for (const o of d.objects.values()) if (o.type === 'dparam' && o.symbol === 'actor') { STICK.add(o); if (d.fig15.R2) HAND.add(o); }
  const banded = d.bandRoute ? routeBands(d, get) : new Set();
  if (d.bandRoute) routeInnerNotes(d, get, banded);
  const edges = d.edges.filter((e) => !banded.has(e));
  const seeded = () => { const u = makeUsed(); for (const e of d.edges) if (banded.has(e)) addUsed(u, e.points); return u; };
  // ポートに着く線の、面の上のずれ
  const atPort = new Map();
  for (const e of edges) for (const id of [e.from, e.to]) { const o = get(id); if (o.type === 'port' || o.type === 'proxy') { if (!atPort.has(id)) atPort.set(id, []); atPort.get(id).push(e); } }
  const portOffset = (o, e) => { const l = atPort.get(o.id) ?? [e]; const n = l.length, k = l.indexOf(e); const half = Math.min(5, ((o.side === 'l' || o.side === 'r' ? o.ph : o.pw) ?? PORT) / 2 - 2); return n <= 1 ? 0 : -half + (2 * half * k) / (n - 1); };
  // 1 回目(着く辺を決める): 着く点を分ける前なので、線どうしの重なりは減点しない
  const chosen = new Map(); // e.id → { from: cand, to: cand }
  let used = seeded();
  for (const e of edges) {
    if (e.loop) continue;
    const A = get(e.from), B = get(e.to);
    const r = findRoute(A, B, endCands(A, B, get, (o) => portOffset(o, e)), endCands(B, A, get, (o) => portOffset(o, e)), d, get, used);
    chosen.set(e.id, r);
  }
  // 着く点を分ける: (箱の形の要素, 辺) ごとに、相手の向きの順に並べて等間隔に置く
  const groups = new Map();
  for (const e of edges) {
    if (e.loop) continue;
    const r = chosen.get(e.id);
    for (const [end, cand, other] of [['from', r.a, r.pts[1]], ['to', r.b, r.pts[r.pts.length - 2]]]) {
      if (!cand.side || cand.inner) continue;
      const key = `${cand.obj}|${cand.side}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ e, end, cand, along: cand.side === 'l' || cand.side === 'r' ? other.y : other.x });
    }
  }
  const fixed = new Map(); // `${e.id}|${end}` → cand
  const banned = new Map(); // `${e.id}|${end}` → 使わない辺(状態遷移ビューの fork・join の棒の左右の辺に 2 本目以降が着くとき)
  for (const [key, list] of groups) {
    list.sort((p, q) => p.along - q.along || (p.e.id < q.e.id ? -1 : 1));
    const o = get(list[0].cand.obj);
    if (list.length > 1 && o.type === 'pnode' && (o.symbol === 'fork-node' || o.symbol === 'join-node') && (list[0].cand.side === 'l' || list[0].cand.side === 'r')) {
      fixed.set(`${list[0].e.id}|${list[0].end}`, { ...list[0].cand });
      for (const it of list.slice(1)) banned.set(`${it.e.id}|${it.end}`, it.cand.side);
      continue;
    }
    // その辺に着く線が 1 本だけなら、1 回目に選んだ点をそのまま使う
    if (list.length === 1) { fixed.set(`${list[0].e.id}|${list[0].end}`, { ...list[0].cand }); continue; }
    list.forEach((it, k) => {
      const t = (k + 1) / (list.length + 1);
      const c = { ...it.cand };
      const [r1, r2] = sideRange(o, c.side);
      if (c.side === 'l' || c.side === 'r') c.ay = r1 + (r2 - r1) * t;
      else c.ax = r1 + (r2 - r1) * t;
      c.sx = c.ax + c.dx * STUB; c.sy = c.ay + c.dy * STUB;
      fixed.set(`${it.e.id}|${it.end}`, c);
    });
  }
  // 2 回目
  used = seeded();
  for (const e of edges) {
    if (e.loop) continue;
    const A = get(e.from), B = get(e.to);
    const r0 = chosen.get(e.id);
    const ca = fixed.get(`${e.id}|from`) ? [fixed.get(`${e.id}|from`)] : r0.a.inner ? [r0.a] : endCands(A, B, get, (o) => portOffset(o, e)).filter((c) => c.side !== banned.get(`${e.id}|from`));
    const cb = fixed.get(`${e.id}|to`) ? [fixed.get(`${e.id}|to`)] : r0.b.inner ? [r0.b] : endCands(B, A, get, (o) => portOffset(o, e)).filter((c) => c.side !== banned.get(`${e.id}|to`));
    const r = findRoute(A, B, ca, cb, d, get, used);
    e.points = simplify(r.pts);
    addUsed(used, e.points);
  }
  // 状態遷移ビューの、始点と終点が同じ線(e.loop): 箱の右の辺から出て、右上を回って上の辺に着く。
  // 各区間を LOOP px 以上にして、コの字(UTURN_SHORT 以下の区間で折り返す形)にしない
  // 回す角(右上・右下・左上・左下)と大きさを候補にし、ほかの箱(この箱を中に含むものを除く)を横切る数と、
  // 縁に沿う数と、先に引いた線との重なりが最も少ないものを選ぶ(同じなら候補の順)
  for (const e of edges) {
    if (!e.loop) continue;
    const o = get(e.from);
    const others = d.boxLike.filter((b) => b !== o && !containsObj(b, o, get));
    let best = null;
    for (const L of [36, 52, 68]) for (const [sx, sy] of [[1, -1], [1, 1], [-1, -1], [-1, 1]]) {
      const xe = sx > 0 ? o.x + o.w : o.x, ye = sy < 0 ? o.y : o.y + o.h;
      const ya = sy < 0 ? o.y + Math.min(o.h / 2, L) : o.y + o.h - Math.min(o.h / 2, L);
      const xb = xe - sx * Math.min(o.w / 2, 2 * L);
      const pts = [{ x: xe, y: ya }, { x: xe + sx * L, y: ya }, { x: xe + sx * L, y: ye + sy * L }, { x: xb, y: ye + sy * L }, { x: xb, y: ye }];
      let cost = 0;
      for (let i = 0; i + 1 < pts.length; i++) {
        for (const b of others) { if (segHitsRect(pts[i], pts[i + 1], b, 1)) cost += 100; if (hugsBorder(pts[i], pts[i + 1], b, HUG_GAP)) cost += 10; }
        if (o.parent && hugsBorder(pts[i], pts[i + 1], get(o.parent), HUG_GAP)) cost += 10;
        // 持ち主の箱の名前の区画(と entry・do の区画)を通らない
        const par = o.parent ? get(o.parent) : null;
        if (par?.type === 'box' && segHitsRect(pts[i], pts[i + 1], { x: par.x, y: par.y, w: par.w, h: par.regionY - par.y }, 0)) cost += 50;
        if (overlapsUsed(used, pts[i], pts[i + 1]) || nearUsed(used, pts[i], pts[i + 1])) cost += 5;
        if (pts[i].x < 1 || pts[i].y < 1) cost += 100;
      }
      if (!best || cost < best.cost) best = { cost, pts };
    }
    e.points = best.pts;
    addUsed(used, e.points);
  }
  // 線の端の仕上げ。状態遷移ビューでは常に、ほかのビューでは d.fixAllEnds(src/view/index.js の UNIFIED_EDGES)のときに当てる。
  // 仕上げの前の点と、仕上げで引き直した線を d.endFix に残す(index.js で、図の質が増えた線の引き直しを取り消すのに使う)
  if (d.stateView || d.fixAllEnds) {
    const before = new Map(d.edges.map((e) => [e.id, e.points]));
    // 帯の線引きの線には仕上げを当てない(GR10 P2 の帯の線引きの試し)
    fixStateEnds(banded.size ? { ...d, edges } : d, get);
    d.endFix = { before, moved: d.edges.filter((e) => e.points !== before.get(e.id)).map((e) => e.id) };
  }
}

// ---- 線の端の仕上げ(GR6 P2 の確認の後の裁定 1 の (2) と 2。GR7 で、UNIFIED_EDGES のときは相互接続ビューにも当てる)
// 次のどちらかに当たる線の端を、箱・節点の辺の別の位置(か別の辺)に移して、その線だけを引き直す(最大 4 回)。
//   - 終点の矢じりが、ほかの線の矢じりと重なる(矢じりの外接矩形を 2 px 広げて比べる。src/view/quality.js の (e))
//   - 端が、ほかの線がその辺を横切る位置から 10 px 以内にある(ほかの線から出ているように見える)
// 移す先の候補は、各辺の 10 分の 1〜10 分の 9(節点は各辺の中点。fork・join の棒は上下の辺の 4 分の 1・2 分の 1・4 分の 3)。
// 矢じりが重ならず、横切る位置・ほかの線の端から 10 px 以上離れたものから、経路の重みの最も小さいものを選ぶ
const NEAR_END = 10;
// 小さな段: 同じ向きの 2 つの区間の間の、JOG px 以下の短い区間(P2 の確認の後の裁定 1 の「できれば」)
const JOG = 8;
function jogsOf(pts) {
  let k = 0;
  for (let i = 0; i + 3 < pts.length; i++) {
    const a = [Math.sign(pts[i + 1].x - pts[i].x), Math.sign(pts[i + 1].y - pts[i].y)], c = [Math.sign(pts[i + 3].x - pts[i + 2].x), Math.sign(pts[i + 3].y - pts[i + 2].y)];
    const mid = Math.abs(pts[i + 2].x - pts[i + 1].x) + Math.abs(pts[i + 2].y - pts[i + 1].y);
    if (a[0] === c[0] && a[1] === c[1] && mid <= JOG) k++;
  }
  return k;
}
const uturnsOf = (pts) => {
  let k = 0;
  for (let i = 0; i + 3 < pts.length; i++) {
    const d1x = Math.sign(pts[i + 1].x - pts[i].x), d1y = Math.sign(pts[i + 1].y - pts[i].y), d3x = Math.sign(pts[i + 3].x - pts[i + 2].x), d3y = Math.sign(pts[i + 3].y - pts[i + 2].y);
    const l1 = Math.abs(pts[i + 1].x - pts[i].x) + Math.abs(pts[i + 1].y - pts[i].y), l3 = Math.abs(pts[i + 3].x - pts[i + 2].x) + Math.abs(pts[i + 3].y - pts[i + 2].y);
    if (d1x === -d3x && d1y === -d3y && (d1x || d1y) && Math.min(l1, l3) <= 30) k++;
  }
  return k;
};
const FIX_STUB = STUB;
function arrowRect(t, ux, uy) {
  const xs = [t.x, t.x - ux * 11 - uy * 5, t.x - ux * 11 + uy * 5], ys = [t.y, t.y - uy * 11 - ux * 5, t.y - uy * 11 + ux * 5];
  return { x1: Math.min(...xs) - 2, x2: Math.max(...xs) + 2, y1: Math.min(...ys) - 2, y2: Math.max(...ys) + 2 };
}
const rectsHit = (a, b) => a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2;
// 線の端の点が、箱の形の要素 o のどの辺の上にあるか
function sideAt(o, p) {
  if (Math.abs(p.x - o.x) < 0.6) return 'l';
  if (Math.abs(p.x - (o.x + o.w)) < 0.6) return 'r';
  if (Math.abs(p.y - o.y) < 0.6) return 't';
  if (Math.abs(p.y - (o.y + o.h)) < 0.6) return 'b';
  return null;
}
function fixStateEnds(d, get) {
  const edges = d.edges.filter((e) => e.points?.length >= 2);
  const endInfo = (e, end) => {
    const o = get(end === 'from' ? e.from : e.to);
    const other = get(end === 'from' ? e.to : e.from);
    if (!o || !(o.type === 'box' || o.type === 'pnode') || containsObj(o, other, get) || e.loop) return null;
    const p = end === 'from' ? e.points[0] : e.points[e.points.length - 1];
    const side = sideAt(o, p);
    return side ? { o, p, side } : null;
  };
  const arrowOf = (e) => {
    if (!ARROW_END.has(e.symbol)) return null;
    const t = e.points[e.points.length - 1], q = e.points[e.points.length - 2];
    return arrowRect(t, Math.sign(t.x - q.x), Math.sign(t.y - q.y));
  };
  // 辺の上で、ほかの線(except を除く)がその辺を横切る位置と、ほかの線の端の位置
  const marksOn = (o, side, except) => {
    const out = [];
    const vertical = side === 'l' || side === 'r';
    const line = side === 'l' ? o.x : side === 'r' ? o.x + o.w : side === 't' ? o.y : o.y + o.h;
    const [lo, hi] = vertical ? [o.y, o.y + o.h] : [o.x, o.x + o.w];
    for (const f of edges) {
      if (f === except) continue;
      for (let i = 0; i + 1 < f.points.length; i++) {
        const a = f.points[i], b = f.points[i + 1];
        if (vertical && a.y === b.y && Math.min(a.x, b.x) <= line && Math.max(a.x, b.x) >= line && a.y > lo && a.y < hi) out.push(a.y);
        if (!vertical && a.x === b.x && Math.min(a.y, b.y) <= line && Math.max(a.y, b.y) >= line && a.x > lo && a.x < hi) out.push(a.x);
      }
    }
    return out;
  };
  const along = (side, p) => (side === 'l' || side === 'r' ? p.y : p.x);
  const badEnd = (e, end) => {
    const info = endInfo(e, end);
    if (!info) return false;
    if (marksOn(info.o, info.side, e).some((c) => Math.abs(c - along(info.side, info.p)) < NEAR_END)) return true;
    if (end === 'to') {
      const r = arrowOf(e);
      if (r && edges.some((f) => f !== e && (() => { const q = arrowOf(f); return q && rectsHit(r, q); })())) return true;
    }
    return false;
  };
  // 線 e の端 end を動かす案(動かせなければ null)。score はコの字と横切りを 1e6 とし、長さと曲がる数を足したもの
  const plan = (e, end) => {
      const info = endInfo(e, end);
      // 端が箱・節点の辺の上にない(引数・proxy に着く)なら動かせない(GR7 で、矢じりの重なりの組の片方がそうなる場合に
      // null のまま使って例外になっていたのを直した)
      if (!info) return null;
      const A = get(e.from), B = get(e.to);
      const others = edges.filter((f) => f !== e);
      const used = makeUsed();
      for (const f of others) addUsed(used, f.points);
      // 動かさない端は、今の点のまま
      const keep = (which) => {
        const pts = e.points;
        const p0 = which === 'from' ? pts[0] : pts[pts.length - 1], p1 = which === 'from' ? pts[1] : pts[pts.length - 2];
        const dx = Math.sign(p1.x - p0.x), dy = Math.sign(p1.y - p0.y);
        return { obj: which === 'from' ? e.from : e.to, side: null, ax: p0.x, ay: p0.y, sx: p0.x + dx * Math.min(STUB, Math.abs(p1.x - p0.x) + Math.abs(p1.y - p0.y)), sy: p0.y + dy * Math.min(STUB, Math.abs(p1.x - p0.x) + Math.abs(p1.y - p0.y)), dx, dy };
      };
      const candsFor = (which, o) => {
      const bar = o.type === 'pnode' && (o.symbol === 'fork-node' || o.symbol === 'join-node');
      const cands = [];
      // R の棒人間: 下の辺は使わず、左右の辺は図形の左右の端(endCands と同じ)
      const st = stickOf(o);
      for (const side of st ? ['l', 'r', 't'] : ['l', 'r', 't', 'b']) {
        const ts = o.type === 'pnode' ? (bar && (side === 't' || side === 'b') ? [0.25, 0.5, 0.75] : [0.5]) : st?.hand != null && side !== 't' ? [0.5] : [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];
        const [r1, r2] = sideRange(o, side);
        const marks = [...marksOn(o, side, e), ...others.flatMap((f) => ['from', 'to'].map((w) => endInfo(f, w)).filter((x) => x && x.o === o && x.side === side).map((x) => along(side, x.p)))];
        for (const t of ts) {
          const at = r1 + (r2 - r1) * t;
          if (marks.some((c) => Math.abs(c - at) < NEAR_END)) continue;
          const [nx, ny] = NORMAL[side];
          const ax = side === 'l' ? (st ? st.x1 : o.x) : side === 'r' ? (st ? st.x2 : o.x + o.w) : at, ay = side === 't' ? o.y : side === 'b' ? o.y + o.h : at;
          if (which === 'to' && ARROW_END.has(e.symbol)) {
            const r = arrowRect({ x: ax, y: ay }, -nx, -ny);
            if (others.some((f) => { const q = arrowOf(f); return q && rectsHit(r, q); })) continue;
          }
          cands.push({ obj: o.id, side, ax, ay, sx: ax + nx * FIX_STUB, sy: ay + ny * FIX_STUB, dx: nx, dy: ny });
        }
      }
      return cands;
      };
      const cands = candsFor(end, info.o);
      if (!cands.length) return null;
      // 反対の端は、今の点か、同じ条件を満たす別の点(反対の端が箱・節点の辺の上にあるとき)
      const oend = end === 'to' ? 'from' : 'to';
      const oinfo = endInfo(e, oend);
      const ocands = [keep(oend), ...(oinfo ? candsFor(oend, oinfo.o) : [])];
      // 候補ごとに引いてみて、コの字(UTURN_SHORT 以下の区間で折り返す形)にならないものを優先し、次に長さと曲がる数の少ないもの
      let best = null;
      for (const c of cands) {
        const r = end === 'to' ? findRoute(A, B, ocands, [c], d, get, used) : findRoute(A, B, [c], ocands, d, get, used);
        const pts = simplify(r.pts);
        let len = 0;
        for (let i = 0; i + 1 < pts.length; i++) len += Math.abs(pts[i + 1].x - pts[i].x) + Math.abs(pts[i + 1].y - pts[i].y);
        const uturn = uturnsOf(pts), jogs = jogsOf(pts);
        const crosses = obstaclesFor(A, B, d, get).filter((ob) => pts.some((p, i) => i + 1 < pts.length && segHitsRect(p, pts[i + 1], ob))).length;
        // ほかの線と重なる・6 px 以内で並ぶ区間(図の質の (b))
        let near = 0;
        for (let i = 0; i + 1 < pts.length; i++) if (overlapsUsed(used, pts[i], pts[i + 1]) || nearUsed(used, pts[i], pts[i + 1])) near++;
        const score = (uturn + crosses + near) * 1e6 + jogs * 1e4 + len + BEND * (pts.length - 2);
        if (!best || score < best.score) best = { score, pts, uturn, crosses, jogs, near };
      }
      return best;
  };
  for (let round = 0; round < 4; round++) {
    const movers = [];
    const seen = new Set();
    for (const e of edges) for (const end of ['to', 'from']) {
      if (seen.has(`${e.id}|${end}`) || !badEnd(e, end)) continue;
      seen.add(`${e.id}|${end}`);
      // 矢じりの重なりは、組の 2 本のうち、動かした案の点数の良い方を動かす
      let partner = null;
      if (end === 'to' && ARROW_END.has(e.symbol)) {
        const r = arrowOf(e);
        partner = edges.find((f) => f !== e && (() => { const q = arrowOf(f); return q && rectsHit(r, q); })()) ?? null;
        if (partner) seen.add(`${partner.id}|to`);
      }
      movers.push({ e, end, partner });
    }
    // 小さな段のある線: 両方の端の案のうち良い方を、段が減り、コの字と横切りが増えないときだけ採る
    const jogMovers = edges.filter((e) => !e.loop && jogsOf(e.points) > 0 && !movers.some((m) => m.e === e || m.partner === e));
    if (!movers.length && !jogMovers.length) break;
    let changed = false;
    for (const e of jogMovers) {
      const A = get(e.from), B = get(e.to);
      const crossNow = obstaclesFor(A, B, d, get).filter((ob) => e.points.some((p, i) => i + 1 < e.points.length && segHitsRect(p, e.points[i + 1], ob))).length;
      const used = makeUsed();
      for (const f of edges) if (f !== e) addUsed(used, f.points);
      let nearNow = 0;
      for (let i = 0; i + 1 < e.points.length; i++) if (overlapsUsed(used, e.points[i], e.points[i + 1]) || nearUsed(used, e.points[i], e.points[i + 1])) nearNow++;
      const opts = [endInfo(e, 'to') ? plan(e, 'to') : null, endInfo(e, 'from') ? plan(e, 'from') : null].filter(Boolean).sort((a, b) => a.score - b.score);
      const o = opts[0];
      if (o && o.jogs < jogsOf(e.points) && o.uturn <= uturnsOf(e.points) && o.crosses <= crossNow && o.near <= nearNow) { e.points = o.pts; changed = true; }
    }
    if (!movers.length) { if (!changed) break; continue; }
    for (const { e, end, partner } of movers) {
      if (!badEnd(e, end) && !(partner && badEnd(partner, 'to'))) continue;
      const a = plan(e, end);
      const b = partner ? plan(partner, 'to') : null;
      if (a && (!b || a.score <= b.score)) e.points = a.pts;
      else if (b) partner.points = b.pts;
    }
  }
}

// ポート・proxy のラベルの、最初の候補の場所(svg.js の labelSpecs の最初の候補と同じ)。線はここを避ける
function portLabelRects(d, get) {
  const out = [];
  for (const o of d.objects.values()) {
    if (!(o.type === 'port' || o.type === 'proxy') || !o.label || o.children?.length) continue;
    const half = o.type === 'proxy' ? 6 : (o.side === 'l' || o.side === 'r' ? o.pw : o.ph) / 2;
    const w = textWidth(o.label, FSS);
    const up = o.cy - half - 5, down = o.cy + half + LINE - 1;
    let x1, y;
    if (o.side === 'l') { x1 = o.cx - half - 5 - w; y = up; }
    else if (o.side === 'r') { x1 = o.cx + half + 5; y = up; }
    else if (o.side === 'b') { x1 = o.cx + half + 5; y = down; }
    else { x1 = o.cx - half - 5 - w; y = up; }
    out.push({ x: x1, y: y - FSS * 0.8, w, h: FSS * 1.05 });
  }
  return out;
}

// 箱の左右の辺で、名前の区画を避けて着く範囲の上端
function headTop(o) { return o.type === 'box' ? Math.min(2 * LINE + 8 + (o.headInset ?? 0), o.h / 2) : 0; }
// GR15 の R(src/view/index.js の FIG15): 行為者(棒人間)の図形(頭と体)の外接矩形。src/view/svg.js の dparamSvg の棒人間
// (頭の円は中心 y + 8・半径 7、腕は中心から左右 11、脚の先は y + 48)と同じ値。線は、上から来るものは頭の上の中央、左右から
// 来るものは図形の左右の端に着ける(設計書 7.3 節)。routeAll の初めに、R を入れた図の行為者を STICK に入れる。R を切ったときは null
// R2(FIG15.R2)の棒人間は HAND にも入れ、左右から来る線を腕の線の高さ hand(頭の中心 y + 8 から 13 下)の手の先に着ける
const STICK = new WeakSet(), HAND = new WeakSet();
function stickOf(o) {
  if (!STICK.has(o)) return null;
  const cx = o.x + o.w / 2;
  return { cx, x1: cx - 11, x2: cx + 11, y1: o.y + 1, y2: o.y + 48, hand: HAND.has(o) ? o.y + 21 : null };
}
// 辺の上で線が着いてよい範囲(左右の辺は y の範囲、上下の辺は x の範囲)
function sideRange(o, side) {
  const st = stickOf(o);
  if (st && (side === 't' || side === 'b')) return [st.x1, st.x2];
  if (st?.hand != null) return [st.hand, st.hand]; // R2: 左右の辺は手の先の 1 点
  if (side === 't' || side === 'b') return [o.x, o.x + o.w];
  if (o.type === 'dparam' && o.symbol === 'actor') return [o.y + 10, o.y + 40]; // 棒人間の体の高さ
  return [o.y + headTop(o), o.y + o.h];
}

// 線の端の候補 [{ obj, side, ax, ay(着く点), sx, sy(出した点), dx, dy(外向き), inner }]
function endCands(o, other, get, offsetOf) {
  if (o.type === 'port' || o.type === 'proxy') {
    const a = anchor(o, other, get);
    const off = offsetOf(o);
    const vert = o.side === 'l' || o.side === 'r';
    const ax = a.x + (vert ? 0 : off), ay = a.y + (vert ? off : 0);
    return [{ obj: o.id, side: null, ax, ay, sx: ax + a.dx * STUB, sy: ay + a.dy * STUB, dx: a.dx, dy: a.dy }];
  }
  if (o.type === 'dot') return DIRS.map(([dx, dy]) => ({ obj: o.id, side: null, ax: o.cx, ay: o.cy, sx: o.cx + dx * 10, sy: o.cy + dy * 10, dx, dy }));
  if (containsObj(o, other, get)) {
    // 持ち主の箱の内側の縁(左・右・下。上は名前の区画)。着く点は経路を探すときに縁の上で決める
    // 着くのは領域の部分の縁: 左右は名前の区画と文字の区画の間、下は文字の区画がないときだけ
    const y1 = o.type === 'box' ? o.regionY : o.y, y2 = o.type === 'box' ? o.compY : o.y + o.h;
    const out = [{ obj: o.id, side: 'l', inner: true, line: { x: o.x, y1, y2 }, dx: 1, dy: 0 },
      { obj: o.id, side: 'r', inner: true, line: { x: o.x + o.w, y1, y2 }, dx: -1, dy: 0 }];
    if (!(o.type === 'box' && o.compartments.length)) out.push({ obj: o.id, side: 'b', inner: true, line: { y: o.y + o.h, x1: o.x, x2: o.x + o.w }, dx: 0, dy: -1 });
    return out;
  }
  if (o.type === 'cline') {
    // 区画の行: 行の文字に重ならないよう、行の四角の左か右の、相手に近い側(同じなら右)から着ける(GR12 P2 の裁定 R1。
    // 設計書 7.3 節の「その要素の文字まで引く」)。出す長さは 8
    const c = centerOf(other, get);
    const side = c.x < o.x + o.w / 2 ? 'l' : 'r';
    const [dx, dy] = NORMAL[side];
    const ax = side === 'r' ? o.x + o.w : o.x, ay = o.y + o.h / 2;
    return [{ obj: o.id, side: null, ax, ay, sx: ax + dx * 8, sy: ay + dy * 8, dx, dy }];
  }
  // 棒人間(actor)は、下に名前を書くので下の辺を使わない
  // 状態遷移ビューの節点: 円とひし形は各辺の中点だけ。fork・join の棒は、左右の辺は中点だけ
  const bar = o.type === 'pnode' && (o.symbol === 'fork-node' || o.symbol === 'join-node');
  const sides = o.type === 'dparam' && o.symbol === 'actor' ? ['l', 'r', 't'] : ['l', 'r', 't', 'b'];
  // R の棒人間: 上の辺は頭の上の中央だけ。左右の辺は図形の左右の端
  const st = stickOf(o);
  const tsOf = (side) => (o.type === 'pnode' && (!bar || side === 'l' || side === 'r') ? [0.5] : st && (side === 't' || st.hand != null) ? [0.5] : [0.5, 0.25, 0.75]);
  // 各辺の 4 分の 1・2 分の 1・4 分の 3 の 3 か所を、着く点の候補にする
  return sides.flatMap((side) => tsOf(side).map((t) => {
    const [dx, dy] = NORMAL[side];
    const [r1, r2] = sideRange(o, side);
    const at = r1 + (r2 - r1) * t;
    const ax = side === 'l' ? (st ? st.x1 : o.x) : side === 'r' ? (st ? st.x2 : o.x + o.w) : at;
    const ay = side === 't' ? o.y : side === 'b' ? o.y + o.h : at;
    return { obj: o.id, side, ax, ay, sx: ax + dx * STUB, sy: ay + dy * STUB, dx, dy };
  }));
}

// 箱の中に入った n 端の黒丸を、箱の外の近い点に移す
function moveDotOutside(dot, d, get) {
  // 黒丸を含んでよいのは、黒丸を持つ箱とその外側の箱だけ
  const blockers = [...d.objects.values()].filter((o) => BOXLIKE.has(o.type) && o.id !== dot.parent && !containsObj(o, dot, get));
  const inside = (x, y) => blockers.some((o) => x > o.x - 8 && x < o.x + o.w + 8 && y > o.y - 8 && y < o.y + o.h + 8);
  if (!inside(dot.cx, dot.cy)) return;
  for (let r = 10; r <= 600; r += 10) for (const [dx, dy] of [[0, r], [0, -r], [r, 0], [-r, 0], [r, r], [-r, r], [r, -r], [-r, -r]]) {
    if (!inside(dot.cx + dx, dot.cy + dy)) { dot.cx += dx; dot.cy += dy; return; }
  }
}

// GR18 の直しの切り替え。B3: 経路の探索の区間の費用で、近くの四角だけを桝目の索引で拾う(結果は変えない。切れば前のとおり全部を見る)
export const GR18_LAYOUT = { B3: true };
// 四角の並び rects の桝目の索引(GR18 の B3)。四角を margin だけ広げた範囲が重なる桝目に入れておき、each(p, q, f) は、縦横の区間 p–q の
// 外接矩形が重なる桝目の四角を、重ねずに 1 回ずつ f に渡す。判定(segHitsRect の m ≤ margin、hugsBorder の gap < margin)が
// 成り立ちうる四角は必ず渡す
const CELL = 64;
function rectIndex(rects, margin) {
  const cells = new Map();
  rects.forEach((r, n) => {
    const x1 = Math.floor((r.x - margin) / CELL), x2 = Math.floor((r.x + r.w + margin) / CELL), y1 = Math.floor((r.y - margin) / CELL), y2 = Math.floor((r.y + r.h + margin) / CELL);
    for (let i = x1; i <= x2; i++) for (let j = y1; j <= y2; j++) { const k = i * 65536 + j; let l = cells.get(k); if (!l) cells.set(k, l = []); l.push(n); }
  });
  const seen = new Int32Array(rects.length).fill(-1);
  let stamp = 0;
  return {
    each(p, q, f) {
      stamp++;
      const x1 = Math.floor(Math.min(p.x, q.x) / CELL), x2 = Math.floor(Math.max(p.x, q.x) / CELL), y1 = Math.floor(Math.min(p.y, q.y) / CELL), y2 = Math.floor(Math.max(p.y, q.y) / CELL);
      for (let i = x1; i <= x2; i++) for (let j = y1; j <= y2; j++) {
        const l = cells.get(i * 65536 + j);
        if (l) for (const n of l) if (seen[n] !== stamp) { seen[n] = stamp; f(rects[n]); }
      }
    },
  };
}

// 経路の探索が使い回す配列(GR18 の B3)。世代 gen を 1 つ進めると、どの状態も「まだ入れていない」になる
let SCRATCH = null;
function routeScratch(n, m) {
  if (!SCRATCH || SCRATCH.dist.length < n || SCRATCH.seg.length < m || SCRATCH.gen >= 0x7fffffff) {
    SCRATCH = { dist: new Float64Array(Math.max(n, SCRATCH?.dist.length ?? 0)), prev: new Int32Array(Math.max(n, SCRATCH?.dist.length ?? 0)), st: new Int32Array(Math.max(n, SCRATCH?.dist.length ?? 0)), seg: new Float64Array(Math.max(m, SCRATCH?.seg.length ?? 0)), sst: new Int32Array(Math.max(m, SCRATCH?.seg.length ?? 0)), gen: 0 };
  }
  SCRATCH.gen++;
  return SCRATCH;
}

// 使った区間。h は y → 横の区間の並び、v は x → 縦の区間の並び。hb・vb は、座標を USED_CELL ごとの桝目に分けた索引(桝目 → 座標の並び)で、
// nearUsed が近くの座標だけを見るのに使う(GR18 の B3・B4。見る区間は前と同じ判定で、結果は同じ)
const USED_CELL = 8;
function makeUsed() { return { h: new Map(), v: new Map(), hb: new Map(), vb: new Map() }; }
function addUsed(used, pts) {
  const key = (map, idx, k) => { if (map.has(k)) return; map.set(k, []); const b = Math.floor(k / USED_CELL); let l = idx.get(b); if (!l) idx.set(b, l = []); l.push(k); };
  for (let i = 0; i + 1 < pts.length; i++) {
    const p = pts[i], q = pts[i + 1];
    if (p.y === q.y && p.x !== q.x) { key(used.h, used.hb, p.y); used.h.get(p.y).push([Math.min(p.x, q.x), Math.max(p.x, q.x)]); }
    else if (p.x === q.x && p.y !== q.y) { key(used.v, used.vb, p.x); used.v.get(p.x).push([Math.min(p.y, q.y), Math.max(p.y, q.y)]); }
  }
}
function nearUsed(used, p, q, gap = 6) {
  const near = (map, idx, at, a, b) => {
    if (!GR18_LAYOUT.B3) {
      for (const [y, list] of map) { const dy = Math.abs(y - at); if (dy === 0 || dy > gap) continue; for (const [c, e] of list) if (Math.min(b, e) - Math.max(a, c) > 1) return true; }
      return false;
    }
    for (let bk = Math.floor((at - gap) / USED_CELL); bk <= Math.floor((at + gap) / USED_CELL); bk++) {
      for (const y of idx.get(bk) ?? []) { const dy = Math.abs(y - at); if (dy === 0 || dy > gap) continue; for (const [c, e] of map.get(y)) if (Math.min(b, e) - Math.max(a, c) > 1) return true; }
    }
    return false;
  };
  if (p.y === q.y) return near(used.h, used.hb, p.y, Math.min(p.x, q.x), Math.max(p.x, q.x));
  return near(used.v, used.vb, p.x, Math.min(p.y, q.y), Math.max(p.y, q.y));
}
function overlapsUsed(used, p, q) {
  const [map, key, a, b] = p.y === q.y ? [used.h, p.y, Math.min(p.x, q.x), Math.max(p.x, q.x)] : [used.v, p.x, Math.min(p.y, q.y), Math.max(p.y, q.y)];
  for (const [c, e] of map.get(key) ?? []) if (Math.min(b, e) - Math.max(a, c) > 1) return true;
  return false;
}

// 線を引く範囲(通ってよい箱のうち、いちばん内側のものの内側。なければ図全体)
function boundsFor(A, B, d, get) {
  const ca = chainOf(A, B, get), cb = chainOf(B, A, get);
  let best = null, depth = -1;
  for (const id of ca) if (cb.has(id)) { let k = 0; for (let x = get(id); x?.parent; x = get(x.parent)) k++; if (k > depth) { depth = k; best = get(id); } }
  return best ? { x: best.x, y: best.y, w: best.w, h: best.h } : { x: 0, y: 0, w: d.width, h: d.height };
}

function findRoute(A, B, ca, cb, d, get, used) {
  const obstacles = obstaclesFor(A, B, d, get);
  // 線が中を通る箱の、名前の区画と文字の区画も避ける(避けられないときは通る)
  const ca0 = chainOf(A, B, get), cb0 = chainOf(B, A, get);
  // 両端が、ある箱の区画の中の本体の図(action-flow-view)の中にあるときは、その箱の名前の区画と文字の区画を避けない
  // (本体の図はそれらの区画の中に置くので)
  const bodyOwners = new Set();
  for (const id of ca0) if (cb0.has(id)) { const b = get(id); if (b?.bodyOf) bodyOwners.add(b.bodyOf); }
  for (const id of new Set([...ca0, ...cb0])) {
    const o = get(id);
    if (o?.type !== 'box' || bodyOwners.has(id)) continue;
    obstacles.push({ id: `${id}#head`, x: o.x + 1, y: o.y + 1, w: o.w - 2, h: o.regionY - o.y - 2 });
    const target = [A, B].find((X) => X.type === 'cline' && X.parent === id);
    if (o.compartments.length && !target) obstacles.push({ id: `${id}#comp`, x: o.x + 1, y: o.compY + 1, w: o.w - 2, h: o.y + o.h - o.compY - 2 });
    else if (target) {
      // 区画の行を端にする線は、区画の中へ入ってよい。ほかの行と見出しの文字だけを避ける
      for (const c of o.compartments) {
        const tw = textWidth(c.title, FSS);
        obstacles.push({ id: `${id}#t`, x: o.x + o.w / 2 - tw / 2 - 2, y: c.y + 3, w: tw + 4, h: LINE });
        for (const l of c.lines) if (l !== target.line) obstacles.push({ id: `${id}#l`, ...l.rect });
      }
    }
  }
  // アクションフロービューの列(passable)は横切ってよいが、列の頭(«performer» と perform actions)は避ける
  for (const o of d.objects.values()) if (o.passable && !o.plain && o.regionY !== undefined) obstacles.push({ id: `${o.id}#head`, x: o.x + 1, y: o.y + 1, w: o.w - 2, h: o.regionY - o.y - 2 });
  const bd = boundsFor(A, B, d, get);
  // ほかの線のポート・引数・proxy の記号(この線の端と、その入れ子の親子を除く)
  const related = new Set([A.id, B.id]);
  for (const X of [A, B]) { for (let x = X; x && (x.type === 'port' || x.type === 'proxy'); x = x.owner ? get(x.owner) : null) related.add(x.id); for (const c of X.children ?? []) related.add(c); }
  const portRects = [];
  for (const o of d.objects.values()) {
    if (!(o.type === 'port' || o.type === 'proxy') || related.has(o.id) || o.cx === undefined) continue;
    const r = portRect(o, PORT_CLEAR);
    if (r.x + r.w < bd.x || r.x > bd.x + bd.w || r.y + r.h < bd.y || r.y > bd.y + bd.h) continue;
    portRects.push(r);
  }
  // 格子の線
  const xsSet = new Set([bd.x + 4, bd.x + bd.w - 4]), ysSet = new Set([bd.y + 4, bd.y + bd.h - 4]);
  for (const o of obstacles) { xsSet.add(o.x - M); xsSet.add(o.x + o.w + M); ysSet.add(o.y - M); ysSet.add(o.y + o.h + M); }
  for (const r of portRects) { xsSet.add(r.x - 3); xsSet.add(r.x + r.w + 3); ysSet.add(r.y - 3); ysSet.add(r.y + r.h + 3); }
  // ポートのラベルの場所の脇も通れるようにする
  for (const r of d.labelRects) if (r.x + r.w >= bd.x && r.x <= bd.x + bd.w && r.y + r.h >= bd.y && r.y <= bd.y + bd.h) { xsSet.add(r.x - 4); xsSet.add(r.x + r.w + 4); ysSet.add(r.y - 4); ysSet.add(r.y + r.h + 4); }
  for (const c of [...ca, ...cb]) {
    if (c.line) { if (c.line.x !== undefined) xsSet.add(c.line.x); else ysSet.add(c.line.y); continue; }
    xsSet.add(c.sx); ysSet.add(c.sy);
  }
  const mid = (set) => { const a = [...set].map((v) => Math.round(v * 2) / 2).sort((p, q) => p - q); const out = new Set(a); for (let i = 0; i + 1 < a.length; i++) if (a[i + 1] - a[i] > 2 * M) out.add(Math.round((a[i] + a[i + 1])) / 2); return [...out].sort((p, q) => p - q); };
  const xs = mid(xsSet).filter((x) => x >= bd.x - 1 && x <= bd.x + bd.w + 1), ys = mid(ysSet).filter((y) => y >= bd.y - 1 && y <= bd.y + bd.h + 1);
  const nx = xs.length, ny = ys.length;
  const xi = new Map(xs.map((x, i) => [x, i])), yi = new Map(ys.map((y, i) => [y, i]));
  // 状態は (格子点, 今の向き, 1 つ前の区間の向き)。1 つ前の向きが 4 なら、まだ折れていない
  const key = (i, j, dir, pd) => (((j * nx + i) * 4 + dir) * 5) + pd;
  // 状態ごとの費用と 1 つ前の状態。線ごとに大きな配列を作って埋め直さないよう、使い回す配列と世代の印で「まだ入れていない
  // (Infinity・-1)」を表す(GR18 の B3。読む値は前と同じ)
  const S = GR18_LAYOUT.B3 ? routeScratch(nx * ny * 20, nx * ny * 2) : null;
  const dist = S ? S.dist : new Float64Array(nx * ny * 20).fill(Infinity);
  const prev = S ? S.prev : new Int32Array(nx * ny * 20).fill(-1);
  const gen = S ? S.gen : 0, st = S ? S.st : null;
  const D = S ? (k) => (st[k] === gen ? dist[k] : Infinity) : (k) => dist[k];
  const setD = S ? (k, v, pk) => { st[k] = gen; dist[k] = v; prev[k] = pk; } : (k, v, pk) => { dist[k] = v; if (pk !== null) prev[k] = pk; };
  const opposite = (a, b) => b !== 4 && DIRS[a][0] === -DIRS[b][0] && DIRS[a][1] === -DIRS[b][1];
  // 型付き配列の二分ヒープ((費用, 状態の番号) の辞書式の順。GR10 P2 の裁定の案 3)。比べ方と入れ替え方は前の配列の
  // ヒープと同じで、同じ順の組は区別できないので、取り出す順は変わらない
  let hc = new Float64Array(1024), hk = new Int32Array(1024), hn = 0;
  const less = (a, b) => hc[a] < hc[b] || (hc[a] === hc[b] && hk[a] < hk[b]);
  const swap = (a, b) => { const c = hc[a]; hc[a] = hc[b]; hc[b] = c; const k = hk[a]; hk[a] = hk[b]; hk[b] = k; };
  const push = (c, k) => {
    if (hn === hc.length) { const c2 = new Float64Array(hn * 2); c2.set(hc); hc = c2; const k2 = new Int32Array(hn * 2); k2.set(hk); hk = k2; }
    hc[hn] = c; hk[hn] = k; let i = hn++;
    while (i > 0) { const p = (i - 1) >> 1; if (!less(i, p)) break; swap(i, p); i = p; }
  };
  let popC = 0, popK = 0;
  const pop = () => {
    popC = hc[0]; popK = hk[0]; hn--;
    if (hn > 0) { hc[0] = hc[hn]; hk[0] = hk[hn]; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < hn && less(l, m)) m = l; if (r < hn && less(r, m)) m = r; if (m === i) break; swap(m, i); i = m; } }
  };
  // 区間の費用。箱・注の記号・ポートの記号・ラベルとの当たりは、区間の近くのものだけを桝目の索引(rectIndex)で拾って、同じ判定で
  // 数える(GR18 の B3。拾わないものは判定が成り立たないものだけなので、費用は変わらない)
  const ixObst = rectIndex(obstacles, 2), ixBox = rectIndex(d.boxLike, HUG_GAP + 1), ixPort = rectIndex(portRects, 0), ixLabel = rectIndex(d.labelRects, 2);
  const segCost = (p, q) => {
    let c = Math.abs(q.x - p.x) + Math.abs(q.y - p.y);
    if (GR18_LAYOUT.B3) {
      ixObst.each(p, q, (o) => { if (segHitsRect(p, q, o, 2)) c += CROSS; });
      ixBox.each(p, q, (o) => { if (hugsBorder(p, q, o, HUG_GAP)) c += HUG; });
      ixPort.each(p, q, (r) => { if (segHitsRect(p, q, r, 0)) c += PORTHIT; });
      ixLabel.each(p, q, (r) => { if (segHitsRect(p, q, r, -2)) c += LABEL; });
    } else {
      for (const o of obstacles) if (segHitsRect(p, q, o, 2)) c += CROSS;
      for (const o of d.boxLike) if (hugsBorder(p, q, o, HUG_GAP)) c += HUG;
      for (const r of portRects) if (segHitsRect(p, q, r, 0)) c += PORTHIT;
      for (const r of d.labelRects) if (segHitsRect(p, q, r, -2)) c += LABEL;
    }
    if (overlapsUsed(used, p, q)) c += OVERLAP;
    else if (nearUsed(used, p, q)) c += NEAR;
    return c;
  };
  // 隣り合う格子点の間の区間の費用の控え(GR10 P1 の裁定 Q11 の (A))。segCost は区間の向きによらず(どの判定も
  // 端点の min・max で比べる)、この探索の間は変わらないので、控えても経路は変わらない。[右へ, 下へ] の 2 つ
  const segMemo = S ? S.seg : new Float64Array(nx * ny * 2).fill(-1);
  const sst = S ? S.sst : null;
  const unitCost = (i, j, i2, j2) => {
    const a = i2 > i || j2 > j ? [i, j] : [i2, j2];
    const k = (a[1] * nx + a[0]) * 2 + (j2 !== j ? 1 : 0);
    let v = S ? (sst[k] === gen ? segMemo[k] : -1) : segMemo[k];
    if (v < 0) { v = segCost({ x: xs[a[0]], y: ys[a[1]] }, { x: xs[a[0] + (j2 !== j ? 0 : 1)], y: ys[a[1] + (j2 !== j ? 1 : 0)] }); segMemo[k] = v; if (S) sst[k] = gen; }
    return v;
  };
  const dirOf = (dx, dy) => DIRS.findIndex(([a, b]) => a === dx && b === dy);
  const startOf = new Map();
  ca.forEach((c, n) => {
    const i = xi.get(Math.round(c.sx * 2) / 2), j = yi.get(Math.round(c.sy * 2) / 2);
    if (i === undefined || j === undefined) return;
    const k = key(i, j, dirOf(c.dx, c.dy), 4);
    const c0 = segCost({ x: c.ax, y: c.ay }, { x: c.sx, y: c.sy });
    if (c0 < D(k)) { setD(k, c0, S && st[k] === gen ? prev[k] : S ? -1 : null); startOf.set(k, n); push(c0, k); }
  });
  // 着く点: 出した点に、端へ向かう向きで着く(曲がるなら BEND を足す)。内側の縁なら、縁の上の格子点に縁へ向かう向きで着く
  let bestCost = Infinity, bestK = -1, bestT = null;
  const tryTarget = (k, cost, i, j, dir, pd) => {
    for (let n = 0; n < cb.length; n++) {
      const c = cb[n];
      if (c.line) {
        const onLine = c.line.x !== undefined ? xs[i] === c.line.x && ys[j] >= c.line.y1 + 6 && ys[j] <= c.line.y2 - 6 : ys[j] === c.line.y && xs[i] >= c.line.x1 + 6 && xs[i] <= c.line.x2 - 6;
        if (onLine && dir === dirOf(-c.dx, -c.dy) && cost < bestCost) { bestCost = cost; bestK = k; bestT = { ...c, ax: xs[i], ay: ys[j] }; }
        continue;
      }
      if (xs[i] !== Math.round(c.sx * 2) / 2 || ys[j] !== Math.round(c.sy * 2) / 2) continue;
      const fd = dirOf(-c.dx, -c.dy);
      const fin = cost + (dir === fd ? 0 : BEND + (opposite(fd, pd) ? UTURN : 0)) + segCost({ x: c.sx, y: c.sy }, { x: c.ax, y: c.ay });
      if (fin < bestCost) { bestCost = fin; bestK = k; bestT = c; }
    }
  };
  while (hn > 0) {
    pop();
    const cost = popC, k = popK;
    // 取り出す費用は小さい順なので、ここで bestCost 以上なら、残りもすべて下の continue に当たる。そこで打ち切る(GR18 の B3。結果は同じ)
    if (GR18_LAYOUT.B3 && cost >= bestCost) break;
    if (cost > D(k) || cost >= bestCost) continue;
    const pd = k % 5, t = (k - pd) / 5, dir = t & 3, cell = t >> 2, i = cell % nx, j = (cell / nx) | 0;
    tryTarget(k, cost, i, j, dir, pd);
    for (let nd = 0; nd < 4; nd++) {
      const [dx, dy] = DIRS[nd];
      if (dx === -DIRS[dir][0] && dy === -DIRS[dir][1]) continue; // 引き返さない
      const i2 = i + dx, j2 = j + dy;
      if (i2 < 0 || i2 >= nx || j2 < 0 || j2 >= ny) continue;
      const turn = nd !== dir;
      const c2 = cost + unitCost(i, j, i2, j2) + (turn ? BEND + (opposite(nd, pd) ? UTURN : 0) : 0);
      const k2 = key(i2, j2, nd, turn ? dir : pd);
      if (c2 < D(k2)) { setD(k2, c2, k); push(c2, k2); }
    }
  }
  if (bestK < 0) {
    // 格子で着けない(起きないはず): 端どうしを L 字で結ぶ
    const a = ca[0].line ? { ...ca[0], ax: ca[0].line.x ?? ca[0].line.x1, ay: ca[0].line.y ?? ca[0].line.y1, sx: ca[0].line.x ?? ca[0].line.x1, sy: ca[0].line.y ?? ca[0].line.y1 } : ca[0];
    const b = cb[0].line ? { ...cb[0], ax: cb[0].line.x ?? cb[0].line.x1, ay: cb[0].line.y ?? cb[0].line.y1, sx: cb[0].line.x ?? cb[0].line.x1, sy: cb[0].line.y ?? cb[0].line.y1 } : cb[0];
    return { a, b, pts: [{ x: a.ax, y: a.ay }, { x: a.sx, y: a.sy }, { x: b.sx, y: a.sy }, { x: b.sx, y: b.sy }, { x: b.ax, y: b.ay }] };
  }
  const path = [];
  let k = bestK;
  while (k >= 0) { const cell = Math.floor(k / 20); path.push({ x: xs[cell % nx], y: ys[(cell / nx) | 0] }); if (startOf.has(k) && prev[k] < 0) break; k = prev[k]; }
  path.reverse();
  let first = startOf.get(k);
  const a = ca[first ?? 0];
  const b = bestT;
  const pts = [{ x: a.ax, y: a.ay }, ...path];
  if (!b.line) pts.push({ x: b.ax, y: b.ay });
  return { a, b, pts };
}

function simplify(pts) {
  const r = [];
  for (const p of pts.map((q) => ({ x: Math.round(q.x * 2) / 2, y: Math.round(q.y * 2) / 2 }))) {
    const last = r[r.length - 1];
    if (last && last.x === p.x && last.y === p.y) continue;
    if (r.length >= 2) { const pr = r[r.length - 2]; if ((pr.x === last.x && last.x === p.x) || (pr.y === last.y && last.y === p.y)) r.pop(); }
    r.push(p);
  }
  return r;
}

// ---- 段組みの配置での帯の線引き(GR10 P2 の帯の線引きの裁定。一般ビューの d.bandRoute のときだけ)
// 同じ領域の、段に並べた要素どうしの線を、段と段の間の帯で横に進めて引く。
//   - 下の段へ向かう線は出る箱の下の辺から、上の段へ向かう線は上の辺から出る。同じ段の線は両方の箱の下の辺を使い、下の帯を通る。
//   - 隣の段へは、間の帯 1 つで横に進んで、目当ての箱の辺(上の段なら下の辺、下の段なら上の辺)に入る。
//   - 段を 2 つ以上またぐ線は、出た帯で横に進み、列と列の間の縦の通り道を通って、目当ての段の手前の帯に移る。
//   - 帯と縦の通り道の中は、線ごとに別のレーンにする。帯の高さと通り道の幅は、レーンの数に合わせて広げる(bandPlan)。
const BAND_M = 32;   // 帯の上下の余白(箱の辺から最初のレーンまで。線の端の記号の長さ 18.5 より長く、同じ段の線の脚がコの字の短い区間 30 px を超えるように)
const CHAN_M = 16;   // 縦の通り道の左右の余白
const LANE = 12;
const PORT_SP = 18;  // 辺の上の着く点の最小の間隔(矢じりの外接矩形の幅 14 より広く)     // レーンの間隔(図の質 (b) の 6 px より広く)
function bandRegions(d) {
  const out = [];
  for (const o of d.objects.values()) if (o.type === 'box' && o.flowPos && !o.rowLayout) out.push(o.flowPos);
  if (d.topFlowPos) out.push(d.topFlowPos);
  return out;
}
function bandShaped(o) { return o && !(o.type === 'port' || o.type === 'proxy' || o.type === 'dot' || o.type === 'cline'); }
// 線ごとの道筋(帯と通り道)を決め、領域ごとの間隔を返す。d.bandEdges に道筋を残す
function bandPlan(d, get) {
  const gaps = new Map();
  d.bandEdges = new Map();
  const sideN = new Map();
  for (const pos of bandRegions(d)) {
    let R = 0, C = 0;
    for (const k of pos.values()) { R = Math.max(R, k.r + 1); C = Math.max(C, k.c + 1); }
    const row = new Array(R).fill(0), col = new Array(C + 1).fill(0); // row[k]: 段 k の下の帯のレーン数。col[j + 1]: 列 j の右の通り道のレーン数
    for (const e of d.edges) {
      if (e.loop || e.from === e.to) continue;
      const pa = pos.get(e.from), pb = pos.get(e.to);
      if (!pa || !pb || !bandShaped(get(e.from)) || !bandShaped(get(e.to))) continue;
      const p = { pos, ra: pa.r, ca: pa.c, rb: pb.r, cb: pb.c, ch: null };
      if (pb.r === pa.r) { p.kind = 'same'; p.b1 = pa.r; }
      else if (pb.r > pa.r) { p.kind = 'down'; p.b1 = pa.r; p.b2 = pb.r - 1; }
      else { p.kind = 'up'; p.b1 = pa.r - 1; p.b2 = pb.r; }
      // GR14 の A: 行為者(棒人間)の下の辺は名前を書くので、帯の線で下の辺に着く線(同じ段どうしの線と、行為者が上の段の線)は
      // 帯で引かず、経路の探索(routeAll。行為者の下の辺を使わない endCands)に回す
      const actor = (id) => { const o = get(id); return o.type === 'dparam' && o.symbol === 'actor'; };
      if (d.fig14?.A && ((actor(e.from) && p.kind !== 'up') || (actor(e.to) && p.kind !== 'down'))) continue;
      if (p.kind !== 'same' && p.b1 !== p.b2) p.ch = pb.c > pa.c ? pa.c : pb.c < pa.c ? pa.c - 1 : pa.c < C - 1 || pa.c === 0 ? pa.c : pa.c - 1;
      for (const [id, side] of [[e.from, p.kind === 'up' ? 't' : 'b'], [e.to, p.kind === 'down' ? 't' : 'b']]) { const k = `${id}|${side}`; sideN.set(k, (sideN.get(k) ?? 0) + 1); }
      row[p.b1]++;
      if (p.kind !== 'same' && p.b2 !== p.b1) { row[p.b2]++; col[p.ch + 1]++; }
      d.bandEdges.set(e.id, p);
    }
    const bandH = (n) => (n ? 2 * BAND_M + (n - 1) * LANE : 0);
    const chanW = (n) => (n ? 2 * CHAN_M + (n - 1) * LANE : 0);
    gaps.set(pos, {
      row: row.slice(0, R - 1).map(bandH), col: col.slice(1, C).map(chanW),
      left: col[0] ? chanW(col[0]) : 0, right: col[C] ? chanW(col[C]) : 0, bottom: row[R - 1] ? bandH(row[R - 1]) : 0,
    });
  }
  // 辺に着く点の間隔を PORT_SP 以上にする(線の端の記号が重ならないように)
  for (const [k, n] of sideN) { const o = get(k.slice(0, k.lastIndexOf('|'))); o.bandMinW = Math.max(o.bandMinW ?? 0, (n + 1) * PORT_SP); }
  return gaps;
}
function routeBands(d, get) {
  const done = new Set();
  if (!d.bandEdges?.size) return done;
  const edges = d.edges.filter((e) => d.bandEdges.has(e.id));
  for (const pos of bandRegions(d)) {
    const mine = edges.filter((e) => d.bandEdges.get(e.id).pos === pos);
    if (!mine.length) continue;
    // 段の上下の端と、列の左右の端(箱そのものの位置から)
    const rowTop = [], rowBot = [], colL = [], colR = [];
    for (const [id, k] of pos) {
      const o = get(id);
      if (!o || o.x === undefined) continue;
      rowTop[k.r] = Math.min(rowTop[k.r] ?? Infinity, o.y); rowBot[k.r] = Math.max(rowBot[k.r] ?? -Infinity, o.y + o.h);
      colL[k.c] = Math.min(colL[k.c] ?? Infinity, o.x); colR[k.c] = Math.max(colR[k.c] ?? -Infinity, o.x + o.w);
    }
    // 縦の通り道のレーン(通り道ごとに、線の順に)
    const chanX = new Map();
    const byChan = new Map();
    for (const e of mine) { const p = d.bandEdges.get(e.id); if (p.ch === null) continue; if (!byChan.has(p.ch)) byChan.set(p.ch, []); byChan.get(p.ch).push(e); }
    for (const [j, list] of byChan) {
      list.sort((a, b) => { const p = d.bandEdges.get(a.id), q = d.bandEdges.get(b.id); return p.ca - q.ca || p.cb - q.cb || (a.id < b.id ? -1 : 1); });
      const n = list.length;
      let x0;
      if (j < 0) x0 = colL[0] - CHAN_M - (n - 1) * LANE;
      else if (j + 1 >= colL.length) x0 = colR[j] + CHAN_M;
      else x0 = (colR[j] + colL[j + 1]) / 2 - ((n - 1) * LANE) / 2;
      list.forEach((e, i) => chanX.set(e.id, x0 + i * LANE));
    }
    // 箱の辺の上の着く点: 辺ごとに、線が次に向かう x の順に等間隔
    // route: 線の通り方(GR11 案 C・案 A)。'one' 帯 1 つ、'chan' 縦の通り道、'vs' 始点の x で縦に下りて(上って)終点の手前の帯を進む、
    // 'vt' 始点の手前の帯を進んで終点の x で縦に通る、'straight' 始点から終点へ縦にまっすぐ
    const route = new Map();
    for (const e of mine) route.set(e.id, d.bandEdges.get(e.id).ch === null ? 'one' : 'chan');
    const sideOf = (e, end) => { const p = d.bandEdges.get(e.id); if (p.kind === 'same') return 'b'; if (p.kind === 'down') return end === 'from' ? 'b' : 't'; return end === 'from' ? 't' : 'b'; };
    const nextX = (e, end) => { if (route.get(e.id) === 'chan') return chanX.get(e.id); const o = get(end === 'from' ? e.to : e.from); return o.x + o.w / 2; };
    const att = new Map(); // `${e.id}|${end}` → x
    const bySide = new Map();
    const placeAtt = () => {
      bySide.clear();
      for (const e of mine) for (const end of ['from', 'to']) { const k = `${end === 'from' ? e.from : e.to}|${sideOf(e, end)}`; if (!bySide.has(k)) bySide.set(k, []); bySide.get(k).push({ e, end, key: nextX(e, end) }); }
      for (const [k, list] of bySide) {
        const o = get(k.slice(0, k.lastIndexOf('|')));
        list.sort((a, b) => a.key - b.key || (a.e.id < b.e.id ? -1 : a.e.id > b.e.id ? 1 : a.end < b.end ? -1 : 1));
        const [x1, x2] = sideRange(o, 't');
        list.forEach((it, i) => att.set(`${it.e.id}|${it.end}`, x1 + ((x2 - x1) * (i + 1)) / (list.length + 1)));
      }
    };
    placeAtt();
    const opt = d.bendOpts ?? {};
    if (opt.C || opt.A) bendRoutes(d, get, mine, route, att, chanX, bySide, placeAtt, { rowTop, rowBot }, opt);
    // 帯のレーン: 帯ごとに、横に進む区間の左端の順に、上から
    const laneY = new Map(); // `${e.id}|${帯}` → y
    const byBand = new Map();
    // 線の、帯ごとの横の区間 [帯, 始めの x, 終わりの x](route による)
    const runsOf = (e) => {
      const p = d.bandEdges.get(e.id), sx = att.get(`${e.id}|from`), tx = att.get(`${e.id}|to`), rt = route.get(e.id);
      if (rt === 'one') return [[p.b1, sx, tx]];
      if (rt === 'chan') return [[p.b1, sx, chanX.get(e.id)], [p.b2, chanX.get(e.id), tx]];
      if (rt === 'vs') return [[p.b2, sx, tx]];
      if (rt === 'vt') return [[p.b1, sx, tx]];
      return [];
    };
    const runIn = (e, band) => runsOf(e).find((x) => x[0] === band);
    const seg = (e, band) => { const [, a, b] = runIn(e, band); return [Math.min(a, b), Math.max(a, b)]; };
    for (const e of mine) for (const [band] of runsOf(e)) { if (!byBand.has(band)) byBand.set(band, []); byBand.get(band).push(e); }
    // 帯の中の線の両端: [x, 上から来るか](その端の縦の区間が、レーンより上にあるか)
    const endsIn = (e, band) => {
      const p = d.bandEdges.get(e.id);
      const [, a, b] = runIn(e, band);
      if (p.kind === 'same') return [[a, true], [b, true]];
      return [[a, p.kind === 'down'], [b, p.kind !== 'down']];
    };
    if (opt.R) unringBands(d, get, byBand, endsIn, route, att, bySide, sideOf);
    for (const [band, list] of byBand) {
      const items = list.map((e) => ({ e, s: seg(e, band), ends: endsIn(e, band) })).sort((a, b) => a.s[0] - b.s[0] || a.s[1] - b.s[1] || (a.e.id < b.e.id ? -1 : 1));
      // 先に置く線(上のレーン)の制約: P の上から来る端と Q の下から来る端が近ければ P を Q より上に
      const n = items.length, before = items.map(() => new Set()), indeg = new Array(n).fill(0);
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        if (i === j) continue;
        if (items[i].ends.some(([x, top]) => top && items[j].ends.some(([x2, top2]) => !top2 && Math.abs(x - x2) <= 6)) && !before[i].has(j)) { before[i].add(j); indeg[j]++; }
      }
      const order = [], used = new Array(n).fill(false);
      for (let k = 0; k < n; k++) {
        let pick = -1;
        for (let i = 0; i < n; i++) if (!used[i] && indeg[i] === 0) { pick = i; break; }
        if (pick < 0) for (let i = 0; i < n; i++) if (!used[i]) { pick = i; break; } // 輪になった制約は、並びの順で切る
        used[pick] = true; order.push(items[pick]);
        for (const j of before[pick]) indeg[j]--;
      }
      // 線どうしの交差を減らす(GR10 P2 の画像の確認の後の指示 1 にあわせて足した): 隣り合う 2 本の上下を入れ替えると交差が
      // 減るなら入れ替える。P を Q の上に置いたときの交差は、Q の上から来る端が P の横の区間の中にある数と、P の下から来る端が
      // Q の横の区間の中にある数。上の制約に反する入れ替えはしない。入れ替えのたびに交差の合計が減るので、必ず終わる
      const crossIf = (P, Q) => {
        if (before[items.indexOf(Q)].has(items.indexOf(P))) return 1e6;
        const inSpan = (x, it) => x > it.s[0] + 0.5 && x < it.s[1] - 0.5;
        return Q.ends.filter(([x, top]) => top && inSpan(x, P)).length + P.ends.filter(([x, top]) => !top && inSpan(x, Q)).length;
      };
      // 入れ替えを採るかは、図ごとに src/view/index.js の renderGeneral が決める(d.laneSwap が false なら入れ替えない)
      for (let changed = d.laneSwap !== false; changed;) {
        changed = false;
        for (let i = 0; i + 1 < order.length; i++) {
          if (crossIf(order[i + 1], order[i]) < crossIf(order[i], order[i + 1])) { [order[i], order[i + 1]] = [order[i + 1], order[i]]; changed = true; d.laneSwapped = (d.laneSwapped ?? 0) + 1; }
        }
      }
      // 1 本の線を、制約を守るどの位置へでも動かす(GR10 P2 の画像の確認の後の 3 回目の裁定 2。d.laneMove のときだけ)。
      // 帯の交差の数は、上下に並ぶ 2 本ごとの crossIf の和(制約は数えない)。線ごとに、上へ・下へ制約に当たるまで動かした位置のうち、
      // 帯の交差が最も減る位置(同じなら近い位置。上を先に見る)へ移す。減る位置がなくなるまで繰り返す。移すたびに帯の交差の数
      // (0 以上の整数)が 1 以上減るので、必ず終わる。図の (a)〜(e) が増えないかは、図ごとに src/view/index.js の renderGeneral が確かめる
      if (d.laneMove) {
        const idx = new Map(items.map((it, i) => [it, i]));
        const must = (P, Q) => before[idx.get(P)].has(idx.get(Q)); // P を Q より上に置く制約
        const inSpan = (x, it) => x > it.s[0] + 0.5 && x < it.s[1] - 0.5;
        const cr = (P, Q) => Q.ends.filter(([x, top]) => top && inSpan(x, P)).length + P.ends.filter(([x, top]) => !top && inSpan(x, Q)).length;
        for (let moved = true; moved;) {
          moved = false;
          for (let i = 0; i < order.length; i++) {
            const P = order[i];
            let best = 0, at = i, acc = 0;
            for (let j = i - 1; j >= 0; j--) { const Q = order[j]; if (must(Q, P)) break; acc += cr(P, Q) - cr(Q, P); if (acc < best) { best = acc; at = j; } }
            acc = 0;
            for (let j = i + 1; j < order.length; j++) { const Q = order[j]; if (must(P, Q)) break; acc += cr(Q, P) - cr(P, Q); if (acc < best) { best = acc; at = j; } }
            if (at !== i) { order.splice(i, 1); order.splice(at, 0, P); moved = true; d.laneMoved = (d.laneMoved ?? 0) + 1; }
          }
        }
      }
      order.forEach((it, i) => laneY.set(`${it.e.id}|${band}`, rowBot[band] + BAND_M + i * LANE));
    }
    for (const e of mine) {
      const p = d.bandEdges.get(e.id);
      const A = get(e.from), B = get(e.to);
      const sx = att.get(`${e.id}|from`), tx = att.get(`${e.id}|to`);
      const sy = p.kind === 'up' ? A.y : A.y + A.h, ty = p.kind === 'down' ? B.y : B.y + B.h;
      const pts = [{ x: sx, y: sy }];
      for (const [band, a, b] of runsOf(e)) { const y = laneY.get(`${e.id}|${band}`); pts.push({ x: a, y }, { x: b, y }); }
      pts.push({ x: tx, y: ty });
      e.points = simplify(pts);
      done.add(e);
    }
  }
  return done;
}

// GR11 P1 の裁定 Q3 の手当て(d.bendOpts.R。routeBands の中で、着く点と通り方を決めた後、帯のレーンを決める前に呼ぶ)。
// 帯のレーンの制約(P の上から来る端と Q の下から来る端が 6 px 以内なら P を Q より上に)が輪になると、今は並びの順で切るので、
// 輪の中の 2 本の線の縦の区間が重なることがある。輪の中にある制約(Q から P へも制約をたどって戻れるもの)ごとに、制約を作る
// 2 つの端のうち、箱の辺の上の着く点(縦の区間がその帯の中だけのもの。通り道の x と、案 C で段をまたいで縦に通す端は除く)を、
// 相手の端から LANE 離れた x へずらして、制約を外す。ずらした点が、その辺の角とほかの着く点から PORT_SP 以上離れ、辺の上の
// 並びの順が変わらないときだけ。上から来る端を先に、近い x を先に試す。1 つずらすたびに制約を数え直す(領域ごとに 8 回まで)
// 帯の線の着く点を x へ動かしてよいか: 辺の角から PORT_SP 以上離れる(R の棒人間は、頭の上の中央から腕の端までの範囲の中)
function inSpan(o, x) {
  const st = stickOf(o);
  if (st) return x >= st.x1 && x <= st.x2;
  return x >= o.x + PORT_SP && x <= o.x + o.w - PORT_SP;
}
function unringBands(d, get, byBand, endsIn, route, att, bySide, sideOf) {
  // 帯の中の端ごとの着く点の鍵(ずらせないものは null)。並びは endsIn と同じ
  const keysIn = (e, band) => {
    const p = d.bandEdges.get(e.id), rt = route.get(e.id);
    if (rt === 'one') return [`${e.id}|from`, `${e.id}|to`];
    if (rt === 'chan') return band === p.b1 ? [`${e.id}|from`, null] : [null, `${e.id}|to`];
    return [null, null];
  };
  const ringPairs = () => {
    const out = [];
    for (const [band, list] of byBand) {
      const items = list.map((e) => ({ e, ends: endsIn(e, band), keys: keysIn(e, band) }));
      const n = items.length, adj = items.map(() => new Set()), cons = [];
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        if (i === j) continue;
        items[i].ends.forEach(([x, top], a) => { if (!top) return; items[j].ends.forEach(([x2, top2], b) => { if (!top2 && Math.abs(x - x2) <= 6) { adj[i].add(j); cons.push({ i, j, a, b }); } }); });
      }
      const reach = (s, t) => { const seen = new Set([s]), st = [s]; while (st.length) { const v = st.pop(); if (v === t) return true; for (const w of adj[v]) if (!seen.has(w)) { seen.add(w); st.push(w); } } return false; };
      for (const c of cons) if (reach(c.j, c.i)) out.push({ top: [items[c.i].keys[c.a], items[c.i].ends[c.a][0]], bot: [items[c.j].keys[c.b], items[c.j].ends[c.b][0]], e: [items[c.i].e, items[c.j].e] });
    }
    return out;
  };
  const shift = (key, other) => {
    if (!key) return false;
    const id = key.slice(0, key.lastIndexOf('|')), end = key.slice(key.lastIndexOf('|') + 1);
    const e = d.edges.find((x) => x.id === id);
    const o = get(end === 'from' ? e.from : e.to);
    const list = bySide.get(`${o.id}|${sideOf(e, end)}`);
    const k = list.findIndex((it) => it.e === e && it.end === end);
    const prev = k > 0 ? att.get(`${list[k - 1].e.id}|${list[k - 1].end}`) : -Infinity, next = k + 1 < list.length ? att.get(`${list[k + 1].e.id}|${list[k + 1].end}`) : Infinity;
    const x0 = att.get(key);
    for (const x of [other - LANE, other + LANE].sort((a, b) => Math.abs(a - x0) - Math.abs(b - x0))) {
      if (!inSpan(o, x) || x < prev + PORT_SP || x > next - PORT_SP) continue;
      att.set(key, x);
      return true;
    }
    return false;
  };
  for (let n = 0; n < 8; n++) {
    const rings = ringPairs();
    if (!rings.length) break;
    if (!rings.some((r) => shift(r.top[0], r.bot[1]) || shift(r.bot[0], r.top[1]))) break;
    d.bendRing = (d.bendRing ?? 0) + 1;
  }
}

// GR11 案 C・案 A(d.bendOpts の C・A。routeBands の中で、着く点を決めた後に呼ぶ)。
//   案 C: 段を 2 つ以上またぐ線(route が 'chan')を、始点の x で縦に通して終点の手前の帯を進む形('vs')か、始点の手前の帯を
//         進んで終点の x で縦に通る形('vt')にする(曲がり 4 回が 2 回になる)。縦の区間が、間の段の箱(線の端の箱と、それを
//         含む箱を除く)の縁から CHAN_M 未満に入らず、ほかの線の縦の区間と LANE 未満で並ばないときだけ。ほかの線の縦の区間は、
//         帯の中の位置が決まる前なので、帯の上から下までを占めるとみなす。'vs' を先に試す。決めた後に着く点を置き直し
//         (線が次に向かう x が変わるため)、確かめ直して、満たさなくなった線は 'chan' に戻す(4 回まで)
//   案 A: 両端が向かい合う辺(下の辺と上の辺)にあり、2 つの箱の横の範囲が重なる線(段をまたぐ線を含む)を、重なりの中の同じ x に
//         着けて縦にまっすぐ通す('straight')。動かす着く点が、その辺の角とほかの着く点から PORT_SP 以上離れ、辺の上の並びの順が
//         変わらないときだけ。x は、始点の x・終点の x・重なりの中ほどの順に試す。縦の区間の確かめは案 C と同じ
function bendRoutes(d, get, mine, route, att, chanX, bySide, placeAtt, { rowTop, rowBot }, opt) {
  const span = (k) => [rowBot[k], rowTop[k + 1] ?? rowBot[k] + 2 * BAND_M + 8 * LANE];
  const ends = (e) => {
    const p = d.bandEdges.get(e.id), A = get(e.from), B = get(e.to);
    return { p, A, B, sx: att.get(`${e.id}|from`), tx: att.get(`${e.id}|to`), sy: p.kind === 'up' ? A.y : A.y + A.h, ty: p.kind === 'down' ? B.y : B.y + B.h };
  };
  const runsOf = (e, sx, tx) => {
    const p = d.bandEdges.get(e.id), rt = route.get(e.id);
    if (rt === 'one') return [[p.b1, sx, tx]];
    if (rt === 'chan') return [[p.b1, sx, chanX.get(e.id)], [p.b2, chanX.get(e.id), tx]];
    if (rt === 'vs') return [[p.b2, sx, tx]];
    if (rt === 'vt') return [[p.b1, sx, tx]];
    return [];
  };
  // 縦の区間 { x, y1, y2 }(帯の中の位置は、帯の上から下までのどこでもよいとみなす)
  const vertsOf = (e) => {
    const { sx, tx, sy, ty } = ends(e);
    const runs = runsOf(e, sx, tx);
    const ys = [[sy, sy], ...runs.map(([b]) => span(b)), [ty, ty]];
    const out = [];
    for (let i = 0; i <= runs.length; i++) out.push({ x: i === 0 ? sx : runs[i - 1][2], y1: Math.min(ys[i][0], ys[i + 1][0]), y2: Math.max(ys[i][1], ys[i + 1][1]) });
    return out;
  };
  const boxClear = (v, A, B) => !d.boxLike.some((o) => o !== A && o !== B && !containsObj(o, A, get) && !containsObj(o, B, get) && v.x > o.x - CHAN_M && v.x < o.x + o.w + CHAN_M && Math.max(v.y1, o.y) < Math.min(v.y2, o.y + o.h));
  const clear = (e) => {
    const { A, B } = ends(e);
    const vs = vertsOf(e);
    if (!vs.every((v) => boxClear(v, A, B))) return false;
    for (const f of mine) {
      if (f === e) continue;
      for (const w of vertsOf(f)) for (const v of vs) if (Math.abs(v.x - w.x) < LANE && Math.max(v.y1, w.y1) < Math.min(v.y2, w.y2)) return false;
    }
    return true;
  };
  if (opt.C) {
    for (const e of mine) {
      if (route.get(e.id) !== 'chan') continue;
      let ok = false;
      for (const rt of ['vs', 'vt']) { route.set(e.id, rt); if (clear(e)) { ok = true; break; } }
      if (!ok) route.set(e.id, 'chan');
    }
    for (let round = 0; round < 4; round++) {
      placeAtt();
      const bad = mine.filter((e) => (route.get(e.id) === 'vs' || route.get(e.id) === 'vt') && !clear(e));
      if (!bad.length) break;
      for (const e of bad) route.set(e.id, 'chan');
      if (round === 3) break;
    }
    d.bendC = (d.bendC ?? 0) + mine.filter((e) => route.get(e.id) === 'vs' || route.get(e.id) === 'vt').length;
  }
  if (opt.A) {
    const sideKey = (e, end) => { const p = d.bandEdges.get(e.id); const id = end === 'from' ? e.from : e.to; const side = p.kind === 'down' ? (end === 'from' ? 'b' : 't') : (end === 'from' ? 't' : 'b'); return `${id}|${side}`; };
    // その辺の、ほかの着く点(並びの順)の中で、x へ動かしてよいか
    const okOn = (e, end, x) => {
      const list = bySide.get(sideKey(e, end));
      const o = get(end === 'from' ? e.from : e.to);
      if (!inSpan(o, x)) return false;
      const k = list.findIndex((it) => it.e === e && it.end === end);
      const prev = k > 0 ? att.get(`${list[k - 1].e.id}|${list[k - 1].end}`) : -Infinity, next = k + 1 < list.length ? att.get(`${list[k + 1].e.id}|${list[k + 1].end}`) : Infinity;
      return x >= prev + PORT_SP && x <= next - PORT_SP;
    };
    let n = 0;
    for (const e of mine) {
      const { p, A, B, sx, tx } = ends(e);
      if (p.kind === 'same' || sx === tx && route.get(e.id) === 'straight') continue;
      const [a1, a2] = sideRange(A, 't'), [b1, b2] = sideRange(B, 't');
      const lo = Math.max(a1, b1), hi = Math.min(a2, b2);
      if (hi - lo <= 0) continue;
      const rt0 = route.get(e.id);
      let done = false;
      for (const x of [sx, tx, (lo + hi) / 2]) {
        if (!okOn(e, 'from', x) || !okOn(e, 'to', x)) continue;
        att.set(`${e.id}|from`, x); att.set(`${e.id}|to`, x); route.set(e.id, 'straight');
        if (clear(e)) { done = true; break; }
        att.set(`${e.id}|from`, sx); att.set(`${e.id}|to`, tx); route.set(e.id, rt0);
      }
      if (done) n++;
    }
    d.bendA = (d.bendA ?? 0) + n;
  }
}

// 注が相手の箱の中にある注釈の線(一般ビューの d.bandRoute のとき。GR10 P2 の帯の線引きの裁定の 1)。
// 探索をせず、注の記号から、それを囲む箱の内側の最も近い縁(左右と、文字の区画がなければ下。上は名前の区画)へ直線で引く。
// 直線がほかの箱に当たるか箱の縁に沿うとき、または先に引いた線に当たるときは、注の下の辺から下りて 1 回だけ曲がり、左右の縁へ向かう線を試す。
// どれも当たるときは、最も短い直線にする。引いた線は done に足す(経路の探索と線の端の仕上げに回さない)
function routeInnerNotes(d, get, done) {
  const used = makeUsed();
  for (const e of done) addUsed(used, e.points);
  for (const e of d.edges) {
    if (done.has(e) || e.loop) continue;
    const A = get(e.from), B = get(e.to);
    if (!A || !B || A.type !== 'note' || !(B.type === 'box' || B.type === 'note') || !containsObj(B, A, get)) continue;
    const y1 = B.type === 'box' ? B.regionY : B.y, y2 = B.type === 'box' ? B.compY : B.y + B.h;
    const cy = clamp(A.y + A.h / 2, y1 + 6, y2 - 6), cx = A.x + A.w / 2, bot = A.y + A.h;
    const straight = [[{ x: A.x, y: cy }, { x: B.x, y: cy }], [{ x: A.x + A.w, y: cy }, { x: B.x + B.w, y: cy }]];
    if (!(B.type === 'box' && B.compartments.length)) straight.push([{ x: cx, y: bot }, { x: cx, y: B.y + B.h }]);
    const length = (pts) => pts.reduce((s, q, i) => (i ? s + Math.abs(q.x - pts[i - 1].x) + Math.abs(q.y - pts[i - 1].y) : 0), 0);
    straight.sort((a, b) => length(a) - length(b));
    const others = d.boxLike.filter((o) => o !== A && o !== B && !containsObj(o, B, get));
    const clear = (pts) => pts.every((q, i) => !i || (!others.some((o) => segHitsRect(pts[i - 1], q, o) || hugsBorder(pts[i - 1], q, o, HUG_GAP)) && !hugsBorder(pts[i - 1], q, A, HUG_GAP) && !hugsBorder(pts[i - 1], q, B, HUG_GAP) && !overlapsUsed(used, pts[i - 1], q) && !nearUsed(used, pts[i - 1], q)));
    let best = straight.find(clear);
    if (!best) {
      const bent = [];
      for (let y = bot + 16; y <= y2 - 6; y += 8) for (const x of [B.x, B.x + B.w]) bent.push([{ x: cx, y: bot }, { x: cx, y }, { x, y }]);
      bent.sort((a, b) => length(a) - length(b));
      best = bent.find(clear) ?? straight[0];
    }
    e.points = simplify(best);
    addUsed(used, e.points);
    done.add(e);
  }
}
