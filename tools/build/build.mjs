// 単一 HTML のビルド(GR4 指示書 7 章、設計書 4 章)。外部のパッケージを使わない。
//
// 使い方:
//   node tools/build/build.mjs            # tools/build/config.json の outputs を書く(下の「書く先」)
//   node tools/build/build.mjs --check    # 書いた後に、外部の読み込みがないこと・2 回のビルドが同じバイト列になることを確かめる
//
// 書く先(GR23。設計書 11 章の「公開の形」):
//   作業ツリー(公開の元のフォルダ publish/ があるとき): dist/ の中を消して作り直し、公開のリポジトリと同じ形の木を置く。
//     置くものは tools/build/publish.json の公開の一覧だけ(generated はビルドが作るもの、copy は同じ相対パスで写すもの)。
//     outputs のうち publish のもの(1 つにまとめた HTML)は dist/index.html になる。
//   公開のリポジトリ(publish/ がないとき): outputs のうち publish のものをリポジトリの根の index.html に、
//     生成 AI 向けの指示文を docs/prompt_for_ai.md に書く(dist/ は作らない)。
//   publish でない outputs(相互接続ビューだけの HTML)は、どちらでも out/build/ に書く(公開しない)。
//
// やること:
//   1. ES モジュールの import・export を、1 つのスクリプトにまとめる(bundle)。各モジュールを関数で包み、依存の順に実行する。
//      import { a, b as c } from './x.js' → const { a, b: c } = __m_x;、import d from './x.js' → const d = __m_x.default;
//      export function・export const・export class は書き出しの一覧に入れ、export default は __default に入れる。
//      1 つの export const・export let に並べた名前(export const A = 1, B = 2;)は、すべて書き出す(GR25 の K。declaredNames)。
//      モジュールの間で名前がぶつからない。循環する import はエラーにする。
//      まとめた後に、各ファイルが読み込む名前が、読み込む先の書き出しにすべてあることを確かめ、1 つでもなければ、ファイルと名前を出して
//      ビルドを失敗させる(GR25 の K。設計書 4 章。checkHtmlImports。--check では件数も出す)。
//   2. Web Worker(src/app/worker.js から)をまとめたものを文字列 WORKER_SOURCE として、画面のスクリプトの前に入れる。
//      画面は Blob URL から Worker を作るので、file:// でも動く。
//   3. 「例を読み込む」の例(src/app/sample.sysml と、GR19 で足した入門用の src/app/sample_intro.sysml)と「書き方」(src/app/help.html)を、
//      文字列 SAMPLE_TEXT・SAMPLE_INTRO_TEXT・HELP_HTML として入れる。
//   4. src/app/template.html に CSS(src/app/style.css)とスクリプトを入れる。
// 出来上がった HTML には、時刻などビルドのたびに変わるものを入れない(同じソースから同じバイト列)。
//
// checkExternal(html) → [{ what, text }]: http・https で始まる読み込み(src・href・import・fetch・url() など)。
//   フッターの S Apps へのリンク(利用者がクリックしたときだけ開く <a>)は除く。

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');

// GR25 の K: export const・export let の宣言(src の位置 start から。キーワードの後ろ)に並べた名前の一覧。宣言の終わり(括弧の外の ;、
// または続きのない行末)までを読み、括弧・文字列・テンプレート・正規表現・注釈の外の , の後ろの名前を拾う。分割代入の形
// (export const { a } = …)は、まとめられないのでエラーにする
const ID = /[A-Za-z_$][\w$]*/y;
const REGEX_AFTER_WORD = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'do', 'else', 'yield', 'await']);
export function declaredNames(src, start, file = '') {
  const names = [];
  let i = start, depth = 0, expect = true, last = '';
  const fail = (why) => { throw new Error(`まとめられない export: ${file}: ${why}: ${src.slice(start, start + 60).split('\n')[0]}`); };
  // 空白と注釈を飛ばす(行末も飛ばす)
  const skipSpace = (j) => {
    for (;;) {
      if (/\s/.test(src[j] ?? '')) j++;
      else if (src.startsWith('//', j)) { while (j < src.length && src[j] !== '\n') j++; }
      else if (src.startsWith('/*', j)) { const e = src.indexOf('*/', j + 2); if (e < 0) fail('閉じない注釈'); j = e + 2; }
      else return j;
    }
  };
  const skipString = (j) => {
    const q = src[j++];
    while (j < src.length && src[j] !== q) {
      if (src[j] === '\\') { j += 2; continue; }
      if (src[j] === '\n') fail('閉じない文字列');
      j++;
    }
    if (j >= src.length) fail('閉じない文字列');
    return j + 1;
  };
  // テンプレート: ${ … } の中は、括弧の深さを数えて飛ばす(中の文字列・テンプレート・注釈も飛ばす)
  const skipTemplate = (j) => {
    j++;
    while (j < src.length && src[j] !== '`') {
      if (src[j] === '\\') j += 2;
      else if (src.startsWith('${', j)) j = skipBlock(j + 1);
      else j++;
    }
    if (j >= src.length) fail('閉じないテンプレート');
    return j + 1;
  };
  const skipRegex = (j) => {
    j++;
    let cls = false;
    while (j < src.length && (cls || src[j] !== '/')) {
      if (src[j] === '\n') fail('閉じない正規表現');
      if (src[j] === '\\') j++;
      else if (src[j] === '[') cls = true;
      else if (src[j] === ']') cls = false;
      j++;
    }
    j++;
    while (/[a-z]/.test(src[j] ?? '')) j++;
    return j;
  };
  // { から、対になる } の後ろまで(テンプレートの ${ … } に使う。中の / は割り算か正規表現かを前の字句で決める)
  function skipBlock(j) {
    let d = 0, prev = '{';
    for (;;) {
      if (j >= src.length) fail('閉じない括弧');
      const c = src[j];
      if (/\s/.test(c)) { j++; continue; }
      if (src.startsWith('//', j) || src.startsWith('/*', j)) { j = skipSpace(j); continue; }
      if (c === '\'' || c === '"') { j = skipString(j); prev = 'v'; continue; }
      if (c === '`') { j = skipTemplate(j); prev = 'v'; continue; }
      if (c === '/') { if (regexHere(prev)) { j = skipRegex(j); prev = 'v'; } else { j++; prev = '/'; } continue; }
      if ('([{'.includes(c)) { d++; j++; prev = c; continue; }
      if (')]}'.includes(c)) { d--; j++; prev = c; if (d === 0) return j; continue; }
      ID.lastIndex = j;
      const w = ID.exec(src);
      if (w) { j += w[0].length; prev = REGEX_AFTER_WORD.has(w[0]) ? '=' : 'v'; continue; }
      if (/[0-9.]/.test(c)) { j++; prev = 'v'; continue; }
      j++; prev = c;
    }
  }
  // 前の字句が値(名前・数・文字列・閉じ括弧)なら / は割り算、そうでなければ正規表現
  const regexHere = (prev) => !(prev === 'v' || prev === ')' || prev === ']' || prev === '}');
  // 行末で宣言が続くか: 行末の前の字句が演算子・, ・開き括弧か、次の行が演算子などで始まるとき
  const continues = (j) => {
    if (last === '' || /^[,=+\-*/%&|^!~?:<>([{]$/.test(last) || last === '=>') return true;
    const k = skipSpace(j);
    if (k >= src.length) return false;
    if (/^(?:\.(?!\.\.)|\?|:|[+\-*/%&|^=<>,)\]}])/.test(src.slice(k, k + 2))) return true;
    return /^(?:in|instanceof)\b/.test(src.slice(k, k + 11));
  };
  for (;;) {
    if (i >= src.length) break;
    const c = src[i];
    if (c === '\n' && depth === 0) { if (!continues(i)) break; i++; continue; }
    if (/\s/.test(c)) { i++; continue; }
    if (src.startsWith('//', i)) { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (src.startsWith('/*', i)) { const e = src.indexOf('*/', i + 2); if (e < 0) fail('閉じない注釈'); i = e + 2; continue; }
    if (expect) {
      ID.lastIndex = i;
      const w = ID.exec(src);
      if (!w) fail('名前でない宣言(分割代入など)');
      names.push(w[0]); i += w[0].length; expect = false; last = 'v';
      continue;
    }
    if (c === '\'' || c === '"') { i = skipString(i); last = 'v'; continue; }
    if (c === '`') { i = skipTemplate(i); last = 'v'; continue; }
    if (c === '/') { if (regexHere(last)) { i = skipRegex(i); last = 'v'; } else { i++; last = '/'; } continue; }
    if ('([{'.includes(c)) { depth++; i++; last = c; continue; }
    if (')]}'.includes(c)) { depth--; if (depth < 0) fail('対にならない括弧'); i++; last = c; continue; }
    if (c === ';' && depth === 0) break;
    if (c === ',' && depth === 0) { expect = true; i++; last = ','; continue; }
    if (src.startsWith('=>', i)) { i += 2; last = '=>'; continue; }
    ID.lastIndex = i;
    const w = ID.exec(src);
    if (w) { i += w[0].length; last = REGEX_AFTER_WORD.has(w[0]) ? '=' : 'v'; continue; }
    if (/[0-9]/.test(c)) { while (/[\w.]/.test(src[i] ?? '')) i++; last = 'v'; continue; }
    i++; last = c;
  }
  if (depth !== 0) fail('閉じない括弧');
  if (!names.length) fail('名前がない');
  return names;
}

// GR25 の K(設計書 4 章): まとめたスクリプト(bundle の出力)の中で、各ファイルが読み込む名前(const { … } = __mN; と __mN.default、
// 書き出し直しの __mN.x)のすべてが、__mN の書き出し(return { … })にあるかを確かめる。
// → { modules: ファイルの数, names: 確かめた名前の数, missing: [{ file: 読み込むファイル, from: 読み込む先のファイル, name }] }
export function checkBundleImports(code) {
  const mods = new Map(); // __mN → { file, exports: Set, body }
  const heads = [...code.matchAll(/^\/\/ ---- (.+)\nconst (__m\d+) = \(\(\) => \{\n/gm)];
  heads.forEach((h, k) => {
    const body = code.slice(h.index + h[0].length, k + 1 < heads.length ? heads[k + 1].index : code.length);
    const ret = /\nreturn \{ (.*) \};\n\}\)\(\);\n*$/.exec(body);
    if (!ret) throw new Error(`まとめたスクリプトの ${h[1]} に書き出し(return { … })がない`);
    const entries = ret[1].split(',').map((s) => s.trim()).filter(Boolean);
    mods.set(h[2], { file: h[1], exports: new Set(entries.map((s) => s.split(':')[0].trim())), body: body.slice(0, ret.index), entries });
  });
  const missing = [];
  let names = 0;
  const need = (who, id, name) => {
    names++;
    const m = mods.get(id);
    if (!m || !m.exports.has(name)) missing.push({ file: who, from: m?.file ?? id, name });
  };
  for (const { file, body, entries } of mods.values()) {
    for (const x of body.matchAll(/^const \{ (.*) \} = (__m\d+);$/gm)) for (const s of x[1].split(',')) need(file, x[2], s.split(':')[0].trim());
    for (const x of body.matchAll(/^const [A-Za-z_$][\w$]* = (__m\d+)\.default;$/gm)) need(file, x[1], 'default');
    for (const s of entries) { const x = /:\s*(__m\d+)\.([A-Za-z_$][\w$]*)$/.exec(s); if (x) need(file, x[1], x[2]); }
  }
  return { modules: mods.size, names, missing };
}
// まとめた HTML(buildHtml の出力)の、画面のスクリプトと Worker のスクリプト(WORKER_SOURCE の文字列)の両方を確かめる
export function checkHtmlImports(html) {
  const w = /\nconst WORKER_SOURCE = ("(?:[^"\\\n]|\\.)*");\n/.exec(html);
  if (!w) throw new Error('まとめた HTML に WORKER_SOURCE がない');
  const worker = checkBundleImports(JSON.parse(w[1].replace(/<\\!--/g, '<!--')));
  const end = html.indexOf('\n</script>', w.index);
  if (end < 0) throw new Error('まとめた HTML のスクリプトの終わりがない');
  const main = checkBundleImports(html.slice(w.index + w[0].length, end + 1));
  return { modules: worker.modules + main.modules, names: worker.names + main.names, missing: [...worker.missing.map((x) => ({ ...x, in: 'Worker' })), ...main.missing.map((x) => ({ ...x, in: '画面' }))] };
}
const missingText = (r) => r.missing.map((x) => `${x.file}(${x.in})が ${x.from} から読み込む「${x.name}」`).join('、');

export function bundle(entry) {
  const mods = new Map(); // 絶対パス → { id, deps, code }
  const order = [];
  const visiting = new Set();
  let n = 0;
  const load = (file, from) => {
    if (mods.has(file)) return mods.get(file);
    if (visiting.has(file)) throw new Error(`循環する import: ${path.relative(ROOT, from)} → ${path.relative(ROOT, file)}`);
    visiting.add(file);
    const src = fs.readFileSync(file, 'utf8');
    const lines = src.split('\n');
    const lineAt = []; // 行の先頭の位置
    for (let i = 0, p = 0; i < lines.length; p += lines[i].length + 1, i++) lineAt.push(p);
    const rel0 = path.relative(ROOT, file);
    const out = [];
    const exportsList = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      let m;
      if ((m = /^import\s+\{([^}]*)\}\s+from\s+'([^']+)';\s*$/.exec(line))) {
        const dep = load(path.resolve(path.dirname(file), m[2]), file);
        const names = m[1].split(',').map((s) => s.trim()).filter(Boolean).map((s) => s.replace(/^(\S+)\s+as\s+(\S+)$/, '$1: $2'));
        out.push(`const { ${names.join(', ')} } = ${dep.id};`);
      } else if ((m = /^import\s+([A-Za-z_$][\w$]*)\s+from\s+'([^']+)';\s*$/.exec(line))) {
        const dep = load(path.resolve(path.dirname(file), m[2]), file);
        out.push(`const ${m[1]} = ${dep.id}.default;`);
      } else if ((m = /^export\s+\{([^}]*)\}\s+from\s+'([^']+)';\s*$/.exec(line))) {
        const dep = load(path.resolve(path.dirname(file), m[2]), file);
        for (const s of m[1].split(',').map((x) => x.trim()).filter(Boolean)) {
          const [a, b] = s.split(/\s+as\s+/);
          exportsList.push(`${b ?? a}: ${dep.id}.${a}`);
        }
        out.push('');
      } else if ((m = /^export\s+\{([^}]*)\};\s*$/.exec(line))) {
        for (const s of m[1].split(',').map((x) => x.trim()).filter(Boolean)) {
          const [a, b] = s.split(/\s+as\s+/);
          exportsList.push(b ? `${b}: ${a}` : a);
        }
        out.push('');
      } else if ((m = /^export\s+default\s+(.*)$/.exec(line))) {
        out.push(`const __default = ${m[1]}`);
        exportsList.push('default: __default');
      } else if ((m = /^export\s+(const|let)\s+/.exec(line))) {
        // GR25 の K: 1 つの宣言に並べた名前(export const A = 1, B = 2;)をすべて書き出す。宣言は複数の行にまたがってよい
        out.push(line.replace(/^export\s+/, ''));
        exportsList.push(...declaredNames(src, lineAt[i] + m[0].length, rel0));
      } else if ((m = /^export\s+(async\s+function|function|class)\s+([A-Za-z_$][\w$]*)/.exec(line))) {
        out.push(line.replace(/^export\s+/, ''));
        exportsList.push(m[2]);
      } else if (/^(import|export)\b/.test(line)) {
        throw new Error(`まとめられない import・export: ${path.relative(ROOT, file)}: ${line}`);
      } else out.push(line);
    }
    visiting.delete(file);
    const id = `__m${n++}`;
    const rel = path.relative(ROOT, file);
    const code = `// ---- ${rel}\nconst ${id} = (() => {\n${out.join('\n')}\nreturn { ${exportsList.join(', ')} };\n})();\n`;
    const mod = { id, code };
    mods.set(file, mod);
    order.push(mod);
    return mod;
  };
  load(path.resolve(ROOT, entry), null);
  return order.map((m) => m.code).join('\n');
}

// <script> の中に入れても、要素の終わりや注釈の始まりと読まれないようにする(文字列・正規表現の中の </script と <!--)
const scriptSafe = (s) => s.replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--');
const jsString = (s) => scriptSafe(JSON.stringify(s));

export function buildHtml(out) {
  const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
  const worker = bundle('src/app/worker.js');
  const main = bundle('src/app/main.js');
  const help = read('src/app/help.html').replace(/^<!--[\s\S]*?-->\n/, '');
  const script = [
    `'use strict';`,
    `const WORKER_SOURCE = ${jsString(`'use strict';\n${worker}`)};`,
    `const SAMPLE_TEXT = ${jsString(read('src/app/sample.sysml'))};`,
    `const SAMPLE_INTRO_TEXT = ${jsString(read('src/app/sample_intro.sysml'))};`,
    `const HELP_HTML = ${jsString(help)};`,
    `const ENABLED_VIEWS = ${JSON.stringify(out.views)};`,
    scriptSafe(main),
  ].join('\n');
  const tpl = read('src/app/template.html');
  if (!tpl.includes('/*@@CSS@@*/') || !tpl.includes('/*@@SCRIPT@@*/')) throw new Error('雛形に差し込む場所がない');
  // 置き換えの文字列の $ を特別に扱わせないため、関数で置き換える
  const html = tpl.replace('/*@@CSS@@*/', () => read('src/app/style.css').trimEnd()).replace('/*@@SCRIPT@@*/', () => script);
  // GR25 の K(設計書 4 章): 読み込む名前が、読み込む先の書き出しにすべてあること。なければビルドを失敗させる
  const r = checkHtmlImports(html);
  if (r.missing.length) throw new Error(`まとめた HTML の中で、読み込む名前が書き出しにない(${r.missing.length} 件): ${missingText(r)}`);
  return html;
}

export function checkExternal(html) {
  const found = [];
  const allowed = '<a href="https://sapp.jp" target="_blank" rel="noopener">S Apps</a>';
  const body = html.split(allowed).join('');
  const pats = [
    [/\b(?:src|href|xlink:href|action|poster|data)\s*=\s*["']?\s*https?:/gi, '属性の URL'],
    [/\burl\(\s*["']?\s*https?:/gi, 'CSS の url()'],
    [/@import\b/gi, 'CSS の @import'],
    [/\bimport\s*\(\s*["'`]\s*https?:/gi, '動的 import'],
    [/\bimport\s+[^;]*?from\s*["']https?:/gi, 'import'],
    [/\bfetch\s*\(\s*["'`]\s*https?:/gi, 'fetch'],
    [/\bimportScripts\s*\(\s*["'`]\s*https?:/gi, 'importScripts'],
    [/\bnew\s+(?:Worker|SharedWorker|EventSource|WebSocket)\s*\(\s*["'`]\s*(?:https?|wss?):/gi, 'Worker・接続'],
    [/\.open\s*\(\s*["'][A-Z]+["']\s*,\s*["'`]\s*https?:/gi, 'XMLHttpRequest'],
    [/<link\b[^>]*>/gi, '<link>'],
    [/<(?:iframe|embed|object|img|audio|video|source)\b[^>]*\bsrc\s*=/gi, '外部を読み込む要素'],
  ];
  for (const [re, what] of pats) for (const m of body.matchAll(re)) found.push({ what, text: body.slice(m.index, m.index + 80) });
  return found;
}

// ---- 公開の形(GR23 指示書 3.2 節、設計書 11 章の「公開の形」)
//
// 生成 AI 向けの指示文: 「書き方」(src/app/help.html)の <pre id="aiPrompt"> の中身を、画面の「コピー」と同じ文字(textContent)にする。
// 中にタグや知らない文字参照があれば、textContent と同じにできるとは言えないので、エラーにする。
export function aiPromptText(helpHtml) {
  const m = /<pre id="aiPrompt">([\s\S]*?)<\/pre>/.exec(helpHtml);
  if (!m) throw new Error('help.html に <pre id="aiPrompt"> がない');
  let s = m[1];
  if (/</.test(s)) throw new Error('aiPrompt の中にタグがある');
  // HTML の解析は、<pre> の開始タグの直後の改行 1 つを捨てる
  if (s.startsWith('\n')) s = s.slice(1);
  const named = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };
  return s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[A-Za-z]+);?/g, (all, e) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    if (e in named) return named[e];
    throw new Error(`aiPrompt の中に知らない文字参照がある: ${all}`);
  });
}
// docs/prompt_for_ai.md: 頭に使い方の説明を付け、指示文の本文を囲みの中にそのまま置く(囲みの中の文が、画面の「コピー」で写す文と同じ)
export const PROMPT_FENCE = '```text';
export function promptForAi(helpHtml) {
  const body = aiPromptText(helpHtml);
  if (body.includes('```')) throw new Error('指示文に ``` がある');
  if (!body.endsWith('\n')) throw new Error('指示文が改行で終わらない');
  return [
    '# 生成 AI 向けプロンプト',
    '',
    'この文書の囲みの中の指示文を生成 AI に最初に渡し、最後の「システム:」の後ろに、作りたいシステムの説明を書き足してください。返ってきたテキストを SysML v2 のアプリ(https://sysmlv2.sapp.jp)の左のテキスト欄に貼ると、図になります。',
    '',
    PROMPT_FENCE,
    body + '```',
    '',
  ].join('\n');
}
// docs/prompt_for_ai.md から、囲みの中の文を取り出す(検査で、index.html の「コピー」の文と比べるのに使う)
export function promptFromMd(md) {
  const lines = md.split('\n');
  const a = lines.indexOf(PROMPT_FENCE);
  const b = lines.indexOf('```', a + 1);
  if (a < 0 || b < 0) throw new Error('prompt_for_ai.md に囲みがない');
  return lines.slice(a + 1, b).join('\n') + '\n';
}
// ビルドした index.html から、HELP_HTML の文字列を取り出す(scriptSafe・jsString の逆)
export function helpFromIndex(html) {
  const m = /\nconst HELP_HTML = ("(?:[^"\\\n]|\\.)*");\n/.exec(html);
  if (!m) throw new Error('index.html に HELP_HTML がない');
  return JSON.parse(m[1].replace(/<\\!--/g, '<!--'));
}

// 公開のリポジトリの木を、相対パス → バイト列の表として作る。publish は tools/build/publish.json
export function buildTree(config, publish) {
  const tree = new Map();
  const put = (p, data) => {
    if (tree.has(p)) throw new Error(`同じパスを 2 度置く: ${p}`);
    tree.set(p, Buffer.isBuffer(data) ? data : Buffer.from(data));
  };
  const read = (p) => {
    const st = fs.lstatSync(path.join(ROOT, p));
    if (st.isSymbolicLink() || !st.isFile()) throw new Error(`ふつうのファイルでない: ${p}`);
    return fs.readFileSync(path.join(ROOT, p));
  };
  for (const out of config.outputs) if (out.publish) put(out.file, buildHtml(out));
  const help = fs.readFileSync(path.join(ROOT, 'src/app/help.html'), 'utf8');
  for (const [p, how] of Object.entries(publish.generated)) {
    if (tree.has(p)) continue; // index.html(上で置いた)
    if (p === 'docs/prompt_for_ai.md') put(p, promptForAi(help));
    else if (typeof how === 'object' && how.from) put(p, read(how.from));
    else throw new Error(`作り方のわからない generated: ${p}`);
  }
  for (const p of publish.copy) put(p, read(p));
  const missing = Object.keys(publish.generated).filter((p) => !tree.has(p));
  if (missing.length) throw new Error(`generated のうち作っていないもの: ${missing.join(', ')}`);
  return tree;
}

// dist/ の中だけを消す(dist/ そのものと、dist/ の外は消さない)
function clearDist() {
  const d = path.join(ROOT, 'dist');
  if (fs.existsSync(d)) {
    if (fs.lstatSync(d).isSymbolicLink()) throw new Error('dist/ がシンボリックリンク');
    for (const e of fs.readdirSync(d)) fs.rmSync(path.join(d, e), { recursive: true, force: true });
  } else fs.mkdirSync(d);
}

const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
// --check: まとめた HTML の読み込む名前の確かめ(buildHtml でも確かめているが、件数を出す)。→ 合格なら true
function reportImports(html, what = '') {
  const r = checkHtmlImports(html);
  console.log(`  読み込む名前がすべて書き出しにある${what ? `(${what})` : ''}: ${r.missing.length ? `いいえ(${missingText(r)})` : 'はい'}(${r.modules} ファイル、${r.names} 個の名前)`);
  return !r.missing.length;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  process.chdir(ROOT);
  const config = JSON.parse(fs.readFileSync('tools/build/config.json', 'utf8'));
  const check = process.argv.includes('--check');
  // 作業ツリー(公開の元 publish/ があるとき): dist/ を作り直し、公開のリポジトリの木を置く。
  // 公開のリポジトリ(publish/ がないとき): 公開する出力(index.html と docs/prompt_for_ai.md)を、リポジトリの根に書く。
  const work = fs.existsSync('publish/README.md');
  let bad = 0;
  const writeFile = (p, data) => {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, data);
  };
  // 公開しない出力(ビューごとの HTML)は、どちらでも書かれたパスに書く
  for (const out of config.outputs.filter((o) => !o.publish)) {
    const html = buildHtml(out);
    writeFile(out.file, html);
    console.log(`${out.file}: ${Buffer.byteLength(html)} バイト sha256=${sha(html).slice(0, 16)}…`);
    if (check) {
      const same = buildHtml(out) === html;
      const ext = checkExternal(html);
      console.log(`  2 回のビルドが同じバイト列: ${same ? 'はい' : 'いいえ'}、外部の読み込み: ${ext.length} 件`);
      for (const x of ext) console.log(`    ${x.what}: ${x.text}`);
      if (!same || ext.length) bad++;
      if (!reportImports(html)) bad++;
    }
  }
  const main = config.outputs.find((o) => o.publish);
  if (work) {
    const publish = JSON.parse(fs.readFileSync('tools/build/publish.json', 'utf8'));
    const tree = buildTree(config, publish);
    clearDist();
    for (const [p, data] of tree) writeFile(path.join('dist', p), data);
    const total = [...tree.values()].reduce((a, b) => a + b.length, 0);
    console.log(`dist/: ${tree.size} ファイル、${total} バイト`);
    console.log(`dist/${main.file}: ${tree.get(main.file).length} バイト sha256=${sha(tree.get(main.file)).slice(0, 16)}…`);
    if (check) {
      const again = buildTree(config, publish);
      const diff = [...new Set([...tree.keys(), ...again.keys()])].filter((p) => !tree.has(p) || !again.has(p) || !tree.get(p).equals(again.get(p)));
      console.log(`  2 回のビルドで dist/ の全ファイルが同じバイト列: ${diff.length ? `いいえ(${diff.join(', ')})` : 'はい'}`);
      const ext = checkExternal(tree.get(main.file).toString('utf8'));
      console.log(`  外部の読み込み(dist/${main.file}): ${ext.length} 件`);
      for (const x of ext) console.log(`    ${x.what}: ${x.text}`);
      if (diff.length || ext.length) bad++;
      if (!reportImports(tree.get(main.file).toString('utf8'), `dist/${main.file}`)) bad++;
      // 公開する前の検査 1・2・4(tools/build/verify.mjs。作業ツリーにだけある道具。verify.mjs がこのファイルを読み込むので、別のプロセスで流す)
      try {
        execFileSync(process.execPath, ['tools/build/verify.mjs'], { stdio: 'inherit' });
      } catch {
        bad++;
      }
    }
  } else {
    const html = buildHtml(main);
    writeFile(main.file, html);
    console.log(`${main.file}: ${Buffer.byteLength(html)} バイト sha256=${sha(html).slice(0, 16)}…`);
    writeFile('docs/prompt_for_ai.md', promptForAi(fs.readFileSync('src/app/help.html', 'utf8')));
    console.log('docs/prompt_for_ai.md');
    if (check) {
      const same = buildHtml(main) === html;
      const ext = checkExternal(html);
      console.log(`  2 回のビルドが同じバイト列: ${same ? 'はい' : 'いいえ'}、外部の読み込み: ${ext.length} 件`);
      for (const x of ext) console.log(`    ${x.what}: ${x.text}`);
      if (!same || ext.length) bad++;
      if (!reportImports(html)) bad++;
    }
  }
  if (bad) process.exitCode = 1;
}
