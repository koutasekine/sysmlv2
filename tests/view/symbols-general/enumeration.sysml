// enumeration: 列挙の定義と使用(GR10 では汎用の箱。列挙の値は enums の区画)
package Colors {
    enum def Color {
        enum red;
        enum green;
    }
    enum signal : Color;
}
