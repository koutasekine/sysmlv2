// 相互接続ビューの描画の入り口(GR4 指示書 5 章)。外部パッケージ・Node.js 固有の機能・DOM を使わない。
//
// prepareView(text, opts?) → { ok, errors, ctx, candidates }
//   解析(src/parser の parse)と名前解決(src/model の resolveNames)を行い、描く範囲の候補を一覧にする。
//   構文上正しくなければ ok が false
// renderInterconnection(prepared, candidateId?) → { candidate, svg, structure, diagnostics }
//   candidateId を省くと、候補の最初のものを描く。候補がなければ svg は null
// renderText(text, candidateId?) → { ok, errors, candidates, candidate, svg, structure, diagnostics }
//   上の 2 つをまとめたもの
// renderStateTransition(prepared, candidateId?) → renderInterconnection と同じ形(GR6 指示書 5 章)。
//   候補は prepared.stateCandidates(src/view/state.js の listStateCandidates)から選ぶ
// renderStateText(text, candidateId?) → renderText と同じ形の、状態遷移ビューのもの
// renderActionFlow(prepared, candidateId?) → renderInterconnection と同じ形(GR7 指示書 6 章)。
//   候補は prepared.actionCandidates(src/view/action.js の listActionCandidates)から選ぶ
// renderActionText(text, candidateId?) → renderText と同じ形の、アクションフロービューのもの
// renderSequence(prepared, candidateId?) → renderInterconnection と同じ形(GR9 指示書 6 章)。
//   候補は prepared.sequenceCandidates(src/view/sequence.js の listSequenceCandidates)から選ぶ
// renderSequenceText(text, candidateId?) → renderText と同じ形の、シーケンスビューのもの
// renderGeneral(prepared, candidateId?) → renderInterconnection と同じ形(GR10 指示書 5 章)。
//   候補は prepared.generalCandidates(src/view/general.js の listGeneralCandidates)から選ぶ
// renderGeneralText(text, candidateId?) → renderText と同じ形の、一般ビューのもの
// renderTables(prepared, candidateId?) → 表(GR13 指示書 6 章。src/view/table.js)。renderInterconnection と同じ形に tables・anchors を足したもの。
//   候補は prepared.tableCandidates(src/view/table.js の listTableCandidates)から選ぶ
//
// structure は、図の構造(どの要素があり、何が何の中に入り、何と何がつながっているか)。座標を含まない。
//   { candidate, frame: { title, exposes, filters } | null,
//     nodes: [{ id, symbol, parent, label, src, info?: { kind, name, qname }, compartments?: [{ symbol, lines }], ellipsis? }],
//     edges: [{ id, symbol, from, to, label, markers: [記号], src, info? }] }
//   info は、選んだ要素の欄に出す要素の種類(メタクラス)・名前・修飾名
// diagnostics は [{ level: 'info' | 'warn', code, message, start, end }]

import { parse } from '../parser/index.js';
import { resolveNames } from '../model/index.js';
import { makeContext, compareEdgeIds, runNested } from './common.js';
import { listCandidates, exposeScope } from './scope.js';
import { buildDiagram } from './diagram.js';
import { listStateCandidates, buildStateDiagram } from './state.js';
import { listActionCandidates, buildActionDiagram } from './action.js';
import { listSequenceCandidates, buildSequenceDiagram } from './sequence.js';
import { listGeneralCandidates, buildGeneralDiagram } from './general.js';
import { listTableCandidates } from './table.js';
import { layoutDiagram } from './layout.js';
import { renderWithLabels } from './svg.js';
import { edgeQuality, textOverlaps } from './quality.js';

export { FONT_FAMILY, textWidth } from './textwidth.js';
export { renderTables, tsv } from './table.js';
export { escapeXml } from './common.js';

// 線を引く順番と線の端の仕上げの切り替え(GR7 指示書 5 章。設計書 7.3 節)。ここ 1 か所で切り替える。
//   false: GR6 までの動き。線を線の id の文字列の順に引き、線の端の仕上げは状態遷移ビューだけに当てる
//   true:  線を線の要素の記述の順(compareEdgeIds の数の順)に引き、線の端の仕上げをすべてのビューに当てる。
//          仕上げで図の質 (a)〜(e) のどれかが仕上げの前より増えたら、増やした線の引き直しを取り消す(GR7 P1 の裁定 1)
// 描く関数の opts.unified で、1 回の描画だけ切り替えることもできる(全数比較の道具 tools/view/ab_compare.mjs が使う)
// GR7 P3 で true に切り替えた(P2 の裁定)。元の動きに戻すには、この 1 行を false にする
export const UNIFIED_EDGES = true;

// アクションフローの図の配置の切り替え(GR8 指示書 5 章。設計書 7.5 節)。ここ 1 か所で切り替える。
//   false: GR7 までの配置。領域の要素を記述の順の格子(1 行 ceil(√n) 個。開始の節点を先頭)に並べる
//   true:  流れの段で並べる(src/view/layout.js の flowPositions)。アクションフロービューの図と、行動の箱・本体の区画の中の図、
//          状態遷移ビューの中の本体の図が対象。状態遷移ビューの状態の配置と相互接続ビューは変えない
//          あわせて、アクションフローの図の中の引数を、フローの相手の箱がある側の辺に置く(GR8 の裁定 Q5 の K1)
// 描く関数の opts.flowLayers で、1 回の描画だけ切り替えることもできる(全数比較の道具 tools/view/ab_compare.mjs が使う)
// GR8 P3 で true に切り替えた(P2 の裁定)。元の配置に戻すには、この 1 行を false にする
export const FLOW_LAYERS = true;

// 一般ビューの帯の中で、線を離れた位置へ移すか(GR10 P2 の画像の確認の後の 3 回目の裁定 2)。ここ 1 か所で切り替える
export const LANE_MOVE = true;

// 一般ビューの線の余分な曲がりを減らす案(GR11 P1 の裁定で採った案 A・案 C・案 Dx)。ここ 1 か所で切り替える。
//   A  着く点をそろえる(両端が向かい合う辺にあり、横の範囲が重なる線を、同じ x に着けてまっすぐ通す)
//   C  段を 2 つ以上またぐ線を、縦の通り道を通さず、始点か終点の x で縦に通す
//   Dx 段の折り返しの幅の上限(px)。段の要素が ceil(√n) 個を超え、かつ箱の幅の合計がこの値を超えるときだけ折り返す。0 なら今のまま
//      (ceil(√n) 個で折り返す)
//   R  帯のレーンの制約が輪になるとき、着く点をずらして輪を切る(GR11 P1 の裁定 Q3。layout.js の unringBands)
// GR11 P3 で、既定を採る値 { A: true, C: true, Dx: 2400, R: true } にした(GR11 P2 の報告の確認の後の裁定)。
// { A: false, C: false, Dx: 0, R: false } に戻せば、GR11 の前の配置と線引きに戻る。描く関数の opts.bend で、1 回の描画だけ変えられる
export const BEND = { A: true, C: true, Dx: 2400, R: true };

// 図の見た目と中身の直し(GR14 指示書 3 章)。ここ 1 か所で切り替える。
//   N  注の記号を注釈先の近く(右か下の空き)に置く(3.1 節。5 つのビュー)
//   A  一般ビューの主体・行為者・利害関係者の線を関係の段をたどる線に入れ、行為者の下の辺に線を着けない(3.2 節)
//   P  一般ビューで、公開したパッケージの箱の中に、公開したそのメンバーを描く(3.3 節)
//   F  アクションフロービューの外側の箱(と状態遷移ビューの本体の図の箱)の大きさを中身に合わせる(3.4 節)
//   C  計算とケースの定義・使用を、アクションフロービューの候補に入れる(3.5 節)
// すべて false なら GR13 の終わりの図になる。描く関数と prepareView の opts.fig14 で、1 回の描画だけ変えられる
// (全数比較の道具 tools/view/gr14_compare.mjs が使う)
export const FIG14 = { N: true, A: true, P: true, F: true, C: true };
const fig14Of = (opts) => ({ ...FIG14, ...(opts?.fig14 ?? {}) });

// GR15 の直し(GR15 指示書 3 章)。ここ 1 か所で切り替える。
//   R  行為者(棒人間)に着く線を、棒人間の図形(頭と体)に着ける(3.1 節。上から来る線は頭の上の中央、左右から来る線は図形の
//      左右の端。棒人間を描くすべてのビュー。src/view/layout.js の stickOf)
//   R2 (R を入れたときだけ)左右から来る線を、腕の線の高さで手の先(腕の線の端)に着ける(GR15 v15.2 の指示書 3.2 節、設計書 7.3 節)。
//      切ると P5 の終わり(左右の辺の、体の高さの範囲)に戻る
// false なら GR14 の終わりの図になる。描く関数の opts.fig15 で、1 回の描画だけ変えられる(全数比較の道具 tools/view/gr15_compare.mjs が使う)
export const FIG15 = { R: true, R2: true };
const fig15Of = (opts) => ({ ...FIG15, ...(opts?.fig15 ?? {}) });

// GR14 P3(N の直し 1): 図ごとの確かめ。N で注を動かした図(d.notesMoved)と、注を動かさない図(N を切ったもの)を描き比べ、
// 動かした図の (a)〜(e) のどれかが動かさない図より増えるときは、その図では注を動かさない(GR10 の帯の線の入れ替えと同じ考え方)。
// 注を動かさなかった図と、動かした図の (a)〜(e) がすべて 0 の図は(動かさない図より増えることがないので)、描き比べずにそのまま返す
function noteChecked(render, prepared, candidateId, opts, fx) {
  const inner = { ...opts, quality: true, keepDiagram: true, noteCheck: true };
  const c = (x) => [x.quality.crossings.length, x.quality.overlaps.length, x.quality.textOverlaps.length, x.quality.uturns.length, x.quality.arrowheads.length];
  let r = render(prepared, candidateId, inner);
  if (r.diagram?.notesMoved && c(r).some((v) => v > 0)) {
    const r0 = render(prepared, candidateId, { ...inner, fig14: { ...fx, N: false } });
    const a = c(r), b = c(r0);
    if (a.some((v, i) => v > b[i])) r = r0;
  }
  if (!opts.quality) { delete r.quality; delete r.endFix; delete r.flowRows; }
  if (!opts.keepDiagram) delete r.diagram;
  return r;
}

// 配置して SVG にする。unified なら、配置の前に線を記述の順に並べ(配置もポートの辺を決めるのに線の順を使う)、
// 仕上げの後に図の質を確かめる
function layoutAndRender(d, unified) {
  if (unified) { d.edges.sort((a, b) => compareEdgeIds(a.id, b.id)); d.fixAllEnds = true; }
  layoutDiagram(d);
  const r = renderWithLabels(d);
  return unified ? keepEndFixWithinQuality(d, r) : r;
}

// 線の端の仕上げで、図の質 (a)〜(e) のどれかが仕上げの前(d.endFix.before)より増えたら、引き直した線の引き直しを取り消す。
// 引き直した線を線の順に 1 本ずつ取り消してみて、仕上げの前を超える件数の合計が減るなら取り消したままにする。
// それでも超えるものが残れば、引き直した線をすべて取り消す(仕上げの前と同じ図になる)
function qualityCounts(d, svg) {
  const q = edgeQuality(d);
  return [q.crossings.length, q.overlaps.length, textOverlaps(svg).length, q.uturns.length, q.arrowheads.length];
}
function keepEndFixWithinQuality(d, r) {
  const moved = d.endFix?.moved ?? [];
  if (!moved.length) return r;
  const byId = new Map(d.edges.map((e) => [e.id, e]));
  const after = new Map(moved.map((id) => [id, byId.get(id).points]));
  const qAfter = qualityCounts(d, r.svg);
  for (const id of moved) byId.get(id).points = d.endFix.before.get(id);
  const q0 = qualityCounts(d, renderWithLabels(d).svg);
  const excess = (q) => q.reduce((s, v, i) => s + Math.max(0, v - q0[i]), 0);
  for (const id of moved) byId.get(id).points = after.get(id);
  let cur = excess(qAfter);
  const undone = [];
  for (const id of moved) {
    if (cur === 0) break;
    byId.get(id).points = d.endFix.before.get(id);
    const x = excess(qualityCounts(d, renderWithLabels(d).svg));
    if (x < cur) { cur = x; undone.push(id); } else byId.get(id).points = after.get(id);
  }
  if (cur > 0) { for (const id of moved) byId.get(id).points = d.endFix.before.get(id); undone.splice(0, undone.length, ...moved); }
  d.endFix.undone = undone;
  return renderWithLabels(d);
}

// opts.onProgress({ stage, done, total }) は任意。解析の進み具合(src/parser の parse の onProgress)に加えて、
// stage 'resolve'(名前解決を始める)と 'candidates'(候補の一覧を作る)を知らせる(GR4 P3 の裁定 Q25)
export function prepareView(text, opts) {
  const onProgress = opts?.onProgress;
  const p = parse(text, onProgress ? { onProgress } : undefined);
  if (!p.ok) return { ok: false, errors: p.errors, ctx: null, candidates: [] };
  if (onProgress) onProgress({ stage: 'resolve', done: 0, total: null });
  const model = resolveNames(p.tree, text);
  if (onProgress) onProgress({ stage: 'candidates', done: 0, total: null });
  const ctx = makeContext(p.tree, model, text);
  return { ok: true, errors: [], ctx, candidates: listCandidates(ctx), stateCandidates: listStateCandidates(ctx), actionCandidates: listActionCandidates(ctx, fig14Of(opts)), sequenceCandidates: listSequenceCandidates(ctx), generalCandidates: listGeneralCandidates(ctx), tableCandidates: listTableCandidates(ctx) };
}

// opts.quality が true なら、線の質の検査の結果(src/view/quality.js の edgeQuality)を quality に、線の端の仕上げの結果を endFix に入れる
export function renderInterconnection(prepared, candidateId = null, opts = {}) {
  const fx = fig14Of(opts);
  if (fx.N && !opts.noteCheck) return noteChecked(renderInterconnection, prepared, candidateId, opts, fx);
  const { ctx, candidates } = prepared;
  const candidate = (candidateId && candidates.find((c) => c.id === candidateId)) || candidates[0] || null;
  if (!candidate) {
    return { candidate: null, svg: null, structure: null, diagnostics: [{ level: 'info', code: 'no-candidate', message: '描く範囲の候補がない(部品・ポート・接続を持つ部品の定義・使用か、view を書く)', start: null, end: null }] };
  }
  const scope = candidate.kind === 'view' ? exposeScope(ctx, candidate.el) : null;
  const unified = opts.unified ?? UNIFIED_EDGES;
  // 文字を重ならずに置けないか、線のラベルを線の上に置けなければ、格子の間隔を広げて配置からやり直す
  // (GR4 P2 の 3 回目の指示 1、4 回目の裁定 2)。重なり 1 件を 1000、線の下に置いたラベル 1 件を 1 として、最も小さいものを使う
  let best = null;
  for (const gapExtra of [0, 30, 60, 90]) {
    const d = buildDiagram(ctx, candidate, scope);
    d.fig14 = fx;
    d.fig15 = fig15Of(opts);
    d.gapExtra = gapExtra;
    const r = layoutAndRender(d, unified);
    const score = r.conflicts * 1000 + r.below;
    if (!best || score < best.score) best = { d, svg: r.svg, score };
    if (score === 0) break;
  }
  const d = best.d;
  const out = { candidate: { id: candidate.id, kind: candidate.kind, label: candidate.label }, svg: best.svg, structure: structureOf(d, candidate), diagnostics: d.diagnostics };
  if (opts.quality) {
    out.quality = { ...edgeQuality(d), textOverlaps: textOverlaps(out.svg) };
    if (opts.keepDiagram) out.diagram = d;
    // 線の端の仕上げで引き直した線と、図の質が増えたので取り消した線(全数比較の報告に使う)
    if (d.endFix) out.endFix = { moved: d.endFix.moved, undone: d.endFix.undone ?? [] };
  }
  return out;
}

// 状態遷移ビュー(GR6)。配置・SVG・文字の置き方・図の質の数え方は相互接続ビューと同じ部品を使う
export function renderStateTransition(prepared, candidateId = null, opts = {}) {
  const fx = fig14Of(opts);
  if (fx.N && !opts.noteCheck) return noteChecked(renderStateTransition, prepared, candidateId, opts, fx);
  const { ctx } = prepared;
  const candidates = prepared.stateCandidates ?? listStateCandidates(ctx);
  const candidate = (candidateId && candidates.find((c) => c.id === candidateId)) || candidates[0] || null;
  if (!candidate) {
    return { candidate: null, svg: null, structure: null, diagnostics: [{ level: 'info', code: 'no-candidate', message: '描く範囲の候補がない(状態・遷移を持つ状態の定義・使用か、view を書く)', start: null, end: null }] };
  }
  const scope = candidate.kind === 'view' ? exposeScope(ctx, candidate.el) : null;
  const unified = opts.unified ?? UNIFIED_EDGES;
  let best = null;
  for (const gapExtra of [0, 30, 60, 90]) {
    const d = buildStateDiagram(ctx, candidate, scope);
    d.fig14 = fx;
    d.fig15 = fig15Of(opts);
    d.gapExtra = gapExtra;
    d.flowLayers = opts.flowLayers ?? FLOW_LAYERS;
    const r = layoutAndRender(d, unified);
    const score = r.conflicts * 1000 + r.below;
    if (!best || score < best.score) best = { d, svg: r.svg, score };
    if (score === 0) break;
  }
  const d = best.d;
  const out = { candidate: { id: candidate.id, kind: candidate.kind, label: candidate.label }, svg: best.svg, structure: structureOf(d, candidate), diagnostics: d.diagnostics };
  if (opts.quality) {
    out.quality = { ...edgeQuality(d), textOverlaps: textOverlaps(out.svg) };
    if (opts.keepDiagram) out.diagram = d;
    // 線の端の仕上げで引き直した線と、図の質が増えたので取り消した線(全数比較の報告に使う)
    if (d.endFix) out.endFix = { moved: d.endFix.moved, undone: d.endFix.undone ?? [] };
    if (d.flowItemPos) out.flowRows = flowRowsOf(d);
  }
  return out;
}

// アクションフロービュー(GR7)。配置・SVG・文字の置き方・図の質の数え方は、ほかのビューと同じ部品を使う
export function renderActionFlow(prepared, candidateId = null, opts = {}) {
  const { ctx } = prepared;
  const fx = fig14Of(opts);
  if (fx.N && !opts.noteCheck) return noteChecked(renderActionFlow, prepared, candidateId, opts, fx);
  const candidates = prepared.actionCandidates ?? listActionCandidates(ctx, fx);
  const candidate = (candidateId && candidates.find((c) => c.id === candidateId)) || candidates[0] || null;
  if (!candidate) {
    return { candidate: null, svg: null, structure: null, diagnostics: [{ level: 'info', code: 'no-candidate', message: '描く範囲の候補がない(行動・継承・フローを持つ行動の定義・使用か、view を書く)', start: null, end: null }] };
  }
  const scope = candidate.kind === 'view' ? exposeScope(ctx, candidate.el) : null;
  const unified = opts.unified ?? UNIFIED_EDGES;
  let best = null;
  for (const gapExtra of [0, 30, 60, 90]) {
    const d = buildActionDiagram(ctx, candidate, scope, fx);
    d.fig14 = fx;
    d.fig15 = fig15Of(opts);
    d.gapExtra = gapExtra;
    d.flowLayers = opts.flowLayers ?? FLOW_LAYERS;
    const r = layoutAndRender(d, unified);
    const score = r.conflicts * 1000 + r.below;
    if (!best || score < best.score) best = { d, svg: r.svg, score };
    if (score === 0) break;
  }
  const d = best.d;
  const out = { candidate: { id: candidate.id, kind: candidate.kind, label: candidate.label }, svg: best.svg, structure: structureOf(d, candidate), diagnostics: d.diagnostics };
  if (opts.quality) {
    out.quality = { ...edgeQuality(d), textOverlaps: textOverlaps(out.svg) };
    if (opts.keepDiagram) out.diagram = d;
    if (d.endFix) out.endFix = { moved: d.endFix.moved, undone: d.endFix.undone ?? [] };
    if (d.flowItemPos) out.flowRows = flowRowsOf(d);
  }
  return out;
}

// シーケンスビュー(GR9)。配置は src/view/sequence.js の中で決める(格子の配置と線の引き方 src/view/layout.js は使わない)。
// SVG・文字の置き方・図の質の数え方は、ほかのビューと同じ部品を使う
export function renderSequence(prepared, candidateId = null, opts = {}) {
  const fx = fig14Of(opts);
  if (fx.N && !opts.noteCheck) return noteChecked(renderSequence, prepared, candidateId, opts, fx);
  const { ctx } = prepared;
  const candidates = prepared.sequenceCandidates ?? listSequenceCandidates(ctx);
  const candidate = (candidateId && candidates.find((c) => c.id === candidateId)) || candidates[0] || null;
  if (!candidate) {
    return { candidate: null, svg: null, structure: null, diagnostics: [{ level: 'info', code: 'no-candidate', message: '描く範囲の候補がない(メッセージを持つ部品・オカレンスの定義・使用か、view を書く)', start: null, end: null }] };
  }
  const scope = candidate.kind === 'view' ? exposeScope(ctx, candidate.el) : null;
  const d = buildSequenceDiagram(ctx, candidate, scope, fx);
  d.fig14 = fx;
  d.fig15 = fig15Of(opts);
  const r = renderWithLabels(d);
  const out = { candidate: { id: candidate.id, kind: candidate.kind, label: candidate.label }, svg: r.svg, structure: structureOf(d, candidate), diagnostics: d.diagnostics };
  if (opts.quality) { out.quality = { ...edgeQuality(d), textOverlaps: textOverlaps(out.svg) }; if (opts.keepDiagram) out.diagram = d; }
  return out;
}

// 一般ビュー(GR10)。配置は関係の段(src/view/layout.js の flowPositions。設計書 7.7 節)、線と文字の規則・線の端の仕上げ・
// 当たり判定・図の質の数え方は、ほかのビューと同じ部品を使う。
// 段に並べた要素どうしの線は、線の数によらず、段と段の間の帯で引く(d.bandRoute。layout.js の routeBands。GR10 P2 の帯の線引きの
// 裁定)。線の本数の上限は設けない
export function renderGeneral(prepared, candidateId = null, opts = {}) {
  const fx = fig14Of(opts);
  if (fx.N && !opts.noteCheck) return noteChecked(renderGeneral, prepared, candidateId, opts, fx);
  const { ctx } = prepared;
  const candidates = prepared.generalCandidates ?? listGeneralCandidates(ctx);
  const candidate = (candidateId && candidates.find((c) => c.id === candidateId)) || candidates[0] || null;
  if (!candidate) {
    return { candidate: null, svg: null, structure: null, diagnostics: [{ level: 'info', code: 'no-candidate', message: '描く範囲の候補がない(パッケージか、パッケージ以外の要素を直接持つテキストか、view を書く)', start: null, end: null }] };
  }
  const scope = candidate.kind === 'view' ? exposeScope(ctx, candidate.el) : null;
  const unified = opts.unified ?? UNIFIED_EDGES;
  const draw = (gapExtra, laneSwap, laneMove) => {
    const d = buildGeneralDiagram(ctx, candidate, scope, fx);
    d.fig14 = fx;
    d.fig15 = fig15Of(opts);
    d.gapExtra = gapExtra;
    d.flowLayers = true;
    d.topFlow = true;
    d.layerWrap = true;
    d.bandRoute = true;
    d.laneSwap = laneSwap;
    d.laneMove = laneMove;
    d.bendOpts = { ...BEND, ...(opts.bend ?? {}) };
    return { d, r: layoutAndRender(d, unified) };
  };
  // 帯の中のレーンの上下の入れ替え(layout.js の routeBands)は、入れ替えた図の (g) が入れ替えない図より減り、かつ (a)〜(e) が
  // どれも増えないときだけ採る(GR10 P2 の画像の確認の後の 2 回目の裁定 1)。入れ替えが起きなければ、描き直さない。
  // 線を離れた位置へ移すこと(d.laneMove。3 回目の裁定 2)も、移した図を、移さない図(入れ替えを採るかを上のとおり決めたもの)と
  // 同じ基準で比べて採る。移すことが起きなければ、描き直さない
  const counts = (x) => { if (!x.q) { const q = edgeQuality(x.d); x.q = [q.crossings.length, q.overlaps.length, textOverlaps(x.r.svg).length, q.uturns.length, q.arrowheads.length, q.edgeCrossings.length]; } return x.q; };
  const better = (x, y) => { const a = counts(x), b = counts(y); return a[5] < b[5] && a.slice(0, 5).every((v, i) => v <= b[i]); };
  const swapOnly = (gapExtra, swapped) => { const s = swapped ?? draw(gapExtra, true, false); if (!s.d.laneSwapped) return s; const n = draw(gapExtra, false, false); return better(s, n) ? s : n; };
  let best = null;
  for (const gapExtra of [0, 30, 60, 90]) {
    let x = draw(gapExtra, true, LANE_MOVE);
    if (x.d.laneMoved) { const y = swapOnly(gapExtra); if (!better(x, y)) x = y; }
    else if (x.d.laneSwapped) x = swapOnly(gapExtra, x);
    const { d, r } = x;
    const score = r.conflicts * 1000 + r.below;
    if (!best || score < best.score) best = { d, svg: r.svg, score };
    if (score === 0) break;
  }
  const d = best.d;
  const out = { candidate: { id: candidate.id, kind: candidate.kind, label: candidate.label }, svg: best.svg, structure: structureOf(d, candidate), diagnostics: d.diagnostics };
  if (opts.quality) {
    out.quality = { ...edgeQuality(d), textOverlaps: textOverlaps(out.svg) };
    if (opts.keepDiagram) out.diagram = d;
    if (d.endFix) out.endFix = { moved: d.endFix.moved, undone: d.endFix.undone ?? [] };
    if (d.flowItemPos) out.flowRows = flowRowsOf(d);
  }
  return out;
}

export function renderGeneralText(text, candidateId = null) {
  const p = prepareView(text);
  if (!p.ok) return { ok: false, errors: p.errors, candidates: [], candidate: null, svg: null, structure: null, diagnostics: [] };
  const r = renderGeneral(p, candidateId);
  return { ok: true, errors: [], candidates: p.generalCandidates.map((c) => ({ id: c.id, kind: c.kind, label: c.label })), ...r };
}

export function renderSequenceText(text, candidateId = null) {
  const p = prepareView(text);
  if (!p.ok) return { ok: false, errors: p.errors, candidates: [], candidate: null, svg: null, structure: null, diagnostics: [] };
  const r = renderSequence(p, candidateId);
  return { ok: true, errors: [], candidates: p.sequenceCandidates.map((c) => ({ id: c.id, kind: c.kind, label: c.label })), ...r };
}

// 流れの段の配置で決めた、領域の要素ごとの行(段。たどり着けない要素は最後の段の下の格子の行)。全数比較と検査が使う
function flowRowsOf(d) {
  return Object.fromEntries([...d.flowItemPos].map(([id, k]) => [id, k.r]));
}

export function renderActionText(text, candidateId = null) {
  const p = prepareView(text);
  if (!p.ok) return { ok: false, errors: p.errors, candidates: [], candidate: null, svg: null, structure: null, diagnostics: [] };
  const r = renderActionFlow(p, candidateId);
  return { ok: true, errors: [], candidates: p.actionCandidates.map((c) => ({ id: c.id, kind: c.kind, label: c.label })), ...r };
}

export function renderStateText(text, candidateId = null) {
  const p = prepareView(text);
  if (!p.ok) return { ok: false, errors: p.errors, candidates: [], candidate: null, svg: null, structure: null, diagnostics: [] };
  const r = renderStateTransition(p, candidateId);
  return { ok: true, errors: [], candidates: p.stateCandidates.map((c) => ({ id: c.id, kind: c.kind, label: c.label })), ...r };
}

export function renderText(text, candidateId = null) {
  const p = prepareView(text);
  if (!p.ok) return { ok: false, errors: p.errors, candidates: [], candidate: null, svg: null, structure: null, diagnostics: [] };
  const r = renderInterconnection(p, candidateId);
  return { ok: true, errors: [], candidates: p.candidates.map((c) => ({ id: c.id, kind: c.kind, label: c.label })), ...r };
}

export function structureOf(d, candidate) {
  const nodes = [];
  const symOf = (o) => {
    if (o.type === 'port') return `${o.symbol}-${o.side}`;
    if (o.type === 'proxy') return o.symbol === 'sq-proxy' ? 'sq-proxy' : o.side === 'l' || o.side === 'r' ? 'proxy-v' : 'proxy-h';
    return o.symbol;
  };
  // 入れ子の箱は明示のスタックで回す(GR27 の R。nodes に入れる順は前の再帰と同じ)
  const visit = function* (o, parent) {
    // 列の外の節点の入れ物(アクションフロービューの helper)は構造に出さず、中身を持ち主の子にする
    if (o.helper) { for (const id of o.region) yield visit(d.objects.get(id), parent); return; }
    const n = { id: o.id, symbol: symOf(o), parent, label: o.header ? `${o.header.keyword} ${o.header.name}` : (o.label ?? (o.heading ?? []).join(' ')), src: o.src };
    if (o.info) n.info = o.info;
    if (o.type === 'port' && o.dir) n.direction = o.dir;
    if (o.inherited) n.inherited = true;
    if (o.type === 'box') {
      const comps = o.preCompartments?.length ? [...o.preCompartments, ...o.compartments] : o.compartments;
      if (comps.length) n.compartments = comps.map((c) => ({ symbol: c.symbol, lines: c.lines.map((l) => l.text), ...(c.body ? { body: c.body } : {}) }));
      if (o.ellipsis) n.ellipsis = true;
    }
    if (o.type === 'note') n.lines = o.lines;
    nodes.push(n);
    if (o.type === 'box') {
      for (const id of o.ports) yield visit(d.objects.get(id), o.id);
      for (const id of o.region) yield visit(d.objects.get(id), o.id);
      for (const x of d.objects.values()) if (x.type === 'cline' && x.parent === o.id) nodes.push({ id: x.id, symbol: x.symbol, parent: o.id, label: x.line.text, src: x.src });
      // 区画の中の本体の図(GR7)
      for (const c of [...(o.preCompartments ?? []), ...o.compartments]) if (c.body) yield visit(d.objects.get(c.body), o.id);
    }
    if (o.type === 'port') for (const id of o.children) yield visit(d.objects.get(id), o.id);
  };
  for (const id of d.top) runNested(visit(d.objects.get(id), null));
  for (const o of d.objects.values()) if (o.type === 'dot') nodes.push({ id: o.id, symbol: o.symbol, parent: o.parent, label: o.label, src: o.src });
  // シーケンスビューのポートの頭・生存線・生存線の上の点(GR9)
  for (const o of d.objects.values()) {
    if (o.type === 'sqport') nodes.push({ id: o.id, symbol: o.symbol, parent: o.parent, label: o.label, src: o.src, ...(o.info ? { info: o.info } : {}) });
    if (o.type === 'lifeline') {
      nodes.push({ id: o.id, symbol: o.symbol, parent: o.parent, label: '', src: o.src });
      for (const id of o.proxies) { const p = d.objects.get(id); nodes.push({ id: p.id, symbol: p.symbol, parent: o.id, label: p.label, src: p.src }); }
    }
  }
  const edges = d.edges.map((e) => ({ id: e.id, symbol: e.symbol, from: e.from, to: e.to, label: e.label ?? '', markers: (e.markers ?? []).map((m) => m.symbol), src: e.src ?? null, ...(e.info ? { info: e.info } : {}) }));
  const frame = d.frame ? { title: d.frame.title, exposes: d.frame.exposes, filters: d.frame.filters, src: d.frame.src, info: d.frame.info } : null;
  return { candidate: candidate.id, frame, nodes, edges };
}
