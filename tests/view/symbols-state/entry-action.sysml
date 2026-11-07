// entry-action・do-action・exit-action: 遷移の端になる entry・do・exit の行動を節点の箱で描く
package P {
    state def S {
        entry action init { first start; then done; }
        then s0;
        state s0 {
            do action work;
            exit action finish;
        }
        state s1;
        transition t1 first s0.work then s1;
        transition t2 first s0.finish then s1;
    }
}
