// exhibit-state: exhibit state を描く範囲にしたときの名前の区画(«exhibit-state»)
package P {
    part def Board {
        exhibit state behavior {
            entry; then waiting;
            state waiting;
            state measuring;
        }
    }
}
