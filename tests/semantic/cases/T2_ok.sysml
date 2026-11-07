package P {
    part def A { in item x; inout item z; }
    part def B :> A { in item :>> x; inout item :>> z; }
}
