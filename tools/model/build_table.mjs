// grammar/builtin.json(内蔵する名前と種類の表の正本)から src/model/builtin_table.js を作る(GR3 指示書 5 章)。
//
// 使い方:
//   node tools/model/build_table.mjs   # → src/model/builtin_table.js
//
// 生成物は ES モジュールのデータだけで、外部パッケージと Node.js 固有の機能を使わない。手で編集しない。
// 出典(節番号と行番号)は正本にあり、生成物にも src として残す(診断の表示に使う)。

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
process.chdir(ROOT);

const b = JSON.parse(fs.readFileSync('grammar/builtin.json', 'utf8'));

const metaclasses = {};
for (const m of b.metaclasses) {
  metaclasses[m.name] = { lang: m.lang, package: m.package, general: m.general.map(g => g.name), section: m.section, src: m.src, ...(m.enum ? { enum: true } : {}) };
}
const kindOf = Object.fromEntries(b.packages.filter(p => p.metaclassKind).map(p => [p.name, { metaclass: p.metaclassKind.kind, enum: p.enumKind.kind }]));

const table = {
  metaclasses,
  // ライブラリのパッケージ。members の中身は下の views・actionDefinition・actionFeatures と metaclasses から作る
  packages: b.packages.map(p => ({
    name: p.name, kind: p.kind, section: p.section, src: p.src,
    ...(p.subpackages ? { subpackages: p.subpackages.map(s => s.name) } : {}),
    ...(p.imports ? { imports: p.imports } : {}),
    ...(kindOf[p.name] ? { memberKinds: kindOf[p.name] } : {}),
  })),
  views: b.views.map(v => ({ name: v.name, shortName: v.shortName, kind: v.kind, package: v.package, general: v.general.map(g => g.name), section: v.section, src: v.src })),
  actionDefinition: { name: b.actionDefinition.name, kind: b.actionDefinition.kind, package: b.actionDefinition.package, section: b.actionDefinition.section, src: b.actionDefinition.src },
  actionFeatures: b.actionFeatures.map(f => ({ name: f.name, type: f.type, owner: f.owner, section: f.section, src: f.src })),
  actionFeaturesInheritedBy: b.actionFeaturesInheritedBy.map(x => ({ metaclass: x.metaclass, libraryType: x.libraryType, section: x.section, src: x.src })),
  implicitLibrarySupertypes: { metaclass: b.implicitLibrarySupertypes.metaclass, libraryType: b.implicitLibrarySupertypes.libraryType, section: b.implicitLibrarySupertypes.section, src: b.implicitLibrarySupertypes.src },
};

const out = `// 内蔵する名前と種類の表(GR3 指示書 5 章)。grammar/builtin.json から node tools/model/build_table.mjs で生成した。手で編集しない。
// 出典は仕様書本文(src の kerml10 = KerML 1.0、sysml20 = SysML 2.0 のテキストの行)。標準ライブラリのファイルは写していない。
export default ${JSON.stringify(table)};
`;
fs.mkdirSync('src/model', { recursive: true });
fs.writeFileSync('src/model/builtin_table.js', out);
console.log(`src/model/builtin_table.js: ${out.length} バイト(メタクラス ${Object.keys(metaclasses).length}、ビュー ${table.views.length}、アクションの特徴 ${table.actionFeatures.length})`);
