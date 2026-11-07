// 状態遷移ビューの描く範囲と図の要素の組み立て(GR6 指示書 5 章、設計書 7.4 節)。
// 外部パッケージ・Node.js 固有の機能・DOM を使わない。
//
// listStateCandidates(ctx) → [{ id, kind: 'view' | 'state', label, el }]
//   テキストに view(ViewUsage)があれば、view を記述の順に並べる。なければ、状態・遷移を所有する StateDefinition・
//   StateUsage(ExhibitStateUsage を含む)を、入れ子のものも含めて記述の順に並べる(設計書 5 章)。
// buildStateDiagram(ctx, candidate, scope) → diagram(src/view/diagram.js の buildDiagram と同じ形。配置・SVG・図の質の
//   検査は相互接続ビューと同じ部品を使う)
//
// 図の要素の種類(type)と記号(tools/view/symbols.json の stateTransition の生成規則の名前):
//   box    state-def・state・state-ref(中に state-transition-view を持つ)、action・action-ref・perform-action-usage・
//          entry-action・do-action・exit-action(四辺に param-*)
//   pnode  start-node・done-node・terminate-node・fork-node・join-node・decision-node・merge-node、
//          entry-action(空の entry の黒い角の丸い四角。GR6 P1 の裁定 Q5・Q6)
//   note   注釈(相互接続ビューと同じ)
// 線: transition・st-succession・else-branch(GR6 P2 の裁定 Q19)と、依存・注釈の線
//
// 読み方は GR6 P1 の裁定 Q1〜Q17 と、P2 の裁定 Q18・Q19 による(reports/GR6/)。
// GR7: entry・do・exit の本体と、行動の then・else・ループの本体が、行動・継承・フロー・結合を直接持つときは、
// 本体を区画の中にアクションフローの図(action-flow-view の枠なしの箱)として描く(設計書 7.4 節、GR7 P1 の裁定 Q9)。
// 組み立ては src/view/action.js の flowKit を使う

import { joinTokens } from './common.js';
import { pathOf } from './scope.js';
import { compartmentOf, noteContent } from './diagram.js';
import { textWidth } from './textwidth.js';
import { FSS } from './layout.js';
import { flowKit, hasFlowMembers } from './action.js';
import { transitionEnds, successionEnds, isDrawnSuccession, isBuiltinAction } from './ends.js';
import { walkTree } from '../parser/tree.js';
// 遷移・継承の始点と終点を求める関数は src/view/ends.js に移した(GR7)。これまでどおり state.js からも読み出せるようにする
export { implicitTransitionSource, implicitSuccessionSource, pilotPreviousFeature, implicitTransitionForm, nextFeature, transitionEnds, successionEnds, isDrawnSuccession } from './ends.js';

const conf = (ctx, e, k) => !!e && ctx.model.conforms(e.kind, k);

// ---- 描く範囲の候補
export function listStateCandidates(ctx) {
  const views = [];
  const states = [];
  walkTree(ctx.tree, (e) => {
    if (ctx.is(e, 'ViewUsage')) views.push(e);
    else if (ctx.isAny(e, ['StateDefinition', 'StateUsage'])) {
      if (ctx.members(e).some(({ el }) => ctx.isAny(el, ['StateUsage', 'TransitionUsage']))) states.push(e);
    }
  }); // 明示のスタックでたどる(GR18 の B1)
  const list = views.length ? views.map((el) => ({ kind: 'view', el })) : states.map((el) => ({ kind: 'state', el }));
  const seen = new Map();
  return list.map((c) => {
    const p = pathOf(ctx, c.el);
    const base = `${c.kind}:${p}`;
    const k = (seen.get(base) ?? 0) + 1;
    seen.set(base, k);
    const word = c.kind === 'view' ? 'view' : ctx.is(c.el, 'StateDefinition') ? 'state def' : ctx.is(c.el, 'ExhibitStateUsage') ? 'exhibit state' : 'state';
    return { id: k === 1 ? base : `${base}#${k}`, kind: c.kind, label: `${word} ${p}`, el: c.el };
  });
}

// ---- 文字
const KIND_KW = ['state', 'action', 'accept', 'send', 'assign', 'if', 'while', 'for', 'loop', 'perform', 'exhibit', 'entry', 'do', 'exit', 'fork', 'join', 'decide', 'merge', 'terminate'];
// 長い文字を、字句の境目で max 字ほどの行に分ける
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

// ---- 図の組み立て
export function buildStateDiagram(ctx, candidate, scope) {
  const objects = new Map();
  const top = [];
  const edges = [];
  const diagnostics = [];
  const elObjs = new Map();
  const lineOf = new Map();
  const annotations = [];
  const pendingDeps = [];
  const pendingEdges = []; // { el, box, kind: 'transition' | 'succession' }
  let minGap = 0, loopPad = 0;
  const viewMode = candidate.kind === 'view';
  const drawn = (el) => !viewMode || scope.drawn.has(el);
  const idOf = (el) => 'e' + ctx.order.get(el);
  const srcOf = (el) => [el.start, el.end];
  const diag = (level, code, message, el) => diagnostics.push({ level, code, message, start: el?.start ?? null, end: el?.end ?? null });

  const aliases = new Map();
  for (const n of ctx.order.keys()) {
    if (n.kind !== 'Membership' || n.attrs.memberName == null) continue;
    const t = ctx.target(n, 'memberElement');
    if (t) { if (!aliases.has(t)) aliases.set(t, []); aliases.get(t).push(n.attrs.memberName); }
  }
  const reg = (o) => {
    objects.set(o.id, o);
    if (o.el) { if (!elObjs.has(o.el)) elObjs.set(o.el, []); elObjs.get(o.el).push(o); }
    return o;
  };
  // 本体を図にする部品(GR7)
  const kit = flowKit(ctx, { objects, top, edges, diagnostics, elObjs, lineOf, aliases, viewMode, scope });

  // 遷移・継承の端になる entry・do・exit の行動(裁定 Q4: 節点で描く)
  const endpoints = new Set();
  for (const e of ctx.order.keys()) {
    if (!ctx.user(e)) continue;
    let r = null;
    if (ctx.is(e, 'TransitionUsage')) r = transitionEnds(ctx, e);
    else if (isDrawnSuccession(ctx, e)) r = successionEnds(ctx, e);
    if (r) { if (r.source) endpoints.add(r.source); if (r.target) endpoints.add(r.target); }
  }

  // 名前の区画: キーワードの行と名前の行(本体の前の宣言から)。before・after は前後の行
  function header(el, kindWord) {
    const toks = ctx.declTokens(el);
    let k = toks.findIndex((t) => t.kind === 'KEYWORD' && KIND_KW.includes(t.text));
    const prefix = k >= 0 ? toks.slice(0, k) : [];
    let rest = k >= 0 ? toks.slice(k + 1) : toks;
    if (rest[0]?.text === 'def') rest = rest.slice(1);
    // 宣言の後ろの 'parallel' は «parallel» の行に書く
    rest = rest.filter((t) => !(t.kind === 'KEYWORD' && t.text === 'parallel'));
    // 行動の名前の区画は、宣言(名前と型)だけを書く(accept などの中身は書かない。裁定 Q13)
    let name = ctx.user(el) && conf(ctx, el, 'ActionUsage') && !conf(ctx, el, 'StateUsage')
      ? [ctx.nameOf(el), ctx.typeText(el)].filter((x) => x != null).join(' : ')
      : joinTokens(rest.filter((t) => !(t.kind === 'KEYWORD' && KIND_KW.includes(t.text))));
    const al = aliases.get(el);
    if (al?.length) name += ` «alias» ${al.join(', ')}`;
    const pre = joinTokens(prefix.filter((t) => !(t.kind === 'KEYWORD' && t.text === 'exhibit')));
    return { keyword: `«${pre ? pre + ' ' : ''}${kindWord}»`, name };
  }

  function stateBox(el, symbol, parent, exhibitOuter = false) {
    const h = header(el, symbol === 'state-def' ? 'state def' : 'state');
    if (exhibitOuter) h.before = ['«exhibit-state»'];
    if (el.attrs.isParallel) h.after = ['«parallel»'];
    const nameSym = exhibitOuter ? 'exhibit-state-name-compartment' : symbol === 'state-def' ? 'state-def-name-compartment' : 'state-name-compartment';
    const box = reg({ id: idOf(el), type: 'box', symbol, nameSym, el, src: srcOf(el), parent: parent?.id ?? null, region: [], ports: [], compartments: [], preCompartments: [], header: h, ellipsis: false, omittedGeneralView: false });
    if (parent) parent.region.push(box.id); else top.push(box.id);
    fill(box, el);
    return box;
  }

  const ACTION_KINDS = [['AcceptActionUsage', 'accept action', 'accept-action-name-compartment'], ['SendActionUsage', 'send action', 'send-action-name-compartment'],
    ['AssignmentActionUsage', 'assign', 'assign-action-name-compartment'], ['IfActionUsage', 'if', 'ifelse-action-name-compartment'],
    ['WhileLoopActionUsage', 'loop', 'while-loop-action-name-compartment'], ['ForLoopActionUsage', 'loop', 'for-loop-action-name-compartment']];
  function actionBox(el, parent, subKind = null) {
    let symbol, kw, nameSym;
    if (subKind) { symbol = `${subKind}-action`; kw = `${subKind} action`; nameSym = `${subKind}-action-name-comp`; }
    else if (ctx.is(el, 'PerformActionUsage')) { symbol = 'perform-action-usage'; kw = 'perform action'; nameSym = 'perform-action-name-compartment'; }
    else {
      symbol = el.attrs.isReference ? 'action-ref' : 'action';
      const k = ACTION_KINDS.find(([m]) => ctx.is(el, m));
      kw = k ? k[1] : 'action'; nameSym = k ? k[2] : 'action-name-compartment';
    }
    const h = header(el, kw);
    const pre = [];
    // GR7 P1 の裁定 Q9: 本体が行動・継承・フロー・結合を持つ entry・do・exit の箱は、本体をアクションフローの図にする
    const subFlow = !!subKind && hasFlowMembers(ctx, el);
    if (subKind && !subFlow) {
      // 裁定 Q4: 本体のある entry・do・exit の箱。state-subaction-body の文字を名前の下に書く
      const full = joinTokens(ctx.elemTokens(el)), decl = joinTokens(ctx.declTokens(el));
      const body = full.length > decl.length ? full.slice(decl.length).trim() : (ctx.is(el, 'PerformActionUsage') ? '' : decl);
      if (body) h.after = wrap(body);
    }
    // 行動の種類ごとの式(P2 の確認の後の裁定 1。8.2.3.17 節): accept・send・assign は名前の区画の下の文字、
    // if・while・for は見出しのある区画。then・else・loop の本体は、GR7 で区画にした(src/view/action.js の nodeSections)
    if (!subKind && symbol !== 'perform-action-usage') {
      const sec = kit.nodeSections(el);
      if (sec.after.length) h.after = sec.after;
      pre.push(...sec.pre);
    }
    const box = reg({ id: idOf(el), type: 'box', symbol, nameSym, el, src: srcOf(el), parent: parent?.id ?? null, region: [], ports: [], compartments: [], ...(pre.length || subFlow ? { preCompartments: pre } : {}), header: h, ellipsis: false, omittedGeneralView: false });
    if (parent) parent.region.push(box.id); else top.push(box.id);
    kit.addBodies(box, pre);
    if (subFlow) pre.push({ symbol: 'state-subaction-body', title: '', upright: true, lines: [], body: kit.bodyBox(box, el, 'state-subaction-body').id });
    // 引数(向きのある特徴)を四辺に描き、ほかのメンバーは描かない(中の action-flow-view はアクションフロービュー)
    let flow = false;
    for (const { rel, el: m } of ctx.members(el)) {
      if (m.start === m.end || !ctx.user(m)) continue;
      if (m.attrs.direction !== undefined && conf(ctx, rel, 'FeatureMembership') && !conf(ctx, rel, 'ReturnParameterMembership') && drawn(m)) {
        const type = ctx.typeText(m);
        const p = reg({ id: idOf(m), type: 'port', symbol: 'param', el: m, src: srcOf(m), owner: box.id, inherited: false, dir: m.attrs.direction ?? null, dashed: !!m.attrs.isReference, label: (ctx.nameOf(m) ?? '') + (type ? ` : ${type}` : ''), children: [] });
        box.ports.push(p.id);
        continue;
      }
      // if・ループの本体(ParameterMembership の行動)は区画に描く(GR7)。entry・do・exit の本体も図にしたものは数えない
      if (conf(ctx, rel, 'ParameterMembership') || subFlow) continue;
      if (ctx.isAny(m, ['ActionUsage', 'Succession']) || conf(ctx, m, 'Succession')) flow = true;
    }
    // GR7 P1 の裁定 Q10: 状態遷移ビューの action の箱の中のアクションフローは描かない(アクションフロービューで見る)
    if (flow) diag('info', 'not-drawn-view', `${h.keyword} ${h.name} の箱の中のアクションフロー(action-flow-view)は、状態遷移ビューでは描かない(アクションフロービューに切り替えて見る)`, el);
    return box;
  }

  function pnode(symbol, el, parent, id = null) {
    const o = reg({ id: id ?? idOf(el), type: 'pnode', symbol, el, src: el ? srcOf(el) : null, parent: parent?.id ?? null, label: '' });
    if (parent) parent.region.push(o.id); else top.push(o.id);
    return o;
  }

  function addLine(list, c, el, text) {
    let comp = list.find((x) => x.symbol === c.symbol);
    if (!comp) { comp = { symbol: c.symbol, title: c.title, lines: [], ...(c.upright ? { upright: true } : {}) }; list.push(comp); }
    for (const t of wrap(text)) comp.lines.push({ text: t, src: srcOf(el) });
    if (!lineOf.has(el)) lineOf.set(el, { box: null, line: comp.lines[comp.lines.length - 1] });
  }

  function fill(box, ns) {
    for (const { rel, el } of ctx.members(ns)) {
      if (rel.kind === 'Membership') continue;
      if (el.start === el.end) continue;
      if (conf(ctx, rel, 'ElementFilterMembership')) { addLine(box.compartments, compartmentOf(ctx, rel, el, ns), el, joinTokens(ctx.declTokens(rel)).replace(/^filter\s*/, '')); continue; }
      if (!drawn(el)) {
        box.ellipsis = true;
        if (viewMode && conf(ctx, el, 'Namespace')) fill(box, el);
        continue;
      }
      place(box, rel, el, ns);
    }
    if (ctx.is(ns, 'ViewUsage')) for (const exp of ns.owned) if (conf(ctx, exp, 'Expose')) addLine(box.compartments, { symbol: 'exposes-compartment', title: 'exposes' }, exp, joinTokens(ctx.declTokens(exp)).replace(/^expose\s*/, ''));
  }

  // メンバーを、状態遷移ビューの記号・線・文字の区画に振り分ける。box が null なら最上位(view で公開した要素)
  function place(box, rel, el, ns) {
    const sym = box?.symbol ?? null;
    const holder = !box || sym === 'state' || sym === 'state-ref' || sym === 'state-def';
    if (!ctx.user(el)) return;
    // entry・do・exit(裁定 Q4・Q5・Q6)
    if (conf(ctx, rel, 'StateSubactionMembership')) {
      const kind = rel.attrs.kind;
      const empty = el.end - el.start <= 1 && !ctx.elemTokens(el).length;
      const asNode = endpoints.has(el) || !box;
      if (asNode) {
        if (empty && kind === 'entry') pnode('entry-action', el, box);
        else actionBox(el, box, kind);
        return;
      }
      if (empty) return;
      if (sym === 'state-ref') return; // state-ref の箱には entry・do・exit の区画がない(本文の図)
      const c = { symbol: `state-${kind}-action`, title: kind, upright: true };
      // GR7 P1 の裁定 Q9: 本体が行動・継承・フロー・結合を持つなら、区画に宣言の行を書き、その下に本体の図を描く
      if (hasFlowMembers(ctx, el)) {
        const decl = joinTokens(ctx.declTokens(el));
        const comp = { ...c, lines: decl ? wrap(decl).map((t) => ({ text: t, src: srcOf(el) })) : [] };
        (kind === 'exit' ? box.compartments : box.preCompartments).push(comp);
        if (comp.lines.length && !lineOf.has(el)) lineOf.set(el, { box: null, line: comp.lines[comp.lines.length - 1] });
        comp.body = kit.bodyBox(box, el, `state-${kind}-action`).id;
        return;
      }
      addLine(kind === 'exit' ? box.compartments : box.preCompartments, c, el, joinTokens(ctx.elemTokens(el)));
      return;
    }
    if (ctx.is(el, 'TransitionUsage')) { pendingEdges.push({ el, box, kind: 'transition' }); return; }
    if (isDrawnSuccession(ctx, el)) { pendingEdges.push({ el, box, kind: 'succession' }); return; }
    if (ctx.is(el, 'ExhibitStateUsage')) { if (box) addLine(box.compartments, compartmentOf(ctx, rel, el, ns), el, joinTokens(ctx.declTokens(el))); else diag('info', 'not-drawn', `${pathOf(ctx, el)}(${el.kind})は、状態遷移ビューの節点にしない`, el); return; }
    if (ctx.is(el, 'StateUsage')) {
      if (box && !holder) { addLine(box.compartments, compartmentOf(ctx, rel, el, ns), el, joinTokens(ctx.declTokens(el))); return; }
      stateBox(el, el.attrs.isReference ? 'state-ref' : 'state', box);
      return;
    }
    if (ctx.is(el, 'Dependency')) { pendingDeps.push({ el, box }); return; }
    if (ctx.is(el, 'Comment') || ctx.is(el, 'TextualRepresentation') || ctx.is(el, 'MetadataUsage')) {
      if (ctx.is(el, 'MetadataUsage') && ctx.text[el.start - 1] === '#') return;
      makeNote(el, box, ns);
      return;
    }
    if (holder && ctx.isAny(el, ['ActionUsage']) && !ctx.isAny(el, ['CalculationUsage', 'CaseUsage'])) {
      const node = [['ForkNode', 'fork-node'], ['JoinNode', 'join-node'], ['DecisionNode', 'decision-node'], ['MergeNode', 'merge-node'], ['TerminateActionUsage', 'terminate-node']].find(([m]) => ctx.is(el, m));
      if (node) { pnode(node[1], el, box); return; }
      actionBox(el, box);
      return;
    }
    if (!box) { diag('info', 'not-drawn', `${pathOf(ctx, el)}(${el.kind})は、状態遷移ビューの記号を持たないので描かない`, el); return; }
    const c = compartmentOf(ctx, rel, el, ns);
    if (c) addLine(box.compartments, c, el, joinTokens(ctx.declTokens(el)));
  }

  function makeNote(el, box, ns) {
    const { symbol, heading, lines } = noteContent(ctx, el);
    let host = box;
    while (host && !(host.symbol === 'state' || host.symbol === 'state-ref' || host.symbol === 'state-def')) host = host.parent ? objects.get(host.parent) : null;
    const o = reg({ id: idOf(el), type: 'note', symbol, el, src: srcOf(el), parent: host?.id ?? null, heading: heading.filter((x) => x !== ''), lines });
    if (host) host.region.push(o.id); else top.push(o.id);
    const abouts = el.owned.filter((c) => conf(ctx, c, 'Annotation'));
    const targets = abouts.length ? abouts.map((a) => ({ el: ctx.target(a, 'annotatedElement'), name: ctx.refText(ctx.ref(a, 'annotatedElement')) })) : (ns && ns !== ctx.tree ? [{ el: ns, name: ctx.nameOf(ns) }] : []);
    annotations.push({ note: o, targets });
  }

  // ---- 範囲の外側
  let frame = null;
  if (candidate.kind === 'state') {
    const el = candidate.el;
    if (ctx.is(el, 'StateDefinition')) stateBox(el, 'state-def', null);
    else if (ctx.is(el, 'ExhibitStateUsage')) stateBox(el, 'state', null, true); // 裁定 Q2・Q3
    else stateBox(el, el.attrs.isReference ? 'state-ref' : 'state', null);
  } else {
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
      // 状態の定義は、最上位では描く範囲の外側の箱と同じ形にする
      if (ctx.is(el, 'StateDefinition')) { stateBox(el, 'state-def', null); continue; }
      place(null, ctx.owningRel(el), el, ctx.ownerOf(el));
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

  // ---- 線
  // 端の要素 → 図の要素。内蔵の start・done は、線を持つ箱の中に節点を 1 つずつ置く(裁定 Q6)
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
  const isDecision = (o) => o?.type === 'pnode' && o.symbol === 'decision-node';
  const notDrawn = (el, box, why) => { if (box) box.ellipsis = true; diag('info', 'edge-not-drawn', `${ctx.nameOf(el) ?? (ctx.is(el, 'TransitionUsage') ? '遷移' : '継承')}を描いていない: ${why}`, el); };
  const textOf = (el) => joinTokens(ctx.elemTokens(el));
  for (const { el, box, kind } of pendingEdges) {
    const r = kind === 'transition' ? transitionEnds(ctx, el) : successionEnds(ctx, el);
    if (!r.source) { notDrawn(el, box, r.implicit ? '始点が求まらない' : '始点が解決できない'); continue; }
    if (!r.target) { notDrawn(el, box, '終点が解決できない'); continue; }
    const a = endObj(r.source, box, 'source'), b = endObj(r.target, box, 'target');
    if (!a) { notDrawn(el, box, `始点「${ctx.nameOf(r.source) ?? r.source.kind}」は図に描いていない`); continue; }
    if (!b) { notDrawn(el, box, `終点「${ctx.nameOf(r.target) ?? r.target.kind}」は図に描いていない`); continue; }
    let symbol = kind === 'transition' ? 'transition' : 'st-succession', label = '', labelLines = null;
    if (kind === 'transition') {
      const part = (k) => el.owned.find((c) => conf(ctx, c, 'TransitionFeatureMembership') && c.attrs.kind === k)?.related[0] ?? null;
      const trig = part('trigger'), guard = part('guard'), eff = part('effect');
      const g = guard ? `[${textOf(guard)}]` : '';
      if (isDecision(a)) {
        // decision-node からの遷移(transition の 2 つ目の形)。else は else-branch(裁定 Q19)
        const isElse = ctx.elemTokens(el)[0]?.text === 'else';
        if (isElse) { symbol = 'else-branch'; label = 'else'; } else label = g;
      } else {
        // transition-label(裁定 Q8): 引き金・ガード・効果のあるものだけ。/ は効果があるときだけ。効果は宣言だけ(本体 { … } を除く)。
        // 図では、引き金とガードの行と、/ 効果の行に分け、長い行は字句の境目で折り返す
        const head = [trig ? joinTokens(ctx.declTokens(trig)) : '', g].filter(Boolean).join(' ');
        const tail = eff ? `/ ${joinTokens(ctx.declTokens(eff))}` : '';
        label = [head, tail].filter(Boolean).join(' ');
        labelLines = [...(head ? wrap(head, 40) : []), ...(tail ? wrap(tail, 40) : [])];
      }
    }
    edges.push({ id: idOf(el), symbol, el, src: srcOf(el), box: box?.id ?? null, from: a.id, to: b.id, label, ...(labelLines && labelLines.length > 1 ? { labelLines } : {}), ...(a === b ? { loop: true } : {}), markers: [] });
  }
  // 本体の図の中の線(GR7)
  kit.finish();
  // 開始の節点(start-node と空の entry)を、領域(と最上位)の先頭に置く(設計書 7.4 節)。ほかは記述の順のまま
  const first = (id) => { const o = objects.get(id); return o.type === 'pnode' && (o.symbol === 'start-node' || o.symbol === 'entry-action') ? 0 : 1; };
  for (const o of objects.values()) if (o.type === 'box') o.region.sort((a, b) => first(a) - first(b));
  top.sort((a, b) => first(a) - first(b));
  // 遷移のラベルを線の近くに置けるよう、線を持つ箱(なければ図全体)の格子の間隔を、ラベルの幅に合わせて広げる
  // (幅 + 30。上限 360)
  for (const e of edges) {
    const lines = e.labelLines ?? (e.label ? [e.label] : []);
    if (!lines.length) continue;
    const w = Math.min(360, Math.ceil(Math.max(...lines.map((t) => textWidth(t, FSS)))) + 30);
    const host = e.box ? objects.get(e.box) : null;
    if (host) host.minGap = Math.max(host.minGap ?? 0, w); else minGap = Math.max(minGap, w);
  }
  for (const o of objects.values()) if (o.minGap) o.labelPad = Math.round(o.minGap * 0.6);
  // 自分自身に戻る線(src/view/layout.js の e.loop)は、ループ(最大 68 px)の外にラベルを置くので、その分も広げる
  for (const e of edges) {
    if (!e.loop) continue;
    const lines = e.labelLines ?? (e.label ? [e.label] : []);
    const w = 90 + (lines.length ? Math.ceil(Math.max(...lines.map((t) => textWidth(t, FSS)))) : 0);
    const host = e.box ? objects.get(e.box) : null;
    if (host) { host.minGap = Math.max(host.minGap ?? 0, w); host.labelPad = Math.max(host.labelPad ?? 0, w); }
    else { minGap = Math.max(minGap, w); loopPad = Math.max(loopPad, w); }
  }
  // fork・join の棒の長さ(つながる線の数)
  for (const o of objects.values()) if (o.type === 'pnode' && (o.symbol === 'fork-node' || o.symbol === 'join-node')) o.degree = edges.filter((e) => e.from === o.id || e.to === o.id).length;

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

  edges.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const x of [...objects.values(), ...edges]) {
    if (!x.el || x.info) continue;
    x.info = { kind: x.el.kind, name: ctx.nameOf(x.el) ?? null, qname: pathOf(ctx, x.el) };
  }
  if (frame) frame.info = { kind: frame.el.kind, name: ctx.nameOf(frame.el) ?? null, qname: pathOf(ctx, frame.el) };
  return { objects, top, edges, diagnostics, frame, viewMode, minGap, labelPad: Math.max(Math.round(minGap * 0.6), loopPad), stateView: true };
}

