// use-case: ユースケースの定義と使用、include(GR10 では汎用の箱)
package Driving {
    use case def Drive;
    use case drive : Drive;
    include use case park : Drive;
}
