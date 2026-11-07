// constraint・constraint-name-compartment・param-l・param-r・param-t・param-b・param-label・pdh・pdv・result-compartment
part def P {
    constraint c {
        in x : Real;
        out y : Real;
        inout t : Real;
        inout z : Real;
        x > 0
    }
    part m;
    part w {
        port v;
    }
    bind c.z = w.v;
}
