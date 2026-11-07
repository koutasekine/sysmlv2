// 警告の検査(GR19 指示書 3.1〜3.3 節・v19.1 の 3.1〜3.4 節、設計書 9.2 節の W1・W2)。外部パッケージ・Node.js 固有の機能・DOM を使わない。
//
// checkWarnings(tree, model, text, opts) → [{ item, section, start, end, line, col, message }]
//   tree・model・text は checkSemantics(src/model/semantic.js)と同じ
//   item     'W1'・'W2'
//   section  出典(W1 は 'SysML 2.0 7.11.2' などの本文の節、W2 は このアプリの「書き方」の決まり)
//   start, end  原文の範囲。line, col は start の行と列(1 から数える)
//   message  利用者向けの日本語のメッセージ。誤りや禁止と断定せず、意図した書き方かを確かめるよう促す形(設計書 9.2 節)
// opts.stats にオブジェクトを渡すと、判定した数を数える(検査の道具が使う): W1[使用の種類] は判定した型付けの数(actor・stakeholder の
// 行で判定したものは 'PartUsage@7.21.2' のように行の節を付けて分ける)、W2 は判定した部品・ポートの使用(名前と、区切りの名前を
// 持つ明示の型付けを持つもの)の数。
// 並びは start の順(同じなら項目の順)。警告は、本文の規範の制約に反するかどうかを述べない(W1 の出典の 7 章は参考の章)ので、
// 意味エラーの一覧と混ぜない。
//
// W1(使用の型の種類): 使用が直接持つ明示の型付けのうち、利用者のモデルの要素か標準ライブラリの索引の要素に解決したものが、表の行の
//   許される定義の種類(下位の種類を含む)のどれにも適合しないとき。判定しないもの: 型が未検査・曖昧のもの、暗黙の特殊化(原文に
//   書いていない型付け)、表にない使用の種類、W2 に当たる型付け(同じ箇所に 2 つ出さない)。D3 の印の付いた参照は、意味エラーと
//   同じく解決済みとして扱う。種類が文脈に合わない型(意味エラー S3)は、同じ箇所を二重に出さないよう判定しない。
//   actor・stakeholder として宣言した部品の使用(ActorMembership・StakeholderMembership で所有される PartUsage)は、持ち主の種類に
//   よらず、通常の部品の行(7.11.2 節)でなく actor・stakeholder の行(部品の定義)で判定する。行が 2 つ以上当たるとき(actor は
//   7.21.2 節と 7.22.2 節)は、持ち主の種類が行の持ち主の種類(下位の種類を含む)に適合する行を採り、どれにも適合しなければ表の
//   最初の行を採る(採る行で変わるのは文の節と役割の語だけで、許される種類は同じ)。
// W2(使用の名前と型に書いた名前): 種類がちょうど PartUsage・PortUsage の使用で、名前を宣言し、明示の型付けに書いた型の名前(修飾名
//   なら最後の区切り。共役の ~ は除く)が、使用の名前と同じとき。比べるのは引用符を外した名前。型の名前の解決の結果(解決・未検査・
//   曖昧、解決先が定義か使用か)によらず、書かれた区切りの名前で判定する(GR19 指示書 v19.1 の 3.1 節)。

import { lineColOf } from './semantic.js';
import { walkTree } from '../parser/tree.js';
import grammar from '../parser/grammar_table.js';
import w1Table from './w1_table.js';

// 項目ごとの切り替え(GR19 指示書 3.3 節)。false にした項目は判定しない。opts.items で 1 回だけ変えられる(検査の道具が使う)
export const WARN19 = { W1: true, W2: true };
const ITEM_ORDER = ['W1', 'W2'];
const W2_SOURCE = 'このアプリの「書き方」の決まり';

// W1 の表(grammar/w1_usage_typing.json から tools/model/extract_w1.mjs で生成)。
// W1: 使用の種類 → 行(actor・stakeholder の行を除く)。W1_ROLE: actor・stakeholder の行(memberships・roles・owners を持つ)
const W1 = new Map(w1Table.entries.filter((e) => !e.memberships).map((e) => [e.usage, e]));
const W1_ROLE = w1Table.entries.filter((e) => e.memberships);

// 種類の日本語名(「書き方」の言葉にそろえる。GR19 指示書 v19.1 の 3.3 節。action def は「行動の定義」)。
// 使用は、定義の名前から「の定義」を除いた語(「書き方」の「部品の定義と使用」「行動の定義は…、行動は…」の言い方)
export const USAGE_JA = {
  AttributeUsage: '属性', OccurrenceUsage: 'オカレンス', ItemUsage: '項目', PartUsage: '部品', PortUsage: 'ポート',
  ConnectionUsage: '接続', InterfaceUsage: 'インターフェース', AllocationUsage: '割り当て', FlowUsage: 'フロー', ActionUsage: '行動',
  SuccessionFlowUsage: 'フロー', StateUsage: '状態', CalculationUsage: '計算', ConstraintUsage: '制約', RequirementUsage: '要求',
  ConcernUsage: '関心事', CaseUsage: 'ケース', AnalysisCaseUsage: '解析', VerificationCaseUsage: '検証', UseCaseUsage: 'ユースケース',
  ViewUsage: 'ビュー', ViewpointUsage: '視点', RenderingUsage: 'レンダリング', MetadataUsage: 'メタデータ', EnumerationUsage: '列挙',
  ReferenceUsage: '参照', EventOccurrenceUsage: '事象', PerformActionUsage: 'perform の行動', ExhibitStateUsage: 'exhibit の状態',
  IncludeUseCaseUsage: 'include のユースケース', SatisfyRequirementUsage: 'satisfy の要求', AssertConstraintUsage: 'assert の制約',
  BindingConnectorAsUsage: '結合', SuccessionAsUsage: '継承', TransitionUsage: '遷移',
};
export const DEF_JA = {
  AttributeDefinition: '属性の定義', EnumerationDefinition: '列挙の定義', OccurrenceDefinition: 'オカレンスの定義', ItemDefinition: '項目の定義',
  PartDefinition: '部品の定義', PortDefinition: 'ポートの定義', ConjugatedPortDefinition: 'ポートの定義(共役)', ConnectionDefinition: '接続の定義',
  InterfaceDefinition: 'インターフェースの定義', AllocationDefinition: '割り当ての定義', FlowDefinition: 'フローの定義', ActionDefinition: '行動の定義',
  StateDefinition: '状態の定義', CalculationDefinition: '計算の定義', ConstraintDefinition: '制約の定義', RequirementDefinition: '要求の定義',
  ConcernDefinition: '関心事の定義', CaseDefinition: 'ケースの定義', AnalysisCaseDefinition: '解析の定義', VerificationCaseDefinition: '検証の定義',
  UseCaseDefinition: 'ユースケースの定義', ViewDefinition: 'ビューの定義', ViewpointDefinition: '視点の定義', RenderingDefinition: 'レンダリングの定義',
  MetadataDefinition: 'メタデータの定義',
  // KerML の種類(標準ライブラリの索引の要素など)。「KerML の構造」「KerML のデータ型」の形
  DataType: 'KerML のデータ型', Class: 'KerML のクラス', Structure: 'KerML の構造', Association: 'KerML の関連', AssociationStructure: 'KerML の関連構造',
  Behavior: 'KerML の振る舞い', Function: 'KerML の関数', Predicate: 'KerML の述語', Interaction: 'KerML の相互作用', Metaclass: 'KerML のメタクラス',
  Classifier: 'KerML の分類子', Type: 'KerML の型', Feature: 'KerML の特徴', Package: 'パッケージ', LibraryPackage: 'ライブラリのパッケージ',
};
const kindJa = (kind) => DEF_JA[kind] ?? (USAGE_JA[kind] ? `${USAGE_JA[kind]}の使用` : kind);

// 表の行の、許される定義の種類の日本語(本文の括弧の注も訳して付ける)。例: 「項目の定義(部品の定義を含む)か KerML の構造」
const noteJa = (note) => {
  if (note == null) return '';
  if (note === 'of any kind') return '(下位の種類を含む)';
  const inc = /^including (.+) definitions$/.exec(note);
  if (inc) { const k = inc[1].split(' ').map((w) => w[0].toUpperCase() + w.slice(1)).join('') + 'Definition'; if (DEF_JA[k]) return `(${DEF_JA[k]}を含む)`; }
  return `(${note})`;
};
const allowedJa = (row) => {
  const xs = row.allowed.map((k, i) => kindJa(k) + noteJa(row.notes?.[i]));
  if (xs.length <= 1) return xs.join('');
  const last = xs[xs.length - 1];
  return `${xs.slice(0, -1).join('、')}か${/^[A-Za-z]/.test(last) ? ' ' : ''}${last}`;
};

// 名前の書き方(図からの編集の段階 1 と同じ規則。設計書 8 章): 英字か _ で始まり英数字と _ だけからなり、予約語でなければ引用符なし
const KEYWORDS = new Set(grammar.keywords);
const nameText = (n) => n == null ? '(名前なし)'
  : /^[A-Za-z_][A-Za-z0-9_]*$/.test(n) && !KEYWORDS.has(n) ? n : `'${n.replace(/[\\']/g, (c) => '\\' + c)}'`;

export function checkWarnings(tree, model, text, opts = {}) {
  const on = { ...WARN19, ...(opts.items ?? {}) };
  const out = [];
  if (!on.W1 && !on.W2) return out;
  const conforms = model.conforms;
  const refOf = new Map();
  for (const r of model.refs) if (!refOf.has(r.node)) refOf.set(r.node, r);
  // W1 で判定する型: 解決済みで、利用者のモデルの要素(共役ポートの定義を含む)か標準ライブラリの索引の要素。内蔵する表の項目
  // (メタクラス・標準ビューの定義など)は対象にしない。種類が文脈に合わないもの(S3)は判定しない
  const typeOf = (typing) => {
    const r = refOf.get(typing);
    if (!r || r.status !== 'resolved' || r.kindMismatch || r.start == null) return null;
    const t = r.target;
    if (!t || (t.builtin && !t.lib)) return null;
    return { ref: r, target: t, written: text.slice(r.start, r.end) };
  };
  const push = (item, section, start, end, message) => out.push({ item, section, start, end, ...lineColOf(text, start), message });
  const parentOf = new Map(); // 要素 → 所有する関係(Membership)、関係 → 持ち主

  // GR20 の M: 複数のファイルをまとめた仮の根(src/model/files.js)なら、ファイルごとの根の名前空間をたどる
  for (const root of tree.forestRoots ?? [tree]) walkTree(root, (u, p) => {
    parentOf.set(u, p);
    if (u.builtin || u.virtual || !(u.end > u.start)) return;
    // actor・stakeholder の部品の使用は、その行で判定する(GR19 指示書 v19.1 の 3.2 節。持ち主の種類によらない)
    let row = null;
    if (on.W1) {
      const memb = parentOf.get(u);
      const roleRows = memb ? W1_ROLE.filter((e) => e.usage === u.kind && e.memberships.some((k) => conforms(memb.kind, k))) : [];
      if (roleRows.length) {
        const owner = parentOf.get(memb);
        row = roleRows.find((e) => owner && e.owners.some((k) => conforms(owner.kind, k))) ?? roleRows[0];
      } else row = W1.get(u.kind) ?? null; // 表の使用の種類と同じ種類だけ(表にない種類は判定しない)
    }
    const w2 = on.W2 && (u.kind === 'PartUsage' || u.kind === 'PortUsage');
    if (!row && !w2) return;
    // 明示の型付け(原文に書いた `:`・`defined by`)。使用が直接持つものだけ(運ぶものの型 `of A` などは使用の型でない)
    const typings = u.owned.filter((c) => conforms(c.kind, 'FeatureTyping') && c.end > c.start);
    // W2: 型に書いた名前(最後の区切り)が使用の名前と同じ型付け。解決の結果によらない
    const w2Hit = new Set();
    if (w2 && u.name != null) {
      let judged = false;
      for (const c of typings) {
        const r = refOf.get(c);
        const last = r?.segments?.length ? r.segments[r.segments.length - 1] : null;
        if (!last || r.start == null) continue;
        judged = true;
        if (last.name !== u.name) continue;
        w2Hit.add(c);
        const noun = USAGE_JA[u.kind];
        push('W2', W2_SOURCE, u.start, r.end,
          `${noun} ${nameText(u.name)} の名前が、型に書いた名前 ${text.slice(c.start, r.end)} と同じです。同じ名前にすると、型の名前が同じ名前の別の要素や、この${noun}自身を指すことがあります。意図した型の指定か確かめてください(「書き方」では、使用の名前を定義の名前と別にしています)`);
      }
      if (judged && opts.stats) opts.stats.W2 = (opts.stats.W2 ?? 0) + 1;
    }
    if (row) {
      const uname = nameText(u.name ?? u.shortName ?? null);
      const statKey = row.memberships ? `${u.kind}@${row.section}` : u.kind;
      for (const c of typings) {
        if (w2Hit.has(c)) continue; // W2 に当たる型付けには W1 を出さない
        const t = typeOf(c);
        if (!t) continue;
        if (opts.stats) { opts.stats.W1 ??= {}; opts.stats.W1[statKey] = (opts.stats.W1[statKey] ?? 0) + 1; }
        if (row.allowed.some((k) => conforms(t.target.kind, k))) continue;
        const noun = USAGE_JA[u.kind];
        const who = row.roles ? `${row.roles.join('・')} の${noun}` : noun;
        push('W1', `SysML 2.0 ${row.section}`, t.ref.start, t.ref.end,
          `${noun} ${uname} の型に指定した ${t.written} は、${kindJa(t.target.kind)}です。SysML 2.0 の ${row.section} 節では、${who}の型は${allowedJa(row)}とされています。意図した型の指定か確かめてください`);
      }
    }
  });
  out.sort((a, b) => a.start - b.start || ITEM_ORDER.indexOf(a.item) - ITEM_ORDER.indexOf(b.item) || a.end - b.end);
  return out;
}
