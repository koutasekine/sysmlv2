// state-bodies: 状態遷移ビューで、entry・do の本体と if の本体をアクションフローの図にする(設計書 7.4 節。GR7 P1 の裁定 Q9)
package P {
    state def Lamp {
        entry; then on;
        state on {
            entry action init {
                first start;
                then action a;
                then done;
            }
            do action work;
        }
    }
}
