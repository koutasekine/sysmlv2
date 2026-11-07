// state-params: 状態の中の行動の箱と、その辺の引数(param-l・param-r。GR4 と共通の部品)
package P {
    state def S {
        entry; then idle;
        state idle;
        action convert { in raw : Integer; out value : Real; }
    }
}
