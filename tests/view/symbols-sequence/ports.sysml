// ports: 部品の頭の下の辺のポート(sq-port)と、範囲が直接持つポートの頭
package P {
    port def SerialPort;
    occurrence def Wired {
        port gate : SerialPort {
            event occurrence arrived;
        }
        part board {
            port tx : SerialPort {
                event occurrence sent;
            }
            port rx : SerialPort {
                event occurrence got;
            }
        }
        part peer {
            event occurrence received;
            then event occurrence replied;
        }
        message request from board.tx.sent to peer.received;
        message reply from peer.replied to board.rx.got;
        message forward from gate.arrived to peer.received;
    }
}
