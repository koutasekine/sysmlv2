package P {
    part def A { in item x; }
    part def B :> A { out item :>> x; }
    part def C :> A { item :>> x; }
}
