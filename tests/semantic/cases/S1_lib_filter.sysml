package P {
    package Q {
        package R { part def C; }
        public import R::*;
        filter true;
    }
    part x : Q::B;
}
