// occurrence: オカレンスの使用の箱
package P {
    occurrence notify {
        part a {
            event occurrence e1;
        }
        part b {
            event occurrence e2;
        }
        message m from a.e1 to b.e2;
    }
}
