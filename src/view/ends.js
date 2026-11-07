// 遷移・継承の始点と終点(GR6 P2 の裁定 Q18・Q20・Q21、P2 の確認の後の裁定 3・4)。外部パッケージ・Node.js 固有の機能・DOM を使わない。
// 状態遷移ビュー(src/view/state.js)とアクションフロービュー(src/view/action.js)が使う。GR7 で state.js から移した
// (ビルドの道具が循環する import を受け付けないため。中身は変えていない)。

const conf = (ctx, e, k) => !!e && ctx.model.conforms(e.kind, k);

// ---- 遷移・継承の始点と終点
// 名前空間が直接持つメンバーシップ(ownedMembership)の並び。参照するメンバーシップ(first start; など)も含める
function ownedMemberships(ctx, ns) {
  const out = [];
  for (const rel of ns.owned) {
    if (!conf(ctx, rel, 'Membership')) continue;
    // first start;(InitialNodeMember)は memberFeature で参照する
    const el = rel.related[0] ?? ctx.target(rel, 'memberElement') ?? ctx.target(rel, 'memberFeature');
    out.push({ rel, el: el ?? null });
  }
  return out;
}
const isParam = (ctx, rel) => conf(ctx, rel, 'ParameterMembership');
export const isBuiltinAction = (e) => !!e?.builtin && /^Actions::Action::(start|done)$/.test(e.qname ?? '');
const isEntryAction = (ctx, el) => { const r = ctx.owningRel(el); return conf(ctx, r, 'StateSubactionMembership') && r.attrs.kind === 'entry'; };

// 前のメンバーをさかのぼる(持ち主が直接持つメンバーだけ。継承したメンバーは含めない。GR6 P2 の裁定 Q18)
function previousMember(ctx, el, accept) {
  const owner = ctx.ownerOf(el);
  if (!owner) return null;
  const ms = ownedMemberships(ctx, owner);
  const i = ms.findIndex((m) => m.rel === ctx.owningRel(el));
  for (let k = i - 1; k >= 0; k--) if (ms[k].el && accept(ms[k])) return ms[k].el;
  return null;
}
// 始点を省いた遷移の始点: 最も近い前の状態の使用か entry の行動(7.18.3 節(参考)。裁定 Q18)
export function implicitTransitionSource(ctx, tu) {
  return previousMember(ctx, tu, ({ rel, el }) => !isParam(ctx, rel) && (ctx.is(el, 'StateUsage') || (ctx.is(el, 'ActionUsage') && isEntryAction(ctx, el))));
}
// then の継承の始点: 最も近い前のオカレンスの使用。パラメーター、遷移(条件付きの継承を含む)は飛ばす
// (7.17.4 節(参考)。裁定 Q18)。コネクター(接続・フロー・結合・継承)も飛ばすが、端を持たないメッセージの流れは
// 飛ばさない(P2 の確認の後の裁定 3。パイロット実装の getPreviousFeature と同じ。接続も PartUsage でオカレンスなので)。
// 内蔵の Actions::Action::start・done はアクション(オカレンス)として扱う
const isMessageFlow = (ctx, x) => conf(ctx, x, 'FlowUsage') && !x.owned.some((c) => conf(ctx, c, 'EndFeatureMembership'));
// first X;(InitialNodeMember。要素を所有せず memberFeature で参照する)で参照した要素は、オカレンスかどうかを見ずに
// 始点として採る(P2 の 2 回目の確認の後の裁定 4)
const isInitialNodeMember = (rel) => !rel.related.length && rel.refs?.memberFeature !== undefined;
export function implicitSuccessionSource(ctx, s) {
  return previousMember(ctx, s, ({ rel, el }) => !isParam(ctx, rel) && !conf(ctx, el, 'TransitionUsage')
    && (isInitialNodeMember(rel) || ((!conf(ctx, el, 'Connector') || isMessageFlow(ctx, el)) && (ctx.is(el, 'OccurrenceUsage') || isBuiltinAction(el)))));
}
// 参考: パイロット実装の UsageUtil.getPreviousFeature の規則(フィーチャーで、パラメーター・遷移・コネクター
// (メッセージを除く)でないもの)。照合の道具だけが使う
export function pilotPreviousFeature(ctx, el) {
  return previousMember(ctx, el, ({ rel, el: x }) => {
    if (!(conf(ctx, x, 'Feature') || isBuiltinAction(x)) || isParam(ctx, rel) || conf(ctx, x, 'TransitionUsage')) return false;
    if (conf(ctx, x, 'Connector')) return isMessageFlow(ctx, x);
    return true;
  });
}

// 始点を省いた遷移の構文の形(GR6 P2 の裁定 Q21)。構文木には生成規則の名前が残らないので、文法上の位置で決める
//   'action'  持ち主が状態でない: ActionBodyItem の ActionTargetSuccessionMember(GuardedTargetSuccession・
//             DefaultTargetSuccession。if g then x; と else x;)
//   'entry'   持ち主が状態で、前のメンバー(遷移と継承を飛ばす)が entry の行動: EntryTransitionMember(entry; if c then x;)
//   'target'  それ以外: TargetTransitionUsageMember(accept … then …; など)
export function implicitTransitionForm(ctx, tu) {
  const owner = ctx.ownerOf(tu);
  if (!ctx.isAny(owner, ['StateDefinition', 'StateUsage'])) return 'action';
  const ms = ownedMemberships(ctx, owner);
  const i = ms.findIndex((m) => m.rel === ctx.owningRel(tu));
  for (let k = i - 1; k >= 0; k--) {
    const el = ms[k].el;
    if (!el || conf(ctx, el, 'TransitionUsage') || conf(ctx, el, 'Succession')) continue;
    return ctx.is(el, 'ActionUsage') && isEntryAction(ctx, el) ? 'entry' : 'target';
  }
  return 'target';
}
// 終点の端がない継承(SourceSuccession。then X で X を宣言する形)の終点: 持ち主が直接持つメンバーで、すぐ後ろの
// フィーチャーメンバーシップの要素(裁定 Q20。パイロット実装の UsageUtil.getTargetFeature と同じ)
export function nextFeature(ctx, el) {
  const owner = ctx.ownerOf(el);
  if (!owner) return null;
  const ms = ownedMemberships(ctx, owner).filter((m) => conf(ctx, m.rel, 'FeatureMembership'));
  const i = ms.findIndex((m) => m.rel === ctx.owningRel(el));
  return i >= 0 && i + 1 < ms.length ? ms[i + 1].el : null;
}

// 参照(Membership の memberElement か、特徴の連鎖)の先
function refTarget(ctx, rel, prop) {
  const ch = ctx.chainOf(rel, prop);
  if (ch.length) return ch[ch.length - 1].el;
  return null;
}
// 遷移の始点・終点。{ source, target, implicit }(求まらなければ null)
export function transitionEnds(ctx, tu) {
  let source = null, explicit = false;
  for (const m of tu.owned) {
    if (!conf(ctx, m, 'Membership') || conf(ctx, m, 'FeatureMembership')) continue;
    if (m.related.some((x) => conf(ctx, x, 'Succession'))) continue;
    explicit = true;
    if (m.refs.memberElement !== undefined) source = ctx.target(m, 'memberElement');
    else {
      const f = m.related.find((x) => conf(ctx, x, 'Feature'));
      if (f) { const chain = []; for (const c of f.owned) if (conf(ctx, c, 'FeatureChaining')) chain.push(ctx.target(c, 'chainingFeature')); source = chain.length ? chain[chain.length - 1] : null; }
    }
    break;
  }
  // 裁定 Q21: if g then x;・else x;・entry; if c then x; は継承の規則、accept … then …(TargetTransitionUsage)は遷移の規則
  if (!explicit) source = implicitTransitionForm(ctx, tu) === 'target' ? implicitTransitionSource(ctx, tu) : implicitSuccessionSource(ctx, tu);
  let target = null;
  for (const m of tu.owned) {
    const s = m.related.find((x) => conf(ctx, x, 'Succession'));
    if (!s) continue;
    target = successionEnd(ctx, s, 1);
    break;
  }
  return { source, target, implicit: !explicit };
}
function successionEnd(ctx, s, k) {
  const ends = s.owned.filter((c) => conf(ctx, c, 'EndFeatureMembership')).map((c) => c.related[0]).filter(Boolean);
  const e = ends[k];
  if (!e) return null;
  const rs = e.owned.find((c) => conf(ctx, c, 'ReferenceSubsetting'));
  return rs ? refTarget(ctx, rs, 'referencedFeature') : null;
}
// 継承の始点・終点。始点の端が空(then の継承)なら、前のメンバーから求める
export function successionEnds(ctx, s) {
  const ends = s.owned.filter((c) => conf(ctx, c, 'EndFeatureMembership')).map((c) => c.related[0]).filter(Boolean);
  const first = ends[0];
  const implicit = !!first && first.start === first.end && !first.owned.some((c) => conf(ctx, c, 'ReferenceSubsetting'));
  const source = implicit ? implicitSuccessionSource(ctx, s) : successionEnd(ctx, s, 0);
  // 終点の端がないか、終点の端が参照を持たなければ、すぐ後ろのフィーチャー(裁定 Q20)
  const second = ends[1];
  const targetImplicit = !second || !second.owned.some((c) => conf(ctx, c, 'ReferenceSubsetting'));
  const target = targetImplicit ? nextFeature(ctx, s) : successionEnd(ctx, s, 1);
  return { source, target, implicit, targetImplicit };
}
// 状態遷移ビューで線にする継承(遷移が持つ継承と、終点の端だけの暗黙のものを除く)
export function isDrawnSuccession(ctx, el) {
  if (!ctx.user(el) || !conf(ctx, el, 'Succession') || conf(ctx, el, 'TransitionUsage')) return false;
  return !conf(ctx, ctx.ownerOf(el), 'TransitionUsage');
}

