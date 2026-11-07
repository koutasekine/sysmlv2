// 入門用の例: 電池・スイッチ・ランプを 1 つの輪につないだ回路
package '懐中電灯' {
    port def '端子';

    part def '電池' {
        port '正極' : '端子';
        port '負極' : '端子';
    }
    part def 'スイッチ' {
        port '入口' : '端子';
        port '出口' : '端子';
    }
    part def 'ランプ' {
        port '入口' : '端子';
        port '出口' : '端子';
    }

    part '回路' {
        part '単三電池' : '電池';
        part '押しボタン' : 'スイッチ';
        part '豆電球' : 'ランプ';

        connect '単三電池'.'正極' to '押しボタン'.'入口';
        connect '押しボタン'.'出口' to '豆電球'.'入口';
        connect '豆電球'.'出口' to '単三電池'.'負極';
    }

    view '回路の図' : StandardViewDefinitions::InterconnectionView {
        expose '回路'::**;
        expose '電池';
        expose 'スイッチ';
        expose 'ランプ';
    }
}
