// control-nodes: view でアクションの中を公開したときの節点(裁定 Q17)と、else-branch(裁定 Q19)
package P {
    action def A {
        in attribute g : Boolean;
        first start;
        then fork f;
            then a1;
            then a2;
        action a1;
        action a2;
        first a1 then j;
        first a2 then j;
        join j;
        then decide d;
            if g then m;
            else m;
        merge m;
        then action a3;
        then terminate;
    }
    view v : StateTransitionView { expose A::*; }
}
