package P {
    port def PD {
        ref part p;
        attribute a;
        in item i;
        port pp;
    }
    part def X {
        port q : PD { ref item z; out item o; }
    }
}
