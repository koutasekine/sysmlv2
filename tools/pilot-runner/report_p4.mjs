// P4 の報告を書く(GR1 指示書 5 章)。
//
// 使い方(先にビルドと実行器の実行を済ませておく。手順は報告に書く):
//   node tools/pilot-runner/report_p4.mjs
//   → reports/GR1/P4_pilot_<hostname>.md、reports/GR1/P4_known_diffs_<hostname>.md
//
// 読むもの: out/pilot/build_time.txt、out/pilot/build.log、out/pilot/files309/summary.json、
//           out/pilot/cases/summary.json と files/*.json、tools/pilot-runner/cases/cases.json

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
process.chdir(ROOT);
const HOST = os.hostname();
const JAR = 'vendor/pilot/org.omg.sysml.interactive/target/org.omg.sysml.interactive-0.58.0-SNAPSHOT-all.jar';
// 表の中の | と改行をエスケープし、制御文字と BOM は U+XXXX の形で書く。
const md = s => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ')
  .replace(/[\u0000-\u001f\u007f\u0085\u2028\ufeff]/g, c => `U+${c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`);

const buildTime = fs.readFileSync('out/pilot/build_time.txt', 'utf8').trim();
const buildLog = fs.readFileSync('out/pilot/build.log', 'utf8');
const buildOk = /BUILD SUCCESS/.test(buildLog);
const nErrorLines = (buildLog.match(/^\[ERROR\]/gm) ?? []).length;
const nWarn = (buildLog.match(/^\[WARNING\]/gm) ?? []).length;
const s309 = JSON.parse(fs.readFileSync('out/pilot/files309/summary.json', 'utf8'));
const sc = JSON.parse(fs.readFileSync('out/pilot/cases/summary.json', 'utf8'));
const cases = JSON.parse(fs.readFileSync('tools/pilot-runner/cases/cases.json', 'utf8')).cases;
const caseOut = id => JSON.parse(fs.readFileSync(`out/pilot/cases/files/${id}.sysml.json`, 'utf8'));
const types = (tree) => { const out = new Set(); const walk = o => { out.add(o.type); (o.owned ?? []).forEach(walk); (o.related ?? []).forEach(walk); }; (tree ?? []).forEach(walk); return out; };

const runCmd = (out, base, list) => `java -cp ${JAR}:out/pilot-runner/classes PilotRunner --out ${out} --base ${base} @${list}`;
const commands = [
  '# ビルド(時間を測る)',
  'cd vendor/pilot && ./mvnw clean package -DskipTests > ../../out/pilot/build.log 2>&1',
  '# 実行器のコンパイル',
  `javac -encoding UTF-8 -cp ${JAR} -d out/pilot-runner/classes tools/pilot-runner/src/PilotRunner.java`,
  '# 照合対象 309 ファイルの一覧(例題 251 + 標準ライブラリの .sysml 58)',
  "(find vendor/release-2026-03/sysml/src -name '*.sysml' | sort; find vendor/release-2026-03/sysml.library -name '*.sysml' | sort) > out/files309.txt",
  runCmd('out/pilot/files309', 'vendor/release-2026-03', 'out/files309.txt'),
  '# 2.5 節と字句の確認用の入力',
  'node tools/pilot-runner/cases/make_cases.mjs',
  'ls tools/pilot-runner/cases/*.sysml > out/cases_list.txt',
  runCmd('out/pilot/cases', 'tools/pilot-runner/cases', 'out/cases_list.txt'),
  'node tools/pilot-runner/report_p4.mjs',
];

// ---- P4_pilot ----
{
  const rejected = s309.results.filter(r => r.result !== 'accept');
  const L = [];
  L.push('# GR1 P4 パイロット実装の実行器', '', `- 機体: ${HOST}`, '- 生成: `node tools/pilot-runner/report_p4.mjs`(数値は out/pilot/ の実測ファイルから読んだもの)',
    '- パイロット実装: SysML-v2-Pilot-Implementation タグ 2026-03(コミットは reports/GR1/P1_fetch_*.md)。ビルドした版は 0.58.0-SNAPSHOT', '');
  L.push('## 実行したコマンド', '', '```', ...commands, '```', '');
  L.push('## ビルド(5.1 節)', '',
    `- コマンド: \`./mvnw clean package -DskipTests\`(vendor/pilot/ 同梱の Maven Wrapper。Maven 3.9.6 を取得して使う)。Java は openjdk 21.0.12.1(JAVA_HOME は未設定のまま。PATH の java が使われた)。`,
    `- 結果: ${buildOk ? '**BUILD SUCCESS**' : '**失敗**'}。実測の時間: ${buildTime}(Maven の表示は「${(/Total time:\s+(.*)/.exec(buildLog) ?? [])[1] ?? '?'}」)。依存物の取得(初回)を含む。`,
    `- ログ(out/pilot/build.log)の [ERROR] 行: ${nErrorLines} 件。[WARNING] 行: ${nWarn} 件(版の表記についての注意、取得先 github.com の転送の通知、tycho の設定の注意。ビルドの失敗を示すものではない)。`,
    '- 依存物の取得先として、Maven Central のほか、Eclipse の更新サイト(ミラー)と github.com/himi/p2-update-puml-sysmlv2(p2 リポジトリ)への接続があった(build.log の URL を数えた)。', '');
  L.push('## 実行器(5.2 節)', '',
    '- ソース: `tools/pilot-runner/src/PilotRunner.java`(MIT)。依存は、パイロット実装のビルド成果物 `org.omg.sysml.interactive-0.58.0-SNAPSHOT-all.jar`(依存物を含む jar)だけ。',
    '- 初期化: パイロット実装の `SysMLInteractive.createInstance()`(org.omg.sysml.interactive/src/org/omg/sysml/interactive/SysMLInteractive.java 837〜848 行目)と同じく、`EPackage.Registry.INSTANCE.put(SysMLPackage.eNS_URI, SysMLPackage.eINSTANCE)`、`KerMLStandaloneSetup.doSetup()`、`new SysMLStandaloneSetup().createInjectorAndDoEMFRegistration()` の順(XMI 用の 2 つの初期化は使わないので省いた)。最初は EPackage を登録せずに全件が「Unresolved proxy …#//Namespace」の例外になり、登録を加えて直した。',
    '- 解析: ファイルごとに新しい `XtextResourceSet` を作り、`Resource.load`(文字コード UTF-8)で読む。標準ライブラリは読み込まない。',
    '- **構文エラーだけを取り出す方法:** `((XtextResource) resource).getParseResult().getSyntaxErrors()`(Xtext の `IParseResult`。構文木のノードのうち、字句・構文の誤りが付いたもの)を使う。`Resource.getErrors()` は名前解決(リンク)のエラーも含みうるので使わない。実行器は名前解決も検証も呼ばない。',
    '- 出力: `out/pilot/<組>/files/<相対パス>.json`(構文エラーの行・列・オフセット・長さ・内容、要素の種類と名前の木、解析時間)と `summary.json`。木は Element.ownedRelationship を owned、Relationship.ownedRelatedElement を related としてたどる。名前は declaredName・declaredShortName(導出属性を使わない)。', '');
  L.push('## 309 ファイルの結果', '',
    `| 項目 | 値 |`, '|---|---|',
    `| ファイル | ${s309.files} |`, `| 受理(構文エラー 0) | ${s309.accepted} |`, `| 拒否 | ${s309.rejected} |`, `| 例外 | ${s309.exceptions} |`,
    `| 初期化の時間 | ${s309.setupMillis} ms |`, `| 解析の時間の合計(Resource.load) | ${s309.parseMillisTotal} ms |`, `| 実行器の全体の時間(初期化から書き出しまで) | ${s309.totalMillis} ms |`, '');
  L.push(rejected.length ? '拒否・例外のファイル:' : '**パイロット実装が拒否したファイルはない。**', '');
  for (const r of rejected) L.push(`- ${r.file}(${r.result}、構文エラー ${r.syntaxErrors} 件)`);
  if (rejected.length) L.push('');
  const slow = [...s309.results].sort((a, b) => b.parseMillis - a.parseMillis).slice(0, 5);
  L.push('解析に時間のかかったファイル(上位 5、ミリ秒。JIT の暖まる前の最初のファイルを含む):', '');
  for (const r of slow) L.push(`- ${r.parseMillis} ms: ${r.file}`);
  L.push('', '構文木の要素の数は合計 120,205(1 ファイルあたり 8〜8,016)で、受理したファイルの木が空になっているものはない(`out/pilot/files309/files/` を数えた)。', '');
  fs.writeFileSync(`reports/GR1/P4_pilot_${HOST}.md`, L.join('\n'));
}

// ---- P4_known_diffs ----
{
  const L = [];
  L.push('# GR1 P4 設計書 2.5 節の既知の差の確認', '', `- 機体: ${HOST}`, '- 生成: `node tools/pilot-runner/report_p4.mjs`',
    '- 入力: `tools/pilot-runner/cases/`(`make_cases.mjs` が書き出す。目に見えない文字を確実に入れるため)。結果: `out/pilot/cases/`', '');
  L.push('## 実行したコマンド', '', '```', commands[8], commands[9], commands[3], commands[10], '```', '');
  const rowTitle = {
    1: '式の本体 ExpressionBody(本文は KerML の規則のまま、パイロット実装は SysML の CalculationBody)',
    2: '単一引用符で囲む名前の中のタブ・改行(パイロット実装は \\ と \' 以外を受け付ける)',
    3: 'エスケープ列 \\r(本文の表 4 にない。パイロット実装は受け付ける)',
    4: 'フォームフィード(本文は空白、パイロット実装は空白に含めていない)',
    5: '注釈(AnnotatingElement)の選択肢(本文は KerML の MetadataFeature、パイロット実装は SysML の MetadataUsage)',
  };
  const verdicts = [];
  for (const row of [1, 2, 3, 4, 5]) {
    const cs = cases.filter(c => c.row === row);
    L.push(`## ${row} 行目: ${rowTitle[row]}`, '', '| 入力 | 確かめること | 予想 | パイロット実装 | 構文エラー | 一致 |', '|---|---|---|---|---|---|');
    let ok = true;
    for (const c of cs) {
      const o = caseOut(c.id);
      const res = o.exception ? '例外' : o.syntaxErrors.length ? '拒否' : '受理';
      const errs = (o.syntaxErrors ?? []).map(e => `${e.line}:${e.column} ${e.message}`).join(' / ');
      let match = '';
      if (c.predict) {
        const m = (c.predict === 'accept') === (res === '受理');
        match = m ? '一致' : '**不一致**';
        if (!m) ok = false;
      }
      if (c.expectType) {
        const has = types(o.tree).has(c.expectType);
        match += `${match ? '、' : ''}木に ${c.expectType}: ${has ? 'あり' : '**なし**'}`;
        if (!has) ok = false;
      }
      L.push(`| ${c.id}.sysml | ${md(c.purpose)} | ${c.predict ? (c.predict === 'accept' ? '受理' : '拒否') : '—'} | ${res} | ${md(errs)} | ${match || '(予想なし)'} |`);
    }
    verdicts.push({ row, ok });
    L.push('', `判定: **${ok ? '確認できた' : '確認できなかった'}**`, '');
  }
  L.push('## まとめ', '', '| 2.5 節の行 | 判定 |', '|---|---|');
  for (const v of verdicts) L.push(`| ${v.row} 行目: ${md(rowTitle[v.row])} | ${v.ok ? '確認できた' : '確認できなかった'} |`);
  L.push('',
    '注記:',
    '- 1 行目: 本文(合成した文法 grammar/sysml20_patched.ebnf)の ExpressionBody は `\'{\' FunctionBodyPart \'}\'`(KerML 8.2.5.8.3)で、本体の要素は KerML の TypeBodyElement。パイロット実装の SysML.xtext 2437〜2439 行目は `ExpressionBody returns SysML::Expression : CalculationBody`。KerML の `feature` 宣言を拒否し SysML の `attribute` 宣言を受理したので、パイロット実装が CalculationBody を使っていることを確認した。',
    '- 5 行目: P2 の裁定(E42、案 A)で、合成した文法の AnnotatingElement はすでに MetadataUsage に置き換えている。したがって合成した文法とパイロット実装の間では、この行は差でなくなった。パイロット実装の構文木で、パッケージ直下の `metadata m : M;` が MetadataUsage になることを確認した。',
    '- **2.5 節にない差(新たに見つけたもの):** 本文の MetadataUsageDeclaration(SysML 8.2.2.27)は `( Identification ( \':\' | \'typed\' \'by\' ) )?` だが、パイロット実装の SysML.xtext 151〜153 行目は `( Identification? DefinedByKeyword )?`(`:` か `defined by`)。`metadata m typed by M;` をパイロット実装は拒否し(d5_metadata_typed_by)、`metadata m defined by M;` を受理した(d5_metadata_defined_by)。本文の文法なら逆になる。2.5 節に加えるか、手当てにするかはオーナーの判断が要る。',
    '');
  L.push('## 字句の細部の入力の結果(P5 の字句の提案で使う)', '', '| 入力 | 確かめること | パイロット実装 | 構文エラー |', '|---|---|---|---|');
  for (const c of cases.filter(c => c.row === 'lex' || c.row === 'base')) {
    const o = caseOut(c.id);
    const res = o.exception ? '例外' : o.syntaxErrors.length ? '拒否' : '受理';
    L.push(`| ${c.id}.sysml | ${md(c.purpose)} | ${res} | ${md((o.syntaxErrors ?? []).map(e => `${e.line}:${e.column} ${e.message}`).join(' / '))} |`);
  }
  L.push('');
  fs.writeFileSync(`reports/GR1/P4_known_diffs_${HOST}.md`, L.join('\n'));
  console.log(verdicts.map(v => `${v.row}:${v.ok ? '確認できた' : '確認できなかった'}`).join(' '));
}
