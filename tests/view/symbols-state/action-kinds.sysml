// action-kinds: 行動の箱と、行動の種類ごとの名前の区画(裁定 Q13)、引数、参照の行動
package P {
    attribute def Sig;
    port def P1;
    action def A {
        in attribute x : Integer;
        port p : P1;
        action a0 { in v : Integer; out w : Integer; }
        accept s : Sig;
        send new Sig() to p;
        assign x := 1;
        if x > 0 { action t1; }
        while x > 0 { action t2; } until x < 0;
        for i in (1, 2) { action t3; }
        ref action r;
        perform a0;
    }
    view v : StateTransitionView { expose A::*; }
}
