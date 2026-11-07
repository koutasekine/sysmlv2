// gr12-assume: 宣言する assume の制約(箱)と、参照するだけの assume の線 «assume»(GR12 P1 の裁定 Q2 の (c))
package Roads {
    constraint dryRoad;
    requirement def BrakeReq {
        assume constraint lightLoad;
        assume dryRoad;
    }
}
