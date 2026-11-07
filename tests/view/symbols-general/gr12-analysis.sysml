// gr12-analysis: 解析の定義と使用(引数は辺、subject は節点、戻り値は result の区画。GR12 P1 の裁定 Q1・Q3)
package Studies {
    analysis def FuelStudy {
        subject vehicle;
        in speed;
        return economy;
    }
    analysis fuelStudy : FuelStudy;
}
