// state-ref: 参照の状態の箱(破線)
package P {
    state def S {
        entry; then idle;
        state idle;
        then r;
        ref state r;
    }
}
