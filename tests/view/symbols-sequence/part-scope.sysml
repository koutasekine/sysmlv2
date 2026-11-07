// part-scope: 部品の定義を描く範囲にしたときの sequence-compartment(区画の見出し sequence)
package P {
    part def Station {
        attribute id : Integer;
        part sensor {
            event occurrence sent;
        }
        part logger {
            event occurrence stored;
        }
        message record from sensor.sent to logger.stored;
    }
}
