// annotations: 状態遷移ビューの中の注釈・依存・文字の区画(GR4 と共通の部品)
package P {
    state def S {
        attribute count : Integer;
        entry; then a;
        state a;
        state b;
        transition first a then b;
        comment about a /* 待機の状態 */
        dependency b to a;
    }
}
