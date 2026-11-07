// framed-view: view で描く範囲を決めたときの枠と、描いていないメンバーの省略記号
package P {
    state def S {
        entry; then a;
        state a { state a1; state a2; }
        state b;
    }
    view v : StateTransitionView {
        expose S;
        expose S::a;
        expose S::b;
        filter @SysML::StateUsage;
        /* 状態だけを描く */
    }
}
