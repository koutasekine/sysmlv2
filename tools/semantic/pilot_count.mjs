// パイロット実装の検証の結果を、意味エラーの 12 項目ごとに数える(GR5 指示書 4 章)。
//
// 使い方:
//   node tools/semantic/pilot_count.mjs [--pilot out/pilot/validate] [--json <書き出す先>]
//
// 項目への振り分けは pilot_items.mjs による。あわせて、解決の失敗の内訳(S1・S3・種類によらない失敗)と、
// 振り分けに使わなかった検証の名前ごとの件数、Linking のエラーと解決の失敗の突き合わせを数える。

import fs from 'node:fs';
import path from 'node:path';
import { ITEMS, pilotItems, unresolvedKind } from './pilot_items.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
process.chdir(ROOT);
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const pilotDir = opt('--pilot', 'out/pilot/validate');
const jsonOut = opt('--json', null);

const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : 1)) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p); else if (p.endsWith('.json')) files.push(p);
  }
})(path.join(pilotDir, 'files'));

const count = Object.fromEntries(ITEMS.map(k => [k, 0]));
const filesWith = Object.fromEntries(ITEMS.map(k => [k, 0]));
const unresolved = { S1: 0, S3: 0, other: 0 };
const otherCodes = {};
const examples = Object.fromEntries(ITEMS.map(k => [k, []]));
let exceptions = 0, linking = 0, linkingWithoutUnresolved = 0, unresolvedWithoutLinking = 0;
for (const f of files) {
  const j = JSON.parse(fs.readFileSync(f, 'utf8'));
  if (j.exception) { exceptions++; continue; }
  const items = pilotItems(j);
  const seen = new Set();
  for (const it of items) {
    count[it.item]++;
    seen.add(it.item);
    if (examples[it.item].length < 5) examples[it.item].push({ file: j.file, offset: it.offset, length: it.length, text: it.ref?.text, message: it.message, anyType: it.ref?.anyType });
  }
  for (const k of seen) filesWith[k]++;
  for (const u of j.unresolved) unresolved[unresolvedKind(u)]++;
  const keyOf = (o, l) => o + ':' + l;
  const U = new Set(j.unresolved.map(u => keyOf(u.offset, u.length)));
  const L = new Set();
  for (const is of j.issues) {
    if (is.code === 'org.eclipse.xtext.diagnostics.Diagnostic.Linking') {
      linking++;
      L.add(keyOf(is.offset, is.length));
      if (!U.has(keyOf(is.offset, is.length))) linkingWithoutUnresolved++;
    }
    const used = items.some(it => it.issue === is);
    if (!used && is.code !== 'org.eclipse.xtext.diagnostics.Diagnostic.Linking') {
      const k = `${is.severity} ${is.code}`;
      otherCodes[k] = (otherCodes[k] ?? 0) + 1;
    }
  }
  for (const u of j.unresolved) if (!L.has(keyOf(u.offset, u.length))) unresolvedWithoutLinking++;
}
const summary = { files: files.length, exceptions, count, filesWith, unresolved, linking, linkingWithoutUnresolved, unresolvedWithoutLinking, otherCodes, examples };
for (const k of ITEMS) console.log(`${k}\t${count[k]}\t(${filesWith[k]} ファイル)`);
console.log(`files=${files.length} exceptions=${exceptions} unresolved=${JSON.stringify(unresolved)} linking=${linking} linkingWithoutUnresolved=${linkingWithoutUnresolved} unresolvedWithoutLinking=${unresolvedWithoutLinking}`);
if (jsonOut) { fs.mkdirSync(path.dirname(jsonOut), { recursive: true }); fs.writeFileSync(jsonOut, JSON.stringify(summary, null, 1) + '\n'); }
