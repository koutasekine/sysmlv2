// このアプリの意味エラーと、パイロット実装の検証の結果(PilotValidate の出力)を、項目ごとに照合する(GR5 指示書 7 章)。
//
// 使い方:
//   node tools/semantic/compare.mjs [--set files309 | cases] [--out out/compare/semantic]
//     files309: out/files309.txt の 309 ファイル。パイロット実装の結果は out/pilot/validate、解決先は out/pilot/resolve
//     cases:    tests/semantic/cases の最小の入力。パイロット実装の結果は out/pilot/validate_cases、解決先は out/pilot/resolve_cases
//
// 突き合わせ: 項目が同じで、原文の範囲の始まりか終わりが同じものを同じとする(GR3 の照合と同じく、範囲で突き合わせる)。
// パイロット実装の側は pilot_items.mjs で項目に振り分ける。T1 は照合できない項目(GR5 P2 の裁定)として別に数える。
// 分類:
//   match       両方が出した
//   pilotOnly   パイロット実装だけ。理由(reason)ごとに分ける。理由がわからないものは 'unexplained'
//   oursOnly    このアプリだけ。本文どおりの差(S3: 裁定 Q2、U5: 裁定 Q4)は理由を付ける。それ以外は誤検出('false-positive')
//   uncomparable T1(照合できない項目)
// 出力: <out>/<set>/files/<ファイル>.json と <out>/<set>/summary.json。
// あわせて、PilotValidate の S1・S3 の見分けの限界(再定義の名前の探し直しが、パイロット実装の再定義の探し方にならない。
// GR5 P1 の報告 3.1 節)が照合に影響する件数を数える(redefinitionLookup)。

import fs from 'node:fs';
import path from 'node:path';
import { parse, decodeUtf8 } from '../../src/parser/index.js';
import { resolveNames } from '../../src/model/index.js';
import { checkSemantics } from '../../src/model/semantic.js';
import { ITEMS, pilotItems } from './pilot_items.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
process.chdir(ROOT);
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const set = opt('--set', 'files309');
const outRoot = opt('--out', 'out/compare/semantic');
const CFG = set === 'cases'
  ? { files: fs.readdirSync('tests/semantic/cases').filter(f => f.endsWith('.sysml')).sort().map(f => 'tests/semantic/cases/' + f), base: 'tests/semantic/cases/', validate: 'out/pilot/validate_cases', resolve: 'out/pilot/resolve_cases' }
  : { files: fs.readFileSync('out/files309.txt', 'utf8').split('\n').filter(Boolean), base: 'vendor/release-2026-03/', validate: 'out/pilot/validate', resolve: 'out/pilot/resolve' };
const outDir = path.join(outRoot, set);
fs.rmSync(path.join(outDir, 'files'), { recursive: true, force: true });

// パイロット実装だけのものの理由(このアプリが出さない理由)。設計書 9.2 節・P1 の対応表・P2〜P3 の裁定による
const REASONS = {
  'parse-rejected': 'このアプリが構文エラーにするファイル(GR2 で記録した既知の差)。意味エラーは検査しない',
  'pilot-syntax': 'パイロット実装の構文エラーの後の結果(設計書 2.5 節の ExpressionBody の差。T1 の入力)',
  'S1:global': 'S1: 名前が、大域の名前空間(標準ライブラリの最上位の名前を含む)まで探して見つからない。判定しない(裁定 Q6)',
  'S1:library-namespace': 'S1: 名前が、暗黙の特殊化・対象のわからない import・評価できないフィルター条件を持つ名前空間か、内蔵する表の名前空間で見つからない。判定しない(設計書 9.2 節)',
  'S1:redefinition-implicit-only': 'S1: 再定義の名前で、上位の型が暗黙の特殊化だけ(設計書 6.2 節で未検査)。判定しない',
  'S1:redefinition-not-found': 'S1: 再定義の名前で、利用者の上位の型にも外側にも見つからない(上位の型と外側が暗黙の特殊化を持つ)。判定しない',
  'S1:chain-previous': 'S1: 特徴の連鎖の前の区切りが未検査なので、この区切りは探せない',
  'S1:chain-source': 'S1: 式の結果から先の名前で、元の特徴が求まらない(設計書 6.2 節で未検査)',
  'S1:shadow': 'S1: 修飾名の前の区切りを、暗黙の特殊化などを持つ名前空間を通り越して見つけた。判定しない',
  'S1:ambiguous': 'S1: このアプリでは曖昧(設計書 6.2 節)。S1 にしない',
  'S1:resolved-known': 'S1: このアプリは解決する(設計書 2.5 節の既知の差、または名前解決の照合で説明済みの差)',
  'S2:kinds': 'S2: 名前は同じだが要素の種類が互いに適合しないので、本文では区別できる(パイロット実装は種類で区別しない)',
  'S2:library-inherited': 'S2: 標準ライブラリから受け継いだメンバーとの比べ。判定しない(設計書 9.2 節)',
  'S3:library-namespace': 'S3: このアプリは未検査(標準ライブラリがないと判定しない)',
  'T2:unchecked-path': 'T2: directionOf のたどる経路に未検査の要素がある。判定しない(設計書 9.2 節)',
  'T2:library-redefined': 'T2: 再定義される特徴が標準ライブラリの特徴か未検査。判定しない',
  'T3:library-redefined': 'T3: 再定義される端が標準ライブラリの特徴か未検査。判定しない',
  'U5:succession': 'U5: パイロット実装は並行状態の中の継承(succession)も数える(本文は遷移だけ。P1 の対応表で「広い」)',
  'U5:unresolved-ends': 'U5: パイロット実装は並行状態が所有する遷移を、始点・終点を見ずに数える。このアプリは始点・終点が解決済みのものだけで判定する',
};
const OURS_ONLY = {
  'S3:spec': 'S3: 本文どおりの差。パイロット実装は種類の合わない要素を飛ばして外側の要素に解決する(裁定 Q2)',
  'U5:spec': 'U5: 本文どおりの差。並行状態の外が所有する遷移も数える。パイロット実装は数えない(裁定 Q4)',
};

const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };
const totals = { match: {}, pilotOnly: {}, oursOnly: {}, uncomparable: 0, reasons: {}, oursOnlyReasons: {}, falsePositive: 0, unexplained: 0 };
for (const k of ITEMS) { totals.match[k] = 0; totals.pilotOnly[k] = 0; totals.oursOnly[k] = 0; }
const examples = { unexplained: [], falsePositive: [], oursOnlyReasons: {}, s2Official: [] };
const redefinitionLookup = { pilotUnresolvedRedefinitions: 0, anyTypeNull: 0, anyTypeFound: 0, coincideWithOursS1S3: 0 };
let s2Official = 0;
let filesDone = 0, exceptions = 0;

for (const f of CFG.files) {
  const rel = f.startsWith(CFG.base) ? f.slice(CFG.base.length) : path.basename(f);
  const pj = readJson(path.join(CFG.validate, 'files', rel + '.json'));
  const pr = readJson(path.join(CFG.resolve, 'files', rel + '.json'));
  const rec = { file: rel, match: [], pilotOnly: [], oursOnly: [], uncomparable: [], exception: null };
  try {
    const text = decodeUtf8(fs.readFileSync(f));
    const p = parse(text);
    const pilotSyntax = (pj?.issues ?? []).some(i => i.code === 'org.eclipse.xtext.diagnostics.Diagnostic.Syntax');
    const pitems = pj ? pilotItems(pj) : [];
    for (const u of pj?.unresolved ?? []) {
      if (u.source !== 'Redefinition' || u.feature !== 'redefinedFeature') continue;
      redefinitionLookup.pilotUnresolvedRedefinitions++;
      if (u.anyType) redefinitionLookup.anyTypeFound++; else redefinitionLookup.anyTypeNull++;
    }
    let ours = [], model = null, tree = null;
    if (p.ok) { tree = p.tree; model = resolveNames(tree, text); ours = checkSemantics(tree, model, text); }
    const used = new Set();
    const sameRange = (o, it) => o.item === it.item && (o.start === it.offset || o.end === it.offset + it.length);
    // 構文木の要素の索引(理由を求めるのに使う)
    const parent = new Map(), byStart = new Map();
    if (tree) (function walk(e, pa) { parent.set(e, pa); if (!byStart.has(e.start)) byStart.set(e.start, []); byStart.get(e.start).push(e); for (const c of e.owned) walk(c, e); for (const c of e.related) walk(c, e); })(tree, null);
    const refAt = (it) => model?.refs.find(r => r.start === it.offset && r.end === it.offset + it.length) ?? model?.refs.find(r => r.end === it.offset + it.length) ?? null;

    for (const it of pitems) {
      const o = ours.find((x, i) => !used.has(i) && sameRange(x, it));
      const lc = lineColOf(text, it.offset);
      const entry = { item: it.item, start: it.offset, end: it.offset + it.length, ...lc, text: text.slice(it.offset, it.offset + it.length).slice(0, 80) };
      if (it.item === 'T1') { rec.uncomparable.push(entry); continue; }
      if (o) { used.add(ours.indexOf(o)); rec.match.push(entry); totals.match[it.item]++; continue; }
      const reason = pilotOnlyReason(it, { ok: p.ok, pilotSyntax, model, refAt, byStart, parent, text });
      entry.reason = reason;
      rec.pilotOnly.push(entry);
      totals.pilotOnly[it.item]++;
      totals.reasons[reason] = (totals.reasons[reason] ?? 0) + 1;
      if (reason === 'unexplained') { totals.unexplained++; if (examples.unexplained.length < 20) examples.unexplained.push({ file: rel, ...entry }); }
      if (it.item === 'S2' && set === 'files309' && rel.startsWith('sysml/src/')) { s2Official++; if (examples.s2Official.length < 10) examples.s2Official.push({ file: rel, ...entry }); }
    }
    ours.forEach((o, i) => {
      if (used.has(i)) return;
      const entry = { item: o.item, start: o.start, end: o.end, line: o.line, col: o.col, text: text.slice(o.start, o.end).slice(0, 80), message: o.message };
      if (o.item === 'T1') { rec.uncomparable.push(entry); totals.uncomparable++; return; }
      // パイロット実装の S1・S3 の見分けの限界: このアプリの S1・S3 が、パイロット実装の再定義の名前の解決の失敗と重なるか
      if ((o.item === 'S1' || o.item === 'S3') && (pj?.unresolved ?? []).some(u => u.source === 'Redefinition' && (u.offset === o.start || u.offset + u.length === o.end))) redefinitionLookup.coincideWithOursS1S3++;
      const reason = oursOnlyReason(o, { pr, model, byStart, parent });
      entry.reason = reason;
      rec.oursOnly.push(entry);
      totals.oursOnly[o.item]++;
      totals.oursOnlyReasons[reason] = (totals.oursOnlyReasons[reason] ?? 0) + 1;
      if (reason === 'false-positive') { totals.falsePositive++; if (examples.falsePositive.length < 20) examples.falsePositive.push({ file: rel, ...entry }); }
      else { (examples.oursOnlyReasons[reason] ??= []).length < 5 && examples.oursOnlyReasons[reason].push({ file: rel, ...entry }); }
    });
    // ファイルにパイロット実装の構文エラーがあり、このアプリの T1 がないとき、パイロット実装の側にも T1 はない(照合できない)
    filesDone++;
  } catch (e) {
    rec.exception = String(e?.stack ?? e);
    exceptions++;
  }
  const dest = path.join(outDir, 'files', rel + '.json');
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, JSON.stringify(rec, null, 1) + '\n');
}

const summary = { set, files: CFG.files.length, filesDone, exceptions, ...totals, reasonText: REASONS, oursOnlyReasonText: OURS_ONLY, s2Official, redefinitionLookup, examples };
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 1) + '\n');
const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
console.log(`set=${set} files=${CFG.files.length} exceptions=${exceptions} match=${sum(totals.match)} pilotOnly=${sum(totals.pilotOnly)} oursOnly=${sum(totals.oursOnly)} uncomparable=${totals.uncomparable} falsePositive=${totals.falsePositive} unexplained=${totals.unexplained} s2Official=${s2Official}`);
console.log('match', JSON.stringify(totals.match));
console.log('pilotOnly', JSON.stringify(totals.pilotOnly));
console.log('oursOnly', JSON.stringify(totals.oursOnly));
console.log('reasons', JSON.stringify(totals.reasons));
console.log('oursOnlyReasons', JSON.stringify(totals.oursOnlyReasons));
console.log('redefinitionLookup', JSON.stringify(redefinitionLookup));

// ---- パイロット実装だけのものの理由
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
    const i = r.segments.findIndex(s => !s.target);
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
    // パイロット実装が警告した要素と同じ範囲の、このアプリの要素
    const el = (c.byStart.get(it.offset) ?? []).find(e => conforms(e.kind, 'Element') && !conforms(e.kind, 'Relationship'));
    if (!el) return 'unexplained';
    let ns = c.parent.get(el); while (ns && !conforms(ns.kind, 'Namespace')) ns = c.parent.get(ns);
    if (!ns) return 'unexplained';
    const n = model.namesOf(el);
    const ms = model.ownedAndInheritedMembershipsOf(ns).members.filter(m => m.element !== el && ((n.name != null && (m.name === n.name || m.shortName === n.name)) || (n.shortName != null && (m.name === n.shortName || m.shortName === n.shortName))));
    if (ms.length && ms.every(m => !(conforms(m.element.kind, el.kind) || conforms(el.kind, m.element.kind)))) return 'S2:kinds';
    if (!ms.length || ms.every(m => m.element.builtin)) return 'S2:library-inherited';
    return 'unexplained';
  }
  if (it.item === 'T2' || it.item === 'T3') {
    const rd = (c.byStart.get(it.offset) ?? []).find(e => conforms(e.kind, 'Redefinition'));
    const f = rd ? c.parent.get(rd) : (c.byStart.get(it.offset) ?? []).find(e => conforms(e.kind, 'Feature'));
    if (rd) {
      const r = model.refs.find(x => x.node === rd);
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
// 最初の区切りを、完全な解決でなく見える解決で探す参照(連鎖の 2 番目以降・式の結果から先)か
function isChainOrVisible(r, c) {
  if (r.node.kind === 'FeatureChaining') {
    const chain = c.parent.get(r.node);
    const list = chain ? chain.owned.filter(x => x.kind === 'FeatureChaining') : [];
    if (list.indexOf(r.node) > 0) return true;
  }
  const owner = c.parent.get(r.node);
  if (owner && c.model.conforms(owner.kind, 'FeatureChainExpression')) return true;
  return false;
}
// 型 t の directionOf のたどる経路に、上位の型が求まらないものがあるか
function hasUnknownPath(t, model, seen) {
  if (!t || t.builtin || seen.has(t)) return false;
  seen.add(t);
  for (const s of model.generalTypesOf(t)) {
    if (s === null) return true;
    if (hasUnknownPath(s, model, seen)) return true;
  }
  return false;
}

// ---- このアプリだけのものの理由
function oursOnlyReason(o, c) {
  if (o.item === 'S3') {
    // パイロット実装がこの参照を、種類の合う別の要素に解決したか(裁定 Q2)
    const r = (c.pr?.refs ?? []).find(x => x.offset === o.start || x.offset + x.length === o.end);
    const t = r?.target;
    if (t && (t.local || t.library || t.implicit)) {
      const ours = c.model.refs.find(x => x.start === o.start && x.end === o.end);
      const pk = (t.local ?? t.library ?? t.implicit).type;
      if (ours && ours.kindMismatch && c.model.conforms(pk, ours.kindMismatch)) return 'S3:spec';
    }
    return 'false-positive';
  }
  if (o.item === 'U5') {
    // 遷移の持ち主が並行状態でない(並行状態の外が所有する遷移。裁定 Q4)
    const tu = (c.byStart.get(o.start) ?? []).find(e => c.model.conforms(e.kind, 'TransitionUsage'));
    const rel = tu ? c.parent.get(tu) : null;
    const owner = rel ? c.parent.get(rel) : null;
    if (tu && !(owner && c.model.conforms(owner.kind, 'StateUsage') && owner.attrs.isParallel === true)) return 'U5:spec';
    return 'false-positive';
  }
  return 'false-positive';
}

function lineColOf(text, offset) {
  let line = 1, col = 1;
  for (let i = text.charCodeAt(0) === 0xfeff ? 1 : 0; i < offset; i++) {
    const ch = text.charCodeAt(i);
    if (ch === 0x0d) { if (text.charCodeAt(i + 1) === 0x0a) i++; line++; col = 1; }
    else if (ch === 0x0a) { line++; col = 1; }
    else col++;
  }
  return { line, col };
}
