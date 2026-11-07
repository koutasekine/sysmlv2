// state-actions: 状態の箱の entry・do・exit の区画(本体も文字で出す)
package P {
    action def Blink;
    state def Lamp {
        entry; then lit;
        state lit {
            entry action turnOn { first start; then done; }
            do action blink : Blink;
            exit action turnOff;
        }
    }
}
