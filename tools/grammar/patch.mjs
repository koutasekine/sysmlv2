// 誤りの一覧(grammar/errata.json)の手当て(patch)を規則に当てる共通部品。
//
// applyPatch(rule, patches, rules21) → { rule: 手当て後の規則, added: 追加する規則の配列 }
//   rule     parseGrammarFile の規則(header と body を使う)
//   patches  手当ての配列。op は次のどれか:
//     rule-from-21      規則全体を 2.1 Beta 2 の同名の規則に置き換える
//     header-from-21    見出しだけを 2.1 Beta 2 の同名の規則の見出しに置き換える
//     add-rule-from-21  2.1 Beta 2 の規則 rule を追加する
//     replace           見出しと本体の文字列 old を new に置き換える(all がなければ 1 回だけ現れること)
//     add-alternative   本体の選択肢 after の行の次に、選択肢 alt の行を加える
//   rules21  2.1 Beta 2 から抜き出した規則の配列
// 当てられないときは例外を投げる。

import { matchHeader } from './ebnf.mjs';

const find21 = (rules21, name) => {
  const r = rules21.find(x => x.name === name);
  if (!r) throw new Error(`2.1 Beta 2 に規則 ${name} がない`);
  return r;
};

export function applyPatch(rule, patches, rules21) {
  let header = rule.header;
  let body = rule.body;
  const added = [];
  const from21 = [];
  for (const p of patches) {
    switch (p.op) {
      case 'rule-from-21': {
        const r = find21(rules21, rule.name);
        header = r.header; body = r.body; from21.push(r.srcLines);
        break;
      }
      case 'header-from-21': {
        const r = find21(rules21, rule.name);
        header = r.header; from21.push(r.srcLines);
        break;
      }
      case 'add-rule-from-21': {
        const r = find21(rules21, p.rule);
        added.push({ ...r, from21: r.srcLines });
        break;
      }
      case 'replace': {
        const text = header + '\n' + body;
        const n = text.split(p.old).length - 1;
        if (n === 0) throw new Error(`「${p.old}」が規則 ${rule.name} にない`);
        if (n > 1 && !p.all) throw new Error(`「${p.old}」が規則 ${rule.name} に ${n} 回ある`);
        const out = text.split(p.old).join(p.new);
        const i = out.indexOf('\n');
        header = i < 0 ? out : out.slice(0, i);
        body = i < 0 ? '' : out.slice(i + 1);
        break;
      }
      case 'add-alternative': {
        const lines = body.split('\n');
        const re = new RegExp(`^(\\s*)(\\|\\s*)?${p.after}\\s*$`);
        const idx = lines.findIndex(l => re.test(l));
        if (idx < 0) throw new Error(`選択肢 ${p.after} の行が規則 ${rule.name} にない`);
        const indent = /^(\s*)/.exec(lines[idx])[1];
        const ind = lines[idx].trimStart().startsWith('|') ? indent : indent.replace(/  $/, '');
        lines.splice(idx + 1, 0, `${ind}| ${p.alt}`);
        body = lines.join('\n');
        break;
      }
      default:
        throw new Error(`知らない手当ての種類 ${p.op}`);
    }
  }
  const h = matchHeader(header.trim());
  if (!h) throw new Error(`手当て後の見出し「${header}」を読めない`);
  return {
    rule: { ...rule, name: h.name, type: h.type, sep: h.sep, hasEq: h.hasEq, header, body, from21 },
    added,
  };
}
