// 5 つの検査の前提を作る(GR23 指示書 3.3 節の検査 3、P1 の裁定 Q2)。外部のパッケージを使わず、ネットワークに出ない。
//
// 使い方(リポジトリの根で):
//   bash tools/fetch.sh                                   # 先に、公式のファイルを vendor/ に取得する(GitHub から)
//   node tools/build/prepare_check.mjs                    # ネットワークの要らない前提を out/ に作る
//   node tools/build/prepare_check.mjs --pilot-from <木>  # あわせて、パイロット実装の結果を、別の木の out/ から写す
//
// 作るもの(すでにあれば作り直す):
//   out/files309.txt     公式の例題(vendor/release-2026-03/sysml/src)の .sysml 251 と、標準ライブラリ(sysml.library)の .sysml 58 の一覧。
//                        それぞれをパスのバイト列の順に並べ、例題、標準ライブラリの順につなぐ
//   out/text/kerml10.txt・out/text/sysml20.txt
//                        仕様書の PDF(vendor/release-2026-03/doc/)を pdftotext -layout でテキストにしたもの(W1 の表の抜き出し直しが読む)
//   out/view/big.sysml   node tools/view/make_big.mjs(色付けの時間の検査が読む)
//   out/mutation/        node tools/compare/mutate.mjs --out out/mutation --count 30900 --seed 20261022 --base vendor/release-2026-03 @out/files309.txt
//                        (構文の拒否側の照合が読む変異ファイル)
//
// パイロット実装の結果(PILOT の一覧)は、パイロット実装(vendor/pilot を ./mvnw clean package -DskipTests でビルドした jar)を
// tools/pilot-runner の実行器で動かして作る。jar のビルドは GitHub の外からの取得を伴うので、この道具では作らない。
// 作り方は、各検査の --skip-pilot を付けずに流すこと(tests/model/run.mjs・tests/semantic/run.mjs が jar で作り直す)と、
// tests/parser/run.mjs の前提の説明のとおり。--pilot-from を与えると、その木の out/ から同じパスに写す。
// 終わりに、前提の一覧と、あるかないかを表示する。ないものがあれば終了コード 1。

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');

// パイロット実装の結果: [パス, それを読む検査]
export const PILOT = [
  ['out/pilot/files309', 'parser(309 ファイルの受理・拒否と構文木の照合)'],
  ['out/pilot/mutation', 'parser(変異ファイルの受理・拒否の照合)'],
  ['out/pilot/resolve', 'model・semantic(309 ファイルの名前解決の照合)'],
  ['out/pilot/resolve_cases', 'semantic(最小の入力の名前解決)'],
  ['out/pilot/validate', 'semantic(309 ファイルの検証の照合)'],
  ['out/pilot/validate_cases', 'semantic(最小の入力の検証の照合)'],
  ['out/GR20/pilot', 'model・semantic(フォルダごとの照合)'],
];
export const LOCAL = ['out/files309.txt', 'out/text/kerml10.txt', 'out/text/sysml20.txt', 'out/view/big.sysml', 'out/mutation/manifest.json'];

const byBytes = (a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b));
function listSysml(dir) {
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile() && e.name.endsWith('.sysml')) out.push(path.relative(ROOT, p));
    }
  };
  walk(path.join(ROOT, dir));
  return out.sort(byBytes);
}

function step(name, f) {
  const t0 = Date.now();
  f();
  console.log(`  ${name}: ${((Date.now() - t0) / 1000).toFixed(1)} 秒`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  process.chdir(ROOT);
  const argv = process.argv.slice(2);
  const from = argv.includes('--pilot-from') ? path.resolve(argv[argv.indexOf('--pilot-from') + 1]) : null;
  const R = 'vendor/release-2026-03';
  if (!fs.existsSync(path.join(R, 'sysml/src'))) {
    console.error(`${R} がない。先に bash tools/fetch.sh で取得する`);
    process.exit(1);
  }
  const node = (...a) => execFileSync(process.execPath, a, { stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 1 << 28 }).toString();
  console.log('ネットワークの要らない前提:');
  step('out/files309.txt', () => {
    const files = [...listSysml(`${R}/sysml/src`), ...listSysml(`${R}/sysml.library`)];
    fs.mkdirSync('out', { recursive: true });
    fs.writeFileSync('out/files309.txt', files.join('\n') + '\n');
  });
  step('out/text/kerml10.txt・sysml20.txt', () => {
    fs.mkdirSync('out/text', { recursive: true });
    execFileSync('pdftotext', ['-layout', `${R}/doc/1-Kernel_Modeling_Language.pdf`, 'out/text/kerml10.txt']);
    execFileSync('pdftotext', ['-layout', `${R}/doc/2a-OMG_Systems_Modeling_Language.pdf`, 'out/text/sysml20.txt']);
  });
  step('out/view/big.sysml', () => node('tools/view/make_big.mjs'));
  step('out/mutation/', () => {
    fs.rmSync('out/mutation', { recursive: true, force: true });
    node('tools/compare/mutate.mjs', '--out', 'out/mutation', '--count', '30900', '--seed', '20261022', '--base', R, '@out/files309.txt');
  });
  if (from) {
    console.log(`パイロット実装の結果を ${from} の out/ から写す:`);
    for (const [p] of PILOT) {
      const src = path.join(from, p);
      if (!fs.existsSync(src)) continue;
      step(p, () => {
        fs.rmSync(p, { recursive: true, force: true });
        fs.mkdirSync(path.dirname(p), { recursive: true });
        fs.cpSync(src, p, { recursive: true });
      });
    }
  }
  let missing = 0;
  console.log('前提の一覧:');
  for (const p of LOCAL) {
    const ok = fs.existsSync(p);
    if (!ok) missing++;
    console.log(`  ${ok ? 'あり' : 'なし'}  ${p}`);
  }
  for (const [p, who] of PILOT) {
    const ok = fs.existsSync(p);
    if (!ok) missing++;
    console.log(`  ${ok ? 'あり' : 'なし'}  ${p}(パイロット実装の結果。${who})`);
  }
  if (missing) {
    console.log(`ない前提が ${missing} 件ある`);
    process.exit(1);
  }
}
