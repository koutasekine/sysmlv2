// 抽象構文のメタクラスと、その一般化(General Classes)の一覧を本文から抜き出す(GR2 指示書 5.2 節の補助)。
//
// 使い方:
//   node tools/grammar/metaclasses.mjs   # → grammar/metaclasses.json
//
// 入力は GR1 の抜き出しで作ったテキスト out/text/kerml10.txt(KerML 1.0 の 8.3 節)と
// out/text/sysml20.txt(SysML 2.0 の 8.3 節)。8.3 節の小節のうち、見出しの直後に「Description」が続くものを
// メタクラス(または列挙型)の定義とみなし、「General Classes」の下に並ぶ名前を一般化として読む。
// 「Literal Values」があるものは列挙型とする。見出しの名前の中の空白(「Binding Connector」)は詰める。
// 構文木の要素の種類を決めるとき(src/parser/tree.js)に、メタクラスの上下関係として使う。

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
process.chdir(ROOT);

const SOURCES = [
  { lang: 'KerML', file: 'out/text/kerml10.txt', tag: 'kerml10' },
  { lang: 'SysML', file: 'out/text/sysml20.txt', tag: 'sysml20' },
];

function extract({ file, tag }) {
  const L = fs.readFileSync(file, 'utf8').replace(/\f/g, '').split('\n');
  const out = [];
  for (let i = 0; i < L.length; i++) {
    const h = /^(8\.3\.\d+(?:\.\d+)*)\s+([A-Z][A-Za-z]*(?: [A-Z][A-Za-z]*)*)\s*$/.exec(L[i]);
    if (!h) continue;
    let j = i + 1;
    while (j < L.length && L[j].trim() === '') j++;
    if (L[j]?.trim() !== 'Description') continue;
    const name = h[2].replace(/ /g, '');
    const general = [];
    let isEnum = false, state = 0, end = j;
    for (let k = j + 1; k < L.length; k++) {
      const t = L[k].trim();
      end = k;
      if (/^8\.3\.\d/.test(t)) break;
      if (t === 'General Classes') { state = 1; continue; }
      if (state !== 1 || t === '' || t === 'None.') continue;
      if (t === 'Literal Values') { isEnum = true; break; }
      if (/^(Attributes|Operations|Constraints)$/.test(t)) break;
      if (/^[A-Z][A-Za-z]*$/.test(t)) { general.push(t); continue; }
      // ページの見出し(文書名とページ番号)は読み飛ばす
      if (/Modeling Language v|^\d+$/.test(t)) continue;
      throw new Error(`${tag} L${k + 1}: ${name} の General Classes に読めない行「${t}」`);
    }
    out.push({ name, section: h[1], src: `${tag} L${i + 1}`, general, ...(isEnum ? { enum: true } : {}) });
  }
  return out;
}

const all = new Map();
for (const s of SOURCES) {
  for (const m of extract(s)) {
    if (all.has(m.name)) throw new Error(`メタクラス ${m.name} が 2 回定義されている(${all.get(m.name).src}、${m.src})`);
    all.set(m.name, { lang: s.lang, ...m });
  }
}
const missing = [];
for (const m of all.values()) for (const g of m.general) if (!all.has(g)) missing.push(`${m.name} → ${g}`);
if (missing.length) { console.error(`一般化の先が見つからない: ${missing.join(', ')}`); process.exit(1); }

const doc = {
  _説明: '抽象構文のメタクラスと一般化の一覧。node tools/grammar/metaclasses.mjs で out/text/kerml10.txt と out/text/sysml20.txt の 8.3 節から生成した(手で編集しない)。src は見出しの行番号。enum は列挙型。',
  metaclasses: [...all.values()].map(({ name, lang, section, src, general, enum: e }) => ({ name, lang, section, src, general, ...(e ? { enum: true } : {}) })),
};
fs.writeFileSync('grammar/metaclasses.json', JSON.stringify(doc, null, 1) + '\n');
const n = (lang) => doc.metaclasses.filter(m => m.lang === lang).length;
console.log(`grammar/metaclasses.json: ${doc.metaclasses.length} 件(KerML ${n('KerML')}、SysML ${n('SysML')}。うち列挙型 ${doc.metaclasses.filter(m => m.enum).length})`);
