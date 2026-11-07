package P {
    part def A { in item x; }
    part def B :> Lib::X, A { out item :>> x; }
}
