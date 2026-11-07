// gr12-enumeration: 列挙の定義と使用(GR12。今と同じ形で、列挙の値は enums の区画。GR12 P1 の裁定 Q7)
package Signals {
    enum def Level {
        enum low;
        enum high;
    }
    enum alarm : Level;
}
