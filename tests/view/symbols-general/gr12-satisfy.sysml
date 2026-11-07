// gr12-satisfy: satisfy の線 «satisfy»(by の相手から、by がなければ持ち主から)と、相手が図にない satisfy の箱(GR12 P1 の裁定 Q2 の (d))
package Plant {
    requirement massReq;
    part car;
    satisfy massReq by car;
    part truck {
        satisfy massReq;
    }
    satisfy Rules::speedReq by car;
}
package Rules {
    requirement speedReq;
}
