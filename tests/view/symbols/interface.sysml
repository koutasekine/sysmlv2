// interface-connection・interface-label・flow-node・flow-node-r・flow-node-l・sflow-node-r・sflow-node-l・message-node-r・
// message-node-l・port-node
part p {
    part a { port x; }
    part b { port y; }
    interface i : I connect a.x to b.y {
        flow of Real from a.x to b.y;
        flow of Real from b.y to a.x;
        succession flow of Real from a.x to b.y;
        succession flow of Real from b.y to a.x;
        message of M from a.x to b.y;
        message of M from b.y to a.x;
    }
}
