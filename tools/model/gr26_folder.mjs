// GR26 の試しのフォルダ「懐中電灯_モデル」(GR26 指示書 5 章)。懐中電灯の例を、3 つ以上のファイルと下のフォルダに分けたもの。
// 部品の定義と使用(Battery・Lamp・Switch・Flashlight)、ポートの定義と使用、属性、状態と遷移、行動と継承、接続・流れ、特殊化・再定義・別名、
// 同じ名前の別の要素(2 つのパッケージの Lamp)、型を 2 つ持つ使用、試すために置いた未検査の参照(システム.sysml の「時間の単位」)と
// 曖昧の参照(2 つのファイルの根の名前空間の「予備のねじ」)を含む。意味エラー・警告は 0 件。
// 画面の検査(tests/view/app_main.mjs の --gr26 系)が読み込み、道具として動かすと out/GR26/folders/懐中電灯_モデル/ に書き出す:
//   node tools/model/gr26_folder.mjs [書き出す先のフォルダ]

import fs from 'node:fs';
import path from 'node:path';

export const NAME = '懐中電灯_モデル';
export const FILES = {
  "システム.sysml": "// 全体: 懐中電灯の使用と、試すために置いた未検査・曖昧の参照\npackage '懐中電灯のシステム' {\n    private import '懐中電灯の部品'::*;\n\n    part '懐中電灯' : Flashlight {\n        attribute '使用時間' : '時間の単位'::'時';\n    }\n    part '手元の部品' : '予備のねじ';\n    view '構成の図' : StandardViewDefinitions::GeneralView {\n        expose '懐中電灯'::**;\n    }\n    view '部品の図' : StandardViewDefinitions::GeneralView {\n        expose '懐中電灯の部品'::**;\n    }\n}\n",
  "メモ.txt": "このフォルダは GR26 の試し(モデルツリーと参照箇所)のためのもの\n",
  "予備のねじ_1.sysml": "// 曖昧になる参照を試すため: 根の名前空間に同じ名前の部品の定義を、2 つのファイルに置く(その 1)\npart def '予備のねじ';\n",
  "予備のねじ_2.sysml": "// 曖昧になる参照を試すため: 根の名前空間に同じ名前の部品の定義を、2 つのファイルに置く(その 2)\npart def '予備のねじ';\n",
  "定義の共通.sysml": "// 懐中電灯の例を分けたもの: 属性とポートの定義(ほかのファイルから import で使う)\npackage '共通の定義' {\n    attribute def '電圧値';\n    attribute def '明るさ';\n    port def '端子' {\n        attribute '電圧' : '電圧値';\n    }\n    item def 'ボタン操作';\n}\n",
  "振る舞い/状態と手順.sysml": "// 振る舞い: 状態と遷移、行動と継起\npackage '振る舞い' {\n    private import '共通の定義'::*;\n\n    state def '懐中電灯の状態' {\n        entry; then 'オフ';\n        state 'オフ';\n        state 'オン';\n        transition 'つける' first 'オフ' accept '押す' : 'ボタン操作' then 'オン';\n        transition '消す' first 'オン' accept '押す' : 'ボタン操作' then 'オフ';\n    }\n    action def '点灯の手順' {\n        action '電池を入れる';\n        action 'スイッチを押す';\n        action '光を確かめる';\n        first '電池を入れる' then 'スイッチを押す';\n        first 'スイッチを押す' then '光を確かめる';\n    }\n}\n",
  "部品/予備の部品.sysml": "// 同じ名前の別の要素(別のパッケージの Lamp)と、型を 2 つ持つ使用\npackage '予備の部品' {\n    private import '共通の定義'::*;\n\n    part def Lamp {\n        doc /* 懐中電灯の部品の Lamp とは別の、予備のランプ */\n        port '入口' : '端子';\n    }\n    part def '充電池';\n    part '予備の電池' : '懐中電灯の部品'::Battery, '充電池';\n    part '予備のランプ' : Lamp;\n}\n",
  "部品/部品の定義.sysml": "// 部品の定義: Battery・Lamp・Switch・Flashlight\npackage '懐中電灯の部品' {\n    private import '共通の定義'::*;\n\n    part def Battery {\n        attribute '定格電圧' : '電圧値';\n        port '正極' : '端子';\n        port '負極' : '端子';\n    }\n    part def Lamp {\n        attribute '光量' : '明るさ';\n        port '入口' : '端子';\n        port '出口' : '端子';\n    }\n    part def Switch {\n        port '入口' : '端子';\n        port '出口' : ~'端子';\n    }\n    // 特殊化と別名(別名で書いた参照は、名前の変更では書き換えない)\n    part def '強力なランプ' :> Lamp {\n        attribute :>> '光量';\n    }\n    alias Light for Lamp;\n\n    part def Flashlight {\n        part '電池' : Battery [2];\n        part 'ランプ' : Lamp;\n        part 'スイッチ' : Switch;\n        part '補助灯' : Light;\n        connect '電池'.'正極' to 'スイッチ'.'入口';\n        connect 'スイッチ'.'出口' to 'ランプ'.'入口';\n        connect 'ランプ'.'出口' to '電池'.'負極';\n        flow of '電圧値' from '電池'.'正極' to 'ランプ'.'入口';\n        exhibit state '動き' : '振る舞い'::'懐中電灯の状態';\n        perform action '点け方' : '振る舞い'::'点灯の手順';\n    }\n}\n",
};

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const dir = process.argv[2] ?? path.join(ROOT, 'out/GR26/folders', NAME);
  for (const [p, text] of Object.entries(FILES)) { const f = path.join(dir, p); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); }
  console.log(`${dir} に ${Object.keys(FILES).length} ファイルを書いた`);
}
