// 描く範囲の決定(GR4 指示書 5.1 節、設計書 5 章)。外部パッケージ・Node.js 固有の機能・DOM を使わない。
//
// listCandidates(ctx) → [{ id, kind: 'view' | 'part', label, el }]
//   テキストに view(ViewUsage)があれば、view を記述の順に並べる。なければ、部品・ポート・接続を所有する
//   PartDefinition・PartUsage を、入れ子のものも含めて記述の順に並べる(GR4 P2 の予定の裁定)。
// exposeScope(ctx, view) → { drawn: Set, exposedVia: Map(要素 → Set(経由した名前空間)), memberOnly: [要素],
//                            notReflected: [{ kind, el, text }] }
//   view の expose と filter から、描く要素を決める(裁定 Q18・Q19・Q23・Q24)。

import { walkTree } from '../parser/tree.js';
import { runNested } from './common.js';

export const PART_EXCLUDED = ['ConnectionDefinition', 'ConnectionUsage', 'ViewDefinition', 'ViewUsage', 'RenderingDefinition', 'RenderingUsage'];
const CONNECTION_KINDS = ['ConnectionUsage', 'BindingConnectorAsUsage', 'FlowUsage'];

export function isPartLike(ctx, e) {
  return ctx.isAny(e, ['PartDefinition', 'PartUsage']) && !ctx.isAny(e, PART_EXCLUDED);
}

// 要素の修飾名(名前のない要素は「(種類)」)
export function pathOf(ctx, e) {
  const parts = [];
  for (let x = e; x && ctx.parent.get(x); x = ctx.ownerOf(x)) parts.unshift(ctx.nameOf(x) ?? `(${x.kind})`);
  return parts.join('::');
}

export function listCandidates(ctx) {
  const views = [];
  const parts = [];
  walkTree(ctx.tree, (e) => {
    if (ctx.is(e, 'ViewUsage')) views.push(e);
    else if (isPartLike(ctx, e)) {
      const has = ctx.members(e).some(({ el }) => ctx.isAny(el, ['PartUsage', 'PortUsage', ...CONNECTION_KINDS]));
      if (has) parts.push(e);
    }
  }); // 明示のスタックでたどる(GR18 の B1)
  const list = views.length ? views.map((el) => ({ kind: 'view', el })) : parts.map((el) => ({ kind: 'part', el }));
  const seen = new Map();
  return list.map((c) => {
    const p = pathOf(ctx, c.el);
    const base = `${c.kind}:${p}`;
    const k = (seen.get(base) ?? 0) + 1;
    seen.set(base, k);
    const word = c.kind === 'view' ? 'view' : ctx.is(c.el, 'PartDefinition') ? 'part def' : 'part';
    return { id: k === 1 ? base : `${base}#${k}`, kind: c.kind, label: `${word} ${p}`, el: c.el };
  });
}

// view の型から、標準のビュー(SysML 2.0 の 9.2.20.2 節)を求める(GR6 指示書 6 章: 開いたときの最初の表示)。
// 型(FeatureTyping)が内蔵の StandardViewDefinitions の定義ならその名前、利用者のビューの定義なら、その上位の定義
// (Subclassification)をたどる。戻り値は 'state-transition'・'interconnection'・'action-flow'・'general'・'sequence'・'grid' か null
// GR13 で、内蔵する表に足した GridView(SysML 2.0 の 9.2.20.2.5 節)を、グリッドビュー 'grid'(4 つの表を出す)として見分ける(GR13 指示書 6 章、追加の直し その 2)
const STANDARD_VIEWS = { StateTransitionView: 'state-transition', InterconnectionView: 'interconnection', ActionFlowView: 'action-flow', GeneralView: 'general', SequenceView: 'sequence', GridView: 'grid' };
export function standardViewOf(ctx, view) {
  const seen = new Set();
  const fromType = (t) => {
    if (!t || seen.has(t)) return null;
    seen.add(t);
    if (t.builtin) { const m = /^StandardViewDefinitions::(\w+)$/.exec(t.qname ?? ''); return m ? STANDARD_VIEWS[m[1]] ?? null : null; }
    if (!ctx.is(t, 'ViewDefinition')) return null;
    for (const c of t.owned) if (ctx.model.conforms(c.kind, 'Subclassification')) { const k = fromType(ctx.target(c, 'superclassifier')); if (k) return k; }
    return null;
  };
  for (const t of ctx.typesOf(view)) { const k = fromType(t); if (k) return k; }
  return null;
}

// ---- filter の条件の評価(裁定 Q23・Q24、設計書 5 章: @種類名 と @利用者の注釈 の形だけ反映する)
// 戻り値 true・false・null(反映しない形)
export function evalCondition(ctx, expr, el) {
  if (!expr || !ctx.is(expr, 'OperatorExpression') || expr.attrs.operator !== '@') return null;
  const params = expr.owned.filter((c) => ctx.model.conforms(c.kind, 'ParameterMembership') && !ctx.model.conforms(c.kind, 'ReturnParameterMembership')).map((c) => c.related[0]);
  if (params.length !== 1 || !params[0]) return null;
  // 被演算子のない分類の式(@T)だけを反映する。被演算子が名前の参照などなら反映しない
  const typing = params[0].owned.find((c) => ctx.model.conforms(c.kind, 'FeatureTyping'));
  if (!typing || !ctx.is(params[0], 'Feature') || ctx.model.conforms(params[0].kind, 'Expression')) return null;
  const r = ctx.ref(typing, 'type');
  if (!r || r.status !== 'resolved') return null;
  const t = r.target;
  // @種類名: 要素の種類がメタクラスに適合すれば通す(metaclassFeature を条件を当てる相手に含める。裁定 Q23)
  if (t.builtin && t.metaclass) return !el.builtin && !el.virtual && ctx.model.conforms(el.kind, t.metaclass);
  // @利用者の注釈: 要素が所有するメタデータ(MetadataUsage)の型が t か、その下位の定義
  if (ctx.is(t, 'MetadataDefinition')) {
    if (!ctx.user(el)) return false;
    for (const { el: m } of ctx.members(el)) {
      if (!ctx.is(m, 'MetadataUsage')) continue;
      for (const ty of ctx.typesOf(m)) if (specializes(ctx, ty, t)) return true;
    }
    return false;
  }
  return null;
}

// 定義の特殊化(Subclassification)をたどって、a が b か、その下位か
export function specializes(ctx, a, b, seen = new Set()) {
  if (a === b) return true;
  if (!ctx.user(a) || seen.has(a)) return false;
  seen.add(a);
  for (const c of a.owned) {
    if (!ctx.model.conforms(c.kind, 'Subclassification')) continue;
    const g = ctx.target(c, 'superclassifier');
    if (g && specializes(ctx, g, b, seen)) return true;
  }
  return false;
}

// view の filter の条件: view が所有するものと、型にしたビューの定義(利用者のモデル)から受け継いだもの
function viewConditions(ctx, view) {
  const out = [];
  const seen = new Set();
  const take = (ns) => {
    if (!ctx.user(ns) || seen.has(ns)) return;
    seen.add(ns);
    for (const rel of ns.owned) if (ctx.model.conforms(rel.kind, 'ElementFilterMembership') && rel.related[0]) out.push({ rel, expr: rel.related[0], owner: ns });
    for (const c of ns.owned) {
      if (ctx.model.conforms(c.kind, 'FeatureTyping')) { const t = ctx.target(c, 'type'); if (ctx.is(t, 'ViewDefinition')) take(t); }
      else if (ctx.model.conforms(c.kind, 'Subclassification')) { const t = ctx.target(c, 'superclassifier'); if (ctx.is(t, 'ViewDefinition')) take(t); }
    }
  };
  take(view);
  return out;
}

// 名前空間の見えるメンバー(KerML 8.3.2.4.5 visibleMemberships。expose は可視性によらない。所有するもの・
// import で取り込んだもの・型なら受け継いだものを含む。GR4 P2 の裁定 Q19 と 2 回目の裁定 1)
// 戻り値 [{ el, via }]。via はそのメンバーを見せている名前空間。再帰は、所有する名前空間をたどる
// (名前解決の visibleEntries の再帰と同じ)
// 入れ子の名前空間は明示のスタックで回す(GR27 の R。並びは前の再帰と同じ)
function exposedMembersOf(ctx, ns, recursive) { return runNested(exposedMembersGen(ctx, ns, recursive, new Set())); }
function* exposedMembersGen(ctx, ns, recursive, seen) {
  const out = [];
  if (!ctx.user(ns) || seen.has(ns)) return out;
  seen.add(ns);
  const isFilter = (el) => { const r = ctx.owningRel(el); return r && ctx.model.conforms(r.kind, 'ElementFilterMembership'); };
  for (const m of ctx.model.visibleMembershipsOf(ns, { includeAll: true }).members) if (ctx.user(m.element) && !isFilter(m.element)) out.push({ el: m.element, via: ns });
  if (recursive) for (const { el } of ctx.members(ns)) if (ctx.model.conforms(el.kind, 'Namespace')) { const sub = yield exposedMembersGen(ctx, el, true, seen); for (const x of sub) out.push(x); }
  return out;
}

export function exposeScope(ctx, view) {
  const exposed = []; // [{ el, via }]
  const notReflected = [];
  const memberOnly = [];
  for (const exp of view.owned) {
    if (!ctx.model.conforms(exp.kind, 'Expose')) continue;
    // フィルター付きの expose(expose X::**[条件])は、条件を持つ無名のパッケージの import として書かれる
    const pkg = exp.related.find((x) => ctx.model.conforms(x.kind, 'Package'));
    const imports = pkg ? pkg.owned.filter((c) => ctx.model.conforms(c.kind, 'Import')) : [exp];
    const conds = pkg ? pkg.owned.filter((c) => ctx.model.conforms(c.kind, 'ElementFilterMembership')).map((c) => c.related[0]) : [];
    for (const imp of imports) {
      let got = [];
      const rec = imp.attrs.isRecursive === true;
      const tgt = ctx.model.conforms(imp.kind, 'MembershipImport') ? ctx.target(imp, 'importedMembership') : ctx.target(imp, 'importedNamespace');
      if (!ctx.user(tgt)) notReflected.push({ kind: 'expose-unresolved', el: exp });
      if (ctx.model.conforms(imp.kind, 'MembershipImport')) {
        const t = ctx.target(imp, 'importedMembership');
        if (ctx.user(t)) {
          got.push({ el: t, via: null });
          if (rec) got.push(...exposedMembersOf(ctx, t, true));
          else if (!pkg) memberOnly.push(t);
        }
      } else if (ctx.model.conforms(imp.kind, 'NamespaceImport')) {
        const t = ctx.target(imp, 'importedNamespace');
        if (ctx.user(t)) got.push(...exposedMembersOf(ctx, t, rec));
      }
      for (const c of conds) {
        const vals = got.map((g) => evalCondition(ctx, c, g.el));
        if (vals.some((v) => v === null)) { notReflected.push({ kind: 'expose-filter', el: c }); continue; }
        got = got.filter((g, i) => vals[i]);
      }
      exposed.push(...got);
    }
  }
  // view(と型にしたビューの定義)の filter
  const conds = viewConditions(ctx, view);
  const reflected = [];
  for (const c of conds) {
    const probe = exposed.length ? evalCondition(ctx, c.expr, exposed[0].el) : evalCondition(ctx, c.expr, view);
    if (probe === null) notReflected.push({ kind: 'filter', el: c.expr });
    else reflected.push(c.expr);
  }
  const exposedVia = new Map();
  const drawn = new Set();
  for (const { el, via } of exposed) {
    if (!reflected.every((c) => evalCondition(ctx, c, el) === true)) continue;
    drawn.add(el);
    if (!exposedVia.has(el)) exposedVia.set(el, new Set());
    exposedVia.get(el).add(via);
  }
  for (const rel of view.owned) if (ctx.model.conforms(rel.kind, 'ViewRenderingMembership')) notReflected.push({ kind: 'render', el: rel });
  return { drawn, exposedVia, memberOnly, notReflected };
}
