// transition: 遷移のラベル(引き金・ガード・効果)、自分自身に戻る遷移、終了の節点(done)
package P {
    attribute def Tick;
    action def Count;
    state def Counter {
        in attribute enabled : Boolean;
        entry; then idle;
        state idle;
        accept t : Tick if enabled do action c : Count then idle;
        accept after 5 then busy;
        state busy;
        if enabled then idle;
        transition finish first busy do action stop then done;
    }
}
