// 文字の区画(裁定 Q13・Q17): attributes・directed-features・allocations・actions・perform-actions・states・exhibit-states・
// successions・calcs・analyses・verifications・use-cases・include-use-cases・occurrences・individuals・timeslices・snapshots・
// assert-constraints・satisfy-requirements・features・variants・el-prefix・usage-cp・compartment-stack
part p {
    attribute a : Real = 1;
    in attribute d : Real;
    allocation al;
    action ac;
    action ac2;
    perform action pa;
    state st;
    exhibit state es;
    succession s first ac then ac2;
    calc cl;
    analysis an;
    verification vf;
    use case uc;
    include use case iu;
    occurrence oc;
    individual occurrence io;
    timeslice ts;
    snapshot sn;
    assert constraint asc;
    satisfy r;
    ref rr;
    variation part vp {
        variant part v1;
    }
    part q;
}
