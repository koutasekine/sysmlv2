// パイロット実装の検証の結果(tools/pilot-runner/src/PilotValidate.java の出力)を、設計書 9.2 節の意味エラーの
// 12 項目の照合の相手に振り分ける(GR5 指示書 4 章の対応表)。照合の道具(compare.mjs)と集計(pilot_count.mjs)が使う。
//
// pilotItems(fileJson) → [{ item, offset, length, code, message, object, ref }]
//   item    'S1'〜'U6'。S1・S3 は解決の失敗(unresolved)から、ほかは検証の結果(issues)から作る
//   offset, length  照合に使う原文の範囲。S1・S3 は参照の節点の範囲、ほかは対象の要素の節点の範囲(object)
//   ref     S1・S3 のとき、もとの解決の失敗
// 振り分けの規則(対応表の正本は reports/GR5/P1_pilot_*.md):
//   S1  解決の失敗で、種類を Element にして探し直しても見つからないもの(anyType が null)
//   S3  解決の失敗で、探し直すと見つかり、見つかった要素の種類が参照の属性の型に適合しないもの
//   (探し直すと見つかり、種類も適合するものは、種類によらない失敗なので S1・S3 のどちらにも入れない。kind: 'other')
//   S2  validateNamespaceDistinguishablity(警告)
//   S4  validateImportTopLevelVisibility
//   T1  validateTypeAtMostOneConjugator
//   T2  validateRedefinitionDirectionConformance
//   T3  validateRedefinitionEndConformance
//   T4  validateMultiplicityRangeResultTypes(本文の validateMultiplicityRangeBoundResultTypes)
//   U1  validateVariationMembershipOwningNamespace で、対象が VariantMembership のもの(Expose の検査が同じ名前を使う)
//   U4  validatePortDefinitionOwnedUsagesNotComposite、validatePortUsageNestedUsagesNotComposite
//   U5  名前が「A parallel state cannot have successions or transitions.」のもので、持ち主が StateUsage に適合するもの
//       (パイロット実装は、状態の定義・使用の両方で、メッセージを検証の名前に使っている)
//   U6  validateTransitionUsageTriggerActions

import { conforms } from '../../src/model/resolve.js';

export const ITEMS = ['S1', 'S2', 'S3', 'S4', 'T1', 'T2', 'T3', 'T4', 'U1', 'U4', 'U5', 'U6'];
export const U5_CODE = 'A parallel state cannot have successions or transitions.';

const BY_CODE = {
  validateNamespaceDistinguishablity: 'S2',
  validateImportTopLevelVisibility: 'S4',
  validateTypeAtMostOneConjugator: 'T1',
  validateRedefinitionDirectionConformance: 'T2',
  validateRedefinitionEndConformance: 'T3',
  validateMultiplicityRangeResultTypes: 'T4',
  validateVariationMembershipOwningNamespace: 'U1',
  validatePortDefinitionOwnedUsagesNotComposite: 'U4',
  validatePortUsageNestedUsagesNotComposite: 'U4',
  [U5_CODE]: 'U5',
  validateTransitionUsageTriggerActions: 'U6',
};

// 解決の失敗の分類: 'S1'・'S3'・'other'
export function unresolvedKind(u) {
  if (!u.anyType) return 'S1';
  return conforms(u.anyType.type, u.expected) ? 'other' : 'S3';
}

export function pilotItems(j) {
  const out = [];
  for (const u of j.unresolved ?? []) {
    const k = unresolvedKind(u);
    if (k === 'other') continue;
    out.push({ item: k, offset: u.offset, length: u.length, code: null, message: null, object: null, ref: u });
  }
  for (const is of j.issues ?? []) {
    let item = BY_CODE[is.code];
    if (!item) continue;
    if (item === 'U1' && is.object?.type !== 'VariantMembership') continue;
    if (item === 'U5' && !(is.object?.owner && conforms(is.object.owner, 'StateUsage'))) continue;
    const o = is.object;
    out.push({
      item, offset: o?.offset ?? is.offset, length: o?.length ?? is.length,
      code: is.code, message: is.message, object: o, issue: is,
    });
  }
  return out;
}
