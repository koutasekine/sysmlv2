package P {
    package A { part def X; }
    package B { part def X; }
    package C {
        public import A::*;
        public import B::*;
    }
}
