package '見守りシステムの例' {
    doc /* Arduino 2 台で温度を測り、ファンとブザーを動かすシステムの例 */

    attribute def '電圧値';
    attribute def 'スイッチ';
    attribute def 'データ';

    port def 'シリアル' {
        out attribute '送信' : 'データ';
        in attribute '受信' : 'データ';
    }
    port def 'アナログ入力' {
        in attribute '電圧' : '電圧値';
    }
    port def 'デジタル出力' {
        out attribute 'オンオフ' : 'スイッチ';
    }
    interface def 'UART接続' {
        end '送信側' : 'シリアル';
        end '受信側' : ~'シリアル';
    }

    part def 'Arduino Uno' {
        port 'シリアル端子' : 'シリアル';
        in port 'A0' : 'アナログ入力';
        out port 'D8' : 'デジタル出力';
        exhibit state '動作' : '測定ボードの動き';
    }

    part def 'Arduino Nano' {
        port 'シリアル端子' : ~'シリアル';
        out port 'D3' : 'デジタル出力';
    }
    part def '温度センサ' {
        out port '出力' : ~'アナログ入力';
    }
    part def 'ファン' {
        in port '制御' : ~'デジタル出力';
    }
    part def 'ブザー' {
        in port '制御' : ~'デジタル出力';
    }

    part '見守りシステム' {
        part '温度計' : '温度センサ';
        part '測定ボード' : 'Arduino Uno' {
            // 測定ボードが、測定の手順を行う(グリッドビューの機能の割り当て表に出る)
            perform action '温度の測定' : '測定の手順';
        }
        part '警報ブザー' : 'ブザー';
        part '出力ボード' : 'Arduino Nano';
        part '冷却ファン' : 'ファン';

        interface 'ボード間通信' : 'UART接続' connect '測定ボード'.'シリアル端子' to '出力ボード'.'シリアル端子';
        flow of '電圧値' from '温度計'.'出力' to '測定ボード'.'A0';
        connect '出力ボード'.'D3' to '冷却ファン'.'制御';
        connect '測定ボード'.'D8' to '警報ブザー'.'制御';
    }

    view '全体図' {
        expose '見守りシステム';
        expose '見守りシステム'::**;
    }

    // 測定ボードのプログラムの動き(状態遷移ビューで描く)
    item def '測定指示';
    item def '高温通知';
    item def '解除指示';

    state def '測定ボードの動き' {
        entry; then '待機';
        state '待機';
        accept '指示' : '測定指示' then '測定';
        state '測定' {
            do action '温度を読む';
        }
        accept '通知' : '高温通知' then '警報';
        accept '指示' : '測定指示' then '待機';
        state '警報' {
            entry action 'ブザーを鳴らす';
            exit action 'ブザーを止める';
        }
        accept '解除' : '解除指示' then '待機';
    }
    view '動作の図' : StandardViewDefinitions::StateTransitionView {
        expose '測定ボードの動き';
        expose '測定ボードの動き'::**;
    }

    // 測定ボードのプログラムの手順(アクションフロービューで描く)
    attribute def '温度値';
    action def '測定の手順' {
        in attribute 'しきい値' : '温度値';
        first start;
        then action '温度を読む' {
            out attribute '温度' : '温度値';
        }
        action '通知する' {
            in attribute '温度' : '温度値';
        }
        flow '温度を読む'.'温度' to '通知する'.'温度';
        first '温度を読む' then '高温か';
        decide '高温か';
            if '温度を読む'.'温度' > 'しきい値' then '通知する';
            else '待つ';
        action '待つ';
        first '通知する' then done;
        first '待つ' then done;
    }
    view '手順の図' : StandardViewDefinitions::ActionFlowView {
        expose '測定の手順';
        expose '測定の手順'::**;
    }

    // 測定ボードと出力ボードのやりとり(シーケンスビューで描く)
    occurrence def '高温時のやりとり' {
        part '測定' : 'Arduino Uno' {
            event occurrence '高温を検知';
        }
        part '出力' : 'Arduino Nano' {
            event occurrence '通知を受信';
            then event occurrence '鳴動を指示';
        }
        part '警報ブザー' : 'ブザー' {
            event occurrence '鳴動開始';
        }
        message '通知' of '高温通知' from '測定'.'高温を検知' to '出力'.'通知を受信';
        message '鳴動' from '出力'.'鳴動を指示' to '警報ブザー'.'鳴動開始';
    }
    view 'やりとりの図' : StandardViewDefinitions::SequenceView {
        expose '高温時のやりとり';
        expose '高温時のやりとり'::**;
    }

    // 定義と使用の構成(一般ビューで描く)
    view '構成の図' : StandardViewDefinitions::GeneralView {
        expose '見守りシステム';
        expose '見守りシステム'::*;
        expose 'Arduino Uno';
        expose 'Arduino Uno'::*;
        expose 'Arduino Nano';
        expose 'Arduino Nano'::*;
        expose '温度センサ';
        expose '温度センサ'::*;
        expose 'ファン';
        expose 'ファン'::*;
        expose 'ブザー';
        expose 'ブザー'::*;
    }

    // 見守りの要求とユースケース(一般ビューで描く)
    package '要求' {
        requirement def '高温の警報' {
            doc /* 温度が上限を超えたら、ブザーを鳴らす */
            subject '対象';
            attribute '上限' : '温度値';
        }
        requirement '警報の要求' : '高温の警報';
        satisfy '警報の要求' by '見守りシステム';

        part def '利用者';
        use case def '温度を見守る' {
            subject '対象';
            actor '使う人' : '利用者';
        }
        use case '見守り' : '温度を見守る';
    }
    view '要求の図' : StandardViewDefinitions::GeneralView {
        expose '要求'::**;
        expose '見守りシステム';
    }

    // 部品・ポートの接続・要求の表(「表」で見る)
    view '部品と要求の表' : StandardViewDefinitions::GridView {
        expose '見守りシステム'::**;
        expose '要求'::**;
    }
}
