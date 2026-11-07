// 最小の入力の期待(tests/semantic/cases/manifest.json)を作る(GR5 指示書 5 章)。
// 使い方: node tools/semantic/make_manifest.mjs
// 各入力の期待を、項目・行・範囲の原文で書き、列を求めて manifest.json に書く。範囲の原文が識別子なら単語として探す。
import fs from 'node:fs';
const D = new URL('../../tests/semantic/cases/', import.meta.url).pathname;
// [file, kind, expect: [item, line, text], note, pending?]
const C = [
 ['S1_violation','violation',[['S1',3,'Q::B']],'修飾名の後ろの区切り B が、import も継承も持たないパッケージ Q に見つからない'],
 ['S1_ok','ok',[],'S1_violation と同じ形で、Q に B がある'],
 ['S1_lib_global','library',[],'単純な名前 B が根の名前空間にない。大域の名前空間(標準ライブラリの最上位の名前を含む)を探しきれないので判定しない','Q6'],
 ['S1_lib_inherit','library',[],'D は型なので、暗黙の特殊化(標準ライブラリの型)から zz を受け継ぐかもしれない'],
 ['S1_lib_import','library',[],'Q は対象のわからない import(Lib::*)を持つ'],
 ['S1_lib_filter','library',[],'Q のフィルター条件 true は評価できない(@種類名・@メタデータ定義の形でない)'],
 ['S1_lib_dollar','library',[],'$:: の後の最初の区切りは大域の名前空間(標準ライブラリを含む)で探す名前なので、見つからなくても S1 にしない。$::ScalarValues::Real は正しいテキスト','Q6'],
 ['S2_violation','violation',[['S2',2,'part def A;'],['S2',3,'part def A;']],'同じ種類・同じ名前の所有のメンバー'],
 ['S2_ok_kinds','ok',[],'名前は同じだが、PartDefinition と AttributeDefinition は互いに適合しないので区別できる'],
 ['S2_violation_short','violation',[['S2',2,'part def <A> X;'],['S2',3,'part def A;']],'短い名前と名前が同じ'],
 ['S2_violation_inherited','violation',[['S2',3,'part a;']],'所有の a と、B から受け継いだ a(再定義していない)'],
 ['S2_ok_redefined','ok',[],'S2_violation_inherited と同じ形で、a を再定義する(受け継いだ a は除かれる)'],
 ['S2_lib_inherited','library',[],'self は標準ライブラリから受け継ぐ名前と同じかもしれないが、ライブラリの要素なので判定しない'],
 ['S2_import','boundary',[],'C が A と B から同じ名前・同じ種類の X を import する。importedMemberships の説明(kerml10.txt 8284〜8286 行)により、区別できない取り込みは取り込まれないので S2 にしない','Q3'],
 ['S3_violation','violation',[['S3',3,'Q']],'型付けの型がパッケージに解決する(Type に適合しない)'],
 ['S3_ok','ok',[],'S3_violation と同じ形で、Q が部品の定義'],
 ['S3_shadow','violation',[['S3',3,'Q']],'D の暗黙の特殊化を通り越して外側で見つかる(D3 の印)。診断では解決済みとして扱う'],
 ['S3_outer','violation',[['S3',5,'Q']],'内側のパッケージ Q に解決する。パイロット実装は外側の部品の定義 Q に解決する(P1 の裁定 Q2: 本文どおりの差)'],
 ['S4_violation','violation',[['S4',2,'public import P::*;'],['S4',3,'protected import P::*;']],'根の名前空間の import に public・protected'],
 ['S4_ok','ok',[],'根の名前空間の import は private。パッケージの中の public import は対象外'],
 ['T1_violation','violation',[['T1',4,'type T ~ A ~ B;']],'型が共役の関係を 2 つ所有する。KerML の式の本体の中でだけ書ける(設計書 2.5 節: パイロット実装は式の本体を CalculationBody にしているので構文エラー)。T1 は照合できない項目(P2 の裁定)'],
 ['T1_ok','ok',[],'共役の関係が 1 つ'],
 ['T2_violation','violation',[['T2',3,'x'],['T2',4,'x']],'in の特徴を out で再定義する、向きなしで再定義する'],
 ['T2_ok','ok',[],'同じ向きで再定義する(inout を含む)'],
 ['T2_conjugated_ok','ok',[],'共役ポートを通すと x の向きは out になり、out で再定義すると合う'],
 ['T2_conjugated_violation','violation',[['T2',4,'x']],'共役ポートを通すと x の向きは out になり、in で再定義すると合わない'],
 ['T2_implicit_violation','violation',[['T2',3,'out item y;']],'行動の定義の引数の暗黙の再定義(KerML 8.4.2 checkFeatureParameterRedefinition)で、in の x を out の y が再定義する'],
 ['T2_implicit_ok','ok',[],'暗黙の再定義で向きが同じ'],
 ['T2_lib_unchecked','library',[],'B の最初の上位の型 Lib::X が未検査なので、directionOf をたどれない'],
 ['T3_violation','violation',[['T3',3,'a']],'端の特徴 a を、端でない特徴で再定義する'],
 ['T3_ok','ok',[],'端の特徴を端で再定義する'],
 ['T3_lib_end','library',[],'再定義される source は標準ライブラリの端の特徴(Connections::BinaryConnection)なので判定しない'],
 ['U1_violation','violation',[['U1',2,'variant part w;'],['U1',3,'variant part w;']],'variation でない使用・定義が variant を所有する'],
 ['U1_ok','ok',[],'variation の使用・定義が variant を所有する'],
 ['U4_violation','violation',[['U4',2,'part p;'],['U4',4,'item z;']],'ポートの定義・使用が所有する、ポートでない合成の使用'],
 ['U4_ok','ok',[],'参照の使用・属性・向きのある使用・ポートの使用'],
 ['U5_violation','violation',[['U5',5,'transition first s1 then s2;']],'並行状態の入れ子の状態どうしの遷移'],
 ['U5_ok_nested','ok',[],'遷移は並行でない状態 s1 の中のもので、始点・終点は s の入れ子のアクションでない'],
 ['U5_succession','ok',[],'並行状態の中の継承(succession)は遷移でない(本文の incomingTransition・outgoingTransition は TransitionUsage)'],
 ['U5_outside','violation',[['U5',7,'transition first s.s1 then s.s2;']],'並行状態の外が所有する遷移が、並行状態の入れ子の状態を始点・終点にする。パイロット実装は出さない(本文どおりの差(U5))','Q4'],
 ['U5_lib_unresolved','library',[],'遷移の始点・終点が未検査'],
 ['U6_violation','violation',[['U6',6,'accept T']],'始点がアクション(状態でない)で、引き金を持つ'],
 ['U6_ok','ok',[],'始点が状態'],
 ['U6_start','library',[],'start は内蔵する表の Actions::Action::start に解決するが、状態の定義では States::StateAction の start(状態)が再定義している。始点が内蔵する表の項目なので判定しない','Q5'],
 ['U6_lib_unresolved','library',[],'遷移の始点が未検査'],
];
const cases = [];
for (const [name, kind, exp, note, pending] of C) {
  const file = name + '.sysml';
  const text = fs.readFileSync(D + file, 'utf8');
  const lines = text.split('\n');
  const expect = exp.map(([item, line, t]) => {
    const L = lines[line - 1];
    const re = /^[A-Za-z_]\w*$/.test(t) ? new RegExp('(?<![\\w])' + t + '(?![\\w])', 'g') : null;
    let col = -1;
    if (re) { const ms = [...L.matchAll(re)]; if (ms.length !== 1) throw new Error(`${file} ${line} ${t}: ${ms.length}`); col = ms[0].index; }
    else { col = L.indexOf(t); if (col < 0 || L.indexOf(t, col + 1) >= 0) throw new Error(`${file} ${line} ${t}`); }
    return { item, line, col: col + 1, text: t };
  });
  const c = { file, kind, expect, note };
  if (pending) c.ruling = pending;
  cases.push(c);
}
const files = fs.readdirSync(D).filter(f => f.endsWith('.sysml')).sort();
const listed = new Set(cases.map(c => c.file));
for (const f of files) if (!listed.has(f)) throw new Error('not listed ' + f);
const out = {
  description: '意味エラーの最小の入力と、このアプリが出す結果の期待(GR5 指示書 5 章)。line・col は 1 から数え、col は範囲の始まり。text は範囲の原文。kind: violation(違反する)・ok(違反しない)・library(標準ライブラリがないと判定しない)・boundary(裁定で期待を決めた境目)。ruling はその期待が依存する P2 の裁定の番号(reports/GR5/P2_cases_*.md の 8 章)。T4 は P1 の裁定 Q1 で検査しない項目に移したので入力を置かない',
  items: ['S1','S2','S3','S4','T1','T2','T3','U1','U4','U5','U6'],
  cases,
};
fs.writeFileSync(D + 'manifest.json', JSON.stringify(out, null, 1) + '\n');
console.log(cases.length, 'cases');
