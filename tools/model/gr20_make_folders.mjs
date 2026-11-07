// GR20: 試しのフォルダを作る道具(GR20 指示書 5 章、4 章の「時間」)。
//
// 使い方:
//   node tools/model/gr20_make_folders.mjs [--out out/GR20/folders] [--timing out/GR20/timing]
//
// 書き出すもの:
//   <out>/懐中電灯_3ファイル/  入門用の例(src/app/sample_intro.sysml)を、部品の定義・ポートの定義・回路と view の 3 つのファイルに分け、
//                             import でつないだもの(意味エラー・警告・未検査 0 件。reports/GR20/P4_done_*.md に確かめた結果を書く)
//   <out>/名前の変更の試し/     名前の変更がほかのファイルに及ぶ要素(共通の部品の定義)と、1 つのファイルに収まる要素を含むもの。
//                             中に .git のフォルダ(.sysml のファイルを含む。読まないことの確かめ)と .txt のファイルも置く
//   <timing>/intro30/          入門用の例の名前(パッケージの名前)を変えて 30 ファイルに増やしたもの(全ファイルの解析の時間を測る)
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
process.chdir(ROOT);
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const out = opt('--out', 'out/GR20/folders');
const timing = opt('--timing', 'out/GR20/timing');

export const FLASHLIGHT = {
  'ポートの定義.sysml': `// 入門用の例(電池・スイッチ・ランプの回路)を 3 つのファイルに分けたもの: ポートの定義
package '懐中電灯のポート' {
    port def '端子';
}
`,
  '部品の定義.sysml': `// 入門用の例を 3 つのファイルに分けたもの: 部品の定義(ポートの定義は「ポートの定義.sysml」のパッケージから import で取り込む)
package '懐中電灯の部品' {
    private import '懐中電灯のポート'::*;

    part def '電池' {
        port '正極' : '端子';
        port '負極' : '端子';
    }
    part def 'スイッチ' {
        port '入口' : '端子';
        port '出口' : '端子';
    }
    part def 'ランプ' {
        port '入口' : '端子';
        port '出口' : '端子';
    }
}
`,
  '回路.sysml': `// 入門用の例を 3 つのファイルに分けたもの: 回路と view(部品の定義は「部品の定義.sysml」のパッケージから import で取り込む)
package '懐中電灯' {
    private import '懐中電灯の部品'::*;

    part '回路' {
        part '単三電池' : '電池';
        part '押しボタン' : 'スイッチ';
        part '豆電球' : 'ランプ';

        connect '単三電池'.'正極' to '押しボタン'.'入口';
        connect '押しボタン'.'出口' to '豆電球'.'入口';
        connect '豆電球'.'出口' to '単三電池'.'負極';
    }

    view '回路の図' : StandardViewDefinitions::InterconnectionView {
        expose '回路'::**;
        expose '電池';
        expose 'スイッチ';
        expose 'ランプ';
    }
}
`,
};

export const RENAME = {
  '共通の定義.sysml': `// 名前の変更の試し: ほかのファイルから使う定義(「共通」「センサ」「ボード」「出力」「入力」の名前を変えると、システム.sysml の参照も書き換えることになる。「信号」はこのファイルの中だけで使う)
package '共通' {
    port def '信号';
    part def 'センサ' {
        out port '出力' : '信号';
    }
    part def 'ボード' {
        in port '入力' : '信号';
    }
}
`,
  'システム.sysml': `// 名前の変更の試し: 共通の定義を使うシステム(「本体」「温度センサ」「制御ボード」の名前は、このファイルの中だけで使う)
package 'システム' {
    private import '共通'::*;

    part '本体' {
        part '温度センサ' : 'センサ';
        part '制御ボード' : 'ボード';
        connect '温度センサ'.'出力' to '制御ボード'.'入力';
    }
}
`,
  'メモ/単独の部品.sysml': `// 名前の変更の試し: ほかのファイルから使わない部品(名前の変更・追加・削除はこのファイルの中に収まる)
part def '単独の部品' {
    part '中身';
}
`,
  '.git/config.sysml': 'これは読まないファイル(名前が . で始まるフォルダの中)\n',
  'readme.txt': 'このフォルダは GR20 の試しのフォルダです。.sysml でないファイルは読みません。\n',
};

const write = (dir, files) => {
  fs.rmSync(dir, { recursive: true, force: true });
  for (const [rel, text] of Object.entries(files)) { const p = path.join(dir, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text); }
};

if (import.meta.url === `file://${process.argv[1]}`) {
  write(path.join(out, '懐中電灯_3ファイル'), FLASHLIGHT);
  write(path.join(out, '名前の変更の試し'), RENAME);
  const intro = fs.readFileSync('src/app/sample_intro.sysml', 'utf8');
  const t30 = {};
  for (let i = 1; i <= 30; i++) t30[`intro${String(i).padStart(2, '0')}.sysml`] = intro.replace("package '懐中電灯'", `package '懐中電灯${i}'`);
  write(path.join(timing, 'intro30'), t30);
  console.log(`${out}/懐中電灯_3ファイル(${Object.keys(FLASHLIGHT).length} ファイル)、${out}/名前の変更の試し(${Object.keys(RENAME).length} ファイル。.git と .txt を含む)、${timing}/intro30(30 ファイル)`);
}
