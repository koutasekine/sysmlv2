// 一般ビューの図の要素の組み立て(GR10 指示書 5 章、設計書 7.7 節)。外部パッケージ・Node.js 固有の機能・DOM を使わない。
//
// listGeneralCandidates(ctx) → [{ id, kind: 'view' | 'package' | 'root', label, el }]
//   テキストに view があれば、view を記述の順に並べる。なければ、パッケージ(LibraryPackage を含む)を、入れ子のものも
//   含めて記述の順に並べる。根の名前空間は、パッケージ以外の要素を直接持つときだけ、先頭に並べる(GR10 P1 の裁定 Q1 の (e))
// buildGeneralDiagram(ctx, candidate, scope) → diagram(src/view/diagram.js の buildDiagram と同じ形)
//
// 図の要素(type)と記号(tools/view/symbols.json の general の生成規則の名前):
//   box   描く範囲のパッケージの外枠 package-with-name-in-tab(中に直接持つ要素を置く)、入れ子のパッケージ
//         package-with-name-inside、名前空間の import imported-package-with-name-inside(破線)、定義と使用の箱
//         (GEN_BOXES の記号。GR11 の分野の定義と使用は、キーワード入りの名前の区画を持つ汎用の箱)
//   note  注釈(今のビューと同じ記号)
// 線: subclassification・definition・subsetting・reference-subsetting・redefinition・composite-feature-membership・
//   noncomposite-feature-membership・portion-relationship・import・top-level-import・recursive-import と、依存・注釈の線。
//   型の関係の線の端の記号は、いつも終点(e.to。上位・型・持ち主・取り込まれる側)に付ける
//
// 読み方は GR10 P1 の裁定 Q1〜Q10 による(reports/GR10/P1_symbols_*.md の 4 章)。
//   - 定義と使用が持つ使用は、入れ子の深さによらず箱にし、持ち主から合成の線(参照の使用なら noncomposite、時間の切片・瞬間なら
//     portion-relationship)で結ぶ(Q4 の (b))。属性・ポート・向きのある特徴・引数・線になる使用・参照する使用・variant は、
//     持ち主の箱の文字の区画に出す(LINE_COMPARTMENTS)。定義と使用が持つ定義も区画に出す(Q4 の (d))
//   - 型の関係の線は、両端が箱として描かれているときだけ描く(Q5)。相手がこのテキストの要素で描く範囲の外にあるものは、
//     線の種類と相手ごとにまとめて図の診断に出す(Q7)
//   - 描く範囲のパッケージ自身の名前空間の import は破線のパッケージ、要素 1 つの import は図の診断にまとめる(Q2 の (a)・(b))。
//     外枠の中の要素が持つ import は、取り込む先が図にあれば線で描く(Q2 の (c))
//
// 分野ごとの専用の記号(GR12。読み方は GR12 P1 の裁定 Q1〜Q10 による。reports/GR12/P1_symbols_*.md の 4 章)。
//   - 計算・制約・要求・解析・検証・ユースケースの定義と使用の箱(PARAM_BOXES)の引数は、区画に書かず、箱の辺の param-* にする
//     (Q3 の (a)。相互接続ビューの制約・要求の箱と同じ)。戻り値は result の区画のまま(Q3 の (b))
//   - 要求・解析・検証・ユースケースの定義と使用の箱(DPARAM_BOXES)の subject・actor・stakeholder と、関心事の stakeholder は、
//     節点にして持ち主の箱と distinguished-parameter-link(関心事は concern-stakeholder-link)で結ぶ(Q1 の (b))
//   - 参照するだけの require・assume・frame・satisfy・assert・verify・include と、端が 2 つの割り当て、view の箱の expose は、
//     両端が図にあれば線(require-edge など)にし、今の箱・区画の行を描かない。端が図になければ今のまま(Q2・Q4・Q5)

import { joinTokens, commentLines, runNested } from './common.js';
import { pathOf } from './scope.js';
import { compartmentOf, headerOf, noteContent } from './diagram.js';
import { walkTree } from '../parser/tree.js';

// ---- 描く範囲の候補
export function listGeneralCandidates(ctx) {
  const views = [];
  const pkgs = [];
  walkTree(ctx.tree, (e) => {
    if (ctx.is(e, 'ViewUsage')) views.push(e);
    else if (ctx.is(e, 'Package') && isMemberPackage(ctx, e)) pkgs.push(e);
  }); // 明示のスタックでたどる(GR18 の B1)
  if (views.length) return withIds(ctx, views.map((el) => ({ kind: 'view', el })));
  const list = [];
  // 根の名前空間は、パッケージ以外の要素(定義・使用・注釈など)を直接持つときだけ候補にする(裁定 Q1 の (e))
  if (ctx.members(ctx.tree).some(({ rel, el }) => rel.kind !== 'Membership' && el.start !== el.end && !ctx.is(el, 'Package'))) list.push({ kind: 'root', el: ctx.tree });
  for (const el of pkgs) list.push({ kind: 'package', el });
  return withIds(ctx, list);
}
// メンバーとして書いたパッケージ(フィルター付きの import・expose の中の無名のパッケージを除く)
function isMemberPackage(ctx, e) {
  const r = ctx.owningRel(e);
  return !!r && ctx.model.conforms(r.kind, 'Membership');
}
function withIds(ctx, list) {
  const seen = new Map();
  return list.map((c) => {
    const p = c.kind === 'root' ? '' : pathOf(ctx, c.el);
    const base = c.kind === 'root' ? 'root' : `${c.kind}:${p}`;
    const k = (seen.get(base) ?? 0) + 1;
    seen.set(base, k);
    const label = c.kind === 'root' ? '(根の名前空間)' : `${c.kind === 'view' ? 'view' : 'package'} ${p}`;
    return { id: k === 1 ? base : `${base}#${k}`, kind: c.kind, label, el: c.el };
  });
}

// ---- 定義と使用の箱の記号(P1 の一覧の「GR10 で描く」「汎用の箱で描く」「これまでのビューの記号を使う」)。
// 上から順に当てる(下位の種類を先に置く)。記号が null の種類(rendering・case など、本文の図表記に節点のないもの)は描かない
const DEF_BOXES = [
  ['EnumerationDefinition', 'enumeration-def'], ['AttributeDefinition', 'attribute-def'], ['MetadataDefinition', 'metadata-def'],
  ['AllocationDefinition', 'allocation-def'], ['InterfaceDefinition', 'interface-def'], ['FlowDefinition', 'flow-def'],
  ['ConnectionDefinition', 'connection-def'], ['PortDefinition', 'port-def'], ['ViewpointDefinition', 'viewpoint-def'],
  ['ViewDefinition', 'view-def'], ['RenderingDefinition', null], ['ConcernDefinition', 'concern-def'],
  ['RequirementDefinition', 'requirement-def'], ['ConstraintDefinition', 'constraint-def'], ['AnalysisCaseDefinition', 'analysis-def'],
  ['VerificationCaseDefinition', 'verification-def'], ['UseCaseDefinition', 'use-case-def'], ['CaseDefinition', null],
  ['CalculationDefinition', 'calc-def'], ['StateDefinition', 'state-def'], ['ActionDefinition', 'action-def'],
  ['PartDefinition', 'part-def'], ['ItemDefinition', 'item-def'], ['OccurrenceDefinition', 'occurrence-def'],
];
const USAGE_BOXES = [
  ['EnumerationUsage', 'enumeration'], ['AttributeUsage', 'attribute'], ['MetadataUsage', null], ['AllocationUsage', 'allocation'],
  ['InterfaceUsage', 'interface'], ['FlowUsage', 'flow-node'], ['ConnectionUsage', 'connection'], ['BindingConnectorAsUsage', null],
  ['SuccessionAsUsage', null], ['PortUsage', 'port-usage'], ['ViewpointUsage', 'viewpoint'], ['ViewUsage', 'view'],
  ['RenderingUsage', null], ['ConcernUsage', 'concern'], ['SatisfyRequirementUsage', 'satisfy-requirement-usage'],
  ['RequirementUsage', 'requirement', 'requirement-ref'], ['AssertConstraintUsage', 'assert-constraint-node'],
  ['ConstraintUsage', 'constraint', 'constraint-ref'], ['AnalysisCaseUsage', 'analysis'], ['VerificationCaseUsage', 'verification'],
  ['IncludeUseCaseUsage', 'include-use-case-usage'], ['UseCaseUsage', 'use-case'], ['CaseUsage', null], ['CalculationUsage', 'calc'],
  ['TransitionUsage', null], ['ExhibitStateUsage', 'exhibit-state-usage'], ['StateUsage', 'state'],
  ['PerformActionUsage', 'perform-action-usage'], ['ActionUsage', 'action', 'action-ref'], ['PartUsage', 'part', 'part-ref'],
  ['ItemUsage', 'item', 'item-ref'], ['EventOccurrenceUsage', 'event-occurrence'], ['OccurrenceUsage', 'occurrence', 'occurrence-ref'],
];
// 名前の区画の記号(箱の記号から -ref を除き -name-compartment を付けたものと違うもの)
const NAME_SYMS = {
  'satisfy-requirement-usage': 'satisfy-requirement-name-compartment', 'assert-constraint-node': 'assert-constraint-name-compartment',
  'include-use-case-usage': 'include-use-case-name-compartment', 'flow-node': 'flow-name-compartment', 'port-usage': 'port-name-compartment',
  'exhibit-state-usage': 'exhibit-state-name-compartment', 'perform-action-usage': 'perform-action-name-compartment',
  'snapshot': 'snapshot-name-compartment', 'require-constraint-node': 'require-constraint-name-compartment',
  'assume-constraint-node': 'assume-constraint-name-compartment', 'frame-concern-node': 'frame-concern-name-compartment',
};
// 宣言にキーワード(part・item など)がないときの、名前の区画の «» の中の語
const KEYWORD_OF = {
  'satisfy-requirement-usage': 'satisfy', 'assert-constraint-node': 'assert constraint', 'include-use-case-usage': 'include use case',
  'flow-node': 'flow', 'event-occurrence': 'event occurrence', 'exhibit-state-usage': 'exhibit state', 'perform-action-usage': 'perform action',
  'enumeration-def': 'enum-def', 'enumeration': 'enum', 'use-case-def': 'use case-def', 'use-case': 'use case', 'calc-def': 'calc-def',
};

// 要素の箱の記号。null なら箱にしない
export function generalBoxOf(ctx, el) {
  if (!ctx.user(el)) return null;
  if (ctx.is(el, 'Definition')) {
    const hit = DEF_BOXES.find(([k]) => ctx.is(el, k));
    if (hit) return hit[1];
    return el.kind === 'Definition' ? 'extended-def' : null;
  }
  if (ctx.is(el, 'Usage')) {
    if (ctx.is(el, 'OccurrenceUsage') && el.attrs.portionKind) return el.attrs.portionKind === 'snapshot' ? 'snapshot' : 'timeslice';
    const hit = USAGE_BOXES.find(([k]) => ctx.is(el, k));
    if (hit) return el.attrs.isReference && hit[2] ? hit[2] : hit[1];
    return el.kind === 'Usage' ? 'extended-usage' : null;
  }
  return null;
}

// 持ち主の箱の文字の区画に出す使用(裁定 Q4 の (b))。区画は compartmentOf で決める。
//   属性・ポート / 向きのある特徴と引数(subject・actor・stakeholder・戻り値を含む) / 線になる使用(接続・インターフェース・結合・
//   フロー・メッセージ・継承・遷移・割り当て) / ほかの要素を参照する使用(perform・exhibit・include・satisfy・assert・verify) / variant
// それ以外の使用は箱にする(端・entry などの本体・objective・require と assume の制約・frame の関心事も箱にする)
const LINE_KINDS = ['AttributeUsage', 'PortUsage', 'ConnectorAsUsage', 'FlowUsage', 'SuccessionAsUsage', 'TransitionUsage', 'AllocationUsage',
  'PerformActionUsage', 'ExhibitStateUsage', 'IncludeUseCaseUsage', 'SatisfyRequirementUsage', 'AssertConstraintUsage'];
const LINE_RELS = ['SubjectMembership', 'ActorMembership', 'StakeholderMembership', 'ReturnParameterMembership', 'ParameterMembership',
  'RequirementVerificationMembership', 'VariantMembership'];
function asLine(ctx, rel, el) {
  if (LINE_RELS.some((k) => ctx.model.conforms(rel.kind, k))) return true;
  if (ctx.isAny(el, LINE_KINDS)) return true;
  return el.attrs.direction !== undefined;
}
// 箱にする使用のうち、持ち主との関係で記号が決まるもの(本文 8.2.3.21 節・8.2.3.22 節の require・assume の制約と frame の関心事)
// (FramedConcernMembership は RequirementConstraintMembership の下位なので先に調べる)
function memberBoxOf(ctx, rel, el) {
  if (ctx.model.conforms(rel.kind, 'FramedConcernMembership')) return 'frame-concern-node';
  if (ctx.model.conforms(rel.kind, 'RequirementConstraintMembership')) return rel.attrs.kind === 'assumption' ? 'assume-constraint-node' : 'require-constraint-node';
  return generalBoxOf(ctx, el);
}
// 持ち主との関係(メンバーシップ)の側に書くキーワード(assume constraint・require constraint・frame concern・objective)。
// 使用の宣言の字句には入らないので、名前の区画の «» の行をこの語にする
function memberKeyword(ctx, rel, symbol) {
  if (symbol === 'frame-concern-node') return 'frame concern';
  if (symbol === 'assume-constraint-node') return 'assume constraint';
  if (symbol === 'require-constraint-node') return 'require constraint';
  if (ctx.model.conforms(rel.kind, 'ObjectiveMembership')) return 'objective';
  return null;
}

// 引数を辺に描く箱(GR12 P1 の裁定 Q3 の (a))と、subject・actor・stakeholder を節点にする箱(本文の subject-actors-stakeholders-node
// の選択肢。裁定 Q1 の (b))
const PARAM_BOXES = new Set(['calc-def', 'calc', 'constraint-def', 'constraint', 'constraint-ref', 'requirement-def', 'requirement', 'requirement-ref',
  'analysis-def', 'analysis', 'verification-def', 'verification', 'use-case-def', 'use-case']);
const DPARAM_BOXES = new Set(['requirement', 'requirement-ref', 'analysis-def', 'analysis', 'verification-def', 'verification', 'use-case-def', 'use-case']);
const DPARAM_RELS = ['SubjectMembership', 'ActorMembership', 'StakeholderMembership'];

// 線の種類の名前(図の診断に使う)
const EDGE_WORDS = {
  subclassification: '特殊化', definition: '型付け', subsetting: '部分集合', 'reference-subsetting': '参照の部分集合', redefinition: '再定義',
  import: 'import', 'top-level-import': 'import', 'recursive-import': 'import', dependency: '依存', annotation: '注釈',
};

// ---- 図の組み立て
export function buildGeneralDiagram(ctx, candidate, scope, fx = {}) {
  const objects = new Map();
  const top = [];
  const edges = [];
  const diagnostics = [];
  const elBox = new Map(); // 要素 → 箱
  const lineOf = new Map(); // 文字の区画の行に書いた要素 → { box, line }
  const pendingDeps = []; // { el }
  const annotations = []; // { note, targets }
  const conv = []; // 線にする使用(GR12): { el, symbol, label, from, to, box?, line?, boxOnly? }
  const viewMode = candidate.kind === 'view';
  const drawn = (el) => !viewMode || scope.drawn.has(el);
  const idOf = (el) => 'e' + ctx.order.get(el);
  const srcOf = (el) => [el.start, el.end];
  const diag = (level, code, message, el) => diagnostics.push({ level, code, message, start: el?.start ?? null, end: el?.end ?? null });
  const reg = (o) => { objects.set(o.id, o); return o; };

  // 別名(alias X for Y)は、相手の箱の名前の区画に «alias» X を書く(裁定 Q1 の (d))
  const aliases = new Map();
  for (const n of ctx.order.keys()) {
    if (n.kind !== 'Membership' || n.attrs.memberName == null) continue;
    const t = ctx.target(n, 'memberElement');
    if (t) { if (!aliases.has(t)) aliases.set(t, []); aliases.get(t).push(n.attrs.memberName); }
  }

  // 描く範囲の外(裁定 Q7)。package・root では、要素の持ち主をたどって、最初に着くパッケージ(か根)が描く範囲でないもの。
  // view では、公開していないもの
  const inScope = (t) => {
    if (viewMode) return scope.drawn.has(t);
    for (let x = ctx.ownerOf(t); x; x = ctx.ownerOf(x)) {
      if (x === candidate.el) return true;
      if (ctx.is(x, 'Package')) return false;
    }
    return false;
  };
  const outside = new Map(); // `${種類}|${順}` → { word, target, n, el }
  const noteOutside = (word, target, el) => {
    const k = `${word}|${ctx.order.get(target)}`;
    if (!outside.has(k)) outside.set(k, { word, target, n: 0, el });
    outside.get(k).n++;
  };

  // 領域: package なら外枠の箱の中、root・view なら最上位
  let region = null; // 外枠の箱(package のとき)
  const put = (o) => { if (region) { o.parent = region.id; region.region.push(o.id); } else { o.parent = null; top.push(o.id); } };

  function header(el, symbol) {
    const toks = ctx.declTokens(el);
    const al = aliases.get(el);
    const withAlias = (s) => (al?.length ? `${s} «alias» ${al.join(', ')}` : s);
    // 拡張の定義・使用(#X def Y;・#X y;)は、接頭辞のメタデータとキーワードを «» の行に書く(本文 8.2.3.6 節の extended-def-name-compartment)
    if (symbol === 'extended-def') {
      const k = toks.findIndex((t) => t.kind === 'KEYWORD' && t.text === 'def');
      if (k >= 0) return { keyword: `«${joinTokens(toks.slice(0, k + 1))}»`, name: withAlias(joinTokens(toks.slice(k + 1))) };
    }
    if (symbol === 'extended-usage') {
      let k = 0;
      while (k < toks.length) {
        if (toks[k].text === '#') { k = afterQualifiedName(toks, k + 1); continue; }
        if (toks[k].kind === 'KEYWORD' && USAGE_PREFIX.has(toks[k].text)) { k++; continue; }
        break;
      }
      if (k > 0) return { keyword: `«${joinTokens(toks.slice(0, k))}»`, name: withAlias(joinTokens(toks.slice(k))) };
    }
    // 2 語のキーワード use case と、message(src/view/diagram.js の headerOf が分けない形)
    const u = toks.findIndex((t, i) => t.kind === 'KEYWORD' && ((t.text === 'use' && toks[i + 1]?.text === 'case') || t.text === 'message'));
    if (u >= 0 && !toks.slice(0, u).some((t) => t.kind === 'KEYWORD' && KIND_WORDS_GEN.has(t.text))) {
      let k = toks[u].text === 'use' ? u + 1 : u;
      if (toks[k + 1]?.text === 'def') k++;
      return { keyword: `«${joinTokens(toks.slice(0, k + 1))}»`, name: withAlias(joinTokens(toks.slice(k + 1))) };
    }
    // 種類の語(part など)のない宣言(timeslice t・satisfy R by x・accept s など)は、先頭のキーワードと接頭辞のメタデータを
    // «» の行に書き、残りを名前の行に書く。先頭にキーワードがなければ、記号から決めた語を «» の行に書く
    if (!toks.some((t) => t.kind === 'KEYWORD' && (KIND_WORDS_GEN.has(t.text) || t.text === 'use' || t.text === 'case'))) {
      let k = 0;
      while (k < toks.length) {
        if (toks[k].text === '#') { k = afterQualifiedName(toks, k + 1); continue; }
        if (toks[k].kind === 'KEYWORD') { k++; continue; }
        break;
      }
      if (k > 0) return { keyword: `«${joinTokens(toks.slice(0, k))}»`, name: withAlias(joinTokens(toks.slice(k))) };
    }
    return headerOf(ctx, el, KEYWORD_OF[symbol] ?? symbol, aliases);
  }

  function makeBox(el, symbol, rel = null) {
    const h = header(el, symbol);
    const mk = rel ? memberKeyword(ctx, rel, symbol) : null;
    if (mk) { h.keyword = `«${mk}»`; h.name = h.name.replace(/^(constraint|concern|requirement)\b\s*/, ''); }
    const box = reg({ id: idOf(el), type: 'box', symbol, nameSym: NAME_SYMS[symbol], el, src: srcOf(el), parent: null, region: [], ports: [], compartments: [], header: h, ellipsis: false, omittedGeneralView: false });
    if (el.attrs.isReference && !symbol.endsWith('-ref') && ctx.is(el, 'Usage')) box.dashed = true;
    put(box);
    elBox.set(el, box);
    return box;
  }

  // パッケージの箱(中を描かない形)。«» の行は構造の文字だけに使い、図には書かない(本文 8.2.3.5 節の図は名前だけ)
  function packageHeader(el) {
    const toks = ctx.declTokens(el);
    const k = toks.findIndex((t) => t.kind === 'KEYWORD' && t.text === 'package');
    const al = aliases.get(el);
    const name = joinTokens(toks.slice(k + 1)) + (al?.length ? ` «alias» ${al.join(', ')}` : '');
    return { keyword: `«${joinTokens(toks.slice(0, k + 1)) || 'package'}»`, name };
  }

  function addCompartmentLine(box, c, el, text) {
    let comp = box.compartments.find((x) => x.symbol === c.symbol);
    if (!comp) { comp = { symbol: c.symbol, title: c.title, lines: [] }; box.compartments.push(comp); }
    comp.lines.push({ text, src: srcOf(el) });
    if (!lineOf.has(el)) lineOf.set(el, { box, line: comp.lines[comp.lines.length - 1] });
    return { box, comp, line: comp.lines[comp.lines.length - 1] };
  }

  // 箱の辺の引数(GR12 P1 の裁定 Q3 の (a))。記号と文字は相互接続ビュー(src/view/diagram.js の makePort)と同じ
  function makeParam(box, el) {
    const type = ctx.typeText(el);
    const label = (ctx.nameOf(el) ?? '') + (type ? ` : ${type}` : '');
    const o = reg({ id: idOf(el), type: 'port', symbol: 'param', el, src: srcOf(el), owner: box.id, inherited: false, dir: el.attrs.direction ?? null, dashed: !!el.attrs.isReference, label, children: [] });
    box.ports.push(o.id);
    elBox.set(el, o);
  }
  // subject・actor・stakeholder の節点(裁定 Q1 の (b))。持ち主の箱と同じ領域に置く(src/view/diagram.js の place と同じ記号と文字)
  function makeDparam(box, rel, el) {
    const rk = (k) => ctx.model.conforms(rel.kind, k);
    const symbol = rk('SubjectMembership') ? 'subject' : rk('ActorMembership') ? 'actor' : 'stakeholder';
    const o = reg({ id: idOf(el), type: 'dparam', symbol, el, src: srcOf(el), parent: null, label: joinTokens(ctx.declTokens(el)).replace(/^(subject|actor|stakeholder)\s*/, '') });
    put(o);
    elBox.set(el, o);
    edges.push({ id: `${o.id}.l`, symbol: box.symbol === 'concern' ? 'concern-stakeholder-link' : 'distinguished-parameter-link', el, src: srcOf(el), from: box.id, to: o.id, label: '', markers: [] });
  }
  const isDparam = (box, rel) => {
    const rk = (k) => ctx.model.conforms(rel.kind, k);
    return DPARAM_BOXES.has(box.symbol) ? DPARAM_RELS.some(rk) : box.symbol === 'concern' && rk('StakeholderMembership');
  };
  const isParam = (rel, el) => el.attrs.direction !== undefined && ctx.model.conforms(rel.kind, 'FeatureMembership')
    && !ctx.model.conforms(rel.kind, 'ReturnParameterMembership') && !DPARAM_RELS.some((k) => ctx.model.conforms(rel.kind, k));

  // 参照するだけの使用の参照先(裁定 Q2 の (c)〜(h))。使用が、原文に書いた参照の部分集合(連鎖でなく、このテキストの要素に解決したもの)
  // を持ち、宣言の字句がキーワードと参照の部分集合(と extra の関係の範囲)だけで、ほかに原文に書いたメンバー・関係を持たないとき、
  // その参照先。否定(assert not・not satisfy)は線にしない
  function refOnly(el, extra = []) {
    if (el.attrs.isNegated) return null;
    const rs = el.owned.find((r) => ctx.model.conforms(r.kind, 'ReferenceSubsetting') && r.start < r.end);
    const t = rs ? ctx.target(rs, 'referencedFeature') : null;
    if (!t || !ctx.user(t)) return null;
    const ranges = [rs, ...extra];
    if (ctx.declTokens(el).some((tk) => tk.kind !== 'KEYWORD' && !ranges.some((x) => tk.start >= x.start && tk.end <= x.end))) return null;
    for (const r of el.owned) if (r !== rs && !extra.includes(r) && r.start < r.end) return null;
    return t;
  }
  // satisfy の by の相手(SubjectMembership の値の特徴の参照)。by がなければ { rel: null }、相手が決まらなければ null
  function satisfier(el) {
    const sm = el.owned.find((r) => ctx.model.conforms(r.kind, 'SubjectMembership') && r.start < r.end);
    if (!sm) return { rel: null, t: null };
    const fv = sm.related[0]?.owned.find((r) => ctx.model.conforms(r.kind, 'FeatureValue'));
    const ex = fv?.related[0];
    if (!ex || !ctx.model.conforms(ex.kind, 'FeatureReferenceExpression')) return null;
    const m = ex.owned.find((r) => r.kind === 'Membership');
    const t = m ? ctx.target(m, 'memberElement') : null;
    return t && ctx.user(t) ? { rel: sm, t } : null;
  }
  // 線にする使用の形(裁定 Q2・Q4): { symbol, label, from, to }(from・to は要素)か null。ns は持ち主
  function edgeForm(rel, el, ns) {
    const rk = (k) => ctx.model.conforms(rel.kind, k);
    const mk = (symbol, kw, from, to) => (from && to ? { symbol, label: `«${kw}»`, from, to } : null);
    if (rk('RequirementVerificationMembership')) {
      const obj = ctx.owningRel(ns);
      return obj && ctx.model.conforms(obj.kind, 'ObjectiveMembership') ? mk('verify-relationship', 'verify', ctx.ownerOf(ns), refOnly(el)) : null;
    }
    if (rk('FramedConcernMembership')) return mk('frame-relationship', 'frame', ns, refOnly(el));
    if (rk('RequirementConstraintMembership')) return rel.attrs.kind === 'assumption' ? mk('assume-edge', 'assume', ns, refOnly(el)) : mk('require-edge', 'require', ns, refOnly(el));
    if (ctx.is(el, 'SatisfyRequirementUsage')) {
      const s = satisfier(el);
      return s ? mk('satisfy-edge', 'satisfy', s.t ?? ns, refOnly(el, s.rel ? [s.rel] : [])) : null;
    }
    if (ctx.is(el, 'AssertConstraintUsage')) return mk('assert-edge', 'assert', ns, refOnly(el));
    if (ctx.is(el, 'IncludeUseCaseUsage')) return mk('include-use-case-relationship', 'include', ns, refOnly(el));
    if (ctx.is(el, 'AllocationUsage')) return allocateForm(el);
    return null;
  }
  // 端が 2 つの割り当て(裁定 Q4 の (a))。端は原文に書いた参照の部分集合だけの特徴で、ほかに原文に書いたメンバーを持たないもの。
  // 線の文字は «allocate» と、宣言した名前・型(allocate の前の字句。裁定 Q10 の (a))
  function allocateForm(el) {
    const ends = [];
    for (const { rel, el: m } of ctx.members(el)) {
      if (m.start === m.end) continue;
      if (!ctx.model.conforms(rel.kind, 'EndFeatureMembership')) return null;
      const t = refOnly(m);
      if (!t) return null;
      ends.push(t);
    }
    if (ends.length !== 2) return null;
    const toks = ctx.declTokens(el);
    const k = toks.findIndex((t) => t.kind === 'KEYWORD' && t.text === 'allocate');
    if (k < 0) return null;
    const rest = joinTokens(toks.slice(0, k).filter((t) => !(t.kind === 'KEYWORD' && t.text === 'allocation')));
    return { symbol: 'allocate-relationship', label: `«allocate»${rest ? ' ' + rest : ''}`, from: ends[0], to: ends[1] };
  }

  function makeNote(el, ns) {
    const { symbol, heading, lines } = noteContent(ctx, el);
    const o = reg({ id: idOf(el), type: 'note', symbol, el, src: srcOf(el), parent: null, heading: heading.filter((x) => x !== ''), lines });
    put(o);
    elBox.set(el, o);
    // 注釈される要素: about があればその要素、なければ持ち主(KerML 8.3.2.3)。根の名前空間には線を引かない
    const abouts = el.owned.filter((c) => ctx.model.conforms(c.kind, 'Annotation'));
    const targets = abouts.length ? abouts.map((a) => ({ el: ctx.target(a, 'annotatedElement'), name: ctx.refText(ctx.ref(a, 'annotatedElement')) })) : (ns && ns !== ctx.tree ? [{ el: ns, name: ctx.nameOf(ns) }] : []);
    annotations.push({ note: o, targets });
  }

  // 領域に直接置く要素(描く範囲のパッケージが直接持つ要素、root の要素、view で公開した要素)
  function placeTop(rel, el, ns) {
    if (rel && rel.kind === 'Membership') return; // 別名
    if (el.start === el.end) return;
    if (ctx.is(el, 'Package')) {
      const b = reg({ id: idOf(el), type: 'box', symbol: 'package-with-name-inside', el, src: srcOf(el), parent: null, region: [], ports: [], compartments: [], header: packageHeader(el), ellipsis: false, omittedGeneralView: false });
      put(b);
      elBox.set(el, b);
      return;
    }
    if (ctx.is(el, 'MetadataUsage') && ctx.text[el.start - 1] === '#') return; // 接頭辞のメタデータは持ち主のキーワードの行に書く
    if (ctx.isAny(el, ['Comment', 'TextualRepresentation', 'MetadataUsage'])) { makeNote(el, ns); return; }
    if (ctx.is(el, 'Dependency')) { pendingDeps.push({ el }); return; }
    const sym = generalBoxOf(ctx, el);
    if (!sym) { diag('info', 'not-drawn', `${pathOf(ctx, el)}(${el.kind})は、一般ビューの記号を持たないので描かない`, el); return; }
    const box = makeBox(el, sym);
    fill(box, el);
    const f = rel ? edgeForm(rel, el, ns) : null;
    if (f) conv.push({ ...f, el, box });
  }

  // 箱の中身: 持つ使用は別の箱にして合成の線で結び、それ以外は文字の区画に出す(裁定 Q4)。
  // 入れ子の箱の中身は明示のスタックで回す(GR27 の R。設計書 2.6 節。箱・線を作る順は前の再帰と同じ)
  function fill(box, ns) { runNested(fillGen(box, ns, false)); }
  function* fillGen(box, ns, lifted) {
    for (const { rel, el } of ctx.members(ns)) {
      if (rel.kind === 'Membership') continue; // 別名
      if (el.start === el.end) continue; // 原文に書かれていない要素
      if (ctx.model.conforms(rel.kind, 'ElementFilterMembership')) { addCompartmentLine(box, compartmentOf(ctx, rel, el, ns), el, joinTokens(ctx.declTokens(rel)).replace(/^filter\s*/, '')); continue; }
      if (!drawn(el)) {
        // view で公開していない要素の、公開した子孫は、この箱の中身として扱う(設計書 5 章)
        box.ellipsis = true;
        if (viewMode && ctx.model.conforms(el.kind, 'Namespace')) yield fillGen(box, el, true);
        continue;
      }
      if (ctx.is(el, 'MetadataUsage') && ctx.text[el.start - 1] === '#') continue;
      if (ctx.isAny(el, ['PayloadFeature', 'FlowEnd'])) continue; // フローの運ぶもの・端は、名前の区画の宣言に書かれている
      if (ctx.isAny(el, ['Comment', 'TextualRepresentation', 'MetadataUsage'])) { makeNote(el, ns); continue; }
      if (ctx.is(el, 'Dependency')) { pendingDeps.push({ el }); continue; }
      // 箱の要素が直接持つ引数と subject・actor・stakeholder(GR12。view で描かない要素の子孫を持ち上げたものは今のとおり区画に出す)
      if (!lifted && isDparam(box, rel)) { makeDparam(box, rel, el); continue; }
      if (!lifted && PARAM_BOXES.has(box.symbol) && isParam(rel, el)) { makeParam(box, el); continue; }
      const c = compartmentOf(ctx, rel, el, ns);
      const sym = ctx.is(el, 'Usage') && !asLine(ctx, rel, el) ? memberBoxOf(ctx, rel, el) : null;
      const f = edgeForm(rel, el, ns);
      if (sym) {
        const child = makeBox(el, sym, rel);
        yield fillGen(child, el, false);
        const portion = sym === 'timeslice' || sym === 'snapshot';
        // 参照の使用(ref)と、いつも参照である事象(EventOccurrenceUsage)と端(end)は noncomposite
        const symbol = portion ? 'portion-relationship' : el.attrs.isReference || el.attrs.isEnd || ctx.is(el, 'EventOccurrenceUsage') ? 'noncomposite-feature-membership' : 'composite-feature-membership';
        edges.push({ id: idOf(rel), symbol, el: rel, src: srcOf(rel), from: child.id, to: box.id, label: '', markers: [] });
        if (f) conv.push({ ...f, el, box: child });
        continue;
      }
      if (c) { const at = addCompartmentLine(box, c, el, joinTokens(ctx.declTokens(el))); if (f) conv.push({ ...f, el, line: at }); }
    }
    if (ctx.is(ns, 'ViewUsage') && !lifted) {
      for (const exp of ns.owned) {
        if (!ctx.model.conforms(exp.kind, 'Expose')) continue;
        const at = addCompartmentLine(box, { symbol: 'exposes-compartment', title: 'exposes' }, exp, joinTokens(ctx.declTokens(exp)).replace(/^expose\s*/, ''));
        // 公開した要素が図に箱として描かれていれば、view の箱からの破線にする(裁定 Q5 の (b))。記号と文字は import の線と同じ決め方
        const recursive = exp.attrs.isRecursive === true;
        const ns2 = ctx.model.conforms(exp.kind, 'NamespaceExpose');
        const t = ns2 ? ctx.target(exp, 'importedNamespace') : ctx.target(exp, 'importedMembership');
        if (t && ctx.user(t)) conv.push({ el: exp, symbol: recursive ? 'recursive-expose-r' : ns2 ? 'toplevel-expose-r' : 'expose-r', label: `«expose»${recursive ? '**' : ns2 ? '*' : ''}`, from: ns, to: t, line: at, boxOnly: true });
      }
    }
  }

  // ---- 範囲
  let frame = null;
  const scopeImports = []; // 描く範囲のパッケージ(か根)が持つ import
  if (candidate.kind === 'view') {
    const v = candidate.el;
    const vt = ctx.typeText(v);
    frame = { el: v, src: srcOf(v), title: `«view» ${pathOf(ctx, v).replace(/^.*::/, '')}${vt ? ` : ${vt}` : ''}`, exposes: [], filters: [], notes: [] };
    for (const c of v.owned) {
      if (ctx.model.conforms(c.kind, 'Expose')) frame.exposes.push(joinTokens(ctx.declTokens(c)));
      else if (ctx.model.conforms(c.kind, 'ElementFilterMembership')) frame.filters.push(joinTokens(ctx.declTokens(c)));
    }
    for (const { el: c } of ctx.members(v)) if (ctx.is(c, 'Comment')) frame.notes.push(...commentLines(c.attrs.body));
    // 公開した要素のうち、図の箱(定義・使用の箱)の中に入らないものを最上位に置く。パッケージの箱は中を描かないので、
    // 公開したパッケージの中の要素も最上位に置く
    const boxedAncestor = (el) => {
      for (let x = ctx.ownerOf(el); x; x = ctx.ownerOf(x)) if (scope.drawn.has(x) && generalBoxOf(ctx, x)) return true;
      return false;
    };
    const tops = [...scope.drawn].filter((el) => !boxedAncestor(el)).sort((a, b) => ctx.order.get(a) - ctx.order.get(b));
    // 公開した属性・ポート(向きのある特徴を含む)は、持ち主の箱が図にあれば、その箱の文字の区画に出す(GR10 P2 の画像の確認の後の
    // 指示 3。裁定 Q4 と同じ扱い)。持ち主は、要素を持つ名前空間か、expose でその要素を公開したときに通った名前空間(継承した特徴なら
    // 型付けした使用)。持ち主の箱がないときだけ、ほかの最上位の要素の後に箱にする
    const lineLike = (el) => ctx.isAny(el, ['AttributeUsage', 'PortUsage']) || (el.attrs.direction !== undefined && ctx.model.conforms(el.kind, 'Feature'));
    // GR14 の P(src/view/index.js の FIG14.P。指示書 3.3 節): 公開したパッケージ X の、公開したメンバーは、X の箱(中身のある箱。
    // 描く範囲のパッケージの外枠と同じ package-with-name-in-tab)の中に、同じ規則(関係の段・帯の線)で置く。メンバーの入れ物は、
    // 持ち主が公開したパッケージならそれ、そうでなければ、そのメンバーを見せている名前空間(expose の経由。import で取り込んだ
    // メンバーなど)のうち、公開したパッケージの最初のもの。入れ物にした X の箱は、X のメンバーを置くより前に作る
    // (取り込んだメンバーが X より前に書かれていれば、X の箱をそこで作る)
    const pkgOf = (el) => {
      if (!fx.P) return null;
      const own = ctx.ownerOf(el);
      if (own && scope.drawn.has(own) && ctx.is(own, 'Package')) return own;
      return [...(scope.exposedVia.get(el) ?? [])].find((v) => v && v !== el && scope.drawn.has(v) && ctx.is(v, 'Package')) ?? null;
    };
    const holder = new Map(tops.map((el) => [el, pkgOf(el)]));
    for (const [el, x] of [...holder]) if (x && !holder.has(x)) holder.set(el, null); // 入れ物が最上位に置く要素でなければ使わない
    const holders = new Set([...holder.values()].filter(Boolean));
    // 入れ物の箱の鎖(入れ子のパッケージ)は明示のスタックで回す(GR27 の R。箱を作る順は前の再帰と同じ。seen は鎖の上で今の要素より
    // 前のもの。前の再帰の「今までの seen に今の要素を足して渡す」と同じものを、1 つの集合に足していく形で持つ)
    const holderBox = (x) => runNested(holderBoxGen(x, new Set()));
    const holderBoxGen = function* (x, seen) {
      if (elBox.has(x)) return elBox.get(x);
      const up = holder.get(x);
      let outer = null;
      if (up && !seen.has(up)) { seen.add(x); outer = yield holderBoxGen(up, seen); }
      region = outer;
      const b = reg({ id: idOf(x), type: 'box', symbol: 'package-with-name-in-tab', el: x, src: srcOf(x), parent: null, region: [], ports: [], compartments: [], header: packageHeader(x), ellipsis: false, omittedGeneralView: false, flowLayout: true });
      put(b);
      region = null;
      elBox.set(x, b);
      return b;
    };
    // 入れ物の箱の中に置く(put は region の箱に置く。region は描く範囲のパッケージの外枠のための変数で、view では null なので、
    // 置く間だけ入れ物の箱にする)
    const inHolder = (el, f) => { const x = holder.get(el); region = x ? holderBox(x) : null; f(); region = null; };
    const later = [];
    for (const el of tops) {
      if (lineLike(el)) later.push(el);
      else if (holders.has(el)) holderBox(el);
      else inHolder(el, () => placeTop(ctx.owningRel(el), el, ctx.ownerOf(el)));
    }
    for (const el of later) {
      const hosts = [ctx.ownerOf(el), ...(scope.exposedVia.get(el) ?? [])].filter((x) => x && elBox.get(x)?.type === 'box' && elBox.get(x) !== region);
      if (!hosts.length) { inHolder(el, () => placeTop(ctx.owningRel(el), el, ctx.ownerOf(el))); continue; }
      if (lineOf.has(el)) continue;
      const host = hosts[0];
      const c = compartmentOf(ctx, ctx.owningRel(el), el, host);
      if (c) addCompartmentLine(elBox.get(host), c, el, joinTokens(ctx.declTokens(el)));
    }
    // 持ち主(定義か使用)が図に箱としてない特徴は、箱にして図の下にまとめ、件数と名前を知らせる(GR10 P2 の
    // 画像の確認の後の 2 回目の裁定 2。持ち主が使用のときも含めるのは 3 回目の裁定 4)
    const ownerOut = tops.filter((el) => {
      const ns = ctx.ownerOf(el);
      return ctx.model.conforms(el.kind, 'Feature') && !lineOf.has(el) && elBox.has(el) && ns && ctx.isAny(ns, ['Definition', 'Usage']) && elBox.get(ns)?.type !== 'box';
    });
    if (ownerOut.length) diag('info', 'owner-out-of-scope', `持ち主(定義か使用)が描く範囲の外にある特徴 ${ownerOut.length} 件(箱にして図の下に置いた): ${ownerOut.map((el) => pathOf(ctx, el)).join('、')}`, ownerOut[0]);
    for (const el of scope.memberOnly) {
      if (!scope.drawn.has(el) || !ctx.model.conforms(el.kind, 'Namespace')) continue;
      if (ctx.members(el).length && !ctx.members(el).some((m) => scope.drawn.has(m.el))) diag('info', 'expose-member-only', `${pathOf(ctx, el)} は expose で要素 1 つだけを公開しているので、中を描いていない。中を描くには expose ${pathOf(ctx, el)}::**; と書く`, el);
    }
    for (const nr of scope.notReflected) {
      if (nr.kind === 'expose-unresolved') { diag('warn', 'expose-unresolved', `「${joinTokens(ctx.declTokens(nr.el))}」の対象は、このテキストの要素に解決できない(未検査・曖昧・ライブラリの要素)ので、何も公開しない`, nr.el); continue; }
      const what = nr.kind === 'render' ? 'render' : nr.kind === 'filter' ? 'filter の条件' : 'expose の [ ] の条件';
      diag('warn', 'not-reflected', `${what}「${joinTokens(ctx.declTokens(nr.el))}」は反映していない(反映するのは @種類名 と @利用者の注釈 の形だけ。render は反映しない)`, nr.el);
    }
  } else {
    const P = candidate.el;
    if (candidate.kind === 'package') {
      region = reg({ id: idOf(P), type: 'box', symbol: 'package-with-name-in-tab', el: P, src: srcOf(P), parent: null, region: [], ports: [], compartments: [], header: packageHeader(P), ellipsis: false, omittedGeneralView: false, flowLayout: true });
      top.push(region.id);
      elBox.set(P, region);
    }
    for (const c of P.owned) if (ctx.model.conforms(c.kind, 'Import')) scopeImports.push(c);
    for (const { rel, el } of ctx.members(P)) placeTop(rel, el, P);
  }

  // ---- 描く範囲のパッケージ(か根)の import(裁定 Q2 の (a)・(b))
  const memberImports = [];
  for (const imp of scopeImports) {
    const inner = innerImport(ctx, imp);
    const recursive = inner.attrs.isRecursive === true;
    if (ctx.model.conforms(inner.kind, 'MembershipImport') && !recursive) { memberImports.push(imp); continue; }
    const vis = imp.attrs.visibility;
    const name = importName(ctx, imp);
    const b = reg({ id: idOf(imp), type: 'box', symbol: 'imported-package-with-name-inside', el: imp, src: srcOf(imp), parent: null, region: [], ports: [], compartments: [], header: { keyword: '«import»', name, ...(vis && vis !== 'public' ? { before: [`«${vis}»`] } : {}) }, ellipsis: false, omittedGeneralView: false });
    put(b);
  }
  if (memberImports.length) {
    const names = memberImports.map((imp) => importName(ctx, imp));
    diag('info', 'import-not-drawn', `描いていない import(要素 1 つの import)${names.length} 件: ${names.join('、')}`, memberImports[0]);
  }

  // ---- 線の端になる図の要素。文字の区画の行に書いた要素なら、その行(element-inside-textual-compartment)
  const objOrLine = (el) => {
    const o = elBox.get(el);
    if (o) return o;
    const l = lineOf.get(el);
    if (l) {
      l.line.highlight = true;
      const id = `${l.box.id}#${l.line.src[0]}`;
      return objects.get(id) ?? reg({ id, type: 'cline', symbol: 'element-inside-textual-compartment', el: null, src: l.line.src, parent: l.box.id, line: l.line });
    }
    return null;
  };

  // ---- 線にする使用(GR12 P1 の裁定 Q2・Q4・Q5)。両端が図にあるもの(箱・節点・引数か区画の行。expose は箱だけ)を線にし、
  // その使用の箱(と、持ち主への合成の線)か区画の行を除く。端が、線にする使用そのものか、除く箱の区画の行のときは、線にしない
  {
    const convEls = new Set(conv.map((c) => c.el));
    const hostOf = (el, boxOnly) => {
      if (!el || convEls.has(el)) return null;
      const o = elBox.get(el);
      if (o) return o === region || o.type === 'note' || (boxOnly && o.type !== 'box') ? null : o;
      return boxOnly ? null : lineOf.get(el)?.box ?? null;
    };
    let ok = conv.filter((c) => hostOf(c.from, c.boxOnly) && hostOf(c.to, c.boxOnly));
    for (;;) {
      const gone = new Set(ok.map((c) => c.box).filter(Boolean));
      const next = ok.filter((c) => [c.from, c.to].every((x) => { const h = hostOf(x, c.boxOnly); const b = h?.type === 'port' ? objects.get(h.owner) : h; return !gone.has(b); }));
      if (next.length === ok.length) break;
      ok = next;
    }
    for (const c of ok) {
      if (c.box) {
        const b = c.box;
        objects.delete(b.id);
        if (b.parent) { const r = objects.get(b.parent).region; r.splice(r.indexOf(b.id), 1); } else top.splice(top.indexOf(b.id), 1);
        elBox.delete(c.el);
        for (const [k, v] of [...lineOf]) if (v.box === b) lineOf.delete(k);
        for (let i = edges.length - 1; i >= 0; i--) if (edges[i].from === b.id || edges[i].to === b.id) edges.splice(i, 1);
      } else {
        const { box, comp, line } = c.line;
        comp.lines.splice(comp.lines.indexOf(line), 1);
        if (!comp.lines.length) box.compartments.splice(box.compartments.indexOf(comp), 1);
        if (lineOf.get(c.el)?.line === line) lineOf.delete(c.el);
      }
    }
    for (const c of ok) {
      const a = objOrLine(c.from), b = objOrLine(c.to);
      edges.push({ id: idOf(c.el), symbol: c.symbol, el: c.el, src: srcOf(c.el), from: a.id, to: b.id, label: c.label, markers: [] });
    }
  }

  // ---- 型の関係の線(裁定 Q3・Q5)と、箱が持つ import の線(裁定 Q2 の (c))
  for (const [el, box] of [...elBox]) {
    if (box.type !== 'box' || box === region) continue;
    for (const rel of el.owned) {
      if (rel.start === rel.end) continue; // 暗黙の関係
      let symbol = null, t = null;
      const k = (x) => ctx.model.conforms(rel.kind, x);
      if (k('Subclassification')) { symbol = 'subclassification'; t = ctx.target(rel, 'superclassifier'); }
      else if (k('ConjugatedPortTyping')) { symbol = 'definition'; t = ctx.target(rel, 'originalPortDefinition'); }
      else if (k('FeatureTyping')) { symbol = 'definition'; t = ctx.target(rel, 'type'); }
      else if (k('ReferenceSubsetting')) { symbol = 'reference-subsetting'; t = ctx.target(rel, 'referencedFeature'); }
      else if (k('Redefinition')) { symbol = 'redefinition'; t = ctx.target(rel, 'redefinedFeature'); }
      else if (k('Subsetting')) { symbol = 'subsetting'; t = ctx.target(rel, 'subsettedFeature'); }
      // view の箱の expose は import の線にせず、expose の線か exposes の区画の行にする(GR12 P1 の裁定 Q5 の (b))
      else if (k('Import') && !k('Expose') && box.symbol !== 'imported-package-with-name-inside') {
        const inner = innerImport(ctx, rel);
        const recursive = inner.attrs.isRecursive === true;
        symbol = recursive ? 'recursive-import' : ctx.model.conforms(inner.kind, 'NamespaceImport') ? 'top-level-import' : 'import';
        t = ctx.model.conforms(inner.kind, 'MembershipImport') ? ctx.target(inner, 'importedMembership') : ctx.target(inner, 'importedNamespace');
      }
      if (!symbol || !t || !ctx.user(t)) continue;
      const tb = elBox.get(t);
      if (tb && tb.type === 'box' && tb !== box && tb !== region) {
        const e = { id: idOf(rel), symbol, el: rel, src: srcOf(rel), from: box.id, to: tb.id, label: '', markers: [] };
        if (symbol.endsWith('import')) {
          const vis = rel.attrs.visibility;
          e.label = `«${vis && vis !== 'public' ? vis + ' ' : ''}import»${symbol === 'top-level-import' ? '*' : symbol === 'recursive-import' ? '**' : ''}`;
        }
        edges.push(e);
      } else if (!tb && !lineOf.has(t) && !inScope(t)) noteOutside(EDGE_WORDS[symbol], t, rel);
    }
  }

  // ---- 依存(binary-dependency・n-ary-dependency)
  for (const { el } of pendingDeps) {
    const refs = [...ctx.refsOf(el, 'client'), ...ctx.refsOf(el, 'supplier')];
    const pick = (prop) => ctx.refsOf(el, prop).map((r) => (r.status === 'resolved' ? objOrLine(r.target) : null));
    const cs = pick('client'), ss = pick('supplier');
    if ([...cs, ...ss].some((x) => !x)) {
      const out = refs.find((r) => r.status === 'resolved' && ctx.user(r.target) && !objOrLine(r.target) && !inScope(r.target));
      if (out) noteOutside(EDGE_WORDS.dependency, out.target, el);
      else diag('info', 'edge-not-drawn', `${ctx.nameOf(el) ?? el.kind} を描いていない: 依存の端を図に描いていない`, el);
      continue;
    }
    const label = ctx.nameOf(el) ?? '';
    if (cs.length === 1 && ss.length === 1) { edges.push({ id: idOf(el), symbol: 'binary-dependency', el, src: srcOf(el), from: cs[0].id, to: ss[0].id, label, markers: [] }); continue; }
    const dot = reg({ id: idOf(el) + '.dot', type: 'dot', symbol: 'n-ary-association-dot', el, src: srcOf(el), parent: region?.id ?? null, label, members: [...cs, ...ss].map((o) => o.id) });
    cs.forEach((o, i) => edges.push({ id: `${idOf(el)}.c${i}`, symbol: 'n-ary-dependency-client-link', el, src: srcOf(el), from: o.id, to: dot.id, label: '', markers: [] }));
    ss.forEach((o, i) => edges.push({ id: `${idOf(el)}.s${i}`, symbol: 'n-ary-dependency-supplier-link', el, src: srcOf(el), from: dot.id, to: o.id, label: '', markers: [] }));
  }
  // ---- 注釈の線
  for (const { note, targets } of annotations) {
    targets.forEach((t, i) => {
      const o = t.el ? objOrLine(t.el) : null;
      if (!o) {
        if (t.el && ctx.user(t.el) && !inScope(t.el)) noteOutside(EDGE_WORDS.annotation, t.el, note.el);
        else diag('info', 'edge-not-drawn', `注釈の線を描いていない: 「${t.name ?? ''}」は図に描いていない`, note.el);
        return;
      }
      edges.push({ id: `${note.id}.a${i}`, symbol: 'annotation-link', el: note.el, src: note.src, from: note.id, to: o.id, label: '', markers: [] });
    });
  }
  // 描く範囲の外の相手への線(裁定 Q7): 線の種類と相手ごとに 1 件
  for (const { word, target, n, el } of outside.values()) diag('info', 'edge-out-of-scope', `${word}の線 ${n} 本を描いていない: 相手 ${pathOf(ctx, target)} は描く範囲の外`, el);

  edges.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const x of [...objects.values(), ...edges]) {
    if (!x.el || x.info) continue;
    x.info = { kind: x.el.kind, name: ctx.nameOf(x.el) ?? null, qname: pathOf(ctx, x.el) };
  }
  if (frame) frame.info = { kind: frame.el.kind, name: ctx.nameOf(frame.el) ?? null, qname: pathOf(ctx, frame.el) };
  return { objects, top, edges, diagnostics, frame, viewMode };
}

// src/view/diagram.js の headerOf が «» の行の終わりにする語(use case・message の前にあれば、そちらを使う)
const KIND_WORDS_GEN = new Set(['part', 'item', 'port', 'attribute', 'connection', 'interface', 'flow', 'constraint', 'requirement',
  'concern', 'view', 'viewpoint', 'enum', 'occurrence', 'action', 'state', 'calc', 'analysis', 'verification', 'allocation', 'metadata', 'rendering']);
// 字句の i 番目から始まる修飾名(NAME ('::' NAME)*)の次の位置
function afterQualifiedName(toks, i) {
  if (toks[i]?.kind !== 'NAME') return i;
  i++;
  while (toks[i]?.text === '::' && toks[i + 1]?.kind === 'NAME') i += 2;
  return i;
}
// 使用の接頭辞のキーワード(extended-usage の «» の行に入れるもの)
const USAGE_PREFIX = new Set(['ref', 'abstract', 'variation', 'readonly', 'derived', 'constant', 'end', 'in', 'out', 'inout', 'individual']);

// フィルター付きの import(import X::*[条件])は、条件を持つ無名のパッケージの中の import を使う
function innerImport(ctx, imp) {
  const pkg = imp.related.find((x) => ctx.model.conforms(x.kind, 'Package'));
  return pkg?.owned.find((c) => ctx.model.conforms(c.kind, 'Import')) ?? imp;
}
// import に書いた名前(裁定 Q2 の (a))。可視性と import を除き、名前空間の import の '::*' を除く(再帰の '::**' は残す)
function importName(ctx, imp) {
  const toks = ctx.declTokens(imp);
  const k = toks.findIndex((t) => t.kind === 'KEYWORD' && t.text === 'import');
  let rest = toks.slice(k + 1);
  if (rest[0]?.kind === 'KEYWORD' && rest[0].text === 'all') rest = rest.slice(1);
  return joinTokens(rest).replace(/::\*(?=$|::\*\*|\[)/, '');
}
