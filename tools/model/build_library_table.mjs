// 標準ライブラリの名前の索引 grammar/library_index.json から、名前解決が使う表 src/model/library_table.js を作る(GR17 指示書 3.1 節)。
//
// 使い方:
//   node tools/model/build_library_table.mjs   # → src/model/library_table.js
//
// 生成物は ES モジュールのデータだけで、外部パッケージと Node.js 固有の機能を使わない。手で編集しない。
// 詰める形(大きさを小さくするため):
//   names     索引の名前・短い名前・参照の区切りの名前を重ねずに並べ、「;」でつないだ文字列(名前は「;」を含まない。下で確かめる)。
//             名前は引用符を外した形
//   kinds     種類(メタクラス)を重ねずに並べ、「 」でつないだ文字列
//   elements  要素を索引の順に「;」でつないだ文字列。要素は「,」で区切った次の欄(数は 36 進。後ろの空の欄は省く):
//               0 種類の番号  1 持ち主との番号の差(最上位は空)  2 名前の番号(なしは空)  3 短い名前の番号(なしは空)
//               4 可視性(空 public・p private・r protected)  5 上位の型(「/」でつなぐ。1 文字の関係の種類 + 参照)
//               6 別名の相手(参照)  7 import(「/」でつなぐ。種類 n・m + 再帰なら * + 可視性 u・p・r + 参照。GR18 の M8 で、再帰の印を r から * にした(protected の r と分ける))
//             参照は名前の番号を「:」(修飾名の区切り)と「.」(特徴の連鎖)でつないだもの。共通の接頭辞の修飾名は、持ち主の番号で
//             まとめている(要素の修飾名は持ち主の修飾名 + 名前で求まるので持たない)
//   implicit  暗黙の特殊化の相手: [メタクラス, 標準ライブラリの型の修飾名, 本文の行, 条件]。仕様書本文(KerML 1.0・SysML 2.0 の 8.3 節)の
//             制約 check〜Specialization(s)のうち、条件のない specializesFromLibrary('…') だけのものと、条件が端の特徴の数だけのもの
//             (条件 'binary': check〜BinarySpecialization の「->size() = 2 implies」、'ends': checkFlowUsageFlowSpecialization の
//             「ownedEndFeatures->notEmpty() implies」)を、本文のテキスト
//             (out/text/kerml10.txt・sysml20.txt)から抜き出した。メタクラスの名前が制約の名前と同じもの(内蔵する表のメタクラス)だけ
//             (VerificationCase のように、制約の名前のメタクラスが表にないものは入れない)
//   contextual 条件付きの暗黙の特殊化・再定義の相手の修飾名(本文の specializesFromLibrary・redefinesFromLibrary の引数のうち、implicit に
//             入れていないもの)。利用者の型の中で、その相手の特徴の再定義に隠されているかもしれない名前を求めるのに使う
//   resolved  索引の中の参照(上位の型・別名の相手・import。特徴の連鎖は区切りごと)の解決先。表を一度書いた後、それを読み込んだ
//             今の名前解決(src/model/resolve.js。索引を使い、解き直しを含む)で解いたもの。要素ごとに「,」でつなぎ、要素を「;」でつなぐ。
//             索引の要素の番号(36 進)、内蔵する表の項目なら「~」+ resolvedBuiltins の番号、解決なしは空。索引の中の参照は利用者の
//             モデルによらないので、アプリは解き直さずにこれを使う(名前解決の時間を詰めるため)

import fs from 'node:fs';
import path from 'node:path';
import builtinTable from '../../src/model/builtin_table.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
process.chdir(ROOT);

const idx = JSON.parse(fs.readFileSync('grammar/library_index.json', 'utf8'));
const E = idx.elements;

// ---- 名前
const unquote = (t) => (t.startsWith("'") ? t.slice(1, -1).replace(/\\(.)/g, (m, c) => ({ b: '\b', t: '\t', n: '\n', f: '\f', r: '\r', '"': '"', "'": "'", '\\': '\\' }[c] ?? c)) : t);
// 索引の参照(「A::'B C'.d」)を、区切りの名前の列の列に分ける(「.」で連鎖の区切り、「::」で修飾名の区切り)
function splitRef(ref) {
  const links = [[]];
  let i = 0;
  while (i < ref.length) {
    if (ref[i] === "'") { let j = i + 1; while (j < ref.length && ref[j] !== "'") { if (ref[j] === '\\') j++; j++; } links[links.length - 1].push(unquote(ref.slice(i, j + 1))); i = j + 1; }
    else if (ref.startsWith('::', i)) i += 2;
    else if (ref[i] === '.') { links.push([]); i++; }
    else { let j = i; while (j < ref.length && /[A-Za-z0-9_]/.test(ref[j])) j++; if (j === i) throw new Error(`参照 ${ref} を読めない`); links[links.length - 1].push(ref.slice(i, j)); i = j; }
  }
  return links;
}
const names = [], nameIdx = new Map();
const nm = (s) => { if (s == null) return ''; if (s.includes(';')) throw new Error(`名前 ${s} が「;」を含む`); if (!nameIdx.has(s)) { nameIdx.set(s, names.length); names.push(s); } return nameIdx.get(s).toString(36); };
const kinds = [], kindIdx = new Map();
const kd = (k) => { if (!kindIdx.has(k)) { kindIdx.set(k, kinds.length); kinds.push(k); } return kindIdx.get(k).toString(36); };
const refCode = (ref) => splitRef(ref).map(link => link.map(nm).join(':')).join('.');
const REL = { Subclassification: 'C', Specialization: 'P', Subsetting: 'S', Redefinition: 'R', ReferenceSubsetting: 'F', CrossSubsetting: 'X', FeatureTyping: 'T', Conjugation: 'J' };
const VIS = { public: '', private: 'p', protected: 'r' };
const VIS_I = { public: 'u', private: 'p', protected: 'r' };

const recs = E.map((e, i) => {
  const f = [kd(e.k), e.o == null ? '' : (i - e.o).toString(36), nm(e.n), nm(e.s ?? null), VIS[e.v ?? 'public'],
    (e.g ?? []).map(([r, ref]) => REL[r] + refCode(ref)).join('/'),
    e.a ? refCode(e.a) : '',
    (e.i ?? []).map(([k, ref, rec, vis]) => (k === 'NamespaceImport' ? 'n' : 'm') + (rec ? '*' : '') + VIS_I[vis] + refCode(ref)).join('/')];
  while (f.length && f[f.length - 1] === '') f.pop();
  return f.join(',');
});

// ---- 暗黙の特殊化の相手(仕様書本文から)
const implicit = [];
for (const tag of ['kerml10', 'sysml20']) {
  const L = fs.readFileSync(`out/text/${tag}.txt`, 'utf8').replace(/\f/g, '').split('\n');
  for (let i = 0; i < L.length; i++) {
    const m = /^check(\w+?)Specializations?$/.exec(L[i]);
    if (!m) continue;
    // 制約の説明の後ろの OCL の行(次の制約・節の見出しまで)
    const ocl = [];
    for (let j = i + 1; j < L.length && j < i + 40; j++) {
      if (/^(check|derive|validate)\w+$/.test(L[j]) || /^\d+\.\d+(\.\d+)+ /.test(L[j])) break;
      if (/specializesFromLibrary|redefinesFromLibrary|implies|oclIsKindOf|isComposite|and$|or$|^\s/.test(L[j])) ocl.push({ text: L[j], line: j + 1 });
    }
    const u = ocl.length === 1 && /^specializesFromLibrary\('([^']+)'\)$/.exec(ocl[0].text);
    if (u && builtinTable.metaclasses[m[1]]) { implicit.push([m[1], u[1], `${tag} L${ocl[0].line}`]); continue; }
    // 条件が構文木だけで決まる制約: 端の特徴がちょうど 2 つ(check〜BinarySpecialization の「->size() = 2 implies」)と、
    // 端の特徴を持つ(checkFlowUsageFlowSpecialization の「ownedEndFeatures->notEmpty() implies」)
    const b = /^(\w+?)Binary$/.exec(m[1]);
    const f = /^(\w+?)Flow$/.exec(m[1]);
    const t2 = ocl.map(o => o.text.trim());
    const lib = t2.length === 2 && /^specializesFromLibrary\('([^']+)'\)$/.exec(t2[1]);
    if (b && builtinTable.metaclasses[b[1]] && lib && /->size\(\) = 2 implies$/.test(t2[0])) implicit.push([b[1], lib[1], `${tag} L${ocl[1].line}`, 'binary']);
    else if (f && builtinTable.metaclasses[f[1]] && lib && /^ownedEndFeatures->notEmpty\(\) implies$/.test(t2[0])) implicit.push([f[1], lib[1], `${tag} L${ocl[1].line}`, 'ends']);
  }
}

// 条件付きの暗黙の特殊化・再定義の相手(本文の specializesFromLibrary('…')・redefinesFromLibrary('…') のうち、上の implicit に入れて
// いないもの)。利用者の型の中で、その相手が持つ特徴が隠されているかもしれない名前を求めるのに使う
const contextual = [];
{
  const used = new Set(implicit.map(x => x[1]));
  for (const tag of ['kerml10', 'sysml20']) {
    // 制約 check〜 の中のものだけ(validate〜 の中の、式の結果の型を確かめるもの(result.specializesFromLibrary など)は入れない)
    const L = fs.readFileSync(`out/text/${tag}.txt`, 'utf8').replace(/\f/g, '').split('\n');
    let inCheck = false;
    for (const line of L) {
      if (/^(check|derive|validate)\w+$/.test(line)) inCheck = line.startsWith('check');
      else if (/^\d+\.\d+(\.\d+)+ /.test(line)) inCheck = false;
      if (!inCheck) continue;
      for (const m of line.matchAll(/(result\.)?(?:specializes|redefines)FromLibrary\('([^']+)'\)/g)) {
        if (m[1]) continue;
        const q = m[2];
        if (!used.has(q) && !contextual.includes(q)) contextual.push(q);
      }
    }
  }
}
const tsLiteral = (s) => '`' + s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${') + '`';
const write = (resolved) => {
  const out = `// 標準ライブラリの名前の索引から作った、名前解決の表(GR17 指示書 3.1 節、設計書 6.1 節)。grammar/library_index.json と
// 仕様書本文のテキスト(暗黙の特殊化の相手)から node tools/model/build_library_table.mjs で生成した。手で編集しない。
// 詰める形は道具の説明を見よ。標準ライブラリのファイルの本文・説明文・式は入れていない。
export default {
  names: ${tsLiteral(names.join(';'))},
  kinds: '${kinds.join(' ')}',
  elements: '${recs.join(';')}',
  implicit: ${JSON.stringify(implicit)},
  contextual: ${JSON.stringify(contextual)},${resolved ? `
  resolved: '${resolved.text}',
  resolvedBuiltins: ${JSON.stringify(resolved.builtins)},` : ''}
};
`;
  fs.writeFileSync('src/model/library_table.js', out);
  return out;
};
// 1. 解決先のない表を書き、2. それを読み込んだ名前解決で索引の中のすべての参照を解き(解き直しを含む。利用者の参照はない)、
// 3. 解決先(索引の要素の番号、内蔵する表の項目なら「~」+ resolvedBuiltins の番号、解決なしは空)を足して書き直す
write(null);
const { parse } = await import('../../src/parser/index.js');
const { resolveNames } = await import('../../src/model/resolve.js');
const { makeLibrary } = await import('../../src/model/library.js');
const { conforms } = await import('../../src/model/resolve.js');
const t0 = performance.now();
const tree = parse('').tree;
const model = resolveNames(tree, '', { libraryIndex: true, libraryAll: true });
const lib = makeLibrary(conforms);
const builtins = [], bIdx = new Map();
let nRes = 0, nUn = 0, nBuiltin = 0;
const enc = (r) => {
  if (!r || r.status !== 'resolved' || !r.target || r.target.virtual) { nUn++; return ''; }
  nRes++;
  const t = r.target;
  if (t.lib) return t.libId.toString(36);
  if (t.twin) return t.twin.libId.toString(36);
  nBuiltin++;
  if (!bIdx.has(t.qname)) { bIdx.set(t.qname, builtins.length); builtins.push(t.qname); }
  return '~' + bIdx.get(t.qname).toString(36);
};
const text = lib.slots.map(sl => { const a = sl.map(([n, prop]) => enc(model.libraryResultOf(n, prop))); while (a.length && a[a.length - 1] === '') a.pop(); return a.join(','); }).join(';');
const out = write({ text, builtins });
console.log(`src/model/library_table.js: ${Buffer.byteLength(out)} バイト(要素 ${E.length}、名前 ${names.length}、種類 ${kinds.length}、暗黙の特殊化の相手 ${implicit.length})。索引 grammar/library_index.json ${fs.statSync('grammar/library_index.json').size} バイト`);
console.log(`索引の中の参照 ${nRes + nUn}: 解決 ${nRes}(うち内蔵する表の項目 ${nBuiltin})、解決なし ${nUn}。解き直し ${model.iterations} 回、収束 ${model.converged}、${((performance.now() - t0) / 1000).toFixed(1)} 秒`);
