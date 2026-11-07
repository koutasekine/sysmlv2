// connection-graphical・connection-label・rolename・multiplicity・connection-end・connection-relationship
part p {
    part a { port x; }
    part b { port y; }
    connection c : C connect ([1..*] e1 ::> a.x, e2 ::> b.y);
}
