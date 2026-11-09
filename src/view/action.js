// アクションフロービューの描く範囲と図の要素の組み立て(GR7 指示書 6 章、設計書 7.5 節)。
// 外部パッケージ・Node.js 固有の機能・DOM を使わない。
//
// listActionCandidates(ctx) → [{ id, kind: 'view' | 'action', label, el }]
//   テキストに view(ViewUsage)があれば、view を記述の順に並べる。なければ、行動・継承・フローを直接所有する
//   ActionDefinition・ActionUsage(PerformActionUsage を含む。状態・計算・遷移、if・ループの本体を除く)を、
//   入れ子のものも含めて記述の順に並べる(設計書 5 章)。
// buildActionDiagram(ctx, candidate, scope) → diagram(src/view/diagram.js の buildDiagram と同じ形)
// flowKit(ctx, env) → アクションフローの図を、ほかのビュー(状態遷移ビューの本体)の中に組み立てる部品。
//   env = { objects, top, edges, diagnostics, elObjs, lineOf, aliases, viewMode, scope }
//   kit.fillFlow(box, ns)          ns のメンバーを box の領域に、アクションフロービューの要素として置く
//   kit.bodyBox(owner, el, sym)    区画の中の本体の図(action-flow-view の枠なしの箱)を作り、el のメンバーを置く
//   kit.nodeSections(el)           行動の種類ごとの式と、then・else・ループの本体の区画(本体は bodyEl で返す)
//   kit.addBodies(box, pre)        nodeSections の本体を、本体の図か文字の区画にする
//   kit.finish()                   線(継承・遷移・フロー・結合・依存・注釈)を組み立て、開始の節点を先頭に置く
//
// 図の要素の種類(type)と記号(tools/view/symbols.json の actionFlow の生成規則の名前):
//   box    action-def・action・action-ref(中に action-flow-view を持つ。四辺に param-*)、perform-action-usage、
//          send-action-node・accept-action-node・assign-action-node・if-else-action-node・while-loop-action-node・
//          for-loop-action-node(四辺に param-*)、swimlane(部品ごとの列)、
//          枠なしの箱(plain): action-flow-view(区画の中の本体の図)・perform-actions-swimlanes(列の入れ物)・
//          列の外の節点の入れ物(helper。構造には出さない)
//   pnode  start-node・done-node・terminate-node・fork-node・join-node・decision-node・merge-node
//   note   注釈(相互接続ビューと同じ)
//   port   param(行動の引数)・proxy(図に描いていない特徴の端。アクションフロービューの中だけ)
// 線: aflow-succession・else-branch・flow・succession-flow・message・binding-connection と、依存・注釈の線
//
// 読み方は GR7 P1 の裁定(Q1〜Q13)による(reports/GR7/P1_symbols_*.md・P3_render_*.md の「本文から外れる点」)。

import { joinTokens, runNested } from './common.js';
import { pathOf, isPartLike } from './scope.js';
import { compartmentOf, noteContent } from './diagram.js';
import { textWidth } from './textwidth.js';
import { FSS } from './layout.js';
import { transitionEnds, successionEnds, isDrawnSuccession } from './ends.js';
import { walkTree } from '../parser/tree.js';

const conf = (ctx, e, k) => !!e && ctx.model.conforms(e.kind, k);
const isBuiltinAction = (e) => !!e?.builtin && /^Actions::Action::(start|done)$/.test(e.qname ?? '');

// 行動として描くもの(状態・計算(ケースを含む)・遷移・フローを除く)
// フロー(FlowUsage・FlowDefinition)も行動の下位の種類だが、線(flow)として描くので除く
const NOT_ACTION = ['StateDefinition', 'StateUsage', 'CalculationDefinition', 'CalculationUsage', 'TransitionUsage', 'FlowUsage', 'FlowDefinition'];
export function isActionLike(ctx, e) {
  return ctx.isAny(e, ['ActionDefinition', 'ActionUsage']) && !ctx.isAny(e, NOT_ACTION);
}
// アクションフローの図にする要素(行動・継承・遷移・フロー・結合)か。引数(ParameterMembership の要素)は数えない
function isFlowMember(ctx, rel, el) {
  if (conf(ctx, rel, 'ParameterMembership') || !ctx.user(el)) return false;
  // then の継承(SourceSuccession)は原文の範囲が空の要素になる(持ち主のメンバーシップが 'then' の字句を持つ)
  if (el.start === el.end) return conf(ctx, el, 'Succession');
  return ctx.isAny(el, ['ActionUsage', 'TransitionUsage', 'FlowUsage', 'BindingConnectorAsUsage']) || conf(ctx, el, 'Succession');
}
// 行動・継承・フローを直接所有するか(候補の条件。GR7 P1 の裁定 Q9 の 2 の、本体を図にする条件も同じ)
export function hasFlowMembers(ctx, e) {
  return ctx.members(e).some(({ rel, el }) => isFlowMember(ctx, rel, el));
}
// if・ループの本体(ParameterMembership の ActionUsage)
function isBodyParam(ctx, e) {
  const r = ctx.owningRel(e);
  return conf(ctx, r, 'ParameterMembership') && ctx.isAny(ctx.ownerOf(e), ['IfActionUsage', 'LoopActionUsage']);
}

// GR14 の C(src/view/index.js の FIG14.C。指示書 3.5 節): 計算とケースの定義・使用(SysML 2.0 の 8.2.3.19・8.2.3.23〜8.2.3.25 節で
// action-flow-element に足されているもの)。上から順に当てる。一般の case と include use case は本文の図表記に記号がないので入れない。
// [種類, 記号, 名前の区画のキーワードの語(def の前まで), 候補の名前の語]
const CALC_KINDS = [
  ['AnalysisCaseDefinition', 'analysis-def', ['analysis'], 'analysis def'], ['AnalysisCaseUsage', 'analysis', ['analysis'], 'analysis'],
  ['VerificationCaseDefinition', 'verification-def', ['verification'], 'verification def'], ['VerificationCaseUsage', 'verification', ['verification'], 'verification'],
  ['UseCaseDefinition', 'use-case-def', ['use', 'case'], 'use case def'], ['IncludeUseCaseUsage', null], ['UseCaseUsage', 'use-case', ['use', 'case'], 'use case'],
  ['CaseDefinition', null], ['CaseUsage', null],
  ['CalculationDefinition', 'calc-def', ['calc'], 'calc def'], ['CalculationUsage', 'calc', ['calc'], 'calc'],
];
function calcKind(ctx, e) {
  const hit = CALC_KINDS.find(([k]) => ctx.is(e, k));
  return hit?.[1] ? hit : null;
}

// ---- 描く範囲の候補
export function listActionCandidates(ctx, fx = {}) {
  const views = [];
  const acts = [];
  walkTree(ctx.tree, (e) => {
    if (ctx.is(e, 'ViewUsage')) views.push(e);
    else if (ctx.user(e) && (isActionLike(ctx, e) || (fx.C && calcKind(ctx, e))) && !isBodyParam(ctx, e) && hasFlowMembers(ctx, e)) acts.push(e);
  }); // 明示のスタックでたどる(GR18 の B1)
  const list = views.length ? views.map((el) => ({ kind: 'view', el })) : acts.map((el) => ({ kind: 'action', el }));
  const seen = new Map();
  return list.map((c) => {
    const p = pathOf(ctx, c.el);
    const base = `${c.kind}:${p}`;
    const k = (seen.get(base) ?? 0) + 1;
    seen.set(base, k);
    const word = c.kind === 'view' ? 'view' : fx.C && calcKind(ctx, c.el) ? calcKind(ctx, c.el)[3] : ctx.is(c.el, 'ActionDefinition') ? 'action def' : ctx.is(c.el, 'PerformActionUsage') ? 'perform action' : 'action';
    return { id: k === 1 ? base : `${base}#${k}`, kind: c.kind, label: `${word} ${p}`, el: c.el };
  });
}

// ---- 文字
const KIND_KW = ['action', 'accept', 'send', 'assign', 'if', 'while', 'for', 'loop', 'perform', 'entry', 'do', 'exit', 'fork', 'join', 'decide', 'merge', 'terminate'];
function wrap(s, max = 60) {
  if (s.length <= max) return [s];
  const out = [];
  let cur = '';
  for (const w of s.split(' ')) {
    if (cur && cur.length + 1 + w.length > max) { out.push(cur); cur = w; } else cur = cur ? `${cur} ${w}` : w;
  }
  if (cur) out.push(cur);
  return out;
}

// 行動の種類ごとの箱の記号・名前の区画のキーワード・名前の区画の記号(8.2.3.17 節)
const NODE_KINDS = [
  ['AcceptActionUsage', 'accept-action-node', 'accept action', 'accept-action-name-compartment'],
  ['SendActionUsage', 'send-action-node', 'send action', 'send-action-name-compartment'],
  ['AssignmentActionUsage', 'assign-action-node', 'assign', 'assign-action-name-compartment'],
  ['IfActionUsage', 'if-else-action-node', 'if', 'ifelse-action-name-compartment'],
  ['WhileLoopActionUsage', 'while-loop-action-node', 'loop', 'while-loop-action-name-compartment'],
  ['ForLoopActionUsage', 'for-loop-action-node', 'loop', 'for-loop-action-name-compartment'],
];
const CONTROL_NODES = [['ForkNode', 'fork-node'], ['JoinNode', 'join-node'], ['DecisionNode', 'decision-node'], ['MergeNode', 'merge-node'], ['TerminateActionUsage', 'terminate-node']];

// ---- アクションフローの図を組み立てる部品
export function flowKit(ctx, env) {
  const { objects, top, edges, elObjs, lineOf, aliases } = env;
  const pending = []; // { el, box, kind: 'transition' | 'succession' | 'flow' | 'succession-flow' | 'message' | 'binding' }
  const pendingDeps = [];
  const annotations = [];
  const flowBoxes = new Set(); // アクションフローの図を持つ箱(領域に行動・節点を置く箱)
  const drawn = (el) => !env.viewMode || env.scope.drawn.has(el);
  const idOf = (el) => 'e' + ctx.order.get(el);
  // 原文の範囲。then の継承のように範囲が空の要素は、持ち主のメンバーシップの範囲('then' の字句)にする
  const srcOf = (el) => { if (el.start === el.end) { const r = ctx.owningRel(el); if (r && r.start !== r.end) return [r.start, r.end]; } return [el.start, el.end]; };
  const diag = (level, code, message, el) => env.diagnostics.push({ level, code, message, start: el?.start ?? null, end: el?.end ?? null });
  const reg = (o) => {
    objects.set(o.id, o);
    if (o.el) { if (!elObjs.has(o.el)) elObjs.set(o.el, []); elObjs.get(o.el).push(o); }
    return o;
  };
  const put = (parent, o) => { if (parent) parent.region.push(o.id); else top.push(o.id); };

  // 名前の区画: キーワードの行と名前の行(src/view/state.js の header と同じ考え方)
  function header(el, kindWord) {
    const toks = ctx.declTokens(el);
    const k = toks.findIndex((t) => t.kind === 'KEYWORD' && KIND_KW.includes(t.text));
    const prefix = k >= 0 ? toks.slice(0, k) : [];
    let rest = k >= 0 ? toks.slice(k + 1) : toks;
    if (rest[0]?.text === 'def') rest = rest.slice(1);
    let name = ctx.is(el, 'ActionUsage')
      ? [ctx.nameOf(el), ctx.typeText(el)].filter((x) => x != null).join(' : ')
      : joinTokens(rest.filter((t) => !(t.kind === 'KEYWORD' && KIND_KW.includes(t.text))));
    const al = aliases.get(el);
    if (al?.length) name += ` «alias» ${al.join(', ')}`;
    const pre = joinTokens(prefix);
    return { keyword: `«${pre ? pre + ' ' : ''}${kindWord}»`, name };
  }

  // 計算とケースの箱の名前の区画(GR14 の C): キーワードの行は接頭辞と種類の語(def があれば def まで)、名前の行は、定義なら
  // 残りの宣言、使用なら名前と型(一般ビューの GR12 の記号と同じ文字)
  function calcHeader(el, words) {
    const toks = ctx.declTokens(el);
    const k = toks.findIndex((t, i) => words.every((w, j) => toks[i + j]?.kind === 'KEYWORD' && toks[i + j].text === w));
    const end = k < 0 ? 0 : k + words.length + (toks[k + words.length]?.text === 'def' ? 1 : 0);
    const kw = k < 0 ? `${words.join(' ')}${ctx.is(el, 'Definition') ? ' def' : ''}` : joinTokens(toks.slice(0, end));
    let name = ctx.is(el, 'Usage') ? [ctx.nameOf(el), ctx.typeText(el)].filter((x) => x != null).join(' : ') : joinTokens(toks.slice(end));
    const al = aliases.get(el);
    if (al?.length) name += ` «alias» ${al.join(', ')}`;
    return { keyword: `«${kw}»`, name };
  }

  function addLine(list, c, el, text) {
    let comp = list.find((x) => x.symbol === c.symbol && !x.body);
    if (!comp) { comp = { symbol: c.symbol, title: c.title, lines: [], ...(c.upright ? { upright: true } : {}) }; list.push(comp); }
    for (const t of wrap(text)) comp.lines.push({ text: t, src: srcOf(el) });
    if (!lineOf.has(el)) lineOf.set(el, { box: null, line: comp.lines[comp.lines.length - 1] });
  }

  // 行動の種類ごとの式(accept・send・assign は名前の区画の下の文字、if・while・for は見出しのある区画)と、
  // then・else・ループの本体の区画。本体は { symbol, title, bodyEl } で返す(addBodies で図か文字にする)
  function nodeSections(el) {
    const after = [];
    const pre = [];
    const dt = ctx.declTokens(el), all = ctx.elemTokens(el);
    const afterKw = (toks, kw) => { const i = toks.findIndex((t) => t.kind === 'KEYWORD' && t.text === kw); return i >= 0 ? joinTokens(toks.slice(i + 1)) : null; };
    const exprOf = (kw) => afterKw(dt, kw);
    const C = (symbol, title, text) => { if (text) pre.push({ symbol, title, upright: true, lines: wrap(text).map((t) => ({ text: t, src: srcOf(el) })) }); };
    const bodies = el.owned.filter((c) => conf(ctx, c, 'ParameterMembership') && c.related[0] && ctx.is(c.related[0], 'ActionUsage')).map((c) => c.related[0]);
    const B = (symbol, title, bodyEl) => { if (bodyEl) pre.push({ symbol, title, upright: true, lines: [], bodyEl }); };
    if (ctx.is(el, 'AcceptActionUsage')) { const x = exprOf('accept'); if (x) after.push(...wrap(x)); }
    else if (ctx.is(el, 'SendActionUsage')) { const x = exprOf('send'); if (x) after.push(...wrap(x)); }
    else if (ctx.is(el, 'AssignmentActionUsage')) { const x = exprOf('assign'); if (x) after.push(...wrap(x)); }
    else if (ctx.is(el, 'IfActionUsage')) {
      C('if-condition', 'if condition', exprOf('if'));
      B('then-body', 'then body', bodies[0]);
      B('else-body', 'else body', bodies[1]);
    } else if (ctx.is(el, 'WhileLoopActionUsage')) {
      C('while-condition', 'while condition', exprOf('while'));
      B('loop-body', 'loop body', bodies[0]);
      // until は本体の後ろ(本体の { … } の外の 'until' から終わりまで)
      let depth = 0, k = -1;
      all.forEach((t, i) => { if (t.kind === 'SYMBOL' && t.text === '{') depth++; else if (t.kind === 'SYMBOL' && t.text === '}') depth--; else if (depth === 0 && t.kind === 'KEYWORD' && t.text === 'until') k = i; });
      if (k >= 0) C('until-condition', 'until condition', joinTokens(all.slice(k + 1)));
    } else if (ctx.is(el, 'ForLoopActionUsage')) {
      C('iteration', 'for iterator', exprOf('for'));
      B('loop-body', 'loop body', bodies[0]);
    }
    return { after, pre };
  }

  // 区画の中の本体の図(枠なしの箱 action-flow-view)。el が if・ループの本体(名前のない ActionUsage)なら、そのメンバーを置く。
  // else if … の else の本体のように、本体が種類のある行動そのもの(IfActionUsage など)なら、その行動 1 つを置く(裁定 Q9 の 4)
  // 行動の入れ子(actionBox → addBodies → bodyBox → fillFlow → placeFlow → actionBox …)は、明示のスタックで回す(GR27 の R。設計書 2.6 節。
  // 各関数は、同じ名前の入口(外から呼ぶもの)と、ジェネレーター(…Gen。入れ子の中から yield で呼ぶもの)に分けた。箱を作る順は前の再帰と同じ)
  function bodyBox(owner, el, sym, asNode = false) { return runNested(bodyBoxGen(owner, el, sym, asNode)); }
  function* bodyBoxGen(owner, el, sym, asNode) {
    const b = reg({ id: `${owner.id}.${sym}`, type: 'box', symbol: 'action-flow-view', plain: true, bodyOf: owner.id, el: null, src: srcOf(el), parent: owner.id, region: [], ports: [], compartments: [], header: { keyword: '', name: '' }, ellipsis: false, omittedGeneralView: false });
    flowBoxes.add(b);
    if (asNode) yield placeFlowGen(b, ctx.owningRel(el), el, ctx.ownerOf(el));
    else yield fillFlowGen(b, el, new Set());
    return b;
  }
  // 本体を図にするか(裁定 Q9 の 2): 本体が行動・継承・フロー・結合を直接持つか、本体が種類のある行動そのものなら図
  const bodyAsNode = (el) => el.kind !== 'ActionUsage';
  const bodyIsDiagram = (el) => bodyAsNode(el) || hasFlowMembers(ctx, el);
  // nodeSections の本体を、本体の図(c.body)か、本体の原文の文字(action-body-textual)にする
  function addBodies(box, pre) { runNested(addBodiesGen(box, pre)); }
  function* addBodiesGen(box, pre) {
    for (const c of pre) {
      if (!c.bodyEl) continue;
      const el = c.bodyEl;
      delete c.bodyEl;
      if (bodyIsDiagram(el)) c.body = (yield bodyBoxGen(box, el, c.symbol, bodyAsNode(el))).id;
      else for (const t of wrap(joinTokens(ctx.elemTokens(el)))) c.lines.push({ text: t, src: srcOf(el) });
    }
  }

  // 引数(向きのある特徴)を四辺に描く(param-*)。戻り値は引数にしたメンバーの集合
  function params(box, el) {
    const done = new Set();
    for (const { rel, el: m } of ctx.members(el)) {
      if (m.start === m.end || !ctx.user(m)) continue;
      if (m.attrs.direction !== undefined && conf(ctx, rel, 'FeatureMembership') && !conf(ctx, rel, 'ReturnParameterMembership') && drawn(m)) {
        const type = ctx.typeText(m);
        const p = reg({ id: idOf(m), type: 'port', symbol: 'param', el: m, src: srcOf(m), owner: box.id, inherited: false, dir: m.attrs.direction ?? null, dashed: !!m.attrs.isReference, label: (ctx.nameOf(m) ?? '') + (type ? ` : ${type}` : ''), children: [] });
        box.ports.push(p.id);
        done.add(m);
      }
    }
    return done;
  }

  // 行動の箱。outer は描く範囲の外側の箱(行動の定義は action-def、perform の行動は action の形で名前の区画を
  // «perform action» にする。裁定 Q5)
  function actionBox(el, parent, outer = false) { return runNested(actionBoxGen(el, parent, outer)); }
  function* actionBoxGen(el, parent, outer) {
    let symbol, kw, nameSym, icon = null;
    const nk = NODE_KINDS.find(([m]) => ctx.is(el, m));
    const ck = outer && env.fx?.C ? calcKind(ctx, el) : null;
    if (ck) { symbol = ck[1]; nameSym = `${ck[1]}-name-compartment`; }
    else if (ctx.is(el, 'ActionDefinition')) { symbol = 'action-def'; kw = 'action def'; nameSym = 'action-def-name-compartment'; }
    else if (ctx.is(el, 'PerformActionUsage')) {
      // 裁定 Q4: アクションフロービューの中の perform の行動は perform-action-usage の箱。描く範囲そのものなら action の形
      symbol = outer ? (el.attrs.isReference ? 'action-ref' : 'action') : 'perform-action-usage'; kw = 'perform action'; nameSym = 'perform-action-name-compartment';
    } else if (nk) { symbol = nk[1]; kw = nk[2]; nameSym = nk[3]; if (nk[0] === 'SendActionUsage') icon = 'send'; if (nk[0] === 'AcceptActionUsage') icon = 'accept'; }
    else { symbol = el.attrs.isReference ? 'action-ref' : 'action'; kw = 'action'; nameSym = 'action-name-compartment'; }
    const h = ck ? calcHeader(el, ck[2]) : header(el, kw);
    const sec = nk ? nodeSections(el) : { after: [], pre: [] };
    if (sec.after.length) h.after = sec.after;
    const box = reg({ id: idOf(el), type: 'box', symbol, nameSym, el, src: srcOf(el), parent: parent?.id ?? null, region: [], ports: [], compartments: [], ...(sec.pre.length ? { preCompartments: sec.pre } : {}), header: h, ellipsis: false, omittedGeneralView: false, ...(icon ? { icon } : {}) });
    put(parent, box);
    yield addBodiesGen(box, sec.pre);
    // perform-action-usage は引数も中の図も持たない(本文の図)。メンバーは文字の区画に出す
    if (symbol === 'perform-action-usage') { fillText(box, el, new Set()); return box; }
    const ps = params(box, el);
    if (nk) return box; // 種類のある行動の中身は、式と本体の区画で描く
    flowBoxes.add(box);
    yield fillFlowGen(box, el, ps);
    return box;
  }

  function pnode(symbol, el, parent, id = null) {
    const o = reg({ id: id ?? idOf(el), type: 'pnode', symbol, el, src: el ? srcOf(el) : null, parent: parent?.id ?? null, label: '' });
    put(parent, o);
    return o;
  }

  function makeNote(el, box, ns) {
    const { symbol, heading, lines } = noteContent(ctx, el);
    let host = box;
    while (host && !flowBoxes.has(host)) host = host.parent ? objects.get(host.parent) : null;
    const o = reg({ id: idOf(el), type: 'note', symbol, el, src: srcOf(el), parent: host?.id ?? null, heading: heading.filter((x) => x !== ''), lines });
    put(host, o);
    const abouts = el.owned.filter((c) => conf(ctx, c, 'Annotation'));
    const targets = abouts.length ? abouts.map((a) => ({ el: ctx.target(a, 'annotatedElement'), name: ctx.refText(ctx.ref(a, 'annotatedElement')) })) : (ns && ns !== ctx.tree ? [{ el: ns, name: ctx.nameOf(ns) }] : []);
    annotations.push({ note: o, targets });
  }

  // 図にしないメンバーを文字の区画に出す(本体の図(枠なしの箱)では、区画の代わりに左下に ... を出す。裁定 Q9 の 3)
  function toText(box, rel, el, ns) {
    if (!box) { diag('info', 'not-drawn', `${pathOf(ctx, el)}(${el.kind})は、アクションフロービューの記号を持たないので描かない`, el); return; }
    if (box.plain) { box.ellipsis = true; return; }
    const c = compartmentOf(ctx, rel, el, ns);
    if (c) addLine(box.compartments, c, el, joinTokens(ctx.declTokens(el)));
  }
  function fillText(box, ns, skip) {
    for (const { rel, el } of ctx.members(ns)) {
      if (rel.kind === 'Membership' || el.start === el.end || skip.has(el) || !ctx.user(el)) continue;
      if (!drawn(el)) { box.ellipsis = true; continue; }
      toText(box, rel, el, ns);
    }
  }

  // ns のメンバーを box の領域に置く(skip は引数にしたメンバー)
  function fillFlow(box, ns, skip = new Set()) { runNested(fillFlowGen(box, ns, skip)); }
  function* fillFlowGen(box, ns, skip) {
    for (const { rel, el } of ctx.members(ns)) {
      if (rel.kind === 'Membership') continue;
      if ((el.start === el.end && !conf(ctx, el, 'Succession')) || skip.has(el)) continue;
      if (conf(ctx, rel, 'ElementFilterMembership')) { if (box && !box.plain) addLine(box.compartments, compartmentOf(ctx, rel, el, ns), el, joinTokens(ctx.declTokens(rel)).replace(/^filter\s*/, '')); continue; }
      if (!drawn(el)) {
        if (box) box.ellipsis = true;
        if (env.viewMode && conf(ctx, el, 'Namespace')) yield fillFlowGen(box, el, new Set());
        continue;
      }
      yield placeFlowGen(box, rel, el, ns);
    }
    if (box && !box.plain && ctx.is(ns, 'ViewUsage')) for (const exp of ns.owned) if (conf(ctx, exp, 'Expose')) addLine(box.compartments, { symbol: 'exposes-compartment', title: 'exposes' }, exp, joinTokens(ctx.declTokens(exp)).replace(/^expose\s*/, ''));
  }

  // メンバーを、アクションフロービューの記号・線・文字の区画に振り分ける。box が null なら最上位(view で公開した要素)
  function placeFlow(box, rel, el, ns) { runNested(placeFlowGen(box, rel, el, ns)); }
  function* placeFlowGen(box, rel, el, ns) {
    if (!ctx.user(el)) return;
    if (ctx.is(el, 'TransitionUsage')) { pending.push({ el, box, kind: 'transition' }); return; }
    if (isDrawnSuccession(ctx, el) && !ctx.is(el, 'SuccessionFlowUsage')) { pending.push({ el, box, kind: 'succession' }); return; }
    if (ctx.is(el, 'FlowUsage')) {
      // 裁定 Q8: 継承フローとメッセージも、相互接続ビューと同じ記号で描く
      const kind = ctx.is(el, 'SuccessionFlowUsage') ? 'succession-flow' : isMessage(ctx, el) ? 'message' : 'flow';
      pending.push({ el, box, kind });
      return;
    }
    if (ctx.is(el, 'BindingConnectorAsUsage')) { pending.push({ el, box, kind: 'binding' }); return; }
    if (ctx.is(el, 'Dependency')) { pendingDeps.push({ el, box }); return; }
    if (ctx.is(el, 'Comment') || ctx.is(el, 'TextualRepresentation') || ctx.is(el, 'MetadataUsage')) {
      if (ctx.is(el, 'MetadataUsage') && ctx.text[el.start - 1] === '#') return;
      makeNote(el, box, ns);
      return;
    }
    if (isActionLike(ctx, el) && ctx.is(el, 'ActionUsage')) {
      const node = CONTROL_NODES.find(([m]) => ctx.is(el, m));
      if (node) { pnode(node[1], el, box); return; }
      yield actionBoxGen(el, box, false);
      return;
    }
    // 行動の定義は、最上位(view で公開したもの)では箱にする
    if (!box && ctx.is(el, 'ActionDefinition')) { yield actionBoxGen(el, null, true); return; }
    toText(box, rel, el, ns);
  }

  // ---- 線
  const objsInside = (o) => {
    const out = [];
    if (o.type === 'box') { for (const id of o.region) out.push(objects.get(id)); for (const id of o.ports) out.push(objects.get(id)); }
    if (o.type === 'port') for (const id of o.children) out.push(objects.get(id));
    return out;
  };
  const redefines = (a, b) => ctx.user(a) && a.owned.some((c) => conf(ctx, c, 'Redefinition') && ctx.target(c, 'redefinedFeature') === b);
  const childFor = (o, el) => {
    if (!el) return null;
    const kids = objsInside(o);
    return kids.find((k) => k.el === el) ?? kids.find((k) => redefines(k.el, el)) ?? null;
  };
  const ancestorsOf = (box) => { const out = []; for (let b = box; b; b = b.parent ? objects.get(b.parent) : null) out.push(b); return out; };
  // フロー・結合の端を図の要素に対応づける(src/view/diagram.js の resolveEnd と同じ。描いていない特徴は箱の辺の proxy)
  function resolveEnd(chain, box) {
    if (!chain.length) return { fail: '端がない' };
    const first = chain[0];
    let cur = null;
    if (first.el) {
      for (const b of ancestorsOf(box)) { cur = childFor(b, first.el) ?? (b.el === first.el ? b : null); if (cur) break; }
      if (!cur) cur = top.map((id) => objects.get(id)).find((o) => o.el === first.el || redefines(o.el, first.el)) ?? null;
    }
    if (!cur) return { fail: first.el ? `「${first.name}」は図に描いていない` : `「${first.name}」は${first.status === 'ambiguous' ? '曖昧' : '未検査'}` };
    let i = 1;
    for (; i < chain.length; i++) { const nx = childFor(cur, chain[i].el); if (!nx) break; cur = nx; }
    const rest = chain.slice(i).map((s) => s.name).join('.');
    if (!rest) return { obj: cur };
    if (cur.type === 'box') {
      const pid = `${cur.id}>${rest}`;
      let p = objects.get(pid);
      if (!p) { p = reg({ id: pid, type: 'proxy', symbol: 'proxy', el: null, src: null, owner: cur.id, label: '.' + rest }); cur.ports.push(p.id); }
      return { obj: p };
    }
    return { obj: cur, extra: rest };
  }
  const endChainOf = (f) => {
    const rs = f.owned.find((c) => conf(ctx, c, 'ReferenceSubsetting'));
    if (!rs) return f.name ? [{ el: null, name: f.name, status: null }] : [];
    const chain = ctx.chainOf(rs, 'referencedFeature');
    for (const { el: x } of ctx.members(f)) {
      if (!conf(ctx, x, 'ReferenceUsage')) continue;
      const rd = x.owned.find((c) => conf(ctx, c, 'Redefinition'));
      if (rd) { const r = ctx.ref(rd, 'redefinedFeature'); chain.push({ el: r?.status === 'resolved' ? r.target : null, name: r?.segments?.at(-1)?.name ?? r?.text ?? '', status: r?.status ?? null }); }
    }
    return chain;
  };
  const endFeatures = (el) => {
    const out = [];
    for (const c of el.owned) {
      if (conf(ctx, c, 'EndFeatureMembership') || (conf(ctx, c, 'ParameterMembership') && isMessage(ctx, el))) { const f = c.related[0]; if (f) out.push(f); }
    }
    return out;
  };
  const labelOf = (el) => {
    const nm = ctx.nameOf(el);
    const ty = ctx.typeText(el);
    let s = (nm ?? '') + (ty ? ` : ${ty}` : '');
    if (ctx.isAny(el, ['FlowUsage'])) {
      const pl = el.owned.flatMap((c) => c.related).find((x) => conf(ctx, x, 'PayloadFeature'));
      if (pl) s += `${s ? ' ' : ''}of ${joinTokens(ctx.declTokens(pl))}`;
    }
    return s.trim();
  };
  const notDrawn = (el, box, why) => { if (box) box.ellipsis = true; diag('info', 'edge-not-drawn', `${labelOf(el) || ctx.nameOf(el) || (ctx.is(el, 'TransitionUsage') ? '遷移' : ctx.is(el, 'Succession') ? '継承' : el.kind)}を描いていない: ${why}`, el); };
  // 継承・遷移の端。内蔵の start・done は、線を持つ箱の中に節点を 1 つずつ置く(設計書 7.4 節)
  const endObj = (el, box, role) => {
    if (!el) return null;
    if (isBuiltinAction(el)) {
      const which = /start$/.test(el.qname) ? 'start-node' : 'done-node';
      if ((which === 'start-node') !== (role === 'source')) return null;
      const id = `${box ? box.id : 'top'}.${which === 'start-node' ? 'start' : 'done'}`;
      return objects.get(id) ?? pnode(which, null, box, id);
    }
    return elObjs.get(el)?.[0] ?? null;
  };
  const textOf = (el) => joinTokens(ctx.elemTokens(el));

  function finish() {
    for (const { el, box, kind } of pending) {
      if (kind === 'transition' || kind === 'succession') {
        const r = kind === 'transition' ? transitionEnds(ctx, el) : successionEnds(ctx, el);
        if (!r.source) { notDrawn(el, box, r.implicit ? '始点が求まらない' : '始点が解決できない'); continue; }
        if (!r.target) { notDrawn(el, box, '終点が解決できない'); continue; }
        const a = endObj(r.source, box, 'source'), b = endObj(r.target, box, 'target');
        if (!a) { notDrawn(el, box, `始点「${ctx.nameOf(r.source) ?? r.source.kind}」は図に描いていない`); continue; }
        if (!b) { notDrawn(el, box, `終点「${ctx.nameOf(r.target) ?? r.target.kind}」は図に描いていない`); continue; }
        // 裁定 Q7: アクションフロービューの継承は aflow-succession(破線)。行動の中の遷移も同じで、ガードを [式] で書く。
        // 分岐から出る else は else-branch
        let symbol = 'aflow-succession', label = '', labelLines = null;
        if (kind === 'transition') {
          const part = (k) => el.owned.find((c) => conf(ctx, c, 'TransitionFeatureMembership') && c.attrs.kind === k)?.related[0] ?? null;
          const trig = part('trigger'), guard = part('guard'), eff = part('effect');
          const isElse = ctx.elemTokens(el)[0]?.text === 'else';
          if (isElse) { symbol = 'else-branch'; label = 'else'; }
          else {
            const head = [trig ? joinTokens(ctx.declTokens(trig)) : '', guard ? `[${textOf(guard)}]` : ''].filter(Boolean).join(' ');
            const tail = eff ? `/ ${joinTokens(ctx.declTokens(eff))}` : '';
            label = [head, tail].filter(Boolean).join(' ');
            labelLines = [...(head ? wrap(head, 40) : []), ...(tail ? wrap(tail, 40) : [])];
          }
        }
        edges.push({ id: idOf(el), symbol, el, src: srcOf(el), box: box?.id ?? null, from: a.id, to: b.id, label, ...(labelLines && labelLines.length > 1 ? { labelLines } : {}), ...(a === b ? { loop: true } : {}), markers: [] });
        continue;
      }
      // フロー・継承フロー・メッセージ・結合
      const ends = endFeatures(el).map((f) => ({ f, chain: endChainOf(f) }));
      const res = ends.map((e) => ({ ...e, r: resolveEnd(e.chain, box ?? null) }));
      const bad = res.find((x) => x.r.fail);
      if (bad) { notDrawn(el, box, bad.r.fail); continue; }
      if (res.length < 2) { notDrawn(el, box, '端が 2 つない'); continue; }
      const [a, b] = res;
      if (a.r.obj === b.r.obj) { notDrawn(el, box, '始点と終点が同じ'); continue; }
      const symbol = { flow: 'flow', 'succession-flow': 'succession-flow', message: 'message', binding: 'binding-connection' }[kind];
      edges.push({ id: idOf(el), symbol, el, src: srcOf(el), label: kind === 'binding' ? '=' : labelOf(el), markers: [], box: box?.id ?? null, from: a.r.obj.id, to: b.r.obj.id, fromRole: null, toRole: null, fromMult: null, toMult: null, fromExtra: a.r.extra ?? null, toExtra: b.r.extra ?? null });
    }
    // 依存と注釈の線(相互接続ビューと同じ)。文字の区画の行に書いた要素は、その行を端にする
    const boxOfLine = new Map();
    for (const o of objects.values()) if (o.type === 'box') for (const c of [...(o.preCompartments ?? []), ...o.compartments]) for (const l of c.lines) boxOfLine.set(l, o);
    const objOrLine = (el) => {
      const o = elObjs.get(el)?.[0];
      if (o) return o;
      const l = lineOf.get(el);
      const bx = l && boxOfLine.get(l.line);
      if (bx) {
        l.line.highlight = true;
        const id = `${bx.id}#${l.line.src[0]}`;
        return objects.get(id) ?? reg({ id, type: 'cline', symbol: 'element-inside-textual-compartment', el: null, src: l.line.src, parent: bx.id, line: l.line });
      }
      return null;
    };
    for (const p of pendingDeps) {
      const el = p.el;
      const pick = (prop) => ctx.refsOf(el, prop).map((r) => (r.status === 'resolved' ? objOrLine(r.target) : null));
      const cs = pick('client'), ss = pick('supplier');
      if ([...cs, ...ss].some((x) => !x)) { notDrawn(el, p.box, '依存の端を図に描いていない'); continue; }
      const label = ctx.nameOf(el) ?? '';
      if (cs.length === 1 && ss.length === 1) { edges.push({ id: idOf(el), symbol: 'binary-dependency', el, src: srcOf(el), from: cs[0].id, to: ss[0].id, label, markers: [] }); continue; }
      const dot = reg({ id: idOf(el) + '.dot', type: 'dot', symbol: 'n-ary-association-dot', el, src: srcOf(el), parent: p.box?.id ?? null, label, members: [...cs, ...ss].map((o) => o.id) });
      cs.forEach((o, i) => edges.push({ id: `${idOf(el)}.c${i}`, symbol: 'n-ary-dependency-client-link', el, src: srcOf(el), from: o.id, to: dot.id, label: '', markers: [] }));
      ss.forEach((o, i) => edges.push({ id: `${idOf(el)}.s${i}`, symbol: 'n-ary-dependency-supplier-link', el, src: srcOf(el), from: dot.id, to: o.id, label: '', markers: [] }));
    }
    for (const { note, targets } of annotations) {
      targets.forEach((t, i) => {
        const o = t.el ? objOrLine(t.el) : null;
        if (!o) { diag('info', 'edge-not-drawn', `注釈の線を描いていない: 「${t.name ?? ''}」は図に描いていない`, note.el); return; }
        edges.push({ id: `${note.id}.a${i}`, symbol: 'annotation-link', el: note.el, src: note.src, from: note.id, to: o.id, label: '', markers: [] });
      });
    }
    // 開始の節点を、領域(と最上位)の先頭に置く(設計書 7.5 節)。ほかは記述の順のまま。
    // アクションフローの図を持つ箱には flowLayout の印を付ける(流れの段の配置の対象。src/view/layout.js の flowPositions)
    const first = (id) => { const o = objects.get(id); return o.type === 'pnode' && o.symbol === 'start-node' ? 0 : 1; };
    for (const b of flowBoxes) { b.region.sort((a, b2) => first(a) - first(b2)); b.flowLayout = true; }
  }

  return { fillFlow, placeFlow, actionBox, bodyBox, nodeSections, addBodies, finish, flowBoxes, header, reg, put };
}

// メッセージ(Message の規則で作った FlowUsage: isAbstract で、端が ParameterMembership の EventOccurrenceUsage)
function isMessage(ctx, el) {
  if (!el.attrs.isAbstract) return false;
  return !el.owned.some((c) => conf(ctx, c, 'EndFeatureMembership'));
}

// perform される行動(perform A.X; の連鎖の先、perform action p references X; の参照先)
function performedAction(ctx, p) {
  const rs = p.owned.find((c) => conf(ctx, c, 'ReferenceSubsetting'));
  if (!rs) return null;
  const ch = ctx.chainOf(rs, 'referencedFeature');
  return ch.length ? ch[ch.length - 1].el : null;
}

// ---- 部品ごとの列(swimlane。GR7 P1 の裁定 Q1・Q2・Q3)
// 描く範囲の行動 A が直接持ち、図に描いた行動 X を、A の外の部品の使用 U が perform するとき、U の列を作り X を入れる。
// 列は U が所有する最初のその perform の記述の順に並べる。どの列にも入らない節点は、列の外の左に置く。
// 列を作るのは一番外の action-flow-view だけ
function makeLanes(ctx, kit, box, A, objects, elObjs, diagnostics) {
  const performer = new Map(); // X → { U, p }
  const performs = [];
  for (const e of ctx.order.keys()) if (ctx.user(e) && ctx.is(e, 'PerformActionUsage')) performs.push(e);
  for (const p of performs) {
    const U = ctx.ownerOf(p);
    if (!U || !ctx.is(U, 'PartUsage') || !isPartLike(ctx, U)) continue;
    const X = performedAction(ctx, p);
    if (!X || ctx.ownerOf(X) !== A) continue;
    const o = elObjs.get(X)?.find((x) => x.parent === box.id);
    if (!o) continue;
    if (performer.has(X)) {
      const prev = performer.get(X);
      if (prev.U !== U) diagnostics.push({ level: 'info', code: 'lane-multiple', message: `${pathOf(ctx, X)} は ${pathOf(ctx, prev.U)} と ${pathOf(ctx, U)} が perform している。列は記述の順で最初の ${pathOf(ctx, prev.U)} に入れた`, start: p.start, end: p.end });
      continue;
    }
    performer.set(X, { U, p, o });
  }
  if (!performer.size) return;
  const lanesOf = new Map(); // U → [図の要素の id]
  for (const { U, o } of performer.values()) { if (!lanesOf.has(U)) lanesOf.set(U, []); lanesOf.get(U).push(o.id); }
  const inLane = new Set([...performer.values()].map((x) => x.o.id));
  // 流れの段の配置で、列と列の外の要素をまとめて段を求めるため、列に分ける前の記述の順を残す
  box.flowOrder = [...box.region];
  const rest = box.region.filter((id) => !inLane.has(id));
  const group = kit.reg({ id: `${box.id}.lanes`, type: 'box', symbol: 'perform-actions-swimlanes', plain: true, laneGroup: true, passable: true, el: null, src: null, parent: box.id, region: [], ports: [], compartments: [], header: { keyword: '', name: '' }, ellipsis: false, omittedGeneralView: false });
  let i = 0;
  for (const [U, ids] of lanesOf) {
    const lane = kit.reg({ id: `${box.id}.lane${i++}`, type: 'box', symbol: 'swimlane', nameSym: 'usage-name-compartment', passable: true, el: U, src: [U.start, U.end], parent: group.id,
      region: ids.sort((a, b) => box.region.indexOf(a) - box.region.indexOf(b)), ports: [], compartments: [],
      preCompartments: [{ symbol: 'perform-actions-compartment', title: 'perform actions', lines: [], dashed: true }],
      header: { keyword: '«performer»', name: pathOf(ctx, U) }, ellipsis: false, omittedGeneralView: false, minGap: box.minGap });
    for (const id of ids) objects.get(id).parent = lane.id;
    group.region.push(lane.id);
  }
  if (rest.length) {
    const out = kit.reg({ id: `${box.id}.outside`, type: 'box', symbol: 'outside-lanes', plain: true, helper: true, passable: true, el: null, src: null, parent: box.id, region: rest, ports: [], compartments: [], header: { keyword: '', name: '' }, ellipsis: false, omittedGeneralView: false, minGap: box.minGap });
    for (const id of rest) objects.get(id).parent = out.id;
    box.region = [out.id, group.id];
  } else box.region = [group.id];
  box.rowLayout = true;
}

// ---- 図の組み立て
export function buildActionDiagram(ctx, candidate, scope, fx = {}) {
  const objects = new Map();
  const top = [];
  const edges = [];
  const diagnostics = [];
  const elObjs = new Map();
  const lineOf = new Map();
  const viewMode = candidate.kind === 'view';
  const srcOf = (el) => [el.start, el.end];
  const diag = (level, code, message, el) => diagnostics.push({ level, code, message, start: el?.start ?? null, end: el?.end ?? null });
  const aliases = new Map();
  for (const n of ctx.order.keys()) {
    if (n.kind !== 'Membership' || n.attrs.memberName == null) continue;
    const t = ctx.target(n, 'memberElement');
    if (t) { if (!aliases.has(t)) aliases.set(t, []); aliases.get(t).push(n.attrs.memberName); }
  }
  const kit = flowKit(ctx, { objects, top, edges, diagnostics, elObjs, lineOf, aliases, viewMode, scope, fx });

  let frame = null;
  const outerBoxes = [];
  if (candidate.kind === 'action') outerBoxes.push(kit.actionBox(candidate.el, null, true));
  else {
    const v = candidate.el;
    const vt = ctx.typeText(v);
    frame = { el: v, src: srcOf(v), title: `«view» ${pathOf(ctx, v).replace(/^.*::/, '')}${vt ? ` : ${vt}` : ''}`, exposes: [], filters: [], notes: [] };
    for (const c of v.owned) {
      if (conf(ctx, c, 'Expose')) frame.exposes.push(joinTokens(ctx.declTokens(c)));
      else if (conf(ctx, c, 'ElementFilterMembership')) frame.filters.push(joinTokens(ctx.declTokens(c)));
    }
    for (const { el: c } of ctx.members(v)) if (ctx.is(c, 'Comment')) frame.notes.push(...noteContent(ctx, c).lines);
    const hasDrawnAncestor = (el) => { for (let x = ctx.ownerOf(el); x; x = ctx.ownerOf(x)) if (scope.drawn.has(x)) return true; return false; };
    const placedInherited = (el) => [...(scope.exposedVia.get(el) ?? [])].some((via) => via && scope.drawn.has(via) && ctx.ownerOf(el) !== via);
    const tops = [...scope.drawn].filter((el) => !hasDrawnAncestor(el) && !placedInherited(el)).sort((a, b) => ctx.order.get(a) - ctx.order.get(b));
    for (const el of tops) {
      if (isActionLike(ctx, el)) { outerBoxes.push(kit.actionBox(el, null, true)); continue; }
      kit.placeFlow(null, ctx.owningRel(el), el, ctx.ownerOf(el));
    }
    for (const el of scope.memberOnly) {
      if (!scope.drawn.has(el) || !conf(ctx, el, 'Namespace')) continue;
      if (ctx.members(el).length && !ctx.members(el).some((m) => scope.drawn.has(m.el))) diag('info', 'expose-member-only', `${pathOf(ctx, el)} は expose で要素 1 つだけを公開しているので、中を描いていない。中を描くには expose ${pathOf(ctx, el)}::**; と書く`, el);
    }
    for (const nr of scope.notReflected) {
      if (nr.kind === 'expose-unresolved') { diag('warn', 'expose-unresolved', `「${joinTokens(ctx.declTokens(nr.el))}」の対象は、このテキストの要素に解決できない(未検査・曖昧・ライブラリの要素)ので、何も公開しない`, nr.el); continue; }
      const what = nr.kind === 'render' ? 'render' : nr.kind === 'filter' ? 'filter の条件' : 'expose の [ ] の条件';
      diag('warn', 'not-reflected', `${what}「${joinTokens(ctx.declTokens(nr.el))}」は反映していない(反映するのは @種類名 と @利用者の注釈 の形だけ。render は反映しない)`, nr.el);
    }
  }
  kit.finish();
  const minGap = labelGaps(objects, edges);
  for (const b of outerBoxes) if (b.symbol !== 'perform-action-usage' && kit.flowBoxes.has(b)) makeLanes(ctx, kit, b, b.el, objects, elObjs, diagnostics);
  for (const o of objects.values()) if (o.type === 'pnode' && (o.symbol === 'fork-node' || o.symbol === 'join-node')) o.degree = edges.filter((e) => e.from === o.id || e.to === o.id).length;

  edges.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const x of [...objects.values(), ...edges]) {
    if (!x.el || x.info) continue;
    x.info = { kind: x.el.kind, name: ctx.nameOf(x.el) ?? null, qname: pathOf(ctx, x.el) };
  }
  if (frame) frame.info = { kind: frame.el.kind, name: ctx.nameOf(frame.el) ?? null, qname: pathOf(ctx, frame.el) };
  return { objects, top, edges, diagnostics, frame, viewMode, minGap: minGap.top, labelPad: minGap.pad, actionView: true, topFlow: true, loopGap: minGap.loop };
}

// 継承のラベル(ガード)を線の近くに置けるよう、線を持つ箱(なければ図全体)の格子の間隔を、ラベルの幅に合わせて広げる
// (src/view/state.js と同じ。幅 + 30、上限 360)。自分自身に戻る線の分も広げる
export function labelGaps(objects, edges) {
  let top = 0, loopPad = 0;
  for (const e of edges) {
    const lines = e.labelLines ?? (e.label && e.symbol !== 'binding-connection' ? [e.label] : []);
    if (!lines.length) continue;
    const w = Math.min(360, Math.ceil(Math.max(...lines.map((t) => textWidth(t, FSS)))) + 30);
    const host = e.box ? objects.get(e.box) : null;
    if (host) host.minGap = Math.max(host.minGap ?? 0, w); else top = Math.max(top, w);
  }
  for (const o of objects.values()) if (o.minGap) o.labelPad = Math.round(o.minGap * 0.6);
  for (const e of edges) {
    if (!e.loop) continue;
    const lines = e.labelLines ?? (e.label ? [e.label] : []);
    const w = 90 + (lines.length ? Math.ceil(Math.max(...lines.map((t) => textWidth(t, FSS)))) : 0);
    const host = e.box ? objects.get(e.box) : null;
    if (host) { host.minGap = Math.max(host.minGap ?? 0, w); host.labelPad = Math.max(host.labelPad ?? 0, w); host.loopGap = Math.max(host.loopGap ?? 0, w); }
    else { top = Math.max(top, w); loopPad = Math.max(loopPad, w); }
  }
  return { top, pad: Math.max(Math.round(top * 0.6), loopPad), loop: loopPad };
}
