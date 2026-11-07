// 構文木の食い違いの分類(GR2 指示書 6.2 節、GR2 P2 の D5 の裁定)。
//
// このアプリの木(式の部分木は種類だけにしたもの)に、既知の差を 1 つずつ機械的に打ち消す変換を当て、
// パイロット実装の木と一致するかを見る。変換を当てた回数を、差の種類ごとに数える。
// すべて当てても一致しなければ「分類できない」(unclassified)とする。
//
// 差の種類(どれも、本文の文法とパイロット実装の文法の規則の書き方の違い。設計書 2.5 節の行の案):
//   SUCC_END        then の継承の端の数。本文 SourceSuccession(sysml20 L11109-L11110)は端 1 つ、
//                   パイロット実装 EmptySuccession(SysML.xtext 880〜883 行目)は空の終点の端を加えて 2 つ
//   TRANS_SUCC_TYPE TransitionSuccession の種類。本文は Succession(sysml20 L11908-L11910)、
//                   パイロット実装は SuccessionAsUsage(SysML.xtext 1925〜1928 行目)
//   INITIAL_NODE    first start; の関係。本文 InitialNodeMember は FeatureMembership と memberFeature
//                   (sysml20 L11462-L11464)、パイロット実装は Membership と memberElement(SysML.xtext 1384〜1387 行目)
//   TRANS_PARAM     アクションの中の遷移(if … then …、else …、first … if … then …)の空の引数。本文
//                   GuardedTargetSuccession・DefaultTargetSuccession・GuardedSuccession(sysml20 L11731-L11743)は
//                   空の引数を持たず、パイロット実装は EmptyParameterMember を置く(SysML.xtext 1708〜1725 行目)
//   INDIVIDUAL_MULT individual def の多重度の関係の位置。本文 IndividualDefinition(sysml20 L11056-L11059)は末尾、
//                   パイロット実装(SysML.xtext 818〜822 行目)は先頭
//   ASSIGN_TARGET   assign の対象の特徴。本文 AssignmentTargetParameter(sysml20 L11654-L11655)は束縛だけ、
//                   パイロット実装 TargetParameter(SysML.xtext 1550〜1553 行目)は TargetFeatureMember を加える
// 受理・拒否の差 EXPRESSION_BODY(設計書 2.5 節 1 行目)は compare.mjs の受理・拒否で扱う。

export const DIFF_CLASSES = {
  SUCC_END: 'then の継承の端の数',
  TRANS_SUCC_TYPE: 'TransitionSuccession の種類',
  INITIAL_NODE: 'first の関係の種類',
  TRANS_PARAM: 'アクションの中の遷移の空の引数',
  INDIVIDUAL_MULT: 'individual def の多重度の位置',
  ASSIGN_TARGET: 'assign の対象の特徴',
};

const RU = () => ({ type: 'ReferenceUsage' });
const isBareRU = (e) => e && e.type === 'ReferenceUsage' && !e.owned && !e.related && e.name === undefined;
const clone = (e) => JSON.parse(JSON.stringify(e));

// 変換: ours を pilot の形に寄せる。counts に回数を足す
function normalize(e, parent, counts) {
  const add = (k) => { counts[k] = (counts[k] ?? 0) + 1; };
  for (const k of ['owned', 'related']) if (e[k]) e[k] = e[k].map(c => normalize(c, e, counts));

  // SUCC_END: 端が 1 つだけの継承(then の後ろ)。空の終点の端を加える
  if (e.type === 'SuccessionAsUsage' && parent?.type === 'FeatureMembership' && e.owned?.length === 1 &&
      e.owned[0].type === 'EndFeatureMembership' && !e.related) {
    e.owned.push({ type: 'EndFeatureMembership', related: [RU()] });
    add('SUCC_END');
  }
  // TRANS_SUCC_TYPE: 遷移の継承(端 2 つ)の種類
  if (e.type === 'Succession' && (parent?.type === 'OwningMembership' || parent?.type === 'FeatureMembership') &&
      e.owned?.length === 2 && e.owned.every(c => c.type === 'EndFeatureMembership')) {
    e.type = 'SuccessionAsUsage';
    add('TRANS_SUCC_TYPE');
  }
  // INITIAL_NODE: 子のない FeatureMembership(名前の参照だけの first)
  if (e.type === 'FeatureMembership' && !e.owned && !e.related) {
    e.type = 'Membership';
    add('INITIAL_NODE');
  }
  // TRANS_PARAM: 空の引数のない遷移で、ガード(TransitionFeatureMembership)の前、ガードがなければ
  // 継承の関係(else の後ろ)の前に空の引数を置く
  if (e.type === 'TransitionUsage' && e.owned && !e.owned.some(c => c.type === 'ParameterMembership')) {
    let k = e.owned.findIndex(c => c.type === 'TransitionFeatureMembership');
    if (k < 0 && e.owned.length === 1 && e.owned[0].type === 'OwningMembership') k = 0;
    if (k >= 0) {
      e.owned.splice(k, 0, { type: 'ParameterMembership', related: [RU()] });
      add('TRANS_PARAM');
    }
  }
  // INDIVIDUAL_MULT: 末尾の空の多重度の関係を先頭へ
  if (e.type === 'OccurrenceDefinition' && e.owned) {
    const k = e.owned.findIndex(c => c.type === 'OwningMembership' && c.related?.length === 1 &&
      c.related[0].type === 'Multiplicity' && !c.related[0].owned && !c.related[0].related);
    if (k > 0) {
      e.owned.unshift(...e.owned.splice(k, 1));
      add('INDIVIDUAL_MULT');
    }
  }
  // ASSIGN_TARGET: assign の対象の引数に、対象の特徴の関係を加える
  if (e.type === 'AssignmentActionUsage' && e.owned?.[0]?.type === 'ParameterMembership') {
    const t = e.owned[0].related?.[0];
    if (t && t.type === 'ReferenceUsage' && !(t.owned ?? []).some(c => c.type === 'FeatureMembership')) {
      t.owned = [...(t.owned ?? []), { type: 'FeatureMembership', related: [{ type: 'ReferenceUsage', owned: [{ type: 'FeatureMembership', related: [RU()] }] }] }];
      add('ASSIGN_TARGET');
    }
  }
  return e;
}

// 比べる形(空の並びを落とす)
const canon = (e) => {
  const o = { type: e.type };
  if (e.name !== undefined) o.name = e.name;
  if (e.shortName !== undefined) o.shortName = e.shortName;
  if (e.owned?.length) o.owned = e.owned.map(canon);
  if (e.related?.length) o.related = e.related.map(canon);
  return o;
};

// ours・pilot は式の部分木を種類だけにした木。{ classes: { 種類: 回数 }, unclassified: 最初の食い違い か null } を返す
export function classifyTree(ours, pilot, firstDiff) {
  const counts = {};
  const n = normalize(clone(ours), null, counts);
  const a = canon(n), b = canon(pilot);
  const same = JSON.stringify(a) === JSON.stringify(b);
  return { classes: counts, unclassified: same ? null : (firstDiff ? firstDiff(a, b) : '不一致') };
}

export { isBareRU };
