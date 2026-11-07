// 設計書 2.5 節の既知の差と、字句の細部(設計書 12 章の残作業 8)を確かめる最小の入力を作る(GR1 指示書 5.3 節・6.2 節)。
//
// 使い方:
//   node tools/pilot-runner/cases/make_cases.mjs   # → tools/pilot-runner/cases/*.sysml と cases.json
//
// 制御文字・BOM・改行の種類など、目に見えない文字を確実に入れるため、入力はこのスクリプトで書き出す。
// cases.json の各件:
//   id       入力のファイル名(拡張子なし)
//   row      設計書 2.5 節の行(1〜5)。字句の細部の確認用は "lex"、照合の基準は "base"
//   purpose  何を確かめるか
//   predict  2.5 節の記述から予想されるパイロット実装の結果("accept" / "reject")
//   expectType  構文木に現れると予想される要素の種類(あれば)

import fs from 'node:fs';
import path from 'node:path';

const DIR = path.dirname(new URL(import.meta.url).pathname);
const cases = [];
const add = (id, row, purpose, text, predict, expectType) => {
  fs.writeFileSync(path.join(DIR, `${id}.sysml`), text);
  cases.push({ id, row, purpose, predict: predict ?? null, expectType: expectType ?? null });
};

// 照合の基準
add('base_ok', 'base', '基準: 正しい最小の入力', 'package P {\n    part p;\n}\n', 'accept');
add('base_ng', 'base', '基準: 構文エラーのある最小の入力(閉じ波括弧がない)', 'package P {\n    part p;\n', 'reject');

// 2.5 節 1 行目: ExpressionBody(本文は KerML の { FunctionBodyPart }、パイロット実装は SysML の CalculationBody)
add('d1_body_kerml_feature', 1, 'select 式の本体に KerML の feature 宣言を書く。本文(KerML の FunctionBodyPart)なら受理、CalculationBody なら拒否',
  'package P {\n    attribute xs = (1, 2, 3);\n    attribute ys = xs.?{ feature y; true };\n}\n', 'reject');
add('d1_body_sysml_attribute', 1, 'select 式の本体に SysML の attribute 宣言を書く。CalculationBody なら受理、本文(KerML の FunctionBodyPart)なら拒否',
  'package P {\n    attribute xs = (1, 2, 3);\n    attribute ys = xs.?{ attribute y = 1; true };\n}\n', 'accept');

// 2.5 節 2 行目: 単一引用符で囲む名前の中のタブ・改行
add('d2_name_tab', 2, '引用符で囲む名前の中にタブ(U+0009)', "package P {\n    part 'a\tb';\n}\n", 'accept');
add('d2_name_newline', 2, '引用符で囲む名前の中に改行(U+000A)', "package P {\n    part 'a\nb';\n}\n", 'accept');

// 2.5 節 3 行目: エスケープ列 \r
add('d3_escape_r', 3, '引用符で囲む名前の中のエスケープ列 \\r', "package P {\n    part 'a\\rb';\n}\n", 'accept');

// 2.5 節 4 行目: フォームフィード
add('d4_formfeed', 4, '字句の間の空白としてフォームフィード(U+000C)', 'package P {\n    part\fp;\n}\n', 'reject');

// 2.5 節 5 行目: 注釈の選択肢(本文は KerML の MetadataFeature、パイロット実装は SysML の MetadataUsage)
add('d5_metadata', 5, 'パッケージ直下のメタデータ。構文木の要素の種類を見る',
  'package P {\n    metadata def M;\n    metadata m : M;\n}\n', 'accept', 'MetadataUsage');
add('d5_metadata_typed_by', 5, '(2.5 節にない差の確認)本文の MetadataUsageDeclaration・MetadataFeatureDeclaration は「typed by」。パイロット実装は「defined by」',
  'package P {\n    metadata def M;\n    metadata m typed by M;\n}\n', null);
add('d5_metadata_defined_by', 5, '(2.5 節にない差の確認)「defined by」で書いたメタデータ',
  'package P {\n    metadata def M;\n    metadata m defined by M;\n}\n', null);

// 字句の細部(残作業 8)。予想は付けない(実測するだけ)。
const nameCase = (id, purpose, inner) => add(id, 'lex', purpose, `package P {\n    part '${inner}';\n}\n`);
nameCase('lex_name_empty', '空の名前 \'\'', '');
nameCase('lex_name_japanese', '日本語の名前', '温度センサ');
nameCase('lex_name_nul', '名前の中に U+0000', 'a\u0000b');
nameCase('lex_name_bel', '名前の中に U+0007', 'a\u0007b');
nameCase('lex_name_vt', '名前の中に U+000B', 'a\u000bb');
nameCase('lex_name_ff', '名前の中に U+000C', 'a\u000cb');
nameCase('lex_name_cr', '名前の中に U+000D', 'a\rb');
nameCase('lex_name_del', '名前の中に U+007F', 'a\u007fb');
nameCase('lex_name_nel', '名前の中に U+0085(C1 制御文字)', 'a\u0085b');
nameCase('lex_name_ls', '名前の中に U+2028(行区切り)', 'a b');
nameCase('lex_name_bom', '名前の中に U+FEFF', 'a﻿b');
nameCase('lex_name_emoji', '名前の中に補助面の文字 U+1F600', 'a\u{1F600}b');
for (const [ch, nm] of [['b', 'b'], ['t', 't'], ['n', 'n'], ['f', 'f'], ['\\', 'backslash'], ["'", 'quote'], ['"', 'dquote'], ['v', 'v'], ['a', 'a'], ['0', 'zero'], ['u', 'u']]) {
  nameCase(`lex_escape_${nm}`, `名前の中のエスケープ列 \\${ch}`, `x\\${ch}y`);
}
add('lex_string_newline', 'lex', '文字列の中に改行(U+000A)', 'package P {\n    attribute s = "a\nb";\n}\n');
add('lex_string_escape_r', 'lex', '文字列の中のエスケープ列 \\r', 'package P {\n    attribute s = "a\\rb";\n}\n');
add('lex_bom', 'lex', '先頭に BOM(U+FEFF)', '﻿package P {\n    part p;\n}\n');
add('lex_crlf', 'lex', '行末が CR LF', 'package P {\r\n    part p; // 注\r\n    part q;\r\n}\r\n');
add('lex_cr_only', 'lex', '行末が CR だけ', 'package P {\r    part p; // 注\r    part q;\r}\r');
add('lex_ws_vt', 'lex', '字句の間の空白として U+000B', 'package P {\n    part\u000bp;\n}\n');
add('lex_ws_nbsp', 'lex', '字句の間の空白として U+00A0', 'package P {\n    part p;\n}\n');
add('lex_note_cr', 'lex', '1 行の注の終わりが CR だけ(注の後ろの part q を読むか)', 'package P {\r    part p; // 注\r    part q;\r}\n');
add('lex_nul_between', 'lex', '字句の間に U+0000', 'package P {\n    part\u0000p;\n}\n');

fs.writeFileSync(path.join(DIR, 'cases.json'), JSON.stringify({ generatedBy: 'node tools/pilot-runner/cases/make_cases.mjs', cases }, null, 1) + '\n');
console.log(`tools/pilot-runner/cases/: ${cases.length} 件`);
