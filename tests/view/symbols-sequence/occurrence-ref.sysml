// occurrence-ref: 参照のオカレンスの使用の箱(破線)
package P {
    occurrence def Ctx {
        ref occurrence notify {
            part a {
                event occurrence e1;
            }
            part b {
                event occurrence e2;
            }
            message m from b.e2 to a.e1;
        }
    }
}
