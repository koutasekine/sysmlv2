package P {
    port def Q { in item x; }
    part def C {
        port p : ~Q { in item :>> x; }
    }
}
