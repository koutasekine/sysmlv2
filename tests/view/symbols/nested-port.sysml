// 入れ子のポート(port-l などの 3 つ目の選択肢)と、参照のポート(破線の小さな四角)
part p {
    port n {
        port n1;
        ref port n2;
    }
    part q;
}
