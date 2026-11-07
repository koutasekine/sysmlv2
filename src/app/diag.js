// 診断の組み立て(GR4 指示書 6.2 節、設計書 9.2 節)。外部パッケージ・Node.js 固有の機能・DOM を使わない。
//
// buildDiagnostics({ text, errors, refs, semantic, view, internal }) → diagnostics
//   errors    解析のエラー(src/parser の parse の errors)
//   refs      名前解決の参照(src/model の model.refs)。構文エラーがあれば null
//   semantic  意味エラー(src/model/semantic.js の checkSemantics の結果)。構文エラーがあれば null
//   warnings  警告(src/model/warn.js の checkWarnings の結果。GR19 の W1・W2)。構文エラーがあれば null
//   view      描画の診断(src/view の diagnostics)
//   internal  内部エラー(例外の文字列の一覧)
// diagnostics = {
//   syntax:    [{ line, col, offset, message, expected }],
//   semantic:  [{ item, line, col, start, end, message, section, constraint }],  // 意味エラー(設計書 9.2 節)
//   warning:   [{ item, line, col, start, end, message, section }],  // 警告(設計書 9.2 節。意味エラーと混ぜず、件数を別に数える)
//   unchecked: { count, groups: [{ name, count, lines: [行番号] }] },  // 未検査を名前ごとにまとめる。正常として扱わない。
//                                                                     // 意味エラーと同じ範囲の参照(S1 など)は、意味エラーにだけ出す
//   ambiguous: { count, groups },                                     // 曖昧(設計書 6.2 節)
//   view:      [{ level, message, line }],
//   internal:  [文字列],
// }
// D3 の印の付いた参照は解決済みとして数える(設計書 9.2 節)。
//
// toPrompt(diagnostics, text) → 生成 AI に渡す修正依頼の文
//
// GR20 の F(設計書 9.4 節): フォルダのときは buildDiagnostics に files(src/model/files.js の analyzeFiles の files)を渡す。text は
// ファイルをつないだテキスト。構文エラーはファイルごとの errors から作る。どの診断にも file(ファイルの番号)と path(相対パス)を付け、
// line・col はそのファイルの中の行と列にする(意味エラー・警告の start・end は、つないだテキストの中の範囲のまま)。未検査・曖昧の
// まとめの lines は「相対パス 行」の文字列にし、locs([{ file, path, line }])を足す。diagnostics.files に [{ path }] を入れる。
// toPrompt(diagnostics, text, files) は、診断ごとに相対パスを付け、テキストは診断のあるファイルだけを「### 相対パス」の見出しを付けて
// 入れる(files は [{ path, text }])。files を渡さないとき(1 つのテキスト)は今のまま

export function lineOf(text, offset) {
  let line = 1;
  for (let i = 0; i < offset && i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c === 0x0d) { if (text.charCodeAt(i + 1) === 0x0a) i++; line++; }
    else if (c === 0x0a) line++;
  }
  return line;
}

function group(text, refs) {
  const by = new Map();
  for (const r of refs) {
    const name = r.segments?.length ? r.segments.map((s) => s.name).join('::') : r.text;
    if (!by.has(name)) by.set(name, { name, count: 0, lines: [] });
    const g = by.get(name);
    g.count++;
    if (r.start != null && g.lines.length < 20) { const l = lineOf(text, r.start); if (!g.lines.includes(l)) g.lines.push(l); }
  }
  return [...by.values()].sort((a, b) => b.count - a.count || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

// フォルダのとき: つないだテキストの位置 → { file, path, line }(ファイルの中の行)
function locate(files, offset) {
  if (offset == null) return null;
  let k = -1;
  for (let i = 0; i < files.length; i++) if (files[i].base <= offset && offset <= files[i].end) { k = i; break; }
  if (k < 0) return null;
  return { file: k, path: files[k].path, line: lineOf(files[k].text, offset - files[k].base) };
}
function groupIn(files, refs) {
  const by = new Map();
  for (const r of refs) {
    const name = r.segments?.length ? r.segments.map((s) => s.name).join('::') : r.text;
    if (!by.has(name)) by.set(name, { name, count: 0, lines: [], locs: [] });
    const g = by.get(name);
    g.count++;
    const at = locate(files, r.start);
    if (at && g.locs.length < 20 && !g.locs.some((x) => x.file === at.file && x.line === at.line)) { g.locs.push(at); g.lines.push(`${at.path} ${at.line}`); }
  }
  return [...by.values()].sort((a, b) => b.count - a.count || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}
function buildFolderDiagnostics({ text, files, refs, semantic, warnings, view, internal }) {
  const syntax = files.flatMap((f, k) => f.errors.map((e) => ({ kind: e.kind, line: e.line, col: e.col, offset: e.offset, message: e.message, expected: e.expected ?? null, file: k, path: f.path })));
  const at = (e) => (e.file != null && e.file >= 0 ? { file: e.file, path: files[e.file].path } : {});
  const sem = (semantic ?? []).map((e) => ({ item: e.item, line: e.line, col: e.col, start: e.start, end: e.end, message: e.message, section: e.section, constraint: e.constraint, ...at(e) }));
  const warning = (warnings ?? []).map((e) => ({ item: e.item, line: e.line, col: e.col, start: e.start, end: e.end, message: e.message, section: e.section, ...at(e) }));
  const semRanges = new Set(sem.map((e) => `${e.start}:${e.end}`));
  const unchecked = (refs ?? []).filter((r) => r.status === 'unchecked' && !semRanges.has(`${r.start}:${r.end}`));
  const ambiguous = (refs ?? []).filter((r) => r.status === 'ambiguous');
  return {
    syntax,
    semantic: sem,
    warning,
    unchecked: { count: unchecked.length, groups: groupIn(files, unchecked) },
    ambiguous: { count: ambiguous.length, groups: groupIn(files, ambiguous) },
    view: view.map((d) => { const x = locate(files, d.start); return { level: d.level, code: d.code, message: d.message, line: x ? x.line : null, ...(x ? { file: x.file, path: x.path } : {}) }; }),
    internal: [...internal],
    files: files.map((f) => ({ path: f.path })),
  };
}

export function buildDiagnostics({ text, files = null, errors = [], refs = null, semantic = null, warnings = null, view = [], internal = [] }) {
  if (files) return buildFolderDiagnostics({ text, files, refs, semantic, warnings, view, internal });
  const syntax = errors.map((e) => ({ kind: e.kind, line: e.line, col: e.col, offset: e.offset, message: e.message, expected: e.expected ?? null }));
  const sem = (semantic ?? []).map((e) => ({ item: e.item, line: e.line, col: e.col, start: e.start, end: e.end, message: e.message, section: e.section, constraint: e.constraint }));
  const warning = (warnings ?? []).map((e) => ({ item: e.item, line: e.line, col: e.col, start: e.start, end: e.end, message: e.message, section: e.section }));
  // 意味エラーにした参照は、未検査の一覧と件数から外す(同じ参照を二重に出さない)
  const semRanges = new Set(sem.map((e) => `${e.start}:${e.end}`));
  const unchecked = (refs ?? []).filter((r) => r.status === 'unchecked' && !semRanges.has(`${r.start}:${r.end}`));
  const ambiguous = (refs ?? []).filter((r) => r.status === 'ambiguous');
  return {
    syntax,
    semantic: sem,
    warning,
    unchecked: { count: unchecked.length, groups: group(text, unchecked) },
    ambiguous: { count: ambiguous.length, groups: group(text, ambiguous) },
    view: view.map((d) => ({ level: d.level, code: d.code, message: d.message, line: d.start != null ? lineOf(text, d.start) : null })),
    internal: [...internal],
  };
}

// 構文エラーの診断のクリックで選ぶ字句の範囲(GR22 の B5。設計書 9.2 節)。text はそのファイルのテキスト(テキスト欄の中身)、line・col は
// 構文エラーの行と列(1 始まり。列は UTF-16 の単位)。→ [start, end](text の中の位置。start === end ならカーソルを置くだけ)
// 構文エラーは範囲(終わりの位置・長さ)を持たないので、列の位置から決める:
//   - 列の位置が空白(スペース・タブ・フォームフィード)か行の終わりなら、その位置にカーソルを置くだけ
//   - それ以外の空白の文字(U+00A0 など。字句の誤りになるもの)なら、その 1 字
//   - 単一引用符・二重引用符なら、同じ行の中の閉じる引用符まで(\ のエスケープを飛ばす。閉じなければ行の終わりまで)
//   - 区切りの記号のうち括弧・; ・, なら、その 1 字
//   - そのほかの区切りの記号(: > = . など)なら、続く同じ仲間の記号まで(:>> や :: を 1 つにする)
//   - それ以外(英数字・_・ASCII でない文字)なら、空白・行の終わり・次の区切りの記号の手前まで
// 行が行数より大きいときはテキストの終わり、列が行の長さより大きいときは行の終わりにする
const B5_SPACE = new Set([' ', '\t', '\f']);
const B5_BRACKET = new Set(['(', ')', '{', '}', '[', ']', ';', ',']);
const B5_DELIM = /[!-\/:-@\[-^`{-~]/; // ASCII の記号(_ を除く)
export function tokenRange(text, line, col) {
  let pos = 0;
  for (let l = 1; l < line; l++) {
    const i = text.indexOf('\n', pos);
    if (i < 0) return [text.length, text.length];
    pos = i + 1;
  }
  let eol = text.indexOf('\n', pos);
  if (eol < 0) eol = text.length;
  if (eol > pos && text[eol - 1] === '\r') eol--;
  const s = Math.min(pos + Math.max(0, (col ?? 1) - 1), eol);
  const c = text[s];
  if (s >= eol || B5_SPACE.has(c)) return [s, s];
  let e = s + 1;
  if (/\s/.test(c)) return [s, e];
  if (c === "'" || c === '"') {
    while (e < eol && text[e] !== c) e += text[e] === '\\' ? 2 : 1;
    return [s, Math.min(eol, e + 1)];
  }
  if (B5_BRACKET.has(c)) return [s, e];
  if (B5_DELIM.test(c)) {
    while (e < eol && B5_DELIM.test(text[e]) && !B5_BRACKET.has(text[e]) && text[e] !== "'" && text[e] !== '"') e++;
    return [s, e];
  }
  while (e < eol && !/\s/.test(text[e]) && !B5_DELIM.test(text[e])) e++;
  return [s, e];
}

// 修正依頼の文(toPrompt)に入れる診断の段(GR22 の B3b。設計書 9.2 節)。依頼文の段と「修正依頼をコピー」を押せるかどうか(noDiagnostics)を、
// この 1 つの判定から決める。→ { keys: 段の名前の並び(依頼文の順。'syntax'・'semantic'・'warning'・'internal'・'ambiguous'・'unchecked'・'view')、
// view: 依頼文に入れる図の診断(warn の水準のものだけ。info の案内は入れない) }
export function promptSections(d) {
  const view = d.view.filter((v) => v.level === 'warn');
  const keys = [];
  if (d.syntax.length) keys.push('syntax');
  if (d.semantic?.length) keys.push('semantic');
  if (d.warning?.length) keys.push('warning');
  if (d.internal.length) keys.push('internal');
  if (d.ambiguous.count) keys.push('ambiguous');
  if (d.unchecked.count) keys.push('unchecked');
  if (view.length) keys.push('view');
  return { keys, view };
}
// 修正依頼の文に入る診断が 1 件もない(依頼文に診断の段が 1 つもない)か(GR22 の B3・B3b。設計書 9.2 節)。診断欄に出るのが、依頼文に
// 入れない図の診断(info の水準の、描く範囲の候補がないなどの案内)だけのときも含む
export function noDiagnostics(d) {
  return promptSections(d).keys.length === 0;
}

// 警告の段の見出し(診断欄と修正依頼のコピーで同じ。設計書 9.2 節、GR19 指示書 v19.1 の 3.4 節)
export const WARNING_TITLE = '警告(書き間違いのおそれがあるため、意図を確かめてほしい箇所)';
// 修正依頼での警告の扱い(GR19 指示書 v19.1 の 3.5 節。依頼文の頭と「## 警告」の段の頭に書く)
const WARNING_RULE = '警告は意図の確認事項です。書き間違いと判断できるものだけ直し、判断できないものは変えずに、確かめたいことを質問として挙げてください。';

// 依頼文の頭(GR19 指示書 v19.1 の 3.5 節)。エラー(構文エラー・意味エラー)と警告の扱いを分け、段のないものには触れない。
// エラーも警告もないとき(曖昧・未検査・内部エラー・図の診断だけのとき)は、今までの文のまま
function promptHead(has) {
  const err = has('syntax') || has('semantic');
  const warn = has('warning');
  const lead = '次の SysML v2 のテキスト表記(SysML 2.0 正式版)について、';
  if (err && warn) return `${lead}下の診断のうち、構文エラー・意味エラーを直したテキストを書いてください。${WARNING_RULE}`;
  if (err) return `${lead}下の診断のうち、構文エラー・意味エラーを直したテキストを書いてください。`;
  if (warn) return `${lead}下の診断の警告を確かめてください。${WARNING_RULE}直したものがあれば、直したテキストを書いてください。`;
  return `${lead}下の診断の内容を直したテキストを書いてください。`;
}

export function toPrompt(d, text, files = null) {
  const out = [];
  // フォルダのときは、診断ごとに相対パスを付ける(GR20 の F)
  const P = (e) => (files && e.path ? `${e.path} ` : '');
  // 入れる段は promptSections で決める(押せるかどうかと同じ判定。GR22 の B3b)
  const sec = promptSections(d);
  const has = (k) => sec.keys.includes(k);
  out.push(promptHead(has));
  out.push('日本語の名前は単一引用符で囲んでください(例: \'温度センサ\')。');
  out.push('');
  if (has('syntax')) {
    out.push('## 構文エラー');
    for (const e of d.syntax) out.push(`- ${P(e)}${e.line} 行 ${e.col} 列: ${e.message}${e.expected?.length ? `(ここに書けるもの: ${e.expected.slice(0, 20).join(' ')})` : ''}`);
    out.push('');
  }
  if (has('semantic')) {
    out.push('## 意味エラー(構文は正しいが、SysML v2 の規則に反するもの)');
    for (const e of d.semantic) out.push(`- ${P(e)}${e.line} 行 ${e.col} 列: ${e.message}(${e.item}。根拠: ${e.section}${e.constraint ? ` ${e.constraint}` : ''})`);
    out.push('');
  }
  if (has('warning')) {
    out.push(`## ${WARNING_TITLE}`);
    out.push(WARNING_RULE);
    for (const e of d.warning) out.push(`- ${P(e)}${e.line} 行 ${e.col} 列: ${e.message}(${e.item}。出典: ${e.section})`);
    out.push('');
  }
  if (has('internal')) {
    out.push('## 内部エラー(アプリの不具合の可能性があります)');
    for (const e of d.internal) out.push(`- ${e}`);
    out.push('');
  }
  if (has('ambiguous')) {
    out.push(`## 曖昧な名前(${d.ambiguous.count} 件)`);
    for (const g of d.ambiguous.groups) out.push(`- ${g.name}(${g.count} 件。${g.lines.join('・')} 行)`);
    out.push('');
  }
  if (has('unchecked')) {
    out.push(`## 未検査の名前(${d.unchecked.count} 件。標準ライブラリなど、このアプリが中身を知らない名前。誤りとは限りません)`);
    for (const g of d.unchecked.groups.slice(0, 50)) out.push(`- ${g.name}(${g.count} 件。${g.lines.join('・')} 行)`);
    if (d.unchecked.groups.length > 50) out.push(`- ほか ${d.unchecked.groups.length - 50} 種類`);
    out.push('');
  }
  const warn = sec.view;
  if (has('view')) {
    out.push('## 図の診断');
    for (const v of warn) out.push(`- ${P(v)}${v.line ? `${v.line} 行: ` : ''}${v.message}`);
    out.push('');
  }
  if (files) {
    // テキストは、診断のあるファイルだけを、相対パスの見出しを付けて入れる
    const has = new Set([...d.syntax, ...(d.semantic ?? []), ...(d.warning ?? []), ...warn].map((e) => e.path).filter(Boolean));
    for (const g of [...d.ambiguous.groups, ...d.unchecked.groups]) for (const x of g.locs ?? []) has.add(x.path);
    out.push('## テキスト(診断のあるファイル)');
    for (const f of files) {
      if (!has.has(f.path)) continue;
      out.push('');
      out.push(`### ${f.path}`);
      out.push('```sysml');
      out.push(f.text.replace(/^\uFEFF/, ''));
      out.push('```');
    }
    return out.join('\n');
  }
  out.push('## テキスト');
  out.push('```sysml');
  out.push(text.replace(/^\uFEFF/, ''));
  out.push('```');
  return out.join('\n');
}
