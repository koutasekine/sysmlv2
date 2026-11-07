// gr12-use-case: ユースケースの定義と使用(角の丸い・尖った四角)、subject と actor(棒人間)の節点、include の線 «include» と、宣言する include の箱(GR12 P1 の裁定 Q1・Q2 の (h))
package Driving {
    part def Person;
    use case def Drive {
        subject car;
        actor driver : Person;
        include park;
    }
    use case park;
    use case drive : Drive;
    include use case refuel;
}
