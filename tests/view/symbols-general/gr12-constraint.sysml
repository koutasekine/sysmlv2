// gr12-constraint: 制約の定義と使用(引数は辺)、宣言する assert の制約(箱)と、参照するだけの assert の線 «assert»(GR12 P1 の裁定 Q2 の (f)・Q3)
package Limits {
    constraint def MassLimit {
        in mass;
        in limit;
    }
    constraint massLimit : MassLimit;
    assert constraint massCheck : MassLimit;
    part car {
        assert massLimit;
    }
}
