// expose で公開する範囲に、import で取り込んだメンバーを含む(KerML 8.3.2.4.5 visibleMemberships。P2 の 2 回目の裁定 1)
package A {
    part x;
}
package B {
    public import A::*;
    part y;
}
view v {
    expose B::*;
}
