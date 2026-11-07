// flows: 引数の間のフロー、継承フロー、結合
package P {
    attribute def Temp;
    action def Pipeline {
        in raw : Temp;
        action sense { in x : Temp; out y : Temp; }
        action smooth { in x : Temp; out y : Temp; }
        action store { in x : Temp; out y : Temp; }
        action show { in v : Temp; }
        bind raw = sense.x;
        flow sense.y to smooth.x;
        succession flow store.y to show.v;
    }
}
