// decide-merge: decision・merge の節点、ガードのある継承、else-branch
package P {
    action def Choose {
        attribute x : Integer;
        first start;
        then decide d;
            if x > 0 then b1;
            else b2;
        action b1;
        action b2;
        first b1 then m;
        first b2 then m;
        merge m;
        then done;
    }
}
