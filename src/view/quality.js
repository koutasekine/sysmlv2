// 線の質の検査(GR4 P2 の 2 回目の裁定 2)。外部パッケージ・Node.js 固有の機能・DOM を使わない。
//
// passable(o, A, B, get) は、線 A–B が図の要素 o(箱・注の記号・subject などの箱の形のもの)の中を通ってよいかを返す。
//   通ってよいのは、端を中に含む箱(端がポートなら、線が持ち主の箱の内側へ向かうときだけ持ち主を含む)と、
//   相手の端を中に含む、端の箱そのもの(注とその持ち主の箱など)。それ以外は避ける相手(障害物)。
// edgeQuality(d) → { crossings: [{ edge, object }], overlaps: [{ a, b }], sharedEnds: [{ a, b, object }] }
//   crossings  線の区間が、障害物の内側(縁から 1 px 内)を通るもの。線と障害物の組ごとに 1 件。
//              あわせて、線の区間が箱(注の記号を含む)の縁から 3 px 以内を縁と平行に走るもの(kind: 'along-border'。
//              GR4 P2 の 3 回目の裁定 1)
//   overlaps   2 本の線が、同じ縦・横の直線上で 1 px を超えて重なるもの。線の組ごとに 1 件。
//              あわせて、平行な区間が 6 px 以内の間隔で並ぶもの(kind: 'near'。同じ裁定)
//   sharedEnds 2 本の線の端が、同じ要素の同じ点に着くもの(参考)
//   uturns     (d) コの字: 同じ線の続く 3 つの区間で、1 つ目と 3 つ目が逆向きで、どちらかが UTURN_SHORT px 以下(線と位置ごとに 1 件)
//   crossings には、縁に沿う距離 HUG_GAP と、ポート・引数・proxy の記号の横切り(kind: 'port')も入る
//   arrowheads (e) 2 本の線の終点の矢じりが重なるもの(GR6 P2 の確認の後の裁定 1 の (2))。矢じり(長さ 11、幅 10)の
//              外接矩形を各辺 2 px 広げて比べる。線の組ごとに 1 件。矢じりのある線は ARROW_END の記号(src/view/svg.js の
//              marker-end を付ける線と同じ)
//   parallels  (f) 2 本の線の平行な区間が、PAR_MIN px を超え PAR_MAX px 以下の間隔で、PAR_LEN px 以上並んで走るもの
//              (逆向きも同じ向きも数える)。線の組ごとに 1 件。同じ 2 つの要素を結ぶ線の組(行き来する 2 本の遷移など。
//              線の端の要素の組が同じもの)は数えない(GR8 P1 の裁定 Q3)。309 ファイルの既知の件数だけを持ち、
//              例と記号ごとの入力を 0 件にする基準には入れない。線の端の仕上げ(src/view/index.js)の取り消しの判定にも使わない
//   edgeCrossings (g) 2 本の線が交差するもの(GR10 P2 の画像の確認の後の指示 2)。縦の区間と横の区間が、どちらの区間でも
//              端点から 0.5 px を超えて内側の点で交わるもの。交わる点ごとに 1 件(同じ 2 本が 2 か所で交われば 2 件)。
//              5 つのビューで数え、既知の件数だけを持つ(0 件を求めない)。線の端の仕上げの取り消しの判定には使わない

export const BOXLIKE = new Set(['box', 'note', 'dparam', 'pnode']);
// 数え方の値(GR4 の完了報告の確認の後の 2 回目の指示 1)
export const HUG_GAP = 10;      // 縁に沿う距離: ポートの四角の幅 14 の半分 7 に、余裕 3 を足した値
export const PORT_CLEAR = 3;    // ポートの記号を横切るかを調べるとき、記号の四角を広げる量
export const UTURN_SHORT = 30;  // コの字の短い区間: 端から出す長さ 14 の 2 倍に、余裕 2 を足した値
// (f) の値(GR8 P1 の裁定 Q3。309 ファイルの分布は reports/GR8/P1_canary_*.md の 4 章)
export const PAR_MIN = 6, PAR_MAX = 20, PAR_LEN = 80;

// a が b を(入れ子で)含むか
export function containsObj(a, b, get) {
  for (let x = b; x; ) {
    const pid = x.parent ?? x.owner ?? null;
    if (!pid) return false;
    if (pid === a.id) return true;
    x = get(pid);
  }
  return false;
}

// 線の端 X(相手 Y)について、線が中を通ってよい箱の集合
export function chainOf(X, Y, get) {
  const out = new Set();
  let start;
  if (X.type === 'port' || X.type === 'proxy') {
    // ポートの持ち主の箱(入れ子のポートなら、いちばん外のポートの持ち主)
    let o = X;
    while (o.owner && get(o.owner).type === 'port') o = get(o.owner);
    const owner = get(o.owner);
    start = containsObj(owner, Y, get) ? owner : (owner.parent ? get(owner.parent) : null);
  } else if (X.type === 'dot' || X.type === 'cline') {
    start = X.parent ? get(X.parent) : null;
  } else {
    start = containsObj(X, Y, get) ? X : (X.parent ? get(X.parent) : null);
  }
  for (let b = start; b; b = b.parent ? get(b.parent) : null) out.add(b.id);
  return out;
}

export function obstaclesFor(A, B, d, get) {
  const ca = chainOf(A, B, get), cb = chainOf(B, A, get);
  const out = [];
  // passable の箱(アクションフロービューの列とその入れ物。GR7 P1 の裁定 Q3 の 8)は、線が横切ってよい
  for (const o of d.objects.values()) if (BOXLIKE.has(o.type) && !o.passable && !ca.has(o.id) && !cb.has(o.id)) out.push(o);
  return out;
}

// (a) で箱として数える矩形(GR15 指示書 3.1 節・設計書 10 章 v15.1)。行為者(棒人間)は、名前を除いた図形(頭と体)の外接矩形
// (src/view/svg.js の dparamSvg の棒人間。頭の円は中心 y + 8・半径 7、腕は中心から左右 11、脚の先は y + 48)。名前の文字との
// 重なりは (c) で数える。図の質の数え方だけに使い、線を引く処理(src/view/layout.js)の避ける箱は変えない
export function figureRect(o) {
  if (o.type !== 'dparam' || o.symbol !== 'actor') return o;
  const cx = o.x + o.w / 2;
  return { x: cx - 11, y: o.y + 1, w: 22, h: 47 };
}

export function segHitsRect(p, q, o, m = 1) {
  const x1 = Math.min(p.x, q.x), x2 = Math.max(p.x, q.x), y1 = Math.min(p.y, q.y), y2 = Math.max(p.y, q.y);
  return x2 > o.x + m && x1 < o.x + o.w - m && y2 > o.y + m && y1 < o.y + o.h - m;
}

export function edgeQuality(d, opts = {}) {
  const get = (id) => d.objects.get(id);
  // 線の外接矩形。外接矩形どうし(か箱)が m px より離れている組は、どの数え方でも当たらないので、比べる前に除く(結果は変わらない。
  // GR10 P2。m は、縁に沿う線が HUG_GAP + 1、(b) が 6 + 1、(f) が PAR_MAX + 1、(g) が 1。ほかの項目は除かない)。
  // opts.prune が false なら除かない(除く前と後の一致を確かめる tests/view/run.mjs の検査 G0 が使う)
  const prune = opts.prune !== false;
  const bb = d.edges.map((e) => { let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity; for (const p of e.points) { x1 = Math.min(x1, p.x); y1 = Math.min(y1, p.y); x2 = Math.max(x2, p.x); y2 = Math.max(y2, p.y); } return { x1, y1, x2, y2 }; });
  const far = (a, b, m) => prune && (a.x1 > b.x2 + m || b.x1 > a.x2 + m || a.y1 > b.y2 + m || b.y1 > a.y2 + m);
  const rectBB = (o) => ({ x1: o.x, y1: o.y, x2: o.x + o.w, y2: o.y + o.h });
  const crossings = [];
  for (const e of d.edges) {
    const obs = obstaclesFor(get(e.from), get(e.to), d, get);
    for (const o of obs) {
      const f = figureRect(o);
      let hit = false;
      for (let i = 0; i + 1 < e.points.length && !hit; i++) if (segHitsRect(e.points[i], e.points[i + 1], f)) hit = true;
      if (hit) crossings.push({ edge: e.id, object: o.id });
    }
  }
  // (a) に加える: 線の区間が、箱(注の記号を含む)の縁から HUG_GAP px 以内を、縁と平行に 1 px を超えて走るもの(線と箱の組ごとに 1 件)
  d.edges.forEach((e, k) => {
    for (const o of d.objects.values()) {
      const f = BOXLIKE.has(o.type) ? figureRect(o) : o;
      if (!BOXLIKE.has(o.type) || o.passable || far(bb[k], rectBB(f), HUG_GAP + 1)) continue;
      let hit = false;
      for (let i = 0; i + 1 < e.points.length && !hit; i++) if (hugsBorder(e.points[i], e.points[i + 1], f, HUG_GAP)) hit = true;
      if (hit) crossings.push({ edge: e.id, object: o.id, kind: 'along-border' });
    }
  });
  // (a) に加える: 線が、ポート・引数・proxy の記号(その線が着くものを除く)を横切るもの(線と記号の組ごとに 1 件)
  for (const e of d.edges) {
    for (const o of d.objects.values()) {
      if (!(o.type === 'port' || o.type === 'proxy') || o.id === e.from || o.id === e.to) continue;
      const r = portRect(o, PORT_CLEAR);
      let hit = false;
      for (let i = 0; i + 1 < e.points.length && !hit; i++) if (segHitsRect(e.points[i], e.points[i + 1], r, 0)) hit = true;
      if (hit) crossings.push({ edge: e.id, object: o.id, kind: 'port' });
    }
  }
  const segs = d.edges.map((e) => { const s = []; for (let i = 0; i + 1 < e.points.length; i++) s.push([e.points[i], e.points[i + 1]]); return s; });
  const overlaps = [];
  for (let i = 0; i < d.edges.length; i++) for (let j = i + 1; j < d.edges.length; j++) {
    if (far(bb[i], bb[j], 7)) continue;
    let hit = false;
    for (const [p, q] of segs[i]) { for (const [r, s] of segs[j]) { if (collinearOverlap(p, q, r, s) > 1) { hit = true; break; } } if (hit) break; }
    if (hit) { overlaps.push({ a: d.edges[i].id, b: d.edges[j].id }); continue; }
    // (b) に加える: 2 本の線の平行な区間が、6 px 以内の間隔で 1 px を超えて並んで走るもの
    for (const [p, q] of segs[i]) { for (const [r, s] of segs[j]) { if (nearParallel(p, q, r, s, 6) > 1) { hit = true; break; } } if (hit) break; }
    if (hit) overlaps.push({ a: d.edges[i].id, b: d.edges[j].id, kind: 'near' });
  }
  // 2 本の線の端が、同じ要素の同じ点に着くもの(参考。n 端の黒丸から出る線は、黒丸が 1 点なので数えない)
  const sharedEnds = [];
  const ends = new Map();
  for (const e of d.edges) for (const [id, p] of [[e.from, e.points[0]], [e.to, e.points[e.points.length - 1]]]) {
    if (get(id)?.type === 'dot') continue;
    const k = `${id}|${p.x},${p.y}`;
    if (ends.has(k) && ends.get(k) !== e.id) sharedEnds.push({ a: ends.get(k), b: e.id, object: id });
    else ends.set(k, e.id);
  }
  // (d) コの字: 同じ線の続く 3 つの区間で、1 つ目と 3 つ目が逆向きで、そのどちらかが UTURN_SHORT px 以下のもの
  const uturns = [];
  for (const e of d.edges) {
    const pts = e.points;
    for (let i = 0; i + 3 < pts.length; i++) {
      const d1 = dirOf(pts[i], pts[i + 1]), d3 = dirOf(pts[i + 2], pts[i + 3]);
      if (d1.x === -d3.x && d1.y === -d3.y && (d1.x || d1.y)) {
        const l1 = len(pts[i], pts[i + 1]), l3 = len(pts[i + 2], pts[i + 3]);
        if (Math.min(l1, l3) <= UTURN_SHORT) uturns.push({ edge: e.id, at: i });
      }
    }
  }
  // (e) 矢じりの重なり
  const heads = [];
  for (const e of d.edges) {
    if (!ARROW_END.has(e.symbol) || !e.points || e.points.length < 2) continue;
    const t = e.points[e.points.length - 1], p = e.points[e.points.length - 2];
    const ux = Math.sign(t.x - p.x), uy = Math.sign(t.y - p.y);
    const xs = [t.x, t.x - ux * 11 - uy * 5, t.x - ux * 11 + uy * 5], ys = [t.y, t.y - uy * 11 - ux * 5, t.y - uy * 11 + ux * 5];
    heads.push({ id: e.id, x1: Math.min(...xs) - 2, x2: Math.max(...xs) + 2, y1: Math.min(...ys) - 2, y2: Math.max(...ys) + 2 });
  }
  const arrowheads = [];
  for (let i = 0; i < heads.length; i++) for (let j = i + 1; j < heads.length; j++) {
    const a = heads[i], b = heads[j];
    if (a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2) arrowheads.push({ a: a.id, b: b.id });
  }
  // (f) 広い間隔で長く並ぶ線
  const parallels = [];
  for (let i = 0; i < d.edges.length; i++) for (let j = i + 1; j < d.edges.length; j++) {
    const A = d.edges[i], B = d.edges[j];
    if ((A.from === B.from && A.to === B.to) || (A.from === B.to && A.to === B.from) || far(bb[i], bb[j], PAR_MAX + 1)) continue;
    let hit = false;
    for (const [p, q] of segs[i]) { for (const [r, s] of segs[j]) { if (parallelRun(p, q, r, s) >= PAR_LEN) { hit = true; break; } } if (hit) break; }
    if (hit) parallels.push({ a: A.id, b: B.id });
  }
  // (g) 線どうしの交差
  const edgeCrossings = [];
  const inside = (v, a, b) => v > Math.min(a, b) + 0.5 && v < Math.max(a, b) - 0.5;
  for (let i = 0; i < d.edges.length; i++) for (let j = i + 1; j < d.edges.length; j++) {
    if (far(bb[i], bb[j], 1)) continue;
    for (const [p, q] of segs[i]) for (const [r, s] of segs[j]) {
      let h, v;
      if (p.y === q.y && p.x !== q.x && r.x === s.x && r.y !== s.y) { h = [p, q]; v = [r, s]; }
      else if (r.y === s.y && r.x !== s.x && p.x === q.x && p.y !== q.y) { h = [r, s]; v = [p, q]; }
      else continue;
      if (inside(v[0].x, h[0].x, h[1].x) && inside(h[0].y, v[0].y, v[1].y)) edgeCrossings.push({ a: d.edges[i].id, b: d.edges[j].id, x: v[0].x, y: h[0].y });
    }
  }
  return { crossings, overlaps, sharedEnds, uturns, arrowheads, parallels, edgeCrossings, bends: bendStats(d) };
}
// 平行な 2 つの線分の間隔が PAR_MIN を超え PAR_MAX 以下のとき、並ぶ長さ(そうでなければ 0)
function parallelRun(p, q, r, s) {
  const h = p.y === q.y && r.y === s.y && p.x !== q.x && r.x !== s.x;
  const v = p.x === q.x && r.x === s.x && p.y !== q.y && r.y !== s.y;
  if (!h && !v) return 0;
  const gap = h ? Math.abs(p.y - r.y) : Math.abs(p.x - r.x);
  if (gap <= PAR_MIN || gap > PAR_MAX) return 0;
  return Math.max(0, nearParallel(p, q, r, s, PAR_MAX));
}
// 一般ビューの分野ごとの線(GR12)。どれも終点に開いた矢じり。expose の 3 つだけ破線(本文 8.2.3.15・8.2.3.20・8.2.3.21・8.2.3.24〜8.2.3.26 節の図)
export const GR12_EDGES = ['allocate-relationship', 'assume-edge', 'assert-edge', 'frame-relationship', 'satisfy-edge', 'require-edge', 'verify-relationship',
  'include-use-case-relationship', 'expose-r', 'toplevel-expose-r', 'recursive-expose-r'];
// 終点に矢じりのある線の記号(src/view/svg.js の OPEN_END・FILLED_END と同じ)。一般ビュー(GR10)の型の関係の線の終点の記号
// (三角・ひし形・切り込みのある黒い円。src/view/svg.js の END_MARKS)も、矢じりと同じ大きさとみなして入れる
export const ARROW_END = new Set(['binary-dependency', 'n-ary-dependency-supplier-link', 'message', 'transition', 'st-succession', 'else-branch', 'flow', 'succession-flow', 'aflow-succession', 'sq-succession',
  'import', 'top-level-import', 'recursive-import', 'subclassification', 'definition', 'subsetting', 'reference-subsetting', 'redefinition',
  'composite-feature-membership', 'noncomposite-feature-membership', 'portion-relationship', ...GR12_EDGES]);
const dirOf = (p, q) => ({ x: Math.sign(q.x - p.x), y: Math.sign(q.y - p.y) });
const len = (p, q) => Math.abs(q.x - p.x) + Math.abs(q.y - p.y);

// ポート・引数・proxy の記号の四角(m px 広げる)
export function portRect(o, m = 0) {
  const w = o.type === 'proxy' ? 10 : (o.pw ?? 14), h = o.type === 'proxy' ? 10 : (o.ph ?? 14);
  return { x: o.cx - w / 2 - m, y: o.cy - h / 2 - m, w: w + 2 * m, h: h + 2 * m };
}

// 縦横の線分 p–q が、箱 o の縁から gap px 以内を、縁と平行に走る長さ(縁の範囲と重なる部分)が 1 px を超えるか
export function hugsBorder(p, q, o, gap = 3) {
  if (p.y === q.y && p.x !== q.x) {
    const a = Math.max(Math.min(p.x, q.x), o.x), b = Math.min(Math.max(p.x, q.x), o.x + o.w);
    if (b - a <= 1) return false;
    return Math.abs(p.y - o.y) <= gap || Math.abs(p.y - (o.y + o.h)) <= gap;
  }
  if (p.x === q.x && p.y !== q.y) {
    const a = Math.max(Math.min(p.y, q.y), o.y), b = Math.min(Math.max(p.y, q.y), o.y + o.h);
    if (b - a <= 1) return false;
    return Math.abs(p.x - o.x) <= gap || Math.abs(p.x - (o.x + o.w)) <= gap;
  }
  return false;
}

// 平行な 2 つの線分が、0 より大きく gap 以下の間隔で並ぶ長さ
export function nearParallel(p, q, r, s, gap) {
  if (p.y === q.y && r.y === s.y && p.x !== q.x && r.x !== s.x) {
    const dy = Math.abs(p.y - r.y);
    if (dy === 0 || dy > gap) return 0;
    return Math.min(Math.max(p.x, q.x), Math.max(r.x, s.x)) - Math.max(Math.min(p.x, q.x), Math.min(r.x, s.x));
  }
  if (p.x === q.x && r.x === s.x && p.y !== q.y && r.y !== s.y) {
    const dx = Math.abs(p.x - r.x);
    if (dx === 0 || dx > gap) return 0;
    return Math.min(Math.max(p.y, q.y), Math.max(r.y, s.y)) - Math.max(Math.min(p.y, q.y), Math.min(r.y, s.y));
  }
  return 0;
}

function collinearOverlap(p, q, r, s) {
  if (p.y === q.y && r.y === s.y && p.y === r.y) return Math.min(Math.max(p.x, q.x), Math.max(r.x, s.x)) - Math.max(Math.min(p.x, q.x), Math.min(r.x, s.x));
  if (p.x === q.x && r.x === s.x && p.x === r.x) return Math.min(Math.max(p.y, q.y), Math.max(r.y, s.y)) - Math.max(Math.min(p.y, q.y), Math.min(r.y, s.y));
  return 0;
}

// ---- 文字の重なり(GR4 P2 の 3 回目の指示 1 の (c))
// 出来上がった SVG の文字列から、文字の外接矩形・線・箱の縁を読み取り、文字の外接矩形が、ほかの文字・線・箱の縁と
// 重なるものを数える。文字の幅は src/view/textwidth.js の表、高さは字の大きさ(基線の上 0.8、下 0.25)。
// 外接矩形は各辺 1 px 内側に縮めてから比べる。数えないもの: 背景の四角、区画の行を灰色にする四角(文字の背景)、
// 線の当たり判定(data-hit="1" の要素。GR9)。
// textOverlaps(svg) → [{ text, with }]
import { textWidth } from './textwidth.js';

const unesc = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const attr = (tag, name) => { const m = new RegExp(`\\s${name}="([^"]*)"`).exec(tag); return m ? m[1] : null; };

export function svgShapes(svg) {
  const texts = [], segs = [];
  for (const m of svg.matchAll(/<text([^>]*)>([^<]*)<\/text>/g)) {
    const tag = m[1], s = unesc(m[2]);
    const x = +attr(tag, 'x'), y = +attr(tag, 'y'), size = +attr(tag, 'font-size');
    const bold = /font-weight="bold"/.test(tag);
    const w = textWidth(s, size, bold), anchor = attr(tag, 'text-anchor') ?? 'start';
    const rot = /rotate\(-90/.test(tag);
    let x1 = anchor === 'middle' ? x - w / 2 : anchor === 'end' ? x - w : x;
    let b = { x1, x2: x1 + w, y1: y - size * 0.8, y2: y + size * 0.25 };
    if (rot) { const o1 = x1 - x; b = { x1: x - size * 0.8, x2: x + size * 0.25, y1: y - (o1 + w), y2: y - o1 }; }
    texts.push({ s, ...b });
  }
  const P = (a, b) => segs.push([{ x: a[0], y: a[1] }, { x: b[0], y: b[1] }]);
  let first = true;
  for (const m of svg.matchAll(/<(rect|line|polyline|path|circle)([^>]*)\/?>/g)) {
    const [kind, tag] = [m[1], m[2]];
    if (/data-hit="1"/.test(tag)) continue; // 線の当たり判定(src/view/svg.js)は数えない(設計書 7.3 節)
    if (kind === 'rect') {
      if (first) { first = false; continue; } // 背景
      if (/data-sym="element-inside-textual-compartment"/.test(tag)) continue;
      const x = +attr(tag, 'x'), y = +attr(tag, 'y'), w = +attr(tag, 'width'), h = +attr(tag, 'height');
      P([x, y], [x + w, y]); P([x + w, y], [x + w, y + h]); P([x + w, y + h], [x, y + h]); P([x, y + h], [x, y]);
    } else if (kind === 'line') {
      P([+attr(tag, 'x1'), +attr(tag, 'y1')], [+attr(tag, 'x2'), +attr(tag, 'y2')]);
    } else if (kind === 'polyline') {
      const pts = attr(tag, 'points').trim().split(/\s+/).map((p) => p.split(',').map(Number));
      for (let i = 0; i + 1 < pts.length; i++) P(pts[i], pts[i + 1]);
      // 終点の矢じり(marker-end。長さ 11、幅 10)
      if (/marker-end=/.test(tag) && pts.length >= 2) {
        const [tx, ty] = pts[pts.length - 1], [px, py] = pts[pts.length - 2];
        const ux = Math.sign(tx - px), uy = Math.sign(ty - py);
        const bx = tx - ux * 11, by = ty - uy * 11;
        P([tx, ty], [bx - uy * 5, by - ux * 5]); P([tx, ty], [bx + uy * 5, by + ux * 5]); P([bx - uy * 5, by - ux * 5], [bx + uy * 5, by + ux * 5]);
      }
    } else if (kind === 'circle') {
      const cx = +attr(tag, 'cx'), cy = +attr(tag, 'cy'), r = +attr(tag, 'r');
      P([cx - r, cy - r], [cx + r, cy - r]); P([cx + r, cy - r], [cx + r, cy + r]); P([cx + r, cy + r], [cx - r, cy + r]); P([cx - r, cy + r], [cx - r, cy - r]);
    } else {
      // path: M・L・H・V・Q・Z(Q は端点を結ぶ線分とみなす)
      const d = attr(tag, 'd') ?? '';
      let cur = null, start = null;
      for (const t of d.matchAll(/([MLHVQZ])([^MLHVQZ]*)/g)) {
        const nums = t[2].trim().split(/[\s,]+/).filter(Boolean).map(Number);
        if (t[1] === 'M') { cur = [nums[0], nums[1]]; start = cur; }
        else if (t[1] === 'L') { const nx = [nums[0], nums[1]]; P(cur, nx); cur = nx; }
        else if (t[1] === 'H') { const nx = [nums[0], cur[1]]; P(cur, nx); cur = nx; }
        else if (t[1] === 'V') { const nx = [cur[0], nums[0]]; P(cur, nx); cur = nx; }
        else if (t[1] === 'Q') { const nx = [nums[2], nums[3]]; P(cur, nx); cur = nx; }
        else if (t[1] === 'Z') { if (cur && start) P(cur, start); cur = start; }
      }
    }
  }
  return { texts, segs };
}

// 文字の外接矩形を各辺 2 px 広げて比べる(文字とほかのものの間に 2 px の間をとる)
const CLEAR = 2;
const grow = (b) => ({ x1: b.x1 - CLEAR, x2: b.x2 + CLEAR, y1: b.y1 - CLEAR, y2: b.y2 + CLEAR });
const boxesHit = (a, b) => a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2;
export function segHitsBox(p, q, b) {
  // 縦横の線分と、斜めの線分(矢じりなど)は端点を結ぶ外接矩形で近似せず、線分と矩形の交わりを調べる
  const minx = Math.min(p.x, q.x), maxx = Math.max(p.x, q.x), miny = Math.min(p.y, q.y), maxy = Math.max(p.y, q.y);
  if (maxx < b.x1 || minx > b.x2 || maxy < b.y1 || miny > b.y2) return false;
  if (p.x === q.x || p.y === q.y) return true;
  // 斜め: 矩形の 4 隅が線分の同じ側にあれば交わらない
  const side = (x, y) => Math.sign((q.x - p.x) * (y - p.y) - (q.y - p.y) * (x - p.x));
  const s = [side(b.x1, b.y1), side(b.x2, b.y1), side(b.x1, b.y2), side(b.x2, b.y2)];
  return !(s.every((v) => v > 0) || s.every((v) => v < 0));
}

// 外接矩形 b(広げる前)が、文字の外接矩形の一覧 texts・線分の一覧 segs と重なる数
export function boxConflicts(b, texts, segs) {
  const g = grow(b);
  let k = 0;
  for (const t of texts) if (boxesHit(g, t)) k++;
  for (const [p, q] of segs) if (segHitsBox(p, q, g)) k++;
  return k;
}

export function textOverlaps(svg) {
  const { texts, segs } = svgShapes(svg);
  const out = [];
  for (let i = 0; i < texts.length; i++) {
    if (!texts[i].s.trim()) continue;
    const g = grow(texts[i]);
    for (let j = i + 1; j < texts.length; j++) if (texts[j].s.trim() && boxesHit(g, texts[j])) out.push({ text: texts[i].s, with: `文字 ${texts[j].s}` });
    for (const [p, q] of segs) if (segHitsBox(p, q, g)) { out.push({ text: texts[i].s, with: `線 ${p.x},${p.y}-${q.x},${q.y}` }); }
  }
  return out;
}

// ---- (h) 線の余分な曲がり(GR11 指示書 4 章)
// bendOf(points) → { k, m, len, man, orth } | null(点が 2 つ未満か、長さ 0 の線)
//   k    曲がりの数(前後の区間の向きが変わる頂点の数。同じ向きに続く点と長さ 0 の区間は除く)
//   m    最小の曲がりの数(最初の区間の向き d1 で出て、最後の区間の向き d2 で着く直角の折れ線のうち、曲がりの最も少ないもの。
//        ほかの箱や線は考えない。各区間の長さは正)。d1 を下向きに回して、終点のずれ (u, v)(u は横、v は d1 の向き)で場合分けする:
//          d2 が d1 と同じ向き: u = 0 かつ v > 0 なら 0、u ≠ 0 かつ v > 0 なら 2、v ≤ 0 なら 4
//          d2 が d1 と逆の向き: u ≠ 0 なら 2、u = 0 なら 4
//          d2 が d1 と直交: 角の点 (始点の x, 終点の y) が始点の d1 の側(v > 0)にあり、終点が角の点の d2 の側にあれば 1、そうでなければ 3
//   len  線の長さ、man 始点と終点の縦横の距離(|dx| + |dy|)、orth 区間がすべて縦か横か
export function bendOf(points) {
  const pts = [];
  for (const p of points ?? []) { const q = pts[pts.length - 1]; if (!q || q.x !== p.x || q.y !== p.y) pts.push(p); }
  if (pts.length < 2) return null;
  const dirs = [];
  let len = 0, orth = true;
  for (let i = 0; i + 1 < pts.length; i++) {
    const dx = pts[i + 1].x - pts[i].x, dy = pts[i + 1].y - pts[i].y;
    if (dx && dy) orth = false;
    len += Math.abs(dx) + Math.abs(dy);
    const d = { x: Math.sign(dx), y: Math.sign(dy) };
    const last = dirs[dirs.length - 1];
    if (!last || last.x !== d.x || last.y !== d.y) dirs.push(d);
  }
  const k = dirs.length - 1;
  const s = pts[0], t = pts[pts.length - 1];
  const man = Math.abs(t.x - s.x) + Math.abs(t.y - s.y);
  return { k, m: orth ? minBends(s, t, dirs[0], dirs[dirs.length - 1]) : null, len, man, orth };
}
export function minBends(s, t, d1, d2) {
  // d1 を (0, 1)(下向き)に移す回転: v は d1 の向きの成分、u はそれに直交する成分(右手系)
  const dx = t.x - s.x, dy = t.y - s.y;
  const v = dx * d1.x + dy * d1.y, u = dx * -d1.y + dy * d1.x;
  const e2v = d2.x * d1.x + d2.y * d1.y, e2u = d2.x * -d1.y + d2.y * d1.x;
  if (e2v === 1) return u === 0 && v > 0 ? 0 : v > 0 ? 2 : 4;
  if (e2v === -1) return u !== 0 ? 2 : 4;
  return v > 0 && Math.sign(u) === e2u ? 1 : 3;
}
// 図の線ごとの (h) と、あわせて数えるもの(GR11 指示書 4 章)
export function bendStats(d) {
  const per = [];
  for (const e of d.edges) { const b = bendOf(e.points); if (b) per.push({ id: e.id, symbol: e.symbol, ...b, h: b.m === null ? 0 : Math.max(0, b.k - b.m) }); }
  return per;
}
