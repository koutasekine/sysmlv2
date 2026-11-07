// 図からの編集の検査(GR15 指示書 4 章・6 章、GR16 指示書 4 章、設計書 10 章の「図からの編集」)。Node.js で実行する。
//
// 使い方:
//   node tests/edit/run.mjs [--interval 60] [--v-interval 16] [--a-interval 24] [--ac-interval 1] [--x-interval 60] [--out out/GR15/edit]
//
//   E1 名前の変更の最小の入力: コメント(注)を挟んだ修飾名・'…' の名前・短い名前・別名・特徴の連鎖・再定義 :>>・import・名前を書かない再定義の特徴を名前で指す参照(GR15 の E2)、
//      名前を受け継ぐ variant・perform を指す参照(GR17 の E3。P2 で戻した 2 件を含む)で、
//      書き換えた後のテキストが期待するものと 1 文字も違わない(書き換えた箇所の外の注・改行・字下げを保つ)。拒否する条件の入力で、
//      期待する理由で拒否する
//   E2 「例を読み込む」の例(src/app/sample.sysml)の、名前を宣言したすべての要素で、名前を引用符の要らない名前と要る名前の
//      2 通りに変える。D3 の印の判定を GR14 の終わりのもの(D2 を切ったもの)と今(D2 を入れたもの)の両方で行う。書き換え後の確かめで戻した操作が
//      0 件、拒否した操作の理由がどれも設計書 8 章の条件に当たる。拒否の件数と理由の一覧を --out に書く
//   E3 309 ファイル(out/files309.txt)の各ファイルの、名前を宣言した要素を記述の順に並べ、--interval ごとに選んだもので、E2 と同じ 2 通り
//      (D は既定のまま)。戻した操作が 0 件、拒否の理由がどれも 8 章の条件に当たる
//   V1 view を書き足すコマンドの最小の入力: 書き足す形(すべてのビューで expose 範囲::**。GR15 の V3)・場所(持ち主のパッケージの最後のメンバーの後ろ、範囲がパッケージなら
//      その持ち主、根の名前空間ならファイルの末尾)・字下げ・名前(同じ名前があれば 2、3、…、引用符)・範囲の名前(修飾名)が期待どおり。
//      名前で指せない範囲(根の名前空間・名前のない要素)と範囲が view のときは拒否する
//   V2 例: そのままでは view があるので候補はすべて view(書き足さない)。例から view の宣言を除いたテキストで、6 つのビューの全候補に書き足す
//   V3 309 ファイル(view を持たないもの)から、ビューごとに候補を記述の順に並べ --v-interval ごとに選んだもの
//   V2・V3 は、書き足した後の確かめ(構文エラーなし、範囲の名前の解決、モデルの差分が足した view とその中身だけ)で戻した操作 0 件、
//   拒否の理由が名前で指せない範囲か範囲が view。書き足した view の図と、書き足す前の候補の図を構造で比べ、違う候補の数と種類を
//   書く(図の枠、P(パッケージの箱)による入れ子の違い、view の箱が増えることによる違いは数えない。違いは合否に数えない)
//   V4 画面の処理(V を既定に入れたとき): Worker(src/app/worker.js)の run が「view を書き足す」のボタンを押せるか(例は範囲が view
//      なので押せない、view のないテキストは押せる、根の名前空間は押せない)を返し、appendView が appendView と同じ編集と書き足した
//      view の候補を返す。上の帯の「範囲」の選択欄の右にボタンがあり、画面は execCommand('insertText') で入れる(取り消しで戻せる)
//   E4 画面の処理(E を既定に入れたとき。GR15 の E2): Worker の run が名前の変更を使えることを返し、renameInfo が図の節点の要素の
//      名前と短い名前を返し、rename が renameElement と同じテキストになる 1 か所の置き換えを返す。拒否は理由だけを返す。構文エラーの間は
//      使えない。画面は execCommand('insertText') で入れる
//   A1 追加(GR16 の A。src/edit/add.js)の最小の入力: 本体のない宣言(;)・空の本体・タブの字下げ・最後のメンバーの行の注・引用符の要る名前・
//      型あり・型なし・共役のポート・向き・修飾名の型・パッケージへの部品・connect・interface 名前 : 型 connect・入れ子の部品の間の接続(最も
//      内側の共通の持ち主に書く)・型から受け継いだポートの間の接続で、書き足した後のテキストが期待するものと 1 文字も違わない。S2・名前で
//      指せない端・D3 の印・空の名前・足せない種類・構文エラーの間は、期待する理由で拒否する
//   A2 例の、部品の定義・使用(src/edit/add.js の isPartOwner)のそれぞれに、部品(型あり・型なし)とポート(向きと型あり・どちらもなし)を足す。
//      相互接続ビューの候補(例では view)の図で、同じ部品の箱の中の 2 つのポートのすべての組(図をまたいで同じ組は 1 回。例の connect・
//      interface … connect と同じ組を除く)に、connect と interface 名前 : 型 connect の 2 つの形で接続を足す
//   A3 309 ファイルの部品の定義・使用を記述の順に並べ --a-interval 個ごとに選んだものに A2 と同じ 4 つの操作を行い、相互接続ビューの部品の
//      候補を --ac-interval 個ごとに選び、その図のポートを記述の順に 2 つずつ組にしたもの(同じ部品の箱の中のもの)に connect を足す
//   A2・A3 は、書き足した後の確かめで戻した操作 0 件(A を既定に入れたとき。src/edit/index.js の EDIT16.A)、拒否の理由がどれも 8 章の条件に当たる
//   X1 削除(GR16 の X。src/edit/remove.js)の最小の入力: 行ごと消す・同じ行にほかの文があるとき・直前の行の注を残す・本体と中身ごと・CR LF・
//      端がその要素や中のものを指す connect・interface・flow・bind・first … then …・then action x の then・メッセージを一緒に消す、で、消した後の
//      テキストが期待するものと 1 文字も違わない。型付け・expose・再定義・特殊化と式の中の参照が残るときは、箇所(行と列)の一覧を付けて拒否する
//      参照でない暗黙のつながり(遷移の省いた始点・暗黙の再定義・位置のずれ。remove.js の X_IMPLICIT の T・R・P、P2b から既定)が残るときも、
//      箇所の一覧と、理由の文につながりの種類を付けて拒否する
//   X2 例の、宣言したすべての要素(src/edit/remove.js の declaredElements)で削除を試す
//   X3 309 ファイルの宣言した要素を記述の順に並べ --x-interval 個ごとに選んだもので削除を試す
//   X2・X3 は、消した後の確かめで戻した操作 0 件(X を既定に入れたとき。EDIT16.X)、拒否の理由がどれも 8 章の条件に当たる
//   AX4 画面の処理(A・X を既定に入れたとき。GR16 P3): Worker の run が A・X を使えることを返し、editInfo が選んだ要素に出す操作と型の
//      候補を返し、add・connect・deletePlan・delete が本体(addPort・addConnection・deletePlan・deleteElement)と同じテキストになる
//      1 か所の置き換えと選ぶ要素を返す。拒否は理由と箇所だけを返す。構文エラーの間は使えない。画面は insertEdit で入れ、「接続を足す」の
//      途中は Esc か「やめる」で抜け、構文エラーの間は編集欄を使えなくする
//   E2・E3 の「戻した操作 0 件」は、E を既定に入れたとき(src/edit/index.js の EDIT15.E)だけ合否に数える。入れていないときは件数を書く。
//   P  「書き方」の表の例をすべてつないだテキスト(本体の断片は包み、前の例と重なる最上位の名前は付け替える)が、構文エラー 0・意味エラー 0(GR17 の P)
//   全体の時間は記録するだけで、合否に使わない(GR20 の Z1。設計書 10 章。GR19 までは 15 分以内を合否にしていた)。失敗が 1 つでもあれば終了コード 1 で終わる。

import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { decodeUtf8 } from '../../src/parser/index.js';
import { analyze, renameElement, EDIT15, tokensOf, writtenName } from '../../src/edit/index.js';
import { unquote } from '../../src/parser/lexer.js';
import { appendView, VIEW_DEFS } from '../../src/edit/view.js';
import { EDIT16, EDIT17, positionsOf } from '../../src/edit/index.js';
import { deleteElement, deletePlan, declaredElements } from '../../src/edit/remove.js';
import { addPart, addPort, addConnection, typeCandidates, isPartOwner } from '../../src/edit/add.js';
import { checkSemantics } from '../../src/model/semantic.js';
import { prepareView, renderInterconnection, renderGeneral, renderStateTransition, renderActionFlow, renderSequence, renderTables } from '../../src/view/index.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
process.chdir(ROOT);
const arg = (k, d) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : d);
// GR17 P8: 索引を既定に入れて遅くなり、5 つの検査の合計が 15 分を超えた(998.6 秒)ので、E3・V3・A3 の間隔を広げた(予定の red の 1)
// GR18 の F2(GR18 指示書 2.4 節): GR17 P8 で広げる前(E3 30、V3 8、A3 12)に戻した
const INTERVAL = Number(arg('--interval', 30)); // GR16 P2: A・X の検査を足したので、全体が 5 分以内に収まるよう 20 → 30。GR17 P8: 30 → 60。GR18 P5: 60 → 30
const V_INTERVAL = Number(arg('--v-interval', 8)); // GR16 P2: 5 → 8(同じ理由)。GR17 P8: 8 → 16。GR18 P5: 16 → 8
const A_INTERVAL = Number(arg('--a-interval', 12));   // A3: 部品の定義・使用を何個ごとに選ぶか。GR17 P8: 12 → 24。GR18 P5: 24 → 12
const AC_INTERVAL = Number(arg('--ac-interval', 1));  // A3: 相互接続ビューの候補を何個ごとに選ぶか
const X_INTERVAL = Number(arg('--x-interval', 60));  // X3: 宣言した要素を何個ごとに選ぶか
const OUT = arg('--out', 'out/GR15/edit');
fs.mkdirSync(OUT, { recursive: true });
const t0 = performance.now();
let passes = 0, failures = 0;
const check = (ok, what, detail = '') => { if (ok) passes++; else { failures++; console.log(`  失敗: ${what}${detail ? ` ${detail}` : ''}`); } };
const section = (s) => console.log(`\n== ${s}`);
// 設計書 8 章の拒否する条件に当たる理由の分類(src/edit/index.js の code)
const RULE8 = new Set(['syntax', 'not-user', 'undeclared', 'empty', 'unchecked-refs', 'S2']);
const named = (tree) => { const out = []; (function w(e) { if ((e.name !== undefined || e.shortName !== undefined) && e.end > e.start) out.push(e); e.owned.forEach(w); e.related.forEach(w); })(tree); return out; };
const find = (tree, name) => named(tree).find(e => e.name === name || e.shortName === name) ?? null;
const lineOf = (text, at) => text.slice(0, at).split(/\r\n|\r|\n/).length;

// ---- E1
console.log(`既定に入れた項目: ${Object.entries(EDIT15).filter(([, v]) => v).map(([k]) => k).join('・') || 'なし'}`);
section('E1. 名前の変更の最小の入力');
{
  const cases = [
    { name: '注を挟んだ修飾名と字下げ', text: 'package P {\n    part def A; // 定義\n    part a : P:: //* 注 */ A;\n    part b : P::\n        A; /* 注釈 */\n}\n', el: 'A', to: '温度 センサ',
      want: "package P {\n    part def '温度 センサ'; // 定義\n    part a : P:: //* 注 */ '温度 センサ';\n    part b : P::\n        '温度 センサ'; /* 注釈 */\n}\n" },
    { name: "'…' の名前を引用符の要らない名前に", text: "package P { part def 'A B'; part a : P::'A B'; }", el: 'A B', to: 'C', want: 'package P { part def C; part a : P::C; }' },
    { name: 'キーワードと同じ名前と、エスケープ', text: 'package P { part def A; part a : A; }', el: 'A', to: "it's \\ part", want: "package P { part def 'it\\'s \\\\ part'; part a : 'it\\'s \\\\ part'; }" },
    { name: 'キーワードの名前', text: 'package P { part def A; part a : A; }', el: 'A', to: 'part', want: "package P { part def 'part'; part a : 'part'; }" },
    { name: '短い名前', text: 'package P { part def <S> Long; part a : S; part b : Long; }', el: 'Long', which: 'shortName', to: 'T', want: 'package P { part def <T> Long; part a : T; part b : Long; }' },
    { name: '短い名前を持つ要素の名前', text: 'package P { part def <S> Long; part a : S; part b : Long; }', el: 'Long', to: 'L', want: 'package P { part def <S> L; part a : S; part b : L; }' },
    { name: '別名(別名で書いた参照は変えず、for の参照は変える)', text: 'package P { part def Long; alias Al for Long; part b : Al; part c : Long; }', el: 'Long', to: 'L2', want: 'package P { part def L2; alias Al for L2; part b : Al; part c : L2; }' },
    { name: '特徴の連鎖の途中の区切り', text: 'part def E { port p; } part def V { part e : E; } part v : V; part w { connect v.e.p to v.e.p; }', el: 'e', to: 'eng', want: 'part def E { port p; } part def V { part eng : E; } part v : V; part w { connect v.eng.p to v.eng.p; }' },
    { name: '特徴の連鎖の最後の区切り', text: 'part def E { port p; } part def V { part e : E; } part v : V; part w { connect v.e.p to v.e.p; }', el: 'p', to: 'q', want: 'part def E { port q; } part def V { part e : E; } part v : V; part w { connect v.e.q to v.e.q; }' },
    { name: '再定義 :>>', text: 'part def A { attribute m; } part def B :> A { attribute :>> m; }', el: 'm', to: 'n', want: 'part def A { attribute n; } part def B :> A { attribute :>> n; }' },
    { name: 'import の名前空間', text: 'package Q { part def X; } package P { private import Q::X; part a : X; }', el: 'Q', to: 'R', want: 'package R { part def X; } package P { private import R::X; part a : X; }' },
    { name: 'import で取り込んだ要素', text: 'package Q { part def X; } package P { private import Q::*; part a : X; }', el: 'X', to: 'Y', want: 'package Q { part def Y; } package P { private import Q::*; part a : Y; }' },
    // GR15 の E2(設計書 8 章): 名前を書かない再定義の特徴を名前で指す参照も書き換える。P3 で戻した SimpleVehicleModel.sysml の
    // lugNutCompositePort(943・958 行の port :>>lugNutCompositePort と、953 行の connect wheel1.lugNutCompositePort)と、
    // speedSensorPort(791・802 行の 2 段の port redefines speedSensorPort と、817 行の message … from speedSensor.speedSensorPort.…)を最小の入力にしたもの
    { name: '名前を書かない再定義 :>> の特徴を名前で指す参照', text: 'part def LP { port n; } part def W { port lp : LP; } part def H { part w1 : W { port :>> lp : LP; } part w2 : W { port :>> lp : LP; } connect w1.lp to w2.lp; }', el: 'lp', to: 'q',
      want: 'part def LP { port n; } part def W { port q : LP; } part def H { part w1 : W { port :>> q : LP; } part w2 : W { port :>> q : LP; } connect w1.q to w2.q; }' },
    { name: '2 段の名前を書かない再定義 redefines の特徴を名前で指す参照', text: 'port def SP { out item s; } part def S { port sp : SP; } part def A { part s : S; } part a : A { part redefines s { port redefines sp { event occurrence sent; } } part t : S { port redefines sp { event occurrence got; } } message m from s.sp.sent to t.sp.got; connect s.sp to t.sp; }', el: 'sp', to: '速度 ポート',
      want: "port def SP { out item s; } part def S { port '速度 ポート' : SP; } part def A { part s : S; } part a : A { part redefines s { port redefines '速度 ポート' { event occurrence sent; } } part t : S { port redefines '速度 ポート' { event occurrence got; } } message m from s.'速度 ポート'.sent to t.'速度 ポート'.got; connect s.'速度 ポート' to t.'速度 ポート'; }" },
    // GR17 の E3(設計書 8 章 v17.2): 名前を宣言せず実効の名前を受け継ぐ要素全般(variant・perform など)を指す参照も書き換える。
    // GR17 P2 で戻した VehicleVariabilityModel.sysml の generateTorque6Cyl(57 行の action generateTorque6Cyl、129 行の variant generateTorque6Cyl;、
    // 141 行の generateTorque::generateTorque6Cyl。2 通りの新しい名前)を最小の入力にしたもの(名前は、索引を切ったときに D3 の印が付かない日本語の名前にした)
    { name: 'GR17 P2 で戻した 1 件目: 名前を受け継ぐ variant を修飾名で指す参照(引用符の要らない名前へ)', text: "package '車' {\n    action def '発生';\n    action '4 気筒' : '発生';\n    action '6 気筒' : '発生';\n    action '動力' {\n        variation action 'トルク' : '発生' {\n            variant '4 気筒';\n            variant '6 気筒';\n        }\n        assert constraint {\n            'トルク' == 'トルク'::'4 気筒' xor\n            'トルク' == 'トルク'::'6 気筒'\n        }\n    }\n}\n", el: '6 気筒', to: 'gr15_n6',
      want: "package '車' {\n    action def '発生';\n    action '4 気筒' : '発生';\n    action gr15_n6 : '発生';\n    action '動力' {\n        variation action 'トルク' : '発生' {\n            variant '4 気筒';\n            variant gr15_n6;\n        }\n        assert constraint {\n            'トルク' == 'トルク'::'4 気筒' xor\n            'トルク' == 'トルク'::gr15_n6\n        }\n    }\n}\n" },
    { name: 'GR17 P2 で戻した 2 件目: 名前を受け継ぐ variant を修飾名で指す参照(引用符の要る名前へ)', text: "package '車' {\n    action def '発生';\n    action '4 気筒' : '発生';\n    action '6 気筒' : '発生';\n    action '動力' {\n        variation action 'トルク' : '発生' {\n            variant '4 気筒';\n            variant '6 気筒';\n        }\n        assert constraint {\n            'トルク' == 'トルク'::'4 気筒' xor\n            'トルク' == 'トルク'::'6 気筒'\n        }\n    }\n}\n", el: '6 気筒', to: '名前 6',
      want: "package '車' {\n    action def '発生';\n    action '4 気筒' : '発生';\n    action '名前 6' : '発生';\n    action '動力' {\n        variation action 'トルク' : '発生' {\n            variant '4 気筒';\n            variant '名前 6';\n        }\n        assert constraint {\n            'トルク' == 'トルク'::'4 気筒' xor\n            'トルク' == 'トルク'::'名前 6'\n        }\n    }\n}\n" },
    { name: '名前を受け継ぐ variant を特徴の連鎖で指す参照', text: "package T { action '速い'; action '遅い'; part def M { variation action '動き' { variant '速い'; variant '遅い'; } } part m : M; action z :> m.'動き'.'速い'; }", el: '速い', to: 'fast',
      want: "package T { action fast; action '遅い'; part def M { variation action '動き' { variant fast; variant '遅い'; } } part m : M; action z :> m.'動き'.fast; }" },
    { name: '名前を受け継ぐ perform を特徴の連鎖で指す参照と、その perform を名前を書かずに再定義する特徴', text: "package T { action '手順'; part def B { perform '手順'; } part b : B { action :>> '手順'; } action z :> b.'手順'; }", el: '手順', to: '動作 手順',
      want: "package T { action '動作 手順'; part def B { perform '動作 手順'; } part b : B { action :>> '動作 手順'; } action z :> b.'動作 手順'; }" },
  ];
  for (const c of cases) {
    const a = analyze(c.text);
    const r = renameElement({ text: c.text, analysis: a, element: find(a.tree, c.el), which: c.which ?? 'name', newName: c.to });
    check(r.ok && r.text === c.want, `E1. ${c.name}`, r.ok ? JSON.stringify(r.text) : `${r.code} ${r.reason}`);
  }
  // GR17 P8: 標準ライブラリの索引を既定に入れたので、最初の 2 件は拒否されず書き換わる。期待値を置き換えた(予定の red の 1。前は
  // どちらも code: 'unchecked-refs'。前の期待値で流したログは out/GR17/logs/P8/before/edit.log)。want があるものは、書き換えた後のテキストを比べる
  const rejects = [
    { name: '参照しうる箇所に未検査の参照(8 章。GR17 P8 から ScalarValues::Real は索引の要素に解決)', text: 'part def A { attribute x : ScalarValues::Real; } part def Real;', el: 'Real', to: 'R2', want: 'part def A { attribute x : ScalarValues::Real; } part def R2;' },
    { name: '参照しうる箇所に D3 の印の参照(8 章。GR17 P8 から印なし)', text: 'part def E; part def V { part e : E; }', el: 'E', to: 'E2', want: 'part def E2; part def V { part e : E2; }' },
    { name: '新しい名前の参照しうる箇所に未検査の参照(8 章)', text: 'part def A { attribute x : Real; } part def B;', el: 'B', to: 'Real', code: 'unchecked-refs' },
    { name: '区別できなくなる(S2、8 章)', text: 'package P { part def A; part def B; }', el: 'A', to: 'B', code: 'S2' },
    { name: '空の名前(8 章)', text: 'package P { part def A; }', el: 'A', to: '', code: 'empty' },
  ];
  for (const c of rejects) {
    const a = analyze(c.text);
    const r = renameElement({ text: c.text, analysis: a, element: find(a.tree, c.el), newName: c.to });
    check(c.want !== undefined ? r.ok && r.text === c.want : !r.ok && !r.reverted && r.code === c.code, `E1. 拒否: ${c.name}`, r.ok ? r.text : `${r.code} ${r.reason}`);
  }
  {
    const text = 'part def A { attribute m; } part def B :> A { attribute :>> m; }';
    const a = analyze(text);
    let el = null;
    (function w(e) { if (e.kind === 'AttributeUsage' && e.name === undefined) el = e; e.owned.forEach(w); e.related.forEach(w); })(a.tree);
    const r = renameElement({ text, analysis: a, element: el, newName: 'k' });
    check(!r.ok && r.code === 'undeclared', 'E1. 拒否: 名前を受け継ぐだけの再定義(8 章)', `${r.code}`);
  }
}

// 1 つのテキストの、選んだ要素ごとに 2 通りの名前に変える。→ { ops, ok, rejected: [{ el, to, code, reason }], reverted: [...] }
function renameAll(file, text, pick, opts) {
  const a = analyze(text, opts);
  const res = { ops: 0, ok: 0, rejected: [], reverted: [], maxMs: 0 };
  if (!a.ok) return res;
  const els = pick(named(a.tree));
  els.forEach((el, i) => {
    const which = el.name !== undefined ? 'name' : 'shortName';
    for (const to of [`gr15_n${i}`, `名前 ${i}`]) {
      const s = performance.now();
      const r = renameElement({ text, analysis: a, element: el, which, newName: to }, opts);
      res.maxMs = Math.max(res.maxMs, performance.now() - s);
      res.ops++;
      const row = { file, line: lineOf(text, el.start), el: el[which], kind: el.kind, to, code: r.code, reason: r.reason, details: r.details };
      if (r.ok) res.ok++;
      else if (r.reverted) res.reverted.push(row);
      else res.rejected.push(row);
    }
  });
  return res;
}
const summarize = (r) => { const by = {}; for (const x of r.rejected) by[x.code] = (by[x.code] ?? 0) + 1; return by; };

// ---- E2
section('E2. 例の、名前を宣言したすべての要素');
{
  const text = fs.readFileSync('src/app/sample.sysml', 'utf8');
  const out = {};
  for (const [label, d3Ascii] of [['D2 を切ったもの', false], ['D2 を入れたもの', true]]) {
    const s = performance.now();
    const r = renameAll('src/app/sample.sysml', text, (els) => els, { d3Ascii });
    out[d3Ascii ? 'd3on' : 'd3off'] = r;
    console.log(`  ${label}: 操作 ${r.ops}(要素 ${r.ops / 2})、変えた ${r.ok}、拒否 ${r.rejected.length} ${JSON.stringify(summarize(r))}、戻した ${r.reverted.length}、${((performance.now() - s) / 1000).toFixed(1)} 秒`);
    if (EDIT15.E) check(r.reverted.length === 0, `E2. ${label}: 書き換え後の確かめで戻した操作 0 件`, JSON.stringify(r.reverted.slice(0, 3)));
    check(r.rejected.every(x => RULE8.has(x.code)), `E2. ${label}: 拒否の理由がどれも 8 章の条件に当たる`, JSON.stringify(r.rejected.filter(x => !RULE8.has(x.code)).slice(0, 3)));
  }
  fs.writeFileSync(path.join(OUT, 'E2_sample.json'), JSON.stringify(out, null, 1) + '\n');
}

// ---- E2(GR19): 入門用の例(src/app/sample_intro.sysml。GR19 の U3)も、名前を宣言したすべての要素で同じ 2 通り(D2 を入れたもの)
section('E2. 入門用の例の、名前を宣言したすべての要素');
{
  const text = fs.readFileSync('src/app/sample_intro.sysml', 'utf8');
  const s = performance.now();
  const r = renameAll('src/app/sample_intro.sysml', text, (els) => els, { d3Ascii: true });
  console.log(`  操作 ${r.ops}(要素 ${r.ops / 2})、変えた ${r.ok}、拒否 ${r.rejected.length} ${JSON.stringify(summarize(r))}、戻した ${r.reverted.length}、${((performance.now() - s) / 1000).toFixed(1)} 秒`);
  if (EDIT15.E) check(r.reverted.length === 0, 'E2. 入門用の例: 書き換え後の確かめで戻した操作 0 件', JSON.stringify(r.reverted.slice(0, 3)));
  check(r.rejected.every(x => RULE8.has(x.code)), 'E2. 入門用の例: 拒否の理由がどれも 8 章の条件に当たる', JSON.stringify(r.rejected.filter(x => !RULE8.has(x.code)).slice(0, 3)));
  fs.writeFileSync(path.join(OUT, 'E2_sample_intro.json'), JSON.stringify(r, null, 1) + '\n');
}

// ---- E3
section(`E3. 309 ファイルから選んだ要素(各ファイルの名前を宣言した要素を記述の順に並べ、${INTERVAL} 個ごとに 1 つ)`);
{
  const files = fs.readFileSync('out/files309.txt', 'utf8').split('\n').filter(Boolean);
  const all = { ops: 0, ok: 0, rejected: [], reverted: [], maxMs: 0, files: 0 };
  const s = performance.now();
  for (const f of files) {
    const r = renameAll(f, decodeUtf8(fs.readFileSync(f)), (els) => els.filter((_, i) => i % INTERVAL === 0), {});
    if (!r.ops) continue;
    all.files++; all.ops += r.ops; all.ok += r.ok; all.rejected.push(...r.rejected); all.reverted.push(...r.reverted); all.maxMs = Math.max(all.maxMs, r.maxMs);
  }
  console.log(`  ファイル ${all.files}、操作 ${all.ops}(要素 ${all.ops / 2})、変えた ${all.ok}、拒否 ${all.rejected.length} ${JSON.stringify(summarize(all))}、戻した ${all.reverted.length}、1 操作の最大 ${Math.round(all.maxMs)} ms、${((performance.now() - s) / 1000).toFixed(1)} 秒`);
  for (const x of all.reverted.slice(0, 10)) console.log(`  戻した: ${x.file} ${x.line} 行 ${x.el}(${x.kind})→ ${x.to}: ${x.reason}`);
  if (EDIT15.E) check(all.reverted.length === 0, 'E3. 書き換え後の確かめで戻した操作 0 件', `${all.reverted.length} 件`);
  else console.log(`  E を既定に入れていない(EDIT15.E が false)ので、戻した操作 ${all.reverted.length} 件を合否に数えない`);
  check(all.rejected.every(x => RULE8.has(x.code)), 'E3. 拒否の理由がどれも 8 章の条件に当たる', JSON.stringify(all.rejected.filter(x => !RULE8.has(x.code)).slice(0, 3)));
  fs.writeFileSync(path.join(OUT, 'E3_files.json'), JSON.stringify({ interval: INTERVAL, ...all }, null, 1) + '\n');
}

// ---- V
const VIEWS = {
  general: [renderGeneral, 'generalCandidates'], interconnection: [renderInterconnection, 'candidates'], 'action-flow': [renderActionFlow, 'actionCandidates'],
  'state-transition': [renderStateTransition, 'stateCandidates'], sequence: [renderSequence, 'sequenceCandidates'], grid: [renderTables, 'tableCandidates'],
};
const RULE5 = new Set(['unnamed', 'scope-is-view']);
// 図の構造の比べ(3.4 節)。図の枠、パッケージの箱による入れ子(親がパッケージの箱か、パッケージの箱の記号の違い)、view の箱は数えない
function compareDiagrams(rb, ra) {
  const kinds = {};
  const add = (k, x) => { (kinds[k] ??= []).push(x); };
  if (rb.tables || ra.tables) { if (JSON.stringify(rb.tables) !== JSON.stringify(ra.tables)) add('tables', ''); return kinds; }
  const sb = rb.structure, sa = ra.structure;
  if (!sb || !sa) { add('no-structure', ''); return kinds; }
  const sym = (n) => n.symbol.replace(/^param-[lrtb]$/, 'param').replace(/^proxy-[vh]$/, 'proxy');
  const pkg = (n) => !!n && /^package/.test(n.symbol);
  const isView = (n) => n?.info?.kind === 'ViewUsage';
  const B = new Map(sb.nodes.map(n => [n.id, n])), A = new Map(sa.nodes.map(n => [n.id, n]));
  for (const [id, b] of B) {
    const a = A.get(id);
    if (!a) { add('node-missing', `${sym(b)} ${b.label}`); continue; }
    if (sym(a) !== sym(b) && !(pkg(a) && pkg(b))) add('symbol', `${b.label}: ${sym(b)} → ${sym(a)}`);
    if (a.label !== b.label) add('label', `${b.label} → ${a.label}`);
    if (JSON.stringify(a.compartments ?? null) !== JSON.stringify(b.compartments ?? null)) add('compartments', b.label);
    if (!!a.ellipsis !== !!b.ellipsis) add('ellipsis', `${b.label}: ${!!b.ellipsis} → ${!!a.ellipsis}`);
    if (a.parent !== b.parent && !pkg(B.get(b.parent)) && !pkg(A.get(a.parent))) add('parent', `${b.label}: ${B.get(b.parent)?.label ?? '最上位'} → ${A.get(a.parent)?.label ?? '最上位'}`);
  }
  for (const [id, a] of A) if (!B.has(id) && !isView(a)) add('node-extra', `${sym(a)} ${a.label}`);
  const ek = (e) => `${e.symbol}|${e.from}|${e.to}|${e.label}|${e.markers.join(',')}`;
  const cnt = (es, S) => { const m = new Map(); for (const e of es) { if (isView(S.get(e.from)) || isView(S.get(e.to))) continue; m.set(ek(e), (m.get(ek(e)) ?? 0) + 1); } return m; };
  const eb = cnt(sb.edges, B), ea = cnt(sa.edges, A);
  for (const [k, n] of eb) if ((ea.get(k) ?? 0) < n) add('edge-missing', k);
  for (const [k, n] of ea) if ((eb.get(k) ?? 0) < n) add('edge-extra', k);
  return kinds;
}
// テキスト text の、ビュー view の候補 ids に書き足して確かめる
function appendAll(file, text, view, pick) {
  const [render, key] = VIEWS[view];
  const p = prepareView(text);
  const res = { ops: 0, ok: 0, rejected: [], reverted: [], diff: [], diffKinds: {}, noCandidate: [] };
  if (!p.ok) return res;
  const analysis = { ok: true, tree: p.ctx.tree, model: p.ctx.model };
  for (const c of pick(p[key])) {
    res.ops++;
    const r = appendView({ text, analysis, scope: c.el, view });
    const row = { file, view, candidate: c.id, code: r.code, reason: r.reason, details: r.details };
    if (!r.ok) { (r.reverted ? res.reverted : res.rejected).push(row); continue; }
    res.ok++;
    const p2 = prepareView(r.text);
    const c2 = p2.ok && p2[key].find(x => x.id === `view:${r.viewQname}`);
    if (!c2) { res.noCandidate.push(row); continue; }
    const k = compareDiagrams(render(p, c.id), render(p2, c2.id));
    if (Object.keys(k).length) { res.diff.push({ ...row, kinds: Object.fromEntries(Object.entries(k).map(([a, b]) => [a, b.slice(0, 3)])) }); for (const a of Object.keys(k)) res.diffKinds[a] = (res.diffKinds[a] ?? 0) + 1; }
  }
  return res;
}
const merge = (acc, r) => { for (const k of ['ops', 'ok']) acc[k] += r[k]; for (const k of ['rejected', 'reverted', 'diff', 'noCandidate']) acc[k].push(...r[k]); for (const [k, n] of Object.entries(r.diffKinds)) acc.diffKinds[k] = (acc.diffKinds[k] ?? 0) + n; return acc; };
const fresh = () => ({ ops: 0, ok: 0, rejected: [], reverted: [], diff: [], diffKinds: {}, noCandidate: [] });
const vline = (label, r) => { const by = {}; for (const x of r.rejected) by[x.code] = (by[x.code] ?? 0) + 1; return `  ${label}: 操作 ${r.ops}、書き足した ${r.ok}、拒否 ${r.rejected.length} ${JSON.stringify(by)}、戻した ${r.reverted.length}、候補が見つからない ${r.noCandidate.length}、図の違う候補 ${r.diff.length} ${JSON.stringify(r.diffKinds)}`; };

section('V1. view を書き足すコマンドの最小の入力');
{
  const named0 = (tree, name) => { let r = null; (function w(e) { if (!r && (e.name === name)) r = e; e.owned.forEach(w); e.related.forEach(w); })(tree); return r; };
  const cases = [
    { name: '持ち主のパッケージの最後のメンバーの後ろ(同じ行の注の後ろ)と字下げ', text: 'package P {\n    part def A {\n        part b;\n    }\n    part a : A; // 注\n}\n', scope: 'a', view: 'interconnection',
      want: "package P {\n    part def A {\n        part b;\n    }\n    part a : A; // 注\n    view 'aの相互接続ビュー' : StandardViewDefinitions::InterconnectionView { expose a::**; }\n}\n" },
    { name: '入れ子の要素は修飾名', text: 'package P {\n    part def A {\n        part b;\n    }\n}\n', scope: 'b', view: 'general',
      want: "package P {\n    part def A {\n        part b;\n    }\n    view 'bの一般ビュー' : StandardViewDefinitions::GeneralView { expose A::b::**; }\n}\n" },
    { name: '範囲がパッケージなら、その持ち主のパッケージ', text: 'package P {\n  package Q { part x; }\n}\n', scope: 'Q', view: 'general',
      want: "package P {\n  package Q { part x; }\n  view 'Qの一般ビュー' : StandardViewDefinitions::GeneralView { expose Q::**; }\n}\n" },
    { name: '持ち主が根の名前空間ならファイルの末尾', text: 'part def A;\npart a : A;', scope: 'a', view: 'action-flow',
      want: "part def A;\npart a : A;\nview 'aのアクションフロービュー' : StandardViewDefinitions::ActionFlowView { expose a::**; }" },
    { name: '同じ名前があれば 2、引用符の要る範囲の名前', text: "package P {\n  part def '温度 センサ' { part p; }\n  part '温度 センサの状態遷移ビュー';\n}\n", scope: '温度 センサ', view: 'state-transition',
      want: "package P {\n  part def '温度 センサ' { part p; }\n  part '温度 センサの状態遷移ビュー';\n  view '温度 センサの状態遷移ビュー2' : StandardViewDefinitions::StateTransitionView { expose '温度 センサ'::**; }\n}\n" },
    { name: 'シーケンスビューとグリッドビューの定義', text: 'package P {\n\tpart s;\n}\n', scope: 'P', view: 'grid',
      want: "package P {\n\tpart s;\n}\nview 'Pのグリッドビュー' : StandardViewDefinitions::GridView { expose P::**; }\n" },
  ];
  for (const c of cases) {
    const a = analyze(c.text);
    const r = appendView({ text: c.text, analysis: a, scope: named0(a.tree, c.scope), view: c.view });
    check(r.ok && r.text === c.want, `V1. ${c.name}`, r.ok ? JSON.stringify(r.text) : `${r.code} ${r.reason}`);
  }
  {
    const t = 'package P { part s; }';
    const a = analyze(t);
    const r = appendView({ text: t, analysis: a, scope: named0(a.tree, 's'), view: 'sequence' });
    check(r.ok && /StandardViewDefinitions::SequenceView \{ expose s::\*\*; \}/.test(r.text), 'V1. シーケンスビューの定義', r.ok ? r.text : r.reason);
  }
  const rej = [
    { name: '根の名前空間', text: 'part a;', scope: (a) => a.tree, code: 'unnamed' },
    { name: '名前のない要素', text: 'package P { part : A; part def A; }', scope: (a) => { let r = null; (function w(e) { if (!r && e.kind === 'PartUsage') r = e; e.owned.forEach(w); e.related.forEach(w); })(a.tree); return r; }, code: 'unnamed' },
    { name: '範囲が view', text: 'package P { part a; view v { expose a; } }', scope: (a) => named0(a.tree, 'v'), code: 'scope-is-view' },
  ];
  for (const c of rej) {
    const a = analyze(c.text);
    const r = appendView({ text: c.text, analysis: a, scope: c.scope(a), view: 'general' });
    check(!r.ok && !r.reverted && r.code === c.code, `V1. 拒否: ${c.name}`, r.ok ? r.text : `${r.code} ${r.reason}`);
  }
}

section('V2. 例');
{
  const text = fs.readFileSync('src/app/sample.sysml', 'utf8');
  const asIs = fresh();
  for (const v of Object.keys(VIEWS)) merge(asIs, appendAll('src/app/sample.sysml', text, v, (cs) => cs));
  console.log(vline('例のまま(候補はすべて view)', asIs));
  check(asIs.ok === 0 && asIs.rejected.every(x => x.code === 'scope-is-view'), 'V2. 例のまま: 候補はすべて view で、書き足さない');
  // 例から view の宣言(view を持つ所有の関係)を除いたテキスト
  const a = analyze(text);
  const cuts = [];
  (function w(e) { for (const m of e.owned) { if (m.related[0] && a.model.conforms(m.related[0].kind, 'ViewUsage')) cuts.push([m.start, m.end]); else w(m); } for (const r of e.related) w(r); })(a.tree);
  let stripped = text;
  for (const [s0, e0] of cuts.sort((x, y) => y[0] - x[0])) stripped = stripped.slice(0, s0) + stripped.slice(e0);
  const r2 = fresh();
  for (const v of Object.keys(VIEWS)) merge(r2, appendAll('src/app/sample.sysml(view を除いたもの)', stripped, v, (cs) => cs));
  console.log(`  例から view の宣言 ${cuts.length} 個を除いたテキスト`);
  console.log(vline('view を除いた例', r2));
  check(r2.reverted.length === 0, 'V2. 書き足した後の確かめで戻した操作 0 件', JSON.stringify(r2.reverted.slice(0, 3)));
  check(r2.rejected.every(x => RULE5.has(x.code)), 'V2. 拒否の理由が、名前で指せない範囲か範囲が view', JSON.stringify(r2.rejected.filter(x => !RULE5.has(x.code)).slice(0, 3)));
  console.log(`  書き足した view が描く範囲の候補にないもの(参考。合否に数えない): ${r2.noCandidate.length} 件`);
  fs.writeFileSync(path.join(OUT, 'V2_sample.json'), JSON.stringify({ asIs, stripped: r2 }, null, 1) + '\n');
}

section(`V3. 309 ファイル(view を持たないもの)の候補を、ビューごとに記述の順に並べ ${V_INTERVAL} 個ごとに 1 つ`);
{
  const files = fs.readFileSync('out/files309.txt', 'utf8').split('\n').filter(Boolean);
  const all = fresh(), per = {};
  const s = performance.now();
  let k = 0;
  const texts = files.map(f => ({ f, text: decodeUtf8(fs.readFileSync(f)) }));
  for (const v of Object.keys(VIEWS)) {
    per[v] = fresh();
    for (const { f, text } of texts) merge(per[v], appendAll(f, text, v, (cs) => cs.filter(c => c.kind !== 'view').filter(() => k++ % V_INTERVAL === 0)));
    merge(all, per[v]);
    console.log(vline(v, per[v]));
  }
  console.log(vline('合計', all) + `、${((performance.now() - s) / 1000).toFixed(1)} 秒`);
  for (const x of all.reverted.slice(0, 10)) console.log(`  戻した: ${x.file} ${x.view} ${x.candidate}: ${x.reason} ${JSON.stringify(x.details)}`);
  check(all.reverted.length === 0, 'V3. 書き足した後の確かめで戻した操作 0 件', `${all.reverted.length} 件`);
  check(all.rejected.every(x => RULE5.has(x.code)), 'V3. 拒否の理由が、名前で指せない範囲か範囲が view', JSON.stringify(all.rejected.filter(x => !RULE5.has(x.code)).slice(0, 3)));
  console.log(`  書き足した view が描く範囲の候補にないもの(参考。合否に数えない): ${all.noCandidate.length} 件 ${JSON.stringify(all.noCandidate.map(x => `${x.file.split('/').pop()} ${x.view} ${x.candidate}`))}`);
  fs.writeFileSync(path.join(OUT, 'V3_files.json'), JSON.stringify({ interval: V_INTERVAL, per, all }, null, 1) + '\n');
}

section('V4. 画面の処理(Worker と上の帯)');
if (EDIT15.V) {
  const sent = [];
  globalThis.self = globalThis;
  globalThis.postMessage = (m) => sent.push(m);
  await import('../../src/app/worker.js');
  const runW = (m) => { sent.length = 0; self.onmessage({ data: { type: 'run', id: 1, enabled: Object.keys(VIEWS), ...m } }); return sent.find(x => x.type === 'result'); };
  const appendW = (m) => { sent.length = 0; self.onmessage({ data: { type: 'appendView', id: 7, ...m } }); return sent.find(x => x.type === 'appendView'); };
  const sample = fs.readFileSync('src/app/sample.sysml', 'utf8');
  const r1 = runW({ text: sample, candidateId: null, view: 'general' });
  check(r1?.ok && r1.append && r1.append.enabled === false && /view/.test(r1.append.reason), 'V4. 例(範囲が view)ではボタンを押せない', JSON.stringify(r1?.append));
  const t2 = 'package P {\n    part def A { part b; }\n    part a : A;\n}\n';
  const r2 = runW({ text: t2, candidateId: null, view: 'interconnection' });
  check(r2?.ok && r2.append?.enabled === true, 'V4. view のないテキストではボタンを押せる', JSON.stringify(r2?.append));
  const w = appendW({ text: t2, candidateId: r2.candidate.id, view: 'interconnection' });
  const p2 = prepareView(t2);
  const direct = appendView({ text: t2, analysis: { ok: true, tree: p2.ctx.tree, model: p2.ctx.model }, scope: p2.candidates.find(c => c.id === r2.candidate.id).el, view: 'interconnection' });
  check(w?.ok && JSON.stringify(w.edits) === JSON.stringify(direct.edits) && w.viewCandidate === `view:${direct.viewQname}`, 'V4. Worker の appendView が、appendView と同じ編集と書き足した view の候補を返す', JSON.stringify(w));
  const t3 = w.edits.reduceRight((t, e) => t.slice(0, e.start) + e.text + t.slice(e.end), t2);
  const r3 = runW({ text: t3, candidateId: w.viewCandidate, view: 'interconnection' });
  check(r3?.ok && r3.candidate?.id === w.viewCandidate && r3.append?.enabled === false, 'V4. 書き足した後は、範囲が書き足した view になり、ボタンを押せない', JSON.stringify({ c: r3?.candidate, a: r3?.append }));
  const r4 = runW({ text: 'part a; part b;', candidateId: null, view: 'general' });
  check(r4?.ok && r4.append?.enabled === false, 'V4. 根の名前空間の範囲ではボタンを押せない', JSON.stringify(r4?.append));
  const r5 = runW({ text: 'part a {', candidateId: null, view: 'general' });
  check(r5 && !r5.ok && !r5.append, 'V4. 構文エラーの間は押せる判定を返さない(画面で押せなくする)');
  const tpl = fs.readFileSync('src/app/template.html', 'utf8'), main = fs.readFileSync('src/app/main.js', 'utf8');
  check(/<label>範囲 <select id="scope">[^\n]*<\/label>\n\s*<button id="btnAppendView" disabled[^>]*>view を書き足す<\/button>/.test(tpl), 'V4. 上の帯の「範囲」の選択欄の右に「view を書き足す」のボタンがある');
  check(main.includes("document.execCommand('insertText', false, e.text)") && /appendBtn\.disabled = !ok;/.test(main), 'V4. 画面はテキスト欄に execCommand(insertText)で入れ、押せないときはボタンを押せなくする');
} else console.log('  V を既定に入れていない');

// ---- E4(GR15 の E2。E を既定に入れたとき)
section('E4. 画面の処理(Worker と選んだ要素の編集欄)');
if (EDIT15.E) {
  const sent = [];
  globalThis.self = globalThis;
  globalThis.postMessage = (m) => sent.push(m);
  await import('../../src/app/worker.js');
  const send = (type, m) => { sent.length = 0; self.onmessage({ data: { type, id: 3, ...m } }); return sent.find(x => x.type === (type === 'run' ? 'result' : type)); };
  const sample = fs.readFileSync('src/app/sample.sysml', 'utf8');
  const r1 = send('run', { text: sample, candidateId: null, view: 'general', enabled: Object.keys(VIEWS) });
  check(r1?.ok && r1.rename === true, 'E4. run が名前の変更を使えることを返す');
  // 図の節点(原文の範囲と種類)から、名前と短い名前を返す
  // 選ぶのは、renameElement で変えられる最初の部品の定義
  const a = analyze(sample);
  const elOf = (n) => named(a.tree).find(e => e.start === n.src[0] && e.end === n.src[1] && e.kind === n.info.kind);
  const node = r1.structure.nodes.find(n => n.info?.kind === 'PartDefinition' && n.src && elOf(n) && renameElement({ text: sample, analysis: a, element: elOf(n), which: 'name', newName: '新しい 名前' }).ok);
  const el = elOf(node);
  const i1 = send('renameInfo', { text: sample, src: node.src, kind: node.info.kind });
  check(i1?.ok && i1.name === (el.name ?? null) && i1.shortName === (el.shortName ?? null), 'E4. renameInfo が、選んだ要素の宣言した名前と短い名前を返す', JSON.stringify(i1));
  // 書き換えは、renameElement と同じテキストになる 1 か所の置き換え
  const w = send('rename', { text: sample, src: node.src, kind: node.info.kind, which: 'name', newName: '新しい 名前' });
  const direct = renameElement({ text: sample, analysis: a, element: el, which: 'name', newName: '新しい 名前' });
  const t2 = w?.ok ? sample.slice(0, w.edit.start) + w.edit.text + sample.slice(w.edit.end) : null;
  check(w?.ok && direct.ok && t2 === direct.text, 'E4. Worker の rename が、renameElement と同じテキストになる 1 か所の置き換えを返す', JSON.stringify(w?.reason ?? null));
  // 拒否: 理由を返し、編集を返さない。入力は D3 の印によらず拒否される操作(GR15 P13。裁定 Q1): 例の '温度センサ' を、同じパッケージの
  // 部品の定義 'ファン' と同じ名前に変える(区別できなくなる。設計書 8 章の S2。D3 を入れても切っても(P12 の既定)、どちらの名前の参照にも D3 の印はない)
  const sensor = r1.structure.nodes.find(n => n.info?.name === '温度センサ' && n.info.kind === 'PartDefinition');
  const w2 = sensor ? send('rename', { text: sample, src: sensor.src, kind: sensor.info.kind, which: 'name', newName: 'ファン' }) : null;
  check(w2 && !w2.ok && !w2.edit && /区別できなくなる\(S2\)/.test(w2.reason), 'E4. 拒否した操作は、理由を返して編集を返さない', JSON.stringify(w2));
  const w3 = send('rename', { text: 'part a {', src: [0, 1], kind: 'PartUsage', which: 'name', newName: 'b' });
  check(w3 && !w3.ok, 'E4. 解析していないテキスト(描き直しの途中)では書き換えない');
  const r5 = send('run', { text: 'part a {', candidateId: null, view: 'general', enabled: Object.keys(VIEWS) });
  const i5 = send('renameInfo', { text: 'part a {', src: [0, 1], kind: 'PartUsage' });
  check(r5 && !r5.ok && i5 && !i5.ok && /構文エラー/.test(i5.reason), 'E4. 構文エラーの間は名前の変更を使えない', JSON.stringify(i5));
  const main = fs.readFileSync('src/app/main.js', 'utf8');
  check(/function insertEdit\(e\) \{[^}]*document\.execCommand\('insertText', false, e\.text\)/.test(main) && main.includes('insertEdit(m.edit)') && main.includes(".rename input, .rename button"),
    'E4. 画面はテキスト欄に execCommand(insertText)で 1 回で入れ、構文エラーの間は編集欄を使えなくする');
} else console.log('  E を既定に入れていない');

// ---- A(GR16。図からの編集の段階 2: 部品・ポート・接続の追加。src/edit/add.js)
// 設計書 8 章の拒否する条件に当たる理由の分類(src/edit/add.js の code)
const RULE8_A = new Set(['syntax', 'not-user', 'not-owner', 'empty', 'unchecked-refs', 'S2', 'unnamed-end']);
const RULE8_X = new Set(['syntax', 'not-user', 'not-declared', 'unchecked-refs', 'remaining-refs']);
const byCode = (rows) => { const by = {}; for (const x of rows) by[x.code] = (by[x.code] ?? 0) + 1; return by; };
const freshA = () => ({ ops: 0, ok: 0, rejected: [], reverted: [], maxMs: 0, byOp: {} });
const mergeA = (acc, r) => { acc.ops += r.ops; acc.ok += r.ok; acc.rejected.push(...r.rejected); acc.reverted.push(...r.reverted); acc.maxMs = Math.max(acc.maxMs, r.maxMs); for (const [k, v] of Object.entries(r.byOp)) { const t = (acc.byOp[k] ??= { ops: 0, ok: 0, rejected: 0, reverted: 0 }); for (const f of Object.keys(t)) t[f] += v[f]; } return acc; };
const aLine = (label, r) => `  ${label}: 操作 ${r.ops}、行った ${r.ok}、拒否 ${r.rejected.length} ${JSON.stringify(byCode(r.rejected))}、戻した ${r.reverted.length}、1 操作の最大 ${Math.round(r.maxMs)} ms、操作ごと ${JSON.stringify(r.byOp)}`;
// 1 回の操作を行い、結果を数える
function tally(res, file, op, what, fn) {
  const s = performance.now();
  const r = fn();
  res.maxMs = Math.max(res.maxMs, performance.now() - s);
  res.ops++;
  const t = (res.byOp[op] ??= { ops: 0, ok: 0, rejected: 0, reverted: 0 });
  t.ops++;
  const row = { file, op, what, code: r.code, reason: r.reason, details: (r.details ?? []).slice(0, 5) };
  if (r.ok) { res.ok++; t.ok++; } else if (r.reverted) { res.reverted.push(row); t.reverted++; } else { res.rejected.push(row); t.rejected++; }
  return r;
}
// 解析(解析・名前解決・意味エラー)と、描く範囲の候補。prepareView の結果に意味エラーを足したもの
function prepared(text) {
  const p = prepareView(text);
  if (!p.ok) return null;
  return { p, analysis: { ok: true, tree: p.ctx.tree, model: p.ctx.model, semantic: checkSemantics(p.ctx.tree, p.ctx.model, text) } };
}
const allOf = (tree) => { const out = []; (function w(e) { out.push(e); e.owned.forEach(w); e.related.forEach(w); })(tree); return out; };
// 図の節点から、描く範囲の外側の箱から節点までの要素の並び(原文の範囲と種類で構文木の要素に戻す)
function nodePath(st, node, bySrc) {
  const byId = new Map(st.nodes.map(n => [n.id, n]));
  const path = [];
  for (let n = node; n; n = n.parent ? byId.get(n.parent) : null) {
    const e = n.src && n.info ? bySrc.get(`${n.src[0]}:${n.src[1]}:${n.info.kind}`) : null;
    if (!e) return null;
    path.unshift(e);
  }
  return path;
}
const srcIndex = (tree) => { const m = new Map(); for (const e of allOf(tree)) if (e.end > e.start && !m.has(`${e.start}:${e.end}:${e.kind}`)) m.set(`${e.start}:${e.end}:${e.kind}`, e); return m; };
const isPortNode = (n) => /^port(-[lrtb]|-usage)?$/.test(n.symbol) && n.info?.kind && /PortUsage$/.test(n.info.kind);
// 同じ部品の箱の中の 2 つのポート(図の外側の箱が同じで、それが部品の定義・使用)
const samePart = (model, ends) => ends.every(Boolean) && ends[0][0] === ends[1][0] && isPartOwner(model, ends[0][0]);
// 部品・ポートを足す(持ち主 1 つにつき 4 つの操作: 型ありの部品、型なしの部品、向きと型ありのポート(共役は交互)、向きも型もないポート)
const DIRS = ['in', 'out', 'inout'];
function addFour(res, file, text, analysis, owner, i) {
  const pick = (kind) => { const c = typeCandidates({ analysis, owner, kind }); const u = c.filter(x => x.usable); return (u.length ? u[i % u.length] : c[0])?.element ?? null; };
  const nm = (k) => (i % 2 ? `gr16_${k}${i}` : `${k === 'p' ? '部品' : 'ポート'} ${i}`);
  const label = `${owner.name ?? owner.kind}`;
  const pt = pick('PartDefinition');
  tally(res, file, pt ? '部品(型あり)' : '部品(型の候補なし)', `${label} に ${nm('p')}`, () => addPart({ text, analysis, owner, name: nm('p'), type: pt }));
  tally(res, file, '部品(型なし)', `${label} に ${nm('p')}b`, () => addPart({ text, analysis, owner, name: `${nm('p')}b` }));
  if (!isPartOwner(analysis.model, owner)) return;
  const qt = pick('PortDefinition');
  tally(res, file, qt ? 'ポート(向き・型あり)' : 'ポート(向きあり、型の候補なし)', `${label} に ${nm('q')}`, () => addPort({ text, analysis, owner, name: nm('q'), type: qt, conjugated: !!qt && i % 2 === 1, direction: DIRS[i % 3] }));
  tally(res, file, 'ポート(向き・型なし)', `${label} に ${nm('q')}b`, () => addPort({ text, analysis, owner, name: `${nm('q')}b` }));
}

section('A1. 追加の最小の入力');
{
  const named0 = (tree, name) => allOf(tree).find(e => e.name === name && e.end > e.start) ?? null;
  const cases = [
    { name: '本体のない宣言(;)', text: 'package P {\n    part def A;\n}\n', op: 'part', owner: 'A', n: 'b',
      want: 'package P {\n    part def A {\n        part b;\n    }\n}\n' },
    { name: '空の本体', text: 'package P {\n    part def A { }\n}\n', op: 'part', owner: 'A', n: 'b',
      want: 'package P {\n    part def A {\n        part b;\n    }\n}\n' },
    { name: '空の本体(改行あり)', text: 'package P {\n    part def A {\n    }\n}\n', op: 'part', owner: 'A', n: 'b',
      want: 'package P {\n    part def A {\n        part b;\n    }\n}\n' },
    { name: 'タブの字下げ', text: 'package P {\n\tpart def A {\n\t\tpart x;\n\t}\n}\n', op: 'part', owner: 'A', n: 'b',
      want: 'package P {\n\tpart def A {\n\t\tpart x;\n\t\tpart b;\n\t}\n}\n' },
    { name: '最後のメンバーの行の注', text: 'package P {\n    part def A {\n        part x; // 注\n    }\n}\n', op: 'port', owner: 'A', n: 'b',
      want: 'package P {\n    part def A {\n        part x; // 注\n        port b;\n    }\n}\n' },
    { name: '引用符の要る名前と、1 行の本体', text: "package P { part def A { part x; } }", op: 'part', owner: 'A', n: "温度 センサ's",
      want: "package P { part def A { part x; part '温度 センサ\\'s'; } }" },
    { name: '型あり(部品の使用に)', text: "package P {\n    part def '定義';\n    part '使用';\n}\n", op: 'part', owner: '使用', n: '中', type: '定義',
      want: "package P {\n    part def '定義';\n    part '使用' {\n        part '中' : '定義';\n    }\n}\n" },
    { name: '型なし', text: "package P {\n    part def '定義' {\n        part a;\n    }\n}\n", op: 'part', owner: '定義', n: 'b',
      want: "package P {\n    part def '定義' {\n        part a;\n        part b;\n    }\n}\n" },
    { name: '共役のポートと向き', text: "package P {\n    port def '信号';\n    part def '箱' {\n        port a : '信号';\n    }\n}\n", op: 'port', owner: '箱', n: 'b', type: '信号', conj: true, dir: 'in',
      want: "package P {\n    port def '信号';\n    part def '箱' {\n        port a : '信号';\n        in port b : ~'信号';\n    }\n}\n" },
    { name: '向き(out・inout)と型なし', text: "package P {\n    part def '箱' {\n        port a;\n    }\n}\n", op: 'port', owner: '箱', n: 'c', dir: 'inout',
      want: "package P {\n    part def '箱' {\n        port a;\n        inout port c;\n    }\n}\n" },
    { name: '修飾名の型', text: "package P {\n    package '部品集' { part def '定義'; }\n    part def '箱' {\n        part a;\n    }\n}\n", op: 'part', owner: '箱', n: 'b', type: '定義',
      want: "package P {\n    package '部品集' { part def '定義'; }\n    part def '箱' {\n        part a;\n        part b : '部品集'::'定義';\n    }\n}\n" },
    { name: 'パッケージに部品を足す', text: "package P {\n    part def A;\n}\n", op: 'part', owner: 'P', n: 'b',
      want: "package P {\n    part def A;\n    part b;\n}\n" },
    { name: 'connect(同じ部品の中の 2 つのポート)', text: "package P {\n    part '全体' {\n        part a { port p; }\n        part b { port q; }\n    }\n}\n", op: 'conn', ends: [['全体', 'a', 'p'], ['全体', 'b', 'q']],
      want: "package P {\n    part '全体' {\n        part a { port p; }\n        part b { port q; }\n        connect a.p to b.q;\n    }\n}\n" },
    { name: 'interface 名前 : 型 connect', text: "package P {\n    interface def '接続';\n    part '全体' {\n        part a { port p; }\n        part b { port q; }\n    }\n}\n", op: 'conn', ends: [['全体', 'a', 'p'], ['全体', 'b', 'q']], form: 'interface', n: 'i', type: '接続',
      want: "package P {\n    interface def '接続';\n    part '全体' {\n        part a { port p; }\n        part b { port q; }\n        interface i : '接続' connect a.p to b.q;\n    }\n}\n" },
    { name: 'interface : 型 connect(名前なし)', text: "package P {\n    interface def '接続';\n    part '全体' {\n        part a { port p; }\n        part b { port q; }\n    }\n}\n", op: 'conn', ends: [['全体', 'a', 'p'], ['全体', 'b', 'q']], form: 'interface', type: '接続',
      want: "package P {\n    interface def '接続';\n    part '全体' {\n        part a { port p; }\n        part b { port q; }\n        interface : '接続' connect a.p to b.q;\n    }\n}\n" },
    { name: '入れ子の部品の間の接続(最も内側の共通の持ち主に書く)', text: "package P {\n    part '全体' {\n        part s {\n            part a { port p; }\n            part b { port q; }\n        }\n        part t;\n    }\n}\n", op: 'conn', ends: [['全体', 's', 'a', 'p'], ['全体', 's', 'b', 'q']],
      want: "package P {\n    part '全体' {\n        part s {\n            part a { port p; }\n            part b { port q; }\n            connect a.p to b.q;\n        }\n        part t;\n    }\n}\n" },
    { name: '型から受け継いだポートの間の接続(本体のない部品の使用に書く)', text: "package P {\n    part def '板' { port x; port y; }\n    part '全体' {\n        part u : '板';\n    }\n}\n", op: 'conn', ends: [['全体', 'u', 'x'], ['全体', 'u', 'y']],
      want: "package P {\n    part def '板' { port x; port y; }\n    part '全体' {\n        part u : '板' {\n            connect x to y;\n        }\n    }\n}\n" },
  ];
  for (const c of cases) {
    const a = analyze(c.text);
    const f = (n) => named0(a.tree, n);
    const r = c.op === 'part' ? addPart({ text: c.text, analysis: a, owner: f(c.owner), name: c.n, type: c.type ? f(c.type) : null })
      : c.op === 'port' ? addPort({ text: c.text, analysis: a, owner: f(c.owner), name: c.n, type: c.type ? f(c.type) : null, conjugated: !!c.conj, direction: c.dir ?? '' })
      : addConnection({ text: c.text, analysis: a, ends: c.ends.map(p => p.map(f)), form: c.form ?? 'connect', name: c.n ?? null, type: c.type ? f(c.type) : null });
    check(r.ok && r.text === c.want, `A1. ${c.name}`, r.ok ? JSON.stringify(r.text) : `${r.code} ${r.reason}`);
  }
  const rej = [
    { name: '区別できない名前(S2)', text: "package P { part def '箱' { part a; } }", op: 'part', owner: '箱', n: 'a', code: 'S2' },
    { name: '名前で指せない端(名前のない部品を通る)', text: "package P { part '全体' { part : '型' { port p; } part b { port q; } } part def '型'; }", op: 'conn', ends: [['全体', null, 'p'], ['全体', 'b', 'q']], code: 'unnamed-end' },
    // GR17 P8: 索引を既定に入れたので印が付かず、書き足す。期待値を置き換えた(予定の red の 1。前は code: 'unchecked-refs')
    { name: '書き足す参照に D3 の印(ASCII の型の名前、8 章の上の規則。GR17 P8 から印なし)', text: 'package P { part def T; part def A { part x; } }', op: 'part', owner: 'A', n: 'b', type: 'T', want: 'package P { part def T; part def A { part x; part b : T; } }' },
    { name: '空の名前', text: 'package P { part def A; }', op: 'part', owner: 'A', n: '', code: 'empty' },
    { name: '足せない種類(ポートに部品)', text: 'package P { port def Q; }', op: 'part', owner: 'Q', n: 'b', code: 'not-owner' },
  ];
  for (const c of rej) {
    const a = analyze(c.text);
    const f = (n) => n === null ? allOf(a.tree).find(e => e.kind === 'PartUsage' && e.name === undefined) : named0(a.tree, n);
    const r = c.op === 'part' ? addPart({ text: c.text, analysis: a, owner: f(c.owner), name: c.n, type: c.type ? f(c.type) : null })
      : addConnection({ text: c.text, analysis: a, ends: c.ends.map(p => p.map(f)) });
    check(c.want !== undefined ? r.ok && r.text === c.want : !r.ok && !r.reverted && r.code === c.code, `A1. 拒否: ${c.name}`, r.ok ? r.text : `${r.code} ${r.reason}`);
  }
  {
    const t = 'part a {';
    const r = addPart({ text: t, analysis: analyze(t), owner: null, name: 'b' });
    check(!r.ok && r.code === 'syntax', 'A1. 拒否: 構文エラーの間', r.code);
  }
}

section('A2. 例の、部品の定義・使用のそれぞれに部品とポートを足し、相互接続ビューの同じ部品の中の 2 つのポートの組に接続を足す');
const aExample = {};
{
  const text = fs.readFileSync('src/app/sample.sysml', 'utf8');
  const { p, analysis } = prepared(text);
  const owners = allOf(analysis.tree).filter(e => isPartOwner(analysis.model, e));
  const r1 = freshA();
  owners.forEach((o, i) => addFour(r1, 'src/app/sample.sysml', text, analysis, o, i));
  console.log(aLine(`部品とポート(部品の定義・使用 ${owners.length})`, r1));
  // 接続: 相互接続ビューの候補(例では view)の図の、同じ部品の箱の中の 2 つのポートの組。例の connect・interface … connect と同じ組を除く
  const r2 = freshA();
  const bySrc = srcIndex(analysis.tree);
  const iface = allOf(analysis.tree).find(e => e.kind === 'InterfaceDefinition' && e.end > e.start);
  let pairs = 0, skipped = 0;
  const seen = new Set(); // 図をまたいで同じ組(端の要素の並びが同じもの)は 1 回だけ
  const pos = positionsOf(analysis.tree);
  for (const c of p.candidates) {
    const st = renderInterconnection(p, c.id).structure;
    if (!st) continue;
    const ports = st.nodes.filter(isPortNode);
    const connected = new Set(st.edges.filter(e => /^(ConnectionUsage|InterfaceUsage)$/.test(e.info?.kind ?? '')).map(e => [e.from, e.to].sort().join('|')));
    for (let i = 0; i < ports.length; i++) for (let j = i + 1; j < ports.length; j++) {
      if (connected.has([ports[i].id, ports[j].id].sort().join('|'))) { skipped++; continue; }
      const ends = [nodePath(st, ports[i], bySrc), nodePath(st, ports[j], bySrc)];
      if (!samePart(analysis.model, ends)) continue;
      const key = ends.map(x => x.map(e => pos.get(e)).join(',')).join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      pairs++;
      const what = `${c.label}: ${ports[i].label} と ${ports[j].label}`;
      tally(r2, 'src/app/sample.sysml', 'connect', what, () => addConnection({ text, analysis, ends }));
      tally(r2, 'src/app/sample.sysml', 'interface', what, () => addConnection({ text, analysis, ends, form: 'interface', name: `通信 ${pairs}`, type: iface }));
    }
  }
  console.log(aLine(`接続(ポートの組 ${pairs}、例の connect と同じ組 ${skipped} を除く)`, r2));
  for (const r of [r1, r2]) {
    for (const x of r.rejected) console.log(`  拒否: ${x.op} ${x.what}: ${x.code} ${x.reason}`);
    for (const x of r.reverted) console.log(`  戻した: ${x.op} ${x.what}: ${x.reason} ${JSON.stringify(x.details)}`);
  }
  const all = mergeA(mergeA(freshA(), r1), r2);
  Object.assign(aExample, { partsPorts: r1, connections: r2 });
  if (EDIT16.A) check(all.reverted.length === 0, 'A2. 書き足した後の確かめで戻した操作 0 件', JSON.stringify(all.reverted.slice(0, 3)));
  else console.log(`  A を既定に入れていない(EDIT16.A が false)ので、戻した操作 ${all.reverted.length} 件を合否に数えない`);
  check(all.rejected.every(x => RULE8_A.has(x.code)), 'A2. 拒否の理由がどれも 8 章の条件に当たる', JSON.stringify(all.rejected.filter(x => !RULE8_A.has(x.code)).slice(0, 3)));
  fs.writeFileSync(path.join(OUT, 'A2_sample.json'), JSON.stringify(aExample, null, 1) + '\n');
}

section(`A3. 309 ファイルから選んだもの(部品の定義・使用を記述の順に並べ ${A_INTERVAL} 個ごと、接続は相互接続ビューの部品の候補を ${AC_INTERVAL} 個ごとに選び、その図のポートを記述の順に 2 つずつ組にしたもの)`);
{
  const files = fs.readFileSync('out/files309.txt', 'utf8').split('\n').filter(Boolean);
  const r1 = freshA(), r2 = freshA();
  const s = performance.now();
  let k = 0, kc = 0, nOwners = 0, nCands = 0;
  let tParts = 0, tConn = 0;
  for (const f of files) {
    const text = decodeUtf8(fs.readFileSync(f));
    const x = prepared(text);
    if (!x) continue;
    const { p, analysis } = x;
    const t1 = performance.now();
    const owners = allOf(analysis.tree).filter(e => isPartOwner(analysis.model, e));
    for (const o of owners) if (k++ % A_INTERVAL === 0) { nOwners++; addFour(r1, f, text, analysis, o, k); }
    const t2 = performance.now();
    tParts += t2 - t1;
    const bySrc = srcIndex(analysis.tree);
    for (const c of p.candidates.filter(c => c.kind === 'part')) {
      if (kc++ % AC_INTERVAL !== 0) continue;
      nCands++;
      const st = renderInterconnection(p, c.id).structure;
      const ports = st ? st.nodes.filter(isPortNode) : [];
      for (let i = 0; i + 1 < ports.length; i += 2) {
        const ends = [nodePath(st, ports[i], bySrc), nodePath(st, ports[i + 1], bySrc)];
        if (!samePart(analysis.model, ends)) continue;
        tally(r2, f, 'connect', `${c.label}: ${ports[i].label} と ${ports[i + 1].label}`, () => addConnection({ text, analysis, ends }));
      }
    }
    tConn += performance.now() - t2;
  }
  console.log(aLine(`部品とポート(選んだ部品の定義・使用 ${nOwners}、${(tParts / 1000).toFixed(1)} 秒)`, r1));
  console.log(aLine(`接続(選んだ候補 ${nCands}、${(tConn / 1000).toFixed(1)} 秒)`, r2));
  const all = mergeA(mergeA(freshA(), r1), r2);
  console.log(`  合計: 操作 ${all.ops}、行った ${all.ok}、拒否 ${all.rejected.length}、戻した ${all.reverted.length}、${((performance.now() - s) / 1000).toFixed(1)} 秒`);
  for (const x of all.reverted.slice(0, 10)) console.log(`  戻した: ${x.file} ${x.op} ${x.what}: ${x.reason} ${JSON.stringify(x.details)}`);
  if (EDIT16.A) check(all.reverted.length === 0, 'A3. 書き足した後の確かめで戻した操作 0 件', `${all.reverted.length} 件`);
  else console.log(`  A を既定に入れていない(EDIT16.A が false)ので、戻した操作 ${all.reverted.length} 件を合否に数えない`);
  check(all.rejected.every(x => RULE8_A.has(x.code)), 'A3. 拒否の理由がどれも 8 章の条件に当たる', JSON.stringify(all.rejected.filter(x => !RULE8_A.has(x.code)).slice(0, 3)));
  fs.writeFileSync(path.join(OUT, 'A3_files.json'), JSON.stringify({ interval: A_INTERVAL, connectionInterval: AC_INTERVAL, partsPorts: r1, connections: r2 }, null, 1) + '\n');
}

// ---- X(GR16。図からの編集の段階 3: 削除。src/edit/remove.js)
const freshX = () => ({ ops: 0, ok: 0, withCount: 0, rejected: [], reverted: [], maxMs: 0 });
const xLine = (label, r) => `  ${label}: 操作 ${r.ops}、消した ${r.ok}(一緒に消したもの ${r.withCount})、拒否 ${r.rejected.length} ${JSON.stringify(byCode(r.rejected))}、戻した ${r.reverted.length}、1 操作の最大 ${Math.round(r.maxMs)} ms`;
function deleteOne(res, file, text, analysis, el) {
  const s = performance.now();
  const r = deleteElement({ text, analysis, element: el });
  res.maxMs = Math.max(res.maxMs, performance.now() - s);
  res.ops++;
  const row = { file, line: lineOf(text, el.start), el: el.name ?? null, kind: el.kind, code: r.code, reason: r.reason, details: (r.details ?? []).slice(0, 5) };
  if (r.ok) { res.ok++; res.withCount += r.plan.length - 1; } else if (r.reverted) res.reverted.push(row); else res.rejected.push(row);
  return r;
}

section('X1. 削除の最小の入力');
{
  const named0 = (tree, name) => allOf(tree).find(e => e.name === name && e.end > e.start) ?? null;
  const cases = [
    { name: '行ごと消す', text: 'package P {\n    part a;\n    part b;\n    part c;\n}\n', el: 'b', want: 'package P {\n    part a;\n    part c;\n}\n' },
    { name: '同じ行にほかの文があるとき(後ろの文)', text: 'package P {\n    part a; part b;\n}\n', el: 'b', want: 'package P {\n    part a;\n}\n' },
    { name: '同じ行にほかの文があるとき(前の文)', text: 'package P {\n    part a; part b;\n}\n', el: 'a', want: 'package P {\n    part b;\n}\n' },
    { name: '直前の行の注を残す', text: 'package P {\n    part a;\n    // b の注\n    //* 複数行の\n        注 */\n    part b;\n}\n', el: 'b', want: 'package P {\n    part a;\n    // b の注\n    //* 複数行の\n        注 */\n}\n' },
    { name: '本体と中身ごと消す', text: 'package P {\n    part def A {\n        port p;\n        part x {\n            port q;\n        }\n    }\n    part def B;\n}\n', el: 'A', want: 'package P {\n    part def B;\n}\n' },
    { name: 'CR LF の行末', text: 'package P {\r\n    part a;\r\n    part b;\r\n}\r\n', el: 'a', want: 'package P {\r\n    part b;\r\n}\r\n' },
    { name: '端が消す要素や中のものを指す connect・interface・flow・bind・first … then … を一緒に消す',
      text: 'package P {\n    part def C {\n        part a { port p; }\n        part b { port q; }\n        connect a.p to b.q;\n        interface a.p to b.q;\n        flow from a.p to b.q;\n        bind a = b;\n        first a then b;\n        part c;\n    }\n}\n', el: 'a',
      want: 'package P {\n    part def C {\n        part b { port q; }\n        part c;\n    }\n}\n', with: 5 },
    { name: 'then action x の then(終点を省いた継承)と、then の始点を省いた継承を一緒に消す',
      text: 'package P {\n    action def F {\n        first start;\n        then action a;\n        then action b;\n        action c;\n    }\n}\n', el: 'a',
      want: 'package P {\n    action def F {\n        first start;\n        action b;\n        action c;\n    }\n}\n', with: 2 },
    { name: 'メッセージ(from・to の端)を一緒に消す', text: 'package P {\n    occurrence def S {\n        part x { event occurrence e; }\n        part y { event occurrence f; }\n        message m from x.e to y.f;\n    }\n}\n', el: 'x',
      want: 'package P {\n    occurrence def S {\n        part y { event occurrence f; }\n    }\n}\n', with: 1 },
  ];
  for (const c of cases) {
    const a = analyze(c.text);
    const r = deleteElement({ text: c.text, analysis: a, element: named0(a.tree, c.el) });
    check(r.ok && r.text === c.want && (c.with === undefined || r.plan.length - 1 === c.with), `X1. ${c.name}`, r.ok ? `${JSON.stringify(r.text)} 一緒に消すもの ${r.plan.length - 1}` : `${r.code} ${r.reason}`);
  }
  const rej = [
    { name: '型付けが残る(箇所の一覧)', text: "package P {\n    part def '定義';\n    part x : '定義';\n    part y : '定義';\n}\n", el: '定義', code: 'remaining-refs', where: ['3 行 14 列', '4 行 14 列'] },
    { name: 'expose が残る', text: "package P {\n    part '全体';\n    view '図' { expose '全体'; }\n}\n", el: '全体', code: 'remaining-refs', where: ['3 行 23 列'] },
    { name: '再定義が残る', text: "package P {\n    part def '上' { part '中'; }\n    part def '下' :> '上' { part :>> '中'; }\n}\n", el: '中', code: 'remaining-refs', where: ['3 行 36 列'] },
    { name: '特殊化と式の中の参照が残る', text: "package P {\n    part def '上';\n    part def '下' :> '上';\n    attribute '値' = '上';\n}\n", el: '上', code: 'remaining-refs', where: ['3 行 21 列', '4 行 21 列'] },
    // GR16 P2b: X_IMPLICIT の T・R・P を既定に入れた(P2 の裁定 Q1〜Q3)。拒否の理由に、当たった暗黙のつながりの種類を書く(reason)
    { name: '遷移の省いた始点が消す要素になる(T)', text: "package P {\n    state def S {\n        entry; then '待機';\n        state '待機';\n        accept '合図' then '動作';\n        state '動作';\n    }\n}\n", el: '待機', code: 'remaining-refs', where: ['5 行 9 列'], reason: '遷移の省いた始点' },
    // GR16 P2b: P を既定で入れたので、a を消すと後ろの b(y が位置で暗黙に再定義する)の再定義が変わる行も出る(予定の red の 3。'3 行 26 列' だけ → 2 行)
    { name: '消す要素を暗黙に再定義する引数が残る(R)', text: "package P {\n    action def '定義' { in a; out b; }\n    action '使用' : '定義' { in x; out y; }\n}\n", el: 'a', code: 'remaining-refs', where: ['3 行 26 列', '3 行 32 列'], reason: '消す要素を暗黙に再定義する特徴' },
    { name: '後ろの引数の位置による暗黙の再定義が変わる(P)', text: "package P {\n    action def '定義' { in a; out b; }\n    action '使用' : '定義' { in x; out y; }\n}\n", el: 'x', code: 'remaining-refs', where: ['3 行 32 列'], reason: '端・引数の位置のずれによる暗黙の再定義の変化' },
    // GR17 P8: 索引を既定に入れたので印が付かず、残る型付けの参照で拒否する。期待値を置き換えた(予定の red の 1。前は code: 'unchecked-refs')
    { name: '消す名前を参照しうる箇所に D3 の印の参照(8 章の上の規則。GR17 P8 から印なし)', text: 'package P {\n    part def E;\n    part def V { part e : E; }\n}\n', el: 'E', code: 'remaining-refs', where: ['3 行 27 列'] },
  ];
  for (const c of rej) {
    const a = analyze(c.text);
    const r = deleteElement({ text: c.text, analysis: a, element: named0(a.tree, c.el) }, c.opts ?? {});
    check(!r.ok && !r.reverted && r.code === c.code && (!c.where || (r.details.length === c.where.length && c.where.every((w, i) => r.details[i].startsWith(w)))) && (!c.reason || r.reason.includes(c.reason)), `X1. 拒否: ${c.name}`, r.ok ? r.text : `${r.code} ${r.reason} ${JSON.stringify(r.details)}`);
  }
  {
    const t = 'package P { part def A { part x; } }';
    const a = analyze(t);
    const typing = allOf(a.tree).find(e => e.kind === 'OwningMembership');
    const r1 = deleteElement({ text: t, analysis: a, element: typing });
    check(!r1.ok && r1.code === 'not-declared', 'X1. 拒否: 文として宣言した要素でない(Membership)', r1.code);
    const r2 = deleteElement({ text: 'part a {', analysis: analyze('part a {'), element: null });
    check(!r2.ok && r2.code === 'syntax', 'X1. 拒否: 構文エラーの間', r2.code);
  }
}

section('X2. 例の、宣言したすべての要素');
{
  const text = fs.readFileSync('src/app/sample.sysml', 'utf8');
  const analysis = analyze(text);
  const els = declaredElements({ analysis, text });
  const r = freshX();
  const rows = [];
  for (const el of els) {
    const x = deleteOne(r, 'src/app/sample.sysml', text, analysis, el);
    rows.push({ line: lineOf(text, el.start), el: el.name ?? null, kind: el.kind, ok: x.ok, code: x.code ?? null, with: x.ok ? x.plan.slice(1).map(p => `${p.line} 行 ${p.kind} ${p.text}`) : [], reason: x.ok ? null : x.reason, details: x.ok ? [] : x.details.slice(0, 5) });
  }
  console.log(xLine(`宣言した要素 ${els.length}`, r));
  for (const x of rows.filter(x => x.ok && x.with.length)) console.log(`  消した: ${x.line} 行 ${x.kind} ${x.el ?? ''}、一緒に消したもの ${JSON.stringify(x.with)}`);
  for (const x of r.reverted) console.log(`  戻した: ${x.line} 行 ${x.kind} ${x.el}: ${x.reason} ${JSON.stringify(x.details)}`);
  if (EDIT16.X) check(r.reverted.length === 0, 'X2. 消した後の確かめで戻した操作 0 件', JSON.stringify(r.reverted.slice(0, 3)));
  else console.log(`  X を既定に入れていない(EDIT16.X が false)ので、戻した操作 ${r.reverted.length} 件を合否に数えない`);
  check(r.rejected.every(x => RULE8_X.has(x.code)), 'X2. 拒否の理由がどれも 8 章の条件に当たる', JSON.stringify(r.rejected.filter(x => !RULE8_X.has(x.code)).slice(0, 3)));
  fs.writeFileSync(path.join(OUT, 'X2_sample.json'), JSON.stringify({ summary: { ...r, rejected: r.rejected.length, reverted: r.reverted }, rows }, null, 1) + '\n');
}

section(`X3. 309 ファイルから選んだ要素(各ファイルの宣言した要素を記述の順に並べ、${X_INTERVAL} 個ごとに 1 つ)`);
{
  const files = fs.readFileSync('out/files309.txt', 'utf8').split('\n').filter(Boolean);
  const r = freshX();
  const s = performance.now();
  let k = 0;
  for (const f of files) {
    const text = decodeUtf8(fs.readFileSync(f));
    const analysis = analyze(text);
    if (!analysis.ok) continue;
    const els = declaredElements({ analysis, text });
    for (const el of els) if (k++ % X_INTERVAL === 0) deleteOne(r, f, text, analysis, el);
  }
  console.log(xLine(`選んだ要素(宣言した要素 ${k} 個のうち)`, r) + `、${((performance.now() - s) / 1000).toFixed(1)} 秒`);
  for (const x of r.reverted.slice(0, 10)) console.log(`  戻した: ${x.file} ${x.line} 行 ${x.kind} ${x.el}: ${x.reason} ${JSON.stringify(x.details)}`);
  if (EDIT16.X) check(r.reverted.length === 0, 'X3. 消した後の確かめで戻した操作 0 件', `${r.reverted.length} 件`);
  else console.log(`  X を既定に入れていない(EDIT16.X が false)ので、戻した操作 ${r.reverted.length} 件を合否に数えない`);
  check(r.rejected.every(x => RULE8_X.has(x.code)), 'X3. 拒否の理由がどれも 8 章の条件に当たる', JSON.stringify(r.rejected.filter(x => !RULE8_X.has(x.code)).slice(0, 3)));
  fs.writeFileSync(path.join(OUT, 'X3_files.json'), JSON.stringify({ interval: X_INTERVAL, ...r }, null, 1) + '\n');
}

section('AX4. 画面の処理(Worker と選んだ要素の編集欄。A・X)');
if (EDIT16.A && EDIT16.X) {
  const sent = [];
  globalThis.self = globalThis;
  globalThis.postMessage = (m) => sent.push(m);
  await import('../../src/app/worker.js');
  const send = (type, m) => { sent.length = 0; self.onmessage({ data: { type, id: 4, ...m } }); return sent.find(x => x.type === (type === 'run' ? 'result' : type === 'connect' ? 'add' : type)); };
  const sample = fs.readFileSync('src/app/sample.sysml', 'utf8');
  const r1 = send('run', { text: sample, candidateId: 'view:見守りシステムの例::全体図', view: 'interconnection', enabled: Object.keys(VIEWS) });
  check(r1?.ok && r1.edit16?.A === true && r1.edit16?.X === true, 'AX4. run が A・X を使えることを返す', JSON.stringify(r1?.edit16));
  const st = r1.structure, byId = new Map(st.nodes.map(n => [n.id, n]));
  const pathOf = (n) => { const p = []; for (let x = n; x; x = x.parent ? byId.get(x.parent) : null) p.unshift({ src: x.src, kind: x.info.kind }); return p; };
  const x = prepared(sample);
  const elOf = (n) => allOf(x.analysis.tree).find(e => e.start === n.src[0] && e.end === n.src[1] && e.kind === n.info.kind);
  const apply = (w) => sample.slice(0, w.edit.start) + w.edit.text + sample.slice(w.edit.end);
  const board = st.nodes.find(n => n.info?.kind === 'PartUsage' && n.info.name === '測定ボード');
  const i1 = send('editInfo', { text: sample, src: board.src, kind: board.info.kind, view: 'interconnection' });
  check(i1?.ok && i1.part && i1.port && i1.connect && i1.del && i1.portTypes.length === typeCandidates({ analysis: x.analysis, owner: elOf(board), kind: 'PortDefinition' }).length,
    'AX4. editInfo が、部品の使用に部品・ポート・接続・削除の操作と型の候補を返す', JSON.stringify(i1));
  const w1 = send('add', { text: sample, src: board.src, kind: board.info.kind, op: 'port', name: '新しい端子', typeIndex: 0, conjugated: true, direction: 'in' });
  const d1 = addPort({ text: sample, analysis: x.analysis, owner: elOf(board), name: '新しい端子', type: typeCandidates({ analysis: x.analysis, owner: elOf(board), kind: 'PortDefinition' })[0].element, conjugated: true, direction: 'in' });
  check(w1?.ok && d1.ok && apply(w1) === d1.text && w1.select?.kind === 'PortUsage', 'AX4. Worker の add が、addPort と同じテキストになる 1 か所の置き換えと、足した要素を返す', JSON.stringify(w1?.reason ?? null));
  const pa = st.nodes.find(n => n.info?.kind === 'PortUsage' && n.info.name === 'D8'), pb = st.nodes.find(n => n.info?.kind === 'PortUsage' && n.info.name === 'D3');
  const ends = [pathOf(pa), pathOf(pb)];
  const ci = send('connectInfo', { text: sample, ends });
  const w2 = send('connect', { text: sample, ends, form: 'interface', name: '通信', typeIndex: 0 });
  const iface = allOf(x.analysis.tree).find(e => e.kind === 'InterfaceDefinition' && e.end > e.start);
  const d2 = addConnection({ text: sample, analysis: x.analysis, ends: ends.map(p => p.map(q => elOf({ src: q.src, info: { kind: q.kind } }))), form: 'interface', name: '通信', type: iface });
  check(ci?.ok && ci.ifaceTypes.length === 1 && w2?.ok && d2.ok && apply(w2) === d2.text, 'AX4. Worker の connect が、addConnection と同じテキストになる置き換えを返す', JSON.stringify([ci, w2?.reason]));
  const p3 = send('deletePlan', { text: sample, src: pa.src, kind: pa.info.kind });
  const dp = deletePlan({ analysis: x.analysis, element: elOf(pa), text: sample });
  const w3 = send('delete', { text: sample, src: pa.src, kind: pa.info.kind });
  const d3 = deleteElement({ text: sample, analysis: x.analysis, element: elOf(pa) });
  check(p3?.ok && JSON.stringify(p3.items) === JSON.stringify(dp.items) && p3.items.length === 2 && w3?.ok && d3.ok && apply(w3) === d3.text && w3.select?.kind === 'PartDefinition',
    'AX4. Worker の deletePlan・delete が、消す要素と一緒に消すものの一覧と、deleteElement と同じテキストになる置き換えと持ち主を返す', JSON.stringify([p3, w3?.reason]));
  const gen = send('run', { text: sample, candidateId: 'view:見守りシステムの例::構成の図', view: 'general', enabled: Object.keys(VIEWS) });
  const uno = gen.structure.nodes.find(n => n.info?.kind === 'PartDefinition' && n.info.name === 'Arduino Uno');
  const p4 = uno ? send('deletePlan', { text: sample, src: uno.src, kind: uno.info.kind }) : null;
  check(p4 && !p4.ok && !p4.items && p4.details.length >= 2 && /残る/.test(p4.reason), 'AX4. 拒否した削除は、理由と残る箇所を返して一覧を返さない', JSON.stringify(p4));
  send('run', { text: 'part a {', candidateId: null, view: 'general', enabled: Object.keys(VIEWS) });
  const i5 = send('editInfo', { text: 'part a {', src: [0, 1], kind: 'PartUsage', view: 'general' });
  const w5 = send('delete', { text: sample, src: pa.src, kind: pa.info.kind });
  check(i5 && !i5.ok && /構文エラー/.test(i5.reason) && w5 && !w5.ok, 'AX4. 構文エラーの間と、解析していないテキスト(描き直しの途中)では使えない', JSON.stringify([i5, w5]));
  const main = fs.readFileSync('src/app/main.js', 'utf8');
  check(main.includes('insertEdit(e)') && main.includes("'.ops input, .ops button, .ops select'") && /e\.key === 'Escape' && connecting/.test(main) && main.includes("el('button', null, 'やめる')"),
    'AX4. 画面は insertEdit で入れ、「接続を足す」の途中は Esc か「やめる」で抜け、構文エラーの間は編集欄を使えなくする');
} else console.log('  A・X を既定に入れていない');

// ---- QM(GR17 の Q・M。GR17 指示書 3.2 節・3.3 節・4 章)
section('QM. 宣言の書き方に合わせる(Q)と、S2 の説明(M)');
console.log(`  既定に入れた項目: ${Object.entries(EDIT17).filter(([, v]) => v).map(([k]) => k).join('・') || 'なし'}`);
{
  // Q: 引用符付きで宣言した ASCII の名前('D8' など)を指す接続の端・型・view の範囲が、引用符付きで書き足される
  const t = "package 'P' {\n    port def 'Pin';\n    part def 'Board' {\n        out port 'D8' : 'Pin';\n        in port A0 : 'Pin';\n    }\n    part 'Sys' {\n        part 'b1' : 'Board';\n        part b2 : 'Board';\n    }\n}\n";
  const a = analyze(t);
  const sys = find(a.tree, 'Sys'), b1 = find(a.tree, 'b1'), b2 = find(a.tree, 'b2'), board = find(a.tree, 'Board'), d8 = find(a.tree, 'D8'), a0 = find(a.tree, 'A0'), pkg = find(a.tree, 'P');
  const line = (r, re) => (r.ok ? r.text.split('\n').map(l => l.trim()).find(l => re.test(l)) ?? null : `拒否・戻した: ${r.reason}`);
  const q = EDIT17.Q;
  const r1 = addConnection({ text: t, analysis: a, ends: [[sys, b1, d8], [sys, b2, a0]] });
  check(r1.ok && line(r1, /^connect/) === (q ? "connect 'b1'.'D8' to b2.A0;" : 'connect b1.D8 to b2.A0;'), "QM. Q: 引用符付きで宣言した 'b1'.'D8' を指す接続の端は引用符付き、引用符なしの b2.A0 はそのまま", line(r1, /^connect/));
  const r2 = addPart({ text: t, analysis: a, owner: pkg, name: 'b3', type: board });
  check(r2.ok && line(r2, /b3/) === (q ? "part b3 : 'Board';" : 'part b3 : Board;'), "QM. Q: 引用符付きで宣言した 'Board' を指す型は引用符付き", line(r2, /b3/));
  const r3 = appendView({ text: t, analysis: a, scope: sys, view: 'interconnection' });
  check(r3.ok && (line(r3, /^view/) ?? '').includes(q ? "expose 'Sys'::**;" : 'expose Sys::**;'), "QM. Q: 引用符付きで宣言した 'Sys' を指す view の範囲は引用符付き", line(r3, /^view/));
  // 新しい名前は今の規則のまま(引用符の要らない名前は引用符なし)
  check(r2.ok && /^part b3 /.test(line(r2, /b3/)), 'QM. Q: 追加の新しい名前は段階 1 の引用符の規則のまま');
  // M: 例で「温度センサ」を「ファン」に変えたときの説明に、同じ文が 1 回だけ出る
  const sample = fs.readFileSync('src/app/sample.sysml', 'utf8');
  const am = analyze(sample);
  const sensor = named(am.tree).find(e => e.name === '温度センサ' && e.kind === 'PartDefinition');
  const rm = renameElement({ text: sample, analysis: am, element: sensor, newName: 'ファン' });
  const dup = (rm.details ?? []).length !== new Set(rm.details ?? []).size;
  check(!rm.ok && rm.code === 'S2' && rm.details.length >= 1 && (EDIT17.M ? !dup : true), 'QM. M: 例で「温度センサ」を「ファン」に変えた S2 の説明に、同じ文が 1 回だけ出る', JSON.stringify(rm.details));
  // M: 追加の S2 の説明も同じ形
  const ra = addPart({ text: t, analysis: a, owner: sys, name: 'b1' });
  const dupA = (ra.details ?? []).length !== new Set(ra.details ?? []).size;
  check(!ra.ok && ra.code === 'S2' && (EDIT17.M ? !dupA : true), 'QM. M: 追加で S2 の説明に、同じ文が 1 回だけ出る', JSON.stringify(ra.details));
}

// ---- H(GR17 の H。GR17 指示書 3.6 節・4 章。ヘッドレスのブラウザがないので、「書き方」の HTML と画面のスクリプトの中身で確かめる)
section('H. 「書き方」の指示文の文体と、生成 AI 向けプロンプト');
{
  const help = fs.readFileSync('src/app/help.html', 'utf8');
  const main = fs.readFileSync('src/app/main.js', 'utf8');
  const ex = /<h2>生成 AI に書かせるときの指示文の例<\/h2>\s*<pre>([\s\S]*?)<\/pre>/.exec(help)?.[1] ?? '';
  const lines = ex.split('\n').filter(Boolean);
  // 行の終わりが「ください。」か「ください(例 …)。」(可視性の注意の行は「になります。」、続く行は「、」)で、「〜で書く。」の行がない
  const okLine = (l) => /ください(\([^)]*\))?。$/.test(l) || /になります。$/.test(l) || /、$/.test(l);
  check(lines.length >= 10 && lines.every(okLine) && !/で書く。/.test(ex),
    'H. 指示文の例の要求の行が「〜してください」の文体(「〜で書く。」がない)', JSON.stringify(lines.filter(l => !okLine(l))));
  const pr = /<pre id="aiPrompt">([\s\S]*?)<\/pre>/.exec(help)?.[1] ?? '';
  check(pr.includes('日本語の名前は単一引用符で囲んでください') && pr.includes('部品の使用の名前は、型(部品の定義)の名前と別にしてください')
    && pr.includes('ポートの使用の名前も、ポートの定義(型)の名前と別にしてください') && pr.includes('import には private を付けてください') && /システム:\n$/.test(pr),
    'H. 生成 AI 向けプロンプトに、日本語の名前の引用符・部品とポートの使用の名前・import の private が書いてある');
  check(/<button type="button" data-copy="aiPrompt">コピー<\/button>/.test(help) && /querySelectorAll\('\[data-copy\]'\)/.test(main) && /copyText\(t\.textContent, b\)/.test(main),
    'H. プロンプトにコピーのボタンがあり、画面がボタンにコピーの処理をつなぐ');
  // GR18 の F1: 標準ライブラリの型と単位を使ってよいこと。プロンプトの例(import と属性)が、構文エラー 0・意味エラー 0・未検査 0
  const lib = pr.split('\n').find((l) => l.includes('標準ライブラリの型と単位')) ?? '';
  const imports = [...lib.matchAll(/private import [A-Za-z]+::\*;/g)].map((m) => m[0]);
  const attr = /\(例: (attribute [^)]*;)\)/.exec(lib)?.[1] ?? '';
  const t18 = `package 'P' {\n${imports.map((x) => `    ${x}\n`).join('')}    part def 'ボード' {\n        ${attr}\n        attribute '温度' : Real;\n        attribute '気温' : ThermodynamicTemperatureValue;\n        attribute '周期' : DurationValue;\n    }\n}\n`;
  const a18 = analyze(t18);
  check(/ScalarValues/.test(lib) && /ISQ/.test(lib) && /SI/.test(lib) && imports.length === 3 && attr && a18.ok && a18.semantic.length === 0 && a18.model.refs.every((r) => r.status === 'resolved' && !r.shadow),
    'GR18 F1: 生成 AI 向けプロンプトに、標準ライブラリの型と単位(ScalarValues・ISQ・SI)を使ってよいことが書いてあり、その例が構文エラー 0・意味エラー 0・未検査 0', a18.ok ? a18.model.refs.filter((r) => r.status !== 'resolved' || r.shadow).map((r) => r.text).join(',') : JSON.stringify(a18.errors?.[0]));
}

// ---- P(GR17 指示書 v17.2 の 3.4 節)
section('P. 「書き方」の表の例をすべてつないだテキストが、構文エラー 0・意味エラー 0');
{
  // 「書き方」の表(最初の <table>)の <pre> の例を、書いた順に改行でつなぐ。つなぎ方:
  //   (1) 最上位に置くと構文エラーになる例(状態・行動の本体の中に書く断片)は、action def '例N' { … }、だめなら state def '例N' { … } で包む
  //   (2) 例の最上位で宣言した名前が、前の例の最上位で宣言した名前と重なるときは、その例の中のその名前の字句をすべて「名前(例N)」に付け替える
  //       (同じ例の中の参照も一緒に付け替える。ほかの例で宣言した名前を指す参照は付け替えない)
  // N は表の中の例の番号(1 から)
  const help = fs.readFileSync('src/app/help.html', 'utf8');
  const table = help.slice(help.indexOf('<table>'), help.indexOf('</table>'));
  const dec = (x) => x.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
  const pres = [...table.matchAll(/<pre>([\s\S]*?)<\/pre>/g)].map(m => dec(m[1]));
  const seen = new Set(), parts = [], notes = [];
  pres.forEach((p, i) => {
    let t = p;
    if (!analyze(t).ok) {
      const w = [`action def '例${i + 1}' {\n${t}\n}`, `state def '例${i + 1}' {\n${t}\n}`].find(x => analyze(x).ok);
      if (w) { notes.push(`例 ${i + 1} を ${w.startsWith('action') ? 'action def' : 'state def'} で包んだ`); t = w; }
    }
    const a = analyze(t);
    const top = a.ok ? a.tree.owned.map(m => m.related[0]).filter(Boolean).map(e => e.name).filter(x => x !== undefined) : [];
    const dup = top.filter(x => seen.has(x));
    if (dup.length) {
      for (const k of (tokensOf(t) ?? []).slice().reverse()) if (k.kind === 'NAME' && dup.includes(unquote(k.text))) t = t.slice(0, k.start) + writtenName(`${unquote(k.text)}(例${i + 1})`) + t.slice(k.end);
      notes.push(`例 ${i + 1} の ${dup.join('、')} を付け替えた`);
    }
    for (const x of top) seen.add(x);
    parts.push(t);
  });
  const all = parts.join('\n');
  const a = analyze(all);
  console.log(`  例 ${pres.length}。${notes.join('。')}`);
  check(pres.length > 0 && a.ok, 'P. つないだテキストに構文エラーがない', a.ok ? '' : `${a.errors[0].line} 行 ${a.errors[0].col} 列 ${a.errors[0].message}`);
  check(a.ok && a.semantic.length === 0, 'P. つないだテキストに意味エラーがない', a.ok ? a.semantic.map(x => `${x.item} ${x.message}`).join(' / ') : '');
  check(/perform '測定'\.'温度を読む';/.test(help) && !/perform '測定の手順'\./.test(help), "P. perform の例は行動の使用('測定')の中の行動を指す");
}

// ---- GR18(GR18 指示書 2 章の直しのうち、図からの編集で確かめるもの)
section('GR18. 不具合の直しの最小の入力(図からの編集)');
{
  const elNamed = (tree, name, kind) => { let hit = null; (function w(e) { if (!hit && e.name === name && (!kind || e.kind === kind)) hit = e; e.owned.forEach(w); e.related.forEach(w); })(tree); return hit; };
  // M4: 演算子の型の被演算子の T に D3 の印が付かないので、T の名前を変えられる
  for (const [label, text, want] of [
    ['as', 'package P { part def T; part x; attribute a = x as T; }', 'package P { part def U; part x; attribute a = x as U; }'],
    ['istype', 'package P { part def T; part x; attribute a = x istype T; }', 'package P { part def U; part x; attribute a = x istype U; }'],
    ['@', 'package P { part def T; part x; attribute a = x @ T; }', 'package P { part def U; part x; attribute a = x @ U; }'],
  ]) {
    const a = analyze(text);
    const r = renameElement({ text, analysis: a, element: elNamed(a.tree, 'T'), newName: 'U' });
    check(r.ok && r.text === want, `GR18 M4: ${label} の型の被演算子の T の名前を変えられる`, r.ok ? JSON.stringify(r.text) : `${r.code} ${r.reason} ${JSON.stringify(r.details)}`);
  }
  // M6: B の名前の変更で、別名の短い名前 <B> を書き換えず、for B を書き換える
  {
    const text = 'package P { part def B; package S { alias <B> C for B; } }';
    const a = analyze(text);
    const r = renameElement({ text, analysis: a, element: elNamed(a.tree, 'B', 'PartDefinition'), newName: 'D' });
    check(r.ok && r.text === 'package P { part def D; package S { alias <B> C for D; } }', 'GR18 M6: B の名前の変更で、別名の短い名前を書き換えない', r.ok ? JSON.stringify(r.text) : `${r.code} ${r.reason}`);
  }
  // E1: 名前の変更の S2 は、名前を変える要素とほかのメンバーの組ごとに判定する(すでに S2 のある名前空間でも拒否する)
  {
    const text = 'part a; part a; part b;';
    const a = analyze(text);
    const r = renameElement({ text, analysis: a, element: elNamed(a.tree, 'a'), newName: 'b' });
    check(!r.ok && !r.reverted && r.code === 'S2', 'GR18 E1: part a; part a; part b; の 1 つ目の a を b に変えると S2 で拒否する', JSON.stringify(r));
    const r2 = renameElement({ text, analysis: a, element: elNamed(a.tree, 'b'), newName: 'c' });
    check(r2.ok && r2.text === 'part a; part a; part c;', 'GR18 E1: すでに S2 のある名前空間でも、区別できる名前への変更はできる', JSON.stringify(r2.reason ?? r2.text));
    // 追加の S2 も同じ形(足す要素とほかのメンバーの組)
    const t3 = 'part s { part a; part a; }';
    const a3 = analyze(t3);
    const r3 = addPart({ text: t3, analysis: a3, owner: elNamed(a3.tree, 's'), name: 'a' });
    const r4 = addPart({ text: t3, analysis: a3, owner: elNamed(a3.tree, 's'), name: 'c' });
    check(!r3.ok && r3.code === 'S2' && r4.ok, 'GR18 E1: 追加も、足す要素とほかのメンバーの組で S2 を判定する(すでに S2 のある名前空間に、同じ名前を足すと拒否し、違う名前は足せる)', JSON.stringify([r3.code, r4.reason]));
  }
  // E2: 削除の後に選ぶ持ち主は、消した後の木で原文の範囲から求める
  {
    const text = 'port def T; part sys { connect a.x to b.y; part a { port x : T; } part b { port y : T; } }';
    const a = analyze(text);
    const r = deleteElement({ text, analysis: a, element: elNamed(a.tree, 'x', 'PortUsage') });
    check(r.ok && r.owner && r.text.slice(r.owner.start, r.owner.end).startsWith('part a'), 'GR18 E2: x を消すと、持ち主の a を選ぶ', JSON.stringify(r.owner && r.text.slice(r.owner.start, r.owner.end)));
  }
  // E3: 最後のメンバーの行に閉じていない //* の注があるとき、view を注の中に書き足さない
  {
    const text = 'package P {\n    part def A;\n    part a : A; //* note\n continues */\n}\n';
    const a = analyze(text);
    const r = appendView({ text, analysis: a, scope: elNamed(a.tree, 'a'), view: 'interconnection' });
    check(r.ok && /part a : A;\n    view 'aの相互接続ビュー' : StandardViewDefinitions::InterconnectionView \{ expose a::\*\*; \} \/\/\* note\n continues \*\/\n\}/.test(r.text), 'GR18 E3: 閉じていない //* の注の外に view を書き足す', JSON.stringify(r.text ?? r.reason));
  }
  // E6: 接続の形の一覧(connectInfo)の型の候補の書き方も、宣言の書き方に合わせる
  {
    const worker = fs.readFileSync('src/app/worker.js', 'utf8');
    check(/function connectInfoMsg\(\{ ends, text \}[^]*?typeCandidates\(\{ analysis, owner, kind: 'InterfaceDefinition', text \}\)/.test(worker), 'GR18 E6: connectInfo の型の候補に原文を渡す');
    const text = "interface def 'Bus'; port def T; part sys { part a { port x : T; } part b { port y : T; } }";
    const a = analyze(text);
    const w = typeCandidates({ analysis: a, owner: elNamed(a.tree, 'sys'), kind: 'InterfaceDefinition', text });
    check(w.length === 1 && w[0].written === "'Bus'", "GR18 E6: interface def 'Bus' の候補の書き方が 'Bus'", JSON.stringify(w.map(x => x.written)));
  }
  // E7: 削除を拒否する理由の一覧で、expose の参照を「expose」と出す
  {
    const text = 'package P { part def A; part a : A; view v { expose a; } }';
    const a = analyze(text);
    const r = deletePlan({ analysis: a, element: elNamed(a.tree, 'a', 'PartUsage'), text });
    check(!r.ok && r.details.some(d => /expose/.test(d)) && !r.details.some(d => /import/.test(d)), 'GR18 E7: 理由に「expose」と出す', JSON.stringify(r.details));
  }
}

// ---- X21(GR21 指示書 3.5 節・4 章の X。設計書 8 章・9.4 節の段階 B): 複数のファイルにまたがる名前の変更と削除の最小の入力
section('X21. 複数のファイルにまたがる名前の変更と削除(最小の入力)');
{
  const { analyzeFiles } = await import('../../src/model/files.js');
  const { folderOf, modelDump, diffDumps, EDIT21 } = await import('../../src/edit/index.js');
  // 3 つのファイル。lib.sysml の Lamp は circuit.sysml(修飾名と import)と extra.sysml(修飾名)から指される。Board の p は circuit.sysml の
  // connect の端。circuit.sysml は CR LF
  const FILES = [
    { path: 'circuit.sysml', text: 'package Circuit {\r\n    private import Lib::*;\r\n    part sys {\r\n        part bulb : Lamp;\r\n        part spare : Lib::Lamp;\r\n        part x : Board;\r\n        part y : Board;\r\n        connect x.p to y.q;\r\n    }\r\n}\r\n' },
    { path: 'extra.sysml', text: 'part solo : Lib::Lamp;\n' },
    { path: 'lib.sysml', text: 'package Lib {\n    part def Lamp;\n    part def Board {\n        port p;\n        port q;\n    }\n    part def Unused;\n}\n' },
  ];
  const open = (files) => { const a = analyzeFiles(files); return { a, analysis: { ok: a.ok, tree: a.tree, model: a.model, semantic: a.semantic }, opts: { folder: folderOf(a) } }; };
  const elIn = (tree, name, kind) => { let hit = null; (function w(e) { if (!hit && e.name === name && (!kind || e.kind === kind)) hit = e; e.owned.forEach(w); e.related.forEach(w); })(tree); return hit; };
  // 書き換えた後のつないだテキストを、ファイルごとのテキストに分ける(書き換えた後のテキストを、改めて analyzeFiles で解析し直すため)
  const split = (F, out, edits) => { let shift = 0; return F.files.map((f, i) => { const d = edits.filter(e => e.start >= f.base && e.end <= f.end).reduce((x, e) => x + (e.text ?? '').length - (e.end - e.start), 0); const t = out.slice(f.base + shift, f.end + shift + d); shift += d; return { path: f.path, text: t }; }); };
  const touched = (F, edits) => [...new Set(edits.map(e => F.files.findIndex(f => f.base <= e.start && e.end <= f.end)))].map(k => F.files[k]?.path ?? '?').sort();
  // 名前の変更(引用符の要らない名前と要る名前)
  for (const nn of ['Lamp2', '改名 の名前']) {
    const o = open(FILES);
    const el = elIn(o.a.tree, 'Lamp', 'PartDefinition');
    const r = renameElement({ text: o.a.text, analysis: o.analysis, element: el, which: 'name', newName: nn }, o.opts);
    const files2 = r.ok ? split(o.opts.folder, r.text, r.edits) : null;
    // 書き換えた後のファイルの並びを、新しく解析し直して(src/edit を通さずに)、全ファイルのモデルの差分を見る
    const a2 = files2 && analyzeFiles(files2);
    const d = a2 && diffDumps(modelDump(o.a), modelDump(a2));
    const w = writtenName(nn);
    check(r.ok && JSON.stringify(touched(o.opts.folder, r.edits)) === JSON.stringify(['circuit.sysml', 'extra.sysml', 'lib.sysml'])
      && a2.ok && d.added.length === 0 && d.removed.length === 0 && d.refs.length === 0 && d.elements.length === 1 && d.elements[0].after === nn
      && files2[0].text.includes(`part bulb : ${w};\r\n`) && files2[0].text.includes(`part spare : Lib::${w};\r\n`) && files2[1].text === `part solo : Lib::${w};\n` && files2[2].text.includes(`part def ${w};`),
    `X21: 3 つのファイルにまたがる名前の変更(Lamp → ${nn})を行い、全ファイルを解析し直したモデルの差分がその要素の名前だけ`, r.ok ? JSON.stringify({ d: d && { e: d.elements, a: d.added.length, r: d.removed.length, refs: d.refs.length }, t: touched(o.opts.folder, r.edits) }) : `${r.code} ${r.reason} ${JSON.stringify(r.details)}`);
  }
  // 削除: Board の p を消すと、circuit.sysml の connect を一緒に消す(2 つのファイル)
  {
    const o = open(FILES);
    const p = elIn(o.a.tree, 'p', 'PortUsage');
    const plan = deletePlan({ analysis: o.analysis, element: p, text: o.a.text }, o.opts);
    const r = deleteElement({ text: o.a.text, analysis: o.analysis, element: p }, o.opts);
    const files2 = r.ok ? split(o.opts.folder, r.text, r.edits) : null;
    const a2 = files2 && analyzeFiles(files2);
    check(plan.ok && plan.items.some(x => x.role === 'with' && x.path === 'circuit.sysml') && r.ok && JSON.stringify(touched(o.opts.folder, r.edits)) === JSON.stringify(['circuit.sysml', 'lib.sysml'])
      && a2.ok && a2.semantic.length === 0 && !files2[0].text.includes('connect') && files2[0].text.includes('part y : Board;\r\n    }\r\n') && !/port p;/.test(files2[2].text) && files2[2].text.includes('        port q;\n'),
    'X21: 2 つのファイルにまたがる削除(Board の p と、ほかのファイルの connect)を行い、行ごと消す(CR LF のファイルも)', r.ok ? JSON.stringify(files2) : `${r.code} ${r.reason} ${JSON.stringify(r.details)}`);
  }
  // 削除の拒否: Lamp はほかのファイルから型として指される(消す範囲の外に参照が残る)。箇所に相対パスを付ける
  {
    const o = open(FILES);
    const r = deletePlan({ analysis: o.analysis, element: elIn(o.a.tree, 'Lamp', 'PartDefinition'), text: o.a.text }, o.opts);
    check(!r.ok && r.code === 'remaining-refs' && r.details.some(x => x.startsWith('circuit.sysml 4 行')) && r.details.some(x => x.startsWith('extra.sysml 1 行')), 'X21: ほかのファイルに参照が残る削除は、相対パス付きの箇所を出して行わない(8 章の条件)', JSON.stringify(r));
  }
  // 名前の変更の拒否: ほかのファイルに、変える名前を参照しうる未検査の参照がある
  {
    const files = [...FILES.slice(0, 2), { path: 'more.sysml', text: 'part m : Missing::Lamp;\n' }, FILES[2]];
    const o = open(files);
    const r = renameElement({ text: o.a.text, analysis: o.analysis, element: elIn(o.a.tree, 'Lamp', 'PartDefinition'), which: 'name', newName: 'Lamp3' }, o.opts);
    check(!r.ok && !r.reverted && r.code === 'unchecked-refs' && r.details.some(x => x.startsWith('more.sysml 1 行')), 'X21: ほかのファイルに、変える名前を参照しうる未検査の参照があれば、相対パス付きの箇所を出して行わない(8 章の条件)', JSON.stringify(r));
  }
  // 1 つのファイルに収まる操作は今のまま(Unused の名前の変更は lib.sysml だけ)
  {
    const o = open(FILES);
    const r = renameElement({ text: o.a.text, analysis: o.analysis, element: elIn(o.a.tree, 'Unused', 'PartDefinition'), which: 'name', newName: 'Unused2' }, o.opts);
    check(r.ok && JSON.stringify(touched(o.opts.folder, r.edits)) === JSON.stringify(['lib.sysml']), 'X21: 1 つのファイルに収まる名前の変更は、そのファイルだけを書き換える', JSON.stringify(r.ok ? r.edits : r));
  }
  // 切り替え EDIT21.X を切れば、GR20 の段階 A(ほかのファイルも書き換える操作は理由を出して行わない)
  {
    EDIT21.X = false;
    const o = open(FILES);
    const r1 = renameElement({ text: o.a.text, analysis: o.analysis, element: elIn(o.a.tree, 'Lamp', 'PartDefinition'), which: 'name', newName: 'Lamp2' }, o.opts);
    const r2 = deletePlan({ analysis: o.analysis, element: elIn(o.a.tree, 'p', 'PortUsage'), text: o.a.text }, o.opts);
    EDIT21.X = true;
    check(!r1.ok && r1.code === 'other-file' && !r2.ok && r2.code === 'other-file' && /circuit\.sysml/.test(r1.reason), 'X21: EDIT21.X を切ると、ほかのファイルも書き換える操作は理由を出して行わない(GR20 の段階 A に戻る)', `${r1.reason} / ${r2.reason}`);
  }
}

// ---- まとめ
const sec = (performance.now() - t0) / 1000;
section('まとめ');
// GR17 P8: 索引を既定に入れ、上限を 5 分から 8 分にした(GR17 起動プロンプト v17.2 の裁定 1。予定の red の 1)
// GR18 P5: F2 で選ぶ間隔を GR17 P8 で広げる前に戻し、655.9 秒で 8 分を超えた(前の期待値で流したログは out/GR18/logs/P5/before/edit.log)。
// 予定の red の 6 として、上限を設計書 10 章の「1 回の検査が 15 分以内」にした
// GR20 の Z1: 時間は記録するだけで合否に使わない(設計書 10 章)。GR19 までは「15 分以内に終わる」を合否にしていた
check(true, `全体の時間の記録(合否に使わない): ${sec.toFixed(1)} 秒`);
console.log(`  合格 ${passes} 件、失敗 ${failures} 件、所要 ${sec.toFixed(1)} 秒`);
process.exit(failures ? 1 : 0);
