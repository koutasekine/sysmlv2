// GR18: 全数比較の道具(指示書 3 章の「309 ファイルと例の構文木・参照・描画が変わらない」。B1・B3・B4・S1 の直しの確かめ)。
// 309 ファイルと「例を読み込む」の例について、構文木・参照の状態と解決先・5 つのビューと表の全候補の SVG を書き出し、ハッシュにする。
// 使い方:
//   node tools/view/gr18_compare.mjs dump <出力.json> [--root <ソースの根>] [--no-svg] [--views interconnection,general,…]
//   node tools/view/gr18_compare.mjs diff <前.json> <後.json>
// --root を与えると、そのフォルダの src/ を読み込む(作業ツリーの外の複製で試すときに使う)。既定はこのリポジトリ
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const h = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 16);
if (args[0] === 'dump') {
  const src = path.resolve(opt('--root', ROOT));
  const { parse, decodeUtf8 } = await import(path.join(src, 'src/parser/index.js'));
  const V = await import(path.join(src, 'src/view/index.js'));
  const views = opt('--views', 'interconnection,general,state,action,sequence,grid').split(',');
  const R = { interconnection: [V.renderInterconnection, 'candidates'], general: [V.renderGeneral, 'generalCandidates'], state: [V.renderStateTransition, 'stateCandidates'], action: [V.renderActionFlow, 'actionCandidates'], sequence: [V.renderSequence, 'sequenceCandidates'], grid: [V.renderTables, 'tableCandidates'] };
  const files = fs.readFileSync(path.join(ROOT, 'out/files309.txt'), 'utf8').split('\n').filter(Boolean).concat(['src/app/sample.sysml']);
  const out = {};
  const t0 = performance.now();
  for (const f of files) {
    const text = f === 'src/app/sample.sysml' ? fs.readFileSync(path.join(ROOT, f), 'utf8') : decodeUtf8(fs.readFileSync(path.join(ROOT, f)));
    const rec = {};
    try {
      const p = parse(text);
      rec.tree = p.ok ? h(JSON.stringify(p.tree)) : `ng:${JSON.stringify(p.errors[0])}`;
      if (p.ok && !args.includes('--no-svg')) {
        const pv = V.prepareView(text);
        rec.refs = h(JSON.stringify(pv.ctx.model.refs.map(r => [r.start, r.end, r.prop, r.status, r.target?.kind ?? null, r.target?.start ?? r.target?.qname ?? null, r.shadow ? 1 : 0])));
        for (const v of views) {
          const [render, key] = R[v];
          for (const c of pv[key] ?? []) {
            let r;
            try { r = render(pv, c.id); rec[`${v}|${c.id}`] = h(r.svg ?? 'null'); } catch (e) { rec[`${v}|${c.id}`] = `例外:${e.message}`; }
          }
        }
      }
    } catch (e) { rec.error = e.message; }
    out[f] = rec;
  }
  fs.mkdirSync(path.dirname(path.resolve(args[1])), { recursive: true });
  fs.writeFileSync(args[1], JSON.stringify(out));
  console.log(`${files.length} ファイル、${((performance.now() - t0) / 1000).toFixed(1)} 秒、項目 ${Object.values(out).reduce((n, r) => n + Object.keys(r).length, 0)} → ${args[1]}`);
} else if (args[0] === 'diff') {
  const A = JSON.parse(fs.readFileSync(args[1])), B = JSON.parse(fs.readFileSync(args[2]));
  let n = 0, d = 0; const ex = [];
  for (const f of Object.keys(A)) for (const k of new Set([...Object.keys(A[f]), ...Object.keys(B[f] ?? {})])) { n++; if (A[f][k] !== B[f]?.[k]) { d++; if (ex.length < 20) ex.push(`${f} ${k}: ${A[f][k]} → ${B[f]?.[k]}`); } }
  console.log(`項目 ${n}、違い ${d}`); for (const x of ex) console.log('  ' + x);
}
