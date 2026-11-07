// occurrence-def: オカレンスの定義の箱、頭(sq-part)、生存線、メッセージ
package P {
    item def Alarm;
    part def Board;
    occurrence def Notify {
        part sensor : Board {
            event occurrence sent;
        }
        part buzzer : Board {
            event occurrence received;
        }
        message alarm of Alarm from sensor.sent to buzzer.received;
    }
}
