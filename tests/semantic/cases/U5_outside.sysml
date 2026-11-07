package P {
    state t {
        state s parallel {
            state s1;
            state s2;
        }
        transition first s.s1 then s.s2;
    }
}
