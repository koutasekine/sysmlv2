// proxy: 図に描いていない特徴を端にするフロー(箱の辺の黒丸。アクションフロービューの中だけで使う)
package P {
    action def Relay {
        action a1 { out y; }
        action a2;
        flow a1.y to a2.w;
    }
}
