// succession: 頭を経る事象の間の継承(sq-succession)と、その端の sq-proxy
package P {
    occurrence def Start {
        part door {
            event occurrence closed;
        }
        part driver {
            event occurrence ready;
        }
        succession doorFirst first door.closed then driver.ready;
    }
}
