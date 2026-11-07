package U5i {
    attribute def T;
    state def S {
        state s parallel {
            state s1;
            accept T then t;
        }
        state t;
    }
}
