// gr12-calc: 計算の定義と使用(GR12。引数は箱の辺の param-*、戻り値は result の区画。GR12 P1 の裁定 Q3)
package Physics {
    calc def Speed {
        in distance;
        in time;
        out note;
        return speed;
    }
    calc speedCalc : Speed {
        in d;
    }
}
