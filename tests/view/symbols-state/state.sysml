// state: 状態の使用の箱と、並行状態(«parallel»)
package P {
    state machine parallel {
        state a {
            entry; then a1;
            state a1;
        }
        state b {
            entry; then b1;
            state b1;
        }
    }
}
