// 仕様書本文の文法を抜き出す(GR1 指示書 4.1 節)。
//
// 使い方:
//   node tools/grammar/extract.mjs kerml10   # KerML 1.0 の 8.2 節 → grammar/kerml10_body.ebnf
//   node tools/grammar/extract.mjs sysml20   # SysML 2.0 の 8.2.2 節 → grammar/sysml20_body.ebnf
//   node tools/grammar/extract.mjs kerml11b2 / sysml21b2   # 2.1 Beta 2 本文 → out/grammar/(比較用)
//
// PDF を `pdftotext -layout` で out/text/ にテキストにし、その行番号を各規則に注記する。
// 本文の誤りは直さない。取り除くのは、ページの見出し(ページ番号と文書名の行)、
// 改ページの空行、注(Notes)、規則の後ろの「(See Note N)」、説明文と表だけ。
// 予約語と記号の列挙は、本文の語の並びのまま、引用符で囲んで選択肢の形にする
// (RESERVED_KEYWORD・SYMBOL。'|' でつなぐ以外の変更はしない)。

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { matchHeader } from './ebnf.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');

const PRESETS = {
  kerml10: {
    pdf: 'vendor/release-2026-03/doc/1-Kernel_Modeling_Language.pdf',
    text: 'out/text/kerml10.txt',
    out: 'grammar/kerml10_body.ebnf',
    title: 'KerML 1.0(formal/2026-03-01)8.2 節',
    footer: /^\s*(\d+\s+Kernel Modeling Language v1\.0|Kernel Modeling Language v1\.0\s+\d+)\s*$/,
    start: /^8\.2 Concrete Syntax\s*$/,
    end: /^8\.3 Abstract Syntax\s*$/,
    // 予約語・記号の列挙がある節
    keywordSections: ['8.2.2.6'],
    symbolSections: ['8.2.2.7'],
    indentedRuleSections: [],
  },
  sysml20: {
    pdf: 'vendor/release-2026-03/doc/2a-OMG_Systems_Modeling_Language.pdf',
    text: 'out/text/sysml20.txt',
    out: 'grammar/sysml20_body.ebnf',
    title: 'SysML 2.0(formal/2026-03-02)8.2.2 節',
    footer: /^\s*(\d+\s+Systems Modeling Language v2\.0, Part 1|Systems Modeling Language v2\.0, Part 1\s+\d+)\s*$/,
    start: /^8\.2\.2 Textual Notation\s*$/,
    end: /^8\.2\.3 Graphical Notation\s*$/,
    keywordSections: ['8.2.2.1.2'],
    symbolSections: [],
    // 番号付きの項目の中に字下げして書かれた規則(DEFINED_BY など)がある節
    indentedRuleSections: ['8.2.2.1.2'],
  },
  // 2.1 Beta 2 本文(タグ 2026-08)。手当ての根拠を確かめる比較用。out/ に書く。
  kerml11b2: {
    pdf: 'vendor/release-2026-08/doc/1-Kernel_Modeling_Language.pdf',
    text: 'out/text/kerml11b2.txt',
    out: 'out/grammar/kerml11b2_body.ebnf',
    title: 'KerML 1.1 Beta 2(タグ 2026-08)8.2 節',
    footer: /^\s*(\d+\s+Kernel Modeling Language v1\.1, Beta 2|Kernel Modeling Language v1\.1, Beta 2\s+\d+)\s*$/,
    start: /^8\.2 Concrete Syntax\s*$/,
    end: /^8\.3 Abstract Syntax\s*$/,
    keywordSections: ['8.2.2.6'],
    symbolSections: ['8.2.2.7'],
    indentedRuleSections: [],
  },
  sysml21b2: {
    pdf: 'vendor/release-2026-08/doc/2a-OMG_Systems_Modeling_Language.pdf',
    text: 'out/text/sysml21b2.txt',
    out: 'out/grammar/sysml21b2_body.ebnf',
    title: 'SysML 2.1 Beta 2(タグ 2026-08)8.2.2 節',
    footer: /^\s*(\d+\s+Systems Modeling Language v2\.1, Beta 2, Part 1|Systems Modeling Language v2\.1, Beta 2, Part 1\s+\d+)\s*$/,
    start: /^8\.2\.2 Textual Notation\s*$/,
    end: /^8\.2\.3 Graphical Notation\s*$/,
    keywordSections: ['8.2.2.1.2'],
    symbolSections: [],
    indentedRuleSections: ['8.2.2.1.2'],
  },
};

const HEADING_RE = /^(8\.2(?:\.\d+)+)\s+(\S.*?)\s*$/;
const SEE_NOTE_RE = /^\s*\((see|See) Note \d+\)\s*$/;

function extract(cfg) {
  const pdf = path.join(ROOT, cfg.pdf);
  const textPath = path.join(ROOT, cfg.text);
  fs.mkdirSync(path.dirname(textPath), { recursive: true });
  execFileSync('pdftotext', ['-layout', pdf, textPath]);
  // pdftotext は改ページに \f を入れる。行番号を変えないよう、\f だけを消す。
  const lines = fs.readFileSync(textPath, 'utf8').split('\n').map(l => l.replace(/\f/g, '').replace(/\s+$/, ''));

  const startIdx = lines.findIndex(l => cfg.start.test(l));
  const endIdx = lines.findIndex((l, i) => i > startIdx && cfg.end.test(l));
  if (startIdx < 0 || endIdx < 0) throw new Error('抜き出す範囲の見出しが見つからない');

  const items = [];        // {kind:'section'|'rule'|'list', ...}
  const removedFooters = [];
  let section = null;
  let rule = null;         // 抜き出し中の規則
  let pendingBlank = 0;
  let listBuf = null;      // 予約語・記号の列挙

  const endRule = () => {
    if (rule) { items.push(rule); rule = null; }
    pendingBlank = 0;
  };
  const endList = () => {
    if (listBuf) { items.push(listBuf); listBuf = null; }
  };

  for (let i = startIdx; i < endIdx; i++) {
    const ln = i + 1;          // テキストの行番号(1 始まり)
    const line = lines[i];

    if (cfg.footer.test(line)) { removedFooters.push(ln); continue; }

    const h = HEADING_RE.exec(line);
    if (h) {
      endRule(); endList();
      section = h[1];
      items.push({ kind: 'section', section, title: h[2], line: ln });
      continue;
    }

    // 予約語の列挙: 英小文字の語だけからなる字下げした行(本文の段落の行は句読点を含む)。
    if (cfg.keywordSections.includes(section) && /^\s*[a-z]+( +[a-z]+){3,}$/.test(line)) {
      endRule();
      if (!listBuf || listBuf.name !== 'RESERVED_KEYWORD') { endList(); listBuf = { kind: 'list', name: 'RESERVED_KEYWORD', section, words: [], lines: [] }; }
      listBuf.words.push(...line.trim().split(/\s+/));
      listBuf.lines.push(ln);
      continue;
    }
    // 記号の列挙: 英数字を含まない字句だけからなる行。
    if (cfg.symbolSections.includes(section) && /^[^A-Za-z0-9]+$/.test(line) && line.trim().split(/\s+/).length > 5) {
      endRule();
      if (!listBuf || listBuf.name !== 'SYMBOL') { endList(); listBuf = { kind: 'list', name: 'SYMBOL', section, words: [], lines: [] }; }
      listBuf.words.push(...line.trim().split(/\s+/));
      listBuf.lines.push(ln);
      continue;
    }
    if (line.trim() !== '') endList();

    if (line.trim() === '') { if (rule) pendingBlank++; continue; }

    // 字下げした規則(SysML の DEFINED_BY など)。
    if (cfg.indentedRuleSections.includes(section) && /^\s+[A-Z][A-Z_]*\s*=/.test(line)) {
      endRule();
      const hd = matchHeader(line.trim());
      items.push({ kind: 'rule', name: hd.name, section, header: line.trim(), body: [], start: ln, end: ln });
      continue;
    }

    if (!/^\s/.test(line)) {
      const hd = matchHeader(line);
      endRule();
      if (hd && !/^(Table|Notes)\b/.test(line)) {
        rule = { kind: 'rule', name: hd.name, section, header: line, body: [], start: ln, end: ln };
      }
      continue;
    }

    // 字下げした行: 規則の続き(改ページをまたぐ場合を含む)。注の項目などは捨てる。
    if (rule) {
      if (SEE_NOTE_RE.test(line)) { rule.seeNote = ln; continue; }
      rule.body.push({ text: line, ln });
      rule.end = ln;
      pendingBlank = 0;
    }
  }
  endRule(); endList();

  // 書き出し
  const out = [];
  out.push(`// ${cfg.title} の文法を、本文のとおりに抜き出したもの(誤りを含む)。`);
  out.push(`// 生成: node tools/grammar/extract.mjs ${cfg.key}`);
  out.push(`// 抜き出し元: ${cfg.pdf} を pdftotext -layout でテキストにした ${cfg.text}`);
  out.push(`// 各規則の「// @src L開始-L終了」は、そのテキストの行番号。`);
  out.push(`// RESERVED_KEYWORD・SYMBOL は、本文の列挙を引用符で囲んで '|' でつないだもの。`);
  out.push('');
  let nRules = 0;
  for (const it of items) {
    if (it.kind === 'section') {
      out.push(`// ${it.section} ${it.title}`);
      out.push('');
    } else if (it.kind === 'list') {
      out.push(`// @src L${it.lines[0]}-L${it.lines.at(-1)}`);
      out.push(`${it.name} =`);
      const q = it.words.map(w => `'${w}'`);
      for (let k = 0; k < q.length; k += 10) {
        out.push(`    ${k === 0 ? '  ' : '| '}${q.slice(k, k + 10).join(' | ')}`);
      }
      out.push('');
      nRules++;
    } else {
      out.push(`// @src L${it.start}-L${it.end}`);
      out.push(it.header);
      for (const b of it.body) out.push(b.text);
      out.push('');
      nRules++;
    }
  }
  const outPath = path.join(ROOT, cfg.out);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, out.join('\n'));
  console.log(`${cfg.out}: 規則 ${nRules} 件、範囲 L${startIdx + 1}-L${endIdx}、取り除いたページ見出し ${removedFooters.length} 行`);
}

const key = process.argv[2];
if (!PRESETS[key]) {
  console.error(`使い方: node tools/grammar/extract.mjs <${Object.keys(PRESETS).join('|')}>`);
  process.exit(2);
}
extract({ ...PRESETS[key], key });
