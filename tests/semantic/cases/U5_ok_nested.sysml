package P {
    state s parallel {
        state s1 {
            state a;
            state b;
            transition first a then b;
        }
        state s2;
    }
}
