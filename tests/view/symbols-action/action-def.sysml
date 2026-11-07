// action-def: 行動の定義の箱、引数、開始・終了の節点、継承(aflow-succession)、行動の箱
package P {
    action def Measure {
        in threshold : Real;
        out alarm : Boolean;
        first start;
        then action read;
        then action judge;
        then done;
    }
}
