// 始点を省いた遷移の始点(GR17 の U。GR17 指示書 3.4 節、設計書 7.8 節・9.2 節)。外部パッケージ・Node.js 固有の機能・DOM を使わない。
//
// 設計書 7.8 節の描画の規則(src/view/ends.js の transitionEnds・implicitTransitionSource・implicitSuccessionSource・
// implicitTransitionForm。GR6 P2 の裁定 Q18・Q21、P2 の確認の後の裁定 3・4)と同じ求め方を、名前解決の結果(model)だけで行う。
// 描画は src/view/ends.js のまま変えない。同じ結果になることは tools/model/gr17_ends_compare.mjs で 309 ファイルと例について確かめる。
//
// makeImplicitSources(tree, model) → implicitSource(tu)
//   tu は TransitionUsage。始点を省いた書き方(始点の Membership がない)なら、7.8 節の規則で求めた始点(求まらなければ null)。
//   始点を書いた遷移には undefined を返す(呼び出し側が、書いた始点を使う)
//     accept … then …(TargetTransitionUsage)の始点: 持ち主が直接持つメンバーをさかのぼり、最も近い状態の使用か entry の行動
//     if g then x;・else x;・entry; if c then x; の始点: 持ち主が直接持つメンバーをさかのぼり、最も近いオカレンスの使用。
//       パラメーター・遷移・コネクター(端を持たないメッセージの流れを除く)は飛ばす。first X; で参照した要素は種類を見ずに採る。
//       内蔵の start・done はアクションとして扱う

import { walkTree } from '../parser/tree.js';

export function makeImplicitSources(tree, model) {
  const conforms = model.conforms;
  const parent = new Map();
  // GR20 の M: 複数のファイルをまとめた仮の根(src/model/files.js)なら、ファイルごとの根の名前空間をたどる
  for (const root of tree.forestRoots ?? [tree]) walkTree(root, (e, p) => { parent.set(e, p); }); // 明示のスタックでたどる(GR18 の B1)
  const recs = new Map();
  for (const r of model.refs) { if (!recs.has(r.node)) recs.set(r.node, {}); (recs.get(r.node)[r.prop] ??= []).push(r); }
  const target = (node, prop) => { const r = recs.get(node)?.[prop]?.[0]; return r && r.status === 'resolved' ? r.target : null; };
  const conf = (e, k) => !!e && conforms(e.kind, k);
  const user = (e) => !!e && !e.builtin && !e.virtual;
  const is = (e, k) => user(e) && conforms(e.kind, k);
  const owningRel = (e) => parent.get(e) ?? null;
  const ownerOf = (e) => { const r = parent.get(e); return r ? parent.get(r) ?? null : null; };
  const isBuiltinAction = (e) => !!e?.builtin && !e.lib && /^Actions::Action::(start|done)$/.test(e.qname ?? '');
  const isParam = (rel) => conf(rel, 'ParameterMembership');
  const isEntryAction = (el) => { const r = owningRel(el); return conf(r, 'StateSubactionMembership') && r.attrs.kind === 'entry'; };
  // 持ち主ごとに 1 回だけ作る(GR18 の M3。遷移・継承ごとに持ち主のメンバーの一覧を作り直さない)
  const msCache = new Map();
  const ownedMemberships = (ns) => {
    let c = msCache.get(ns);
    if (!c) { c = ownedMemberships0(ns); c.at = new Map(c.map((m, i) => [m.rel, i])); msCache.set(ns, c); }
    return c;
  };
  const indexOfRel = (ms, rel) => ms.at.get(rel) ?? -1;
  const ownedMemberships0 = (ns) => {
    const out = [];
    for (const rel of ns.owned) {
      if (!conf(rel, 'Membership')) continue;
      const el = rel.related[0] ?? target(rel, 'memberElement') ?? target(rel, 'memberFeature');
      out.push({ rel, el: el ?? null });
    }
    return out;
  };
  const previousMember = (el, accept) => {
    const owner = ownerOf(el);
    if (!owner) return null;
    const ms = ownedMemberships(owner);
    const i = indexOfRel(ms, owningRel(el));
    for (let k = i - 1; k >= 0; k--) if (ms[k].el && accept(ms[k])) return ms[k].el;
    return null;
  };
  const transitionSource = (tu) => previousMember(tu, ({ rel, el }) => !isParam(rel) && (is(el, 'StateUsage') || (is(el, 'ActionUsage') && isEntryAction(el))));
  const isMessageFlow = (x) => conf(x, 'FlowUsage') && !x.owned.some((c) => conf(c, 'EndFeatureMembership'));
  const isInitialNodeMember = (rel) => !rel.related.length && rel.refs?.memberFeature !== undefined;
  const successionSource = (s) => previousMember(s, ({ rel, el }) => !isParam(rel) && !conf(el, 'TransitionUsage')
    && (isInitialNodeMember(rel) || ((!conf(el, 'Connector') || isMessageFlow(el)) && (is(el, 'OccurrenceUsage') || isBuiltinAction(el)))));
  const form = (tu) => {
    const owner = ownerOf(tu);
    if (!(is(owner, 'StateDefinition') || is(owner, 'StateUsage'))) return 'action';
    const ms = ownedMemberships(owner);
    const i = indexOfRel(ms, owningRel(tu));
    for (let k = i - 1; k >= 0; k--) {
      const el = ms[k].el;
      if (!el || conf(el, 'TransitionUsage') || conf(el, 'Succession')) continue;
      return is(el, 'ActionUsage') && isEntryAction(el) ? 'entry' : 'target';
    }
    return 'target';
  };
  return (tu) => {
    for (const m of tu.owned) {
      if (!conf(m, 'Membership') || conf(m, 'FeatureMembership')) continue;
      if (m.related.some((x) => conf(x, 'Succession'))) continue;
      return undefined; // 始点を書いた遷移
    }
    return form(tu) === 'target' ? transitionSource(tu) : successionSource(tu);
  };
}
