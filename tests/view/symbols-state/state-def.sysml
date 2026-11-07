// state-def: 状態の定義の箱、開始の黒い角の丸い四角(空の entry)、状態、遷移
package P {
    attribute def Sig;
    state def Switch {
        entry; then off;
        state off;
        accept s : Sig then on;
        state on;
        accept s : Sig then off;
    }
}
