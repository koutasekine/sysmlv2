package P {
    connection def C { end part a; end part b; }
    connection def D :> C { part :>> a; }
}
