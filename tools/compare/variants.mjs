// 既知の差を 1 つだけパイロット実装の側に寄せたパーサー(GR2 指示書 6.2・6.3 節の分類に使う)。
//
// 受理・拒否の食い違いを、既知の差に分類するために使う。分類の仕方: 既知の差を 1 つだけパイロット実装の側に
// 寄せた文法(または字句)で解析し直し、受理・拒否がパイロット実装と同じになれば、その差で説明できるとする。
// どれで解析し直しても同じにならなければ unclassified とする。同じになる差が 2 つ以上あれば、すべてを「+」でつないで記録する。
//   EXPRESSION_BODY  設計書 2.5 節 1 行目。式の本体 ExpressionBody を、パイロット実装と同じく CalculationBody で読む
//   EMPTY_DECL       設計書 2.5 節 6 行目。宣言のない要素を読まない(UsageDeclaration を空にできないようにする:
//                    Identification が空でないか、FeatureSpecializationPart があること)
//   NEW_AS_NAME      設計書 2.2 節「new の予約語化は入れない」(予約語は 2.4 節の SysML 2.0 の 8.2.2.1.2 節の一覧)。
//                    パイロット実装は文法に書かれた new を予約語として扱うので、new を予約語に加える
//   CLASSIFICATION_PREFIX  左の被演算子のない分類の式(@A @B の @A)を、ほかの演算子の被演算子にする。本文の文法どおり
//                    受理する(GR2 P3 の裁定、案 A。設計書 2.5 節の行の案)。パイロット実装はこの形を式の一番外側にしか
//                    置かない(KerMLExpressions.xtext 169〜177 行目)ので、被演算子の位置からこの形を外す
// makeVariants() は { 名前: パーサー } を返す。classifyAccept(variants, text, pilot) は、受理・拒否がパイロット実装の結果 pilot
// ('accept' | 'reject')と同じになる差の名前を「+」でつないで返す(なければ 'unclassified')。

import table from '../../src/parser/grammar_table.js';
import { createParser } from '../../src/parser/index.js';

export function makeVariants() {
  const variant = (edit) => { const t = JSON.parse(JSON.stringify(table)); edit(t); return createParser({ table: t }); };
  return {
    EXPRESSION_BODY: variant(t => { t.rules.ExpressionBody = [t.rules.ExpressionBody[0], ['r', 'CalculationBody']]; }),
    EMPTY_DECL: variant(t => {
      const name = ['=', 'declaredName', '=', ['r', 'NAME']];
      t.rules.NonEmptyIdentification = ['Element', ['a',
        ['s', ['t', '<'], ['=', 'declaredShortName', '=', ['r', 'NAME']], ['t', '>'], ['?', name]],
        name]];
      t.rules.UsageDeclaration = [t.rules.UsageDeclaration[0], ['a',
        ['s', ['r', 'NonEmptyIdentification'], ['?', ['r', 'FeatureSpecializationPart']]],
        ['r', 'FeatureSpecializationPart']]];
    }),
    NEW_AS_NAME: variant(t => { t.keywords = [...t.keywords, 'new']; }),
    CLASSIFICATION_PREFIX: variant(t => {
      // 左の被演算子のない分類の式(@A、istype A など)を、演算子の被演算子(ArgumentValue)の位置から外す
      const [type, body] = t.rules.ClassificationExpression;
      const [, , ...rest] = body;                      // ['s', ['?', 左の被演算子], 演算子と型, 結果]
      t.rules.ClassificationExpression = [type, ['s', body[1][1], ...rest]];
      t.rules.PrefixClassificationExpression = [type, ['s', ...rest]];
      const alts = t.rules.OwnedExpression[1].slice(1);
      t.rules.OperandExpression = [t.rules.OwnedExpression[0], ['a', ...alts]];
      t.rules.OwnedExpression = [t.rules.OwnedExpression[0], ['a', ...alts, ['r', 'PrefixClassificationExpression']]];
      t.rules.ArgumentValue = [t.rules.ArgumentValue[0], ['=', 'value', '=', ['r', 'OperandExpression']]];
    }),
  };
}

export function classifyAccept(variants, text, pilot) {
  const hits = Object.entries(variants).filter(([, p]) => (p.parse(text).ok ? 'accept' : 'reject') === pilot).map(([n]) => n);
  return hits.length ? hits.join('+') : 'unclassified';
}
