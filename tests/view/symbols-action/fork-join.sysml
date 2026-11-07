// fork-join: fork・join の節点
package P {
    action def Parallel {
        action a1;
        action a2;
        first start then f;
        fork f;
        first f then a1;
        first f then a2;
        join j;
        first a1 then j;
        first a2 then j;
    }
}
