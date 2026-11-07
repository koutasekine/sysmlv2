// GR21: 試しのフォルダを作る道具(GR21 指示書 5 章)。GR20 の 2 つの試しのフォルダ(tools/model/gr20_make_folders.mjs が書くもの)をもとに作る。
//
// 使い方:
//   node tools/model/gr21_make_folders.mjs [--out out/GR21/folders]
//
// 書き出すもの:
//   <out>/懐中電灯_3ファイル/   GR20 と同じ 3 つのファイル。ただし「回路.sysml」の行末を CR LF にする(上書き保存・zip で改行の形が保たれることの確かめ)
//   <out>/またがる編集の試し/   GR20 の「名前の変更の試し」に、下のフォルダのファイル「メモ/センサの追加.sysml」(共通の定義の「センサ」を指す)を足したもの。
//                              「システム.sysml」の行末を CR LF にする。名前の変更がほかのファイル(下のフォルダを含む)に及ぶ要素(「共通」「センサ」
//                              「ボード」「出力」「入力」)、削除がほかのファイルの connect に及ぶ要素(「出力」「入力」)、1 つのファイルに収まる要素を含む。
//                              .git のフォルダ(.sysml を含む)と readme.txt も GR20 のまま置く(読まないことの確かめ)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
process.chdir(ROOT);
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const out = opt('--out', 'out/GR21/folders');
const tmp = path.join(path.dirname(out), 'folders_gr20');
fs.rmSync(tmp, { recursive: true, force: true });
execFileSync(process.execPath, ['tools/model/gr20_make_folders.mjs', '--out', tmp, '--timing', path.join(tmp, 'timing')], { stdio: 'inherit' });
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
fs.cpSync(path.join(tmp, '懐中電灯_3ファイル'), path.join(out, '懐中電灯_3ファイル'), { recursive: true });
fs.cpSync(path.join(tmp, '名前の変更の試し'), path.join(out, 'またがる編集の試し'), { recursive: true });
fs.rmSync(tmp, { recursive: true, force: true });
const crlf = (p) => { const t = fs.readFileSync(p, 'utf8'); fs.writeFileSync(p, t.replace(/\r\n|\r|\n/g, '\r\n')); };
crlf(path.join(out, '懐中電灯_3ファイル', '回路.sysml'));
const X = path.join(out, 'またがる編集の試し');
// 注の文を GR21 の段階 B に合わせる
const sys = path.join(X, 'システム.sysml');
fs.writeFileSync(sys, fs.readFileSync(sys, 'utf8').replace(/^\/\/ .*\n/, '// またがる編集の試し: 共通の定義を使うシステム(行末は CR LF。「本体」「温度センサ」「制御ボード」の名前は、このファイルの中だけで使う)\n'));
crlf(sys);
const com = path.join(X, '共通の定義.sysml');
fs.writeFileSync(com, fs.readFileSync(com, 'utf8').replace(/^\/\/ .*\n/, '// またがる編集の試し: ほかのファイルから使う定義(「共通」「センサ」「ボード」「出力」「入力」の名前を変えると、システム.sysml と メモ/センサの追加.sysml の参照も書き換える。「出力」「入力」を消すと、システム.sysml の connect も一緒に消す。「信号」はこのファイルの中だけで使う)\n'));
fs.writeFileSync(path.join(X, 'メモ', 'センサの追加.sysml'), `// またがる編集の試し: 下のフォルダから、共通の定義の「センサ」を修飾名で指す
part '予備のセンサ' : '共通'::'センサ';
`);
console.log(`書き出した: ${out}`);
