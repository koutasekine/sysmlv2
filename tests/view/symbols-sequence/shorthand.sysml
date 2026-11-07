// shorthand: 端を書かないメッセージと、頭の中の event m.sourceEvent; の短い書き方
package P {
    item def Ping;
    occurrence def Echo {
        part a {
            event ping.sourceEvent;
            then event pong.targetEvent;
        }
        part b {
            event ping.targetEvent;
            then event pong.sourceEvent;
        }
        message ping of Ping;
        message pong of Ping;
    }
}
