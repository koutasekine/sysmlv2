// 相互接続ビュー(GR4 指示書 4 章)・状態遷移ビュー(GR6 指示書 4 章)・アクションフロービュー(GR7 指示書 4.2 節)・
// シーケンスビュー(GR9 指示書 4.1 節)の記号の一覧を作る。
//
// 使い方:
//   node tools/view/symbols.mjs            # → tools/view/symbols.json、out/view/symbols_table.md、out/view/symbols_state_table.md、
//                                          #   out/view/symbols_action_table.md、out/view/symbols_sequence_table.md、out/view/symbols_general_table.md
//   node tools/view/symbols.mjs --no-pdf   # PDF のページの確かめ(pdftotext)を飛ばす(symbols.json の pdfChecked が null になる)
//
// symbols.json の symbols は相互接続ビュー(GR4)の一覧で、GR6・GR7 では変えない。
// 状態遷移ビューの一覧は stateTransition.symbols に出す(この下の STATE_SYMBOLS と STATE_REUSE)。GR7 では変えない。
// アクションフロービューの一覧は actionFlow.symbols に出す(この下の ACTION_SYMBOLS と ACTION_REUSE)。GR9 では変えない。
// シーケンスビューの一覧は sequence.symbols に出す(この下の SEQ_SYMBOLS と SEQ_REUSE)。GR10 では変えない。
// 一般ビューの一覧は general.symbols に出す(この下の GEN_SYMBOLS と GEN_REUSE。GR10)。GR12 では変えない。
// 一般ビューの分野ごとの専用の記号の一覧は general12.symbols に出す(この下の GEN12_SECTIONS。GR12)。
//   → out/view/symbols_general12_table.md も書く
//
// 一覧の中身(区分・抽象構文との対応・図形の要点・経路)は、この下の SYMBOLS に手で書く。
// 図形の要点は、仕様書 PDF のページを画像にして読み取ったもの(pdftoppm -r 90)。
// 行番号・節・印刷のページ・PDF のページは、本文のテキスト out/text/sysml20.txt から、この道具が求める。
//   行番号   生成規則の定義の行(行頭が「名前 =」「名前 =|」「名前 |=」)。def で別の名前を指定できる。
//            本文に定義のない名前(参照だけがあるもの)は、参照の行を ref で指定する
//   節       その行より前で最も近い「8.2.3.n 」の見出しの行
//   印刷のページ  その行より後で最初のページの足(「Systems Modeling Language v2.0, Part 1  193」の形)
//   PDF のページ  印刷のページ + 32(P1 で、pdftotext の足の番号と PDF のページを突き合わせて確かめた差)
//   図のページ    定義の行の後で最初に中身のある行の PDF のページ(figurePage。GR4 P2 の 3 回目の指示 3)
// PDF のページに生成規則の名前があることを、pdftotext で 1 件ずつ確かめる。
//
// 区分
//   draw    GR4 で描く
//   nodraw  GR4 では描かない(ほかのビュー)
// 種類(kind)
//   view 区画の中身としてのビュー / frame 図の枠 / node 箱 / edge 線 / port 辺の記号 / adorn 線や箱の飾り /
//   label 文字の生成規則 / compartment 区画 / annotation 注釈・依存 / endset 線の端になれる要素の集合

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
process.chdir(ROOT);

const PDF = 'vendor/release-2026-03/doc/2a-OMG_Systems_Modeling_Language.pdf';
const PAGE_OFFSET = 32;
const checkPdf = !process.argv.includes('--no-pdf');

const D = 'draw', N = 'nodraw';

// [名前, 区分, 種類, 抽象構文(構文木のどの要素を描くか), 図形の要点, 経路(どこから展開されるか), 注記]
// 追加の指定: { sec } 定義を探す節(同じ名前の定義が複数あるとき)、{ ref } 定義がなく参照だけの行の手がかり
const SYMBOLS = [
  // ---- ビュー
  ['interconnection-view', D, 'view', '描く範囲の名前空間(部品の定義・使用)が所有するメンバーのうち、相互接続ビューで描く要素', '箱の中の領域。interconnection-element の並び、注釈・依存、左下の省略記号', '部品の定義・使用の箱の中、interconnection-compartment の中'],
  ['interconnection-compartment', D, 'compartment', '箱の持ち主の名前空間', "区切りの横線と斜体の見出し 'interconnection'、その下に interconnection-view", 'compartment-stack'],
  ['ellipsis-at-lower-left-corner', D, 'adorn', 'なし(描いていない要素があることの表示)', "領域の左下の '...'", 'interconnection-view'],
  ['general-view', N, 'view', '一般ビュー', '(一般ビューの領域)', 'constraint・requirement の箱の中、general-compartment', 'ほかのビュー。constraint・requirement の箱では、この領域を描かず、描いていないことを表示する'],
  ['general-compartment', N, 'compartment', '一般ビューの区画', "区切りの横線と斜体の見出し 'general'、その下に general-view", 'compartment-stack'],
  ['action-flow-compartment', N, 'compartment', 'アクションフロービューの区画', "区切りの横線と斜体の見出し 'action flow'、その下に action-flow-view", 'compartment-stack'],
  ['sequence-compartment', N, 'compartment', 'シーケンスビューの区画', "区切りの横線と斜体の見出し 'sequence'、その下に sequence-view", 'compartment-stack'],
  ['state-transition-compartment', N, 'compartment', '状態遷移ビューの区画', "区切りの横線と斜体の見出し 'state transition'、その下に state-transition-view", 'compartment-stack'],

  // ---- 図の枠(interconnection-view からは展開されない。問 Q1)
  ['framed-view', D, 'frame', 'ViewUsage(テキストに view があるとき)', '大きな四角の枠。左上に、右下の角だけ丸い名前の区画。右上・左下・右下に任意の情報区画。中に frameless-view', '8.2.3.1 節(図は view-frame の名前区画を見出しとするビュー)、root-view', '問 Q1'],
  ['view-frame-name-compartment', D, 'label', "ViewUsage の名前と型(«view» 修飾名 ':' 修飾名)", '枠の左上の区画。右と下の辺で囲み、右下の角は丸い', 'framed-view'],
  ['frameless-view', D, 'view', '枠の中のビュー', '選択肢 interconnection-view だけを GR4 で描く。general-view・action-flow-view・state-transition-view・sequence-view は描かない', 'framed-view'],
  ['view-frame-info-contents', D, 'label', 'ViewUsage の Expose・ElementFilterMember・注釈', '情報区画の文字', 'view-frame-info-compartment-*'],
  ['view-frame-info-compartment-tr', D, 'adorn', 'ViewUsage の Expose など', '枠の右上。左と下の辺で囲み、左下の角は丸い', 'framed-view'],
  ['view-frame-info-compartment-bl', D, 'adorn', 'ViewUsage の Expose など', '枠の左下。上と右の辺で囲み、右上の角は丸い', 'framed-view'],
  ['view-frame-info-compartment-br', D, 'adorn', 'ViewUsage の Expose など', '枠の右下。左と上の辺で囲み、左上の角は丸い', 'framed-view'],

  // ---- 箱(interconnection-element の選択肢と、描く範囲の外側の箱)
  ['item', D, 'node', 'ItemUsage(PartUsage などの下位の種類を除く)で、isReference でないもの', '角の丸い実線の四角。名前の区画と compartment-stack', 'interconnection-element(8.2.3.10)'],
  ['item-ref', D, 'node', 'ItemUsage で isReference のもの', '角の丸い破線の四角。中身は item と同じ', 'interconnection-element(8.2.3.10)'],
  ['item-name-compartment', D, 'label', 'ItemUsage の接頭辞・名前・型', "'«' OccurrenceUsagePrefix 'item' '»' の行と、usage-name-with-alias の行(中央揃え)", 'item・item-ref'],
  ['part', D, 'node', 'PartUsage(ConnectionUsage・ViewUsage・RenderingUsage などの下位の種類を除く)で、isReference でないもの', '角の丸い実線の四角。四辺の上にポート(port-t*・port-l*・port-r*・port-b*)。中に名前の区画、interconnection-view、compartment-stack', 'interconnection-element(8.2.3.11)'],
  ['part-ref', D, 'node', 'PartUsage で isReference のもの', '角の丸い破線の四角。中身は part と同じ', 'interconnection-element(8.2.3.11)'],
  ['part-name-compartment', D, 'label', 'PartUsage の接頭辞・名前・型', "'«' OccurrenceUsagePrefix 'part' '»' の行と usage-name-with-alias の行", 'part・part-ref'],
  ['part-def', D, 'node', 'PartDefinition(描く範囲が部品の定義のとき、その外側の箱)', '角の尖った実線の四角。四辺にポート。中に名前の区画、interconnection-view、compartment-stack。下の辺だけ太い', '描く範囲の候補(指示書 5.1 節)。interconnection-element の選択肢にはない', '問 Q2'],
  ['part-def-name-compartment', D, 'label', 'PartDefinition の接頭辞・名前', "'«' DefinitionPrefix 'part' 'def' '»' の行と definition-name-with-alias の行", 'part-def'],
  ['port-def', D, 'node', 'PortDefinition', '角の尖った実線の四角。四辺に入れ子のポート。中に名前の区画と compartment-stack', 'interconnection-element(8.2.3.12)'],
  ['port-def-name-compartment', D, 'label', 'PortDefinition の接頭辞・名前', "'«' DefinitionPrefix 'port' 'def' '»' の行と definition-name-with-alias の行", 'port-def'],
  ['port-usage', D, 'node', 'PortUsage を箱として描くとき', '角の丸い実線の四角。四辺に入れ子のポート。中に名前の区画と compartment-stack', "interconnection-element の 'port'(本文に生成規則 port はない)", '問 Q3'],
  ['port-name-compartment', D, 'label', 'PortUsage の接頭辞・名前・型', "'«' OccurrenceUsagePrefix 'port' '»' の行と usage-name-with-alias の行", 'port-usage'],
  ['attribute', D, 'node', 'AttributeUsage', '角の丸い実線の四角。名前の区画と compartment-stack', 'interconnection-element(8.2.3.13)'],
  ['attribute-name-compartment', D, 'label', 'AttributeUsage の接頭辞・名前・型', "'«' UsagePrefix 'attribute' '»' の行と usage-name-with-alias の行", 'attribute'],
  ['connection-def', D, 'node', 'ConnectionDefinition(InterfaceDefinition などの下位の種類を除く)', '角の尖った実線の四角。名前の区画と compartment-stack', 'interconnection-element(8.2.3.13)'],
  ['connection-def-name-compartment', D, 'label', 'ConnectionDefinition の接頭辞・名前', "'«' DefinitionPrefix 'connection' 'def' '»' の行と definition-name-with-alias の行", 'connection-def'],
  ['connection', D, 'node', 'ConnectionUsage を箱として描くとき', '角の丸い実線の四角。名前の区画と compartment-stack', 'interconnection-element(8.2.3.13)', '問 Q4'],
  ['connection-name-compartment', D, 'label', 'ConnectionUsage の接頭辞・名前・型', "'«' OccurrenceUsagePrefix 'connection' '»' の行と usage-name-with-alias の行", 'connection'],
  ['interface', D, 'node', 'InterfaceUsage を箱として描くとき', '角の丸い実線の四角。名前の区画と compartment-stack', 'interconnection-element(8.2.3.14)', '問 Q4'],
  ['interface-name-compartment', D, 'label', 'InterfaceUsage の接頭辞・名前・型', "'«' OccurrenceUsagePrefix 'interface' '»' の行と usage-name-with-alias の行", 'interface'],
  ['flow-def', D, 'node', 'FlowDefinition', '角の尖った実線の四角。名前の区画と compartment-stack', 'interconnection-element(8.2.3.16)'],
  ['flow-def-name-compartment', D, 'label', 'FlowDefinition の接頭辞・名前', "'«' DefinitionPrefix 'succession'? 'flow' 'def' '»' の行と definition-name-with-alias の行", 'flow-def'],
  ['constraint', D, 'node', 'ConstraintUsage(AssertConstraintUsage・RequirementUsage などの下位の種類を除く)で、isReference でないもの', '角の丸い実線の四角。四辺に引数(param-t*・param-l*・param-r*・param-b*)。中に名前の区画、general-view、compartment-stack', 'interconnection-element(8.2.3.20)', '中の general-view は描かない'],
  ['constraint-ref', D, 'node', 'ConstraintUsage で isReference のもの', '角の丸い破線の四角。中身は constraint と同じ', 'interconnection-element(8.2.3.20)', '中の general-view は描かない'],
  ['constraint-name-compartment', D, 'label', 'ConstraintUsage の接頭辞・名前・型', "'«' OccurrenceUsagePrefix 'constraint' '»' の行と usage-name-with-alias の行", 'constraint・constraint-ref'],
  ['requirement', D, 'node', 'RequirementUsage(ConcernUsage・ViewpointUsage・SatisfyRequirementUsage を除く)で、isReference でないもの', '角の丸い実線の四角。四辺に引数。中に名前の区画、general-view、compartment-stack', 'interconnection-element(8.2.3.21)', '中の general-view は描かない'],
  ['requirement-ref', D, 'node', 'RequirementUsage で isReference のもの', '角の丸い破線の四角。中身は requirement と同じ', 'interconnection-element(8.2.3.21)', '中の general-view は描かない'],
  ['requirement-name-compartment', D, 'label', 'RequirementUsage の接頭辞・名前・型', "'«' OccurrenceUsagePrefix 'requirement' '»' の行と usage-name-with-alias の行", 'requirement・requirement-ref'],
  ['concern', D, 'node', 'ConcernUsage', '角の丸い実線の四角。名前の区画と compartment-stack', 'interconnection-element(8.2.3.21)'],
  ['concern-name-compartment', D, 'label', 'ConcernUsage の接頭辞・名前・型', "'«' OccurrenceUsagePrefix 'concern' '»' の行と usage-name-with-alias の行", 'concern'],
  ['distinguished-parameter', D, 'node', 'subject・actor・stakeholder の引数(SubjectMembership・ActorMembership・StakeholderMembership の特徴)', '選択肢 subject・actor・stakeholder', 'interconnection-element(8.2.3.21)'],
  ['subject', D, 'node', 'SubjectMembership が所有する特徴', "角の丸い実線の四角に '«subject»' と subject-name", 'distinguished-parameter'],
  ['actor', D, 'node', 'ActorMembership が所有する特徴', "棒人間の下に actor-name、または角の丸い四角に '«actor»' と actor-name", 'distinguished-parameter', '2 つの選択肢のどちらで描くかは問 Q5'],
  ['stakeholder', D, 'node', 'StakeholderMembership が所有する特徴', "角の丸い実線の四角に '«stakeholder»' と stakeholder-name", 'distinguished-parameter'],
  ['subject-name', D, 'label', '特徴の UsageDeclaration', '文字', 'subject'],
  ['actor-name', D, 'label', '特徴の UsageDeclaration', '文字', 'actor'],
  ['stakeholder-name', D, 'label', '特徴の UsageDeclaration', '文字', 'stakeholder'],
  ['distinguished-parameter-link', D, 'edge', '要求(など)と、その subject・actor・stakeholder の引数の所有の関係', '実線。矢じりなし', 'interconnection-element(8.2.3.21)'],
  ['subject-actors-stakeholders-node', D, 'endset', 'distinguished-parameter-link の始点', '選択肢 requirement(8.2.3.21)、analysis・analysis-def(8.2.3.23)、verification・verification-def(8.2.3.24)、use-case・use-case-def(8.2.3.25)。このうち相互接続ビューの箱は requirement だけ', 'distinguished-parameter-link', 'requirement を始点とするものだけ描く'],
  ['concern-stakeholder-link', D, 'edge', '関心事(ConcernUsage)と、その stakeholder の引数', '実線。矢じりなし', 'interconnection-element(8.2.3.21)', '終点は &stakeholder-node(本文に定義がない。stakeholder と読む。問 Q14)'],
  ['stakeholder-node', D, 'endset', '本文に定義がない。stakeholder と読む', '—', 'concern-stakeholder-link', '問 Q14', { ref: '&stakeholder-node' }],
  ['viewpoint-def', D, 'node', 'ViewpointDefinition', '角の尖った実線の四角。名前の区画と compartment-stack', 'interconnection-element(8.2.3.26)'],
  ['viewpoint-def-name-compartment', D, 'label', 'ViewpointDefinition の接頭辞・名前', "'«' DefinitionPrefix 'viewpoint' 'def' '»' の行と definition-name-with-alias の行", 'viewpoint-def'],
  ['viewpoint', D, 'node', 'ViewpointUsage', '角の丸い実線の四角。名前の区画と compartment-stack', 'interconnection-element(8.2.3.26)'],
  ['viewpoint-name-compartment', D, 'label', 'ViewpointUsage の接頭辞・名前・型', "'«' OccurrenceUsagePrefix 'viewpoint' '»' の行と usage-name-with-alias の行", 'viewpoint'],
  ['view-def', D, 'node', 'ViewDefinition', '角の尖った実線の四角。名前の区画と compartment-stack', 'interconnection-element(8.2.3.26)'],
  ['view-def-name-compartment', D, 'label', 'ViewDefinition の接頭辞・名前', "'«' DefinitionPrefix 'view' 'def' '»' の行と definition-name-with-alias の行", 'view-def'],
  ['view', D, 'node', 'ViewUsage を箱として描くとき', '角の丸い実線の四角。名前の区画と compartment-stack', 'interconnection-element(8.2.3.26)'],
  ['view-name-compartment', D, 'label', 'ViewUsage の接頭辞・名前・型', "'«' OccurrenceUsagePrefix 'view' '»' の行と usage-name-with-alias の行", 'view'],
  ['definition-name-with-alias', D, 'label', '定義の DefinitionDeclaration と別名', "宣言の後に任意で '«alias»' と修飾名の並び", '各定義の名前の区画'],
  ['usage-name-with-alias', D, 'label', '使用の UsageDeclaration と別名', "先頭に任意の '^'(継承したもの)、宣言、任意で '«alias»' と修飾名の並び", '各使用の名前の区画'],
  ['compartment-stack', D, 'compartment', '箱の持ち主の名前空間', '区画を縦に積む', '各箱'],

  // ---- 辺のポートと引数
  ['port-l', D, 'port', '箱の持ち主が所有する PortUsage(左の辺)', '辺の上に小さな角の丸い四角(中に pdh)、外側の上に port-label。破線の四角は参照のポート(入れ子のポートだけ)。入れ子のポートを持つものは縦に長い角の丸い四角(上に pdh、port-label を 90 度回して書き、その左の辺に port-l*)。proxy-v も選べる', 'part・part-ref・part-def・port-def・port-usage の四辺'],
  ['port-r', D, 'port', '箱の持ち主が所有する PortUsage(右の辺)', 'port-l を左右反転したもの。port-label は外側の上', '同上'],
  ['port-t', D, 'port', '箱の持ち主が所有する PortUsage(上の辺)', '辺の上に小さな角の丸い四角(中に pdv)、左上に port-label。入れ子のポートを持つものは横に長い角の丸い四角(上の辺に port-t*、右に pdv を 90 度回して書く)。proxy-h も選べる', '同上'],
  ['port-b', D, 'port', '箱の持ち主が所有する PortUsage(下の辺)', '辺の上に小さな角の丸い四角(中に pdv)、右下に port-label。入れ子のものは下の辺に port-b*。proxy-h も選べる', '同上'],
  ['pdh', D, 'adorn', 'PortUsage・引数の向き(direction)', "横向きの矢印。'<->'(両向き)、'->'(右向き)、'<-'(左向き)の 3 つの選択肢。開いた矢じり", 'port-l・port-r・param-l・param-r', '向きと矢印の対応、向きのないポートの扱いは問 Q6'],
  ['pdv', D, 'adorn', 'PortUsage・引数の向き(direction)', '縦向きの矢印。両向き・上向き・下向きの 3 つの選択肢。開いた矢じり', 'port-t・port-b・param-t・param-b', '問 Q6'],
  ['port-label', D, 'label', "PortUsage の名前と型(QualifiedName (':' QualifiedName)?)", '文字', 'port-l・port-r・port-t・port-b'],
  ['proxy-v', D, 'port', '接続の端の特徴の連鎖(途中の要素を描かないもの)', '縦の辺の上の黒丸。右または左に proxy-label', 'port-l・port-r の選択肢', '問 Q7'],
  ['proxy-h', D, 'port', '接続の端の特徴の連鎖(途中の要素を描かないもの)', '横の辺の上の黒丸。下または上に proxy-label', 'port-t・port-b の選択肢', '問 Q7'],
  ['proxy-label', D, 'label', "特徴の連鎖('.'? FeatureChainMember)", '文字', 'proxy-v・proxy-h', '定義は 8.2.3.9 節(シーケンスビューの節)にあるが、文字の生成規則なので描く'],
  ['param-l', D, 'port', 'constraint・requirement の引数(ParameterMembership の特徴。左の辺)', '辺の上に小さな角の丸い四角(中に pdh)、上に param-label。入れ子の引数を持つものは縦に長い四角。proxy-v の選択肢は描かない(アクションフロービューの中だけで有効、8.2.3.17 節の注)', 'constraint・constraint-ref・requirement・requirement-ref の四辺', '問 Q8'],
  ['param-r', D, 'port', '同上(右の辺)', 'param-l を左右反転したもの', '同上', '問 Q8'],
  ['param-t', D, 'port', '同上(上の辺)', '辺の上に小さな角の丸い四角(中に pdv)、右上に param-label', '同上', '問 Q8'],
  ['param-b', D, 'port', '同上(下の辺)', '辺の上に小さな角の丸い四角(中に pdv)、左下に param-label。入れ子のものは下に param-b*', '同上', '問 Q8'],
  ['param-label', D, 'label', "引数の名前と型(QualifiedName (':' QualifiedName)*)", '文字', 'param-l・param-r・param-t・param-b'],

  // ---- 線(connection-relationship と、その部品)
  ['connection-relationship', D, 'edge', '接続を線として描くもの', '選択肢: binding-connection・connection-graphical・n-ary-connection・n-ary-connection-def・connection-definition-elaboration・connection-usage-elaboration・connection-def-graphical(8.2.3.13)、interface-connection(8.2.3.14)、message-connection・flow・succession-flow・flow-on-connection(8.2.3.16)', 'interconnection-element(8.2.3.13)'],
  ['binding-connection', D, 'edge', 'BindingConnectorAsUsage', "実線。線の中ほどの上に '='。矢じりなし", 'connection-relationship'],
  ['connection-graphical', D, 'edge', '端が 2 つの ConnectionUsage(InterfaceUsage・AllocationUsage・FlowUsage を除く)', '実線。中央の上に connection-label。両端の近くの上に rolename、下に multiplicity と c-adornment。2 つ目の選択肢は終点に開いた矢じり', 'connection-relationship', '矢じりのある選択肢に当たる抽象構文は問 Q9'],
  ['c-adornment', D, 'adorn', '接続の端の特徴の性質(ordered・nonunique・abstract・derived・readonly、向き、subsets、redefines)', '端の近くの文字', 'connection-graphical・connection-def-graphical・n-ary-def-segment'],
  ['connection-end', D, 'endset', '接続の端の参照先の要素', '選択肢 usage-node・usage-edge。図に描いた箱・線だけを端にする', 'connection-graphical', '端の参照先が図にないときの扱いは問 Q7'],
  ['usage-edge', D, 'endset', '線を端にする接続', '選択肢 connection-graphical・binding-connection・allocate-relationship・message・flow・succession-flow ほか', 'connection-end', 'GR4 で描く線(この一覧の edge)だけを端にする'],
  ['connection-label', D, 'label', '接続の UsageDeclaration', '文字', 'connection-graphical・connection-def-graphical'],
  ['rolename', D, 'label', '接続の端の特徴の名前(Identification?)', '文字', 'connection-graphical ほか'],
  ['multiplicity', D, 'label', '接続の端の特徴の多重度(MultiplicityRange?)', '文字', 'connection-graphical ほか'],
  ['connection-def-graphical', D, 'edge', '端が 2 つの ConnectionDefinition を線として描くとき', 'connection-graphical と同じ形で、端が type-node(定義・使用の箱)', 'connection-relationship', '問 Q4'],
  ['n-ary-connection', D, 'edge', '端が 3 つ以上の ConnectionUsage', '黒丸(n-ary-connection-dot)から各端へ n-ary-segment の実線', 'connection-relationship'],
  ['n-ary-connection-dot', D, 'adorn', '端が 3 つ以上の ConnectionUsage', '黒丸。左に cdot-label', 'n-ary-connection'],
  ['cdot-label', D, 'label', '接続の UsageDeclaration', '文字', 'n-ary-connection-dot'],
  ['n-ary-segment', D, 'edge', '接続の 1 つの端', '黒丸から端の箱への実線。端の近くの上に rolename、下に multiplicity', 'n-ary-connection'],
  ['n-ary-connection-def', D, 'edge', '端が 3 つ以上の ConnectionDefinition を線として描くとき', '黒丸(n-ary-def-connection-dot)から各端へ n-ary-def-segment の実線', 'connection-relationship', '問 Q4'],
  ['n-ary-def-connection-dot', D, 'adorn', '端が 3 つ以上の ConnectionDefinition', '黒丸。左に cdot-def-label', 'n-ary-connection-def'],
  ['cdef-label', D, 'label', '接続の定義の Identification', '文字', 'n-ary-def-connection-dot', "n-ary-def-connection-dot は cdot-def-label を参照するが、本文で定義されているのは cdef-label。裁定 Q17: cdot-def-label は cdef-label の書き誤りと読む"],
  ['n-ary-def-segment', D, 'edge', '接続の定義の 1 つの端', '黒丸から端の箱への実線。端の近くに rolename、multiplicity、c-adornment', 'n-ary-connection-def'],
  ['connection-definition-elaboration', D, 'edge', '線で描いた接続と、その定義の箱の対応', '線の途中から定義の箱への点線', 'connection-relationship', '問 Q4'],
  ['connection-usage-elaboration', D, 'edge', '線で描いた接続と、その使用の箱の対応', '線の途中から使用の箱への点線', 'connection-relationship', '問 Q4'],
  ['interface-connection', D, 'edge', '端が 2 つの InterfaceUsage', "実線。中央の上に任意の '«interface»' と interface-label。線の上に flow-node*(フローの矢印)。両端の近くに rolename・multiplicity", 'connection-relationship(8.2.3.14)', '端は &port-node(本文に port-node の定義はない)'],
  ['port-node', D, 'endset', '本文に定義がない。ポート(port-l・port-r・port-t・port-b)と読む', '—', 'interface-connection・flow-on-connection の端', '問 Q11', { ref: '&port-node' }],
  ['interface-label', D, 'label', 'InterfaceUsage の UsageDeclaration?', '文字', 'interface-connection'],
  ['message-connection', D, 'edge', '本文に定義がない。message(FlowUsage で isAbstract のもの、Message の規則)と読む', 'message と同じ', 'connection-relationship(8.2.3.16)', '問 Q10', { ref: 'message-connection' }],
  ['message', D, 'edge', 'Message の規則で作った FlowUsage(isAbstract、端が ParameterMembership の EventOccurrenceUsage)', "実線。終点に開いた矢じり。中央の上に任意の '«message»' と message-label", 'message-connection', '問 Q10'],
  ['message-label', D, 'label', "メッセージの UsageDeclaration と 'of' の型", '文字', 'message・message-node-*'],
  ['flow', D, 'edge', 'FlowUsage(SuccessionFlowUsage・メッセージを除く)', "実線。終点に塗りつぶした三角の矢じり。中央の上に任意の '«flow»' と flow-label", 'interconnection-element・connection-relationship(8.2.3.16)', '端は flow-end-node(問 Q11)'],
  ['flow-label', D, 'label', "フローの UsageDeclaration と 'of' の型", '文字', 'flow・succession-flow・flow-node-*', '本文の 8.2.3.16 節に flow-label の定義が 2 つあり、中身が違う(問 Q12)'],
  ['flow-end-node', D, 'endset', 'フローの端の参照先', '選択肢 parameter・proxy。parameter は 8.2.3.17 節の param-*、proxy は本文に定義がない', 'flow・succession-flow', '問 Q11'],
  ['succession-flow', D, 'edge', 'SuccessionFlowUsage', "破線。終点に塗りつぶした三角の矢じり。中央の上に任意の '«succession flow»' と succession-flow-label", 'connection-relationship(8.2.3.16)'],
  ['succession-flow-label', D, 'label', 'flow-label と同じ', '文字', 'succession-flow'],
  ['flow-on-connection', D, 'edge', '2 つのポートを結ぶ接続の上に描くフロー', '2 つのポートの間の実線の上に flow-node*(フローの矢印)', 'connection-relationship(8.2.3.16)', '問 Q11'],
  ['flow-node', D, 'adorn', 'interface-connection・flow-on-connection の上のフローの印', '選択肢 flow-node-r・flow-node-l・sflow-node-r・sflow-node-l・message-node-r・message-node-l', 'interface-connection・flow-on-connection', '同じ名前 flow-node が、usage-node の箱(8.2.3.16 節の前半)と、線の上の印(後半)の 2 つに定義されている。ここは後半', { sec: '8.2.3.16', nth: 1 }],
  ['flow-node-r', D, 'adorn', 'FlowUsage(右向き)', "短い線分の中ほどに右向きの塗りつぶした三角。上に任意の '«flow»' と flow-label", 'flow-node'],
  ['flow-node-l', D, 'adorn', 'FlowUsage(左向き)', '左向きの塗りつぶした三角。上に文字', 'flow-node'],
  ['sflow-node-r', D, 'adorn', 'SuccessionFlowUsage(右向き)', "右向きの塗りつぶした三角。上に任意の '«succession flow»' と flow-label", 'flow-node'],
  ['sflow-node-l', D, 'adorn', 'SuccessionFlowUsage(左向き)', '左向きの塗りつぶした三角。上に文字', 'flow-node'],
  ['message-node-r', D, 'adorn', 'メッセージ(右向き)', "右向きの開いた三角。上に任意の '«message»' と message-label", 'flow-node'],
  ['message-node-l', D, 'adorn', 'メッセージ(左向き)', '左向きの開いた三角。上に文字', 'flow-node'],
  ['msg-end-node', D, 'endset', 'メッセージの端の参照先', "選択肢 occurrence・sq-l-node・item・part・port・action・state・use-case・verification-case・analysis-case・proxy。このうち item・part・port だけが相互接続ビューの箱", 'message', '相互接続ビューの箱(item・part・ポート)を端にするものだけ描く。ほかは描かない'],

  // ---- 注釈・依存(dependencies-and-annotations-element)
  ['dependencies-and-annotations-element', D, 'annotation', '注釈と依存', '選択肢 dependencies-element(8.2.3.3)、annotation-node・annotation-link(8.2.3.4)', 'interconnection-view'],
  ['dependencies-element', D, 'annotation', 'Dependency', '選択肢 binary-dependency・n-ary-dependency', 'dependencies-and-annotations-element'],
  ['binary-dependency', D, 'edge', '依存元・依存先が 1 つずつの Dependency', '破線。終点に開いた矢じり。上に任意の rel-name', 'dependencies-element'],
  ['n-ary-dependency', D, 'edge', '依存元か依存先が 2 つ以上の Dependency', '黒丸(n-ary-association-dot)から各要素への破線', 'dependencies-element'],
  ['n-ary-association-dot', D, 'adorn', '依存元か依存先が 2 つ以上の Dependency', '黒丸。上に任意の rel-name', 'n-ary-dependency'],
  ['n-ary-dependency-client-link', D, 'edge', 'Dependency の依存元(client)', '依存元から黒丸への破線。矢じりなし', 'n-ary-dependency'],
  ['n-ary-dependency-supplier-link', D, 'edge', 'Dependency の依存先(supplier)', '黒丸から依存先への破線。終点に開いた矢じり', 'n-ary-dependency'],
  ['rel-name', D, 'label', '関係の Identification か QualifiedName', '文字', 'binary-dependency・n-ary-association-dot・annotation-link', { sec: '8.2.3.2' }],
  ['element-node', D, 'endset', '依存の端の参照先', '選択肢 usage-node・definition-node・annotation-node・namespace-node。図に描いた箱だけを端にする', 'binary-dependency ほか', '本文の 8.2.3.2 節と 8.2.3.3 節に同じ定義がある', { sec: '8.2.3.2' }],
  ['annotation-node', D, 'annotation', '注釈の要素(AnnotatingElement)', '選択肢 comment-node・documentation-node・textual-representation-node(8.2.3.4)、metadata-feature-annotation-node(8.2.3.27)', 'dependencies-and-annotations-element'],
  ['comment-node', D, 'annotation', 'Comment(Documentation を除く)', '選択肢 comment-without-keyword・comment-with-keyword', 'annotation-node'],
  ['comment-without-keyword', D, 'annotation', '名前も locale もない Comment', '右上の角を折った四角(ノートの形)。中に text-block', 'comment-node'],
  ['comment-with-keyword', D, 'annotation', '名前か locale のある Comment', "ノートの形。上に '«comment»'、Identification と任意の 'locale' 文字列、その下に text-block", 'comment-node'],
  ['documentation-node', D, 'annotation', 'Documentation', "ノートの形。上に '«doc»'、Identification と任意の 'locale' 文字列、その下に text-block", 'annotation-node'],
  ['textual-representation-node', D, 'annotation', 'TextualRepresentation', "ノートの形。上に '«rep»' と Identification、その下に language-string と text-block", 'annotation-node'],
  ['language-string', D, 'label', "TextualRepresentation の language('language' '=' 文字列)", '文字', 'textual-representation-node'],
  ['text-block', D, 'label', '注釈の本文(LINE_TEXT の並び)', '複数行の文字', '注釈の各記号'],
  ['metadata-feature-annotation-node', D, 'annotation', 'MetadataUsage(注釈として書いたもの)', "ノートの形。上に '«metadata»'、metadata-feature-decl、その下に metadata-feature-name-value-list", 'annotation-node(8.2.3.27)'],
  ['metadata-feature-decl', D, 'label', 'MetadataUsage の名前(Identifier)', '文字', 'metadata-feature-annotation-node'],
  ['metadata-feature-name-value-list', D, 'label', "MetadataUsage の特徴の名前と値の式(名前 '=' 式)の並び", '複数行の文字', 'metadata-feature-annotation-node'],
  ['annotation-link', D, 'edge', 'Annotation(注釈と注釈される要素の関係)', '注釈の記号から要素への破線。矢じりなし。上に任意の rel-name', 'dependencies-and-annotations-element'],
  ['element-inside-textual-compartment', D, 'adorn', '文字の区画の中の 1 つの要素(線の端になるもの)', '区画の中の該当する文字の範囲を灰色にする', 'annotation-link・allocation-node の端', '本文の 8.2.3.15 節では element-in-textual-compartment と書かれている。裁定 Q17: その書き誤りと読む', { sec: '8.2.3.2' }],

  // ---- 文字の区画(compartment-stack の中。8.2.3 節の各節の compartment の選択肢)
  ['documentation-compartment', D, 'compartment', '持ち主の Documentation', "区切りの横線と斜体の見出し 'doc'、その下に Identification と text-block", 'package-compartment(8.2.3.5)', '問 Q13'],
  ['packages-compartment', D, 'compartment', '持ち主が所有する Package', "見出し 'packages'。各行は el-prefix? Identification", 'package-compartment(8.2.3.5)', '問 Q13'],
  ['members-compartment', D, 'compartment', '持ち主のメンバー(定義・使用)', "見出し 'members'。各行は el-prefix? (DefinitionElement | UsageElement)", 'package-compartment(8.2.3.5)', '問 Q13'],
  ['relationships-compartment', D, 'compartment', '持ち主の関係(defines・specializes・subsets・performs・allocated・satisfy など)', "見出し 'relationships'。各行は el-prefix? 関係の名前 修飾名", 'package-compartment(8.2.3.5)', '問 Q13'],
  ['features-compartment', D, 'compartment', '持ち主が所有する Usage', "見出し 'features'。各行は el-prefix? UsagePrefix usage-cp", 'compartment(8.2.3.6)', '問 Q13'],
  ['variants-compartment', D, 'compartment', '持ち主の VariantMembership の要素', "見出し 'variants'。中身は members-compartment-contents", 'compartment(8.2.3.6)', '問 Q13'],
  ['variant-elementusages-compartment', D, 'compartment', '持ち主の VariantMembership の要素', "見出し 'variant elementusages'", 'compartment(8.2.3.6)', '問 Q13'],
  ['attributes-compartment', D, 'compartment', '持ち主が所有する AttributeUsage', "見出し 'attributes'。各行は el-prefix? UsagePrefix usage-cp", 'compartment(8.2.3.7)', '問 Q13'],
  ['enums-compartment', D, 'compartment', '持ち主(EnumerationDefinition)の列挙値', "見出し 'enums'", 'compartment(8.2.3.8)', '問 Q13'],
  ['occurrences-compartment', D, 'compartment', '持ち主が所有する OccurrenceUsage', "見出し 'occurrences'", 'compartment(8.2.3.9)', '問 Q13'],
  ['individuals-compartment', D, 'compartment', '持ち主が所有する個体の OccurrenceUsage', "見出し 'individuals'", 'compartment(8.2.3.9)', '問 Q13'],
  ['timeslices-compartment', D, 'compartment', '持ち主が所有する timeslice の OccurrenceUsage', "見出し 'timeslices'", 'compartment(8.2.3.9)', '問 Q13'],
  ['snapshots-compartment', D, 'compartment', '持ち主が所有する snapshot の OccurrenceUsage', "見出し 'snapshots'", 'compartment(8.2.3.9)', '問 Q13'],
  ['items-compartment', D, 'compartment', '持ち主が所有する ItemUsage', "見出し 'items'", 'compartment(8.2.3.10)', '問 Q13'],
  ['parts-compartment', D, 'compartment', '持ち主が所有する PartUsage', "見出し 'parts'", 'compartment(8.2.3.11)', '問 Q13'],
  ['directed-features-compartment', D, 'compartment', '持ち主が所有する向きのある特徴', "見出し 'directed features'。各行は el-prefix 向き 本体", 'compartment(8.2.3.11)', '問 Q13'],
  ['ports-compartment', D, 'compartment', '持ち主が所有する PortUsage', "見出し 'ports'", 'compartment(8.2.3.12)', '問 Q13'],
  ['connections-compartment', D, 'compartment', '持ち主が所有する ConnectionUsage', "見出し 'connections'", 'compartment(8.2.3.13)', '問 Q13'],
  ['interfaces-compartment', D, 'compartment', '持ち主が所有する InterfaceUsage', "見出し 'interfaces'", 'compartment(8.2.3.14)', '問 Q13'],
  ['ends-compartment', D, 'compartment', '持ち主(接続・インターフェース)の端の特徴', "見出し 'ends'。各行は 修飾名 (':' 修飾名)?", 'compartment(8.2.3.14)', '問 Q13'],
  ['allocations-compartment', D, 'compartment', '持ち主が所有する AllocationUsage', "見出し 'allocations'", 'compartment(8.2.3.15)', '問 Q13'],
  ['flows-compartment', D, 'compartment', '持ち主が所有する FlowUsage', "見出し 'flows'", 'compartment(8.2.3.16)', '問 Q13'],
  ['actions-compartment', D, 'compartment', '持ち主が所有する ActionUsage', "見出し 'actions'", 'compartment(8.2.3.17)', '問 Q13'],
  ['perform-actions-compartment', D, 'compartment', '持ち主が所有する PerformActionUsage', "見出し 'perform actions'", 'compartment(8.2.3.17)', '問 Q13'],
  ['performed-by-compartment', D, 'compartment', '持ち主を実行する要素(perform の参照元)', "見出し 'performed by'。各行は修飾名", '本文では compartment の選択肢に入っていない', '裁定 Q17: 区画の選択肢に入れる。問 Q13'],
  ['parameters-compartment', D, 'compartment', '持ち主の引数', "見出し 'parameters'", 'compartment(8.2.3.17)', '問 Q13'],
  ['states-compartment', D, 'compartment', '持ち主が所有する StateUsage', "見出し 'states'", 'compartment(8.2.3.18)', '問 Q13'],
  ['state-actions-compartment', D, 'compartment', '持ち主の entry・do・exit のアクション', "見出し 'state actions'", 'compartment(8.2.3.18)', "選択肢の並びでは states-actions-compartment と書かれている。裁定 Q17: その書き誤りと読む。問 Q13"],
  ['exhibit-states-compartment', D, 'compartment', '持ち主が所有する ExhibitStateUsage', "見出し 'exhibit states'", 'compartment(8.2.3.18)', '問 Q13'],
  ['successions-compartment', D, 'compartment', '持ち主の継承(succession)', "見出し 'successions'。各行は修飾名", 'compartment(8.2.3.18)', '問 Q13'],
  ['calcs-compartment', D, 'compartment', '持ち主が所有する CalculationUsage', "見出し 'calcs'", 'compartment(8.2.3.19)', '問 Q13'],
  ['result-compartment', D, 'compartment', '持ち主(計算)の結果の式', "見出し 'result'。中身は OwnedExpression", 'compartment(8.2.3.19)', '問 Q13'],
  ['constraints-compartment', D, 'compartment', '持ち主が所有する ConstraintUsage', "見出し 'constraints'", 'compartment(8.2.3.20)', '問 Q13'],
  ['assert-constraints-compartment', D, 'compartment', '持ち主が所有する AssertConstraintUsage', "見出し 'assert constraints'", 'compartment(8.2.3.20)', '問 Q13'],
  ['requirements-compartment', D, 'compartment', '持ち主が所有する RequirementUsage', "見出し 'requirements'", 'compartment(8.2.3.21)', '問 Q13'],
  ['require-constraints-compartment', D, 'compartment', '持ち主の require の制約(RequirementConstraintMembership)', "見出し 'require constraints'", 'compartment(8.2.3.21)', '問 Q13'],
  ['assume-constraints-compartment', D, 'compartment', '持ち主の assume の制約', "見出し 'assume constraints'", 'compartment(8.2.3.21)', '問 Q13'],
  ['satisfy-requirements-compartment', D, 'compartment', '持ち主が所有する SatisfyRequirementUsage', "見出し 'satisfy requirements'(本文の図では 'satify requirements'。裁定 Q17: 'satisfy requirements' と表示する)。中身は text-block", 'compartment(8.2.3.21)', '問 Q13'],
  ['satisfies-compartment', D, 'compartment', '持ち主を満たす要求', "見出し 'satisfies'", 'compartment(8.2.3.21)', '問 Q13'],
  ['actors-compartment', D, 'compartment', '持ち主の actor の引数', "見出し 'actors'", 'compartment(8.2.3.21)', '問 Q13'],
  ['subject-compartment', D, 'compartment', '持ち主の subject の引数', "見出し 'subject'", 'compartment(8.2.3.21)', '問 Q13'],
  ['stakeholders-compartment', D, 'compartment', '持ち主の stakeholder の引数', "見出し 'stakeholders'", 'compartment(8.2.3.21)', '問 Q13'],
  ['frames-compartment', D, 'compartment', '持ち主の frame の関心事(FramedConcernMembership)', "見出し 'frames'", 'compartment(8.2.3.21)', '問 Q13'],
  ['concerns-compartment', D, 'compartment', '持ち主の関心事', "見出し 'concerns'", '本文では compartment の選択肢に入っていない', '裁定 Q17: 区画の選択肢に入れる。問 Q13'],
  ['objective-compartment', D, 'compartment', '持ち主(ケース)の objective', "見出し 'objective'", 'compartment(8.2.3.22)', '問 Q13'],
  ['analyses-compartment', D, 'compartment', '持ち主が所有する AnalysisCaseUsage', "見出し 'analyses'", 'compartment(8.2.3.23)', '問 Q13'],
  ['verifications-compartment', D, 'compartment', '持ち主が所有する VerificationCaseUsage', "見出し 'verifications'", 'compartment(8.2.3.24)', '問 Q13'],
  ['verifies-compartment', D, 'compartment', '持ち主が検証する要求(RequirementVerificationMembership)', "見出し 'verifies'", 'compartment(8.2.3.24)', '問 Q13'],
  ['verification-methods-compartment', D, 'compartment', '持ち主の検証の方法(メタデータ)', "見出し 'verification methods'", 'compartment(8.2.3.24)', '問 Q13'],
  ['use-cases-compartment', D, 'compartment', '持ち主が所有する UseCaseUsage', "見出し 'use cases'", 'compartment(8.2.3.25)', '問 Q13'],
  ['include-use-cases-compartment', D, 'compartment', '持ち主が所有する IncludeUseCaseUsage', "見出し 'include use cases'", 'compartment(8.2.3.25)', "選択肢の並びでは include-actions-compartment と書かれている。裁定 Q17: その書き誤りと読む。問 Q13"],
  ['includes-compartment', D, 'compartment', '持ち主を含むユースケース', "見出し 'includes'", 'compartment(8.2.3.25)', '問 Q13'],
  ['views-compartment', D, 'compartment', '持ち主が所有する ViewUsage', "見出し 'views'", 'compartment(8.2.3.26)', '問 Q13'],
  ['viewpoints-compartment', D, 'compartment', '持ち主が所有する ViewpointUsage', "見出し 'viewpoints'", 'compartment(8.2.3.26)', '問 Q13'],
  ['exposes-compartment', D, 'compartment', '持ち主(ビュー)の Expose', "見出し 'exposes'。各行は MembershipExpose | NamespaceExpose", 'compartment(8.2.3.26)', '問 Q13'],
  ['filters-compartment', D, 'compartment', '持ち主(ビュー)の ElementFilterMembership の式', "見出し 'filters'", 'compartment(8.2.3.26)', '問 Q13'],
  ['rendering-compartment', D, 'compartment', '持ち主(ビュー)の ViewRenderingMembership', "見出し 'rendering'", 'compartment(8.2.3.26)', '問 Q13'],
  ['el-prefix', D, 'label', "継承した要素('^')・導出した要素('/')の印", '文字', '文字の区画の各行'],
  ['usage-cp', D, 'label', '使用の宣言と値(usageDeclaration ValuePart?)', '文字', '文字の区画の各行'],
];

// ---- 本文のテキストから、行・節・ページを求める
const lines = fs.readFileSync('out/text/sysml20.txt', 'utf8').replace(/\f/g, '').split('\n');
const START = lines.findIndex((t) => /^8\.2\.3\.1 Graphical Notation Overview/.test(t));
const END = lines.findIndex((t, i) => i > START && /^8\.3 Abstract Syntax/.test(t));
if (START < 0 || END < 0) throw new Error('8.2.3 節の範囲が見つからない');

const headings = [];
for (let i = START; i < END; i++) {
  const m = /^(8\.2\.3\.\d+) (.*Graphical Notation.*?)\s*$/.exec(lines[i]);
  if (m) headings.push({ line: i + 1, section: m[1], title: m[2] });
}
const sectionOf = (line) => headings.filter((h) => h.line <= line).at(-1);
const sectionRange = (sec) => {
  const k = headings.findIndex((h) => h.section === sec);
  return [headings[k].line, (headings[k + 1]?.line ?? END + 1) - 1];
};
const footer = (t) => /Systems Modeling Language v2\.0, Part 1\s+(\d+)\s*$/.exec(t) ?? /^\s*(\d+)\s+Systems Modeling Language v2\.0, Part 1\s*$/.exec(t);
const printedPageOf = (line) => {
  for (let i = line - 1; i < lines.length; i++) { const m = footer(lines[i]); if (m) return Number(m[1]); }
  return null;
};
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function locate(name, opt) {
  const [lo, hi] = opt.sec ? sectionRange(opt.sec) : [START + 1, END];
  const hits = [];
  const re = opt.ref ? new RegExp(`(^|[\\s|])${esc(opt.ref)}(\\s|$)`) : new RegExp(`^\\s*${esc(name)}\\s*(=\\||\\|=|=)`);
  for (let i = lo - 1; i < hi; i++) if (re.test(lines[i])) hits.push(i + 1);
  return hits;
}

const pdfCache = new Map();
function pdfText(page) {
  if (!pdfCache.has(page)) pdfCache.set(page, execFileSync('pdftotext', ['-f', String(page), '-l', String(page), '-layout', PDF, '-'], { encoding: 'utf8' }));
  return pdfCache.get(page);
}

const out = [];
const problems = [];
const seen = new Set();
for (const row of SYMBOLS) {
  const [name, cls, kind, abstract, shape, from, note = '', opt0] = row;
  const opt = typeof note === 'object' ? note : (opt0 ?? {});
  const noteText = typeof note === 'string' ? note : '';
  if (seen.has(name)) problems.push(`${name}: 一覧に 2 回ある`);
  seen.add(name);
  const hits = locate(name, opt);
  const nth = opt.nth ?? 0;
  if (hits.length === 0) { problems.push(`${name}: 本文に定義の行が見つからない`); continue; }
  const line = hits[nth] ?? hits[0];
  const sec = sectionOf(line);
  const printed = printedPageOf(line);
  const pdfPage = printed + PAGE_OFFSET;
  // 図のページ: 定義の行の後で、最初に中身のある行(空でもページの足でもない行)のページ。
  // 生成規則の名前の行がページの下にあり、図が次のページにあるものがある
  let figLine = line;
  if (!opt.ref) for (let i = line; i < lines.length; i++) { const t = lines[i].trim(); if (t && !footer(lines[i])) { figLine = i + 1; break; } }
  const figurePage = printedPageOf(figLine) + PAGE_OFFSET;
  let pdfOk = null;
  if (checkPdf) {
    pdfOk = pdfText(pdfPage).includes(name);
    if (!pdfOk) problems.push(`${name}: PDF の ${pdfPage} ページに名前が見つからない`);
  }
  out.push({
    name, class: cls === D ? 'GR4 で描く' : 'GR4 では描かない(ほかのビュー)', kind,
    section: sec.section, sectionTitle: sec.title, line, printedPage: printed, pdfPage, figurePage,
    defined: !opt.ref, definitions: opt.ref ? [] : hits,
    abstract, shape, from, note: noteText, pdfChecked: pdfOk,
  });
}

// ---- interconnection-element の選択肢(本文の 9 か所)を、本文から集めて照らし合わせる
const icAlts = [];
for (let i = START; i < END; i++) {
  if (!/^\s*interconnection-element\s*(=\s*\||=\||\|=)/.test(lines[i])) continue;
  let text = lines[i].replace(/^\s*interconnection-element\s*(=\s*\||=\||\|=)/, '');
  // 選択肢は次の空行まで続く(1 行目が空で、2 行目から並ぶ書き方もある)
  for (let j = i + 1; j < END && lines[j].trim() !== ''; j++) text += ' ' + lines[j];
  const alts = text.split('|').map((s) => s.trim()).filter(Boolean);
  icAlts.push({ line: i + 1, section: sectionOf(i + 1).section, alternatives: alts });
}
const listed = new Set(out.map((o) => o.name));
const icMissing = icAlts.flatMap((a) => a.alternatives.filter((x) => !listed.has(x) && x !== 'port').map((x) => `${a.section} ${x}`));
if (icMissing.length) problems.push(`interconnection-element の選択肢で一覧にないもの: ${icMissing.join(', ')}`);

// ---- 状態遷移ビュー(GR6 指示書 4 章)
// 起点は state-transition-view(8.2.3.18 節)。action-flow-view に入るところで止める。
// 区分
//   draw6    GR6 で描く
//   nodraw6  GR6 では描かない(理由は注記)
// STATE_SYMBOLS は GR6 で新しく一覧に入れるもの(並びは SYMBOLS と同じ)。
// STATE_REUSE は GR4 の一覧(SYMBOLS)にあり、状態遷移ビューからも参照される記号。抽象構文・図形の要点は GR4 の行を写し、
// 区分と GR6 の注記だけをここに書く。
const D6 = 'draw6', N6 = 'nodraw6';
const STATE_SYMBOLS = [
  // ---- ビューと選択肢
  ['state-transition-view', D6, 'view', '描く範囲の名前空間(状態の定義・使用)が所有するメンバーのうち、状態遷移ビューで描く要素', '箱の中の領域。state-transition-element の並び、注釈・依存', 'state-def・state・state-ref の箱の中、frameless-view、state-transition-compartment', '本文の生成規則に ellipsis-at-lower-left-corner がない(裁定 Q11)', { sec: '8.2.3.18' }],
  ['state-transition-element', D6, 'choice', '状態遷移ビューの要素', '選択肢 state-transition-node・transition・st-succession', 'state-transition-view'],
  ['state-transition-node', D6, 'choice', '状態遷移ビューの節点', '15 の選択肢: state-node・state-ref-node・start-node・entry-action・do-action・exit-action・done-node・fork-node・join-node・decision-node・merge-node・terminate-node・action・perform-action-usage・action-ref', 'state-transition-element、transition・st-succession の端'],

  // ---- 状態の定義と使用の箱
  ['state-def', D6, 'node', 'StateDefinition(描く範囲が状態の定義のとき、その外側の箱)', '角の尖った実線の四角。上から state-def-name-compartment、state-entry-action、state-do-action、state-transition-view、state-exit-action、compartment-stack', 'definition-node(8.2.3.18)。state-transition-node の選択肢にはない', '裁定 Q2'],
  ['state-def-name-compartment', D6, 'label', 'StateDefinition の接頭辞・名前・isParallel', "'«' DefinitionPrefix 'state' 'def' '»' の行、definition-name-with-alias の行、任意で '«parallel»' の行", 'state-def'],
  ['state', D6, 'node', 'StateUsage(ExhibitStateUsage を除く)で、isReference でないもの', '角の丸い実線の四角。上から state-name-compartment、state-entry-action、state-do-action、state-transition-view、state-exit-action、compartment-stack', 'usage-node(8.2.3.18)の state-node', '裁定 Q1: state と読む'],
  ['state-node', D6, 'endset', '本文に定義がない。state と読む', '—', 'usage-node・state-transition-node・state-source', '裁定 Q1', { sec: '8.2.3.18', ref: 'state-node' }],
  ['state-ref', D6, 'node', 'StateUsage で isReference のもの', '角の丸い破線の四角。上から state-name-compartment、state-transition-view、compartment-stack(entry・do・exit の区画がない)', 'state-transition-node の state-ref-node', '裁定 Q1: state と読む'],
  ['state-ref-node', D6, 'endset', '本文に定義がない。state-ref と読む', '—', 'state-transition-node・state-source', '裁定 Q1: state と読む', { sec: '8.2.3.18', ref: 'state-ref-node' }],
  ['state-name-compartment', D6, 'label', 'StateUsage の接頭辞・名前・型・isParallel', "'«' OccurrenceUsagePrefix 'state' '»' の行、usage-name-with-alias の行、任意で '«parallel»' の行", 'state・state-ref・exhibit-state-name-compartment'],
  ['exhibit-state-usage', D6, 'node', 'ExhibitStateUsage', '角の丸い実線の四角。exhibit-state-name-compartment と compartment-stack だけ(state-transition-view を持たない)', 'usage-node(8.2.3.18)。state-transition-node の選択肢にはない', '描く範囲が exhibit state のときの外側の箱は裁定 Q2'],
  ['exhibit-state-name-compartment', D6, 'label', 'ExhibitStateUsage の名前・型', "'«exhibit-state»' の行の下に state-name-compartment", 'exhibit-state-usage', '裁定 Q3'],

  // ---- entry・do・exit
  ['state-entry-action', D6, 'compartment', 'StateSubactionMembership(kind = entry)の行動', "区切りの横線と見出し 'entry'(図では斜体でない)、その下に state-subaction-body", 'state-def・state', '裁定 Q4: 原則この区画で描き、本体も文字で出す。遷移・st-succession の端になるもの、持ち主の状態の箱が図にないものは節点で描く'],
  ['state-do-action', D6, 'compartment', 'StateSubactionMembership(kind = do)の行動', "区切りの横線と見出し 'do'、その下に state-subaction-body", 'state-def・state', '裁定 Q4: 原則この区画で描き、本体も文字で出す。遷移・st-succession の端になるもの、持ち主の状態の箱が図にないものは節点で描く'],
  ['state-exit-action', D6, 'compartment', 'StateSubactionMembership(kind = exit)の行動', "区切りの横線と見出し 'exit'、その下に state-subaction-body", 'state-def・state', '裁定 Q4: 原則この区画で描き、本体も文字で出す。遷移・st-succession の端になるもの、持ち主の状態の箱が図にないものは節点で描く'],
  ['state-subaction-body', D6, 'label', 'entry・do・exit の行動(ActionUsage)', '選択肢 state-subaction-body-textual・action-flow-view。GR6 は文字の形だけを描く', 'state-entry-action・state-do-action・state-exit-action・entry-action・do-action・exit-action', 'action-flow-view の形は描かず、描いていないことを表示する(設計書 7.4 節)'],
  ['state-subaction-body-textual', D6, 'label', '行動の宣言と本体', "state-subaction-declaration? ( '{' ActionBodyItem* '}' )? の文字", 'state-subaction-body', '裁定 Q4: 本体 { … } も文字で出す'],
  ['state-subaction-declaration', D6, 'label', '行動の宣言(PerformActionUsage・AcceptActionUsage・SendActionUsage・AssignmentActionUsage の宣言)', '文字', 'state-subaction-body-textual'],
  ['entry-action', D6, 'node', 'StateSubactionMembership(kind = entry)の行動を箱で描くとき', "2 つの選択肢。1 つ目は黒く塗った小さな角の丸い四角(後の '|' は選択肢の記号)。2 つ目は角の丸い実線の四角で、四辺に param-*、中に entry-action-name-comp と state-subaction-body", 'state-transition-node', '裁定 Q5: 黒い角の丸い四角は entry-action のもう 1 つの形。裁定 Q6: 宣言も本体もない空の entry はこの形で描く。裁定 Q4: 遷移・st-succession の端になるもの、持ち主の状態の箱が図にないものを節点で描く(本体があれば 2 つ目の形)'],
  ['entry-action-name-comp', D6, 'label', 'entry の行動の接頭辞・名前・型', "'«' 'entry' OccurrenceUsagePrefix 'action' '»' の行と usage-name-with-alias の行", 'entry-action'],
  ['do-action', D6, 'node', 'StateSubactionMembership(kind = do)の行動を箱で描くとき', '角の丸い実線の四角。四辺に param-*。中に do-action-name-comp と state-subaction-body', 'state-transition-node', '裁定 Q4: 遷移・st-succession の端になるもの、持ち主の状態の箱が図にないものを箱で描く'],
  ['do-action-name-comp', D6, 'label', 'do の行動の接頭辞・名前・型', "'«' 'do' OccurrenceUsagePrefix 'action' '»' の行と usage-name-with-alias の行", 'do-action'],
  ['exit-action', D6, 'node', 'StateSubactionMembership(kind = exit)の行動を箱で描くとき', '角の丸い実線の四角。四辺に param-*。中に exit-action-name-comp と state-subaction-body', 'state-transition-node', '裁定 Q4: 同上'],
  ['exit-action-name-comp', D6, 'label', 'exit の行動の接頭辞・名前・型', "'«' 'exit' OccurrenceUsagePrefix 'action' '»' の行と usage-name-with-alias の行", 'exit-action'],

  // ---- 節点(アクションフロービューと共通の部品。定義は 8.2.3.17 節)
  ['start-node', D6, 'node', '内蔵の start(Actions::Action::start)を参照する継承・遷移の始点', '黒く塗った円', 'state-transition-node', '裁定 Q6: 内蔵の start を参照するときだけ使う(空の entry; は entry-action の黒い角の丸い四角)'],
  ['done-node', D6, 'node', '終了の節点(Actions::Action::done)', '黒く塗った円を、間をあけて円で囲んだもの', 'state-transition-node', '裁定 Q6: 内蔵の done を参照するときだけ使う'],
  ['terminate-node', D6, 'node', 'TerminateActionUsage', '円の中に × ', 'state-transition-node', '状態の本体には書けない(裁定 Q17)'],
  ['fork-node', D6, 'node', 'ForkNode', '黒く塗った太い横棒', 'state-transition-node', '裁定 Q17'],
  ['join-node', D6, 'node', 'JoinNode', '黒く塗った太い横棒(fork-node と同じ形)', 'state-transition-node', '裁定 Q17'],
  ['decision-node', D6, 'node', 'DecisionNode', '白抜きのひし形', 'state-transition-node', '裁定 Q17'],
  ['merge-node', D6, 'node', 'MergeNode', '白抜きのひし形(decision-node と同じ形)', 'state-transition-node', '裁定 Q17'],
  ['action', D6, 'node', 'ActionUsage(下位の種類のうち、ほかの選択肢で描くものを除く)で、isReference でないもの', '角の丸い実線の四角。四辺に param-*。中に action-name-compartment、action-flow-view、compartment-stack', 'state-transition-node', '中の action-flow-view は描かず、描いていないことを表示する。裁定 Q13: 状態の中の行動(AcceptActionUsage・SendActionUsage など)もこの箱で描き、名前の区画は行動の種類ごとに 8.2.3.17 節の区画を使う'],
  ['action-name-compartment', D6, 'label', 'ActionUsage の接頭辞・名前・型', "'«' OccurrenceUsagePrefix 'action' '»' の行と usage-name-with-alias の行", 'action・action-ref', "本文は usage-name-with-alias の後ろに '<' がある。裁定 Q12: 書き誤りと読み、描かない"],
  ['accept-action-name-compartment', D6, 'label', 'AcceptActionUsage の接頭辞・名前・型', "'«' OccurrenceUsagePrefix 'accept' 'action' '»' の行と usage-name-with-alias の行", 'action・action-ref(裁定 Q13)', '定義は 8.2.3.17 節の accept-action-node の名前の区画', { sec: '8.2.3.17' }],
  ['send-action-name-compartment', D6, 'label', 'SendActionUsage の接頭辞・名前・型', "'«' OccurrenceUsagePrefix 'send' 'action' '»' の行と usage-name-with-alias の行", 'action・action-ref(裁定 Q13)', '定義は 8.2.3.17 節の send-action-node の名前の区画', { sec: '8.2.3.17' }],
  ['assign-action-name-compartment', D6, 'label', 'AssignmentActionUsage の接頭辞・名前・型', "'«' OccurrenceUsagePrefix 'assign' '»' の行と usage-name-with-alias の行", 'action・action-ref(裁定 Q13)', '', { sec: '8.2.3.17' }],
  ['ifelse-action-name-compartment', D6, 'label', 'IfActionUsage の接頭辞・名前・型', "'«' OccurrenceUsagePrefix 'if' '»' の行と usage-name-with-alias の行", 'action・action-ref(裁定 Q13)', '', { sec: '8.2.3.17' }],
  ['while-loop-action-name-compartment', D6, 'label', 'WhileLoopActionUsage の接頭辞・名前・型', "'«' OccurrenceUsagePrefix 'loop' '»' の行と usage-name-with-alias の行", 'action・action-ref(裁定 Q13)', '', { sec: '8.2.3.17' }],
  ['for-loop-action-name-compartment', D6, 'label', 'ForLoopActionUsage の接頭辞・名前・型', "'«' OccurrenceUsagePrefix 'loop' '»' の行と usage-name-with-alias の行", 'action・action-ref(裁定 Q13)', '', { sec: '8.2.3.17' }],
  ['accept-action-expression', D6, 'label', 'AcceptActionUsage の AcceptParameterPart', '名前の区画の下の文字', 'action・action-ref(P2 の確認の後の裁定 1)', '', { sec: '8.2.3.17' }],
  ['send-action-expression', D6, 'label', "SendActionUsage の送るもの・'via'・'to'", '名前の区画の下の文字', 'action・action-ref(P2 の確認の後の裁定 1)', '', { sec: '8.2.3.17' }],
  ['assign-action-expression', D6, 'label', "AssignmentActionUsage の対象と ':=' の値", '名前の区画の下の文字', 'action・action-ref(P2 の確認の後の裁定 1)', '本文に定義がない(assign-action-node の図の中の名前だけ)。assign の後ろの原文(AssignmentNodeDeclaration の対象 := 値)を書く', { sec: '8.2.3.17', ref: 'assign-action-expression' }],
  ['if-condition', D6, 'compartment', 'IfActionUsage の条件の式', "区切りの横線と見出し 'if condition'(斜体でない)、その下に condition-expression", 'action・action-ref(P2 の確認の後の裁定 1)', '', { sec: '8.2.3.17' }],
  ['while-condition', D6, 'compartment', 'WhileLoopActionUsage の while の条件の式', "区切りの横線と見出し 'while condition'、その下に condition-expression", 'action・action-ref(P2 の確認の後の裁定 1)', '', { sec: '8.2.3.17' }],
  ['until-condition', D6, 'compartment', 'WhileLoopActionUsage の until の条件の式', "区切りの横線と見出し 'until condition'、その下に condition-expression", 'action・action-ref(P2 の確認の後の裁定 1)', '', { sec: '8.2.3.17' }],
  ['iteration', D6, 'compartment', 'ForLoopActionUsage の変数と範囲', "区切りの横線と見出し 'for iterator'、その下に iteration-expression", 'action・action-ref(P2 の確認の後の裁定 1)', '', { sec: '8.2.3.17' }],
  ['condition-expression', D6, 'label', '条件の式(ExpressionParameterMember)', '文字', 'if-condition・while-condition・until-condition', '', { sec: '8.2.3.17' }],
  ['iteration-expression', D6, 'label', "ForVariableDeclarationMember 'in' NodeParameterMember", '文字', 'iteration', '', { sec: '8.2.3.17' }],
  ['then-body', N6, 'compartment', 'IfActionUsage の then の本体', "見出し 'then body' と action-body", 'action・action-ref', 'P2 の確認の後の裁定 1: GR7 に回し、GR6 では描かない', { sec: '8.2.3.17' }],
  ['else-body', N6, 'compartment', 'IfActionUsage の else の本体', "見出し 'else body' と action-body", 'action・action-ref', 'P2 の確認の後の裁定 1: GR7 に回し、GR6 では描かない', { sec: '8.2.3.17' }],
  ['loop-body', N6, 'compartment', 'ループの本体', "見出し 'loop body' と action-body", 'action・action-ref', 'P2 の確認の後の裁定 1: GR7 に回し、GR6 では描かない', { sec: '8.2.3.17' }],
  ['perform-action-usage', D6, 'node', 'PerformActionUsage(entry・do・exit のものを除く)', '角の丸い実線の四角。perform-action-name-compartment と compartment-stack', 'state-transition-node'],
  ['perform-action-name-compartment', D6, 'label', 'PerformActionUsage の接頭辞・名前・型', "'«' OccurrenceUsagePrefix 'perform' 'action' '»' の行と usage-name-with-alias の行", 'perform-action-usage'],
  ['action-ref', D6, 'node', 'ActionUsage で isReference のもの', '角の丸い破線の四角。中身は action と同じ', 'state-transition-node', '中の action-flow-view は描かない'],
  ['action-flow-view', N6, 'view', 'アクションフロービュー', '(アクションフロービューの領域)', 'state-subaction-body、action・action-ref の箱の中', 'ここでたどるのを止める(指示書 4 章)。アクションフロービューを作るまで描かず、描いていないことを表示する', { sec: '8.2.3.17' }],

  // ---- 線
  ['transition', D6, 'edge', 'TransitionUsage', "実線。終点に開いた矢じり。1 つ目の選択肢は始点が state-source で、線の上に transition-label。2 つ目は始点が decision-node で、線の上に guard-expression", 'state-transition-element', '始点が状態・分岐でない遷移は裁定 Q7'],
  ['state-source', D6, 'endset', '遷移の始点(source)', '選択肢 state-node・state-ref-node', 'transition'],
  ['transition-label', D6, 'label', "遷移の引き金(TransitionFeatureMembership kind = trigger の AcceptActionUsage)・ガード(kind = guard)・効果(kind = effect)", "trigger-expression '/' ActionUsage の文字", 'transition', '欠けた部分の扱いは裁定 Q8'],
  ['trigger-expression', D6, 'label', '引き金の AcceptParameterPart と、ガード', 'AcceptParameterPart (guard-expression)? の文字', 'transition-label', '裁定 Q8'],
  ['guard-expression', D6, 'label', 'ガードの式(OwnedExpression)', "'[' OwnedExpression ']' の文字", 'trigger-expression・transition(8.2.3.17 節で定義)', '', { sec: '8.2.3.17' }],
  ['else-branch', D6, 'edge', 'decision-node から出る else の遷移(DefaultTargetSuccession の TransitionUsage)', "破線。終点に開いた矢じり。上に 'else'", 'transition の 2 つ目の形(decision-node から出る線)', "裁定 Q19: 8.2.3.17 節の else-branch の記号を、アクションフロービューと共通の部品として使う", { sec: '8.2.3.17' }],
  ['st-succession', D6, 'edge', 'Succession・SuccessionAsUsage(TransitionUsage を除く)', '1 つ目の選択肢は実線、2 つ目は破線。どちらも終点に開いた矢じり。文字なし', 'state-transition-element', '2 つの選択肢の使い分けは裁定 Q9'],
  ['exhibit-edge', N6, 'edge', '部品(の定義)と、それが exhibit する状態の関係', "実線。終点に開いた矢じり。上に '«exhibit»'", 'general-relationship(一般ビュー)、usage-edge', '始点の exhibitor(part・part-def)は状態遷移ビューの要素でない。裁定 Q10'],
  ['exhibitor', N6, 'endset', 'exhibit-edge の始点', '選択肢 part・part-def', 'exhibit-edge', '裁定 Q10'],
];

// GR4 の一覧から写す記号: [名前, 区分, GR6 の注記]
const STATE_REUSE = [
  // 図の枠
  ['framed-view', D6, '枠の中は frameless-view の選択肢 state-transition-view'],
  ['view-frame-name-compartment', D6, ''],
  ['frameless-view', D6, '選択肢 state-transition-view を GR6 で描く'],
  ['view-frame-info-contents', D6, ''],
  ['view-frame-info-compartment-tr', D6, ''],
  ['view-frame-info-compartment-bl', D6, ''],
  ['view-frame-info-compartment-br', D6, ''],
  ['ellipsis-at-lower-left-corner', D6, 'state-transition-view の生成規則にはない。裁定 Q11'],
  // 名前の文字
  ['definition-name-with-alias', D6, ''],
  ['usage-name-with-alias', D6, ''],
  ['compartment-stack', D6, ''],
  // 辺の引数(entry-action・do-action・exit-action・action・action-ref の四辺)
  ['param-l', D6, 'proxy-v の選択肢は使わない(アクションフロービューの中だけで有効、8.2.3.17 節の注)'],
  ['param-r', D6, '同上'],
  ['param-t', D6, 'proxy-h の選択肢は使わない(同上)'],
  ['param-b', D6, '同上'],
  ['param-label', D6, ''],
  ['pdh', D6, ''],
  ['pdv', D6, ''],
  ['proxy-v', N6, 'param-* の選択肢だが、アクションフロービューの中だけで有効(8.2.3.17 節の注)'],
  ['proxy-h', N6, '同上'],
  ['proxy-label', N6, 'proxy-v・proxy-h を描かないので使わない'],
  // 注釈・依存
  ['dependencies-and-annotations-element', D6, ''],
  ['dependencies-element', D6, ''],
  ['binary-dependency', D6, ''],
  ['n-ary-dependency', D6, ''],
  ['n-ary-association-dot', D6, ''],
  ['n-ary-dependency-client-link', D6, ''],
  ['n-ary-dependency-supplier-link', D6, ''],
  ['rel-name', D6, ''],
  ['element-node', D6, '状態遷移ビューでは、図に描いた状態・節点などの箱を端にする'],
  ['annotation-node', D6, ''],
  ['comment-node', D6, ''],
  ['comment-without-keyword', D6, ''],
  ['comment-with-keyword', D6, ''],
  ['documentation-node', D6, ''],
  ['textual-representation-node', D6, ''],
  ['language-string', D6, ''],
  ['text-block', D6, ''],
  ['metadata-feature-annotation-node', D6, ''],
  ['metadata-feature-decl', D6, ''],
  ['metadata-feature-name-value-list', D6, ''],
  ['annotation-link', D6, ''],
  ['element-inside-textual-compartment', D6, ''],
  // 区画(compartment-stack の中)。文字の区画は GR4 と同じ。ほかのビューの図を持つ区画は描かない
  ...SYMBOLS.filter((r) => r[2] === 'compartment' && r[0] !== 'compartment-stack' && r[0] !== 'interconnection-compartment').map((r) => {
    const name = r[0];
    if (name === 'state-transition-compartment') return [name, N6, '状態の箱は state-transition-view を区画にせず直接持つので使わない(裁定 Q2)'];
    if (r[1] === N) return [name, N6, 'ほかのビュー(GR4 と同じ)'];
    if (name === 'exhibit-states-compartment') return [name, D6, '中身の生成規則の名前が本文で食い違う(裁定 Q14)'];
    return [name, D6, ''];
  }),
  ['interconnection-compartment', N6, '相互接続ビューの図は、状態遷移ビューの中に描かない'],
  ['el-prefix', D6, ''],
  ['usage-cp', D6, ''],
];

const stateOut = [];
const stateProblems = [];
const stateSeen = new Set();
const classText = (c) => (c === D6 ? 'GR6 で描く' : 'GR6 では描かない');
for (const row of STATE_SYMBOLS) {
  const [name, cls, kind, abstract, shape, from, note = '', opt0] = row;
  const opt = typeof note === 'object' ? note : (opt0 ?? {});
  const noteText = typeof note === 'string' ? note : '';
  if (stateSeen.has(name)) stateProblems.push(`${name}: 一覧に 2 回ある`);
  stateSeen.add(name);
  if (out.some((o) => o.name === name)) stateProblems.push(`${name}: GR4 の一覧にもある(STATE_REUSE に入れる)`);
  const hits = locate(name, opt);
  if (hits.length === 0) { stateProblems.push(`${name}: 本文に定義の行が見つからない`); continue; }
  const line = hits[opt.nth ?? 0] ?? hits[0];
  const sec = sectionOf(line);
  const printed = printedPageOf(line);
  const pdfPage = printed + PAGE_OFFSET;
  let figLine = line;
  if (!opt.ref) for (let i = line; i < lines.length; i++) { const t = lines[i].trim(); if (t && !footer(lines[i])) { figLine = i + 1; break; } }
  const figurePage = printedPageOf(figLine) + PAGE_OFFSET;
  let pdfOk = null;
  if (checkPdf) {
    pdfOk = pdfText(pdfPage).includes(name);
    if (!pdfOk) stateProblems.push(`${name}: PDF の ${pdfPage} ページに名前が見つからない`);
  }
  stateOut.push({
    name, class: classText(cls), kind, gr4: false,
    section: sec.section, sectionTitle: sec.title, line, printedPage: printed, pdfPage, figurePage,
    defined: !opt.ref, definitions: opt.ref ? [] : hits,
    abstract, shape, from, note: noteText, pdfChecked: pdfOk,
  });
}
for (const [name, cls, note] of STATE_REUSE) {
  if (stateSeen.has(name)) stateProblems.push(`${name}: 一覧に 2 回ある`);
  stateSeen.add(name);
  const g = out.find((o) => o.name === name);
  if (!g) { stateProblems.push(`${name}: GR4 の一覧にない`); continue; }
  stateOut.push({ ...g, class: classText(cls), gr4: true, gr4Class: g.class, note: ['GR4 の一覧にある記号', note].filter(Boolean).join('。') });
}

// state-transition-element・state-transition-node の選択肢を本文から集めて照らし合わせる
function alternativesOf(name, section = '8.2.3.18') {
  const [lo, hi] = sectionRange(section);
  const i = lines.findIndex((t, k) => k >= lo - 1 && k < hi && new RegExp(`^\\s*${esc(name)}\\s*=`).test(t));
  let text = lines[i].replace(/^.*?=/, '');
  // 選択肢は空行まで続く。ページの足と、ページの足の前後の空行は飛ばす
  for (let j = i + 1; j < hi; j++) {
    const t = lines[j];
    if (footer(t)) continue;
    if (t.trim() === '') { const k = lines.slice(j, hi).findIndex((s) => s.trim() !== ''); if (k >= 0 && (footer(lines[j + k]) || /^\s*\|/.test(lines[j + k]))) continue; break; }
    text += ' ' + t;
  }
  return { line: i + 1, alternatives: text.split('|').map((s) => s.trim()).filter(Boolean) };
}
const stElement = alternativesOf('state-transition-element');
const stNode = alternativesOf('state-transition-node');
const stateListed = new Set(stateOut.map((o) => o.name));
const stMissing = [...stElement.alternatives, ...stNode.alternatives].filter((x) => !stateListed.has(x));
if (stMissing.length) stateProblems.push(`state-transition-element・state-transition-node の選択肢で一覧にないもの: ${stMissing.join(', ')}`);
if (stNode.alternatives.length !== 15) stateProblems.push(`state-transition-node の選択肢が 15 でない(${stNode.alternatives.length})`);

// ---- アクションフロービュー(GR7 指示書 4.2 節)
// 起点は action-flow-view(8.2.3.17 節)。
// 区分
//   draw7    GR7 で描く
//   nodraw7  GR7 では描かない(理由は注記)
// ACTION_SYMBOLS は GR7 で新しく一覧に入れるもの(並びは SYMBOLS と同じ。追加の指定 pdfName は、PDF で名前が行をまたぐときの手がかり)。
// ACTION_REUSE は GR4・GR6 の一覧にあり、アクションフロービューからも参照される記号。抽象構文・図形の要点は前の一覧の行を写し
// (状態遷移ビューの一覧にあればそれを、なければ相互接続ビューの一覧を)、区分と GR7 の注記だけをここに書く。
// 注記の「裁定 Qn」は reports/GR7/P1_symbols_*.md の問の番号に対する P1 の裁定。
const D7 = 'draw7', N7 = 'nodraw7';
const ACTION_SYMBOLS = [
  // ---- 選択肢と列
  ['action-flow-element', D7, 'choice', 'アクションフロービューの要素', '選択肢 action-ref・action・action-flow-node・action-flow-relationship', 'action-flow-view', 'perform-action-usage は選択肢にないが、要素として描く(裁定 Q4)'],
  ['action-flow-node', D7, 'choice', 'アクションフロービューの節点', '13 の選択肢: start-node・done-node・terminate-node・fork-node・join-node・decision-node・merge-node・send-action-node・accept-action-node・while-loop-action-node・for-loop-action-node・if-else-action-node・assign-action-node', 'action-flow-element、aflow-succession・else-branch の端、swimlane'],
  ['action-flow-relationship', D7, 'choice', 'アクションフロービューの線', '選択肢 flow・aflow-succession・binding-connection・else-branch', 'action-flow-element', 'succession-flow・message は選択肢にないが、相互接続ビューと同じ記号で描く(裁定 Q8)'],
  ['perform-action-swimlanes', D7, 'endset', '本文に定義がない。perform-actions-swimlanes と読む', '—', 'action-flow-view', '裁定 Q1', { sec: '8.2.3.17', ref: '(perform-action-swimlanes)?' }],
  ['perform-actions-swimlanes', D7, 'view', '部品ごとの列の並び', 'swimlane の並び。列は縦の辺で互いに接し、上と下の辺をそろえる(本文の注)', 'action-flow-view(perform-action-swimlanes の名前で参照される)', '裁定 Q1・Q3'],
  ['swimlane', D7, 'node', '行動を perform する使用(部品)ごとの列', '破線の縦長の四角。上に usage-name-compartment、その下に列に入る節点(&action-flow-node*)', 'perform-actions-swimlanes', '列を描く条件・列に入れる節点は裁定 Q3'],
  ['usage-name-compartment', D7, 'label', '本文に定義がない。列の持ち主の部品の使用の名前の区画', "1 行目に '«performer»'、2 行目に部品の修飾名。その下に破線の区切りと斜体の見出し 'perform actions'(本文 7 章の Perform Actions Swimlanes の図)", 'swimlane', '裁定 Q2', { sec: '8.2.3.17', ref: 'usage-name-', pdfName: 'usage-name-' }],

  // ---- 行動の定義の箱
  ['action-def', D7, 'node', 'ActionDefinition(描く範囲が行動の定義のとき、その外側の箱)', '角の尖った実線の四角(下の辺だけ太い)。四辺に param-*。中に action-def-name-compartment、action-flow-view、compartment-stack', 'definition-node(8.2.3.17)。action-flow-element の選択肢にはない', '外側の箱の決め方は裁定 Q5'],
  ['action-def-name-compartment', D7, 'label', 'ActionDefinition の接頭辞・名前', "'«' DefinitionPrefix 'action' 'def' '»' の行と definition-name-with-alias の行", 'action-def', "本文は definition-name-with-alias の後ろに '<' がある(裁定 Q12)"],

  // ---- 節点(行動の種類ごとの箱)
  ['send-action-node', D7, 'node', 'SendActionUsage', '角の丸い実線の四角。左上に黒く塗った五角形の旗の印。四辺に param-*。中に send-action-name-compartment と send-action-expression', 'action-flow-node', '印は裁定 Q6'],
  ['accept-action-node', D7, 'node', 'AcceptActionUsage(遷移の引き金を除く)', '角の丸い実線の四角。左上に黒く塗った、左に切り込みのある四角の印。四辺に param-*。中に accept-action-name-compartment と accept-action-expression', 'action-flow-node', '印は裁定 Q6'],
  ['while-loop-action-node', D7, 'node', 'WhileLoopActionUsage', '角の丸い実線の四角。四辺に param-*。上から while-loop-action-name-compartment、while-condition?、loop-body、until-condition?、compartment-stack', 'action-flow-node'],
  ['for-loop-action-node', D7, 'node', 'ForLoopActionUsage', '角の丸い実線の四角。四辺に param-*。上から for-loop-action-name-compartment、iteration、loop-body、compartment-stack', 'action-flow-node'],
  ['if-else-action-node', D7, 'node', 'IfActionUsage', '角の丸い実線の四角。四辺に param-*。上から ifelse-action-name-compartment、if-condition、then-body、else-body?、compartment-stack', 'action-flow-node'],
  ['assign-action-node', D7, 'node', 'AssignmentActionUsage', '角の丸い実線の四角。四辺に param-*。中に assign-action-name-compartment と assign-action-expression', 'action-flow-node'],
  ['action-body', D7, 'label', 'then・else・ループの本体(ActionBodyParameterMember の行動)', '選択肢 action-body-textual・action-flow-view', 'then-body・else-body・loop-body', '図にするか文字のままにするかの境目は裁定 Q9'],
  ['action-body-textual', D7, 'label', '本体の原文', 'ActionBodyParameterMember の文字', 'action-body', '裁定 Q9'],

  // ---- 引数と線
  ['parameter', D7, 'endset', '行動の引数', '選択肢 param-l・param-r・param-t・param-b', 'flow-end-node(8.2.3.16)', 'GR4 では本文の param-* を直接一覧にした(GR4 の裁定 Q11)'],
  ['aflow-succession', D7, 'edge', 'Succession・SuccessionAsUsage(遷移を除く)と、行動の中の遷移(TransitionUsage。ガードがあれば guard-expression)', '破線。終点に開いた矢じり。中ほどの上に任意で guard-expression', 'action-flow-relationship', '状態遷移ビューの st-succession(いつも実線)との関係は裁定 Q7。else の遷移は else-branch'],
  ['perform-edge', N7, 'edge', '使用(部品など)と、それが perform する行動の関係', "実線。終点に開いた矢じり。上に '«perform»'", 'usage-edge(一般ビュー)', 'action-flow-view からは展開されない。usage-edge の行の書き誤りは裁定 Q13'],
  ['performer-node', N7, 'endset', 'perform-edge の始点', '選択肢 part・action・part-def・action-def・distinguished-parameter', 'perform-edge', 'perform-edge を描かないので使わない'],
];

// GR4・GR6 の一覧から写す記号: [名前, 区分, GR7 の注記]
const ACTION_REUSE = [
  // ビュー
  ['action-flow-view', D7, 'GR6 では描かなかった。本文の生成規則に ellipsis-at-lower-left-corner がない(裁定 Q11)。状態遷移ビューの本体を図にする形は裁定 Q9・Q10'],
  // 図の枠
  ['framed-view', D7, '枠の中は frameless-view の選択肢 action-flow-view'],
  ['view-frame-name-compartment', D7, ''],
  ['frameless-view', D7, '選択肢 action-flow-view を GR7 で描く'],
  ['view-frame-info-contents', D7, ''],
  ['view-frame-info-compartment-tr', D7, ''],
  ['view-frame-info-compartment-bl', D7, ''],
  ['view-frame-info-compartment-br', D7, ''],
  ['ellipsis-at-lower-left-corner', D7, 'action-flow-view の生成規則にはない(裁定 Q11)'],
  // 名前の文字
  ['definition-name-with-alias', D7, ''],
  ['usage-name-with-alias', D7, ''],
  ['compartment-stack', D7, ''],
  // 行動の使用の箱
  ['action', D7, '中の action-flow-view を GR7 で描く(GR6 では描かなかった)'],
  ['action-name-compartment', D7, "'<' は描かない(設計書 7.1 節)"],
  ['action-ref', D7, '中の action-flow-view を GR7 で描く'],
  ['perform-action-usage', D7, 'action-flow-element の選択肢にないが、アクションフロービューの要素として描く(裁定 Q4)'],
  ['perform-action-name-compartment', D7, '描く範囲が perform の行動のときの外側の箱は裁定 Q5'],
  // 節点
  ['start-node', D7, '内蔵の start を参照するときだけ使う(設計書 7.4 節)'],
  ['done-node', D7, '内蔵の done を参照するときだけ使う(設計書 7.4 節)'],
  ['terminate-node', D7, ''],
  ['fork-node', D7, ''],
  ['join-node', D7, ''],
  ['decision-node', D7, ''],
  ['merge-node', D7, ''],
  ['send-action-name-compartment', D7, ''],
  ['accept-action-name-compartment', D7, ''],
  ['assign-action-name-compartment', D7, ''],
  ['ifelse-action-name-compartment', D7, ''],
  ['while-loop-action-name-compartment', D7, '図の中では while- loop-action-name-compartment と行をまたいで書かれている'],
  ['for-loop-action-name-compartment', D7, ''],
  ['send-action-expression', D7, "本文は NodeParameterMember 'to' NodeParameterMember。GR6 と同じく send の後ろの原文を書く"],
  ['accept-action-expression', D7, ''],
  ['assign-action-expression', D7, '本文に定義がない(設計書 7.1 節の読み)'],
  ['if-condition', D7, ''],
  ['while-condition', D7, ''],
  ['until-condition', D7, ''],
  ['iteration', D7, ''],
  ['condition-expression', D7, ''],
  ['iteration-expression', D7, ''],
  ['then-body', D7, 'GR6 では描かなかった。本体は action-body(裁定 Q9)'],
  ['else-body', D7, '同上'],
  ['loop-body', D7, '同上'],
  // 線
  ['flow', D7, '端は flow-end-node(parameter・proxy)。図に描いた引数(なければ箱)の間に引く(設計書 7.2 節と同じ)'],
  ['flow-label', D7, '線には 13925 行の形を使う(設計書 7.1 節)'],
  ['flow-end-node', D7, ''],
  ['binding-connection', D7, ''],
  ['else-branch', D7, ''],
  ['guard-expression', D7, 'aflow-succession の上に書く'],
  ['succession-flow', D7, 'action-flow-relationship の選択肢にないが、相互接続ビューと同じ記号で描く(裁定 Q8。本文から外れる点)'],
  ['succession-flow-label', D7, '裁定 Q8'],
  ['message', D7, 'action-flow-relationship の選択肢にないが、相互接続ビューと同じ記号で描く(裁定 Q8。本文から外れる点)'],
  // 辺の引数
  ['param-l', D7, 'proxy-v の選択肢も使う(本文の注: アクションフロービューの中の行動だけで有効)'],
  ['param-r', D7, '同上'],
  ['param-t', D7, 'proxy-h の選択肢も使う(同上)'],
  ['param-b', D7, '同上'],
  ['param-label', D7, ''],
  ['pdh', D7, ''],
  ['pdv', D7, ''],
  ['proxy-v', D7, '本文の注により、アクションフロービューの中の行動の辺だけで使う(設計書 7.5 節)'],
  ['proxy-h', D7, '同上'],
  ['proxy-label', D7, ''],
  // 列の名前
  ['part-name-compartment', D7, 'usage-name-compartment の読みの候補(裁定 Q2)'],
  // 注釈・依存
  ['dependencies-and-annotations-element', D7, ''],
  ['dependencies-element', D7, ''],
  ['binary-dependency', D7, ''],
  ['n-ary-dependency', D7, ''],
  ['n-ary-association-dot', D7, ''],
  ['n-ary-dependency-client-link', D7, ''],
  ['n-ary-dependency-supplier-link', D7, ''],
  ['rel-name', D7, ''],
  ['element-node', D7, 'アクションフロービューでは、図に描いた行動・節点などの箱を端にする'],
  ['annotation-node', D7, ''],
  ['comment-node', D7, ''],
  ['comment-without-keyword', D7, ''],
  ['comment-with-keyword', D7, ''],
  ['documentation-node', D7, ''],
  ['textual-representation-node', D7, ''],
  ['language-string', D7, ''],
  ['text-block', D7, ''],
  ['metadata-feature-annotation-node', D7, ''],
  ['metadata-feature-decl', D7, ''],
  ['metadata-feature-name-value-list', D7, ''],
  ['annotation-link', D7, ''],
  ['element-inside-textual-compartment', D7, ''],
  // 区画(compartment-stack の中)。文字の区画は GR6 と同じ。ほかのビューの図を持つ区画は描かない
  ...stateOut.filter((o) => o.kind === 'compartment' && o.gr4 && o.name !== 'compartment-stack').map((o) => {
    const name = o.name;
    if (name === 'action-flow-compartment') return [name, N7, '行動の箱は action-flow-view を区画にせず直接持つので使わない(GR6 の裁定 Q2 と同じ形。裁定 Q5)'];
    if (o.class !== 'GR6 で描く') return [name, N7, 'ほかのビュー(GR6 と同じ)'];
    return [name, D7, ''];
  }),
  ['el-prefix', D7, ''],
  ['usage-cp', D7, ''],
  // 状態遷移ビューの、行動の本体(GR7 指示書 6 章)
  ['state-subaction-body', D7, '状態遷移ビューの記号。選択肢 action-flow-view の形を GR7 で描く(設計書 7.4 節。境目は裁定 Q9)'],
];

const actionOut = [];
const actionProblems = [];
const actionSeen = new Set();
const classText7 = (c) => (c === D7 ? 'GR7 で描く' : 'GR7 では描かない');
for (const row of ACTION_SYMBOLS) {
  const [name, cls, kind, abstract, shape, from, note = '', opt0] = row;
  const opt = typeof note === 'object' ? note : (opt0 ?? {});
  const noteText = typeof note === 'string' ? note : '';
  if (actionSeen.has(name)) actionProblems.push(`${name}: 一覧に 2 回ある`);
  actionSeen.add(name);
  if (out.some((o) => o.name === name) || stateOut.some((o) => o.name === name)) actionProblems.push(`${name}: GR4・GR6 の一覧にもある(ACTION_REUSE に入れる)`);
  const hits = locate(name, { sec: '8.2.3.17', ...opt });
  if (hits.length === 0) { actionProblems.push(`${name}: 本文に定義の行が見つからない`); continue; }
  const line = hits[opt.nth ?? 0] ?? hits[0];
  const sec = sectionOf(line);
  const printed = printedPageOf(line);
  const pdfPage = printed + PAGE_OFFSET;
  let figLine = line;
  if (!opt.ref) for (let i = line; i < lines.length; i++) { const t = lines[i].trim(); if (t && !footer(lines[i])) { figLine = i + 1; break; } }
  const figurePage = printedPageOf(figLine) + PAGE_OFFSET;
  let pdfOk = null;
  if (checkPdf) {
    pdfOk = pdfText(pdfPage).includes(opt.pdfName ?? name);
    if (!pdfOk) actionProblems.push(`${name}: PDF の ${pdfPage} ページに名前が見つからない`);
  }
  actionOut.push({
    name, class: classText7(cls), kind, prior: null,
    section: sec.section, sectionTitle: sec.title, line, printedPage: printed, pdfPage, figurePage,
    defined: !opt.ref, definitions: opt.ref ? [] : hits,
    abstract, shape, from, note: noteText, pdfChecked: pdfOk,
  });
}
for (const [name, cls, note] of ACTION_REUSE) {
  if (actionSeen.has(name)) actionProblems.push(`${name}: 一覧に 2 回ある`);
  actionSeen.add(name);
  const s = stateOut.find((o) => o.name === name);
  const g = out.find((o) => o.name === name);
  const base = s ?? g;
  if (!base) { actionProblems.push(`${name}: GR4・GR6 の一覧にない`); continue; }
  const prior = s ? (s.gr4 ? `GR4(${g.class})・GR6(${s.class})` : `GR6(${s.class})`) : `GR4(${g.class})`;
  const { gr4: _g, gr4Class: _c, ...rest } = base;
  actionOut.push({ ...rest, class: classText7(cls), prior, note: [`${s ? 'GR6' : 'GR4'} の一覧にある記号`, note].filter(Boolean).join('。') });
}
const afElement = alternativesOf('action-flow-element', '8.2.3.17');
const afNode = alternativesOf('action-flow-node', '8.2.3.17');
const afRel = alternativesOf('action-flow-relationship', '8.2.3.17');
const actionListed = new Set(actionOut.map((o) => o.name));
const afMissing = [...afElement.alternatives, ...afNode.alternatives, ...afRel.alternatives].filter((x) => !actionListed.has(x));
if (afMissing.length) actionProblems.push(`action-flow-element・action-flow-node・action-flow-relationship の選択肢で一覧にないもの: ${afMissing.join(', ')}`);
if (afNode.alternatives.length !== 13) actionProblems.push(`action-flow-node の選択肢が 13 でない(${afNode.alternatives.length})`);

// ---- シーケンスビュー(GR9 指示書 4.1 節)
// 起点は sequence-view(8.2.3.9 節)。あわせて、sequence-view を中に持つ箱(occurrence-def・occurrence・occurrence-ref)と、
// 8.2.3.9 節のほかの生成規則(一般ビューの箱・線・区画)を一覧にする。
// 区分
//   draw9    GR9 で描く
//   nodraw9  GR9 では描かない(理由は注記)
// SEQ_SYMBOLS は GR9 で新しく一覧に入れるもの(並びは SYMBOLS と同じ)。SEQ_REUSE は GR4・GR6・GR7 の一覧にあり、シーケンスビューからも
// 参照される記号(抽象構文・図形の要点は前の一覧の行を写し、区分と GR9 の注記だけをここに書く)。
// 注記の「問 Qn」は reports/GR9/P1_symbols_*.md の問の番号
const D9 = 'draw9', N9 = 'nodraw9';
const SEQ_SYMBOLS = [
  // ---- ビューと選択肢
  ['sequence-view', D9, 'view', '描く範囲(オカレンス・部品の定義と使用、view)が所有する(view なら公開した)メンバーのうち、シーケンスビューで描く要素', '箱の中の領域。sq-graphical-element の並び', 'occurrence-def・occurrence・occurrence-ref の箱の中、sequence-compartment の中、frameless-view', 'ellipsis-at-lower-left-corner は生成規則にない(問 Q8 の h)'],
  ['sq-graphical-element', D9, 'choice', 'シーケンスビューの要素', '選択肢 sq-graphical-node・sq-graphical-relationship・dependencies-and-annotations-element', 'sequence-view'],
  ['sq-graphical-node', D9, 'choice', '頭と生存線', '選択肢 sq-head-node・lifeline', 'sq-graphical-element'],
  ['sq-head-node', D9, 'choice', '頭(部品とポート)', '選択肢 sq-part・sq-port', 'sq-graphical-node、lifeline の上の端'],
  ['sq-part', D9, 'node', '頭にする部品の使用(問 Q1)', '角の丸い実線の四角。中に part-name-compartment。下の辺の上に sq-port*(下の辺を区切って並べる)', 'sq-head-node', '参照(ref part)でも破線の形はない(本文の図は 1 つ)'],
  ['sq-port', D9, 'port', '頭にするポートの使用(問 Q4)', '角の丸い小さな四角。右に sq-port-label', 'sq-head-node、sq-part の下の辺', '向きの矢印はない'],
  ['sq-port-label', D9, 'label', 'ポートの使用の宣言(UsageDeclaration)', '文字', 'sq-port'],
  ['sq-l-node', D9, 'endset', 'sq-succession の端', '選択肢 lifeline・sq-proxy', 'sq-succession、msg-end-node(8.2.3.16)'],
  ['lifeline', D9, 'node', '頭の生存線(頭ごとに 1 本)', '頭(&sq-head-node)の下から下へ伸びる破線の縦線。線の上に sq-proxy*', 'sq-graphical-node、sq-l-node'],
  ['sq-proxy', D9, 'port', '生存線の上の事象(問 Q2)', '生存線の上の黒丸。右に proxy-label を書く形と、左に書く形の 2 つ', 'lifeline、sq-l-node'],
  ['sq-graphical-relationship', D9, 'choice', 'シーケンスビューの線', '選択肢 message・sq-succession', 'sq-graphical-element'],
  ['succession-label', D9, 'label', 'Succession の宣言', '文字。本文に定義が 2 つある(UsageDeclaration? と Identification)', 'sq-succession', '問 Q8 の c'],
  ['sq-succession', D9, 'edge', '事象の間の Succession(問 Q3)', "破線。終点に開いた矢じり。中ほどの上に任意の '«succession»' と succession-label", 'sq-graphical-relationship', '本文の注: 継承に着く proxy は事象を指す'],

  // ---- sequence-view を中に持つ箱
  ['occurrence-def', D9, 'node', 'OccurrenceDefinition(描く範囲がオカレンスの定義のとき、その外側の箱)', '角の尖った実線の四角。中に occurrence-def-name-compartment、sequence-view、compartment-stack', 'definition-node(8.2.3.9)', '問 Q5'],
  ['occurrence-def-name-compartment', D9, 'label', 'OccurrenceDefinition の接頭辞・名前', "'«' DefinitionPrefix 'occurrence' 'def' '»' の行と definition-name-with-alias の行", 'occurrence-def'],
  ['occurrence', D9, 'node', 'OccurrenceUsage(参照でないもの。描く範囲がオカレンスの使用のとき、その外側の箱)', '角の丸い実線の四角。中に occurrence-name-compartment、sequence-view、compartment-stack', 'usage-node(8.2.3.9)', '問 Q5'],
  ['occurrence-ref', D9, 'node', 'OccurrenceUsage(参照のもの)', '角の丸い破線の四角。中身は occurrence と同じ', 'usage-node(occurrence-refxfx の名前で参照される)', '問 Q5・Q8 の a'],
  ['occurrence-refxfx', D9, 'endset', '本文に定義がない。occurrence-ref と読む', '—', 'usage-node', '問 Q8 の a', { sec: '8.2.3.9', ref: 'occurrence-refxfx' }],
  ['occurrence-name-compartment', D9, 'label', 'OccurrenceUsage の接頭辞・名前', "'«' OccurrenceUsagePrefix 'occurrence' '»' の行と usage-name-with-alias の行", 'occurrence・occurrence-ref'],

  // ---- 8.2.3.9 節のほかの生成規則(一般ビュー)
  ['timeslice-or-snapshot-node', N9, 'choice', '時間の切片・瞬間の箱', '選択肢 timeslice・snapshot', 'usage-node', '一般ビュー(sequence-view からは展開されない)'],
  ['timeslice', N9, 'node', "OccurrenceUsage(portionKind が timeslice)", "角の丸い実線の四角。中に timeslice-name-compartment、compartment-stack。右上に 'rd' の文字(意味が本文にない。問 Q8 の g)", 'timeslice-or-snapshot-node', '一般ビュー'],
  ['timeslice-name-compartment', N9, 'label', '時間の切片の名前', "'«timeslice»' の行と usage-name-with-alias の行", 'timeslice', '一般ビュー'],
  ['snapshot', N9, 'node', "OccurrenceUsage(portionKind が snapshot)", '角の丸い実線の四角。中に snapshot-name-compartment、compartment-stack', 'timeslice-or-snapshot-node', '一般ビュー'],
  ['snapshot-name-compartment', N9, 'endset', "本文に定義がない(定義の行は snapshots-name-compartment で '=' もない)", '—', 'snapshot', '一般ビュー。問 Q8 の b', { sec: '8.2.3.9', ref: 'snapshot-name-compartment' }],
  ['snapshots-name-compartment', N9, 'label', "瞬間の名前('=' のない定義の行)", "'«snapshot»' の行と usage-name-with-alias の行", '(参照されない)', '一般ビュー。問 Q8 の b', { sec: '8.2.3.9', ref: 'snapshots-name-compartment' }],
  ['event-occurrence-def', N9, 'node', 'EventOccurrenceUsage の定義の箱(抽象構文に事象の定義のメタクラスはない)', '角の尖った実線の四角。中に event-occurrence-def-name-compartment、compartment-stack', 'definition-node', '一般ビュー'],
  ['event-occurrence-def-name-compartment', N9, 'label', "'«' DefinitionPrefix 'event' 'occurrence' 'def' '»'", '2 行の名前の区画', 'event-occurrence-def', '一般ビュー'],
  ['event-occurrence', N9, 'node', 'EventOccurrenceUsage の箱', '角の丸い実線の四角。中に event-occurrence-name-compartment、compartment-stack', 'usage-node', '一般ビュー。シーケンスビューでは事象を生存線の上の sq-proxy で描く(問 Q2)'],
  ['event-occurrence-name-compartment', N9, 'label', "'«' OccurrenceUsagePrefix 'event' 'occurrence' '»'", '2 行の名前の区画', 'event-occurrence', '一般ビュー'],
  ['event-edge', N9, 'edge', '使用・定義と、その中の事象(EventOccurrenceUsage)の関係', "実線。終点に開いた矢じり。上に '«event»'。端は &eventer と &event-occurence", 'なし(どの選択肢からも参照されない)', '一般ビュー。問 Q8 の d・e'],
  ['eventer', N9, 'endset', 'event-edge の始点', "選択肢 usage-node・definition-node(後ろに '<' がある)", 'event-edge', '問 Q8 の e'],
  ['event-occurence', N9, 'endset', '本文に定義がない(event-occurrence の書き誤りと読める)', '—', 'event-edge', '問 Q8 の d', { sec: '8.2.3.9', ref: '&event-occurence', pdfName: 'event-occurence' }],
  ['portion-relationship', N9, 'edge', '時間の切片・瞬間と、その持ち主のオカレンスの関係(portion membership)', '実線。始点の側に、黒い半円に切り込みのある印。端は &occurrence-node と &timeslice-or-snapshot-node', 'general-relationship', '一般ビュー'],
  ['occurrence-node', N9, 'endset', '本文に定義がない', '—', 'portion-relationship', '一般ビュー。問 Q8 の f', { sec: '8.2.3.9', ref: '&occurrence-node', pdfName: 'occurrence-node' }],
];

// GR4・GR6・GR7 の一覧から写す記号: [名前, 区分, GR9 の注記]
const SEQ_REUSE = [
  // 線
  ['message', D9, 'sq-graphical-relationship の選択肢。端は msg-end-node のうち sq-l-node(生存線・sq-proxy)。端の求め方は問 Q7'],
  ['message-label', D9, '相互接続ビューの message と同じ文字(設計書 7.6 節)'],
  ['msg-end-node', D9, 'シーケンスビューでは選択肢 sq-l-node だけを使う'],
  ['proxy-label', D9, "sq-proxy の文字。'.'? FeatureChainMember(問 Q2)"],
  // 頭の名前
  ['part-name-compartment', D9, 'sq-part の名前の区画'],
  ['usage-name-with-alias', D9, ''],
  ['definition-name-with-alias', D9, ''],
  // 部品の箱(描く範囲が部品の定義・使用のときの外側の箱。問 Q5)
  ['part-def', D9, '中の interconnection-view は描かない。sequence-view の置き方は問 Q5'],
  ['part', D9, '同上'],
  ['part-ref', D9, '同上'],
  ['part-def-name-compartment', D9, ''],
  ['compartment-stack', D9, ''],
  ['ellipsis-at-lower-left-corner', D9, 'sequence-view の生成規則にはない(問 Q8 の h)'],
  // 図の枠
  ['framed-view', D9, '枠の中は frameless-view の選択肢 sequence-view'],
  ['view-frame-name-compartment', D9, ''],
  ['frameless-view', D9, '選択肢 sequence-view を GR9 で描く'],
  ['view-frame-info-contents', D9, ''],
  ['view-frame-info-compartment-tr', D9, ''],
  ['view-frame-info-compartment-bl', D9, ''],
  ['view-frame-info-compartment-br', D9, ''],
  // 注釈・依存
  ['dependencies-and-annotations-element', D9, ''],
  ['dependencies-element', D9, ''],
  ['binary-dependency', D9, ''],
  ['n-ary-dependency', D9, ''],
  ['n-ary-association-dot', D9, ''],
  ['n-ary-dependency-client-link', D9, ''],
  ['n-ary-dependency-supplier-link', D9, ''],
  ['rel-name', D9, ''],
  ['element-node', D9, 'シーケンスビューでは、図に描いた頭・描く範囲の箱を端にする'],
  ['annotation-node', D9, ''],
  ['comment-node', D9, ''],
  ['comment-without-keyword', D9, ''],
  ['comment-with-keyword', D9, ''],
  ['documentation-node', D9, ''],
  ['textual-representation-node', D9, ''],
  ['language-string', D9, ''],
  ['text-block', D9, ''],
  ['metadata-feature-annotation-node', D9, ''],
  ['metadata-feature-decl', D9, ''],
  ['metadata-feature-name-value-list', D9, ''],
  ['annotation-link', D9, ''],
  ['element-inside-textual-compartment', D9, ''],
  // 区画(compartment-stack の中)。文字の区画は GR7 と同じ。ほかのビューの図を持つ区画は描かない
  ...actionOut.filter((o) => o.kind === 'compartment' && o.name !== 'compartment-stack' && /-compartment$/.test(o.name) && !['if-condition', 'while-condition', 'until-condition'].includes(o.name)).map((o) => {
    const name = o.name;
    if (name === 'sequence-compartment') return [name, D9, '描く範囲が部品の定義・使用のときの sequence-view の置き場所の候補(問 Q5)'];
    if (o.class !== 'GR7 で描く') return [name, N9, 'ほかのビュー(GR7 と同じ)'];
    return [name, D9, ''];
  }),
  ['el-prefix', D9, ''],
  ['usage-cp', D9, ''],
];

const seqOut = [];
const seqProblems = [];
const seqSeen = new Set();
const classText9 = (c) => (c === D9 ? 'GR9 で描く' : 'GR9 では描かない');
for (const row of SEQ_SYMBOLS) {
  const [name, cls, kind, abstract, shape, from, note = '', opt0] = row;
  const opt = typeof note === 'object' ? note : (opt0 ?? {});
  const noteText = typeof note === 'string' ? note : '';
  if (seqSeen.has(name)) seqProblems.push(`${name}: 一覧に 2 回ある`);
  seqSeen.add(name);
  if (out.some((o) => o.name === name) || stateOut.some((o) => o.name === name) || actionOut.some((o) => o.name === name)) seqProblems.push(`${name}: GR4・GR6・GR7 の一覧にもある(SEQ_REUSE に入れる)`);
  const hits = locate(name, { sec: '8.2.3.9', ...opt });
  if (hits.length === 0) { seqProblems.push(`${name}: 本文に定義の行が見つからない`); continue; }
  const line = hits[opt.nth ?? 0] ?? hits[0];
  const sec = sectionOf(line);
  const printed = printedPageOf(line);
  const pdfPage = printed + PAGE_OFFSET;
  let figLine = line;
  if (!opt.ref) for (let i = line; i < lines.length; i++) { const t = lines[i].trim(); if (t && !footer(lines[i])) { figLine = i + 1; break; } }
  const figurePage = printedPageOf(figLine) + PAGE_OFFSET;
  let pdfOk = null;
  if (checkPdf) {
    pdfOk = pdfText(pdfPage).includes(opt.pdfName ?? name);
    if (!pdfOk) seqProblems.push(`${name}: PDF の ${pdfPage} ページに名前が見つからない`);
  }
  seqOut.push({
    name, class: classText9(cls), kind, prior: null,
    section: sec.section, sectionTitle: sec.title, line, printedPage: printed, pdfPage, figurePage,
    defined: !opt.ref, definitions: opt.ref ? [] : hits,
    abstract, shape, from, note: noteText, pdfChecked: pdfOk,
  });
}
for (const [name, cls, note] of SEQ_REUSE) {
  if (seqSeen.has(name)) seqProblems.push(`${name}: 一覧に 2 回ある`);
  seqSeen.add(name);
  const a = actionOut.find((o) => o.name === name);
  const s = stateOut.find((o) => o.name === name);
  const g = out.find((o) => o.name === name);
  const base = a ?? s ?? g;
  if (!base) { seqProblems.push(`${name}: GR4・GR6・GR7 の一覧にない`); continue; }
  const prior = [g && `GR4(${g.class})`, s && `GR6(${s.class})`, a && `GR7(${a.class})`].filter(Boolean).join('・');
  const { gr4: _g, gr4Class: _c, prior: _p, ...rest } = base;
  seqOut.push({ ...rest, class: classText9(cls), prior, note: [`${a ? 'GR7' : s ? 'GR6' : 'GR4'} の一覧にある記号`, note].filter(Boolean).join('。') });
}
const sqElement = alternativesOf('sq-graphical-element', '8.2.3.9');
const sqNode = alternativesOf('sq-graphical-node', '8.2.3.9');
const sqHead = alternativesOf('sq-head-node', '8.2.3.9');
const sqRel = alternativesOf('sq-graphical-relationship', '8.2.3.9');
const sqLNode = alternativesOf('sq-l-node', '8.2.3.9');
const seqListed = new Set(seqOut.map((o) => o.name));
const sqMissing = [sqElement, sqNode, sqHead, sqRel, sqLNode].flatMap((a) => a.alternatives).filter((x) => !seqListed.has(x));
if (sqMissing.length) seqProblems.push(`sequence-view から展開される選択肢で一覧にないもの: ${sqMissing.join(', ')}`);

// ---- 一般ビュー(GR10 指示書 4.1 節)
// 起点は general-view(8.2.3.2 節)。8.2.3.2〜8.2.3.6 節の生成規則と、各分野の節で definition-node・usage-node・
// general-relationship(と general-node・namespace-node)に足される選択肢と、その名前の区画を一覧にする。
// 区分
//   draw10     GR10 で描く
//   generic10  GR10 では汎用の箱で描き、GR11 で専用の記号にする(分野ごとの専用の記号。設計書 7.7 節)
//   reuse10    これまでのビュー(GR4・GR6・GR7・GR9)で描いた記号を使う
//   nodraw10   描かない(理由は注記。分野ごとの線は GR11 で描く)
// GEN_SYMBOLS は GR10 で新しく一覧に入れるもの(並びは SYMBOLS と同じ)。GEN_REUSE は GR4・GR6・GR7・GR9 の一覧にあり、
// 一般ビューからも参照される記号(抽象構文・図形の要点は前の一覧の行を写し、区分と GR10 の注記だけをここに書く)。
// 注記の「問 Qn」は reports/GR10/P1_symbols_*.md の問の番号
const D10 = 'draw10', G10 = 'generic10', R10 = 'reuse10', N10 = 'nodraw10';
const GEN_SYMBOLS = [
  // ---- 8.2.3.2 要素と関係
  ['element', D10, 'choice', '要素', '選択肢 dependencies-and-annotations-element・general-element・element-inside-textual-compartment', '(根の生成規則)', '', { sec: '8.2.3.2' }],
  ['general-element', D10, 'choice', '一般ビューの要素', '選択肢 general-node・general-relationship', 'general-view', '', { sec: '8.2.3.2' }],
  // ---- 8.2.3.4 注釈
  ['annotated-element', R10, 'endset', '注釈される要素', '選択肢 element・element-inside-textual-compartment', '(参照されない。annotation-link の終点は &element)', '問 Q10 の g', { sec: '8.2.3.4' }],
  // ---- 8.2.3.5 名前空間とパッケージ
  ['general-node', D10, 'choice', '一般ビューの節点', "選択肢 namespace-node(8.2.3.5)・type-node(8.2.3.6)。8.2.3.6 節に 'general-node |= usage-node definition-node<' もある", 'general-element', '問 Q10 の b', { sec: '8.2.3.5' }],
  ['namespace-node', D10, 'choice', '名前空間の節点', '選択肢 package-node(8.2.3.5)・type-node(8.2.3.6)', 'general-node、import・top-level-import・recursive-import の両端、owned-membership・unowned-membership の始点', '', { sec: '8.2.3.5' }],
  ['package-node', D10, 'choice', 'Package(LibraryPackage を含む)', '選択肢 package-with-name-inside・package-with-name-in-tab・imported-package-with-name-inside・imported-package-with-name-in-tab', 'namespace-node', '使い分けは問 Q1・Q2'],
  ['package-with-name-inside', D10, 'node', 'Package(中を描かないもの)', '左上に小さなタブのある、角の尖った実線の四角。名前(Identification)は本体の中ほど', 'package-node', '問 Q1'],
  ['package-with-name-in-tab', D10, 'node', 'Package(描く範囲のパッケージ。中に general-view を描くもの)', '左上のタブの中に名前(Identification)。本体の中に general-view と (package-compartment)*', 'package-node', '問 Q1'],
  ['imported-package-with-name-inside', D10, 'node', 'import で取り込んだ Package(中を描かないもの)', 'package-with-name-inside と同じ形の破線', 'package-node', '問 Q2'],
  ['imported-package-with-name-in-tab', N10, 'node', 'import で取り込んだ Package(中を描くもの)', 'package-with-name-in-tab と同じ形の破線', 'package-node', '取り込んだパッケージの中は描かない(問 Q2)'],
  ['package-compartment', N10, 'choice', 'パッケージの区画', '選択肢 general-compartment・documentation-compartment・packages-compartment・members-compartment・relationships-compartment', 'package-with-name-in-tab・imported-package-with-name-in-tab', 'パッケージの中は general-view で描き、区画は使わない(設計書 7.2 節と同じ。問 Q1)'],
  ['packages-compartment-contents', N10, 'label', 'packages の区画の中身', "packages-compartment-element* '…'?", 'packages-compartment', '問 Q1'],
  ['packages-compartment-element', N10, 'label', 'パッケージの名前', 'el-prefix? Identification', 'packages-compartment-contents', '問 Q1'],
  ['members-compartment-contents', N10, 'label', 'members の区画の中身', "members-compartment-element* '…'?", 'members-compartment', '問 Q1'],
  ['members-compartment-element', N10, 'label', 'メンバーの宣言', 'el-prefix? (DefinitionElement | UsageElement)', 'members-compartment-contents', '問 Q1'],
  ['relationships-compartment-contents', N10, 'label', 'relationships の区画の中身', "(relationships-compartment-element)* '…'?", 'relationships-compartment', '問 Q1'],
  ['relationships-compartment-element', N10, 'label', '関係の文字', 'el-prefix? relationship-name QualifiedName', 'relationships-compartment-contents', '問 Q1'],
  ['relationship-name', N10, 'label', '関係の名前', "'defines'・'defined by'・'specializes' など 13 語(区切りが '|' でなく ',')", 'relationships-compartment-element', '問 Q1・Q10 の k'],
  ['general-relationship', D10, 'choice', '一般ビューの線', '選択肢 import・top-level-import・recursive-import・owned-membership・unowned-membership(8.2.3.5)、type-relationship(8.2.3.6)、各分野の節で足されるもの', 'general-element', '', { sec: '8.2.3.5' }],
  ['import', D10, 'edge', 'MembershipImport(isRecursive でないもの。import X::A;)', "破線。終点(取り込まれる要素)に開いた矢じり。中ほどの上に '«' VisibilityIndicator? 'import' '»'", 'general-relationship', '問 Q2・Q3'],
  ['top-level-import', D10, 'edge', 'NamespaceImport(isRecursive でないもの。import X::*;)', "import と同じ形。文字は '«' VisibilityIndicator? 'import' '»*'", 'general-relationship', '問 Q2・Q3'],
  ['recursive-import', D10, 'edge', 'isRecursive の Import(import X::**; と import X::A::**;)', "import と同じ形。文字は '«' VisibilityIndicator? 'import' '»**'", 'general-relationship', '問 Q2・Q3'],
  ['owned-membership', N10, 'edge', 'OwningMembership(名前空間が所有するメンバー)', '実線。始点(名前空間)の側に、丸に十字の印。矢じりなし', 'general-relationship', '所有は外枠の中に置くことで表す(問 Q1)'],
  ['unowned-membership', N10, 'edge', 'Membership(別名。alias X for Y)', '実線。始点(名前空間)の側に白丸。矢じりなし。7 章の表 3 の図では線の上に別名', 'general-relationship', '別名は相手の箱の名前の区画の «alias» で表す(問 Q1)'],
  // ---- 8.2.3.6 定義と使用
  ['type-node', D10, 'choice', '型の節点(定義と使用)', '選択肢 definition-node・usage-node', 'general-node、namespace-node、composite-feature-membership・noncomposite-feature-membership の始点'],
  ['type-relationship', D10, 'choice', '型の関係の線', '選択肢 subclassification・subsetting・definition・redefinition・composite-feature-membership・noncomposite-feature-membership', 'general-relationship', 'reference-subsetting は選択肢にない(問 Q10 の a)'],
  ['subclassification', D10, 'edge', 'Subclassification(定義の特殊化。:> と specializes)', '実線。終点(上位の定義)に白抜きの三角の矢じり', 'type-relationship', '問 Q3'],
  ['definition', D10, 'edge', 'FeatureTyping(使用の型付け。: と defined by)', '実線。終点(定義)に白抜きの三角の矢じりと、その手前に縦に並ぶ黒い点 2 つ', 'type-relationship', '問 Q3', { sec: '8.2.3.6' }],
  ['subsetting', D10, 'edge', 'Subsetting(ReferenceSubsetting・Redefinition を除く。:> と subsets)', '実線。終点(部分集合にされる使用)に白抜きの三角の矢じり', 'type-relationship', '問 Q3・Q5'],
  ['reference-subsetting', D10, 'edge', 'ReferenceSubsetting(::> と references)', '実線。終点に白抜きの三角の矢じりと、その手前に 2 行 2 列の黒い点 4 つ', 'type-relationship の選択肢にはない', '問 Q3・Q5・Q10 の a'],
  ['redefinition', D10, 'edge', 'Redefinition(:>> と redefines)', '実線。終点(再定義される使用)に白抜きの三角の矢じりと、その手前に縦の短い棒', 'type-relationship', '問 Q3・Q5'],
  ['composite-feature-membership', D10, 'edge', 'FeatureMembership(所有する使用が合成のもの)', '実線。始点(持ち主の型)の側に黒いひし形', 'type-relationship', '問 Q3・Q4'],
  ['noncomposite-feature-membership', D10, 'edge', 'FeatureMembership(所有する使用が参照のもの)', '実線。始点(持ち主の型)の側に白抜きのひし形', 'type-relationship', '問 Q3・Q4'],
  ['extended-def', D10, 'node', 'Definition(種類がちょうど Definition。#X def Y; の形)', '角の尖った実線の四角。名前の区画と compartment-stack', 'definition-node', '本文の注の条件(SemanticMetadata の特殊化)は確かめられない(問 Q9 の e)'],
  ['extended-def-name-compartment', D10, 'label', 'Definition の接頭辞・拡張のキーワード・名前', "'«' BasicDefinitionPrefix? DefinitionExtensionKeyword+ 'def' '»' の行と definition-name-with-alias の行", 'extended-def'],
  ['extended-usage', D10, 'node', 'Usage(種類がちょうど Usage。#X y; の形)', '角の丸い実線の四角。名前の区画と compartment-stack', 'usage-node', '問 Q9 の e'],
  ['extended-usage-name-compartment', D10, 'label', 'Usage の接頭辞・拡張のキーワード・名前', "'«' BasicUsagePrefix? UsageExtensionKeyword+ '»' の行と usage-name-with-alias の行", 'extended-usage'],
  // ---- 8.2.3.7 属性
  ['attribute-def', D10, 'node', 'AttributeDefinition(EnumerationDefinition を除く)', '角の尖った実線の四角。名前の区画と compartment-stack', 'definition-node'],
  ['attribute-def-name-compartment', D10, 'label', 'AttributeDefinition の接頭辞・名前', "'«' DefinitionPrefix 'attribute' 'def' '»' の行と definition-name-with-alias の行", 'attribute-def'],
  // ---- 8.2.3.8 列挙(GR11)
  ['enumeration-def', G10, 'node', 'EnumerationDefinition', '角の尖った実線の四角。名前の区画と compartment-stack', 'definition-node'],
  ['enumeration-def-name-compartment', G10, 'label', 'EnumerationDefinition の接頭辞・名前', "'«' DefinitionPrefix 'enum' 'def' '»' の行と definition-name-with-alias の行", 'enumeration-def'],
  ['enumeration', G10, 'node', 'EnumerationUsage', '角の丸い実線の四角。名前の区画と compartment-stack', 'usage-node'],
  ['enumeration-name-compartment', G10, 'label', 'EnumerationUsage の接頭辞・名前', "'«' UsagePrefix 'enum' '»' の行と usage-name-with-alias の行", 'enumeration'],
  // ---- 8.2.3.10 項目
  ['item-def', D10, 'node', 'ItemDefinition(PartDefinition などの下位の種類を除く)', '角の尖った実線の四角。名前の区画と compartment-stack', 'definition-node'],
  ['item-def-name-compartment', D10, 'label', 'ItemDefinition の接頭辞・名前', "'«' DefinitionPrefix 'item' 'def' '»' の行と definition-name-with-alias の行", 'item-def'],
  // ---- 8.2.3.14 インターフェース
  ['interface-def', D10, 'node', 'InterfaceDefinition', '角の尖った実線の四角。名前の区画と compartment-stack', 'definition-node'],
  ['interface-def-name-compartment', D10, 'label', 'InterfaceDefinition の接頭辞・名前', "'«' DefinitionPrefix 'interface' 'def' '»' の行と definition-name-with-alias の行(末尾の '<' は描かない。設計書 7.1 節)", 'interface-def'],
  // ---- 8.2.3.15 割り当て(GR11)
  ['allocation-def', G10, 'node', 'AllocationDefinition', '角の尖った実線の四角', 'definition-node'],
  ['allocation-def-name-compartment', G10, 'label', 'AllocationDefinition の接頭辞・名前', "'«' DefinitionPrefix 'allocation' 'def' '»' の行と definition-name-with-alias の行", 'allocation-def'],
  ['allocation', G10, 'node', 'AllocationUsage', '角の丸い実線の四角', 'usage-node'],
  ['allocation-name-compartment', G10, 'label', 'AllocationUsage の接頭辞・名前', "'«' OccurrenceUsagePrefix 'allocation' '»' の行と usage-name-with-alias の行", 'allocation'],
  ['allocate-relationship', N10, 'edge', 'AllocationUsage を線で描くもの', "実線。終点に開いた矢じり。上に '«allocate»'", 'general-relationship', 'GR11 で描く'],
  ['allocation-node', N10, 'endset', 'allocate-relationship の端', '選択肢 general-node・element-in-textual-compartment', 'allocate-relationship', 'GR11 で描く'],
  // ---- 8.2.3.19 計算(GR11)
  ['calc-def', G10, 'node', 'CalculationDefinition(CaseDefinition などを除く)', '角の尖った実線の四角。四辺に引数、中に action-flow-view', 'definition-node'],
  ['calc-def-name-compartment', G10, 'label', 'CalculationDefinition の接頭辞・名前', "'«' DefinitionPrefix 'calc' 'def' '»' の行と definition-name-with-alias の行", 'calc-def'],
  ['calc', G10, 'node', 'CalculationUsage', '角の丸い実線の四角。四辺に引数、中に action-flow-view', 'usage-node'],
  ['calc-name-compartment', G10, 'label', 'CalculationUsage の接頭辞・名前', '定義が 2 つある(問 Q10 の l)', 'calc'],
  // ---- 8.2.3.20 制約(GR11)
  ['constraint-def', G10, 'node', 'ConstraintDefinition', '角の尖った実線の四角', 'definition-node'],
  ['constraint-def-name-compartment', G10, 'label', 'ConstraintDefinition の接頭辞・名前', "'«' DefinitionPrefix 'constraint' 'def' '»' の行と definition-name-with-alias の行", 'constraint-def'],
  ['assert-constraint-node', G10, 'node', 'AssertConstraintUsage', '角の丸い実線の四角', 'usage-node(assert-constraint-usage の名前で参照される)', '問 Q10 の d'],
  ['assert-constraint-name-compartment', G10, 'label', 'AssertConstraintUsage の名前', "'«assert constraint»' の行と constraint-name-compartment", 'assert-constraint-node'],
  ['assert-constraint-usage', G10, 'endset', '本文に定義がない。assert-constraint-node と読む', '—', 'usage-node', '問 Q10 の d', { sec: '8.2.3.20', ref: 'assert-constraint-usage' }],
  ['assume-constraint-node', G10, 'node', 'RequirementConstraintMembership(assume)の ConstraintUsage', '角の丸い実線の四角', 'usage-node', '問 Q10 の c'],
  ['assume-constraint-name-compartment', G10, 'label', '前提の制約の名前', "'«' OccurrenceUsagePrefix 'assume' 'constraint' '»' の行と usage-name-with-alias の行", 'assume-constraint-node'],
  ['assume-edge', N10, 'edge', '要求と前提の制約', "実線。上に '«assume»'", 'general-relationship', 'GR11 で描く'],
  ['assumer', N10, 'endset', 'assume-edge の始点', '選択肢 requirement・requirement-def', 'assume-edge', 'GR11 で描く'],
  ['assert-edge', N10, 'edge', '要素と表明する制約', "実線。上に '«assert»'", 'general-relationship', 'GR11 で描く'],
  ['assertor', N10, 'endset', 'assert-edge の始点', '選択肢 usage-node・definition-node', 'assert-edge', 'GR11 で描く'],
  // ---- 8.2.3.21 要求(GR11)
  ['requirement-def', G10, 'node', 'RequirementDefinition(ConcernDefinition などを除く)', '角の尖った実線の四角', 'definition-node'],
  ['requirement-def-name-compartment', G10, 'label', 'RequirementDefinition の接頭辞・名前', "'«' DefinitionPrefix 'requirement' 'def' '»' の行と definition-name-with-alias の行", 'requirement-def'],
  ['concern-def', G10, 'node', 'ConcernDefinition', '角の尖った実線の四角', 'definition-node'],
  ['concern-def-name-compartment', G10, 'label', 'ConcernDefinition の接頭辞・名前', "'«' DefinitionPrefix 'concern' 'def' '»' の行と definition-name-with-alias の行", 'concern-def'],
  ['satisfy-requirement-usage', G10, 'node', 'SatisfyRequirementUsage', '角の丸い実線の四角', 'usage-node'],
  ['satisfy-requirement-name-compartment', G10, 'label', 'SatisfyRequirementUsage の名前', "'«satisfy requirement»' の行と requirement-name-compartment", 'satisfy-requirement-usage'],
  ['require-constraint-node', G10, 'node', 'RequirementConstraintMembership(require)の ConstraintUsage', '角の丸い実線の四角', 'usage-node'],
  ['require-constraint-name-compartment', G10, 'label', '要求する制約の名前', "'«' OccurrenceUsagePrefix 'require' 'constraint' '»' の行と usage-name-with-alias の行", 'require-constraint-node'],
  ['frame-concern-node', G10, 'node', 'FramedConcernMembership の ConcernUsage', '角の丸い実線の四角', 'usage-node'],
  ['frame-concern-name-compartment', G10, 'label', '枠にする関心事の名前', "'«' OccurrenceUsagePrefix 'frame' 'concern' '»' の行と usage-name-with-alias の行", 'frame-concern-node'],
  ['frame-relationship', N10, 'edge', '要求・視点と関心事', "実線。上に '«frame»'", 'general-relationship', 'GR11 で描く'],
  ['satisfy-edge', N10, 'edge', 'SatisfyRequirementUsage を線で描くもの', "実線。上に '«satisfy»'", 'general-relationship', 'GR11 で描く'],
  ['satisfier', N10, 'endset', 'satisfy-edge の始点', '選択肢 usage-node・definition-node', 'satisfy-edge', 'GR11 で描く'],
  ['require-edge', N10, 'edge', '要素と要求', "上に '«require»'", 'general-relationship', 'GR11 で描く'],
  ['requirer', N10, 'endset', 'require-edge の始点', '選択肢 usage-node・definition-node', 'require-edge', 'GR11 で描く'],
  ['frame-edge', N10, 'edge', '要求・視点と関心事', "上に '«frame»'", 'general-relationship', 'GR11 で描く'],
  ['framer', N10, 'endset', 'frame-edge・frame-relationship の始点', '選択肢 requirement・requirement-def・viewpoint・viewpoint-def', 'frame-edge', 'GR11 で描く'],
  // ---- 8.2.3.23〜8.2.3.25 解析・検証・ユースケース(GR11)
  ['analysis-def', G10, 'node', 'AnalysisCaseDefinition', '角の尖った実線の四角', 'definition-node'],
  ['analysis-def-name-compartment', G10, 'label', 'AnalysisCaseDefinition の接頭辞・名前', "'«' DefinitionPrefix 'analysis' 'def' '»' の行と definition-name-with-alias の行", 'analysis-def'],
  ['analysis', G10, 'node', 'AnalysisCaseUsage', '角の丸い実線の四角', 'usage-node'],
  ['analysis-name-compartment', G10, 'label', 'AnalysisCaseUsage の接頭辞・名前', "'«' OccurrenceUsagePrefix 'analysis' '»' の行と usage-name-with-alias の行", 'analysis'],
  ['verification-def', G10, 'node', 'VerificationCaseDefinition', '角の尖った実線の四角', 'definition-node'],
  ['verification-def-name-compartment', G10, 'label', 'VerificationCaseDefinition の接頭辞・名前', "'«' DefinitionPrefix 'verification' 'def' '»' の行と definition-name-with-alias の行", 'verification-def'],
  ['verification', G10, 'node', 'VerificationCaseUsage', '角の丸い実線の四角', 'usage-node'],
  ['verification-name-compartment', G10, 'label', 'VerificationCaseUsage の接頭辞・名前', "'«' OccurrenceUsagePrefix 'verification' '»' の行と usage-name-with-alias の行", 'verification'],
  ['verify-requirement-node', G10, 'node', 'RequirementVerificationMembership の RequirementUsage', '角の丸い実線の四角', 'usage-node'],
  ['verify-requirement-name-compartment', G10, 'label', '検証する要求の名前', "'«' OccurrenceUsagePrefix 'verify' 'requirement' '»' の行と usage-name-with-alias の行", 'verify-requirement-node'],
  ['verify-relationship', N10, 'edge', '検証と要求', "上に '«verify»'", 'general-relationship', 'GR11 で描く'],
  ['use-case-def', G10, 'node', 'UseCaseDefinition', '角の尖った実線の四角', 'definition-node'],
  ['use-case-def-name-compartment', G10, 'label', 'UseCaseDefinition の接頭辞・名前', "'«' DefinitionPrefix 'use' 'case' 'def' '»' の行と definition-name-with-alias の行", 'use-case-def'],
  ['use-case', G10, 'node', 'UseCaseUsage', '角の丸い実線の四角', 'usage-node'],
  ['use-case-name-compartment', G10, 'label', 'UseCaseUsage の接頭辞・名前', "'«' OccurrenceUsagePrefix 'use' 'case' '»' の行と usage-name-with-alias の行", 'use-case'],
  ['include-use-case-usage', G10, 'node', 'IncludeUseCaseUsage', '角の丸い実線の四角', 'usage-node'],
  ['include-use-case-name-compartment', G10, 'label', 'IncludeUseCaseUsage の名前', "'«include use case»' の行と requirement-name-compartment", 'include-use-case-usage'],
  ['include-use-case-relationship', N10, 'edge', 'ユースケースの取り込み', "上に '«include»'", 'general-relationship', 'GR11 で描く'],
  // ---- 8.2.3.26 ビューと視点(GR11)
  ['expose-relationship', N10, 'edge', 'Expose を線で描くもの', '選択肢 expose-r・toplevel-expose-r・recursive-expose-r', 'general-relationship', 'GR11 で描く'],
  ['expose-r', N10, 'edge', 'MembershipExpose', "上に '«' 'expose' '»'", 'expose-relationship', 'GR11 で描く'],
  ['toplevel-expose-r', N10, 'edge', 'NamespaceExpose', "上に '«' 'expose' '»*'", 'expose-relationship', 'GR11 で描く'],
  ['recursive-expose-r', N10, 'edge', '再帰の Expose', "上に '«' 'expose' '»**'", 'expose-relationship', 'GR11 で描く'],
  // ---- 8.2.3.27 メタデータ(GR11)
  ['metadata-def', G10, 'node', 'MetadataDefinition', '角の尖った実線の四角', 'definition-node の選択肢にない', '問 Q10 の e'],
  ['metadata-def-name-compartment', G10, 'label', 'MetadataDefinition の接頭辞・名前', "basic-name-prefix と '«' keyword* 'metadata' 'def' '»' の行と definition-name-with-alias の行", 'metadata-def'],
];

// GR4・GR6・GR7・GR9 の一覧から写す記号: [名前, 区分, GR10 の注記]
const GEN_REUSE = [
  ['general-view', D10, '描く範囲のパッケージの中(package-with-name-in-tab)と、根の名前空間の図(問 Q1)'],
  ['general-compartment', N10, '定義と使用の箱の中に一般ビューの区画を描かない。持つ使用は箱の外に別の箱として描き、線で結ぶ(設計書 7.7 節。問 Q4)'],
  ['ellipsis-at-lower-left-corner', R10, ''],
  ['element-node', R10, '依存と注釈の端。一般ビューでは図に描いた箱・パッケージ'],
  ['element-inside-textual-compartment', R10, ''],
  ['rel-name', R10, ''],
  ['dependencies-and-annotations-element', R10, ''],
  ['dependencies-element', R10, ''],
  ['binary-dependency', R10, ''],
  ['n-ary-dependency', R10, ''],
  ['n-ary-association-dot', R10, ''],
  ['n-ary-dependency-client-link', R10, ''],
  ['n-ary-dependency-supplier-link', R10, ''],
  ['annotation-node', R10, ''],
  ['comment-node', R10, ''],
  ['comment-without-keyword', R10, ''],
  ['comment-with-keyword', R10, ''],
  ['documentation-node', R10, ''],
  ['textual-representation-node', R10, ''],
  ['language-string', R10, ''],
  ['text-block', R10, ''],
  ['metadata-feature-annotation-node', R10, ''],
  ['metadata-feature-decl', R10, ''],
  ['metadata-feature-name-value-list', R10, ''],
  ['annotation-link', R10, ''],
  ['documentation-compartment', N10, 'パッケージの区画は使わない(問 Q1)。定義と使用の箱の doc は、今のビューと同じく注釈の記号で描く'],
  ['packages-compartment', N10, '問 Q1'],
  ['members-compartment', N10, '問 Q1'],
  ['relationships-compartment', N10, '問 Q1'],
  ['definition-name-with-alias', R10, ''],
  ['usage-name-with-alias', R10, '使用の箱の宣言の文字(問 Q3)'],
  ['compartment-stack', R10, ''],
  ['features-compartment', R10, ''],
  ['variants-compartment', R10, ''],
  ['variant-elementusages-compartment', R10, ''],
  ['el-prefix', R10, ''],
  ['usage-cp', R10, ''],
  ['attribute', R10, 'パッケージが直接持つ属性の使用(問 Q4)'],
  ['attributes-compartment', R10, '定義と使用が持つ属性(設計書 7.7 節。問 Q4)'],
  ['ports-compartment', R10, '定義と使用が持つポート(設計書 7.7 節。問 Q4)'],
  ['occurrence-def', R10, '箱の中の sequence-view は描かない'],
  ['occurrence-def-name-compartment', R10, ''],
  ['occurrence', R10, '箱の中の sequence-view は描かない'],
  ['occurrence-ref', R10, ''],
  ['occurrence-refxfx', R10, 'occurrence-ref と読む(設計書 7.8 節)'],
  ['occurrence-name-compartment', R10, ''],
  ['timeslice-or-snapshot-node', D10, '問 Q9 の a'],
  ['timeslice', D10, "右上の 'rd' の文字は描かない(GR9 の問 Q8 の g)。問 Q9 の a"],
  ['timeslice-name-compartment', D10, ''],
  ['snapshot', D10, '問 Q9 の a'],
  ['snapshot-name-compartment', D10, 'snapshot-name-compartment = と読む(設計書 7.8 節)'],
  ['snapshots-name-compartment', D10, '同上'],
  ['event-occurrence-def', N10, '抽象構文に事象の定義のメタクラスがない'],
  ['event-occurrence-def-name-compartment', N10, ''],
  ['event-occurrence', D10, '問 Q9 の a'],
  ['event-occurrence-name-compartment', D10, ''],
  ['portion-relationship', D10, '問 Q9 の a'],
  ['occurrence-node', D10, '本文に定義がない。occurrence・occurrence-ref と読む(問 Q9 の a)'],
  ['event-edge', N10, 'どの選択肢からも参照されない(GR9 の問 Q8 の d・e)'],
  ['eventer', N10, ''],
  ['event-occurence', N10, ''],
  ['item', R10, ''],
  ['item-ref', R10, 'usage-node の選択肢にない(問 Q10 の f)'],
  ['item-name-compartment', R10, ''],
  ['part-def', R10, '箱の中の interconnection-view は描かない(問 Q4)'],
  ['part-def-name-compartment', R10, ''],
  ['part', R10, '同上'],
  ['part-ref', R10, 'usage-node の選択肢にない(問 Q10 の f)'],
  ['part-name-compartment', R10, ''],
  ['port-def', R10, ''],
  ['port-def-name-compartment', R10, ''],
  ['port-usage', R10, 'パッケージが直接持つポートの使用(問 Q4)'],
  ['port-name-compartment', R10, ''],
  ['connection-def', R10, 'GR4 と同じく箱で描く'],
  ['connection-def-name-compartment', R10, ''],
  ['connection-def-graphical', N10, '接続の定義は箱で描く(GR4 と同じ。問 Q9 の c)'],
  ['n-ary-def-connection-dot', N10, '同上'],
  ['n-ary-def-segment', N10, '同上'],
  ['connection', D10, 'パッケージが直接持つ接続の使用だけを箱にする。定義と使用が持つものは connections の区画に出す(問 Q9 の b)'],
  ['connection-name-compartment', D10, ''],
  ['n-ary-connection-dot', N10, '接続の使用を線で描かない(問 Q9 の b)'],
  ['interface', D10, 'パッケージが直接持つインターフェースの使用だけを箱にする。定義と使用が持つものは interfaces の区画に出す(問 Q9 の b)'],
  ['interface-name-compartment', D10, ''],
  ['flow-def', R10, ''],
  ['flow-def-name-compartment', R10, ''],
  ['flow-node', D10, '同じ名前の定義が 2 つある。usage-node の flow-node は前半の箱の定義と読む(問 Q10 の h)。パッケージが直接持つフロー・メッセージの使用だけを箱にし、定義と使用が持つものは flows の区画に出す(問 Q9 の b)'],
  ['action-def', R10, '箱の中の action-flow-view は描かない(問 Q4)'],
  ['action', R10, '同上'],
  ['action-ref', R10, 'usage-node の選択肢にない(問 Q10 の f)'],
  ['perform-action-usage', R10, '問 Q4'],
  ['state-def', R10, '箱の中の state-transition-view は描かない(問 Q4)'],
  ['state-node', R10, 'state と読む(設計書 7.1 節)'],
  ['state', R10, '同上'],
  ['exhibit-state-usage', R10, '問 Q4'],
  ['exhibit-edge', N10, '問 Q9 の d'],
  ['constraint', R10, 'GR4 の箱を使う。引数は文字の区画に出す(問 Q9 の f)'],
  ['constraint-ref', R10, '同上'],
  ['requirement', R10, '同上'],
  ['requirement-ref', R10, '同上'],
  ['concern', R10, '同上'],
  ['viewpoint-def', R10, ''],
  ['view-def', R10, ''],
  ['viewpoint', R10, ''],
  ['view', R10, ''],
  ['framed-view', N10, '一般ビューの中の view の使用は view の箱で描く(GR11 で決める)'],
];

const genOut = [];
const genProblems = [];
const genSeen = new Set();
const classText10 = (c) => ({ [D10]: 'GR10 で描く', [G10]: 'GR10 では汎用の箱で描き、GR11 で専用の記号にする', [R10]: 'これまでのビューで描いた記号を使う', [N10]: '描かない' }[c]);
const priorLists = [['GR4', out], ['GR6', stateOut], ['GR7', actionOut], ['GR9', seqOut]];
for (const row of GEN_SYMBOLS) {
  const [name, cls, kind, abstract, shape, from, note = '', opt0] = row;
  const opt = typeof note === 'object' ? note : (opt0 ?? {});
  const noteText = typeof note === 'string' ? note : '';
  if (genSeen.has(name)) genProblems.push(`${name}: 一覧に 2 回ある`);
  genSeen.add(name);
  if (priorLists.some(([, l]) => l.some((o) => o.name === name))) genProblems.push(`${name}: GR4・GR6・GR7・GR9 の一覧にもある(GEN_REUSE に入れる)`);
  const hits = locate(name, opt);
  if (hits.length === 0) { genProblems.push(`${name}: 本文に定義の行が見つからない`); continue; }
  const line = hits[opt.nth ?? 0] ?? hits[0];
  const sec = sectionOf(line);
  const printed = printedPageOf(line);
  const pdfPage = printed + PAGE_OFFSET;
  let figLine = line;
  if (!opt.ref) for (let i = line; i < lines.length; i++) { const t = lines[i].trim(); if (t && !footer(lines[i])) { figLine = i + 1; break; } }
  const figurePage = printedPageOf(figLine) + PAGE_OFFSET;
  let pdfOk = null;
  if (checkPdf) {
    pdfOk = pdfText(pdfPage).includes(opt.pdfName ?? name);
    if (!pdfOk) genProblems.push(`${name}: PDF の ${pdfPage} ページに名前が見つからない`);
  }
  genOut.push({
    name, class: classText10(cls), kind, prior: null,
    section: sec.section, sectionTitle: sec.title, line, printedPage: printed, pdfPage, figurePage,
    defined: !opt.ref, definitions: opt.ref ? [] : hits,
    abstract, shape, from, note: noteText, pdfChecked: pdfOk,
  });
}
for (const [name, cls, note] of GEN_REUSE) {
  if (genSeen.has(name)) genProblems.push(`${name}: 一覧に 2 回ある`);
  genSeen.add(name);
  const found = priorLists.map(([k, l]) => [k, l.find((o) => o.name === name)]).filter(([, o]) => o);
  if (!found.length) { genProblems.push(`${name}: GR4・GR6・GR7・GR9 の一覧にない`); continue; }
  const [lastK, base] = found[found.length - 1];
  const prior = found.map(([k, o]) => `${k}(${o.class})`).join('・');
  const { gr4: _g, gr4Class: _c, prior: _p, ...rest } = base;
  genOut.push({ ...rest, class: classText10(cls), prior, note: [`${lastK} の一覧にある記号`, note].filter(Boolean).join('。') });
}
// definition-node・usage-node・general-relationship・general-node・namespace-node に足される選択肢を、8.2.3 節の全体から集める
const GEN_SETS = ['definition-node', 'usage-node', 'general-relationship', 'general-node', 'namespace-node', 'type-node', 'type-relationship', 'general-element', 'package-node'];
const genAlts = [];
for (let i = START; i < END; i++) {
  const m = /^\s*([a-z][a-z-]*)\s*(=\||\|=|=)(.*)$/.exec(lines[i]);
  if (!m || !GEN_SETS.includes(m[1])) continue;
  let text = m[3];
  for (let j = i + 1; j < END; j++) {
    const t = lines[j];
    if (footer(t)) continue;
    if (t.trim() === '') { if (text.trim()) break; continue; }
    if (/^\s*[a-z][a-z-]*\s*(=\||\|=|=)/.test(t)) break;
    text += ' ' + t;
  }
  const alternatives = text.split(/[|\s]+/).map((s) => s.trim().replace(/<$/, '')).filter(Boolean);
  genAlts.push({ name: m[1], op: m[2], line: i + 1, section: sectionOf(i + 1).section, alternatives });
}
const genListed = new Set(genOut.map((o) => o.name));
const genMissing = [...new Set(genAlts.flatMap((a) => a.alternatives))].filter((x) => !genListed.has(x) && !GEN_SETS.includes(x) && x !== 'interconnection-view');
if (genMissing.length) genProblems.push(`definition-node などの選択肢で一覧にないもの: ${genMissing.join(', ')}`);

// ---- 一般ビューの分野ごとの専用の記号(GR12 指示書 4.1 節)
// 起点は 8.2.3.8・8.2.3.15・8.2.3.19〜8.2.3.27 節。各節の definition-node・usage-node・general-relationship・compartment などに
// 足される選択肢と、そこから展開される生成規則を、節ごとに本文の順で並べる(区画の中身の生成規則 -contents・-element も入れる)。
// 区分
//   draw12    GR12 で描く
//   reuse12   これまでの記号を使う(GR4〜GR10 で作った記号・区画・文字の書き方)
//   nodraw12  描かない(理由は注記)
// 変化(change): GR12 の前の一般ビューの図からの違い。'形' は記号の形が変わる、'線' は線が増える(区画の行・箱が線に移る)、
//   '節点' は区画の行が節点と線に移る、'同じ' は形が今の汎用の箱と同じ(名前の区画のキーワードも今と同じ)、'' は変わらない
// 注記の「問 Qn」は reports/GR12/P1_symbols_*.md の問。図形の要点は、仕様書 PDF のページを画像にして読み取ったもの
// (pdftoppm -r 70。線の実線・破線は -r 150 で確かめた)
const D12 = 'draw12', R12 = 'reuse12', N12 = 'nodraw12';
// [名前, 区分, 種類, 抽象構文, 図形の要点, 経路, 変化, 注記, 追加の指定]。節は見出しの行から決める(GEN12_SECTIONS)
const GEN12_SECTIONS = {
  '8.2.3.8': [
    ['enumeration-def', D12, 'node', 'EnumerationDefinition', '角の尖った実線の四角。名前の区画と compartment-stack', 'definition-node', '同じ'],
    ['enumeration-def-name-compartment', D12, 'label', 'EnumerationDefinition の接頭辞・名前', "'«' DefinitionPrefix 'enum' 'def' '»' の行と definition-name-with-alias の行", 'enumeration-def', '同じ'],
    ['enumeration', D12, 'node', 'EnumerationUsage', '角の丸い実線の四角。名前の区画と compartment-stack', 'usage-node', '同じ'],
    ['enumeration-name-compartment', D12, 'label', 'EnumerationUsage の接頭辞・名前', "'«' UsagePrefix 'enum' '»' の行と usage-name-with-alias の行", 'enumeration', '同じ'],
    ['enums-compartment', R12, 'compartment', 'EnumerationDefinition の VariantMembership の要素(列挙の値)', "区切りの横線と斜体の見出し 'enums'", 'compartment', ''],
    ['enums-compartment_contents', R12, 'label', 'enums の区画の中身', "(enums-compartment-element)* '…'?", 'enums-compartment', '', '名前の _ は - の書き誤りと読む(問 Q9 の a)'],
    ['enums-compartment-element', R12, 'label', '列挙の値の宣言', 'el-prefix? UsagePrefix usage-cp(宣言の原文)', 'enums-compartment_contents', ''],
  ],
  '8.2.3.15': [
    ['allocation-def', D12, 'node', 'AllocationDefinition', '角の尖った実線の四角。名前の区画と compartment-stack', 'definition-node', '同じ'],
    ['allocation-def-name-compartment', D12, 'label', 'AllocationDefinition の接頭辞・名前', "'«' DefinitionPrefix 'allocation' 'def' '»' の行と definition-name-with-alias の行", 'allocation-def', '同じ'],
    ['allocation', D12, 'node', 'AllocationUsage(線にしないもの。問 Q4)', '角の丸い実線の四角。名前の区画と compartment-stack', 'usage-node', '同じ'],
    ['allocation-name-compartment', D12, 'label', 'AllocationUsage の接頭辞・名前', "'«' OccurrenceUsagePrefix 'allocation' '»' の行と usage-name-with-alias の行", 'allocation', '同じ'],
    ['allocations-compartment', R12, 'compartment', '定義・使用が持つ AllocationUsage(線にしないもの)', "区切りの横線と斜体の見出し 'allocations'", 'compartment', ''],
    ['allocations-compartment-contents', R12, 'label', 'allocations の区画の中身', "(allocations-compartment-element)* '…'?", 'allocations-compartment', ''],
    ['allocations-compartment-element', R12, 'label', '割り当ての宣言', 'el-prefix? OccurrenceUsagePrefix AllocationUsageDeclaration UsageBody*(宣言の原文)', 'allocations-compartment-contents', ''],
    ['allocate-relationship', D12, 'edge', '端が 2 つの AllocationUsage(allocate a to b)', "実線。終点に開いた矢じり。中ほどの上に '«allocate»'", 'general-relationship', '線', "本文の文字は二重の引用符 ''«allocate»''(問 Q9 の c)。GR10 の一覧の図形の要点の「破線」は誤り(問 Q9 の y)。問 Q4"],
    ['allocation-node', D12, 'endset', 'allocate-relationship の端', '選択肢 general-node・element-in-textual-compartment', 'allocate-relationship', '線', 'element-in-textual-compartment は element-inside-textual-compartment と読む(設計書 7.1 節)'],
  ],
  '8.2.3.19': [
    ['calc-def', D12, 'node', 'CalculationDefinition(CaseDefinition などを除く)', '角の尖った実線の四角。四辺に引数(param-t・param-l・param-r・param-b)。中に名前の区画・action-flow-view・compartment-stack', 'definition-node', '形', '引数は辺に描き、中の action-flow-view は描かない(問 Q3)'],
    ['calc-def-name-compartment', D12, 'label', 'CalculationDefinition の接頭辞・名前', "'«' DefinitionPrefix 'calc' 'def' '»' の行と definition-name-with-alias の行", 'calc-def', '同じ'],
    ['calc', D12, 'node', 'CalculationUsage(CaseUsage などを除く)', '角の丸い実線の四角。四辺に引数。中に名前の区画・action-flow-view・compartment-stack', 'usage-node', '形', '問 Q3'],
    ['calc-name-compartment', D12, 'label', 'CalculationUsage の接頭辞・名前', "定義が 2 つある。2 つ目の '«' OccurrenceUsagePrefix 'calc' '»' の行と usage-name-with-alias の行を使う", 'calc', '同じ', '問 Q9 の e', { nth: 1 }],
    ['occurrence-name-prefix', N12, 'label', '本文に定義がない', '—', 'calc-name-compartment の 1 つ目の定義', '', '1 つ目の定義を使わないので読み方を決めない(問 Q9 の e)', { ref: 'occurrence-name-prefix' }],
    ['calcs-compartment', R12, 'compartment', '定義・使用が持つ CalculationUsage', "区切りの横線と斜体の見出し 'calcs'", 'compartment', ''],
    ['calcs-compartment-contents', R12, 'label', 'calcs の区画の中身', "calcs-compartment-element* '…'?", 'calcs-compartment', ''],
    ['calcs-compartment-element', R12, 'label', '計算の宣言', 'el-prefix? OccurrenceUsagePrefix ActionUsageDeclaration(宣言の原文)', 'calcs-compartment-contents', ''],
    ['result-compartment', R12, 'compartment', '計算・制約の結果の式(ResultExpressionMembership)と戻り値(ReturnParameterMembership)', "区切りの横線と斜体の見出し 'result'", 'compartment', ''],
    ['result-compartment-contents', R12, 'label', 'result の区画の中身', 'OwnedExpression(原文)', 'result-compartment', ''],
  ],
  '8.2.3.20': [
    ['constraint-def', D12, 'node', 'ConstraintDefinition(RequirementDefinition などを除く)', '角の尖った実線の四角。四辺に引数。中に名前の区画・general-view・compartment-stack', 'definition-node', '形', '引数は辺に描き、中の general-view は描かない(問 Q3)'],
    ['constraint-def-name-compartment', D12, 'label', 'ConstraintDefinition の接頭辞・名前', "'«' DefinitionPrefix 'constraint' 'def' '»' の行と definition-name-with-alias の行", 'constraint-def', '同じ'],
    ['constraint', R12, 'node', 'ConstraintUsage(RequirementUsage などを除く)で、isReference でないもの', '角の丸い実線の四角。四辺に引数。中に名前の区画・general-view・compartment-stack', 'usage-node', '形', 'GR4 の記号。一般ビューでも引数を辺に描く(問 Q3)'],
    ['constraint-ref', R12, 'node', 'ConstraintUsage で isReference のもの', '角の丸い破線の四角。中身は constraint と同じ', 'interconnection-element', '形', '同上'],
    ['constraint-name-compartment', R12, 'label', 'ConstraintUsage の接頭辞・名前', "'«' OccurrenceUsagePrefix 'constraint' '»' の行と usage-name-with-alias の行", 'constraint・constraint-ref', ''],
    ['assert-constraint-usage', D12, 'endset', '本文に定義がない。assert-constraint-node と読む', '—', 'usage-node', '同じ', 'GR10 の裁定 Q10 の d', { ref: 'assert-constraint-usage' }],
    ['assert-constraint-node', D12, 'node', 'AssertConstraintUsage(線にしないもの。問 Q2 の f)', '角の丸い実線の四角。名前の区画と compartment-stack', 'usage-node', '同じ'],
    ['assert-constraint-name-compartment', D12, 'label', 'AssertConstraintUsage の名前', "'«assert constraint»' の行と constraint-name-compartment", 'assert-constraint-node', '同じ'],
    ['assume-constraint-node', D12, 'node', 'RequirementConstraintMembership(assumption)の ConstraintUsage で、制約を宣言するもの', '角の丸い実線の四角。名前の区画と compartment-stack', 'usage-node', '同じ', '参照するだけのもの(assume c;)は assume-edge にする(問 Q2 の c)'],
    ['assume-constraint-name-compartment', D12, 'label', '前提の制約の名前', "'«' OccurrenceUsagePrefix 'assume' 'constraint' '»' の行と usage-name-with-alias の行", 'assume-constraint-node', '同じ'],
    ['assume-edge', D12, 'edge', 'RequirementConstraintMembership(assumption)で、ほかの制約を参照する(assume c;)もの', "実線。終点に開いた矢じり。中ほどの上に '«assume»'", 'general-relationship', '線', '問 Q2 の c'],
    ['assumer', D12, 'endset', 'assume-edge の始点', '選択肢 requirement・requirement-def', 'assume-edge', '線'],
    ['assert-edge', D12, 'edge', 'AssertConstraintUsage で、ほかの制約を参照する(assert c;・assert constraint c;)もの', "実線。終点に開いた矢じり。中ほどの上に '«assert»'", 'general-relationship', '線', '問 Q2 の f'],
    ['assertor', D12, 'endset', 'assert-edge の始点', '選択肢 usage-node・definition-node', 'assert-edge', '線'],
    ['constraints-compartment', R12, 'compartment', '定義・使用が持つ ConstraintUsage', "区切りの横線と斜体の見出し 'constraints'", 'compartment', ''],
    ['constraints-compartment-contents', R12, 'label', 'constraints の区画の中身', "(constraints-usage-compartment-element)* '…'?", 'constraints-compartment', ''],
    ['constraints-usage-compartment-element', R12, 'label', '制約の宣言', 'el-prefix? OccurrenceUsagePrefix ConstraintUsageDeclaration CalculationBody*(宣言の原文)', 'constraints-compartment-contents', ''],
    ['assert-constraints-compartment', R12, 'compartment', '定義・使用が持つ AssertConstraintUsage(線にしないもの)', "区切りの横線と斜体の見出し 'assert constraints'", 'compartment', ''],
    ['assert-constraints-compartment-contents', R12, 'label', 'assert constraints の区画の中身', "(assert-constraints-compartment-element)* '…'?", 'assert-constraints-compartment', ''],
    ['assert-constraints-compartment-element', R12, 'label', '表明する制約の宣言', "el-prefix? OccurrenceUsagePrefix ('not')? (OwnedSubsetting … | UsageDeclaration) CalculationUsageParameterPart CalculationBody(宣言の原文)", 'assert-constraints-compartment-contents', ''],
  ],
  '8.2.3.21': [
    ['requirement-def', D12, 'node', 'RequirementDefinition(ConcernDefinition などを除く)', '角の尖った実線の四角。四辺に引数。中に名前の区画・general-view・compartment-stack', 'definition-node', '形', '引数は辺に描き、中の general-view は描かない(問 Q3)'],
    ['requirement-def-name-compartment', D12, 'label', 'RequirementDefinition の接頭辞・名前', "'«' DefinitionPrefix 'requirement' 'def' '»' の行と definition-name-with-alias の行", 'requirement-def', '同じ'],
    ['requirement', R12, 'node', 'RequirementUsage で isReference でないもの', '角の丸い実線の四角。四辺に引数。中に名前の区画・general-view・compartment-stack', 'usage-node', '形', 'GR4 の記号。一般ビューでも引数を辺に、subject・actor・stakeholder を節点に描く(問 Q1・Q3)'],
    ['requirement-ref', R12, 'node', 'RequirementUsage で isReference のもの', '角の丸い破線の四角。中身は requirement と同じ', 'interconnection-element', '形', '同上'],
    ['requirement-name-compartment', R12, 'label', 'RequirementUsage の接頭辞・名前', "'«' OccurrenceUsagePrefix 'requirement' '»' の行と usage-name-with-alias の行", 'requirement・requirement-ref', ''],
    ['satisfy-requirement-usage', D12, 'node', 'SatisfyRequirementUsage(線にしないもの。問 Q2 の d)', '角の丸い実線の四角。名前の区画と compartment-stack', 'usage-node', '同じ'],
    ['satisfy-requirement-name-compartment', D12, 'label', 'SatisfyRequirementUsage の名前', "'«satisfy requirement»' の行と requirement-name-compartment", 'satisfy-requirement-usage', '同じ'],
    ['concern-def', D12, 'node', 'ConcernDefinition', '角の尖った実線の四角。名前の区画と compartment-stack', 'definition-node', '同じ'],
    ['concern-def-name-compartment', D12, 'label', 'ConcernDefinition の接頭辞・名前', "'«' DefinitionPrefix 'concern' 'def' '»' の行と definition-name-with-alias の行", 'concern-def', '同じ'],
    ['concern', R12, 'node', 'ConcernUsage', '角の丸い実線の四角。名前の区画と compartment-stack', 'usage-node', '節点', 'GR4 の記号。stakeholder を節点にする(問 Q1)'],
    ['concern-name-compartment', R12, 'label', 'ConcernUsage の接頭辞・名前', "'«' OccurrenceUsagePrefix 'concern' '»' の行と usage-name-with-alias の行", 'concern', ''],
    ['requirements-compartment', R12, 'compartment', '定義・使用が持つ RequirementUsage', "区切りの横線と斜体の見出し 'requirements'", 'compartment', ''],
    ['requirements-compartment-contents', R12, 'label', 'requirements の区画の中身', "(requirements-compartment-element)* '…'?", 'requirements-compartment', ''],
    ['requirements-compartment-element', R12, 'label', '要求の宣言', 'OccurrenceUsagePrefix ConstraintUsageDeclaration(宣言の原文)', 'requirements-compartment-contents', ''],
    ['require-constraints-compartment', R12, 'compartment', 'RequirementConstraintMembership(requirement)の制約(箱・線にしないもの)', "区切りの横線と斜体の見出し 'require constraints'", 'compartment', ''],
    ['require-constraints-compartment-contents', R12, 'label', 'require constraints の区画の中身', "require-constraint-element* '…'?", 'require-constraints-compartment', ''],
    ['require-constraint-element', R12, 'label', '要求する制約の宣言', 'el-prefix? requireMemberPrefix? RequirementConstraintUsage(宣言の原文)', 'require-constraints-compartment-contents・assume-constraints-compartment-contents', ''],
    ['assume-constraints-compartment', R12, 'compartment', 'RequirementConstraintMembership(assumption)の制約(箱・線にしないもの)', "区切りの横線と斜体の見出し 'assume constraints'", 'compartment', ''],
    ['assume-constraints-compartment-contents', R12, 'label', 'assume constraints の区画の中身', "require-constraint-element* '…'?", 'assume-constraints-compartment', ''],
    ['satisfy-requirements-compartment', R12, 'compartment', '定義・使用が持つ SatisfyRequirementUsage(線にしないもの)', "区切りの横線と斜体の見出し(本文は 'satify requirements'。'satisfy requirements' と表示する。設計書 7.1 節)", 'compartment', ''],
    ['satisfy-requirements-compartment-contents', R12, 'label', 'satisfy requirements の区画の中身', 'text-block(宣言の原文)', 'satisfy-requirements-compartment', ''],
    ['satisfies-compartment', R12, 'compartment', '(今の図では使っていない)', "区切りの横線と斜体の見出し 'satisfies'", 'compartment', ''],
    ['satisfies-compartment-contents', R12, 'label', 'satisfies の区画の中身', "UsageDeclaration* '…'?", 'satisfies-compartment', ''],
    ['actors-compartment', R12, 'compartment', 'ActorMembership の要素(節点にしないもの。問 Q1)', "区切りの横線と斜体の見出し 'actors'", 'compartment', ''],
    ['actors-compartment-contents', R12, 'label', 'actors の区画の中身', "(actors-compartment-element)* '…'?", 'actors-compartment', ''],
    ['actors-compartment-element', R12, 'label', '行為者の宣言', 'el-prefix? MemberPrefix usage-cp(宣言の原文)', 'actors-compartment-contents', ''],
    ['subject-compartment', R12, 'compartment', 'SubjectMembership の要素(節点にしないもの。問 Q1)', "区切りの横線と斜体の見出し 'subject'", 'compartment', ''],
    ['subject-compartment-contents', R12, 'label', 'subject の区画の中身', "(subject-compartment-element)* '…'?", 'subject-compartment', ''],
    ['subject-compartment-element', R12, 'label', '主体の宣言', 'el-prefix? MemberPrefix usage-cp(宣言の原文)', 'subject-compartment-contents', ''],
    ['stakeholders-compartment', R12, 'compartment', 'StakeholderMembership の要素(節点にしないもの。問 Q1)', "区切りの横線と斜体の見出し 'stakeholders'", 'compartment', ''],
    ['stakeholders-compartment-contents', R12, 'label', 'stakeholders の区画の中身', "(stakeholders-compartment-element)* '…'?", 'stakeholders-compartment', ''],
    ['stakeholders-compartment-element', R12, 'label', '利害関係者の宣言', 'el-prefix? MemberPrefix usage-cp(宣言の原文)', 'stakeholders-compartment-contents', ''],
    ['frames-compartment', R12, 'compartment', 'FramedConcernMembership の関心事(箱・線にしないもの)', "区切りの横線と斜体の見出し 'frames'", 'compartment', ''],
    ['frames-compartment-contents', R12, 'label', 'frames の区画の中身', "(frames-compartment-element)* '…'?", 'frames-compartment', ''],
    ['frames-compartment-element', R12, 'label', '枠にする関心事の宣言', 'el-prefix* MemberPrefix? FramedConcernUsage(宣言の原文)', 'frames-compartment-contents', ''],
    ['concerns-compartment', R12, 'compartment', '定義・使用が持つ ConcernUsage', "区切りの横線と斜体の見出し 'concerns'", 'compartment', '', '中身の concerns-compartment-contents に定義がない(問 Q9 の h)'],
    ['concerns-compartment-contents', R12, 'label', '本文に定義がない', "(ほかの区画と同じく)宣言の原文の並びと '…' と読む", 'concerns-compartment', '', '問 Q9 の h', { ref: 'concerns-compartment-contents' }],
    ['subject-actors-stakeholders-node', R12, 'endset', 'distinguished-parameter-link の始点', '選択肢 requirement(8.2.3.21)・analysis・analysis-def(8.2.3.23)・verification・verification-def(8.2.3.24)・use-case・use-case-def(8.2.3.25)', 'distinguished-parameter-link', '節点', 'GR4 の一覧では requirement だけ。問 Q1'],
    ['distinguished-parameter', R12, 'node', 'SubjectMembership・ActorMembership・StakeholderMembership の要素', '選択肢 subject・actor・stakeholder', 'interconnection-element', '節点', '問 Q1'],
    ['subject', R12, 'node', 'SubjectMembership の要素', "角の丸い実線の小さな四角。1 行目 '«subject»'、2 行目 subject-name", 'distinguished-parameter', '節点', '問 Q1'],
    ['actor', R12, 'node', 'ActorMembership の要素', '棒人間と、その下の actor-name(もう 1 つの形は «actor» の箱。棒人間の形を使う。設計書 7.2 節)', 'distinguished-parameter', '節点', '問 Q1'],
    ['stakeholder', R12, 'node', 'StakeholderMembership の要素', "角の丸い実線の小さな四角。1 行目 '«stakeholder»'、2 行目 stakeholder-name", 'distinguished-parameter', '節点', '問 Q1'],
    ['subject-name', R12, 'label', '主体の宣言', 'UsageDeclaration', 'subject', ''],
    ['actor-name', R12, 'label', '行為者の宣言', 'UsageDeclaration', 'actor', ''],
    ['stakeholder-name', R12, 'label', '利害関係者の宣言', 'UsageDeclaration', 'stakeholder', ''],
    ['distinguished-parameter-link', R12, 'edge', '持ち主と subject・actor・stakeholder', '実線。矢じりなし', 'interconnection-element', '節点', '問 Q1'],
    ['frame-relationship', D12, 'edge', 'FramedConcernMembership で、ほかの関心事を参照する(frame c;)もの', "実線。終点に開いた矢じり。中ほどの上に '«frame»'", 'general-relationship', '線', 'frame-edge と同じ形で、1 つの記号として描く(問 Q2 の e・Q9 の g)'],
    ['concern-stakeholder-link', R12, 'edge', '関心事と stakeholder', '実線。矢じりなし', 'interconnection-element', '節点', '問 Q1'],
    ['stakeholder-node', R12, 'endset', '本文に定義がない。stakeholder と読む(設計書 7.1 節)', '—', 'concern-stakeholder-link', '', '', { ref: '&stakeholder-node' }],
    ['satisfy-edge', D12, 'edge', 'SatisfyRequirementUsage(satisfy R by x)', "実線。終点に開いた矢じり。中ほどの上に '«satisfy»'", 'general-relationship', '線', 'GR10 の一覧の図形の要点の「破線」は誤り(問 Q9 の y)。問 Q2 の d'],
    ['satisfier', D12, 'endset', 'satisfy-edge の始点', '選択肢 usage-node・definition-node', 'satisfy-edge', '線'],
    ['require-edge', D12, 'edge', 'RequirementConstraintMembership(requirement)で、ほかの制約・要求を参照する(require c;)もの', "実線。終点に開いた矢じり。中ほどの上に '«require»'", 'general-relationship', '線', '本文の終点は &requirement だが、7 章の表 20 は制約にも引く(問 Q2 の c・Q9 の f)'],
    ['requirer', D12, 'endset', 'require-edge の始点', '選択肢 usage-node・definition-node', 'require-edge', '線'],
    ['require-constraint-node', D12, 'node', 'RequirementConstraintMembership(requirement)の ConstraintUsage で、制約を宣言するもの', '角の丸い実線の四角。名前の区画と compartment-stack', 'usage-node', '同じ', '参照するだけのもの(require c;)は require-edge にする(問 Q2 の c)'],
    ['require-constraint-name-compartment', D12, 'label', '要求する制約の名前', "'«' OccurrenceUsagePrefix 'require' 'constraint' '»' の行と usage-name-with-alias の行", 'require-constraint-node', '同じ'],
    ['frame-concern-node', D12, 'node', 'FramedConcernMembership の ConcernUsage で、関心事を宣言するもの', '角の丸い実線の四角。名前の区画と compartment-stack', 'usage-node', '同じ', '参照するだけのもの(frame c;)は frame-relationship にする(問 Q2 の e)'],
    ['frame-concern-name-compartment', D12, 'label', '枠にする関心事の名前', "'«' OccurrenceUsagePrefix 'frame' 'concern' '»' の行と usage-name-with-alias の行", 'frame-concern-node', '同じ'],
    ['frame-edge', D12, 'edge', 'frame-relationship と同じ', "実線。終点に開いた矢じり。中ほどの上に '«frame»'", 'general-relationship', '線', 'frame-relationship と同じ記号として描く(問 Q9 の g)'],
    ['framer', D12, 'endset', 'frame-edge・frame-relationship の始点', '選択肢 requirement・requirement-def・viewpoint・viewpoint-def', 'frame-edge', '線'],
  ],
  '8.2.3.22': [
    ['objective-compartment', R12, 'compartment', 'ObjectiveMembership の要求(箱にしないもの)', "区切りの横線と斜体の見出し 'objective'", 'compartment', '', '一般ビューでは objective の要求を箱にして合成の線で結ぶ(GR10 の裁定 Q4)。この区画は今の図では使っていない'],
    ['objective-compartment-contents', R12, 'label', 'objective の区画の中身', "(objective-compartment-element)* '…'?", 'objective-compartment', ''],
    ['objective-compartment-element', R12, 'label', '目的の宣言', 'comp-prefix? MemberPrefix ConstraintUsageDeclaration RequirementBody(宣言の原文)', 'objective-compartment-contents', '', 'comp-prefix に定義がない(問 Q9 の j)'],
    ['comp-prefix', N12, 'label', '本文に定義がない', '—', 'objective-compartment-element', '', 'el-prefix と読む。所有するものだけを描くので、図には現れない(問 Q9 の j)', { ref: 'comp-prefix?' }],
  ],
  '8.2.3.23': [
    ['analysis-def', D12, 'node', 'AnalysisCaseDefinition', '角の尖った実線の四角。四辺に引数。中に名前の区画・action-flow-view・compartment-stack', 'definition-node', '形', '問 Q1・Q3'],
    ['analysis-def-name-compartment', D12, 'label', 'AnalysisCaseDefinition の接頭辞・名前', "'«' DefinitionPrefix 'analysis' 'def' '»' の行と definition-name-with-alias の行", 'analysis-def', '同じ'],
    ['analysis', D12, 'node', 'AnalysisCaseUsage', '角の丸い実線の四角。四辺に引数。中に名前の区画・action-flow-view・compartment-stack', 'usage-node', '形', '問 Q1・Q3'],
    ['analysis-name-compartment', D12, 'label', 'AnalysisCaseUsage の接頭辞・名前', "'«' OccurrenceUsagePrefix 'analysis' '»' の行と usage-name-with-alias の行", 'analysis', '同じ'],
    ['analyses-compartment', R12, 'compartment', '定義・使用が持つ AnalysisCaseUsage', "区切りの横線と斜体の見出し 'analyses'", 'compartment', ''],
    ['analyses-compartment-contents', R12, 'label', 'analyses の区画の中身', "analyses-compartment-element* '…'?", 'analyses-compartment', ''],
    ['analyses-compartment-element', R12, 'label', '解析の宣言', 'el-prefix? OccurrenceUsagePrefix ConstraintUsageDeclaration CaseBody(宣言の原文)', 'analyses-compartment-contents', ''],
  ],
  '8.2.3.24': [
    ['verification-def', D12, 'node', 'VerificationCaseDefinition', '角の尖った実線の四角。四辺に引数。中に名前の区画・action-flow-view・compartment-stack', 'definition-node', '形', '問 Q1・Q3'],
    ['verification-def-name-compartment', D12, 'label', 'VerificationCaseDefinition の接頭辞・名前', "'«' DefinitionPrefix 'verification' 'def' '»' の行と definition-name-with-alias の行", 'verification-def', '同じ'],
    ['verification', D12, 'node', 'VerificationCaseUsage', '角の丸い実線の四角。四辺に引数。中に名前の区画・action-flow-view・compartment-stack', 'usage-node', '形', '問 Q1・Q3'],
    ['verification-name-compartment', D12, 'label', 'VerificationCaseUsage の接頭辞・名前', "'«' OccurrenceUsagePrefix 'verification' '»' の行と usage-name-with-alias の行", 'verification', '同じ'],
    ['verify-requirement-node', R12, 'node', 'RequirementVerificationMembership の RequirementUsage で、要求を宣言するもの', '角の丸い実線の四角。名前の区画と compartment-stack', 'usage-node', '', '箱にせず、今のとおり objective の箱の verifies の区画の行に書く(問 Q2 の g、P2 の裁定 R4)'],
    ['verify-requirement-name-compartment', R12, 'label', '検証する要求の名前', "'«' OccurrenceUsagePrefix 'verify' 'requirement' '»' の行と usage-name-with-alias の行", 'verify-requirement-node', '', 'verify-requirement-node と同じ(P2 の裁定 R4)'],
    ['verifications-compartment', R12, 'compartment', '定義・使用が持つ VerificationCaseUsage', "区切りの横線と斜体の見出し 'verifications'", 'compartment', ''],
    ['verifications-compartment-contents', R12, 'label', 'verifications の区画の中身', "(verifications-compartment-element)* '…'?", 'verifications-compartment', ''],
    ['verifications-compartment-element', R12, 'label', '検証の宣言', "el-prefix? OccurrenceUsagePrefix ConstraintUsageDeclaration CaseBody '…'(宣言の原文)", 'verifications-compartment-contents', ''],
    ['verifies-compartment', R12, 'compartment', 'RequirementVerificationMembership の要求(線にしないもの)', "区切りの横線と斜体の見出し 'verifies'", 'compartment', ''],
    ['verifies-compartment-contents', R12, 'label', 'verifies の区画の中身', "(verifies-compartment-element)* '…'?", 'verifies-compartment', ''],
    ['verifies-compartment-element', R12, 'label', '検証する要求の宣言', "el-prefix? MemberPrefix RequirementVerificationUsage '…'(宣言の原文)", 'verifies-compartment-contents', ''],
    ['verification-methods-compartment', R12, 'compartment', '(今の図では使っていない。検証の方法のメタデータ)', "区切りの横線と斜体の見出し 'verification methods'", 'compartment', ''],
    ['verification-methods-compartment-contents', R12, 'label', 'verification methods の区画の中身', "(verification-methods-compartment-element)* '…'?", 'verification-methods-compartment', ''],
    ['verification-methods-compartment-element', R12, 'label', '検証の方法', 'MetadataBody', 'verification-methods-compartment-contents', ''],
    ['verify-relationship', D12, 'edge', 'RequirementVerificationMembership で、ほかの要求を参照する(verify R;)もの', "実線。終点に開いた矢じり。中ほどの上に '«verify»'", 'general-relationship', '線', '始点は検証の箱(目的の持ち主)。問 Q2 の g'],
    ['verification-case', D12, 'endset', '本文に定義がない。verification・verification-def と読む', '—', 'verify-relationship', '線', '問 Q9 の i', { ref: '&verification-case' }],
  ],
  '8.2.3.25': [
    ['use-case-def', D12, 'node', 'UseCaseDefinition', '角の尖った実線の四角(楕円ではない)。四辺に引数。中に名前の区画・action-flow-view・compartment-stack', 'definition-node', '形', '問 Q1・Q3'],
    ['use-case-def-name-compartment', D12, 'label', 'UseCaseDefinition の接頭辞・名前', "'«' DefinitionPrefix 'use' 'case' 'def' '»' の行と definition-name-with-alias の行", 'use-case-def', '同じ'],
    ['use-case', D12, 'node', 'UseCaseUsage(IncludeUseCaseUsage を除く)', '角の丸い実線の四角(楕円ではない)。四辺に引数。中に名前の区画・action-flow-view・compartment-stack', 'usage-node', '形', '問 Q1・Q3'],
    ['use-case-name-compartment', D12, 'label', 'UseCaseUsage の接頭辞・名前', "'«' OccurrenceUsagePrefix 'use' 'case' '»' の行と usage-name-with-alias の行", 'use-case', '同じ'],
    ['include-use-case-usage', D12, 'node', 'IncludeUseCaseUsage(線にしないもの。問 Q2 の h)', '角の丸い実線の四角。名前の区画と compartment-stack', 'usage-node', '同じ'],
    ['include-use-case-name-compartment', D12, 'label', 'IncludeUseCaseUsage の名前', "'«include use case»' の行と requirement-name-compartment", 'include-use-case-usage', '同じ'],
    ['use-cases-compartment', R12, 'compartment', '定義・使用が持つ UseCaseUsage', "区切りの横線と斜体の見出し 'use cases'", 'compartment', ''],
    ['use-cases-compartment-contents', R12, 'label', 'use cases の区画の中身', "use-cases-compartment-element* '…'?", 'use-cases-compartment', ''],
    ['use-cases-compartment-element', R12, 'label', 'ユースケースの宣言', 'el-prefix? OccurrenceUsagePrefix ConstraintUsageDeclaration(宣言の原文)', 'use-cases-compartment-contents', ''],
    ['include-actions-compartment', R12, 'compartment', '本文に定義がない。include-use-cases-compartment と読む(設計書 7.1 節)', '—', 'compartment', '', '', { ref: 'include-actions-compartment' }],
    ['include-use-cases-compartment', R12, 'compartment', '定義・使用が持つ IncludeUseCaseUsage(線にしないもの)', "区切りの横線と斜体の見出し 'include use cases'", 'compartment', '', '選択肢の include-actions-compartment はこの区画と読む(設計書 7.1 節)'],
    ['include-use-cases-compartment-contents', R12, 'label', 'include use cases の区画の中身', "(include-use-cases-compartment-element)* '…'?", 'include-use-cases-compartment', '', '本文の括弧が閉じていない(問 Q9 の k)'],
    ['include-use-cases-compartment-element', R12, 'label', '取り込むユースケースの宣言', 'el-prefix? OccurrenceUsagePrefix (OwnedSubsetting … | UsageDeclaration) (ValuePart | ActionUsageParameterList)? CaseBody(宣言の原文)', 'include-use-cases-compartment-contents', ''],
    ['includes-compartment', R12, 'compartment', '(今の図では使っていない)', "区切りの横線と斜体の見出し 'includes'", 'compartment', ''],
    ['includes-compartment-contents', R12, 'label', 'includes の区画の中身', "(includes-compartment-element)* '…'?", 'includes-compartment', ''],
    ['includes-compartment-element', R12, 'label', '取り込むユースケースの宣言', 'el-prefix? OccurrenceUsagePrefix (OwnedSubsetting … | UsageDeclaration)', 'includes-compartment-contents', ''],
    ['include-use-case-relationship', D12, 'edge', 'IncludeUseCaseUsage で、ほかのユースケースを参照する(include u;)もの', "実線。終点に開いた矢じり。中ほどの上に '«include»'", 'general-relationship', '線', '問 Q2 の h'],
  ],
  '8.2.3.26': [
    ['root-view', R12, 'view', 'テキストの view で描く範囲を決めたときの図', 'framed-view(図の枠)', '(根の生成規則)', '', 'view の候補の図の枠(GR4 からの記号)'],
    ['viewpoint-def', R12, 'node', 'ViewpointDefinition', '角の尖った実線の四角。名前の区画と compartment-stack', 'definition-node', ''],
    ['viewpoint-def-name-compartment', R12, 'label', 'ViewpointDefinition の接頭辞・名前', "'«' DefinitionPrefix 'viewpoint' 'def' '»' の行と definition-name-with-alias の行", 'viewpoint-def', ''],
    ['view-def', R12, 'node', 'ViewDefinition', '角の尖った実線の四角。名前の区画と compartment-stack', 'definition-node', ''],
    ['view-def-name-compartment', R12, 'label', 'ViewDefinition の接頭辞・名前', "'«' DefinitionPrefix 'view' 'def' '»' の行と definition-name-with-alias の行", 'view-def', ''],
    ['viewpoint', R12, 'node', 'ViewpointUsage', '角の丸い実線の四角。名前の区画と compartment-stack', 'usage-node', ''],
    ['viewpoint-name-compartment', R12, 'label', 'ViewpointUsage の接頭辞・名前', "'«' OccurrenceUsagePrefix 'viewpoint' '»' の行と usage-name-with-alias の行", 'viewpoint', ''],
    ['view', R12, 'node', 'ViewUsage(図の中の箱)', '角の丸い実線の四角。名前の区画と compartment-stack', 'usage-node', ''],
    ['view-name-compartment', R12, 'label', 'ViewUsage の接頭辞・名前', "'«' OccurrenceUsagePrefix 'view' '»' の行と usage-name-with-alias の行", 'view', ''],
    ['views-compartment', R12, 'compartment', '定義・使用が持つ ViewUsage', "区切りの横線と斜体の見出し 'views'", 'compartment', ''],
    ['views-compartment-contents', R12, 'label', 'views の区画の中身', "(views-compartment-element)* '…'(本文は '?' がない。問 Q9 の l)", 'views-compartment', ''],
    ['views-compartment-element', R12, 'label', 'ビューの宣言', 'el-prefix? OccurrenceUsagePrefix UsageDeclaration? ValueOrFlowPart? ViewBody(宣言の原文)', 'views-compartment-contents', ''],
    ['viewpoints-compartment', R12, 'compartment', '定義・使用が持つ ViewpointUsage', "区切りの横線と斜体の見出し 'viewpoints'", 'compartment', ''],
    ['viewpoints-compartment-contents', R12, 'label', 'viewpoints の区画の中身', "(viewpoints-compartment-element)* '…'?", 'viewpoints-compartment', ''],
    ['viewpoints-compartment-element', R12, 'label', '視点の宣言', 'el-prefix? OccurrenceUsagePrefix ConstraintUsageDeclaration RequirementBody(宣言の原文)', 'viewpoints-compartment-contents', ''],
    ['exposes-compartment', R12, 'compartment', 'ビューの Expose(線にしないもの)', "区切りの横線と斜体の見出し 'exposes'", 'compartment', ''],
    ['exposes-compartment-contents', R12, 'label', 'exposes の区画の中身', "exposes-compartment-element* '…'?", 'exposes-compartment', ''],
    ['exposes-compartment-element', R12, 'label', 'expose の宣言', 'MembershipExpose | NamespaceExpose(宣言の原文)', 'exposes-compartment-contents', ''],
    ['filters-compartment', R12, 'compartment', 'ElementFilterMembership の条件', "区切りの横線と斜体の見出し 'filters'", 'compartment', ''],
    ['filters-compartment-contents', R12, 'label', 'filters の区画の中身', "(filters-compartment-element)* '…'?", 'filters-compartment', ''],
    ['filters-compartment-element', R12, 'label', 'filter の条件', 'el-prefix? MemberPrefix OwnedExpression(原文)', 'filters-compartment-contents', ''],
    ['rendering-compartment', R12, 'compartment', 'ViewRenderingMembership の要素', "区切りの横線と斜体の見出し 'rendering'", 'compartment', ''],
    ['rendering-compartment-contents', R12, 'label', 'rendering の区画の中身', "usage-cp* '…'?", 'rendering-compartment', ''],
    ['framed-view', N12, 'node', 'ViewUsage を図の枠で描く形(usage-node の選択肢)', '大きな四角の枠と、左上の名前の区画、右上・左下・右下の情報区画', 'usage-node', '', '図の中の view の使用は view の箱で描き、枠の形は view の候補の図の枠だけに使う(問 Q5)'],
    ['frameless-view', R12, 'view', '枠の中のビュー', '選択肢 general-view・interconnection-view・action-flow-view・state-transition-view・sequence-view', 'framed-view', ''],
    ['view-frame-name-compartment', R12, 'label', "ViewUsage の名前と型(«view» 修飾名 ':' 修飾名)", '枠の左上の区画', 'framed-view', ''],
    ['view-frame-info-contents', R12, 'label', 'ViewUsage の Expose・ElementFilterMember・注釈', '情報区画の文字', 'view-frame-info-compartment-*', ''],
    ['view-frame-info-compartment-tr', R12, 'adorn', 'ViewUsage の Expose など', '枠の右上', 'framed-view', ''],
    ['view-frame-info-compartment-bl', R12, 'adorn', 'ViewUsage の Expose など', '枠の左下', 'framed-view', ''],
    ['view-frame-info-compartment-br', R12, 'adorn', 'ViewUsage の Expose など', '枠の右下', 'framed-view', ''],
    ['expose-relationship', D12, 'edge', 'ビューの Expose を線で描くもの', '選択肢 expose-r・toplevel-expose-r・recursive-expose-r', 'general-relationship', '線', '問 Q5'],
    ['expose-r', D12, 'edge', 'MembershipExpose(再帰でないもの)', "破線。終点に開いた矢じり。中ほどの上に '«' 'expose' '»'", 'expose-relationship', '線', '問 Q5'],
    ['toplevel-expose-r', D12, 'edge', 'NamespaceExpose(再帰でないもの。X::*)', "破線。終点に開いた矢じり。中ほどの上に '«' 'expose' '»*'", 'expose-relationship', '線', '問 Q5'],
    ['recursive-expose-r', D12, 'edge', '再帰の Expose(X::**)', "破線。終点に開いた矢じり。中ほどの上に '«' 'expose' '»**'", 'expose-relationship', '線', '問 Q5'],
  ],
  '8.2.3.27': [
    ['metadata-feature-annotation-node', R12, 'annotation', 'MetadataUsage(接頭辞の #X を除く)', "右上の角を折った四角。1 行目 '«metadata»'、2 行目 metadata-feature-decl、その下に名前 = 値の行", 'annotation-node', '', '注釈先へは annotation-link で結ぶ(GR4 からの記号。問 Q6)'],
    ['metadata-feature-decl', R12, 'label', 'MetadataUsage の名前か型', 'Identifier', 'metadata-feature-annotation-node', ''],
    ['metadata-feature-name-value-list', R12, 'label', 'MetadataUsage の特徴と値', "(metadata-feature-name '=' expression-text)*", 'metadata-feature-annotation-node', ''],
    ['metadata-feature-name', R12, 'label', '特徴の名前', 'Identifier', 'metadata-feature-name-value-list', ''],
    ['expression-text', R12, 'label', '値の式', 'text-block(原文)', 'metadata-feature-name-value-list', ''],
    ['metadata-def', D12, 'node', 'MetadataDefinition', '角の尖った実線の四角。名前の区画と compartment-stack', 'definition-node の選択肢にない(GR10 の裁定 Q10 の e)', '同じ'],
    ['metadata-def-name-compartment', D12, 'label', 'MetadataDefinition の接頭辞・名前', "basic-name-prefix と '«' keyword* 'metadata' 'def' '»' の行と definition-name-with-alias の行", 'metadata-def', '同じ', 'basic-name-prefix に定義がない(問 Q9 の m)'],
    ['basic-name-prefix', N12, 'label', '本文に定義がない', '—', 'metadata-def-name-compartment', '', '宣言の原文の接頭辞(abstract など)と読む。名前の区画は原文から作るので、別の記号にしない(問 Q9 の m)', { ref: 'basic-name-prefix' }],
  ],
};
const classText12 = (c) => ({ [D12]: 'GR12 で描く', [R12]: 'これまでの記号を使う', [N12]: '描かない' }[c]);
const gen12Out = [];
const gen12Problems = [];
const gen12Seen = new Set();
const priorLists12 = [...priorLists, ['GR10', genOut]];
for (const [sec, rows] of Object.entries(GEN12_SECTIONS)) {
  for (const row of rows) {
    const [name, cls, kind, abstract, shape, from, change, note = '', opt = {}] = row;
    if (gen12Seen.has(name)) gen12Problems.push(`${name}: 一覧に 2 回ある`);
    gen12Seen.add(name);
    const hits = locate(name, { ...opt, sec });
    if (hits.length === 0) { gen12Problems.push(`${name}: ${sec} 節に定義の行が見つからない`); continue; }
    const line = hits[opt.nth ?? 0] ?? hits[0];
    const s = sectionOf(line);
    if (s.section !== sec) gen12Problems.push(`${name}: 行 ${line} の節が ${s.section}`);
    const printed = printedPageOf(line);
    const pdfPage = printed + PAGE_OFFSET;
    let figLine = line;
    if (!opt.ref) for (let i = line; i < lines.length; i++) { const t = lines[i].trim(); if (t && !footer(lines[i])) { figLine = i + 1; break; } }
    const figurePage = printedPageOf(figLine) + PAGE_OFFSET;
    let pdfOk = null;
    if (checkPdf) {
      pdfOk = pdfText(pdfPage).includes(name);
      if (!pdfOk) gen12Problems.push(`${name}: PDF の ${pdfPage} ページに名前が見つからない`);
    }
    const prior = priorLists12.map(([k, l]) => [k, l.find((o) => o.name === name)]).filter(([, o]) => o).map(([k, o]) => `${k}(${o.class})`).join('・') || null;
    gen12Out.push({
      name, class: classText12(cls), kind, change, prior,
      section: s.section, sectionTitle: s.title, line, printedPage: printed, pdfPage, figurePage,
      defined: !opt.ref, definitions: opt.ref ? [] : hits,
      abstract, shape, from, note, pdfChecked: pdfOk,
    });
  }
}
// GR10 の一覧で「汎用の箱で描き、GR11 で専用の記号にする」としたものと、「GR11 で描く」とした線が、すべて入っていること
for (const o of genOut) {
  const g10 = o.class === classText10(G10) || (o.class === classText10(N10) && /GR11 で(描く|決める)/.test(o.note));
  if (g10 && !gen12Seen.has(o.name)) gen12Problems.push(`${o.name}: GR10 の一覧の「${o.class}」(${o.note})が GR12 の一覧にない`);
}
// 各節の、definition-node などに足される選択肢と区画の選択肢が、すべて一覧にあること
const GEN12_SETS = ['definition-node', 'usage-node', 'general-relationship', 'compartment', 'interconnection-element', 'action-flow-element', 'subject-actors-stakeholders-node', 'annotation-node', 'usage-edge'];
const gen12Alts = [];
for (const sec of Object.keys(GEN12_SECTIONS)) {
  const [lo, hi] = sectionRange(sec);
  for (let i = lo - 1; i < hi; i++) {
    const m = /^\s*([a-z][a-z-]*)\s*(=\||\|=|= ?\||=)(.*)$/.exec(lines[i]);
    if (!m || !GEN12_SETS.includes(m[1])) continue;
    let text = m[3];
    for (let j = i + 1; j < hi; j++) {
      const t = lines[j];
      if (footer(t)) continue;
      if (t.trim() === '') {
        // ページの足をまたいで '|' の行が続くときは、続きとして読む(8.2.3.26 節の compartment の選択肢)
        let k = j + 1;
        while (k < hi && (lines[k].trim() === '' || footer(lines[k]))) k++;
        if (text.trim() && !/^\s*\|/.test(lines[k] ?? '')) break;
        continue;
      }
      if (/^\s*[a-z][a-z_-]*\s*(=\||\|=|=)/.test(t)) break;
      text += ' ' + t;
    }
    const alternatives = text.split(/[|\s]+/).map((x) => x.trim().replace(/<$/, '')).filter(Boolean);
    gen12Alts.push({ name: m[1], op: m[2].replace(' ', ''), line: i + 1, section: sec, alternatives });
  }
}
const gen12All = new Set([...gen12Seen, ...priorLists12.flatMap(([, l]) => l.map((o) => o.name))]);
const gen12Missing = [...new Set(gen12Alts.flatMap((a) => a.alternatives))].filter((x) => !gen12Seen.has(x) && !(gen12All.has(x) && ['interconnection-element', 'action-flow-element'].some((s) => gen12Alts.some((a) => a.name === s && a.alternatives.includes(x)))));
if (gen12Missing.length) gen12Problems.push(`各節の選択肢で一覧にないもの: ${gen12Missing.join(', ')}`);

const result = {
  _説明: [
    '相互接続ビューの記号の一覧(GR4 指示書 4 章)。node tools/view/symbols.mjs で作った(手で編集しない。中身は道具の SYMBOLS を直す)。',
    '行番号は out/text/sysml20.txt の行。印刷のページは本文のページの足の番号、PDF のページは vendor/release-2026-03/doc/2a-OMG_Systems_Modeling_Language.pdf のページ(印刷のページ + 32)。',
    'definitions は、同じ名前の定義の行のすべて(行頭が「名前 =」の形)。defined が false のものは、本文に定義がなく、line は参照の行。',
  ],
  headings,
  interconnectionElement: icAlts,
  symbols: out,
  problems,
  stateTransition: {
    _説明: [
      '状態遷移ビューの記号の一覧(GR6 指示書 4 章)。中身は道具の STATE_SYMBOLS と STATE_REUSE を直す。',
      'class は「GR6 で描く」か「GR6 では描かない」。gr4 が true のものは GR4 の一覧(symbols)にある記号で、gr4Class は GR4 での区分。',
      'stateTransitionElement・stateTransitionNode は、本文から集めた選択肢。',
    ],
    stateTransitionElement: stElement,
    stateTransitionNode: stNode,
    symbols: stateOut,
    problems: stateProblems,
  },
  actionFlow: {
    _説明: [
      'アクションフロービューの記号の一覧(GR7 指示書 4.2 節)。中身は道具の ACTION_SYMBOLS と ACTION_REUSE を直す。',
      'class は「GR7 で描く」か「GR7 では描かない」。prior は GR4・GR6 の一覧での区分(null は GR7 で新しく入れたもの)。',
      'actionFlowElement・actionFlowNode・actionFlowRelationship は、本文から集めた選択肢。注記の「裁定 Qn」は reports/GR7/P1_symbols_*.md の問に対する P1 の裁定。',
    ],
    actionFlowElement: afElement,
    actionFlowNode: afNode,
    actionFlowRelationship: afRel,
    symbols: actionOut,
    problems: actionProblems,
  },
  sequence: {
    _説明: [
      'シーケンスビューの記号の一覧(GR9 指示書 4.1 節)。中身は道具の SEQ_SYMBOLS と SEQ_REUSE を直す。',
      'class は「GR9 で描く」か「GR9 では描かない」。prior は GR4・GR6・GR7 の一覧での区分(null は GR9 で新しく入れたもの)。',
      'sqGraphicalElement・sqGraphicalNode・sqHeadNode・sqGraphicalRelationship・sqLNode は、本文から集めた選択肢。注記の「問 Qn」は reports/GR9/P1_symbols_*.md の問。',
    ],
    sqGraphicalElement: sqElement,
    sqGraphicalNode: sqNode,
    sqHeadNode: sqHead,
    sqGraphicalRelationship: sqRel,
    sqLNode: sqLNode,
    symbols: seqOut,
    problems: seqProblems,
  },
  general: {
    _説明: [
      '一般ビューの記号の一覧(GR10 指示書 4.1 節)。中身は道具の GEN_SYMBOLS と GEN_REUSE を直す。',
      'class は「GR10 で描く」「GR10 では汎用の箱で描き、GR11 で専用の記号にする」「これまでのビューで描いた記号を使う」「描かない」のどれか。prior は GR4・GR6・GR7・GR9 の一覧での区分(null は GR10 で新しく入れたもの)。',
      'alternatives は、本文の 8.2.3 節の全体から集めた definition-node・usage-node・general-relationship などの定義と追加の行と、その選択肢。注記の「問 Qn」は reports/GR10/P1_symbols_*.md の問。',
    ],
    alternatives: genAlts,
    symbols: genOut,
    problems: genProblems,
  },
  general12: {
    _説明: [
      '一般ビューの分野ごとの専用の記号の一覧(GR12 指示書 4.1 節)。中身は道具の GEN12_SECTIONS を直す。',
      'class は「GR12 で描く」「これまでの記号を使う」「描かない」のどれか。change は GR12 の前の一般ビューの図からの違い(形・線・節点・同じ・空)。prior は GR4・GR6・GR7・GR9・GR10 の一覧での区分(null は GR12 で新しく入れたもの)。',
      'alternatives は、各節の definition-node・usage-node・general-relationship・compartment などに足される選択肢。注記の「問 Qn」は reports/GR12/P1_symbols_*.md の問。',
    ],
    alternatives: gen12Alts,
    symbols: gen12Out,
    problems: gen12Problems,
  },
};
fs.mkdirSync('tools/view', { recursive: true });
fs.writeFileSync('tools/view/symbols.json', JSON.stringify(result, null, 1) + '\n');

// ---- 報告に貼る表
const md = [];
md.push('| # | 生成規則 | 区分 | 種類 | 節 | 行 | 印刷 p. | PDF p. | 抽象構文 | 図形の要点 | 経路 | 注記 |');
md.push('|---|---|---|---|---|---|---|---|---|---|---|---|');
out.forEach((o, k) => {
  const cell = (s) => String(s).replace(/\|/g, '\\|');
  md.push(`| ${k + 1} | \`${o.name}\`${o.defined ? '' : '(定義なし)'} | ${o.class === 'GR4 で描く' ? '描く' : '描かない'} | ${o.kind} | ${o.section} | ${o.line} | ${o.printedPage} | ${o.pdfPage} | ${cell(o.abstract)} | ${cell(o.shape)} | ${cell(o.from)} | ${cell(o.note)} |`);
});
fs.mkdirSync('out/view', { recursive: true });
fs.writeFileSync('out/view/symbols_table.md', md.join('\n') + '\n');

const smd = [];
smd.push('| # | 生成規則 | 区分 | 種類 | 節 | 行 | 印刷 p. | PDF p. | 図 p. | 抽象構文 | 図形の要点 | 経路 | 注記 |');
smd.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|');
stateOut.forEach((o, k) => {
  const cell = (s) => String(s).replace(/\|/g, '\\|');
  smd.push(`| ${k + 1} | \`${o.name}\`${o.defined ? '' : '(定義なし)'} | ${o.class === 'GR6 で描く' ? '描く' : '描かない'} | ${o.kind} | ${o.section} | ${o.line} | ${o.printedPage} | ${o.pdfPage} | ${o.figurePage} | ${cell(o.abstract)} | ${cell(o.shape)} | ${cell(o.from)} | ${cell(o.note)} |`);
});
fs.writeFileSync('out/view/symbols_state_table.md', smd.join('\n') + '\n');

const amd = [];
amd.push('| # | 生成規則 | 区分 | 種類 | 前の一覧 | 節 | 行 | 印刷 p. | PDF p. | 図 p. | 抽象構文 | 図形の要点 | 経路 | 注記 |');
amd.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
actionOut.forEach((o, k) => {
  const cell = (s) => String(s).replace(/\|/g, '\\|');
  amd.push(`| ${k + 1} | \`${o.name}\`${o.defined ? '' : '(定義なし)'} | ${o.class === 'GR7 で描く' ? '描く' : '描かない'} | ${o.kind} | ${o.prior ? cell(o.prior) : '新規'} | ${o.section} | ${o.line} | ${o.printedPage} | ${o.pdfPage} | ${o.figurePage} | ${cell(o.abstract)} | ${cell(o.shape)} | ${cell(o.from)} | ${cell(o.note)} |`);
});
fs.writeFileSync('out/view/symbols_action_table.md', amd.join('\n') + '\n');

const qmd = [];
qmd.push('| # | 生成規則 | 区分 | 種類 | 前の一覧 | 節 | 行 | 印刷 p. | PDF p. | 図 p. | 抽象構文 | 図形の要点 | 経路 | 注記 |');
qmd.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
seqOut.forEach((o, k) => {
  const cell = (s) => String(s).replace(/\|/g, '\\|');
  qmd.push(`| ${k + 1} | \`${o.name}\`${o.defined ? '' : '(定義なし)'} | ${o.class === 'GR9 で描く' ? '描く' : '描かない'} | ${o.kind} | ${o.prior ? cell(o.prior) : '新規'} | ${o.section} | ${o.line} | ${o.printedPage} | ${o.pdfPage} | ${o.figurePage} | ${cell(o.abstract)} | ${cell(o.shape)} | ${cell(o.from)} | ${cell(o.note)} |`);
});
fs.writeFileSync('out/view/symbols_sequence_table.md', qmd.join('\n') + '\n');

const gmd = [];
gmd.push('| # | 生成規則 | 区分 | 種類 | 前の一覧 | 節 | 行 | 印刷 p. | PDF p. | 図 p. | 抽象構文 | 図形の要点 | 経路 | 注記 |');
gmd.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
const gshort = { 'GR10 で描く': '描く', 'GR10 では汎用の箱で描き、GR11 で専用の記号にする': '汎用の箱(GR11)', 'これまでのビューで描いた記号を使う': 'これまでの記号', '描かない': '描かない' };
genOut.forEach((o, k) => {
  const cell = (s) => String(s).replace(/\|/g, '\\|');
  gmd.push(`| ${k + 1} | \`${o.name}\`${o.defined ? '' : '(定義なし)'} | ${gshort[o.class]} | ${o.kind} | ${o.prior ? cell(o.prior) : '新規'} | ${o.section} | ${o.line} | ${o.printedPage} | ${o.pdfPage} | ${o.figurePage} | ${cell(o.abstract)} | ${cell(o.shape)} | ${cell(o.from)} | ${cell(o.note)} |`);
});
fs.writeFileSync('out/view/symbols_general_table.md', gmd.join('\n') + '\n');

const g12md = [];
g12md.push('| # | 生成規則 | 区分 | 変化 | 種類 | 前の一覧 | 節 | 行 | PDF p. | 図 p. | 抽象構文 | 図形の要点 | 経路 | 注記 |');
g12md.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
const g12short = { 'GR12 で描く': '描く', 'これまでの記号を使う': 'これまでの記号', '描かない': '描かない' };
gen12Out.forEach((o, k) => {
  const cell = (s) => String(s).replace(/\|/g, '\\|');
  g12md.push(`| ${k + 1} | \`${o.name}\`${o.defined ? '' : '(定義なし)'} | ${g12short[o.class]} | ${o.change || '—'} | ${o.kind} | ${o.prior ? cell(o.prior.replace(/これまでのビューで描いた記号を使う/g, 'これまでの記号').replace(/GR10 では汎用の箱で描き、GR11 で専用の記号にする/g, '汎用の箱')) : '新規'} | ${o.section} | ${o.line} | ${o.pdfPage} | ${o.figurePage} | ${cell(o.abstract)} | ${cell(o.shape)} | ${cell(o.from)} | ${cell(o.note)} |`);
});
fs.writeFileSync('out/view/symbols_general12_table.md', g12md.join('\n') + '\n');

const count = (c) => out.filter((o) => o.class === c).length;
console.log(`項目 ${out.length} 件(描く ${count('GR4 で描く')}、描かない ${count('GR4 では描かない(ほかのビュー)')})、interconnection-element の箇所 ${icAlts.length}`);
for (const a of icAlts) console.log(`  ${a.section} L${a.line}: ${a.alternatives.join(' | ')}`);
const multi = out.filter((o) => o.definitions.length > 1).map((o) => `${o.name}(${o.definitions.join(',')})`);
console.log(`定義が複数あるもの: ${multi.join(' ') || 'なし'}`);
console.log(problems.length ? `問題 ${problems.length} 件:\n  ${problems.join('\n  ')}` : '問題なし');

const scount = (c, gr4) => stateOut.filter((o) => o.class === c && (gr4 === undefined || o.gr4 === gr4)).length;
console.log(`状態遷移ビュー: 項目 ${stateOut.length} 件(描く ${scount('GR6 で描く')}(うち GR4 の一覧にある ${scount('GR6 で描く', true)})、描かない ${scount('GR6 では描かない')}(うち GR4 の一覧にある ${scount('GR6 では描かない', true)}))`);
console.log(`  state-transition-element L${stElement.line}: ${stElement.alternatives.join(' | ')}`);
console.log(`  state-transition-node L${stNode.line}(${stNode.alternatives.length}): ${stNode.alternatives.join(' | ')}`);
console.log(stateProblems.length ? `問題 ${stateProblems.length} 件:\n  ${stateProblems.join('\n  ')}` : '問題なし');
const acount = (c, prior) => actionOut.filter((o) => o.class === c && (prior === undefined || (o.prior !== null) === prior)).length;
console.log(`アクションフロービュー: 項目 ${actionOut.length} 件(描く ${acount('GR7 で描く')}(うち GR4・GR6 の一覧にある ${acount('GR7 で描く', true)})、描かない ${acount('GR7 では描かない')}(うち GR4・GR6 の一覧にある ${acount('GR7 では描かない', true)}))`);
console.log(`  action-flow-element L${afElement.line}: ${afElement.alternatives.join(' | ')}`);
console.log(`  action-flow-node L${afNode.line}(${afNode.alternatives.length}): ${afNode.alternatives.join(' | ')}`);
console.log(`  action-flow-relationship L${afRel.line}: ${afRel.alternatives.join(' | ')}`);
console.log(actionProblems.length ? `問題 ${actionProblems.length} 件:\n  ${actionProblems.join('\n  ')}` : '問題なし');
const qcount = (c, prior) => seqOut.filter((o) => o.class === c && (prior === undefined || (o.prior !== null) === prior)).length;
console.log(`シーケンスビュー: 項目 ${seqOut.length} 件(描く ${qcount('GR9 で描く')}(うち GR4・GR6・GR7 の一覧にある ${qcount('GR9 で描く', true)})、描かない ${qcount('GR9 では描かない')}(うち GR4・GR6・GR7 の一覧にある ${qcount('GR9 では描かない', true)}))`);
for (const [nm, a] of [['sq-graphical-element', sqElement], ['sq-graphical-node', sqNode], ['sq-head-node', sqHead], ['sq-graphical-relationship', sqRel], ['sq-l-node', sqLNode]]) console.log(`  ${nm} L${a.line}: ${a.alternatives.join(' | ')}`);
const qmulti = seqOut.filter((o) => o.prior === null && o.definitions.length > 1).map((o) => `${o.name}(${o.definitions.join(',')})`);
console.log(`  定義が複数あるもの: ${qmulti.join(' ') || 'なし'}`);
console.log(seqProblems.length ? `問題 ${seqProblems.length} 件:\n  ${seqProblems.join('\n  ')}` : '問題なし');
const gcount = (c, prior) => genOut.filter((o) => o.class === c && (prior === undefined || (o.prior !== null) === prior)).length;
console.log(`一般ビュー: 項目 ${genOut.length} 件(` + Object.values({ D10, G10, R10, N10 }).map((c) => `${classText10(c)} ${gcount(classText10(c))}(うち前の一覧にある ${gcount(classText10(c), true)})`).join('、') + ')');
for (const a of genAlts) console.log(`  ${a.section} L${a.line} ${a.name} ${a.op} ${a.alternatives.join(' | ')}`);
const gmulti = genOut.filter((o) => o.prior === null && o.definitions.length > 1).map((o) => `${o.name}(${o.definitions.join(',')})`);
console.log(`  定義が複数あるもの: ${gmulti.join(' ') || 'なし'}`);
console.log(genProblems.length ? `問題 ${genProblems.length} 件:\n  ${genProblems.join('\n  ')}` : '問題なし');
const g12count = (c, f = () => true) => gen12Out.filter((o) => o.class === c && f(o)).length;
console.log(`一般ビューの分野ごとの記号(GR12): 項目 ${gen12Out.length} 件(` + [D12, R12, N12].map((c) => `${classText12(c)} ${g12count(classText12(c))}`).join('、') + `)。GR12 で描くもののうち 形が変わる ${g12count(classText12(D12), (o) => o.change === '形')}、線 ${g12count(classText12(D12), (o) => o.change === '線')}、今と同じ形 ${g12count(classText12(D12), (o) => o.change === '同じ')}`);
for (const a of gen12Alts) console.log(`  ${a.section} L${a.line} ${a.name} ${a.op} ${a.alternatives.join(' | ')}`);
const g12multi = gen12Out.filter((o) => o.definitions.length > 1).map((o) => `${o.name}(${o.definitions.join(',')})`);
console.log(`  定義が複数あるもの: ${g12multi.join(' ') || 'なし'}`);
console.log(gen12Problems.length ? `問題 ${gen12Problems.length} 件:\n  ${gen12Problems.join('\n  ')}` : '問題なし');
if (problems.length || stateProblems.length || actionProblems.length || seqProblems.length || genProblems.length || gen12Problems.length) process.exitCode = 1;
