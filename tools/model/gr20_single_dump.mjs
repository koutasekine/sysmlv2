// GR20: 1 ファイルの扱いの全数比較(GR20 指示書 4 章)。309 ファイルと「例を読み込む」の 2 つの例について、名前解決(参照の状態と解決先)、
// 意味エラー、警告、6 つのビュー(5 つのビューとグリッドビュー)の全候補の描画(SVG と構造と図の診断)、描く範囲の候補の並び、
// 図からの編集の結果(機械的に選んだ要素の名前の変更・追加・削除と、view の書き足し)を書き出し、2 つの書き出しを比べる。
// 要素は構文木の中の位置(src/edit/index.js の positionsOf。根は '/'、子は o<i>・r<i>)で指す。
//
// 使い方:
//   node tools/model/gr20_single_dump.mjs dump <出力のフォルダ> [--src <src のフォルダ>] [--jobs 12] [--via files]
//   node tools/model/gr20_single_dump.mjs diff <前のフォルダ> <後のフォルダ>
//   --src   読み込む src(既定は作業ツリーの src)。前の版の src を作業ツリーの外に置いて使える
//   --via files  解析と描く準備の入口を、ファイルの並びを受け取る入口(src/app/prepare.js の prepareFiles。src/model/files.js の
//                analyzeFiles を使う)の 1 ファイルの並びにする(GR20 P2 以降)
//   --jobs  並べて動かす子のプロセスの数
// 編集の選び方(記述の順に並べ、決まった間隔で選ぶ): 名前を宣言した要素の 60 個ごとに、名前を引用符の要らない名前と要る名前の 2 通りに変える。
// 部品の定義・使用の 48 個ごとに、型なしの部品と、向きと型なしのポートを足す。宣言した要素の 120 個ごとに削除する。ビューごとに、
// view のないテキストの候補の 32 個ごとに view を書き足す。結果は、行ったものは書き換えた後のテキストの要約(sha1)、拒否と戻したものは
// code と理由と箇所。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
process.chdir(ROOT);
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const sha = (s) => crypto.createHash('sha1').update(s ?? '').digest('hex');
const INPUTS = () => [...fs.readFileSync('out/files309.txt', 'utf8').split('\n').filter(Boolean), 'src/app/sample.sysml', 'src/app/sample_intro.sysml'];
const IV = { rename: 60, add: 48, del: 120, view: 32 };

async function dumpShard(outFile, srcDir, shard, nShards, via) {
  const imp = (p) => import(pathToFileURL(path.resolve(srcDir, p)).href);
  const P = await imp('parser/index.js');
  const M = await imp('model/index.js');
  const SEM = await imp('model/semantic.js');
  const W = await imp('model/warn.js');
  const V = await imp('view/index.js');
  const E = await imp('edit/index.js');
  const A = await imp('edit/add.js');
  const X = await imp('edit/remove.js');
  const VW = await imp('edit/view.js');
  const F = via === 'files' ? await imp('app/prepare.js') : null;
  const norm = (s) => JSON.stringify(s && s.nodes ? { ...s, nodes: s.nodes.map((n) => ({ ...n, symbol: n.symbol.replace(/^param-[lrtb]$/, 'param').replace(/^proxy-[vh]$/, 'proxy') })) } : s);
  const VIEWS = [
    ['interconnection', 'renderInterconnection', 'candidates'], ['general', 'renderGeneral', 'generalCandidates'],
    ['state-transition', 'renderStateTransition', 'stateCandidates'], ['action-flow', 'renderActionFlow', 'actionCandidates'],
    ['sequence', 'renderSequence', 'sequenceCandidates'], ['grid', 'renderTables', 'tableCandidates'],
  ];
  const files = INPUTS().filter((_, i) => i % nShards === shard);
  const out = {};
  for (const f of files) {
    const t0 = performance.now();
    const text = f.startsWith('src/app/') ? fs.readFileSync(f, 'utf8') : P.decodeUtf8(fs.readFileSync(f));
    const rec = {};
    out[f] = rec;
    // 解析(既定は今の 1 つのテキストの入口。--via files ならファイルの並びの入口の 1 ファイル)
    let a, prepared;
    if (F) {
      const x = F.prepareFiles([{ path: path.basename(f), text }]);
      const fa = x.analysis;
      // 1 ファイルの並びの診断には file(ファイルの番号)が付くので、比べるときは除く
      const strip = (l) => l.map(({ file, ...y }) => y);
      a = fa.ok ? { ok: true, tree: fa.tree, model: fa.model, semantic: strip(fa.semantic), warnings: strip(fa.warnings) } : { ok: false };
      prepared = x.prepared;
    } else {
      const e = E.analyze(text);
      a = e.ok ? { ...e, warnings: W.checkWarnings(e.tree, e.model, text) } : { ok: false };
    }
    rec.ok = a.ok;
    if (!a.ok) continue;
    const pos = E.positionsOf(a.tree);
    const id = (t) => !t ? null : t.lib ? `L:${t.qname ?? t.libId}` : t.builtin ? `B:${t.qname}` : t.virtual ? `V:${pos.get(t.of) ?? (t.of?.lib ? 'L:' + (t.of.qname ?? t.of.libId) : '?')}` : pos.get(t) ?? '?';
    rec.refs = a.model.refs.map((r) => `${pos.get(r.node)}|${r.prop}|${r.index ?? ''}|${r.status}|${id(r.target)}|${(r.candidates ?? []).map(id).join(',')}|${r.shadow ? [...new Set(r.shadow.map((x) => x.why))].sort().join(',') : ''}|${r.start}-${r.end}|${r.segments.map((s) => `${s.start}-${s.end}:${id(s.target)}`).join(' ')}|${r.reason ?? ''}|${r.kindMismatch ?? ''}`);
    rec.sem = a.semantic.map((x) => `${x.item}@${x.start}-${x.end} ${x.line}:${x.col} ${x.message}`);
    rec.warn = a.warnings.map((x) => `${x.item}@${x.start}-${x.end} ${x.line}:${x.col} ${x.message}`);
    // 描画(1 ファイルの扱いの描画の入口 prepareView。--via files のときは files.js の prepareFiles)
    if (!F) prepared = V.prepareView(text);
    rec.views = {};
    for (const [v, fn, cands] of VIEWS) {
      const list = prepared[cands] ?? [];
      const r = { list: list.map((c) => `${c.id}|${c.kind}|${c.label}`), cands: {} };
      for (const c of list) {
        try {
          const x = V[fn](prepared, c.id);
          r.cands[c.id] = `${sha(x.svg)}|${sha(norm(x.structure))}|${sha(JSON.stringify((x.diagnostics ?? []).map((d) => [d.level, d.code, d.message, d.start, d.end])))}|${v === 'grid' ? sha(JSON.stringify(x.tables ?? null)) : ''}`;
        } catch (e) { r.cands[c.id] = `例外 ${String(e?.message ?? e).slice(0, 200)}`; }
      }
      rec.views[v] = r;
    }
    // 図からの編集
    const analysis = { ok: true, tree: a.tree, model: a.model, semantic: a.semantic };
    const res = (r) => r.ok ? `ok ${sha(r.text)}` : `${r.reverted ? '戻した' : '拒否'} ${r.code ?? ''} ${r.reason} ${(r.details ?? []).join(' / ')}`;
    const ed = [];
    const walk = (fn) => { const list = []; (function w(e) { if (fn(e)) list.push(e); e.owned.forEach(w); e.related.forEach(w); })(a.tree); return list; };
    const named = walk((e) => e.name !== undefined && e.end > e.start);
    for (let i = 0; i < named.length; i += IV.rename) {
      const el = named[i];
      for (const nn of ['Gr20Name', '改名 の名前']) {
        try { ed.push(`rename ${pos.get(el)} ${nn}: ${res(E.renameElement({ text, analysis, element: el, which: 'name', newName: nn }))}`); }
        catch (e) { ed.push(`rename ${pos.get(el)} ${nn}: 例外 ${e?.message}`); }
      }
    }
    const owners = walk((e) => A.isPartOwner(a.model, e));
    for (let i = 0; i < owners.length; i += IV.add) {
      const el = owners[i];
      try { ed.push(`addPart ${pos.get(el)}: ${res(A.addPart({ text, analysis, owner: el, name: 'gr20Part', type: null }))}`); } catch (e) { ed.push(`addPart ${pos.get(el)}: 例外 ${e?.message}`); }
      try { ed.push(`addPort ${pos.get(el)}: ${res(A.addPort({ text, analysis, owner: el, name: 'gr20Port', type: null, direction: '' }))}`); } catch (e) { ed.push(`addPort ${pos.get(el)}: 例外 ${e?.message}`); }
    }
    const decl = X.declaredElements({ analysis, text });
    for (let i = 0; i < decl.length; i += IV.del) {
      const el = decl[i];
      try { ed.push(`delete ${pos.get(el)}: ${res(X.deleteElement({ text, analysis, element: el }))}`); } catch (e) { ed.push(`delete ${pos.get(el)}: 例外 ${e?.message}`); }
    }
    // view の書き足しは、画面の Worker と同じく、描く準備の構文木と名前解決(範囲の要素の木)を渡す
    const analysisV = { ok: true, tree: prepared.ctx.tree, model: prepared.ctx.model };
    for (const [v, , cands] of VIEWS) {
      const list = (prepared[cands] ?? []).filter((c) => c.kind !== 'view');
      for (let i = 0; i < list.length; i += IV.view) {
        try { ed.push(`view ${v} ${list[i].id}: ${res(VW.appendView({ text, analysis: analysisV, scope: list[i].el, view: v }))}`); } catch (e) { ed.push(`view ${v} ${list[i].id}: 例外 ${e?.message}`); }
      }
    }
    rec.edits = ed;
    rec.ms = Math.round(performance.now() - t0);
  }
  fs.writeFileSync(outFile, JSON.stringify(out));
}

if (args[0] === 'shard') {
  await dumpShard(args[1], args[2], +args[3], +args[4], args[5] === 'files' ? 'files' : null);
} else if (args[0] === 'dump') {
  const outDir = args[1];
  const srcDir = path.resolve(opt('--src', 'src'));
  const jobs = +opt('--jobs', 12);
  const via = opt('--via', '');
  fs.mkdirSync(path.join(outDir, 'shards'), { recursive: true });
  const t0 = performance.now();
  const load0 = fs.readFileSync('/proc/loadavg', 'utf8').split(' ').slice(0, 3).join(' ');
  const codes = await Promise.all([...Array(jobs).keys()].map((k) => new Promise((res) => {
    const p = spawn(process.execPath, [new URL(import.meta.url).pathname, 'shard', path.join(outDir, 'shards', `${k}.json`), srcDir, String(k), String(jobs), via], { stdio: ['ignore', 'inherit', 'inherit'] });
    p.on('exit', (c) => res(c));
  })));
  if (codes.some((c) => c !== 0)) { console.error(`子のプロセスの終了コード ${codes.join(',')}`); process.exit(1); }
  const all = {};
  for (let k = 0; k < jobs; k++) Object.assign(all, JSON.parse(fs.readFileSync(path.join(outDir, 'shards', `${k}.json`), 'utf8')));
  const ordered = {};
  for (const f of INPUTS()) ordered[f] = all[f];
  fs.writeFileSync(path.join(outDir, 'dump.json'), JSON.stringify(ordered));
  fs.rmSync(path.join(outDir, 'shards'), { recursive: true });
  const n = (k) => Object.values(ordered).reduce((s, r) => s + (r.ok ? (k(r) ?? 0) : 0), 0);
  const summary = { src: srcDir, via: via || 'text', inputs: Object.keys(ordered).length, parsed: Object.values(ordered).filter((r) => r.ok).length,
    refs: n((r) => r.refs.length), semantic: n((r) => r.sem.length), warnings: n((r) => r.warn.length),
    candidates: n((r) => Object.values(r.views).reduce((s, v) => s + v.list.length, 0)), edits: n((r) => r.edits.length),
    editsOk: n((r) => r.edits.filter((x) => / ok [0-9a-f]{40}$/.test(x)).length), editsReverted: n((r) => r.edits.filter((x) => /: 戻した /.test(x)).length),
    editsException: n((r) => r.edits.filter((x) => /: 例外 /.test(x)).length), renderExceptions: n((r) => Object.values(r.views).reduce((s, v) => s + Object.values(v.cands).filter((x) => x.startsWith('例外')).length, 0)),
    seconds: +((performance.now() - t0) / 1000).toFixed(1), jobs, load0 };
  fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 1) + '\n');
  console.log(JSON.stringify(summary));
} else if (args[0] === 'diff') {
  const A = JSON.parse(fs.readFileSync(path.join(args[1], 'dump.json'), 'utf8'));
  const B = JSON.parse(fs.readFileSync(path.join(args[2], 'dump.json'), 'utf8'));
  const res = { inputs: 0, compared: { refs: 0, semantic: 0, warnings: 0, candidateLists: 0, candidates: 0, edits: 0 }, differences: 0, byKind: {}, examples: [] };
  const diff = (kind, f, detail) => { res.differences++; res.byKind[kind] = (res.byKind[kind] ?? 0) + 1; if (res.examples.length < 40) res.examples.push({ kind, file: f, detail }); };
  const cmpList = (kind, f, a, b) => {
    const n = Math.max(a.length, b.length);
    for (let i = 0; i < n; i++) if (a[i] !== b[i]) { diff(kind, f, { i, before: a[i] ?? null, after: b[i] ?? null }); return; }
  };
  for (const f of new Set([...Object.keys(A), ...Object.keys(B)])) {
    res.inputs++;
    const a = A[f], b = B[f];
    if (!a || !b || a.ok !== b.ok) { diff('受理', f, { before: a?.ok, after: b?.ok }); continue; }
    if (!a.ok) continue;
    res.compared.refs += a.refs.length; cmpList('参照', f, a.refs, b.refs);
    res.compared.semantic += a.sem.length; cmpList('意味エラー', f, a.sem, b.sem);
    res.compared.warnings += a.warn.length; cmpList('警告', f, a.warn, b.warn);
    for (const v of Object.keys(a.views)) {
      const va = a.views[v], vb = b.views[v];
      res.compared.candidateLists++;
      if (!vb) { diff('ビュー', f, { v }); continue; }
      cmpList(`候補の並び(${v})`, f, va.list, vb.list);
      for (const [c, x] of Object.entries(va.cands)) { res.compared.candidates++; if (vb.cands[c] !== x) diff(`描画(${v})`, f, { c, before: x, after: vb.cands[c] ?? null }); }
    }
    res.compared.edits += a.edits.length; cmpList('編集', f, a.edits, b.edits);
  }
  console.log(JSON.stringify(res, null, 1));
  process.exit(res.differences ? 1 : 0);
} else {
  console.error('使い方: dump <出力> [--src] [--jobs] [--via files] | diff <前> <後>');
  process.exit(2);
}
