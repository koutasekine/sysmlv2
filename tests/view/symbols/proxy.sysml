// proxy-v・proxy-h・proxy-label(解決できない端。裁定 Q7)
part def A;
part p {
    part a : A;
    part x : A;
    part b : A;
    connect a.zz to b.yy;
    connect a.ww to x.vv;
}
