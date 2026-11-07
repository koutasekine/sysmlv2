// 中に図を持たない箱(item)の中の文字の区画: items・parts・ports・connections・interfaces・flows
part p {
    item i {
        item j;
        part pp;
        port pt;
        connect pp to j;
        interface ii connect pp to j;
        flow of Real from pp to j;
    }
    part q;
}
