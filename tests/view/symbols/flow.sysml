// flow・flow-label・flow-end-node
part p {
    part a { out port x; }
    part b { in port y; }
    flow f of Real from a.x to b.y;
}
