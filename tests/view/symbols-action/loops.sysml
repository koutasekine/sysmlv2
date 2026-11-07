// loops: while(until あり)と for の箱と、ループの本体
package P {
    action def Repeat {
        attribute x : Integer;
        while x < 10 {
            action step;
        } until x > 20;
        for i in (1, 2) {
            action each;
        }
    }
}
