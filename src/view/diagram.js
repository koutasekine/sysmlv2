// 相互接続ビューの図の要素の組み立て(GR4 指示書 5 章)。外部パッケージ・Node.js 固有の機能・DOM を使わない。
//
// buildDiagram(ctx, candidate, scope) → diagram
//   candidate  listCandidates の項目({ kind: 'part' | 'view', el })
//   scope      view のときは exposeScope の結果、part のときは null
// diagram = { objects: Map(id → 図の要素), top: [id], edges: [線], diagnostics: [], frame }
//
// 図の要素の種類(type)と、記号(symbol。tools/view/symbols.json の生成規則の名前):
//   box    箱: part・part-ref・part-def・item・item-ref・port-def・port-usage・attribute・connection-def・flow-def・
//          constraint・constraint-ref・requirement・requirement-ref・concern・view・viewpoint・view-def・viewpoint-def
//   port   辺の記号: port(port-l・port-r・port-t・port-b は配置で決める)・param(param-*)
//   proxy  辺の上の黒丸(proxy-v・proxy-h)
//   note   注釈: comment-without-keyword・comment-with-keyword・documentation-node・textual-representation-node・
//          metadata-feature-annotation-node
//   dparam subject・actor・stakeholder
//   dot    n-ary-connection-dot・n-ary-association-dot
// 線(edges)の記号: connection-graphical・interface-connection・binding-connection・n-ary-segment・flow・
//   succession-flow・message・binary-dependency・n-ary-dependency-client-link・n-ary-dependency-supplier-link・
//   annotation-link・distinguished-parameter-link・concern-stakeholder-link
// 線の上の印(edge.markers): flow-node-r・flow-node-l・sflow-node-r・sflow-node-l・message-node-r・message-node-l
//
// 読み方は GR4 P1 の裁定 Q1〜Q17 と、P2 の裁定 Q18〜Q24 による(reports/GR4/)。

import { joinTokens, commentLines } from './common.js';
import { isPartLike, pathOf } from './scope.js';

const PORT_HOLDERS = new Set(['part', 'part-ref', 'part-def', 'port-def', 'port-usage']);
const PARAM_HOLDERS = new Set(['constraint', 'constraint-ref', 'requirement', 'requirement-ref']);
const KIND_WORDS = new Set(['part', 'item', 'port', 'attribute', 'connection', 'interface', 'flow', 'constraint', 'requirement',
  'concern', 'view', 'viewpoint', 'enum', 'occurrence', 'action', 'state', 'calc', 'case', 'analysis', 'verification',
  'use', 'allocation', 'metadata', 'rendering']);

// ---- 要素の種類から、図での描き方を決める
// 戻り値: 'box:<記号>'・'port'・'edge:<種類>'・'note'・'dependency'・null(文字の区画に出す)
export function classify(ctx, el) {
  const is = (k) => ctx.is(el, k);
  if (!ctx.user(el)) return null;
  if (is('InterfaceDefinition') || is('AllocationDefinition')) return null;
  if (is('ConnectionDefinition')) return 'box:connection-def';
  if (is('FlowDefinition')) return 'box:flow-def';
  if (is('ViewDefinition')) return 'box:view-def';
  if (is('ViewpointDefinition')) return 'box:viewpoint-def';
  if (is('PortDefinition')) return 'box:port-def';
  if (is('RenderingDefinition')) return null;
  if (is('PartDefinition')) return 'box:part-def';
  if (is('AllocationUsage')) return null;
  if (is('InterfaceUsage')) return 'edge:interface';
  if (is('ConnectionUsage')) return 'edge:connection';
  if (is('BindingConnectorAsUsage')) return 'edge:binding';
  if (is('SuccessionFlowUsage')) return 'edge:succession-flow';
  if (is('FlowUsage')) return isMessage(ctx, el) ? 'edge:message' : 'edge:flow';
  if (is('ViewUsage')) return 'box:view';
  if (is('RenderingUsage')) return null;
  if (is('MetadataUsage')) return 'note';
  if (is('PartUsage')) return el.attrs.isReference ? 'box:part-ref' : 'box:part';
  if (is('ItemUsage')) return el.attrs.isReference ? 'box:item-ref' : 'box:item';
  if (is('PortUsage')) return 'port';
  if (is('AttributeUsage')) return 'box:attribute';
  if (is('ConcernUsage')) return 'box:concern';
  if (is('ViewpointUsage')) return 'box:viewpoint';
  if (is('SatisfyRequirementUsage') || is('AssertConstraintUsage')) return null;
  if (is('RequirementUsage')) return el.attrs.isReference ? 'box:requirement-ref' : 'box:requirement';
  if (is('ConstraintUsage')) return el.attrs.isReference ? 'box:constraint-ref' : 'box:constraint';
  if (is('Comment') || is('TextualRepresentation')) return 'note';
  if (is('Dependency')) return 'dependency';
  return null;
}

// メッセージ(Message の規則で作った FlowUsage: isAbstract で、端が ParameterMembership の EventOccurrenceUsage)
function isMessage(ctx, el) {
  if (!el.attrs.isAbstract) return false;
  if (el.owned.some((c) => ctx.model.conforms(c.kind, 'EndFeatureMembership'))) return false;
  return true;
}

// ---- 文字の区画(裁定 Q13・Q17)。戻り値 { symbol, title } か null(区画に出さない)
const BEHAVIORAL = ['ActionUsage', 'ActionDefinition', 'ConstraintUsage', 'ConstraintDefinition'];
export function compartmentOf(ctx, rel, el, owner) {
  const r = (k) => ctx.model.conforms(rel.kind, k);
  const is = (k) => ctx.is(el, k);
  const C = (symbol, title) => ({ symbol, title });
  if (r('SubjectMembership')) return C('subject-compartment', 'subject');
  if (r('ActorMembership')) return C('actors-compartment', 'actors');
  if (r('StakeholderMembership')) return C('stakeholders-compartment', 'stakeholders');
  if (r('FramedConcernMembership')) return C('frames-compartment', 'frames');
  if (r('RequirementVerificationMembership')) return C('verifies-compartment', 'verifies');
  if (r('RequirementConstraintMembership')) return rel.attrs.kind === 'assumption' ? C('assume-constraints-compartment', 'assume constraints') : C('require-constraints-compartment', 'require constraints');
  if (r('ObjectiveMembership')) return C('objective-compartment', 'objective');
  if (r('VariantMembership')) return ctx.is(owner, 'EnumerationDefinition') ? C('enums-compartment', 'enums') : C('variants-compartment', 'variants');
  if (r('ElementFilterMembership')) return C('filters-compartment', 'filters');
  if (r('ViewRenderingMembership')) return C('rendering-compartment', 'rendering');
  if (r('ResultExpressionMembership') || r('ReturnParameterMembership')) return C('result-compartment', 'result');
  if (r('StateSubactionMembership')) return C('state-actions-compartment', 'state actions');
  if (r('EndFeatureMembership') || el.attrs?.isEnd) return C('ends-compartment', 'ends');
  if (!ctx.user(el)) return null;
  if (el.attrs.direction !== undefined && ctx.model.conforms(el.kind, 'Feature')) {
    return ctx.isAny(owner, BEHAVIORAL) ? C('parameters-compartment', 'parameters') : C('directed-features-compartment', 'directed features');
  }
  if (is('AttributeUsage')) return C('attributes-compartment', 'attributes');
  if (is('PortUsage')) return C('ports-compartment', 'ports');
  if (is('InterfaceUsage')) return C('interfaces-compartment', 'interfaces');
  if (is('AllocationUsage')) return C('allocations-compartment', 'allocations');
  if (is('ConnectionUsage') || is('BindingConnectorAsUsage')) return C('connections-compartment', 'connections');
  if (is('FlowUsage')) return C('flows-compartment', 'flows');
  if (is('SuccessionAsUsage')) return C('successions-compartment', 'successions');
  if (is('ViewUsage')) return C('views-compartment', 'views');
  if (is('PartUsage')) return C('parts-compartment', 'parts');
  if (is('MetadataUsage')) return null;
  if (is('ItemUsage')) return C('items-compartment', 'items');
  if (is('ExhibitStateUsage')) return C('exhibit-states-compartment', 'exhibit states');
  if (is('IncludeUseCaseUsage')) return C('include-use-cases-compartment', 'include use cases');
  if (is('PerformActionUsage')) return C('perform-actions-compartment', 'perform actions');
  if (is('StateUsage')) return C('states-compartment', 'states');
  if (is('AnalysisCaseUsage')) return C('analyses-compartment', 'analyses');
  if (is('VerificationCaseUsage')) return C('verifications-compartment', 'verifications');
  if (is('UseCaseUsage')) return C('use-cases-compartment', 'use cases');
  if (is('CalculationUsage') && !is('CaseUsage')) return C('calcs-compartment', 'calcs');
  if (is('ActionUsage') && !is('TransitionUsage') && !is('CaseUsage')) return C('actions-compartment', 'actions');
  if (is('SatisfyRequirementUsage')) return C('satisfy-requirements-compartment', 'satisfy requirements');
  if (is('AssertConstraintUsage')) return C('assert-constraints-compartment', 'assert constraints');
  if (is('ConcernUsage')) return C('concerns-compartment', 'concerns');
  if (is('ViewpointUsage')) return C('viewpoints-compartment', 'viewpoints');
  if (is('RequirementUsage')) return C('requirements-compartment', 'requirements');
  if (is('ConstraintUsage')) return C('constraints-compartment', 'constraints');
  if (is('OccurrenceUsage')) {
    if (el.attrs.portionKind === 'timeslice') return C('timeslices-compartment', 'timeslices');
    if (el.attrs.portionKind === 'snapshot') return C('snapshots-compartment', 'snapshots');
    if (el.attrs.isIndividual) return C('individuals-compartment', 'individuals');
    return C('occurrences-compartment', 'occurrences');
  }
  if (is('Comment') || is('TextualRepresentation') || is('Dependency')) return null;
  return C('features-compartment', 'features');
}

// ---- 名前の区画の 2 行(«キーワード» の行と、宣言の行)
export function headerOf(ctx, el, symbol, aliases) {
  const toks = ctx.declTokens(el);
  let k = toks.findIndex((t) => t.kind === 'KEYWORD' && KIND_WORDS.has(t.text));
  let kw, rest;
  if (k >= 0) {
    if (toks[k + 1]?.text === 'def') k++;
    kw = joinTokens(toks.slice(0, k + 1));
    rest = joinTokens(toks.slice(k + 1));
  } else {
    kw = symbol.replace(/-ref$/, '').replace('-def', ' def').replace('port-usage', 'port');
    rest = joinTokens(toks);
  }
  const al = aliases.get(el);
  if (al?.length) rest += ` «alias» ${al.join(', ')}`;
  return { keyword: `«${kw}»`, name: rest };
}

// ---- 図の組み立て
export function buildDiagram(ctx, candidate, scope) {
  const objects = new Map();
  const top = [];
  const edges = [];
  const diagnostics = [];
  const pending = []; // 線にする要素 { el, kind, box }
  const annotations = []; // { note, targets: [要素] }
  const dparamLinks = [];
  const elObjs = new Map(); // 要素 → [図の要素]
  const lineOf = new Map(); // 文字の区画の行に書いた要素 → { box, line }
  const viewMode = candidate.kind === 'view';
  const drawn = (el) => !viewMode || scope.drawn.has(el);
  const idOf = (el) => 'e' + ctx.order.get(el);
  const srcOf = (el) => [el.start, el.end];

  // 別名(alias X for Y)
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
  const diag = (level, code, message, el) => diagnostics.push({ level, code, message, start: el?.start ?? null, end: el?.end ?? null });

  // 箱を作るところ(makeBox)と、描かない要素の中を同じ箱に描くところ(fill の lifted)は、入れ子の深さに比例して呼び出しが深く
  // ならないよう、生成関数の yield で ['box', 要素, 記号, 親の箱]・['fill', 箱, 名前空間, true] を頼み、runBuild が明示のスタックで
  // 回す(設計書 2.6 節 v18.1。GR18 の B1)。箱を作る順序と中身は、再帰で呼んでいたときと同じ
  function runBuild(gen) {
    const stack = [gen];
    let input;
    for (;;) {
      const r = stack[stack.length - 1].next(input);
      input = undefined;
      if (r.done) { stack.pop(); if (!stack.length) return r.value; input = r.value; continue; }
      const q = r.value;
      stack.push(q[0] === 'box' ? makeBoxGen(q[1], q[2], q[3]) : fillGen(q[1], q[2], q[3]));
    }
  }
  const makeBox = (el, symbol, parent) => runBuild(makeBoxGen(el, symbol, parent));
  const place = (box, rel, el, ns) => runBuild(placeGen(box, rel, el, ns));
  function* makeBoxGen(el, symbol, parent) {
    const h = headerOf(ctx, el, symbol, aliases);
    const box = reg({ id: idOf(el), type: 'box', symbol, el, src: srcOf(el), parent: parent?.id ?? null, region: [], ports: [], compartments: [], header: h, ellipsis: false, omittedGeneralView: false });
    if (parent) parent.region.push(box.id); else top.push(box.id);
    if (symbol.startsWith('constraint') || symbol.startsWith('requirement')) {
      box.omittedGeneralView = true;
      diag('info', 'not-drawn-view', `${h.keyword} ${h.name} の箱の中の一般ビュー(general-view)は、GR4 では描かない`, el);
    }
    yield* fillGen(box, el);
    // 受け継いだポート(裁定 Q7・Q19・Q21)
    if (PORT_HOLDERS.has(symbol) && isPartLike(ctx, el)) {
      const inh = ctx.model.inheritedMembersOf(el).members.map((m) => m.element).filter((p) => ctx.is(p, 'PortUsage'));
      for (const p of inh) {
        if (viewMode && !scope.exposedVia.get(p)?.has(el)) continue;
        makePort(p, box, true);
      }
    }
    return box;
  }

  function addCompartmentLine(box, c, el, text) {
    // ends の区画の行は QualifiedName (':' QualifiedName)?(8.2.3.14 節 ends-compartment-element、sysml20 L13757)。
    // 端の名前と型を書く(GR4 P2 の 3 回目の指示 4)
    if (c.symbol === 'ends-compartment') { const ty = ctx.typeText(el); text = (ctx.nameOf(el) ?? '') + (ty ? ` : ${ty}` : ''); }
    let comp = box.compartments.find((x) => x.symbol === c.symbol);
    if (!comp) { comp = { symbol: c.symbol, title: c.title, lines: [] }; box.compartments.push(comp); }
    comp.lines.push({ text, src: srcOf(el) });
    if (!lineOf.has(el)) lineOf.set(el, { box, line: comp.lines[comp.lines.length - 1] });
  }

  // 箱の中身: 所有するメンバーを、記号・ポート・線・文字の区画に振り分ける
  function* fillGen(box, ns, lifted = false) {
    for (const { rel, el } of ctx.members(ns)) {
      if (ctx.model.conforms(rel.kind, 'Membership') && rel.kind === 'Membership') continue; // 別名
      if (el.start === el.end) continue; // 原文に書かれていない要素(ポートの定義の暗黙の共役ポートの定義など)
      // ビューの filter の条件は、公開の対象ではなく箱の表示の一部なので、いつも filters の区画に出す
      if (ctx.model.conforms(rel.kind, 'ElementFilterMembership')) { if (box) addCompartmentLine(box, compartmentOf(ctx, rel, el, ns), el, joinTokens(ctx.declTokens(rel)).replace(/^filter\s*/, '')); continue; }
      if (!drawn(el)) {
        // 裁定 Q18・Q20: 描かない要素の、描く子孫は、図にある最も近い祖先の箱に描く
        box.ellipsis = true;
        if (viewMode && ctx.model.conforms(el.kind, 'Namespace')) yield ['fill', box, el, true];
        continue;
      }
      yield* placeGen(box, rel, el, ns);
    }
    if (ctx.is(ns, 'ViewUsage') && !lifted) {
      for (const exp of ns.owned) if (ctx.model.conforms(exp.kind, 'Expose')) addCompartmentLine(box, { symbol: 'exposes-compartment', title: 'exposes' }, exp, joinTokens(ctx.declTokens(exp)).replace(/^expose\s*/, ''));
    }
  }

  function* placeGen(box, rel, el, ns) {
    const sym = box?.symbol ?? null;
    const rk = (k) => ctx.model.conforms(rel.kind, k);
    // 変化点の選択肢(variant)は、実際の部品ではないので、箱にせず variants の区画に出す
    if (box && rk('VariantMembership')) { addCompartmentLine(box, compartmentOf(ctx, rel, el, ns), el, joinTokens(ctx.declTokens(el))); return; }
    // subject・actor・stakeholder(要求の箱と、関心事の stakeholder)
    if (box && (rk('SubjectMembership') || rk('ActorMembership') || rk('StakeholderMembership'))
      && (PARAM_HOLDERS.has(sym) && sym.startsWith('requirement') || (sym === 'concern' && rk('StakeholderMembership')))) {
      const symbol = rk('SubjectMembership') ? 'subject' : rk('ActorMembership') ? 'actor' : 'stakeholder';
      const parentBox = box.parent ? objects.get(box.parent) : null;
      const o = reg({ id: idOf(el), type: 'dparam', symbol, el, src: srcOf(el), parent: parentBox?.id ?? null, label: joinTokens(ctx.declTokens(el)).replace(/^(subject|actor|stakeholder)\s*/, '') });
      if (parentBox) parentBox.region.push(o.id); else top.push(o.id);
      dparamLinks.push({ from: box, to: o, symbol: sym === 'concern' ? 'concern-stakeholder-link' : 'distinguished-parameter-link' });
      return;
    }
    // 制約・要求の引数(裁定 Q8)
    if (box && PARAM_HOLDERS.has(sym) && el.attrs.direction !== undefined && rk('FeatureMembership') && !rk('ReturnParameterMembership')) {
      makePort(el, box, false, 'param');
      return;
    }
    const cls = classify(ctx, el);
    if (cls === 'port' && box && PORT_HOLDERS.has(sym)) { makePort(el, box, false); return; }
    if (cls === 'port' && !box) { yield ['box', el, 'port-usage', null]; return; } // 裁定 Q3: 持ち主の箱が図にないポート
    if (cls?.startsWith('edge:')) {
      // 線は、中に図を持つ箱(part・part-ref・part-def)と最上位だけで描く。ほかの箱では文字の区画に出す
      if (box && !boxHasRegion(sym)) { addCompartmentLine(box, compartmentOf(ctx, rel, el, ns), el, joinTokens(ctx.declTokens(el))); return; }
      pending.push({ el, kind: cls.slice(5), box });
      // 接続・インターフェースが所有するフロー(裁定 Q11: 接続の線の上の印にする)
      if (cls === 'edge:connection' || cls === 'edge:interface') {
        for (const { el: f } of ctx.members(el)) {
          const k = classify(ctx, f);
          if ((k === 'edge:flow' || k === 'edge:succession-flow' || k === 'edge:message') && drawn(f)) pending.push({ el: f, kind: k.slice(5), box });
        }
      }
      return;
    }
    if (cls === 'dependency') { pending.push({ el, kind: 'dependency', box }); return; }
    if (cls === 'note') {
      // 接頭辞のメタデータ(#X part …)は、名前の区画のキーワードの行に書かれるので、注釈の記号にしない
      if (ctx.is(el, 'MetadataUsage') && ctx.text[el.start - 1] === '#') return;
      makeNote(el, box, ns);
      return;
    }
    if (cls?.startsWith('box:')) {
      const symbol = cls.slice(4);
      // part-def は描く範囲の外側の箱(裁定 Q2)、attribute は持ち主の箱がないとき(裁定 Q13)だけ箱にする
      if (box && (symbol === 'part-def' || symbol === 'attribute')) { addCompartmentLine(box, compartmentOf(ctx, rel, el, ns), el, joinTokens(ctx.declTokens(el))); return; }
      // 文字の区画しか持たない箱(item など)の中の部品は、区画に出す
      if (box && !boxHasRegion(sym)) { addCompartmentLine(box, compartmentOf(ctx, rel, el, ns), el, joinTokens(ctx.declTokens(el))); return; }
      yield ['box', el, symbol, box];
      return;
    }
    if (!box) { diag('info', 'not-drawn', `${pathOf(ctx, el)}(${el.kind})は、相互接続ビューの記号を持たないので描かない`, el); return; }
    const c = compartmentOf(ctx, rel, el, ns);
    if (c) addCompartmentLine(box, c, el, joinTokens(ctx.declTokens(el)));
  }

  function makePort(el, owner, inherited, kind = 'port') {
    const id = inherited ? `${owner.id}^${idOf(el)}` : idOf(el);
    const type = ctx.typeText(el);
    const name = ctx.nameOf(el) ?? '';
    const label = (inherited ? '^' : '') + name + (type ? ` : ${type}` : '');
    const dir = el.attrs.direction ?? null;
    const o = reg({ id, type: 'port', symbol: kind, el, src: srcOf(el), owner: owner.id, inherited, dir, dashed: !!el.attrs.isReference, label, children: [] });
    (owner.type === 'port' ? owner.children : owner.ports).push(o.id);
    // 入れ子のポート(所有するものだけ。裁定 Q21)
    if (kind === 'port') for (const { el: c } of ctx.members(el)) if (ctx.is(c, 'PortUsage') && drawn(c)) {
      const k = makePort(c, o, inherited);
      k.nested = true;
    }
    return o;
  }

  function makeNote(el, box, ns) {
    const { symbol, heading, lines } = noteContent(ctx, el);
    // 注釈の記号は、中に図を持つ最も近い箱(なければ最上位)に置く
    let host = box;
    while (host && !boxHasRegion(host.symbol)) host = host.parent ? objects.get(host.parent) : null;
    const o = reg({ id: idOf(el), type: 'note', symbol, el, src: srcOf(el), parent: host?.id ?? null, heading: heading.filter((x) => x !== ''), lines });
    if (host) host.region.push(o.id); else top.push(o.id);
    // 注釈される要素: about があればその要素、なければ持ち主(KerML 8.3.2.3)
    const abouts = el.owned.filter((c) => ctx.model.conforms(c.kind, 'Annotation'));
    const targets = abouts.length ? abouts.map((a) => ({ el: ctx.target(a, 'annotatedElement'), name: ctx.refText(ctx.ref(a, 'annotatedElement')) })) : (ns && ns !== ctx.tree ? [{ el: ns, name: ctx.nameOf(ns) }] : []);
    annotations.push({ note: o, targets });
  }

  // ---- 範囲の外側
  let frame = null;
  if (candidate.kind === 'part') {
    const sym = ctx.is(candidate.el, 'PartDefinition') ? 'part-def' : candidate.el.attrs.isReference ? 'part-ref' : 'part';
    makeBox(candidate.el, sym, null);
  } else {
    const v = candidate.el;
    const vt = ctx.typeText(v);
    frame = { el: v, src: srcOf(v), title: `«view» ${pathOf(ctx, v).replace(/^.*::/, '')}${vt ? ` : ${vt}` : ''}`, exposes: [], filters: [], notes: [] };
    for (const c of v.owned) {
      if (ctx.model.conforms(c.kind, 'Expose')) frame.exposes.push(joinTokens(ctx.declTokens(c)));
      else if (ctx.model.conforms(c.kind, 'ElementFilterMembership')) frame.filters.push(joinTokens(ctx.declTokens(c)));
    }
    for (const { el: c } of ctx.members(v)) if (ctx.is(c, 'Comment')) frame.notes.push(...commentLines(c.attrs.body));
    // 公開した要素のうち、図にある祖先を持たないものを最上位に置く(裁定 Q20)
    const hasDrawnAncestor = (el) => { for (let x = ctx.ownerOf(el); x; x = ctx.ownerOf(x)) if (scope.drawn.has(x)) return true; return false; };
    const placedInherited = (el) => [...(scope.exposedVia.get(el) ?? [])].some((via) => via && scope.drawn.has(via) && ctx.ownerOf(el) !== via);
    const tops = [...scope.drawn].filter((el) => !hasDrawnAncestor(el) && !placedInherited(el)).sort((a, b) => ctx.order.get(a) - ctx.order.get(b));
    for (const el of tops) place(null, ctx.owningRel(el), el, ctx.ownerOf(el));
    for (const el of scope.memberOnly) {
      if (!scope.drawn.has(el) || !ctx.model.conforms(el.kind, 'Namespace')) continue;
      // 中のメンバーを別の expose(X::** など)で描いていれば、案内しない
      if (ctx.members(el).length && !ctx.members(el).some((m) => scope.drawn.has(m.el))) diag('info', 'expose-member-only', `${pathOf(ctx, el)} は expose で要素 1 つだけを公開しているので、中を描いていない。中を描くには expose ${pathOf(ctx, el)}::**; と書く`, el);
    }
    for (const nr of scope.notReflected) {
      if (nr.kind === 'expose-unresolved') { diag('warn', 'expose-unresolved', `「${joinTokens(ctx.declTokens(nr.el))}」の対象は、このテキストの要素に解決できない(未検査・曖昧・ライブラリの要素)ので、何も公開しない`, nr.el); continue; }
      const what = nr.kind === 'render' ? 'render' : nr.kind === 'filter' ? 'filter の条件' : 'expose の [ ] の条件';
      diag('warn', 'not-reflected', `${what}「${joinTokens(ctx.declTokens(nr.el))}」は反映していない(反映するのは @種類名 と @利用者の注釈 の形だけ。render は反映しない)`, nr.el);
    }
  }

  // ---- 線の端を、図の要素に対応づける
  const objsInside = (o) => {
    const out = [];
    if (o.type === 'box') { for (const id of o.region) out.push(objects.get(id)); for (const id of o.ports) out.push(objects.get(id)); }
    if (o.type === 'port') for (const id of o.children) out.push(objects.get(id));
    return out;
  };
  const redefines = (a, b) => ctx.user(a) && a.owned.some((c) => ctx.model.conforms(c.kind, 'Redefinition') && ctx.target(c, 'redefinedFeature') === b);
  const childFor = (o, el) => {
    if (!el) return null;
    const kids = objsInside(o);
    return kids.find((k) => k.el === el) ?? kids.find((k) => redefines(k.el, el)) ?? null;
  };
  const ancestorsOf = (box) => { const out = []; for (let b = box; b; b = b.parent ? objects.get(b.parent) : null) out.push(b); return out; };
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
      // 裁定 Q7: 描いていない特徴の端は、箱の辺の proxy で描く
      const pid = `${cur.id}>${rest}`;
      let p = objects.get(pid);
      if (!p) { p = reg({ id: pid, type: 'proxy', symbol: 'proxy', el: null, src: null, owner: cur.id, label: '.' + rest }); cur.ports.push(p.id); }
      return { obj: p };
    }
    return { obj: cur, extra: rest };
  }
  const endChainOf = (f) => {
    const rs = f.owned.find((c) => ctx.model.conforms(c.kind, 'ReferenceSubsetting'));
    if (!rs) return f.name ? [{ el: null, name: f.name, status: null }] : [];
    const chain = ctx.chainOf(rs, 'referencedFeature');
    // フローの端の「a.b」は、a の参照と、端が所有する b を再定義する特徴で書かれる
    for (const { el: x } of ctx.members(f)) {
      if (!ctx.model.conforms(x.kind, 'ReferenceUsage')) continue;
      const rd = x.owned.find((c) => ctx.model.conforms(c.kind, 'Redefinition'));
      if (rd) { const r = ctx.ref(rd, 'redefinedFeature'); chain.push({ el: r?.status === 'resolved' ? r.target : null, name: r?.segments?.at(-1)?.name ?? r?.text ?? '', status: r?.status ?? null }); }
    }
    return chain;
  };
  // 端の多重度(接続の端の [1..*] は、端が所有する特徴の下の MultiplicityRange)。参照の部分集合の中は見ない
  const multText = (f) => {
    const find = (e, depth) => {
      for (const c of e.owned) {
        if (ctx.model.conforms(c.kind, 'ReferenceSubsetting')) continue;
        for (const m of c.related) {
          if (ctx.model.conforms(m.kind, 'MultiplicityRange')) return m;
          if (depth < 3) { const x = find(m, depth + 1); if (x) return x; }
        }
      }
      return null;
    };
    const m = find(f, 0);
    return m ? ctx.text.slice(m.start, m.end).replace(/\s+/g, '') : null;
  };
  const endFeatures = (el) => {
    const out = [];
    for (const c of el.owned) {
      if (ctx.model.conforms(c.kind, 'EndFeatureMembership') || (ctx.model.conforms(c.kind, 'ParameterMembership') && isMessage(ctx, el))) {
        const f = c.related[0];
        if (f) out.push(f);
      }
    }
    return out;
  };
  const labelOf = (el) => {
    const nm = ctx.nameOf(el);
    const ty = ctx.typeText(el);
    let s = (nm ?? '') + (ty ? ` : ${ty}` : '');
    if (ctx.isAny(el, ['FlowUsage'])) {
      const pl = el.owned.flatMap((c) => c.related).find((x) => ctx.model.conforms(x.kind, 'PayloadFeature'));
      if (pl) s += `${s ? ' ' : ''}of ${joinTokens(ctx.declTokens(pl))}`;
    }
    return s.trim();
  };
  const notDrawn = (el, box, why) => {
    if (box) box.ellipsis = true;
    diag('info', 'edge-not-drawn', `${labelOf(el) || el.kind} を描いていない: ${why}`, el);
  };

  const markersFor = new Map(); // 接続の要素 → 線
  for (const p of pending) {
    const { el, kind, box } = p;
    if (kind === 'dependency') continue;
    if ((kind === 'flow' || kind === 'succession-flow' || kind === 'message')) {
      const owner = ctx.ownerOf(el);
      if (ctx.isAny(owner, ['ConnectionUsage'])) continue; // 接続の上の印(下で扱う)
    }
    const ends = endFeatures(el).map((f) => ({ f, chain: endChainOf(f) }));
    const res = ends.map((e) => ({ ...e, r: resolveEnd(e.chain, box ?? null) }));
    const bad = res.find((x) => x.r.fail);
    if (bad) { notDrawn(el, box, bad.r.fail); continue; }
    if (res.length < 2) { notDrawn(el, box, '端が 2 つない'); continue; }
    const base = { el, src: srcOf(el), label: labelOf(el), markers: [] };
    if (res.length > 2 && (kind === 'connection' || kind === 'interface')) {
      // 端が 3 つ以上の接続(n-ary-connection)
      const dot = reg({ id: idOf(el) + '.dot', type: 'dot', symbol: 'n-ary-connection-dot', el, src: srcOf(el), parent: box?.id ?? null, label: base.label, members: res.map((x) => x.r.obj.id) });
      res.forEach((x, i) => edges.push({ id: `${idOf(el)}.${i}`, symbol: 'n-ary-segment', el, src: srcOf(el), from: dot.id, to: x.r.obj.id, label: '', toRole: x.f.name ?? null, toMult: multText(x.f), toExtra: x.r.extra ?? null }));
      continue;
    }
    const [a, b] = res;
    const symbol = { connection: 'connection-graphical', interface: 'interface-connection', binding: 'binding-connection', flow: 'flow', 'succession-flow': 'succession-flow', message: 'message' }[kind];
    const e = { id: idOf(el), symbol, ...base, box: box?.id ?? null, from: a.r.obj.id, to: b.r.obj.id, fromRole: a.f.name ?? null, toRole: b.f.name ?? null, fromMult: multText(a.f), toMult: multText(b.f), fromExtra: a.r.extra ?? null, toExtra: b.r.extra ?? null };
    if (kind === 'binding') e.label = '=';
    edges.push(e);
    markersFor.set(el, e);
  }
  // 接続・インターフェースが所有するフロー(裁定 Q11: 線の上の印)
  for (const p of pending) {
    const { el, kind, box } = p;
    if (!(kind === 'flow' || kind === 'succession-flow' || kind === 'message')) continue;
    const owner = ctx.ownerOf(el);
    if (!ctx.isAny(owner, ['ConnectionUsage'])) continue;
    const host = markersFor.get(owner);
    if (!host) { notDrawn(el, box, '持ち主の接続を描いていない'); continue; }
    const ends = endFeatures(el).map((f) => resolveEnd(endChainOf(f), box ?? null));
    // 向き: フローの始点が、接続の始点の側(同じ要素か、その中)なら右向き(r)
    let dir = 'r';
    const src = ends[0]?.obj;
    if (src) {
      const within = (o, id) => { for (let x = o; x; x = x.owner ? objects.get(x.owner) : x.parent ? objects.get(x.parent) : null) if (x.id === id) return true; return false; };
      if (within(src, host.to) && !within(src, host.from)) dir = 'l';
    }
    const prefix = kind === 'flow' ? 'flow-node' : kind === 'succession-flow' ? 'sflow-node' : 'message-node';
    host.markers.push({ symbol: `${prefix}-${dir}`, el, src: srcOf(el), label: labelOf(el) });
  }
  // 線の端になる図の要素。文字の区画の行に書いた要素なら、その箱を端にし、行を灰色にする(element-inside-textual-compartment)
  const objOrLine = (el) => {
    const o = elObjs.get(el)?.[0];
    if (o) return o;
    const l = lineOf.get(el);
    if (l) {
      // 区画の行そのもの(灰色にした部分)を線の端にする
      l.line.highlight = true;
      const id = `${l.box.id}#${l.line.src[0]}`;
      return objects.get(id) ?? reg({ id, type: 'cline', symbol: 'element-inside-textual-compartment', el: null, src: l.line.src, parent: l.box.id, line: l.line });
    }
    return null;
  };
  // 依存(binary-dependency・n-ary-dependency)
  for (const p of pending) {
    if (p.kind !== 'dependency') continue;
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
  // 注釈の線
  for (const { note, targets } of annotations) {
    targets.forEach((t, i) => {
      const o = t.el ? objOrLine(t.el) : null;
      if (!o) { diag('info', 'edge-not-drawn', `注釈の線を描いていない: 「${t.name ?? ''}」は図に描いていない`, note.el); return; }
      edges.push({ id: `${note.id}.a${i}`, symbol: 'annotation-link', el: note.el, src: note.src, from: note.id, to: o.id, label: '', markers: [] });
    });
  }
  for (const [i, l] of dparamLinks.entries()) edges.push({ id: `${l.to.id}.l`, symbol: l.symbol, el: l.to.el, src: l.to.src, from: l.from.id, to: l.to.id, label: '', markers: [] });

  edges.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  // 選んだ要素の欄(GR4 指示書 6.1 節)に出す、要素の種類・名前・修飾名
  for (const x of [...objects.values(), ...edges]) {
    if (!x.el || x.info) continue;
    x.info = { kind: x.el.kind, name: ctx.nameOf(x.el) ?? null, qname: pathOf(ctx, x.el) };
  }
  if (frame) frame.info = { kind: frame.el.kind, name: ctx.nameOf(frame.el) ?? null, qname: pathOf(ctx, frame.el) };
  return { objects, top, edges, diagnostics, frame, viewMode };
}

// 注釈の記号の種類と文字(状態遷移ビューと共通)
export function noteContent(ctx, el) {
  let symbol, lines = [], heading = [];
  const nm = ctx.nameOf(el);
  if (ctx.is(el, 'MetadataUsage')) {
    symbol = 'metadata-feature-annotation-node';
    heading = ['«metadata»', nm ?? ctx.typeText(el) ?? ''];
    for (const { el: f } of ctx.members(el)) if (ctx.model.conforms(f.kind, 'Feature')) lines.push(joinTokens(ctx.declTokens(f)).replace(/^:>>\s*/, ''));
  } else if (ctx.is(el, 'Documentation')) {
    symbol = 'documentation-node';
    heading = ['«doc»', [nm, el.attrs.locale ? `locale ${el.attrs.locale}` : null].filter(Boolean).join(' ')];
    lines = commentLines(el.attrs.body);
  } else if (ctx.is(el, 'TextualRepresentation')) {
    symbol = 'textual-representation-node';
    heading = ['«rep»', nm ?? ''];
    lines = [`language = ${el.attrs.language ?? ''}`, ...commentLines(el.attrs.body)];
  } else {
    const kw = nm != null || el.attrs.locale != null;
    symbol = kw ? 'comment-with-keyword' : 'comment-without-keyword';
    if (kw) heading = ['«comment»', [nm, el.attrs.locale ? `locale ${el.attrs.locale}` : null].filter(Boolean).join(' ')];
    lines = commentLines(el.attrs.body);
  }
  return { symbol, heading, lines };
}

function boxHasRegion(symbol) {
  return symbol === 'part' || symbol === 'part-ref' || symbol === 'part-def';
}
