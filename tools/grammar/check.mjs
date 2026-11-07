// 本文から抜き出した文法を機械的に検査する(GR1 指示書 4.3 節・4.4 節)。
//
// 使い方:
//   node tools/grammar/check.mjs <文法.ebnf> [<上書きする側の文法.ebnf>] [--dict <テキスト>...]
//
//   1 つ目のファイルだけ: そのファイルの中で検査する。
//   2 つ与えたとき: 2 つ目(SysML)の規則の参照は、2 つ目と 1 つ目(KerML)を合わせた中で解決する。
//   --dict: 属性名・規則名の綴りの検査に使う、仕様書のテキスト(語の出現回数を数える)。
//
// 検査項目(kind):
//   header      見出しに '=' がない、または '=' の代わりに ':' を使っている
//   duplicate   同じファイルの中で規則名が重複
//   undefined   未定義の規則を参照
//   quote       単一引用符の対応が取れていない
//   bracket     丸・角・波括弧の対応が取れていない
//   operator    EBNF の記法にない演算子を引用符なしで使っている
//   prefix      属性名に「x.」の接頭辞が付いている
//   spelling    属性名・規則名が仕様書の中でまれで、よく使われる近い綴りがある
// 結果は JSON で標準出力に書く。

import fs from 'node:fs';
import { parseGrammarFile, tokenize, isLexicalName } from './ebnf.mjs';

const args = process.argv.slice(2);
const files = [];
const dicts = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--dict') { while (args[i + 1] && !args[i + 1].startsWith('--')) dicts.push(args[++i]); }
  else files.push(args[i]);
}
if (files.length < 1 || files.length > 2) {
  console.error('使い方: node tools/grammar/check.mjs <文法.ebnf> [<上書きする側の文法.ebnf>] [--dict <テキスト>...]');
  process.exit(2);
}

const sets = files.map(f => ({ file: f, rules: parseGrammarFile(f) }));
const findings = [];
const add = (kind, file, rule, detail) =>
  findings.push({ kind, file, rule: rule.name, section: rule.section, src: rule.srcLines, detail });

// 説明文の本体(字句の規則で、英文で書かれているもの)。参照の検査をしない。
function isProse(rule) {
  if (!isLexicalName(rule.name)) return false;
  return tokenize(rule.body).some(t => t.kind === 'id' && /^[a-z]/.test(t.text));
}

// 本体を走査して、参照・属性名・異常を取り出す。
function analyze(rule) {
  const toks = tokenize(rule.body);
  const refs = [], props = [], prefixes = [], badOps = [], badQuotes = [];
  const stack = [];
  const bracketErrors = [];
  const pairs = { ')': '(', ']': '[', '}': '{' };
  let inBrace = 0;
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i], nx = toks[i + 1];
    if (t.kind === 'badquote') { badQuotes.push(t.text); continue; }
    if (t.kind === 'op') {
      if ('([{'.includes(t.text)) { stack.push(t.text); if (t.text === '{') inBrace++; continue; }
      if (')]}'.includes(t.text)) {
        if (stack.at(-1) === pairs[t.text]) stack.pop();
        else bracketErrors.push(`余分な ${t.text}(${i + 1} 番目の字句)`);
        if (t.text === '}') inBrace = Math.max(0, inBrace - 1);
        continue;
      }
      if (['|', '*', '+', '?', '=', '+=', '?='].includes(t.text)) continue;
      // 「x.名前 =」の接頭辞は prefix として別に数える
      if (t.text === '.' && toks[i - 1]?.kind === 'id' && nx?.kind === 'id') continue;
      if (inBrace && t.text === '.') continue;
      badOps.push(t.text);
      continue;
    }
    if (t.kind !== 'id') continue;
    const isAssign = nx && nx.kind === 'op' && ['=', '+=', '?='].includes(nx.text);
    // { a.b = this } のような非解析の代入の中の「.」は属性のたどりなので、接頭辞として数えない。
    if (nx?.kind === 'op' && nx.text === '.' && toks[i + 2]?.kind === 'id') {
      if (!inBrace) prefixes.push(`${t.text}.${toks[i + 2].text}`);
      continue;
    }
    if (toks[i - 1]?.kind === 'op' && toks[i - 1].text === '.' && toks[i - 2]?.kind === 'id') {
      if (isAssign) props.push(t.text);
      continue;
    }
    if (isAssign) { props.push(t.text); continue; }
    if (inBrace) continue;               // { p = value } の value(属性名・this・true など)
    refs.push(t.text);
  }
  for (const s of stack) bracketErrors.push(`閉じていない ${s}`);
  return { refs, props, prefixes, badOps, badQuotes, bracketErrors };
}

// 仕様書のテキストの語の出現回数
const freq = new Map();
for (const d of dicts) {
  for (const w of fs.readFileSync(d, 'utf8').match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []) freq.set(w, (freq.get(w) ?? 0) + 1);
}
function editDistance(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 99;
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
        i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1] ? dp[i - 2][j - 2] + 1 : 99);
  return dp[a.length][b.length];
}
const vocab = [...freq.keys()];
// まれな語(3 回以下)で、その 3 倍以上(かつ 3 回以上)出る近い綴りがある(大文字と小文字だけの違いも含む)
function spellingSuspect(name) {
  if (!dicts.length) return null;
  const f = freq.get(name) ?? 0;
  if (f > 3) return null;
  let best = null;
  for (const w of vocab) {
    if (w === name) continue;
    // 先頭の 1 文字の大文字・小文字だけの違い(規則名と属性名の慣習)は綴りの誤りとみなさない
    if (w.slice(1) === name.slice(1) && w[0].toLowerCase() === name[0].toLowerCase()) continue;
    const fw = freq.get(w);
    if (fw < Math.max(3, 3 * f)) continue;
    const d = w.toLowerCase() === name.toLowerCase() ? 1 : editDistance(name, w);
    if (d <= 2 && (!best || d < best.d || (d === best.d && fw > best.f))) best = { w, d, f: fw };
  }
  return best ? { name, freq: f, similar: best.w, similarFreq: best.f, distance: best.d } : null;
}

const defined = sets.map(s => new Set(s.rules.map(r => r.name)));
const scope = (idx) => idx === 0 ? defined[0] : new Set([...defined[0], ...defined[1]]);
const stats = [];
const spellSeen = new Set();
sets.forEach((s, idx) => {
  const seen = new Map();
  const sc = scope(idx);
  let nRefs = 0;
  for (const r of s.rules) {
    if (seen.has(r.name)) add('duplicate', s.file, r, `${seen.get(r.name)} 行目の規則と同名`);
    else seen.set(r.name, r.fileLine);
    if (r.sep !== '=') add('header', s.file, r, r.sep === ':' ? `'=' の代わりに ':'(${r.header.trim()})` : `'=' がない(${r.header.trim()})`);
    const a = analyze(r);
    if (a.badQuotes.length) add('quote', s.file, r, `閉じ引用符がない: ${a.badQuotes.join(' / ')}`);
    if (a.bracketErrors.length) add('bracket', s.file, r, a.bracketErrors.join('、'));
    if (a.prefixes.length) add('prefix', s.file, r, `接頭辞の付いた属性名: ${a.prefixes.join(', ')}`);
    if (!isProse(r)) {
      if (a.badOps.length) add('operator', s.file, r, `引用符のない演算子: ${a.badOps.join(' ')}`);
      for (const ref of new Set(a.refs)) {
        nRefs++;
        if (!sc.has(ref)) add('undefined', s.file, r, `未定義の規則 ${ref}`);
      }
    }
    // 綴りを見る名前: 属性名、未定義の参照、規則の名前そのもの(定義と参照が同じ綴りで誤っている場合のため)
    const undefinedRefs = isProse(r) ? [] : a.refs.filter(x => !sc.has(x));
    for (const name of new Set([...a.props, ...undefinedRefs, r.name])) {
      const key = `${s.file}:${r.name}:${name}`;
      if (spellSeen.has(key)) continue;
      spellSeen.add(key);
      const sp = spellingSuspect(name);
      if (sp) add('spelling', s.file, r, `${a.props.includes(name) ? '属性名' : name === r.name ? '規則の名前' : '参照する規則名'} ${name}(仕様書で ${sp.freq} 回)。近い綴り ${sp.similar}(${sp.similarFreq} 回)`);
    }
  }
  stats.push({ file: s.file, rules: s.rules.length, refs: nRefs });
});

// 2 つのファイルにある同名の規則(合成では 2 つ目の側を採る)
let overridden = [];
if (sets.length === 2) overridden = [...defined[0]].filter(n => defined[1].has(n)).sort();

const count = {};
for (const f of findings) count[f.kind] = (count[f.kind] ?? 0) + 1;
console.log(JSON.stringify({ files, dicts, stats, count, overridden, findings }, null, 1));
