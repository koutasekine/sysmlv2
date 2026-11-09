// 画面の処理のうち、Node.js で動かせるものの検査(GR4 指示書 6 章・9 章の P3、8 章の 4・5)。
//
// 使い方:
//   node tests/view/app.mjs          # 単独で動かす
//   tests/view/run.mjs から runAppTests() を呼ぶ
//
// 検査すること:
//   1. (GR13 で置き換えた。前は、原文を .svg に埋め込んで読み出す往復)「開く」は .sysml だけを受け付け、.svg などほかの拡張子は
//      「開けるのは .sysml のファイルだけです」にする。原文を埋め込む処理と、.svg から原文を取り出す処理がない
//   2. 読み込み: .sysml は UTF-8 として正しくなければエラー、BOM は残す(GR13 で、細工した .svg の読み込みの検査を除いた)
//   3. 診断の組み立て: 構文エラー・未検査(名前ごと)・曖昧・図の診断を分け、修正依頼の文を作る
//   4. 色付け: 入力の < & を HTML として出さない
//   5. Worker の受け渡し: init と run の応答、同じテキストで範囲を変えたときの再利用。
//      GR6: ビューの切り替え、開いたときに最初の view の型でビューを決めること、相互接続だけの HTML(enabled が
//      相互接続だけ)で StateTransitionView の view を含むテキストを開いても例外にならず、相互接続ビューで表示して図の診断に出すこと。
//      GR10: 一般ビュー(例の「構成の図」、GeneralView とそれを特殊化した型の view を開いたとき、相互接続だけの HTML)
//   6. 例: 「例を読み込む」の例が構文上正しく、描いたとき (a) 横切り・(b) 重なり・(c) 文字の重なり・(d) コの字が 0 件
//      (P2 の 4 回目の裁定 3、GR4 の完了報告の確認の後の 2 回目の指示 2)
//   7. 見えている範囲だけの色付け: 範囲の文字と注の扱い。out/view/big.sysml があれば、1 回の色付けが 50 ms 以下
//   GR13 で加わった検査(GR13 指示書 5 章・7 章):
//   9. 図を 1 つずつ保存する: 保存する SVG(src/view/pieces.js の pieceSvg)に原文・data-*・当たり判定が入らず、@page が入り、
//      正しい XML として読める(例の 5 つのビューの全候補)。図の題の位置(figureTitle)、ファイル名、Worker が返す題と範囲の名前、
//      画面のボタンの並び
//  10. 表のビュー: Worker が表(保存する SVG・タブ区切りの文字・題の位置)を返す。例を表に切り替えると「部品と要求の表」を描き、
//      意味エラー・未検査が 0 件。型が GridView(またはそれを特殊化した定義)の view を開いたときは表で表示する。
//      相互接続だけの HTML では表を選べず、図の診断に出す

//   GR19 で加わった検査 15(GR19 指示書 4 章): tests/view/app_main.mjs --gr19 で、警告の段・U1〜U3 を画面のスクリプトで確かめ、
//      U4 をテキスト欄の案内の文で確かめる
//   GR19 の P5 で加わった検査 16(GR19 指示書 v19.1 の 4 章): tests/view/app_main.mjs --gr19p5 で、警告の段の見出し(R1)と修正依頼の
//      依頼文(R2)を画面のスクリプトで確かめ、警告の文・見出し・「書き方」・プロンプトの中身(Q3・R1)を確かめる
//   GR20 で加わった検査 17(GR20 指示書 4 章の F): tests/view/app_main.mjs --gr20 で、フォルダの段階 A の画面を確かめ、上の帯・テキスト欄の上の部品と
//      「書き方」の例を確かめる
//   GR21 で加わった検査 18(GR21 指示書 4 章の H・O・Z・X): tests/view/app_main.mjs --gr21 で、ファイルごとの取り消しの履歴・上書き保存・zip の
//      保存・複数のファイルにまたがる編集とつながった取り消しを画面のスクリプトで確かめ、履歴の部品(src/app/history.js)と保存の部品
//      (src/app/save.js)を直接呼んで確かめる。「書き方」の標準ライブラリと同じ名前を付けない注意の 1 行(K)も確かめる
//   GR22 で加わった検査 19(GR22 指示書 4 章の A1〜A4・B1〜B5): tests/view/app_main.mjs --gr22 で、フォルダの診断のクリックの行き先(A1)、変換中の
//      取り消し(A2)、つながった履歴が消えたとき(A3)、保存の途中の「保存」(A4)、「範囲」の欄の同じ表示(B1)、2 つ以上のドロップ(B2)、
//      診断 0 件の修正依頼のコピー(B3)、構文エラーのクリックの字句(B5)を画面のスクリプトで確かめ、履歴の部品(src/app/history.js)を
//      直接呼んで、つながった履歴が消えたときに、ほかのファイルの履歴からも消すこと(A3。上限を小さくして確かめる)を確かめる。
//      表のタブ区切りの文字(B4)、候補の表示(B1。src/app/prepare.js の folderLabels)、字句の範囲(B5。src/app/diag.js の tokenRange)、
//      診断が 0 件か(B3。noDiagnostics)も直接呼んで確かめる
//   GR22 の P4 で加わった検査 20(GR22 指示書 v22.2 の 4 章の B3b・D1): tests/view/app_main.mjs --gr22p4 で、修正依頼のコピーを押せる条件(B3b)と
//      1 ファイルの置き換えの確認(D1)を画面のスクリプトで確かめ、押せるかどうかと依頼文の段が同じ判定であることを段の有無の 512 通りで確かめる
//   GR24 で加わった検査 21(GR24 指示書 4 章の T・F・M・Z・モデル): tests/view/app_main.mjs --gr24 で、フォルダの木(並び・.git・薄く出す
//      ファイル・強調と相対パス・書き換えの印・.sysml のないフォルダ・診断と図のクリック)とファイルの操作を、書き込みを記録する偽のフォルダの
//      ハンドルで確かめる。フォルダの木の部品(src/app/tree.js)を直接呼んで、並び・名前の規則・「 のコピー」の名前を確かめる
//   GR24 の P5 で加わった検査 22(GR24 指示書 v24.2 の 4 章の D・E・I・N・P): tests/view/app_main.mjs --gr24p5 で、木の項目の draggable と、
//      #drop を外からのファイルのときだけ出すこと(D)、フォルダの名前の変更・移動の後の開閉(E)、知らせ(N)、フォルダを開いていないときの
//      木の欄と畳んだ状態を覚えること(P)を確かめる。--gr24p5start を、前の流しが覚えた localStorage(--ls)・覚えなし・例外を出す
//      localStorage(--lsthrow)で流し、ページを開き直したときの状態を確かめる。テンプレートの 5 つのボタンが SVG のアイコンで、title と
//      aria-label を持つこと(I)を確かめる
//   GR25 で加わった検査 23(GR25 指示書 4 章の A1〜A6): tests/view/app_main.mjs --gr25a で、名前の変更・移動・コピーの後の保存の確かめ(A1)、
//      作り直すファイルの確かめ(A2)、ハンドルなしの木の操作の後の置き換えの確認(A3)、beforeunload(A4)、削除の確認の木に出ないもの(A5)、
//      書き込みが途中で失敗したときの作りかけのファイル(A6)を、書き込みを記録する偽のフォルダのハンドルで確かめる
//   GR25 で加わった検査 24(GR25 指示書 4 章の B・C1〜C12): tests/view/app_main.mjs --gr25bc で、配置の幅(B)と、名前の入力欄・ドラッグ・
//      メニュー・再読み込み・名前の規則・貼り付けの細かい動き(C1〜C4・C6〜C12)を確かめ、README の「フォルダで扱う」の節(C5)を確かめる
//   GR25 の P4 で加わった検査 25(GR25 指示書 v25.2 の 4 章の K・B・F): ビルド(tools/build/build.mjs)が 1 つの export const に並べた名前を
//      すべて書き出すこと、まとめた HTML の中で読み込む名前がすべて書き出しにあること(checkHtmlImports)と、それを確かめる道具が足りない名前を
//      見つけること、まとめた各ファイルの書き出しが Node.js で読み込んだ本物の書き出しと同じこと(K)。tests/view/app_main.mjs --gr25k で、
//      ビルドした HTML のスクリプトで配置の幅が数値の px になること(B)。tests/view/app_main.mjs --gr25f で、フォルダの名前の変更・移動・コピーが
//      途中で失敗したとき、写す先に作ったものを消すこと(F)
//   GR26 で加わった検査 26(GR26 指示書 4 章の L・T・R・N・H): tests/view/app_main.mjs --gr26lt で、木の欄の 2 つの区画(開閉・localStorage・
//      境目の分割バー・1 ファイルのとき・配置の幅)と、試しのフォルダ(tools/model/gr26_folder.mjs)のモデルツリー(木の形・並べる要素・項目の表示・
//      名前のない要素の要約・同じ名前の別の要素・型の印・解析し直した後の開閉と選択・構文エラーのファイル・大きなモデルの開閉の時間)を確かめる。
//      --gr26ls を、localStorage の覚えなし・あり(2 通り)・例外で流し、ページを開いた直後の区画の開閉を確かめる。モデルツリーの部品
//      (src/app/modeltree.js の visibleRows)と区画の高さ(src/app/modeltree.js の sectionHeight)を直接呼んで確かめる。--gr26r で、参照箇所(役割・
//      所属・ファイルと行、未検査・曖昧を入れないこと、選んだ要素がなくなったとき、名前の変更で書き換える参照の数との照合)を確かめる
//      --gr26n で、移動(項目・参照箇所の行・型。別のファイルへ、書き換えと取り消しの履歴、古い解析、名前の変更・追加・削除・ファイルの名前の
//      変更・再読み込みの後)と、ファイルの移動・名前の変更の失敗の文(H)を確かめる。「書き方」と README の説明、生成 AI 向けプロンプトが
//      変わらないこと(H)を確かめる
//   GR27 で加わった検査(GR27 指示書 4 章の O・L): tests/view/app_main.mjs --gr27(と --built)で、ビューの切り替えの結果にモデルツリーが入らず
//      画面は前の木を出すこと、同じテキストを開き直すと木が入ること、範囲の欄の候補と木の修飾名が今と同じこと、大きいファイルの知らせを確かめる
//      GR27 の P4(指示書 4 章の Q): 同じく、図の要素・線を選んだときの「修飾名:」が、描画の関数の構造の info.qname と同じこと
//      GR27 の P5(指示書 4 章の S・M): tests/view/app_main.mjs --gr27p5(と --built)で、範囲の欄の候補の文字(長い修飾名の前を省く)と title、
//      モデルツリーの行を見えている分だけ並べること
//   GR18 で加わった検査 14(GR18 指示書 2.6 節の W3): 画面のスクリプトを、runner.js を通した Worker との実際の受け渡しで動かす
//      (tests/view/app_main.mjs を別のプロセスで動かす)。W1 の受け渡しの形と、W2 の名前の変更の後の選択

import fs from 'node:fs';
import path from 'node:path';
// tests/view/app_main.mjs --gr21 の結果の数(GR21)
const GR21_ROWS = 29;
// tests/view/app_main.mjs --gr22 の結果の数(GR22)
const GR22_ROWS = 23;
// tests/view/app_main.mjs --gr22p4 --first new の結果の数(GR22 の P4)
const GR22P4_ROWS = 16;
// tests/view/app_main.mjs --gr24 の結果の数(GR24。起動の 1 件を含む)
const GR24_ROWS = 42;
// tests/view/app_main.mjs --gr24p5 の結果の数(GR24 の P5。起動の 1 件を含む)と、--gr24p5start の結果の数
const GR24P5_ROWS = 13, GR24P5START_ROWS = 3;
// tests/view/app_main.mjs --gr25a の結果の数(GR25 の A1〜A6。起動の 1 件を含む)
const GR25A_ROWS = 18; // P1 の裁定の問 1・問 2 の 2 件を足した(P1 では 16)
// tests/view/app_main.mjs --gr25bc の結果の数(GR25 の B・C。起動の 1 件を含む)
const GR25BC_ROWS = 15;
// tests/view/app_main.mjs --gr25k・--gr25f の結果の数(GR25 の P4 の K・B と F。起動の 1 件を含む)
const GR25K_ROWS = 5, GR25F_ROWS = 10;
// tests/view/app_main.mjs --gr26lt・--gr26ls の結果の数(GR26 の L・T。起動の 1 件を含む)
const GR26LT_ROWS = 22, GR26LS_ROWS = 3;
// tests/view/app_main.mjs --gr26r ・--gr26n の結果の数(GR26 の R・N・H。起動の 1 件を含む)
const GR26R_ROWS = 18, GR26N_ROWS = 17;
// tests/view/app_main.mjs --gr26p5 の結果の数(GR26 の P5 の K・M・S・J・A・P・W・H・T。起動の 1 件を含む。--built でも同じ)
const GR26P5_ROWS = 18;
// tests/view/app_main.mjs --gr26p6 の結果の数(GR26 の P6 の B・Y・Q。起動の 1 件を含む。--ro・--built でも同じ)
const GR26P6_ROWS = 10;
// tests/view/app_main.mjs --gr27 の結果の数(GR27 の O・L と P4 の Q。起動の 1 件を含む。--built でも同じ)
const GR27_ROWS = 12;
// tests/view/app_main.mjs --gr27p5 の結果の数(GR27 P5 の S・M。起動の 1 件を含む。--built でも同じ)
const GR27P5_ROWS = 16;
import * as io from '../../src/app/io.js';
import { readSysml, fileKind, OPEN_ONLY_SYSML } from '../../src/app/io.js';
import { buildDiagnostics, toPrompt } from '../../src/app/diag.js';
import { makeHighlighter, makeWindowHighlighter } from '../../src/app/highlight.js';
import grammar from '../../src/parser/grammar_table.js';
import { parse } from '../../src/parser/index.js';
import { prepareView, renderInterconnection, renderGeneral, renderStateTransition, renderActionFlow, renderSequence } from '../../src/view/index.js';
import { figureTitle, pieceSvg, safeName, pieceBase, tableBase } from '../../src/view/pieces.js';
import { parseXml } from '../../src/app/xml.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
// 「例を読み込む」の例(ビルドが画面のスクリプトに入れるもの)
const SAMPLE = fs.readFileSync(path.join(ROOT, 'src/app/sample.sysml'), 'utf8');

export async function runAppTests(log = console.log) {
  let passes = 0, failures = 0;
  const check = (ok, what, detail = '') => { if (ok) passes++; else { failures++; log(`  失敗: ${what}${detail ? ` — ${detail}` : ''}`); } };
  // 1. 「開く」は .sysml だけ(GR13 指示書 4 章。予定の red の 1 で、埋め込みの往復と細工した .svg の読み込みの検査から置き換えた)
  for (const name of ['a.sysml', 'A.SYSML', 'システム.sysml']) check(fileKind(name) === 'sysml', `開く: ${name} を受け付ける`);
  for (const name of ['a.svg', 'a.SVG', 'a.sysml.svg', 'a.txt', 'a.kerml', 'a.png', 'sysml', 'a.sysml.bak']) check(fileKind(name) === null, `開く: ${name} を受け付けない`);
  check(OPEN_ONLY_SYSML === '開けるのは .sysml のファイルだけです', '開く: .sysml 以外のファイルに出す文');
  check(!('embedSource' in io) && !('extractSource' in io) && !('base64Encode' in io), '原文を埋め込む処理と、.svg から原文を取り出す処理がない', Object.keys(io).join(','));
  {
    const main = fs.readFileSync(path.join(ROOT, 'src/app/main.js'), 'utf8'), tpl = fs.readFileSync(path.join(ROOT, 'src/app/template.html'), 'utf8');
    check(/accept="\.sysml"/.test(tpl) && !/accept="[^"]*svg/.test(tpl), '開く: ファイルを選ぶ画面で .sysml だけを選ばせる');
    check(/if \(!kind\) \{ alert\(OPEN_ONLY_SYSML\); return; \}/.test(main) && !/extractSource|embedSource|metadata/.test(main), '開く・ドラッグ・アンド・ドロップ: .sysml でなければ文を出して読み込まない');
    // 上の帯の「保存…」(形式を選ぶ一覧)を「保存」のボタンにした(GR13 指示書 4 章)。押すと今のテキストを .sysml で保存する
    check(/<button id="btnSave">保存<\/button>/.test(tpl) && !/id="saveAs"|保存…/.test(tpl), '保存: 上の帯に「保存」のボタンがあり、形式を選ぶ一覧がない');
    check(/\$\('#btnSave'\)\.addEventListener\('click', \(\) => \{[^}]*download\(`\$\{fileBase\}\.sysml`/.test(main) && !/#saveAs/.test(main), '保存: 「保存」で今のテキストを .sysml で保存する');
  }

  // 2. 読み込み
  check(!readSysml(new Uint8Array([0x70, 0xff])).ok, '.sysml: UTF-8 として正しくなければエラー');
  check(readSysml(new Uint8Array([0xef, 0xbb, 0xbf, 0x70])).text === '\uFEFFp', '.sysml: BOM を残す');

  // 3. 診断の組み立て
  {
    const t = 'part a {\n  part b : Missing;\n  part c : ScalarValues::Real;\n';
    const p = parse(t);
    const d = buildDiagnostics({ text: t, errors: p.errors });
    check(d.syntax.length === 1 && d.syntax[0].line >= 3, '診断: 構文エラーの位置', JSON.stringify(d.syntax));
    const t2 = 'part a {\n  part b : Missing;\n  part c : Missing;\n  part d : Other;\n}\n';
    const pv = prepareView(t2);
    const d2 = buildDiagnostics({ text: t2, refs: pv.ctx.model.refs, view: [{ level: 'warn', code: 'x', message: 'm', start: 0, end: 1 }] });
    check(d2.unchecked.count === 3 && d2.unchecked.groups[0].name === 'Missing' && d2.unchecked.groups[0].count === 2 && d2.unchecked.groups[0].lines.join() === '2,3', '診断: 未検査を名前ごとにまとめる', JSON.stringify(d2.unchecked));
    check(d2.view.length === 1 && d2.view[0].line === 1, '診断: 図の診断の行');
    const pr = toPrompt(d2, t2);
    check(pr.includes('未検査の名前(3 件') && pr.includes('Missing') && pr.includes(t2.trim()), '診断: 修正依頼の文に、未検査とテキストが入る');
    const pr2 = toPrompt(d, t);
    check(pr2.includes('## 構文エラー') && pr2.includes('行'), '診断: 修正依頼の文に、構文エラーが入る');
  }

  // 4. 色付け
  {
    const hl = makeHighlighter({ keywords: grammar.keywords, symbols: grammar.symbols });
    const h = hl("part '<script>alert(1)</script>' { doc /* <img src=x onerror=alert(1)> & */ attribute s = \"<b>\"; }");
    check(!/<script|<img|<b>/.test(h) && h.includes('&lt;script&gt;') && h.includes('&amp;'), '色付け: < & をエスケープする');
    const h2 = hl("part a { '<x");
    check(!h2.includes('<x') && h2.includes('&lt;x'), '色付け: 字句の誤りの後ろもエスケープする');
  }

  // 5. Worker の受け渡し(self と postMessage を用意して src/app/worker.js を読み込む)
  {
    const sent = [];
    globalThis.self = globalThis;
    globalThis.postMessage = (m) => sent.push(m);
    await import('../../src/app/worker.js');
    self.onmessage({ data: { type: 'init' } });
    check(sent[0]?.type === 'init' && sent[0].keywords.includes('part'), 'Worker: init に予約語の一覧を返す');
    sent.length = 0;
    self.onmessage({ data: { type: 'run', id: 1, text: SAMPLE, candidateId: null } });
    const res = sent.find((m) => m.type === 'result');
    const stages = [...new Set(sent.filter((m) => m.type === 'progress').map((m) => m.stage))];
    check(res?.ok && res.svg?.startsWith('<svg') && res.id === 1, 'Worker: 結果を返す');
    check(['lex', 'parse', 'derive', 'tree', 'resolve', 'candidates', 'render'].every((s) => stages.includes(s)), 'Worker: 進み具合の段階をすべて知らせる', stages.join(','));
    sent.length = 0;
    self.onmessage({ data: { type: 'run', id: 2, text: SAMPLE, candidateId: res.candidates[0].id } });
    check(!sent.some((m) => m.type === 'progress' && m.stage === 'parse') && sent.at(-1).ok, 'Worker: 同じテキストなら解析をやり直さない');
    sent.length = 0;
    self.onmessage({ data: { type: 'run', id: 3, text: 'part a {', candidateId: null } });
    const r3 = sent.at(-1);
    check(r3.type === 'result' && !r3.ok && r3.diagnostics.syntax.length === 1, 'Worker: 構文エラーを返す');
    // GR6: ビュー
    const BOTH = ['interconnection', 'state-transition'], IC = ['interconnection'];
    const STV = 'package Q {\n  state def S { entry; then a; state a; }\n  view v : StandardViewDefinitions::StateTransitionView { expose S; expose S::**; }\n}\n';
    const runW = (m) => { sent.length = 0; self.onmessage({ data: { type: 'run', id: 9, ...m } }); return sent.find((x) => x.type === 'result'); };
    let w = runW({ text: SAMPLE, candidateId: null, view: 'interconnection', opening: true, enabled: BOTH });
    check(w?.ok && w.view === 'interconnection' && w.svg, 'Worker: 例を開くと相互接続ビュー(最初の view に型がない)');
    w = runW({ text: SAMPLE, candidateId: null, view: 'state-transition', opening: false, enabled: BOTH });
    check(w?.ok && w.view === 'state-transition' && w.svg && /動作の図/.test(w.candidate?.id ?? '') && w.diagnostics.semantic.length === 0 && w.diagnostics.unchecked.count === 0, 'Worker: 例を状態遷移ビューに切り替えると「動作の図」を描き、意味エラー・未検査が 0 件', w?.candidate?.id);
    w = runW({ text: STV, candidateId: null, view: 'interconnection', opening: true, enabled: BOTH });
    check(w?.ok && w.view === 'state-transition' && w.svg, 'Worker: 最初の view の型が StateTransitionView なら、開いたときに状態遷移ビュー');
    let threw = null;
    try { w = runW({ text: STV, candidateId: null, view: 'interconnection', opening: true, enabled: IC }); } catch (e) { threw = e; }
    check(!threw && w?.ok && w.view === 'interconnection' && w.svg && w.diagnostics.view.some((v) => v.code === 'view-not-enabled'), 'Worker: 相互接続だけの HTML で StateTransitionView の view を開いても例外にならず、相互接続ビューで表示して図の診断に出す', String(threw ?? ''));
    w = runW({ text: STV, candidateId: null, view: 'state-transition', opening: false, enabled: IC });
    check(w?.ok && w.view === 'interconnection', 'Worker: 相互接続だけの HTML では、状態遷移を頼まれても相互接続ビューで描く');
    // GR7: アクションフロービュー
    const ALL = ['interconnection', 'state-transition', 'action-flow'];
    const AFV = 'package Q {\n  action def A { first start; then action a; then done; }\n  view v : StandardViewDefinitions::ActionFlowView { expose A; expose A::**; }\n}\n';
    w = runW({ text: SAMPLE, candidateId: null, view: 'action-flow', opening: false, enabled: ALL });
    check(w?.ok && w.view === 'action-flow' && w.svg && /手順の図/.test(w.candidate?.id ?? '') && w.diagnostics.semantic.length === 0 && w.diagnostics.unchecked.count === 0, 'Worker: 例をアクションフロービューに切り替えると「手順の図」を描き、意味エラー・未検査が 0 件', w?.candidate?.id);
    check(/data-start=/.test(w?.svg ?? ''), 'Worker: アクションフロービューの図の要素は原文の範囲(data-start)を持つ(段階 0)');
    w = runW({ text: AFV, candidateId: null, view: 'interconnection', opening: true, enabled: ALL });
    check(w?.ok && w.view === 'action-flow' && w.svg, 'Worker: 最初の view の型が ActionFlowView なら、開いたときにアクションフロービュー');
    threw = null;
    try { w = runW({ text: AFV, candidateId: null, view: 'interconnection', opening: true, enabled: IC }); } catch (e) { threw = e; }
    check(!threw && w?.ok && w.view === 'interconnection' && w.diagnostics.view.some((v) => v.code === 'view-not-enabled'), 'Worker: 相互接続だけの HTML で ActionFlowView の view を開いても例外にならず、相互接続ビューで表示して図の診断に出す', String(threw ?? ''));
    // GR9: シーケンスビュー
    const ALL4 = ['interconnection', 'state-transition', 'action-flow', 'sequence'];
    const SQV = 'package Q {\n  occurrence def X { part a { event occurrence e1; } part b { event occurrence e2; } message m from a.e1 to b.e2; }\n  view v : StandardViewDefinitions::SequenceView { expose X; expose X::**; }\n}\n';
    w = runW({ text: SAMPLE, candidateId: null, view: 'sequence', opening: false, enabled: ALL4 });
    check(w?.ok && w.view === 'sequence' && w.svg && /やりとりの図/.test(w.candidate?.id ?? '') && w.diagnostics.semantic.length === 0 && w.diagnostics.unchecked.count === 0, 'Worker: 例をシーケンスビューに切り替えると「やりとりの図」を描き、意味エラー・未検査が 0 件', w?.candidate?.id);
    check(/data-start=/.test(w?.svg ?? ''), 'Worker: シーケンスビューの図の要素は原文の範囲(data-start)を持つ(段階 0)');
    w = runW({ text: SQV, candidateId: null, view: 'interconnection', opening: true, enabled: ALL4 });
    check(w?.ok && w.view === 'sequence' && w.svg, 'Worker: 最初の view の型が SequenceView なら、開いたときにシーケンスビュー');
    threw = null;
    try { w = runW({ text: SQV, candidateId: null, view: 'interconnection', opening: true, enabled: IC }); } catch (e) { threw = e; }
    check(!threw && w?.ok && w.view === 'interconnection' && w.diagnostics.view.some((v) => v.code === 'view-not-enabled'), 'Worker: 相互接続だけの HTML で SequenceView の view を開いても例外にならず、相互接続ビューで表示して図の診断に出す', String(threw ?? ''));
    // GR10: 一般ビュー
    const ALL5 = ['interconnection', 'general', 'state-transition', 'action-flow', 'sequence'];
    const GV = 'package Q {\n  part def A;\n  part a : A;\n  view v : StandardViewDefinitions::GeneralView { expose a; expose A; }\n}\n';
    w = runW({ text: SAMPLE, candidateId: null, view: 'interconnection', opening: true, enabled: ALL5 });
    // GR13 の追加の直し その 3: 最初の view の型で決まらないときは一般ビューで開く(前は、例を開くと相互接続ビューで「全体図」)
    check(w?.ok && w.view === 'general' && w.candidate?.id === 'view:見守りシステムの例::構成の図', 'Worker: 5 つのビューを選べる HTML で例を開くと、最初の view に型がないので一般ビューで開き、型が GeneralView の「構成の図」を描く', `${w?.view} ${w?.candidate?.id}`);
    w = runW({ text: '', candidateId: null, view: 'interconnection', opening: true, enabled: ALL5 });
    check(w?.ok && w.view === 'general', 'Worker: 「新規」(空のテキスト)で開くと一般ビュー', w?.view);
    w = runW({ text: SAMPLE, candidateId: null, view: 'general', opening: false, enabled: ALL5 });
    check(w?.ok && w.view === 'general' && w.svg && /構成の図/.test(w.candidate?.id ?? '') && w.diagnostics.semantic.length === 0 && w.diagnostics.unchecked.count === 0 && w.diagnostics.view.length === 0, 'Worker: 例を一般ビューに切り替えると「構成の図」を描き、意味エラー・未検査・図の診断が 0 件', w?.candidate?.id);
    check(/data-start=/.test(w?.svg ?? '') && w.structure.nodes.concat(w.structure.edges).every((x) => x.src && w.svg.includes(`data-id="${x.id}"`)), 'Worker: 一般ビューの図の要素は原文の範囲(data-start)を持つ(段階 0)');
    w = runW({ text: GV, candidateId: null, view: 'interconnection', opening: true, enabled: ALL5 });
    check(w?.ok && w.view === 'general' && w.svg, 'Worker: 最初の view の型が GeneralView なら、開いたときに一般ビュー');
    w = runW({ text: 'package P {\n  view def MyView :> StandardViewDefinitions::GeneralView;\n  part def A;\n  view v : MyView { expose A; }\n}\n', candidateId: null, view: 'interconnection', opening: true, enabled: ALL5 });
    check(w?.ok && w.view === 'general' && w.svg, 'Worker: view の型が GeneralView を特殊化した定義でも、開いたときに一般ビュー');
    threw = null;
    try { w = runW({ text: GV, candidateId: null, view: 'interconnection', opening: true, enabled: IC }); } catch (e) { threw = e; }
    check(!threw && w?.ok && w.view === 'interconnection' && w.diagnostics.view.some((v) => v.code === 'view-not-enabled'), 'Worker: 相互接続だけの HTML で GeneralView の view を開いても例外にならず、相互接続ビューで表示して図の診断に出す', String(threw ?? ''));
    // GR13: 図の題の位置と範囲の名前(題の右のボタンとファイル名に使う)
    // GR13 の追加の直し その 3 の裁定(案 A): 開く扱いにしない形で、相互接続ビューの「全体図」を描いて確かめる(前は opening: true)
    w = runW({ text: SAMPLE, candidateId: null, view: 'interconnection', opening: false, enabled: ALL5 });
    check(w?.title?.label === '«view» 全体図' && w.title.y > 0 && w.scopeName === '全体図', 'Worker: 図の題の位置と範囲の名前を返す', JSON.stringify([w?.title, w?.scopeName]));
    // GR13: 表のビュー(GR13 指示書 6 章)
    // GR13 の追加の直し(その 2)で、表のビューの値を 'table' から 'grid'(グリッドビュー)にし、順を仕様書の表 34 の順にした
    const ALL6 = ['general', 'interconnection', 'action-flow', 'state-transition', 'sequence', 'grid'];
    w = runW({ text: SAMPLE, candidateId: null, view: 'grid', opening: false, enabled: ALL6 });
    check(w?.ok && w.view === 'grid' && w.candidate?.id === 'view:見守りシステムの例::部品と要求の表' && w.diagnostics.semantic.length === 0 && w.diagnostics.unchecked.count === 0 && w.scopeName === '部品と要求の表' && w.title === null, 'Worker: 例をグリッドビューに切り替えると「部品と要求の表」を描き、意味エラー・未検査が 0 件', w?.candidate?.id);
    // GR17 P9: 例に perform を足し(S)、機能の割り当て表にも行が出るので、期待値を置き換えた(予定の red の 3。オーナーの指示で app.mjs も置き換えた。
    // 前は、題の位置が 3 つ(行のある表 3 つ)、機能の割り当て表(tables[3])が空。前の期待値で流したログは out/GR17/logs/P9/before/view.log)
    check(w?.anchors?.length === 4 && w.anchors.every((a) => a.bodyTop > a.y && w.svg.includes(`<g data-sym="table" transform="translate(20,${a.bodyTop})">`)), 'Worker: 表の題の位置に、表の本体の上端(bodyTop)を付ける', JSON.stringify(w?.anchors));
    check(w?.tables?.length === 4 && w.tables.map((t) => t.name).join() === '部品の一覧,ポートと接続先,要求と満たす部品,機能の割り当て表' && w.tables[0].tsv.startsWith('部品\t型\t持ち主\t多重度\t説明\n') && w.tables[0].svg.startsWith('<svg') && !w.tables[3].empty && w.anchors.length === 4, 'Worker: 表のビューでは、4 つの表(保存する SVG・タブ区切りの文字)と題の位置を返す');
    const GRV = 'package Q {\n  part a;\n  view t : StandardViewDefinitions::GridView { expose a; }\n}\n';
    w = runW({ text: GRV, candidateId: null, view: 'interconnection', opening: true, enabled: ALL6 });
    check(w?.ok && w.view === 'grid' && w.svg && w.diagnostics.unchecked.count === 0, 'Worker: 最初の view の型が GridView なら、開いたときにグリッドビューで表示し、GridView は未検査にならない', JSON.stringify(w?.diagnostics.unchecked));
    w = runW({ text: 'package P {\n  view def MyTable :> StandardViewDefinitions::GridView;\n  part a;\n  view t : MyTable { expose a; }\n}\n', candidateId: null, view: 'interconnection', opening: true, enabled: ALL6 });
    check(w?.ok && w.view === 'grid' && w.svg, 'Worker: view の型が GridView を特殊化した定義でも、開いたときにグリッドビューで表示する');
    threw = null;
    try { w = runW({ text: GRV, candidateId: null, view: 'interconnection', opening: true, enabled: IC }); } catch (e) { threw = e; }
    check(!threw && w?.ok && w.view === 'interconnection' && w.diagnostics.view.some((v) => v.code === 'view-not-enabled'), 'Worker: 相互接続だけの HTML で GridView の view を開いても例外にならず、相互接続ビューで表示して図の診断に出す', String(threw ?? ''));
    delete globalThis.postMessage;
  }

  // 6. 例
  {
    const p = prepareView(SAMPLE);
    check(p.ok, '例: 構文上正しい');
    if (p.ok) {
      for (const c of p.candidates) {
        const r = renderInterconnection(p, c.id, { quality: true });
        const q = r.quality;
        check(q.crossings.length === 0 && q.overlaps.length === 0 && q.textOverlaps.length === 0 && q.uturns.length === 0, `例(${c.id}): (a)〜(d) が 0 件`, `横切り ${q.crossings.length}、重なり ${q.overlaps.length}、文字の重なり ${q.textOverlaps.length}、コの字 ${q.uturns.length}`);
      }
      const d = buildDiagnostics({ text: SAMPLE, refs: p.ctx.model.refs });
      check(d.unchecked.count === 0 && d.ambiguous.count === 0, '例: 未検査・曖昧の参照がない', `未検査 ${d.unchecked.count}`);
      check(/'[^']*[぀-ヿ一-鿿][^']*'/.test(SAMPLE), '例: 日本語の名前(単一引用符)を含む');
    }
  }
  // 9. 図を 1 つずつ保存する(GR13 指示書 5 章、7 章の 4)
  {
    const p = prepareView(SAMPLE);
    const views = [['interconnection', renderInterconnection, p.candidates], ['general', renderGeneral, p.generalCandidates], ['state-transition', renderStateTransition, p.stateCandidates], ['action-flow', renderActionFlow, p.actionCandidates], ['sequence', renderSequence, p.sequenceCandidates]];
    const bad = [];
    let n = 0;
    for (const [v, render, cands] of views) {
      for (const c of cands) {
        const r = render(p, c.id);
        const sv = pieceSvg(r.svg);
        n++;
        const [, w, h] = /<svg [^>]*?width="([\d.]+)" height="([\d.]+)"/.exec(r.svg);
        const why = [];
        if (/ data-[a-z-]+=/.test(sv)) why.push('data-*');
        if (/hit-areas|stroke-opacity="0" stroke-width="10"/.test(sv)) why.push('当たり判定');
        if (!sv.includes(`<style>@page{size:${w}px ${h}px;margin:0}</style>`)) why.push('@page');
        if (/<metadata|sysmlv2-source|base64/.test(sv) || sv.includes("connect '出力ボード'")) why.push('原文');
        try { const root = parseXml(sv); if (root.name !== 'svg') why.push('根が svg でない'); } catch (e) { why.push(`XML: ${e.message}`); }
        const t = figureTitle(r.svg);
        if (!t || !t.label.startsWith('«view» ') || !sv.includes(`>${t.label.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</text>`)) why.push('左上の名前のタブ');
        if (why.length) bad.push(`${v} ${c.id}: ${why.join(',')}`);
      }
    }
    check(!bad.length && n > 0, `保存する図の SVG(例の 5 つのビューの全候補 ${n} 件): 原文・data-*・当たり判定が入らず、@page と左上の名前のタブが入り、正しい XML`, bad.slice(0, 5).join(' / '));
    // 図の題の位置: 枠のない箱の図(候補を画面で選んだとき)は、最初の文字
    const q = prepareView("part def A { part b; port p; }\n");
    const t = figureTitle(renderInterconnection(q).svg);
    check(t && t.label && t.y > 0 && t.size > 0, '図の題の位置: 枠のない図でも、左上の最初の文字の位置を返す', JSON.stringify(t));
    check(figureTitle(null) === null, '図の題の位置: SVG がなければ null');
    // ファイル名(設計書 9.3 節)
    check(pieceBase({ file: 'sample', view: 'interconnection', scope: '全体図' }) === 'sample_interconnection_全体図', 'ファイル名: 図は「元の名前_ビュー_範囲の名前」');
    check(pieceBase({ file: '', view: 'general', scope: 'a b' }) === 'sysmlv2_general_a_b', 'ファイル名: 元の名前がなければ sysmlv2、空白は _');
    check(tableBase({ file: 'sample', title: '部品の一覧' }) === 'sample_grid_部品の一覧', 'ファイル名: 表は「元の名前_grid_表の題」');
    // 「ビュー」の選択欄: 仕様書の表 34(SysML 2.0 の 9.2.20.1 節)の順。開いたときは相互接続(GR13 の追加の直し その 2)
    {
      const tpl = fs.readFileSync(path.join(ROOT, 'src/app/template.html'), 'utf8');
      const opts = [...tpl.slice(tpl.indexOf('<select id="viewKind">'), tpl.indexOf('</select>', tpl.indexOf('<select id="viewKind">'))).matchAll(/<option value="([^"]+)"( selected)?>([^<]*)<\/option>/g)].map((m) => `${m[1]}${m[2] ? '*' : ''}:${m[3]}`);
      check(opts.join(',') === 'general*:一般,interconnection:相互接続,action-flow:アクションフロー,state-transition:状態遷移,sequence:シーケンス,grid:グリッドビュー', '画面: 「ビュー」の選択欄は 一般・相互接続・アクションフロー・状態遷移・シーケンス・グリッドビュー の順で、最初は一般', opts.join(','));
    }
    check(safeName('a\\b/c:d*e?f"g<h>i|j k\tl') === 'a_b_c_d_e_f_g_h_i_j_k_l', 'ファイル名: 使えない文字と空白を _ にする');
    // 画面: ボタンの並び、薄い図ではボタンを置かない、押しても図の上の操作を始めない
    const main = fs.readFileSync(path.join(ROOT, 'src/app/main.js'), 'utf8');
    check(main.includes("isT ? ['copy', 'svg', 'png', 'pdf'] : ['svg', 'png', 'pdf']"), '画面: 表は「コピー」「SVG」「PNG」「PDF」、図は「SVG」「PNG」「PDF」の順');
    check(/viewEl\.classList\.add\('stale'\);\n\s*removePieceButtons\(\);/.test(main), '画面: 構文エラーで図を薄く表示している間は、ボタンを置かない');
    check(main.includes("for (const ev of ['pointerdown', 'mousedown', 'click', 'dblclick']) box.addEventListener(ev, (e) => e.stopPropagation());"), '画面: ボタンを押しても、図の上の操作を始めない');
    // 図のボタンは、図の上の外側(SVG の外の HTML の行)に、図の左端にそろえて置く。行と図の間は 4〜8 px(GR13 の追加の直し)
    const gap = +(/const FIG_GAP = (\d+);/.exec(main)?.[1] ?? NaN);
    check(/canvasEl\.insertBefore\(row, svg\);/.test(main) && !/svg\.append\(row|svg\.appendChild/.test(main) && gap >= 4 && gap <= 8 && /row\.style\.marginLeft = `\$\{Math\.max\(0, t\.x\)\}px`/.test(main) && /row\.style\.marginBottom = `\$\{FIG_GAP - Math\.max\(0, t\.y\)\}px`/.test(main), '画面: 図のボタンは SVG の外の行で、図の左端にそろえ、図の描いたものの上端との間を 4〜8 px にする', String(gap));
    check(/if \(a\.bodyTop != null\) top = Math\.min\(top, sv\.top - c\.top \+ a\.bodyTop - 2 - box\.getBoundingClientRect\(\)\.height\);/.test(main), '画面: 表のボタンの下端を、表の本体の上端より上(題の行の中)に収める');
    check(main.includes('画像が大きすぎて PNG にできませんでした。SVG で保存してください') && main.includes("'コピーしました'") && main.includes("'コピーできませんでした'") && /setTimeout\(\(\) => \{ btn\.textContent = btn\.dataset\.label; \}, 2000\)/.test(main), '画面: PNG が大きすぎるときの文、コピーの文(2 秒)');
    check(/@page\{size:\$\{w\}px \$\{h\}px;margin:0\}/.test(main) && main.includes("window.addEventListener('afterprint'") && main.includes('document.title = base;'), '画面: PDF は同じ大きさの紙(余白 0)で印刷し、ファイル名の候補を付け、終わったら紙の指定を片づける');
  }

  // 7. 見えている範囲だけの色付け(GR4 の完了報告の確認の後の指示 1)
  {
    const hlOpts = { keywords: grammar.keywords, symbols: grammar.symbols };
    const strip = (h) => h.replace(/<[^>]*>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
    const view = (top) => ({ scrollTop: top, height: 800, lineHeight: 19.5, padding: 10 });
    // 範囲の文字が、テキストの該当する行と一致する。注の途中から始まる範囲は注として色付けする
    const small = Array.from({ length: 300 }, (_, i) => (i === 100 ? '/* 長い注の始まり' : i > 100 && i < 160 ? `注の ${i} 行目` : i === 160 ? '注の終わり */' : `part p${i} { port q; }`)).join('\n');
    const r = makeWindowHighlighter(hlOpts);
    const h = r(small, view(161 * 19.5)); // 見えている行の 40 行前(範囲の先頭)が 120 行目で、注(100〜160 行目)の途中
    const lines = small.split('\n');
    const m = /^<span style="display:block;height:([\d.]+)px"><\/span>/.exec(h);
    const fromLine = Math.round(Number(m?.[1] ?? -1) / 19.5);
    const body = strip(h.replace(/^<span[^>]*><\/span>/, '')).replace(/\n$/, '');
    check(fromLine === 100, '色付けの範囲: 注の途中から始まるときは、注の始まりの行まで広げる', `${fromLine}`);
    check(body.startsWith(lines.slice(100, 105).join('\n')) && h.includes('<span class="cm">/* 長い注の始まり'), '色付けの範囲: 文字がテキストの行と一致し、注として色付けする');
    // big.sysml(tools/view/make_big.mjs で作る)で、1 回の色付けの時間を測る
    const bigPath = path.join(ROOT, 'out/view/big.sysml');
    if (fs.existsSync(bigPath)) {
      const big = fs.readFileSync(bigPath, 'utf8').replace(/\r\n?/g, '\n'); // テキスト欄の値は行末が LF
      const nLines = big.split('\n').length;
      const rows = [];
      for (const [name, top] of [['先頭', 0], ['中ほど', Math.floor(nLines / 2) * 19.5], ['末尾', nLines * 19.5]]) {
        const rr = makeWindowHighlighter(hlOpts);
        rr(small, view(0)); // 慣らし
        let t = performance.now(); rr(big, view(top)); const first = performance.now() - t;
        t = performance.now(); rr(big, view(top + 400)); const scroll = performance.now() - t;
        const mid = Math.floor(big.length / 2);
        const edited = big.slice(0, mid) + 'x' + big.slice(mid);
        t = performance.now(); rr(edited, view(top)); const typed = performance.now() - t;
        rows.push({ name, first, scroll, typed });
      }
      const worst = Math.max(...rows.flatMap((x) => [x.first, x.scroll, x.typed]));
      log(`  色付けの時間(big.sysml、${Buffer.byteLength(big)} バイト、${nLines} 行): ${rows.map((x) => `${x.name} 変わった直後 ${x.first.toFixed(1)} ms・スクロール ${x.scroll.toFixed(1)} ms・1 文字の後 ${x.typed.toFixed(1)} ms`).join(' / ')}。最大 ${worst.toFixed(1)} ms`);
      // GR20 の Z1: 時間は記録するだけで合否に使わない(設計書 10 章)。GR19 までは「1 回の色付けが 50 ms 以下」を合否にしていた
      check(true, `色付け: big.sysml の 1 回の色付けの最大の時間の記録(合否に使わない): ${worst.toFixed(1)} ms`);
      // 比べるための参考: テキスト全体を色付けする時間
      const full = makeHighlighter(hlOpts);
      const t0 = performance.now(); full(big); log(`  (参考)テキスト全体を色付けする時間: ${(performance.now() - t0).toFixed(0)} ms`);
    } else log('  (big.sysml がないので、色付けの時間は測っていない。node tools/view/make_big.mjs で作る)');
  }
  // 11. GR18 の画面の直し(GR18 指示書 2.2 節の E4・E5・E8・E9。src/app/runner.js と画面のスクリプト)
  {
    const runner = await import('../../src/app/runner.js');
    const main = fs.readFileSync(path.join(ROOT, 'src/app/main.js'), 'utf8');
    // E4: ビューか範囲を替えたら、接続を足す途中をやめる
    check(/scopeEl\.addEventListener\('change', \(\) => \{[^\n]*endConnect\(\); analyze\(\); \}\);/.test(main) && /viewKindEl\.addEventListener\('change', \(\) => \{[^\n]*endConnect\(\); analyze\(\); \}\);/.test(main), 'GR18 E4: ビュー・範囲の変更で、接続を足す途中をやめる(帯と印を消す)');
    // E5: テキストを書き換えた後の選び直しは、原文の範囲(書き換えた分だけずらしたもの)と種類で行う
    {
      const before = renderInterconnection(prepareView(SAMPLE));
      const i = SAMPLE.indexOf('\n', SAMPLE.indexOf('{')) + 1;
      const S2 = SAMPLE.slice(0, i) + '    part def Extra;\n' + SAMPLE.slice(i);
      const after = renderInterconnection(prepareView(S2));
      const bad = [];
      let n = 0;
      for (const node of before.structure.nodes.filter((x) => x.src && x.info?.name)) {
        n++;
        const src = runner.mapRange(SAMPLE, S2, node.src);
        const id = src && runner.findBySource(after.structure, src, node.info.kind);
        const hit = id && after.structure.nodes.find((x) => x.id === id);
        if (!hit || hit.info.name !== node.info.name || hit.info.kind !== node.info.kind) bad.push(`${node.info.name} → ${hit?.info?.name ?? 'なし'}`);
      }
      check(n > 0 && !bad.length && /mapRange\(w\.text, resultText, w\.src\)/.test(main) && /findBySource\(shown\.structure, src, w\.kind\)/.test(main), `GR18 E5: 例の相互接続ビューで、前に宣言を 1 行足しても、名前のある ${n} 個の箱がどれも同じ要素に選び直せる`, bad.slice(0, 3).join(' / '));
      check(JSON.stringify(runner.mapRange('abcdef', 'abXcdef', [3, 5])) === '[4,6]' && JSON.stringify(runner.mapRange('abcdef', 'abXcdef', [0, 2])) === '[0,2]' && runner.mapRange('abcdef', 'aXf', [1, 3]) === null, 'GR18 E5: 範囲の行き先(前はそのまま、後ろはずらす、重なれば null)');
    }
    // E8: 開いたファイルの改行の形を、保存のときに保つ
    {
      const crlf = 'part a;\r\npart b;\r\n';
      const eol = runner.eolOf(crlf);
      const edited = 'part a;\npart b;\npart c;\n'; // テキスト欄の中は LF
      check(eol === '\r\n' && runner.withEol(edited, eol) === 'part a;\r\npart b;\r\npart c;\r\n' && runner.eolOf('part a;\rpart b;') === '\r' && runner.eolOf('part a;') === '\n' && runner.withEol(edited, '\n') === edited, 'GR18 E8: CR LF のファイルを編集して保存すると CR LF のまま(CR・LF も同じ)');
      check(/original = \{ text, edited: false, eol: eolOf\(text\) \};/.test(main) && /withEol\(srcEl\.value, original\.eol\)/.test(main), 'GR18 E8: 画面は開いたときに改行の形を覚え、保存のときにその形で書く');
    }
    // E9: Worker のエラーで、待っている要求に失敗を返し、実行中の解析を内部エラーにして、次の要求から作り直した Worker を使う
    {
      const made = [], got = [];
      const fake = () => { const w = { posted: [], terminated: false, postMessage(m) { this.posted.push(m); }, terminate() { this.terminated = true; } }; made.push(w); return w; };
      const r = runner.makeRunner({ createWorker: fake, deliver: (m) => got.push(m), internalResult: (run, message) => ({ type: 'result', id: run.id, ok: false, diagnostics: buildDiagnostics({ text: run.text, internal: [message] }) }) });
      r.start();
      r.run({ type: 'run', id: 1, text: 'part a;', view: 'general', candidateId: null });
      r.request({ type: 'rename', id: 7, text: 'part a;' });
      r.request({ type: 'connect', id: 8, text: 'part a;' });
      made[0].onerror({ message: '検査用に止めた' });
      const res = got.find((m) => m.type === 'result');
      check(made.length === 2 && made[0].terminated && got.some((m) => m.type === 'rename' && m.id === 7 && !m.ok && /内部エラー/.test(m.reason)) && got.some((m) => m.type === 'add' && m.id === 8 && !m.ok)
        && res?.id === 1 && !res.ok && res.diagnostics.internal.length === 1 && r.running === null,
        'GR18 E9: Worker のエラーで、待っている要求に失敗を返し、診断を内部エラーにして、Worker を作り直す', JSON.stringify(got));
      r.run({ type: 'run', id: 2, text: 'part b;', view: 'general', candidateId: null });
      made[1].onmessage({ data: { type: 'result', id: 2, ok: true } });
      check(made[1].posted.some((m) => m.type === 'run' && m.id === 2) && got.at(-1)?.id === 2 && r.running === null, 'GR18 E9: 次の入力で、作り直した Worker で描き直す');
      // 作り直し(テキストが変わったときの打ち切り)でも、待っている要求に失敗を返す(GR18 の E9)
      got.length = 0;
      r.run({ type: 'run', id: 3, text: 'part b;', view: 'general', candidateId: null });
      r.request({ type: 'renameInfo', id: 9, text: 'part b;' });
      r.run({ type: 'run', id: 4, text: 'part c;', view: 'general', candidateId: null });
      check(made.length === 3 && made[1].terminated && made[2].posted.some((m) => m.id === 4) && got.some((m) => m.type === 'renameInfo' && m.id === 9 && !m.ok), 'GR18 E9: 解析中にテキストが変わると Worker を止めて作り直し、待っている要求に失敗を返す');
    }
  }
  // 12. GR18 の安全性と保存(GR18 指示書 2.3 節の S1〜S4)
  {
    const { escapeXml } = await import('../../src/view/common.js');
    const { renderTables, tsv } = await import('../../src/view/index.js');
    const { printIds } = await import('../../src/app/io.js');
    // S1: XML 1.0 で使えない文字は U+FFFD に置き換える(その文字だけ)。タブ・改行・サロゲートの対はそのまま
    const raw = 'a\u0000b\u0008c\u000Bd\u000Ce\u001Ff\uFFFEg\uFFFFh\uD800i\uDC00j\t\n\r\u{1F600}k';
    check(escapeXml(raw) === 'a\uFFFDb\uFFFDc\uFFFDd\uFFFDe\uFFFDf\uFFFDg\uFFFDh\uFFFDi\uFFFDj\t\n\r\u{1F600}k' && escapeXml('<&>"\'') === '&lt;&amp;&gt;&quot;&#39;', 'GR18 S1: escapeXml が XML 1.0 で使えない文字だけを U+FFFD にする', JSON.stringify(escapeXml(raw)));
    {
      const t = "part p { doc /* a\u0001b */ part q; part 'x\uFFFEy'; part 'b\\bc'; }";
      const p = prepareView(t);
      const sv = pieceSvg(renderInterconnection(p).svg);
      const badChar = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/.test(sv);
      let xmlOk = true; try { parseXml(sv); } catch { xmlOk = false; }
      check(p.ok && !badChar && xmlOk && sv.includes('x\uFFFDy') && sv.includes('b\uFFFDc'), 'GR18 S1: doc の U+0001、名前の U+FFFE・\\b を含む図の保存する SVG に、XML 1.0 で使えない文字が出ず、その文字だけが U+FFFD になる');
    }
    // S2: 表のコピー(タブ区切りの文字)で、=・+・-・@ で始まるセルの先頭に ' を付ける。SVG の表の文字は変えない
    {
      const p = prepareView("package Q { part '=1+2'; part '+z'; part '-x'; part '@y'; part 'a=b'; }");
      const r = renderTables(p, null);
      const t = r.tables.find((x) => x.name === '部品の一覧');
      const text = tsv(t);
      check(/^'=1\+2\t/m.test(text) && /^'\+z\t/m.test(text) && /^'-x\t/m.test(text) && /^'@y\t/m.test(text) && /^a=b\t/m.test(text) && t.svg.includes('>=1+2<') && !t.svg.includes("'=1+2"), "GR18 S2: 表のコピーで =1+2 が '=1+2 になり、SVG の表の文字は =1+2 のまま", JSON.stringify(text));
    }
    // S3: 印刷のための id の付け替えは、属性の中の url(#…)・id だけに当て、文字の内容に当てない
    {
      const svg = renderInterconnection(prepareView("part 'fill:url(#sv2-open)' { part q; }")).svg;
      const out = printIds(svg, 'p1-');
      const texts = (x) => [...x.matchAll(/>([^<]*)</g)].map((m) => m[1]).join('|');
      check(texts(out) === texts(svg) && out.includes('fill:url(#sv2-open)') && / id="p1-/.test(out) && !/ id="(?!p1-)/.test(out) && !/url\(#(?!p1-)[^)]*\)"/.test(out.replace(/>[^<]*</g, '><')), 'GR18 S3: 印刷の id の付け替えで、図の文字は原文のまま、属性の id と url(#…) だけを付け替える');
      check(/const uniqIds = printIds;/.test(fs.readFileSync(path.join(ROOT, 'src/app/main.js'), 'utf8')), 'GR18 S3: 画面の印刷が printIds を使う');
    }
    // S4: Content-Security-Policy の meta。外部への送信と外部からの読み込みを止め、インラインのスクリプト・スタイル、blob: の Worker、
    // blob:・data: の画像だけを許す。アプリのスクリプトは、CSP で止まる書き方(eval・new Function・fetch・外部の URL の読み込み)を使わない
    {
      const tpl = fs.readFileSync(path.join(ROOT, 'src/app/template.html'), 'utf8');
      const m = /<meta http-equiv="Content-Security-Policy" content="([^"]+)">/.exec(tpl);
      const pol = new Map((m?.[1] ?? '').split(';').map((x) => x.trim().split(/\s+/)).filter((x) => x[0]).map(([k, ...v]) => [k, v.join(' ')]));
      check(!!m && tpl.indexOf(m[0]) < tpl.indexOf('<style>') && pol.get('default-src') === "'none'" && pol.get('connect-src') === "'none'" && pol.get('script-src') === "'unsafe-inline' blob:" && pol.get('worker-src') === 'blob:' && pol.get('style-src') === "'unsafe-inline'" && pol.get('img-src') === 'blob: data:' && pol.get('object-src') === "'none'" && pol.get('base-uri') === "'none'" && pol.get('form-action') === "'none'",
        'GR18 S4: 雛形の先頭に CSP の meta があり、外部への送信と読み込みを止め、アプリに要るものだけを許す', m?.[1] ?? 'なし');
      const code = ['src/app/main.js', 'src/app/worker.js', 'src/app/runner.js', 'src/app/io.js', 'src/app/diag.js', 'src/app/highlight.js'].map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');
      check(!/\beval\s*\(|new Function\s*\(|\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|importScripts|sendBeacon/.test(code) && /new Worker\(workerUrl\)/.test(code) && /URL\.createObjectURL\(new Blob\(\[WORKER_SOURCE\]/.test(code), 'GR18 S4: 画面のスクリプトは eval・new Function・fetch などを使わず、Worker は blob: の URL から作る');
    }
  }
  // 13. GR18 の処理の打ち切りと表示(GR18 指示書 2.5 節の B2・B5・B6)
  {
    const runner = await import('../../src/app/runner.js');
    const main = fs.readFileSync(path.join(ROOT, 'src/app/main.js'), 'utf8');
    const tpl = fs.readFileSync(path.join(ROOT, 'src/app/template.html'), 'utf8');
    // B2: 内部エラーのときに、範囲の欄に「構文エラー」と出さない(Worker の検査用の口 testInternal で、解析と名前解決の例外を起こす)
    {
      const sent = [];
      globalThis.self = globalThis;
      globalThis.postMessage = (m) => sent.push(m);
      await import('../../src/app/worker.js');
      self.onmessage({ data: { type: 'run', id: 31, text: 'part a;', candidateId: null, view: 'general', enabled: ['general'], testInternal: true } });
      const r = sent.find((m) => m.type === 'result' && m.id === 31);
      const syn = { ok: false, diagnostics: buildDiagnostics({ text: 'part a {', errors: parse('part a {').errors }) };
      check(r && !r.ok && r.diagnostics.internal.length === 1 && r.diagnostics.syntax.length === 0 && runner.scopePlaceholder(r) === '(内部エラー)' && runner.scopePlaceholder(syn) === '(構文エラー)' && runner.scopePlaceholder({ ok: true }) === '(候補なし)',
        'GR18 B2: 内部エラーの結果は、範囲の欄が「(内部エラー)」(構文エラーなら「(構文エラー)」)', JSON.stringify(r?.diagnostics));
      check(/new Option\(scopePlaceholder\(r\), ''\)/.test(main) && !/'\(構文エラー\)'/.test(main), 'GR18 B2: 画面は範囲の欄の文を scopePlaceholder で決める');
    }
    // B6: 処理中は、前の結果の「候補がない」などを出さない(図を描けていない間は、範囲の欄を「(処理中)」にし、図の文と診断を消す)
    check(/if \(!shown\) clearNoResult\(\);/.test(main) && /function clearNoResult\(\) \{\n  canvasEl\.querySelectorAll\('\.empty'\)\.forEach\(\(x\) => x\.remove\(\)\);\n  scopeEl\.textContent = '';\n  scopeEl\.append\(new Option\('\(処理中\)', ''\)\);\n  msgEl\.textContent = '';/.test(main)
      && /<select id="scope"><option value="">\(処理中\)<\/option><\/select>/.test(tpl), 'GR18 B6: 解析を頼んだときと起動のときに、前の結果の「候補なし」・「描く範囲の候補がありません」・診断を出さない');
    // B5: 描画中にビューを替えたら、実行中の描画を打ち切る(偽の Worker と、worker_threads で動かす本物の Worker)
    {
      const made = [];
      const fake = () => { const w = { posted: [], terminated: false, postMessage(m) { this.posted.push(m); }, terminate() { this.terminated = true; } }; made.push(w); return w; };
      const got = [];
      const r = runner.makeRunner({ createWorker: fake, deliver: (m) => got.push(m), internalResult: () => ({}) });
      r.run({ type: 'run', id: 1, text: 'part b;', view: 'general', candidateId: null });
      r.request({ type: 'renameInfo', id: 9, text: 'part b;' });
      r.run({ type: 'run', id: 2, text: 'part b;', view: 'interconnection', candidateId: null });
      r.run({ type: 'run', id: 3, text: 'part b;', view: 'interconnection', candidateId: 'part:b' });
      check(runner.RUNNER18.B5 && made.length === 3 && made[0].terminated && made[1].terminated && made[2].posted.some((m) => m.id === 3) && got.some((m) => m.type === 'renameInfo' && m.id === 9 && !m.ok), 'GR18 B5: 描画中にビュー・範囲を替えると Worker を止めて作り直し、待っている要求に失敗を返す');
      const { Worker } = await import('node:worker_threads');
      const { chainText } = await import('../../tools/view/gr18_speed.mjs');
      const text = chainText(300);
      const all = ['general', 'interconnection', 'action-flow', 'state-transition', 'sequence', 'grid'];
      const threads = [];
      const real = () => { const w = new Worker(new URL('./worker_thread.mjs', import.meta.url)); threads.push(w); const a = { postMessage: (m) => w.postMessage(m), terminate: () => w.terminate(), onmessage: null, onerror: null }; w.on('message', (d) => a.onmessage?.({ data: d })); w.on('error', (e) => a.onerror?.(e)); return a; };
      const timeOf = (steps) => new Promise((resolve) => {
        let rr = null, t0 = 0;
        rr = runner.makeRunner({ createWorker: real, internalResult: () => ({}), deliver: (m) => { if (m.type === 'result' && m.id === steps.at(-1).id) { const t = performance.now() - t0; resolve({ t, m }); } } });
        rr.start();
        rr.run(steps[0]);
        if (steps.length === 1) { t0 = performance.now(); return; }
        setTimeout(() => { t0 = performance.now(); rr.run(steps[1]); }, steps[1].after);
      });
      const msg = (id, view, candidateId) => ({ type: 'run', id, text, view, candidateId, opening: false, enabled: all });
      const only = await timeOf([msg(1, 'general', null)]);
      const sw = await timeOf([msg(1, 'interconnection', 'part:sys'), { ...msg(2, 'general', null), after: 800 }]);
      log(`  B5: 部品 300 個の鎖の入力で、一般ビューだけを描く時間 ${Math.round(only.t)} ms、相互接続ビューの描画中(0.8 秒後)にビューを一般に替えてから一般ビューの図が出るまで ${Math.round(sw.t)} ms(Worker の作り直しを含む)`);
      // GR20 の Z1: 時間は記録するだけで合否に使わない(設計書 10 章)。GR19 までは「一般ビューだけを描く時間 + 1 秒以内」も合否にしていた(描画を止めて作り直すことは、上の偽の Worker の検査で確かめる)
      check(only.m.ok && sw.m.ok && sw.m.view === 'general', `GR18 B5: 描画中にビューを一般に替えると、一般ビューの図が出る(時間は記録: ${Math.round(sw.t)} ms、一般ビューだけを描く時間 ${Math.round(only.t)} ms)`);
      // 使った Worker を止める(検査のプロセスが終わるように)
      await Promise.all(threads.map((w) => w.terminate()));
    }
  }
  // 14. 画面のスクリプト(src/app/main.js)を、runner.js を通した Worker との実際の受け渡しの経路で動かす(GR18 指示書 2.6 節の W1〜W3。
  // 設計書 4 章の「画面の確かめ」)。DOM の作り物を大域に置くので、別のプロセス(tests/view/app_main.mjs)で動かし、1 行に 1 件の結果を読む
  {
    const { spawnSync } = await import('node:child_process');
    const p = spawnSync(process.execPath, [path.join(ROOT, 'tests/view/app_main.mjs')], { cwd: ROOT, encoding: 'utf8', timeout: 600000 });
    const rows = (p.stdout ?? '').split('\n').filter((x) => /^(ok|ng)\t/.test(x)).map((x) => x.split('\t'));
    check(p.status === 0 && rows.length === 6, 'GR18 W3: 画面のスクリプトを動かす検査(tests/view/app_main.mjs)が 6 件の結果を出して終わる', `終了コード ${p.status}、${rows.length} 件 ${(p.stderr ?? '').slice(0, 300)}`);
    for (const [r, what, detail] of rows) check(r === 'ok', what, detail ?? '');
  }
  // 15. GR19 の画面の検査(GR19 指示書 4 章): 警告の段・U1〜U3 は tests/view/app_main.mjs --gr19 で、U4 はテキスト欄の案内の文で確かめる
  {
    const { spawnSync } = await import('node:child_process');
    const p = spawnSync(process.execPath, [path.join(ROOT, 'tests/view/app_main.mjs'), '--gr19'], { cwd: ROOT, encoding: 'utf8', timeout: 600000 });
    const rows = (p.stdout ?? '').split('\n').filter((x) => /^(ok|ng)\t/.test(x)).map((x) => x.split('\t'));
    check(p.status === 0 && rows.length === 17, 'GR19: 画面のスクリプトを動かす検査(tests/view/app_main.mjs --gr19)が 17 件の結果を出して終わる', `終了コード ${p.status}、${rows.length} 件 ${(p.stderr ?? '').slice(0, 300)}`);
    for (const [r, what, detail] of rows) check(r === 'ok', what, detail ?? '');
    const tpl = fs.readFileSync(path.join(ROOT, 'src/app/template.html'), 'utf8');
    const ph = /<textarea id="src"[^>]*placeholder="([^"]*)"/.exec(tpl)?.[1] ?? '';
    // GR19 の P3: 「書き方」に警告の段と入門用の例、生成 AI 向けプロンプトに警告の決まりがある
    const help = fs.readFileSync(path.join(ROOT, 'src/app/help.html'), 'utf8');
    const pr = /<pre id="aiPrompt">([\s\S]*?)<\/pre>/.exec(help)?.[1] ?? '';
    check(/<li><b>警告<\/b>:[^<]*W1[\s\S]*?W2/.test(help) && /「例を読み込む」では、入門用の短い例/.test(help) && /このアプリが「警告」として示します/.test(pr) && /入門用の例が短い手本/.test(help),
      'GR19 P3: 「書き方」に警告(W1・W2)の段と入門用の例、生成 AI 向けプロンプトに警告の決まりが書いてある');
    check(ph.includes('右に選んだビューの図が出ます') && !/相互接続|一般ビュー|状態遷移|アクションフロー|シーケンス|グリッド/.test(ph), 'GR19 U4: テキスト欄の空のときの案内が、特定のビューに依らない文', ph);
  }
  // 17. GR20 の F(GR20 指示書 4 章の F。フォルダの段階 A): tests/view/app_main.mjs --gr20 で、フォルダの読み込み(3 通り)・「ファイル」の選択欄・
  //     ファイルごとのテキスト欄・診断と図のクリック・1 つのファイルに収まる編集・ほかのファイルに及ぶ編集の拒否・view の書き足し・保存・置き換えの
  //     確認・1 つのテキストの扱いに戻ること・修正依頼のコピーを画面のスクリプトで確かめる。あわせて、上の帯の「フォルダを開く」と webkitdirectory の欄、
  //     テキスト欄の上の「ファイル」の選択欄、「書き方」の例(import でほかのファイルのパッケージを取り込む)があること
  {
    const { spawnSync } = await import('node:child_process');
    const p = spawnSync(process.execPath, [path.join(ROOT, 'tests/view/app_main.mjs'), '--gr20'], { cwd: ROOT, encoding: 'utf8', timeout: 900000 });
    const rows = (p.stdout ?? '').split('\n').filter((x) => /^(ok|ng)\t/.test(x)).map((x) => x.split('\t'));
    check(p.status === 0 && rows.length === 24, 'GR20 F: 画面のスクリプトを動かす検査(tests/view/app_main.mjs --gr20)が 24 件の結果を出して終わる', `終了コード ${p.status}、${rows.length} 件 ${(p.stderr ?? '').slice(0, 300)}`);
    for (const [r, what, detail] of rows) check(r === 'ok', what, detail ?? '');
    const tpl = fs.readFileSync(path.join(ROOT, 'src/app/template.html'), 'utf8');
    const iOpen = tpl.indexOf('id="fileOpen"'), iFolder = tpl.indexOf('id="btnFolder"'), iSave = tpl.indexOf('id="btnSave"');
    check(iOpen > 0 && iOpen < iFolder && iFolder < iSave && /<input type="file" id="dirOpen" webkitdirectory/.test(tpl), 'GR20 F: 上の帯の「開く」の右に「フォルダを開く」があり、webkitdirectory の欄を持つ');
    // GR24 で置き換えた(予定の red の 1): 「ファイル」の選択欄をフォルダの木に置き換えた(GR20 の期待: テキスト欄の上の
    // <div id="fileBar" hidden><label>ファイル <select id="fileSel" …)
    // GR24 の P5 で置き換えた(予定の red の 3): 木の欄はいつも置く(P4 までの期待: /<div id="tree" hidden/)
    check(/<div id="tree" tabindex="0">/.test(tpl) && !/<div id="tree"[^>]*\shidden/.test(tpl) && !/<div id="treeSplit"[^>]*\shidden/.test(tpl) && tpl.indexOf('id="tree"') < tpl.indexOf('id="editor"') && /<div id="fileBar" hidden><span id="filePath"><\/span>/.test(tpl) && tpl.indexOf('id="fileBar"') < tpl.indexOf('id="editor"') && !tpl.includes('id="fileSel"'),
      'GR20 F(GR24 で置き換え、GR24 の P5 で木の欄をいつも置く形に置き換え): テキスト欄の左にフォルダの木、テキスト欄の上に今のファイルの相対パスがある(1 つのテキストのときは隠す)。「ファイル」の選択欄はない');
    const help = fs.readFileSync(path.join(ROOT, 'src/app/help.html'), 'utf8');
    check(help.includes('「フォルダを開く」') && help.includes("private import '部品'::*;"), 'GR20 F: 「書き方」に、フォルダを開けることと、ほかのファイルのパッケージを import で取り込む例がある');
  }
  // 18. GR21 の H・O・Z・X(GR21 指示書 4 章)
  {
    const { makeFolderHistory, diffText, HISTORY_LIMIT } = await import('../../src/app/history.js');
    const { makeZip, crc32, overwriteFolder } = await import('../../src/app/save.js');
    // 履歴の部品: 書き換えの差分(同じ文字が続くところはカーソルの位置で決める)
    check(JSON.stringify([diffText('aa', 'aaa', 2), diffText('aaa', 'aa', 1), diffText('abc', 'abc', 0)]) === JSON.stringify([{ start: 1, del: '', ins: 'a' }, { start: 1, del: 'a', ins: '' }, null]),
      'GR21 H: 書き換えの差分は、同じ文字が続くところでもカーソルの位置で決める');
    // 打つ・後ろ向きに消す・前向きに消すの種類が替わると切る。上限を超えたら古いものから捨てる
    {
      const h = makeFolderHistory(['a.sysml'], { limit: 3 });
      let t = '';
      const ty = (c) => { const b = t; t += c; h.typed(0, b, t, t.length, 'insertText'); };
      const bs = () => { const b = t; t = t.slice(0, -1); h.typed(0, b, t, t.length, 'deleteContentBackward'); };
      ty('a'); ty('b'); ty('c'); bs(); bs(); ty('x');
      const n1 = h.size(0).undo;
      for (let i = 0; i < 5; i++) { const b = t; t += '\n'; h.typed(0, b, t, t.length, 'insertParagraph'); }
      check(n1 === 3 && h.size(0).undo === 3, 'GR21 H: 打つ・Backspace の種類が替わるとまとまりを切り、履歴の数は上限(ここでは 3)を超えない', JSON.stringify([n1, h.size(0)]));
      check(HISTORY_LIMIT === 200, 'GR21 H: ファイルごとの履歴の上限は 200', String(HISTORY_LIMIT));
    }
    // つながった履歴: どのファイルでも一番上にあるときだけ戻す。上限で捨てられたら、もう一方のファイルの履歴からも消し、理由を出さない
    // (GR22 で置き換えた。予定の red の 1。設計書 9.4 節 v22.1・GR22 指示書 3.3 節。GR21 の期待: r3.reason が
    // 「ほかのファイル(b.sysml)の履歴の上限(2)を超えたので、この操作は戻せません」)
    {
      const h = makeFolderHistory(['a.sysml', 'b.sysml'], { limit: 2 });
      h.edited([{ k: 0, before: 'xA', start: 1, end: 2, text: 'B' }, { k: 1, before: 'yA', start: 1, end: 2, text: 'B' }]);
      let texts = ['xB', 'yB'];
      const r1 = h.undo(1, texts);
      texts = ['xA', 'yA'];
      const r2 = h.redo(0, texts);
      const ok12 = r1.ok && JSON.stringify(r1.changes.map((c) => c.text)) === JSON.stringify(['xA', 'yA']) && r2.ok && JSON.stringify(r2.changes.map((c) => c.text)) === JSON.stringify(['xB', 'yB']);
      texts = ['xB', 'yB'];
      for (const c of ['1', '2']) { const b = texts[1]; texts[1] += c; h.typed(1, b, texts[1], texts[1].length, 'insertParagraph'); }
      const r3 = h.undo(0, texts);
      check(ok12 && !r3.ok && r3.reason === null && h.size(0).undo === 0, 'GR21 H・X(GR22 で置き換え): つながった履歴は、どちらのファイルからでも両方を戻し・やり直す。ほかのファイルの履歴の上限で捨てられたら、こちらの履歴からも消し、理由を出さずに何もしない', JSON.stringify([r1, r2, r3, h.size(0)]));
    }
    // zip: CRC-32 と、UTF-8 の印・格納の形
    {
      const z = makeZip([{ path: 'sub/日本.sysml', data: new TextEncoder().encode('a\r\n') }], new Date(2026, 10, 3, 12, 0, 0));
      const v = new DataView(z.buffer);
      check(crc32(new TextEncoder().encode('123456789')) === 0xcbf43926 && v.getUint32(0, true) === 0x04034b50 && (v.getUint16(6, true) & 0x0800) && v.getUint16(8, true) === 0 && v.getUint32(z.length - 22, true) === 0x06054b50,
        'GR21 Z: zip の CRC-32(「123456789」で cbf43926)、局所ヘッダーの UTF-8 の印と格納(方式 0)、終わりの記録');
    }
    // 上書き保存の部品: 許可の求め方(queryPermission が granted なら requestPermission を呼ばない)
    {
      const calls = [];
      const fake = { name: 'd', queryPermission: async () => { calls.push('q'); return 'granted'; }, requestPermission: async () => { calls.push('r'); return 'granted'; }, getFileHandle: async () => { throw new Error('ない'); } };
      const r = await overwriteFolder(fake, [{ path: 'x.sysml', text: 't', expect: null }]);
      check(JSON.stringify(calls) === JSON.stringify(['q']) && !r.denied && r.results.length === 1 && !r.results[0].ok && /書けませんでした\(Error: ない\)/.test(r.results[0].reason), 'GR21 O: 許可済みなら許可を求め直さず、書けなかったファイルの理由を返す', JSON.stringify(r));
    }
    const { spawnSync } = await import('node:child_process');
    const p = spawnSync(process.execPath, [path.join(ROOT, 'tests/view/app_main.mjs'), '--gr21'], { cwd: ROOT, encoding: 'utf8', timeout: 900000 });
    const rows = (p.stdout ?? '').split('\n').filter((x) => /^(ok|ng)\t/.test(x)).map((x) => x.split('\t'));
    check(p.status === 0 && rows.length === GR21_ROWS, `GR21: 画面のスクリプトを動かす検査(tests/view/app_main.mjs --gr21)が ${GR21_ROWS} 件の結果を出して終わる`, `終了コード ${p.status}、${rows.length} 件 ${(p.stderr ?? '').slice(0, 300)}`);
    for (const [r, what, detail] of rows) check(r === 'ok', what, detail ?? '');
    const help = fs.readFileSync(path.join(ROOT, 'src/app/help.html'), 'utf8');
    check(/<td>パッケージに、標準ライブラリの根の名前空間と同じ名前\(<code>Parts<\/code>・<code>Items<\/code>・<code>Ports<\/code> など\)を付けない\(ほかのファイルから指すと、標準ライブラリのものと区別できず曖昧になる\)<\/td>/.test(help),
      'GR21 K: 「書き方」に、パッケージに標準ライブラリの根の名前空間と同じ名前(Parts・Items・Ports など)を付けない注意の 1 行がある');
  }
  // 19. GR22 の A1〜A4・B1〜B5(GR22 指示書 4 章)
  {
    const { makeFolderHistory } = await import('../../src/app/history.js');
    const lk = (h, a, b) => h.edited([{ k: a, before: 'xA', start: 1, end: 2, text: 'B' }, { k: b, before: 'yA', start: 1, end: 2, text: 'B' }]);
    // A3: またがる操作を取り消した後に、もう一方のファイルで書き換えると、やり直しの履歴から、その操作が両方のファイルで消える。理由は出さない
    {
      const h = makeFolderHistory(['a.sysml', 'b.sysml']);
      lk(h, 0, 1);
      const u = h.undo(0, ['xB', 'yB']);
      h.typed(1, 'yA', 'yAq', 3, 'insertText');
      const sz = [h.size(0), h.size(1)];
      const r = h.redo(0, ['xA', 'yAq']);
      const u2 = h.undo(1, ['xA', 'yAq']);
      check(u.ok && sz[0].redo === 0 && sz[1].redo === 0 && !r.ok && r.reason === null && u2.ok && u2.changes[0].text === 'yA' && h.lost() === 0,
        'GR22 A3: またがる操作を取り消した後に、もう一方のファイルで書き換えると、つながったほかのファイルのやり直しの履歴からも、その操作を消す(やり直しは理由を出さずに何もしない。そのファイルの取り消しは続けてできる)', JSON.stringify({ u: u.ok, sz, r, u2 }));
    }
    // A3: 上限を超えてつながった履歴を捨てたとき、ほかのファイルの取り消しの履歴からも、その操作と、それより古いものを消す(上限 2 で確かめる)
    {
      const h = makeFolderHistory(['a.sysml', 'b.sysml'], { limit: 2 });
      h.typed(0, 'xA', 'xAp', 3, 'insertParagraph');
      lk(h, 0, 1);
      const before = h.size(0).undo;
      let t = 'yB';
      for (const c of ['1', '2']) { const b = t; t += c; h.typed(1, b, t, t.length, 'insertParagraph'); }
      const r = h.undo(0, ['xBp', t]);
      check(before === 2 && h.size(0).undo === 0 && h.size(1).undo === 2 && !r.ok && r.reason === null && h.lost() === 0,
        'GR22 A3: 上限を超えてつながった履歴を捨てたとき、つながったほかのファイルの取り消しの履歴からも、その操作と、それより古いものを消す(取り消しは理由を出さずに何もしない)', JSON.stringify({ before, a: h.size(0), b: h.size(1), r }));
    }
    // A3: 消したものがほかの操作とつながっていれば、そのつながりも消す(a・b の操作と b・c の操作。c の上限で b・c の操作を捨てる)
    {
      const h = makeFolderHistory(['a.sysml', 'b.sysml', 'c.sysml'], { limit: 2 });
      lk(h, 0, 1);
      h.edited([{ k: 1, before: 'yB', start: 0, end: 1, text: 'z' }, { k: 2, before: 'zA', start: 1, end: 2, text: 'B' }]);
      let t = 'zB';
      for (const c of ['1', '2']) { const b = t; t += c; h.typed(2, b, t, t.length, 'insertParagraph'); }
      check(h.size(0).undo === 0 && h.size(1).undo === 0 && h.size(2).undo === 2 && h.lost() === 0, 'GR22 A3: 捨てた操作がほかの操作とつながっていれば、そのつながりの操作も、つながったファイルの履歴から消す', JSON.stringify([h.size(0), h.size(1), h.size(2)]));
    }
    // A3: 「後から書き換えたので」の文と動きは変えない
    {
      const h = makeFolderHistory(['a.sysml', 'b.sysml']);
      lk(h, 0, 1);
      h.typed(1, 'yB', 'yBq', 3, 'insertText');
      const r = h.undo(0, ['xB', 'yBq']);
      check(!r.ok && r.reason === 'ほかのファイル(b.sysml)で後から書き換えたので、この操作は戻せません。先にそのファイルで取り消してください' && h.size(0).undo === 1 && h.size(1).undo === 2, 'GR22 A3: またがる操作の後に、ほかのファイルで後から書き換えていれば、今までどおり「後から書き換えたので」の理由を出して戻さない', JSON.stringify(r));
    }
    // B4: " で始まるセルにも ' を付ける。ほかのセルと、SVG の表の文字は変えない
    {
      const { renderTables, tsv } = await import('../../src/view/index.js');
      const p = prepareView("package Q { part '\"q'; part 'a\"b'; part '=1'; part ok; }");
      const t = renderTables(p, null).tables.find((x) => x.name === '部品の一覧');
      const text = tsv(t);
      check(/^'"q\t/m.test(text) && /^a"b\t/m.test(text) && /^'=1\t/m.test(text) && /^ok\t/m.test(text) && t.svg.includes('>&quot;q<') && !t.svg.includes("'&quot;q"),
        "GR22 B4: 表のタブ区切りの文字で、\" で始まるセルの先頭に ' を付け、ほかのセルと SVG の表の文字は変えない", JSON.stringify(text));
    }
    // B5: 構文エラーのクリックで選ぶ字句の範囲(行の先頭・中ほど・行の終わり・空白の位置と、引用符・記号・行末の CR・ASCII でない空白)
    {
      const { tokenRange } = await import('../../src/app/diag.js');
      const t = "part def A {\n    port p : X;  \n    attr 'a b' = 1;\n    x :>> y;\r\n    q\u00a0r;\n}";
      const cases = [[1, 1, 'part'], [1, 6, 'def'], [1, 11, ''], [1, 13, ''], [1, 12, '{'], [2, 1, ''], [2, 12, ':'], [2, 14, 'X'], [2, 15, ';'], [2, 20, ''], [3, 10, "'a b'"], [4, 7, ':>>'], [4, 13, ''], [5, 6, '\u00a0'], [5, 7, 'r'], [9, 1, '']];
      const got = cases.map(([l, c, w]) => { const [a, b] = tokenRange(t, l, c); return t.slice(a, b) === w ? 'ok' : `${l}:${c}=${JSON.stringify(t.slice(a, b))}`; });
      check(got.every((x) => x === 'ok'), 'GR22 B5: 字句の範囲は、列の位置から空白・行の終わり・次の区切りの記号の手前まで(空白と行の終わりはカーソルだけ。引用符の名前は閉じる引用符まで、続く記号は 1 つに、ASCII でない空白は 1 字)', JSON.stringify(got));
    }
    // B1: 候補の表示(フォルダ)。同じ表示に相対パス、相対パスでも同じなら行を付け、並び・id・ほかの表示は変えない
    {
      const { prepareFiles, folderLabels } = await import('../../src/app/prepare.js');
      const { analysis, prepared } = prepareFiles([{ path: 'a.sysml', text: 'package P { part def A { part x; } }\npackage Q { }\npackage Q { }\n' }, { path: 'b/b.sysml', text: 'package P { part def A { part y; } }\n' }]);
      const g = folderLabels(prepared.generalCandidates, analysis.files).map((c) => `${c.id}|${c.label}`);
      const ic = folderLabels(prepared.candidates, analysis.files).map((c) => `${c.id}|${c.label}`);
      check(JSON.stringify(g) === JSON.stringify(['package:P|package P(a.sysml)', 'package:Q|package Q(a.sysml 2)', 'package:Q#2|package Q(a.sysml 3)', 'package:P#2|package P(b/b.sysml)']) && JSON.stringify(ic) === JSON.stringify(['part:P::A|part def P::A(a.sysml)', 'part:P::A#2|part def P::A(b/b.sysml)']) && prepared.generalCandidates[0].label === 'package P',
        'GR22 B1: フォルダの候補の表示(folderLabels)は、同じ表示に「(相対パス)」、相対パスでも同じなら「(相対パス 行)」を付け、並び・id は変えない(元の候補の表示も変えない)', JSON.stringify([g, ic]));
    }
    // B3: 診断が 0 件か(どの段もないか)
    {
      const { noDiagnostics } = await import('../../src/app/diag.js');
      const z = { syntax: [], semantic: [], warning: [], internal: [], unchecked: { count: 0, groups: [] }, ambiguous: { count: 0, groups: [] }, view: [] };
      const one = (k, v) => noDiagnostics({ ...z, [k]: v });
      // (P4 で置き換えた。予定の red の 2。P3 の期待: info の図の診断だけでも「診断がある」(!one('view', [{ level: 'info' }])))
      check(noDiagnostics(z) && !one('syntax', [{}]) && !one('semantic', [{}]) && !one('warning', [{}]) && !one('internal', ['x']) && !one('unchecked', { count: 1, groups: [] }) && !one('ambiguous', { count: 1, groups: [] }) && one('view', [{ level: 'info' }]) && !one('view', [{ level: 'warn' }]),
        'GR22 B3・B3b: 修正依頼の文に入る診断が 0 件(構文エラー・意味エラー・警告・内部エラー・未検査・曖昧・warn の図の診断のどの段もない。info の図の診断だけのときを含む)かを判定する');
    }
    const { spawnSync } = await import('node:child_process');
    const p = spawnSync(process.execPath, [path.join(ROOT, 'tests/view/app_main.mjs'), '--gr22'], { cwd: ROOT, encoding: 'utf8', timeout: 900000 });
    const rows = (p.stdout ?? '').split('\n').filter((x) => /^(ok|ng)\t/.test(x)).map((x) => x.split('\t'));
    check(p.status === 0 && rows.length === GR22_ROWS, `GR22: 画面のスクリプトを動かす検査(tests/view/app_main.mjs --gr22)が ${GR22_ROWS} 件の結果を出して終わる`, `終了コード ${p.status}、${rows.length} 件 ${(p.stderr ?? '').slice(0, 300)}`);
    for (const [r, what, detail] of rows) check(r === 'ok', what, detail ?? '');
  }
  // 20. GR22 の P4(GR22 指示書 v22.2 の 4 章の B3b・D1)
  {
    // B3b: 押せるかどうか(noDiagnostics)と依頼文の段(toPrompt)が同じ判定(promptSections)から決まる。段の有無の組み合わせ 512 通り
    // (構文エラー・意味エラー・警告・内部エラー・曖昧・未検査の有無 64 × 図の診断なし・info だけ・warn だけ・両方 4 × 1 ファイルとフォルダ 2)
    const { noDiagnostics, promptSections } = await import('../../src/app/diag.js');
    const g = (n) => ({ name: n, count: 1, lines: ['a.sysml 2'], locs: [{ file: 0, path: 'a.sysml', line: 2 }] });
    const VI = [{ level: 'info', code: 'no-candidate', message: '描く範囲の候補がない', line: null }], VW = [{ level: 'warn', code: 'not-reflected', message: 'render は反映していない', line: 3, file: 0, path: 'a.sysml' }];
    const bad = [];
    let n = 0;
    for (let m = 0; m < 64; m++) for (const view of [[], VI, VW, [...VI, ...VW]]) for (const folder of [false, true]) {
      const b = (i) => (m >> i) & 1;
      const P = folder ? { file: 0, path: 'a.sysml' } : {};
      const d = {
        syntax: b(0) ? [{ line: 1, col: 2, message: 'x', expected: null, ...P }] : [], semantic: b(1) ? [{ item: 'S1', line: 2, col: 3, start: 5, end: 6, message: 'x', section: 's', ...P }] : [],
        warning: b(2) ? [{ item: 'W2', line: 3, col: 4, start: 7, end: 8, message: 'x', section: 's', ...P }] : [], internal: b(3) ? ['x'] : [],
        ambiguous: b(4) ? { count: 1, groups: [g('N')] } : { count: 0, groups: [] }, unchecked: b(5) ? { count: 1, groups: [g('Z')] } : { count: 0, groups: [] }, view,
      };
      const text = toPrompt(d, 'part p;\n', folder ? [{ path: 'a.sysml', text: 'part p;\n' }] : null);
      const secs = text.split('\n').filter((l) => /^## /.test(l) && !/^## テキスト/.test(l)).length;
      n++;
      if (noDiagnostics(d) !== (secs === 0) || promptSections(d).keys.length !== secs) bad.push(`${m}/${view.length}/${folder}`);
    }
    check(n === 512 && bad.length === 0, 'GR22 B3b: 「修正依頼をコピー」を押せないのは、修正依頼の文に診断の段が 1 つもないときだけ(段の有無の 512 通りで、押せるかどうかと依頼文の段が同じ判定)', bad.slice(0, 10).join(' '));
    // 画面のスクリプトの検査(1 つ目は全部。2 つ目・3 つ目は、ページを開いた直後に行う最初の操作だけを替えたもの)
    const { spawnSync } = await import('node:child_process');
    for (const [first, only, want] of [['new', false, GR22P4_ROWS], ['sample', true, 2], ['open', true, 2]]) {
      const p = spawnSync(process.execPath, [path.join(ROOT, 'tests/view/app_main.mjs'), '--gr22p4', '--first', first, ...(only ? ['--only-first'] : [])], { cwd: ROOT, encoding: 'utf8', timeout: 900000 });
      const rows = (p.stdout ?? '').split('\n').filter((x) => /^(ok|ng)\t/.test(x)).map((x) => x.split('\t'));
      check(p.status === 0 && rows.length === want, `GR22 P4: 画面のスクリプトを動かす検査(tests/view/app_main.mjs --gr22p4 --first ${first}${only ? ' --only-first' : ''})が ${want} 件の結果を出して終わる`, `終了コード ${p.status}、${rows.length} 件 ${(p.stderr ?? '').slice(0, 300)}`);
      for (const [r, what, detail] of rows) if (!(only && what.startsWith('GR18 W1'))) check(r === 'ok', what, detail ?? '');
    }
  }
  // 16. GR19 の P5(GR19 指示書 v19.1 の 4 章の Q3・R1・R2)
  {
    const { spawnSync } = await import('node:child_process');
    const p = spawnSync(process.execPath, [path.join(ROOT, 'tests/view/app_main.mjs'), '--gr19p5'], { cwd: ROOT, encoding: 'utf8', timeout: 600000 });
    const rows = (p.stdout ?? '').split('\n').filter((x) => /^(ok|ng)\t/.test(x)).map((x) => x.split('\t'));
    check(p.status === 0 && rows.length === 9, 'GR19 P5: 画面のスクリプトを動かす検査(tests/view/app_main.mjs --gr19p5)が 9 件の結果を出して終わる', `終了コード ${p.status}、${rows.length} 件 ${(p.stderr ?? '').slice(0, 300)}`);
    for (const [r, what, detail] of rows) check(r === 'ok', what, detail ?? '');
    // 警告の文(warn.js)・見出し(main.js・diag.js)・「書き方」とプロンプト(help.html)の中身に、「動作の定義」「使えません」「規則には反しない」が
    // 残っていない(これらのファイルが、ビルドで HTML に入る)
    const files = ['src/model/warn.js', 'src/app/diag.js', 'src/app/main.js', 'src/app/help.html'];
    const left = files.flatMap((f) => { const t = fs.readFileSync(path.join(ROOT, f), 'utf8'); return ['動作の定義', '使えません', '規則には反しない'].filter((w) => t.includes(w)).map((w) => `${f}: ${w}`); });
    check(left.length === 0, 'GR19 P5 Q3・R1: 警告の文・見出し・「書き方」・プロンプトに「動作の定義」「使えません」「規則には反しない」が残っていない', left.join(' / '));
    const help = fs.readFileSync(path.join(ROOT, 'src/app/help.html'), 'utf8');
    const pr = /<pre id="aiPrompt">([\s\S]*?)<\/pre>/.exec(help)?.[1] ?? '';
    const li = /<li><b>警告<\/b>:([^\n]*)<\/li>/.exec(help)?.[1] ?? '';
    check(/書き間違いのおそれがあるため、意図を確かめてほしい箇所/.test(li) && /W2 は[^。]*型に書いた名前が使用の名前と同じもの/.test(li) && /書き間違いのおそれがあり、意図を確かめる箇所/.test(pr) && /型に書いた名前が使用の名前と同じもの/.test(pr),
      'GR19 P5 R1: 「書き方」の診断の見方とプロンプトの警告の説明が、書き間違いのおそれがあり意図を確かめる箇所の言い回しで、W2 は型に書いた名前が使用の名前と同じもの', li);
  }
  // 21. GR24 の T・F・M・Z・モデル(GR24 指示書 4 章)
  {
    const T = await import('../../src/app/tree.js');
    const t = T.buildTree(['b.sysml', 'a.sysml', 'B.txt', 'sub/z.sysml', 'Zeta/q.md', 'sub/deep/y.sysml'], ['empty', 'sub/e']);
    const flat = []; const walk = (n, d) => { for (const x of n.dirs) { flat.push(`${'-'.repeat(d)}${x.name}/`); walk(x, d + 1); } for (const f of n.files) flat.push(`${'-'.repeat(d)}${f.name}`); };
    walk(t, 0);
    check(flat.join(',') === 'Zeta/,-q.md,empty/,sub/,-deep/,--y.sysml,-e/,-z.sysml,B.txt,a.sysml,b.sysml', 'GR24 T: 木の並びは、各階層でフォルダが先、次にファイル、どちらも名前の符号位置の順(空のフォルダを含む)', flat.join(','));
  }
  {
    const { spawnSync } = await import('node:child_process');
    const p = spawnSync(process.execPath, [path.join(ROOT, 'tests/view/app_main.mjs'), '--gr24'], { cwd: ROOT, encoding: 'utf8', timeout: 900000 });
    const rows = (p.stdout ?? '').split('\n').filter((x) => /^(ok|ng)\t/.test(x)).map((x) => x.split('\t'));
    check(p.status === 0 && rows.length === GR24_ROWS, `GR24: 画面のスクリプトを動かす検査(tests/view/app_main.mjs --gr24)が ${GR24_ROWS} 件の結果を出して終わる`, `終了コード ${p.status}、${rows.length} 件 ${(p.stderr ?? '').slice(0, 300)}`);
    for (const [r, what, detail] of rows) check(r === 'ok', what, detail ?? '');
  }
  // 22. GR24 の P5 の D・E・I・N・P(GR24 指示書 v24.2 の 4 章)
  {
    const tpl = fs.readFileSync(path.join(ROOT, 'src/app/template.html'), 'utf8');
    const css = fs.readFileSync(path.join(ROOT, 'src/app/style.css'), 'utf8');
    const ids = ['btnNewFile', 'btnNewDir', 'btnReload', 'btnCollapse', 'btnFold'];
    const bad = ids.filter((id) => {
      const m = new RegExp(`<button id="${id}"([^>]*)>([\\s\\S]*?)</button>`).exec(tpl);
      if (!m) return true;
      const inner = m[2], attrs = m[1];
      return !/\stitle="[^"]+"/.test(attrs) || !/\saria-label="[^"]+"/.test(attrs) || !inner.startsWith('<svg') || inner.replace(/<[^>]*>/g, '').trim() !== '' || /\s(href|xlink:href|src)=/.test(inner);
    });
    check(bad.length === 0, 'GR24 P5 I: 木の欄の上の 5 つのボタン(新しいファイル・新しいフォルダ・再読み込み・すべて折りたたむ・畳む)は、文字でなく HTML の中に書いた SVG のアイコンで、title と aria-label を持ち、外部を読まない', bad.join(','));
    check(/#treeHead button\.ticon svg\{[^}]*stroke:currentColor/.test(css) && /#treeBtns\{[^}]*flex-wrap:nowrap/.test(css) && /#treeName\{[^}]*text-overflow:ellipsis[^}]*white-space:nowrap/.test(css) && /#treeHead\{[^}]*flex-direction:column/.test(css),
      'GR24 P5 I: アイコンの線は文字の色(currentColor)で描き、ボタンの行は折り返さず、フォルダの名前は 1 行で長ければ省略する(名前とボタンを 2 段に分ける)');
    check(tpl.includes(`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' blob:; worker-src blob:; style-src 'unsafe-inline'; img-src blob: data:; connect-src 'none'; font-src 'none'; media-src 'none'; object-src 'none'; frame-src 'none'; manifest-src 'none'; base-uri 'none'; form-action 'none'">`),
      'GR24 P5 I: CSP は GR24 の P4 までと同じ');
    const { spawnSync } = await import('node:child_process');
    const runP5 = (args, n, what) => {
      const p = spawnSync(process.execPath, [path.join(ROOT, 'tests/view/app_main.mjs'), ...args], { cwd: ROOT, encoding: 'utf8', timeout: 900000 });
      const lines = (p.stdout ?? '').split('\n');
      const rows = lines.filter((x) => /^(ok|ng)\t/.test(x)).map((x) => x.split('\t'));
      check(p.status === 0 && rows.length === n, `GR24 P5: 画面のスクリプトを動かす検査(tests/view/app_main.mjs ${what})が ${n} 件の結果を出して終わる`, `終了コード ${p.status}、${rows.length} 件 ${(p.stderr ?? '').slice(0, 300)}`);
      for (const [r, w, detail] of rows) check(r === 'ok', `${w}(${what})`, detail ?? '');
      return lines.find((x) => x.startsWith('LS\t'))?.slice(3) ?? null;
    };
    const ls = runP5(['--gr24p5'], GR24P5_ROWS, '--gr24p5');
    check(ls === '{"sysmlv2.treeFolded":"1"}', 'GR24 P5 P: 畳んだ後の localStorage の中身', ls);
    runP5(['--gr24p5start', '--ls', ls ?? '{}'], GR24P5START_ROWS, '--gr24p5start --ls <前の流しの中身>');
    runP5(['--gr24p5start'], GR24P5START_ROWS, '--gr24p5start');
    runP5(['--gr24p5start', '--lsthrow'], GR24P5START_ROWS, '--gr24p5start --lsthrow');
  }
  // 23. GR25 の A1〜A6(GR25 指示書 4 章。データを失う経路)
  {
    const { spawnSync } = await import('node:child_process');
    const p = spawnSync(process.execPath, [path.join(ROOT, 'tests/view/app_main.mjs'), '--gr25a'], { cwd: ROOT, encoding: 'utf8', timeout: 900000 });
    const rows = (p.stdout ?? '').split('\n').filter((x) => /^(ok|ng)\t/.test(x)).map((x) => x.split('\t'));
    check(p.status === 0 && rows.length === GR25A_ROWS, `GR25 A: 画面のスクリプトを動かす検査(tests/view/app_main.mjs --gr25a)が ${GR25A_ROWS} 件の結果を出して終わる`, `終了コード ${p.status}、${rows.length} 件 ${(p.stderr ?? '').slice(0, 300)}`);
    for (const [r, what, detail] of rows) check(r === 'ok', what, detail ?? '');
  }
  // 24. GR25 の B・C1〜C12(GR25 指示書 4 章)。C5 は README の「フォルダで扱う」の節の中身で確かめる
  {
    const readme = fs.readFileSync(path.join(ROOT, 'publish/README.md'), 'utf8');
    const sec = readme.slice(readme.indexOf('## フォルダで扱う'), readme.indexOf('\n## ', readme.indexOf('## フォルダで扱う') + 1));
    check(/新しいファイル・新しいフォルダ・再読み込み・すべて折りたたむ・木の欄を畳むのボタン/.test(sec) && /再読み込みができるのは、フォルダの扱いを得られたとき\(Chrome・Edge で、フォルダを選ぶ画面かドロップで開いたとき\)だけです/.test(sec),
      'GR25 C5: README の「フォルダで扱う」の節に、木の欄の上のボタンに「木の欄を畳む」があることと、再読み込みはフォルダの扱いがあるとき(Chrome・Edge でフォルダを選ぶ画面かドロップで開いたとき)だけであることを書く', sec.slice(0, 200));
    check(/末尾が `\.` か空白でないこと、Windows の予約名/.test(sec), 'GR25 C12: README の名前の規則に、末尾の . ・空白と Windows の予約名を書く');
    const pub = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/build/publish.json'), 'utf8'));
    check(pub.copy.includes('src/app/layout.js'), 'GR25 B: 配置の幅の部品 src/app/layout.js を公開の一覧に入れる');
    const { spawnSync } = await import('node:child_process');
    const p = spawnSync(process.execPath, [path.join(ROOT, 'tests/view/app_main.mjs'), '--gr25bc'], { cwd: ROOT, encoding: 'utf8', timeout: 900000 });
    const rows = (p.stdout ?? '').split('\n').filter((x) => /^(ok|ng)\t/.test(x)).map((x) => x.split('\t'));
    check(p.status === 0 && rows.length === GR25BC_ROWS, `GR25 B・C: 画面のスクリプトを動かす検査(tests/view/app_main.mjs --gr25bc)が ${GR25BC_ROWS} 件の結果を出して終わる`, `終了コード ${p.status}、${rows.length} 件 ${(p.stderr ?? '').slice(0, 300)}`);
    for (const [r, what, detail] of rows) check(r === 'ok', what, detail ?? '');
  }
  // 25. GR25 の P4 の K・B・F(GR25 指示書 v25.2 の 4 章)
  {
    const { buildHtml, bundle, declaredNames, checkBundleImports, checkHtmlImports } = await import('../../tools/build/build.mjs');
    const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/build/config.json'), 'utf8'));
    // K: まとめた HTML の中で、読み込む名前がすべて書き出しにある(出力ごと)。layout.js の書き出しに 8 つの定数と 4 つの関数がある
    for (const out of cfg.outputs) {
      const html = buildHtml(out);
      const r = checkHtmlImports(html);
      check(r.missing.length === 0 && r.modules > 40 && r.names > 200, `GR25 K: ${out.file} の中で、読み込む名前がすべて書き出しにある`, JSON.stringify(r).slice(0, 300));
      const ret = /\/\/ ---- src\/app\/layout\.js\nconst __m\d+ = \(\(\) => \{\n[\s\S]*?\nreturn \{ (.*) \};\n\}\)\(\);/.exec(html)?.[1] ?? '';
      // GR27 P5 の U(予定の red の 1): T を戻したので、P3 の終わり(cb68ebe)の 8 つの定数と 4 つの関数の 12 個に戻した(P4 では 19 個)
      const want = ['TREE_SPLIT', 'SPLIT', 'BORDER', 'FOLDED', 'TEXT_MIN', 'VIEW_MIN', 'TREE_MIN', 'TREE_INIT', 'initialText', 'widths', 'dragTree', 'dragMiddle'];
      check(JSON.stringify(ret.split(', ').sort()) === JSON.stringify([...want].sort()), `GR25 K: ${out.file} の中の layout.js の書き出しに、8 つの定数と 4 つの関数がすべてある`, ret);
    }
    // K: まとめた各ファイルの書き出しの一覧が、Node.js で読み込んだ本物の書き出し(export のすべての形)と同じ。入口の 2 つ(DOM・self を
    // 使うので Node.js で読み込めない)は、export を持たないことをソースで確かめる
    {
      const { pathToFileURL } = await import('node:url');
      const diff = [], seen = new Set();
      for (const entry of ['src/app/worker.js', 'src/app/main.js']) {
        const code = bundle(entry);
        for (const h of code.matchAll(/^\/\/ ---- (.+)\nconst (__m\d+) = \(\(\) => \{\n/gm)) {
          if (seen.has(h[1])) continue;
          seen.add(h[1]);
          const ret = /\nreturn \{ (.*) \};\n\}\)\(\);/.exec(code.slice(h.index))[1];
          const mine = ret.split(',').map((x) => x.trim()).filter(Boolean).map((x) => x.split(':')[0].trim()).sort();
          if (h[1] === entry) { if (mine.length || /^export\b/m.test(fs.readFileSync(path.join(ROOT, entry), 'utf8'))) diff.push(`${entry}: 入口が書き出しを持つ`); continue; }
          const real = Object.keys(await import(pathToFileURL(path.join(ROOT, h[1])).href)).sort();
          if (JSON.stringify(mine) !== JSON.stringify(real)) diff.push(`${h[1]}: まとめたもの ${mine.join(',')} / 本物 ${real.join(',')}`);
        }
      }
      check(diff.length === 0 && seen.size > 40, `GR25 K: まとめた ${seen.size} ファイルの書き出しの一覧が、Node.js で読み込んだ本物の書き出しと同じ(入口の 2 つは書き出しを持たない)`, diff.join(' / ').slice(0, 400));
    }
    // K: 宣言に並べた名前の拾い方(括弧・文字列・テンプレート・正規表現・注釈の中の , を数えない。複数の行にまたがる宣言、行末で続く宣言)
    {
      const cases = [
        ['A = 1, B = 2;', ['A', 'B']],
        ['A = 1;\nconst C = 3, D = 4;', ['A']],
        ['f = (a, b) => [a, b], g = { x: 1, y: 2 }, h = "a,b", i = \'c,d\', j = `e,${[1, 2]}`;', ['f', 'g', 'h', 'i', 'j']],
        ['re = /[,"]/g, k = 1 / 2, l = (x) => x.replace(/,/g, \'\'), m = 3;', ['re', 'k', 'l', 'm']],
        ['n = 1, // 注, o\n  o = 2, /* p, q */ p = 3;', ['n', 'o', 'p']],
        ['q = new Set([\'a\', \'b\',\n  \'c\']), r = 1;', ['q', 'r']],
        ['s = 1,\n  t = 2\nexport const u = 3, v = 4;', ['s', 't']],
        ['w = a\n  ? 1\n  : 2, x = 3\nfoo(1, 2);', ['w', 'x']],
        ['y = `${`a,${\'b,c\'}`}`, z = 1;', ['y', 'z']],
        ['e1 = "a\\",b", e2 = \'c\\\',d\', e3 = 1;', ['e1', 'e2', 'e3']],
        ['isP = (m, e) => u(e) && (m.c(e.k, \'P\') || m.c(e.k, \'Q\'))\nexport function f(a, b) {}', ['isP']],
      ];
      const bad = cases.filter(([src, want]) => { try { return JSON.stringify(declaredNames(src, 0)) !== JSON.stringify(want); } catch (e) { return true; } }).map(([src]) => src);
      let throws = 0;
      for (const src of ['{ a, b } = o;', '[a, b] = o;']) { try { declaredNames(src, 0); } catch { throws++; } }
      check(bad.length === 0 && throws === 2, 'GR25 K: export const・let の宣言に並べた名前を、括弧・文字列・テンプレート・正規表現・注釈の中の , を数えずに拾う(複数の行にまたがる宣言、行末で続く宣言を含む)。分割代入の形はエラーにする', `${bad.join(' / ')} ${throws}`);
    }
    // K: 確かめの道具が、書き出しにない名前を見つける(直す前のビルドの道具の layout.js と同じ形)
    {
      const code = [
        '// ---- src/a.js\nconst __m0 = (() => {\nconst A = 1, B = 2;\nreturn { A };\n})();\n',
        '// ---- src/b.js\nconst __m1 = (() => {\nconst { A, B } = __m0;\nconst d = __m0.default;\nreturn { C: __m0.C };\n})();\n',
      ].join('\n');
      const r = checkBundleImports(code);
      check(JSON.stringify(r.missing) === JSON.stringify([{ file: 'src/b.js', from: 'src/a.js', name: 'B' }, { file: 'src/b.js', from: 'src/a.js', name: 'default' }, { file: 'src/b.js', from: 'src/a.js', name: 'C' }]) && r.names === 4,
        'GR25 K: まとめたスクリプトの確かめが、書き出しにない読み込み(const { … } = __mN;・__mN.default・書き出し直しの __mN.x)を、ファイルと名前で挙げる', JSON.stringify(r));
    }
    // B・F: 画面のスクリプトを動かす検査
    const { spawnSync } = await import('node:child_process');
    for (const [flag, n, what] of [['--gr25k', GR25K_ROWS, 'K・B'], ['--gr25f', GR25F_ROWS, 'F']]) {
      const p = spawnSync(process.execPath, [path.join(ROOT, 'tests/view/app_main.mjs'), flag], { cwd: ROOT, encoding: 'utf8', timeout: 900000 });
      const rows = (p.stdout ?? '').split('\n').filter((x) => /^(ok|ng)\t/.test(x)).map((x) => x.split('\t'));
      check(p.status === 0 && rows.length === n, `GR25 ${what}: 画面のスクリプトを動かす検査(tests/view/app_main.mjs ${flag})が ${n} 件の結果を出して終わる`, `終了コード ${p.status}、${rows.length} 件 ${(p.stderr ?? '').slice(0, 300)}`);
      for (const [r, w, detail] of rows) check(r === 'ok', `${w}(${flag})`, detail ?? '');
    }
  }
  // 26. GR26 の L・T・R・N・H(GR26 指示書 4 章。設計書 9.5 節)
  {
    const { visibleRows, ROLE_ORDER } = await import('../../src/app/modeltree.js');
    const { sectionHeight, SEC_MIN, SEC_SPLIT } = await import('../../src/app/modeltree.js');
    // T: 画面に出す行は、開いた項目の子だけ(閉じた項目の子孫は出さない)
    {
      const o = { roots: [0, 3], items: [{ id: 0, kids: [1], key: 'a' }, { id: 1, kids: [2], key: 'b' }, { id: 2, kids: [], key: 'c' }, { id: 3, kids: [4], key: 'd' }, { id: 4, kids: [], key: 'e' }] };
      const v = (open) => visibleRows(o, (it) => open.includes(it.key)).map((r) => `${r.id}@${r.depth}`).join(',');
      check(v([]) === '0@0,3@0' && v(['a']) === '0@0,1@1,3@0' && v(['a', 'b', 'd']) === '0@0,1@1,2@2,3@0,4@1' && v(['b']) === '0@0,3@0', 'GR26 T: visibleRows は、開いた項目の子だけを、深さ優先の記述の順に並べる(閉じた項目の下は、開いた印があっても出さない)', `${v(['a', 'b', 'd'])} / ${v(['b'])}`);
    }
    // T・N: 項目の移動先(名前の字句)が、名前の変更が使う宣言の名前の字句(src/edit/index.js の declarationRange)と同じ(例と試しのフォルダの、
    // 名前を宣言したすべての項目)。buildOutline は同じ結果を、字句の二分探索と要素ごとの参照の表で求める
    {
      const { buildOutline } = await import('../../src/app/outline.js');
      const { declarationRange, tokensOf } = await import('../../src/edit/index.js');
      const { prepareFromAnalysis } = await import('../../src/app/prepare.js');
      const { analyzeFiles } = await import('../../src/model/files.js');
      const { FILES } = await import('../../tools/model/gr26_folder.mjs');
      const { comparePaths } = await import('../../src/app/io.js');
      let n = 0;
      const bad = [];
      for (const files of [[{ path: 'sample.sysml', text: SAMPLE }], Object.entries(FILES).filter(([p]) => p.endsWith('.sysml')).map(([path, text]) => ({ path, text })).sort((a, b) => comparePaths(a.path, b.path))]) {
        const a = analyzeFiles(files);
        const o = buildOutline(prepareFromAnalysis(a), a.single ? null : a, { elements: true });
        const toks = tokensOf(a.text);
        for (const it of o.items) {
          const e = it.element;
          const which = e.name !== undefined ? 'name' : e.shortName !== undefined ? 'shortName' : null;
          if (!which) continue;
          n++;
          const r = declarationRange(a.text, toks, e, which, a.model);
          const base = a.single ? 0 : a.files[it.at.f].base;
          if (!r || r.start !== it.at.start + base || r.end !== it.at.end + base) bad.push(`${it.q}: ${JSON.stringify(r)} / ${it.at.start + base}`);
        }
      }
      check(n > 100 && bad.length === 0, `GR26 T・N: 名前を宣言した項目 ${n} 個の移動先(名前の字句)が、declarationRange(名前の変更が使う宣言の名前の字句)と同じ`, bad.slice(0, 3).join(' / '));
    }
    // L: 区画の高さ(各区画に SEC_MIN を残す)
    check(SEC_MIN === 60 && SEC_SPLIT === 4 && sectionHeight(600, 200) === 200 && sectionHeight(600, 10) === 60 && sectionHeight(600, 1000) === 536, 'GR26 L: sectionHeight は、区画の境目を引いた位置の高さを、各区画に 60px を残して返す', `${sectionHeight(600, 10)} ${sectionHeight(600, 1000)}`);
    check(ROLE_ORDER.at(-1) === 'その他の参照' && new Set(ROLE_ORDER).size === ROLE_ORDER.length, 'GR26 R: 参照の役割の並び(ROLE_ORDER)が重ならず、最後が「その他の参照」', ROLE_ORDER.join(','));
    // L: 木の欄を畳んだときに、両方の区画をまとめて隠す CSS
    const css = fs.readFileSync(path.join(ROOT, 'src/app/style.css'), 'utf8');
    check(css.includes('#tree.folded .tsec,#tree.folded .secsplit{display:none}') && css.includes('#tree .tsec.sfold .tsecbody{display:none}'), 'GR26 L: style.css で、木の欄を畳むと両方の区画を隠し、畳んだ区画は見出しの行だけにする', '');
    const { spawnSync } = await import('node:child_process');
    const runMain = (flags, n, what) => {
      const p = spawnSync(process.execPath, [path.join(ROOT, 'tests/view/app_main.mjs'), ...flags], { cwd: ROOT, encoding: 'utf8', timeout: 900000 });
      const rows = (p.stdout ?? '').split('\n').filter((x) => /^(ok|ng)\t/.test(x)).map((x) => x.split('\t'));
      check(p.status === 0 && rows.length === n, `GR26 ${what}: 画面のスクリプトを動かす検査(tests/view/app_main.mjs ${flags.join(' ')})が ${n} 件の結果を出して終わる`, `終了コード ${p.status}、${rows.length} 件 ${(p.stderr ?? '').slice(0, 300)}`);
      for (const [r, w, detail] of rows) check(r === 'ok', `${w}(${flags[0]})`, detail ?? '');
    };
    runMain(['--gr26lt'], GR26LT_ROWS, 'L・T');
    for (const ls of [[], ['--ls', '{"sysmlv2.filesFolded":"1","sysmlv2.modelFolded":"0"}'], ['--ls', '{"sysmlv2.filesFolded":"0","sysmlv2.modelFolded":"1"}'], ['--lsthrow']]) runMain(['--gr26ls', ...ls], GR26LS_ROWS, 'L');
    runMain(['--gr26r'], GR26R_ROWS, 'R');
    runMain(['--gr26n'], GR26N_ROWS, 'N・H');
    // GR26 の P5(GR26 指示書 v26.2 の 4 章)。画面の部分(K・M・S・J・A・P・W・H・T)は、src/app/main.js と、ビルドした HTML のスクリプト(GR25 の形)の両方で
    runMain(['--gr26p5'], GR26P5_ROWS, 'P5');
    runMain(['--gr26p5', '--built'], GR26P5_ROWS, 'P5(ビルドした HTML)');
    // GR26 の P6(GR26 指示書 v26.3 の 4 章)。画面の部分(B・Y・Q)は、src/app/main.js とビルドした HTML のスクリプトの両方で、ResizeObserver の
    // あるブラウザ(--ro)とないブラウザの形で
    runMain(['--gr26p6'], GR26P6_ROWS, 'P6');
    runMain(['--gr26p6', '--ro'], GR26P6_ROWS, 'P6(ResizeObserver あり)');
    runMain(['--gr26p6', '--built'], GR26P6_ROWS, 'P6(ビルドした HTML)');
    runMain(['--gr26p6', '--built', '--ro'], GR26P6_ROWS, 'P6(ビルドした HTML、ResizeObserver あり)');
    // GR27 の P2(GR27 指示書 4 章の O・L)。モデルツリーと範囲の候補の受け渡しと、大きいファイルの知らせを、src/app/main.js とビルドした HTML のスクリプトで
    runMain(['--gr27'], GR27_ROWS, 'O・L(GR27)');
    runMain(['--gr27', '--built'], GR27_ROWS, 'O・L(GR27。ビルドした HTML)');
    // GR27 P5 の S・M(範囲の欄の候補の文字と、モデルツリーの行を見えている分だけ並べること)。src/app/main.js とビルドした HTML のスクリプトで
    runMain(['--gr27p5'], GR27P5_ROWS, 'S・M(GR27 P5)');
    runMain(['--gr27p5', '--built'], GR27P5_ROWS, 'S・M(GR27 P5。ビルドした HTML)');
    {
      const { buildOutline } = await import('../../src/app/outline.js');
      const { prepareFromAnalysis } = await import('../../src/app/prepare.js');
      const { analyzeFiles } = await import('../../src/model/files.js');
      const { FILES: GF } = await import('../../tools/model/gr26_folder.mjs');
      const outlineOf = (files) => { const a = analyzeFiles(files); return buildOutline(prepareFromAnalysis(a), files.length > 1 ? a : null); };
      // Q: 名前のない要素の修飾名の区切り。試しのフォルダと 2 つの例と、要約のない要素を含む最小の入力で、どの項目の修飾名も、名前のない祖先と
      // 自分の区切りが「(要約)」(要約がなければ「(名前なし)」)で、かっこが重ならない。参照箇所の所属は、持ち主の項目の修飾名と同じ書き方。
      // 同一性の鍵は P5 と同じ作り(持ち主の区切りは名前か「(名前なし)」、自分は名前か「#種類」、同じものの中の記述の順)
      const Q_TEXT = `package Q {
  part def P {
    action { action b; }
    constraint { true }
    part x; part y;
    connect x to y;
  }
}
`;
      const inputs = [
        ['試しのフォルダ', Object.entries(GF).filter(([p]) => p.endsWith('.sysml')).sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0)).map(([path, text]) => ({ path, text }))],
        ['機能紹介用の例', [{ path: 'a.sysml', text: SAMPLE }]], ['入門用の例', [{ path: 'a.sysml', text: fs.readFileSync(path.join(ROOT, 'src/app/sample_intro.sysml'), 'utf8') }]], ['最小の入力', [{ path: 'a.sysml', text: Q_TEXT }]],
      ];
      const bad = [], badKey = [], nUnnamed = {};
      let plain = null;
      for (const [label, files] of inputs) {
        const o = outlineOf(files);
        nUnnamed[label] = o.items.filter((x) => !x.named).length;
        const seg = (it) => (it.named ? it.name : it.name === '(名前なし)' ? it.name : `(${it.name})`);
        const count = new Map();
        for (const it of o.items) {
          const chain = [];
          for (let x = it; x; x = x.parent >= 0 ? o.items[x.parent] : null) chain.unshift(x);
          const q = chain.map(seg).join('::');
          if (it.q !== q || it.q.includes('((')) bad.push(`${label}: ${it.q} / ${q}`);
          const kq = `${it.file ?? ''}\u0000${[...chain.slice(0, -1).map((x) => (x.named ? x.name : '(名前なし)')), it.named ? it.name : `#${it.kind}`].join('::')}`;
          const n = count.get(kq) ?? 0;
          count.set(kq, n + 1);
          if (it.key !== `${kq}\u0000${n}`) badKey.push(`${label}: ${it.q}`);
        }
        const qs = new Set(o.items.map((x) => x.q));
        for (const [id, list] of Object.entries(o.refs)) for (const r of list) if (!qs.has(r.owner) && r.owner !== '(根の名前空間)') bad.push(`${label}: 参照箇所の所属 ${r.owner}(${o.items[id].q})`);
        if (label === '最小の入力') plain = o.items.filter((x) => !x.named).map((x) => x.q);
      }
      check(bad.length === 0 && badKey.length === 0 && Object.values(nUnnamed).every((n) => n > 0) && JSON.stringify(plain) === JSON.stringify(['Q::P::(名前なし)', 'Q::P::(名前なし)', 'Q::P::(接続 x – y)']),
        'GR26 P6 Q: 試しのフォルダと 2 つの例と最小の入力で、名前のない要素の修飾名の区切りが「(要約)」、要約のない要素(名前のない action { … }・constraint { … })だけが「(名前なし)」で、かっこが重ならず、参照箇所の所属も同じ書き方。同一性の鍵は P5 と同じ作り(持ち主は名前か「(名前なし)」、自分は名前か #種類)',
        `${bad.slice(0, 3).join(' / ')} 鍵 ${badKey.slice(0, 3).join(' / ')} ${JSON.stringify({ nUnnamed, plain })}`);
      // Y: style.css の指定(型か多重度を出す項目では名前を縮め、型と多重度に最小の幅を残す。型も多重度もない項目は名前を縮めない)
      const css = fs.readFileSync(path.join(ROOT, 'src/app/style.css'), 'utf8');
      check(css.includes('.mrow .nm{flex:0 0 auto}') && css.includes('.mrow.typed .nm{flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}')
        && css.includes('.mrow .mty,.mrow .mmu{flex:0 10 auto;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}') && css.includes('.mrow .mty{min-width:3em}') && css.includes('.mrow .mmu{min-width:2em}') && /\.mkd\{[^}]*flex:0 1000 auto;min-width:0;overflow:hidden;text-overflow:ellipsis/.test(css),
        'GR26 P6 Y: style.css で、型と多重度に最小の幅(型 3em・多重度 2em)を残し、型か多重度を出す項目(.mrow.typed)の名前は縮んで省略の記号で切れ、型も多重度もない項目の名前は縮まない(種類は今のとおり最初に切る)', '');
      // D: 「書き方」と README の「モデルツリーと参照箇所」に、指示書 3.4 節の項目がある。生成 AI 向けプロンプトは、上の GR26 H の sha256 で確かめる
      const help = fs.readFileSync(path.join(ROOT, 'src/app/help.html'), 'utf8');
      const hs = help.slice(help.indexOf('<h2>モデルツリーと参照箇所</h2>'), help.indexOf('<h2>開く・保存</h2>'));
      const readme = fs.readFileSync(path.join(ROOT, 'publish/README.md'), 'utf8');
      const rs = readme.slice(readme.indexOf('## モデルツリーと参照箇所'), readme.indexOf('\n## ', readme.indexOf('## モデルツリーと参照箇所') + 1));
      const items = {
        '2 つの分割バー': [/分割バーは 2 つ/, /モデルツリーと参照箇所の欄の境目/],
        '区画の高さ': [/割合/, /フォルダを開いた・閉じた/],
        '印の形': [/四角に「定」/, /丸に「使」/],
        '型と多重度の切り方': [/種類/, /型と多重度/, /3 文字ほど/, /名前.*切/],
        '修飾名の書き方': [/要約をかっこで囲んで/, /「\(名前なし\)」/],
        '選ぶ字句': [/perform drive;/, /宣言の始まりの字句/],
        '縦と横の送り': [/縦と横に送/, /診断のクリック/],
        '名前を変えた要素': [/名前を変えた要素は別の要素として扱います/],
        '並べない要素': [/行動の引数/, /名前のない特徴の連鎖/],
      };
      const miss = [];
      for (const [k, res] of Object.entries(items)) for (const [w, t] of [['README', rs], ['書き方', hs]]) if (!res.every((re) => re.test(t))) miss.push(`${w}: ${k}`);
      check(miss.length === 0 && rs.includes('- 区画の高さ: ') && rs.includes('分割バーで変えた高さは、ブラウザの中に覚えません'),
        'GR26 P6 D: README と「書き方」の「モデルツリーと参照箇所」に、区画の高さと 2 つの分割バー、定義と使用の印の形、型と多重度の切り方、名前のない要素の修飾名の書き方、選ぶ字句、縦と横の送り(診断のクリックも同じ)、名前を変えた要素は別の要素として扱うこと、並べない要素がある', miss.join(', '));
    }
    {
      const { buildOutline } = await import('../../src/app/outline.js');
      const { prepareFromAnalysis } = await import('../../src/app/prepare.js');
      const { analyzeFiles } = await import('../../src/model/files.js');
      const { sectionSizes, textX, SEC_MIN: SM, TREE_MIN, REF_MIN, ROLE } = await import('../../src/app/modeltree.js');
      const outline = (text) => { const a = analyzeFiles([{ path: 'a.sysml', text }]); return { a, o: buildOutline(prepareFromAnalysis(a), null, { elements: true }) }; };
      // R: 参照の役割(最小の入力)。項目の修飾名 → 参照箇所の「役割 書いた名前」の並び
      const R_TEXT = `package P {
  item def Sig;
  port def PD;
  part def Q { port pp : PD; attribute v; }
  state def SD;
  use case def UC;
  part def A {
    part p : Q;
    state st : SD;
    use case uc : UC;
    action drive;
    perform drive;
    exhibit st;
    include uc;
    action snd { send Sig() via p.pp to p; }
    action acc { accept Sig via p.pp; }
    action asg { assign p.v := 1; }
    connect p.pp to p.pp;
  }
  part x : P::A;
}
`;
      const { o } = outline(R_TEXT);
      const refsOf = (q) => { const it = o.items.find((x) => x.q === q); return (o.refs[it?.id] ?? []).map((r) => `${r.role} ${r.text}`).sort(); };
      const want = {
        'P::A::st': ['exhibit st'], 'P::A::uc': ['include uc'], 'P::A::drive': ['perform drive'],
        'P::Sig': ['送信の送るもの Sig', '受け取りの型 Sig'].sort(),
        'P::Q::pp': ['送信の経由(via) pp', '受け取りの経由(via) pp', '接続の端 pp', '接続の端 pp'].sort(),
        'P::A::p': ['送信の経由(via) p', '送信の宛先(to) p', '受け取りの経由(via) p', 'assign の対象 p', '接続の端 p', '接続の端 p'].sort(),
        'P::Q::v': ['assign の対象 v'], 'P': ['修飾名の区切り P'], 'P::A': ['型付け A'],
      };
      const bad = Object.entries(want).filter(([q, w]) => JSON.stringify(refsOf(q)) !== JSON.stringify(w)).map(([q]) => `${q}: ${refsOf(q).join(',')}`);
      check(bad.length === 0 && o.other === 0, 'GR26 P5 R: 参照の役割が、exhibit・include を perform より先に調べ、send の送るもの・経由・宛先と accept の受け取る型・経由を別の役割にし、連鎖(p.pp・p.v)のどの区切りも同じ役割、修飾名の途中の区切り(P::A の P)を「修飾名の区切り」にする(その他の参照 0)', `${bad.join(' / ')} other=${o.other}`);
      check(ROLE.qualifier === '修飾名の区切り' && ROLE.sendPayload && ROLE.sendVia && ROLE.sendTo && ROLE.acceptVia && !ROLE.send && new Set(Object.values(ROLE)).size === Object.keys(ROLE).length && ROLE_ORDER.length === Object.keys(ROLE).length && Object.values(ROLE).every((x) => ROLE_ORDER.includes(x)),
        'GR26 P5 R: 役割の日本語名の表(ROLE)と並び(ROLE_ORDER)が同じ役割を重ならずに持つ(送信の送るもの・経由・宛先、受け取りの経由、修飾名の区切りを足し、前の「送信の宛先・経由」はない)', ROLE_ORDER.join(','));
      // T: 名前のない要素の要約、並べない引数、修飾名の区切り
      const T_TEXT = `package T {
  item def Sig;
  port def PD { out item e; }
  part def B { port p : PD; }
  part def C { port q : ~PD; }
  part def S {
    part b : B; part c : C;
    attribute v;
    flow b.p.e to c.q.e;
    action snd { send Sig() via b to c; }
    action snd2 { send Sig() via b; }
    action acc { accept s : Sig; }
    action acc2 { accept Sig via b.p; }
    action asg { assign v := 1; }
    action ctl { decide; fork; }
    attribute :>> nope;
  }
  use case def UC { objective; }
}
`;
      const t = outline(T_TEXT).o;
      const names = t.items.map((x) => x.name);
      const has = (n) => names.includes(n);
      const params = t.items.filter((x) => /::(snd|snd2|acc|acc2|asg)::/.test(x.q) && x.q.split('::').length > 4);
      check(has('フロー b.p.e → c.q.e') && has('送信 Sig() → c') && has('送信 Sig()') && has('受信 s') && has('受信 Sig') && has('代入 v') && has('要求の使用') && has('decide') && has('fork') && has(':>> nope'),
        'GR26 P5 T: 流れの要約が端の連鎖を全部出し(フロー b.p.e → c.q.e)、送信は「送信 送るもの → 宛先」(宛先がなければ「送信 送るもの」)、受信は「受信 名前か型」、代入は「代入 対象」、objective は種類の日本語名、decide・fork はキーワード、名前のない :>> x は「:>> x」', names.filter((x) => !/^[A-Za-z]/.test(x) || x.startsWith(':')).join(' / '));
      // GR26 の P6 で置き換えた(予定の red の 1。Q): 前は、名前のない要素の修飾名の区切りが「(名前なし)」であることを確かめていた
      check(params.length === 1 && params[0].name === 's' && t.items.every((x) => !x.q.includes('((') && !/\(\(/.test(x.name)) && t.items.filter((x) => !x.named).every((x) => x.q.endsWith(x.name === '(名前なし)' ? x.name : `(${x.name})`)),
        'GR26 P5 T: send・accept・assign の名前を宣言していない引数は木に並べず(名前を宣言した accept s : Sig の s は並べる)、名前のない要素の修飾名の区切りは要約をかっこで囲む(かっこを重ねない)', params.map((x) => x.q).join(' / '));
      // H: 区画と欄の高さ(src/app/modeltree.js の sectionSizes)
      const z = (o2) => sectionSizes({ total: 600, head: 22, filesFolded: false, modelFolded: false, folder: true, filesNat: 0, rFiles: null, rRefs: null, ...o2 });
      const zs = [z({}), z({ folder: false, filesNat: 120 }), z({ rFiles: 0.9 }), z({ rFiles: 0.01 }), z({ rRefs: 0.9 }), z({ rRefs: 0 }), z({ total: 100 }), z({ filesFolded: true }), z({ modelFolded: true }), z({ total: 0 })];
      const okZ = zs[0].files === 238 && zs[0].model === 358 && zs[0].refs === 143 && zs[1].files === 120 && zs[1].model === 476 && zs[2].files === 596 - (22 + TREE_MIN + 4 + REF_MIN) && zs[3].files === SM
        && zs[4].refs === zs[4].model - 22 - 4 - TREE_MIN && zs[5].refs === REF_MIN && zs[6].files + 4 + zs[6].model <= 100 && zs[6].refs <= zs[6].model && zs[7].files === 22 && zs[7].model === 578 && zs[8].model === 22 && zs[8].files === 578 && zs[9].files + zs[9].model === 0;
      check(okZ && SM === 60 && TREE_MIN === 40 && REF_MIN === 56, 'GR26 P5 H: sectionSizes は、フォルダのとき 40%・60%、フォルダでないとき「ファイル」を中身の高さ、参照箇所の欄を「モデル」の 40% とし、割合で変えた高さに最小の高さ(区画 60・モデルツリー 40・参照箇所 56)を残し、足りないときも合計を木の欄の高さに収め、畳んだ区画は見出しの行だけにする', JSON.stringify(zs));
      // S: 行の始まりからの幅(タブは tab-size の位置まで進める)
      const m7 = (x) => [...x].length * 7;
      check(textX('abc', m7, 28) === 21 && textX('\tab', m7, 28) === 42 && textX('ab\tc', m7, 28) === 35 && textX('abcd\t', m7, 28) === 56 && textX('\t\t', m7, 28) === 56 && textX('', m7, 28) === 0 && textX('日本', m7, 28) === 14,
        'GR26 P5 S: textX は、行の始まりからの文字の幅を測り、タブを次のタブの位置(tab-size × 空白の幅の倍数)まで進める', `${textX('ab\tc', m7, 28)} ${textX('abcd\t', m7, 28)}`);
      // T・H: CSS の指定(項目の幅が足りないときに種類、型と多重度の順に切る。参照箇所の行は 2 段で、所属の幅が 0 にならず、先頭を省略の記号にする)
      const css26 = fs.readFileSync(path.join(ROOT, 'src/app/style.css'), 'utf8');
      // GR26 の P6 で置き換えた(予定の red の 2。Y): 前は、型と多重度が「flex:0 1 auto;min-width:0」(縮む割合 1、最小の幅 0)であることを確かめていた
      check(css26.includes('.mrow .nm{flex:0 0 auto}') && css26.includes('.mrow .mty,.mrow .mmu{flex:0 10 auto;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}') && /\.mkd\{[^}]*flex:0 1000 auto;min-width:0;overflow:hidden;text-overflow:ellipsis/.test(css26),
        'GR26 P5 T: style.css で、型も多重度もない項目の名前は縮めず(flex 0 0 auto)、型と多重度は縮む割合 10、種類は 1000 で、どれも省略の記号(text-overflow: ellipsis)で切る(幅が足りないときは、まず種類を、次に型と多重度を切る)', '');
      check(/\.rrow\{display:flex;flex-direction:column/.test(css26) && /\.rown\{[^}]*min-width:0;flex:1 1 0;direction:rtl;text-align:left/.test(css26) && css26.includes('.rown bdi{direction:ltr;unicode-bidi:isolate}') && !/\.rpane\{[^}]*max-height/.test(css26) && !css26.includes('#tree .tsec:not(.sfold){min-height:60px}'),
        'GR26 P5 H: style.css で、参照箇所の行は縦の 2 段、所属は残りの幅を使い(flex 1 1 0、幅 0 にならない)、direction: rtl で先頭を省略の記号にし、中身は左から右の向き。参照箇所の欄と区画の高さは CSS の割合・最小の高さで決めない(画面のスクリプトが決める)', '');
    }
    // H: 「書き方」と README の説明。生成 AI 向けプロンプトは変えない(GR25 の終わりの sha256)。移動の失敗の文
    {
      const help = fs.readFileSync(path.join(ROOT, 'src/app/help.html'), 'utf8');
      const sec = help.slice(help.indexOf('<h2>モデルツリーと参照箇所</h2>'), help.indexOf('<h2>開く・保存</h2>'));
      check(sec.length > 100 && ['「ファイル」', '「モデル」', '参照箇所', '標準ライブラリ', '未検査・曖昧', '解析が終わるまで'].every((w) => sec.includes(w)), 'GR26 H: 「書き方」に「モデルツリーと参照箇所」の短い説明(2 つの区画、並べるもの、移動、型、参照箇所、古い解析)がある', sec.slice(0, 200));
      const prompt = /<pre id="aiPrompt">([\s\S]*?)<\/pre>/.exec(help)?.[1] ?? '';
      const { createHash } = await import('node:crypto');
      check(createHash('sha256').update(prompt).digest('hex') === '87f0eaaea6f5c6959275b8297531f353f51f7aee0c2ebaf41f331c83096485dd', 'GR26 H: 「書き方」の生成 AI 向けプロンプト(<pre id="aiPrompt">)が GR25 の終わりと同じ(sha256)', `${prompt.length} 字`);
      const readme = fs.readFileSync(path.join(ROOT, 'publish/README.md'), 'utf8');
      const rs = readme.slice(readme.indexOf('## モデルツリーと参照箇所'), readme.indexOf('\n## ', readme.indexOf('## モデルツリーと参照箇所') + 1));
      check(readme.indexOf('## フォルダで扱う') < readme.indexOf('## モデルツリーと参照箇所') && readme.indexOf('## モデルツリーと参照箇所') < readme.indexOf('## 保存と読み込み') && ['置き場所', '並べるもの', '項目の表示', '型の表示と移動', '参照箇所', '移動', '開閉と選択', '古い解析'].every((w) => rs.includes(`- ${w}: `)),
        'GR26 H: README に「モデルツリーと参照箇所」の節(「フォルダで扱う」の次)があり、置き場所・並べるもの・項目の表示・型・参照箇所・移動・開閉と選択・古い解析を書く', rs.slice(0, 200));
      const main = fs.readFileSync(path.join(ROOT, 'src/app/main.js'), 'utf8');
      check(!/移しられ|\$\{label\}られ/.test(main) && main.includes("${what === 'rename' ? '名前を変えられ' : '移せ'}ませんでした(${errText(e)})"), 'GR26 H: ファイルの名前の変更・移動の失敗の文が「…に移せませんでした」「…に名前を変えられませんでした」で、「移しられ」がない', '');
    }
  }
  return { passes, failures };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  process.chdir(ROOT);
  const r = await runAppTests();
  console.log(`画面の処理の検査: 合格 ${r.passes} 件、失敗 ${r.failures} 件`);
  process.exit(r.failures ? 1 : 0);
}
