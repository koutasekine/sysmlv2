// GR20 の M: フォルダ(ファイルの並び)ごとに、このアプリの意味エラーと、パイロット実装の検証の結果を、設計書 10 章の意味エラーと同じ方法で
// 照合する(GR20 指示書 4 章の M(例題)・M(最小の入力))。
//
// 使い方:
//   node tools/model/gr20_folder_semantic.mjs [--folders out/GR20/folders.json] [--group examples|cases] [--pilot out/GR20/pilot] [--out out/GR20/compare/semantic]
//
// このアプリは、フォルダのファイルをまとめて 1 つのモデルとして解析する(src/model/files.js の analyzeFiles)。パイロット実装の結果は
// tools/model/gr20_folders.mjs の pilot が書いたもの(フォルダのファイルをまとめて読み込み、標準ライブラリも読み込ませたもの。
// <pilot>/validate/<番号>/files/<相対パス>.json と <pilot>/resolve/<番号>/…)。
// 突き合わせと分類は tools/semantic/compare.mjs(1 つのファイルの照合)と同じ: 項目が同じで、原文の範囲の始まりか終わりが同じものを
// 同じとする。パイロット実装の側は tools/semantic/pilot_items.mjs で項目に振り分ける。分類の規則(pilotOnlyReason・oursOnlyReason など)は
// compare.mjs のものを写し、位置をファイルをつないだテキストの中の位置にそろえて使う(compare.mjs は 1 つのファイルの照合のための台本で、
// 関数を取り出して使えないため)。誤検出('false-positive')と説明できないもの('unexplained')を数える。
import fs from 'node:fs';
import path from 'node:path';
import { decodeUtf8 } from '../../src/parser/index.js';
import { analyzeFiles } from '../../src/model/index.js';
import { lineColOf } from '../../src/model/semantic.js';
import { ITEMS, pilotItems } from '../semantic/pilot_items.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
process.chdir(ROOT);
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const folders = JSON.parse(fs.readFileSync(opt('--folders', 'out/GR20/folders.json'), 'utf8'));
const onlyGroup = opt('--group', null);
const pilotDir = opt('--pilot', 'out/GR20/pilot');
const outDir = opt('--out', 'out/GR20/compare/semantic');
fs.rmSync(path.join(outDir, 'files'), { recursive: true, force: true });
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };

const totals = { folders: 0, files: 0, match: {}, pilotOnly: {}, oursOnly: {}, uncomparable: 0, reasons: {}, oursOnlyReasons: {}, falsePositive: 0, unexplained: 0, exceptions: 0 };
for (const k of ITEMS) { totals.match[k] = 0; totals.pilotOnly[k] = 0; totals.oursOnly[k] = 0; }
const examples = { unexplained: [], falsePositive: [], reasons: {} };
const perFolder = [];

folders.forEach((g, gi) => {
  if (onlyGroup && g.group !== onlyGroup) return;
  const list = g.files.map((f) => ({ path: f.slice(g.dir.length + 1), text: decodeUtf8(fs.readFileSync(f)) }));
  const fr = { name: g.name, group: g.group, files: list.length, match: 0, pilotOnly: 0, oursOnly: 0, falsePositive: 0, unexplained: 0 };
  let a;
  try { a = analyzeFiles(list); } catch (e) { totals.exceptions++; fr.exception = String(e?.stack ?? e); perFolder.push(fr); return; }
  totals.folders++;
  const model = a.model;
  const parent = new Map(), byStart = new Map();
  for (const f of a.files) if (f.root) (function walk(e, pa) { parent.set(e, pa); if (!byStart.has(e.start)) byStart.set(e.start, []); byStart.get(e.start).push(e); for (const c of e.owned) walk(c, e); for (const c of e.related) walk(c, e); })(f.root, null);
  const refAt = (it) => model?.refs.find((r) => r.start === it.offset && r.end === it.offset + it.length) ?? model?.refs.find((r) => r.end === it.offset + it.length) ?? null;
  a.files.forEach((f, k) => {
    totals.files++;
    const rec = { file: `${g.name}/${f.path}`, match: [], pilotOnly: [], oursOnly: [], uncomparable: [] };
    const pj = readJson(path.join(pilotDir, 'validate', String(gi), 'files', f.path + '.json'));
    const prRaw = readJson(path.join(pilotDir, 'resolve', String(gi), 'files', f.path + '.json'));
    const pr = prRaw ? { ...prRaw, refs: (prRaw.refs ?? []).map((r) => ({ ...r, offset: r.offset + f.base })) } : null;
    const pilotSyntax = (pj?.issues ?? []).some((i) => i.code === 'org.eclipse.xtext.diagnostics.Diagnostic.Syntax');
    const pitems = (pj ? pilotItems(pj) : []).map((it) => ({ ...it, offset: it.offset + f.base }));
    const ours = (a.semantic ?? []).filter((x) => x.file === k);
    const used = new Set();
    const sameRange = (o, it) => o.item === it.item && (o.start === it.offset || o.end === it.offset + it.length);
    const c = { ok: f.ok, pilotSyntax, model, refAt, byStart, parent, pr };
    for (const it of pitems) {
      const o = ours.find((x, i) => !used.has(i) && sameRange(x, it));
      const lc = lineColOf(f.text, it.offset - f.base);
      const entry = { item: it.item, start: it.offset - f.base, end: it.offset - f.base + it.length, ...lc, text: a.text.slice(it.offset, it.offset + it.length).slice(0, 80) };
      if (it.item === 'T1') { rec.uncomparable.push(entry); continue; }
      if (o) { used.add(ours.indexOf(o)); rec.match.push(entry); totals.match[it.item]++; fr.match++; continue; }
      const reason = model ? pilotOnlyReason(it, c) : 'parse-rejected';
      entry.reason = reason;
      rec.pilotOnly.push(entry);
      totals.pilotOnly[it.item]++; fr.pilotOnly++;
      totals.reasons[reason] = (totals.reasons[reason] ?? 0) + 1;
      if (reason === 'unexplained') { totals.unexplained++; fr.unexplained++; if (examples.unexplained.length < 20) examples.unexplained.push({ file: rec.file, ...entry }); }
      else if ((examples.reasons[reason] ??= []).length < 3) examples.reasons[reason].push({ file: rec.file, ...entry });
    }
    ours.forEach((o, i) => {
      if (used.has(i)) return;
      const entry = { item: o.item, start: o.start - f.base, end: o.end - f.base, line: o.line, col: o.col, text: a.text.slice(o.start, o.end).slice(0, 80), message: o.message };
      if (o.item === 'T1') { rec.uncomparable.push(entry); totals.uncomparable++; return; }
      const reason = oursOnlyReason(o, c);
      entry.reason = reason;
      rec.oursOnly.push(entry);
      totals.oursOnly[o.item]++; fr.oursOnly++;
      totals.oursOnlyReasons[reason] = (totals.oursOnlyReasons[reason] ?? 0) + 1;
      if (reason === 'false-positive') { totals.falsePositive++; fr.falsePositive++; if (examples.falsePositive.length < 20) examples.falsePositive.push({ file: rec.file, ...entry }); }
    });
    const dest = path.join(outDir, 'files', rec.file + '.json');
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, JSON.stringify(rec, null, 1) + '\n');
  });
  perFolder.push(fr);
});

const summary = { ...totals, perFolder, examples };
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 1) + '\n');
const sum = (o) => Object.values(o).reduce((x, y) => x + y, 0);
console.log(`folders=${totals.folders} files=${totals.files} exceptions=${totals.exceptions} match=${sum(totals.match)} pilotOnly=${sum(totals.pilotOnly)} oursOnly=${sum(totals.oursOnly)} uncomparable=${totals.uncomparable} falsePositive=${totals.falsePositive} unexplained=${totals.unexplained}`);
console.log('match', JSON.stringify(totals.match));
console.log('pilotOnly', JSON.stringify(totals.pilotOnly));
console.log('oursOnly', JSON.stringify(totals.oursOnly));
console.log('reasons', JSON.stringify(totals.reasons));
console.log('oursOnlyReasons', JSON.stringify(totals.oursOnlyReasons));
process.exit(totals.exceptions ? 1 : 0);

// ---- 以下は tools/semantic/compare.mjs の同じ名前の関数を写したもの(位置はファイルをつないだテキストの中の位置)
function pilotOnlyReason(it, c) {
  if (!c.ok) return 'parse-rejected';
  if (c.pilotSyntax) return 'pilot-syntax';
  const { model } = c;
  const conforms = model.conforms;
  if (it.item === 'S1' || it.item === 'S3') {
    const r = c.refAt(it);
    if (!r) return 'unexplained';
    if (r.status === 'ambiguous') return it.item === 'S1' ? 'S1:ambiguous' : 'unexplained';
    if (r.status === 'resolved') return it.item === 'S1' ? 'S1:resolved-known' : 'unexplained';
    if (it.item === 'S3') return 'S3:library-namespace';
    const i = r.segments.findIndex((s) => !s.target);
    if (r.reason === 'not-found' && i === 0 && !isChainOrVisible(r, c)) return 'S1:global';
    if (r.reason === 'not-found') return 'S1:library-namespace';
    if (r.reason === 'not-found-known') return model.searchShadowOf(r) ? 'S1:shadow' : 'S1:library-namespace';
    if (r.reason === 'redefinition-implicit-only') return 'S1:redefinition-implicit-only';
    if (r.reason === 'redefinition-not-found') return 'S1:redefinition-not-found';
    if (r.reason === 'chain-previous') return 'S1:chain-previous';
    if (r.reason === 'chain-source') return 'S1:chain-source';
    if (r.reason === 'not-namespace') return 'S1:library-namespace';
    return 'unexplained';
  }
  if (it.item === 'S2') {
    const el = (c.byStart.get(it.offset) ?? []).find((e) => conforms(e.kind, 'Element') && !conforms(e.kind, 'Relationship'));
    if (!el) return 'unexplained';
    let ns = c.parent.get(el); while (ns && !conforms(ns.kind, 'Namespace')) ns = c.parent.get(ns);
    if (!ns) return 'unexplained';
    const n = model.namesOf(el);
    const ms = model.ownedAndInheritedMembershipsOf(ns).members.filter((m) => m.element !== el && ((n.name != null && (m.name === n.name || m.shortName === n.name)) || (n.shortName != null && (m.name === n.shortName || m.shortName === n.shortName))));
    if (ms.length && ms.every((m) => !(conforms(m.element.kind, el.kind) || conforms(el.kind, m.element.kind)))) return 'S2:kinds';
    if (!ms.length || ms.every((m) => m.element.builtin)) return 'S2:library-inherited';
    return 'unexplained';
  }
  if (it.item === 'T2' || it.item === 'T3') {
    const rd = (c.byStart.get(it.offset) ?? []).find((e) => conforms(e.kind, 'Redefinition'));
    const f = rd ? c.parent.get(rd) : (c.byStart.get(it.offset) ?? []).find((e) => conforms(e.kind, 'Feature'));
    if (rd) {
      const r = model.refs.find((x) => x.node === rd);
      if (!r || r.status !== 'resolved' || r.target.builtin) return it.item + ':library-redefined';
    }
    if (it.item === 'T2' && f) {
      let O = c.parent.get(f); O = O ? c.parent.get(O) : null;
      if (O && hasUnknownPath(O, model, new Set())) return 'T2:unchecked-path';
    }
    if (it.item === 'T3' && !rd) return 'T3:library-redefined';
    return 'unexplained';
  }
  if (it.item === 'U5') {
    if (it.object?.type && /Succession/.test(it.object.type)) return 'U5:succession';
    if (it.object?.type === 'TransitionUsage') return 'U5:unresolved-ends';
    return 'unexplained';
  }
  return 'unexplained';
}
function isChainOrVisible(r, c) {
  if (r.node.kind === 'FeatureChaining') {
    const chain = c.parent.get(r.node);
    const list = chain ? chain.owned.filter((x) => x.kind === 'FeatureChaining') : [];
    if (list.indexOf(r.node) > 0) return true;
  }
  const owner = c.parent.get(r.node);
  if (owner && c.model.conforms(owner.kind, 'FeatureChainExpression')) return true;
  return false;
}
function hasUnknownPath(t, model, seen) {
  if (!t || t.builtin || seen.has(t)) return false;
  seen.add(t);
  for (const s of model.generalTypesOf(t)) {
    if (s === null) return true;
    if (hasUnknownPath(s, model, seen)) return true;
  }
  return false;
}
function oursOnlyReason(o, c) {
  if (o.item === 'S3') {
    const r = (c.pr?.refs ?? []).find((x) => x.offset === o.start || x.offset + x.length === o.end);
    const t = r?.target;
    if (t && (t.local || t.library || t.implicit)) {
      const ours = c.model.refs.find((x) => x.start === o.start && x.end === o.end);
      const pk = (t.local ?? t.library ?? t.implicit).type;
      if (ours && ours.kindMismatch && c.model.conforms(pk, ours.kindMismatch)) return 'S3:spec';
    }
    return 'false-positive';
  }
  if (o.item === 'U5') {
    const tu = (c.byStart.get(o.start) ?? []).find((e) => c.model.conforms(e.kind, 'TransitionUsage'));
    const rel = tu ? c.parent.get(tu) : null;
    const owner = rel ? c.parent.get(rel) : null;
    if (tu && !(owner && c.model.conforms(owner.kind, 'StateUsage') && owner.attrs.isParallel === true)) return 'U5:spec';
    return 'false-positive';
  }
  return 'false-positive';
}
