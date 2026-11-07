// 裁定済みの手当てを本文の文法に当て、KerML と SysML を合成する(GR1 指示書 4.4 節)。
//
// 使い方:
//   node tools/grammar/compose.mjs   # → grammar/sysml20_patched.ebnf、out/grammar/compose_log.json
//
// 合成の規則(設計書 2.3 節): 同じ名前の規則が KerML と SysML にあれば SysML 側を採る。
// 手当ては grammar/errata.json の patch(tools/grammar/patch.mjs)。errata.json の status が「確定」でなければ止める。
// 各規則の前に「// @src L開始-L終了 <出典> [手当ての ID]」を付ける。行番号は出典のテキストの行番号。
// 2.1 Beta 2 から取った規則・見出しは、その行番号(kerml11b2・sysml21b2)も併記する。

import fs from 'node:fs';
import path from 'node:path';
import { parseGrammarFile, matchHeader } from './ebnf.mjs';
import { applyPatch } from './patch.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
process.chdir(ROOT);

const errata = JSON.parse(fs.readFileSync('grammar/errata.json', 'utf8'));
if (errata.status !== '確定') { console.error('grammar/errata.json が確定していない'); process.exit(1); }

const SRC = {
  KerML: { body: 'grammar/kerml10_body.ebnf', b2: 'out/grammar/kerml11b2_body.ebnf', tag: 'kerml10', tag21: 'kerml11b2' },
  SysML: { body: 'grammar/sysml20_body.ebnf', b2: 'out/grammar/sysml21b2_body.ebnf', tag: 'sysml20', tag21: 'sysml21b2' },
};

const log = { applied: [], overriddenKerMLPatches: [], added: [] };
const patched = {};
for (const lang of ['KerML', 'SysML']) {
  const rules = parseGrammarFile(SRC[lang].body);
  const rules21 = parseGrammarFile(SRC[lang].b2);
  const out = [];
  for (const r of rules) {
    const es = errata.entries.filter(e => e.lang === lang && e.rule === r.name);
    let cur = { ...r, origin: lang, patches: [], from21: [] };
    for (const e of es) {
      const { rule, added } = applyPatch(cur, e.patch, rules21);
      cur = { ...rule, origin: lang, patches: [...cur.patches, e.id], from21: [...cur.from21, ...(rule.from21 ?? [])] };
      log.applied.push({ id: e.id, lang, rule: r.name, newName: cur.name });
      for (const a of added) {
        log.added.push({ id: e.id, lang, rule: a.name });
        cur.addedAfter = [...(cur.addedAfter ?? []), { ...a, origin: lang, patches: [e.id], from21: [a.srcLines], srcLines: null, addedRule: true }];
      }
    }
    out.push(cur);
    for (const a of cur.addedAfter ?? []) out.push(a);
  }
  patched[lang] = out;
}

// 手当てが漏れなく当たったか
for (const e of errata.entries) {
  if (!log.applied.some(a => a.id === e.id)) { console.error(`${e.id}: 規則 ${e.rule} が見つからず、手当てを当てられない`); process.exit(1); }
}

const sysNames = new Set(patched.SysML.map(r => r.name));
for (const r of patched.KerML) {
  if (sysNames.has(r.name) && r.patches.length) log.overriddenKerMLPatches.push({ rule: r.name, patches: r.patches });
}

// 重複の検査(同じ言語の中で同名になっていないか)
for (const lang of ['KerML', 'SysML']) {
  const seen = new Set();
  for (const r of patched[lang]) {
    if (seen.has(r.name)) { console.error(`${lang} の手当て後に規則 ${r.name} が重複`); process.exit(1); }
    seen.add(r.name);
  }
}

const L = [];
L.push('// SysML 2.0(formal/2026-03-02)8.2.2 節と KerML 1.0(formal/2026-03-01)8.2 節の文法に、',
  '// 誤りの一覧 grammar/errata.json(確定)の手当てを当て、同名の規則は SysML 側を採って合成したもの。',
  '// 生成: node tools/grammar/compose.mjs',
  '// 各規則の「// @src L開始-L終了 出典」の行番号は出典のテキスト(out/text/<出典>.txt)の行番号。',
  '// 「21=」は 2.1 Beta 2 から取った規則・見出しの行番号、「手当て」は errata.json の ID。',
  '// 始点は RootNamespace(SysML 8.2.2.5.1)。', '');
const emit = (r, tag, tag21) => {
  const parts = [];
  parts.push(r.srcLines ? `// @src L${r.srcLines[0]}-L${r.srcLines[1]} ${tag}` : `// @src L${r.from21[0][0]}-L${r.from21[0][1]} ${tag21}(2.1 Beta 2 から追加)`);
  const f21 = r.srcLines ? r.from21.filter(Boolean) : [];
  if (f21.length) parts.push(`21=${f21.map(x => `${tag21} L${x[0]}-L${x[1]}`).join(',')}`);
  if (r.patches.length) parts.push(`手当て ${r.patches.join(',')}`);
  L.push(parts.join(' '));
  // 見出しの行に本体が続く規則(DEFINED_BY = ':' | 'defined' 'by' など)は、parseGrammarFile が見出しの行の残りを
  // 本体の 1 行目にも入れるので、本体の 1 行目を重ねて書かない(GR2 P3 で見つけた不具合の修正)
  const h = matchHeader(r.header.trim());
  const lines = r.body ? r.body.split('\n') : [];
  if (h?.rest && lines[0] === h.rest) lines.shift();
  L.push(r.header);
  if (lines.length) L.push(lines.join('\n'));
  L.push('');
};
let sec = null;
L.push('// ==== SysML 側 ====', '');
for (const r of patched.SysML) {
  if (r.section !== sec) { sec = r.section; L.push(`// ${sec} 節`, ''); }
  emit(r, SRC.SysML.tag, SRC.SysML.tag21);
}
L.push('// ==== KerML 側(SysML に同名の規則がないもの) ====', '');
sec = null;
let nKerml = 0;
for (const r of patched.KerML) {
  if (sysNames.has(r.name)) continue;
  if (r.section !== sec) { sec = r.section; L.push(`// ${sec} 節`, ''); }
  emit(r, SRC.KerML.tag, SRC.KerML.tag21);
  nKerml++;
}
fs.writeFileSync('grammar/sysml20_patched.ebnf', L.join('\n'));
fs.mkdirSync('out/grammar', { recursive: true });
log.counts = { sysml: patched.SysML.length, kermlKept: nKerml, kermlOverridden: patched.KerML.length - nKerml, total: patched.SysML.length + nKerml };
log.overriddenNames = patched.KerML.filter(r => sysNames.has(r.name)).map(r => r.name);
fs.writeFileSync('out/grammar/compose_log.json', JSON.stringify(log, null, 1));
console.log(`grammar/sysml20_patched.ebnf: 規則 ${log.counts.total} 件(SysML ${log.counts.sysml}、KerML ${log.counts.kermlKept}、SysML に上書きされた KerML ${log.counts.kermlOverridden})、手当て ${log.applied.length} 件`);
