// succession-flow・succession-flow-label
part p {
    part a { out port x; }
    part b { in port y; }
    succession flow sf of Real from a.x to b.y;
}
