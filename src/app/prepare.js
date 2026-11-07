// 複数のファイルの解析(src/model/files.js の analyzeFiles)から、図を描く準備(src/view/index.js の prepareView と同じ形)を作る
// (GR20 の F。設計書 9.4 節)。DOM を使わない。Worker(src/app/worker.js)と検査の道具が使う。
//
// prepareFromAnalysis(analysis) → prepared
//   { ok, errors, ctx, candidates, stateCandidates, actionCandidates, sequenceCandidates, generalCandidates, tableCandidates }
//   ctx は src/view/common.js の makeContext(analysis.tree, analysis.model, analysis.text)。2 つ以上のファイルなら、tree は
//   すべてのファイルの最上位の関係を並べた仮の根なので、描く範囲の候補は、ファイルの並びの順、ファイルの中は記述の順に並ぶ。
//   構文上正しいファイルが 1 つもなければ ok は false
// prepareFiles(files) → { analysis, prepared }
// folderLabels(candidates, files) → 表示(label)を付け直した候補の並び(GR22 の B1。設計書 9.4 節)
//   フォルダのとき、「範囲」の欄で表示が同じになる候補が 2 つ以上あれば、それらの表示の後ろに「(相対パス)」を付ける。相対パスを
//   付けても同じになるときは「(相対パス 行)」とする。候補の並び・id・要素は変えない。files は analyzeFiles の files
//   ({ path, base, end, text })。候補の位置は、要素の原文の始まり(つないだテキストの中の位置)で決める

import { analyzeFiles } from '../model/files.js';
import { makeContext } from '../view/common.js';
import { listCandidates } from '../view/scope.js';
import { listStateCandidates } from '../view/state.js';
import { listActionCandidates } from '../view/action.js';
import { listSequenceCandidates } from '../view/sequence.js';
import { listGeneralCandidates } from '../view/general.js';
import { listTableCandidates } from '../view/table.js';
import { FIG14 } from '../view/index.js';

export function prepareFromAnalysis(analysis, onProgress = null) {
  if (!analysis.anyOk) return { ok: false, errors: analysis.files.flatMap((f) => f.errors), ctx: null, candidates: [] };
  if (onProgress) onProgress({ stage: 'candidates', done: 0, total: null });
  const ctx = makeContext(analysis.tree, analysis.model, analysis.text);
  return { ok: true, errors: [], ctx, candidates: listCandidates(ctx), stateCandidates: listStateCandidates(ctx), actionCandidates: listActionCandidates(ctx, { ...FIG14 }), sequenceCandidates: listSequenceCandidates(ctx), generalCandidates: listGeneralCandidates(ctx), tableCandidates: listTableCandidates(ctx) };
}

const lineIn = (text, offset) => { let n = 1; for (let i = text.indexOf('\n'); i >= 0 && i < offset; i = text.indexOf('\n', i + 1)) n++; return n; };
export function folderLabels(candidates, files) {
  const count = (xs) => { const m = new Map(); for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1); return m; };
  const same = count(candidates.map((c) => c.label));
  const where = (c) => {
    const at = c.el?.start;
    const f = at == null ? null : files.find((x) => x.base <= at && at <= x.end);
    return f ? { path: f.path, line: lineIn(f.text, at - f.base) } : null;
  };
  const first = candidates.map((c) => { if (same.get(c.label) < 2) return c.label; const w = where(c); return w ? `${c.label}(${w.path})` : c.label; });
  const same2 = count(first);
  return candidates.map((c, i) => {
    if (same.get(c.label) < 2) return c;
    const w = where(c);
    return { ...c, label: w && same2.get(first[i]) >= 2 ? `${c.label}(${w.path} ${w.line})` : first[i] };
  });
}

export function prepareFiles(files, opts = {}) {
  const analysis = analyzeFiles(files, opts);
  return { analysis, prepared: prepareFromAnalysis(analysis, opts.onProgress ?? null) };
}
