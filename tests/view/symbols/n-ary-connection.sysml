// n-ary-connection・n-ary-connection-dot・n-ary-segment・cdot-label
part p {
    part a { port x; }
    part b { port y; }
    part d { port z; }
    connection nc connect (a.x, b.y, d.z);
}
