// GR20 の M: フォルダ(ファイルの並び)の一覧と、パイロット実装をフォルダごとに動かす道具(GR20 指示書 4 章の M(例題)・M(最小の入力))。
//
// 使い方:
//   node tools/model/gr20_folders.mjs list [--out out/GR20/folders.json] [--cases tests/model/folders]
//     公式の例題(out/files309.txt のうち sysml/src の 251 ファイル)で、同じフォルダに .sysml が 2 つ以上あるフォルダと、
//     最小の入力(--cases の下のフォルダごと)を、フォルダごとのファイルの並びにして書く。
//     [{ name, group: 'examples' | 'cases', dir, files: [リポジトリからのパス] }]。ファイルは相対パス(フォルダからの)の符号位置の順
//     (src/model/files.js の sortPaths)。例題のフォルダは、そのフォルダが直接持つファイルだけ(下のフォルダは別のフォルダとして数える)
//   node tools/model/gr20_folders.mjs pilot [--folders out/GR20/folders.json] [--out out/GR20/pilot] [--jobs 6] [--only 名前,…]
//     フォルダごとに、パイロット実装(tools/pilot-runner の PilotResolve・PilotValidate。変えずに使う)を動かす。実行器は、--library の
//     フォルダの .sysml・.kerml をすべて 1 つの資源の集合に読み込み、その中のファイルは読み込み済みの資源をそのまま使う。そこで、
//     作業用のフォルダ(<out>/work/<番号>/)に、標準ライブラリ(vendor/release-2026-03/sysml.library)の複製と、フォルダのファイルの
//     複製(user/ の下に同じ相対パス)を置き、そのフォルダを --library、user/ を --base にして、フォルダのファイルを渡す。これで、
//     フォルダのファイルをまとめて読み込み、標準ライブラリも読み込ませた結果になる(ほかのファイルの要素への解決先は、実行器の
//     「library」の形(修飾名とファイル名)で書き出される)。
//     出力: <out>/resolve/<番号>/files/<相対パス>.json、<out>/validate/<番号>/files/<相対パス>.json、<out>/summary.json
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { sortPaths } from '../../src/model/files.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
process.chdir(ROOT);
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const JAR = 'vendor/pilot/org.omg.sysml.interactive/target/org.omg.sysml.interactive-0.58.0-SNAPSHOT-all.jar';
const LIB = 'vendor/release-2026-03/sysml.library';

// 公式の例題のフォルダ(同じフォルダに 2 つ以上)と、最小の入力のフォルダ
export function listFolders(casesDir = 'tests/model/folders') {
  const files = fs.readFileSync('out/files309.txt', 'utf8').split('\n').filter(Boolean).filter((f) => f.includes('/sysml/src/'));
  const byDir = new Map();
  for (const f of files) { const d = path.dirname(f); if (!byDir.has(d)) byDir.set(d, []); byDir.get(d).push(f); }
  const out = [];
  for (const d of sortPaths([...byDir.keys()])) {
    const list = byDir.get(d);
    if (list.length < 2) continue;
    const rel = sortPaths(list.map((f) => path.basename(f)));
    out.push({ name: d.replace(/^vendor\/release-2026-03\/sysml\/src\//, ''), group: 'examples', dir: d, files: rel.map((r) => `${d}/${r}`) });
  }
  if (fs.existsSync(casesDir)) {
    for (const c of sortPaths(fs.readdirSync(casesDir).filter((x) => fs.statSync(path.join(casesDir, x)).isDirectory()))) {
      const dir = path.join(casesDir, c);
      const rels = [];
      (function walk(sub) {
        for (const e of fs.readdirSync(path.join(dir, sub), { withFileTypes: true })) {
          if (e.name.startsWith('.')) continue;
          const r = sub ? `${sub}/${e.name}` : e.name;
          if (e.isDirectory()) walk(r); else if (e.name.endsWith('.sysml')) rels.push(r);
        }
      })('');
      out.push({ name: `cases/${c}`, group: 'cases', dir, files: sortPaths(rels).map((r) => `${dir}/${r}`) });
    }
  }
  return out;
}
export const relOf = (folder, f) => f.slice(folder.dir.length + 1);

const run = (cmd, a) => new Promise((res) => {
  const p = spawn(cmd, a, { stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  p.stdout.on('data', (d) => { out += d; });
  p.stderr.on('data', (d) => { out += d; });
  p.on('exit', (code) => res({ code, out }));
});

if (import.meta.url === `file://${process.argv[1]}`) {
  if (args[0] === 'list') {
    const out = opt('--out', 'out/GR20/folders.json');
    const list = listFolders(opt('--cases', 'tests/model/folders'));
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify(list, null, 1) + '\n');
    const ex = list.filter((x) => x.group === 'examples');
    console.log(`例題のフォルダ ${ex.length}(ファイル ${ex.reduce((s, x) => s + x.files.length, 0)})、最小の入力 ${list.length - ex.length} → ${out}`);
  } else if (args[0] === 'pilot') {
    const list = JSON.parse(fs.readFileSync(opt('--folders', 'out/GR20/folders.json'), 'utf8'));
    const outDir = opt('--out', 'out/GR20/pilot');
    const only = opt('--only', null)?.split(',') ?? null;
    const jobs = +opt('--jobs', 6);
    const load0 = fs.readFileSync('/proc/loadavg', 'utf8').split(' ').slice(0, 3).join(' ');
    const t0 = Date.now();
    const summary = { folders: [], load0, jobs };
    const queue = list.map((f, i) => ({ f, i })).filter(({ f }) => !only || only.includes(f.name));
    const worker = async () => {
      while (queue.length) {
        const { f, i } = queue.shift();
        const work = path.join(outDir, 'work', String(i));
        fs.rmSync(work, { recursive: true, force: true });
        fs.cpSync(LIB, path.join(work, 'sysml.library'), { recursive: true });
        const inputs = [];
        for (const src of f.files) {
          const dest = path.join(work, 'user', relOf(f, src));
          fs.mkdirSync(path.dirname(dest), { recursive: true });
          fs.copyFileSync(src, dest);
          inputs.push(dest);
        }
        const listFile = path.join(work, 'inputs.txt');
        fs.writeFileSync(listFile, inputs.join('\n') + '\n');
        const rec = { name: f.name, index: i, files: f.files.length };
        for (const cls of ['PilotResolve', 'PilotValidate']) {
          const o = path.join(outDir, cls === 'PilotResolve' ? 'resolve' : 'validate', String(i));
          fs.rmSync(o, { recursive: true, force: true });
          const s = Date.now();
          const r = await run('java', ['-cp', `${JAR}:out/pilot-runner/classes`, cls, '--out', o, '--library', work, '--base', path.join(work, 'user'), `@${listFile}`]);
          rec[cls] = { code: r.code, line: r.out.split('\n').find((l) => l.startsWith('files=')) ?? r.out.slice(-300), sec: (Date.now() - s) / 1000 };
        }
        fs.rmSync(work, { recursive: true, force: true });
        summary.folders.push(rec);
        console.log(`${i} ${f.name}: ${rec.PilotResolve.line} / ${rec.PilotValidate.line}`);
      }
    };
    await Promise.all([...Array(jobs)].map(worker));
    summary.folders.sort((a, b) => a.index - b.index);
    summary.sec = (Date.now() - t0) / 1000;
    summary.failed = summary.folders.filter((r) => r.PilotResolve.code !== 0 || r.PilotValidate.code !== 0 || !/exceptions=0/.test(r.PilotResolve.line) || !/exceptions=0/.test(r.PilotValidate.line)).map((r) => r.name);
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, `summary${only ? '_only' : ''}.json`), JSON.stringify(summary, null, 1) + '\n');
    console.log(`フォルダ ${summary.folders.length}、失敗 ${summary.failed.length}、${summary.sec} 秒`);
    process.exit(summary.failed.length ? 1 : 0);
  } else {
    console.error('使い方: list | pilot');
    process.exit(2);
  }
}
