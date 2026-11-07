// constraint: 制約の定義と使用、assert の制約(GR10 では汎用の箱)
package Limits {
    constraint def MassLimit;
    constraint massLimit : MassLimit;
    assert constraint massCheck : MassLimit;
}
