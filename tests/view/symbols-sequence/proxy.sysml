// proxy: 入れ子の部品を経る端(sq-proxy と proxy-label)と、同じ生存線に戻るメッセージ
package P {
    occurrence def Inner {
        part driver {
            event occurrence pressed;
        }
        part vehicle {
            part controller {
                event occurrence received;
                then event occurrence commanded;
            }
            part engine {
                event occurrence started;
            }
        }
        message press from driver.pressed to vehicle.controller.received;
        message command from vehicle.controller.commanded to vehicle.engine.started;
    }
}
