// flow-on-connection(接続が所有するフローは、接続の線の上の印。裁定 Q11)
part p {
    part a { port x; }
    part b { port y; }
    connection c connect a.x to b.y {
        flow of Real from a.x to b.y;
    }
}
