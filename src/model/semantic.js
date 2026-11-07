// 意味エラーの検査(GR5 指示書 6 章、設計書 9.2 節)。外部パッケージと Node.js 固有の機能を使わない。
//
// checkSemantics(tree, model, text) → [{ item, section, constraint, start, end, line, col, message }]
//   tree   src/parser の構文木(parse(text).tree)
//   model  src/model/resolve.js の resolveNames(tree, text) の結果
//   text   原文(行と列を求めるのに使う)
//   item        項目の番号(S1〜S4、T1〜T3、U1、U4〜U6。T4 は GR5 P1 の裁定 Q1 で検査しない)
//   section     本文の根拠の節('KerML 1.0 8.2.3.5.1' など)。constraint は制約の名前(名前のない S1・S3 は null)
//   start, end  原文の範囲。line, col は start の行と列(1 から数える。行末は LF・CR LF・CR)
//   message     利用者向けの日本語のメッセージ
// 並びは start の順(同じなら項目の順)。
//
// 標準ライブラリがないと判定できない場合は判定しない(設計書 9.2 節)。D3 の印の付いた参照は解決済みとして扱う。
// 項目ごとの判定の条件は、各関数の前の注釈と reports/GR5/P3_impl_*.md に書く。

import { makeImplicitSources } from './ends.js';
import { walkTree } from '../parser/tree.js';

// GR17 の U(GR17 指示書 3.4 節、設計書 9.2 節): U5・U6 で、始点を省いた遷移の始点を、設計書 7.8 節の描画の規則と同じ求め方
// (src/model/ends.js の makeImplicitSources)で求めて判定に使う。false なら GR16 の終わりと同じ(始点を省いた遷移は判定しない)。
// checkSemantics の opts.implicitSources で 1 回だけ変えられる(比べの道具が使う)
export const SEMANTIC17 = { U: true };
const ITEM_ORDER = ['S1', 'S2', 'S3', 'S4', 'T1', 'T2', 'T3', 'U1', 'U4', 'U5', 'U6'];

const RULES = {
  S1: { section: 'KerML 1.0 8.2.3.5.1', constraint: null },
  S2: { section: 'KerML 1.0 8.3.2.4.5', constraint: 'validateNamespaceDistinguishibility' },
  S3: { section: 'KerML 1.0 8.2.3.5.1', constraint: null },
  S4: { section: 'KerML 1.0 8.3.2.4.2', constraint: 'validateImportTopLevelVisibility' },
  T1: { section: 'KerML 1.0 8.3.3.1.10', constraint: 'validateTypeAtMostOneConjugator' },
  T2: { section: 'KerML 1.0 8.3.3.3.8', constraint: 'validateRedefinitionDirectionConformance' },
  T3: { section: 'KerML 1.0 8.3.3.3.8', constraint: 'validateRedefinitionEndConformance' },
  U1: { section: 'SysML 2.0 8.3.6.5', constraint: 'validateVariantMembershipOwningNamespace' },
  U4d: { section: 'SysML 2.0 8.3.12.5', constraint: 'validatePortDefinitionOwnedUsagesNotComposite' },
  U4u: { section: 'SysML 2.0 8.3.12.6', constraint: 'validatePortUsageNestedUsagesNotComposite' },
  U5: { section: 'SysML 2.0 8.3.18.6', constraint: 'validateStateUsageParallelSubactions' },
  U6: { section: 'SysML 2.0 8.3.18.9', constraint: 'validateTransitionUsageTriggerActions' },
};

// opts.s2Elements(要素の Set)と opts.s2Pairs(配列)を渡すと、S2 の判定のうち、その要素のどれかと、同じ名前空間のほかのメンバーの
// 区別できない組を opts.s2Pairs に入れる({ ns, element, other })。opts.s2Only なら S2 だけを判定する(GR18 の E1。図からの編集が、
// 名前を変える要素・足す要素とほかのメンバーの組ごとに判定するのに使う。設計書 8 章)
export function s2PairsOf(tree, model, text, elements) {
  const pairs = [];
  checkSemantics(tree, model, text, { s2Elements: elements, s2Pairs: pairs, s2Only: true });
  return pairs;
}

export function checkSemantics(tree, model, text, opts = {}) {
  const conforms = model.conforms;
  const out = [];

  // ---- 構造
  const parent = new Map();
  const all = [];
  // GR20 の M: 複数のファイルをまとめた仮の根(src/model/files.js)なら、ファイルごとの根の名前空間をたどる
  for (const root of tree.forestRoots ?? [tree]) walkTree(root, (e, p) => {
    parent.set(e, p);
    all.push(e);
  }); // 明示のスタックでたどる(GR18 の B1)
  const recsOf = new Map(); // 構文木の要素 → 属性名 → [参照]
  for (const r of model.refs) {
    if (!recsOf.has(r.node)) recsOf.set(r.node, new Map());
    const m = recsOf.get(r.node);
    if (!m.has(r.prop)) m.set(r.prop, []);
    m.get(r.prop).push(r);
  }
  const recFor = (node, prop) => recsOf.get(node)?.get(prop)?.[0] ?? null;
  const targetOf = (node, prop) => { const r = recFor(node, prop); return r && r.status === 'resolved' ? r.target : null; };
  const isUser = (e) => !!e && !e.builtin && !e.virtual;
  const owningRel = (e) => parent.get(e) ?? null;
  // 特徴を所有する型(KerML 8.3.3.3.4 owningType: FeatureMembership で所有されるときの持ち主)
  const owningTypeOf = (f) => {
    if (!isUser(f)) return null;
    const rel = owningRel(f);
    if (!rel || !conforms(rel.kind, 'FeatureMembership')) return null;
    const o = parent.get(rel);
    return o && conforms(o.kind, 'Type') ? o : null;
  };
  const isEnd = (f) => isUser(f) && (f.attrs?.isEnd === true || (owningRel(f) && conforms(owningRel(f).kind, 'EndFeatureMembership')));
  const ownedOfKind = (e, k) => e.owned.filter(c => conforms(c.kind, k));
  // 特徴の連鎖の要素なら最後の連鎖の特徴(KerML 8.3.3.3.4 featureTarget)。求まらなければ null
  const featureTarget = (f) => {
    if (!f || !isUser(f)) return f;
    const ch = ownedOfKind(f, 'FeatureChaining');
    if (ch.length) return targetOf(ch[ch.length - 1], 'chainingFeature');
    return f;
  };
  // 再定義の関係の、再定義される特徴(名前の参照なら解決先、連鎖なら featureTarget)。求まらなければ null
  const redefinedOf = (rd) => {
    if (recFor(rd, 'redefinedFeature')) return targetOf(rd, 'redefinedFeature');
    const ch = rd.related.find(x => conforms(x.kind, 'Feature'));
    return ch ? featureTarget(ch) : null;
  };
  const push = (item, rule, node, start, end, message) => {
    out.push({ item, section: RULES[rule].section, constraint: RULES[rule].constraint, start, end, ...lineColOf(text, start), message });
  };
  const nameOf = (e) => { const n = model.namesOf(e); return n?.name ?? n?.shortName ?? null; };
  const q = (s) => s == null ? '(名前なし)' : `「${s}」`;

  // ---- S1・S3(KerML 1.0 8.2.3.5.1、kerml10.txt 5499〜5500 行)
  // S1: 修飾名の 2 番目以降の区切りが、ある名前空間で見つからず(名前解決の理由 not-found-known)、しかも探した経路の
  //     どの名前空間も、暗黙の特殊化・対象のわからない import・評価できないフィルター条件を持たず、利用者のモデルの
  //     名前空間であるとき。単純な名前と修飾名の最初の区切り(`$::` の後を含む)は、大域の名前空間に標準ライブラリの
  //     名前があるので S1 にしない(GR5 P2 の裁定 Q6)
  // S3: 解決済み(D3 の印付きを含む)で、解決先の種類が文脈で期待される種類に適合しない(名前解決の kindMismatch)
  for (const r of opts.s2Only ? [] : model.refs) {
    if (r.start == null) continue;
    if (r.status === 'resolved' && r.kindMismatch) {
      push('S3', 'S3', r.node, r.start, r.end,
        `${q(r.text.replace(/\s+/g, ''))}は ${r.target.kind} に解決したが、ここには ${r.kindMismatch} が要る`);
      continue;
    }
    if (r.status !== 'unchecked' || r.reason !== 'not-found-known') continue;
    const i = r.segments.findIndex(s => !s.target);
    if (i < 1) continue;
    if (model.searchShadowOf(r)) continue;
    let known = true;
    for (let j = 0; j < i; j++) {
      const ns = r.segments[j].target;
      if (!isUser(ns)) { known = false; break; }
      // 型はいつも暗黙の特殊化(標準ライブラリの型)を持つ(設計書 9.2 節の S1 の条件)。標準ライブラリの索引を使っても判定しない
      // (GR17 の L。索引を使わないときは、型はいつも中身のわからない理由を持つので、結果は同じ)
      if (conforms(ns.kind, 'Type')) { known = false; break; }
      if (model.visibleMembershipsOf(ns).unknown.length) { known = false; break; }
    }
    if (!known) continue;
    const owner = r.segments[i - 1].target;
    push('S1', 'S1', r.node, r.start, r.end,
      `名前${q(r.segments[i].name)}が${q(nameOf(owner))}の中に見つからない`);
  }

  // ---- S2(KerML 1.0 8.3.2.4.5 validateNamespaceDistinguishibility、8.3.2.4.3 isDistinguishableFrom)
  // 名前空間ごとに、所有の Membership と受け継いだ Membership(再定義された特徴を除く)を比べる。import で取り込んだ
  // ものは、区別できないものが取り込まれない(importedMemberships の説明、kerml10.txt 8284〜8286 行。裁定 Q3)ので比べない。
  // 受け継いだ要素が内蔵する表の項目(標準ライブラリ)なら比べない。区別できる: 要素の種類が互いに適合しない、または
  // 短い名前・名前がどちらも相手の短い名前・名前と違う(null は比べない)。
  // 所有の Membership が区別できなければ、その要素(別名ならその Membership)に出す。受け継いだものどうしなら名前空間に出す
  const distinguishable = (a, b) => {
    if (!(conforms(a.element.kind, b.element.kind) || conforms(b.element.kind, a.element.kind))) return true;
    const ok = (x) => x == null || (x !== b.shortName && x !== b.name);
    return ok(a.shortName) && ok(a.name);
  };
  // 受け継いだものと比べるのは、両方の要素の再定義の先(たどれる限り)がすべて求まるときだけ。再定義の先が求まらない
  // (未検査・曖昧)なら、その要素が受け継いだ Membership から除かれるかどうか(removeRedefinedFeatures)がわからない
  const redefKnownCache = new Map();
  const redefKnown = (x, seen = new Set()) => {
    if (!isUser(x) || !conforms(x.kind, 'Feature')) return true;
    if (redefKnownCache.has(x)) return redefKnownCache.get(x);
    if (seen.has(x)) return true;
    seen.add(x);
    let ok = true;
    for (const rd of ownedOfKind(x, 'Redefinition')) {
      const g = redefinedOf(rd);
      if (!g || !redefKnown(g, seen)) { ok = false; break; }
    }
    redefKnownCache.set(x, ok);
    return ok;
  };
  for (const ns of all) {
    if (!conforms(ns.kind, 'Namespace')) continue;
    const ms = model.ownedAndInheritedMembershipsOf(ns).members.filter(m => !m.element.builtin);
    if (ms.length < 2) continue;
    const reportedPair = new Set();
    let inheritedClash = null;
    // 区別できない組は、名前か短い名前が同じものだけなので、名前ごとの組に限って比べる(GR18 の M3。比べる順は前と同じ)
    const byName = new Map();
    ms.forEach((m, i) => { for (const n of [m.name, m.shortName]) if (n != null) { let l = byName.get(n); if (!l) byName.set(n, l = []); if (l[l.length - 1] !== i) l.push(i); } });
    for (let x = 0; x < ms.length; x++) {
      const a = ms[x];
      const ys = [...new Set([...(a.name != null ? byName.get(a.name) : []), ...(a.shortName != null ? byName.get(a.shortName) : [])])].sort((p, r) => p - r);
      for (const y of ys) {
        if (x === y) continue;
        const b = ms[y];
        if (distinguishable(a, b) && distinguishable(b, a)) continue;
        if ((!a.owned || !b.owned) && !(redefKnown(a.element) && redefKnown(b.element))) continue;
        if (opts.s2Pairs && opts.s2Elements.has(a.element)) opts.s2Pairs.push({ ns, element: a.element, other: b.element });
        if (a.owned) { reportedPair.add(x); break; }
        if (!b.owned && !inheritedClash) inheritedClash = { a, b };
      }
    }
    for (const x of [...reportedPair].sort((p, r) => p - r)) {
      const a = ms[x];
      const node = a.membership && !conforms(a.membership.kind, 'OwningMembership') ? a.membership : a.element;
      if (!isUser(node) || node.end <= node.start) continue;
      push('S2', 'S2', node, node.start, node.end,
        `${q(a.name ?? a.shortName)}は、${q(nameOf(ns))}のほかのメンバー(受け継いだものを含む)と区別できない`);
    }
    if (inheritedClash && isUser(ns) && ns.end > ns.start) {
      push('S2', 'S2', ns, ns.start, ns.end,
        `${q(nameOf(ns))}が受け継いだ${q(inheritedClash.a.name ?? inheritedClash.a.shortName)}どうしが区別できない`);
    }
  }

  if (opts.s2Only) return out;

  // ---- S4(KerML 1.0 8.3.2.4.2 validateImportTopLevelVisibility)
  // 根の名前空間が所有する import に public・protected が明示されている(可視性を省いた import は構文エラー。P2 の裁定)
  for (const imp of (tree.forestRoots ?? [tree]).flatMap(t => t.owned)) {
    if (!conforms(imp.kind, 'Import')) continue;
    const v = imp.attrs.visibility;
    if (v === 'public' || v === 'protected') push('S4', 'S4', imp, imp.start, imp.end, `最上位の import は private にする(${v} になっている)`);
  }

  // ---- T1(KerML 1.0 8.3.3.1.10 validateTypeAtMostOneConjugator)
  for (const t of all) {
    if (!conforms(t.kind, 'Type') || t.end <= t.start) continue;
    if (ownedOfKind(t, 'Conjugation').length > 1) push('T1', 'T1', t, t.start, t.end, `${q(nameOf(t))}が共役の関係を 2 つ以上持つ`);
  }

  // ---- T2(KerML 1.0 8.3.3.3.8 validateRedefinitionDirectionConformance、directionOf は 8.3.3.1.10 節)
  // 再定義する特徴 f を所有する型 O から見た、再定義される特徴 g の向き directionOf(O, g) を求める。
  //   g の持ち主が O なら g の向き。そうでなければ O の直接の上位の型を順にたどり、最初に求まった向き。O が共役の型なら、
  //   上位の型は元の型だけで、in と out を入れ替える。
  //   上位の型が求まらない(未検査・曖昧)ところに、向きが求まる前に出たら判定しない。内蔵する表の項目は利用者の
  //   特徴を持たないので、向きは求まらない(null)として先へ進む。
  // 向きが in・out で f の向きが違う、または inout で f が向きを持たないときエラー。
  // 対象: 明示の再定義(g が利用者のモデルの特徴)、暗黙の再定義(model.impliedRedefinitionsOf)。f が連鎖の特徴か、
  // 型に所有されない特徴か、流れの端の特徴か、呼び出しの式の引数なら判定しない
  const UNKNOWN = Symbol('unknown');
  const isConjugated = (t) => t.virtual ? true : ownedOfKind(t, 'Conjugation').length > 0;
  const directionOf = (t, g, excluded) => {
    if (!t || t.builtin) return null;
    if (isUser(t) && owningTypeOf(g) === t) return g.attrs.direction ?? null;
    const ex = new Set(excluded); ex.add(t);
    let sups = model.generalTypesOf(t);
    const conj = isConjugated(t);
    if (conj && !t.virtual) {
      const c = ownedOfKind(t, 'Conjugation')[0];
      const orig = targetOf(c, 'originalType') ?? (c.related.find(x => conforms(x.kind, 'Feature')) ? featureTarget(c.related.find(x => conforms(x.kind, 'Feature'))) : null);
      sups = [orig];
    }
    let d = null;
    for (const s of sups) {
      if (s === null) return UNKNOWN;
      if (ex.has(s)) continue;
      const x = directionOf(s, g, ex);
      if (x === UNKNOWN) return UNKNOWN;
      if (x != null) { d = x; break; }
    }
    if (d == null || !conj) return d;
    return d === 'in' ? 'out' : d === 'out' ? 'in' : d;
  };
  const checkDirection = (f, g, node, start, end) => {
    const O = owningTypeOf(f);
    if (!O || ownedOfKind(f, 'FeatureChaining').length) return;
    // 流れの端の特徴(FlowFeature)の向きは、再定義される特徴の、持ち主の流れの端から見た向きに設定する
    // (KerML 1.0 8.2.5.9.2 節の注 1、kerml10.txt 6803〜6807 行)ので、この制約に反しない
    if (conforms(O.kind, 'FlowEnd')) return;
    // 呼び出しの式の引数(名前付きの引数を含む)は判定しない。本文の文法では引数は向きを持たない(kerml10.txt 6685〜6690 行)
    // が、validateParameterMembershipParameterDirection は向きを求めていて、食い違うため(GR5 P3 の裁定 Q7)
    if (conforms(O.kind, 'InvocationExpression')) return;
    const d = directionOf(O, g, new Set());
    if (d === UNKNOWN || d == null) return;
    const fd = f.attrs.direction ?? null;
    if (((d === 'in' || d === 'out') && fd !== d) || (d === 'inout' && fd == null)) {
      push('T2', 'T2', node, start, end,
        `${q(nameOf(g))}の向きは ${d} なので、再定義する特徴も ${d === 'inout' ? '向き(in・out・inout)を持つ' : d + ' にする'}(${fd == null ? '向きがない' : fd + ' になっている'})`);
    }
  };
  for (const f of all) {
    if (!isUser(f) || !conforms(f.kind, 'Feature')) continue;
    const explicit = [];
    for (const rd of ownedOfKind(f, 'Redefinition')) {
      const g = redefinedOf(rd);
      if (!isUser(g)) continue;
      explicit.push(g);
      checkDirection(f, g, rd, rd.start, rd.end);
      // T3(KerML 1.0 8.3.3.3.8 validateRedefinitionEndConformance): 再定義される特徴が利用者のモデルの端で、再定義する特徴が端でない
      if (isEnd(g) && !isEnd(f)) push('T3', 'T3', rd, rd.start, rd.end, `端の特徴${q(nameOf(g))}を再定義する特徴は、端(end)にする`);
    }
    if (f.end <= f.start) continue;
    for (const g of model.impliedRedefinitionsOf(f)) {
      if (!isUser(g) || explicit.includes(g)) continue;
      checkDirection(f, g, f, f.start, f.end);
    }
  }

  // ---- U1(SysML 2.0 8.3.6.5 validateVariantMembershipOwningNamespace)
  // variant を所有する定義・使用が variation でない。列挙の定義は、意味の上では variation とみなす(SysML 2.0 8.3.8.2 節、
  // sysml20.txt 17415〜17440 行の isVariation {redefines isVariation})
  for (const vm of all) {
    if (!conforms(vm.kind, 'VariantMembership')) continue;
    const o = parent.get(vm);
    if (!o) continue;
    const variation = (conforms(o.kind, 'Definition') || conforms(o.kind, 'Usage')) && (o.attrs.isVariation === true || conforms(o.kind, 'EnumerationDefinition'));
    if (!variation) push('U1', 'U1', vm, vm.start, vm.end, `variant を持てるのは variation の定義・使用だけ(${q(nameOf(o))}は variation でない)`);
  }

  // ---- U4(SysML 2.0 8.3.12.5 validatePortDefinitionOwnedUsagesNotComposite、8.3.12.6 validatePortUsageNestedUsagesNotComposite)
  // ポートの定義・使用が FeatureMembership で所有する、ポートでない使用が合成のとき。参照(合成でない)とみなすのは、
  // ref を書いたもの、向きのあるもの、端、属性の使用、参照の使用、イベントの使用(perform・exhibit・include を含む)。
  // 根拠は reports/GR5/P3_impl_*.md の表
  const isReferential = (u) =>
    u.attrs.isReference === true || u.attrs.direction != null || isEnd(u)
    || conforms(u.kind, 'AttributeUsage') || conforms(u.kind, 'ReferenceUsage') || conforms(u.kind, 'EventOccurrenceUsage');
  for (const p of all) {
    const isDef = conforms(p.kind, 'PortDefinition') && !conforms(p.kind, 'ConjugatedPortDefinition');
    const isUse = conforms(p.kind, 'PortUsage');
    if (!isDef && !isUse) continue;
    for (const fm of p.owned) {
      if (!conforms(fm.kind, 'FeatureMembership')) continue;
      const u = fm.related[0];
      if (!u || !conforms(u.kind, 'Usage') || conforms(u.kind, 'PortUsage') || u.end <= u.start) continue;
      if (isReferential(u)) continue;
      push('U4', isDef ? 'U4d' : 'U4u', u, u.start, u.end,
        `ポートの${isDef ? '定義' : '使用'}${q(nameOf(p))}の中の${q(nameOf(u))}は合成にできない(ref を付けるなど、参照にする)`);
    }
  }

  // ---- U5・U6: 遷移の始点・終点(SysML 2.0 8.3.18.9 source・target。sysml20.txt 21207・21217 行)
  // 始点: 遷移が FeatureMembership でない Membership で所有する特徴のうち、featureTarget が ActionUsage である最初のもの
  // (sourceFeature、sysml20.txt 21232〜21234 行)。名前の参照なら解決先、連鎖なら featureTarget。その前に解決できない
  // 特徴があれば、始点は求まらない(null)。
  // 終点: 遷移の継承(Succession)の 2 番目の端の参照の部分集合の先。求まらないものは null
  // 始点を省いた遷移の始点(GR17 の U)。始点を書いた遷移は undefined
  const implicitSource = (opts.implicitSources ?? SEMANTIC17.U) ? makeImplicitSources(tree, model) : null;
  const sourceOf = (tu) => {
    if (implicitSource) { const s = implicitSource(tu); if (s !== undefined) return s; }
    for (const m of tu.owned) {
      if (!conforms(m.kind, 'Membership') || conforms(m.kind, 'FeatureMembership')) continue;
      let t;
      if (recFor(m, 'memberElement')) t = targetOf(m, 'memberElement');
      else {
        const f = m.related.find(x => conforms(x.kind, 'Feature'));
        if (!f) continue;
        if (conforms(f.kind, 'Succession')) continue;
        t = featureTarget(f);
      }
      if (!t) return null;
      if (!t.builtin && !t.virtual && !conforms(t.kind, 'Feature')) continue;
      if (t.builtin || conforms(t.kind, 'ActionUsage')) return t;
    }
    return null;
  };
  const targetOfTransition = (tu) => {
    for (const m of tu.owned) {
      const s = m.related.find(x => conforms(x.kind, 'Succession'));
      if (!s) continue;
      const ends = ownedOfKind(s, 'EndFeatureMembership').map(e => e.related[0]).filter(Boolean);
      const e = ends[1];
      const rs = e && ownedOfKind(e, 'ReferenceSubsetting')[0];
      if (!rs) return null;
      if (recFor(rs, 'referencedFeature')) return targetOf(rs, 'referencedFeature');
      const ch = rs.related.find(x => conforms(x.kind, 'Feature'));
      return ch ? featureTarget(ch) : null;
    }
    return null;
  };
  // 並行状態(StateUsage で parallel)の入れ子のアクション(nestedAction)→ その並行状態
  const parallelOf = (a) => {
    if (!isUser(a) || !conforms(a.kind, 'ActionUsage')) return null;
    const rel = owningRel(a);
    if (!rel || !conforms(rel.kind, 'FeatureMembership')) return null;
    const s = parent.get(rel);
    return s && conforms(s.kind, 'StateUsage') && s.attrs.isParallel === true ? s : null;
  };
  for (const tu of all) {
    if (!conforms(tu.kind, 'TransitionUsage')) continue;
    const src = sourceOf(tu);
    // U5(SysML 2.0 8.3.18.6 validateStateUsageParallelSubactions): 始点か終点が並行状態の入れ子のアクション。
    // 並行状態の外が所有する遷移も数える(GR5 P2 の裁定 Q4)
    if (tu.end > tu.start) {
      const tgt = targetOfTransition(tu);
      const ps = parallelOf(src) ?? parallelOf(tgt);
      if (ps) push('U5', 'U5', tu, tu.start, tu.end, `並行状態${q(nameOf(ps))}の中の状態・アクションは、遷移の始点・終点にできない`);
    }
    // U6(SysML 2.0 8.3.18.9 validateTransitionUsageTriggerActions): 始点が利用者のモデルの要素で StateUsage に適合せず、
    // 引き金を持つ。始点が内蔵する表の項目なら判定しない(GR5 P2 の裁定 Q5)
    const trig = tu.owned.find(c => conforms(c.kind, 'TransitionFeatureMembership') && c.attrs.kind === 'trigger');
    if (trig && isUser(src) && !conforms(src.kind, 'StateUsage') && trig.end > trig.start) {
      push('U6', 'U6', trig, trig.start, trig.end, `始点${q(nameOf(src))}が状態でない遷移は、引き金(accept)を持てない`);
    }
  }

  out.sort((a, b) => a.start - b.start || ITEM_ORDER.indexOf(a.item) - ITEM_ORDER.indexOf(b.item) || a.end - b.end);
  return out;
}

// 原文の位置の行と列(1 から数える)。行末は LF・CR LF・CR。先頭の BOM は数えない(src/parser/index.js と同じ)。警告の検査(src/model/warn.js)も使う
export function lineColOf(text, offset) {
  let line = 1, col = 1;
  if (text == null) return { line: null, col: null };
  for (let i = text.charCodeAt(0) === 0xfeff ? 1 : 0; i < offset; i++) {
    const c = text.charCodeAt(i);
    if (c === 0x0d) { if (text.charCodeAt(i + 1) === 0x0a) i++; line++; col = 1; }
    else if (c === 0x0a) { line++; col = 1; }
    else col++;
  }
  return { line, col };
}
