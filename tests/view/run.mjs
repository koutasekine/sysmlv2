// 相互接続ビューと画面の検査(GR4 指示書 8 章)。
//
// 使い方:
//   node tests/view/run.mjs
//
// 検査すること:
//   1. 309 ファイル(受理した 305 件)で、描く範囲の候補をすべて描き、例外なく終わる
//   2. 決定性: 同じテキストを 2 回描いて(2 回目は解析からやり直す)、SVG の文字列と構造が一致する
//   3. 記号ごとの最小の入力(tests/view/symbols/)が描けて、期待する記号・文字・診断が現れる。
//      記号の一覧の「GR4 で描く」が、入力で確かめるものか、裁定などにより使わないもののどちらかにある
//   4. 安全性: 検査用の入力一覧(tests/view/safety/inputs.json)で、SVG に生の文字が出ない。
//      (GR13 で .svg を開くのをやめたので、細工した .svg の読み込みの検査は除いた)
//   5. (GR13 で置き換えた。前は .svg に埋め込んだ原文の往復)「開く」は .sysml だけを受け付ける(tests/view/app.mjs の検査 1)
//   6. ビルドした HTML が、外部の読み込みの検査に通る(tools/build/build.mjs の checkExternal)。2 回のビルドが同じバイト列
//   ほかに、裁定で加わった基準:
//   7. 線と文字の質: 記号ごとの入力と「例を読み込む」の例で、(a) 横切り・(b) 重なり・(c) 文字の重なり・(d) コの字が 0 件。
//      309 ファイルの件数が、既知の件数(reports/GR4/P2_render_*.md の 12.4 節)を超えない(P2 の 4 回目の裁定 1・3)
//   8. 画面の処理(tests/view/app.mjs の残りの検査: 診断の組み立て・色付け・Worker の受け渡し・例)
//   GR6 で加わった基準:
//   7 に (e) 矢じりの重なりを足す。相互接続ビューの既知の件数は (a) 4・(b) 5・(c) 16・(d) 12・(e) 8(GR6 P2 の 2 回目の確認の後の裁定 3)
//   S1〜S5. 状態遷移ビュー(GR6 指示書 7 章)
//     S1. 309 ファイルの状態遷移ビューの候補をすべて描き、例外なく終わる
//     S2. 2 回の描画で SVG と構造が一致する
//     S3. 記号ごとの最小の入力(tests/view/symbols-state/)が描けて、期待する記号が現れ、図の質 (a)〜(e) が 0 件。
//         記号の一覧の「GR6 で描く」が、入力か unused か GR4 の入力のどれかにある
//     S4. 309 ファイルの図の質が、状態遷移ビューの既知の件数を超えない(GR6 P2 の 2 回目の確認の後の裁定 2。GR7 P3 で (a) 0・(b) 0・(c) 0・(d) 4・(e) 0 に置き換えた)
//     S5. 例の状態遷移ビューで、図の質 (a)〜(e) が 0 件
//   S6. ビューごとの HTML(out/build/sysmlv2-interconnection.html。views は相互接続だけ)で、状態遷移を選べず、
//       StateTransitionView の view を含むテキストを開いても例外にならない(相互接続ビューで表示し、図の診断に出す。GR6 の裁定 Q23)
//   GR7 で加わった基準(GR7 指示書 8 章):
//   A1. 309 ファイルのアクションフロービューの候補をすべて描き、例外なく終わる
//   A2. 2 回の描画で SVG と構造が一致する
//   A3. 記号ごとの最小の入力(tests/view/symbols-action/)が描けて、期待する記号が現れ、図の質 (a)〜(e) が 0 件。
//       記号の一覧の「GR7 で描く」が、入力か unused か GR4・GR6 の入力のどれかにある
//   A4. 309 ファイルの図の質が、アクションフロービューの既知の件数を超えない
//   A5. 例の 3 つのビュー(各ビューの全候補)で、図の質 (a)〜(e) が 0 件
//   A6. 書き足しへの強さ(GR7 指示書 5.1 節): 例と 309 ファイルの 3 つのビューの全候補で、末尾に 1 行・先頭に 1 行・
//       先頭に 50 行足しても、すでにある線どうしの順番が変わらない(GR7 P2 の裁定 3 で、先頭に 50 行の入力を加えた)
//   GR9 で加わった基準(GR9 指示書 8 章):
//   Q1. 309 ファイルのシーケンスビューの候補をすべて描き、例外なく終わる
//   Q2. 2 回の描画で SVG と構造が一致する
//   Q3. 記号ごとの最小の入力(tests/view/symbols-sequence/)が描けて、期待する記号が現れ、図の質 (a)〜(e) が 0 件。
//       記号の一覧の「GR9 で描く」が、入力か unused か GR4・GR6・GR7 の入力のどれかにある。order.sysml の縦の順
//   Q4. 309 ファイルの図の質が、シーケンスビューの既知の件数を超えない
//   Q5. 例の 4 つのビュー(各ビューの全候補)で、図の質 (a)〜(e) が 0 件(A5 にシーケンスビューを足した)
//   Q6. 書き足しへの強さ(末尾に 1 行・先頭に 1 行・先頭に 50 行)が、シーケンスビューでも保たれる(A6 にシーケンスビューを足した)
//   Q7. 当たり判定: 4 つのビューの記号ごとの入力で、すべての線の要素(と、シーケンスビューの生存線)に、同じ data-id・data-start・
//       data-end の当たり判定(data-hit="1")がある
//   GR10 で加わった基準(GR10 P2 の画像の確認の後の指示 2):
//   7・S4・A4・Q4 に、(g) 線どうしの交差が既知の件数(KNOWN_G)を超えないことを足す
//   G0: 図の質の数え方で離れた組を先に除いても、境目の最小の入力(tests/view/quality/boundary.mjs)で値が変わらない
//   G1〜G7: 一般ビュー(GR10 指示書 7 章の 1〜7)。309 ファイルの描画と決定性、記号ごとの最小の入力、既知の件数(KNOWN_GENERAL・
//   KNOWN_F・KNOWN_G の general)、例の 5 つのビュー、書き足しへの強さ、当たり判定
//   GR11 で加わった基準(GR11 指示書 6 章):
//   H1: (h) の m(最小の曲がりの数)の場合分けを、向きの組と位置の関係のすべての場合の最小の入力(tests/view/quality/bends.mjs)で確かめる
//   7・S4・A4・Q4・G4 に、(h) 線の余分な曲がりが既知の件数(KNOWN_H)を超えないことを足す(GR11 指示書 8 章)
//   GR13 で加わった基準(GR13 指示書 7 章):
//   T1: 309 ファイルの表の候補をすべて作り、例外なく終わる。2 回の作成(2 回目は解析からやり直す)で SVG とタブ区切りの文字が一致する。
//       1 候補 2 秒以内
//   T2: 例の view '部品と要求の表' の 4 つの表の見出しと行が、期待する文字の表と一致する。例は 6 つのビューで意味エラー・未検査 0 件
//   T3: タブ区切りの文字の形(見出しの行、LF、セルの中のタブ・改行の置き換え)
//   T4: 保存する表の SVG に、原文・data-*・当たり判定・題が入らず、@page が入る(図の分は tests/view/app.mjs の検査 9)
//   T5: 安全性: 検査用の入力一覧で、表の SVG に実行できる形が出ず、タブ区切りの文字は入力の名前をそのまま文字として持つ
//   T6: 表のビューの画面の処理(Worker が表を返すこと、GridView の view を開いたときに表で表示すること)は tests/view/app.mjs の検査 10
//   7 の全数比較(5 つのビューの図の描画結果が GR12 の終わりと同じ)は tools/view/gr13_compare.mjs で行い、報告に書く
//   GR14 で加わった基準(GR14 指示書 6 章。数え方は tools/view/edge_quality.mjs の gr14Counts):
//   W1: 5 つのビューの 309 ファイルで、(i) 注釈の線の長さの合計と 200 px を超える本数が、既知の件数(KNOWN_I)を超えない
//   W2: (A を既定に入れたとき)一般ビューの 309 ファイル・記号ごとの入力・例で、行為者(棒人間)の下の辺に端が着く線が 0 本
//   W3: (F を既定に入れたとき)アクションフロービューの 309 ファイルと記号ごとの入力、状態遷移ビューの記号ごとの入力で、外側の箱の右と下の
//       空白が内側の余白(左と上)を超える箱が 0 個(名前の区画などで決まる最小の大きさの箱は除く)
//   W4: (C を既定に入れたとき)アクションフロービューの 309 ファイルの候補が 138 件(GR13 の 105 件に、計算とケースの候補 33 件を足したもの)
//   GR15 で加わった基準(GR15 指示書 4 章・6 章。数え方は tools/view/edge_quality.mjs の gr15Counts):
//   W5: (R を既定に入れたとき)5 つのビューの 309 ファイル・記号ごとの入力・例(全候補)で、行為者(棒人間)に着く線の端のうち、
//       棒人間の図形(頭と体の外接矩形)を 2 px 広げたものの外にあるものが 0 本。R2 を既定に入れたときは、左右から着く線の端
//       (最後の区間が横向きのもの)が、腕の線の端(手の先)から 2 px 以内(GR15 v15.2 の指示書 3.2 節)
//   全体の時間は記録するだけで、合否に使わない(GR20 の Z1。GR19 までは全体が 15 分以内に終わることを合否にしていた)。失敗が 1 つでもあれば終了コード 1 で終わる。

import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { renderAll } from '../../tools/view/render_files.mjs';
import { checkCase, coverage } from '../../tools/view/check_images.mjs';
import { measure, gr15Counts } from '../../tools/view/edge_quality.mjs';
import { buildHtml, checkExternal } from '../../tools/build/build.mjs';
import { renderText, prepareView, renderStateTransition, renderInterconnection, renderActionFlow, renderSequence, renderGeneral, FIG14, FIG15 } from '../../src/view/index.js';
import { appendRobustness, flowRowStability } from '../../tools/view/ab_compare.mjs';
import { parseXml } from '../../src/app/xml.js';
import { runAppTests } from './app.mjs';
import { boundaryCases } from './quality/boundary.mjs';
import { bendCases } from './quality/bends.mjs';
import { edgeQuality, bendOf, bendStats } from '../../src/view/quality.js';
import { renderTables, tsv } from '../../src/view/table.js';
import { pieceSvg } from '../../src/view/pieces.js';
import { decodeUtf8 } from '../../src/parser/index.js';
import { buildDiagnostics } from '../../src/app/diag.js';
import { checkSemantics } from '../../src/model/semantic.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
process.chdir(ROOT);
const t0 = performance.now();
let passes = 0, failures = 0;
const check = (ok, what, detail = '') => { if (ok) passes++; else { failures++; console.log(`  失敗: ${what}${detail ? ` — ${detail}` : ''}`); } };
const section = (s) => console.log(`\n== ${s}`);

// 309 ファイルの既知の件数(P2 の 4 回目の裁定 1。GR4 の完了報告の確認の後の 2 回目の指示 1 で数え方を足した後の値。
// reports/GR4/P5_tests_*.md の 9 章)
// GR7 P3 で、線の順番と線の端の仕上げの切り替え(src/view/index.js の UNIFIED_EDGES)の後の実測に置き換えた(GR7 P2 の裁定 2。
// reports/GR7/P2_ab_*.md の 3 章)。切り替え前は (a) 4・(b) 5・(c) 16・(d) 12・(e) 8
const KNOWN = { crossings: 4, overlaps: 5, texts: 15, uturns: 12, arrows: 8 };
// 状態遷移ビューの 309 ファイルの既知の件数(GR6 P2 の 2 回目の確認の後の裁定 2。reports/GR6/P2_render_*.md の 6 章)
// GR7 P3 で切り替え後の実測に置き換えた(同上)。切り替え前は (a) 0・(b) 0・(c) 0・(d) 2・(e) 0
const KNOWN_STATE = { crossings: 0, overlaps: 0, texts: 0, uturns: 4, arrows: 0 };
// アクションフロービューの 309 ファイルの既知の件数(GR7 P3 の実測。reports/GR7/P3_render_*.md の 7 章)
// GR8 P3 で、流れの段の配置への切り替え(src/view/index.js の FLOW_LAYERS)の後の実測に置き換えた(GR8 P2 の裁定。
// reports/GR8/P2_ab_*.md の 5 章)。切り替え前は (a) 24・(b) 5・(c) 2・(d) 23・(e) 2
const KNOWN_ACTION = { crossings: 7, overlaps: 3, texts: 0, uturns: 8, arrows: 1 };
// (f) 広い間隔で長く並ぶ線の、3 つのビューの 309 ファイルの既知の件数(GR8 P1 の裁定 Q3、P2 の裁定。reports/GR8/P2_ab_*.md の 5 章)。
// 例と記号ごとの入力を 0 件にする基準には入れない
// GR11 P3 で、一般ビューの分を、線の余分な曲がりを減らす切り替え(src/view/index.js の BEND)の後の実測に置き換えた(GR11 P2 の
// 報告の確認の後の裁定。reports/GR11/P2_ab_*.md の 3.1 節)。切り替え前は 5182
// GR12 P4 で、一般ビューの分を、分野ごとの専用の記号の後の実測に置き換えた(GR12 P2 の報告の確認の後の裁定 R3。
// reports/GR12/P3_screen_*.md の 1.1 節)。GR12 の前は 4982
// GR14 P2 で、一般ビューの分を、既定に入れた直し(F・C・A・P)をすべて入れた後の実測に置き換えた(GR14 指示書 4 章。
// reports/GR14/P1_fixes_*.md)。GR14 の前は 5073
// GR14 P3 で、N も既定に入れた後の実測に置き換えた(reports/GR14/P3_note_*.md)。P2 では 5067
const KNOWN_F = { interconnection: 6, state: 28, action: 26, sequence: 0, general: 4289 };
// (g) 線どうしの交差の、309 ファイルの既知の件数(GR10 P2 の画像の確認の後の指示 2。reports/GR10/P2_layer_*.md)。
// 0 件を求めず、既知の件数を超えないことだけを確かめる。一般ビューの分は GR10 P4 で足した(下の KNOWN_GENERAL と同じ裁定)
// GR11 P3 で、一般ビューの分を切り替え後の実測に置き換えた(KNOWN_F と同じ裁定)。切り替え前は 54585
// GR12 P4 で、一般ビューの分を置き換えた(KNOWN_F と同じ裁定)。GR12 の前は 53977
// GR14 P2 で、一般ビューの分を置き換えた(KNOWN_F と同じ)。GR14 の前は 54312。GR14 P3 で置き換えた(KNOWN_F と同じ)。P2 では 54212
const KNOWN_G = { interconnection: 17, state: 60, action: 63, sequence: 0, general: 40169 };
// (h) 線の余分な曲がりの、309 ファイルの既知の件数(GR11 P2 の報告の確認の後の裁定。reports/GR11/P2_ab_*.md の 3.1 節・3.2 節)。
// 0 件を求めず、既知の件数を超えないことだけを確かめる。一般ビューは切り替え後の実測(切り替え前は 6710)
// GR12 P4 で、一般ビューの分を置き換えた(KNOWN_F と同じ裁定)。GR12 の前は 5196
// GR14 P2 で、一般ビューの分を置き換えた(KNOWN_F と同じ)。GR14 の前は 5326。GR14 P3 で置き換えた(KNOWN_F と同じ)。P2 では 5222
const KNOWN_H = { interconnection: 34, state: 4, action: 26, sequence: 0, general: 3950 };
// シーケンスビューの 309 ファイルの既知の件数(GR9 P3 の実測と、P3 の確認の後の裁定。reports/GR9/P3_render_*.md の 4 章)
const KNOWN_SEQUENCE = { crossings: 0, overlaps: 0, texts: 0, uturns: 0, arrows: 0 };
// 一般ビューの 309 ファイルの既知の件数(GR10 P2 の報告の確認の後の裁定 2 で、(a)〜(g) = 0,2,3,1,0,5182,54585 と確定。
// reports/GR10/P2_move_*.md の 2 章)。(f) は KNOWN_F、(g) は KNOWN_G の general
// GR11 P3 で、切り替え後の実測に置き換えた(KNOWN_F と同じ裁定)。切り替え前は (a)〜(e) = 0,2,3,1,0
// GR12 P4 で、分野ごとの専用の記号の後の実測に置き換えた(KNOWN_F と同じ裁定。(c) は actor の名前に線が着く 3 件が増えた。
// GR12 P2 の裁定 R2)。GR12 の前は (a)〜(e) = 0,1,3,1,0
// GR14 P2 で、既定に入れた直しをすべて入れた後の実測に置き換えた(KNOWN_F と同じ。(c) は A で行為者の名前に線が着かなくなり 2 件減った)。
// GR14 の前は (a)〜(e) = 0,1,6,1,0。GR14 P3 で、N も既定に入れた後の実測に置き換えた(KNOWN_F と同じ)。P2 では 0,1,4,1,0
const KNOWN_GENERAL = { crossings: 0, overlaps: 1, texts: 3, uturns: 1, arrows: 0 };
// (i) 注釈の線の長さの合計(px、四捨五入)と、200 px を超える本数の、309 ファイルの既知の件数(GR14 指示書 3.1 節・6 章。
// GR14 で既定に入れた直しをすべて入れた後の実測。アクションフロービューは C で増えた候補 33 件を含む。reports/GR14/P2_done_*.md)。
// 0 件は求めない
// GR14 P3 で、N も既定に入れた後の実測に置き換えた(reports/GR14/P3_note_*.md)。P2 では 相互接続 6173・5、一般 19230973・2140
const KNOWN_I = { interconnection: { len: 6034, long: 5 }, state: { len: 3038, long: 4 }, action: { len: 1871, long: 0 }, sequence: { len: 24, long: 0 }, general: { len: 15651334, long: 1954 } };
// GR14 の検査に使う、ビューごとの measure の結果
const G14Q = {};

// ---- 1・2
section('1・2. 309 ファイルの全候補の描画と決定性');
{
  const r = renderAll();
  console.log(`  files=${r.files} parsed=${r.parsed} rejected=${r.rejected} candidates=${r.candidates}(view ${r.viewCandidates}) rendered=${r.rendered} exceptions=${r.exceptions.length} mismatches=${r.mismatches.length} renderMs=${r.msTotal}`);
  check(r.files === 309 && r.parsed === 305, '309 ファイルのうち 305 件を受理する', `${r.parsed}`);
  check(r.exceptions.length === 0, '1. 例外なく描く', JSON.stringify(r.exceptions.slice(0, 3)));
  check(r.rendered === r.candidates, '1. すべての候補を描く', `${r.rendered} / ${r.candidates}`);
  check(r.mismatches.length === 0, '2. 2 回描いて SVG と構造が一致する', JSON.stringify(r.mismatches.slice(0, 3)));
}

// ---- 3
section('3. 記号ごとの最小の入力');
{
  const manifest = JSON.parse(fs.readFileSync('tests/view/symbols/manifest.json', 'utf8'));
  let ok = 0;
  for (const c of manifest.cases) { const { problems } = checkCase(c); check(!problems.length, `記号の入力 ${c.file}`, problems.join('; ')); if (!problems.length) ok++; }
  const symbols = JSON.parse(fs.readFileSync('tools/view/symbols.json', 'utf8')).symbols;
  const covered = new Set(manifest.cases.flatMap((c) => c.covers));
  const unused = new Set(Object.keys(manifest.unused));
  const draw = symbols.filter((s) => s.class === 'GR4 で描く');
  const missing = draw.filter((s) => !covered.has(s.name) && !unused.has(s.name)).map((s) => s.name);
  check(missing.length === 0, '記号の一覧の「GR4 で描く」が、入力か unused のどちらかにある', missing.join(' '));
  console.log(`  入力 ${manifest.cases.length} 件(合格 ${ok})、描く記号 ${draw.length} 件: 入力で確かめる ${draw.filter((s) => covered.has(s.name)).length}、使わない ${draw.filter((s) => unused.has(s.name)).length}、漏れ ${missing.length}`);
}

// ---- 4(SVG に生の文字が出ない)
section('4. 安全性(描いた SVG)');
{
  const inputs = JSON.parse(fs.readFileSync('tests/view/safety/inputs.json', 'utf8')).sysml;
  const BAD_EL = new Set(['script', 'img', 'foreignObject', 'iframe', 'a', 'use', 'image', 'animate', 'set', 'object', 'embed']);
  let n = 0;
  for (const c of inputs) {
    const r0 = renderText(c.text);
    check(r0.ok, `安全性(${c.name}): 構文上正しい`, r0.errors?.[0]?.message ?? '');
    if (!r0.ok) continue;
    for (const cand of r0.candidates) {
      const r = renderText(c.text, cand.id);
      n++;
      let root = null;
      try { root = parseXml(r.svg); } catch (e) { check(false, `安全性(${c.name} / ${cand.id}): SVG が正しい XML`, e.message); continue; }
      const bad = [];
      const walk = (e) => {
        if (BAD_EL.has(e.name)) bad.push(`要素 ${e.name}`);
        for (const a of Object.keys(e.attrs)) if (/^on/i.test(a) || a === 'href' || a === 'xlink:href') bad.push(`属性 ${a}`);
        for (const k of e.children) if (k.name) walk(k);
      };
      walk(root);
      check(!bad.length, `安全性(${c.name} / ${cand.id}): 危ない要素・属性がない`, bad.join(', '));
      const raw = c.forbidden.filter((f) => r.svg.includes(f));
      check(!raw.length, `安全性(${c.name} / ${cand.id}): 生の文字が出ない`, raw.join(', '));
    }
    const all = r0.candidates.map((cand) => renderText(c.text, cand.id).svg).join('\n');
    const miss = c.mustContain.filter((f) => !all.includes(f));
    check(!miss.length, `安全性(${c.name}): エスケープした文字が出る`, miss.join(', '));
  }
  console.log(`  入力 ${inputs.length} 件、描いた候補 ${n} 件`);
}

// ---- 6
section('6. ビルドした HTML');
{
  const config = JSON.parse(fs.readFileSync('tools/build/config.json', 'utf8'));
  for (const out of config.outputs) {
    const html = buildHtml(out);
    const ext = checkExternal(html);
    check(ext.length === 0, `${out.file}: 外部の読み込みがない`, ext.map((x) => `${x.what}: ${x.text}`).join(' | '));
    check(buildHtml(out) === html, `${out.file}: 2 回のビルドが同じバイト列`);
    console.log(`  ${out.file}: ${Buffer.byteLength(html)} バイト、外部の読み込み ${ext.length} 件`);
  }
}

// ---- G0(GR10 P2 の確認の後の裁定 3)
section('G0. 図の質の数え方: 離れた組を先に除く距離の境目');
{
  const cnt = (q) => ({ a: q.crossings.length, b: q.overlaps.length, d: q.uturns.length, e: q.arrowheads.length, f: q.parallels.length, g: q.edgeCrossings.length });
  const cases = boundaryCases();
  let same = 0, asExpected = 0;
  for (const c of cases) {
    const q1 = edgeQuality(c.d), q0 = edgeQuality(c.d, { prune: false });
    const ex = { a: 0, b: 0, d: 0, e: 0, f: 0, g: 0, ...c.expect };
    if (JSON.stringify(q1) === JSON.stringify(q0)) same++; else check(false, `${c.name}: 除く前と除いた後で値が一致`);
    if (JSON.stringify(cnt(q0)) === JSON.stringify(ex)) asExpected++; else check(false, `${c.name}: 件数が境目の期待と同じ`, `${JSON.stringify(cnt(q0))}(期待: ${JSON.stringify(ex)})`);
  }
  console.log(`  入力 ${cases.length} 件: 除く前と一致 ${same} 件、件数が期待と同じ ${asExpected} 件`);
  check(same === cases.length && asExpected === cases.length, '境目の入力のすべてで、除く前と除いた後の値が一致し、件数が期待と同じ');
}

// ---- H1(GR11 指示書 4 章・6 章)
section('H1. (h) の m の場合分け: 向きの組と位置の関係の最小の入力');
{
  const cases = bendCases();
  let ok = 0;
  const pairs = new Set();
  for (const c of cases) {
    const b = bendOf(c.points);
    const pts = c.points.filter((p, i) => i === 0 || p.x !== c.points[i - 1].x || p.y !== c.points[i - 1].y);
    const dir = (p, q) => `${Math.sign(q.x - p.x)},${Math.sign(q.y - p.y)}`;
    pairs.add(`${dir(pts[0], pts[1])}|${dir(pts[pts.length - 2], pts[pts.length - 1])}`);
    const h = bendStats({ edges: [{ id: 'e1', symbol: 'x', points: c.points }] })[0]?.h;
    if (b && b.k === c.k && b.m === c.m && h === Math.max(0, c.k - c.m)) ok++;
    else check(false, `${c.name}: k・m・h が期待と同じ`, `${b ? `k ${b.k}・m ${b.m}・h ${h}` : 'null'}(期待: k ${c.k}・m ${c.m})`);
  }
  console.log(`  入力 ${cases.length} 件(向きの組 ${pairs.size} 通り): 期待と同じ ${ok} 件`);
  check(ok === cases.length, 'すべての入力で、k・m・h が期待と同じ');
  check(pairs.size === 16, '向きの組(最初と最後の区間の向き)の 16 通りがすべてある', `${pairs.size}`);
}

// ---- 7
section('7. 線と文字の質');
{
  const q = measure(); G14Q.interconnection = q;
  const ar = (x) => x.arrows ?? 0;
  console.log(`  例: 横切り ${q.sample.crossings}、重なり ${q.sample.overlaps}、文字の重なり ${q.sample.texts}、コの字 ${q.sample.uturns}、矢じりの重なり ${ar(q.sample)}`);
  console.log(`  記号ごとの入力 ${q.symbols.cases} 件: 横切り ${q.symbols.crossings}、重なり ${q.symbols.overlaps}、文字の重なり ${q.symbols.texts}、コの字 ${q.symbols.uturns}、矢じりの重なり ${ar(q.symbols)}`);
  console.log(`  309 ファイル(候補 ${q.files.candidates} 件): 横切り ${q.files.crossings}、重なり ${q.files.overlaps}、文字の重なり ${q.files.texts}、コの字 ${q.files.uturns}、矢じりの重なり ${ar(q.files)}(既知: ${KNOWN.crossings}・${KNOWN.overlaps}・${KNOWN.texts}・${KNOWN.uturns}・${KNOWN.arrows})、(f) ${q.files.parallels ?? 0}(既知: ${KNOWN_F.interconnection})`);
  check(q.sample.crossings === 0 && q.sample.overlaps === 0 && q.sample.texts === 0 && q.sample.uturns === 0 && ar(q.sample) === 0, '例: (a)〜(e) が 0 件');
  check(q.symbols.crossings === 0 && q.symbols.overlaps === 0 && q.symbols.texts === 0 && q.symbols.uturns === 0 && ar(q.symbols) === 0, '記号ごとの入力: (a)〜(e) が 0 件');
  check(q.files.crossings <= KNOWN.crossings && q.files.overlaps <= KNOWN.overlaps && q.files.texts <= KNOWN.texts && q.files.uturns <= KNOWN.uturns && ar(q.files) <= KNOWN.arrows, '309 ファイル: 既知の件数を超えない');
  check((q.files.parallels ?? 0) <= KNOWN_F.interconnection, '309 ファイル: (f) が既知の件数を超えない', `${q.files.parallels}`);
  check((q.files.edgeCrossings ?? 0) <= KNOWN_G.interconnection, '309 ファイル: (g) 線どうしの交差が既知の件数を超えない', `${q.files.edgeCrossings}(既知: ${KNOWN_G.interconnection})`);
  check((q.files.bends?.h ?? 0) <= KNOWN_H.interconnection, '309 ファイル: (h) 線の余分な曲がりが既知の件数を超えない', `${q.files.bends?.h ?? 0}(既知: ${KNOWN_H.interconnection})`);
}

// ---- S1〜S5(状態遷移ビュー)
section('S1・S2. 状態遷移ビュー: 309 ファイルの全候補の描画と決定性');
{
  const r = renderAll({ view: 'state' });
  console.log(`  files=${r.files} parsed=${r.parsed} rejected=${r.rejected} candidates=${r.candidates}(view ${r.viewCandidates}) rendered=${r.rendered} exceptions=${r.exceptions.length} mismatches=${r.mismatches.length} renderMs=${r.msTotal}`);
  check(r.exceptions.length === 0, 'S1. 例外なく描く', JSON.stringify(r.exceptions.slice(0, 3)));
  check(r.rendered === r.candidates && r.candidates > 0, 'S1. すべての候補を描く', `${r.rendered} / ${r.candidates}`);
  check(r.mismatches.length === 0, 'S2. 2 回描いて SVG と構造が一致する', JSON.stringify(r.mismatches.slice(0, 3)));
}
section('S3. 状態遷移ビュー: 記号ごとの最小の入力');
{
  const manifest = JSON.parse(fs.readFileSync('tests/view/symbols-state/manifest.json', 'utf8'));
  let ok = 0;
  for (const c of manifest.cases) { const { problems } = checkCase(c, 'state'); check(!problems.length, `記号の入力 ${c.file}`, problems.join('; ')); if (!problems.length) ok++; }
  const symbols = JSON.parse(fs.readFileSync('tools/view/symbols.json', 'utf8')).stateTransition.symbols;
  const cv = coverage(symbols, manifest, true);
  check(cv.missing.length === 0, '記号の一覧の「GR6 で描く」が、入力か unused か GR4 の入力のどれかにある', cv.missing.join(' '));
  console.log(`  入力 ${manifest.cases.length} 件(合格 ${ok})、描く記号 ${cv.draw.length} 件: GR4 の入力で確かめた ${cv.viaGr4.length}、漏れ ${cv.missing.length}`);
}
section('S3〜S5. 状態遷移ビュー: 線と文字の質');
{
  const q = measure({ view: 'state' }); G14Q.state = q;
  const ar = (x) => x.arrows ?? 0;
  const line = (x) => `横切り ${x.crossings}、重なり ${x.overlaps}、文字の重なり ${x.texts}、コの字 ${x.uturns}、矢じりの重なり ${ar(x)}`;
  console.log(`  例(${q.sample.candidate}): ${line(q.sample)}`);
  console.log(`  記号ごとの入力 ${q.symbols.cases} 件: ${line(q.symbols)}`);
  console.log(`  309 ファイル(候補 ${q.files.candidates} 件): ${line(q.files)}(既知: ${KNOWN_STATE.crossings}・${KNOWN_STATE.overlaps}・${KNOWN_STATE.texts}・${KNOWN_STATE.uturns}・${KNOWN_STATE.arrows})、(f) ${q.files.parallels ?? 0}(既知: ${KNOWN_F.state})`);
  const zero = (x) => x.crossings === 0 && x.overlaps === 0 && x.texts === 0 && x.uturns === 0 && ar(x) === 0;
  check(zero(q.symbols), 'S3. 記号ごとの入力: (a)〜(e) が 0 件');
  check(q.files.crossings <= KNOWN_STATE.crossings && q.files.overlaps <= KNOWN_STATE.overlaps && q.files.texts <= KNOWN_STATE.texts && q.files.uturns <= KNOWN_STATE.uturns && ar(q.files) <= KNOWN_STATE.arrows, 'S4. 309 ファイル: 既知の件数を超えない');
  check((q.files.parallels ?? 0) <= KNOWN_F.state, 'S4. 309 ファイル: (f) が既知の件数を超えない', `${q.files.parallels}`);
  check((q.files.edgeCrossings ?? 0) <= KNOWN_G.state, 'S4. 309 ファイル: (g) 線どうしの交差が既知の件数を超えない', `${q.files.edgeCrossings}(既知: ${KNOWN_G.state})`);
  check((q.files.bends?.h ?? 0) <= KNOWN_H.state, 'S4. 309 ファイル: (h) 線の余分な曲がりが既知の件数を超えない', `${q.files.bends?.h ?? 0}(既知: ${KNOWN_H.state})`);
  check(q.sample.candidate != null, 'S5. 例に状態遷移ビューの候補がある');
  // 例の状態遷移ビューは、全候補で数える(最初の候補は型のない「全体図」なので、型が StateTransitionView の「動作の図」も含める)
  const p = prepareView(fs.readFileSync('src/app/sample.sysml', 'utf8'));
  let bad = [];
  for (const c of p.stateCandidates) {
    const r = renderStateTransition(p, c.id, { quality: true }); const x = r.quality;
    const n = x.crossings.length + x.overlaps.length + x.textOverlaps.length + x.uturns.length + x.arrowheads.length;
    console.log(`  例 ${c.id}: ${n} 件`);
    if (n) bad.push(c.id);
  }
  check(!bad.length && p.stateCandidates.length > 0, 'S5. 例の状態遷移ビュー: (a)〜(e) が 0 件', bad.join(' '));
}

// ---- S6(ビューごとの HTML: 相互接続だけ)
section('S6. ビューごとの HTML(相互接続だけ)');
{
  const config = JSON.parse(fs.readFileSync('tools/build/config.json', 'utf8'));
  // GR23 の予定の red の 1: ビューごとの HTML の出力を out/build/ に移した(前は 'dist/sysmlv2-interconnection.html'。前の期待値で流したログは out/GR23/logs/P2/before/view.log)
  const only = config.outputs.find((o) => o.file === 'out/build/sysmlv2-interconnection.html');
  check(only && JSON.stringify(only.views) === '["interconnection"]', 'S6. out/build/sysmlv2-interconnection.html の views は相互接続だけ');
  const html = buildHtml(only);
  check(html.includes('const ENABLED_VIEWS = ["interconnection"];'), 'S6. HTML の選べるビューが相互接続だけ(状態遷移は選べない)');
  // GR23 の予定の red の 1: 1 つにまとめた HTML を公開するアプリ本体 index.html にした(前は 'dist/sysmlv2.html')
  const both = config.outputs.find((o) => o.file === 'index.html');
  // GR7 指示書 7 章: dist/sysmlv2.html の views に action-flow を足した。GR9 指示書 7 章: sequence を足した(GR9 P1 の裁定 Q10 で期待値を置き換えた)。
  // GR10 指示書 6 章: general を足した(GR10 P3 の確認の後の裁定 1 で期待値を置き換えた)
  // GR13 で表を足した(予定の red の 3。前は ["interconnection","general","state-transition","action-flow","sequence"])。
  // GR13 の追加の直し(その 2)で、表をグリッドビュー grid にし、仕様書の表 34 の順にした(前は ["interconnection","general","table","state-transition","action-flow","sequence"])
  check(both && buildHtml(both).includes('const ENABLED_VIEWS = ["general","interconnection","action-flow","state-transition","sequence","grid"];'), 'S6. index.html では一般・相互接続・アクションフロー・状態遷移・シーケンス・グリッドビューを、仕様書の表 34 の順で選べる');
}

// ---- A1〜A6(アクションフロービュー。GR7)
section('A1・A2. アクションフロービュー: 309 ファイルの全候補の描画と決定性');
{
  const r = renderAll({ view: 'action' });
  console.log(`  files=${r.files} parsed=${r.parsed} rejected=${r.rejected} candidates=${r.candidates}(view ${r.viewCandidates}) rendered=${r.rendered} exceptions=${r.exceptions.length} mismatches=${r.mismatches.length} renderMs=${r.msTotal}`);
  check(r.exceptions.length === 0, 'A1. 例外なく描く', JSON.stringify(r.exceptions.slice(0, 3)));
  check(r.rendered === r.candidates && r.candidates > 0, 'A1. すべての候補を描く', `${r.rendered} / ${r.candidates}`);
  check(r.mismatches.length === 0, 'A2. 2 回描いて SVG と構造が一致する', JSON.stringify(r.mismatches.slice(0, 3)));
}
section('A3. アクションフロービュー: 記号ごとの最小の入力');
{
  const manifest = JSON.parse(fs.readFileSync('tests/view/symbols-action/manifest.json', 'utf8'));
  let ok = 0;
  for (const c of manifest.cases) { const { problems } = checkCase(c, 'action'); check(!problems.length, `記号の入力 ${c.file}`, problems.join('; ')); if (!problems.length) ok++; }
  const symbols = JSON.parse(fs.readFileSync('tools/view/symbols.json', 'utf8')).actionFlow.symbols;
  const cv = coverage(symbols, manifest, 'action');
  check(cv.missing.length === 0, '記号の一覧の「GR7 で描く」が、入力か unused か GR4・GR6 の入力のどれかにある', cv.missing.join(' '));
  console.log(`  入力 ${manifest.cases.length} 件(合格 ${ok})、描く記号 ${cv.draw.length} 件: GR4・GR6 の入力で確かめた ${cv.viaGr4.length}、漏れ ${cv.missing.length}`);
}
section('A3・A4. アクションフロービュー: 線と文字の質');
{
  const q = measure({ view: 'action' }); G14Q.action = q;
  const ar = (x) => x.arrows ?? 0;
  const line = (x) => `横切り ${x.crossings}、重なり ${x.overlaps}、文字の重なり ${x.texts}、コの字 ${x.uturns}、矢じりの重なり ${ar(x)}`;
  console.log(`  記号ごとの入力 ${q.symbols.cases} 件: ${line(q.symbols)}`);
  console.log(`  309 ファイル(候補 ${q.files.candidates} 件): ${line(q.files)}(既知: ${KNOWN_ACTION.crossings}・${KNOWN_ACTION.overlaps}・${KNOWN_ACTION.texts}・${KNOWN_ACTION.uturns}・${KNOWN_ACTION.arrows})、(f) ${q.files.parallels ?? 0}(既知: ${KNOWN_F.action})`);
  const zero = (x) => x.crossings === 0 && x.overlaps === 0 && x.texts === 0 && x.uturns === 0 && ar(x) === 0;
  check(zero(q.symbols), 'A3. 記号ごとの入力: (a)〜(e) が 0 件');
  check(q.files.crossings <= KNOWN_ACTION.crossings && q.files.overlaps <= KNOWN_ACTION.overlaps && q.files.texts <= KNOWN_ACTION.texts && q.files.uturns <= KNOWN_ACTION.uturns && ar(q.files) <= KNOWN_ACTION.arrows, 'A4. 309 ファイル: 既知の件数を超えない');
  check((q.files.parallels ?? 0) <= KNOWN_F.action, 'A4. 309 ファイル: (f) が既知の件数を超えない', `${q.files.parallels}`);
  check((q.files.edgeCrossings ?? 0) <= KNOWN_G.action, 'A4. 309 ファイル: (g) 線どうしの交差が既知の件数を超えない', `${q.files.edgeCrossings}(既知: ${KNOWN_G.action})`);
  check((q.files.bends?.h ?? 0) <= KNOWN_H.action, 'A4. 309 ファイル: (h) 線の余分な曲がりが既知の件数を超えない', `${q.files.bends?.h ?? 0}(既知: ${KNOWN_H.action})`);
}
section('A5・Q5. 例の 4 つのビュー: 線と文字の質');
{
  const p = prepareView(fs.readFileSync('src/app/sample.sysml', 'utf8'));
  const bad = [];
  for (const [name, render, cands] of [['相互接続', renderInterconnection, p.candidates], ['状態遷移', renderStateTransition, p.stateCandidates], ['アクションフロー', renderActionFlow, p.actionCandidates], ['シーケンス', renderSequence, p.sequenceCandidates]]) {
    for (const c of cands) {
      const x = render(p, c.id, { quality: true }).quality;
      const n = x.crossings.length + x.overlaps.length + x.textOverlaps.length + x.uturns.length + x.arrowheads.length;
      if (n) bad.push(`${name} ${c.id}: ${n} 件`);
    }
    console.log(`  ${name}ビュー: 候補 ${cands.length} 件`);
  }
  check(!bad.length && p.actionCandidates.length > 0 && p.sequenceCandidates.length > 0, 'A5・Q5. 例の 4 つのビューの全候補: (a)〜(e) が 0 件', bad.join(' / '));
}
section('A6・Q6. 書き足しへの強さ(4 つのビュー)');
{
  for (const view of ['interconnection', 'state', 'action', 'sequence']) {
    const r = appendRobustness({ view });
    console.log(`  ${view}: 候補 ${r.candidates}、線 ${r.edges}、順番が変わった候補 末尾に 1 行 ${r.changedEnd}・先頭に 1 行 ${r.changedStart}・先頭に 50 行 ${r.changedStart50}`);
    check(r.changedEnd === 0 && r.changedStart === 0 && r.changedStart50 === 0 && r.candidates > 0, `A6. ${view}: すでにある線どうしの順番が変わらない`, JSON.stringify(r.list.slice(0, 3)));
  }
}
// GR8 指示書 6 章: 流れの段の配置(src/view/index.js の FLOW_LAYERS)で、例と 309 ファイルの末尾に 1 行足したときに、
// すでにある要素の段(描く関数が返す flowRows。要素の id ごとの行)が変わらないこと
section('A7. 書き足しへの強さ: 流れの段(アクションフロービューと、状態遷移ビューの本体の図)');
{
  for (const view of ['action', 'state']) {
    const r = flowRowStability({ view });
    console.log(`  ${view}: 候補 ${r.candidates}、段のある候補 ${r.withRows}、末尾に 1 行で段が変わった候補 ${r.changed}`);
    check(r.changed === 0 && (view === 'state' || r.withRows > 0), `A7. ${view}: 末尾に 1 行足しても、すでにある要素の段が変わらない`, JSON.stringify(r.list.slice(0, 3)));
  }
}

// ---- Q1〜Q4・Q7(シーケンスビューと当たり判定。GR9)
section('Q1・Q2. シーケンスビュー: 309 ファイルの全候補の描画と決定性');
{
  const r = renderAll({ view: 'sequence' });
  console.log(`  files=${r.files} parsed=${r.parsed} rejected=${r.rejected} candidates=${r.candidates}(view ${r.viewCandidates}) rendered=${r.rendered} exceptions=${r.exceptions.length} mismatches=${r.mismatches.length} renderMs=${r.msTotal}`);
  check(r.exceptions.length === 0, 'Q1. 例外なく描く', JSON.stringify(r.exceptions.slice(0, 3)));
  check(r.rendered === r.candidates && r.candidates > 0, 'Q1. すべての候補を描く', `${r.rendered} / ${r.candidates}`);
  check(r.mismatches.length === 0, 'Q2. 2 回描いて SVG と構造が一致する', JSON.stringify(r.mismatches.slice(0, 3)));
}
section('Q3. シーケンスビュー: 記号ごとの最小の入力');
{
  const manifest = JSON.parse(fs.readFileSync('tests/view/symbols-sequence/manifest.json', 'utf8'));
  let ok = 0;
  for (const c of manifest.cases) { const { problems } = checkCase(c, 'sequence'); check(!problems.length, `記号の入力 ${c.file}`, problems.join('; ')); if (!problems.length) ok++; }
  const symbols = JSON.parse(fs.readFileSync('tools/view/symbols.json', 'utf8')).sequence.symbols;
  const cv = coverage(symbols, manifest, 'sequence');
  check(cv.missing.length === 0, '記号の一覧の「GR9 で描く」が、入力か unused か GR4・GR6・GR7 の入力のどれかにある', cv.missing.join(' '));
  console.log(`  入力 ${manifest.cases.length} 件(合格 ${ok})、描く記号 ${cv.draw.length} 件: GR4・GR6・GR7 の入力で確かめた ${cv.viaGr4.length}、漏れ ${cv.missing.length}`);
  // 縦の順(GR9 P1 の裁定 Q3): order.sysml は、頭の中の事象の継承と first deliver then ack; から、上から subscribe・publish・deliver・ack
  const p = prepareView(fs.readFileSync('tests/view/symbols-sequence/order.sysml', 'utf8'));
  const r = renderSequence(p);
  const ys = r.structure.edges.map((e) => [e.label, +(r.svg.match(new RegExp(`<g data-id="${e.id}" data-sym="message"[^>]*><polyline points="[^,]*,([^ ]*)`))?.[1] ?? NaN)]).sort((a, b) => a[1] - b[1]).map((x) => x[0]);
  check(ys.join(',') === 'subscribe,publish,deliver,ack', 'Q3. order.sysml の縦の順が subscribe・publish・deliver・ack', ys.join(','));
}
section('Q3・Q4. シーケンスビュー: 線と文字の質');
{
  const q = measure({ view: 'sequence' }); G14Q.sequence = q;
  const ar = (x) => x.arrows ?? 0;
  const line = (x) => `横切り ${x.crossings}、重なり ${x.overlaps}、文字の重なり ${x.texts}、コの字 ${x.uturns}、矢じりの重なり ${ar(x)}`;
  console.log(`  記号ごとの入力 ${q.symbols.cases} 件: ${line(q.symbols)}`);
  console.log(`  309 ファイル(候補 ${q.files.candidates} 件): ${line(q.files)}(既知: ${KNOWN_SEQUENCE.crossings}・${KNOWN_SEQUENCE.overlaps}・${KNOWN_SEQUENCE.texts}・${KNOWN_SEQUENCE.uturns}・${KNOWN_SEQUENCE.arrows})、(f) ${q.files.parallels ?? 0}(既知: ${KNOWN_F.sequence})`);
  const zero = (x) => x.crossings === 0 && x.overlaps === 0 && x.texts === 0 && x.uturns === 0 && ar(x) === 0;
  check(zero(q.symbols) && q.symbols.cases > 0, 'Q3. 記号ごとの入力: (a)〜(e) が 0 件');
  check(q.files.crossings <= KNOWN_SEQUENCE.crossings && q.files.overlaps <= KNOWN_SEQUENCE.overlaps && q.files.texts <= KNOWN_SEQUENCE.texts && q.files.uturns <= KNOWN_SEQUENCE.uturns && ar(q.files) <= KNOWN_SEQUENCE.arrows, 'Q4. 309 ファイル: 既知の件数を超えない');
  check((q.files.parallels ?? 0) <= KNOWN_F.sequence, 'Q4. 309 ファイル: (f) が既知の件数を超えない', `${q.files.parallels}`);
  check((q.files.edgeCrossings ?? 0) <= KNOWN_G.sequence, 'Q4. 309 ファイル: (g) 線どうしの交差が既知の件数を超えない', `${q.files.edgeCrossings}(既知: ${KNOWN_G.sequence})`);
  check((q.files.bends?.h ?? 0) <= KNOWN_H.sequence, 'Q4. 309 ファイル: (h) 線の余分な曲がりが既知の件数を超えない', `${q.files.bends?.h ?? 0}(既知: ${KNOWN_H.sequence})`);
}
section('Q7. 当たり判定(4 つのビューの記号ごとの入力)');
{
  const dirs = [['interconnection', 'tests/view/symbols', renderInterconnection, (p) => p.candidates], ['state', 'tests/view/symbols-state', renderStateTransition, (p) => p.stateCandidates],
    ['action', 'tests/view/symbols-action', renderActionFlow, (p) => p.actionCandidates], ['sequence', 'tests/view/symbols-sequence', renderSequence, (p) => p.sequenceCandidates]];
  const reEsc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  for (const [view, dir, render0, cands0] of dirs) {
    const manifest = JSON.parse(fs.readFileSync(`${dir}/manifest.json`, 'utf8'));
    let edges = 0, lifes = 0;
    const bad = [];
    for (const c of manifest.cases) {
      const p = prepareView(fs.readFileSync(`${dir}/${c.file}`, 'utf8'));
      if (!p.ok) continue;
      const st = view === 'action' && c.view === 'state';
      const render = st ? renderStateTransition : render0, cands = st ? (x) => x.stateCandidates : cands0;
      for (const cand of cands(p)) {
        const r = render(p, cand.id);
        const hit = (id, src) => new RegExp(`<polyline data-id="${reEsc(id)}"${src ? ` data-start="${src[0]}" data-end="${src[1]}"` : ''} data-hit="1" `).test(r.svg);
        for (const e of r.structure.edges) { edges++; if (!hit(e.id, e.src)) bad.push(`${c.file} ${e.id}`); }
        for (const n of r.structure.nodes) if (n.symbol === 'lifeline') { lifes++; const h = r.structure.nodes.find((x) => x.id === n.parent); if (!hit(h.id, h.src)) bad.push(`${c.file} ${n.id}`); }
      }
    }
    console.log(`  ${view}: 線 ${edges} 本、生存線 ${lifes} 本、当たり判定のないもの ${bad.length}`);
    check(!bad.length && edges > 0, `Q7. ${view}: すべての線${view === 'sequence' ? 'と生存線' : ''}に当たり判定がある`, bad.slice(0, 5).join(' / '));
  }
}

// ---- G1〜G7(一般ビュー。GR10 指示書 7 章の 1〜7)
section('G1・G2. 一般ビュー: 309 ファイルの全候補の描画と決定性');
{
  const r = renderAll({ view: 'general' });
  console.log(`  files=${r.files} parsed=${r.parsed} rejected=${r.rejected} candidates=${r.candidates}(view ${r.viewCandidates}) rendered=${r.rendered} exceptions=${r.exceptions.length} mismatches=${r.mismatches.length} renderMs=${r.msTotal}`);
  check(r.exceptions.length === 0, 'G1. 例外なく描く', JSON.stringify(r.exceptions.slice(0, 3)));
  check(r.rendered === r.candidates && r.candidates > 0, 'G1. すべての候補を描く', `${r.rendered} / ${r.candidates}`);
  check(r.mismatches.length === 0, 'G2. 2 回描いて SVG と構造が一致する', JSON.stringify(r.mismatches.slice(0, 3)));
}
section('G3. 一般ビュー: 記号ごとの最小の入力');
{
  const manifest = JSON.parse(fs.readFileSync('tests/view/symbols-general/manifest.json', 'utf8'));
  let ok = 0;
  for (const c of manifest.cases) { const { problems } = checkCase(c, 'general'); check(!problems.length, `記号の入力 ${c.file}`, problems.join('; ')); if (!problems.length) ok++; }
  const symbols = JSON.parse(fs.readFileSync('tools/view/symbols.json', 'utf8')).general.symbols;
  const cv = coverage(symbols, manifest, 'general');
  check(cv.missing.length === 0, '記号の一覧の「GR10 で描く」と「汎用の箱で描く」が、入力か unused か GR4・GR6・GR7・GR9 の入力のどれかにある', cv.missing.join(' '));
  console.log(`  入力 ${manifest.cases.length} 件(合格 ${ok})、描く記号 ${cv.draw.length} 件: GR4・GR6・GR7・GR9 の入力で確かめた ${cv.viaGr4.length}、漏れ ${cv.missing.length}`);
}
section('G3・G4. 一般ビュー: 線と文字の質');
{
  const q = measure({ view: 'general' }); G14Q.general = q;
  const ar = (x) => x.arrows ?? 0;
  const line = (x) => `横切り ${x.crossings}、重なり ${x.overlaps}、文字の重なり ${x.texts}、コの字 ${x.uturns}、矢じりの重なり ${ar(x)}`;
  console.log(`  記号ごとの入力 ${q.symbols.cases} 件: ${line(q.symbols)}`);
  console.log(`  309 ファイル(候補 ${q.files.candidates} 件): ${line(q.files)}(既知: ${KNOWN_GENERAL.crossings}・${KNOWN_GENERAL.overlaps}・${KNOWN_GENERAL.texts}・${KNOWN_GENERAL.uturns}・${KNOWN_GENERAL.arrows})、(f) ${q.files.parallels ?? 0}(既知: ${KNOWN_F.general})、(g) ${q.files.edgeCrossings ?? 0}(既知: ${KNOWN_G.general})`);
  const zero = (x) => x.crossings === 0 && x.overlaps === 0 && x.texts === 0 && x.uturns === 0 && ar(x) === 0;
  check(zero(q.symbols) && q.symbols.cases > 0, 'G3. 記号ごとの入力: (a)〜(e) が 0 件');
  check(q.files.crossings <= KNOWN_GENERAL.crossings && q.files.overlaps <= KNOWN_GENERAL.overlaps && q.files.texts <= KNOWN_GENERAL.texts && q.files.uturns <= KNOWN_GENERAL.uturns && ar(q.files) <= KNOWN_GENERAL.arrows, 'G4. 309 ファイル: 既知の件数を超えない');
  check((q.files.parallels ?? 0) <= KNOWN_F.general, 'G4. 309 ファイル: (f) が既知の件数を超えない', `${q.files.parallels}`);
  check((q.files.edgeCrossings ?? 0) <= KNOWN_G.general, 'G4. 309 ファイル: (g) 線どうしの交差が既知の件数を超えない', `${q.files.edgeCrossings}(既知: ${KNOWN_G.general})`);
  check((q.files.bends?.h ?? 0) <= KNOWN_H.general, 'G4. 309 ファイル: (h) 線の余分な曲がりが既知の件数を超えない', `${q.files.bends?.h ?? 0}(既知: ${KNOWN_H.general})`);
}
section('G5. 例の 5 つのビュー: 線と文字の質');
{
  const p = prepareView(fs.readFileSync('src/app/sample.sysml', 'utf8'));
  const bad = [];
  for (const [name, render, cands] of [['相互接続', renderInterconnection, p.candidates], ['一般', renderGeneral, p.generalCandidates], ['状態遷移', renderStateTransition, p.stateCandidates], ['アクションフロー', renderActionFlow, p.actionCandidates], ['シーケンス', renderSequence, p.sequenceCandidates]]) {
    for (const c of cands) {
      const x = render(p, c.id, { quality: true }).quality;
      const n = x.crossings.length + x.overlaps.length + x.textOverlaps.length + x.uturns.length + x.arrowheads.length;
      if (n) bad.push(`${name} ${c.id}: ${n} 件`);
    }
    console.log(`  ${name}ビュー: 候補 ${cands.length} 件`);
  }
  check(!bad.length && p.generalCandidates.length > 0, 'G5. 例の 5 つのビューの全候補: (a)〜(e) が 0 件', bad.join(' / '));
}
section('G6. 書き足しへの強さ(一般ビュー)');
{
  const r = appendRobustness({ view: 'general' });
  console.log(`  general: 候補 ${r.candidates}、線 ${r.edges}、順番が変わった候補 末尾に 1 行 ${r.changedEnd}・先頭に 1 行 ${r.changedStart}・先頭に 50 行 ${r.changedStart50}`);
  check(r.changedEnd === 0 && r.changedStart === 0 && r.changedStart50 === 0 && r.candidates > 0, 'G6. general: すでにある線どうしの順番が変わらない', JSON.stringify(r.list.slice(0, 3)));
}
section('G7. 当たり判定(一般ビューの記号ごとの入力と例)');
{
  const reEsc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const texts = JSON.parse(fs.readFileSync('tests/view/symbols-general/manifest.json', 'utf8')).cases.map((c) => [c.file, fs.readFileSync(`tests/view/symbols-general/${c.file}`, 'utf8')]);
  texts.push(['src/app/sample.sysml', fs.readFileSync('src/app/sample.sysml', 'utf8')]);
  let edges = 0;
  const bad = [];
  for (const [file, text] of texts) {
    const p = prepareView(text);
    if (!p.ok) continue;
    for (const cand of p.generalCandidates) {
      const r = renderGeneral(p, cand.id);
      for (const e of r.structure.edges) { edges++; if (!new RegExp(`<polyline data-id="${reEsc(e.id)}"${e.src ? ` data-start="${e.src[0]}" data-end="${e.src[1]}"` : ''} data-hit="1" `).test(r.svg)) bad.push(`${file} ${cand.id} ${e.id}`); }
    }
  }
  console.log(`  一般: 線 ${edges} 本、当たり判定のないもの ${bad.length}`);
  check(!bad.length && edges > 0, 'G7. 一般ビュー: すべての線に当たり判定がある', bad.slice(0, 5).join(' / '));
}

// ---- T1〜T5(GR13 指示書 7 章の 1〜5)
section('T1. 表: 309 ファイルの全候補の作成と決定性');
{
  const files = fs.readFileSync('out/files309.txt', 'utf8').split('\n').filter(Boolean);
  let cands = 0, made = 0, maxMs = 0, slowest = null, most = null;
  const exceptions = [], mismatches = [], slow = [];
  for (const f of files) {
    const text = decodeUtf8(fs.readFileSync(f));
    const p1 = prepareView(text);
    if (!p1.ok) continue;
    const p2 = prepareView(text);
    for (const c of p1.tableCandidates) {
      cands++;
      try {
        const t0c = performance.now();
        const a = renderTables(p1, c.id);
        const ms = performance.now() - t0c;
        const b = renderTables(p2, c.id);
        made++;
        if (ms > maxMs) { maxMs = ms; slowest = `${f} ${c.id}`; }
        if (ms > 2000) slow.push(`${f} ${c.id} ${ms.toFixed(0)} ms`);
        const ta = a.tables.map((t) => (t.empty ? '' : tsv(t))).join('\f'), tb = b.tables.map((t) => (t.empty ? '' : tsv(t))).join('\f');
        if (a.svg !== b.svg || ta !== tb || a.tables.map((t) => t.svg).join() !== b.tables.map((t) => t.svg).join()) mismatches.push(`${f} ${c.id}`);
        for (const t of a.tables) if (!most || t.rows.length > most.rows) most = { file: f, candidate: c.id, table: t.name, rows: t.rows.length };
      } catch (e) { exceptions.push(`${f} ${c.id}: ${e.message}`); }
    }
  }
  console.log(`  候補 ${cands}、作成 ${made}、例外 ${exceptions.length}、食い違い ${mismatches.length}、最も遅い候補 ${maxMs.toFixed(1)} ms(${slowest})、行の最も多い表 ${most ? `${most.rows} 行(${most.file} ${most.candidate} の「${most.table}」)` : 'なし'}`);
  check(cands > 0 && made === cands && !exceptions.length, 'T1. 表の候補をすべて例外なく作る', exceptions.slice(0, 3).join(' / '));
  check(!mismatches.length, 'T1. 2 回の作成で SVG とタブ区切りの文字が一致する', mismatches.slice(0, 3).join(' / '));
  // GR20 の Z1: 時間は記録するだけで合否に使わない(設計書 10 章)。GR19 までは「T1. 1 候補 2 秒以内」を合否にしていた
  console.log(`  T1. 2 秒を超えた候補(記録): ${slow.length} 件${slow.length ? ' ' + slow.slice(0, 3).join(' / ') : ''}`);
  check(true, `T1. 1 候補の時間の記録(合否に使わない): 最大 ${maxMs.toFixed(1)} ms、2 秒を超えた候補 ${slow.length} 件`);
}
section('T2. 表: 例の view 部品と要求の表');
{
  const SAMPLE = fs.readFileSync('src/app/sample.sysml', 'utf8');
  const p = prepareView(SAMPLE);
  const c = p.tableCandidates.find((x) => x.id === 'view:見守りシステムの例::部品と要求の表');
  check(!!c && p.tableCandidates.length === 1, 'T2. 例の表の候補は view 部品と要求の表 だけ', p.tableCandidates.map((x) => x.id).join(','));
  const r = renderTables(p, c?.id);
  const got = r.tables.map((t) => [t.name, t.header.join('|'), ...t.rows.map((row) => row.join('|'))]);
  const want = [
    ['部品の一覧', '部品|型|持ち主|多重度|説明',
      '見守りシステム||見守りシステムの例||', '温度計|温度センサ|見守りシステムの例::見守りシステム||', '測定ボード|Arduino Uno|見守りシステムの例::見守りシステム||',
      '警報ブザー|ブザー|見守りシステムの例::見守りシステム||', '出力ボード|Arduino Nano|見守りシステムの例::見守りシステム||', '冷却ファン|ファン|見守りシステムの例::見守りシステム||'],
    ['ポートと接続先', '部品|ポート|向き|型|接続先|つなぎ方',
      '温度計|出力|out|~アナログ入力|測定ボード.A0|flow', '測定ボード|シリアル端子||シリアル|出力ボード.シリアル端子|interface : UART接続',
      '測定ボード|A0|in|アナログ入力|温度計.出力|flow', '測定ボード|D8|out|デジタル出力|警報ブザー.制御|connect', '警報ブザー|制御|in|~デジタル出力|測定ボード.D8|connect',
      '出力ボード|シリアル端子||~シリアル|測定ボード.シリアル端子|interface : UART接続', '出力ボード|D3|out|デジタル出力|冷却ファン.制御|connect',
      '冷却ファン|制御|in|~デジタル出力|出力ボード.D3|connect'],
    ['要求と満たす部品', '要求|種類|型|本文|満たす部品|検証', '高温の警報|定義||温度が上限を超えたら、ブザーを鳴らす||', '警報の要求|使用|高温の警報||見守りシステム|'],
    // GR17 P9: 例に perform action '温度の測定' : '測定の手順'; を足した(S)ので置き換えた(予定の red の 3。前は ['機能の割り当て表', '行動'])
    ['機能の割り当て表', '行動|測定ボード', '温度の測定|perform'],
  ];
  check(JSON.stringify(got) === JSON.stringify(want), 'T2. 4 つの表の見出しと行が、期待する文字の表と一致する', JSON.stringify(got));
  // GR17 P9: 例の機能の割り当て表に行が出るので、4 つの表がどれも行を持ち、「該当なし」が出ない形に置き換えた(予定の red の 3。前は、tables[3] が空、
  // 題の位置が 3 つ、画面の表に「該当なし」がある。前の期待値で流したログは out/GR17/logs/P9/before/view.log)
  check(r.tables.every((t) => !t.empty) && r.anchors.map((a) => a.name).join() === '部品の一覧,ポートと接続先,要求と満たす部品,機能の割り当て表', 'T2. 行のある表に題の位置を返す(GR17 P9 から、例の 4 つの表がどれも行を持つ)');
  check(!r.svg.includes('>該当なし</text>') && r.svg.includes('data-sym="table-row"') && /<g data-id="t1\.0" data-sym="table-row" data-start="\d+" data-end="\d+">/.test(r.svg), 'T2. 画面の表: 例の表に「該当なし」がなく、行は原文の範囲を持つ(段階 0)');
  const sem = checkSemantics(p.ctx.tree, p.ctx.model, SAMPLE);
  const d = buildDiagnostics({ text: SAMPLE, refs: p.ctx.model.refs, semantic: sem });
  check(d.semantic.length === 0 && d.unchecked.count === 0 && !r.diagnostics.length, 'T2. 例: 意味エラー 0 件・未検査 0 件、表の図の診断 0 件', `意味エラー ${d.semantic.length}、未検査 ${d.unchecked.count}`);
  // 機能の割り当て表のマトリクス: perform と allocate、セルの原文の範囲
  const m = prepareView("package P {\n  action def A;\n  action a1 : A;\n  action a2 : A;\n  part def B { perform a1; }\n  part b : B { perform a2; }\n  part c;\n  allocate a1 to c;\n  allocate a2 to b;\n}\n");
  const mr = renderTables(m);
  const t4 = mr.tables[3];
  check(t4.header.join('|') === '行動|B|b|c' && t4.rows.map((x) => x.join('|')).join('/') === 'a1|perform||allocate/a2||perform, allocate|', 'T2. 機能の割り当て表: 行は行動、列は部品、セルは perform・allocate(両方なら perform, allocate)', JSON.stringify([t4.header, t4.rows]));
  check(/<g data-start="\d+" data-end="\d+"><rect [^>]*\/><text [^>]*>perform<\/text><\/g>/.test(mr.svg), 'T2. 機能の割り当て表のセルは、その perform・allocate の宣言の原文の範囲を持つ');
}
section('T3. 表: タブ区切りの文字の形');
{
  const t = { header: ['a', 'b\tc'], rows: [['1\n2', 'x\r\ny'], ['', 'z']] };
  check(tsv(t) === 'a\tb c\n1 2\tx y\n\tz\n', 'T3. 1 行目は見出し、行の区切りは LF、セルの中のタブ・改行は空白 1 個', JSON.stringify(tsv(t)));
}
section('T4. 表: 保存する SVG');
{
  const p = prepareView(fs.readFileSync('src/app/sample.sysml', 'utf8'));
  const r = renderTables(p);
  const bad = [];
  for (const t of r.tables.filter((x) => !x.empty)) {
    const sv = pieceSvg(t.svg);
    const [, w, h] = /<svg [^>]*?width="([\d.]+)" height="([\d.]+)"/.exec(t.svg);
    if (/ data-[a-z-]+=/.test(sv) || /hit-areas/.test(sv)) bad.push(`${t.name}: data-*・当たり判定`);
    if (!sv.includes(`<style>@page{size:${w}px ${h}px;margin:0}</style>`)) bad.push(`${t.name}: @page`);
    if (sv.includes(`>${t.name}</text>`)) bad.push(`${t.name}: 題`);
    if (/<metadata|base64|expose/.test(sv)) bad.push(`${t.name}: 原文`);
    try { parseXml(sv); } catch (e) { bad.push(`${t.name}: XML ${e.message}`); }
  }
  // GR17 P9: 行のある表が 3 → 4(S。予定の red の 3)
  check(!bad.length && r.tables.filter((x) => !x.empty).length === 4, 'T4. 保存する表の SVG に原文・data-*・当たり判定・題が入らず、@page が入る', bad.join(' / '));
}
section('T5. 表: 安全性');
{
  const inputs = JSON.parse(fs.readFileSync('tests/view/safety/inputs.json', 'utf8')).sysml;
  const BAD_EL = new Set(['script', 'img', 'foreignObject', 'iframe', 'a', 'use', 'image', 'animate', 'set', 'object', 'embed']);
  // 表にだけ出る名前(ポート・要求・割り当て)を含む入力を足す
  const extra = { name: '表の列に出る名前', text: "package '<script>p</script>' {\n  part def 'D<img src=x onerror=alert(1)>';\n  part '<b>a</b>' : 'D<img src=x onerror=alert(1)>' { in port '\"><svg onload=alert(2)>'; }\n  requirement '<script>r</script>' { doc /* </text><script>x</script> */ }\n  satisfy '<script>r</script>' by '<b>a</b>';\n  action '<i>act</i>';\n  allocate '<i>act</i>' to '<b>a</b>';\n  view 'g<1>' : StandardViewDefinitions::GridView { expose '<script>p</script>'::**; }\n}\n",
    forbidden: ['<script', '<img', '<svg onload', '<b>', '<i>', '</text><script>'], names: ['<b>a</b>', '"><svg onload=alert(2)>', '<script>r</script>', '<i>act</i>', 'D<img src=x onerror=alert(1)>'] };
  let n = 0;
  for (const c of [...inputs, extra]) {
    const p = prepareView(c.text);
    if (!p.ok) { check(false, `T5(${c.name}): 構文上正しい`); continue; }
    for (const cand of p.tableCandidates) {
      const r = renderTables(p, cand.id);
      n++;
      for (const [what, svg] of [['画面', r.svg], ...r.tables.filter((t) => !t.empty).map((t) => [`保存 ${t.name}`, pieceSvg(t.svg)])]) {
        let root = null;
        try { root = parseXml(svg); } catch (e) { check(false, `T5(${c.name} / ${cand.id} / ${what}): 正しい XML`, e.message); continue; }
        const bad = [];
        const walk = (e) => {
          if (BAD_EL.has(e.name)) bad.push(`要素 ${e.name}`);
          for (const a of Object.keys(e.attrs)) if (/^on/i.test(a) || a === 'href' || a === 'xlink:href') bad.push(`属性 ${a}`);
          for (const k of e.children) if (k.name) walk(k);
        };
        walk(root);
        const raw = c.forbidden.filter((f) => svg.includes(f));
        check(!bad.length && !raw.length, `T5(${c.name} / ${cand.id} / ${what}): 表の SVG に実行できる形・生の文字が出ない`, [...bad, ...raw].join(', '));
      }
      // タブ区切りの文字は、クリップボードに文字として写す(HTML にしない)。名前は、そのままの文字としてセルに入る
      const all = r.tables.filter((t) => !t.empty).map((t) => tsv(t)).join('');
      check(!/<text|<g |data-|&lt;|&amp;/.test(all), `T5(${c.name} / ${cand.id}): タブ区切りの文字に、表を描く SVG の形やエスケープが混ざらない`);
      // GR22 で置き換えた(予定の red の 5。設計書 9.3 節 v22.1・GR22 指示書 3.8 節): " で始まるセルは、先頭に ' を付けたものになる
      // (GR21 の期待: " で始まる名前 "><svg onload=alert(2)> も、そのままの文字のセル)
      const cellOf = (x) => (x.startsWith('"') ? `'${x}` : x);
      if (c.names) check(c.names.every((x) => all.split(/[\t\n、]/).some((cell) => cell === cellOf(x) || cell.startsWith(`${x}.`) || cell.endsWith(`.${x}`))), `T5(${c.name}): タブ区切りの文字のセルが、入力の名前をそのまま持つ(" で始まる名前は、先頭に ' を付けたもの)`, all);
    }
  }
  const main = fs.readFileSync('src/app/main.js', 'utf8');
  check(/navigator\.clipboard\.writeText\(text\)/.test(main) && /ta\.value = text/.test(main) && !/innerHTML = [^;]*tsv/.test(main), 'T5. 画面はタブ区切りの文字を、文字としてクリップボードに写す(HTML にしない)');
  console.log(`  入力 ${inputs.length + 1} 件、作った候補 ${n} 件`);
}

// ---- W1〜W4(GR14 指示書 6 章)
section('W1〜W4. 図の見た目と中身の直し(GR14)');
{
  console.log(`  既定に入れた直し: ${Object.entries(FIG14).filter(([, v]) => v).map(([k]) => k).join('・') || 'なし'}`);
  for (const v of ['interconnection', 'state', 'action', 'sequence', 'general']) {
    const f = G14Q[v].files, len = Math.round(f.iLen ?? 0), long = f.iLong ?? 0;
    console.log(`  ${v}: (i) 長さ ${len}・200 px 超 ${long}(既知: ${KNOWN_I[v].len}・${KNOWN_I[v].long})`);
    check(len <= KNOWN_I[v].len && long <= KNOWN_I[v].long, `W1. ${v}: (i) 注釈の線の長さの合計と 200 px を超える本数が、既知の件数を超えない`, `${len}・${long}`);
  }
  if (FIG14.A) {
    const g = G14Q.general;
    console.log(`  一般ビュー: 行為者の下の辺に着く線 309 ファイル ${g.files.actorBottom}・記号ごとの入力 ${g.symbols.actorBottom}・例 ${g.sampleG14?.actorBottom ?? 0}`);
    check(g.files.actorBottom === 0 && g.symbols.actorBottom === 0 && (g.sampleG14?.actorBottom ?? 0) === 0, 'W2. 一般ビュー: 行為者の下の辺に端が着く線が 0 本', JSON.stringify((g.files.g14Items ?? []).filter((x) => x.actorBottom).slice(0, 3)));
  }
  if (FIG14.F) {
    const a = G14Q.action, st = G14Q.state;
    console.log(`  外側の箱の空白が余白を超える箱: アクションフロービューの 309 ファイル ${a.files.blankOver}・記号ごとの入力 ${a.symbols.blankOver}、状態遷移ビューの記号ごとの入力 ${st.symbols.blankOver}・309 ファイル ${st.files.blankOver}`);
    check(a.files.blankOver === 0 && a.symbols.blankOver === 0 && st.symbols.blankOver === 0 && st.files.blankOver === 0, 'W3. 外側の箱の右と下の空白が、内側の余白を超えない', JSON.stringify((a.files.g14Items ?? []).filter((x) => x.blankOver).slice(0, 3)));
  }
  if (FIG14.C) {
    console.log(`  アクションフロービューの 309 ファイルの候補: ${G14Q.action.files.candidates} 件`);
    check(G14Q.action.files.candidates === 105 + 33, 'W4. アクションフロービューの候補が 138 件(105 件と、計算とケースの候補 33 件)', `${G14Q.action.files.candidates}`);
  }
}

// ---- W5(GR15 指示書 4 章・6 章)
section('W5. 行為者に着く線の端(GR15)');
{
  console.log(`  既定に入れた直し: ${Object.entries(FIG15).filter(([, v]) => v).map(([k]) => k).join('・') || 'なし'}`);
  if (FIG15.R) {
    const R = { interconnection: renderInterconnection, state: renderStateTransition, action: renderActionFlow, sequence: renderSequence, general: renderGeneral };
    const CANDS = { interconnection: 'candidates', state: 'stateCandidates', action: 'actionCandidates', sequence: 'sequenceCandidates', general: 'generalCandidates' };
    const sp = prepareView(fs.readFileSync('src/app/sample.sysml', 'utf8'));
    for (const v of Object.keys(R)) {
      const z = { actorEnds: 0, actorOutside: 0, actorSide: 0, actorOffHand: 0, items: [] };
      const f = G14Q[v].files.g15 ?? z, s = G14Q[v].symbols.g15 ?? z;
      let ends = 0, out = 0, side = 0, off = 0;
      for (const c of sp[CANDS[v]]) { const g = gr15Counts(R[v](sp, c.id, { quality: true, keepDiagram: true }).diagram); ends += g.actorEnds; out += g.actorOutside; side += g.actorSide; off += g.actorOffHand; }
      console.log(`  ${v}: 図形の外の端 / 行為者に着く線の端 309 ファイル ${f.actorOutside} / ${f.actorEnds}・記号ごとの入力 ${s.actorOutside} / ${s.actorEnds}・例 ${out} / ${ends}`);
      check(f.actorOutside === 0 && s.actorOutside === 0 && out === 0, `W5. ${v}: 行為者に着く線の端が、棒人間の図形(2 px 広げたもの)の外にない`, JSON.stringify([...f.items, ...s.items].slice(0, 3)));
      // R2(GR15 v15.2 の指示書 3.2 節): 左右から着く線の端が、腕の線の端(手の先)から 2 px 以内
      if (FIG15.R2) {
        console.log(`  ${v}: 手の先から 2 px より離れた端 / 左右から着く端 309 ファイル ${f.actorOffHand} / ${f.actorSide}・記号ごとの入力 ${s.actorOffHand} / ${s.actorSide}・例 ${off} / ${side}`);
        check(f.actorOffHand === 0 && s.actorOffHand === 0 && off === 0, `W5. ${v}: 左右から行為者に着く線の端が、手の先から 2 px 以内`, JSON.stringify([...f.items, ...s.items].filter((x) => x.actorOffHand).slice(0, 3)));
      }
    }
  }
}

// ---- 4・5・8(tests/view/app.mjs)
section('4・5・8. 画面の処理(開く・保存・診断・色付け・Worker・例)');
{
  const r = await runAppTests((m) => console.log(m));
  passes += r.passes; failures += r.failures;
  console.log(`  合格 ${r.passes} 件、失敗 ${r.failures} 件`);
}

// ---- GR19. 入門用の例(src/app/sample_intro.sysml。GR19 の U3、設計書 10 章の「例」の (a)〜(e) が 0 件)
section('GR19. 入門用の例');
{
  const p = prepareView(fs.readFileSync('src/app/sample_intro.sysml', 'utf8'));
  for (const [name, render, cands] of [['相互接続ビュー', renderInterconnection, p.candidates], ['一般ビュー', renderGeneral, p.generalCandidates]]) {
    const c = cands[0];
    const r = c ? render(p, c.id, { quality: true }) : null;
    const q = r?.quality;
    const n = q ? [q.crossings, q.overlaps, q.textOverlaps, q.uturns, q.arrowheads].map((x) => x.length) : null;
    console.log(`  ${name}(${c?.label ?? '候補なし'}): (a)〜(e) ${n ? n.join('・') : '—'}、図の診断 ${r?.diagnostics.length ?? '—'} 件`);
    check(!!r?.svg && n.every((x) => x === 0), `GR19 U3: 入門用の例の${name}が描け、(a)〜(e) が 0 件`, JSON.stringify(n));
  }
}

// ---- まとめ
const sec = (performance.now() - t0) / 1000;
section('まとめ');
// GR20 の Z1: 時間は記録するだけで合否に使わない(設計書 10 章)。GR19 までは「全体が 15 分以内に終わる」を合否にしていた
check(true, `全体の時間の記録(合否に使わない): ${sec.toFixed(1)} 秒`);
console.log(`  合格 ${passes} 件、失敗 ${failures} 件、所要 ${sec.toFixed(1)} 秒`);
process.exit(failures ? 1 : 0);
