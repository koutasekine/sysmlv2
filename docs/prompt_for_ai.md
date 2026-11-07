# 生成 AI 向けプロンプト

この文書の囲みの中の指示文を生成 AI に最初に渡し、最後の「システム:」の後ろに、作りたいシステムの説明を書き足してください。返ってきたテキストを SysML v2 のアプリ(https://sysmlv2.sapp.jp)の左のテキスト欄に貼ると、図になります。

```text
あなたは SysML v2 のテキスト表記(SysML 2.0 正式版)でモデルを書きます。次の決まりを守り、最後の「システム:」に書くシステムのモデルを、1 つのパッケージ(package)に入れた 1 つのテキストとして書いてください。説明の文は付けず、テキストだけを出してください。

書き方の決まり:
- 日本語の名前は単一引用符で囲んでください(例: 'Arduino Uno'、'温度センサ')。
- 部品の使用の名前は、型(部品の定義)の名前と別にしてください(例: part '測定ボード' : 'Arduino Uno';)。
- ポートの使用の名前も、ポートの定義(型)の名前と別にしてください(例: port 'シリアル端子' : 'シリアル';)。
- import には private を付けてください(例: private import ScalarValues::*;)。可視性のない import は構文エラーになります。
- 標準ライブラリの型と単位は使ってかまいません。数の属性の型には ScalarValues の型(Real・Integer・Boolean・String)を、量の属性の型には ISQ の量の型(例: ElectricPotentialValue、ThermodynamicTemperatureValue、DurationValue)を、値の単位には SI の単位(例: 5 [V])を使い、パッケージの中に private import ScalarValues::*; private import ISQ::*; private import SI::*; を書いてください(例: attribute '供給電圧' : ElectricPotentialValue = 5 [V];)。
- 使用の型には、その種類に合う定義を使ってください(部品には部品の定義か項目の定義、ポートにはポートの定義、行動には行動の定義など)。型の種類が合わないものと、型に書いた名前が使用の名前と同じものは、このアプリが「警告」として示します(書き間違いのおそれがあり、意図を確かめる箇所)。
- SysML v1 の書き方や、独自の記法は使わないでください。

書くもの:
- 部品の定義(part def)と使用(part)、ポート(port。向きは in・out)、ポートの定義(port def)、接続(connect … to …)、インターフェース(interface)、フロー(flow of … from … to …)を使ってください。
- ボード(マイコン)のプログラムの動きを状態の定義(state def)で書き、最初の状態を entry; then …; で、遷移を状態の直後の accept … then …; で書き、そのボードの部品の定義から exhibit state で示してください。
- ボードのプログラムの手順を行動の定義(action def)で書き、first start; から then で行動をつなぎ、分岐は decide と if … then …; else …; で書いてください。
- 手順を行う部品は、部品の使用の中に perform action 名前 : 行動の定義; で書いてください。
- 要求は requirement def と requirement で書き、本文を doc /* … */ に書いてください。要求を満たす部品は satisfy 要求 by 部品; で書いてください。
- ボードの間のやりとりをオカレンスの定義(occurrence def)で書き、中の部品ごとに event occurrence で事象を書き(順は then でつなぐ)、message 名前 of 型 from 部品.事象 to 部品.事象; でメッセージを書いてください。
- 最後に view を 1 つ書き、expose でシステム全体を公開してください(expose X; と expose X::**;)。

システム:
```
