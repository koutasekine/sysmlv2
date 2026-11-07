// n-ary-dependency・n-ary-association-dot・n-ary-dependency-client-link・n-ary-dependency-supplier-link
part p {
    part a;
    part x;
    part b;
    dependency d from a, x to b;
}
