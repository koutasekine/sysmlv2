// このアプリの名前解決と、パイロット実装の解決先(tools/pilot-runner/src/PilotResolve.java の出力)を照合する(GR3 指示書 7 章)。
//
// 使い方:
//   node tools/model/compare_resolve.mjs [--list out/files309.txt] [--pilot out/pilot/resolve] [--out out/compare/resolve] [--d3-ascii on|off] [--library on|off]
//   node tools/model/compare_resolve.mjs --folders out/GR20/folders.json [--group examples|cases] --pilot out/GR20/pilot/resolve --out out/GR20/compare/resolve
//   --folders は、フォルダ(ファイルの並び)ごとに照合する(GR20 の M。tools/model/gr20_folders.mjs の list が書く一覧と、pilot が書く
//   パイロット実装の結果 <pilot>/<一覧の番号>/files/<相対パス>.json)。このアプリはフォルダのファイルをまとめて 1 つのモデルとして解析
//   し(src/model/files.js の analyzeFiles)、ファイルごとに、そのファイルの参照をパイロット実装のそのファイルの結果と照合する。位置は
//   ファイルをつないだテキストの中の位置にそろえる(パイロット実装の位置にファイルの始まりを足す)。パイロット実装の解決先が、同じ
//   フォルダのほかのファイルの要素(実行器の「library」の形で、ファイル名がフォルダのファイル)なら、そのファイルの中の、種類と修飾名が
//   同じ要素に読み替えて、このファイルの要素と同じに比べる(読み替えられないものは cross-unmatched として数える)
//   --d3-ascii は、D3 の印の判定(src/model/resolve.js の D3_ASCII_NAMES)をこの実行だけ変える(GR15。省くと既定のまま)
//   --library は、標準ライブラリの索引(src/model/resolve.js の LIBRARY_INDEX)をこの実行だけ変える(GR17。省くと既定のまま)
//
// 参照は原文の位置で突き合わせる。パイロット実装の参照の節点の範囲が、このアプリの参照の範囲と終わりが同じで、
// 始まりが同じか、共役ポートの ~ の分だけ前のものを同じ参照とする。
// 解決先は次のように比べる。
//   利用者のモデルの要素: 要素の範囲の終わりが、パイロット実装の要素の節点の範囲の終わりと同じなら同じ要素
//   内蔵する表の項目: 修飾名が同じなら同じ項目(SysML のメタクラスは、ライブラリの SysML::Systems:: も SysML:: と同じとみなす。
//                     GR3 P2 の報告 3.3.1 節)
//   索引の要素(GR17): 修飾名が同じなら同じ要素(区切りごとに引用符を外して比べる。設計書 10 章)。名前のない索引の要素は、
//                     パイロット実装の解決先の修飾名が「持ち主の修飾名::実効の名前」で、種類が同じなら同じ要素とする
//   共役ポート定義: パイロット実装の ConjugatedPortDefinition の名前が「~ + 元のポート定義の名前」で、位置が元のポート定義の中
// 分類(--out の summary.json と files/*.json):
//   match        一致
//   expected     想定どおり(パイロット実装は標準ライブラリの要素、このアプリは未検査)
//   その他の組み合わせは、classify の規則(下)で分類し、どれにも当たらなければ unexplained

import fs from 'node:fs';
import path from 'node:path';
import { parse, decodeUtf8 } from '../../src/parser/index.js';
import { resolveNames, analyzeFiles } from '../../src/model/index.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
process.chdir(ROOT);
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const foldersPath = opt('--folders', null);
const files = foldersPath ? [] : fs.readFileSync(opt('--list', 'out/files309.txt'), 'utf8').split('\n').filter(Boolean);
const pilotDir = opt('--pilot', 'out/pilot/resolve');
const outDir = opt('--out', 'out/compare/resolve');
const d3lib = opt('--d3-ascii', null);
const libOpt = opt('--library', null);
const ropts = { ...(d3lib === null ? {} : { d3Ascii: d3lib === 'on' }), ...(libOpt === null ? {} : { libraryIndex: libOpt === 'on' }) };
const BASE = 'vendor/release-2026-03/';
fs.mkdirSync(path.join(outDir, 'files'), { recursive: true });

const sum = { files: 0, ours: 0, pilot: 0, paired: 0, oursOnly: 0, pilotOnly: 0, combos: {}, classes: {}, examples: {} };
const bump = (o, k) => { o[k] = (o[k] ?? 0) + 1; };
// 索引の要素の持ち主の修飾名(索引の節点は libParent で持ち主の Membership、その libParent が持ち主)
const libOwnerQ = (t) => { const m = t.libParent; const o = m?.libParent ?? null; return o?.qname ?? null; };

// 修飾名を区切りの名前の列にする(引用符を外す)
const qsplit = (q) => {
  const out = [];
  for (let i = 0; i < q.length;) {
    if (q[i] === "'") { let j = i + 1, s = ''; while (j < q.length && q[j] !== "'") { if (q[j] === '\\') j++; s += q[j]; j++; } out.push(s); i = j + 1; }
    else if (q.startsWith('::', i)) i += 2;
    else { let j = i; while (j < q.length && !q.startsWith('::', j)) j++; out.push(q.slice(i, j)); i = j; }
  }
  return out.join('\u0000');
};
const sameBuiltin = (ours, pilotQ) => {
  if (!pilotQ || !ours) return false;
  if (ours === pilotQ || qsplit(ours) === qsplit(pilotQ)) return true;
  return ours.startsWith('SysML::') && pilotQ === ours.replace(/^SysML::/, 'SysML::Systems::');
};

// ---- 分類(GR3 指示書 7 章の 4 つと、裁定で求められた D2・D5・D6 などの内訳)
// class の値:
//   match                 一致
//   expected              想定どおり(パイロット実装は標準ライブラリの要素、このアプリは未検査)
//   both-unresolved       どちらも解決できない(パイロット実装も解決先がない。例題どうしの参照など)
//   library-name          このアプリは未検査。パイロット実装の解決先はこのファイルの、名前を宣言していない要素で、
//                         その実効の名前は標準ライブラリの特徴の名前から来る(このアプリには名前が分からない)
//   library-specialized   このアプリは内蔵の Actions::Action::start・done、パイロット実装はそれを再定義したライブラリの特徴
//   builtin-in-library    標準ライブラリのファイル自身が、内蔵する表と同じ要素を定義している(Actions.sysml の start・done)
//   D2                    このアプリは曖昧で、パイロット実装の解決先は候補の 1 つ
//   D3                    このアプリは D3 の印付きで外側の要素に解決し、パイロット実装は別の要素
//   D5                    再定義の名前(裁定 D5)。このアプリは未検査、パイロット実装は外側の要素
//   D5-name               このアプリは未検査か別の要素。パイロット実装の解決先は名前を宣言していない要素で、その実効の名前を
//                         決める再定義が D5 の差で解けない
//   D9                    式の結果から先の名前(裁定 D9)。このアプリは未検査
//   chain:<class>         連鎖の前の区切りが <class> の差で未検査
//   U5-value-expr         特徴の値の式の中の名前(GR3 P4 の裁定 1 で既知の差とした)
//   D2-cascade・D5-cascade  D2・D5 の波及(上位の型が曖昧・未検査なので、その中の名前が解けない)
//   library-inherited-cascade・library-shadowed-cascade  library-inherited・library-shadowed の波及(GR17。同じ)
//   pilot-unresolved      パイロット実装だけが解けない(このアプリは解決した)
//   x-payload-type        遷移の受け取りの引数が型を受け継がないことによる差(checkTransitionUsagePayloadSpecialization を入れていない)
//   library-implicit-local  標準ライブラリのファイル自身の中で、暗黙の特殊化の先のメンバーを参照するもの(U7)
//   以下は説明できない差(unexplained)の内訳。原因を調べて名前を付けたもの:
//   x-invocation-type     呼び出し・new の名前付き引数。このアプリは呼び出しの型を上位の型として扱っていない
//   x-builtin-redef       start・done の再定義。このアプリの D5 の実装が、内蔵の上位の型(Actions::Action)を見ていない
//   x-payload-name        遷移の受け取りの引数の名前(SysML 8.3.6.3 ReferenceUsage の namingFeature)を、このアプリが入れていない
//   x-implicit-name       パイロット実装の解決先が、名前を宣言せず、原文にない再定義(ライブラリの特徴への暗黙の再定義)で名前が決まる要素
//   x-pilot-missing       パイロット実装の実行器が、この参照を書き出していない(所有の木からたどれない要素の参照)
//   pilot-duplicate       パイロット実装が同じ参照を 2 回書き出したもの
//   x-cross-unmatched     フォルダ(GR20)で、パイロット実装の解決先(ほかのファイルの要素)を、種類と修飾名からこのアプリの要素に読み替えられない(道具の都合)
//   lib-diff              このアプリは索引の要素(GR17)に解決し、パイロット実装の解決先と違う(L の基準の (2) で 0 件を求める)
//   library-inherited     このアプリは未検査。利用者の名前空間から索引の型が持つ特徴に当たった(GR17)
//   library-shadowed      このアプリは未検査。明示の上位の型が未検査の名前空間を通り越して索引の要素に当たった(GR17)
//   以下は設計書 2.5 節の既知の差(GR21 の K。GR20 では説明できない差として数え、裁定を待っていたもの。件数は変えない):
//   K-private-root        ほかのファイルの根の名前空間の private の要素。このアプリは見えないので未検査、パイロット実装は解決する
//   K-library-root-name   標準ライブラリの根の名前空間と同じ名前の、利用者のファイルの根の要素を指す名前。このアプリは曖昧、
//                         パイロット実装は解決しない
//   K-basetype            利用者のキーワード(意味のメタデータ)の baseType による暗黙の特殊化を経る名前。このアプリは未検査、
//                         パイロット実装は baseType を上位の型として解決する
//   unexplained           説明できない差
function classify(rows, model, rel) {
  const one = (r) => {
    if (r.class) return r.class;
    if (r.pilotOnly) return r.duplicate ? 'pilot-duplicate' : 'unexplained';
    if (r.pilot === 'none') return 'x-pilot-missing';
    // フォルダ(GR20): パイロット実装の解決先がほかのファイルの要素で、種類と修飾名からこのアプリの要素に読み替えられないもの(照合の道具の都合。
    // 名前を宣言せず、標準ライブラリの特徴の再定義から名前を受け継ぐ要素など)
    if (r.pilot?.crossUnmatched) return 'x-cross-unmatched';
    const c = r.combo;
    if (/\/same/.test(c)) return 'match';
    if (r.status === 'resolved' && r.ours?.lib && r.pilot === null) return 'pilot-unresolved';
    if (r.status === 'resolved' && r.ours?.lib) return 'lib-diff';
    // このアプリが、索引の型が持つ特徴に利用者の名前空間から当たった、または明示の上位の型が未検査の名前空間を通り越して索引の要素に
    // 当たったので、未検査にしたもの(GR17 の L。src/model/resolve.js の libTypeFeature と 'library-shadowed' の説明)
    if (r.status === 'unchecked' && (r.reason === 'library-inherited' || r.reason === 'library-shadowed')) return r.reason;
    const p = r.pilot;
    if (r.status === 'unchecked' && p?.library) return 'expected';
    if (r.status === 'unchecked' && p === null) return 'both-unresolved';
    if (r.status === 'ambiguous') {
      if (r.candidates.some(x => x.builtin && !x.lib) && (p?.local || p?.library)) return 'builtin-in-library';
      // 候補が索引の要素で、パイロット実装の解決先がその 1 つ(修飾名で比べる。GR17)
      if (p?.library?.qname && r.candidates.some(x => x.lib && x.q != null && x.q === qsplit(p.library.qname))) return 'D2';
      if (p?.local && r.candidates.some(x => x.end === p.local.offset + p.local.length)) return 'D2';
      // 修飾名の前の区切りが曖昧で、パイロット実装の解決先が候補の 1 つの中の要素(GR20 のフォルダで、2 つのファイルの同じ名前のパッケージ)
      if (p?.local && r.candidates.some(x => x.start != null && x.start <= p.local.offset && p.local.offset + p.local.length <= x.end)) return 'D2';
      // 設計書 2.5 節の既知の差(GR21 の K): 大域で、利用者のファイルの根の要素と、標準ライブラリの根の名前空間(同じ名前)に当たる
      if (p === null && r.reason === 'global' && r.candidates.some(x => x.lib && x.q != null && !x.q.includes('\u0000')) && r.candidates.some(x => !x.lib && !x.builtin && x.rootMember)) return 'K-library-root-name';
      return 'unexplained';
    }
    if (r.status === 'resolved' && r.ours?.builtin && /^Actions::Action::(start|done)$/.test(r.ours.builtin)) {
      if (p?.library && p.library.name === r.ours.builtin.split('::').pop()) return 'library-specialized';
    }
    // 名前を宣言していない要素で、このアプリには実効の名前が分からない
    const a = r.pilotAsOurs;
    if (p?.local && a && a.declaredName === null && a.declaredShortName === null && a.effectiveName === null) {
      const why = nameWhy(a, rows, model);
      if (why) return why;
      return 'x-implicit-name';
    }
    if (r.pilot === undefined && r.kind) return 'x-pilot-missing';
    // パイロット実装だけが解けない(このアプリは解決した)。内訳は報告に書く
    if (r.status === 'resolved' && p === null) return 'pilot-unresolved';
    // 遷移の受け取りの引数の型(checkTransitionUsagePayloadSpecialization、sysml20 L21270)を入れていないことによる差
    if (r.status === 'unchecked' && p?.local) {
      const prev = rows.find(x => x.end === r.start - 1 && x.ours && x.ours.start === x.ours.end && x.ours.kind === 'ReferenceUsage');
      if (prev) return 'x-payload-type';
    }
    // D2・D5 の波及(上位の型)
    if (r.status === 'unchecked' && p?.local && r.cascade) return `${r.cascade}-cascade`;
    // 標準ライブラリのファイル自身の中で、暗黙の特殊化の先(ライブラリの型)のメンバーを参照するもの。パイロット実装の解決先が
    // 「このファイルの要素」になるので「想定どおり」と判定できない(GR3 P4 の U7。2 回目の裁定 2 でライブラリが要る差と認めた)
    if (r.status === 'unchecked' && r.reason === 'not-found' && p?.local && rel.startsWith('sysml.library/') && r.pilotAsOurs?.declaredName != null) return 'library-implicit-local';
    // このアプリは未検査、パイロット実装は長さ 0 の暗黙の要素(ライブラリの特徴への暗黙の再定義で名前が決まる)
    if (r.status === 'unchecked' && p?.local && p.local.length === 0) return 'x-implicit-name';
    if (r.status === 'unchecked' && p?.local) {
      if (/^redefinition-/.test(r.reason) && r.ownerKind && (model.conforms(r.ownerKind, 'InstantiationExpression') || r.ownerKind === 'Feature')) return 'x-invocation-type';
      if (/^redefinition-/.test(r.reason)) return 'D5';
      if (r.reason === 'chain-source') return 'D9';
      if (r.reason === 'chain-previous') {
        // 同じ連鎖の 1 つ前の区切り(「.」をはさんで直前で終わる参照)
        const prev = rows.find(x => x.kind === 'FeatureChaining' && x.end === r.start - 1);
        if (prev && prev !== r) { const pc = one(prev); return pc === 'match' ? 'unexplained' : `chain:${pc.replace(/^chain:/, '')}`; }
      }
    }
    if (r.status === 'resolved' && r.shadow && !/\/same/.test(c)) return 'D3';
    // 特徴の値の式の中の名前: このアプリは値を持つ特徴そのものから探し、パイロット実装はその外側から探す(既知の差。裁定 1)
    if (r.status === 'resolved' && r.inValueExpr && p?.local && !/\/same/.test(c)) return 'U5-value-expr';
    // 設計書 2.5 節の既知の差(GR21 の K)
    if (r.status === 'unchecked' && r.reason === 'not-found' && p?.local && p.cross && r.pilotPrivateRoot) return 'K-private-root';
    if (r.status === 'unchecked' && r.reason === 'not-found' && p?.local && r.baseTypeScope) return 'K-basetype';
    return 'unexplained';
  };
  // 名前を宣言していない要素 a の実効の名前が分からない理由: その要素の最初の再定義の参照を、行から探して分類する
  function nameWhy(a, rows) {
    const redefRow = rows.find(x => x.kind === 'Redefinition' && x.start >= a.start && x.end <= a.end);
    if (!redefRow) return null;
    const pc = redefRow.pilot;
    if (pc?.library) return 'library-name';
    if (/^(start|done)$/.test(redefRow.text) && redefRow.ownerKind && (model.conforms(redefRow.ownerKind, 'ActionUsage') || model.conforms(redefRow.ownerKind, 'ActionDefinition'))) return 'x-builtin-redef';
    if (redefRow.status === 'unchecked' && /^redefinition-/.test(redefRow.reason ?? '')) return 'D5-name';
    return null;
  }
  for (const r of rows) r.class = one(r);
}

for (const f of files) {
  const rel = f.startsWith(BASE) ? f.slice(BASE.length) : f;
  const pj = path.join(pilotDir, 'files', rel + '.json');
  const text = decodeUtf8(fs.readFileSync(f));
  const p = parse(text);
  if (!p.ok) continue;
  sum.files++;
  const pilot = JSON.parse(fs.readFileSync(pj, 'utf8'));
  const prefs = pilot.refs ?? [];
  const model = resolveNames(p.tree, text, ropts);
  compareOne({ rel, text, p, model, prefs, refs: model.refs });
}
// フォルダごと(GR20 の M)
if (foldersPath) {
  const all = JSON.parse(fs.readFileSync(foldersPath, 'utf8'));
  const onlyGroup = opt('--group', null);
  sum.folders = 0; sum.crossRefs = 0; sum.crossUnmatched = 0; sum.perFolder = [];
  all.forEach((g, gi) => {
    if (onlyGroup && g.group !== onlyGroup) return;
    const list = g.files.map((f) => ({ path: f.slice(g.dir.length + 1), text: decodeUtf8(fs.readFileSync(f)) }));
    const a = analyzeFiles(list, { resolve: ropts });
    if (!a.anyOk) return;
    sum.folders++;
    // ファイルをまたいで解決した参照の数(このアプリ。解決先がほかのファイルの利用者の要素)
    const cross = a.model.refs.filter((r) => r.status === 'resolved' && r.start != null && r.target && !r.target.builtin && !r.target.virtual && a.fileAt(r.target.start) !== a.fileAt(r.start)).length;
    sum.crossRefs += cross;
    const before = { ...sum.classes };
    // 修飾名。名前を宣言せず実効の名前を受け継ぐ要素(ref part :>> driver; など)は、受け継ぐ先(namingFeatureOf)の名前をたどる
    // (model.namesOf は、受け継ぐ先が索引の要素なら名前なしとするため)
    const nameFor = (x) => { let nm = a.model.namesOf(x).name; for (let y = x, k = 0; nm == null && y && k < 20; k++) { y = a.model.namingFeatureOf(y); if (!y) break; nm = y.name ?? a.model.namesOf(y).name ?? null; } return nm; };
    const fileQ = (e) => { const parts = []; for (let x = e; x && x !== a.tree; x = a.model.parentNamespaceOf(x)) { const nm = nameFor(x); if (nm == null) return null; parts.unshift(nm); } return parts.join('\u0000'); };
    // ほかのファイルの要素(種類と修飾名)の索引
    const byQ = a.files.map((f) => { const m = new Map(); if (f.root) (function walk(e) { const q = fileQ(e); if (q != null) { const k = `${e.kind}|${q}`; if (!m.has(k)) m.set(k, []); m.get(k).push(e); } e.owned.forEach(walk); e.related.forEach(walk); })(f.root); return m; });
    a.files.forEach((f, k) => {
      if (!f.ok) return;
      const pj = path.join(pilotDir, String(gi), 'files', f.path + '.json');
      const pilot = JSON.parse(fs.readFileSync(pj, 'utf8'));
      let unmatched = 0;
      // count が false なら、読み替えられなくても数えない(要素 1 つの import の解決先の Membership の側。照合は memberElement で行う)
      const conv = (t, count = true) => {
        if (!t) return t;
        if (t.membership) return { membership: conv(t.membership, false), memberElement: conv(t.memberElement) };
        if (t.local) return { local: { ...t.local, offset: t.local.offset + f.base } };
        if (t.implicit) return { implicit: { ...t.implicit, owner: t.implicit.owner ? { ...t.implicit.owner, offset: t.implicit.owner.offset + f.base } : null } };
        if (t.library) {
          // 実行器が書き出すファイル名は URI の最後の区切り(空白などは %20 の形)なので、戻して比べる
          const uri = (() => { try { return decodeURIComponent(t.library.uri ?? ''); } catch { return t.library.uri; } })();
          const j = a.files.findIndex((x) => x.path.split('/').pop() === uri);
          if (j < 0) return t;
          // 共役ポート定義(原文にない暗黙の要素)は、元のポート定義(修飾名の最後の区切りを除いたもの)の中の暗黙の要素として読み替える
          if (t.library.type === 'ConjugatedPortDefinition' && t.library.qname != null) {
            const q = qsplit(t.library.qname).split('\u0000');
            const orig = byQ[j].get(`PortDefinition|${q.slice(0, -1).join('\u0000')}`) ?? [];
            if (orig.length === 1) return { implicit: { type: 'ConjugatedPortDefinition', name: t.library.name, owner: { offset: orig[0].start, length: orig[0].end - orig[0].start, type: 'PortDefinition' } }, cross: true };
          }
          const hit = t.library.qname != null ? byQ[j].get(`${t.library.type}|${qsplit(t.library.qname)}`) ?? [] : [];
          if (hit.length !== 1) { if (count) unmatched++; if (process.env.GR20_DEBUG) console.error('読み替えられない', f.path, JSON.stringify(t.library)); return { ...t, crossUnmatched: true }; }
          const n = hit[0];
          return { local: { offset: n.start, length: n.end - n.start, type: n.kind, name: t.library.name }, cross: true };
        }
        return t;
      };
      const prefs = (pilot.refs ?? []).map((r) => ({ ...r, offset: r.offset + f.base, target: conv(r.target) }));
      sum.crossUnmatched += unmatched;
      sum.files++;
      compareOne({ rel: `${g.name}/${f.path}`, text: a.text, p: { tree: a.tree }, model: a.model, prefs, refs: a.model.refs.filter((r) => a.fileAt(r.start ?? r.node.start) === k) });
    });
    const delta = {};
    for (const [c, v] of Object.entries(sum.classes)) if (v !== (before[c] ?? 0)) delta[c] = v - (before[c] ?? 0);
    sum.perFolder.push({ name: g.name, group: g.group, files: a.files.length, crossRefs: cross, classes: delta });
  });
}
function compareOne({ rel, text, p, model, prefs, refs }) {
  // パイロット実装の解決先(このファイルの要素)に当たる、このアプリの構文木の要素(範囲の終わりで探す)
  // 構文木の親(U5 の見分けに使う)
  const parentOf = new Map();
  (function walk(e) { for (const c of [...e.owned, ...e.related]) { parentOf.set(c, e); walk(c); } })(p.tree);
  // 特徴の値の式の中の名前の参照か(GR3 P4 の裁定 1、U5): 参照から親をたどり、Usage・Definition・Package に当たる前に
  // FeatureValue に当たれば、その値を持つ特徴の中の式
  const inValueExpr = (node) => {
    for (let n = parentOf.get(node); n; n = parentOf.get(n)) {
      if (model.conforms(n.kind, 'FeatureValue')) return true;
      if (model.conforms(n.kind, 'Usage') && !model.conforms(n.kind, 'Expression') || model.conforms(n.kind, 'Definition') || model.conforms(n.kind, 'Package')) return false;
    }
    return false;
  };
  // D2・D5 の波及: 参照の前の区切りの要素、または参照を含む型の、特殊化の参照が曖昧か D5 で未検査なら、その種類
  const recsByNode = new Map();
  for (const r of model.refs) { if (!recsByNode.has(r.node)) recsByNode.set(r.node, []); recsByNode.get(r.node).push(r); }
  const specIssue = (e) => {
    for (const c of e?.owned ?? []) {
      if (!model.conforms(c.kind, 'Specialization')) continue;
      for (const r of recsByNode.get(c) ?? []) {
        if (r.status === 'ambiguous') return 'D2';
        if (r.status === 'unchecked' && /^redefinition-/.test(r.reason ?? '')) return 'D5';
        if (r.status === 'unchecked' && /^library-(inherited|shadowed)$/.test(r.reason ?? '')) return r.reason;
      }
    }
    return null;
  };
  const cascadeOf = (rec) => {
    if (rec.status !== 'unchecked' || !/^(not-found|chain-previous)$/.test(rec.reason ?? '')) return null;
    if (rec.node.kind === 'FeatureChaining') {
      const chain = parentOf.get(rec.node);
      const list = chain.owned.filter(c => c.kind === 'FeatureChaining');
      const i = list.indexOf(rec.node);
      if (i > 0) { const prev = (recsByNode.get(list[i - 1]) ?? [])[0]; if (prev?.status === 'resolved' && !prev.target.builtin && !prev.target.virtual) { const x = specIssue(prev.target); if (x) return x; } }
    }
    // 式の特徴の連鎖(a.b)の b: 「.」の直前で終わる参照 a の解決先の上位の型(GR17)
    if (rec.node.kind === 'Membership' && model.conforms(parentOf.get(rec.node)?.kind ?? 'Element', 'FeatureChainExpression')) {
      const prev = model.refs.find(x => x.end === rec.start - 1 && x.status === 'resolved' && !x.target.builtin && !x.target.virtual);
      if (prev) { const x = specIssue(prev.target); if (x && /^library-/.test(x)) return x; }
    }
    for (let n = parentOf.get(rec.node); n; n = parentOf.get(n)) {
      if (model.conforms(n.kind, 'Type')) { const x = specIssue(n); if (x) return x; }
    }
    return null;
  };
  // 修飾名(引用符を外した名前を \u0000 でつないだもの。名前を宣言しない要素は実効の名前)
  const nodeQ = (n) => {
    const parts = [];
    for (let e = n; e && e !== p.tree; e = model.parentNamespaceOf(e)) { const nm = model.namesOf(e).name; if (nm == null) return null; parts.unshift(nm); }
    return parts.join('\u0000');
  };
  const libQ = (t) => {
    const parts = [];
    for (let e = t; e; e = e.libParent?.libParent ?? null) { const nm = model.namesOf(e).name; if (nm == null) return null; parts.unshift(nm); if (!e.libParent) break; }
    return parts.join('\u0000');
  };
  // ファイルの根の名前空間が直接持つ要素か(GR21 の K)。フォルダの仮の根(src/model/files.js)は、全ファイルの最上位の関係を直接持つ
  // ので、仮の根とファイルごとの根の両方を根とする
  const roots = new Set([p.tree, ...(p.tree.forestRoots ?? [])]);
  const isRootMember = (e) => { const m = parentOf.get(e); return !!m && roots.has(parentOf.get(m)); };
  // 参照 node を囲む名前空間のうち、利用者の意味のメタデータ(#キーワード)を持ち、そのメタデータの定義(利用者のモデルの上位の定義を
  // たどる)が baseType を再定義するもの(GR21 の K。設計書 2.5 節の「利用者のキーワードの baseType による暗黙の特殊化」)。
  // → その名前空間の名前(なければ null)
  const refsByNode = new Map();
  for (const r of model.refs) { if (!refsByNode.has(r.node)) refsByNode.set(r.node, []); refsByNode.get(r.node).push(r); }
  const userTarget = (n) => (refsByNode.get(n) ?? []).map(r => r.target).find(t => t && !t.lib && !t.builtin && !t.virtual) ?? null;
  const redefinesBaseType = (def) => {
    const seen = new Set();
    for (let todo = [def]; todo.length;) {
      const d = todo.pop();
      if (!d || seen.has(d)) continue;
      seen.add(d);
      for (const m of d.owned) for (const f of [...m.owned, ...m.related]) for (const r of f.owned ?? []) if (r.kind === 'Redefinition' && (refsByNode.get(r) ?? []).some(x => x.text === 'baseType')) return true;
      for (const sp of d.owned) if (model.conforms(sp.kind, 'Specialization')) { const t = userTarget(sp); if (t) todo.push(t); }
    }
    return false;
  };
  const baseTypeScope = (node) => {
    for (let n = parentOf.get(node); n; n = parentOf.get(n)) {
      if (!model.conforms(n.kind, 'Namespace')) continue;
      for (const m of n.owned) for (const mu of [...m.owned, ...m.related]) {
        if (!model.conforms(mu.kind, 'MetadataUsage')) continue;
        const typing = mu.owned.find(x => model.conforms(x.kind, 'FeatureTyping'));
        const def = typing && userTarget(typing);
        if (def && redefinesBaseType(def)) return model.namesOf(n).name ?? '(名前なし)';
      }
    }
    return null;
  };
  const nodesByEnd = new Map();
  (function walk(e) { if (!nodesByEnd.has(e.end)) nodesByEnd.set(e.end, []); nodesByEnd.get(e.end).push(e); e.owned.forEach(walk); e.related.forEach(walk); })(p.tree);
  const oursFor = (loc) => {
    const ns = nodesByEnd.get(loc.offset + loc.length) ?? [];
    return ns.find(n => n.kind === loc.type) ?? ns.find(n => !model.conforms(n.kind, 'Relationship')) ?? null;
  };
  const byEnd = new Map();
  for (const r of prefs) { const e = r.offset + r.length; if (!byEnd.has(e)) byEnd.set(e, []); byEnd.get(e).push(r); }
  const used = new Set();
  const rows = [];
  for (const rec of refs) {
    sum.ours++;
    // 共役ポートは、パイロット実装の節点が ~(と空白)から始まる
    const cands = (byEnd.get(rec.end) ?? []).filter(r => !used.has(r) && (r.offset === rec.start || (rec.conjugated && r.offset < rec.start && /^~\s*$/.test(text.slice(r.offset, rec.start)))));
    const pr = cands[0] ?? null;
    if (pr) used.add(pr);
    // 再定義の参照では、所有する型(owningType)の種類も書く(分類に使う)
    let ownerKind = null;
    if (rec.node.kind === 'Redefinition') { const f = model.parentNamespaceOf(rec.node); const o = f ? model.parentNamespaceOf(f) : null; ownerKind = o?.kind ?? null; }
    const row = { cascade: cascadeOf(rec), inValueExpr: rec.node.kind === 'Membership' && parentOf.get(rec.node) && model.conforms(parentOf.get(rec.node).kind, 'FeatureReferenceExpression') && inValueExpr(rec.node), ownerKind, start: rec.start, end: rec.end, text: rec.text, kind: rec.node.kind, prop: rec.prop, status: rec.status, reason: rec.reason, shadow: rec.shadow ? [...new Set(rec.shadow.map(s => s.why))] : null };
    const t = rec.target;
    row.ours = !t ? null : t.lib ? { builtin: t.qname, lib: true, kind: t.kind, owner: libOwnerQ(t) } : t.builtin ? { builtin: t.qname } : t.virtual ? { virtual: t.virtual, of: { start: t.of.start, end: t.of.end, name: model.namesOf(t.of).name } } : { kind: t.kind, start: t.start, end: t.end, name: model.namesOf(t).name };
    if (rec.status === 'ambiguous') row.candidates = rec.candidates.map(c => c.lib ? { builtin: c.qname, lib: true, q: libQ(c) } : c.builtin ? { builtin: c.qname } : { kind: c.kind, start: c.start, end: c.end, ...(isRootMember(c) ? { rootMember: true } : {}) });
    // 参照を囲む名前空間のどれかが、baseType を再定義した利用者の意味のメタデータ(#キーワード)を持つか(GR21 の K)
    if (rec.status === 'unchecked') { const b = baseTypeScope(rec.node); if (b) row.baseTypeScope = b; }
    if (!pr) { sum.oursOnly++; row.pilot = 'none'; rows.push(row); continue; }
    sum.paired++;
    // 解決先が Membership(MembershipImport の importedMembership)なら、その memberElement で比べる
    const ptRaw = pr.target;
    row.pilot = ptRaw?.membership ? ptRaw.memberElement : ptRaw;
    if (ptRaw?.membership) row.pilotMembership = ptRaw.membership;
    if (row.pilot?.local) {
      const n = oursFor(row.pilot.local);
      if (n) {
        const nm = model.namesOf(n);
        row.pilotAsOurs = { kind: n.kind, start: n.start, end: n.end, declaredName: n.name ?? null, declaredShortName: n.shortName ?? null, effectiveName: nm.name, effectiveShortName: nm.shortName };
        // パイロット実装の解決先が、ファイルの根の名前空間の private の要素か(GR21 の K)
        const mem = parentOf.get(n);
        if (mem && isRootMember(n) && (mem.attrs?.visibility ?? 'public') === 'private') row.pilotPrivateRoot = true;
      } else row.pilotAsOurs = null;
    }
    row.pilotFeature = `${pr.source}.${pr.feature}`;
    // 組み合わせ
    const pt = row.pilot;
    const pk = !pt ? 'null' : pt.local ? 'local' : pt.implicit ? 'implicit' : 'library';
    let same = false;
    if (rec.status === 'resolved' && pt) {
      if (t.lib && pt.local) {
        // 索引の要素と、このファイルの要素(標準ライブラリのファイル自身を照合するとき): 修飾名で比べる(設計書 10 章。名前を宣言しない
        // 要素は実効の名前)
        const n = oursFor(pt.local);
        const lq = libQ(t), nq = n ? nodeQ(n) : null;
        same = lq != null && nq != null && lq === nq;
      }
      // 名前を宣言しない索引の要素(名前を再定義から受け継ぐ特徴): パイロット実装は「持ち主の修飾名::実効の名前」で書き出す
      else if (t.lib && t.qname == null) { const lq = libQ(t); same = !!pt.library && pt.library.type === t.kind && lq != null && pt.library.qname != null && lq === qsplit(pt.library.qname); }
      else if (t.builtin) same = !!pt.library && sameBuiltin(t.qname, pt.library.qname);
      else if (t.virtual) {
        const nm = model.namesOf(t.of).name;
        const loc = pt.local ?? pt.implicit;
        const off = pt.local ? pt.local.offset : pt.implicit?.owner?.offset;
        same = !!loc && loc.type === 'ConjugatedPortDefinition' && loc.name === '~' + nm && off >= t.of.start && off <= t.of.end;
      } else if (pt.local) {
        same = pt.local.offset + pt.local.length === t.end;
        // パイロット実装の節点の範囲が宣言の頭だけのもの(entry action x { … } など): 始まり・種類・名前が同じなら同じ要素(GR17)
        if (!same && pt.local.offset === t.start && pt.local.type === t.kind && pt.local.name != null && pt.local.name === model.namesOf(t).name) same = true;
        // 原文にない長さ 0 の要素(遷移の受け取りの引数など)は、置く位置の決め方が違うので、種類と名前が同じなら同じとする
        if (!same && pt.local.length === 0 && t.start === t.end && pt.local.type === t.kind && pt.local.name === model.namesOf(t).name) { same = true; row.emptyMatch = true; }
      }
    }
    const ok = rec.status === 'resolved' ? (t.lib ? 'library' : t.builtin ? 'builtin' : t.virtual ? 'virtual' : 'user') : rec.status;
    row.combo = `${ok}/${pk}${rec.status === 'resolved' ? (same ? '/same' : '/diff') : ''}${row.shadow ? '/shadow' : ''}`;
    bump(sum.combos, row.combo);
    rows.push(row);
  }
  for (const r of prefs) if (!used.has(r)) {
    sum.pilotOnly++;
    // 同じ位置・同じ解決先の参照を、パイロット実装が 2 回書き出したもの(所有の木を 2 通りにたどる箇所)
    const dup = [...used].some(u => u.offset === r.offset && u.length === r.length && JSON.stringify(u.target) === JSON.stringify(r.target));
    rows.push({ pilotOnly: true, duplicate: dup, offset: r.offset, length: r.length, text: r.text, pilotFeature: `${r.source}.${r.feature}`, pilot: r.target });
  }
  classify(rows, model, rel);
  sum.pilot += prefs.length;
  for (const r of rows) {
    bump(sum.classes, r.class);
    const k = r.class === 'match' || r.class === 'expected' ? r.class : `${r.class} | ${r.combo ?? (r.pilotOnly ? 'pilot-only' : 'ours-only')}`;
    sum.examples[k] ??= [];
    if (sum.examples[k].length < 5) sum.examples[k].push({ file: rel, ...r });
  }
  fs.writeFileSync(path.join(outDir, 'files', rel.replace(/[\/ ]/g, '_') + '.json'), JSON.stringify(rows) + '\n');
}
fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(sum, null, 1) + '\n');
console.log(`files=${sum.files} ours=${sum.ours} pilot=${sum.pilot} paired=${sum.paired} oursOnly=${sum.oursOnly} pilotOnly=${sum.pilotOnly}`);
console.log('組み合わせ:');
for (const [k, v] of Object.entries(sum.combos).sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${v}`);
console.log('分類:');
for (const [k, v] of Object.entries(sum.classes).sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${v}`);
