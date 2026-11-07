// perform-outer: 描く範囲が perform の行動(行動の箱で、名前の区画を «perform action» にする。GR7 P1 の裁定 Q5)
package P {
    action def Base;
    part p {
        perform action job : Base {
            first start;
            then action a;
            then done;
        }
    }
}
