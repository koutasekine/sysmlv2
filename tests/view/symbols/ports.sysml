// port-l・port-r・port-t・port-b・port-label・pdh・pdv(in は左、out は右、inout と向きのないものは相手の側、なければ上)
part def P {
    in port i;
    out port o;
    inout port io;
    part a {
        port p;
    }
    part x;
    part b {
        port q;
    }
    connect a.p to b.q;
}
