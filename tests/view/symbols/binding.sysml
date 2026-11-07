// binding-connection
part p {
    part a { port x; }
    part b { port y; }
    bind a.x = b.y;
}
