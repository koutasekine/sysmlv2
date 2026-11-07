// 警告 W1 の表(使用の種類と、その型に許される定義の種類)を、SysML 2.0 の本文の 7 章から抜き出す(GR19 指示書 3.1 節、設計書 9.2 節)。
//
// 使い方:
//   node tools/model/extract_w1.mjs           # → grammar/w1_usage_typing.json と src/model/w1_table.js
//   node tools/model/extract_w1.mjs --check   # 書き出さず、今のファイルと同じかだけを調べる(違えば終了コード 1)
//
// 抜き出し方:
//   1. out/text/sysml20.txt の 7 章(行頭の「7.1 」の見出しから「8.1 Metamodel Overview」の前まで。目次の行は字下げと点線で除く)
//      の行を空白でつなぎ、文字ごとに元の行番号を覚える。
//   2. 「… usage must only be defined by …」「… usage may only be defined by …」の形の文を探す。使用の種類は「usage」の
//      直前の語(「An attribute usage」→ attribute)、許される定義の種類は「defined by」の後ろを「 or 」と「, 」で分けたもの。
//      括弧の中(「(of any kind)」「(including part definitions)」)は注として残し、種類の名前からは外す。
//      文の終わりの「(see [KerML, 7.4.4])」は、KerML の節として残す。
//   3. 名前をメタクラスの名前にする: 「X definitions」→ X の各語の頭を大文字にしてつなぎ「Definition」を足す。
//      「KerML Y」→ Y の各語を単数にして頭を大文字にしてつなぐ(classes → Class)。使用は「X usage」→「XUsage」。
//      できた名前が grammar/metaclasses.json にあり、言語(KerML の前置きなら KerML、ほかは SysML)が合うときだけ表に入れる。
//      合わないものと、同じ使用の種類の 2 つ目の記述は、表に入れずに excluded に理由を付けて書く。
//   2b. 要求・ケースの actor・stakeholder の記述「Actor (and stakeholder) parameters are part usages, so they must be … defined by
//      part definitions (see 7.11.2 ).」も、役割の Membership と組にして表に入れる(GR19 指示書 v19.1 の 3.2 節。下の 2b の注釈)。
//   4. 節は、その文より前の最も近い 7 章の見出し。行は、文の頭(「An」「a」「Actor」など)の行。
//   5. 同じ 7 章の、上の形でない「… usage … defined by …」の規則の文(「must be defined by a single …」など)も、表に入れずに
//      excluded に書く(報告のため。アプリは使わない)。
// 手で書き写さない。表を直すときは、この道具を直して流し直す。

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
process.chdir(ROOT);
const CHECK = process.argv.includes('--check');
const SRC = 'out/text/sysml20.txt';
const OUT_JSON = 'grammar/w1_usage_typing.json';
const OUT_JS = 'src/model/w1_table.js';

const lines = fs.readFileSync(SRC, 'utf8').split('\n');
const meta = new Map(JSON.parse(fs.readFileSync('grammar/metaclasses.json', 'utf8')).metaclasses.map(m => [m.name, m]));

// ---- 1. 7 章の範囲と見出し
const HEAD = /^(7(?:\.\d+)+) ([A-Z].*)$/; // 題は大文字で始まる(本文の行頭の「7.6.3 , using …」を見出しにしない)
// 改ページ(フォームフィード)が見出しの前に付いている行がある(7.9.2 節など)ので、行頭の改ページは除いて見る
const isHead = (l) => HEAD.test(l.replace(/^\f/, '')) && !/\.{4,}/.test(l);
const start = lines.findIndex((l) => /^\f?7\.1 \S/.test(l) && !/\.{4,}/.test(l));
const end = lines.findIndex((l, i) => i > start && /^\f?8\.1 Metamodel Overview\s*$/.test(l));
if (start < 0 || end < 0) throw new Error(`7 章の範囲が見つからない(start=${start} end=${end})`);
let text = '';
const lineAt = [];
const heads = []; // [{ pos, section, title, line }]
for (let i = start; i < end; i++) {
  const l = lines[i];
  if (isHead(l)) { const m = HEAD.exec(l.replace(/^\f/, '')); heads.push({ pos: text.length, section: m[1], title: m[2].trim(), line: i + 1 }); }
  for (let k = 0; k < l.length; k++) lineAt.push(i + 1);
  text += l;
  lineAt.push(i + 1);
  text += ' ';
}
const sectionAt = (pos) => { let h = null; for (const x of heads) { if (x.pos <= pos) h = x; else break; } return h; };
const norm = (s) => s.replace(/\s+/g, ' ').replace(/ ([,.)\]])/g, '$1').trim();

// ---- 2・3. 「must/may only be defined by」の文
const pascal = (words) => words.map((w) => w[0].toUpperCase() + w.slice(1)).join('');
const singular = (w) => /(ss|sh|ch|x)es$/.test(w) ? w.slice(0, -2) : /ies$/.test(w) ? w.slice(0, -3) + 'y' : w.replace(/s$/, '');
const RE = /\b(An?|an?) ((?:[a-z]+ )*?)usage (must|may) only be\s+defined by ((?:[^.()]|\([^()]*\))+?)(?: \(see \[KerML, ([\d.]+)\]\))?\./g;
const entries = [];
const excluded = [];
const seenUsage = new Map();
const matchedStarts = new Set();
let m;
while ((m = RE.exec(text))) {
  const pos = m.index;
  matchedStarts.add(pos);
  const h = sectionAt(pos);
  const where = { section: h?.section ?? null, line: lineAt[pos], sentence: norm(m[0]) };
  const usageWords = m[2].trim().split(' ');
  const usage = pascal(usageWords) + 'Usage';
  const items = norm(m[4]).split(/, | or /).map((s) => s.trim()).filter(Boolean);
  const allowed = [];
  let bad = null;
  for (const it of items) {
    const note = /\(([^)]*)\)/.exec(it)?.[1] ?? null;
    const words = it.replace(/\([^)]*\)/g, '').trim().split(/\s+/);
    let name, lang;
    if (words[0] === 'KerML') { lang = 'KerML'; name = pascal(words.slice(1).map(singular)); }
    else if (words[words.length - 1] === 'definitions') { lang = 'SysML'; name = pascal(words.slice(0, -1)) + 'Definition'; }
    else { bad = `「${it}」を種類の名前にできない`; break; }
    const mc = meta.get(name);
    if (!mc || mc.lang !== lang) { bad = `「${it}」→ ${name} が ${lang} のメタクラスにない`; break; }
    allowed.push({ kind: name, text: it, ...(note ? { note } : {}) });
  }
  const um = meta.get(usage);
  if (!bad && (!um || um.lang !== 'SysML')) bad = `使用の種類 ${usage} が SysML のメタクラスにない`;
  if (!bad && seenUsage.has(usage)) bad = `${usage} の記述は ${seenUsage.get(usage)} 行にもある(最初のものを採る)`;
  if (bad) { excluded.push({ ...where, reason: bad }); continue; }
  seenUsage.set(usage, where.line);
  entries.push({ usage, usageText: `${m[2].trim()} usage`, modal: m[3], allowed, ...(m[5] ? { kerml: m[5] } : {}), ...where });
}

// ---- 2b. 要求・ケースの actor・stakeholder の記述(GR19 指示書 v19.1 の 3.2 節、設計書 9.2 節の W1)
//   「Actor and stakeholder parameters are part usages, so they must be (explicitly or implicitly) defined by part definitions (see 7.11.2 ).」
//   の形の文。役割(actor・stakeholder)は文の頭の「… parameters」の語(「 and 」で分ける)で、ActorMembership・StakeholderMembership の
//   ように「役割の語 + Membership」をメタクラスの名前にする。使用の種類は「are X usages」の X、許される定義の種類は「defined by」の後ろ
//   (2・3 と同じ読み方)。持ち主の種類は、同じ節の、文より前の最も近い「A X definition or usage may also have one or more … parameters」
//   の X の定義と使用(報告の節を選ぶためだけに使う。判定は持ち主の種類によらない)。参照の節「(see 7.11.2 )」は see に残す。
//   表には、使用の種類と役割の Membership の組で 1 行にする(同じ組の 2 つ目の記述は excluded に書く)。
const ROLE = /\b([A-Z][a-z]+(?: and [a-z]+)*) parameters are ([a-z]+(?: [a-z]+)*) usages, so they must be (?:\([^()]*\) )?defined by ((?:[^.()])+?)(?: \(see ([\d.]+) ?\))?\./g;
const OWNER = /\bA ((?:[a-z]+ )*?)definition or usage may also have one or more ([a-z]+(?: or [a-z]+)*) parameters\b/g;
const seenRole = new Map();
while ((m = ROLE.exec(text))) {
  const pos = m.index;
  const h = sectionAt(pos);
  const where = { section: h?.section ?? null, line: lineAt[pos], sentence: norm(m[0]) };
  const roles = m[1].toLowerCase().split(' and ');
  const memberships = roles.map((r) => pascal([r]) + 'Membership');
  const usage = pascal(m[2].split(' ')) + 'Usage';
  let bad = null;
  for (const k of memberships) { const mc = meta.get(k); if (!mc || mc.lang !== 'SysML') { bad = `役割の ${k} が SysML のメタクラスにない`; break; } }
  const um = meta.get(usage);
  if (!bad && (!um || um.lang !== 'SysML')) bad = `使用の種類 ${usage} が SysML のメタクラスにない`;
  const allowed = [];
  if (!bad) {
    for (const it of norm(m[3]).split(/, | or /).map((s) => s.trim()).filter(Boolean)) {
      const words = it.split(/\s+/);
      if (words[words.length - 1] !== 'definitions') { bad = `「${it}」を種類の名前にできない`; break; }
      const name = pascal(words.slice(0, -1)) + 'Definition';
      const mc = meta.get(name);
      if (!mc || mc.lang !== 'SysML') { bad = `「${it}」→ ${name} が SysML のメタクラスにない`; break; }
      allowed.push({ kind: name, text: it });
    }
  }
  // 持ち主: 同じ節の、文より前の最も近い「A X definition or usage may also have one or more … parameters」
  let owner = null;
  if (!bad) {
    OWNER.lastIndex = h?.pos ?? 0;
    let o;
    while ((o = OWNER.exec(text)) && o.index < pos) owner = o;
    if (!owner) bad = '持ち主の種類(「A … definition or usage may also have one or more … parameters」)が同じ節の前にない';
  }
  let owners = [];
  if (!bad) {
    const ow = owner[1].trim().split(' ');
    owners = [pascal(ow) + 'Definition', pascal(ow) + 'Usage'];
    for (const k of owners) { const mc = meta.get(k); if (!mc || mc.lang !== 'SysML') { bad = `持ち主の ${k} が SysML のメタクラスにない`; break; } }
    const ownerRoles = owner[2].split(' or ');
    if (!bad && !roles.every((r) => ownerRoles.includes(r))) bad = `持ち主の文の役割(${ownerRoles.join('・')})に ${roles.join('・')} がない`;
  }
  const key = `${usage}/${memberships.join('+')}`;
  if (!bad && seenRole.has(key)) bad = `${key} の記述は ${seenRole.get(key)} 行にもある(最初のものを採る)`;
  if (bad) { excluded.push({ ...where, reason: bad }); continue; }
  seenRole.set(key, where.line);
  entries.push({ usage, usageText: `${m[1]} parameters (${m[2]} usages)`, modal: 'must', allowed, memberships, roles, owners, ownerText: norm(owner[0]), ...(m[4] ? { see: m[4] } : {}), ...where });
}

// ---- 5. 上の形でない、使用の定義の規則の文(表に入れない。報告のため)
const OTHER = /\b(An?|an?) ((?:[a-z]+ )*?)usage (?:must|may|should|is|can)(?: [a-z(),]+)*? defined by (?:[^.()]|\([^()]*\))*\./g;
while ((m = OTHER.exec(text))) {
  if (matchedStarts.has(m.index)) continue;
  const s = norm(m[0]);
  // 例の文(「is implicitly defined by」「a part usage vehicle is defined by …」など)と、規則でない文は外す
  if (!/\b(must|may|should)\b|is defined by a single/.test(s)) continue;
  const h = sectionAt(m.index);
  excluded.push({ section: h?.section ?? null, line: lineAt[m.index], sentence: s, reason: '形が「… usage must (may) only be defined by …」でない' });
}
excluded.sort((a, b) => a.line - b.line);

const json = {
  _説明: '警告 W1 の表(GR19 指示書 3.1 節、設計書 9.2 節)。node tools/model/extract_w1.mjs で out/text/sysml20.txt(SysML 2.0)の 7 章から抜き出した(手で編集しない)。entries は「… usage must (may) only be defined by …」の形の記述で、usage は使用の種類(メタクラス)、allowed は許される定義の種類(メタクラス。下位の種類を含む)、section・line は本文の節と行。excluded は表に入れなかった記述と理由。',
  source: SRC,
  entries,
  excluded,
};
const jsonText = JSON.stringify(json, null, 1) + '\n';
// アプリが使う表: 使用の種類・許される定義の種類(と本文の注。警告の文に使う)・節・行。actor・stakeholder の行は、役割の Membership・
// 役割の語・持ち主の種類も持つ
const table = { entries: entries.map((e) => ({
  usage: e.usage, allowed: e.allowed.map((a) => a.kind),
  ...(e.allowed.some((a) => a.note) ? { notes: e.allowed.map((a) => a.note ?? null) } : {}),
  ...(e.memberships ? { memberships: e.memberships, roles: e.roles, owners: e.owners } : {}),
  section: e.section, line: e.line,
})) };
const jsText = `// 警告 W1 の表(GR19 指示書 3.1 節)。grammar/w1_usage_typing.json から node tools/model/extract_w1.mjs で生成した。手で編集しない。
// 出典は SysML 2.0 の本文の 7 章(line は out/text/sysml20.txt の行)。
export default ${JSON.stringify(table)};
`;

if (CHECK) {
  const same = fs.existsSync(OUT_JSON) && fs.readFileSync(OUT_JSON, 'utf8') === jsonText && fs.existsSync(OUT_JS) && fs.readFileSync(OUT_JS, 'utf8') === jsText;
  console.log(`entries=${entries.length} excluded=${excluded.length} same=${same}`);
  process.exit(same ? 0 : 1);
}
fs.writeFileSync(OUT_JSON, jsonText);
fs.writeFileSync(OUT_JS, jsText);
console.log(`entries=${entries.length} excluded=${excluded.length}`);
for (const e of entries) console.log(`  ${e.usage}${e.memberships ? `(${e.memberships.join('・')})` : ''} ← ${e.allowed.map((a) => a.kind).join(' | ')}  (${e.section} 節、${e.line} 行)`);
for (const e of excluded) console.log(`  除外 ${e.line} 行(${e.section}): ${e.reason}: ${e.sentence.slice(0, 120)}`);
