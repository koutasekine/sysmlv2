// 2.1 Beta 2 本文(タグ 2026-08)から、課題番号付きの注記(KERML11-数字: / SYSML21-数字:)を、
// その注記がある節と一緒にすべて集める(GR1 指示書 4.3 節)。
//
// 使い方:
//   node tools/grammar/issues.mjs   # → grammar/issues_21b2.json
//
// 注記は、変更のあった節の見出しの直後(または改ページの直後)に 1 行ずつ置かれている。
// 題が長いと次の行に折り返すので、直後の短い行で、見出しでも注記でもないものは題の続きとして連結する。

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const DOCS = [
  { doc: 'KerML 1.1 Beta 2', pdf: 'vendor/release-2026-08/doc/1-Kernel_Modeling_Language.pdf', text: 'out/text/kerml11b2.txt' },
  { doc: 'SysML 2.1 Beta 2', pdf: 'vendor/release-2026-08/doc/2a-OMG_Systems_Modeling_Language.pdf', text: 'out/text/sysml21b2.txt' },
];
const ISSUE_RE = /^((?:KERML11|SYSML21)-\d+):\s*(.*)$/;
// 本文の節見出し(目次は字下げされているので拾わない)。附属書(A.1 など)も拾う。
const HEADING_RE = /^((?:\d+|[A-Z])(?:\.\d+)+|\d+)\s+([A-Z].*)$/;

const notes = [];
for (const d of DOCS) {
  const textPath = path.join(ROOT, d.text);
  fs.mkdirSync(path.dirname(textPath), { recursive: true });
  execFileSync('pdftotext', ['-layout', path.join(ROOT, d.pdf), textPath]);
  const lines = fs.readFileSync(textPath, 'utf8').split('\n').map(l => l.replace(/\f/g, '').replace(/\s+$/, ''));
  let section = null, sectionTitle = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const h = HEADING_RE.exec(line);
    if (h && !ISSUE_RE.test(line)) { section = h[1]; sectionTitle = h[2]; continue; }
    const m = ISSUE_RE.exec(line);
    if (!m) continue;
    let title = m[2];
    const next = lines[i + 1] ?? '';
    const after = lines[i + 2] ?? '';
    if (next.trim() !== '' && !ISSUE_RE.test(next) && !HEADING_RE.test(next) && !/^\s/.test(next)
        && next.length < 60 && (after.trim() === '' || ISSUE_RE.test(after))) {
      title += ' ' + next.trim();
    }
    notes.push({ issue: m[1], title, doc: d.doc, section, sectionTitle, line: i + 1, text: d.text });
  }
}

const out = path.join(ROOT, 'grammar/issues_21b2.json');
fs.writeFileSync(out, JSON.stringify({
  generatedBy: 'node tools/grammar/issues.mjs',
  source: DOCS.map(d => `${d.pdf} → ${d.text}`),
  count: notes.length,
  notes,
}, null, 1) + '\n');
const ids = new Set(notes.map(n => n.issue));
console.log(`grammar/issues_21b2.json: 注記 ${notes.length} 件、課題番号 ${ids.size} 種`);
